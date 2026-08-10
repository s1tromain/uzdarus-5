'use strict';
/* ============================================================================
 * A2 · Lesson 4 «Kunlar, oylar va fasllar» — PAID ONLY.
 * Lesson 4+ does not exist in the demo, so this suite also asserts that the
 * demo build and the demo vocabulary were NOT touched.
 * ==========================================================================*/
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const TARGET = 'paid-courses/a2-course.html';
const SRC = fs.readFileSync(path.join(ROOT, TARGET), 'utf8');
console.log('\n=== ' + TARGET + ' · Topic 4 (paid only) ===');

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
const t4 = courseData.topics.find(t => t.id === 4);
eq('topic 4 title', t4.title, 'Kunlar, oylar va fasllar');
ok('topic 4 uses the generic engine shape', Array.isArray(t4.topic4Exercises.exercises));
eq('engine claims topic 4', !!getT1ExData(t4), true);
ok('legacy quiz block removed from topic 4', !t4.quiz);
ok('the subscription-upsell placeholder is gone',
   !/Bu mavzu ochiq emas/.test(t4.content) && t4.grammar.length > 5000);
eq('access flags unchanged (paid)', `${t4.isLocked}/${t4.isSubscriptionLocked}`, 'false/false');
eq('topic 6 still a locked placeholder', courseData.topics.find(t => t.id === 6).grammar, '');
ok('topics 6-16 untouched (still upsell placeholders)',
   courseData.topics.filter(t => t.id >= 6).every(t => t.grammar === '' && !getT1ExData(t)));

const groups = t4.topic4Exercises.exercises;
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
eq('audio wired to the LESSON 4 file', audio.audioSrc, 'audios/%D0%902%204%20%D1%83%D1%80%D0%BE%D0%BA.mp3');
const abs = path.join(ROOT, decodeURIComponent(audio.audioSrc));
ok('audio file exists on disk (no 404)', fs.existsSync(abs));
ok('audio file is non-empty', fs.existsSync(abs) && fs.statSync(abs).size > 100000);
const prev = [1, 2, 3].map(i => courseData.topics.find(t => t.id === i)['topic' + i + 'Exercises']
  .exercises.find(g => g.id === 'audio').audioSrc);
prev.forEach((s, i) => ok(`lesson 4 audio differs from lesson ${i + 1}`, audio.audioSrc !== s));
eq('all four lesson audios are distinct', new Set(prev.concat([audio.audioSrc])).size, 4);
ok('each of the four resolves to a distinct real file',
   new Set(prev.concat([audio.audioSrc]).map(s => {
     const p = path.join(ROOT, decodeURIComponent(s));
     return fs.existsSync(p) ? fs.statSync(p).size : 0;
   })).size === 4);

// ---- render ----
loadLesson(4);
const lc = w.document.getElementById('lessonContent');
const qs = w.document.getElementById('quizSection');
ok('lesson title rendered', /Kunlar, oylar va fasllar/.test(lc.textContent));
ok('grammar rendered', !!lc.querySelector('.b2g-lead-title'));
ok('all 7 weekdays rendered',
   ['понедельник','вторник','среда','четверг','пятница','суббота','воскресенье'].every(x => lc.textContent.includes(x)));
ok('во вторник exception documented', lc.textContent.includes('во') && lc.textContent.includes('talaffuz qulayligi'));
ok('all 12 months rendered',
   ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь']
   .every(x => lc.textContent.includes(x)));
ok('all 12 prepositional month forms rendered',
   ['в январе','в феврале','в марте','в апреле','в мае','в июне','в июле','в августе','в сентябре','в октябре','в ноябре','в декабре']
   .every(x => lc.textContent.includes(x)));
ok('all 4 seasons + instrumental forms rendered',
   ['весна','лето','осень','зима','весной','летом','осенью','зимой'].every(x => lc.textContent.includes(x)));
ok('season instrumental note rendered', lc.textContent.includes('творительный'));
ok('в зимнее время / в летнее время rendered',
   lc.textContent.includes('В зимнее время холодно.') && lc.textContent.includes('В летнее время жарко.'));
ok('hour rule table rendered (час/часа/часов)',
   lc.textContent.includes('час') && lc.textContent.includes('часа') && lc.textContent.includes('часов') && lc.textContent.includes('5–20'));
ok('parts of day rendered', ['утро','день','вечер','ночь','утром','днём','вечером','ночью'].every(x => lc.textContent.includes(x)));
ok('date section rendered', lc.textContent.includes('Какое сегодня число?') && lc.textContent.includes('двадцать пятого декабря'));
ok('year section rendered', lc.textContent.includes('В каком году?') && lc.textContent.includes('в прошлом году'));
ok('weather section rendered',
   ['Жарко.','Холодно.','Тепло.','Прохладно.','Ветрено.','Солнечно.','Пасмурно.','Идёт дождь.','Идёт снег.']
   .every(x => lc.textContent.includes(x)));
ok('time-expression table rendered',
   ['сейчас','потом','позже','скоро','уже','ещё','всегда','никогда','иногда','часто','редко',
    'каждый день','каждую неделю','каждый месяц','каждый год'].every(x => lc.textContent.includes(x)));
ok('Esda saqlang block rendered', lc.textContent.includes('Esda saqlang'));
ok('closing note rendered', lc.textContent.includes('asosiy va eng ko'));
ok('no template placeholder leaked', !lc.textContent.includes('${'));
ok('grammar tables rendered', lc.querySelectorAll('.b2g-t').length >= 12);
ok('vocabulary card rendered', lc.textContent.includes("Lug'atni ochish"));
ok('vocabulary card deep-links to topic 4', /a2-vocabulary\.html\?topic=4/.test(t4.content));
ok('exercises rendered', !!qs.querySelector('.t1-wrap'));
eq('11 exercise cards', qs.querySelectorAll('.t1-card').length, 11);
eq('audio player present exactly once', qs.querySelectorAll('audio').length, 1);
eq('audio src resolved for /paid-courses/', qs.querySelector('audio source').getAttribute('src'),
   '../audios/%D0%902%204%20%D1%83%D1%80%D0%BE%D0%BA.mp3');
eq('text inputs rendered (ex1,2,3,6,9,10)', qs.querySelectorAll('input.t1-input').length, 60);
eq('builder widgets rendered (ex8)', qs.querySelectorAll('.t1-builder').length, 10);
eq('choice rows rendered (ex4,5,7,audio)', qs.querySelectorAll('.t1-opts').length, 40);
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
await w.checkTopic4Exercises(4);
const score = w.document.getElementById('scoreDisplay').textContent;
eq('perfect run scores 110/110', score, 'Sizning natijangiz: 110/110 (100%)');
ok('never "0/0"', !/0\/0/.test(score));
eq('saved under topic 4', w.__saved && w.__saved.id, 4);
eq('saved score', w.__saved && w.__saved.d.score, 110);
eq('saved total', w.__saved && w.__saved.d.total, 110);
ok('per-group answers persisted', w.__saved.d.topic1 && Object.keys(w.__saved.d.topic1).length === 11);
eq('cached in userQuizResults for reload', w.__api.quizResults()['topic_4'].score, 110);
eq('completion offered', w.document.getElementById('completeBtn').textContent, 'Mavzuni tugatish');
w.__api.resetCompleted();
w.document.getElementById('completeBtn').onclick();
await new Promise(r => setTimeout(r, 20));
ok('topic 4 recorded complete', w.__api.isDone(4));
ok('progress persisted', !!w.__ps);
w.__api.resetCompleted();
fill(false);
await w.checkTopic4Exercises(4);
eq('completion refused on a bad run', w.document.getElementById('completeBtn').textContent, 'Mavzu tugatilmadi');
ok('not silently completed', !w.__api.isDone(4));

// ---- DEMO MUST BE UNTOUCHED ----
console.log('\n  — demo scope guard —');
const DEMO = fs.readFileSync(path.join(ROOT, 'a2-demo.html'), 'utf8');
const dseg = DEMO.slice(DEMO.indexOf('id: 4,'), DEMO.indexOf('id: 5,'));
ok('demo topic 4 stays LOCKED', /isLocked: true/.test(dseg));
ok('demo topic 4 stays subscription-locked', /isSubscriptionLocked: true/.test(dseg));
ok('demo topic 4 has NO lesson grammar', /grammar: ""/.test(dseg));
ok('demo topic 4 has NO exercises', !/topic4Exercises/.test(dseg));
ok('demo never references the lesson-4 audio', !/%D1%83%D1%80%D0%BE%D0%BA/.test(dseg));
const DVOC = fs.readFileSync(path.join(ROOT, 'a2-demo-vocabulary.html'), 'utf8');
const dvseg = DVOC.slice(DVOC.indexOf('id: 4,'), DVOC.indexOf('id: 5,'));
ok('demo vocabulary topic 4 stays empty', /words: \[\]/.test(dvseg));
ok('demo vocabulary topic 4 stays locked', /isLocked: true/.test(dvseg));

console.log('\n' + '─'.repeat(62));
console.log(fail === 0 ? `  ✅ A2 L4 (paid): ${pass}/${pass} passed` : `  ❌ A2 L4 (paid): ${fail} failed / ${pass + fail}`);
process.exit(fail ? 1 : 0);
})();
