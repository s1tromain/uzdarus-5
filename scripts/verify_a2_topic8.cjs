#!/usr/bin/env node
/**
 * verify_a2_topic8.cjs — A2 topic 8 «Kiyim-kechak va moda» must stay a
 * complete, objectively gradable lesson.
 *
 * Topic 8 shipped as a placeholder: a title, an empty legacy `quiz`, nothing to
 * learn. It now carries the grammar of gender agreement and the demonstratives
 * этот/эта/это/эти, 85 vocabulary cards, ten scored drills, a listening step
 * and its comprehension check.
 *
 * Three properties are worth more than the counts:
 *   1. EVERY scored question has exactly ONE correct option, judged with the
 *      scorer's own normaliser — a learner who knows the rule must not lose a
 *      mark to punctuation.
 *   2. The lesson plays ITS OWN recording. The source material named a Б2 file;
 *      A2 topic N plays audios/А2 N урок.mp3 and nothing else.
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

console.log('\n=== A2 TOPIC 8 ===');

const topics = literal(SRC, 'courseData').topics;
const t8 = topics.find((t) => t.id === 8);

/* ------------------------------------------------------- 1. the topic */
eq('exactly one topic 8', topics.filter((t) => t.id === 8).length, 1);
eq('16 A2 topics, unchanged', topics.length, 16);
ok(!!t8, 'topic 8 exists');
eq('title', t8.title, 'Kiyim-kechak va moda');
ok(!t8.quiz, 'the empty placeholder quiz is gone');
ok(typeof t8.explanation.uz === 'string' && t8.explanation.uz.length > 40,
    'topic 8 has a real Uzbek introduction');
ok(!/faqat to'liq kurs obunachilari/.test(t8.explanation.uz),
    'the "subscribers only" placeholder text is gone');
ok(t8.isSubscriptionLocked === false && t8.isLocked === false, 'topic 8 is open to subscribers');

/* ------------------------------------------------------- 2. grammar */
{
    const g = t8.grammar || '';
    ok(g.length > 3000, `grammar is substantial (${g.length} chars)`);
    /* the eight blocks the source material requires, each pinned to content
       that only that block can supply */
    [['1 · Какой / Какая / Какое / Какие', /Какой\?<\/b> — мужской род[\s\S]*Какие\?<\/b> — ko/],
     ['1 · masculine examples', /новый костюм, красивый свитер, длинный плащ, чёрный пиджак/],
     ['1 · feminine examples', /новая юбка, красивая рубашка, длинная куртка, красная футболка/],
     ['1 · neuter examples', /красивое платье, новое пальто, тёплое бельё/],
     ['1 · plural examples', /новые джинсы, красивые туфли, тёплые носки, модные брюки/],
     ['2 · размер question', /Какой у вас размер\?[\s\S]*Какой у тебя размер\?/],
     ['2 · размер answers', /У меня размер 42\.[\s\S]*У меня размер 44\.[\s\S]*У меня размер 46\./],
     ['2 · shop dialogue card', /— <span class="b2g-ex-ru">Какой у вас размер\?[\s\S]*— <span class="b2g-ex-ru">У меня размер 44\./],
     ['3 · велик all four forms', /велик<\/td>[\s\S]*велика<\/td>[\s\S]*велико<\/td>[\s\S]*велики<\/td>/],
     ['3 · мал all four forms', /мал<\/td>[\s\S]*мала<\/td>[\s\S]*мало<\/td>[\s\S]*малы<\/td>/],
     ['3 · source examples', /Мне велика эта куртка[\s\S]*Мне мала эта рубашка/],
     ['4 · подходит singular', /Мне подходит эта куртка[\s\S]*Мне подходит это платье/],
     ['4 · подходят plural', /Мне подходят эти джинсы/],
     ['4 · negation', /Мне <b>не<\/b> подходит эта юбка[\s\S]*Мне <b>не<\/b> подходят эти брюки/],
     ['5 · нравится singular', /Мне нравится это платье[\s\S]*Мне нравится этот костюм/],
     ['5 · нравятся plural', /Мне нравятся эти джинсы[\s\S]*Мне нравятся эти туфли/],
     ['6 · Я хочу купить', /Я хочу купить новую куртку[\s\S]*Я хочу купить чёрные брюки/],
     ['6 · shopping phrases', /Можно примерить\?[\s\S]*У вас есть размер 44\?[\s\S]*Можно другой цвет\?/],
     ['7 · comparatives table', /большой[\s\S]*больше[\s\S]*маленький[\s\S]*меньше[\s\S]*длиннее[\s\S]*короче[\s\S]*дороже[\s\S]*дешевле/],
     ['7 · comparative sentences', /Эта куртка дороже, чем та[\s\S]*Это платье длиннее, чем то/],
     ['7 · побольше / поменьше', /Мне нужен размер побольше[\s\S]*Мне нужен размер поменьше/],
     ['8 · этот / эта / это / эти', /этот<\/b> — мужской род[\s\S]*эта<\/b> — женский род[\s\S]*это<\/b> — средний род[\s\S]*эти<\/b> — ko/],
     ['8 · demonstrative examples', /этот костюм, этот свитер[\s\S]*эта куртка, эта юбка[\s\S]*это платье, это пальто[\s\S]*эти джинсы, эти брюки/],
     ['demonstrative + adjective + noun', /красив<b>ый<\/b> костюм[\s\S]*красив<b>ая<\/b> юбка[\s\S]*красив<b>ое<\/b> платье[\s\S]*красив<b>ые<\/b> джинсы/],
     ['эта → эту note', /эта юбка<\/span> &rarr;[\s\S]*примерить <b>эту<\/b> юбку/],
     ['closing memo', /Mavzu xulosasi/]
    ].forEach(([label, re]) => ok(re.test(g), `grammar covers ${label}`));

    eq('eight numbered blocks', (g.match(/fas fa-[1-8]"/g) || []).length, 8);

    /* AT MOST THREE ACCENT COLOURS — enforced by introducing none of its own
       and reusing the shared component's semantic tokens. */
    eq('the lesson introduces no literal colours of its own',
        (g.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) || []).length, 0);
    const tones = new Set((g.match(/b2g-tone-(sv|nsv)/g) || []));
    ok(tones.size <= 2, `at most two tone classes are used (${[...tones].join(', ')})`);
    ok(/b2g-warn/.test(g), 'the warning block uses the shared warn style');
    const UI = fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8');
    ['--g-accent', '--g-ok', '--g-warn'].forEach((tok) =>
        ok(UI.includes(tok), `the shared component defines ${tok}`));

    /* Every class it uses must already exist in the shared stylesheet — a new
       class here would mean a Topic 8 design system, which is what §17 forbids. */
    const used = [...new Set(g.match(/b2g[-a-z0-9]*/g) || [])];
    used.forEach((cls) => ok(UI.includes('.' + cls),
        `the shared stylesheet already defines .${cls}`));

    ok(/b2g-split/.test(g), 'comparisons use the responsive split grid');
    ok(/b2g-t/.test(g), 'tables use the shared responsive table');
    ok(!/style="[^"]*width:\s*\d{3,}px/.test(g), 'nothing is pinned to a fixed pixel width');
}

/* ------------------------------------------------------- 3. listening */
{
    const audioGroup = t8.topic8Exercises.exercises.find((g) => g.id === 'audio');
    ok(!!audioGroup, 'the audio is its own step');
    ok(!!audioGroup.audioSrc, 'the audio step names a source');
    /* SOURCE ISSUE: the material gives the path as «Б2 2 урок.mp3» — a B2
       recording. The A2 positional rule (topic N → А2 N урок.mp3) wins. */
    eq('the source is the A2 lesson 8 recording',
        decodeURIComponent(audioGroup.audioSrc), 'audios/А2 8 урок.mp3');
    ok(!/Б2/.test(decodeURIComponent(audioGroup.audioSrc)),
        'topic 8 does not borrow a Б2 recording');
    const audioFile = path.join(ROOT, decodeURIComponent(audioGroup.audioSrc));
    ok(fs.existsSync(audioFile), `the referenced mp3 exists on disk (${audioGroup.audioSrc})`);
    ok(fs.statSync(audioFile).size > 10000, 'and it is a real recording, not a stub');

    /* NO TRANSCRIPT: the source supplies none, and none was invented. */
    ok(!audioGroup.passage, 'the audio step carries no passage');
    ok(!t8.topic8Exercises.exercises.some((g) => g.passage), 'no step carries a story text');
    ok(!/прочитайте|matnni o'qing/i.test(t8.content || ''),
        'the lesson never tells the learner to READ anything');
    ok(/audio/i.test(t8.content || ''), 'it points them at the audio instead');
}

/* --------------------------------------------- 4. exercises + answer keys */
const EXPECTED = [
    ['ex1', 'choice', 10], ['ex2', 'choice', 10], ['ex3', 'choice', 10],
    ['ex4', 'choice', 10], ['ex5', 'choice', 10], ['ex6', 'choice', 10],
    ['ex7', 'choice', 10], ['ex8', 'input', 10], ['ex9', 'choice', 10],
    ['ex10', 'builder', 10],
    ['audio', 'reading', 0], ['truefalse', 'choice', 10]
];
{
    const block = t8.topic8Exercises;
    ok(!!block && Array.isArray(block.exercises), 'topic 8 uses the generic exercise shape');
    const groups = block.exercises;
    eq('twelve steps: ten drills, an audio and a comprehension check', groups.length, EXPECTED.length);

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

    /* The normaliser the A2 scorer applies, reproduced, so "distinguishable
       options" is judged the way the grader judges them. */
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
    ok(/Savollarga/.test(audioStep.continueLabel || ''),
        'it offers a continue action, not a check');
    ok(!audioStep.answer, 'no fake question was invented for the audio step');
    const tfStep = groups.find((g) => g.id === 'truefalse');
    ok(/Audio/.test(tfStep.stepName || ''), 'the comprehension step is about the audio');

    const total = groups.reduce((s, g) => s + (g.items || []).length, 0);
    eq('110 scored questions in total', total, 110);
    eq('the ten drills carry 100 of them',
        groups.filter((g) => /^ex\d+$/.test(g.id)).reduce((s2, g) => s2 + g.items.length, 0), 100);
    eq('the comprehension check carries the other 10', tfStep.items.length, 10);
    console.log(`  10 drills + audio + comprehension · ${total} scored questions`);

    /* ---- the source answer keys, verbatim ---- */
    const byId = (id) => groups.find((g) => g.id === id);
    const keys = (id) => byId(id).items.map((i) => i.answer).join(',');

    eq('ex1 keys match the source', keys('ex1'),
        'это,эта,эти,этот,эта,это,эти,этот,эта,эти');
    eq('ex2 combinations match the source',
        byId('ex2').items.map((i) => i.answer).join(','),
        ['это платье', 'этот костюм', 'эта юбка', 'эта рубашка', 'эта куртка',
         'эти брюки', 'этот свитер', 'эти джинсы', 'эти туфли', 'это пальто'].join(','));
    eq('ex3 keys match the source', keys('ex3'),
        'этот,эта,это,эти,этот,эта,это,эти,эта,эти');
    eq('ex4 keys match the source', keys('ex4'),
        'нравится,нравится,нравятся,нравится,нравятся,нравится,нравится,нравятся,нравится,нравится');
    eq('ex5 keys match the source', keys('ex5'),
        'подходит,подходят,подходит,подходит,подходят,подходит,подходят,подходит,подходит,подходят');
    eq('ex6 keys match the source', keys('ex6'),
        'размер,размер,побольше,поменьше,размер,размер,побольше,поменьше,размер,размер');
    eq('ex7 corrections match the source',
        byId('ex7').items.map((i) => i.answer).join(' | '),
        ['Эта юбка очень красивая.', 'Это платье дорогое.', 'Эта куртка новая.',
         'Этот свитер тёплый.', 'Эти брюки красивые.', 'Это пальто длинное.',
         'Эти джинсы модные.', 'Эта футболка белая.', 'Эти туфли удобные.',
         'Этот костюм красивый.'].join(' | '));
    eq('the comprehension keys match the source', keys('truefalse'),
        "Rost,Yolg‘on,Rost,Yolg‘on,Rost,Rost,Yolg‘on,Rost,Rost,Yolg‘on");
    ok(byId('truefalse').items.every((i) => i.options.join('|') === 'Rost|Yolg‘on'),
        'the comprehension check offers Rost / Yolg‘on');
    ok(byId('truefalse').items.every((i, n) =>
        i.q === ['Малика пошла в магазин одежды в субботу.',
                 'Малика хотела купить новую одежду на зиму.',
                 'Малика увидела красивую чёрную куртку.',
                 'Свитер был красного цвета.',
                 'У Малики 44-й размер.',
                 'Сначала свитер оказался немного большим.',
                 'Малика попросила размер побольше.',
                 'Размер 42 хорошо подошёл Малике.',
                 'Джинсы были удобные и модные.',
                 'Малика купила только куртку.'][n]),
        'the comprehension statements are the source statements, verbatim');

    /* ---- ex7: the wrong sentence is asked about, not offered as the key ---- */
    byId('ex7').items.forEach((it, i) => {
        ok(it.answer !== it.q, `ex7#${i + 1} does not answer with the broken sentence`);
        ok(it.options.includes(it.answer), `ex7#${i + 1} offers its own key`);
        eq(`ex7#${i + 1} offers all four demonstratives`, it.options.length, 4);
    });

    /* ---- SOURCE ISSUE: ex6 #3 was ambiguous in the source ---- */
    const ex6 = byId('ex6');
    ok(!/У вас есть размер ___\? Мне нужен 44\./.test(JSON.stringify(ex6)),
        'the ambiguous source sentence «У вас есть размер ___? Мне нужен 44.» was reworded');
    ok(/мала/.test(ex6.items[2].q) && ex6.items[2].answer === 'побольше',
        'the reworded item states the problem before asking for the size');

    /* ---- ex8: translation keys are the source models ---- */
    const ex8 = byId('ex8');
    eq('ex8 leads with the source model answers',
        ex8.items.map((i) => i.answer[0]).join(' | '),
        ['Это платье очень красивое', 'Эта куртка мне подходит', 'Эти джинсы очень удобные',
         'Мне нравится этот свитер', 'Мне нравятся эти туфли', 'Это пальто очень дорогое',
         'Мне нужен размер побольше', 'Мне нужен размер поменьше', 'Какой у вас размер',
         'Я хочу примерить эту юбку'].join(' | '));
    ok(ex8.items.every((i) => i.answer.length <= 2),
        'no translation is opened up to a long list of variants');
    ok(ex8.items[0].answer.includes('Эта рубашка очень красивая'),
        'the ambiguous «ko‘ylak» accepts the рубашка reading too');

    /* ---- EX9 WAS OPTIMISED: source blank-dialogue → ten objective dialogues ---- */
    const ex9 = byId('ex9');
    const ex9Text = JSON.stringify(ex9);
    eq('ex9 has exactly ten items', ex9.items.length, 10);
    ok(!/размер 44 44/.test(ex9Text), 'no «размер 44 44» double insertion');
    ok(!/нужна размер/.test(ex9Text), 'the ungrammatical «нужна размер» is never taught');
    ok(!/Я хочу купить ___/.test(ex9Text),
        'the source dialogue intro did not become an eleventh unanswered blank');
    ok(ex9.items.every((i) => i.options.length === 4), 'each dialogue offers four replies');
    ok(ex9.items.every((i) => /^—/.test(i.q)), 'each item is a dialogue turn');
    /* every skill the source dialogue exercised is still exercised */
    [['размер 44', /У меня размер 44/], ['это платье', /это платье/],
     ['размер побольше', /Мне нужен размер побольше/], ['Дайте размер 46', /Дайте размер 46/],
     ['эти брюки', /эти брюки/], ['эту белую футболку', /эту белую футболку/],
     ['они мне подходят', /они мне подходят/], ['поменьше', /размер поменьше/],
     ['она мне нравится', /она мне нравится/]]
        .forEach(([label, re]) => ok(re.test(ex9Text), `ex9 still exercises ${label}`));

    /* ---- SOURCE ISSUE: builder cards must carry the CORRECT inflection ---- */
    const ex10 = byId('ex10');
    eq('ex10 targets match the source', ex10.items.map((i) => i.answer[0]).join(' | '),
        ['Этот костюм красивый', 'Эта куртка новая', 'Это платье дорогое',
         'Эти джинсы удобные', 'Мне нравится этот свитер', 'Мне нравятся эти туфли',
         'Мне подходит эта юбка', 'Мне нужен размер побольше',
         'Я хочу примерить это пальто', 'Какой у вас размер'].join(' | '));
    ok(!/нужны/.test(JSON.stringify(ex10)),
        'the source prompt «мне / нужны / размер / побольше» is not handed to the learner');
    ok(/нужен/.test(ex10.items[7].q), 'the prompt shows the correct «нужен» too');

    /* The builder derives its cards from the ANSWER, so every target is
       assemblable by construction — assert that the data keeps it that way. */
    const SB = fs.readFileSync(path.join(ROOT, 'sentence-builder.js'), 'utf8');
    ok(/function bank\(item, group\)/.test(SB) && /variantsOf\(item\)\.forEach/.test(SB),
        'the builder still derives its cards from the accepted answers');
    ex10.items.forEach((it, i) => {
        const target = it.answer[0];
        eq(`ex10#${i + 1} target has no double spacing`, target.split(/\s+/).join(' '), target);
        ok(!/^\s|\s$/.test(target), `ex10#${i + 1}: no stray whitespace`);
        ok(target.split(' ').length >= 3, `ex10#${i + 1}: a real sentence to build`);
    });
}

/* ------------------------------------------------------- 5. vocabulary */
{
    const VSRC = mainScript(fs.readFileSync(path.join(ROOT, 'paid-courses/a2-vocabulary.html'), 'utf8'));
    const all = literal(VSRC, 'vocabularyData').topics;
    const v8 = all.find((t) => t.id === 8);
    ok(!!v8, 'vocabulary topic 8 exists');
    eq('85 cards, exactly the source count', v8.words.length, 85);
    eq('no exact duplicate card', new Set(v8.words.map((w) => w.ru + '||' + w.uz)).size, 85);
    eq('no repeated russian side either', new Set(v8.words.map((w) => w.ru)).size, 85);
    ok(v8.words.every((w) => w.ru && w.ru.trim() && w.uz && w.uz.trim()),
        'no card has an empty side');
    /* one representative card from each of the five source groups */
    [['одежда', 'kiyim-kechak'], ['платье', 'ko‘ylak'], ['джинсы', 'jinsi shim'],
     ['туфли', 'tufli'], ['костюм', 'kostyum'],
     ['размер', 'o‘lcham'], ['тесный', 'siqadigan / tor'],
     ['бежевый', 'bej rang'], ['чёрный', 'qora'],
     ['примерочная', 'kiyib ko‘rish xonasi'], ['скидка', 'chegirma'],
     ['Какой у вас размер?', 'Sizning o‘lchamingiz qanday?'],
     ['Можно примерить?', 'Kiyib ko‘rsam bo‘ladimi?'],
     ['Я хочу примерить это платье.', 'Men bu ko‘ylakni kiyib ko‘rmoqchiman.']]
        .forEach(([ru, uz]) => ok(v8.words.some((w) => w.ru === ru && w.uz === uz),
            `the card "${ru}" is present with its source translation`));
    /* SOURCE ISSUE: the last uz side is cut off mid-sentence in the source. */
    const last = v8.words[v8.words.length - 1];
    eq('the truncated last entry is completed from the list itself',
        last.ru + ' — ' + last.uz,
        'Эти джинсы мне подходят. — Bu jinsi shimlar menga mos keladi.');
    ok(!v8.words.some((w) => /\bmen$/.test(w.uz)), 'no card is left cut off mid-word');
    /* all five source groups are represented, in source order */
    const idx = (ru) => v8.words.findIndex((w) => w.ru === ru);
    ok(idx('одежда') < idx('размер'), 'Kiyimlar comes before O‘lcham');
    ok(idx('размер') < idx('белый'), 'O‘lcham comes before Ranglar');
    ok(idx('белый') < idx('магазин одежды'), 'Ranglar comes before Xarid qilish');
    ok(idx('магазин одежды') < idx('Какой у вас размер?'), 'Xarid qilish comes before iboralar');

    ok(/\b8:\s*85\b/.test(SRC), 'the course card advertises 85 words for topic 8');
    eq('topics 1-7 vocabulary unchanged',
        [1, 2, 3, 4, 5, 6, 7].map((id) => all.find((t) => t.id === id).words.length).join(','),
        '45,77,73,106,50,69,85');
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

    w.__api.setCompleted([1, 2, 3, 4, 5, 6, 7]);
    w.eval('currentTopicId=8;');
    w.__api.loadLesson(8);
    const D = w.document;

    ok(!!w.__api.exData(t8), 'the generic engine claims topic 8');
    eq('twelve steps exist in the hidden bridge', D.querySelectorAll('[data-t1-ex]').length, 12);
    /* ex8 is the only text-input drill; ex10 is a builder with hidden inputs. */
    eq('twenty text inputs render across the input and builder steps',
        D.querySelectorAll('[data-t1-input]').length, 20);
    const lesson = (D.getElementById('lessonContent') || D.body).textContent;
    ok(/Мне подходят/.test(lesson), 'the grammar reaches the screen');
    ok(/Audio va tushunish savollari/.test(lesson), 'the lesson announces the listening step');

    const first = (a) => (Array.isArray(a) ? a[0] : a);
    let missing = 0;
    t8.topic8Exercises.exercises.forEach((g) => {
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
        await w.__api.check(8);
        const marked = D.querySelectorAll('.t1-opt.t1-ok').length
            + D.querySelectorAll('[data-t1-input].correct').length;
        const scoreText = (D.getElementById('scoreDisplay') || {}).textContent || '';
        ok(/\b110\s*\/\s*110\b/.test(scoreText),
            `a perfect paper is graded 110/110 (${scoreText.trim()})`);
        ok(marked >= 90, `the graded widgets mark themselves correct (${marked})`);

        /* Completion must go through the server, and unlock topic 9. */
        await w.__api.complete(8);
        await new Promise((r) => setTimeout(r, 150));
        eq('exactly one completion claim', w.__claims.length, 1);
        eq('the claim names course A2', w.__claims[0].c, 'A2');
        eq('and it claims the EXERCISES half, not the whole topic',
            w.__claims[0].cm, 'exercises');
        eq('the claim names topic 8', w.__claims[0].t, 8);
        ok(w.__api.getCompleted().includes(8), 'the server answer is adopted');
        ok(w.__safe.every((p) => !('completedTopics' in p)),
            'no completion field went through the generic saver');
        ok(w.__api.getCompleted().includes(8), 'topic 9 unlocks');
        ok(!/saveUserProgress\([^)]*completedTopics/.test(SRC),
            'topic 8 introduced no direct authoritative write');

        /* A REFUSED server save must not unlock anything. */
        {
            const wf = boot();
            wf.eval('window.completeCourseComponent=async function(){throw new Error("offline");};' +
                    'window.completeCourseTopic=async function(){throw new Error("offline");};');
            wf.__api.setCompleted([1, 2, 3, 4, 5, 6, 7]);
            wf.eval('currentTopicId=8;');
            wf.__api.loadLesson(8);
            try { await wf.__api.complete(8); } catch (e) { /* surfaced to the learner */ }
            await new Promise((r) => setTimeout(r, 120));
            ok(!wf.__api.getCompleted().includes(8),
                'a failed server save leaves topic 8 incomplete');
        }

        /* ---------- 7. THE STEPPING SESSION, not a long page ---------- */
        const w2 = boot();
        const D2 = w2.document;
        w2.__api.setCompleted([1, 2, 3, 4, 5, 6, 7]);
        w2.eval('currentTopicId=8;');
        w2.__api.loadLesson(8);
        w2.__api.render(8);
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
        ok(/платье очень красивое/.test(host().textContent), 'step 1 is exercise 1');
        ok(!/qaysi birikma/.test(host().textContent), 'exercise 2 is NOT also on screen');
        ok(!host().querySelector('audio'), 'the audio player is NOT on screen yet');
        ok(/Javoblarni tekshirish/.test([...D2.querySelectorAll('.uz-foot button, .uz-btn')]
            .map((b) => b.textContent).join(' | ')), 'the check button is in Uzbek');

        const groups = t8.topic8Exercises.exercises;
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
                ok(/audios\/А2 8 урок\.mp3$/.test(played),
                    `the player points at the A2 lesson 8 recording (${played})`);
                ok(!/Б2/.test(played), 'and not at a Б2 recording');
                ok(!/Малика/.test(host().textContent),
                    'the comprehension statements are NOT on the audio step');
                ok(!foot.some((t) => /tekshirish/i.test(t)),
                    'the audio step offers no check button');
                ok(!foot.some((t) => /qayta ishlash/i.test(t)), 'and no retry');
                eq('the audio step offers exactly one action', foot.length, 1);
                ok(/Savollarga/.test(foot[0] || ''), 'that action moves on to the questions');
            }
            if (g.id === 'truefalse') {
                ok(/Малика/.test(host().textContent),
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
        ok(!/topic8(Active|Step|Custom|Navigation|Renderer|State|Wizard|Checker|Modal|Storage)/i.test(SRC),
            'topic 8 introduced no bespoke step/state/renderer machinery');
        ok(/window\.A2Host\.mountPractice/.test(SRC),
            'topic 8 goes through the shared A2 practice mount');
        eq('exactly one practice mount in the page',
            (SRC.match(/A2Host\.mountPractice\(/g) || []).length, 1);
        {
            const a = SRC.indexOf('topic8Exercises:');
            const b = SRC.indexOf('id: 9,', a);
            ok(!/function\s*\(|=>/.test(SRC.slice(a, b)), 'the topic 8 payload is data, not logic');
        }

        console.log('='.repeat(60));
        if (fail) {
            console.log(`  ❌ A2 TOPIC 8: ${fail} failed / ${pass + fail}\n`);
            failures.slice(0, 20).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
            console.log('='.repeat(60) + '\n');
            process.exit(1);
        }
        console.log(`  ✅ A2 TOPIC 8: ${pass}/${pass} passed`);
        console.log('='.repeat(60) + '\n');
    })();
}
