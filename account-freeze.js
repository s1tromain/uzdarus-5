/**
 * account-freeze.js — THE single source of truth for account freezing.
 *
 * ---------------------------------------------------------------------------
 * WHAT A FREEZE IS
 * ---------------------------------------------------------------------------
 * A frozen account keeps everything it has paid for and loses access while the
 * freeze lasts. The paid days do not burn: the time spent frozen is added back
 * to the subscription when the account is unfrozen, so a learner who had 15
 * days left when they were frozen still has 15 days left afterwards, whenever
 * "afterwards" happens to be.
 *
 * Freezing is NOT blocking and NOT expiry. The three are distinct states with
 * distinct causes and distinct messages:
 *
 *     blocked   punitive, set by staff or by the device-limit guard; time keeps
 *               running; the learner is told to contact moderation
 *     expired   the subscription simply ran out
 *     frozen    a deliberate pause; time is preserved; the learner is told the
 *               remaining time is safe
 *
 * Conflating them is how a paying customer gets told "your subscription has
 * ended" about a subscription that has not ended, so `reason: 'frozen'` is
 * carried all the way to the screen the learner sees.
 *
 * ---------------------------------------------------------------------------
 * WHY THE ELAPSED TIME IS MEASURED, NOT THE REMAINING TIME
 * ---------------------------------------------------------------------------
 * Two designs preserve the paid period:
 *
 *   A. remember how much was LEFT at freeze time, and on unfreeze set
 *      endAt = now + remaining
 *   B. remember WHEN the freeze started, and on unfreeze shift the CURRENT
 *      endAt forward by however long the freeze lasted
 *
 * B is implemented here, because A silently discards anything an admin did
 * while the account was frozen. If a subscription is extended by 30 days or
 * moved to another tariff mid-freeze, A restores a stale figure and the 30 days
 * vanish; B shifts whatever endAt is live at that moment, so the extension
 * survives. Nothing about the user is ever snapshotted and restored.
 *
 * ---------------------------------------------------------------------------
 * PERPETUAL SUBSCRIPTIONS
 * ---------------------------------------------------------------------------
 * A subscription with no end date has nothing to shift: adding dates to it
 * would convert it into an ordinary timed subscription, which is exactly what
 * must not happen. Such an account freezes and unfreezes with its subscription
 * object untouched — the freeze only gates access. This is the "lifetime stays
 * lifetime" rule, expressed as a property of the DATA rather than as a check
 * against a tariff name, so it holds for whatever a perpetual plan is called.
 *
 * ---------------------------------------------------------------------------
 * RUNTIME
 * ---------------------------------------------------------------------------
 * This module is imported by the browser (firebase-client.js, adminpanel.js)
 * AND by the serverless admin endpoints, so it must stay dependency-free and
 * must never touch `firebase-admin`, the DOM, or `window`. It computes plain
 * values; turning a Date into a Firestore Timestamp is the caller's job.
 */

/** Field on the user document that holds the whole freeze state. */
export const FREEZE_FIELD = 'accountFreeze';

/**
 * Normalise anything a date can arrive as: a Firestore Timestamp (client or
 * admin SDK), a Date, an ISO string, or epoch milliseconds.
 *
 * This exists here rather than reusing firebase-client's normalizeDate() or
 * api/_lib/user-helpers' toDate() because this module runs on both sides and
 * may import neither. It is deliberately the same three-line contract as both.
 */
export function toDateValue(value) {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value.toDate === 'function') {
        try {
            const converted = value.toDate();
            return Number.isNaN(converted.getTime()) ? null : converted;
        } catch (error) {
            return null;
        }
    }

    if (typeof value.seconds === 'number') {
        return new Date(value.seconds * 1000);
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * THE freeze predicate. Everything — access checks, the admin badge, analytics,
 * the learner's screen — asks this one question, so there is exactly one answer
 * to "is this account frozen".
 *
 * An account that has never been frozen has no `accountFreeze` field at all.
 * That reads as false, which is why no migration is needed: every account that
 * exists today is already correctly reported as not frozen.
 */
export function isAccountFrozen(user) {
    return Boolean(user && user[FREEZE_FIELD] && user[FREEZE_FIELD].frozen === true);
}

/** The freeze record itself, or null. Never returns a partially-formed object. */
export function getFreezeState(user) {
    if (!isAccountFrozen(user)) {
        return null;
    }

    const state = user[FREEZE_FIELD] || {};
    return {
        frozen: true,
        frozenAt: toDateValue(state.frozenAt),
        frozenBy: state.frozenBy || null,
        reason: typeof state.reason === 'string' && state.reason.trim() ? state.reason.trim() : null,
        freezeCount: Number(state.freezeCount) || 0,
        totalFrozenMs: Number(state.totalFrozenMs) || 0
    };
}

/** How long the account has been frozen so far, in ms. 0 when not frozen. */
export function frozenDurationMs(user, now = new Date()) {
    const state = getFreezeState(user);
    if (!state || !state.frozenAt) {
        return 0;
    }

    /* Clamp: a clock that has gone backwards must never SHORTEN a subscription.
       The worst a skewed clock can do here is give away nothing. */
    return Math.max(0, now.getTime() - state.frozenAt.getTime());
}

export const MAX_REASON_LENGTH = 300;

/** Trim a free-text reason to something safe to store and render. */
export function normalizeFreezeReason(rawReason) {
    const text = String(rawReason == null ? '' : rawReason).trim().replace(/\s+/g, ' ');
    if (!text) {
        return null;
    }
    return text.slice(0, MAX_REASON_LENGTH);
}

/**
 * Build the freeze patch for a user document.
 *
 * Returns `{ applied: false }` when the account is ALREADY frozen. That is the
 * idempotency guarantee: pressing Freeze twice cannot produce a second
 * `frozenAt`, because a second `frozenAt` would erase the first freeze's
 * elapsed time and burn the days it was supposed to protect.
 *
 * @param {object} user   the current user document
 * @param {object} opts   { now, actorUid, reason }
 */
export function buildFreeze(user, opts = {}) {
    const now = opts.now instanceof Date ? opts.now : new Date();

    if (isAccountFrozen(user)) {
        return { applied: false, alreadyInState: true, freeze: null };
    }

    const previous = (user && user[FREEZE_FIELD]) || {};

    return {
        applied: true,
        alreadyInState: false,
        freeze: {
            frozen: true,
            frozenAt: now,
            frozenBy: opts.actorUid || null,
            reason: normalizeFreezeReason(opts.reason),
            /* Carried across freezes so the history is not lost when the record
               is overwritten. Both are audit data; neither is ever used to
               compute a date. */
            freezeCount: (Number(previous.freezeCount) || 0) + 1,
            totalFrozenMs: Number(previous.totalFrozenMs) || 0,
            lastUnfrozenAt: toDateValue(previous.lastUnfrozenAt),
            lastUnfrozenBy: previous.lastUnfrozenBy || null
        }
    };
}

/**
 * Build the unfreeze patch, including the shifted subscription.
 *
 * Returns `{ applied: false }` when the account is NOT frozen. This is what
 * makes a double unfreeze safe: the second call sees `frozen: false` and
 * returns a patch that changes no date. Run inside a Firestore transaction, it
 * also makes two admins unfreezing simultaneously safe — the second
 * transaction re-reads a document that is already thawed and shifts nothing.
 *
 * @param {object} user   the current user document
 * @param {object} opts   { now, actorUid }
 * @returns {{
 *   applied: boolean,
 *   alreadyInState: boolean,
 *   frozenMs: number,
 *   freeze: object|null,
 *   subscription: {endAt: Date, active: boolean}|null,
 *   previousEndAt: Date|null
 * }}  `subscription` is null when there is nothing to shift — an account with
 *     no end date keeps its subscription object exactly as it is.
 */
export function buildUnfreeze(user, opts = {}) {
    const now = opts.now instanceof Date ? opts.now : new Date();

    if (!isAccountFrozen(user)) {
        return {
            applied: false,
            alreadyInState: true,
            frozenMs: 0,
            freeze: null,
            subscription: null,
            previousEndAt: null
        };
    }

    const previous = (user && user[FREEZE_FIELD]) || {};
    const frozenMs = frozenDurationMs(user, now);

    const subscription = (user && user.subscription) || {};
    const previousEndAt = toDateValue(subscription.endAt);

    /* No end date means nothing to give back — a perpetual subscription must
       not acquire one. The freeze is lifted and the subscription is left alone. */
    let subscriptionPatch = null;
    if (previousEndAt) {
        const shifted = new Date(previousEndAt.getTime() + frozenMs);
        subscriptionPatch = {
            endAt: shifted,
            /* Never resurrect a subscription an admin switched off during the
               freeze: `active` can only stay true, never become true. */
            active: Boolean(subscription.active) && shifted.getTime() > now.getTime()
        };
    }

    return {
        applied: true,
        alreadyInState: false,
        frozenMs,
        freeze: {
            frozen: false,
            frozenAt: null,
            frozenBy: null,
            reason: null,
            freezeCount: Number(previous.freezeCount) || 0,
            totalFrozenMs: (Number(previous.totalFrozenMs) || 0) + frozenMs,
            lastUnfrozenAt: now,
            lastUnfrozenBy: opts.actorUid || null,
            lastFrozenAt: toDateValue(previous.frozenAt),
            lastFrozenBy: previous.frozenBy || null,
            lastReason: normalizeFreezeReason(previous.reason)
        },
        subscription: subscriptionPatch,
        previousEndAt
    };
}
