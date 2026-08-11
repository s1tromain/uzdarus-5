#!/usr/bin/env node
/**
 * verify_b2_topic5.cjs — B2 Lesson 5 «Условные предложения».
 * Pins content, the B2 task-block format, paid-only vocabulary, audio, and the
 * demo window: topics 4 and 5 must stay locked in demo.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };

const w = new JSDOM('<body></body>', { runScripts: 'outside-only' }).window;
['shared-normalizer.js', 'sentence-builder.js', 'course-exercise-ui.js',
 'b2-topics.js', 'b2-lesson-data.js'].forEach(f =>
    w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

console.log('\n=== B2 TOPIC 5 — Условные предложения ===');

const all = w.B2_LESSON_DATA.topics;
[1, 2, 3, 4].forEach(id => ok(!!all.find(t => t.id === id), `topic ${id} still present`));
const t5 = all.find(t => t.id === 5);
ok(!!t5, 'topic 5 exists');
if (!t5) { console.log('missing lesson 5'); process.exit(1); }
ok(t5.id === 5, 'topic 5 has id 5');

/* ---------------------------------------------------------------- grammar */
const G = t5.grammar || '';
ok(G.length > 4000, `grammar is a full lesson (${G.length} chars)`);
[['what conditionals are', 'biror shart, faraz yoki ehtimoliy vaziyatni'],
 ['main construction', 'Если бы + o‘tgan zamon, ... + бы + fe’l'],
 ['бы particle', '«бы» yuklamasi'],
 ['word order', 'Я пошёл бы с тобой.'],
 ['wrong forms', 'Я бы пойду.'],
 ['past after бы', 'Если бы + o‘tgan zamon'],
 ['gender', 'Если бы я была женщиной…'],
 ['plural', 'Если бы мы были богатыми…'],
 ['на твоём месте', 'На твоём месте я бы + fe’l'],
 ['regret / wish', 'Если бы у меня был ещё один шанс…'],
 ['то', 'то я бы купил квартиру'],
 ['ready constructions', 'Я бы предпочёл…'],
 ['short rule', 'Qisqa qoida']
].forEach(([label, needle]) => ok(G.indexOf(needle) !== -1, `grammar keeps: ${label}`));
ok(!/\$\{/.test(G), 'no template placeholder leaked');

/* -------------------------------------------------------------- exercises */
const ex = t5.exercises || [];
const gg = ex.filter(g => !g.audioSrc);
const ag = ex.filter(g => g.audioSrc);
ok(gg.length === 10, `10 grammar exercise groups (${gg.length})`);
ok(ag.length === 1, `1 audio exercise group (${ag.length})`);
ok(gg.reduce((a, g) => a + g.items.length, 0) === 100, '100 grammar items');
ok(ag[0].items.length === 10, 'audio exercise has 10 items');
ok(ex.every(g => g.items.length === 10), 'every group carries 10 items');

const TITLES = [
    "1-mashq. Fe'lni to'g'ri shaklda qo'ying",
    '2-mashq. Gaplarni davom ettiring',
    "3-mashq. «На твоём месте я бы…» konstruksiyasini ishlating",
    "4-mashq. Ikki gapni «если бы» yordamida birlashtiring",
    "5-mashq. To'g'ri variantni tanlang",
    '6-mashq. Xatoni toping va tuzating',
    "7-mashq. O'zbek tilidan rus tiliga tarjima qiling",
    "8-mashq. «Я бы / я бы не» bilan gap tuzing",
    '9-mashq. Savolga javob bering',
    "10-mashq. Dialogni to'ldiring"
];
TITLES.forEach((t, i) => ok(gg[i] && gg[i].title === t, `group ${i + 1} is "${t}"`));

/* answer keys: present, clean, accepted, and inside options where applicable */
let missing = 0, junk = 0, badOpt = 0, unmatched = 0, variants = 0;
ex.forEach(g => g.items.forEach(it => {
    const acc = Array.isArray(it.answer) ? it.answer : [it.answer];
    variants += acc.length;
    if (!acc.length || acc.every(x => x == null || !String(x).trim())) missing++;
    if (/TODO|FIXME|placeholder|undefined|null/i.test(JSON.stringify(it.answer))) junk++;
    if (Array.isArray(it.options) && !acc.some(x => it.options.indexOf(x) !== -1)) badOpt++;
    acc.forEach(x => { if (!w.UzExerciseUI.matchItem(it, x)) unmatched++; });
}));
ok(missing === 0, `all 110 items have an answer key (${missing} missing)`);
ok(junk === 0, 'no TODO / placeholder / undefined / null in any answer');
ok(badOpt === 0, `every choice answer is among its options (${badOpt} bad)`);
ok(unmatched === 0, `the shared scorer accepts every accepted answer (${unmatched} rejected)`);

/* open exercises keep the material's sample answer FIRST */
const first = (gi, ii) => { const a = gg[gi].items[ii].answer; return Array.isArray(a) ? a[0] : a; };
ok(Array.isArray(gg[8].items[0].answer), 'ex9 uses the accepted-answers array');
ok(Array.isArray(gg[9].items[0].answer), 'ex10 uses the accepted-answers array');
ok(first(8, 0) === 'Если бы я мог жить в любой стране, я бы жил в Испании.',
    'ex9 #1 keeps the material sample first');
ok(first(9, 0) === 'На твоём месте я бы выбрал работу, которая мне нравится.',
    'ex10 #1 keeps the material sample first');

/* spot-check keys copied verbatim from the material's Javoblar */
ok(first(0, 0) === 'купил', 'ex1 #1 key completes "я бы ___" without a second бы');

/* The prompts already carry «я бы / она бы / мы бы». A key that repeats «бы»
   produces "я бы купил бы" on screen, which is wrong Russian. Guard the whole
   topic, not just the two exercises where it was found. */
let doubleBy = 0;
ex.forEach(g => g.items.forEach(it => {
    const acc = Array.isArray(it.answer) ? it.answer : [it.answer];
    acc.forEach(a => {
        const sentence = it.q.replace(/_+/g, ' ') + ' ' + a;
        if (/\bбы\b[^.]*\bбы\b/.test(sentence)) doubleBy++;
    });
}));
ok(doubleBy === 0, `no answer produces a doubled «бы» (${doubleBy} found)`);
ok(first(3, 6) === 'Если бы ты пришёл раньше, мы бы поговорили.', 'ex4 #7 key is verbatim');
ok(first(5, 6) === 'Если бы они были здесь, они помогли бы нам.', 'ex6 #7 key is verbatim');
ok(first(6, 1) === 'На твоём месте я бы согласился на эту работу.', 'ex7 #2 key is verbatim');
ok(first(7, 2) === 'Я бы не менял работу.', 'ex8 #3 key is verbatim');

/* ----------------------------------------------------------------- format */
ok(ex.every(g => g.showTask === true), 'every group opts into the task block');
ok(ex.every(g => !g.howTo), 'no group carries a "Как выполнять" briefing');
ok(ex.every(g => typeof g.intro === 'string' && g.intro.length > 20),
    'every group states its task in Uzbek (11 instructions)');
ok(gg.filter(g => g.namuna).length === 10, 'all 10 grammar groups carry their Namuna');
ok(!ag[0].namuna, 'the audio group has no invented Namuna');

ex.forEach(g => {
    const d = w.document.createElement('div');
    d.innerHTML = w.UzExerciseUI.renderGroup(g);
    ok(!!d.querySelector('.b2h-howto-t'), `${g.id}: exercise name rendered`);
    ok(!!d.querySelector('.b2h-howto-task'), `${g.id}: Uzbek task rendered`);
    ok(!d.querySelector('.b2h-howto-h'), `${g.id}: no "Как выполнять" heading`);
    ok(!/Как выполнять/.test(d.textContent), `${g.id}: phrase absent`);
    ok(!/\u{1F4A1}/u.test(d.textContent), `${g.id}: no lightbulb card`);
    ok(d.querySelectorAll('.b2h-item').length === g.items.length, `${g.id}: all items rendered`);
    if (g.namuna) ok(/Namuna:/.test(d.textContent), `${g.id}: Namuna rendered`);
});

/* ------------------------------------------------------------------ audio */
ok(/%D0%912%205%20%D1%83%D1%80%D0%BE%D0%BA\.mp3/.test(ag[0].audioSrc),
    'audioSrc points at "Б2 5 урок.mp3"');
ok(decodeURIComponent(ag[0].audioSrc) === 'audios/Б2 5 урок.mp3',
    'audioSrc decodes to the exact path');
ok(fs.existsSync(path.join(ROOT, 'audios', 'Б2 5 урок.mp3')), 'the audio file exists on disk');
ok(ag[0].items.map(i => i.answer).join(',') ===
   'Правда,Ложь,Правда,Правда,Ложь,Правда,Ложь,Правда,Ложь,Правда',
    'audio answers follow the required order');

/* ------------------------------------------------- vocabulary (paid only) */
{
    const s = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-vocabulary.html'), 'utf8');
    const i5 = s.indexOf('                    id: 5,');
    ok(i5 > -1, 'paid vocabulary has topic 5');
    const seg = s.slice(s.lastIndexOf('{', i5), s.indexOf('generateLockedTopics(6)'));
    ok((seg.match(/\{ ru: "/g) || []).length === 70,
        `paid vocabulary topic 5 has all 70 entries (${(seg.match(/\{ ru: "/g) || []).length})`);
    ok(/name: "Условные предложения"/.test(seg), 'paid vocabulary topic 5 is this lesson');
    [['мечтать', 'verbs'], ['избежать', 'last verb'], ['жизненный выбор', 'life choices'],
     ['советовать', 'advice'], ['смелый', 'adjectives'], ['Я бы не пожалел.', 'last phrase']
    ].forEach(([wd, label]) => ok(seg.indexOf('"' + wd + '"') !== -1,
        `paid vocabulary keeps ${label} ("${wd}")`));
    ok(/generateLockedTopics\(6\)/.test(s), 'locked vocabulary topics now start at 6');
    ok(/Прямая и косвенная речь/.test(s) && /Деепричастие \(ravishdosh\)/.test(s)
       && /Причастие \(sifatdosh\)/.test(s), 'paid vocabulary topics 2-4 intact');

    const demo = fs.readFileSync(path.join(ROOT, 'b2-demo-vocabulary.html'), 'utf8');
    ok(!/                    id: 5,/.test(demo), 'demo vocabulary untouched (no topic 5)');
    ok(!/                    id: 4,/.test(demo), 'demo vocabulary untouched (no topic 4)');
    ok(/generateLockedTopics\(4\)/.test(demo), 'demo still locks from topic 4');
}

/* ----------------------------------------------------------------- access */
['paid-courses/b2-course.html', 'b2-demo.html'].forEach(rel => {
    const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    ok(/var locked = B2_DEMO_MODE && t\.id > 3;/.test(s),
        `${rel}: demo rule unchanged — topics 4 and 5 stay locked in demo`);
});

console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ B2 TOPIC 5: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ B2 TOPIC 5: ${pass}/${pass} passed  (accepted-answer variants: ${variants})`);
console.log('='.repeat(60) + '\n');
