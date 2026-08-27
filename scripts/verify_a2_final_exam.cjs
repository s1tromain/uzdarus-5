#!/usr/bin/env node
/**
 * verify_a2_final_exam.cjs — the A2 final exam and the A2 certificate path.
 *
 * The exam is the thing a certificate rests on, so this suite pins three
 * separate contracts:
 *
 *   THE BANK — exactly 100 graded items, every one of the sixteen A2 topics
 *   represented, 6 or 7 questions each, no duplicate prompt, no free-answer
 *   item smuggled into an auto-graded certificate exam.
 *
 *   THE PAGE — the gate is 16 topics (not B1's 20), the draft is scoped to the
 *   user, the deadline survives a reload, and nothing still says B1.
 *
 *   THE SERVER — the answers are graded by api/_lib/exam-scoring.js against
 *   api/_lib/course-canon.js, not by the browser; the endpoint refuses a
 *   submission from someone who has not finished the course; and the
 *   certificate issues only on the server's own finalExamPassed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const REL = 'paid-courses/a2-final-exam.html';
const SRC = fs.readFileSync(path.join(ROOT, REL), 'utf8');
const DATA = JSON.parse(SRC.match(/var FINAL_EXAM_DATA = (\[[\s\S]*?\]);/)[1]);
const ITEMS = DATA.flatMap((g) => g.items || []);

console.log('\n=== A2 FINAL EXAM ===');

/* The page's own normaliser, lifted from the page so the test cannot drift. */
const punct = SRC.match(/function normalizeExamText[\s\S]*?\.replace\(\/\[([^\]]*)\]\/g, ' '\)/)[1];
const norm = (v) => String(v == null ? '' : v).toLowerCase().replace(/ё/g, 'е')
    .replace(new RegExp('[' + punct + ']', 'g'), ' ').replace(/\s+/g, ' ').trim();
const matches = (given, expected) => {
    const nv = norm(given);
    if (!nv) return false;
    return Array.isArray(expected)
        ? expected.some((x) => norm(x) === nv)
        : norm(expected) === nv;
};

/* --------------------------------------------------- 1. THE BANK */
{
    eq('exactly 100 graded questions', ITEMS.length, 100);
    eq('five sections', DATA.length, 5);
    eq('section codes', DATA.map((g) => g.section).join(''), 'ABCDE');
    eq('section sizes', DATA.map((g) => g.items.length).join(','), '40,20,10,10,20');
    ok(DATA.every((g) => g.title && g.subtitle), 'every section is titled');

    /* NO OPEN ITEMS. An auto-graded certificate exam cannot contain a prompt
       with no right answer — the A2 lessons have genuine free:true items and
       none of them were copied in. */
    eq('no free-answer item', ITEMS.filter((i) => i.free).length, 0);
    eq('every item has a key', ITEMS.filter((i) => {
        const a = i.answer;
        if (a == null) return true;
        if (Array.isArray(a)) return a.filter((x) => String(x || '').trim()).length === 0;
        return String(a).trim() === '';
    }).length, 0);

    /* TOPIC COVERAGE — the contract this exam exists to keep. */
    const perTopic = {};
    ITEMS.forEach((i) => { perTopic[i.sourceTopic] = (perTopic[i.sourceTopic] || 0) + 1; });
    for (let t = 1; t <= 16; t++) {
        const n = perTopic[t] || 0;
        ok(n > 0, `topic ${t} contributes exam questions (${n})`);
        ok(n === 6 || n === 7, `topic ${t} quota is 6 or 7 (${n})`);
    }
    eq('sixteen topics represented, no more', Object.keys(perTopic).length, 16);
    eq('quotas sum to 100', Object.values(perTopic).reduce((a, b) => a + b, 0), 100);
    const counts = Object.values(perTopic);
    eq('min quota', Math.min(...counts), 6);
    eq('max quota', Math.max(...counts), 7);
    ok(Math.max(...counts) - Math.min(...counts) <= 1, 'the quota spread is at most 1');
    /* The four 7s are the four topics with the largest deterministic pool,
       lower id breaking ties — a rule, not a preference. */
    eq('the four extra questions go to T4, T7, T8, T10',
        Object.keys(perTopic).filter((t) => perTopic[t] === 7).map(Number)
            .sort((a, b) => a - b).join(','), '4,7,8,10');
    ok(ITEMS.every((i) => Number.isInteger(i.sourceTopic)
        && i.sourceTopic >= 1 && i.sourceTopic <= 16),
        'every item names a source topic in 1..16');
    ok(ITEMS.every((i) => typeof i.sourceConcept === 'string' && i.sourceConcept.trim()),
        'every item names the concept it came from');

    /* NO DUPLICATES — same prompt twice would silently shrink the exam. */
    const prompts = ITEMS.map((i) => norm(i.q));
    eq('no normalized duplicate prompt', new Set(prompts).size, prompts.length);
    const exact = ITEMS.map((i) => i.q);
    eq('no exact duplicate prompt', new Set(exact).size, exact.length);

    /* TYPE COMPOSITION */
    const modes = {};
    ITEMS.forEach((i) => { modes[i.mode] = (modes[i.mode] || 0) + 1; });
    eq('chip items', modes.chip, 78);
    eq('input items', modes.input, 22);
    eq('every item is chip or input', (modes.chip || 0) + (modes.input || 0), 100);
    console.log(`  100 items · ${modes.chip} chip · ${modes.input} input · `
        + `topics ${Math.min(...counts)}-${Math.max(...counts)} each`);

    /* CHIP SANITY — exactly one option may be accepted, or the item is broken. */
    let chipMissing = 0, chipAmbiguous = 0;
    ITEMS.filter((i) => i.mode === 'chip').forEach((i) => {
        const hits = (i.opts || []).filter((o) => matches(o, i.answer));
        if (hits.length === 0) chipMissing++;
        if (hits.length > 1) chipAmbiguous++;
    });
    eq('every chip key is one of its own options', chipMissing, 0);
    eq('no chip has two acceptable options', chipAmbiguous, 0);
    ok(ITEMS.filter((i) => i.mode === 'chip').every((i) => (i.opts || []).length >= 2),
        'every chip offers at least two options');
    ok(ITEMS.filter((i) => i.mode === 'chip')
        .every((i) => new Set((i.opts || []).map(norm)).size === (i.opts || []).length),
        'no chip repeats an option after normalisation');

    /* ANSWER LEAKAGE — a prompt must not contain its own answer, and must not
       hand another item its answer. */
    let selfLeak = 0;
    ITEMS.forEach((i) => {
        const first = Array.isArray(i.answer) ? i.answer[0] : i.answer;
        const q = norm(i.q), a = norm(first);
        if (i.mode === 'chip' && a && a.length > 3 && q.includes(a)) selfLeak++;
    });
    eq('no chip prompt contains its own answer', selfLeak, 0);

    /* The reading section needs its passage, or its items are unanswerable. */
    const D = DATA.find((g) => g.section === 'D');
    ok(Array.isArray(D.passage) && D.passage.length >= 3, 'the reading section ships its passage');
    ok(typeof D.passageTitle === 'string' && D.passageTitle.trim(), 'and a passage title');
    ok(D.items.every((i) => i.opts && i.opts.join('|') === 'Правда|Ложь'),
        'every reading item is Правда / Ложь');
}

/* --------------------------------------------------- 2. GRADING */
{
    const gradeLocal = (answers) => {
        let correct = 0;
        DATA.forEach((g, gi) => g.items.forEach((it, ii) => {
            if (matches((answers[gi] || [])[ii], it.answer)) correct++;
        }));
        return correct;
    };
    const first = (it) => (Array.isArray(it.answer) ? it.answer[0] : it.answer);
    const perfectAnswers = DATA.map((g) => g.items.map(first));

    eq('a perfect paper scores 100/100', gradeLocal(perfectAnswers), 100);
    eq('an empty paper scores 0/100', gradeLocal(DATA.map((g) => g.items.map(() => ''))), 0);
    eq('a nonsense paper scores 0/100',
        gradeLocal(DATA.map((g) => g.items.map(() => 'zzz qqq xxx'))), 0);
    /* every DECLARED variant must actually be accepted, or it is decoration */
    let variantRejected = 0;
    ITEMS.forEach((it) => {
        if (!Array.isArray(it.answer)) return;
        it.answer.forEach((v) => { if (!matches(v, it.answer)) variantRejected++; });
    });
    eq('every declared accepted variant really is accepted', variantRejected, 0);

    /* THE SERVER IS THE GRADER. Run the real scoring module over the real
       canon, so a drift between page and canon fails here. */
    return (async () => {
        const scoring = await import('file://' + path.join(ROOT, 'api/_lib/exam-scoring.js'));
        const canonMod = await import('file://' + path.join(ROOT, 'api/_lib/course-canon.js'));

        ok(scoring.isExamCourse('A2'), 'the server recognises A2 as an exam course');
        eq('the server counts 100 gradable items', scoring.examTotal('A2'), 100);
        eq('A1 and B1 remain exam courses',
            ['A1', 'B1'].every((c) => scoring.isExamCourse(c)), true);
        eq('the canon lists A2 with 16 topics', canonMod.COURSE_CANON.A2.totalTopics, 16);

        const g = scoring.gradeExam('A2', perfectAnswers);
        eq('server: perfect paper correct', g.correct, 100);
        eq('server: perfect paper total', g.total, 100);
        eq('server: perfect paper score', g.score, 100);
        eq('server: pass mark', g.passMark, 80);
        eq('server: perfect paper passes', g.passed, true);

        const empty = scoring.gradeExam('A2', DATA.map((x) => x.items.map(() => '')));
        eq('server: empty paper scores 0', empty.score, 0);
        eq('server: empty paper fails', empty.passed, false);

        /* EXACT THRESHOLD and ONE BELOW — 100 items, so score == correct. */
        const withCorrect = (n) => {
            let left = n;
            return DATA.map((grp) => grp.items.map((it) => {
                if (left > 0) { left--; return first(it); }
                return '';
            }));
        };
        const atMark = scoring.gradeExam('A2', withCorrect(80));
        eq('server: exactly 80 correct scores 80', atMark.score, 80);
        eq('server: exactly the pass mark PASSES', atMark.passed, true);
        const below = scoring.gradeExam('A2', withCorrect(79));
        eq('server: 79 correct scores 79', below.score, 79);
        eq('server: one below the mark FAILS', below.passed, false);
        console.log(`  grading · perfect 100 PASS · 80 PASS · 79 FAIL · empty 0 FAIL`);

        /* A hostile payload is refused before grading. */
        const bad = (a) => { try { scoring.assertSubmissionShape('A2', a); return false; } catch (e) { return true; } };
        ok(bad(null), 'a null submission is refused');
        ok(bad('x'), 'a string submission is refused');
        /* An object LITERAL with __proto__ sets the prototype and has no own
           key, so it is simply an empty submission. The shape that actually
           arrives over the wire comes from JSON.parse, where __proto__ IS an
           own property — that is the one worth refusing. */
        ok(bad(JSON.parse('{"__proto__":[]}')), 'a prototype-probing key is refused');
        ok(bad({ toString: [] }), 'a named non-index key is refused');
        ok(bad({ 99: [] }), 'a group index beyond the exam is refused');
        ok(bad([[], [], [], [], [], []]), 'more groups than the exam has is refused');
        ok(bad(DATA.map((x) => x.items.map(() => 'x'.repeat(500)))), 'an oversized answer is refused');
        ok(!bad(perfectAnswers), 'a well-formed submission is accepted');

        /* --------------------------------------------- 3. THE PAGE */
        {
            eq('the page grades against 100 questions',
                /var TOTAL_QUESTIONS = 0;/.test(SRC), true);
            ok(/var COURSE = 'A2';/.test(SRC), 'the page declares course A2');
            ok(/var REQUIRED_TOPICS = 16;/.test(SRC), 'the completion gate is 16 topics');
            ok(!/var REQUIRED_TOPICS = (12|20);/.test(SRC), 'and not A1\'s 12 or B1\'s 20');
            ok(/var COURSE_PAGE = 'a2-course\.html';/.test(SRC), 'it returns to the A2 course');
            ok(/var TOTAL_SECONDS = 120 \* 60;/.test(SRC), 'the exam runs 120 minutes');
            ok(/var passed = pct >= 80;/.test(SRC), 'the page previews the 80% mark');
            ok(/submitFinalExam\('A2', examAnswers\)/.test(SRC),
                'the page submits to the shared server grader as A2');
            /* USER-SCOPED DRAFT — one account's answers must not leak to another. */
            ok(/var STATE_KEY = 'a2_finalexam_state_' \+ USER_ID;/.test(SRC),
                'the draft key is scoped to the user');
            ok(/var COMPLETION_KEY = 'a2_completion_' \+ USER_ID;/.test(SRC),
                'the completion cache key is scoped to the user');
            /* ---- ELIGIBILITY IS AUTHORITATIVE OR NOTHING ----
               The inherited gate fell back to localStorage whenever the remote
               read came back empty, so a learner could open the exam by typing
               their own progress into DevTools. The fallback is gone; these
               contracts stop it coming back. */
            ok(!/localStorage\.getItem\('a2_progress_'/.test(SRC),
                'localStorage is never read as exam eligibility');
            ok(!/getCompletedTopicCount/.test(SRC),
                'the old localStorage-backed gate helper is gone entirely');
            ok(/function readAuthoritativeCompletion\(\)/.test(SRC),
                'eligibility goes through an authoritative read');
            ok(/window\.getAuthoritativeCourseProgress/.test(SRC),
                'which is the shared helper, not a second progress store');
            ok(/function showExamSyncError\(\)/.test(SRC),
                'an unreadable course state gets its own screen');
            ok(/if \(!progress\.ok\) \{ showExamSyncError\(\); return; \}/.test(SRC),
                'a failed read fails CLOSED — the exam does not open');
            ok(/if \(progress\.count < REQUIRED_TOPICS\) \{ showExamLocked\(\); return; \}/.test(SRC),
                'and an incomplete course is locked, not merely warned');
            {
                /* The sync screen must not accuse the learner of not finishing. */
                const at = SRC.indexOf('function showExamSyncError');
                const body = SRC.slice(at, SRC.indexOf('function showExamLocked', at));
                ok(/tekshirib bo/.test(body), 'the sync screen says the state could not be checked');
                ok(!/tugating/.test(body), 'and does not claim the course is unfinished');
            }

            /* ---- THE SERVER'S VERDICT IS THE ONLY VERDICT ----
               Every authoritative side effect must come AFTER the submission.
               Positions in the source are compared rather than matching exact
               lines, so the contract survives ordinary edits. */
            {
                const p = SRC.indexOf('async function persistResult');
                /* Start AFTER the guest early-return: a guest has no server to
                   be authoritative, so that branch legitimately clears its own
                   draft with no submission. The ordering contract below is
                   about the signed-in path. */
                const guestEnd = SRC.indexOf('await waitForSync(3000);', p);
                ok(guestEnd > p, 'the signed-in path begins after the guest branch');
                const body = SRC.slice(guestEnd, SRC.indexOf('var lastAttempt', p));
                const at = (re) => body.search(re);
                const submit = at(/window\.submitFinalExam\(/);
                ok(submit > 0, 'persistResult submits to the server');
                ok(at(/saveQuizResult\(/) > submit,
                    'the stored quiz result is written AFTER the server replied');
                ok(at(/setItem\(COMPLETION_KEY/) > submit,
                    'the completion cache is written AFTER the server replied');
                ok(at(/uzTrack\(/) > submit,
                    'the exam_pass / exam_fail event is emitted AFTER the server replied');
                ok(at(/logActivity\(/) > submit,
                    'the activity log is written AFTER the server replied');
                ok(at(/removeItem\(STATE_KEY\)/) > submit,
                    'the draft is cleared AFTER the server replied');
                /* the bail-out must sit between the submit and all of that */
                const bail = body.search(/return \{\s*\n?\s*ok: false/);
                ok(bail > submit && bail < at(/saveQuizResult\(/),
                    'a missing verdict returns before any side effect runs');
                ok(/passed = server\.passed === true/.test(body),
                    'pass/fail is read off the server response');
                ok(/var score = server\.score/.test(body),
                    'and so is the score');
                ok(/if \(passed\) \{[\s\S]{0,200}setItem\(COMPLETION_KEY/.test(body),
                    'the completion cache is gated on the SERVER pass');
                ok(/passed && window\.currentUser && window\.logActivity/.test(body),
                    'the "passed the exam" activity line is gated on the server pass');
                ok(!/grantCompletion/.test(SRC),
                    'the old client-side grantCompletion decision is gone');
            }
            {
                /* renderResult must be handed the SERVER numbers. */
                ok(/renderResult\(results, outcome\.score, outcome\.score, outcome\.correct,\s*\n?\s*outcome\.passed/.test(SRC),
                    'the result screen renders the server outcome, not the preview');
                /* Both call sites must bail out — finishExam AND retrySubmit.
                   Matching the bare line was not enough: replacing only the
                   finishExam one left the retry copy to satisfy the regex. */
                eq('every persistResult call bails out without a verdict',
                    (SRC.match(/await persistResult\([\s\S]{0,200}?if \(!outcome\.ok\) \{ renderSubmitError\(outcome\); return; \}/g) || []).length,
                    (SRC.match(/await persistResult\(/g) || []).length);
                ok(/function renderSubmitError\(/.test(SRC), 'there is a neutral error screen');
                ok(/function retrySubmit\(/.test(SRC), 'the same attempt can be resubmitted');
                ok(/lastAttempt = \{ preview: preview, results: results, examAnswers: examAnswers/.test(SRC),
                    'the captured attempt is kept for that retry');
                const err = SRC.slice(SRC.indexOf('function renderSubmitError'), SRC.indexOf('async function retrySubmit'));
                ok(!/O‘tdingiz|O'tdingiz|O‘tmadingiz|O'tmadingiz/.test(err),
                    'the error screen never says passed or failed');
                ok(!/sertifikat/i.test(err), 'and never mentions a certificate');
                const retry = SRC.slice(SRC.indexOf('async function retrySubmit'), SRC.indexOf('function renderResult'));
                ok(!/TOTAL_SECONDS|deadline =/.test(retry), 'retrying does not restart the clock');
            }
            /* COPY-PASTE REGRESSION */
            eq('no B1 reference survived the copy', (SRC.match(/B1|b1[-_]/g) || []).length, 0);
            eq('no A1 reference either', (SRC.match(/\bA1\b|a1[-_]/g) || []).length, 0);
            ok(!/20 ta mavzu/.test(SRC), 'no leftover "20 topics" copy');
            ok(!/12 ta mavzu/.test(SRC), 'no leftover "12 topics" copy');
            ok(/16 ta mavzu/.test(SRC), 'the page tells the learner it covers 16 topics');
            /* The draft must never carry the verdict. */
            ok(!/finalExamPassed:\s*true[\s\S]{0,200}STATE_KEY/.test(SRC),
                'the in-progress draft does not carry a pass flag');
        }

        /* --------------------------------------------- 4. SERVER SECURITY */
        {
            const endpoint = fs.readFileSync(path.join(ROOT, 'api/_progress/final-exam.js'), 'utf8');
            ok(/const graded = gradeExam\(course, body\.answers\)/.test(endpoint),
                'the endpoint grades the submitted answers itself');
            ok(!/body\.(score|passed)/.test(endpoint),
                'and never reads a score or a verdict from the request body');
            /* THE COMPLETION GATE — exam pass alone must not be enough. */
            ok(/COURSE_CANON\[course\]/.test(endpoint),
                'the endpoint reads the expected topic count from the canon');
            ok(/finishedCourse/.test(endpoint) && /statusCode: 409/.test(endpoint),
                'and refuses a submission from someone who has not finished the course');
            ok(/!privileged && !finishedCourse/.test(endpoint),
                'with the existing developer/admin bypass preserved');
            ok(/courses\.\$\{course\}\.finalExamPassed/.test(endpoint),
                'the pass flag is written by the server, under the course');
            ok(/certificateUnlocked/.test(endpoint),
                'and the certificate unlock is recorded there too');

            const certs = fs.readFileSync(path.join(ROOT, 'api/_lib/certificates.js'), 'utf8');
            ok(/A2:\s*\{/.test(certs), 'A2 is a certifiable course');
            ok(/A1:\s*\{/.test(certs) && /B1:\s*\{/.test(certs),
                'A1 and B1 remain certifiable');
            ok(/B2:\s*\{/.test(certs), 'B2 has since joined them — A2 issuance is unaffected');
            ok(/courseData\.finalExamPassed === true/.test(certs),
                'certificate eligibility rests on the server-written flag');
            ok(/courseData\.certificateNumber/.test(certs),
                'issuance is idempotent on the stored certificate number');
            ok(/UZD-\$\{COURSE\}-\$\{year\}/.test(certs),
                'A2 certificate numbers come from the shared generator');

            const client = fs.readFileSync(path.join(ROOT, 'firebase-client.js'), 'utf8');
            ok(/'a2-final-exam\.html'/.test(client), 'the exam page is in the access allowlist');
            const packLine = client.match(/A1A2:\s*\[[^\]]*\]/)[0];
            ok(packLine.includes('a2-final-exam.html'),
                'and specifically in the A1A2 pack, like the A2 course itself');
            ok(!/B1B2:\s*\[[^\]]*a2-final-exam/.test(client),
                'it is not exposed through the B1B2 pack');
        }

        /* --------------------------------------------- 5. COURSE PAGE CTA */
        {
            const course = fs.readFileSync(path.join(ROOT, 'paid-courses/a2-course.html'), 'utf8');
            ok(/id="finalExamEntry"/.test(course), 'the course page has the final-exam entry block');
            ok(/function renderFinalExamEntry\(\)/.test(course), 'and renders it');
            ok(/a2-final-exam\.html/.test(course), 'the start button points at the A2 exam');
            ok(/function a2CertificateUnlocked\(\)/.test(course), 'certificate state is computed');
            ok(/function ensureA2CertificateIssued\(\)/.test(course),
                'issuance goes through the shared certificate API');
            ok(/id="a2CertOverlay"/.test(course), 'the certificate modal exists');
            ok(/barcha 16 ta mavzuni/.test(course), 'the locked copy names 16 topics');
            ok(!/barcha 20 ta mavzuni/.test(course), 'and never 20');
        }

        console.log('='.repeat(60));
        if (fail) {
            console.log(`  ❌ A2 FINAL EXAM: ${fail} failed / ${pass + fail}\n`);
            failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
            console.log('='.repeat(60) + '\n');
            process.exit(1);
        }
        console.log(`  ✅ A2 FINAL EXAM: ${pass}/${pass} passed`);
        console.log('='.repeat(60) + '\n');
    })();
}
