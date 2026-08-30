#!/usr/bin/env node
/**
 * verify_a1_exercise_completion.cjs — how an A1 topic's exercises are banked.
 *
 * A1's exercise section used to end by assigning a variable. Nothing was
 * saved, nothing was reported, and no topic could ever complete. The pipeline
 * that replaced it has an order that is load-bearing:
 *
 *   every group passed  ->  durable saveQuizResult  ->  complete-component
 *
 * and every step of it is a place where a shortcut would silently unlock the
 * next topic against work that was never recorded. So this suite does not read
 * the source; it DRIVES completeExercises() with mocked async APIs and watches
 * what it calls, in what order, and what it does when each one fails.
 *
 * The two failure modes are different and both matter:
 *
 *   the SAVE fails      nothing is durable, so the component must never be
 *                       told, and nothing unlocks.
 *   the COMPONENT fails the learner's work IS durable. They must never be
 *                       asked to solve 685 items again — the retry sends the
 *                       component call alone.
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
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('\n=== A1 EXERCISE COMPLETION ===');

const HOSTSRC = read('a1-host.js');
const g = {};
new Function('window', HOSTSRC)(g);
const A1 = g.A1Host;
ok(!!A1 && typeof A1.completeExercises === 'function', 'the host exposes the completion pipeline');

/* real A1 groups, so the snapshot is built from real data */
const PAGE = read('paid-courses/a1-course.html');
const ci = PAGE.indexOf('const courseData');
const cj = PAGE.indexOf('\n        };', ci);
const courseData = vm.runInNewContext(
    '(' + PAGE.slice(PAGE.indexOf('{', ci), cj + 11).replace(/;\s*$/, '') + ')', {});
const T6 = courseData.topics.find((t) => t.id === 6);
const GROUPS = A1.groupsOf(T6);
ok(GROUPS.length >= 3, `topic 6 offers ${GROUPS.length} groups to complete`);

/** A finished attempt: every group passed at `pct`% (default perfect). */
function attempt(groups, pct) {
    const answers = {}, checked = {};
    groups.forEach((grp) => {
        const total = grp.items.length;
        /* floor, not ceil: ceil(10 * 0.79) is 8, which is a genuine 80% pass —
           a fixture built that way would test nothing at the boundary. */
        const correct = pct == null ? total : Math.floor(total * pct / 100);
        grp.items.forEach((it, i) => {
            const a = Array.isArray(it.answer) ? it.answer[0] : it.answer;
            answers[grp.id + '-' + i] = (i < correct) ? String(a) : 'ZZZ-wrong';
        });
        checked[grp.id] = { correct, total, passed: correct * 100 >= total * 80 };
    });
    return { answers, checked };
}
/** A recording harness around the two async APIs. */
function harness(over = {}) {
    const calls = [];
    return {
        calls,
        api: {
            saveQuizResult: over.saveQuizResult || (async (uid, topicId, payload, course) => {
                calls.push({ fn: 'save', uid, topicId, payload, course });
                return true;
            }),
            completeCourseComponent: over.completeCourseComponent || (async (course, topicId, component) => {
                calls.push({ fn: 'component', course, topicId, component });
                return { ok: true, course: 'A1', topicId, component: 'exercises',
                         components: { exercisesCompleted: true, vocabularyCompleted: false },
                         topicCompleted: false, completedTopics: [1, 2, 3, 4, 5] };
            })
        }
    };
}

(async () => {

/* ================================================================ *
 * 1. THE GATE — the OFFICIAL SCORE, and nothing else
 *
 * It used to demand a pass on every single group, which is not the rule the
 * summary screen states and not the rule the product has: a topic is earned
 * when the official total reaches 80%. Gaps and a weak exercise are allowed
 * to cost marks; what they cannot do is create a screen that says "80%
 * passed" above a handler that refuses.
 * ================================================================ */
{
    const total = GROUPS.reduce((n, g) => n + (g.items || []).length, 0);

    /* one weak exercise, but the paper still reaches the bar */
    const h = harness();
    const partial = attempt(GROUPS, 100);
    partial.checked[GROUPS[1].id] = { correct: 7, total: 10, passed: false };
    const r = await A1.completeExercises({ topicId: 6, groups: GROUPS, result: partial,
                                           uid: 'u1', api: h.api });
    eq(`one weak exercise still leaves ${total - 3}/${total} — the topic is earned`, r.ok, true);
    eq('  and it was reported', h.calls.length, 2);

    /* a whole exercise left unanswered, and the total is still exactly 80% */
    const untouched = attempt(GROUPS, 100);
    delete untouched.checked[GROUPS[0].id];
    const h2 = harness();
    const r2 = await A1.completeExercises({ topicId: 6, groups: GROUPS, result: untouched,
                                            uid: 'u1', api: h2.api });
    const snap2 = A1.buildSnapshot(6, GROUPS, untouched);
    eq('  an unanswered exercise costs its marks', snap2.percentage, 80);
    eq('exactly 80% with a whole exercise skipped is still earned', r2.ok, true);

    /* below the bar nothing happens at all */
    const at70 = attempt(GROUPS, 70);
    const h3 = harness();
    const r3 = await A1.completeExercises({ topicId: 6, groups: GROUPS, result: at70,
                                            uid: 'u1', api: h3.api });
    eq('70% stops the pipeline', r3.ok, false);
    eq('  at the gate', r3.stage, 'gate');
    eq('  and nothing was called', h3.calls.length, 0);
    ok(!/lug‘at|lugat/i.test(String(r3.message)),
        `  and the refusal is about the score, not the deck (${r3.message})`);

    /* the boundary itself */
    const at79 = attempt(GROUPS, 79);
    const h4 = harness();
    eq('79% is refused',
        (await A1.completeExercises({ topicId: 6, groups: GROUPS, result: at79, uid: 'u1', api: h4.api })).ok,
        false);
    eq('  and calls nothing', h4.calls.length, 0);
    const at80 = attempt(GROUPS, 80);
    const h5 = harness();
    eq('exactly 80% proceeds',
        (await A1.completeExercises({ topicId: 6, groups: GROUPS, result: at80, uid: 'u1', api: h5.api })).ok,
        true);
}

/* ================================================================ *
 * 2. THE ORDER
 * ================================================================ */
{
    const h = harness();
    const r = await A1.completeExercises({ topicId: 6, groups: GROUPS,
                                           result: attempt(GROUPS), uid: 'u1', api: h.api });
    eq('the pipeline succeeds', r.ok, true);
    eq('exactly two calls are made', h.calls.length, 2);
    eq('the durable result is saved FIRST', h.calls[0].fn, 'save');
    eq('the component is reported SECOND', h.calls[1].fn, 'component');

    /* the save carries the snapshot, under the course's own key */
    eq('the save names the course', h.calls[0].course, 'A1');
    eq('and the topic', h.calls[0].topicId, 6);
    eq('and the uid', h.calls[0].uid, 'u1');
    const snap = h.calls[0].payload[A1.RESULT_FIELD];
    ok(!!snap, 'the payload carries the durable snapshot');
    eq('  marked completed', snap.completed, true);
    eq('  for this topic', snap.topicId, 6);
    eq('  with every group', snap.groups.length, GROUPS.length);
    ok(snap.groups.every((x) => Array.isArray(x.answers) && x.answers.length),
        '  and every learner response');
    ok(!/</.test(JSON.stringify(snap)), '  and no DOM markup');

    /* the component names A1 / this topic / exercises */
    eq('the component call names the course', h.calls[1].course, 'A1');
    eq('and the topic', h.calls[1].topicId, 6);
    eq('and the component', h.calls[1].component, 'exercises');

    /* BOTH ARE AWAITED. A fire-and-forget save would let the component run
       before the save resolved; this pins the ordering under real latency. */
    const order = [];
    const slow = harness({
        saveQuizResult: () => new Promise((res) => setTimeout(() => { order.push('save'); res(true); }, 40)),
        completeCourseComponent: async (course, topicId) => {
            order.push('component');
            return { ok: true, course: 'A1', topicId, component: 'exercises',
                     components: { exercisesCompleted: true }, topicCompleted: false, completedTopics: [] };
        }
    });
    await A1.completeExercises({ topicId: 6, groups: GROUPS, result: attempt(GROUPS),
                                 uid: 'u1', api: slow.api });
    eq('a slow save is awaited before the component runs', order.join('->'), 'save->component');
}

/* ================================================================ *
 * 3. SAVE FAILURE — FAIL CLOSED
 * ================================================================ */
{
    for (const [label, saveQuizResult] of [
        ['it throws', async () => { throw new Error('offline'); }],
        ['it returns false', async () => false],
        ['it returns null', async () => null],
        ['it is missing', undefined]
    ]) {
        const calls = [];
        const api = {
            saveQuizResult,
            completeCourseComponent: async () => { calls.push('component'); return { ok: true }; }
        };
        if (!saveQuizResult) delete api.saveQuizResult;
        const r = await A1.completeExercises({ topicId: 6, groups: GROUPS,
                                               result: attempt(GROUPS), uid: 'u1', api });
        eq(`save failure (${label}): the pipeline fails`, r.ok, false);
        eq(`  at the save stage`, r.stage, 'save');
        eq(`  the component is NEVER called`, calls.length, 0);
        eq(`  and no component retry is offered`, r.retryComponent, false);
        ok(/Natijani saqlab bo‘lmadi/.test(r.message || ''), '  the learner is told, in Uzbek');
        ok(/Internet aloqasini tekshirib/.test(r.message || ''), '  with the retry instruction');
        ok(!!r.snapshot, '  and the solved attempt is handed back for a retry');
    }
}

/* ================================================================ *
 * 4. COMPONENT FAILURE — DURABLE WORK IS NOT REDONE
 * ================================================================ */
{
    for (const [label, reply] of [
        ['it throws', 'throw'],
        ['null', null],
        ['{}', {}],
        ['ok:false', { ok: false }],
        ['wrong course', { ok: true, course: 'A2', topicId: 6, components: { exercisesCompleted: true }, topicCompleted: false, completedTopics: [] }],
        ['wrong topic', { ok: true, course: 'A1', topicId: 7, components: { exercisesCompleted: true }, topicCompleted: false, completedTopics: [] }],
        ['components missing', { ok: true, course: 'A1', topicId: 6, topicCompleted: false, completedTopics: [] }],
        ['exercisesCompleted false', { ok: true, course: 'A1', topicId: 6, components: { exercisesCompleted: false }, topicCompleted: false, completedTopics: [] }],
        ['topicCompleted not a boolean', { ok: true, course: 'A1', topicId: 6, components: { exercisesCompleted: true }, topicCompleted: 'yes', completedTopics: [] }],
        ['completedTopics not an array', { ok: true, course: 'A1', topicId: 6, components: { exercisesCompleted: true }, topicCompleted: false, completedTopics: 'x' }]
    ]) {
        const saved = [];
        const api = {
            saveQuizResult: async (...a) => { saved.push(a); return true; },
            completeCourseComponent: reply === 'throw'
                ? async () => { throw new Error('offline'); }
                : async () => reply
        };
        const r = await A1.completeExercises({ topicId: 6, groups: GROUPS,
                                               result: attempt(GROUPS), uid: 'u1', api });
        eq(`component reply (${label}) is not a verdict`, r.ok, false);
        eq(`  at the component stage`, r.stage, 'component');
        eq(`  the result WAS saved first`, saved.length, 1);
        eq(`  so only the component is retried`, r.retryComponent, true);
        ok(/Natijani saqlab bo‘lmadi/.test(r.message || ''), '  and the learner is told');
    }

    /* THE RETRY SENDS THE COMPONENT ALONE — the learner never re-solves. */
    {
        const calls = [];
        const api = {
            saveQuizResult: async () => { calls.push('save'); return true; },
            completeCourseComponent: async (course, topicId) => {
                calls.push('component');
                return { ok: true, course: 'A1', topicId, component: 'exercises',
                         components: { exercisesCompleted: true, vocabularyCompleted: true },
                         topicCompleted: true, completedTopics: [1, 2, 3, 4, 5, 6], nextTopic: 7 };
            }
        };
        const r = await A1.retryComponent({ topicId: 6, groups: GROUPS,
                                            result: attempt(GROUPS), uid: 'u1', api });
        eq('the retry succeeds', r.ok, true);
        eq('  and saves NOTHING again', calls.join(','), 'component');
        eq('  applying the server progression', r.completedTopics.join(','), '1,2,3,4,5,6');
        eq('  and the server next topic', r.nextTopic, 7);
    }
}

/* ================================================================ *
 * 5. THE SERVER DECIDES PROGRESSION
 * ================================================================ */
{
    /* THE SERVER'S WORD IS FINAL, whatever it is. A server that answers
       "not completed" is an anomaly now — the exercises are the whole rule —
       and the client must report it as a failure to retry, never as a
       vocabulary errand. That errand is what stranded the learners. */
    const h = harness();
    const r = await A1.completeExercises({ topicId: 6, groups: GROUPS,
                                           result: attempt(GROUPS), uid: 'u1', api: h.api });
    eq('exercises are completed', r.exercisesCompleted, true);
    eq('the client repeats the server verdict rather than inventing one', r.topicCompleted, false);
    eq('so no next topic is offered', r.nextTopic, null);
    ok(!/lug‘at|lugat|yakunlang/i.test(String(r.message)),
        `and the learner is NEVER sent to the deck (${r.message})`);

    /* both done: the SERVER's arrays, never a local push */
    const h2 = harness({
        completeCourseComponent: async (course, topicId) => ({
            ok: true, course: 'A1', topicId, component: 'exercises',
            components: { exercisesCompleted: true, vocabularyCompleted: true },
            topicCompleted: true, completedTopics: [1, 2, 3, 4, 5, 6], nextTopic: 7 })
    });
    const r2 = await A1.completeExercises({ topicId: 6, groups: GROUPS,
                                            result: attempt(GROUPS), uid: 'u1', api: h2.api });
    eq('both components done: the topic completes', r2.topicCompleted, true);
    eq('  with the SERVER completedTopics', r2.completedTopics.join(','), '1,2,3,4,5,6');
    eq('  and the SERVER next topic', r2.nextTopic, 7);
    eq('  and no message is needed', r2.message, null);

    /* the pipeline never invents progression */
    const src = HOSTSRC.slice(HOSTSRC.indexOf('async function completeExercises'));
    eq('the pipeline never pushes to completedTopics', /completedTopics\.push/.test(src), false);
    ok(/ack\.completedTopics\.slice\(\)/.test(src), 'it copies the server array');

    /* THE DRAFT IS CLEARED ONLY ONCE THE WORK IS BANKED */
    let cleared = 0;
    await A1.completeExercises({ topicId: 6, groups: GROUPS, result: attempt(GROUPS),
        uid: 'u1', api: harness().api, clearDraft: () => { cleared++; } });
    eq('a successful completion clears the draft', cleared, 1);
    cleared = 0;
    await A1.completeExercises({ topicId: 6, groups: GROUPS, result: attempt(GROUPS), uid: 'u1',
        api: { saveQuizResult: async () => false, completeCourseComponent: async () => ({ ok: true }) },
        clearDraft: () => { cleared++; } });
    eq('a failed completion does NOT clear the draft', cleared, 0);
}

/* ================================================================ *
 * 6. THE OLD WHOLE-TOPIC ROUTE IS NOT THE LEARNER PATH
 * ================================================================ */
{
    eq('the pipeline never calls completeCourseTopic',
        /completeCourseTopic/.test(HOSTSRC), false);
    ok(/completeCourseComponent/.test(HOSTSRC), 'it reports the component instead');
    /* and the page's exercise completion does not either */
    const at = PAGE.indexOf('function mountA1Practice');
    const mount = PAGE.slice(at, PAGE.indexOf('const EXERCISE_TOPIC_LOADERS', at));
    eq('the A1 mount does not claim the whole topic',
        /completeCourseTopic/.test(mount), false);
}

/* ================================================================ *
 * THE ACTUAL PAGE, NOT THE HOST
 * ---------------------------------------------------------------- *
 * Everything above drives a1-host.js. That is necessary and it is not
 * sufficient: a host that behaves perfectly proves nothing if the page
 * never calls it, or calls it with the wrong arguments, or drops the
 * promise. This section lifts the page's own functions out of
 * paid-courses/a1-course.html and drives THEM — the learner's path,
 * beginning at the session's onFinish.
 * ================================================================ */
{
    const H = require('./_a1_page_harness.cjs');

    /** Mount topic `id` and hand back the onFinish the page really installed. */
    function mountAndCapture(ctx, id) {
        const A1 = ctx.window.A1Host;
        const real = A1.mountPractice;
        let captured = null;
        A1.mountPractice = (o) => { captured = o.onFinish; return real(o); };
        ctx.mountA1Practice(id);
        A1.mountPractice = real;
        return captured;
    }
    const groupsOf = (ctx, id) =>
        ctx.window.A1Host.groupsOf(ctx.courseData.topics.find((t) => t.id === id));

    /* ---- the page installs a real completion handler ---- */
    {
        const ctx = H.makePage({});
        const onFinish = mountAndCapture(ctx, 6);
        eq('the page installs an onFinish', typeof onFinish, 'function');
        ok(/return a1FinishExercises\(topicId, uid, result\)/.test(H.PAGE),
            'and it returns the completion promise, so both awaits are observable');
    }

    /* ---- onFinish -> save -> component, in that order, both awaited ---- */
    {
        const order = [];
        let saveDone = false;
        const ctx = H.makePage({
            save: async () => {
                order.push('save-start');
                await new Promise((r) => setTimeout(r, 15));
                saveDone = true; order.push('save-end'); return true;
            },
            component: async (c, t, cm) => {
                order.push(`component(${c},${t},${cm}) saveDone=${saveDone}`);
                await new Promise((r) => setTimeout(r, 15));
                return H.ack(c, t, cm, true, [6]);
            },
            topicCompleted: true, ackCompletedTopics: [6]
        });
        const onFinish = mountAndCapture(ctx, 6);
        await onFinish(H.finishedAttempt(groupsOf(ctx, 6), 0));

        eq('the page saves before it reports', order[0], 'save-start');
        eq('and waits for the save to land first', order[1], 'save-end');
        eq('then reports A1 / this topic / the exercises half',
            order[2], 'component(A1,6,exercises) saveDone=true');
        eq('exactly one completion ran', order.length, 3);
        eq('the page never claims the whole topic itself', ctx.writes.topic, 0);
        ok(!!(ctx.userQuizResults.topic_6 || {}).a1ExerciseResult,
            'the durable result is hydrated in memory too');
        eq('progression is the SERVER array', JSON.stringify(ctx.getCompletedTopics()), '[6]');
        ok(ctx.loadTopicsCalls > 0, 'and the topic list is redrawn from it');
    }

    /* ---- the REAL saveQuizResult contract: true / false, not a shape ---- */
    {
        const plat = read('paid-courses/paid-platform.js');
        const fnAt = plat.indexOf('async function firestoreSaveQuizResult');
        const body = plat.slice(fnAt, plat.indexOf('\n}\n', fnAt));
        ok(fnAt > 0 && body.length > 200, 'the shipped saveQuizResult was located');
        ok(/return true;/.test(body) && /return false;/.test(body),
            'production saveQuizResult answers with true or false');
        /* so the host must accept literal true and reject literal false */
        const ctxT = H.makePage({ save: async () => true });
        const onT = mountAndCapture(ctxT, 6);
        await onT(H.finishedAttempt(groupsOf(ctxT, 6), 0));
        eq('a true from the real contract is accepted as durable', ctxT.writes.component, 1);

        const ctxF = H.makePage({ save: async () => false });
        const onF = mountAndCapture(ctxF, 6);
        await onF(H.finishedAttempt(groupsOf(ctxF, 6), 0));
        eq('a false from the real contract stops the pipeline', ctxF.writes.component, 0);
    }

    /* ---- fail closed, at either step ---- */
    {
        const ctx = H.makePage({ save: async () => false });
        const onFinish = mountAndCapture(ctx, 6);
        await onFinish(H.finishedAttempt(groupsOf(ctx, 6), 0));
        eq('a failed save reports nothing', ctx.writes.component, 0);
        eq('and unlocks nothing', JSON.stringify(ctx.getCompletedTopics()), '[]');
        ok(/Natijani saqlab/.test(ctx.text()), 'the learner is told, in the page');
        ok(!!ctx.button('Qayta urinish'), 'with a retry they can actually click');
    }
    {
        const ctx = H.makePage({ component: async () => null });
        const onFinish = mountAndCapture(ctx, 6);
        await onFinish(H.finishedAttempt(groupsOf(ctx, 6), 0));
        eq('a failed component unlocks nothing', JSON.stringify(ctx.getCompletedTopics()), '[]');
        ok(!!(ctx.getPendingRetry() || {}).snapshot,
            'and the retry it offers is the component alone');
    }
    /* a 200 that is not a verdict */
    for (const bad of [{ ok: true }, { ok: true, course: 'A2', topicId: 6 },
                       { ok: true, course: 'A1', topicId: 7 },
                       { ok: true, course: 'A1', topicId: 6, components: {}, topicCompleted: true, completedTopics: [] }]) {
        const ctx = H.makePage({ component: async () => bad });
        const onFinish = mountAndCapture(ctx, 6);
        await onFinish(H.finishedAttempt(groupsOf(ctx, 6), 0));
        eq(`a malformed ACK ${JSON.stringify(bad).slice(0, 40)} unlocks nothing`,
            JSON.stringify(ctx.getCompletedTopics()), '[]');
    }

    /* ---- EXERCISES ALONE COMPLETE THE TOPIC ---- */
    {
        const ctx = H.makePage({ topicCompleted: true, ackCompletedTopics: [6] });
        const onFinish = mountAndCapture(ctx, 6);
        await onFinish(H.finishedAttempt(groupsOf(ctx, 6), 0));
        eq('the exercises alone complete the topic',
            JSON.stringify(ctx.getCompletedTopics()), '[6]');
        ok(!/lug‘at bo‘limini yakunlang|Avval ushbu mavzuning lug/i.test(ctx.text()),
            'and the learner is never told to finish the deck first');
    }

    /* ---- and a server that still says no is reported as a failure ---- */
    {
        const ctx = H.makePage({ topicCompleted: false, ackCompletedTopics: [] });
        const onFinish = mountAndCapture(ctx, 6);
        await onFinish(H.finishedAttempt(groupsOf(ctx, 6), 0));
        eq('a refused completion unlocks nothing',
            JSON.stringify(ctx.getCompletedTopics()), '[]');
        ok(!/lug‘at bo‘limini yakunlang/i.test(ctx.text()),
            'and still does not blame the deck');
    }

    /* ================================================================ *
     * THE RELOAD. The failure that outlives the page.
     * ---------------------------------------------------------------- *
     * Save landed, component did not, and the learner closed the tab. The
     * in-memory retry handle died with it. What must NOT happen next is
     * being asked to solve the topic again.
     * ================================================================ */
    {
        let durable = null;
        const first = H.makePage({
            save: async (uid, topicId, payload) => { durable = payload; return true; },
            component: async () => null
        });
        const onFinish = mountAndCapture(first, 6);
        await onFinish(H.finishedAttempt(groupsOf(first, 6), 0));
        ok(!!(durable || {}).a1ExerciseResult, 'the work reached the server');
        eq('but nothing unlocked', JSON.stringify(first.getCompletedTopics()), '[]');

        /* --- a brand new page, hydrated only from durable server state --- */
        const seen = [];
        const back = H.makePage({
            userQuizResults: { topic_6: durable },
            save: async () => { seen.push('save'); return true; },
            component: async (c, t, cm) => { seen.push('component'); return H.ack(c, t, cm, true, [6]); }
        });
        let mountedSession = false;
        const realMount = back.window.A1Host.mountPractice;
        back.window.A1Host.mountPractice = (o) => { mountedSession = true; return realMount(o); };
        back.mountA1Practice(6);

        eq('after the reload the page does NOT start the exercises again', mountedSession, false);
        ok(/Mashqlar bajarildi/.test(back.text()),
            'it says the work is done and the sync is not');
        ok(!!back.button('Qayta urinish'), 'and offers the sync retry');
        ok(!!back.button('Javoblarni ko‘rish'), 'alongside the review of the stored attempt');

        back.resetWrites();
        await back.button('Qayta urinish').onclick();
        eq('the retry sends the component call ALONE', JSON.stringify(seen), '["component"]');
        eq('no second quiz save', seen.filter((x) => x === 'save').length, 0);
        eq('and the server unlocks it', JSON.stringify(back.getCompletedTopics()), '[6]');
        ok(!back.button('Qayta urinish'), 'the sync prompt is gone');
        ok(!!back.button('Javoblarni ko‘rish'), 'and the topic reads as finished');
    }

    /* the retry is still GATED — a snapshot is not taken on trust */
    {
        const A1 = H.makePage({}).window.A1Host;
        const gctx = H.makePage({});
        const groups = groupsOf(gctx, 6);
        const good = A1.buildSnapshot(6, groups, H.finishedAttempt(groups, 0));
        ok(A1.snapshotProvesCompletion(good, groups, 6), 'a passing snapshot proves the work');
        const short = JSON.parse(JSON.stringify(good));
        short.groups[0].correct = 1;
        eq('a snapshot with a failing group does not', A1.snapshotProvesCompletion(short, groups, 6), false);
        const wrongTopic = JSON.parse(JSON.stringify(good)); wrongTopic.topicId = 7;
        eq('nor one belonging to another topic', A1.snapshotProvesCompletion(wrongTopic, groups, 6), false);
        const notDone = JSON.parse(JSON.stringify(good)); notDone.completed = false;
        eq('nor an unfinished one', A1.snapshotProvesCompletion(notDone, groups, 6), false);
        const missing = JSON.parse(JSON.stringify(good)); missing.groups.pop();
        eq('nor one that misses a group that exists now',
            A1.snapshotProvesCompletion(missing, groups, 6), false);
        eq('and with neither result nor snapshot the pipeline stops at the gate',
            (await A1.completeExercises({ topicId: 6, groups: groups, api: {} })).stage, 'gate');
    }

    /* ---- the sync retry, when the OTHER half is still missing ---- */
    {
        const base = H.makePage({});
        const groups = groupsOf(base, 6);
        const snapshot = base.window.A1Host.buildSnapshot(6, groups, H.finishedAttempt(groups, 0));
        const seen = [];
        const ctx = H.makePage({
            userQuizResults: { topic_6: { a1ExerciseResult: snapshot } },
            save: async () => { seen.push('save'); return true; },
            component: async (c, t, cm) => { seen.push('component'); return H.ack(c, t, cm, false, []); },
            topicCompleted: false, ackCompletedTopics: []
        });
        ctx.mountA1Practice(6);
        ok(!!ctx.button('Qayta urinish'), 'an unacknowledged topic offers the sync retry');
        await ctx.button('Qayta urinish').onclick();

        eq('the sync retry sends the component alone', JSON.stringify(seen), '["component"]');
        eq('the exercises half alone still does not unlock the topic',
            JSON.stringify(ctx.getCompletedTopics()), '[]');
        eq('the sync prompt is gone once the server has answered',
            !!ctx.button('Qayta urinish'), false);
        ok(!!ctx.button('Javoblarni ko‘rish'), 'and the attempt is reviewable');
        /* THE REASON MUST SURVIVE THE RE-RENDER. Applying the outcome draws
           this line and re-rendering the panel wipes it, so the order matters:
           without it the topic stays locked and says nothing about why. */
        ok(!/lug‘at bo‘limini yakunlang/i.test(ctx.text()),
            'and the reason shown is never "finish the vocabulary first"');
    }

    /* a sync retry that FAILS leaves exactly one retry, not a stack of them */
    {
        const base = H.makePage({});
        const groups = groupsOf(base, 6);
        const snapshot = base.window.A1Host.buildSnapshot(6, groups, H.finishedAttempt(groups, 0));
        const ctx = H.makePage({
            userQuizResults: { topic_6: { a1ExerciseResult: snapshot } },
            component: async () => null
        });
        ctx.mountA1Practice(6);
        await ctx.button('Qayta urinish').onclick();
        eq('a failed sync leaves one retry control, not two',
            ctx.all('button').filter((b) => b.textContent.trim() === 'Qayta urinish').length, 1);
        eq('and still unlocks nothing', JSON.stringify(ctx.getCompletedTopics()), '[]');
    }

    /* ---- a topic finished before components existed stays finished ---- */
    {
        const ctx = H.makePage({ completedTopics: [6] });
        let mountedSession = false;
        const realMount = ctx.window.A1Host.mountPractice;
        ctx.window.A1Host.mountPractice = (o) => { mountedSession = true; return realMount(o); };
        ctx.resetWrites();
        ctx.mountA1Practice(6);
        eq('a legacy completed topic is not asked to solve anything', mountedSession, false);
        ok(/avval yakunlangan/.test(ctx.text()), 'it is reported as already finished');
        eq('missing component metadata is NOT read as a sync failure',
            /Mashqlar bajarildi/.test(ctx.text()), false);
        eq('and it triggers no network call', ctx.writes.save + ctx.writes.component, 0);
    }

    /* ---- a durable result outranks a leftover draft ---- */
    {
        const snap = { completed: true, topicId: 6, score: 50, total: 50, percentage: 100,
                       groups: [{ groupId: 'g', title: 'G', correct: 5, total: 5,
                                  percentage: 100, passed: true, answers: ['a'] }] };
        const ctx = H.makePage({
            userQuizResults: { topic_6: { a1ExerciseResult: snap } },
            courseState: { topicComponents: { 6: { exercisesCompleted: true } } }
        });
        ctx.window.localStorage.setItem(ctx.window.A1Host.draftKey('u-1', 6),
            JSON.stringify({ v: 1, cursor: 1, answers: { x: '1' }, checked: {} }));
        ctx.resetWrites();
        ctx.mountA1Practice(6);
        eq('a stale draft never prompts over finished work',
            /Tugallanmagan/i.test(ctx.text()), false);
        ok(/Javoblarni ko‘rish/.test(ctx.text()), 'the finished topic is what shows');
    }
}

console.log('  actual page onFinish · save then component, awaited · fail closed · reload retries the component alone');
console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ A1 EXERCISE COMPLETION: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ A1 EXERCISE COMPLETION: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
})().catch((e) => { console.error(e); process.exit(2); });
