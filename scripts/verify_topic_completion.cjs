/* ============================================================================
   PROOF: a1-course exercise-topic score + completion fix (Bug #4)
   ----------------------------------------------------------------------------
   Extracts the REAL window.__uzFinalizeExerciseTopic and window.__uzCompleteTopic
   from paid-courses/a1-course.html and traces them through a JSDOM that mirrors
   the live results block (#scoreDisplay seeded with the native "0/0", #completeBtn
   seeded with the native "Mavzu tugatilmadi"). Asserts the fix:
     - a passing exercise score replaces 0/0 with the real total and enables
       "Mavzuni tugatish" wired to completion;
     - a failing score shows the real total and the retry path;
     - clicking complete invokes the course completion hook with the topic id.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
let JSDOM; try { ({ JSDOM } = require('jsdom')); } catch (e) { console.error('need jsdom'); process.exit(2); }

const html = fs.readFileSync(path.join(__dirname, '..', 'paid-courses', 'a1-course.html'), 'utf8');

function extract(re, name) {
    const m = html.match(re);
    if (!m) { console.error('could not extract ' + name); process.exit(3); }
    return m[0];
}
const finalizeSrc = extract(/window\.__uzFinalizeExerciseTopic = function[\s\S]*?\n {8}\};/, '__uzFinalizeExerciseTopic');
const completeSrc = extract(/window\.__uzCompleteTopic = async function[\s\S]*?\n {8}\};/, '__uzCompleteTopic');

let pass = 0, fail = 0;
const ok = (n, c) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n)); };

const dom = new JSDOM(
    '<!DOCTYPE html><body>' +
    '<div id="topicsContainer"></div>' +
    '<div class="results-section" id="resultsSection">' +
    '  <div id="scoreDisplay">Sizning natijangiz: 0/0</div>' +   // <- native bug state
    '  <div id="resultsMessage">Test natijalaringiz</div>' +
    '  <button id="completeBtn" style="display:none">Mavzu tugatilmadi</button>' +
    '  <button id="retryBtn" style="display:none">Qayta urinib ko‘rish</button>' +
    '</div></body>', { runScripts: 'outside-only' });
const w = dom.window;
w.HTMLElement.prototype.scrollIntoView = function () {};
w.alert = function () {};

// closure vars the real function captures from the course script scope
const completedTopics = [];
let completedVia = null;
w.eval(
    'var resultsSection = document.getElementById("resultsSection");' +
    'var completeBtn = document.getElementById("completeBtn");' +
    'var retryBtn = document.getElementById("retryBtn");' +
    'var currentUser = null;' +
    'var courseData = { topics: [{ id: 6, title: "Shaharning joylari" }] };' +
    'window.__uzCompleteTopic = function(topicId){ window.__completedVia = topicId; };' +
    finalizeSrc
);

console.log('\n[A] Passing exercise score (15/18) on an exercise-only topic');
w.__uzFinalizeExerciseTopic(6, 15, 18);
const score = w.document.getElementById('scoreDisplay').textContent;
const btn = w.document.getElementById('completeBtn');
ok('scoreDisplay no longer 0/0', !/\/\s*0\b/.test(score) && /15\/18/.test(score), score);
ok('scoreDisplay shows percentage', /83%/.test(score), score);
ok('results section shown', w.document.getElementById('resultsSection').classList.contains('show'));
ok('complete button enabled + labelled', btn.textContent === 'Mavzuni tugatish' && btn.style.display === 'block');
ok('retry hidden on pass', w.document.getElementById('retryBtn').style.display === 'none');
btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok('clicking complete invokes course completion hook with topic id', w.__completedVia === 6);

console.log('\n[B] Failing exercise score (5/18)');
w.__completedVia = null;
w.__uzFinalizeExerciseTopic(6, 5, 18);
const score2 = w.document.getElementById('scoreDisplay').textContent;
const btn2 = w.document.getElementById('completeBtn');
ok('scoreDisplay shows real failing score (not 0/0)', /5\/18/.test(score2), score2);
ok('complete button shows "tugatilmadi"', btn2.textContent === 'Mavzu tugatilmadi');
ok('retry shown on fail', w.document.getElementById('retryBtn').style.display === 'block');
btn2.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok('clicking failed button does NOT complete topic', w.__completedVia === null);

console.log('\n[C] Zero-exercise topic stays 0/0 (spec: only 0/0 when no questions)');
w.document.getElementById('scoreDisplay').textContent = 'Sizning natijangiz: 0/0';
w.__uzFinalizeExerciseTopic(6, 0, 0);
ok('total=0 leaves block untouched', /0\/0/.test(w.document.getElementById('scoreDisplay').textContent));

console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exitCode = fail ? 1 : 0;
