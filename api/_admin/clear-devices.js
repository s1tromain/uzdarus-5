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
        const { adminDb, FieldValue } = initAdmin();
        requireRole(session, 'moderator');

        const body = await readBody(req);
        const userId = String(body.userId || '').trim();

        if (!userId) {
            throw Object.assign(new Error('userId is required'), { statusCode: 400 });
        }

        const targetRef = adminDb.collection('users').doc(userId);
        const targetSnap = await targetRef.get();

        if (!targetSnap.exists) {
            throw Object.assign(new Error('Target user not found'), { statusCode: 404 });
        }

        const targetData = targetSnap.data() || {};
        requireManagePermission(session, normalizeRole(targetData.role));

        const previousDeviceCount = Array.isArray(targetData.deviceHashes)
            ? targetData.deviceHashes.length
            : 0;

        await targetRef.update({
            deviceHashes: [],
            blocked: false,
            blockedReason: null,
            blockedAt: null,
            devicesClearedAt: FieldValue.serverTimestamp(),
            devicesClearedBy: session.uid,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: session.uid
        });

        await writeAuditLog({
            action: 'clear-devices',
            actorUid: session.uid,
            actorRole: session.role,
            targetUid: userId,
            targetUsername: targetData.username || null,
            details: { clearedDeviceCount: previousDeviceCount }
        });

        sendJson(res, 200, { ok: true });
    } catch (error) {
        safeError(res, error);
    }
}
