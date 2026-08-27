#!/usr/bin/env node
/**
 * verify_b2_topic15.cjs — B2 Lesson 15 «Стилистика речи».
 *
 * What this file pins, and why:
 *
 *  1. TERMINOLOGY. The lesson teaches РЕЧЕВОЙ РЕГИСТР and says so, using
 *     официальный / нейтральный / неофициальный only as learner-friendly
 *     labels — it never claims to be the complete academic system of Russian
 *     functional styles.
 *  2. Grammatically correct ≠ stylistically appropriate. Both «Слушай, когда
 *     встречаемся?» and «Не могли бы вы уточнить время встречи?» are correct,
 *     each in its own context.
 *  3. Formal speech is polite and clear, NOT needlessly bureaucratic, and not
 *     every colleague requires it.
 *  4. GENDER FAIRNESS. «Я хотел бы…» is a past-tense form that agrees with the
 *     speaker, so «Я хотела бы…» and the neutral «Хотелось бы…» are taught.
 *  5. Neutral register is NOT tied to one pronoun, and «Давайте…» is not
 *     exclusively neutral — it works in polite/formal contexts too.
 *  6. Formality is not only «вы / ты»: «Эй, вы мне документ пришлёте?» contains
 *     «вы» and is still not polite.
 *  7. Capitalised «Вы» is a written-address convention; capitalisation alone
 *     does not create formality.
 *  8. Changing register must PRESERVE the communicative intention — a request
 *     must not silently become an order.
 *  9. Register is a SCALE, not three sealed boxes. That is why Ex1 #3/#6/#9
 *     carry an explicit situation cue: those expressions span more than one
 *     register on their own, and grading them context-free would be unfair.
 *
 *  Ex5 REPLACES a broken source exercise. The source asked the learner to
 *  insert «Вы»/«ты» into sentences that can accept neither — «Давай ___
 *  обсудим это вечером», «Разрешите ___ уточнить один вопрос», «Давай ___
 *  поговорим позже». The PURPOSE (choose the pronoun that fits the situation)
 *  is preserved; only the ungrammatical frames were rewritten.
 *
 *  Ex2's model was repaired: «Давай поговорим об этом.» → «Хотелось бы обсудить
 *  этот вопрос.» rather than the source's «Разрешите обсудить этот вопрос.»,
 *  which reads as asking permission to perform the abstract act of discussing.
 *
 *  AUDIO. The source labelled its true/false choices «Рост / Ложь». «Рост»
 *  means "growth" — it is not a truth value. The scored labels are Russian
 *  «Правда / Ложь». The truth values themselves are the source's own, and were
 *  additionally cross-checked against the real MP3 with a local whisper.cpp
 *  decode: all ten agreed.
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

console.log('\n=== B2 TOPIC 15 — Стилистика речи ===');

/* ------------------------------------------------------------ data presence */
const all = w.B2_LESSON_DATA.topics;
for (let i = 1; i <= 14; i++) ok(!!all.find(t => t.id === i), `topic ${i} still present`);
const t15 = all.find(t => t.id === 15);
ok(!!t15, 'topic 15 exists');
if (!t15) { console.log('missing lesson 15'); process.exit(1); }
eq('topic 15 appears exactly once', all.filter(t => t.id === 15).length, 1);
eq('topic 15 title', t15.title, 'Стилистика речи');
ok(t15.isLocked === false && t15.isSubscriptionLocked === false, 'topic 15 ships unlocked');

const syll = w.B2_TOPICS;
eq('B2 syllabus still has 16 topics', syll.length, 16);
eq('syllabus and lesson agree on the topic 15 title',
    (syll.find(t => t.id === 15) || {}).title, t15.title);
eq('topic 16 keeps its canonical title',
    (syll.find(t => t.id === 16) || {}).title, 'Повторение сложных конструкций B2');

const ids = all.map(t => t.id).sort((a, b) => a - b);
const frontier = ids[ids.length - 1];
ok(ids.join(',') === Array.from({ length: frontier }, (_, i) => i + 1).join(','),
    `authored lesson ids are contiguous 1..${frontier}`);
ok(frontier >= 15, `topic 15 is authored (frontier ${frontier})`);
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
const G = t15.grammar || '';
const gdoc = new JSDOM('<body><div id="g"></div></body>').window.document;
gdoc.getElementById('g').innerHTML = G;
const block = (n) => {
    const from = G.indexOf('<h4>' + n + '. ');
    const to = n === 10 ? G.length : G.indexOf('<h4>' + (n + 1) + '. ');
    return G.slice(from, to);
};
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const GT = text(G);

ok(G.length > 7000, `grammar is a full lesson (${G.length} chars)`);
ok(!/\$\{/.test(G), 'no template placeholder leaked');
for (let n = 1; n <= 10; n++) ok(G.indexOf('<h4>' + n + '. ') !== -1, `grammar block ${n} is numbered`);
eq('10 numbered blocks + 1 summary heading', (G.match(/<h4/g) || []).length, 11);
ok(/b2g-check/.test(G), 'the closing self-check uses the B2 check card');

/* --- REPAIR 1: register, not the whole functional-style system --- */
{
    const b1 = text(block(1));
    ok(/речевой регистр/i.test(GT) || /регистр/i.test(GT), 'the lesson names речевой регистр');
    ['Ситуация', 'собеседник', 'отношения', 'цель общения', 'регистр']
        .forEach(k => ok(b1.indexOf(k) !== -1, `block 1 keeps the chain step «${k}»`));
    ok(/o‘quv qulayligi/.test(b1) || /o‘quv yorlig/.test(text(G.slice(0, G.indexOf('<h4>2. ')))),
        'the three labels are presented as learner-friendly, not as the complete system');
    ok(/funksional uslublari tizimi/.test(b1),
        'block 1 states the full functional-style system is wider than this lesson');
}

/* --- REPAIR 2: correct ≠ appropriate --- */
{
    const b1 = text(block(1));
    ok(b1.indexOf('Слушай, когда встречаемся?') !== -1, 'block 1 gives the informal example');
    ok(b1.indexOf('Не могли бы вы уточнить время встречи?') !== -1, 'block 1 gives the formal example');
    ok(/grammatik jihatdan to‘g‘ri/.test(b1) && /uslubiy jihatdan mos/.test(b1),
        'block 1 states that grammatically correct is not automatically appropriate');
}

/* --- REPAIR 3: formal is polite and clear, not bureaucratic --- */
{
    const b2 = text(block(2));
    ['Разрешите уточнить…', 'Я хотел бы отметить…', 'Позвольте уточнить…',
     'Хотелось бы обратить внимание на…', 'Не могли бы Вы уточнить…?',
     'Будьте добры, сообщите…', 'Прошу обратить внимание…'
    ].forEach(c => ok(b2.indexOf(c) !== -1, `block 2 keeps the source construction «${c}»`));
    ok(/kanselyar/.test(b2), 'block 2 warns against needless bureaucratic tone');
    ok(/har qanday hamkasb bilan har doim rasmiy gapirish shart emas/.test(b2),
        'block 2 denies that every colleague requires formal register');
}

/* --- REPAIR 4: neutral is not tied to one pronoun; Давайте is not only neutral */
{
    const b3 = text(block(3));
    ['Я хотел бы узнать…', 'Можно уточнить…?', 'Давайте обсудим…', 'Давайте рассмотрим…', 'Как Вы думаете…?']
        .forEach(c => ok(b3.indexOf(c) !== -1, `block 3 keeps «${c}»`));
    ok(/bitta olmoshga bog‘lanmagan/.test(b3),
        'block 3 states neutral register is not tied to one pronoun');
    ok(/muloyim va rasmiyroq/.test(b3),
        'block 3 states «Давайте…» also works in polite/formal contexts');
}

/* --- REPAIR 5: Слушай is context-dependent --- */
{
    const b4 = text(block(4));
    ['Давай обсудим…', 'Давай уточним…', 'Слушай, я хотел спросить…',
     'Как ты думаешь…?', 'Что скажешь насчёт…?', 'Давай поговорим об этом…'
    ].forEach(c => ok(b4.indexOf(c) !== -1, `block 4 keeps «${c}»`));
    ok(/notanish inson/.test(b4) && /mijoz/.test(b4) && /rahbar/.test(b4),
        'block 4 names the contexts where «Слушай…» is too direct');
}

/* --- REPAIR 6: register is a scale, not three boxes --- */
{
    const b5 = text(block(5));
    ok(b5.indexOf('Разрешите уточнить, когда будет готов отчёт?') !== -1, 'block 5 formal row');
    ok(b5.indexOf('Можно уточнить, когда будет готов отчёт?') !== -1, 'block 5 neutral row');
    ok(b5.indexOf('Слушай, когда будет готов отчёт?') !== -1, 'block 5 informal row');
    ok(/shkala, uchta qat’iy quti emas/.test(b5),
        'block 5 states register is a scale, not three sealed boxes');
    ok(b5.indexOf('Можно уточнить один момент?') !== -1,
        'block 5 gives the between-registers example');
}

/* --- REPAIR 7: formality is not only вы/ты; capitalisation note --- */
{
    const b6 = text(block(6));
    ok(b6.indexOf('Вы можете прислать документ?') !== -1, 'block 6 neutral request');
    ok(b6.indexOf('Будьте добры, пришлите документ.') !== -1, 'block 6 polite formal request');
    ok(b6.indexOf('Эй, вы мне документ пришлёте?') !== -1,
        'block 6 shows that «вы» alone does not make an utterance polite');
    ok(/bosh harfning o‘zi/.test(b6) && /rasmiylik yaratmaydi/.test(b6),
        'block 6 states capitalisation alone does not create formality');
    ['leksika', 'ohang', 'kontekst'].forEach(k =>
        ok(b6.indexOf(k) !== -1, `block 6 lists «${k}» as part of register`));
}

/* --- REPAIR 8: gender fairness --- */
{
    const b7 = text(block(7));
    ok(b7.indexOf('Я хотел бы уточнить один момент.') !== -1, 'block 7 gives the masculine form');
    ok(b7.indexOf('Я хотела бы уточнить один момент.') !== -1, 'block 7 gives the feminine form');
    ok(b7.indexOf('Хотелось бы уточнить один момент.') !== -1, 'block 7 gives the neutral form');
    ok(/o‘tgan zamon shakli/.test(b7),
        'block 7 explains WHY the form agrees with the speaker');
    ok(/jinsdan qat’i nazar/.test(b7), 'block 7 marks the neutral option as gender-free');
}

/* --- REPAIR 9: preserve the communicative intention --- */
{
    const b8 = text(block(8));
    ok(b8.indexOf('Можешь отправить мне документы?') !== -1
        && b8.indexOf('Не могли бы Вы отправить мне документы?') !== -1,
        'block 8 shows a request staying a request');
    ok(b8.indexOf('Хотелось бы обсудить этот вопрос.') !== -1,
        'block 8 uses the repaired formal equivalent of «Давай поговорим об этом.»');
    ok(/buyruqqa/.test(b8), 'block 8 warns against turning a request into an order');
    ok(/maqsad emas/.test(b8), 'block 8 states the purpose must not change');
}

/* --- typical mistakes: both directions --- */
{
    const b9 = text(block(9));
    ok(b9.indexOf('Эй, скажи, когда будет отчёт?') !== -1, 'block 9 shows the too-informal error');
    ok(b9.indexOf('Не могли бы Вы помочь мне?') !== -1, 'block 9 shows the too-formal error');
    ok(/haddan tashqari erkin/.test(b9) && /keraksiz rasmiy/.test(b9),
        'block 9 states BOTH directions can be wrong');
}

/* --- the closing self-check --- */
{
    const chk = G.slice(G.indexOf('b2g-check'));
    ok((chk.match(/<li>/g) || []).length >= 8, 'the self-check has at least eight questions');
    ['Kim bilan', 'munosabatimiz', 'maqsadi', 'registrdan', 'yoki', 'muloyimmi',
     'ma’noni saqladimmi', 'vaziyatga ham mosmi'
    ].forEach(k => ok(chk.indexOf(k) !== -1, `the self-check asks about «${k}»`));
}

/* --- MARKUP: raw well-formedness, read before any parser repairs it --- */
{
    const VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1,
                   link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1 };
    const stack = [];
    let pDepth = 0, stray = null, nested = null, unopened = null, order = null;
    const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)(?:\s[^>]*)?>/g;
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
    ok(stray === null, `topic 15 grammar never closes a paragraph it did not open${stray === null ? '' : ` (at ${stray})`}`);
    ok(nested === null, 'topic 15 grammar never nests <p> inside <p>');
    eq('topic 15 grammar closes every paragraph it opens', pDepth, 0);
    ok(unopened === null, `topic 15 grammar has no unopened closing tag${unopened === null ? '' : ` (</${unopened}>)`}`);
    ok(order === null, `topic 15 grammar closes its tags in order${order === null ? '' : ` (${order})`}`);
    eq('topic 15 grammar leaves no tag unclosed', stack.length, 0);
    ['p', 'div', 'table', 'tr', 'th', 'td', 'h4', 'b', 'ul', 'li', 'span'].forEach(t => {
        const o = (G.match(new RegExp('<' + t + '(?=[ >])', 'g')) || []).length;
        const c = (G.match(new RegExp('</' + t + '>', 'g')) || []).length;
        if (o || c) eq(`topic 15 grammar balances <${t}>`, c, o);
    });
}

{
    const tables = [...gdoc.querySelectorAll('table.b2g-t')];
    eq('grammar renders its 10 b2g-t tables', tables.length, 10);
    let wide = 0, headless = 0;
    tables.forEach(tb => {
        [...tb.querySelectorAll('tr')].forEach(tr => { if (tr.children.length !== 2) wide++; });
        if (!tb.querySelector('th')) headless++;
    });
    eq('every grammar table row has exactly 2 cells', wide, 0);
    eq('every grammar table has a header row', headless, 0);
}

/* -------------------------------------------------------------- exercises */
const ex = t15.exercises || [];
const byId = {};
ex.forEach(g => { byId[g.id] = g; });
const items = id => (byId[id] && byId[id].items) || [];
const at = (id, i) => items(id)[i] || {};

eq('11 exercise groups', ex.length, 11);
eq('group ids follow the B2 convention', ex.map(g => g.id).join(','),
    'ex1,ex2,ex3,ex4,ex5,ex6,ex7,ex8,ex9,ex10,audio1');
ex.forEach(g => {
    eq(`${g.id} has 10 items`, g.items.length, 10);
    ok(!!g.title, `${g.id} has a task title`);
    ok(!!g.intro && g.intro.length > 20, `${g.id} has a real instruction`);
    ok(g.showTask === true, `${g.id} shows its task text`);
});
eq('110 items in total', ex.reduce((n, g) => n + g.items.length, 0), 110);

/* -------------------------------------------- openness, observed not assumed */
const NONSENSE = 'зззz яяяy ююю';
const isOpen = (it) => UI.matchItem(it, NONSENSE) === true;
const OPEN_GROUPS = ['ex2', 'ex3', 'ex6', 'ex7', 'ex8', 'ex9', 'ex10'];
const DET_GROUPS = ['ex1', 'ex4', 'ex5', 'audio1'];
const OPEN_SAMPLE = 'Не могли бы Вы уточнить время встречи?';

let openCount = 0, detCount = 0, multi = 0, variants = 0;
let missing = 0, junk = 0, badOpt = 0, unmatched = 0, nonsenseAccepted = 0, blankAccepted = 0;

ex.forEach(g => g.items.forEach((it, i) => {
    const where = `${g.id} #${i + 1}`;
    if (isOpen(it)) {
        openCount++;
        if (OPEN_GROUPS.indexOf(g.id) === -1) { fail++; failures.push(`${where}: unexpectedly OPEN`); }
        if (it.free !== true) { fail++; failures.push(`${where}: open but not flagged free:true`); }
        if (it.answer !== null) { fail++; failures.push(`${where}: open item carries a key`); }
        if (!UI.matchItem(it, OPEN_SAMPLE)) { fail++; failures.push(`${where}: open refuses a meaningful answer`); }
        if (UI.matchItem(it, 'да')) { fail++; failures.push(`${where}: open accepts one word`); }
        if (UI.matchItem(it, '')) { fail++; failures.push(`${where}: open accepts blank`); }
        return;
    }
    detCount++;
    if (OPEN_GROUPS.indexOf(g.id) !== -1) { fail++; failures.push(`${where}: ${g.id} must stay open`); }
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

eq('70 genuinely open items', openCount, 70);
eq('40 deterministic items', detCount, 40);
eq('no deterministic key is empty', missing, 0);
eq('no placeholder leaked into a key', junk, 0);
eq('every choice key belongs to its own options', badOpt, 0);
eq('every accepted answer is accepted by the real scorer', unmatched, 0);
eq('no deterministic item accepts nonsense', nonsenseAccepted, 0);
eq('no deterministic item accepts a blank', blankAccepted, 0);
OPEN_GROUPS.forEach(id => ok(items(id).every(it => it.free === true && it.answer === null),
    `${id} is wholly open`));
DET_GROUPS.forEach(id => ok(items(id).every(it => it.free !== true && it.answer !== null),
    `${id} is wholly deterministic`));
eq('no open item stores an answer key',
    ex.filter(g => OPEN_GROUPS.indexOf(g.id) !== -1)
      .reduce((n, g) => n + g.items.filter(it => it.answer !== null).length, 0), 0);

/* ------------------------------------------------------------------- Ex1 */
{
    const STYLES = ['официальный', 'нейтральный', 'неофициальный'];
    eq('ex1 is a choice exercise', byId.ex1.type, 'choice');
    items('ex1').forEach((it, i) => {
        eq(`ex1 #${i + 1} offers the three registers`, (it.options || []).join(','), STYLES.join(','));
        ok(STYLES.indexOf(it.answer) !== -1, `ex1 #${i + 1} key is one of the three registers`);
    });
    eq('ex1 keys', items('ex1').map(it => it.answer).join(','),
        'официальный,неофициальный,нейтральный,официальный,неофициальный,'
        + 'нейтральный,официальный,неофициальный,нейтральный,официальный');
    /* the three ambiguous rows carry an explicit situation cue */
    [[2, 'Можно уточнить время начала?'],
     [5, 'Давайте обсудим этот вопрос'],
     [8, 'Я хотел бы узнать дополнительную информацию']
    ].forEach(([idx, core]) => {
        const q = at('ex1', idx).q;
        ok(q.indexOf('коллег') !== -1,
            `ex1 #${idx + 1} carries a situation cue, because the phrase alone spans registers`);
        ok(q.indexOf(core) !== -1, `ex1 #${idx + 1} keeps the source utterance «${core}»`);
        eq(`ex1 #${idx + 1} is the neutral row`, at('ex1', idx).answer, 'нейтральный');
    });
    /* every neutral key must be a contextualised row */
    items('ex1').forEach((it, i) => {
        if (it.answer !== 'нейтральный') return;
        ok(it.q.indexOf('Разговор') === 0 || it.q.indexOf('Обычный разговор') === 0,
            `ex1 #${i + 1} neutral row is contextualised`);
    });
}

/* --------------------------------------------------------------- Ex2 / Ex3 */
{
    ok(/Хотелось бы обсудить этот вопрос/.test(byId.ex2.namuna),
        'the ex2 model uses the repaired formal equivalent');
    ok(byId.ex2.namuna.indexOf('Разрешите обсудить этот вопрос') === -1,
        'the artificial source model is not shipped');
    ok(/maqsad/.test(byId.ex2.intro), 'ex2 tells the learner to preserve the communicative purpose');
    eq('ex2 keeps the ten source prompts', items('ex2').map(it => it.q).join(' | '),
        'Слушай, когда будет встреча? | Можешь отправить мне документы? | '
        + 'Давай обсудим этот вопрос. | Ты можешь объяснить мне ситуацию? | '
        + 'Скажи, когда будет готов отчёт? | Давай перенесём встречу. | '
        + 'Ты можешь уточнить информацию? | Расскажи мне подробнее об этом проекте. | '
        + 'Давай рассмотрим другой вариант. | Скажи, почему изменился план?');
    eq('ex3 keeps the ten formal source prompts', items('ex3').map(it => it.q).join(' | '),
        'Разрешите уточнить, когда Вы приедете? | Я хотел бы узнать Ваше мнение. | '
        + 'Не могли бы Вы помочь мне? | Позвольте задать Вам вопрос. | '
        + 'Я хотел бы обсудить этот вопрос. | Не могли бы Вы объяснить ситуацию? | '
        + 'Разрешите уточнить некоторые детали. | Хотелось бы узнать Ваше мнение. | '
        + 'Прошу Вас сообщить мне результаты. | Позвольте предложить другой вариант.');
}

/* ------------------------------------------------------------------- Ex4 */
{
    eq('ex4 is a choice exercise', byId.ex4.type, 'choice');
    items('ex4').forEach((it, i) => {
        eq(`ex4 #${i + 1} offers three options`, (it.options || []).length, 3);
        ok(it.options.indexOf(it.answer) !== -1, `ex4 #${i + 1} key belongs to its options`);
        /* options are Russian utterances, never bare letters */
        it.options.forEach(o => ok(!/^[abc]\)?$/i.test(String(o).trim()),
            `ex4 #${i + 1} option is an utterance, not a letter`));
        ok(/[А-Яа-яЁё]/.test(it.answer), `ex4 #${i + 1} key is a Russian utterance`);
    });
    eq('ex4 keys', items('ex4').map(it => it.answer).join(' | '),
        'Не могли бы Вы уточнить сроки? | Давай обсудим план. | Я хотел бы отметить… | '
        + 'Можно уточнить информацию? | Как ты думаешь? | Не могли бы Вы мне помочь? | '
        + 'Давай обсудим проблему. | Я хотел бы отметить… | Можно уточнить один момент? | '
        + 'Что скажешь насчёт этого варианта?');
}

/* ------------------------------------------------------------------- Ex5 */
{
    eq('ex5 is a choice exercise', byId.ex5.type, 'choice');
    items('ex5').forEach((it, i) => {
        eq(`ex5 #${i + 1} offers Вы / ты`, (it.options || []).join(','), 'Вы,ты');
        ok(['Вы', 'ты'].indexOf(it.answer) !== -1, `ex5 #${i + 1} key is one of the two pronouns`);
        ok(it.q.indexOf('___') !== -1, `ex5 #${i + 1} really has a blank`);
    });
    eq('ex5 keys', items('ex5').map(it => it.answer).join(','),
        'ты,Вы,ты,Вы,ты,Вы,Вы,ты,Вы,ты');
    /* the broken source frames must never come back */
    ['Давай ___ обсудим', 'Разрешите ___ уточнить', 'Давай ___ поговорим']
        .forEach(bad => ok(items('ex5').every(it => it.q.indexOf(bad) === -1),
            `ex5 never ships the ungrammatical source frame «${bad}»`));
    /* every blank must actually accept its key: the pronoun agrees with the verb */
    items('ex5').forEach((it, i) => {
        const filled = it.q.replace('___', it.answer);
        ok(filled.indexOf('___') === -1, `ex5 #${i + 1} has exactly one blank`);
        if (it.answer === 'ты') {
            ok(/тыс?\s+\S*(ешь|аешь|ишь|жешь|шь)|___/.test(filled) || /ты (думаешь|хочешь|можешь|скажешь|сможешь)/.test(filled),
                `ex5 #${i + 1} «ты» agrees with a 2sg verb`);
        } else {
            ok(/Вы\s+\S*(ете|аете|ите|жете)|Вы (сможете|считаете|объяснить|подсказать)/.test(filled)
                || /(Не могли бы|когда) Вы/.test(filled),
                `ex5 #${i + 1} «Вы» agrees with a polite/plural form`);
        }
    });
    /* real scorer: own key passes, the opposite fails, blank fails */
    let own = 0, opp = 0, blank = 0;
    items('ex5').forEach(it => {
        if (UI.matchItem(it, it.answer) === true) own++;
        if (UI.matchItem(it, it.answer === 'Вы' ? 'ты' : 'Вы') === false) opp++;
        if (UI.matchItem(it, '') === false) blank++;
    });
    eq('every ex5 key is accepted by the real scorer', own, 10);
    eq('every opposite ex5 pronoun is rejected', opp, 10);
    eq('every blank ex5 answer is rejected', blank, 10);
}

/* --------------------------------- the open groups keep their source content */
{
    eq('ex6 first beginning', at('ex6', 0).q, 'Разрешите уточнить…');
    eq('ex6 last beginning', at('ex6', 9).q, 'Как ты думаешь…?');
    ok(items('ex7').every(it => /[‘’a-zA-Z]/.test(it.q)), 'every ex7 prompt is an Uzbek situation');
    ok(items('ex8').every(it => /bilan:/.test(it.q)), 'every ex8 prompt names its interlocutor');
    ok(/UCHTA|официальный/.test(byId.ex9.intro), 'ex9 requires all three registers');
    ok(/4–6/.test(byId.ex10.intro), 'ex10 requires 4–6 turns');
}

/* ------------------------------------------------------------------ audio */
{
    const a = byId.audio1;
    eq('audio1 is a choice exercise', a.type, 'choice');
    eq('audio1 uses the true/false style', a.style, 'tf');
    eq('audio1 has 10 items', a.items.length, 10);
    eq('audio1 uses the source-provided recording title', a.title, 'Разговор в разных ситуациях');

    const EXPECTED = 'audios/' + encodeURIComponent('Б2 15 урок.mp3');
    eq('audio1 points at the topic 15 recording', a.audioSrc, EXPECTED);
    eq('the src decodes to the real path', decodeURIComponent(a.audioSrc), 'audios/Б2 15 урок.mp3');
    ok(fs.existsSync(path.join(ROOT, decodeURIComponent(a.audioSrc))),
        'the topic 15 MP3 exists on disk');
    const dataSrc = fs.readFileSync(path.join(ROOT, 'b2-lesson-data.js'), 'utf8');
    eq('the topic 15 MP3 is referenced exactly once', dataSrc.split(EXPECTED).length - 1, 1);
    [12, 13, 14].forEach(n => ok(
        a.audioSrc.indexOf(encodeURIComponent('Б2 ' + n + ' урок.mp3')) === -1,
        `audio1 does not point at the topic ${n} recording`));

    ok(/tinglang/.test(a.intro), 'audio1 tells the learner to LISTEN');
    ['Matn asosida', 'Matnga asoslanib', 'по тексту', 'прочитайте текст']
        .forEach(bad => ok(a.intro.indexOf(bad) === -1,
            `audio1 instruction is not a read-the-text task («${bad}»)`));

    /* LANGUAGE: the source labelled its choices «Рост / Ложь». «Рост» is not a
       truth value at all, so the scored labels are Russian Правда / Ложь. */
    a.items.forEach((it, i) => {
        eq(`audio1 #${i + 1} offers Правда / Ложь`, (it.options || []).join(','), 'Правда,Ложь');
        ok(it.answer === 'Правда' || it.answer === 'Ложь', `audio1 #${i + 1} key is one of the options`);
    });
    const flat = JSON.stringify(a.items);
    ['Рост', 'Rost', 'Yolg', 'To‘g‘ri', 'Noto‘g‘ri', 'Неправда', 'Верно', 'Неверно']
        .forEach(bad => ok(flat.indexOf(bad) === -1, `audio1 choices never use «${bad}»`));

    const STATEMENTS = [
        'Современный человек общается только с коллегами и руководителями.',
        'Стиль речи зависит от ситуации и собеседника.',
        'На работе обычно используется официальный или нейтральный стиль.',
        'Фраза «Разрешите уточнить…» относится к неофициальному стилю.',
        'Во время деловой встречи можно использовать выражение «Я хотел бы отметить…».',
        'С коллегами всегда необходимо использовать только официальный стиль.',
        'Фраза «Давай обсудим это вечером» характерна для неофициального общения.',
        'С друзьями можно использовать конструкции «Слушай…» и «Как ты думаешь…?».',
        'Выбор стиля зависит только от того, что человек хочет сказать.',
        'Правильный выбор языковых средств помогает сделать общение более эффективным.'
    ];
    STATEMENTS.forEach((s, i) => eq(`audio1 #${i + 1} keeps the source statement`, a.items[i].q, s));

    eq('audio answers follow the source key, relabelled to Правда/Ложь',
        a.items.map(it => it.answer).join(','),
        'Ложь,Правда,Правда,Ложь,Правда,Ложь,Правда,Правда,Ложь,Правда');
    eq('six Правда, as the source dictates', a.items.filter(it => it.answer === 'Правда').length, 6);
    eq('four Ложь, as the source dictates', a.items.filter(it => it.answer === 'Ложь').length, 4);

    let own = 0, opp = 0, blank = 0;
    a.items.forEach(it => {
        if (UI.matchItem(it, it.answer) === true) own++;
        if (UI.matchItem(it, it.answer === 'Правда' ? 'Ложь' : 'Правда') === false) opp++;
        if (UI.matchItem(it, '') === false) blank++;
    });
    eq('every audio key is accepted by the real scorer', own, 10);
    eq('every opposite audio answer is rejected', opp, 10);
    eq('every blank audio answer is rejected', blank, 10);

    const lesson = JSON.stringify(t15);
    ['Современный человек каждый день общается', 'избежать недоразумений', 'после обеда']
        .forEach(line => ok(lesson.indexOf(line) === -1, 'no transcript sentence leaked into the product'));
}

/* ----------------------------------------------------------------- format */
{
    let dupPrompt = 0, empty = 0, longQ = 0;
    const seen = Object.create(null);
    ex.forEach(g => g.items.forEach(it => {
        const k = g.id + '::' + it.q;
        if (seen[k]) dupPrompt++; seen[k] = 1;
        if (!String(it.q || '').trim()) empty++;
        if (String(it.q).length > 220) longQ++;
    }));
    eq('no duplicate prompt inside a group', dupPrompt, 0);
    eq('no empty prompt', empty, 0);
    eq('no runaway prompt length', longQ, 0);
    const prompts = [];
    ex.forEach(g => g.items.forEach(it => prompts.push(it.q)));
    eq('110 prompts in total', prompts.length, 110);
    ok(new Set(prompts).size >= 108, `prompts are essentially distinct (${new Set(prompts).size}/110)`);
}

/* ------------------------------------------------- vocabulary (paid only) */
{
    const v = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-vocabulary.html'), 'utf8');
    const a = v.indexOf('name: "Стилистика речи"');
    ok(a > -1, 'paid vocabulary has a topic 15 deck');
    const authoredIds = [...v.matchAll(/\n                    id: (\d+),/g)].map(m => Number(m[1]));
    const vFrontier = Math.max.apply(null, authoredIds);
    eq('vocabulary frontier matches the lesson frontier', vFrontier, frontier);
    /* FINAL-FRONTIER SAFE. While canonical decks remain unauthored they are
       generated from the next id. Once every canonical deck is real the spread
       is removed entirely — demanding generateLockedTopics(N+1) then would
       assert a phantom Topic 17. */
    const _genSpread = v.indexOf('...generateLockedTopics(') !== -1;
    if (_genSpread) {
        ok(new RegExp('generateLockedTopics\\(' + (vFrontier + 1) + '\\)').test(v),
            `future decks are generated from ${vFrontier + 1}`);
    } else {
        ok(!new RegExp('generateLockedTopics\\(' + (vFrontier + 1) + '\\)').test(v),
            'the paid deck list is complete — no future deck is generated');
        ok(v.split('...generateLockedTopics(').length - 1 === 0,
            'no generated future deck remains in the paid deck list');
    }
    eq(`no stale generateLockedTopics(${vFrontier})`,
        v.split('generateLockedTopics(' + vFrontier + ')').length - 1, 0);

    const nextDeck = v.indexOf('\n                    id: ', a + 1);
    let marker = v.indexOf('generateLockedTopics(' + (vFrontier + 1) + ')');
    if (marker < 0) marker = v.length;          /* final frontier: no marker left */
    const b = (nextDeck > -1 && nextDeck < marker) ? nextDeck : marker;
    const seg = v.slice(a, b);
    const cards = [...seg.matchAll(/\{ ru: "((?:[^"\\]|\\.)*)", uz: "((?:[^"\\]|\\.)*)" \}/g)]
        .map(m => [m[1], m[2]]);
    /* 50 base entries + 10 collocations = 60. No 61st card was invented. */
    eq('paid vocabulary topic 15 has all 60 source cards', cards.length, 60);
    const ru = cards.map(c => c[0]);
    eq('60 unique Russian units', new Set(ru).size, 60);
    eq('no duplicate card', new Set(cards.map(c => c.join('|'))).size, 60);
    eq('no empty Russian side', ru.filter(x => !x.trim()).length, 0);
    eq('no empty Uzbek side', cards.filter(c => !c[1].trim()).length, 0);
    ['официальный стиль', 'нейтральный стиль', 'неофициальный стиль', 'собеседник']
        .forEach(k => ok(ru.indexOf(k) !== -1, `the deck keeps «${k}»`));
    ['уточнить информацию', 'обсудить вопрос', 'выразить мнение']
        .forEach(k => ok(ru.indexOf(k) !== -1, `the deck keeps the collocation «${k}»`));
    eq('first card', ru[0], 'официальный стиль');
    eq('last card', ru[59], 'выразить мнение');

    const demo = fs.readFileSync(path.join(ROOT, 'b2-demo-vocabulary.html'), 'utf8');
    eq('topic 15 vocabulary never becomes free demo content',
        demo.split('Стилистика речи').length - 1, 0);
}

/* --------------------------------------- runtime frontier: paid vs demo */
{
    const grab = (host, name) => {
        const i = host.indexOf('function ' + name + '(');
        if (i < 0) return null;
        let d = 0;
        for (let k = host.indexOf('{', i); k < host.length; k++) {
            if (host[k] === '{') d++;
            else if (host[k] === '}') { d--; if (!d) return host.slice(i, k + 1); }
        }
        return null;
    };
    [['paid-courses/b2-course.html', false, 'paid'],
     ['b2-demo.html', true, 'demo']].forEach(([file, demoMode, tag]) => {
        const host = fs.readFileSync(path.join(ROOT, file), 'utf8');
        const hw = new JSDOM('<body></body>', { runScripts: 'outside-only', virtualConsole: vc }).window;
        ['shared-normalizer.js', 'sentence-builder.js', 'course-exercise-ui.js',
         'b2-topics.js', 'b2-lesson-data.js'].forEach(f =>
            hw.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
        hw.eval('var B2_DEMO_MODE = ' + demoMode + ';');
        ['b2SoonHtml', 'b2ExerciseData', 'buildB2Topics'].forEach(n => {
            const src = grab(host, n);
            ok(!!src, `${tag}: ${n}() found`);
            if (src) hw.eval(src);
        });
        const list = hw.eval('buildB2Topics()');
        eq(`${tag}: 16 topics are rendered`, list.length, 16);
        const t = list.find(x => x.id === 15);
        ok(!!(t && t.grammar && t.grammar.length > 1000), `${tag}: topic 15 renders a real lesson`);
        eq(`${tag}: topic 15 shows no coming-soon shell`, t.content, '');
        eq(`${tag}: topic 15 lock state`, t.isLocked, demoMode);
        eq(`${tag}: topic 15 subscription lock state`, t.isSubscriptionLocked, demoMode);
        const next = list.find(x => x.id === frontier + 1);
        if (frontier < list.length) {
            ok(!!next, `${tag}: topic ${frontier + 1} is still listed`);
            eq(`${tag}: topic ${frontier + 1} has no grammar`, (next || {}).grammar, '');
            ok((next || {}).content && next.content.length > 50,
                `${tag}: topic ${frontier + 1} shows the coming-soon shell`);
            ok(hw.eval('b2ExerciseData(' + (frontier + 1) + ')') === null,
                `${tag}: topic ${frontier + 1} has no lesson payload`);
        } else {
            /* the course is complete: no next topic, no coming-soon shells */
            eq(`${tag}: the authored frontier reached the canonical end`, frontier, list.length);
            ok(!next, `${tag}: there is no topic ${frontier + 1} — the course ends at ${list.length}`);
            eq(`${tag}: no canonical topic is left as a coming-soon shell`,
                list.filter(x => x.content).length, 0);
        }
        if (demoMode) {
            eq('demo: only topics 1-3 stay open',
                list.filter(x => !x.isLocked).map(x => x.id).join(','), '1,2,3');
        }
    });
}

/* ------------------------------------------------------------------ report */
console.log('='.repeat(60));
if (fail === 0) {
    console.log(`  ✅ B2 TOPIC 15: ${pass}/${pass} passed`
        + `  (open ${openCount} · deterministic ${detCount} · multi ${multi}`
        + ` · accepted variants ${variants})`);
} else {
    console.log(`  ❌ B2 TOPIC 15: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
}
console.log('='.repeat(60) + '\n');
process.exit(fail === 0 ? 0 : 1);
