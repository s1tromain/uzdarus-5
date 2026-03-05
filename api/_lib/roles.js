export const ROLE_LEVEL = {
    customer: 0,
    moderator: 1,
    admin: 2,
    developer: 3
};

const ROLE_ALIASES = {
    user: 'customer'
};

export const CANONICAL_ROLES = new Set(Object.keys(ROLE_LEVEL));

export function normalizeRole(role) {
    const value = String(role || '').trim().toLowerCase();
    const canonical = ROLE_ALIASES[value] || value;
    return Object.prototype.hasOwnProperty.call(ROLE_LEVEL, canonical) ? canonical : 'customer';
}

export function isCanonicalRole(role) {
    return CANONICAL_ROLES.has(normalizeRole(role));
}

export function isSupportedRoleInput(role) {
    const value = String(role || '').trim().toLowerCase();
    return value === 'user' || Object.prototype.hasOwnProperty.call(ROLE_LEVEL, value);
}

export function isRoleAtLeast(role, minimumRole) {
    const roleValue = ROLE_LEVEL[normalizeRole(role)];
    const minimumValue = ROLE_LEVEL[normalizeRole(minimumRole)];
    return roleValue >= minimumValue;
}

export function canManageRole(actorRole, targetRole) {
    const actor = normalizeRole(actorRole);
    const target = normalizeRole(targetRole);

    if (actor === 'developer') {
        return true;
    }

    if (actor === 'admin') {
        return target === 'moderator' || target === 'customer';
    }

    if (actor === 'moderator') {
        return target === 'customer';
    }

    return false;
}
