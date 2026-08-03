import { initAdmin } from '../_firebaseAdmin.js';
import { assertMethod, handleCors, requireSession, sendJson, safeError,
    requireCapability
} from '../_lib/request.js';
import { CAPABILITIES, canViewUser as canViewTarget } from '../_lib/roles.js';
import { computePlatformStats } from '../_lib/platform-stats.js';

/**
 * GET /api/admin?action=stats
 *
 * The header counters. The computation itself lives in _lib/platform-stats.js
 * so that students-overview can produce byte-identical numbers from the scan it
 * already performs — see the note there. This endpoint is unchanged in
 * behaviour and remains the standalone way to fetch the counters.
 */
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
        requireCapability(session, CAPABILITIES.STATS_READ);

        const snapshot = await adminDb.collection('users').get();
        const docs = snapshot.docs.map((docSnap) => ({ uid: docSnap.id, data: docSnap.data() || {} }));

        sendJson(res, 200, {
            ok: true,
            stats: computePlatformStats(docs, session, canViewTarget, Date.now())
        });
    } catch (error) {
        safeError(res, error);
    }
}
