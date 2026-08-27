#!/usr/bin/env node
/**
 * verify_b2_topic14.cjs — B2 Lesson 14 «Средства аргументации».
 *
 * What this file pins, and why:
 *
 *  1. DEFINITION. The source called every marker a "grammatical construction".
 *     The lesson instead sorts them by FUNCTION — speech construction,
 *     conjunction, discourse marker, argument model — and says outright that
 *     «например / однако / таким образом» are not grammatical constructions.
 *  2. A stance marker is NOT evidence. «Я считаю, что это полезно» is only a
 *     thesis; «Очевидно, что…» is rhetoric, not proof.
 *  3. «С одной стороны / с другой стороны»: the second part need not be the
 *     logical negation of the first — it may simply be another aspect.
 *  4. Polite disagreement is gender-fair: согласен AND согласна are both
 *     taught, plus a gender-neutral alternative, so the course is not
 *     implicitly male-only.
 *  5. Reason markers differ in REGISTER (потому что / так как / поскольку /
 *     дело в том, что) and are not freely interchangeable syntactically.
 *  6. Пример ≠ доказательство.
 *  7. Contrast markers are not perfect synonyms (но / однако / тем не менее /
 *     с другой стороны / несмотря на это / в то же время).
 *  8. PUNCTUATION. «Тем не менее» and sentence-initial «Однако» do NOT take a
 *     comma; «Таким образом,» «Следовательно,» «Например,» do. Both the
 *     grammar and Ex7 are pinned against the wrong pattern.
 *  9. Conclusion markers are distinguished, not treated as interchangeable.
 *
 *  Ex1 repairs the source's predicative forms (удобная→удобна, интересная→
 *  интересна, комфортная→комфортна, удобные→удобны) and the unnatural
 *  «Интернет предоставляет информацию» → «позволяет быстро получать».
 *
 *  Ex10 IS NEWLY AUTHORED. The source text promises «10 ta mashq» but supplies
 *  only nine — there is no source Exercise 10. Rather than pretend otherwise,
 *  a marker-function classification exercise was written to close the gap.
 *
 *  The audio truth map was SUPPLIED by the source. It was additionally
 *  cross-checked against the real MP3 with a local whisper.cpp decode and
 *  agreed on all ten items; no value was inverted or rebalanced.
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

console.log('\n=== B2 TOPIC 14 — Средства аргументации ===');

/* ------------------------------------------------------------ data presence */
const all = w.B2_LESSON_DATA.topics;
for (let i = 1; i <= 13; i++) ok(!!all.find(t => t.id === i), `topic ${i} still present`);
const t14 = all.find(t => t.id === 14);
ok(!!t14, 'topic 14 exists');
if (!t14) { console.log('missing lesson 14'); process.exit(1); }
eq('topic 14 appears exactly once', all.filter(t => t.id === 14).length, 1);
eq('topic 14 title', t14.title, 'Средства аргументации');
ok(t14.isLocked === false && t14.isSubscriptionLocked === false, 'topic 14 ships unlocked');

const syll = w.B2_TOPICS;
eq('B2 syllabus still has 16 topics', syll.length, 16);
eq('syllabus and lesson agree on the topic 14 title',
    (syll.find(t => t.id === 14) || {}).title, t14.title);
eq('topic 15 keeps its canonical title',
    (syll.find(t => t.id === 15) || {}).title, 'Стилистика речи');

const ids = all.map(t => t.id).sort((a, b) => a - b);
const frontier = ids[ids.length - 1];
ok(ids.join(',') === Array.from({ length: frontier }, (_, i) => i + 1).join(','),
    `authored lesson ids are contiguous 1..${frontier}`);
ok(frontier >= 14, `topic 14 is authored (frontier ${frontier})`);
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
const G = t14.grammar || '';
const gdoc = new JSDOM('<body><div id="g"></div></body>').window.document;
gdoc.getElementById('g').innerHTML = G;
const GT = gdoc.getElementById('g').textContent.replace(/\s+/g, ' ');
const block = (n) => {
    const from = G.indexOf('<h4>' + n + '. ');
    const to = n === 10 ? G.length : G.indexOf('<h4>' + (n + 1) + '. ');
    return G.slice(from, to);
};
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

ok(G.length > 8000, `grammar is a full lesson (${G.length} chars)`);
ok(!/\$\{/.test(G), 'no template placeholder leaked');
for (let n = 1; n <= 10; n++) ok(G.indexOf('<h4>' + n + '. ') !== -1, `grammar block ${n} is numbered`);
eq('10 numbered blocks + 1 summary heading', (G.match(/<h4/g) || []).length, 11);
ok(/b2g-check/.test(G), 'the closing self-check uses the B2 check card');

/* --- REPAIR 1: the definition is functional, not "all grammar" --- */
{
    const b1 = text(block(1));
    ['nutqiy konstruksiya', 'bog‘lovchi', 'kirish', 'dalil qurish modeli']
        .forEach(k => ok(b1.indexOf(k) !== -1, `block 1 names the category «${k}»`));
    ok(/grammatik konstruksiya emas/.test(b1),
        'block 1 states outright that example/contrast markers are NOT grammatical constructions');
    ['например', 'однако', 'таким образом']
        .forEach(m => ok(b1.indexOf(m) !== -1, `block 1 cites «${m}» as a discourse marker`));
    ok(/fikr \+ sabab \+ dalil/.test(b1) || /fikr.{0,40}sabab.{0,40}dalil/.test(b1),
        'block 1 keeps the core five-part model');
}

/* --- REPAIR 2: a stance marker is not evidence --- */
{
    const b2 = text(block(2));
    ok(b2.indexOf('Я считаю, что это полезно') !== -1,
        'block 2 uses the "only a thesis" example');
    ok(/faqat.{0,20}tezis/.test(b2), 'and labels it as only a thesis');
    ok(/o‘zi dalil emas/.test(b2), 'block 2 says a stance marker is not itself evidence');
    ok(b2.indexOf('Очевидно, что') !== -1 && b2.indexOf('Нельзя отрицать, что') !== -1,
        'block 2 keeps the categorical markers');
    ok(/isbot emas/.test(b2), 'and states that they are NOT proof');
    /* the strength ladder */
    ['Я думаю, что', 'На мой взгляд', 'По моему мнению', 'Я убеждён, что']
        .forEach(m => ok(b2.indexOf(m) !== -1, `block 2 grades «${m}»`));
}

/* --- REPAIR 3: the two sides need not be logical negations --- */
{
    const b3 = text(block(3));
    ok(b3.indexOf('С одной стороны, социальные сети помогают быстро получать информацию.') !== -1,
        'block 3 keeps the social-media pair');
    ok(b3.indexOf('С другой стороны, некоторым людям не хватает живого общения.') !== -1,
        'block 3 keeps the remote-work pair');
    ok(/mantiqiy inkori bo‘lishi shart emas/.test(b3),
        'block 3 states the second side need NOT be the logical negation of the first');
    ok(/vergul/.test(b3), 'block 3 states the comma rule for the two openers');
}

/* --- REPAIR 4: gender-fair polite disagreement --- */
{
    const b4 = text(block(4));
    ok(b4.indexOf('согласен') !== -1, 'block 4 teaches «согласен»');
    ok(b4.indexOf('согласна') !== -1, 'block 4 teaches «согласна»');
    ok(/erkak/.test(b4) && /ayol/.test(b4), 'block 4 labels which form belongs to whom');
    /* A negative control deleted ONE of the two neutral rows and this block
       stayed green, because the assertion was an OR. Both rows are authored
       content and each is pinned on its own, so losing either now fails. */
    ok(/Мне трудно полностью согласиться с тем, что/.test(b4),
        'block 4 keeps the neutral «Мне трудно полностью согласиться с тем, что…»');
    ok(/Я не могу полностью согласиться с тем, что/.test(b4),
        'block 4 keeps the neutral «Я не могу полностью согласиться с тем, что…»');
    eq('block 4 marks exactly two forms as gender-neutral',
        (b4.match(/jinsdan qat’i nazar/g) || []).length, 2);
    ok(b4.indexOf('Я не согласен!') !== -1, 'block 4 keeps the direct form');
    ok(/keskin/.test(b4), 'and marks it as sharper in tone');
}

/* --- REPAIR 5: reason markers differ in register --- */
{
    const b5 = text(block(5));
    ['потому что', 'так как', 'поскольку', 'дело в том, что', 'это связано с тем, что']
        .forEach(m => ok(b5.indexOf(m) !== -1, `block 5 lists «${m}»`));
    ok(/kitobiy/.test(b5), 'block 5 marks «поскольку» as bookish');
    ok(/betaraf/.test(b5), 'block 5 marks the neutral options');
    ok(/o‘rnini bosa olmaydi/.test(b5),
        'block 5 denies that they are interchangeable in every syntactic position');
}

/* --- REPAIR 6: example is not proof --- */
{
    const b6 = text(block(6));
    ok(b6.indexOf('например') !== -1 && b6.indexOf('к примеру') !== -1,
        'block 6 keeps both example markers');
    ok(/Пример ≠ доказательство|пример.{0,30}doказательство|Пример ≠/.test(b6)
        || b6.indexOf('Пример ≠ доказательство') !== -1,
        'block 6 states that an example is not a proof');
    ['факт', 'статистика', 'исследования'].forEach(k =>
        ok(b6.indexOf(k) !== -1, `block 6 names the stronger evidence type «${k}»`));
}

/* --- REPAIR 7: contrast markers are distinguished --- */
{
    const b7 = text(block(7));
    [['но', 'oddiy'], ['однако', 'rasmiy'], ['тем не менее', 'yon berish'],
     ['с другой стороны', 'jihat'], ['несмотря на это', 'qaramay'], ['в то же время', 'birga']
    ].forEach(([m, sense]) => {
        ok(b7.indexOf(m) !== -1, `block 7 lists «${m}»`);
        ok(b7.indexOf(sense) !== -1, `block 7 explains the «${m}» sense («${sense}»)`);
    });
    /* and the model sentences use the CORRECT punctuation */
    ok(b7.indexOf('Тем не менее оно требует высокой самоорганизации.') !== -1,
        'block 7 models «Тем не менее» WITHOUT a comma');
    ok(b7.indexOf('Тем не менее, оно требует') === -1,
        'block 7 never models the comma after «Тем не менее»');
}

/* --- REPAIR 8: acknowledge-then-contrast --- */
{
    const b8 = text(block(8));
    ['Я согласен с тем, что', 'Нельзя не признать, что', 'Я понимаю этот аргумент, однако',
     'В какой-то степени я с вами согласен, но'
    ].forEach(m => ok(b8.indexOf(m) !== -1, `block 8 keeps the model «${m}»`));
    ['Мне кажется, что', 'Я бы сказал, что', 'Я бы не стал утверждать, что',
     'Насколько я понимаю', 'Я не уверен, что'
    ].forEach(m => ok(b8.indexOf(m) !== -1, `block 8 keeps the hedge «${m}»`));
    ok(/kategoriklikni kamaytirish/.test(b8),
        'block 8 explains hedging as tone reduction, not necessarily uncertainty');
    ok(/tan olish/.test(b8), 'block 8 gives the acknowledge → contrast → defend pattern');
}

/* --- REPAIR 9: conclusion markers are distinguished --- */
{
    const b9 = text(block(9));
    [['поэтому', 'bevosita natija'], ['следовательно', 'mantiqiy xulosa'],
     ['таким образом', 'umumlashtirish'], ['в итоге', 'pirovard'],
     ['в заключение', 'yakuniy'], ['из этого следует, что', 'kelib chiqadi']
    ].forEach(([m, sense]) => {
        ok(b9.indexOf(m) !== -1, `block 9 lists «${m}»`);
        ok(b9.indexOf(sense) !== -1, `block 9 distinguishes «${m}» («${sense}»)`);
    });
}

/* --- REPAIR 10: the full model and the PUNCTUATION repair --- */
{
    const b10 = text(block(10));
    ['Позиция', 'Причина', 'Пример', 'Контраргумент', 'Ответ', 'Вывод']
        .forEach(s => ok(b10.indexOf(s) !== -1, `block 10 labels the stage «${s}»`));
    ok(b10.indexOf('На мой взгляд, социальные сети играют важную роль в современной жизни.') !== -1,
        'block 10 keeps the worked position');
    ok(b10.indexOf('Таким образом, всё зависит от того, как человек ими пользуется.') !== -1,
        'block 10 keeps the worked conclusion');
    /* the two punctuation rules, each shown with ❌ and ✅ */
    ok(b10.indexOf('Тем не менее оно требует высокой самоорганизации.') !== -1,
        'block 10 gives the ✅ «Тем не менее» form');
    ok(b10.indexOf('Однако это подходит не всем.') !== -1,
        'block 10 gives the ✅ sentence-initial «Однако» form');
    const seg = b10.split(/(?=[❌✅])/).map(x => x.trim()).filter(Boolean);
    const wrong = seg.filter(x => x[0] === '❌').join(' | ');
    const right = seg.filter(x => x[0] === '✅').join(' | ');
    ok(wrong.indexOf('Тем не менее, оно требует') !== -1,
        'block 10 marks «Тем не менее,» with ❌');
    ok(wrong.indexOf('Однако, это подходит не всем') !== -1,
        'block 10 marks «Однако,» with ❌');
    ok(right.indexOf('Тем не менее оно требует') !== -1,
        'block 10 marks the comma-free «Тем не менее» with ✅');
    ok(right.indexOf('Однако это подходит не всем') !== -1,
        'block 10 marks the comma-free «Однако» with ✅');
    ok(right.indexOf('Тем не менее, оно требует') === -1,
        'the comma form is never marked correct');
    ok(right.indexOf('Однако, это подходит') === -1,
        'the «Однако,» form is never marked correct');
    /* introductory phrases that DO take a comma */
    ok(/Таким образом,/.test(b10) && /Следовательно,/.test(b10) && /Например,/.test(b10),
        'block 10 keeps the markers that DO take a comma');
    ok(/kirish birikmalari/.test(b10),
        'block 10 explains why those take a comma');
}

/* --- the closing self-check --- */
{
    const chk = G.slice(G.indexOf('b2g-check'));
    ok((chk.match(/<li>/g) || []).length >= 8, 'the self-check has at least eight questions');
    ['Tezisim', 'Sabab', 'Misol', 'boshqa tomonni', 'hurmatli', 'Vergullar', 'Xulosa']
        .forEach(k => ok(chk.indexOf(k) !== -1, `the self-check asks about «${k}»`));
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
    ok(stray === null, `topic 14 grammar never closes a paragraph it did not open${stray === null ? '' : ` (at ${stray})`}`);
    ok(nested === null, 'topic 14 grammar never nests <p> inside <p>');
    eq('topic 14 grammar closes every paragraph it opens', pDepth, 0);
    ok(unopened === null, `topic 14 grammar has no unopened closing tag${unopened === null ? '' : ` (</${unopened}>)`}`);
    ok(order === null, `topic 14 grammar closes its tags in order${order === null ? '' : ` (${order})`}`);
    eq('topic 14 grammar leaves no tag unclosed', stack.length, 0);
    ['p', 'div', 'table', 'tr', 'th', 'td', 'h4', 'b', 'ul', 'li', 'span'].forEach(t => {
        const o = (G.match(new RegExp('<' + t + '(?=[ >])', 'g')) || []).length;
        const c = (G.match(new RegExp('</' + t + '>', 'g')) || []).length;
        if (o || c) eq(`topic 14 grammar balances <${t}>`, c, o);
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
const ex = t14.exercises || [];
const byId = {};
ex.forEach(g => { byId[g.id] = g; });
const items = id => (byId[id] && byId[id].items) || [];
const at = (id, i) => items(id)[i] || {};

eq('11 exercise groups', ex.length, 11);
eq('group ids follow the B2 convention', ex.map(g => g.id).join(','),
    'ex1,ex2,ex3,ex4,ex5,ex6,ex7,ex8,ex9,ex10,audio1');
ex.forEach(g => {
    eq(`${g.id} has 10 items`, g.items.length, 10);
    ok(!!g.title && /mashq/.test(g.title), `${g.id} has an Uzbek task title`);
    ok(!!g.intro && g.intro.length > 20, `${g.id} has a real instruction`);
    ok(g.showTask === true, `${g.id} shows its task text`);
});
eq('110 items in total', ex.reduce((n, g) => n + g.items.length, 0), 110);

/* -------------------------------------------- openness, observed not assumed */
const NONSENSE = 'зззz яяяy ююю';
const isOpen = (it) => UI.matchItem(it, NONSENSE) === true;
const OPEN_GROUPS = ['ex1', 'ex2', 'ex3', 'ex4', 'ex5', 'ex6', 'ex8', 'ex9'];
const DET_GROUPS = ['ex7', 'ex10', 'audio1'];
const OPEN_SAMPLE = 'С одной стороны, это удобно, с другой стороны, это требует времени.';

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
/* no production reference answers hide inside the open groups */
eq('no open item stores an answer key',
    ex.filter(g => OPEN_GROUPS.indexOf(g.id) !== -1)
      .reduce((n, g) => n + g.items.filter(it => it.answer !== null).length, 0), 0);

/* --------------------------------------------- Ex1: repaired Russian forms */
{
    const qs = items('ex1').map(it => it.q);
    /* the source's attributive forms were unnatural in the predicate */
    /* Only the PREDICATIVE use was wrong. «интересная работа» in item 10 is
       attributive and perfectly correct, so the check is anchored to the exact
       source phrase rather than to the adjective form alone. */
    [['Жизнь в большом городе интересна', 'Жизнь в большом городе интересная'],
     ['Работа из дома комфортна', 'Работа из дома комфортная'],
     ['Онлайн-курсы удобны', 'Онлайн-курсы удобные'],
     ['Онлайн-работа удобна', 'Онлайн-работа удобная']
    ].forEach(([good, bad]) => {
        const inLesson = qs.concat([byId.ex1.namuna]);
        ok(inLesson.some(q => q.indexOf(good) !== -1), `ex1 uses the repaired predicative «${good}»`);
        ok(inLesson.every(q => q.indexOf(bad) === -1), `ex1 never ships the source form «${bad}»`);
    });
    /* and the attributive form that was always correct is untouched */
    ok(qs.some(q => q.indexOf('интересная работа') !== -1),
        'ex1 keeps the correct attributive «интересная работа»');
    ok(qs.some(q => q.indexOf('Интернет позволяет быстро получать информацию') !== -1),
        'ex1 uses the more natural «Интернет позволяет быстро получать информацию»');
    ok(qs.every(q => q.indexOf('Интернет быстро предоставляет информацию') === -1),
        'ex1 never ships the unnatural source wording');
    ok(items('ex1').every(it => it.q.indexOf(' / ') !== -1), 'every ex1 prompt is a pair');
    ok(/удобна/.test(byId.ex1.namuna), 'the ex1 model itself uses the repaired predicative');
}

/* --------------------------------------------- Ex5: the same predicative repair
   Ex1's predicative forms were repaired at authoring time, but Ex5 #3 kept the
   source's «Работа из дома комфортная.» — the identical defect one exercise
   later. The check is anchored to Ex5 and to the exact sentence: a GLOBAL ban
   on «комфортная» would be wrong, because the attributive use is fine. */
{
    const qs5 = items('ex5').map(it => it.q);
    ok(qs5.some(q => q.indexOf('Работа из дома комфортна.') !== -1),
        'ex5 uses the repaired predicative «Работа из дома комфортна.»');
    ok(qs5.every(q => q.indexOf('Работа из дома комфортная') === -1),
        'ex5 never ships the source predicative «Работа из дома комфортная»');
    /* and the repair must not have turned a productive item into a graded one */
    const it3 = at('ex5', 2);
    ok(it3.free === true && it3.answer === null, 'ex5 #3 stays genuinely open after the repair');
    eq('ex5 #3 keeps its full source pair', it3.q,
        'Работа из дома комфортна. Иногда трудно отделить работу от личной жизни.');
}

/* ------------------------------------------------------ Ex2: gender fairness */
{
    ok(/согласен/.test(byId.ex2.intro) && /согласна/.test(byId.ex2.intro),
        'ex2 explicitly accepts both согласен and согласна');
    ok(/Мне трудно полностью согласиться/.test(byId.ex2.intro)
        || /jinsdan qat’i nazar/.test(byId.ex2.intro),
        'ex2 also offers a gender-neutral option');
    eq('ex2 keeps the source claims', items('ex2').map(it => it.q).join(' | '),
        'Деньги — самое главное в жизни. | Интернет только мешает учёбе. | '
        + 'Молодые люди не любят читать книги. | Жить в большом городе лучше, чем в маленьком. | '
        + 'Высокая зарплата делает человека счастливым. | Социальные сети вредны для общества. | '
        + 'Все студенты должны учиться онлайн. | Путешествия — это пустая трата денег. | '
        + 'Современные технологии делают людей ленивыми. | '
        + 'Успешный человек обязательно должен много работать.');
}

/* ---------------------------------------------------- Ex3 / Ex4 instructions */
ok(/потому что/.test(byId.ex3.intro) && /так как/.test(byId.ex3.intro) && /поскольку/.test(byId.ex3.intro),
    'ex3 names all three reason markers');
ok(items('ex3').every(it => /…$/.test(it.q)), 'every ex3 prompt is an unfinished sentence');
ok(/например/.test(byId.ex4.intro) && /к примеру/.test(byId.ex4.intro),
    'ex4 names both example markers');

/* ------------------------------------------------------------------- Ex7 */
{
    eq('ex7 is a choice exercise', byId.ex7.type, 'choice');
    eq('ex7 keys', items('ex7').map(it => it.answer).join(','),
        'однако,поэтому,однако,но,тем не менее,поэтому,С одной стороны,Тем не менее,Таким образом,Однако');
    items('ex7').forEach((it, i) => {
        eq(`ex7 #${i + 1} offers exactly two options`, (it.options || []).length, 2);
        ok(it.options.indexOf(it.answer) !== -1, `ex7 #${i + 1} key belongs to its options`);
    });
    /* the punctuation repair, inside the exercise itself */
    eq('ex7 #8 has no comma after «Тем не менее»', at('ex7', 7).q,
        'У этой работы высокая зарплата. ______ она требует слишком много времени.');
    eq('ex7 #10 has no comma after «Однако»', at('ex7', 9).q,
        'Я согласен с вами в некоторых вопросах. ______ есть моменты, которые я хотел бы уточнить.');
    ok(items('ex7').every(it => it.q.indexOf('______, она требует') === -1
        && it.q.indexOf('______, есть моменты') === -1),
        'ex7 never pre-writes the wrong comma into the gap');
    /* but the markers that DO take a comma keep it */
    ok(at('ex7', 8).q.indexOf('______, решение было принято') !== -1,
        'ex7 #9 keeps the comma «Таким образом,»');
    ok(at('ex7', 6).q.indexOf('______, онлайн-обучение удобно') !== -1,
        'ex7 #7 keeps the comma «С одной стороны,»');
}

/* ------------------------------------------------------------------ Ex10 */
{
    /* NEWLY AUTHORED — the source promised ten exercises and supplied nine. */
    eq('ex10 is a choice exercise', byId.ex10.type, 'choice');
    const FUNCS = ['Позиция', 'Причина', 'Пример', 'Контраргумент', 'Вывод'];
    items('ex10').forEach((it, i) => {
        eq(`ex10 #${i + 1} offers the five argument functions`, (it.options || []).join(','), FUNCS.join(','));
        ok(FUNCS.indexOf(it.answer) !== -1, `ex10 #${i + 1} key is one of the five functions`);
    });
    eq('ex10 keys', items('ex10').map(it => it.answer).join(','),
        'Позиция,Позиция,Причина,Причина,Пример,Пример,Контраргумент,Контраргумент,Вывод,Вывод');
    eq('each function is drilled exactly twice',
        FUNCS.map(f => items('ex10').filter(it => it.answer === f).length).join(','), '2,2,2,2,2');
    /* every prompt must actually open with a marker of the function it claims */
    const OPENERS = {
        'Позиция': [/^На мой взгляд,/, /^Я считаю, что/],
        'Причина': [/^Это связано с тем, что/, /потому что/],
        'Пример': [/^Например,/, /^К примеру,/],
        'Контраргумент': [/^С другой стороны,/, /^Однако/],
        'Вывод': [/^Таким образом,/, /^Из этого следует, что/]
    };
    items('ex10').forEach((it, i) => {
        ok(OPENERS[it.answer].some(rx => rx.test(it.q)),
            `ex10 #${i + 1} prompt really carries a «${it.answer}» marker`);
    });
    /* the sentence-initial «Однако» here must also be comma-free */
    ok(items('ex10').every(it => it.q.indexOf('Однако,') === -1),
        'ex10 never writes «Однако,» with a comma');
}

/* ------------------------------------------------------------------ audio */
{
    const a = byId.audio1;
    eq('audio1 is a choice exercise', a.type, 'choice');
    eq('audio1 uses the true/false style', a.style, 'tf');
    eq('audio1 has 10 items', a.items.length, 10);
    const EXPECTED = 'audios/' + encodeURIComponent('Б2 14 урок.mp3');
    eq('audio1 points at the topic 14 recording', a.audioSrc, EXPECTED);
    eq('the src decodes to the real path', decodeURIComponent(a.audioSrc), 'audios/Б2 14 урок.mp3');
    ok(fs.existsSync(path.join(ROOT, decodeURIComponent(a.audioSrc))),
        'the topic 14 MP3 exists on disk');
    const dataSrc = fs.readFileSync(path.join(ROOT, 'b2-lesson-data.js'), 'utf8');
    eq('the topic 14 MP3 is referenced exactly once', dataSrc.split(EXPECTED).length - 1, 1);
    [11, 12, 13].forEach(n => ok(
        a.audioSrc.indexOf(encodeURIComponent('Б2 ' + n + ' урок.mp3')) === -1,
        `audio1 does not point at the topic ${n} recording`));

    /* LISTEN, never read-the-text: the source said «Matn asosida» but shipped an MP3 */
    ok(/tinglang/.test(a.intro), 'audio1 tells the learner to LISTEN');
    ['Matn asosida', 'Matnga asoslanib', 'по тексту', 'прочитайте текст']
        .forEach(bad => ok(a.intro.indexOf(bad) === -1,
            `audio1 instruction is not a read-the-text task («${bad}»)`));
    /* the source gave no recording title — none was invented */
    ok(/Rost yoki yolg‘on/.test(a.title), 'audio1 uses the generic B2 audio title');
    ok(!/Современные технологии — польза|Польза или зависимость/i.test(a.title + a.intro),
        'no recording title was fabricated');

    /* B2 labels only — never the source's Rost/Yolg‘on inside the choices */
    a.items.forEach((it, i) => {
        eq(`audio1 #${i + 1} offers Правда / Ложь`, (it.options || []).join(','), 'Правда,Ложь');
        ok(it.answer === 'Правда' || it.answer === 'Ложь', `audio1 #${i + 1} key is one of the options`);
    });
    const flat = JSON.stringify(a.items);
    ['Rost', 'Yolg', 'Неправда', 'Верно', 'Неверно'].forEach(bad =>
        ok(flat.indexOf(bad) === -1, `audio1 choices do not use «${bad}»`));

    const STATEMENTS = [
        'Современные технологии стали частью повседневной жизни человека.',
        'Автор считает, что технологии имеют только положительные стороны.',
        'С помощью интернета сегодня можно оплачивать счета и записываться к врачу.',
        'Онлайн-сервисы могут быть удобны для людей, которые живут далеко от крупных городов.',
        'Автор считает, что использование смартфона всегда улучшает качество отдыха.',
        'Постоянное использование технологий может уменьшать количество времени на живое общение.',
        'Автор полностью согласен с мнением, что технологии делают людей ленивыми.',
        'По мнению автора, проблема заключается не только в технологиях, но и в том, как человек ими пользуется.',
        'Автор считает, что современные технологии нельзя использовать для учёбы и работы.',
        'В заключении автор рекомендует использовать технологии разумно и контролировать своё время.'
    ];
    STATEMENTS.forEach((s, i) => eq(`audio1 #${i + 1} keeps the source statement`, a.items[i].q, s));

    /* the SOURCE-PROVIDED key, confirmed against the recording */
    eq('audio answers follow the source key (Rost/Yolg‘on → Правда/Ложь)',
        a.items.map(it => it.answer).join(','),
        'Правда,Ложь,Правда,Правда,Ложь,Правда,Ложь,Правда,Ложь,Правда');
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

    /* the source supplied no transcript and none ships */
    const lesson = JSON.stringify(t14);
    ['Современные технологии стали неотъемлемой частью', 'не выходя из дома',
     'проверяя социальные сети', 'ответственного отношения'
    ].forEach(line => ok(lesson.indexOf(line) === -1, 'no transcript sentence leaked into the product'));
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
    const a = v.indexOf('name: "Средства аргументации"');
    ok(a > -1, 'paid vocabulary has a topic 14 deck');
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

    /* The deck ends at the NEXT deck, not at the generateLockedTopics marker.
       Slicing to the marker silently swallowed every later deck the moment a
       further topic was authored, which is exactly what happened here. */
    const nextDeck = v.indexOf('\n                    id: ', a + 1);
    let marker = v.indexOf('generateLockedTopics(' + (vFrontier + 1) + ')');
    if (marker < 0) marker = v.length;          /* final frontier: no marker left */
    const b = (nextDeck > -1 && nextDeck < marker) ? nextDeck : marker;
    const seg = v.slice(a, b);
    const cards = [...seg.matchAll(/\{ ru: "((?:[^"\\]|\\.)*)", uz: "((?:[^"\\]|\\.)*)" \}/g)]
        .map(m => [m[1], m[2]]);
    /* the source numbers 1..89 — there is no #90 and none was invented */
    eq('paid vocabulary topic 14 has all 89 source cards', cards.length, 89);
    const ru = cards.map(c => c[0]);
    eq('89 unique Russian units', new Set(ru).size, 89);
    eq('no duplicate card', new Set(cards.map(c => c.join('|'))).size, 89);
    eq('no empty Russian side', ru.filter(x => !x.trim()).length, 0);
    eq('no empty Uzbek side', cards.filter(c => !c[1].trim()).length, 0);
    /* both gendered disagreement forms survive */
    ok(ru.indexOf('Я не совсем согласен…') !== -1, 'the deck keeps «Я не совсем согласен…»');
    ok(ru.indexOf('Я не совсем согласна…') !== -1, 'the deck keeps «Я не совсем согласна…»');
    /* §37 repair: факт must not be glossed as "dalil" too */
    const fakt = cards.find(c => c[0] === 'факт');
    ok(!!fakt, 'the deck keeps «факт»');
    eq('«факт» is not glossed as a synonym of аргумент/доказательство', fakt[1], 'fakt');
    ok(cards.find(c => c[0] === 'доказательство'), 'the deck still keeps «доказательство»');
    ok(cards.find(c => c[0] === 'довод'), 'the deck still keeps «довод»');
    /* the punctuation repair reaches the deck too */
    ok(ru.indexOf('Тем не менее…') !== -1, 'the deck card is «Тем не менее…» without a comma');
    ok(ru.indexOf('Тем не менее,…') === -1, 'the deck never ships «Тем не менее,…»');
    /* phrase cards keep their ellipses */
    ok(ru.filter(x => x.indexOf('…') !== -1).length >= 40,
        'phrase cards keep their ellipses');
    eq('first card', ru[0], 'аргумент');
    eq('last card', ru[88], 'В целом,…');

    const demo = fs.readFileSync(path.join(ROOT, 'b2-demo-vocabulary.html'), 'utf8');
    eq('topic 14 vocabulary never becomes free demo content',
        demo.split('Средства аргументации').length - 1, 0);
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
        const t = list.find(x => x.id === 14);
        ok(!!(t && t.grammar && t.grammar.length > 1000), `${tag}: topic 14 renders a real lesson`);
        eq(`${tag}: topic 14 shows no coming-soon shell`, t.content, '');
        eq(`${tag}: topic 14 lock state`, t.isLocked, demoMode);
        eq(`${tag}: topic 14 subscription lock state`, t.isSubscriptionLocked, demoMode);
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
    console.log(`  ✅ B2 TOPIC 14: ${pass}/${pass} passed`
        + `  (open ${openCount} · deterministic ${detCount} · multi ${multi}`
        + ` · accepted variants ${variants})`);
} else {
    console.log(`  ❌ B2 TOPIC 14: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
}
console.log('='.repeat(60) + '\n');
process.exit(fail === 0 ? 0 : 1);
