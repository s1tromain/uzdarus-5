import { initAdmin } from '../_firebaseAdmin.js';
import { assertMethod, handleCors, requireSession, requireRole, sendJson, safeError } from '../_lib/request.js';
import { normalizeRole } from '../_lib/roles.js';
import { normalizeUserDocument, toPublicUser } from '../_lib/user-helpers.js';

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
        const users = snapshot.docs
            .map((docSnap) => normalizeUserDocument(docSnap.id, docSnap.data()))
            .filter(Boolean)
            .filter((user) => canViewTarget(session.role, session.uid, user.uid, user.role))
            .map((user) => toPublicUser(user.uid, user))
            .filter(Boolean)
            .sort((a, b) => {
                if (a.role === b.role) {
                    return a.username.localeCompare(b.username);
                }

                return a.role.localeCompare(b.role);
            });

        sendJson(res, 200, { ok: true, users });
    } catch (error) {
        safeError(res, error);
    }
}
