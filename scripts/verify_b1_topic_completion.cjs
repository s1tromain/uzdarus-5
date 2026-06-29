/* ============================================================================
   PROOF: b1-course every-topic completion after a perfect result
   ----------------------------------------------------------------------------
   Critical production bug: a learner could finish a B1 topic with a perfect
   graded result (e.g. Topic 11 -> 80/80 = 100%) yet the topic stayed
   "Mavzu tugatilmadi". Root cause: Topics 11-20 wrapped the shared scorer
   (window.checkTopic1Exercises) with a SECOND completion gate that ANDed in a
   separate matching-game / 100%-exact requirement which is NOT part of the
   #scoreDisplay score the learner sees, so a perfect graded result was
   silently flipped back to failed and the topic could never complete.

   This harness extracts the REAL courseData + the REAL scoring/completion
   function from paid-courses/b1-course.html, then, for EVERY topic that has
   exercises, fills every exercise input with the CORRECT answer, runs the
   actual scorer, and asserts:
     - #scoreDisplay shows total/total (100%)
     - #completeBtn becomes "Mavzuni tugatish" (enabled)
     - clicking it records completion (completedTopics), saves progress to
       Firebase, updates progress and refreshes the topic list (unlock).
   It also asserts Topics 1-20 are all wired to the SINGLE shared flow.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
let JSDOM; try { ({ JSDOM } = require('jsdom')); } catch (e) { console.error('need jsdom: npm i -D jsdom'); process.exit(2); }

const FILE = path.join(__dirname, '..', 'paid-courses', 'b1-course.html');
const html = fs.readFileSync(FILE, 'utf8');

/* ---- string/comment-aware balanced-brace extractor for object literals ---- */
function extractObject(src, declStr) {
    const at = src.indexOf(declStr);
    if (at < 0) throw new Error('decl not found: ' + declStr);
    const open = src.indexOf('{', at);
    let depth = 0, inStr = null, esc = false;
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === inStr) inStr = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return src.slice(open, i + 1); }
    }
    throw new Error('unterminated object: ' + declStr);
}
function extract(re, name) {
    const m = html.match(re);
    if (!m) { console.error('could not extract ' + name); process.exit(3); }
    return m[0];
}

const courseDataSrc = extractObject(html, 'const courseData = {');
const t1NormSrc  = extract(/function t1Norm\(v\) \{[\s\S]*?\r?\n {8}\}/, 't1Norm');
const t1MatchSrc = extract(/function t1Match\(userValue, expected\) \{[\s\S]*?\r?\n {8}\}/, 't1Match');
const t1OpenSrc  = extract(/function t1IsOpenAnswer\(item\) \{[\s\S]*?\r?\n {8}\}/, 't1IsOpenAnswer');
const getExSrc   = extract(/function getT1ExData\(topic\) \{[\s\S]*?\r?\n {8}\}/, 'getT1ExData');
const scorerSrc  = extract(/window\.checkTopic1Exercises = async function \(topicId\) \{[\s\S]*?\r?\n {8}\};/, 'checkTopic1Exercises');
const aliasSrc   = extract(/window\.checkTopic11Exercises = window\.checkTopic1Exercises;[\s\S]*?window\.checkTopic20Exercises = window\.checkTopic1Exercises;/, 'aliases 11-20');
const alias210Src = extract(/window\.checkTopic2Exercises = window\.checkTopic1Exercises;[\s\S]*?window\.checkTopic10Exercises = window\.checkTopic1Exercises;/, 'aliases 2-10');

/* ---------------------------- JSDOM sandbox ---------------------------- */
const dom = new JSDOM(
    '<!DOCTYPE html><body>' +
    '<div id="topics"></div>' +
    '<div id="quizSection"></div>' +
    '<div class="results-section" id="resultsSection">' +
    '  <div id="scoreDisplay">Sizning natijangiz: 0/0</div>' +
    '  <div id="resultsMessage"></div>' +
    '  <div id="correctAnswers"></div>' +
    '  <button id="completeBtn" style="display:none">Mavzu tugatilmadi</button>' +
    '  <button id="retryBtn" style="display:none"></button>' +
    '</div></body>', { runScripts: 'outside-only' });
const w = dom.window;
const doc = w.document;
w.HTMLElement.prototype.scrollIntoView = function () {};
w.alert = function () {};

// Provide all closure dependencies the real functions capture, plus call spies.
w.eval(
    'var calls = { save:0, updateProgress:0, loadTopics:0 };' +
    'var completedTopics = [];' +
    'var currentScore = 0;' +
    'var userQuizResults = {};' +
    'var PASSING_SCORE = 7;' +
    'var currentUser = null;' +
    'var quizSection = document.getElementById("quizSection");' +
    'var resultsSection = document.getElementById("resultsSection");' +
    'var completeBtn = document.getElementById("completeBtn");' +
    'var retryBtn = document.getElementById("retryBtn");' +
    'var matchingState = { selectedLeft:null, selectedRight:null, matches:[], attempts:0 };' +
    'var saveQuizResultToFirebase = async function(){ return true; };' +
    'var saveProgressToFirebase = async function(){ calls.save++; return true; };' +
    'var updateProgress = function(){ calls.updateProgress++; };' +
    'var loadTopics = function(){ calls.loadTopics++; };' +
    'var clearQuizDraft = function(){};' +
    'window.calls = calls; window.completedTopics = completedTopics;' +
    t1NormSrc + '\n' + t1MatchSrc + '\n' + t1OpenSrc + '\n' + getExSrc + '\n' +
    'window.courseData = { topics: (' + courseDataSrc + ').topics };' +
    scorerSrc + '\n' + alias210Src + '\n' + aliasSrc + '\n'
);

/* ----------------------- correct-answer DOM builder ----------------------- */
function isOpen(item) {
    if (item && item.free) return true;
    let a = item ? item.answer : null;
    if (a == null) return true;
    if (Array.isArray(a)) return a.every(x => String(x == null ? '' : x).trim() === '');
    return String(a).trim() === '';
}
function correctAnswer(item) {
    let a = item.answer;
    if (Array.isArray(a)) a = a[0];
    return a;
}
const OPEN_FILL = 'bu mening toliq javobim';
function buildExerciseDom(exData) {
    const qs = doc.getElementById('quizSection');
    qs.innerHTML = '';
    let issues = [];
    (exData.exercises || []).forEach(function (g) {
        (g.items || []).forEach(function (item, i) {
            const key = g.id + '-' + i;
            if (g.type === 'choice') {
                const row = doc.createElement('div');
                row.setAttribute('data-t1-row', key);
                const ans = correctAnswer(item);
                if (ans == null) issues.push(key + ' (choice has no answer)');
                const opt = doc.createElement('div');
                opt.className = 't1-opt selected';
                opt.setAttribute('data-value', String(ans == null ? '' : ans));
                row.appendChild(opt);
                qs.appendChild(row);
            } else if (g.type === 'builder') {
                const inp = doc.createElement('input');
                inp.setAttribute('data-t1-input', key);
                inp.value = isOpen(item) ? OPEN_FILL : String(correctAnswer(item));
                qs.appendChild(inp);
                const slot = doc.createElement('div');
                slot.setAttribute('data-t1-slot', key);
                qs.appendChild(slot);
            } else {
                const inp = doc.createElement('input');
                inp.setAttribute('data-t1-input', key);
                inp.value = isOpen(item) ? OPEN_FILL : String(correctAnswer(item));
                qs.appendChild(inp);
            }
        });
    });
    return issues;
}
function totalItems(exData) {
    let t = 0;
    (exData.exercises || []).forEach(function (g) { t += (g.items || []).length; });
    return t;
}

/* -------------------------------- run -------------------------------- */
const topics = w.courseData ? w.courseData.topics : w.eval('courseData.topics');
const allTopics = w.eval('courseData.topics');
let pass = 0, fail = 0;
const rows = [];

(async function () {
    // Structural proof: every topic 1-20 resolves to the SAME shared function.
    let unified = true;
    for (let n = 1; n <= 20; n++) {
        const same = w.eval('window.checkTopic' + n + 'Exercises === window.checkTopic1Exercises');
        if (!same) { unified = false; console.log('  ✗ checkTopic' + n + 'Exercises is NOT the shared flow'); }
    }
    console.log((unified ? '  ✓' : '  ✗') + ' Topics 1-20 all wired to the single shared completion flow');
    unified ? pass++ : fail++;

    for (let t = 0; t < allTopics.length; t++) {
        const topic = allTopics[t];
        const exData = w.eval('getT1ExData(courseData.topics[' + t + '])');
        if (!exData) continue; // not an exercise topic
        const total = totalItems(exData);
        if (total === 0) continue; // nothing to score (e.g. matchingSlot only)

        // reset state to the native "bug" baseline
        w.eval('completedTopics.length = 0; calls.save=0; calls.updateProgress=0; calls.loadTopics=0; currentScore=0;');
        const cb = doc.getElementById('completeBtn');
        cb.textContent = 'Mavzu tugatilmadi'; cb.style.display = 'none';
        doc.getElementById('scoreDisplay').textContent = 'Sizning natijangiz: 0/0';

        const issues = buildExerciseDom(exData);

        // run the REAL scorer/completion for this topic id
        w.__tid = topic.id;
        await w.eval('window.checkTopic' + topic.id + 'Exercises(' + topic.id + ')');

        const score = doc.getElementById('scoreDisplay').textContent;
        const btn = doc.getElementById('completeBtn');
        const okScore = new RegExp('\\b' + total + '/' + total + '\\b').test(score) && /100%/.test(score);
        const okBtn = btn.textContent === 'Mavzuni tugatish' && btn.style.display === 'block';

        // click complete -> must record completion + persist + unlock
        if (typeof btn.onclick === 'function') { await btn.onclick(); }
        const recorded = w.eval('completedTopics.includes(' + topic.id + ')');
        const persisted = w.eval('calls.save') >= 1;
        const progressed = w.eval('calls.updateProgress') >= 1 && w.eval('calls.loadTopics') >= 1;

        const okAll = okScore && okBtn && recorded && persisted && progressed && issues.length === 0;
        okAll ? pass++ : fail++;
        rows.push({ id: topic.id, total, okScore, okBtn, recorded, persisted, progressed,
                    issues, score: score.replace('Sizning natijangiz: ', '') });
        console.log(
            (okAll ? '  ✓' : '  ✗') +
            ' Topic ' + String(topic.id).padStart(2) +
            ' | ' + score.replace('Sizning natijangiz: ', '').padEnd(14) +
            ' | btn="' + btn.textContent + '"' +
            ' | done=' + recorded + ' save=' + persisted + ' unlock=' + progressed +
            (issues.length ? ' | UNSCORABLE: ' + issues.join(', ') : ''));
    }

    console.log('\n=== B1 RESULT: ' + pass + ' passed, ' + fail + ' failed (' + rows.length + ' exercise topics) ===');
    process.exitCode = fail ? 1 : 0;
})();
