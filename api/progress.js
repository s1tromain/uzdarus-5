import { handleCors, sendJson } from './_lib/request.js';

/**
 * POST /api/progress?action=<action>
 *
 * Router for the LEARNER's own authoritative progress operations. Separate from
 * /api/admin on purpose: these are things a customer does to their own record,
 * gated by their session, not staff capabilities. Adding them to the admin
 * router would have put customer traffic behind an admin capability check and
 * dragged them into the RBAC surface, which is not what they are.
 *
 * Consolidated behind one function to stay inside the Vercel Hobby limit, the
 * same pattern api/admin.js already uses.
 */
const ACTIONS = {
    'complete-topic': () => import('./_progress/complete-topic.js'),
    'final-exam':     () => import('./_progress/final-exam.js')
};

export default async function handler(req, res) {
    if (handleCors(req, res, ['POST'])) return;

    const action = (req.query?.action || '').trim();

    if (!action || !ACTIONS[action]) {
        return sendJson(res, 400, {
            error: 'Missing or invalid "action" query parameter',
            validActions: Object.keys(ACTIONS)
        });
    }

    try {
        const mod = await ACTIONS[action]();
        return mod.default(req, res);
    } catch (err) {
        console.error(`progress router error [${action}]:`, err);
        return sendJson(res, 500, { error: 'Internal server error' });
    }
}
