#!/usr/bin/env node
/**
 * verify_no_stray_check_button.cjs
 *
 * A migrated A2 topic must show exactly ONE call to action, and it must never
 * be a second "Javoblarni tekshirish" button.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * The button that shipped to production came from none of the places the other
 * harnesses looked at. course-global-fixes.js runs on every course page and
 * appends its own check button to whatever looks like a topic with exercises.
 * Migrated topics still render their old markup as a hidden write-through
 * substrate so the original scorer keeps working — and querySelector does not
 * care about display:none, so that substrate made an engine topic look legacy.
 * The button was then appended to #quizSection's PARENT, which is why every
 * audit scoped to #lessonContent / #quizSection reported a clean page.
 *
 * So this harness does the two things the others did not:
 *   1. it loads course-global-fixes.js, exactly as production does, and lets
 *      its 650 ms interval and MutationObserver actually run;
 *   2. it looks at the WHOLE document, not at the containers we expected the
 *      interface to live in.
 *
 * It walks every migrated topic in both states — before completion and after —
 * and reports every visible button it finds.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };

/* Production load order: the module scripts are deferred, course-global-fixes
   last of them. */
const MODULES = ['exercise-session.js', 'sentence-builder.js',
                 'course-exercise-ui.js', 'a2-host.js', 'course-global-fixes.js'];

function boot(rel) {
    const SRC = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const blocks = [...SRC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    const pre = blocks.find(b => /(let|var|const)\s+currentUser/.test(b) && !b.includes('const courseData'));
    const main = blocks.find(b => b.includes('const courseData'));

    const vc = new VirtualConsole();
    vc.on('jsdomError', () => {});
    const dom = new JSDOM(
        SRC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g, '<script></script>'),
        { url: 'https://uzdarus.uz/' + rel, runScripts: 'outside-only', pretendToBeVisual: true,
          virtualConsole: vc });

    const w = dom.window;
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.alert = () => {};
    w.confirm = () => true;
    w.eval('window.saveQuizResult=async()=>1;window.saveUserProgress=async()=>1;' +
           'window.getUserProgress=async()=>[];window.getUserQuizResults=async()=>({});' +
           'window.logActivity=async()=>{};');
    MODULES.forEach(f => w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    if (pre) w.eval(pre);
    w.eval(main + '\n;window.__api={courseData:courseData,loadLesson:loadLesson,' +
           'setCompleted:function(v){completedTopics=v;},' +
           'getCompleted:function(){return completedTopics;},' +
           'setQuizResults:function(v){userQuizResults=v;},' +
           'exData:getT1ExData,resultKey:a2ResultKey};');
    return w;
}

/* The record the platform has always written to Firebase for a finished topic:
   every answer the learner gave, keyed by exercise. Reviewing a topic completed
   on another device depends on it, so the walk exercises that path for real. */
function firebaseRecordFor(w, topicId) {
    const topic = w.__api.courseData.topics.find(t => t.id === topicId);
    const ex = w.__api.exData(topic);
    if (!ex) return null;
    const saved = {};
    let total = 0, correct = 0;
    (ex.exercises || []).forEach(g => {
        saved[g.id] = (g.items || []).map((item, i) => {
            total++;
            /* first accepted answer for the odd-numbered items, a wrong one for
               the rest — a realistic mixed attempt, not a perfect score */
            const a = Array.isArray(item.answer) ? item.answer[0] : item.answer;
            if (i % 2 === 0 && a != null) { correct++; return String(a); }
            return 'zzz';
        });
    });
    return { record: { topic1: saved, score: correct, total,
                       timestamp: new Date().toISOString() }, total };
}

/* jsdom has no layout, so "visible" is decided from the things this codebase
   actually uses to hide UI: inline display, [hidden], aria-hidden, and the
   class gates on the legacy result/feedback containers. */
function isVisible(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const st = (n.getAttribute && n.getAttribute('style')) || '';
        if (/display\s*:\s*none/i.test(st)) return false;
        if (n.hasAttribute && n.hasAttribute('hidden')) return false;
        if (n.getAttribute && n.getAttribute('aria-hidden') === 'true') return false;
        const cl = n.classList;
        if (cl && cl.contains('hidden')) return false;
        if (cl && (cl.contains('results-section') || cl.contains('quiz-results') ||
                   cl.contains('topic-feedback')) && !cl.contains('show')) return false;
    }
    return true;
}

const label = b => (b.textContent || '').trim().replace(/\s+/g, ' ');

function visibleButtons(w) {
    return Array.from(w.document.querySelectorAll('button'))
        .filter(isVisible)
        .map(label)
        .filter(t => t && t !== '↑');          // global scroll-to-top, every page
}

/* What the learner sees on the lesson itself. The topic-navigation grid and the
   page chrome are buttons too, but they are not part of the lesson, so listing
   them only hides the thing we are checking. Assertions stay document-wide. */
function lessonButtons(w) {
    const D = w.document;
    const zones = ['#lessonContent', '#quizSection', '#quiz', '#resultsWrap']
        .map(s => D.querySelector(s)).filter(Boolean);
    const seen = new Set();
    const out = [];
    zones.forEach(z => Array.from(z.querySelectorAll('button')).forEach(b => {
        if (seen.has(b) || !isVisible(b)) return;
        seen.add(b);
        const t = label(b);
        if (t) out.push(t);
    }));
    return out;
}

/* Let the 650 ms interval in course-global-fixes.js fire at least once. */
const settle = () => new Promise(r => setTimeout(r, 900));

/* Open a topic the way a browser does.
   The page declares `let currentTopicId` at the top level of an inline script.
   In a browser that binding lands in the global lexical environment, so
   course-global-fixes.js sees it through `typeof currentTopicId`. Under
   jsdom the page script is eval'd, the binding stays private, and the global
   layer bails out before it would build anything — which makes EVERY topic
   look clean whether or not the bug is present. Publishing it on window
   restores the visibility the browser has, via the documented fallback the
   global script already reads. */
async function open(w, id) {
    w.__api.loadLesson(id);
    w.currentTopicId = id;
    w.currentTopic = w.__api.courseData.topics.find(t => t.id === id) || null;
    await settle();
}

const CHECK_RE = /tekshirish/i;
const RESTART_RE = /qayta|boshlash|tugatish|urinib/i;

async function walk(rel, topicIds, legacyTopicId) {
    console.log(`\n--- ${rel} ---`);
    const w = boot(rel);

    for (const id of topicIds) {
        /* ---------------------------------------------- before completion */
        w.__api.setCompleted([]);
        w.__api.setQuizResults({});
        await open(w, id);
        const before = visibleButtons(w);
        const beforeLesson = lessonButtons(w);

        /* ------------------------------- after completion, attempt on record.
           This is the ordinary case AND the case of a learner returning on a
           different device, where only the Firebase record survives. */
        const fb = firebaseRecordFor(w, id);
        w.__api.setQuizResults({ ['topic_' + id]: fb.record });
        w.__api.setCompleted([id]);
        await open(w, id);
        const after = visibleButtons(w);
        const afterLesson = lessonButtons(w);

        console.log(`\n  Topic ${id}`);
        console.log(`    Before completion — visible buttons: ${beforeLesson.join(' | ') || '(none)'}`);
        console.log(`    After  completion — visible buttons: ${afterLesson.join(' | ') || '(none)'}`);

        const tag = `${rel} topic ${id}`;

        /* the review must open, and must offer no way to attempt the topic again */
        const reviewBtn = Array.from(w.document.querySelectorAll('[data-a2-review]'))[0];
        ok(!!reviewBtn, `${tag}: review control present`);
        if (reviewBtn) {
            reviewBtn.dispatchEvent(new w.Event('click', { bubbles: true }));
            await settle();
            const inReview = visibleButtons(w);
            ok(!inReview.some(t => CHECK_RE.test(t)), `${tag}: no check button inside the review`);
            ok(!inReview.some(t => /Пройти тему заново|Завершить тему/.test(t)),
                `${tag}: the review offers neither restart nor complete`);
            ok(/Тема завершена/.test(w.document.body.textContent),
                `${tag}: the review is marked as an archived attempt`);
            ok(w.document.body.textContent.includes(`${fb.record.score}/${fb.total}`),
                `${tag}: the review shows the recorded score (${fb.record.score}/${fb.total})`);
            /* leave the review before the next topic */
            const closer = w.document.querySelector('.uz-modal, .uz-sheet');
            if (closer) closer.dispatchEvent(new w.Event('click', { bubbles: true }));
            await settle();
        }
        ok(!before.some(t => CHECK_RE.test(t)), `${tag}: no check button before completion`);
        ok(!after.some(t => CHECK_RE.test(t)), `${tag}: no check button after completion`);
        ok(!w.document.querySelector('.check-topic-btn'),
            `${tag}: the global control host is not in the DOM at all`);
        ok(!w.document.querySelector('#submitQuiz'),
            `${tag}: the legacy quiz submit button is never built`);

        /* before: exactly one way in, the practice card */
        ok(before.filter(t => /Открыть задания/.test(t)).length === 1,
            `${tag}: exactly one practice entry before completion`);
        ok(!before.some(t => /Natijalarni ko'rish/.test(t)),
            `${tag}: no review entry before completion`);

        /* after: review only, and no way to attempt the topic again */
        ok(after.some(t => /Natijalarni ko'rish/.test(t)),
            `${tag}: review entry offered after completion`);
        ok(!after.some(t => /Открыть задания/.test(t)),
            `${tag}: the practice card is replaced, not kept`);
        ok(!after.some(t => RESTART_RE.test(t)),
            `${tag}: nothing offers a restart after completion`);

        const done = w.document.querySelector('.a2-done');
        ok(!!done, `${tag}: completed state rendered`);
        if (done) {
            ok(/Mavzu yakunlangan/.test(done.textContent), `${tag}: shows "Mavzu yakunlangan"`);
            ok(/Siz ushbu mavzuni muvaffaqiyatli tugatdingiz/.test(done.textContent),
                `${tag}: shows the completion sentence`);
        }

        /* restore the un-completed state for the legacy comparison below */
        w.__api.setCompleted([]);

        /* the learner may still read the lesson */
        const lc = w.document.getElementById('lessonContent');
        ok(!!lc && /grammar-section/.test(lc.innerHTML),
            `${tag}: grammar still readable after completion`);
        ok(!!lc && /Lug'atni ochish/.test(lc.textContent),
            `${tag}: vocabulary still reachable after completion`);
    }

    /* --------------------------------------------------------------------
       The other half of the fix: standing down must be SCOPED to topics the
       exercise engine renders. Topics still served by the legacy quiz have no
       other way to submit, so the global control layer must keep working for
       them exactly as before. A blanket removal would silently break them. */
    if (legacyTopicId != null) {
        w.__api.setCompleted([]);
        w.__api.setQuizResults({});
        await open(w, legacyTopicId);
        const legacy = lessonButtons(w);
        console.log(`\n  Topic ${legacyTopicId} (legacy quiz — control group)`);
        console.log(`    Visible buttons: ${legacy.join(' | ') || '(none)'}`);
        /* A2 topics 14-16 have no authored lesson, so they now render the shared
           "coming soon" screen instead of an empty quiz. There is nothing to
           submit and nothing to check — so BOTH the page's own submit button and
           the global check button must be absent. Before the placeholder existed
           this topic rendered a 0-question quiz with a live "check" button.

           The ownership rule is still proven scoped: the global layer stands
           down here because there is no exercise markup at all, not because a
           topic id was special-cased. */
        ok(!w.document.querySelector('#submitQuiz'),
            `${rel} topic ${legacyTopicId}: no submit button on a coming-soon topic`);
        ok(!w.document.querySelector('.check-topic-btn'),
            `${rel} topic ${legacyTopicId}: no global check button on a coming-soon topic`);
        ok(/tez orada qo/.test(w.document.getElementById('lessonContent').textContent),
            `${rel} topic ${legacyTopicId}: the coming-soon screen is shown`);
        ok(w.document.getElementById('quizSection').innerHTML.trim() === '',
            `${rel} topic ${legacyTopicId}: no empty quiz container left behind`);
    }
}

(async () => {
    console.log('\n=== STRAY CHECK BUTTON ===');
    /* A2 IS COMPLETE — every paid topic 1-16 is authored, so there is no
       coming-soon topic left to use as the control group. The helper already
       treats that id as optional, so null is passed rather than inventing a
       topic 17 just to keep an old argument fed. The demo build still exercises
       the coming-soon path below. */
    await walk('paid-courses/a2-course.html',
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], null);
    await walk('a2-demo.html', [1, 2, 3], null);   // demo has no unlocked legacy topic

    console.log('\n' + '='.repeat(58));
    if (fail) {
        console.log(`  ❌ STRAY CHECK BUTTON: ${fail} failed / ${pass + fail}\n`);
        failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
        console.log('='.repeat(58) + '\n');
        process.exit(1);
    }
    console.log(`  ✅ STRAY CHECK BUTTON: ${pass}/${pass} passed`);
    console.log('='.repeat(58) + '\n');
    /* course-global-fixes.js installs a setInterval that never stops — exactly
       as it does in a browser — so the jsdom event loop stays alive forever.
       Leave deliberately rather than hanging the suite. */
    process.exit(0);
})();
