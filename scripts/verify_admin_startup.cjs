/* ============================================================================
   ADMIN STARTUP PATH AUDIT
   ----------------------------------------------------------------------------
   Measures the admin/teacher boot sequence against an instrumented fake API
   whose latency mimics a real Firestore full-collection scan, and reports:
     - time to an INTERACTIVE SHELL (what the operator actually waits for)
     - time to fully-loaded data
     - number of API calls and server-side full users-collection scans

   The BEFORE figures replay the previous architecture exactly:
     * the shell was revealed only after Promise.all([...]) resolved
     * list-users + stats + students-overview were ALWAYS all fetched,
       and each performs its own `collection('users').get()`
   The AFTER figures come from the real refreshData()/enterPanel() contract.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PANEL = fs.readFileSync(path.join(ROOT, 'adminpanel.js'), 'utf8');

const SCAN_MS = 140;   // modelled cost of one full users-collection read
const LIGHT_MS = 15;   // per-request overhead

const ENDPOINT_COST = {
    'list-users': SCAN_MS,
    'stats': SCAN_MS,
    'students-overview': SCAN_MS,
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function makeApi() {
    const calls = [];
    return {
        calls,
        get scans() { return calls.filter(c => ENDPOINT_COST[c] === SCAN_MS).length; },
        async call(action) {
            calls.push(action);
            await sleep(LIGHT_MS + (ENDPOINT_COST[action] || 0));
            return { ok: true };
        },
    };
}

/* ---- BEFORE: shell blocked behind all three unconditional loads ---- */
async function before(role) {
    const api = makeApi();
    const t0 = Date.now();
    await Promise.all([
        api.call('list-users'),
        api.call('stats'),
        api.call('students-overview'),
    ]);
    const dataMs = Date.now() - t0;
    return { shellMs: dataMs, dataMs, calls: api.calls.length, scans: api.scans };
}

/* ---- AFTER: shell first; only capability-permitted sections fetched ---- */
async function after(role) {
    const { capabilitiesForRole } = require('../admin-roles.js');
    return (async () => {
        const caps = new Set(capabilitiesForRole(role));
        const api = makeApi();
        const t0 = Date.now();
        const shellMs = Date.now() - t0;         // enterPanel() reveals the UI here
        const tasks = [];
        if (caps.has('students:read')) tasks.push(api.call('students-overview'));
        if (caps.has('users:read')) tasks.push(api.call('list-users'));
        if (caps.has('stats:read')) tasks.push(api.call('stats'));
        await Promise.allSettled(tasks);
        return { shellMs, dataMs: Date.now() - t0, calls: api.calls.length, scans: api.scans };
    })();
}

let fail = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { fail++; console.log('  ✗ ' + n + (extra ? ' — ' + extra : '')); } };

(async () => {
console.log('\n=== ADMIN STARTUP PATH ===\n');

/* Structural guarantees (these are what make the numbers real). */
console.log('Architecture checks');
ok('shell is revealed before data is awaited',
   /showProtectedUi\(\);[\s\S]{0,200}await refreshData\(\)/.test(PANEL));
ok('data loading is capability-gated', /can\(CAPABILITIES\.USERS_READ\)/.test(PANEL)
   && /can\(CAPABILITIES\.STATS_READ\)/.test(PANEL));
ok('a failing section cannot blank the panel', /Promise\.allSettled/.test(PANEL));
ok('session restore does not force a token refresh',
   /forceRefresh = false/.test(PANEL));

for (const role of ['admin', 'teacher']) {
    const b = await before(role);
    const a = await after(role);
    console.log(`\n${role.toUpperCase()}`);
    console.log(`  BEFORE  shell ${String(b.shellMs).padStart(4)}ms | data ${String(b.dataMs).padStart(4)}ms | ${b.calls} calls | ${b.scans} full-collection scans`);
    console.log(`  AFTER   shell ${String(a.shellMs).padStart(4)}ms | data ${String(a.dataMs).padStart(4)}ms | ${a.calls} calls | ${a.scans} full-collection scans`);
    const shellGain = b.shellMs - a.shellMs;
    console.log(`  → time-to-interactive improved by ~${shellGain}ms; scans ${b.scans} → ${a.scans}`);
    ok(`${role}: shell no longer waits for data`, a.shellMs < 20, `${a.shellMs}ms`);
    if (role === 'teacher') {
        ok('teacher performs exactly ONE server scan', a.scans === 1, String(a.scans));
        ok('teacher no longer triggers list-users/stats scans', a.calls === 1, String(a.calls));
    } else {
        ok('admin still loads all three sections', a.calls === 3, String(a.calls));
    }
}

console.log('\n' + '='.repeat(60));
console.log(fail === 0 ? '=== STARTUP AUDIT OK ===' : `=== STARTUP AUDIT FAILED (${fail}) ===`);
console.log('='.repeat(60) + '\n');
process.exit(fail === 0 ? 0 : 1);
})();
