import { initAdmin } from '../_firebaseAdmin.js';
import { normalizeRole, isSupportedRoleInput } from './roles.js';
import { FREEZE_FIELD, isAccountFrozen, getFreezeState } from '../../account-freeze.js';

const VALID_PACKS = new Set(['A1A2', 'B1B2']);

// Legacy plan names → current plan names.
// Existing users on GOLD/PLATINUM are transparently mapped on every read/write.
/**
 * THERE IS ONE PAID PLAN AND IT IS CALLED PREMIUM.
 *
 * The platform used to sell four. Every one of the old names still exists in
 * subscription documents written before the change, and scripts/migrate_tariffs
 * rewrites them — but a read must not wait for that. Anything below is a paid
 * plan under an older name and reads as PREMIUM immediately, so no account
 * loses its plan, or shows an old one, in the window between the code shipping
 * and the migration finishing. Running the migration afterwards changes what is
 * stored, never what anyone sees.
 *
 * The list is explicit on purpose. "Anything that is not null is PREMIUM" would
 * quietly absorb a value nobody intended — a DEVELOPER account, a one-off
 * arrangement — into a plan it was never sold.
 */
const LEGACY_PAID_TARIFFS = new Set([
    'STARTER', 'START', 'STANDART', 'STANDARD', 'TURBO', 'GOLD', 'PLATINUM'
]);

export const CANONICAL_TARIFF = 'PREMIUM';

/** Does this stored value mean "on the paid plan", under any of its names? */
export function isPaidTariff(rawTariff) {
    if (rawTariff == null) return false;
    const value = String(rawTariff).trim().toUpperCase();
    if (!value) return false;
    return value === CANONICAL_TARIFF || LEGACY_PAID_TARIFFS.has(value);
}

/**
 * The tariff as the rest of the system should see it.
 *
 * `null` stays `null`: an account with no plan has no plan, and turning that
 * into PREMIUM would hand a free or demo account a paid one. Only a value that
 * already meant "paid" is normalised.
 */
export function normalizeTariff(rawTariff) {
    if (rawTariff == null) {
        return rawTariff;
    }

    const value = String(rawTariff).trim().toUpperCase();
    if (!value) {
        return rawTariff;
    }

    return isPaidTariff(value) ? CANONICAL_TARIFF : value;
}

/**
 * What to STORE for a subscription that is being written now.
 *
 * The admin form no longer offers a choice, but a hand-made request still can:
 * this is what makes `{"tariff":"TURBO"}` posted with curl come back PREMIUM.
 * An inactive subscription stores no tariff at all.
 */
export function canonicalTariffForWrite(active) {
    return active ? CANONICAL_TARIFF : null;
}

export function normalizeUsername(rawValue) {
    return String(rawValue || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '.')
        .replace(/[^a-z0-9._-]/g, '');
}

export function usernameToEmail(username) {
    const clean = normalizeUsername(username);
    if (!clean) {
        throw Object.assign(new Error('Username is required'), { statusCode: 400 });
    }

    return `${clean}@uzdarus.local`;
}

export function normalizePacks(rawPacks) {
    if (!Array.isArray(rawPacks)) {
        return [];
    }

    return rawPacks.filter((pack) => VALID_PACKS.has(pack));
}

export function toDate(value) {
    if (!value) {
        return null;
    }

    if (typeof value?.toDate === 'function') {
        return value.toDate();
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function resolveUsername(data = {}) {
    const fromUsername = normalizeUsername(data.username);
    if (fromUsername) {
        return fromUsername;
    }

    return normalizeUsername(data.login);
}

function hasRecordId(userId, data = {}) {
    if (String(userId || '').trim()) {
        return true;
    }

    return String(data.uid || data.docId || '').trim().length > 0;
}

export function normalizeUserDocument(userId, data = {}) {
    if (!data || typeof data !== 'object') {
        return null;
    }

    if (!hasRecordId(userId, data)) {
        return null;
    }

    const username = resolveUsername(data);
    if (!username || username === '-') {
        return null;
    }

    if (!isSupportedRoleInput(data.role)) {
        return null;
    }

    const role = normalizeRole(data.role);
    const uid = String(userId || data.uid || data.docId || '').trim();

    if (!uid) {
        return null;
    }

    const subscription = data.subscription && typeof data.subscription === 'object'
        ? {
            ...data.subscription,
            tariff: normalizeTariff(data.subscription.tariff)
        }
        : {};

    return {
        uid,
        username,
        displayName: String(data.displayName || '').trim() || username,
        email: String(data.email || '').trim(),
        role,
        blocked: Boolean(data.blocked),
        blockedReason: data.blockedReason || null,
        /* Carried verbatim so downstream readers can call isAccountFrozen() on
           a normalized document exactly as they would on the raw one. */
        [FREEZE_FIELD]: data[FREEZE_FIELD] || null,
        forcePasswordChange: Boolean(data.forcePasswordChange),
        accessPacks: normalizePacks(data.accessPacks),
        deviceHashes: Array.isArray(data.deviceHashes) ? data.deviceHashes.filter(Boolean) : [],
        subscription,
        updatedAt: data.updatedAt || null
    };
}

export function isValidUserDocument(userId, data = {}) {
    return Boolean(normalizeUserDocument(userId, data));
}

function resolveEndDate({ active, durationDays, endAt }) {
    if (!active) {
        return null;
    }

    if (endAt) {
        const parsed = new Date(endAt);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }

    const days = Number(durationDays);
    if (!Number.isNaN(days) && days > 0) {
        const result = new Date();
        result.setDate(result.getDate() + days);
        return result;
    }

    return null;
}

export function buildSubscription(input = {}) {
    const { Timestamp } = initAdmin();
    const active = Boolean(input.active);
    const endDate = resolveEndDate(input);

    const isActive = active && Boolean(endDate);
    return {
        active: isActive,
        /* THE SERVER DECIDES THE PLAN, NOT THE CALLER. Whatever arrives in the
           request — an old name, a made-up one, nothing at all — an active
           subscription is stored as PREMIUM, because that is the only plan the
           platform sells. */
        tariff: canonicalTariffForWrite(isActive),
        startAt: active ? Timestamp.now() : null,
        endAt: endDate ? Timestamp.fromDate(endDate) : null,
        updatedAt: Timestamp.now()
    };
}

export function toPublicUser(userId, data = {}) {
    const normalized = normalizeUserDocument(userId, data);
    if (!normalized) {
        return null;
    }

    const subscription = normalized.subscription || {};
    /* The freeze state travels with the user record the admin panel already
       fetches — no extra request and no listener just to know a row is frozen. */
    const freeze = getFreezeState(normalized);

    return {
        uid: normalized.uid,
        username: normalized.username,
        displayName: normalized.displayName,
        email: normalized.email,
        role: normalized.role,
        blocked: normalized.blocked,
        frozen: isAccountFrozen(normalized),
        freeze: freeze
            ? {
                frozenAt: freeze.frozenAt ? freeze.frozenAt.toISOString() : null,
                frozenBy: freeze.frozenBy,
                reason: freeze.reason,
                freezeCount: freeze.freezeCount
            }
            : null,
        forcePasswordChange: normalized.forcePasswordChange,
        accessPacks: normalized.accessPacks,
        deviceCount: normalized.deviceHashes.length,
        subscription: {
            active: Boolean(subscription.active),
            tariff: subscription.tariff || null,
            endAt: subscription.endAt || null
        },
        updatedAt: normalized.updatedAt
    };
}
