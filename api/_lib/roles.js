/**
 * roles.js — THE single source of truth for roles, the management hierarchy
 * and the capability (permission) model.
 *
 * ---------------------------------------------------------------------------
 * WHY CAPABILITIES AND NOT JUST A LADDER
 * ---------------------------------------------------------------------------
 * Authorization used to be a purely linear ladder
 * (customer < moderator < admin < developer) checked with
 * requireRole(session, minimum). That worked while every role was strictly
 * more powerful than the one below it.
 *
 * The `teacher` role breaks that assumption: a teacher must READ student
 * analytics (which sat at the `moderator` rung) while being unable to
 * create, delete, block or edit anyone (which sat at the SAME rung). A
 * linear ladder cannot express "read-only" — placing teacher at moderator
 * level would hand it user deletion; placing it below would hide analytics.
 *
 * So authorization is now expressed as explicit CAPABILITIES. The ladder is
 * retained ONLY for the management hierarchy (who may act upon whom), which
 * is genuinely hierarchical.
 *
 * Rule of thumb when adding an endpoint: gate it with a capability, never
 * with a role name.
 */

/**
 * Management hierarchy. Used exclusively by canManageRole()/isRoleAtLeast()
 * to decide who may act upon whom — NOT for feature authorization.
 *
 * `teacher` sits above customer and below moderator: an admin may manage a
 * teacher account, and a teacher may manage nobody. Its numeric position
 * grants it NOTHING on its own; capabilities do that.
 */
export const ROLE_LEVEL = {
    customer: 0,
    teacher: 1,
    moderator: 2,
    admin: 3,
    developer: 4
};

const ROLE_ALIASES = {
    user: 'customer'
};

export const CANONICAL_ROLES = new Set(Object.keys(ROLE_LEVEL));

/** Roles that may open the admin panel at all. */
export const STAFF_ROLES = new Set(['teacher', 'moderator', 'admin', 'developer']);

/**
 * Every capability the admin surface can require. Keeping them enumerated
 * means a typo in an endpoint guard fails loudly (see assertKnownCapability)
 * instead of silently granting or denying access.
 */
export const CAPABILITIES = Object.freeze({
    PANEL_ACCESS:         'panel:access',
    STUDENTS_READ:        'students:read',
    STATS_READ:           'stats:read',
    USERS_READ:           'users:read',
    USERS_CREATE:         'users:create',
    USERS_DELETE:         'users:delete',
    USERS_BLOCK:          'users:block',
    USERS_PASSWORD:       'users:password',
    USERS_DEVICES:        'users:devices',
    SUBSCRIPTION_WRITE:   'subscription:write',
    ROLE_WRITE:           'role:write',
    CERTIFICATES_READ:    'certificates:read',
    CERTIFICATES_MIGRATE: 'certificates:migrate'
});

const ALL_CAPABILITIES = new Set(Object.values(CAPABILITIES));

/* Read-only educational analytics — the ENTIRE teacher surface. */
const TEACHER_CAPABILITIES = [
    CAPABILITIES.PANEL_ACCESS,
    CAPABILITIES.STUDENTS_READ
];

/* Everything moderator could do under the old ladder, stated explicitly so
   the previous behaviour is preserved exactly. */
const MODERATOR_CAPABILITIES = [
    ...TEACHER_CAPABILITIES,
    CAPABILITIES.STATS_READ,
    CAPABILITIES.USERS_READ,
    CAPABILITIES.USERS_CREATE,
    CAPABILITIES.USERS_DELETE,
    CAPABILITIES.USERS_BLOCK,
    CAPABILITIES.USERS_PASSWORD,
    CAPABILITIES.USERS_DEVICES,
    CAPABILITIES.CERTIFICATES_READ
];

const ADMIN_CAPABILITIES = [
    ...MODERATOR_CAPABILITIES,
    CAPABILITIES.SUBSCRIPTION_WRITE,
    CAPABILITIES.ROLE_WRITE
];

const DEVELOPER_CAPABILITIES = [
    ...ADMIN_CAPABILITIES,
    CAPABILITIES.CERTIFICATES_MIGRATE
];

/* Frozen ARRAYS, not Sets. Object.freeze() on a Set is cosmetic — the internal
   slots stay writable, so `ROLE_CAPABILITIES.teacher.add('users:delete')` would
   silently succeed and grant a teacher deletion rights for the rest of the
   process. A frozen array rejects mutation in strict mode (ES modules are
   always strict), which makes the grant table genuinely tamper-proof. */
export const ROLE_CAPABILITIES = Object.freeze({
    customer:  Object.freeze([]),
    teacher:   Object.freeze([...TEACHER_CAPABILITIES]),
    moderator: Object.freeze([...MODERATOR_CAPABILITIES]),
    admin:     Object.freeze([...ADMIN_CAPABILITIES]),
    developer: Object.freeze([...DEVELOPER_CAPABILITIES])
});

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

/** True when the role may open the admin panel in any capacity. */
export function isStaffRole(role) {
    return STAFF_ROLES.has(normalizeRole(role));
}

/** Guard against silently mistyped capability strings in endpoint guards. */
export function assertKnownCapability(capability) {
    if (!ALL_CAPABILITIES.has(capability)) {
        throw new Error(`Unknown capability: ${capability}`);
    }
    return capability;
}

/**
 * THE authorization primitive. Everything else (HTTP guards, UI gating)
 * derives from this one function, so there is exactly one answer to
 * "may this role do X".
 */
export function roleHasCapability(role, capability) {
    assertKnownCapability(capability);
    const caps = ROLE_CAPABILITIES[normalizeRole(role)];
    return Boolean(caps && caps.includes(capability));
}

/** The full capability list for a role — used to drive the client UI. */
export function capabilitiesForRole(role) {
    const caps = ROLE_CAPABILITIES[normalizeRole(role)];
    return caps ? caps.slice() : [];
}

/**
 * VISIBILITY: may `actorRole` see the account whose role is `targetRole`?
 *
 * This was copy-pasted identically into six endpoints (list-users, stats,
 * students-overview, student-analytics, list-user-certificates,
 * search-certificates). It now lives here once so a role addition cannot be
 * applied to five of six call sites.
 *
 * Behaviour for developer/admin/moderator is byte-for-byte what those copies
 * did. `teacher` is new: it may see LEARNERS ONLY and never another staff
 * account, so a teacher cannot enumerate admins through the analytics API.
 */
export function canViewUser(actorRole, actorUid, targetUid, targetRole) {
    const actor = normalizeRole(actorRole);
    const target = normalizeRole(targetRole);

    if (actor === 'developer') return true;
    if (actor === 'admin') return target !== 'developer';
    if (actor === 'moderator') return target === 'customer' || target === 'moderator' || actorUid === targetUid;
    if (actor === 'teacher') return target === 'customer';

    return false;
}

/**
 * Management hierarchy: may `actorRole` act upon an account whose role is
 * `targetRole`? Unchanged for the pre-existing roles; teacher is manageable
 * by admin/developer and can itself manage nobody.
 */
export function canManageRole(actorRole, targetRole) {
    const actor = normalizeRole(actorRole);
    const target = normalizeRole(targetRole);

    if (actor === 'developer') {
        return true;
    }

    if (actor === 'admin') {
        return target === 'moderator' || target === 'customer' || target === 'teacher';
    }

    if (actor === 'moderator') {
        return target === 'customer';
    }

    // teacher and customer manage nobody.
    return false;
}
