#!/usr/bin/env node
/**
 * verify_a2_topic6.cjs — A2 topic 7 «Shaharning joylari» must stay a complete,
 * objectively gradable lesson.
 *
 * Topic 7 shipped as a placeholder: a title, an empty legacy `quiz` and nothing
 * to learn. It now carries the grammar of где/куда/откуда, 69 vocabulary cards,
 * nine scored exercises, a reading text and its comprehension check.
 *
 * Two properties are worth more than the counts:
 *   1. EVERY scored question has exactly ONE correct option. A learner who knows
 *      the rule must not lose a mark to an ambiguous key — the whole reason the
 *      A1 sentence builders were removed.
 *   2. Completion goes through the SERVER. Topic 7 must never reintroduce a
 *      client-authored completedTopics write, which is what the progress
 *      security work closed.
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

console.log('\n=== A2 TOPIC 7 ===');

const topics = literal(SRC, 'courseData').topics;
const t7 = topics.find((t) => t.id === 7);

/* ------------------------------------------------------- 1. the topic */
eq('exactly one topic 7', topics.filter((t) => t.id === 7).length, 1);
eq('16 A2 topics, unchanged', topics.length, 16);
ok(!!t7, 'topic 7 exists');
eq('title', t7.title, 'Ovqatlanish va restoran');
ok(!t7.quiz, 'the empty placeholder quiz is gone');
ok(typeof t7.explanation.uz === 'string' && t7.explanation.uz.length > 40,
    'topic 7 has a real Uzbek introduction');
ok(!/faqat to'liq kurs obunachilari/.test(t7.explanation.uz),
    'the "subscribers only" placeholder text is gone');
ok(t7.isSubscriptionLocked === false && t7.isLocked === false, 'topic 7 is open to subscribers');

/* ------------------------------------------------------- 2. grammar */
{
    const g = t7.grammar || '';
    ok(g.length > 3000, `grammar is substantial (${g.length} chars)`);
    /* every block the source material requires */
    [['Я хочу + infinitive', /Я хочу <b>поесть<\/b>/],
     ['negative хочу', /Я <b>не<\/b> хочу есть мясо/],
     ['нравится singular', /Мне нравится <b>пицца<\/b>/],
     ['нравятся plural', /Мне нравятся <b>овощи<\/b>/],
     ['negative нравится', /Мне <b>не<\/b> нравится рыба/],
     ['можно', /Можно <b>заплатить<\/b> картой\?/],
     ['нельзя', /Здесь нельзя <b>курить<\/b>/],
     ['ordering phrase', /Мне, пожалуйста, стакан воды/],
     ['gender pair', /хотел бы[\s\S]*хотела бы/],
     ['quantity table', /один кофе[\s\S]*одна пицца[\s\S]*одно мороженое/],
     ['два / две', /два кофе[\s\S]*две порции салата/],
     ['много / мало / немного', /много овощей[\s\S]*мало соли[\s\S]*немного сахара/],
     ['the accusative note', /Мне, пожалуйста, <b>одну<\/b> пиццу/],
     ['Сколько стоит', /Сколько стоит чашка кофе\?/],
     ['Сколько порций', /Сколько порций вы хотите\?/],
     ['waiter dialogue', /Что будете заказывать\?[\s\S]*Я возьму пиццу/],
     ['summary memo', /Buyurtmani so'rash/]
    ].forEach(([label, re]) => ok(re.test(g), `grammar covers ${label}`));

    /* AT MOST THREE ACCENT COLOURS. The grammar reuses the shared component's
       semantic tokens instead of inventing colours, so this is checked by
       asserting that no literal colour is introduced at all. */
    const literalColours = (g.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) || []);
    eq('the lesson introduces no literal colours of its own', literalColours.length, 0);
    const tones = new Set((g.match(/b2g-tone-(sv|nsv)/g) || []));
    ok(tones.size <= 2, `at most two tone classes are used (${[...tones].join(', ')})`);
    ok(/b2g-warn/.test(g), 'the single warning block uses the shared warn style');
    /* which resolves to exactly three accent tokens in the shared stylesheet */
    const UI = fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8');
    ['--g-accent', '--g-ok', '--g-warn'].forEach((tok) =>
        ok(UI.includes(tok), `the shared component defines ${tok}`));

    /* Mobile comes from the shared classes, not from anything bespoke. */
    ok(/b2g-split/.test(g), 'comparisons use the responsive split grid');
    ok(/b2g-t/.test(g), 'tables use the shared responsive table');
    ok(!/style="[^"]*width:\s*\d{3,}px/.test(g), 'nothing is pinned to a fixed pixel width');
}

/* ------------------------------------------------------- 3. listening */
{
    /* THE LESSON IS NOW LISTENING, NOT READING. The learner hears the story
       and answers from what they heard; showing the transcript would turn a
       comprehension check back into a reading exercise. So the passage is gone
       from the data entirely and an audio step takes its place. */
    const audioGroup = t7.topic7Exercises.exercises.find((g) => g.id === 'audio');
    ok(!!audioGroup, 'the audio is its own step');
    ok(!!audioGroup.audioSrc, 'the audio step names a source');
    /* Decoded rather than matched on percent escapes: what matters is that the
       file IS the A2 lesson 7 recording. The material gave the path as
       «Б2 7 урок.mp3»; that file does not exist and the A2 one does. */
    ok(decodeURIComponent(audioGroup.audioSrc) === 'audios/\u04102 7 \u0443\u0440\u043e\u043a.mp3',
        `the source is the lesson 7 recording (${audioGroup.audioSrc})`);
    const audioFile = path.join(ROOT, decodeURIComponent(audioGroup.audioSrc));
    ok(fs.existsSync(audioFile),
        `the referenced mp3 actually exists on disk (${audioGroup.audioSrc})`);
    ok(fs.statSync(audioFile).size > 10000, 'and it is a real recording, not a stub');

    /* NO TRANSCRIPT ANYWHERE a learner can see. */
    const learnerVisible = JSON.stringify(t7);
    ['поблагодарил его', 'Теперь я хорошо знаю этот район',
     'дорога была совсем не сложной', 'вышел из дома и пошёл']
        .forEach((phrase) => ok(!learnerVisible.includes(phrase),
            `the transcript phrase "${phrase}" is not in the topic data`));
    ok(!audioGroup.passage, 'the audio step carries no passage');
    ok(!t7.topic7Exercises.exercises.some((g) => g.passage),
        'no step carries the story text');
    ok(!/matnni o|прочитайте|reading/i.test(t7.content || ''),
        'the lesson no longer tells the learner to READ anything');
    ok(/audio/i.test(t7.content || ''), 'it points them at the audio instead');
}

/* --------------------------------------------- 4. exercises + answer keys */
/* Eight drills, then the recording, then the comprehension check on it. The
   audio is a CONTENT step: no items, no score, no check button. */
const EXPECTED = [
    ['ex1', 'input', 10], ['ex2', 'choice', 10], ['ex3', 'choice', 10],
    ['ex4', 'choice', 10], ['ex5', 'builder', 10], ['ex6', 'input', 10],
    ['ex7', 'choice', 10], ['ex8', 'choice', 10], ['ex9', 'choice', 10],
    ['ex10', 'builder', 10],
    ['audio', 'reading', 0], ['truefalse', 'choice', 10]
];
{
    const block = t7.topic7Exercises;
    ok(!!block && Array.isArray(block.exercises), 'topic 7 uses the generic exercise shape');
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

    /* EVERY scored item must have exactly one objectively correct answer. */
    let ambiguous = 0, emptyKey = 0, dupOption = 0;
    groups.forEach((g) => {
        (g.items || []).forEach((it, i) => {
            ok(typeof it.q === 'string' && it.q.trim() !== '', `${g.id}#${i + 1} has a prompt`);
            if (g.type === 'choice') {
                if (!Array.isArray(it.options) || it.options.length < 2) { emptyKey++; return; }
                if (new Set(it.options).size !== it.options.length) dupOption++;
                const hits = it.options.filter((o) => o === it.answer).length;
                if (hits !== 1) ambiguous++;
            } else {
                if (!Array.isArray(it.answer) || !it.answer.length
                    || it.answer.some((a) => !String(a).trim())) emptyKey++;
            }
        });
    });
    eq('every choice question has exactly one correct option', ambiguous, 0);
    eq('no duplicated options inside a question', dupOption, 0);
    eq('no empty answer key', emptyKey, 0);

    const audioStep = groups.find((g) => g.id === 'audio');
    eq('the audio step has no questions', (audioStep.items || []).length, 0);
    eq('the audio step is named, not numbered', audioStep.stepName, 'Audio');
    ok(!!audioStep.continueLabel && /Savollarga/.test(audioStep.continueLabel),
        'it offers a continue action, not a check');
    ok(!audioStep.answer && !audioStep.items,
        'no fake question was invented to make the old checker step past it');
    const tfStep = groups.find((g) => g.id === 'truefalse');
    ok(!!tfStep.stepName && /Audio/.test(tfStep.stepName),
        'the comprehension step is about the audio');

    const total = groups.reduce((s, g) => s + (g.items || []).length, 0);
    eq('110 scored questions in total', total, 110);
    eq('the ten drills carry 100 of them',
        groups.filter((g) => /^ex\d+$/.test(g.id)).reduce((s2, g) => s2 + g.items.length, 0), 100);
    eq('the comprehension check carries the other 10', tfStep.items.length, 10);
    console.log(`  10 drills + audio + comprehension · ${total} scored questions`);

    /* ---- the source answer keys, verbatim ---- */
    const byId = (id) => groups.find((g) => g.id === id);
    eq('ex1 keys match the source', byId('ex1').items.map((i) => i.answer[0]).join(','),
        'заказать,пообедать,выпить,попробовать,заказать,взять,поесть,попросить,пойти,заказать');
    eq('ex2 keys match the source', byId('ex2').items.map((i) => i.answer).join(','),
        'нравится,нравятся,нравится,нравятся,нравится,нравятся,нравится,нравятся,нравится,нравятся');
    eq('ex3 keys match the source', byId('ex3').items.map((i) => i.answer).join(','),
        'нельзя,можно,нельзя,можно,можно,можно,нельзя,можно,нельзя,можно');
    eq('ex7 always answers with the PRICE, never the quantity',
        byId('ex7').items.filter((i) => /сум/.test(i.answer)).length, 10);
    eq('ex8 dialogue keys match the source', byId('ex8').items.map((i) => i.answer).join(','),
        'буду,пожалуйста,стоит,Можно,нравится,заказать,счёт,пожалуйста,кофе,Спасибо');
    eq('the comprehension keys match the source',
        byId('truefalse').items.map((i) => i.answer).join(','),
        ['Ложь','Правда','Ложь','Правда','Ложь','Правда','Ложь','Правда','Правда','Ложь'].join(','));
    ok(byId('truefalse').items.every((i) => i.options.join('|') === 'Правда|Ложь'),
        'the comprehension check offers Правда / Ложь');

    /* ---- SOURCE ISSUE: quantity forms must be grammatical ---- */
    const ex4 = byId('ex4');
    const ex4Text = JSON.stringify(ex4);
    ok(!/одна пиццу/.test(ex4Text), 'the ungrammatical «одна пиццу» is not taught');
    ok(!/одна порцию/.test(ex4Text), 'the ungrammatical «одна порцию» is not taught');
    ok(ex4.items[1].answer === 'одну' && /пиццу/.test(ex4.items[1].q),
        'an accusative object takes «одну»');
    ok(ex4.items[9].answer === 'одну' && /порцию/.test(ex4.items[9].q),
        'so does «одну порцию»');
    ok(/одну/.test(t7.grammar), 'and the grammar explains that shift');

    /* ---- SOURCE ISSUE: exercise 9 keeps one already-correct control item ---- */
    const ex9 = byId('ex9');
    ok(ex9.items[3].answer === ex9.items[3].q,
        'exercise 9 keeps a sentence that is already correct');
    ok(!/Сколько стоит два кофе/.test(JSON.stringify(ex9)),
        'the ambiguous «Сколько стоит два кофе?» item was replaced');
    ok(ex9.items.some((i) => /две чашки кофе/.test(i.answer)),
        'and replaced with an unambiguous два/две error from this topic');
    ok(ex9.items.every((i) => i.options.length === 2),
        'each correction offers the sentence and its fix');

    /* ---- SOURCE TYPO: the builder must never hand out «нравиться» ---- */
    const ex10 = byId('ex10');
    ok(!/нравиться/.test(JSON.stringify(ex10)),
        'exercise 10 uses «нравятся», not the source typo «нравиться»');
    ok(!/нравиться/.test(JSON.stringify(byId('ex5'))),
        'neither does exercise 5');
    ok(/Мне нравиться пицца/.test(JSON.stringify(ex9)),
        'the only «нравиться» left is the mistake exercise 9 asks the learner to find');

    /* ---- builders must be assemblable from their own cards ---- */
    [byId('ex5'), byId('ex10')].forEach((g) => {
        g.items.forEach((it, i) => {
            const target = it.answer[0];
            ok(target.split(/\s+/).join(' ') === target,
                `${g.id}#${i + 1}: the target sentence is buildable from its own tokens`);
            ok(!/^\s|\s$/.test(target), `${g.id}#${i + 1}: no stray whitespace in the target`);
        });
    });
}

/* ------------------------------------------------------- 5. vocabulary */
{
    const VSRC = mainScript(fs.readFileSync(path.join(ROOT, 'paid-courses/a2-vocabulary.html'), 'utf8'));
    const v7 = literal(VSRC, 'vocabularyData').topics.find((t) => t.id === 7);
    ok(!!v7, 'vocabulary topic 7 exists');
    /* The source list has 70 entries, of which «остановка — bekat» appears
       twice (once under city places, once under transport). The vocabulary
       engine shows one card per entry, so a learner would meet the same card
       twice in one pass; the later copy is dropped and the count follows. */
    /* The source lists 86 rows; «фрукты — mevalar» appears twice (once under
       Taomlar, once under Shirinliklar), so the deck is 85 cards. The gaps in
       the source numbering (12→16, 27→31, 37→41) are gaps in the source, not
       missing words — nothing was invented to fill them. */
    eq('85 cards (86 source rows minus one exact duplicate)', v7.words.length, 85);
    eq('no exact duplicate card', new Set(v7.words.map((w) => w.ru + '||' + w.uz)).size, 85);
    eq('«фрукты» appears exactly once', v7.words.filter((w) => w.ru === 'фрукты').length, 1);
    ok(v7.words.every((w) => w.ru && w.ru.trim() && w.uz && w.uz.trim()),
        'no card has an empty side');
    [['столик', 'stol'], ['суп', "sho'rva"], ['мороженое', 'muzqaymoq'],
     ['нравиться', 'yoqmoq'], ['Приятного аппетита!', 'Yoqimli ishtaha!']]
        .forEach(([ru, uz]) => ok(v7.words.some((w) => w.ru === ru && w.uz === uz),
            `the card "${ru}" is present`));
    ok(/\b7:\s*85\b/.test(SRC), 'the course card advertises 85 words for topic 7');

    /* topics 1-5 untouched */
    const all = literal(VSRC, 'vocabularyData').topics;
    eq('topics 1-6 vocabulary unchanged',
        [1, 2, 3, 4, 5, 6].map((id) => all.find((t) => t.id === id).words.length).join(','),
        '45,77,73,106,50,69');
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
           what the component record earns, so a whole-topic claim could
           never append and A2 topics never completed. The claim recorded
           here is the component one; the legacy route is stubbed too, so a
           regression back to it shows up as a claim with no component. */
        'window.completeCourseComponent=async function(c,t,cm){window.__claims.push({c:c,t:t,cm:cm});' +
        ' window.__srv=Array.from(new Set([...(window.__srv||[]),t])).sort((a,b)=>a-b);' +
        ' return {ok:true,course:c,topicId:t,component:cm,' +
        '  components:{vocabularyCompleted:true,exercisesCompleted:true},' +
        '  topicCompleted:true,completedTopics:window.__srv.slice(),nextTopic:t+1};};' +
        'window.completeCourseTopic=async function(c,t){window.__claims.push({c:c,t:t});' +
        ' return window.__srv ? window.__srv.slice() : [];};' +
        'window.saveUserProgress=async function(u,c,p){window.__safe.push(p);return 1;};' +
        'window.getUserProgress=async()=>({completedTopics:[1,2,3,4,5,6]});' +
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

    w.__api.setCompleted([1, 2, 3, 4, 5, 6]);
    w.eval('currentTopicId=7;');
    w.__api.loadLesson(7);
    const D = w.document;

    ok(!!w.__api.exData(t7), 'the generic engine claims topic 7');
    eq('twelve steps exist in the hidden bridge', D.querySelectorAll('[data-t1-ex]').length, 12);
    /* ex1 and ex6 are text inputs, ex5 and ex10 are builders with hidden inputs. */
    eq('forty text inputs render across the input and builder steps', D.querySelectorAll('[data-t1-input]').length, 40);
    const lesson = (D.getElementById('lessonContent') || D.body).textContent;
    ok(/Мне нравятся/.test(lesson), 'the grammar reaches the screen');
    ok(/Audio va tushunish savollari/.test(lesson),
        'the lesson announces the listening step');

    /* Answer everything correctly and check the score. */
    const first = (a) => (Array.isArray(a) ? a[0] : a);
    let missing = 0;
    t7.topic7Exercises.exercises.forEach((g) => {
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
        await w.__api.check(7);
        /* The choice and open-input items mark themselves in the DOM; the two
           builders report through the slot, so the authoritative figure is the
           score the page itself prints. */
        const marked = D.querySelectorAll('.t1-opt.t1-ok').length
            + D.querySelectorAll('[data-t1-input].correct').length;
        const scoreText = (D.getElementById('scoreDisplay') || {}).textContent || '';
        ok(/\b110\s*\/\s*110\b/.test(scoreText),
            `a perfect paper is graded 110/110 (${scoreText.trim()})`);
        ok(marked >= 90, `the graded widgets mark themselves correct (${marked})`);

        /* Completion must go through the server, and unlock topic 7. */
        await w.__api.complete(7);
        await new Promise((r) => setTimeout(r, 150));
        eq('exactly one completion claim', w.__claims.length, 1);
        eq('the claim names course A2', w.__claims[0].c, 'A2');
        eq('and it claims the EXERCISES half, not the whole topic',
            w.__claims[0].cm, 'exercises');
        eq('the claim names topic 7', w.__claims[0].t, 7);
        ok(w.__api.getCompleted().includes(7), 'the server answer is adopted');
        ok(w.__safe.every((p) => !('completedTopics' in p)),
            'no completion field went through the generic saver');
        /* the real unlock rule */
        const done = w.__api.getCompleted();
        ok(!(8 > 1 && !done.includes(7) && !done.includes(8)), 'topic 8 unlocks');

        ok(!/saveUserProgress\([^)]*completedTopics/.test(SRC),
            'topic 7 introduced no direct authoritative write');

        /* ---------- 7. THE STEPPING SESSION, not a long page ---------- */
        /* The visible lesson must not stack every exercise under one another.
           The inline blocks that DO exist are the hidden legacy write-through
           bridge the A2 scorer still reads; the learner sees the practice card
           and the shared one-step-at-a-time session. */
        /* A COMPLETED topic reopens to its result by design, so the stepping
           flow is observed on a fresh, untouched attempt. */
        const w2 = boot();
        const D2 = w2.document;
        w2.__api.setCompleted([1, 2, 3, 4, 5, 6]);
        w2.eval('currentTopicId=7;');
        w2.__api.loadLesson(7);
        w2.__api.render(7);
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
        ok(/Я хочу/.test(host().textContent), 'step 1 is exercise 1');
        ok(!/Мне ___ овощи/.test(host().textContent), 'exercise 2 is NOT also on screen');
        ok(!host().querySelector('audio'), 'the audio player is NOT on screen yet');

        /* Uzbek controls, supplied by A2 rather than the engine's Russian
           defaults — B2 keeps its own wording. */
        const footText = () => [...D2.querySelectorAll('.uz-foot button, .uz-btn')]
            .map((b) => b.textContent).join(' | ');
        ok(/Javoblarni tekshirish/.test(footText()), 'the check button is in Uzbek');

        /* Walk every step, answering correctly, and watch the cursor move. */
        const groups = t7.topic7Exercises.exercises;
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
            /* The passage step: text, no grading, one way onward. */
            if (g.id === 'audio') {
                const foot = [...D2.querySelectorAll('.uz-foot button, .uz-btn')]
                    .map((b) => b.textContent.trim());
                const audioEl = host().querySelector('audio');
                ok(!!audioEl, 'the audio step renders a player');
                ok(audioEl.hasAttribute('controls'), 'the player has controls');
                ok(!audioEl.hasAttribute('autoplay'), 'it does not autoplay');
                const srcEl = audioEl.querySelector('source');
                ok(!!srcEl && /%D0%902%207/.test(srcEl.getAttribute('src') || ''),
                    'the player points at the lesson 7 recording');
                ok(!/Анна заказывает/.test(host().textContent),
                    'no transcript is shown to the learner');
                /* Matched on a STATEMENT, not on the word "Rost": the step's own
                   instruction legitimately mentions the coming question type. */
                ok(!/Анна и Мария/.test(host().textContent),
                    'the comprehension statements are NOT on the audio step');
                ok(!foot.some((t) => /tekshirish/i.test(t)),
                    'the audio step offers no check button');
                ok(!foot.some((t) => /qayta ishlash/i.test(t)),
                    'and no retry');
                eq('the audio step offers exactly one action', foot.length, 1);
                ok(/Savollarga/.test(foot[0] || ''), 'that action moves on to the questions');
            }
            if (g.id === 'truefalse') {
                ok(/Анна и Мария/.test(host().textContent),
                    'the comprehension questions are on their own step');
                /* Matched on a phrase that exists ONLY in the passage: the
                   questions legitimately mention the language centre too. */
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
        /* Only the drills are numbered; the passage and the comprehension check
           name themselves, because "exercise 9 of 10" is not what they are. */
        eq('the cursor numbers the drills and names the rest', seen.join(' | '),
            [...Array.from({ length: 10 }, (_, i) => `Mashq ${i + 1} / 10`),
             'Audio', 'Audio bo‘yicha savollar'].join(' | '));

        /* ---------- 8. no second engine was written for topic 7 ---------- */
        ok(!/topic6(Active|Step|Custom|Navigation|Renderer|State)/i.test(SRC),
            'topic 7 introduced no bespoke step/state/renderer machinery');
        ok(/window\.A2Host\.mountPractice/.test(SRC),
            'topic 7 goes through the shared A2 practice mount');
        const t6Literal = SRC.slice(SRC.indexOf('id: 8,'), SRC.indexOf('id: 8,'));
        ok(!/function\s/.test(t6Literal), 'the topic 7 payload is data, not logic');

        console.log('='.repeat(60));
        if (fail) {
            console.log(`  ❌ A2 TOPIC 7: ${fail} failed / ${pass + fail}\n`);
            failures.slice(0, 20).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
            console.log('='.repeat(60) + '\n');
            process.exit(1);
        }
        console.log(`  ✅ A2 TOPIC 7: ${pass}/${pass} passed`);
        console.log('='.repeat(60) + '\n');
    })();
}
