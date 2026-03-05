import { initAdmin } from '../_firebaseAdmin.js';
import { normalizeRole, isSupportedRoleInput } from './roles.js';

const VALID_PACKS = new Set(['A1A2', 'B1B2']);

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

    return {
        uid,
        username,
        displayName: String(data.displayName || '').trim() || username,
        email: String(data.email || '').trim(),
        role,
        blocked: Boolean(data.blocked),
        blockedReason: data.blockedReason || null,
        forcePasswordChange: Boolean(data.forcePasswordChange),
        accessPacks: normalizePacks(data.accessPacks),
        deviceHashes: Array.isArray(data.deviceHashes) ? data.deviceHashes.filter(Boolean) : [],
        subscription: data.subscription && typeof data.subscription === 'object'
            ? data.subscription
            : {},
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

    return {
        active: active && Boolean(endDate),
        tariff: input.tariff || null,
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

    return {
        uid: normalized.uid,
        username: normalized.username,
        displayName: normalized.displayName,
        email: normalized.email,
        role: normalized.role,
        blocked: normalized.blocked,
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
