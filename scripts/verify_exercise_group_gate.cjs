#!/usr/bin/env node
/**
 * verify_exercise_group_gate.cjs — every exercise must be earned on its own.
 *
 * THE DEFECT THIS SUITE EXISTS FOR. A learner could score 10/10 on exercise 1
 * and 5/10 on exercise 2 and still walk into exercise 3, because nothing judged
 * an exercise by itself — only the lesson as a whole, where a good score hid a
 * bad one. Each scored group now has to reach the threshold on its own before
 * the next one opens.
 *
 * THE THRESHOLD IS 80%, PLATFORM-WIDE. B2 required 85% while it was the only
 * course with a gate at all; that is now aligned, and both sides of the line
 * are pinned so it cannot drift back.
 *
 * THE COMPARISON IS AN EXACT RATIO, not a rounded percent. Math.round puts the
 * boundary in the wrong place — 39/49 rounds to 80 while really being 79.6% —
 * so a learner would clear a bar they had not reached. Every gate compares
 * `correct * 100 >= total * threshold` in integers, and the rounding trap is
 * exercised below.
 *
 * Final exams are a SEPARATE contract and are asserted here to be untouched.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('\n=== EXERCISE GROUP GATE (80%) ===');

const ENGINE = read('exercise-session.js');
const HOST = read('b2-host.js');

/* ---------------------------------------------------------------- *
 * A REAL SESSION, OPENED THE WAY A LEARNER OPENS ONE.
 * mount() renders a practice CARD; the exercises appear only once it is
 * opened. Driving the gate through that path means the rule under test
 * is the one that actually runs in the product.
 * ---------------------------------------------------------------- */
const mkGroup = (id, n) => ({
    id, title: id, type: 'input',
    items: Array.from({ length: n }, (_, i) => ({ q: id + i, answer: id + '-a' + i }))
});
function newWindow() {
    const dom = new JSDOM('<!doctype html><body><div id="m"></div></body>',
        { runScripts: 'outside-only', pretendToBeVisual: true });
    /* jsdom has no layout, so scrollIntoView() does not exist; the engine calls
       it after every check. Without this stub the footer never re-renders and
       the suite would be measuring a jsdom gap, not the product. */
    dom.window.HTMLElement.prototype.scrollIntoView = function () {};
    dom.window.eval(ENGINE);
    return dom.window;
}
function openSession(w, groups, passScore) {
    w.__groups = groups;
    w.__pass = passScore;
    w.eval(`
        window.__finished = null;
        UzExerciseSession.mount({
            mountEl: document.getElementById('m'),
            groups: window.__groups,
            passScore: window.__pass,
            /* The host supplies the item markup and the read/write bridge; the
               engine owns navigation, scoring and the gate. This fixture is the
               smallest host that satisfies that contract, so what is under test
               is the ENGINE rule and not any one course page. */
            renderGroup: function (g) {
                return (g.items || []).map(function (it, i) {
                    return '<input data-k="' + g.id + '-' + i + '">';
                }).join("");
            },
            readAnswer: function (root, key) {
                var el = root.querySelector('[data-k="' + key + '"]');
                return el ? el.value : "";
            },
            writeAnswer: function (root, key, v) {
                var el = root.querySelector('[data-k="' + key + '"]');
                if (el) el.value = v == null ? "" : v;
            },
            matchItem: function (item, given) { return String(given) === String(item.answer); },
            renderSummary: function () { return '<div></div>'; },
            draft: { save: function () {}, load: function () { return null; }, clear: function () {} },
            finish: function (r) { window.__finished = r; }
        });
    `);
    const open = w.document.querySelector('.uz-practice button');
    if (open) open.dispatchEvent(new w.Event('click', { bubbles: true }));
    return w.eval('UzExerciseSession.current()');
}
const act = (w, name) => w.document.querySelector('.uz-foot [data-uz-act="' + name + '"]');
const clickAct = (w, name) => {
    const b = act(w, name);
    if (b) b.dispatchEvent(new w.Event('click', { bubbles: true }));
    return !!b;
};
const clickCheck = (w) => {
    const b = [...w.document.querySelectorAll('.uz-foot button')]
        .find((x) => x.getAttribute('data-uz-act') === 'check' || /Проверить/.test(x.textContent));
    if (b) b.dispatchEvent(new w.Event('click', { bubbles: true }));
    return !!b;
};
/* Answers are typed into the DOM, not poked into the state: the engine
   re-reads every field through readAnswer() when the step is checked, so a
   value written only to sess.answers would be overwritten by a blank input. */
const answerGroup = (w, group, correct) => {
    group.items.forEach((it, i) => {
        const el = w.document.querySelector('[data-k="' + group.id + "-" + i + '"]');
        if (el) el.value = (i < correct) ? it.answer : "ZZZ-wrong";
    });
};

/* ================================================================ *
 * 1. ONE THRESHOLD, WRITTEN ONCE, AND IT IS 80
 * ================================================================ */
{
    const m = HOST.match(/var PASS_PERCENT = (\d+);/);
    ok(!!m, 'the host declares a lesson threshold');
    eq('and it is 80', Number(m[1]), 80);
    eq('declared exactly once', (HOST.match(/var PASS_PERCENT = \d+;/g) || []).length, 1);
    eq('no stale 85 survives in the lesson gate', /PASS_PERCENT = 85;/.test(HOST), false);
    ok(/correct \* 100 >= result\.total \* passPercent/.test(HOST),
        'the per-exercise gate compares an exact ratio');
    ok(/correct \* 100 >= total \* passPercent/.test(HOST),
        'and so does the topic verdict — they cannot disagree at the boundary');
    ok(/correct \* 100 >= result\.total \* min/.test(ENGINE),
        'the shared engine gate compares an exact ratio too');
    eq('and no gate rounds its way over the line',
        /Math\.round\([^)]*\) >= min/.test(ENGINE), false);

    /* FINAL EXAMS ARE A DIFFERENT CONTRACT and must not have moved. */
    ['a1', 'a2', 'b1', 'b2'].forEach((c) => {
        const exam = read(`paid-courses/${c}-final-exam.html`);
        const mark = exam.match(/var (?:passed|previewPassed) = (?:finalScore|pct|previewPct) >= (\d+);/);
        ok(!!mark, `${c.toUpperCase()} final exam still declares its own pass mark`);
        eq(`${c.toUpperCase()} final exam pass mark is untouched`, Number(mark[1]), 80);
    });
}

/* ================================================================ *
 * 2. THE BOUNDARY, IN A REAL SESSION
 * ================================================================ */
{
    function play(total, correct, passScore) {
        const w = newWindow();
        const g = mkGroup('ex1', total);
        openSession(w, [g], passScore);
        answerGroup(w, g, correct);
        clickCheck(w);
        const checked = w.eval('UzExerciseSession.current()').checked['ex1'] || {};
        const out = {
            correct: checked.correct, total: checked.total, passed: checked.passed,
            hasRetry: !!act(w, 'retry'),
            hasNext: !!(act(w, 'next') || act(w, 'finish')),
            gateText: (w.document.querySelector('.uz-gate') || {}).textContent || ''
        };
        w.close();
        return out;
    }

    const CASES = [
        [10, 10, true], [10, 9, true], [10, 8, true],
        [10, 7, false], [10, 5, false], [10, 0, false],
        [5, 5, true], [5, 4, true], [5, 3, false],
        /* THE ROUNDING TRAP: 39/49 is 79.6% and Math.round makes it 80. */
        [49, 39, false], [49, 40, true],
        [9, 7, false], [9, 8, true]
    ];
    CASES.forEach(([total, correct, want]) => {
        const r = play(total, correct, 80);
        eq(`${correct}/${total} -> ${want ? 'PASS' : 'FAIL'}`, r.passed, want);
        eq(`  ${correct}/${total} scored correctly`, r.correct, correct);
        if (!want) {
            ok(r.hasRetry, `  ${correct}/${total}: the retry button is offered`);
            ok(!r.hasNext, `  ${correct}/${total}: there is NO way forward`);
        } else {
            ok(!r.hasRetry, `  ${correct}/${total}: no retry needed`);
            ok(r.hasNext, `  ${correct}/${total}: the learner may move on`);
        }
    });

    /* THE FAIL PANEL SPEAKS THE PRODUCT'S WORDS */
    const failed = play(10, 7, 80);
    ok(/Mashqdan o‘tish uchun kamida 80% natija kerak/.test(failed.gateText),
        'the failed panel states the 80% rule in Uzbek');
    ok(/Ushbu mashqni qayta bajaring/.test(failed.gateText),
        'and tells the learner to redo THIS exercise');
    eq('and never says 85%', /85%/.test(failed.gateText), false);

    /* NO THRESHOLD CONFIGURED = NO GATE, so a course can adopt this safely. */
    eq('with no passScore configured, 3/10 is not blocked',
        play(10, 3, 0).passed !== false, true);
}

/* ================================================================ *
 * 3. RETRY TOUCHES ONLY THE FAILED GROUP
 * ================================================================ */
{
    const w = newWindow();
    const groups = [mkGroup('ex1', 10), mkGroup('ex2', 10), mkGroup('ex3', 10), mkGroup('ex4', 10)];
    openSession(w, groups, 80);
    const sess = () => w.eval('UzExerciseSession.current()');

    /* pass ex1, ex2, ex3 */
    [10, 8, 9].forEach((c, gi) => {
        answerGroup(w, groups[gi], c);
        clickCheck(w);
        clickAct(w, 'next');
    });
    eq('three exercises passed', ['ex1', 'ex2', 'ex3']
        .every((id) => sess().checked[id] && sess().checked[id].passed !== false), true);
    eq('and the cursor is on exercise 4', sess().cursor, 3);

    /* fail ex4 */
    answerGroup(w, groups[3], 6);
    clickCheck(w);
    eq('ex4 at 6/10 is failed', (sess().checked['ex4']||{}).passed, false);
    ok(!!act(w, 'retry'), 'and offers a retry');
    ok(!act(w, 'next'), 'with no way forward');

    const beforeCursor = sess().cursor;
    const snap = (id) => JSON.stringify(sess().checked[id]);
    const ex1 = snap('ex1'), ex2 = snap('ex2'), ex3 = snap('ex3');
    clickAct(w, 'retry');

    eq('retry stays on the SAME exercise', sess().cursor, beforeCursor);
    eq('ex1 result is untouched', snap('ex1'), ex1);
    eq('ex2 result is untouched', snap('ex2'), ex2);
    eq('ex3 result is untouched', snap('ex3'), ex3);
    eq('ex4 stored score is cleared', sess().checked['ex4'], undefined);
    eq('ex4 answers are cleared',
        Object.keys(sess().answers).filter((k) => k.indexOf('ex4-') === 0).length, 0);
    eq('but ex1 answers survive',
        Object.keys(sess().answers).filter((k) => k.indexOf('ex1-') === 0).length, 10);

    /* passing the retry opens the way onward — and never restarts the topic */
    answerGroup(w, groups[3], 8);
    clickCheck(w);
    eq('ex4 at 8/10 now passes', (sess().checked['ex4']||{}).passed, true);
    ok(!act(w, 'retry'), 'and the retry offer is gone');
    eq('the earlier exercises are still passed', ['ex1', 'ex2', 'ex3']
        .every((id) => (sess().checked[id]||{}).passed !== false), true);
    eq('the learner was never sent back to exercise 1', sess().cursor, 3);
    w.close();
}

/* ================================================================ *
 * 4. A FAILED GROUP CANNOT BE STEPPED PAST
 * ================================================================ */
{
    const w = newWindow();
    const groups = [mkGroup('ex1', 10), mkGroup('ex2', 10)];
    openSession(w, groups, 80);
    const sess = () => w.eval('UzExerciseSession.current()');
    answerGroup(w, groups[0], 7);
    clickCheck(w);
    eq('ex1 failed', (sess().checked['ex1']||{}).passed, false);

    /* there is no next control to click… */
    eq('no next control exists', !!act(w, 'next'), false);
    /* …and driving the cursor directly must not leave a failed group behind:
       solvedCount() counts only groups that are not explicitly failed, which
       is what the completion check and the summary both read. */
    const solved = w.eval('UzExerciseSession.current().solvedCount()');
    eq('a failed group does not count as solved', solved, 0);

    /* passing it makes it count */
    clickAct(w, 'retry');
    answerGroup(w, groups[0], 8);
    clickCheck(w);
    eq('once passed it counts', w.eval('UzExerciseSession.current().solvedCount()'), 1);
    w.close();
}

console.log('  threshold 80 · 7/10 FAIL · 8/10 PASS · 39/49 FAIL (rounding trap) · retry is group-local');
console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ EXERCISE GROUP GATE: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ EXERCISE GROUP GATE: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
