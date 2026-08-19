#!/usr/bin/env node
/**
 * verify_pricing_plans.cjs — the four tariff cards on the landing page.
 *
 * The plan the site CALLS «START» and the plan a subscription document STORES
 * as `START` are no longer the same thing, and that is the whole point of this
 * suite. When the 980 000 plan was renamed to STANDART, its stored value was
 * deliberately left alone — every existing subscriber keeps `tariff: 'START'`
 * — and the new 560 000 plan took a fresh value, `STARTER`. Swapping those two
 * would silently re-price every historical subscription, so the mapping is
 * pinned here in both directions.
 *
 * Access to courses is granted by `accessPacks`, never by the tariff string, so
 * a tariff rename cannot move anyone's access. That invariant is asserted too.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

console.log('\n=== PRICING PLANS ===');

const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const start = HTML.indexOf('<section class="pricing"');
ok(start > 0, 'the pricing section exists');
const section = HTML.slice(start, HTML.indexOf('</section>', start));

/* ---------------------------------------------------- the four cards */
const cards = section.split(/(?=<div class="price-card")/).slice(1);
eq('exactly four tariff cards', cards.length, 4);

const read = (card) => ({
    plan: (card.match(/data-plan="([A-Z]+)"/) || [])[1],
    name: (card.match(/<h3[^>]*>([^<]+)<\/h3>/) || [])[1],
    badge: (card.match(/class="price-badge"[^>]*>([^<]+)</) || [])[1],
    oldPrice: (card.match(/class="old-price"[^>]*>([^<]+)</) || [])[1],
    newPrice: (card.match(/class="new-price"[^>]*>([^<]+)</) || [])[1],
    features: (card.match(/<i class="fas fa-check"[^>]*><\/i>\s*([^<]+)<\/p>/g) || [])
        .map((p) => p.replace(/^[\s\S]*<\/i>\s*/, '').replace(/<\/p>$/, '').trim())
});
const plans = cards.map(read);

/* ---------------------------------------------------- order and identity */
eq('the cards are ordered START, STANDART, TURBO, PREMIUM',
    plans.map((p) => p.name).join(' | '), 'START | STANDART | TURBO | PREMIUM');

/* THE backward-compatibility contract. The label a visitor reads and the value
   a subscription stores are different for the first two cards, on purpose. */
eq('the visible START is stored as STARTER (a NEW value)', plans[0].plan, 'STARTER');
eq('the visible STANDART keeps the legacy stored value START', plans[1].plan, 'START');
eq('TURBO is unchanged', plans[2].plan, 'TURBO');
eq('PREMIUM is unchanged', plans[3].plan, 'PREMIUM');
eq('every card carries a distinct plan value',
    new Set(plans.map((p) => p.plan)).size, 4);
ok(plans.every((p) => p.plan), 'no card is missing its plan value');

/* ---------------------------------------------------- prices */
const PRICES = [
    ['START', "720 000 so'm", "560 000 so'm"],
    ['STANDART', "1 225 000 so'm", "980 000 so'm"],
    ['TURBO', "1 715 000 so'm", "1 370 000 so'm"],
    ['PREMIUM', "2 430 000 so'm", "1 940 000 so'm"]
];
PRICES.forEach(([name, oldP, newP], i) => {
    eq(`${name} old price`, plans[i].oldPrice, oldP);
    eq(`${name} current price`, plans[i].newPrice, newP);
    eq(`${name} period`, plans[i].badge, '3 OYLIK');
    /* Thousands are spaced, never run together as 560000. */
    ok(/^\d{1,3}( \d{3})+ so'm$/.test(plans[i].newPrice),
        `${name} price is grouped in thousands (${plans[i].newPrice})`);
});

/* ---------------------------------------------------- privileges */
const LIVE = 'Haftada 1 jonli dars';
const START_FEATURES = [
    "A1-A2 kurslari (boshlang'ich)", "B1-B2 kurslari (o'rta)",
    'Shaxsiy progress monitoring', 'Interaktiv mashqlar',
    'Kursni tugatish sertifikati', 'Testlar', 'Audio materiallar'
];
eq('START lists exactly its seven privileges',
    plans[0].features.join(' | '), START_FEATURES.join(' | '));
ok(!plans[0].features.includes(LIVE),
    `START does NOT include «${LIVE}» — that is the difference it is priced on`);
eq('STANDART keeps all eight privileges', plans[1].features.length, 8);
ok(plans[1].features.includes(LIVE), `STANDART DOES include «${LIVE}»`);
eq('STANDART is START plus the live lesson',
    plans[1].features.filter((f) => f !== LIVE).join(' | '), START_FEATURES.join(' | '));

/* No filler row was inserted to make the shorter card line up. */
ok(!/&nbsp;|visibility:\s*hidden/i.test(cards[0]),
    'START has no blank filler privilege');

/* TURBO and PREMIUM keep their own feature sets untouched. */
eq('TURBO privileges', plans[2].features.length, 8);
ok(plans[2].features.includes('Haftada 2 jonli dars'), 'TURBO keeps its 2 live lessons');
eq('PREMIUM privileges', plans[3].features.length, 10);
ok(plans[3].features.includes('Haftada 4 jonli dars'), 'PREMIUM keeps its 4 live lessons');
ok(plans[2].features.includes("Individual o'quv reja")
    && plans[3].features.includes('Shaxsiy kurator'),
    'the paid extras of TURBO and PREMIUM survive');

/* ---------------------------------------------------- colour families */
/* Four plans, four families. START and STANDART were briefly BOTH blue, which
   made the entry plan look like a second tier of the same product; START is
   neutral grey again. These assertions describe the FAMILY and the measured
   contrast rather than pinning exact hex, so a designer may retune a shade
   without a test edit — but cannot make the two cards the same colour again,
   turn START blue, or drop below the readability floor. */
ok(/--plan-start\b/.test(HTML) && /--plan-standart\b/.test(HTML),
    'the two plans are painted from design tokens, not one-off hex values');
ok(/var\(--plan-start\)/.test(cards[0]) && /var\(--plan-start-deep\)/.test(cards[0]),
    'START is painted from the START tokens');
ok(/var\(--plan-standart\)/.test(cards[1]) && /var\(--plan-standart-deep\)/.test(cards[1]),
    'STANDART is painted from the STANDART tokens');
eq('START introduces no literal colour of its own',
    (cards[0].match(/#[0-9A-Fa-f]{3,8}\b/g) || []).length, 0);
eq('STANDART introduces no literal colour of its own',
    (cards[1].match(/#[0-9A-Fa-f]{3,8}\b/g) || []).length, 0);
ok(/#4CAF50/.test(cards[2]), 'TURBO is still green');
ok(/#FFD700/.test(cards[3]), 'PREMIUM is still yellow-orange');

{
    const token = (name) => {
        const m = HTML.match(new RegExp('--' + name + ':\\s*(#[0-9A-Fa-f]{6})'));
        return m && m[1];
    };
    const rgb = (hex) => hex.replace('#', '').match(/../g).map((x) => parseInt(x, 16));
    /* WCAG relative luminance and contrast ratio — the real formula, so the
       thresholds below mean what they say. */
    const lum = (hex) => {
        const c = rgb(hex).map((v) => v / 255)
            .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a, b) => {
        const l1 = lum(a), l2 = lum(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    const CREAM = '#FFF8E1', WHITE = '#FFFFFF';
    /* Grey = the three channels sit close together. Blue = the blue channel
       clearly leads. Both are judged from the token, not from a name. */
    const isGrey = (hex) => { const [r, g, b] = rgb(hex); return Math.max(r, g, b) - Math.min(r, g, b) <= 32; };
    const isBlue = (hex) => { const [r, g, b] = rgb(hex); return b - Math.max(r, g) >= 40; };

    const START = ['plan-start', 'plan-start-deep'].map(token);
    const STANDART = ['plan-standart', 'plan-standart-deep'].map(token);
    START.concat(STANDART).forEach((v, i) => ok(!!v, `tariff token #${i + 1} is defined`));

    START.forEach((hex) => {
        ok(isGrey(hex), `START token ${hex} is neutral grey`);
        ok(!isBlue(hex), `START token ${hex} is NOT blue`);
    });
    STANDART.forEach((hex) => ok(isBlue(hex), `STANDART token ${hex} is blue`));
    /* The entry plan must not be so pale it reads as disabled, nor black. */
    START.forEach((hex) => {
        const [r, g, b] = rgb(hex);
        const avg = (r + g + b) / 3;
        ok(avg > 60 && avg < 190, `START token ${hex} is a real grey, not near-black or washed out`);
    });
    /* The two cards must never share a tone — that is what made them look alike. */
    eq('START and STANDART share no token value',
        START.filter((h) => STANDART.includes(h)).length, 0);
    ok(ratio(START[0], STANDART[0]) > 1.15 || !isGrey(STANDART[0]),
        'the two families are visually distinct, not two shades of one hue');

    /* Readability, measured. The ribbon is 0.9rem bold — small text, 4.5:1.
       The h3 is 1.8rem bold — large text, 3:1. The price sits on cream. */
    [['START', START], ['STANDART', STANDART]].forEach(([name, [base, deep]]) => {
        ok(ratio(base, WHITE) >= 3,
            `${name} header carries white text (${ratio(base, WHITE).toFixed(2)}:1, large text needs 3)`);
        ok(ratio(deep, WHITE) >= 4.5,
            `${name} ribbon carries white text (${ratio(deep, WHITE).toFixed(2)}:1, small text needs 4.5)`);
        ok(ratio(deep, CREAM) >= 4.5,
            `${name} price is readable on cream (${ratio(deep, CREAM).toFixed(2)}:1)`);
        ok(ratio(base, CREAM) >= 3,
            `${name} check icons are visible on cream (${ratio(base, CREAM).toFixed(2)}:1, graphics need 3)`);
    });
}

/* ---------------------------------------------------- layout */
ok(/grid-template-columns:\s*repeat\(4, 1fr\)/.test(HTML),
    'four explicit columns on wide desktop');
ok(/\.pricing \.container\s*\{[^}]*max-width/.test(HTML),
    'only the pricing container is widened, not the site-wide one');
ok(/@media \(max-width: 1199px\)[\s\S]{0,200}repeat\(2, 1fr\)/.test(HTML),
    'two columns on medium widths');
ok(/@media \(max-width: 700px\)[\s\S]{0,200}grid-template-columns:\s*1fr/.test(HTML),
    'one column on mobile');

/* ---------------------------------------------------- section untouched */
ok(/<h2 class="section-title">Tariflar<\/h2>/.test(section), 'the heading is still «Tariflar»');
eq('every card still offers the same hidden checkout link',
    (section.match(/href="\.\/tolov\.html"/g) || []).length, 4);

/* ------------------------------------- the stored value still means money */
{
    /* Anyone may rename a label. Nobody may quietly repoint a stored value:
       `START` in a user document is the 980 000 plan and must stay so. */
    const helpers = fs.readFileSync(path.join(ROOT, 'api/_lib/user-helpers.js'), 'utf8');
    const migration = (helpers.match(/TARIFF_MIGRATION\s*=\s*\{([^}]*)\}/) || [])[1] || '';
    ok(!/\bSTART\s*:/.test(migration),
        'no migration rule rewrites the stored START value');
    ok(!/\bSTARTER\s*:/.test(migration), 'nor the new STARTER value');
    ok(/GOLD:\s*'TURBO'/.test(migration) && /PLATINUM:\s*'PREMIUM'/.test(migration),
        'the existing GOLD/PLATINUM renames are untouched');

    /* Access is by pack, not by tariff — a rename cannot move anyone's access. */
    const client = fs.readFileSync(path.join(ROOT, 'firebase-client.js'), 'utf8');
    ok(/packs\.includes\(requiredPack\)/.test(client),
        'course access is decided by accessPacks');
    ok(!/tariff\s*===\s*['"]/.test(client),
        'no access decision compares the tariff string');

    /* An admin must be able to assign the new plan, and the option values must
       be the stored ones. */
    const adminHtml = fs.readFileSync(path.join(ROOT, 'adminpanel.html'), 'utf8');
    const adminJs = fs.readFileSync(path.join(ROOT, 'adminpanel.js'), 'utf8');
    ok(/<option value="STARTER">START<\/option>/.test(adminHtml),
        'the admin form offers the new plan by its stored value');
    ok(/<option value="START">STANDART<\/option>/.test(adminHtml),
        'and labels the legacy value STANDART');
    ok(/\{ value: 'STARTER', label: 'START' \}/.test(adminJs),
        'the admin script offers STARTER too');
    ok(/\{ value: 'START', label: 'STANDART' \}/.test(adminJs),
        'and labels START as STANDART');
    ['STARTER', 'START', 'TURBO', 'PREMIUM'].forEach((v) =>
        ok(new RegExp(`value="${v}"`).test(adminHtml), `admin can assign ${v}`));
}


/* ------------------------------- the stored value never reaches a reader */
{
    /* A subscription document says START and means the 980 000 plan. The site
       calls that plan STANDART. Somewhere between the two a label has to be
       applied, and it must be applied in exactly ONE place — otherwise the
       cabinet and the admin list drift apart and a learner is told they are on
       a plan that no longer exists by that name. */
    const DISPLAY = path.join(ROOT, 'tariff-display.js');
    ok(fs.existsSync(DISPLAY), 'the display map exists as its own module');
    const src = fs.readFileSync(DISPLAY, 'utf8');

    /* Load it the way the browser will, rather than re-implementing it here. */
    let getTariffDisplayName = null;
    try {
        const vm2 = require('vm');
        const box = { module: { exports: {} }, exports: {} };
        box.globalThis = box;
        /* The module is ESM; strip the export keywords to evaluate the bodies. */
        const plain = src.replace(/export\s+(const|function)/g, '$1')
                         .replace(/export\s*\{[^}]*\};?/g, '');
        vm2.runInNewContext(plain + ';this.__fn = getTariffDisplayName;', box);
        getTariffDisplayName = box.__fn;
    } catch (e) { /* reported by the assertion below */ }
    ok(typeof getTariffDisplayName === 'function', 'the helper is callable');

    if (typeof getTariffDisplayName === 'function') {
        const D = getTariffDisplayName;
        /* THE contract */
        eq("STARTER is shown as START", D('STARTER'), 'START');
        eq("START is shown as STANDART", D('START'), 'STANDART');
        eq('TURBO is unchanged', D('TURBO'), 'TURBO');
        eq('PREMIUM is unchanged', D('PREMIUM'), 'PREMIUM');
        /* it must survive whatever a document actually holds */
        eq('null does not crash the UI', D(null), '');
        eq('undefined does not crash the UI', D(undefined), '');
        eq('an empty value does not crash the UI', D(''), '');
        eq('a caller-supplied fallback is used when there is no value',
            D(null, 'Tarif yo‘q'), 'Tarif yo‘q');
        /* an unknown plan keeps its own name rather than being hidden */
        eq('an unknown value is shown as it is stored', D('DEVELOPER'), 'DEVELOPER');
        eq('a legacy value is not swallowed', D('GOLD'), 'GOLD');
        eq('matching is case-insensitive', D('starter'), 'START');
        eq('surrounding space does not defeat the map', D('  START  '), 'STANDART');
        /* the label must never be mistaken for a stored value */
        ok(D('STARTER') !== 'STARTER', 'the new plan is never shown as STARTER');
    }

    /* The map lives in ONE file. */
    ['my.cabinet/cabinet.js', 'adminpanel.js'].forEach((rel) => {
        const f = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        ok(/import \{ getTariffDisplayName \}/.test(f),
            `${rel} imports the shared helper`);
        ok(!/['"]STARTER['"]\s*\?|===\s*['"]STARTER['"]/.test(f),
            `${rel} does not re-implement the mapping inline`);
    });

    /* No user-facing render may print the stored value directly. */
    const cabinet = fs.readFileSync(path.join(ROOT, 'my.cabinet/cabinet.js'), 'utf8');
    ok(!/\$\{[^}]*subscription\?\.tariff[^}]*\}/.test(cabinet),
        'the cabinet never interpolates the raw stored tariff');
    eq('every cabinet tariff read goes through the helper',
        (cabinet.match(/subscription\?\.tariff/g) || []).length,
        (cabinet.match(/getTariffDisplayName\(profile\.subscription\?\.tariff/g) || []).length);

    const admin = fs.readFileSync(path.join(ROOT, 'adminpanel.js'), 'utf8');
    ok(!/escapeHtml\((?:user\.subscription|sub)\.tariff/.test(admin),
        'the admin list never escapes the raw stored tariff straight into HTML');
    ok(/escapeHtml\(getTariffDisplayName\(user\.subscription\.tariff/.test(admin),
        'the admin user row is labelled through the helper');
    ok(/escapeHtml\(getTariffDisplayName\(sub\.tariff/.test(admin),
        'the admin subscription pill is labelled through the helper');

    /* ---- storage must stay exactly as it is ---- */
    ok(/const tariff = String\(values\.tariff \|\| originalTariff \|\| ''\)\.toUpperCase\(\)/.test(admin),
        'the dialog SAVES the stored value, and falls back to the account\'s own'
        + ' tariff rather than a fixed plan');
    ok(!/getTariffDisplayName\([^)]*\)\s*\}\s*\)?\s*;?\s*$/m.test(
        (admin.match(/tariff:[^\n]*/g) || []).join('\n')),
        'no save path writes a display label into the database');

    const helpers = fs.readFileSync(path.join(ROOT, 'api/_lib/user-helpers.js'), 'utf8');
    const migration = (helpers.match(/TARIFF_MIGRATION\s*=\s*\{([^}]*)\}/) || [])[1] || '';
    ok(!/\bSTART\s*:/.test(migration) && !/\bSTARTER\s*:/.test(migration),
        'the display rename was NOT smuggled into TARIFF_MIGRATION');
    ok(/GOLD:\s*'TURBO'/.test(migration) && /PLATINUM:\s*'PREMIUM'/.test(migration),
        'the real GOLD/PLATINUM migrations are untouched');
    ok(!/getTariffDisplayName/.test(helpers),
        'the server read path still returns stored values, not labels');

    /* The four cards and the admin options agree on the stored values. */
    const stored = (src.match(/TARIFF_STORED_VALUES\s*=\s*\[([^\]]*)\]/) || [])[1] || '';
    ['STARTER', 'START', 'TURBO', 'PREMIUM'].forEach((v) =>
        ok(stored.includes(`'${v}'`), `${v} is a documented stored value`));
    eq('the cards use exactly those stored values',
        plans.map((p) => p.plan).sort().join(','),
        ['STARTER', 'START', 'TURBO', 'PREMIUM'].sort().join(','));
    if (typeof getTariffDisplayName === 'function') {
        plans.forEach((p) => eq(
            `the ${p.plan} card is labelled ${p.name}`,
            getTariffDisplayName(p.plan), p.name));
    }
}


/* ------------------------------- the admin can assign all four plans */
{
    /* An admin creating a user picks a LABEL and the database must receive the
       matching STORED value. Getting this backwards would write «STANDART» into
       Firestore as a brand-new tariff nobody else recognises, or file the new
       cheap plan under `START` — the value that already means the 980 000 one. */
    const adminJs = fs.readFileSync(path.join(ROOT, 'adminpanel.js'), 'utf8');
    const adminHtml = fs.readFileSync(path.join(ROOT, 'adminpanel.html'), 'utf8');

    const CONTRACT = [
        ['STARTER', 'START'],
        ['START', 'STANDART'],
        ['TURBO', 'TURBO'],
        ['PREMIUM', 'PREMIUM']
    ];

    /* ---- 1. the static create-user form ---- */
    const selectBlock = adminHtml.slice(
        adminHtml.indexOf('<select name="tariff">'),
        adminHtml.indexOf('</select>', adminHtml.indexOf('<select name="tariff">')));
    const htmlPairs = [...selectBlock.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)]
        .map((m) => [m[1], m[2]]);
    eq('the create-user form offers four tariffs', htmlPairs.length, 4);
    eq('create-user options are value→label, in sale order',
        htmlPairs.map((p) => p.join('→')).join(' | '),
        CONTRACT.map((p) => p.join('→')).join(' | '));

    /* ---- 2. the scripted subscription dialog ---- */
    const optsSrc = (adminJs.match(/TARIFF_OPTIONS\s*=\s*\[([\s\S]*?)\];/) || [])[1];
    ok(!!optsSrc, 'the dialog builds its options from one shared list');
    const jsPairs = [...String(optsSrc).matchAll(/value:\s*'([^']+)',\s*label:\s*'([^']+)'/g)]
        .map((m) => [m[1], m[2]]);
    eq('the dialog offers the same four, in the same order',
        jsPairs.map((p) => p.join('→')).join(' | '),
        CONTRACT.map((p) => p.join('→')).join(' | '));
    eq('the option list is declared once, not copied per dialog',
        (adminJs.match(/\{ value: 'STARTER', label: 'START' \}/g) || []).length, 1);

    /* ---- 3. what actually leaves the browser ---- */
    /* Both submit paths must forward the SELECT VALUE untouched. A display name
       must never be what gets posted. */
    ok(/tariff: String\(data\.get\('tariff'\) \|\| 'START'\)/.test(adminJs),
        'create-user posts the raw selected value');
    ok(/const tariff = String\(values\.tariff \|\| originalTariff \|\| ''\)\.toUpperCase\(\)/.test(adminJs),
        'the subscription dialog posts the raw selected value');
    ok(!/tariff:[^\n]*getTariffDisplayName/.test(adminJs),
        'no submit path posts a display label');
    ok(!/['"]STANDART['"]/.test(adminJs.replace(/label: 'STANDART'/g, '')),
        'the string STANDART exists only as a label, never as a value');

    /* ---- 4. opening a user must not silently reprice them ---- */
    ok(/const target = state\.users\.find\(\(user\) => user\.uid === userId\)/.test(adminJs),
        'the dialog looks up the user it is editing');
    ok(/originalTariff = String\(subscription\.tariff \|\| ''\)/.test(adminJs),
        'and snapshots their stored tariff before opening');
    ok(/value: initialTariff/.test(adminJs),
        'the dialog preselects that stored tariff rather than a fixed default');
    ok(!/name: 'tariff',[\s\S]{0,120}value: 'START'/.test(adminJs),
        'the old hardcoded START preselect is gone');
    ok(/TARIFF_OPTIONS\.some\(\(opt\) => opt\.value === originalTariff\)/.test(adminJs),
        'an unrecognised stored value is not force-fitted onto the first option');

    /* ---- 5. REAL DOM: render the product's own option markup ---- */
    {
        const { JSDOM } = require('jsdom');
        /* The template is lifted from adminpanel.js rather than retyped, so the
           test breaks if the product's rendering changes. */
        const tpl = (adminJs.match(/const options = \(field\.options \|\| \[\]\)[\s\S]*?\.join\(''\);/) || [])[0];
        ok(!!tpl, 'the select template was lifted from the product');
        const options = CONTRACT.map(([value, label]) => ({ value, label }));
        const escapeHtml = (v) => String(v).replace(/[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

        const renderFor = (storedValue) => {
            const field = { options, value: storedValue };
            const box = { field, escapeHtml, options: null };
            vm.runInNewContext(tpl + ';this.__out = options;', box);
            const dom = new JSDOM(`<select>${box.__out}</select>`);
            const sel = dom.window.document.querySelector('select');
            const chosen = sel.querySelector('option[selected]');
            return {
                labels: [...sel.options].map((o) => o.textContent),
                values: [...sel.options].map((o) => o.value),
                selected: chosen ? chosen.value : null,
                selectedLabel: chosen ? chosen.textContent : null
            };
        };

        const shown = renderFor('START');
        eq('the rendered dropdown shows the four plan names',
            shown.labels.join(' | '), 'START | STANDART | TURBO | PREMIUM');
        eq('and carries the four stored values',
            shown.values.join(' | '), 'STARTER | START | TURBO | PREMIUM');

        /* An existing user opens with THEIR plan selected. */
        CONTRACT.forEach(([stored, label]) => {
            const r = renderFor(stored);
            eq(`a stored ${stored} opens with ${label} selected`, r.selected, stored);
            eq(`  …and is labelled ${label}`, r.selectedLabel, label);
        });
        /* A value the dialog cannot represent must not silently become one. */
        const legacy = renderFor('GOLD');
        eq('an unrepresentable stored value selects nothing rather than the wrong plan',
            legacy.selected, null);
    }

    /* ---- 6. the write path stores what it was given ---- */
    const helpers = fs.readFileSync(path.join(ROOT, 'api/_lib/user-helpers.js'), 'utf8');
    ok(/tariff: input\.tariff \|\| null/.test(helpers),
        'buildSubscription stores the tariff exactly as received');
    ok(!/getTariffDisplayName/.test(helpers),
        'the server never turns a stored value into a label on write');
    const migration = (helpers.match(/TARIFF_MIGRATION\s*=\s*\{([^}]*)\}/) || [])[1] || '';
    ok(!/\bSTART\s*:/.test(migration) && !/\bSTARTER\s*:/.test(migration),
        'neither START nor STARTER is rewritten on read');

    /* No admin endpoint may reject or rewrite the new value. */
    ['create-user.js', 'set-subscription.js', 'adjust-subscription-days.js'].forEach((f) => {
        const api = fs.readFileSync(path.join(ROOT, 'api/_admin', f), 'utf8');
        ok(!/STARTER/.test(api) || /body\.tariff/.test(api),
            `${f} does not special-case STARTER`);
        ok(!/tariff\s*===\s*['"]/.test(api), `${f} makes no decision on the tariff string`);
    });

    /* ---- 7. nothing in this change touches existing users ---- */
    /* A rename must never arrive as a sweep over the user collection. */
    const sweeps = [adminJs, helpers]
        .concat(['create-user.js', 'set-subscription.js', 'adjust-subscription-days.js']
            .map((f) => fs.readFileSync(path.join(ROOT, 'api/_admin', f), 'utf8')))
        .join('\n');
    ok(!/collection\('users'\)\s*\.get\(\)/.test(sweeps),
        'no code reads the whole users collection to rewrite it');
    ok(!/batch\(\)[\s\S]{0,400}tariff/.test(sweeps),
        'no batch write touches the tariff field');
    ok(!/tariff[^\n]*=[^\n]*['"]STANDART['"]/.test(sweeps),
        'nothing assigns STANDART as a stored value');
}


/* ------------------------- editing an existing subscription is lossless */
{
    /* The dialog is not read as text here — it is EXECUTED. `subscriptionFlow`
       is lifted out of adminpanel.js with stubs standing in for the modal and
       the API, so every assertion below is about what the shipped function
       actually does with a given user record. A regression in the real code
       cannot pass by leaving a reassuring comment behind. */
    const adminSrc = fs.readFileSync(path.join(ROOT, 'adminpanel.js'), 'utf8');

    const lift = (name, kind) => {
        const header = kind === 'const'
            ? new RegExp('const ' + name + '\\s*=\\s*\\[')
            : new RegExp('(?:async )?function ' + name + '\\s*\\(');
        const at = adminSrc.search(header);
        if (at < 0) return null;
        const open = kind === 'const' ? '[' : '{';
        const close = kind === 'const' ? ']' : '}';
        let depth = 0;
        for (let x = adminSrc.indexOf(open, at); x < adminSrc.length; x++) {
            if (adminSrc[x] === open) depth++;
            else if (adminSrc[x] === close) {
                depth--;
                if (!depth) return adminSrc.slice(at, x + 1) + (kind === 'const' ? ';' : '');
            }
        }
        return null;
    };
    const parts = [lift('TARIFF_OPTIONS', 'const'), lift('toJsDate'),
                   lift('remainingDays'), lift('subscriptionFlow')];
    parts.forEach((code, i) => ok(!!code,
        `the dialog's part #${i + 1} was lifted from adminpanel.js`));

    if (!parts.every(Boolean)) {
        finish();
    } else {
        const makeFlow = () => {
            const calls = [], messages = [];
            const box = {
                console, Date, Number, String, Boolean, Array, Math, Object,
                Promise, JSON, isNaN,
                state: { users: [] },
                canEditSubscription: () => true,
                setButtonLoading: () => {},
                showSuccess: (m) => messages.push({ ok: m }),
                showError: (m) => messages.push({ err: m }),
                getTariffDisplayName: (v, f) => {
                    const map = { STARTER: 'START', START: 'STANDART' };
                    if (v == null) return f || '';
                    const raw = String(v).trim();
                    if (!raw) return f || '';
                    return map[raw.toUpperCase()] || raw;
                },
                callApi: async (url, method, payload) => { calls.push({ url, payload }); return { ok: true }; },
                openModal: null
            };
            box.globalThis = box;
            vm.createContext(box);
            vm.runInContext(parts.join('\n\n') + ';this.__flow = subscriptionFlow;', box);
            return { box, calls, messages, flow: box.__flow };
        };

        const FIXED = '2030-05-20T13:37:42.000Z';
        const stamp = (iso) => {
            const t = new Date(iso).getTime();
            return { _seconds: Math.floor(t / 1000), _nanoseconds: (t % 1000) * 1e6 };
        };
        const userOf = (over) => Object.assign({
            uid: 'u1', username: 'ali',
            accessPacks: ['A1A2', 'B1B2'],
            subscription: { active: true, tariff: 'TURBO', endAt: stamp(FIXED) }
        }, over || {});

        /* Drive the dialog: `edit` receives the values the form would submit
           untouched, and returns what the admin actually leaves behind. */
        const drive = async (user, edit) => {
            const h = makeFlow();
            h.box.state.users = [user];
            let cfg = null;
            h.box.openModal = async (config) => {
                cfg = config;
                const v = {};
                config.fields.forEach((f) => {
                    v[f.name] = f.type === 'checkbox-group'
                        ? f.options.filter((o) => o.checked).map((o) => o.value)
                        : f.value;
                });
                return edit ? edit(v) : v;
            };
            const result = await h.flow('u1', {});
            const field = (n) => cfg.fields.find((f) => f.name === n);
            return { cfg, field, calls: h.calls, messages: h.messages, result };
        };

        void (async () => {
            /* ---- the form opens on the account's real state ---- */
            {
                const r = await drive(userOf());
                eq('active opens on the stored state', r.field('active').value, 'true');
                eq('tariff opens on the stored plan', r.field('tariff').value, 'TURBO');
                eq('A1A2 reflects the account', r.field('packs').options[0].checked, true);
                eq('B1B2 reflects the account', r.field('packs').options[1].checked, true);
                ok(Number(r.field('durationDays').value) > 0,
                    'the duration field shows the remaining days, not a fixed 30');
                ok(!/value: '30'/.test(adminSrc.slice(
                    adminSrc.indexOf('async function subscriptionFlow'),
                    adminSrc.indexOf('async function adjustSubscriptionDays'))),
                    'no hardcoded 30-day default survives in the dialog');
            }

            /* ---- the pack boxes mirror the account, every combination ----
               A box that is checked because the dialog opened, rather than
               because the learner owns the pack, hands out course access on a
               save the admin thought was about something else. */
            for (const owned of [[], ['A1A2'], ['B1B2'], ['A1A2', 'B1B2']]) {
                const r = await drive(userOf({ accessPacks: owned.slice() }));
                const boxes = r.field('packs').options;
                eq(`packs ${JSON.stringify(owned)} → A1A2 checkbox`,
                    Boolean(boxes[0].checked), owned.includes('A1A2'));
                eq(`packs ${JSON.stringify(owned)} → B1B2 checkbox`,
                    Boolean(boxes[1].checked), owned.includes('B1B2'));
                eq(`packs ${JSON.stringify(owned)} → opening writes nothing`, r.calls.length, 0);
            }

            /* ---- every stored tariff selects its own option ---- */
            for (const [stored, label] of [['STARTER', 'START'], ['START', 'STANDART'],
                                           ['TURBO', 'TURBO'], ['PREMIUM', 'PREMIUM']]) {
                const r = await drive(userOf({
                    subscription: { active: true, tariff: stored, endAt: stamp(FIXED) } }));
                const f = r.field('tariff');
                eq(`stored ${stored} preselects itself`, f.value, stored);
                eq(`stored ${stored} is labelled ${label}`,
                    (f.options.find((o) => o.value === stored) || {}).label, label);
            }

            /* ---- an unknown plan is offered, not overwritten ---- */
            {
                const r = await drive(userOf({
                    subscription: { active: true, tariff: 'DEVELOPER', endAt: stamp(FIXED) } }));
                const f = r.field('tariff');
                eq('an unknown stored tariff preselects itself', f.value, 'DEVELOPER');
                ok(f.options.some((o) => o.value === 'DEVELOPER'),
                    'and is added to the list for this render');
                ok(f.value !== 'START' && f.value !== 'STARTER',
                    'it never falls back to START or STARTER');
                eq('the permanent option list is not mutated',
                    (adminSrc.match(/\{ value: '[A-Z]+', label: '[A-Z]+' \}/g) || []).length, 4);
                /* and it survives a save the admin makes for another reason */
                const saved = await drive(userOf({
                    subscription: { active: true, tariff: 'DEVELOPER', endAt: stamp(FIXED) } }),
                    (v) => Object.assign({}, v, { packs: ['A1A2'] }));
                eq('an unknown tariff round-trips unchanged',
                    saved.calls[0].payload.tariff, 'DEVELOPER');
            }

            /* ---- a no-op cannot touch the account ---- */
            {
                const r = await drive(userOf());
                eq('saving without a change writes nothing', r.calls.length, 0);
                eq('and says so', (r.messages[0] || {}).ok, 'O‘zgarish kiritilmadi.');
                eq('and reports no action taken', r.result, false);
            }

            /* ---- changing one field leaves the rest exactly alone ---- */
            {
                const r = await drive(userOf(), (v) => Object.assign({}, v, { tariff: 'PREMIUM' }));
                const p = r.calls[0].payload;
                eq('the new tariff is sent', p.tariff, 'PREMIUM');
                eq('the expiry is sent back to the millisecond', p.endAt, FIXED);
                ok(!('durationDays' in p), 'and no duration is sent alongside it');
                eq('the packs are unchanged', p.accessPacks.join(','), 'A1A2,B1B2');
                eq('the active flag is unchanged', p.active, true);
            }
            {
                const r = await drive(userOf({ accessPacks: ['A1A2'] }),
                    (v) => Object.assign({}, v, { packs: ['A1A2', 'B1B2'] }));
                const p = r.calls[0].payload;
                eq('a packs-only edit keeps the tariff', p.tariff, 'TURBO');
                eq('a packs-only edit keeps the exact expiry', p.endAt, FIXED);
                eq('and sends the new packs', p.accessPacks.join(','), 'A1A2,B1B2');
            }

            /* ---- a duration the admin DID edit is recomputed by the server ---- */
            {
                const r = await drive(userOf(), (v) => Object.assign({}, v, { durationDays: '90' }));
                const p = r.calls[0].payload;
                eq('the new term is sent as durationDays', p.durationDays, 90);
                ok(!('endAt' in p), 'and no endAt competes with it');
            }

            /* ---- the two date inputs are never sent together ---- */
            {
                const both = [
                    await drive(userOf(), (v) => Object.assign({}, v, { tariff: 'PREMIUM' })),
                    await drive(userOf(), (v) => Object.assign({}, v, { durationDays: '5' }))
                ];
                both.forEach((r, i) => {
                    const p = r.calls[0].payload;
                    ok(!('endAt' in p && 'durationDays' in p),
                        `payload #${i + 1} sends one date input, never both`);
                });
            }

            /* ---- an inactive account is not revived by being looked at ---- */
            {
                const r = await drive(userOf({
                    subscription: { active: false, tariff: 'START', endAt: null } }));
                eq('an inactive subscription opens as inactive', r.field('active').value, 'false');
                eq('and proposes no term out of thin air', r.field('durationDays').value, '');
                eq('and opening it writes nothing', r.calls.length, 0);
            }
            /* deactivation keeps its own endpoint semantics */
            {
                const r = await drive(userOf(), (v) => Object.assign({}, v, { active: 'false' }));
                eq('turning a subscription off still uses the dedicated call',
                    JSON.stringify(r.calls[0].payload), JSON.stringify({ userId: 'u1', active: false }));
            }

            /* ---- no record, no dialog ---- */
            {
                const h = makeFlow();
                h.box.state.users = [];
                h.box.openModal = async () => ({});
                let threw = false;
                try { await h.flow('ghost', {}); } catch (e) { threw = true; }
                ok(threw, 'a missing user is refused rather than opened on invented defaults');
                eq('and nothing is written', h.calls.length, 0);
            }


            /* ---- an untyped term is never invented ----
               The dialog used to fall back to `|| 30`. Reactivating a lapsed
               account with the field left blank then granted a month nobody had
               asked for — the system writing a subscription of its own
               invention. Silence must be refused, not guessed. */
            {
                const lapsed = () => userOf({
                    accessPacks: ['A1A2'],
                    subscription: { active: false, tariff: 'START', endAt: null }
                });

                const bare = await drive(lapsed(), (v) => Object.assign({}, v, { active: 'true' }));
                eq('reactivating with no term writes nothing', bare.calls.length, 0);
                ok(/muddat/i.test((bare.messages[0] || {}).err || ''),
                    'and the admin is told a term is required');
                eq('and the flow reports no action', bare.result, false);

                const stated = await drive(lapsed(),
                    (v) => Object.assign({}, v, { active: 'true', durationDays: '90' }));
                const p = stated.calls[0].payload;
                eq('a stated term reactivates the account', p.active, true);
                eq('with the term the admin typed', p.durationDays, 90);
                ok(!('endAt' in p), 'and no endAt competes with it');
                eq('the existing tariff is carried over untouched', p.tariff, 'START');
                eq('and so are the existing packs', p.accessPacks.join(','), 'A1A2');

                /* Clearing the term of a LIVE subscription is an edit, not a no-op. */
                const cleared = await drive(userOf(), (v) => Object.assign({}, v, { durationDays: '' }));
                eq('clearing a live term writes nothing', cleared.calls.length, 0);
                ok(/muddat/i.test((cleared.messages[0] || {}).err || ''),
                    'and is reported as a validation error, not silently reset to 30');

                /* Whatever the admin types must be a whole number of days. */
                for (const bad of ['', '0', '-1', '1.5', 'abc', '   ']) {
                    const r = await drive(lapsed(),
                        (v) => Object.assign({}, v, { active: 'true', durationDays: bad }));
                    eq(`a term of ${JSON.stringify(bad)} is refused`, r.calls.length, 0);
                }
                for (const good of ['1', '30', '90', '365']) {
                    const r = await drive(lapsed(),
                        (v) => Object.assign({}, v, { active: 'true', durationDays: good }));
                    eq(`a term of ${good} is accepted`, r.calls[0].payload.durationDays, Number(good));
                }
            }

            /* ---- the source carries no hidden fallback any more ---- */
            {
                const body = adminSrc.slice(
                    adminSrc.indexOf('async function subscriptionFlow'),
                    adminSrc.indexOf('async function adjustSubscriptionDays'));
                /* Comments may DISCUSS the old `|| 30`; only code may not use it. */
                const code = body
                    .replace(/\/\*[\s\S]*?\*\//g, '')
                    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
                ok(!/\|\|\s*30\b/.test(code),
                    'the subscription editor has no implicit 30-day fallback left');
                ok(/Number\.isInteger\(days\)/.test(code) && /days <= 0/.test(code),
                    'it validates the term as a positive whole number instead');
            }

            /* ---- fields the deactivation endpoint ignores are locked ---- */
            {
                const at = adminSrc.indexOf('onRender: (form) => {');
                ok(at > 0, 'the dialog wires a lock for its dependent fields');
                let depth = 0, end = -1;
                for (let x = adminSrc.indexOf('{', at); x < adminSrc.length; x++) {
                    if (adminSrc[x] === '{') depth++;
                    else if (adminSrc[x] === '}') { depth--; if (!depth) { end = x; break; } }
                }
                const onRenderBody = adminSrc.slice(adminSrc.indexOf('{', at), end + 1);
                const onRender = vm.runInNewContext('(form) => ' + onRenderBody, {});

                const { JSDOM } = require('jsdom');
                const dom = new JSDOM(`<form id="f">
                    <select name="active">
                        <option value="true">Faol</option>
                        <option value="false">O‘chirilgan</option>
                    </select>
                    <input name="durationDays" type="number" value="1371">
                    <select name="tariff">
                        <option value="TURBO" selected>TURBO</option>
                        <option value="PREMIUM">PREMIUM</option>
                    </select>
                    <input type="checkbox" name="packs" value="A1A2" checked>
                    <input type="checkbox" name="packs" value="B1B2" checked>
                </form>`);
                const win = dom.window;
                const form = win.document.getElementById('f');
                const activeSel = form.querySelector('[name="active"]');
                const locked = () => [
                    form.querySelector('[name="durationDays"]').disabled,
                    form.querySelector('[name="tariff"]').disabled,
                    form.querySelector('input[value="A1A2"]').disabled,
                    form.querySelector('input[value="B1B2"]').disabled
                ];
                const shown = () => ({
                    tariff: form.querySelector('[name="tariff"]').value,
                    packs: [...form.querySelectorAll('input[name="packs"]:checked')]
                        .map((n) => n.value).join(',')
                });

                activeSel.value = 'true';
                onRender(form);
                eq('an active subscription opens with every field editable',
                    locked().join(','), 'false,false,false,false');

                activeSel.value = 'false';
                onRender(form);
                eq('an inactive one opens with term, tariff and packs locked',
                    locked().join(','), 'true,true,true,true');
                eq('locked does not mean blanked — the values still show',
                    JSON.stringify(shown()), JSON.stringify({ tariff: 'TURBO', packs: 'A1A2,B1B2' }));

                activeSel.value = 'true';
                activeSel.dispatchEvent(new win.Event('change'));
                eq('switching it back on unlocks them live',
                    locked().join(','), 'false,false,false,false');

                activeSel.value = 'false';
                activeSel.dispatchEvent(new win.Event('change'));
                eq('and switching off locks them again',
                    locked().join(','), 'true,true,true,true');

                activeSel.value = 'true';
                activeSel.dispatchEvent(new win.Event('change'));
                eq('no value is lost across the toggling',
                    JSON.stringify(shown()), JSON.stringify({ tariff: 'TURBO', packs: 'A1A2,B1B2' }));
            }

            /* ---- deactivation still sends only what the endpoint reads ---- */
            {
                const r = await drive(userOf(), (v) => Object.assign({}, v, {
                    active: 'false', tariff: 'PREMIUM', durationDays: '5', packs: []
                }));
                eq('turning a subscription off ignores the other fields entirely',
                    JSON.stringify(r.calls[0].payload),
                    JSON.stringify({ userId: 'u1', active: false }));
            }

            finish();
        })();
    }
}

/* The admin-dialog block above runs asynchronously and calls finish() when it
   settles, so the report is printed once, after every assertion has run. */
function finish() {
    console.log(`  4 plans · ${plans.map((p) => p.name + '=' + p.plan).join(' · ')}`);
    console.log('\n' + '='.repeat(60));
    if (fail) {
        console.log(`  ❌ PRICING PLANS: ${fail} failed / ${pass + fail}\n`);
        failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
        console.log('='.repeat(60) + '\n');
        process.exit(1);
    }
    console.log(`  ✅ PRICING PLANS: ${pass}/${pass} passed`);
    console.log('='.repeat(60) + '\n');
}
