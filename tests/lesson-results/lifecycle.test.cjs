/* ============================================================================
 * STUDENT STATE LIFECYCLE — audit regression suite
 * ----------------------------------------------------------------------------
 * Covers the five states a paid-course topic can be in and the transitions
 * between them:
 *
 *     UNTOUCHED -> DRAFT -> CHECKED -> COMPLETED
 *                    ^                    |
 *                    +------ RETRY -------+
 *
 * Every test drives REAL production code: the collectors, draft engine,
 * persistence and restore layer are loaded verbatim from
 * course-global-fixes.js; the analytics assertions import the real
 * buildStudentDashboard; the Firestore-writer assertions read the real
 * firebase-utils.js / paid-platform.js source.
 *
 * Written against the defects found in the July 2026 lifecycle audit:
 *   A  draft captured only native MC + blanks (B1 lost 100% of work)
 *   B  a draft-only document masqueraded as a graded result
 *   C  firebase-utils.saveQuizResult wrote without merge (cross-page clobber)
 *   E  an unchecked draft was flattened into analytics "answers"
 * ==========================================================================*/
'use strict';

const fs = require('fs');
const path = require('path');
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch (e) { console.error('jsdom is required: npm i -D jsdom'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'course-global-fixes.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (extra ? '\n      ' + extra : '')); }
}
function eq(name, actual, expected) {
    ok(name, Object.is(actual, expected),
       'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitFor(fn, ms = 4000, step = 25) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        let v; try { v = fn(); } catch (e) { v = null; }
        if (v) return v;
        await sleep(step);
    }
    return null;
}

/* ------------------------------------------------------------- fixtures */

/* One topic containing EVERY materially different answer hook used by the
   paid courses, so a single lifecycle run exercises all of them:
     native MC          .quiz-options[data-question] > .quiz-option.selected
     native blank       input[data-blank]
     B1 choice          [data-t1-row] > .t1-opt.selected
     B1 / A1 input      [data-t1-input]
     generic input      input[data-topicN-eM]
     extraExercises     input[data-section][data-index]
     topic4 fill        input[data-topic4-fill]
     topic5 select      .topic5-select-blank[data-topic5-select][data-value]
     sentence builder   input[data-topicN-builder-selected]
     chips              [data-topicN-eM-row] > .selected
     B2 inline blank    .blank-input-inline[data-q-index][data-input-index]  */
function mixedDom() {
    return `
    <div id="lesson">
      <div id="lessonContent"></div>
      <div id="quizSection">
        <div class="quiz-container">
          <div class="quiz-options" data-question="0">
            <div class="quiz-option" data-option="0">Хорошо</div>
            <div class="quiz-option" data-option="1">Плохо</div>
          </div>
          <input type="text" data-blank="0">
          <div class="exercise-block">
            <div data-t1-row="ex1-0">
              <button class="t1-opt" data-value="работает"></button>
              <button class="t1-opt" data-value="работаю"></button>
            </div>
            <input data-t1-input="ex2-0">
            <input type="text" data-topic7-e1="0">
            <input type="text" data-section="section1" data-index="0">
            <input type="text" data-topic4-fill="0">
            <span class="topic5-select-blank" data-topic5-select="0"></span>
            <input type="hidden" data-topic7-builder-selected="0">
            <div data-topic7-builder-target="0"></div>
            <div data-topic7-e3-row="0">
              <button class="chip" data-value="мой"></button>
              <button class="chip" data-value="моя"></button>
            </div>
            <input class="blank-input-inline" data-q-index="0" data-input-index="0">
          </div>
        </div>
      </div>
      <div class="results-section" id="resultsSection">
        <div class="score-display" id="scoreDisplay">Sizning natijangiz: 0/10</div>
        <div class="results-message" id="resultsMessage">Test natijalaringiz</div>
        <div class="correct-answers" id="correctAnswers"></div>
        <button class="complete-btn" id="completeBtn" style="display:none"></button>
        <button class="retry-btn" id="retryBtn" style="display:none"></button>
      </div>
    </div>`;
}

const MIXED_TOPIC = {
    id: 7,
    title: 'Aralash mashqlar',
    quiz: {
        mcQuestions: ['Как дела?'], mcOptions: [['Хорошо', 'Плохо']], mcAnswers: [0],
        blankQuestions: ['Меня … Иван.'], blankAnswers: ['зовут']
    },
    topic7Exercises: {
        exercise1: { title: 'Tarjima', items: [{ prompt: 'Kitob', answer: 'книга' }] },
        exercise2: { title: 'Gap tuzing', items: [{ words: ['я', 'дома'], answers: ['я дома'], prompt: 'Gap' }] },
        exercise3: { title: 'Tanlang', items: [{ prompt: 'Bu …', options: ['мой', 'моя'], answer: 'мой' }] }
    }
};

/* Mock of users/{uid}/quizResults with setDoc-merge semantics. */
function makeStore(seed) {
    const docs = Object.assign({}, seed || {});
    return {
        docs, writes: 0, reads: 0, failNextWrite: false, writeDelayMs: 0,
        async merge(topicId, patch) {
            if (this.failNextWrite) { this.failNextWrite = false; throw new Error('network down'); }
            if (this.writeDelayMs) await sleep(this.writeDelayMs);
            this.writes++;
            const id = 'topic_' + topicId;
            docs[id] = Object.assign({}, docs[id], patch);
            return true;
        },
        async get(topicId) {
            this.reads++;
            if (this.readDelayMs) await sleep(this.readDelayMs);
            const d = docs['topic_' + topicId];
            return d ? JSON.parse(JSON.stringify(d)) : null;
        }
    };
}

function makeDom(bodyHtml, url) {
    const virtualConsole = new VirtualConsole();
    let muted = false;
    virtualConsole.on('jsdomError', (e) => { if (!muted) console.error(String((e && e.message) || e)); });
    ['log', 'info', 'warn', 'error'].forEach(l => {
        virtualConsole.on(l, (...a) => { if (!muted) console[l](...a); });
    });
    const dom = new JSDOM('<!DOCTYPE html><body>' + bodyHtml + '</body>',
        { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
    const orig = dom.window.close.bind(dom.window);
    dom.window.close = function () { muted = true; orig(); };
    dom.window.HTMLElement.prototype.scrollIntoView = function () {};
    dom.window.alert = function () {};
    return dom;
}

function boot({ url = 'https://uzdarus.uz/paid-courses/b1-course.html',
                store = makeStore(), uid = 'u1', topic = MIXED_TOPIC } = {}) {
    const dom = makeDom(mixedDom(), url);
    const w = dom.window;
    w.courseData = { topics: [topic] };
    w.currentTopicId = topic.id;
    w.currentUserId = uid;
    w.checkAnswers = async function () {};
    w.saveLessonResult = (u, t, s, c) => store.merge(t, { lessonResult: s, course: c });
    w.saveLessonDraft = (u, t, d, c) => store.merge(t, { lessonDraft: d, course: c });
    w.getTopicQuizResult = (u, t) => store.get(t);
    w.eval(SRC);
    return { dom, w, store };
}

const api = (w) => w.__uzLessonResults;

function answerEverything(w, v = {}) {
    const d = w.document;
    const mc = v.mc === undefined ? 0 : v.mc;
    d.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
    if (mc !== null) d.querySelector(`.quiz-option[data-option="${mc}"]`).classList.add('selected');
    d.querySelector('input[data-blank="0"]').value = v.blank === undefined ? 'зовут' : v.blank;
    d.querySelectorAll('.t1-opt').forEach(o => o.classList.remove('selected'));
    if (v.t1choice !== null) d.querySelector(`.t1-opt[data-value="${v.t1choice || 'работает'}"]`).classList.add('selected');
    d.querySelector('[data-t1-input="ex2-0"]').value = v.t1input === undefined ? 'врач' : v.t1input;
    d.querySelector('input[data-topic7-e1="0"]').value = v.e1 === undefined ? 'книга' : v.e1;
    d.querySelector('input[data-section="section1"][data-index="0"]').value = v.section === undefined ? 'мой' : v.section;
    d.querySelector('input[data-topic4-fill="0"]').value = v.fill === undefined ? 'в' : v.fill;
    d.querySelector('.topic5-select-blank').dataset.value = v.t5 === undefined ? 'эта' : v.t5;
    d.querySelector('input[data-topic7-builder-selected="0"]').value = (v.builder === undefined ? 'я дома' : v.builder).split(' ').join('|');
    const row = d.querySelector('[data-topic7-e3-row="0"]');
    row.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
    if (v.chip !== null) row.querySelector(`.chip[data-value="${v.chip || 'мой'}"]`).classList.add('selected');
    d.querySelector('.blank-input-inline').value = v.b2blank === undefined ? 'провёл' : v.b2blank;
}

function snapshotDom(w) {
    const d = w.document;
    const sel = (s) => d.querySelector(s);
    return {
        mc: sel('.quiz-option.selected') ? sel('.quiz-option.selected').getAttribute('data-option') : null,
        blank: sel('input[data-blank="0"]').value,
        t1choice: sel('.t1-opt.selected') ? sel('.t1-opt.selected').getAttribute('data-value') : null,
        t1input: sel('[data-t1-input="ex2-0"]').value,
        e1: sel('input[data-topic7-e1="0"]').value,
        section: sel('input[data-section="section1"][data-index="0"]').value,
        fill: sel('input[data-topic4-fill="0"]').value,
        t5: sel('.topic5-select-blank').dataset.value || '',
        builder: sel('input[data-topic7-builder-selected="0"]').value,
        chip: sel('[data-topic7-e3-row="0"] .selected') ? sel('[data-topic7-e3-row="0"] .selected').getAttribute('data-value') : null,
        b2blank: sel('.blank-input-inline').value
    };
}

/* ============================================================== the suite */

(async function run() {

console.log('\n[L1] DRAFT capture covers every exercise type (BUG A)');
{
    const { w, dom, store } = boot();
    answerEverything(w);
    const draft = api(w).captureDraft(w.document);
    const keys = Object.keys(draft.fields || {});

    ok('native MC captured', keys.some(k => k.indexOf('data-question') === 0));
    ok('native blank captured', keys.some(k => k.indexOf('data-blank') === 0));
    ok('B1 choice row captured', keys.some(k => k.indexOf('data-t1-row') === 0));
    ok('B1 text input captured', keys.some(k => k.indexOf('data-t1-input') === 0));
    ok('generic topicN input captured', keys.some(k => k.indexOf('data-topic7-e1') === 0));
    // Keys are the element's own data-* attributes, sorted and joined.
    ok('extraExercises input captured', keys.some(k => k.indexOf('data-section=section1') !== -1));
    ok('topic4 fill captured', keys.some(k => k.indexOf('data-topic4-fill') === 0));
    ok('topic5 select captured', keys.some(k => k.indexOf('data-topic5-select') === 0));
    ok('sentence builder captured', keys.some(k => k.indexOf('data-topic7-builder-selected') === 0));
    ok('chip row captured', keys.some(k => k.indexOf('data-topic7-e3-row') === 0));
    ok('B2 inline blank captured', keys.some(k => k.indexOf('data-q-index=0') !== -1));
    ok('draft carries a timestamp', typeof draft.savedAt === 'number' && draft.savedAt > 0);
    ok('draft stores NO grading state', !JSON.stringify(draft).match(/isCorrect|fb-correct|incorrect/));
    dom.window.close();
}

console.log('\n[L2] DRAFT restores every exercise type into a clean DOM');
{
    const { w: w1, dom: d1 } = boot();
    answerEverything(w1);
    const expected = snapshotDom(w1);
    const draft = api(w1).captureDraft(w1.document);
    d1.window.close();

    const { w: w2, dom: d2 } = boot();
    api(w2).applyDraft(w2.document, draft);
    const actual = snapshotDom(w2);

    Object.keys(expected).forEach((k) => {
        eq('restored ' + k, actual[k], expected[k]);
    });
    ok('restored DOM carries NO correct/incorrect styling',
        !w2.document.querySelector('.correct, .incorrect, .correct-answer, .wrong-answer, .t1-ok, .t1-bad'));
    d2.window.close();
}

console.log('\n[L3] INVARIANT 2 — a draft never renders as a checked result');
{
    const store = makeStore();
    const { w, dom } = boot({ store });
    answerEverything(w);
    await api(w).persistDraft(7);
    await sleep(50);

    ok('draft written under its own field, not lessonResult',
       !!store.docs['topic_7'].lessonDraft && !store.docs['topic_7'].lessonResult);

    // Reopen: draft restores, but nothing graded is shown.
    const { w: w2, dom: d2 } = boot({ store: makeStore(store.docs) });
    await waitFor(() => w2.document.querySelector('input[data-blank="0"]').value === 'зовут');
    eq('draft answers restored on reopen', snapshotDom(w2).blank, 'зовут');
    const fb = w2.document.querySelector('.topic-feedback');
    eq('no feedback cards rendered', fb ? fb.innerHTML : '', '');
    ok('results section NOT shown', !w2.document.getElementById('resultsSection').classList.contains('show'));
    eq('score block untouched', w2.document.getElementById('scoreDisplay').textContent, 'Sizning natijangiz: 0/10');
    ok('no correct/incorrect styling', !w2.document.querySelector('.correct, .incorrect'));
    d2.window.close(); dom.window.close();
}

console.log('\n[L4] Draft survives topic switch, reload and re-login');
{
    const store = makeStore();
    const { w, dom } = boot({ store });
    answerEverything(w, { blank: 'зов', e1: 'кни' });          // partially typed
    await api(w).persistDraft(7);
    dom.window.close();                                         // leave the topic

    // (a) fresh page load, same account = reload / new tab / re-login / new device
    const s2 = makeStore(store.docs);
    const { w: w2, dom: d2 } = boot({ store: s2 });
    await waitFor(() => w2.document.querySelector('input[data-blank="0"]').value);
    eq('partial blank restored after reload', snapshotDom(w2).blank, 'зов');
    eq('partial input restored after reload', snapshotDom(w2).e1, 'кни');
    ok('restore read from the account, not only localStorage', s2.reads > 0);
    d2.window.close();
}

console.log('\n[L5] CHECKED supersedes DRAFT; retry brings the draft back');
{
    const store = makeStore();
    const { w, dom, store: st } = boot({ store });
    answerEverything(w);
    await api(w).persistDraft(7);
    await sleep(30);
    ok('draft present before checking', !!st.docs['topic_7'].lessonDraft);

    const btn = await waitFor(() => w.document.querySelector('.check-topic-btn'));
    const before = st.writes;
    btn.click();
    await waitFor(() => st.writes > before, 3000);
    await sleep(200);

    ok('checked result stored', !!st.docs['topic_7'].lessonResult);
    ok('draft cleared once the attempt was graded', !st.docs['topic_7'].lessonDraft);
    dom.window.close();
}

console.log('\n[L6] Reopening a CHECKED topic restores the result, not a draft');
{
    const store = makeStore();
    const { w, dom, store: st } = boot({ store });
    answerEverything(w);
    const btn = await waitFor(() => w.document.querySelector('.check-topic-btn'));
    const before = st.writes;
    btn.click();
    await waitFor(() => st.writes > before, 3000);
    dom.window.close();

    const { w: w2, dom: d2, store: st2 } = boot({ store: makeStore(st.docs) });
    const fb = await waitFor(() => {
        const n = w2.document.querySelector('.topic-feedback');
        return n && n.innerHTML ? n : null;
    });
    ok('checked result restored', !!fb && /fb-summary-score/.test(fb.innerHTML));
    eq('reopening writes nothing', st2.writes, 0);
    d2.window.close();
}

console.log('\n[L7] RETRY — old result must not repaint over the new attempt');
{
    const store = makeStore();
    const { w, dom, store: st } = boot({ store });
    answerEverything(w);
    const btn = await waitFor(() => w.document.querySelector('.check-topic-btn'));
    const b0 = st.writes;
    btn.click();
    await waitFor(() => st.writes > b0, 3000);
    dom.window.close();

    // Reopen with a DELIBERATELY SLOW account read, then retry immediately.
    const slow = makeStore(st.docs);
    slow.readDelayMs = 700;
    const { w: w2, dom: d2 } = boot({ store: slow });

    await sleep(60);                                   // restore request in flight
    w2.document.getElementById('retryBtn').click();    // student hits retry NOW
    answerEverything(w2, { blank: 'НОВЫЙ', e1: 'НОВЫЙ2' });
    await sleep(1400);                                 // the old read resolves late

    const s = snapshotDom(w2);
    eq('new answer NOT overwritten by the late restore', s.blank, 'НОВЫЙ');
    eq('second new answer intact', s.e1, 'НОВЫЙ2');
    const fb = w2.document.querySelector('.topic-feedback');
    eq('no stale result painted after retry', fb ? fb.innerHTML : '', '');
    ok('stored result still on the account (history preserved)', !!slow.docs['topic_7'].lessonResult);
    d2.window.close();
}

console.log('\n[L8] RETRY -> partial answers -> leave -> return restores the NEW draft');
{
    const store = makeStore();
    const { w, dom, store: st } = boot({ store });
    answerEverything(w);
    const btn = await waitFor(() => w.document.querySelector('.check-topic-btn'));
    const b0 = st.writes;
    btn.click();
    await waitFor(() => st.writes > b0, 3000);
    await sleep(150);

    w.document.getElementById('retryBtn').click();
    answerEverything(w, { blank: 'ПОВТОР', e1: 'ПОВТОР2' });
    await api(w).persistDraft(7);
    await sleep(50);
    dom.window.close();

    const { w: w2, dom: d2 } = boot({ store: makeStore(st.docs) });
    await waitFor(() => w2.document.querySelector('input[data-blank="0"]').value);
    eq('the NEWER retry draft wins over the older checked result', snapshotDom(w2).blank, 'ПОВТОР');
    const fb = w2.document.querySelector('.topic-feedback');
    eq('old result not shown over the new attempt', fb ? fb.innerHTML : '', '');
    d2.window.close();
}

console.log('\n[L9] INVARIANT 6 — Topic A async data can never land in Topic B');
{
    const store = makeStore();
    // Topic 7 has a stored result; topic 8 has none.
    store.docs['topic_7'] = {
        course: 'B1',
        lessonResult: {
            v: 1, course: 'B1', topicId: 7, completedAt: '2026-01-01T00:00:00.000Z',
            results: [{ label: 'TOPIC-7-MARKER', question: 'q', userAnswer: 'a',
                        correctAnswer: 'a', isCorrect: true, explanation: 'e' }]
        }
    };
    store.readDelayMs = 600;
    const { w, dom } = boot({ store, topic: Object.assign({}, MIXED_TOPIC, { id: 7 }) });

    await sleep(60);                    // topic 7 read in flight
    w.currentTopicId = 8;               // student navigates to topic 8
    api(w)._resetForTests('B1');        // page rebuilds controls for the new topic
    await sleep(1200);                  // topic 7's read resolves late

    const fb = w.document.querySelector('.topic-feedback');
    ok('topic 7 result did NOT render while topic 8 is open',
       !fb || fb.innerHTML.indexOf('TOPIC-7-MARKER') === -1);
    dom.window.close();
}

console.log('\n[L10] Rapid navigation 7 -> 8 -> 9 -> 7 settles on the right topic');
{
    const store = makeStore();
    store.docs['topic_7'] = {
        course: 'B1',
        lessonResult: { v: 1, course: 'B1', topicId: 7, completedAt: '2026-01-01T00:00:00.000Z',
            results: [{ label: 'T7', question: 'q', userAnswer: 'SEVEN', correctAnswer: 'SEVEN', isCorrect: true, explanation: 'e' }] }
    };
    store.readDelayMs = 200;
    const { w, dom } = boot({ store });
    w.currentTopicId = 8; api(w)._resetForTests('B1'); await sleep(80);
    w.currentTopicId = 9; api(w)._resetForTests('B1'); await sleep(80);
    w.currentTopicId = 7; api(w)._resetForTests('B1');
    const fb = await waitFor(() => {
        const n = w.document.querySelector('.topic-feedback');
        return n && n.innerHTML ? n : null;
    }, 3000);
    ok('topic 7 result shown after returning to topic 7', !!fb && /SEVEN/.test(fb.innerHTML));
    dom.window.close();
}

console.log('\n[L11] BUG C — no quizResults writer may clobber sibling fields');
{
    const writers = [
        ['firebase-utils.js', /export async function saveQuizResult[\s\S]*?\n\}/],
        ['paid-courses/paid-platform.js', /async function firestoreSaveQuizResult[\s\S]*?\n\}/],
        ['paid-courses/paid-platform.js', /async function firestoreSaveLessonResult[\s\S]*?\n\}/],
    ];
    writers.forEach(([file, re]) => {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
        const m = src.match(re);
        ok(file + ' :: writer found', !!m);
        if (!m) return;
        const body = m[0];
        const usesSetDoc = /setDoc\(/.test(body);
        const merges = /\{\s*merge:\s*true\s*\}/.test(body);
        ok(file + ' :: setDoc uses { merge: true }', !usesSetDoc || merges,
           'a non-merge setDoc on quizResults erases lessonResult / lessonDraft / native answers');
    });
}

console.log('\n[L12] BUG E — analytics must not treat drafts as submitted answers');
{
    const { buildStudentDashboard } = await import('../../api/_lib/analytics.js');
    const dash = buildStudentDashboard({
        profile: { courses: {} },
        quizResults: [{
            id: 'topic_7', course: 'B1',
            lessonDraft: { fields: { 'data-blank=0': { t: 'v', v: 'зов' } }, savedAt: 1750000000000 },
            draft: { mc: { '0': '1' }, blanks: { '0': 'зов' }, savedAt: 1750000000000 }
        }],
        certificates: [], summary: null, events: []
    });
    const ex = dash.exercises[0];
    eq('an unchecked draft contributes ZERO answers', ex.answers.length, 0);
    eq('an unchecked draft is not scored', ex.score, null);
    eq('an unchecked draft is not marked passed', ex.passed, null);

    const dash2 = buildStudentDashboard({
        profile: { courses: {} },
        quizResults: [{ id: 'topic_3', course: 'A1', score: 8, total: 10,
                        section1: { q1: 'мой', q2: 'моя' } }],
        certificates: [], summary: null, events: []
    });
    eq('genuine graded answers still surface', dash2.exercises[0].answers.length, 2);
    eq('genuine score still surfaces', dash2.exercises[0].score, 8);
}

console.log('\n[L13] Draft writes are debounced, not one-per-keystroke');
{
    const store = makeStore();
    const { w, dom } = boot({ store });
    const input = w.document.querySelector('input[data-blank="0"]');
    for (let i = 0; i < 25; i++) {                 // simulate fast typing
        input.value = 'з'.repeat(i + 1);
        input.dispatchEvent(new w.Event('input', { bubbles: true }));
    }
    await sleep(1600);
    ok('many keystrokes produced at most one account write', store.writes <= 1,
       'writes=' + store.writes);
    dom.window.close();
}

console.log('\n[L14] Stale draft write cannot overwrite newer state (out-of-order saves)');
{
    const store = makeStore();
    const { w, dom } = boot({ store });
    answerEverything(w, { blank: 'СТАРЫЙ' });
    const slowSave = api(w).persistDraft(7);        // begins with the OLD value
    answerEverything(w, { blank: 'НОВЫЙ' });
    await api(w).persistDraft(7);                   // newer value
    await slowSave;
    await sleep(120);
    const stored = store.docs['topic_7'].lessonDraft;
    const blankKey = Object.keys(stored.fields).find(k => k.indexOf('data-blank') === 0);
    eq('newest draft value survives', stored.fields[blankKey].v, 'НОВЫЙ');
    dom.window.close();
}

console.log('\n[L15] Failure handling — the lesson stays usable and work is not destroyed');
{
    const store = makeStore();
    const { w, dom } = boot({ store });
    answerEverything(w);
    await api(w).persistDraft(7);
    const good = JSON.stringify(store.docs['topic_7'].lessonDraft);

    store.failNextWrite = true;
    answerEverything(w, { blank: 'ХОРОШО' });
    let threw = false;
    try { await api(w).persistDraft(7); } catch (e) { threw = true; }
    ok('a failed draft write does not throw at the caller', !threw);
    eq('previous good draft still on the account', JSON.stringify(store.docs['topic_7'].lessonDraft), good);
    eq('the student can keep working', w.document.querySelector('input[data-blank="0"]').value, 'ХОРОШО');

    // Reading failures must not break the page either.
    const broken = makeStore();
    broken.get = async () => { throw new Error('permission denied'); };
    const { w: w3, dom: d3 } = boot({ store: broken });
    await sleep(1400);
    ok('a failing account read leaves a usable lesson',
       !!w3.document.querySelector('.check-topic-btn'));
    d3.window.close(); dom.window.close();
}

console.log('\n[L16] Guests and demo pages never write lifecycle data');
{
    const store = makeStore();
    const { w, dom } = boot({ url: 'https://uzdarus.uz/b1-demo.html', store });
    answerEverything(w);
    const btn = await waitFor(() => w.document.querySelector('.check-topic-btn'));
    btn.click();
    await sleep(1500);
    eq('demo page wrote nothing', store.writes, 0);
    eq('demo page read nothing', store.reads, 0);
    dom.window.close();

    const s2 = makeStore();
    const { w: w2, dom: d2 } = boot({ store: s2, uid: null });
    answerEverything(w2);
    await api(w2).persistDraft(7);
    await sleep(200);
    eq('signed-out user performs no account write', s2.writes, 0);
    d2.window.close();
}

console.log('\n[L17] BUG B — a draft-only document must not drive the saved-result UI');
{
    /* Executes the REAL gate expression and the REAL displaySavedResults()
       lifted from each course file. */
    const files = [
        ['A1', 'paid-courses/a1-course.html'],
        ['A2', 'paid-courses/a2-course.html'],
        ['B1', 'paid-courses/b1-course.html'],
    ];
    // Exactly what `saveQuizResult(uid, topicId, { draft }, course)` leaves behind.
    const DRAFT_ONLY = { draft: { mc: { '0': '1' }, blanks: { '0': 'зов' }, savedAt: Date.now() },
                         lessonDraft: { v: 1, savedAt: Date.now(), fields: {} },
                         course: 'A1', updatedAt: {} };
    const GRADED = { mcAnswers: [0], blankAnswers: ['зовут'], score: 2,
                     timestamp: '2026-01-01T00:00:00.000Z', course: 'A1' };

    files.forEach(([code, rel]) => {
        const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        const gate = src.match(/const topicResults = \(topicDoc[\s\S]*?\? topicDoc : null;/);
        ok(code + ': graded-result gate present', !!gate);
        if (!gate) return;
        const decide = new Function('topicDoc', gate[0] + ' return topicResults;');
        eq(code + ': draft-only document is NOT a result', decide(DRAFT_ONLY), null);
        ok(code + ': genuinely graded document IS a result', decide(GRADED) === GRADED);
        eq(code + ': absent document is NOT a result', decide(undefined), null);
    });

    // End-to-end on A1: the real renderer must never be handed a draft-only doc.
    const a1 = fs.readFileSync(path.join(ROOT, 'paid-courses/a1-course.html'), 'utf8');
    const dsr = a1.match(/function displaySavedResults\(topic, topicResults, topicId\)[\s\S]*?\n        \}/)[0];
    const dom = makeDom(
        '<div class="results-section" id="resultsSection"><div id="scoreDisplay">Sizning natijangiz: 0/10</div>' +
        '<div id="resultsMessage">Test natijalaringiz</div><div id="correctAnswers"></div>' +
        '<button id="completeBtn" style="display:none"></button><button id="retryBtn" style="display:none"></button></div>',
        'https://uzdarus.uz/paid-courses/a1-course.html');
    const w = dom.window;
    w.eval('var resultsSection=document.getElementById("resultsSection");' +
           'var completeBtn=document.getElementById("completeBtn");' +
           'var retryBtn=document.getElementById("retryBtn");var PASSING_SCORE=7;' +
           dsr + '; window.__dsr = displaySavedResults;');
    const gateSrc = a1.match(/const topicResults = \(topicDoc[\s\S]*?\? topicDoc : null;/)[0];
    const decideA1 = new Function('topicDoc', gateSrc + ' return topicResults;');
    const shouldRender = decideA1(DRAFT_ONLY);
    eq('A1 end-to-end: renderer is NOT invoked for a draft-only doc', shouldRender, null);
    if (shouldRender) { try { w.__dsr({ id: 1, quiz: {} }, shouldRender, 1); } catch (e) { /* would throw */ } }
    eq('score display untouched', w.document.getElementById('scoreDisplay').textContent,
       'Sizning natijangiz: 0/10');
    eq('no false failure message', w.document.getElementById('resultsMessage').innerHTML,
       'Test natijalaringiz');
    ok('results section stays hidden', !w.document.getElementById('resultsSection').classList.contains('show'));
    dom.window.close();
}

console.log('\n[L18] Draft branch is reachable again (the same gate feeds it)');
{
    /* loadQuiz restores a draft only when `!topicResults`. With the fixed gate
       a draft-only document yields null, so the draft branch runs. */
    const a1 = fs.readFileSync(path.join(ROOT, 'paid-courses/a1-course.html'), 'utf8');
    const gate = a1.match(/const topicResults = \(topicDoc[\s\S]*?\? topicDoc : null;/)[0];
    const decide = new Function('topicDoc', gate + ' return topicResults;');
    const draftOnly = { draft: { mc: { '0': '1' }, blanks: {}, savedAt: 1 }, course: 'A1' };
    ok('!topicResults is TRUE for a draft-only doc -> restoreQuizDraft() runs', !decide(draftOnly));
    ok('!topicResults is FALSE once graded -> the result is shown instead',
       !!decide({ mcAnswers: [0], score: 5 }));
}

console.log("\n[L19] A2's bespoke hooks are drafted even though the result layer skips them");
{
    /* A2 topics 1-3 render data-t1-pn / data-t1-fill / data-t1-mc /
       data-t1-builder-selected and data-t2-* / data-t3-* markup that the
       result collectors do not read (a documented gap — A2 grades them with
       its own scorer). The DRAFT layer is attribute-agnostic, so it must
       still preserve this work. */
    const A2_DOM = `
      <div id="lesson"><div id="lessonContent"></div><div id="quizSection"><div class="quiz-container">
        <div data-t1-pn="0"><button class="t1-pn-btn" data-value="Правда"></button>
                            <button class="t1-pn-btn" data-value="Неправда"></button></div>
        <input data-t1-fill="0">
        <div data-t1-mc="0"><button class="t1-mc-opt" data-value="была"></button>
                            <button class="t1-mc-opt" data-value="был"></button></div>
        <input data-t1-builder-selected="0">
        <input data-t2-mini="0">
        <div data-t2-chip="0"><button class="chip" data-value="мой"></button>
                              <button class="chip" data-value="моя"></button></div>
        <input data-t3-fill="0">
        <input data-t3-builder-selected="0">
      </div></div>
      <div class="results-section" id="resultsSection"><div id="scoreDisplay">Sizning natijangiz: 0/10</div>
      <div id="resultsMessage"></div><div id="correctAnswers"></div>
      <button id="completeBtn" style="display:none"></button>
      <button id="retryBtn" style="display:none"></button></div></div>`;

    const dom = makeDom(A2_DOM, 'https://uzdarus.uz/paid-courses/a2-course.html');
    const w = dom.window;
    w.courseData = { topics: [{ id: 1, title: 'A2', quiz: { mcQuestions: [], blankQuestions: [] } }] };
    w.currentTopicId = 1;
    w.currentUserId = 'u1';
    w.checkAnswers = async function () {};
    w.eval(SRC);

    const d = w.document;
    d.querySelector('[data-t1-pn="0"] .t1-pn-btn[data-value="Правда"]').classList.add('selected');
    d.querySelector('[data-t1-fill="0"]').value = 'У меня есть семья';
    d.querySelector('[data-t1-mc="0"] .t1-mc-opt[data-value="была"]').classList.add('selected');
    d.querySelector('[data-t1-builder-selected="0"]').value = 'я|дома';
    d.querySelector('[data-t2-mini="0"]').value = 'книга';
    d.querySelector('[data-t2-chip="0"] .chip[data-value="мой"]').classList.add('selected');
    d.querySelector('[data-t3-fill="0"]').value = 'дом';
    d.querySelector('[data-t3-builder-selected="0"]').value = 'он|тут';

    const draft = api(w).captureDraft(d);
    const k = Object.keys(draft.fields);
    ok('A2 pravda/nepravda captured', k.some(x => x.indexOf('data-t1-pn') === 0));
    ok('A2 text fill captured', k.some(x => x.indexOf('data-t1-fill') === 0));
    ok('A2 multiple choice captured', k.some(x => x.indexOf('data-t1-mc') === 0));
    ok('A2 builder captured', k.some(x => x.indexOf('data-t1-builder-selected') === 0));
    ok('A2 topic-2 mini captured', k.some(x => x.indexOf('data-t2-mini') === 0));
    ok('A2 topic-2 chips captured', k.some(x => x.indexOf('data-t2-chip') === 0));
    ok('A2 topic-3 fill captured', k.some(x => x.indexOf('data-t3-fill') === 0));
    ok('A2 topic-3 builder captured', k.some(x => x.indexOf('data-t3-builder-selected') === 0));

    // wipe + restore
    d.querySelectorAll('input').forEach(i => { i.value = ''; });
    d.querySelectorAll('.selected').forEach(e => e.classList.remove('selected'));
    api(w).applyDraft(d, draft);

    eq('A2 fill restored', d.querySelector('[data-t1-fill="0"]').value, 'У меня есть семья');
    eq('A2 builder restored', d.querySelector('[data-t1-builder-selected="0"]').value, 'я|дома');
    eq('A2 mini restored', d.querySelector('[data-t2-mini="0"]').value, 'книга');
    eq('A2 t3 builder restored', d.querySelector('[data-t3-builder-selected="0"]').value, 'он|тут');
    ok('A2 pravda selection restored',
       d.querySelector('[data-t1-pn="0"] .t1-pn-btn[data-value="Правда"]').classList.contains('selected'));
    ok('A2 MC selection restored',
       d.querySelector('[data-t1-mc="0"] .t1-mc-opt[data-value="была"]').classList.contains('selected'));
    ok('A2 chip selection restored',
       d.querySelector('[data-t2-chip="0"] .chip[data-value="мой"]').classList.contains('selected'));
    dom.window.close();
}

console.log('\n[L20] Course content changed since the draft was saved — must fail safe');
{
    const { w, dom } = boot();
    const stale = {
        v: 1, savedAt: Date.now(),
        fields: {
            'data-blank=0': { t: 'v', v: 'зовут' },                 // still exists
            'data-blank=99': { t: 'v', v: 'исчез' },                // removed question
            'data-topic7-e1=42': { t: 'v', v: 'ушёл' },             // removed exercise
            'data-t1-row=ex9-9': { t: 's', v: 'нет такого' }        // removed row
        }
    };
    let threw = false;
    try { api(w).applyDraft(w.document, stale); } catch (e) { threw = true; }
    ok('a stale draft never throws', !threw);
    eq('the field that still exists is restored', w.document.querySelector('input[data-blank="0"]').value, 'зовут');
    ok('no phantom nodes created', !w.document.querySelector('[data-blank="99"]'));

    // Malformed payloads must be neutralised before they reach the DOM.
    const s = api(w).sanitizeDraft;
    eq('null draft -> null', s(null), null);
    eq('string draft -> null', s('nope'), null);
    eq('draft without fields -> null', s({ savedAt: 1 }), null);
    eq('draft with empty fields -> null', s({ fields: {} }), null);
    eq('draft of junk fields -> null', s({ fields: { a: null, b: 7, c: 'x' } }), null);
    ok('partially valid draft keeps only the valid fields',
       Object.keys(s({ fields: { good: { t: 'v', v: 'x' }, bad: null } }).fields).length === 1);
    dom.window.close();
}

console.log('\n[L21] COMPLETION — idempotent, never duplicated, never implicit');
{
    /* Drives the REAL __uzCompleteTopic + saveProgressToFirebase race-guard
       merge lifted from a1-course.html. */
    const a1 = fs.readFileSync(path.join(ROOT, 'paid-courses/a1-course.html'), 'utf8');
    const completeSrc = a1.match(/window\.__uzCompleteTopic = async function[\s\S]*?\n        \};/)[0];
    const mergeSrc = a1.match(/const merged = Array\.from\(new Set\(\[\.\.\.remote, \.\.\.completedTopics\]\)\)[\s\S]*?\.sort\(\(a, b\) => a - b\);/)[0];

    const dom = makeDom('<div id="topics"></div><div id="resultsSection"></div>',
                        'https://uzdarus.uz/paid-courses/a1-course.html');
    const w = dom.window;
    w.__saves = 0;
    w.eval(
        'var completedTopics = [];' +
        'var currentUser = null;' +
        'var courseData = { topics: [{ id: 5, title: "T5" }] };' +
        'async function saveProgressToFirebase(){ window.__saves++; return true; }' +
        'function updateProgress(){}' +
        'function loadTopics(){}' +
        'function clearQuizDraft(){}' +
        completeSrc +
        'window.__completed = function(){ return completedTopics; };'
    );

    await w.__uzCompleteTopic(5);
    eq('topic recorded once', JSON.stringify(w.__completed()), '[5]');
    eq('one progress write', w.__saves, 1);

    await w.__uzCompleteTopic(5);      // double-click / re-entry
    await w.__uzCompleteTopic(5);
    eq('re-completing does NOT duplicate the id', JSON.stringify(w.__completed()), '[5]');
    eq('re-completing performs no extra progress write', w.__saves, 1);
    dom.window.close();

    // The union merge must dedupe and never regress remote progress.
    const merge = new Function('remote', 'completedTopics', mergeSrc + ' return merged;');
    eq('duplicates collapsed', JSON.stringify(merge([1, 2, 2, 3], [3, 3, 4])), '[1,2,3,4]');
    eq('stale local cannot erase remote', JSON.stringify(merge([1, 2, 3], [])), '[1,2,3]');
    eq('non-numeric ids filtered out', JSON.stringify(merge([1, null, 'x'], [2, undefined])), '[1,2]');
    eq('order normalised', JSON.stringify(merge([9, 3], [5])), '[3,5,9]');
}

console.log('\n[L22] INVARIANT 11 — restoring the UI creates no progress or completion writes');
{
    const store = makeStore();
    const { w, dom, store: st } = boot({ store });
    answerEverything(w);
    const btn = await waitFor(() => w.document.querySelector('.check-topic-btn'));
    const b0 = st.writes;
    btn.click();
    await waitFor(() => st.writes > b0, 3000);
    dom.window.close();

    // Reopen a checked topic and watch EVERY progress channel.
    const st2 = makeStore(st.docs);
    const dom2 = makeDom(mixedDom(), 'https://uzdarus.uz/paid-courses/b1-course.html');
    const w2 = dom2.window;
    let progressWrites = 0, quizWrites = 0, completions = 0;
    w2.courseData = { topics: [MIXED_TOPIC] };
    w2.currentTopicId = MIXED_TOPIC.id;
    w2.currentUserId = 'u1';
    w2.checkAnswers = async function () {};
    w2.saveUserProgress = async function () { progressWrites++; return true; };
    w2.saveQuizResult = async function () { quizWrites++; return true; };
    w2.saveLessonResult = (u, t, s, c) => st2.merge(t, { lessonResult: s, course: c });
    w2.saveLessonDraft = (u, t, d, c) => st2.merge(t, { lessonDraft: d, course: c });
    w2.getTopicQuizResult = (u, t) => st2.get(t);
    w2.__uzCompleteTopic = async function () { completions++; };
    w2.eval(SRC);

    await waitFor(() => {
        const n = w2.document.querySelector('.topic-feedback');
        return n && n.innerHTML ? n : null;
    }, 3000);
    await sleep(900);   // let several observer ticks pass

    eq('no course-progress write', progressWrites, 0);
    eq('no native quiz write', quizWrites, 0);
    eq('no completion triggered', completions, 0);
    eq('no snapshot rewrite', st2.writes, 0);
    dom2.window.close();
}

console.log('\n[L23] Draft and check do not, by themselves, complete a topic');
{
    const store = makeStore();
    const dom = makeDom(mixedDom(), 'https://uzdarus.uz/paid-courses/b1-course.html');
    const w = dom.window;
    let completions = 0, progressWrites = 0;
    w.courseData = { topics: [MIXED_TOPIC] };
    w.currentTopicId = MIXED_TOPIC.id;
    w.currentUserId = 'u1';
    w.checkAnswers = async function () {};
    w.__uzCompleteTopic = async function () { completions++; };
    w.saveUserProgress = async function () { progressWrites++; return true; };
    w.saveLessonResult = (u, t, s, c) => store.merge(t, { lessonResult: s, course: c });
    w.saveLessonDraft = (u, t, d, c) => store.merge(t, { lessonDraft: d, course: c });
    w.getTopicQuizResult = (u, t) => store.get(t);
    w.eval(SRC);

    answerEverything(w);
    await api(w).persistDraft(7);
    eq('drafting completes nothing', completions, 0);
    eq('drafting writes no progress', progressWrites, 0);

    const btn = await waitFor(() => w.document.querySelector('.check-topic-btn'));
    btn.click();
    await sleep(900);
    eq('checking alone completes nothing (the learner must press the button)', completions, 0);
    eq('checking alone writes no course progress', progressWrites, 0);
    ok('but the attempt WAS graded and stored', !!store.docs['topic_7'].lessonResult);
    dom.window.close();
}

console.log('\n[L24] Firebase vs localStorage — deterministic, newest-wins conflict rule');
{
    const { w, dom } = boot();
    const pick = api(w).pickRestoreTarget;
    const result = { completedAt: '2026-01-10T00:00:00.000Z', results: [{}] };
    const olderDraft = { savedAt: Date.parse('2026-01-05T00:00:00.000Z'), fields: { a: { t: 'v', v: 'x' } } };
    const newerDraft = { savedAt: Date.parse('2026-01-20T00:00:00.000Z'), fields: { a: { t: 'v', v: 'x' } } };

    eq('untouched topic -> nothing to restore', pick(null, null), null);
    eq('draft only -> draft', pick(null, newerDraft).kind, 'draft');
    eq('result only -> result', pick(result, null).kind, 'result');
    eq('draft older than the result -> result wins', pick(result, olderDraft).kind, 'result');
    eq('draft newer than the result (retry) -> draft wins', pick(result, newerDraft).kind, 'draft');
    eq('empty draft never beats a result', pick(result, { savedAt: Date.now(), fields: {} }).kind, 'result');

    /* loadDraft resolves local-vs-account by savedAt, account authoritative on ties. */
    const remoteNewer = { v: 1, savedAt: 200, fields: { k: { t: 'v', v: 'REMOTE' } } };
    const localNewer = { v: 1, savedAt: 300, fields: { k: { t: 'v', v: 'LOCAL' } } };
    const store = makeStore({ topic_7: { lessonDraft: remoteNewer } });
    w.getTopicQuizResult = (u, t) => store.get(t);
    try {
        w.localStorage.setItem('uz_lessondraft_u1_B1_7', JSON.stringify(localNewer));
    } catch (e) { /* ignore */ }
    const won = await api(w).loadDraft('B1', 7);
    eq('the newer local draft wins over an older account draft', won.fields.k.v, 'LOCAL');

    try {
        w.localStorage.setItem('uz_lessondraft_u1_B1_7',
            JSON.stringify({ v: 1, savedAt: 100, fields: { k: { t: 'v', v: 'STALE' } } }));
    } catch (e) { /* ignore */ }
    const won2 = await api(w).loadDraft('B1', 7);
    eq('a stale local mirror cannot roll back the account', won2.fields.k.v, 'REMOTE');
    dom.window.close();
}

console.log('\n[L25] Two tabs — last completed attempt wins, nothing is corrupted');
{
    /* Two windows on the same account and topic, saving in sequence. This
       architecture is intentionally last-write-wins per topic document; the
       requirement is that a write is ATOMIC per field, so a late write can
       never merge two attempts into a corrupted hybrid. */
    const shared = makeStore();
    const A = boot({ store: shared });
    const B = boot({ store: shared });

    answerEverything(A.w, { blank: 'TAB-A' });
    answerEverything(B.w, { blank: 'TAB-B' });

    await api(A.w).persistDraft(7);
    await api(B.w).persistDraft(7);

    const stored = shared.docs['topic_7'].lessonDraft;
    const key = Object.keys(stored.fields).find(k => k.indexOf('data-blank') === 0);
    eq('the later save wins wholesale (no hybrid)', stored.fields[key].v, 'TAB-B');

    // A whole-draft write is atomic: no field from tab A survives inside tab B's draft.
    const values = Object.keys(stored.fields).map(k => stored.fields[k].v);
    ok('no mixed-tab contamination', values.indexOf('TAB-A') === -1);

    // A graded result from one tab is not damaged by the other tab's draft.
    const btnA = await waitFor(() => A.w.document.querySelector('.check-topic-btn'));
    const w0 = shared.writes;
    btnA.click();
    await waitFor(() => shared.writes > w0, 3000);
    await sleep(150);
    ok('result and draft live in separate fields', 'lessonResult' in shared.docs['topic_7']);
    await api(B.w).persistDraft(7);
    ok("the other tab's draft did NOT erase the graded result",
       !!shared.docs['topic_7'].lessonResult);
    A.dom.window.close(); B.dom.window.close();
}

/* ------------------------------------------------------------------ report */

console.log('\n' + '─'.repeat(64));
console.log(fail === 0
    ? `  ✅ LIFECYCLE: ${pass}/${pass} assertions passed`
    : `  ❌ LIFECYCLE: ${fail} failed, ${pass} passed`);
console.log('─'.repeat(64) + '\n');
process.exit(fail === 0 ? 0 : 1);

})().catch((e) => { console.error('\nFATAL:', e); process.exit(1); });
