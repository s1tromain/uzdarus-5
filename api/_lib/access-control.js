import { normalizeRole } from './roles.js';

const PRIVILEGED_ROLES = new Set(['developer', 'admin']);

export function isPrivilegedRole(profileOrRole) {
    const role = typeof profileOrRole === 'string'
        ? normalizeRole(profileOrRole)
        : normalizeRole(profileOrRole?.role);

    return PRIVILEGED_ROLES.has(role);
}

export function shouldBypassDeviceLimit(profile) {
    return isPrivilegedRole(profile);
}
