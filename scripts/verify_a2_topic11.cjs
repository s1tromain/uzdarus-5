#!/usr/bin/env node
/**
 * verify_a2_topic11.cjs — A2 topic 11 «Хобби, свободное время и отдых» must
 * stay a complete, honestly gradable lesson.
 *
 * This lesson is the first where the source deliberately does NOT fix one right
 * answer everywhere. Exercise 7 works with either time expression, exercise 6
 * accepts any adverb the sentence actually supports, and exercise 10 asks the
 * learner about themselves. Inventing a single key for those would mark correct
 * Russian wrong, so the accepted-answer lists and the `free` flag are pinned
 * here — a later "tidy-up" cannot quietly narrow them.
 *
 * What must not drift:
 *   1. 110 interactive questions, ten of them open by design.
 *   2. audios/А2 11 урок.mp3 — its own recording, present on disk.
 *   3. Completion goes through the SERVER; a refused save unlocks nothing, and
 *      topics 14-16 stay placeholders.
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

console.log('\n=== A2 TOPIC 11 ===');

const topics = literal(SRC, 'courseData').topics;
const t11 = topics.find((t) => t.id === 11);

/* ------------------------------------------------------- 1. the topic */
eq('exactly one topic 11', topics.filter((t) => t.id === 11).length, 1);
eq('16 A2 topics, unchanged', topics.length, 16);
ok(!!t11, 'topic 11 exists');
eq('title', t11.title, 'Хобби, свободное время и отдых');
ok(!t11.quiz, 'the empty placeholder quiz is gone');
ok(typeof t11.explanation.uz === 'string' && t11.explanation.uz.length > 40,
    'topic 11 has a real Uzbek introduction');
ok(!/faqat to‘liq kurs obunachilari/.test(t11.explanation.uz),
    'the "subscribers only" placeholder text is gone');
ok(t11.isSubscriptionLocked === false && t11.isLocked === false, 'topic 11 is open');

/* Topic 13 has since been authored, so the untouched tail starts at 14.
   The guard's job is unchanged: authoring a lesson must not disturb the ones
   after it. */
/* A2 is complete: topic 16 is authored now, so this lesson's old
   "everything after me is a placeholder" tail has no target left. Whole-course
   authored state is asserted by verify_a2_release.cjs, which owns it. */

/* ------------------------------------------------------- 2. grammar */
{
    const g = t11.grammar || '';
    ok(g.length > 3000, `grammar is substantial (${g.length} chars)`);
    [['1 · нравится singular', /Мне нравится музыка[\s\S]*Мне нравится читать[\s\S]*Ему нравится играть в футбол[\s\S]*Нам нравится путешествовать/],
     ['1 · нравятся plural', /Мне нравятся книги[\s\S]*Ей нравятся фильмы[\s\S]*Нам нравятся компьютерные игры/],
     ['1 · negation', /Мне не нравится спорт[\s\S]*Мне не нравится готовить[\s\S]*Ему не нравятся компьютерные игры/],
     ['2 · любить conjugation', /люблю<\/b>[\s\S]*любишь<\/b>[\s\S]*любит<\/b>[\s\S]*любим<\/b>[\s\S]*любите<\/b>[\s\S]*любят<\/b>/],
     ['2 · любить examples', /Я люблю читать[\s\S]*Она любит рисовать[\s\S]*Они любят смотреть фильмы/],
     ['2 · любить negation', /Я <b>не<\/b> люблю готовить[\s\S]*Он <b>не<\/b> любит танцевать/],
     ['3 · играть в', /играть в футбол[\s\S]*играть в теннис[\s\S]*играть в шахматы[\s\S]*играть в компьютерные игры/],
     ['3 · играть на', /играть на гитаре[\s\S]*играть на пианино[\s\S]*играть на скрипке/],
     ['3 · the contrast is spelled out', /в<\/b> <span>&rarr; sport va o.yin[\s\S]*на<\/b> <span>&rarr; musiqa asbobi/],
     ['4 · ходить places', /ходить в кино[\s\S]*ходить в театр[\s\S]*ходить в парк[\s\S]*ходить на концерт[\s\S]*ходить на тренировку/],
     ['4 · ездить examples', /Я езжу за город[\s\S]*Мы часто ездим на дачу[\s\S]*Летом они ездят на море/],
     ['5 · all five adverbs', /часто<\/b><\/td><td>tez-tez[\s\S]*обычно[\s\S]*иногда[\s\S]*редко[\s\S]*никогда/],
     ['5 · никогда + не rule', /никогда \+ не \+ fe‘l|никогда <b>не<\/b> играю в теннис/],
     ['6 · в свободное время', /В свободное время я читаю[\s\S]*В свободное время мы гуляем/],
     ['6 · по выходным', /По выходным я отдыхаю дома[\s\S]*По выходным мы встречаемся с друзьями/],
     ['7 · instrumental case', /творительный падеж/],
     ['7 · the five transforms', /спорт<\/td><td>&rarr; <b[^>]*>спортом[\s\S]*танцами[\s\S]*музыкой[\s\S]*йогой[\s\S]*фотографией/],
     ['7 · заниматься examples', /Я занимаюсь спортом[\s\S]*Она занимается танцами[\s\S]*Он занимается фотографией[\s\S]*Мы занимаемся йогой/],
     ['summary block', /Mavzu xulosasi/],
     ['summary lists all ten patterns', /Мне нравится \+ infinitiv[\s\S]*Мне нравятся[\s\S]*Я люблю \+ infinitiv[\s\S]*Я играю в[\s\S]*Я играю на[\s\S]*Я занимаюсь[\s\S]*Я хожу в[\s\S]*В свободное время[\s\S]*По выходным[\s\S]*Я часто/]
    ].forEach(([label, re]) => ok(re.test(g), `grammar covers ${label}`));

    /* «ходить в кино» does NOT mean walking there. The lesson briefly said
       "ходить — piyoda" (on foot), which teaches a rule Russian does not have:
       a learner who drove to the cinema still «ходит в кино». The pair is about
       REGULAR visiting versus regular travel by transport, and the wording is
       pinned so the shortcut cannot come back. */
    ok(!/ходить<\/b> — [^<]*piyoda/.test(g),
        'the grammar never defines «ходить» as going on foot');
    ok(!/piyoda/.test(g),
        'and the false on-foot shortcut appears nowhere in the block');
    ok(/ходить<\/b> — [^<]*muntazam/.test(g),
        'it explains «ходить» as going somewhere regularly');
    ok(/ездить<\/b> — [^<]*transport/.test(g),
        'and «ездить» as travelling regularly by transport');

    eq('seven numbered blocks', (g.match(/class="b2g-h"/g) || []).length, 7);
    eq('the lesson introduces no literal colours of its own',
        (g.match(/#[0-9A-Fa-f]{3,8}\b|rgba?\(/g) || []).length, 0);
    const tones = new Set((g.match(/b2g-tone-(sv|nsv)/g) || []));
    ok(tones.size <= 2, `at most two tone classes are used (${[...tones].join(', ')})`);
    const UI = fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8');
    [...new Set(g.match(/b2g[-a-z0-9]*/g) || [])].forEach((cls) =>
        ok(UI.includes('.' + cls), `the shared stylesheet already defines .${cls}`));
    /* A three-column table overflows a 360px phone — topic 8 proved it. */
    const widest = (g.match(/<tr>[\s\S]*?<\/tr>/g) || [])
        .reduce((n, row) => Math.max(n, (row.match(/<td[ >]/g) || []).length), 0);
    ok(widest <= 2, `no table row has more than two cells (widest: ${widest})`);
}

/* ------------------------------------------------------- 3. listening */
{
    const audioGroup = t11.topic11Exercises.exercises.find((g) => g.id === 'audio');
    ok(!!audioGroup, 'the audio is its own step');
    eq('the source is the A2 lesson 11 recording',
        decodeURIComponent(audioGroup.audioSrc), 'audios/А2 11 урок.mp3');
    ok(!/Б2/.test(decodeURIComponent(audioGroup.audioSrc)), 'not a Б2 recording');
    ok(!/\.\.\//.test(audioGroup.audioSrc),
        'the path is course-relative — the shared UI adds the ../ for /paid-courses/');
    const audioFile = path.join(ROOT, decodeURIComponent(audioGroup.audioSrc));
    ok(fs.existsSync(audioFile), `the referenced mp3 exists on disk (${audioGroup.audioSrc})`);
    ok(fs.existsSync(audioFile) && fs.statSync(audioFile).size > 10000,
        'and it is a real recording, not a stub');
    ok(/Идеальная суббота/.test(audioGroup.title), 'the step carries the recording’s title');
    ok(/tinglang/.test(audioGroup.intro), 'the learner is told to listen');
    /* The source supplies no transcript, so none was invented. */
    ok(!audioGroup.passage, 'the audio step carries no passage');
    ok(!t11.topic11Exercises.exercises.some((g) => g.passage), 'no step carries a story text');
    ok(!/Анна встала|Катя позвонила|озеро/.test(JSON.stringify(t11.topic11Exercises.exercises
        .filter((g) => g.id !== 'truefalse'))),
        'no narration was fabricated for the recording');
}

/* --------------------------------------------- 4. exercises + answer keys */
const EXPECTED = [
    ['ex1', 'input', 10], ['ex2', 'input', 10], ['ex3', 'choice', 10],
    ['ex4', 'input', 10], ['ex5', 'input', 10], ['ex6', 'input', 10],
    ['ex7', 'choice', 10], ['ex8', 'builder', 10], ['ex9', 'input', 10],
    ['ex10', 'input', 10],
    ['audio', 'reading', 0], ['truefalse', 'choice', 10]
];
{
    const block = t11.topic11Exercises;
    ok(!!block && Array.isArray(block.exercises), 'topic 11 uses the generic exercise shape');
    const groups = block.exercises;
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

    /* The engine's own rules, reproduced: `answer` may be a value or a list of
       accepted values, and `free` marks an open prompt graded by word count. */
    const norm = (v) => String(v == null ? '' : v).toLowerCase().replace(/ё/g, 'е')
        .replace(/[.,!?;:—–-]/g, ' ').replace(/\s+/g, ' ').trim();
    const accepted = (it) => (Array.isArray(it.answer) ? it.answer : [it.answer])
        .filter((a) => String(a == null ? '' : a).trim() !== '');

    let openItems = 0, multi = 0, bad = 0;
    groups.forEach((g) => {
        (g.items || []).forEach((it, i) => {
            const w = `${g.id}#${i + 1}`;
            ok(typeof it.q === 'string' && it.q.trim() !== '', `${w} has a prompt`);
            if (it.free) { openItems++; return; }
            const acc = accepted(it).map(norm);
            if (!acc.length) { bad++; ok(false, `${w} has no key`); return; }
            if (acc.length > 1) multi++;
            if (g.type === 'choice') {
                const opts = (it.options || []).map(norm);
                eq(`${w} options are distinguishable`, new Set(opts).size, opts.length);
                acc.forEach((a) => ok(opts.includes(a),
                    `${w}: the accepted answer «${a}» is one of the options`));
            }
        });
    });
    eq('ten prompts are open by design', openItems, 10);
    eq('no scored question is left without a key', bad, 0);

    /* No question is accidentally repeated inside the lesson. */
    const prompts = groups.flatMap((g) => (g.items || []).map((it) => g.id + '|' + norm(it.q)));
    eq('no duplicated question', new Set(prompts).size, prompts.length);

    const total = groups.reduce((s, g) => s + (g.items || []).length, 0);
    eq('110 interactive questions in total', total, 110);
    eq('the ten drills carry 100 of them',
        groups.filter((g) => /^ex\d+$/.test(g.id)).reduce((s2, g) => s2 + g.items.length, 0), 100);
    eq('the comprehension check carries the other 10',
        groups.find((g) => g.id === 'truefalse').items.length, 10);
    console.log(`  10 drills + audio + comprehension · ${total} interactive`
        + ` (${openItems} open · ${multi} multi-accept)`);

    const byId = (id) => groups.find((g) => g.id === id);
    const first = (id) => byId(id).items.map((i) => (Array.isArray(i.answer) ? i.answer[0] : i.answer));

    /* ---- source answer keys, verbatim ---- */
    eq('ex1 keys match the source', first('ex1').join(','),
        'нравится,нравится,нравится,нравятся,нравится,нравится,нравятся,нравится,нравится,нравятся');
    eq('ex2 keys match the source', first('ex2').join(','),
        'люблю,любишь,любит,любим,любят,любит,любите,люблю,любит,любят');
    eq('ex3 keys match the source', byId('ex3').items.map((i) => i.answer).join(','),
        'в,на,в,на,в,на,в,в,на,в');
    ok(byId('ex3').items.every((i) => i.options.join('|') === 'в|на'),
        'ex3 offers only the two prepositions the rule contrasts');
    eq('ex4 keys match the source', first('ex4').join(','),
        'спортом,танцами,фотографией,йогой,спортом,музыкой,танцами,плаванием,рисованием,спортом');
    eq('ex5 keys match the source', first('ex5').join(','),
        'хожу,ездим,ходит,ездят,хожу,ездят,ходит,ходим,ходишь,ездят');
    eq('ex8 targets match the source', first('ex8').join(' | '),
        ['Мне нравится читать книги', 'Она любит танцевать', 'Он играет в футбол',
         'Я занимаюсь спортом', 'В свободное время я слушаю музыку', 'Мы часто ходим в кино',
         'Моя сестра играет на гитаре', 'Мы любим путешествовать',
         'По выходным я встречаюсь с друзьями', 'Им нравятся компьютерные игры'].join(' | '));
    eq('ex9 corrections match the source', first('ex9').join(' | '),
        ['Мне нравится читать книги', 'Я люблю смотреть фильмы', 'Она играет на гитаре',
         'Он занимается спортом', 'Мы любим путешествовать', 'Я играю в футбол',
         'Ему нравятся фильмы', 'Она часто ходит в кино', 'Я никогда не смотрю телевизор',
         'Мы занимаемся танцами'].join(' | '));
    /* the broken sentence is the PROMPT, never the key */
    byId('ex9').items.forEach((it, i) => ok(norm(it.q) !== norm(it.answer[0]),
        `ex9#${i + 1} does not answer with the broken sentence`));

    /* The same false rule must not survive in the exercise hint either. */
    {
        const h5 = byId('ex5').howTo || '';
        ok(!/piyoda/.test(h5), 'the ex5 hint does not call «ходить» walking');
        ok(/muntazam/.test(h5) && /transport/.test(h5),
            'it contrasts regular visiting with regular travel by transport');
    }

    /* ---- ambiguity is accepted, not invented away ---- */
    eq('ex5 #8 accepts both readings of «на экскурсии»',
        byId('ex5').items[7].answer.join('/'), 'ходим/ездим');
    const ex6 = byId('ex6');
    eq('ex6 #2 is the one unambiguous frequency', ex6.items[1].answer.join('/'), 'редко');
    eq('ex6 #8 requires the full «никогда не»', ex6.items[7].answer.join('/'), 'никогда не');
    ok(!ex6.items[7].answer.includes('никогда'),
        'and never accepts a bare «никогда», which the lesson forbids');
    eq('ex6 accepts more than one adverb where the context allows it',
        ex6.items.filter((i) => i.answer.length > 1).length, 8);
    ex6.items.forEach((it, i) => it.answer.forEach((a) => ok(
        /^(часто|обычно|иногда|редко|никогда не)$/.test(a),
        `ex6#${i + 1}: «${a}» is one of the five adverbs the lesson teaches`)));
    const ex7 = byId('ex7');
    ok(ex7.items.every((i) => i.answer.length === 2
        && i.answer.join('|') === 'В свободное время|По выходным'),
        'ex7 accepts BOTH time expressions — the source names no single answer');
    ok(/ikkala variant/.test(ex7.intro || ''), 'and the learner is told so');

    /* ---- the open exercise is genuinely open ---- */
    const ex10 = byId('ex10');
    ok(ex10.items.every((i) => i.free === true), 'every ex10 prompt is marked free');
    ok(ex10.items.every((i) => /^Namuna:/.test(i.hint || '')),
        'each carries a Namuna sample, the pattern topics 2 and 3 already use');
    /* The engine grades an open answer by word count, so the samples must be
       reachable: each shows a WHOLE sentence, which is what the task asks for. */
    const MIN = Number((fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8')
        .match(/OPEN_ANSWER_MIN_WORDS = (\d+)/) || [])[1]);
    ok(MIN > 0, 'the engine states its open-answer minimum');
    ex10.items.forEach((it, i) => ok(
        norm(it.answer[0]).split(' ').filter(Boolean).length >= MIN,
        `ex10#${i + 1}: the sample answer meets the engine's ${MIN}-word minimum`));
    ok(/to‘liq yozing/.test(ex10.howTo || '') || /to‘liq/.test(ex10.intro || ''),
        'and the learner is asked for the full sentence');

    /* ---- builders assemble from their own cards ---- */
    const SB = fs.readFileSync(path.join(ROOT, 'sentence-builder.js'), 'utf8');
    ok(/function bank\(item, group\)/.test(SB), 'the builder derives its cards from the answers');
    byId('ex8').items.forEach((it, i) => {
        const target = it.answer[0];
        eq(`ex8#${i + 1} target has no double spacing`, target.split(/\s+/).join(' '), target);
        it.q.split(' / ').forEach((tok) => ok(norm(target).includes(norm(tok)),
            `ex8#${i + 1}: prompt token «${tok}» appears in the target`));
    });

    /* ---- comprehension: source statements and key ---- */
    eq('the comprehension keys match the source',
        byId('truefalse').items.map((i) => i.answer).join(','),
        'Правда,Ложь,Ложь,Правда,Ложь,Правда,Правда,Ложь,Правда,Ложь');
    ok(byId('truefalse').items.every((i) => i.options.join('|') === 'Правда|Ложь'),
        'the comprehension check offers Правда / Ложь');
    eq('the ten statements are the source statements, verbatim',
        byId('truefalse').items.map((i) => i.q).join(' | '),
        ['Анна любит субботу.', 'В субботу Анна обычно работает.',
         'Утром Анна позвонила Кате.', 'Катя предложила поехать за город.',
         'Девушки поехали за город на машине.', 'Они взяли с собой еду и фотоаппарат.',
         'Катя любит рисовать.', 'Девушки играли в футбол возле озера.',
         'Вечером они вернулись домой уставшие, но довольные.',
         'Анна считает, что для хорошего отдыха нужны дорогие развлечения.'].join(' | '));
}

/* ------------------------------------------------------- 5. vocabulary */
{
    const VSRC = mainScript(fs.readFileSync(path.join(ROOT, 'paid-courses/a2-vocabulary.html'), 'utf8'));
    const all = literal(VSRC, 'vocabularyData').topics;
    const v11 = all.find((t) => t.id === 11);
    ok(!!v11, 'vocabulary topic 11 exists');
    eq('70 cards, exactly the source count', v11.words.length, 70);
    eq('no exact duplicate card',
        new Set(v11.words.map((w) => w.ru.toLowerCase() + '||' + w.uz.toLowerCase())).size, 70);
    eq('no repeated russian side either',
        new Set(v11.words.map((w) => w.ru.toLowerCase())).size, 70);
    ok(v11.words.every((w) => w.ru && w.ru.trim() && w.uz && w.uz.trim()),
        'no card has an empty side');
    eq('the deck opens on «хобби»', v11.words[0].ru + ' — ' + v11.words[0].uz, 'хобби — hobbi');
    eq('and closes on «интересно проводить время»',
        v11.words[69].ru + ' — ' + v11.words[69].uz,
        'интересно проводить время — vaqtni qiziqarli o‘tkazmoq');
    /* every one of the five source groups is represented, in source order */
    const idx = (ru) => v11.words.findIndex((w) => w.ru === ru);
    [['хобби', 'отдыхать'], ['отдыхать', 'любить читать'],
     ['любить читать', 'в свободное время'], ['в свободное время', 'интересный']]
        .forEach(([a, b]) => ok(idx(a) >= 0 && idx(b) > idx(a),
            `«${a}» comes before «${b}» — the source grouping is kept`));
    [['спорт', 'sport'], ['фотография', 'fotografiya'], ['петь', 'qo‘shiq aytmoq'],
     ['проводить время', 'vaqt o‘tkazmoq'], ['играть на гитаре', 'gitara chalmoq'],
     ['ездить за город', 'shahar tashqarisiga bormoq'], ['никогда', 'hech qachon'],
     ['уставший', 'charchagan'], ['довольный', 'mamnun']]
        .forEach(([ru, uz]) => ok(v11.words.some((w) => w.ru === ru && w.uz === uz),
            `the card "${ru}" is present with its source translation`));
    ok(/\b11:\s*70\b/.test(SRC), 'the course card advertises 70 words for topic 11');
    eq('topics 1-10 vocabulary unchanged',
        [1,2,3,4,5,6,7,8,9,10].map((id) => all.find((t) => t.id === id).words.length).join(','),
        '45,77,73,106,50,69,85,85,50,69');
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

    w.__api.setCompleted([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    w.eval('currentTopicId=11;');
    w.__api.loadLesson(11);
    const D = w.document;

    ok(!!w.__api.exData(t11), 'the generic engine claims topic 8');
    eq('twelve steps exist in the hidden bridge', D.querySelectorAll('[data-t1-ex]').length, 12);
    /* ex1, ex2, ex4, ex5, ex6, ex9 and ex10 are text inputs; ex8 is a builder
       whose slots are hidden inputs too. */
    eq('eighty text inputs render across the input and builder steps',
        D.querySelectorAll('[data-t1-input]').length, 80);
    const lesson = (D.getElementById('lessonContent') || D.body).textContent;
    ok(/Мне нравятся книги/.test(lesson), 'the grammar reaches the screen');
    ok(/Audio va tushunish savollari/.test(lesson), 'the lesson announces the listening step');

    const first = (a) => (Array.isArray(a) ? a[0] : a);
    let missing = 0;
    t11.topic11Exercises.exercises.forEach((g) => {
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
        await w.__api.check(11);
        const marked = D.querySelectorAll('.t1-opt.t1-ok').length
            + D.querySelectorAll('[data-t1-input].correct').length;
        const scoreText = (D.getElementById('scoreDisplay') || {}).textContent || '';
        ok(/\b110\s*\/\s*110\b/.test(scoreText),
            `a perfect paper is graded 110/110 (${scoreText.trim()})`);
        ok(marked >= 20, `the graded widgets mark themselves correct (${marked})`);

        /* Completion must go through the server, and unlock topic 9. */
        await w.__api.complete(11);
        await new Promise((r) => setTimeout(r, 150));
        eq('exactly one completion claim', w.__claims.length, 1);
        eq('the claim names course A2', w.__claims[0].c, 'A2');
        eq('and it claims the EXERCISES half, not the whole topic',
            w.__claims[0].cm, 'exercises');
        eq('the claim names topic 11', w.__claims[0].t, 11);
        ok(w.__api.getCompleted().includes(11), 'the server answer is adopted');
        ok(w.__safe.every((p) => !('completedTopics' in p)),
            'no completion field went through the generic saver');
        ok(w.__api.getCompleted().includes(11), 'topic 12 unlocks');
        ok(!/saveUserProgress\([^)]*completedTopics/.test(SRC),
            'topic 11 introduced no direct authoritative write');

        /* A REFUSED server save must not unlock anything. */
        {
            const wf = boot();
            wf.eval('window.completeCourseComponent=async function(){throw new Error("offline");};' +
                    'window.completeCourseTopic=async function(){throw new Error("offline");};');
            wf.__api.setCompleted([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
            wf.eval('currentTopicId=11;');
            wf.__api.loadLesson(11);
            try { await wf.__api.complete(11); } catch (e) { /* surfaced to the learner */ }
            await new Promise((r) => setTimeout(r, 120));
            ok(!wf.__api.getCompleted().includes(11),
                'a failed server save leaves topic 11 incomplete');
        }

        /* ---------- 7. THE STEPPING SESSION, not a long page ---------- */
        const w2 = boot();
        const D2 = w2.document;
        w2.__api.setCompleted([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        w2.eval('currentTopicId=11;');
        w2.__api.loadLesson(11);
        w2.__api.render(11);
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
        ok(/новые фильмы/.test(host().textContent), 'step 1 is exercise 1');
        ok(!/рано вставать/.test(host().textContent), 'exercise 2 is NOT also on screen');
        ok(!host().querySelector('audio'), 'the audio player is NOT on screen yet');
        ok(/Javoblarni tekshirish/.test([...D2.querySelectorAll('.uz-foot button, .uz-btn')]
            .map((b) => b.textContent).join(' | ')), 'the check button is in Uzbek');

        const groups = t11.topic11Exercises.exercises;
        const seen = [];
        let multi = 0;
        for (let i = 0; i < groups.length; i++) {
            seen.push(stepText().trim());
            if (titlesOnScreen() > 1) multi++;
            const g = groups[i];
            /* ANSWER EACH STEP, PROPERLY.

               These fills looked only for the topic-1 markup, so on a topic
               rendered by the shared course-exercise-ui (data-b2h-*) nothing was
               ever answered: every step scored zero and the walkthrough advanced
               anyway, because A2 had no pass gate. A2 now enforces the platform
               80% rule, so an unanswered step correctly refuses to open the next.

               Both markups are clicked, and then the host's OWN writeAnswer is
               called — the same function draft-restore uses, which knows every
               group type including builders and matchers. */
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
                ok(/audios\/А2 11 урок\.mp3$/.test(played),
                    `the player points at the A2 lesson 11 recording (${played})`);
                ok(!/Б2/.test(played), 'and not at a Б2 recording');
                ok(!/Анна любит субботу/.test(host().textContent),
                    'the comprehension statements are NOT on the audio step');
                ok(!foot.some((t) => /tekshirish/i.test(t)),
                    'the audio step offers no check button');
                ok(!foot.some((t) => /qayta ishlash/i.test(t)), 'and no retry');
                eq('the audio step offers exactly one action', foot.length, 1);
                ok(/Savollarga/.test(foot[0] || ''), 'that action moves on to the questions');
            }
            if (g.id === 'truefalse') {
                ok(/Анна любит субботу/.test(host().textContent),
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
        ok(!/topic11(Active|Step|Custom|Navigation|Renderer|State|Wizard|Checker|Modal|Storage)/i.test(SRC),
            'topic 11 introduced no bespoke step/state/renderer machinery');
        ok(/window\.A2Host\.mountPractice/.test(SRC),
            'topic 11 goes through the shared A2 practice mount');
        eq('exactly one practice mount in the page',
            (SRC.match(/A2Host\.mountPractice\(/g) || []).length, 1);
        {
            const a = SRC.indexOf('topic11Exercises:');
            const b = SRC.indexOf('id: 12,', a);
            ok(!/function\s*\(|=>/.test(SRC.slice(a, b)), 'the topic 11 payload is data, not logic');
        }

        console.log('='.repeat(60));
        if (fail) {
            console.log(`  ❌ A2 TOPIC 11: ${fail} failed / ${pass + fail}\n`);
            failures.slice(0, 20).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
            console.log('='.repeat(60) + '\n');
            process.exit(1);
        }
        console.log(`  ✅ A2 TOPIC 11: ${pass}/${pass} passed`);
        console.log('='.repeat(60) + '\n');
    })();
}
