const fs=require('fs'),path=require('path');const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT='/Users/sardor/Desktop/UzdaRus V16';
let pass=0,fail=0;const ok=(n,c)=>{if(c){pass++;console.log('  ✓ '+n)}else{fail++;console.log('  ✗ '+n)}};
for (const rel of ['paid-courses/a2-course.html','a2-demo.html']) {
  const SRC=fs.readFileSync(path.join(ROOT,rel),'utf8');
  const blocks=[...SRC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  const pre=blocks.find(b=>/(let|var|const)\s+currentUser/.test(b)&&!b.includes('const courseData'));
  const main=blocks.find(b=>b.includes('const courseData'));
  const errs=[];const vc=new VirtualConsole();
  vc.on('jsdomError',e=>errs.push(String(e.message)));
  vc.on('error',e=>errs.push(String(e)));
  const dom=new JSDOM(SRC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g,'<script></script>'),
    {url:'https://uzdarus.uz/'+rel,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
  const w=dom.window;w.HTMLElement.prototype.scrollIntoView=function(){};w.alert=()=>{};
  w.eval("window.saveQuizResult=async()=>1;window.saveUserProgress=async()=>1;window.getUserProgress=async()=>[];window.getUserQuizResults=async()=>({});window.logActivity=async()=>{};");
  if(pre)w.eval(pre);
  w.eval(main+'\n;window.__api={courseData:courseData,loadLesson:loadLesson};');
  console.log('\n─── '+rel+' ───');
  ok('no runtime errors while loading',errs.length===0);

  const t2=w.__api.courseData.topics.find(t=>t.id===2);
  ok('T2 explanation preserved',!!(t2.explanation&&t2.explanation.uz));
  ok('T2 vocabulary reachable via the shared card', /UzExerciseUI\.renderVocabCard/.test(SRC));
  ok('T2 content carries no private vocabulary card', !/Lug.atni ochish/.test(t2.content));
  ok('T2 description preserved',/O.tgan zamon/.test(t2.description));

  // render the same topic 5x — listener/markup leaks would show up as growth
  const isPaid = rel.indexOf('demo') === -1;
  for(let i=0;i<5;i++){w.__api.loadLesson(1);w.__api.loadLesson(2);w.__api.loadLesson(3);
    if(isPaid){w.__api.loadLesson(4);w.__api.loadLesson(5);}}
  if(isPaid){
    w.__api.loadLesson(4);
    const q4=w.document.getElementById('quizSection');
    ok('T4 renders 11 cards after interleaving',q4.querySelectorAll('.t1-card').length===11);
    ok('T4 renders one audio',q4.querySelectorAll('audio').length===1);
    const t4o=w.__api.courseData.topics.find(t=>t.id===4);
    ok('T4 explanation preserved',!!(t4o.explanation&&t4o.explanation.uz));
    ok('T4 vocabulary reachable via the shared card', /UzExerciseUI\.renderVocabCard/.test(SRC));
  ok('T4 content carries no private vocabulary card', !/Lug.atni ochish/.test(t4o.content));
    w.__api.loadLesson(5);
    const q5=w.document.getElementById('quizSection');
    ok('T5 renders 11 cards after interleaving',q5.querySelectorAll('.t1-card').length===11);
    ok('T5 renders one audio',q5.querySelectorAll('audio').length===1);
    const t5o=w.__api.courseData.topics.find(t=>t.id===5);
    ok('T5 explanation preserved',!!(t5o.explanation&&t5o.explanation.uz));
    ok('T5 vocabulary reachable via the shared card', /UzExerciseUI\.renderVocabCard/.test(SRC));
  ok('T5 content carries no private vocabulary card', !/Lug.atni ochish/.test(t5o.content));
  }
  w.__api.loadLesson(2);
  const qs=w.document.getElementById('quizSection');
  ok('no card duplication after 15 interleaved renders',qs.querySelectorAll('.t1-card').length===10);
  ok('no audio duplication after 15 interleaved renders',qs.querySelectorAll('audio').length===1);
  ok('no style-tag duplication',w.document.querySelectorAll('#t1-styles').length===1);
  ok('no stale matching game left behind',!w.document.getElementById('matchingGame'));

  // one option click must select exactly one button in its row
  const row=qs.querySelector('[data-t1-row="ex2-0"]');
  const btns=[...row.querySelectorAll('.t1-opt')];
  btns[0].dispatchEvent(new w.Event('click',{bubbles:true}));
  btns[2].dispatchEvent(new w.Event('click',{bubbles:true}));
  ok('single-select per row (no duplicate listeners)',row.querySelectorAll('.t1-opt.selected').length===1);

  // builder: click a word, it moves to the slot exactly once
  const t3o=w.__api.courseData.topics.find(t=>t.id===3);
  ok('T3 explanation preserved',!!(t3o.explanation&&t3o.explanation.uz));
  ok('T3 vocabulary reachable via the shared card', /UzExerciseUI\.renderVocabCard/.test(SRC));
  ok('T3 content carries no private vocabulary card', !/Lug.atni ochish/.test(t3o.content));
  w.__api.loadLesson(3);
  const qs3=w.document.getElementById('quizSection');
  ok('T3 renders 11 cards',qs3.querySelectorAll('.t1-card').length===11);
  ok('T3 renders one audio',qs3.querySelectorAll('audio').length===1);
  w.__api.loadLesson(2);
  const b=qs.querySelector('[data-t1-builder="ex8-0"]');
  const pool=b.querySelector('.t1-build-pool');
  pool.querySelector('.t1-bw').dispatchEvent(new w.Event('click',{bubbles:true}));
  ok('builder adds exactly one chip per click',b.querySelectorAll('.t1-build-slot .t1-bw-chip').length===1);
  ok('builder syncs its hidden input',b.querySelector('input[type="hidden"]').value.trim().length>0);
  b.querySelector('.t1-build-reset').dispatchEvent(new w.Event('click',{bubbles:true}));
  ok('builder reset clears the slot',b.querySelectorAll('.t1-build-slot .t1-bw-chip').length===0);
  ok('builder reset clears the hidden input',b.querySelector('input[type="hidden"]').value==='');
}
console.log('\n'+'─'.repeat(58));
console.log(fail===0?`  ✅ SELF-REVIEW: ${pass}/${pass} passed`:`  ❌ SELF-REVIEW: ${fail} failed / ${pass+fail}`);
process.exit(fail?1:0);
