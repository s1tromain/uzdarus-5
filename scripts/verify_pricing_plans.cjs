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
    ok(/tariff: String\(values\.tariff \|\| 'START'\)\.toUpperCase\(\)/.test(admin),
        'the admin form still SAVES the stored value, not the label');
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

console.log(`  4 plans · ${plans.map((p) => p.name + '=' + p.plan).join(' · ')}`);
console.log('\n' + '='.repeat(60));
if (fail) {
    console.log(`  ❌ PRICING PLANS: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 20).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ PRICING PLANS: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
