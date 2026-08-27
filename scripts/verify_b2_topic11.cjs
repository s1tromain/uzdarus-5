#!/usr/bin/env node
/**
 * verify_b2_topic11.cjs — B2 Lesson 11 «Отглагольные существительные».
 *
 * The source needed four substantive repairs, each pinned here so it cannot
 * silently return:
 *
 *  1. Its suffix taxonomy was wrong — it filed «анализ» with -ция forms and
 *     presented «принятие» as an ordinary -ение derivation. Nominalization is
 *     taught as LEXICAL FAMILIES, not a mechanical suffix rule.
 *  2. It implied one noun maps to one aspect; a single noun serves the whole
 *     aspect pair (решать/решить → решение).
 *  3. Its government heading was malformed and it never showed a non-genitive
 *     model; «подготовка к экзамену» is now taught.
 *  4. Its Ex9 called grammatical infinitive clauses errors. «Принимать решения
 *     было сложно» is correct Russian, so that set was replaced with ten real
 *     government/agreement errors.
 *
 * Ex8 stays genuinely open: many formal rewrites are correct, so no key is
 * invented. Openness is OBSERVED through the product's own matchItem().
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

console.log('\n=== B2 TOPIC 11 — Отглагольные существительные ===');

/* ------------------------------------------------------------ data presence */
const all = w.B2_LESSON_DATA.topics;
[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].forEach(id =>
    ok(!!all.find(t => t.id === id), `topic ${id} still present`));
const t11 = all.find(t => t.id === 11);
ok(!!t11, 'topic 11 exists');
if (!t11) { console.log('missing lesson 11'); process.exit(1); }
eq('topic 11 appears exactly once', all.filter(t => t.id === 11).length, 1);
eq('topic 11 title', t11.title, 'Отглагольные существительные');
ok(t11.isLocked === false && t11.isSubscriptionLocked === false, 'topic 11 ships unlocked');

const syll = w.B2_TOPICS;
eq('B2 syllabus still has 16 topics', syll.length, 16);
eq('syllabus and lesson agree on the topic 11 title',
    (syll.find(t => t.id === 11) || {}).title, t11.title);
eq('topic 12 keeps its canonical title',
    (syll.find(t => t.id === 12) || {}).title, 'Пассивные конструкции');

const ids = all.map(t => t.id).sort((a, b) => a - b);
const frontier = ids[ids.length - 1];
ok(ids.join(',') === Array.from({ length: frontier }, (_, i) => i + 1).join(','),
    `authored lesson ids are contiguous 1..${frontier}`);
ok(frontier >= 11, `topic 11 is authored (frontier ${frontier})`);
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
const G = t11.grammar || '';
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

[['verb vs noun', 'Решение проблемы требует времени.'],
 ['-ние family', 'обсуждение'],
 ['-тие family', 'разви'],
 ['-ка family', 'разработ'],
 ['-ция family', 'организа'],
 ['formal register', 'Развитие проекта является приоритетным направлением.'],
 ['frequent construction', 'Принятие решения заняло несколько дней.']
].forEach(([label, needle]) => ok(GT.indexOf(needle) !== -1, `grammar keeps: ${label}`));

/* --- REPAIR 1: nominalization is lexical, not a mechanical suffix rule --- */
{
    ok(/mexanik ravishda qo‘shish bilan yasalmaydi/.test(GT),
        'the grammar states outright that the noun is NOT formed mechanically');
    ok(/leksik/i.test(GT), 'and names these as lexical families');
    /* «анализ» must NOT be filed under the -ция table */
    const dStart = G.indexOf('<b>D. -ция</b>');
    const dEnd = G.indexOf('b2g-warn', dStart);
    ok(dStart > -1 && dEnd > dStart, 'the -ция block exists');
    const dBlock = G.slice(dStart, dEnd);
    ok(dBlock.indexOf('анализ') === -1,
        '«анализ» is NOT presented as an example of the suffix -ция');
    /* it belongs with the non-transparent lexical pairs instead */
    const eStart = G.indexOf('E. Leksik');
    ok(eStart > -1 && G.slice(eStart, eStart + 500).indexOf('анализ') !== -1,
        '«анализ» is taught as a lexical / non-transparent pair');
    ok(/-ировать.{0,80}-ция.{0,60}bermaydi/.test(GT),
        'the lesson denies that every -ировать verb yields a -ция noun');
    ok(GT.indexOf('информировать') === -1,
        'the source\'s «информировать → информация» suffix rule is not reproduced');
    /* «принятие» must be shown as -тие with a stem change, not plain -ение */
    ok(/приня/.test(G) && /-тие/.test(GT), '«принятие» is filed with -тие');
    ok(/o‘zak o‘zgaradi/.test(GT), 'and the stem change is called out');
}

/* --- REPAIR 2: one noun serves the whole aspect pair --- */
{
    ['решать / решить проблему', 'обсуждать / обсудить вопрос',
     'создавать / создать продукт', 'принимать / принять решение',
     'организовывать / организовать мероприятие'
    ].forEach(pair => ok(GT.indexOf(pair) !== -1, `aspect pair taught: «${pair}»`));
    ok(/butun vid juftligiga/.test(GT),
        'the lesson says one noun corresponds to the whole aspect pair');
}

/* --- REPAIR 3: government, genitive AND non-genitive --- */
{
    ok(GT.indexOf('ИМЕНА СУЩЕСТВИТЕЛЬНОЕ') === -1,
        'the source\'s malformed heading is gone');
    ok(/зависимое существительное/i.test(GT), 'the corrected heading is used');
    ok(/винительный/.test(GT) && /родительный/.test(GT),
        'the accusative → genitive shift is shown');
    ok(/решение <b>чего\?<\/b> проблем<b>ы<\/b>/.test(G) || /решение чего\? проблемы/.test(GT),
        'the genitive question is demonstrated');
    ok(/подготовка/.test(GT) && /к экзамену/.test(GT),
        'a NON-genitive government model is taught (подготовка к экзамену)');
    ok(/har doim родительный emas/i.test(GT) || /Lekin har doim/.test(GT),
        'the lesson says genitive is not universal');
}

/* --- REPAIR 4: an infinitive construction is not an error --- */
{
    ok(/Infinitiv konstruksiya — xato emas/.test(GT),
        'the grammar states that infinitive constructions are not errors');
    ['Решать сложные проблемы трудно.', 'Принимать решения иногда нелегко.',
     'Изменять систему необходимо.'
    ].forEach(s => ok(GT.indexOf(s) !== -1, `grammatical infinitive example kept: «${s}»`));
    ok(/uslub/.test(GT), 'nominalization is framed as register/style, not correctness');
}

/* --- agreement block, required because the source had an agreement bug --- */
{
    ok(/Организация мероприятия <b>потребовала<\/b>/.test(G)
       || /Организация мероприятия потребовала/.test(GT),
        'the agreement block teaches «организация … потребовала»');
    ok(/Анализ ситуации/.test(GT) && /показал/.test(GT), 'and «анализ … показал»');
    ok(/потребовало/.test(GT), 'the wrong agreement is shown as the ❌ example');
}
/* --- register nuance --- */
ok(/haddan ortiq/.test(GT), 'the lesson warns against excessive nominalization');
ok(/важное решение/.test(GT), '«решение» is disambiguated (process vs decision)');

{
    const tables = [...gdoc.querySelectorAll('table.b2g-t')];
    eq('grammar renders its 15 b2g-t tables', tables.length, 15);
    let wide = 0, headless = 0;
    tables.forEach(tb => {
        [...tb.querySelectorAll('tr')].forEach(tr => { if (tr.children.length !== 2) wide++; });
        if (!tb.querySelector('th')) headless++;
    });
    eq('every grammar table row has exactly 2 cells', wide, 0);
    eq('every grammar table has a header row', headless, 0);
}

/* --- MARKUP: block 2 shipped a stray </p> with no opening <p> --------------
   The browser (and JSDOM) repaired it silently, so every DOM-based assertion
   in this file stayed green while the authored string was malformed. These
   checks read the RAW authored string, so an auto-correcting parser cannot
   satisfy them. */
{
    const b2 = G.slice(G.indexOf('<h4>2. '), G.indexOf('<h4>3. '));
    ok(b2.length > 300, `grammar block 2 is present in the raw source (${b2.length} chars)`);
    ok(b2.indexOf('<div class="b2g-warn"><p><b>Muhim:</b>') !== -1,
        'block 2 opens its warn card with a real <p>, not a bare text node');
    const w2 = b2.match(/<div class="b2g-warn">[\s\S]*?<\/div>/);
    ok(!!w2, 'the block 2 warn card is closed');
    if (w2) {
        const pOpen = w2[0].indexOf('<p>'), pClose = w2[0].indexOf('</p>'), tbl = w2[0].indexOf('<table');
        ok(pOpen !== -1 && pClose > pOpen && pClose < tbl,
            'block 2 closes its first paragraph BEFORE the table opens');
        eq('block 2 warn card balances its paragraph tags',
            (w2[0].match(/<\/p>/g) || []).length, (w2[0].match(/<p>/g) || []).length);
        eq('block 2 warn card holds exactly 2 paragraphs',
            (w2[0].match(/<p>/g) || []).length, 2);
        ok(/<p><b>Muhim:<\/b> отглагольное существительное/.test(w2[0]),
            'block 2 keeps its lead paragraph text, correctly opened');
        ok(/<p>Shuning uchun /.test(w2[0]), 'block 2 keeps its closing paragraph');
    }
}

/* --- MARKUP: raw well-formedness over the whole topic 11 grammar ---------- */
{
    const VOID = { br: 1, hr: 1, img: 1, input: 1, meta: 1, link: 1, source: 1,
                   col: 1, area: 1, base: 1, embed: 1, param: 1, track: 1, wbr: 1 };
    const stack = [];
    let pDepth = 0, stray = null, nested = null, unopened = null, order = null;
    const re = /<(\/?)([a-z0-9]+)(?:\s[^>]*)?>/gi;
    let m;
    while ((m = re.exec(G)) !== null) {
        const closing = m[1] === '/', tag = m[2].toLowerCase();
        if (VOID[tag]) continue;
        if (tag === 'p') {
            if (closing) { if (pDepth === 0) { if (stray === null) stray = m.index; } else pDepth--; }
            else { if (pDepth > 0 && nested === null) nested = m.index; pDepth++; }
        }
        if (closing) {
            if (!stack.length) { if (unopened === null) unopened = tag; }
            else if (stack[stack.length - 1] !== tag) {
                if (order === null) order = `<${stack[stack.length - 1]}> closed by </${tag}>`;
            } else stack.pop();
        } else stack.push(tag);
    }
    ok(stray === null,
        `topic 11 grammar never closes a paragraph it did not open${stray === null ? '' : ` (stray </p> at ${stray})`}`);
    ok(nested === null, 'topic 11 grammar never nests <p> inside <p>');
    eq('topic 11 grammar closes every paragraph it opens', pDepth, 0);
    ok(unopened === null,
        `topic 11 grammar has no unopened closing tag${unopened === null ? '' : ` (</${unopened}>)`}`);
    ok(order === null,
        `topic 11 grammar closes its tags in order${order === null ? '' : ` (${order})`}`);
    eq('topic 11 grammar leaves no tag unclosed', stack.length, 0);
    ['p', 'div', 'table', 'tr', 'th', 'td', 'h4', 'b', 'ul', 'li', 'span'].forEach(t => {
        const o = (G.match(new RegExp('<' + t + '(?=[ >])', 'g')) || []).length;
        const c = (G.match(new RegExp('</' + t + '>', 'g')) || []).length;
        eq(`topic 11 grammar balances <${t}>`, c, o);
    });
}

/* -------------------------------------------------------------- exercises */
const ex = t11.exercises || [];
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
        if (!UI.matchItem(it, 'развитие проекта является приоритетом компании')) {
            fail++; failures.push(`${where}: open refuses a meaningful formal rewrite`);
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
eq('no invented multi-accept variant', multi, 0);
eq('no deterministic item is missing its key', missing, 0);
eq('no TODO / placeholder in any key', junk, 0);
eq('every choice answer is among its options', badOpt, 0);
eq('the shared scorer accepts every accepted answer', unmatched, 0);
eq('no deterministic item accepts nonsense', nonsenseAccepted, 0);
eq('no item accepts a blank', blankAccepted, 0);

/* the source itself reuses one sentence for recognition (ex3) and production
   (ex7); both come from the supplied lesson and agree on the answer */
{
    const prompts = ex.flatMap(g => g.items.map(i => i.q));
    eq('109 distinct prompts — the source reuses one sentence in ex3 and ex7',
        new Set(prompts).size, 109);
    const dup = '______ ситуации показал необходимость изменений.';
    eq('the reused sentence is the source\'s анализ item', at('ex3', 3).q, dup);
    eq('and ex7 asks for the same noun', at('ex7', 4).q, dup);
    eq('both expect «Анализ»', at('ex3', 3).answer, at('ex7', 4).answer);
}

/* --------------------------------------------------------- Ex1 / Ex2 / Ex5 */
{
    const EX1 = ['развитие', 'принятие', 'обсуждение', 'создание', 'изменение',
                 'организация', 'анализ', 'использование', 'планирование', 'исследование'];
    EX1.forEach((k, i) => eq(`ex1 #${i + 1} key`, at('ex1', i).answer, k));
    const EX2 = ['развитие проекта', 'решение проблемы', 'обсуждение вопроса',
                 'создание программы', 'анализ ситуации', 'планирование работы',
                 'организация мероприятия', 'изменение системы',
                 'использование технологий', 'исследование рынка'];
    EX2.forEach((k, i) => eq(`ex2 #${i + 1} key`, at('ex2', i).answer, k));
    const EX5 = ['развитие проекта', 'решение проблемы', 'обсуждение вопроса',
                 'создание программы', 'анализ ситуации', 'изменение системы',
                 'использование технологии', 'подготовка мероприятия',
                 'исследование рынка', 'планирование работы'];
    EX5.forEach((k, i) => eq(`ex5 #${i + 1} key`, at('ex5', i).answer, k));
    /* the source cue for #7 is singular «технология» — do not silently pluralise */
    eq('ex5 #7 keeps the singular source cue', at('ex5', 6).answer, 'использование технологии');
}

/* ------------------------------------------------------------------- Ex3 */
{
    const KEYS = ['Принятие', 'Решение', 'Создание', 'Анализ', 'Обсуждение',
                  'Изменение', 'Подготовка', 'Использование', 'Развитие', 'Анализ'];
    KEYS.forEach((k, i) => eq(`ex3 #${i + 1} key`, at('ex3', i).answer, k));
    ok(items('ex3').every(it => (it.options || []).length === 3),
        'every ex3 item offers three options');
    ok(items('ex3').every(it => it.options.includes(it.answer)),
        'every ex3 answer is among its options');
    /* the distractors must be verb forms, i.e. genuinely wrong here */
    ok(items('ex3').every(it => it.options.filter(o => o !== it.answer)
        .every(o => /ть$|ет$|ёт$|ает$|ит$/.test(o))),
        'every ex3 distractor is a verb form, not another noun');
}

/* --------------------------------- Ex4, including the repaired agreement --- */
{
    const KEYS = ['Решение', 'Принятие', 'Обсуждение', 'Создание', 'Анализ',
                  'Изменение', 'Использование', 'Планирование', 'Организация', 'Исследование'];
    KEYS.forEach((k, i) => eq(`ex4 #${i + 1} key`, at('ex4', i).answer, k));
    /* SOURCE FIX: «организация» is feminine — the source wrote «потребовало» */
    eq('ex4 #9 uses the correct feminine agreement', at('ex4', 8).q,
        '(организовать) ______ мероприятия потребовала много усилий.');
    ok(String(at('ex4', 8).q).indexOf('потребовало') === -1,
        'ex4 #9 no longer carries the source\'s agreement error');
}

/* ------------------------------------- Ex6, including the two repairs ----- */
{
    const KEYS = ['Создание новой системы', 'Решение этой проблемы', 'Принятие важного решения',
                  'Анализ ситуации', 'Обсуждение этого вопроса',
                  'Использование современных технологий', 'Разработка новой стратегии',
                  'Подготовка мероприятия', 'Исследование нового метода',
                  'Изменение системы работы'];
    KEYS.forEach((k, i) => eq(`ex6 #${i + 1} key`, at('ex6', i).answer, k));
    /* SOURCE FIX: «планирует новую стратегию» → «разрабатывает новую стратегию»,
       which is the collocation the source vocabulary itself teaches */
    ok(/разрабатывает новую стратегию/.test(at('ex6', 6).q),
        'ex6 #7 uses the natural collocation «разрабатывать стратегию»');
    ok(String(at('ex6', 6).q).indexOf('планирует новую стратегию') === -1,
        'the awkward source collocation is gone');
    /* SOURCE FIX: «рабочую систему» → «систему работы» */
    ok(/систему работы/.test(at('ex6', 9).q), 'ex6 #10 uses «систему работы»');
    ok(String(at('ex6', 9).q).indexOf('рабочую систему') === -1,
        'the awkward source wording is gone');
    ok(items('ex6').every(it => /\n→ /.test(it.q)),
        'every ex6 prompt shows the fixed second half after the arrow');
}

/* ------------------------------------------------------------------- Ex7 */
{
    const KEYS = ['Решение', 'Принятие', 'Обсуждение', 'Создание', 'Анализ',
                  'Изменение', 'Использование', 'Подготовка', 'Исследование', 'Развитие'];
    KEYS.forEach((k, i) => eq(`ex7 #${i + 1} key`, at('ex7', i).answer, k));
    eq('every word-bank noun is used exactly once', new Set(KEYS).size, 10);
    const BANK = ['развитие', 'решение', 'принятие', 'обсуждение', 'создание',
                  'анализ', 'изменение', 'использование', 'подготовка', 'исследование'];
    BANK.forEach(b => ok(String(grp('ex7').intro).toLowerCase().indexOf(b) !== -1,
        `ex7 lists «${b}» in its word bank`));
    ok(/BIR MARTA/.test(grp('ex7').intro), 'ex7 states the one-use rule');
}

/* ------------------------------------------------- Ex8 stays genuinely open */
{
    const PROMPTS = ['Мы развиваем проект.', 'Мы обсуждаем новый план.',
        'Компания создаёт новую программу.', 'Специалисты анализируют данные.',
        'Руководство изменяет систему.', 'Мы используем новые технологии.',
        'Команда готовит презентацию.', 'Учёные исследуют проблему.',
        'Сотрудники планируют работу.', 'Руководство принимает решение.'];
    PROMPTS.forEach((p, i) => eq(`ex8 #${i + 1} keeps the source prompt`, at('ex8', i).q, p));
    ok(items('ex8').length === 10 && items('ex8').every(it => it.free === true && it.answer === null),
        'every ex8 item is free:true with answer:null — no fabricated key');
    ok(/ochiq mashq/.test(grp('ex8').intro), 'ex8 tells the learner it is open');
    ok(/rasmiy/.test(grp('ex8').intro), 'ex8 names the formal-register target');
    ok(items('ex8').every(it => typeof it.placeholder === 'string' && it.placeholder.trim()),
        'ex8 shows a writing placeholder');
}

/* ------------------------------- Ex9: every prompt must really be wrong --- */
{
    const PAIRS = [
        ['Решение проблема требует опыта.', 'Решение проблемы требует опыта.'],
        ['Принятие решение заняло много времени.', 'Принятие решения заняло много времени.'],
        ['Обсуждение вопрос продолжалось долго.', 'Обсуждение вопроса продолжалось долго.'],
        ['Создание нового проекта требуют финансирования.', 'Создание нового проекта требует финансирования.'],
        ['Анализ ситуации показало несколько ошибок.', 'Анализ ситуации показал несколько ошибок.'],
        ['Изменение системе необходимо.', 'Изменение системы необходимо.'],
        ['Использование современные технологии повышает эффективность.', 'Использование современных технологий повышает эффективность.'],
        ['Планирование работы занимают несколько дней.', 'Планирование работы занимает несколько дней.'],
        ['Организация мероприятие потребовала много усилий.', 'Организация мероприятия потребовала много усилий.'],
        ['Исследование рынка продолжают уже несколько месяцев.', 'Исследование рынка продолжается уже несколько месяцев.']
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
    /* SOURCE FIX: grammatical infinitive clauses must NOT be treated as errors */
    const blob = JSON.stringify(byId.ex9);
    ['Принимать решения было сложно', 'Изменять системы необходимо',
     'Планировать работы оказалось сложным', 'Организовать мероприятия потребовало'
    ].forEach(s => ok(blob.indexOf(s) === -1,
        `the grammatical infinitive row «${s.slice(0, 34)}…» is not presented as an error`));
}

/* ------------------------------------------- Ex10, the added tenth exercise */
{
    const PAIRS = [
        ['strategiya ishlab chiqish', 'разработка стратегии'],
        ['maqsadga erishish', 'достижение цели'],
        ['sifatni yaxshilash', 'улучшение качества'],
        ['samaradorlikni oshirish', 'повышение эффективности'],
        ['xarajatlarni kamaytirish', 'снижение расходов'],
        ['daromadlarni oshirish', 'увеличение доходов'],
        ['imkoniyatlarni kengaytirish', 'расширение возможностей'],
        ['ma’lumot olish', 'получение информации'],
        ['bilimlarni qo‘llash', 'применение знаний'],
        ['natijalarni baholash', 'оценка результатов']
    ];
    PAIRS.forEach(([q, a], i) => {
        eq(`ex10 #${i + 1} prompt`, at('ex10', i).q, q);
        eq(`ex10 #${i + 1} key`, at('ex10', i).answer, a);
    });
    ok(items('ex10').length === 10, 'ex10 exists — the source stopped at nine exercises');
    ok(items('ex10').every(it => it.free !== true), 'ex10 is fully deterministic');
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
    ok(/%D0%912%2011%20%D1%83%D1%80%D0%BE%D0%BA\.mp3/.test(a.audioSrc),
        'audioSrc points at "Б2 11 урок.mp3"');
    eq('audioSrc decodes to the exact path', decodeURIComponent(a.audioSrc), 'audios/Б2 11 урок.mp3');
    ok(fs.existsSync(path.join(ROOT, 'audios', 'Б2 11 урок.mp3')), 'the audio file exists on disk');
    ok(!/%D0%912%20(?:[6-9]|10)%20/.test(a.audioSrc),
        'topic 11 does not point at an earlier recording');
    ok(a.intro.indexOf('«Развитие нового проекта»') !== -1,
        'the recording is named by its source title «Развитие нового проекта»');

    const STATEMENTS = [
        'Современный проект требует только хорошей идеи.',
        'В начале работы команда проводит анализ ситуации.',
        'Команда не обсуждает план проекта.',
        'Принятие решений является важной частью работы над проектом.',
        'Руководитель должен учитывать возможные риски.',
        'Решение проблемы всегда требует только одного варианта.',
        'Для успешной работы могут использоваться современные технологии.',
        'Команда регулярно оценивает результаты своей работы.',
        'Если первоначальный план не работает, стратегию нельзя изменить.',
        'Успех проекта зависит от эффективного сотрудничества команды.'
    ];
    STATEMENTS.forEach((s, i) => eq(`audio statement ${i + 1} is the source text`, at('audio1', i).q, s));
    eq('audio answers follow the source truth values', a.items.map(i => i.answer).join(','),
        'Ложь,Правда,Ложь,Правда,Правда,Ложь,Правда,Правда,Ложь,Правда');
    ok(a.items.every(it => it.options.join(',') === 'Правда,Ложь'),
        'every statement offers the B2 Правда / Ложь labels');
    const blob = JSON.stringify(a);
    ['Верно', 'Неверно'].forEach(bad => ok(blob.indexOf('"' + bad + '"') === -1,
        `«${bad}» is not used as an answer button`));
    /* the source said "Matn asosida" but supplied only audio */
    ok(/tinglang/i.test(a.intro), 'the audio task tells the learner to LISTEN');
    ok(!/Matn asosida|Matn bo‘yicha|o‘qing|прочитайте/i.test(a.intro),
        'the audio task never tells the learner to read a text');
    ok(!a.passage, 'no transcript was fabricated');
}

/* ------------------------------------------------- vocabulary (paid only) */
{
    const s = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-vocabulary.html'), 'utf8');
    const i11 = s.indexOf('                    id: 11,');
    ok(i11 > -1, 'paid vocabulary has topic 11');
    const i12 = s.indexOf('                    id: 12,', i11);
    const seg = s.slice(s.lastIndexOf('{', i11),
        i12 > -1 ? s.lastIndexOf('{', i12) : s.indexOf('generateLockedTopics('));
    const cards = [...seg.matchAll(/\{ ru: "([^"]+)", uz: "([^"]+)" \}/g)].map(m => [m[1], m[2]]);
    const card = (i) => (cards[i] || [])[0];
    eq('paid vocabulary topic 11 has all 45 cards', cards.length, 45);
    ok(/name: "Отглагольные существительные"/.test(seg), 'paid vocabulary topic 11 is this lesson');
    ok(/isLocked: false/.test(seg), 'paid vocabulary topic 11 is unlocked');
    eq('45 unique Russian units', new Set(cards.map(c => c[0])).size, 45);
    eq('no duplicate card', new Set(cards.map(c => c.join('|'))).size, 45);
    eq('first card', card(0), 'принятие решения');
    eq('last card', card(44), 'повышать → повышение');
    ok(cards.every(c => String(c[0]).trim() && String(c[1]).trim()), 'no empty card');
    /* the natural lexical family, not the marked «подготавливать» */
    ok(cards.some(c => c[0] === 'готовить / подготовить → подготовка'),
        'the deck teaches the natural «готовить / подготовить → подготовка» family');
    ok(!cards.some(c => /^подготавливать/.test(c[0])),
        'the marked «подготавливать» form is not the headword');
    /* every noun Ex10 asks for must be revisable */
    ['разработка стратегии', 'достижение цели', 'улучшение качества',
     'повышение эффективности', 'снижение расходов', 'увеличение доходов',
     'расширение возможностей', 'получение информации', 'применение знаний',
     'оценка результатов'
    ].forEach(u => ok(cards.some(c => c[0] === u), `the deck teaches «${u}» (drilled in ex10)`));

    const authored = [...s.matchAll(/\n                    id: (\d+),/g)].map(m => Number(m[1]));
    const vFrontier = Math.max.apply(null, authored);
    ok(authored.indexOf(11) !== -1 && vFrontier >= 11,
        'topic 11 is an authored (unlocked) vocabulary deck');
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
    ok(!/generateLockedTopics\(11\)/.test(s), 'no stale generateLockedTopics(11) remains');

    const demo = fs.readFileSync(path.join(ROOT, 'b2-demo-vocabulary.html'), 'utf8');
    ok(!/                    id: 11,/.test(demo), 'demo vocabulary untouched (no topic 11)');
    ok(!/Отглагольные существительные/.test(demo), 'topic 11 did not leak into the demo deck');
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
        const t = list.find(x => x.id === 11);
        const soonId = frontier + 1;
        const next = list.find(x => x.id === soonId);
        ok(t.grammar.length > 6000, `${mode}: topic 11 carries the real grammar`);
        ok(!t.content, `${mode}: topic 11 is a real lesson, not a coming-soon shell`);
        eq(`${mode}: topic 11 serves 11 exercise groups`,
            (w.eval('b2ExerciseData(11)') || { exercises: [] }).exercises.length, 11);
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
        if (mode === 'paid') ok(t.isLocked === false, 'paid: topic 11 is available');
        else {
            ok(t.isLocked === true, 'demo: topic 11 stays behind the paywall');
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
}

/* ------------------------------------------------------------------ report */
console.log('='.repeat(60));
if (fail === 0) {
    console.log(`  ✅ B2 TOPIC 11: ${pass}/${pass} passed`
        + `  (open ${openCount} · deterministic ${detCount} · multi ${multi}`
        + ` · accepted variants ${variants})`);
} else {
    console.log(`  ❌ B2 TOPIC 11: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
}
console.log('='.repeat(60) + '\n');
process.exit(fail === 0 ? 0 : 1);
