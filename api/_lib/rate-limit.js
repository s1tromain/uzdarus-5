/**
 * In-memory sliding-window rate limiter for Vercel serverless functions.
 *
 * Usage:
 *   import { rateLimit } from './rate-limit.js';
 *   const limiter = rateLimit({ max: 30, windowSec: 60 });
 *
 *   // inside handler, before business logic:
 *   if (limiter(req, res)) return;   // 429 already sent
 */

const buckets = new Map();          // key → { hits: number, resetAt: number }
let _pruneTimer = null;

/* ---- periodic cleanup of stale entries ---- */
function _ensurePruneTimer() {
    if (_pruneTimer) return;
    _pruneTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of buckets) {
            if (now >= entry.resetAt) buckets.delete(key);
        }
        if (buckets.size === 0) {
            clearInterval(_pruneTimer);
            _pruneTimer = null;
        }
    }, 60_000);
    /* allow Vercel to shut the process down cleanly */
    if (_pruneTimer.unref) _pruneTimer.unref();
}

/**
 * Extract a usable IP from the Vercel / Express request.
 * Vercel sets x-forwarded-for; fall back to socket address.
 */
function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return xff.split(',')[0].trim();
    const real = req.headers['x-real-ip'];
    if (real) return real.trim();
    return req.socket?.remoteAddress || 'unknown';
}

/**
 * Create a rate-limit guard.
 *
 * @param {object}  opts
 * @param {number}  opts.max        – max requests per window (required)
 * @param {number}  opts.windowSec  – window length in seconds (default 60)
 * @param {string} [opts.prefix]    – bucket prefix (use different values to
 *                                    separate limits per endpoint)
 * @returns {(req, res) => boolean} – returns true if request was blocked (429 sent)
 */
export function rateLimit({ max, windowSec = 60, prefix = '' } = {}) {
    if (!max || max < 1) throw new Error('rateLimit: max must be >= 1');

    const windowMs = windowSec * 1000;

    /**
     * @param {import('http').IncomingMessage} req
     * @param {import('http').ServerResponse}  res
     * @returns {boolean} true = blocked, caller should `return`
     */
    return function guard(req, res) {
        const ip = getClientIp(req);
        const key = prefix ? `${prefix}:${ip}` : ip;
        const now = Date.now();

        let entry = buckets.get(key);

        /* window expired or first request → new window */
        if (!entry || now >= entry.resetAt) {
            entry = { hits: 0, resetAt: now + windowMs };
            buckets.set(key, entry);
            _ensurePruneTimer();
        }

        entry.hits += 1;

        /* informational headers (always set) */
        const remaining = Math.max(0, max - entry.hits);
        const retrySec  = Math.ceil((entry.resetAt - now) / 1000);

        if (typeof res.setHeader === 'function') {
            res.setHeader('X-RateLimit-Limit', String(max));
            res.setHeader('X-RateLimit-Remaining', String(remaining));
            res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
        }

        if (entry.hits > max) {
            console.warn(
                `[rate-limit] ${prefix || 'global'} | IP=${ip} | hits=${entry.hits}/${max} | retry=${retrySec}s`
            );

            if (typeof res.setHeader === 'function') {
                res.setHeader('Retry-After', String(retrySec));
            }

            res.status(429).json({
                error: 'Too many requests',
                retryAfter: retrySec,
            });

            return true;            // blocked
        }

        return false;               // allowed
    };
}
