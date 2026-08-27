#!/usr/bin/env node
/**
 * verify_b2_topic9.cjs — B2 Lesson 9 «Модальные конструкции».
 *
 * Three things make this lesson different from Topics 6-8:
 *
 *  1. THERE IS NO AUDIO. The source supplied no recording, no statements and no
 *     key, so none was invented. This suite actively guards against a fabricated
 *     audio group or an «Б2 9 урок.mp3» reference appearing later.
 *
 *  2. Ex10 IS NEW. The source stops at nine exercises; the tenth is an authored
 *     controlled paraphrase drill, pinned here in full.
 *
 *  3. TWENTY of the 100 items are genuinely OPEN (Ex5, Ex6). Openness is
 *     OBSERVED through the product's own matchItem(), never re-implemented.
 *
 * The source's «пришлось = past / вынужден = present» shortcut was corrected:
 * «Я был вынужден…» is normal Russian, and the real distinction is impersonal
 * vs personal. That fix is pinned so it cannot regress.
 *
 * Grammar assertions read RENDERED TEXT, since the markup splits sentences.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const vc = new VirtualConsole();
vc.on('jsdomError', () => {});
const w = new JSDOM('<body></body>', { runScripts: 'outside-only', virtualConsole: vc }).window;
['shared-normalizer.js', 'sentence-builder.js', 'course-exercise-ui.js',
 'b2-topics.js', 'b2-lesson-data.js'].forEach(f =>
    w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const UI = w.UzExerciseUI;

console.log('\n=== B2 TOPIC 9 — Модальные конструкции ===');

/* ------------------------------------------------------------ data presence */
const all = w.B2_LESSON_DATA.topics;
[1, 2, 3, 4, 5, 6, 7, 8].forEach(id => ok(!!all.find(t => t.id === id), `topic ${id} still present`));
const t9 = all.find(t => t.id === 9);
ok(!!t9, 'topic 9 exists');
if (!t9) { console.log('missing lesson 9'); process.exit(1); }
eq('topic 9 appears exactly once', all.filter(t => t.id === 9).length, 1);
eq('topic 9 title', t9.title, 'Модальные конструкции');
ok(t9.isLocked === false && t9.isSubscriptionLocked === false, 'topic 9 ships unlocked');
ok(/Modal konstruksiyalar/.test(t9.description || ''), 'topic 9 description names the lesson');

const syll = w.B2_TOPICS;
eq('B2 syllabus still has 16 topics', syll.length, 16);
eq('syllabus and lesson agree on the topic 9 title', (syll.find(t => t.id === 9) || {}).title, t9.title);

const ids = all.map(t => t.id).sort((a, b) => a - b);
const frontier = ids[ids.length - 1];
ok(ids.join(',') === Array.from({ length: frontier }, (_, i) => i + 1).join(','),
    `authored lesson ids are contiguous 1..${frontier}`);
ok(frontier >= 9, `topic 9 is authored (frontier ${frontier})`);
/* FINAL-FRONTIER SAFE. While canonical topics remain unauthored, the one just
   past the authored range must have no payload so its coming-soon shell stays
   on screen. Once every canonical topic is authored there is no "next" topic
   at all, and demanding one would assert a phantom Topic 17. */
if (frontier < syll.length) {
    ok(!all.find(t => t.id === frontier + 1),
        `topic ${frontier + 1} has no lesson payload — it stays "coming soon"`);
} else {
    eq('the authored frontier is the canonical end of the course', frontier, syll.length);
    ok(!all.find(t => t.id === frontier + 1),
        `there is no topic ${frontier + 1} — B2 ends at ${syll.length}`);
}

/* ---------------------------------------------------------------- grammar */
const G = t9.grammar || '';
const gdoc = new JSDOM('<body><div id="g"></div></body>').window.document;
gdoc.getElementById('g').innerHTML = G;
const GT = gdoc.getElementById('g').textContent.replace(/\s+/g, ' ');

ok(G.length > 7000, `grammar is a full lesson (${G.length} chars)`);
ok(!/\$\{/.test(G), 'no template placeholder leaked');
for (let n = 1; n <= 7; n++) {
    ok(G.indexOf('<h4>' + n + '. ') !== -1, `grammar block ${n} is numbered`);
}
eq('7 numbered blocks + 1 summary heading', (G.match(/<h4/g) || []).length, 8);
ok(/b2g-check/.test(G), 'the summary uses the B2 check card');
ok(GT.indexOf('Qisqa xulosa') !== -1, 'the summary block is present');

[['пришлось model', 'Мне пришлось + infinitiv'],
 ['пришлось example', 'Мне пришлось отменить поездку.'],
 ['own-decision contrast', 'Я решил остаться дома.'],
 ['forced contrast', 'Мне пришлось остаться дома.'],
 ['удалось model', 'Мне удалось + infinitiv'],
 ['удалось example', 'Мне удалось решить эту проблему.'],
 ['удалось + наконец', 'Мне наконец удалось закончить проект.'],
 ['вынужден example', 'Я вынужден отказаться от этой работы.'],
 ['вынуждена example', 'Я вынуждена уйти.'],
 ['вынуждены example', 'Мы вынуждены изменить условия договора.'],
 ['придётся future', 'Мне придётся изменить план.'],
 ['смог', 'Я смог закончить работу.'],
 ['удалось despite', 'Мне удалось закончить работу, хотя было очень мало времени.'],
 ['из-за', 'Из-за пробок мне пришлось взять такси.'],
 ['из-за того, что', 'Мне пришлось отменить встречу из-за того, что я заболел.'],
 ['несмотря на', 'Несмотря на трудности, мне удалось закончить проект.'],
 ['несмотря на то, что', 'Несмотря на то, что времени было мало, нам удалось всё сделать.'],
 ['если', 'Если возникнут проблемы, нам придётся изменить план.'],
 ['добиться', 'добиться успеха'],
 ['B2 example', 'Из-за непредвиденных обстоятельств мне пришлось изменить маршрут.'],
 ['B2 example 2', 'Хотя задача казалась почти невыполнимой, ему всё-таки удалось найти решение.']
].forEach(([label, needle]) => ok(GT.indexOf(needle) !== -1, `grammar keeps: ${label}`));

/* --- SOURCE GAP: the past form of вынужден, which Ex5 #10, Ex6 #3/#7,
       Ex7 #10 and Ex9 all use --- */
['Я был вынужден изменить план.', 'Я была вынуждена изменить план.',
 'Мы были вынуждены изменить план.'
].forEach(s => ok(GT.indexOf(s) !== -1, `the past form is taught: «${s}»`));
['Я буду вынужден изменить план.', 'Я буду вынуждена изменить план.',
 'Мы будем вынуждены изменить план.'
].forEach(s => ok(GT.indexOf(s) !== -1, `the future form is taught: «${s}»`));

/* --- SOURCE FIX: «пришлось = past, вынужден = present» is incomplete. The real
       distinction is impersonal vs personal, and вынужден has all three tenses. --- */
{
    ['Вчера мне пришлось работать допоздна.',
     'Вчера я был вынужден работать допоздна.',
     'Сейчас я вынужден работать допоздна.',
     'Завтра мне придётся работать допоздна.'
    ].forEach(s => ok(GT.indexOf(s) !== -1,
        `the four-way tense/person contrast keeps «${s}»`));
    ok(/shaxssiz/.test(GT) && /shaxsli/.test(GT),
        'the grammar names the impersonal / personal distinction');
    ok(/faqat hozirgi zamon shakli emas/.test(GT),
        'the grammar states outright that «вынужден» is NOT present-tense-only');
    ok(/mutlaqo normal rus tili/.test(GT),
        'and that «Я был вынужден…» is perfectly normal Russian');
}

/* --- gender reminders the translation exercises depend on --- */
ok(/Я смогла/.test(GT), 'смогла is taught');
ok(/Я не смог \/ не смогла/.test(GT), 'the negative смочь forms are taught');
ok(/Мне не удалось/.test(GT), 'the negative удалось form is taught');

/* --- the connectors the exercises themselves use --- */
[['потому что', 'потому что'], ['поскольку', 'поскольку'],
 ['благодаря', 'благодаря'], ['хотя', 'хотя']
].forEach(([label, needle]) => ok(GT.indexOf(needle) !== -1,
    `the exercises' connector «${label}» is taught`));

{
    const tables = [...gdoc.querySelectorAll('table.b2g-t')];
    eq('grammar renders its 14 b2g-t tables', tables.length, 14);
    let wide = 0, headless = 0;
    tables.forEach(tb => {
        [...tb.querySelectorAll('tr')].forEach(tr => { if (tr.children.length !== 2) wide++; });
        if (!tb.querySelector('th')) headless++;
    });
    eq('every grammar table row has exactly 2 cells', wide, 0);
    eq('every grammar table has a header row', headless, 0);
}

/* -------------------------------------------------------------- exercises */
const ex = t9.exercises || [];
const byId = {};
ex.forEach(g => { byId[g.id] = g; });
const at = (id, i) => ((byId[id] && byId[id].items && byId[id].items[i]) || {});
/* Group-level accessors, for the same reason: a deleted group must produce
   failed assertions, not a crashed run. */
const grp = (id) => (byId[id] || {});
const items = (id) => ((byId[id] && byId[id].items) || []);

eq('10 exercise groups', ex.length, 10);
eq('group ids follow the B2 convention', ex.map(g => g.id).join(','),
    'ex1,ex2,ex3,ex4,ex5,ex6,ex7,ex8,ex9,ex10');
ok(ex.every(g => g.items.length === 10), 'every group carries 10 items');
eq('100 items in total', ex.reduce((a, g) => a + g.items.length, 0), 100);
eq('no builder group in this lesson', ex.filter(g => g.type === 'builder').length, 0);

/* ---- NO AUDIO. The source supplied none, so none may exist. ---- */
eq('topic 9 has NO audio group', ex.filter(g => g.audioSrc).length, 0);
ok(!ex.find(g => g.id === 'audio1'), 'there is no audio1 group');
ok(ex.every(g => g.style !== 'tf'), 'no true/false group was fabricated');
{
    const blob = JSON.stringify(t9);
    ok(blob.indexOf('.mp3') === -1, 'the lesson references no audio file at all');
    ok(blob.indexOf('%D0%912%209%20') === -1 && blob.indexOf('Б2 9 урок') === -1,
        'no «Б2 9 урок.mp3» path was invented');
    ok(blob.indexOf('Правда') === -1 && blob.indexOf('Ложь') === -1,
        'no true/false statements were fabricated');
    ok(!ex.some(g => g.passage), 'no transcript was fabricated');
}
ok(!fs.existsSync(path.join(ROOT, 'audios', 'Б2 9 урок.mp3')),
    'no Б2 9 урок.mp3 was created on disk');

const TITLES = {
    ex1: "1-mashq. To'g'ri konstruksiyani tanlang",
    ex2: "2-mashq. Fe'lni to'g'ri shaklda qo'ying",
    ex3: '3-mashq. Мне пришлось yoki Мне удалось?',
    ex4: '4-mashq. Мне пришлось / Мне придётся / вынужден(а/ы)',
    ex5: '5-mashq. Gapni davom ettiring',
    ex6: "6-mashq. Sababni qo'shing",
    ex7: '7-mashq. Xatoni toping va tuzating',
    ex8: "8-mashq. Dialogni to'ldiring",
    ex9: "9-mashq. O'zbekchadan rus tiliga tarjima qiling",
    ex10: "10-mashq. Ma'noni saqlagan holda gapni qayta tuzing"
};
Object.keys(TITLES).forEach(id => eq(`${id} title`, byId[id] && byId[id].title, TITLES[id]));

/* -------------------------------------------- openness, observed not assumed */
const NONSENSE = 'зззz яяяy ююю';
const isOpen = (it) => UI.matchItem(it, NONSENSE) === true;
const OPEN_GROUPS = ['ex5', 'ex6'];
const DET_GROUPS = ['ex1', 'ex2', 'ex3', 'ex4', 'ex7', 'ex8', 'ex9', 'ex10'];

let openCount = 0, detCount = 0, multi = 0, variants = 0;
let missing = 0, junk = 0, unmatched = 0;
let nonsenseAccepted = 0, blankAccepted = 0, oneWordAccepted = 0, openRefusedAttempt = 0;
let fakeKeyOnOpen = 0;

ex.forEach(g => g.items.forEach((it, i) => {
    const where = `${g.id} #${i + 1}`;
    if (isOpen(it)) {
        openCount++;
        if (!OPEN_GROUPS.includes(g.id)) { fail++; failures.push(`${where}: unexpectedly OPEN`); }
        if (it.free !== true) { fail++; failures.push(`${where}: open but not flagged free:true`); }
        if (it.answer !== null) fakeKeyOnOpen++;
        if (!UI.matchItem(it, 'это мой ответ')) openRefusedAttempt++;
        if (UI.matchItem(it, 'да')) oneWordAccepted++;
        if (UI.matchItem(it, '')) blankAccepted++;
    } else {
        detCount++;
        if (!DET_GROUPS.includes(g.id)) { fail++; failures.push(`${where}: unexpectedly deterministic`); }
        const acc = Array.isArray(it.answer) ? it.answer : [it.answer];
        variants += acc.length;
        if (acc.length > 1) multi++;
        if (!acc.length || acc.every(x => x == null || !String(x).trim())) missing++;
        if (/TODO|FIXME|placeholder|undefined|null/i.test(JSON.stringify(it.answer))) junk++;
        acc.forEach(x => { if (!UI.matchItem(it, x)) unmatched++; });
        if (UI.matchItem(it, NONSENSE)) nonsenseAccepted++;
        if (UI.matchItem(it, '')) blankAccepted++;
    }
}));

eq('20 genuinely open items', openCount, 20);
eq('80 deterministic items', detCount, 80);
eq('12 multi-accept items', multi, 12);
eq('every open item is answer:null — no invented key', fakeKeyOnOpen, 0);
eq('every open item accepts a real three-word attempt', openRefusedAttempt, 0);
eq('no open item accepts a one-word non-attempt', oneWordAccepted, 0);
eq('no deterministic item is missing its key', missing, 0);
eq('no TODO / placeholder / undefined / null in any key', junk, 0);
eq('the shared scorer accepts every accepted answer', unmatched, 0);
eq('no deterministic item accepts nonsense', nonsenseAccepted, 0);
eq('no item of any kind accepts a blank', blankAccepted, 0);

OPEN_GROUPS.forEach(id => eq(`${id} is open end to end`, items(id).filter(isOpen).length, 10));
DET_GROUPS.forEach(id => eq(`${id} is deterministic end to end`,
    items(id).filter(it => !isOpen(it)).length, 10));
eq('multi-accept sits exactly where the ambiguity is',
    ex.map(g => g.id + ':[' + g.items.map((it, i) =>
        (Array.isArray(it.answer) && it.answer.length > 1 ? i + 1 : 0)).filter(Boolean).join(',') + ']')
      .filter(s => !s.endsWith('[]')).join(' '),
    'ex1:[3,7] ex4:[2] ex7:[10] ex9:[1,3,5,6,8,9] ex10:[3,6]');

eq('all 100 prompts are distinct', new Set(ex.flatMap(g => g.items.map(i => i.q))).size, 100);

/* --------------------------------------------------- Ex1: gender not forced */
{
    const KEYS = [
        ['мне пришлось'], ['мне удалось'], ['я вынужден', 'я вынуждена'], ['мне придётся'],
        ['мне удалось'], ['нам пришлось'], ['вынужден', 'вынуждена'], ['удалось'],
        ['пришлось'], ['смогла']
    ];
    KEYS.forEach((a, i) => eq(`ex1 #${i + 1} key`,
        JSON.stringify(at('ex1', i).answer), JSON.stringify(a)));
    ok(/Из-за плохой погоды/.test(at('ex1', 0).q), 'ex1 #1 keeps the source situation');
    ok(/Несмотря на сильный стресс/.test(at('ex1', 9).q), 'ex1 #10 keeps the source situation');
    /* «я» does not reveal the learner's gender */
    ok(UI.matchItem(at('ex1', 2), 'я вынужден') && UI.matchItem(at('ex1', 2), 'я вынуждена'),
        'ex1 #3 accepts both genders');
    ok(!UI.matchItem(at('ex1', 2), 'мне удалось'), 'ex1 #3 refuses «мне удалось»');
    ok(UI.matchItem(at('ex1', 6), 'вынужден') && UI.matchItem(at('ex1', 6), 'вынуждена'),
        'ex1 #7 accepts both genders');
    ok(!UI.matchItem(at('ex1', 6), 'удалось'), 'ex1 #7 refuses «удалось»');
    ok(/вынуждена/.test(at('ex1', 2).q) && /вынуждена/.test(at('ex1', 6).q),
        'both gender forms are offered to the learner in the prompt');
}

/* ------------------------------------------------- Ex2: infinitive form drill */
{
    const KEYS = ['найти', 'перенести', 'отказаться', 'решить', 'обсудить',
                  'закончить', 'обратиться', 'договориться', 'изменить', 'принять'];
    KEYS.forEach((k, i) => eq(`ex2 #${i + 1} key`, at('ex2', i).answer, k));
    /* Russian infinitives end in -ть, -ти, -ться, -чь — «найти» and «перенести»
       are infinitives too, which a naive /ть$/ check would wrongly reject. */
    ok(KEYS.every(k => /(ться|тись|ть|ти|чь)$/.test(k)),
        'every ex2 key is an infinitive');
    ok(items('ex2').length === 10 && items('ex2').every(it => !Array.isArray(it.answer)),
        'ex2 has no multi-accept item');
    ok(/infinitiv shaklida/.test(grp('ex2').intro),
        'ex2 states that the verb stays in the infinitive after a modal construction');
}

/* ------------------------------------------------ Ex3: пришлось vs удалось */
{
    const KEYS = ['мне удалось', 'мне пришлось', 'мне удалось', 'мне пришлось', 'мне удалось',
                  'мне пришлось', 'мне удалось', 'мне пришлось', 'мне удалось', 'мне пришлось'];
    KEYS.forEach((k, i) => eq(`ex3 #${i + 1} key`, at('ex3', i).answer, k));
    eq('ex3 alternates success and obligation as the source situations demand',
        items('ex3').map(it => String(it.answer).split(' ')[1]).join(','),
        'удалось,пришлось,удалось,пришлось,удалось,пришлось,удалось,пришлось,удалось,пришлось');
}

/* -------------------------------- Ex4: time, person, number and gender */
{
    const KEYS = [['мне придётся'], ['вынужден', 'вынуждена'], ['пришлось'], ['придётся'],
                  ['вынужден'], ['пришлось'], ['придётся'], ['вынуждена'], ['пришлось'],
                  ['вынуждены']];
    KEYS.forEach((a, i) => eq(`ex4 #${i + 1} key`,
        JSON.stringify(at('ex4', i).answer), JSON.stringify(a)));
    /* SOURCE FIX: #8 and #10 carried no time marker, so «вынуждена/вынуждены»
       and «пришлось» were equally defensible readings. */
    ok(/сейчас/.test(at('ex4', 7).q),
        'ex4 #8 carries «сейчас», which makes the present personal form deterministic');
    ok(/сейчас/.test(at('ex4', 9).q),
        'ex4 #10 carries «сейчас», which makes «вынуждены» deterministic');
    ok(!UI.matchItem(at('ex4', 7), 'пришлось'), 'ex4 #8 no longer accepts «пришлось»');
    ok(!UI.matchItem(at('ex4', 9), 'пришлось'), 'ex4 #10 no longer accepts «пришлось»');
    /* the other eight items keep their source wording */
    ok(/Завтра у меня экзамен/.test(at('ex4', 0).q), 'ex4 #1 keeps the source wording');
    ok(/В прошлом месяце/.test(at('ex4', 5).q), 'ex4 #6 keeps the source wording');
    ok(/вынужден\(а\/ы\)/.test(grp('ex4').title),
        'the ex4 title covers all the gender/number forms its items require');
}

/* -------------------------------------------------- Ex5 / Ex6: open production */
{
    const EX5 = ['Мне пришлось…', 'Мне удалось…', 'Я вынужден…', 'Мне придётся…', 'Я смог…',
                 'Мне не удалось…', 'Несмотря на трудности, мне удалось…',
                 'Из-за непредвиденных обстоятельств мне пришлось…',
                 'Если ситуация не изменится, мне придётся…', 'Я был вынужден…'];
    EX5.forEach((s, i) => eq(`ex5 #${i + 1} keeps the source starter`, at('ex5', i).q, s));
    const EX6 = ['Мне пришлось отменить поездку.', 'Нам удалось закончить проект.',
                 'Я был вынужден изменить планы.', 'Ей удалось получить эту работу.',
                 'Нам пришлось вызвать врача.', 'Мне удалось решить проблему.',
                 'Он был вынужден переехать.', 'Нам пришлось перенести встречу.',
                 'Ей удалось сдать экзамен.', 'Я не смог закончить работу.'];
    EX6.forEach((s, i) => eq(`ex6 #${i + 1} keeps the source base sentence`, at('ex6', i).q, s));
    ok(items('ex5').length === 10 && items('ex5').every(it => it.free === true && it.answer === null),
        'every ex5 item is free:true with answer:null');
    ok(items('ex6').length === 10 && items('ex6').every(it => it.free === true && it.answer === null),
        'every ex6 item is free:true with answer:null');
    ok(/ochiq mashq/.test(grp('ex5').intro), 'ex5 tells the learner it is open');
    ok(/ochiq mashq/.test(grp('ex6').intro), 'ex6 tells the learner it is open');
    ok(/из-за/.test(grp('ex6').intro) && /потому что/.test(grp('ex6').intro)
       && /несмотря на то, что/.test(grp('ex6').intro),
        'ex6 names the three connectors the source asks for');
    [byId.ex5, byId.ex6].forEach(g => ok(g.items.every(it => it.placeholder),
        `${g.id}: every open item shows a writing placeholder`));
}

/* ------------------------------------------------------- Ex7: error correction */
{
    const KEYS = [
        ['Мне пришлось уйти раньше.'],
        ['Мне удалось решить эту проблему.'],
        ['Сейчас я вынужден отказаться от этого предложения.'],
        ['Нам пришлось изменить маршрут.'],
        ['Мне придётся сделать это завтра.'],
        ['Ей удалось получить хорошую работу.'],
        ['Я вынуждена отменить встречу.'],
        ['Нам удалось договориться.'],
        ['Мне пришлось обратиться к специалисту.'],
        ['Вчера он был вынужден изменить решение.',
         'Вчера он вынужден был изменить решение.']
    ];
    KEYS.forEach((a, i) => eq(`ex7 #${i + 1} accepted corrections`,
        JSON.stringify(at('ex7', i).answer), JSON.stringify(a)));
    /* SOURCE FIX #3: the original «Я вынужден был отказаться … сейчас» is NOT
       ungrammatical, so it could not serve an exercise that promises an error. */
    eq('ex7 #3 prompt is the genuinely broken sentence', at('ex7', 2).q,
        'Сейчас мне вынужден отказаться от этого предложения.');
    /* SOURCE FIX #10: the original stacked two modal predicates. */
    eq('ex7 #10 prompt is the missing-past-auxiliary error', at('ex7', 9).q,
        'Вчера он вынужден изменить решение.');
    ok(UI.matchItem(at('ex7', 9), 'Вчера он вынужден был изменить решение.'),
        'ex7 #10 accepts «вынужден был» — that word order is normal Russian');
    /* the lesson must never teach that «вынужден был» is impossible */
    ok(GT.indexOf('вынужден был') === -1 || !/вынужден был.{0,40}(noto‘g‘ri|xato)/.test(GT),
        'the grammar never calls «вынужден был» incorrect');
    ok(/Birinchi modal ma'noni saqlang/.test(grp('ex7').intro),
        'ex7 states the keep-the-first-construction rule, which keeps #4/#7/#8/#9 deterministic');
    let same = 0;
    items('ex7').forEach(it => { if ((it.answer || []).indexOf(String(it.q).trim()) !== -1) same++; });
    eq('every ex7 prompt really differs from its correction', same, 0);
}

/* ------------------------------------------------------ Ex8: dialogue completion */
{
    const KEYS = ['Мне пришлось отменить поездку', 'мне удалось', 'вынуждены', 'придётся',
                  'удалось', 'вынуждена', 'удалось', 'пришлось', 'придётся', 'смог'];
    KEYS.forEach((k, i) => eq(`ex8 #${i + 1} key`, at('ex8', i).answer, k));
    ok(items('ex8').length === 10 && items('ex8').every(it => /^—/.test(it.q) && it.q.indexOf('\n—') !== -1),
        'every ex8 item is a two-line dialogue');
    /* #10 ends in «сам», which fixes masculine agreement */
    ok(/сам\.$/.test(at('ex8', 9).q), 'ex8 #10 ends in «сам»');
    ok(UI.matchItem(at('ex8', 9), 'смог'), 'ex8 #10 accepts «смог»');
    ok(!UI.matchItem(at('ex8', 9), 'смогла'),
        'ex8 #10 refuses «смогла» — «сам» already fixes the agreement');
}

/* ---------------------------------------------------------- Ex9: translation */
{
    const KEYS = [
        ['Men kecha uyda qolishga majbur bo‘ldim.',
         ['Вчера мне пришлось остаться дома.', 'Мне пришлось остаться дома вчера.',
          'Вчера я был вынужден остаться дома.', 'Вчера я была вынуждена остаться дома.']],
        ['Men bu muammoni hal qilishga muvaffaq bo‘ldim.', ['Мне удалось решить эту проблему.']],
        ['Men bu qarorni o‘zgartirishga majburman.',
         ['Я вынужден изменить это решение.', 'Я вынуждена изменить это решение.']],
        ['Ertaga biz ertaroq kelishga majbur bo‘lamiz.', ['Завтра нам придётся прийти раньше.']],
        ['U qiyin vazifani bajarishga muvaffaq bo‘ldi.',
         ['Ему удалось выполнить сложную задачу.', 'Ей удалось выполнить сложную задачу.']],
        ['Biz safarni bekor qilishga majbur bo‘ldik.',
         ['Нам пришлось отменить поездку.', 'Мы были вынуждены отменить поездку.']],
        ['Men barcha hujjatlarni topishga muvaffaq bo‘ldim.', ['Мне удалось найти все документы.']],
        ['U boshqa shaharga ko‘chishga majbur bo‘ldi.',
         ['Ему пришлось переехать в другой город.', 'Ей пришлось переехать в другой город.',
          'Он был вынужден переехать в другой город.',
          'Она была вынуждена переехать в другой город.']],
        ['Men bu ishni o‘zim bajara oldim.',
         ['Я смог выполнить эту работу самостоятельно.',
          'Я смогла выполнить эту работу самостоятельно.',
          'Я смог выполнить эту работу сам.', 'Я смогла выполнить эту работу сама.']],
        ['Vaqt kam bo‘lishiga qaramay, biz loyihani tugatishga muvaffaq bo‘ldik.',
         ['Несмотря на то что времени было мало, нам удалось закончить проект.']]
    ];
    KEYS.forEach(([q, a], i) => {
        eq(`ex9 #${i + 1} prompt`, at('ex9', i).q, q);
        eq(`ex9 #${i + 1} accepted translations`,
            JSON.stringify(at('ex9', i).answer), JSON.stringify(a));
    });
    /* the variants exist because Uzbek does not mark the distinctions Russian does */
    ok(/Jins ko'rsatilmagan/.test(grp('ex9').intro),
        'ex9 tells the learner where more than one translation is correct');
}

/* --------------------------------------------- Ex10: NEW, controlled paraphrase */
{
    ok(!!byId.ex10, 'ex10 exists — the source stopped at nine exercises');
    const e10 = (byId.ex10 && byId.ex10.items) || [];
    eq('ex10 has 10 items', e10.length, 10);
    eq('ex10 is fully deterministic', e10.filter(isOpen).length, 0);
    ok(e10.length > 0 && e10.every(it => it.free !== true), 'no ex10 item is flagged free');
    const KEYS = [
        ['пришлось', ['Из-за отмены рейса нам пришлось остаться ещё на одну ночь.']],
        ['удалось', ['Несмотря на трудности, нам удалось закончить проект вовремя.']],
        ['вынужден / вынуждена', ['Сейчас я вынужден отказаться от предложения.',
                                  'Сейчас я вынуждена отказаться от предложения.']],
        ['придётся', ['Завтра нам придётся изменить маршрут.']],
        ['удалось', ['После нескольких попыток ему удалось дозвониться до клиента.']],
        ['не удалось', ['Мне не удалось найти документы, несмотря на долгие поиски.',
                        'Несмотря на долгие поиски, мне не удалось найти документы.']],
        ['пришлось', ['Из-за срочного звонка ей пришлось уйти раньше.']],
        ['вынуждены', ['Сейчас мы вынуждены ждать.']],
        ['удалось', ['Несмотря на нехватку времени, мне удалось подготовить презентацию.']],
        ['придётся', ['Если проблема повторится, нам придётся искать другой вариант.']]
    ];
    KEYS.forEach(([target, a], i) => {
        const it = at('ex10', i);
        ok(String(it.q).indexOf('Используйте: ' + target) !== -1,
            `ex10 #${i + 1} names the target construction «${target}»`);
        eq(`ex10 #${i + 1} accepted paraphrases`, JSON.stringify(it.answer), JSON.stringify(a));
        ok(Array.isArray(it.answer)
            && it.answer.every(s => s.indexOf(target.split(' / ')[0]) !== -1),
            `ex10 #${i + 1} every accepted answer really uses «${target.split(' / ')[0]}»`);
    });
    eq('ex10 accepts a variant only on #3 (gender) and #6 (clause order)',
        e10.map((it, i) => ((it.answer || []).length > 1 ? i + 1 : 0)).filter(Boolean).join(','),
        '3,6');
    /* the paraphrase must actually differ from the prompt */
    let same = 0;
    e10.forEach(it => {
        const src = String(it.q).split('\n')[0].trim();
        if ((it.answer || []).indexOf(src) !== -1) same++;
    });
    eq('every ex10 answer differs from the sentence it rewrites', same, 0);
}

/* ----------------------------------------------------------------- format */
ok(ex.every(g => g.showTask === true), 'every group opts into the task block');
ok(ex.every(g => !g.howTo), 'no group carries a "Как выполнять" briefing');
ok(ex.every(g => typeof g.intro === 'string' && g.intro.length > 20),
    'every group states its task in Uzbek (10 instructions)');
eq('all 10 groups carry their Namuna', ex.filter(g => g.namuna).length, 10);

ex.forEach(g => {
    const d = w.document.createElement('div');
    d.innerHTML = UI.renderGroup(g);
    ok(!!d.querySelector('.b2h-howto-t'), `${g.id}: exercise name rendered`);
    ok(!!d.querySelector('.b2h-howto-task'), `${g.id}: Uzbek task rendered`);
    ok(!d.querySelector('.b2h-howto-h'), `${g.id}: no "Как выполнять" heading`);
    eq(`${g.id}: all items rendered`, d.querySelectorAll('.b2h-item').length, g.items.length);
    eq(`${g.id}: every item gets a writing input`,
        d.querySelectorAll('input.b2h-input').length, g.items.length);
    ok(!d.querySelector('audio'), `${g.id}: no audio player rendered`);
    if (g.namuna) ok(/Namuna:/.test(d.textContent), `${g.id}: Namuna rendered`);
});
/* the multi-line prompts of Ex8 and Ex10 must render as line breaks */
{
    const d = w.document.createElement('div');
    d.innerHTML = UI.renderGroup(grp('ex8'));
    ok(d.querySelectorAll('.b2h-text br').length >= 10,
        'ex8 dialogues render their line break');
}

/* ------------------------------------------------- vocabulary (paid only) */
{
    const s = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-vocabulary.html'), 'utf8');
    const i9 = s.indexOf('                    id: 9,');
    ok(i9 > -1, 'paid vocabulary has topic 9');
    const i10 = s.indexOf('                    id: 10,', i9);
    const seg = s.slice(s.lastIndexOf('{', i9),
        i10 > -1 ? s.lastIndexOf('{', i10) : s.indexOf('generateLockedTopics('));
    const cards = [...seg.matchAll(/\{ ru: "([^"]+)", uz: "([^"]+)" \}/g)].map(m => [m[1], m[2]]);
    const card = (i) => (cards[i] || [])[0];
    eq('paid vocabulary topic 9 has all 80 cards', cards.length, 80);
    ok(/name: "Модальные конструкции"/.test(seg), 'paid vocabulary topic 9 is this lesson');
    ok(/isLocked: false/.test(seg), 'paid vocabulary topic 9 is unlocked');
    eq('80 unique Russian units', new Set(cards.map(c => c[0])).size, 80);
    eq('no duplicate card', new Set(cards.map(c => c.join('|'))).size, 80);
    eq('first card', card(0), 'приходиться — прийтись');
    eq('last card', card(79), 'заранее');

    /* the deck must actually serve THIS lesson's constructions */
    ['мне пришлось', 'мне придётся', 'быть вынужденным', 'был вынужден', 'мне удалось',
     'не удалось', 'смочь', 'удаться', 'приходиться — прийтись'
    ].forEach(u => ok(cards.some(c => c[0] === u),
        `the deck teaches the core construction «${u}»`));
    /* and the connectors the exercises use */
    ['из-за', 'из-за того, что', 'потому что', 'несмотря на', 'несмотря на то, что',
     'благодаря', 'хотя', 'если', 'поскольку'
    ].forEach(u => ok(cards.some(c => c[0] === u), `the deck teaches the connector «${u}»`));
    /* distinct units that must NOT be collapsed */
    [['закончить проект', 'завершить проект'], ['из-за', 'из-за того, что'],
     ['несмотря на', 'несмотря на то, что'], ['решить проблему', 'найти решение']
    ].forEach(([a, b]) => ok(cards.some(c => c[0] === a) && cards.some(c => c[0] === b),
        `«${a}» and «${b}» both ship — they serve different learner functions`));

    const authored = [...s.matchAll(/\n                    id: (\d+),/g)].map(m => Number(m[1]));
    const vFrontier = Math.max.apply(null, authored);
    ok(authored.indexOf(9) !== -1 && vFrontier >= 9,
        'topic 9 is an authored (unlocked) vocabulary deck');
    /* FINAL-FRONTIER SAFE. While canonical decks remain unauthored they are
       generated from the next id. Once every canonical deck is real the spread
       is removed entirely — demanding generateLockedTopics(N+1) then would
       assert a phantom Topic 17. */
    const _genSpread = s.indexOf('...generateLockedTopics(') !== -1;
    if (_genSpread) {
        ok(new RegExp('generateLockedTopics\\(' + (vFrontier + 1) + '\\)').test(s),
            `locked vocabulary topics start right after the last authored deck (${vFrontier + 1})`);
    } else {
        ok(!new RegExp('generateLockedTopics\\(' + (vFrontier + 1) + '\\)').test(s),
            'the paid deck list is complete — no future deck is generated');
        ok(s.split('...generateLockedTopics(').length - 1 === 0,
            'no generated future deck remains in the paid deck list');
    }
    ok(!/generateLockedTopics\(9\)/.test(s), 'no stale generateLockedTopics(9) remains');
    ok(/Глаголы движения с приставками/.test(s) && /Вид глагола/.test(s),
        'paid vocabulary topics 7-8 intact');

    const demo = fs.readFileSync(path.join(ROOT, 'b2-demo-vocabulary.html'), 'utf8');
    ok(!/                    id: 9,/.test(demo), 'demo vocabulary untouched (no topic 9)');
    ok(!/Модальные конструкции/.test(demo), 'topic 9 did not leak into the demo vocabulary');
    ok(/generateLockedTopics\(4\)/.test(demo), 'demo still locks from topic 4');
}

/* --------------------------------------- runtime frontier: paid vs demo */
{
    const c = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-course.html'), 'utf8');
    const mainScript = (html) => {
        const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
        let m, best = '';
        while ((m = re.exec(html))) {
            if (/\bsrc=/.test(m[1])) continue;
            if (m[2].length > best.length) best = m[2];
        }
        return best;
    };
    const S = mainScript(c);
    const grab = (name) => {
        const i = S.indexOf('function ' + name);
        let d = 0, j = S.indexOf('{', i), e = -1;
        for (let k = j; k < S.length; k++) {
            if (S[k] === '{') d++;
            else if (S[k] === '}') { d--; if (d === 0) { e = k; break; } }
        }
        return S.slice(i, e + 1);
    };
    ['b2SoonHtml', 'b2ExerciseData', 'buildB2Topics'].forEach(n => w.eval(grab(n)));
    UI.injectStyles();

    ['paid', 'demo'].forEach((mode) => {
        w.eval('var B2_DEMO_MODE = ' + (mode === 'demo') + ';');
        const list = w.eval('buildB2Topics()');
        eq(`${mode}: the course still renders 16 topics`, list.length, 16);
        const t = list.find(x => x.id === 9);
        const soonId = frontier + 1;
        const next = list.find(x => x.id === soonId);
        ok(t.grammar.length > 7000, `${mode}: topic 9 carries the real grammar`);
        ok(!t.content, `${mode}: topic 9 is a real lesson, not a coming-soon shell`);
        eq(`${mode}: topic 9 serves 10 exercise groups`,
            (w.eval('b2ExerciseData(9)') || { exercises: [] }).exercises.length, 10);
        if (soonId <= list.length) {
            ok(!!next, `${mode}: topic ${soonId} is listed`);
            eq(`${mode}: topic ${soonId} has no lesson payload`,
                w.eval('b2ExerciseData(' + soonId + ')'), null);
            eq(`${mode}: topic ${soonId} grammar is empty`, (next || {}).grammar, '');
            ok(!!(next || {}).content, `${mode}: topic ${soonId} still renders the coming-soon card`);
        } else {
            /* every canonical topic is authored: the course has no next topic */
            eq(`${mode}: the authored frontier reached the canonical end`, frontier, list.length);
            ok(!next, `${mode}: there is no topic ${soonId} — the course ends at ${list.length}`);
            eq(`${mode}: no canonical topic is left as a coming-soon shell`,
                list.filter((x) => x.content).length, 0);
        }
        if (mode === 'paid') {
            ok(t.isLocked === false, 'paid: topic 9 is available');
        } else {
            ok(t.isLocked === true, 'demo: topic 9 stays behind the paywall');
            /* only assert the next topic's lock state while a next topic exists */
            if (next) ok(next.isLocked === true, `demo: topic ${soonId} stays locked too`);
            else ok(list.every((x) => x.id <= 3 || x.isLocked === true),
                'demo: every topic beyond the free three stays locked');
        }
    });
    ok(/var locked = B2_DEMO_MODE && t\.id > 3;/.test(c),
        'the demo paywall rule is untouched by this lesson');
    ok(/function b2ExerciseData/.test(c),
        'the course still discovers lessons through b2ExerciseData — no parallel engine');
    const near = c.slice(c.indexOf('function buildB2Topics'), c.indexOf('function buildB2Topics') + 3000);
    ok(!/finalExam|certificate/i.test(near), 'no B2 final exam or certificate was added');
}

/* ------------------------------------------------------------------ report */
console.log('='.repeat(60));
if (fail === 0) {
    console.log(`  ✅ B2 TOPIC 9: ${pass}/${pass} passed`
        + `  (open ${openCount} · deterministic ${detCount} · multi ${multi}`
        + ` · accepted variants ${variants} · audio groups 0)`);
} else {
    console.log(`  ❌ B2 TOPIC 9: ${fail} failed / ${pass + fail}\n`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
}
console.log('='.repeat(60) + '\n');
process.exit(fail === 0 ? 0 : 1);
