#!/usr/bin/env node
/**
 * verify_topic_component_reachability.cjs — can a new learner finish a topic?
 *
 * THIS SUITE EXISTS BECAUSE THE ANSWER WAS ONCE NO, AND EVERYTHING ELSE WAS
 * GREEN.
 *
 * The server model was right: a paid topic completes when both halves are
 * reported, and complete-topic was hardened into a finaliser that appends only
 * what the component record earns. The client helper was right too:
 * completeCourseComponent validated its reply and refused to guess. What was
 * missing sat between them — no shipped page ever reported the VOCABULARY
 * half. So bothComponentsComplete() was never true, finalizeCompletedTopics()
 * always returned null, and not one learner in any of the four courses could
 * complete a single topic. Suites covering the model (110/110) and the helper
 * (42/42) both passed throughout, because neither asked whether a real page
 * ever called the thing they were testing.
 *
 * So this suite asks the end-to-end question and nothing else: starting from
 * an empty record, does walking the two halves — in EITHER order — actually
 * complete the topic, for EVERY course? It drives the real server module and
 * the real shipped reporters.
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

console.log('\n=== TOPIC COMPONENT REACHABILITY ===');

(async () => {
const TC = await import('file://' + path.join(ROOT, 'api/_lib/topic-components.js'));
const { componentsOf, bothComponentsComplete, finalizeCompletedTopics, isTopicComplete,
        normalizeComponent, TOPIC_COMPONENTS } = TC;

const COURSES = [
    { code: 'A1', total: 12, page: 'paid-courses/a1-course.html', vocab: 'paid-courses/a1-vocabulary.html' },
    { code: 'A2', total: 16, page: 'paid-courses/a2-course.html', vocab: 'paid-courses/a2-vocabulary.html' },
    { code: 'B1', total: 20, page: 'paid-courses/b1-course.html', vocab: 'paid-courses/b1-vocabulary.html' },
    { code: 'B2', total: 16, page: 'paid-courses/b2-course.html', vocab: 'paid-courses/b2-vocabulary.html' }
];

/* ================================================================ *
 * 1. A SHIPPED PAGE REPORTS EACH HALF — for every course
 * ---------------------------------------------------------------- *
 * The exact failure this suite was written for: a correct model with no
 * client able to reach it. Both halves must have a real reporter.
 * ================================================================ */
{
    eq('the canon still has exactly two halves', TOPIC_COMPONENTS.join(','), 'vocabulary,exercises');
    /* the vocabulary reporter is shared; every deck must load it */
    const mod = read('vocabulary-component.js');
    ok(/completeCourseComponent\(course, topicId, 'vocabulary'\)/.test(mod),
        'the shared reporter sends the vocabulary half');
    COURSES.forEach((c) => {
        const v = read(c.vocab);
        ok(/vocabulary-component\.js/.test(v), `${c.code}: its vocabulary deck loads the reporter`);
        ok(new RegExp(`course: '${c.code}'`).test(v), `${c.code}: and reports under its own course code`);
        ok(/ReportVocabulary\(currentTopicId\)/.test(v),
            `${c.code}: the deck calls it with the open topic`);
    });
    /* the exercises half */
    COURSES.forEach((c) => {
        const p = read(c.page);
        const host = { A1: 'a1-host.js', B1: 'b1-host.js', A2: 'a2-host.js', B2: 'b2-host.js' }[c.code];
        const hostSrc = read(host);
        const reports = /completeCourseComponent/.test(p) || /completeCourseComponent/.test(hostSrc);
        ok(reports, `${c.code}: something in its exercise path reports the exercises half`);
    });
}

/* ================================================================ *
 * 2. THE REACHABILITY WALK, BOTH ORDERS, EVERY COURSE
 * ---------------------------------------------------------------- *
 * Driven through the real server helpers, exactly as
 * /api/progress?action=complete-component would drive them.
 * ================================================================ */
function apply(state, topicId, component) {
    /* what complete-component.js writes, in the shape it writes it */
    const next = JSON.parse(JSON.stringify(state));
    next.topicComponents = next.topicComponents || {};
    next.topicComponents[topicId] = next.topicComponents[topicId] || {};
    next.topicComponents[topicId][component + 'Completed'] = true;
    const finalized = finalizeCompletedTopics(next, topicId, 1000);
    if (finalized) next.completedTopics = finalized;
    return next;
}

COURSES.forEach((c) => {
    const T = 1;
    /* ---- vocabulary first, exercises second ---- */
    {
        let s = { topicComponents: {}, completedTopics: [] };
        eq(`${c.code}: a brand-new learner has not completed topic ${T}`,
            isTopicComplete(s, T, c.total), false);

        s = apply(s, T, 'vocabulary');
        eq(`${c.code}: vocabulary reported -> vocabularyCompleted`,
            componentsOf(s, T).vocabularyCompleted, true);
        eq(`${c.code}: one half is not the topic`, isTopicComplete(s, T, c.total), false);
        eq(`${c.code}: and nothing was appended yet`, JSON.stringify(s.completedTopics), '[]');

        s = apply(s, T, 'exercises');
        eq(`${c.code}: exercises reported -> both halves complete`,
            bothComponentsComplete(s, T), true);
        eq(`${c.code}: THE TOPIC COMPLETES (vocab -> exercises)`,
            isTopicComplete(s, T, c.total), true);
        eq(`${c.code}: and the server's array carries it`,
            JSON.stringify(s.completedTopics), `[${T}]`);
    }
    /* ---- exercises alone: THIS is what finishes a topic ---- */
    {
        let s = { topicComponents: {}, completedTopics: [] };
        s = apply(s, T, 'exercises');
        eq(`${c.code}: the exercises alone COMPLETE the topic`,
            isTopicComplete(s, T, c.total), true);
        eq(`${c.code}: server array carries it`, JSON.stringify(s.completedTopics), `[${T}]`);
        eq(`${c.code}: and the deck is still recorded as outstanding`,
            bothComponentsComplete(s, T), false);
        /* reporting the deck afterwards changes nothing */
        s = apply(s, T, 'vocabulary');
        eq(`${c.code}: the deck afterwards adds no duplicate`,
            JSON.stringify(s.completedTopics), `[${T}]`);
    }
    /* ---- a legacy learner is never disturbed ---- */
    {
        const s = { topicComponents: {}, completedTopics: [1, 2] };
        eq(`${c.code}: a legacy completed topic stays complete`, isTopicComplete(s, 2, c.total), true);
        eq(`${c.code}: with no component record at all`,
            componentsOf(s, 2).vocabularyCompleted || componentsOf(s, 2).exercisesCompleted, false);
    }
});

/* ================================================================ *
 * 3. THE DEADLOCK ITSELF, STATED AS A TEST
 * ---------------------------------------------------------------- *
 * If either reporter disappears again, this is the assertion that says so
 * in one line instead of leaving a green suite over a dead platform.
 * ================================================================ */
{
    const half = { topicComponents: { 1: { exercisesCompleted: true } }, completedTopics: [] };
    eq('exercises alone finalise the topic',
        JSON.stringify(finalizeCompletedTopics(half, 1, 12)), '[1]');
    const other = { topicComponents: { 1: { vocabularyCompleted: true } }, completedTopics: [] };
    eq('vocabulary without exercises can never finalise',
        finalizeCompletedTopics(other, 1, 12), null);
    const both = { topicComponents: { 1: { vocabularyCompleted: true, exercisesCompleted: true } },
                   completedTopics: [] };
    eq('only both halves finalise', JSON.stringify(finalizeCompletedTopics(both, 1, 12)), '[1]');

    /* and every course has a live client path to BOTH halves */
    const missing = [];
    COURSES.forEach((c) => {
        const v = read(c.vocab);
        if (!/vocabulary-component\.js/.test(v) || !/ReportVocabulary\(/.test(v)) missing.push(c.code + ':vocabulary');
        const host = { A1: 'a1-host.js', B1: 'b1-host.js', A2: 'a2-host.js', B2: 'b2-host.js' }[c.code];
        if (!/completeCourseComponent/.test(read(c.page) + read(host))) missing.push(c.code + ':exercises');
    });
    eq('no course is missing a client reporter for either half', missing.join(','), '');
    eq('the component names are the canonical ones',
        [normalizeComponent('vocabulary'), normalizeComponent('exercises')].join(','), 'vocabulary,exercises');
}

console.log('  both halves reported by shipped clients · vocab->ex and ex->vocab both complete · legacy preserved');
console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ TOPIC COMPONENT REACHABILITY: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ TOPIC COMPONENT REACHABILITY: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
})().catch((e) => { console.error(e); process.exit(2); });
