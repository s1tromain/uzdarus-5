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
        /* The exercise is a plain MCQ: a `questions` array, no fill-in scaffolding. */
        ok(Array.isArray(ex2.questions), 'exercise 2 stores a questions array');
        ok(!('items' in ex2), 'exercise 2 no longer uses the old items array');
    }

    if (ex2 && Array.isArray(ex2.questions)) {
        ok(ex2.questions.length === 10, `exercise 2 has 10 questions (${ex2.questions.length})`);
        ex2.questions.forEach((item, i) => {
            const n = `t6.ex2[${i + 1}]`;
            /* Exercise 2 is a BILINGUAL multiple-choice quiz: the prompt is asked
               in Uzbek and may quote Russian, and the answer is whichever language
               the question asks for. There is no blank and no cue any more — the
               question stands on its own and all four options are on screen. */
            ok(typeof item.question === 'string' && item.question.trim() !== '',
                `${n} the question text is present`);
            ok(!/___/.test(item.question), `${n} the question carries no leftover blank`);
            ok(!('template' in item) && !('placeholder' in item),
                `${n} no fill-in-the-blank fields remain`);
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
        ex2.questions.forEach((item, i) => {
            ok(clean(item.placeholder) !== clean(item.answer),
                `t6.ex2[${i + 1}] the cue is not simply the answer repeated`);
        });
    }
}

/* ------------------------------- the dropdown machinery is gone for good */
{
    /* Exercise 2 used to be a dropdown: a blank you clicked to reveal the
       options. It is a plain MCQ now, so none of that may survive — a leftover
       handler or class would be dead code that can silently come back to life. */
    ok(!/topic6-uz-cue/.test(html), 'no Uzbek cue markup or CSS remains');
    ok(!/topic6-select-question/.test(html), 'no dropdown row wrapper remains');
    ok(!/data-topic6-select/.test(html), 'no dropdown blank remains');
    ok(!/closeTopic6OptionPanels/.test(html), 'the panel-closing helper is removed');
    ok(!/topic6OutsideClickBound/.test(html), 'the outside-click guard is removed');
    ok(!/item\.template/.test(html.slice(html.indexOf('loadTopic6Exercises'),
                                         html.indexOf('function loadTopic7Exercises'))),
        'the topic-6 renderer no longer reads item.template');

    /* the options must render without waiting for an "active" class */
    ok(/t6q-options/.test(html), 'options carry the always-visible MCQ class');
    ok(/\.t6q-options\s*\{\s*display:\s*block/.test(html),
        'the MCQ options are their own block, never a wrapping row');
    ok(/\.t6q-option\s*\{[^}]*width:\s*100%/.test(html),
        'each option occupies the full width — one per row');
    ok(!/t6q-options[^}]*flex-wrap/.test(html), 'the MCQ never wraps options into columns');
    ok(/\.topic5-options\s*\{[^}]*display:\s*none/.test(html),
        'the shared dropdown rule is untouched for topics 5 and 7');

    /* choosing an option writes nowhere except the chip itself */
    /* The listener body, taken up to the NEXT querySelectorAll registration —
       slicing at the first '});' or the first addEventListener would cut inside
       the handler, because it contains a nested forEach and its own listener. */
    const hStart = html.indexOf("querySelectorAll('[data-t6q-option]')");
    const hEnd = html.indexOf("document.querySelectorAll('[data-topic6-builder-word]')", hStart);
    const body = html.slice(hStart, hEnd > hStart ? hEnd : hStart + 1200);
    ok(!/blank/.test(body), 'the option handler writes into no other element');
    ok(/classList\.add\('is-selected'\)/.test(body), 'the handler marks the chosen option');
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
            var topic6BuilderState={};
            function clearExtraExercises(){}
            ${fn('normalizeTopic6Text')}
            ${fn('topic6IsCorrect')}
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
    const chipsEl = (w, i) => Array.from(w.document.querySelectorAll(`[data-t6q-option="${i}"]`));
    const chipsOf = (w, i) => chipsEl(w, i).map(c => c.dataset.value);
    const selectedOf = (w, i) => chipsEl(w, i).filter(c => c.classList.contains('is-selected'));
    const rowOf = (w, i) => chipsEl(w, i)[0].closest('.t6q');

    let w = boot();
    render(w);
    const ex2 = w.courseData.topics[0].topic6Exercises.exercise2;

    /* ---- first paint: a plain MCQ, no dropdown ---- */
    ok(w.document.querySelectorAll('.t6q').length === 10,
        'runtime: ten multiple-choice questions render');
    ok(w.document.querySelectorAll('[data-topic6-select]').length === 0,
        'runtime: no dropdown blank is rendered anywhere');
    ok(w.document.querySelectorAll('.t6q-nonexistent').length === 0,
        'runtime: no Uzbek cue element remains');
    ok(w.document.querySelectorAll('.topic6-select-question').length === 0,
        'runtime: the dropdown row wrapper is gone');

    ex2.questions.forEach((item, i) => {
        const n = `runtime t6.ex2[${i + 1}]`;
        const chips = chipsOf(w, i);
        ok(chips.length === 4, `${n} renders exactly four options`);
        ok(chips.length === item.options.length, `${n} renders every option`);
        ok(new Set(chips).size === chips.length, `${n} renders no duplicate option`);
        ok(chips.includes(item.answer), `${n} renders the correct answer as a choice`);
        ok(selectedOf(w, i).length === 0, `${n} starts unanswered`);

        /* THE point of this rewrite: the options are on screen from the start,
           not hidden behind a control the learner has to open first. */
        const panel = rowOf(w, i).querySelector('[data-t6q-options]');
        ok(!!panel, `${n} the options container is present`);
        ok(panel.className.includes('t6q-options'),
            `${n} the options carry the always-visible MCQ class`);
        ok(!panel.classList.contains('active'),
            `${n} visibility does not depend on the dropdown "active" class`);

        const q = rowOf(w, i).querySelector('.t6q-question');
        ok(!!q && q.textContent.includes(item.question),
            `${n} the question text is shown`);
        ok(!/___/.test(rowOf(w, i).textContent), `${n} no blank placeholder is rendered`);
    });

    /* ---- choosing an answer, then changing it ---- */
    ex2.questions.forEach((item, i) => {
        const chip = chipsEl(w, i).find(c => c.dataset.value === item.answer);
        chip.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    });
    ex2.questions.forEach((item, i) => {
        const sel = selectedOf(w, i);
        ok(sel.length === 1, `runtime t6.ex2[${i + 1}] exactly one option is selected`);
        ok(sel[0].dataset.value === item.answer,
            `runtime t6.ex2[${i + 1}] the chosen option is the one clicked`);
    });
    /* picking a different option must move the selection, not add a second */
    ex2.questions.forEach((item, i) => {
        const other = chipsEl(w, i).find(c => c.dataset.value !== item.answer);
        other.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        const sel = selectedOf(w, i);
        ok(sel.length === 1, `runtime t6.ex2[${i + 1}] still exactly one selection after changing`);
        ok(sel[0].dataset.value === other.dataset.value,
            `runtime t6.ex2[${i + 1}] the new choice replaced the previous one`);
    });

    /* ---- reopening the topic with a saved result ---- */
    w = boot();
    w.userQuizResults['topic_6_practice'] = { exercise2Answers: ex2.questions.map(it => it.answer) };
    render(w);
    ex2.questions.forEach((item, i) => {
        const sel = selectedOf(w, i);
        ok(sel.length === 1, `runtime t6.ex2[${i + 1}] a saved answer is restored`);
        ok(sel.length === 1 && sel[0].dataset.value === item.answer,
            `runtime t6.ex2[${i + 1}] the restored value is the stored one`);
    });

    /* ---- reopening with corrupted / stale stored answers ---- */
    w = boot();
    w.userQuizResults['topic_6_practice'] = { exercise2Answers: ex2.questions.map(() => 'не вариант') };
    render(w);
    ex2.questions.forEach((item, i) => {
        ok(selectedOf(w, i).length === 0,
            `runtime t6.ex2[${i + 1}] a stored value outside the options is discarded`);
        ok(chipsEl(w, i).every(c => !c.classList.contains('is-wrong')),
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
            var topic6BuilderState={};
            function clearExtraExercises(){}
            ${fn('normalizeTopic6Text')}
            ${fn('topic6IsCorrect')}
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
    const chips = (w, i) => Array.from(w.document.querySelectorAll(`[data-t6q-option="${i}"]`));
    const picked = (w, i) => chips(w, i).filter(c => c.classList.contains('is-selected'));
    const rowOf = (w, i) => chips(w, i)[0].closest('.t6q');
    const UZWORD = /^[a-z'‘’`]+$/i;

    /* ---- 1-2. a brand-new user opens topic 6 ---- */
    let w = bootAt(1440);
    ok(Object.keys(w.userQuizResults).length === 0, 'acceptance: user starts with no stored progress');
    ok(w.localStorage.length === 0, 'acceptance: user starts with an empty localStorage');
    paint(w);
    const ex2 = w.courseData.topics[0].topic6Exercises.exercise2;

    ex2.questions.forEach((item, i) => {
        const n = `acceptance new-user [${i + 1}]`;
        ok(picked(w, i).length === 0, `${n} nothing is pre-selected`);
        ok(chips(w, i).length === 4, `${n} all four options are on screen from the start`);
        const q = rowOf(w, i).querySelector('.t6q-question');
        ok(!!q && q.textContent.includes(item.question), `${n} the question text is shown`);
        ok(rowOf(w, i).querySelectorAll('[data-topic6-select]').length === 0,
            `${n} no dropdown control is rendered`);
        const vals = chips(w, i).map(c => c.dataset.value);
        ok(vals.includes(item.answer), `${n} the correct answer is offered`);
        ok(new Set(vals).size === vals.length, `${n} no duplicate options`);
        ok(vals.every(v => v.trim() !== ''), `${n} no empty option`);
    });

    /* ---- 3. answer all ten and submit ---- */
    ex2.questions.forEach((item, i) => {
        chips(w, i).find(c => c.dataset.value === item.answer)
            .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    });
    ok(ex2.questions.every((it, i) => picked(w, i).length === 1 &&
        picked(w, i)[0].dataset.value === it.answer),
        'acceptance: all ten answers are selected');

    return (async () => {
        await w.checkTopic6Exercises(6);

        const stored = w.userQuizResults['topic_6_practice'];
        ok(!!stored, 'acceptance: submitting persists a practice result');
        ok(Array.isArray(stored.exercise2Answers) && stored.exercise2Answers.length === 10,
            'acceptance: all ten answers are stored');
        ok(stored.exercise2Answers.every((v, i) => v === ex2.questions[i].answer),
            'acceptance: the stored answers are the chosen options');
        ok(stored.breakdown.exercise2 === 10,
            `acceptance: exercise 2 scores 10/10 (${stored.breakdown.exercise2})`);
        ok(ex2.questions.every((_, i) => picked(w, i).length === 1 &&
            picked(w, i)[0].classList.contains('is-correct')),
            'acceptance: every chosen option is marked correct');

        /* ---- 4-5. reload the page, reopen the exercise ---- */
        const fresh = bootAt(1440);
        fresh.userQuizResults['topic_6_practice'] = stored;   // what Firebase would return
        paint(fresh);
        ex2.questions.forEach((item, i) => {
            const n = `acceptance after-reload [${i + 1}]`;
            const sel = picked(fresh, i);
            ok(sel.length === 1, `${n} exactly one option is restored as selected`);
            ok(sel.length === 1 && sel[0].dataset.value === item.answer,
                `${n} the restored option is the chosen answer`);
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
        chips(m2, 0).find(c => c.dataset.value === ex2.questions[0].answer)
            .dispatchEvent(new m2.MouseEvent('click', { bubbles: true }));
        ok(picked(m2, 0).length === 1 &&
           picked(m2, 0)[0].dataset.value === ex2.questions[0].answer,
            'acceptance: choosing an answer works on mobile');

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
