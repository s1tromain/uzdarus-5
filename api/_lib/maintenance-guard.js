/**
 * maintenance-guard.js — the server half of the maintenance mode.
 *
 * The screen a learner sees is presentation. THIS is the rule: while the mode
 * is on, a user-facing write is refused with a controlled 503 whether it comes
 * from the page, from a stale tab, from curl or from a script. A developer is
 * let through, because the whole point of the mode is that a developer can work
 * on a platform nobody else is touching.
 *
 * Deliberately NOT applied to: the admin endpoints (staff must be able to work,
 * and only a developer can lift the mode), payment webhooks and callbacks
 * (money arriving is not a user action and dropping it loses a purchase), and
 * the status read itself.
 */
import { readMaintenance } from './maintenance-store.js';
import {
    bypassesMaintenance,
    MAINTENANCE_ERROR_CODE,
    MAINTENANCE_HTTP_STATUS
} from '../../maintenance-state.js';

/**
 * Throw the controlled refusal when the platform is off and this session is
 * not a developer. Never throws for a developer; never throws when the mode is
 * off; and if the state cannot be read at all it lets the request through
 * rather than inventing an outage.
 */
export async function assertNotInMaintenance(session) {
    if (bypassesMaintenance(session && session.role)) return;

    let state;
    try {
        state = await readMaintenance();
    } catch (error) {
        /* An unreadable state document must not become a platform-wide refusal:
           failing closed here would turn one bad read into the very outage the
           mode exists to schedule. */
        return;
    }

    if (!state.active) return;

    throw Object.assign(new Error('Platformada texnik ishlar olib borilmoqda'), {
        statusCode: MAINTENANCE_HTTP_STATUS,
        code: MAINTENANCE_ERROR_CODE,
        maintenance: true
    });
}
