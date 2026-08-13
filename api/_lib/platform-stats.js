import { normalizeRole } from './roles.js';
import { normalizeUserDocument, toDate } from './user-helpers.js';
import { isAccountFrozen } from '../../account-freeze.js';

/**
 * platform-stats.js — the header-counter computation, extracted verbatim from
 * api/_admin/stats.js so TWO endpoints can produce byte-identical numbers from
 * ONE users-collection scan.
 *
 * WHY THIS EXISTS
 * ---------------
 * An admin opening the panel used to trigger THREE independent full scans of
 * the users collection — list-users, stats and students-overview — each one
 * reading every user document. students-overview already holds the snapshot
 * these counters are derived from, so folding the computation in there removes
 * one entire scan from the startup path at zero behavioural cost.
 *
 * `action=stats` is unchanged and still served, so any other caller (and any
 * cached client) keeps working exactly as before.
 *
 * @param {Array<{uid:string, data:object}>} docs   raw user documents
 * @param {{role:string, uid:string}} session
 * @param {(actorRole:string, actorUid:string, targetUid:string, targetRole:string)=>boolean} canView
 * @param {number} nowMs
 */
export function computePlatformStats(docs, session, canView, nowMs = Date.now()) {
    const visible = docs
        .map(({ uid, data }) => normalizeUserDocument(uid, data))
        .filter(Boolean)
        .filter((user) => canView(session.role, session.uid, user.uid, user.role));

    const roleCounts = {
        customer: 0,
        teacher: 0,
        moderator: 0,
        admin: 0,
        developer: 0
    };

    let activeSubscriptions = 0;
    let blockedUsers = 0;
    let frozenUsers = 0;
    let registeredDevices = 0;

    for (const user of visible) {
        const role = normalizeRole(user.role);
        roleCounts[role] = (roleCounts[role] || 0) + 1;

        if (user.blocked) {
            blockedUsers += 1;
        }

        if (isAccountFrozen(user)) {
            frozenUsers += 1;
        }

        registeredDevices += Array.isArray(user.deviceHashes) ? user.deviceHashes.length : 0;

        if (role === 'customer') {
            /* A frozen account still HOLDS a subscription — that is the whole
               point of freezing rather than cancelling — so it keeps counting
               here and in totalUsers. Excluding it would make revenue and
               active-subscription figures drop the moment support pauses an
               account, and reappear on unfreeze, which is not what happened.
               The freeze is reported as its OWN counter instead. */
            const subscription = user.subscription || {};
            const endAt = toDate(subscription.endAt);
            if (subscription.active && endAt && endAt.getTime() >= nowMs) {
                activeSubscriptions += 1;
            }
        }
    }

    return {
        totalUsers: visible.length,
        roleCounts,
        activeSubscriptions,
        blockedUsers,
        frozenUsers,
        registeredDevices
    };
}
