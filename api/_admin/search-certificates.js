import { initAdmin } from '../_firebaseAdmin.js';
import { assertMethod, handleCors, requireSession, requireRole, sendJson, safeError } from '../_lib/request.js';
import { normalizeRole } from '../_lib/roles.js';
import { getRegistryCertificate, listUserCertificates } from '../_lib/certificates.js';

const MAX_RESULTS = 100;
const CERT_NUMBER_RE = /^UZD-[A-Z0-9]+-\d{4}-\d{6}$/;

function canViewTarget(actorRole, actorUid, targetUid, targetRole) {
    const actor = normalizeRole(actorRole);
    const target = normalizeRole(targetRole);

    if (actor === 'developer') return true;
    if (actor === 'admin') return target !== 'developer';
    if (actor === 'moderator') return target === 'customer' || target === 'moderator' || actorUid === targetUid;
    return false;
}

function toIso(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate().toISOString();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formatResult(cert, user) {
    return {
        certificateNumber: cert.certificateNumber,
        course: cert.course,
        level: cert.level,
        userName: cert.userName || (user ? (user.displayName || user.username) : ''),
        userId: cert.userId,
        username: user ? (user.username || '') : '',
        email: user ? (user.email || '') : '',
        score: cert.score ?? null,
        status: cert.status || 'active',
        issueDate: toIso(cert.issueDate)
    };
}

/**
 * GET /api/admin?action=search-certificates&q=<term>
 *
 * Term can be a full certificate number (exact match against the registry) or
 * a user name / email / username fragment (resolved through the users
 * collection, then their certificates are returned).
 */
export default async function handler(req, res) {
    if (handleCors(req, res, ['GET'])) return;
    if (!assertMethod(req, res, 'GET')) return;

    try {
        const session = await requireSession(req);
        requireRole(session, 'moderator');

        const rawQuery = String(req.query?.q || '').trim();
        if (!rawQuery) {
            return sendJson(res, 400, { error: 'q required' });
        }

        const { adminDb } = initAdmin();

        // --- Exact certificate-number lookup ---------------------------------
        const upper = rawQuery.toUpperCase();
        if (CERT_NUMBER_RE.test(upper)) {
            const record = await getRegistryCertificate(upper);
            if (!record) {
                return sendJson(res, 200, { ok: true, results: [] });
            }

            const userSnap = await adminDb.collection('users').doc(record.userId).get();
            const userData = userSnap.exists ? userSnap.data() : null;
            const targetRole = userData?.role || 'customer';

            if (!canViewTarget(session.role, session.uid, record.userId, targetRole)) {
                return sendJson(res, 200, { ok: true, results: [] });
            }

            return sendJson(res, 200, { ok: true, results: [formatResult(record, userData)] });
        }

        // --- Name / email / username fragment --------------------------------
        const needle = rawQuery.toLowerCase();
        const usersSnap = await adminDb.collection('users').get();

        const results = [];
        for (const docSnap of usersSnap.docs) {
            if (results.length >= MAX_RESULTS) break;

            const data = docSnap.data() || {};
            const displayName = String(data.displayName || '').toLowerCase();
            const username = String(data.username || '').toLowerCase();
            const email = String(data.email || '').toLowerCase();

            const matches = displayName.includes(needle) || username.includes(needle) || email.includes(needle);
            if (!matches) continue;

            if (!canViewTarget(session.role, session.uid, docSnap.id, data.role || 'customer')) continue;

            const certs = await listUserCertificates(docSnap.id);
            for (const cert of certs) {
                results.push(formatResult(cert, { ...data, uid: docSnap.id }));
                if (results.length >= MAX_RESULTS) break;
            }
        }

        results.sort((a, b) => String(a.certificateNumber).localeCompare(String(b.certificateNumber)));
        sendJson(res, 200, { ok: true, results });
    } catch (error) {
        safeError(res, error);
    }
}
