#!/usr/bin/env node
/**
 * verify_b2_final_exam.cjs — the B2 final exam and the B2 certificate path.
 *
 * B2 is the last course on the platform, so its exam is the last thing a
 * learner does before a certificate exists. Four separate contracts are pinned
 * here, and none of them is allowed to rest on the browser:
 *
 *   THE BANK — exactly 10 groups of exactly 10, one hundred graded items,
 *   every one of the sixteen B2 topics carrying exactly six of its own, four
 *   integrative items that name more than one topic, no free-answer prompt and
 *   no item whose options differ only by punctuation the normaliser strips.
 *
 *   THE PAGE — the gate is 16 topics (not A1's 12, not B1's 20), the draft is
 *   scoped to the user, the deadline survives a reload, the server's verdict is
 *   the only verdict, and nothing still says A2.
 *
 *   THE SERVER — answers are graded by api/_lib/exam-scoring.js against
 *   api/_lib/course-canon.js; the endpoint refuses a submission from someone
 *   who has not finished the course; the certificate issues only on the
 *   server's own finalExamPassed.
 *
 *   THE ENTRY — b2-course.html locks the exam until 16/16, and the certificate
 *   modal opens only on a Firebase-confirmed pass.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const REL = 'paid-courses/b2-final-exam.html';
const SRC = fs.readFileSync(path.join(ROOT, REL), 'utf8');
const DATA = JSON.parse(SRC.match(/var FINAL_EXAM_DATA = (\[[\s\S]*?\]);\r?\n/)[1]);
const ITEMS = DATA.flatMap((g) => g.items || []);

console.log('\n=== B2 FINAL EXAM ===');

/* The page's own normaliser, lifted from the page so the test cannot drift
   away from what actually grades the learner. */
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
const first = (it) => (Array.isArray(it.answer) ? it.answer[0] : it.answer);
const topicsOf = (it) => (Array.isArray(it.sourceTopics) ? it.sourceTopics : [it.sourceTopic]);

/* --------------------------------------------------- 1. THE BANK */
{
    eq('exactly 100 graded questions', ITEMS.length, 100);
    eq('exactly ten exercise groups', DATA.length, 10);
    eq('group codes', DATA.map((g) => g.section).join(''), 'ABCDEFGHIJ');
    eq('every group holds exactly ten questions',
        DATA.map((g) => (g.items || []).length).join(','), '10,10,10,10,10,10,10,10,10,10');
    ok(DATA.every((g) => g.title && g.subtitle), 'every group is titled and subtitled');
    ok(DATA.every((g) => g.type === 'mixed'), 'every group declares its type');
    ok(new Set(DATA.map((g) => g.title)).size === 10, 'no two groups share a title');

    /* NO OPEN ITEMS. An auto-graded certificate exam cannot contain a prompt
       with no right answer — the B2 lessons have genuine free:true items and
       none of them were copied in. */
    eq('no free-answer item', ITEMS.filter((i) => i.free).length, 0);
    eq('every item has a key', ITEMS.filter((i) => {
        const a = i.answer;
        if (a == null) return true;
        if (Array.isArray(a)) return a.filter((x) => String(x || '').trim()).length === 0;
        return String(a).trim() === '';
    }).length, 0);

    /* TOPIC COVERAGE — the contract this exam exists to keep. Ninety-six items
       are pinned to a single topic, six per topic, exactly; the remaining four
       are integrative by design and name every topic they draw on. */
    const direct = ITEMS.filter((i) => !i.integrative);
    const integrative = ITEMS.filter((i) => i.integrative);
    eq('96 single-topic items', direct.length, 96);
    eq('4 integrative items', integrative.length, 4);
    const perTopic = {};
    direct.forEach((i) => { perTopic[i.sourceTopic] = (perTopic[i.sourceTopic] || 0) + 1; });
    for (let t = 1; t <= 16; t++) {
        eq(`topic ${t} contributes exactly six single-topic questions`, perTopic[t] || 0, 6);
    }
    eq('sixteen topics represented, no more', Object.keys(perTopic).length, 16);
    eq('the quotas sum to 96', Object.values(perTopic).reduce((a, b) => a + b, 0), 96);
    ok(direct.every((i) => Number.isInteger(i.sourceTopic)
        && i.sourceTopic >= 1 && i.sourceTopic <= 16),
        'every single-topic item names a source topic in 1..16');
    ok(integrative.every((i) => Array.isArray(i.sourceTopics) && i.sourceTopics.length >= 2),
        'every integrative item names at least two source topics');
    ok(integrative.every((i) => i.sourceTopics.every((t) =>
        Number.isInteger(t) && t >= 1 && t <= 16)),
        'and all of those topics are real B2 topics');
    ok(ITEMS.every((i) => typeof i.sourceConcept === 'string' && i.sourceConcept.trim()),
        'every item names the concept it came from');
    /* Counting integrative items too, no topic is left out of the exam. */
    const touched = new Set();
    ITEMS.forEach((i) => topicsOf(i).forEach((t) => touched.add(t)));
    eq('all sixteen topics are touched somewhere in the exam', touched.size, 16);

    /* NO DUPLICATES — the same prompt twice silently shrinks the exam. */
    const prompts = ITEMS.map((i) => norm(i.q));
    eq('no normalized duplicate prompt', new Set(prompts).size, prompts.length);
    eq('no exact duplicate prompt', new Set(ITEMS.map((i) => i.q)).size, ITEMS.length);

    /* TYPE COMPOSITION */
    const modes = {};
    ITEMS.forEach((i) => { modes[i.mode] = (modes[i.mode] || 0) + 1; });
    eq('every item is chip or input', (modes.chip || 0) + (modes.input || 0), 100);
    ok((modes.input || 0) >= 25,
        `a substantial share is produced, not picked (${modes.input} input items)`);
    ok((modes.chip || 0) >= 25, `and a substantial share is selection (${modes.chip} chip items)`);
    console.log(`  100 items · ${modes.chip} chip · ${modes.input} input · `
        + `96 single-topic (6 each × 16) + 4 integrative`);

    /* CHIP SANITY — exactly one option may be accepted, or the item is broken. */
    let chipMissing = 0, chipAmbiguous = 0, chipCollapse = 0;
    ITEMS.filter((i) => i.mode === 'chip').forEach((i) => {
        const hits = (i.opts || []).filter((o) => matches(o, i.answer));
        if (hits.length === 0) chipMissing++;
        if (hits.length > 1) chipAmbiguous++;
        /* Two options that normalise to the same string are the same option:
           the learner is offered a choice the grader cannot tell apart. This
           is exactly how a punctuation-only distinction becomes ungradable. */
        if (new Set((i.opts || []).map(norm)).size !== (i.opts || []).length) chipCollapse++;
    });
    eq('every chip key is one of its own options', chipMissing, 0);
    eq('no chip has two acceptable options', chipAmbiguous, 0);
    eq('no chip offers two options the normaliser cannot tell apart', chipCollapse, 0);
    ok(ITEMS.filter((i) => i.mode === 'chip').every((i) => (i.opts || []).length >= 2),
        'every chip offers at least two options');
    ok(ITEMS.filter((i) => i.mode === 'input').every((i) => !i.opts),
        'no input item carries stray options');

    /* ANSWER LEAKAGE — a prompt must not hand back its own answer, because a
       learner who copies the quoted words in order would score without knowing
       the rule. The comparison is over WHOLE WORDS, not characters: JS \b never
       fires between a Cyrillic letter and a space, and plain substring matching
       reports «Например …» as leaking the answer «Пример», which is a shared
       root, not a given-away answer. Tokenising is the only correct reading. */
    const words = (s) => norm(s).split(' ').filter(Boolean);
    const containsPhrase = (hay, needle) => {
        if (!needle.length || needle.length > hay.length) return false;
        for (let i = 0; i + needle.length <= hay.length; i++) {
            if (needle.every((w, k) => hay[i + k] === w)) return true;
        }
        return false;
    };
    let selfLeak = 0;
    ITEMS.forEach((i) => {
        if (i.mode !== 'chip') return;
        const a = words(first(i));
        if (a.length && norm(first(i)).length > 3 && containsPhrase(words(i.q), a)) selfLeak++;
    });
    eq('no chip prompt hands back its own answer verbatim', selfLeak, 0);
    /* the tokenised check must still SEE a real leak, or it proves nothing */
    ok(containsPhrase(words('Она спросила: «Где находится офис?» Косвенная речь:'),
                      words('Она спросила, где находится офис.')),
        'the leakage check catches a prompt that really does contain its answer');
    ok(!containsPhrase(words('Какую функцию выполняет «Например, компании перешли»?'),
                       words('Пример')),
        'and does not mistake a shared root («например» / «пример») for a leak');

    /* SCORED-LABEL LANGUAGE — the same guard the lessons carry. A true/false
       item must offer Правда / Ложь, never a half-translated pair.

       Matched as WHOLE LABELS, not by a \b regex: JS word boundaries are
       defined on [A-Za-z0-9_], so /\bРост\b/ never fires against a Cyrillic
       word and a guard written that way silently passes everything. */
    const BAD_LABEL = new Set(['рост', 'rost', "yolg'on", 'yolgon', 'yolg‘on',
                               "to'g'ri", 'to‘g‘ri', "noto'g'ri", 'noto‘g‘ri',
                               "notog'ri", 'верный', 'ложный']);
    const badLabel = (o) => BAD_LABEL.has(String(o == null ? '' : o).trim().toLowerCase());
    const offenders = [];
    ITEMS.forEach((i, n) => (i.opts || []).forEach((o) => {
        if (badLabel(o)) offenders.push(`item ${n + 1}: «${o}»`);
    }));
    offenders.forEach((o) => ok(false, `scored option uses a non-standard true/false label — ${o}`));
    eq('no scored option uses an Uzbek or mistyped true/false label', offenders.length, 0);
    /* the guard must be able to SEE the label it was written for */
    ok(badLabel('Рост') && badLabel("Yolg'on") && badLabel("To'g'ri"),
        'the label guard rejects Рост / Yolg\'on / To\'g\'ri');
    ok(!badLabel('Правда') && !badLabel('Ложь'),
        'and accepts the two labels this platform actually scores');

    /* MIXED-SCRIPT HOMOGLYPHS — a Latin letter where a Cyrillic one belongs
       renders identically and silently breaks matching. Same narrow rule the
       lesson guard uses: only word-initial or interior Latin is a defect. */
    const CYR = /[Ѐ-ӿԀ-ԯ]/, LAT = /[A-Za-z]/;
    const contaminated = (tok) => {
        if (!CYR.test(tok) || !LAT.test(tok)) return false;
        const kinds = [...tok].map((c) => (LAT.test(c) ? 'L' : (CYR.test(c) ? 'C' : 'x')));
        if (kinds[0] === 'L') return true;
        const lastC = kinds.lastIndexOf('C');
        return kinds.slice(0, lastC).includes('L');
    };
    const scan = (s) => String(s == null ? '' : s)
        .split(/[^0-9A-Za-zЀ-ӿԀ-ԯ]+/).filter(Boolean).filter(contaminated);
    const homo = [];
    ITEMS.forEach((i, n) => {
        [i.q, ...(i.opts || []), ...(Array.isArray(i.answer) ? i.answer : [i.answer])]
            .forEach((s) => scan(s).forEach((t) => homo.push(`item ${n + 1}: «${t}»`)));
    });
    homo.forEach((h) => ok(false, `mixed Cyrillic/Latin inside one word — ${h}`));
    eq('no exam text mixes Cyrillic and Latin inside one word', homo.length, 0);
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
    const perfectAnswers = DATA.map((g) => g.items.map(first));

    eq('a perfect paper scores 100/100', gradeLocal(perfectAnswers), 100);
    eq('an empty paper scores 0/100', gradeLocal(DATA.map((g) => g.items.map(() => ''))), 0);
    eq('a nonsense paper scores 0/100',
        gradeLocal(DATA.map((g) => g.items.map(() => 'зззz яяяy ююю'))), 0);
    /* DETERMINISM — the same paper graded twice is the same score. */
    eq('grading is deterministic', gradeLocal(perfectAnswers), gradeLocal(perfectAnswers));
    /* every DECLARED variant must actually be accepted, or it is decoration */
    let variantRejected = 0;
    ITEMS.forEach((it) => {
        if (!Array.isArray(it.answer)) return;
        it.answer.forEach((v) => { if (!matches(v, it.answer)) variantRejected++; });
    });
    eq('every declared accepted variant really is accepted', variantRejected, 0);
    /* A WRONG CHIP IS WRONG. Picking any distractor must lose the mark. */
    let distractorAccepted = 0;
    ITEMS.filter((i) => i.mode === 'chip').forEach((i) => {
        (i.opts || []).forEach((o) => {
            if (!matches(o, i.answer)) return;
            if (norm(o) !== norm(first(i))) distractorAccepted++;
        });
    });
    eq('no distractor is quietly accepted', distractorAccepted, 0);

    /* THE SERVER IS THE GRADER. Run the real scoring module over the real
       canon, so any drift between page and canon fails here. */
    return (async () => {
        const scoring = await import('file://' + path.join(ROOT, 'api/_lib/exam-scoring.js'));
        const canonMod = await import('file://' + path.join(ROOT, 'api/_lib/course-canon.js'));

        /* A CANON WITH NO B2 IN IT IS THE FAILURE, NOT A CRASH. If the exam
           were dropped from the builder, every assertion below would throw on
           undefined and take the rest of the suite with it — so the presence of
           the entry is asserted first, and what follows is null-safe. */
        const B2X = canonMod.EXAM_CANON.B2 || null;
        const B2C = canonMod.COURSE_CANON.B2 || null;
        ok(!!B2X, 'the server canon carries a B2 exam at all');
        ok(!!B2C, 'and a B2 course');
        ok(scoring.isExamCourse('B2'), 'the server recognises B2 as an exam course');
        eq('the server counts 100 gradable items',
            B2X ? scoring.examTotal('B2') : null, 100);
        eq('A1, A2 and B1 remain exam courses',
            ['A1', 'A2', 'B1'].every((c) => scoring.isExamCourse(c)), true);
        eq('the canon lists B2 with 16 topics', B2C ? B2C.totalTopics : null, 16);
        eq('the canon lists B2 topic ids 1..16',
            B2C ? B2C.topicIds.join(',') : null,
            Array.from({ length: 16 }, (_, i) => i + 1).join(','));
        eq('the canon carries ten B2 exam groups', B2X ? B2X.groups.length : null, 10);
        eq('the canon pass mark is 80', B2X ? B2X.passMark : null, 80);
        eq('the canon punctuation class matches the page',
            B2X ? B2X.punctuation : null, punct);
        /* the canon's key must BE the page's key, item for item */
        let canonDrift = 0;
        ((B2X && B2X.groups) || []).forEach((g, gi) => (g.items || []).forEach((it, ii) => {
            const mine = (DATA[gi] && DATA[gi].items[ii]) || {};
            if (JSON.stringify(it.answer) !== JSON.stringify(mine.answer)) canonDrift++;
            if (it.q !== mine.q) canonDrift++;
        }));
        eq('the server canon is the page, item for item', canonDrift, 0);

        const safeGrade = (answers) => {
            try { return scoring.gradeExam('B2', answers); }
            catch (e) { return { correct: null, total: null, score: null,
                                 passMark: null, passed: null, error: e.message }; }
        };
        const g = safeGrade(perfectAnswers);
        eq('server: perfect paper correct', g.correct, 100);
        eq('server: perfect paper total', g.total, 100);
        eq('server: perfect paper score', g.score, 100);
        eq('server: pass mark', g.passMark, 80);
        eq('server: perfect paper passes', g.passed, true);

        const empty = safeGrade(DATA.map((x) => x.items.map(() => '')));
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
        const atMark = safeGrade(withCorrect(80));
        eq('server: exactly 80 correct scores 80', atMark.score, 80);
        eq('server: exactly the pass mark PASSES', atMark.passed, true);
        const below = safeGrade(withCorrect(79));
        eq('server: 79 correct scores 79', below.score, 79);
        eq('server: one below the mark FAILS', below.passed, false);
        eq('server: 99 correct still passes', safeGrade(withCorrect(99)).passed, true);
        /* the server grades the SAME way twice */
        eq('server grading is deterministic',
            safeGrade(withCorrect(80)).score,
            safeGrade(withCorrect(80)).score);
        console.log('  grading · perfect 100 PASS · 80 PASS · 79 FAIL · empty 0 FAIL');

        /* A hostile payload is refused before grading. */
        const bad = (a) => { try { scoring.assertSubmissionShape('B2', a); return false; } catch (e) { return true; } };
        ok(bad(null), 'a null submission is refused');
        ok(bad('x'), 'a string submission is refused');
        ok(bad(JSON.parse('{"__proto__":[]}')), 'a prototype-probing key is refused');
        ok(bad({ toString: [] }), 'a named non-index key is refused');
        ok(bad({ 99: [] }), 'a group index beyond the exam is refused');
        ok(bad(DATA.concat([{ items: [] }]).map(() => [])), 'more groups than the exam has is refused');
        ok(bad(DATA.map((x) => x.items.map(() => 'x'.repeat(500)))), 'an oversized answer is refused');
        ok(!bad(perfectAnswers), 'a well-formed submission is accepted');

        /* --------------------------------------------- 3. THE PAGE */
        {
            ok(/var TOTAL_QUESTIONS = 0;/.test(SRC), 'the page counts its own questions');
            ok(/var COURSE = 'B2';/.test(SRC), 'the page declares course B2');
            ok(/var REQUIRED_TOPICS = 16;/.test(SRC), 'the completion gate is 16 topics');
            ok(!/var REQUIRED_TOPICS = (12|20);/.test(SRC), "and not A1's 12 or B1's 20");
            ok(/var COURSE_PAGE = 'b2-course\.html';/.test(SRC), 'it returns to the B2 course');
            ok(/var TOTAL_SECONDS = 120 \* 60;/.test(SRC), 'the exam runs 120 minutes');
            ok(/var passed = pct >= 80;/.test(SRC), 'the page previews the 80% mark');
            ok(/submitFinalExam\('B2', examAnswers\)/.test(SRC),
                'the page submits to the shared server grader as B2');
            /* THE CLOCK IS A DEADLINE, NOT A COUNTDOWN VARIABLE — a reload or a
               closed laptop must not hand back fresh time. */
            ok(/deadline = startedAt \+ TOTAL_SECONDS \* 1000;/.test(SRC),
                'the clock is stored as an absolute deadline');
            ok(/secondsLeft = Math\.max\(0, Math\.round\(\(deadline - Date\.now\(\)\) \/ 1000\)\)/.test(SRC),
                'and the remaining time is recomputed from it, not decremented');
            ok(/saved\.deadline <= Date\.now\(\)/.test(SRC),
                'a deadline that already passed while away auto-submits');
            /* USER-SCOPED DRAFT — one account's answers must not leak to another. */
            ok(/var STATE_KEY = 'b2_finalexam_state_' \+ USER_ID;/.test(SRC),
                'the draft key is scoped to the user');
            ok(/var COMPLETION_KEY = 'b2_completion_' \+ USER_ID;/.test(SRC),
                'the completion cache key is scoped to the user');

            /* ---- ELIGIBILITY IS AUTHORITATIVE OR NOTHING ---- */
            ok(!/localStorage\.getItem\('b2_progress_'/.test(SRC),
                'localStorage is never read as exam eligibility');
            ok(!/getCompletedTopicCount/.test(SRC),
                'no localStorage-backed gate helper exists');
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
                const at = SRC.indexOf('function showExamSyncError');
                const body = SRC.slice(at, SRC.indexOf('function showExamLocked', at));
                ok(/tekshirib bo/.test(body), 'the sync screen says the state could not be checked');
                ok(!/tugating/.test(body), 'and does not claim the course is unfinished');
            }

            /* ---- THE SERVER'S VERDICT IS THE ONLY VERDICT ---- */
            {
                const p = SRC.indexOf('async function persistResult');
                /* The window starts where the GUEST EARLY-RETURN ends, not at the
                   first thing inside it. Anchoring on waitForSync() looked
                   equivalent and was not: a side effect inserted between the
                   guest branch and that call sits in the signed-in path and
                   would fall outside the slice entirely. */
                const guestMark = SRC.indexOf('certificateUnlocked: false', p);
                ok(guestMark > p, 'the guest early-return is where it was');
                const guestEnd = SRC.indexOf('\n            }', guestMark) + 1;
                ok(guestEnd > guestMark, 'the signed-in path begins after the guest branch');
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
                const bail = body.search(/return \{\s*\r?\n?\s*ok: false/);
                ok(bail > submit && bail < at(/saveQuizResult\(/),
                    'a missing verdict returns before any side effect runs');
                ok(/passed = server\.passed === true/.test(body),
                    'pass/fail is read off the server response');
                ok(/var score = server\.score/.test(body), 'and so is the score');
                ok(/if \(passed\) \{[\s\S]{0,200}setItem\(COMPLETION_KEY/.test(body),
                    'the completion cache is gated on the SERVER pass');
                ok(/passed && window\.currentUser && window\.logActivity/.test(body),
                    'the "passed the exam" activity line is gated on the server pass');
                ok(!/grantCompletion/.test(SRC),
                    'there is no client-side completion decision at all');

                /* AND THE SAME CONTRACT, PAGE-WIDE. The slice above proves the
                   ORDER inside persistResult; this proves nothing anywhere else
                   on the page writes the completion cache first. There is one
                   submission and every completion write must follow it. */
                const submitAt = SRC.indexOf('window.submitFinalExam(');
                eq('the page submits in exactly one place',
                    (SRC.match(/window\.submitFinalExam\(/g) || []).length, 1);
                const writes = [];
                let at2 = SRC.indexOf('setItem(COMPLETION_KEY');
                while (at2 > -1) { writes.push(at2); at2 = SRC.indexOf('setItem(COMPLETION_KEY', at2 + 1); }
                ok(writes.length > 0, 'the completion cache is written somewhere');
                eq('every completion-cache write on the page follows the submission',
                    writes.filter((w) => w < submitAt).length, 0);
            }
            {
                ok(/renderResult\(results, outcome\.score, outcome\.score, outcome\.correct,\s*\r?\n?\s*outcome\.passed/.test(SRC),
                    'the result screen renders the server outcome, not the preview');
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
            /* COPY-PASTE REGRESSION — this page was built from the A2 one. */
            eq('no A2 reference survived the copy', (SRC.match(/\bA2\b|a2[-_]/g) || []).length, 0);
            eq('no B1 reference either', (SRC.match(/\bB1\b|b1[-_]/g) || []).length, 0);
            eq('no A1 reference either', (SRC.match(/\bA1\b|a1[-_]/g) || []).length, 0);
            ok(!/20 ta mavzu/.test(SRC), 'no leftover "20 topics" copy');
            ok(!/12 ta mavzu/.test(SRC), 'no leftover "12 topics" copy');
            ok(/16 ta mavzu/.test(SRC), 'the page tells the learner it covers 16 topics');
            ok(/10 bo'lim/.test(SRC), 'and that it has ten groups');
            ok(!/5 bo'lim/.test(SRC), 'not the five the A2 page has');
            /* The draft must never carry the verdict. */
            ok(!/finalExamPassed:\s*true[\s\S]{0,200}STATE_KEY/.test(SRC),
                'the in-progress draft does not carry a pass flag');
            /* LINE ENDINGS — every sibling exam page is pure CRLF. */
            eq('the page is pure CRLF, like its siblings',
                (SRC.match(/(?<!\r)\n/g) || []).length, 0);
        }

        /* --------------------------------------------- 4. SERVER SECURITY */
        {
            const endpoint = fs.readFileSync(path.join(ROOT, 'api/_progress/final-exam.js'), 'utf8');
            ok(/const graded = gradeExam\(course, body\.answers\)/.test(endpoint),
                'the endpoint grades the submitted answers itself');
            ok(!/body\.(score|passed)/.test(endpoint),
                'and never reads a score or a verdict from the request body');
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
            /* the endpoint is generic: nothing about it names a course */
            ok(!/'B2'|"B2"/.test(endpoint),
                'the endpoint stayed generic — B2 needed no special case');

            const certs = fs.readFileSync(path.join(ROOT, 'api/_lib/certificates.js'), 'utf8');
            ok(/B2:\s*\{/.test(certs), 'B2 is a certifiable course');
            ok(/A1:\s*\{/.test(certs) && /A2:\s*\{/.test(certs) && /B1:\s*\{/.test(certs),
                'A1, A2 and B1 remain certifiable');
            ok(/courseData\.finalExamPassed === true/.test(certs),
                'certificate eligibility rests on the server-written flag');
            ok(/courseData\.certificateNumber/.test(certs),
                'issuance is idempotent on the stored certificate number');
            ok(/UZD-\$\{COURSE\}-\$\{year\}/.test(certs),
                'B2 certificate numbers come from the shared generator');

            const client = fs.readFileSync(path.join(ROOT, 'firebase-client.js'), 'utf8');
            ok(/'b2-final-exam\.html'/.test(client), 'the exam page is in the access allowlist');
            const packLine = client.match(/B1B2:\s*\[[^\]]*\]/)[0];
            ok(packLine.includes('b2-final-exam.html'),
                'and specifically in the B1B2 pack, like the B2 course itself');
            ok(!/A1A2:\s*\[[^\]]*b2-final-exam/.test(client),
                'it is not exposed through the A1A2 pack');
            /* ACCESS IS BY PACK, NEVER BY A VISIBLE PLAN NAME. */
            ok(!/START|STANDART|TURBO|PREMIUM/.test(client.match(/const packToCourses[\s\S]*?\};/)[0]),
                'the allowlist maps pages to packs, not to tariff labels');
        }

        /* --------------------------------------------- 5. COURSE PAGE ENTRY */
        {
            const course = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-course.html'), 'utf8');
            ok(/id="finalExamEntry"/.test(course), 'the course page has the final-exam entry block');
            ok(/function renderFinalExamEntry\(\)/.test(course), 'and renders it');
            ok(/renderFinalExamEntry\(\);/.test(course.slice(course.indexOf('function renderTopics'))),
                'the entry is repainted whenever the topic grid is');
            ok(/b2-final-exam\.html/.test(course), 'the start button points at the B2 exam');
            ok(/function b2CertificateUnlocked\(\)/.test(course), 'certificate state is computed');
            ok(/function ensureB2CertificateIssued\(\)/.test(course),
                'issuance goes through the shared certificate API');
            ok(/window\.issueCertificate\('B2'\)/.test(course), 'as course B2');
            ok(/id="b2CertOverlay"/.test(course), 'the certificate modal exists');
            ok(/barcha ' \+ totalCount \+ ' ta mavzuni/.test(course),
                'the locked copy counts topics from the syllabus, not a literal');
            ok(!/barcha 20 ta mavzuni/.test(course), 'and never 20');
            /* THE ENTRY IS NOT A TOPIC. B2 ends at 16; the exam must not be
               rendered as a seventeenth lesson card. */
            ok(!/Topic ?17|topic17|\bid: 17\b/.test(course), 'no seventeenth topic was invented');
            /* the certificate must not open off a cached flag */
            ok(/fbConfirmed/.test(course), 'a pass only counts when Firebase confirmed it');
            ok(/if \(fromFirebase && src\.finalExamPassed\) b2Completion\.fbConfirmed = true;/.test(course),
                'and fbConfirmed is set ONLY on the Firebase-sourced record');
            ok(/mergeB2Completion\(rp, true\)/.test(course),
                'the Firestore course record is actually merged in');
            ok(/mergeB2Completion\(readLocalB2Completion\(\), false\)/.test(course),
                'and the localStorage cache is merged as non-authoritative');
            {
                const at = course.indexOf('function b2CertificateUnlocked');
                const body = course.slice(at, course.indexOf('function renderFinalExamEntry', at));
                ok(/b2AllTopicsCompleted\(\) && b2Completion\.finalExamPassed && b2Completion\.fbConfirmed/.test(body),
                    'the certificate needs all topics AND a confirmed pass');
            }
            {
                const at = course.indexOf('function showB2Certificate');
                const body = course.slice(at, at + 400);
                ok(/if \(!b2CertificateUnlocked\(\)\) return;/.test(body),
                    'and the modal refuses to open without it');
            }
        }

        console.log('='.repeat(60));
        if (fail) {
            console.log(`  ❌ B2 FINAL EXAM: ${fail} failed / ${pass + fail}\n`);
            failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
            console.log('='.repeat(60) + '\n');
            process.exit(1);
        }
        console.log(`  ✅ B2 FINAL EXAM: ${pass}/${pass} passed`);
        console.log('='.repeat(60) + '\n');
    })();
}
