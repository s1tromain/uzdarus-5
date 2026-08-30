#!/usr/bin/env node
/**
 * verify_topic_completion_rule.cjs — one rule, four courses, driven for real.
 *
 * THE RULE:  a topic is finished when the exercises reach 80%. Full stop.
 *
 * WHAT THIS SUITE EXISTS FOR. The old rule needed the vocabulary deck too, and
 * it stranded people. One learner had finished a B2 topic three times over; a
 * brand-new A1 account finished the exercises AND the whole deck and still
 * faced a locked topic 2. Every route that left the deck unrecorded — finished
 * before the component model shipped, a completion screen closed one tap
 * early, one dropped call — locked the learner out of the rest of the course.
 *
 * So this asserts the thing that actually failed, in a real browser, on a
 * phone-sized screen: press the button, and read the SERVER's stored state and
 * the page's own topic list. Never a string in a source file, never a mock
 * standing in for the completion API.
 *
 *   UI_SUITE_FAST=1   one course, the boundary cases only
 */
'use strict';

const { launch, serveRepo, findChrome } = require('./_cdp_driver.cjs');
const { progressServer } = require('./_cdp_progress_server.cjs');
const P = require('./_topic_completion_probe.cjs');
const { execSync } = require('child_process');

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const sleep = P.sleep;
const log = (...a) => console.log(' ', ...a);

const FAST = process.env.UI_SUITE_FAST === '1';
const CODES = FAST ? ['B2'] : ['A1', 'A2', 'B1', 'B2'];
const PHONES = FAST ? [[360, 800, 'Android']] : [[360, 800, 'Android'], [390, 844, 'iPhone']];

console.log('\n=== TOPIC COMPLETION RULE — exercises 80%, vocabulary optional ===' +
            (FAST ? '  [FAST subset]' : ''));

(async () => {

if (!findChrome()) {
    console.log('  ❌ TOPIC COMPLETION RULE: BLOCKER — no Chrome/Chromium binary found.\n');
    process.exit(1);
}

const site = await serveRepo();
const browser = await launch();
console.log(`  driver: ${browser.version} · real clicks, verdict read from the server`);
const U = (x) => `http://127.0.0.1:${site.port}${x}`;

try {
    const p = await browser.newPage();
    let seed = {};
    await p.route((u) => (/paid-platform\.js/.test(u) ? progressServer({ progress: seed, latencyMs: 55 }) : null));
    await p.onNewDocument(
        `try{localStorage.setItem('currentUser',JSON.stringify({id:'rule',email:'r@t.uz',role:'student'}));}catch(e){}`);

    /** A brand-new account on `code`, phone-sized, nothing stored anywhere. */
    async function fresh(code, w, h, progress) {
        const cfg = P.COURSES[code];
        seed = { [code]: progress || { completedTopics: [], topicComponents: {} } };
        await p.goto(U(cfg.page), { waitMs: 400 });
        await p.evaluate(`try{ localStorage.clear();
            localStorage.setItem('currentUser',JSON.stringify({id:'rule',email:'r@t.uz',role:'student'}));
            }catch(e){} return 1;`);
        await p.setDevice(w, h, true);
        await p.goto(U(cfg.page), { waitMs: 2600 });
        return cfg;
    }

    for (const code of CODES) {
        const cfg = P.COURSES[code];

        for (const [w, h, phone] of PHONES) {
            const T = `${code} @${phone}`;

            /* ---- 1. A NEW ACCOUNT, NO VOCABULARY AT ALL. The reported case. ---- */
            await fresh(code, w, h);
            let r = await P.walkTopic(p, code, 1, { budgetMs: 200000, log });
            ok(r.reached, `${T} T1 — a new account reaches the summary (${r.stalled || ''})`);
            if (!r.reached) { log('    screen:', JSON.stringify(r.screen)); continue; }

            let a = await p.evaluate(P.ACTIONS);
            const finish = a.acts.filter((x) => x.act === 'finish');
            eq(`${T} T1 — the summary offers exactly one completion button`, finish.length, 1);
            ok(finish[0] && /Завершить тему и перейти/.test(finish[0].label),
                `${T} T1 — labelled "Завершить тему и перейти дальше" (${finish[0] && finish[0].label})`);
            /* THE WORDING IS THE PROMISE. Either the bar is cleared and the topic
               can be finished, or it already is — A2/B2 ask before reporting,
               A1/B1 report as the exercises end, and the learner sees the same
               button either way. What it must NEVER say again is "finish the
               vocabulary section first", which is what it said for months while
               the topic could not be finished at all. */
            ok(/пройден|завершена/i.test(String(a.note)),
                `${T} T1 — the note says the topic is passed or done (${a.note})`);
            ok(!/lug‘at|lugat|yakunlang|словар/i.test(String(a.note)) ||
               /не\s*обязател/i.test(String(a.note)),
                `${T} T1 — and never demands the deck (${a.note})`);

            eq(`${T} T1 — the button responds`, await p.evaluate(P.press('finish')), 'clicked');
            await sleep(4000);
            let s = await p.evaluate(P.server(code, 1));
            eq(`${T} T1 — the exercises half was reported once`, s.exN, 1);
            eq(`${T} T1 — for the right topic`, s.wrongTopic, 0);
            eq(`${T} T1 — for the right course`, s.wrongCourse, 0);
            eq(`${T} T1 — the deck was NOT reported`, s.voN, 0);
            eq(`${T} T1 — and the server never saw a vocabulary flag`, s.vocabulary, false);
            eq(`${T} T1 — the topic is complete WITHOUT the deck`, s.done, true);
            eq(`${T} T1 — completedTopics is exactly [1]`, s.list.join(','), '1');
            eq(`${T} T1 — topic 2 is unlocked`, await p.evaluate(P.locked(2)), false);
            eq(`${T} T1 — one press took the learner to topic 2`, await p.evaluate(P.openTopic), 2);

            /* ---- 2. IT SURVIVES A RELOAD. ---- */
            await p.goto(U(cfg.page), { waitMs: 2600 });
            s = await p.evaluate(P.server(code, 1));
            eq(`${T} T1 — still complete after a reload`, s.done, true);
            eq(`${T} T1 — topic 2 still unlocked after a reload`, await p.evaluate(P.locked(2)), false);

            /* ---- 3. REPEATING IT CHANGES NOTHING. ---- */
            const before = s.list.join(',');
            const again = await p.evaluate(`
                return Promise.resolve(window.completeCourseComponent('${code}', 1, 'exercises'))
                  .then(function(a){return JSON.stringify({ok:a&&a.ok===true,
                        done:a&&a.topicCompleted===true,list:(a&&a.completedTopics)||[]});},
                        function(){return JSON.stringify({ok:false});});`);
            const rp = JSON.parse(again);
            eq(`${T} T1 — reporting again is accepted`, rp.ok, true);
            eq(`${T} T1 — and still complete`, rp.done, true);
            eq(`${T} T1 — with no duplicate id`, (rp.list || []).join(','), before);
            if (FAST) break;
        }

        const [w, h] = PHONES[0];

        /* ---- 4. THE BOUNDARY: exactly 80 passes, 79 does not. ----

           Judged in the page, against the live rule the button uses. It cannot
           be staged through the UI, because the per-exercise gate will not let
           a learner walk PAST a failed exercise in the first place — which is
           asserted immediately below, and is the stronger guarantee: there is
           no route to a summary from an attempt under the bar. */
        await fresh(code, w, h);
        const bound = JSON.parse(await p.evaluate(`
            var TC = window.UzTopicCompletion;
            if (!TC) return JSON.stringify({ missing: true });
            function e(sc, t) { return TC.earned({ score: sc, total: t }); }
            return JSON.stringify({
                exactly80: e(80, 100), just79: e(79, 100),
                eight10: e(8, 10), seven10: e(7, 10),
                rounding: e(39, 49),          /* displays as 80, really 79.6 */
                justOver: e(40, 50),
                empty: e(0, 0), zero: e(0, 10), perfect: e(10, 10),
                gaps: e(80, 100),             /* 20 unanswered, still 80 */
                pct: TC.PASS_PERCENT });`));
        ok(!bound.missing, `${code} — the shared rule is loaded on the page`);
        eq(`${code} — the threshold is 80`, bound.pct, 80);
        eq(`${code} — exactly 80% completes`, bound.exactly80, true);
        eq(`${code} — 79% does not`, bound.just79, false);
        eq(`${code} — 8/10 completes`, bound.eight10, true);
        eq(`${code} — 7/10 does not`, bound.seven10, false);
        eq(`${code} — 39/49 displays as 80 but is refused`, bound.rounding, false);
        eq(`${code} — 40/50 is accepted`, bound.justOver, true);
        eq(`${code} — an empty attempt completes nothing`, bound.empty, false);
        eq(`${code} — a zero score completes nothing`, bound.zero, false);
        eq(`${code} — 100% completes`, bound.perfect, true);
        eq(`${code} — 20 unanswered questions and still 80% completes`, bound.gaps, true);

        /* ---- 4b. THE RECONCILIATION RULE, checked where it lives. ---- */
        const recRule = JSON.parse(await p.evaluate(`
            var TC = window.UzTopicCompletion;
            var field = '${code.toLowerCase()}ExerciseResult';
            function stuck(score, total, state) {
                var res = {}; res['topic_1'] = {};
                res['topic_1'][field] = { completed: true, topicId: 1, score: score, total: total };
                return TC.stuckTopics({ topicIds: [1], courseState: state || { completedTopics: [], topicComponents: {} },
                                        results: res, resultField: field });
            }
            return JSON.stringify({
                perfect: stuck(10, 10), exactly: stuck(8, 10), under: stuck(7, 10),
                rounding: stuck(39, 49), zero: stuck(0, 10),
                alreadyDone: stuck(10, 10, { completedTopics: [1], topicComponents: {} }),
                alreadySent: stuck(10, 10, { completedTopics: [], topicComponents: { 1: { exercisesCompleted: true } } }) });`));
        eq(`${code} — reconciliation unlocks a stored 100%`, recRule.perfect.join(','), '1');
        eq(`${code} — and a stored exactly-80%`, recRule.exactly.join(','), '1');
        eq(`${code} — but NEVER a stored 70%`, recRule.under.join(','), '');
        eq(`${code} — nor 39/49, which only displays as 80`, recRule.rounding.join(','), '');
        eq(`${code} — nor a zero`, recRule.zero.join(','), '');
        eq(`${code} — a topic already complete is left alone`, recRule.alreadyDone.join(','), '');
        eq(`${code} — a half already reported is not sent twice`, recRule.alreadySent.join(','), '');

        /* ---- 6. A NETWORK THAT REFUSES: say so, keep the window, retry. ---- */
        await fresh(code, w, h);
        /* BEFORE the attempt, not after: A1 and B1 report as the exercises end,
           so a failure armed at the summary would arrive too late to be felt. */
        await p.evaluate(`window.__setFail && window.__setFail('component', true); return 1;`);
        const f = await P.walkTopic(p, code, 1, { budgetMs: 200000, log });
        if (f.reached) {
            await p.evaluate(P.press('finish'));
            await sleep(4200);
            const af = await p.evaluate(P.ACTIONS);
            eq(`${code} — a failed completion does NOT close the window`, af.modal, 'open');
            ok(/uztc-err/.test(String(af.note)), `${code} — it says what happened (${af.note})`);
            ok(af.acts.some((x) => x.act === 'finish'), `${code} — and offers a retry`);
            let sf = await p.evaluate(P.server(code, 1));
            eq(`${code} — nothing was completed while the network was down`, sf.done, false);

            await p.evaluate(`window.__setFail && window.__setFail('component', false); return 1;`);
            eq(`${code} — the retry responds`, await p.evaluate(P.press('finish')), 'clicked');
            await sleep(4200);
            sf = await p.evaluate(P.server(code, 1));
            eq(`${code} — the retry completed the topic`, sf.done, true);
            eq(`${code} — without solving anything again`, sf.exN >= 1, true);
        }

        if (FAST) continue;

        /* AND THERE IS NO WAY ROUND IT. Fail an exercise on purpose and refuse
           to retake it: the session will not advance, so no summary, so no
           completion, and the next topic stays locked. */
        await fresh(code, w, h);
        const blocked = await P.walkTopic(p, code, 1,
            { budgetMs: 200000, log, wrong: 99, noRetake: true });
        eq(`${code} — a failed exercise never reaches the summary`, blocked.reached, false);
        ok(/refused/.test(String(blocked.stalled)),
            `${code} — it is the per-exercise gate that stops it (${blocked.stalled})`);
        const sblocked = await p.evaluate(P.server(code, 1));
        eq(`${code} — nothing was reported`, sblocked.exN, 0);
        eq(`${code} — the topic is not complete`, sblocked.done, false);
        eq(`${code} — and topic 2 stays locked`, await p.evaluate(P.locked(2)), true);

        /* ---- 5. A STUCK LEARNER: passed long ago, never unlocked. ---- */
        await fresh(code, w, h, {
            completedTopics: [],
            topicComponents: { 1: { vocabularyCompleted: true } },   /* deck only */
            quizResults: {}
        });
        /* the attempt the old rule already accepted, stored and never counted */
        await p.evaluate(`window.__seedResults = ${JSON.stringify({
            ['topic_1']: { [`${code.toLowerCase()}ExerciseResult`]: {
                version: 2, course: code, topicId: 1, completed: true,
                score: 10, total: 10, percentage: 100, passPercent: 80, groups: [] } }
        })}; return 1;`);
        const rec = await p.evaluate(`
            var TC = window.UzTopicCompletion;
            if (!TC) return 'no module';
            return JSON.stringify(TC.stuckTopics({
                topicIds: [1, 2, 3],
                courseState: { completedTopics: [], topicComponents: { 1: { vocabularyCompleted: true } } },
                results: window.__seedResults,
                resultField: '${code.toLowerCase()}ExerciseResult' }));`);
        eq(`${code} — a stored 100% attempt is recognised as already earned`, rec, '[1]');
        const low = await p.evaluate(`
            var TC = window.UzTopicCompletion;
            return JSON.stringify(TC.stuckTopics({
                topicIds: [1],
                courseState: { completedTopics: [], topicComponents: {} },
                results: { topic_1: { '${code.toLowerCase()}ExerciseResult': {
                    completed: true, topicId: 1, score: 7, total: 10 } } },
                resultField: '${code.toLowerCase()}ExerciseResult' }));`);
        eq(`${code} — a stored 70% attempt is NEVER unlocked`, low, '[]');

        /* ---- 7. THE LAST TOPIC ENDS THE COURSE, not a topic that isn't there. ---- */
        const last = cfg.last;
        await fresh(code, w, h, {
            completedTopics: Array.from({ length: last - 1 }, (_, i) => i + 1),
            topicComponents: {}
        });
        const lt = await P.walkTopic(p, code, last, { budgetMs: 220000, log });
        ok(lt.reached, `${code} — the last topic (${last}) reaches its summary (${lt.stalled || ''})`);
        if (lt.reached) {
            const al = await p.evaluate(P.ACTIONS);
            const fl = al.acts.filter((x) => x.act === 'finish')[0];
            ok(fl && /экзамен/i.test(fl.label),
                `${code} — the last topic offers the exam, not a topic that does not exist (${fl && fl.label})`);
            await p.evaluate(P.press('finish'));
            await sleep(4200);
            const sl = await p.evaluate(P.server(code, last));
            eq(`${code} — the last topic completes`, sl.done, true);
            const where = await p.evaluate(`return String(location.pathname.split('/').pop());`);
            eq(`${code} — and the learner lands on the final exam`, where, cfg.exam);
        }
    }
} finally {
    try { await browser.close(); } catch (e) {}
    try { await site.close(); } catch (e) {}
    try { execSync('pkill -f "Google Chrome for Testing" 2>/dev/null || true'); } catch (e) {}
}

console.log('  exercises 80% completes a topic · the deck is never required · one button, four courses');
console.log('='.repeat(64));
if (fail) {
    console.log(`  ❌ TOPIC COMPLETION RULE: ${fail} failed, ${pass} passed`);
    failures.forEach((f) => console.log('     • ' + f));
    console.log('='.repeat(64) + '\n');
    process.exit(1);
}
console.log(`  ✅ TOPIC COMPLETION RULE: ${pass}/${pass} passed`);
console.log('='.repeat(64) + '\n');

})().catch((e) => {
    console.error('TOPIC COMPLETION HARNESS ERROR', e && e.message);
    try { execSync('pkill -f "Google Chrome for Testing" 2>/dev/null || true'); } catch (x) {}
    process.exit(1);
});
