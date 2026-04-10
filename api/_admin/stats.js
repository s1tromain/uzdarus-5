import { initAdmin } from '../_firebaseAdmin.js';
import { assertMethod, handleCors, requireSession, requireRole, sendJson, safeError } from '../_lib/request.js';
import { normalizeRole } from '../_lib/roles.js';
import { normalizeUserDocument, toDate } from '../_lib/user-helpers.js';

function canViewTarget(actorRole, actorUid, targetUid, targetRole) {
    const actor = normalizeRole(actorRole);
    const target = normalizeRole(targetRole);

    if (actor === 'developer') {
        return true;
    }

    if (actor === 'admin') {
        return target !== 'developer';
    }

    if (actor === 'moderator') {
        return target === 'customer' || target === 'moderator' || actorUid === targetUid;
    }

    return false;
}

export default async function handler(req, res) {
    if (handleCors(req, res, ['GET'])) {
        return;
    }

    if (!assertMethod(req, res, 'GET')) {
        return;
    }

    try {
        const session = await requireSession(req);
        const { adminDb } = initAdmin();
        requireRole(session, 'moderator');

        const snapshot = await adminDb.collection('users').get();
        const docs = snapshot.docs
            .map((docSnap) => normalizeUserDocument(docSnap.id, docSnap.data()))
            .filter(Boolean)
            .filter((user) => canViewTarget(session.role, session.uid, user.uid, user.role));

        const roleCounts = {
            customer: 0,
            moderator: 0,
            admin: 0,
            developer: 0
        };

        let activeSubscriptions = 0;
        let blockedUsers = 0;
        let registeredDevices = 0;

        const now = Date.now();

        for (const user of docs) {
            const role = normalizeRole(user.role);
            roleCounts[role] = (roleCounts[role] || 0) + 1;

            if (user.blocked) {
                blockedUsers += 1;
            }

            const deviceCount = Array.isArray(user.deviceHashes) ? user.deviceHashes.length : 0;
            registeredDevices += deviceCount;

            if (role === 'customer') {
                const subscription = user.subscription || {};
                const endAt = toDate(subscription.endAt);
                if (subscription.active && endAt && endAt.getTime() >= now) {
                    activeSubscriptions += 1;
                }
            }
        }

        sendJson(res, 200, {
            ok: true,
            stats: {
                totalUsers: docs.length,
                roleCounts,
                activeSubscriptions,
                blockedUsers,
                registeredDevices
            }
        });
    } catch (error) {
        safeError(res, error);
    }
}
