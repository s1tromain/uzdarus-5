import { initAdmin } from '../_firebaseAdmin.js';
import { assertMethod, handleCors, requireSession, requireRole, sendJson, safeError } from '../_lib/request.js';
import { normalizeRole } from '../_lib/roles.js';
import { readStudentDashboard } from '../_lib/analytics-store.js';

/** Same visibility rules as list-users: who a staff member may inspect. */
function canViewTarget(actorRole, actorUid, targetUid, targetRole) {
    const actor = normalizeRole(actorRole);
    const target = normalizeRole(targetRole);
    if (actor === 'developer') return true;
    if (actor === 'admin') return target !== 'developer';
    if (actor === 'moderator') return target === 'customer' || target === 'moderator' || actorUid === targetUid;
    return false;
}

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
        requireRole(session, 'moderator');

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
