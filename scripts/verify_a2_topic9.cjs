#!/usr/bin/env node
/**
 * verify_a2_topic9.cjs — A2 topic 9 «Transport va sayohat» must stay a
 * complete, objectively gradable lesson.
 *
 * Three of the source exercises could not be shipped as written: exercise 6
 * had five questions instead of ten, exercise 9 was ten open personal questions
 * with no answer key, and exercise 10 marked valid Russian as an error. All
 * three are AUTHORED REPLACEMENTS, and this suite pins what they replaced so
 * the ambiguity cannot creep back.
 *
 * The properties worth more than the counts:
 *   1. EVERY scored question has exactly ONE correct option under the scorer's
 *      own normaliser.
 *   2. The lesson plays audios/А2 9 урок.mp3 — its own recording.
 *   3. Completion goes through the SERVER, and a refused save unlocks nothing.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const REL = 'paid-courses/a2-course.html';
const SRC = fs.readFileSync(path.join(ROOT, REL), 'utf8');

function mainScript(html) {
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
    let m, best = '';
    while ((m = re.exec(html))) {
        if (/\bsrc=/.test(m[1])) continue;
        if (m[2].length > best.length) best = m[2];
    }
    return best;
}
function literal(src, name) {
    const i = src.search(new RegExp('(?:const|let|var)\\s+' + name + '\\s*=\\s*[\\[{]'));
    let j = i;
    while (src[j] !== '[' && src[j] !== '{') j++;
    const open = src[j], close = open === '[' ? ']' : '}';
    let d = 0;
    for (let k = j; k < src.length; k++) {
        if (src[k] === open) d++;
        else if (src[k] === close) {
            d--;
            if (d === 0) return vm.runInNewContext('(' + src.slice(j, k + 1) + ')',
                { generateLockedTopics: () => [], icons: {}, lockedTopicNames: [] });
        }
    }
    throw new Error('unbalanced ' + name);
}

console.log('\n=== A2 TOPIC 9 ===');

const topics = literal(SRC, 'courseData').topics;
const t9 = topics.find((t) => t.id === 9);

/* ------------------------------------------------------- 1. the topic */
eq('exactly one topic 9', topics.filter((t) => t.id === 9).length, 1);
eq('16 A2 topics, unchanged', topics.length, 16);
ok(!!t9, 'topic 9 exists');
eq('title', t9.title, 'Transport va sayohat');
ok(!t9.quiz, 'the empty placeholder quiz is gone');
ok(typeof t9.explanation.uz === 'string' && t9.explanation.uz.length > 40,
    'topic 9 has a real Uzbek introduction');
ok(!/faqat to'liq kurs obunachilari/.test(t9.explanation.uz),
    'the "subscribers only" placeholder text is gone');
ok(t9.isSubscriptionLocked === false && t9.isLocked === false, 'topic 9 is open to subscribers');

/* ------------------------------------------------------- 2. grammar */
{
    const g = t9.grammar || '';
    ok(g.length > 3000, `grammar is substantial (${g.length} chars)`);
    [['1 · ехать now', /Я еду в Ташкент[\s\S]*Мы едем в Самарканд[\s\S]*Она едет на работу/],
     ['1 · ездить habitual', /Я часто езжу в Ташкент[\s\S]*Он каждый день ездит на работу[\s\S]*Мы часто ездим за город/],
     ['1 · the conjugation table', /еду<\/b> \/ <b class="b2g-tone-sv">езжу[\s\S]*едет<\/b> \/ <b class="b2g-tone-sv">ездит[\s\S]*едем<\/b> \/ <b class="b2g-tone-sv">ездим[\s\S]*едут<\/b> \/ <b class="b2g-tone-sv">ездят/],
     ['2 · идти now', /Я иду домой[\s\S]*Она идёт в магазин/],
     ['2 · ходить habitual', /Я каждый день хожу в школу[\s\S]*Он часто ходит в парк/],
     ['2 · the conjugation table', /иду<\/b> \/ <b class="b2g-tone-sv">хожу[\s\S]*идём<\/b> \/ <b class="b2g-tone-sv">ходим/],
     ['3 · transport forms', /на автобус<b>е[\s\S]*на поезд<b>е[\s\S]*на самолёт<b>е[\s\S]*на метро[\s\S]*на такси[\s\S]*на велосипед<b>е/],
     ['3 · transport sentences', /Я еду на автобусе[\s\S]*Мы едем на поезде[\s\S]*Она летит на самолёте/],
     ['3 · на машине vs в машине', /на машине<\/b><\/td><td>harakat usuli[\s\S]*в машине<\/b><\/td><td>mashinaning ichida/],
     ['4 · Куда? в', /в город<\/td>[\s\S]*в магазин<\/td>[\s\S]*в аэропорт<\/td>[\s\S]*в Ташкент<\/td>[\s\S]*в Москву<\/td>/],
     ['4 · Куда? на', /на работу<\/td>[\s\S]*на вокзал<\/td>[\s\S]*на остановку<\/td>[\s\S]*на море<\/td>/],
     ['4 · the two dialogues', /Куда ты едешь\?[\s\S]*Я еду в Ташкент[\s\S]*Куда ты идёшь\?[\s\S]*Я иду на работу/],
     ['5 · Где? в', /в городе<\/td>[\s\S]*в магазине<\/td>[\s\S]*в аэропорту<\/td>[\s\S]*в автобусе<\/td>/],
     ['5 · Где? на', /на работе<\/td>[\s\S]*на вокзале<\/td>[\s\S]*на остановке<\/td>/],
     ['6 · Откуда? из', /из Ташкента<\/td>[\s\S]*из Москвы<\/td>[\s\S]*из магазина<\/td>[\s\S]*из аэропорта<\/td>/],
     ['6 · Откуда? с', /с работы<\/td>[\s\S]*с вокзала<\/td>[\s\S]*с остановки<\/td>/],
     ['6 · the в→из / на→с rule', /qayerdan <b class="b2g-tone-nsv">из[\s\S]*qayerdan <b class="b2g-tone-sv">с/],
     ['7 · directions', /прямо<\/b><\/td><td>to'g'ri[\s\S]*направо[\s\S]*налево[\s\S]*назад[\s\S]*рядом[\s\S]*далеко[\s\S]*близко[\s\S]*около[\s\S]*напротив/],
     ['7 · direction sentences', /Идите прямо[\s\S]*Поверните направо[\s\S]*Поверните налево[\s\S]*Остановка рядом/],
     ['8 · Как добраться', /Как добраться до вокзала\?[\s\S]*Как добраться до аэропорта\?[\s\S]*Как добраться до центра\?/],
     ['8 · the answers', /Езжайте на автобусе[\s\S]*Доезжайте до центра/],
     ['9 · travel time', /10 минут<\/td>[\s\S]*30 минут<\/td>[\s\S]*1 час<\/td>[\s\S]*2 часа<\/td>/],
     ['9 · До + place + time', /До центра 20 минут[\s\S]*До аэропорта 30 минут/],
     ['10 · travel constructions', /Я лечу в…[\s\S]*Я путешествую на…[\s\S]*Я был \/ была в…[\s\S]*Я хочу поехать в…/],
     ['10 · travel examples', /Я хочу поехать в Самарканд[\s\S]*Мы путешествуем на поезде[\s\S]*Летом я хочу поехать на море[\s\S]*В прошлом году я была в Турции/],
     ['closing memo', /Mavzu xulosasi/]
    ].forEach(([label, re]) => ok(re.test(g), `grammar covers ${label}`));

    eq('ten logical blocks', (g.match(/class="b2g-h"/g) || []).length, 10);

    /* SOURCE LANGUAGE NORMALIZATION: «Аэропорт находится в 1 часе от города»
       is not a template a learner should copy. */
    ok(!/в 1 часе от города/.test(g),
        'the awkward «в 1 часе от города» is not taught');
    ok(/До аэропорта один час/.test(g), 'the natural «До аэропорта один час» is taught instead');

    eq('the lesson introduces no literal colours of its own',
        (g.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) || []).length, 0);
    const tones = new Set((g.match(/b2g-tone-(sv|nsv)/g) || []));
    ok(tones.size <= 2, `at most two tone classes are used (${[...tones].join(', ')})`);
    const UI = fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8');
    ['--g-accent', '--g-ok', '--g-warn'].forEach((tok) =>
        ok(UI.includes(tok), `the shared component defines ${tok}`));
    [...new Set(g.match(/b2g[-a-z0-9]*/g) || [])].forEach((cls) =>
        ok(UI.includes('.' + cls), `the shared stylesheet already defines .${cls}`));

    ok(/b2g-split/.test(g), 'comparisons use the responsive split grid');
    ok(/b2g-t/.test(g), 'tables use the shared responsive table');
    /* A three-column table overflows a 360px phone — topic 8 proved it, so
       every row is counted rather than trusting the eye. */
    const widestRow = (g.match(/<tr>[\s\S]*?<\/tr>/g) || [])
        .reduce((n, row) => Math.max(n, (row.match(/<td[ >]/g) || []).length), 0);
    ok(widestRow <= 2, `no table row has more than two cells (widest: ${widestRow})`);
    ok(!/style="[^"]*width:\s*\d{3,}px/.test(g), 'nothing is pinned to a fixed pixel width');
}

/* ------------------------------------------------------- 3. listening */
{
    const audioGroup = t9.topic9Exercises.exercises.find((g) => g.id === 'audio');
    ok(!!audioGroup, 'the audio is its own step');
    eq('the source is the A2 lesson 9 recording',
        decodeURIComponent(audioGroup.audioSrc), 'audios/А2 9 урок.mp3');
    ok(!/Б2/.test(decodeURIComponent(audioGroup.audioSrc)), 'not a Б2 recording');
    const audioFile = path.join(ROOT, decodeURIComponent(audioGroup.audioSrc));
    ok(fs.existsSync(audioFile), `the referenced mp3 exists on disk (${audioGroup.audioSrc})`);
    ok(fs.statSync(audioFile).size > 10000, 'and it is a real recording, not a stub');

    /* The source called this block «Текст»; it is a recording, so the learner
       is told to LISTEN, never to read. No transcript exists or was invented. */
    ok(/Audio/.test(audioGroup.title), 'the step is announced as audio, not as a text');
    ok(!/Текст|Matn|reading/i.test(audioGroup.title + ' ' + audioGroup.intro),
        'nothing calls it a text');
    ok(!audioGroup.passage, 'the audio step carries no passage');
    ok(!t9.topic9Exercises.exercises.some((g) => g.passage), 'no step carries a story text');
    ok(/audio/i.test(t9.content || ''), 'the lesson points at the audio');
    ok(!/прочитайте|matnni o/i.test(t9.content || ''), 'and never at a text');
}

/* --------------------------------------------- 4. exercises + answer keys */
const EXPECTED = [
    ['ex1', 'choice', 10], ['ex2', 'choice', 10], ['ex3', 'input', 10],
    ['ex4', 'choice', 10], ['ex5', 'choice', 10], ['ex6', 'choice', 10],
    ['ex7', 'builder', 10], ['ex8', 'input', 10], ['ex9', 'choice', 10],
    ['ex10', 'choice', 10],
    ['audio', 'reading', 0], ['truefalse', 'choice', 10]
];
{
    const block = t9.topic9Exercises;
    ok(!!block && Array.isArray(block.exercises), 'topic 9 uses the generic exercise shape');
    const groups = block.exercises;
    eq('twelve steps', groups.length, EXPECTED.length);

    EXPECTED.forEach(([id, type, count], i) => {
        const g = groups[i];
        eq(`group ${i + 1} is ${id}`, g.id, id);
        eq(`${id} is a ${type} exercise`, g.type, type);
        eq(`${id} has ${count} questions`, (g.items || []).length, count);
        ok(typeof g.title === 'string' && g.title.trim() !== '', `${id} has a title`);
        ok(typeof g.intro === 'string' && g.intro.trim() !== '', `${id} has an instruction`);
        if (count > 0) ok(typeof g.howTo === 'string' && g.howTo.trim() !== '',
            `${id} explains how to answer`);
    });

    const norm = (v) => String(v == null ? '' : v).toLowerCase().replace(/ё/g, 'е')
        .replace(/[.,!?;:—–-]/g, ' ').replace(/\s+/g, ' ').trim();

    let ambiguous = 0, emptyKey = 0, dupOption = 0;
    groups.forEach((g) => {
        (g.items || []).forEach((it, i) => {
            ok(typeof it.q === 'string' && it.q.trim() !== '', `${g.id}#${i + 1} has a prompt`);
            if (g.type === 'choice') {
                if (!Array.isArray(it.options) || it.options.length < 2) { emptyKey++; return; }
                if (new Set(it.options.map(norm)).size !== it.options.length) dupOption++;
                if (it.options.filter((o) => norm(o) === norm(it.answer)).length !== 1) ambiguous++;
            } else {
                if (!Array.isArray(it.answer) || !it.answer.length
                    || it.answer.some((a) => !String(a).trim())) emptyKey++;
            }
        });
    });
    eq('every choice question has exactly one correct option', ambiguous, 0);
    eq('no options collapse into each other under the normaliser', dupOption, 0);
    eq('no empty answer key', emptyKey, 0);

    const audioStep = groups.find((g) => g.id === 'audio');
    eq('the audio step has no questions', (audioStep.items || []).length, 0);
    eq('the audio step is named, not numbered', audioStep.stepName, 'Audio');
    ok(/Savollarga/.test(audioStep.continueLabel || ''), 'it offers a continue action');
    const tfStep = groups.find((g) => g.id === 'truefalse');
    ok(/Audio/.test(tfStep.stepName || ''), 'the comprehension step is about the audio');

    const total = groups.reduce((s, g) => s + (g.items || []).length, 0);
    eq('110 scored questions in total', total, 110);
    eq('the ten drills carry 100 of them',
        groups.filter((g) => /^ex\d+$/.test(g.id)).reduce((s2, g) => s2 + g.items.length, 0), 100);
    console.log(`  10 drills + audio + comprehension · ${total} scored questions`);

    const byId = (id) => groups.find((g) => g.id === id);
    const keys = (id) => byId(id).items.map((i) => i.answer).join(',');

    /* ---- source answer keys, verbatim ---- */
    eq('ex1 keys match the source', keys('ex1'),
        'еду,ездит,идём,хожу,едут,ездит,иду,ходим,едет,езжу');
    eq('ex2 keys match the source', keys('ex2'), 'в,на,на,в,в,на,в,на,в,в');
    eq('ex3 keys match the source', byId('ex3').items.map((i) => i.answer[0]).join(','),
        'автобусе,поезде,самолёте,такси,метро,велосипеде,машине,автобусе,трамвае,мотоцикле');
    eq('ex4 keys match the source', keys('ex4'),
        'Куда?,Где?,Откуда?,Куда?,Где?,Откуда?,Куда?,Где?,Откуда?,Куда?');
    eq('ex5 keys match the source', keys('ex5'), 'из,с,из,с,из,из,из,с,из,с');
    eq('ex7 targets match the source', byId('ex7').items.map((i) => i.answer[0]).join(' | '),
        ['Я еду в Ташкент', 'Мы едем на автобусе', 'Она идёт на работу',
         'Они едут в аэропорт', 'Мы путешествуем поездом', 'Я часто езжу в Самарканд',
         'Он сейчас идёт домой', 'Она летит на самолёте', 'Мы ждём на остановке',
         'Они приехали из Москвы'].join(' | '));
    eq('ex8 leads with the source model answers',
        byId('ex8').items.map((i) => i.answer[0]).join(' | '),
        ['Я еду в Ташкент', 'Я каждый день езжу на работу', 'Мы едем на автобусе',
         'Она едет в аэропорт', 'Я иду домой пешком', 'Они приехали из Самарканда',
         'Где остановка', 'Как добраться до вокзала', 'Поверните направо',
         'Я хочу путешествовать на поезде'].join(' | '));

    /* ex4 offers one uniform chip row rather than the source's varying pairs. */
    ok(byId('ex4').items.every((i) => i.options.join('|') === 'Где?|Куда?|Откуда?'),
        'ex4 offers all three question words on every item');

    /* ---- ex3: the source «(такси)» and «(метро)» do not decline ---- */
    ok(byId('ex3').items[3].answer[0] === 'такси' && byId('ex3').items[4].answer[0] === 'метро',
        'the indeclinable такси / метро keep their form');

    /* ---- ex8: the two places where the Uzbek genuinely underdetermines ---- */
    const ex8 = byId('ex8');
    ok(ex8.items[3].answer.includes('Он едет в аэропорт'),
        'ex8 accepts both genders where the Uzbek does not mark one');
    ok(ex8.items[6].answer.includes('Где находится остановка'),
        'ex8 accepts the fuller «Где находится остановка»');
    ok(ex8.items.every((i) => i.answer.length <= 2),
        'no translation is opened up to a long list of variants');

    /* ---- EX6: AUTHORED REPLACEMENT (source had only 5 items) ---- */
    const ex6 = byId('ex6');
    eq('ex6 is a complete ten-question exercise', ex6.items.length, 10);
    ok(ex6.items.every((i) => i.options.join('|') === 'прямо|направо|налево|назад|рядом'),
        'ex6 offers the same five directions on every item');
    ['прямо', 'направо', 'налево', 'назад', 'рядом'].forEach((d) =>
        ok(ex6.items.filter((i) => i.answer === d).length === 2,
            `ex6 drills «${d}» twice`));
    /* «поверните ___» alone admits both направо and налево, so every prompt
       carries the Uzbek gloss of its target. Without it the item is a coin flip. */
    ok(ex6.items.every((i) => /\([^)]+\)\s*$/.test(i.q)),
        'every ex6 prompt names its target direction in Uzbek');
    const GLOSS = { 'прямо': "to‘g‘ri", 'направо': "o‘ngga", 'налево': 'chapga',
                    'назад': 'orqaga', 'рядом': 'yonida' };
    ok(ex6.items.every((i) => i.q.includes(GLOSS[i.answer])),
        'and the gloss is the one that matches the key');

    /* ---- EX9: AUTHORED REPLACEMENT (source questions had no objective keys) ---- */
    const ex9 = byId('ex9');
    eq('ex9 has exactly ten items', ex9.items.length, 10);
    ok(ex9.items.every((i) => i.options.length === 4), 'each question offers four replies');
    ok(ex9.items.every((i) => /^—/.test(i.q)), 'each item is a dialogue turn');
    /* the ten SOURCE questions survive as the prompts */
    ['Куда ты едешь?', 'На чём ты едешь на работу?', 'Как ты обычно ездишь в центр?',
     'Куда ты хочешь поехать?', 'Где находится вокзал?', 'Как добраться до аэропорта?',
     'Сколько времени занимает дорога до центра?', 'Ты часто путешествуешь?',
     'На чём ты любишь путешествовать?', 'В какой город ты хочешь поехать?']
        .forEach((q, i) => ok(ex9.items[i].q.includes(q),
            `ex9#${i + 1} keeps the source question «${q}»`));
    eq('ex9 answers match the specified responses',
        ex9.items.map((i) => i.answer).join(' | '),
        ['Я еду в Ташкент.', 'Я еду на работу на автобусе.', 'Я обычно езжу в центр на метро.',
         'Я хочу поехать в Самарканд.', 'Вокзал находится в центре.', 'Езжайте на автобусе.',
         'Дорога занимает 30 минут.', 'Да, я часто путешествую.',
         'Я люблю путешествовать на поезде.', 'Я хочу поехать в Самарканд.'].join(' | '));
    /* Distractors answer a DIFFERENT question — they are not broken Russian. */
    const RESP = new Set(ex9.items.map((i) => i.answer));
    ok(ex9.items.every((i) => i.options.every((o) => RESP.has(o))),
        'every ex9 distractor is itself a correct answer to another question');

    /* ---- EX10: AUTHORED REPLACEMENT (source errors were ambiguous) ---- */
    const ex10 = byId('ex10');
    const ex10Text = JSON.stringify(ex10);
    eq('ex10 has exactly ten items', ex10.items.length, 10);
    ok(ex10.items.every((i) => i.options.length === 4), 'each correction offers four sentences');
    ok(ex10.items.every((i) => i.options.includes(i.q)),
        'the broken sentence is among the options, so the learner must reject it');
    ok(ex10.items.every((i) => i.answer !== i.q), 'and it is never the key');
    eq('ex10 corrections are the specified ones',
        ex10.items.map((i) => i.answer).join(' | '),
        ['Я еду сейчас в аэропорт.', 'Она каждый день ездит на работу.',
         'Мы едем сейчас в Самарканд на автобусе.', 'Я сижу в машине.',
         'Он идёт на работу.', 'Мы приехали из Ташкента.', 'Она едет на автобусе.',
         'Я часто хожу в парк.', 'Они приехали из Москвы.', 'Поверните направо.'].join(' | '));
    /* The two source items that could not be graded objectively are gone. */
    ok(!/Я еду на машина/.test(ex10Text),
        'the source item with two natural corrections (на машине / в машине) is not used');
    ok(!ex10.items.some((i) => i.q === 'Она едет в автобусе.'),
        'the source item «Она едет в автобусе.» — valid Russian — is not marked wrong');
    /* Options must differ by more than punctuation. */
    ok(ex10.items.every((i) => new Set(i.options.map(
        (o) => o.toLowerCase().replace(/[.,!?]/g, '').trim())).size === 4),
        'ex10 options differ by real words, not punctuation');

    /* ---- builders assemble from their own cards ---- */
    const SB = fs.readFileSync(path.join(ROOT, 'sentence-builder.js'), 'utf8');
    ok(/function bank\(item, group\)/.test(SB) && /variantsOf\(item\)\.forEach/.test(SB),
        'the builder still derives its cards from the accepted answers');
    byId('ex7').items.forEach((it, i) => {
        const target = it.answer[0];
        eq(`ex7#${i + 1} target has no double spacing`, target.split(/\s+/).join(' '), target);
        ok(!/^\s|\s$/.test(target), `ex7#${i + 1}: no stray whitespace`);
        ok(target.split(' ').length >= 3, `ex7#${i + 1}: a real sentence to build`);
        /* the prompt must not hand out a form the target does not use */
        it.q.split(' / ').forEach((tok) => ok(
            target.toLowerCase().split(/\s+/).includes(tok.toLowerCase().trim()),
            `ex7#${i + 1}: prompt token «${tok.trim()}» appears in the target`));
    });

    /* ---- comprehension: source statements and keys ---- */
    eq('the comprehension keys match the source', keys('truefalse'),
        'Rost,Yolg‘on,Rost,Rost,Rost,Rost,Yolg‘on,Rost,Rost,Rost');
    ok(byId('truefalse').items.every((i) => i.options.join('|') === 'Rost|Yolg‘on'),
        'the comprehension check offers Rost / Yolg‘on');
    /* SOURCE TYPO: the material wrote «Рост» (height) for «Rost» (true). */
    ok(!/Рост/.test(JSON.stringify(byId('truefalse'))),
        'the source typo «Рост» never reaches the learner');
    ok(!/Matnga qarab/.test(JSON.stringify(t9)),
        'the instruction says listen, not "look at the text"');
    ok(/tinglab/.test(byId('truefalse').howTo || ''), 'it tells the learner to listen');
    eq('the comprehension statements are the source statements, verbatim',
        byId('truefalse').items.map((i) => i.q).join(' | '),
        ['Автор хочет поехать в Самарканд летом.', 'Автор едет в Самарканд на самолёте.',
         'Поезд отправляется утром в 8 часов.', 'До вокзала они едут на такси.',
         'Дорога занимает около трёх часов.', 'В Самарканд они приезжают в 11 часов.',
         'Сначала они идут в музей.', 'Они посещают площадь Регистан.',
         'В кафе они пробуют местный плов.', 'Они возвращаются домой через три дня.'].join(' | '));
}

/* ------------------------------------------------------- 5. vocabulary */
{
    const VSRC = mainScript(fs.readFileSync(path.join(ROOT, 'paid-courses/a2-vocabulary.html'), 'utf8'));
    const all = literal(VSRC, 'vocabularyData').topics;
    const v9 = all.find((t) => t.id === 9);
    ok(!!v9, 'vocabulary topic 9 exists');
    eq('50 cards, exactly the source count', v9.words.length, 50);
    eq('no exact duplicate card', new Set(v9.words.map((w) => w.ru + '||' + w.uz)).size, 50);
    eq('no repeated russian side either', new Set(v9.words.map((w) => w.ru)).size, 50);
    ok(v9.words.every((w) => w.ru && w.ru.trim() && w.uz && w.uz.trim()),
        'no card has an empty side');
    [['автобус', 'avtobus'], ['машина', 'mashina'], ['поезд', 'poyezd'],
     ['аэропорт', 'aeroport'], ['остановка', 'bekat'],
     ['путешествие', 'sayohat'], ['билет', 'chipta'], ['гостиница', 'mehmonxona'],
     ['ехать', 'transportda bormoq'], ['ходить', 'piyoda qatnamoq'],
     ['направо', 'o‘ngga'], ['напротив', 'ro‘parasida'],
     ['бронировать', 'bron qilmoq'], ['собирать вещи', 'narsalarni yig‘moq']]
        .forEach(([ru, uz]) => ok(v9.words.some((w) => w.ru === ru && w.uz === uz),
            `the card "${ru}" is present with its source translation`));
    /* five source groups of ten, in source order */
    const idx = (ru) => v9.words.findIndex((w) => w.ru === ru);
    eq('Transport vositalari is the first ten', idx('путешествие'), idx('автобус') + 10);
    ok(idx('путешествие') < idx('ехать'), 'Sayohatga oid so‘zlar comes before Harakat fe’llari');
    ok(idx('ехать') < idx('прямо'), 'Harakat fe’llari comes before Yo‘nalishlar');
    ok(idx('прямо') < idx('отправляться'), 'Yo‘nalishlar comes before Sayohatda kerakli so‘zlar');
    ok(/\b9:\s*50\b/.test(SRC), 'the course card advertises 50 words for topic 9');
    eq('topics 1-8 vocabulary unchanged',
        [1, 2, 3, 4, 5, 6, 7, 8].map((id) => all.find((t) => t.id === id).words.length).join(','),
        '45,77,73,106,50,69,85,85');
}

/* ------------------------------- 6. it renders, grades and completes */
{
    const blocks = [...SRC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const pre = blocks.find((b) => /(let|var|const)\s+currentUser/.test(b) && !b.includes('const courseData'));
    const main = blocks.find((b) => b.includes('const courseData'));
    function boot() {
        const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
        const w = new JSDOM(SRC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g, '<script></script>'),
            { url: 'https://uzdarus.uz/' + REL, runScripts: 'outside-only', pretendToBeVisual: true,
              virtualConsole: vc }).window;
        w.HTMLElement.prototype.scrollIntoView = function () {};
        w.alert = () => {}; w.confirm = () => true;
        w.eval('window.__claims=[];window.__safe=[];window.currentUserId="u1";' +
            'window.saveQuizResult=async()=>1;' +
            /* A2 reports the EXERCISES HALF now: complete-topic finalises only
               what the component record earns, so a whole-topic claim could never
               append and A2 topics never completed. The legacy route is stubbed
               too, so a regression back to it shows up as a claim carrying no
               component. */
            'window.completeCourseComponent=async function(c,t,cm){window.__claims.push({c:c,t:t,cm:cm});' +
            ' window.__srv=Array.from(new Set([...(window.__srv||[]),t])).sort((a,b)=>a-b);' +
            ' return {ok:true,course:c,topicId:t,component:cm,' +
            '  components:{vocabularyCompleted:true,exercisesCompleted:true},' +
            '  topicCompleted:true,completedTopics:window.__srv.slice(),nextTopic:t+1};};' +
            'window.completeCourseTopic=async function(c,t){window.__claims.push({c:c,t:t});' +
            ' return window.__srv ? window.__srv.slice() : [];};' +
            'window.saveUserProgress=async function(u,c,p){window.__safe.push(p);return 1;};' +
            'window.getUserProgress=async()=>({completedTopics:[1,2,3,4,5,6,7]});' +
            'window.getUserQuizResults=async()=>({});window.logActivity=async()=>{};');
        ['exercise-session.js', 'sentence-builder.js', 'course-exercise-ui.js', 'a2-host.js']
            .forEach((f) => w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
        if (pre) w.eval(pre);
        w.eval(main + '\n;window.__api={loadLesson:loadLesson,exData:getT1ExData,' +
            'setCompleted:function(v){completedTopics=v;},getCompleted:function(){return completedTopics;},' +
            'render:renderTopic1Exercises,complete:a2CompleteTopic,check:window.checkTopic1Exercises};');
        w.eval('window.currentUserId="u1";');
        return w;
    }
    const w = boot();

    w.__api.setCompleted([1, 2, 3, 4, 5, 6, 7, 8]);
    w.eval('currentTopicId=9;');
    w.__api.loadLesson(9);
    const D = w.document;

    ok(!!w.__api.exData(t9), 'the generic engine claims topic 8');
    eq('twelve steps exist in the hidden bridge', D.querySelectorAll('[data-t1-ex]').length, 12);
    /* ex3 and ex8 are text-input drills; ex7 is a builder with hidden inputs. */
    eq('thirty text inputs render across the input and builder steps',
        D.querySelectorAll('[data-t1-input]').length, 30);
    const lesson = (D.getElementById('lessonContent') || D.body).textContent;
    ok(/Я часто езжу в Ташкент/.test(lesson), 'the grammar reaches the screen');
    ok(/Audio va tushunish savollari/.test(lesson), 'the lesson announces the listening step');

    const first = (a) => (Array.isArray(a) ? a[0] : a);
    let missing = 0;
    t9.topic9Exercises.exercises.forEach((g) => {
        (g.items || []).forEach((it, i) => {
            const key = g.id + '-' + i;
            if (g.type === 'choice') {
                const row = D.querySelector(`[data-t1-row="${key}"]`);
                const btn = row && [...row.querySelectorAll('.t1-opt')]
                    .find((b) => b.getAttribute('data-value') === it.answer);
                if (btn) btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
                else missing++;
            } else {
                const inp = D.querySelector(`[data-t1-input="${key}"]`);
                if (inp) inp.value = first(it.answer); else missing++;
            }
        });
    });
    eq('every question is answerable in the DOM', missing, 0);

    return (async () => {
        await w.__api.check(9);
        const marked = D.querySelectorAll('.t1-opt.t1-ok').length
            + D.querySelectorAll('[data-t1-input].correct').length;
        const scoreText = (D.getElementById('scoreDisplay') || {}).textContent || '';
        ok(/\b110\s*\/\s*110\b/.test(scoreText),
            `a perfect paper is graded 110/110 (${scoreText.trim()})`);
        ok(marked >= 90, `the graded widgets mark themselves correct (${marked})`);

        /* Completion must go through the server, and unlock topic 9. */
        await w.__api.complete(9);
        await new Promise((r) => setTimeout(r, 150));
        eq('exactly one completion claim', w.__claims.length, 1);
        eq('the claim names course A2', w.__claims[0].c, 'A2');
        eq('and it claims the EXERCISES half, not the whole topic',
            w.__claims[0].cm, 'exercises');
        eq('the claim names topic 9', w.__claims[0].t, 9);
        ok(w.__api.getCompleted().includes(9), 'the server answer is adopted');
        ok(w.__safe.every((p) => !('completedTopics' in p)),
            'no completion field went through the generic saver');
        ok(w.__api.getCompleted().includes(9), 'topic 10 unlocks');
        ok(!/saveUserProgress\([^)]*completedTopics/.test(SRC),
            'topic 9 introduced no direct authoritative write');

        /* A REFUSED server save must not unlock anything. */
        {
            const wf = boot();
            wf.eval('window.completeCourseComponent=async function(){throw new Error("offline");};' +
                    'window.completeCourseTopic=async function(){throw new Error("offline");};');
            wf.__api.setCompleted([1, 2, 3, 4, 5, 6, 7, 8]);
            wf.eval('currentTopicId=9;');
            wf.__api.loadLesson(9);
            try { await wf.__api.complete(9); } catch (e) { /* surfaced to the learner */ }
            await new Promise((r) => setTimeout(r, 120));
            ok(!wf.__api.getCompleted().includes(9),
                'a failed server save leaves topic 9 incomplete');
        }

        /* ---------- 7. THE STEPPING SESSION, not a long page ---------- */
        const w2 = boot();
        const D2 = w2.document;
        w2.__api.setCompleted([1, 2, 3, 4, 5, 6, 7, 8]);
        w2.eval('currentTopicId=9;');
        w2.__api.loadLesson(9);
        w2.__api.render(9);
        const bridge = D2.getElementById('a2LegacyBridge');
        ok(!!bridge, 'the legacy write-through bridge exists');
        ok((bridge.getAttribute('style') || '').includes('display:none'),
            'the bridge is hidden from the learner');
        eq('no exercise block is visible in the page flow',
            D2.querySelectorAll('[data-t1-ex]').length - bridge.querySelectorAll('[data-t1-ex]').length, 0);

        const mount = D2.getElementById('a2PracticeMount');
        ok(!!mount, 'the practice session is mounted');
        const open = [...mount.querySelectorAll('button')][0];
        ok(!!open, 'the practice card offers a way in');
        open.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));

        const host = () => D2.querySelector('.uz-step-host');
        const stepText = () => (D2.querySelector('.uz-step') || {}).textContent || '';
        const titlesOnScreen = () => host() ? host().querySelectorAll('.b2h-howto-t').length : 0;
        ok(!!host(), 'the session opens in its stepping modal');
        eq('the first step is announced in Uzbek', stepText().trim(), 'Mashq 1 / 10');
        eq('exactly one exercise is on screen', titlesOnScreen(), 1);
        ok(/в аэропорт/.test(host().textContent), 'step 1 is exercise 1');
        ok(!/Он летит ___ Москву/.test(host().textContent), 'exercise 2 is NOT also on screen');
        ok(!host().querySelector('audio'), 'the audio player is NOT on screen yet');
        ok(/Javoblarni tekshirish/.test([...D2.querySelectorAll('.uz-foot button, .uz-btn')]
            .map((b) => b.textContent).join(' | ')), 'the check button is in Uzbek');

        const groups = t9.topic9Exercises.exercises;
        const seen = [];
        let multi = 0;
        for (let i = 0; i < groups.length; i++) {
            seen.push(stepText().trim());
            if (titlesOnScreen() > 1) multi++;
            const g = groups[i];
            /* Fill BOTH markups: the topic-1 one and the shared
               course-exercise-ui one (data-b2h-*). Looking only for the former
               meant nothing was ever answered — invisible until A2 gained the
               platform 80% gate, which then correctly refused to advance. */
            (g.items || []).forEach((it, k) => {
                const key = g.id + '-' + k;
                const want = Array.isArray(it.answer) ? it.answer[0] : it.answer;
                ['t1', 'b2h'].forEach((ns) => {
                    const row = host().querySelector(`[data-${ns}-row="${key}"]`);
                    if (row) {
                        const b = [...row.querySelectorAll('.t1-opt, .b2h-opt')]
                            .find((x) => x.getAttribute('data-value') === want);
                        if (b) b.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
                    }
                    const inp = host().querySelector(`[data-${ns}-input="${key}"]`);
                    if (inp) {
                        inp.value = want;
                        inp.dispatchEvent(new w2.Event('input', { bubbles: true }));
                    }
                });
                /* And through the host's own writer, which knows every group
                   type — builder, matcher, open prompt — the way draft-restore
                   does. Clicking alone never filled those, so the step scored
                   zero and, once A2 gained the 80% gate, stopped advancing. */
                try {
                    const UI = w2.UzExerciseUI;
                    if (UI && typeof UI.writeAnswer === 'function') {
                        UI.writeAnswer(host(), key, want, g, it);
                    }
                } catch (e) { /* a type that cannot be written is left to the clicks */ }
            });
            if (g.id === 'audio') {
                const foot = [...D2.querySelectorAll('.uz-foot button, .uz-btn')]
                    .map((b) => b.textContent.trim());
                const audioEl = host().querySelector('audio');
                ok(!!audioEl, 'the audio step renders a player');
                ok(audioEl.hasAttribute('controls'), 'the player has controls');
                ok(!audioEl.hasAttribute('autoplay'), 'it does not autoplay');
                eq('the player preloads metadata only',
                    audioEl.getAttribute('preload'), 'metadata');
                const srcEl = audioEl.querySelector('source');
                const played = decodeURIComponent(srcEl.getAttribute('src') || '');
                ok(/audios\/А2 9 урок\.mp3$/.test(played),
                    `the player points at the A2 lesson 9 recording (${played})`);
                ok(!/Б2/.test(played), 'and not at a Б2 recording');
                ok(!/площадь Регистан/.test(host().textContent),
                    'the comprehension statements are NOT on the audio step');
                ok(!foot.some((t) => /tekshirish/i.test(t)),
                    'the audio step offers no check button');
                ok(!foot.some((t) => /qayta ishlash/i.test(t)), 'and no retry');
                eq('the audio step offers exactly one action', foot.length, 1);
                ok(/Savollarga/.test(foot[0] || ''), 'that action moves on to the questions');
            }
            if (g.id === 'truefalse') {
                ok(/площадь Регистан/.test(host().textContent),
                    'the comprehension questions are on their own step');
                ok(!host().querySelector('audio'),
                    'the player is not repeated on the questions step');
                eq('the comprehension step is a single step', titlesOnScreen(), 1);
            }
            const check = [...D2.querySelectorAll('.uz-foot button, .uz-btn')]
                .find((b) => /tekshirish/i.test(b.textContent));
            if (check) check.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
            const next = [...D2.querySelectorAll('.uz-foot button, .uz-btn')]
                .find((b) => /keyingi mashq|yakunlash|savollarga/i.test(b.textContent));
            if (!next) break;
            next.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
        }
        eq('never more than one exercise on screen', multi, 0);
        eq('every one of the twelve steps was reached', seen.length, 12);
        eq('the cursor numbers the drills and names the rest', seen.join(' | '),
            [...Array.from({ length: 10 }, (_, i) => `Mashq ${i + 1} / 10`),
             'Audio', 'Audio bo‘yicha savollar'].join(' | '));

        /* ---------- 8. no second engine was written for topic 8 ---------- */
        ok(!/topic9(Active|Step|Custom|Navigation|Renderer|State|Wizard|Checker|Modal|Storage)/i.test(SRC),
            'topic 9 introduced no bespoke step/state/renderer machinery');
        ok(/window\.A2Host\.mountPractice/.test(SRC),
            'topic 9 goes through the shared A2 practice mount');
        eq('exactly one practice mount in the page',
            (SRC.match(/A2Host\.mountPractice\(/g) || []).length, 1);
        {
            const a = SRC.indexOf('topic9Exercises:');
            const b = SRC.indexOf('id: 10,', a);
            ok(!/function\s*\(|=>/.test(SRC.slice(a, b)), 'the topic 9 payload is data, not logic');
        }

        console.log('='.repeat(60));
        if (fail) {
            console.log(`  ❌ A2 TOPIC 9: ${fail} failed / ${pass + fail}\n`);
            failures.slice(0, 20).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
            console.log('='.repeat(60) + '\n');
            process.exit(1);
        }
        console.log(`  ✅ A2 TOPIC 9: ${pass}/${pass} passed`);
        console.log('='.repeat(60) + '\n');
    })();
}
