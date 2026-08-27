#!/usr/bin/env node
/**
 * verify_client_component.cjs — the browser reports a half; it never decides one.
 *
 * completeCourseComponent() is the only route by which a paid topic's vocabulary
 * or exercise half reaches the server, and therefore the only route by which a
 * topic id can enter completedTopics. What matters here is not the happy path
 * but the UNHAPPY ones: a network failure, or a 200 whose body is not actually a
 * verdict. Treating either as success is how a half-finished topic unlocks the
 * next one, so both must return null and the caller must be able to tell.
 *
 * The real function is lifted out of paid-platform.js and driven — nothing here
 * re-implements it.
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

console.log('\n=== CLIENT COMPONENT HELPER ===');

const SRC = read('paid-courses/paid-platform.js');

/* ---- lift the real function ---- */
function lift(name) {
    const i = SRC.indexOf('async function ' + name + '(');
    if (i < 0) throw new Error('missing ' + name);
    let d = 0;
    for (let k = SRC.indexOf('{', SRC.indexOf(')', i)); k < SRC.length; k++) {
        if (SRC[k] === '{') d++;
        else if (SRC[k] === '}') { d--; if (d === 0) return SRC.slice(i, k + 1); }
    }
    throw new Error('unbalanced ' + name);
}
const BODY = lift('completeCourseComponent');
/** Build the helper with a stubbed transport. */
function make(transport) {
    const calls = [];
    const fn = new Function('callApi', '_lastTopicPass', 'trackEvent', 'console', `
        ${BODY}
        return completeCourseComponent;
    `)(async (url, method, body) => { calls.push({ url, method, body }); return transport(body); },
       {}, () => {}, { warn() {}, error() {} });
    return { fn, calls };
}
const good = (over = {}) => Object.assign({
    ok: true, course: 'B2', topicId: 3, component: 'vocabulary',
    components: { vocabularyCompleted: true, exercisesCompleted: false },
    topicCompleted: false, completedTopics: [1, 2], nextTopic: null
}, over);

/* ================================================================ *
 * 1. THE REQUEST
 * ================================================================ */
{
    const { fn, calls } = make(() => good());
    return (async () => {
        await fn('B2', 3, 'vocabulary');
        eq('one request is made', calls.length, 1);
        eq('to the component action', calls[0].url, '/api/progress?action=complete-component');
        eq('by POST', calls[0].method, 'POST');
        eq('carrying the course', calls[0].body.course, 'B2');
        eq('the topic', calls[0].body.topicId, 3);
        eq('and the component', calls[0].body.component, 'vocabulary');
        eq('and nothing else', Object.keys(calls[0].body).sort().join(','),
            'component,course,topicId');
        /* THE CLIENT NEVER SENDS PROGRESS */
        ok(!('completedTopics' in calls[0].body), 'it never sends completedTopics');
        ok(!('uid' in calls[0].body), 'it never sends a uid');
        ok(!('topicCompleted' in calls[0].body), 'it never sends a verdict');

/* ================================================================ *
 * 2. A GOOD REPLY IS PASSED THROUGH UNCHANGED
 * ================================================================ */
        {
            const r = await make(() => good())
                .fn('B2', 3, 'vocabulary');
            ok(!!r, 'a well-formed reply comes back');
            eq('the server verdict is passed through', r.topicCompleted, false);
            eq('and the server component state', r.components.vocabularyCompleted, true);
            eq('and the server progress array', JSON.stringify(r.completedTopics), '[1,2]');
        }
        {
            const r = await make(() => good({
                topicCompleted: true, completedTopics: [1, 2, 3], nextTopic: 4,
                components: { vocabularyCompleted: true, exercisesCompleted: true }
            })).fn('B2', 3, 'vocabulary');
            eq('a completing reply reports the topic complete', r.topicCompleted, true);
            eq('with the server array', JSON.stringify(r.completedTopics), '[1,2,3]');
            eq('and the next topic', r.nextTopic, 4);
        }

/* ================================================================ *
 * 3. NO VERDICT IS NOT SUCCESS
 * ================================================================ */
        {
            /* a transport failure */
            const thrown = await make(() => { throw new Error('offline'); })
                .fn('B2', 3, 'vocabulary');
            eq('a network failure returns null', thrown, null);
            const status = await make(() => { const e = new Error('409'); e.status = 409; throw e; })
                .fn('B2', 3, 'vocabulary');
            eq('an HTTP error returns null', status, null);

            /* SHAPE IS PART OF THE VERDICT. Every one of these is a 200. */
            const BAD = [
                ['null', null],
                ['undefined', undefined],
                ['{}', {}],
                ['{ok:false}', { ok: false }],
                ['ok true only', { ok: true }],
                ['missing topicCompleted', good({ topicCompleted: undefined })],
                ['topicCompleted as a string', good({ topicCompleted: 'true' })],
                ['topicCompleted as 1', good({ topicCompleted: 1 })],
                ['completedTopics missing', good({ completedTopics: undefined })],
                ['completedTopics as a string', good({ completedTopics: '1,2' })],
                ['completedTopics as an object', good({ completedTopics: { 1: true } })],
                ['components missing', good({ components: undefined })],
                ['components as a string', good({ components: 'both' })],
                ['components null', good({ components: null })],
                ['a bare array', []],
                ['a string body', 'ok']
            ];
            for (const [label, reply] of BAD) {
                const r = await make(() => reply).fn('B2', 3, 'vocabulary');
                eq(`a 200 with ${label} is NOT a verdict`, r, null);
            }
            /* and the one good shape still is */
            ok(!!(await make(() => good()).fn('B2', 3, 'vocabulary')),
                'while a well-formed reply is accepted');
        }

/* ================================================================ *
 * 4. THE SOURCE ITSELF
 * ================================================================ */
        {
            ok(/window\.completeCourseComponent = completeCourseComponent;/.test(SRC),
                'the helper is published for classic pages');
            ok(/action=complete-component/.test(SRC), 'it targets the component action');
            eq('it never manufactures completedTopics',
                /completedTopics = \[/.test(BODY), false);
            eq('it has no optimistic success path',
                /return \{ ok: true/.test(BODY), false);
            ok(/return null;/.test(BODY), 'and returns null when there is no verdict');
            /* the old whole-topic call must still exist for legacy/finalize use,
               but it is no longer what a lesson calls to claim completion */
            ok(/window\.completeCourseTopic = completeCourseTopic;/.test(SRC),
                'the legacy whole-topic helper is still exported');
        }

        console.log('  request carries only {course,topicId,component} · 16 non-verdict replies all null');
        console.log('='.repeat(60));
        if (fail) {
            console.log(`  ❌ CLIENT COMPONENT HELPER: ${fail} failed / ${pass + fail}\n`);
            failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
            console.log('='.repeat(60) + '\n');
            process.exit(1);
        }
        console.log(`  ✅ CLIENT COMPONENT HELPER: ${pass}/${pass} passed`);
        console.log('='.repeat(60) + '\n');
    })().catch((e) => { console.error(e); process.exit(2); });
}
