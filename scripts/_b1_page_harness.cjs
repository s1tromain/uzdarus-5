/**
 * _b1_page_harness.cjs — run the REAL B1 course page functions.
 *
 * Both B1 behavioural suites had the same blind spot: they proved b1-host.js
 * behaved, and inferred that the learner therefore saw the right thing. That
 * inference is exactly what let topics 1-4 sit unrouted behind a passing test.
 * A helper that returns the string "Javoblarni ko‘rish" is not a button, and
 * an object describing a review is not a screen.
 *
 * So this lifts the page's OWN functions — the source bytes of
 * paid-courses/b1-course.html, not a copy — into a JSDOM window alongside the
 * real b1-host.js, the real session and the real UI, and lets the tests drive
 * them and read the resulting DOM.
 *
 * The only things stubbed are the network calls (saveQuizResult /
 * completeCourseComponent), which is the point: every write the page attempts
 * is counted.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const PAGE = fs.readFileSync(path.join(ROOT, 'paid-courses/b1-course.html'), 'utf8');

/** Lift one whole function declaration out of the page, braces balanced. */
function lift(name, src) {
    const s = src || PAGE;
    const i = s.search(new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\('));
    if (i < 0) throw new Error('missing function ' + name);
    let p = 0, b = -1;
    for (let k = s.indexOf('(', i); k < s.length; k++) {
        if (s[k] === '(') p++;
        else if (s[k] === ')') { p--; if (p === 0) { b = s.indexOf('{', k); break; } }
    }
    let d = 0;
    for (let k = b; k < s.length; k++) {
        if (s[k] === '{') d++;
        else if (s[k] === '}') { d--; if (d === 0) return s.slice(i, k + 1); }
    }
    throw new Error('unbalanced ' + name);
}

/** The page's own courseData literal. */
function courseData() {
    const ci = PAGE.indexOf('const courseData');
    const cj = PAGE.indexOf('\n        };', ci);
    return JSON.parse(JSON.stringify(
        (0, eval)('(' + PAGE.slice(PAGE.indexOf('{', ci), cj + 11).replace(/;\s*$/, '') + ')')));
}

const PAGE_FNS = [
    'mountB1Practice', 'b1FinishExercises', 'b1ApplyOutcome', 'b1RetrySave',
    'b1ShowNotice', 'b1ShowSaveError', 'b1ExerciseCtaLabel', 'b1OpenReview',
    'b1RenderDone', 'b1RenderLegacy', 'b1RenderReview', 'b1SyncComponent', 'b1RenderMatching'
];

/**
 * Build a live page context.
 *
 * opts.userQuizResults / completedTopics / courseState seed the DURABLE state
 * the page hydrates from. opts.save / opts.component replace the two network
 * calls; every invocation of either is recorded on ctx.writes.
 */
function makePage(opts) {
    opts = opts || {};
    /* jsdom's CSS parser rejects some modern at-rules the real stylesheet
       uses; the resulting warnings are noise, not findings. */
    const vc = new VirtualConsole();
    vc.on('jsdomError', () => {});
    const dom = new JSDOM(
        '<!doctype html><body><div class="quiz-section" id="quizSection"></div></body>',
        { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc,
          url: 'https://uzdarus.test/paid-courses/b1-course.html' });
    const w = dom.window;

    /* jsdom implements no layout, so these are absent. The session calls both
       while rendering a verdict; without them a real code path throws inside
       the test and the state under test is never reached. */
    if (!w.Element.prototype.scrollIntoView) w.Element.prototype.scrollIntoView = function () {};
    if (!w.HTMLElement.prototype.scrollTo) w.HTMLElement.prototype.scrollTo = function () {};

    /* the real shipped modules, in the order the page loads them */
    ['exercise-session.js', 'sentence-builder.js', 'course-exercise-ui.js', 'b1-host.js']
        .forEach((f) => { new Function('window', 'document', 'localStorage',
            fs.readFileSync(path.join(ROOT, f), 'utf8'))(w, w.document, w.localStorage); });

    const writes = { save: 0, component: 0, topic: 0, draftSet: 0, draftRemove: 0 };
    const calls = [];

    /* COUNT EVERY localStorage MUTATION — via the PROTOTYPE, not the instance.
       JSDOM's Storage is a proxy whose set trap turns an assignment into a
       STORED KEY: `localStorage.setItem = fn` quietly writes an entry called
       "setItem" and leaves the real method in place. A counter installed that
       way never fires, which is how a negative control that made the review
       write a draft escaped this suite once. */
    const proto = w.Storage.prototype;
    const rawSet = proto.setItem, rawRemove = proto.removeItem, rawClear = proto.clear;
    proto.setItem = function (k, v) { writes.draftSet++; return rawSet.call(this, k, v); };
    proto.removeItem = function (k) { writes.draftRemove++; return rawRemove.call(this, k); };
    proto.clear = function () { writes.draftRemove++; return rawClear.call(this); };
    /* the counter must be able to see a write, or it is not a counter */
    const probe = writes.draftSet;
    w.localStorage.setItem('__probe__', '1');
    w.localStorage.removeItem('__probe__');
    if (writes.draftSet !== probe + 1) {
        throw new Error('harness: localStorage writes are not being counted');
    }
    writes.draftSet = 0; writes.draftRemove = 0;

    w.saveQuizResult = opts.save || (async (uid, topicId, payload, course) => {
        writes.save++; calls.push(['save', course, topicId]); return true;
    });
    /* THE REAL SERVER REPLY, field for field — api/_progress/complete-component.js
       sends exactly these keys, and paid-platform.js passes the payload
       through untouched. A mock that is looser than the wire would let a
       malformed-ACK bug pass; a mock that is tighter would fail honest code. */
    w.completeCourseComponent = opts.component || (async (course, topicId, component) => {
        writes.component++; calls.push(['component', course, topicId, component]);
        return ack(course, topicId, component, opts.topicCompleted === true,
                   opts.ackCompletedTopics || []);
    });
    w.completeCourseTopic = async () => { writes.topic++; calls.push(['topic']); return null; };
    w.currentUserId = opts.uid || 'u-1';

    const ctx = {
        window: w, document: w.document, writes, calls,
        quizSection: w.document.getElementById('quizSection'),
        courseData: opts.courseData || courseData(),
        userQuizResults: opts.userQuizResults || {},
        completedTopics: opts.completedTopics || [],
        b1CourseState: opts.courseState || null,
        loadTopicsCalls: 0, updateProgressCalls: 0,
        legacyRenders: 0, matchingRenders: 0,
        resultsSection: w.document.createElement('div'),
        completeBtn: w.document.createElement('button'),
        retryBtn: w.document.createElement('button')
    };

    /* Evaluate the lifted page functions in a scope holding the page's own
       module-level names. Anything the tests must observe is exported back. */
    const src = PAGE_FNS.map((n) => lift(n)).join('\n\n') +
        '\nreturn {' + PAGE_FNS.map((n) => n + ': ' + n).join(', ') +
        /* ACCESSORS, not values. The page REASSIGNS completedTopics and
           b1CourseState — reading a copy taken at construction time would
           show the tests the state before the server answered. */
        ', getCompletedTopics: function(){return completedTopics;}' +
        ', getCourseState: function(){return b1CourseState;}' +
        ', getPendingRetry: function(){return b1PendingRetry;}};';

    const api = new Function(
        'window', 'document', 'localStorage', 'courseData', 'quizSection',
        'resultsSection', 'completeBtn', 'retryBtn', 'renderTopic1Exercises', 'loadMatchingGame',
        'userQuizResults', 'completedTopics', 'b1CourseState',
        'loadTopics', 'updateProgress', 'ctx',
        '"use strict"; var b1PendingRetry = null;\n' + src
    )(w, w.document, w.localStorage, ctx.courseData, ctx.quizSection,
      ctx.resultsSection, ctx.completeBtn, ctx.retryBtn,
      function () { ctx.legacyRenders++; }, function () { ctx.matchingRenders++; },
      ctx.userQuizResults, ctx.completedTopics, ctx.b1CourseState,
      () => { ctx.loadTopicsCalls++; }, () => { ctx.updateProgressCalls++; }, ctx);

    Object.assign(ctx, api);
    ctx.text = () => ctx.quizSection.textContent.replace(/\s+/g, ' ').trim();
    ctx.q = (sel) => ctx.quizSection.querySelector(sel);
    ctx.all = (sel) => Array.from(ctx.quizSection.querySelectorAll(sel));
    ctx.button = (label) => ctx.all('button')
        .find((b) => b.textContent.replace(/\s+/g, ' ').trim() === label) || null;
    ctx.resetWrites = () => Object.keys(writes).forEach((k) => { writes[k] = 0; });
    return ctx;
}

/** The shape /api/progress?action=complete-component actually sends. */
function ack(course, topicId, component, topicCompleted, completedTopics) {
    return {
        ok: true, course, topicId, component,
        components: {
            vocabularyCompleted: topicCompleted === true,
            exercisesCompleted: true,
            vocabularyCompletedAt: null, exercisesCompletedAt: null
        },
        topicCompleted: topicCompleted === true,
        completedTopics: completedTopics.slice(),
        nextTopic: topicCompleted === true ? Number(topicId) + 1 : null
    };
}

/** A finished, all-groups-passed attempt over real groups. */
function finishedAttempt(groups, wrongInFirst) {
    const answers = {}, checked = {};
    groups.forEach((grp, gi) => {
        const total = grp.items.length;
        const wrong = gi === 0 ? (wrongInFirst || 0) : 0;
        grp.items.forEach((it, i) => {
            const a = Array.isArray(it.answer) ? it.answer[0] : it.answer;
            answers[grp.id + '-' + i] = (i < total - wrong) ? String(a) : 'ZZZ-wrong';
        });
        checked[grp.id] = { correct: total - wrong, total,
                            passed: (total - wrong) * 100 >= total * 80 };
    });
    return { answers, checked };
}

module.exports = { ROOT, PAGE, lift, courseData, makePage, finishedAttempt, ack, PAGE_FNS };
