import { handleCors, sendJson, requireSession } from './_lib/request.js';
import { initAdmin } from './_firebaseAdmin.js';
import { rateLimit } from './_lib/rate-limit.js';

const limiter = rateLimit({ max: 15, windowSec: 60, prefix: 'weak-words' });

/**
 * GET /api/weak-words
 *
 * Returns the top 10 most problematic words for the authenticated user
 * based on pronunciation_logs where per-word accuracy < 70.
 *
 * Response: { ok, words: [{ word, avgAccuracy, attempts }] }
 */
export default async function handler(req, res) {
    if (handleCors(req, res, ['GET'])) return;

    if (limiter(req, res)) return;

    if (req.method !== 'GET') {
        return sendJson(res, 405, { error: 'Method not allowed' });
    }

    let session;
    try {
        session = await requireSession(req);
    } catch (err) {
        return sendJson(res, err.statusCode || 401, { error: err.message });
    }

    try {
        const { adminDb } = initAdmin();

        const snap = await adminDb
            .collection('pronunciation_logs')
            .where('userId', '==', session.uid)
            .orderBy('createdAt', 'desc')
            .limit(500)
            .get();

        /* aggregate per-word accuracy from the words[] breakdown */
        const stats = Object.create(null); // { word -> { sum, count } }

        snap.forEach(doc => {
            const data = doc.data();

            /* per-word breakdown (array inside each log) */
            if (Array.isArray(data.words)) {
                for (const w of data.words) {
                    if (typeof w.word !== 'string' || !w.word) continue;
                    if (typeof w.accuracy !== 'number') continue;
                    if (w.accuracy >= 70) continue;

                    const key = w.word.toLowerCase().trim();
                    if (!key) continue;

                    if (!stats[key]) {
                        stats[key] = { word: w.word, sum: 0, count: 0 };
                    }
                    stats[key].sum += w.accuracy;
                    stats[key].count += 1;
                }
            }

            /* also count the top-level word if its overall accuracy < 70 */
            if (typeof data.word === 'string' && data.word &&
                typeof data.accuracyScore === 'number' && data.accuracyScore < 70) {
                const key = data.word.toLowerCase().trim();
                if (key) {
                    if (!stats[key]) {
                        stats[key] = { word: data.word, sum: 0, count: 0 };
                    }
                    stats[key].sum += data.accuracyScore;
                    stats[key].count += 1;
                }
            }
        });

        /* sort: lowest average accuracy first, then most attempts */
        const sorted = Object.values(stats)
            .map(s => ({
                word: s.word,
                avgAccuracy: Math.round(s.sum / s.count),
                attempts: s.count,
            }))
            .sort((a, b) => a.avgAccuracy - b.avgAccuracy || b.attempts - a.attempts)
            .slice(0, 10);

        return sendJson(res, 200, { ok: true, words: sorted });
    } catch (err) {
        console.error('weak-words error:', err);
        return sendJson(res, 500, { error: 'Failed to fetch weak words' });
    }
}
