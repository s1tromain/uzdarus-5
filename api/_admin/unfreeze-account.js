import { initAdmin } from '../_firebaseAdmin.js';
import {
    assertMethod,
    handleCors,
    readBody,
    requireSession,
    requireCapability,
    requireManagePermission,
    sendJson,
    safeError
} from '../_lib/request.js';
import { normalizeRole, CAPABILITIES } from '../_lib/roles.js';
import { writeAuditLog } from '../_lib/audit.js';
import { syncPulse } from '../_lib/analytics-store.js';
import { buildUnfreeze, FREEZE_FIELD } from '../../account-freeze.js';

/**
 * POST /api/admin?action=unfreeze-account   { userId }
 *
 * Lifts a freeze and gives back exactly the time it consumed: the subscription
 * end date moves forward by the length of the freeze, so the learner resumes
 * with the same number of paid days they had when it started.
 *
 * DOUBLE-UNFREEZE SAFETY
 * ----------------------
 * The read and the write happen in ONE Firestore transaction, and the shift is
 * computed from the document that transaction read. buildUnfreeze() returns a
 * no-op patch for an account that is not frozen, so:
 *   - a second click finds `frozen: false` and shifts nothing;
 *   - two admins unfreezing simultaneously serialize, and the second one's
 *     transaction re-reads a thawed document and shifts nothing.
 * Neither path can extend a subscription twice.
 *
 * Nothing is restored from a snapshot. Whatever the subscription looks like at
 * this moment — a new tariff, extra days added mid-freeze — is what gets
 * shifted, so admin work done during the freeze survives it.
 */
export default async function handler(req, res) {
    if (handleCors(req, res, ['POST'])) {
        return;
    }

    if (!assertMethod(req, res, 'POST')) {
        return;
    }

    try {
        const session = await requireSession(req);
        requireCapability(session, CAPABILITIES.SUBSCRIPTION_WRITE);

        const { adminDb, FieldValue, Timestamp } = initAdmin();
        const body = await readBody(req);
        const userId = String(body.userId || '').trim();

        if (!userId) {
            throw Object.assign(new Error('userId talab qilinadi'), { statusCode: 400 });
        }

        const targetRef = adminDb.collection('users').doc(userId);

        const outcome = await adminDb.runTransaction(async (transaction) => {
            const snap = await transaction.get(targetRef);
            if (!snap.exists) {
                throw Object.assign(new Error('Foydalanuvchi topilmadi'), { statusCode: 404 });
            }

            const target = snap.data() || {};
            const targetRole = normalizeRole(target.role);
            requireManagePermission(session, targetRole);

            if (targetRole !== 'customer') {
                throw Object.assign(
                    new Error('Akkauntni muzlatishdan chiqarish faqat customer uchun mumkin'),
                    { statusCode: 400 }
                );
            }

            const result = buildUnfreeze(target, { now: new Date(), actorUid: session.uid });

            if (!result.applied) {
                return { applied: false, username: target.username || null };
            }

            const freeze = result.freeze;
            const update = {
                [FREEZE_FIELD]: {
                    frozen: false,
                    frozenAt: null,
                    frozenBy: null,
                    reason: null,
                    freezeCount: freeze.freezeCount,
                    totalFrozenMs: freeze.totalFrozenMs,
                    lastUnfrozenAt: Timestamp.fromDate(freeze.lastUnfrozenAt),
                    lastUnfrozenBy: freeze.lastUnfrozenBy,
                    lastFrozenAt: freeze.lastFrozenAt ? Timestamp.fromDate(freeze.lastFrozenAt) : null,
                    lastFrozenBy: freeze.lastFrozenBy,
                    lastReason: freeze.lastReason
                },
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: session.uid
            };

            /* `result.subscription` is null for a subscription with no end date.
               Such an account is left exactly as it is — no date is invented for
               it, so a perpetual plan stays perpetual. */
            if (result.subscription) {
                update.subscription = {
                    ...(target.subscription || {}),
                    active: result.subscription.active,
                    endAt: Timestamp.fromDate(result.subscription.endAt),
                    updatedAt: FieldValue.serverTimestamp()
                };
            }

            transaction.update(targetRef, update);

            return {
                applied: true,
                username: target.username || null,
                frozenMs: result.frozenMs,
                previousEndAt: result.previousEndAt,
                newEndAt: result.subscription ? result.subscription.endAt : null,
                active: result.subscription ? result.subscription.active : null
            };
        });

        if (outcome.applied) {
            await writeAuditLog({
                action: 'ACCOUNT_UNFROZEN',
                actorUid: session.uid,
                actorRole: session.role,
                targetUid: userId,
                targetUsername: outcome.username,
                details: {
                    frozenMs: outcome.frozenMs,
                    frozenDays: Math.round((outcome.frozenMs / 86400000) * 100) / 100,
                    previousEndAt: outcome.previousEndAt ? outcome.previousEndAt.toISOString() : null,
                    newEndAt: outcome.newEndAt ? outcome.newEndAt.toISOString() : null,
                    subscriptionShifted: Boolean(outcome.newEndAt)
                }
            });

            await syncPulse({ adminDb, FieldValue }, userId);
        }

        sendJson(res, 200, {
            ok: true,
            frozen: false,
            applied: outcome.applied,
            frozenMs: outcome.applied ? outcome.frozenMs : 0,
            newEndAt: outcome.applied && outcome.newEndAt ? outcome.newEndAt.toISOString() : null
        });
    } catch (error) {
        safeError(res, error);
    }
}
