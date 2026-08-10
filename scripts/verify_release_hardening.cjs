#!/usr/bin/env node
/**
 * verify_release_hardening.cjs — the three pre-release fixes, locked down.
 *
 *   1. no console command can unlock paid content
 *   2. one normaliser serves every course
 *   3. every course is visible to the shared coverage auditor
 *
 * These are the kind of things that come back quietly, so each is asserted
 * rather than trusted.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) pass++; else { fail++; failures.push(l); } };

const PAGES = [
    'paid-courses/a1-course.html', 'a1-demo.html',
    'paid-courses/a2-course.html', 'a2-demo.html',
    'paid-courses/b1-course.html', 'b1-demo.html',
    'paid-courses/b2-course.html', 'b2-demo.html'
];

console.log('\n=== RELEASE HARDENING ===\n');

/* ---------------------------------------------- 1. no paywall bypass */
for (const rel of PAGES) {
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) continue;
    const s = fs.readFileSync(f, 'utf8');
    ok(!/unlockAllLessons/.test(s), `${rel}: no unlockAllLessons()`);
    ok(!/lockLessons/.test(s), `${rel}: no lockLessons()`);
    ok(!/DEVELOPER COMMANDS/.test(s), `${rel}: no console advertisement of dev commands`);
    /* nothing else may flip the subscription flag wholesale at runtime */
    const bulk = /topics\.forEach\([^)]*\)\s*=>\s*\{[^}]*isSubscriptionLocked\s*=\s*false/.test(s)
              || /isSubscriptionLocked\s*=\s*false\s*;[\s\S]{0,80}loadTopics\(\)/.test(s);
    ok(!bulk, `${rel}: nothing unlocks every topic at once`);
}

/* the demo pages must still declare their locks */
[['a1-demo.html', 1], ['a2-demo.html', 1], ['b1-demo.html', 1], ['b2-demo.html', 1]].forEach(([rel]) => {
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return;
    const s = fs.readFileSync(f, 'utf8');
    const locked = (s.match(/isSubscriptionLocked:\s*true/g) || []).length;
    ok(locked > 0, `${rel}: still declares locked topics (${locked})`);
});

/* ---------------------------------------------- 2. one normaliser */
{
    ok(fs.existsSync(path.join(ROOT, 'shared-normalizer.js')), 'shared-normalizer.js exists');

    const w = new JSDOM('<!doctype html><html><body></body></html>',
        { runScripts: 'outside-only' }).window;
    w.eval(fs.readFileSync(path.join(ROOT, 'shared-normalizer.js'), 'utf8'));
    ['sentence-builder.js', 'course-exercise-ui.js'].forEach(f =>
        w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

    const grab = (file, name, rename) => {
        const h = fs.readFileSync(path.join(ROOT, file), 'utf8');
        const i = h.indexOf('function ' + name + '(');
        if (i < 0) return null;
        let d = 0, st = false;
        for (let k = h.indexOf('{', i); k < h.length; k++) {
            if (h[k] === '{') { d++; st = true; }
            else if (h[k] === '}') {
                d--;
                if (st && d === 0) {
                    const src = h.slice(i, k + 1);
                    return rename ? src.replace(name, rename) : src;
                }
            }
        }
        return null;
    };
    const course = [
        ['paid-courses/a2-course.html', 't1Norm', 'a2Norm'],
        ['paid-courses/b1-course.html', 't1Norm', 'b1Norm'],
        ['paid-courses/a1-course.html', 'normalizeTopic6Text', 'a1Norm']
    ];
    const names = [];
    course.forEach(([f, n, as]) => {
        const src = grab(f, n, as);
        ok(!!src, `${f}: ${n}() found`);
        if (src) { w.eval(src); names.push(as); }
    });

    /* Every course must delegate rather than carry its own rule. */
    course.forEach(([f, n]) => {
        const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
        const i = h.indexOf('function ' + n + '(');
        const body = h.slice(i, i + 600);
        ok(/UzNormalize/.test(body), `${f}: ${n}() delegates to the shared normaliser`);
    });
    ok(/UzNormalize/.test(fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8')),
        'course-exercise-ui.js delegates to the shared normaliser');
    ok(/UzNormalize/.test(fs.readFileSync(path.join(ROOT, 'sentence-builder.js'), 'utf8')),
        'sentence-builder.js delegates to the shared normaliser');

    PAGES.slice(0, 6).forEach(rel => {
        const f = path.join(ROOT, rel);
        if (!fs.existsSync(f)) return;
        const s = fs.readFileSync(f, 'utf8');
        if (!/UzNormalize/.test(s)) return;         // page has no normaliser at all
        ok(/src="[^"]*shared-normalizer\.js"/.test(s), `${rel}: loads shared-normalizer.js`);
    });

    /* and they must actually agree, including the case that had drifted */
    const CASES = ['Был', 'ёлка', 'был.', '  был  ', 'был, была', '«был»',
                   'Я — был', 'по-русски', "To'g'ri", 'Несмотря на то, что', ''];
    let disagreements = 0;
    CASES.forEach(c => {
        const vals = [w.UzNormalize(c), w.UzExerciseUI.norm(c), w.UzSentenceBuilder._norm(c)]
            .concat(names.map(n => w[n](c)));
        if (new Set(vals).size !== 1) {
            disagreements++;
            failures.push(`normalisers disagree on ${JSON.stringify(c)}: ${JSON.stringify(vals)}`);
        }
    });
    ok(disagreements === 0, `all normalisers agree on ${CASES.length} cases`);
    if (disagreements) fail += 0;   // already recorded above

    /* the specific bug that existed before the unification */
    ok(w.UzNormalize('Я — был') === 'я был', 'the em dash is stripped');
    names.forEach(n => ok(w[n]('Я — был') === w.UzNormalize('Я — был'),
        `${n}() strips the em dash like everyone else`));
}

/* ---------------------------------------------- 3. every course audited */
{
    const cov = fs.readFileSync(path.join(ROOT, 'scripts/verify_lesson_result_coverage.cjs'), 'utf8');
    ok(/ENGINE-PATH COVERAGE/.test(cov), 'the coverage auditor has an engine path');
    ok(/ENGINE_COURSES/.test(cov), 'engine-path courses are declared');
    ok(/b2-lesson-data\.js/.test(cov), 'B2 is included in the engine path');

    const { execSync } = require('child_process');
    let out = '';
    try { out = execSync('node scripts/verify_lesson_result_coverage.cjs', { cwd: ROOT }).toString(); }
    catch (e) { out = (e.stdout || '').toString(); }
    ok(/COVERAGE OK/.test(out), 'the coverage audit passes');
    ['A1', 'A2', 'B1'].forEach(c =>
        ok(new RegExp(`${c}: \\d+ topics — \\d+ with collectable exercises, [1-9]\\d* answers audited`).test(out),
            `${c} contributes audited answers`));
    ok(/B2: \d+ topics — \d+ with engine exercises, [1-9]\d* answers audited/.test(out),
        'B2 contributes audited answers (engine path)');
}

console.log('='.repeat(58));
if (fail) {
    console.log(`  ❌ RELEASE HARDENING: ${fail} failed / ${pass + fail}\n`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(58) + '\n');
    process.exit(1);
}
console.log(`  ✅ RELEASE HARDENING: ${pass}/${pass} passed`);
console.log('='.repeat(58) + '\n');
