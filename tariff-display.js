/**
 * tariff-display.js — THE single place that turns a stored tariff into the
 * name a person reads.
 *
 * ---------------------------------------------------------------------------
 * WHY A STORED VALUE AND A LABEL ARE NOT THE SAME STRING
 * ---------------------------------------------------------------------------
 * The plan that costs 980 000 so'm has been stored as `START` since the day it
 * launched, and thousands of subscription documents say so. When a cheaper plan
 * was added below it, the site renamed the old one to STANDART and gave the new
 * one the name START.
 *
 * Rewriting the stored value would have been the obvious move and the wrong
 * one: every historical subscription, every admin record and every analytics
 * row would have silently changed which product it referred to. So the storage
 * contract was left exactly as it was and only the LABEL moved:
 *
 *     stored     shown to a person
 *     STARTER →  START        the new 560 000 plan
 *     START   →  STANDART     the original 980 000 plan, untouched in the data
 *     TURBO   →  TURBO
 *     PREMIUM →  PREMIUM
 *
 * This is deliberately NOT part of TARIFF_MIGRATION in api/_lib/user-helpers.js.
 * That map (GOLD → TURBO, PLATINUM → PREMIUM) rewrites a VALUE on read, because
 * those old names no longer exist anywhere. `START` still exists, still means
 * the 980 000 plan, and must keep round-tripping through the admin form. A
 * migration rule would break that; a display map cannot.
 *
 * Anything this file does not recognise is returned as it came — a DEVELOPER
 * account or a one-off plan should show its real name, not be hidden behind a
 * fallback. The function never throws and never returns `undefined` for a
 * value it was given.
 */

/** stored value → the name shown to a person. Storage is never changed. */
const TARIFF_DISPLAY_NAMES = {
    STARTER: 'START',
    START: 'STANDART'
};

/**
 * The label for a stored tariff.
 *
 * @param {*} rawTariff the value as stored (any type; null/undefined are fine)
 * @param {string} [fallback] returned only when there is no value at all
 * @returns {string} the display name, the original value, or the fallback
 */
export function getTariffDisplayName(rawTariff, fallback = '') {
    if (rawTariff == null) return fallback;
    const raw = String(rawTariff).trim();
    if (!raw) return fallback;
    /* Matching is case-insensitive so a legacy lowercase value still gets its
       label, but an unrecognised value keeps the exact text it was stored with. */
    return TARIFF_DISPLAY_NAMES[raw.toUpperCase()] || raw;
}

/** The stored values the site currently issues, newest plan first. */
export const TARIFF_STORED_VALUES = ['STARTER', 'START', 'TURBO', 'PREMIUM'];

export { TARIFF_DISPLAY_NAMES };
