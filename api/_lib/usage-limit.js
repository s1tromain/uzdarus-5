/**
 * User-based daily usage limiter.
 *
 * - Authenticated users → tracked by userId in Firestore
 * - Anonymous / no token → fallback to IP-based in-memory tracking
 *
 * Firestore document:  usage/{userId}/daily/{YYYY-MM-DD}
 *   { ttsCount, pronunciationCount, updatedAt }
 *
 * Tiers (daily):
 *   demo  (subscription.active !== true):  5 pronunciation, 20 tts
 *   paid  (subscription.active === true):  50 pronunciation, 100 tts
 *   staff (moderator/admin/developer):     unlimited
 */

import { initAdmin } from '../_firebaseAdmin.js';
import { normalizeRole } from './roles.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */
const LIMITS = {
    demo: { tts: 20, pronunciation: 5 },
    paid: { tts: 100, pronunciation: 50 },
};

const STAFF_ROLES = new Set(['moderator', 'admin', 'developer']);

/* ---- anonymous (IP) fallback: in-memory daily map ---- */
const anonBuckets = new Map();   // key → { tts, pron, dateStr }
let _anonPruneTimer = null;

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
function todayUTC() {
    return new Date().toISOString().slice(0, 10);   // "2026-04-09"
}

function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return xff.split(',')[0].trim();
    const real = req.headers['x-real-ip'];
    if (real) return real.trim();
    return req.socket?.remoteAddress || 'unknown';
}

/**
 * Attempt to verify the bearer token.
 * Returns { uid, role, subscriptionActive } or null if not authenticated.
 * Never throws — auth is optional for this middleware.
 */
async function softAuth(req) {
    const header = req.headers.authorization || req.headers.Authorization || '';
    if (!header.toLowerCase().startsWith('bearer ')) return null;

    const token = header.slice(7).trim();
    if (!token) return null;

    try {
        const { adminAuth, adminDb } = initAdmin();
        const decoded = await adminAuth.verifyIdToken(token, true);
        const uid = decoded.uid;

        const profileSnap = await adminDb.collection('users').doc(uid).get();
        if (!profileSnap.exists) return { uid, role: 'customer', subscriptionActive: false };

        const data = profileSnap.data() || {};
        const role = normalizeRole(data.role);
        const sub = data.subscription || {};
        const subscriptionActive = Boolean(sub.active);

        return { uid, role, subscriptionActive };
    } catch {
        return null;
    }
}

/* ------------------------------------------------------------------ */
/*  Anonymous (IP) daily limiter                                      */
/* ------------------------------------------------------------------ */
function _ensureAnonPrune() {
    if (_anonPruneTimer) return;
    _anonPruneTimer = setInterval(() => {
        const today = todayUTC();
        for (const [key, entry] of anonBuckets) {
            if (entry.dateStr !== today) anonBuckets.delete(key);
        }
        if (anonBuckets.size === 0) {
            clearInterval(_anonPruneTimer);
            _anonPruneTimer = null;
        }
    }, 60_000);
    if (_anonPruneTimer.unref) _anonPruneTimer.unref();
}

function getAnonBucket(ip) {
    const today = todayUTC();
    let entry = anonBuckets.get(ip);
    if (!entry || entry.dateStr !== today) {
        entry = { tts: 0, pron: 0, dateStr: today };
        anonBuckets.set(ip, entry);
        _ensureAnonPrune();
    }
    return entry;
}

/* ------------------------------------------------------------------ */
/*  Firestore daily counter                                           */
/* ------------------------------------------------------------------ */
async function getFirestoreUsage(uid) {
    const { adminDb } = initAdmin();
    const today = todayUTC();
    const ref = adminDb.collection('usage').doc(uid)
        .collection('daily').doc(today);

    const snap = await ref.get();
    if (!snap.exists) return { ref, ttsCount: 0, pronunciationCount: 0 };

    const d = snap.data();
    return {
        ref,
        ttsCount: d.ttsCount || 0,
        pronunciationCount: d.pronunciationCount || 0,
    };
}

async function incrementFirestore(ref, field) {
    const { FieldValue } = initAdmin();
    await ref.set(
        { [field]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
    );
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Create a daily-usage guard for a specific action type.
 *
 * @param {'tts'|'pronunciation'} action
 * @returns {(req, res) => Promise<boolean>}
 *     true  → blocked (403 sent)
 *     false → allowed (counter already incremented)
 */
export function usageLimit(action) {
    if (action !== 'tts' && action !== 'pronunciation') {
        throw new Error(`usageLimit: unknown action "${action}"`);
    }

    const firestoreField = action === 'tts' ? 'ttsCount' : 'pronunciationCount';

    return async function guard(req, res) {
        /* ---- identify user ---- */
        const user = await softAuth(req);

        /* ========== STAFF — unlimited ========== */
        if (user && STAFF_ROLES.has(user.role)) return false;

        /* ---- determine tier ---- */
        const tier = user?.subscriptionActive ? 'paid' : 'demo';
        const max = LIMITS[tier][action];

        /* ========== AUTHENTICATED ========== */
        if (user) {
            const { ref, ttsCount, pronunciationCount } = await getFirestoreUsage(user.uid);
            const current = action === 'tts' ? ttsCount : pronunciationCount;

            if (current >= max) {
                const msg = tier === 'demo'
                    ? `Kunlik demo limit tugadi (${max}). Obuna bo'ling!`
                    : `Kunlik limit tugadi (${max}). Ertaga qaytadan urinib ko'ring.`;

                res.status(403).json({
                    error: 'daily_limit_exceeded',
                    message: msg,
                    tier,
                    limit: max,
                    used: current,
                    resetsAt: todayUTC() + 'T00:00:00Z',
                });
                return true;
            }

            await incrementFirestore(ref, firestoreField);

            /* set informational headers */
            if (typeof res.setHeader === 'function') {
                res.setHeader('X-Usage-Tier', tier);
                res.setHeader('X-Usage-Limit', String(max));
                res.setHeader('X-Usage-Remaining', String(max - current - 1));
            }

            return false;
        }

        /* ========== ANONYMOUS (IP fallback) ========== */
        const ip = getClientIp(req);
        const bucket = getAnonBucket(ip);
        const currentAnon = action === 'tts' ? bucket.tts : bucket.pron;

        if (currentAnon >= LIMITS.demo[action]) {
            res.status(403).json({
                error: 'daily_limit_exceeded',
                message: `Kunlik limit tugadi (${LIMITS.demo[action]}). Tizimga kiring yoki obuna bo'ling!`,
                tier: 'anonymous',
                limit: LIMITS.demo[action],
                used: currentAnon,
                resetsAt: todayUTC() + 'T00:00:00Z',
            });
            return true;
        }

        if (action === 'tts') bucket.tts++;
        else bucket.pron++;

        return false;
    };
}
