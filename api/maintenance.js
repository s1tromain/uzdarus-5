import {
    assertMethod,
    handleCors,
    readBody,
    requireSession,
    requireCapability,
    sendJson,
    safeError
} from './_lib/request.js';
import { CAPABILITIES, roleHasCapability } from './_lib/roles.js';
import { readMaintenance, setMaintenance } from './_lib/maintenance-store.js';
import { publicState, normalizeReason, bypassesMaintenance } from '../maintenance-state.js';
import { writeAuditLog } from './_lib/audit.js';

/**
 * /api/maintenance
 *
 *   GET  ?action=status   public — what every page asks before it paints
 *   POST ?action=set      developer only — turn the platform off and on
 *
 * The status read is deliberately open: the maintenance screen has to render
 * for a visitor who is not signed in, and the state says nothing private. The
 * WRITE is where the authority lives — a verified Firebase ID token, and the
 * maintenance capability, which only `developer` holds. Hiding the switch in
 * the admin panel's DOM is presentation; this is the rule.
 */
export default async function handler(req, res) {
    if (handleCors(req, res, ['GET', 'POST'])) return;

    const action = String(req.query?.action || 'status').trim();

    try {
        if (action === 'status') {
            /* assertMethod answers with 405 and returns false; it does not throw */
            if (!assertMethod(req, res, 'GET')) return;
            const state = await readMaintenance();
            /* never cached: a page that asks whether the platform is off must
               not be answered by a CDN copy from before it went off */
            res.setHeader('Cache-Control', 'no-store, max-age=0');

            const payload = publicState(state);

            /* WHO turned it off is an operational detail, not something to hand
               an anonymous visitor. Staff who are already signed in see it; the
               maintenance screen never needed it. A bad or missing token simply
               yields the public answer rather than an error, because this
               endpoint has to work for a visitor with no session at all. */
            try {
                const session = await requireSession(req);
                if (roleHasCapability(session.role, CAPABILITIES.PANEL_ACCESS)) {
                    payload.updatedBy = state.updatedBy;
                    payload.updatedAt = state.updatedAt;
                    payload.windows = state.windows.length;
                    payload.accumulatedMs = state.accumulatedMs;
                }
            } catch (error) { /* no session: the public answer stands */ }

            return sendJson(res, 200, { ok: true, maintenance: payload });
        }

        if (action === 'set') {
            if (!assertMethod(req, res, 'POST')) return;
            const session = await requireSession(req);
            requireCapability(session, CAPABILITIES.MAINTENANCE_WRITE);

            /* Belt and braces: the capability table already grants this to
               developer alone, and this says so a second time in the endpoint
               that can take the whole platform down. */
            if (!bypassesMaintenance(session.role)) {
                throw Object.assign(new Error('Access denied'), { statusCode: 403 });
            }

            const body = await readBody(req);
            const active = body?.active === true;
            const reason = normalizeReason(body?.reason);

            const actor = { uid: session.uid, role: session.role };
            const result = await setMaintenance({ active, reason, actor });
            const state = await readMaintenance();

            await writeAuditLog({
                action: active ? 'maintenance.enable' : 'maintenance.disable',
                actorUid: session.uid,
                actorRole: session.role,
                targetUid: null,
                details: { changed: result.changed, reason, version: state.version }
            }).catch(() => {});

            return sendJson(res, 200, {
                ok: true,
                changed: result.changed,
                maintenance: publicState(state)
            });
        }

        return sendJson(res, 400, {
            error: 'Missing or invalid "action" query parameter',
            validActions: ['status', 'set']
        });
    } catch (error) {
        return safeError(res, error);
    }
}
