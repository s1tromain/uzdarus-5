import { handleCors, sendJson, readBody } from './_lib/request.js';
import { initAdmin } from './_firebaseAdmin.js';
import { rateLimit } from './_lib/rate-limit.js';

const limiter = rateLimit({ max: 30, windowSec: 60, prefix: 'log-pron' });

/**
 * POST /api/log-pronunciation
 *
 * Logs a pronunciation assessment result to Firestore.
 *
 * Body: { word, accuracyScore, fluencyScore, completenessScore,
 *         pronunciationScore, words? }
 *
 * Auth: optional — if Bearer token present, logs under userId;
 *       otherwise logs under IP (anonymous).
 *
 * Firestore:  pronunciation_logs/{autoId}
 */
export default async function handler(req, res) {
    if (handleCors(req, res, ['POST'])) return;

    if (limiter(req, res)) return;

    if (req.method !== 'POST') {
        return sendJson(res, 405, { error: 'Method not allowed' });
    }

    let body;
    try {
        body = await readBody(req);
    } catch {
        return sendJson(res, 400, { error: 'Invalid request body' });
    }

    /* ---- validate ---- */
    const word = typeof body.word === 'string' ? body.word.trim() : '';
    if (!word || word.length > 200) {
        return sendJson(res, 400, { error: 'Invalid "word" field' });
    }

    const accuracyScore      = clampScore(body.accuracyScore);
    const fluencyScore       = clampScore(body.fluencyScore);
    const completenessScore  = clampScore(body.completenessScore);
    const pronunciationScore = clampScore(body.pronunciationScore);

    /* optional per-word breakdown — cap to 20 entries */
    const words = Array.isArray(body.words)
        ? body.words.slice(0, 20).map(w => ({
              word: String(w.word || '').slice(0, 100),
              accuracy: clampScore(w.accuracy),
          }))
        : [];

    /* ---- identify user (soft auth) ---- */
    let userId = null;
    const header = req.headers.authorization || req.headers.Authorization || '';
    if (header.toLowerCase().startsWith('bearer ')) {
        const token = header.slice(7).trim();
        if (token) {
            try {
                const { adminAuth } = initAdmin();
                const decoded = await adminAuth.verifyIdToken(token, true);
                userId = decoded.uid;
            } catch { /* anonymous */ }
        }
    }

    /* ---- write to Firestore ---- */
    try {
        const { adminDb, FieldValue } = initAdmin();

        const doc = {
            userId: userId || null,
            ip: userId ? null : getClientIp(req),   // only store IP for anon
            word,
            accuracyScore,
            fluencyScore,
            completenessScore,
            pronunciationScore,
            words,
            createdAt: FieldValue.serverTimestamp(),
        };

        await adminDb.collection('pronunciation_logs').add(doc);

        return sendJson(res, 200, { ok: true });
    } catch (err) {
        console.error('log-pronunciation write error:', err);
        return sendJson(res, 500, { error: 'Failed to save log' });
    }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
function clampScore(v) {
    const n = Number(v);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
}

function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return xff.split(',')[0].trim();
    const real = req.headers['x-real-ip'];
    if (real) return real.trim();
    return req.socket?.remoteAddress || 'unknown';
}
