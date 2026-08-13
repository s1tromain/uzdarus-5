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
import { buildFreeze, FREEZE_FIELD, normalizeFreezeReason } from '../../account-freeze.js';

/**
 * POST /api/admin?action=freeze-account   { userId, reason? }
 *
 * Pauses an account: access is withdrawn and the paid period stops being
 * consumed. The subscription is NOT touched here — see account-freeze.js for
 * why the elapsed time is measured at unfreeze instead of the remaining time
 * being snapshotted now.
 *
 * AUTHORIZATION
 * -------------
 * Gated by SUBSCRIPTION_WRITE, not USERS_BLOCK. Freezing is an operation on the
 * paid period — unfreezing moves the subscription end date — so it belongs with
 * the capability that already governs "may change how long this subscription
 * lasts" (admin, developer). Reusing USERS_BLOCK would hand moderators the
 * ability to shift subscription dates, which is a policy change this feature
 * has no business making.
 *
 * Like every other subscription mutation, it applies to customers only and is
 * subject to the management hierarchy, so a privileged account cannot be
 * frozen out of the platform by a peer.
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
        const reason = normalizeFreezeReason(body.reason);

        if (!userId) {
            throw Object.assign(new Error('userId talab qilinadi'), { statusCode: 400 });
        }

        const targetRef = adminDb.collection('users').doc(userId);

        /* The read and the write are one transaction so that two admins
           pressing Freeze at the same moment cannot both write a `frozenAt`.
           The loser re-reads an already-frozen document and applies nothing. */
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
                    new Error('Akkauntni muzlatish faqat customer uchun mumkin'),
                    { statusCode: 400 }
                );
            }

            const result = buildFreeze(target, {
                now: new Date(),
                actorUid: session.uid,
                reason
            });

            if (!result.applied) {
                return { applied: false, username: target.username || null, frozenAt: null };
            }

            const freeze = result.freeze;
            transaction.update(targetRef, {
                [FREEZE_FIELD]: {
                    frozen: true,
                    frozenAt: Timestamp.fromDate(freeze.frozenAt),
                    frozenBy: freeze.frozenBy,
                    reason: freeze.reason,
                    freezeCount: freeze.freezeCount,
                    totalFrozenMs: freeze.totalFrozenMs,
                    lastUnfrozenAt: freeze.lastUnfrozenAt ? Timestamp.fromDate(freeze.lastUnfrozenAt) : null,
                    lastUnfrozenBy: freeze.lastUnfrozenBy
                },
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: session.uid
            });

            return {
                applied: true,
                username: target.username || null,
                frozenAt: freeze.frozenAt,
                reason: freeze.reason,
                freezeCount: freeze.freezeCount
            };
        });

        if (outcome.applied) {
            await writeAuditLog({
                action: 'ACCOUNT_FROZEN',
                actorUid: session.uid,
                actorRole: session.role,
                targetUid: userId,
                targetUsername: outcome.username,
                details: {
                    reason: outcome.reason || null,
                    frozenAt: outcome.frozenAt ? outcome.frozenAt.toISOString() : null,
                    freezeCount: outcome.freezeCount
                }
            });

            await syncPulse({ adminDb, FieldValue }, userId);
        }

        sendJson(res, 200, {
            ok: true,
            frozen: true,
            /* false when the account was ALREADY frozen — the caller can say
               "no change" instead of claiming a second freeze happened. */
            applied: outcome.applied,
            frozenAt: outcome.frozenAt ? outcome.frozenAt.toISOString() : null
        });
    } catch (error) {
        safeError(res, error);
    }
}
