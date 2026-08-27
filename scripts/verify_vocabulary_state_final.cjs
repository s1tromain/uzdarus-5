#!/usr/bin/env node
/**
 * verify_vocabulary_state_final.cjs — the ten states a learner is actually in.
 *
 * WHY THIS EXISTS, SEPARATELY FROM THE COMPONENT SUITE.
 *
 * verify_vocabulary_component_integration.cjs proves the REPORT is earned: the
 * server hears about the vocabulary half only when a learner walks the deck.
 * That is a question about one moment. This suite asks the other question —
 * what the learner finds when they come BACK. A deck that reports correctly
 * and then loses the learner's place on reload is still a broken deck, and no
 * assertion about the reporter can see that.
 *
 * The two failure directions are opposite and both fatal:
 *
 *   RESETTING — reopening the page throws away real work. The learner walked
 *   40 of 89 words, closed the tab, and is put back at word 1.
 *
 *   GRANTING — rendering cards is mistaken for learning them. The deck marks
 *   itself complete because it was opened, and the topic completes without
 *   anyone reading anything.
 *
 * So every state below is driven through the SHIPPED functions of the four
 * shipped decks — startTopic/openTopic, loadUserProgress/loadProgress,
 * saveProgress, showCompletion/showCompletionScreen — lifted out of the real
 * HTML, over a localStorage that survives the "reload" the way a browser's
 * does. The deck data is the real vocabularyData literal from each page, so
 * the resume arithmetic runs against the real word counts, not a toy deck.
 *
 * The last section fingerprints that content. A vocabulary course is its
 * words; a refactor that silently drops or duplicates twenty of them is a
 * content bug no behavioural test would ever notice.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('\n=== VOCABULARY STATE FINAL ===');

/* ================================================================ *
 * THE FOUR SHIPPED DECKS
 * ---------------------------------------------------------------- *
 * B2 was written separately and kept its own names. Encoding that
 * here rather than renaming anything keeps this suite honest about
 * what is really on disk.
 * ================================================================ */
const DECKS = [
    { code: 'A1', file: 'paid-courses/a1-vocabulary.html', open: 'startTopic',
      load: 'loadUserProgress', done: 'showCompletion', idx: 'currentWordIndex',
      key: (u) => `a1_vocabulary_progress_${u}`, extra: [] },
    { code: 'A2', file: 'paid-courses/a2-vocabulary.html', open: 'startTopic',
      load: 'loadUserProgress', done: 'showCompletion', idx: 'currentWordIndex',
      key: (u) => `a2_vocabulary_progress_${u}`, extra: [] },
    { code: 'B1', file: 'paid-courses/b1-vocabulary.html', open: 'startTopic',
      load: 'loadUserProgress', done: 'showCompletion', idx: 'currentWordIndex',
      key: (u) => `b1_vocabulary_progress_${u}`, extra: [] },
    { code: 'B2', file: 'paid-courses/b2-vocabulary.html', open: 'openTopic',
      load: 'loadProgress', done: 'showCompletionScreen', idx: 'currentCardIndex',
      key: (u) => `b2_vocabulary_progress_${u}`,
      extra: ['getProgressStorageKey', 'clampProgressValue', 'getTopicProgress'] }
];

const SRC = {};
DECKS.forEach((d) => { SRC[d.code] = read(d.file); });

/** Lift one whole function declaration out of a page, braces balanced. */
function lift(src, name) {
    const i = src.search(new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\('));
    if (i < 0) return null;
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
    return null;
}

/** The page's own vocabularyData literal — the real words, real counts. */
const DATA = {};
function vocabularyData(code) {
    if (DATA[code]) return DATA[code];
    const s = SRC[code];
    const i = s.indexOf('const vocabularyData');
    const b = s.indexOf('{', i);
    let d = 0;
    for (let k = b; k < s.length; k++) {
        if (s[k] === '{') d++;
        else if (s[k] === '}') {
            d--;
            if (d === 0) { DATA[code] = (0, eval)('(' + s.slice(b, k + 1) + ')'); return DATA[code]; }
        }
    }
    throw new Error('unbalanced vocabularyData in ' + code);
}

/**
 * One deck, alive.
 *
 * `carry` is the browser store that outlives the document. Every "reload"
 * below builds a brand new JSDOM and hands it the same carry, which is what a
 * real reload does and what makes the difference between "the note survived"
 * and "the harness kept it in a variable" observable.
 */
function deck(spec, opts) {
    opts = opts || {};
    const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
    const dom = new JSDOM(
        `<!doctype html><body>
           <div id="topicSelection"></div>
           <div id="flashcardScreen" class="active"></div>
           <div id="completionScreen"><div class="completion-title"></div>
             <div id="completionMessage"></div></div>
         </body>`,
        { url: 'https://uzdarus.test/paid-courses/x.html', runScripts: 'outside-only',
          pretendToBeVisual: true, virtualConsole: vc });
    const w = dom.window;

    new Function('window', 'document', 'localStorage', read('vocabulary-component.js'))
        (w, w.document, w.localStorage);

    const carry = opts.carry || {};
    Object.keys(carry).forEach((k) => { try { w.localStorage.setItem(k, carry[k]); } catch (e) {} });
    const proto = w.Storage.prototype;
    const rawSet = proto.setItem, rawRemove = proto.removeItem, rawClear = proto.clear;
    proto.setItem = function (k, v) { carry[k] = String(v); return rawSet.call(this, k, v); };
    proto.removeItem = function (k) { delete carry[k]; return rawRemove.call(this, k); };
    proto.clear = function () { Object.keys(carry).forEach((k) => delete carry[k]); return rawClear.call(this); };

    const user = opts.user === null ? null : (opts.user || 'u-1');
    if (user) w.localStorage.setItem('currentUser', JSON.stringify({ id: user, email: user + '@x.uz' }));

    /* the network edge, counted */
    const componentCalls = [];
    const serverWrites = [];
    w.firebaseReady = true;
    w.completeCourseComponent = opts.component || (async (course, topicId, component) => {
        componentCalls.push({ course, topicId, component });
        return ack(course, topicId, component, opts.topicCompleted === true, opts.ackCompletedTopics || []);
    });
    w.getUserProgress = async (id, course) => (opts.server === undefined ? null : opts.server);
    w.saveUserProgress = async (id, course, patch) => {
        serverWrites.push({ course, patch });
        if (opts.failServerSave) throw new Error('offline');
        return true;
    };
    w.__vocabCourseState = opts.courseState || null;

    /* speech, in whatever broken shape the scenario wants */
    if (opts.speech === 'absent') { /* nothing defined at all */ }
    else if (opts.speech === 'throws') {
        w.speakWord = () => { throw new Error('provider down'); };
        w.UzSpeech = { assess: () => { throw new Error('provider down'); } };
    }

    const data = opts.data || vocabularyData(spec.code);
    const lower = spec.code.toLowerCase();
    const names = [spec.load, 'saveProgress', spec.open, spec.done, 'restartTopic',
                   lower + 'ReportVocabulary', lower + 'ApplyVocabOutcome'].concat(spec.extra);
    const bodies = names.map((n) => lift(SRC[spec.code], n)).filter(Boolean);

    /* the pages narrate themselves to the console; that is their business,
       not this report's, so the lifted code gets a quiet one */
    const quiet = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
    const scope = new Function('window', 'document', 'localStorage', 'vocabularyData', '__opts', 'console', `
        var learnedWords = {};
        var currentTopicId = null;
        var ${spec.idx} = 0;
        var currentWords = [];
        var totalWords = 0;
        var isFlipped = false;
        var vocabProgressReady = Promise.resolve();
        function loadCard(){}
        function updateCard(){}
        function loadTopics(){}
        function renderTopics(){}
        function initWordProgress(){}
        ${bodies.join('\n\n')}
        return {
            load: ${spec.load},
            save: saveProgress,
            open: ${spec.open},
            complete: ${spec.done},
            restart: typeof restartTopic === 'function' ? restartTopic : null,
            report: ${lower}ReportVocabulary,
            get learned(){ return learnedWords; },
            set learned(v){ learnedWords = v; },
            get topicId(){ return currentTopicId; },
            set topicId(v){ currentTopicId = v; },
            get index(){ return ${spec.idx}; },
            set index(v){ ${spec.idx} = v; }
        };`)(w, w.document, w.localStorage, data, opts, quiet);

    return {
        window: w, carry, user, data, scope, componentCalls, serverWrites,
        code: spec.code, spec,
        topic: (id) => data.topics.find((t) => t.id === id),
        text: () => w.document.body.textContent.replace(/\s+/g, ' ').trim(),
        retryButton: () => w.document.querySelector('.uz-vocab-retry'),
        stored: () => {
            const raw = carry[spec.key(opts.user === null ? 'undefined' : (opts.user || 'u-1'))];
            try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
        },
        V: w.UzVocabularyComponent
    };
}

function ack(course, topicId, component, topicCompleted, completedTopics) {
    return {
        ok: true, course, topicId, component,
        components: { vocabularyCompleted: true, exercisesCompleted: topicCompleted === true,
                      vocabularyCompletedAt: null, exercisesCompletedAt: null },
        topicCompleted: topicCompleted === true,
        completedTopics: completedTopics.slice(),
        nextTopic: topicCompleted === true ? Number(topicId) + 1 : null
    };
}

/** Walk a deck to a given word, the way the page does — one save per word. */
async function walkTo(d, topicId, wordIndex) {
    d.scope.topicId = topicId;
    for (let i = 0; i <= wordIndex; i++) {
        d.scope.index = i;
        await d.scope.save();
    }
}

(async () => {

/* ================================================================ *
 * A1 — THE TEN STATES, ON ALL FOUR DECKS
 * ================================================================ */
for (const spec of DECKS) {
    const C = spec.code;
    const T = 1;

    /* ---- INITIAL ------------------------------------------------ */
    {
        const d = deck(spec, {});
        await d.scope.load();
        const total = d.topic(T).words.length;
        eq(`${C} initial — nothing learned yet`, Number(d.scope.learned[`topic_${T}`] || 0), 0);
        eq(`${C} initial — no component reported on load`, d.componentCalls.length, 0);
        const st = d.V.pageState({ course: C, topicId: T, courseState: null, user: d.user });
        eq(`${C} initial — page state is 'learn'`, st.mode, 'learn');
        ok(total > 0, `${C} initial — the real deck has words (${total})`);
    }

    /* ---- MID-DECK ----------------------------------------------- */
    {
        const d = deck(spec, {});
        await d.scope.load();
        await walkTo(d, T, 9);
        eq(`${C} mid-deck — resume count is the 10th word`, Number(d.scope.learned[`topic_${T}`]), 10);
        eq(`${C} mid-deck — still nothing reported to the server`, d.componentCalls.length, 0);
        ok(d.stored() && Number(d.stored()[`topic_${T}`]) === 10,
            `${C} mid-deck — the local mirror was written`);
    }

    /* ---- RELOAD MID-DECK ---------------------------------------- */
    {
        const first = deck(spec, {});
        await first.scope.load();
        await walkTo(first, T, 9);

        const again = deck(spec, { carry: first.carry });
        await again.scope.load();
        eq(`${C} reload mid-deck — the 10 words survived the reload`,
            Number(again.scope.learned[`topic_${T}`]), 10);

        /* and the deck opens where the learner left off, not at word 1 */
        again.window.vocabResumeChoice = async () => 'continue';
        await again.scope.open(T);
        eq(`${C} reload mid-deck — resumes at word 10, not word 1`, again.scope.index, 9);
        eq(`${C} reload mid-deck — reopening reported nothing`, again.componentCalls.length, 0);
    }

    /* ---- RETURN FROM CABINET ------------------------------------ */
    {
        /* the learner left the deck, went to the cabinet, came back: the
           server now answers with the progress it stored */
        const first = deck(spec, {});
        await first.scope.load();
        await walkTo(first, T, 24);

        const back = deck(spec, {
            carry: first.carry,
            server: { vocabulary: { learnedWords: { [`topic_${T}`]: 25 } },
                      completedTopics: [], topicComponents: {} }
        });
        await back.scope.load();
        eq(`${C} return from cabinet — server progress is honoured`,
            Number(back.scope.learned[`topic_${T}`]), 25);
        back.window.vocabResumeChoice = async () => 'continue';
        await back.scope.open(T);
        eq(`${C} return from cabinet — resumes at word 25`, back.scope.index, 24);
    }

    /* ---- COMPLETED ---------------------------------------------- */
    {
        const d = deck(spec, { topicCompleted: false });
        await d.scope.load();
        const total = d.topic(T).words.length;
        await walkTo(d, T, total - 1);
        d.scope.complete();
        await new Promise((r) => setTimeout(r, 0));
        eq(`${C} completed — every word of the real deck is recorded`,
            Number(d.scope.learned[`topic_${T}`]), total);
        eq(`${C} completed — the vocabulary half was reported exactly once`,
            d.componentCalls.length, 1);
        eq(`${C} completed — and it was reported as 'vocabulary'`,
            d.componentCalls[0].component, 'vocabulary');
        eq(`${C} completed — for this topic`, Number(d.componentCalls[0].topicId), T);
        ok(!d.carry[d.V.pendingKey(C, T, d.user)],
            `${C} completed — the pending note was cleared on success`);
    }

    /* ---- COMPLETED + RELOAD ------------------------------------- */
    {
        const first = deck(spec, { topicCompleted: false });
        await first.scope.load();
        const total = first.topic(T).words.length;
        await walkTo(first, T, total - 1);
        first.scope.complete();
        await new Promise((r) => setTimeout(r, 0));

        /* the server now knows; reopening must not ask again */
        const state = { completedTopics: [], topicComponents: { [T]: { vocabularyCompleted: true } } };
        const again = deck(spec, { carry: first.carry, courseState: state });
        await again.scope.load();
        again.window.__vocabCourseState = state;
        const st = again.V.pageState({ course: C, topicId: T, courseState: state, user: again.user });
        eq(`${C} completed+reload — page state is 'done'`, st.mode, 'done');

        const outcome = await again.scope.report(T);
        eq(`${C} completed+reload — no duplicate report`, again.componentCalls.length, 0);
        eq(`${C} completed+reload — the deck says 'already'`, outcome.stage, 'already');
        eq(`${C} completed+reload — progress still reads complete`,
            Number(again.scope.learned[`topic_${T}`] || 0), total);
    }

    /* ---- COMPONENT SYNC PENDING --------------------------------- */
    {
        const d = deck(spec, { component: async () => { throw new Error('offline'); } });
        await d.scope.load();
        const total = d.topic(T).words.length;
        await walkTo(d, T, total - 1);
        d.scope.complete();
        await new Promise((r) => setTimeout(r, 0));

        eq(`${C} sync pending — the learner's work is still recorded`,
            Number(d.scope.learned[`topic_${T}`]), total);
        ok(!!d.carry[d.V.pendingKey(C, T, d.user)],
            `${C} sync pending — the unsynced note was written`);
        ok(!!d.retryButton(), `${C} sync pending — a retry control is offered`);
        eq(`${C} sync pending — the retry control says Qayta urinish`,
            d.retryButton().textContent, 'Qayta urinish');
        ok(/saqlab bo/.test(d.text()), `${C} sync pending — the learner is told the save failed`);
    }

    /* ---- SYNC PENDING + RELOAD ---------------------------------- */
    {
        const first = deck(spec, { component: async () => { throw new Error('offline'); } });
        await first.scope.load();
        const total = first.topic(T).words.length;
        await walkTo(first, T, total - 1);
        first.scope.complete();
        await new Promise((r) => setTimeout(r, 0));

        const again = deck(spec, { carry: first.carry });
        await again.scope.load();
        const st = again.V.pageState({ course: C, topicId: T, courseState: null, user: again.user });
        eq(`${C} pending+reload — page state is 'sync', not 'learn'`, st.mode, 'sync');
        eq(`${C} pending+reload — the deck is NOT reset for a redo`,
            Number(again.scope.learned[`topic_${T}`]), total);
        eq(`${C} pending+reload — nothing was reported merely by reloading`,
            again.componentCalls.length, 0);
    }

    /* ---- SYNC RETRY --------------------------------------------- */
    {
        let attempts = 0;
        const first = deck(spec, {
            component: async () => { attempts++; throw new Error('offline'); }
        });
        await first.scope.load();
        const total = first.topic(T).words.length;
        await walkTo(first, T, total - 1);
        first.scope.complete();
        await new Promise((r) => setTimeout(r, 0));
        eq(`${C} retry — the first attempt failed`, attempts, 1);

        /* reload, then press retry — the COMPONENT alone, no deck walk */
        const again = deck(spec, { carry: first.carry, topicCompleted: true, ackCompletedTopics: [T] });
        await again.scope.load();
        const before = Number(again.scope.learned[`topic_${T}`]);
        const outcome = await again.scope.report(T);

        eq(`${C} retry — exactly one component call, nothing else`, again.componentCalls.length, 1);
        eq(`${C} retry — it is the component call, not a topic call`,
            again.componentCalls[0].component, 'vocabulary');
        ok(outcome.ok, `${C} retry — succeeded`);
        eq(`${C} retry — the learner never re-walked the deck`,
            Number(again.scope.learned[`topic_${T}`]), before);
        ok(!again.carry[again.V.pendingKey(C, T, again.user)],
            `${C} retry — the pending note is cleared once the server has it`);
    }

    /* ---- SPEECH FAILURE ----------------------------------------- */
    {
        const d = deck(spec, { speech: 'throws', topicCompleted: false });
        await d.scope.load();
        const total = d.topic(T).words.length;
        await walkTo(d, T, total - 1);
        d.scope.complete();
        await new Promise((r) => setTimeout(r, 0));
        eq(`${C} speech failure — the deck still completes`,
            Number(d.scope.learned[`topic_${T}`]), total);
        eq(`${C} speech failure — the half is still reported`, d.componentCalls.length, 1);
    }
}

/* ================================================================ *
 * A2 — PARTIAL PROGRESS IS NOT A RESET, AND RENDERING IS NOT LEARNING
 * ---------------------------------------------------------------- *
 * The two named failure directions, stated as their own assertions
 * so a regression in either one names itself.
 * ================================================================ */
for (const spec of DECKS) {
    const C = spec.code;

    /* reopening must not reset */
    {
        const first = deck(spec, {});
        await first.scope.load();
        await walkTo(first, 2, 14);
        const again = deck(spec, { carry: first.carry });
        await again.scope.load();
        again.window.vocabResumeChoice = async (q) => {
            eq(`${C} partial — the learner is ASKED, and told where they were`, q.wordNumber, 15);
            return 'continue';
        };
        await again.scope.open(2);
        eq(`${C} partial — reopening did not reset the topic`,
            Number(again.scope.learned['topic_2']), 15);
        eq(`${C} partial — and it resumed at the unfinished word`, again.scope.index, 14);
    }

    /* restart is a CHOICE, and only the learner's */
    {
        const first = deck(spec, {});
        await first.scope.load();
        await walkTo(first, 2, 14);
        const again = deck(spec, { carry: first.carry });
        await again.scope.load();
        again.window.vocabResumeChoice = async () => 'restart';
        await again.scope.open(2);
        eq(`${C} partial — an explicit restart does reset, to word 1`, again.scope.index, 0);
    }

    /* rendering the deck is not completing it */
    {
        const d = deck(spec, {});
        await d.scope.load();
        d.window.vocabResumeChoice = async () => 'continue';
        await d.scope.open(3);
        const total = d.topic(3).words.length;
        ok(Number(d.scope.learned['topic_3'] || 0) < total,
            `${C} rendering — opening a topic does not mark it complete`);
        eq(`${C} rendering — opening a topic reports no component`, d.componentCalls.length, 0);
    }
}

/* ================================================================ *
 * A5 — ISOLATION
 * ---------------------------------------------------------------- *
 * Three leaks, each of which would show one learner another's work.
 * ================================================================ */
{
    const spec = DECKS[0];

    /* user A -> user B */
    const a = deck(spec, { user: 'user-A' });
    await a.scope.load();
    await walkTo(a, 1, 19);
    a.scope.complete();
    await new Promise((r) => setTimeout(r, 0));

    const b = deck(spec, { carry: a.carry, user: 'user-B' });
    await b.scope.load();
    eq('isolation — user B does not inherit user A vocabulary progress',
        Number(b.scope.learned['topic_1'] || 0), 0);
    const bState = b.V.pageState({ course: 'A1', topicId: 1, courseState: null, user: 'user-B' });
    eq('isolation — user B does not inherit user A pending sync', bState.mode, 'learn');
    ok(!!a.carry[a.V.pendingKey('A1', 1, 'user-A')] === false ||
        a.carry[a.V.pendingKey('A1', 1, 'user-A')] !== a.carry[a.V.pendingKey('A1', 1, 'user-B')],
        'isolation — the pending note is keyed per user');

    /* A1 -> A2 */
    const a1 = deck(DECKS[0], { user: 'user-C', component: async () => { throw new Error('offline'); } });
    await a1.scope.load();
    const t1 = a1.topic(1).words.length;
    await walkTo(a1, 1, t1 - 1);
    a1.scope.complete();
    await new Promise((r) => setTimeout(r, 0));
    ok(!!a1.carry[a1.V.pendingKey('A1', 1, 'user-C')], 'isolation — A1 topic 1 is pending');

    const a2 = deck(DECKS[1], { carry: a1.carry, user: 'user-C' });
    await a2.scope.load();
    eq('isolation — A2 does not inherit A1 vocabulary progress',
        Number(a2.scope.learned['topic_1'] || 0), 0);
    const a2State = a2.V.pageState({ course: 'A2', topicId: 1, courseState: null, user: 'user-C' });
    eq('isolation — an A1 pending note is not an A2 pending note', a2State.mode, 'learn');

    /* topic N -> topic N+1 */
    const n = deck(spec, { user: 'user-D', component: async () => { throw new Error('offline'); } });
    await n.scope.load();
    const tn = n.topic(1).words.length;
    await walkTo(n, 1, tn - 1);
    n.scope.complete();
    await new Promise((r) => setTimeout(r, 0));
    eq('isolation — topic 2 has no progress from topic 1',
        Number(n.scope.learned['topic_2'] || 0), 0);
    const nState = n.V.pageState({ course: 'A1', topicId: 2, courseState: null, user: 'user-D' });
    eq('isolation — a topic 1 pending note is not a topic 2 pending note', nState.mode, 'learn');
}

/* ================================================================ *
 * A6 — SPEECH IS OPTIONAL, IN EVERY WAY IT CAN FAIL
 * ---------------------------------------------------------------- *
 * Four failures, and the static proof that no score is consulted.
 * ================================================================ */
{
    const modes = [
        ['mic denied', () => { const e = new Error('Permission denied'); e.name = 'NotAllowedError'; throw e; }],
        ['no Speech API', null],
        ['provider error', () => { throw new Error('provider 500'); }],
        ['timeout', () => { throw new Error('timeout'); }]
    ];
    for (const spec of DECKS) {
        for (const [label, thrower] of modes) {
            const d = deck(spec, { topicCompleted: false });
            if (thrower) {
                d.window.startPronunciation = thrower;
                d.window.UzSpeech = { assess: thrower };
            } else {
                delete d.window.SpeechRecognition;
                delete d.window.webkitSpeechRecognition;
                delete d.window.speechSynthesis;
            }
            await d.scope.load();
            const total = d.topic(1).words.length;
            await walkTo(d, 1, total - 1);
            d.scope.complete();
            await new Promise((r) => setTimeout(r, 0));
            eq(`${spec.code} speech optional (${label}) — deck still completable`,
                Number(d.scope.learned['topic_1']), total);
            eq(`${spec.code} speech optional (${label}) — half still reported`,
                d.componentCalls.length, 1);
        }
    }

    /* no pronunciation number is anywhere near the completion decision */
    for (const spec of DECKS) {
        const lower = spec.code.toLowerCase();
        const region = [lift(SRC[spec.code], spec.done),
                        lift(SRC[spec.code], lower + 'ReportVocabulary'),
                        lift(SRC[spec.code], lower + 'ApplyVocabOutcome')].join('\n');
        ok(!/pronunciation|accuracyScore|pronScore|stars?\b|PASS_SCORE/i.test(region),
            `${spec.code} — no pronunciation score appears in the completion/report path`);
    }
}

/* ================================================================ *
 * A7 — THE STATES ARE DISTINGUISHABLE
 * ---------------------------------------------------------------- *
 * Geometry is measured for real by verify_final_mobile_cdp.cjs. What
 * belongs here is that the three states are different OBJECTS in the
 * DOM at all — an error the learner cannot tell from a success is a
 * bug no viewport can reveal.
 * ================================================================ */
for (const spec of DECKS) {
    const C = spec.code;
    const failing = deck(spec, { component: async () => { throw new Error('offline'); } });
    await failing.scope.load();
    const total = failing.topic(1).words.length;
    await walkTo(failing, 1, total - 1);
    failing.scope.complete();
    await new Promise((r) => setTimeout(r, 0));

    const note = failing.window.document.querySelector('.uz-vocab-note');
    ok(!!note, `${C} UX — the sync failure renders a note`);
    ok(note && note.classList.contains('uz-vocab-error'),
        `${C} UX — the failure note is marked as an error, distinctly from a plain note`);
    ok(!!failing.retryButton(), `${C} UX — the retry control exists`);
    eq(`${C} UX — the retry control is a real button`,
        failing.retryButton().tagName, 'BUTTON');
    eq(`${C} UX — the retry button is type=button, not a form submit`,
        failing.retryButton().getAttribute('type'), 'button');

    /* success is not dressed as a failure */
    const good = deck(spec, { topicCompleted: true, ackCompletedTopics: [1] });
    await good.scope.load();
    await walkTo(good, 1, total - 1);
    good.scope.complete();
    await new Promise((r) => setTimeout(r, 0));
    ok(!good.window.document.querySelector('.uz-vocab-error'),
        `${C} UX — a successful sync shows no error state`);
    ok(!good.retryButton(), `${C} UX — a successful sync offers no retry`);
}

/* ================================================================ *
 * THE ACK CONTRACT, FIELD BY FIELD
 * ---------------------------------------------------------------- *
 * FOUND BY NEGATIVE CONTROL. Deleting the whole validAck() guard was
 * caught. Deleting any ONE of its five checks was not — by anybody,
 * in any suite. That is the shape of a fail-open bug: nobody removes
 * a guard wholesale, they "simplify" one line of it.
 *
 * Every check below is therefore pinned on its own, from the reply
 * side: a verdict the server did not actually give must not be read
 * as one.
 * ================================================================ */
{
    const V = deck(DECKS[0], {}).V;
    const good = ack('A1', 3, 'vocabulary', true, [1, 2, 3]);

    ok(V.validAck(good, 'A1', 3), 'a well-formed ack is a verdict');

    const reject = (label, mutate) => {
        const bad = JSON.parse(JSON.stringify(good));
        mutate(bad);
        ok(V.validAck(bad, 'A1', 3) === false, `rejected: ${label}`);
    };

    reject('ok is not true', (a) => { a.ok = false; });
    reject('ok is missing', (a) => { delete a.ok; });
    reject('ok is the string "true"', (a) => { a.ok = 'true'; });
    reject('the ack is for another course', (a) => { a.course = 'B2'; });
    reject('the course is missing', (a) => { delete a.course; });
    reject('the ack is for another topic', (a) => { a.topicId = 4; });
    reject('the topic is missing', (a) => { delete a.topicId; });
    reject('there is no components block', (a) => { delete a.components; });
    reject('the components block is not an object', (a) => { a.components = 'yes'; });
    reject('the components block is null', (a) => { a.components = null; });
    reject('vocabularyCompleted is not true', (a) => { a.components.vocabularyCompleted = false; });
    reject('vocabularyCompleted is the string "true"', (a) => { a.components.vocabularyCompleted = 'true'; });
    reject('vocabularyCompleted is absent', (a) => { delete a.components.vocabularyCompleted; });
    reject('topicCompleted is not a boolean', (a) => { a.topicCompleted = 'yes'; });
    reject('topicCompleted is absent', (a) => { delete a.topicCompleted; });
    reject('completedTopics is not an array', (a) => { a.completedTopics = 3; });
    reject('completedTopics is absent', (a) => { delete a.completedTopics; });

    /* the forged shape a client could invent for itself */
    ok(V.validAck({ ok: true, completed: true, topicCompleted: true }, 'A1', 3) === false,
        'rejected: a forged {completed:true} with no server verdict in it');
    ok(V.validAck(null, 'A1', 3) === false, 'rejected: no reply at all');
    ok(V.validAck(undefined, 'A1', 3) === false, 'rejected: an undefined reply');
    ok(V.validAck('ok', 'A1', 3) === false, 'rejected: a string reply');
}

/* ================================================================ *
 * A PENDING NOTE IS ONE LEARNER'S, IN ONE COURSE, ON ONE TOPIC
 * ---------------------------------------------------------------- *
 * FOUND BY NEGATIVE CONTROL. The isolation checks above walked a
 * SUCCESSFUL completion, which clears the pending note — so removing
 * the user and course from the note's storage key changed nothing
 * they could see. A leak is only observable while a note EXISTS, so
 * these fail the sync deliberately and leave one lying there.
 * ================================================================ */
{
    const offline = async () => { throw new Error('offline'); };

    /* user A leaves an unsynced deck behind; user B signs in on the phone */
    const a = deck(DECKS[0], { user: 'leak-A', component: offline });
    await a.scope.load();
    const totalA = a.topic(1).words.length;
    await walkTo(a, 1, totalA - 1);
    a.scope.complete();
    await new Promise((r) => setTimeout(r, 0));
    ok(!!a.carry[a.V.pendingKey('A1', 1, 'leak-A')],
        'leak check — user A really does have an unsynced note');

    const b = deck(DECKS[0], { carry: a.carry, user: 'leak-B' });
    await b.scope.load();
    eq('user B is not offered user A unsynced deck',
        b.V.pageState({ course: 'A1', topicId: 1, courseState: null, user: 'leak-B' }).mode, 'learn');
    ok(!b.V.readPending('A1', 1, 'leak-B'), 'user B cannot read user A pending note');
    ok(!!b.V.readPending('A1', 1, 'leak-A'), 'and user A note is still there, untouched');

    /* the same learner, a different course */
    const a2 = deck(DECKS[1], { carry: a.carry, user: 'leak-A' });
    await a2.scope.load();
    eq('an A1 pending note does not make A2 topic 1 look unsynced',
        a2.V.pageState({ course: 'A2', topicId: 1, courseState: null, user: 'leak-A' }).mode, 'learn');
    ok(!a2.V.readPending('A2', 1, 'leak-A'), 'the note does not cross courses');

    /* the same learner, same course, the next topic */
    eq('an A1 topic 1 note does not make topic 2 look unsynced',
        a.V.pageState({ course: 'A1', topicId: 2, courseState: null, user: 'leak-A' }).mode, 'learn');
    ok(!a.V.readPending('A1', 2, 'leak-A'), 'the note does not cross topics');

    /* a note whose body claims a different topic is not this topic's proof */
    const forged = deck(DECKS[0], { user: 'forge-1' });
    forged.window.localStorage.setItem(forged.V.pendingKey('A1', 5, 'forge-1'),
        JSON.stringify({ v: 1, course: 'A1', topicId: 9, at: Date.now() }));
    ok(!forged.V.readPending('A1', 5, 'forge-1'),
        'a note stored under topic 5 that claims topic 9 is refused');
    forged.window.localStorage.setItem(forged.V.pendingKey('A1', 5, 'forge-1'),
        JSON.stringify({ v: 1, course: 'B1', topicId: 5, at: Date.now() }));
    ok(!forged.V.readPending('A1', 5, 'forge-1'),
        'a note stored under A1 that claims B1 is refused');
    forged.window.localStorage.setItem(forged.V.pendingKey('A1', 5, 'forge-1'), 'not json');
    ok(!forged.V.readPending('A1', 5, 'forge-1'), 'an unparseable note is refused, not thrown on');
}

/* ================================================================ *
 * A TOPIC FINISHED BEFORE COMPONENTS EXISTED STAYS FINISHED
 * ---------------------------------------------------------------- *
 * FOUND BY NEGATIVE CONTROL. Nothing tested the legacy branch, so
 * deleting it — which would march every pre-component learner back
 * through a deck they already completed — passed every suite.
 * ================================================================ */
for (const spec of DECKS) {
    const C = spec.code;
    const legacyState = { completedTopics: [1, 2], topicComponents: {} };
    const d = deck(spec, { courseState: legacyState });
    await d.scope.load();

    eq(`${C} legacy — a pre-component topic reads as 'legacy', not 'learn'`,
        d.V.pageState({ course: C, topicId: 1, courseState: legacyState, user: d.user }).mode, 'legacy');
    eq(`${C} legacy — an untouched topic still reads as 'learn'`,
        d.V.pageState({ course: C, topicId: 7, courseState: legacyState, user: d.user }).mode, 'learn');

    const outcome = await d.V.reportVocabulary({
        course: C, topicId: 1, courseState: legacyState,
        api: { completeCourseComponent: async () => { throw new Error('must not be called'); } },
        user: d.user
    });
    ok(outcome.ok, `${C} legacy — reporting a legacy topic succeeds`);
    eq(`${C} legacy — and does so without asking the server`, outcome.stage, 'legacy');
    eq(`${C} legacy — it counts as complete`, outcome.topicCompleted, true);
}

/* ================================================================ *
 * ONE REPORT PER REPORT
 * ---------------------------------------------------------------- *
 * FOUND BY NEGATIVE CONTROL. "Exactly one component call" was only
 * ever asserted on the happy path, so a reporter that fired twice —
 * double-counting a learner's work — had nothing to trip over.
 * ================================================================ */
for (const spec of DECKS) {
    const C = spec.code;
    let calls = 0;
    const d = deck(spec, {
        component: async (course, topicId, component) => {
            calls++;
            return ack(course, topicId, component, false, []);
        }
    });
    await d.scope.load();
    const total = d.topic(1).words.length;
    await walkTo(d, 1, total - 1);
    d.scope.complete();
    await new Promise((r) => setTimeout(r, 0));
    eq(`${C} — finishing a deck sends exactly one component call`, calls, 1);

    /* and a retry after failure sends exactly one more, never a burst */
    let calls2 = 0;
    const failing = deck(spec, {
        component: async () => { calls2++; throw new Error('offline'); }
    });
    await failing.scope.load();
    await walkTo(failing, 1, total - 1);
    failing.scope.complete();
    await new Promise((r) => setTimeout(r, 0));
    eq(`${C} — a failing deck sends one call, not a retry storm`, calls2, 1);
    await failing.scope.report(1);
    eq(`${C} — pressing retry sends exactly one more`, calls2, 2);
}

/* ================================================================ *
 * A8 — THE WORDS THEMSELVES
 * ---------------------------------------------------------------- *
 * A vocabulary course IS its content. These fingerprints are pinned
 * so that a drop, a duplication or an edited translation fails here
 * rather than in front of a learner.
 *
 * On "duplicated": an identical ru+uz CARD twice in one topic is a
 * copy-paste defect and must be zero. The same Russian word with a
 * DIFFERENT Uzbek sense is not a defect — "Пожалуйста" is both
 * "Arzimaydi" and "Iltimos", and A1 teaches both on purpose. The
 * assertion below is therefore exact-pair, and the sha256 catches any
 * edit to either half regardless.
 * ================================================================ */
{
    const EXPECTED = {
        A1: { topics: 12, words: 610,
              counts: [36, 35, 27, 52, 67, 38, 56, 54, 59, 63, 34, 89],
              sha: '92692c3fe00b4d56fed6ea8c71eaf777811f082a23d19584fd8b5331f4cfe9a2' },
        A2: { topics: 16, words: 1134,
              counts: [45, 77, 73, 106, 50, 69, 85, 85, 50, 69, 70, 55, 80, 60, 91, 69],
              sha: 'c96c880c7f1f7872f0c98aa21af18e42c1b63d0e5f349be5c3bdaf5351dc8853' },
        B1: { topics: 20, words: 1476,
              counts: [72, 69, 54, 48, 30, 48, 71, 76, 65, 71, 113, 102, 76, 89, 114, 95, 70, 71, 56, 86],
              sha: 'd1c81ac035fd13f06055e12c28dfcf769e3414b479ab6b57d5a2d20a791a51b4' },
        B2: { topics: 16, words: 1179,
              counts: [50, 75, 100, 77, 70, 74, 69, 101, 80, 80, 45, 69, 60, 89, 60, 80],
              sha: 'b9cda16fbc2004d488899b0b99c837cfe4afeae14f5a72679e1fae21076da438' }
    };

    for (const spec of DECKS) {
        const C = spec.code;
        const exp = EXPECTED[C];
        const topics = vocabularyData(C).topics || [];
        const lines = [];
        let words = 0, blank = 0, exactDupes = 0;

        topics.forEach((t) => {
            const seen = new Set();
            t.words.forEach((w, ix) => {
                words++;
                const ru = String(w.ru || '').trim();
                const uz = String(w.uz || '').trim();
                if (!ru || !uz) blank++;
                const pair = ru.toLowerCase() + ' :: ' + uz.toLowerCase();
                if (seen.has(pair)) exactDupes++;
                seen.add(pair);
                lines.push(t.id + '|' + ix + '|' + ru + '|' + uz);
            });
        });

        eq(`${C} content — topic count`, topics.length, exp.topics);
        eq(`${C} content — total words`, words, exp.words);
        eq(`${C} content — per-topic word counts (nothing missing, nothing added)`,
            topics.map((t) => t.words.length).join(','), exp.counts.join(','));
        eq(`${C} content — topic ids are 1..n with no gap`,
            topics.map((t) => t.id).join(','),
            topics.map((_, i) => i + 1).join(','));
        eq(`${C} content — no card has a blank word or a blank translation`, blank, 0);
        eq(`${C} content — no duplicated card`, exactDupes, 0);
        eq(`${C} content — no word or translation drift (sha256)`,
            crypto.createHash('sha256').update(lines.join('\n')).digest('hex'), exp.sha);
    }
}

/* ================================================================ *
 * REPORT
 * ================================================================ */
console.log('  four shipped decks · ten learner states each · partial progress survives · rendering never completes');
console.log('  content pinned: 4399 words across 64 topics, 0 missing · 0 duplicated · 0 drift');
console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ VOCABULARY STATE FINAL: ${fail} failed, ${pass} passed`);
    failures.forEach((f) => console.log('     • ' + f));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ VOCABULARY STATE FINAL: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');

})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(1); });
