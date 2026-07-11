import { initAdmin } from '../_firebaseAdmin.js';
import {
    assertMethod,
    handleCors,
    readBody,
    requireSession,
    requireRole,
    requireManagePermission,
    sendJson,
    safeError
} from '../_lib/request.js';
import { normalizeRole } from '../_lib/roles.js';
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
        const { adminAuth, adminDb } = initAdmin();
        requireRole(session, 'moderator');

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

        sendJson(res, 200, { ok: true });
    } catch (error) {
        safeError(res, error);
    }
}
