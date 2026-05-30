/* ============================================================================
   VALIDATION QA HARNESS  (Browser-environment proof via JSDOM)
   ----------------------------------------------------------------------------
   Loads the REAL shared validation layer (course-global-fixes.js) into a DOM,
   builds representative topic markup for each exercise type, dispatches REAL
   click events on the "Javoblarni tekshirish" / submit buttons, and asserts:

     1. Check is BLOCKED when any exercise is unanswered.
     2. Matching requires ALL pairs.
     3. Builder requires all words used, exactly once, in order.
     4. Translation is validated (normalized: case/space/punct ignored;
        wrong order / wrong word fails).
     5. Topic completion (scoring + success feedback) cannot run while
        exercises are incomplete.

   Run:  node validation_qa.test.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) {
    console.error('jsdom is required: `npm i -D jsdom` (run failed: ' + e.message + ')');
    process.exit(2);
}

const SRC = fs.readFileSync(path.join(__dirname, 'course-global-fixes.js'), 'utf8');

let passed = 0, failed = 0;
const failures = [];
function ok(name, cond, extra) {
    if (cond) { passed++; console.log('   ✓ ' + name); }
    else { failed++; failures.push(name + (extra ? '  (' + extra + ')' : '')); console.log('   ✗ ' + name + (extra ? '  (' + extra + ')' : '')); }
}

/* Build a JSDOM window, make every element "visible" (jsdom reports 0 boxes by
   default, which the gate treats as hidden), and execute the real source. */
function boot(bodyHtml) {
    const dom = new JSDOM(
        '<!DOCTYPE html><html><head></head><body>' + bodyHtml + '</body></html>',
        { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' }
    );
    const { window } = dom;
    const proto = window.Element.prototype;
    proto.scrollIntoView = function () {};
    proto.getBoundingClientRect = function () {
        const t = this.__top || 0;
        return { top: t, left: 0, right: 10, bottom: t + 10, width: 10, height: 10, x: 0, y: t };
    };
    proto.getClientRects = function () { return [this.getBoundingClientRect()]; };
    Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { get() { return 10; }, configurable: true });
    Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { get() { return 10; }, configurable: true });
    Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', { get() { return this.parentNode; }, configurable: true });
    return dom;
}

function fire(window, el) {
    const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
}
const tick = () => new Promise(r => setTimeout(r, 0));

/* Standard wrapper: a recognised topic root + injected-style check button +
   feedback node (matches what course-global-fixes.js manages). */
function topicShell(inner, buttonHtml) {
    return '<div id="lessonContent"><div id="quizSection" class="topic-exercises" data-topic-id="topic-1">' +
        inner +
        '<div class="topic-check-section" data-topic-id="topic-1">' +
        (buttonHtml || '<button class="check-topic-btn" type="button">Javoblarni tekshirish</button>') +
        '<div class="topic-feedback hidden"></div>' +
        '</div></div></div>';
}

function feedbackText(window) {
    const fb = window.document.querySelector('.topic-feedback');
    return fb ? fb.textContent : '';
}
function isBlocked(window) {
    return !!window.document.querySelector('.fb-block-warning');
}
function ranScoring(window) {
    return !!window.document.querySelector('.fb-summary');
}

/* Install a topic into window globals so the real collectors/gate can read it. */
function installTopic(window, topic, opts) {
    opts = opts || {};
    window.courseData = { topics: [topic] };
    window.currentTopicId = topic.id;
    window.currentTopic = topic;
    // Presence of window.checkAnswers + finite topicId selects the A1/A2/B1 flow
    // inside runTopicCheck; we stub it as a no-op so the real COLLECTORS do the
    // actual scoring/normalization.
    window.checkAnswers = async function () {};
    if (opts.matchingState) window.matchingStateA1 = opts.matchingState;
}

/* ========================================================================== */
async function run() {
    console.log('\n=== VALIDATION QA (real course-global-fixes.js in JSDOM) ===\n');

    /* ---------------------------------------------------------------------- */
    console.log('[1] Gate blocks unanswered TEXT/BLANK input, allows when filled');
    {
        const inner =
            '<div class="quiz-question"><div class="fill-blank">' +
            '<span>Я читаю ...</span><input type="text" data-blank="0" placeholder="..."></div></div>';
        const dom = boot(topicShell(inner, '<button class="check-topic-btn" type="button">Javoblarni tekshirish</button>'));
        const w = dom.window;
        w.eval(SRC);
        installTopic(w, { id: 1, title: 'Test', quiz: { blankQuestions: ['Я читаю ...'], blankAnswers: ['новости'] } });

        fire(w, w.document.querySelector('.check-topic-btn'));
        await tick();
        ok('empty blank -> BLOCKED', isBlocked(w), feedbackText(w).slice(0, 40));
        ok('empty blank -> warning text exact', feedbackText(w).includes('Iltimos, barcha mashqlarni bajaring.'));
        ok('empty blank -> scoring did NOT run', !ranScoring(w));

        w.document.querySelector('input[data-blank="0"]').value = 'novosti';
        fire(w, w.document.querySelector('.check-topic-btn'));
        await tick();
        ok('filled blank -> NOT blocked', !isBlocked(w));
        ok('filled blank -> scoring ran', ranScoring(w));
    }

    /* ---------------------------------------------------------------------- */
    console.log('\n[2] Gate blocks unanswered MULTIPLE CHOICE, allows when selected');
    {
        const inner =
            '<div class="quiz-question"><div class="quiz-options" data-question="0">' +
            '<div class="quiz-option" data-option="0">A</div>' +
            '<div class="quiz-option" data-option="1">B</div></div></div>';
        const dom = boot(topicShell(inner));
        const w = dom.window;
        w.eval(SRC);
        installTopic(w, { id: 1, title: 'Test', quiz: { mcQuestions: ['Q1'], mcOptions: [['A', 'B']], mcAnswers: [1] } });

        fire(w, w.document.querySelector('.check-topic-btn'));
        await tick();
        ok('no MC selection -> BLOCKED', isBlocked(w));
        ok('no MC selection -> scoring did NOT run', !ranScoring(w));

        w.document.querySelector('.quiz-option[data-option="1"]').classList.add('selected');
        fire(w, w.document.querySelector('.check-topic-btn'));
        await tick();
        ok('MC selected -> NOT blocked', !isBlocked(w));
        ok('MC selected -> scoring ran', ranScoring(w));
    }

    /* ---------------------------------------------------------------------- */
    console.log('\n[3] MATCHING requires ALL pairs');
    {
        const inner = '<div class="matching-game-container"><div class="matching-column"></div></div>';
        const topic = {
            id: 1, title: 'Test',
            quiz: { matchingGame: { pairs: [{ left: 'a', right: 'A' }, { left: 'b', right: 'B' }, { left: 'c', right: 'C' }] } }
        };
        // 2 of 3 matched
        let dom = boot(topicShell(inner));
        let w = dom.window;
        w.eval(SRC);
        installTopic(w, topic, { matchingState: { matches: [{ left: 0, right: 0 }, { left: 1, right: 1 }] } });
        fire(w, w.document.querySelector('.check-topic-btn'));
        await tick();
        ok('2/3 pairs matched -> BLOCKED', isBlocked(w));
        ok('2/3 pairs -> scoring did NOT run', !ranScoring(w));

        // all 3 matched (one wrong target to also prove correctness scoring)
        dom = boot(topicShell(inner));
        w = dom.window;
        w.eval(SRC);
        installTopic(w, topic, { matchingState: { matches: [{ left: 0, right: 0 }, { left: 1, right: 1 }, { left: 2, right: 0 }] } });
        fire(w, w.document.querySelector('.check-topic-btn'));
        await tick();
        ok('3/3 pairs matched -> NOT blocked', !isBlocked(w));
        ok('3/3 pairs -> scoring ran', ranScoring(w));
        const badcards = w.document.querySelectorAll('.fb-card.fb-incorrect').length;
        ok('wrong pair target -> marked incorrect', badcards >= 1, 'incorrect cards=' + badcards);
    }

    /* ---------------------------------------------------------------------- */
    console.log('\n[4] BUILDER requires all words (exact set + order)');
    {
        const inner =
            '<div class="exercise-block">' +
            '<input type="hidden" data-topic6-builder-selected="0" value="">' +
            '<div data-topic6-builder-target="0"></div></div>';
        const topic = {
            id: 1, title: 'Test',
            topic6Exercises: { exercise1: { title: 'Gap tuzing', items: [{ prompt: 'build', words: ['Я', 'читаю', 'новости'], answers: 'Я читаю новости' }] } }
        };

        // empty builder
        let dom = boot(topicShell(inner));
        let w = dom.window;
        w.eval(SRC);
        installTopic(w, topic);
        fire(w, w.document.querySelector('.check-topic-btn'));
        await tick();
        ok('empty builder -> BLOCKED', isBlocked(w));

        // filled, wrong order
        dom = boot(topicShell(inner));
        w = dom.window;
        w.eval(SRC);
        installTopic(w, topic);
        w.document.querySelector('[data-topic6-builder-selected="0"]').value = 'новости|читаю|Я';
        fire(w, w.document.querySelector('.check-topic-btn'));
        await tick();
        ok('wrong word order -> NOT blocked (it is filled)', !isBlocked(w));
        ok('wrong word order -> scoring ran', ranScoring(w));
        ok('wrong word order -> marked INCORRECT', w.document.querySelectorAll('.fb-card.fb-incorrect').length >= 1);

        // filled, correct order
        dom = boot(topicShell(inner));
        w = dom.window;
        w.eval(SRC);
        installTopic(w, topic);
        w.document.querySelector('[data-topic6-builder-selected="0"]').value = 'Я|читаю|новости';
        fire(w, w.document.querySelector('.check-topic-btn'));
        await tick();
        ok('correct order -> marked CORRECT', w.document.querySelectorAll('.fb-card.fb-correct').length >= 1 &&
            w.document.querySelectorAll('.fb-card.fb-incorrect').length === 0);
    }

    /* ---------------------------------------------------------------------- */
    console.log('\n[5] TRANSLATION validated (normalize case/space/punct; order/word matter)');
    {
        const topic = { id: 1, title: 'Tarjima', quiz: { blankQuestions: ['Translate'], blankAnswers: ['Я читаю новости.'] } };
        const inner = '<div class="quiz-question"><div class="fill-blank"><span>Translate</span>' +
            '<input type="text" data-blank="0"></div></div>';

        async function check(value) {
            const dom = boot(topicShell(inner));
            const w = dom.window;
            w.eval(SRC);
            installTopic(w, topic);
            w.document.querySelector('input[data-blank="0"]').value = value;
            fire(w, w.document.querySelector('.check-topic-btn'));
            await tick();
            return w.document.querySelectorAll('.fb-card.fb-correct').length >= 1;
        }
        ok('lowercase + no punctuation accepted', await check('я читаю новости'));
        ok('extra/leading spaces accepted', await check('  я   читаю   новости  '));
        ok('wrong word order REJECTED', !(await check('новости читаю я')));
        ok('wrong vocabulary REJECTED', !(await check('я смотрю новости')));
    }

    /* ---------------------------------------------------------------------- */
    console.log('\n[6] Native quiz submit (#submitQuiz) is ALSO gated');
    {
        const inner = '<div class="quiz-question"><div class="fill-blank"><span>x</span>' +
            '<input type="text" data-blank="0"></div></div>' +
            '<button class="submit-btn" id="submitQuiz">Javoblarni tekshirish</button>';
        const dom = boot(topicShell(inner, '<button class="check-topic-btn" type="button">JT</button>'));
        const w = dom.window;
        let nativeRan = false;
        w.eval(SRC);
        installTopic(w, { id: 1, title: 'T', quiz: { blankQuestions: ['x'], blankAnswers: ['y'] } });
        // simulate the course's own handler bound to #submitQuiz
        w.document.getElementById('submitQuiz').addEventListener('click', function () { nativeRan = true; });
        fire(w, w.document.getElementById('submitQuiz'));
        await tick();
        ok('#submitQuiz with empty field -> BLOCKED', isBlocked(w));
        ok('#submitQuiz blocked -> native handler PREVENTED', nativeRan === false);
    }

    /* ---------------------------------------------------------------------- */
    console.log('\n=== RESULT: ' + passed + ' passed, ' + failed + ' failed ===');
    if (failed) { console.log('FAILURES:\n - ' + failures.join('\n - ')); process.exitCode = 1; }
}

run().catch(e => { console.error('HARNESS ERROR:', e); process.exit(3); });
