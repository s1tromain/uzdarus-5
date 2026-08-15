#!/usr/bin/env node
/**
 * verify_progress_security.cjs — a learner may not author their own achievements.
 *
 * THE VULNERABILITY THIS EXISTS TO KEEP CLOSED
 * -------------------------------------------
 * `saveUserProgress()` was a direct client `updateDoc()` on the caller's own
 * user document, and firestore.rules listed `courses` as a single writable key.
 * An update with dotted paths reports only the TOP-LEVEL key as affected, so
 * that one entry authorised every field of every course. Proven, not assumed:
 *
 *     courses.A1.completedTopics   = [1..12]        → ALLOWED
 *     courses.B1.finalExamPassed   = true           → ALLOWED
 *     courses.B1.certificateUnlocked = true         → ALLOWED
 *     completedTopics (root)       = [1..12]        → ALLOWED
 *
 * and api/_lib/certificates.js issues on `finalExamPassed === true`, so one line
 * in DevTools produced a real, numbered certificate.
 *
 * Now: those fields are written only by /api/progress via the Admin SDK, the
 * rules refuse them from the owner, and the final exam is scored by the server
 * from its own answer key.
 *
 * HOW THE RULES ARE TESTED
 * -----------------------
 * There is no Firestore emulator in this repo and adding firebase-tools would
 * make an offline, seconds-long suite depend on a network download and a JVM.
 * Instead the rule's own predicates are EVALUATED here — ownerMutableKeys(),
 * courseSafeKeys() and courseChangeAllowed() are parsed out of the real
 * firestore.rules and applied to real update payloads with Firestore's own
 * dotted-path semantics. That is not a grep: change the rule and these results
 * change. Running the actual emulator remains a manual pre-deploy step.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
const PLATFORM = fs.readFileSync(path.join(ROOT, 'paid-courses/paid-platform.js'), 'utf8');
const CERTS = fs.readFileSync(path.join(ROOT, 'api/_lib/certificates.js'), 'utf8');
const COMPLETE = fs.readFileSync(path.join(ROOT, 'api/_progress/complete-topic.js'), 'utf8');
const EXAM_EP = fs.readFileSync(path.join(ROOT, 'api/_progress/final-exam.js'), 'utf8');
const ROUTER = fs.readFileSync(path.join(ROOT, 'api/progress.js'), 'utf8');

console.log('\n=== PROGRESS SECURITY ===');

/* ==================================================================== *
 * 1. THE RULES, EVALUATED
 * ==================================================================== */
function ruleList(name) {
    const at = RULES.indexOf('function ' + name + '()');
    if (at < 0) throw new Error('missing rule helper ' + name);
    const body = RULES.slice(at, RULES.indexOf('}', at));
    return (body.match(/"([^"]+)"/g) || []).map((s) => s.replace(/"/g, ''));
}
const OWNER_KEYS = ruleList('ownerMutableKeys');
const COURSE_SAFE = ruleList('courseSafeKeys');
const COURSE_CODES = ruleList('courseCodes');

/**
 * Evaluate `allow update: if isOwner(uid) && ownerUpdateAllowed()` for an
 * update expressed the way the SDK sends it: dotted field paths.
 *
 * Firestore reports the TOP-LEVEL key as affected — that is the whole reason
 * the old rule was porous — so the top-level check is modelled exactly, and
 * courseChangeAllowed() is then applied per course to the sub-keys.
 */
function ownerUpdateAllowed(update) {
    const topLevel = [...new Set(Object.keys(update).map((k) => k.split('.')[0]))];
    if (!topLevel.every((k) => OWNER_KEYS.includes(k))) return false;

    /* Per-course sub-key check. `courses.A1.vocabulary.learnedWords.topic_1`
       affects sub-key `vocabulary` of course A1. */
    for (const code of COURSE_CODES) {
        const touched = new Set();
        Object.keys(update).forEach((k) => {
            const parts = k.split('.');
            if (parts[0] === 'courses' && parts[1] === code && parts[2]) touched.add(parts[2]);
        });
        /* Whole-map assignment: courses.A1 = {...} */
        Object.keys(update).forEach((k) => {
            const parts = k.split('.');
            if (parts[0] === 'courses' && parts[1] === code && !parts[2]) {
                Object.keys(update[k] || {}).forEach((sub) => touched.add(sub));
            }
        });
        for (const sub of touched) if (!COURSE_SAFE.includes(sub)) return false;
    }
    return true;
}

const AUTHORITATIVE = ['completedTopics', 'finalExamPassed', 'finalExamScore',
    'finalExamCompletedAt', 'courseCompleted', 'certificateUnlocked', 'certificateNumber'];

console.log('  ownerMutableKeys : [' + OWNER_KEYS.join(', ') + ']');
console.log('  courseSafeKeys   : [' + COURSE_SAFE.join(', ') + ']');

/* ---- the authoritative fields are refused, for every course ---- */
COURSE_CODES.forEach((code) => {
    AUTHORITATIVE.forEach((field) => {
        ok(ownerUpdateAllowed({ [`courses.${code}.${field}`]: true, lastActivity: 'ts' }) === false,
            `owner cannot write courses.${code}.${field}`);
    });
    /* nor by replacing the whole course map */
    ok(ownerUpdateAllowed({ [`courses.${code}`]: { completedTopics: [1, 2, 3] } }) === false,
        `owner cannot smuggle completedTopics by replacing courses.${code}`);
    ok(ownerUpdateAllowed({ [`courses.${code}`]: { finalExamPassed: true } }) === false,
        `owner cannot smuggle finalExamPassed by replacing courses.${code}`);
});

/* ---- the exact attacks the audit proved ---- */
ok(ownerUpdateAllowed({ 'courses.A1.completedTopics': [1,2,3,4,5,6,7,8,9,10,11,12], lastActivity: 'ts' }) === false,
    'ATTACK A: courses.A1.completedTopics = [1..12] is DENIED');
ok(ownerUpdateAllowed({ 'courses.B1.finalExamPassed': true, lastActivity: 'ts' }) === false,
    'ATTACK B: courses.B1.finalExamPassed = true is DENIED');
ok(ownerUpdateAllowed({
    'courses.B1.finalExamScore': 100, 'courses.B1.finalExamPassed': true,
    'courses.B1.courseCompleted': true, 'courses.B1.certificateUnlocked': true,
    'courses.B1.finalExamCompletedAt': 'x', lastActivity: 'ts' }) === false,
    'ATTACK C: the whole certificate set is DENIED');
ok(ownerUpdateAllowed({ completedTopics: [1,2,3,4,5,6,7,8,9,10,11,12], lastActivity: 'ts' }) === false,
    'LEGACY: root completedTopics is DENIED');
ok(!OWNER_KEYS.includes('completedTopics'), 'root completedTopics is not an owner key at all');

/* ---- and the states that were already protected stay protected ---- */
[['role', 'developer'], ['subscription', { active: true }], ['accountFreeze', { frozen: false }],
 ['blocked', false], ['accessPacks', ['A1A2', 'B1B2']]].forEach(([field, value]) => {
    ok(ownerUpdateAllowed({ [field]: value }) === false, `owner cannot write ${field}`);
});

/* ---- LEGITIMATE writes must still work, or the product is broken ---- */
COURSE_CODES.forEach((code) => {
    ok(ownerUpdateAllowed({
        [`courses.${code}.vocabulary.learnedWords.topic_1`]: 40,
        [`courses.${code}.vocabulary.lastAccessed`]: 'ts',
        lastActivity: 'ts' }) === true,
        `owner CAN still save ${code} vocabulary progress`);
    ok(ownerUpdateAllowed({ [`courses.${code}.lastUpdated`]: 'ts', lastActivity: 'ts' }) === true,
        `owner CAN still touch ${code}.lastUpdated`);
    /* a brand-new account creating the course map with safe keys only */
    ok(ownerUpdateAllowed({ [`courses.${code}`]: { vocabulary: {}, lastUpdated: 'ts' } }) === true,
        `a new ${code} course map may be created with safe keys`);
});
ok(ownerUpdateAllowed({ agreementAccepted: true, agreementAcceptedAt: 'ts' }) === true,
    'owner CAN still accept the agreement');
ok(ownerUpdateAllowed({ forcePasswordChange: false, lastPasswordChangeAt: 'ts', updatedAt: 'ts' }) === true,
    'owner CAN still complete a password change');

/* ---- the rule text itself must keep its nested guard ---- */
ok(/function courseChangeAllowed\(code\)/.test(RULES), 'the nested course guard exists');
ok(/coursesUpdateAllowed\(\)/.test(RULES), 'ownerUpdateAllowed() calls the nested guard');
ok(/&&\s*coursesUpdateAllowed\(\)/.test(RULES),
    'the nested guard is ANDed, not merely defined');
/* a guard that assumed the maps exist would deny every new account */
ok(/'courses' in request\.resource\.data/.test(RULES),
    'the guard tolerates a document with no courses map');
ok(/is map/.test(RULES), 'the guard type-checks before diffing');

/* ==================================================================== *
 * 2. THE CLIENT CAN NO LONGER TRY
 * ==================================================================== */
ok(/const AUTHORITATIVE_PROGRESS_FIELDS = Object\.freeze\(\[/.test(PLATFORM),
    'the client names the authoritative fields explicitly');
AUTHORITATIVE.forEach((f) =>
    ok(new RegExp(`'${f}'`).test(PLATFORM.slice(PLATFORM.indexOf('AUTHORITATIVE_PROGRESS_FIELDS'),
        PLATFORM.indexOf('function isAuthoritativeProgressKey'))),
        `${f} is listed as authoritative in the client`));

/* Drive the real refusal logic rather than trusting the list. */
const guard = new Function(
    PLATFORM.slice(PLATFORM.indexOf('const AUTHORITATIVE_PROGRESS_FIELDS'),
        PLATFORM.indexOf('/**', PLATFORM.indexOf('function isAuthoritativeProgressKey'))) +
    '\nreturn isAuthoritativeProgressKey;')();
AUTHORITATIVE.forEach((f) => {
    ok(guard(f) === true, `the generic saver rejects the key "${f}"`);
    ok(guard(`${f}.nested`) === true, `it also rejects the dotted form "${f}.nested"`);
});
['vocabulary.learnedWords.topic_1', 'lastUpdated', 'vocabulary'].forEach((f) =>
    ok(guard(f) === false, `the generic saver still permits "${f}"`));

ok(/refusing to write authoritative field/.test(PLATFORM),
    'a caller that tries gets a loud refusal, not a silent permission-denied');
ok(/the legacy array form is no longer accepted/.test(PLATFORM),
    'the legacy root-array signature is refused');
ok(/window\.completeCourseTopic = completeCourseTopic/.test(PLATFORM),
    'completeCourseTopic() is exposed');
ok(/window\.submitFinalExam = submitFinalExam/.test(PLATFORM),
    'submitFinalExam() is exposed');
ok(!/finalExamPassed:\s*true/.test(PLATFORM), 'the client never composes a pass flag');

/* No page may still write an authoritative field through the generic saver. */
{
    const pages = [...fs.readdirSync(path.join(ROOT, 'paid-courses')).filter((f) => f.endsWith('.html'))
        .map((f) => 'paid-courses/' + f),
        ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'))];
    const offenders = [];
    pages.forEach((rel) => {
        const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        const re = /saveUserProgress\s*\(/g;
        let m;
        while ((m = re.exec(src))) {
            const open = src.indexOf('{', m.index);
            const stop = src.indexOf(');', m.index);
            if (open < 0 || open > stop) continue;
            let d = 0, end = -1;
            for (let k = open; k < src.length; k++) {
                if (src[k] === '{') d++;
                else if (src[k] === '}') { d--; if (d === 0) { end = k; break; } }
            }
            const body = src.slice(open, end + 1);
            AUTHORITATIVE.forEach((f) => {
                if (new RegExp('(^|[^\\w.])' + f + '\\s*:').test(body)) offenders.push(`${rel} → ${f}`);
            });
        }
    });
    ok(offenders.length === 0,
        `no page writes an authoritative field through saveUserProgress (${offenders.join('; ')})`);
    console.log(`  scanned ${pages.length} pages for direct authoritative writes`);
}

/* ==================================================================== *
 * 3. THE ENDPOINTS
 * ==================================================================== */
[['complete-topic', COMPLETE], ['final-exam', EXAM_EP]].forEach(([name, src]) => {
    ok(/const uid = session\.uid;/.test(src), `${name}: uid comes from the session`);
    ok(!/body\.(uid|userId)/.test(src), `${name}: the body's uid is never read`);
    ok(/await requireSession\(req\)/.test(src), `${name}: the caller is authenticated first`);
    ok(/runTransaction/.test(src), `${name}: reads and writes atomically`);
    ok(/data\.blocked === true/.test(src), `${name}: a blocked account is refused`);
    ok(/isAccountFrozen\(data\)/.test(src), `${name}: a frozen account is refused`);
    ok(!/\.\.\.body|update\(userRef, body\)/.test(src), `${name}: the body is never spread into the write`);
    /* Everything written must be an explicit, named field. */
    const writes = (src.match(/\[`courses\.\$\{course\}\.(\w+)`\]/g) || [])
        .map((s) => s.replace(/.*\.\$\{course\}\./, '').replace(/`\]/, ''));
    ok(writes.length > 0, `${name}: writes named course fields`);
    ok(writes.every((w) => AUTHORITATIVE.includes(w) || w === 'lastUpdated'),
        `${name}: writes only completion fields (${writes.join(', ')})`);
});
ok(/'complete-topic':/.test(ROUTER) && /'final-exam':/.test(ROUTER), 'both actions are routed');
ok(!/CAPABILITIES/.test(ROUTER) && !/CAPABILITIES/.test(COMPLETE) && !/CAPABILITIES/.test(EXAM_EP),
    'learner endpoints do not enter the admin capability surface');

/* ==================================================================== *
 * 4. SERVER EXAM SCORING + PARITY WITH THE PAGES
 * ==================================================================== */
(async function run() {
    const { COURSE_CANON, EXAM_CANON } = await import('../api/_lib/course-canon.js');
    const { gradeExam, assertSubmissionShape, examTotal } =
        await import('../api/_lib/exam-scoring.js');

    /* ---- the canonical copy must still match the pages, item for item ---- */
    const EXAM_PAGES = { A1: 'paid-courses/a1-final-exam.html', B1: 'paid-courses/b1-final-exam.html' };
    Object.entries(EXAM_PAGES).forEach(([course, rel]) => {
        const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        const i = src.search(/(?:const|let|var)\s+FINAL_EXAM_DATA\s*=\s*\[/);
        let j = i;
        while (src[j] !== '[') j++;
        let d = 0, lit = '';
        for (let k = j; k < src.length; k++) {
            if (src[k] === '[') d++;
            else if (src[k] === ']') { d--; if (d === 0) { lit = src.slice(j, k + 1); break; } }
        }
        const page = vm.runInNewContext('(' + lit + ')', {});
        const canon = EXAM_CANON[course];

        eq(`${course}: same number of groups`, canon.groups.length, page.length);
        const pageItems = page.reduce((s, g) => s + (g.items || []).length, 0);
        eq(`${course}: same number of items`, examTotal(course), pageItems);

        /* Prompts and answers, position by position — a drifted key would be a
           learner graded against a question they were never asked. */
        let mismatch = 0;
        page.forEach((g, gi) => {
            (g.items || []).forEach((item, ii) => {
                const c = canon.groups[gi] && canon.groups[gi].items[ii];
                if (!c) { mismatch++; return; }
                if (String(item.q == null ? '' : item.q) !== c.q) mismatch++;
                if (JSON.stringify(item.answer) !== JSON.stringify(c.answer)) mismatch++;
                if (JSON.stringify(item.opts || null) !== JSON.stringify(c.opts)) mismatch++;
            });
        });
        eq(`${course}: canonical answer key matches the page exactly`, mismatch, 0);

        /* The page's own threshold and punctuation class, not an assumption. */
        const passMark = Number(src.match(/var passed = (?:finalScore|pct) >= (\d+);/)[1]);
        eq(`${course}: pass mark taken from the page`, canon.passMark, passMark);
        const punct = src.match(/function normalizeExamText[\s\S]*?\.replace\(\/\[([^\]]*)\]\/g, ' '\)/)[1];
        eq(`${course}: punctuation class taken from the page`, canon.punctuation, punct);
    });

    /* ---- grading, against the real key ---- */
    for (const course of ['A1', 'B1']) {
        const canon = EXAM_CANON[course];
        const total = examTotal(course);
        const first = (a) => (Array.isArray(a) ? a[0] : a);

        const allRight = canon.groups.map((g) => g.items.map((it) => first(it.answer)));
        let r = gradeExam(course, allRight);
        eq(`${course}: every answer correct scores 100`, r.score, 100);
        ok(r.passed === true, `${course}: a perfect paper passes`);
        eq(`${course}: correct count equals the item count`, r.correct, total);

        r = gradeExam(course, canon.groups.map((g) => g.items.map(() => 'zzzzz')));
        eq(`${course}: every answer wrong scores 0`, r.score, 0);
        ok(r.passed === false, `${course}: a wrong paper fails`);

        r = gradeExam(course, []);
        eq(`${course}: an empty submission scores 0`, r.score, 0);
        eq(`${course}: an empty submission still counts every item`, r.total, total);

        /* Blank answers are never correct, even where '' would normalise to a
           blank expected value. */
        r = gradeExam(course, canon.groups.map((g) => g.items.map(() => '')));
        eq(`${course}: blanks score 0`, r.correct, 0);

        /* Presentation differences are tolerated; a real error is not. */
        const sample = canon.groups[0].items[0];
        const right = first(sample.answer);
        const dressed = ('  ' + String(right).toUpperCase() + ' , ').replace(/е/gi, 'ё');
        const one = (value) => {
            const a = canon.groups.map((g) => g.items.map(() => ''));
            a[0][0] = value;
            return gradeExam(course, a).correct;
        };
        eq(`${course}: case, spacing, punctuation and ё/е are tolerated`, one(dressed), 1);
        eq(`${course}: a genuinely different word is still wrong`, one('qwertyuiop'), 0);

        /* Boundary either side of the pass mark. */
        const need = Math.ceil((canon.passMark / 100) * total);
        const build = (n) => {
            let left = n;
            return canon.groups.map((g) => g.items.map((it) => {
                if (left > 0) { left--; return first(it.answer); }
                return 'zzzzz';
            }));
        };
        ok(gradeExam(course, build(need)).passed === true,
            `${course}: exactly the pass mark passes (${need}/${total})`);
        ok(gradeExam(course, build(need - 1)).passed === false,
            `${course}: one mark below the pass mark fails`);

        /* An accepted variant, wherever the key offers one. */
        let variantChecked = false;
        canon.groups.forEach((g, gi) => g.items.forEach((it, ii) => {
            if (variantChecked || !Array.isArray(it.answer) || it.answer.length < 2) return;
            const a = canon.groups.map((gg) => gg.items.map(() => ''));
            a[gi][ii] = it.answer[1];
            ok(gradeExam(course, a).correct === 1,
                `${course}: a listed alternative answer is accepted`);
            variantChecked = true;
        }));
    }

    /* ---- the client's number and the server's number must agree ---- */
    Object.entries(EXAM_PAGES).forEach(([course, rel]) => {
        const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        const normSrc = src.match(/function normalizeExamText[\s\S]*?\n        \}/)[0];
        const isSrc = src.match(/function examIsCorrect[\s\S]*?\n        \}/)[0];
        const pageCheck = new Function(normSrc + isSrc + '; return examIsCorrect;')();
        const canon = EXAM_CANON[course];
        const first = (a) => (Array.isArray(a) ? a[0] : a);

        /* Score the same paper both ways. */
        const paper = canon.groups.map((g, gi) => g.items.map((it, ii) =>
            ((gi + ii) % 3 === 0 ? first(it.answer) : 'zzz')));
        let clientCorrect = 0;
        canon.groups.forEach((g, gi) => g.items.forEach((it, ii) => {
            if (pageCheck(paper[gi][ii], it.answer)) clientCorrect++;
        }));
        const server = gradeExam(course, paper);
        eq(`${course}: client scorer and server scorer agree`, server.correct, clientCorrect);
        ok(clientCorrect > 0 && clientCorrect < server.total,
            `${course}: the parity paper is a genuine mixture (${clientCorrect}/${server.total})`);
    });

    /* ---- a hostile submission is refused before grading ---- */
    const bad = [
        ['not an object', 'nope'],
        ['a number', 42],
        ['prototype probe', JSON.parse('{"__proto__":{"x":1}}')],
        ['named field', { finalExamPassed: true }],
        ['group beyond the exam', { 999: ['a'] }],
        ['group that is not an array', { 0: 'a' }],
        ['oversized answer', { 0: ['x'.repeat(5000)] }],
        ['object answer', { 0: [{ a: 1 }] }]
    ];
    bad.forEach(([label, payload]) => {
        let threw = false;
        try { assertSubmissionShape('A1', payload); } catch (e) { threw = true; }
        ok(threw, `a submission with ${label} is refused`);
    });
    let good = true;
    try { assertSubmissionShape('A1', EXAM_CANON.A1.groups.map((g) => g.items.map(() => 'x'))); }
    catch (e) { good = false; }
    ok(good, 'a well-formed submission is accepted');

    /* ---- the client's claimed verdict is not read anywhere ---- */
    ok(!/body\.(score|passed)/.test(EXAM_EP),
        'the exam endpoint never reads a client-supplied score or passed flag');
    ok(/gradeExam\(course, body\.answers\)/.test(EXAM_EP),
        'the verdict is computed from the submitted answers');
    /* A forged verdict alongside real answers changes nothing: the endpoint has
       no code path that reads it, so grading the same answers yields the same
       result whatever else is in the body. */
    const wrongPaper = EXAM_CANON.B1.groups.map((g) => g.items.map(() => 'zzzzz'));
    const forged = gradeExam('B1', wrongPaper);
    ok(forged.passed === false && forged.score === 0,
        'ATTACK: all-wrong answers score 0 no matter what score/passed claim accompanies them');

    /* ---- topic validation, from the real manifest ---- */
    eq('A1 declares 12 topics', COURSE_CANON.A1.totalTopics, 12);
    eq('A2 declares 16 topics', COURSE_CANON.A2.totalTopics, 16);
    eq('B1 declares 20 topics', COURSE_CANON.B1.totalTopics, 20);
    eq('B2 declares 16 topics', COURSE_CANON.B2.totalTopics, 16);

    const cabinet = fs.readFileSync(path.join(ROOT, 'my.cabinet/cabinet.js'), 'utf8');
    const totals = vm.runInNewContext('(' +
        cabinet.slice(cabinet.indexOf('Object.freeze({', cabinet.indexOf('COURSE_TOTAL_TOPICS')) + 14,
            cabinet.indexOf('});', cabinet.indexOf('COURSE_TOTAL_TOPICS')) + 1) + ')', {});
    Object.keys(COURSE_CANON).forEach((c) =>
        eq(`${c}: the server manifest matches the platform's declared total`,
            COURSE_CANON[c].totalTopics, Number(totals[c])));

    /* The endpoint's own validation, exercised. */
    const validate = (course, topicId) => {
        const canon = COURSE_CANON[String(course || '').trim().toUpperCase()];
        if (!canon) return 'course';
        const n = Number(topicId);
        if (!Number.isInteger(n) || n < 1 || n > canon.totalTopics) return 'topic';
        return 'ok';
    };
    eq('a real topic is accepted', validate('A1', 9), 'ok');
    ['C1', 'A99', '', null, '../../', '__proto__'].forEach((c) =>
        eq(`course "${c}" is rejected`, validate(c, 1), 'course'));
    [0, -1, 2.5, 999999, '9x', null, NaN, '__proto__'].forEach((t) =>
        eq(`topic ${JSON.stringify(t)} is rejected`, validate('A1', t), 'topic'));
    eq('a topic past the course end is rejected', validate('A1', 13), 'topic');

    /* Sequence + monotonic union, the endpoint's transaction logic. */
    const step = (current, topicId, total) => {
        const cur = current.filter((n) => Number.isInteger(n) && n > 0 && n <= total);
        if (cur.includes(topicId)) return { list: cur.slice().sort((a, b) => a - b), changed: false };
        if (topicId > 1 && !cur.includes(topicId - 1)) return { denied: true };
        return { list: Array.from(new Set([...cur, topicId])).sort((a, b) => a - b), changed: true };
    };
    eq('topic 4 after 1-3 succeeds', JSON.stringify(step([1, 2, 3], 4, 12).list), '[1,2,3,4]');
    ok(step([1, 2, 3], 12, 12).denied === true, 'skipping to topic 12 from 3 is DENIED');
    ok(step([1, 2, 3], 5, 12).denied === true, 'skipping one topic is DENIED');
    ok(step([], 1, 12).changed === true, 'topic 1 needs no predecessor');
    ok(step([1, 2, 3], 2, 12).changed === false, 're-completing is idempotent, no write');
    eq('a duplicate completion does not duplicate the id',
        JSON.stringify(step([1, 2, 3], 3, 12).list), '[1,2,3]');
    /* Concurrency: the second transaction re-reads what the first wrote. */
    const afterA = step([1, 2, 3], 4, 12).list;
    const afterB = step(afterA, 5, 12).list;
    eq('concurrent completions accumulate, none lost', JSON.stringify(afterB), '[1,2,3,4,5]');
    eq('a stale client array cannot shrink the record',
        JSON.stringify(step([1, 2, 3, 4, 5], 6, 12).list), '[1,2,3,4,5,6]');

    /* ==================================================================== *
     * 5. THE CERTIFICATE
     * ==================================================================== */
    ok(/courseData\.finalExamPassed === true/.test(CERTS),
        'the certificate still rests on finalExamPassed');
    /* Which is now safe ONLY because of the two facts asserted above: the owner
       cannot write it, and the server writes it from its own grading. */
    ok(ownerUpdateAllowed({ 'courses.B1.finalExamPassed': true }) === false,
        'certificate eligibility cannot be authored by the customer');
    ok(/\[`courses\.\$\{course\}\.finalExamPassed`\]/.test(EXAM_EP),
        'the server is what writes finalExamPassed');
    /* Checked as a WRITE, not as a mention: both files discuss the field in
       their comments, and a test satisfied by deleting an explanation is not a
       test. */
    ok(!/\[`courses\.\$\{course\}\.certificateNumber`\]/.test(EXAM_EP),
        'the exam endpoint never writes an issued certificate number');
    ok(/alreadyIssued/.test(CERTS), 'certificate issuance stays idempotent');
    /* No local browser state feeds eligibility. */
    ok(!/localStorage\.(get|set)Item/.test(CERTS),
        'the certificate backend reads no browser state');

    console.log('='.repeat(60));
    if (fail) {
        console.log(`  ❌ PROGRESS SECURITY: ${fail} failed / ${pass + fail}\n`);
        failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
        console.log('='.repeat(60) + '\n');
        process.exit(1);
    }
    console.log(`  ✅ PROGRESS SECURITY: ${pass}/${pass} passed`);
    console.log('  (Firestore emulator execution remains a manual pre-deploy step)');
    console.log('='.repeat(60) + '\n');
})().catch((e) => { console.error('PROGRESS SECURITY crashed:', e); process.exit(1); });
