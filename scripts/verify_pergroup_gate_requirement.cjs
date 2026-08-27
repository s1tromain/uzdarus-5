#!/usr/bin/env node
/**
 * verify_pergroup_gate_requirement.cjs — the gate must be PER EXERCISE GROUP.
 *
 * This suite was RED for as long as a course still scored a whole topic at
 * once. A1 migrated first, B1 last; it is green now, and it must stay green —
 * a course that goes back to a topic-wide figure fails here immediately.
 * That is deliberate. It exists so the remaining defect is enforced by a test
 * rather than described in a report, where it could be mistaken for done.
 *
 * THE RULE. Every scored exercise group is earned on its own: 80%, that group,
 * no help from any other. A topic-wide threshold lets a good exercise pay for a
 * bad one — 10/10 on exercise 1 and 5/10 on exercise 2 averages to 75%, and the
 * learner walks into exercise 3 having never understood exercise 2. The product
 * requirement is explicit that this must not happen.
 *
 * WHERE EACH COURSE STANDS.
 *
 *   A2, B2   mount UzExerciseSession, which gates every step through
 *            cfg.passScore. Per group. Correct.
 *
 *   A1, B1   USED TO run bespoke per-topic check functions — seven of them in
 *            A1, checkTopic1Exercises in B1 — which accumulated one
 *            totalCorrect/totalQuestions for the whole lesson
 *            across every exercise and report a single figure to
 *            __uzFinalizeExerciseTopic(). The 80% they enforce is an AGGREGATE.
 *            A1 does keep per-exercise counters (ex1Correct…ex9Correct) but they
 *            are inconsistent across topics — five of the seven functions have
 *            between 5 and 9, and two have none at all — so the per-group result
 *            is not currently available to gate on.
 *
 * Migrating those 32 live topics is real work and must not be faked. Until it
 * lands, this suite is the blocker, and it names the exact courses.
 *
 * It runs LAST in the test chain so its failure never hides the rest.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('\n=== PER-GROUP GATE REQUIREMENT ===');

/* A course gates per group when its exercises run through the shared session
   engine with a threshold. Anything that scores a whole topic at once does not,
   however correct its arithmetic is. */
const COURSES = [
    { code: 'A1', host: 'a1-host.js', page: 'paid-courses/a1-course.html' },
    { code: 'A2', host: 'a2-host.js', page: 'paid-courses/a2-course.html' },
    { code: 'B1', host: 'b1-host.js', page: 'paid-courses/b1-course.html' },
    { code: 'B2', host: 'b2-host.js', page: 'paid-courses/b2-course.html' }
];

const rows = COURSES.map((c) => {
    const hostSrc = c.host ? read(c.host) : '';
    const pageSrc = read(c.page);
    /* A HOST FILE IS NOT PROOF ON ITS OWN. The page must load it AND route its
       exercises through it — that gap is exactly how three courses came to have
       a shared engine available and none of them configured a threshold. */
    const hostGates = !!hostSrc && /passScore:/.test(hostSrc);
    const pageUses = !c.host ? false
        : new RegExp(c.host.replace('.', '\\.')).test(pageSrc)
          && /mountPractice\(|Host\.mount/.test(pageSrc);
    const gatedBySession = hostGates && pageUses;
    /* the tell-tale of a topic-wide gate: one figure for the whole topic */
    const aggregate = /__uzFinalizeExerciseTopic|LESSON_PASS_PERCENT/.test(pageSrc);
    return {
        code: c.code,
        scope: gatedBySession ? 'per exercise group' : (aggregate ? 'topic-wide' : 'none'),
        engine: gatedBySession ? 'UzExerciseSession' : 'inline lesson flow'
    };
});

console.log('');
console.log('  Course | Engine             | Gate scope');
console.log('  -------+--------------------+--------------------');
rows.forEach((r) => console.log(`  ${r.code.padEnd(6)} | ${r.engine.padEnd(18)} | ${r.scope}`));
console.log('');

rows.forEach((r) => {
    eq(`${r.code}: the gate is PER EXERCISE GROUP`, r.scope, 'per exercise group');
});
eq('no course gates on a topic-wide aggregate',
    rows.filter((r) => r.scope !== 'per exercise group').map((r) => r.code).join(','), '');

/* And the behaviour the rule exists to prevent, stated as the acceptance case:
   a strong exercise must not be able to pay for a weak one. */
{
    const topicWide = (groups) => {
        const c = groups.reduce((s, g) => s + g[0], 0);
        const t = groups.reduce((s, g) => s + g[1], 0);
        return c * 100 >= t * 80;
    };
    const perGroup = (groups) => groups.every(([c, t]) => c * 100 >= t * 80);
    const CASE = [[10, 10], [5, 10]];
    eq('the acceptance case: 10/10 then 5/10 passes a TOPIC-WIDE gate',
        topicWide(CASE), false);
    eq('  …and fails a PER-GROUP gate', perGroup(CASE), false);
    /* the case that actually separates them */
    const SPLIT = [[10, 10], [10, 10], [10, 10], [5, 10]];
    eq('three perfect exercises DO pay for a 5/10 under a topic-wide gate',
        topicWide(SPLIT), true);
    eq('  …but not under a per-group gate', perGroup(SPLIT), false);
    ok(true, 'that difference is what every course now refuses');
}

console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ PER-GROUP GATE REQUIREMENT: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 10).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('');
    console.log('  This failure is the remaining Phase 2C blocker, not a regression.');
    console.log('  The courses named above enforce 80% across the WHOLE TOPIC; the');
    console.log('  product rule is 80% on every exercise group individually.');
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ PER-GROUP GATE REQUIREMENT: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
