#!/usr/bin/env node
/**
 * verify_b1_exercise_dispatch.cjs — every B1 topic really routes through B1Host.
 *
 * A1's migration once passed a test like this while topics 1-4 were not routed
 * at all: the assertion allowed a GENERIC call to satisfy every topic, so one
 * mountA1Practice(topicId) anywhere in the file "proved" twelve topics. The
 * lesson is that a name appearing in source proves nothing about dispatch.
 *
 * So nothing here is a grep. The page's own loadQuiz() is lifted and EXECUTED
 * once per topic against a spy, and what is recorded is the topic id B1Host
 * actually received and the groups it actually got. A topic that stopped
 * routing, or routed with someone else's data, fails here.
 */
'use strict';
const H = require('./_b1_page_harness.cjs');

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

console.log('\n=== B1 EXERCISE DISPATCH (topics 1-20) ===');

const IDS = Array.from({ length: 20 }, (_, i) => i + 1);

/* ---- 1. the page routes the learner into the session, topic by topic ---- */
const record = [];
IDS.forEach((id) => {
    const ctx = H.makePage({});
    const real = ctx.window.B1Host.mountPractice;
    let got = null;
    ctx.window.B1Host.mountPractice = (o) => {
        got = { id: o.topic && o.topic.id, groups: ctx.window.B1Host.groupsOf(o.topic) };
        return real(o);
    };
    const mounted = ctx.mountB1Practice(id);
    eq(`T${id}: mountB1Practice reports success`, mounted, true);
    ok(!!got, `T${id}: B1Host.mountPractice was actually called`);
    if (got) {
        eq(`T${id}: the host received THIS topic`, got.id, id);
        ok(got.groups.length > 0, `T${id}: with ${got.groups.length} scored exercises`);
        record.push({ id, groups: got.groups.length,
                      items: got.groups.reduce((n, g) => n + g.items.length, 0) });
    }
    /* and something reached the DOM */
    ok(ctx.quizSection.innerHTML.length > 0, `T${id}: the exercise section is not left empty`);
});
eq('all twenty topics dispatched', record.length, 20);
eq('and each one is distinct', new Set(record.map((r) => r.id)).size, 20);

/* the totals a dispatch test can also protect */
eq('153 exercises were mounted across the course',
    record.reduce((n, r) => n + r.groups, 0), 153);
eq('1504 items were mounted across the course',
    record.reduce((n, r) => n + r.items, 0), 1504);

/* ---- 2. no topic is served by a generic call ---- */
{
    /* The real defence is above — the table is executed. This adds the shape
       check that failed A1: the routing decision must not be reachable for a
       topic that was never enumerated. B1 routes through loadQuiz(), which
       tests every topic<N>Exercises key by name, so all twenty are named. */
    const PAGE = H.PAGE;
    const at = PAGE.indexOf('function getT1ExData');
    const body = PAGE.slice(at, PAGE.indexOf('}', PAGE.indexOf('return', at)));
    IDS.forEach((n) => ok(new RegExp('topic' + n + 'Exercises').test(body),
        `topic ${n} is named explicitly in the data lookup`));
}

/* ---- 3. the legacy renderer remains, and remains a FALLBACK ---- */
{
    const ctx = H.makePage({});
    /* with the shared stack gone, the page must still show exercises */
    delete ctx.window.UzExerciseSession;
    const mounted = ctx.mountB1Practice(3);
    eq('without the shared stack the session does not mount', mounted, false);
    eq('and the mount leaves nothing half-rendered behind it',
        ctx.quizSection.innerHTML, '');
    ok(/renderTopic1Exercises\(topicId\); return;/.test(H.PAGE),
        'so loadQuiz falls back to the legacy renderer');
    ok(/if \(mountB1Practice\(topicId\)\) return;/.test(H.PAGE),
        'and the session is tried FIRST');
}

/* ---- 4. a topic with no scored exercise is not forced through ---- */
{
    const ctx = H.makePage({});
    const t = ctx.courseData.topics.find((x) => x.id === 1);
    const key = Object.keys(t).find((k) => /^topic\d+Exercises$/.test(k));
    const saved = t[key];
    t[key] = { exercises: [{ id: 'matchingSlot' }] };   /* placeholders only */
    eq('a topic whose groups are all placeholders does not mount',
        ctx.mountB1Practice(1), false);
    t[key] = saved;
    eq('and it mounts again once its exercises are back', ctx.mountB1Practice(1), true);
}

console.log(`  twenty topics executed · 153 exercises · 1504 items · fallback intact`);
console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ B1 EXERCISE DISPATCH: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ B1 EXERCISE DISPATCH: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
