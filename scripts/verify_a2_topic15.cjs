#!/usr/bin/env node
/**
 * verify_a2_topic15.cjs — A2 topic 15 «Muloqot va munosabatlar» must stay a
 * complete, honestly gradable lesson.
 *
 * NINE drills, not ten. The material numbers 1-mashq..9-mashq and then goes
 * straight to the recording. No filler exercise was invented to reach ten, and
 * this suite fails if one appears.
 *
 * TWENTY open prompts. Ex5 asks the learner to finish a sentence with their own
 * reason and Ex6 asks for an opinion; neither has a right answer, so both are
 * free-graded. Ex5's prompt asks for the WHOLE sentence rather than just the
 * words after «потому что» — that keeps a legitimate one-word reason from
 * failing the platform's three-word minimum WITHOUT touching the shared scorer.
 *
 * Four source defects are corrected and pinned here:
 *   - «Мы говорим учителю.» taught кому? with a truncated example that reads as
 *     a confused «говорить с кем?»; it is now «Мы говорим учителю правду.»
 *   - «Давай + fe'l!» claimed any verb may simply follow давай; it now teaches
 *     BOTH real models — давай + infinitive AND давай + the «мы» form. An
 *     earlier pass over-corrected here and taught that only the «мы» form was
 *     possible, which is just as wrong in the other direction: «Давай читать.»
 *     and «Давайте говорить по-русски.» are ordinary Russian.
 *   - «А ты + как думаешь?» was presented as a slot formula; it is a fixed
 *     phrase, «А ты как думаешь?».
 *   - Ex7 #7's distractor «Да, мне нравится он.» is defensible under
 *     contrastive stress, so it could not be marked wrong; it is replaced by an
 *     unequivocally ungrammatical option.
 *
 * Ex8 #3 has TWO grammatical repairs and the material does not say which
 * meaning it meant. Both are accepted.
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

console.log('\n=== A2 TOPIC 15 ===');

const topics = literal(SRC, 'courseData').topics;
const t15 = topics.find((t) => t.id === 15);

/* ------------------------------------------------------- 1. the topic */
eq('exactly one topic 15', topics.filter((t) => t.id === 15).length, 1);
eq('16 A2 topics, unchanged', topics.length, 16);
ok(!!t15, 'topic 15 exists');
eq('title', t15.title, 'Muloqot va munosabatlar');
ok(!t15.quiz, 'the empty placeholder quiz is gone');
ok(typeof t15.explanation.uz === 'string' && t15.explanation.uz.length > 40,
    'topic 15 has a real Uzbek introduction');
ok(!/faqat to‘liq kurs obunachilari/.test(t15.explanation.uz),
    'the "subscribers only" placeholder text is gone');
ok(/muloqot/i.test(t15.explanation.uz) && /fikr/i.test(t15.explanation.uz),
    'the introduction names communicating and expressing an opinion');
['с кем?', 'кому?', 'о ком?', 'кого?'].forEach((q) =>
    ok(t15.explanation.uz.includes(q), `the introduction names «${q}»`));
ok(t15.isSubscriptionLocked === false && t15.isLocked === false, 'topic 15 is open');

{
    /* Topic 16 used to be the placeholder this lesson led into. It is authored
       now — A2 is complete — so what matters here is only that topic 15 still
       leads somewhere real. */
    const t16 = topics.find((t) => t.id === 16);
    ok(!!t16, 'topic 16 exists');
    ok((t16.grammar || '').length > 1000, 'topic 16 is authored, so 15 leads into a real lesson');
    ok(!t16.quiz, 'and it no longer carries the placeholder quiz');
    ok(Object.keys(t16).some((k) => /^topic\d+Exercises$/.test(k)),
        'topic 16 carries its own exercise payload');
    ok(!topics.some((t) => t.id > 16), 'and nothing was invented beyond it');
}

/* ------------------------------------------------------- 2. grammar */
{
    const g = t15.grammar || '';
    ok(g.length > 3000, `grammar is substantial (${g.length} chars)`);
    [['lead names the Russian topic', /Общение и выбор|Общение и отношения/],
     ['1 · с + творительный', /с<\/b> \+ творительный падеж/],
     ['1 · the с-verb model', /<b>общаться \/ разговаривать \/ дружить<\/b> <span>\+<\/span> <b[^>]*>с<\/b> <span>\+<\/span> <b>кем\?<\/b>/],
     ['1 · с examples', /Я общаюсь с другом[\s\S]*Она разговаривает с мамой[\s\S]*Мы часто встречаемся с друзьями[\s\S]*Он дружит с Антоном/],
     ['1 · model card', /Я общаюсь с коллегой/],
     ['2 · dative verbs', /<b>писать \/ звонить \/ помогать<\/b> <span>\+<\/span> <b[^>]*>кому\?<\/b>/],
     ['2 · dative examples', /Я звоню маме[\s\S]*Она пишет другу[\s\S]*Я помогаю брату/],
     ['2 · model card', /Я пишу подруге/],
     ['3 · о + ком model', /<b>говорить \/ рассказывать \/ думать<\/b> <span>\+<\/span> <b[^>]*>о<\/b> <span>\+<\/span> <b>ком\?<\/b>/],
     ['3 · о ком examples', /Мы говорим о друзьях[\s\S]*Я думаю о маме[\s\S]*Она рассказывает о брате[\s\S]*Они говорят о новом учителе/],
     ['3 · model card', /Я говорю о своём друге/],
     ['4 · all three opinion frames', /Я думаю, что<\/b> \+ gap[\s\S]*Я считаю, что<\/b> \+ gap[\s\S]*Мне кажется, что<\/b> \+ gap/],
     ['4 · opinion examples', /Я думаю, что он хороший человек[\s\S]*Я считаю, что дружба очень важна[\s\S]*Мне кажется, что она немного устала/],
     ['5 · agreement phrases', /Я согласен\. \/ Я согласна\.<\/b>[\s\S]*Я тоже так думаю\.<\/b>[\s\S]*Ты прав\. \/ Ты права\.<\/b>[\s\S]*Конечно!<\/b>/],
     ['5 · agreement dialogues', /— Дружба очень важна\.<br>— Я согласна\.[\s\S]*— Нужно больше разговаривать с родителями\.<br>— Я тоже так думаю\./],
     ['6 · disagreement phrases', /Я не согласен\. \/ Я не согласна\.<\/b>[\s\S]*Я так не думаю\.<\/b>[\s\S]*Я думаю по-другому\.<\/b>[\s\S]*Не совсем\.<\/b>/],
     ['6 · disagreement examples', /Я не согласна с тобой[\s\S]*Не совсем\. Я считаю, что это неправильно/],
     ['7 · согласен с кем model', /<b>согласен \/ согласна<\/b> <span>\+<\/span> <b[^>]*>с<\/b> <span>\+<\/span> <b>кем\?<\/b>/],
     ['7 · согласен examples', /Я согласна с тобой[\s\S]*Он согласен с учителем[\s\S]*Мы согласны с родителями[\s\S]*Она не согласна с мужем/],
     ['8 · нравится model', /<b[^>]*>Кому\?<\/b> <span>\+<\/span> <b>нравится<\/b> <span>\+<\/span> <b>кто\? \/ что\?<\/b>/],
     ['8 · нравятся model', /<b[^>]*>Кому\?<\/b> <span>\+<\/span> <b>нравятся<\/b> <span>\+<\/span> <b>ko.plikdagi ot<\/b>/],
     ['8 · singular examples', /Мне нравится этот человек[\s\S]*Ей нравится её новый друг[\s\S]*Нам нравится общаться вместе/],
     ['8 · plural examples', /Им нравятся добрые люди[\s\S]*Мне нравятся мои друзья[\s\S]*Ей нравятся интересные люди/],
     ['8 · the singular/plural reminder', /birlikdagi ot yoki infinitiv<\/td><td>&rarr; <b[^>]*>нравится[\s\S]*ko.plikdagi ot<\/td><td>&rarr; <b[^>]*>нравятся/],
     ['9 · любить examples', /Я люблю своих друзей[\s\S]*Она любит свою семью/],
     ['9 · нравиться examples', /Мне нравится мой друг[\s\S]*Мне нравятся мои друзья/],
     ['10 · the four channels', /разговаривать по телефону[\s\S]*общаться в интернете[\s\S]*писать в чате[\s\S]*отправлять сообщение/],
     ['10 · channel examples', /Я разговариваю по телефону[\s\S]*Мы общаемся в интернете[\s\S]*Она пишет в чате[\s\S]*Я отправляю другу сообщение/],
     ['11 · поговорить model', /<b[^>]*>поговорить<\/b> <span>\+<\/span> <b>с<\/b> <span>\+<\/span> <b>кем\?<\/b>/],
     ['11 · поговорить examples', /Мне нужно поговорить с тобой[\s\S]*Я хочу поговорить с учителем[\s\S]*Она хочет поговорить с мамой[\s\S]*Нам нужно поговорить с директором/],
     ['12 · давай + infinitive examples', /Давай читать\.[\s\S]*Давай смотреть фильм\.[\s\S]*Давай работать вместе\.[\s\S]*Давайте говорить по-русски\./],
     ['12 · давай joint-action examples', /Давай поговорим![\s\S]*Давай встретимся![\s\S]*Давай обсудим это![\s\S]*Давай позвоним ему!/],
     ['12 · давайте examples', /Давайте поговорим\.[\s\S]*Давайте встретимся завтра\./],
     ['13 · the eight conversation phrases', /Как ты думаешь\?<\/b>[\s\S]*Что ты думаешь\?<\/b>[\s\S]*А ты\?<\/b>[\s\S]*Почему\?<\/b>[\s\S]*Правда\?<\/b>[\s\S]*Серьёзно\?<\/b>[\s\S]*А что случилось\?<\/b>[\s\S]*Расскажи!<\/b>/],
     ['14 · потому что model', /<b>Я думаю \/ считаю \.\.\.<\/b><span>,<\/span> <b[^>]*>потому что<\/b>/],
     ['14 · потому что examples', /Я люблю общаться с друзьями, потому что мне весело[\s\S]*Я часто звоню маме, потому что скучаю по ней[\s\S]*Мне нравится этот человек, потому что он добрый[\s\S]*Я не хочу спорить, потому что я устал/]
    ].forEach(([label, re]) => ok(re.test(g), `grammar covers ${label}`));

    /* block 15 — every verb the source lists, with its own question */
    ['общаться с кем?', 'разговаривать с кем?', 'говорить с кем?', 'звонить кому?',
     'писать кому?', 'встречаться с кем?', 'дружить с кем?', 'помогать кому?',
     'советовать кому?', 'спрашивать кого?', 'отвечать кому?', 'слушать кого?',
     'понимать кого?']
        .forEach((v) => ok(g.includes(v), `the verb list keeps «${v}»`));
    ['Я общаюсь с другом.', 'Я звоню сестре.', 'Мы говорим о преподавателе.',
     'Мне нравится этот человек.', 'Я согласен с тобой.']
        .forEach((s) => ok(g.includes(s), `the summary keeps «${s}»`));
    ok(/с кем\?<\/b> · <b[^>]*>кому\?<\/b> · <b[^>]*>о ком\?<\/b> · <b[^>]*>кого\?/.test(g),
        'the four questions are contrasted side by side at the end');

    /* ---- SOURCE FIX A: кому? no longer taught with a truncated example ---- */
    ok(g.includes('Мы говорим учителю правду.'),
        'говорить кому? что? is shown with a complete example');
    ok(/<b>говорить<\/b> <span>\+<\/span> <b[^>]*>кому\?<\/b> <span>\+<\/span> <b[^>]*>что\?<\/b>/.test(g),
        'and its own кому? + что? model');
    {
        const bare = g.replace(/Мы говорим учителю правду\./g, '');
        ok(!/Мы говорим учителю\./.test(bare),
            'the truncated «Мы говорим учителю.» is no longer a teaching example');
    }
    ok(g.includes('Мы говорим с учителем.'),
        'the кому?-vs-с кем? contrast is spelled out for the learner');

    /* ---- SOURCE FIX B: давай / давайте takes BOTH models ----
       The material printed a single bare formula, «Давай + fe'l!». A first pass
       corrected it by teaching only the «мы» form — an over-correction, because
       «Давай читать.» and «Давайте говорить по-русски.» are ordinary Russian.
       The contract below is positive on purpose: both models must be PRESENT
       and the text must say both are used. That catches a slide back toward
       either extreme without a brittle regex hunting for forbidden wording. */
    ok(/birgalikda biror ish qilishni taklif/.test(g),
        'давай / давайте is explained as proposing something done together');
    /* model 1 — infinitive */
    ok(/<b[^>]*>Давай \/ давайте<\/b> <span>\+<\/span> <b>infinitiv<\/b>/.test(g),
        'the давай + infinitive model is shown as its own scheme');
    ['Давай читать.', 'Давай смотреть фильм.', 'Давай работать вместе.',
     'Давайте говорить по-русски.']
        .forEach((x) => ok(g.includes(x), `the infinitive model is illustrated by «${x}»`));
    /* model 2 — the «мы» form */
    ok(/<b[^>]*>Давай \/ давайте<\/b> <span>\+<\/span> <b>birgalikdagi harakat shakli<\/b>/.test(g),
        'the давай + joint-action model is shown as its own scheme');
    ['Давай поговорим!', 'Давай встретимся!', 'Давай обсудим это!',
     'Давай позвоним ему!', 'Давайте поговорим.', 'Давайте встретимся завтра.']
        .forEach((x) => ok(g.includes(x), `the joint-action model keeps «${x}»`));
    ok(/поговорим, встретимся, обсудим, позвоним/.test(g),
        'and the actual «мы»-shaped forms are named');
    /* the lesson must SAY both are available, not merely print both */
    ok(/ikki xil tabiiy shaklda ishlatiladi/.test(g),
        'the block states there are two natural shapes');
    ok(/Ikkalasi ham to.g.ri\.<\/b>/.test(g), 'and that both of them are correct');
    ok(/infinitiv<\/b> ham, <b>«мы» shaklidagi fe.l<\/b> ham kelishi mumkin/.test(g),
        'the summary says an infinitive OR a «мы» form may follow давай');
    ok(/qat.iy qoida emas/.test(g),
        'and that the process/action split is guidance, not an absolute rule');
    /* THE OVER-CORRECTION MUST NOT RETURN: no claim that the infinitive is
       barred, and no claim that the verb is obliged to be a «мы» form. */
    ok(!/Har qanday fe.lni shunchaki/.test(g),
        'the false "not every verb may simply follow давай" restriction is gone');
    ok(!/shakl «мы» ga mos bo.lishi kerak/.test(g),
        'and so is the claim that the form MUST match «мы»');

    /* ---- SOURCE FIX C: «А ты как думаешь?» is a fixed phrase ---- */
    ok(g.includes('А ты как думаешь?'), 'the real phrase is taught');
    ok(!/А ты<\/b> \+ <b>как думаешь/.test(g) && !/А ты \+ как думаешь/.test(g),
        'the slot-formula «А ты + как думаешь?» does not appear');
    ok(/butun ibora sifatida eslab qolinadi/.test(g),
        'and it is explicitly called a whole phrase to memorise');
    ok(g.includes('— Я думаю, что это хорошая идея. А ты как думаешь?'),
        'the source dialogue example is kept');

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
    const a = t15.topic15Exercises.exercises.find((g) => g.id === 'audio');
    ok(!!a, 'the audio is its own step');
    eq('the source is the A2 lesson 15 recording',
        decodeURIComponent(a.audioSrc), 'audios/А2 15 урок.mp3');
    ok(!/\.\.\//.test(a.audioSrc), 'the path is course-relative');
    const f = path.join(ROOT, decodeURIComponent(a.audioSrc));
    ok(fs.existsSync(f), `the referenced mp3 exists on disk (${a.audioSrc})`);
    ok(fs.existsSync(f) && fs.statSync(f).size > 10000, 'and it is a real recording');
    ok(/Mening atrofimdagi odamlar/.test(a.title), 'the step carries the recording’s title');
    eq('the audio step is named, not numbered', a.stepName, 'Audio');
    ok(!a.passage, 'the audio step carries no passage');
    ok(!t15.topic15Exercises.exercises.some((g) => g.passage), 'no step carries a story text');
    /* The material has no transcript. None was written. */
    ok(!/Алина (живёт|работает|познакомилась|переехала)|Максим (сразу|стал)|Однажды/i.test(
        JSON.stringify(t15.topic15Exercises.exercises.filter((g) => g.id !== 'truefalse'))),
        'no narration was fabricated for the recording');
}

/* --------------------------------------------- 4. exercises + source keys */
const EXPECTED = [
    ['ex1', 'choice', 10], ['ex2', 'input', 10], ['ex3', 'choice', 10],
    ['ex4', 'choice', 10], ['ex5', 'input', 10], ['ex6', 'input', 10],
    ['ex7', 'choice', 10], ['ex8', 'input', 10], ['ex9', 'builder', 10],
    ['audio', 'reading', 0], ['truefalse', 'choice', 10]
];
{
    const groups = t15.topic15Exercises.exercises;
    ok(Array.isArray(groups), 'topic 15 uses the generic exercise shape');
    eq('eleven steps: nine drills, an audio and a comprehension check',
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
    /* NINE drills. The source stops at 9-mashq. */
    ok(!groups.some((g) => g.id === 'ex10'),
        'no tenth drill was invented to match the other lessons');

    const norm = (v) => String(v == null ? '' : v).toLowerCase().replace(/ё/g, 'е')
        .replace(/[.,!?;:()"'«»—–-]/g, ' ').replace(/\s+/g, ' ').trim();
    const acc = (it) => (Array.isArray(it.answer) ? it.answer : [it.answer])
        .filter((a) => String(a == null ? '' : a).trim() !== '');

    let multi = 0, open = 0, bad = 0;
    groups.forEach((g) => {
        (g.items || []).forEach((it, i) => {
            const w = `${g.id}#${i + 1}`;
            ok(typeof it.q === 'string' && it.q.trim() !== '', `${w} has a prompt`);
            if (it.free) { open++; eq(`${w} carries no key`, acc(it).length, 0); return; }
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
    eq('100 interactive questions in total', total, 100);
    eq('the nine drills carry 90 of them',
        groups.filter((g) => /^ex\d+$/.test(g.id)).reduce((s, g) => s + g.items.length, 0), 90);
    eq('the comprehension check carries the other 10',
        groups.find((g) => g.id === 'truefalse').items.length, 10);
    eq('exactly twenty open prompts', open, 20);
    console.log(`  9 drills + audio + comprehension · ${total} interactive`
        + ` (${open} open, ${multi} multi-accept)`);

    const byId = (id) => groups.find((g) => g.id === id);
    const first = (id) => byId(id).items.map((i) => (Array.isArray(i.answer) ? i.answer[0] : i.answer));
    const all = (id, n) => byId(id).items[n - 1].answer;

    /* ---- ex1: с / о, decided by the case that follows ---- */
    eq('ex1 keeps the source prompts', byId('ex1').items.map((i) => i.q).join(' | '),
        ['Я разговариваю ______ другом.', 'Мы часто говорим ______ нашей семье.',
         'Она общается ______ коллегами.', 'Я думаю ______ своей подруге.',
         'Он разговаривает ______ учителем.', 'Мы говорим ______ новом студенте.',
         'Она дружит ______ моей сестрой.', 'Я хочу поговорить ______ тобой.',
         'Они рассказывают ______ своих друзьях.',
         'Он часто встречается ______ братом.'].join(' | '));
    eq('ex1 keys', first('ex1').join(','), 'с,о,с,о,с,о,с,с,о,с');
    ok(byId('ex1').items.every((i) => i.options.join('|') === 'с|о'), 'ex1 offers с / о');

    /* ---- ex2: dative ---- */
    eq('ex2 keys', first('ex2').join(','),
        'маме,другу,учителю,сестре,подруге,брату,родителям,учителю,девушке,бабушке');
    ok(byId('ex2').items.every((i) => /\((мама|друг|учитель|сестра|подруга|брат|родители|девушка|бабушка)\)/.test(i.q)),
        'every ex2 prompt prints the nominative it is built from');
    ok(byId('ex2').items.every((i) => acc(i).every((a) => !/\s/.test(a.trim()))),
        'so the key is the single dative word, never a whole clause');

    /* ---- ex3: с кем? / кому? / о ком? ---- */
    eq('ex3 keys', first('ex3').join(' | '),
        ['с другом', 'маме', 'о преподавателе', 'сестре', 'с тобой', 'о своём брате',
         'с друзьями', 'другу', 'о своей работе', 'с коллегой'].join(' | '));
    eq('ex3 keeps the source’s own option pairs',
        byId('ex3').items.map((i) => i.options.join(' / ')).join(' | '),
        ['с другом / другу', 'с мамой / маме', 'о преподавателе / преподавателю',
         'сестре / с сестрой', 'с тобой / тебе', 'о своём брате / своему брату',
         'с друзьями / друзьям', 'другу / с другом', 'о своей работе / своей работе',
         'с коллегой / коллеге'].join(' | '));

    /* ---- ex4: нравится / нравятся ---- */
    eq('ex4 keys', first('ex4').join(','),
        'нравится,нравятся,нравится,нравятся,нравится,нравятся,нравится,нравятся,нравятся,нравится');
    ok(byId('ex4').items.every((i) => i.options.join('|') === 'нравится|нравятся'),
        'ex4 offers нравится / нравятся');
    /* the two infinitive prompts are the ones that catch a learner out */
    [3, 10].forEach((n) => ok(/общаться|разговаривать/.test(byId('ex4').items[n - 1].q)
        && byId('ex4').items[n - 1].answer === 'нравится',
        `ex4 #${n} is an infinitive, so it takes нравится`));

    /* =================== EX5 — OPEN =================== */
    eq('ex5 has ten questions', byId('ex5').items.length, 10);
    ok(byId('ex5').items.every((i) => i.free === true),
        'every ex5 item is open — the reason is the learner’s own');
    ok(byId('ex5').items.every((i) => acc(i).length === 0),
        'and none of them smuggles in a hidden key');
    eq('ex5 keeps the source sentence openings', byId('ex5').items.map((i) => i.q).join(' | '),
        ['Я часто звоню маме, потому что ...', 'Мне нравится мой друг, потому что ...',
         'Я люблю разговаривать с бабушкой, потому что ...',
         'Я часто встречаюсь с друзьями, потому что ...',
         'Я не люблю спорить, потому что ...',
         'Я общаюсь с коллегами, потому что ...',
         'Мне нравится этот человек, потому что ...',
         'Я хочу поговорить с ним, потому что ...',
         'Я часто пишу подруге, потому что ...',
         'Я люблю свою семью, потому что ...'].join(' | '));
    /* THE SCORER FIX: asking for the whole sentence is what makes a one-word
       reason survive the shared three-word minimum. */
    ok(/TO.LIQ gap/.test(byId('ex5').howTo),
        'ex5 asks for the WHOLE sentence, not just the words after потому что');
    ok(/boshlanishni ham ko.chiring/.test(byId('ex5').howTo),
        'and tells the learner to carry the opening across');
    ok(/kamida uch so.z/i.test(byId('ex5').howTo),
        'the how-to states the platform’s three-word minimum');
    ok(/Namuna/.test(byId('ex5').intro), 'samples are offered, labelled Namuna');
    ok(/Namunani ko.chirmang/.test(byId('ex5').intro),
        'and the learner is told not to copy them');
    {
        const UI = fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8');
        ok(/OPEN_ANSWER_MIN_WORDS\s*=\s*3/.test(UI),
            'the shared open-answer minimum is still 3 — topic 15 did not move it');
    }

    /* =================== EX6 — OPEN =================== */
    eq('ex6 has ten questions', byId('ex6').items.length, 10);
    ok(byId('ex6').items.every((i) => i.free === true),
        'every ex6 item is open — any of the three frames is correct');
    ok(byId('ex6').items.every((i) => acc(i).length === 0),
        'and none of them smuggles in a hidden key');
    eq('ex6 keeps the source statements', byId('ex6').items.map((i) => i.q).join(' | '),
        ['Дружба — это очень важно.', 'Этот человек добрый.',
         'Хорошие друзья всегда помогают.',
         'Нужно чаще разговаривать с родителями.',
         'Интернет помогает людям общаться.',
         'Спорить с друзьями — не всегда хорошо.',
         'У каждого человека должен быть хороший друг.',
         'Нужно уважать мнение других людей.', 'Семья очень важна.',
         'Хороший разговор помогает решить проблему.'].join(' | '));
    ['Я думаю, что', 'Я считаю, что', 'Мне кажется, что'].forEach((f) =>
        ok(byId('ex6').howTo.includes(f), `ex6 offers the frame «${f}...»`));
    ok(/istalganini tanlang/.test(byId('ex6').howTo),
        'and says any one of them may be chosen');
    ok(/qo.shilmasligingiz ham mumkin/.test(byId('ex6').intro),
        'the learner may also disagree with the statement');

    /* ---- ex7: situational replies, source key ---- */
    eq('ex7 keeps the source dialogues', byId('ex7').items.map((i) => i.q).join(' | '),
        ['— Привет! Как дела?', '— С кем ты сейчас разговариваешь?', '— Кому ты пишешь?',
         '— О ком вы говорите?', '— Ты согласна со мной?',
         '— Почему ты часто звонишь маме?', '— Тебе нравится твой новый коллега?',
         '— Давай сегодня встретимся!',
         '— Как ты думаешь, нужно часто общаться с родителями?',
         '— Почему ты не разговариваешь с ним?'].join(' | '));
    eq('ex7 source key', first('ex7').join(' | '),
        ['Спасибо, всё хорошо.', 'С моей сестрой.', 'Моей подруге.', 'О новом студенте.',
         'Да, я согласна с тобой.', 'Потому что я люблю с ней разговаривать.',
         'Да, он мне нравится.', 'Хорошая идея!', 'Да, я думаю, что это важно.',
         'Потому что я немного обиделась.'].join(' | '));
    ok(byId('ex7').items.every((i) => i.options.length === 3),
        'every ex7 item offers three options, as the source does');
    /* ---- SOURCE FIX D: the weak distractor is gone ---- */
    eq('ex7 #7 answers «Да, он мне нравится.»', all('ex7', 7), 'Да, он мне нравится.');
    ok(!byId('ex7').items[6].options.includes('Да, мне нравится он.'),
        'the defensible-under-stress distractor «Да, мне нравится он.» is gone');
    ok(!/Да, мне нравится он\./.test(JSON.stringify(byId('ex7'))),
        'and it is nowhere else in the exercise either');
    ok(byId('ex7').items[6].options.includes('Да, я нравится ему.'),
        'ex7 #7 uses an unequivocally ungrammatical distractor instead');
    eq('ex7 #7 keeps the source’s other two options',
        byId('ex7').items[6].options.slice(1).join(' | '),
        'Да, он мне нравится. | Да, я разговариваю с ним.');
    /* the other nine dialogues are untouched */
    eq('ex7 #1-#6 and #8-#10 keep the source options',
        [0, 1, 2, 3, 4, 5, 7, 8, 9].map((i) => byId('ex7').items[i].options.join('/')).join(' | '),
        ['Спасибо, всё хорошо./О своей семье./С другом.',
         'Другу./С моей сестрой./О сестре.',
         'Моей подруге./С моей подругой./О моей подруге.',
         'С преподавателем./Преподавателю./О новом студенте.',
         'Да, я согласна с тобой./Да, я звоню тебе./Да, я говорю о тебе.',
         'Потому что я люблю с ней разговаривать./С моей мамой./О моей маме.',
         'Хорошая идея!/О друзьях./Моему другу.',
         'Да, я думаю, что это важно./Да, с родителями./Да, родителям.',
         'Потому что я немного обиделась./С моим другом./О моём друге.'].join(' | '));

    /* ---- ex8: error correction ---- */
    eq('ex8 keeps the source’s wrong sentences', byId('ex8').items.map((i) => i.q).join(' | '),
        ['Я звоню с мамой.', 'Она разговаривает другу.', 'Мы говорим с новом учителе.',
         'Я согласна тебе.', 'Он помогает с сестрой.', 'Она думает о своему друге.',
         'Я общаюсь своим коллегой.', 'Мы рассказываем другу о наш преподаватель.',
         'Мне нравятся этот человек.', 'Мне нравится мои друзья.'].join(' | '));
    eq('ex8 canonical corrections lead', first('ex8').join(' | '),
        ['Я звоню маме.', 'Она разговаривает с другом.', 'Мы говорим о новом учителе.',
         'Я согласна с тобой.', 'Он помогает сестре.', 'Она думает о своём друге.',
         'Я общаюсь со своим коллегой.',
         'Мы рассказываем другу о нашем преподавателе.',
         'Мне нравится этот человек.', 'Мне нравятся мои друзья.'].join(' | '));
    /* ---- EX8 #3: the source does not say which meaning it meant ---- */
    ok(all('ex8', 3).some((a) => norm(a) === norm('Мы говорим о новом учителе.')),
        'ex8 #3 accepts «Мы говорим о новом учителе.»');
    ok(all('ex8', 3).some((a) => norm(a) === norm('Мы говорим с новым учителем.')),
        'ex8 #3 also accepts «Мы говорим с новым учителем.»');
    eq('ex8 #3 offers exactly those two repairs', all('ex8', 3).length, 2);
    eq('ex8 #3 is the only correction opened up',
        byId('ex8').items.filter((i) => i.answer.length > 1).length, 1);
    ok(byId('ex8').items.every((i, n) => n === 2 || acc(i).length === 1),
        'every other correction has exactly one right answer');

    /* ---- ex9: builder ---- */
    const b = byId('ex9');
    eq('ex9 keeps the source cues', b.items.map((i) => i.q).join(' | '),
        ['с / я / друзьями / общаюсь', 'маме / я / звоню / каждый день',
         'о / мы / говорим / работе', 'нравится / мне / этот / человек',
         'с / она / подругой / встречается', 'думаю / я / так / не',
         'согласен / я / тобой / с', 'поговорить / хочу / я / с / тобой',
         'друзьям / он / помогает / своим',
         'о / рассказывает / она / семье / своей'].join(' | '));
    eq('ex9 canonical sentences lead — the source word order', first('ex9').join(' | '),
        ['Я общаюсь с друзьями.', 'Я звоню маме каждый день.', 'Мы говорим о работе.',
         'Мне нравится этот человек.', 'Она встречается с подругой.',
         'Я так не думаю.', 'Я согласен с тобой.', 'Я хочу поговорить с тобой.',
         'Он помогает своим друзьям.',
         'Она рассказывает о своей семье.'].join(' | '));
    /* Every natural order the lesson deliberately supports. */
    [[1, 'С друзьями я общаюсь.'], [2, 'Я каждый день звоню маме.'],
     [2, 'Каждый день я звоню маме.'], [2, 'Маме я звоню каждый день.'],
     [3, 'О работе мы говорим.'], [4, 'Этот человек мне нравится.'],
     [5, 'С подругой она встречается.'], [6, 'Так я не думаю.'],
     [7, 'С тобой я согласен.'], [8, 'С тобой я хочу поговорить.'],
     [9, 'Своим друзьям он помогает.'], [10, 'О своей семье она рассказывает.']]
        .forEach(([n, variant]) => ok(all('ex9', n).some((a) => norm(a) === norm(variant)),
            `ex9 #${n} also accepts «${variant}»`));
    ok(b.items.every((i) => i.answer.length <= 4),
        'no builder item is opened up to an unbounded list of permutations');
    /* EVERY accepted variant must be a re-ordering of the SAME cards. If a
       variant added or dropped a word the builder would quietly become a
       translation exercise, and the card bank would stop matching the cue. */
    {
        const sbx = { window: {}, document: { createElement: () => ({ style: {}, appendChild() {} }) } };
        sbx.self = sbx; sbx.globalThis = sbx;
        vm.createContext(sbx);
        vm.runInContext(fs.readFileSync(path.join(ROOT, 'sentence-builder.js'), 'utf8'), sbx);
        const SB = sbx.window.UzSentenceBuilder;
        ok(!!SB, 'the shared sentence builder loads');
        const bag = (s) => SB.split(s, b.glue).map(norm).filter(Boolean).sort().join('|');
        b.items.forEach((it, i) => {
            const cue = it.q.split('/').map((t) => norm(t.trim())).filter(Boolean).sort().join('|');
            const sets = new Set(it.answer.map(bag));
            eq(`ex9 #${i + 1}: every accepted order uses one and the same token multiset`,
                sets.size, 1);
            eq(`ex9 #${i + 1}: those tokens are exactly the source cue`, [...sets][0], cue);
            eq(`ex9 #${i + 1}: the card bank has one card per cue word`,
                SB.bank(it, b).length, it.q.split('/').length);
        });
        eq('«каждый день» is glued into one card, as the source cue writes it',
            (b.glue || []).join(','), 'каждый день');
    }

    /* ---- comprehension ---- */
    eq('the comprehension keys carry the source semantics',
        byId('truefalse').items.map((i) => i.answer).join(','),
        'Правда,Ложь,Правда,Правда,Ложь,Правда,Ложь,Правда,Ложь,Правда');
    ok(byId('truefalse').items.every((i) => i.options.join('|') === 'Правда|Ложь'),
        'the comprehension check offers Правда / Ложь');
    /* Only the LABEL was normalised; which statement is true is the source's. */
    ok(!/Рост|Rost|Yolg/.test(JSON.stringify(byId('truefalse'))),
        'the source labels «Rost / Yolg‘on» do not reach the learner');
    eq('the ten statements are the source statements, verbatim',
        byId('truefalse').items.map((i) => i.q).join(' | '),
        ['Алина живёт в большом городе.', 'У Алины нет близких друзей.',
         'Алина каждое утро звонит маме.',
         'Алина и её мама часто разговаривают о семье и работе.',
         'Даша — новая коллега Алины.',
         'Алина любит гулять и разговаривать с Дашей.',
         'Максим сразу стал хорошим другом Алины.',
         'Алина и Максим вместе работали над одним проектом.',
         'Алина считает, что хорошие отношения не очень важны.',
         'Алина думает, что нужно уважать мнение других людей.'].join(' | '));
}

/* ------------------------------------------------------- 5. vocabulary */
{
    const VSRC = mainScript(fs.readFileSync(path.join(ROOT, 'paid-courses/a2-vocabulary.html'), 'utf8'));
    const all = literal(VSRC, 'vocabularyData').topics;
    const v = all.find((t) => t.id === 15);
    ok(!!v, 'vocabulary topic 15 exists');
    /* 96 rows listed, five of them exact repeats — the deck is 91. */
    eq('91 unique cards', v.words.length, 91);
    eq('no exact duplicate card',
        new Set(v.words.map((w) => w.ru.toLowerCase() + '||' + w.uz.toLowerCase())).size, 91);
    eq('no repeated russian side either',
        new Set(v.words.map((w) => w.ru.toLowerCase())).size, 91);
    ok(v.words.every((w) => w.ru && w.ru.trim() && w.uz && w.uz.trim()),
        'no card has an empty side');
    eq('the deck opens on «общение»', v.words[0].ru + ' — ' + v.words[0].uz,
        'общение — muloqot');
    eq('and closes on «Я тебя понимаю.»', v.words[90].ru + ' — ' + v.words[90].uz,
        'Я тебя понимаю. — Men seni tushunaman.');
    /* THE FIVE SOURCE REPEATS — each is listed twice in the material, once under
       a verb heading and once under a feelings heading. Exactly one card each. */
    ['понимать', 'помогать', 'поддерживать', 'уважать', 'доверять'].forEach((ru) =>
        eq(`«${ru}» is listed twice in the source and shipped once`,
            v.words.filter((w) => w.ru === ru).length, 1));
    /* Two DIFFERENT Russian units that share an Uzbek gloss are NOT duplicates. */
    [['приглашать', 'предлагать'], ['Как ты думаешь?', 'Что ты думаешь?'],
     ['Я думаю, что…', 'Мне кажется, что…']]
        .forEach(([a, c]) => ok(v.words.some((w) => w.ru === a) && v.words.some((w) => w.ru === c),
            `«${a}» and «${c}» are both kept — same gloss, different Russian`));
    /* the six source sections, in source order */
    const idx = (ru) => v.words.findIndex((w) => w.ru === ru);
    [['общение', 'отношения'], ['отношения', 'звонить'], ['звонить', 'любить'],
     ['любить', 'мнение'], ['мнение', 'Как ты думаешь?'],
     ['Как ты думаешь?', 'Я тебя понимаю.']]
        .forEach(([a, c]) => ok(idx(a) >= 0 && idx(c) > idx(a),
            `«${a}» comes before «${c}» — the source grouping is kept`));
    [['слышать', 'eshitmoq'], ['выражать мнение', 'fikr bildirmoq'],
     ['знакомая', 'tanish ayol'], ['партнёр', 'hamroh / sherik'],
     ['благодарить', 'minnatdorchilik bildirmoq'], ['переживать', 'tashvishlanmoq'],
     ['согласие', 'rozilik'], ['Не волнуйся.', 'Xavotir olma.']]
        .forEach(([ru, uz]) => ok(v.words.some((w) => w.ru === ru && w.uz === uz),
            `the card "${ru}" is present with its source translation`));
    ok(/\b15:\s*91\b/.test(SRC), 'the course card advertises 91 words for topic 15');
    ok(!/\b15:\s*96\b/.test(SRC), 'and not the raw 96 listed rows');
    eq('topics 1-14 vocabulary unchanged',
        [1,2,3,4,5,6,7,8,9,10,11,12,13,14].map((id) => all.find((t) => t.id === id).words.length).join(','),
        '45,77,73,106,50,69,85,85,50,69,70,55,80,60');
    eq('topic 16 ships its own deck now', ((all.find((t) => t.id === 16) || {}).words || []).length, 69);
}

/* ------------------------------- 6. it renders, grades and completes */
{
    const blocks = [...SRC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const pre = blocks.find((b) => /(let|var|const)\s+currentUser/.test(b) && !b.includes('const courseData'));
    const main = blocks.find((b) => b.includes('const courseData'));

    /* Ex5: the learner's own reason, written as the whole sentence. Deliberately
       NOT the samples in the intro. #1 is a ONE-WORD reason — the case the
       three-word minimum would have failed had the prompt asked only for the
       blank — and #2 is a long one, so two different shapes are proven. */
    const EX5 = [
        'Я часто звоню маме, потому что скучаю.',
        'Мне нравится мой друг, потому что он всегда меня слушает и понимает.',
        'Я люблю разговаривать с бабушкой, потому что она много знает.',
        'Я часто встречаюсь с друзьями, потому что с ними весело.',
        'Я не люблю спорить, потому что это портит отношения.',
        'Я общаюсь с коллегами, потому что мы работаем вместе.',
        'Мне нравится этот человек, потому что он честный.',
        'Я хочу поговорить с ним, потому что у нас есть проблема.',
        'Я часто пишу подруге, потому что она живёт далеко.',
        'Я люблю свою семью, потому что это самые близкие люди.'
    ];
    /* Ex6: all three frames are used, and #6 and #8 disagree with the statement,
       to prove no single frame and no single side is required. */
    const EX6 = [
        'Я думаю, что дружба — это очень важно.',
        'Мне кажется, что этот человек добрый.',
        'Я считаю, что хорошие друзья всегда помогают.',
        'Я думаю, что нужно чаще разговаривать с родителями.',
        'Мне кажется, что интернет помогает людям общаться.',
        'Я не согласна: я считаю, что спорить иногда полезно.',
        'Я думаю, что у каждого человека должен быть хороший друг.',
        'Мне кажется, что не всегда легко уважать чужое мнение.',
        'Я считаю, что семья очень важна.',
        'Я думаю, что хороший разговор помогает решить проблему.'
    ];
    const answerFor = (g, it, i) => (g.id === 'ex5' ? EX5[i] : g.id === 'ex6' ? EX6[i]
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
    const DONE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    const w = boot();

    w.__api.setCompleted(DONE.slice());
    w.eval('currentTopicId=15;');
    w.__api.loadLesson(15);
    const D = w.document;

    ok(!!w.__api.exData(t15), 'the generic engine claims topic 15');
    eq('eleven steps exist in the hidden bridge', D.querySelectorAll('[data-t1-ex]').length, 11);
    /* ex2, ex5, ex6, ex8 are text inputs; ex9 is a builder, which also renders
       one hidden input per item. */
    eq('fifty text inputs render across the four input steps and the builder',
        D.querySelectorAll('[data-t1-input]').length, 50);
    const lesson = (D.getElementById('lessonContent') || D.body).textContent;
    ok(/Мы говорим учителю правду/.test(lesson), 'the corrected grammar reaches the screen');
    ok(/Audio va tushunish savollari/.test(lesson), 'the lesson announces the listening step');

    let missing = 0;
    t15.topic15Exercises.exercises.forEach((g) => {
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
        await w.__api.check(15);
        const marked = D.querySelectorAll('.t1-opt.t1-ok').length
            + D.querySelectorAll('[data-t1-input].correct').length;
        const scoreText = (D.getElementById('scoreDisplay') || {}).textContent || '';
        ok(/\b100\s*\/\s*100\b/.test(scoreText),
            `a perfect paper is graded 100/100 (${scoreText.trim()})`);
        ok(marked >= 20, `the graded widgets mark themselves correct (${marked})`);

        /* Completion must go through the server, and unlock topic 16. */
        await w.__api.complete(15);
        await new Promise((r) => setTimeout(r, 150));
        eq('exactly one completion claim', w.__claims.length, 1);
        eq('the claim names course A2', w.__claims[0].c, 'A2');
        eq('the claim names topic 15', w.__claims[0].t, 15);
        ok(w.__api.getCompleted().includes(15), 'the server answer is adopted');
        ok(w.__safe.every((p) => !('completedTopics' in p)),
            'no completion field went through the generic saver');
        ok(!/saveUserProgress\([^)]*completedTopics/.test(SRC),
            'topic 15 introduced no direct authoritative write');

        /* A REFUSED server save must not unlock anything. */
        {
            const wf = boot();
            wf.eval('window.completeCourseTopic=async function(){throw new Error("offline");};');
            wf.__api.setCompleted(DONE.slice());
            wf.eval('currentTopicId=15;');
            wf.__api.loadLesson(15);
            try { await wf.__api.complete(15); } catch (e) { /* surfaced to the learner */ }
            await new Promise((r) => setTimeout(r, 120));
            ok(!wf.__api.getCompleted().includes(15),
                'a failed server save leaves topic 15 incomplete');
            ok(!wf.__api.getCompleted().includes(16), 'and topic 16 does not fake-unlock');
        }

        /* ---------- 7. THE STEPPING SESSION, not a long page ---------- */
        const w2 = boot();
        const D2 = w2.document;
        w2.__api.setCompleted(DONE.slice());
        w2.eval('currentTopicId=15;');
        w2.__api.loadLesson(15);
        w2.__api.render(15);
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
        eq('the first step is announced in Uzbek', stepText().trim(), 'Mashq 1 / 9');
        eq('exactly one exercise is on screen', titlesOnScreen(), 1);
        ok(/Kerakli predlogni qo‘ying/.test(host().textContent), 'step 1 is exercise 1');
        ok(!/Я звоню \(мама\)/.test(host().textContent), 'exercise 2 is NOT also on screen');
        ok(!host().querySelector('audio'), 'the audio player is NOT on screen yet');
        ok(/Javoblarni tekshirish/.test([...D2.querySelectorAll('.uz-foot button, .uz-btn')]
            .map((b) => b.textContent).join(' | ')), 'the check button is in Uzbek');

        const groups = t15.topic15Exercises.exercises;
        const seen = [];
        let multiOnScreen = 0, builderFilled = 0;
        for (let i = 0; i < groups.length; i++) {
            seen.push(stepText().trim());
            if (titlesOnScreen() > 1) multiOnScreen++;
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
                if (g.type === 'builder') {
                    /* A builder is graded from the CARDS the learner placed, not
                       from the hidden input, so the walk must actually place
                       them — through the component's own write(). */
                    w2.UzSentenceBuilder.write(host(), key, it.answer[0]);
                    if (w2.UzSentenceBuilder.read(host(), key).trim()) builderFilled++;
                    return;
                }
                const inp = host().querySelector(`[data-t1-input="${key}"]`);
                if (inp) {
                    inp.value = answerFor(g, it, k);
                    inp.dispatchEvent(new w2.Event('input', { bubbles: true }));
                }
            });
            if (g.id === 'ex5' || g.id === 'ex6') {
                ok(/Namuna/.test(host().textContent), `${g.id} offers its sample on screen`);
            }
            if (g.id === 'ex9') {
                ok(!!host().querySelector('.uzb'), 'ex9 renders the shared word-card builder');
                eq('every builder card row was assembled', builderFilled, 10);
            }
            if (g.id === 'audio') {
                const foot = [...D2.querySelectorAll('.uz-foot button, .uz-btn')]
                    .map((t) => t.textContent.trim());
                const audioEl = host().querySelector('audio');
                ok(!!audioEl, 'the audio step renders a player');
                ok(audioEl.hasAttribute('controls'), 'the player has controls');
                ok(!audioEl.hasAttribute('autoplay'), 'it does not autoplay');
                eq('the player preloads metadata only',
                    audioEl.getAttribute('preload'), 'metadata');
                const played = decodeURIComponent(
                    audioEl.querySelector('source').getAttribute('src') || '');
                ok(/audios\/А2 15 урок\.mp3$/.test(played),
                    `the player points at the A2 lesson 15 recording (${played})`);
                ok(!/Б2/.test(played), 'and not at a Б2 recording');
                ok(!/Алина живёт в большом городе/.test(host().textContent),
                    'the comprehension statements are NOT on the audio step');
                ok(!foot.some((t) => /tekshirish/i.test(t)),
                    'the audio step offers no check button');
                ok(!foot.some((t) => /qayta ishlash/i.test(t)), 'and no retry');
                eq('the audio step offers exactly one action', foot.length, 1);
                ok(/Savollarga/.test(foot[0] || ''), 'that action moves on to the questions');
            }
            if (g.id === 'truefalse') {
                ok(/Алина живёт в большом городе/.test(host().textContent),
                    'the comprehension questions are on their own step');
                ok(!host().querySelector('audio'),
                    'the player is not repeated on the questions step');
                eq('the comprehension step is a single step', titlesOnScreen(), 1);
                ok(!/Rost|Yolg/.test(host().textContent),
                    'and the source labels are nowhere on screen');
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
        eq('every one of the eleven steps was reached', seen.length, 11);
        eq('the cursor numbers the drills and names the rest', seen.join(' | '),
            [...Array.from({ length: 9 }, (_, i) => `Mashq ${i + 1} / 9`),
             'Audio', 'Audio bo‘yicha savollar'].join(' | '));

        /* ---------- 8. no second engine was written for topic 15 ---------- */
        ok(!/topic15(Active|Step|Custom|Navigation|Renderer|State|Wizard|Checker|Modal|Storage|Normalizer)/i.test(SRC),
            'topic 15 introduced no bespoke step/state/renderer machinery');
        ok(/window\.A2Host\.mountPractice/.test(SRC),
            'topic 15 goes through the shared A2 practice mount');
        eq('exactly one practice mount in the page',
            (SRC.match(/A2Host\.mountPractice\(/g) || []).length, 1);
        {
            const a = SRC.indexOf('topic15Exercises:');
            const b = SRC.indexOf('id: 16,', a);
            ok(!/function\s*\(|=>/.test(SRC.slice(a, b)), 'the topic 15 payload is data, not logic');
        }

        console.log('='.repeat(60));
        if (fail) {
            console.log(`  ❌ A2 TOPIC 15: ${fail} failed / ${pass + fail}\n`);
            failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
            console.log('='.repeat(60) + '\n');
            process.exit(1);
        }
        console.log(`  ✅ A2 TOPIC 15: ${pass}/${pass} passed`);
        console.log('='.repeat(60) + '\n');
    })();
}
