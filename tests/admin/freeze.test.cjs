/* ============================================================================
 * ACCOUNT FREEZE — the paid period must survive a pause.
 * ----------------------------------------------------------------------------
 * A frozen account loses access and keeps its days. Everything here exercises
 * the REAL modules — account-freeze.js for the rules, firebase-client's
 * canAccessPaid() for the access gate, the endpoint sources for the guards.
 * Nothing is re-implemented, so weakening any of them fails these tests.
 *
 * TIME IS MOCKED, NEVER WAITED FOR. Every duration below is produced by handing
 * buildFreeze()/buildUnfreeze() an explicit `now`, so a ten-day freeze is
 * exercised in microseconds and the assertions are exact rather than
 * approximate — a test that tolerated "about ten days" would not notice a bug
 * that loses six hours of somebody's subscription.
 * ==========================================================================*/
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
    if (cond) { pass++; }
    else { fail++; failures.push(name + (extra ? ' — ' + extra : '')); }
}
function eq(name, actual, expected) {
    ok(name, Object.is(actual, expected),
        `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const DAY = 24 * 60 * 60 * 1000;
const at = (iso) => new Date(iso);
/** A customer with `days` of subscription left as of `now`. */
function customer(now, days, extra = {}) {
    return {
        uid: 'u1',
        username: 'ali',
        role: 'customer',
        accessPacks: ['A1A2'],
        completedTopics: ['a1-1', 'a1-2'],
        subscription: {
            active: true,
            tariff: 'PREMIUM',
            endAt: new Date(now.getTime() + days * DAY)
        },
        ...extra
    };
}

(async function run() {

console.log('\n=== ACCOUNT FREEZE ===');

const freeze = await import('../../account-freeze.js');
const {
    isAccountFrozen, getFreezeState, frozenDurationMs,
    buildFreeze, buildUnfreeze, normalizeFreezeReason, FREEZE_FIELD
} = freeze;

/* Apply a patch the way the endpoints do, so the tests operate on documents
   shaped exactly like the ones Firestore holds. */
function applyFreeze(user, result) {
    return { ...user, [FREEZE_FIELD]: result.freeze };
}
function applyUnfreeze(user, result) {
    const next = { ...user, [FREEZE_FIELD]: result.freeze };
    if (result.subscription) {
        next.subscription = {
            ...(user.subscription || {}),
            active: result.subscription.active,
            endAt: result.subscription.endAt
        };
    }
    return next;
}
const daysLeft = (user, now) =>
    (new Date(user.subscription.endAt).getTime() - now.getTime()) / DAY;

/* ------------------------------------------------------- 1. the predicate */
{
    ok('an account with no freeze field is not frozen', isAccountFrozen({}) === false);
    ok('undefined is not frozen', isAccountFrozen(undefined) === false);
    ok('null is not frozen', isAccountFrozen(null) === false);
    ok('an explicitly thawed account is not frozen',
        isAccountFrozen({ accountFreeze: { frozen: false } }) === false);
    ok('a frozen account is frozen',
        isAccountFrozen({ accountFreeze: { frozen: true } }) === true);
    /* Existing accounts predate the field entirely: they must read as active
       with no migration, which is what the first assertion above pins. */
    ok('a truthy-but-not-true value does not count as frozen',
        isAccountFrozen({ accountFreeze: { frozen: 'yes' } }) === false);
    eq('no freeze state for a live account', getFreezeState({}), null);
}

/* ------------------------------------------ 2. the worked example from spec */
{
    /* expires 30 Aug · frozen 15 Aug (15 days left) · unfrozen 25 Aug
       => new expiry 9 Sep, i.e. still 15 days left. */
    const frozenAt = at('2026-08-15T12:00:00Z');
    const thawAt = at('2026-08-25T12:00:00Z');
    let user = customer(frozenAt, 15);

    eq('before freeze: 15 days left', daysLeft(user, frozenAt), 15);

    user = applyFreeze(user, buildFreeze(user, { now: frozenAt, actorUid: 'admin1' }));
    ok('the account is frozen', isAccountFrozen(user));

    const un = buildUnfreeze(user, { now: thawAt, actorUid: 'admin1' });
    user = applyUnfreeze(user, un);

    eq('the freeze lasted exactly 10 days', un.frozenMs / DAY, 10);
    eq('the new expiry is 9 September',
        new Date(user.subscription.endAt).toISOString(), '2026-09-09T12:00:00.000Z');
    eq('after unfreeze: still 15 days left', daysLeft(user, thawAt), 15);
    ok('the account is no longer frozen', !isAccountFrozen(user));
}

/* --------------------------------------- 3. no time is consumed, to the ms */
{
    /* Not a round number of days, and not a round number of hours: rounding
       anywhere in the chain would show up here. */
    const t0 = at('2026-03-01T08:17:43.250Z');
    const frozenFor = 6 * DAY + 5 * 3600e3 + 42 * 60e3 + 913;
    const t1 = new Date(t0.getTime() + frozenFor);
    let user = customer(t0, 21);
    const before = daysLeft(user, t0);

    user = applyFreeze(user, buildFreeze(user, { now: t0, actorUid: 'a' }));
    const un = buildUnfreeze(user, { now: t1, actorUid: 'a' });
    user = applyUnfreeze(user, un);

    eq('the elapsed freeze is measured to the millisecond', un.frozenMs, frozenFor);
    eq('remaining time is identical to the millisecond', daysLeft(user, t1), before);
}

/* ------------------------------------------------------ 4. double freeze */
{
    const t0 = at('2026-05-01T00:00:00Z');
    let user = customer(t0, 30);
    const first = buildFreeze(user, { now: t0, actorUid: 'a' });
    user = applyFreeze(user, first);

    /* Ten days later somebody presses Freeze again. If this wrote a new
       frozenAt, the first ten days would silently become chargeable. */
    const t1 = new Date(t0.getTime() + 10 * DAY);
    const second = buildFreeze(user, { now: t1, actorUid: 'b' });
    ok('a second freeze applies nothing', second.applied === false);
    ok('a second freeze reports the account was already in that state',
        second.alreadyInState === true);
    eq('frozenAt is untouched by the second freeze',
        new Date(user[FREEZE_FIELD].frozenAt).toISOString(), t0.toISOString());

    /* And the days are still all there afterwards. */
    const t2 = new Date(t0.getTime() + 20 * DAY);
    const un = buildUnfreeze(user, { now: t2, actorUid: 'a' });
    eq('the full 20 days are credited back, not 10', un.frozenMs / DAY, 20);
    eq('remaining time survives the double freeze',
        daysLeft(applyUnfreeze(user, un), t2), 30);
}

/* ---------------------------------------------------- 5. double unfreeze */
{
    const t0 = at('2026-05-01T00:00:00Z');
    const t1 = new Date(t0.getTime() + 10 * DAY);
    let user = customer(t0, 30);
    user = applyFreeze(user, buildFreeze(user, { now: t0, actorUid: 'a' }));

    const first = buildUnfreeze(user, { now: t1, actorUid: 'a' });
    user = applyUnfreeze(user, first);
    const endAfterFirst = new Date(user.subscription.endAt).toISOString();

    /* Two admins, or one impatient one. The second call must be inert. */
    const second = buildUnfreeze(user, { now: t1, actorUid: 'b' });
    ok('a second unfreeze applies nothing', second.applied === false);
    eq('a second unfreeze shifts no time', second.frozenMs, 0);
    ok('a second unfreeze produces no subscription patch', second.subscription === null);

    const third = buildUnfreeze(user, { now: new Date(t1.getTime() + 5 * DAY), actorUid: 'c' });
    ok('a third unfreeze, later, still applies nothing', third.applied === false);
    eq('the end date is unchanged after repeated unfreezes',
        new Date(user.subscription.endAt).toISOString(), endAfterFirst);
    eq('exactly 30 days remain, never 40', daysLeft(user, t1), 30);
}

/* ------------------------- 6. a perpetual subscription stays perpetual */
{
    const t0 = at('2026-05-01T00:00:00Z');
    /* No end date — nothing to shift. Whatever such a plan is called, the
       property that matters is the absence of an expiry. */
    let user = {
        uid: 'u2', username: 'lifetime', role: 'customer', accessPacks: ['A1A2', 'B1B2'],
        subscription: { active: true, tariff: 'PREMIUM', endAt: null }
    };
    const originalSubscription = JSON.stringify(user.subscription);

    user = applyFreeze(user, buildFreeze(user, { now: t0, actorUid: 'a' }));
    ok('a perpetual account can be frozen', isAccountFrozen(user));
    eq('freezing does not touch the subscription',
        JSON.stringify(user.subscription), originalSubscription);

    const un = buildUnfreeze(user, { now: new Date(t0.getTime() + 90 * DAY), actorUid: 'a' });
    ok('unfreeze reports no subscription patch for a perpetual plan',
        un.subscription === null);
    user = applyUnfreeze(user, un);
    eq('unfreezing does not invent an end date',
        JSON.stringify(user.subscription), originalSubscription);
    ok('the subscription is still active', user.subscription.active === true);
    ok('the account is thawed', !isAccountFrozen(user));
    ok('no endAt was added', user.subscription.endAt === null);
}

/* ------------------- 7. every pack keeps its entitlement across a freeze */
{
    const t0 = at('2026-06-01T00:00:00Z');
    let user = customer(t0, 42, { accessPacks: ['A1A2', 'B1B2'] });
    user = applyFreeze(user, buildFreeze(user, { now: t0, actorUid: 'a' }));
    const t1 = new Date(t0.getTime() + 10 * DAY);
    user = applyUnfreeze(user, buildUnfreeze(user, { now: t1, actorUid: 'a' }));

    eq('both packs survive the freeze', user.accessPacks.join(','), 'A1A2,B1B2');
    eq('the shared expiry is shifted once for both packs', daysLeft(user, t1), 42);
    /* The subscription model has ONE end date covering every entitlement in
       accessPacks, so shifting it preserves all of them by construction and
       cannot preserve one while dropping another. This assertion pins that
       shape: if per-pack dates are ever introduced, it fails and the freeze
       maths must be revisited. */
    ok('the model still has a single end date, not one per pack',
        typeof user.subscription.endAt !== 'undefined' &&
        !Array.isArray(user.subscription.endAt) &&
        user.accessPacks.every((p) => user.subscription[p] === undefined));
}

/* --------- 8. work done DURING the freeze is preserved, not rolled back */
{
    const t0 = at('2026-07-01T00:00:00Z');
    let user = customer(t0, 10, { subscription: undefined });
    user.subscription = { active: true, tariff: 'START', endAt: new Date(t0.getTime() + 10 * DAY) };
    user = applyFreeze(user, buildFreeze(user, { now: t0, actorUid: 'a' }));

    /* Mid-freeze an admin upgrades the tariff and adds 30 days — exactly what
       adjust-subscription-days / set-subscription do. */
    user.subscription = {
        ...user.subscription,
        tariff: 'PREMIUM',
        endAt: new Date(new Date(user.subscription.endAt).getTime() + 30 * DAY)
    };

    const t1 = new Date(t0.getTime() + 5 * DAY);
    const un = buildUnfreeze(user, { now: t1, actorUid: 'a' });
    user = applyUnfreeze(user, un);

    eq('the new tariff survives the unfreeze', user.subscription.tariff, 'PREMIUM');
    eq('the days added during the freeze are still there, plus the frozen 5',
        daysLeft(user, t1), 40);
    ok('nothing was restored from a pre-freeze snapshot',
        user.subscription.tariff !== 'START');
}

/* ------------------- 9. an admin who switched the plan off is respected */
{
    const t0 = at('2026-07-01T00:00:00Z');
    let user = customer(t0, 10);
    user = applyFreeze(user, buildFreeze(user, { now: t0, actorUid: 'a' }));
    user.subscription = { ...user.subscription, active: false };

    const un = buildUnfreeze(user, { now: new Date(t0.getTime() + 2 * DAY), actorUid: 'a' });
    ok('unfreezing does not reactivate a deliberately disabled subscription',
        un.subscription.active === false);
}

/* ------------- 10. a subscription that lapsed during the freeze is restored */
{
    /* 10 days left, frozen, thawed 15 days later: the raw end date is in the
       past by then, and the shift must put it back in the future. */
    const t0 = at('2026-08-10T00:00:00Z');
    const t1 = at('2026-08-25T00:00:00Z');
    let user = customer(t0, 10);
    user = applyFreeze(user, buildFreeze(user, { now: t0, actorUid: 'a' }));

    ok('the raw end date has passed by unfreeze time',
        new Date(user.subscription.endAt).getTime() < t1.getTime());

    const un = buildUnfreeze(user, { now: t1, actorUid: 'a' });
    user = applyUnfreeze(user, un);
    eq('the 10 paid days are handed back in full', daysLeft(user, t1), 10);
    ok('the subscription is active again', user.subscription.active === true);
}

/* -------------------------------------- 11. a backwards clock cannot steal */
{
    const t0 = at('2026-09-10T00:00:00Z');
    let user = customer(t0, 20);
    user = applyFreeze(user, buildFreeze(user, { now: t0, actorUid: 'a' }));
    /* Unfreeze stamped EARLIER than the freeze (clock skew between instances). */
    const un = buildUnfreeze(user, { now: new Date(t0.getTime() - 3 * DAY), actorUid: 'a' });
    eq('a negative duration is clamped to zero', un.frozenMs, 0);
    const after = applyUnfreeze(user, un);
    eq('the subscription is never shortened',
        new Date(after.subscription.endAt).getTime(),
        new Date(user.subscription.endAt).getTime());
}

/* --------------------------------------- 12. progress is never touched */
{
    const t0 = at('2026-04-01T00:00:00Z');
    let user = customer(t0, 30, {
        completedTopics: ['a1-1', 'a1-2', 'a1-3'],
        courses: { A1: { progress: 62 } },
        achievements: ['first-lesson'],
        agreementAccepted: true,
        deviceHashes: ['h1']
    });
    const snapshot = JSON.stringify({
        completedTopics: user.completedTopics, courses: user.courses,
        achievements: user.achievements, agreementAccepted: user.agreementAccepted,
        deviceHashes: user.deviceHashes, accessPacks: user.accessPacks,
        tariff: user.subscription.tariff
    });

    user = applyFreeze(user, buildFreeze(user, { now: t0, actorUid: 'a' }));
    user = applyUnfreeze(user, buildUnfreeze(user, { now: new Date(t0.getTime() + 30 * DAY), actorUid: 'a' }));

    eq('no learner data is altered by a freeze/unfreeze cycle', JSON.stringify({
        completedTopics: user.completedTopics, courses: user.courses,
        achievements: user.achievements, agreementAccepted: user.agreementAccepted,
        deviceHashes: user.deviceHashes, accessPacks: user.accessPacks,
        tariff: user.subscription.tariff
    }), snapshot);

    /* The freeze patch must only ever write two top-level keys. */
    const patch = buildFreeze(customer(t0, 30), { now: t0, actorUid: 'a' });
    ok('the freeze result describes only the freeze record',
        Object.keys(patch).sort().join(',') === 'alreadyInState,applied,freeze');
}

/* ------------------------------------------------- 13. the reason field */
{
    eq('an empty reason becomes null', normalizeFreezeReason('   '), null);
    eq('a missing reason becomes null', normalizeFreezeReason(undefined), null);
    eq('whitespace is collapsed', normalizeFreezeReason(' to‘lov   kutilmoqda '), 'to‘lov kutilmoqda');
    ok('an absurdly long reason is truncated',
        normalizeFreezeReason('x'.repeat(5000)).length === freeze.MAX_REASON_LENGTH);

    const t0 = at('2026-01-01T00:00:00Z');
    const r = buildFreeze(customer(t0, 5), { now: t0, actorUid: 'admin7', reason: 'Toʻlov kutilmoqda' });
    eq('the reason is stored', r.freeze.reason, 'Toʻlov kutilmoqda');
    eq('the acting admin is recorded', r.freeze.frozenBy, 'admin7');
    eq('the freeze counter starts at one', r.freeze.freezeCount, 1);
}

/* --------------------------------- 14. duration reporting while frozen */
{
    const t0 = at('2026-02-01T00:00:00Z');
    const user = applyFreeze(customer(t0, 5), buildFreeze(customer(t0, 5), { now: t0, actorUid: 'a' }));
    eq('a live account has been frozen for zero time', frozenDurationMs(customer(t0, 5), t0), 0);
    eq('the frozen duration grows with the clock',
        frozenDurationMs(user, new Date(t0.getTime() + 3 * DAY)) / DAY, 3);
}

/* ============================ ACCESS ENFORCEMENT ========================= */
/* canAccessPaid() is the ONE gate every paid page goes through, so the access
   half of the feature is tested by driving that function, not by grepping for
   an `if` in each course file. It cannot be imported directly (firebase-client
   pulls the Firebase CDN over the network), so its source is lifted and the
   predicates it depends on are supplied — the logic under test is the real
   published text of the function. */
{
    const CLIENT = fs.readFileSync(path.join(ROOT, 'firebase-client.js'), 'utf8');

    function lift(name) {
        const i = CLIENT.indexOf('export function ' + name + '(');
        if (i < 0) throw new Error('missing ' + name);
        let d = 0;
        const b = CLIENT.indexOf('{', CLIENT.indexOf(')', i));
        for (let k = b; k < CLIENT.length; k++) {
            if (CLIENT[k] === '{') d++;
            else if (CLIENT[k] === '}') { d--; if (d === 0) return CLIENT.slice(i, k + 1).replace('export ', ''); }
        }
        throw new Error('unbalanced ' + name);
    }

    const factory = new Function('isAccountFrozen', `
        const PRIVILEGED_ROLES = new Set(['developer', 'admin']);
        function extractRole(u) {
            return typeof u === 'string' ? u.trim().toLowerCase()
                : String(u?.role || '').trim().toLowerCase();
        }
        function normalizeDate(v) {
            if (!v) return null;
            if (typeof v?.toDate === 'function') return v.toDate();
            const d = new Date(v);
            return Number.isNaN(d.getTime()) ? null : d;
        }
        ${lift('isPrivilegedRole')}
        ${lift('hasActiveSubscription')}
        ${lift('hasPackAccess')}
        ${lift('canAccessPaid')}
        return { canAccessPaid, hasActiveSubscription };
    `);
    const { canAccessPaid, hasActiveSubscription } = factory(isAccountFrozen);

    const now = new Date();
    const live = customer(now, 30);
    const frozen = applyFreeze(live, buildFreeze(live, { now, actorUid: 'a' }));

    eq('a live customer may open their pack', canAccessPaid(live, 'A1A2').reason, 'ok');
    ok('a live customer is allowed', canAccessPaid(live, 'A1A2').allowed === true);

    /* THE BYPASS TEST: typing the course URL runs this exact function. */
    ok('a frozen customer is refused', canAccessPaid(frozen, 'A1A2').allowed === false);
    eq('the refusal reason is frozen', canAccessPaid(frozen, 'A1A2').reason, 'frozen');

    /* FROZEN != EXPIRED. The subscription is still perfectly valid; only the
       access gate says no. Reporting 'subscription' here is what would tell a
       paying learner their plan had ended. */
    ok('a frozen account still HAS an active subscription',
        hasActiveSubscription(frozen) === true);

    /* Even after the raw end date drifts past mid-freeze, the learner is told
       they are frozen — not that they expired — because the days are coming back. */
    const lapsed = applyFreeze(customer(new Date(now.getTime() - 40 * DAY), 10),
        buildFreeze(customer(new Date(now.getTime() - 40 * DAY), 10),
            { now: new Date(now.getTime() - 40 * DAY), actorUid: 'a' }));
    eq('a freeze that outlived the end date still reports frozen, not expired',
        canAccessPaid(lapsed, 'A1A2').reason, 'frozen');

    /* Precedence is unchanged for the states that already existed. */
    const blockedAndFrozen = { ...frozen, blocked: true };
    eq('blocked still wins over frozen', canAccessPaid(blockedAndFrozen, 'A1A2').reason, 'blocked');
    const staff = { ...frozen, role: 'admin' };
    eq('staff precedence is unchanged', canAccessPaid(staff, 'A1A2').reason, 'privileged');
    /* A frozen account is refused for a pack it does not even own, and the
       reason is still the freeze — the more fundamental state. */
    eq('a frozen account is refused another pack too',
        canAccessPaid(frozen, 'B1B2').reason, 'frozen');

    /* Legacy accounts: no freeze field anywhere, access exactly as before. */
    const legacy = customer(now, 30);
    delete legacy.accountFreeze;
    eq('an account that predates the feature is unaffected',
        canAccessPaid(legacy, 'A1A2').reason, 'ok');
}

/* ============================ SERVER-SIDE GUARDS ======================== */
{
    const FREEZE_SRC = fs.readFileSync(path.join(ROOT, 'api/_admin/freeze-account.js'), 'utf8');
    const UNFREEZE_SRC = fs.readFileSync(path.join(ROOT, 'api/_admin/unfreeze-account.js'), 'utf8');
    const ROUTER = fs.readFileSync(path.join(ROOT, 'api/admin.js'), 'utf8');
    const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

    [['freeze-account', FREEZE_SRC], ['unfreeze-account', UNFREEZE_SRC]].forEach(([name, src]) => {
        ok(`${name}: authenticates the caller`, /requireSession\(req\)/.test(src));
        /* SUBSCRIPTION_WRITE, not USERS_BLOCK: unfreezing moves the end date,
           so it is governed by the capability that already owns that power. */
        ok(`${name}: requires SUBSCRIPTION_WRITE`,
            /requireCapability\(\s*session\s*,\s*CAPABILITIES\.SUBSCRIPTION_WRITE\s*\)/.test(src));
        ok(`${name}: honours the management hierarchy`,
            /requireManagePermission\(session, targetRole\)/.test(src));
        ok(`${name}: refuses non-customers`, /targetRole !== 'customer'/.test(src));
        /* The read and the write must be one transaction, or two admins can
           both compute a shift from the same pre-freeze document. */
        ok(`${name}: reads and writes inside one transaction`,
            /runTransaction\(async \(transaction\) =>/.test(src) &&
            /transaction\.get\(targetRef\)/.test(src) &&
            /transaction\.update\(targetRef/.test(src));
        ok(`${name}: writes an audit record`, /writeAuditLog\(/.test(src));
        ok(`${name}: refreshes analytics`, /syncPulse\(/.test(src));
        ok(`${name}: never trusts a role sent by the client`,
            !/body\.(role|admin|isAdmin)/.test(src));
        ok(`${name}: uses the shared freeze rules rather than its own maths`,
            /from '\.\.\/\.\.\/account-freeze\.js'/.test(src));
    });

    ok('freeze logs ACCOUNT_FROZEN', /action: 'ACCOUNT_FROZEN'/.test(FREEZE_SRC));
    ok('unfreeze logs ACCOUNT_UNFROZEN', /action: 'ACCOUNT_UNFROZEN'/.test(UNFREEZE_SRC));
    ok('the audit record names the acting admin',
        /actorUid: session\.uid/.test(FREEZE_SRC) && /actorUid: session\.uid/.test(UNFREEZE_SRC));
    ok('the audit record names the target',
        /targetUid: userId/.test(FREEZE_SRC) && /targetUid: userId/.test(UNFREEZE_SRC));
    ok('the freeze audit record keeps the reason', /reason: outcome\.reason/.test(FREEZE_SRC));

    ok('both actions are routed', /'freeze-account':/.test(ROUTER) && /'unfreeze-account':/.test(ROUTER));

    /* NO CLIENT-SIDE BYPASS. A learner may only write the whitelisted keys in
       their own document; accountFreeze is not among them, so `frozen: false`
       cannot be set from DevTools. Nothing about the freeze is read from
       localStorage either. */
    const mutable = RULES.slice(RULES.indexOf('function ownerMutableKeys()'));
    const keys = mutable.slice(0, mutable.indexOf('}'));
    ok('accountFreeze is NOT owner-writable', !/accountFreeze/.test(keys));
    ok('subscription is NOT owner-writable', !/"subscription"/.test(keys));

    const CABINET = fs.readFileSync(path.join(ROOT, 'my.cabinet/cabinet.js'), 'utf8');
    const PLATFORM = fs.readFileSync(path.join(ROOT, 'paid-courses/paid-platform.js'), 'utf8');
    [['cabinet.js', CABINET], ['paid-platform.js', PLATFORM]].forEach(([name, src]) => {
        ok(`${name}: freeze state never comes from localStorage`,
            !/localStorage[^\n]*frozen/i.test(src));
    });

    /* NO NEW POLLING. The flag rides on the profile that is already fetched. */
    ok('the cabinet adds no interval for the freeze',
        !/setInterval[\s\S]{0,120}?frozen/i.test(CABINET));
    ok('the cabinet adds no snapshot listener for the freeze',
        !/onSnapshot[\s\S]{0,120}?frozen/i.test(CABINET));
    ok('paid-platform adds no interval for the freeze',
        !/setInterval[\s\S]{0,120}?frozen/i.test(PLATFORM));

    /* NO HARDCODED IDENTITIES anywhere in the feature. */
    const FREEZE_MODULE = fs.readFileSync(path.join(ROOT, 'account-freeze.js'), 'utf8');
    [['account-freeze.js', FREEZE_MODULE], ['freeze-account.js', FREEZE_SRC],
     ['unfreeze-account.js', UNFREEZE_SRC]].forEach(([name, src]) => {
        ok(`${name}: no hardcoded email or uid`,
            !/@(gmail|mail|uzdarus)\./.test(src) && !/uid === ['"]/.test(src));
    });
}

/* ====================== ENFORCEMENT AND UI SURFACES ===================== */
{
    const PLATFORM = fs.readFileSync(path.join(ROOT, 'paid-courses/paid-platform.js'), 'utf8');
    ok('the course guard handles the frozen reason', /access\.reason === 'frozen'/.test(PLATFORM));
    /* Frozen must be answered BEFORE the subscription branch, or a learner
       whose date lapsed mid-freeze is told their subscription ended. */
    ok('frozen is answered before the expiry branch',
        PLATFORM.indexOf("access.reason === 'frozen'") <
        PLATFORM.indexOf("access.reason === 'subscription'"));

    const CABINET = fs.readFileSync(path.join(ROOT, 'my.cabinet/cabinet.js'), 'utf8');
    ok('the dashboard checks the freeze', /isAccountFrozen\(profile\)/.test(CABINET));
    ok('the frozen screen replaces the dashboard', /renderFrozenScreen\(profile\)/.test(CABINET));
    /* The check must precede any dashboard RENDERING, otherwise course cards
       are painted and then hidden. Measured against the line that actually
       fills the grid, not the one that merely looks the element up. */
    ok('the freeze gate runs before the course cards are built',
        CABINET.indexOf('isAccountFrozen(profile)') < CABINET.indexOf('packGrid.appendChild'));
    ok('the freeze gate returns instead of falling through',
        /isAccountFrozen\(profile\)[\s\S]{0,200}renderFrozenScreen\(profile\);[\s\S]{0,40}return;/.test(CABINET));
    ok('frozen maps to its own dashboard status, not expired',
        /reason === 'frozen'[\s\S]{0,80}return 'frozen'/.test(CABINET));

    const DASH = fs.readFileSync(path.join(ROOT, 'my.cabinet/dashboard.html'), 'utf8');
    ok('the frozen screen exists', /id="frozenScreen"/.test(DASH));
    ok('the frozen screen is hidden by default', /id="frozenScreen"[^>]*hidden/.test(DASH));
    ok('it tells the learner their time is preserved', /saqlanib qolmoqda/.test(DASH));
    ok('it does NOT claim the subscription ended', !/muddati tugagan/i.test(DASH));
    ok('a frozen learner can still reach support', /frozen-actions[\s\S]{0,400}t\.me\//.test(DASH));
    ok('a frozen learner can still log out', /id="frozenLogoutBtn"/.test(DASH));

    const CSS = fs.readFileSync(path.join(ROOT, 'my.cabinet/styles.css'), 'utf8');
    ok('the frozen screen is styled', /\.frozen-card\s*\{/.test(CSS));
    ok('the frozen screen has a mobile layout',
        /@media \(max-width: 480px\)[\s\S]{0,600}\.frozen-card/.test(CSS));

    const PANEL = fs.readFileSync(path.join(ROOT, 'adminpanel.js'), 'utf8');
    ok('the panel shows a frozen badge', /badge-frozen/.test(PANEL));
    ok('the frozen badge is decided before the expiry maths',
        PANEL.indexOf('user.frozen') < PANEL.indexOf("category: 'expired'"));
    ok('the panel offers exactly one of freeze/unfreeze',
        /if \(user\.frozen\)[\s\S]{0,300}data-action="unfreeze"[\s\S]{0,300}data-action="freeze"/.test(PANEL));
    ok('the freeze control is gated on the same capability as the endpoint',
        /function freezeButtonHtml[\s\S]{0,200}canEditSubscription\(\)/.test(PANEL));
    ok('both actions are dispatched',
        /action === 'freeze'/.test(PANEL) && /action === 'unfreeze'/.test(PANEL));
    ok('freezing asks for confirmation first', /openModal\([\s\S]{0,400}Muzlatish/.test(PANEL));
    ok('the confirmation states that the time is preserved',
        /obuna muddati esa saqlanib qoladi/i.test(PANEL));
    ok('the panel reports a no-op instead of claiming a second freeze',
        /applied === false/.test(PANEL));
    ok('frozen rows show when and why', /Muzlatilgan: \$\{escapeHtml\(since\)\}/.test(PANEL));

    const PANEL_HTML = fs.readFileSync(path.join(ROOT, 'adminpanel.html'), 'utf8');
    ok('the users table can be filtered to frozen accounts',
        /<option value="frozen">/.test(PANEL_HTML));
    const CSS_PANEL = fs.readFileSync(path.join(ROOT, 'adminpanel.css'), 'utf8');
    ok('the frozen badge is styled', /\.badge-frozen\s*\{/.test(CSS_PANEL));
}

/* ============================== ANALYTICS =============================== */
{
    const stats = await import('../../api/_lib/platform-stats.js');
    const now = Date.now();
    const mk = (uid, extra) => ({
        uid,
        data: {
            uid, username: uid, role: 'customer',
            subscription: { active: true, tariff: 'PREMIUM', endAt: new Date(now + 30 * DAY) },
            ...extra
        }
    });
    const docs = [
        mk('live'),
        mk('frozen', { accountFreeze: { frozen: true, frozenAt: new Date(now - 5 * DAY) } }),
        mk('blocked', { blocked: true }),
        mk('legacy')   // no freeze field at all
    ];
    const out = stats.computePlatformStats(docs, { role: 'developer', uid: 'x' }, () => true, now);

    eq('frozen accounts are counted', out.frozenUsers, 1);
    eq('frozen accounts stay in the total', out.totalUsers, 4);
    /* Revenue and active-subscription figures must not dip when support pauses
       an account — the subscription still exists and is still paid for. */
    eq('a frozen account still counts as an active subscription', out.activeSubscriptions, 4);
    eq('the blocked counter is unaffected', out.blockedUsers, 1);
    ok('no counter is NaN or Infinity',
        [out.totalUsers, out.activeSubscriptions, out.blockedUsers, out.frozenUsers,
         out.registeredDevices].every((n) => Number.isFinite(n)));

    /* A collection with no frozen accounts reports 0, not undefined. */
    const clean = stats.computePlatformStats([mk('a')], { role: 'developer', uid: 'x' }, () => true, now);
    eq('zero frozen accounts reports 0, never undefined', clean.frozenUsers, 0);

    /* The freeze state must reach the panel on the record it already fetches. */
    const helpers = await import('../../api/_lib/user-helpers.js');
    const pub = helpers.toPublicUser('u1', {
        uid: 'u1', username: 'ali', role: 'customer',
        accountFreeze: { frozen: true, frozenAt: new Date(now), frozenBy: 'a', reason: 'r', freezeCount: 2 }
    });
    eq('the public record exposes the freeze flag', pub.frozen, true);
    eq('the public record exposes the reason', pub.freeze.reason, 'r');
    eq('the public record exposes the freeze count', pub.freeze.freezeCount, 2);
    const pubLegacy = helpers.toPublicUser('u2', { uid: 'u2', username: 'vali', role: 'customer' });
    eq('a legacy record reports frozen=false', pubLegacy.frozen, false);
    eq('a legacy record has no freeze block', pubLegacy.freeze, null);
}

console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ ACCOUNT FREEZE: ${fail} failed / ${pass + fail}\n`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ ACCOUNT FREEZE: ${pass}/${pass} assertions passed`);
console.log('='.repeat(60) + '\n');

})().catch((error) => {
    console.error('ACCOUNT FREEZE suite crashed:', error);
    process.exit(1);
});
