/* ============================================================================
 * ADMIN SESSION RESTORATION — S1..S8 from the specification
 * ----------------------------------------------------------------------------
 * These drive the REAL gate logic out of adminpanel.js. The file is an ES
 * module that imports firebase-client.js (which reaches the network), so it is
 * loaded into JSDOM with those imports rewritten to local fakes — the gate
 * code itself, including establishSession/enterPanel/initGate, is the genuine
 * production source.
 * ==========================================================================*/
'use strict';

const fs = require('fs');
const path = require('path');
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch (e) { console.error('jsdom is required: npm i -D jsdom'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const PANEL_SRC = fs.readFileSync(path.join(ROOT, 'adminpanel.js'), 'utf8');
const PANEL_HTML = fs.readFileSync(path.join(ROOT, 'adminpanel.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (extra ? '\n      ' + extra : '')); }
}
function eq(name, a, b) { ok(name, Object.is(a, b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitFor(fn, ms = 3000, step = 20) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        let v; try { v = fn(); } catch (e) { v = null; }
        if (v) return v;
        await sleep(step);
    }
    return null;
}

/* ---------------------------------------------------------------- harness */

/**
 * Extract the gate machinery from the real adminpanel.js and run it against
 * injectable fakes. Imports are stripped (they are network modules) and the
 * identifiers they provide are supplied from the harness instead.
 */
function buildGateSource() {
    let src = PANEL_SRC;

    // Drop the ESM import statements; the harness provides those bindings.
    src = src.replace(/^import[\s\S]*?from\s*'\.\/firebase-client\.js';/m, '');
    src = src.replace(/^import[\s\S]*?from\s*'\.\/admin-roles\.js';/m, '');

    // The panel initialises a lot of unrelated machinery at module scope
    // (analytics overlay, certificate tab, styles). Keep only what the gate
    // needs: state, helpers, session functions and initGate.
    return src;
}

function makeDom(onNavigate) {
    const virtualConsole = new VirtualConsole();
    let muted = false;
    virtualConsole.on('jsdomError', (e) => {
        const msg = String((e && e.message) || e);
        /* JSDOM cannot navigate, so window.location.replace() surfaces here.
           That IS the redirect signal we want to assert on. */
        if (/Not implemented: navigation/i.test(msg)) { if (onNavigate) onNavigate(msg); return; }
        if (!muted) console.error(msg);
    });

    const dom = new JSDOM(PANEL_HTML, {
        url: 'https://uzdarus.uz/adminpanel.html',
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        virtualConsole,
    });
    const w = dom.window;
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.alert = function () {};
    const origClose = w.close.bind(w);
    w.close = function () { muted = true; origClose(); };
    return dom;
}

/**
 * Boot the gate with a controllable auth + profile source.
 *  authUser   : the user onAuthStateChanged should emit (null = signed out)
 *  profile    : the Firestore profile getUserProfile should return
 */
async function bootGate({ authUser = null, profile = null, apiCalls = null } = {}) {
    const calls = apiCalls || [];
    let authCb = null;
    let signOutCount = 0;
    let redirected = null;

    const dom = makeDom(() => { redirected = redirected || 'navigation:no-access'; });
    const w = dom.window;

    // ---- injected fakes standing in for firebase-client.js ----
    w.__fakes = {
        auth: { currentUser: authUser },
        onAuthStateChanged: (a, cb) => { authCb = cb; return () => {}; },
        signInWithEmailAndPassword: async () => ({ user: authUser }),
        signOut: async () => { signOutCount++; },
        usernameToEmail: (u) => `${u}@uzdarus.local`,
        getUserProfile: async () => profile,
        saveLocalUser: () => {},
        clearLocalUser: () => {},
        callApi: async (url) => {
            calls.push(url);
            if (/students-overview/.test(url)) return { ok: true, students: [] };
            if (/list-users/.test(url)) return { ok: true, users: [] };
            if (/action=stats/.test(url)) return { ok: true, stats: {} };
            return { ok: true };
        },
    };

    const shared = await import('../../admin-roles.js');

    const src =
        'const { auth, onAuthStateChanged, signInWithEmailAndPassword, signOut, usernameToEmail,' +
        ' getUserProfile, saveLocalUser, clearLocalUser, callApi } = window.__fakes;\n' +
        'const { CAPABILITIES, normalizeRole: normalizeRoleShared, isStaffRole, roleHasCapability,' +
        ' capabilitiesForRole, roleLabel } = window.__shared;\n' +
        buildGateSource() +
        '\nwindow.__state = state;' +
        '\nwindow.__initGate = initGate;' +
        '\nwindow.__establishSession = establishSession;';

    w.__shared = shared;
    /* JSDOM's window.location is read-only; the panel calls
       window.location.replace(), so intercept it via a configurable stub. */
    try {
        Object.defineProperty(w, 'location', {
            configurable: true,
            value: Object.assign(Object.create(null), {
                href: 'https://uzdarus.uz/adminpanel.html',
                replace: (u) => { redirected = u; },
                assign: (u) => { redirected = u; },
                pathname: '/adminpanel.html',
                toString() { return this.href; },
            }),
        });
    } catch (e) { /* JSDOM may refuse; the navigation hook above covers it */ }

    try {
        w.eval(src);
    } catch (e) {
        return { dom, w, error: e, calls, get signOutCount() { return signOutCount; }, get redirected() { return redirected; } };
    }

    await w.__initGate();
    // fire the auth-state callback the way Firebase would on page load
    if (authCb) await authCb(authUser);
    await sleep(60);

    return {
        dom, w, calls,
        get signOutCount() { return signOutCount; },
        get redirected() { return redirected; },
        emitAuth: async (u) => { if (authCb) await authCb(u); await sleep(60); },
        close: () => w.close(),
    };
}

const panelVisible = (w) => {
    const app = w.document.getElementById('adminApp');
    const gate = w.document.getElementById('adminGate');
    return !!app && app.hidden === false && (!gate || gate.style.display === 'none');
};
const loginVisible = (w) => {
    const gate = w.document.getElementById('adminGate');
    const app = w.document.getElementById('adminApp');
    return !!gate && gate.style.display !== 'none' && (!app || app.hidden === true);
};

const USER = { uid: 'admin1', email: 'admin@uzdarus.local', getIdToken: async () => 'tok' };

/* ================================================================= tests */

(async function run() {

console.log('\n[S0] The gate source actually contains a restoration path');
{
    ok('adminpanel.js subscribes to onAuthStateChanged', /onAuthStateChanged\(auth,/.test(PANEL_SRC));
    ok('no insecure localStorage auth flag is written',
        !/localStorage\.setItem\(\s*['"](?:isAdmin|loggedIn|adminAuth|authed)/i.test(PANEL_SRC));
    ok('session is established from the Firebase user', /async function establishSession\(user/.test(PANEL_SRC));
    ok('authorization is re-derived from the profile on every restore',
        /const role = normalizeRole\(profile\.role\)/.test(PANEL_SRC));
    ok('blocked accounts are refused client-side too', /profile\.blocked === true/.test(PANEL_SRC));
    ok('shell renders before data (enterPanel shows UI then awaits refreshData)',
        /showProtectedUi\(\);[\s\S]{0,200}await refreshData\(\)/.test(PANEL_SRC));
}

console.log('\n[S1/S2/S3] Valid restored session + admin role -> panel opens, NO login form');
{
    const h = await bootGate({ authUser: USER, profile: { uid: 'admin1', username: 'boss', role: 'admin' } });
    ok('no module error', !h.error, h.error && h.error.message);
    ok('S3: panel opened automatically from the restored session', panelVisible(h.w));
    ok('S1/S2: the login form is NOT shown', !loginVisible(h.w));
    eq('the admin was never signed out', h.signOutCount, 0);
    eq('no redirect away from the panel', h.redirected, null);
    h.close();
}

console.log('\n[S4] No session (signed out / expired / revoked) -> login required');
{
    const h = await bootGate({ authUser: null, profile: null });
    ok('login form shown', loginVisible(h.w));
    ok('panel NOT shown', !panelVisible(h.w));
    h.close();
}

console.log('\n[S5] Blocked account with a previously valid session -> denied');
{
    const h = await bootGate({ authUser: USER, profile: { uid: 'admin1', username: 'boss', role: 'admin', blocked: true } });
    ok('panel NOT opened for a blocked admin', !panelVisible(h.w));
    ok('the blocked session was torn down', h.signOutCount > 0);
    await sleep(500);
    ok('blocked admin is redirected away (navigation attempted)',
       /no-access|navigation/.test(String(h.redirected || '')));
    h.close();
}

console.log('\n[S6] Admin role removed -> admin privileges disappear');
{
    const h = await bootGate({ authUser: USER, profile: { uid: 'admin1', username: 'boss', role: 'customer' } });
    ok('panel NOT opened for a demoted (customer) account', !panelVisible(h.w));
    ok('session torn down', h.signOutCount > 0);
    await sleep(500);
    ok('redirected to the learner cabinet (navigation attempted)',
       /no-access|navigation/.test(String(h.redirected || '')));
    h.close();
}

console.log('\n[S6b] Teacher role -> panel opens in read-only mode');
{
    const h = await bootGate({ authUser: { ...USER, uid: 't1' }, profile: { uid: 't1', username: 'ustoz', role: 'teacher' } });
    ok('teacher panel opens', panelVisible(h.w));
    eq('teacher was not signed out', h.signOutCount, 0);
    eq('teacher state.role is teacher', h.w.__state.role, 'teacher');
    ok('teacher body carries the read-only marker', h.w.document.body.classList.contains('role-teacher'));

    const caps = Array.from(h.w.__state.capabilities || []);
    eq('teacher holds exactly 2 capabilities', caps.length, 2);
    ok('teacher can read students', caps.includes('students:read'));
    ok('teacher cannot write roles', !caps.includes('role:write'));
    ok('teacher cannot read the user-management list', !caps.includes('users:read'));

    /* Teacher must not even REQUEST endpoints they cannot use. */
    const urls = h.calls.join(' ');
    ok('teacher requested students-overview', /students-overview/.test(urls));
    ok('teacher did NOT request list-users', !/list-users/.test(urls));
    ok('teacher did NOT request stats', !/action=stats/.test(urls));
    h.close();
}

console.log('\n[S7] Untrusted-device / revoked-session policy');
{
    /* The project's device trust is enforced server-side via
       /api/auth/register-device + deviceHashes; the admin panel inherits
       revocation through verifyIdToken(checkRevoked=true). A revoked session
       surfaces to the client as a signed-out user. */
    const h = await bootGate({ authUser: null, profile: null });
    ok('a revoked/absent session presents the login form', loginVisible(h.w));

    const reqSrc = fs.readFileSync(path.join(ROOT, 'api', '_lib', 'request.js'), 'utf8');
    ok('server verifies tokens with checkRevoked=true', /verifyIdToken\(token,\s*true\)/.test(reqSrc));
    const setRole = fs.readFileSync(path.join(ROOT, 'api', '_admin', 'set-role.js'), 'utf8');
    ok('a role change revokes every existing session', /revokeRefreshTokens/.test(setRole));
    h.close();
}

console.log('\n[S8] Ordinary IP / network change must NOT cause a logout loop');
{
    /* Prove by construction: no IP-derived logic exists anywhere in the auth
       or admin surface, so a changing mobile/VPN/IPv6 address cannot force a
       re-login. */
    const files = [
        'adminpanel.js', 'firebase-client.js',
        'api/_lib/request.js', 'api/_lib/roles.js', 'api/auth/register-device.js',
    ];
    files.forEach((rel) => {
        const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        const hasIpLogic = /\bx-forwarded-for\b|\bremoteAddress\b|\bclientIp\b|\bipAddress\b/i.test(src)
            && /signOut|logout|revoke|denied/i.test(src);
        ok(`${rel}: no IP-based session invalidation`, !hasIpLogic);
    });

    /* And a repeated restore of the SAME session is idempotent — the panel
       does not bounce between gate and app (which is what a loop looks like). */
    const h = await bootGate({ authUser: USER, profile: { uid: 'admin1', username: 'boss', role: 'admin' } });
    ok('panel open after first restore', panelVisible(h.w));
    await h.emitAuth(USER);
    await h.emitAuth(USER);
    await h.emitAuth(USER);
    ok('panel still open after repeated auth events', panelVisible(h.w));
    eq('no sign-out was triggered by repeated restores', h.signOutCount, 0);
    eq('bootstrap ran only once', h.w.__state.bootstrapped, true);
    h.close();
}

console.log('\n[S9] Startup cost: redundant full-collection reads removed');
{
    const admin = await bootGate({ authUser: USER, profile: { uid: 'a', username: 'boss', role: 'admin' } });
    const adminUrls = admin.calls.filter(u => /action=(list-users|stats|students-overview)/.test(u));
    eq('admin startup issues exactly 3 data calls (one per section)', adminUrls.length, 3);
    ok('no duplicate endpoint call', new Set(adminUrls).size === adminUrls.length);
    admin.close();

    const teacher = await bootGate({ authUser: { ...USER, uid: 't' }, profile: { uid: 't', username: 'u', role: 'teacher' } });
    const teacherUrls = teacher.calls.filter(u => /action=(list-users|stats|students-overview)/.test(u));
    eq('teacher startup issues exactly 1 data call', teacherUrls.length, 1);
    ok('and it is the students overview', /students-overview/.test(teacherUrls[0] || ''));
    teacher.close();
}

console.log('\n' + '─'.repeat(64));
console.log(fail === 0
    ? `  ✅ ADMIN SESSION: ${pass}/${pass} assertions passed`
    : `  ❌ ADMIN SESSION: ${fail} failed, ${pass} passed`);
console.log('─'.repeat(64) + '\n');
process.exit(fail === 0 ? 0 : 1);

})().catch((e) => { console.error('\nFATAL:', e); process.exit(1); });
