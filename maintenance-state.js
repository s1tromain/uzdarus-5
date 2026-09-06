/**
 * maintenance-state.js — THE single source of truth for the platform-wide
 * maintenance mode and for what it does to a paid subscription.
 *
 * ---------------------------------------------------------------------------
 * WHY THE PAID DAYS ARE NOT WRITTEN BACK TO EVERY USER
 * ---------------------------------------------------------------------------
 * account-freeze.js pauses ONE account and shifts that account's endAt when it
 * is unfrozen. Doing the same globally would mean rewriting every subscription
 * in the database at the moment maintenance ends — thousands of writes that
 * must not be run twice, must survive a crash halfway through, and would be
 * wrong for anyone whose tariff an admin touched in between.
 *
 * So nothing is written to users at all. The maintenance windows are recorded
 * once, centrally, and the subscription CLOCK subtracts them:
 *
 *     effectiveEndAt = endAt + (maintenance that overlapped the paid period)
 *
 * That is a pure function of (subscription, windows, now). It is idempotent by
 * construction — reading it a thousand times credits the same three days once —
 * it needs no migration, and an account whose tariff is extended mid-maintenance
 * keeps the extension because the live endAt is what gets shifted.
 *
 * ---------------------------------------------------------------------------
 * WHY THE WINDOWS ARE WALKED IN ORDER
 * ---------------------------------------------------------------------------
 * A window only burns paid time if it falls INSIDE the period the learner has
 * paid for. But crediting a window moves the end of that period, which can pull
 * a later window inside it. Summing overlaps against the original endAt would
 * lose that, so the windows are walked oldest-first against a running end. With
 * one window it is the obvious answer; with several it is the only correct one.
 *
 * ---------------------------------------------------------------------------
 * RUNTIME
 * ---------------------------------------------------------------------------
 * Imported by the browser (firebase-client.js, the gate, the admin panel) AND
 * by the serverless endpoints, so it stays dependency-free: no firebase-admin,
 * no DOM, no window. It computes plain numbers; turning a Date into a Firestore
 * Timestamp is the caller's job — the same contract account-freeze.js keeps.
 */

/** Where the one state document lives. */
export const MAINTENANCE_COLLECTION = 'system';
export const MAINTENANCE_DOC_ID = 'maintenance';
export const MAINTENANCE_PATH = `${MAINTENANCE_COLLECTION}/${MAINTENANCE_DOC_ID}`;

/** The error a user-facing write returns while maintenance is on. */
export const MAINTENANCE_ERROR_CODE = 'MAINTENANCE_MODE';
export const MAINTENANCE_HTTP_STATUS = 503;

/** Only this role may turn the mode on or off. */
export const MAINTENANCE_ROLE = 'developer';

export const MAX_REASON_LENGTH = 300;

/**
 * Windows kept in the document. Maintenance happens a handful of times a year;
 * this is several decades of history and keeps the document small enough to
 * read on every page load.
 */
export const MAX_WINDOWS = 200;

/**
 * Normalise anything a date can arrive as: a Firestore Timestamp (client or
 * admin SDK), a Date, an ISO string, or epoch milliseconds. Returns epoch ms,
 * or null when there is no usable date — never NaN, which would silently
 * poison every comparison downstream.
 */
export function toMs(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (value instanceof Date) {
        const t = value.getTime();
        return Number.isNaN(t) ? null : t;
    }
    if (typeof value.toMillis === 'function') {
        const t = value.toMillis();
        return Number.isFinite(t) ? t : null;
    }
    if (typeof value.toDate === 'function') {
        const d = value.toDate();
        const t = d instanceof Date ? d.getTime() : NaN;
        return Number.isNaN(t) ? null : t;
    }
    if (typeof value.seconds === 'number') {
        return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
    }
    if (typeof value === 'string') {
        const t = new Date(value).getTime();
        return Number.isNaN(t) ? null : t;
    }
    return null;
}

/** A reason the learner may be shown: trimmed, length-capped, no markup. */
export function normalizeReason(raw) {
    const text = String(raw === null || raw === undefined ? '' : raw)
        .replace(/[<>]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.slice(0, MAX_REASON_LENGTH);
}

/**
 * The state as the rest of the code wants it: plain numbers, sorted windows,
 * no Timestamps. Anything malformed degrades to "not in maintenance" rather
 * than throwing — a broken document must not take the platform down.
 */
export function normalizeState(raw, nowMs = Date.now()) {
    const doc = raw && typeof raw === 'object' ? raw : {};
    const startedAt = toMs(doc.startedAt);
    const active = doc.active === true && startedAt !== null;

    const windows = (Array.isArray(doc.windows) ? doc.windows : [])
        .map((w) => ({ start: toMs(w && w.start), end: toMs(w && w.end) }))
        .filter((w) => w.start !== null && w.end !== null && w.end > w.start)
        .sort((a, b) => a.start - b.start);

    return {
        active,
        version: Number.isFinite(Number(doc.version)) ? Number(doc.version) : 0,
        reason: normalizeReason(doc.reason),
        startedAt: active ? startedAt : null,
        updatedAt: toMs(doc.updatedAt),
        updatedBy: doc.updatedBy && typeof doc.updatedBy === 'object'
            ? { uid: String(doc.updatedBy.uid || ''), role: String(doc.updatedBy.role || '') }
            : null,
        windows,
        /* how long the CURRENT window has been running, 0 when it is off */
        currentMs: active ? Math.max(0, nowMs - startedAt) : 0,
        /* every closed window added up — for display, never for the clock */
        accumulatedMs: windows.reduce((sum, w) => sum + (w.end - w.start), 0)
    };
}

/** Windows including the one still open, clamped to now. */
export function effectiveWindows(state, nowMs = Date.now()) {
    const s = state && state.windows ? state : normalizeState(state, nowMs);
    const list = s.windows.slice();
    if (s.active && s.startedAt !== null && nowMs > s.startedAt) {
        list.push({ start: s.startedAt, end: nowMs });
    }
    return list.sort((a, b) => a.start - b.start);
}

/** How much of [fromMs, toMs] a single window covers. */
function overlap(windowStart, windowEnd, fromMs, toMs) {
    const lo = Math.max(windowStart, fromMs);
    const hi = Math.min(windowEnd, toMs);
    return hi > lo ? hi - lo : 0;
}

/**
 * The paid time a subscription must be given back, in milliseconds.
 *
 * `subscription` is the user document's subscription object: { startAt, endAt,
 * updatedAt }. A subscription with no end date is perpetual and is credited
 * nothing — adding days to a lifetime plan would turn it into a timed one,
 * which is the same rule account-freeze.js keeps.
 */
export function maintenanceCreditMs(subscription, state, nowMs = Date.now()) {
    const endAt = toMs(subscription && subscription.endAt);
    if (endAt === null) return 0;

    /* The lower bound is when this paid period began. Older records predate
       subscription.startAt; updatedAt is the next best witness, and with
       neither the period gets no credit rather than a guess. */
    const startAt = toMs(subscription && subscription.startAt);
    const fallback = toMs(subscription && subscription.updatedAt);
    const from = startAt !== null ? startAt : (fallback !== null ? fallback : endAt);

    let end = endAt;
    for (const w of effectiveWindows(state, nowMs)) {
        /* oldest first, against the end as it stands after earlier credits */
        end += overlap(w.start, w.end, from, end);
    }
    return end - endAt;
}

/** When the paid period really ends, once maintenance is discounted. */
export function effectiveEndAtMs(subscription, state, nowMs = Date.now()) {
    const endAt = toMs(subscription && subscription.endAt);
    if (endAt === null) return null;
    return endAt + maintenanceCreditMs(subscription, state, nowMs);
}

/** Does this role keep using the platform while maintenance is on? */
export function bypassesMaintenance(role) {
    return String(role || '').trim().toLowerCase() === MAINTENANCE_ROLE;
}

/** Everything safe to hand an anonymous visitor. */
export function publicState(state, nowMs = Date.now()) {
    const s = state && state.windows ? state : normalizeState(state, nowMs);
    return {
        active: s.active,
        version: s.version,
        reason: s.reason,
        startedAt: s.startedAt,
        currentMs: s.currentMs
        /* windows and updatedBy are deliberately absent: a visitor needs to
           know THAT the platform is off, not who took it off or how the paid
           time is being accounted. The endpoint adds them for signed-in staff. */
    };
}
