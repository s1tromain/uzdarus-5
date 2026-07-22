/* ============================================================================
 * COMPLETED-LESSON RESULT PERSISTENCE — regression suite
 * ----------------------------------------------------------------------------
 * Drives the REAL course-global-fixes.js inside JSDOM against a mock Firestore,
 * exercising the full production path:
 *
 *     solve -> "Javoblarni tekshirish" -> ONE snapshot write
 *           -> navigate away / reload -> reopen -> result screen restored
 *
 * Nothing here is re-implemented: the file under test is loaded verbatim and
 * every assertion reads the DOM it actually produced.
 * ==========================================================================*/
'use strict';

const fs = require('fs');
const path = require('path');
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch (e) { console.error('jsdom is required: npm i -D jsdom'); process.exit(2); }

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'course-global-fixes.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (extra ? '\n      ' + extra : '')); }
}
function eq(name, actual, expected) {
    ok(name, Object.is(actual, expected), 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ---------------------------------------------------------------- fixtures */

const TOPIC = {
    id: 1,
    title: 'Salomlashish',
    quiz: {
        mcQuestions: ['Как дела?'],
        mcOptions: [['Хорошо', 'Плохо', 'Никак']],
        mcAnswers: [0],
        blankQuestions: ['Меня … Иван.'],
        blankAnswers: ['зовут']
    },
    topic2Exercises: {
        exercise1: {
            title: 'Tarjima qiling',
            items: [
                { prompt: 'Kitob', answer: 'книга' },
                { prompt: 'Uy', answer: 'дом' }
            ]
        },
        exercise2: {
            title: 'Gap tuzing',
            items: [
                { words: ['я', 'дома'], answers: ['я дома'], prompt: 'Gap tuzing' }
            ]
        },
        exercise3: {
            title: 'Variantni tanlang',
            items: [
                { prompt: 'Bu …', options: ['мой', 'моя'], answer: 'мой' }
            ]
        }
    }
};

function lessonHtml() {
    return `
    <div id="lesson">
      <div id="lessonContent"></div>
      <div id="quizSection">
        <div class="quiz-container">
          <div class="quiz-question">
            <div class="quiz-options" data-question="0">
              <div class="quiz-option" data-option="0">Хорошо</div>
              <div class="quiz-option" data-option="1">Плохо</div>
              <div class="quiz-option" data-option="2">Никак</div>
            </div>
          </div>
          <div class="fill-blank"><input type="text" data-blank="0"></div>

          <div class="exercise-block">
            <input type="text" data-topic2-e1="0">
            <input type="text" data-topic2-e1="1">
            <input type="hidden" data-topic2-builder-selected="0">
            <div data-topic2-builder-target="0"></div>
            <div data-topic2-e3-row="0">
              <button class="chip" data-value="мой">мой</button>
              <button class="chip" data-value="моя">моя</button>
            </div>
          </div>
        </div>
      </div>
      <div class="results-section" id="resultsSection">
        <div class="score-display" id="scoreDisplay">Sizning natijangiz: 0/10</div>
        <div class="results-message" id="resultsMessage">Test natijalaringiz</div>
        <div class="correct-answers" id="correctAnswers"><h3>To'g'ri javoblar:</h3></div>
        <button class="complete-btn" id="completeBtn" style="display:none">Mavzuni tugatish</button>
        <button class="retry-btn" id="retryBtn" style="display:none">Qayta urinib ko'rish</button>
      </div>
    </div>`;
}

/* A shared mock of users/{uid}/quizResults — one plain object per document,
   merged exactly like setDoc(..., { merge: true }). */
function makeStore(seed) {
    const docs = Object.assign({}, seed || {});
    return {
        docs,
        writes: 0,
        reads: 0,
        failNextWrite: false,
        async save(uid, topicId, snapshot, course) {
            if (this.failNextWrite) { this.failNextWrite = false; throw new Error('network down'); }
            this.writes++;
            const id = 'topic_' + topicId;
            docs[id] = Object.assign({}, docs[id], { lessonResult: snapshot, course });
            return true;
        },
        async get(uid, topicId) {
            this.reads++;
            const d = docs['topic_' + topicId];
            return d ? JSON.parse(JSON.stringify(d)) : null;
        }
    };
}

/* Boot a page with course-global-fixes.js loaded for real.
   The file installs a permanent MutationObserver + setInterval on the document;
   after window.close() those callbacks can still be drained by JSDOM against a
   torn-down document, which is a harness artefact, not product behaviour — so
   each window gets its own virtual console that is muted on close. */
function makeDom(bodyHtml, url) {
    const virtualConsole = new VirtualConsole();
    let muted = false;
    virtualConsole.on('jsdomError', (e) => { if (!muted) console.error(String((e && e.message) || e)); });
    ['log', 'info', 'warn', 'error'].forEach(level => {
        virtualConsole.on(level, (...args) => { if (!muted) console[level](...args); });
    });
    const dom = new JSDOM('<!DOCTYPE html><body>' + bodyHtml + '</body>', {
        url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole
    });
    const originalClose = dom.window.close.bind(dom.window);
    dom.window.close = function () { muted = true; originalClose(); };
    dom.window.HTMLElement.prototype.scrollIntoView = function () {};
    dom.window.alert = function () {};
    return dom;
}

function boot({ url = 'https://uzdarus.uz/paid-courses/a1-course.html', store = makeStore(), uid = 'u1' } = {}) {
    const dom = makeDom(lessonHtml(), url);
    const w = dom.window;
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.alert = function () {};

    w.courseData = { topics: [TOPIC] };
    w.currentTopicId = TOPIC.id;
    w.currentUserId = uid;
    w.checkAnswers = async function () {};          // A1/A2/B1 branch marker
    w.saveLessonResult = (u, t, s, c) => store.save(u, t, s, c);
    w.getTopicQuizResult = (u, t) => store.get(u, t);

    w.eval(SRC);
    return { dom, w, store };
}

function api(w) { return w.__uzLessonResults; }

function fillAnswers(w, { mc = 0, blank = 'зовут', e1 = ['книга', 'wrong'], builder = 'я дома', chip = 'мой' } = {}) {
    const d = w.document;
    d.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
    if (mc !== null) d.querySelector(`.quiz-option[data-option="${mc}"]`).classList.add('selected');
    d.querySelector('input[data-blank="0"]').value = blank;
    d.querySelector('input[data-topic2-e1="0"]').value = e1[0];
    d.querySelector('input[data-topic2-e1="1"]').value = e1[1];
    d.querySelector('input[data-topic2-builder-selected="0"]').value = builder.split(' ').join('|');
    const row = d.querySelector('[data-topic2-e3-row="0"]');
    row.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
    if (chip) row.querySelector(`.chip[data-value="${chip}"]`).classList.add('selected');
}

async function waitFor(fn, ms = 5000, step = 60) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        let v; try { v = fn(); } catch (e) { v = false; }
        if (v) return v;
        await sleep(step);
    }
    return null;
}

/* Press the real "Javoblarni tekshirish" button (through the real capture-phase
   validation gate) and wait until the snapshot has been written. */
async function pressCheck(w, store) {
    const btn = await waitFor(() => w.document.querySelector('.check-topic-btn'));
    if (!btn) throw new Error('check button was never injected');
    const before = store.writes;
    btn.click();
    await waitFor(() => store.writes > before, 3000);
    return btn;
}

/* ============================================================ 1. PURE LOGIC */

(async function run() {

console.log('\n[1] Scope — paid courses only');
{
    const { w, dom } = boot();
    const detect = api(w).detectPaidCourse;
    eq('paid A1 course -> A1', detect('/paid-courses/a1-course.html'), 'A1');
    eq('paid A2 course -> A2', detect('/paid-courses/a2-course.html'), 'A2');
    eq('paid B1 course -> B1', detect('/paid-courses/b1-course.html'), 'B1');
    eq('paid B2 course -> B2', detect('/paid-courses/b2-course.html'), 'B2');
    eq('a1-demo -> null (demo never persists)', detect('/a1-demo.html'), null);
    eq('b2-demo -> null', detect('/b2-demo.html'), null);
    eq('a1-vocabulary -> null (vocabulary untouched)', detect('/paid-courses/a1-vocabulary.html'), null);
    eq('b1-vocabulary -> null', detect('/paid-courses/b1-vocabulary.html'), null);
    eq('a1-final-exam -> null (exam has its own storage)', detect('/paid-courses/a1-final-exam.html'), null);
    eq('index.html -> null', detect('/index.html'), null);
    dom.window.close();
}

console.log('\n[2] Snapshot shape + derived counters');
{
    const { w, dom } = boot();
    const snap = api(w).buildSnapshot('A1', 3, [
        { label: 'Test savol 1', question: 'Q', userAnswer: 'a', correctAnswer: 'a', isCorrect: true, explanation: 'E', ref: { k: 'mc', q: 0, o: 0, c: 0 } },
        { label: 'Test savol 2', question: 'Q2', userAnswer: 'b', correctAnswer: 'c', isCorrect: false, explanation: 'E2' }
    ]);
    eq('course stored', snap.course, 'A1');
    eq('topic id stored', snap.topicId, 3);
    eq('total', snap.total, 2);
    eq('correct', snap.correct, 1);
    eq('incorrect', snap.incorrect, 1);
    eq('score mirrors correct', snap.score, 1);
    eq('percent', snap.percent, 50);
    ok('completion timestamp present', typeof snap.completedAt === 'string' && snap.completedAt.length > 10);
    ok('submitted answers preserved', snap.results[1].userAnswer === 'b');
    ok('expected answer preserved', snap.results[1].correctAnswer === 'c');
    ok('correctness preserved', snap.results[0].isCorrect === true && snap.results[1].isCorrect === false);
    ok('feedback preserved', snap.results[0].explanation === 'E');
    ok('restore descriptor preserved', snap.results[0].ref.k === 'mc');
    ok('no raw HTML stored', !JSON.stringify(snap).includes('<div'));
    dom.window.close();
}

console.log('\n[3] Malformed / missing snapshot data never crashes');
{
    const { w, dom } = boot();
    const s = api(w).sanitizeSnapshot;
    eq('null -> null', s(null), null);
    eq('undefined -> null', s(undefined), null);
    eq('string -> null', s('garbage'), null);
    eq('number -> null', s(42), null);
    eq('object without results -> null', s({ score: 5 }), null);
    eq('results not an array -> null', s({ results: 'nope' }), null);
    eq('empty results -> null', s({ results: [] }), null);
    eq('results of junk -> null', s({ results: [null, 7, 'x'] }), null);
    const recovered = s({ results: [{ isCorrect: true }, { isCorrect: false }], total: 999, correct: -5, score: 'bad' });
    ok('counters recomputed from answers, not trusted', recovered.total === 2 && recovered.correct === 1 && recovered.incorrect === 1);
    ok('missing text fields default to empty strings', recovered.results[0].userAnswer === '' && recovered.results[0].question === '');
    ok('message regenerated when absent', typeof recovered.message === 'string' && recovered.message.length > 0);
    dom.window.close();
}

console.log('\n[4] Replacement policy');
{
    const { w, dom } = boot();
    const should = api(w).shouldReplaceSnapshot;
    const passed = { passed: true, results: [{}] };
    const failed = { passed: false, results: [{}] };
    eq('first ever attempt is stored', should(null, failed), true);
    eq('passed replaces passed (newest wins)', should(passed, passed), true);
    eq('passed replaces failed', should(failed, passed), true);
    eq('failed retry does NOT erase a passed result', should(passed, failed), false);
    eq('empty result never replaces anything', should(passed, { passed: true, results: [] }), false);
    eq('null result never replaces anything', should(passed, null), false);
    dom.window.close();
}

/* ====================================================== 2. FULL ROUND TRIP */

console.log('\n[5] Complete a paid topic -> exactly one snapshot persisted');
let roundTripStore;
{
    const { w, dom, store } = boot();
    roundTripStore = store;
    fillAnswers(w);
    await pressCheck(w, store);

    const saved = store.docs['topic_1'];
    ok('snapshot written to users/{uid}/quizResults/topic_1', !!(saved && saved.lessonResult));
    eq('exactly ONE write for the whole lesson', store.writes, 1);
    eq('course tag stored', saved.course, 'A1');
    eq('topic id stored', saved.lessonResult.topicId, 1);

    const r = saved.lessonResult.results;
    // 1 mc + 1 blank + 2 text inputs + 1 sentence builder + 1 chip choice
    eq('every exercise type captured (mc, blank, input, builder, chip)', r.length, 6);
    ok('mc answer captured', r.some(x => x.label === 'Test savol 1' && x.userAnswer === 'Хорошо' && x.isCorrect));
    ok('blank answer captured', r.some(x => x.label === "Bo'sh joy 1" && x.userAnswer === 'зовут' && x.isCorrect));
    ok('correct text input captured', r.some(x => x.userAnswer === 'книга' && x.isCorrect));
    ok('WRONG text input captured as incorrect', r.some(x => x.userAnswer === 'wrong' && !x.isCorrect));
    ok('expected answer kept for the wrong one', r.some(x => x.userAnswer === 'wrong' && x.correctAnswer === 'дом'));
    ok('sentence builder captured', r.some(x => x.userAnswer === 'я дома'));
    ok('chip choice captured', r.some(x => x.userAnswer === 'мой'));
    ok('feedback text captured for each answer', r.every(x => typeof x.explanation === 'string' && x.explanation.length > 0));

    const feedback = w.document.querySelector('.topic-feedback');
    ok('live result screen rendered', /fb-summary-score/.test(feedback.innerHTML));
    dom.window.close();
}

console.log('\n[6] Reopen the topic in a NEW session -> previous result restored');
{
    // Fresh page (page refresh / another device): same account store, blank DOM.
    const { w, dom, store } = boot({ store: makeStore(roundTripStore.docs) });
    const feedback = await waitFor(() =>
        w.document.querySelector('.topic-feedback') &&
        w.document.querySelector('.topic-feedback').innerHTML ? w.document.querySelector('.topic-feedback') : null);

    ok('saved result is restored without touching the check button', !!feedback);
    if (feedback) {
        const html = feedback.innerHTML;
        ok('score restored', /fb-summary-score/.test(html));
        ok('score value restored', /7 \/ 9|\d+ \/ \d+/.test(html));
        ok('correct answers restored', /To&#039;g|To&#x27;g|To’g|Toʻg|To'g/.test(html) || /fb-card-cval/.test(html));
        ok('correct states restored', /fb-correct/.test(html));
        ok('incorrect states restored', /fb-incorrect/.test(html));
        ok('submitted answers restored', /книга/.test(html) && /wrong/.test(html));
        ok('feedback text restored', /fb-card-expl/.test(html));
        ok('Uzbek wording preserved', /Sizning javobingiz/.test(html));
    }

    const d = w.document;
    eq('text input value restored', d.querySelector('input[data-topic2-e1="0"]').value, 'книга');
    eq('wrong input value restored', d.querySelector('input[data-topic2-e1="1"]').value, 'wrong');
    ok('correct input marked correct', d.querySelector('input[data-topic2-e1="0"]').classList.contains('correct'));
    ok('wrong input marked incorrect', d.querySelector('input[data-topic2-e1="1"]').classList.contains('incorrect'));
    eq('blank restored', d.querySelector('input[data-blank="0"]').value, 'зовут');
    ok('mc selection restored', d.querySelector('.quiz-option[data-option="0"]').classList.contains('selected'));
    ok('mc correct answer highlighted', d.querySelector('.quiz-option[data-option="0"]').classList.contains('correct-answer'));
    ok('chip selection restored', d.querySelector('[data-topic2-e3-row="0"] .chip[data-value="мой"]').classList.contains('selected'));
    eq('builder answer restored', d.querySelector('input[data-topic2-builder-selected="0"]').value, 'я|дома');
    ok('legacy score block restored', /Sizning natijangiz: \d+\/\d+/.test(d.getElementById('scoreDisplay').textContent));
    ok('results section shown', d.getElementById('resultsSection').classList.contains('show'));
    ok('completion button NOT surfaced by a review', d.getElementById('completeBtn').style.display !== 'block');
    dom.window.close();
}

console.log('\n[7] Opening a completed topic does NOT overwrite the saved result');
{
    const store = makeStore(roundTripStore.docs);
    const savedBefore = JSON.stringify(store.docs['topic_1'].lessonResult);
    const { w, dom } = boot({ store });
    await waitFor(() => w.document.querySelector('.topic-feedback') &&
                        w.document.querySelector('.topic-feedback').innerHTML);
    await sleep(900);   // let several observer/interval ticks go by
    eq('zero writes triggered by merely opening', store.writes, 0);
    eq('stored snapshot byte-identical', JSON.stringify(store.docs['topic_1'].lessonResult), savedBefore);
    dom.window.close();
}

console.log('\n[8] Retry -> a NEW completed attempt becomes the shown result');
{
    const store = makeStore(roundTripStore.docs);
    const { w, dom } = boot({ store });
    await waitFor(() => w.document.querySelector('.topic-feedback') &&
                        w.document.querySelector('.topic-feedback').innerHTML);

    // Learner clicks the existing retry control, then answers everything correctly.
    w.document.getElementById('retryBtn').click();
    eq('retry clears the restored screen', w.document.querySelector('.topic-feedback').innerHTML, '');
    ok('retry does NOT delete the stored result', !!store.docs['topic_1'].lessonResult);

    fillAnswers(w, { e1: ['книга', 'дом'] });
    await pressCheck(w, store);

    const r = store.docs['topic_1'].lessonResult.results;
    ok('newest attempt replaced the old one', r.every(x => x.userAnswer !== 'wrong'));
    ok('previously wrong answer now stored as correct', r.some(x => x.userAnswer === 'дом' && x.isCorrect));
    dom.window.close();
}

console.log('\n[9] A FAILED retry never erases a stored PASSED result');
{
    const store = makeStore();
    const { w, dom } = boot({ store });
    fillAnswers(w, { e1: ['книга', 'дом'] });                 // all correct -> passed
    await pressCheck(w, store);
    const passedSnap = JSON.stringify(store.docs['topic_1'].lessonResult);
    ok('passed attempt stored', store.docs['topic_1'].lessonResult.passed === true);

    // Same session, deliberately bad retry.
    w.document.getElementById('retryBtn').click();
    fillAnswers(w, { mc: 1, blank: 'нет', e1: ['xxx', 'yyy'], builder: 'дома я', chip: 'моя' });
    const before = store.writes;
    w.document.querySelector('.check-topic-btn').click();
    await sleep(600);
    eq('failed retry produced no overwriting write', store.writes, before);
    eq('stored passed result untouched', JSON.stringify(store.docs['topic_1'].lessonResult), passedSnap);
    ok('but the live screen still shows the failed attempt', /fb-incorrect/.test(w.document.querySelector('.topic-feedback').innerHTML));
    dom.window.close();
}

console.log('\n[10] Double-click the check button -> single stored attempt');
{
    const store = makeStore();
    const { w, dom } = boot({ store });
    fillAnswers(w);
    const btn = await waitFor(() => w.document.querySelector('.check-topic-btn'));
    btn.click(); btn.click(); btn.click();
    await sleep(900);
    eq('duplicate completion writes collapsed', store.writes, 1);
    dom.window.close();
}

console.log('\n[11] Old completed topic without a snapshot');
{
    // Account that completed the topic BEFORE this feature existed: the quiz doc
    // exists with the legacy fields only.
    const store = makeStore({ topic_1: { course: 'A1', score: 8, mcAnswers: [0], blankAnswers: ['зовут'] } });
    const { w, dom } = boot({ store });
    await sleep(2200);
    const feedback = w.document.querySelector('.topic-feedback');
    ok('no crash, no fabricated answers', !!feedback && feedback.innerHTML === '');
    eq('legacy document left untouched', store.writes, 0);
    ok('legacy fields preserved', store.docs['topic_1'].score === 8);
    dom.window.close();
}

console.log('\n[12] Corrupted stored snapshot degrades to a clean lesson');
{
    const store = makeStore({ topic_1: { course: 'A1', lessonResult: { v: 1, results: 'not-an-array' } } });
    const { w, dom } = boot({ store });
    await sleep(2200);
    const feedback = w.document.querySelector('.topic-feedback');
    ok('malformed snapshot ignored without throwing', !!feedback && feedback.innerHTML === '');
    eq('nothing overwritten', store.writes, 0);
    dom.window.close();
}

console.log('\n[13] Demo courses do NOT persist result history');
{
    const store = makeStore();
    const { w, dom } = boot({ url: 'https://uzdarus.uz/a1-demo.html', store });
    fillAnswers(w);
    const btn = await waitFor(() => w.document.querySelector('.check-topic-btn'));
    btn.click();
    await sleep(900);
    ok('demo still renders its result screen', /fb-summary-score/.test(w.document.querySelector('.topic-feedback').innerHTML));
    eq('demo wrote nothing to the account', store.writes, 0);
    eq('demo read nothing from the account', store.reads, 0);
    dom.window.close();
}

console.log('\n[14] Vocabulary pages remain unaffected');
{
    const store = makeStore();
    const { w, dom } = boot({ url: 'https://uzdarus.uz/paid-courses/a1-vocabulary.html', store });
    fillAnswers(w);
    const btn = await waitFor(() => w.document.querySelector('.check-topic-btn'));
    btn.click();
    await sleep(900);
    eq('vocabulary page performs no result writes', store.writes, 0);
    eq('vocabulary page performs no result reads', store.reads, 0);
    dom.window.close();
}

console.log('\n[15] Network failure keeps the existing saved result intact');
{
    const store = makeStore();
    const { w, dom } = boot({ store });
    fillAnswers(w, { e1: ['книга', 'дом'] });
    await pressCheck(w, store);
    const good = JSON.stringify(store.docs['topic_1'].lessonResult);

    w.document.getElementById('retryBtn').click();
    store.failNextWrite = true;
    fillAnswers(w, { e1: ['книга', 'дом'] });
    w.document.querySelector('.check-topic-btn').click();
    await sleep(800);
    eq('failed network write did not damage the stored result', JSON.stringify(store.docs['topic_1'].lessonResult), good);
    ok('learner still sees the live result screen', /fb-summary-score/.test(w.document.querySelector('.topic-feedback').innerHTML));
    dom.window.close();
}

console.log('\n[16] Account is the source of truth (not localStorage)');
{
    const store = makeStore(roundTripStore.docs);
    const { w, dom } = boot({ store });
    await waitFor(() => w.document.querySelector('.topic-feedback') &&
                        w.document.querySelector('.topic-feedback').innerHTML);
    ok('restore performed an account read', store.reads > 0);
    dom.window.close();
}

console.log('\n[17] Restoration is renderer-driven, not HTML-replay');
{
    const { w, dom } = boot();
    const host = w.document.createElement('div');
    host.className = 'topic-check-section';
    host.innerHTML = '<button class="check-topic-btn"></button><div class="topic-feedback hidden"></div>';
    w.document.body.appendChild(host);

    const snap = api(w).sanitizeSnapshot({
        v: 1, course: 'A1', topicId: 9, completedAt: '2026-01-01T00:00:00.000Z',
        results: [
            { label: 'L1', question: 'Q1', userAnswer: '<img src=x onerror=alert(1)>', correctAnswer: 'C1', isCorrect: false, explanation: 'E1' },
            { label: 'L2', question: 'Q2', userAnswer: 'U2', correctAnswer: 'C2', isCorrect: true, explanation: 'E2' }
        ]
    });
    eq('restore reports success', api(w).restoreSnapshot(host, snap), true);
    const html = host.querySelector('.topic-feedback').innerHTML;
    ok('stored answers are escaped, never injected as markup', !/<img/.test(html) && /&lt;img/.test(html));
    ok('summary rebuilt by the shared renderer', /1 \/ 2/.test(html) && /50%/.test(html));
    dom.window.close();
}

console.log('\n[18] B1 course shape (topicNExercises: choice + input + slot)');
{
    const B1_TOPIC = {
        id: 4, title: 'Ish va kasb',
        topic1Exercises: {
            exercises: [
                { id: 'ex1', title: 'Variantni tanlang', type: 'choice', items: [{ q: 'Он … врач.', answer: 'работает' }] },
                { id: 'ex2', title: 'Tarjima qiling', type: 'input', items: [{ q: 'Shifokor', answer: 'врач' }] }
            ]
        }
    };
    const store = makeStore();
    const dom = makeDom(
        '<div id="lesson"><div id="lessonContent"></div><div id="quizSection"><div class="exercise-block">' +
        '<div data-t1-row="ex1-0"><button class="t1-opt" data-value="работает">работает</button>' +
        '<button class="t1-opt" data-value="работаю">работаю</button></div>' +
        '<input data-t1-input="ex2-0"><div data-t1-slot="ex2-0"></div>' +
        '</div></div>' +
        '<div class="results-section" id="resultsSection"><div id="scoreDisplay">Sizning natijangiz: 0/10</div>' +
        '<div id="resultsMessage"></div><div id="correctAnswers"></div>' +
        '<button id="completeBtn" style="display:none"></button><button id="retryBtn" style="display:none"></button>' +
        '</div></div>',
        'https://uzdarus.uz/paid-courses/b1-course.html');
    const w = dom.window;
    w.courseData = { topics: [B1_TOPIC] };
    w.currentTopicId = 4;
    w.currentUserId = 'u1';
    w.checkAnswers = async function () {};
    w.checkTopic1Exercises = async function () {};
    w.saveLessonResult = (u, t, s, c) => store.save(u, t, s, c);
    w.getTopicQuizResult = (u, t) => store.get(u, t);
    w.eval(SRC);

    w.document.querySelector('.t1-opt[data-value="работает"]').classList.add('selected');
    w.document.querySelector('[data-t1-input="ex2-0"]').value = 'врач';
    await pressCheck(w, store);

    const snap = store.docs['topic_4'].lessonResult;
    eq('B1 course tag', snap.course, 'B1');
    ok('B1 choice answer captured', snap.results.some(r => r.userAnswer === 'работает' && r.isCorrect));
    ok('B1 input answer captured', snap.results.some(r => r.userAnswer === 'врач' && r.isCorrect));

    // Reopen in a clean DOM and restore.
    w.document.querySelector('.t1-opt[data-value="работает"]').classList.remove('selected');
    w.document.querySelector('[data-t1-input="ex2-0"]').value = '';
    const host = w.document.querySelector('.topic-check-section');
    host.querySelector('.topic-feedback').innerHTML = '';
    api(w).restoreSnapshot(host, api(w).sanitizeSnapshot(snap));

    ok('B1 choice selection restored', w.document.querySelector('.t1-opt[data-value="работает"]').classList.contains('selected'));
    ok('B1 correct option revealed', w.document.querySelector('.t1-opt[data-value="работает"]').classList.contains('t1-reveal'));
    ok('B1 choice marked correct', w.document.querySelector('.t1-opt[data-value="работает"]').classList.contains('t1-ok'));
    eq('B1 input value restored', w.document.querySelector('[data-t1-input="ex2-0"]').value, 'врач');
    ok('B1 slot marked correct', w.document.querySelector('[data-t1-slot="ex2-0"]').classList.contains('correct'));
    dom.window.close();
}

console.log('\n[19] B2 course shape (submitQuiz branch: mc via userAnswers + inline blanks)');
{
    const B2_TOPIC = {
        id: 2, title: 'Ilm-fan',
        quiz: {
            mcQuestions: ['Что такое гипотеза?'],
            mcOptions: [['Предположение', 'Доказательство']],
            mcAnswers: [0],
            blankQuestions: ['Учёный … эксперимент.'],
            blankAnswers: ['провёл']
        }
    };
    const store = makeStore();
    const dom = makeDom(
        '<div id="lessonContent"><div class="quiz-section"></div>' +
        '<div class="blank-section"><input class="blank-input-inline" data-q-index="0" data-input-index="0"></div>' +
        '</div>',
        'https://uzdarus.uz/paid-courses/b2-course.html');
    const w = dom.window;
    w.currentTopic = B2_TOPIC;                 // B2 has no currentTopicId
    w.userAnswers = [0];
    w.currentUserId = 'u1';
    w.submitQuiz = function () {};
    w.saveLessonResult = (u, t, s, c) => store.save(u, t, s, c);
    w.getTopicQuizResult = (u, t) => store.get(u, t);
    w.eval(SRC);

    w.document.querySelector('.blank-input-inline').value = 'провёл';
    await pressCheck(w, store);

    const snap = store.docs['topic_2'].lessonResult;
    eq('B2 course tag', snap.course, 'B2');
    eq('B2 topic id taken from currentTopic', snap.topicId, 2);
    ok('B2 mc answer captured', snap.results.some(r => r.userAnswer === 'Предположение' && r.isCorrect));
    ok('B2 inline blank captured', snap.results.some(r => r.userAnswer === 'провёл' && r.isCorrect));

    w.document.querySelector('.blank-input-inline').value = '';
    const host = w.document.querySelector('.topic-check-section');
    host.querySelector('.topic-feedback').innerHTML = '';
    api(w).restoreSnapshot(host, api(w).sanitizeSnapshot(snap));
    eq('B2 blank value restored', w.document.querySelector('.blank-input-inline').value, 'провёл');
    ok('B2 blank marked correct', w.document.querySelector('.blank-input-inline').classList.contains('correct'));
    ok('B2 feedback screen restored', /fb-summary-score/.test(host.querySelector('.topic-feedback').innerHTML));
    dom.window.close();
}

console.log('\n[20] Never store an answer for an exercise that is not on screen');
{
    // topic2Exercises declares 3 items but the page renders only the first two
    // hooks (this is the A2 pattern: bespoke data-t2-* markup the shared
    // collectors cannot see). The missing one must be OMITTED, not invented as
    // an unanswered wrong answer.
    const TOPIC_PARTIAL = {
        id: 7, title: 'Qisman',
        topic2Exercises: {
            exercise1: {
                title: 'Tarjima', items: [
                    { prompt: 'Kitob', answer: 'книга' },
                    { prompt: 'Uy', answer: 'дом' },
                    { prompt: 'Non', answer: 'хлеб' }   // hook deliberately not rendered
                ]
            }
        }
    };
    const store = makeStore();
    const dom = makeDom(
        '<div id="lesson"><div id="lessonContent"></div><div id="quizSection"><div class="exercise-block">' +
        '<input data-topic2-e1="0"><input data-topic2-e1="1"></div></div>' +
        '<div class="results-section" id="resultsSection"><div id="scoreDisplay">Sizning natijangiz: 0/0</div>' +
        '<div id="resultsMessage"></div><div id="correctAnswers"></div>' +
        '<button id="completeBtn" style="display:none"></button><button id="retryBtn" style="display:none"></button>' +
        '</div></div>',
        'https://uzdarus.uz/paid-courses/a2-course.html');
    const w = dom.window;
    w.courseData = { topics: [TOPIC_PARTIAL] };
    w.currentTopicId = 7;
    w.currentUserId = 'u1';
    w.checkAnswers = async function () {};
    w.saveLessonResult = (u, t, s, c) => store.save(u, t, s, c);
    w.getTopicQuizResult = (u, t) => store.get(u, t);
    w.eval(SRC);

    w.document.querySelector('input[data-topic2-e1="0"]').value = 'книга';
    w.document.querySelector('input[data-topic2-e1="1"]').value = 'дом';
    await pressCheck(w, store);

    const r = store.docs['topic_7'].lessonResult;
    eq('only the rendered items are stored', r.total, 2);
    eq('no fabricated wrong answer', r.incorrect, 0);
    eq('percentage reflects what was really shown', r.percent, 100);
    ok('the unrendered item is absent', !r.results.some(x => x.correctAnswer === 'хлеб'));
    dom.window.close();
}

console.log('\n[21] Open-ended items grade the same way the course itself grades them');
{
    // B1 marks an item open-ended either with free:true or with a blank answer
    // key; both accept any meaningful (>= 3 word) response.
    const TOPIC_OPEN = {
        id: 13, title: 'Fikr bildirish',
        topic13Exercises: {
            exercises: [{
                id: 'ex2', type: 'input', title: 'Davomini yozing', items: [
                    { q: 'Я думаю, что …', answer: [''] },     // blank key -> open
                    { q: 'Я считаю, что …', free: true },      // explicit flag -> open
                    { q: 'Shifokor', answer: 'врач' }          // normal, exact match
                ]
            }]
        }
    };
    const store = makeStore();
    const dom = makeDom(
        '<div id="lesson"><div id="lessonContent"></div><div id="quizSection"><div class="exercise-block">' +
        '<input data-t1-input="ex2-0"><input data-t1-input="ex2-1"><input data-t1-input="ex2-2"></div></div>' +
        '<div class="results-section" id="resultsSection"><div id="scoreDisplay">Sizning natijangiz: 0/0</div>' +
        '<div id="resultsMessage"></div><div id="correctAnswers"></div>' +
        '<button id="completeBtn" style="display:none"></button><button id="retryBtn" style="display:none"></button>' +
        '</div></div>',
        'https://uzdarus.uz/paid-courses/b1-course.html');
    const w = dom.window;
    w.courseData = { topics: [TOPIC_OPEN] };
    w.currentTopicId = 13;
    w.currentUserId = 'u1';
    w.checkAnswers = async function () {};
    w.checkTopic13Exercises = async function () {};
    w.saveLessonResult = (u, t, s, c) => store.save(u, t, s, c);
    w.getTopicQuizResult = (u, t) => store.get(u, t);
    w.eval(SRC);

    w.document.querySelector('[data-t1-input="ex2-0"]').value = 'это очень важно';
    w.document.querySelector('[data-t1-input="ex2-1"]').value = 'мне нравится читать';
    w.document.querySelector('[data-t1-input="ex2-2"]').value = 'врач';
    await pressCheck(w, store);

    const r = store.docs['topic_13'].lessonResult;
    eq('all three captured', r.total, 3);
    eq('meaningful open answers count as correct', r.correct, 3);
    ok('open item shows the open-answer expectation, not a fake key',
       r.results[0].correctAnswer.indexOf('Bemalol javob') === 0);
    ok('exact-match item keeps its real expected answer',
       r.results[2].correctAnswer === 'врач');

    // A one-word response is still not a meaningful open answer.
    w.document.getElementById('retryBtn').click();
    w.document.querySelector('[data-t1-input="ex2-0"]').value = 'да';
    w.document.querySelector('[data-t1-input="ex2-1"]').value = 'мне нравится читать';
    w.document.querySelector('[data-t1-input="ex2-2"]').value = 'врач';
    w.document.querySelector('.check-topic-btn').click();
    await sleep(500);
    ok('too-short open answer is still marked wrong',
       /fb-incorrect/.test(w.document.querySelector('.topic-feedback').innerHTML));
    dom.window.close();
}

/* ------------------------------------------------------------------ report */

console.log('\n' + '─'.repeat(62));
console.log(fail === 0
    ? `  ✅ LESSON RESULTS: ${pass}/${pass} assertions passed`
    : `  ❌ LESSON RESULTS: ${fail} failed, ${pass} passed`);
console.log('─'.repeat(62) + '\n');
process.exit(fail === 0 ? 0 : 1);

})().catch((e) => { console.error('\nFATAL:', e); process.exit(1); });
