import { initAdmin } from '../_firebaseAdmin.js';
import {
    normalizeRole,
    isRoleAtLeast,
    canManageRole,
    roleHasCapability,
    assertKnownCapability,
    capabilitiesForRole
} from './roles.js';

export function sendJson(res, statusCode, payload) {
    res.status(statusCode).json(payload);
}

export function handleCors(req, res, allowedMethods = ['POST']) {
    const methods = Array.from(new Set([...allowedMethods, 'OPTIONS']));

    if (typeof res.setHeader === 'function') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
    }

    if (req.method === 'OPTIONS') {
        if (typeof res.status === 'function') {
            res.status(204);
        }

        if (typeof res.end === 'function') {
            res.end();
        } else if (typeof res.json === 'function') {
            res.json({ ok: true });
        }

        return true;
    }

    return false;
}

export function assertMethod(req, res, method) {
    if (req.method !== method) {
        sendJson(res, 405, { error: `Method ${req.method} not allowed` });
        return false;
    }

    return true;
}

export async function readBody(req) {
    if (req.body && typeof req.body === 'object') {
        return req.body;
    }

    if (typeof req.body === 'string' && req.body.length > 0) {
        try {
            return JSON.parse(req.body);
        } catch (error) {
            throw Object.assign(new Error('Invalid JSON body'), { statusCode: 400 });
        }
    }

    if (req.body != null && typeof req.body !== 'string' && typeof req.body !== 'object') {
        throw Object.assign(new Error('Invalid request body'), { statusCode: 400 });
    }

    return {};
}

export async function requireSession(req) {
    const authHeader = req.headers.authorization || req.headers.Authorization || '';

    if (!authHeader.toLowerCase().startsWith('bearer ')) {
        throw Object.assign(new Error('Authorization token required'), { statusCode: 401 });
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
        throw Object.assign(new Error('Invalid token'), { statusCode: 401 });
    }

    const { adminAuth, adminDb } = initAdmin();

    let decoded;
    try {
        decoded = await adminAuth.verifyIdToken(token, true);
    } catch (error) {
        throw Object.assign(new Error('Invalid or expired authorization token'), { statusCode: 401 });
    }

    const profileRef = adminDb.collection('users').doc(decoded.uid);
    const profileSnap = await profileRef.get();

    if (!profileSnap.exists) {
        throw Object.assign(new Error('User profile not found'), { statusCode: 403 });
    }

    const profile = profileSnap.data() || {};
    const claimsRole = decoded?.role ? normalizeRole(decoded.role) : null;
    const profileRole = normalizeRole(profile.role);

    /* ------------------------------------------------------------------ *
     * THE FIRESTORE PROFILE IS AUTHORITATIVE.
     * ------------------------------------------------------------------
     * Previously this was `claimsRole || profileRole`, i.e. the custom
     * claim baked into the ID token OUTRANKED the live profile. Because a
     * role change only rewrites the claim for FUTURE tokens, a user
     * demoted from admin -> teacher kept full admin mutation rights for
     * the remaining lifetime of their current token (up to ~1 hour).
     *
     * The profile document is read on every request anyway (just above),
     * so using it as the source of truth costs nothing and makes a
     * downgrade effective immediately. The claim is still surfaced for
     * diagnostics and so callers can detect a stale token.
     * ------------------------------------------------------------------ */
    const role = profileRole;
    const roleClaimStale = Boolean(claimsRole && claimsRole !== profileRole);

    return {
        uid: decoded.uid,
        decoded,
        role,
        claimsRole,
        profileRole,
        roleClaimStale,
        blocked: profile.blocked === true,
        profile,
        profileRef
    };
}

export function requireRole(session, minimumRole) {
    if (!isRoleAtLeast(session.role, minimumRole)) {
        throw Object.assign(new Error('Access denied'), { statusCode: 403 });
    }
}

/**
 * THE authorization guard for every admin-surface endpoint.
 *
 * Checks, in order:
 *   1. the capability is a real one (typo in a guard = loud failure, not a
 *      silent allow);
 *   2. the account is not blocked — a blocked staff member loses the admin
 *      surface immediately, even with a valid unexpired token;
 *   3. the role (resolved from the AUTHORITATIVE Firestore profile) holds
 *      the capability.
 *
 * Blocked-account enforcement lives here rather than in requireSession()
 * so that non-admin endpoints (tts, certificate, speech-token, …) keep
 * their existing behaviour untouched.
 */
export function requireCapability(session, capability) {
    assertKnownCapability(capability);

    if (session?.blocked) {
        throw Object.assign(new Error('Account is blocked'), { statusCode: 403 });
    }

    if (!roleHasCapability(session?.role, capability)) {
        throw Object.assign(new Error('Access denied'), { statusCode: 403 });
    }
}

/** Capability list for the authenticated session — drives the client UI. */
export function sessionCapabilities(session) {
    if (session?.blocked) {
        return [];
    }
    return capabilitiesForRole(session?.role);
}

export function requireManagePermission(session, targetRole) {
    if (!canManageRole(session.role, targetRole)) {
        throw Object.assign(new Error('Role hierarchy violation'), { statusCode: 403 });
    }
}

export function safeError(res, error) {
    const allowedStatuses = new Set([400, 401, 403, 404, 405, 409]);
    const authError = typeof error?.code === 'string' && error.code.startsWith('auth/');
    const requestedStatus = error?.statusCode || (authError ? 401 : null);
    const isWhitelisted = allowedStatuses.has(requestedStatus);
    const statusCode = isWhitelisted ? requestedStatus : 400;
    const message = isWhitelisted
        ? (error?.message || (statusCode === 400 ? 'Noto‘g‘ri so‘rov' : 'Kirish rad etildi'))
        : 'So‘rovni bajarib bo‘lmadi';

    if (isWhitelisted) {
        console.error(`[API_${statusCode}]`, message);
    } else {
        console.error('[API_UNEXPECTED]', error);
    }

    sendJson(res, statusCode, { error: message });
}
