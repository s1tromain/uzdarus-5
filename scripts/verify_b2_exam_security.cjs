#!/usr/bin/env node
/**
 * verify_b2_exam_security.cjs — the B2 final exam and certificate, attacked.
 *
 * The B2 exam suite proves the paper is sound and the certificate suite proves
 * the screens behave. Neither of them attacks the system, and neither of them
 * runs the real server code. This one does both: every claim below is made by
 * DRIVING the shipped implementation — the page gateway lifted out of
 * firebase-client.js, the real /api/progress?action=final-exam handler, the real
 * /api/certificate handler, the real issueCertificate(), and the real exam page
 * in a browser DOM — against a fake Firestore.
 *
 * The threat model is a learner with a browser console:
 *
 *   they can write any localStorage they like        (§3, §4, §7)
 *   they can call the endpoints directly with any body   (§5, §6)
 *   they can be signed in as themselves and no-one else  (§6)
 *   they cannot forge an ID token, and everything the server trusts is
 *   derived from that token or from Firestore.
 *
 * What this suite deliberately does NOT assert is that the exam endpoint
 * re-checks accessPacks. It does not, for ANY course — see §2, where the
 * established platform policy is pinned as a policy rather than hidden.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ids = (n) => Array.from({ length: n }, (_, i) => i + 1);

console.log('\n=== B2 EXAM + CERTIFICATE · SECURITY ===');

/* ==================================================================== *
 * 1. THE PAID-PAGE GATEWAY, DRIVEN
 * --------------------------------------------------------------------
 * enforceAccess() in paid-platform.js asks two functions whether a page
 * may open: getPackByPageName() maps the URL to a pack, canAccessPaid()
 * decides. Both are lifted out of firebase-client.js and CALLED here —
 * asserting that a filename appears in an array would prove nothing
 * about what the gate actually does with it.
 * ==================================================================== */
const CLIENT = read('firebase-client.js');
function liftExport(name) {
    const i = CLIENT.indexOf('export function ' + name + '(');
    if (i < 0) throw new Error('missing export ' + name);
    let d = 0;
    const b = CLIENT.indexOf('{', CLIENT.indexOf(')', i));
    for (let k = b; k < CLIENT.length; k++) {
        if (CLIENT[k] === '{') d++;
        else if (CLIENT[k] === '}') { d--; if (d === 0) return CLIENT.slice(i, k + 1).replace('export ', ''); }
    }
    throw new Error('unbalanced ' + name);
}
const freeze = require(path.join(ROOT, 'account-freeze.js'));
const GATE = new Function('isAccountFrozen', `
    const PRIVILEGED_ROLES = new Set(['developer','admin']);
    function extractRole(u){ return typeof u==='string'?u.trim().toLowerCase():String(u?.role||'').trim().toLowerCase(); }
    function normalizeDate(v){ if(!v) return null; if(typeof v?.toDate==='function') return v.toDate();
        const d=new Date(v); return Number.isNaN(d.getTime())?null:d; }
    const packToCourses = ${CLIENT.slice(CLIENT.indexOf('const packToCourses'),
        CLIENT.indexOf('};', CLIENT.indexOf('const packToCourses')) + 2).replace('const packToCourses =', '')}
    ${liftExport('isPrivilegedRole')}
    ${liftExport('hasActiveSubscription')}
    ${liftExport('hasPackAccess')}
    ${liftExport('canAccessPaid')}
    ${liftExport('getPackByPageName')}
    return { canAccessPaid, getPackByPageName, hasPackAccess };
`)(freeze.isAccountFrozen);

const EXAM_PAGE = 'b2-final-exam.html';
const now = new Date();
const live = (over) => Object.assign({
    role: 'customer', accessPacks: ['B1B2'],
    subscription: { active: true, endAt: new Date(now.getTime() + 30 * 86400000) }
}, over);
/** The gate as enforceAccess() uses it: resolve the pack, then decide. */
function openPage(profile, page) {
    const pack = GATE.getPackByPageName(page);
    if (!pack) return { allowed: true, reason: 'ungated' };   // no pack -> no gate at all
    return Object.assign({ pack }, GATE.canAccessPaid(profile, pack));
}

{
    /* the page is routed to a pack at all — an unrouted page is an OPEN page */
    eq('the B2 exam page routes to the B1B2 pack',
        GATE.getPackByPageName(EXAM_PAGE), 'B1B2');
    eq('and so does the B2 course', GATE.getPackByPageName('b2-course.html'), 'B1B2');
    eq('the full URL form routes identically',
        GATE.getPackByPageName('/paid-courses/b2-final-exam.html?x=1#y'), 'B1B2');

    /* A. entitled customer */
    const a = openPage(live(), EXAM_PAGE);
    eq('A · entitled customer with B1B2 + active subscription: ALLOWED', a.allowed, true);

    /* B. no pack at all */
    const b = openPage(live({ accessPacks: [] }), EXAM_PAGE);
    eq('B · customer with NO pack: DENIED', b.allowed, false);
    eq('  and the reason is the pack', b.reason, 'pack');

    /* C. the wrong pack — this is the one that matters, because A1A2 is a real
       paying customer who simply did not buy B1B2 */
    const c = openPage(live({ accessPacks: ['A1A2'] }), EXAM_PAGE);
    eq('C · customer holding only A1A2: DENIED on the B2 exam', c.allowed, false);
    eq('  and the reason is the pack', c.reason, 'pack');
    eq('  while their own A2 exam still opens',
        openPage(live({ accessPacks: ['A1A2'] }), 'a2-final-exam.html').allowed, true);

    /* D. frozen */
    const frozenProfile = live({
        accountFreeze: freeze.buildFreeze({}, { now, actorUid: 'admin' }).freeze });
    const d = openPage(frozenProfile, EXAM_PAGE);
    eq('D · frozen customer holding B1B2: DENIED', d.allowed, false);
    eq('  and told they are frozen, not that they expired', d.reason, 'frozen');

    /* E. privileged — must match the platform's established policy, whatever
       it is, rather than a number invented here. The policy is read off the
       B2 COURSE page: staff get the same answer on the exam page. */
    const dev = { role: 'developer', accessPacks: [], subscription: { active: false } };
    const eCourse = openPage(dev, 'b2-course.html');
    const eExam = openPage(dev, EXAM_PAGE);
    eq('E · developer gets the same verdict on the exam as on the course',
        eExam.allowed, eCourse.allowed);
    eq('  which on this platform is: allowed', eExam.allowed, true);
    eq('  by the privileged path, not by a pack', eExam.reason, 'privileged');
    const admin = { role: 'admin', accessPacks: [], subscription: { active: false } };
    eq('  and admin behaves the same', openPage(admin, EXAM_PAGE).allowed, true);

    /* the other refusals the same gate owes the exam page */
    eq('a blocked customer is DENIED',
        openPage(live({ blocked: true }), EXAM_PAGE).allowed, false);
    eq('  with reason blocked', openPage(live({ blocked: true }), EXAM_PAGE).reason, 'blocked');
    const expired = live({ subscription: { active: true, endAt: new Date(now.getTime() - 86400000) } });
    eq('an expired subscription is DENIED', openPage(expired, EXAM_PAGE).allowed, false);
    eq('  with reason subscription', openPage(expired, EXAM_PAGE).reason, 'subscription');
    eq('an inactive subscription is DENIED',
        openPage(live({ subscription: { active: false } }), EXAM_PAGE).allowed, false);

    /* PRECEDENCE — a frozen account whose paid days ran out while frozen must
       still be told "frozen"; they still own those days. */
    const frozenExpired = live({
        subscription: { active: true, endAt: new Date(now.getTime() - 86400000) },
        accountFreeze: freeze.buildFreeze({}, { now, actorUid: 'admin' }).freeze });
    eq('frozen outranks expired on the exam page',
        openPage(frozenExpired, EXAM_PAGE).reason, 'frozen');

    /* AND THE GATE IS ACTUALLY REACHED. A page absent from the map returns a
       null pack, which enforceAccess() treats as "not paid content" and lets
       through — so being IN the map is the whole gate. */
    eq('an unmapped page is not gated at all (this is why routing matters)',
        GATE.getPackByPageName('some-unmapped-page.html'), null);
    console.log('  page gateway · A allowed · B/C/D denied · E privileged, matching the course page');
}

/* ==================================================================== *
 * 2. WHAT THE SERVER ENDPOINTS ACTUALLY ENFORCE — THE POLICY, PINNED
 * --------------------------------------------------------------------
 * Established, deliberately, and NOT a B2 decision:
 *
 *   /api/progress?action=final-exam  enforces session + blocked + frozen +
 *   completedTopics >= COURSE_CANON[course].totalTopics. It does NOT
 *   re-check accessPacks or subscription expiry.
 *
 *   /api/certificate?action=issue    enforces session + finalExamPassed +
 *   completedTopics. It does NOT re-check accessPacks or subscription.
 *
 * That is one generic code path shared by A1, A2, B1 and B2 — there is no
 * per-course branch anywhere in either handler. The semantics it produces
 * are coherent: a learner who finished the course keeps the ability to sit
 * the exam and to hold their certificate after their subscription lapses,
 * while the paid PAGES that deliver the content stay behind the pack gate
 * proved in §1. Adding a B2-only entitlement check would make B2 the one
 * course where a lapsed learner loses a certificate they earned.
 *
 * So it is pinned here as policy, in the open, rather than left implicit —
 * and pinned in a way that FAILS if a course-specific exception is ever
 * quietly introduced.
 * ==================================================================== */
{
    const examSrc = read('api/_progress/final-exam.js');
    const certApiSrc = read('api/certificate.js');
    const certLibSrc = read('api/_lib/certificates.js');

    eq('the exam endpoint does not consult accessPacks',
        /accessPacks|hasPackAccess/.test(examSrc), false);
    eq('nor subscription state', /subscription/i.test(examSrc), false);
    eq('the certificate endpoint does not consult accessPacks',
        /accessPacks|hasPackAccess/.test(certApiSrc + certLibSrc), false);
    eq('nor subscription state', /subscription/i.test(certApiSrc + certLibSrc), false);
    /* GENERIC, NOT B2-SHAPED: no course code is written into the executable
       part of either handler. Comments are stripped first — certificate.js
       documents its own body shape as { course: "A1" | "B1" }, which is prose
       about the API, not a branch in it. */
    const code = (src) => src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split('\n').map((l) => l.replace(/(^|[^:'"])\/\/.*$/, '$1')).join('\n');
    const examCode = code(examSrc), certCode = code(certApiSrc), certLibCode = code(certLibSrc);
    ok(!/course:\s*"A1"/.test(examCode), 'comment stripping left executable code intact');
    ['A1', 'A2', 'B1', 'B2'].forEach((c) => {
        eq(`the exam endpoint branches on no course '${c}'`,
            new RegExp(`['\"]${c}['\"]`).test(examCode), false);
        eq(`the certificate endpoint branches on no course '${c}'`,
            new RegExp(`['\"]${c}['\"]`).test(certCode), false);
    });
    /* certificates.js DOES name courses — that is the certifiable registry, a
       declaration, not a branch. It must not gain per-course logic either. */
    ['A1', 'A2', 'B1', 'B2'].forEach((c) => {
        eq(`certificates.js has no per-course branch for '${c}'`,
            new RegExp(`(if|===|!==)[^\\n]*['\"]${c}['\"]`).test(certLibCode), false);
    });
    ok(/COURSE_CANON\[course\]/.test(examSrc),
        'the exam endpoint sizes every course from the canon');
    ok(/COURSE_CANON\[COURSE\]/.test(certLibSrc),
        'and so does certificate issuance');
    console.log('  policy · exam + certificate endpoints are generic; entitlement lives at the page gate');
}

/* ==================================================================== *
 * 3. THE REAL HANDLERS, ON A FAKE FIRESTORE
 * ==================================================================== */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'uz-b2sec-'));
const url = (rel) => JSON.stringify(pathToFileURL(path.join(ROOT, rel)).href);
function writeShim(name, src, map) {
    let out = src;
    Object.entries(map).forEach(([from, to]) => {
        if (!out.includes(`'${from}'`)) throw new Error(`${name}: no import of ${from}`);
        out = out.split(`'${from}'`).join(to);
    });
    fs.writeFileSync(path.join(TMP, name), out);
}
fs.writeFileSync(path.join(TMP, 'admin-stub.js'),
    'export function initAdmin() { return globalThis.__ADMIN; }');
fs.writeFileSync(path.join(TMP, 'pulse-stub.js'),
    'export async function syncPulse() { globalThis.__PULSE = (globalThis.__PULSE || 0) + 1; }');

/* request.js keeps its REAL requireSession — that is the thing under test. */
writeShim('request.mjs', read('api/_lib/request.js'), {
    '../_firebaseAdmin.js': "'./admin-stub.js'",
    './roles.js': url('api/_lib/roles.js')
});
writeShim('certificates.mjs', read('api/_lib/certificates.js'), {
    '../_firebaseAdmin.js': "'./admin-stub.js'",
    './course-canon.js': url('api/_lib/course-canon.js')
});
writeShim('final-exam.mjs', read('api/_progress/final-exam.js'), {
    '../_firebaseAdmin.js': "'./admin-stub.js'",
    '../_lib/request.js': "'./request.mjs'",
    '../_lib/roles.js': url('api/_lib/roles.js'),
    '../../account-freeze.js': url('account-freeze.js'),
    '../_lib/course-canon.js': url('api/_lib/course-canon.js'),
    '../_lib/exam-scoring.js': url('api/_lib/exam-scoring.js')
});
writeShim('complete-topic.mjs', read('api/_progress/complete-topic.js'), {
    '../_firebaseAdmin.js': "'./admin-stub.js'",
    '../_lib/request.js': "'./request.mjs'",
    '../_lib/roles.js': url('api/_lib/roles.js'),
    '../../account-freeze.js': url('account-freeze.js'),
    '../_lib/course-canon.js': url('api/_lib/course-canon.js'),
    '../_lib/topic-components.js': url('api/_lib/topic-components.js')
});
writeShim('certificate.mjs', read('api/certificate.js'), {
    './_lib/request.js': "'./request.mjs'",
    './_lib/rate-limit.js': url('api/_lib/rate-limit.js'),
    './_lib/certificates.js': "'./certificates.mjs'",
    './_firebaseAdmin.js': "'./admin-stub.js'",
    './_lib/analytics-store.js': "'./pulse-stub.js'"
});

/** A Firestore small enough to reason about, shaped like the real one. */
function makeDb(users) {
    const store = { users: JSON.parse(JSON.stringify(users)), certificates: {}, registry: {}, counters: {} };
    const deepMerge = (t, s) => { Object.keys(s).forEach((k) => {
        if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) && t[k] && typeof t[k] === 'object') deepMerge(t[k], s[k]);
        else t[k] = s[k]; }); };
    const applyDotted = (target, update) => Object.entries(update).forEach(([k, v]) => {
        const parts = k.split('.');
        let node = target;
        parts.slice(0, -1).forEach((p) => { node[p] = node[p] || {}; node = node[p]; });
        node[parts[parts.length - 1]] = v;
    });
    const userRef = (uid) => ({
        __kind: 'user', id: uid,
        get: async () => ({ exists: !!store.users[uid], data: () => store.users[uid] }),
        collection: () => ({ doc: (id) => ({ __kind: 'cert', id }) })
    });
    const adminDb = {
        collection: (name) => ({
            doc: (id) => (name === 'users' ? userRef(id)
                : { __kind: name === 'certificateRegistry' ? 'registry' : name, id })
        }),
        doc: () => ({ __kind: 'counter' }),
        runTransaction: async (fn) => fn({
            get: async (ref) => {
                if (ref.__kind === 'user') return { exists: !!store.users[ref.id], data: () => store.users[ref.id] };
                if (ref.__kind === 'cert') return { exists: !!store.certificates[ref.id], data: () => store.certificates[ref.id] };
                if (ref.__kind === 'registry') return { exists: !!store.registry[ref.id], data: () => store.registry[ref.id] };
                return { exists: Object.keys(store.counters).length > 0, data: () => store.counters };
            },
            set: (ref, value, opts) => {
                const bucket = ref.__kind === 'cert' ? store.certificates
                    : ref.__kind === 'registry' ? store.registry : null;
                if (bucket) { bucket[ref.id] = value; return; }
                if (ref.__kind === 'counter') {
                    if (opts && opts.merge) deepMerge(store.counters, value); else store.counters = value;
                    return;
                }
                if (ref.__kind === 'user') { deepMerge(store.users[ref.id] = store.users[ref.id] || {}, value); }
            },
            update: (ref, update) => {
                if (ref.__kind === 'user') applyDotted(store.users[ref.id] = store.users[ref.id] || {}, update);
            }
        })
    };
    const adminAuth = {
        verifyIdToken: async (token) => {
            if (!store.users[token]) throw Object.assign(new Error('bad token'), { code: 'auth/invalid' });
            /* __claimRole models a STALE custom claim: the role baked into the
               ID token when it was minted, which can disagree with the live
               profile after a demotion. Defaults to agreeing. */
            const u = store.users[token];
            return { uid: token, role: u.__claimRole !== undefined ? u.__claimRole : u.role };
        }
    };
    return { adminDb, adminAuth, store };
}
const FieldValue = { serverTimestamp: () => '<ts>', arrayUnion: (...v) => ({ __union: v }) };
const Timestamp = { fromDate: (d) => ({ __ts: d.toISOString(), toDate: () => d }) };

/** Invoke a handler the way Vercel does, and capture the response. */
async function call(handlerMod, { token, body, query = {}, method = 'POST' }) {
    let status = null, payload = null;
    const res = {
        status(s) { status = s; return this; },
        json(p) { payload = p; return this; },
        setHeader() {}, end() {}
    };
    const req = {
        method, query, body,
        headers: token ? { authorization: 'Bearer ' + token } : {},
        socket: { remoteAddress: '127.0.0.1' }
    };
    await handlerMod.default(req, res);
    return { status, payload };
}

/* the real B2 paper, used to build real submissions */
const EXAM_SRC = read('paid-courses/b2-final-exam.html');
const DATA = JSON.parse(EXAM_SRC.match(/var FINAL_EXAM_DATA = (\[[\s\S]*?\]);\r?\n/)[1]);
const firstAns = (it) => (Array.isArray(it.answer) ? it.answer[0] : it.answer);
const PERFECT = DATA.map((g) => g.items.map(firstAns));
const BLANK = DATA.map((g) => g.items.map(() => ''));
const withCorrect = (n) => { let left = n;
    return DATA.map((g) => g.items.map((it) => (left-- > 0 ? firstAns(it) : ''))); };

(async () => {
const examApi = await import(pathToFileURL(path.join(TMP, 'final-exam.mjs')).href);
const certApi = await import(pathToFileURL(path.join(TMP, 'certificate.mjs')).href);
const certLib = await import(pathToFileURL(path.join(TMP, 'certificates.mjs')).href);

const learner = (over = {}) => Object.assign({
    displayName: 'Test Talaba', role: 'user', accessPacks: ['B1B2'],
    subscription: { active: true, endAt: new Date(now.getTime() + 30 * 86400000) },
    courses: {}
}, over);
/** Run the exam endpoint as `token`, against a store built from `users`. */
async function sitExam(users, token, body) {
    const { adminDb, adminAuth, store } = makeDb(users);
    globalThis.__ADMIN = { adminDb, adminAuth, FieldValue, Timestamp };
    const r = await call(examApi, { token, body });
    return { ...r, store };
}
async function issueVia(users, token, body, query = { action: 'issue' }) {
    const { adminDb, adminAuth, store } = makeDb(users);
    globalThis.__ADMIN = { adminDb, adminAuth, FieldValue, Timestamp };
    const r = await call(certApi, { token, body, query });
    return { ...r, store };
}

/* ================================================================ *
 * 4. THE ORIGINAL CASE — 15/16 ON THE SERVER, 16/16 IN localStorage
 * ---------------------------------------------------------------- *
 * Two halves, both driven, neither grepped: the PAGE must not open,
 * and even if it did the ENDPOINT must not bank a pass.
 * ================================================================ */
{
    /* ---- the endpoint half ---- */
    const users = { u1: learner({ courses: { B2: { completedTopics: ids(15) } } }) };
    const r = await sitExam(users, 'u1', { course: 'B2', answers: PERFECT });
    eq('server 15/16 + a PERFECT paper: refused', r.status, 409);
    eq('  and told to finish the course first',
        /barcha mavzularini tugating/.test(r.payload.error || ''), true);
    eq('  no pass was written', r.store.users.u1.courses.B2.finalExamPassed, undefined);
    eq('  no score was written', r.store.users.u1.courses.B2.finalExamScore, undefined);
    eq('  and no certificate unlock', r.store.users.u1.courses.B2.certificateUnlocked, undefined);

    /* the SAME user with the sixteenth topic actually completed goes through,
       which proves the refusal above was the gate and not something else */
    const okUsers = { u1: learner({ courses: { B2: { completedTopics: ids(16) } } }) };
    const r2 = await sitExam(okUsers, 'u1', { course: 'B2', answers: PERFECT });
    eq('server 16/16 + the same paper: accepted', r2.status, 200);
    eq('  and passes', r2.payload.passed, true);

    /* ---- the page half: localStorage says 16, the server says 15 ---- */
    const mem = {};
    const dom = new JSDOM(EXAM_SRC.replace(/<script type="module" src="paid-platform\.js"><\/script>/, '')
        .replace(/<script defer src="pro-toast\.js"><\/script>/, ''), {
        runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.test/paid-courses/b2-final-exam.html',
        beforeParse(w) {
            Object.defineProperty(w, 'localStorage', { value: {
                getItem: (k) => (k in mem ? mem[k] : null),
                setItem: (k, v) => { mem[k] = String(v); },
                removeItem: (k) => { delete mem[k]; } }, configurable: true });
            w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {};
            w.HTMLElement.prototype.scrollIntoView = () => {};
            w.localStorage.setItem('currentUser', JSON.stringify({ id: 'u1', name: 'T', role: 'customer' }));
            /* THE ATTACK: every local signal says the course is finished. */
            w.localStorage.setItem('b2_progress_u1', JSON.stringify(ids(16)));
            w.localStorage.setItem('b2_completion_u1', JSON.stringify({
                finalExamPassed: true, courseCompleted: true, certificateUnlocked: true, finalExamScore: 100 }));
            /* THE TRUTH: the server has fifteen. */
            w.getUserProgress = async () => ({ completedTopics: ids(15) });
            w.getAuthoritativeCourseProgress = async () => ({ completedTopics: ids(15), userExists: true });
            w.getUserQuizResults = async () => ({});
            w.saveQuizResult = async () => true;
            w.__submitted = 0;
            w.submitFinalExam = async () => { w.__submitted++; return { score: 100, passed: true }; };
            w.uzTrack = () => {};
        }
    });
    await new Promise((r3) => setTimeout(r3, 900));
    const d = dom.window.document;
    eq('page · localStorage 16/16 with server 15/16: NO questions rendered',
        d.querySelectorAll('[data-exam-row]').length, 0);
    ok(/tugatgandan/.test(d.getElementById('examExercises').innerHTML),
        'page · the learner is shown the locked screen');
    eq('page · nothing was submitted', dom.window.__submitted, 0);
    const footer = d.getElementById('examFooterBar');
    ok(footer && /hidden/.test(footer.className), 'page · the submit button is gone');
    dom.window.close();
    console.log('  15/16 · endpoint 409, page locked, 0 questions rendered, 0 submissions');
}

/* ================================================================ *
 * 5. THE BODY IS NEVER AUTHORITY
 * ================================================================ */
{
    const done16 = () => ({ u1: learner({ courses: { B2: { completedTopics: ids(16) } } }) });

    /* a claimed score/pass in the body changes nothing — the paper is graded */
    const r = await sitExam(done16(), 'u1', {
        course: 'B2', answers: withCorrect(20),
        score: 100, passed: true, certificateUnlocked: true, finalExamPassed: true
    });
    eq('a body claiming 100/passed is graded on its answers', r.payload.score, 20);
    eq('  and fails', r.payload.passed, false);
    eq('  the stored score is the graded one', r.store.users.u1.courses.B2.finalExamScore, 20);
    eq('  the stored verdict is the graded one', r.store.users.u1.courses.B2.finalExamPassed, false);
    eq('  and no certificate was unlocked', r.store.users.u1.courses.B2.certificateUnlocked, undefined);

    /* §17 — malformed claims are not merely ignored, they are inert */
    for (const bad of [
        { score: '100abc', passed: 'true' },
        { score: Infinity, passed: 1 },
        { finalExamScore: 100, finalExamPassed: true },
        { bestScore: 100, certificateUnlocked: true }
    ]) {
        const rr = await sitExam(done16(), 'u1', Object.assign({ course: 'B2', answers: BLANK }, bad));
        eq(`malformed claim ${JSON.stringify(bad).slice(0, 40)} · score stays graded`, rr.payload.score, 0);
        eq('  and the verdict stays false', rr.payload.passed, false);
        eq('  and the stored flag is a real boolean false',
            rr.store.users.u1.courses.B2.finalExamPassed, false);
    }

    /* the uid in the body is not read — the session owns the record */
    const two = {
        u1: learner({ courses: { B2: { completedTopics: ids(16) } } }),
        u2: learner({ displayName: 'Victim', courses: { B2: { completedTopics: ids(16) } } })
    };
    const spoof = await sitExam(two, 'u1', { course: 'B2', answers: PERFECT, uid: 'u2', userId: 'u2' });
    eq('a body naming another uid still writes to the caller', spoof.status, 200);
    eq('  the caller got the pass', spoof.store.users.u1.courses.B2.finalExamPassed, true);
    eq('  the named victim was NOT touched', spoof.store.users.u2.courses.B2.finalExamPassed, undefined);

    /* no session, no exam */
    const anon = await sitExam(done16(), null, { course: 'B2', answers: PERFECT });
    eq('an unauthenticated submission is refused', anon.status, 401);
    const badTok = await sitExam(done16(), 'not-a-real-uid', { course: 'B2', answers: PERFECT });
    eq('an unverifiable token is refused', badTok.status, 401);

    /* blocked / frozen still cannot bank a pass through the API */
    const blocked = { u1: learner({ blocked: true, courses: { B2: { completedTopics: ids(16) } } }) };
    eq('a blocked account cannot submit', (await sitExam(blocked, 'u1', { course: 'B2', answers: PERFECT })).status, 403);
    const frz = { u1: learner({ accountFreeze: freeze.buildFreeze({}, { now, actorUid: 'admin' }).freeze,
        courses: { B2: { completedTopics: ids(16) } } }) };
    eq('a frozen account cannot submit', (await sitExam(frz, 'u1', { course: 'B2', answers: PERFECT })).status, 403);

    /* a retake may improve a record, never damage one */
    const passed16 = { u1: learner({ courses: { B2: {
        completedTopics: ids(16), finalExamPassed: true, finalExamScore: 92 } } }) };
    const retake = await sitExam(passed16, 'u1', { course: 'B2', answers: BLANK });
    eq('a failed retake keeps the earlier pass', retake.store.users.u1.courses.B2.finalExamPassed, true);
    eq('  and the best score', retake.store.users.u1.courses.B2.finalExamScore, 92);
    console.log('  endpoint · body score/pass/uid inert · 401 anon · 403 blocked+frozen · retake non-destructive');
}

/* ================================================================ *
 * 6. MALFORMED SERVER PROGRESS MUST NOT FAIL OPEN
 * ================================================================ */
{
    const cases = [
        ['no course record at all', {}],
        ['completedTopics missing', { finalExamScore: 0 }],
        ['completedTopics null', { completedTopics: null }],
        ['completedTopics a string "1,2,3..."', { completedTopics: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16' }],
        ['completedTopics an object', { completedTopics: { 1: true, 2: true } }],
        ['sixteen duplicates of topic 1', { completedTopics: Array(16).fill(1) }],
        ['fifteen real ids plus 999', { completedTopics: ids(15).concat([999]) }],
        ['ids with a non-numeric member', { completedTopics: [1, 2, 'x', 999] }],
        ['negative and zero ids padding', { completedTopics: ids(15).concat([0, -1, -2]) }],
        ['floats', { completedTopics: ids(15).concat([16.5]) }]
    ];
    for (const [label, state] of cases) {
        const r = await sitExam({ u1: learner({ courses: { B2: state } }) }, 'u1',
            { course: 'B2', answers: PERFECT });
        eq(`exam endpoint fails CLOSED · ${label}`, r.status, 409);
        eq(`  and writes no pass · ${label}`,
            (r.store.users.u1.courses.B2 || {}).finalExamPassed, undefined);
    }
    /* and the one shape that IS sixteen topics is accepted, so the above is a
       gate and not a blanket refusal */
    const good = await sitExam({ u1: learner({ courses: { B2: { completedTopics: ids(16) } } }) },
        'u1', { course: 'B2', answers: PERFECT });
    eq('sixteen genuine ids are accepted', good.status, 200);

    /* a read failure on the page side must also fail closed */
    const mem = {};
    const dom = new JSDOM(EXAM_SRC.replace(/<script type="module" src="paid-platform\.js"><\/script>/, '')
        .replace(/<script defer src="pro-toast\.js"><\/script>/, ''), {
        runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.test/paid-courses/b2-final-exam.html',
        beforeParse(w) {
            Object.defineProperty(w, 'localStorage', { value: {
                getItem: (k) => (k in mem ? mem[k] : null),
                setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } },
                configurable: true });
            w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {};
            w.HTMLElement.prototype.scrollIntoView = () => {};
            w.localStorage.setItem('currentUser', JSON.stringify({ id: 'u1', name: 'T', role: 'customer' }));
            w.localStorage.setItem('b2_progress_u1', JSON.stringify(ids(16)));
            w.getUserQuizResults = async () => ({});
            w.saveQuizResult = async () => true;
            w.__submitted = 0;
            w.submitFinalExam = async () => { w.__submitted++; return { score: 100, passed: true }; };
            w.getAuthoritativeCourseProgress = async () => { throw new Error('network down'); };
            w.uzTrack = () => {};
        }
    });
    await new Promise((r) => setTimeout(r, 900));
    const d = dom.window.document;
    eq('page · a failed authoritative read renders NO questions',
        d.querySelectorAll('[data-exam-row]').length, 0);
    ok(/tekshirib bo/.test(d.getElementById('examExercises').innerHTML),
        'page · and says the state could not be checked');
    ok(!/tugating/.test(d.getElementById('examExercises').innerHTML),
        'page · without accusing the learner of not finishing');
    eq('page · nothing was submitted', dom.window.__submitted, 0);
    dom.window.close();
    console.log('  malformed progress · 10 shapes all fail closed · read failure fails closed');
}

/* ================================================================ *
 * 7. THE CERTIFICATE — 79 / 80 EDGES, ISOLATION, OWNER, COURSE SWAP
 * ================================================================ */
{
    /* §10 — the exam was failed; a recorded 79 is not a pass */
    {
        const users = { u1: learner({ courses: { B2: {
            completedTopics: ids(16), finalExamPassed: false, finalExamScore: 79 } } }) };
        const r = await issueVia(users, 'u1', { course: 'B2' });
        eq('79 with finalExamPassed:false — REFUSED', r.status, 403);
        eq('  no certificate document', Object.keys(r.store.certificates).length, 0);
        eq('  no registry record', Object.keys(r.store.registry).length, 0);
        ok(!r.store.users.u1.courses.B2.certificateNumber, '  no number stamped on the user');
        eq('  and no counter was consumed', Object.keys(r.store.counters).length, 0);
    }
    /* §11 — 80 is the mark, and 80 passes */
    {
        const users = { u1: learner({ courses: { B2: {
            completedTopics: ids(16), finalExamPassed: true, finalExamScore: 80 } } }) };
        const r = await issueVia(users, 'u1', { course: 'B2' });
        eq('80 with a server pass — ALLOWED', r.status, 200);
        const cert = r.payload.certificate;
        eq('  the course is B2', cert.course, 'B2');
        eq('  the level is B2', cert.level, 'B2');
        eq('  the score is 80', cert.score, 80);
        ok(/^UZD-B2-\d{4}-\d{6}$/.test(cert.certificateNumber),
            `  the number is UZD-B2-<year>-<seq> (${cert.certificateNumber})`);
        eq(`  the year is this year`, cert.certificateNumber.split('-')[2],
            String(new Date().getFullYear()));
        eq('  the holder is the session user', cert.userName, 'Test Talaba');
        eq('  one registry record exists', Object.keys(r.store.registry).length, 1);
        eq('  and the user is stamped', r.store.users.u1.courses.B2.certificateNumber,
            cert.certificateNumber);
    }
    /* the 80 boundary is the endpoint's, not a coincidence: 79 graded on a real
       paper never sets the flag the certificate needs */
    {
        const users = { u1: learner({ courses: { B2: { completedTopics: ids(16) } } }) };
        const sat = await sitExam(users, 'u1', { course: 'B2', answers: withCorrect(79) });
        eq('a genuinely-79 paper scores 79', sat.payload.score, 79);
        eq('  and does not pass', sat.payload.passed, false);
        const after = await issueVia({ u1: sat.store.users.u1 }, 'u1', { course: 'B2' });
        eq('  so the certificate is refused', after.status, 403);

        const users2 = { u1: learner({ courses: { B2: { completedTopics: ids(16) } } }) };
        const sat2 = await sitExam(users2, 'u1', { course: 'B2', answers: withCorrect(80) });
        eq('a genuinely-80 paper scores 80', sat2.payload.score, 80);
        eq('  and passes', sat2.payload.passed, true);
        const after2 = await issueVia({ u1: sat2.store.users.u1 }, 'u1', { course: 'B2' });
        eq('  and the certificate issues', after2.status, 200);
        eq('  carrying the server score', after2.payload.certificate.score, 80);
    }

    /* §12 — A2 state must never satisfy B2, and B2 must never touch A2 */
    {
        const users = { u1: learner({ courses: {
            A2: { completedTopics: ids(16), finalExamPassed: true, finalExamScore: 95 },
            B2: { completedTopics: ids(16), finalExamPassed: false, finalExamScore: 79 }
        } }) };
        const r = await issueVia(users, 'u1', { course: 'B2' });
        eq('a passed A2 does NOT satisfy B2 — REFUSED', r.status, 403);
        eq('  no B2 certificate was written', Object.keys(r.store.certificates).length, 0);
        ok(!r.store.users.u1.courses.B2.certificateNumber, '  and no B2 number stamped');

        /* the inverse: earning B2 leaves A2 exactly as it was */
        const users2 = { u1: learner({ courses: {
            A2: { completedTopics: ids(10), finalExamPassed: false, finalExamScore: 40 },
            B2: { completedTopics: ids(16), finalExamPassed: true, finalExamScore: 88 }
        } }) };
        const b2r = await issueVia(users2, 'u1', { course: 'B2' });
        eq('B2 issues on its own state', b2r.status, 200);
        const a2after = b2r.store.users.u1.courses.A2;
        eq('  A2 completedTopics untouched', a2after.completedTopics.length, 10);
        eq('  A2 pass flag untouched', a2after.finalExamPassed, false);
        eq('  A2 score untouched', a2after.finalExamScore, 40);
        ok(!a2after.certificateNumber, '  and A2 got no certificate number');
        /* and asking for A2 with that same user is independently refused */
        const a2r = await issueVia({ u1: b2r.store.users.u1 }, 'u1', { course: 'A2' });
        eq('asking for A2 is evaluated against A2 — REFUSED', a2r.status, 403);

        /* the exam endpoint is equally isolated */
        const sat = await sitExam({ u1: learner({ courses: {
            A2: { completedTopics: ids(16), finalExamPassed: true },
            B2: { completedTopics: ids(15) } } }) }, 'u1', { course: 'B2', answers: PERFECT });
        eq('a finished A2 does not unlock the B2 exam', sat.status, 409);
    }

    /* §14 — course-swap: eligible for B2 only, ask for A2 */
    {
        const users = { u1: learner({ courses: {
            B2: { completedTopics: ids(16), finalExamPassed: true, finalExamScore: 100 } } }) };
        const r = await issueVia(users, 'u1', { course: 'A2' });
        eq('B2-only learner requesting an A2 certificate — REFUSED', r.status, 403);
        eq('  nothing was written', Object.keys(r.store.certificates).length, 0);
        /* every other course, same answer */
        for (const c of ['A1', 'B1']) {
            const rr = await issueVia(users, 'u1', { course: c });
            eq(`  and for ${c} — REFUSED`, rr.status, 403);
        }
        /* case games do not dodge the evaluation */
        for (const c of ['a2', 'A2 ', ' a2']) {
            const rr = await issueVia(users, 'u1', { course: c });
            eq(`  '${c}' normalises to A2 and is still REFUSED`, rr.status, 403);
        }
        /* an unknown course is refused outright, not defaulted */
        eq('an unknown course is refused', (await issueVia(users, 'u1', { course: 'ZZ' })).status, 400);
        eq('a missing course is refused', (await issueVia(users, 'u1', {})).status, 400);
    }

    /* §13 — owner spoof */
    {
        const users = {
            attacker: learner({ displayName: 'Attacker', courses: {
                B2: { completedTopics: ids(16), finalExamPassed: true, finalExamScore: 81 } } }),
            victim: learner({ displayName: 'Victim', courses: {
                B2: { completedTopics: ids(16), finalExamPassed: true, finalExamScore: 99 } } })
        };
        const bodies = [
            { course: 'B2', uid: 'victim' },
            { course: 'B2', userId: 'victim' },
            { course: 'B2', user: { uid: 'victim' } },
            { course: 'B2', profile: { displayName: 'Victim', role: 'admin' } },
            { course: 'B2', displayName: 'Victim' },
            { course: 'B2', userName: 'Victim' },
            { course: 'B2', isPrivileged: true },
            { course: 'B2', session: { uid: 'victim', role: 'admin' } }
        ];
        for (const body of bodies) {
            const r = await issueVia(users, 'attacker', body);
            const key = Object.keys(body).filter((k) => k !== 'course').join(',');
            eq(`body {${key}} still issues to the CALLER`, r.status, 200);
            ok(/^UZD-B2-/.test(r.payload.certificate.certificateNumber), `  a B2 number (${key})`);
            eq(`  named for the caller, not the body (${key})`,
                r.payload.certificate.userName, 'Attacker');
            eq(`  carrying the CALLER's score (${key})`, r.payload.certificate.score, 81);
            eq(`  stamped on the caller (${key})`,
                r.store.users.attacker.courses.B2.certificateNumber,
                r.payload.certificate.certificateNumber);
            ok(!r.store.users.victim.courses.B2.certificateNumber,
                `  and the victim was never stamped (${key})`);
        }
        /* and with no session there is nothing to own */
        eq('an unauthenticated issue is refused',
            (await issueVia(users, null, { course: 'B2' })).status, 401);
        eq('an unverifiable token is refused',
            (await issueVia(users, 'ghost', { course: 'B2' })).status, 401);
    }

    /* idempotency through the real endpoint */
    {
        const users = { u1: learner({ courses: { B2: {
            completedTopics: ids(16), finalExamPassed: true, finalExamScore: 88 } } }) };
        const { adminDb, adminAuth, store } = makeDb(users);
        globalThis.__ADMIN = { adminDb, adminAuth, FieldValue, Timestamp };
        const a = await call(certApi, { token: 'u1', body: { course: 'B2' }, query: { action: 'issue' } });
        const b = await call(certApi, { token: 'u1', body: { course: 'B2' }, query: { action: 'issue' } });
        const c = await call(certApi, { token: 'u1', body: { course: 'B2' }, query: { action: 'issue' } });
        eq('three issues return one number', new Set([a, b, c]
            .map((x) => x.payload.certificate.certificateNumber)).size, 1);
        eq('  the second reports alreadyIssued', b.payload.alreadyIssued, true);
        eq('  the third too', c.payload.alreadyIssued, true);
        eq('  one certificate document', Object.keys(store.certificates).length, 1);
        eq('  one registry record', Object.keys(store.registry).length, 1);
    }
    console.log('  certificate · 79 refused · 80 issued · A2/B2 isolated · 8 spoof bodies rejected · idempotent');
}

/* ================================================================ *
 * 8. THE CLIENT MAY BELIEVE ANYTHING; IT MAY NOT DECIDE ANYTHING
 * ---------------------------------------------------------------- *
 * Three runtime fixtures on the real exam page: a server FAIL against a
 * local "100 passed", a submission that never lands at all, and a
 * server error. In none of them may the page claim completion.
 * ================================================================ */
function bootExam(tweak) {
    const mem = {};
    const dom = new JSDOM(EXAM_SRC.replace(/<script type="module" src="paid-platform\.js"><\/script>/, '')
        .replace(/<script defer src="pro-toast\.js"><\/script>/, ''), {
        runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.test/paid-courses/b2-final-exam.html',
        beforeParse(w) {
            Object.defineProperty(w, 'localStorage', { value: {
                getItem: (k) => (k in mem ? mem[k] : null),
                setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; },
                __mem: mem }, configurable: true });
            w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {};
            w.HTMLElement.prototype.scrollIntoView = () => {};
            w.localStorage.setItem('currentUser', JSON.stringify({ id: 'u1', name: 'T', role: 'customer' }));
            w.getUserProgress = async () => ({ completedTopics: ids(16) });
            w.getAuthoritativeCourseProgress = async () => ({ completedTopics: ids(16), userExists: true });
            w.getUserQuizResults = async () => ({});
            w.saveQuizResult = async () => true;
            w.uzTrack = (...a) => { (w.__events = w.__events || []).push(a); };
            w.logActivity = async () => true;
            w.__mem = mem;
            tweak(w);
        }
    });
    return dom;
}
async function answerPerfectlyAndSubmit(dom) {
    const w = dom.window, d = w.document;
    /* fill the paper in perfectly, the way a learner would */
    DATA.forEach((g, gi) => g.items.forEach((it, ii) => {
        const key = gi + '-' + ii;
        if (it.mode === 'chip') {
            const want = String(firstAns(it));
            d.querySelectorAll(`.exam-q-chip[data-exam-chip="${key}"]`).forEach((ch) => {
                if (ch.dataset.value === want) ch.dispatchEvent(new w.Event('click', { bubbles: true }));
            });
        } else {
            const inp = d.querySelector(`[data-exam-input="${key}"]`);
            if (inp) { inp.value = String(firstAns(it)); inp.dispatchEvent(new w.Event('input', { bubbles: true })); }
        }
    }));
    d.getElementById('examSubmitBtn').dispatchEvent(new w.Event('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 900));
    return d;
}
{
    /* ---- A. the client computed 100; the SERVER says 79 / failed ---- */
    const dom = bootExam((w) => {
        w.localStorage.setItem('b2_completion_u1', JSON.stringify({
            finalExamPassed: true, courseCompleted: true, certificateUnlocked: true, finalExamScore: 100 }));
        w.submitFinalExam = async () => ({ correct: 79, total: 100, score: 79,
            passMark: 80, passed: false, certificateUnlocked: false });
    });
    await new Promise((r) => setTimeout(r, 700));
    eq('the paper rendered for a 16/16 learner',
        dom.window.document.querySelectorAll('[data-exam-row]').length, 100);
    const d = await answerPerfectlyAndSubmit(dom);
    const fb = d.getElementById('examFeedback').innerHTML;
    eq('client 100 vs server 79 · the learner is shown 79', /79 \/ 100/.test(fb), true);
    eq('  and is told they did NOT pass', /O‘tmadingiz|O'tmadingiz/.test(fb), true);
    eq('  the page never says 100', /100 \/ 100/.test(fb), false);
    eq('  no certificate is announced', /sertifikat/i.test(fb), false);
    eq('  no course-completed headline', /muvaffaqiyatli tugatildi/.test(fb), false);
    /* the completion cache must be OVERWRITTEN-BY-NOTHING: a fail writes none */
    const cache = JSON.parse(dom.window.__mem['b2_completion_u1'] || 'null');
    eq('  the pre-seeded local "passed" was not refreshed by this attempt',
        cache && cache.finalExamScore, 100);
    ok(!/exam_pass/.test(JSON.stringify(dom.window.__events || [])),
        '  and no exam_pass event was emitted');
    ok(/exam_fail/.test(JSON.stringify(dom.window.__events || [])),
        '  an exam_fail event was emitted instead');
    dom.window.close();

    /* ---- B. the client computed 100 and the submission NEVER LANDS ---- */
    const dom2 = bootExam((w) => {
        w.submitFinalExam = async () => { throw Object.assign(new Error('offline'), { status: 500 }); };
    });
    await new Promise((r) => setTimeout(r, 700));
    const d2 = await answerPerfectlyAndSubmit(dom2);
    const fb2 = d2.getElementById('examFeedback').innerHTML;
    eq('a lost submission shows the neutral error state', /Qayta yuborish/.test(fb2), true);
    eq('  it does not say passed', /O‘tdingiz|O'tdingiz/.test(fb2), false);
    eq('  it does not say failed either', /O‘tmadingiz|O'tmadingiz/.test(fb2), false);
    eq('  it announces no certificate', /sertifikat/i.test(fb2), false);
    eq('  it announces no course completion', /muvaffaqiyatli tugatildi/.test(fb2), false);
    eq('  no score box was rendered', /exam-result-score/.test(fb2), false);
    eq('  NO completion cache was written',
        dom2.window.__mem['b2_completion_u1'] === undefined, true);
    ok(dom2.window.__mem['b2_finalexam_state_u1'] !== undefined,
        '  and the draft survives so the attempt is not lost');
    ok(!/exam_pass|exam_fail/.test(JSON.stringify(dom2.window.__events || [])),
        '  no analytics verdict was emitted at all');
    dom2.window.close();

    /* ---- C. the server answers, but with a shape that is not a verdict ---- */
    for (const [label, reply] of [
        ['null', null], ['{}', {}], ['{ok:true}', { ok: true }],
        ['a string score', { score: '100', passed: true }],
        ['passed without a score', { passed: true, certificateUnlocked: true }]
    ]) {
        const dm = bootExam((w) => { w.submitFinalExam = async () => reply; });
        await new Promise((r) => setTimeout(r, 700));
        const dd = await answerPerfectlyAndSubmit(dm);
        const h = dd.getElementById('examFeedback').innerHTML;
        eq(`a non-verdict reply (${label}) is treated as NO verdict`, /Qayta yuborish/.test(h), true);
        eq(`  no pass claimed (${label})`, /O‘tdingiz|O'tdingiz/.test(h), false);
        eq(`  no completion cached (${label})`,
            dm.window.__mem['b2_completion_u1'] === undefined, true);
        dm.window.close();
    }
    console.log('  client authority · server 79 beats local 100 · lost/!verdict submissions grant nothing');
}

/* ================================================================ *
 * 9. THE COURSE PAGE MUST NOT CERTIFY FROM LOCAL STATE
 * ================================================================ */
{
    const COURSE_SRC = read('paid-courses/b2-course.html');
    const BLOCK = COURSE_SRC.slice(COURSE_SRC.indexOf('        let b2Completion = {'),
                                  COURSE_SRC.indexOf('        function getTopicIcon(id) {'));
    const MARKUP = COURSE_SRC.slice(COURSE_SRC.indexOf('<section class="content-section" id="finalExamEntry"'),
                                    COURSE_SRC.indexOf('<script defer src="../global-nav.js">'));
    function bootCourse({ completed = 16, role = 'customer', remote = null, local = null }) {
        const dom = new JSDOM(`<!doctype html><body>${MARKUP}</body>`,
            { runScripts: 'outside-only', url: 'https://x.test/paid-courses/b2-course.html' });
        const w = dom.window, mem = {};
        Object.defineProperty(w, 'localStorage', { value: {
            getItem: (k) => (k in mem ? mem[k] : null),
            setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } },
            configurable: true });
        w.currentUser = { id: 'u1', name: 'Test Talaba', role };
        w.currentUserId = 'u1';
        w.userProgress = {};
        ids(completed).forEach((id) => { w.userProgress[id] = { completed: true }; });
        w.courseData = { topics: ids(16).map((id) => ({ id })) };
        w.b2IsPrivileged = () => ['developer', 'admin'].includes(String(role).toLowerCase());
        if (local) mem['b2_completion_u1'] = JSON.stringify(local);
        w.__issued = [];
        w.issueCertificate = async (c) => { w.__issued.push(c); return { certificateNumber: 'UZD-B2-2026-000001' }; };
        w.eval(BLOCK.replace(/^\s*let /gm, '    var ').replace(/^\s*const /gm, '    var '));
        if (remote) w.eval('mergeB2Completion(' + JSON.stringify(remote) + ', true);');
        if (local) w.eval('mergeB2Completion(readLocalB2Completion(), false);');
        return w;
    }

    /* §9 — the forged local result: 100 / passed / unlocked, server says nothing */
    const forged = bootCourse({ completed: 16, local: {
        finalExamPassed: true, courseCompleted: true, certificateUnlocked: true,
        finalExamScore: 100, certificateNumber: 'UZD-B2-2026-999999' } });
    eq('forged local state · the certificate is NOT unlocked',
        forged.eval('b2CertificateUnlocked()'), false);
    forged.eval('renderFinalExamEntry();');
    const fcard = forged.document.getElementById('finalExamEntryCard');
    ok(!/final-exam-entry completed/.test(fcard.className),
        '  the completed card is not rendered');
    ok(!/KURS TUGATILDI/.test(fcard.innerHTML), '  and no "course finished" badge');
    forged.eval('showB2Certificate();');
    ok(!/show/.test(forged.document.getElementById('b2CertOverlay').className),
        '  the certificate modal refuses to open');
    eq('  and no issuance was attempted', forged.__issued.length, 0);
    forged.close();

    /* the same forgery with the server ALSO recording a failure */
    const forged2 = bootCourse({ completed: 16,
        remote: { finalExamPassed: false, finalExamScore: 79 },
        local: { finalExamPassed: true, certificateUnlocked: true, finalExamScore: 100 } });
    eq('server 79/failed beats local 100/passed', forged2.eval('b2CertificateUnlocked()'), false);
    eq('  fbConfirmed was never set', forged2.eval('b2Completion.fbConfirmed'), false);
    forged2.eval('showB2Certificate();');
    ok(!/show/.test(forged2.document.getElementById('b2CertOverlay').className),
        '  the modal stays shut');
    forged2.close();

    /* and the legitimate case still works, so the gate is a gate */
    const real = bootCourse({ completed: 16,
        remote: { finalExamPassed: true, finalExamScore: 80 } });
    eq('a server-confirmed pass DOES unlock', real.eval('b2CertificateUnlocked()'), true);
    real.close();
    console.log('  course page · forged local pass grants nothing; server pass grants everything');
}

/* ================================================================ *
 * 10. THE DEMO CANNOT REACH THE EXAM OR THE CERTIFICATE
 * ================================================================ */
{
    const DEMO = read('b2-demo.html');
    /* static: no route to either resource exists in the demo at all */
    eq('the demo links to no final-exam page', /final-exam\.html/.test(DEMO), false);
    eq('the demo has no exam entry block', /finalExamEntry/.test(DEMO), false);
    eq('the demo has no certificate overlay', /CertOverlay|cert-overlay/i.test(DEMO), false);
    eq('the demo never calls issueCertificate', /issueCertificate/.test(DEMO), false);
    eq('the demo never calls submitFinalExam', /submitFinalExam/.test(DEMO), false);
    eq('the demo renders no exam CTA', /Yakuniy Imtihon/i.test(DEMO), false);

    /* behavioural: build the demo's topic list the way the demo does, and prove
       nothing in the rendered output routes to the exam or a certificate */
    const w = new JSDOM('<body></body>', { runScripts: 'outside-only' }).window;
    ['shared-normalizer.js', 'sentence-builder.js', 'course-exercise-ui.js',
     'b2-topics.js', 'b2-lesson-data.js'].forEach((f) => w.eval(read(f)));
    const grab = (src, name) => {
        const i = src.indexOf('function ' + name + '(');
        let d = 0, started = false;
        for (let k = src.indexOf('{', i); k < src.length; k++) {
            if (src[k] === '{') { d++; started = true; }
            else if (src[k] === '}') { d--; if (started && d === 0) return src.slice(i, k + 1); }
        }
        throw new Error('unbalanced ' + name);
    };
    w.eval([
        DEMO.match(/var B2_DEMO_MODE = (true|false);/)[0],
        grab(DEMO, 'b2SoonHtml'),
        'var B2_TOPICS = window.B2_TOPICS;',
        'var B2_TOPIC_DESCRIPTION = window.B2_TOPIC_DESCRIPTION;',
        grab(DEMO, 'b2ExerciseData'), grab(DEMO, 'buildB2Topics'),
        'window.__t = buildB2Topics();'
    ].join('\n'));
    const demoTopics = w.__t;
    eq('the demo really is in demo mode',
        /var B2_DEMO_MODE = true;/.test(DEMO), true);
    eq('the demo builds the same sixteen topics', demoTopics.length, 16);
    eq('  and locks everything past the free three',
        demoTopics.filter((t) => t.id > 3 && !t.isLocked).length, 0);
    const rendered = JSON.stringify(demoTopics);
    eq('no built demo topic mentions the exam', /final-exam|finalExam/.test(rendered), false);
    eq('no built demo topic mentions a certificate', /certificate|sertifikat/i.test(rendered), false);
    /* the demo is not even behind the paid gate, which is precisely why it must
       carry no route to a paid, certifying resource */
    eq('the demo page is not a gated paid page',
        GATE.getPackByPageName('b2-demo.html'), null);
    console.log('  demo · no exam CTA, no exam URL, no certificate CTA, 13/16 locked');
}

/* ================================================================ *
 * 11. THE EXAM IS NOT A SEVENTEENTH TOPIC
 * ================================================================ */
{
    const w = new JSDOM('<body></body>', { runScripts: 'outside-only' }).window;
    ['b2-topics.js', 'b2-lesson-data.js'].forEach((f) => w.eval(read(f)));
    eq('B2_TOPICS declares sixteen topics', w.B2_TOPICS.length, 16);
    eq('  numbered 1..16', w.B2_TOPICS.map((t) => t.id).join(','), ids(16).join(','));
    const COURSE_SRC = read('paid-courses/b2-course.html');
    const canonSrc = read('api/_lib/course-canon.js');
    ok(/"B2": \{\s*"totalTopics": 16/.test(canonSrc), 'the canon sizes B2 at sixteen topics');
    eq('the course page invents no topic 17', /\bid: 17\b|Topic ?17|topic17/i.test(COURSE_SRC), false);
    eq('the exam page invents no topic 17', /\bid: 17\b|Topic ?17|topic17/i.test(EXAM_SRC), false);

    /* BEHAVIOURAL: a perfect exam must not add a topic to the record. */
    const users = { u1: learner({ courses: { B2: { completedTopics: ids(16) } } }) };
    const r = await sitExam(users, 'u1', { course: 'B2', answers: PERFECT });
    eq('a perfect paper passes', r.payload.passed, true);
    const after = r.store.users.u1.courses.B2;
    eq('  completedTopics is still exactly sixteen', after.completedTopics.length, 16);
    eq('  and still 1..16', after.completedTopics.join(','), ids(16).join(','));
    ok(!after.completedTopic17, '  no completedTopic17 field appeared');
    eq('  the exam wrote no topic at all',
        JSON.stringify(after.completedTopics), JSON.stringify(ids(16)));
    /* and the topic endpoint refuses to invent one */
    /* A FAILED IMPORT MUST NOT SILENTLY SKIP ASSERTIONS. complete-topic.js
       gained an import (topic-components.js); when the shim map did not list it
       this resolved to null and the two checks below simply vanished from the
       count. The import is now asserted before it is used. */
    const topicMod = await import(pathToFileURL(path.join(TMP, 'complete-topic.mjs')).href)
        .catch((e) => { ok(false, 'complete-topic shim imports: ' + e.message); return null; });
    ok(!!topicMod, 'the complete-topic endpoint was loaded');
    if (topicMod) {
        const { adminDb, adminAuth, store } = makeDb(users);
        globalThis.__ADMIN = { adminDb, adminAuth, FieldValue, Timestamp };
        const t17 = await call(topicMod, { token: 'u1', body: { course: 'B2', topicId: 17 } });
        eq('claiming topic 17 is refused as out of range', t17.status, 400);
        eq('  and nothing was written', store.users.u1.courses.B2.completedTopics.length, 16);
    }
    console.log('  topic 17 · absent from syllabus, canon, pages; a 100/100 pass leaves 16/16');
}

/* ================================================================ *
 * 11b. THE LIVE PROFILE OUTRANKS A STALE TOKEN CLAIM
 * ---------------------------------------------------------------- *
 * A role change only rewrites the custom claim for FUTURE tokens, so
 * an account demoted from admin to customer keeps an admin claim for
 * the remaining life of its current token — up to about an hour. The
 * privileged bypass skips the completion gate and lets a certificate
 * issue with no exam at all, so which of the two wins is a security
 * property, not a detail. Nothing tested it before this.
 * ================================================================ */
{
    /* demoted: the token still says admin, Firestore says customer */
    const demoted = { u1: learner({ role: 'user', __claimRole: 'admin',
        courses: { B2: { completedTopics: ids(3) } } }) };
    const r = await sitExam(demoted, 'u1', { course: 'B2', answers: PERFECT });
    eq('a stale admin claim does NOT bypass the completion gate', r.status, 409);
    eq('  and no pass was written',
        (r.store.users.u1.courses.B2 || {}).finalExamPassed, undefined);
    const c = await issueVia(demoted, 'u1', { course: 'B2' });
    eq('nor does it bypass certificate eligibility', c.status, 403);
    eq('  no certificate was written', Object.keys(c.store.certificates).length, 0);

    /* a genuinely privileged account still works, so the above is the claim
       being ignored rather than the bypass being broken */
    const real = { u1: learner({ role: 'developer',
        courses: { B2: { completedTopics: ids(3) } } }) };
    eq('a live developer role DOES bypass the exam gate',
        (await sitExam(real, 'u1', { course: 'B2', answers: PERFECT })).status, 200);
    eq('and DOES bypass certificate eligibility',
        (await issueVia(real, 'u1', { course: 'B2' })).status, 200);

    /* the inverse: a stale CUSTOMER claim must not strip a live admin */
    const promoted = { u1: learner({ role: 'admin', __claimRole: 'user',
        courses: { B2: { completedTopics: ids(3) } } }) };
    eq('a stale customer claim does not strip a live admin',
        (await issueVia(promoted, 'u1', { course: 'B2' })).status, 200);

    /* and the source of that decision is the profile, in the shipped code */
    const req = read('api/_lib/request.js');
    ok(/const role = profileRole;/.test(req),
        'requireSession resolves the role from the live Firestore profile');
    eq('and not from the token claim',
        /const role = claimsRole \|\| profileRole;/.test(req), false);
    ok(/roleClaimStale/.test(req), 'a stale claim is surfaced for diagnostics');
    console.log('  role authority · stale admin claim ignored; live role decides');
}

/* ================================================================ *
 * 12. THE CERTIFICATE SAYS B2, AND SAYS IT FROM THE REGISTRY
 * ================================================================ */
{
    const certs = await import(pathToFileURL(path.join(TMP, 'certificates.mjs')).href);
    eq('B2 is certifiable', certs.isCertifiableCourse('B2'), true);
    eq('  its level is B2', certs.CERT_COURSES.B2.level, 'B2');
    eq('  its title is the B2 title', certs.CERT_COURSES.B2.courseTitle, 'B2 Daraja — Rus tili');
    ok(/^B2 «/.test(certs.CERT_COURSES.B2.levelLabel),
        `  and its level label is B2's (${certs.CERT_COURSES.B2.levelLabel})`);
    eq('  A2 keeps its own title', certs.CERT_COURSES.A2.courseTitle, 'A2 Daraja — Rus tili');
    eq('  and B2 does not borrow it',
        certs.CERT_COURSES.B2.courseTitle === certs.CERT_COURSES.A2.courseTitle, false);

    const users = { u1: learner({ courses: { B2: {
        completedTopics: ids(16), finalExamPassed: true, finalExamScore: 84 } } }) };
    const r = await issueVia(users, 'u1', { course: 'B2' });
    const num = r.payload.certificate.certificateNumber;
    eq('the issued certificate is a B2 certificate', r.payload.certificate.course, 'B2');
    eq('  at level B2', r.payload.certificate.level, 'B2');
    ok(/^UZD-B2-\d{4}-\d{6}$/.test(num), `  numbered UZD-B2-<year>-<seq> (${num})`);
    /* and PUBLIC VERIFICATION agrees, which is what an employer would see */
    globalThis.__ADMIN = { adminDb: (function () {
        const st = r.store;
        return { collection: () => ({ doc: (id) => ({ get: async () => ({
            exists: !!st.registry[id], data: () => st.registry[id] }) }) }),
            doc: () => ({}), runTransaction: async (f) => f({}) };
    })(), adminAuth: {}, FieldValue, Timestamp };
    const found = await certs.getRegistryCertificate(num);
    ok(!!found, 'the number resolves through the public registry');
    eq('  verification reports course B2', found.course, 'B2');
    eq('  verification reports level B2', found.level, 'B2');
    eq('  verification reports the holder', found.userName, 'Test Talaba');
    eq('  verification reports the server score', found.score, 84);
    eq('  and reports it active', found.status, 'active');
    /* the stored certificate carries the B2 wording, not another course's */
    const stored = Object.values(r.store.certificates)[0];
    eq('the stored certificate names the B2 course title',
        stored.certificateData && stored.certificateData.courseTitle, 'B2 Daraja — Rus tili');
    console.log(`  label · ${num} · course B2 · level B2 · verifies publicly`);
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}

console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ B2 EXAM SECURITY: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 30).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ B2 EXAM SECURITY: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
})().catch((e) => { console.error(e); process.exit(2); });
