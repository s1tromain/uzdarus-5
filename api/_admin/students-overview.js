import { initAdmin } from '../_firebaseAdmin.js';
import { assertMethod, handleCors, requireSession, requireRole, sendJson, safeError,
    requireCapability
} from '../_lib/request.js';
import { normalizeRole, CAPABILITIES, canViewUser as canViewTarget } from '../_lib/roles.js';
import { buildStudentOverviewRow } from '../_lib/analytics.js';

/**
 * GET /api/admin?action=students-overview
 *
 * Staff-only. Returns compact per-student analytics rows for the admin list,
 * computed from the user documents alone (ONE users-collection read — same
 * cost as list-users). All filters (course, subscription, progress %, active
 * today, inactive, exams, certificates, search) are applied client-side from
 * these rows, so there are no extra reads or composite indexes.
 */
export default async function handler(req, res) {
    if (handleCors(req, res, ['GET'])) return;
    if (!assertMethod(req, res, 'GET')) return;

    try {
        const session = await requireSession(req);
        requireCapability(session, CAPABILITIES.STUDENTS_READ);

        const { adminDb } = initAdmin();
        const snapshot = await adminDb.collection('users').get();
        const now = Date.now();

        const students = snapshot.docs
            .map(d => ({ uid: d.id, data: d.data() }))
            .filter(({ data }) => {
                // only real customer/learner accounts, respecting visibility
                const role = normalizeRole(data.role);
                return canViewTarget(session.role, session.uid, '', role);
            })
            .map(({ uid, data }) => buildStudentOverviewRow(uid, data, now))
            .filter(r => r.username)
            .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));

        return sendJson(res, 200, { ok: true, students, generatedAt: now });
    } catch (error) {
        safeError(res, error);
    }
}
