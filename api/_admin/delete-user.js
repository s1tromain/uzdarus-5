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
        requireCapability(session, CAPABILITIES.USERS_DELETE);

        const body = await readBody(req);
        const userId = String(body.userId || '').trim();

        if (!userId) {
            throw Object.assign(new Error('userId is required'), { statusCode: 400 });
        }

        if (userId === session.uid) {
            throw Object.assign(new Error('You cannot delete your own account'), { statusCode: 400 });
        }

        const targetRef = adminDb.collection('users').doc(userId);
        const targetSnap = await targetRef.get();

        if (!targetSnap.exists) {
            throw Object.assign(new Error('Target user not found'), { statusCode: 404 });
        }

        const targetData = targetSnap.data() || {};
        const targetRole = normalizeRole(targetData.role);

        requireManagePermission(session, targetRole);

        // Log before deletion so the target identity is still available.
        await writeAuditLog({
            action: 'delete-user',
            actorUid: session.uid,
            actorRole: session.role,
            targetUid: userId,
            targetUsername: targetData.username || null,
            details: { deletedRole: targetRole }
        });

        await adminDb.recursiveDelete(targetRef);
        await adminAuth.deleteUser(userId);

        /* recursiveDelete only removes the user document tree. The realtime
           projection lives in its own top-level collection, so without this it
           would survive as a ghost row in every open admin panel. */
        await syncPulse({ adminDb, FieldValue }, userId, { deleted: true });

        sendJson(res, 200, { ok: true });
    } catch (error) {
        safeError(res, error);
    }
}
