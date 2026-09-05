#!/usr/bin/env node
/**
 * verify_a2_topic14.cjs — A2 topic 14 «Taqqoslash va tanlov» must stay a
 * complete, honestly gradable lesson.
 *
 * The material for this lesson carries a full answer key, and nine of its ten
 * drills are used exactly as written, key and all. Two things were changed,
 * and this suite exists mostly to keep those two changes from silently
 * reverting:
 *
 *   Ex4 is a REPLACEMENT. The source printed bare frames — "Этот вариант
 *   ______ удобный." — in which BOTH более and менее produce correct Russian.
 *   There was no fact in the prompt that decided the answer, so the exercise
 *   could not be graded. Ten context-bearing prompts replace it, and the old
 *   ambiguous frames must never come back.
 *
 *   Ex8 is OPEN. "Что лучше: чай или кофе?" has no right side; the source's
 *   own line is labelled «Namuna», not an answer. Every item is free-graded,
 *   so a learner who prefers кофе is not marked wrong.
 *
 * Four smaller source defects are pinned too: the -ее/-ей rule no longer
 * claims дешевле/дороже are formed by it, старше carries its person/age note,
 * the «Из двух ...» examples are complete sentences, and Ex7 #7 states the
 * comparison the other nine items state.
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

console.log('\n=== A2 TOPIC 14 ===');

const topics = literal(SRC, 'courseData').topics;
const t14 = topics.find((t) => t.id === 14);

/* ------------------------------------------------------- 1. the topic */
eq('exactly one topic 14', topics.filter((t) => t.id === 14).length, 1);
eq('16 A2 topics, unchanged', topics.length, 16);
ok(!!t14, 'topic 14 exists');
eq('title', t14.title, 'Taqqoslash va tanlov');
ok(!t14.quiz, 'the empty placeholder quiz is gone');
ok(typeof t14.explanation.uz === 'string' && t14.explanation.uz.length > 40,
    'topic 14 has a real Uzbek introduction');
ok(!/faqat to‘liq kurs obunachilari/.test(t14.explanation.uz),
    'the "subscribers only" placeholder text is gone');
ok(/taqqosla/i.test(t14.explanation.uz) && /tanlo/i.test(t14.explanation.uz)
    && /eng yuqori/i.test(t14.explanation.uz),
    'the introduction names comparison, the superlative and choosing');
ok(t14.isSubscriptionLocked === false && t14.isLocked === false, 'topic 14 is open');

/* A2 is complete: topic 16 is authored now, so this lesson's old
   "everything after me is a placeholder" tail has no target left. Whole-course
   authored state is asserted by verify_a2_release.cjs, which owns it. */

/* ------------------------------------------------------- 2. grammar */
{
    const g = t14.grammar || '';
    ok(g.length > 3000, `grammar is substantial (${g.length} chars)`);
    [['lead names the Russian topic', /Сравнение и выбор/],
     ['1 · positive degree model', /Кто \/ что<\/b> <span>\+<\/span> <b[^>]*>какой\?/],
     ['1 · positive examples', /Этот дом большой[\s\S]*Эта сумка красивая[\s\S]*Этот телефон дорогой[\s\S]*Москва большая/],
     ['2 · A + comparative + чем + B', /<b>A<\/b> <span>\+<\/span> <b[^>]*>qiyosiy daraja<\/b> <span>\+<\/span> <b>чем<\/b> <span>\+<\/span> <b>B<\/b>/],
     ['2 · comparative examples', /Москва больше, чем Ташкент[\s\S]*Этот телефон дороже, чем тот[\s\S]*Анна выше, чем Ольга[\s\S]*Сегодня теплее, чем вчера/],
     ['3 · the -ее/-ей rule', /-ее \/ -ей<\/b> yordamida hosil bo.ladi/],
     ['3 · the five regular formations', /красивее[\s\S]*умнее[\s\S]*быстрее[\s\S]*интереснее[\s\S]*удобнее/],
     ['4 · the nine standard exceptions', /лучше[\s\S]*хуже[\s\S]*больше[\s\S]*меньше[\s\S]*выше[\s\S]*ниже[\s\S]*моложе[\s\S]*дальше[\s\S]*ближе/],
     ['5 · чем comparison examples', /Кофе горячее, чем чай[\s\S]*Машина быстрее, чем автобус[\s\S]*Летом теплее, чем зимой[\s\S]*Этот ресторан дороже, чем кафе/],
     ['6 · чем…, тем… model', /<b>Чем<\/b> <span>\+<\/span> <b[^>]*>qiyosiy daraja<\/b><span>,<\/span> <b>тем<\/b>/],
     ['6 · qancha … shuncha …', /qancha \.\.\., shuncha \.\.\./],
     ['6 · all four чем/тем examples', /Чем больше читаешь, тем больше знаешь[\s\S]*Чем больше работаешь, тем больше устаёшь[\s\S]*Чем раньше встаёшь, тем больше успеваешь[\s\S]*Чем дороже телефон, тем лучше камера/],
     ['7 · самый + adjective model', /<b[^>]*>самый<\/b> <span>\+<\/span> <b>sifat<\/b>/],
     ['7 · the four самый phrases', /самый красивый<\/b>[\s\S]*самый большой<\/b>[\s\S]*самый дорогой<\/b>[\s\S]*самый интересный<\/b>/],
     ['7 · superlative sentences', /Это самый красивый город[\s\S]*один из самых больших городов России[\s\S]*Это самый дорогой ресторан здесь/],
     ['8 · agreement of all four forms', /самый<\/b> — erkak jins[\s\S]*самая<\/b> — ayol jins[\s\S]*самое<\/b> — o.rta jins[\s\S]*самые<\/b> — ko.plik/],
     ['8 · the four agreed phrases', /самый красивый город[\s\S]*самая красивая улица[\s\S]*самое красивое место[\s\S]*самые красивые места/],
     ['9 · более / менее glossed', /более<\/b> <span>=<\/span> <b>ko.proq \/ yanada<\/b>[\s\S]*менее<\/b> <span>=<\/span> <b>kamroq<\/b>/],
     ['9 · the five более/менее phrases', /более интересный[\s\S]*более удобный[\s\S]*более современный[\s\S]*менее дорогой[\s\S]*менее удобный/],
     ['9 · более/менее sentences', /Этот вариант более удобный[\s\S]*Этот телефон более современный[\s\S]*Первый вариант менее дорогой/],
     ['10 · из двух model', /<b>Из двух<\/b> <span>\+<\/span> <b[^>]*>вариантов<\/b>/],
     ['11 · я выбираю … потому что …', /Я выбираю этот телефон, потому что он дешевле[\s\S]*Я выбираю эту квартиру, потому что она ближе к центру[\s\S]*Я выбираю этот ресторан, потому что он лучше/],
     ['12 · мне больше нравится A, чем B', /Мне больше нравится чай, чем кофе[\s\S]*Мне больше нравится море, чем горы[\s\S]*Мне больше нравится эта машина, чем та/],
     ['13 · что лучше questions', /Что лучше: чай или кофе\?[\s\S]*Что лучше: жить в городе или за городом\?[\s\S]*Что лучше: купить машину или путешествовать\?[\s\S]*Что лучше: учиться утром или вечером\?/],
     ['14 · all six justification models', /Я выбираю \.\.\., потому что \.\.\.<\/b>[\s\S]*Я предпочитаю \.\.\., потому что \.\.\.<\/b>[\s\S]*Мне больше нравится \.\.\., чем \.\.\.<\/b>[\s\S]*Я думаю, что \.\.\. лучше<\/b>[\s\S]*По-моему, \.\.\. удобнее<\/b>[\s\S]*Для меня \.\.\. важнее, чем \.\.\.<\/b>/],
     ['14 · я предпочитаю example', /Я предпочитаю поезд, потому что он удобнее/],
     ['14 · по-моему example', /По-моему, этот вариант лучше/],
     ['14 · для меня example', /Для меня цена важнее, чем бренд/],
     ['14 · я выбираю example', /Я выбираю этот ресторан, потому что он ближе/]
    ].forEach(([label, re]) => ok(re.test(g), `grammar covers ${label}`));

    /* the ten key constructions, numbered, in source order */
    ['Москва больше, чем Ташкент.', 'Этот фильм интереснее, чем тот.',
     'Этот вариант более удобный.', 'Этот вариант менее дорогой.',
     'Это самый красивый парк.', 'Чем больше читаешь, тем больше знаешь.',
     'Я выбираю поезд, потому что он быстрее.', 'Мне больше нравится море, чем горы.',
     'Что лучше: автобус или метро?', 'По-моему, поезд удобнее, чем автобус.']
        .forEach((s, i) => ok(g.includes(`<b>${i + 1}.</b>`) && g.includes(s),
            `key construction ${i + 1} is present («${s}»)`));

    /* ---- SOURCE FIX A: comparative formation is no longer one flat rule ---- */
    const fixA = g.indexOf('Diqqat!');
    ok(fixA > 0, 'the formation block warns that some forms are irregular');
    ok(/asos o.zgaradi yoki butunlay boshqa shakl/.test(g),
        'and says the stem changes or another form is used');
    {
        const warn = g.slice(fixA, g.indexOf('</div>', g.indexOf('tayyor shakl')));
        ok(/дешёвый<\/td><td>&rarr; <b[^>]*>дешевле/.test(warn)
            && /дорогой<\/td><td>&rarr; <b[^>]*>дороже/.test(warn),
            'дешевле and дороже are shown INSIDE that warning, not in the -ее/-ей list');
    }
    {
        const rule = g.slice(g.indexOf('-ее / -ей</b> yordamida'), fixA);
        ok(!/дешевле|дороже/.test(rule),
            'the -ее/-ей list itself no longer contains дешевле / дороже');
    }
    ok(/tayyor shakl sifatida eslab qolish/.test(g),
        'the learner is told to memorise those forms instead');

    /* ---- SOURCE FIX B: старше is about a person's age ---- */
    ok(/старше<\/b> odatda <b>odamning yoshi<\/b>/.test(g),
        'старше is scoped to a person’s age');
    ok(/Мой брат старше меня/.test(g) && /Анна старше Ольги/.test(g),
        'with the two person examples');
    ok(/старее<\/b> yoki <b[^>]*>более старый/.test(g),
        'and objects get старее / более старый');
    ok(/Этот телефон старше другого<\/span> — universal namuna emas/.test(g),
        'the object-with-старше sentence is explicitly flagged as NOT a model');
    {
        const ex = g.indexOf('старый</td><td>&rarr;');
        ok(ex < 0, 'старый → старше is not listed as a plain exception like the others');
    }

    /* ---- SOURCE FIX D: «Из двух …» examples are complete ---- */
    ok(!/Из двух платьев я выбираю это\./.test(g),
        'the bare «Из двух платьев я выбираю это.» is gone');
    ok(!/Из двух ресторанов я выбираю этот\./.test(g),
        'the bare «Из двух ресторанов я выбираю этот.» is gone');
    ['Из двух платьев я выбираю это платье.', 'Из двух платьев я выбираю первое.',
     'Из двух телефонов я выбираю первый.', 'Из двух ресторанов я выбираю этот ресторан.']
        .forEach((s) => ok(g.includes(s), `the corrected example «${s}» is present`));

    /* ---- §24: the answer pattern differs for a noun and for an action ---- */
    ok(/Я думаю, что чай лучше/.test(g) && /По-моему, чай лучше/.test(g),
        'answering about a noun keeps the adjective last');
    ok(/Я думаю, что лучше жить в городе/.test(g),
        'answering about an action puts лучше before the verb');
    ok(!/Я думаю, что лучше чай/.test(g),
        'the awkward «Я думаю, что лучше чай» is not taught as the template');

    /* ---- §20: более/менее is not restricted to "long adjectives" ---- */
    ok(!/uzun sifatlar/.test(g), 'более/менее is not sold as a long-adjective-only rule');
    ok(/современный, удобный, практичный, эффективный, качественный/.test(g),
        'it names the adjective families where the analytic form is natural');
    ok(/более дешевле<\/span> — noto.g.ri/.test(g),
        'and warns against the double comparative «более дешевле»');

    eq('fifteen numbered blocks', (g.match(/class="b2g-h"/g) || []).length, 15);
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
    const a = t14.topic14Exercises.exercises.find((g) => g.id === 'audio');
    ok(!!a, 'the audio is its own step');
    eq('the source is the A2 lesson 14 recording',
        decodeURIComponent(a.audioSrc), 'audios/А2 14 урок.mp3');
    ok(!/\.\.\//.test(a.audioSrc), 'the path is course-relative');
    const f = path.join(ROOT, decodeURIComponent(a.audioSrc));
    ok(fs.existsSync(f), `the referenced mp3 exists on disk (${a.audioSrc})`);
    ok(fs.existsSync(f) && fs.statSync(f).size > 10000, 'and it is a real recording');
    ok(/Два варианта/.test(a.title), 'the step carries the recording’s title');
    eq('the audio step is named, not numbered', a.stepName, 'Audio');
    ok(!a.passage, 'the audio step carries no passage');
    ok(!t14.topic14Exercises.exercises.some((g) => g.passage), 'no step carries a story text');
    /* The material contains no transcript. None was written. */
    ok(!/Малика (пришла|решила|зашла|сказала)|продавец сказал|Однажды/i.test(JSON.stringify(
        t14.topic14Exercises.exercises.filter((g) => g.id !== 'truefalse'))),
        'no narration was fabricated for the recording');
}

/* --------------------------------------------- 4. exercises + source keys */
const EXPECTED = [
    ['ex1', 'input', 10], ['ex2', 'input', 10], ['ex3', 'choice', 10],
    ['ex4', 'choice', 10], ['ex5', 'input', 10], ['ex6', 'choice', 10],
    ['ex7', 'input', 10], ['ex8', 'input', 10], ['ex9', 'input', 10],
    ['ex10', 'input', 10], ['audio', 'reading', 0], ['truefalse', 'choice', 10]
];
{
    const groups = t14.topic14Exercises.exercises;
    ok(Array.isArray(groups), 'topic 14 uses the generic exercise shape');
    eq('twelve steps: ten drills, an audio and a comprehension check',
        groups.length, EXPECTED.length);
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
        .replace(/[.,!?;:()"'«»—–-]/g, ' ').replace(/\s+/g, ' ').trim();
    const acc = (it) => (Array.isArray(it.answer) ? it.answer : [it.answer])
        .filter((a) => String(a == null ? '' : a).trim() !== '');

    let multi = 0, open = 0, bad = 0;
    groups.forEach((g) => {
        (g.items || []).forEach((it, i) => {
            const w = `${g.id}#${i + 1}`;
            ok(typeof it.q === 'string' && it.q.trim() !== '', `${w} has a prompt`);
            if (it.free) { open++; return; }
            const a = acc(it).map(norm);
            if (!a.length) { bad++; ok(false, `${w} has no key`); return; }
            if (a.length > 1) multi++;
            eq(`${w}: no two accepted answers are the same after normalisation`,
                new Set(a).size, a.length);
            if (g.type === 'choice') {
                const o = (it.options || []).map(norm);
                eq(`${w} options are distinguishable`, new Set(o).size, o.length);
                a.forEach((x) => ok(o.includes(x),
                    `${w}: the accepted answer «${x}» is one of the options`));
            }
        });
    });
    eq('no gradable question is left without a key', bad, 0);

    const prompts = groups.flatMap((g) => (g.items || []).map((it) => g.id + '|' + norm(it.q)));
    eq('no duplicated question', new Set(prompts).size, prompts.length);

    const total = groups.reduce((s, g) => s + (g.items || []).length, 0);
    eq('110 interactive questions in total', total, 110);
    eq('the ten drills carry 100 of them',
        groups.filter((g) => /^ex\d+$/.test(g.id)).reduce((s, g) => s + g.items.length, 0), 100);
    eq('the comprehension check carries the other 10',
        groups.find((g) => g.id === 'truefalse').items.length, 10);
    eq('exactly ten open prompts, all of them in ex8', open, 10);
    console.log(`  10 drills + audio + comprehension · ${total} interactive`
        + ` (${open} open, ${multi} multi-accept)`);

    const byId = (id) => groups.find((g) => g.id === id);
    const first = (id) => byId(id).items.map((i) => (Array.isArray(i.answer) ? i.answer[0] : i.answer));
    const all = (id, n) => byId(id).items[n - 1].answer;

    /* ---- ex1: the source key, verbatim ---- */
    eq('ex1 source key', first('ex1').join(','),
        'больше,дороже,теплее,быстрее,интереснее,выше,лучше,удобнее,короче,хуже');
    ok(byId('ex1').items.every((i) => /\((большой|дорогой|тёплый|быстрый|интересный|высокий|хороший|удобный|короткий|плохой)\)/.test(i.q)),
        'every ex1 prompt prints the adjective it is built from');

    /* ---- ex2: чем, ten times, exactly as the source has it ---- */
    ok(byId('ex2').items.every((i) => acc(i).length === 1 && acc(i)[0] === 'чем'),
        'ex2 answers чем throughout — the source exercise, unchanged');
    eq('ex2 keeps the source prompts', byId('ex2').items.map((i) => i.q).join(' | '),
        ['Москва больше ______ Ташкент.', 'Этот телефон дешевле ______ тот.',
         'Моя комната светлее, ______ твоя.', 'Поезд быстрее, ______ автобус.',
         'Сегодня холоднее, ______ вчера.', 'Этот ресторан лучше, ______ тот.',
         'Анна моложе, ______ Мария.', 'Новый дом выше, ______ старый.',
         'Кофе горячее, ______ чай.', 'Эта задача легче, ______ первая.'].join(' | '));

    /* ---- ex3: самый / самая / самое / самые ---- */
    eq('ex3 source key', first('ex3').join(','),
        'самый,самая,самое,самые,самый,самая,самое,самые,самый,самая');
    ok(byId('ex3').items.every((i) => i.options.join('|') === 'самый|самая|самое|самые'),
        'ex3 offers all four agreed forms every time');

    /* =================== EX4 — THE REPLACEMENT =================== */
    /* The source exercise could not be graded: nothing in its prompts decided
       between более and менее. These ten prompts each state the deciding fact. */
    const EX4 = [
        ['Новая квартира светлая и просторная, поэтому она ______ удобная, чем старая.', 'более'],
        ['Этот ресторан дешевле соседнего, поэтому он ______ дорогой.', 'менее'],
        ['У новой модели больше функций, поэтому она ______ современная.', 'более'],
        ['Это упражнение проще предыдущего, поэтому оно ______ сложное.', 'менее'],
        ['Этот способ даёт лучший результат, поэтому он ______ эффективный.', 'более'],
        ['В этом районе мало автобусов и магазинов, поэтому он ______ удобный для жизни.', 'менее'],
        ['Этот материал легче первого, поэтому он ______ сложный.', 'менее'],
        ['У нового телефона лучше экран и камера, поэтому он ______ качественный.', 'более'],
        ['Эту модель покупают чаще других, поэтому она ______ популярная.', 'более'],
        ['Этот вариант требует меньше денег, поэтому он ______ дорогой.', 'менее']
    ];
    eq('ex4 carries the ten replacement prompts, in order',
        byId('ex4').items.map((i) => i.q).join(' | '), EX4.map((r) => r[0]).join(' | '));
    eq('ex4 keys', first('ex4').join(','), EX4.map((r) => r[1]).join(','));
    eq('ex4 · более at 1,3,5,8,9',
        byId('ex4').items.map((i, n) => (i.answer === 'более' ? n + 1 : 0)).filter(Boolean).join(','),
        '1,3,5,8,9');
    eq('ex4 · менее at 2,4,6,7,10',
        byId('ex4').items.map((i, n) => (i.answer === 'менее' ? n + 1 : 0)).filter(Boolean).join(','),
        '2,4,6,7,10');
    ok(byId('ex4').items.every((i) => i.options.join('|') === 'более|менее'),
        'ex4 offers более / менее');
    /* Every replacement prompt must carry the fact that decides it. */
    ok(byId('ex4').items.every((i) => /поэтому/.test(i.q)),
        'every ex4 prompt states a reason before the gap');
    /* THE OLD AMBIGUOUS FRAMES MUST NOT COME BACK. */
    ['Этот вариант ______ удобный.', 'Эта квартира ______ современная.',
     'Этот ресторан ______ дорогой.', 'Первый вариант ______ интересный.',
     'Эта машина ______ экономичная.', 'Этот телефон ______ качественный.',
     'Этот маршрут ______ удобный.', 'Эта модель ______ популярная.',
     'Второй вариант ______ практичный.', 'Этот способ ______ эффективный.']
        .forEach((old) => ok(!byId('ex4').items.some((i) => i.q.trim() === old),
            `the ungradable source prompt «${old}» has not returned`));
    ok(!byId('ex4').items.some((i) => norm(i.q).split(' ').length < 8),
        'no ex4 prompt is short enough to be context-free again');

    /* ---- ex5: тем, ten times, source prompts ---- */
    ok(byId('ex5').items.every((i) => acc(i).length === 1 && acc(i)[0] === 'тем'),
        'ex5 answers тем throughout');
    ok(byId('ex5').items.every((i) => /^Чем /.test(i.q)),
        'every ex5 prompt opens with Чем, so тем is the only completion');

    /* ---- ex6: comparative vs plain adjective, the source pairs ---- */
    eq('ex6 source key', first('ex6').join(','),
        'дороже,больше,интереснее,удобнее,теплее,лучше,моложе,короче,быстрее,хуже');
    eq('ex6 keeps the source’s own option pairs',
        byId('ex6').items.map((i) => i.options.join('/')).join(' | '),
        ['дороже/дорогой', 'больше/большой', 'интереснее/интересный', 'удобнее/удобная',
         'теплее/тёплый', 'лучше/хороший', 'моложе/молодая', 'короче/короткий',
         'быстрее/быстрая', 'хуже/плохой'].join(' | '));

    /* ---- ex7: sentence production from three cues ---- */
    eq('ex7 keeps the source cues', byId('ex7').items.map((i) => i.q).join(' | '),
        ['чай / кофе / полезный', 'поезд / автобус / удобный',
         'квартира / гостиница / дешёвый', 'метро / автобус / быстрый',
         'лето / зима / тёплый', 'море / озеро / большой',
         'новый телефон / старый телефон / современный', 'ресторан / кафе / хороший',
         'машина / велосипед / быстрый', 'утро / вечер / спокойный'].join(' | '));
    eq('ex7 canonical sentences', first('ex7').join(' | '),
        ['Я выбираю чай, потому что он полезнее, чем кофе.',
         'Я выбираю поезд, потому что он удобнее, чем автобус.',
         'Я выбираю квартиру, потому что она дешевле, чем гостиница.',
         'Я выбираю метро, потому что оно быстрее, чем автобус.',
         'Я выбираю лето, потому что оно теплее, чем зима.',
         'Я выбираю море, потому что оно больше, чем озеро.',
         'Я выбираю новый телефон, потому что он современнее, чем старый телефон.',
         'Я выбираю ресторан, потому что он лучше, чем кафе.',
         'Я выбираю машину, потому что она быстрее, чем велосипед.',
         'Я выбираю утро, потому что оно спокойнее, чем вечер.'].join(' | '));
    /* SOURCE FIX E — the sample for #7 stopped halfway in the material. */
    ok(/чем старый телефон/.test(first('ex7')[6]),
        'ex7 #7 completes the comparison the source left off');
    ok(byId('ex7').items.every((i) => / чем /.test(first('ex7')[byId('ex7').items.indexOf(i)])),
        'every ex7 sentence carries the чем-clause the model asks for');
    ok(byId('ex7').items.every((i) => /потому что (он|она|оно) /.test(
        Array.isArray(i.answer) ? i.answer[0] : i.answer)),
        'every ex7 sentence uses the pronoun that matches its noun’s gender');

    /* =================== EX8 — GENUINELY OPEN =================== */
    eq('ex8 has ten questions', byId('ex8').items.length, 10);
    ok(byId('ex8').items.every((i) => i.free === true),
        'every ex8 item is open — there is no right side to a matter of taste');
    ok(byId('ex8').items.every((i) => acc(i).length === 0),
        'and none of them smuggles in a hidden key');
    eq('ex8 keeps the source questions', byId('ex8').items.map((i) => i.q).join(' | '),
        ['Что лучше: чай или кофе?', 'Что лучше: поезд или автобус?',
         'Что лучше: море или горы?', 'Что лучше: жить в городе или за городом?',
         'Что лучше: учиться утром или вечером?',
         'Что лучше: покупать одежду онлайн или в магазине?',
         'Что лучше: смотреть фильм дома или в кинотеатре?',
         'Что лучше: путешествовать одному или с друзьями?',
         'Что лучше: новая машина или путешествие?',
         'Что лучше: читать книгу или смотреть фильм?'].join(' | '));
    ok(/Namuna/.test(byId('ex8').intro) && /чай лучше, чем кофе/.test(byId('ex8').intro),
        'the source line is offered as a sample, in the intro');
    ok(/istalgan tomonni/.test(byId('ex8').intro),
        'and the learner is told either side is acceptable');
    ok(/kamida uch so.z/.test(byId('ex8').howTo),
        'the how-to states the platform’s three-word minimum for open answers');

    /* ---- ex9: the source translations ---- */
    eq('ex9 keeps the source Uzbek prompts', byId('ex9').items.map((i) => i.q).join(' | '),
        ['Bu telefon unisidan qimmatroq.', 'Mening uyim sening uyingdan kattaroq.',
         'Bugun kechagidan issiqroq.', 'Bu eng chiroyli joy.',
         'Men poyezdni tanlayman, chunki u qulayroq.',
         'Menga choy qahvadan ko‘ra ko‘proq yoqadi.',
         'Qancha ko‘p o‘qisang, shuncha ko‘p bilasan.',
         'Bu variant birinchisidan yaxshiroq.',
         'Qaysi biri yaxshiroq: mashina yoki avtobus?',
         'Men bu restoranni tanlayman, chunki u arzonroq.'].join(' | '));
    eq('ex9 canonical translations lead', first('ex9').join(' | '),
        ['Этот телефон дороже, чем тот.', 'Мой дом больше, чем твой дом.',
         'Сегодня теплее, чем вчера.', 'Это самое красивое место.',
         'Я выбираю поезд, потому что он удобнее.', 'Мне больше нравится чай, чем кофе.',
         'Чем больше читаешь, тем больше знаешь.', 'Этот вариант лучше, чем первый.',
         'Что лучше: машина или автобус?',
         'Я выбираю этот ресторан, потому что он дешевле.'].join(' | '));
    ok(all('ex9', 2).includes('Мой дом больше, чем твой.'),
        'ex9 #2 also accepts the natural short form «чем твой»');
    eq('ex9 #2 is the only translation opened up', 
        byId('ex9').items.filter((i) => i.answer.length > 1).length, 1);
    ok(/теплее/.test(first('ex9')[2]) && !/тёплее|более тёплый/.test(JSON.stringify(all('ex9', 3))),
        'ex9 #3 stays on теплее, the form the lesson teaches');

    /* ---- ex10: error correction ---- */
    eq('ex10 keeps the source’s wrong sentences', byId('ex10').items.map((i) => i.q).join(' | '),
        ['Москва больше как Ташкент.', 'Этот телефон более дешевле.',
         'Это самый красивая улица.', 'Сегодня более теплее, чем вчера.',
         'Этот фильм интересный, чем тот.',
         'Я выбираю этот вариант, потому что он более лучше.',
         'Это самый большое здание.', 'Мне больше нравится кофе как чай.',
         'Чем больше читаешь, чем больше знаешь.',
         'Эта машина быстрее как автобус.'].join(' | '));
    eq('ex10 source corrections lead', first('ex10').join(' | '),
        ['Москва больше, чем Ташкент.', 'Этот телефон дешевле.',
         'Это самая красивая улица.', 'Сегодня теплее, чем вчера.',
         'Этот фильм интереснее, чем тот.',
         'Я выбираю этот вариант, потому что он лучше.',
         'Это самое большое здание.', 'Мне больше нравится кофе, чем чай.',
         'Чем больше читаешь, тем больше знаешь.',
         'Эта машина быстрее, чем автобус.'].join(' | '));
    /* «более дешевле» has two correct minimal repairs. Both are accepted. */
    ok(all('ex10', 2).some((a) => norm(a) === norm('Этот телефон дешевле')),
        'ex10 #2 accepts «Этот телефон дешевле»');
    ok(all('ex10', 2).some((a) => norm(a) === norm('Этот телефон более дешёвый')),
        'ex10 #2 also accepts «Этот телефон более дешёвый»');
    eq('ex10 #2 offers exactly those two repairs', all('ex10', 2).length, 2);
    ok(byId('ex10').items.every((i) => acc(i).every((a) => !/ как /.test(a))),
        'no ex10 key still contains the «как» the exercise is about');

    /* ---- comprehension ---- */
    eq('the comprehension keys carry the source semantics',
        byId('truefalse').items.map((i) => i.answer).join(','),
        'Правда,Ложь,Правда,Ложь,Правда,Правда,Ложь,Правда,Правда,Ложь');
    ok(byId('truefalse').items.every((i) => i.options.join('|') === 'Правда|Ложь'),
        'the comprehension check offers Правда / Ложь');
    /* The source wrote the positive label as «Рост» / «Rost»; only the LABEL
       was normalised to the project's standard, never the true/false meaning. */
    ok(!/Рост|Rost|Yolg/.test(JSON.stringify(byId('truefalse'))),
        'the source labels «Рост / Rost / Yolg‘on» do not reach the learner');
    eq('the ten statements are the source statements, verbatim',
        byId('truefalse').items.map((i) => i.q).join(' | '),
        ['Малика решила купить новый телефон.',
         'Старый телефон Малики работал очень хорошо.',
         'В магазине Малика увидела две модели телефона.',
         'Первый телефон был дешевле второго.',
         'У второго телефона была более качественная камера.',
         'Продавец сказал, что оба телефона хорошие.',
         'Для Малики большой экран был важнее хорошей камеры.',
         'Малика выбрала второй телефон.',
         'Новый телефон был дешевле и удобнее старого.',
         'Малика поняла, что самый дорогой вариант всегда самый лучший.'].join(' | '));
}

/* ------------------------------------------------------- 5. vocabulary */
{
    const VSRC = mainScript(fs.readFileSync(path.join(ROOT, 'paid-courses/a2-vocabulary.html'), 'utf8'));
    const all = literal(VSRC, 'vocabularyData').topics;
    const v = all.find((t) => t.id === 14);
    ok(!!v, 'vocabulary topic 14 exists');
    eq('60 cards, exactly the source count', v.words.length, 60);
    eq('no exact duplicate card',
        new Set(v.words.map((w) => w.ru.toLowerCase() + '||' + w.uz.toLowerCase())).size, 60);
    eq('no repeated russian side either',
        new Set(v.words.map((w) => w.ru.toLowerCase())).size, 60);
    ok(v.words.every((w) => w.ru && w.ru.trim() && w.uz && w.uz.trim()),
        'no card has an empty side');
    eq('the deck opens on «сравнивать»', v.words[0].ru + ' — ' + v.words[0].uz,
        'сравнивать — taqqoslamoq');
    eq('and closes on «потому что»', v.words[59].ru + ' — ' + v.words[59].uz,
        'потому что — chunki');
    /* the source order, spot-checked at every boundary the material sets */
    const idx = (ru) => v.words.findIndex((w) => w.ru === ru);
    [['сравнивать', 'вариант'], ['вариант', 'лучше'], ['лучше', 'ближе'],
     ['ближе', 'самый'], ['самый', 'менее'], ['менее', 'качество'],
     ['качество', 'потому что']]
        .forEach(([a, b]) => ok(idx(a) >= 0 && idx(b) > idx(a),
            `«${a}» comes before «${b}» — the source order is kept`));
    [['решение', 'qaror'], ['медленнее', 'sekinroq'], ['старше', 'yoshi kattaroq'],
     ['самое', 'eng (o‘rta jins)'], ['отличаться', 'farq qilmoq'],
     ['предпочитать', 'afzal ko‘rmoq'],
     ['характеристика', 'xususiyat / texnik ko‘rsatkich'],
     ['преимущество', 'afzallik'], ['недостаток', 'kamchilik']]
        .forEach(([ru, uz]) => ok(v.words.some((w) => w.ru === ru && w.uz === uz),
            `the card "${ru}" is present with its source translation`));
    ok(/\b14:\s*60\b/.test(SRC), 'the course card advertises 60 words for topic 14');
    eq('topics 1-13 vocabulary unchanged',
        [1,2,3,4,5,6,7,8,9,10,11,12,13].map((id) => all.find((t) => t.id === id).words.length).join(','),
        '45,77,73,106,50,69,85,85,50,69,70,55,80');
    /* no placeholder decks remain — every A2 topic ships vocabulary now */
}

/* ------------------------------- 6. it renders, grades and completes */
{
    const blocks = [...SRC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const pre = blocks.find((b) => /(let|var|const)\s+currentUser/.test(b) && !b.includes('const courseData'));
    const main = blocks.find((b) => b.includes('const courseData'));
    /* A meaningful open answer — the learner picks a side and justifies it.
       Deliberately NOT the sample sentence, and deliberately the other side of
       the question from the one the source sample chose. */
    const OPEN = [
        'По-моему, кофе лучше, потому что он бодрит утром.',
        'Я думаю, что автобус лучше, потому что он дешевле.',
        'Мне больше нравятся горы, потому что там тихо.',
        'По-моему, лучше жить за городом, потому что там чистый воздух.',
        'Я думаю, что лучше учиться вечером, потому что днём я работаю.',
        'По-моему, лучше покупать одежду в магазине, потому что можно померить.',
        'Я думаю, что в кинотеатре лучше, потому что там большой экран.',
        'Мне больше нравится путешествовать с друзьями, потому что это веселее.',
        'По-моему, путешествие лучше, потому что остаются воспоминания.',
        'Я думаю, что книга интереснее, потому что там больше деталей.'
    ];
    const answerFor = (g, it, i) => (g.id === 'ex8' ? OPEN[i]
        : (Array.isArray(it.answer) ? it.answer[0] : it.answer));

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
    const DONE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    const w = boot();

    w.__api.setCompleted(DONE.slice());
    w.eval('currentTopicId=14;');
    w.__api.loadLesson(14);
    const D = w.document;

    ok(!!w.__api.exData(t14), 'the generic engine claims topic 14');
    eq('twelve steps exist in the hidden bridge', D.querySelectorAll('[data-t1-ex]').length, 12);
    /* ex1, ex2, ex5, ex7, ex8, ex9 and ex10 are the text-input drills. */
    eq('seventy text inputs render across the seven input steps',
        D.querySelectorAll('[data-t1-input]').length, 70);
    const lesson = (D.getElementById('lessonContent') || D.body).textContent;
    ok(/Чем больше читаешь, тем больше знаешь/.test(lesson), 'the grammar reaches the screen');
    ok(/Audio va tushunish savollari/.test(lesson), 'the lesson announces the listening step');

    let missing = 0;
    t14.topic14Exercises.exercises.forEach((g) => {
        (g.items || []).forEach((it, i) => {
            const key = g.id + '-' + i;
            if (g.type === 'choice') {
                const row = D.querySelector(`[data-t1-row="${key}"]`);
                const want = Array.isArray(it.answer) ? it.answer[0] : it.answer;
                const btn = row && [...row.querySelectorAll('.t1-opt')]
                    .find((b) => b.getAttribute('data-value') === want);
                if (btn) btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
                else missing++;
            } else {
                const inp = D.querySelector(`[data-t1-input="${key}"]`);
                if (inp) inp.value = answerFor(g, it, i); else missing++;
            }
        });
    });
    eq('every question is answerable in the DOM', missing, 0);

    return (async () => {
        await w.__api.check(14);
        const marked = D.querySelectorAll('.t1-opt.t1-ok').length
            + D.querySelectorAll('[data-t1-input].correct').length;
        const scoreText = (D.getElementById('scoreDisplay') || {}).textContent || '';
        ok(/\b110\s*\/\s*110\b/.test(scoreText),
            `a perfect paper is graded 110/110 (${scoreText.trim()})`);
        ok(marked >= 20, `the graded widgets mark themselves correct (${marked})`);

        /* Completion must go through the server, and unlock topic 15. */
        await w.__api.complete(14);
        await new Promise((r) => setTimeout(r, 150));
        eq('exactly one completion claim', w.__claims.length, 1);
        eq('the claim names course A2', w.__claims[0].c, 'A2');
        eq('and it claims the EXERCISES half, not the whole topic',
            w.__claims[0].cm, 'exercises');
        eq('the claim names topic 14', w.__claims[0].t, 14);
        ok(w.__api.getCompleted().includes(14), 'the server answer is adopted');
        ok(w.__safe.every((p) => !('completedTopics' in p)),
            'no completion field went through the generic saver');
        ok(!/saveUserProgress\([^)]*completedTopics/.test(SRC),
            'topic 14 introduced no direct authoritative write');

        /* A REFUSED server save must not unlock anything. */
        {
            const wf = boot();
            wf.eval('window.completeCourseComponent=async function(){throw new Error("offline");};' +
                    'window.completeCourseTopic=async function(){throw new Error("offline");};');
            wf.__api.setCompleted(DONE.slice());
            wf.eval('currentTopicId=14;');
            wf.__api.loadLesson(14);
            try { await wf.__api.complete(14); } catch (e) { /* surfaced to the learner */ }
            await new Promise((r) => setTimeout(r, 120));
            ok(!wf.__api.getCompleted().includes(14),
                'a failed server save leaves topic 14 incomplete');
            ok(!wf.__api.getCompleted().includes(15), 'and topic 15 does not fake-unlock');
        }

        /* ---------- 7. THE STEPPING SESSION, not a long page ---------- */
        const w2 = boot();
        const D2 = w2.document;
        w2.__api.setCompleted(DONE.slice());
        w2.eval('currentTopicId=14;');
        w2.__api.loadLesson(14);
        w2.__api.render(14);
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
        ok(/1-mashq\. Qiyosiy darajani hosil qiling/.test(host().textContent),
            'step 1 is exercise 1');
        ok(!/Эта задача легче/.test(host().textContent), 'exercise 2 is NOT also on screen');
        ok(!host().querySelector('audio'), 'the audio player is NOT on screen yet');
        ok(/Javoblarni tekshirish/.test([...D2.querySelectorAll('.uz-foot button, .uz-btn')]
            .map((b) => b.textContent).join(' | ')), 'the check button is in Uzbek');

        const groups = t14.topic14Exercises.exercises;
        const seen = [];
        let multiOnScreen = 0;
        for (let i = 0; i < groups.length; i++) {
            seen.push(stepText().trim());
            if (titlesOnScreen() > 1) multiOnScreen++;
            const g = groups[i];
            (g.items || []).forEach((it, k) => {
                /* ANSWER EACH STEP, PROPERLY. These fills looked only for the
                   topic-1 markup, so on a topic rendered by the shared
                   course-exercise-ui (data-b2h-*) nothing was answered: every
                   step scored zero and the walkthrough advanced anyway, because
                   A2 had no pass gate. A2 now enforces the platform 80% rule.
                   `answerFor` stays the source of truth for the value — this
                   only widens WHERE it is written. */
                const key = g.id + '-' + k;
                const want = answerFor(g, it, k);
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
                try {
                    const UI = w2.UzExerciseUI;
                    if (UI && typeof UI.writeAnswer === 'function') {
                        UI.writeAnswer(host(), key, want, g, it);
                    }
                } catch (e) { /* a type that cannot be written is left to the clicks */ }
            });
            if (g.id === 'ex8') {
                ok(/Что лучше: чай или кофе\?/.test(host().textContent),
                    'the open step shows its questions');
                ok(/Namuna/.test(host().textContent), 'and offers the sample');
            }
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
                ok(/audios\/А2 14 урок\.mp3$/.test(played),
                    `the player points at the A2 lesson 14 recording (${played})`);
                ok(!/Б2/.test(played), 'and not at a Б2 recording');
                ok(!/Малика решила купить новый телефон/.test(host().textContent),
                    'the comprehension statements are NOT on the audio step');
                ok(!foot.some((t) => /tekshirish/i.test(t)),
                    'the audio step offers no check button');
                ok(!foot.some((t) => /qayta ishlash/i.test(t)), 'and no retry');
                eq('the audio step offers exactly one action', foot.length, 1);
                ok(/Savollarga/.test(foot[0] || ''), 'that action moves on to the questions');
            }
            if (g.id === 'truefalse') {
                ok(/Малика решила купить новый телефон/.test(host().textContent),
                    'the comprehension questions are on their own step');
                ok(!host().querySelector('audio'),
                    'the player is not repeated on the questions step');
                eq('the comprehension step is a single step', titlesOnScreen(), 1);
                ok(!/Рост/.test(host().textContent),
                    'and the source label «Рост» is nowhere on screen');
            }
            const check = [...D2.querySelectorAll('.uz-foot button, .uz-btn')]
                .find((b) => /tekshirish/i.test(b.textContent));
            if (check) check.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
            const next = [...D2.querySelectorAll('.uz-foot button, .uz-btn')]
                .find((b) => /keyingi mashq|yakunlash|savollarga/i.test(b.textContent));
            if (!next) break;
            next.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
        }
        eq('never more than one exercise on screen', multiOnScreen, 0);
        eq('every one of the twelve steps was reached', seen.length, 12);
        eq('the cursor numbers the drills and names the rest', seen.join(' | '),
            [...Array.from({ length: 10 }, (_, i) => `Mashq ${i + 1} / 10`),
             'Audio', 'Audio bo‘yicha savollar'].join(' | '));

        /* ---------- 8. no second engine was written for topic 14 ---------- */
        ok(!/topic14(Active|Step|Custom|Navigation|Renderer|State|Wizard|Checker|Modal|Storage)/i.test(SRC),
            'topic 14 introduced no bespoke step/state/renderer machinery');
        ok(/window\.A2Host\.mountPractice/.test(SRC),
            'topic 14 goes through the shared A2 practice mount');
        eq('exactly one practice mount in the page',
            (SRC.match(/A2Host\.mountPractice\(/g) || []).length, 1);
        {
            const a = SRC.indexOf('topic14Exercises:');
            const b = SRC.indexOf('id: 15,', a);
            ok(!/function\s*\(|=>/.test(SRC.slice(a, b)), 'the topic 14 payload is data, not logic');
        }

        console.log('='.repeat(60));
        if (fail) {
            console.log(`  ❌ A2 TOPIC 14: ${fail} failed / ${pass + fail}\n`);
            failures.slice(0, 20).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
            console.log('='.repeat(60) + '\n');
            process.exit(1);
        }
        console.log(`  ✅ A2 TOPIC 14: ${pass}/${pass} passed`);
        console.log('='.repeat(60) + '\n');
    })();
}
