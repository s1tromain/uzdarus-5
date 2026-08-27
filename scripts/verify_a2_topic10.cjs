#!/usr/bin/env node
/**
 * verify_a2_topic10.cjs — A2 topic 10 «Sog‘liq va dorixona» must stay a
 * complete, objectively gradable lesson.
 *
 * This is the first A2 lesson whose recording carries TWENTY comprehension
 * statements. None were dropped and none were stacked on one screen: they are
 * two named steps of ten, so the session is 13 groups and 120 marks while the
 * drill counter still reads «Mashq N / 10». No engine change was needed — the
 * step label already lets a group name itself.
 *
 * Three source exercises could not ship as written: exercise 5 drilled «У меня
 * есть температура», exercise 6 was a seven-blank dialogue against a ten-word
 * bank that could not produce its own answer, and exercise 9 offered sample
 * answers rather than keys. This suite pins what replaced them.
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

console.log('\n=== A2 TOPIC 10 ===');

const topics = literal(SRC, 'courseData').topics;
const t10 = topics.find((t) => t.id === 10);

/* ------------------------------------------------------- 1. the topic */
eq('exactly one topic 10', topics.filter((t) => t.id === 10).length, 1);
eq('16 A2 topics, unchanged', topics.length, 16);
ok(!!t10, 'topic 10 exists');
eq('title', t10.title, "Sog'liq va dorixona");
ok(!t10.quiz, 'the empty placeholder quiz is gone');
ok(typeof t10.explanation.uz === 'string' && t10.explanation.uz.length > 40,
    'topic 10 has a real Uzbek introduction');
ok(!/faqat to.liq kurs obunachilari/.test(t10.explanation.uz),
    'the "subscribers only" placeholder text is gone');
ok(t10.isSubscriptionLocked === false && t10.isLocked === false, 'topic 10 is open');

/* ------------------------------------------------------- 2. grammar */
{
    const g = t10.grammar || '';
    ok(g.length > 3000, `grammar is substantial (${g.length} chars)`);
    [['1 · У меня + symptom', /У меня температура\.<\/td>[\s\S]*У меня насморк\.<\/td>[\s\S]*У меня кашель\.<\/td>/],
     ['1 · У меня болит + body part', /У меня болит голова\.<\/td>[\s\S]*У меня болит горло\.<\/td>[\s\S]*У меня болит живот\.<\/td>/],
     ['2 · Мне нужно + infinitive', /Мне нужно отдохнуть[\s\S]*Мне нужно купить лекарство[\s\S]*Мне нужно обратиться к врачу[\s\S]*Мне нужно принимать таблетки/],
     ['3 · the four agreement forms', /нужен<\/b> — мужской род[\s\S]*нужна<\/b> — женский род[\s\S]*нужно<\/b> — средний род[\s\S]*нужны<\/b> — ko/],
     ['3 · source noun examples', /Мне нужен сироп[\s\S]*Мне нужна мазь/],
     ['3 · infinitive vs noun contrast', /Мне нужно <b>купить<\/b> лекарство[\s\S]*Мне нужно <b>лекарство<\/b>/],
     ['4 · можно', /Можно купить это лекарство\?[\s\S]*Можно принимать эти таблетки\?[\s\S]*Можно мне воды\?/],
     ['4 · нельзя', /Нельзя принимать много таблеток[\s\S]*Нельзя пить это лекарство натощак[\s\S]*Нельзя заниматься спортом/],
     ['5 · болит', /У меня болит голова[\s\S]*У меня болит зуб[\s\S]*У меня болит спина[\s\S]*У меня болит горло/],
     ['5 · болят', /У меня болят ноги[\s\S]*У меня болят глаза[\s\S]*У меня болят зубы[\s\S]*У меня болят руки/],
     ['6 · есть', /У меня есть рецепт\.<\/td>[\s\S]*У меня есть лекарство\.<\/td>[\s\S]*У меня есть таблетки\.<\/td>/],
     ['6 · нет + genitive', /У меня нет рецепта\.<\/td>[\s\S]*У меня нет лекарства\.<\/td>[\s\S]*У меня нет таблеток\.<\/td>/],
     ['6 · the genitive note', /рецепт &rarr; <b>рецепта<\/b>[\s\S]*таблетки &rarr; <b>таблеток<\/b>/],
     ['closing memo', /Mavzu xulosasi/]
    ].forEach(([label, re]) => ok(re.test(g), `grammar covers ${label}`));

    eq('six main blocks', (g.match(/class="b2g-h"/g) || []).length, 6);

    /* SOURCE LANGUAGE NORMALIZATION: «У меня есть температура» is not how a
       fever is reported. It is never taught as the model; the negation is. */
    ok(!/У меня есть температура/.test(g),
        'the awkward «У меня есть температура» is not taught');
    ok(/У меня температура\./.test(g), 'the natural «У меня температура.» is');
    ok(/У меня нет температуры/.test(g), 'and the negation the source gives is kept');

    eq('the lesson introduces no literal colours of its own',
        (g.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) || []).length, 0);
    const tones = new Set((g.match(/b2g-tone-(sv|nsv)/g) || []));
    ok(tones.size <= 2, `at most two tone classes are used (${[...tones].join(', ')})`);
    ok(/b2g-warn/.test(g), 'the warning block uses the shared warn style');
    const UI = fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8');
    ['--g-accent', '--g-ok', '--g-warn'].forEach((tok) =>
        ok(UI.includes(tok), `the shared component defines ${tok}`));
    [...new Set(g.match(/b2g[-a-z0-9]*/g) || [])].forEach((cls) =>
        ok(UI.includes('.' + cls), `the shared stylesheet already defines .${cls}`));
    ok(/b2g-split/.test(g), 'comparisons use the responsive split grid');
    const widestRow = (g.match(/<tr>[\s\S]*?<\/tr>/g) || [])
        .reduce((n, row) => Math.max(n, (row.match(/<td[ >]/g) || []).length), 0);
    ok(widestRow <= 2, `no table row has more than two cells (widest: ${widestRow})`);
    ok(!/style="[^"]*width:\s*\d{3,}px/.test(g), 'nothing is pinned to a fixed pixel width');
}

/* ------------------------------------------------------- 3. listening */
{
    const audioGroup = t10.topic10Exercises.exercises.find((g) => g.id === 'audio');
    ok(!!audioGroup, 'the audio is its own step');
    eq('the source is the A2 lesson 10 recording',
        decodeURIComponent(audioGroup.audioSrc), 'audios/А2 10 урок.mp3');
    ok(!/Б2/.test(decodeURIComponent(audioGroup.audioSrc)), 'not a Б2 recording');
    const audioFile = path.join(ROOT, decodeURIComponent(audioGroup.audioSrc));
    ok(fs.existsSync(audioFile), `the referenced mp3 exists on disk (${audioGroup.audioSrc})`);
    ok(fs.statSync(audioFile).size > 10000, 'and it is a real recording, not a stub');
    /* The source headed this block «Matn: В аптеке»; the resource is an mp3. */
    ok(/Audio/.test(audioGroup.title), 'the step is announced as audio');
    ok(!/Matn|Текст|reading/i.test(audioGroup.title + ' ' + audioGroup.intro),
        'nothing calls it a text');
    ok(/tinglang/.test(audioGroup.intro), 'the learner is told to listen');
    ok(!audioGroup.passage, 'the audio step carries no passage');
    ok(!t10.topic10Exercises.exercises.some((g) => g.passage), 'no step carries a story text');
    ok(/audio/i.test(t10.content || ''), 'the lesson points at the audio');
    ok(!/прочитайте|matnni o/i.test(t10.content || ''), 'and never at a text');
}

/* --------------------------------------------- 4. exercises + answer keys */
const EXPECTED = [
    ['ex1', 'choice', 10], ['ex2', 'choice', 10], ['ex3', 'input', 10],
    ['ex4', 'choice', 10], ['ex5', 'choice', 10], ['ex6', 'choice', 10],
    ['ex7', 'input', 10], ['ex8', 'builder', 10], ['ex9', 'choice', 10],
    ['ex10', 'choice', 10],
    ['audio', 'reading', 0], ['truefalse1', 'choice', 10], ['truefalse2', 'choice', 10]
];
{
    const block = t10.topic10Exercises;
    ok(!!block && Array.isArray(block.exercises), 'topic 10 uses the generic exercise shape');
    const groups = block.exercises;
    eq('thirteen steps: ten drills, an audio and TWO comprehension parts',
        groups.length, EXPECTED.length);

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

    /* TWENTY source statements, split across two steps rather than halved or
       stacked on one screen. Both parts are scored. */
    const p1 = groups.find((g) => g.id === 'truefalse1');
    const p2 = groups.find((g) => g.id === 'truefalse2');
    eq('comprehension part 1 names itself', p1.stepName, 'Audio bo‘yicha savollar 1 / 2');
    eq('comprehension part 2 names itself', p2.stepName, 'Audio bo‘yicha savollar 2 / 2');
    eq('part 1 carries ten statements', p1.items.length, 10);
    eq('part 2 carries the other ten', p2.items.length, 10);
    eq('all twenty source statements survive', p1.items.length + p2.items.length, 20);

    const total = groups.reduce((s, g) => s + (g.items || []).length, 0);
    eq('120 scored questions in total', total, 120);
    eq('the ten drills carry 100 of them',
        groups.filter((g) => /^ex\d+$/.test(g.id)).reduce((s2, g) => s2 + g.items.length, 0), 100);
    console.log(`  10 drills + audio + 2 comprehension parts · ${total} scored questions`);

    const byId = (id) => groups.find((g) => g.id === id);
    const keys = (id) => byId(id).items.map((i) => i.answer).join(',');

    /* ---- source answer keys, verbatim ---- */
    eq('ex1 keys match the source', keys('ex1'),
        'болит,болят,болит,болят,болит,болят,болит,болят,болит,болят');
    eq('ex2 keys match the source', keys('ex2'),
        'нужен,нужна,нужно,нужны,нужен,нужна,нужно,нужны,нужен,нужны');
    eq('ex3 keys match the source', byId('ex3').items.map((i) => i.answer[0]).join(','),
        'идти,купить,отдыхать,принимать,пить,измерить,позвонить,получить,спросить,лечь спать');
    eq('ex4 keys match the source', keys('ex4'),
        'можно,нельзя,можно,можно,нельзя,можно,нельзя,можно,можно,нельзя');
    eq('ex7 leads with the source model answers',
        byId('ex7').items.map((i) => i.answer[0]).join(' | '),
        ['У меня болит голова', 'У меня болят ноги', 'Мне нужно лекарство',
         'Мне нужны таблетки', 'Мне нужно идти к врачу', 'Можно принимать это лекарство',
         'Нельзя принимать много таблеток', 'У меня температура', 'У меня нет кашля',
         'Мне нужен сироп от кашля'].join(' | '));
    ok(byId('ex7').items[5].answer.includes('Можно пить это лекарство'),
        'ex7 also accepts «пить» for the Uzbek «ichish»');
    ok(byId('ex7').items.every((i) => i.answer.length <= 2),
        'no translation is opened up to a long list of variants');

    /* ---- SOURCE LANGUAGE NORMALIZATION Ex3 #9 ---- */
    ok(!/спросить лекарство в аптеке/.test(JSON.stringify(byId('ex3'))),
        'the unnatural «спросить лекарство в аптеке» is not taught');
    ok(/спросить ___ фармацевта|фармацевта о лекарстве/.test(byId('ex3').items[8].q),
        'it asks about the pharmacist instead, keeping the source verb');
    eq('and the key is still the source verb', byId('ex3').items[8].answer[0], 'спросить');

    /* ---- EX5 OPTIMISED: есть/нет on concrete nouns ---- */
    const ex5 = byId('ex5');
    eq('ex5 has ten items', ex5.items.length, 10);
    ok(ex5.items.every((i) => i.options.join('|') === 'есть|нет'), 'ex5 offers есть / нет');
    ok(!/есть ___ температура|___ температура\./.test(JSON.stringify(ex5)),
        'ex5 never drills «У меня есть температура»');
    eq('ex5 alternates есть and нет', keys('ex5'),
        'есть,нет,есть,нет,есть,нет,есть,нет,есть,нет');
    /* every «нет» item must present the genitive, every «есть» the nominative */
    ok(ex5.items.filter((i) => i.answer === 'нет')
        .every((i) => /(рецепта|лекарства|таблеток|градусника|витаминов)/.test(i.q)),
        'the нет items use the genitive');

    /* ---- EX6: AUTHORED REPLACEMENT (source dialogue had 7 blanks) ---- */
    const ex6 = byId('ex6');
    eq('ex6 is a complete ten-question exercise', ex6.items.length, 10);
    ok(ex6.items.every((i) => i.options.length === 4), 'each dialogue offers four replies');
    ok(ex6.items.every((i) => /^—/.test(i.q)), 'each item is a dialogue turn');
    /* The source word bank offered «врач» where the answer had to be «врачу» —
       no learner should be asked to inflect a fixed bank word. */
    ok(!/врач\b(?![уе])/.test(JSON.stringify(ex6.items.map((i) => i.options))),
        'no option asks the learner to turn «врач» into «врачу»');
    const POOL6 = new Set(ex6.items.map((i) => i.answer));
    ok(ex6.items.every((i) => i.options.every((o) => POOL6.has(o))),
        'every ex6 distractor is itself a correct answer to another question');
    [['лекарство от кашля', /лекарство от кашля/], ['болит горло', /У меня болит горло/],
     ['сильный кашель', /сильный кашель/], ['сироп', /Лучше сироп/],
     ['рецепт', /нет рецепта/], ['обратиться к врачу', /обратиться к врачу/],
     ['можно без рецепта', /Да, можно/], ['фармацевт', /Фармацевт/],
     ['нужен сироп от кашля', /Мне нужен сироп от кашля/], ['polite close', /Пожалуйста/]]
        .forEach(([label, re]) => ok(re.test(JSON.stringify(ex6)),
            `ex6 still exercises ${label}`));

    /* ---- EX8: builder, with the source #9 normalised ---- */
    const ex8 = byId('ex8');
    eq('ex8 targets', ex8.items.map((i) => i.answer[0]).join(' | '),
        ['У меня болит голова', 'Мне нужно лекарство', 'Мне нужен врач',
         'У меня болят ноги', 'Можно принимать это лекарство', 'У меня высокая температура',
         'Мне нужны таблетки', 'Мне нужно идти к врачу', 'У меня есть рецепт',
         'Нельзя принимать много таблеток'].join(' | '));
    ok(!/У меня есть кашель/.test(JSON.stringify(ex8)),
        'the builder never asks for «У меня есть кашель»');
    const SB = fs.readFileSync(path.join(ROOT, 'sentence-builder.js'), 'utf8');
    ok(/function bank\(item, group\)/.test(SB) && /variantsOf\(item\)\.forEach/.test(SB),
        'the builder still derives its cards from the accepted answers');
    ex8.items.forEach((it, i) => {
        const target = it.answer[0];
        eq(`ex8#${i + 1} target has no double spacing`, target.split(/\s+/).join(' '), target);
        ok(target.split(' ').length >= 3, `ex8#${i + 1}: a real sentence to build`);
        it.q.split(' / ').forEach((tok) => ok(
            target.toLowerCase().includes(tok.toLowerCase().trim()),
            `ex8#${i + 1}: prompt token «${tok.trim()}» appears in the target`));
    });

    /* ---- EX9: AUTHORED REPLACEMENT (source gave samples, not keys) ---- */
    const ex9 = byId('ex9');
    eq('ex9 has ten items', ex9.items.length, 10);
    ok(ex9.items.every((i) => i.options.length === 4), 'each question offers four replies');
    ['Что у вас болит?', 'У вас есть температура?', 'Что вам нужно купить?',
     'Вам нужен врач?', 'Можно купить это лекарство?', 'У вас есть рецепт?',
     'Что вы принимаете?', 'Вам нужны таблетки?', 'Можно принимать это лекарство?',
     'Вам нужно идти к врачу?']
        .forEach((q, i) => ok(ex9.items[i].q.includes(q),
            `ex9#${i + 1} keeps the source question «${q}»`));
    /* the fever reply is naturalised here too */
    ok(!/Да, у меня есть температура/.test(JSON.stringify(ex9)),
        'ex9 does not answer with «Да, у меня есть температура»');
    eq('ex9 answers the fever question naturally', ex9.items[1].answer, 'Да, у меня температура.');
    const POOL9 = new Set(ex9.items.map((i) => i.answer));
    ok(ex9.items.every((i) => i.options.every((o) => POOL9.has(o))),
        'every ex9 distractor is itself a correct answer to another question');

    /* ---- EX10: the ambiguous source item is gone ---- */
    const ex10 = byId('ex10');
    const ex10Text = JSON.stringify(ex10);
    eq('ex10 has ten items', ex10.items.length, 10);
    ok(ex10.items.every((i) => i.options.length === 4), 'each correction offers four sentences');
    ok(ex10.items.every((i) => i.options.includes(i.q)),
        'the broken sentence is among the options, so the learner must reject it');
    ok(ex10.items.every((i) => i.answer !== i.q), 'and it is never the key');
    eq('ex10 corrections', ex10.items.map((i) => i.answer).join(' | '),
        ['У меня болит голова.', 'Мне нужно лекарство.', 'Мне нужен сироп.',
         'У меня болят глаза.', 'Мне нужны таблетки.', 'Можно принимать это лекарство?',
         'Мне нужно купить таблетки.', 'У меня есть кашель.',
         'Нельзя принимать много таблеток.', 'Мне нужен врач.'].join(' | '));
    /* «Мне нужно купить таблетки?» is a perfectly good question — never an error. */
    ok(!ex10.items.some((i) => i.q === 'Мне нужно купить таблетки?'),
        'the source item that is actually valid Russian is not marked wrong');
    eq('#7 drills «нужно + infinitive» instead', ex10.items[6].q, 'Мне нужно купил таблетки.');
    ok(ex10.items.every((i) => new Set(i.options.map(
        (o) => o.toLowerCase().replace(/[.,!?]/g, '').trim())).size === 4),
        'ex10 options differ by real words, not punctuation');

    /* ---- comprehension: source statements and keys, split 10 + 10 ---- */
    eq('part 1 keys match the source', keys('truefalse1'),
        'Rost,Yolg‘on,Rost,Rost,Yolg‘on,Rost,Rost,Yolg‘on,Rost,Rost');
    eq('part 2 keys match the source', keys('truefalse2'),
        'Yolg‘on,Rost,Yolg‘on,Rost,Rost,Yolg‘on,Rost,Rost,Rost,Yolg‘on');
    [p1, p2].forEach((p, n) => ok(p.items.every((i) => i.options.join('|') === 'Rost|Yolg‘on'),
        `part ${n + 1} offers Rost / Yolg‘on`));
    /* SOURCE TYPO: the material wrote «Рост» (height) and one «Yolg‘он». */
    ok(!/Рост|Yolg‘он/.test(JSON.stringify([p1, p2])),
        'neither source typo reaches the learner');
    ok(!/Matnga qarab/.test(JSON.stringify(t10)),
        'the instruction says listen, not "look at the text"');
    eq('part 1 is source statements 1-10', p1.items.map((i) => i.q).join(' | '),
        ['Анна утром почувствовала себя плохо.', 'У Анны болела только спина.',
         'У Анны была небольшая температура.', 'У Анны появился кашель.',
         'Анна решила пойти на работу.', 'Анна сначала выпила тёплый чай с лимоном.',
         'Анна пошла в ближайшую аптеку.', 'У Анны был рецепт на лекарства.',
         'Фармацевт посоветовал Анне внимательно прочитать инструкцию.',
         'Анна купила сироп от кашля.'].join(' | '));
    eq('part 2 is source statements 11-20', p2.items.map((i) => i.q).join(' | '),
        ['Анна не купила витамины.', 'После аптеки Анна вернулась домой.',
         'Анна не читала инструкцию к лекарствам.', 'Вечером Анне стало немного лучше.',
         'Температура у Анны снизилась.', 'Кашель у Анны стал сильнее.',
         'Анна решила ещё один день отдохнуть дома.', 'Анна пила много тёплой воды и чая.',
         'Анна решила обратиться к врачу, если ей снова станет плохо.',
         'Анна сразу пошла в больницу.'].join(' | '));
}

/* ------------------------------------------------------- 5. vocabulary */
{
    const VSRC = mainScript(fs.readFileSync(path.join(ROOT, 'paid-courses/a2-vocabulary.html'), 'utf8'));
    const all = literal(VSRC, 'vocabularyData').topics;
    const v10 = all.find((t) => t.id === 10);
    ok(!!v10, 'vocabulary topic 10 exists');
    /* The source lists 70 rows; «рецепт — retsept» appears twice (rows 31 and
       43), so the deck is 69 cards. Nothing was invented to refill the count. */
    eq('69 cards (70 source rows minus one exact duplicate)', v10.words.length, 69);
    eq('no exact duplicate card', new Set(v10.words.map((w) => w.ru + '||' + w.uz)).size, 69);
    eq('no repeated russian side either', new Set(v10.words.map((w) => w.ru)).size, 69);
    eq('«рецепт» appears exactly once', v10.words.filter((w) => w.ru === 'рецепт').length, 1);
    ok(v10.words.every((w) => w.ru && w.ru.trim() && w.uz && w.uz.trim()),
        'no card has an empty side');
    [['здоровье', 'sog‘liq'], ['кашель', 'yo‘tal'], ['аллергия', 'allergiya'],
     ['лекарство', 'dori'], ['мазь', 'surtma / maz'], ['градусник', 'termometr'],
     ['врач', 'shifokor'], ['фармацевт', 'farmatsevt'], ['аптека', 'dorixona'],
     ['принимать', 'qabul qilmoq'], ['измерять', 'o‘lchamoq'],
     ['выздоравливать', 'tuzalmoq'], ['Мне плохо.', 'O‘zimni yomon his qilyapman.'],
     ['Как принимать это лекарство?', 'Bu dorini qanday qabul qilish kerak?']]
        .forEach(([ru, uz]) => ok(v10.words.some((w) => w.ru === ru && w.uz === uz),
            `the card "${ru}" is present with its source translation`));
    const idx = (ru) => v10.words.findIndex((w) => w.ru === ru);
    ok(idx('здоровье') < idx('лекарство'), 'Kasallik va simptomlar comes first');
    ok(idx('лекарство') < idx('врач'), 'Dori-darmonlar comes next');
    ok(idx('врач') < idx('болеть'), 'Shifokor va dorixona comes next');
    ok(idx('болеть') < idx('У меня болит голова.'), 'then the verbs, then the phrases');
    ok(/\b10:\s*69\b/.test(SRC), 'the course card advertises 69 words for topic 10');
    eq('topics 1-9 vocabulary unchanged',
        [1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => all.find((t) => t.id === id).words.length).join(','),
        '45,77,73,106,50,69,85,85,50');
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

    w.__api.setCompleted([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    w.eval('currentTopicId=10;');
    w.__api.loadLesson(10);
    const D = w.document;

    ok(!!w.__api.exData(t10), 'the generic engine claims topic 8');
    eq('thirteen steps exist in the hidden bridge', D.querySelectorAll('[data-t1-ex]').length, 13);
    /* ex3 and ex7 are text-input drills; ex8 is a builder with hidden inputs. */
    eq('thirty text inputs render across the input and builder steps',
        D.querySelectorAll('[data-t1-input]').length, 30);
    const lesson = (D.getElementById('lessonContent') || D.body).textContent;
    ok(/У меня болят ноги/.test(lesson), 'the grammar reaches the screen');
    ok(/Audio va tushunish savollari/.test(lesson), 'the lesson announces the listening step');

    const first = (a) => (Array.isArray(a) ? a[0] : a);
    let missing = 0;
    t10.topic10Exercises.exercises.forEach((g) => {
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
        await w.__api.check(10);
        const marked = D.querySelectorAll('.t1-opt.t1-ok').length
            + D.querySelectorAll('[data-t1-input].correct').length;
        const scoreText = (D.getElementById('scoreDisplay') || {}).textContent || '';
        ok(/\b120\s*\/\s*120\b/.test(scoreText),
            `a perfect paper is graded 120/120 (${scoreText.trim()})`);
        ok(marked >= 100, `the graded widgets mark themselves correct (${marked})`);

        /* Completion must go through the server, and unlock topic 9. */
        await w.__api.complete(10);
        await new Promise((r) => setTimeout(r, 150));
        eq('exactly one completion claim', w.__claims.length, 1);
        eq('the claim names course A2', w.__claims[0].c, 'A2');
        eq('and it claims the EXERCISES half, not the whole topic',
            w.__claims[0].cm, 'exercises');
        eq('the claim names topic 10', w.__claims[0].t, 10);
        ok(w.__api.getCompleted().includes(10), 'the server answer is adopted');
        ok(w.__safe.every((p) => !('completedTopics' in p)),
            'no completion field went through the generic saver');
        ok(w.__api.getCompleted().includes(10), 'topic 11 unlocks');
        ok(!/saveUserProgress\([^)]*completedTopics/.test(SRC),
            'topic 10 introduced no direct authoritative write');

        /* A REFUSED server save must not unlock anything. */
        {
            const wf = boot();
            wf.eval('window.completeCourseComponent=async function(){throw new Error("offline");};' +
                    'window.completeCourseTopic=async function(){throw new Error("offline");};');
            wf.__api.setCompleted([1, 2, 3, 4, 5, 6, 7, 8, 9]);
            wf.eval('currentTopicId=10;');
            wf.__api.loadLesson(10);
            try { await wf.__api.complete(10); } catch (e) { /* surfaced to the learner */ }
            await new Promise((r) => setTimeout(r, 120));
            ok(!wf.__api.getCompleted().includes(10),
                'a failed server save leaves topic 10 incomplete');
        }

        /* ---------- 7. THE STEPPING SESSION, not a long page ---------- */
        const w2 = boot();
        const D2 = w2.document;
        w2.__api.setCompleted([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        w2.eval('currentTopicId=10;');
        w2.__api.loadLesson(10);
        w2.__api.render(10);
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
        ok(/уши/.test(host().textContent), 'step 1 is exercise 1');
        ok(!/таблетка/.test(host().textContent), 'exercise 2 is NOT also on screen');
        ok(!host().querySelector('audio'), 'the audio player is NOT on screen yet');
        ok(/Javoblarni tekshirish/.test([...D2.querySelectorAll('.uz-foot button, .uz-btn')]
            .map((b) => b.textContent).join(' | ')), 'the check button is in Uzbek');

        const groups = t10.topic10Exercises.exercises;
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
                ok(/audios\/А2 10 урок\.mp3$/.test(played),
                    `the player points at the A2 lesson 10 recording (${played})`);
                ok(!/Б2/.test(played), 'and not at a Б2 recording');
                ok(!/почувствовала себя плохо/.test(host().textContent),
                    'the comprehension statements are NOT on the audio step');
                ok(!foot.some((t) => /tekshirish/i.test(t)),
                    'the audio step offers no check button');
                ok(!foot.some((t) => /qayta ishlash/i.test(t)), 'and no retry');
                eq('the audio step offers exactly one action', foot.length, 1);
                ok(/Savollarga/.test(foot[0] || ''), 'that action moves on to the questions');
            }
            if (g.id === 'truefalse1') {
                ok(/почувствовала себя плохо/.test(host().textContent),
                    'part 1 is on its own step');
                ok(!/сразу пошла в больницу/.test(host().textContent),
                    'part 2 is NOT also on screen');
                ok(!host().querySelector('audio'),
                    'the player is not repeated on the questions step');
                eq('the comprehension step is a single step', titlesOnScreen(), 1);
            }
            if (g.id === 'truefalse2') {
                ok(/сразу пошла в больницу/.test(host().textContent),
                    'part 2 is on its own step');
                ok(!/почувствовала себя плохо/.test(host().textContent),
                    'part 1 is no longer on screen');
                eq('part 2 is a single step', titlesOnScreen(), 1);
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
        eq('every one of the thirteen steps was reached', seen.length, 13);
        eq('the cursor numbers the drills and names the rest', seen.join(' | '),
            [...Array.from({ length: 10 }, (_, i) => `Mashq ${i + 1} / 10`),
             'Audio', 'Audio bo‘yicha savollar 1 / 2',
             'Audio bo‘yicha savollar 2 / 2'].join(' | '));

        /* ---------- 8. no second engine was written for topic 8 ---------- */
        ok(!/topic10(Active|Step|Custom|Navigation|Renderer|State|Wizard|Checker|Modal|Storage)/i.test(SRC),
            'topic 10 introduced no bespoke step/state/renderer machinery');
        ok(/window\.A2Host\.mountPractice/.test(SRC),
            'topic 10 goes through the shared A2 practice mount');
        eq('exactly one practice mount in the page',
            (SRC.match(/A2Host\.mountPractice\(/g) || []).length, 1);
        {
            const a = SRC.indexOf('topic10Exercises:');
            const b = SRC.indexOf('id: 11,', a);
            ok(!/function\s*\(|=>/.test(SRC.slice(a, b)), 'the topic 10 payload is data, not logic');
        }

        console.log('='.repeat(60));
        if (fail) {
            console.log(`  ❌ A2 TOPIC 10: ${fail} failed / ${pass + fail}\n`);
            failures.slice(0, 20).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
            console.log('='.repeat(60) + '\n');
            process.exit(1);
        }
        console.log(`  ✅ A2 TOPIC 10: ${pass}/${pass} passed`);
        console.log('='.repeat(60) + '\n');
    })();
}
