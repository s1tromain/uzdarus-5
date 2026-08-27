#!/usr/bin/env node
/**
 * verify_a2_certificate_ui.cjs — the A2 graduation screen, driven end to end.
 *
 * WHY THIS SUITE EXISTS. A2 shipped with a certificate that no ordinary learner
 * could ever open. mergeA2Completion() and readLocalA2Completion() were defined
 * and never called, so a2Completion.fbConfirmed — the flag the certificate gate
 * requires — stayed false forever. Every existing A2 suite was green: the
 * functions were correct, the gate was correct, the markup was correct. What
 * was missing was a CALL SITE, and nothing tested the wiring between them.
 *
 * So this suite does not test functions. It runs the page's own
 * loadUserData() against a fake Firestore and then asks the page's own
 * renderFinalExamEntry() what it drew. A missing call site fails it, which is
 * the whole point — that is the bug class that got through.
 *
 * The certificate must rest on the SERVER and only the server:
 *
 *   remote pass + every topic     -> unlocked
 *   localStorage pass             -> locked, always, no matter what it says
 *   remote pass + a topic missing -> locked
 *   remote fail (79)              -> locked
 *   remote pass (80)              -> unlocked
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const SRC = fs.readFileSync(path.join(ROOT, 'paid-courses/a2-course.html'), 'utf8');
const COURSE = 'A2';

console.log('\n=== A2 CERTIFICATE UI ===');

/* ---- brace-matched extraction, strings aware ---- */
function extractFn(text, signature) {
    const start = text.indexOf(signature);
    if (start < 0) throw new Error('not found: ' + signature);
    let depth = 0, q = null, esc = false;
    for (let i = text.indexOf('{', start); i < text.length; i++) {
        const c = text[i];
        if (q) { if (esc) { esc = false; continue; } if (c === '\\') { esc = true; continue; } if (c === q) q = null; continue; }
        if (c === '"' || c === "'" || c === '`') { q = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
    throw new Error('unbalanced: ' + signature);
}
const MARKUP = SRC.slice(SRC.indexOf('<section class="content-section" id="finalExamEntry"'),
                         SRC.indexOf('<script defer src="../global-nav.js">'));
ok(/id="finalExamEntryCard"/.test(MARKUP), 'the entry card ships with the page');
ok(/id="a2CertOverlay"/.test(MARKUP), 'and so does the certificate overlay');

const FNS = ['function readLocalA2Completion()', 'function mergeA2Completion(',
    'function updateA2CertIdField()', 'async function ensureA2CertificateIssued()',
    'function a2IsPrivileged()', 'function a2AllTopicsCompleted()',
    'function a2CertificateUnlocked()', 'function renderFinalExamEntry()',
    'function showA2Certificate()', 'async function loadUserData()',
    'function waitForFirebase()'];

/**
 * Boot the REAL page logic. loadUserData() is included deliberately: the
 * defect this suite exists for was a missing call inside it, so a fixture that
 * hand-called mergeA2Completion() would have stayed green through the bug.
 */
function boot({ completed = 16, role = 'customer', remote = undefined, local = null,
                remoteThrows = false, noHelpers = false } = {}) {
    const dom = new JSDOM(`<!doctype html><body>${MARKUP}</body>`,
        { runScripts: 'outside-only', url: 'https://x.test/paid-courses/a2-course.html' });
    const w = dom.window, mem = {};
    Object.defineProperty(w, 'localStorage', { value: {
        getItem: (k) => (k in mem ? mem[k] : null),
        setItem: (k, v) => { mem[k] = String(v); },
        removeItem: (k) => { delete mem[k]; } }, configurable: true });
    w.__mem = mem;
    w.alert = () => {}; w.print = () => {};
    mem['currentUser'] = JSON.stringify({ id: 'u1', name: 'Test Talaba', role });
    if (local) mem['a2_completion_u1'] = JSON.stringify(local);

    const server = remote === undefined
        ? { completedTopics: Array.from({ length: completed }, (_, i) => i + 1) }
        : Object.assign({ completedTopics: Array.from({ length: completed }, (_, i) => i + 1) }, remote);
    w.__server = server;
    w.firebaseReady = true;
    if (!noHelpers) {
        w.getUserProgress = async () => { if (remoteThrows) throw new Error('offline'); return server; };
        w.getUserQuizResults = async () => ({});
    }
    w.__issued = [];
    w.issueCertificate = async (c) => {
        w.__issued.push(c);
        return { certificateNumber: 'UZD-A2-2026-000042',
                 certificateData: { date: '2026-04-01T00:00:00.000Z' } };
    };
    const TOPICS = JSON.stringify(Array.from({ length: 16 }, (_, i) => ({ id: i + 1 })));
    w.eval(`
        var courseData = { topics: ${TOPICS} };
        var completedTopics = [];
        var userQuizResults = {};
        var currentUser = null, currentUserId = null;
        var quizSection = null;
        ${STATE}
        var a2CertIssueRequested = false;
        ${FNS.map((s) => extractFn(SRC, s)).join('\n')}
    `);
    return w;
}
/* the a2Completion declaration is lifted from the page too, so a field added
   there cannot silently go untested here */
const STATE = (SRC.match(/ *let a2Completion = \{[^\n]*\n/) || [''])[0].replace('let ', 'var ');
ok(/fbConfirmed: false/.test(STATE), 'a2Completion starts unconfirmed');

const card = (w) => w.document.getElementById('finalExamEntryCard');

/* ---------------------------------------------------- 0. THE WIRING ITSELF */
{
    /* The defect was a missing call, so the call sites are asserted directly —
       cheaply, and in a way that names the exact regression if it returns. */
    const calls = (name) => (SRC.split(name).length - 1) - (SRC.split('function ' + name).length - 1);
    ok(calls('mergeA2Completion') >= 1,
        `mergeA2Completion is actually called (${calls('mergeA2Completion')} call sites)`);
    ok(calls('readLocalA2Completion') >= 1,
        `readLocalA2Completion is actually called (${calls('readLocalA2Completion')} call sites)`);
    /* the remote merge must be the AUTHORITATIVE one */
    ok(/mergeA2Completion\(savedProgress, true\)/.test(SRC),
        'the Firestore course record is merged as authoritative');
    ok(/mergeA2Completion\(readLocalA2Completion\(\), false\)/.test(SRC),
        'and the localStorage cache is merged as NON-authoritative');
    eq('no localStorage merge is ever passed fromFirebase=true',
        /mergeA2Completion\(readLocalA2Completion\(\), true\)/.test(SRC), false);
    /* the only writer of fbConfirmed is the Firebase branch */
    ok(/if \(fromFirebase && src\.finalExamPassed\) a2Completion\.fbConfirmed = true;/.test(SRC),
        'fbConfirmed is set only when the record came from Firebase');
    eq('there is exactly one writer of fbConfirmed',
        (SRC.match(/a2Completion\.fbConfirmed = true/g) || []).length, 1);
}

(async () => {
/* ------------------------------------------- A. 16/16 + REMOTE PASS -> UNLOCKED */
{
    const w = boot({ completed: 16, remote: { finalExamPassed: true, finalExamScore: 92,
        finalExamCompletedAt: '2026-04-01T10:00:00.000Z', certificateUnlocked: true } });
    await w.eval('loadUserData()');
    eq('A · the server record was hydrated', w.eval('a2Completion.finalExamPassed'), true);
    eq('A · and Firebase-confirmed', w.eval('a2Completion.fbConfirmed'), true);
    eq('A · the score came across', w.eval('a2Completion.finalExamScore'), 92);
    eq('A · and the completion date', w.eval('a2Completion.finalExamCompletedAt'),
        '2026-04-01T10:00:00.000Z');
    eq('A · every topic is complete', w.eval('a2AllTopicsCompleted()'), true);
    eq('A · THE CERTIFICATE IS UNLOCKED', w.eval('a2CertificateUnlocked()'), true);
    w.eval('renderFinalExamEntry();');
    const c = card(w);
    ok(/final-exam-entry completed/.test(c.className), 'A · the completed card renders');
    ok(/KURS TUGATILDI/.test(c.innerHTML), 'A · badged as finished');
    ok(/92 ball/.test(c.innerHTML), 'A · showing the server score');
    ok(!!w.document.getElementById('a2ShowCertBtn'), 'A · the certificate button is present');
    w.eval('showA2Certificate();');
    const ov = w.document.getElementById('a2CertOverlay');
    ok(/show/.test(ov.className), 'A · and the certificate modal opens');
    eq('A · it names the learner', w.document.getElementById('a2CertName').textContent, 'Test Talaba');
    eq('A · it shows the server score out of 100',
        w.document.getElementById('a2CertScore').textContent, '92 / 100');
    ok(/2026/.test(w.document.getElementById('a2CertDate').textContent),
        `A · and the completion date (${w.document.getElementById('a2CertDate').textContent})`);
    w.close();
}
/* ------------------------------------------- B. LOCAL-ONLY PASS -> LOCKED */
{
    const w = boot({ completed: 16, remote: {}, local: {
        finalExamPassed: true, courseCompleted: true, certificateUnlocked: true,
        finalExamScore: 100, certificateNumber: 'UZD-A2-2026-999999',
        finalExamCompletedAt: '2020-01-01T00:00:00.000Z' } });
    await w.eval('loadUserData()');
    eq('B · the local cache was read', w.eval('a2Completion.finalExamScore'), 100);
    eq('B · but it is NOT Firebase-confirmed', w.eval('a2Completion.fbConfirmed'), false);
    eq('B · THE CERTIFICATE STAYS LOCKED', w.eval('a2CertificateUnlocked()'), false);
    w.eval('renderFinalExamEntry();');
    ok(!/final-exam-entry completed/.test(card(w).className),
        'B · the completed card is not rendered');
    ok(!/KURS TUGATILDI/.test(card(w).innerHTML), 'B · no "finished" badge');
    ok(!w.document.getElementById('a2ShowCertBtn'), 'B · no certificate button');
    w.eval('showA2Certificate();');
    ok(!/show/.test(w.document.getElementById('a2CertOverlay').className),
        'B · the modal refuses to open');
    eq('B · and no issuance was attempted', w.__issued.length, 0);
    w.close();
}
/* ------------------------------------------- C. 15/16 + REMOTE PASS -> LOCKED */
{
    const w = boot({ completed: 15, remote: { finalExamPassed: true, finalExamScore: 95 } });
    await w.eval('loadUserData()');
    eq('C · the pass IS Firebase-confirmed', w.eval('a2Completion.fbConfirmed'), true);
    eq('C · but 15/16 is not the course', w.eval('a2AllTopicsCompleted()'), false);
    eq('C · THE CERTIFICATE STAYS LOCKED', w.eval('a2CertificateUnlocked()'), false);
    w.eval('showA2Certificate();');
    ok(!/show/.test(w.document.getElementById('a2CertOverlay').className),
        'C · the modal refuses to open');
    eq('C · and no issuance was attempted', w.__issued.length, 0);
    w.close();
}
/* ------------------------------------------- D. REMOTE 79 / FAIL -> LOCKED */
{
    const w = boot({ completed: 16, remote: { finalExamPassed: false, finalExamScore: 79 } });
    await w.eval('loadUserData()');
    eq('D · a recorded 79 is hydrated', w.eval('a2Completion.finalExamScore'), 79);
    eq('D · it is not a pass', w.eval('a2Completion.finalExamPassed'), false);
    eq('D · and not confirmed', w.eval('a2Completion.fbConfirmed'), false);
    eq('D · THE CERTIFICATE STAYS LOCKED', w.eval('a2CertificateUnlocked()'), false);
    w.eval('renderFinalExamEntry();');
    const c = card(w);
    eq('D · the exam CTA is offered instead', c.className, 'final-exam-entry');
    ok(/YAKUNIY IMTIHON/.test(c.innerHTML), 'D · badged as the final exam');
    ok(!!w.document.getElementById('a2StartExamBtn'), 'D · with a start button');
    eq('D · and no issuance', w.__issued.length, 0);
    w.close();
}
/* ------------------------------------------- E. REMOTE 80 / PASS -> UNLOCKED */
{
    const w = boot({ completed: 16, remote: { finalExamPassed: true, finalExamScore: 80 } });
    await w.eval('loadUserData()');
    eq('E · 80 is the mark and it passes', w.eval('a2CertificateUnlocked()'), true);
    w.eval('renderFinalExamEntry();');
    ok(/final-exam-entry completed/.test(card(w).className), 'E · the completed card renders');
    ok(/80 ball/.test(card(w).innerHTML), 'E · showing 80');
    w.close();
}
/* ------------------------------------------- F. ISSUANCE ASKS FOR A2 */
{
    const w = boot({ completed: 16, remote: { finalExamPassed: true, finalExamScore: 88 } });
    await w.eval('loadUserData()');
    w.eval('renderFinalExamEntry();');
    await new Promise((r) => setTimeout(r, 30));
    eq('F · issuance was requested exactly once', w.__issued.length, 1);
    eq('F · for course A2 — not B1, not B2', w.__issued[0], 'A2');
    /* idempotent: asking again must not allocate a second number */
    await w.eval('ensureA2CertificateIssued()');
    await w.eval('ensureA2CertificateIssued()');
    eq('F · repeated calls still allocate ONE number', w.__issued.length, 1);
    eq('F · and the number is remembered', w.eval('a2Completion.certificateNumber'),
        'UZD-A2-2026-000042');
    eq('F · the modal id field was filled',
        w.document.getElementById('a2CertId').textContent, 'UZD-A2-2026-000042');
    w.close();
}
/* ------------------------------------------- G. REMOTE FIELDS HYDRATE */
{
    const w = boot({ completed: 16, remote: { finalExamPassed: true, finalExamScore: 84,
        finalExamCompletedAt: '2026-03-15T08:00:00.000Z',
        certificateNumber: 'UZD-A2-2026-000007', certificateUnlocked: true } });
    await w.eval('loadUserData()');
    eq('G · score hydrated', w.eval('a2Completion.finalExamScore'), 84);
    eq('G · date hydrated', w.eval('a2Completion.finalExamCompletedAt'), '2026-03-15T08:00:00.000Z');
    eq('G · certificate number hydrated', w.eval('a2Completion.certificateNumber'), 'UZD-A2-2026-000007');
    eq('G · certificateUnlocked hydrated', w.eval('a2Completion.certificateUnlocked'), true);
    w.eval('showA2Certificate();');
    eq('G · the modal shows the stored number',
        w.document.getElementById('a2CertId').textContent, 'UZD-A2-2026-000007');
    eq('G · an already-issued number is not reissued', w.__issued.length, 0);
    w.close();
}
/* ------------------------------------------- H. LOCAL CANNOT SET fbConfirmed */
{
    /* every shape a tampered cache could take */
    for (const [label, cache] of [
        ['passed true', { finalExamPassed: true }],
        ['passed + unlocked + number', { finalExamPassed: true, certificateUnlocked: true,
            certificateNumber: 'UZD-A2-2026-111111' }],
        ['fbConfirmed smuggled in', { finalExamPassed: true, fbConfirmed: true }],
        ['courseCompleted', { courseCompleted: true, finalExamPassed: true }],
        ['score 100', { finalExamScore: 100, finalExamPassed: true }]
    ]) {
        const w = boot({ completed: 16, remote: {}, local: cache });
        await w.eval('loadUserData()');
        eq(`H · local «${label}» cannot confirm`, w.eval('a2Completion.fbConfirmed'), false);
        eq(`H · and cannot unlock`, w.eval('a2CertificateUnlocked()'), false);
        w.close();
    }
}
/* ------------------------------------------- I. FIREBASE CAN SET fbConfirmed */
{
    const w = boot({ completed: 16, remote: { finalExamPassed: true } });
    await w.eval('loadUserData()');
    eq('I · the Firebase merge DOES confirm', w.eval('a2Completion.fbConfirmed'), true);
    eq('I · and unlocks', w.eval('a2CertificateUnlocked()'), true);
    w.close();
    /* The local merge runs AFTER the remote one, so what it can and cannot
       touch matters. The AUTHORITY fields are monotonic — a local `false`
       never clears a Firebase `true` — which is what the certificate rests on.

       The DISPLAY fields (score, date, number) are last-write-wins, shared
       identically by A1, A2, B1 and B2. A learner who edits their own cache can
       therefore make their own screen show a different score than the one on
       their certificate. That is cosmetic and visible only to them: the issued
       certificate and the public registry both carry the server's score. It is
       pinned here as the CURRENT platform-wide behaviour rather than silently
       diverging A2 from the other three courses. */
    const w2 = boot({ completed: 16, remote: { finalExamPassed: true, finalExamScore: 91 },
        local: { finalExamPassed: false, finalExamScore: 10 } });
    await w2.eval('loadUserData()');
    eq('I · a stale local cache cannot revoke a confirmed pass',
        w2.eval('a2CertificateUnlocked()'), true);
    eq('I · nor clear fbConfirmed', w2.eval('a2Completion.fbConfirmed'), true);
    eq('I · nor clear finalExamPassed', w2.eval('a2Completion.finalExamPassed'), true);
    eq('I · display score is last-write-wins (shared A1/A2/B1/B2 behaviour)',
        w2.eval('a2Completion.finalExamScore'), 10);
    ok(/if \(src\.finalExamPassed\) a2Completion\.finalExamPassed = true;/.test(SRC),
        'I · and the authority fields are monotonic by construction');
    w2.close();
}
/* ------------------------------------------- J. NO CROSS-COURSE COPY/PASTE */
{
    const block = SRC.slice(SRC.indexOf('let a2Completion = {'),
                            SRC.indexOf('function a2LegacyScope()'));
    eq('J · the graduation block never says B1', /\bB1\b|b1[-_]|B1Completion|b1Completion/.test(block), false);
    eq('J · nor B2', /\bB2\b|b2[-_]|B2Completion|b2Completion/.test(block), false);
    eq('J · nor A1', /\bA1\b|a1[-_]|A1Completion|a1Completion/.test(block), false);
    ok(/a2-final-exam\.html/.test(block), 'J · the exam link is the A2 exam');
    eq('J · and no other course exam is linked',
        /(a1|b1|b2)-final-exam\.html/.test(block), false);
    ok(/window\.issueCertificate\('A2'\)/.test(block), 'J · issuance asks for A2');
    ok(/localStorage\.getItem\('a2_completion_' \+ uid\)/.test(block),
        'J · the cache key is A2 and user-scoped');
    /* the completion requirement is derived from the syllabus, not typed */
    ok(/courseData\.topics/.test(block),
        'J · the topic requirement comes from courseData, not a hardcoded number');
    eq('J · no foreign topic count is hardcoded in the block',
        /\b(12|20) ta mavzu/.test(block), false);
}
/* ------------------------------------------- K. DEGRADED SERVER FAILS CLOSED */
{
    const w = boot({ completed: 16, remoteThrows: true,
        local: { finalExamPassed: true, certificateUnlocked: true, finalExamScore: 100 } });
    await w.eval('loadUserData()');
    eq('K · a failed remote read cannot confirm', w.eval('a2Completion.fbConfirmed'), false);
    eq('K · so the certificate stays locked', w.eval('a2CertificateUnlocked()'), false);
    w.close();
    const w2 = boot({ completed: 16, noHelpers: true,
        local: { finalExamPassed: true, certificateUnlocked: true } });
    await w2.eval('loadUserData()');
    eq('K · missing sync helpers cannot confirm either', w2.eval('a2Completion.fbConfirmed'), false);
    eq('K · certificate locked', w2.eval('a2CertificateUnlocked()'), false);
    w2.close();
}
/* ------------------------------------------- L. PRIVILEGED BYPASS PRESERVED */
{
    for (const role of ['developer', 'admin']) {
        const w = boot({ completed: 0, role, remote: {} });
        await w.eval('loadUserData()');
        eq(`L · ${role} keeps the testing bypass`, w.eval('a2CertificateUnlocked()'), true);
        w.close();
    }
    const w = boot({ completed: 0, role: 'customer', remote: {} });
    await w.eval('loadUserData()');
    eq('L · a customer does not', w.eval('a2CertificateUnlocked()'), false);
    w.close();
}

console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ A2 CERTIFICATE UI: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ A2 CERTIFICATE UI: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
})().catch((e) => { console.error(e); process.exit(2); });
