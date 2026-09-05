/* Headless DOM QA for a2-final-exam.html using jsdom.
   Verifies: render (100 rows), timer persistence, autosave, restore,
   perfect-score submission -> pass + completion write. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, '..', 'paid-courses', 'a2-final-exam.html');
let html = fs.readFileSync(htmlPath, 'utf8');
// Drop the external module script so jsdom doesn't try to load it; we stub the sync fns.
html = html.replace(/<script type="module" src="paid-platform.js"><\/script>/, '');
html = html.replace(/<script defer src="pro-toast.js"><\/script>/, '');

const data = JSON.parse(html.match(/var FINAL_EXAM_DATA = (\[.*?\]);/s)[1]);

const calls = { saveQuizResult: [], saveUserProgress: [], submitFinalExam: [], uzTrack: [], order: [] };
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
            window.saveQuizResult = (uid, topic, payload, course) => { calls.saveQuizResult.push({ uid, topic, payload, course, at: calls.order.length }); calls.order.push('saveQuizResult'); return Promise.resolve(true); };
            window.saveUserProgress = (uid, course, payload) => { calls.saveUserProgress.push({ uid, course, payload }); return Promise.resolve(true); };
            window.getUserQuizResults = () => Promise.resolve({});
            window.submitFinalExam = (course, answers) => {
                calls.submitFinalExam.push({ course, answers, at: calls.order.length });
                calls.order.push('submitFinalExam');
                if (window.__submitRejects) {
                    const e = new Error(window.__submitRejects.message || 'submit failed');
                    e.status = window.__submitRejects.status || null;
                    return Promise.reject(e);
                }
                const r = window.__serverResult || { correct: 100, total: 100, score: 100,
                    passMark: 80, passed: true, certificateUnlocked: true };
                return Promise.resolve(Object.assign({ ok: true, course }, r));
            };
            window.uzTrack = (type, data) => { calls.uzTrack.push({ type, data }); };
            // completion gate source — default: all 16 topics completed (course finished)
            window.__completed = window.__completed || [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16];
            window.getUserProgress = () => Promise.resolve({ completedTopics: window.__completed });
            /* THE AUTHORITATIVE READ. `__authFails` simulates a read that did
               not succeed — the case that must never fall back to localStorage. */
            window.getAuthoritativeCourseProgress = () => window.__authFails
                ? Promise.reject(new Error('read failed'))
                : Promise.resolve({ completedTopics: window.__completed, userExists: true });
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
    check('renders chip groups (78 chip qs)', d.querySelectorAll('[data-exam-chip]').length > 0 && inputs === 22);
    check('5 section heads + 1 passage', d.querySelectorAll('.exam-section-head').length === 5 && d.querySelectorAll('.exam-passage').length === 1);

    const stateKey = 'a2_finalexam_state_testUser123';
    let st = JSON.parse(memStore[stateKey] || 'null');
    check('timer state persisted with future deadline', !!st && st.deadline > Date.now());
    const timerTxt = d.getElementById('examTimerDisplay').textContent;
    check('timer shows ~120 min (' + timerTxt + ')', /^0[12]:(59|5[0-9]):/.test(timerTxt) || timerTxt.startsWith('02:00') || timerTxt.startsWith('01:59'));

    // answer a chip + an input, trigger autosave path
    const firstChip = d.querySelector('.exam-q-chip[data-exam-chip="0-0"][data-value="' + data[0].items[0].answer + '"]');
    firstChip.dispatchEvent(new w.Event('click', { bubbles: true }));
    const firstInput = d.querySelector('[data-exam-input="1-0"]');
    firstInput.value = 'У меня есть новый телефон';
    firstInput.dispatchEvent(new w.Event('input', { bubbles: true }));
    await wait(900); // debounced save (700ms)
    st = JSON.parse(memStore[stateKey] || 'null');
    check('autosave captured chip answer', st && st.answers['0-0'] === data[0].items[0].answer);
    check('autosave captured input answer', st && st.answers['1-0'] === 'У меня есть новый телефон');
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
    calls.saveQuizResult.length = 0; calls.saveUserProgress.length = 0; calls.submitFinalExam.length = 0; calls.uzTrack.length = 0; calls.order.length = 0;
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
    /* THE COMPLETION FIELDS ARE THE SERVER'S NOW. This page deliberately does
       NOT push finalExamPassed / courseCompleted / certificateUnlocked through
       the generic saveUserProgress path any more — it posts the answers and the
       server writes the verdict. (scripts/dom_test_b1_exam.cjs still asserts the
       old behaviour and fails on it; that copy predates the hardening.) */
    const sqr = calls.saveQuizResult.find(c => c.payload && c.payload.examResult);
    check('saveQuizResult wrote exam result', !!sqr && sqr.payload.examResult.passed === true);
    check('NO completion fields went through the generic saver', !sup
        || !('finalExamPassed' in (sup.payload || {})));
    check('the answers were submitted to the server grader as A2',
        calls.submitFinalExam.length === 1 && calls.submitFinalExam[0].course === 'A2');
    check('the server received 5 answer groups, 100 answers',
        calls.submitFinalExam.length === 1
        && calls.submitFinalExam[0].answers.length === 5
        && calls.submitFinalExam[0].answers.reduce(function (n, g) { return n + g.length; }, 0) === 100);
    check('local completion flag set', !!memStore['a2_completion_testUser123']);
    check('in-progress draft cleared after submit', !memStore[stateKey]);
    dom.window.close();

    // ---------- TEST 4: failing submission -> fail message, no completion ----------
    console.log('TEST 4 — empty submission: fail, no completion write');
    delete memStore[stateKey]; delete memStore['a2_completion_testUser123'];
    calls.saveUserProgress.length = 0; calls.uzTrack.length = 0;
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
    check('NO local completion flag on fail', !memStore['a2_completion_testUser123']);
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

    // ---------- TEST 5b: THE BOUNDARY — 15/16 must still be locked ----------
    console.log('TEST 5b — gate boundary: 15/16 locked, 16/16 open');
    dom = build((w) => { w.__completed = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]; }); // 15/16
    const d5b = dom.window.document;
    await wait(400);
    check('15 of 16 topics: exam still locked',
        d5b.querySelectorAll('[data-exam-row]').length === 0);
    check('15 of 16 topics: locked message shown',
        /Kursni to'liq tugatgandan/.test(d5b.getElementById('examExercises').textContent));
    dom.window.close();

    dom = build((w) => { w.__completed = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]; }); // 16/16
    const d5c = dom.window.document;
    await wait(400);
    check('16 of 16 topics: exam opens', d5c.querySelectorAll('[data-exam-row]').length === 100);
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


    // ---------- TEST 7: FORGED LOCAL PROGRESS CANNOT UNLOCK ----------
    console.log('TEST 7 — forged localStorage cannot upgrade server eligibility');
    dom = build((w) => {
        w.__completed = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];           // server 15/16
        w.localStorage.setItem('a2_progress_testUser123',
            JSON.stringify([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]));  // forged 16/16
    });
    const d7 = dom.window.document;
    await wait(400);
    check('server 15/16 + forged local 16/16: NO question rows',
        d7.querySelectorAll('[data-exam-row]').length === 0);
    check('server 15/16 + forged local 16/16: locked',
        /Kursni to'liq tugatgandan/.test(d7.getElementById('examExercises').textContent));
    check('server 15/16 + forged local 16/16: submit hidden',
        d7.getElementById('examFooterBar').classList.contains('hidden'));
    dom.window.close();

    // ---------- TEST 7b: SERVER EMPTY BEATS FULL LOCAL CACHE ----------
    console.log('TEST 7b — authoritative empty beats a full local cache');
    dom = build((w) => {
        w.__completed = [];
        w.localStorage.setItem('a2_progress_testUser123',
            JSON.stringify([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]));
    });
    const d7b = dom.window.document;
    await wait(400);
    check('server 0/16 + forged local 16/16: LOCKED',
        d7b.querySelectorAll('[data-exam-row]').length === 0);
    check('and it is the locked screen, not the sync error',
        /Kursni to'liq tugatgandan/.test(d7b.getElementById('examExercises').textContent));
    dom.window.close();

    // ---------- TEST 7c: UNREADABLE STATE -> SYNC ERROR, FAIL CLOSED ----------
    console.log('TEST 7c — unreadable course state fails closed with a sync error');
    dom = build((w) => {
        w.__authFails = true;
        w.localStorage.setItem('a2_progress_testUser123',
            JSON.stringify([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]));
    });
    const d7c = dom.window.document;
    await wait(400);
    check('read failure + forged local 16/16: NO question rows',
        d7c.querySelectorAll('[data-exam-row]').length === 0);
    const t7c = d7c.getElementById('examExercises').textContent;
    check('shows the sync error, not a completion accusation',
        /tekshirib bo'lmadi/.test(t7c) && !/tugating/.test(t7c));
    check('timer not started', d7c.getElementById('examTimerDisplay').textContent === '02:00:00');
    dom.window.close();

    function answerAll(doc, win) {
        data.forEach((sec, sIdx) => sec.items.forEach((it, qIdx) => {
            const key = sIdx + '-' + qIdx;
            const want = Array.isArray(it.answer) ? it.answer[0] : it.answer;
            if ((it.mode || sec.type) === 'chip') {
                const chip = doc.querySelector('.exam-q-chip[data-exam-chip="' + key + '"][data-value="' + want + '"]');
                if (chip) chip.dispatchEvent(new win.Event('click', { bubbles: true }));
            } else {
                const inp = doc.querySelector('[data-exam-input="' + key + '"]');
                if (inp) { inp.value = want; inp.dispatchEvent(new win.Event('input', { bubbles: true })); }
            }
        }));
    }

    // ---------- TEST 8: SERVER SCORE OVERRIDES A PASSING CLIENT PREVIEW ----------
    console.log('TEST 8 — client 100 PASS vs server 79 FAIL: server wins');
    delete memStore[stateKey]; delete memStore['a2_completion_testUser123'];
    calls.uzTrack.length = 0; calls.saveQuizResult.length = 0;
    dom = build((w) => { w.__serverResult = { correct: 79, total: 100, score: 79,
        passMark: 80, passed: false, certificateUnlocked: false }; });
    const d8 = dom.window.document, w8 = dom.window;
    await wait(400);
    answerAll(d8, w8);
    d8.getElementById('examSubmitBtn').dispatchEvent(new w8.Event('click', { bubbles: true }));
    await wait(800);
    const box8 = d8.querySelector('.exam-result-box');
    check('UI shows the SERVER score 79, not the client 100',
        box8 && /79 \/ 100/.test(box8.textContent) && !/>100 \/ 100</.test(box8.innerHTML));
    check('UI shows FAIL', box8 && box8.classList.contains('failed'));
    check('no certificate note on a server fail', box8 && !/sertifikat/i.test(box8.textContent));
    check('no completion cache on a server fail', !memStore['a2_completion_testUser123']);
    check('exam_fail analytics carries the server score',
        calls.uzTrack.length === 1 && calls.uzTrack[0].type === 'exam_fail'
        && calls.uzTrack[0].data.score === 79);
    const sqr8 = calls.saveQuizResult.find(c => c.payload && c.payload.examResult);
    check('the stored result mirrors the server, not the preview',
        sqr8 && sqr8.payload.examResult.passed === false
        && sqr8.payload.examResult.percentage === 79
        && sqr8.payload.examResult.score === 79);
    dom.window.close();

    // ---------- TEST 9: SERVER PASSES A CLIENT-FAILING PAPER ----------
    console.log('TEST 9 — client 0 vs server 80 PASS: server wins the other way');
    delete memStore[stateKey]; delete memStore['a2_completion_testUser123'];
    calls.uzTrack.length = 0;
    dom = build((w) => { w.__serverResult = { correct: 80, total: 100, score: 80,
        passMark: 80, passed: true, certificateUnlocked: true }; });
    const d9 = dom.window.document, w9 = dom.window;
    await wait(400);
    d9.getElementById('examSubmitBtn').dispatchEvent(new w9.Event('click', { bubbles: true }));
    await wait(800);
    const box9 = d9.querySelector('.exam-result-box');
    check('UI shows the SERVER score 80 on an unanswered paper',
        box9 && /80 \/ 100/.test(box9.textContent));
    check('UI shows PASS', box9 && box9.classList.contains('passed'));
    check('exam_pass analytics carries the server score',
        calls.uzTrack.length === 1 && calls.uzTrack[0].type === 'exam_pass'
        && calls.uzTrack[0].data.score === 80);
    check('completion cache written after a server PASS',
        !!memStore['a2_completion_testUser123']);
    dom.window.close();

    // ---------- TEST 10: SERVER REJECTION NEVER LOOKS LIKE A PASS ----------
    console.log('TEST 10 — server rejects a perfect paper: no verdict, draft kept');
    delete memStore[stateKey]; delete memStore['a2_completion_testUser123'];
    calls.uzTrack.length = 0; calls.saveQuizResult.length = 0;
    dom = build((w) => { w.__submitRejects = { status: 409, message: 'course incomplete' }; });
    const d10 = dom.window.document, w10 = dom.window;
    await wait(400);
    answerAll(d10, w10);
    await wait(900);
    d10.getElementById('examSubmitBtn').dispatchEvent(new w10.Event('click', { bubbles: true }));
    await wait(800);
    const fb10 = d10.getElementById('examFeedback').textContent;
    check('no result box is marked passed', !d10.querySelector('.exam-result-box.passed'));
    check("no PASS wording", !/O'tdingiz/.test(fb10));
    check('no certificate wording', !/sertifikat/i.test(fb10));
    check('no course-completed wording', !/muvaffaqiyatli tugatildi/.test(fb10));
    check('a neutral message is shown instead',
        /qabul qilinmadi|tasdiqlab bo'lmadi/.test(fb10));
    check('NO completion cache after a rejection', !memStore['a2_completion_testUser123']);
    check('NO exam_pass analytics after a rejection',
        !calls.uzTrack.some(c => c.type === 'exam_pass'));
    check('NO final quiz result stored after a rejection',
        !calls.saveQuizResult.some(c => c.payload && c.payload.examResult));
    check('THE DRAFT SURVIVES — answers are not lost', !!memStore[stateKey]);
    dom.window.close();

    // ---------- TEST 11: NETWORK ERROR -> RETRY, SAME ATTEMPT, SAME CLOCK ----------
    console.log('TEST 11 — network error then retry: same answers, clock untouched');
    delete memStore[stateKey]; delete memStore['a2_completion_testUser123'];
    calls.uzTrack.length = 0; calls.submitFinalExam.length = 0;
    dom = build((w) => { w.__submitRejects = { message: 'network down' }; });
    const d11 = dom.window.document, w11 = dom.window;
    await wait(400);
    answerAll(d11, w11);
    await wait(900);
    const deadlineBefore = JSON.parse(memStore[stateKey] || '{}').deadline;
    d11.getElementById('examSubmitBtn').dispatchEvent(new w11.Event('click', { bubbles: true }));
    await wait(800);
    check('a retry button is offered', !!d11.getElementById('examRetrySubmitBtn'));
    check('draft retained after a network error', !!memStore[stateKey]);
    check('the deadline was not moved',
        JSON.parse(memStore[stateKey] || '{}').deadline === deadlineBefore);
    w11.__submitRejects = null;
    w11.__serverResult = { correct: 88, total: 100, score: 88, passMark: 80,
        passed: true, certificateUnlocked: true };
    d11.getElementById('examRetrySubmitBtn').dispatchEvent(new w11.Event('click', { bubbles: true }));
    await wait(800);
    const box11 = d11.querySelector('.exam-result-box');
    check('the retry produced the server verdict', box11 && /88 \/ 100/.test(box11.textContent));
    check('and it passed', box11 && box11.classList.contains('passed'));
    check('the retry re-sent the captured attempt, not a new paper',
        calls.submitFinalExam.length === 2
        && calls.submitFinalExam[0].answers.length === calls.submitFinalExam[1].answers.length);
    check('draft cleared only once the verdict arrived', !memStore[stateKey]);
    dom.window.close();

    // ---------- TEST 12: CALL ORDER ----------
    console.log('TEST 12 — submitFinalExam precedes every authoritative side effect');
    delete memStore[stateKey]; delete memStore['a2_completion_testUser123'];
    calls.order.length = 0; calls.saveQuizResult.length = 0;
    dom = build();
    const d12 = dom.window.document, w12 = dom.window;
    await wait(400);
    d12.getElementById('examSubmitBtn').dispatchEvent(new w12.Event('click', { bubbles: true }));
    await wait(800);
    check('submitFinalExam ran first', calls.order[0] === 'submitFinalExam');
    check('saveQuizResult ran after it', calls.order.indexOf('saveQuizResult') > 0);
    dom.window.close();

    console.log('\n' + (failures === 0 ? 'ALL DOM TESTS PASSED ✓' : failures + ' DOM CHECK(S) FAILED ✗'));
    process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
