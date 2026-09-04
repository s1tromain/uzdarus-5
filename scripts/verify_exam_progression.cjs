#!/usr/bin/env node
/**
 * verify_exam_progression.cjs — the final exams open, grade and unlock.
 *
 * REPORTED: a learner who had finished all twelve A1 topics opened the A1
 * final exam and read "Kurs holatini tekshirib bo'lmadi. Internet aloqasini
 * tekshirib, qayta urinib ko'ring." Their connection was fine. No request was
 * ever made.
 *
 * paid-platform.js is a deferred ES MODULE; the exam page's own logic is a
 * classic inline script and runs first. A1 read
 * window.getAuthoritativeCourseProgress before the module had installed it,
 * found undefined, and rendered its single failure shape as a network error.
 * A2, B1 and B2 awaited a helper first, so only A1 broke — for every A1
 * learner, on every load. A race with a fixed outcome, not a flake.
 *
 * Underneath sat the real defect: ONE failure shape for every way the check
 * can fail. Not signed in, not paid for, three topics left, server down and
 * script missing all became the same sentence about the internet.
 *
 * This suite drives the REAL exam pages through UzExamGate for every one of
 * those situations, then drives the REAL final-exam handler against an
 * isolated Firestore for grading, unlocking and the negatives.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { launch, serveRepo, findChrome } = require('./_cdp_driver.cjs');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const FAST = process.env.UI_SUITE_FAST === '1';
const COURSES = FAST ? ['A1'] : ['A1', 'A2', 'B1', 'B2'];
const PAGES = { A1: 'a1-final-exam.html', A2: 'a2-final-exam.html',
                B1: 'b1-final-exam.html', B2: 'b2-final-exam.html' };

console.log('\n=== EXAM PROGRESSION — the gate, the grade and the unlock ===' +
            (FAST ? '  [FAST subset]' : ''));

/* ================================================================ *
 * 1. THE SHARED GATE, against the SERVER's own canon.
 * ================================================================ */
(async () => {
const CANON = (await import(pathToFileURL(path.join(ROOT, 'api/_lib/course-canon.js')).href));
const EXAM = await import(pathToFileURL(path.join(ROOT, 'api/_lib/exam-scoring.js')).href);

{
    const g = {};
    // eslint-disable-next-line no-new-func
    new Function('window', read('exam-gate.js'))(g);
    const G = g.UzExamGate;
    ok(!!G, 'exam-gate.js exposes UzExamGate');

    /* The page cannot import the server canon — it is a classic script — so
       the totals are pinned in the module. Pin them to the canon HERE, where
       both can be read, so the two can never drift apart in silence. */
    Object.keys(CANON.COURSE_CANON).forEach((code) => {
        eq(`gate knows ${code} has ${CANON.COURSE_CANON[code].totalTopics} topics`,
            G.TOPIC_TOTALS[code], CANON.COURSE_CANON[code].totalTopics);
    });
    eq('and knows of no course the server does not',
        Object.keys(G.TOPIC_TOTALS).sort().join(','),
        Object.keys(CANON.COURSE_CANON).sort().join(','));

    /* Firestore has held completedTopics as numbers AND as strings. Reading
       only `typeof n === 'number'` dropped every string id and turned a
       finished course into an empty one. */
    eq('numeric ids are read', G.normaliseIds([1, 2, 3], 12).join(','), '1,2,3');
    eq('STRING ids are read too', G.normaliseIds(['1', '2', '3'], 12).join(','), '1,2,3');
    eq('mixed ids are read', G.normaliseIds([1, '2', 3], 12).join(','), '1,2,3');
    eq('duplicates count once', G.normaliseIds([1, '1', 1], 12).join(','), '1');
    eq('out-of-range ids are refused', G.normaliseIds([0, -1, 13, 99], 12).join(','), '');
    eq('rubbish is refused', G.normaliseIds([null, 'x', {}, []], 12).join(','), '');
    eq('missing topics are named', G.missingFrom([1, 2, 3], 5).join(','), '4,5');
    eq('a finished course is missing nothing', G.missingFrom([1, 2, 3], 3).join(','), '');

    /* Each failure gets its own state. This is the whole point. */
    eq('permission-denied is FORBIDDEN', G.classify(new Error('permission-denied')), 'FORBIDDEN');
    eq('unauthenticated is UNAUTHORIZED', G.classify(new Error('unauthenticated')), 'UNAUTHORIZED');
    eq('a timeout is NETWORK_ERROR',
        G.classify(new Error('authoritative progress: read timed out')), 'NETWORK_ERROR');
    eq('a failed fetch is NETWORK_ERROR', G.classify(new Error('Failed to fetch')), 'NETWORK_ERROR');
    eq('anything else is SERVER_ERROR', G.classify(new Error('boom')), 'SERVER_ERROR');

    /* And no screen may call a non-network problem a network problem. */
    const say = (state, extra) => G.render(Object.assign({ state, total: 12, done: [], missing: [] }, extra || {}));
    ok(/Internet aloqasini/.test(say('NETWORK_ERROR')), 'NETWORK_ERROR mentions the connection');
    ok(!/Internet aloqasini/.test(say('UNAUTHORIZED')), 'UNAUTHORIZED does NOT');
    ok(!/Internet aloqasini/.test(say('FORBIDDEN')), 'FORBIDDEN does NOT');
    ok(!/Internet aloqasini/.test(say('LOCKED', { missing: [12] })), 'LOCKED does NOT');
    ok(!/Internet aloqasini/.test(say('SERVER_ERROR')), 'SERVER_ERROR does NOT');
    ok(/tugallanmagan degani emas/.test(say('SERVER_ERROR')),
        'SERVER_ERROR refuses to claim the course is unfinished');
    ok(/Qolgan mavzular: 12/.test(say('LOCKED', { missing: [12] })),
        'LOCKED names the topics that are left');
    ['NETWORK_ERROR', 'SERVER_ERROR', 'UNAUTHORIZED'].forEach((s) => {
        ok(/data-examgate="retry"/.test(say(s)), `${s} offers a retry`);
    });
}

/* ================================================================ *
 * 2. THE REAL EXAM PAGES.
 * ================================================================ */
if (!findChrome()) {
    console.log('  ❌ EXAM PROGRESSION: BLOCKER — no Chrome/Chromium binary found.\n');
    process.exit(1);
}

/* A platform module that behaves like the real one: a DEFERRED MODULE, so it
   lands after the page's inline script. That timing is the bug. */
function platform(cfg) {
    return `
const CFG = ${JSON.stringify(cfg)};
window.__calls = [];
function install() {
  window.getUserProgress = async (u, c) => { window.__calls.push('progress:' + c);
    return { completedTopics: (CFG.completed || []).slice(), topicComponents: CFG.components || {} }; };
  window.getUserQuizResults = async () => JSON.parse(JSON.stringify(CFG.results || {}));
  window.completeCourseComponent = async (c, id, comp) => {
    window.__calls.push('component:' + c + ':' + id + ':' + comp);
    if (comp === 'exercises' && CFG.completed.indexOf(Number(id)) < 0) CFG.completed.push(Number(id));
    return { ok: true, course: c, topicId: Number(id), component: comp,
             components: { exercisesCompleted: true, vocabularyCompleted: false },
             topicCompleted: true, completedTopics: CFG.completed.slice(),
             nextTopic: Number(id) + 1 }; };
  window.getAuthoritativeCourseProgress = async (u, c) => {
    window.__calls.push('authoritative:' + c);
    if (CFG.failTimes && window.__calls.filter(x => x.indexOf('authoritative') === 0).length <= CFG.failTimes) {
      throw new Error(CFG.failWith || 'authoritative progress: read timed out');
    }
    return { completedTopics: (CFG.completed || []).slice(), userExists: true }; };
  window.saveQuizResult = async () => true;
  window.saveUserProgress = async () => true;
  window.firebaseReady = true;
}
${cfg.noPlatform ? '/* the module never installs anything */' : 'install();'}
`;
}

const SCREEN = `
 var b = document.getElementById('examExercises');
 var g = b ? b.querySelector('[data-examgate-screen]') : null;
 var t = b ? b.textContent.replace(/\\s+/g,' ').trim() : '';
 return JSON.stringify({
   gate: g ? g.getAttribute('data-examgate-screen') : null,
   exam: !g && /\\d\\./.test(t) && t.length > 120,
   text: t.slice(0, 130),
   acts: g ? Array.prototype.map.call(g.querySelectorAll('[data-examgate]'),
        function(x){return x.getAttribute('data-examgate');}) : [],
   calls: window.__calls || [] });`;

const site = await serveRepo();
const browser = await launch();
console.log(`  driver: ${browser.version} · real exam pages, deferred-module timing`);

try {
    const p = await browser.newPage();
    let cfg = {};
    await p.route((u) => (/paid-platform\.js/.test(u) ? platform(cfg) : null));
    await p.onNewDocument(
        `try{localStorage.setItem('currentUser',JSON.stringify({id:'ex1',email:'e@t.uz',role:'student'}));}catch(e){}`);

    async function open(course, conf, device) {
        cfg = Object.assign({ completed: [], components: {}, results: {} }, conf || {});
        const [w, h] = device || [360, 800];
        await p.setDevice(w, h, w < 900);
        await p.goto(`http://127.0.0.1:${site.port}/paid-courses/${PAGES[course]}`, { waitMs: 9000 });
        return JSON.parse(await p.evaluate(SCREEN));
    }
    const all = (n) => Array.from({ length: n }, (_, i) => i + 1);

    for (const course of COURSES) {
        const N = (await import(pathToFileURL(path.join(ROOT, 'api/_lib/course-canon.js')).href))
            .COURSE_CANON[course].totalTopics;
        const C = `${course} exam`;

        /* 1. nothing done */
        let s = await open(course, { completed: [] });
        eq(`${C}: a new learner is LOCKED`, s.gate, 'LOCKED');
        ok(/Qolgan mavzular/.test(s.text), `${C}: and told which topics are left`);

        /* 2. one topic short — the exact one is named */
        s = await open(course, { completed: all(N - 1) });
        eq(`${C}: one topic short is LOCKED`, s.gate, 'LOCKED');
        ok(new RegExp('Qolgan mavzular: ' + N + '\\.').test(s.text),
            `${C}: naming topic ${N} (${s.text.slice(0, 90)})`);

        /* 3. THE REPORTED CASE: every topic, no vocabulary anywhere */
        s = await open(course, { completed: all(N), components: {} });
        eq(`${C}: all topics and NO vocabulary opens the exam`, s.gate, null);
        ok(s.exam, `${C}: the exam is actually rendered`);
        ok(s.calls.filter((x) => x.indexOf('authoritative') === 0).length >= 1,
            `${C}: and it really asked the server (${JSON.stringify(s.calls)})`);

        if (!FAST) {
            /* 4/5. partial and full vocabulary change nothing */
            const partial = {}; partial[1] = { vocabularyCompleted: true };
            s = await open(course, { completed: all(N), components: partial });
            eq(`${C}: a partly-done deck changes nothing`, s.gate, null);
            const full = {}; all(N).forEach((i) => { full[i] = { vocabularyCompleted: true }; });
            s = await open(course, { completed: all(N), components: full });
            eq(`${C}: a fully-done deck changes nothing either`, s.gate, null);
        }

        /* 6. LEGACY: the attempts are stored at 80%+, completedTopics is empty */
        const results = {};
        all(N).forEach((i) => {
            results['topic_' + i] = {
                [`${course.toLowerCase()}ExerciseResult`]: {
                    completed: true, topicId: i, score: 10, total: 10, percentage: 100
                }
            };
        });
        s = await open(course, { completed: [], results: results });
        eq(`${C}: a learner whose earned topics were never recorded is repaired`, s.gate, null);
        eq(`${C}: by reporting every one through the authoritative call`,
            s.calls.filter((x) => x.indexOf('component:') === 0).length, N);

        /* and an attempt BELOW the bar is never repaired */
        const weak = {};
        all(N).forEach((i) => {
            weak['topic_' + i] = {
                [`${course.toLowerCase()}ExerciseResult`]: {
                    completed: true, topicId: i, score: 7, total: 10, percentage: 70
                }
            };
        });
        s = await open(course, { completed: [], results: weak });
        eq(`${C}: a 70% attempt is NEVER turned into a completion`, s.gate, 'LOCKED');
        eq(`${C}: and nothing was reported`,
            s.calls.filter((x) => x.indexOf('component:') === 0).length, 0);

        /* 7/8. string ids and numeric ids both count */
        s = await open(course, { completed: all(N).map(String) });
        eq(`${C}: STRING topic ids open the exam`, s.gate, null);
        s = await open(course, { completed: all(N) });
        eq(`${C}: numeric topic ids open the exam`, s.gate, null);

        /* 11. an expired session is not a network problem */
        s = await open(course, { completed: all(N), failTimes: 99, failWith: 'unauthenticated' });
        eq(`${C}: an expired session reads as UNAUTHORIZED`, s.gate, 'UNAUTHORIZED');
        ok(!/Internet aloqasini/.test(s.text), `${C}: and never blames the internet`);

        /* no paid access */
        s = await open(course, { completed: all(N), failTimes: 99, failWith: 'permission-denied' });
        eq(`${C}: no access reads as FORBIDDEN`, s.gate, 'FORBIDDEN');
        ok(!/Internet aloqasini/.test(s.text), `${C}: and never blames the internet either`);

        /* the platform module never loading is a SERVER error, not the internet */
        s = await open(course, { completed: all(N), noPlatform: true });
        eq(`${C}: a missing platform module reads as SERVER_ERROR`, s.gate, 'SERVER_ERROR');
        ok(/tugallanmagan degani emas/.test(s.text),
            `${C}: and does not claim the course is unfinished`);

        /* 10. a transient failure, and a retry that really retries */
        s = await open(course, { completed: all(N), failTimes: 1 });
        eq(`${C}: a dropped read reads as NETWORK_ERROR`, s.gate, 'NETWORK_ERROR');
        ok(s.acts.indexOf('retry') >= 0, `${C}: with a retry button`);
        const before = s.calls.filter((x) => x.indexOf('authoritative') === 0).length;
        await p.evaluate(`var b=document.querySelector('[data-examgate="retry"]'); if(b)b.click(); return 1;`);
        await sleep(2600);
        const after = JSON.parse(await p.evaluate(SCREEN));
        ok(after.calls.filter((x) => x.indexOf('authoritative') === 0).length > before,
            `${C}: the retry really re-requests`);
        eq(`${C}: and the exam opens on the retry`, after.gate, null);

        /* 9. reopening keeps the access */
        s = await open(course, { completed: all(N) });
        eq(`${C}: reopening keeps the exam open`, s.gate, null);

        if (!FAST && course === 'A1') {
            for (const [w, h, name] of [[390, 844, 'iPhone'], [1440, 900, 'desktop']]) {
                s = await open(course, { completed: all(N - 1) }, [w, h]);
                eq(`${C} @${name}: still LOCKED with its reason`, s.gate, 'LOCKED');
                const layout = await p.evaluate(
                    `return document.documentElement.scrollWidth > window.innerWidth + 2;`);
                eq(`${C} @${name}: no sideways scroll`, layout, false);
            }
        }
    }
} finally {
    try { await browser.close(); } catch (e) {}
    try { await site.close(); } catch (e) {}
    try { execSync('pkill -f "Google Chrome for Testing" 2>/dev/null || true'); } catch (e) {}
}

/* ================================================================ *
 * 3. THE REAL HANDLER: grading, the unlock, and the negatives.
 * ================================================================ */
{
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'uz-exam-'));
    const url = (rel) => JSON.stringify(pathToFileURL(path.join(ROOT, rel)).href);
    const shim = (name, src, map) => {
        let out = src;
        Object.entries(map).forEach(([from, to]) => {
            if (!out.includes(`'${from}'`)) throw new Error(`${name}: no import of ${from}`);
            out = out.split(`'${from}'`).join(to);
        });
        fs.writeFileSync(path.join(TMP, name), out);
    };
    fs.writeFileSync(path.join(TMP, 'admin-stub.js'),
        'export function initAdmin() { return globalThis.__ADMIN; }');
    shim('request.mjs', read('api/_lib/request.js'), {
        '../_firebaseAdmin.js': "'./admin-stub.js'",
        './roles.js': url('api/_lib/roles.js')
    });
    shim('final-exam.mjs', read('api/_progress/final-exam.js'), {
        '../_firebaseAdmin.js': "'./admin-stub.js'",
        '../_lib/request.js': "'./request.mjs'",
        '../_lib/roles.js': url('api/_lib/roles.js'),
        '../../account-freeze.js': url('account-freeze.js'),
        '../_lib/course-canon.js': url('api/_lib/course-canon.js'),
        '../_lib/exam-scoring.js': url('api/_lib/exam-scoring.js')
    });
    const EXAMH = await import(pathToFileURL(path.join(TMP, 'final-exam.mjs')).href);

    const FieldValue = { serverTimestamp: () => '<ts>' };
    const makeDb = (users) => {
        const store = { users: JSON.parse(JSON.stringify(users)) };
        const dotted = (t, u) => Object.entries(u).forEach(([k, v]) => {
            const parts = k.split('.'); let node = t;
            parts.slice(0, -1).forEach((x) => { node[x] = node[x] || {}; node = node[x]; });
            node[parts[parts.length - 1]] = v;
        });
        const ref = (id) => ({ __kind: 'user', id,
            get: async () => ({ exists: !!store.users[id], data: () => store.users[id] }) });
        return { store, adminDb: {
            collection: () => ({ doc: ref }), doc: () => ({}),
            runTransaction: async (fn) => fn({
                get: async (r) => ({ exists: !!store.users[r.id], data: () => store.users[r.id] }),
                update: (r, u) => dotted(store.users[r.id] = store.users[r.id] || {}, u),
                set: () => {} })
        }, adminAuth: { verifyIdToken: async (t) => {
            if (!store.users[t]) throw Object.assign(new Error('bad'), { code: 'auth/invalid' });
            return { uid: t, role: store.users[t].role }; } } };
    };
    const now = new Date();
    const learner = (courses) => ({
        displayName: 'Test', role: 'user', accessPacks: ['A1A2', 'B1B2'],
        subscription: { active: true, endAt: new Date(now.getTime() + 30 * 86400000) },
        courses: courses
    });
    async function submit(users, token, body) {
        const { adminDb, adminAuth, store } = makeDb(users);
        globalThis.__ADMIN = { adminDb, adminAuth, FieldValue };
        let status = null, payload = null;
        const res = { status(s) { status = s; return this; }, json(x) { payload = x; return this; },
                      setHeader() {}, end() {} };
        await EXAMH.default({ method: 'POST', query: {}, body,
            headers: { authorization: 'Bearer ' + token },
            socket: { remoteAddress: '127.0.0.1' } }, res);
        return { status, payload, store };
    }

    /* A submission built FROM the canonical key, so "exactly the pass mark"
       is a real submission and not a number written into a fixture. */
    function answersFor(course, correctCount) {
        const canon = CANON.EXAM_CANON[course];
        let left = correctCount;
        return canon.groups.map((g) => g.items.map((it) => {
            if (left <= 0) return '';
            left--;
            const a = Array.isArray(it.answer) ? it.answer[0] : it.answer;
            return String(a == null ? '' : a);
        }));
    }

    for (const course of (FAST ? ['A1'] : ['A1', 'B1'])) {
        const canon = CANON.COURSE_CANON[course];
        const total = EXAM.examTotal(course);
        const mark = CANON.EXAM_CANON[course].passMark;
        const done = Array.from({ length: canon.totalTopics }, (_, i) => i + 1);
        const base = () => ({ u1: learner({ [course]: { completedTopics: done.slice() } }) });
        const state = (s) => s.users.u1.courses[course] || {};
        const C = `${course} submit`;

        /* just under the mark */
        const under = Math.ceil(total * mark / 100) - 1;
        let r = await submit(base(), 'u1', { course, answers: answersFor(course, under) });
        eq(`${C}: an under-mark paper is accepted`, r.status, 200);
        eq(`${C}: and graded below the mark (${r.payload.score} < ${mark})`, r.payload.passed, false);
        eq(`${C}: the course does NOT complete`, state(r.store).courseCompleted, undefined);
        eq(`${C}: and no certificate is unlocked`, state(r.store).certificateUnlocked, undefined);

        /* exactly the mark */
        const exact = Math.ceil(total * mark / 100);
        r = await submit(base(), 'u1', { course, answers: answersFor(course, exact) });
        eq(`${C}: exactly the mark passes (${r.payload.score} >= ${mark})`, r.payload.passed, true);
        eq(`${C}: and the course completes`, state(r.store).courseCompleted, true);
        eq(`${C}: finalExamPassed is written by the SERVER`, state(r.store).finalExamPassed, true);

        /* above the mark */
        r = await submit(base(), 'u1', { course, answers: answersFor(course, total) });
        eq(`${C}: a perfect paper passes`, r.payload.passed, true);
        eq(`${C}: scoring 100`, r.payload.score, 100);

        /* a resubmission never damages a record */
        const passedUser = { u1: learner({ [course]: {
            completedTopics: done.slice(), finalExamPassed: true, finalExamScore: 95 } }) };
        r = await submit(passedUser, 'u1', { course, answers: answersFor(course, 0) });
        eq(`${C}: a blank retake keeps the pass`, state(r.store).finalExamPassed, true);
        eq(`${C}: and the best score`, state(r.store).finalExamScore, 95);

        /* an unfinished course cannot bank a pass, however good the paper */
        const short = { u1: learner({ [course]: { completedTopics: done.slice(0, -1) } }) };
        r = await submit(short, 'u1', { course, answers: answersFor(course, total) });
        eq(`${C}: an unfinished course is refused`, r.status, 409);
        eq(`${C}: with nothing written`, state(r.store).finalExamPassed, undefined);

        /* string ids satisfy the server too */
        const strIds = { u1: learner({ [course]: { completedTopics: done.map(String) } }) };
        r = await submit(strIds, 'u1', { course, answers: answersFor(course, exact) });
        eq(`${C}: string topic ids satisfy the server`, r.status, 200);
        eq(`${C}: and the pass is recorded`, state(r.store).finalExamPassed, true);

        /* the deck is not consulted anywhere in this path */
        ok(!/vocabular/i.test(read('api/_progress/final-exam.js')),
            `${C}: the handler never mentions the vocabulary deck`);
    }

    /* the unlock chain: passing A1 opens A2 and nothing else */
    {
        const FB = read('firebase-client.js');
        ok(/COURSE_PREREQUISITE/.test(FB), 'the prerequisite chain exists');
        const m = FB.match(/COURSE_PREREQUISITE\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/);
        ok(!!m, 'and is readable');
        const chain = {};
        (m ? m[1] : '').split(',').forEach((line) => {
            const kv = line.match(/(\w+)\s*:\s*(null|'(\w+)')/);
            if (kv) chain[kv[1]] = kv[3] || null;
        });
        /* A1 and B1 are entry points: absent from the map means no prerequisite. */
        eq('A1 needs nothing', chain.A1, undefined);
        eq('B1 needs nothing', chain.B1, undefined);
        eq('A2 needs A1', chain.A2, 'A1');
        eq('B2 needs B1', chain.B2, 'B1');
        eq('and nothing else has a prerequisite', Object.keys(chain).sort().join(','), 'A2,B2');
        ok(/finalExamPassed === true/.test(FB),
            'and a course counts as completed only with a server-written exam pass');
    }

    /* a wrong course code is refused outright */
    {
        const r = await submit({ u1: learner({}) }, 'u1', { course: 'C1', answers: [] });
        eq('an unknown course is refused', r.status, 400);
    }
}

console.log('  gate: six states, named topics, working retry · handler: graded, unlocked, idempotent');
console.log('='.repeat(64));
if (fail) {
    console.log(`  ❌ EXAM PROGRESSION: ${fail} failed, ${pass} passed`);
    failures.slice(0, 40).forEach((f) => console.log('     • ' + f));
    console.log('='.repeat(64) + '\n');
    process.exit(1);
}
console.log(`  ✅ EXAM PROGRESSION: ${pass}/${pass} passed`);
console.log('='.repeat(64) + '\n');

})().catch((e) => {
    console.error('EXAM PROGRESSION HARNESS ERROR', e && e.message);
    try { execSync('pkill -f "Google Chrome for Testing" 2>/dev/null || true'); } catch (x) {}
    process.exit(1);
});
