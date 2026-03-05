import { normalizeRole } from './roles.js';

const PRIVILEGED_ROLES = new Set(['developer', 'admin']);

export function isPrivilegedRole(profileOrRole) {
    const role = typeof profileOrRole === 'string'
        ? normalizeRole(profileOrRole)
        : normalizeRole(profileOrRole?.role);

    return PRIVILEGED_ROLES.has(role);
}

export function isModeratorBypassEnabled(profile) {
    if (normalizeRole(profile?.role) !== 'moderator') {
        return false;
    }

    if (String(process.env.MODERATOR_DEVICE_BYPASS || '').toLowerCase() === 'true') {
        return true;
    }

    return Boolean(profile?.deviceLimitBypass || profile?.paidAccessBypass || profile?.moderatorBypass);
}

export function shouldBypassDeviceLimit(profile) {
    return isPrivilegedRole(profile) || isModeratorBypassEnabled(profile);
}
