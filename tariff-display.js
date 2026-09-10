/**
 * tariff-display.js — THE single place that turns a stored tariff into the
 * name a person reads.
 *
 * ---------------------------------------------------------------------------
 * THERE IS ONE PAID PLAN, AND IT IS CALLED PREMIUM
 * ---------------------------------------------------------------------------
 * The platform used to sell four: STARTER shown as START, START shown as
 * STANDART, TURBO and PREMIUM. It now sells one. Every paying account is on
 * PREMIUM, whatever its subscription document happens to say.
 *
 * That distinction matters, because the documents still say the old things.
 * A migration rewrites them (scripts/migrate_tariffs.cjs), but a learner must
 * not see STANDART for the minutes — or days — between the code shipping and
 * the migration finishing, and a document written by some path nobody
 * remembered must not reintroduce an old name later. So the READ is normalised
 * here as well as at the source: anything that represents a paid plan is shown
 * as PREMIUM, and the storage is brought into line separately.
 *
 *     stored                       shown to a person
 *     STARTER / START / TURBO  →   PREMIUM      the plans that no longer exist
 *     STANDART / STANDARD      →   PREMIUM      old labels, seen in old data
 *     GOLD / PLATINUM          →   PREMIUM      older still
 *     PREMIUM                  →   PREMIUM
 *     null / '' (no plan)      →   the fallback the caller passed
 *
 * Anything genuinely unrecognised is returned as it came — a DEVELOPER account
 * or a one-off arrangement should show its real name rather than be relabelled
 * into a plan nobody sold it. The function never throws and never returns
 * `undefined` for a value it was given.
 */

/** The one paid plan. */
export const CANONICAL_TARIFF = 'PREMIUM';

/**
 * Stored values that mean "this account is on the paid plan".
 *
 * Kept as an explicit list rather than "anything that is not null", so an
 * unfamiliar value is shown as itself and noticed, instead of being quietly
 * absorbed into PREMIUM.
 */
export const LEGACY_PAID_TARIFFS = Object.freeze([
    'STARTER', 'START', 'STANDART', 'STANDARD', 'TURBO', 'GOLD', 'PLATINUM'
]);

const LEGACY = new Set(LEGACY_PAID_TARIFFS);

/** Does this stored value represent the paid plan under any of its old names? */
export function isPaidTariff(rawTariff) {
    if (rawTariff == null) return false;
    const raw = String(rawTariff).trim().toUpperCase();
    if (!raw) return false;
    return raw === CANONICAL_TARIFF || LEGACY.has(raw);
}

/**
 * The label for a stored tariff.
 *
 * @param {*} rawTariff the value as stored (any type; null/undefined are fine)
 * @param {string} [fallback] returned only when there is no value at all
 * @returns {string} PREMIUM for any paid plan, the original value otherwise
 */
export function getTariffDisplayName(rawTariff, fallback = '') {
    if (rawTariff == null) return fallback;
    const raw = String(rawTariff).trim();
    if (!raw) return fallback;
    return isPaidTariff(raw) ? CANONICAL_TARIFF : raw;
}

/** The stored value the site issues. There is exactly one. */
export const TARIFF_STORED_VALUES = [CANONICAL_TARIFF];
