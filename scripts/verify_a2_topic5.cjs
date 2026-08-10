'use strict';
/* ============================================================================
 * A2 · Lesson 5 «Kasblar va mashg'ulotlar» — PAID ONLY.
 * Lesson 4+ does not exist in the demo, so this suite also asserts that the
 * demo build and the demo vocabulary were NOT touched.
 * ==========================================================================*/
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const TARGET = 'paid-courses/a2-course.html';
const SRC = fs.readFileSync(path.join(ROOT, TARGET), 'utf8');
console.log('\n=== ' + TARGET + ' · Topic 5 (paid only) ===');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x ? '  → ' + x : '')); } };
const eq = (n, a, b) => ok(n, Object.is(a, b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

(async function run() {
const blocks = [...SRC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const pre = blocks.find(b => /(let|var|const)\s+currentUser/.test(b) && !b.includes('const courseData'));
const main = blocks.find(b => b.includes('const courseData'));
const errs = [];
const vc = new VirtualConsole(); vc.on('jsdomError', e => errs.push(String(e.message)));
const dom = new JSDOM(SRC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g, '<script></script>'),
  { url: 'https://uzdarus.uz/' + TARGET, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
w.HTMLElement.prototype.scrollIntoView = function () {}; w.alert = () => {};
w.eval("window.saveQuizResult=async()=>1;window.saveUserProgress=async()=>1;window.getUserProgress=async()=>[];window.getUserQuizResults=async()=>({});window.logActivity=async()=>{};");
/* production loads these via <script>; the harness must too, or the shared
   components (vocabulary card, exercise UI) are simply absent */
['shared-normalizer.js','exercise-session.js','sentence-builder.js','course-exercise-ui.js','a2-host.js']
  .forEach(f => w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
if (pre) w.eval(pre);
let err = null;
try {
  w.eval(main + '\n;window.__api={courseData:courseData,loadQuiz:loadQuiz,loadLesson:loadLesson,getT1ExData:getT1ExData,' +
    'resetCompleted:function(){completedTopics.length=0;},isDone:function(i){return completedTopics.includes(i);},' +
    'quizResults:function(){return userQuizResults;}};');
} catch (e) { err = e; }
ok('module evaluates without throwing', !err, err && err.message);
if (err) process.exit(1);
ok('no runtime errors during load', errs.length === 0, errs.join(' | '));

const { courseData, loadLesson, getT1ExData } = w.__api;
const t5 = courseData.topics.find(t => t.id === 5);
eq('topic 5 title', t5.title, "Kasblar va mashg'ulotlar");
ok('topic 5 uses the generic engine shape', Array.isArray(t5.topic5Exercises.exercises));
eq('engine claims topic 5', !!getT1ExData(t5), true);
ok('legacy quiz block removed from topic 5', !t5.quiz);
ok('the subscription-upsell placeholder is gone',
   !/Bu mavzu ochiq emas/.test(t5.content) && t5.grammar.length > 5000);
eq('access flags unchanged (paid)', `${t5.isLocked}/${t5.isSubscriptionLocked}`, 'false/false');
eq('topic 6 still a locked placeholder', courseData.topics.find(t => t.id === 6).grammar, '');
ok('topics 6-16 untouched (still upsell placeholders)',
   courseData.topics.filter(t => t.id >= 6).every(t => t.grammar === '' && !getT1ExData(t)));

const groups = t5.topic5Exercises.exercises;
eq('11 exercise groups (10 mashq + audio)', groups.length, 11);
eq('110 graded questions', groups.reduce((s, g) => s + g.items.length, 0), 110);
groups.forEach(g => eq(`group ${g.id} has 10 items`, g.items.length, 10));
eq('group ids and order', JSON.stringify(groups.map(g => g.id)),
   JSON.stringify(['ex1','ex2','ex3','ex4','ex5','ex6','ex7','ex8','ex9','ex10','audio']));
ok('only existing engine types used', groups.every(g => ['input','choice','builder'].includes(g.type)));
ok('only existing engine choice styles used',
   groups.filter(g => g.type === 'choice').every(g => ['chips','test','tf'].includes(g.style)));

// ---- audio ----
const audio = groups.find(g => g.id === 'audio');
eq('audio wired to the LESSON 5 file', audio.audioSrc, 'audios/%D0%902%205%20%D1%83%D1%80%D0%BE%D0%BA.mp3');
const abs = path.join(ROOT, decodeURIComponent(audio.audioSrc));
ok('audio file exists on disk (no 404)', fs.existsSync(abs));
ok('audio file is non-empty', fs.existsSync(abs) && fs.statSync(abs).size > 100000);
const prev = [1, 2, 3, 4].map(i => courseData.topics.find(t => t.id === i)['topic' + i + 'Exercises']
  .exercises.find(g => g.id === 'audio').audioSrc);
prev.forEach((s, i) => ok(`lesson 5 audio differs from lesson ${i + 1}`, audio.audioSrc !== s));
eq('all five lesson audios are distinct', new Set(prev.concat([audio.audioSrc])).size, 5);
ok('each of the five resolves to a distinct real file',
   new Set(prev.concat([audio.audioSrc]).map(s => {
     const p = path.join(ROOT, decodeURIComponent(s));
     return fs.existsSync(p) ? fs.statSync(p).size : 0;
   })).size === 5);

// ---- render ----
loadLesson(5);
const lc = w.document.getElementById('lessonContent');
const qs = w.document.getElementById('quizSection');
ok('lesson title rendered', /Kasblar va mashg'ulotlar/.test(lc.textContent));
ok('grammar rendered', !!lc.querySelector('.b2g-lead-title'));
ok('profession formula rendered', lc.textContent.includes('Кто? + быть + kasb'));
ok('Кем? formula rendered', lc.textContent.includes('Работать + кем?'));
ok('Где? formula rendered', lc.textContent.includes('Работать + где?'));
ok('Стать + кем? formula rendered', lc.textContent.includes('Стать + кем?'));
ok('masculine instrumental table rendered',
   ['врачом','учителем','инженером','водителем','программистом'].every(x => lc.textContent.includes(x)));
ok('feminine instrumental table rendered',
   ['медсестрой','учительницей','продавщицей','официанткой'].every(x => lc.textContent.includes(x)));
ok('all 8 "what does X do" examples rendered',
   ['Врач лечит людей.','Учитель учит детей.','Повар готовит еду.','Водитель водит машину.',
    'Продавец продаёт товары.','Парикмахер стрижёт людей.','Полицейский защищает людей.',
    'Инженер проектирует здания.'].every(x => lc.textContent.includes(x)));
ok('работать conjugation rendered (all 6 forms)',
   ['работаю','работаешь','работает','работаем','работаете','работают'].every(x => lc.textContent.includes(x)));
ok('учиться conjugation rendered (all 6 forms)',
   ['учусь','учишься','учится','учимся','учитесь','учатся'].every(x => lc.textContent.includes(x)));
ok('хотеть conjugation rendered (all 6 forms)',
   ['хочу','хочешь','хочет','хотим','хотите','хотят'].every(x => lc.textContent.includes(x)));
ok('work-time section rendered',
   ['утром','днём','вечером','ночью','каждый день','по будням','по выходным','с понедельника по пятницу']
   .every(x => lc.textContent.includes(x)));
ok('work-schedule section rendered',
   ['восемь часов','полный день','неполный день','по сменам'].every(x => lc.textContent.includes(x)));
ok('all 10 questions rendered',
   ['Кто вы?','Кто он?','Кем вы работаете?','Кем работает твой отец?','Где ты работаешь?',
    'Где работает она?','Что делает врач?','Что делает учитель?','Где ты учишься?','Кем ты хочешь стать?']
   .every(x => lc.textContent.includes(x)));
ok('all 6 answers rendered',
   ['Я врач.','Я работаю врачом.','Я работаю в больнице.','Я лечу людей.','Я учусь в университете.',
    'Я хочу стать хирургом.'].every(x => lc.textContent.includes(x)));
ok('summary block rendered', lc.textContent.includes('A2 daraja uchun asosiy grammatik mavzular'));
ok('summary lists all 8 points', lc.textContent.includes('лечит, учит, готовит, продаёт, строит, водит'));
ok('no template placeholder leaked', !lc.textContent.includes('${'));
ok('grammar tables rendered', lc.querySelectorAll('.b2g-t').length >= 14);
ok('vocabulary card rendered', lc.textContent.includes("Lug'atni ochish"));
/* One shared vocabulary card now; it deep-links with the live topic id. */
ok('single shared vocabulary card deep-links by topic id',
   /a2-vocabulary\.html\?topic=\$\{topic\.id\}/.test(SRC));
ok('no per-topic vocabulary card left in lesson content',
   !/a2-vocabulary\.html\?topic=\d/.test(t5.content));
ok('exercises rendered', !!qs.querySelector('.t1-wrap'));
eq('11 exercise cards', qs.querySelectorAll('.t1-card').length, 11);
eq('audio player present exactly once', qs.querySelectorAll('audio').length, 1);
eq('audio src resolved for /paid-courses/', qs.querySelector('audio source').getAttribute('src'),
   '../audios/%D0%902%205%20%D1%83%D1%80%D0%BE%D0%BA.mp3');
eq('text inputs rendered (ex1,2,3,5,6,7,8,10)', qs.querySelectorAll('input.t1-input').length, 80);
eq('builder widgets rendered (ex9)', qs.querySelectorAll('.t1-builder').length, 10);
eq('choice rows rendered (ex4 + audio)', qs.querySelectorAll('.t1-opts').length, 20);
eq('every question numbered', qs.querySelectorAll('.t1-num').length, 110);

// ---- grading + completion ----
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
                        : btns.find(b => !(Array.isArray(item.answer) ? item.answer : [item.answer]).includes(b.getAttribute('data-value')));
      if (t) t.classList.add('selected');
    } else {
      qs.querySelector('[data-t1-input="' + key + '"]').value = correct ? first : 'zzz';
    }
  }));
}
fill(true);
await w.checkTopic5Exercises(5);
const score = w.document.getElementById('scoreDisplay').textContent;
eq('perfect run scores 110/110', score, 'Sizning natijangiz: 110/110 (100%)');
ok('never "0/0"', !/0\/0/.test(score));
eq('saved under topic 5', w.__saved && w.__saved.id, 5);
eq('saved score', w.__saved && w.__saved.d.score, 110);
eq('saved total', w.__saved && w.__saved.d.total, 110);
ok('per-group answers persisted', w.__saved.d.topic1 && Object.keys(w.__saved.d.topic1).length === 11);
eq('cached in userQuizResults for reload', w.__api.quizResults()['topic_5'].score, 110);
eq('completion offered', w.document.getElementById('completeBtn').textContent, 'Mavzuni tugatish');
w.__api.resetCompleted();
w.document.getElementById('completeBtn').onclick();
await new Promise(r => setTimeout(r, 20));
ok('topic 5 recorded complete', w.__api.isDone(5));
ok('progress persisted', !!w.__ps);
w.__api.resetCompleted();
fill(false);
await w.checkTopic5Exercises(5);
eq('completion refused on a bad run', w.document.getElementById('completeBtn').textContent, 'Mavzu tugatilmadi');
ok('not silently completed', !w.__api.isDone(5));

// ---- DEMO MUST BE UNTOUCHED ----
console.log('\n  — demo scope guard —');
const DEMO = fs.readFileSync(path.join(ROOT, 'a2-demo.html'), 'utf8');
const dseg = DEMO.slice(DEMO.indexOf('id: 5,'), DEMO.indexOf('id: 6,'));
ok('demo topic 5 stays LOCKED', /isLocked: true/.test(dseg));
ok('demo topic 5 stays subscription-locked', /isSubscriptionLocked: true/.test(dseg));
ok('demo topic 5 has NO lesson grammar', /grammar: ""/.test(dseg));
ok('demo topic 5 has NO exercises', !/topic5Exercises/.test(dseg));
ok('demo never references the lesson-5 audio', !/%D1%83%D1%80%D0%BE%D0%BA/.test(dseg));
const DVOC = fs.readFileSync(path.join(ROOT, 'a2-demo-vocabulary.html'), 'utf8');
const dvseg = DVOC.slice(DVOC.indexOf('id: 5,'), DVOC.indexOf('id: 6,'));
ok('demo vocabulary topic 5 stays empty', /words: \[\]/.test(dvseg));
ok('demo vocabulary topic 5 stays locked', /isLocked: true/.test(dvseg));

console.log('\n' + '─'.repeat(62));
console.log(fail === 0 ? `  ✅ A2 L5 (paid): ${pass}/${pass} passed` : `  ❌ A2 L5 (paid): ${fail} failed / ${pass + fail}`);
process.exit(fail ? 1 : 0);
})();
