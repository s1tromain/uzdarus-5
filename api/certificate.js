import { handleCors, sendJson, readBody, requireSession, safeError } from './_lib/request.js';
import { rateLimit } from './_lib/rate-limit.js';
import { issueCertificate, getRegistryCertificate, normalizeCourse } from './_lib/certificates.js';

/**
 * /api/certificate?action=<issue|verify>
 *
 *  - issue  (POST, auth): issue/return the caller's certificate for a course.
 *           Body: { course: "A1" | "B1" }. Idempotent.
 *  - verify (GET|POST, public): look up a certificate by its number.
 *           Query/body: { number: "UZD-B1-2026-000123" }. Rate limited.
 *
 * The certificate registry is never exposed to the client directly — every
 * lookup goes through this endpoint so sequential numbers cannot be harvested
 * by enumerating Firestore.
 */

// Public verification — keep the abuse window tight against enumeration.
const verifyLimiter = rateLimit({ max: 20, windowSec: 60, prefix: 'cert-verify' });

function toIso(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate().toISOString();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function handleIssue(req, res) {
    if (req.method !== 'POST') {
        return sendJson(res, 405, { error: `Method ${req.method} not allowed` });
    }

    const session = await requireSession(req);
    const body = await readBody(req);
    const course = normalizeCourse(body.course);

    if (!course) {
        return sendJson(res, 400, { error: 'Kurs ko‘rsatilmagan' });
    }

    const isPrivileged = session.role === 'developer' || session.role === 'admin';

    const result = await issueCertificate({
        uid: session.uid,
        course,
        profile: { ...session.profile, role: session.role },
        isPrivileged
    });

    const cert = result.certificate || {};
    return sendJson(res, 200, {
        ok: true,
        alreadyIssued: Boolean(result.alreadyIssued),
        certificate: {
            certificateNumber: result.number,
            course: cert.course || course,
            level: cert.level || null,
            userName: cert.userName || null,
            score: cert.score ?? null,
            status: cert.status || 'active',
            issueDate: toIso(cert.issueDate),
            certificateData: cert.certificateData || null
        }
    });
}

async function handleVerify(req, res) {
    if (verifyLimiter(req, res)) return;

    let number = '';
    if (req.method === 'GET') {
        number = req.query?.number || '';
    } else {
        const body = await readBody(req);
        number = body.number || '';
    }

    number = String(number || '').trim().toUpperCase();
    if (!number) {
        return sendJson(res, 400, { error: 'Sertifikat raqami kiritilmagan' });
    }

    const record = await getRegistryCertificate(number);
    if (!record) {
        return sendJson(res, 200, { found: false });
    }

    return sendJson(res, 200, {
        found: true,
        certificate: {
            certificateNumber: record.certificateNumber,
            course: record.course,
            level: record.level,
            userName: record.userName,
            score: record.score ?? null,
            status: record.status || 'active',
            issueDate: toIso(record.issueDate)
        }
    });
}

export default async function handler(req, res) {
    if (handleCors(req, res, ['GET', 'POST'])) return;

    const action = String(req.query?.action || '').trim();

    try {
        if (action === 'issue') {
            return await handleIssue(req, res);
        }

        if (action === 'verify') {
            return await handleVerify(req, res);
        }

        return sendJson(res, 400, {
            error: 'Missing or invalid "action" query parameter',
            validActions: ['issue', 'verify']
        });
    } catch (error) {
        safeError(res, error);
    }
}
