import { handleCors, sendJson, readBody } from './_lib/request.js';
import { initAdmin } from './_firebaseAdmin.js';
import { rateLimit } from './_lib/rate-limit.js';
import { ingestEvents } from './_lib/analytics-store.js';

/**
 * POST /api/analytics?action=track
 *
 * Ingests a BATCH of learning events from the authenticated learner and
 * writes them (plus updated aggregates) in a SINGLE Firestore batch:
 *   users/{uid}/events/{autoId}      one doc per event
 *   users/{uid}/analytics/summary    running aggregates (server-only)
 *   users/{uid}.stats                tiny denormalized counters (cheap lists)
 *
 * The uid is taken from the verified ID token — a client can never write
 * events for another user. This is also the (working) replacement for the
 * old /api/log-pronunciation path (pronunciation attempts arrive as `pron`
 * events), which the previous underscore-file route never served.
 *
 * Cost: ~2 reads (token verify is free; 1 summary read) + 1 batch write per
 * flush. Clients flush infrequently (buffered), so writes stay low.
 */

const limiter = rateLimit({ max: 40, windowSec: 60, prefix: 'analytics-track' });

export default async function handler(req, res) {
    if (handleCors(req, res, ['POST'])) return;

    const action = (req.query?.action || 'track').trim();
    if (action !== 'track') {
        return sendJson(res, 400, { error: 'Invalid action' });
    }
    if (req.method !== 'POST') {
        return sendJson(res, 405, { error: 'Method not allowed' });
    }
    if (limiter(req, res)) return;

    // ---- auth: derive uid from the verified token (no spoofing) ----
    const header = req.headers.authorization || req.headers.Authorization || '';
    if (!header.toLowerCase().startsWith('bearer ')) {
        return sendJson(res, 401, { error: 'Authorization required' });
    }
    const token = header.slice(7).trim();
    if (!token) return sendJson(res, 401, { error: 'Invalid token' });

    let uid;
    let admin;
    try {
        admin = initAdmin();
        const decoded = await admin.adminAuth.verifyIdToken(token, true);
        uid = decoded.uid;
    } catch {
        return sendJson(res, 401, { error: 'Invalid or expired token' });
    }

    let body;
    try { body = await readBody(req); }
    catch { return sendJson(res, 400, { error: 'Invalid body' }); }

    try {
        const { written, dropped } = await ingestEvents(admin, uid, body.events, Date.now());
        return sendJson(res, 200, { ok: true, written, dropped });
    } catch (err) {
        console.error('analytics track error:', err);
        return sendJson(res, 500, { error: 'Failed to save events' });
    }
}
