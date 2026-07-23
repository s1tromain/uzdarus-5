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
import { buildSubscription } from '../_lib/user-helpers.js';
import { writeAuditLog } from '../_lib/audit.js';

export default async function handler(req, res) {
    if (handleCors(req, res, ['POST'])) {
        return;
    }

    if (!assertMethod(req, res, 'POST')) {
        return;
    }

    try {
        const session = await requireSession(req);
        const { adminAuth, adminDb, FieldValue } = initAdmin();
        requireCapability(session, CAPABILITIES.ROLE_WRITE);

        const body = await readBody(req);
        const userId = String(body.userId || '').trim();
        const newRole = normalizeRole(body.role);

        if (!userId) {
            throw Object.assign(new Error('userId is required'), { statusCode: 400 });
        }

        if (userId === session.uid) {
            throw Object.assign(new Error('You cannot change your own role'), { statusCode: 400 });
        }

        const targetRef = adminDb.collection('users').doc(userId);
        const targetSnap = await targetRef.get();

        if (!targetSnap.exists) {
            throw Object.assign(new Error('Target user not found'), { statusCode: 404 });
        }

        const targetData = targetSnap.data() || {};
        const targetRole = normalizeRole(targetData.role);

        requireManagePermission(session, targetRole);
        requireManagePermission(session, newRole);

        const updateData = {
            role: newRole,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: session.uid
        };

        if (newRole !== 'customer') {
            updateData.accessPacks = [];
            updateData.subscription = buildSubscription({ active: false, tariff: null });
        }

        await adminAuth.setCustomUserClaims(userId, { role: newRole });
        await targetRef.update(updateData);

        /* ------------------------------------------------------------------ *
         * DEFENCE IN DEPTH AGAINST STALE PRIVILEGE.
         * ------------------------------------------------------------------
         * setCustomUserClaims only affects tokens minted from now on, so the
         * target still holds an ID token carrying their OLD role for up to an
         * hour. requireSession() now resolves the role from the Firestore
         * profile (which we just updated), so the downgrade is already
         * effective — this revocation is the second, independent barrier:
         * requireSession() verifies with checkRevoked=true, so every existing
         * token for this user is rejected outright and they must
         * re-authenticate with a token carrying the correct claim.
         *
         * Failure to revoke must NOT fail the role change — the profile write
         * above has already removed the privilege — so it is logged and
         * reported instead of thrown.
         * ------------------------------------------------------------------ */
        let sessionsRevoked = true;
        try {
            await adminAuth.revokeRefreshTokens(userId);
        } catch (revokeError) {
            sessionsRevoked = false;
            console.error('[set-role] token revocation failed', revokeError?.message || revokeError);
        }

        await writeAuditLog({
            action: 'set-role',
            actorUid: session.uid,
            actorRole: session.role,
            targetUid: userId,
            targetUsername: targetData.username || null,
            details: { previousRole: targetRole, newRole, sessionsRevoked }
        });

        sendJson(res, 200, { ok: true, role: newRole, sessionsRevoked });
    } catch (error) {
        safeError(res, error);
    }
}
