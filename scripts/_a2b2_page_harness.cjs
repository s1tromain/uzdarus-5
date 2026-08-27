/**
 * _a2b2_page_harness.cjs — run the REAL A2 and B2 course-page functions.
 *
 * Same discipline as the A1 and B1 harnesses: the functions under test are
 * lifted out of the shipped HTML, not copied, and everything they touch that
 * could hide a bug — the two network calls and every localStorage mutation —
 * is counted. A host that behaves is not the claim being tested; a page that
 * uses it is.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SRC = {
    A2: read('paid-courses/a2-course.html'),
    B2: read('paid-courses/b2-course.html')
};

function lift(src, name) {
    const i = src.search(new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\('));
    if (i < 0) throw new Error('missing function ' + name);
    let p = 0, b = -1;
    for (let k = src.indexOf('(', i); k < src.length; k++) {
        if (src[k] === '(') p++;
        else if (src[k] === ')') { p--; if (p === 0) { b = src.indexOf('{', k); break; } }
    }
    let d = 0;
    for (let k = b; k < src.length; k++) {
        if (src[k] === '{') d++;
        else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
    }
    throw new Error('unbalanced ' + name);
}

const FNS = {
    A2: ['a2Lifecycle', 'a2GroupsOf', 'a2Uid', 'a2FinishExercises', 'a2ApplyOutcome',
         'a2RetrySave', 'a2Host_', 'a2ShowNotice', 'a2ShowSaveError', 'a2ExerciseCtaLabel',
         'a2OpenReview', 'a2TopicTitle', 'a2RenderDone', 'a2RenderLegacy', 'a2SyncComponent',
         'a2RenderReview', 'a2RenderState'],
    B2: ['b2Lifecycle', 'b2GroupsOf', 'b2Uid', 'b2ResultsStore', 'b2FinishExercises',
         'b2ApplyOutcome', 'b2RetrySave', 'b2Host_', 'b2ShowNotice', 'b2ShowSaveError',
         'b2ExerciseCtaLabel', 'b2OpenReview', 'b2TopicTitle', 'b2RenderDone',
         'b2RenderLegacy', 'b2SyncComponent', 'b2RenderReview', 'b2RenderState']
};

/** The shape /api/progress?action=complete-component really sends. */
function ack(course, topicId, component, topicCompleted, completedTopics) {
    return {
        ok: true, course, topicId, component,
        components: { vocabularyCompleted: topicCompleted === true, exercisesCompleted: true,
                      vocabularyCompletedAt: null, exercisesCompletedAt: null },
        topicCompleted: topicCompleted === true,
        completedTopics: (completedTopics || []).slice(),
        nextTopic: topicCompleted === true ? Number(topicId) + 1 : null
    };
}

/** Real exercise groups for a topic, read from the shipped data. */
function groupsFor(course, topicId) {
    if (course === 'A2') {
        const src = SRC.A2;
        const ci = src.indexOf('const courseData');
        const cj = src.indexOf('\n        };', ci);
        const cd = (0, eval)('(' + src.slice(src.indexOf('{', ci), cj + 11).replace(/;\s*$/, '') + ')');
        const t = cd.topics.find((x) => x.id === topicId);
        for (let n = 1; n <= 20 && t; n++) {
            const v = t['topic' + n + 'Exercises'];
            if (v && v.exercises) return { topic: t, groups: v.exercises, courseData: cd };
        }
        return { topic: t, groups: [], courseData: cd };
    }
    /* B2's exercises live in b2-lesson-data.js */
    const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
    const w = new JSDOM('<body></body>', { runScripts: 'outside-only', virtualConsole: vc }).window;
    ['shared-normalizer.js', 'sentence-builder.js', 'course-exercise-ui.js', 'b2-lesson-data.js']
        .forEach((f) => new Function('window', 'document', read(f))(w, w.document));
    const t = (w.B2_LESSON_DATA.topics || []).find((x) => x.id === topicId);
    return { topic: t, groups: (t && t.exercises) || [],
             courseData: { topics: w.B2_LESSON_DATA.topics } };
}

/**
 * Build a live page context for one course.
 *
 * opts.save / opts.component replace the two network calls; every invocation
 * of either, and every localStorage mutation, is recorded.
 */
function makePage(course, opts) {
    opts = opts || {};
    const topicId = opts.topicId || 1;
    const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
    const dom = new JSDOM('<!doctype html><body><div id="quizSection"></div>' +
        '<div id="' + course.toLowerCase() + 'PracticeMount"></div></body>', {
        url: 'https://uzdarus.test/paid-courses/x.html',
        runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
    const w = dom.window;
    if (!w.Element.prototype.scrollIntoView) w.Element.prototype.scrollIntoView = function () {};

    new Function('window', 'document', 'localStorage', read('exercise-lifecycle.js'))
        (w, w.document, w.localStorage);

    const writes = { save: 0, component: 0, topic: 0, draftSet: 0, draftRemove: 0 };
    const calls = [];

    /* COUNT VIA THE PROTOTYPE. jsdom's Storage is a proxy: assigning
       localStorage.setItem stores a KEY called "setItem" and leaves the real
       method in place, so an instance-level counter never fires. */
    const carry = opts.carry || {};
    Object.keys(carry).forEach((k) => { try { w.localStorage.setItem(k, carry[k]); } catch (e) {} });
    const proto = w.Storage.prototype;
    const rawSet = proto.setItem, rawRemove = proto.removeItem;
    proto.setItem = function (k, v) { writes.draftSet++; carry[k] = String(v); return rawSet.call(this, k, v); };
    proto.removeItem = function (k) { writes.draftRemove++; delete carry[k]; return rawRemove.call(this, k); };
    const probe = writes.draftSet;
    w.localStorage.setItem('__probe__', '1'); w.localStorage.removeItem('__probe__');
    if (writes.draftSet !== probe + 1) throw new Error('harness: localStorage writes not counted');
    writes.draftSet = 0; writes.draftRemove = 0;

    w.saveQuizResult = opts.save || (async (uid, tid, payload, c) => {
        writes.save++; calls.push(['save', c, tid]); return true;
    });
    w.completeCourseComponent = opts.component || (async (c, tid, comp) => {
        writes.component++; calls.push(['component', c, tid, comp]);
        return ack(c, tid, comp, opts.topicCompleted === true, opts.ackCompletedTopics || []);
    });
    w.completeCourseTopic = async (c, tid) => { writes.topic++; calls.push(['topic', c, tid]); return null; };
    w.currentUserId = opts.uid || 'u-1';

    const { topic, groups, courseData } = groupsFor(course, topicId);
    const ctx = {
        window: w, writes, calls, carry, course, topicId, topic, groups, courseData,
        mount: w.document.getElementById(course.toLowerCase() + 'PracticeMount'),
        quizSection: w.document.getElementById('quizSection'),
        userQuizResults: opts.userQuizResults || {},
        completedTopics: opts.completedTopics || [],
        courseState: opts.courseState || null,
        loadTopicsCalls: 0, renderTopicsCalls: 0
    };

    const src = SRC[course];
    const body = FNS[course].map((n) => lift(src, n)).join('\n\n');
    const names = FNS[course].map((n) => n + ': ' + n).join(', ');

    let api;
    if (course === 'A2') {
        api = new Function('window', 'document', 'localStorage', 'courseData', 'getT1ExData',
            'quizSection', 'userQuizResults', 'completedTopics', 'a2CourseState',
            'loadTopics', 'updateProgress', 'ctx',
            '"use strict"; var a2PendingRetry = null;\n' + body +
            '\nreturn {' + names + ', getCompletedTopics: function(){return completedTopics;}' +
            ', getCourseState: function(){return a2CourseState;}' +
            ', getPendingRetry: function(){return a2PendingRetry;}};')
            (w, w.document, w.localStorage, ctx.courseData,
             (t) => { for (let n = 1; n <= 20; n++) if (t && t['topic' + n + 'Exercises']) return t['topic' + n + 'Exercises']; return null; },
             ctx.quizSection, ctx.userQuizResults, ctx.completedTopics, ctx.courseState,
             () => { ctx.loadTopicsCalls++; }, () => {}, ctx);
    } else {
        api = new Function('window', 'document', 'localStorage', 'courseData', 'B2_COURSE',
            'b2ExerciseData', 'userQuizResults', 'b2CompletedArray', 'b2ApplyCompletedArray',
            'b2CourseState', 'renderTopics', 'updateProgressBar', 'ctx',
            '"use strict"; var b2PendingRetry = null;\n' + body +
            '\nreturn {' + names + ', getCompletedTopics: function(){return b2CompletedArray();}' +
            ', getCourseState: function(){return b2CourseState;}' +
            ', getPendingRetry: function(){return b2PendingRetry;}};')
            (w, w.document, w.localStorage, ctx.courseData, 'B2',
             (id) => { const t = ctx.courseData.topics.find((x) => x.id === id);
                       return t ? { exercises: t.exercises || [] } : null; },
             ctx.userQuizResults, () => ctx.completedTopics,
             (arr) => { ctx.completedTopics = arr.slice(); },
             ctx.courseState, () => { ctx.renderTopicsCalls++; }, () => {}, ctx);
    }

    Object.assign(ctx, api);
    ctx.text = () => ctx.mount.textContent.replace(/\s+/g, ' ').trim();
    ctx.all = (sel) => Array.from(ctx.mount.querySelectorAll(sel));
    ctx.q = (sel) => ctx.mount.querySelector(sel);
    ctx.button = (label) => ctx.all('button')
        .find((b) => b.textContent.replace(/\s+/g, ' ').trim() === label) || null;
    ctx.resetWrites = () => Object.keys(writes).forEach((k) => { writes[k] = 0; });
    return ctx;
}

/**
 * Mount a REAL session for one course, through its real host.
 *
 * The convergence suites need this for one thing a data-level draft test
 * cannot show: that a saved draft actually raises the resume dialog in the
 * session the learner sees, with the two buttons, and that Continue puts them
 * back where they were. Asserting the wording by grepping exercise-session.js
 * would pass just as happily if nothing ever reached it.
 */
function mountSession(course, opts) {
    opts = opts || {};
    const topicId = opts.topicId || 1;
    const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
    const dom = new JSDOM('<!doctype html><body><div id="mount"></div></body>', {
        url: 'https://uzdarus.test/paid-courses/x.html',
        runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
    const w = dom.window;
    if (!w.Element.prototype.scrollIntoView) w.Element.prototype.scrollIntoView = function () {};
    if (!w.HTMLElement.prototype.scrollTo) w.HTMLElement.prototype.scrollTo = function () {};

    const carry = opts.carry || {};
    const files = ['exercise-session.js', 'sentence-builder.js', 'course-exercise-ui.js',
                   'exercise-lifecycle.js'];
    if (course === 'B2') files.splice(1, 0, 'shared-normalizer.js');
    files.forEach((f) => new Function('window', 'document', 'localStorage', read(f))
        (w, w.document, w.localStorage));
    Object.keys(carry).forEach((k) => { try { w.localStorage.setItem(k, carry[k]); } catch (e) {} });
    /* mirror writes back out, so a draft saved here survives into the next
       mounted session exactly as it survives a reload in a real browser */
    const sProto = w.Storage.prototype;
    const sSet = sProto.setItem, sRemove = sProto.removeItem;
    sProto.setItem = function (k, v) { carry[k] = String(v); return sSet.call(this, k, v); };
    sProto.removeItem = function (k) { delete carry[k]; return sRemove.call(this, k); };
    w.currentUserId = opts.uid || 'u-1';

    const { groups } = groupsFor(course, topicId);
    const scored = groups.filter((g) => (g.items || []).length);
    const L = w.UzExerciseLifecycle.create({ course });
    const mountEl = w.document.getElementById('mount');

    /* the shared session, configured the way both hosts configure it */
    const session = w.UzExerciseSession.mount({
        course: course.toLowerCase(),
        topicId: topicId,
        groups: scored,
        mountEl: mountEl,
        title: 'Amaliy mashqlar',
        passScore: L.PASS_PERCENT,
        renderGroup: w.UzExerciseUI.renderGroup,
        bindGroup: w.UzExerciseUI.bindGroup,
        readAnswer: w.UzExerciseUI.readAnswer,
        writeAnswer: w.UzExerciseUI.writeAnswer,
        matchItem: w.UzExerciseUI.matchItem,
        afterCheck: w.UzExerciseUI.afterCheck,
        renderSummary: function () { return ''; },
        draft: L.draftFor(w.currentUserId, topicId, scored),
        finish: opts.onFinish || function () {}
    });

    return {
        window: w, session, groups: scored, lifecycle: L, mountEl, carry,
        open: () => { const b = mountEl.querySelector('.uz-practice-btn'); if (b) b.click(); },
        ask: () => w.document.querySelector('.uz-ask'),
        askText: () => { const a = w.document.querySelector('.uz-ask');
                         return a ? a.textContent.replace(/\s+/g, ' ').trim() : ''; },
        askButtons: () => Array.from(w.document.querySelectorAll('.uz-ask-actions button'))
            .map((b) => b.textContent.trim()),
        press: (label) => { const b = Array.from(w.document.querySelectorAll('button'))
            .find((x) => x.textContent.trim() === label); if (b) b.click(); return !!b; },
        stepText: () => { const el = w.document.querySelector('.uz-step');
                          return el ? el.textContent.trim() : ''; },
        inputs: () => Array.from(w.document.querySelectorAll('.b2h-input')).map((i) => i.value)
    };
}

/** A finished, all-groups-passed attempt over real groups. */
function finishedAttempt(groups, wrongInFirst) {
    const answers = {}, checked = {};
    groups.forEach((g, gi) => {
        const total = (g.items || []).length;
        if (!total) return;
        const wrong = gi === 0 ? (wrongInFirst || 0) : 0;
        (g.items || []).forEach((it, i) => {
            const a = Array.isArray(it.answer) ? it.answer[0] : it.answer;
            answers[g.id + '-' + i] = (i < total - wrong) ? String(a) : 'ZZZ-wrong';
        });
        checked[g.id] = { correct: total - wrong, total };
    });
    return { answers, checked };
}

module.exports = { ROOT, SRC, read, lift, makePage, mountSession, finishedAttempt, ack, groupsFor, FNS };
