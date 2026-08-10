'use strict';
/* ============================================================================
 * A2 · Lesson 3 «Uy va yashash joyi» — render, grading, completion, audio
 * ==========================================================================*/
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const TARGET = process.argv[2] === 'demo' ? 'a2-demo.html' : 'paid-courses/a2-course.html';
const IS_DEMO = TARGET === 'a2-demo.html';
const SRC = fs.readFileSync(path.join(ROOT, TARGET), 'utf8');
console.log('\n=== ' + TARGET + ' · Topic 3 ===');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x ? '  → ' + x : '')); } };
const eq = (n, a, b) => ok(n, Object.is(a, b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

(async function run() {
const blocks = [...SRC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const pre = blocks.find(b => /(let|var|const)\s+currentUser/.test(b) && !b.includes('const courseData'));
const main = blocks.find(b => b.includes('const courseData'));
const errs = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errs.push(String(e.message)));
const dom = new JSDOM(SRC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g, '<script></script>'),
  { url: 'https://uzdarus.uz/' + TARGET, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
w.HTMLElement.prototype.scrollIntoView = function () {};
w.alert = () => {};
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
const t3 = courseData.topics.find(t => t.id === 3);
eq('topic 3 title', t3.title, 'Uy va yashash joyi');
eq('topic 3 free', t3.isLocked, false);
eq('topic 3 not subscription-locked', t3.isSubscriptionLocked, false);
ok('topic 3 uses the generic engine shape', Array.isArray(t3.topic3Exercises.exercises));
eq('engine claims topic 3', !!getT1ExData(t3), true);
ok('legacy quiz block removed from topic 3', !t3.quiz);
ok('legacy topic-3 renderer deleted', !/function loadTopic3Exercises\s*\(/.test(SRC));
ok('legacy topic-3 scorer deleted', !/window\.checkTopic3Exercises\s*=\s*function/.test(SRC));
ok('no legacy per-topic renderer survives at all',
   !/function loadTopic[123]Exercises\s*\(/.test(SRC) && !/function bindTopic[123]Events\s*\(/.test(SRC));

const groups = t3.topic3Exercises.exercises;
eq('11 exercise groups (10 mashq + audio)', groups.length, 11);
eq('110 graded questions', groups.reduce((s, g) => s + g.items.length, 0), 110);
groups.forEach(g => eq(`group ${g.id} has 10 items`, g.items.length, 10));
eq('group ids and order', JSON.stringify(groups.map(g => g.id)),
   JSON.stringify(['ex1','ex2','ex3','ex4','ex5','ex6','ex7','ex8','ex9','ex10','audio']));
ok('only existing engine types used',
   groups.every(g => ['input','choice','builder'].includes(g.type)));
ok('only existing engine choice styles used',
   groups.filter(g => g.type === 'choice').every(g => ['chips','test','tf'].includes(g.style)));

// ---- audio ----
const audio = groups.find(g => g.id === 'audio');
eq('audio wired to the LESSON 3 file', audio.audioSrc, 'audios/%D0%902%203%20%D1%83%D1%80%D0%BE%D0%BA.mp3');
const abs = path.join(ROOT, decodeURIComponent(audio.audioSrc));
ok('audio file exists on disk (no 404)', fs.existsSync(abs));
ok('audio file is non-empty', fs.existsSync(abs) && fs.statSync(abs).size > 100000);
const a1 = courseData.topics.find(t => t.id === 1).topic1Exercises.exercises.find(g => g.id === 'audio').audioSrc;
const a2 = courseData.topics.find(t => t.id === 2).topic2Exercises.exercises.find(g => g.id === 'audio').audioSrc;
ok('lesson 3 audio differs from lesson 1', audio.audioSrc !== a1);
ok('lesson 3 audio differs from lesson 2', audio.audioSrc !== a2);
eq('all three lesson audios are distinct', new Set([a1, a2, audio.audioSrc]).size, 3);
ok('each lesson audio resolves to a real distinct file on disk',
   new Set([a1, a2, audio.audioSrc].map(s => {
     const p = path.join(ROOT, decodeURIComponent(s));
     return fs.existsSync(p) ? fs.statSync(p).size : 0;
   })).size === 3);

// ---- render ----
loadLesson(3);
const lc = w.document.getElementById('lessonContent');
const qs = w.document.getElementById('quizSection');
ok('lesson title rendered', /Uy va yashash joyi/.test(lc.textContent));
ok('grammar rendered', !!lc.querySelector('.b2g-lead-title'));
ok('Где? formula rendered', lc.textContent.includes('в / на + Предложный падеж'));
ok('Куда? formula rendered', lc.textContent.includes('в / на + Винительный падеж'));
ok('Откуда? formula rendered', lc.textContent.includes('из / с / от + Родительный падеж'));
ok('П.п. endings table rendered', lc.textContent.includes('-ах / -ях'));
ok('в шкафу exception documented', lc.textContent.includes('в шкафу'));
ok('В.п. endings rule rendered', lc.textContent.includes('-а → -у, -я → -ю'));
ok('Р.п. endings table rendered', lc.textContent.includes('-ы / -и'));
ok('от друга example rendered', lc.textContent.includes('от друга'));
ok('preposition master table rendered', ['ichida','ustida','ichiga','ustiga','ichidan','ustidan','yonidan']
   .every(x => lc.textContent.includes(x)));
ok('all 10 room names rendered',
   ['дом','квартира','комната','кухня','спальня','гостиная','ванная','туалет','коридор','балкон']
   .every(x => lc.textContent.includes(x)));
ok('all 8 outdoor names rendered',
   ['двор','улица','город','деревня','парк','сад','подъезд','лифт'].every(x => lc.textContent.includes(x)));
ok('three-way comparison table rendered',
   ['со двора','с улицы','с балкона','из кухни'].every(x => lc.textContent.includes(x)));
ok('Eslab qoling block rendered', lc.textContent.includes('Eslab qoling!'));
ok('short formula rendered', lc.textContent.includes('из, с, от + Р.п.'));
ok('closing note rendered', lc.textContent.includes('kundalik nutqda eng ko'));
ok('no template placeholder leaked', !lc.textContent.includes('${'));
ok('grammar tables rendered', lc.querySelectorAll('.b2g-t').length >= 10);
ok('exercises rendered', !!qs.querySelector('.t1-wrap'));
eq('11 exercise cards', qs.querySelectorAll('.t1-card').length, 11);
eq('audio player present exactly once', qs.querySelectorAll('audio').length, 1);
eq('audio src resolved for this page location',
   qs.querySelector('audio source').getAttribute('src'),
   (IS_DEMO ? '' : '../') + 'audios/%D0%902%203%20%D1%83%D1%80%D0%BE%D0%BA.mp3');
eq('text inputs rendered (ex1,2,3,5,6,7,9)', qs.querySelectorAll('input.t1-input').length, 70);
eq('choice rows rendered (ex4,8,10,audio)', qs.querySelectorAll('.t1-opts').length, 40);
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
                        : btns.find(b => b.getAttribute('data-value') !== first);
      if (t) t.classList.add('selected');
    } else {
      qs.querySelector('[data-t1-input="' + key + '"]').value = correct ? first : (item.free ? 'x' : 'zzz');
    }
  }));
}
fill(true);
await w.checkTopic3Exercises(3);
const score = w.document.getElementById('scoreDisplay').textContent;
eq('perfect run scores 110/110', score, 'Sizning natijangiz: 110/110 (100%)');
ok('never "0/0"', !/0\/0/.test(score));
eq('saved under topic 3', w.__saved && w.__saved.id, 3);
eq('saved score', w.__saved && w.__saved.d.score, 110);
eq('saved total', w.__saved && w.__saved.d.total, 110);
ok('per-group answers persisted', w.__saved.d.topic1 && Object.keys(w.__saved.d.topic1).length === 11);
eq('cached in userQuizResults for reload', w.__api.quizResults()['topic_3'].score, 110);
eq('completion offered', w.document.getElementById('completeBtn').textContent, 'Mavzuni tugatish');
w.__api.resetCompleted();
w.document.getElementById('completeBtn').onclick();
await new Promise(r => setTimeout(r, 20));
ok('topic 3 recorded complete', w.__api.isDone(3));
ok('progress persisted', !!w.__ps);

w.__api.resetCompleted();
fill(false);
await w.checkTopic3Exercises(3);
eq('completion refused on a bad run', w.document.getElementById('completeBtn').textContent, 'Mavzu tugatilmadi');
ok('not silently completed', !w.__api.isDone(3));

// ---- lenient-but-correct validation ----
const norm = v => String(v).toLowerCase().replace(/ё/g,'е').replace(/[.,!?;:()"'«»—–\-]/g,' ').replace(/\s+/g,' ').trim();
const acc = (it, v) => (Array.isArray(it.answer)?it.answer:[it.answer]).some(a => norm(a) === norm(v));
const G = {}; groups.forEach(g => { G[g.id] = g; });
ok('ex1 accepts the phrase alone AND the whole sentence',
   acc(G.ex1.items[0], 'на кухне') && acc(G.ex1.items[0], 'Моя мама готовит на кухне'));
ok('normalisation makes case irrelevant', acc(G.ex1.items[0], 'НА КУХНЕ'));
ok('normalisation makes trailing punctuation irrelevant', acc(G.ex1.items[0], 'на кухне.'));
ok('ex5 #5 accepts во AND в', acc(G.ex5.items[4], 'во') && acc(G.ex5.items[4], 'в'));
ok('ex6 #3 accepts masculine AND feminine',
   acc(G.ex6.items[2], 'Он вышел из дома') && acc(G.ex6.items[2], 'Она вышла из дома'));
ok('ex6 #7 accepts приехал AND приехала',
   acc(G.ex6.items[6], 'Он приехал из Ташкента') && acc(G.ex6.items[6], 'Она приехала из Ташкента'));
ok('ex6 #6 accepts иду AND еду', acc(G.ex6.items[5], 'Я иду в город') && acc(G.ex6.items[5], 'Я еду в город'));
ok('ex7 is open-ended with a model hint',
   G.ex7.items.every(i => i.free === true && /^Namuna: /.test(i.hint || '')));

console.log('\n' + '─'.repeat(62));
console.log(fail === 0 ? `  ✅ A2 L3 (${TARGET}): ${pass}/${pass} passed` : `  ❌ A2 L3 (${TARGET}): ${fail} failed / ${pass + fail}`);
process.exit(fail ? 1 : 0);
})();
