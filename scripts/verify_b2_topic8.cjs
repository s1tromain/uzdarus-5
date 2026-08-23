#!/usr/bin/env node
/**
 * verify_b2_topic8.cjs — B2 Lesson 8 «Глаголы движения с приставками».
 *
 * What shapes this suite:
 *
 *  1. THIRTY of the 110 items are genuinely OPEN (Ex4, Ex8, Ex10). The source
 *     asks the learner about their own journey; there is no unique destination
 *     to key against. Openness is OBSERVED through the product's own
 *     matchItem(), which applies isOpenItem() before any comparison.
 *
 *  2. The source had four grammar defects and four broken Ex3 prompts. Each fix
 *     is pinned here so it cannot silently regress — in particular the
 *     «Каждый день … ездит» habitual-route drill, which the source had keyed
 *     with the one-direction ехать.
 *
 *  3. Legitimate ambiguity is accepted rather than punished: unspecified
 *     speaker gender (Ex1 #2, Ex3 #3, Ex5 #5/#10, Ex9), unspecified travel mode
 *     (Ex9 #2/#8) and the three Ex6 sentences whose malformed original does not
 *     determine direction.
 *
 * Grammar assertions read RENDERED TEXT, not raw HTML: the lesson colours
 * СВ/НСВ with .b2g-tone-* spans, which split sentences mid-string.
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

console.log('\n=== B2 TOPIC 8 — Глаголы движения с приставками ===');

/* ------------------------------------------------------------ data presence */
const all = w.B2_LESSON_DATA.topics;
[1, 2, 3, 4, 5, 6, 7].forEach(id => ok(!!all.find(t => t.id === id), `topic ${id} still present`));
const t8 = all.find(t => t.id === 8);
ok(!!t8, 'topic 8 exists');
if (!t8) { console.log('missing lesson 8'); process.exit(1); }
eq('topic 8 appears exactly once', all.filter(t => t.id === 8).length, 1);
eq('topic 8 title', t8.title, 'Глаголы движения с приставками');
ok(t8.isLocked === false && t8.isSubscriptionLocked === false, 'topic 8 ships unlocked');
ok(/приставкalar/i.test(t8.description || ''), 'topic 8 description names the prefixes');

const syll = w.B2_TOPICS;
eq('B2 syllabus still has 16 topics', syll.length, 16);
eq('syllabus and lesson agree on the topic 8 title', (syll.find(t => t.id === 8) || {}).title, t8.title);

const ids = all.map(t => t.id).sort((a, b) => a - b);
const frontier = ids[ids.length - 1];
ok(ids.join(',') === Array.from({ length: frontier }, (_, i) => i + 1).join(','),
    `authored lesson ids are contiguous 1..${frontier}`);
ok(frontier >= 8, `topic 8 is authored (frontier ${frontier})`);
ok(!all.find(t => t.id === frontier + 1),
    `topic ${frontier + 1} has no lesson payload — it stays "coming soon"`);

/* ---------------------------------------------------------------- grammar */
const G = t8.grammar || '';
const gdoc = new JSDOM('<body><div id="g"></div></body>').window.document;
gdoc.getElementById('g').innerHTML = G;
const GT = gdoc.getElementById('g').textContent.replace(/\s+/g, ' ');

ok(G.length > 9000, `grammar is a full lesson (${G.length} chars)`);
ok(!/\$\{/.test(G), 'no template placeholder leaked');
for (let n = 1; n <= 7; n++) {
    ok(G.indexOf('<h4>' + n + '. ') !== -1, `grammar block ${n} is numbered`);
}
eq('7 numbered blocks + 1 summary heading', (G.match(/<h4/g) || []).length, 8);
ok(/b2g-check/.test(G), 'the B2 goal uses the check card');
ok(GT.indexOf('B2 darajada asosiy maqsad') !== -1, 'the B2 goal block is present');

[['prefix pairs', 'ехать → приехать'],
 ['вы- pair', 'ехать → выехать'],
 ['зайти pair', 'идти → зайти'],
 ['В- model', 'войти / въехать +'],
 ['В- example', 'Я вошёл в комнату.'],
 ['въехать example', 'Машина въехала в гараж.'],
 ['ВЫ- example', 'Он вышел из дома.'],
 ['ПРИ- example', 'Я приехал в Самарканд.'],
 ['ПРИ- process contrast', 'Я ехал в Самарканд.'],
 ['У- example', 'Он уехал из города.'],
 ['ЗА- example', 'Я зашёл в магазин за водой.'],
 ['ЗА- к + Д.п.', 'По дороге домой я зашёл к другу.'],
 ['ПОД- example', 'Машина подъехала к отелю.'],
 ['ОТ- example', 'Автобус отъехал от остановки.'],
 ['ПЕРЕ- example', 'Они переехали в другой город.'],
 ['ОБ- example', 'Водитель объехал пробку и приехал вовремя.'],
 ['ПРО- example', 'Мы прошли пять километров, прежде чем нашли гостиницу.'],
 ['travel models', 'Машина отъехала от…'],
 ['case table Куда', 'приехать на вокзал'],
 ['case table Откуда', 'уйти с работы'],
 ['case summary', 'Куда? → в / на / к'],
 ['unexpected situations', 'Автобус уехал, пока мы покупали билеты.'],
 ['unexpected situations 2', 'Мы зашли не в тот вагон.'],
 ['B2 construction чтобы', 'Я приехал в Бухару, чтобы посетить старый город.'],
 ['B2 construction как только', 'Как только мы вышли из гостиницы, начался сильный дождь.'],
 ['B2 construction несмотря', 'Несмотря на то что мы заблудились, мы всё-таки дошли до гостиницы.'],
 ['B2 construction из-за', 'Из-за того что автобус сломался, нам пришлось выйти и ждать другой.'],
 ['B2 goal example', 'Когда мы приехали в аэропорт, оказалось, что наш самолёт уже улетел']
].forEach(([label, needle]) => ok(GT.indexOf(needle) !== -1, `grammar keeps: ${label}`));

/* --- SOURCE FIX 1: «зашёл» was given as an example of В-/ВО-, but it is ЗА- --- */
{
    const vBlock = G.slice(G.indexOf('В- / ВО- — ichkariga kirish'), G.indexOf('ВЫ- — ichkaridan'));
    ok(vBlock.length > 200, 'the В-/ВО- block is present');
    ok(vBlock.indexOf('Я вошёл в магазин.') !== -1,
        'the В-/ВО- block teaches «Я вошёл в магазин»');
    ok(vBlock.indexOf('зашёл') === -1 && vBlock.indexOf('зашли') === -1,
        'no ЗА- form is presented as an example of В-/ВО-');
}

/* --- лететь → вылететь, which Ex2 and Ex6 both need --- */
ok(GT.indexOf('лететь → вылететь') !== -1, 'ВЫ- teaches лететь → вылететь');
ok(GT.indexOf('Самолёт вылетел из аэропорта.') !== -1, 'and shows it in a sentence');

/* --- У- must offer BOTH из and с, because its own example uses «с работы» --- */
{
    const uBlock = GT.slice(GT.indexOf('У- — biror joyni tark etish'), GT.indexOf('ЗА- — yo‘l-yo‘lakay'));
    ok(/из.{0,30}Р\.п\./.test(uBlock) && /с.{0,30}Р\.п\./.test(uBlock),
        'the У- model offers both «из + Р.п.» and «с + Р.п.»');
    ok(uBlock.indexOf('Она ушла с работы.') !== -1, 'and keeps the «с работы» example');
    ok(/с работы/.test(GT) && /с вокзала/.test(GT),
        'the grammar explains that the preposition follows the kind of place');
}

/* --- SOURCE FIX 2: ЗА- must teach заехать, which Ex8 #5 uses --- */
{
    const zBlock = GT.slice(GT.indexOf('ЗА- — yo‘l-yo‘lakay'), GT.indexOf('ПОД- — yaqinlashish'));
    ok(zBlock.indexOf('заехать') !== -1, 'ЗА- teaches заехать, not only зайти');
    ok(/заехать.{0,60}transportda/.test(zBlock),
        'and explains заехать as the transport form');
    ok(zBlock.indexOf('По дороге мы заехали в небольшое кафе.') !== -1,
        'with a worked заехать example');
    ok(zBlock.indexOf('Мы заехали на заправку.') !== -1, 'and a second one');
}

/* --- SOURCE FIX 3: ПРО- has TWO senses, both used by the source examples --- */
{
    const pBlock = GT.slice(GT.indexOf('ПРО- — masofani'), GT.indexOf('3. Sayohatda'));
    ok(/masofa/.test(pBlock), 'ПРО- explains the travelled-distance sense');
    ok(/yonidan o‘tib ketish/.test(pBlock), 'ПРО- explains the passing-by sense');
    ok(pBlock.indexOf('пройти мимо дома') !== -1, 'and keeps the «мимо» example');
    ok(pBlock.indexOf('пройти пять километров') !== -1, 'and the distance example');
}

/* --- SOURCE FIX 4: a prefix does not by itself make a verb perfective --- */
{
    ok(/приставка borligi vidni o‘zi belgilamaydi/.test(GT),
        'the grammar states outright that a prefix alone does not decide aspect');
    ['приезжать', 'уезжать', 'входить', 'выходить', 'заходить', 'подходить', 'отходить',
     'подъезжать', 'отъезжать', 'переезжать', 'прилетать', 'улетать'
    ].forEach(v => ok(GT.indexOf(v) !== -1, `the imperfective counterpart «${v}» is taught`));
    /* and the ездить / ехать / приехать / приезжать distinction Ex3 #4 rests on */
    ok(/Каждый день она ездит на работу/.test(GT),
        'ездить is taught as the habitual repeated route');
    ok(/Я ехал в Самарканд/.test(GT), 'ехать as the one-direction process');
    ok(/Он часто приезжает к нам/.test(GT), 'приезжать as repeated arrival');
}

/* every grammar table is the 2-column shape the B2 layout expects */
{
    const tables = [...gdoc.querySelectorAll('table.b2g-t')];
    eq('grammar renders its 22 b2g-t tables', tables.length, 22);
    let wide = 0, headless = 0;
    tables.forEach(tb => {
        [...tb.querySelectorAll('tr')].forEach(tr => { if (tr.children.length !== 2) wide++; });
        if (!tb.querySelector('th')) headless++;
    });
    eq('every grammar table row has exactly 2 cells', wide, 0);
    eq('every grammar table has a header row', headless, 0);
}

/* -------------------------------------------------------------- exercises */
const ex = t8.exercises || [];
const byId = {};
ex.forEach(g => { byId[g.id] = g; });
const at = (id, i) => ((byId[id] && byId[id].items && byId[id].items[i]) || {});

eq('11 exercise groups', ex.length, 11);
eq('group ids follow the B2 convention', ex.map(g => g.id).join(','),
    'ex1,ex2,ex3,ex4,ex5,ex6,ex7,ex8,ex9,ex10,audio1');
ok(ex.every(g => g.items.length === 10), 'every group carries 10 items');
eq('110 items in total', ex.reduce((a, g) => a + g.items.length, 0), 110);
eq('10 main groups', ex.filter(g => !g.audioSrc).length, 10);
eq('1 audio group', ex.filter(g => g.audioSrc).length, 1);
eq('no builder group in this lesson', ex.filter(g => g.type === 'builder').length, 0);

const TITLES = {
    ex1: "1-mashq. To'g'ri fe'lni tanlang",
    ex2: "2-mashq. To'g'ri predlogni qo'ying",
    ex3: '3-mashq. СВ yoki НСВ ni tanlang',
    ex4: "4-mashq. Savolga to'liq javob bering",
    ex5: '5-mashq. Ikki gapni birlashtiring',
    ex6: '6-mashq. Xatoni toping va tuzating',
    ex7: "7-mashq. Vaziyatga mos fe'lni tanlang",
    ex8: '8-mashq. Kutilmagan vaziyatni davom ettiring',
    ex9: '9-mashq. Tarjima qiling',
    ex10: '10-mashq. «Куда? Откуда?»',
    audio1: "Audio bo'yicha «Rost yoki yolg'on» mashqi"
};
Object.keys(TITLES).forEach(id => eq(`${id} title`, byId[id] && byId[id].title, TITLES[id]));

/* -------------------------------------------- openness, observed not assumed */
const NONSENSE = 'зззz яяяy ююю';
const isOpen = (it) => UI.matchItem(it, NONSENSE) === true;
const OPEN_GROUPS = ['ex4', 'ex8', 'ex10'];
const DET_GROUPS = ['ex1', 'ex2', 'ex3', 'ex5', 'ex6', 'ex7', 'ex9', 'audio1'];

let openCount = 0, detCount = 0, multi = 0, variants = 0;
let missing = 0, junk = 0, badOpt = 0, unmatched = 0;
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
        if (Array.isArray(it.options) && !acc.some(x => it.options.indexOf(x) !== -1)) badOpt++;
        acc.forEach(x => { if (!UI.matchItem(it, x)) unmatched++; });
        if (UI.matchItem(it, NONSENSE)) nonsenseAccepted++;
        if (UI.matchItem(it, '')) blankAccepted++;
    }
}));

eq('30 genuinely open items', openCount, 30);
eq('80 deterministic items', detCount, 80);
eq('13 multi-accept items', multi, 13);
eq('every open item is answer:null — no invented key', fakeKeyOnOpen, 0);
eq('every open item accepts a real three-word attempt', openRefusedAttempt, 0);
eq('no open item accepts a one-word non-attempt', oneWordAccepted, 0);
eq('no deterministic item is missing its key', missing, 0);
eq('no TODO / placeholder / undefined / null in any key', junk, 0);
eq('every choice answer is among its options', badOpt, 0);
eq('the shared scorer accepts every accepted answer', unmatched, 0);
eq('no deterministic item accepts nonsense', nonsenseAccepted, 0);
eq('no item of any kind accepts a blank', blankAccepted, 0);

OPEN_GROUPS.forEach(id => eq(`${id} is open end to end`, byId[id].items.filter(isOpen).length, 10));
DET_GROUPS.forEach(id => eq(`${id} is deterministic end to end`,
    byId[id].items.filter(it => !isOpen(it)).length, 10));
eq('multi-accept is spread exactly as intended',
    ['ex1', 'ex2', 'ex3', 'ex5', 'ex6', 'ex7', 'ex9']
        .map(id => id + ':' + byId[id].items.filter(it => Array.isArray(it.answer) && it.answer.length > 1).length)
        .join(' '),
    'ex1:1 ex2:0 ex3:1 ex5:2 ex6:3 ex7:0 ex9:6');

const prompts = ex.flatMap(g => g.items.map(i => i.q));
eq('all 110 prompts are distinct', new Set(prompts).size, 110);

/* -------------------------------------------------- Ex1: finite forms, not infinitives */
{
    const KEYS = [
        ['Вчера мы ___ в Бухару поздно вечером. (приехать / уехать)', ['приехали']],
        ['Когда я ___ из дома, начался дождь. (выйти / войти)', ['вышел', 'вышла']],
        ['Туристы ___ в музей и сразу пошли к экскурсоводу. (зайти / выйти)', ['зашли']],
        ['Автобус уже ___ от остановки. (отъехать / подъехать)', ['отъехал']],
        ['Машина медленно ___ к гостинице. (подъехать / отъехать)', ['подъехала']],
        ['После экскурсии мы ___ из музея. (выйти / войти)', ['вышли']],
        ['Они решили ___ в другой город. (переехать / подойти)', ['переехать']],
        ['Самолёт ___ из аэропорта вовремя. (улететь / приехать)', ['улетел']],
        ['Мы случайно ___ не в тот вагон. (зайти / выйти)', ['зашли']],
        ['Я ___ к кассе и спросил о билетах. (подойти / отойти)', ['подошёл']]
    ];
    KEYS.forEach(([q, a], i) => {
        eq(`ex1 #${i + 1} prompt`, at('ex1', i).q, q);
        eq(`ex1 #${i + 1} key`, JSON.stringify(at('ex1', i).answer), JSON.stringify(a));
    });
    /* only #7 follows «решили», so only #7 may be an infinitive */
    byId.ex1.items.forEach((it, i) => {
        const first = Array.isArray(it.answer) ? it.answer[0] : it.answer;
        const isInf = /(ть|ться)$/.test(first);
        eq(`ex1 #${i + 1} is ${i === 6 ? 'the infinitive after «решили»' : 'a finite form'}`,
            isInf, i === 6);
    });
    /* #2 leaves the speaker's gender open; #10 fixes it through «и спросил» */
    ok(UI.matchItem(at('ex1', 1), 'вышел') && UI.matchItem(at('ex1', 1), 'вышла'),
        'ex1 #2 accepts both genders — the sentence does not name the speaker');
    ok(!UI.matchItem(at('ex1', 9), 'подошла'),
        'ex1 #10 stays masculine — «и спросил» already fixes the agreement');
}

/* --------------------------------------------------------- Ex2: prepositions */
{
    const KEYS = ['из', 'к', 'с', 'в', 'от', 'в', 'из', 'к', 'с', 'из'];
    KEYS.forEach((k, i) => eq(`ex2 #${i + 1} key`, at('ex2', i).answer, k));
    [[0, 'из автобуса'], [1, 'к карте'], [2, 'с работы'], [3, 'в кафе'], [4, 'от гостиницы']]
        .forEach(([i, phrase]) => {
            const it = at('ex2', i);
            const filled = String(it.q).replace(/_{3,}/, it.answer);
            ok(filled.indexOf(phrase) !== -1, `ex2 #${i + 1} produces «${phrase}»`);
        });
    ok(byId.ex2.items.every(it => !Array.isArray(it.answer)),
        'every ex2 item has exactly one correct preposition');
}

/* ---------------------------------------- Ex3: the aspect drill and its repairs */
{
    const KEYS = [['ехали'], ['приехали'], ['вышел', 'вышла'], ['ездит'], ['уехали'],
                  ['подходили'], ['подъехал'], ['ходили'], ['улетел'], ['возвращаюсь']];
    KEYS.forEach((a, i) => eq(`ex3 #${i + 1} key`,
        JSON.stringify(at('ex3', i).answer), JSON.stringify(a)));
    eq('only ex3 #3 is multi-accept (speaker gender unspecified)',
        byId.ex3.items.map((it, i) => (it.answer.length > 1 ? i + 1 : 0)).filter(Boolean).join(','), '3');

    /* SOURCE FIX: #3 and #7 were ambiguous between process and result */
    ok(/^Как только я /.test(at('ex3', 2).q),
        'ex3 #3 uses «Как только», which forces the completed reading');
    ok(/^Как только автобус /.test(at('ex3', 6).q) && /двери открылись/.test(at('ex3', 6).q),
        'ex3 #7 uses «Как только … двери открылись», which forces the result');
    /* SOURCE FIX: #5 needed a completion marker */
    ok(/окончательно/.test(at('ex3', 4).q),
        'ex3 #5 carries «окончательно», so completed departure is the reading');

    /* SOURCE FIX: a habitual route needs ездить, not the one-direction ехать.
       The source offered (ехать / приехать); both were wrong for «Каждый день». */
    const habit = at('ex3', 3);
    ok(/Каждый день/.test(habit.q), 'ex3 #4 is the habitual-route drill');
    ok(/\(ездить \/ приехать\)/.test(habit.q),
        'ex3 #4 offers ездить — the source\'s (ехать / приехать) was lexically wrong');
    ok(UI.matchItem(habit, 'ездит'), 'ex3 #4 accepts ездит');
    ['едет', 'приезжает', 'приехала', 'приехал', 'ехала', 'ехал']
        .forEach(bad => ok(!UI.matchItem(habit, bad),
            `ex3 #4 refuses «${bad}» — «Каждый день» demands the habitual ездить`));
}

/* ------------------------------------- Ex4 / Ex8 / Ex10: the source cues survive */
{
    const CUES = {
        ex4: ['Куда ты приехал?', 'Откуда он вышел?', 'Куда вы зашли?', 'Откуда они уехали?',
              'К кому она подошла?', 'Откуда отъехала машина?', 'Куда вы переехали?',
              'Откуда прилетели туристы?', 'Куда ты вошёл?', 'Откуда они вышли?'],
        ex8: ['Мы зашли в кафе, но неожиданно…', 'Когда автобус подъехал к остановке,…',
              'Мы вышли из гостиницы и вдруг…', 'Самолёт уже улетел, поэтому…',
              'По дороге в Самарканд мы заехали…', 'Когда я подошёл к кассе,…',
              'Мы заблудились и случайно вышли…', 'Из-за пробки водитель решил объехать…',
              'Когда мы вошли в вагон,…', 'Когда мы переехали в новый город,…'],
        ex10: ['Куда приехала ваша семья?', 'Откуда вы вышли утром?', 'Куда вы зашли по дороге?',
               'Откуда уехали туристы?', 'К кому подошёл экскурсовод?', 'К чему подъехала машина?',
               'От чего отошёл пассажир?', 'Куда переехали ваши друзья?',
               'Откуда вы выехали рано утром?', 'Куда вошли пассажиры?']
    };
    Object.keys(CUES).forEach(id => CUES[id].forEach((cue, i) =>
        eq(`${id} #${i + 1} keeps the source cue`, at(id, i).q, cue)));

    /* Ex8 #5 keeps the source's заехали — the grammar now teaches заехать */
    ok(/заехали/.test(at('ex8', 4).q),
        'ex8 #5 keeps the source «заехали» rather than being downgraded to «зашли»');

    ok(/TO'LIQ gap/.test(byId.ex4.intro), 'ex4 asks for a complete sentence, not one word');
    ok(/ochiq mashq/.test(byId.ex4.intro), 'ex4 tells the learner it is open');
    ok(/TO'LIQ/.test(byId.ex8.intro), 'ex8 asks for a complete continuation');
    ok(/TO'LIQ javob/.test(byId.ex10.intro), 'ex10 asks for a complete answer');
    ok(/predlog/.test(byId.ex10.intro) && /kelishik/.test(byId.ex10.intro),
        'ex10 names the prefix + preposition + case target');
    [byId.ex4, byId.ex8, byId.ex10].forEach(g =>
        ok(g.items.every(it => typeof it.placeholder === 'string' && it.placeholder.trim()),
            `${g.id}: every open item shows a writing placeholder`));
}

/* ------------------------------------------------------- Ex5: «Когда…» joining */
{
    const KEYS = [
        ['Когда мы вышли из аэропорта, начался сильный дождь.'],
        ['Когда туристы зашли в музей, экскурсовод начал рассказ.'],
        ['Когда автобус подъехал к остановке, пассажиры вошли.'],
        ['Когда мы приехали в гостиницу, мы оставили вещи.'],
        ['Когда я вышел из дома, мне позвонил друг.',
         'Когда я вышла из дома, мне позвонил друг.'],
        ['Когда самолёт прилетел, пассажиры вышли.'],
        ['Когда мы подошли к кассе, билеты уже закончились.'],
        ['Когда они уехали из города, погода резко изменилась.'],
        ['Когда мы вошли в вагон, поезд сразу отправился.'],
        ['Когда я вернулся домой, я обнаружил, что забыл ключи.',
         'Когда я вернулась домой, я обнаружила, что забыла ключи.']
    ];
    KEYS.forEach((a, i) => eq(`ex5 #${i + 1} accepted sentences`,
        JSON.stringify(at('ex5', i).answer), JSON.stringify(a)));
    /* the instruction is what keeps this deterministic without rewriting it */
    ok(/«Когда…»/.test(byId.ex5.intro),
        'ex5 names «Когда…» as the required connector, so other connectors are not silently wrong');
    eq('ex5 has exactly 2 multi-accept items',
        byId.ex5.items.filter(it => it.answer.length > 1).length, 2);
    ok(byId.ex5.items.every(it => it.answer.every(s => /^Когда /.test(s))),
        'every ex5 key uses the «Когда…» model');
    /* #10 has «я» in BOTH clauses, so the gender must agree across the sentence */
    ['Когда я вернулся домой, я обнаружила, что забыла ключи.',
     'Когда я вернулась домой, я обнаружил, что забыл ключи.'
    ].forEach(mixed => ok(!UI.matchItem(at('ex5', 9), mixed),
        'ex5 #10 refuses a mixed-gender sentence'));
}

/* ------------------------------------------------------- Ex6: error correction */
{
    const KEYS = [
        ['Я приехал в Самарканд.', 'Я приехал из Самарканда.'],
        ['Он вышел из автобуса.'],
        ['Мы подошли к кассе.'],
        ['Они зашли в магазин.'],
        ['Машина подъехала к гостинице.'],
        ['Я уехал из Ташкента.', 'Я уехал в Ташкент.'],
        ['Туристы вышли из музея.'],
        ['Мы приехали в Бухару.'],
        ['Она отошла от двери.'],
        ['Самолёт вылетел из аэропорта.', 'Самолёт вылетел в аэропорт.']
    ];
    KEYS.forEach((a, i) => eq(`ex6 #${i + 1} accepted corrections`,
        JSON.stringify(at('ex6', i).answer), JSON.stringify(a)));
    eq('ex6 accepts a second repair on exactly #1, #6 and #10',
        byId.ex6.items.map((it, i) => (it.answer.length > 1 ? i + 1 : 0)).filter(Boolean).join(','),
        '1,6,10');
    ok(byId.ex6.items.every((it, i) => it.answer[0] === KEYS[i][0]),
        'the source model stays the FIRST accepted correction everywhere');
    /* the prompt must still be wrong, or there is nothing to correct */
    let same = 0;
    byId.ex6.items.forEach(it => { if (it.answer.indexOf(String(it.q).trim()) !== -1) same++; });
    eq('every ex6 prompt really differs from its correction', same, 0);
    /* the verb is never changed — only the preposition and case */
    const VERB = ['приехал', 'вышел', 'подошли', 'зашли', 'подъехала',
                  'уехал', 'вышли', 'приехали', 'отошла', 'вылетел'];
    VERB.forEach((v, i) => ok(byId.ex6.items[i].answer.every(a => a.indexOf(v) !== -1),
        `ex6 #${i + 1} keeps the supplied verb «${v}» in every accepted repair`));
}

/* --------------------------------------------------------- Ex7: the verb bank */
{
    const BANK = ['приехать', 'уехать', 'выйти', 'войти', 'зайти',
                  'подойти', 'отойти', 'подъехать', 'переехать', 'выехать'];
    BANK.forEach(v => ok(byId.ex7.intro.indexOf(v) !== -1,
        `ex7 lists «${v}» in its verb bank`));
    ok(/BIR MARTA/.test(byId.ex7.intro),
        'ex7 states the one-use rule, which is what resolves уехать/выехать and войти/зайти');
    const KEYS = ['уехали', 'вошёл', 'подъехала', 'отошёл', 'зашли',
                  'подошла', 'переехали', 'вышли', 'выехал', 'приехали'];
    KEYS.forEach((k, i) => eq(`ex7 #${i + 1} key`, at('ex7', i).answer, k));
    /* every bank verb is consumed exactly once */
    const FORM_OF = { 'уехали': 'уехать', 'вошёл': 'войти', 'подъехала': 'подъехать',
        'отошёл': 'отойти', 'зашли': 'зайти', 'подошла': 'подойти',
        'переехали': 'переехать', 'вышли': 'выйти', 'выехал': 'выехать',
        'приехали': 'приехать' };
    const used = KEYS.map(k => FORM_OF[k]);
    eq('every ex7 key maps to a bank verb', used.filter(Boolean).length, 10);
    eq('each bank verb is used exactly once', new Set(used).size, 10);
    BANK.forEach(v => ok(used.indexOf(v) !== -1, `bank verb «${v}» is actually used`));
}

/* ---------------------------------------------------------- Ex9: translation */
{
    const KEYS = [
        ['U avtobusdan tushdi.', ['Он вышел из автобуса.', 'Она вышла из автобуса.']],
        ['Biz kafega kirib o‘tdik.', ['Мы зашли в кафе.', 'Мы заехали в кафе.']],
        ['Mashina mehmonxonaga yaqinlashdi.', ['Машина подъехала к гостинице.']],
        ['U eshikdan uzoqlashdi.', ['Он отошёл от двери.', 'Она отошла от двери.']],
        ['Ular Toshkentdan ertalab ketishdi.', ['Они уехали из Ташкента утром.']],
        ['Biz boshqa shaharga ko‘chib o‘tdik.', ['Мы переехали в другой город.']],
        ['Men aeroportdan chiqqanimda yomg‘ir yog‘ayotgan edi.',
         ['Когда я вышел из аэропорта, шёл дождь.', 'Когда я вышла из аэропорта, шёл дождь.']],
        ['Biz yo‘lda kichik qishloqqa kirib o‘tdik.',
         ['Мы по дороге зашли в небольшую деревню.', 'Мы по дороге заехали в небольшую деревню.',
          'Мы по дороге зашли в маленькую деревню.', 'Мы по дороге заехали в маленькую деревню.']],
        ['Avtobus bekatdan jo‘nab ketdi.', ['Автобус отъехал от остановки.']],
        ['Ular Moskvaga samolyotda uchib kelishdi.',
         ['Они прилетели в Москву.', 'Они прилетели в Москву на самолёте.']]
    ];
    KEYS.forEach(([q, a], i) => {
        eq(`ex9 #${i + 1} prompt`, at('ex9', i).q, q);
        eq(`ex9 #${i + 1} accepted translations`,
            JSON.stringify(at('ex9', i).answer), JSON.stringify(a));
    });
    eq('ex9 accepts variants on exactly the six ambiguous items',
        byId.ex9.items.map((it, i) => (it.answer.length > 1 ? i + 1 : 0)).filter(Boolean).join(','),
        '1,2,4,7,8,10');
    /* the ambiguity is real, and it is the reason each variant exists */
    ok(/Jins/.test(byId.ex9.intro) && /transport/.test(byId.ex9.intro),
        'ex9 tells the learner where more than one translation is correct');
    ok(byId.ex9.items[6].answer.every(a => /шёл дождь/.test(a)),
        'ex9 #7 keeps the same main clause in both gender variants');
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
    ok(/%D0%912%208%20%D1%83%D1%80%D0%BE%D0%BA\.mp3/.test(a.audioSrc),
        'audioSrc points at "Б2 8 урок.mp3"');
    eq('audioSrc decodes to the exact path', decodeURIComponent(a.audioSrc), 'audios/Б2 8 урок.mp3');
    ok(fs.existsSync(path.join(ROOT, 'audios', 'Б2 8 урок.mp3')), 'the audio file exists on disk');
    ok(!/%D0%912%20[67]%20/.test(a.audioSrc), 'topic 8 does not point at an earlier recording');

    const STATEMENTS = [
        'Друзья решили поехать в Бухару на несколько дней.',
        'Они выехали из Ташкента вечером.',
        'Поезд задерживался почти на час.',
        'Друзья зашли в кафе после объявления о посадке.',
        'В Бухаре они сразу нашли гостиницу.',
        'Они перепутали улицы и случайно оказались в другом районе.',
        'Прохожий помог им найти дорогу к гостинице.',
        'На следующий день автобус попал в аварию.',
        'Пассажирам пришлось выйти из автобуса из-за поломки.',
        'Друзья решили, что неожиданные ситуации сделали путешествие более запоминающимся.'
    ];
    STATEMENTS.forEach((st, i) => eq(`audio statement ${i + 1} is the source text`, at('audio1', i).q, st));
    eq('audio answers follow the source truth values', a.items.map(i => i.answer).join(','),
        'Правда,Ложь,Правда,Ложь,Ложь,Правда,Правда,Ложь,Правда,Правда');
    ok(a.items.every(it => it.options.join(',') === 'Правда,Ложь'),
        'every statement offers the existing B2 Правда / Ложь labels');
    const blob = JSON.stringify(a);
    ok(blob.indexOf('Верно') === -1 && blob.indexOf('Неверно') === -1,
        'Верно / Неверно are not used anywhere in the audio group');
    /* the source told the learner to work from a text that was never supplied */
    ok(/tinglang/i.test(a.intro), 'the audio task tells the learner to LISTEN');
    ok(!/Matnga qarab|Matn asosida|o‘qing|прочитайте/i.test(a.intro),
        'the audio task never tells the learner to read a text');
    ok(!a.passage, 'no transcript was fabricated');
}

/* ------------------------------------------------- vocabulary (paid only) */
{
    const s = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-vocabulary.html'), 'utf8');
    const i8 = s.indexOf('                    id: 8,');
    ok(i8 > -1, 'paid vocabulary has topic 8');
    const i9 = s.indexOf('                    id: 9,', i8);
    const seg = s.slice(s.lastIndexOf('{', i8),
        i9 > -1 ? s.lastIndexOf('{', i9) : s.indexOf('generateLockedTopics('));
    const cards = [...seg.matchAll(/\{ ru: "([^"]+)", uz: "([^"]+)" \}/g)].map(m => [m[1], m[2]]);
    eq('paid vocabulary topic 8 has all 101 cards', cards.length, 101);
    ok(/name: "Глаголы движения с приставками"/.test(seg), 'paid vocabulary topic 8 is this lesson');
    ok(/isLocked: false/.test(seg), 'paid vocabulary topic 8 is unlocked');
    eq('101 unique Russian units', new Set(cards.map(c => c[0])).size, 101);
    eq('no duplicate card', new Set(cards.map(c => c.join('|'))).size, 101);
    const card = (i) => (cards[i] || [])[0];
    eq('first card', card(0), 'приехать');
    eq('last card', card(100), 'найти альтернативный маршрут');

    /* SOURCE GAP: four verbs the lesson teaches and drills but the word list omitted */
    [['заехать', 'ЗА- grammar + Ex8 #5 + Ex9 #2/#8'],
     ['прилететь', 'ПРИ- grammar + Ex5 #6'],
     ['улететь', 'У- grammar + Ex1 #8 + Ex3 #9'],
     ['вылететь', 'ВЫ- grammar + Ex2 #10 + Ex6 #10']
    ].forEach(([v, why]) => ok(cards.some(c => c[0] === v),
        `the missing lesson-critical verb «${v}» was added (${why})`));

    /* near-synonyms that are distinct Russian units must NOT be merged away */
    ['гостиница', 'отель', 'маршрут', 'направление', 'объехать', 'объехать пробку',
     'выехать', 'выехать заранее', 'вернуться', 'вернуться обратно',
     'вернуться в исходную точку', 'добраться', 'добраться до места',
     'добраться без проблем', 'по дороге', 'по пути', 'попасть в пробку'
    ].forEach(unit => ok(cards.some(c => c[0] === unit),
        `paid vocabulary keeps the distinct unit «${unit}»`));

    const authored = [...s.matchAll(/\n                    id: (\d+),/g)].map(m => Number(m[1]));
    const vFrontier = Math.max.apply(null, authored);
    ok(authored.indexOf(8) !== -1 && vFrontier >= 8,
        'topic 8 is an authored (unlocked) vocabulary deck');
    ok(new RegExp('generateLockedTopics\\(' + (vFrontier + 1) + '\\)').test(s),
        `locked vocabulary topics start right after the last authored deck (${vFrontier + 1})`);
    ok(!/generateLockedTopics\(8\)/.test(s), 'no stale generateLockedTopics(8) remains');
    ok(/Вид глагола/.test(s) && /Сравнительные конструкции/.test(s),
        'paid vocabulary topics 6-7 intact');

    const demo = fs.readFileSync(path.join(ROOT, 'b2-demo-vocabulary.html'), 'utf8');
    ok(!/                    id: 8,/.test(demo), 'demo vocabulary untouched (no topic 8)');
    ok(!/Глаголы движения/.test(demo), 'topic 8 did not leak into the demo vocabulary');
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
        const t = list.find(x => x.id === 8);
        const soonId = frontier + 1;
        const next = list.find(x => x.id === soonId);
        ok(t.grammar.length > 9000, `${mode}: topic 8 carries the real grammar`);
        ok(!t.content, `${mode}: topic 8 is a real lesson, not a coming-soon shell`);
        eq(`${mode}: topic 8 serves 11 exercise groups`,
            (w.eval('b2ExerciseData(8)') || { exercises: [] }).exercises.length, 11);
        eq(`${mode}: topic ${soonId} has no lesson payload`,
            w.eval('b2ExerciseData(' + soonId + ')'), null);
        eq(`${mode}: topic ${soonId} grammar is empty`, next.grammar, '');
        ok(!!next.content, `${mode}: topic ${soonId} still renders the coming-soon card`);
        if (mode === 'paid') {
            ok(t.isLocked === false, 'paid: topic 8 is available');
        } else {
            ok(t.isLocked === true, 'demo: topic 8 stays behind the paywall');
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
    console.log(`  ✅ B2 TOPIC 8: ${pass}/${pass} passed`
        + `  (open ${openCount} · deterministic ${detCount} · multi ${multi}`
        + ` · accepted variants ${variants})`);
} else {
    console.log(`  ❌ B2 TOPIC 8: ${fail} failed / ${pass + fail}\n`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
}
console.log('='.repeat(60) + '\n');
process.exit(fail === 0 ? 0 : 1);
