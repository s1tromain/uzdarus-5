#!/usr/bin/env node
/**
 * verify_b1_exercise_completion.cjs — how a B1 topic is actually finished.
 *
 * The order is the whole point. The learner's answers are saved and AWAITED
 * first, and only a save that landed may report the exercises component; the
 * server's reply is the only thing that moves the learner forward. Every step
 * fails closed, because the failure mode of getting this wrong is a topic that
 * unlocks the next one against work nobody recorded.
 *
 * Everything below drives the REAL PAGE — the functions are lifted out of
 * paid-courses/b1-course.html and executed — because a host that behaves
 * perfectly proves nothing if the page never calls it or drops its promise.
 * Both of those were real defects found during A1's closeout.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./_b1_page_harness.cjs');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('\n=== B1 EXERCISE COMPLETION ===');
const HOSTSRC = read('b1-host.js');
const T = 1;

function mountAndCapture(ctx, id) {
    const B1 = ctx.window.B1Host;
    const real = B1.mountPractice;
    let captured = null;
    B1.mountPractice = (o) => { captured = o.onFinish; return real(o); };
    ctx.mountB1Practice(id);
    B1.mountPractice = real;
    return captured;
}
const groupsOf = (ctx, id) =>
    ctx.window.B1Host.groupsOf(ctx.courseData.topics.find((t) => t.id === id));

(async () => {

/* ---- the page installs a real completion handler, and returns its promise ---- */
{
    const ctx = H.makePage({});
    eq('the page installs an onFinish', typeof mountAndCapture(ctx, T), 'function');
    ok(/return b1FinishExercises\(topicId, uid, result\)/.test(H.PAGE),
        'and returns the completion promise, so both awaits are observable');
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
            return H.ack(c, t, cm, true, [T]);
        },
        topicCompleted: true, ackCompletedTopics: [T]
    });
    const onFinish = mountAndCapture(ctx, T);
    await onFinish(H.finishedAttempt(groupsOf(ctx, T), 0));

    eq('the page saves before it reports', order[0], 'save-start');
    eq('and waits for the save to land first', order[1], 'save-end');
    eq('then reports B1 / this topic / the exercises half',
        order[2], `component(B1,${T},exercises) saveDone=true`);
    eq('exactly one completion ran', order.length, 3);
    eq('the page never claims the whole topic itself', ctx.writes.topic, 0);
    ok(!!(ctx.userQuizResults['topic_' + T] || {}).b1ExerciseResult,
        'the durable result is hydrated in memory too');
    eq('progression is the SERVER array', JSON.stringify(ctx.getCompletedTopics()), `[${T}]`);
    ok(ctx.loadTopicsCalls > 0, 'and the topic list is redrawn from it');
}

/* ---- the gate runs BEFORE anything is written ---- */
{
    const ctx = H.makePage({});
    const groups = groupsOf(ctx, T);
    const onFinish = mountAndCapture(ctx, T);
    ctx.resetWrites();
    /* one exercise at 7/10 — a pass under the OLD topic-wide sum, a fail now */
    const checked = {};
    groups.forEach((g, i) => {
        const total = g.items.length;
        const c = i === 0 ? Math.floor(total * 0.7) : total;
        checked[g.id] = { correct: c, total, passed: c * 100 >= total * 80 };
    });
    await onFinish({ answers: {}, checked });
    eq('a failed exercise saves nothing', ctx.writes.save, 0);
    eq('reports nothing', ctx.writes.component, 0);
    eq('and unlocks nothing', JSON.stringify(ctx.getCompletedTopics()), '[]');
}

/* ---- the REAL saveQuizResult contract: true / false ---- */
{
    const plat = read('paid-courses/paid-platform.js');
    const fnAt = plat.indexOf('async function firestoreSaveQuizResult');
    const body = plat.slice(fnAt, plat.indexOf('\n}\n', fnAt));
    ok(fnAt > 0 && body.length > 200, 'the shipped saveQuizResult was located');
    ok(/return true;/.test(body) && /return false;/.test(body),
        'production saveQuizResult answers with true or false');

    const ctxT = H.makePage({ save: async () => true });
    await mountAndCapture(ctxT, T)(H.finishedAttempt(groupsOf(ctxT, T), 0));
    eq('a true from the real contract is accepted as durable', ctxT.writes.component, 1);

    const ctxF = H.makePage({ save: async () => false });
    await mountAndCapture(ctxF, T)(H.finishedAttempt(groupsOf(ctxF, T), 0));
    eq('a false from the real contract stops the pipeline', ctxF.writes.component, 0);

    /* and the course code the page sends is B1's */
    const ctxC = H.makePage({});
    await mountAndCapture(ctxC, T)(H.finishedAttempt(groupsOf(ctxC, T), 0));
    eq('the save is filed under B1', (ctxC.calls.find((c) => c[0] === 'save') || [])[1], 'B1');
}

/* ---- fail closed, at either step ---- */
{
    const ctx = H.makePage({ save: async () => false });
    await mountAndCapture(ctx, T)(H.finishedAttempt(groupsOf(ctx, T), 0));
    eq('a failed save reports nothing', ctx.writes.component, 0);
    eq('and unlocks nothing', JSON.stringify(ctx.getCompletedTopics()), '[]');
    ok(/Natijani saqlab/.test(ctx.text()), 'the learner is told, in the page');
    ok(!!ctx.button('Qayta urinish'), 'with a retry they can click');
}
{
    const ctx = H.makePage({ component: async () => null });
    await mountAndCapture(ctx, T)(H.finishedAttempt(groupsOf(ctx, T), 0));
    eq('a failed component unlocks nothing', JSON.stringify(ctx.getCompletedTopics()), '[]');
    ok(!!(ctx.getPendingRetry() || {}).snapshot,
        'and the retry it offers is the component alone');
}
for (const bad of [{ ok: true }, { ok: true, course: 'A2', topicId: T },
                   { ok: true, course: 'B1', topicId: T + 1 },
                   { ok: true, course: 'B1', topicId: T, components: {}, topicCompleted: true, completedTopics: [] },
                   { ok: false, course: 'B1', topicId: T, components: { exercisesCompleted: true }, topicCompleted: true, completedTopics: [] }]) {
    const ctx = H.makePage({ component: async () => bad });
    await mountAndCapture(ctx, T)(H.finishedAttempt(groupsOf(ctx, T), 0));
    eq(`a malformed ACK ${JSON.stringify(bad).slice(0, 44)} unlocks nothing`,
        JSON.stringify(ctx.getCompletedTopics()), '[]');
}

/* ---- exercises alone leave the topic locked ---- */
{
    const ctx = H.makePage({ topicCompleted: false, ackCompletedTopics: [] });
    await mountAndCapture(ctx, T)(H.finishedAttempt(groupsOf(ctx, T), 0));
    eq('the exercises half alone does not complete the topic',
        JSON.stringify(ctx.getCompletedTopics()), '[]');
    ok(/lug‘at/.test(ctx.text()), 'and the learner is pointed at the vocabulary half');
}

/* ---- the old topic-wide completion is not the learner's path ---- */
{
    eq('the host never calls completeCourseTopic', /completeCourseTopic/.test(HOSTSRC), false);
    ok(/completeCourseComponent/.test(HOSTSRC), 'it reports the component instead');
    const at = H.PAGE.indexOf('function mountB1Practice');
    const region = H.PAGE.slice(at, H.PAGE.indexOf('function renderTopic1Exercises', at));
    eq('and the session path does not claim the whole topic',
        /completeCourseTopic/.test(region), false);
    eq('nor pushes a topic id locally', /completedTopics\.push/.test(region), false);
    ok(/completedTopics = outcome\.completedTopics\.slice\(\)/.test(region),
        'progression is assigned from the server array');
}

/* ================================================================ *
 * THE RELOAD — the failure that outlives the page
 * ================================================================ */
{
    let durable = null;
    const first = H.makePage({
        save: async (uid, topicId, payload) => { durable = payload; return true; },
        component: async () => null
    });
    await mountAndCapture(first, T)(H.finishedAttempt(groupsOf(first, T), 0));
    ok(!!(durable || {}).b1ExerciseResult, 'the work reached the server');
    eq('but nothing unlocked', JSON.stringify(first.getCompletedTopics()), '[]');

    const seen = [];
    const back = H.makePage({
        userQuizResults: { ['topic_' + T]: durable },
        save: async () => { seen.push('save'); return true; },
        component: async (c, t, cm) => { seen.push('component'); return H.ack(c, t, cm, true, [T]); }
    });
    let mountedSession = false;
    const realMount = back.window.B1Host.mountPractice;
    back.window.B1Host.mountPractice = (o) => { mountedSession = true; return realMount(o); };
    back.mountB1Practice(T);

    eq('after the reload the page does NOT start the exercises again', mountedSession, false);
    ok(/Mashqlar bajarildi/.test(back.text()), 'it says the work is done and the sync is not');
    ok(!!back.button('Qayta urinish'), 'and offers the sync retry');
    ok(!!back.button('Javoblarni ko‘rish'), 'alongside the review of the stored attempt');

    await back.button('Qayta urinish').onclick();
    eq('the retry sends the component call ALONE', JSON.stringify(seen), '["component"]');
    eq('and the server unlocks it', JSON.stringify(back.getCompletedTopics()), `[${T}]`);
    ok(!back.button('Qayta urinish'), 'the sync prompt is gone');
    ok(!!back.button('Javoblarni ko‘rish'), 'and the topic reads as finished');
}

/* the retry is still GATED — a durable snapshot is not taken on trust */
{
    const ctx = H.makePage({});
    const B1 = ctx.window.B1Host;
    const groups = groupsOf(ctx, T);
    const good = B1.buildSnapshot(T, groups, H.finishedAttempt(groups, 0));
    ok(B1.snapshotProvesCompletion(good, groups, T), 'a passing snapshot proves the work');
    const forged = { completed: true, topicId: T, score: 999, total: 999, percentage: 100, groups: [] };
    eq('a forged snapshot with no groups proves nothing',
        B1.snapshotProvesCompletion(forged, groups, T), false);
    const short = JSON.parse(JSON.stringify(good)); short.groups[0].correct = 1;
    eq('a snapshot with a failing exercise does not',
        B1.snapshotProvesCompletion(short, groups, T), false);
    const other = JSON.parse(JSON.stringify(good)); other.topicId = T + 1;
    eq('nor one belonging to another topic', B1.snapshotProvesCompletion(other, groups, T), false);
    const undone = JSON.parse(JSON.stringify(good)); undone.completed = false;
    eq('nor an unfinished one', B1.snapshotProvesCompletion(undone, groups, T), false);
    const missing = JSON.parse(JSON.stringify(good)); missing.groups.pop();
    eq('nor one missing an exercise that exists now',
        B1.snapshotProvesCompletion(missing, groups, T), false);
    eq('and with neither result nor snapshot the pipeline stops at the gate',
        (await B1.completeExercises({ topicId: T, groups, api: {} })).stage, 'gate');
}

/* ---- the sync retry when the OTHER half is still missing ---- */
{
    const base = H.makePage({});
    const groups = groupsOf(base, T);
    const snapshot = base.window.B1Host.buildSnapshot(T, groups, H.finishedAttempt(groups, 0));
    const seen = [];
    const ctx = H.makePage({
        userQuizResults: { ['topic_' + T]: { b1ExerciseResult: snapshot } },
        save: async () => { seen.push('save'); return true; },
        component: async (c, t, cm) => { seen.push('component'); return H.ack(c, t, cm, false, []); }
    });
    ctx.mountB1Practice(T);
    await ctx.button('Qayta urinish').onclick();
    eq('the sync retry sends the component alone', JSON.stringify(seen), '["component"]');
    eq('the exercises half alone still does not unlock the topic',
        JSON.stringify(ctx.getCompletedTopics()), '[]');
    eq('the sync prompt is gone once the server answered',
        !!ctx.button('Qayta urinish'), false);
    ok(/lug‘at/.test(ctx.text()),
        'and the learner is told the vocabulary half is what is missing');
}
{
    const base = H.makePage({});
    const groups = groupsOf(base, T);
    const snapshot = base.window.B1Host.buildSnapshot(T, groups, H.finishedAttempt(groups, 0));
    const ctx = H.makePage({
        userQuizResults: { ['topic_' + T]: { b1ExerciseResult: snapshot } },
        component: async () => null
    });
    ctx.mountB1Practice(T);
    await ctx.button('Qayta urinish').onclick();
    eq('a failed sync leaves one retry control, not two',
        ctx.all('button').filter((b) => b.textContent.trim() === 'Qayta urinish').length, 1);
    eq('and still unlocks nothing', JSON.stringify(ctx.getCompletedTopics()), '[]');
}

/* ---- a topic finished before components existed stays finished ---- */
{
    const ctx = H.makePage({ completedTopics: [T] });
    let mountedSession = false;
    const realMount = ctx.window.B1Host.mountPractice;
    ctx.window.B1Host.mountPractice = (o) => { mountedSession = true; return realMount(o); };
    ctx.resetWrites();
    ctx.mountB1Practice(T);
    eq('a legacy completed topic is not asked to solve anything', mountedSession, false);
    ok(/avval yakunlangan/.test(ctx.text()), 'it is reported as already finished');
    eq('missing component metadata is NOT read as a sync failure',
        /Mashqlar bajarildi/.test(ctx.text()), false);
    eq('and it triggers no network call', ctx.writes.save + ctx.writes.component, 0);
}

/* ---- a durable result outranks a leftover draft ---- */
{
    const base = H.makePage({});
    const groups = groupsOf(base, T);
    const snap = base.window.B1Host.buildSnapshot(T, groups, H.finishedAttempt(groups, 0));
    const ctx = H.makePage({
        userQuizResults: { ['topic_' + T]: { b1ExerciseResult: snap } },
        courseState: { topicComponents: { [T]: { exercisesCompleted: true } } }
    });
    ctx.window.localStorage.setItem(ctx.window.B1Host.draftKey('u-1', T),
        JSON.stringify({ v: 1, cursor: 1, answers: { x: '1' }, checked: {} }));
    ctx.resetWrites();
    ctx.mountB1Practice(T);
    eq('a stale draft never prompts over finished work', /Tugallanmagan/i.test(ctx.text()), false);
    ok(/Javoblarni ko‘rish/.test(ctx.text()), 'the finished topic is what shows');
    eq('and opening it writes nothing',
        ctx.writes.save + ctx.writes.component + ctx.writes.draftSet + ctx.writes.draftRemove, 0);
}

console.log('  actual page onFinish · save then component, awaited · fail closed · reload retries the component alone');
console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ B1 EXERCISE COMPLETION: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ B1 EXERCISE COMPLETION: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
})().catch((e) => { console.error(e); process.exit(2); });
