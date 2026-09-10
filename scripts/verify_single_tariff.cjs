#!/usr/bin/env node
/**
 * verify_single_tariff.cjs — the platform sells one paid plan, called PREMIUM.
 *
 * The easy version of this change is a display map and a hidden section, and
 * the easy version leaks: an old name surfaces in the admin table, a request
 * built by hand stores TURBO again, a footer link points at an anchor that no
 * longer exists. So this checks the three layers separately —
 *
 *   what a person SEES     rendered DOM at four widths, not the HTML source
 *   what the server STORES the endpoints driven with forged requests
 *   what the data SAYS     legacy values read as PREMIUM before any migration
 *
 * and it checks that the rename moved nothing else: packs, dates, days,
 * progress, role and access are decided by other fields entirely.
 *
 *   UI_SUITE_FAST=1   one width, the source and server checks in full
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');
const { launch, serveRepo, sleep } = require('./_cdp_driver.cjs');

const ROOT = path.join(__dirname, '..');
const FAST = process.env.UI_SUITE_FAST === '1';
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const OLD_NAMES = ['STARTER', 'STANDART', 'STANDARD', 'TURBO', 'GOLD', 'PLATINUM'];
const WIDTHS = FAST ? [[390, 844, true]]
    : [[320, 640, true], [375, 812, true], [768, 1024, false], [1440, 900, false]];

console.log('\n=== SINGLE TARIFF — one paid plan, called PREMIUM ===' + (FAST ? '  [FAST subset]' : ''));

(async () => {
const D = await import(pathToFileURL(path.join(ROOT, 'tariff-display.js')).href);
const H = await import(pathToFileURL(path.join(ROOT, 'api/_lib/user-helpers.js')).href);

/* ================================================================ *
 * 1. EVERY OLD PLAN READS AS PREMIUM, BEFORE ANY MIGRATION RUNS
 * ================================================================ */
{
    for (const old of OLD_NAMES.concat(['START'])) {
        eq(`${old} is shown as PREMIUM`, D.getTariffDisplayName(old, 'x'), 'PREMIUM');
        eq(`${old} normalises to PREMIUM`, H.normalizeTariff(old), 'PREMIUM');
        eq(`${old.toLowerCase()} too`, D.getTariffDisplayName(old.toLowerCase(), 'x'), 'PREMIUM');
    }
    eq('PREMIUM stays PREMIUM', D.getTariffDisplayName('PREMIUM', 'x'), 'PREMIUM');
    eq('and normalises to itself', H.normalizeTariff('PREMIUM'), 'PREMIUM');

    /* AN ACCOUNT WITH NO PLAN MUST NOT BE GIVEN ONE. This is the difference
       between renaming a plan and handing out a free subscription. */
    for (const empty of [null, undefined, '']) {
        eq(`${JSON.stringify(empty)} is not a paid plan`, D.isPaidTariff(empty), false);
        ok(H.normalizeTariff(empty) == null || H.normalizeTariff(empty) === '',
            `${JSON.stringify(empty)} is not normalised into one`);
        eq('and the caller\'s fallback is used', D.getTariffDisplayName(empty, 'Tarif yo‘q'), 'Tarif yo‘q');
    }
    /* something nobody sold keeps its own name rather than being absorbed */
    eq('an unfamiliar value is shown as itself',
        D.getTariffDisplayName('PLATFORM_OWNER', 'x'), 'PLATFORM_OWNER');
    eq('and is not claimed as paid', D.isPaidTariff('PLATFORM_OWNER'), false);

    eq('the site issues exactly one stored value', D.TARIFF_STORED_VALUES.length, 1);
    eq('and it is PREMIUM', D.TARIFF_STORED_VALUES[0], 'PREMIUM');
}

/* ================================================================ *
 * 2. THE SERVER DECIDES WHAT IS STORED
 * ================================================================ */
{
    eq('an active subscription stores PREMIUM', H.canonicalTariffForWrite(true), 'PREMIUM');
    eq('an inactive one stores no plan', H.canonicalTariffForWrite(false), null);

    /* buildSubscription is what every write path goes through */
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'uz-tariff-'));
    fs.writeFileSync(path.join(TMP, 'admin-stub.mjs'),
        'export function initAdmin() { return globalThis.__ADMIN; }');
    const abs = (rel) => JSON.stringify(pathToFileURL(path.join(ROOT, rel)).href);
    const src = read('api/_lib/user-helpers.js')
        .split("'../_firebaseAdmin.js'").join("'./admin-stub.mjs'")
        .split("'./roles.js'").join(abs('api/_lib/roles.js'))
        .split("'../../account-freeze.js'").join(abs('account-freeze.js'));
    fs.writeFileSync(path.join(TMP, 'helpers.mjs'), src);
    globalThis.__ADMIN = {
        Timestamp: { now: () => 'NOW', fromDate: (d) => ({ __d: d.toISOString() }) }
    };
    const M = await import(pathToFileURL(path.join(TMP, 'helpers.mjs')).href);

    for (const forged of ['START', 'TURBO', 'STARTER', 'STANDART', 'GOLD', 'anything', '']) {
        const sub = M.buildSubscription({ active: true, durationDays: 30, tariff: forged });
        eq(`a request carrying "${forged}" still stores PREMIUM`, sub.tariff, 'PREMIUM');
        eq('and stays active', sub.active, true);
        ok(sub.endAt, 'and keeps its end date');
    }
    {
        const sub = M.buildSubscription({ active: false, tariff: 'TURBO' });
        eq('an inactive subscription stores no plan at all', sub.tariff, null);
    }
    {
        /* the term the caller asked for is untouched by any of this */
        const a = M.buildSubscription({ active: true, durationDays: 30 });
        const b = M.buildSubscription({ active: true, durationDays: 365 });
        ok(a.endAt && b.endAt && String(a.endAt.__d) < String(b.endAt.__d),
            'a longer term is still a longer term');
    }
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}

    /* no write path may take the plan from the request any more */
    for (const rel of ['api/_admin/create-user.js', 'api/_admin/set-subscription.js',
                       'api/_admin/adjust-subscription-days.js']) {
        const s = read(rel);
        ok(!/tariff:\s*(body|values)\.tariff/.test(s), `${rel} does not read a tariff from the caller`);
        ok(!/'START'|"START"|'TURBO'|"TURBO"/.test(s.replace(/\/\*[\s\S]*?\*\//g, '')),
            `${rel} names no old plan in its code`);
    }
    {
        const s = read('api/send-payment.js');
        ok(/const TARIFF = 'PREMIUM'/.test(s), 'the payment request is for PREMIUM');
        ok(!/body\.tariff/.test(s), 'and does not take the plan from the form');
    }
}

/* ================================================================ *
 * 3. THE MIGRATION MOVES ONE FIELD AND IS SAFE TO REPEAT
 * ================================================================ */
{
    const s = read('scripts/migrate_tariffs.cjs');
    ok(/updateMask\.fieldPaths|'subscription\.tariff'/.test(s),
        'the migration writes a field path, never a document');
    ok(!/\.set\(/.test(s.replace(/searchParams\.set/g, '')),
        'it never re-creates a user document');
    for (const untouched of ['accessPacks', 'endAt', 'startAt', 'progress', 'role', 'blocked']) {
        ok(!new RegExp(`['"\`]${untouched}['"\`]\\s*:`).test(s),
            `it does not write ${untouched}`);
    }
    ok(/--apply/.test(s) && /DRY RUN/.test(s), 'it has a dry run and an explicit apply');
    ok(/kind === 'legacy'/.test(s), 'and only queues accounts that need it — so a second run writes nothing');
    /* the check is about what it PRINTS, so comments are not evidence either way */
    const code = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok(!/username|email|displayName/i.test(code), 'and it prints no personal data');
    ok(!/console\.log\([^)]*doc\.(id|ref)/.test(code), 'nor any account id');
}

/* ================================================================ *
 * 4. ACCESS IS NOT DECIDED BY THE PLAN NAME
 * ---------------------------------------------------------------- *
 * If it were, renaming everyone to PREMIUM would be a mass grant.
 * ================================================================ */
{
    const client = read('firebase-client.js');
    const packs = client.slice(client.indexOf('export function hasPackAccess'),
                               client.indexOf('export function canAccessPaid'));
    ok(!/tariff/.test(packs), 'pack access never looks at the tariff');
    const canAccess = client.slice(client.indexOf('export function canAccessPaid'),
                                   client.indexOf('export function isSubscriptionActive'));
    ok(!/tariff/.test(canAccess), 'nor does the paid-course gate');
    const active = client.slice(client.indexOf('export function hasActiveSubscription'),
                                client.indexOf('export function hasPackAccess'));
    ok(!/tariff/.test(active), 'nor does the subscription clock');
}

/* ================================================================ *
 * 5. WHAT A PERSON ACTUALLY SEES
 * ================================================================ */
const site = await serveRepo();
const browser = await launch();
const U = (x) => `http://127.0.0.1:${site.port}${x}`;
console.log(`  driver: ${browser.version} · rendered DOM at ${WIDTHS.length} width(s)`);

try {
    const p = await browser.newPage();
    await p.onNewDocument(
        `window.__errs=[];window.__rejects=[];
         window.addEventListener('error',function(e){window.__errs.push(String(e.message));});
         window.addEventListener('unhandledrejection',function(e){window.__rejects.push(String(e.reason));});`);

    /* every rendered word, every link, every menu — opened, not read from source */
    const SEEN = `
      var text = document.body.innerText || '';
      var links = Array.prototype.map.call(document.querySelectorAll('a[href]'),
          function (a) { return a.getAttribute('href'); });
      var navText = Array.prototype.map.call(
          document.querySelectorAll('nav, header, .nav-links, .navbar, footer, .footer'),
          function (n) { return n.innerText || ''; }).join(' ');
      return JSON.stringify({
        text: text,
        navText: navText,
        links: links,
        pricingNodes: document.querySelectorAll('.pricing, #pricing, .price-card, .pricing-grid, .price-badge').length,
        sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        errs: (window.__errs || []).slice(0, 3),
        rejects: (window.__rejects || []).slice(0, 3)
      });`;

    const PAGES = FAST
        ? [['/index.html', 'bosh sahifa']]
        : [['/index.html', 'bosh sahifa'],
           ['/tolov.html', 'to‘lov'],
           ['/a1-demo.html', 'A1 demo'],
           ['/b2-demo.html', 'B2 demo'],
           ['/my.cabinet/index.html', 'kabinet'],
           ['/verify-certificate.html', 'sertifikat'],
           ['/paid-courses/a1-course.html', 'A1 kurs']];

    for (const [url, label] of PAGES) {
        for (const [w, h, mob] of WIDTHS) {
            const N = `${label} ${w}px`;
            await p.setDevice(w, h, mob);
            await p.goto(U(url), { waitMs: 2600 });
            const s = JSON.parse(await p.evaluate(SEEN));

            /* the words themselves, in what was rendered */
            for (const word of ['Tariflar', 'Тарифы', 'Pricing']) {
                ok(!s.text.includes(word), `${N}: «${word}» ko‘rinmaydi`);
            }
            for (const oldName of OLD_NAMES) {
                ok(!new RegExp(`\\b${oldName}\\b`).test(s.text),
                    `${N}: «${oldName}» ko‘rinmaydi`);
            }
            /* START is a word in other languages; only the plan card matters */
            eq(`${N}: tarif bloklari yo‘q`, s.pricingNodes, 0);
            ok(!s.links.some((href) => /#pricing|#tariflar/i.test(String(href))),
                `${N}: tariflarga havola yo‘q (${s.links.filter((x) => /#pric/i.test(String(x))).join(',')})`);
            ok(!/Tariflar/i.test(s.navText), `${N}: navbar va footerda ham yo‘q`);
            eq(`${N}: gorizontal skroll yo‘q`, s.sideways, false);
            eq(`${N}: konsolda xato yo‘q`, s.errs.join(' | '), '');
            eq(`${N}: ushlanmagan promise yo‘q`, s.rejects.join(' | '), '');
        }
    }

    /* the mobile menu is the same list, opened */
    {
        await p.setDevice(375, 812, true);
        await p.goto(U('/index.html'), { waitMs: 2600 });
        const menu = JSON.parse(await p.evaluate(`
            var btn = document.querySelector('.hamburger, .menu-toggle, [class*="hamburger"]');
            if (btn) btn.click();
            var list = document.querySelector('.nav-links');
            return JSON.stringify({
              opened: !!btn,
              items: list ? Array.prototype.map.call(list.querySelectorAll('a'),
                  function (a) { return (a.textContent || '').trim(); }) : [],
              hrefs: list ? Array.prototype.map.call(list.querySelectorAll('a'),
                  function (a) { return a.getAttribute('href'); }) : []
            });`));
        ok(menu.items.length > 0, `mobil menyuda havolalar bor (${menu.items.join(', ')})`);
        ok(!menu.items.some((t) => /tarif/i.test(t)), 'va ularda tarif yo‘q');
        ok(!menu.hrefs.some((h) => /#pricing/i.test(String(h))), 'va #pricing havolasi yo‘q');
    }

    /* no anchor may point at a section that no longer exists */
    {
        await p.setDevice(1440, 900, false);
        await p.goto(U('/index.html'), { waitMs: 2600 });
        const broken = await p.evaluate(`
            var bad = [];
            Array.prototype.forEach.call(document.querySelectorAll('a[href^="#"]'), function (a) {
              var id = a.getAttribute('href').slice(1);
              if (id && !document.getElementById(id)) bad.push(a.getAttribute('href'));
            });
            return JSON.stringify(bad);`);
        eq('bosh sahifada singan langar yo‘q', JSON.parse(broken).join(','), '');
    }

    /* nothing collapsed where the section used to be */
    {
        const gaps = JSON.parse(await p.evaluate(`
            var out = [];
            Array.prototype.forEach.call(document.querySelectorAll('section'), function (s) {
              var r = s.getBoundingClientRect();
              var t = (s.innerText || '').trim();
              if (t.length < 20 && r.height > 60) out.push((s.id || s.className) + ' h=' + Math.round(r.height));
            });
            return JSON.stringify(out);`));
        eq('bo‘sh, lekin baland bo‘lim qolmadi', gaps.join(' | '), '');
    }

    /* the payment page states the plan instead of asking for it */
    {
        await p.goto(U('/tolov.html'), { waitMs: 2600 });
        const form = JSON.parse(await p.evaluate(`
            var t = document.querySelector('[name="tariff"]');
            var courses = Array.prototype.map.call(
                document.querySelectorAll('[name="course"] option'),
                function (o) { return o.value; }).filter(Boolean);
            return JSON.stringify({
              exists: !!t,
              tag: t ? t.tagName : null,
              readOnly: t ? (t.readOnly === true) : null,
              value: t ? t.value : null,
              options: t && t.tagName === 'SELECT' ? t.options.length : 0,
              courses: courses,
              text: document.body.innerText
            });`));
        ok(form.exists, 'to‘lov formasida tarif maydoni bor');
        eq('u tanlov emas', form.tag, 'INPUT');
        eq('va o‘zgartirib bo‘lmaydi', form.readOnly, true);
        eq('va qiymati PREMIUM', form.value, 'PREMIUM');
        eq('kurslar o‘zgarmadi', form.courses.sort().join(','), 'A1-A2,B1-B2');
        for (const oldName of OLD_NAMES) {
            ok(!new RegExp(`\\b${oldName}\\b`).test(form.text), `to‘lovda «${oldName}» yo‘q`);
        }
    }

    /* the admin panel no longer offers a plan to pick */
    {
        await p.goto(U('/adminpanel.html'), { waitMs: 3000 });
        const admin = JSON.parse(await p.evaluate(`
            return JSON.stringify({
              selects: document.querySelectorAll('[name="tariff"]').length,
              text: document.body.innerText
            });`));
        eq('admin panelda tarif tanlovi yo‘q', admin.selects, 0);
        for (const oldName of OLD_NAMES) {
            ok(!new RegExp(`\\b${oldName}\\b`).test(admin.text),
                `admin panelda «${oldName}» yo‘q`);
        }
    }
} catch (e) {
    fail++; failures.push('harness: ' + (e && e.message));
}

console.log('='.repeat(64));
if (fail) {
    console.log(`  ❌ SINGLE TARIFF: ${fail} failed, ${pass} passed`);
    failures.slice(0, 40).forEach((f) => console.log('     • ' + f));
} else {
    console.log(`  ✅ SINGLE TARIFF: ${pass}/${pass} passed`);
}
console.log('='.repeat(64) + '\n');
await browser.close();
if (site.close) site.close();
process.exit(fail ? 1 : 0);
})();
