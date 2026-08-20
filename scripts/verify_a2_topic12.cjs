#!/usr/bin/env node
/**
 * verify_a2_topic12.cjs — A2 topic 12 «Qoidalar va maslahatlar» must stay a
 * complete, honestly gradable lesson.
 *
 * Three places in this lesson would be easy to "tidy up" into something wrong,
 * so each is pinned here:
 *
 *   - exercise 3 pairs every item with ITS OWN two options (надо/нельзя or
 *     нужно/можно), exactly as the source wrote it. Flattening that into one
 *     надо/нужно chip row would be a different exercise;
 *   - exercise 7 #3 «Она должна купить билет.» is ALREADY CORRECT. The learner
 *     has to notice that, so its prompt equals its answer — and no other item
 *     may;
 *   - exercise 5 and exercise 10 #6 accept more than one answer because the
 *     source says so outright. Narrowing them would mark correct Russian wrong.
 *
 * Beyond that: 110 interactive questions with ten genuinely open ones,
 * audios/А2 12 урок.mp3 present on disk, server-authoritative completion, and
 * topics 13-16 still placeholders.
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

console.log('\n=== A2 TOPIC 12 ===');

const topics = literal(SRC, 'courseData').topics;
const t12 = topics.find((t) => t.id === 12);

/* ------------------------------------------------------- 1. the topic */
eq('exactly one topic 12', topics.filter((t) => t.id === 12).length, 1);
eq('16 A2 topics, unchanged', topics.length, 16);
ok(!!t12, 'topic 12 exists');
eq('title', t12.title, 'Qoidalar va maslahatlar');
ok(!t12.quiz, 'the empty placeholder quiz is gone');
ok(typeof t12.explanation.uz === 'string' && t12.explanation.uz.length > 40,
    'topic 12 has a real Uzbek introduction');
ok(!/faqat to‘liq kurs obunachilari/.test(t12.explanation.uz),
    'the "subscribers only" placeholder text is gone');
ok(t12.isSubscriptionLocked === false && t12.isLocked === false, 'topic 12 is open');

/* A2 is complete: topic 16 is authored now, so this lesson's old
   "everything after me is a placeholder" tail has no target left. Whole-course
   authored state is asserted by verify_a2_release.cjs, which owns it. */

/* ------------------------------------------------------- 2. grammar */
{
    const g = t12.grammar || '';
    ok(g.length > 3000, `grammar is substantial (${g.length} chars)`);
    [['1 · можно + infinitiv', /Можно<\/b> <span>\+<\/span> <b>infinitiv/],
     ['1 · можно examples', /Можно войти\?[\s\S]*Здесь можно фотографировать[\s\S]*Можно здесь сидеть\?[\s\S]*В библиотеке можно читать/],
     ['2 · нельзя + infinitiv', /Нельзя<\/b> <span>\+<\/span> <b>infinitiv/],
     ['2 · нельзя examples', /Здесь нельзя курить[\s\S]*Нельзя шуметь[\s\S]*В музее нельзя трогать экспонаты[\s\S]*Здесь нельзя парковаться/],
     ['2 · the можно ↔ нельзя pair', /Можно говорить\.[\s\S]*Нельзя говорить\./],
     ['3 · Кому? + нужно/надо', /Кому\?<\/b> <span>\+<\/span> <b class="b2g-tone-nsv">нужно \/ надо/],
     ['3 · нужно/надо examples', /Мне нужно работать[\s\S]*Тебе надо учиться[\s\S]*Нам нужно прийти вовремя[\s\S]*Ему надо купить билет/],
     ['3 · the full pronoun list', /Мне · Тебе · Ему · Ей[\s\S]*Нам · Вам · Им/],
     ['4 · all four должен forms', /должен<\/b><\/td><td>erkak[\s\S]*должна<\/b><\/td><td>ayol[\s\S]*должно<\/b><\/td><td>o.rta jins[\s\S]*должны<\/b><\/td><td>ko.plik/],
     ['4 · должен examples', /Я должен работать[\s\S]*Я должна работать[\s\S]*Он должен прийти[\s\S]*Она должна прийти[\s\S]*Мы должны работать[\s\S]*Они должны прийти/],
     ['5 · следует, both models', /Следует<\/b> <span>\+<\/span> <b>infinitiv<\/b>[\s\S]*Кому\? \+ следует \+ infinitiv/],
     ['5 · impersonal examples', /Следует больше отдыхать[\s\S]*Следует внимательно читать правила[\s\S]*Следует соблюдать правила[\s\S]*Следует прийти вовремя/],
     ['5 · personal examples', /Вам следует больше отдыхать[\s\S]*Тебе следует меньше работать[\s\S]*Ему следует обратиться к врачу/],
     ['6 · нужно / не нужно', /Кому\? \+ нужно \+ infinitiv[\s\S]*Кому\? \+ не нужно \+ infinitiv/],
     ['6 · both examples', /Мне нужно позвонить маме[\s\S]*Тебе нужно больше заниматься[\s\S]*Вам не нужно спешить[\s\S]*Нам не нужно покупать воду/],
     ['7 · можно + noun', /Можно воду\?[\s\S]*Можно кофе\?[\s\S]*Можно один билет\?/],
     ['7 · нельзя + noun', /Нельзя алкоголь[\s\S]*Нельзя еду/],
     ['8 · all four advice models', /Тебе стоит<\/b> \+ infinitiv[\s\S]*Тебе лучше<\/b> \+ infinitiv[\s\S]*Я советую<\/b> \+ infinitiv[\s\S]*Я советую тебе<\/b> \+ infinitiv/],
     ['8 · advice examples', /Тебе стоит больше отдыхать[\s\S]*Тебе лучше обратиться к врачу[\s\S]*Я советую больше читать[\s\S]*Я советую тебе больше практиковаться/],
     ['9 · Здесь + можно/нельзя', /Здесь<\/b> <span>\+<\/span> <b class="b2g-tone-nsv">можно \/ нельзя/],
     ['9 · rule examples', /Здесь можно сидеть[\s\S]*Здесь нельзя курить[\s\S]*Здесь нельзя громко разговаривать[\s\S]*Здесь можно фотографировать/],
     ['9 · нужно / необходимо', /Нужно соблюдать тишину[\s\S]*Нужно соблюдать правила[\s\S]*Необходимо предъявить паспорт/],
     ['summary · Asosiy modellar', /Asosiy modellar/],
     ['summary lists all nine constructions', /можно<\/b> — mumkin[\s\S]*нельзя<\/b>[\s\S]*нужно<\/b>[\s\S]*надо<\/b>[\s\S]*должен<\/b>[\s\S]*следует<\/b>[\s\S]*стоит<\/b>[\s\S]*лучше<\/b>[\s\S]*советую<\/b>/],
     ['summary · Eng muhim farq', /Eng muhim farq/],
     ['the five-way contrast', /МОЖНО<\/b><\/td><td>ruxsat[\s\S]*НЕЛЬЗЯ<\/b><\/td><td>taqiq[\s\S]*НУЖНО \/ НАДО<\/b><\/td><td>zarurat[\s\S]*ДОЛЖЕН<\/b><\/td><td>majburiyat[\s\S]*СЛЕДУЕТ \/ СТОИТ \/ ЛУЧШЕ<\/b><\/td><td>maslahat/],
     ['the six-sentence comparison', /Можно идти[\s\S]*Нельзя идти[\s\S]*Нужно идти[\s\S]*Ты должен идти[\s\S]*Тебе следует идти[\s\S]*Тебе лучше идти/]
    ].forEach(([label, re]) => ok(re.test(g), `grammar covers ${label}`));

    eq('nine numbered blocks', (g.match(/class="b2g-h"/g) || []).length, 9);
    /* «нужно» is impersonal here — it must never be conjugated like «нужен». */
    ok(!/нужен|нужна<\/b>/.test(g),
        'the impersonal нужно is not presented as agreeing like нужен/нужна');
    eq('the lesson introduces no literal colours of its own',
        (g.match(/#[0-9A-Fa-f]{3,8}\b|rgba?\(/g) || []).length, 0);
    const tones = new Set((g.match(/b2g-tone-(sv|nsv)/g) || []));
    ok(tones.size <= 2, `at most two tone classes are used (${[...tones].join(', ')})`);
    const UI = fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8');
    [...new Set(g.match(/b2g[-a-z0-9]*/g) || [])].forEach((cls) =>
        ok(UI.includes('.' + cls), `the shared stylesheet already defines .${cls}`));
    const widest = (g.match(/<tr>[\s\S]*?<\/tr>/g) || [])
        .reduce((n, row) => Math.max(n, (row.match(/<td[ >]/g) || []).length), 0);
    ok(widest <= 2, `no table row has more than two cells (widest: ${widest})`);
}

/* ------------------------------------------------------- 3. listening */
{
    const a = t12.topic12Exercises.exercises.find((g) => g.id === 'audio');
    ok(!!a, 'the audio is its own step');
    eq('the source is the A2 lesson 12 recording',
        decodeURIComponent(a.audioSrc), 'audios/А2 12 урок.mp3');
    ok(!/\.\.\//.test(a.audioSrc), 'the path is course-relative');
    const f = path.join(ROOT, decodeURIComponent(a.audioSrc));
    ok(fs.existsSync(f), `the referenced mp3 exists on disk (${a.audioSrc})`);
    ok(fs.existsSync(f) && fs.statSync(f).size > 10000, 'and it is a real recording');
    ok(/Идеальный день/.test(a.title), 'the step carries the recording’s title');
    eq('the audio step is named, not numbered', a.stepName, 'Audio');
    ok(!a.passage, 'the audio step carries no passage');
    ok(!t12.topic12Exercises.exercises.some((g) => g.passage), 'no step carries a story text');
    /* The source gives no transcript, so none was invented. */
    ok(!/Антон встал|Антон пошёл|Дима сказал/.test(JSON.stringify(
        t12.topic12Exercises.exercises.filter((g) => g.id !== 'truefalse'))),
        'no narration was fabricated for the recording');
}

/* --------------------------------------------- 4. exercises + answer keys */
const EXPECTED = [
    ['ex1', 'choice', 10], ['ex2', 'choice', 10], ['ex3', 'choice', 10],
    ['ex4', 'choice', 10], ['ex5', 'choice', 10], ['ex6', 'input', 10],
    ['ex7', 'input', 10], ['ex8', 'input', 10], ['ex9', 'input', 10],
    ['ex10', 'choice', 10],
    ['audio', 'reading', 0], ['truefalse', 'choice', 10]
];
{
    const groups = t12.topic12Exercises.exercises;
    ok(Array.isArray(groups), 'topic 12 uses the generic exercise shape');
    eq('twelve steps', groups.length, EXPECTED.length);
    EXPECTED.forEach(([id, type, count], i) => {
        const g = groups[i];
        eq(`group ${i + 1} is ${id}`, g.id, id);
        eq(`${id} is a ${type} exercise`, g.type, type);
        eq(`${id} has ${count} questions`, (g.items || []).length, count);
        ok(typeof g.title === 'string' && g.title.trim() !== '', `${id} has a title`);
        if (count > 0) ok(typeof g.howTo === 'string' && g.howTo.trim() !== '',
            `${id} explains how to answer`);
    });

    const norm = (v) => String(v == null ? '' : v).toLowerCase().replace(/ё/g, 'е')
        .replace(/[.,!?;:—–-]/g, ' ').replace(/\s+/g, ' ').trim();
    const acc = (it) => (Array.isArray(it.answer) ? it.answer : [it.answer])
        .filter((a) => String(a == null ? '' : a).trim() !== '');

    let open = 0, multi = 0, bad = 0;
    groups.forEach((g) => {
        (g.items || []).forEach((it, i) => {
            const w = `${g.id}#${i + 1}`;
            ok(typeof it.q === 'string' && it.q.trim() !== '', `${w} has a prompt`);
            if (it.free) { open++; return; }
            const a = acc(it).map(norm);
            if (!a.length) { bad++; ok(false, `${w} has no key`); return; }
            if (a.length > 1) multi++;
            if (g.type === 'choice') {
                const o = (it.options || []).map(norm);
                eq(`${w} options are distinguishable`, new Set(o).size, o.length);
                a.forEach((x) => ok(o.includes(x),
                    `${w}: the accepted answer «${x}» is one of the options`));
            }
        });
    });
    eq('ten prompts are open by design', open, 10);
    eq('no scored question is left without a key', bad, 0);

    const prompts = groups.flatMap((g) => (g.items || []).map((it) => g.id + '|' + norm(it.q)));
    eq('no duplicated question', new Set(prompts).size, prompts.length);

    const total = groups.reduce((s, g) => s + (g.items || []).length, 0);
    eq('110 interactive questions in total', total, 110);
    eq('the ten drills carry 100 of them',
        groups.filter((g) => /^ex\d+$/.test(g.id)).reduce((s, g) => s + g.items.length, 0), 100);
    console.log(`  10 drills + audio + comprehension · ${total} interactive`
        + ` (${open} open · ${multi} multi-accept)`);

    const byId = (id) => groups.find((g) => g.id === id);
    const first = (id) => byId(id).items.map((i) => (Array.isArray(i.answer) ? i.answer[0] : i.answer));

    eq('ex1 keys match the source', first('ex1').join(','),
        'нельзя,можно,можно,нельзя,можно,нельзя,нельзя,можно,нельзя,можно');
    ok(byId('ex1').items.every((i) => i.options.join('|') === 'можно|нельзя'),
        'ex1 offers only можно / нельзя');
    eq('ex2 keys match the source', first('ex2').join(','),
        'нужно,нужно,не нужно,не нужно,нужно,не нужно,нужно,не нужно,нужно,нужно');
    ok(byId('ex2').items.every((i) => i.options.join('|') === 'нужно|не нужно'),
        'ex2 offers only нужно / не нужно');

    /* The source pairs each ex3 item with its OWN two options — надо/нельзя or
       нужно/можно. Flattening that into a generic надо/нужно chip row would be
       a different exercise. */
    eq('ex3 keys match the source', first('ex3').join(','),
        'надо,нужно,надо,нужно,надо,нужно,надо,нужно,надо,нужно');
    eq('ex3 keeps the source’s own option pairs',
        byId('ex3').items.map((i) => i.options.join('/')).join(' | '),
        ['надо/нельзя', 'нужно/можно', 'надо/нельзя', 'нужно/можно', 'надо/нельзя',
         'нужно/можно', 'надо/нельзя', 'нужно/можно', 'надо/нельзя', 'нужно/можно'].join(' | '));

    eq('ex4 keys match the source', first('ex4').join(','),
        'должен,должна,должны,должен,должна,должны,должен,должна,должны,должны');
    ok(byId('ex4').items.every((i) => i.options.join('|') === 'должен|должна|должно|должны'),
        'ex4 offers all four agreement forms');

    /* ---- ex5: the source states outright that both words fit most of these ---- */
    const ex5 = byId('ex5');
    eq('ex5 source-preferred answers lead', first('ex5').join(','),
        'лучше,следует,следует,лучше,лучше,следует,лучше,следует,лучше,следует');
    ok(ex5.items.every((i) => i.answer.length === 2),
        'ex5 accepts both следует and лучше on every item');
    ok(ex5.items.every((i) => i.answer.slice().sort().join('|') === 'лучше|следует'),
        'and the accepted pair is exactly those two words');
    ok(/ikkala variant/.test(ex5.intro || ''), 'and the learner is told so');

    eq('ex6 keys match the source', first('ex6').join(','),
        'курить,работать,отдыхать,фотографировать,соблюдать,купить,опаздывать,подготовиться,позвонить,войти');
    ok(byId('ex6').items.every((i) => /ть$|ться$|ти$/.test(i.answer[0])),
        'every ex6 answer is an infinitive');

    /* ---- ex7: #3 is ALREADY CORRECT in the source, deliberately ---- */
    const ex7 = byId('ex7');
    eq('ex7 corrections match the source', first('ex7').join(' | '),
        ['Мне нужно работать сегодня', 'Здесь нельзя курить', 'Она должна купить билет',
         'Тебе нужно отдыхать', 'Мы должны соблюдать правила', 'Здесь можно фотографировать',
         'Ему надо позвонить врачу', 'Они должны приходить вовремя', 'Мне нельзя опаздывать',
         'Вам следует больше отдыхать'].join(' | '));
    const alreadyRight = ex7.items
        .map((it, i) => (norm(it.q) === norm(it.answer[0]) ? i + 1 : 0)).filter(Boolean);
    eq('exactly one ex7 sentence is already correct — and it is #3',
        alreadyRight.join(','), '3');
    eq('#3 prompt', ex7.items[2].q, 'Она должна купить билет.');
    eq('#3 answer', ex7.items[2].answer[0], 'Она должна купить билет');
    /* The learner must be warned, or #3 is a trap rather than a test. */
    ok(/allaqachon to‘g‘ri|to‘g‘ri/.test(ex7.howTo || ''),
        'the instruction warns that one sentence may already be correct');

    eq('ex8 canonical translations lead', first('ex8').join(' | '),
        ['Здесь нельзя курить', 'Мне нужно работать сегодня', 'Тебе нужно больше отдыхать',
         'Мы должны соблюдать правила', 'Здесь можно фотографировать',
         'Ему нужно позвонить врачу', 'Вам нельзя парковать машину здесь',
         'Мне нужно сделать домашнее задание', 'Они должны прийти вовремя',
         'Тебе лучше пить больше воды'].join(' | '));

    /* ---- ex9 is genuinely open ---- */
    const ex9 = byId('ex9');
    ok(ex9.items.every((i) => i.free === true), 'every ex9 prompt is marked free');
    ok(ex9.items.every((i) => /^Namuna:/.test(i.hint || '')), 'each carries a Namuna sample');
    const MIN = Number((fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8')
        .match(/OPEN_ANSWER_MIN_WORDS = (\d+)/) || [])[1]);
    ok(MIN > 0, 'the engine states its open-answer minimum');
    ex9.items.forEach((it, i) => ok(
        norm(it.answer[0]).split(' ').filter(Boolean).length >= MIN,
        `ex9#${i + 1}: the sample meets the engine's ${MIN}-word minimum`));
    ok(/bitta to‘g‘ri javob yo‘q/.test(ex9.howTo || ''),
        'and the learner is told there is no single right answer');
    eq('the ten situations are the source situations',
        ex9.items.map((i) => i.q).join(' | '),
        ['Я плохо сплю.', 'Я часто опаздываю.', 'Я плохо знаю русский язык.',
         'У меня болит голова.', 'Я много работаю.', 'Я часто ем фастфуд.',
         'Я боюсь говорить по-русски.', 'Я хочу хорошо сдать экзамен.',
         'Я часто забываю новые слова.', 'Я хочу быть здоровым.'].join(' | '));

    /* ---- ex10: #6 is context-dependent by the source's own note ---- */
    const ex10 = byId('ex10');
    eq('ex10 keys match the source', first('ex10').join(','),
        'нужно,следует,нельзя,нужно,должны,можно,лучше,нужно,должны,можно');
    eq('ex10 #6 accepts BOTH readings', ex10.items[5].answer.slice().sort().join('|'),
        'можно|нельзя');
    eq('#6 is the museum sentence the source calls context-dependent',
        ex10.items[5].q, 'В этом музее ______ фотографировать.');
    eq('and it is the ONLY ex10 item with more than one key',
        ex10.items.filter((i) => i.answer.length > 1).length, 1);
    ok(ex10.items.every((i) => i.options.join('|') === 'можно|нельзя|нужно|должны|следует|лучше'),
        'ex10 offers the six constructions the lesson teaches');

    /* ---- comprehension ---- */
    eq('the comprehension keys match the source',
        byId('truefalse').items.map((i) => i.answer).join(','),
        'Правда,Ложь,Правда,Ложь,Ложь,Правда,Правда,Ложь,Правда,Правда');
    ok(byId('truefalse').items.every((i) => i.options.join('|') === 'Правда|Ложь'),
        'the comprehension check offers Правда / Ложь');
    eq('the ten statements are the source statements, verbatim',
        byId('truefalse').items.map((i) => i.q).join(' | '),
        ['Антон решил провести идеальный день в субботу.',
         'Антон утром сразу встал рано.',
         'Мама написала, что нельзя завтракать только шоколадом.',
         'Антон съел только один кусочек шоколада.',
         'В парке можно бросать мусор на землю.',
         'Антон попросил человека выбросить бутылку в урну.',
         'Дима посоветовал Антону больше заниматься спортом.',
         'Антон пробежал десять километров.',
         'В кафе нельзя громко разговаривать.',
         'В конце Антон решил, что нужно каждый день становиться немного лучше.'].join(' | '));
}

/* ------------------------------------------------------- 5. vocabulary */
{
    const VSRC = mainScript(fs.readFileSync(path.join(ROOT, 'paid-courses/a2-vocabulary.html'), 'utf8'));
    const all = literal(VSRC, 'vocabularyData').topics;
    const v = all.find((t) => t.id === 12);
    ok(!!v, 'vocabulary topic 12 exists');
    eq('55 cards, exactly the source count', v.words.length, 55);
    eq('no exact duplicate card',
        new Set(v.words.map((w) => w.ru.toLowerCase() + '||' + w.uz.toLowerCase())).size, 55);
    eq('no repeated russian side either',
        new Set(v.words.map((w) => w.ru.toLowerCase())).size, 55);
    ok(v.words.every((w) => w.ru && w.ru.trim() && w.uz && w.uz.trim()),
        'no card has an empty side');
    eq('the deck opens on «правило»', v.words[0].ru + ' — ' + v.words[0].uz, 'правило — qoida');
    eq('and closes on «становиться лучше»', v.words[54].ru + ' — ' + v.words[54].uz,
        'становиться лучше — yaxshiroq bo‘lib bormoq');
    /* Every one of the 55 source pairs, in source order. */
    const SOURCE = [
     'правило|qoida','совет|maslahat','разрешение|ruxsat','запрет|taqiq',
     'обязанность|majburiyat','можно|mumkin, ruxsat','нельзя|mumkin emas, taqiqlanadi',
     'нужно|kerak','надо|kerak','должен|kerak, shart','должна|kerak, shart',
     'должны|kerak, shart','следует|lozim, kerak','стоит|ma’qul, kerak',
     'лучше|yaxshiroq, ma’qul','разрешено|ruxsat etilgan','запрещено|taqiqlangan',
     'соблюдать|rioya qilmoq','нарушать|buzmoq','разрешать|ruxsat bermoq',
     'запрещать|taqiqlamoq','советовать|maslahat bermoq','предупреждать|ogohlantirmoq',
     'объяснять|tushuntirmoq','следовать|amal qilmoq','выполнять|bajarmoq',
     'проверять|tekshirmoq','опаздывать|kechikmoq','приходить вовремя|o‘z vaqtida kelmoq',
     'ждать|kutmoq','спешить|shoshilmoq','отдыхать|dam olmoq','работать|ishlamoq',
     'учиться|o‘qimoq','заниматься спортом|sport bilan shug‘ullanmoq','курить|chekmoq',
     'шуметь|shovqin qilmoq','фотографировать|suratga olmoq','парковаться|mashina qo‘ymoq',
     'мусорить|axlat tashlamoq','трогать|tegmoq','пользоваться|foydalanmoq',
     'входить|kirmoq','выходить|chiqmoq','включать|yoqmoq','выключать|o‘chirmoq',
     'осторожно|ehtiyotkorlik bilan','внимательно|diqqat bilan','обязательно|albatta, shart',
     'соблюдать тишину|tinchlikni saqlamoq','соблюдать правила|qoidalarga rioya qilmoq',
     'соблюдать чистоту|tozalikni saqlamoq','быть осторожным|ehtiyotkor bo‘lmoq',
     'делать выводы|xulosa chiqarmoq','становиться лучше|yaxshiroq bo‘lib bormoq'];
    eq('all 55 source pairs are present, in source order',
        v.words.map((w) => w.ru + '|' + w.uz).join(' ~ '), SOURCE.join(' ~ '));
    ok(/\b12:\s*55\b/.test(SRC), 'the course card advertises 55 words for topic 12');
    eq('topics 1-11 vocabulary unchanged',
        [1,2,3,4,5,6,7,8,9,10,11].map((id) => all.find((t) => t.id === id).words.length).join(','),
        '45,77,73,106,50,69,85,85,50,69,70');
    /* no placeholder decks remain — every A2 topic ships vocabulary now */
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
            'window.completeCourseTopic=async function(c,t){window.__claims.push({c:c,t:t});' +
            ' window.__srv=Array.from(new Set([...(window.__srv||[]),t])).sort((a,b)=>a-b);' +
            ' return window.__srv.slice();};' +
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

    w.__api.setCompleted([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    w.eval('currentTopicId=12;');
    w.__api.loadLesson(12);
    const D = w.document;

    ok(!!w.__api.exData(t12), 'the generic engine claims topic 8');
    eq('twelve steps exist in the hidden bridge', D.querySelectorAll('[data-t1-ex]').length, 12);
    /* ex6, ex7, ex8 and ex9 are the text-input drills; topic 12 has no builder. */
    eq('forty text inputs render across the four input steps',
        D.querySelectorAll('[data-t1-input]').length, 40);
    const lesson = (D.getElementById('lessonContent') || D.body).textContent;
    ok(/Необходимо предъявить паспорт/.test(lesson), 'the grammar reaches the screen');
    ok(/Audio va tushunish savollari/.test(lesson), 'the lesson announces the listening step');

    const first = (a) => (Array.isArray(a) ? a[0] : a);
    let missing = 0;
    t12.topic12Exercises.exercises.forEach((g) => {
        (g.items || []).forEach((it, i) => {
            const key = g.id + '-' + i;
            if (g.type === 'choice') {
                const row = D.querySelector(`[data-t1-row="${key}"]`);
                /* A choice may accept more than one option — ex7 works with
                   either time expression. A learner clicks one chip, so the
                   walk picks the first accepted value. */
                const want = Array.isArray(it.answer) ? it.answer[0] : it.answer;
                const btn = row && [...row.querySelectorAll('.t1-opt')]
                    .find((b) => b.getAttribute('data-value') === want);
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
        await w.__api.check(12);
        const marked = D.querySelectorAll('.t1-opt.t1-ok').length
            + D.querySelectorAll('[data-t1-input].correct').length;
        const scoreText = (D.getElementById('scoreDisplay') || {}).textContent || '';
        ok(/\b110\s*\/\s*110\b/.test(scoreText),
            `a perfect paper is graded 110/110 (${scoreText.trim()})`);
        ok(marked >= 20, `the graded widgets mark themselves correct (${marked})`);

        /* Completion must go through the server, and unlock topic 9. */
        await w.__api.complete(12);
        await new Promise((r) => setTimeout(r, 150));
        eq('exactly one completion claim', w.__claims.length, 1);
        eq('the claim names course A2', w.__claims[0].c, 'A2');
        eq('the claim names topic 12', w.__claims[0].t, 12);
        ok(w.__api.getCompleted().includes(12), 'the server answer is adopted');
        ok(w.__safe.every((p) => !('completedTopics' in p)),
            'no completion field went through the generic saver');
        ok(w.__api.getCompleted().includes(12), 'topic 13 unlocks');
        ok(!/saveUserProgress\([^)]*completedTopics/.test(SRC),
            'topic 12 introduced no direct authoritative write');

        /* A REFUSED server save must not unlock anything. */
        {
            const wf = boot();
            wf.eval('window.completeCourseTopic=async function(){throw new Error("offline");};');
            wf.__api.setCompleted([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
            wf.eval('currentTopicId=12;');
            wf.__api.loadLesson(12);
            try { await wf.__api.complete(12); } catch (e) { /* surfaced to the learner */ }
            await new Promise((r) => setTimeout(r, 120));
            ok(!wf.__api.getCompleted().includes(12),
                'a failed server save leaves topic 12 incomplete');
        }

        /* ---------- 7. THE STEPPING SESSION, not a long page ---------- */
        const w2 = boot();
        const D2 = w2.document;
        w2.__api.setCompleted([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
        w2.eval('currentTopicId=12;');
        w2.__api.loadLesson(12);
        w2.__api.render(12);
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
        ok(/В больнице/.test(host().textContent), 'step 1 is exercise 1');
        ok(!/приготовить ужин/.test(host().textContent), 'exercise 2 is NOT also on screen');
        ok(!host().querySelector('audio'), 'the audio player is NOT on screen yet');
        ok(/Javoblarni tekshirish/.test([...D2.querySelectorAll('.uz-foot button, .uz-btn')]
            .map((b) => b.textContent).join(' | ')), 'the check button is in Uzbek');

        const groups = t12.topic12Exercises.exercises;
        const seen = [];
        let multi = 0;
        for (let i = 0; i < groups.length; i++) {
            seen.push(stepText().trim());
            if (titlesOnScreen() > 1) multi++;
            const g = groups[i];
            (g.items || []).forEach((it, k) => {
                const key = g.id + '-' + k;
                const row = host().querySelector(`[data-t1-row="${key}"]`);
                if (row) {
                    const want = Array.isArray(it.answer) ? it.answer[0] : it.answer;
                    const b = [...row.querySelectorAll('.t1-opt')]
                        .find((x) => x.getAttribute('data-value') === want);
                    if (b) b.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
                }
                const inp = host().querySelector(`[data-t1-input="${key}"]`);
                if (inp) {
                    inp.value = Array.isArray(it.answer) ? it.answer[0] : it.answer;
                    inp.dispatchEvent(new w2.Event('input', { bubbles: true }));
                }
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
                ok(/audios\/А2 12 урок\.mp3$/.test(played),
                    `the player points at the A2 lesson 12 recording (${played})`);
                ok(!/Б2/.test(played), 'and not at a Б2 recording');
                ok(!/Антон решил провести/.test(host().textContent),
                    'the comprehension statements are NOT on the audio step');
                ok(!foot.some((t) => /tekshirish/i.test(t)),
                    'the audio step offers no check button');
                ok(!foot.some((t) => /qayta ishlash/i.test(t)), 'and no retry');
                eq('the audio step offers exactly one action', foot.length, 1);
                ok(/Savollarga/.test(foot[0] || ''), 'that action moves on to the questions');
            }
            if (g.id === 'truefalse') {
                ok(/Антон решил провести/.test(host().textContent),
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
        ok(!/topic12(Active|Step|Custom|Navigation|Renderer|State|Wizard|Checker|Modal|Storage)/i.test(SRC),
            'topic 12 introduced no bespoke step/state/renderer machinery');
        ok(/window\.A2Host\.mountPractice/.test(SRC),
            'topic 12 goes through the shared A2 practice mount');
        eq('exactly one practice mount in the page',
            (SRC.match(/A2Host\.mountPractice\(/g) || []).length, 1);
        {
            const a = SRC.indexOf('topic12Exercises:');
            const b = SRC.indexOf('id: 13,', a);
            ok(!/function\s*\(|=>/.test(SRC.slice(a, b)), 'the topic 12 payload is data, not logic');
        }

        console.log('='.repeat(60));
        if (fail) {
            console.log(`  ❌ A2 TOPIC 12: ${fail} failed / ${pass + fail}\n`);
            failures.slice(0, 20).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
            console.log('='.repeat(60) + '\n');
            process.exit(1);
        }
        console.log(`  ✅ A2 TOPIC 12: ${pass}/${pass} passed`);
        console.log('='.repeat(60) + '\n');
    })();
}
