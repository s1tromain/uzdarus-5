#!/usr/bin/env node
/**
 * verify_b2_topic4.cjs — B2 Lesson 4 «Прямая и косвенная речь».
 * Pins the authored content, the B2 task-block format, vocabulary (paid only),
 * audio, and the demo window: topic 4 must stay locked in demo.
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

console.log('\n=== B2 TOPIC 4 — Прямая и косвенная речь ===');

const all = w.B2_LESSON_DATA.topics;
[1, 2, 3].forEach(id => ok(!!all.find(t => t.id === id), `topic ${id} still present`));
const t4 = all.find(t => t.id === 4);
ok(!!t4, 'topic 4 exists');
if (!t4) { console.log('missing lesson 4'); process.exit(1); }
ok(t4.id === 4, 'topic 4 has id 4');
ok(t4.title === 'Прямая и косвенная речь', 'topic 4 title matches the syllabus');

/* ---------------------------------------------------------------- grammar */
const G = t4.grammar || '';
ok(G.length > 4000, `grammar is a full lesson (${G.length} chars)`);
[['прямая речь', 'Прямая речь — Ko‘chirma gap'],
 ['косвенная речь', 'Косвенная речь — O‘zlashtirma gap'],
 ['что', 'Darak gaplarda: ЧТО'],
 ['ли', 'Ha/yo‘q savollari → ЛИ'],
 ['question words kept', 'Savol so‘zi bo‘lsa, u saqlanadi'],
 ['pronoun shift', 'Kishilik olmoshlari o‘zgaradi'],
 ['time/place shift', 'на следующий день'],
 ['накануне', 'накануне'],
 ['requests', 'попросил + кого? + инфинитив'],
 ['star block', 'Eng muhim konstruksiyalar'],
 ['short rule', 'Qisqa qoida'],
 ['example: занят', 'Он сказал, что он занят.'],
 ['example: почему', 'Она спросила, почему я опоздал.'],
 ['example: приду ли', 'Он спросил, приду ли я.']
].forEach(([label, needle]) => ok(G.indexOf(needle) !== -1, `grammar keeps: ${label}`));
ok(!/\$\{/.test(G), 'no template placeholder leaked');

/* -------------------------------------------------------------- exercises */
const ex = t4.exercises || [];
const gg = ex.filter(g => !g.audioSrc);
const ag = ex.filter(g => g.audioSrc);
ok(gg.length === 6, `6 grammar exercise groups (${gg.length})`);
ok(ag.length === 1, `1 audio exercise group (${ag.length})`);
const gItems = gg.reduce((a, g) => a + g.items.length, 0);
ok(gItems === 60, `60 grammar items (${gItems})`);
ok(ag[0] && ag[0].items.length === 10, `audio exercise has 10 items`);
ok(ex.every(g => g.items.length === 10), 'every group carries 10 items');

const TITLES = [
    '1-mashq. Прямую речь → косвенную речь',
    '2-mashq. Savol gaplarni косвенная речьga aylantiring',
    '3-mashq. Да/нет savollarini косвенная речьga aylantiring',
    "4-mashq. Buyruq va iltimoslarni o'zlashtirma gapga aylantiring",
    "5-mashq. Vaqt va joy so'zlariga e'tibor bering",
    '6-mashq. Aralash mashq'
];
TITLES.forEach((t, i) => ok(gg[i] && gg[i].title === t, `group ${i + 1} is "${t}"`));

let missing = 0, ph = 0, badOpt = 0, unmatched = 0;
ex.forEach(g => g.items.forEach(it => {
    const a = it.answer;
    const empty = a == null || (Array.isArray(a) ? !a.length || a.every(x => !String(x).trim())
                                                 : !String(a).trim());
    if (empty) missing++;
    if (/TODO|FIXME|placeholder/i.test(JSON.stringify(a))) ph++;
    if (Array.isArray(it.options)) {
        const acc = Array.isArray(a) ? a : [a];
        if (!acc.some(x => it.options.indexOf(x) !== -1)) badOpt++;
    }
    const first = Array.isArray(a) ? a[0] : a;
    if (!w.UzExerciseUI.matchItem(it, first)) unmatched++;
}));
ok(missing === 0, `all 70 items have an answer key (${missing} missing)`);
ok(ph === 0, 'no placeholder answers');
ok(badOpt === 0, `every choice answer is among its options (${badOpt} bad)`);
ok(unmatched === 0, `the shared scorer accepts every authored answer (${unmatched} rejected)`);

/* a few keys spot-checked verbatim against the material's Javoblar */
const key = (gi, ii) => gg[gi].items[ii].answer;
ok(key(0, 7) === 'Родители сказали, что они гордятся мной.', 'ex1 #8 key is verbatim');
ok(key(2, 0) === 'Она спросила, поел ли я уже.', 'ex3 #1 key is verbatim');
ok(key(3, 1) === 'Мама попросила меня помочь ей.', 'ex4 #2 key is verbatim');
ok(key(4, 5) === 'Сергей сказал, что вернётся тем вечером.', 'ex5 #6 key is verbatim');
ok(key(5, 7) === 'Мама спросила, знаю ли я, где лежат ключи.', 'ex6 #8 key is verbatim');

/* ----------------------------------------------------------------- format */
ok(ex.every(g => g.showTask === true), 'every group opts into the task block');
ok(ex.every(g => !g.howTo), 'no group carries a "Как выполнять" briefing');
ok(ex.every(g => typeof g.intro === 'string' && g.intro.length > 20),
    'every group states its task in Uzbek');
ok(gg.filter(g => g.namuna).length === 6, 'all 6 grammar groups carry their Namuna');

ex.forEach(g => {
    const d = w.document.createElement('div');
    d.innerHTML = w.UzExerciseUI.renderGroup(g);
    ok(!!d.querySelector('.b2h-howto-t'), `${g.id}: exercise name rendered`);
    ok(!!d.querySelector('.b2h-howto-task'), `${g.id}: Uzbek task rendered`);
    ok(!d.querySelector('.b2h-howto-h'), `${g.id}: no "Как выполнять" heading`);
    ok(!/Как выполнять/.test(d.textContent), `${g.id}: phrase absent`);
    ok(!/\u{1F4A1}/u.test(d.textContent), `${g.id}: no lightbulb card`);
    ok(!/tekshirish/i.test(d.textContent), `${g.id}: no check button in the group`);
    ok(d.querySelectorAll('.b2h-item').length === g.items.length, `${g.id}: all items rendered`);
    if (g.namuna) ok(/Namuna:/.test(d.textContent), `${g.id}: Namuna rendered`);
});

/* ------------------------------------------------------------------ audio */
ok(/%D0%912%204%20%D1%83%D1%80%D0%BE%D0%BA\.mp3/.test(ag[0].audioSrc),
    'audioSrc points at "Б2 4 урок.mp3"');
ok(decodeURIComponent(ag[0].audioSrc) === 'audios/Б2 4 урок.mp3',
    'audioSrc decodes to the exact path');
ok(fs.existsSync(path.join(ROOT, 'audios', 'Б2 4 урок.mp3')), 'the audio file exists on disk');
ok(/Важный разговор/.test(ag[0].intro), 'audio exercise names the passage');
const tf = ag[0].items.map(i => i.answer).join(',');
ok(tf === 'Правда,Ложь,Правда,Правда,Ложь,Правда,Ложь,Правда,Правда,Ложь',
    'audio answers follow the material Javoblar in order');

/* ------------------------------------------------- vocabulary (paid only) */
{
    const s = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-vocabulary.html'), 'utf8');
    const i4 = s.indexOf('                    id: 4,');
    ok(i4 > -1, 'paid vocabulary has topic 4');
    /* End at whatever follows topic 4 — the next authored topic if one exists,
       otherwise the generated locked list. Anchoring on a fixed
       generateLockedTopics(N) breaks as soon as another topic is authored. */
    const i5 = s.indexOf('                    id: 5,', i4);
    const gen = s.search(/generateLockedTopics\(\d+\)/);
    const stop = (i5 > -1 && (gen === -1 || i5 < gen)) ? s.lastIndexOf('{', i5) : gen;
    const seg = s.slice(s.lastIndexOf('{', i4), stop);
    const count = (seg.match(/\{ ru: "/g) || []).length;
    ok(count === 77, `paid vocabulary topic 4 has all 77 entries (${count})`);
    ok(/name: "Прямая и косвенная речь"/.test(seg), 'paid vocabulary topic 4 is this lesson');
    [['сказать', 'speech verbs'], ['пообещать', 'last verb'], ['прямая речь', 'speech nouns'],
     ['знак вопроса', 'punctuation'], ['ли', 'question particle'], ['оттуда', 'place words'],
     ['Она предупредила меня, что…', 'last construction']
    ].forEach(([wd, label]) => ok(seg.indexOf('"' + wd + '"') !== -1,
        `paid vocabulary keeps ${label} ("${wd}")`));
    ok(/generateLockedTopics\(\d+\)/.test(s), 'locked vocabulary topics are generated after the authored ones');
    ok(/Причастие \(sifatdosh\)/.test(s) && /Деепричастие \(ravishdosh\)/.test(s),
        'paid vocabulary topics 2 and 3 intact');

    const demo = fs.readFileSync(path.join(ROOT, 'b2-demo-vocabulary.html'), 'utf8');
    ok(!/                    id: 4,/.test(demo), 'demo vocabulary is untouched (no topic 4)');
    ok(/generateLockedTopics\(4\)/.test(demo), 'demo still locks from topic 4');
}

/* ----------------------------------------------------------------- access */
['paid-courses/b2-course.html', 'b2-demo.html'].forEach(rel => {
    const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    ok(/var locked = B2_DEMO_MODE && t\.id > 3;/.test(s),
        `${rel}: demo window unchanged — topics 1-3 open, topic 4+ locked`);
    ok(!/Javoblarni tekshirish/.test(s), `${rel}: no check button on the lesson page`);
});

console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ B2 TOPIC 4: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ B2 TOPIC 4: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
