#!/usr/bin/env node
/**
 * verify_a2_persistence_completion.cjs — STEP 4 and STEP 5.
 *
 * Persistence and completion were lifted out of the legacy scorer into
 * a2PersistAttempt() and a2CompleteTopic(). Nothing about the stored data or
 * the completion semantics was allowed to change, so this suite pins both.
 *
 * It runs with a REAL currentUserId so the Firebase branch is taken rather than
 * the localStorage fallback. The Firebase SDK itself is stubbed and its call
 * arguments are asserted — the network write is NOT exercised and is reported
 * as UNVERIFIED rather than claimed.
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
const UID = 'uid-test-1';

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
    w.eval('window.__fb={quiz:[],progress:[]};window.__ls=[];' +
           'window.currentUserId="' + UID + '";' +
           'window.saveQuizResult=async function(uid,topicId,data,course){' +
           ' window.__fb.quiz.push({uid:uid,topicId:topicId,data:data,course:course}); return 1;};' +
           'window.saveUserProgress=async function(uid,course,payload){' +
           ' window.__fb.progress.push({uid:uid,course:course,payload:payload}); return 1;};' +
           'window.getUserProgress=async()=>({completedTopics:[]});' +
           'window.getUserQuizResults=async()=>({});window.logActivity=async()=>{};');
    /* jsdom returns a fresh Storage object on every `localStorage` access, so
       patching the instance is lost. Patch the prototype. */
    const proto = w.Storage.prototype;
    const setItem = proto.setItem;
    proto.setItem = function (k, v) { w.__ls.push(k); return setItem.call(this, k, v); };
    MODULES.forEach(f => w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    if (pre) w.eval(pre);
    w.eval(main + '\n;window.__api={courseData:courseData,loadLesson:loadLesson,' +
           'setCompleted:function(v){completedTopics=v;},getCompleted:function(){return completedTopics;},' +
           'uqr:function(){return userQuizResults;},exData:getT1ExData,' +
           'toRecord:(typeof a2AnswersToRecord==="function")?a2AnswersToRecord:null,' +
           'persist:(typeof a2PersistAttempt==="function")?a2PersistAttempt:null,' +
           'complete:(typeof a2CompleteTopic==="function")?a2CompleteTopic:null};');
    /* AFTER the page script: its own init assigns window.currentUserId = null,
       which would silently push every write onto the localStorage fallback and
       leave the Firebase branch untested. */
    w.eval('window.currentUserId="' + UID + '";');
    return w;
}

function correctValue(item) {
    const a = Array.isArray(item.answer) ? item.answer[0] : item.answer;
    if (a == null || String(a).trim() === '' || item.free) return 'я думаю что это интересно';
    return String(a);
}

function answersFor(w, topicId) {
    const topic = w.__api.courseData.topics.find(t => t.id === topicId);
    const groups = w.__api.exData(topic).exercises || [];
    const answers = {};
    groups.forEach(g => (g.items || []).forEach((item, i) => {
        answers[g.id + '-' + i] = correctValue(item);
    }));
    return { answers, groups, total: Object.keys(answers).length };
}

(async () => {
    console.log('\n=== A2 PERSISTENCE + COMPLETION (STEP 4 / STEP 5) ===');

    for (const rel of ['paid-courses/a2-course.html', 'a2-demo.html']) {
        const w = boot(rel);
        const TOPIC = 1;
        console.log(`\n--- ${rel} ---`);

        ok(typeof w.__api.persist === 'function', `${rel}: a2PersistAttempt exists`);
        ok(typeof w.__api.complete === 'function', `${rel}: a2CompleteTopic exists`);
        ok(typeof w.__api.toRecord === 'function', `${rel}: a2AnswersToRecord exists`);
        if (!w.__api.persist) continue;

        w.__api.setCompleted([]);
        w.__api.loadLesson(TOPIC);
        const { answers, groups, total } = answersFor(w, TOPIC);

        /* ---------------------------------------------------- STEP 4 */
        const rec = await w.__api.persist(TOPIC, answers, { score: total, total: total });

        console.log(`  record keys        : ${JSON.stringify(Object.keys(rec))}`);
        ok(JSON.stringify(Object.keys(rec)) === JSON.stringify(['topic1', 'score', 'total', 'timestamp']),
            `${rel}: record field names and order unchanged`);
        ok(rec.score === total && rec.total === total, `${rel}: score/total carried through`);
        ok(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(rec.timestamp), `${rel}: ISO timestamp format`);

        const groupIds = groups.map(g => g.id);
        ok(JSON.stringify(Object.keys(rec.topic1)) === JSON.stringify(groupIds),
            `${rel}: topic1 keyed by group id, in order`);
        let shapeBad = 0;
        groups.forEach(g => {
            const arr = rec.topic1[g.id];
            if (!Array.isArray(arr) || arr.length !== (g.items || []).length) shapeBad++;
            (arr || []).forEach((v, i) => {
                if (typeof v !== 'string') shapeBad++;
                if (v !== String(answers[g.id + '-' + i]).trim()) shapeBad++;
            });
        });
        ok(shapeBad === 0, `${rel}: every answer stored as a trimmed string in item order (${shapeBad} bad)`);

        ok(w.__api.uqr()['topic_' + TOPIC] === rec, `${rel}: userQuizResults holds the same object`);

        const fbCall = w.__fb.quiz[w.__fb.quiz.length - 1];
        ok(!!fbCall, `${rel}: the Firebase write path was taken (real uid, not the fallback)`);
        if (fbCall) {
            ok(fbCall.uid === UID, `${rel}: Firebase called with the real user id`);
            ok(fbCall.topicId === TOPIC, `${rel}: Firebase called with the topic id`);
            ok(fbCall.course === 'A2', `${rel}: Firebase called with course "A2"`);
            ok(fbCall.data === rec, `${rel}: Firebase received the identical record`);
        }

        /* ---------------------------------------------------- STEP 5 */
        ok(w.__api.getCompleted().indexOf(TOPIC) === -1, `${rel}: not completed before`);
        const progressBefore = w.__fb.progress.length;

        await w.__api.complete(TOPIC);
        await new Promise(r => setTimeout(r, 120));

        ok(w.__api.getCompleted().indexOf(TOPIC) !== -1, `${rel}: completedTopics contains the topic after`);
        ok(w.__fb.progress.length === progressBefore + 1, `${rel}: exactly one progress write`);
        const pg = w.__fb.progress[w.__fb.progress.length - 1];
        if (pg) {
            ok(pg.uid === UID && pg.course === 'A2', `${rel}: progress written for the real user, course A2`);
            ok(Array.isArray(pg.payload.completedTopics)
               && pg.payload.completedTopics.indexOf(TOPIC) !== -1,
                `${rel}: progress payload carries the completed topic`);
            ok(typeof pg.payload.lastUpdated === 'string', `${rel}: progress payload keeps lastUpdated`);
        }

        /* repeat completion must not duplicate */
        await w.__api.complete(TOPIC);
        await new Promise(r => setTimeout(r, 120));
        const occurrences = w.__api.getCompleted().filter(x => x === TOPIC).length;
        ok(occurrences === 1, `${rel}: repeat completion does not duplicate the topic (${occurrences})`);
        ok(w.__fb.progress.length === progressBefore + 1,
            `${rel}: repeat completion writes no second progress record`);

        /* unlock: topic 2 must no longer be sequence-locked */
        const locked = w.__api.courseData.topics.find(t => t.id === TOPIC + 1);
        ok(w.__api.getCompleted().includes(TOPIC),
            `${rel}: next topic's unlock precondition satisfied (topic ${TOPIC} completed)`);
        ok(!!locked, `${rel}: next topic exists`);

        /* localStorage keys unchanged */
        const keys = Array.from(new Set(w.__ls));
        const progressKey = keys.some(k => k === 'a2_progress_' + UID);
        console.log(`  localStorage keys  : ${JSON.stringify(keys.slice(0, 6))}`);
        ok(progressKey, `${rel}: progress localStorage key is still a2_progress_<uid>`);

        /* completed topic reopens to review, never to a new attempt */
        w.__api.loadLesson(TOPIC);
        await new Promise(r => setTimeout(r, 120));
        const visible = el => {
            for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
                const st = (n.getAttribute && n.getAttribute('style')) || '';
                if (/display\s*:\s*none/i.test(st)) return false;
                if (n.getAttribute && n.getAttribute('aria-hidden') === 'true') return false;
            }
            return true;
        };
        const btns = Array.from(w.document.querySelectorAll('#quizSection button'))
            .filter(visible).map(b => (b.textContent || '').trim()).filter(Boolean);
        console.log(`  after completion   : ${btns.join(' | ') || '(none)'}`);
        ok(btns.some(t => /Natijalarni ko'rish/.test(t)), `${rel}: review entry offered`);
        ok(!btns.some(t => /Открыть задания/.test(t)), `${rel}: no new attempt offered`);
        ok(!btns.some(t => /tekshirish/i.test(t)), `${rel}: no check button`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('  NOTE: the Firebase SDK is stubbed. Call arguments are asserted;');
    console.log('        the remote network write itself is UNVERIFIED here.');
    if (fail) {
        console.log(`\n  ❌ A2 PERSISTENCE + COMPLETION: ${fail} failed / ${pass + fail}\n`);
        failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
        console.log('='.repeat(60) + '\n');
        process.exit(1);
    }
    console.log(`  ✅ A2 PERSISTENCE + COMPLETION: ${pass}/${pass} passed`);
    console.log('='.repeat(60) + '\n');
    process.exit(0);
})();
