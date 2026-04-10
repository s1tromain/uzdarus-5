import { initAdmin } from '../_firebaseAdmin.js';
import {
    assertMethod,
    handleCors,
    readBody,
    requireSession,
    sendJson,
    safeError
} from '../_lib/request.js';
import { normalizeRole } from '../_lib/roles.js';
import { normalizeUserDocument, toDate } from '../_lib/user-helpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDaysDelta(rawValue) {
    const value = Number(rawValue);

    if (!Number.isInteger(value) || value === 0) {
        throw Object.assign(new Error('daysDelta butun son bo‘lishi kerak va 0 bo‘lmasligi kerak'), { statusCode: 400 });
    }

    if (Math.abs(value) > 3650) {
        throw Object.assign(new Error('daysDelta juda katta'), { statusCode: 400 });
    }

    return value;
}

function requireSubscriptionEditor(session) {
    const claimRole = session.claimsRole ? normalizeRole(session.claimsRole) : null;

    if (claimRole !== 'developer' && claimRole !== 'admin') {
        throw Object.assign(new Error('Faqat developer yoki admin obunani o‘zgartira oladi'), { statusCode: 403 });
    }

    return claimRole;
}

export default async function handler(req, res) {
    if (handleCors(req, res, ['POST'])) {
        return;
    }

    if (!assertMethod(req, res, 'POST')) {
        return;
    }

    try {
        const session = await requireSession(req);
        const actorRole = requireSubscriptionEditor(session);
        const { adminDb, FieldValue, Timestamp } = initAdmin();
        const body = await readBody(req);

        const userId = String(body.userId || '').trim();
        const daysDelta = parseDaysDelta(body.daysDelta);

        if (!userId) {
            throw Object.assign(new Error('userId talab qilinadi'), { statusCode: 400 });
        }

        const targetRef = adminDb.collection('users').doc(userId);

        const result = await adminDb.runTransaction(async (transaction) => {
            const targetSnap = await transaction.get(targetRef);

            if (!targetSnap.exists) {
                throw Object.assign(new Error('Foydalanuvchi topilmadi'), { statusCode: 404 });
            }

            const target = normalizeUserDocument(userId, targetSnap.data());
            if (!target) {
                throw Object.assign(new Error('Foydalanuvchi ma’lumoti noto‘g‘ri'), { statusCode: 400 });
            }

            if (normalizeRole(target.role) !== 'customer') {
                throw Object.assign(new Error('Obuna faqat customer uchun o‘zgartiriladi'), { statusCode: 400 });
            }

            const now = new Date();
            const previousEndDate = toDate(target.subscription?.endAt);
            const baseDate = previousEndDate || now;
            const nextEndDate = new Date(baseDate.getTime() + daysDelta * DAY_MS);
            const active = nextEndDate.getTime() > now.getTime();
            const nextEndAt = Timestamp.fromDate(nextEndDate);

            const nextSubscription = {
                ...(target.subscription || {}),
                active,
                tariff: target.subscription?.tariff || 'START',
                endAt: nextEndAt,
                updatedAt: FieldValue.serverTimestamp()
            };

            if (!target.subscription?.startAt) {
                nextSubscription.startAt = FieldValue.serverTimestamp();
            }

            transaction.update(targetRef, {
                subscription: nextSubscription,
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: session.uid
            });

            const auditRef = adminDb.collection('adminAuditLogs').doc();
            transaction.set(auditRef, {
                action: 'adjust-subscription-days',
                actorUid: session.uid,
                actorRole,
                targetUid: userId,
                targetUsername: target.username,
                daysDelta,
                previousEndAt: previousEndDate ? Timestamp.fromDate(previousEndDate) : null,
                newEndAt: nextEndAt,
                active,
                createdAt: FieldValue.serverTimestamp()
            });

            return {
                userId,
                daysDelta,
                active,
                newEndAt: nextEndDate.toISOString().slice(0, 10)
            };
        });

        sendJson(res, 200, { ok: true, result });
    } catch (error) {
        safeError(res, error);
    }
}
