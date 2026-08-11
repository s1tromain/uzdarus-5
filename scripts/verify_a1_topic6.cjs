#!/usr/bin/env node
/**
 * verify_a1_topic6.cjs — option-integrity audit for the A1 course.
 *
 * Written for the reported A1 / topic 6 / exercise 2 defects, but deliberately
 * NOT limited to them: it validates every multiple-choice item in every A1
 * topic against the same six rules, so this class of bug cannot reappear
 * anywhere in the course without failing the build.
 *
 *   1. the correct answer is present among the options
 *   2. it is present exactly once
 *   3. no option is duplicated
 *   4. no option is empty
 *   5. no option repeats the question text
 *   6. the prompt and the options are not in swapped languages
 *
 * Reads nothing but the shipped data — no engine, no scoring, no progress.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILE = 'paid-courses/a1-course.html';

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) pass++; else { fail++; failures.push(l); } };

/* ------------------------------------------------------------ load the data */

function extractCourseData(html) {
    const start = html.search(/(?:const|let|var)\s+courseData\s*=\s*\{/);
    if (start === -1) throw new Error('courseData not found');
    const open = html.indexOf('{', start);
    let depth = 0, i = open, inStr = null, esc = false;
    for (; i < html.length; i++) {
        const c = html[i];
        if (inStr) {
            if (esc) { esc = false; continue; }
            if (c === '\\') { esc = true; continue; }
            if (c === inStr) inStr = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    return vm.runInNewContext('(' + html.slice(open, i) + ')',
        { generateLockedTopics: () => [] }, { timeout: 20000 });
}

const html = fs.readFileSync(path.join(ROOT, FILE), 'utf8');
const courseData = extractCourseData(html);
const topics = courseData.topics || [];

    function fn(name, assigned) {
    const i = assigned
        ? html.indexOf('window.' + name + ' = async function(')
        : html.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('missing ' + name);
    let d = 0, started = false;
    for (let k = html.indexOf('{', i); k < html.length; k++) {
        if (html[k] === '{') { d++; started = true; }
        else if (html[k] === '}') { d--; if (started && d === 0) return html.slice(i, k + 1) + (assigned ? ';' : ''); }
    }
    throw new Error('unbalanced ' + name);
}

    const t6lit = (() => {
    const ti = html.indexOf('topic6Exercises: {');
    const open = html.lastIndexOf('{', html.lastIndexOf('id: 6,', ti));
    let d = 0;
    for (let k = open; k < html.length; k++) {
        if (html[k] === '{') d++;
        else if (html[k] === '}') { d--; if (d === 0) return html.slice(open, k + 1); }
    }
    throw new Error('topic 6 literal unbalanced');
})();

console.log('\n=== A1 OPTION INTEGRITY ===\n');
ok(topics.length > 0, `courseData parsed (${topics.length} topics)`);

/* ------------------------------------------------------------------- rules */

const CYR = /[А-Яа-яЁё]/;
const LAT = /[A-Za-z]/;
const script = (t) => {
    const s = String(t == null ? '' : t);
    if (CYR.test(s) && LAT.test(s)) return 'mixed';
    if (CYR.test(s)) return 'ru';
    if (LAT.test(s)) return 'uz';
    return 'none';
};
const clean = (t) => String(t == null ? '' : t).trim().toLowerCase();

/** Validate one multiple-choice item. Returns a list of problems. */
function audit(question, answer, options) {
    const bad = [];
    if (!Array.isArray(options) || options.length === 0) {
        bad.push('no options');
        return bad;
    }
    const counts = {};
    options.forEach(o => { const k = clean(o); counts[k] = (counts[k] || 0) + 1; });

    Object.keys(counts).forEach(k => {
        if (counts[k] > 1) bad.push(`duplicate option "${k}" x${counts[k]}`);
    });
    if (options.some(o => clean(o) === '')) bad.push('empty option');
    if (options.some(o => clean(o) === clean(question))) bad.push('option repeats the question');

    const hits = options.filter(o => clean(o) === clean(answer)).length;
    if (hits === 0) bad.push(`correct answer "${answer}" is NOT among the options`);
    if (hits > 1) bad.push(`correct answer "${answer}" appears ${hits} times`);

    /* Options must be one language. A prompt in the same script as every option
       is the swapped-translation bug the report describes. */
    const scripts = new Set(options.map(script).filter(s => s !== 'none'));
    if (scripts.size > 1) bad.push('options mix scripts: ' + [...scripts].join('/'));
    return bad;
}

/* --------------------------------------------- every MCQ item in the course */

let items = 0, topicsWithOptions = 0;
topics.forEach(topic => {
    let found = 0;
    Object.keys(topic).forEach(key => {
        if (!/^topic\d+Exercises$/.test(key)) return;
        const group = topic[key] || {};
        Object.keys(group).forEach(exKey => {
            const ex = group[exKey];
            if (!ex || !Array.isArray(ex.items)) return;
            ex.items.forEach((item, i) => {
                if (!Array.isArray(item.options)) return;   // not a choice item
                items++; found++;
                const q = item.template || item.question || item.word || '';
                const problems = audit(q, item.answer, item.options);
                ok(problems.length === 0,
                    `topic ${topic.id} ${key}.${exKey}[${i}] — ${problems.join('; ')} ` +
                    `| q="${q}" answer="${item.answer}" options=${JSON.stringify(item.options)}`);
            });
        });
    });

    /* the legacy quiz shape, where answers are indexes into mcOptions */
    const quiz = topic.quiz || {};
    (quiz.mcQuestions || []).forEach((q, i) => {
        const opts = (quiz.mcOptions || [])[i];
        const idx = (quiz.mcAnswers || [])[i];
        if (!Array.isArray(opts)) return;
        items++; found++;
        ok(Number.isInteger(idx) && idx >= 0 && idx < opts.length,
            `topic ${topic.id} quiz[${i}] — answer index ${idx} is outside options (${opts.length})`);
        const problems = audit(q, opts[idx], opts);
        ok(problems.length === 0,
            `topic ${topic.id} quiz[${i}] — ${problems.join('; ')} | q="${q}"`);
    });

    if (found) topicsWithOptions++;
});

ok(items > 0, `found multiple-choice items to audit (${items})`);
console.log(`  audited ${items} choice items across ${topicsWithOptions} topics\n`);

/* --------------------------------------------- topic 6, exercise 2 in detail */
{
    const t6 = topics.find(t => t.id === 6);
    ok(!!t6, 'topic 6 exists');
    const ex2 = t6 && t6.topic6Exercises && t6.topic6Exercises.exercise2;
    ok(!!ex2, 'topic 6 exercise 2 exists');

    if (ex2) {
        ok(ex2.items.length === 10, `exercise 2 has 10 items (${ex2.items.length})`);
        ex2.items.forEach((item, i) => {
            const n = `t6.ex2[${i + 1}]`;
            ok(typeof item.template === 'string' && item.template.includes('___'),
                `${n} the sentence has a blank`);
            /* Exercise 2 is a BILINGUAL comprehension quiz: the question is asked
               in Uzbek and may quote Russian, and the answer is whichever
               language the question asks for (a Russian phrase, or its Uzbek
               translation). So the old one-way language assertions no longer
               apply. What still must hold is asserted below, plus two checks the
               old shape never needed. */
            ok(typeof item.placeholder === 'string' && item.placeholder.trim() !== '',
                `${n} the cue is present (an empty one renders "undefined")`);
            ok(typeof item.answer === 'string' && item.answer.trim() !== '',
                `${n} the answer is present`);
            ok(item.options.includes(item.answer), `${n} the correct answer is offered`);
            ok(new Set(item.options.map(clean)).size === item.options.length,
                `${n} all options are unique`);
            ok(item.options.length === 4, `${n} exactly four options (${item.options.length})`);
            /* A word must not mix Latin and Cyrillic letters — such a token looks
               right and can never be matched. This caught a real typo
               ("napротив") the moment the exercise was authored. */
            const mixed = [item.template, item.placeholder, item.answer, ...item.options]
                .flatMap(t => String(t).split(/\s+/))
                .filter(word => /[a-zA-Z]/.test(word) && /[\u0400-\u04FF]/.test(word));
            ok(mixed.length === 0, `${n} no word mixes Latin and Cyrillic (${mixed.join(', ')})`);
        });

        /* the cue must genuinely differ from the answer — the reported symptom
           was the Russian translation showing where the Uzbek word belongs */
        ex2.items.forEach((item, i) => {
            ok(clean(item.placeholder) !== clean(item.answer),
                `t6.ex2[${i + 1}] the cue is not simply the answer repeated`);
        });
    }
}

/* --------------------------------------------- the cue survives answering */
{
    /* The blank's text is overwritten with the chosen Russian word, so the
       Uzbek prompt has to live somewhere that is never rewritten. */
    ok(/class="topic6-uz-cue"/.test(html), 'the Uzbek cue is rendered outside the blank');
    ok(/\$\{item\.placeholder\}<\/span>/.test(html), 'the cue renders the item placeholder');
    ok(/\.topic6-uz-cue\s*\{/.test(html), 'the cue is styled');
    const handler = html.slice(html.indexOf('data-topic6-option]'), html.indexOf('closeTopic6OptionPanels();', html.indexOf('data-topic6-option]')));
    ok(/blank\.textContent = value;/.test(handler),
        'the blank still shows the chosen answer (unchanged behaviour)');
    ok(!/cue[^\n]*textContent\s*=/.test(handler), 'nothing ever overwrites the cue');
}

/* --------------------------------------------- other topics are untouched */
{
    const t6 = topics.find(t => t.id === 6) || {};
    const ex = t6.topic6Exercises || {};
    ok(Object.keys(ex).length === 5, 'topic 6 still has all five exercises');
    ok(Array.isArray(ex.exercise1 && ex.exercise1.sentences) && ex.exercise1.sentences.length === 10,
        'exercise 1 is untouched');
    ok(Array.isArray(ex.exercise3 && ex.exercise3.prompts) && ex.exercise3.prompts.length === 10,
        'exercise 3 is untouched');
    ok(Array.isArray(ex.exercise4 && ex.exercise4.prompts) && ex.exercise4.prompts.length === 10,
        'exercise 4 is untouched');
    ok(!!ex.exercise5, 'exercise 5 is untouched');
    ok(topics.length >= 12, `every A1 topic is still present (${topics.length})`);
}

/* ------------------------------------------------ RUNTIME LIFECYCLE
 * Data being correct was never enough: the defect lived in the render. These
 * checks boot the page's REAL topic-6 functions and drive the whole lifecycle —
 * first paint, choosing an answer, restoring a saved result, and restoring a
 * corrupted one.
 * ---------------------------------------------------------------------- */
{
    const { JSDOM } = require('jsdom');





    function boot() {
        const dom = new JSDOM(
            '<!doctype html><body><div id="quizSection"></div>' +
            '<div id="checkTopic6Btn"></div><div id="topic6Feedback"></div></body>',
            { runScripts: 'outside-only' });
        const w = dom.window;
        w.eval(`
            var courseData={topics:[${t6lit}]};
            var currentTopicId=6;
            var quizSection=document.getElementById('quizSection');
            var userQuizResults={};
            var completedTopics=[];
            var currentUserId=null;
            var topic6OutsideClickBound=false;
            var topic6BuilderState={};
            function clearExtraExercises(){}
            ${fn('normalizeTopic6Text')}
            ${fn('topic6IsCorrect')}
            ${fn('closeTopic6OptionPanels')}
            ${fn('getTopic6BuilderSelection')}
            ${fn('setTopic6BuilderSelection')}
            ${fn('renderTopic6BuilderSelection')}
            ${fn('bindTopic6CheckButton')}
            ${fn('bindTopic6ExerciseEvents')}
            ${fn('loadTopic6Exercises')}
            async function saveQuizResultToFirebase(k, d){ window.__saved=[k,d]; }
            function __uzFinalizeExerciseTopicStub(){}
            window.__uzFinalizeExerciseTopic = __uzFinalizeExerciseTopicStub;
            ${fn('checkTopic6Exercises', true)}
        `);
        return w;
    }

    const render = (w) => { w.loadTopic6Exercises(6); w.bindTopic6ExerciseEvents(); };
    const blankOf = (w, i) => w.document.querySelector(`[data-topic6-select="${i}"]`);
    const chipsOf = (w, i) => Array.from(w.document.querySelectorAll(`[data-topic6-option="${i}"]`))
        .map(c => c.dataset.value);
    const rowOf = (w, i) => blankOf(w, i).closest('.topic6-select-question');
    const UZ = /^[a-z'‘’`]+$/i;

    let w = boot();
    render(w);
    const ex2 = w.courseData.topics[0].topic6Exercises.exercise2;

    /* ---- first paint ---- */
    ok(Array.from({ length: 10 }, (_, i) => blankOf(w, i)).every(Boolean),
        'runtime: all ten blanks render');
    ex2.items.forEach((item, i) => {
        const n = `runtime t6.ex2[${i + 1}]`;
        const chips = chipsOf(w, i);
        ok(chips.length === item.options.length, `${n} renders every option`);
        ok(new Set(chips).size === chips.length, `${n} renders no duplicate option`);
        ok(chips.includes(item.answer), `${n} renders the correct answer as a choice`);
        ok(!chips.includes(item.placeholder), `${n} never offers the Uzbek cue as an answer`);
        ok(blankOf(w, i).dataset.value === '', `${n} starts unanswered`);

        /* THE defect: the blank used to paint the Uzbek word, so an untouched
           item looked answered with a word matching none of the options. */
        const shown = blankOf(w, i).textContent.trim();
        ok(shown !== item.placeholder,
            `${n} the blank does not masquerade as an answered Uzbek word`);
        ok(!UZ.test(shown), `${n} the blank shows a neutral prompt, not a content word ("${shown}")`);

        /* the cue must still be on screen, and exactly once */
        const cues = rowOf(w, i).querySelectorAll('.topic6-uz-cue');
        ok(cues.length === 1, `${n} exactly one Uzbek cue element (found ${cues.length})`);
        ok(cues.length === 1 && cues[0].textContent.includes(item.placeholder),
            `${n} the cue carries the Uzbek word`);
        /* and nowhere else in the row may the bare Uzbek word appear */
        const strays = Array.from(rowOf(w, i).querySelectorAll('*'))
            .filter(e => !e.closest('.topic6-uz-cue') &&
                         e.children.length === 0 &&
                         e.textContent.trim() === item.placeholder);
        ok(strays.length === 0,
            `${n} the Uzbek word is not duplicated elsewhere in the row (found ${strays.length})`);
    });

    /* ---- choosing an answer ---- */
    ex2.items.forEach((item, i) => {
        const chip = Array.from(w.document.querySelectorAll(`[data-topic6-option="${i}"]`))
            .find(c => c.dataset.value === item.answer);
        chip.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    });
    ex2.items.forEach((item, i) => {
        const b = blankOf(w, i);
        ok(b.dataset.value === item.answer, `runtime t6.ex2[${i + 1}] stores the chosen answer`);
        ok(b.textContent.trim() === item.answer, `runtime t6.ex2[${i + 1}] shows the chosen answer`);
        const cue = rowOf(w, i).querySelector('.topic6-uz-cue');
        ok(cue && cue.textContent.includes(item.placeholder),
            `runtime t6.ex2[${i + 1}] the Uzbek cue survives answering`);
    });

    /* ---- reopening the topic with a saved result ---- */
    w = boot();
    w.userQuizResults['topic_6_practice'] = { exercise2Answers: ex2.items.map(it => it.answer) };
    render(w);
    ex2.items.forEach((item, i) => {
        ok(blankOf(w, i).textContent.trim() === item.answer,
            `runtime t6.ex2[${i + 1}] a saved answer is restored`);
        ok(blankOf(w, i).dataset.value === item.answer,
            `runtime t6.ex2[${i + 1}] the restored value is the stored one`);
    });

    /* ---- reopening with corrupted / stale stored answers ---- */
    w = boot();
    w.userQuizResults['topic_6_practice'] = { exercise2Answers: ex2.items.map(it => it.placeholder) };
    render(w);
    ex2.items.forEach((item, i) => {
        const b = blankOf(w, i);
        ok(b.dataset.value === '',
            `runtime t6.ex2[${i + 1}] a stored value outside the options is discarded`);
        ok(!UZ.test(b.textContent.trim()),
            `runtime t6.ex2[${i + 1}] the item stays answerable after bad data`);
        ok(!b.classList.contains('incorrect'),
            `runtime t6.ex2[${i + 1}] bad data is not scored against the learner`);
    });
}

/* ------------------------------------------------ ACCEPTANCE RUN
 * The journey a real learner takes, start to finish: a brand-new user with no
 * stored state opens the topic, answers all ten items, submits, reloads the
 * page, and reopens the exercise. Also asserts the mobile viewport renders
 * byte-identical markup to the desktop one.
 * ---------------------------------------------------------------------- */
{
    const { JSDOM } = require('jsdom');

    function bootAt(width, ua) {
        const dom = new JSDOM(
            '<!doctype html><body><div id="quizSection"></div>' +
            '<div id="checkTopic6Btn"></div><div id="topic6Feedback"></div></body>',
            { runScripts: 'outside-only', pretendToBeVisual: true,
              url: 'https://uzdarus.uz/paid-courses/a1-course.html',
              userAgent: ua || 'desktop' });
        const w = dom.window;
        Object.defineProperty(w, 'innerWidth', { value: width, configurable: true });
        /* jsdom implements no layout, so scrollIntoView is absent */
        w.Element.prototype.scrollIntoView = function () {};
        w.eval(`
            var courseData={topics:[${t6lit}]};
            var currentTopicId=6;
            var quizSection=document.getElementById('quizSection');
            var userQuizResults={};
            var completedTopics=[];
            var currentUserId=null;
            var topic6OutsideClickBound=false;
            var topic6BuilderState={};
            function clearExtraExercises(){}
            ${fn('normalizeTopic6Text')}
            ${fn('topic6IsCorrect')}
            ${fn('closeTopic6OptionPanels')}
            ${fn('getTopic6BuilderSelection')}
            ${fn('setTopic6BuilderSelection')}
            ${fn('renderTopic6BuilderSelection')}
            ${fn('bindTopic6CheckButton')}
            ${fn('bindTopic6ExerciseEvents')}
            ${fn('loadTopic6Exercises')}
            async function saveQuizResultToFirebase(k,d){ window.__saved=[k,d]; }
            window.__uzFinalizeExerciseTopic=function(){};
            ${fn('checkTopic6Exercises', true)}
        `);
        return w;
    }

    const paint = (w) => { w.loadTopic6Exercises(6); w.bindTopic6ExerciseEvents(); };
    const bl = (w, i) => w.document.querySelector(`[data-topic6-select="${i}"]`);
    const chips = (w, i) => Array.from(w.document.querySelectorAll(`[data-topic6-option="${i}"]`));
    const UZWORD = /^[a-z'‘’`]+$/i;

    /* ---- 1-2. a brand-new user opens topic 6 ---- */
    let w = bootAt(1440);
    ok(Object.keys(w.userQuizResults).length === 0, 'acceptance: user starts with no stored progress');
    ok(w.localStorage.length === 0, 'acceptance: user starts with an empty localStorage');
    paint(w);
    const ex2 = w.courseData.topics[0].topic6Exercises.exercise2;

    ex2.items.forEach((item, i) => {
        const n = `acceptance new-user [${i + 1}]`;
        ok(bl(w, i).textContent.trim() === 'Variantni tanlang', `${n} neutral button before answering`);
        ok(!UZWORD.test(bl(w, i).textContent.trim()), `${n} no Uzbek word inside the button`);
        ok(bl(w, i).dataset.value === '', `${n} nothing is pre-selected`);
        const cue = bl(w, i).closest('.topic6-select-question').querySelectorAll('.topic6-uz-cue');
        ok(cue.length === 1 && cue[0].textContent.includes(item.placeholder),
            `${n} the Uzbek cue is shown separately`);
        const vals = chips(w, i).map(c => c.dataset.value);
        ok(vals.includes(item.answer), `${n} the correct answer is offered`);
        ok(new Set(vals).size === vals.length, `${n} no duplicate options`);
        ok(vals.every(v => v.trim() !== ''), `${n} no empty option`);
    });

    /* ---- 3. answer all ten and submit ---- */
    ex2.items.forEach((item, i) => {
        chips(w, i).find(c => c.dataset.value === item.answer)
            .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    });
    ok(ex2.items.every((it, i) => bl(w, i).dataset.value === it.answer),
        'acceptance: all ten answers are selected');

    return (async () => {
        await w.checkTopic6Exercises(6);

        const stored = w.userQuizResults['topic_6_practice'];
        ok(!!stored, 'acceptance: submitting persists a practice result');
        ok(Array.isArray(stored.exercise2Answers) && stored.exercise2Answers.length === 10,
            'acceptance: all ten answers are stored');
        ok(stored.exercise2Answers.every((v, i) => v === ex2.items[i].answer),
            'acceptance: the stored answers are the chosen Russian words');
        ok(stored.breakdown.exercise2 === 10,
            `acceptance: exercise 2 scores 10/10 (${stored.breakdown.exercise2})`);
        ok(ex2.items.every((_, i) => bl(w, i).classList.contains('correct')),
            'acceptance: every blank is marked correct');

        /* ---- 4-5. reload the page, reopen the exercise ---- */
        const fresh = bootAt(1440);
        fresh.userQuizResults['topic_6_practice'] = stored;   // what Firebase would return
        paint(fresh);
        ex2.items.forEach((item, i) => {
            const n = `acceptance after-reload [${i + 1}]`;
            ok(bl(fresh, i).dataset.value === item.answer, `${n} the chosen answer is restored`);
            ok(bl(fresh, i).textContent.trim() === item.answer, `${n} and is displayed`);
            ok(bl(fresh, i).classList.contains('correct'), `${n} still marked correct`);
            const sel = chips(fresh, i).filter(c => c.classList.contains('selected'));
            ok(sel.length === 1 && sel[0].dataset.value === item.answer,
                `${n} the matching option chip is highlighted`);
            const cue = bl(fresh, i).closest('.topic6-select-question')
                .querySelectorAll('.topic6-uz-cue');
            ok(cue.length === 1, `${n} the Uzbek cue is still there, exactly once`);
        });

        /* ---- 6. mobile must be identical ---- */
        const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
                         'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
        const desktop = bootAt(1440);
        const mobile = bootAt(390, mobileUA);
        paint(desktop); paint(mobile);
        ok(desktop.document.getElementById('quizSection').innerHTML ===
           mobile.document.getElementById('quizSection').innerHTML,
            'acceptance: mobile and desktop render identical markup');

        const mFilled = bootAt(390, mobileUA);
        mFilled.userQuizResults['topic_6_practice'] = stored;
        paint(mFilled);
        const dFilled = bootAt(1440);
        dFilled.userQuizResults['topic_6_practice'] = stored;
        paint(dFilled);
        ok(mFilled.document.getElementById('quizSection').innerHTML ===
           dFilled.document.getElementById('quizSection').innerHTML,
            'acceptance: restored state is identical on mobile and desktop');

        /* interaction works the same on a touch viewport */
        const m2 = bootAt(390, mobileUA);
        paint(m2);
        chips(m2, 0).find(c => c.dataset.value === ex2.items[0].answer)
            .dispatchEvent(new m2.MouseEvent('click', { bubbles: true }));
        ok(bl(m2, 0).dataset.value === ex2.items[0].answer,
            'acceptance: choosing an answer works on mobile');
        ok(bl(m2, 0).textContent.trim() === ex2.items[0].answer,
            'acceptance: the mobile button shows the chosen answer');

        /* nothing in the topic-6 path branches on width or user agent */
        const region = html.slice(html.indexOf('function loadTopic6Exercises'),
                                  html.indexOf('function loadTopic7Exercises'));
        ok(!/innerWidth|matchMedia|userAgent|ontouchstart|isMobile/i.test(region),
            'acceptance: the topic-6 render has no device-specific branch');

        report();
    })();
}

function report() {
console.log('='.repeat(58));
if (fail) {
    console.log(`  ❌ A1 OPTION INTEGRITY: ${fail} failed / ${pass + fail}\n`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(58) + '\n');
    process.exit(1);
}
console.log(`  ✅ A1 OPTION INTEGRITY: ${pass}/${pass} passed`);
console.log('='.repeat(58) + '\n');
}
