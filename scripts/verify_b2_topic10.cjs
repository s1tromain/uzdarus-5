#!/usr/bin/env node
/**
 * verify_b2_topic10.cjs — B2 Lesson 10 «Безличные предложения».
 *
 * What shapes this suite:
 *
 *  1. EVERY item is deterministic (110 of them). The learner types full
 *     sentences, but each prompt fixes its target construction — Ex6 through a
 *     register cue, Ex10 through a named construction — so nothing needs to be
 *     open. Openness is still OBSERVED through the product's own matchItem(),
 *     never assumed, so a silently-open item would be caught.
 *
 *  2. Five source defects are pinned so they cannot regress: the "кто?"-only
 *     definition, «Необходимо, чтобы + прошедшее время», the noun model, the
 *     unanswerable Ex6, the mismatched Ex8 #10, and the two Ex9 rows that were
 *     not errors at all.
 *
 *  3. The audio statements stay in UZBEK exactly as the source wrote them; only
 *     the answer buttons are normalised to the B2 Правда / Ложь convention.
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

console.log('\n=== B2 TOPIC 10 — Безличные предложения ===');

/* ------------------------------------------------------------ data presence */
const all = w.B2_LESSON_DATA.topics;
[1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(id => ok(!!all.find(t => t.id === id), `topic ${id} still present`));
const t10 = all.find(t => t.id === 10);
ok(!!t10, 'topic 10 exists');
if (!t10) { console.log('missing lesson 10'); process.exit(1); }
eq('topic 10 appears exactly once', all.filter(t => t.id === 10).length, 1);
eq('topic 10 title', t10.title, 'Безличные предложения');
ok(t10.isLocked === false && t10.isSubscriptionLocked === false, 'topic 10 ships unlocked');
ok(/Shaxssiz gaplar/.test(t10.description || ''), 'topic 10 description names the lesson');

const syll = w.B2_TOPICS;
eq('B2 syllabus still has 16 topics', syll.length, 16);
eq('syllabus and lesson agree on the topic 10 title', (syll.find(t => t.id === 10) || {}).title, t10.title);

const ids = all.map(t => t.id).sort((a, b) => a - b);
const frontier = ids[ids.length - 1];
ok(ids.join(',') === Array.from({ length: frontier }, (_, i) => i + 1).join(','),
    `authored lesson ids are contiguous 1..${frontier}`);
ok(frontier >= 10, `topic 10 is authored (frontier ${frontier})`);
ok(!all.find(t => t.id === frontier + 1),
    `topic ${frontier + 1} has no lesson payload — it stays "coming soon"`);

/* ---------------------------------------------------------------- grammar */
const G = t10.grammar || '';
const gdoc = new JSDOM('<body><div id="g"></div></body>').window.document;
gdoc.getElementById('g').innerHTML = G;
const GT = gdoc.getElementById('g').textContent.replace(/\s+/g, ' ');

ok(G.length > 10000, `grammar is a full lesson (${G.length} chars)`);
ok(!/\$\{/.test(G), 'no template placeholder leaked');
for (let n = 1; n <= 12; n++) {
    ok(G.indexOf('<h4>' + n + '. ') !== -1, `grammar block ${n} is numbered`);
}
eq('12 numbered blocks + 1 closing rule heading', (G.match(/<h4/g) || []).length, 13);
ok(/b2g-check/.test(G), 'the closing rule uses the B2 check card');
ok(GT.indexOf('B2 uchun asosiy qoida') !== -1, 'the closing rule block is present');

[['definition examples', 'Мне холодно.'],
 ['кажется model', 'Мне кажется, что + gap'],
 ['кажется example', 'Мне кажется, что он слишком много работает.'],
 ['маловероятным', 'Мне кажется маловероятным, что проблема решится сама собой.'],
 ['представляется', 'Мне представляется, что…'],
 ['удалось model', 'Мне удалось + infinitiv'],
 ['удалось example', 'Мне удалось убедить его изменить решение.'],
 ['смог vs удалось', 'Я смог закончить проект вовремя.'],
 ['удалось despite', 'Мне удалось закончить проект вовремя, несмотря на нехватку времени.'],
 ['необходимо + inf', 'Необходимо принять решение.'],
 ['необходимо чтобы', 'Необходимо, чтобы каждый участник подготовил отчёт.'],
 ['необходимо + noun', 'Необходимо дополнительное оборудование.'],
 ['следует', 'Следует обратить внимание на эту проблему.'],
 ['следует чтобы', 'Следует заранее обсудить этот вопрос, чтобы избежать недоразумений.'],
 ['emotions', 'Мне грустно.'],
 ['emotions B2', 'Ей оказалось сложно объяснить свою позицию.'],
 ['пришлось', 'Мне пришлось принять непростое решение.'],
 ['не удалось', 'Мне не удалось найти подходящее решение.'],
 ['impersonal + inf', 'Невозможно заранее предсказать результат.'],
 ['personal vs impersonal', 'Я должен принять решение.'],
 ['communicative use', 'Мне кажется, что иногда человеку необходимо выйти из зоны комфорта.']
].forEach(([label, needle]) => ok(GT.indexOf(needle) !== -1, `grammar keeps: ${label}`));

/* --- SOURCE FIX 1: the definition must be about a NOMINATIVE subject, not
       only about the question «кто?» — ordinary subjects answer «что?» too --- */
{
    /* Scope to block 1: «именительный падеж» also appears in block 10, so a
       whole-document search would pass even if THIS definition regressed. */
    const def = GT.slice(GT.indexOf('1. Безличное предложение nima?'),
                         GT.indexOf('2. Мне кажется'));
    ok(def.length > 200, 'the definition block is present');
    ok(/именительный падеж/.test(def),
        'the definition is stated in terms of the nominative case');
    ok(/«кто\? \/ что\?»/.test(def),
        'both subject questions are named, not «кто?» alone');
    ok(!/^[^]*кто\?<\/b> savoliga javob beradigan ega/.test(def),
        'the definition is not the «кто?»-only wording the source used');
    ok(/Oddiy egalar.{0,60}«что\?»/.test(GT),
        'the lesson explains that ordinary subjects can answer «что?»');
}

/* --- SOURCE FIX 2: «Необходимо, чтобы + прошедшее время» is misleading --- */
{
    ok(/чтобы \+ ega \+ fe’lning -л shakli/.test(GT),
        'the чтобы model is described by FORM, not as past tense');
    ok(/o‘tgan zamonni bildirmaydi/.test(GT),
        'the lesson states outright that this form does NOT mean past time');
    ok(/talab qilinayotgan yoki istalayotgan harakatni ifodalaydi/.test(GT),
        'and explains what it does express');
    ok(GT.indexOf('Необходимо, чтобы + прошедшее время') === -1,
        'the misleading source heading is gone');
}

/* --- SOURCE FIX 3: «необходимо + существительное» is kept but qualified --- */
{
    ok(/otning grammatik tahlili/.test(GT),
        'the noun model carries the caveat about its different analysis');
    ok(GT.indexOf('Необходимо время для анализа ситуации.') !== -1,
        'the useful source phrases are kept, not deleted');
    ok(/asosiy model sifatida/.test(GT),
        'and the lesson names infinitive / чтобы as its primary models');
}

/* --- the приходиться tense table, which Topic 9 also depends on --- */
['приходится — Мне приходится много работать.',
 'пришлось — Мне пришлось много работать.',
 'придётся — Мне придётся изменить планы.'
].forEach(s => ok(GT.indexOf(s) !== -1, `the tense table keeps «${s.split(' — ')[0]}»`));

{
    const tables = [...gdoc.querySelectorAll('table.b2g-t')];
    eq('grammar renders its 21 b2g-t tables', tables.length, 21);
    let wide = 0, headless = 0;
    tables.forEach(tb => {
        [...tb.querySelectorAll('tr')].forEach(tr => { if (tr.children.length !== 2) wide++; });
        if (!tb.querySelector('th')) headless++;
    });
    eq('every grammar table row has exactly 2 cells', wide, 0);
    eq('every grammar table has a header row', headless, 0);
}

/* -------------------------------------------------------------- exercises */
const ex = t10.exercises || [];
const byId = {};
ex.forEach(g => { byId[g.id] = g; });
const at = (id, i) => ((byId[id] && byId[id].items && byId[id].items[i]) || {});
const grp = (id) => (byId[id] || {});
const items = (id) => ((byId[id] && byId[id].items) || []);

eq('11 exercise groups', ex.length, 11);
eq('group ids follow the B2 convention', ex.map(g => g.id).join(','),
    'ex1,ex2,ex3,ex4,ex5,ex6,ex7,ex8,ex9,ex10,audio1');
ok(ex.every(g => g.items.length === 10), 'every group carries 10 items');
eq('110 items in total', ex.reduce((a, g) => a + g.items.length, 0), 110);
eq('10 main groups', ex.filter(g => !g.audioSrc).length, 10);
eq('1 audio group', ex.filter(g => g.audioSrc).length, 1);
eq('no builder group in this lesson', ex.filter(g => g.type === 'builder').length, 0);

const TITLES = {
    ex1: '1-mashq. «Мне кажется…»',
    ex2: '2-mashq. «Мне удалось…»',
    ex3: '3-mashq. «Мне не удалось…»',
    ex4: '4-mashq. «Необходимо…»',
    ex5: '5-mashq. «Следует…»',
    ex6: '6-mashq. «Нужно / надо / необходимо / следует»',
    ex7: '7-mashq. «Можно / нельзя»',
    ex8: '8-mashq. Безличный глагол',
    ex9: '9-mashq. Xatoni toping va tuzating',
    ex10: '10-mashq. Vaziyatga mos gap tuzing',
    audio1: "Audio bo'yicha «Rost yoki yolg'on» mashqi"
};
Object.keys(TITLES).forEach(id => eq(`${id} title`, grp(id).title, TITLES[id]));

/* -------------------------------------------- openness, observed not assumed */
const NONSENSE = 'зззz яяяy ююю';
const isOpen = (it) => UI.matchItem(it, NONSENSE) === true;
let openCount = 0, multi = 0, variants = 0;
let missing = 0, junk = 0, badOpt = 0, unmatched = 0, nonsenseAccepted = 0, blankAccepted = 0;

ex.forEach(g => g.items.forEach((it, i) => {
    const where = `${g.id} #${i + 1}`;
    if (isOpen(it)) { openCount++; fail++; failures.push(`${where}: unexpectedly OPEN`); return; }
    const acc = Array.isArray(it.answer) ? it.answer : [it.answer];
    variants += acc.length;
    if (acc.length > 1) multi++;
    if (!acc.length || acc.every(x => x == null || !String(x).trim())) missing++;
    if (/TODO|FIXME|placeholder|undefined|null/i.test(JSON.stringify(it.answer))) junk++;
    if (Array.isArray(it.options) && !acc.some(x => it.options.indexOf(x) !== -1)) badOpt++;
    acc.forEach(x => { if (!UI.matchItem(it, x)) unmatched++; });
    if (UI.matchItem(it, NONSENSE)) nonsenseAccepted++;
    if (UI.matchItem(it, '')) blankAccepted++;
}));

eq('no item is open — every prompt fixes its target construction', openCount, 0);
eq('110 deterministic items', ex.reduce((a, g) => a + g.items.length, 0) - openCount, 110);
eq('2 multi-accept items', multi, 2);
ok(ex.every(g => g.items.every(it => it.free !== true)), 'no item is flagged free');
eq('no item is missing its key', missing, 0);
eq('no TODO / placeholder / undefined / null in any key', junk, 0);
eq('every choice answer is among its options', badOpt, 0);
eq('the shared scorer accepts every accepted answer', unmatched, 0);
eq('no item accepts nonsense', nonsenseAccepted, 0);
eq('no item accepts a blank', blankAccepted, 0);
eq('multi-accept sits exactly where the ambiguity is',
    ex.map(g => g.id + ':[' + g.items.map((it, i) =>
        (Array.isArray(it.answer) && it.answer.length > 1 ? i + 1 : 0)).filter(Boolean).join(',') + ']')
      .filter(s => !s.endsWith('[]')).join(' '), 'ex10:[5,7]');
eq('all 110 prompts are distinct', new Set(ex.flatMap(g => g.items.map(i => i.q))).size, 110);

/* ------------------------------------------------------------------- Ex1 */
{
    const KEYS = ['Мне кажется, что она ошибается.',
        'Мне кажется, что этот фильм очень интересный.',
        'Мне кажется, что они уже приехали.',
        'Мне кажется, что решение было правильным.',
        'Мне кажется, что он не знает об этом.',
        'Мне кажется, что погода скоро изменится.',
        'Мне кажется, что нам нужно подождать.',
        'Мне кажется, что она хорошо подготовилась.',
        'Мне кажется, что этот вариант лучше.',
        'Мне кажется, что они неправильно поняли ситуацию.'];
    KEYS.forEach((k, i) => {
        eq(`ex1 #${i + 1} key`, JSON.stringify(at('ex1', i).answer), JSON.stringify([k]));
        ok(/^Я думаю, что /.test(at('ex1', i).q), `ex1 #${i + 1} keeps the source «Я думаю» prompt`);
    });
    ok(items('ex1').every(it => String((it.answer || [])[0]).indexOf('Мне кажется, что') === 0),
        'every ex1 answer uses the target construction');
}

/* ------------------------------------------------------------------- Ex2 */
{
    const KEYS = ['найти', 'сдать', 'подготовить', 'закончить', 'принять',
                  'поговорить', 'решить', 'исправить', 'купить', 'избежать'];
    KEYS.forEach((k, i) => eq(`ex2 #${i + 1} key`, at('ex2', i).answer, k));
    ok(KEYS.every(k => /(ться|ть|ти|чь)$/.test(k)), 'every ex2 key is an infinitive');
}

/* ------------------------------------------------------------------- Ex3 */
{
    const KEYS = ['Мне не удалось найти нужную книгу.', 'Ей не удалось приехать вовремя.',
        'Нам не удалось договориться с партнёрами.', 'Ему не удалось сдать экзамен.',
        'Мне не удалось найти решение.', 'Им не удалось купить билеты.',
        'Ей не удалось закончить работу.', 'Нам не удалось обсудить вопрос.',
        'Ему не удалось исправить ошибку.', 'Мне не удалось связаться с преподавателем.'];
    KEYS.forEach((k, i) => eq(`ex3 #${i + 1} key`,
        JSON.stringify(at('ex3', i).answer), JSON.stringify([k])));
    ok(items('ex3').every(it => /не удалось /.test(String((it.answer || [])[0]))),
        'every ex3 answer uses «не удалось + infinitiv»');
    /* the dative experiencer must follow the source subject, not default to «мне» */
    eq('ex3 keeps each source subject in the dative',
        items('ex3').map(it => String((it.answer || [])[0]).split(' ')[0]).join(','),
        'Мне,Ей,Нам,Ему,Мне,Им,Ей,Нам,Ему,Мне');
}

/* --------------------------------------------------------------- Ex4 / Ex5 */
{
    const EX4 = ['Необходимо подготовить отчёт.', 'Необходимо обсудить этот вопрос.',
        'Необходимо изменить план.', 'Необходимо проверить информацию.',
        'Необходимо принять решение.', 'Необходимо соблюдать правила.',
        'Необходимо заранее подготовиться.', 'Необходимо учитывать мнение специалистов.',
        'Необходимо решить эту проблему как можно скорее.',
        'Необходимо предоставить дополнительные документы.'];
    EX4.forEach((k, i) => eq(`ex4 #${i + 1} key`,
        JSON.stringify(at('ex4', i).answer), JSON.stringify([k])));

    const EX5 = ['Следует обратить внимание на эту проблему.',
        'Не следует торопиться с решением.', 'Следует заранее подготовиться к экзамену.',
        'Не следует игнорировать мнение других людей.', 'Следует проверить все данные.',
        'Следует учитывать возможные последствия.', 'Не следует делать поспешные выводы.',
        'Следует внимательно изучить документы.', 'Не следует забывать о своих обязанностях.',
        'Следует обсудить этот вопрос с руководителем.'];
    EX5.forEach((k, i) => eq(`ex5 #${i + 1} key`,
        JSON.stringify(at('ex5', i).answer), JSON.stringify([k])));
    /* the negative rows must follow the source's «Не нужно…» prompts */
    eq('ex5 negates exactly the rows the source negates',
        items('ex5').map((it, i) => (/^Не следует/.test(String((it.answer || [])[0])) ? i + 1 : 0))
            .filter(Boolean).join(','), '2,4,7,9');
    ok(items('ex5').every((it) =>
        /^Не нужно/.test(it.q) === /^Не следует/.test(String((it.answer || [])[0]))),
        'ex5 negation always matches the source prompt');
}

/* ------------------------------- Ex6: the source exercise was unanswerable */
{
    const KEYS = ['нужно', 'необходимо', 'следует', 'надо', 'необходимо',
                  'следует', 'нужно', 'надо', 'необходимо', 'следует'];
    KEYS.forEach((k, i) => eq(`ex6 #${i + 1} key`, at('ex6', i).answer, k));
    /* SOURCE FIX: without a register cue, «Нам ___ обсудить результаты встречи»
       accepts all four modals equally. Every prompt now carries its cue. */
    const CUES = ['(Oddiy shaxsiy zarurat)', '(Rasmiy talab)', '(Ish yuzasidan tavsiya)',
        '(Og‘zaki, oddiy maslahat)', '(Rasmiy o‘quv talabi)', '(Umumiy tavsiya)',
        '(Amaliy zarurat)', '(Og‘zaki maslahat)', '(Rasmiy tanlov sharti)', '(Tavsiya)'];
    CUES.forEach((cue, i) => ok(String(at('ex6', i).q).indexOf(cue) === 0,
        `ex6 #${i + 1} opens with its register cue ${cue}`));
    ok(items('ex6').every(it => /_{3,}/.test(it.q)), 'every ex6 prompt keeps its gap');
    /* the source core sentences survive the repair */
    ['Мне ___ закончить эту работу сегодня.', 'Вам ___ предоставить паспорт.',
     'Нам ___ обсудить результаты встречи.', 'Тебе ___ немного отдохнуть.',
     'Студентам ___ подготовиться к экзамену.', 'В такой ситуации ___ сохранять спокойствие.',
     'Нам ___ учитывать мнение клиентов.', 'Тебе ___ поговорить с ним.',
     'Для участия в конкурсе ___ заполнить анкету.', 'Вам ___ внимательно прочитать инструкцию.'
    ].forEach((core, i) => ok(String(at('ex6', i).q).indexOf(core) !== -1,
        `ex6 #${i + 1} keeps the source sentence`));
    /* all four modals are actually drilled */
    ['нужно', 'надо', 'необходимо', 'следует'].forEach(m =>
        ok(KEYS.filter(k => k === m).length >= 2, `ex6 drills «${m}» at least twice`));
    ok(/registrni ko'rsatadi/.test(grp('ex6').intro),
        'ex6 tells the learner that the bracketed note carries the register');
}

/* ------------------------------------------------------------------- Ex7 */
{
    const KEYS = ['Здесь можно пользоваться телефоном.', 'В этой комнате нельзя курить.',
        'Здесь можно оставлять вещи.', 'В библиотеке нельзя громко разговаривать.',
        'В этом месте можно парковаться.', 'Во время экзамена нельзя пользоваться телефоном.',
        'Здесь можно задавать вопросы.', 'В этом здании нельзя входить без разрешения.',
        'В этом музее можно фотографировать.', 'Во время урока нельзя разговаривать.'];
    KEYS.forEach((k, i) => eq(`ex7 #${i + 1} key`,
        JSON.stringify(at('ex7', i).answer), JSON.stringify([k])));
    ok(items('ex7').every((it) =>
        /запрещено/.test(it.q) === /нельзя/.test(String((it.answer || [])[0]))),
        'ex7 maps разрешено→можно and запрещено→нельзя without exception');
}

/* --------------------------------- Ex8: finite impersonal verbs, #10 repaired */
{
    const KEYS = ['работается', 'спится', 'сидится', 'живётся', 'думается',
                  'работается', 'верится', 'отдыхается', 'учится', 'дышится'];
    KEYS.forEach((k, i) => eq(`ex8 #${i + 1} key`, at('ex8', i).answer, k));
    ok(KEYS.every(k => /(тся|ится|ётся)$/.test(k)),
        'every ex8 key is a FINITE impersonal form, not an infinitive');
    /* SOURCE FIX: the original #10 asked for an infinitive after «трудно»,
       breaking the pattern the other nine items drill. */
    eq('ex8 #10 is the repaired дышаться item', at('ex8', 9).q,
        'На свежем воздухе мне легко ___. (дышаться)');
    ok(String(at('ex8', 9).q).indexOf('забыться') === -1,
        'the mismatched «забыться» item is gone');
    ok(items('ex8').every(it => /\([а-яё]+ся\)$/.test(String(it.q).trim())),
        'every ex8 prompt names a reflexive verb in brackets');
}

/* ------------------------------- Ex9: two source rows were not errors at all */
{
    const KEYS = [
        ['Я кажется, что он прав.', 'Мне кажется, что он прав.'],
        ['Я удалось решить проблему.', 'Мне удалось решить проблему.'],
        ['Я необходимо подготовиться к экзамену.', 'Мне необходимо подготовиться к экзамену.'],
        ['Мне кажется он ошибается.', 'Мне кажется, что он ошибается.'],
        ['Я не удалось закончить работу.', 'Мне не удалось закончить работу.'],
        ['Мне следует обратился к врачу.', 'Мне следует обратиться к врачу.'],
        ['Я нельзя здесь парковаться.', 'Мне нельзя здесь парковаться.'],
        ['Я нужно больше заниматься.', 'Мне нужно больше заниматься.'],
        ['Мне удалось нашёл решение.', 'Мне удалось найти решение.'],
        ['Я не работается сегодня.', 'Мне не работается сегодня.']
    ];
    KEYS.forEach(([q, a], i) => {
        eq(`ex9 #${i + 1} prompt`, at('ex9', i).q, q);
        eq(`ex9 #${i + 1} correction`, JSON.stringify(at('ex9', i).answer), JSON.stringify([a]));
    });
    /* the whole point of the exercise: every prompt must actually BE wrong */
    let same = 0;
    items('ex9').forEach(it => { if ((it.answer || []).indexOf(String(it.q).trim()) !== -1) same++; });
    eq('every ex9 prompt really differs from its correction', same, 0);
    /* the two replaced rows: the source versions were already grammatical */
    ok(at('ex9', 5).q !== 'Мне следует обратиться к врачу.',
        'ex9 #6 is no longer the already-correct source sentence');
    ok(at('ex9', 8).q !== 'Мне удалось найти решение.',
        'ex9 #9 is no longer the already-correct source sentence');
    ok(/haqiqiy grammatik xato/.test(grp('ex9').intro),
        'ex9 promises a REAL grammatical error in every sentence');
    ok(/shaxs ko'rsatilgan bo'lsa/.test(grp('ex9').intro),
        'ex9 tells the learner to keep the experiencer, which keeps the answers determinable');
    /* the experiencer is preserved wherever the source names one */
    eq('every ex9 correction keeps its dative experiencer',
        items('ex9').filter(it => /^Мне /.test(String((it.answer || [])[0]))).length, 10);
}

/* ---------------------------- Ex10: each situation names its construction */
{
    const KEYS = [
        ['мне удалось', ['Мне удалось найти нужную информацию.']],
        ['мне не удалось', ['Мне не удалось закончить работу вовремя.']],
        ['мне кажется, что', ['Мне кажется, что он не говорит правду.']],
        ['необходимо', ['Необходимо проверить документы.']],
        ['следует', ['Следует обратить внимание на этот вопрос.',
                     'Следует обратить внимание на эту проблему.']],
        ['нельзя', ['Здесь нельзя пользоваться телефоном.']],
        ['мне трудно', ['Мне трудно работать сегодня.', 'Сегодня мне трудно работать.']],
        ['мне кажется, что', ['Мне кажется, что это решение правильное.']],
        ['следует', ['Мне следует лучше подготовиться к экзамену.']],
        ['мне удалось', ['Мне удалось найти выход из этой ситуации.']]
    ];
    KEYS.forEach(([target, a], i) => {
        const it = at('ex10', i);
        ok(String(it.q).indexOf('Используйте: ' + target) !== -1,
            `ex10 #${i + 1} names the target construction «${target}»`);
        eq(`ex10 #${i + 1} accepted answers`, JSON.stringify(it.answer), JSON.stringify(a));
        const head = target.split(',')[0].split(' ').slice(-1)[0];
        ok(Array.isArray(it.answer) && it.answer.every(s => s.toLowerCase().indexOf(head) !== -1),
            `ex10 #${i + 1} every accepted answer really uses «${head}»`);
    });
    /* SOURCE FIX: without a named construction, «Hujjatlarni tekshirish kerak»
       fits нужно / надо / необходимо / следует equally. */
    ok(items('ex10').every(it => /Используйте: /.test(it.q)),
        'every ex10 situation names its construction — the source named none');
    ok(/konstruksiyani ishlating/.test(grp('ex10').intro),
        'ex10 tells the learner to use the named construction');
    /* the ten source situations survive */
    ['Siz kerakli ma’lumotni topa oldingiz.', 'Siz ishni vaqtida tugata olmadingiz.',
     'Sizningcha, u haqiqatni aytmayapti.', 'Hujjatlarni tekshirish kerak.',
     'Bu masalaga e’tibor berish lozim.', 'Bu yerda telefon ishlatish mumkin emas.',
     'Sizga bugun ishlash qiyin.', 'Sizningcha, bu qaror to‘g‘ri.',
     'Sizga imtihonga yaxshiroq tayyorlanish kerak.',
     'Siz bu vaziyatdan chiqish yo‘lini topa oldingiz.'
    ].forEach((sit, i) => ok(String(at('ex10', i).q).indexOf(sit) === 0,
        `ex10 #${i + 1} keeps the source situation`));
}

/* ----------------------------------------------------------------- format */
ok(ex.every(g => g.showTask === true), 'every group opts into the task block');
ok(ex.every(g => !g.howTo), 'no group carries a "Как выполнять" briefing');
ok(ex.every(g => typeof g.intro === 'string' && g.intro.length > 20),
    'every group states its task in Uzbek (11 instructions)');
eq('all 10 main groups carry their Namuna', ex.filter(g => !g.audioSrc && g.namuna).length, 10);
ok(!grp('audio1').namuna, 'the audio group has no invented Namuna');

ex.forEach(g => {
    const d = w.document.createElement('div');
    d.innerHTML = UI.renderGroup(g);
    ok(!!d.querySelector('.b2h-howto-t'), `${g.id}: exercise name rendered`);
    ok(!!d.querySelector('.b2h-howto-task'), `${g.id}: Uzbek task rendered`);
    ok(!d.querySelector('.b2h-howto-h'), `${g.id}: no "Как выполнять" heading`);
    eq(`${g.id}: all items rendered`, d.querySelectorAll('.b2h-item').length, g.items.length);
    if (g.namuna) ok(/Namuna:/.test(d.textContent), `${g.id}: Namuna rendered`);
    if (g.type === 'input') {
        eq(`${g.id}: every item gets a writing input`,
            d.querySelectorAll('input.b2h-input').length, g.items.length);
    }
});

/* ------------------------------------------------------------------ audio */
{
    const a = grp('audio1');
    eq('audio group type', a.type, 'choice');
    eq('audio group style', a.style, 'tf');
    ok(/%D0%912%2010%20%D1%83%D1%80%D0%BE%D0%BA\.mp3/.test(a.audioSrc),
        'audioSrc points at "Б2 10 урок.mp3"');
    eq('audioSrc decodes to the exact path', decodeURIComponent(a.audioSrc), 'audios/Б2 10 урок.mp3');
    ok(fs.existsSync(path.join(ROOT, 'audios', 'Б2 10 урок.mp3')), 'the audio file exists on disk');
    ok(!/%D0%912%20[6-9]%20/.test(a.audioSrc), 'topic 10 does not point at an earlier recording');
    /* the source DID supply a title, so it is used verbatim */
    ok(a.intro.indexOf('«Неожиданное решение»') !== -1,
        'the recording is named by its source title «Неожиданное решение»');

    const STATEMENTS = [
        'Muallif so‘nggi paytlarda ishga juda ko‘p vaqt ajratayotganini his qiladi.',
        'Muallif avvalgidek ish, o‘qish va shaxsiy hayotini bemalol birlashtira olgan.',
        'Bir kuni kechqurun muallif uxlay olmagan va hayoti haqida o‘ylagan.',
        'Muallif hech narsani o‘zgartirish kerak emas, deb qaror qilgan.',
        'Muallif rahbari bilan o‘z ish jadvali haqida gaplashgan.',
        'Rahbari uning iltimosiga salbiy munosabat bildirgan.',
        'Endi muallif har kuni kechgacha ishlashga majbur emas.',
        'Muallif yangi ish tartibiga darhol ko‘nikib ketgan.',
        'Muallif vaqtini to‘g‘ri taqsimlash va dam olishga vaqt ajratish kerakligini tushungan.',
        'Muallif hayotda oldinga siljish uchun doimo ko‘proq ishlash kerak, degan xulosaga kelgan.'
    ];
    /* the source wrote these in Uzbek; they are NOT translated for uniformity */
    STATEMENTS.forEach((st, i) => eq(`audio statement ${i + 1} is the source text`, at('audio1', i).q, st));
    eq('audio answers follow the source truth values', a.items.map(i => i.answer).join(','),
        'Правда,Ложь,Правда,Ложь,Правда,Ложь,Правда,Ложь,Правда,Ложь');
    ok(a.items.every(it => it.options.join(',') === 'Правда,Ложь'),
        'every statement offers the existing B2 Правда / Ложь labels');
    const blob = JSON.stringify(a);
    ['Верно', 'Неверно', 'Rost', 'Yolg‘on'].forEach(bad =>
        ok(blob.indexOf('"' + bad + '"') === -1,
            `«${bad}» is not used as an answer button`));
    /* the source said "read the text" but supplied only audio */
    ok(/tinglang/i.test(a.intro), 'the audio task tells the learner to LISTEN');
    ok(!/Matn bo‘yicha|Matn asosida|o‘qing|прочитайте/i.test(a.intro),
        'the audio task never tells the learner to read a text');
    ok(!a.passage, 'no transcript was fabricated');
}

/* ------------------------------------------------- vocabulary (paid only) */
{
    const s = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-vocabulary.html'), 'utf8');
    const i10 = s.indexOf('                    id: 10,');
    ok(i10 > -1, 'paid vocabulary has topic 10');
    const i11 = s.indexOf('                    id: 11,', i10);
    const seg = s.slice(s.lastIndexOf('{', i10),
        i11 > -1 ? s.lastIndexOf('{', i11) : s.indexOf('generateLockedTopics('));
    const cards = [...seg.matchAll(/\{ ru: "([^"]+)", uz: "([^"]+)" \}/g)].map(m => [m[1], m[2]]);
    const card = (i) => (cards[i] || [])[0];
    eq('paid vocabulary topic 10 has all 80 cards', cards.length, 80);
    ok(/name: "Безличные предложения"/.test(seg), 'paid vocabulary topic 10 is this lesson');
    ok(/isLocked: false/.test(seg), 'paid vocabulary topic 10 is unlocked');
    eq('80 unique Russian units', new Set(cards.map(c => c[0])).size, 80);
    eq('no duplicate card', new Set(cards.map(c => c.join('|'))).size, 80);
    eq('first card', card(0), 'казаться');
    eq('last card', card(79), 'зона комфорта');

    /* SOURCE FIX: «можется» is colloquial and rare — labelled, not neutral */
    const mozh = cards.filter(c => /^можется/.test(c[0]));
    eq('«можется» ships exactly once', mozh.length, 1);
    eq('and it carries its register label', mozh.length === 1 ? mozh[0][0] : '',
        'можется (разг., редко)');
    ok(!cards.some(c => c[0] === 'можется'),
        'no unlabelled neutral «можется» card remains');

    /* SOURCE FIX: the source card «недоставать / недостать» contradicted its own
       example, which used «не хватает» */
    ok(cards.some(c => c[0] === 'недоставать'), '«недоставать» ships as a single verb');
    ok(!cards.some(c => c[0] === 'недоставать / недостать'),
        'the inconsistent «недоставать / недостать» pair is gone');
    ok(cards.some(c => c[0] === 'хватать / хватить'),
        '«хватать / хватить» stays as its own separate card');

    /* the repaired Ex8 #10 needs its verb in the deck */
    ok(cards.some(c => c[0] === 'дышаться'),
        '«дышаться» is in the deck — the repaired ex8 #10 drills it');

    /* every impersonal verb the exercises drill is revisable */
    ['спаться', 'работаться', 'сидеться', 'житься', 'думаться', 'вериться', 'отдыхаться']
        .forEach(v => ok(cards.some(c => c[0] === v), `the deck teaches «${v}»`));
    /* and the four modals of Ex6 */
    ['нужно', 'надо', 'необходимо', 'следует'].forEach(v =>
        ok(cards.some(c => c[0] === v), `the deck teaches the modal «${v}»`));

    const authored = [...s.matchAll(/\n                    id: (\d+),/g)].map(m => Number(m[1]));
    const vFrontier = Math.max.apply(null, authored);
    ok(authored.indexOf(10) !== -1 && vFrontier >= 10,
        'topic 10 is an authored (unlocked) vocabulary deck');
    ok(new RegExp('generateLockedTopics\\(' + (vFrontier + 1) + '\\)').test(s),
        `locked vocabulary topics start right after the last authored deck (${vFrontier + 1})`);
    ok(!/generateLockedTopics\(10\)/.test(s), 'no stale generateLockedTopics(10) remains');
    ok(/Модальные конструкции/.test(s) && /Глаголы движения с приставками/.test(s),
        'paid vocabulary topics 8-9 intact');

    const demo = fs.readFileSync(path.join(ROOT, 'b2-demo-vocabulary.html'), 'utf8');
    ok(!/                    id: 10,/.test(demo), 'demo vocabulary untouched (no topic 10)');
    ok(!/Безличные предложения/.test(demo), 'topic 10 did not leak into the demo vocabulary');
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
        const t = list.find(x => x.id === 10);
        const soonId = frontier + 1;
        const next = list.find(x => x.id === soonId);
        ok(t.grammar.length > 10000, `${mode}: topic 10 carries the real grammar`);
        ok(!t.content, `${mode}: topic 10 is a real lesson, not a coming-soon shell`);
        eq(`${mode}: topic 10 serves 11 exercise groups`,
            (w.eval('b2ExerciseData(10)') || { exercises: [] }).exercises.length, 11);
        eq(`${mode}: topic ${soonId} has no lesson payload`,
            w.eval('b2ExerciseData(' + soonId + ')'), null);
        eq(`${mode}: topic ${soonId} grammar is empty`, next.grammar, '');
        ok(!!next.content, `${mode}: topic ${soonId} still renders the coming-soon card`);
        if (mode === 'paid') {
            ok(t.isLocked === false, 'paid: topic 10 is available');
        } else {
            ok(t.isLocked === true, 'demo: topic 10 stays behind the paywall');
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
    console.log(`  ✅ B2 TOPIC 10: ${pass}/${pass} passed`
        + `  (deterministic 110 · open 0 · multi ${multi} · accepted variants ${variants})`);
} else {
    console.log(`  ❌ B2 TOPIC 10: ${fail} failed / ${pass + fail}\n`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
}
console.log('='.repeat(60) + '\n');
process.exit(fail === 0 ? 0 : 1);
