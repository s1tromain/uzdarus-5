import { initAdmin } from '../_firebaseAdmin.js';
import { assertMethod, handleCors, requireSession, requireRole, sendJson, safeError,
    requireCapability
} from '../_lib/request.js';
import { normalizeRole, CAPABILITIES, canViewUser as canViewTarget } from '../_lib/roles.js';
import { listUserCertificates } from '../_lib/certificates.js';

function toIso(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate().toISOString();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** GET /api/admin?action=list-user-certificates&userId=<uid> */
export default async function handler(req, res) {
    if (handleCors(req, res, ['GET'])) return;
    if (!assertMethod(req, res, 'GET')) return;

    try {
        const session = await requireSession(req);
        requireCapability(session, CAPABILITIES.CERTIFICATES_READ);

        const userId = String(req.query?.userId || '').trim();
        if (!userId) {
            return sendJson(res, 400, { error: 'userId required' });
        }

        const { adminDb } = initAdmin();
        const userSnap = await adminDb.collection('users').doc(userId).get();
        const targetRole = userSnap.exists ? (userSnap.data()?.role || 'customer') : 'customer';

        if (!canViewTarget(session.role, session.uid, userId, targetRole)) {
            return sendJson(res, 403, { error: 'Access denied' });
        }

        const certificates = (await listUserCertificates(userId))
            .map((c) => ({
                certificateNumber: c.certificateNumber,
                course: c.course,
                level: c.level,
                userName: c.userName,
                userId: c.userId,
                score: c.score ?? null,
                status: c.status || 'active',
                issueDate: toIso(c.issueDate)
            }))
            .sort((a, b) => String(a.certificateNumber).localeCompare(String(b.certificateNumber)));

        sendJson(res, 200, { ok: true, certificates });
    } catch (error) {
        safeError(res, error);
    }
}
