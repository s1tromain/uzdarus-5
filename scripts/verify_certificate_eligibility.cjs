#!/usr/bin/env node
/**
 * verify_certificate_eligibility.cjs — who may be issued a certificate.
 *
 * issueCertificate() is what turns a flag into a real, numbered, publicly
 * verifiable certificate, so it is tested against a fake Firestore rather than
 * by reading its source. The fixtures below are the cases that matter:
 *
 *   a pass flag with an unfinished course        — must be refused
 *   a finished course with no pass               — must be refused
 *   both                                         — issued
 *   both, twice                                  — the same number, once
 *   developer/admin                              — existing testing bypass kept
 *
 * The first case is the one that motivated the second condition: the exam
 * endpoint refuses an unfinished course today, but a finalExamPassed written
 * before that gate existed would otherwise still certify.
 */
'use strict';
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

console.log('\n=== CERTIFICATE ELIGIBILITY ===');

/* ---------------- a Firestore small enough to reason about ---------------- */
function makeDb(userData) {
    const store = {
        user: JSON.parse(JSON.stringify(userData)),
        certificates: {},
        registry: {},
        counters: {}
    };
    const userRef = { __kind: 'user' };
    const counterRef = { __kind: 'counter' };
    const certCollection = {
        doc: (id) => ({ __kind: 'cert', id })
    };
    userRef.collection = () => certCollection;

    const merge = (target, src) => {
        Object.keys(src).forEach((k) => {
            if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])
                && target[k] && typeof target[k] === 'object') merge(target[k], src[k]);
            else target[k] = src[k];
        });
    };

    const t = {
        get: async (ref) => {
            if (ref.__kind === 'user') {
                return { exists: true, data: () => store.user };
            }
            if (ref.__kind === 'counter') {
                return { exists: true, data: () => store.counters };
            }
            if (ref.__kind === 'cert') {
                const c = store.certificates[ref.id];
                return { exists: !!c, data: () => c };
            }
            return { exists: false, data: () => null };
        },
        set: (ref, value, opts) => {
            if (ref.__kind === 'user') {
                if (opts && opts.merge) merge(store.user, value); else store.user = value;
            } else if (ref.__kind === 'counter') {
                merge(store.counters, value);
            } else if (ref.__kind === 'cert') {
                store.certificates[ref.id] = value;
            } else if (ref.__kind === 'registry') {
                store.registry[ref.id] = value;
            }
        }
    };

    const adminDb = {
        collection: (name) => {
            if (name === 'users') return { doc: () => userRef };
            if (name === 'certificateRegistry') {
                /* getRegistryCertificate() reads OUTSIDE a transaction, so the
                   registry ref needs its own get() — the public verification
                   path does not go through runTransaction. */
                return {
                    doc: (id) => ({
                        __kind: 'registry', id,
                        get: async () => {
                            const r = store.registry[id];
                            return { exists: !!r, data: () => r };
                        }
                    })
                };
            }
            return { doc: (id) => ({ __kind: name, id }) };
        },
        doc: () => counterRef,
        runTransaction: async (fn) => fn(t)
    };
    return { adminDb, store };
}

/* Stub the Admin SDK before certificates.js imports it. */
let CURRENT = null;
const realResolve = Module._resolveFilename;
const stubPath = path.join(ROOT, 'api/_firebaseAdmin.js');
Module._resolveFilename = realResolve;

(async () => {
    /* certificates.js is ESM; give it a stubbed initAdmin through a loader hook
       is heavy, so instead drive it via a tiny shim module written on the fly. */
    const { pathToFileURL } = require('url');
    const fs = require('fs');
    const os = require('os');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'certtest-'));

    /* Copy certificates.js and point its admin import at a local stub. */
    const src = fs.readFileSync(path.join(ROOT, 'api/_lib/certificates.js'), 'utf8')
        .replace("import { initAdmin } from '../_firebaseAdmin.js';",
                 "import { initAdmin } from './admin-stub.js';")
        .replace("import { COURSE_CANON } from './course-canon.js';",
                 `import { COURSE_CANON } from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'api/_lib/course-canon.js')).href)};`);
    fs.writeFileSync(path.join(tmp, 'certificates.mjs'), src);
    fs.writeFileSync(path.join(tmp, 'admin-stub.js'),
        `export function initAdmin() { return globalThis.__CERT_ADMIN; }`);

    const mod = await import(pathToFileURL(path.join(tmp, 'certificates.mjs')).href);

    const FieldValue = { serverTimestamp: () => '<ts>' };
    const Timestamp = { fromDate: (d) => ({ __ts: d.toISOString() }) };

    function run(userData, opts = {}) {
        const { adminDb, store } = makeDb(userData);
        globalThis.__CERT_ADMIN = { adminDb, FieldValue, Timestamp };
        CURRENT = store;
        return mod.issueCertificate({
            uid: 'u1', course: opts.course || 'A2',
            profile: userData, isPrivileged: opts.isPrivileged
        }).then((r) => ({ r, store }), (e) => ({ error: e, store }));
    }

    const user = (over) => ({
        displayName: 'Test Talaba', role: 'user',
        courses: { A2: Object.assign({}, over) }
    });
    const ids = (n) => Array.from({ length: n }, (_, i) => i + 1);

    /* ---- 1. CERT_COURSES contract ---- */
    eq('A2 is certifiable', mod.isCertifiableCourse('A2'), true);
    eq('A1 is certifiable', mod.isCertifiableCourse('A1'), true);
    eq('B1 is certifiable', mod.isCertifiableCourse('B1'), true);
    eq('B2 is still excluded', mod.isCertifiableCourse('B2'), false);
    eq('the three certifiable courses', Object.keys(mod.CERT_COURSES).join(','), 'A1,A2,B1');

    /* ---- 2. THE LEGACY CASE: pass flag, unfinished course ---- */
    {
        const { error, store } = await run(user({ finalExamPassed: true, completedTopics: ids(15) }));
        ok(!!error, 'A2 pass flag + 15/16 topics: issuance REFUSED');
        eq('and refused as forbidden', error && error.statusCode, 403);
        eq('no certificate was written', Object.keys(store.certificates).length, 0);
        eq('no registry record was written', Object.keys(store.registry).length, 0);
        ok(!store.user.courses.A2.certificateNumber, 'and no number was stamped on the user');
    }

    /* ---- 3. finished course, no pass ---- */
    {
        const { error, store } = await run(user({ finalExamPassed: false, completedTopics: ids(16) }));
        ok(!!error, 'A2 16/16 topics but exam not passed: issuance REFUSED');
        eq('no certificate was written', Object.keys(store.certificates).length, 0);
    }
    {
        const { error } = await run(user({ completedTopics: ids(16) }));
        ok(!!error, 'A2 16/16 topics with no exam record at all: REFUSED');
    }

    /* ---- 4. THE LEGITIMATE CASE ---- */
    let issuedNumber = null;
    {
        const { r, error, store } = await run(user({
            finalExamPassed: true, finalExamScore: 92, completedTopics: ids(16)
        }));
        ok(!error, 'A2 pass + 16/16: issuance ALLOWED' + (error ? ' — ' + error.message : ''));
        ok(r && r.number, 'a certificate number was allocated');
        issuedNumber = r && r.number;
        ok(/^UZD-A2-\d{4}-\d{6}$/.test(issuedNumber || ''),
            `the number follows the shared format (${issuedNumber})`);
        eq('the certificate names the course', r.certificate.course, 'A2');
        eq('and the level', r.certificate.level, 'A2');
        eq('and carries the server score', r.certificate.score, 92);
        eq('and the learner name from the profile', r.certificate.userName, 'Test Talaba');
        eq('a registry record exists for public verification',
            Object.keys(store.registry).length, 1);
        eq('the registry record matches the number',
            store.registry[issuedNumber].certificateNumber, issuedNumber);
        eq('the user document was stamped',
            store.user.courses.A2.certificateNumber, issuedNumber);
    }

    /* ---- 5. IDEMPOTENCY ---- */
    {
        const data = user({ finalExamPassed: true, finalExamScore: 92, completedTopics: ids(16) });
        const { adminDb, store } = makeDb(data);
        globalThis.__CERT_ADMIN = { adminDb, FieldValue, Timestamp };
        const first = await mod.issueCertificate({ uid: 'u1', course: 'A2', profile: data });
        const second = await mod.issueCertificate({ uid: 'u1', course: 'A2', profile: data });
        eq('the second issue returns the same number', second.number, first.number);
        eq('and reports it was already issued', second.alreadyIssued, true);
        eq('only one certificate document exists', Object.keys(store.certificates).length, 1);
        eq('only one registry record exists', Object.keys(store.registry).length, 1);
    }

    /* ---- 6. PRIVILEGED BYPASS PRESERVED ---- */
    {
        const { r, error } = await run(
            { displayName: 'Dev', role: 'developer', courses: { A2: {} } },
            { isPrivileged: true });
        ok(!error, 'developer/admin may still issue for testing');
        ok(r && r.number, 'and gets a real number');
    }
    {
        const { error } = await run(
            { displayName: 'Dev', role: 'developer', courses: { A2: {} } },
            { isPrivileged: false });
        ok(!!error, 'the same account without the privileged flag is refused');
    }

    /* ---- 7. THE GATE IS GENERIC, NOT A2-ONLY ---- */
    {
        const b1 = { displayName: 'X', role: 'user',
                     courses: { B1: { finalExamPassed: true, completedTopics: ids(19) } } };
        const { error } = await run(b1, { course: 'B1' });
        ok(!!error, 'B1 pass flag + 19/20 topics: REFUSED (canon says 20)');
    }
    {
        const b1 = { displayName: 'X', role: 'user',
                     courses: { B1: { finalExamPassed: true, completedTopics: ids(20) } } };
        const { error } = await run(b1, { course: 'B1' });
        ok(!error, 'B1 pass + 20/20: allowed');
    }
    {
        const a1 = { displayName: 'X', role: 'user',
                     courses: { A1: { finalExamPassed: true, completedTopics: ids(11) } } };
        const { error } = await run(a1, { course: 'A1' });
        ok(!!error, 'A1 pass flag + 11/12 topics: REFUSED (canon says 12)');
    }
    {
        const a1 = { displayName: 'X', role: 'user',
                     courses: { A1: { finalExamPassed: true, completedTopics: ids(12) } } };
        const { error } = await run(a1, { course: 'A1' });
        ok(!error, 'A1 pass + 12/12: allowed');
    }
    {
        /* duplicates must not be counted as coverage */
        const dup = user({ finalExamPassed: true, completedTopics: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1] });
        const { error } = await run(dup);
        ok(!!error, 'sixteen copies of topic 1 do not count as sixteen topics');
    }
    {
        const oob = user({ finalExamPassed: true,
                           completedTopics: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,99] });
        const { error } = await run(oob);
        ok(!!error, 'an out-of-range topic id does not pad the count');
    }

    /* ---- 8. THE PUBLIC VERIFICATION PATH, END TO END ----
       Issuing is only half of a certificate; a certificate nobody can verify is
       not one. The same registry record the issuer writes is read back through
       getRegistryCertificate(), which is exactly what /api/certificate?action=
       verify calls. No production API is touched. */
    {
        const data = user({ finalExamPassed: true, finalExamScore: 88, completedTopics: ids(16) });
        const { adminDb, store } = makeDb(data);
        globalThis.__CERT_ADMIN = { adminDb, FieldValue, Timestamp };
        const issued = await mod.issueCertificate({ uid: 'u1', course: 'A2', profile: data });

        const found = await mod.getRegistryCertificate(issued.number);
        ok(!!found, 'a legitimately issued A2 certificate resolves through the registry');
        eq('verification reports the course', found.course, 'A2');
        eq('verification reports the level', found.level, 'A2');
        eq('verification reports the number', found.certificateNumber, issued.number);
        eq('verification reports the learner', found.userName, 'Test Talaba');
        eq('verification reports the recorded score', found.score, 88);
        eq('verification reports it active', found.status, 'active');

        /* the lookup is case-insensitive on the number, as the endpoint upcases */
        const lower = await mod.getRegistryCertificate(issued.number.toLowerCase());
        ok(!!lower, 'a lower-case certificate number still resolves');

        const missing = await mod.getRegistryCertificate('UZD-A2-2099-999999');
        ok(!missing, 'an unknown certificate number does NOT resolve');
        const blank = await mod.getRegistryCertificate('');
        ok(!blank, 'a blank certificate number does not resolve');
        eq('the registry holds exactly the one issued record',
            Object.keys(store.registry).length, 1);
    }

    /* ---- 9. THE ENDPOINT AND PAGE ARE WIRED TO THAT PATH ---- */
    {
        const api = fs.readFileSync(path.join(ROOT, 'api/certificate.js'), 'utf8');
        ok(/getRegistryCertificate\(number\)/.test(api),
            'the verify action reads the registry');
        ok(/validActions: \['issue', 'verify'\]/.test(api),
            'the endpoint exposes issue and verify');
        ok(/return sendJson\(res, 200, \{ found: false \}\)/.test(api),
            'an unknown number answers found:false rather than leaking an error');
        ok(/requireSession\(req\)/.test(api),
            'issuing still requires a session');
        {
            /* the verify handler must NOT sit behind a session — it is public */
            const vh = api.slice(api.indexOf('async function handleVerify'),
                                 api.indexOf('export default'));
            ok(!/requireSession/.test(vh), 'verification stays public');
            ok(/verifyLimiter/.test(vh), 'and is rate limited');
        }
        const page = fs.readFileSync(path.join(ROOT, 'verify-certificate.html'), 'utf8');
        ok(/action=verify/.test(page), 'the public page calls the verify action');
        ok(/api\/certificate/.test(page), 'against the shared certificate endpoint');
    }

    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}

    console.log('='.repeat(60));
    if (fail) {
        console.log(`  ❌ CERTIFICATE ELIGIBILITY: ${fail} failed / ${pass + fail}\n`);
        failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
        console.log('='.repeat(60) + '\n');
        process.exit(1);
    }
    console.log(`  ✅ CERTIFICATE ELIGIBILITY: ${pass}/${pass} passed`);
    console.log('='.repeat(60) + '\n');
})();
