#!/usr/bin/env node
/**
 * verify_b2_topic2.cjs — B2 Lesson 2 «Причастие (sifatdosh)».
 *
 * Pins the authored content, the exercise format B2 now uses (exercise name +
 * Uzbek task + Namuna, and NO "Как выполнять" briefing), the vocabulary, the
 * audio wiring, and the demo access window.
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

console.log('\n=== B2 TOPIC 2 — Причастие ===');

/* ------------------------------------------------------------ content */
const t2 = w.B2_LESSON_DATA.topics.find(t => t.id === 2);
ok(!!t2, 'lesson 2 exists in B2_LESSON_DATA');

const G = t2.grammar || '';
ok(G.length > 5000, `grammar is a full lesson (${G.length} chars)`);
[['definition', 'fe’l va sifat xususiyatlarini'],
 ['действительное', 'Действительное причастие'],
 ['страдательное', 'Страдательное причастие'],
 ['active suffixes', '-ущий / -ющий'],
 ['passive suffixes', '-нный, -енный, -анный, -тый'],
 ['причастный оборот', 'Причастный оборот'],
 ['comma rule', 'Vergul qo‘yilishi'],
 ['people', 'мужчина, стоящий у двери'],
 ['places', 'парк, расположенный в центре города'],
 ['things', 'телефон, купленный вчера'],
 ['formula', 'ОТ + ПРИЧАСТИЕ'],
 ['masculine', 'работающий студент'],
 ['feminine', 'работающая девушка'],
 ['neuter', 'написанное письмо'],
 ['plural', 'работающие студенты'],
 ['agreement rule', 'bir xil <b>род + число + падеж</b>']
].forEach(([label, needle]) => ok(G.indexOf(needle) !== -1, `grammar keeps: ${label}`));

/* all six cases appear in every one of the four paradigm tables */
const tables = G.split('<table').slice(1);
ok(tables.length >= 8, `grammar renders ${tables.length} real tables`);
const caseTables = tables.filter(t => /И\.п\./.test(t));
ok(caseTables.length === 4, `four case paradigms present (${caseTables.length})`);
caseTables.forEach((t, i) => {
    const cases = ['И.п.', 'Р.п.', 'Д.п.', 'В.п.', 'Т.п.', 'П.п.'].filter(c => t.indexOf(c) !== -1);
    ok(cases.length === 6, `case table ${i + 1} lists all six cases (${cases.length})`);
});
ok(!/\$\{/.test(G), 'no unclosed template placeholder leaked into the grammar');

/* ------------------------------------------------------------ exercises */
const ex = t2.exercises || [];
ok(ex.length === 14, `14 exercise groups (${ex.length})`);
const items = ex.reduce((a, g) => a + (g.items || []).length, 0);
ok(items === 140, `140 items (${items})`);
ok(ex.every(g => (g.items || []).length === 10), 'every group carries 10 items');

const EXPECTED = [
    "1-mashq. To'g'ri причастие shaklini tanlang",
    "2-mashq. Fe'lni причастиеga aylantiring",
    '3-mashq. Ikki gapni bitta gapga birlashtiring',
    '4-mashq. Действительное yoki страдательное причастие?',
    "5-mashq. Kerakli qo'shimchani tanlang",
    '6-mashq. Причастный оборотni toping',
    "7-mashq. Vergullarni to'g'ri qo'ying",
    '8-mashq. Xatoni toping va tuzating',
    '9-mashq. Tarjima qiling',
    '10-mashq. Batafsil tasvirlang',
    "Matn bo'yicha «Rost yoki yolg'on» mashqi",
    'Matndagi причастияni toping',
    'Причастие turini aniqlang',
    "To'g'ri shaklni tanlang"
];
EXPECTED.forEach((title, i) => ok(ex[i] && ex[i].title === title,
    `group ${i + 1} is "${title}"`));

/* answer keys — nothing may be missing or a placeholder */
let missing = 0, placeholder = 0;
ex.forEach(g => (g.items || []).forEach(it => {
    const a = it.answer;
    const empty = a == null || (Array.isArray(a) ? a.length === 0 || a.every(x => !String(x).trim())
                                                 : !String(a).trim());
    if (empty) missing++;
    if (/TODO|FIXME|placeholder/i.test(JSON.stringify(a))) placeholder++;
}));
ok(missing === 0, `every one of the 140 items has an answer key (${missing} missing)`);
ok(placeholder === 0, 'no placeholder answers');

/* every option-based item's answer is actually one of its options */
let badOpt = 0;
ex.forEach(g => (g.items || []).forEach(it => {
    if (!Array.isArray(it.options)) return;
    const accepted = Array.isArray(it.answer) ? it.answer : [it.answer];
    if (!accepted.some(a => it.options.indexOf(a) !== -1)) badOpt++;
}));
ok(badOpt === 0, `every multiple-choice answer is among its own options (${badOpt} bad)`);

/* the engine must accept the authored answer for every item */
let unmatched = 0;
ex.forEach(g => (g.items || []).forEach(it => {
    const first = Array.isArray(it.answer) ? it.answer[0] : it.answer;
    if (!w.UzExerciseUI.matchItem(it, first)) unmatched++;
}));
ok(unmatched === 0, `the shared scorer accepts every authored answer (${unmatched} rejected)`);

/* ------------------------------------------------------------ format */
ok(ex.every(g => g.showTask === true), 'every group opts into the task block');
ok(ex.every(g => !g.howTo), 'no group carries a "Как выполнять" briefing');
ok(ex.every(g => typeof g.intro === 'string' && g.intro.length > 20),
    'every group states its task');
const namuna = ex.filter(g => g.namuna).length;
ok(namuna === 10, `Namuna present on the 10 groups whose material supplies one (${namuna})`);

ex.forEach(g => {
    const d = w.document.createElement('div');
    d.innerHTML = w.UzExerciseUI.renderGroup(g);
    ok(!!d.querySelector('.b2h-howto-t'), `${g.id}: exercise name rendered`);
    ok(!!d.querySelector('.b2h-howto-task'), `${g.id}: Uzbek task rendered`);
    ok(!d.querySelector('.b2h-howto-h'), `${g.id}: no "Как выполнять" heading`);
    ok(!/Как выполнять/.test(d.textContent), `${g.id}: phrase absent`);
    ok(!/\u{1F4A1}/u.test(d.textContent), `${g.id}: no lightbulb card`);
    ok(!/tekshirish/i.test(d.textContent), `${g.id}: no check button inside the group`);
    ok(d.querySelectorAll('.b2h-item').length === g.items.length,
        `${g.id}: all ${g.items.length} items rendered`);
    if (g.namuna) ok(/Namuna:/.test(d.textContent), `${g.id}: Namuna rendered`);
});

/* ------------------------------------------------------------ audio */
const audio = ex.filter(g => g.audioSrc);
ok(audio.length === 1, 'exactly one group carries the audio player');
ok(audio[0] && /%D0%912%202%20%D1%83%D1%80%D0%BE%D0%BA\.mp3/.test(audio[0].audioSrc),
    'audio points at "Б2 2 урок.mp3"');
ok(fs.existsSync(path.join(ROOT, 'audios', 'Б2 2 урок.mp3')), 'the audio file exists on disk');
const audioGroups = ex.slice(10);
ok(audioGroups.length === 4, 'four audio exercises');
ok(/Мой любимый город/.test(audio[0].intro), 'audio exercise names the passage');

/* ------------------------------------------------------------ vocabulary */
['paid-courses/b2-vocabulary.html', 'b2-demo-vocabulary.html'].forEach(rel => {
    const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const i2 = s.indexOf('                    id: 2,');
    const i3 = s.indexOf('                    id: 3,');
    const seg = s.slice(s.lastIndexOf('{', i2), s.lastIndexOf('{', i3));
    const count = (seg.match(/\{ ru: "/g) || []).length;
    ok(count === 75, `${rel}: topic 2 has all 75 words (${count})`);
    ok(/name: "Причастие \(sifatdosh\)"/.test(seg), `${rel}: topic 2 is the participle lesson`);
    ok(!/образование|квалификац/.test(seg), `${rel}: the old education list is gone`);
    [['работающий', 'first entry'], ['спешащий', 'people group'],
     ['расположенный', 'places group'], ['потерянный', 'things group'],
     ['культурный центр', 'useful words'], ['люди, спешащие на работу', 'last entry']
    ].forEach(([word, label]) => ok(seg.indexOf('"' + word + '"') !== -1,
        `${rel}: keeps ${label} ("${word}")`));
});

/* ------------------------------------------------------------ access */
['paid-courses/b2-course.html', 'b2-demo.html'].forEach(rel => {
    const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    ok(/var locked = B2_DEMO_MODE && t\.id > 3;/.test(s),
        `${rel}: demo window is topics 1-3, paywall untouched beyond it`);
    ok(!/Javoblarni tekshirish/.test(s), `${rel}: no check button on the lesson page`);
});

console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ B2 TOPIC 2: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ B2 TOPIC 2: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
