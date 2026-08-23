#!/usr/bin/env node
/**
 * verify_b2_topic7.cjs — B2 Lesson 7 «Вид глагола» (СВ / НСВ).
 *
 * Two things make this lesson different from Topics 1-6 and drive most of the
 * suite:
 *
 *  1. FORTY of its 110 items are genuinely OPEN. The source's Ex5/6/7/10 are
 *     sentence-production tasks with many correct answers; inventing one key
 *     would mark correct Russian wrong. Openness is not re-implemented here —
 *     it is OBSERVED through the product's own matchItem(), which applies
 *     isOpenItem() before any comparison.
 *
 *  2. «Я» is either gender, so Ex1, Ex4, Ex8 and Ex9 carry deliberate
 *     masculine/feminine pairs — 34 multi-accept items. Ex9's two verbs both
 *     belong to «я», so a MIXED-gender sentence must be refused; that is
 *     checked by building the mixed forms and running the real scorer.
 *
 * Grammar assertions read the RENDERED TEXT, not raw HTML: the lesson colours
 * СВ/НСВ with .b2g-tone-* spans, which split sentences mid-string. Matching raw
 * markup would fail on correct content and push an author into stripping the
 * spans to satisfy a bad test.
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

/* injectStyles() feeds the product's real stylesheet to jsdom's CSS parser,
   which cannot parse some modern rules and logs about it. That is a jsdom
   limitation, not a product fault, so the noise is muted — errors that matter
   surface as failed assertions. */
const vc = new VirtualConsole();
vc.on('jsdomError', () => {});
const w = new JSDOM('<body></body>', { runScripts: 'outside-only', virtualConsole: vc }).window;
['shared-normalizer.js', 'sentence-builder.js', 'course-exercise-ui.js',
 'b2-topics.js', 'b2-lesson-data.js'].forEach(f =>
    w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const UI = w.UzExerciseUI;

console.log('\n=== B2 TOPIC 7 — Вид глагола (СВ / НСВ) ===');

/* ------------------------------------------------------------ data presence */
const all = w.B2_LESSON_DATA.topics;
[1, 2, 3, 4, 5, 6].forEach(id => ok(!!all.find(t => t.id === id), `topic ${id} still present`));
const t7 = all.find(t => t.id === 7);
ok(!!t7, 'topic 7 exists');
if (!t7) { console.log('missing lesson 7'); process.exit(1); }
eq('topic 7 appears exactly once', all.filter(t => t.id === 7).length, 1);
eq('topic 7 title', t7.title, 'Вид глагола');
ok(t7.isLocked === false && t7.isSubscriptionLocked === false, 'topic 7 ships unlocked');
ok(/СВ \/ НСВ/.test(t7.description || ''), 'topic 7 description names the aspect pair');

const syll = w.B2_TOPICS;
eq('B2 syllabus still has 16 topics', syll.length, 16);
eq('syllabus and lesson agree on the topic 7 title', (syll.find(t => t.id === 7) || {}).title, t7.title);

/* the authored range is contiguous, and the first unauthored topic has no
   lesson payload — that is what keeps its coming-soon shell on screen */
const ids = all.map(t => t.id).sort((a, b) => a - b);
const frontier = ids[ids.length - 1];
ok(ids.join(',') === Array.from({ length: frontier }, (_, i) => i + 1).join(','),
    `authored lesson ids are contiguous 1..${frontier}`);
ok(frontier >= 7, `topic 7 is authored (frontier ${frontier})`);
ok(!all.find(t => t.id === frontier + 1),
    `topic ${frontier + 1} has no lesson payload — it stays "coming soon"`);

/* ---------------------------------------------------------------- grammar */
const G = t7.grammar || '';
const gdoc = new JSDOM('<body><div id="g"></div></body>').window.document;
gdoc.getElementById('g').innerHTML = G;
/* the learner-visible text, with the aspect-colour spans flattened */
const GT = gdoc.getElementById('g').textContent.replace(/\s+/g, ' ');

ok(G.length > 12000, `grammar is a full lesson (${G.length} chars)`);
ok(!/\$\{/.test(G), 'no template placeholder leaked');

for (let n = 1; n <= 14; n++) {
    ok(G.indexOf('<h4>' + n + '. ') !== -1, `grammar block ${n} is numbered`);
}
eq('14 numbered blocks + 1 summary heading', (G.match(/<h4/g) || []).length, 15);
ok(/b2g-check/.test(G), 'the summary uses the B2 check card');
ok(GT.indexOf('Asosiy konstruksiyalar') !== -1, 'summary block present');

[['НСВ definition', 'harakatning jarayoni, davomiyligi, odati yoki takrorlanishi'],
 ['СВ definition', 'harakatning tugallangani, natijaga erishilgani'],
 ['НСВ questions', 'Что делать? · Что делал? · Что буду делать?'],
 ['СВ questions', 'Что сделать? · Что сделал? · Что сделаю?'],
 ['aspect pairs', 'читать → прочитать'],
 ['process example', 'Я читал книгу весь вечер.'],
 ['result example', 'Я прочитал книгу.'],
 ['уже + experience', 'Я уже читал эту книгу.'],
 ['уже + result', 'Я уже прочитал эту книгу.'],
 ['Я обычно + НСВ', 'Я обычно читаю перед сном.'],
 ['успел + СВ', 'Я успел закончить работу.'],
 ['negative успеть', 'Я не успел сделать домашнее задание.'],
 ['experience with НСВ', 'Я когда-то работал в другой компании.'],
 ['counted achievements with СВ', 'Я посетил пять стран.'],
 ['когда — simultaneous', 'Когда я готовил ужин, муж смотрел телевизор.'],
 ['когда — sequential', 'Когда я приготовил ужин, мы поужинали.'],
 ['пока + НСВ, НСВ', 'Пока я готовил, дети играли.'],
 ['наконец + СВ', 'Я наконец закончил работу.'],
 ['repeated process', 'Я часто путал эти слова.'],
 ['counted repetitions', 'Я три раза прочитал эту статью.'],
 ['долго + НСВ', 'Я долго читал книгу.'],
 ['Сколько времени? question', 'Сколько времени ты писал письмо?'],
 ['За сколько времени? question', 'За сколько времени ты написал письмо?'],
 ['вчера — process', 'Вчера я читал книгу.'],
 ['вчера — result', 'Вчера я прочитал книгу.'],
 ['aspect pairs are not equal', 'читал ≠ прочитал']
].forEach(([label, needle]) => ok(GT.indexOf(needle) !== -1, `grammar keeps: ${label}`));

/* --- SOURCE FIX 1: signal words are contextual, not automatic switches --- */
ok(GT.indexOf('Слова, которые часто встречаются в контексте результата') !== -1,
    'the result-word list is headed as CONTEXT, not as a rule');
ok(/avtomatik qoida emas/.test(GT),
    'the grammar states outright that these words are not an automatic rule');
ok(/vidni .{0,40}ma’no.{0,20}tanlaydi/.test(GT) || /vidni <b>ma’no<\/b> tanlaydi/.test(G),
    'and that MEANING selects the aspect');
ok(GT.indexOf('Men bu kitobni avval o‘qiganman') !== -1,
    'the «уже + НСВ» counterexample is explained, not just listed');
ok(GT.indexOf('«одназды»') === -1, 'no misspelling of однажды');
ok(/«однажды» yoki «сразу» ham vidni majburan belgilamaydi/.test(GT),
    'однажды and сразу are explicitly NOT automatic perfective markers');

/* --- SOURCE FIX 2: успеть — target model, not a universal ban --- */
const uspet = GT.slice(GT.indexOf('Qaysi infinitiv?'), GT.indexOf('6. Tajriba'));
ok(uspet.length > 100, 'the успеть nuance card is present');
ok(/tugallangan \(СВ\) infinitiv/.test(uspet), 'успеть teaches the perfective infinitive as the model');
ok(/umumiy taqiqi emas/.test(uspet),
    'and says explicitly that this is NOT a universal Russian prohibition');
ok(GT.indexOf('успел делать — bu ma’noda odatda noto‘g‘ri') === -1,
    'the source\'s over-categorical «успел делать is wrong» claim is gone');

/* --- SOURCE FIX 3: долго --- */
ok(GT.indexOf('Он долго думал и наконец решил проблему.') !== -1,
    'the corrected долго model is taught (process НСВ → result СВ)');
ok(GT.indexOf('Я долго пытался решить проблему и наконец решил её.') !== -1,
    'the second corrected долго model is taught');
['Я долго написал письмо', 'Я долго прочитал книгу'].forEach(bad =>
    ok(GT.indexOf(bad) === -1, `the grammar never teaches «${bad}»`));
ok(/за два часа/.test(GT) && /Я написал письмо за два часа/.test(GT),
    'measured-period + СВ is offered as the way to express time-to-result');

/* --- the decision checklist stays hedged --- */
const formula = GT.slice(GT.indexOf('14. Vidni tanlashning'), GT.indexOf('Asosiy konstruksiyalar'));
ok((formula.match(/ko‘pincha/g) || []).length >= 5,
    'the decision checklist hedges with «ko‘pincha» rather than stating hard rules');
ok(/вид выбирается прежде всего по смыслу/.test(GT),
    'the summary closes on meaning-before-signal-words');

/* every grammar table is the 2-column shape the B2 layout expects */
{
    const tables = [...gdoc.querySelectorAll('table.b2g-t')];
    eq('grammar renders its 27 b2g-t tables', tables.length, 27);
    let wide = 0, headless = 0;
    tables.forEach(tb => {
        [...tb.querySelectorAll('tr')].forEach(tr => { if (tr.children.length !== 2) wide++; });
        if (!tb.querySelector('th')) headless++;
    });
    eq('every grammar table row has exactly 2 cells', wide, 0);
    eq('every grammar table has a header row', headless, 0);
}

/* -------------------------------------------------------------- exercises */
const ex = t7.exercises || [];
const byId = {};
ex.forEach(g => { byId[g.id] = g; });
eq('11 exercise groups', ex.length, 11);
eq('group ids follow the B2 convention', ex.map(g => g.id).join(','),
    'ex1,ex2,ex3,ex4,ex5,ex6,ex7,ex8,ex9,ex10,audio1');
ok(ex.every(g => g.items.length === 10), 'every group carries 10 items');
eq('110 items in total', ex.reduce((a, g) => a + g.items.length, 0), 110);
eq('10 main groups', ex.filter(g => !g.audioSrc).length, 10);
eq('1 audio group', ex.filter(g => g.audioSrc).length, 1);
eq('no builder group in this lesson', ex.filter(g => g.type === 'builder').length, 0);

const TITLES = {
    ex1: '1-mashq. «Я уже…» + СВ',
    ex2: '2-mashq. «Я обычно…» + НСВ',
    ex3: '3-mashq. «Я успел…» + СВ',
    ex4: '4-mashq. «Я раньше…» + НСВ',
    ex5: '5-mashq. «Я обычно…» ↔ «Я уже…»',
    ex6: '6-mashq. «Я обычно…, но сегодня уже…»',
    ex7: '7-mashq. «Я долго…, но наконец…»',
    ex8: '8-mashq. Пока + НСВ, НСВ',
    ex9: '9-mashq. Когда + СВ, СВ',
    ex10: '10-mashq. Tajriba va natija',
    audio1: "Audio bo'yicha «Rost yoki yolg'on» mashqi"
};
Object.keys(TITLES).forEach(id => eq(`${id} title`, byId[id] && byId[id].title, TITLES[id]));

/* -------------------------------------------- openness, observed not assumed */
const NONSENSE = 'зззz яяяy ююю';          // three words, no meaning
const isOpen = (it) => UI.matchItem(it, NONSENSE) === true;

/* Safe accessor for the pinned-content blocks below. If an item was deleted,
   every assertion about it fails with a readable message instead of the whole
   suite dying on `undefined.q`. */
const at = (id, i) => ((byId[id] && byId[id].items && byId[id].items[i]) || {});

const OPEN_GROUPS = ['ex5', 'ex6', 'ex7', 'ex10'];
const DET_GROUPS = ['ex1', 'ex2', 'ex3', 'ex4', 'ex8', 'ex9', 'audio1'];
let openCount = 0, detCount = 0, multi = 0, variants = 0;
let missing = 0, junk = 0, badOpt = 0, unmatched = 0;
let nonsenseAccepted = 0, blankAccepted = 0, oneWordAccepted = 0, openRefusedAttempt = 0;
let fakeKeyOnOpen = 0;

ex.forEach(g => g.items.forEach((it, i) => {
    const where = `${g.id} #${i + 1}`;
    const open = isOpen(it);
    if (open) {
        openCount++;
        if (!OPEN_GROUPS.includes(g.id)) { fail++; failures.push(`${where}: unexpectedly OPEN`); }
        if (it.free !== true) { fail++; failures.push(`${where}: open but not flagged free:true`); }
        if (it.answer !== null) fakeKeyOnOpen++;
        if (!UI.matchItem(it, 'это моя попытка')) openRefusedAttempt++;
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
        if (Array.isArray(it.options) && !acc.some(x => it.options.indexOf(x) !== -1)) badOpt++;
        acc.forEach(x => { if (!UI.matchItem(it, x)) unmatched++; });
        if (UI.matchItem(it, NONSENSE)) nonsenseAccepted++;
        if (UI.matchItem(it, '')) blankAccepted++;
    }
}));

eq('40 genuinely open items', openCount, 40);
eq('70 deterministic items', detCount, 70);
eq('34 multi-accept items', multi, 34);
eq('every open item is answer:null — no invented key', fakeKeyOnOpen, 0);
eq('every open item accepts a real three-word attempt', openRefusedAttempt, 0);
eq('no open item accepts a one-word non-attempt', oneWordAccepted, 0);
eq('no deterministic item is missing its key', missing, 0);
eq('no TODO / placeholder / undefined / null in any key', junk, 0);
eq('every choice answer is among its options', badOpt, 0);
eq('the shared scorer accepts every accepted answer', unmatched, 0);
eq('no deterministic item accepts nonsense', nonsenseAccepted, 0);
eq('no item of any kind accepts a blank', blankAccepted, 0);

OPEN_GROUPS.forEach(id => eq(`${id} is open end to end`,
    byId[id].items.filter(isOpen).length, 10));
DET_GROUPS.forEach(id => eq(`${id} is deterministic end to end`,
    byId[id].items.filter(it => !isOpen(it)).length, 10));

const prompts = ex.flatMap(g => g.items.map(i => i.q));
eq('all 110 prompts are distinct', new Set(prompts).size, 110);
ok(prompts.every(q => typeof q === 'string' && q.trim()), 'every item has a prompt');

/* ------------------------------------------------------- Ex1: both genders */
{
    const KEYS = [
        ['Я уже ________ домашнее задание. (сделать)', 'сделал', 'сделала'],
        ['Я уже ________ это письмо. (написать)', 'написал', 'написала'],
        ['Я уже ________ этот фильм. (посмотреть)', 'посмотрел', 'посмотрела'],
        ['Я уже ________ все необходимые документы. (подготовить)', 'подготовил', 'подготовила'],
        ['Я уже ________ билеты на поезд. (купить)', 'купил', 'купила'],
        ['Я уже ________ эту проблему. (решить)', 'решил', 'решила'],
        ['Я уже ________ все новые слова. (выучить)', 'выучил', 'выучила'],
        ['Я уже ________ своему преподавателю. (позвонить)', 'позвонил', 'позвонила'],
        ['Я уже ________ комнату. (убрать)', 'убрал', 'убрала'],
        ['Я уже ________ все вопросы. (обсудить)', 'обсудил', 'обсудила']
    ];
    KEYS.forEach(([q, m, f], i) => {
        const it = at('ex1', i);
        eq(`ex1 #${i + 1} prompt`, it.q, q);
        eq(`ex1 #${i + 1} accepts exactly [masculine, feminine]`,
            JSON.stringify(it.answer), JSON.stringify([m, f]));
        ok(it.q !== undefined && UI.matchItem(it, m) && UI.matchItem(it, f),
            `ex1 #${i + 1}: the real scorer accepts both genders`);
    });
    ok(byId.ex1.items.every(it => it.free !== true), 'no ex1 item is open');
}

/* --------------------------------------------------- Ex2: present tense, 1sg */
{
    const KEYS = ['встаю', 'завтракаю', 'читаю', 'езжу', 'делаю',
                  'повторяю', 'смотрю', 'планирую', 'встречаюсь', 'готовлюсь'];
    KEYS.forEach((k, i) => eq(`ex2 #${i + 1} key`, at('ex2', i).answer, k));
    ok(byId.ex2.items.every(it => !Array.isArray(it.answer)),
        'ex2 keys are single forms — no gender question in the present tense');
}

/* ------------------------------------------------------- Ex3: infinitives */
{
    const KEYS = ['сделать', 'написать', 'купить', 'подготовиться', 'обсудить',
                  'позвонить', 'закончить', 'забронировать', 'проверить', 'вернуться'];
    KEYS.forEach((k, i) => eq(`ex3 #${i + 1} key`, at('ex3', i).answer, k));
    ok(KEYS.every(k => /(ть|ться|чь)$/.test(k)),
        'every ex3 key is still an INFINITIVE, not a past tense');
    let pastAccepted = 0;
    byId.ex3.items.forEach(it => {
        const inf = String(it.answer);
        const past = inf.replace(/ться$/, 'лся').replace(/ть$/, 'л');
        if (past !== inf && UI.matchItem(it, past)) pastAccepted++;
    });
    eq('no ex3 item accepts a past-tense form after «успел»', pastAccepted, 0);
}

/* ------------------------------------------------------- Ex4: both genders */
{
    const KEYS = [
        ['занимался', 'занималась'], ['ездил', 'ездила'], ['читал', 'читала'],
        ['встречался', 'встречалась'], ['изучал', 'изучала'], ['путал', 'путала'],
        ['работал', 'работала'], ['пил', 'пила'], ['ложился', 'ложилась'],
        ['занимался', 'занималась']
    ];
    KEYS.forEach(([m, f], i) => {
        const it = at('ex4', i);
        eq(`ex4 #${i + 1} accepts exactly [masculine, feminine]`,
            JSON.stringify(it.answer), JSON.stringify([m, f]));
        ok(it.q !== undefined && UI.matchItem(it, m) && UI.matchItem(it, f),
            `ex4 #${i + 1}: the real scorer accepts both genders`);
    });
}

/* ------------------------------------- Ex5/6/7/10: the source cues survive */
{
    const CUES = {
        ex5: ['делать домашнее задание', 'смотреть фильмы', 'готовить ужин', 'читать книги',
              'покупать продукты', 'повторять слова', 'писать письма', 'убирать комнату',
              'решать задачи', 'изучать новую тему'],
        ex7: ['долго / искать / найти', 'долго / готовить / приготовить', 'долго / решать / решить',
              'долго / писать / написать', 'долго / выбирать / выбрать',
              'долго / объяснять / объяснить', 'долго / ждать / дождаться',
              'долго / готовиться / подготовиться', 'долго / думать / придумать',
              'долго / работать / закончить'],
        ex10: ['раньше / часто читать книги → уже / прочитать / пять книг',
               'раньше / изучать английский → уже / выучить / много новых слов',
               'раньше / путешествовать → уже / посетить / несколько стран',
               'раньше / работать в офисе → уже / перейти / на удалённую работу',
               'раньше / часто готовить дома → уже / научиться / готовить несколько новых блюд',
               'раньше / заниматься спортом → уже / пробежать / свой первый марафон',
               'раньше / смотреть русские фильмы → уже / посмотреть / много фильмов без субтитров',
               'раньше / бояться говорить по-русски → уже / провести / несколько разговоров',
               'раньше / делать много ошибок → уже / исправить / большинство ошибок',
               'раньше / плохо понимать русскую речь → уже / начать / понимать фильмы без перевода']
    };
    Object.keys(CUES).forEach(id => CUES[id].forEach((cue, i) =>
        eq(`${id} #${i + 1} keeps the source cue`, at(id, i).q, cue)));

    /* Ex6 keeps the source's own first clause AND its gap */
    (byId.ex6.items || []).forEach((it, i) => {
        ok(/^Я обычно .+, но сегодня уже _{3,}\.$/.test(it.q),
            `ex6 #${i + 1} keeps the source stem and its gap`);
    });
    ok(byId.ex6.items[0].q === 'Я обычно читаю вечером, но сегодня уже ________.',
        'ex6 #1 is the source stem verbatim');

    /* the instructions have to carry what the grader cannot */
    ok(/ikkita TO'LIQ gap yozing/.test(byId.ex5.intro),
        'ex5 asks explicitly for TWO complete sentences');
    ok(/«Я обычно…».*НСВ/.test(byId.ex5.intro) && /«Я уже…».*СВ/.test(byId.ex5.intro),
        'ex5 names both target models');
    ok(/TO'LIQ gap yozing/.test(byId.ex6.intro),
        'ex6 tells the learner to write the COMPLETE sentence');
    ok(/СВ bilan ifodalang/.test(byId.ex6.intro), 'ex6 names the perfective result');
    ok(/НСВ bilan/.test(byId.ex7.intro) && /СВ bilan/.test(byId.ex7.intro),
        'ex7 keeps долго + НСВ → наконец + СВ');
    ok(/naconec|naconce/.test(byId.ex7.intro) === false, 'ex7 instruction has no typo for наконец');
    ok(/tajribani НСВ bilan/.test(byId.ex10.intro) && /natijani esa СВ bilan/.test(byId.ex10.intro),
        'ex10 keeps earlier experience (НСВ) contrasted with a completed result (СВ)');
    [byId.ex5, byId.ex6, byId.ex7, byId.ex10].forEach(g =>
        ok(g.items.every(it => typeof it.placeholder === 'string' && it.placeholder.trim()),
            `${g.id}: every open item shows a writing placeholder, not a one-word blank`));
}

/* ------------------------------------------------------------------- Ex8 */
{
    const SENT = [
        ['Пока я читал, сестра смотрела телевизор.', 'Пока я читала, сестра смотрела телевизор.'],
        ['Пока мама готовила, дети играли.'],
        ['Пока я работал, друг ждал.', 'Пока я работала, друг ждал.'],
        ['Пока она училась, брат занимался спортом.'],
        ['Пока мы обсуждали, они слушали.'],
        ['Пока я писал письмо, жена готовила ужин.', 'Пока я писала письмо, жена готовила ужин.'],
        ['Пока дети делали уроки, родители отдыхали.'],
        ['Пока он работал, коллеги разговаривали.'],
        ['Пока я убирал комнату, брат смотрел фильм.', 'Пока я убирала комнату, брат смотрел фильм.'],
        ['Пока мы ехали, дети спали.']
    ];
    SENT.forEach((acc, i) => eq(`ex8 #${i + 1} accepted sentences`,
        JSON.stringify(at('ex8', i).answer), JSON.stringify(acc)));
    eq('ex8 carries exactly 4 gender alternatives',
        byId.ex8.items.filter(it => it.answer.length > 1).length, 4);
    eq('ex8 gender alternatives sit on the four «я» rows',
        byId.ex8.items.map((it, i) => (it.answer.length > 1 ? i + 1 : 0)).filter(Boolean).join(','),
        '1,3,6,9');
    (byId.ex8.items || []).forEach((it, i) => {
        if (it.answer.length === 1) {
            ok(!/^я \//.test(it.q), `ex8 #${i + 1} without an alternative is not a «я» row`);
        }
    });
}

/* ------------------------------------------------- Ex9 + the mixed-gender trap */
{
    const PAIRS = [
        ['Когда я закончил работу, я позвонил другу.', 'Когда я закончила работу, я позвонила другу.'],
        ['Когда я сделал домашнее задание, я посмотрел фильм.', 'Когда я сделала домашнее задание, я посмотрела фильм.'],
        ['Когда я приготовил ужин, я пригласил гостей.', 'Когда я приготовила ужин, я пригласила гостей.'],
        ['Когда я купил билеты, я сообщил родителям.', 'Когда я купила билеты, я сообщила родителям.'],
        ['Когда я закончил курс, я получил сертификат.', 'Когда я закончила курс, я получила сертификат.'],
        ['Когда я решил проблему, я сообщил руководителю.', 'Когда я решила проблему, я сообщила руководителю.'],
        ['Когда я прочитал книгу, я обсудил её.', 'Когда я прочитала книгу, я обсудила её.'],
        ['Когда я подготовился к экзамену, я сдал его.', 'Когда я подготовилась к экзамену, я сдала его.'],
        ['Когда я убрал комнату, я пригласил друзей.', 'Когда я убрала комнату, я пригласила друзей.'],
        ['Когда я написал письмо, я отправил его.', 'Когда я написала письмо, я отправила его.']
    ];
    PAIRS.forEach(([m, f], i) => {
        const it = at('ex9', i);
        eq(`ex9 #${i + 1} accepts exactly the masculine and feminine sentence`,
            JSON.stringify(it.answer), JSON.stringify([m, f]));
        ok(it.q !== undefined && UI.matchItem(it, m) && UI.matchItem(it, f),
            `ex9 #${i + 1}: the real scorer accepts both consistent sentences`);
    });
    /* Both verbs belong to «я», so a half-feminine sentence is wrong Russian.
       Build both mixed orders and run the product's own scorer on them. */
    let mixedAccepted = 0, mixedBuilt = 0;
    PAIRS.forEach(([m, f]) => {
        const mHead = m.split(', я ')[0], mTail = m.split(', я ')[1];
        const fHead = f.split(', я ')[0], fTail = f.split(', я ')[1];
        [fHead + ', я ' + mTail, mHead + ', я ' + fTail].forEach(mixed => {
            mixedBuilt++;
            if (byId.ex9.items.some(it => UI.matchItem(it, mixed))) mixedAccepted++;
        });
    });
    eq('twenty mixed-gender sentences were built', mixedBuilt, 20);
    eq('no mixed-gender sentence is accepted anywhere in ex9', mixedAccepted, 0);
}

/* ----------------------------------------------------------------- format */
ok(ex.every(g => g.showTask === true), 'every group opts into the task block');
ok(ex.every(g => !g.howTo), 'no group carries a "Как выполнять" briefing');
ok(ex.every(g => typeof g.intro === 'string' && g.intro.length > 20),
    'every group states its task in Uzbek (11 instructions)');
eq('all 10 main groups carry their Namuna', ex.filter(g => !g.audioSrc && g.namuna).length, 10);
ok(!byId.audio1.namuna, 'the audio group has no invented Namuna');

ex.forEach(g => {
    const d = w.document.createElement('div');
    d.innerHTML = UI.renderGroup(g);
    ok(!!d.querySelector('.b2h-howto-t'), `${g.id}: exercise name rendered`);
    ok(!!d.querySelector('.b2h-howto-task'), `${g.id}: Uzbek task rendered`);
    ok(!d.querySelector('.b2h-howto-h'), `${g.id}: no "Как выполнять" heading`);
    ok(!/Как выполнять/.test(d.textContent), `${g.id}: phrase absent`);
    eq(`${g.id}: all items rendered`, d.querySelectorAll('.b2h-item').length, g.items.length);
    if (g.namuna) ok(/Namuna:/.test(d.textContent), `${g.id}: Namuna rendered`);
    if (g.type === 'input') {
        eq(`${g.id}: every item gets a writing input`,
            d.querySelectorAll('input.b2h-input').length, g.items.length);
    }
});

/* ------------------------------------------------------------------ audio */
{
    const a = byId.audio1;
    eq('audio group type', a.type, 'choice');
    eq('audio group style', a.style, 'tf');
    ok(/%D0%912%207%20%D1%83%D1%80%D0%BE%D0%BA\.mp3/.test(a.audioSrc),
        'audioSrc points at "Б2 7 урок.mp3"');
    eq('audioSrc decodes to the exact path', decodeURIComponent(a.audioSrc), 'audios/Б2 7 урок.mp3');
    ok(fs.existsSync(path.join(ROOT, 'audios', 'Б2 7 урок.mp3')), 'the audio file exists on disk');
    ok(!/%D0%912%206%20/.test(a.audioSrc), 'topic 7 does not point at topic 6\'s recording');

    const STATEMENTS = [
        'Раньше герой очень хорошо говорил по-русски.',
        'Он часто делал ошибки и забывал простые выражения.',
        'Обычно он читал короткие тексты и смотрел фильмы с субтитрами.',
        'Герой решил серьёзно заняться русским языком после одной встречи.',
        'Он начал заниматься русским каждый день.',
        'Через несколько месяцев он выучил много новых слов.',
        'Герой никогда не разговаривал с носителями русского языка.',
        'Сейчас он обычно занимается русским утром.',
        'Сегодня он уже сделал все упражнения и прочитал один текст.',
        'Раньше ему было сложно понять разницу между СВ и НСВ.'
    ];
    STATEMENTS.forEach((st, i) => eq(`audio statement ${i + 1} is the source text`, at('audio1', i).q, st));
    eq('audio answers follow the source truth values', a.items.map(i => i.answer).join(','),
        'Ложь,Правда,Правда,Ложь,Правда,Правда,Ложь,Ложь,Правда,Правда');
    ok(a.items.every(it => it.options.join(',') === 'Правда,Ложь'),
        'every statement offers the existing B2 Правда / Ложь labels');
    /* the source labelled them Верно/Неверно; a second true/false vocabulary
       must not be introduced for one lesson */
    const blob = JSON.stringify(a);
    ok(blob.indexOf('Верно') === -1 && blob.indexOf('Неверно') === -1,
        'Верно / Неверно are not used anywhere in the audio group');

    /* the source told the learner to read a text that was never supplied */
    ok(/tinglang/i.test(a.intro), 'the audio task tells the learner to LISTEN');
    ok(!/o‘qing|o'qing|прочитайте|Matn asosida/i.test(a.intro),
        'the audio task never tells the learner to read a text');
    ok(!a.passage, 'no transcript was fabricated');
    ok(!/«[А-ЯЁ][^»]{4,}»/.test(a.title.replace("«Rost yoki yolg'on»", '')),
        'no story title was invented — the generic B2 group title is used');
}

/* ------------------------------------------------- vocabulary (paid only) */
{
    const s = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-vocabulary.html'), 'utf8');
    const i7 = s.indexOf('                    id: 7,');
    ok(i7 > -1, 'paid vocabulary has topic 7');
    const i8 = s.indexOf('                    id: 8,', i7);
    const seg = s.slice(s.lastIndexOf('{', i7),
        i8 > -1 ? s.lastIndexOf('{', i8) : s.indexOf('generateLockedTopics('));
    const cards = [...seg.matchAll(/\{ ru: "([^"]+)", uz: "([^"]+)" \}/g)].map(m => [m[1], m[2]]);
    eq('paid vocabulary topic 7 has all 69 cards', cards.length, 69);
    ok(/name: "Вид глагола"/.test(seg), 'paid vocabulary topic 7 is this lesson');
    ok(/isLocked: false/.test(seg), 'paid vocabulary topic 7 is unlocked');
    eq('69 unique Russian units', new Set(cards.map(c => c[0])).size, 69);
    eq('no duplicate card', new Set(cards.map(c => c.join('|'))).size, 69);
    eq('first card', cards[0].join(' — '), 'выполнять — выполнить — bajarmoq');
    eq('last card', cards[68][0], 'перестать делать');

    /* the source listed решать — решить twice, with two different glosses */
    const resh = cards.filter(c => c[0] === 'решать — решить');
    eq('«решать — решить» ships exactly once', resh.length, 1);
    ok(resh.length === 1 && /hal qilmoq/.test(resh[0][1]) && /qaror qilmoq/.test(resh[0][1]),
        'and the merged card keeps BOTH source meanings');

    /* near-synonyms that are distinct Russian units must NOT be merged away */
    ['получить опыт', 'приобрести опыт', 'иметь опыт', 'получить результат',
     'добиться результата', 'успеть сделать', 'не успеть сделать',
     'привыкнуть делать', 'продолжать делать', 'перестать делать'
    ].forEach(unit => ok(cards.some(c => c[0] === unit),
        `paid vocabulary keeps the distinct unit «${unit}»`));

    const authored = [...s.matchAll(/\n                    id: (\d+),/g)].map(m => Number(m[1]));
    const vFrontier = Math.max.apply(null, authored);
    ok(authored.indexOf(7) !== -1 && vFrontier >= 7,
        'topic 7 is an authored (unlocked) vocabulary deck');
    ok(new RegExp('generateLockedTopics\\(' + (vFrontier + 1) + '\\)').test(s),
        `locked vocabulary topics start right after the last authored deck (${vFrontier + 1})`);
    ok(!/generateLockedTopics\(7\)/.test(s), 'no stale generateLockedTopics(7) remains');
    ok(/Сравнительные конструкции/.test(s) && /Условные предложения/.test(s)
       && /Прямая и косвенная речь/.test(s), 'paid vocabulary topics 4-6 intact');

    const demo = fs.readFileSync(path.join(ROOT, 'b2-demo-vocabulary.html'), 'utf8');
    ok(!/                    id: 7,/.test(demo), 'demo vocabulary untouched (no topic 7)');
    ok(!/Вид глагола/.test(demo), 'topic 7 did not leak into the demo vocabulary');
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
        const t = list.find(x => x.id === 7);
        /* the coming-soon boundary is wherever the authored range ends */
        const soonId = frontier + 1;
        const next = list.find(x => x.id === soonId);
        ok(t.grammar.length > 12000, `${mode}: topic 7 carries the real grammar`);
        ok(!t.content, `${mode}: topic 7 is a real lesson, not a coming-soon shell`);
        eq(`${mode}: topic 7 serves 11 exercise groups`,
            (w.eval('b2ExerciseData(7)') || { exercises: [] }).exercises.length, 11);
        eq(`${mode}: topic ${soonId} has no lesson payload`,
            w.eval('b2ExerciseData(' + soonId + ')'), null);
        eq(`${mode}: topic ${soonId} grammar is empty`, next.grammar, '');
        ok(!!next.content, `${mode}: topic ${soonId} still renders the coming-soon card`);
        if (mode === 'paid') {
            ok(t.isLocked === false, 'paid: topic 7 is available');
        } else {
            ok(t.isLocked === true, 'demo: topic 7 stays behind the paywall');
            ok(next.isLocked === true, `demo: topic ${soonId} stays locked too`);
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
    console.log(`  ✅ B2 TOPIC 7: ${pass}/${pass} passed`
        + `  (open ${openCount} · deterministic ${detCount} · multi ${multi}`
        + ` · accepted variants ${variants})`);
} else {
    console.log(`  ❌ B2 TOPIC 7: ${fail} failed / ${pass + fail}\n`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
}
console.log('='.repeat(60) + '\n');
process.exit(fail === 0 ? 0 : 1);
