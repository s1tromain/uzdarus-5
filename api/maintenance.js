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
import { readMaintenance, readAllWindows, setMaintenance } from './_lib/maintenance-store.js';
import {
    publicState,
    normalizeReason,
    bypassesMaintenance,
    maintenanceCreditMs
} from '../maintenance-state.js';
import { writeAuditLog } from './_lib/audit.js';

/**
 * /api/maintenance
 *
 *   GET  ?action=status   public — what every page asks before it paints
 *   POST ?action=session  signed in — may I keep using the platform, and how
 *                         much paid time do I get back
 *   POST ?action=set      developer only — turn the platform off and on
 *
 * The status read is deliberately open: the maintenance screen has to render
 * for a visitor who is not signed in, and the state says nothing private. The
 * WRITE is where the authority lives — a verified Firebase ID token, and the
 * maintenance capability, which only `developer` holds. Hiding the switch in
 * the admin panel's DOM is presentation; this is the rule.
 *
 * ---------------------------------------------------------------------------
 * WHY `session` EXISTS
 * ---------------------------------------------------------------------------
 * The gate used to decide who may keep using the platform by reading the role
 * out of localStorage. Anyone could type role: "developer" into devtools and
 * walk straight past the maintenance screen. A role is not something a browser
 * can assert about itself, so the browser no longer does: it presents an ID
 * token and the SERVER answers with one boolean.
 *
 * The same call returns how many milliseconds of paid time this account is
 * owed, computed here over the COMPLETE history — inline windows and archived
 * chunks together. The browser is handed a number rather than a list, so the
 * size of the history never reaches a phone and an incomplete list can never
 * short-change a learner.
 *
 * It answers only about the caller, and only with what the caller needs:
 * `{ bypass, creditMs }`. No role name, no capability list, nothing about
 * anyone else.
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

        if (action === 'session') {
            if (!assertMethod(req, res, 'POST')) return;

            /* A verified token or nothing. There is no path here that trusts
               anything the browser says about itself. */
            const session = await requireSession(req);
            const state = await readMaintenance();
            const bypass = bypassesMaintenance(session.role);

            let creditMs = 0;
            const subscription = session.profile && session.profile.subscription;
            if (subscription) {
                const windows = await readAllWindows();
                creditMs = maintenanceCreditMs(
                    subscription,
                    { active: state.active, startedAt: state.startedAt, windows },
                    Date.now()
                );
            }

            res.setHeader('Cache-Control', 'no-store, max-age=0');
            return sendJson(res, 200, {
                ok: true,
                /* the two facts the caller needs, and nothing else */
                bypass,
                creditMs,
                maintenance: publicState(state)
            });
        }

        return sendJson(res, 400, {
            error: 'Missing or invalid "action" query parameter',
            validActions: ['status', 'session', 'set']
        });
    } catch (error) {
        return safeError(res, error);
    }
}
