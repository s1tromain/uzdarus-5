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
        requireCapability(session, CAPABILITIES.USERS_BLOCK);

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

        const previousReason = targetData.blockedReason || null;
        const previousDeviceCount = Array.isArray(targetData.deviceHashes)
            ? targetData.deviceHashes.length
            : 0;

        // Clearing `blocked` alone is NOT enough: when the block reason is a
        // device-limit violation the device hashes are still full, so the very
        // next device check (which runs on every dashboard load) immediately
        // re-blocks the account. Resetting the device lock gives the user a
        // clean slate so the unblock actually sticks.
        await targetRef.update({
            blocked: false,
            blockedReason: null,
            blockedAt: null,
            deviceHashes: [],
            devicesClearedAt: FieldValue.serverTimestamp(),
            devicesClearedBy: session.uid,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: session.uid
        });

        await writeAuditLog({
            action: 'unblock-user',
            actorUid: session.uid,
            actorRole: session.role,
            targetUid: userId,
            targetUsername: targetData.username || null,
            details: { previousReason, clearedDeviceCount: previousDeviceCount }
        });

        sendJson(res, 200, { ok: true });
    } catch (error) {
        safeError(res, error);
    }
}
