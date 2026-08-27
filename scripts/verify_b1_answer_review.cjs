#!/usr/bin/env node
/**
 * verify_b1_answer_review.cjs — looking back at a finished B1 topic.
 *
 * Two things make this non-trivial, and both were shipped wrong once before:
 *
 *   IT MUST SURVIVE THE PAGE. The label cannot come from a variable set during
 *   the attempt — a reload, or a trip to the cabinet and back, would put the
 *   learner in front of "Mashqlarni bajarish" again. It is derived from the
 *   DURABLE result hydrated from the server.
 *
 *   IT MUST BE REACHABLE. A helper that returns the string "Javoblarni
 *   ko‘rish" is not a button, and buildReview() returning an object is not a
 *   screen. A1 shipped both and neither was wired to anything, so this suite
 *   clicks the real control and reads the resulting DOM.
 *
 * Review is a reader: opening and closing it must write nothing at all.
 */
'use strict';
const H = require('./_b1_page_harness.cjs');

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

console.log('\n=== B1 ANSWER REVIEW ===');

const T = 1;
const SYNCED = { topicComponents: { [T]: { exercisesCompleted: true } } };

function finishedPage(extra) {
    const base = H.makePage({});
    const groups = base.window.B1Host.groupsOf(base.courseData.topics.find((t) => t.id === T));
    const snapshot = base.window.B1Host.buildSnapshot(T, groups, H.finishedAttempt(groups, 2));
    return {
        groups, snapshot,
        ctx: H.makePage(Object.assign({
            userQuizResults: { ['topic_' + T]: { b1ExerciseResult: snapshot } },
            courseState: SYNCED
        }, extra || {}))
    };
}

/* ---- the CTA comes from the durable result ---- */
{
    const B1 = H.makePage({}).window.B1Host;
    eq('with no result, the CTA invites the work', B1.ctaLabel({}, T), 'Mashqlarni bajarish');
    eq('an empty doc is not a result', B1.ctaLabel({ ['topic_' + T]: {} }, T), 'Mashqlarni bajarish');
    eq('an unfinished snapshot is not a result',
        B1.ctaLabel({ ['topic_' + T]: { b1ExerciseResult: { completed: false, topicId: T } } }, T),
        'Mashqlarni bajarish');
    eq('a snapshot for another topic is not this topic\'s',
        B1.ctaLabel({ ['topic_' + T]: { b1ExerciseResult: { completed: true, topicId: T + 1 } } }, T),
        'Mashqlarni bajarish');
    const done = { ['topic_' + T]: { b1ExerciseResult: { completed: true, topicId: T } } };
    eq('a durable completed result offers review', B1.ctaLabel(done, T), 'Javoblarni ko‘rish');
    eq('other topics are unaffected', B1.ctaLabel(done, T + 1), 'Mashqlarni bajarish');
}

/* ---- the CTA is a real, visible control ---- */
{
    const { ctx } = finishedPage();
    ctx.resetWrites();
    ctx.mountB1Practice(T);
    const cta = ctx.button('Javoblarni ko‘rish');
    ok(!!cta, 'the finished topic renders a Javoblarni ko‘rish button');
    eq('it is a button, not a label', cta.tagName, 'BUTTON');
    eq('the finished topic offers no second attempt', !!ctx.button('Mashqlarni bajarish'), false);
    eq('and rendering it writes nothing',
        ctx.writes.save + ctx.writes.component + ctx.writes.topic +
        ctx.writes.draftSet + ctx.writes.draftRemove, 0);
}

/* ---- an UNFINISHED topic gets the exercises, not a review ---- */
{
    const ctx = H.makePage({});
    let mounted = false;
    const real = ctx.window.B1Host.mountPractice;
    ctx.window.B1Host.mountPractice = (o) => { mounted = true; return real(o); };
    ctx.mountB1Practice(T);
    eq('with no durable result the session is mounted', mounted, true);
    eq('and no review is offered', !!ctx.button('Javoblarni ko‘rish'), false);
}

/* ---- clicking it opens a REVIEW, never a new attempt ---- */
{
    const { ctx, snapshot, groups } = finishedPage();
    ctx.mountB1Practice(T);
    let mounted = false;
    const real = ctx.window.B1Host.mountPractice;
    ctx.window.B1Host.mountPractice = (o) => { mounted = true; return real(o); };
    ctx.resetWrites();
    ctx.button('Javoblarni ko‘rish').click();

    eq('the click starts no exercise session', mounted, false);
    ok(!!ctx.q('.b1-review'), 'it renders the review');

    const text = ctx.text();
    const topic = ctx.courseData.topics.find((t) => t.id === T);
    ok(text.includes(topic.title), 'the review names the topic');
    ok(text.includes(snapshot.score + '/' + snapshot.total), 'and the stored overall result');
    ok(text.includes(snapshot.percentage + '%'), 'as a percentage too');

    const boxes = ctx.all('.b1-review-group');
    eq('every stored exercise is rendered', boxes.length, snapshot.groups.length);
    snapshot.groups.forEach((g) => {
        ok(text.includes(g.correct + '/' + g.total), `${g.groupId} shows its own X/Y`);
        ok(text.includes(g.percentage + '%'), `${g.groupId} shows its percentage`);
    });
    ok(/o‘tdi|o‘tmadi/.test(text), 'and whether each exercise passed');

    const first = groups[0];
    const given = snapshot.groups[0].answers;
    ok(text.includes(String(given[0])), 'the learner\'s own answer is shown');
    const wrongIdx = given.findIndex((a) => a === 'ZZZ-wrong');
    ok(wrongIdx >= 0 && text.includes('ZZZ-wrong'), 'including the wrong ones');
    const canon = Array.isArray(first.items[wrongIdx].answer)
        ? first.items[wrongIdx].answer[0] : first.items[wrongIdx].answer;
    ok(text.includes(String(canon)), 'next to the canonical correct answer');
    ok(text.includes(String(first.items[0].q)), 'and the question itself');
    ok(/✓/.test(text) && /✗/.test(text), 'right and wrong are marked distinctly');
    eq('and marked structurally, not only by colour', ctx.all('.b1-review-item.is-wrong').length > 0, true);

    /* READ-ONLY BY CONSTRUCTION */
    eq('the review has no inputs', ctx.all('input').length, 0);
    eq('no radios or checkboxes', ctx.all('input[type=radio],input[type=checkbox]').length, 0);
    eq('no selects', ctx.all('select').length, 0);
    eq('no textareas', ctx.all('textarea').length, 0);
    eq('and no contenteditable', ctx.all('[contenteditable]').length, 0);
    eq('the only control is a way back',
        JSON.stringify(ctx.all('button').map((b) => b.textContent.trim())), '["Yopish"]');
    eq('there is no check control', /Javoblarni tekshirish/.test(text), false);
    eq('no retry control', /Qayta topshirish/.test(text), false);

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
}

/* ---- the stored attempt is displayed, never recomputed ---- */
{
    const { ctx, snapshot } = finishedPage();
    const before = JSON.stringify(snapshot);
    ctx.mountB1Practice(T);
    ctx.button('Javoblarni ko‘rish').click();
    eq('the stored snapshot is not rewritten by looking at it',
        JSON.stringify(ctx.userQuizResults['topic_' + T].b1ExerciseResult), before);
    /* a later correction to the lesson shows up WITHOUT rewriting history */
    const B1 = ctx.window.B1Host;
    const review = B1.buildReview(snapshot, B1.groupsOf(ctx.courseData.topics.find((t) => t.id === T)));
    eq('the review reports the stored score, not a fresh one', review.score, snapshot.score);
}

/* ---- open items are shown, not invented ---- */
{
    const base = H.makePage({});
    const B1 = base.window.B1Host;
    /* topic 20 is the one with open prompts */
    const t20 = base.courseData.topics.find((t) => t.id === 20);
    const g20 = B1.groupsOf(t20);
    const openCount = g20.reduce((n, g) =>
        n + g.items.filter((i) => i.free || i.answer == null ||
            (Array.isArray(i.answer) ? i.answer.every((x) => !String(x || '').trim())
                                     : !String(i.answer).trim())).length, 0);
    ok(openCount > 0, `topic 20 has ${openCount} open prompts`);
    const snap = B1.buildSnapshot(20, g20, H.finishedAttempt(g20, 0));
    const rev = B1.buildReview(snap, g20);
    let openShown = 0, invented = 0;
    rev.groups.forEach((g) => g.items.forEach((it) => {
        if (it.open) {
            openShown++;
            if (it.correctAnswer != null) invented++;
            if (it.correct !== null) invented++;
        }
    }));
    ok(openShown > 0, `${openShown} open items appear in the review`);
    eq('and none of them is given an invented "correct answer"', invented, 0);
}

/* ---- and the OPEN prompts reach the DOM as examples, not verdicts ---- *
 * Eighty B1 prompts are authored free:true WITH a model sentence. A review
 * that treated the model as the answer key would mark a learner's accepted
 * sentence wrong — the exact thing the scorer had already accepted.
 */
{
    const base = H.makePage({});
    const B1 = base.window.B1Host;
    const t20 = base.courseData.topics.find((t) => t.id === 20);
    const g20 = B1.groupsOf(t20);
    const snap = B1.buildSnapshot(20, g20, H.finishedAttempt(g20, 0));
    const ctx = H.makePage({
        userQuizResults: { topic_20: { b1ExerciseResult: snap } },
        courseState: { topicComponents: { 20: { exercisesCompleted: true } } }
    });
    ctx.mountB1Practice(20);
    ok(!!ctx.button('Javoblarni ko‘rish'), 'topic 20 offers its review');
    ctx.resetWrites();
    ctx.button('Javoblarni ko‘rish').click();
    ok(!!ctx.q('.b1-review'), 'and it opens');

    const text = ctx.text();
    ok(/Namuna javob:/.test(text), 'an open prompt shows its model answer as an EXAMPLE');
    const rows = ctx.all('.b1-review-item');
    ok(rows.length > 0, rows.length + ' answer rows rendered');
    let openRows = 0, mislabelled = 0, verdicted = 0;
    const review = B1.buildReview(snap, g20);
    const flat = [];
    review.groups.forEach((g) => g.items.forEach((it) => flat.push(it)));
    rows.forEach((row, i) => {
        const it = flat[i];
        if (!it || !it.open) return;
        openRows++;
        const t = row.textContent;
        if (/To‘g‘ri javob:/.test(t)) mislabelled++;
        if (/✓|✗/.test(t)) verdicted++;
        if (!/Namuna javob:/.test(t)) mislabelled++;
    });
    ok(openRows > 0, openRows + ' open prompts appear in the rendered review');
    eq('no open prompt is labelled with a single correct answer', mislabelled, 0);
    eq('and none is marked right or wrong', verdicted, 0);
    ok(/To‘g‘ri javob:/.test(text), 'closed prompts still show the correct answer');
    eq('and the review still writes nothing',
        ctx.writes.save + ctx.writes.component + ctx.writes.draftSet + ctx.writes.draftRemove, 0);
}

/* ---- it has to survive the page ---- */
{
    const { snapshot } = finishedPage();
    const reloaded = H.makePage({
        userQuizResults: { ['topic_' + T]: { b1ExerciseResult: snapshot } },
        courseState: SYNCED
    });
    reloaded.mountB1Practice(T);
    ok(!!reloaded.button('Javoblarni ko‘rish'), 'after a reload the CTA still offers the review');
    reloaded.button('Javoblarni ko‘rish').click();
    ok(!!reloaded.q('.b1-review'), 'and it still opens');

    reloaded.quizSection.innerHTML = '';
    reloaded.mountB1Practice(T);
    ok(!!reloaded.button('Javoblarni ko‘rish'),
        'after leaving and returning the CTA is unchanged');
    eq('an untouched topic still invites the work',
        reloaded.mountB1Practice(T + 1) && !!reloaded.button('Javoblarni ko‘rish'), false);
}

/* ---- a legacy topic with no snapshot is graceful, not a demand ---- */
{
    const ctx = H.makePage({ completedTopics: [T] });
    ctx.resetWrites();
    ctx.mountB1Practice(T);
    ok(/avval yakunlangan/.test(ctx.text()), 'a topic finished before snapshots says so');
    eq('it is not asked to solve anything again', /Mashqlarni bajarish/.test(ctx.text()), false);
    eq('and shows no review it cannot fill', !!ctx.q('.b1-review'), false);
    eq('nor writes anything', ctx.writes.save + ctx.writes.component, 0);
}

console.log('  visible CTA · real DOM review · answers + correct answers + group scores · read-only · zero writes');
console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ B1 ANSWER REVIEW: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ B1 ANSWER REVIEW: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
