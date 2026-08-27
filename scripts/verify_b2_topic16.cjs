#!/usr/bin/env node
/**
 * verify_b2_topic16.cjs — B2 Lesson 16 «Повторение сложных конструкций B2».
 *
 * THIS IS THE FINAL CANONICAL B2 LESSON. There is no Topic 17, and this file
 * must never assert that a "next" topic exists: after Topic 16 the authored
 * frontier EQUALS the syllabus length, every canonical topic is a real lesson,
 * and zero coming-soon shells remain. That final state is asserted explicitly
 * rather than inherited from a frontier+1 assumption.
 *
 * Source repairs pinned here:
 *
 *  A. Ex10 IS NEWLY AUTHORED. The source supplies only Ex1–Ex9 and then goes
 *     straight to the vocabulary; this course uses ten main groups.
 *  B. «С точки зрения» governs the GENITIVE, not the nominative.
 *  C. «В результате» governs the GENITIVE; «В результате того, что» takes a
 *     clause. Both are taught.
 *  D. «В конечном счёте» is NOT an introductory phrase and takes NO comma,
 *     unlike «Таким образом,». Both are pinned, in the grammar and in Ex1/Ex6.
 *  E. Ex6 #5 was not an error at all — «Дело заключается в том, что…» is
 *     grammatical Russian. It is replaced by a genuinely defective government
 *     («заключается О ТОМ, что»), which is what the block teaches.
 *  F. Ex6 #10 was likewise already correct. It is replaced by the REAL
 *     punctuation error «В конечном счёте, каждый…».
 *  G. The Ex6 model uses natural written Russian: «эта проблема очень важна».
 *  H. Ex7 is NOT a register exercise. These are discourse-complexity
 *     transformations, so the title and instruction say so — B2 complexity is
 *     not the same thing as official style.
 *  I. The Ex7 model preserves the proposition: «Я думаю, что технологии
 *     полезны.» → «По моему мнению, технологии полезны.» — not a swap to a
 *     different claim about their importance.
 *  J. Ex9 #10's awkward «ментальному отдыху» is replaced by natural
 *     «полноценному отдыху и восстановлению».
 *  K. Vocabulary #31 «дебат» → «дебаты», the normal nominative form.
 *  L. The source's mixed heading «Rost yoki yolg'on — Современное общество» is
 *     not shipped: the audio activity is an all-Russian shell using the
 *     source-provided title, with Правда / Ложь as the scored labels.
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

console.log('\n=== B2 TOPIC 16 — Повторение сложных конструкций B2 (FINAL) ===');

/* ------------------------------------------------------------ data presence */
const all = w.B2_LESSON_DATA.topics;
for (let i = 1; i <= 15; i++) ok(!!all.find(t => t.id === i), `topic ${i} still present`);
const t16 = all.find(t => t.id === 16);
ok(!!t16, 'topic 16 exists');
if (!t16) { console.log('missing lesson 16'); process.exit(1); }
eq('topic 16 appears exactly once', all.filter(t => t.id === 16).length, 1);
eq('topic 16 title', t16.title, 'Повторение сложных конструкций B2');
ok(t16.isLocked === false && t16.isSubscriptionLocked === false, 'topic 16 ships unlocked');

const syll = w.B2_TOPICS;
eq('B2 syllabus still has 16 topics', syll.length, 16);
eq('syllabus and lesson agree on the topic 16 title',
    (syll.find(t => t.id === 16) || {}).title, t16.title);

/* ---------------------------------- THE FINAL FRONTIER, asserted explicitly */
const ids = all.map(t => t.id).sort((a, b) => a - b);
const frontier = ids[ids.length - 1];
ok(ids.join(',') === Array.from({ length: frontier }, (_, i) => i + 1).join(','),
    `authored lesson ids are contiguous 1..${frontier}`);
eq('the authored frontier IS the canonical end of B2', frontier, syll.length);
eq('every canonical B2 topic is now authored', all.length, syll.length);
ok(!syll.find(t => t.id === 17), 'the syllabus has no Topic 17');
ok(!all.find(t => t.id === 17), 'there is no Topic 17 lesson payload');
ok(!all.find(t => t.id === frontier + 1),
    `there is no topic ${frontier + 1} — B2 ends at ${syll.length}`);
/* every authored topic is a real lesson with real content */
eq('all 16 topics carry real grammar',
    all.filter(t => typeof t.grammar === 'string' && t.grammar.length > 1000).length, 16);
eq('all 16 topics carry real exercises',
    all.filter(t => Array.isArray(t.exercises) && t.exercises.length).length, 16);

/* ---------------------------------------------------------------- grammar */
const G = t16.grammar || '';
const gdoc = new JSDOM('<body><div id="g"></div></body>').window.document;
gdoc.getElementById('g').innerHTML = G;
const block = (n) => {
    const from = G.indexOf('<h4>' + n + '. ');
    const to = n === 10 ? G.length : G.indexOf('<h4>' + (n + 1) + '. ');
    return G.slice(from, to);
};
/* Tags become a space so words never merge across them; the trailing
   normalisation then removes the space a </b> leaves before a comma. */
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1');
const GT = text(G);

ok(G.length > 8000, `grammar is a full lesson (${G.length} chars)`);
ok(!/\$\{/.test(G), 'no template placeholder leaked');
for (let n = 1; n <= 10; n++) ok(G.indexOf('<h4>' + n + '. ') !== -1, `grammar block ${n} is numbered`);
eq('10 numbered blocks + 1 summary heading', (G.match(/<h4/g) || []).length, 11);
ok(/b2g-check/.test(G), 'the closing self-check uses the B2 check card');

/* --- block 1: this is a SYNTHESIS lesson, not a re-teach --- */
{
    const b1 = text(block(1));
    ok(/yakuniy dars/.test(text(G.slice(0, G.indexOf('<h4>1. ')))),
        'the lead frames Topic 16 as the final lesson');
    ok(/birga ishlatishni/.test(text(G.slice(0, G.indexOf('<h4>1. ')))),
        'the lead says the point is COMBINING the tools, not learning new ones');
    ['pozitsiya', 'ehtiyotkor talqin', 'kuchli tan olish', 'qarama-qarshilik',
     'asoslash', 'sabab va natija', 'shart', 'xulosa'
    ].forEach(k => ok(b1.indexOf(k) !== -1, `the итоговая карта lists the function «${k}»`));
}

/* --- REPAIR B: С точки зрения + родительный --- */
{
    const b2 = text(block(2));
    ok(b2.indexOf('По моему мнению, современное общество слишком сильно зависит от технологий.') !== -1,
        'block 2 keeps the source opinion example');
    ok(b2.indexOf('С точки зрения общества, эта проблема требует серьёзного решения.') !== -1,
        'block 2 keeps the source точка-зрения example');
    ok(/родительный падеж/.test(b2), 'block 2 names the genitive after «С точки зрения»');
    const seg = b2.split(/(?=[❌✅])/).map(x => x.trim()).filter(Boolean);
    const wrong = seg.filter(x => x[0] === '❌').join(' | ');
    const right = seg.filter(x => x[0] === '✅').join(' | ');
    ok(right.indexOf('с точки зрения общества') !== -1, 'the genitive form is marked ✅');
    ok(wrong.indexOf('с точки зрения общество') !== -1, 'the nominative form is marked ❌');
    ok(right.indexOf('с точки зрения общество') === -1,
        'the nominative is never presented as correct');
}

/* --- block 3: cautious interpretation vs checking the interlocutor --- */
{
    const b3 = text(block(3));
    ok(b3.indexOf('Насколько я понимаю, проблема заключается не только в экономике.') !== -1,
        'block 3 keeps the source example');
    ok(b3.indexOf('Если я правильно понимаю, вы считаете, что социальные сети необходимо ограничить?') !== -1,
        'block 3 keeps the checking-question example');
    ok(/suhbatdoshning/.test(b3),
        'block 3 distinguishes checking the interlocutor from stating one’s own reading');
    /* MIXED-SCRIPT REGRESSION. The block-3 LABEL cell once read «понимaю» with a
       Latin U+0061, while the EXAMPLE cell beside it was spelled correctly — so
       a block-wide search for the right spelling stayed green. The check is
       therefore anchored to the label cells themselves. */
    const rows3 = [...block(3).matchAll(/<tr><td>([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g)]
        .map(m => [m[1], m[2]]);
    eq('block 3 renders its four construction rows', rows3.length, 4);
    const LABEL_OK = String.fromCharCode(0x0415, 0x0441, 0x043B, 0x0438) + ' я правильно '
        + String.fromCharCode(0x043F, 0x043E, 0x043D, 0x0438, 0x043C, 0x0430, 0x044E) + ', …';
    const LABEL_BAD = String.fromCharCode(0x0415, 0x0441, 0x043B, 0x0438) + ' я правильно '
        + String.fromCharCode(0x043F, 0x043E, 0x043D, 0x0438, 0x043C, 0x0061, 0x044E) + ', …';
    ok(rows3.some(r => r[0] === LABEL_OK),
        'block 3 label cell spells «Если я правильно понимаю, …» with Cyrillic а (U+0430)');
    ok(rows3.every(r => r[0] !== LABEL_BAD),
        'block 3 label cell never uses the Latin-a homoglyph «понимaю» (U+0061)');
    /* and no cell in block 3 may carry the homoglyph at all */
    const HOMO = String.fromCharCode(0x043F, 0x043E, 0x043D, 0x0438, 0x043C, 0x0061, 0x044E);
    eq('no block 3 cell contains the Latin-a homoglyph',
        rows3.filter(r => r.join(' ').indexOf(HOMO) !== -1).length, 0);
    eq('the whole topic 16 grammar is free of the homoglyph',
        G.split(HOMO).length - 1, 0);
}

/* --- REPAIR: strong stance is NOT evidence --- */
{
    const b4 = text(block(4));
    ok(b4.indexOf('Нельзя отрицать, что технологии изменили нашу жизнь.') !== -1,
        'block 4 keeps the source example');
    ok(b4.indexOf('Нельзя не признать, что интернет значительно упростил доступ к информации.') !== -1,
        'block 4 keeps the second source example');
    ok(/o‘zi dalil emas/.test(b4), 'block 4 states these constructions are not evidence by themselves');
    ['факт', 'причина', 'пример', 'аргумент']
        .forEach(k => ok(b4.indexOf(k) !== -1, `block 4 names the real evidence type «${k}»`));
    const seg = b4.split(/(?=[❌✅])/).map(x => x.trim()).filter(Boolean);
    const wrong = seg.filter(x => x[0] === '❌').join(' | ');
    const right = seg.filter(x => x[0] === '✅').join(' | ');
    ok(wrong.indexOf('Нельзя отрицать о том, что') !== -1, '«отрицать о том» is marked ❌');
    ok(wrong.indexOf('Нельзя не признать о том, что') !== -1, '«не признать о том» is marked ❌');
    ok(right.indexOf('Нельзя отрицать, что') !== -1, 'the correct form is marked ✅');
    ok(right.indexOf('о том, что') === -1, 'the «о том» form is never marked correct');
}

/* --- REPAIR D (part 1): Однако / Тем не менее take NO comma --- */
{
    const b5 = text(block(5));
    ok(b5.indexOf('С одной стороны, социальные сети помогают людям общаться, с другой стороны, они могут вызывать зависимость.') !== -1,
        'block 5 keeps the source contrast example');
    ok(b5.indexOf('Однако они создают новые проблемы.') !== -1, 'block 5 models «Однако» without a comma');
    ok(b5.indexOf('Тем не менее её можно решить.') !== -1, 'block 5 models «Тем не менее» without a comma');
    const seg = b5.split(/(?=[❌✅])/).map(x => x.trim()).filter(Boolean);
    const wrong = seg.filter(x => x[0] === '❌').join(' | ');
    const right = seg.filter(x => x[0] === '✅').join(' | ');
    ok(wrong.indexOf('Однако, они создают') !== -1, '«Однако,» is marked ❌');
    ok(wrong.indexOf('Тем не менее, её можно') !== -1, '«Тем не менее,» is marked ❌');
    ok(right.indexOf('Однако, они создают') === -1, '«Однако,» is never marked correct');
    ok(right.indexOf('Тем не менее, её можно') === -1, '«Тем не менее,» is never marked correct');
}

/* --- block 6: заключается В ТОМ, что --- */
{
    const b6 = text(block(6));
    ok(b6.indexOf('Дело в том, что многие люди не умеют правильно использовать социальные сети.') !== -1,
        'block 6 keeps the source example');
    ok(b6.indexOf('Основная проблема заключается в том, что молодые люди проводят слишком много времени в интернете.') !== -1,
        'block 6 keeps the заключается example');
    const seg = b6.split(/(?=[❌✅])/).map(x => x.trim()).filter(Boolean);
    const wrong = seg.filter(x => x[0] === '❌').join(' | ');
    const right = seg.filter(x => x[0] === '✅').join(' | ');
    ok(right.indexOf('заключается в том, что') !== -1, '«в том» is marked ✅');
    ok(wrong.indexOf('заключается о том, что') !== -1, '«о том» is marked ❌');
    ok(right.indexOf('заключается о том') === -1, '«о том» is never marked correct');
}

/* --- REPAIR C: В результате + родительный, and «того, что» --- */
{
    const b7 = text(block(7));
    ok(b7.indexOf('Чрезмерное использование телефона приводит к тому, что люди меньше общаются в реальной жизни.') !== -1,
        'block 7 keeps the source приводит example');
    ok(b7.indexOf('В результате экономического кризиса многие семьи столкнулись с финансовыми трудностями.') !== -1,
        'block 7 keeps the genitive «в результате» example');
    /* A negative control gutted the TABLE ROW label and this stayed green,
       because the worked example below still contained the phrase. Row and
       example are now pinned separately. */
    ok(block(7).indexOf('В результате <b>того, что</b> + gap') !== -1,
        'block 7 keeps the «В результате того, что» table row');
    ok(b7.indexOf('В результате того, что люди постоянно пользуются социальными сетями') !== -1,
        'block 7 keeps the worked «В результате того, что» example');
    ok(/Agar sabab butun gap bo‘lsa/.test(b7),
        'block 7 explains WHEN to use «В результате того, что»');
    ok(/родительный/.test(b7), 'block 7 names the genitive after «в результате»');
    ok(/дательный/.test(b7), 'block 7 names the dative in «приводит к тому»');
    const seg = b7.split(/(?=[❌✅])/).map(x => x.trim()).filter(Boolean);
    const wrong = seg.filter(x => x[0] === '❌').join(' | ');
    const right = seg.filter(x => x[0] === '✅').join(' | ');
    ok(wrong.indexOf('в результате кризис') !== -1 && wrong.indexOf('в результате кризиса') === -1,
        'the nominative «в результате кризис» is marked ❌');
    ok(right.indexOf('в результате кризиса') !== -1, 'the genitive form is marked ✅');
}

/* --- block 8: то is optional, при условии takes что --- */
{
    const b8 = text(block(8));
    ok(b8.indexOf('Если люди будут ответственнее относиться к природе, экологическая ситуация улучшится.') !== -1,
        'block 8 keeps the source conditional');
    ok(b8.indexOf('Проблему можно решить при условии, что общество будет действовать вместе.') !== -1,
        'block 8 keeps the при-условии example');
    ok(/ixtiyoriy/.test(b8), 'block 8 states that «то» is optional');
    ok(/при условии, что/.test(b8), 'block 8 keeps «что» after «при условии»');
}

/* --- REPAIR D (part 2): Таким образом, WITH a comma · В конечном счёте WITHOUT */
{
    const b9 = text(block(9));
    ok(b9.indexOf('Таким образом, проблема требует комплексного решения.') !== -1,
        'block 9 models «Таким образом,» WITH a comma');
    ok(b9.indexOf('В конечном счёте каждый человек должен самостоятельно принимать решения.') !== -1,
        'block 9 models «В конечном счёте» WITHOUT a comma');
    ok(b9.indexOf('В конечном счёте развитие общества зависит от самих людей.') !== -1,
        'block 9 gives the second comma-free example');
    const seg = b9.split(/(?=[❌✅])/).map(x => x.trim()).filter(Boolean);
    const wrong = seg.filter(x => x[0] === '❌').join(' | ');
    const right = seg.filter(x => x[0] === '✅').join(' | ');
    ok(wrong.indexOf('В конечном счёте, каждый человек') !== -1,
        '«В конечном счёте,» is marked ❌');
    ok(right.indexOf('В конечном счёте каждый человек') !== -1,
        'the comma-free form is marked ✅');
    ok(right.indexOf('В конечном счёте, каждый') === -1,
        'the comma form is never marked correct');
    ok(right.indexOf('Таким образом,') !== -1, '«Таким образом,» keeps its comma in the ✅ column');
    ok(/kirish birikmasi/.test(b9), 'block 9 explains WHY «Таким образом» takes a comma');
}

/* --- block 10: the full model + gender fairness + the Topic 15 link --- */
{
    const b10 = text(block(10));
    ['Позиция', 'Обоснование', 'Другая сторона', 'Вывод']
        .forEach(s => ok(b10.indexOf(s) !== -1, `block 10 labels the stage «${s}»`));
    ok(b10.indexOf('По моему мнению, социальные сети играют важную роль в современном обществе.') !== -1,
        'block 10 keeps the worked position');
    ok(b10.indexOf('Таким образом, социальные сети необходимо использовать разумно.') !== -1,
        'block 10 keeps the worked conclusion');
    /* gender fairness */
    ok(b10.indexOf('Я не совсем согласен с тем, что') !== -1, 'block 10 gives the masculine form');
    ok(b10.indexOf('Я не совсем согласна с тем, что') !== -1, 'block 10 gives the feminine form');
    ok(b10.indexOf('Мне трудно полностью согласиться с тем, что') !== -1,
        'block 10 gives a gender-neutral alternative');
    ok(/erkak kishi/.test(b10) && /ayol kishi/.test(b10), 'block 10 labels which form belongs to whom');
    /* the link back to Topic 15 */
    ok(/registriga/.test(b10), 'block 10 connects the constructions to register (Topic 15)');
}

/* --- the closing self-check --- */
{
    const chk = G.slice(G.indexOf('b2g-check'));
    ok((chk.match(/<li>/g) || []).length >= 9, 'the self-check has at least nine questions');
    ['pozitsiyamni', 'dalilning o‘zi', 'Sabab va natijani', 'kelishik',
     'Qarama-qarshi', 'Shart', 'punktuatsiyasini', 'Xulosa', 'registriga'
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
    ok(stray === null, `topic 16 grammar never closes a paragraph it did not open${stray === null ? '' : ` (at ${stray})`}`);
    ok(nested === null, 'topic 16 grammar never nests <p> inside <p>');
    eq('topic 16 grammar closes every paragraph it opens', pDepth, 0);
    ok(unopened === null, `topic 16 grammar has no unopened closing tag${unopened === null ? '' : ` (</${unopened}>)`}`);
    ok(order === null, `topic 16 grammar closes its tags in order${order === null ? '' : ` (${order})`}`);
    eq('topic 16 grammar leaves no tag unclosed', stack.length, 0);
    ['p', 'div', 'table', 'tr', 'th', 'td', 'h4', 'b', 'ul', 'li', 'span'].forEach(t => {
        const o = (G.match(new RegExp('<' + t + '(?=[ >])', 'g')) || []).length;
        const c = (G.match(new RegExp('</' + t + '>', 'g')) || []).length;
        if (o || c) eq(`topic 16 grammar balances <${t}>`, c, o);
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
const ex = t16.exercises || [];
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
const OPEN_GROUPS = ['ex2', 'ex3', 'ex4', 'ex5', 'ex6', 'ex7', 'ex8', 'ex9'];
const DET_GROUPS = ['ex1', 'ex10', 'audio1'];
const OPEN_SAMPLE = 'По моему мнению, эта проблема требует комплексного решения.';

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

eq('80 genuinely open items', openCount, 80);
eq('30 deterministic items', detCount, 30);
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
    eq('ex1 is a choice exercise', byId.ex1.type, 'choice');
    eq('ex1 keys', items('ex1').map(it => it.answer).join(' | '),
        'По моему мнению | Насколько я понимаю | Нельзя отрицать, что | Таким образом | '
        + 'Насколько я понимаю | По моему мнению | Нельзя не признать, что | В конечном счёте | '
        + 'Если я правильно понимаю | По моему мнению');
    items('ex1').forEach((it, i) => {
        eq(`ex1 #${i + 1} offers two options`, (it.options || []).length, 2);
        ok(it.options.indexOf(it.answer) !== -1, `ex1 #${i + 1} key belongs to its options`);
        /* every row carries a function cue: the bare sentence would be ambiguous */
        ok(it.q.indexOf(':') !== -1, `ex1 #${i + 1} carries a function cue`);
        ok(it.q.indexOf('______') !== -1, `ex1 #${i + 1} has a gap`);
        /* options are construction TEXT, never letters */
        it.options.forEach(o => ok(!/^[abc]\)?$/i.test(String(o).trim()),
            `ex1 #${i + 1} option is a construction, not a letter`));
    });
    /* REPAIR D inside the exercise: «В конечном счёте» must not be given a comma */
    const vks = items('ex1').find(it => it.answer === 'В конечном счёте');
    ok(!!vks, 'ex1 drills «В конечном счёте»');
    ok(vks.q.indexOf('______ общество') !== -1,
        'the «В конечном счёте» row has NO comma after the gap');
    ok(vks.q.indexOf('______, общество') === -1,
        'the «В конечном счёте» row never forces a comma');
    ok(/vergulsiz/.test(vks.q), 'and the cue says so explicitly');
    /* the «что»-final constructions take no extra comma either */
    ['Нельзя отрицать, что', 'Нельзя не признать, что'].forEach(k => {
        const row = items('ex1').find(it => it.answer === k);
        ok(!!row && row.q.indexOf('______,') === -1,
            `the «${k}» row does not double the comma`);
    });
    /* real scorer */
    let own = 0, other = 0, blank = 0;
    items('ex1').forEach(it => {
        if (UI.matchItem(it, it.answer) === true) own++;
        const alt = it.options.find(o => o !== it.answer);
        if (UI.matchItem(it, alt) === false) other++;
        if (UI.matchItem(it, '') === false) blank++;
    });
    eq('every ex1 key is accepted by the real scorer', own, 10);
    eq('every wrong ex1 option is rejected', other, 10);
    eq('every blank ex1 answer is rejected', blank, 10);
}

/* --------------------------------------------------------- Ex6 the repairs */
{
    /* REPAIR E: the source's #5 was grammatical and therefore not an error */
    eq('ex6 #5 is a genuinely defective government', at('ex6', 4).q,
        'Основная проблема заключается о том, что многие люди не понимают эту проблему.');
    ok(items('ex6').every(it => it.q.indexOf('Дело заключается в том, что многие люди не понимают') === -1),
        'ex6 never ships the already-correct source sentence as an alleged error');
    /* REPAIR F: the source's #10 was likewise correct */
    eq('ex6 #10 is the real punctuation error', at('ex6', 9).q,
        'В конечном счёте, каждый человек должен сам принимать решение.');
    ok(items('ex6').every(it => it.q !== 'В конечном счёте каждый человек должен сам принимать решение.'),
        'ex6 never ships the already-correct comma-free sentence as an alleged error');
    /* REPAIR G: the model uses natural written Russian */
    ok(/По моему мнению что, эта проблема очень важна\./.test(byId.ex6.namuna),
        'the ex6 model shows the wrong form with «важна»');
    ok(/По моему мнению, эта проблема очень важна\./.test(byId.ex6.namuna),
        'the ex6 model shows the corrected form');
    ok(byId.ex6.namuna.indexOf('очень важная') === -1,
        'the ex6 model does not use the unnatural «очень важная»');
    /* every prompt really is defective */
    eq('ex6 keeps ten defective prompts', items('ex6').length, 10);
    items('ex6').forEach((it, i) => {
        ok(/что,|о том, что|стороны технологии|мнению социальные|счёте,/.test(it.q),
            `ex6 #${i + 1} really contains a defect`);
    });
}

/* ------------------------------------------------------------------- Ex7 */
{
    /* REPAIR H: these are discourse-complexity transformations, not register */
    ok(/B2 darajasidagi konstruksiya/.test(byId.ex7.title),
        'ex7 is titled as a B2 construction rewrite, not a formality exercise');
    ok(byId.ex7.title.indexOf('Rasmiyroq') === -1,
        'ex7 is not mislabelled as a "more formal variant" task');
    ok(/ma’nosi o‘zgarmasin/.test(byId.ex7.intro),
        'ex7 tells the learner to preserve the meaning');
    /* REPAIR I: the model preserves the proposition */
    eq('ex7 model preserves the proposition', byId.ex7.namuna,
        'Я думаю, что технологии полезны. → По моему мнению, технологии полезны.');
    ok(byId.ex7.namuna.indexOf('играют важную роль') === -1,
        'the ex7 model does not swap in a different claim');
}

/* ------------------------------------------------------------------- Ex9 */
{
    /* REPAIR J */
    eq('ex9 #10 uses the repaired natural wording', at('ex9', 9).q,
        'Современным людям необходимо уделять больше внимания полноценному отдыху и восстановлению.');
    ok(items('ex9').every(it => it.q.indexOf('ментальному отдыху') === -1),
        'ex9 never ships the awkward «ментальному отдыху»');
    ok(/Дело в том, что/.test(byId.ex9.intro) && /Нельзя отрицать, что/.test(byId.ex9.intro),
        'ex9 names both justification constructions');
}

/* ------------------------------------------------------------------ Ex10 */
{
    /* NEWLY AUTHORED: the source stops after Ex9 and this course uses ten
       main groups, so a final function-identification exercise was written. */
    eq('ex10 is a choice exercise', byId.ex10.type, 'choice');
    const FUNCS = ['Позиция', 'Проверка понимания', 'Сильное признание', 'Контраст',
                   'Обоснование', 'Следствие', 'Условие', 'Вывод'];
    items('ex10').forEach((it, i) => {
        eq(`ex10 #${i + 1} offers the eight functions`, (it.options || []).join(','), FUNCS.join(','));
        ok(FUNCS.indexOf(it.answer) !== -1, `ex10 #${i + 1} key is one of the eight functions`);
    });
    eq('ex10 keys', items('ex10').map(it => it.answer).join(','),
        'Позиция,Проверка понимания,Сильное признание,Контраст,Обоснование,'
        + 'Следствие,Условие,Вывод,Вывод,Проверка понимания');
    /* every prompt must actually open with a marker of the function it claims */
    const OPENERS = {
        'Позиция': [/^По моему мнению,/],
        'Проверка понимания': [/^Если я правильно понимаю,/, /^Насколько я понимаю,/],
        'Сильное признание': [/^Нельзя отрицать, что/, /^Нельзя не признать, что/],
        'Контраст': [/^С одной стороны,/, /^Однако/],
        'Обоснование': [/^Дело в том, что/, /^Основная проблема заключается/],
        'Следствие': [/^Это приводит к тому, что/, /^В результате/],
        'Условие': [/при условии, что/, /^Если /],
        'Вывод': [/^Таким образом,/, /^В конечном счёте/]
    };
    items('ex10').forEach((it, i) => {
        ok(OPENERS[it.answer].some(rx => rx.test(it.q)),
            `ex10 #${i + 1} prompt really carries a «${it.answer}» marker`);
    });
    /* REPAIR D again: the «В конечном счёте» item must be comma-free */
    const vks = items('ex10').find(it => /^В конечном счёте/.test(it.q));
    ok(!!vks, 'ex10 drills «В конечном счёте»');
    ok(vks.q.indexOf('В конечном счёте решение') !== -1,
        'the ex10 «В конечном счёте» prompt has no comma');
    ok(items('ex10').every(it => it.q.indexOf('В конечном счёте,') === -1),
        'ex10 never writes «В конечном счёте,» with a comma');
    let own = 0, blank = 0;
    items('ex10').forEach(it => {
        if (UI.matchItem(it, it.answer) === true) own++;
        if (UI.matchItem(it, '') === false) blank++;
    });
    eq('every ex10 key is accepted by the real scorer', own, 10);
    eq('every blank ex10 answer is rejected', blank, 10);
}

/* ------------------------------------------------------------------ audio */
{
    const a = byId.audio1;
    eq('audio1 is a choice exercise', a.type, 'choice');
    eq('audio1 uses the true/false style', a.style, 'tf');
    eq('audio1 has 10 items', a.items.length, 10);
    /* REPAIR L: the source-provided title, in an all-Russian activity shell */
    eq('audio1 uses the source-provided recording title', a.title,
        'Современное общество и его проблемы');
    ok(a.title.indexOf('Rost') === -1 && a.title.indexOf('yolg') === -1,
        'the mixed Uzbek/Russian source heading is not shipped');
    ok(/Прослушайте аудио/.test(a.intro), 'audio1 tells the learner to LISTEN, in Russian');
    ['Matn asosida', 'Matnga asoslanib', 'по тексту', 'прочитайте текст']
        .forEach(bad => ok(a.intro.indexOf(bad) === -1,
            `audio1 instruction is not a read-the-text task («${bad}»)`));

    const EXPECTED = 'audios/' + encodeURIComponent('Б2 16 урок.mp3');
    eq('audio1 points at the topic 16 recording', a.audioSrc, EXPECTED);
    eq('the src decodes to the real path', decodeURIComponent(a.audioSrc), 'audios/Б2 16 урок.mp3');
    ok(fs.existsSync(path.join(ROOT, decodeURIComponent(a.audioSrc))),
        'the topic 16 MP3 exists on disk');
    const dataSrc = fs.readFileSync(path.join(ROOT, 'b2-lesson-data.js'), 'utf8');
    eq('the topic 16 MP3 is referenced exactly once', dataSrc.split(EXPECTED).length - 1, 1);
    [13, 14, 15].forEach(n => ok(
        a.audioSrc.indexOf(encodeURIComponent('Б2 ' + n + ' урок.mp3')) === -1,
        `audio1 does not point at the topic ${n} recording`));

    a.items.forEach((it, i) => {
        eq(`audio1 #${i + 1} offers Правда / Ложь`, (it.options || []).join(','), 'Правда,Ложь');
        ok(it.answer === 'Правда' || it.answer === 'Ложь', `audio1 #${i + 1} key is one of the options`);
    });
    const flat = JSON.stringify(a.items);
    ['Рост', 'Rost', 'Yolg', 'To‘g‘ri', 'Noto‘g‘ri', 'Неправда', 'Верно', 'Неверно']
        .forEach(bad => ok(flat.indexOf(bad) === -1, `audio1 choices never use «${bad}»`));

    const STATEMENTS = [
        'Современное общество сталкивается с большим количеством проблем.',
        'По мнению автора, технологии не оказывают никакого влияния на жизнь людей.',
        'Интернет позволяет людям быстро получать информацию и общаться.',
        'Чрезмерное использование социальных сетей может привести к зависимости.',
        'Автор считает, что проблема технологий особенно сильно влияет на пожилых людей.',
        'В интернете всегда публикуется только достоверная информация.',
        'Экологические проблемы требуют серьёзного внимания.',
        'Решение общественных проблем зависит только от государства.',
        'Автор считает, что для решения проблем необходимо сотрудничество государства, организаций и граждан.',
        'Автор считает, что современные проблемы можно решить только усилиями отдельных людей.'
    ];
    STATEMENTS.forEach((s, i) => eq(`audio1 #${i + 1} keeps the source statement`, a.items[i].q, s));

    eq('audio answers follow the source key',
        a.items.map(it => it.answer).join(','),
        'Правда,Ложь,Правда,Правда,Ложь,Ложь,Правда,Ложь,Правда,Ложь');
    eq('five Правда, as the source dictates', a.items.filter(it => it.answer === 'Правда').length, 5);
    eq('five Ложь, as the source dictates', a.items.filter(it => it.answer === 'Ложь').length, 5);

    let own = 0, opp = 0, blank = 0;
    a.items.forEach(it => {
        if (UI.matchItem(it, it.answer) === true) own++;
        if (UI.matchItem(it, it.answer === 'Правда' ? 'Ложь' : 'Правда') === false) opp++;
        if (UI.matchItem(it, '') === false) blank++;
    });
    eq('every audio key is accepted by the real scorer', own, 10);
    eq('every opposite audio answer is rejected', opp, 10);
    eq('every blank audio answer is rejected', blank, 10);

    const lesson = JSON.stringify(t16);
    ['неотъемлемой частью', 'Только совместными усилиями', 'ошибочные выводы']
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
        if (String(it.q).length > 240) longQ++;
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
    const a = v.indexOf('name: "Повторение сложных конструкций B2"');
    ok(a > -1, 'paid vocabulary has a topic 16 deck');
    const authoredIds = [...v.matchAll(/\n                    id: (\d+),/g)].map(m => Number(m[1]));
    const vFrontier = Math.max.apply(null, authoredIds);
    eq('vocabulary frontier matches the lesson frontier', vFrontier, frontier);
    eq('all 16 paid decks are authored', authoredIds.length, 16);
    /* FINAL FRONTIER: no generated future decks remain, and no Topic 17 */
    eq('no generated future deck remains in the paid deck list',
        v.split('...generateLockedTopics').length - 1, 0);
    eq('no generateLockedTopics(17) was invented',
        v.split('generateLockedTopics(17)').length - 1, 0);
    eq('no stale generateLockedTopics(16) remains',
        v.split('...generateLockedTopics(16)').length - 1, 0);

    const nextDeck = v.indexOf('\n                    id: ', a + 1);
    const seg = nextDeck > -1 ? v.slice(a, nextDeck) : v.slice(a);
    const cards = [...seg.matchAll(/\{ ru: "((?:[^"\\]|\\.)*)", uz: "((?:[^"\\]|\\.)*)" \}/g)]
        .map(m => [m[1], m[2]]);
    eq('paid vocabulary topic 16 has all 80 source cards', cards.length, 80);
    const ru = cards.map(c => c[0]);
    eq('80 unique Russian units', new Set(ru).size, 80);
    eq('no duplicate card', new Set(cards.map(c => c.join('|'))).size, 80);
    eq('no empty Russian side', ru.filter(x => !x.trim()).length, 0);
    eq('no empty Uzbek side', cards.filter(c => !c[1].trim()).length, 0);
    eq('first card', ru[0], 'современное общество');
    eq('last card', ru[79], 'долгосрочный');
    /* REPAIR K */
    ok(ru.indexOf('дебаты') !== -1, 'the deck uses the nominative «дебаты»');
    ok(ru.indexOf('дебат') === -1, 'the deck never ships the bare «дебат»');

    const demo = fs.readFileSync(path.join(ROOT, 'b2-demo-vocabulary.html'), 'utf8');
    eq('topic 16 vocabulary never becomes free demo content',
        demo.split('Повторение сложных конструкций B2').length - 1, 0);
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
        const t = list.find(x => x.id === 16);
        ok(!!(t && t.grammar && t.grammar.length > 1000), `${tag}: topic 16 renders a real lesson`);
        eq(`${tag}: topic 16 shows no coming-soon shell`, t.content, '');
        eq(`${tag}: topic 16 lock state`, t.isLocked, demoMode);
        eq(`${tag}: topic 16 subscription lock state`, t.isSubscriptionLocked, demoMode);

        /* THE FINAL STATE: every canonical topic is a real lesson */
        eq(`${tag}: all 16 topics carry real grammar`,
            list.filter(x => x.grammar && x.grammar.length > 1000).length, 16);
        eq(`${tag}: ZERO coming-soon shells remain`,
            list.filter(x => x.content && x.content.length).length, 0);
        ok(!list.find(x => x.id === 17), `${tag}: there is no topic 17`);
        ok(hw.eval('b2ExerciseData(17)') === null, `${tag}: topic 17 has no lesson payload`);
        for (let i = 1; i <= 16; i++) {
            ok(hw.eval('b2ExerciseData(' + i + ')') !== null,
                `${tag}: topic ${i} has a real lesson payload`);
        }
        if (demoMode) {
            eq('demo: only topics 1-3 stay open',
                list.filter(x => !x.isLocked).map(x => x.id).join(','), '1,2,3');
            eq('demo: topics 4-16 are all locked REAL lessons',
                list.filter(x => x.id >= 4 && x.isLocked && x.grammar.length > 1000).length, 13);
        }
    });
}

/* ------------------------------------------------------------------ report */
console.log('='.repeat(60));
if (fail === 0) {
    console.log(`  ✅ B2 TOPIC 16: ${pass}/${pass} passed`
        + `  (open ${openCount} · deterministic ${detCount} · multi ${multi}`
        + ` · accepted variants ${variants})`);
} else {
    console.log(`  ❌ B2 TOPIC 16: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
}
console.log('='.repeat(60) + '\n');
process.exit(fail === 0 ? 0 : 1);
