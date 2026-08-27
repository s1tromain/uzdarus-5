'use strict';
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const TARGET = process.argv[2] === 'demo' ? 'a2-demo.html' : 'paid-courses/a2-course.html';
const IS_DEMO = TARGET === 'a2-demo.html';
const SRC = fs.readFileSync(path.join(ROOT, TARGET), 'utf8');
console.log('\n=== ' + TARGET + ' ===');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x ? '  → ' + x : '')); } };
const eq = (n, a, b) => ok(n, Object.is(a, b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

// Pull the big inline script (the one carrying courseData + the engine).
const blocks = [...SRC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const main = blocks.find(b => b.includes('const courseData'));
ok('found the courseData script block', !!main);
// Top-level let/const in a classic script live in the SHARED global lexical
// environment, so the engine (block 1) legitimately reads `currentUser`
// declared in block 0. Evaluate the preamble too or the harness diverges
// from the real page.
const preamble = blocks.find(b => /(let|var|const)\s+currentUser/.test(b) && b !== main);
ok('found the preamble script block', !!preamble);

const vc = new VirtualConsole();
vc.on('jsdomError', e => { if (!/Not implemented/.test(String(e.message))) console.error('JSDOM:', e.message); });
(async function runSuite(){
const dom = new JSDOM(SRC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g, '<script></script>'), {
  url: IS_DEMO ? 'https://uzdarus.uz/a2-demo.html' : 'https://uzdarus.uz/paid-courses/a2-course.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc,
});
const w = dom.window;
w.HTMLElement.prototype.scrollIntoView = function () {};
w.alert = () => {};
w.localStorage.setItem('currentUser', JSON.stringify({ id: 'dev1', uid: 'dev1', name: 'Dev', email: 'dev@uzdarus.local', role: 'developer' }));

// Stub the network/platform pieces the module touches at load time.
w.eval(`
  window.firebaseUtils = {};
  window.saveQuizResult = async () => true;
  window.saveUserProgress = async () => true;
  window.getUserProgress = async () => [];
  window.getUserQuizResults = async () => ({});
  window.logActivity = async () => {};
  window.uzTrack = function (t, d) { (window.__ev = window.__ev || []).push({ t: t, d: d }); };
`);

let err = null;
try { w.eval(preamble); w.eval(main + '\n;window.__api = { courseData: courseData, getT1ExData: getT1ExData, loadQuiz: loadQuiz, resetCompleted: function(){ completedTopics.length = 0; }, isDone: function(id){ return completedTopics.includes(id); }, quizResults: function(){ return userQuizResults; } };'); } catch (e) { err = e; }
ok('main script evaluates without throwing', !err, err && (err.message + '\n' + String(err.stack).split('\n').slice(0,4).join('\n')));
if (err) { console.log('\n  ABORT'); process.exit(1); }

const cd = w.__api && w.__api.courseData;
ok('courseData exposed', !!cd && Array.isArray(cd.topics));
const t1 = cd.topics.find(t => t.id === 1);
ok('topic 1 present', !!t1);
eq('topic 1 title', t1.title, '«У меня есть» va kundalik hayotim');
eq('topic 1 is free (demo/paid open)', t1.isLocked, false);
eq('topic 1 not subscription-locked', t1.isSubscriptionLocked, false);
ok('topic 1 has generic exercises array', Array.isArray(t1.topic1Exercises.exercises));
ok('legacy quiz block removed from topic 1', !t1.quiz);

// --- shape-discriminated lookup must NOT swallow legacy topics 2 & 3 ---
eq('engine claims topic 1', !!w.__api.getT1ExData(t1), true);
/* Topic 2 joined the engine with Lesson 2; Topic 3 is still legacy, and the
   shape-discriminated lookup is what keeps it that way. */
eq('engine claims topic 2 (Lesson 2 is on the engine)', !!w.__api.getT1ExData(cd.topics.find(t => t.id === 2)), true);
eq('engine claims topic 3 (Lesson 3 is on the engine)', !!w.__api.getT1ExData(cd.topics.find(t => t.id === 3)), true);
/* Lesson 4 is PAID-ONLY, so topic 4 is engine-driven in the course build and
   still an untouched placeholder in the demo. */
eq(`engine claims topic 4 = ${!IS_DEMO}`, !!w.__api.getT1ExData(cd.topics.find(t => t.id === 4)), !IS_DEMO);
eq(`engine claims topic 5 = ${!IS_DEMO}`, !!w.__api.getT1ExData(cd.topics.find(t => t.id === 5)), !IS_DEMO);
/* Topic 6 was an empty placeholder and therefore unclaimed; it is now a fully
   authored engine topic, so the engine MUST claim it. The next unauthored
   topic takes over the job of proving the lookup still refuses empties. */
/* Lesson 6 is PAID content: the paid build carries it and the engine claims
   it; the demo, which ships topics 1-3, still has it as a placeholder that
   the shape-discriminated lookup must keep refusing. */
eq('engine claims topic 6 in the paid build only',
   !!w.__api.getT1ExData(cd.topics.find(t => t.id === 6)), !IS_DEMO);
eq('engine claims topic 7 in the paid build only',
   !!w.__api.getT1ExData(cd.topics.find(t => t.id === 7)), !IS_DEMO);
eq('engine claims topic 8 in the paid build only',
   !!w.__api.getT1ExData(cd.topics.find(t => t.id === 8)), !IS_DEMO);
eq('engine claims topic 9 in the paid build only',
   !!w.__api.getT1ExData(cd.topics.find(t => t.id === 9)), !IS_DEMO);
eq('engine claims topic 10 in the paid build only',
   !!w.__api.getT1ExData(cd.topics.find(t => t.id === 10)), !IS_DEMO);
eq('engine claims topic 11 in the paid build only',
   !!w.__api.getT1ExData(cd.topics.find(t => t.id === 11)), !IS_DEMO);
eq('engine claims topic 12 in the paid build only',
   !!w.__api.getT1ExData(cd.topics.find(t => t.id === 12)), !IS_DEMO);
eq('engine claims topic 13 in the paid build only',
   !!w.__api.getT1ExData(cd.topics.find(t => t.id === 13)), !IS_DEMO);
eq('engine claims topic 14 in the paid build only',
   !!w.__api.getT1ExData(cd.topics.find(t => t.id === 14)), !IS_DEMO);
eq('engine claims topic 15 in the paid build only',
   !!w.__api.getT1ExData(cd.topics.find(t => t.id === 15)), !IS_DEMO);
eq('engine claims topic 16 in the paid build only',
   !!w.__api.getT1ExData(cd.topics.find(t => t.id === 16)), !IS_DEMO);
/* A2 is complete: there is no topic 17 to refuse, and none was invented. */
ok('no topic beyond 16 exists', !cd.topics.some(t => t.id > 16));
ok('topic-2 scorer resolves (engine alias)', typeof w.checkTopic2Exercises === 'function');
ok('topic-3 scorer resolves (engine alias)', typeof w.checkTopic3Exercises === 'function');

// --- content completeness vs the resource ---
const groups = t1.topic1Exercises.exercises;
eq('11 exercise groups (10 mashq + audio T/F)', groups.length, 11);
const items = groups.reduce((s, g) => s + g.items.length, 0);
eq('110 graded questions', items, 110);
groups.forEach(g => eq(`group ${g.id} has 10 items`, g.items.length, 10));
const audio = groups.find(g => g.id === 'audio');
ok('audio group exists', !!audio);
eq('audio group is True/False styled', audio.style, 'tf');
eq('audio source wired', audio.audioSrc, 'audios/%D0%902%201%20%D1%83%D1%80%D0%BE%D0%BA.mp3');
ok('audio file exists on disk',
   fs.existsSync(path.join(ROOT, decodeURIComponent(audio.audioSrc))));
const TF = ['Правда','Ложь','Правда','Ложь','Правда','Ложь','Правда','Ложь','Правда','Правда'];
audio.items.forEach((it, i) => {
  eq(`T/F #${i + 1} key matches the resource`, it.answer, TF[i]);
  eq(`T/F #${i + 1} offers both options`, it.options.join('|'), 'Правда|Ложь');
});

// --- render ---
w.__api.loadQuiz(1);
const qs = w.document.getElementById('quizSection');
ok('engine rendered into #quizSection', qs.innerHTML.includes('t1-wrap'));
eq('rendered exercise cards', qs.querySelectorAll('.t1-card').length, 11);
eq('rendered text inputs', qs.querySelectorAll('.t1-input').length, 90);
eq('rendered option buttons', qs.querySelectorAll('.t1-opt').length, 10 * 3 + 10 * 2);
ok('audio player rendered', !!qs.querySelector('audio source'));
eq('audio src resolved for this page location',
   qs.querySelector('audio source').getAttribute('src'),
   (IS_DEMO ? '' : '../') + 'audios/%D0%902%201%20%D1%83%D1%80%D0%BE%D0%BA.mp3');
ok('no legacy quiz markup leaked in', !qs.querySelector('.quiz-option'));
ok('styles injected once', !!w.document.getElementById('t1-styles'));
w.__api.loadQuiz(1);
eq('re-render does not duplicate style tags', w.document.querySelectorAll('#t1-styles').length, 1);
eq('re-render does not duplicate cards', w.document.getElementById('quizSection').querySelectorAll('.t1-card').length, 11);


// ============================ GRADING + COMPLETION ============================
console.log('\n[G] Grading, feedback and completion');
/* STUB THE NETWORK, NOT THE PAGE'S OWN FUNCTION.
   saveProgressToFirebase used to be replaced wholesale, which meant the thing
   under test never ran: the page pushed the topic id locally anyway, so the
   stub's silence did not show. Completion now comes from the SERVER's array,
   so replacing the function removes the only thing that could set it. The
   component call is stubbed instead and the real saveProgressToFirebase runs,
   which is what the learner's browser does. */
w.eval("window.__saved = null;" +
  " window.saveQuizResultToFirebase = async function(id, d){ window.__saved = { id: id, d: d }; };");
if (IS_DEMO) {
    /* THE DEMO HAS NO SERVER. It keeps the legacy whole-topic flow on purpose,
       so it is stubbed the way it has always been rather than bent into the
       paid component contract. */
    w.eval("window.saveProgressToFirebase = async function(){ window.__progressSaved = true; return true; };");
} else {
    /* THE PAID PAGE: stub the NETWORK, not the page's own function.
       saveProgressToFirebase used to be replaced wholesale, which meant the
       thing under test never ran — the page pushed the topic id locally anyway,
       so the stub's silence did not show. Completion now comes from the
       SERVER's array, so replacing the function removes the only thing that
       could set it. The component call is stubbed instead and the real
       saveProgressToFirebase runs, which is what the learner's browser does. */
    w.eval("window.currentUserId = 'uid-smoke';" +
      " window.completeCourseTopic = async function(){ return []; };" +
      " window.completeCourseComponent = async function(course, topicId, component){" +
      "   window.__progressSaved = true;" +
      "   window.__componentCalls = (window.__componentCalls || []);" +
      "   window.__componentCalls.push({ course: course, topicId: topicId, component: component });" +
      "   return { ok: true, course: course, topicId: topicId, component: component," +
      "     components: { vocabularyCompleted: true, exercisesCompleted: true }," +
      "     topicCompleted: true, completedTopics: [topicId], nextTopic: topicId + 1 };" +
      " };");
}

function fillAll(correct) {
  groups.forEach(g => g.items.forEach((item, i) => {
    const key = g.id + '-' + i;
    if (g.type === 'choice') {
      const row = qs.querySelector('[data-t1-row="' + key + '"]');
      const want = Array.isArray(item.answer) ? item.answer[0] : item.answer;
      const btns = [...row.querySelectorAll('.t1-opt')];
      const target = correct
        ? btns.find(b => b.getAttribute('data-value') === want)
        : btns.find(b => b.getAttribute('data-value') !== want);
      btns.forEach(b => b.classList.remove('selected'));
      if (target) target.classList.add('selected');
    } else {
      const inp = qs.querySelector('[data-t1-input="' + key + '"]');
      inp.value = correct ? (Array.isArray(item.answer) ? item.answer[0] : item.answer) : 'zzz';
    }
  }));
}

// --- every key marked correct when the documented answer is given ---
fillAll(true);
await w.checkTopic1Exercises(1);
const scoreTxt = w.document.getElementById('scoreDisplay').textContent;
eq('perfect run scores 110/110', scoreTxt, 'Sizning natijangiz: 110/110 (100%)');
ok('no "0/0" score is ever produced', !/0\/0/.test(scoreTxt));
ok('result saved through the existing persistence path', !!w.__saved);
eq('saved under the right topic id', w.__saved && w.__saved.id, 1);
eq('saved score', w.__saved && w.__saved.d.score, 110);
eq('saved total', w.__saved && w.__saved.d.total, 110);
ok('saved payload carries a timestamp', !!(w.__saved && w.__saved.d.timestamp));
ok('answers persisted per exercise group',
   w.__saved && Object.keys(w.__saved.d.topic1).length === 11);
eq('cached in userQuizResults for reload', w.__api.quizResults()['topic_1'].score, 110);
const btn = w.document.getElementById('completeBtn');
eq('completion offered on a pass', btn.textContent, 'Mavzuni tugatish');
ok('completion button visible', btn.style.display === 'block');
eq('inputs marked correct', qs.querySelectorAll('.t1-input.correct').length, 90);
eq('no input marked incorrect', qs.querySelectorAll('.t1-input.incorrect').length, 0);
eq('correct options marked ok', qs.querySelectorAll('.t1-opt.t1-ok').length, 20);

// --- unlocking ---
w.__api.resetCompleted();
btn.onclick();
await new Promise(r => setTimeout(r, 20));
/* THE SAVE'S ANSWER IS NOW LOAD-BEARING. The page used to push the topic id
   locally and then save, ignoring the result, so a refused save still showed the
   topic finished. It now completes only on a save that reported success — which
   is what the shipped saveProgressToFirebase returns — so the stub above has to
   answer like the real one. */
ok('topic 1 recorded as completed', w.__api.isDone(1));
ok('progress persisted', !!w.__progressSaved);
/* and it was reported as the EXERCISES HALF of this topic, under A2 — the
   whole-topic claim no longer completes anything server-side. */
if (!IS_DEMO) {
    const c = (w.__componentCalls || [])[0];
    ok('the completion reported a component', !!c);
    eq('under course A2', c && c.course, 'A2');
    eq('for topic 1', c && c.topicId, 1);
    eq('and it is the exercises half', c && c.component, 'exercises');
}

// --- failing run must NOT complete ---
w.__api.resetCompleted();
fillAll(false);
await w.checkTopic1Exercises(1);
const failTxt = w.document.getElementById('scoreDisplay').textContent;
ok('a wrong run scores low', /: (0|[1-9]|[1-9][0-9])\/110/.test(failTxt));
eq('completion refused', w.document.getElementById('completeBtn').textContent, 'Mavzu tugatilmadi');
ok('topic not silently completed', !w.__api.isDone(1));

// --- answer-key sanity: no unreachable key ---
let unreachable = 0;
groups.filter(g => g.type === 'choice').forEach(g => g.items.forEach(it => {
  const keys = Array.isArray(it.answer) ? it.answer : [it.answer];
  if (!keys.some(k => it.options.includes(k))) unreachable++;
}));
eq('every choice answer key exists among its options', unreachable, 0);
let blankKey = 0;
groups.forEach(g => g.items.forEach(it => {
  const keys = Array.isArray(it.answer) ? it.answer : [it.answer];
  if (!keys.length || keys.some(k => !String(k || '').trim())) blankKey++;
}));
eq('no exercise ships an empty answer key', blankKey, 0);

console.log('\n' + '─'.repeat(60));
console.log(fail === 0 ? `  ✅ A2 L1 SMOKE (${TARGET}): ${pass}/${pass} passed` : `  ❌ A2 L1 SMOKE (${TARGET}): ${fail} failed / ${pass + fail}`);
console.log('─'.repeat(60));
process.exit(fail ? 1 : 0);
})();
