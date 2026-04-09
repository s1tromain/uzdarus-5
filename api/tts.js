import { handleCors, sendJson, readBody } from './_lib/request.js';
import { rateLimit } from './_lib/rate-limit.js';
import { usageLimit } from './_lib/usage-limit.js';

const limiter = rateLimit({ max: 30, windowSec: 60, prefix: 'tts' });
const dailyLimit = usageLimit('tts');

/* ------------------------------------------------------------------ */
/*  In-memory cache: text → { buffer, timestamp }                     */
/*  Vercel cold-starts wipe it, but within a warm instance it avoids  */
/*  duplicate Azure calls for the same phrase.                        */
/* ------------------------------------------------------------------ */
const MAX_CACHE_SIZE = 500;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const cache = new Map();

function pruneCache() {
    if (cache.size <= MAX_CACHE_SIZE) return;
    const oldest = [...cache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toDelete = oldest.slice(0, oldest.length - MAX_CACHE_SIZE);
    for (const [key] of toDelete) cache.delete(key);
}

function getCached(text) {
    const entry = cache.get(text);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        cache.delete(text);
        return null;
    }
    return entry.buffer;
}

/* ------------------------------------------------------------------ */
/*  Handler                                                           */
/* ------------------------------------------------------------------ */
export default async function handler(req, res) {
    /* CORS — allow browser calls */
    if (handleCors(req, res, ['POST'])) return;

    /* Rate limit */
    if (limiter(req, res)) return;

    /* Only POST */
    if (req.method !== 'POST') {
        return sendJson(res, 405, { error: 'Method not allowed' });
    }

    /* ---- validate env ---- */
    const speechKey = process.env.AZURE_SPEECH_KEY;
    const region    = process.env.AZURE_REGION;

    if (!speechKey || !region) {
        console.error('TTS: missing AZURE_SPEECH_KEY or AZURE_REGION');
        return sendJson(res, 500, { error: 'TTS service not configured' });
    }

    /* ---- validate body ---- */
    let body;
    try {
        body = await readBody(req);
    } catch {
        return sendJson(res, 400, { error: 'Invalid request body' });
    }

    const text = typeof body.text === 'string' ? body.text.trim() : '';

    if (!text) {
        return sendJson(res, 400, { error: 'Missing "text" field' });
    }

    if (text.length > 1000) {
        return sendJson(res, 400, { error: 'Text too long (max 1000 chars)' });
    }

    /* ---- daily usage limit (user-based or IP fallback) ---- */
    if (await dailyLimit(req, res)) return;

    /* ---- cache hit ---- */
    const cached = getCached(text);
    if (cached) {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('X-TTS-Cache', 'HIT');
        return res.end(cached);
    }

    /* ---- call Azure Speech REST API ---- */
    const ssml = [
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ru-RU">',
        '  <voice name="ru-RU-DmitryNeural">',
        `    ${escapeXml(text)}`,
        '  </voice>',
        '</speak>',
    ].join('');

    const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

    try {
        const azureRes = await fetch(url, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': speechKey,
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
                'User-Agent': 'UzdaRusTTS',
            },
            body: ssml,
        });

        if (!azureRes.ok) {
            const detail = await azureRes.text().catch(() => '');
            console.error(`TTS Azure error ${azureRes.status}: ${detail}`);
            return sendJson(res, 502, { error: 'TTS synthesis failed' });
        }

        const arrayBuf = await azureRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);

        /* store in cache */
        cache.set(text, { buffer, timestamp: Date.now() });
        pruneCache();

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('X-TTS-Cache', 'MISS');
        return res.end(buffer);
    } catch (err) {
        console.error('TTS fetch error:', err);
        return sendJson(res, 502, { error: 'TTS service unavailable' });
    }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
function escapeXml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
