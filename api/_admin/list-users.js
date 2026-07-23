import { initAdmin } from '../_firebaseAdmin.js';
import { assertMethod, handleCors, requireSession, requireRole, sendJson, safeError,
    requireCapability
} from '../_lib/request.js';
import { normalizeRole, CAPABILITIES, canViewUser as canViewTarget } from '../_lib/roles.js';
import { normalizeUserDocument, toPublicUser } from '../_lib/user-helpers.js';

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
        requireCapability(session, CAPABILITIES.USERS_READ);

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
