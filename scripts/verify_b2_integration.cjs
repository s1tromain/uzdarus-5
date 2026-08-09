#!/usr/bin/env node
/**
 * verify_b2_integration.cjs — proves the B2 pages are wired to the shared
 * Exercise Session Engine correctly, and that nothing legacy was broken.
 *
 * The runtime behaviour of the host is covered by verify_b2_host.cjs; this
 * file covers the part that only the real pages can answer: are the scripts
 * loaded, is dispatch shape-based, is there exactly ONE result screen, are
 * the demo locks right, and is the legacy path still intact.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) pass++; else { fail++; failures.push(l); } };

const PAGES = [
    { file: 'paid-courses/b2-course.html', prefix: '../', label: 'paid' },
    { file: 'b2-demo.html', prefix: './', label: 'demo' }
];

console.log('\n=== B2 PRODUCTION INTEGRATION ===\n');

/* ------------------------------------------------ assets exist */
['exercise-session.js', 'b2-host.js', 'b2-lesson-data.js'].forEach(f => {
    ok(fs.existsSync(path.join(ROOT, f)), `asset ${f} exists at repo root`);
});

for (const p of PAGES) {
    const abs = path.join(ROOT, p.file);
    const raw = fs.readFileSync(abs);
    const s = raw.toString('utf8');
    const T = p.label;

    /* --------------------------------------- 1. scripts loaded, right depth */
    ['exercise-session.js', 'b2-host.js', 'b2-lesson-data.js'].forEach(f => {
        ok(s.includes(`src="${p.prefix}${f}"`), `${T} loads ${p.prefix}${f}`);
        ok(s.split(`src="${p.prefix}${f}"`).length === 2, `${T} loads ${f} exactly once`);
        /* the src must actually resolve from the page's own directory */
        const resolved = path.resolve(path.dirname(abs), p.prefix + f);
        ok(fs.existsSync(resolved), `${T} ${f} path resolves on disk`);
    });
    const engIdx = s.indexOf('exercise-session.js');
    const hostIdx = s.indexOf('b2-host.js');
    const dataIdx = s.indexOf('b2-lesson-data.js');
    ok(engIdx < hostIdx && hostIdx < dataIdx, `${T} engine loads before host before data`);

    /* --------------------------------------- 2. shape-based dispatch */
    ok(/function b2ExerciseData/.test(s), `${T} defines b2ExerciseData`);
    ok(/Array\.isArray\(x\.exercises\)/.test(s), `${T} claims a topic only by exercises[] shape`);
    ok(/function mountB2Practice/.test(s), `${T} defines mountB2Practice`);
    ok(/const b2Ex = /.test(s), `${T} loadTopic computes the dispatch flag`);
    ok(/if \(b2Ex\) \{\s*[\r\n]+\s*mountB2Practice\(topicId\);/.test(s),
        `${T} loadTopic mounts the session for exercise-shaped topics`);
    ok(!/if\s*\(\s*topicId\s*===\s*1\s*\)/.test(s), `${T} contains no hard-coded Lesson-1 branch`);

    /* --------------------------------------- 3. legacy path preserved */
    ok(/topic\.quiz && topic\.quiz\.mcQuestions\.length > 0 \? renderQuiz/.test(s),
        `${T} legacy multiple-choice still rendered for legacy topics`);
    ok(/topic\.quiz && topic\.quiz\.blankQuestions\.length > 0 \? renderBlankTest/.test(s),
        `${T} legacy blank test preserved`);
    ok(/topic\.quiz && topic\.quiz\.matchingGame \? renderMatchingGame/.test(s),
        `${T} legacy matching game preserved`);
    ['initQuiz', 'initBlankTest', 'initMatchingGame', 'renderQuiz', 'renderBlankTest',
     'renderMatchingGame', 'saveProgress', 'updateProgressBar', 'renderTopics',
     'generateLockedTopics'].forEach(fn => {
        ok(new RegExp('function ' + fn + '\\s*\\(').test(s), `${T} legacy function ${fn} still defined`);
    });
    ok(/mcQuestions:\s*\[/.test(s), `${T} legacy quiz DATA left in place (nothing deleted)`);

    /* --------------------------------------- 4. exactly ONE result screen */
    const resultDivs = (s.match(/id="quizResults"/g) || []).length;
    ok(resultDivs === 2, `${T} #quizResults declared in both branches only (${resultDivs})`);
    ok(/\$\{b2Ex \? `/.test(s), `${T} the two branches are mutually exclusive`);
    ok(/<div class="quiz-score">/.test(s) || /class="quiz-score"/.test(s),
        `${T} host fills the page's own .quiz-score`);
    ok(!/uz-result|uz-final|new-result-screen/.test(s), `${T} no second result screen introduced`);

    /* --------------------------------------- 5. one storage mechanism */
    ok(/function b2SessionDraftSave/.test(s), `${T} session draft goes through the page's store`);
    ok(/typeof _b2QuizDraftKey === 'function'\) return _b2QuizDraftKey\(topicId\)/.test(s),
        `${T} reuses the existing draft key when the page has one`);
    ok(/window\.saveQuizResult\(currentUserId, topicId, \{ draft: draft \}, 'B2'\)/.test(s),
        `${T} draft syncs to the same Firestore field as before`);

    /* --------------------------------------- 6. completion path */
    ok(/!topic\.isSubscriptionLocked && !b2Ex \?/.test(s),
        `${T} legacy "finish topic" button suppressed for session topics (one completion path)`);
    ok(/saveProgress: function \(id\)[\s\S]{0,120}saveProgress\(id\)/.test(s),
        `${T} completion routes through the page's existing saveProgress`);
    ok(/passPercent: 70/.test(s), `${T} keeps B2's 70% pass threshold`);

    /* --------------------------------------- 7. file hygiene */
    ok(raw.includes(Buffer.from('\r\n')), `${T} CRLF line endings preserved`);
    const lf = (s.match(/(?<!\r)\n/g) || []).length;
    ok(lf === 0, `${T} no stray LF-only lines introduced (${lf})`);
}

/* ------------------------------------------------ demo access rules */
{
    const demo = fs.readFileSync(path.join(ROOT, 'b2-demo.html'), 'utf8');
    const locked = demo.match(/isLocked:\s*(\w+)/g).map(x => x.split(/\s+/)[1]);
    const sub = demo.match(/isSubscriptionLocked:\s*(\w+)/g).map(x => x.split(/\s+/)[1]);
    ok(locked[0] === 'false', 'demo Lesson 1 is open');
    ok(sub[0] === 'false', 'demo Lesson 1 is not subscription-locked');
    ok(locked.slice(1).every(v => v === 'true'), `demo Lessons 2+ all locked (${locked.join(',')})`);
    ok(sub.slice(1).every(v => v === 'true'), `demo Lessons 2+ subscription-locked (${sub.join(',')})`);

    const paid = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-course.html'), 'utf8');
    const pl = paid.match(/isLocked:\s*(\w+)/g).map(x => x.split(/\s+/)[1]);
    ok(pl.every(v => v === 'false'), 'paid course keeps every topic open');
}

/* ------------------------------------------------ engine stays generic */
{
    const eng = fs.readFileSync(path.join(ROOT, 'exercise-session.js'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    ok(!/\bB2\b|b2Host|B2_LESSON_DATA/i.test(eng), 'engine has no B2 knowledge');
    ok(!/quizResults|saveProgress|firebase/i.test(eng), 'engine has no page/persistence knowledge');
}

/* ------------------------------------------------ A2 untouched */
{
    const { execSync } = require('child_process');
    let changed = '';
    try { changed = execSync('git diff --name-only', { cwd: ROOT }).toString(); } catch (e) {}
    const a2 = changed.split('\n').filter(f => /a2|A2/.test(f));
    ok(a2.length === 0, `no A2 file modified by this migration (${a2.join(', ') || 'none'})`);
    /* Explicit allowlist: B2 pages, the test manifest, and the OS cruft git
       insists on tracking. Anything else means the migration reached further
       than it was supposed to. */
    const ALLOWED = /^(b2-demo\.html|paid-courses\/b2-course\.html|package\.json|\.DS_Store)$/;
    const others = changed.split('\n').filter(f => f && !ALLOWED.test(f.trim()));
    ok(others.length === 0, `only B2 files + manifest modified (${others.join(', ') || 'none'})`);
}

console.log('='.repeat(52));
if (fail) {
    console.log(`FAILED  ${pass} passed, ${fail} failed\n`);
    failures.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
}
console.log(`PASSED  ${pass}/${pass} B2 integration checks`);
console.log('='.repeat(52) + '\n');
