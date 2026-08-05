'use strict';
/* ============================================================================
 * A2 · Lesson 2 «Oila va munosabatlar» — render, grading, completion
 * ==========================================================================*/
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const TARGET = process.argv[2] === 'demo' ? 'a2-demo.html' : 'paid-courses/a2-course.html';
const IS_DEMO = TARGET === 'a2-demo.html';
const SRC = fs.readFileSync(path.join(ROOT, TARGET), 'utf8');
console.log('\n=== ' + TARGET + ' · Topic 2 ===');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x ? '  → ' + x : '')); } };
const eq = (n, a, b) => ok(n, Object.is(a, b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

(async function run() {
const blocks = [...SRC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const pre = blocks.find(b => /(let|var|const)\s+currentUser/.test(b) && !b.includes('const courseData'));
const main = blocks.find(b => b.includes('const courseData'));
const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
const dom = new JSDOM(SRC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g, '<script></script>'),
  { url: 'https://uzdarus.uz/' + TARGET, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
w.HTMLElement.prototype.scrollIntoView = function () {};
w.alert = () => {};
w.eval("window.saveQuizResult=async()=>1;window.saveUserProgress=async()=>1;window.getUserProgress=async()=>[];window.getUserQuizResults=async()=>({});window.logActivity=async()=>{};");
if (pre) w.eval(pre);
let err = null;
try {
  w.eval(main + '\n;window.__api={courseData:courseData,loadQuiz:loadQuiz,loadLesson:loadLesson,getT1ExData:getT1ExData,' +
     'resetCompleted:function(){completedTopics.length=0;},isDone:function(i){return completedTopics.includes(i);},' +
     'quizResults:function(){return userQuizResults;}};');
} catch (e) { err = e; }
ok('module evaluates', !err, err && err.message);
if (err) process.exit(1);

const { courseData, loadQuiz, loadLesson, getT1ExData } = w.__api;
const t2 = courseData.topics.find(t => t.id === 2);
eq('topic 2 title', t2.title, 'Oila va munosabatlar');
eq('topic 2 free', t2.isLocked, false);
eq('topic 2 not subscription-locked', t2.isSubscriptionLocked, false);
ok('topic 2 uses the generic engine shape', Array.isArray(t2.topic2Exercises.exercises));
eq('engine claims topic 2', !!getT1ExData(t2), true);
ok('legacy quiz block removed from topic 2', !t2.quiz);
ok('legacy topic-2 renderer deleted from the file', !/function loadTopic2Exercises\s*\(/.test(SRC));
ok('legacy topic-2 scorer deleted from the file', !/window\.checkTopic2Exercises\s*=\s*function/.test(SRC));

const groups = t2.topic2Exercises.exercises;
eq('10 exercise groups (9 mashq + audio T/F)', groups.length, 10);
eq('100 graded questions', groups.reduce((s, g) => s + g.items.length, 0), 100);
groups.forEach(g => eq(`group ${g.id} has 10 items`, g.items.length, 10));
eq('group ids and order', JSON.stringify(groups.map(g => g.id)),
   JSON.stringify(['ex1','ex2','ex3','ex4','ex5','ex6','ex7','ex8','ex9','audio']));
eq('8-mashq is a word-order builder', groups.find(g => g.id === 'ex8').type, 'builder');
const audio = groups.find(g => g.id === 'audio');
eq('audio wired', audio.audioSrc, 'audios/%D0%902%202%20%D1%83%D1%80%D0%BE%D0%BA.mp3');
ok('audio file exists on disk', fs.existsSync(path.join(ROOT, decodeURIComponent(audio.audioSrc))));
ok('lesson 1 audio is a DIFFERENT file',
   audio.audioSrc !== courseData.topics.find(t => t.id === 1).topic1Exercises.exercises.find(g => g.id === 'audio').audioSrc);

// ---- render ----
loadLesson(2);
const lc = w.document.getElementById('lessonContent');
const qs = w.document.getElementById('quizSection');
ok('grammar rendered', !!lc.querySelector('.t1g-hero-title'));
ok('past-tense suffix table rendered', lc.textContent.includes('-ла') && lc.textContent.includes('-ли'));
ok('быть forms rendered', ['был','была','было','были'].every(f => lc.textContent.includes(f)));
ok('negation section rendered', lc.textContent.includes('не + o‘tgan zamon'));
ok('question section rendered', lc.textContent.includes('Ты жил в Самарканде?'));
ok('all possessive tables rendered', ['мой','твой','наш','ваш','его','её','их'].every(x => lc.textContent.includes(x)));
ok('gender-agreement block rendered', lc.textContent.includes('моё имя') && lc.textContent.includes('мои родители'));
ok('family possessives table rendered', lc.textContent.includes('mening ota-onam'));
ok('10 family examples rendered', lc.textContent.includes('Наши дети выросли очень быстро.'));
ok('его/её/их invariance highlighted', lc.textContent.includes('hech qachon o'.concat("'zgarmaydi")));
ok('no template placeholder leaked', !lc.textContent.includes('${'));
ok('exercises rendered', !!qs.querySelector('.t1-wrap'));
eq('10 exercise cards', qs.querySelectorAll('.t1-card').length, 10);
eq('audio player present once', qs.querySelectorAll('audio').length, 1);
eq('audio src resolved for this page',
   qs.querySelector('audio source').getAttribute('src'),
   (IS_DEMO ? '' : '../') + 'audios/%D0%902%202%20%D1%83%D1%80%D0%BE%D0%BA.mp3');
eq('builder widgets rendered', qs.querySelectorAll('.t1-builder').length, 10);
eq('choice rows rendered', qs.querySelectorAll('.t1-opts').length, 30);
eq('text inputs rendered (6 input groups x 10)', qs.querySelectorAll('input.t1-input').length, 60);
ok('every question numbered', qs.querySelectorAll('.t1-num').length === 100);

// ---- grading ----
w.eval('window.__saved=null;window.saveQuizResultToFirebase=async function(i,d){window.__saved={id:i,d:d};};window.saveProgressToFirebase=async function(){window.__ps=true;};');
function fill(correct) {
  groups.forEach(g => g.items.forEach((item, i) => {
    const key = g.id + '-' + i;
    const first = Array.isArray(item.answer) ? item.answer[0] : item.answer;
    if (g.type === 'choice') {
      const row = qs.querySelector('[data-t1-row="' + key + '"]');
      const btns = [...row.querySelectorAll('.t1-opt')];
      btns.forEach(b => b.classList.remove('selected'));
      const t = correct ? btns.find(b => b.getAttribute('data-value') === first)
                        : btns.find(b => b.getAttribute('data-value') !== first);
      if (t) t.classList.add('selected');
    } else if (g.type === 'builder') {
      const hid = qs.querySelector('[data-t1-input="' + key + '"]');
      hid.value = correct ? first : 'зззз ыыыы аааа';
    } else {
      qs.querySelector('[data-t1-input="' + key + '"]').value = correct ? first : (item.free ? 'x' : 'zzz');
    }
  }));
}
fill(true);
await w.checkTopic2Exercises(2);
const s = w.document.getElementById('scoreDisplay').textContent;
eq('perfect run scores 100/100', s, 'Sizning natijangiz: 100/100 (100%)');
ok('never "0/0"', !/0\/0/.test(s));
eq('saved via the production persistence path', w.__saved && w.__saved.id, 2);
eq('saved score', w.__saved && w.__saved.d.score, 100);
eq('saved total', w.__saved && w.__saved.d.total, 100);
/* The engine stores the per-group answer map under the literal key `topic1`
   for EVERY topic — inherited verbatim from b1-course.html. It is only a label:
   the Firestore document is already per-topic (quizResults/topic_<id>), and
   nothing reads this key as a topic identifier. Asserted as-is so a future
   rename is a deliberate, visible change rather than silent drift. */
ok('per-group answers persisted (engine label: topic1)',
   w.__saved.d.topic1 && Object.keys(w.__saved.d.topic1).length === 10);
eq('cached for reload', w.__api.quizResults()['topic_2'].score, 100);
eq('completion offered', w.document.getElementById('completeBtn').textContent, 'Mavzuni tugatish');
w.__api.resetCompleted();
w.document.getElementById('completeBtn').onclick();
await new Promise(r => setTimeout(r, 20));
ok('topic 2 recorded complete', w.__api.isDone(2));
ok('progress persisted', !!w.__ps);

w.__api.resetCompleted();
fill(false);
await w.checkTopic2Exercises(2);
eq('completion refused on a bad run', w.document.getElementById('completeBtn').textContent, 'Mavzu tugatilmadi');
ok('not silently completed', !w.__api.isDone(2));

// gender variants must both be accepted
const norm = (v) => String(v).toLowerCase().replace(/ё/g,'е').replace(/[.,!?;:()"'«»—–\-]/g,' ').replace(/\s+/g,' ').trim();
const acc = (item, v) => (Array.isArray(item.answer) ? item.answer : [item.answer]).some(a => norm(a) === norm(v));
ok('ex1 #7 accepts познакомился AND познакомилась',
   acc(groups[0].items[6], 'познакомился') && acc(groups[0].items[6], 'познакомилась'));
ok('ex3 #4 accepts жил AND жила',
   acc(groups[2].items[3], 'Я не жил в Москве') && acc(groups[2].items[3], 'Я не жила в Москве'));

console.log('\n' + '─'.repeat(62));
console.log(fail === 0 ? `  ✅ A2 L2 (${TARGET}): ${pass}/${pass} passed` : `  ❌ A2 L2 (${TARGET}): ${fail} failed / ${pass + fail}`);
process.exit(fail ? 1 : 0);
})();
