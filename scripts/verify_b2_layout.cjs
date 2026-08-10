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

const HOST = fs.readFileSync(path.join(ROOT, 'b2-host.js'), 'utf8');
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

/* ------------------------------------------------ 2. grammar tokens */
{
    ok(/'\.b2h,\.b2g\{--b2-ink:/.test(HOST),
        'design tokens are declared on BOTH .b2h and .b2g');
    ok(!/'\.b2h\{--b2-ink:/.test(HOST), 'the old .b2h-only token block is gone');

    /* Every var() inside the grammar block must carry a literal fallback, so an
       unresolved token can never drop text to `inherit` again. */
    const gram = (HOST.split('/* ---- grammar lesson ---- */')[1] || '')
        .split('/* ---- results screen ---- */')[0];
    ok(gram.length > 500, 'grammar style block located');
    const bare = (gram.match(/var\(--b2-[a-z]+\)/g) || []);
    ok(bare.length === 0, `no fallback-less var() in the grammar block (${bare.join(', ')})`);

    ok(/'\.b2g-t td\{[^']*color:#1a1c2e/.test(HOST), 'table cells set an explicit colour');
    ok(/'\.b2g-t td\{[^']*background:#fff/.test(HOST), 'table cells set an explicit background');
    ok(/'\.b2g-t th\{color:#fff\}'/.test(HOST), 'table headers set an explicit colour');
}

/* ------------------------------------------------ 2b. it actually renders */
{
    const dom = new JSDOM('<!doctype html><html><body></body></html>',
        { runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    w.Element.prototype.scrollIntoView = function () {};
    w.eval(fs.readFileSync(path.join(ROOT, 'exercise-session.js'), 'utf8'));
    w.eval(HOST);
    w.eval(fs.readFileSync(path.join(ROOT, 'b2-lesson-data.js'), 'utf8'));
    w.B2Host.create({ getTopic: () => w.B2_LESSON_DATA.topics[0] });   // injects styles

    const box = w.document.createElement('div');
    box.className = 'grammar-content';
    box.innerHTML = w.B2_LESSON_DATA.topics[0].grammar;
    w.document.body.appendChild(box);
    const cs = (el) => w.getComputedStyle(el);

    ok(!!box.querySelector('.b2g'), 'grammar mounts under .b2g');
    ok(box.querySelectorAll('h4').length >= 8, 'all grammar sections present');
    ok(box.querySelectorAll('table').length >= 3, 'all tables present');

    const cells = Array.from(box.querySelectorAll('.b2g-t td'));
    ok(cells.length > 40, `tables are populated (${cells.length} cells)`);
    ok(cells.filter(c => c.textContent.trim()).length === cells.length,
        'every table cell has content — no empty tables');
    ok(cs(cells[0]).color === 'rgb(26, 28, 46)', 'table text is dark, not inherited white');
    ok(cs(cells[0]).backgroundColor !== 'rgba(0, 0, 0, 0)', 'table cells have a solid background');
    ok(cs(box.querySelector('.b2g-t th')).color === 'rgb(255, 255, 255)',
        'table headers stay white on their gradient');

    const empties = Array.from(box.querySelectorAll('div,li,p,td,th'))
        .filter(e => !e.textContent.trim() && !e.querySelector('*'));
    ok(empties.length === 0, `no empty blocks anywhere in the lesson (${empties.length})`);

    /* nothing in the lesson may render as white-on-white */
    const white = Array.from(box.querySelectorAll('*')).filter(e =>
        cs(e).color === 'rgb(255, 255, 255)' && !e.closest('.b2g-t th') && !e.closest('.b2g-scheme'));
    ok(white.length === 0, `no white text outside the coloured headers (${white.length})`);
}

/* ------------------------------------------------ 3. vocabulary card */
for (const p of PAGES) {
    const s = fs.readFileSync(path.join(ROOT, p.file), 'utf8');
    const T = p.label;
    ok(s.includes('class="b2-vocab-card"'), `${T} vocabulary card is in the lesson template`);
    ok(/\.b2-vocab-card\s*\{/.test(s), `${T} vocabulary card is styled`);
    ok(s.includes("So'zlar lug'ati"), `${T} keeps the original heading`);
    ok(s.includes("Lug'atni ochish"), `${T} keeps the original call to action`);
    ok(s.includes(`${p.vocab}?topic=\${topic.id}`),
        `${T} links to ${p.vocab} with the topic id`);
    /* rendered for every topic, from the shared template — no per-topic content */
    const tpl = s.slice(s.indexOf('lessonContent.innerHTML'), s.indexOf('lessonContent.innerHTML') + 2600);
    ok(tpl.includes('b2-vocab-card'), `${T} the card sits in the single lesson template`);
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
