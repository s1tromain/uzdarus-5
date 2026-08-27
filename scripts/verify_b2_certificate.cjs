#!/usr/bin/env node
/**
 * verify_b2_certificate.cjs — the B2 graduation screen and the B2 certificate.
 *
 * The exam suite next door proves the PAPER is sound and the server grades it.
 * This one proves the two screens either side of it behave:
 *
 *   THE ENTRY — b2-course.html shows a locked card until every topic is done,
 *   an exam card once they are, and a completed card only after the SERVER
 *   confirmed a pass. It is a card at the bottom of the course, not a
 *   seventeenth topic.
 *
 *   THE CERTIFICATE — it opens only on a Firebase-confirmed pass with the whole
 *   course finished. A pass typed into localStorage must not open it; neither
 *   must a confirmed pass with a topic still missing. Issuance is idempotent:
 *   asking twice must not allocate two numbers.
 *
 * The functions under test are LIFTED FROM THE SHIPPED PAGE rather than
 * re-implemented here, so a change to the page that breaks the gate breaks this
 * suite too. Nothing is asserted about a copy of the logic.
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

const COURSE_SRC = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-course.html'), 'utf8');
const EXAM_SRC = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-final-exam.html'), 'utf8');

console.log('\n=== B2 CERTIFICATE ===');

/* ---- the block under test, sliced out of the real page ---- */
const BLOCK_START = COURSE_SRC.indexOf('        let b2Completion = {');
const BLOCK_END = COURSE_SRC.indexOf('        function getTopicIcon(id) {');
ok(BLOCK_START > 0 && BLOCK_END > BLOCK_START, 'the graduation block was found in the page');
const BLOCK = COURSE_SRC.slice(BLOCK_START, BLOCK_END);
ok(/function renderFinalExamEntry\(\)/.test(BLOCK), 'it contains the entry renderer');
ok(/function showB2Certificate\(\)/.test(BLOCK), 'and the certificate opener');

/* ---- the markup those functions render into, also from the page ---- */
const MARKUP = COURSE_SRC.slice(
    COURSE_SRC.indexOf('<section class="content-section" id="finalExamEntry"'),
    COURSE_SRC.indexOf('<script defer src="../global-nav.js">'));
ok(/id="finalExamEntryCard"/.test(MARKUP), 'the entry card element ships with the page');
ok(/id="b2CertOverlay"/.test(MARKUP), 'and so does the certificate overlay');

const ids = (n) => Array.from({ length: n }, (_, i) => i + 1);

/** Boot the lifted block over a fixture. Returns the sandbox window. */
function boot({ completed = 16, role = 'user', remote = null, local = null, topics = 16 } = {}) {
    const dom = new JSDOM(`<!doctype html><body>${MARKUP}</body>`,
        { runScripts: 'outside-only', url: 'https://x.test/paid-courses/b2-course.html' });
    const w = dom.window;
    const mem = {};
    Object.defineProperty(w, 'localStorage', {
        value: {
            getItem: (k) => (k in mem ? mem[k] : null),
            setItem: (k, v) => { mem[k] = String(v); },
            removeItem: (k) => { delete mem[k]; }
        }, configurable: true
    });
    w.__mem = mem;
    w.currentUser = { id: 'u1', name: 'Test Talaba', role: role };
    w.currentUserId = 'u1';
    w.userProgress = {};
    ids(completed).forEach((id) => { w.userProgress[id] = { completed: true }; });
    w.courseData = { topics: ids(topics).map((id) => ({ id: id })) };
    w.b2IsPrivileged = () => {
        const r = String((w.currentUser && w.currentUser.role) || '').toLowerCase();
        return r === 'developer' || r === 'admin';
    };
    if (local) mem['b2_completion_u1'] = JSON.stringify(local);
    w.__issueCalls = [];
    w.issueCertificate = async (course) => {
        w.__issueCalls.push(course);
        return { certificateNumber: 'UZD-B2-2026-000042',
                 certificateData: { date: '2026-05-01T00:00:00.000Z' } };
    };
    w.eval(BLOCK.replace(/^\s*let /gm, '    var ').replace(/^\s*const /gm, '    var '));
    if (remote) w.eval('mergeB2Completion(' + JSON.stringify(remote) + ', true);');
    if (local) w.eval('mergeB2Completion(readLocalB2Completion(), false);');
    return w;
}
const card = (w) => w.document.getElementById('finalExamEntryCard');

/* ------------------------------------------------- 1. THE THREE ENTRY STATES */
{
    /* LOCKED — the course is not finished. */
    const w = boot({ completed: 3 });
    w.eval('renderFinalExamEntry();');
    const c = card(w);
    ok(/final-exam-entry locked/.test(c.className), 'unfinished course: the card is LOCKED');
    ok(/QULFLANGAN/.test(c.innerHTML), 'and says so');
    ok(/3 \/ 16 mavzu tugatilgan/.test(c.innerHTML), 'and shows real progress (3/16)');
    const btn = c.querySelector('button');
    eq('the start button is disabled', btn.disabled, true);
    ok(/locked/.test(btn.className), 'and styled as locked');
    ok(!/b2ShowCertBtn/.test(c.innerHTML), 'no certificate button is offered');
    eq('no certificate was requested', w.__issueCalls.length, 0);
    eq('the certificate is not unlocked', w.eval('b2CertificateUnlocked()'), false);
    w.close();
}
{
    /* AVAILABLE — every topic done, exam not yet passed. */
    const w = boot({ completed: 16 });
    w.eval('renderFinalExamEntry();');
    const c = card(w);
    eq('finished course, no pass: the card is the exam CTA', c.className, 'final-exam-entry');
    ok(/YAKUNIY IMTIHON/.test(c.innerHTML), 'and is badged as the final exam');
    ok(/16 ta mavzu bo/.test(c.innerHTML), 'it names the sixteen topics');
    ok(/100 ta baholanadigan javob/.test(c.innerHTML), 'it states the hundred graded answers');
    ok(/80%/.test(c.innerHTML), 'and the 80% pass mark');
    ok(/120 daqiqa/.test(c.innerHTML), 'and the 120-minute limit');
    eq('ten group lines are listed', (c.innerHTML.match(/<li>• [^⏱]/g) || []).length, 10);
    const start = w.document.getElementById('b2StartExamBtn');
    ok(!!start, 'the start button exists');
    eq('and is enabled', start.disabled, false);
    ok(typeof start.onclick === 'function', 'and is wired');
    eq('no certificate was requested', w.__issueCalls.length, 0);
    eq('the certificate is still locked', w.eval('b2CertificateUnlocked()'), false);
    ok(!/b2ShowCertBtn/.test(c.innerHTML), 'and no certificate button is shown');
    w.close();
}
{
    /* COMPLETED — server-confirmed pass, whole course done. */
    const w = boot({ completed: 16,
        remote: { finalExamPassed: true, finalExamScore: 88,
                  finalExamCompletedAt: '2026-05-01T10:00:00.000Z', certificateUnlocked: true } });
    w.eval('renderFinalExamEntry();');
    const c = card(w);
    ok(/final-exam-entry completed/.test(c.className), 'confirmed pass: the card is COMPLETED');
    ok(/KURS TUGATILDI/.test(c.innerHTML), 'and says the course is finished');
    ok(/88 ball/.test(c.innerHTML), 'it shows the server score');
    ok(!!w.document.getElementById('b2ShowCertBtn'), 'the certificate button is offered');
    ok(!!w.document.getElementById('b2RetakeExamBtn'), 'and the exam can be retaken');
    eq('the certificate is unlocked', w.eval('b2CertificateUnlocked()'), true);
    eq('issuance was requested exactly once', w.__issueCalls.length, 1);
    eq('for course B2', w.__issueCalls[0], 'B2');
    w.close();
}

/* ------------------------------------------------- 2. THE GATE HOLDS */
{
    /* A PASS TYPED INTO localStorage MUST NOT CERTIFY.
       This is the whole reason fbConfirmed exists: the completion cache is
       written by the exam page for rendering, and anyone can write it. */
    const w = boot({ completed: 16,
        local: { finalExamPassed: true, courseCompleted: true, certificateUnlocked: true,
                 finalExamScore: 100 } });
    eq('a localStorage-only pass is seen', w.eval('b2Completion.finalExamPassed'), true);
    eq('but it is NOT Firebase-confirmed', w.eval('b2Completion.fbConfirmed'), false);
    eq('so the certificate stays locked', w.eval('b2CertificateUnlocked()'), false);
    w.eval('renderFinalExamEntry();');
    ok(!/final-exam-entry completed/.test(card(w).className),
        'and the completed card is not shown');
    w.eval('showB2Certificate();');
    ok(!/show/.test(w.document.getElementById('b2CertOverlay').className),
        'and the certificate modal refuses to open');
    eq('no certificate was requested', w.__issueCalls.length, 0);
    w.close();
}
{
    /* A CONFIRMED PASS WITH A TOPIC MISSING MUST NOT CERTIFY.
       A finalExamPassed written before the completion gate existed would
       otherwise still certify — the same legacy case the server refuses. */
    const w = boot({ completed: 15, remote: { finalExamPassed: true, finalExamScore: 95 } });
    eq('the pass is Firebase-confirmed', w.eval('b2Completion.fbConfirmed'), true);
    eq('but 15/16 topics is not the course', w.eval('b2AllTopicsCompleted()'), false);
    eq('so the certificate stays locked', w.eval('b2CertificateUnlocked()'), false);
    w.eval('showB2Certificate();');
    ok(!/show/.test(w.document.getElementById('b2CertOverlay').className),
        'and the modal refuses to open');
    w.close();
}
{
    /* NO PASS AT ALL, whole course done. */
    const w = boot({ completed: 16, remote: { finalExamScore: 79 } });
    eq('a recorded score is not a pass', w.eval('b2CertificateUnlocked()'), false);
    w.close();
}
{
    /* THE PRIVILEGED BYPASS IS PRESERVED, as on every other course page. */
    ['developer', 'admin'].forEach((role) => {
        const w = boot({ completed: 0, role });
        eq(`${role} bypasses the completion gate`, w.eval('b2AllTopicsCompleted()'), true);
        eq(`${role} may open the certificate for testing`, w.eval('b2CertificateUnlocked()'), true);
        w.close();
    });
    const w = boot({ completed: 0, role: 'customer' });
    eq('a customer does not', w.eval('b2CertificateUnlocked()'), false);
    w.close();
}

/* ------------------------------------------------- 3. ISSUANCE IS IDEMPOTENT */
{
    const w = boot({ completed: 16,
        remote: { finalExamPassed: true, finalExamScore: 88 } });
    return (async () => {
        await w.eval('ensureB2CertificateIssued()');
        await w.eval('ensureB2CertificateIssued()');
        await w.eval('ensureB2CertificateIssued()');
        eq('three calls allocate ONE number', w.__issueCalls.length, 1);
        eq('and the number is remembered', w.eval('b2Completion.certificateNumber'),
            'UZD-B2-2026-000042');
        eq('the issue date came back with it', w.eval('b2Completion.finalExamCompletedAt'),
            '2026-05-01T00:00:00.000Z');
        eq('the modal id field was filled',
            w.document.getElementById('b2CertId').textContent, 'UZD-B2-2026-000042');

        /* A NUMBER ALREADY ON THE RECORD IS NOT RE-REQUESTED. */
        const w2 = boot({ completed: 16,
            remote: { finalExamPassed: true, finalExamScore: 88,
                      certificateNumber: 'UZD-B2-2026-000007' } });
        await w2.eval('ensureB2CertificateIssued()');
        eq('an already-issued number is reused, not reissued', w2.__issueCalls.length, 0);
        eq('and it is what the modal shows',
            w2.document.getElementById('b2CertId').textContent, 'UZD-B2-2026-000007');

        /* ---- the modal contents ---- */
        const w3 = boot({ completed: 16,
            remote: { finalExamPassed: true, finalExamScore: 88,
                      finalExamCompletedAt: '2026-05-01T10:00:00.000Z',
                      certificateNumber: 'UZD-B2-2026-000007' } });
        w3.eval('showB2Certificate();');
        const d = w3.document;
        ok(/show/.test(d.getElementById('b2CertOverlay').className), 'the modal opens');
        eq('it names the learner', d.getElementById('b2CertName').textContent, 'Test Talaba');
        eq('it shows the server score out of 100',
            d.getElementById('b2CertScore').textContent, '88 / 100');
        ok(/2026/.test(d.getElementById('b2CertDate').textContent),
            `it shows the completion date (${d.getElementById('b2CertDate').textContent})`);
        eq('and the certificate number',
            d.getElementById('b2CertId').textContent, 'UZD-B2-2026-000007');
        ok(/B2 Daraja/.test(MARKUP), 'the certificate is titled for B2');
        ok(/16 ta mavzu va yakuniy imtihonni/.test(MARKUP),
            'and its wording names sixteen topics and the final exam');
        w.close(); w2.close(); w3.close();

        /* --------------------------------------- 4. THE SHARED SERVER REGISTRY */
        {
            const certs = await import('file://' + path.join(ROOT, 'api/_lib/certificates.js'));
            eq('B2 is certifiable', certs.isCertifiableCourse('B2'), true);
            eq('B2 declares its level', certs.CERT_COURSES.B2.level, 'B2');
            eq('B2 declares its title', certs.CERT_COURSES.B2.courseTitle, 'B2 Daraja — Rus tili');
            eq('all four courses can certify',
                Object.keys(certs.CERT_COURSES).join(','), 'A1,A2,B1,B2');
            /* Every certifiable course must exist in the canon, or issuance
               cannot count its topics. */
            const canon = await import('file://' + path.join(ROOT, 'api/_lib/course-canon.js'));
            Object.keys(certs.CERT_COURSES).forEach((c) => {
                ok(!!canon.COURSE_CANON[c], `${c} exists in COURSE_CANON`);
            });
            eq('B2 counts 16 topics there', canon.COURSE_CANON.B2.totalTopics, 16);
        }

        /* --------------------------------------- 5. THE TWO PAGES AGREE */
        {
            /* The exam page writes the completion cache the course page reads.
               A mismatch here would silently strand every graduate. */
            const examKey = EXAM_SRC.match(/var COMPLETION_KEY = '([a-z0-9_]+)' \+ USER_ID;/)[1];
            eq('the exam page writes b2_completion_<uid>', examKey, 'b2_completion_');
            ok(COURSE_SRC.includes("localStorage.getItem('b2_completion_' + uid)"),
                'and the course page reads exactly that key');
            /* The exam page's cache fields are the ones the course page merges. */
            const written = ['finalExamPassed', 'courseCompleted', 'certificateUnlocked',
                             'finalExamScore', 'finalExamCompletedAt'];
            written.forEach((f) => {
                ok(new RegExp(f).test(EXAM_SRC), `the exam page writes ${f}`);
                ok(new RegExp('src\\.' + f).test(COURSE_SRC), `and the course page merges ${f}`);
            });
            ok(/window\.location\.href = 'b2-final-exam\.html'/.test(COURSE_SRC),
                'the entry card opens the B2 exam page');
            ok(/b2-course\.html#finalExamEntry/.test(EXAM_SRC),
                'and the exam returns to that same entry block');
            /* B2 ENDS AT 16. The exam is a card under the course, not a topic. */
            ok(!/generateLockedTopics\(1[6-9]\)|generateLockedTopics\(2\d\)/.test(COURSE_SRC),
                'no locked topic shell was left behind the exam');
            const entry = COURSE_SRC.slice(COURSE_SRC.indexOf('id="finalExamEntry"'));
            ok(!/topic-btn/.test(entry.slice(0, 800)),
                'the entry block is not rendered as a topic button');
            ok(/id="topicsGrid"/.test(COURSE_SRC), 'topics still render into their own grid');
        }

        console.log('='.repeat(60));
        if (fail) {
            console.log(`  ❌ B2 CERTIFICATE: ${fail} failed / ${pass + fail}\n`);
            failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
            console.log('='.repeat(60) + '\n');
            process.exit(1);
        }
        console.log(`  ✅ B2 CERTIFICATE: ${pass}/${pass} passed`);
        console.log('='.repeat(60) + '\n');
    })();
}
