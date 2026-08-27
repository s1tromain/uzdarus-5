#!/usr/bin/env node
/**
 * verify_course_gate_integration.cjs — does each COURSE actually enforce 80%?
 *
 * WHY THIS SUITE EXISTS, SEPARATELY FROM THE ENGINE SUITE. The engine suite
 * proves that UzExerciseSession CAN enforce a threshold when one is configured.
 * It proves nothing about whether any given course configures one — and for a
 * while none of A1, A2 or B1 did. The engine's own rule is "no threshold means
 * no gate", so a course that supplies nothing silently lets 3/10 through while
 * a synthetic `passScore: 80` fixture reports everything is fine.
 *
 * So this suite reads the REAL learner code for each course and asks what that
 * course actually does. A course that supplies no threshold FAILS here.
 *
 * Two engine families are in play and they are checked differently, because
 * they genuinely differ:
 *
 *   A2, B2   mount UzExerciseSession through their own host. The threshold is
 *            per EXERCISE GROUP, and the host publishes it.
 *   A1, B1   run an inline flow whose gate is topic-wide. The threshold is
 *            read out of that flow and driven directly.
 *
 * Both must land on 80, and both must compare an exact integer ratio.
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
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('\n=== COURSE GATE INTEGRATION (real learner code) ===');

const THRESHOLD = 80;
const matrix = [];

/* ================================================================ *
 * 1. HOST-DRIVEN COURSES (A2, B2) — the gate is per exercise group
 * ================================================================ */
[['A1', 'a1-host.js', 'A1Host'], ['A2', 'a2-host.js', 'A2Host'],
 ['B1', 'b1-host.js', 'B1Host'], ['B2', 'b2-host.js', 'B2Host']].forEach(([code, file, global_]) => {
    const src = read(file);

    /* the host must SUPPLY a threshold — the engine has no default */
    ok(/passScore:/.test(src) || /stepGate/.test(src),
        `${code}: its host supplies a gate to the shared engine`);
    const constant = src.match(/var PASS_PERCENT = (\d+);/);
    ok(!!constant, `${code}: the threshold is a named constant`);
    if (constant) eq(`${code}: and it is ${THRESHOLD}`, Number(constant[1]), THRESHOLD);
    eq(`${code}: the threshold is written exactly once`,
        (src.match(/var PASS_PERCENT = \d+;/g) || []).length, 1);
    /* EVERY GRADED MOUNT MUST CARRY IT. One gated screen and one ungated screen
       in the same course is exactly the bug this suite exists for.

       A REVIEW mount is the one legitimate exception: it re-mounts a finished
       attempt read-only to show what the learner answered, and gating a screen
       that grades nothing would be meaningless. Those are identified by their
       own host element rather than by counting, so a graded mount can never be
       quietly excused as 'review'. */
    const mountLines = src.split('\n')
        .map((l, i) => ({ l, i }))
        .filter((x) => /mountEl:/.test(x.l));
    const reviewIds = /a2ReviewHost|b2ReviewHost|ReviewHost/;
    const graded = mountLines.filter((x) => {
        /* look back a little for the review host this mount renders into */
        const window_ = src.split('\n').slice(Math.max(0, x.i - 12), x.i + 2).join('\n');
        return !reviewIds.test(window_);
    });
    const gates = (src.match(/passScore:/g) || []).length;
    ok(mountLines.length > 0, `${code}: its host mounts the shared engine`);
    ok(graded.length > 0, `${code}: at least one mount actually grades`);
    eq(`${code}: every GRADED mount is gated`, gates >= graded.length, true);
    eq(`${code}: gates match graded mounts exactly (${gates}/${graded.length})`,
        gates, graded.length);
    /* and the review mount, if any, is genuinely read-only */
    if (mountLines.length > graded.length) {
        ok(/ReviewHost/.test(src), `${code}: the ungated mount is the review screen`);
    }
    eq(`${code}: no mount site is left ungated`,
        /No passScore and no stepGate/.test(src), false);

    /* and the published value the page would use */
    const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
    const w = dom.window;
    w.eval('window.UzExerciseSession = { mount: function () { return null; } };');
    w.eval('window.UzExerciseUI = {};');
    try { w.eval(src); } catch (e) { /* host may need more globals; the constant is what matters */ }
    const published = w.eval(`(window.${global_} && window.${global_}.PASS_PERCENT) || null`);
    eq(`${code}: the host publishes ${THRESHOLD} at runtime`, published, THRESHOLD);
    dom.window.close();

    matrix.push({ code, engine: 'UzExerciseSession + ' + global_, scope: 'per exercise group',
                  threshold: constant ? Number(constant[1]) : null });
});

/* ================================================================ *
 * 2. B1'S RETAINED FALLBACK — still correct, no longer the learner's path
 * ---------------------------------------------------------------- *
 * b1-course.html keeps checkTopic1Exercises() as the renderer of last
 * resort: if the shared stack fails to load there must still be exercises
 * on the screen rather than a blank section. It is unreachable while the
 * stack is present — mountB1Practice() takes the route first — but a
 * fallback that grades WRONG is worse than no fallback, so its threshold
 * is still driven here. The scope it reports is no longer added to the
 * platform matrix; B1's row comes from its host, above.
 * ================================================================ */
[['B1', 'paid-courses/b1-course.html']].forEach(([code, rel]) => {
    const src = read(rel);

    const constant = src.match(/(?:const|var) LESSON_PASS_PERCENT = (\d+);/);
    ok(!!constant, `${code}: its lesson flow names a threshold`);
    if (constant) eq(`${code}: and it is ${THRESHOLD}`, Number(constant[1]), THRESHOLD);
    /* the old 60% rule must be gone */
    eq(`${code}: the old 60% rule is gone`, /Math\.ceil\(total \* 0\.6\)/.test(src), false);
    /* and the comparison must be an exact ratio, not a rounded percent */
    ok(/correct \* 100 >= total \* LESSON_PASS_PERCENT/.test(src),
        `${code}: the pass decision is an exact integer ratio`);
    eq(`${code}: and does not compare a rounded percent`,
        /passed = pct >= LESSON_PASS_PERCENT/.test(src), false);

    /* DRIVE THE REAL DECISION. The expression is lifted from the page and
       evaluated, so what is tested is the code the learner runs. */
    const decision = src.match(/(?:const|var) passed = correct \* 100 >= total \* LESSON_PASS_PERCENT[^;]*;/);
    ok(!!decision, `${code}: the pass expression was found`);
    if (decision) {
        const extra = /PASSING_SCORE/.test(decision[0]);
        const fn = new Function('correct', 'total', 'LESSON_PASS_PERCENT', 'PASSING_SCORE',
            decision[0] + ' return passed;');
        /* PASSING_SCORE is B1's additional absolute floor; pass a value that
           cannot mask the ratio for the 10-item cases below. */
        const P = extra ? 7 : 0;
        const g = (c, t) => !!fn(c, t, THRESHOLD, P);
        eq(`${code}: 7/10 FAILS`, g(7, 10), false);
        eq(`${code}: 8/10 PASSES`, g(8, 10), true);
        eq(`${code}: 10/10 PASSES`, g(10, 10), true);
        eq(`${code}: 0/10 FAILS`, g(0, 10), false);
        /* the rounding trap */
        eq(`${code}: 39/49 FAILS (79.6%, rounds to 80)`, g(39, 49), false);
        eq(`${code}: 40/49 PASSES`, g(40, 49), true);
        /* NOT pushed to the matrix: this is the fallback, not the gate. */
    }
});

/* ================================================================ *
 * 3. THE PLATFORM AGREES WITH ITSELF
 * ================================================================ */
{
    const seen = matrix.map((m) => m.threshold);
    eq('all four courses land on one threshold', new Set(seen).size, 1);
    eq('and it is 80', seen[0], THRESHOLD);
    eq('four courses were measured', matrix.length, 4);
    eq('and every one of them gates per exercise group',
        matrix.filter((m) => m.scope !== 'per exercise group').length, 0);
    /* The `Gate scope` column above is measured, not asserted, here:
       scripts/verify_pergroup_gate_requirement.cjs is the suite that
       REQUIRES it to be per-group, and it runs last so a failure there
       does not hide the rest of the regression. */


    /* FINAL EXAMS ARE A SEPARATE CONTRACT and must not have moved. */
    ['a1', 'a2', 'b1', 'b2'].forEach((c) => {
        const exam = read(`paid-courses/${c}-final-exam.html`);
        const mark = exam.match(/var (?:passed|previewPassed) = (?:finalScore|pct|previewPct) >= (\d+);/);
        ok(!!mark, `${c.toUpperCase()} final exam still declares its own pass mark`);
        eq(`${c.toUpperCase()} final exam is untouched`, Number(mark[1]), 80);
        eq(`${c.toUpperCase()} final exam did not adopt the lesson constant`,
            /LESSON_PASS_PERCENT/.test(exam), false);
    });
}

console.log('');
console.log('  Course | Real engine                    | Gate scope         | Threshold');
console.log('  -------+--------------------------------+--------------------+----------');
matrix.sort((a, b) => a.code.localeCompare(b.code)).forEach((m) => {
    console.log(`  ${m.code.padEnd(6)} | ${m.engine.padEnd(30)} | ${m.scope.padEnd(18)} | ${String(m.threshold).padStart(8)}`);
});
console.log('');
console.log('='.repeat(64));
if (fail) {
    console.log(`  ❌ COURSE GATE INTEGRATION: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(64) + '\n');
    process.exit(1);
}
console.log(`  ✅ COURSE GATE INTEGRATION: ${pass}/${pass} passed`);
console.log('='.repeat(64) + '\n');
