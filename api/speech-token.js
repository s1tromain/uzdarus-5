import { handleCors, sendJson } from './_lib/request.js';
import { rateLimit } from './_lib/rate-limit.js';
import { usageLimit } from './_lib/usage-limit.js';

const limiter = rateLimit({ max: 10, windowSec: 60, prefix: 'speech-token' });
const dailyLimit = usageLimit('pronunciation');

/**
 * GET /api/speech-token
 *
 * Returns a short-lived (10 min) Azure Speech token so the browser
 * can use the Speech SDK without exposing the subscription key.
 *
 * Rate limits:
 *   - IP: 10 req/min (burst)
 *   - User: demo 5/day, paid 50/day, staff unlimited
 *
 * Env vars: AZURE_SPEECH_KEY, AZURE_REGION
 */
export default async function handler(req, res) {
    if (handleCors(req, res, ['GET'])) return;

    if (limiter(req, res)) return;

    if (req.method !== 'GET') {
        return sendJson(res, 405, { error: 'Method not allowed' });
    }

    /* daily usage limit (user-based or IP fallback) */
    if (await dailyLimit(req, res)) return;

    const speechKey = process.env.AZURE_SPEECH_KEY;
    const region    = process.env.AZURE_REGION;

    if (!speechKey || !region) {
        console.error('speech-token: missing AZURE_SPEECH_KEY or AZURE_REGION');
        return sendJson(res, 500, { error: 'Speech service not configured' });
    }

    try {
        const tokenRes = await fetch(
            `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
            {
                method: 'POST',
                headers: {
                    'Ocp-Apim-Subscription-Key': speechKey,
                    'Content-Length': '0',
                },
            }
        );

        if (!tokenRes.ok) {
            const detail = await tokenRes.text().catch(() => '');
            console.error(`speech-token Azure error ${tokenRes.status}: ${detail}`);
            return sendJson(res, 502, { error: 'Failed to obtain speech token' });
        }

        const token = await tokenRes.text();

        return sendJson(res, 200, { token, region });
    } catch (err) {
        console.error('speech-token fetch error:', err);
        return sendJson(res, 502, { error: 'Speech service unavailable' });
    }
}
