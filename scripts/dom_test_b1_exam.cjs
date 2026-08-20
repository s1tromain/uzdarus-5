/* Headless DOM QA for b1-final-exam.html using jsdom.
   Verifies: render (100 rows), timer persistence, autosave, restore,
   perfect-score submission -> pass + completion write. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, '..', 'paid-courses', 'b1-final-exam.html');
let html = fs.readFileSync(htmlPath, 'utf8');
// Drop the external module script so jsdom doesn't try to load it; we stub the sync fns.
html = html.replace(/<script type="module" src="paid-platform.js"><\/script>/, '');
html = html.replace(/<script defer src="pro-toast.js"><\/script>/, '');

const data = JSON.parse(html.match(/var FINAL_EXAM_DATA = (\[.*?\]);/s)[1]);

const calls = { saveQuizResult: [], saveUserProgress: [], submitFinalExam: [], uzTrack: [] };
const memStore = {};

function makeLocalStorage() {
    return {
        getItem: k => (k in memStore ? memStore[k] : null),
        setItem: (k, v) => { memStore[k] = String(v); },
        removeItem: k => { delete memStore[k]; },
        clear: () => { Object.keys(memStore).forEach(k => delete memStore[k]); }
    };
}

function build(beforeParseExtra) {
    const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        beforeParse(window) {
            // localStorage
            Object.defineProperty(window, 'localStorage', { value: makeLocalStorage(), configurable: true });
            window.confirm = () => true;
            window.alert = () => {};
            window.scrollTo = () => {};
            window.print = () => {};
            window.HTMLElement.prototype.scrollIntoView = () => {};
            // logged-in user
            window.localStorage.setItem('currentUser', JSON.stringify({ id: 'testUser123', name: 'Test Talaba', email: 't@x.uz' }));
            // platform sync stubs
            window.saveQuizResult = (uid, topic, payload, course) => { calls.saveQuizResult.push({ uid, topic, payload, course }); return Promise.resolve(true); };
            window.saveUserProgress = (uid, course, payload) => { calls.saveUserProgress.push({ uid, course, payload }); return Promise.resolve(true); };
            window.getUserQuizResults = () => Promise.resolve({});
            // completion gate source — default: all 20 topics completed (course finished)
            window.__completed = window.__completed || [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];
            window.getUserProgress = () => Promise.resolve({ completedTopics: window.__completed });
            window.getAuthoritativeCourseProgress = () => window.__authFails
                ? Promise.reject(new Error('read failed'))
                : Promise.resolve({ completedTopics: window.__completed, userExists: true });
            window.uzTrack = (type, data) => { calls.uzTrack.push({ type, data }); };
            window.submitFinalExam = (course, answers) => {
                calls.submitFinalExam.push({ course, answers });
                if (window.__submitRejects) {
                    const e = new Error('submit failed');
                    e.status = window.__submitRejects.status || null;
                    return Promise.reject(e);
                }
                const r = window.__serverResult || { correct: 100, total: 100, score: 100,
                    passMark: 80, passed: true, certificateUnlocked: true };
                return Promise.resolve(Object.assign({ ok: true, course }, r));
            };
            if (beforeParseExtra) beforeParseExtra(window);
        }
    });
    return dom;
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
    let failures = 0;
    function check(name, cond) {
        console.log((cond ? '  ✓ ' : '  ✗ ') + name);
        if (!cond) failures++;
    }

    // ---------- TEST 1: fresh render + timer persistence ----------
    console.log('TEST 1 — fresh load: render, timer persistence, autosave');
    let dom = build();
    const w = dom.window, d = w.document;
    await wait(400); // allow async init to settle

    const rows = d.querySelectorAll('[data-exam-row]');
    check('renders 100 question rows', rows.length === 100);
    const chips = d.querySelectorAll('.exam-q-chip').length;
    const inputs = d.querySelectorAll('.exam-q-input').length;
    check('renders chip groups (76 chip qs)', d.querySelectorAll('[data-exam-chip]').length > 0 && inputs === 24);
    check('5 section heads + 1 passage', d.querySelectorAll('.exam-section-head').length === 5 && d.querySelectorAll('.exam-passage').length === 1);

    const stateKey = 'b1_finalexam_state_testUser123';
    let st = JSON.parse(memStore[stateKey] || 'null');
    check('timer state persisted with future deadline', !!st && st.deadline > Date.now());
    const timerTxt = d.getElementById('examTimerDisplay').textContent;
    check('timer shows ~120 min (' + timerTxt + ')', /^0[12]:(59|5[0-9]):/.test(timerTxt) || timerTxt.startsWith('02:00') || timerTxt.startsWith('01:59'));

    // answer a chip + an input, trigger autosave path
    const firstChip = d.querySelector('.exam-q-chip[data-exam-chip="0-0"][data-value="' + data[0].items[0].answer + '"]');
    firstChip.dispatchEvent(new w.Event('click', { bubbles: true }));
    const firstInput = d.querySelector('[data-exam-input="1-0"]');
    firstInput.value = 'Я учил русский язык три года';
    firstInput.dispatchEvent(new w.Event('input', { bubbles: true }));
    await wait(900); // debounced save (700ms)
    st = JSON.parse(memStore[stateKey] || 'null');
    check('autosave captured chip answer', st && st.answers['0-0'] === data[0].items[0].answer);
    check('autosave captured input answer', st && st.answers['1-0'] === 'Я учил русский язык три года');
    check('progress badge counts answers', d.getElementById('examProgress').textContent === '2 / 100');
    dom.window.close();

    // ---------- TEST 2: restore from saved state (refresh) ----------
    console.log('TEST 2 — refresh: restore answers + remaining time');
    // seed a saved state with 30 min left and one answer
    memStore[stateKey] = JSON.stringify({
        deadline: Date.now() + 30 * 60 * 1000,
        startedAt: Date.now() - 90 * 60 * 1000,
        answers: { '0-1': data[0].items[1].answer, '1-2': 'restored text' },
        savedAt: Date.now()
    });
    dom = build();
    const w2 = dom.window, d2 = dom.window.document;
    await wait(400);
    const restoredChip = d2.querySelector('.exam-q-chip[data-exam-chip="0-1"].selected');
    check('restored chip selection', restoredChip && restoredChip.dataset.value === data[0].items[1].answer);
    const restoredInput = d2.querySelector('[data-exam-input="1-2"]');
    check('restored input value', restoredInput && restoredInput.value === 'restored text');
    const t2 = d2.getElementById('examTimerDisplay').textContent;
    check('restored ~30 min remaining (' + t2 + ')', t2.startsWith('00:29') || t2.startsWith('00:30'));
    dom.window.close();

    // ---------- TEST 3: perfect submission -> pass + completion write ----------
    console.log('TEST 3 — full correct submission: pass, certificate, completion');
    delete memStore[stateKey];
    calls.saveQuizResult.length = 0; calls.saveUserProgress.length = 0;
    dom = build();
    const w3 = dom.window, d3 = dom.window.document;
    await wait(400);
    // fill every answer correctly
    data.forEach((s, si) => s.items.forEach((it, qi) => {
        const key = si + '-' + qi;
        if (it.mode === 'chip') {
            const ans = Array.isArray(it.answer) ? it.answer[0] : it.answer;
            const chip = [...d3.querySelectorAll('.exam-q-chip[data-exam-chip="' + key + '"]')]
                .find(c => c.dataset.value === ans);
            if (chip) chip.dispatchEvent(new w3.Event('click', { bubbles: true }));
        } else {
            const inp = d3.querySelector('[data-exam-input="' + key + '"]');
            inp.value = Array.isArray(it.answer) ? it.answer[0] : it.answer;
            inp.dispatchEvent(new w3.Event('input', { bubbles: true }));
        }
    }));
    check('progress badge = 100/100', d3.getElementById('examProgress').textContent === '100 / 100');
    d3.getElementById('examSubmitBtn').dispatchEvent(new w3.Event('click', { bubbles: true }));
    await wait(500);
    const box = d3.querySelector('.exam-result-box');
    check('result box rendered as passed', box && box.classList.contains('passed'));
    check('score shows 100 / 100', box && /100 \/ 100/.test(box.textContent));
    check('shows "muvaffaqiyatli tugatildi"', box && /muvaffaqiyatli tugatildi/.test(box.textContent));
    const sup = calls.saveUserProgress.find(c => c.payload && c.payload.finalExamPassed);
    /* The completion fields are the SERVER's now: this page posts the answers
       and api/_progress/final-exam.js writes finalExamPassed / courseCompleted /
       certificateUnlocked. The old assertion here expected the page to write
       them itself and had been failing ever since that hardening. */
    check('NO completion fields went through the generic saver', !sup);
    const sqr = calls.saveQuizResult.find(c => c.payload && c.payload.examResult);
    check('saveQuizResult wrote exam result', !!sqr && sqr.payload.examResult.passed === true);
    check('local completion flag set', !!memStore['b1_completion_testUser123']);
    check('in-progress draft cleared after submit', !memStore[stateKey]);
    dom.window.close();

    // ---------- TEST 4: failing submission -> fail message, no completion ----------
    console.log('TEST 4 — empty submission: fail, no completion write');
    delete memStore[stateKey]; delete memStore['b1_completion_testUser123'];
    calls.saveUserProgress.length = 0;
    /* The SERVER is what decides an empty paper failed — stub it accordingly. */
    dom = build((w) => { w.__serverResult = { correct: 0, total: 100, score: 0,
        passMark: 80, passed: false, certificateUnlocked: false }; });
    const d4 = dom.window.document, w4 = dom.window;
    await wait(400);
    d4.getElementById('examSubmitBtn').dispatchEvent(new w4.Event('click', { bubbles: true }));
    await wait(400);
    const box4 = d4.querySelector('.exam-result-box');
    check('result box rendered as failed', box4 && box4.classList.contains('failed'));
    check('shows retake message', box4 && /Qayta urinib/.test(box4.textContent));
    check('NO completion written on fail', !calls.saveUserProgress.some(c => c.payload && c.payload.finalExamPassed));
    check('NO local completion flag on fail', !memStore['b1_completion_testUser123']);
    dom.window.close();

    // ---------- TEST 5: completion gate — course NOT finished blocks the exam ----------
    console.log('TEST 5 — gate: incomplete course blocks exam (no render, no timer)');
    delete memStore[stateKey];
    dom = build((w) => { w.__completed = [1,2,3,4,5]; }); // only 5/20 done
    const d5 = dom.window.document;
    await wait(500);
    check('NO question rows rendered', d5.querySelectorAll('[data-exam-row]').length === 0);
    check('shows locked message', /yakuniy imtihon ochiladi/.test(d5.getElementById('examExercises').textContent));
    check('footer (submit) hidden', d5.getElementById('examFooterBar').classList.contains('hidden'));
    check('no timer running (still 02:00:00)', d5.getElementById('examTimerDisplay').textContent === '02:00:00');
    dom.window.close();

    // ---------- TEST 6: developer bypasses the gate (0 topics done -> exam opens) ----------
    console.log('TEST 6 — developer: gate bypassed, exam opens immediately with 0 topics done');
    delete memStore[stateKey];
    dom = build((w) => {
        w.__completed = []; // developer has completed nothing
        w.localStorage.setItem('currentUser', JSON.stringify({ id: 'devUser', name: 'Dev', role: 'developer' }));
    });
    const d6 = dom.window.document;
    await wait(500);
    check('renders 100 question rows for developer', d6.querySelectorAll('[data-exam-row]').length === 100);
    check('footer (submit) visible for developer', !d6.getElementById('examFooterBar').classList.contains('hidden'));
    check('not showing locked message', !/yakuniy imtihon ochiladi/.test(d6.getElementById('examExercises').textContent));
    dom.window.close();

    // ---------- B1 SECURITY: forged local, server authority, rejection ----------
    console.log('TEST 7 — forged localStorage cannot upgrade B1 eligibility');
    dom = build((w) => {
        w.__completed = Array.from({ length: 19 }, (_, i) => i + 1);       // server 19/20
        w.localStorage.setItem('b1_progress_testUser123',
            JSON.stringify(Array.from({ length: 20 }, (_, i) => i + 1)));  // forged 20/20
    });
    const d7 = dom.window.document;
    await wait(400);
    check('server 19/20 + forged local 20/20: LOCKED',
        d7.querySelectorAll('[data-exam-row]').length === 0);
    dom.window.close();

    console.log('TEST 8 — client PASS vs server FAIL: server wins');
    delete memStore[stateKey]; delete memStore['b1_completion_testUser123'];
    calls.uzTrack.length = 0; calls.saveQuizResult.length = 0;
    dom = build((w) => { w.__serverResult = { correct: 70, total: 100, score: 70,
        passMark: 80, passed: false, certificateUnlocked: false }; });
    const d8 = dom.window.document, w8 = dom.window;
    await wait(400);
    data.forEach((sec, sIdx) => sec.items.forEach((it, qIdx) => {
        const key = sIdx + '-' + qIdx;
        const want = Array.isArray(it.answer) ? it.answer[0] : it.answer;
        if ((it.mode || sec.type) === 'chip') {
            const chip = d8.querySelector('.exam-q-chip[data-exam-chip="' + key + '"][data-value="' + want + '"]');
            if (chip) chip.dispatchEvent(new w8.Event('click', { bubbles: true }));
        } else {
            const inp = d8.querySelector('[data-exam-input="' + key + '"]');
            if (inp) { inp.value = want; inp.dispatchEvent(new w8.Event('input', { bubbles: true })); }
        }
    }));
    d8.getElementById('examSubmitBtn').dispatchEvent(new w8.Event('click', { bubbles: true }));
    await wait(800);
    const box8 = d8.querySelector('.exam-result-box');
    check('UI shows the server score 70, not the client 100',
        box8 && /70 \/ 100/.test(box8.textContent));
    check('UI shows FAIL', box8 && box8.classList.contains('failed'));
    check('no completion cache on a server fail', !memStore['b1_completion_testUser123']);
    check('exam_fail analytics carries the server score',
        calls.uzTrack.length === 1 && calls.uzTrack[0].type === 'exam_fail'
        && calls.uzTrack[0].data.score === 70);
    dom.window.close();

    console.log('TEST 9 — server rejection never looks like a pass; draft kept');
    delete memStore[stateKey]; delete memStore['b1_completion_testUser123'];
    calls.uzTrack.length = 0; calls.saveQuizResult.length = 0;
    dom = build((w) => { w.__submitRejects = { status: 409 }; });
    const d9 = dom.window.document, w9 = dom.window;
    await wait(400);
    const firstChip9 = d9.querySelector('.exam-q-chip[data-exam-chip="0-0"][data-value="' + data[0].items[0].answer + '"]');
    if (firstChip9) firstChip9.dispatchEvent(new w9.Event('click', { bubbles: true }));
    await wait(900);
    d9.getElementById('examSubmitBtn').dispatchEvent(new w9.Event('click', { bubbles: true }));
    await wait(800);
    check('no passed result box after a rejection', !d9.querySelector('.exam-result-box.passed'));
    check('NO completion cache after a rejection', !memStore['b1_completion_testUser123']);
    check('NO exam_pass analytics after a rejection',
        !calls.uzTrack.some(c => c.type === 'exam_pass'));
    check('NO final quiz result stored after a rejection',
        !calls.saveQuizResult.some(c => c.payload && c.payload.examResult));
    check('the draft survives a rejection', !!memStore[stateKey]);
    dom.window.close();

    console.log('\n' + (failures === 0 ? 'ALL DOM TESTS PASSED ✓' : failures + ' DOM CHECK(S) FAILED ✗'));
    process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
