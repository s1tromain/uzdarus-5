import { initAdmin } from '../_firebaseAdmin.js';
import { normalizeRole, isRoleAtLeast, canManageRole } from './roles.js';

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
    const role = normalizeRole(profile.role || decoded.role);

    return {
        uid: decoded.uid,
        decoded,
        role,
        profile,
        profileRef
    };
}

export function requireRole(session, minimumRole) {
    if (!isRoleAtLeast(session.role, minimumRole)) {
        throw Object.assign(new Error('Access denied'), { statusCode: 403 });
    }
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
    const statusCode = allowedStatuses.has(requestedStatus) ? requestedStatus : 500;
    const message = error?.message || 'Unexpected server error';

    if (statusCode >= 500) {
        console.error('[API_ERROR]', error);
    } else {
        console.error(`[API_${statusCode}]`, message);
    }

    sendJson(res, statusCode, { error: message });
}
