#!/usr/bin/env node
/**
 * verify_b2_exercise_convergence.cjs — B2's exercise lifecycle, driven.
 *
 * B2 already stepped through its exercises under the shared session and
 * already gated each one at 80%. What it did not have was the rest of the
 * story, and the gap mattered: the topic-completion route it used
 * (complete-topic) stopped completing anything when the two-component model
 * landed, so a learner who finished every exercise reported into a route that
 * could not append and the topic never completed at all.
 *
 * Everything below drives the REAL page functions lifted out of
 * paid-courses/b2-course.html. A lifecycle that behaves in isolation proves
 * nothing about a page that never calls it — that is precisely the class of
 * defect this whole effort has been closing.
 */
'use strict';
const H = require('./_a2b2_page_harness.cjs');

const C = 'B2';
const P = 'b2';
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

console.log('\n=== B2 EXERCISE CONVERGENCE ===');

const T = 1;
const SRC = H.SRC[C];
const call = (ctx, fn) => ctx[P + fn];

(async () => {

/* ================================================================ *
 * 1. THE SCORING IT ALREADY HAD IS UNCHANGED
 * ================================================================ */
{
    const L = H.makePage(C, { topicId: T }).window.UzExerciseLifecycle.create({ course: C });
    eq('the platform threshold is still 80', L.PASS_PERCENT, 80);
    const ctx = H.makePage(C, { topicId: T });
    const groups = ctx.groups.filter((g) => (g.items || []).length);
    ok(groups.length > 0, `${C}: topic ${T} has ${groups.length} scored exercises`);

    const at = (idx, correct) => {
        const checked = {};
        groups.forEach((g, i) => {
            const total = g.items.length;
            checked[g.id] = { correct: i === idx ? correct : total, total };
        });
        return { answers: {}, checked };
    };
    eq('every exercise perfect passes the gate', L.allGroupsPassed(groups, at(-1, 0)), true);
    const n = groups[0].items.length;
    eq(`${Math.ceil(n * 0.8) - 1}/${n} on one exercise fails`,
        L.allGroupsPassed(groups, at(0, Math.ceil(n * 0.8) - 1)), false);
    eq(`${Math.ceil(n * 0.8)}/${n} passes`,
        L.allGroupsPassed(groups, at(0, Math.ceil(n * 0.8))), true);
    /* NO COMPENSATION — the rule the whole migration exists for */
    const comp = {};
    groups.forEach((g, i) => {
        const total = g.items.length;
        comp[g.id] = { correct: i === 1 ? Math.floor(total / 2) : total, total };
    });
    eq('perfect exercises never pay for a failed one',
        L.allGroupsPassed(groups, { answers: {}, checked: comp }), false);
    /* a caller claiming passed:true on a failed exercise is still refused */
    const lying = {};
    groups.forEach((g, i) => {
        lying[g.id] = { correct: i === 0 ? 1 : g.items.length, total: g.items.length, passed: true };
    });
    eq('a checked entry claiming passed:true on 1/N is refused',
        L.allGroupsPassed(groups, { answers: {}, checked: lying }), false);
}

/* ================================================================ *
 * 2. THE DRAFT IS SCOPED AND FINGERPRINTED
 * ================================================================ */
{
    const ctx = H.makePage(C, { topicId: T });
    const L = ctx.window.UzExerciseLifecycle.create({ course: C });
    const groups = ctx.groups;
    const k = L.draftKey('u1', T);
    ok(new RegExp('^uzdarus:exercise-draft:u1:' + C + ':' + T + ':').test(k),
        `the draft key is user+course+topic scoped (${k})`);
    ok(L.draftKey('u1', T) !== L.draftKey('u2', T), 'two users never share a draft');
    ok(L.draftKey('u1', T) !== L.draftKey('u1', T + 1), 'two topics never share a draft');
    const other = ctx.window.UzExerciseLifecycle.create({ course: C === 'A2' ? 'B2' : 'A2' });
    ok(L.draftKey('u1', T) !== other.draftKey('u1', T), 'two courses never share a draft');

    const d = L.draftFor('u1', T, groups);
    d.save({ cursor: 2, answers: { x: '1' }, checked: { a: { correct: 3, total: 3, passed: true } } });
    const back = d.load();
    ok(!!back, 'a saved draft loads back');
    eq('the cursor is restored', back.cursor, 2);
    eq('the answers are restored', JSON.stringify(back.answers), '{"x":"1"}');
    ok(back.checked && back.checked.a && back.checked.a.correct === 3,
        'and the cleared exercises with their scores');

    /* a lesson that changed shape must not replay old answers */
    const shrunk = groups.map((g, i) => i === 0
        ? { id: g.id, items: (g.items || []).slice(1) } : g);
    eq('a changed lesson shape rejects the draft',
        L.draftFor('u1', T, shrunk).load(), null);
    eq('and another topic cannot read it', L.draftFor('u1', T + 1, groups).load(), null);
    eq('nor another user', L.draftFor('u2', T, groups).load(), null);

    /* the page really wires this, not just the module */
    ok(/draftFor\(/.test(H.read('b2-host.js')),
        `${C}'s host uses the scoped draft factory`);
}

/* ================================================================ *
 * 3. THE COMPLETION ORDER, ON THE REAL PAGE
 * ================================================================ */
{
    const order = [];
    let saveDone = false;
    const ctx = H.makePage(C, {
        topicId: T, topicCompleted: true, ackCompletedTopics: [T],
        save: async () => { order.push('save-start'); await new Promise((r) => setTimeout(r, 10));
                            saveDone = true; order.push('save-end'); return true; },
        component: async (c, t, cm) => {
            order.push(`component(${c},${t},${cm}) saveDone=${saveDone}`);
            await new Promise((r) => setTimeout(r, 10));
            return H.ack(c, t, cm, true, [T]);
        }
    });
    const out = await call(ctx, 'FinishExercises')(T, H.finishedAttempt(ctx.groups, 0));
    eq('the page saves the attempt first', order[0], 'save-start');
    eq('and waits for it to land', order[1], 'save-end');
    eq(`then reports ${C} / this topic / the exercises half`,
        order[2], `component(${C},${T},exercises) saveDone=true`);
    eq('exactly one completion ran', order.length, 3);
    eq('the page never claims the whole topic itself', ctx.writes.topic, 0);
    ok(out && out.ok, 'the completion succeeded');
    ok(!!(ctx.userQuizResults['topic_' + T] || {})[P + 'ExerciseResult'],
        'the durable attempt is hydrated in memory');
    eq('progression is the SERVER array', JSON.stringify(ctx.getCompletedTopics()), `[${T}]`);
}

/* THE GATE RUNS BEFORE ANYTHING IS WRITTEN — and the gate is the OFFICIAL
   TOTAL, not a pass on every single exercise. One weak exercise that still
   leaves the paper at 80% is earned; a paper genuinely under the bar writes
   nothing at all. Testing this with a single low exercise and the rest
   perfect proved nothing about the gate, because such a paper is a pass. */
{
    const ctx = H.makePage(C, { topicId: T });
    const groups = ctx.groups.filter((g) => (g.items || []).length);
    const under = {};
    groups.forEach((g) => {
        const total = g.items.length;
        under[g.id] = { correct: Math.floor(total * 0.5), total };
    });
    ctx.resetWrites();
    await call(ctx, 'FinishExercises')(T, { answers: {}, checked: under });
    eq('a paper under the threshold saves nothing', ctx.writes.save, 0);
    eq('and reports nothing', ctx.writes.component, 0);
    eq('and unlocks nothing', JSON.stringify(ctx.getCompletedTopics()), '[]');

    /* one weak exercise, the rest perfect: still above the bar, still earned */
    const mostly = {};
    groups.forEach((g, i) => {
        const total = g.items.length;
        mostly[g.id] = { correct: i === 0 ? Math.floor(total * 0.5) : total, total };
    });
    ctx.resetWrites();
    await call(ctx, 'FinishExercises')(T, { answers: {}, checked: mostly });
    ok(ctx.writes.save >= 1 && ctx.writes.component >= 1,
        'one weak exercise does not sink a paper that still reaches 80%');
}

/* ================================================================ *
 * 4. FAIL CLOSED, AT EITHER STEP
 * ================================================================ */
{
    const ctx = H.makePage(C, { topicId: T, save: async () => false });
    await call(ctx, 'FinishExercises')(T, H.finishedAttempt(ctx.groups, 0));
    eq('a failed save reports nothing', ctx.writes.component, 0);
    eq('and unlocks nothing', JSON.stringify(ctx.getCompletedTopics()), '[]');
    ok(/Natijani saqlab/.test(ctx.text()), 'the learner is told, in the page');
    ok(!!ctx.button('Qayta urinish'), 'with a retry they can click');
}
{
    const ctx = H.makePage(C, { topicId: T, component: async () => null });
    await call(ctx, 'FinishExercises')(T, H.finishedAttempt(ctx.groups, 0));
    eq('a failed component unlocks nothing', JSON.stringify(ctx.getCompletedTopics()), '[]');
    ok(!!(ctx.getPendingRetry() || {}).snapshot,
        'and the retry it offers is the component alone');
}
for (const bad of [{ ok: true }, { ok: true, course: 'ZZ', topicId: T },
                   { ok: true, course: C, topicId: T + 5 },
                   { ok: true, course: C, topicId: T, components: {}, topicCompleted: true, completedTopics: [] },
                   { ok: false, course: C, topicId: T, components: { exercisesCompleted: true }, topicCompleted: true, completedTopics: [] }]) {
    const ctx = H.makePage(C, { topicId: T, component: async () => bad });
    await call(ctx, 'FinishExercises')(T, H.finishedAttempt(ctx.groups, 0));
    eq(`a malformed ACK ${JSON.stringify(bad).slice(0, 40)} unlocks nothing`,
        JSON.stringify(ctx.getCompletedTopics()), '[]');
}

/* ================================================================ *
 * 5. THE EXERCISES ARE THE WHOLE RULE
 *
 * This block used to assert the opposite — that reporting the exercises left
 * the topic locked and sent the learner to the deck. That errand is what
 * stranded people: every route that left the deck unrecorded locked them out
 * of the rest of the course with no way back.
 * ================================================================ */
{
    const ctx = H.makePage(C, { topicId: T, topicCompleted: true, ackCompletedTopics: [T] });
    const out = await call(ctx, 'FinishExercises')(T, H.finishedAttempt(ctx.groups, 0));
    ok(out && out.ok, 'reporting the exercises succeeds');
    eq('and the topic completes without the deck',
        JSON.stringify(ctx.getCompletedTopics()), JSON.stringify([T]));
    ok(!/lug‘at bo‘limini yakunlang/i.test(String(out.message)),
        `and nothing points at the deck (${out.message})`);
}

/* a server that still refuses is reported as a failure to retry */
{
    const ctx = H.makePage(C, { topicId: T, topicCompleted: false, ackCompletedTopics: [] });
    const out = await call(ctx, 'FinishExercises')(T, H.finishedAttempt(ctx.groups, 0));
    eq('a refused completion unlocks nothing', JSON.stringify(ctx.getCompletedTopics()), '[]');
    ok(!/lug‘at bo‘limini yakunlang/i.test(String(out && out.message)),
        'and the learner is never sent to the deck instead');
}

/* ================================================================ *
 * 6. THE RELOAD — the failure that outlives the page
 * ================================================================ */
{
    let durable = null;
    const first = H.makePage(C, {
        topicId: T,
        save: async (uid, tid, payload) => { durable = payload; return true; },
        component: async () => null
    });
    await call(first, 'FinishExercises')(T, H.finishedAttempt(first.groups, 0));
    ok(!!(durable || {})[P + 'ExerciseResult'], 'the work reached the server');
    eq('but nothing unlocked', JSON.stringify(first.getCompletedTopics()), '[]');

    const seen = [];
    const back = H.makePage(C, {
        topicId: T,
        userQuizResults: { ['topic_' + T]: durable },
        save: async () => { seen.push('save'); return true; },
        component: async (c, t, cm) => { seen.push('component'); return H.ack(c, t, cm, true, [T]); }
    });
    const rendered = call(back, 'RenderState')(T, back.mount);
    eq('after the reload the page does NOT offer a fresh attempt', rendered, true);
    ok(/Mashqlar bajarildi/.test(back.text()), 'it says the work is done and the sync is not');
    ok(!!back.button('Qayta urinish'), 'and offers the sync retry');
    ok(!!back.button('Javoblarni ko‘rish'), 'alongside the review of the stored attempt');

    await back.button('Qayta urinish').onclick();
    eq('the retry sends the component call ALONE', JSON.stringify(seen), '["component"]');
    eq('and the server unlocks it', JSON.stringify(back.getCompletedTopics()), `[${T}]`);
    eq('the sync prompt is gone', !!back.button('Qayta urinish'), false);
    ok(!!back.button('Javoblarni ko‘rish'), 'and the topic reads as finished');
}

/* a durable snapshot is not taken on trust */
{
    const ctx = H.makePage(C, { topicId: T });
    const L = ctx.window.UzExerciseLifecycle.create({ course: C });
    const groups = ctx.groups.filter((g) => (g.items || []).length);
    const good = L.buildSnapshot(T, groups, H.finishedAttempt(groups, 0));
    ok(L.snapshotProvesCompletion(good, groups, T), 'a passing snapshot proves the work');
    const forged = { completed: true, topicId: T, score: 999, total: 999, percentage: 100, groups: [] };
    eq('a forged snapshot with no exercises proves nothing',
        L.snapshotProvesCompletion(forged, groups, T), false);
    const short = JSON.parse(JSON.stringify(good)); short.groups[0].correct = 1;
    eq('nor one with a failing exercise', L.snapshotProvesCompletion(short, groups, T), false);
    const other = JSON.parse(JSON.stringify(good)); other.topicId = T + 1;
    eq('nor one belonging to another topic', L.snapshotProvesCompletion(other, groups, T), false);
    const undone = JSON.parse(JSON.stringify(good)); undone.completed = false;
    eq('nor an unfinished one', L.snapshotProvesCompletion(undone, groups, T), false);
    const missing = JSON.parse(JSON.stringify(good)); missing.groups.pop();
    eq('nor one missing an exercise that exists now',
        L.snapshotProvesCompletion(missing, groups, T), false);
}

/* ================================================================ *
 * 7. THE FINISHED FACE, AND THE REVIEW
 * ================================================================ */
{
    const base = H.makePage(C, { topicId: T });
    const L = base.window.UzExerciseLifecycle.create({ course: C });
    const groups = base.groups.filter((g) => (g.items || []).length);
    const snap = L.buildSnapshot(T, groups, H.finishedAttempt(groups, 2));

    const ctx = H.makePage(C, {
        topicId: T,
        userQuizResults: { ['topic_' + T]: { [P + 'ExerciseResult']: snap } },
        courseState: { topicComponents: { [T]: { exercisesCompleted: true } } }
    });
    ctx.resetWrites();
    eq('a finished topic renders its result, not a session',
        call(ctx, 'RenderState')(T, ctx.mount), true);
    const cta = ctx.button('Javoblarni ko‘rish');
    ok(!!cta, 'with a visible Javoblarni ko‘rish button');
    eq('it is a button, not a label', cta.tagName, 'BUTTON');
    eq('and no second attempt is offered', !!ctx.button('Mashqlarni bajarish'), false);
    eq('rendering it writes nothing',
        ctx.writes.save + ctx.writes.component + ctx.writes.topic +
        ctx.writes.draftSet + ctx.writes.draftRemove, 0);

    ctx.resetWrites();
    cta.click();
    ok(!!ctx.q('.' + P + '-review'), 'clicking it opens the review');
    const text = ctx.text();
    ok(text.includes(String(snap.score) + '/' + snap.total), 'the stored overall result is shown');
    ok(text.includes(snap.percentage + '%'), 'as a percentage too');
    eq('every stored exercise is rendered',
        ctx.all('.' + P + '-review-group').length, snap.groups.length);
    snap.groups.forEach((g) => {
        ok(text.includes(g.correct + '/' + g.total), `${g.groupId} shows its own X/Y`);
        ok(text.includes(g.percentage + '%'), `${g.groupId} shows its percentage`);
    });
    ok(/o‘tdi|o‘tmadi/.test(text), 'and whether each exercise passed');
    ok(text.includes('Sizning javobingiz'), 'the learner\'s own answers are shown');
    ok(/To‘g‘ri javob|Namuna javob/.test(text), 'alongside the canonical answer');
    ok(/✓/.test(text) || /✗/.test(text), 'right and wrong are marked');

    /* READ-ONLY BY CONSTRUCTION */
    eq('the review has no inputs', ctx.all('input').length, 0);
    eq('no selects', ctx.all('select').length, 0);
    eq('no textareas', ctx.all('textarea').length, 0);
    eq('and no contenteditable', ctx.all('[contenteditable]').length, 0);
    eq('the only control is a way back',
        JSON.stringify(ctx.all('button').map((b) => b.textContent.trim())), '["Yopish"]');

    /* IT WRITES NOTHING */
    eq('opening the review saves no result', ctx.writes.save, 0);
    eq('reports no component', ctx.writes.component, 0);
    eq('claims no topic', ctx.writes.topic, 0);
    eq('writes no draft', ctx.writes.draftSet, 0);
    eq('and removes none either', ctx.writes.draftRemove, 0);

    ctx.resetWrites();
    ctx.button('Yopish').click();
    eq('closing the review writes nothing',
        ctx.writes.save + ctx.writes.component + ctx.writes.topic +
        ctx.writes.draftSet + ctx.writes.draftRemove, 0);
    ok(!!ctx.button('Javoblarni ko‘rish'), 'and returns to the finished panel');

    /* the stored attempt is displayed, never recomputed */
    eq('the stored snapshot is not rewritten by looking at it',
        JSON.stringify(ctx.userQuizResults['topic_' + T][P + 'ExerciseResult']),
        JSON.stringify(snap));
}

/* it survives a reload and a round trip */
{
    const base = H.makePage(C, { topicId: T });
    const L = base.window.UzExerciseLifecycle.create({ course: C });
    const groups = base.groups.filter((g) => (g.items || []).length);
    const snap = L.buildSnapshot(T, groups, H.finishedAttempt(groups, 0));
    const seed = {
        topicId: T,
        userQuizResults: { ['topic_' + T]: { [P + 'ExerciseResult']: snap } },
        courseState: { topicComponents: { [T]: { exercisesCompleted: true } } }
    };
    const reloaded = H.makePage(C, seed);
    call(reloaded, 'RenderState')(T, reloaded.mount);
    ok(!!reloaded.button('Javoblarni ko‘rish'), 'after a reload the CTA still offers the review');
    reloaded.mount.innerHTML = '';
    call(reloaded, 'RenderState')(T, reloaded.mount);
    ok(!!reloaded.button('Javoblarni ko‘rish'),
        'after leaving and returning the CTA is unchanged');
    /* an untouched topic still invites the work */
    const fresh = H.makePage(C, { topicId: T });
    eq('an untouched topic renders no finished face',
        call(fresh, 'RenderState')(T, fresh.mount), false);
}

/* a durable result outranks a stale draft */
{
    const base = H.makePage(C, { topicId: T });
    const L = base.window.UzExerciseLifecycle.create({ course: C });
    const groups = base.groups.filter((g) => (g.items || []).length);
    const snap = L.buildSnapshot(T, groups, H.finishedAttempt(groups, 0));
    const ctx = H.makePage(C, {
        topicId: T,
        userQuizResults: { ['topic_' + T]: { [P + 'ExerciseResult']: snap } },
        courseState: { topicComponents: { [T]: { exercisesCompleted: true } } }
    });
    ctx.window.localStorage.setItem(
        ctx.window.UzExerciseLifecycle.create({ course: C }).draftKey('u-1', T),
        JSON.stringify({ v: 1, cursor: 1, answers: { x: '1' }, checked: {} }));
    ctx.resetWrites();
    eq('a finished topic still renders as finished with a draft present',
        call(ctx, 'RenderState')(T, ctx.mount), true);
    eq('no resume prompt appears over finished work', /Tugallanmagan/i.test(ctx.text()), false);
    ok(/Javoblarni ko‘rish/.test(ctx.text()), 'the finished topic is what shows');
}

/* a topic finished before components existed stays finished */
{
    const ctx = H.makePage(C, { topicId: T, completedTopics: [T] });
    ctx.resetWrites();
    eq('a legacy completed topic renders a finished face',
        call(ctx, 'RenderState')(T, ctx.mount), true);
    ok(/avval yakunlangan/.test(ctx.text()), 'it is reported as already finished');
    eq('missing component metadata is NOT read as a sync failure',
        /Mashqlar bajarildi/.test(ctx.text()), false);
    eq('and it triggers no network call', ctx.writes.save + ctx.writes.component, 0);
}

/* ================================================================ *
 * 7b. THE RESUME DIALOG, RAISED BY A REAL DRAFT
 * ---------------------------------------------------------------- *
 * Everything above proves the draft round-trips as DATA. That is not the
 * same as a learner being offered it: a page that saved a perfect draft and
 * never consulted it would satisfy every assertion so far. So this plants a
 * draft, opens the session the learner opens, and reads the dialog.
 * ================================================================ */
{
    const seed = H.mountSession(C, { topicId: T });
    const scored = seed.groups;
    ok(scored.length > 2, C + ': the topic has enough exercises to stop part-way');

    /* stopped on exercise 3, with an answer typed and exercise 1 cleared */
    const first = scored[0];
    const answers = {};
    (first.items || []).forEach((it, i) => {
        answers[first.id + '-' + i] = String(Array.isArray(it.answer) ? it.answer[0] : it.answer);
    });
    const checked = {};
    checked[first.id] = { correct: first.items.length, total: first.items.length, passed: true };
    seed.lifecycle.draftFor('u-1', T, scored).save(
        { v: 1, cursor: 2, answers: answers, checked: checked });

    const back = H.mountSession(C, { topicId: T, carry: seed.carry });
    back.open();
    ok(!!back.ask(), C + ': a saved draft raises the resume dialog');
    const t = back.askText();
    ok(/Tugallanmagan mashqlar topildi\./.test(t),
        C + ': with the exact wording — Tugallanmagan mashqlar topildi.');
    ok(/Davom ettirasizmi yoki boshidan boshlaysizmi\?/.test(t),
        C + ': and the exact question');
    eq(C + ': offering exactly Davom ettirish and Qaytadan boshlash',
        JSON.stringify(back.askButtons()), '["Davom ettirish","Qaytadan boshlash"]');

    /* CONTINUE puts the learner back where they were */
    back.press('Davom ettirish');
    ok(/3/.test(back.stepText()), C + ': Davom ettirish resumes at the saved exercise');
    const restored = seed.lifecycle.draftFor('u-1', T, scored).load();
    ok(!!restored, C + ': the draft is still readable after continuing');
    eq(C + ': the cursor was the saved one', restored.cursor, 2);
    ok(restored.checked && restored.checked[first.id]
        && restored.checked[first.id].correct === first.items.length,
        C + ': and the already-cleared exercise kept its score');

    /* RESTART clears the unfinished attempt and NOTHING else */
    const again = H.mountSession(C, { topicId: T, carry: seed.carry });
    const keep = 'uzdarus:unrelated:' + C;
    again.window.localStorage.setItem(keep, 'keep-me');
    again.window.localStorage.setItem('a_vocabulary_progress_u-1', '{"topic_1":5}');
    again.open();
    ok(!!again.ask(), C + ': the dialog is offered again');
    again.press('Qaytadan boshlash');
    /* READ THROUGH THE WINDOW THAT DID THE CLEARING. Each mounted session is
       its own jsdom with its own storage; `carry` is what crosses between
       them, so asking the SEED's lifecycle would report the value that window
       still holds and say the clear failed when it did not. */
    eq(C + ': Qaytadan boshlash drops the unfinished draft',
        again.lifecycle.draftFor('u-1', T, scored).load(), null);
    eq(C + ': and touches nothing else in storage',
        again.window.localStorage.getItem(keep), 'keep-me');
    eq(C + ': vocabulary progress is untouched',
        again.window.localStorage.getItem('a_vocabulary_progress_u-1'), '{"topic_1":5}');
}

/* ================================================================ *
 * 8. THE OLD PROGRESSION AUTHORITY IS GONE
 * ================================================================ */
{
    /* the older whole-lesson button is still a paid learner path, so it must
       report the component too — never claim the topic outright. */
    {
        const at = SRC.indexOf('window.completeTopicHandler');
        ok(at > 0, 'the legacy whole-lesson completion button still exists');
        const body = SRC.slice(at, SRC.indexOf('};', at));
        ok(/saveProgress\(topicId\)/.test(body),
            'and it goes through the page progress function');
        eq('which no longer claims the whole topic',
            /completeCourseTopic\(/.test(SRC.slice(SRC.indexOf('async function saveProgress'),
                SRC.indexOf('function updateProgressBar'))), false);
        ok(/completeCourseComponent\(B2_COURSE, topicId, 'exercises'\)/.test(SRC),
            'it reports the exercises half instead');
        ok(/ack\.components\.exercisesCompleted !== true/.test(SRC),
            'and validates the acknowledgement before adopting anything');
    }

    /* THE SESSION'S COMPLETION MUST REACH THE LIFECYCLE.
     *
     * Everything above drives b2FinishExercises directly, which proves the
     * function behaves — and would go on passing if the host's completeTopic
     * dependency were severed and nothing ever called it. That is the exact
     * shape of defect this whole effort keeps finding, so the wiring itself is
     * asserted here: the dep the session invokes on completion must route into
     * the lifecycle, and must not be the old whole-topic claim. */
    {
        const at = SRC.indexOf('completeTopic: function');
        ok(at > 0, C + ': the host is given a completeTopic dependency');
        const dep = SRC.slice(at, at + 1800);   // the dep now carries its own rationale
        ok(/return Promise\.resolve\(b2FinishExercises\(id, r\)\)\s*\.then\(function \(/.test(dep),
            C + ': and it routes into b2FinishExercises');
        /* AND HANDS THE VERDICT BACK. The summary has to know whether the two
           network calls landed: without the outcome it cannot tell a success
           from a dropped connection, which is exactly how "Завершить тему"
           came to close on a failure without a word. */
        ok(/return outcome;/.test(dep),
            C + ': and returns the outcome to whoever pressed the button');
        eq(C + ': the dep does not claim the whole topic',
            /completeCourseTopic\(/.test(dep), false);
        ok(/function b2FinishExercises/.test(SRC),
            C + ': and that function is defined on the page');
    }

    eq('the page never pushes a topic id locally',
        (SRC.match(/completedTopics\.push/g) || []).length, 0);
    ok(/completeCourseComponent/.test(SRC),
        'and it reports the exercises component instead');
    /* the resume wording the platform standardised on */
    const eng = H.read('exercise-session.js');
    ok(/Tugallanmagan mashqlar topildi\./.test(eng), 'the resume prompt wording is the shared one');
    ok(/Davom ettirish/.test(eng) && /Qaytadan boshlash/.test(eng),
        'with its two buttons');
}

/* ================================================================ *
 * B2 TOPIC 9 CARRIES NO LISTENING EXERCISE — AND MUST NOT GAIN ONE
 * ---------------------------------------------------------------- *
 * Every other B2 topic has an audio group; topic 9 does not, and that is
 * the content as authored. The temptation when a suite reports "audio
 * groups 0" is to make the number look like its neighbours by copying a
 * file from another topic. That would put a recording in front of
 * learners that was never written for these questions.
 * ================================================================ */
{
    const { groups } = H.groupsFor('B2', 9);
    ok(groups.length > 0, 'topic 9 has exercises');
    const audio = groups.filter((g) => g.audioSrc);
    eq('topic 9 has no listening exercise', audio.length, 0);
    eq('and no audio source anywhere in it',
        groups.filter((g) => /audio/i.test(g.id || '')).length, 0);
    /* the neighbours that DO have one are untouched, so this is a real
       property of topic 9 and not a broken reader */
    const withAudio = [7, 8].map((n) => H.groupsFor('B2', n).groups
        .filter((g) => g.audioSrc).length);
    ok(withAudio.some((n) => n > 0),
        'neighbouring topics do have listening exercises (' + withAudio.join(',') + ')');
}

console.log('  real page driven · save then component, awaited · fail closed · reload retries the component alone · review read-only');
console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ ${C} EXERCISE CONVERGENCE: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ ${C} EXERCISE CONVERGENCE: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
})().catch((e) => { console.error(e); process.exit(2); });
