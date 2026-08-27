#!/usr/bin/env node
/**
 * verify_a1_exercise_dispatch.cjs — topics 6–12 must always put their exercises
 * on screen, or say why they could not.
 *
 * THE BUG THIS EXISTS TO CATCH
 * ---------------------------
 * Topics 6–12 carry hand-written exercise blocks instead of the generic quiz.
 * loadLesson() empties #quizSection SYNCHRONOUSLY and refills it 100 ms later,
 * which used to be a bare setTimeout with an inline if/else chain. That had two
 * silent failure modes, and learners hit both as "the exercises sometimes do
 * not load":
 *
 *   1. Switching topics inside the 100 ms window left the previous topic's
 *      timer in flight. Each loader refuses to draw when its topicId is no
 *      longer current — correctly, but it refuses by RETURNING, so the section
 *      it had already emptied stayed empty.
 *   2. A throw inside a timer callback is swallowed by the event loop. One bad
 *      exercise (a renamed data key is enough) left a blank section with no
 *      error and no way to recover.
 *
 * scheduleExerciseRender() fixes both: one pending render at a time, and a
 * render that produced nothing renders a retry instead of a void.
 *
 * The assertions below drive the REAL function lifted out of the page against
 * stub loaders, so they fail if the timer, the cancellation or the fallback is
 * removed. Do not weaken them into a source grep.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };

const html = fs.readFileSync(path.join(ROOT, 'paid-courses/a1-course.html'), 'utf8');

function lift(name) {
    const i = html.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('missing ' + name);
    let p = 0, b = -1;
    for (let k = html.indexOf('(', i); k < html.length; k++) {
        if (html[k] === '(') p++;
        else if (html[k] === ')') { p--; if (p === 0) { b = html.indexOf('{', k); break; } }
    }
    let d = 0;
    for (let k = b; k < html.length; k++) {
        if (html[k] === '{') d++;
        else if (html[k] === '}') { d--; if (d === 0) return html.slice(i, k + 1); }
    }
    throw new Error('unbalanced ' + name);
}

console.log('\n=== A1 EXERCISE DISPATCH (topics 6-12) ===');

/* ------------------------------------------- 1. the dispatch is data-driven */
const tableStart = html.indexOf('const EXERCISE_TOPIC_LOADERS');
ok(tableStart > 0, 'EXERCISE_TOPIC_LOADERS table exists');
const table = html.slice(tableStart, html.indexOf('};', tableStart) + 2);
const TOPICS = [6, 7, 8, 9, 10, 11, 12];
TOPICS.forEach(id => ok(new RegExp('\\b' + id + ':\\s*\\(\\)').test(table),
    `topic ${id} is in the loader table`));
/* EVERY EXERCISE TOPIC GOES THROUGH THE SHARED SESSION FIRST. The bespoke
   loader is the fallback, not the primary path: A1's per-exercise 80% gate
   lives in the session, and a topic that skipped it would be graded on a
   topic-wide aggregate again. */
TOPICS.forEach(id => ok(new RegExp('mountA1Practice\\(' + id + '\\)').test(table),
    `topic ${id} tries the shared session before the legacy loader`));

/* loadLesson must branch on the table, not on a chain of id comparisons */
ok(/if \(EXERCISE_TOPIC_LOADERS\[topicId\]\)/.test(html),
    'loadLesson dispatches through the table, not `topicId === 6 || ...`');
ok(!/topicId === 6 \|\| topicId === 7/.test(html),
    'the old id-comparison chain is gone');

/* ------------------------------------------------ 2. the behaviour, driven */
const w = new JSDOM('<!doctype html><body><div id="quizSection"></div></body>',
    { runScripts: 'outside-only' }).window;
w.eval(`${table}
    var pendingExerciseRender = null;
    var currentTopicId = null;
    var quizSection = document.getElementById('quizSection');
    window.__calls = []; window.__throwOn = null;
    /* A1 now routes every exercise topic through the shared session and
       falls back to the bespoke loader when that stack is absent. This
       sandbox loads neither the engine nor the host, so the fallback is
       what runs — which is exactly the path these dispatch/scheduling
       assertions are about. __mounted records that the table asked. */
    window.__mounted = [];
    window.mountA1Practice = function (id) { window.__mounted.push(id); return false; };
    [6,7,8,9,10,11,12].forEach(function (n) {
        window['loadTopic' + n + 'Exercises'] = function (id) {
            /* the real loaders all guard on this and return silently */
            if (id !== currentTopicId) return;
            if (window.__throwOn === id) throw new Error('exercise data broken');
            window.__calls.push(id);
            quizSection.innerHTML = '<p>mashq ' + id + '</p>';
        };
    });
    ${lift('scheduleExerciseRender')}
    window.__open = function (id) {
        /* exactly what loadLesson() does for an exercise topic */
        currentTopicId = id;
        quizSection.innerHTML = '';
        scheduleExerciseRender(id);
    };`);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const shown = () => w.document.getElementById('quizSection').innerHTML;

(async () => {
    /* ---- every topic renders on its own */
    for (const id of TOPICS) {
        w.__calls = [];
        w.__open(id);
        await sleep(160);
        ok(w.__calls.join() === String(id) && shown().includes('mashq ' + id),
            `topic ${id}: the exercises reach the screen`);
    }

    /* ---- the race: three topics opened inside one 100 ms window */
    w.__calls = [];
    w.__open(7); await sleep(20);
    w.__open(8); await sleep(20);
    w.__open(9);
    await sleep(250);
    ok(w.__calls.join() === '9',
        `rapid 7->8->9 renders only the topic actually open (got [${w.__calls.join()}])`);
    ok(shown().includes('mashq 9'),
        'rapid switching never leaves #quizSection empty');
    ok(w.eval('pendingExerciseRender') === null,
        'no timer is left pending once the render has run');

    /* ---- a throw must not be swallowed into a blank section */
    w.__throwOn = 11;
    w.__calls = [];
    const err = [];
    w.console.error = (...a) => err.push(a.join(' '));
    w.__open(11);
    await sleep(200);
    ok(shown().trim() !== '', 'a failing loader does not leave an empty section');
    ok(shown().includes('exercise-load-error'),
        'a failing loader shows the recovery block');
    ok(err.some(m => /Mashqlarni yuklashda xatolik/.test(m)),
        'the failure is reported to the console, not swallowed');

    /* ---- and the learner can get out of it */
    w.__throwOn = null;
    const retry = w.document.querySelector('.exercise-load-retry');
    ok(!!retry, 'the recovery block offers a retry control');
    if (retry) {
        retry.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        await sleep(200);
        ok(shown().includes('mashq 11'), 'retry re-runs the render and succeeds');
    }

    /* ---- the styles the recovery block depends on exist */
    ok(/\.exercise-load-error\s*\{/.test(html), '.exercise-load-error is styled');
    ok(/\.exercise-load-retry\s*\{/.test(html), '.exercise-load-retry is styled');

    console.log('='.repeat(60));
    if (fail) {
        console.log(`  ❌ A1 EXERCISE DISPATCH: ${fail} failed / ${pass + fail}\n`);
        failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
        console.log('='.repeat(60) + '\n');
        process.exit(1);
    }
    console.log(`  ✅ A1 EXERCISE DISPATCH: ${pass}/${pass} passed`);
    console.log('='.repeat(60) + '\n');
})();
