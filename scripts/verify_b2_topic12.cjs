#!/usr/bin/env node
/**
 * verify_b2_topic12.cjs — B2 Lesson 12 «Пассивные конструкции».
 *
 * Four grammar repairs and two exercise repairs are pinned here:
 *
 *  1. Active → passive is taught as a ROLE SHIFT (the accusative object becomes
 *     the nominative subject), not just «кто сделал?» vs «что сделано?».
 *  2. Passive is not only "past participle + past -ся". Three patterns are
 *     separated: process (-ся), present result (ZERO copula — «Документ
 *     подписан», never «есть подписан»), and past/future result with быть.
 *  3. «Было принято решение» is NOT an impersonal sentence. «решение» is still
 *     the nominative subject; only the word order is predicate-first, and the
 *     agreement proves it.
 *  4. Not every -ся verb is passive — only where an active paraphrase exists.
 *     «улыбаться / бояться / надеяться» are not passives.
 *
 *  Ex6 was ambiguous: several source rows are grammatical in BOTH voices, so
 *  each item now names its target voice. Ex8 stays genuinely open. Ex10 is new,
 *  because the source promises ten exercises but supplies nine.
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

console.log('\n=== B2 TOPIC 12 — Пассивные конструкции ===');

/* ------------------------------------------------------------ data presence */
const all = w.B2_LESSON_DATA.topics;
for (let i = 1; i <= 11; i++) ok(!!all.find(t => t.id === i), `topic ${i} still present`);
const t12 = all.find(t => t.id === 12);
ok(!!t12, 'topic 12 exists');
if (!t12) { console.log('missing lesson 12'); process.exit(1); }
eq('topic 12 appears exactly once', all.filter(t => t.id === 12).length, 1);
eq('topic 12 title', t12.title, 'Пассивные конструкции');
ok(t12.isLocked === false && t12.isSubscriptionLocked === false, 'topic 12 ships unlocked');

const syll = w.B2_TOPICS;
eq('B2 syllabus still has 16 topics', syll.length, 16);
eq('syllabus and lesson agree on the topic 12 title',
    (syll.find(t => t.id === 12) || {}).title, t12.title);
eq('topic 13 keeps its canonical title',
    (syll.find(t => t.id === 13) || {}).title, 'Предлоги и управление');

const ids = all.map(t => t.id).sort((a, b) => a - b);
const frontier = ids[ids.length - 1];
ok(ids.join(',') === Array.from({ length: frontier }, (_, i) => i + 1).join(','),
    `authored lesson ids are contiguous 1..${frontier}`);
ok(frontier >= 12, `topic 12 is authored (frontier ${frontier})`);
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
const G = t12.grammar || '';
const gdoc = new JSDOM('<body><div id="g"></div></body>').window.document;
gdoc.getElementById('g').innerHTML = G;
const GT = gdoc.getElementById('g').textContent.replace(/\s+/g, ' ');

ok(G.length > 6000, `grammar is a full lesson (${G.length} chars)`);
ok(!/\$\{/.test(G), 'no template placeholder leaked');
for (let n = 1; n <= 10; n++) {
    ok(G.indexOf('<h4>' + n + '. ') !== -1, `grammar block ${n} is numbered`);
}
eq('10 numbered blocks + 1 summary heading', (G.match(/<h4/g) || []).length, 11);
ok(/b2g-check/.test(G), 'the closing algorithm uses the B2 check card');

[['active vs passive', 'Компания разработала новый проект.'],
 ['passive counterpart', 'Новый проект был разработан компанией.'],
 ['agentless passive', 'Было принято решение.'],
 ['process passive', 'Проект разрабатывается.'],
 ['official/technical use', 'Новый проект был запущен в январе.'],
 ['automatic processing', 'Данные обрабатываются автоматически.']
].forEach(([label, needle]) => ok(GT.indexOf(needle) !== -1, `grammar keeps: ${label}`));

/* --- REPAIR 1: the role shift, stated in cases --- */
{
    ok(/винительный/.test(GT), 'the active object is named as accusative');
    ok(/именительный/.test(GT), 'the passive subject is named as nominative');
    ok(/творительный падеж/.test(GT), 'the agent is named as instrumental');
    ok(/to‘ldiruvchi/.test(GT) && /ega/.test(GT),
        'the lesson states that the active object becomes the passive subject');
}

/* --- REPAIR 2: three patterns, including the ZERO copula --- */
{
    /* A process */
    ok(GT.indexOf('Система сейчас тестируется.') !== -1, 'process passive taught');
    ok(GT.indexOf('Документы проверяются каждый день.') !== -1, 'regular process taught');
    /* B present result, no copula.
       Scoped to block 4: «Документ подписан.» also appears in block 6's tense
       table, so a whole-document search stayed green even when block 4 was
       gutted — a negative control caught exactly that. */
    const zero = GT.slice(GT.indexOf('4. Настоящее состояние'), GT.indexOf('5. Процесс'));
    ok(zero.length > 150, 'the zero-copula block is present');
    ['Документ подписан.', 'Решение принято.', 'Система установлена.', 'Ошибки исправлены.']
        .forEach(s => ok(zero.indexOf(s) !== -1, `zero-copula result taught in block 4: «${s}»`));
    ok(/bog‘lama/.test(GT) && /yozilmaydi|tushib qoladi/.test(GT),
        'the lesson states that быть is omitted in the present');
    ok(GT.indexOf('Документ есть подписан') !== -1,
        'the ungrammatical «есть подписан» is shown as the ❌ example');
    /* C past and future result */
    ok(GT.indexOf('Документ был подписан вчера.') !== -1, 'past result taught');
    ok(GT.indexOf('Документ будет подписан завтра.') !== -1, 'future result taught');
    ok(GT.indexOf('Документы будут подписаны завтра.') !== -1, 'plural future taught');
    /* agreement family, both auxiliary and participle */
    [['проект', 'разработан'], ['система', 'разработана'],
     ['решение', 'принято'], ['документы', 'подготовлены']
    ].forEach(([subj, part]) => ok(GT.indexOf(subj) !== -1 && GT.indexOf(part) !== -1,
        `agreement family shown: ${subj} → ${part}`));
    ['будет разработан', 'будет разработана', 'будет принято', 'будут подготовлены']
        .forEach(s => ok(GT.indexOf(s) !== -1, `future agreement shown: «${s}»`));
}

/* --- REPAIR 3: «Было принято решение» is word order, NOT impersonality --- */
{
    ok(/shaxssiz emas/.test(GT),
        'the lesson states outright that «Было принято решение» is NOT impersonal');
    ok(/so‘z tartibi/.test(GT), 'and explains it as predicate-first word order');
    ok(/именительный/.test(GT), 'and that «решение» is still a nominative subject');
    /* the paired word-order table proves the identical grammatical core */
    [['Решение было принято.', 'Было принято решение.'],
     ['Система была создана.', 'Была создана система.'],
     ['Правила были разработаны.', 'Были разработаны правила.'],
     ['Договор был подписан.', 'Был подписан договор.']
    ].forEach(([a, b]) => {
        ok(GT.indexOf(a) !== -1, `word-order pair keeps «${a}»`);
        ok(GT.indexOf(b) !== -1, `word-order pair keeps «${b}»`);
    });
    ok(/Было принято решение изменить план/.test(GT),
        'the «Было принято решение + инфинитив» model is taught');
}

/* --- REPAIR 4: -ся is not automatically passive --- */
{
    ok(/har qanday -ся passiv emas/i.test(GT),
        'the lesson denies that every -ся verb is passive');
    ok(/улыбаться/.test(GT) && /бояться/.test(GT) && /надеяться/.test(GT),
        'non-passive -ся verbs are named');
    ok(GT.indexOf('Сотрудники проверяют документы.') !== -1,
        'the active paraphrase test is demonstrated');
    ok(GT.indexOf('Инженеры разрабатывают проект.') !== -1, 'and a second one');
}

/* --- nuance: agent optional, passive not always better, transitivity --- */
ok(/majburiy emas/.test(GT), 'the lesson says naming the agent is optional');
ok(/har doim yaxshiroq degani emas/.test(GT), 'and that passive is not always better');
ok(/o‘timli/.test(GT), 'and that passive belongs to transitive verbs');
ok(GT.indexOf('Компания запустила проект.') !== -1,
    'an active sentence is shown as the more natural choice');

{
    const tables = [...gdoc.querySelectorAll('table.b2g-t')];
    eq('grammar renders its 12 b2g-t tables', tables.length, 12);
    let wide = 0, headless = 0;
    tables.forEach(tb => {
        [...tb.querySelectorAll('tr')].forEach(tr => { if (tr.children.length !== 2) wide++; });
        if (!tb.querySelector('th')) headless++;
    });
    eq('every grammar table row has exactly 2 cells', wide, 0);
    eq('every grammar table has a header row', headless, 0);
}

/* --- MARKUP: block 9 shipped a stray </p> with no opening <p> -------------
   The browser (and JSDOM) repaired it silently, so every DOM-based assertion
   above stayed green. These checks read the RAW authored string instead, so
   they cannot be satisfied by an auto-correcting parser. */
{
    const b9 = G.slice(G.indexOf('<h4>9. '), G.indexOf('<h4>10. '));
    ok(b9.length > 300, `grammar block 9 is present in the raw source (${b9.length} chars)`);
    ok(b9.indexOf('<div class="b2g-warn"><p>') !== -1,
        'block 9 opens its warn card with a real <p>, not a bare text node');
    ok(/<div class="b2g-warn"><p>Passiv <b>mexanik<\/b> yasalmaydi\./.test(b9),
        'block 9 keeps the transitivity paragraph, correctly opened');
    ok(/<p>Shuning uchun /.test(b9), 'block 9 keeps its second paragraph');
    const w9 = b9.match(/<div class="b2g-warn">[\s\S]*?<\/div>/);
    ok(!!w9, 'the block 9 warn card is closed');
    if (w9) {
        eq('block 9 warn card balances its paragraph tags',
            (w9[0].match(/<\/p>/g) || []).length, (w9[0].match(/<p>/g) || []).length);
        eq('block 9 warn card holds exactly 2 paragraphs',
            (w9[0].match(/<p>/g) || []).length, 2);
    }
}

/* --- MARKUP: scoped well-formedness scan over the whole topic 12 grammar --- */
{
    const VOID = { br: 1, hr: 1, img: 1, input: 1 };
    const stack = [];
    let stray = null, mismatch = null, pDepth = 0, pStray = null, pNested = null;
    const re = /<(\/?)([a-z0-9]+)(?:\s[^>]*)?>/gi;
    let m;
    while ((m = re.exec(G)) !== null) {
        const closing = m[1] === '/', tag = m[2].toLowerCase();
        if (VOID[tag]) continue;
        if (tag === 'p') {
            if (closing) {
                if (pDepth === 0) { if (pStray === null) pStray = m.index; } else pDepth--;
            } else {
                if (pDepth > 0 && pNested === null) pNested = m.index;
                pDepth++;
            }
        }
        if (closing) {
            if (stack.length === 0) { if (stray === null) stray = tag; }
            else if (stack[stack.length - 1] !== tag) {
                if (mismatch === null) mismatch = `<${stack[stack.length - 1]}> closed by </${tag}>`;
            } else stack.pop();
        } else stack.push(tag);
    }
    ok(pStray === null,
        `topic 12 grammar never closes a paragraph it did not open${pStray === null ? '' : ` (stray </p> at ${pStray})`}`);
    ok(pNested === null, 'topic 12 grammar never nests <p> inside <p>');
    eq('topic 12 grammar closes every paragraph it opens', pDepth, 0);
    ok(stray === null,
        `topic 12 grammar has no unopened closing tag${stray === null ? '' : ` (</${stray}>)`}`);
    ok(mismatch === null,
        `topic 12 grammar closes its tags in order${mismatch === null ? '' : ` (${mismatch})`}`);
    eq('topic 12 grammar leaves no tag unclosed', stack.length, 0);

    /* a card must open a paragraph before it closes one */
    let lateOpen = 0, cardCount = 0;
    ['b2g-warn', 'b2g-tip', 'b2g-check'].forEach(cls => {
        const open = '<div class="' + cls + '">';
        const found = [...G.matchAll(new RegExp(
            open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([\\s\\S]*?)<\\/div>', 'g'))];
        ok(found.length > 0, `topic 12 grammar still uses .${cls}`);
        found.forEach(c => {
            cardCount++;
            const body = c[1];
            const first = body.indexOf('<p>'), firstClose = body.indexOf('</p>');
            if (firstClose !== -1 && (first === -1 || firstClose < first)) lateOpen++;
        });
    });
    eq('every b2g card in topic 12 was scanned whole', cardCount, 8);
    eq('no b2g card closes a paragraph it never opened', lateOpen, 0);
}

/* -------------------------------------------------------------- exercises */
const ex = t12.exercises || [];
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
eq('1 audio group', ex.filter(g => g.audioSrc).length, 1);
eq('no builder group in this lesson', ex.filter(g => g.type === 'builder').length, 0);

/* -------------------------------------------- openness, observed not assumed */
const NONSENSE = 'зззz яяяy ююю';
const isOpen = (it) => UI.matchItem(it, NONSENSE) === true;
let openCount = 0, detCount = 0, multi = 0, variants = 0;
let missing = 0, junk = 0, badOpt = 0, unmatched = 0, nonsenseAccepted = 0, blankAccepted = 0;

ex.forEach(g => g.items.forEach((it, i) => {
    const where = `${g.id} #${i + 1}`;
    if (isOpen(it)) {
        openCount++;
        if (g.id !== 'ex8') { fail++; failures.push(`${where}: unexpectedly OPEN`); }
        if (it.free !== true) { fail++; failures.push(`${where}: open but not flagged free:true`); }
        if (it.answer !== null) { fail++; failures.push(`${where}: open item carries a key`); }
        if (!UI.matchItem(it, 'Инженерами было создано новое оборудование, которое используется на заводе.')) {
            fail++; failures.push(`${where}: open refuses a meaningful passive answer`);
        }
        if (UI.matchItem(it, 'да')) { fail++; failures.push(`${where}: open accepts one word`); }
        if (UI.matchItem(it, '')) { fail++; failures.push(`${where}: open accepts blank`); }
        return;
    }
    detCount++;
    if (g.id === 'ex8') { fail++; failures.push(`${where}: ex8 must stay open`); }
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

eq('10 genuinely open items', openCount, 10);
eq('100 deterministic items', detCount, 100);
eq('ex8 is open end to end', items('ex8').filter(isOpen).length, 10);
eq('no multi-accept variant was invented', multi, 0);
eq('no deterministic item is missing its key', missing, 0);
eq('no TODO / placeholder in any key', junk, 0);
eq('every choice answer is among its options', badOpt, 0);
eq('the shared scorer accepts every accepted answer', unmatched, 0);
eq('no deterministic item accepts nonsense', nonsenseAccepted, 0);
eq('no item accepts a blank', blankAccepted, 0);

/* the ё/е fold means «создаётся» needs only one scalar key */
ok(UI.matchItem(at('ex3', 2), 'создаётся') && UI.matchItem(at('ex3', 2), 'создается'),
    'the shared normalizer folds ё/е, so ex3 #3 needs no second variant');

/* one sentence is drilled twice by design: ex3 makes the -ся form, ex10 asks
   the learner to CHOOSE which passive type the time marker requires */
{
    const prompts = ex.flatMap(g => g.items.map(i => i.q));
    eq('109 distinct prompts — one sentence serves two different tasks',
        new Set(prompts).size, 109);
    const dup = 'Информация регулярно ______ на сайте. (обновлять)';
    eq('ex3 #4 is the -ся drill', at('ex3', 3).q, dup);
    eq('ex10 #8 reuses it as a type-choice drill', at('ex10', 7).q, dup);
    eq('both expect обновляется', at('ex3', 3).answer, at('ex10', 7).answer);
}

/* ------------------------------------------------------------------- Ex1 */
{
    const KEYS = [
        'Новая система была разработана специалистами.',
        'Важное решение было принято руководством.',
        'Современная технология была создана инженерами.',
        'Документы были подготовлены сотрудниками.',
        'Новый проект был запущен компанией.',
        'Исследование было проведено учёными.',
        'Программа была обновлена программистами.',
        'Проблема была обсуждена менеджерами.',
        'Оборудование было проверено работниками.',
        'Договор был подписан директором.'
    ];
    KEYS.forEach((k, i) => eq(`ex1 #${i + 1} key`, at('ex1', i).answer, k));
    /* the instruction is what makes this deterministic */
    ok(/творительный/.test(grp('ex1').intro), 'ex1 requires the agent in instrumental');
    ok(/OXIRIDA/.test(grp('ex1').intro), 'ex1 fixes the agent at the END of the sentence');
    const PAST = /(^|\s)(был|была|было|были)(\s|$)/;
    ok(items('ex1').every(it => PAST.test(it.answer)), 'every ex1 answer uses past passive');
    const INSTR = /(ами|ями|ыми|ими|ом|ем|ей|ой)\.$/;
    ok(items('ex1').every(it => INSTR.test(it.answer)),
        'every ex1 answer keeps the agent in the instrumental case');
}

/* ------------------------------------------------------------- Ex2 / Ex5 */
{
    const EX2 = ['был', 'была', 'было', 'были', 'была', 'были', 'было', 'были', 'была', 'были'];
    EX2.forEach((k, i) => eq(`ex2 #${i + 1} key`, at('ex2', i).answer, k));
    const EX5 = ['специалистом', 'программистами', 'руководством', 'учёными', 'директором',
                 'компанией', 'рабочими', 'пользователями', 'менеджером', 'сотрудниками'];
    EX5.forEach((k, i) => eq(`ex5 #${i + 1} key`, at('ex5', i).answer, k));
}

/* --------------------------------------------------------------- Ex3 / Ex4 */
{
    const EX3 = ['тестируется', 'проверяются', 'создаётся', 'обновляется', 'проверяется',
                 'обсуждается', 'обрабатываются', 'внедряется', 'рассматриваются', 'тестируется'];
    EX3.forEach((k, i) => eq(`ex3 #${i + 1} key`, at('ex3', i).answer, k));
    ok(EX3.every(k => /(ется|ются|ётся)$/.test(k)), 'every ex3 key is a -ся passive form');
    const EX4 = ['Новый проект был разработан.', 'Система была создана.', 'Решение было принято.',
                 'Документы были проверены.', 'Технология была внедрена.',
                 'Результаты были опубликованы.', 'Оборудование было установлено.',
                 'Проблема была решена.', 'Договор был подписан.',
                 'Новые правила были разработаны.'];
    EX4.forEach((k, i) => eq(`ex4 #${i + 1} key`, at('ex4', i).answer, k));
}

/* ------------------------------- Ex6: the source could not be graded as-is */
{
    const KEYS = ['приняло', 'был разработан компанией', 'тестируют',
                  'были подготовлены сотрудниками', 'внедряется', 'проверяют',
                  'обрабатываются', 'создала', 'были опубликованы', 'обсудили'];
    KEYS.forEach((k, i) => eq(`ex6 #${i + 1} key`, at('ex6', i).answer, k));
    /* SOURCE FIX: «Новый проект разработала компания» and «…был разработан
       компанией» are BOTH grammatical, so every item now names its target voice */
    const VOICES = ['АКТИВ', 'ПАССИВ', 'АКТИВ', 'ПАССИВ', 'ПАССИВ',
                    'АКТИВ', 'ПАССИВ', 'АКТИВ', 'ПАССИВ', 'АКТИВ'];
    VOICES.forEach((v, i) => ok(String(at('ex6', i).q).indexOf('[' + v + ']') === 0,
        `ex6 #${i + 1} opens with its target voice [${v}]`));
    ok(items('ex6').every(it => /^\[(АКТИВ|ПАССИВ)\]/.test(it.q)),
        'no ex6 item is left context-free');
    ok(/залог/.test(grp('ex6').intro), 'ex6 tells the learner the bracket names the voice');
    ok(items('ex6').every(it => (it.options || []).length === 2),
        'every ex6 item offers exactly the two voices');
    ok(items('ex6').every(it => it.options.includes(it.answer)),
        'every ex6 answer is among its options');
    /* the distractor is the OTHER voice, not an ungrammatical form */
    ok(items('ex6').filter(it => /^\[ПАССИВ\]/.test(it.q)).length === 5
       && items('ex6').filter(it => /^\[АКТИВ\]/.test(it.q)).length === 5,
        'ex6 drills both voices five times each');
}

/* ------------------------------------------------------------------- Ex7 */
{
    const KEYS = [
        'Было принято решение открыть новый филиал.',
        'Было принято решение перенести встречу.',
        'Было принято решение изменить стратегию.',
        'Было принято решение обновить оборудование.',
        'Было принято решение запустить новый продукт.',
        'Было принято решение провести дополнительное исследование.',
        'Было принято решение внедрить новую систему.',
        'Было принято решение начать проект в сентябре.',
        'Было принято решение изменить условия работы.',
        'Было принято решение увеличить количество сотрудников.'
    ];
    KEYS.forEach((k, i) => eq(`ex7 #${i + 1} key`, at('ex7', i).answer, k));
    ok(items('ex7').every(it => String(it.answer).indexOf('Было принято решение ') === 0),
        'every ex7 answer uses the target model');
}

/* ------------------------------------------------- Ex8 stays genuinely open */
{
    const STARTS = ['Инженеры создали новое оборудование.', 'Компания разработала программу.',
        'Учёные провели исследование.', 'Специалисты подготовили отчёт.',
        'Программисты создали приложение.', 'Компания внедрила новую систему.',
        'Сотрудники подготовили документы.', 'Руководство разработало новые правила.',
        'Инженеры протестировали технологию.', 'Учёные опубликовали результаты.'];
    STARTS.forEach((s, i) => ok(String(at('ex8', i).q).indexOf(s) === 0,
        `ex8 #${i + 1} keeps the source pair`));
    ok(items('ex8').every(it => /\n/.test(it.q)), 'every ex8 prompt shows both source sentences');
    ok(items('ex8').length === 10
       && items('ex8').every(it => it.free === true && it.answer === null),
        'every ex8 item is free:true with answer:null — no fabricated key');
    ok(/ochiq mashq/.test(grp('ex8').intro), 'ex8 tells the learner it is open');
    ok(/passiv/i.test(grp('ex8').intro), 'ex8 names the passive target');
    /* the reference answers from the brief must all pass the real open matcher */
    const REFERENCE = [
        'Инженерами было создано новое оборудование, которое используется на заводе.',
        'Компанией была разработана программа, которая помогает сотрудникам.',
        'Учёными было проведено исследование, которое показало интересные результаты.',
        'Специалистами был подготовлен отчёт, который был представлен директору.',
        'Программистами было создано приложение, которое используется клиентами.',
        'Компанией была внедрена новая система, которая ускоряет работу.',
        'Сотрудниками были подготовлены документы, которые были отправлены партнёрам.',
        'Руководством были разработаны новые правила, которые применяются с января.',
        'Инженерами была протестирована технология, которая используется на производстве.',
        'Учёными были опубликованы результаты, которые были представлены на конференции.'
    ];
    let refOk = 0;
    REFERENCE.forEach((r, i) => { if (UI.matchItem(at('ex8', i), r)) refOk++; });
    eq('every reference passive answer is accepted by the open matcher', refOk, 10);
}

/* ------------------------------- Ex9: every prompt must really be wrong --- */
{
    const PAIRS = [
        ['Новый проект была запущен компанией.', 'Новый проект был запущен компанией.'],
        ['Документы был подготовлены сотрудниками.', 'Документы были подготовлены сотрудниками.'],
        ['Новая технология были внедрена на предприятии.', 'Новая технология была внедрена на предприятии.'],
        ['Решение была принято руководством.', 'Решение было принято руководством.'],
        ['Все данные был обработаны системой.', 'Все данные были обработаны системой.'],
        ['Новые правила было разработаны специалистами.', 'Новые правила были разработаны специалистами.'],
        ['Программа были протестирована пользователями.', 'Программа была протестирована пользователями.'],
        ['Оборудование была установлено инженерами.', 'Оборудование было установлено инженерами.'],
        ['Результаты исследования было опубликованы вчера.', 'Результаты исследования были опубликованы вчера.'],
        ['Важные документы были подписан директором.', 'Важные документы были подписаны директором.']
    ];
    PAIRS.forEach(([q, a], i) => {
        eq(`ex9 #${i + 1} prompt`, at('ex9', i).q, q);
        eq(`ex9 #${i + 1} correction`, at('ex9', i).answer, a);
    });
    let same = 0, accepted = 0;
    items('ex9').forEach(it => {
        if (String(it.answer).trim() === String(it.q).trim()) same++;
        if (UI.matchItem(it, it.q)) accepted++;
    });
    eq('every ex9 prompt really differs from its correction', same, 0);
    eq('the scorer refuses every malformed ex9 prompt', accepted, 0);
}

/* --------------------------- Ex10: the added tenth exercise, four types --- */
{
    const PAIRS = [
        ['В прошлом году проект ______. (разработать)', 'был разработан'],
        ['Сейчас новая версия ______ пользователями. (тестировать)', 'тестируется'],
        ['Завтра документы ______ руководителем. (подписать)', 'будут подписаны'],
        ['Решение уже ______. (принять)', 'принято'],
        ['Данные каждый день ______ автоматически. (обрабатывать)', 'обрабатываются'],
        ['На следующей неделе новая функция ______. (запустить)', 'будет запущена'],
        ['Оборудование вчера ______ в цехе. (установить)', 'было установлено'],
        ['Информация регулярно ______ на сайте. (обновлять)', 'обновляется'],
        ['Результаты ______ к пятнице. (опубликовать)', 'будут опубликованы'],
        ['Ошибка уже ______. (исправить)', 'исправлена']
    ];
    PAIRS.forEach(([q, a], i) => {
        eq(`ex10 #${i + 1} prompt`, at('ex10', i).q, q);
        eq(`ex10 #${i + 1} key`, at('ex10', i).answer, a);
    });
    ok(items('ex10').length === 10, 'ex10 exists — the source stopped at nine exercises');
    ok(items('ex10').every(it => it.free !== true), 'ex10 is fully deterministic');
    /* it must drill all FOUR distinctions the repaired grammar separates */
    const keys = items('ex10').map(it => String(it.answer));
    ok(keys.some(k => /^был|^было/.test(k)), 'ex10 drills the PAST result');
    ok(keys.some(k => /^будет|^будут/.test(k)), 'ex10 drills the FUTURE result');
    ok(keys.some(k => /(ется|ются)$/.test(k)), 'ex10 drills the -ся PROCESS');
    ok(keys.some(k => k === 'принято' || k === 'исправлена'),
        'ex10 drills the PRESENT result with zero copula');
    /* the zero-copula keys must NOT smuggle in an auxiliary */
    ['принято', 'исправлена'].forEach(k => ok(keys.indexOf(k) !== -1
        && !/был|была|было|были|будет|будут/.test(k),
        `the present-result key «${k}» carries no copula`));
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
    ok(/%D0%912%2012%20%D1%83%D1%80%D0%BE%D0%BA\.mp3/.test(a.audioSrc),
        'audioSrc points at "Б2 12 урок.mp3"');
    eq('audioSrc decodes to the exact path', decodeURIComponent(a.audioSrc), 'audios/Б2 12 урок.mp3');
    ok(fs.existsSync(path.join(ROOT, 'audios', 'Б2 12 урок.mp3')), 'the audio file exists on disk');
    ok(!/%D0%912%20(?:[6-9]|10|11)%20/.test(a.audioSrc),
        'topic 12 does not point at an earlier recording');
    ok(a.intro.indexOf('«Как создаётся современный продукт?»') !== -1,
        'the recording keeps its source title, question mark included');

    const STATEMENTS = [
        'Сначала проводится исследование рынка и анализируются потребности клиентов.',
        'Сначала продукт сразу запускается без предварительной проверки.',
        'Специалистами создаётся первый вариант продукта.',
        'Перед запуском продукт не тестируется.',
        'Найденные во время тестирования ошибки исправляются.',
        'После запуска продукт больше никогда не обновляется.',
        'Новые функции могут добавляться после запуска продукта.',
        'Отзывы пользователей анализируются при совершенствовании продукта.',
        'Современные мобильные приложения никогда не изменяются.',
        'В описании рабочих и технологических процессов часто используются пассивные конструкции.'
    ];
    STATEMENTS.forEach((s, i) => eq(`audio statement ${i + 1} is the source text`, at('audio1', i).q, s));
    eq('audio answers follow the source truth values', a.items.map(i => i.answer).join(','),
        'Правда,Ложь,Правда,Ложь,Правда,Ложь,Правда,Правда,Ложь,Правда');
    /* SOURCE FIX: the source labelled the buttons Правда / Неправда */
    ok(a.items.every(it => it.options.join(',') === 'Правда,Ложь'),
        'every statement offers the B2 Правда / Ложь labels');
    const blob = JSON.stringify(a);
    ['Неправда', 'Верно', 'Неверно'].forEach(bad => ok(blob.indexOf('"' + bad + '"') === -1,
        `«${bad}» is not used as an answer button`));
    /* the source said "Matnga asoslanib" but supplied only audio */
    ok(/tinglang/i.test(a.intro), 'the audio task tells the learner to LISTEN');
    ok(!/Matnga asoslanib|Matn asosida|o‘qing|прочитайте/i.test(a.intro),
        'the audio task never tells the learner to read a text');
    ok(!a.passage, 'no transcript was fabricated');
}

/* ------------------------------------------------- vocabulary (paid only) */
{
    const s = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-vocabulary.html'), 'utf8');
    const i12 = s.indexOf('                    id: 12,');
    ok(i12 > -1, 'paid vocabulary has topic 12');
    const i13 = s.indexOf('                    id: 13,', i12);
    const seg = s.slice(s.lastIndexOf('{', i12),
        i13 > -1 ? s.lastIndexOf('{', i13) : s.indexOf('generateLockedTopics('));
    const cards = [...seg.matchAll(/\{ ru: "([^"]+)", uz: "([^"]+)" \}/g)].map(m => [m[1], m[2]]);
    const card = (i) => (cards[i] || [])[0];
    eq('paid vocabulary topic 12 has all 69 cards', cards.length, 69);
    ok(/name: "Пассивные конструкции"/.test(seg), 'paid vocabulary topic 12 is this lesson');
    ok(/isLocked: false/.test(seg), 'paid vocabulary topic 12 is unlocked');
    eq('69 unique Russian units', new Set(cards.map(c => c[0])).size, 69);
    eq('no duplicate card', new Set(cards.map(c => c.join('|'))).size, 69);
    ok(cards.every(c => String(c[0]).trim() && String(c[1]).trim()), 'no empty card');
    eq('first card', card(0), 'разрабатывать');
    eq('last card', card(68), 'Документы были подписаны руководством.');
    /* SOURCE FIX: the numbered source list contains «проверять» twice */
    eq('«проверять» ships exactly once', cards.filter(c => c[0] === 'проверять').length, 1);
    /* legitimately distinct pairs must NOT be collapsed */
    [['обновление', 'обновление системы'], ['результат', 'результаты'],
     ['разрабатывать', 'разработать'], ['создавать', 'создать']
    ].forEach(([a, b]) => ok(cards.some(c => c[0] === a) && cards.some(c => c[0] === b),
        `«${a}» and «${b}» both ship — they are distinct units`));
    /* the source's ten ready constructions are learner cards too */
    eq('the ten ready passive constructions ship as cards',
        cards.filter(c => /^[А-ЯЁ].*[.…]$/.test(c[0])).length, 10);

    const authored = [...s.matchAll(/\n                    id: (\d+),/g)].map(m => Number(m[1]));
    const vFrontier = Math.max.apply(null, authored);
    ok(authored.indexOf(12) !== -1 && vFrontier >= 12,
        'topic 12 is an authored (unlocked) vocabulary deck');
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
    ok(!/generateLockedTopics\(12\)/.test(s), 'no stale generateLockedTopics(12) remains');

    const demo = fs.readFileSync(path.join(ROOT, 'b2-demo-vocabulary.html'), 'utf8');
    ok(!/                    id: 12,/.test(demo), 'demo vocabulary untouched (no topic 12)');
    ok(!/Пассивные конструкции/.test(demo), 'topic 12 did not leak into the demo deck');
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
        const t = list.find(x => x.id === 12);
        const soonId = frontier + 1;
        const next = list.find(x => x.id === soonId);
        ok(t.grammar.length > 6000, `${mode}: topic 12 carries the real grammar`);
        ok(!t.content, `${mode}: topic 12 is a real lesson, not a coming-soon shell`);
        eq(`${mode}: topic 12 serves 11 exercise groups`,
            (w.eval('b2ExerciseData(12)') || { exercises: [] }).exercises.length, 11);
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
        if (mode === 'paid') ok(t.isLocked === false, 'paid: topic 12 is available');
        else {
            ok(t.isLocked === true, 'demo: topic 12 stays behind the paywall');
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
    /* The lesson pipeline must stay a lesson pipeline. Scoped to the window
       around buildB2Topics, exactly as topics 6-10 scope it: the B2 final exam
       and certificate now ship as their own page and their own entry card at
       the bottom of the course, so a whole-file scan would assert the absence
       of a feature that deliberately exists. What must never appear is exam or
       certificate code INSIDE the topic builder. */
    const near = c.slice(c.indexOf('function buildB2Topics'), c.indexOf('function buildB2Topics') + 3000);
    ok(!/finalExam|certificate/i.test(near),
        'no exam or certificate logic leaked into the B2 topic builder');
    /* the hardened progression path must remain */
    /* B2 reports the EXERCISES HALF now — complete-topic finalises only what
       the component record earns, so the old whole-topic claim could never
       append and B2 topics never completed. The property that matters is
       unchanged: the server's answer is awaited and adopted, never assumed. */
    ok(/const ack = await window\.completeCourseComponent\(B2_COURSE, topicId, 'exercises'\)/.test(c),
        'B2 completion reports the exercises half');
    ok(/const authoritative = ack\.completedTopics;/.test(c),
        'B2 completion still awaits the authoritative server result');
    ok(/ack\.components\.exercisesCompleted !== true/.test(c),
        'and refuses a reply that is not shaped like a verdict');
}

/* ------------------------------------------------------------------ report */
console.log('='.repeat(60));
if (fail === 0) {
    console.log(`  ✅ B2 TOPIC 12: ${pass}/${pass} passed`
        + `  (open ${openCount} · deterministic ${detCount} · multi ${multi}`
        + ` · accepted variants ${variants})`);
} else {
    console.log(`  ❌ B2 TOPIC 12: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
}
console.log('='.repeat(60) + '\n');
process.exit(fail === 0 ? 0 : 1);
