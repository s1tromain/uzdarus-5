import { initAdmin } from '../_firebaseAdmin.js';
import { assertMethod, handleCors, requireSession, requireRole, sendJson, safeError,
    requireCapability
} from '../_lib/request.js';
import { normalizeRole, CAPABILITIES, canViewUser as canViewTarget } from '../_lib/roles.js';
import { readStudentDashboard } from '../_lib/analytics-store.js';

/**
 * GET /api/admin?action=student-analytics&uid=<uid>
 *
 * Staff-only (moderator+). Assembles the full learning dashboard for one
 * student from REUSED data (profile, quizResults, certificates) plus the new
 * event stream + summary. Bounded reads: user doc + quizResults + certs +
 * summary + last 300 events.
 */
export default async function handler(req, res) {
    if (handleCors(req, res, ['GET'])) return;
    if (!assertMethod(req, res, 'GET')) return;

    try {
        const session = await requireSession(req);
        requireCapability(session, CAPABILITIES.STUDENTS_READ);

        const uid = String(req.query?.uid || '').trim();
        if (!uid) return sendJson(res, 400, { error: 'Missing uid' });

        const admin = initAdmin();
        const result = await readStudentDashboard(admin, uid);
        if (!result.found) return sendJson(res, 404, { error: 'User not found' });

        if (!canViewTarget(session.role, session.uid, uid, result.profile.role)) {
            return sendJson(res, 403, { error: 'Access denied' });
        }

        return sendJson(res, 200, { ok: true, dashboard: result.dashboard });
    } catch (error) {
        safeError(res, error);
    }
}
