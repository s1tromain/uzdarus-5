#!/usr/bin/env node
/**
 * verify_b2_topic6.cjs — B2 Lesson 6 «Сравнительные конструкции».
 * Pins content, the B2 task-block format, paid-only vocabulary, audio, and the
 * demo window: topics 4-6 must stay locked in demo.
 *
 * Topic 6 uses the B2 storage shape, not the A2 one: the listening exercise and
 * its Правда/Ложь statements are ONE group (audioSrc + style 'tf'), which is why
 * this lesson has 10 groups (9 grammar + 1 audio), not 11.
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

console.log('\n=== B2 TOPIC 6 — Сравнительные конструкции ===');

/* ------------------------------------------------------------ data presence */
const all = w.B2_LESSON_DATA.topics;
[1, 2, 3, 4, 5].forEach(id => ok(!!all.find(t => t.id === id), `topic ${id} still present`));
const t6 = all.find(t => t.id === 6);
ok(!!t6, 'topic 6 exists');
if (!t6) { console.log('missing lesson 6'); process.exit(1); }
ok(t6.id === 6, 'topic 6 has id 6');
ok(t6.title === 'Сравнительные конструкции', 'topic 6 title is the syllabus title');
ok(t6.isLocked === false && t6.isSubscriptionLocked === false, 'topic 6 ships unlocked');
ok(all.length >= 6, `topic 6 is among the authored lessons (${all.length} authored)`);
ok(all.filter(t => t.id === 6).length === 1, 'topic 6 is authored exactly once');
ok(/Taqqoslash konstruksiyalari/.test(t6.description || ''),
    'topic 6 description names the lesson in Uzbek');

/* the 16-topic syllabus is untouched and agrees with the authored title */
const syll = w.B2_TOPICS;
ok(Array.isArray(syll) && syll.length === 16, `B2 syllabus still has 16 topics (${syll.length})`);
ok((syll.find(t => t.id === 6) || {}).title === t6.title,
    'syllabus title and lesson title agree for topic 6');

/* ---------------------------------------------------------------- grammar */
const G = t6.grammar || '';
ok(G.length > 6000, `grammar is a full lesson (${G.length} chars)`);
ok(!/\$\{/.test(G), 'no template placeholder leaked');

/* seven numbered blocks + the closing summary */
[1, 2, 3, 4, 5, 6, 7].forEach(n =>
    ok(G.indexOf('<h4>' + n + '. ') !== -1, `grammar block ${n} is numbered`));
ok((G.match(/<h4>/g) || []).length === 8, '7 numbered blocks + 1 summary heading');
ok(G.indexOf('Asosiy modellarni yodlab oling') !== -1, 'closing summary block present');
ok(/b2g-check/.test(G), 'summary uses the B2 check card');

[['чем…, тем…', '1. Чем …, тем … — Qancha …, shuncha …'],
 ['такой же, как', '2. Такой же …, как … — Xuddi shunday …, kabi'],
 ['гораздо', '3. Гораздо … — Ancha / juda ham …roq'],
 ['чем отличается от', '4. Чем отличается … от …?'],
 ['более …, чем', '5. Более …, чем … — …ga qaraganda …roq'],
 ['не такой, как', '6. Не такой …, как … — … kabi emas'],
 ['самый / самая / самое / самые', '7. Самый / самая / самое / самые — eng …'],
 ['чем/тем formula', 'Чем + сравнительная степень, тем + сравнительная степень'],
 ['gender table (m)', 'такой же большой город'],
 ['gender table (f)', 'такая же красивая улица'],
 ['gender table (n)', 'такое же современное здание'],
 ['gender table (pl)', 'такие же интересные люди'],
 ['гораздо + comparative', 'Ташкент гораздо больше Самарканда.'],
 ['гораздо более + adjective', 'Этот район гораздо более современный.'],
 ['отличается от', 'Чем Ташкент отличается от Самарканда?'],
 ['не такой agreement', 'Ташкент не такой спокойный, как маленькие города.'],
 ['superlative table', 'самая активная студентка'],
 ['один из самых', 'Москва — один из самых больших городов.']
].forEach(([label, needle]) => ok(G.indexOf(needle) !== -1, `grammar keeps: ${label}`));

/* the two pedagogical points the source material got wrong or left implicit */
ok(/один из самых/.test(G) && /<b>самых<\/b> shakli keladi/.test(G),
    'grammar explains WHY «один из самых» takes самых, not самые');
const warn = G.slice(G.indexOf('Diqqat!'), G.indexOf('4. Чем отличается'));
ok(warn.indexOf('более спокойнее') !== -1 && warn.indexOf('более удобнее') !== -1,
    'grammar shows the forbidden double comparative as ❌');
ok(warn.indexOf('❌') !== -1 && warn.indexOf('✅') !== -1,
    'the double-comparative warning is marked wrong vs right');
ok(warn.indexOf('более спокойный') !== -1,
    'the warning offers the correct «более + long adjective» repair');

/* every B2 grammar table is the 2-column shape the B2 layout expects */
{
    const doc = new JSDOM('<body><div id="g"></div></body>').window.document;
    doc.getElementById('g').innerHTML = G;
    const tables = [...doc.querySelectorAll('table.b2g-t')];
    ok(tables.length === 12, `grammar renders 12 b2g-t tables (${tables.length})`);
    let wide = 0, headless = 0;
    tables.forEach(tb => {
        [...tb.querySelectorAll('tr')].forEach(tr => {
            if (tr.children.length !== 2) wide++;
        });
        if (!tb.querySelector('th')) headless++;
    });
    ok(wide === 0, `every grammar table row has exactly 2 cells (${wide} bad rows)`);
    ok(headless === 0, `every grammar table has a header row (${headless} without)`);
}

/* -------------------------------------------------------------- exercises */
const ex = t6.exercises || [];
const gg = ex.filter(g => !g.audioSrc);
const ag = ex.filter(g => g.audioSrc);
ok(ex.length === 10, `10 exercise groups (${ex.length})`);
ok(gg.length === 9, `9 grammar exercise groups (${gg.length})`);
ok(ag.length === 1, `1 audio exercise group (${ag.length})`);
ok(gg.reduce((a, g) => a + g.items.length, 0) === 90, '90 grammar items');
ok(ag[0].items.length === 10, 'audio exercise has 10 items');
ok(ex.reduce((a, g) => a + g.items.length, 0) === 100, '100 graded items in total');
ok(ex.every(g => g.items.length === 10), 'every group carries 10 items');
ok(ex.map(g => g.id).join(',') === 'ex1,ex2,ex3,ex4,ex5,ex6,ex7,ex8,ex9,audio1',
    'group ids follow the B2 convention');

const TITLES = [
    "1-mashq. Чем…, тем… konstruksiyasini to'ldiring",
    '2-mashq. Такой же…, как…',
    '3-mashq. Гораздо более…',
    "4-mashq. Более…, чем… — to'g'ri variantni tanlang",
    '5-mashq. Не такой…, как…',
    '6-mashq. Shaharlarni taqqoslang',
    '7-mashq. Eng yuqori daraja',
    "8-mashq. To'g'ri variantni tanlang",
    "9-mashq. Xatoni toping va to'g'rilang"
];
TITLES.forEach((t, i) => ok(gg[i] && gg[i].title === t, `group ${i + 1} is "${t}"`));

/* ------------------------------------------------------------ answer keys */
let missing = 0, junk = 0, badOpt = 0, unmatched = 0, variants = 0;
let nonsenseAccepted = 0, blankAccepted = 0, openItems = 0;
ex.forEach(g => g.items.forEach(it => {
    const acc = Array.isArray(it.answer) ? it.answer : [it.answer];
    variants += acc.length;
    if (!acc.length || acc.every(x => x == null || !String(x).trim())) missing++;
    if (/TODO|FIXME|placeholder|undefined|null/i.test(JSON.stringify(it.answer))) junk++;
    if (Array.isArray(it.options) && !acc.some(x => it.options.indexOf(x) !== -1)) badOpt++;
    acc.forEach(x => { if (!w.UzExerciseUI.matchItem(it, x)) unmatched++; });
    if (it.free === true) openItems++;
    if (w.UzExerciseUI.matchItem(it, 'зззz яяяy ююю')) nonsenseAccepted++;
    if (w.UzExerciseUI.matchItem(it, '')) blankAccepted++;
}));
ok(missing === 0, `all 100 items have an answer key (${missing} missing)`);
ok(junk === 0, 'no TODO / placeholder / undefined / null in any answer');
ok(badOpt === 0, `every choice answer is among its options (${badOpt} bad)`);
ok(unmatched === 0, `the shared scorer accepts every accepted answer (${unmatched} rejected)`);
ok(nonsenseAccepted === 0, `no item accepts nonsense (${nonsenseAccepted} did)`);
ok(blankAccepted === 0, `no item accepts a blank answer (${blankAccepted} did)`);
ok(openItems === 0, 'topic 6 has no free/open items — all 100 are auto-graded');

const prompts = ex.flatMap(g => g.items.map(i => i.q));
ok(new Set(prompts).size === 100, `all 100 prompts are distinct (${new Set(prompts).size})`);
ok(prompts.every(q => typeof q === 'string' && q.trim().length > 0), 'every item has a prompt');

/* ----------------------------------------------------- pedagogical guards */
/* «более» + a comparative form is the error this lesson teaches against, so it
   must never appear inside an accepted answer anywhere in the topic. */
let doubleComp = 0;
ex.forEach(g => g.items.forEach(it => {
    const acc = Array.isArray(it.answer) ? it.answer : [it.answer];
    acc.forEach(a => {
        /* JS \\b is ASCII-only: it never fires between a Cyrillic letter and a
           space, so a \\b-anchored version of this rule matches nothing at all
           and the guard is decorative. Anchor on explicit delimiters instead. */
        if (/(^|[\s(«"])более\s+\S*(?:ее|ше|же|че)(?=[\s.,!?)»"]|$)/.test(String(a))) doubleComp++;
    });
}));
ok(doubleComp === 0, `no accepted answer contains «более + сравнительная» (${doubleComp} found)`);

/* ex4 is exactly that contrast: one right simple comparative vs one wrong pair */
{
    let good = 0;
    gg[3].items.forEach(it => {
        const key = Array.isArray(it.answer) ? it.answer[0] : it.answer;
        const wrong = it.options.filter(o => o !== key);
        if (it.options.length === 2 && wrong.length === 1
            && /^более /.test(wrong[0]) && !/^более /.test(key)) good++;
    });
    ok(good === 10, `ex4 pits the correct comparative against «более + сравнительная» (${good}/10)`);
    const k = (i) => (Array.isArray(gg[3].items[i].answer) ? gg[3].items[i].answer[0] : gg[3].items[i].answer);
    ok(k(0) === 'больше' && k(8) === 'шире', 'ex4 #1 and #9 keys are verbatim');
}

/* ex7 teaches самых; only #5 («один из…») may take it */
{
    const opts = gg[6].items[0].options;
    ok(opts.length === 5 && opts.indexOf('самых') === 4,
        'ex7 offers самых as a fifth option');
    ok(gg[6].items.every(it => it.options.join(',') === 'самый,самая,самое,самые,самых'),
        'every ex7 item offers the same five forms');
    const keys = gg[6].items.map(it => (Array.isArray(it.answer) ? it.answer[0] : it.answer));
    ok(keys[4] === 'самых', 'ex7 #5 («один из …») keys самых, not самые');
    ok(/один из/.test(gg[6].items[4].q), 'ex7 #5 is the «один из» prompt');
    ok(keys.filter(k => k === 'самых').length === 1,
        'самых is keyed exactly once — only after «один из»');
    let leaked = 0;
    gg[6].items.forEach((it, i) => { if (i !== 4 && w.UzExerciseUI.matchItem(it, 'самых')) leaked++; });
    ok(leaked === 0, `no other ex7 item accepts самых (${leaked} did)`);
}

/* ex6 is a production exercise: both correct Russian comparatives are accepted */
{
    const multi = gg[5].items.filter(it => Array.isArray(it.answer) && it.answer.length === 2);
    ok(multi.length === 9, `ex6 accepts both comparative forms on 9 items (${multi.length})`);
    ok(gg[5].items[0].answer.length === 1,
        'ex6 #1 (большой) accepts only «больше» — «более большой» is not idiomatic');
    ok(gg[5].items[0].answer[0] === 'Москва больше, чем Ташкент.', 'ex6 #1 key is verbatim');
    ok(multi.every(it => /^более /.test(it.answer[1].split(' ').slice(1).join(' '))
        || / более /.test(it.answer[1])), 'ex6 second variant uses «более + прилагательное»');
    ok(gg[5].items[1].answer[0] === 'Самарканд спокойнее, чем Ташкент.'
       && gg[5].items[1].answer[1] === 'Самарканд более спокойный, чем Ташкент.',
        'ex6 #2 keys both accepted forms verbatim');
    ok(gg[5].type === 'input', 'ex6 is a free-typed production exercise, not a card builder');
}

/* ex9 error-correction keys, verbatim */
{
    const fixes = [
        'Чем больше город, тем больше возможностей.',
        'Ташкент такой же большой, как Москва.',
        'Эта квартира удобнее, чем моя.',
        'Этот район гораздо более современный.',
        'Чем больше человек работает, тем больше он устаёт.',
        'Моя комната такая же светлая, как твоя.',
        'Это самый красивый город.',
        'Жизнь в деревне спокойнее, чем в городе.',
        'Эти города такие же интересные, как столица.',
        'Этот район не такой дорогой, как центр.'
    ];
    fixes.forEach((f, i) => {
        const a = gg[8].items[i].answer;
        ok((Array.isArray(a) ? a[0] : a) === f, `ex9 #${i + 1} correction is verbatim`);
    });
    ok(gg[8].items.filter(it => Array.isArray(it.answer) && it.answer.length > 1).length === 2,
        'ex9 #3 and #4 accept both legitimate repairs');
    /* the prompt must still contain the mistake, or there is nothing to fix */
    let same = 0;
    gg[8].items.forEach(it => {
        const a = Array.isArray(it.answer) ? it.answer[0] : it.answer;
        if (String(it.q).trim() === String(a).trim()) same++;
    });
    ok(same === 0, `every ex9 prompt actually differs from its correction (${same} identical)`);
}

/* agreement exercises must key every gender/number at least twice */
[[1, 'ex2', ['такой же', 'такая же', 'такое же', 'такие же']],
 [4, 'ex5', ['не такой', 'не такая', 'не такое', 'не такие']]
].forEach(([gi, label, forms]) => {
    const keys = gg[gi].items.map(it => (Array.isArray(it.answer) ? it.answer[0] : it.answer));
    forms.forEach(f => ok(keys.filter(k => k === f).length >= 2,
        `${label} drills "${f}" at least twice (${keys.filter(k => k === f).length})`));
    ok(gg[gi].items.every(it => it.options.join(',') === forms.join(',')),
        `${label} offers all four agreement forms on every item`);
});

/* ----------------------------------------------------------------- format */
ok(ex.every(g => g.showTask === true), 'every group opts into the task block');
ok(ex.every(g => !g.howTo), 'no group carries a "Как выполнять" briefing');
ok(ex.every(g => typeof g.intro === 'string' && g.intro.length > 20),
    'every group states its task in Uzbek (10 instructions)');
ok(gg.filter(g => g.namuna).length === 9, 'all 9 grammar groups carry their Namuna');
ok(!ag[0].namuna, 'the audio group has no invented Namuna');

ex.forEach(g => {
    const d = w.document.createElement('div');
    d.innerHTML = w.UzExerciseUI.renderGroup(g);
    ok(!!d.querySelector('.b2h-howto-t'), `${g.id}: exercise name rendered`);
    ok(!!d.querySelector('.b2h-howto-task'), `${g.id}: Uzbek task rendered`);
    ok(!d.querySelector('.b2h-howto-h'), `${g.id}: no "Как выполнять" heading`);
    ok(!/Как выполнять/.test(d.textContent), `${g.id}: phrase absent`);
    ok(!/\u{1F4A1}/u.test(d.textContent), `${g.id}: no lightbulb card`);
    ok(d.querySelectorAll('.b2h-item').length === g.items.length, `${g.id}: all items rendered`);
    if (g.namuna) ok(/Namuna:/.test(d.textContent), `${g.id}: Namuna rendered`);
});

/* ------------------------------------------------------------------ audio */
ok(ag[0].id === 'audio1', 'the audio group keeps the B2 id');
ok(ag[0].type === 'choice' && ag[0].style === 'tf',
    'audio statements use the B2 true/false style (one merged group)');
ok(ag[0].items.every(it => it.options.join(',') === 'Правда,Ложь'),
    'every audio statement offers Правда / Ложь');
ok(/%D0%912%206%20%D1%83%D1%80%D0%BE%D0%BA\.mp3/.test(ag[0].audioSrc),
    'audioSrc points at "Б2 6 урок.mp3"');
ok(decodeURIComponent(ag[0].audioSrc) === 'audios/Б2 6 урок.mp3',
    'audioSrc decodes to the exact path');
ok(fs.existsSync(path.join(ROOT, 'audios', 'Б2 6 урок.mp3')), 'the audio file exists on disk');
ok(ag[0].items.map(i => i.answer).join(',') ===
   'Правда,Ложь,Правда,Ложь,Правда,Ложь,Правда,Правда,Ложь,Правда',
    'audio answers follow the required order');
ok(/Два разных образа жизни/.test(ag[0].intro || ''), 'audio task names the recording');

/* ------------------------------------------------- vocabulary (paid only) */
{
    const s = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-vocabulary.html'), 'utf8');
    const i6 = s.indexOf('                    id: 6,');
    ok(i6 > -1, 'paid vocabulary has topic 6');
    const i7 = s.indexOf('                    id: 7,', i6);
    const seg = s.slice(s.lastIndexOf('{', i6),
        i7 > -1 ? s.lastIndexOf('{', i7) : s.indexOf('generateLockedTopics('));
    const cards = (seg.match(/\{ ru: "/g) || []).length;
    ok(cards === 74, `paid vocabulary topic 6 has all 74 entries (${cards})`);
    ok(/name: "Сравнительные конструкции"/.test(seg), 'paid vocabulary topic 6 is this lesson');
    ok(/isLocked: false/.test(seg), 'paid vocabulary topic 6 is unlocked');
    [['сравнивать', 'first verb'], ['переехать в другой город', 'last phrase'],
     ['такой же, как', 'agreement forms'], ['гораздо более', 'intensifier'],
     ['чем…, тем…', 'correlative'], ['окраина', 'city vocabulary'],
     ['уровень жизни', 'life-quality nouns']
    ].forEach(([wd, label]) => ok(seg.indexOf('"' + wd + '"') !== -1,
        `paid vocabulary keeps ${label} ("${wd}")`));

    /* the source listed медленный twice; only one card may ship */
    const pairs = [...seg.matchAll(/\{ ru: "([^"]+)", uz: "([^"]+)" \}/g)].map(m => m[1] + '|' + m[2]);
    ok(pairs.length === 74, `74 parsable cards (${pairs.length})`);
    ok(new Set(pairs).size === 74, `no duplicate card in topic 6 (${74 - new Set(pairs).size} dupes)`);
    ok(pairs.filter(p => p.startsWith('медленный|')).length === 1,
        'the duplicated source row «медленный — sekin» ships once');

    const authored = [...s.matchAll(/\n                    id: (\d+),/g)].map(m => Number(m[1]));
    const frontier = Math.max.apply(null, authored);
    ok(authored.indexOf(6) !== -1 && frontier >= 6,
        'topic 6 is an authored (unlocked) vocabulary deck');
    /* FINAL-FRONTIER SAFE. While canonical decks remain unauthored they are
       generated from the next id. Once every canonical deck is real the spread
       is removed entirely — demanding generateLockedTopics(N+1) then would
       assert a phantom Topic 17. */
    const _genSpread = s.indexOf('...generateLockedTopics(') !== -1;
    if (_genSpread) {
        ok(new RegExp('generateLockedTopics\\(' + (frontier + 1) + '\\)').test(s),
            `locked vocabulary topics start right after the last authored topic (${frontier + 1})`);
    } else {
        ok(!new RegExp('generateLockedTopics\\(' + (frontier + 1) + '\\)').test(s),
            'the paid deck list is complete — no future deck is generated');
        ok(s.split('...generateLockedTopics(').length - 1 === 0,
            'no generated future deck remains in the paid deck list');
    }
    ok(!new RegExp('generateLockedTopics\\(6\\)').test(s),
        'topic 6 is no longer generated as locked');
    ok(/Условные предложения/.test(s) && /Прямая и косвенная речь/.test(s)
       && /Деепричастие \(ravishdosh\)/.test(s) && /Причастие \(sifatdosh\)/.test(s),
        'paid vocabulary topics 2-5 intact');

    const demo = fs.readFileSync(path.join(ROOT, 'b2-demo-vocabulary.html'), 'utf8');
    ok(!/                    id: 6,/.test(demo), 'demo vocabulary untouched (no topic 6)');
    ok(!/                    id: 5,/.test(demo), 'demo vocabulary untouched (no topic 5)');
    ok(/generateLockedTopics\(4\)/.test(demo), 'demo still locks from topic 4');
}

/* ------------------------------------------------------ course integration */
{
    const c = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-course.html'), 'utf8');
    ok(/function b2ExerciseData/.test(c), 'the course still reads lessons through b2ExerciseData');
    ok(/var locked = B2_DEMO_MODE && t\.id > 3;/.test(c),
        'the demo paywall rule is untouched by this lesson');
    ok(!/B2_LESSON_DATA/.test(c) || /b2ExerciseData/.test(c),
        'no parallel lesson engine was introduced');
    ok(!/finalExam|certificate/i.test(c.slice(c.indexOf('function buildB2Topics'),
        c.indexOf('function buildB2Topics') + 3000)),
        'no B2 final exam or certificate was added');
}

/* ------------------------------------------------------------------ report */
console.log('='.repeat(60));
if (fail === 0) {
    console.log(`  ✅ B2 TOPIC 6: ${pass}/${pass} passed  (accepted-answer variants: ${variants})`);
} else {
    console.log(`  ❌ B2 TOPIC 6: ${fail} failed / ${pass + fail}\n`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
}
console.log('='.repeat(60) + '\n');
process.exit(fail === 0 ? 0 : 1);
