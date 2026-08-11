#!/usr/bin/env node
/**
 * verify_b2_topic3.cjs — B2 Lesson 3 «Деепричастие (ravishdosh)».
 * Pins the authored content, the B2 task-block format, vocabulary, audio and
 * the demo access window. Topics 1 and 2 must survive untouched.
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

console.log('\n=== B2 TOPIC 3 — Деепричастие ===');

const all = w.B2_LESSON_DATA.topics;
ok(!!all.find(t => t.id === 1), 'topic 1 still present');
ok(!!all.find(t => t.id === 2), 'topic 2 still present');
const t3 = all.find(t => t.id === 3);
ok(!!t3, 'topic 3 exists');
ok(t3 && t3.id === 3, 'topic 3 has id 3');
if (!t3) { console.log('missing lesson 3'); process.exit(1); }

/* ---------------------------------------------------------------- grammar */
const G = t3.grammar || '';
ok(G.length > 4000, `grammar is a full lesson (${G.length} chars)`);
[['definition', 'asosiy fe’lga qo‘shimcha bo‘lgan harakatni'],
 ['imperfective suffixes', '-а / -я'],
 ['perfective suffixes', '-в / -вши / -ши'],
 ['Что делая?', 'Что делая?'],
 ['Что сделав?', 'Что сделав?'],
 ['несовершенный вид', 'Несовершенный вид'],
 ['совершенный вид', 'Совершенный вид'],
 ['same-subject rule', 'bajaruvchisi bir xil shaxs bo‘lishi kerak'],
 ['wrong example', 'Идя домой, начался дождь'],
 ['comma rule', 'vergul bilan ajratiladi'],
 ['formation', 'учиться → учась'],
 ['irregulars', 'прийти → придя'],
 ['Делая / Сделав', 'harakat tugagandan keyin'],
 ['speech use', 'Готовя ужин, я слушал музыку.']
].forEach(([label, needle]) => ok(G.indexOf(needle) !== -1, `grammar keeps: ${label}`));
ok(!/\$\{/.test(G), 'no template placeholder leaked');

/* -------------------------------------------------------------- exercises */
const ex = t3.exercises || [];
const grammarGroups = ex.filter(g => !g.audioSrc);
const audioGroups = ex.filter(g => g.audioSrc);
ok(grammarGroups.length === 11, `11 grammar exercise groups (${grammarGroups.length})`);
ok(audioGroups.length === 1, `1 audio exercise group (${audioGroups.length})`);
const gItems = grammarGroups.reduce((a, g) => a + g.items.length, 0);
ok(gItems === 110, `110 grammar items (${gItems})`);
ok(audioGroups[0] && audioGroups[0].items.length === 10,
    `audio exercise has 10 items (${audioGroups[0] ? audioGroups[0].items.length : 0})`);
ok(ex.every(g => g.items.length === 10), 'every group carries 10 items');

const TITLES = [
    "1-mashq. To'g'ri деепричастие ni tanlang",
    '2-mashq. Ikki gapni bitta gapga aylantiring',
    '3-mashq. Tarjima qiling',
    '4-mashq. Деепричастие shaklini yozing',
    "5-mashq. To'g'ri variantni tanlang",
    '6-mashq. Bir vaqtda yoki ketma-ket?',
    '7-mashq. Gapni davom ettiring',
    '8-mashq. Oddiy gapni Деепричастие bilan qayta yozing',
    "9-mashq. O'zbek tilidan rus tiliga tarjima qiling",
    '10-mashq. Xatoni toping va tuzating',
    '11-mashq. Moslashtiring'
];
TITLES.forEach((t, i) => ok(grammarGroups[i] && grammarGroups[i].title === t,
    `group ${i + 1} is "${t}"`));

/* answer keys */
let missing = 0, ph = 0, badOpt = 0, unmatched = 0;
ex.forEach(g => g.items.forEach(it => {
    const a = it.answer;
    const empty = a == null || (Array.isArray(a) ? !a.length || a.every(x => !String(x).trim())
                                                 : !String(a).trim());
    if (empty) missing++;
    if (/TODO|FIXME|placeholder|undefined|null/i.test(JSON.stringify(a))) ph++;
    if (Array.isArray(it.options)) {
        const acc = Array.isArray(a) ? a : [a];
        if (!acc.some(x => it.options.indexOf(x) !== -1)) badOpt++;
    }
    const first = Array.isArray(a) ? a[0] : a;
    if (!w.UzExerciseUI.matchItem(it, first)) unmatched++;
}));
ok(missing === 0, `all 120 items have an answer key (${missing} missing)`);
ok(ph === 0, 'no placeholder answers');
ok(badOpt === 0, `every choice answer is among its own options (${badOpt} bad)`);
ok(unmatched === 0, `the shared scorer accepts every authored answer (${unmatched} rejected)`);

/* ----------------------------------------------------------------- format */
ok(ex.every(g => g.showTask === true), 'every group opts into the task block');
ok(ex.every(g => !g.howTo), 'no group carries a "Как выполнять" briefing');
ok(ex.every(g => typeof g.intro === 'string' && g.intro.length > 20),
    'every group states its task in Uzbek');
const nam = ex.filter(g => g.namuna).length;
ok(nam === 11, `Namuna on the 11 groups whose material supplies one (${nam})`);

ex.forEach(g => {
    const d = w.document.createElement('div');
    d.innerHTML = w.UzExerciseUI.renderGroup(g);
    ok(!!d.querySelector('.b2h-howto-t'), `${g.id}: exercise name rendered`);
    ok(!!d.querySelector('.b2h-howto-task'), `${g.id}: Uzbek task rendered`);
    ok(!d.querySelector('.b2h-howto-h'), `${g.id}: no "Как выполнять" heading`);
    ok(!/Как выполнять/.test(d.textContent), `${g.id}: phrase absent`);
    ok(!/\u{1F4A1}/u.test(d.textContent), `${g.id}: no lightbulb card`);
    ok(!/tekshirish/i.test(d.textContent), `${g.id}: no check button in the group`);
    ok(d.querySelectorAll('.b2h-item').length === g.items.length,
        `${g.id}: all items rendered`);
    if (g.namuna) ok(/Namuna:/.test(d.textContent), `${g.id}: Namuna rendered`);
});

/* ------------------------------------------------------------------ audio */
const audio = audioGroups[0];
ok(/%D0%912%203%20%D1%83%D1%80%D0%BE%D0%BA\.mp3/.test(audio.audioSrc),
    'audioSrc points at "Б2 3 урок.mp3"');
ok(decodeURIComponent(audio.audioSrc) === 'audios/Б2 3 урок.mp3',
    'audioSrc decodes to the exact path');
ok(fs.existsSync(path.join(ROOT, 'audios', 'Б2 3 урок.mp3')), 'the audio file exists on disk');
ok(/Один обычный день/.test(audio.intro), 'audio exercise names the passage');

/* ------------------------------------------------------------- vocabulary */
['paid-courses/b2-vocabulary.html', 'b2-demo-vocabulary.html'].forEach(rel => {
    const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const i3 = s.indexOf('                    id: 3,');
    /* End at whatever follows topic 3 — the next authored topic if there is
       one, otherwise the generated locked list. Anchoring on a fixed
       generateLockedTopics(N) breaks the moment a new topic is authored. */
    const i4 = s.indexOf('                    id: 4,', i3);
    const gen = s.search(/generateLockedTopics\(\d+\)/);
    const stop = (i4 > -1 && (gen === -1 || i4 < gen)) ? s.lastIndexOf('{', i4) : gen;
    const seg = s.slice(s.lastIndexOf('{', i3), stop);
    const count = (seg.match(/\{ ru: "/g) || []).length;
    ok(count === 100, `${rel}: topic 3 has all 100 entries (${count})`);
    ok(/name: "Деепричастие \(ravishdosh\)"/.test(seg), `${rel}: topic 3 is the gerund lesson`);
    [['вставая', 'daily actions'], ['прочитав', 'study and work'], ['придя', 'movement'],
     ['объяснив', 'communication'], ['проверив', 'watching/listening'],
     ['помы́в', 'household'], ['удивившись', 'thought and feeling'],
     ['Вернувшись…, я…', 'key constructions']
    ].forEach(([wd, label]) => ok(seg.indexOf('"' + wd + '"') !== -1,
        `${rel}: keeps ${label} ("${wd}")`));
    /* topics 1 and 2 vocabularies untouched */
    ok(/name: "Причастие \(sifatdosh\)"/.test(s), `${rel}: topic 2 vocabulary intact`);
    ok(/id: 1,/.test(s), `${rel}: topic 1 vocabulary intact`);
});

/* ----------------------------------------------------------------- access */
['paid-courses/b2-course.html', 'b2-demo.html'].forEach(rel => {
    const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    ok(/var locked = B2_DEMO_MODE && t\.id > 3;/.test(s),
        `${rel}: demo window is topics 1-3, topic 4+ stays locked`);
    ok(!/Javoblarni tekshirish/.test(s), `${rel}: no check button on the lesson page`);
});

console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ B2 TOPIC 3: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ B2 TOPIC 3: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
