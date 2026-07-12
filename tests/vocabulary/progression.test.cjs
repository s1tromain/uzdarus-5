/* ==================================================================
 * Vocabulary progression — REAL integration test.
 *
 * Why this file exists
 * --------------------
 * progression_audit.test.cjs asserts against a hand-written *copy* of the
 * unlock logic ("mirrors speech.js"). That copy has no notion of the
 * pronunciation policy, so when the 2026 redesign moved the mic to A2/B2 only,
 * the real _isWordLocked() started pinning A1/B1/demo learners to word 0
 * forever while the mirrored test stayed green.
 *
 * This suite loads the ACTUAL paid-courses/speech.js into jsdom, once per
 * course surface, and drives the real flow the learner drives: open a topic,
 * press Tinglash, press Keyingi. It asserts the two invariants that must hold
 * together:
 *
 *   1. Where the mic is DISABLED (paid A1, paid B1, all 4 demos) pronunciation
 *      must NEVER gate progression — the learner can always reach the last card
 *      and complete the lesson.
 *   2. Where the mic is ENABLED (paid A2, paid B2) the pronunciation gate must
 *      STILL hold — a learner who has not passed the word cannot skip ahead.
 *
 * Run: node tests/vocabulary/progression.test.cjs
 * ================================================================== */
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const SPEECH_JS = fs.readFileSync(
    path.join(__dirname, '..', '..', 'paid-courses', 'speech.js'), 'utf8');

let passed = 0, failed = 0;
const fails = [];
function ok(cond, msg) {
    if (cond) { passed++; console.log('   ✓ ' + msg); }
    else { failed++; fails.push(msg); console.log('   ✗ ' + msg); }
}
function section(t) { console.log('\n' + t); }

/* ------------------------------------------------------------------
 * Boot speech.js on a synthetic vocabulary page.
 * `pathname` is the ONLY thing that drives _pronPolicy(), exactly as in
 * production (_detectLevel + _isDemoSpeechPage read window.location).
 * ---------------------------------------------------------------- */
function boot({ pathname, course, words, localAudio = false }) {
    const dom = new JSDOM(`<!doctype html><html><body>
        <div id="flashcardScreen">
          <div id="wordRussian"></div>
          <div class="audio-controls">
            <button class="audio-button listen-btn">Tinglash</button>
            <button class="audio-button pron-btn">Mic</button>
          </div>
          <button id="nextWordBtn" class="control-btn primary">Keyingi</button>
        </div>
        <div id="speechProgressFill"></div><div id="progressText"></div>
        </body></html>`,
        { url: 'https://uzdarus.example' + pathname, runScripts: 'dangerously', pretendToBeVisual: true });

    const w = dom.window;

    /* --- environment stubs (no network, no audio hardware in CI) --- */
    w.VOCAB_COURSE = course;
    const net = { tts: 0, head: 0, token: 0 };
    w.fetch = (url, opts) => {
        const u = String(url);
        const method = (opts && opts.method) || 'GET';
        if (method === 'HEAD') {
            net.head++;
            /* localAudio:true simulates a deployment where `npm run generate:audio`
               HAS produced the /audio/{level}/lesson{N}/*.mp3 tree. */
            return Promise.resolve({ ok: localAudio, status: localAudio ? 200 : 404 });
        }
        if (u.includes('/api/tts')) {
            net.tts++;
            return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new w.Blob(['mp3'])) });
        }
        if (u.includes('/api/speech-token')) { net.token++; }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    };
    /* real browsers mint a UNIQUE url per blob — a constant here would make two
       different words compare equal and mask src-reassignment bugs */
    let blobSeq = 0;
    w.URL.createObjectURL = () => 'blob:stub/' + (++blobSeq);
    w.URL.revokeObjectURL = () => {};
    /* mimic the real HTMLMediaElement.src getter: it always reports an ABSOLUTE
       url, even when a relative path was assigned. */
    const srcAssignments = [];
    w.Audio = class {
        constructor(s) { this._src = ''; if (s) this.src = s; }
        get src() { return this._src; }
        set src(v) { srcAssignments.push(v); this._src = new w.URL(v, w.location.href).href; }
        play() { played.push(this._src); return Promise.resolve(); }
        pause() {}
    };
    const played = [];
    w.caches = undefined;                    /* exercise the no-Cache-API path */
    w.requestIdleCallback = undefined;

    /* the page's own flashcard state (mirrors every *-vocabulary.html) */
    let currentWordIndex = 0;
    let currentTopicId = null;
    w.getCurrentWord = () => {
        if (currentTopicId == null) return null;
        const word = words[currentWordIndex];
        if (!word) return null;
        return { ru: word, uz: 'uz-' + word, topicId: currentTopicId, wordIndex: currentWordIndex };
    };

    /* run the real speech.js */
    const script = w.document.createElement('script');
    script.textContent = SPEECH_JS;
    w.document.body.appendChild(script);

    /* startTopic(): what every vocabulary page does on topic open */
    const api = {
        w, net, played, srcAssignments,
        startTopic(topicId) {
            currentTopicId = topicId;
            currentWordIndex = 0;
            w.currentWordIndex = 0;
            if (typeof w.seedWordProgress === 'function') w.seedWordProgress(topicId, words.length, 0);
            else w.initWordProgress(topicId, words.length);
            currentWordIndex = 0;              /* page owns the index */
            w.currentWordIndex = 0;
        },
        /* verbatim copy of the guard used by all 8 nextCard() implementations */
        nextCard() {
            const nextIdx = currentWordIndex + 1;
            if (typeof w._isWordLocked === 'function' && w._isWordLocked(currentTopicId, nextIdx)) {
                return false;                  /* blocked — learner is stuck */
            }
            currentWordIndex = nextIdx;
            w.currentWordIndex = currentWordIndex;
            return true;
        },
        prevCard() {
            if (currentWordIndex > 0) { currentWordIndex--; w.currentWordIndex = currentWordIndex; return true; }
            return false;
        },
        /* clicking Tinglash really goes through playAudio() -> _notePassiveProgress */
        listen() {
            const btn = w.document.querySelector('.listen-btn');
            return w.playAudio({ target: btn, currentTarget: btn });
        },
        /* clicking Keyingi fires the capture-phase delegate, then nextCard() */
        pressNext() {
            const btn = w.document.getElementById('nextWordBtn');
            btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
            return api.nextCard();
        },
        idx: () => currentWordIndex,
        topic: () => currentTopicId,
    };
    return api;
}

const WORDS = ['привет', 'спасибо', 'пожалуйста', 'хорошо', 'до свидания'];

/* Every vocabulary surface on the platform. */
const SURFACES = [
    { name: 'Paid A1',  pathname: '/paid-courses/a1-vocabulary.html', course: 'a1',      mic: false },
    { name: 'Paid B1',  pathname: '/paid-courses/b1-vocabulary.html', course: 'b1',      mic: false },
    { name: 'Paid A2',  pathname: '/paid-courses/a2-vocabulary.html', course: 'a2',      mic: true  },
    { name: 'Paid B2',  pathname: '/paid-courses/b2-vocabulary.html', course: 'b2',      mic: true  },
    { name: 'Demo A1',  pathname: '/a1-demo-vocabulary.html',         course: 'a1-demo', mic: false },
    { name: 'Demo A2',  pathname: '/a2-demo-vocabulary.html',         course: 'a2-demo', mic: false },
    { name: 'Demo B1',  pathname: '/b1-demo-vocabulary.html',         course: 'b1-demo', mic: false },
    { name: 'Demo B2',  pathname: '/b2-demo-vocabulary.html',         course: 'b2-demo', mic: false },
];

/* ================================================================== */
section('Pronunciation policy — mic availability per surface');
for (const s of SURFACES) {
    const app = boot({ ...s, words: WORDS });
    ok(app.w._pronEnabled() === s.mic,
        `${s.name}: mic ${s.mic ? 'ENABLED' : 'disabled'}`);
}

/* ================================================================== */
section('BUG #1 — listen-only courses must never be gated by pronunciation');
for (const s of SURFACES.filter(x => !x.mic)) {
    const app = boot({ ...s, words: WORDS });
    app.startTopic(1);

    ok(app.w._isWordLocked(1, 1) === false, `${s.name}: word 1 not locked on a fresh topic`);

    /* the exact reported flow: press Tinglash, then try to continue */
    app.listen();
    ok(app.pressNext() === true, `${s.name}: Tinglash → Keyingi advances (the reported bug)`);
    ok(app.idx() === 1, `${s.name}: landed on card 2`);

    /* and a learner who never presses Tinglash must still not be trapped */
    ok(app.pressNext() === true, `${s.name}: Keyingi without listening also advances`);

    /* walk the rest of the deck to the end */
    let blocked = false;
    while (app.idx() < WORDS.length - 1) {
        app.listen();
        if (!app.pressNext()) { blocked = true; break; }
    }
    ok(!blocked, `${s.name}: full deck walkable to the last card`);
    ok(app.idx() === WORDS.length - 1, `${s.name}: reached final card (${WORDS.length}/${WORDS.length})`);

    /* completion + progress must still be recorded (stats/analytics depend on it) */
    app.listen();
    app.pressNext();
    ok(app.w._isLessonComplete(1) === true, `${s.name}: lesson marked COMPLETE`);
    ok(app.w.isWordCompleted(1, 0) === true, `${s.name}: word progress persisted`);

    /* the pronunciation nag toast must be unreachable */
    ok(app.w.document.getElementById('_nextWarnToast') === null,
        `${s.name}: no "Avval so‘zni to‘g‘ri ayting" toast`);
}

/* ================================================================== */
section('NO REGRESSION — A2/B2 pronunciation gate must still hold');
for (const s of SURFACES.filter(x => x.mic)) {
    const app = boot({ ...s, words: WORDS });
    app.startTopic(1);

    ok(app.w._isWordLocked(1, 1) === true, `${s.name}: word 1 IS locked until pronounced`);
    app.listen();
    ok(app.w._isWordLocked(1, 1) === true, `${s.name}: listening alone does NOT unlock (gate intact)`);
    ok(app.pressNext() === false, `${s.name}: Keyingi blocked without a passing pronunciation`);
    ok(app.idx() === 0, `${s.name}: learner held on card 1`);
    ok(app.w._isLessonComplete(1) === false, `${s.name}: lesson not complete`);

    /* a passing pronunciation (what checkPronunciation does on didPass) unlocks */
    app.w._completeWord(1, 0);
    ok(app.w._isWordLocked(1, 1) === false, `${s.name}: passing pronunciation unlocks word 2`);
    ok(app.pressNext() === true, `${s.name}: Keyingi advances after a pass`);
}

/* ================================================================== */
section('Previous card / navigation');
for (const s of SURFACES) {
    const app = boot({ ...s, words: WORDS });
    app.startTopic(1);
    if (s.mic) app.w._completeWord(1, 0);
    app.pressNext();
    ok(app.prevCard() === true && app.idx() === 0, `${s.name}: previous card works`);
    ok(app.prevCard() === false, `${s.name}: cannot go back past card 1`);
}

/* ================================================================== */
/* let any scheduled prefetch / idle work drain before counting requests */
const settle = () => new Promise(r => setTimeout(r, 350));

(async function audioPipeline() {
    section('BUG #2 — audio pipeline: no duplicate work');

    const app = boot({ ...SURFACES[0], words: WORDS });
    app.startTopic(1);

    /* three presses of Tinglash on the SAME word must collapse to one synthesis */
    await Promise.all([app.listen(), app.listen(), app.listen()]);
    await settle();
    ok(app.net.tts === 1,
        `same word listened 3x → 1 Azure synthesis (was 3, got ${app.net.tts})`);

    /* the dead /audio 404 probe must be paid at most once, not once per word */
    ok(app.net.head <= 1,
        `local-audio 404 probe fires at most once (was once per word, got ${app.net.head})`);

    app.pressNext();
    await app.listen();
    await settle();
    ok(app.net.head <= 1,
        `second word does NOT re-probe the missing /audio tree (got ${app.net.head})`);
    ok(app.net.tts === 2,
        `second word → exactly one new synthesis (got ${app.net.tts})`);

    /* replaying an already-heard word must not touch the network at all */
    const before = app.net.tts;
    const srcBefore = app.srcAssignments.length;
    await app.listen();
    await settle();
    ok(app.net.tts === before, `replaying a cached word → 0 network requests`);
    /* and it must REUSE the decoded buffer rather than re-assigning src.
       audio.src reports an absolute url, so comparing against it would silently
       fail for relative local paths ('/audio/…') and re-decode every replay. */
    ok(app.srcAssignments.length === srcBefore,
        `replaying a cached word → src not reassigned (decoded buffer reused)`);

    /* voice switch must not silently serve the other voice's audio */
    app.w.localStorage.setItem('tts_voice', 'female');
    await app.listen();
    await settle();
    ok(app.net.tts === before + 1,
        `voice switch re-synthesises (cache key includes voice)`);

    /* a listen-only page must never fetch a speech token */
    ok(app.net.token === 0, `listen-only page never requests an Azure speech token`);

    /* ---- pre-generated /audio tree (what `npm run generate:audio` produces) ----
       Here the resolved URL is a RELATIVE path. HTMLMediaElement.src reports an
       ABSOLUTE url, so any src-based equality check silently fails and re-decodes
       the file on every replay. Guard that. */
    section('BUG #2 — pre-generated /audio tree (static files) path');
    const la = boot({ ...SURFACES[0], words: WORDS, localAudio: true });
    la.startTopic(1);
    await la.listen();
    await settle();
    ok(la.net.tts === 0, `local file served → 0 Azure synthesis`);
    ok(la.srcAssignments.some(s => s.startsWith('/audio/')),
        `local relative path used as the audio source`);

    const laSrc = la.srcAssignments.length;
    await la.listen();
    await settle();
    ok(la.srcAssignments.length === laSrc,
        `replay of a LOCAL file → src not reassigned (absolute-vs-relative trap)`);
    ok(la.net.tts === 0, `replay of a local file → still 0 synthesis`);

    /* ---- superseded playback must never pop a dialog ----
       One shared <audio> element means assigning a new src rejects the pending
       play() with AbortError. That happens whenever the learner switches card
       mid-load. It must be swallowed, not surfaced as alert("Audio yuklanmadi"). */
    section('BUG #2 — interrupted playback (fast card switching) is silent');
    const ab = boot({ ...SURFACES[0], words: WORDS });
    let alerted = 0;
    ab.w.alert = () => { alerted++; };
    /* Model a real element: the FIRST play() is still in flight when the learner
       switches card; assigning the new src rejects it with AbortError. Later
       plays settle normally. */
    let plays = 0;
    ab.w.Audio = class {
        constructor() { this._src = ''; }
        get src() { return this._src; }
        set src(v) { this._src = v; if (this._abort) { const a = this._abort; this._abort = null; a(); } }
        play() {
            if (++plays > 1) return Promise.resolve();
            return new Promise((_res, rej) => {
                this._abort = () => {
                    const e = new Error('The play() request was interrupted by a new load request.');
                    e.name = 'AbortError';
                    rej(e);
                };
            });
        }
        pause() {}
    };
    ab.startTopic(1);
    const p1 = ab.listen();          /* never resolves — will be superseded */
    ab.pressNext();
    await ab.listen();               /* new src → aborts the first play */
    await p1;                        /* the superseded one settles */
    await settle();
    ok(alerted === 0,
        `interrupted playback shows NO alert dialog (got ${alerted})`);

    section('Progress bar accepts the page’s legacy call shape');
    const p = boot({ ...SURFACES[0], words: WORDS });
    p.startTopic(1);
    await p.listen();
    p.pressNext();                       /* word 0 completed */
    /* every page calls updateProgressBar(currentWordIndex, total) — a WORD INDEX
       where a topic id belongs. It must not reset the bar to 0/N. */
    p.w.updateProgressBar(1, WORDS.length);
    const text = p.w.document.getElementById('progressText').innerText;
    ok(text === '1/' + WORDS.length,
        `legacy updateProgressBar(wordIndex,total) resolves to the open topic (got ${text})`);

    console.log('\n' + '─'.repeat(58));
    if (failed) {
        console.log(`  ❌ VOCABULARY: ${passed} passed, ${failed} FAILED`);
        fails.forEach(f => console.log('     - ' + f));
        console.log('─'.repeat(58));
        process.exit(1);
    }
    console.log(`  ✅ VOCABULARY: ${passed}/${passed} assertions passed`);
    console.log('─'.repeat(58));

    /* The A2/B2 windows boot the real Azure SDK loader, whose CDN retry/backoff
       chain keeps jsdom timers pending. Results are in — leave deterministically
       instead of waiting the loader out. */
    process.exit(0);
})();
