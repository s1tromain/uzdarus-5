import { initAdmin } from '../_firebaseAdmin.js';
import { assertMethod, handleCors, requireSession, sendJson, safeError, requireCapability } from '../_lib/request.js';
import { normalizeRole, CAPABILITIES, canViewUser as canViewTarget } from '../_lib/roles.js';
import { readGlobalAnalytics } from '../_lib/analytics-store.js';

/**
 * GET /api/admin?action=global-analytics
 *
 * Platform-wide statistics (Stage 7). Gated by students:read, which every
 * staff role holds — including `teacher`, for whom this page is pure read-only
 * educational data and contains no per-account identifiers at all.
 *
 * Visibility is applied per row through the SAME canViewUser() policy the rest
 * of the admin surface uses, so a teacher's totals are computed over learners
 * only and can never be used to infer the existence of staff accounts.
 *
 * COST: one users-collection scan (identical to students-overview, which the
 * panel already issues) plus five small counter documents. There is no fan-out
 * over per-user subcollections — the expensive parts (topic difficulty, daily
 * activity) are pre-aggregated on the ingest path.
 */
export default async function handler(req, res) {
    if (handleCors(req, res, ['GET'])) return;
    if (!assertMethod(req, res, 'GET')) return;

    try {
        const session = await requireSession(req);
        requireCapability(session, CAPABILITIES.STUDENTS_READ);

        const admin = initAdmin();
        const analytics = await readGlobalAnalytics(admin, {
            canView: (data) => canViewTarget(session.role, session.uid, '', normalizeRole(data.role)),
        });

        return sendJson(res, 200, { ok: true, analytics });
    } catch (error) {
        safeError(res, error);
    }
}
