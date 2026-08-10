#!/usr/bin/env node
/**
 * verify_b2_layout.cjs — guards the three visual regressions that were fixed,
 * so they cannot come back silently.
 *
 *   1. topic cards      long titles must wrap inside the card, never overflow
 *   2. grammar lesson   design tokens must cover BOTH mount roots (.b2h/.b2g),
 *                       and every colour must survive an unresolved token
 *   3. vocabulary card  must render for EVERY topic, from the shared template
 *
 * Nothing here tests logic: the session engine, stepGate, renderSummary,
 * completedTopics and Firebase paths are untouched and covered elsewhere.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) pass++; else { fail++; failures.push(l); } };

const HOST_SRC = fs.readFileSync(path.join(ROOT, 'b2-host.js'), 'utf8');
const UI = fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8');
/* Presentation now lives in the shared layer and policy in the host; both ship
   to the page, so style assertions span the pair. */
const HOST = UI + '\n' + HOST_SRC;
const PAGES = [
    { file: 'paid-courses/b2-course.html', label: 'paid', vocab: 'b2-vocabulary.html' },
    { file: 'b2-demo.html', label: 'demo', vocab: 'b2-demo-vocabulary.html' }
];

console.log('\n=== B2 LAYOUT / VISUAL REGRESSION ===\n');

/* ------------------------------------------------ 1. topic card wrapping */
for (const p of PAGES) {
    const s = fs.readFileSync(path.join(ROOT, p.file), 'utf8');
    const T = p.label;
    ok(/\.topic-info\s*\{[^}]*min-width:\s*0/.test(s),
        `${T} .topic-info has min-width:0 (flex children must be allowed to shrink)`);
    ok(/overflow-wrap:\s*anywhere/.test(s), `${T} long words are allowed to break`);
    ok(/word-break:\s*break-word/.test(s), `${T} word-break fallback present`);
    ok(/\.topic-btn\s*\{\s*align-items:\s*flex-start/.test(s),
        `${T} the icon does not stretch a taller card`);
    ok(/\.topics-grid\s*\{\s*align-items:\s*stretch/.test(s), `${T} cards share a row height`);
    ok(/@media \(max-width: 900px\)[^}]*grid-template-columns:\s*1fr/.test(s),
        `${T} grid collapses to one column on narrow screens`);
    /* the rule must apply to all three text lines, not just the title */
    const m = s.match(/\.topic-title,\s*\n\s*\.topic-desc,\s*\n\s*\.b2-meta span\s*\{/);
    ok(!!m, `${T} wrapping applies to title, description AND the three meta lines`);
    ok(!/if\s*\(\s*topic(Id)?\s*[=!]==?\s*1\s*\)/.test(s), `${T} no per-topic hardcode introduced`);
}

/* ------------------------------------------------ 2. grammar design system */
{
    ok(/'\.b2h,\.b2g\{--b2-ink:/.test(HOST), 'shared tokens cover both mount roots');

    const gram = (HOST.split('/* ---- grammar lesson ---')[1] || '')
        .split('/* ---- results screen ---- */')[0];
    ok(gram.length > 1500, 'grammar design system located');
    /* The stylesheet is built from an array of string fragments, so a single
       CSS rule can straddle two array entries. Join them back before matching,
       otherwise the test reports a false failure on perfectly good CSS. */
    const gramCss = gram.replace(/',\s*\n\s*'/g, '').replace(/'/g, '');

    /* Every var() must carry a literal fallback, so an unresolved token can
       never drop text to `inherit` again (the old white-on-white bug). */
    const bare = (gramCss.match(/var\(--[a-z0-9-]+\)/g) || []);
    ok(bare.length === 0, `no fallback-less var() in the grammar block (${bare.join(', ')})`);

    /* THE mobile bug: legacy `word-break: break-word` behaves like `anywhere`
       in WebKit and split words mid-letter. It must be gone, everywhere. */
    ok(!/word-break:break-word|word-break:break-all|word-break:anywhere/.test(gramCss),
        'grammar never uses a break value that splits words mid-letter');
    ok(/\.b2g\{[^']*word-break:normal/.test(gramCss) || /word-break:normal/.test(gramCss),
        'grammar pins word-break to normal');
    ok(/hyphens:none/.test(gramCss), 'grammar disables hyphenation');
    ok(/\.b2g \*\{word-break:normal;hyphens:none/.test(gramCss),
        'the rule is inherited by every descendant, including table cells');

    /* modern table treatment */
    ok(/\.b2g-t\{[^']*border-radius:14px/.test(gramCss), 'tables are rounded');
    ok(/border-collapse:separate/.test(gramCss), 'tables use separate borders (radii survive)');
    ok(/\.b2g-t th\{[^']*background:var\(--g-tint/.test(gramCss),
        'table header is a light tint, not a saturated purple bar');
    ok(/\.b2g-t td\{padding:14px 16px/.test(gramCss), 'cells have generous padding');
    ok(/@media\(hover:hover\)\{\.b2g-t tr:hover td/.test(gramCss), 'row hover, desktop only');
    ok(/box-shadow:0 1px 2px rgba\(16,24,40,\.03\)/.test(gramCss), 'tables carry a soft shadow');

    /* callout component with an icon */
    ok(/\.b2g-tip::before,\.b2g-warn::before\{position:absolute/.test(gramCss),
        'callouts are one component with an icon slot');
    ok(/\.b2g-tip::before\{content:"\\\\1F4A1"\}/.test(gramCss), 'tip renders the 💡 icon');
    ok(/\.b2g-warn::before\{content:"\\\\26A0/.test(gramCss), 'warning renders its own icon');
    ok(/padding:16px 20px 16px 52px/.test(gramCss), 'callout text clears the icon');

    /* branded list markers */
    ok(/\.b2g-list\{list-style:none/.test(gramCss), 'default bullets removed');
    ok(/\.b2g-list li::before\{content:""/.test(gramCss), 'list uses a custom marker');
    ok(/\.b2g-list li::after\{content:""/.test(gramCss), 'marker draws a check');

    /* typography + rhythm */
    ok(/font-size:clamp\(15px/.test(gramCss), 'body type is fluid');
    ok(/\.b2g h4\{margin:40px 0 16px/.test(gramCss), 'sections have real breathing room');
    ok(/max-width:68ch/.test(gramCss), 'measure is capped for readability');

    /* mobile */
    ok(/@media\(max-width:640px\)\{/.test(gramCss), 'grammar has a mobile breakpoint');
    ok(/\.b2g-t\{display:block;overflow-x:auto/.test(gramCss),
        'tables scroll inside themselves on mobile — the page never scrolls sideways');
}

/* ---------------------------------- 2a. the page surface behind the grammar */
for (const p of PAGES) {
    const s = fs.readFileSync(path.join(ROOT, p.file), 'utf8');
    const T = p.label;
    ok(!/\.grammar-section\s*\{[^}]*linear-gradient\(135deg, var\(--blue\)/.test(s),
        `${T} the saturated blue grammar background is gone`);
    ok(/\.grammar-section\s*\{[^}]*background:\s*#FFFFFF/.test(s),
        `${T} grammar sits on a light surface`);
    ok(/\.grammar-section\s*\{[^}]*color:\s*#1F2430/.test(s), `${T} grammar text is dark grey`);
    ok(!/\.grammar-section table td,\s*\n\s*\.grammar-section table th \{[^}]*word-break:\s*break-word/.test(s),
        `${T} the legacy word-break:break-word rule is removed`);
    ok(/\.grammar-section table td,\s*\n\s*\.grammar-section table th \{[^}]*word-break:\s*normal/.test(s),
        `${T} table cells wrap normally`);
    ok(/\.grammar-section table td,\s*\n\s*\.grammar-section table th \{[^}]*hyphens:\s*none/.test(s),
        `${T} table cells are never hyphenated`);
}

/* ------------------------------------------------ 2b. it actually renders */
{
    const dom = new JSDOM('<!doctype html><html><body></body></html>',
        { runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    w.Element.prototype.scrollIntoView = function () {};
    w.eval(fs.readFileSync(path.join(ROOT, 'exercise-session.js'), 'utf8'));
    w.eval(fs.readFileSync(path.join(ROOT, 'sentence-builder.js'), 'utf8'));
    w.eval(UI);
    w.eval(HOST_SRC);
    w.eval(fs.readFileSync(path.join(ROOT, 'b2-lesson-data.js'), 'utf8'));
    const api = w.B2Host.create({ getTopic: () => w.B2_LESSON_DATA.topics[0] });

    const box = w.document.createElement('div');
    box.className = 'grammar-content';
    box.innerHTML = w.B2_LESSON_DATA.topics[0].grammar;
    w.document.body.appendChild(box);
    const cs = (el) => w.getComputedStyle(el);

    ok(!!box.querySelector('.b2g'), 'grammar mounts under .b2g');
    ok(box.querySelectorAll('h4').length >= 8, 'all grammar sections still present');
    ok(box.querySelectorAll('table').length >= 3, 'all tables still present');
    ok(cs(box.querySelector('.b2g')).wordBreak === 'normal', 'computed word-break is normal');

    const cells = Array.from(box.querySelectorAll('.b2g-t td'));
    ok(cells.length > 40, `tables are populated (${cells.length} cells)`);
    ok(cells.every(c => c.textContent.trim()), 'every table cell has content');
    const empties = Array.from(box.querySelectorAll('div,li,p,td,th'))
        .filter(e => !e.textContent.trim() && !e.querySelector('*'));
    ok(empties.length === 0, `no empty blocks in the lesson (${empties.length})`);

    /* content preserved: the redesign was visual only */
    const txt = box.textContent;
    ['что', 'чтобы', 'если', 'когда', 'потому что', 'поэтому', 'хотя', 'несмотря на то']
        .forEach(c => ok(txt.includes(c), `grammar still explains "${c}"`));

    /* ---------------- how-to briefings ---------------- */
    const groups = w.B2_LESSON_DATA.topics[0].exercises;
    ok(groups.length === 10, 'all 10 exercises present');
    ok(groups.every(g => Array.isArray(g.howTo) && g.howTo.length >= 2),
        'every exercise carries its own multi-part briefing');
    const texts = groups.map(g => g.howTo.join(' '));
    ok(new Set(texts).size === texts.length, 'no briefing is copied between exercises');
    ok(texts.every(t => t.length > 150), 'every briefing is substantial, not a stub');

    groups.forEach(g => {
        const d = w.document.createElement('div');
        d.innerHTML = api.renderGroup(g);
        ok(!!d.querySelector('.b2h-howto'), `${g.id}: briefing card rendered`);
        ok(!!d.querySelector('.b2h-howto-t'), `${g.id}: exercise name shown`);
        ok(/Как выполнять/.test(d.querySelector('.b2h-howto-h').textContent),
            `${g.id}: "Как выполнять" heading shown`);
        ok(d.querySelectorAll('.b2h-howto p').length === g.howTo.length,
            `${g.id}: every paragraph rendered`);
        ok(d.querySelectorAll('.b2h-item').length === g.items.length,
            `${g.id}: the briefing does not disturb the question list`);
        /* the briefing comes BEFORE the first question */
        ok(d.innerHTML.indexOf('b2h-howto') < d.innerHTML.indexOf('b2h-item'),
            `${g.id}: briefing appears before the exercise`);
    });

    ok(/\.b2h-howto\{/.test(HOST), 'briefing is a shared component, not inline style');
    ok(/if \(g\.howTo\)/.test(HOST), 'briefing renders from data — generic for any course');
    ok(!/ex1|ex2|topicId/.test((HOST.split('if (g.howTo)')[1] || '').slice(0, 500)),
        'briefing rendering contains no per-exercise special-casing');
}

/* ------------------------------------------------ 3. vocabulary card */
for (const p of PAGES) {
    const s = fs.readFileSync(path.join(ROOT, p.file), 'utf8');
    const T = p.label;
    ok(/UzExerciseUI\.renderVocabCard/.test(s),
        `${T} vocabulary card comes from the shared component`);
    ok(!/class="b2-vocab-card"/.test(s), `${T} no private copy of the card markup`);
    /* styled once, in the shared component — not copied into each page */
    ok(!/\.b2-vocab-card\s*\{/.test(s), `${T} carries no private copy of the card CSS`);
    ok(/\.b2-vocab-card\{/.test(UI), `${T} vocabulary card is styled by the shared component`);
    ok(s.includes("So'zlar lug'ati"), `${T} keeps the original heading`);
    ok(s.includes("Lug'atni ochish"), `${T} keeps the original call to action`);
    ok(s.includes(`${p.vocab}?topic=\${topic.id}`),
        `${T} links to ${p.vocab} with the topic id`);
    /* rendered for every topic, from the shared template — no per-topic content */
    const tpl = s.slice(s.indexOf('lessonContent.innerHTML'), s.indexOf('lessonContent.innerHTML') + 2600);
    ok(/\$\{b2VocabCard\(topic\.id\)\}/.test(tpl),
        `${T} the card sits in the single lesson template`);
    ok(!/topic\.content\}<\/div>\s*\n\s*<div class="b2-vocab-card"/.test(tpl) ||
        tpl.includes('${topic.content ?'), `${T} no empty explanation div is rendered`);
    ok(tpl.includes('${topic.content ?'), `${T} the explanation block is skipped when empty`);
    ok(fs.existsSync(path.join(ROOT, p.file.startsWith('paid') ? 'paid-courses/' + p.vocab : p.vocab)),
        `${T} the linked vocabulary page exists on disk`);
}

/* the demo used to point at a paid-course file that does not exist at the root */
{
    const demo = fs.readFileSync(path.join(ROOT, 'b2-demo.html'), 'utf8');
    ok(!/['"]b2-vocabulary\.html/.test(demo),
        'demo no longer links to the non-existent root b2-vocabulary.html');
    ok((demo.match(/b2-demo-vocabulary\.html/g) || []).length >= 2,
        'demo links to its own vocabulary page from both the card and the topic list');
}

/* ------------------------------------------------ 4. logic untouched */
{
    const eng = fs.readFileSync(path.join(ROOT, 'exercise-session.js'), 'utf8');
    ok(/cfg\.stepGate/.test(eng), 'stepGate still present');
    ok(/cfg\.renderSummary/.test(eng), 'renderSummary still present');
    ok(/DEFAULT_CONFIRM/.test(eng), 'answer-review flow still present');
    ok(/function stepGate/.test(HOST), 'host gate still present');
    ok(/PASS_PERCENT = 85/.test(HOST), 'threshold unchanged');
    ok(/function buildResultsHtml/.test(HOST), 'results builder unchanged');
    for (const p of PAGES) {
        const s = fs.readFileSync(path.join(ROOT, p.file), 'utf8');
        ok(/completeTopic: function/.test(s), `${p.label} completion path intact`);
        ok(/saveProgress\(id\)/.test(s), `${p.label} progress path intact`);
        ok(/mountB2Practice\(topicId\)/.test(s), `${p.label} session mount intact`);
    }
}

console.log('='.repeat(56));
if (fail) {
    console.log(`  ❌ B2 LAYOUT: ${fail} failed / ${pass + fail}\n`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(56) + '\n');
    process.exit(1);
}
console.log(`  ✅ B2 LAYOUT / VISUAL: ${pass}/${pass} passed`);
console.log('='.repeat(56) + '\n');
