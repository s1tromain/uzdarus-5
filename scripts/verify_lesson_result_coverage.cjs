/* ============================================================================
   PAID-COURSE LESSON-RESULT COVERAGE AUDIT  (A1 / A2 / B1 / B2)
   ----------------------------------------------------------------------------
   Completed-lesson persistence stores the `results` array that
   course-global-fixes.js builds from a topic. Anything the collectors miss is
   missing from the saved snapshot and therefore from the restored review, so
   this script audits EVERY paid topic on two independent axes:

   PART A — collector round-trip (dynamic).
     For every topic it synthesises a DOM containing exactly the hooks the
     collectors query, fills every field with the CORRECT answer, presses the
     real "Javoblarni tekshirish" button and asserts the produced result is
     100% correct with one entry per declared item. This proves answer matching
     and capture work for every exercise type actually used by paid courses:
     multiple choice, text input, fill-in-the-blank, chips, selects, sentence
     builders, translation and transformation items.

   PART C — draft round-trip (dynamic).
     For every topic it fills the synthesised DOM, captures a draft with the
     real captureDraft(), wipes the DOM, restores with the real applyDraft()
     and asserts the answers came back byte-identical — and that NO grading
     state came back with them (a draft must never look graded).

   PART B — DOM hook reality check (static).
     A collector is only useful if the course page really renders the attribute
     it queries. For every topic this greps the course HTML for the data-*
     hooks the collectors depend on and reports any exercise family whose hooks
     are never emitted. KNOWN_GAPS records the mismatches that exist today (and
     are graded + displayed by that course's own scorer instead); any NEW drift
     fails the audit.

   Usage:  node scripts/verify_lesson_result_coverage.cjs
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch (e) { console.error('jsdom is required: npm i -D jsdom'); process.exit(2); }

const ROOT = path.join(__dirname, '..');
const CGF = fs.readFileSync(path.join(ROOT, 'course-global-fixes.js'), 'utf8');

const COURSES = [
    ['A1', 'paid-courses/a1-course.html'],
    ['A2', 'paid-courses/a2-course.html'],
    ['B1', 'paid-courses/b1-course.html'],
    ['B2', 'paid-courses/b2-course.html'],
];

/* Exercise families whose collector hooks are NOT rendered by the course page,
   i.e. those exercises live entirely inside that course's own scorer and never
   reached the shared feedback screen. Documented, not silently tolerated: any
   family NOT listed here that turns up missing fails the audit. */
const KNOWN_GAPS = {
    // A2 topics 1-3 render bespoke data-t1-*/data-t2-*/data-t3-* hooks and are
    // graded by window.checkTopic{1,2,3}Exercises in a2-course.html.
    A2: ['topic1Exercises', 'topic2Exercises', 'topic3Exercises'],
};

/* detectExerciseType is extracted from the file under audit, never re-implemented. */
const detectSrc = CGF.match(/function detectExerciseType\(exercise\)[\s\S]*?\n    \}/);
if (!detectSrc) { console.error('could not extract detectExerciseType'); process.exit(3); }
const detectExerciseType = vm.runInNewContext(detectSrc[0] + '; detectExerciseType');

/* ---------------------------------------------------------- courseData load */

function extractCourseData(html) {
    const start = html.search(/(?:const|let|var)\s+courseData\s*=\s*\{/);
    if (start === -1) return { __error: 'courseData not found' };
    const open = html.indexOf('{', start);
    let depth = 0, i = open, inStr = null, esc = false;
    for (; i < html.length; i++) {
        const c = html[i];
        if (inStr) {
            if (esc) { esc = false; continue; }
            if (c === '\\') { esc = true; continue; }
            if (c === inStr) inStr = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    const literal = html.slice(open, i);
    /* b2-course.html builds part of its topic list with a helper call inside the
       literal; stub it so the data-bearing topics still evaluate. */
    const sandbox = { generateLockedTopics: () => [] };
    try { return vm.runInNewContext('(' + literal + ')', sandbox, { timeout: 20000 }); }
    catch (e) { return { __error: e.message }; }
}

/* --------------------------------------------------- DOM hook synthesis (A) */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const first = (a) => (Array.isArray(a) ? a[0] : a);

/* Mirrors isOpenAnswerItem() in course-global-fixes.js / t1IsOpenAnswer() in
   b1-course.html: `free: true` OR a blank answer key means "no single right
   answer, accept any meaningful (>= 3 word) response". */
function isOpenAnswerItem(item) {
    if (item && item.free) return true;
    const a = item ? item.answer : null;
    if (a === null || a === undefined) return true;
    if (Array.isArray(a)) return a.every(x => String(x === null || x === undefined ? '' : x).trim() === '');
    return String(a).trim() === '';
}

/* Builds { html, expected } for one topic: the hooks the collectors query,
   pre-filled with the correct answers, plus how many results should come out. */
function synthesize(topic, code) {
    let html = '';
    let expected = 0;
    const families = new Set();
    const orphans = [];          // data present that NO collector will ever read
    const q = topic.quiz;

    /* B2 takes the submitQuiz branch: multiple choice is read from the page's
       `userAnswers` global (a carousel, not a DOM option list) and blanks are
       inline `.blank-input-inline[data-q-index][data-input-index]` fields. */
    if (code === 'B2') {
        const userAnswers = [];
        if (q && Array.isArray(q.mcQuestions) && Array.isArray(q.mcAnswers)) {
            q.mcQuestions.forEach((_, i) => {
                const raw = q.mcAnswers[i];
                const correct = Number.isInteger(raw) ? raw : parseInt(raw, 10);
                userAnswers[i] = Number.isInteger(correct) ? correct : null;
                expected++; families.add('b2.mc');
            });
        }
        if (q && Array.isArray(q.blankQuestions) && Array.isArray(q.blankAnswers)) {
            q.blankQuestions.forEach((_, qi) => {
                const expList = q.blankAnswers[qi];
                const normList = Array.isArray(expList) ? expList : [expList];
                normList.forEach((exp, ii) => {
                    html += `<input class="blank-input-inline" data-q-index="${qi}" data-input-index="${ii}" value="${esc(first(exp) || '')}">`;
                    expected++; families.add('b2.blank');
                });
            });
        }
        let b2Matching = 0;
        if (q && q.matchingGame && Array.isArray(q.matchingGame.pairs)) {
            b2Matching = q.matchingGame.pairs.length;
            expected += b2Matching;
            if (b2Matching) families.add('quiz.matching');
        }
        return { html, expected, families, orphans, userAnswers, matchingPairs: b2Matching };
    }

    // ---- native quiz: multiple choice + blanks ----
    if (q && Array.isArray(q.mcQuestions) && Array.isArray(q.mcAnswers)) {
        q.mcQuestions.forEach((_, i) => {
            const opts = (q.mcOptions && q.mcOptions[i]) || [];
            const correct = Number.isInteger(q.mcAnswers[i]) ? q.mcAnswers[i] : parseInt(q.mcAnswers[i], 10);
            if (!opts.length || !Number.isInteger(correct) || !opts[correct]) return;
            html += `<div class="quiz-options" data-question="${i}">` +
                opts.map((o, j) => `<div class="quiz-option${j === correct ? ' selected' : ''}" data-option="${j}">${esc(o)}</div>`).join('') +
                '</div>';
            expected++; families.add('quiz.mc');
        });
    }
    if (q && Array.isArray(q.blankQuestions) && Array.isArray(q.blankAnswers)) {
        q.blankQuestions.forEach((_, i) => {
            const a = first(q.blankAnswers[i]);
            if (a === undefined || a === null) return;
            html += `<input type="text" data-blank="${i}" value="${esc(a)}">`;
            expected++; families.add('quiz.blank');
        });
    }

    // ---- matching game (collectMatchingResults reads the page's JS state) ----
    let matchingPairs = 0;
    if (q && q.matchingGame && Array.isArray(q.matchingGame.pairs)) {
        matchingPairs = q.matchingGame.pairs.length;
        expected += matchingPairs;
        if (matchingPairs) families.add('quiz.matching');
    }

    // ---- extraExercises ----
    if (topic.extraExercises) {
        Object.keys(topic.extraExercises).forEach((sKey) => {
            const sec = topic.extraExercises[sKey];
            if (!sec || !Array.isArray(sec.questions) || !Array.isArray(sec.answers)) return;
            sec.questions.forEach((_, i) => {
                html += `<input type="text" data-section="${sKey}" data-index="${i}" value="${esc(first(sec.answers[i]) || '')}">`;
                expected++; families.add('extraExercises');
            });
        });
    }

    // ---- topic4FillExercise ----
    if (topic.topic4FillExercise && Array.isArray(topic.topic4FillExercise.questions)) {
        topic.topic4FillExercise.questions.forEach((_, i) => {
            html += `<input type="text" data-topic4-fill="${i}" value="${esc(first(topic.topic4FillExercise.answers[i]) || '')}">`;
            expected++; families.add('topic4FillExercise');
        });
    }

    // ---- topic5Exercises ----
    const t5 = topic.topic5Exercises;
    if (t5) {
        if (t5.exercise1 && Array.isArray(t5.exercise1.questions)) {
            t5.exercise1.questions.forEach((item, i) => {
                html += `<span class="topic5-select-blank" data-topic5-select="${i}" data-value="${esc(first(item.answer) || '')}"></span>`;
                expected++; families.add('topic5Exercises');
            });
        }
        ['exercise2', 'exercise3', 'exercise4'].forEach((k) => {
            const ex = t5[k];
            if (!ex || !Array.isArray(ex.prompts) || !Array.isArray(ex.answers)) return;
            const num = k.replace('exercise', '');
            ex.prompts.forEach((_, i) => {
                html += `<input type="text" data-topic5-e${num}="${i}" value="${esc(first(ex.answers[i]) || '')}">`;
                expected++; families.add('topic5Exercises');
            });
        });
    }

    // ---- topicNExercises ----
    Object.keys(topic).forEach((key) => {
        const m = key.match(/^topic(\d+)Exercises$/);
        if (!m) return;
        const N = m[1];
        const block = topic[key];
        if (!block || typeof block !== 'object') return;

        // Schema A — { exercises: [ { id, type, items } ] } (B1, A1 topic 1)
        if (Array.isArray(block.exercises)) {
            block.exercises.forEach((ex) => {
                if (!ex || !Array.isArray(ex.items) || !ex.items.length) return;  // layout slots (matchingSlot/audio) carry no items
                ex.items.forEach((item, i) => {
                    const k = ex.id + '-' + i;
                    const ans = first(item.answer);
                    if (ex.type === 'choice') {
                        html += `<div data-t1-row="${k}"><button class="t1-opt selected" data-value="${esc(ans || '')}"></button></div>`;
                    } else {
                        const v = isOpenAnswerItem(item) ? 'bir ikki uch' : (ans || '');
                        html += `<input data-t1-input="${k}" value="${esc(v)}">`;
                    }
                    expected++; families.add(key);
                });
            });
            return;
        }
        /* Mirror collectGenericTopicExercises exactly: it skips N===1 (owned by
           the dedicated topic1 collector, which needs the schema-A `exercises`
           array) and N===5 (owned by the topic5 collector). A block that falls
           through those gaps is read by nobody. */
        if (N === '1' || N === '5') {
            const hasSchemaB = Object.keys(block).some(k => /^exercise(\d+)$/.test(k));
            const handled = N === '5' ? ['exercise1', 'exercise2', 'exercise3', 'exercise4'].some(k => block[k]) : false;
            if (hasSchemaB && !handled) orphans.push(key + ' (schema-B block under topic' + N + ': no collector reads it)');
            return;
        }

        // Schema B — { exercise1..N } dispatched through detectExerciseType
        Object.keys(block).forEach((eKey) => {
            const em = eKey.match(/^exercise(\d+)$/);
            if (!em) return;
            const M = em[1];
            const ex = block[eKey];
            if (!ex || typeof ex !== 'object') return;
            const type = detectExerciseType(ex);
            const items = ex.items || [];
            switch (type) {
                case 'items-input':
                case 'items-transform':
                    items.forEach((item, i) => {
                        html += `<input type="text" data-topic${N}-e${M}="${i}" value="${esc(first(item.answers || item.answer) || '')}">`;
                        expected++; families.add(key);
                    });
                    break;
                case 'items-chips':
                    items.forEach((item, i) => {
                        html += `<div data-topic${N}-e${M}-row="${i}"><button class="selected" data-value="${esc(first(item.answer) || '')}"></button></div>`;
                        expected++; families.add(key);
                    });
                    break;
                case 'items-select':
                    items.forEach((item, i) => {
                        html += `<span data-topic${N}-select="${i}" data-value="${esc(first(item.answer) || '')}"></span>`;
                        expected++; families.add(key);
                    });
                    break;
                case 'items-builder':
                    items.forEach((item, i) => {
                        const words = String(first(item.answers || item.answer) || '').split(/\s+/).join('|');
                        html += `<input type="hidden" data-topic${N}-builder-selected="${i}" value="${esc(words)}">`;
                        expected++; families.add(key);
                    });
                    break;
                case 'prompts-input':
                case 'sentences-input':
                case 'questions-input': {
                    const list = ex.prompts || ex.sentences || ex.questions || [];
                    list.forEach((_, i) => {
                        html += `<input type="text" data-topic${N}-e${M}="${i}" value="${esc(first(ex.answers[i]) || '')}">`;
                        expected++; families.add(key);
                    });
                    break;
                }
                default:
                    orphans.push(key + '.' + eKey + ' (unrecognised shape: ' +
                        Object.keys(ex).filter(k => k !== 'title').join(',') + ')');
                    break;
            }
        });
    });

    return { html, expected, families, orphans, matchingPairs };
}

/* ------------------------------------------------------------ DOM harness */

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitFor(fn, ms = 3000, step = 25) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        let v; try { v = fn(); } catch (e) { v = null; }
        if (v) return v;
        await sleep(step);
    }
    return null;
}

/* Read back every answer-bearing field so a draft round-trip can be compared. */
function readAnswers(doc) {
    const out = {};
    doc.querySelectorAll('input, textarea').forEach((el, i) => {
        if (el.value) out['i' + i] = el.value;
    });
    doc.querySelectorAll('.selected').forEach((el, i) => {
        out['s' + i] = el.getAttribute('data-value') || el.getAttribute('data-option') || (el.textContent || '').trim();
    });
    doc.querySelectorAll('[data-value]').forEach((el, i) => {
        if (!el.classList.contains('selected')) out['d' + i] = el.getAttribute('data-value');
    });
    return out;
}

/* PART C: fill -> capture -> wipe -> restore -> compare, on the real engine. */
async function draftRoundTrip(code, courseData, topic, synth) {
    const dom = makeHarnessDom(code, synth);
    const w = dom.window;
    wireHarness(w, code, courseData, topic, synth);
    w.eval(CGF);
    await sleep(20);

    const api = w.__uzLessonResults;
    if (!api || typeof api.captureDraft !== 'function') { dom.window.close(); return 'no draft engine'; }

    const before = readAnswers(w.document);
    const draft = api.captureDraft(w.document);

    // Wipe every answer, as a fresh page load would.
    w.document.querySelectorAll('input, textarea').forEach(el => { el.value = ''; });
    w.document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    w.document.querySelectorAll('[data-value]').forEach(el => {
        if (!el.matches('.t1-opt, .quiz-option, .chip, button')) el.removeAttribute('data-value');
    });

    api.applyDraft(w.document, draft);
    const after = readAnswers(w.document);

    const graded = w.document.querySelector('.correct, .incorrect, .correct-answer, .wrong-answer, .t1-ok, .t1-bad');
    const fields = Object.keys(draft.fields || {}).length;
    const missing = Object.keys(before).filter(k => before[k] !== after[k]);
    dom.window.close();

    if (graded) return 'restored draft carries grading state';
    if (!fields) return 'captured nothing';
    if (missing.length) return `${missing.length} field(s) not restored`;
    return null;
}

function makeHarnessDom(code, synth) {
    const virtualConsole = new VirtualConsole();
    const dom = new JSDOM(
        '<!DOCTYPE html><body><div id="lesson">' + harnessBody(code, synth) +
        '<div class="results-section" id="resultsSection"><div id="scoreDisplay">Sizning natijangiz: 0/0</div>' +
        '<div id="resultsMessage"></div><div id="correctAnswers"></div>' +
        '<button id="completeBtn" style="display:none"></button><button id="retryBtn" style="display:none"></button>' +
        '</div></div></body>',
        { url: `https://uzdarus.uz/paid-courses/${code.toLowerCase()}-course.html`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
    let muted = false;
    virtualConsole.on('jsdomError', (e) => { if (!muted) console.error(String((e && e.message) || e)); });
    const orig = dom.window.close.bind(dom.window);
    dom.window.close = function () { muted = true; orig(); };
    dom.window.HTMLElement.prototype.scrollIntoView = function () {};
    dom.window.alert = function () {};
    return dom;
}

/* B2 renders into #lessonContent (it has no #quizSection); the others use
   #quizSection. Mirrors getActiveTopicRoot() in course-global-fixes.js. */
function harnessBody(code, synth) {
    return code === 'B2'
        ? '<div id="lessonContent"><div class="quiz-section"></div><div class="blank-section">' + synth.html + '</div></div>'
        : '<div id="lessonContent"></div><div id="quizSection"><div class="quiz-container">' + synth.html + '</div></div>';
}

function wireHarness(w, code, courseData, topic, synth) {
    w.courseData = courseData;
    if (code === 'B2') {
        w.currentTopic = topic;
        w.userAnswers = synth.userAnswers || [];
        w.submitQuiz = function () {};
    } else {
        w.currentTopicId = topic.id;
        w.checkAnswers = async function () {};
    }
    if (synth.matchingPairs) {
        // A fully-connected matching game, as the learner would leave it.
        w.matchingState = { matches: Array.from({ length: synth.matchingPairs }, (_, i) => ({ left: i, right: i })) };
    }
    w.currentUserId = null;                       // guest -> no account writes
}

async function runTopic(code, courseData, topic, synth) {
    const dom = makeHarnessDom(code, synth);
    const w = dom.window;
    wireHarness(w, code, courseData, topic, synth);
    w.eval(CGF);

    const close = () => { w.close(); };
    const btn = await waitFor(() => w.document.querySelector('.check-topic-btn'));
    if (!btn) return { w, close, out: null };
    btn.click();
    const fb = await waitFor(() => {
        const n = w.document.querySelector('.topic-feedback');
        return n && n.innerHTML ? n : null;
    });
    return { w, close, out: fb ? fb.innerHTML : '' };
}

/* ------------------------------------------------------------------- run */

let pass = 0, fail = 0, warn = 0, topicsAudited = 0;
const okc = (name, cond, extra) => {
    if (cond) { pass++; }
    else { fail++; console.log('    ✗ ' + name + (extra ? ' — ' + extra : '')); }
};

(async function main() {
console.log('\n=== PAID-COURSE LESSON-RESULT COVERAGE AUDIT ===\n');

for (const [code, rel] of COURSES) {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const data = extractCourseData(html);
    if (!data || data.__error) {
        fail++;
        console.log(`  ✗ ${code}: could not evaluate courseData — ${data && data.__error}`);
        continue;
    }
    const topics = (Array.isArray(data.topics) ? data.topics : []).filter(t => t && t.id !== undefined);
    okc(`${code}: courseData.topics parsed`, topics.length > 0, 'got ' + topics.length);

    let withExercises = 0, itemsTotal = 0;
    const roundTripFailures = [];
    const draftFailures = [];
    const allFamilies = new Set();
    const allOrphans = [];

    for (const topic of topics) {
        topicsAudited++;
        const synth = synthesize(topic, code);
        synth.families.forEach(f => allFamilies.add(f));
        (synth.orphans || []).forEach(o => allOrphans.push(`topic ${topic.id}: ${o}`));
        if (!synth.expected) continue;      // locked / text-only topic
        withExercises++;
        itemsTotal += synth.expected;

        const h = await runTopic(code, data, topic, synth);
        const out = h.out || '';
        const cards = (out.match(/class="fb-card /g) || []).length;
        const wrong = (out.match(/fb-incorrect/g) || []).length;
        h.close();

        if (cards !== synth.expected || wrong !== 0) {
            roundTripFailures.push(`topic ${topic.id}: ${cards}/${synth.expected} captured, ${wrong} mis-scored`);
        }

        const draftProblem = await draftRoundTrip(code, data, topic, synth);
        if (draftProblem) draftFailures.push(`topic ${topic.id}: ${draftProblem}`);
    }

    console.log(`  ${code}: ${topics.length} topics — ${withExercises} with collectable exercises, ${itemsTotal} answers audited`);
    console.log(`      families: ${[...allFamilies].sort().join(', ') || '(none)'}`);
    okc(`${code}: every declared answer is captured and scored correctly`,
        roundTripFailures.length === 0, roundTripFailures.slice(0, 6).join(' | '));
    okc(`${code}: draft captures and restores every answer, with no grading state`,
        draftFailures.length === 0, draftFailures.slice(0, 6).join(' | '));

    if (allOrphans.length) {
        warn++;
        console.log(`      ⚠ data no collector reads: ${allOrphans.slice(0, 4).join(' | ')}` +
                    (allOrphans.length > 4 ? ` (+${allOrphans.length - 4} more)` : ''));
    }
    okc(`${code}: orphan exercise blocks are documented`,
        allOrphans.length === 0 || (KNOWN_GAPS[code] || []).length > 0,
        allOrphans.slice(0, 3).join(' | '));

    // ---- PART B: are the collector hooks actually rendered by the page? ----
    const known = KNOWN_GAPS[code] || [];
    const missing = [];
    [...allFamilies].forEach((fam) => {
        const m = fam.match(/^topic(\d+)Exercises$/);
        let probe;
        if (m) probe = new RegExp(`data-topic${m[1]}-(e\\d+|select|builder-selected)|data-t1-(row|input)`);
        else if (fam === 'quiz.mc') probe = /data-question=/;
        else if (fam === 'quiz.blank') probe = /data-blank=/;
        else if (fam === 'b2.mc') probe = /userAnswers/;
        else if (fam === 'b2.blank') probe = /blank-input-inline/;
        else if (fam === 'extraExercises') probe = /data-section=/;
        else if (fam === 'topic4FillExercise') probe = /data-topic4-fill=/;
        else if (fam === 'topic5Exercises') probe = /data-topic5-(select|e\d+)=/;
        if (probe && !probe.test(html)) missing.push(fam);
    });
    const newGaps = missing.filter(f => !known.includes(f));
    const staleKnown = known.filter(f => allFamilies.has(f) && !missing.includes(f));
    if (missing.length) {
        warn++;
        console.log(`      ⚠ hooks never rendered by the page: ${missing.join(', ')}` +
                    ` (graded by ${code}'s own scorer; outside the shared feedback layer)`);
    }
    okc(`${code}: no NEW collector/DOM hook mismatch`, newGaps.length === 0, newGaps.join(', '));
    okc(`${code}: KNOWN_GAPS list is not stale`, staleKnown.length === 0,
        'now rendered, remove from KNOWN_GAPS: ' + staleKnown.join(', '));
}

console.log('\n' + '='.repeat(64));
console.log(fail === 0
    ? `=== COVERAGE OK: ${topicsAudited} paid topics audited, ${pass} checks passed, ${warn} documented gap(s) ===`
    : `=== COVERAGE FAILED: ${fail} problem(s) across ${topicsAudited} topics ===`);
console.log('='.repeat(64) + '\n');
process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
