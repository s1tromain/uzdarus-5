'use strict';
/* Regression guard: Topic 1 moved onto the shared engine; topics 2 and 3 must
   still be rendered and graded by their ORIGINAL per-topic renderers. */
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x ? '  → ' + x : '')); } };
const eq = (n, a, b) => ok(n, Object.is(a, b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

['paid-courses/a2-course.html', 'a2-demo.html'].forEach((rel) => {
  console.log('\n─── ' + rel + ' ───');
  const SRC = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const blocks = [...SRC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const pre = blocks.find(b => /(let|var|const)\s+currentUser/.test(b) && !b.includes('const courseData'));
  const main = blocks.find(b => b.includes('const courseData'));
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM(SRC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g, '<script></script>'),
    { url: 'https://uzdarus.uz/' + rel, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.alert = () => {};
  w.eval('window.saveQuizResult=async()=>1;window.saveUserProgress=async()=>1;window.getUserProgress=async()=>[];window.getUserQuizResults=async()=>({});window.logActivity=async()=>{};');
/* production loads these via <script>; the harness must too, or the shared
   components (vocabulary card, exercise UI) are simply absent */
['shared-normalizer.js','exercise-session.js','sentence-builder.js','course-exercise-ui.js','a2-host.js']
  .forEach(f => w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  if (pre) w.eval(pre);
  w.eval(main + '\n;window.__api={courseData:courseData,loadQuiz:loadQuiz,getT1ExData:getT1ExData};');
  const { courseData, loadQuiz, getT1ExData } = w.__api;
  const qs = w.document.getElementById('quizSection');

  eq('16 topics intact', courseData.topics.length, 16);

  /* Lessons 1-3 all run on the shared engine now. Topics 4-16 have no exercise
     data at all, so the shape-discriminated lookup must leave them alone rather
     than claiming them and rendering an empty exercise list. */
  /* Topic 4 exists ONLY in the paid build (Lesson 4+ is not part of the demo),
     so the expected boundary differs per file. Lessons 6 to 10 have since been authored
     in the paid build; everything from 11 up is still a placeholder in both. */
  const engineTopics = rel.indexOf('demo') !== -1 ? [1,2,3] : [1,2,3,4,5,6,7,8,9,10];
  courseData.topics.forEach((t) => {
    const expected = engineTopics.includes(t.id);
    eq(`topic ${t.id}: engine-claimed = ${expected}`, !!getT1ExData(t), expected);
  });

  // engine-driven topics render engine markup
  engineTopics.forEach((id) => {
    const t = courseData.topics.find(x => x.id === id);
    eq(`topic ${id} IS claimed by the shared engine`, !!getT1ExData(t), true);
    qs.innerHTML = '';
    loadQuiz(id);
    ok(`topic ${id}: engine markup rendered`, !!qs.querySelector('.t1-wrap'));
    ok(`topic ${id}: no legacy quiz markup`, !qs.querySelector('.quiz-option'));
  });
  const t1 = courseData.topics.find(x => x.id === 1);
  ok('exactly one window.checkTopic1Exercises definition in the file',
     (SRC.match(/window\.checkTopic1Exercises\s*=/g) || []).length === 1);
  ok('legacy loadTopic1Exercises fully removed', !/function loadTopic1Exercises\s*\(/.test(SRC));
  ok('legacy bindTopic1Events fully removed', !/function bindTopic1Events\s*\(/.test(SRC));
  ok('legacy topic-2 renderer removed (moved to the engine)', !/function loadTopic2Exercises\s*\(/.test(SRC));
  ok('legacy topic-2 scorer removed', !/window\.checkTopic2Exercises\s*=\s*function/.test(SRC));
  ok('exactly one window.checkTopic2Exercises owner (the engine alias)',
     (SRC.match(/window\.checkTopic2Exercises\s*=/g) || []).length === 0);
  ok('legacy topic-3 renderer removed (moved to the engine)', !/function loadTopic3Exercises\s*\(/.test(SRC));
  ok('legacy topic-3 scorer removed', !/window\.checkTopic3Exercises\s*=\s*function/.test(SRC));
  ok('NO legacy per-topic renderer survives anywhere',
     !/function loadTopic\dExercises\s*\(/.test(SRC) && !/function bindTopic\dEvents\s*\(/.test(SRC));
  ok('no dangling call to a deleted renderer',
     !/\bloadTopic[123]Exercises\s*\(/.test(SRC) && !/\bbindTopic[123]Events\s*\(/.test(SRC));

  // access rules untouched
  eq('topic 1 free', t1.isLocked, false);
  eq('topic 1 not subscription-locked', t1.isSubscriptionLocked, false);
  const locked = courseData.topics.filter(t => t.isLocked).map(t => t.id);
  console.log('  · locked topics:', JSON.stringify(locked));
  ok('subscription/lock flags still present on every topic',
     courseData.topics.every(t => 'isLocked' in t && 'isSubscriptionLocked' in t));
});

console.log('\n' + '─'.repeat(62));
console.log(fail === 0 ? `  ✅ A2 LEGACY TOPICS: ${pass}/${pass} passed` : `  ❌ A2 LEGACY TOPICS: ${fail} failed / ${pass + fail}`);
console.log('─'.repeat(62));
process.exit(fail ? 1 : 0);
