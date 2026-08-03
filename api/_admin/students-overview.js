import { initAdmin } from '../_firebaseAdmin.js';
import { assertMethod, handleCors, requireSession, sendJson, safeError,
    requireCapability
} from '../_lib/request.js';
import { normalizeRole, CAPABILITIES, canViewUser as canViewTarget, roleHasCapability } from '../_lib/roles.js';
import { buildStudentOverviewRow } from '../_lib/analytics.js';
import { computePlatformStats } from '../_lib/platform-stats.js';

/**
 * GET /api/admin?action=students-overview
 *
 * Staff-only. Returns compact per-student analytics rows for the admin list,
 * computed from the user documents alone (ONE users-collection read — same
 * cost as list-users). All filters (course, subscription, progress %, active
 * today, inactive, exams, certificates, search) are applied client-side from
 * these rows, so there are no extra reads or composite indexes.
 *
 * STARTUP COST (Stage 8): the header counters are now folded into this same
 * scan and returned as `stats` when — and only when — the caller holds
 * stats:read. An admin's panel startup therefore costs TWO full scans instead
 * of three. `action=stats` is untouched and still available.
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

        const docs = snapshot.docs.map(d => ({ uid: d.id, data: d.data() || {} }));

        const students = docs
            .filter(({ data }) => {
                // only real customer/learner accounts, respecting visibility
                const role = normalizeRole(data.role);
                return canViewTarget(session.role, session.uid, '', role);
            })
            .map(({ uid, data }) => buildStudentOverviewRow(uid, data, now))
            .filter(r => r.username)
            .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));

        const payload = { ok: true, students, generatedAt: now };

        /* Capability-gated: a teacher holds students:read but NOT stats:read,
           so they must never receive platform counters they cannot request
           directly. Same guard, same answer, one fewer round trip. */
        if (roleHasCapability(session.role, CAPABILITIES.STATS_READ)) {
            payload.stats = computePlatformStats(docs, session, canViewTarget, now);
        }

        return sendJson(res, 200, payload);
    } catch (error) {
        safeError(res, error);
    }
}
