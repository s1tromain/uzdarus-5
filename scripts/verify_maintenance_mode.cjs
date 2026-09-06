#!/usr/bin/env node
/**
 * verify_maintenance_mode.cjs — the platform-wide maintenance mode.
 *
 * Three things have to be true and are easy to fake:
 *
 *   1. The platform really is unusable — not merely covered by an overlay a
 *      learner can delete in devtools. The server refuses their writes.
 *   2. Only a developer can flip the switch, and that is enforced where it
 *      counts, not by hiding a button.
 *   3. The paid days really do stop burning. "Frozen" is arithmetic, not a
 *      sentence on a screen, so the arithmetic is what gets tested.
 *
 *   UI_SUITE_FAST=1   the browser half only at one viewport
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { launch, serveRepo, sleep } = require('./_cdp_driver.cjs');

const ROOT = path.join(__dirname, '..');
const FAST = process.env.UI_SUITE_FAST === '1';
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const DAY = 86400000;

console.log('\n=== MAINTENANCE MODE — the switch, the wall and the frozen days ===' +
            (FAST ? '  [FAST subset]' : ''));

(async () => {
const M = await import(pathToFileURL(path.join(ROOT, 'maintenance-state.js')).href);
const R = await import(pathToFileURL(path.join(ROOT, 'api/_lib/roles.js')).href);

/* ================================================================ *
 * 1. WHO MAY FLIP THE SWITCH
 * ================================================================ */
{
    const cap = R.CAPABILITIES.MAINTENANCE_WRITE;
    ok(!!cap, 'the maintenance capability exists');
    eq('developer may switch the platform off', R.roleHasCapability('developer', cap), true);
    for (const role of ['admin', 'moderator', 'teacher', 'customer', 'user', 'nonsense']) {
        eq(`${role} may NOT`, R.roleHasCapability(role, cap), false);
    }
    eq('only developer bypasses the wall', M.bypassesMaintenance('developer'), true);
    for (const role of ['admin', 'moderator', 'teacher', 'customer', '', null]) {
        eq(`${role || '(anonymous)'} does not bypass`, M.bypassesMaintenance(role), false);
    }
    /* the admin panel's own copy of the table must agree with the server's */
    const panel = read('admin-roles.js');
    ok(/MAINTENANCE_WRITE/.test(panel), 'the panel knows the capability');
    ok(!/ADMIN_CAPABILITIES = \[[^\]]*MAINTENANCE_WRITE/s.test(panel),
        'and does not hand it to admin');
}

/* ================================================================ *
 * 2. THE PAID DAYS
 * ---------------------------------------------------------------- *
 * Every property the product promises, as arithmetic.
 * ================================================================ */
{
    const T0 = 1_700_000_000_000;
    const closed = (start, end) => ({ active: false, windows: [{ start, end }] });
    const sub = (startAt, endAt) => ({ active: true, startAt, endAt, updatedAt: startAt });

    /* five days left, three days off, five days left */
    {
        const s = sub(T0 - 10 * DAY, T0 + 5 * DAY);
        const state = closed(T0, T0 + 3 * DAY);
        const now = T0 + 3 * DAY;
        eq('five days survive three days of maintenance',
            Math.round((M.effectiveEndAtMs(s, state, now) - now) / DAY), 5);
    }

    /* the same three days, read a thousand times, are still three days */
    {
        const s = sub(T0 - 10 * DAY, T0 + 5 * DAY);
        const state = closed(T0, T0 + 3 * DAY);
        const now = T0 + 3 * DAY;
        const first = M.maintenanceCreditMs(s, state, now);
        let same = true;
        for (let i = 0; i < 1000; i++) {
            if (M.maintenanceCreditMs(s, state, now) !== first) same = false;
        }
        ok(same, 'reading the credit never adds to it');
        eq('and it is exactly the window', first, 3 * DAY);
    }

    /* several windows add up, and only once each */
    {
        const s = sub(T0 - 10 * DAY, T0 + 20 * DAY);
        const state = { active: false, windows: [
            { start: T0, end: T0 + 2 * DAY },
            { start: T0 + 5 * DAY, end: T0 + 6 * DAY },
            { start: T0 + 9 * DAY, end: T0 + 12 * DAY }
        ] };
        eq('three windows are six days', M.maintenanceCreditMs(s, state, T0 + 12 * DAY), 6 * DAY);
    }

    /* a window the subscription never lived through is not credited */
    {
        const expired = sub(T0 - 40 * DAY, T0 - DAY);
        eq('a period that ended before the outage gets nothing',
            M.maintenanceCreditMs(expired, closed(T0, T0 + 3 * DAY), T0 + 3 * DAY), 0);
        const future = sub(T0 + 10 * DAY, T0 + 40 * DAY);
        eq('and one that began after it gets nothing either',
            M.maintenanceCreditMs(future, closed(T0, T0 + 3 * DAY), T0 + 40 * DAY), 0);
    }

    /* a tariff activated mid-outage keeps every day it paid for */
    {
        const s = sub(T0 + DAY, T0 + DAY + 30 * DAY);
        const state = closed(T0, T0 + 3 * DAY);
        const now = T0 + 3 * DAY;
        eq('a tariff sold during the outage still has thirty days',
            Math.round((M.effectiveEndAtMs(s, state, now) - now) / DAY), 30);
    }

    /* an extension during the outage survives */
    {
        const before = sub(T0 - 10 * DAY, T0 + 5 * DAY);
        const extended = sub(T0 - 10 * DAY, T0 + 35 * DAY);   /* admin added 30 days */
        const state = closed(T0, T0 + 3 * DAY);
        const now = T0 + 3 * DAY;
        eq('the extension is not lost',
            Math.round((M.effectiveEndAtMs(extended, state, now) - now) / DAY), 35);
        ok(M.effectiveEndAtMs(extended, state, now) > M.effectiveEndAtMs(before, state, now),
            'and it is still worth more than the shorter one');
    }

    /* the window still open counts as far as now, and no further */
    {
        const s = sub(T0 - 10 * DAY, T0 + 5 * DAY);
        const open = { active: true, startedAt: T0, windows: [] };
        eq('an open window counts up to now',
            M.maintenanceCreditMs(s, open, T0 + 2 * DAY), 2 * DAY);
        eq('and not into the future',
            M.maintenanceCreditMs(s, open, T0), 0);
    }

    /* a perpetual plan is not converted into a timed one */
    {
        const forever = { active: true, startAt: T0 - 10 * DAY, endAt: null, updatedAt: T0 };
        eq('a lifetime plan is credited nothing',
            M.maintenanceCreditMs(forever, closed(T0, T0 + 3 * DAY), T0 + 3 * DAY), 0);
        eq('and has no effective end', M.effectiveEndAtMs(forever, closed(T0, T0 + 3 * DAY), T0), null);
    }

    /* legacy records without startAt still behave */
    {
        const legacy = { active: true, endAt: T0 + 5 * DAY, updatedAt: T0 - 10 * DAY };
        eq('an old record falls back to updatedAt',
            M.maintenanceCreditMs(legacy, closed(T0, T0 + 3 * DAY), T0 + 3 * DAY), 3 * DAY);
        const bare = { active: true, endAt: T0 + 5 * DAY };
        eq('and one with neither is credited nothing rather than guessed',
            M.maintenanceCreditMs(bare, closed(T0, T0 + 3 * DAY), T0 + 3 * DAY), 0);
    }

    /* midnight and time zones cannot add a day: the arithmetic is in ms */
    {
        const s = sub(T0 - 10 * DAY, T0 + 5 * DAY);
        const overMidnight = closed(T0 + 0.4 * DAY, T0 + 0.6 * DAY);
        eq('a window across midnight is worth its own length',
            M.maintenanceCreditMs(s, overMidnight, T0 + DAY), Math.round(0.2 * DAY));
    }

    /* a malformed document is "not in maintenance", never a crash */
    for (const junk of [null, undefined, 'off', 42, { active: 'yes' }, { windows: 'nope' }]) {
        const st = M.normalizeState(junk);
        eq(`junk state (${JSON.stringify(junk)}) reads as off`, st.active, false);
        eq('and credits nothing', M.maintenanceCreditMs(sub(T0, T0 + DAY), st, T0), 0);
    }
}

/* ================================================================ *
 * 3. THE SERVER IS THE RULE
 * ================================================================ */
{
    const endpoint = read('api/maintenance.js');
    ok(/requireSession/.test(endpoint), 'the write verifies a Firebase ID token');
    ok(/requireCapability\(session, CAPABILITIES\.MAINTENANCE_WRITE\)/.test(endpoint),
        'and the maintenance capability');
    ok(/bypassesMaintenance\(session\.role\)/.test(endpoint),
        'and says developer a second time in the endpoint that can take the platform down');
    ok(/action === 'status'/.test(endpoint) && !/requireSession[\s\S]{0,400}action === 'status'/.test(endpoint),
        'the status read needs no session');
    ok(/no-store/.test(endpoint), 'and is never served from a cache');
    ok(/writeAuditLog/.test(endpoint), 'every switch is written to the audit log');

    const store = read('api/_lib/maintenance-store.js');
    ok(/runTransaction/.test(store), 'the state changes inside a transaction');
    ok(/current\.active === want/.test(store), 'and asking for the state it is in changes nothing');
    ok(/Timestamp\.now\(\)/.test(store) && !/new Date\(\)/.test(store),
        'every timestamp is the server’s, never the caller’s clock');

    const guard = read('api/_lib/maintenance-guard.js');
    ok(/MAINTENANCE_HTTP_STATUS/.test(guard), 'a refused write answers 503');
    ok(/MAINTENANCE_ERROR_CODE/.test(guard), 'with a code the page can act on');
    ok(/bypassesMaintenance/.test(guard), 'and lets a developer through');

    for (const rel of ['api/_progress/complete-component.js',
                       'api/_progress/complete-topic.js',
                       'api/_progress/final-exam.js']) {
        const src = read(rel);
        ok(/assertNotInMaintenance\(session\)/.test(src), `${rel} is behind the wall`);
        const at = src.indexOf('assertNotInMaintenance');
        const sess = src.indexOf('requireSession');
        ok(sess >= 0 && at > sess, `${rel} checks the session first, so a developer is known`);
    }

    /* the admin endpoints are NOT walled: staff must keep working, and only a
       developer can lift the mode in the first place */
    ok(!/assertNotInMaintenance/.test(read('api/admin.js')),
        'the admin router is not walled off');

    const rules = read('firestore.rules');
    ok(/match \/system\/\{documentId\}/.test(rules), 'the rules name the system collection');
    {
        /* THE BLOCK, NOT A WINDOW AROUND IT. A fixed-length slice reached into
           the catch-all rule that follows, whose own "if false" satisfied the
           check no matter what the system rule said. */
        /* the first "{" after the path is the one in {documentId}; the block
           opens at the brace that follows the closing "}" of the wildcard */
        const at = rules.indexOf('match /system/');
        const wildcardEnd = rules.indexOf('}', at);
        const open = rules.indexOf('{', wildcardEnd);
        const block = rules.slice(open, rules.indexOf('}', open) + 1);
        ok(/allow\s+read,\s*write:\s*if\s+false\s*;/.test(block),
            `and deny the client both ways (${block.replace(/\s+/g, ' ').trim()})`);
        ok(!/if\s+true/.test(block), 'with nothing that grants it');
    }

    const client = read('firebase-client.js');
    ok(/maintenanceEffectiveEndAtMs/.test(client),
        'the subscription clock discounts maintenance');
    ok(!/localStorage[^\n]*maintenance/i.test(client),
        'and never takes the state from browser storage');
}

/* ================================================================ *
 * 3b. THE HANDLER ITSELF, CALLED
 * ---------------------------------------------------------------- *
 * Reading the source proves the right words are present; it does not
 * prove the endpoint answers. It shipped once calling assertMethod with
 * the wrong signature, which turned every status read into a 400 — and
 * every assertion above still passed. So the handler gets driven.
 * ================================================================ */
{
    const os = require('os');
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'uz-maint-'));
    const url = (rel) => JSON.stringify(pathToFileURL(path.join(ROOT, rel)).href);
    const write = (name, src, map) => {
        let out = src;
        for (const [from, to] of Object.entries(map)) {
            out = out.split(`'${from}'`).join(to);
        }
        fs.writeFileSync(path.join(TMP, name), out);
    };

    fs.writeFileSync(path.join(TMP, 'admin-stub.mjs'),
        'export function initAdmin() { return globalThis.__ADMIN; }');
    write('request.mjs', read('api/_lib/request.js'), {
        '../_firebaseAdmin.js': "'./admin-stub.mjs'",
        './roles.js': url('api/_lib/roles.js')
    });
    write('store.mjs', read('api/_lib/maintenance-store.js'), {
        '../_firebaseAdmin.js': "'./admin-stub.mjs'",
        '../../maintenance-state.js': url('maintenance-state.js')
    });
    fs.writeFileSync(path.join(TMP, 'audit-stub.mjs'),
        'export async function writeAuditLog() {}');
    write('endpoint.mjs', read('api/maintenance.js'), {
        './_lib/request.js': "'./request.mjs'",
        './_lib/roles.js': url('api/_lib/roles.js'),
        './_lib/maintenance-store.js': "'./store.mjs'",
        '../maintenance-state.js': url('maintenance-state.js'),
        './_lib/audit.js': "'./audit-stub.mjs'"
    });

    let stored = null;
    /* A CLOCK THAT MOVES. With a frozen one the window between switching on and
       off has zero length and is rightly not recorded — which would make this
       test agree with a store that recorded nothing at all. Each read advances
       an hour, so the outage has a real duration. */
    let clock = Date.UTC(2026, 0, 1);
    const Timestamp = {
        now: () => { clock += 3600000; return { toMillis: () => clock }; },
        fromMillis: (m) => ({ toMillis: () => m })
    };
    globalThis.__ADMIN = {
        Timestamp,
        adminAuth: { verifyIdToken: async (t) => {
            if (t === 'dev') return { uid: 'u-dev' };
            if (t === 'admin') return { uid: 'u-admin' };
            throw new Error('bad token');
        } },
        adminDb: {
            collection: () => ({ doc: () => ({
                get: async () => ({ exists: !!stored, data: () => stored })
            }) }),
            runTransaction: async (fn) => fn({
                get: async () => ({ exists: !!stored, data: () => stored }),
                set: (ref, data) => { stored = Object.assign({}, stored, data); }
            })
        }
    };
    /* requireSession reads the profile from adminDb.collection('users') */
    const users = { 'u-dev': { role: 'developer' }, 'u-admin': { role: 'admin' } };
    globalThis.__ADMIN.adminDb.collection = (name) => ({
        doc: (id) => ({
            get: async () => (name === 'users'
                ? { exists: !!users[id], data: () => users[id] }
                : { exists: !!stored, data: () => stored })
        })
    });

    const handler = (await import(pathToFileURL(path.join(TMP, 'endpoint.mjs')).href)).default;

    function call(method, query, headers, body) {
        const res = { statusCode: null, payload: null, headers: {},
            setHeader(k, v) { this.headers[k] = v; },
            status(c) { this.statusCode = c; return this; },
            json(p) { this.payload = p; return this; },
            end() { return this; } };
        return handler({ method, query, headers: headers || {}, body }, res)
            .then(() => res);
    }

    {
        const res = await call('GET', { action: 'status' }, {});
        eq('GET status answers 200', res.statusCode, 200);
        ok(res.payload && res.payload.ok === true, 'and says ok');
        eq('with the mode off by default', res.payload.maintenance.active, false);
        ok(/no-store/.test(String(res.headers['Cache-Control'] || '')),
            'and forbids caching');
        ok(!('updatedBy' in res.payload.maintenance),
            'an anonymous reader is not told who last changed it');
    }
    {
        const res = await call('POST', { action: 'status' }, {});
        eq('POST to status is refused', res.statusCode, 405);
    }
    {
        const res = await call('POST', { action: 'set' }, {}, { active: true });
        eq('setting it without a token is refused', res.statusCode, 401);
    }
    {
        const res = await call('POST', { action: 'set' },
            { authorization: 'Bearer admin' }, { active: true });
        eq('an ordinary admin is refused by the SERVER, not by a hidden button',
            res.statusCode, 403);
        eq('and the platform is still on', stored, null);
    }
    {
        const res = await call('POST', { action: 'set' },
            { authorization: 'Bearer dev' }, { active: true, reason: 'Bazani yangilash' });
        eq('a developer may switch it on', res.statusCode, 200);
        eq('and it reports the change', res.payload.changed, true);
        eq('the platform is off', res.payload.maintenance.active, true);
        eq('with the reason the learner will read', res.payload.maintenance.reason, 'Bazani yangilash');
    }
    {
        const again = await call('POST', { action: 'set' },
            { authorization: 'Bearer dev' }, { active: true, reason: 'Bazani yangilash' });
        eq('switching it on twice changes nothing', again.payload.changed, false);
        eq('and no window has been closed yet', (stored.windows || []).length, 0);
    }
    {
        const res = await call('POST', { action: 'set' },
            { authorization: 'Bearer dev' }, { active: false });
        eq('a developer may switch it off', res.statusCode, 200);
        eq('the platform is back', res.payload.maintenance.active, false);
        const off = await call('POST', { action: 'set' },
            { authorization: 'Bearer dev' }, { active: false });
        eq('switching it off twice changes nothing', off.payload.changed, false);
        eq('and the pause is recorded exactly once', (stored.windows || []).length, 1);
    }
    {
        const res = await call('GET', { action: 'status' },
            { authorization: 'Bearer dev' });
        ok(res.payload.maintenance.updatedBy, 'signed-in staff are told who changed it');
    }
    {
        const res = await call('GET', { action: 'nonsense' }, {});
        eq('an unknown action is a plain 400', res.statusCode, 400);
    }
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
}

/* ================================================================ *
 * 4. EVERY USER PAGE IS BEHIND THE GATE
 * ================================================================ */
{
    /* EVERY page the platform serves, found rather than listed — a page added
       to a folder nobody remembered is exactly how a gate ends up with a hole
       in it, and my.cabinet/ was one. Test fixtures are not the platform. */
    function everyPage(dir, prefix) {
        const out = [];
        for (const entry of fs.readdirSync(path.join(ROOT, dir || '.'), { withFileTypes: true })) {
            const rel = (prefix ? prefix + '/' : '') + entry.name;
            if (entry.isDirectory()) {
                if (['node_modules', '.git', 'tests', 'scripts', 'api', 'images',
                     'audios', 'grammar-data'].includes(entry.name)) continue;
                out.push(...everyPage(path.join(dir || '.', entry.name), rel));
            } else if (entry.name.endsWith('.html')) {
                out.push(rel);
            }
        }
        return out;
    }
    const pages = everyPage('', '');
    ok(pages.length >= 30, `every page is inspected (${pages.length})`);
    ok(pages.some((f) => f.startsWith('my.cabinet/')), 'the cabinet is inspected too');

    /* the admin panel is the way back in: gating it would leave nobody able to
       lift the mode. Everything else, the developer's own rehearsal page
       included, goes through the same gate. */
    const exempt = new Set(['adminpanel.html']);
    for (const rel of pages) {
        const src = read(rel);
        if (exempt.has(rel)) {
            ok(!/src="[^"]*maintenance-gate\.js"/.test(src), `${rel} is deliberately not gated`);
            continue;
        }
        ok(/src="[^"]*maintenance-gate\.js"/.test(src), `${rel} loads the gate`);
        /* not deferred, or the platform paints before the answer arrives */
        const tag = (src.match(/<script[^>]*maintenance-gate\.js[^>]*>/) || [''])[0];
        ok(!/\bdefer\b|\basync\b/.test(tag), `${rel} loads it blocking (${tag.trim().slice(0, 70)})`);
    }
    ok(/data-uzm-page="login"/.test(read('my.cabinet/index.html')),
        'the sign-in form is marked, so a signed-out developer can get back in');
    ok(!/data-uzm-page="login"/.test(read('auth.html')),
        'and auth.html, which only forwards to it, is not');
}

/* ================================================================ *
 * 5. WHAT THE LEARNER ACTUALLY SEES
 * ================================================================ */
const site = await serveRepo();
const browser = await launch();
const U = (x) => `http://127.0.0.1:${site.port}${x}`;
console.log(`  driver: ${browser.version} · real pages, stubbed state endpoint`);

try {
    const p = await browser.newPage();
    let state = { active: false, version: 1, reason: '', startedAt: null, currentMs: 0 };
    let role = null;

    /* the driver fulfils a route with a plain string body; fetch().json()
       parses it regardless of the content type it is served under */
    await p.route((u) => (/\/api\/maintenance/.test(u)
        ? JSON.stringify({ ok: true, maintenance: state })
        : null));

    async function open(url, viewer, opts) {
        role = viewer;
        await p.onNewDocument(viewer
            ? `try{localStorage.setItem('currentUser',JSON.stringify({id:'m',email:'m@t.uz',role:'${viewer}'}));}catch(e){}`
            : `try{localStorage.removeItem('currentUser');}catch(e){}`);
        await p.goto(U(url), { waitMs: (opts && opts.waitMs) || 2000 });
    }

    /**
     * A PAID PAGE SENDS A VISITOR WITHOUT A SESSION SOMEWHERE ELSE, and that
     * redirect is the platform working. What matters is that wherever the
     * learner lands, the notice is what they get — so this waits for the screen
     * across whatever navigation the page performs rather than assuming the
     * first URL is the last one.
     */
    async function waitForScreen(want, ms) {
        const deadline = Date.now() + (ms || 6000);
        while (Date.now() < deadline) {
            const has = await p.evaluate(
                `return !!document.querySelector('.uzm-screen');`).catch(() => false);
            if (has === want) return true;
            await sleep(200);
        }
        return false;
    }

    const SCREEN = `
     var s=document.querySelector('.uzm-screen');
     var body=document.body;
     var cs=s?getComputedStyle(s):null;
     function lum(c){var m=String(c||'').match(/[\\d.]+/g)||[255,255,255];
       var v=m.slice(0,3).map(function(x){x=x/255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4);});
       return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2];}
     return JSON.stringify({
       shown:!!s,
       staff:!!document.querySelector('.uzm-staff'),
       hidden:document.documentElement.classList.contains('uzm-checking'),
       bodyVisible:getComputedStyle(body).visibility!=='hidden',
       lum:s?lum(cs.backgroundColor):null,
       title:s?(s.querySelector('.uzm-h1')||{textContent:''}).textContent.trim():'',
       calm:s?/hisoblanmaydi/.test(s.textContent):false,
       button:s?!!s.querySelector('[data-uzm="check"]'):false,
       reason:s?(s.querySelector('[data-uzm=\\"reason\\"]')||{hidden:true}).hidden:true,
       sideways:document.documentElement.scrollWidth>document.documentElement.clientWidth+2});`;

    const CATEGORIES = FAST
        ? [['/index.html', 'bosh sahifa'], ['/paid-courses/a1-course.html', 'pullik kurs']]
        : [['/index.html', 'bosh sahifa'],
           ['/a1-demo.html', 'demo'],
           ['/a1-demo-vocabulary.html', 'demo lug‘at'],
           ['/grammar-demo.html?course=A1&topic=1', 'grammar reader'],
           ['/paid-courses/a1-course.html', 'pullik kurs'],
           ['/paid-courses/a1-vocabulary.html', 'pullik lug‘at'],
           ['/paid-courses/a1-final-exam.html', 'imtihon'],
           ['/paid-courses/grammar-a1a2.html?course=A1&topic=1', 'pullik grammatika'],
           ['/tolov.html', 'tariflar'],
           ['/verify-certificate.html', 'sertifikat']];

    /* ---- the mode is ON ---- */
    state = { active: true, version: 2, reason: 'Bazani yangilash', startedAt: Date.now() - 60000, currentMs: 60000 };

    for (const [url, label] of CATEGORIES) {
        for (const viewer of (FAST ? ['customer'] : [null, 'customer'])) {
            await open(url, viewer);
            await waitForScreen(true, 6000);
            const s = JSON.parse(await p.evaluate(SCREEN));
            const N = `${label} · ${viewer || 'anonim'}`;
            ok(s.shown, `${N}: texnik ishlar ekrani ko‘rinadi`);
            ok(!s.staff, `${N}: xizmat banneri yo‘q`);
            ok(s.lum !== null && s.lum > 0.75, `${N}: ekran yorug‘`);
            ok(/texnik ishlar/i.test(s.title), `${N}: sarlavha to‘g‘ri`);
            ok(s.calm, `${N}: obuna kunlari haqida tinchlantiruvchi matn bor`);
            ok(s.button, `${N}: "Holatni tekshirish" tugmasi bor`);
            eq(`${N}: sabab ko‘rsatilgan`, s.reason, false);
            eq(`${N}: gorizontal skroll yo‘q`, s.sideways, false);
        }
    }

    /* a deep link with a query string is no way round it */
    for (const url of ['/paid-courses/b2-course.html?topic=7',
                       '/paid-courses/a1-final-exam.html?start=1',
                       '/grammar-demo.html?course=B1&topic=2&demo=1']) {
        await open(url, 'customer');
        ok(await waitForScreen(true, 6000), `to‘g‘ridan-to‘g‘ri havola ${url} chetlab o‘tmaydi`);
    }

    /* a reload does not get past it either */
    await open('/paid-courses/a1-course.html', 'customer');
    await waitForScreen(true, 6000);
    await p.goto(U('/paid-courses/a1-course.html'), { waitMs: 2000 });
    ok(await waitForScreen(true, 6000), 'sahifani yangilash ham chetlab o‘tmaydi');

    /* ---- the developer keeps working ---- */
    /* pages that render for a visitor without a Firebase session, so what is
       measured is the gate's decision and not the platform's own redirect */
    const OPEN_PAGES = FAST
        ? [['/index.html', 'bosh sahifa']]
        : [['/index.html', 'bosh sahifa'], ['/a1-demo.html', 'demo'],
           ['/tolov.html', 'tariflar'], ['/verify-certificate.html', 'sertifikat']];
    for (const [url, label] of OPEN_PAGES) {
        await open(url, 'developer');
        await sleep(1200);
        const s = JSON.parse(await p.evaluate(SCREEN));
        ok(!s.shown, `${label} · developer: platforma ochiq`);
        ok(s.staff, `${label} · developer: xizmat banneri ko‘rinadi`);
        ok(s.bodyVisible, `${label} · developer: sahifa ko‘rinadi`);
    }

    /* ---- a dark phone still gets a light notice ---- */
    await p.send('Emulation.setEmulatedMedia',
        { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await p.setDevice(360, 800, true);
    await open('/index.html', 'customer');
    {
        const s = JSON.parse(await p.evaluate(SCREEN));
        ok(s.shown && s.lum > 0.75, `tungi rejimda ham ekran yorug‘ (${s.lum})`);
        eq('tungi rejimda gorizontal skroll yo‘q', s.sideways, false);
    }
    /* 320px is the narrowest phone the platform claims to support */
    await p.setDevice(320, 640, true);
    await open('/index.html', 'customer');
    {
        const s = JSON.parse(await p.evaluate(SCREEN));
        ok(s.shown, '320px da ham ko‘rinadi');
        eq('320px da gorizontal skroll yo‘q', s.sideways, false);
    }
    await p.send('Emulation.setEmulatedMedia', { features: [] });

    /* ---- reduced motion stops the gears ---- */
    await p.send('Emulation.setEmulatedMedia',
        { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await open('/index.html', 'customer');
    {
        const anim = await p.evaluate(
            `var g=document.querySelector('.uzm-gear');
             return g?getComputedStyle(g).animationName:'none';`);
        eq('harakat kamaytirilganda tishli g‘ildiraklar aylanmaydi', anim, 'none');
    }
    await p.send('Emulation.setEmulatedMedia', { features: [] });
    await p.setDevice(390, 844, true);

    /* ---- and when it is switched off, the learner is let back in ---- */
    {
        await open('/index.html', 'customer');
        ok(await waitForScreen(true, 6000), 'ekran hali ko‘rinadi');
        state = { active: false, version: 3, reason: '', startedAt: null, currentMs: 0 };
        await p.evaluate(`window.UzMaintenanceGate.check(true); return 1;`);
        await sleep(2600);
        const s = JSON.parse(await p.evaluate(SCREEN));
        ok(!s.shown, 'o‘chirilgach ekran yo‘qoladi');
        ok(s.bodyVisible, 'va foydalanuvchi so‘ragan sahifaga qaytadi');
    }

    /* ---- with the mode off nothing changes at all ---- */
    for (const [url, label] of (FAST ? [OPEN_PAGES[0]] : OPEN_PAGES)) {
        await open(url, 'customer');
        await sleep(900);
        const s = JSON.parse(await p.evaluate(SCREEN));
        ok(!s.shown, `${label}: o‘chirilgan rejimda ekran yo‘q`);
        ok(!s.staff, `${label}: banner ham yo‘q`);
        ok(s.bodyVisible, `${label}: sahifa ko‘rinadi`);
        ok(!s.hidden, `${label}: hech narsa yashirilmagan`);
    }

    /* ---- the sign-in page keeps its way back in ---- */
    state = { active: true, version: 4, reason: '', startedAt: Date.now(), currentMs: 0 };
    await open('/my.cabinet/index.html', null);
    {
        const has = await p.evaluate(`return !!document.querySelector('[data-uzm="staff"]');`);
        ok(has, 'kirish sahifasida xodimlar uchun yo‘l bor');
        await p.evaluate(`var b=document.querySelector('[data-uzm="staff"]'); if(b)b.click(); return 1;`);
        await sleep(400);
        const s = JSON.parse(await p.evaluate(SCREEN));
        ok(!s.shown && s.bodyVisible, 'va u kirish formasini ochadi');
    }
    /* every other page has no such door */
    await open('/index.html', 'customer');
    await waitForScreen(true, 6000);
    eq('boshqa sahifalarda bunday yo‘l yo‘q',
        await p.evaluate(`return !!document.querySelector('[data-uzm="staff"]');`), false);

    state = { active: false, version: 5, reason: '', startedAt: null, currentMs: 0 };
} catch (e) {
    fail++; failures.push('harness: ' + (e && e.message));
}

console.log('='.repeat(64));
if (fail) {
    console.log(`  ❌ MAINTENANCE MODE: ${fail} failed, ${pass} passed`);
    failures.slice(0, 40).forEach((f) => console.log('     • ' + f));
} else {
    console.log(`  ✅ MAINTENANCE MODE: ${pass}/${pass} passed`);
}
console.log('='.repeat(64) + '\n');
await browser.close();
if (site.close) site.close();
process.exit(fail ? 1 : 0);
})();
