/**
 * admin-roles.js — BROWSER-SIDE MIRROR of the server capability model.
 *
 * ---------------------------------------------------------------------------
 * WHY A MIRROR AND NOT A DIRECT IMPORT
 * ---------------------------------------------------------------------------
 * `api/_lib/roles.js` is the authoritative model, but vercel.json rewrites
 * `/api/(.*)` to serverless functions, so the browser cannot import that file
 * as a static module. Rather than invent a second, drifting definition (the
 * exact problem this refactor set out to remove), this file is a declared
 * mirror whose equality with the server model is asserted by
 * `tests/admin/rbac.test.cjs`. If anyone edits one side only, that test fails.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE IS NOT SECURITY
 * ---------------------------------------------------------------------------
 * Everything here exists to decide what to RENDER. Authorization happens
 * server-side in `requireCapability()` on every endpoint. A user who edits
 * these values in DevTools changes only their own cosmetics: the API still
 * returns 403.
 */

export const ROLE_LEVEL = {
    customer: 0,
    teacher: 1,
    moderator: 2,
    admin: 3,
    developer: 4
};

export const STAFF_ROLES = new Set(['teacher', 'moderator', 'admin', 'developer']);

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

const TEACHER_CAPABILITIES = [
    CAPABILITIES.PANEL_ACCESS,
    CAPABILITIES.STUDENTS_READ
];

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

const ROLE_ALIASES = { user: 'customer' };

export function normalizeRole(role) {
    const value = String(role || '').trim().toLowerCase();
    const canonical = ROLE_ALIASES[value] || value;
    return Object.prototype.hasOwnProperty.call(ROLE_LEVEL, canonical) ? canonical : 'customer';
}

export function isStaffRole(role) {
    return STAFF_ROLES.has(normalizeRole(role));
}

export function roleHasCapability(role, capability) {
    const caps = ROLE_CAPABILITIES[normalizeRole(role)];
    return Boolean(caps && caps.includes(capability));
}

export function capabilitiesForRole(role) {
    const caps = ROLE_CAPABILITIES[normalizeRole(role)];
    return caps ? caps.slice() : [];
}

export function canManageRole(actorRole, targetRole) {
    const actor = normalizeRole(actorRole);
    const target = normalizeRole(targetRole);

    if (actor === 'developer') return true;
    if (actor === 'admin') return target === 'moderator' || target === 'customer' || target === 'teacher';
    if (actor === 'moderator') return target === 'customer';
    return false;
}

/** Uzbek UI labels for every role. */
export const ROLE_LABELS = Object.freeze({
    customer:  'O‘quvchi',
    teacher:   'O‘qituvchi',
    moderator: 'Moderator',
    admin:     'Administrator',
    developer: 'Developer'
});

export function roleLabel(role) {
    return ROLE_LABELS[normalizeRole(role)] || ROLE_LABELS.customer;
}
