#!/usr/bin/env node
/**
 * verify_a2_scoring_parity.cjs — the engine and the legacy scorer must agree,
 * and the engine must not depend on the legacy DOM to reach its answer.
 *
 * THE BUG THIS EXISTS TO CATCH
 * ----------------------------
 * Scoring used to run: engine answers -> mirrored into hidden #a2LegacyBridge
 * -> read back out -> scored. The hidden DOM was therefore the real source of
 * truth. A simulated deletion of that node produced 0/110 for a PERFECT attempt,
 * silently, with no error and a 0/110 record written to the learner's history.
 *
 * So this suite asserts two different things:
 *   1. PARITY  — for every item and at six score levels, the engine's result
 *                equals the legacy scorer's result, including pass/fail.
 *   2. INDEPENDENCE — corrupt or delete the hidden DOM after mirroring and the
 *                engine's score must not move by a single point.
 *
 * Assertion 1 alone would have passed while the bug was present. Assertion 2 is
 * the one that fails loudly, so do not weaken it into "did not throw".
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };

const MODULES = ['exercise-session.js', 'sentence-builder.js', 'course-exercise-ui.js', 'a2-host.js'];

function boot(rel) {
    const SRC = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const blocks = [...SRC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    const pre = blocks.find(b => /(let|var|const)\s+currentUser/.test(b) && !b.includes('const courseData'));
    const main = blocks.find(b => b.includes('const courseData'));
    const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
    const w = new JSDOM(SRC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g, '<script></script>'),
        { url: 'https://uzdarus.uz/' + rel, runScripts: 'outside-only',
          pretendToBeVisual: true, virtualConsole: vc }).window;
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.alert = () => {}; w.confirm = () => true;
    /* a REAL user id, so the Firebase branch is taken rather than the
       localStorage fallback (the SDK itself is stubbed and counted) */
    w.eval('window.__fb={quiz:[],progress:[]};' +
           'window.currentUserId="uid-test-1";' +
           'window.saveQuizResult=async function(uid,topicId,data,course){' +
           '  window.__fb.quiz.push({uid:uid,topicId:topicId,data:data,course:course}); return 1;};' +
           'window.saveUserProgress=async function(uid,course,payload){' +
           '  window.__fb.progress.push({uid:uid,course:course,payload:payload}); return 1;};' +
           'window.getUserProgress=async()=>({completedTopics:[]});' +
           'window.getUserQuizResults=async()=>({});window.logActivity=async()=>{};');
    MODULES.forEach(f => w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    if (pre) w.eval(pre);
    w.eval(main + '\n;window.__api={courseData:courseData,loadLesson:loadLesson,' +
           'setCompleted:function(v){completedTopics=v;},getCompleted:function(){return completedTopics;},' +
           'uqr:function(){return userQuizResults;},exData:getT1ExData,passNeeded:a2PassNeeded,' +
           't1Match:t1Match,t1IsOpen:t1IsOpenAnswer};');
    return w;
}

/** The value a learner would type to get this item right. */
function correctValue(item) {
    const a = Array.isArray(item.answer) ? item.answer[0] : item.answer;
    if (a == null || String(a).trim() === '' || item.free) return 'я думаю что это интересно';
    return String(a);
}
const WRONG = 'zzz';

/** Mount the practice card and return the live session. */
function mountSession(w, topicId, spy) {
    const topic = w.__api.courseData.topics.find(t => t.id === topicId);
    const ex = w.__api.exData(topic);
    const mount = w.document.getElementById('a2PracticeMount');
    return w.A2Host.mountPractice({
        mountEl: mount,
        deps: {
            getTopic: () => ({ id: topicId, exercises: ex.exercises || [] }),
            getScope: () => w.document.getElementById('a2LegacyBridge')
                         || w.document.getElementById('quizSection'),
            runLegacyCheck: (id) => w.checkTopic1Exercises(id),
            isCompleted: () => false,
            saveResult: (id, r) => { spy.engine = r; },
            loadResult: () => null,
            passNeeded: w.__api.passNeeded,
            completeTopic: () => {},
            showResults: () => {}
        }
    });
}

/* ------------------------------------------------------------------ 1. ITEM-LEVEL PARITY */
function itemParity(w) {
    const byType = {};
    let compared = 0, disagree = 0;
    for (let n = 1; n <= 5; n++) {
        const topic = w.__api.courseData.topics.find(t => t.id === n);
        const ex = w.__api.exData(topic);
        if (!ex) continue;
        (ex.exercises || []).forEach(g => {
            const kind = g.type === 'choice' ? ('choice/' + (g.render || g.variant || 'chips'))
                       : (g.type || 'input');
            (g.items || []).forEach(item => {
                const open = w.__api.t1IsOpen(item);
                const bucket = open ? 'open-answer' : kind;
                byType[bucket] = byType[bucket] || { n: 0, bad: 0 };
                [correctValue(item), WRONG, '', '  ', 'да'].forEach(v => {
                    /* OLD rule, exactly as the legacy scorer applies it */
                    const legacy = open
                        ? String(v).split(/\s+/).filter(Boolean).length >= 3
                        : w.__api.t1Match(v, item.answer);
                    /* NEW rule */
                    const engine = w.UzExerciseUI.matchItem(item, v);
                    compared++;
                    byType[bucket].n++;
                    if (legacy !== engine) { disagree++; byType[bucket].bad++; }
                });
            });
        });
    }
    console.log('\n  ITEM-LEVEL PARITY (legacy t1Match vs engine matchItem)');
    Object.keys(byType).sort().forEach(k => {
        const b = byType[k];
        console.log(`    ${k.padEnd(16)} ${String(b.n).padStart(5)} comparisons, ${b.bad} disagreements`);
        ok(b.bad === 0, `item parity for type "${k}" (${b.bad} disagreements)`);
    });
    console.log(`    ${'TOTAL'.padEnd(16)} ${String(compared).padStart(5)} comparisons, ${disagree} disagreements`);
    ok(disagree === 0, `every item scores identically under both rules (${disagree} disagreements)`);
}

/* ------------------------------------------------------------------ 2. SCORE-LEVEL PARITY */
/**
 * A deterministic latch on the legacy publish.
 *
 * The legacy path finishes by assigning `userQuizResults["topic_<id>"]`. An
 * accessor property on that exact key turns the assignment into a resolved
 * promise, so the test resumes in the same tick the record is published —
 * no polling, no timing budget, no sensitivity to machine load.
 *
 * `settled()` still races a bounded safety timeout so that a record which is
 * genuinely never published FAILS the suite instead of hanging it.
 */
const PUBLISH_SAFETY_MS = Number(process.env.A2_PARITY_SAFETY_MS || 20000);

function publishLatch(w, topicId) {
    const store = w.__api.uqr();
    const key = 'topic_' + topicId;
    delete store[key];                       // observe only THIS run's write
    let value, resolve;
    const published = new Promise(r => { resolve = r; });
    Object.defineProperty(store, key, {
        configurable: true, enumerable: true,
        get() { return value; },
        set(v) { value = v; resolve(v); }
    });
    const latch = {
        timedOut: false,
        async settled() {
            let timer;
            const safety = new Promise(r => { timer = setTimeout(() => r(null), PUBLISH_SAFETY_MS); });
            const rec = await Promise.race([published, safety]);
            clearTimeout(timer);
            latch.timedOut = rec === null || rec === undefined;
            /* hand the key back as a plain data property */
            delete store[key];
            if (value !== undefined) store[key] = value;
            return rec;
        }
    };
    return latch;
}

async function scoreParity(w, topicId, targets) {
    const topic = w.__api.courseData.topics.find(t => t.id === topicId);
    const ex = w.__api.exData(topic);
    const groups = ex.exercises || [];
    const keys = [];
    groups.forEach(g => (g.items || []).forEach((item, i) => keys.push({ g, item, key: g.id + '-' + i })));
    const total = keys.length;

    console.log(`\n  SCORE-LEVEL PARITY — topic ${topicId} (${total} items)`);
    for (const want of targets) {
        w.__api.loadLesson(topicId);
        const spy = {};
        const s = mountSession(w, topicId, spy);
        if (!s) { ok(false, `topic ${topicId}: session mounts for target ${want}`); continue; }

        const answers = {};
        keys.forEach((k, i) => { answers[k.key] = i < want ? correctValue(k.item) : WRONG; });
        s.answers = answers;
        /* publishLatch clears the slot itself, so THIS run's write is observed */
        /* DETERMINISTIC SYNCHRONISATION.
           a2PersistAttempt() publishes by a direct assignment:

               userQuizResults["topic_" + topicId] = data;

           …after its awaited Firebase write. The old code POLLED that slot on a
           fixed budget, which made the test load-sensitive: under a full
           `npm test` (Chrome viewport suites running alongside) the budget
           expired and the run reported `undefined` as a score mismatch — an
           impatient test masquerading as a scoring regression.

           publishLatch() installs an accessor on exactly that key, so the wait
           ends on the assignment ITSELF, in the same tick it happens. There is
           no budget to outrun and nothing to tune. The bounded race below is a
           safety net only: it exists so a record that genuinely never arrives
           FAILS instead of hanging the suite for ever. */
        const latch = publishLatch(w, topicId);
        s._finish();
        const rec = (await latch.settled()) || {};
        const timedOut = latch.timedOut;
        ok(!timedOut, `topic ${topicId}@${want}: the legacy record was published`);

        const eng = spy.engine || {};
        const needed = w.__api.passNeeded(total);
        const legacyPassed = rec.score >= needed;

        const line = `    want ${String(want).padStart(3)}  engine ${String(eng.score).padStart(3)}/${eng.total}` +
                     `  legacy ${String(rec.score).padStart(3)}/${rec.total}` +
                     `  passed engine=${eng.passed} legacy=${legacyPassed}`;
        console.log(line);
        ok(eng.score === want, `topic ${topicId}: engine score is exactly ${want} (got ${eng.score})`);
        ok(eng.score === rec.score, `topic ${topicId}@${want}: engine score === legacy score`);
        ok(eng.total === rec.total, `topic ${topicId}@${want}: engine total === legacy total`);
        ok(eng.passed === legacyPassed, `topic ${topicId}@${want}: pass verdict agrees`);
        if (want === total) {
            ok(eng.score === eng.total,
                `topic ${topicId}: a PERFECT attempt scores ${total}/${total} — not zero`);
        }
    }
}

/* ------------------------------------------------------------------ 3. INDEPENDENCE */
async function independence(w, topicId) {
    const topic = w.__api.courseData.topics.find(t => t.id === topicId);
    const groups = w.__api.exData(topic).exercises || [];
    const keys = [];
    groups.forEach(g => (g.items || []).forEach((item, i) => keys.push({ item, key: g.id + '-' + i })));

    console.log(`\n  INDEPENDENCE FROM THE HIDDEN DOM — topic ${topicId}`);
    const scenarios = [
        ['hidden DOM wiped after mirroring', () => {
            const b = w.document.getElementById('a2LegacyBridge');
            if (b) b.innerHTML = '';
        }],
        ['hidden DOM node removed entirely', () => {
            const b = w.document.getElementById('a2LegacyBridge');
            if (b) b.remove();
        }],
        ['every mirrored input blanked', () => {
            w.document.querySelectorAll('[data-t1-input]').forEach(i => { i.value = ''; });
            w.document.querySelectorAll('.t1-opt.selected').forEach(o => o.classList.remove('selected'));
        }]
    ];

    for (const [label, corrupt] of scenarios) {
        w.__api.loadLesson(topicId);
        const spy = {};
        const s = mountSession(w, topicId, spy);
        const answers = {};
        keys.forEach(k => { answers[k.key] = correctValue(k.item); });
        s.answers = answers;

        /* mirror first, exactly as a real attempt does, THEN corrupt */
        const api = w.A2Host.create({
            getTopic: () => ({ id: topicId, exercises: groups }),
            getScope: () => w.document.getElementById('a2LegacyBridge')
        });
        keys.forEach((k, i) => {
            const g = groups.find(gr => k.key.indexOf(gr.id + '-') === 0);
            const idx = parseInt(k.key.slice(k.key.lastIndexOf('-') + 1), 10);
            try { api.writeLegacy(g, idx, answers[k.key]); } catch (e) {}
        });
        corrupt(w);

        s._finish();
        await new Promise(r => setTimeout(r, 60));
        const eng = spy.engine || {};
        console.log(`    ${label.padEnd(34)} engine ${eng.score}/${eng.total}`);
        ok(eng.score === keys.length,
            `${label}: engine still scores ${keys.length}/${keys.length} (got ${eng.score})`);
    }
}

/* ------------------------------------------------------------------ run */
(async () => {
    console.log('\n=== A2 SCORING PARITY & INDEPENDENCE ===');
    const w = boot('paid-courses/a2-course.html');
    w.__api.setCompleted([]);

    itemParity(w);
    await scoreParity(w, 1, [0, 1, 65, 66, 67, 110]);
    await independence(w, 1);

    console.log('\n' + '='.repeat(60));
    if (fail) {
        console.log(`  ❌ A2 SCORING PARITY: ${fail} failed / ${pass + fail}\n`);
        failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
        console.log('='.repeat(60) + '\n');
        process.exit(1);
    }
    console.log(`  ✅ A2 SCORING PARITY: ${pass}/${pass} passed`);
    console.log('='.repeat(60) + '\n');
    process.exit(0);
})();
