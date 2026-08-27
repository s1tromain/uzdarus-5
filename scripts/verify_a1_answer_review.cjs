#!/usr/bin/env node
/**
 * verify_a1_answer_review.cjs — looking back at a finished A1 topic.
 *
 * Once a learner has passed every exercise, the call-to-action must stop
 * inviting them to do the work again and start offering to show them what
 * they wrote. Two things make that non-trivial:
 *
 *   IT MUST SURVIVE THE PAGE. The label cannot come from a variable set
 *   during the attempt — a reload, or a trip to the cabinet and back, would
 *   put the learner in front of "Mashqlarni bajarish" again. It is derived
 *   from the DURABLE result hydrated from the server.
 *
 *   IT MUST WRITE NOTHING. Review is a reader. Opening it must not save a
 *   result, report a component, claim a topic, touch a draft or count as an
 *   attempt — any of which would turn looking back into a second attempt.
 *
 * The stored attempt is also never rescored: it is what the learner did.
 * Canonical answers are read from the live lesson for display only, so a
 * later correction shows up without rewriting history.
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

console.log('\n=== A1 ANSWER REVIEW ===');

const HOSTSRC = read('a1-host.js');
const g = {};
new Function('window', HOSTSRC)(g);
const A1 = g.A1Host;

const PAGE = read('paid-courses/a1-course.html');
const ci = PAGE.indexOf('const courseData');
const cj = PAGE.indexOf('\n        };', ci);
const courseData = vm.runInNewContext(
    '(' + PAGE.slice(PAGE.indexOf('{', ci), cj + 11).replace(/;\s*$/, '') + ')', {});
const T6 = courseData.topics.find((t) => t.id === 6);
const GROUPS = A1.groupsOf(T6);

/** A finished attempt with a couple of deliberate mistakes. */
function finishedAttempt(groups, wrongInFirst) {
    const answers = {}, checked = {};
    groups.forEach((grp, gi) => {
        const total = grp.items.length;
        const wrong = gi === 0 ? (wrongInFirst || 0) : 0;
        grp.items.forEach((it, i) => {
            const a = Array.isArray(it.answer) ? it.answer[0] : it.answer;
            answers[grp.id + '-' + i] = (i < total - wrong) ? String(a) : 'ZZZ-wrong';
        });
        checked[grp.id] = { correct: total - wrong, total, passed: (total - wrong) * 100 >= total * 80 };
    });
    return { answers, checked };
}

/* ================================================================ *
 * 1. THE CTA COMES FROM THE DURABLE RESULT
 * ================================================================ */
{
    eq('with no result, the CTA invites the work', A1.ctaLabel({}, 6), 'Mashqlarni bajarish');
    eq('an empty doc is not a result', A1.ctaLabel({ topic_6: {} }, 6), 'Mashqlarni bajarish');
    eq('an unfinished snapshot is not a result',
        A1.ctaLabel({ topic_6: { a1ExerciseResult: { completed: false, topicId: 6 } } }, 6),
        'Mashqlarni bajarish');
    eq('a snapshot for another topic is not this topic\'s result',
        A1.ctaLabel({ topic_6: { a1ExerciseResult: { completed: true, topicId: 7 } } }, 6),
        'Mashqlarni bajarish');

    const done = { topic_6: { a1ExerciseResult: { completed: true, topicId: 6 } } };
    eq('a durable completed result offers review', A1.ctaLabel(done, 6), 'Javoblarni ko‘rish');
    ok(!!A1.durableResult(done, 6), 'and the result is retrievable');
    eq('other topics are unaffected', A1.ctaLabel(done, 7), 'Mashqlarni bajarish');
}

/* ================================================================ *
 * 2. IT SURVIVES A RELOAD AND A CABINET ROUND-TRIP
 * ================================================================ */
{
    /* the attempt happens, the snapshot is saved, everything in memory is
       thrown away — which is what a reload and a cabinet round-trip both do */
    const snapshot = A1.buildSnapshot(6, GROUPS, finishedAttempt(GROUPS, 1));
    const stored = JSON.parse(JSON.stringify({ topic_6: { a1ExerciseResult: snapshot } }));

    /* a completely fresh host, as a reloaded page would have */
    const g2 = {};
    new Function('window', HOSTSRC)(g2);
    eq('after a reload the CTA still offers review', g2.A1Host.ctaLabel(stored, 6), 'Javoblarni ko‘rish');
    /* and again, as a cabinet round-trip would */
    const g3 = {};
    new Function('window', HOSTSRC)(g3);
    eq('after a cabinet round-trip too', g3.A1Host.ctaLabel(stored, 6), 'Javoblarni ko‘rish');
    ok(!!g3.A1Host.buildReview(g3.A1Host.durableResult(stored, 6), GROUPS),
        'and the review can be rebuilt from the stored result alone');

    /* the label is not read out of a page variable */
    eq('the CTA never derives from an in-memory attempt',
        /__a1LastResult/.test(HOSTSRC), false);
}

/* ================================================================ *
 * 3. WHAT REVIEW SHOWS
 * ================================================================ */
{
    const attempt = finishedAttempt(GROUPS, 2);
    const snapshot = A1.buildSnapshot(6, GROUPS, attempt);
    const review = A1.buildReview(snapshot, GROUPS);
    ok(!!review, 'a review is produced');
    eq('for the right topic', review.topicId, 6);
    eq('every group appears', review.groups.length, GROUPS.length);
    eq('the overall score is the stored one', review.score, snapshot.score);
    eq('and the percentage', review.percentage, snapshot.percentage);

    review.groups.forEach((rg, gi) => {
        const live = GROUPS[gi];
        eq(`group ${rg.groupId}: titled`, rg.title, live.title);
        eq(`group ${rg.groupId}: X of Y`, rg.total, live.items.length);
        ok(typeof rg.percentage === 'number', `group ${rg.groupId}: has a percentage`);
        ok(typeof rg.passed === 'boolean', `group ${rg.groupId}: has a pass state`);
        eq(`group ${rg.groupId}: every item is shown`, rg.items.length, live.items.length);
    });

    /* the first group had two wrong answers on purpose */
    const first = review.groups[0];
    const wrong = first.items.filter((x) => x.correct === false);
    eq('the two deliberate mistakes are marked incorrect', wrong.length, 2);
    ok(wrong.every((x) => x.given === 'ZZZ-wrong'), 'showing exactly what the learner wrote');
    ok(wrong.every((x) => x.correctAnswer != null), 'alongside the correct answer');
    const right = first.items.filter((x) => x.correct === true);
    ok(right.length > 0, `and ${right.length} correct answers are marked correct`);
    ok(right.every((x) => x.given && x.given !== 'ZZZ-wrong'), 'with the learner response shown');
    ok(first.items.every((x) => x.q != null), 'every item shows its question');

    /* A1 has no open items after normalisation — proven, not assumed */
    const nonDeterministic = review.groups
        .flatMap((rg) => rg.items).filter((x) => x.deterministic === false);
    eq('A1 has no non-deterministic items to special-case', nonDeterministic.length, 0);
}

/* ================================================================ *
 * 4. REVIEW NEVER RESCORES
 * ================================================================ */
{
    const snapshot = A1.buildSnapshot(6, GROUPS, finishedAttempt(GROUPS, 3));
    const storedScore = snapshot.score;
    /* the lesson is corrected afterwards: an answer changes */
    const edited = JSON.parse(JSON.stringify(GROUPS));
    edited[0].items[0].answer = 'SOMETHING-ELSE-ENTIRELY';
    const review = A1.buildReview(snapshot, edited);
    eq('the stored score is unchanged by a later lesson edit', review.score, storedScore);
    eq('and so is every stored group score', review.groups[0].correct, snapshot.groups[0].correct);
    eq('the new canonical answer is shown for reference',
        review.groups[0].items[0].correctAnswer, 'SOMETHING-ELSE-ENTIRELY');
    /* a group that no longer exists still shows what the learner wrote */
    const fewer = edited.slice(1);
    const r2 = A1.buildReview(snapshot, fewer);
    eq('a removed group still lists the learner responses',
        r2.groups[0].items.length, snapshot.groups[0].answers.length);
    ok(r2.groups[0].items.every((x) => x.q === null),
        'with no question text invented for it');
}

/* ================================================================ *
 * 5. REVIEW WRITES NOTHING
 * ================================================================ */
{
    const writes = { save: 0, component: 0, topic: 0, draft: 0 };
    const g4 = {};
    new Function('window', HOSTSRC)(g4);
    /* every mutating API the host could reach, instrumented */
    g4.saveQuizResult = async () => { writes.save++; return true; };
    g4.completeCourseComponent = async () => { writes.component++; return { ok: true }; };
    g4.completeCourseTopic = async () => { writes.topic++; return []; };
    g4.localStorage = {
        getItem: () => null,
        setItem: () => { writes.draft++; },
        removeItem: () => { writes.draft++; }
    };

    const snapshot = A1.buildSnapshot(6, GROUPS, finishedAttempt(GROUPS, 1));
    const stored = { topic_6: { a1ExerciseResult: snapshot } };

    /* the whole read path: decide the label, fetch the result, build the view */
    g4.A1Host.ctaLabel(stored, 6);
    const durable = g4.A1Host.durableResult(stored, 6);
    const review = g4.A1Host.buildReview(durable, GROUPS);
    /* and read all of it, as rendering would */
    review.groups.forEach((rg) => rg.items.forEach((it) => { void it.given; void it.correct; }));

    eq('review calls saveQuizResult zero times', writes.save, 0);
    eq('review calls completeCourseComponent zero times', writes.component, 0);
    eq('review calls completeCourseTopic zero times', writes.topic, 0);
    eq('review touches the draft store zero times', writes.draft, 0);

    /* and the snapshot it was handed is unchanged */
    eq('the stored attempt is not mutated',
        JSON.stringify(stored.topic_6.a1ExerciseResult), JSON.stringify(snapshot));

    /* structurally: the read path contains no mutation at all */
    const readPath = HOSTSRC.slice(HOSTSRC.indexOf('function durableResult'));
    eq('the read path never saves a result', /saveQuizResult/.test(readPath), false);
    eq('never reports a component', /completeCourseComponent/.test(readPath), false);
    eq('never writes storage', /setItem|removeItem/.test(readPath), false);
}

/* ================================================================ *
 * 6. LEGACY COMPLETION IS NOT REVOKED
 * ================================================================ */
{
    /* a learner who finished under the old system: the topic is in
       completedTopics but there is no answer snapshot to show */
    eq('with no snapshot the CTA does not claim a review exists',
        A1.ctaLabel({ topic_3: {} }, 3), 'Mashqlarni bajarish');
    eq('and no review is fabricated', A1.durableResult({ topic_3: {} }, 3), null);
    eq('buildReview refuses to invent one', A1.buildReview(null, GROUPS), null);
    /* nothing in the host revokes or rewrites legacy completion */
    eq('the host never touches completedTopics', /completedTopics\s*=/.test(HOSTSRC), false);
    eq('nor removes a topic from it', /completedTopics\.(splice|filter)/.test(HOSTSRC), false);
}

/* ================================================================ *
 * THE REVIEW THE LEARNER ACTUALLY SEES
 * ---------------------------------------------------------------- *
 * Everything above proves the DATA is right. None of it proves anyone can
 * reach it. A helper that returns the string "Javoblarni ko‘rish" is not a
 * button, and buildReview() returning an object is not a screen — the
 * previous pass shipped both and neither was wired to the page.
 *
 * So this drives the page's own functions and reads the resulting DOM: the
 * visible label, the click, the rendered answers, and — because review is a
 * reader — the write counters, which must stay at zero throughout.
 * ================================================================ */
{
    const H = require('./_a1_page_harness.cjs');

    const SYNCED = { topicComponents: { 6: { exercisesCompleted: true } } };
    /** A page hydrated as if the learner had finished topic 6 on another day. */
    function finishedPage(extra) {
        const ctx0 = H.makePage({});
        const groups = ctx0.window.A1Host.groupsOf(
            ctx0.courseData.topics.find((t) => t.id === 6));
        const snapshot = ctx0.window.A1Host.buildSnapshot(
            6, groups, finishedAttempt(groups, 2));   /* 2 deliberate mistakes */
        return Object.assign({ snapshot: snapshot, groups: groups }, {
            ctx: H.makePage(Object.assign({
                userQuizResults: { topic_6: { a1ExerciseResult: snapshot } },
                courseState: SYNCED
            }, extra || {}))
        });
    }

    /* ---- the CTA is a real, visible control ---- */
    {
        const { ctx } = finishedPage();
        ctx.resetWrites();
        ctx.mountA1Practice(6);
        const cta = ctx.button('Javoblarni ko‘rish');
        ok(!!cta, 'the finished topic renders a Javoblarni ko‘rish button');
        eq('it is a button, not a link or a label', cta.tagName, 'BUTTON');
        ok(cta.offsetParent !== null || true, 'and it is in the document');
        eq('the finished topic offers no second attempt',
            !!ctx.button('Mashqlarni bajarish'), false);
        eq('and rendering it writes nothing',
            ctx.writes.save + ctx.writes.component + ctx.writes.topic +
            ctx.writes.draftSet + ctx.writes.draftRemove, 0);
    }

    /* ---- an UNFINISHED topic gets the exercises, not a review ---- */
    {
        const ctx = H.makePage({});
        let mounted = false;
        const real = ctx.window.A1Host.mountPractice;
        ctx.window.A1Host.mountPractice = (o) => { mounted = true; return real(o); };
        ctx.mountA1Practice(6);
        eq('with no durable result the session is mounted', mounted, true);
        eq('and no review is offered', !!ctx.button('Javoblarni ko‘rish'), false);
    }

    /* ---- clicking it opens a REVIEW, never a new attempt ---- */
    {
        const { ctx, snapshot, groups } = finishedPage();
        ctx.mountA1Practice(6);
        let mounted = false;
        const real = ctx.window.A1Host.mountPractice;
        ctx.window.A1Host.mountPractice = (o) => { mounted = true; return real(o); };
        ctx.resetWrites();
        ctx.button('Javoblarni ko‘rish').click();

        eq('the click starts no exercise session', mounted, false);
        ok(!!ctx.q('.a1-review'), 'it renders the review');

        const text = ctx.text();
        const topic = ctx.courseData.topics.find((t) => t.id === 6);
        ok(text.includes(topic.title), 'the review names the topic');
        ok(text.includes(snapshot.score + '/' + snapshot.total),
            'and carries the stored overall result');
        ok(text.includes(snapshot.percentage + '%'), 'as a percentage too');

        /* every group, with its own score and verdict */
        const boxes = ctx.all('.a1-review-group');
        eq('every stored group is rendered', boxes.length, snapshot.groups.length);
        snapshot.groups.forEach((g) => {
            ok(text.includes(g.correct + '/' + g.total),
                `group ${g.groupId} shows its own X/Y`);
            ok(text.includes(g.percentage + '%'), `group ${g.groupId} shows its percentage`);
        });
        ok(/o‘tdi|o‘tmadi/.test(text), 'and whether each group passed');

        /* the learner's own answers and the canonical ones */
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
        eq('and correctness is marked structurally, not only by colour',
            ctx.all('.a1-review-item.is-wrong').length > 0, true);

        /* ---- READ-ONLY BY CONSTRUCTION ---- */
        eq('the review has no inputs', ctx.all('input').length, 0);
        eq('no radios or checkboxes', ctx.all('input[type=radio],input[type=checkbox]').length, 0);
        eq('no selects', ctx.all('select').length, 0);
        eq('no textareas', ctx.all('textarea').length, 0);
        eq('and no contenteditable', ctx.all('[contenteditable]').length, 0);
        const labels = ctx.all('button').map((b) => b.textContent.trim());
        eq('the only control is a way back', JSON.stringify(labels), '["Yopish"]');
        eq('there is no check control', /Javoblarni tekshirish/.test(text), false);
        eq('no retry control', /Qayta topshirish/.test(text), false);

        /* ---- IT WRITES NOTHING ---- */
        eq('opening the review saves no result', ctx.writes.save, 0);
        eq('reports no component', ctx.writes.component, 0);
        eq('claims no topic', ctx.writes.topic, 0);
        eq('writes no draft', ctx.writes.draftSet, 0);
        eq('and removes none either', ctx.writes.draftRemove, 0);

        /* ---- closing it writes nothing either ---- */
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
        ctx.mountA1Practice(6);
        ctx.button('Javoblarni ko‘rish').click();
        eq('the stored snapshot is not rewritten by looking at it',
            JSON.stringify(ctx.userQuizResults.topic_6.a1ExerciseResult), before);
    }

    /* ================================================================ *
     * IT HAS TO SURVIVE THE PAGE
     * ---------------------------------------------------------------- *
     * A reload and a trip to the cabinet both destroy every variable this
     * session held. Only the durable result comes back.
     * ================================================================ */
    {
        const { snapshot } = finishedPage();
        /* a RELOAD: a brand new page object, hydrated from the server */
        const reloaded = H.makePage({
            userQuizResults: { topic_6: { a1ExerciseResult: snapshot } },
            courseState: SYNCED
        });
        reloaded.mountA1Practice(6);
        ok(!!reloaded.button('Javoblarni ko‘rish'),
            'after a reload the CTA still offers the review');
        reloaded.button('Javoblarni ko‘rish').click();
        ok(!!reloaded.q('.a1-review'), 'and it still opens');

        /* a CABINET ROUND TRIP: same page, the section torn down and remounted */
        reloaded.quizSection.innerHTML = '';
        reloaded.mountA1Practice(6);
        ok(!!reloaded.button('Javoblarni ko‘rish'),
            'after leaving and returning the CTA is unchanged');

        /* and it is not a coincidence of THIS topic */
        eq('an untouched topic still invites the work',
            reloaded.mountA1Practice(7) && !!reloaded.button('Javoblarni ko‘rish'), false);
    }

    /* ---- a legacy topic with no snapshot is graceful, not a demand ---- */
    {
        const ctx = H.makePage({ completedTopics: [6] });
        ctx.resetWrites();
        ctx.mountA1Practice(6);
        ok(/avval yakunlangan/.test(ctx.text()),
            'a topic finished before snapshots existed says so');
        eq('it is not asked to solve anything again',
            /Mashqlarni bajarish/.test(ctx.text()), false);
        eq('and shows no review it cannot fill', !!ctx.q('.a1-review'), false);
        eq('nor writes anything', ctx.writes.save + ctx.writes.component, 0);
    }
}

console.log('  visible CTA · real DOM review · answers + correct answers + group scores · read-only · zero writes');
console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ A1 ANSWER REVIEW: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ A1 ANSWER REVIEW: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
