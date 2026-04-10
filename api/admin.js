import { handleCors, sendJson } from './_lib/request.js';

/**
 * POST /api/admin?action=<action>
 *
 * Single router for all admin endpoints (consolidation for Vercel Hobby ≤12 limit).
 * Query param "action" maps to the handler file in _admin/.
 */

const ACTIONS = {
    'adjust-subscription-days': () => import('./_admin/adjust-subscription-days.js'),
    'clear-devices':            () => import('./_admin/clear-devices.js'),
    'create-user':              () => import('./_admin/create-user.js'),
    'delete-user':              () => import('./_admin/delete-user.js'),
    'list-users':               () => import('./_admin/list-users.js'),
    'reset-password':           () => import('./_admin/reset-password.js'),
    'set-role':                 () => import('./_admin/set-role.js'),
    'set-subscription':         () => import('./_admin/set-subscription.js'),
    'stats':                    () => import('./_admin/stats.js'),
    'unblock-user':             () => import('./_admin/unblock-user.js'),
};

export default async function handler(req, res) {
    if (handleCors(req, res, ['POST', 'GET'])) return;

    const action = (req.query?.action || '').trim();

    if (!action || !ACTIONS[action]) {
        return sendJson(res, 400, {
            error: 'Missing or invalid "action" query parameter',
            validActions: Object.keys(ACTIONS),
        });
    }

    try {
        const mod = await ACTIONS[action]();
        return mod.default(req, res);
    } catch (err) {
        console.error(`admin router error [${action}]:`, err);
        return sendJson(res, 500, { error: 'Internal server error' });
    }
}
