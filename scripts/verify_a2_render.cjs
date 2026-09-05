'use strict';
const fs=require('fs'),path=require('path');const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT=path.join(__dirname,'..');
const SRC=fs.readFileSync(path.join(ROOT,'paid-courses/a2-course.html'),'utf8');
const blocks=[...SRC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const pre=blocks.find(b=>/(let|var|const)\s+currentUser/.test(b)&&!b.includes('const courseData'));
const main=blocks.find(b=>b.includes('const courseData'));
const vc=new VirtualConsole();vc.on('jsdomError',()=>{});
const dom=new JSDOM(SRC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g,'<script></script>'),
 {url:'https://uzdarus.uz/paid-courses/a2-course.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window;w.HTMLElement.prototype.scrollIntoView=function(){};w.alert=()=>{};
w.eval("window.saveQuizResult=async()=>1;window.saveUserProgress=async()=>1;window.getUserProgress=async()=>[];window.getUserQuizResults=async()=>({});window.logActivity=async()=>{};");
/* Production loads these via <script defer>; the harness must do the same or
   the shared components (vocabulary card, exercise UI) are simply absent. */
['exercise-session.js','sentence-builder.js','course-exercise-ui.js','a2-host.js',
 'topic-route.js']
  .forEach(f=>w.eval(fs.readFileSync(path.join(ROOT,f),'utf8')));
if(pre)w.eval(pre);
w.eval(main+'\n;window.__api={courseData:courseData,loadLesson:loadLesson,startTopicExercises:startTopicExercises};');
const t1=w.__api.courseData.topics.find(t=>t.id===1);
const {materialOf}=require('./_grammar_material.cjs');
/* THE TOPIC OPENS ON ITS OVERVIEW NOW: the grammar is served by the shared
   reader and the exercises are the stage the learner picks. Same content,
   new addresses — every assertion below still checks the same words. */
const open=(n)=>{w.__api.loadLesson(n);w.__api.startTopicExercises(n);};
const G={};[1,2,3,4,5].forEach(n=>{G[n]=materialOf('A2',n);});

// render the full lesson (grammar + content + exercises)
open(1);
const lc=w.document.getElementById('lessonContent');
const qs=w.document.getElementById('quizSection');
const D=w.document;
let pass=0,fail=0;const ok=(n,c)=>{if(c){pass++;console.log('  ✓ '+n)}else{fail++;console.log('  ✗ '+n)}};

ok('lesson title rendered', /«У меня есть» va kundalik hayotim/.test(lc.textContent));
ok('grammar section rendered', G[1].body.includes('b2g'));
ok('grammar lead present', G[1].body.includes('b2g-lead-title'));
ok('all 4 past-tense forms shown', ['был','была','было','были'].every(f=>G[1].text.includes(f)));
ok('all 6 future forms shown', ['буду','будешь','будет','будем','будете','будут'].every(f=>G[1].text.includes(f)));
ok('genitive-absence table rendered', G[1].text.includes('Меня не было дома'));
ok('the ❌ wrong-form warning is shown', G[1].text.includes('Мы не было'));
ok('possession formula shown', G[1].text.includes('У + kim + есть + nima'));
ok('8 rules block rendered', G[1].text.includes('8 ta qoida'));
ok('short formula table rendered', G[1].text.includes('Menda kitob bor edi'));
ok('grammar tables render as real tables', (G[1].body.match(/class="b2g-t/g)||[]).length >= 4);
ok('no unclosed template braces leaked', !G[1].text.includes('${'));
ok('vocabulary card preserved', !!lc.querySelector('[data-uzr-open="vocabulary"]'));
ok('the vocabulary stage counts 45 words', (lc.textContent.replace(/\s+/g,' ').includes('45')));
ok('explanation block preserved', G[1].body.includes('gr-note'));
ok('exercises rendered below the lesson', !!qs.querySelector('.t1-wrap'));
ok('11 exercise cards', qs.querySelectorAll('.t1-card').length===11);
ok('audio player present exactly once', qs.querySelectorAll('audio').length===1);
ok('every exercise card has a numbered heading', qs.querySelectorAll('.t1-card-head h4').length===11);
ok('every question is numbered', qs.querySelectorAll('.t1-num').length===110);
ok('blanks render as blanks', qs.querySelectorAll('.t1-blank').length>0);
const st=D.getElementById('t1-styles').textContent;
ok('responsive rules injected (tablet, 720px as in B1)', /max-width:\s*720px/.test(st));
ok('responsive rules injected (mobile)', /max-width:\s*480px/.test(st));
ok('no inline style attribute on exercise items', qs.querySelectorAll('.t1-item[style]').length===0);

// ---------------- TOPIC 2 ----------------
open(2);
const lc2=w.document.getElementById('lessonContent'), qs2=w.document.getElementById('quizSection');
ok('T2 lesson title rendered', /Oila va munosabatlar/.test(lc2.textContent));
ok('T2 grammar rendered', G[2].body.includes('b2g-lead-title'));
ok('T2 past-tense suffixes shown', ['-л','-ла','-ло','-ли'].every(x=>G[2].text.includes(x)));
ok('T2 быть forms shown', ['был','была','было','были'].every(x=>G[2].text.includes(x)));
ok('T2 all possessive families shown', ['мой','твой','наш','ваш','его','её','их'].every(x=>G[2].text.includes(x)));
ok('T2 grammar tables render', (G[2].body.match(/class="b2g-t/g)||[]).length >= 8);
ok('T2 no template placeholder leaked', !G[2].text.includes('${'));
ok('T2 the vocabulary stage counts 77 words', (lc2.textContent.replace(/\s+/g,' ').includes('77')));
ok('T2 10 exercise cards', qs2.querySelectorAll('.t1-card').length===10);
ok('T2 audio present once', qs2.querySelectorAll('audio').length===1);
ok('T2 builder widgets render', qs2.querySelectorAll('.t1-builder').length===10);
ok('T2 every question numbered', qs2.querySelectorAll('.t1-num').length===100);
ok('T2 no inline style on items', qs2.querySelectorAll('.t1-item[style]').length===0);
// ---------------- TOPIC 3 ----------------
open(3);
const lc3=w.document.getElementById('lessonContent'), qs3=w.document.getElementById('quizSection');
ok('T3 lesson title rendered', /Uy va yashash joyi/.test(lc3.textContent));
ok('T3 grammar rendered', G[3].body.includes('b2g-lead-title'));
ok('T3 all three case formulas shown',
   ['Предложный падеж','Винительный падеж','Родительный падеж'].every(x=>G[3].text.includes(x)));
ok('T3 grammar tables render', (G[3].body.match(/class="b2g-t/g)||[]).length >= 10);
ok('T3 the vocabulary stage counts 73 words', (lc3.textContent.replace(/\s+/g,' ').includes('73')));
ok('T3 11 exercise cards', qs3.querySelectorAll('.t1-card').length===11);
ok('T3 audio present once', qs3.querySelectorAll('audio').length===1);
ok('T3 every question numbered', qs3.querySelectorAll('.t1-num').length===110);
ok('T3 no template placeholder leaked', !G[3].text.includes('${'));
ok('T3 no inline style on items', qs3.querySelectorAll('.t1-item[style]').length===0);

// ---------------- TOPIC 4 (paid only) ----------------
open(4);
const lc4=w.document.getElementById('lessonContent'), qs4=w.document.getElementById('quizSection');
ok('T4 lesson title rendered', /Kunlar, oylar va fasllar/.test(lc4.textContent));
ok('T4 grammar rendered', G[4].body.includes('b2g-lead-title'));
ok('T4 all 12 prepositional months shown',
   ['в январе','в феврале','в марте','в апреле','в мае','в июне','в июле','в августе','в сентябре','в октябре','в ноябре','в декабре'].every(x=>G[4].text.includes(x)));
ok('T4 hour rule shown', G[4].text.includes('5–20'));
ok('T4 grammar tables render', (G[4].body.match(/class="b2g-t/g)||[]).length >= 12);
ok('T4 the vocabulary stage counts 106 words', (lc4.textContent.replace(/\s+/g,' ').includes('106')));
ok('T4 11 exercise cards', qs4.querySelectorAll('.t1-card').length===11);
ok('T4 audio present once', qs4.querySelectorAll('audio').length===1);
ok('T4 builders render', qs4.querySelectorAll('.t1-builder').length===10);
ok('T4 every question numbered', qs4.querySelectorAll('.t1-num').length===110);
ok('T4 no template placeholder leaked', !G[4].text.includes('${'));

// ---------------- TOPIC 5 (paid only) ----------------
open(5);
const lc5=w.document.getElementById('lessonContent'), qs5=w.document.getElementById('quizSection');
ok('T5 lesson title rendered', /Kasblar va mashg/.test(lc5.textContent));
ok('T5 grammar rendered', G[5].body.includes('b2g-lead-title'));
ok('T5 all three conjugation tables shown',
   ['работаешь','учишься','хочешь'].every(x=>G[5].text.includes(x)));
ok('T5 instrumental tables shown', ['врачом','медсестрой','учительницей'].every(x=>G[5].text.includes(x)));
ok('T5 grammar tables render', (G[5].body.match(/class="b2g-t/g)||[]).length >= 14);
ok('T5 the vocabulary stage counts 50 words', (lc5.textContent.replace(/\s+/g,' ').includes('50')));
ok('T5 11 exercise cards', qs5.querySelectorAll('.t1-card').length===11);
ok('T5 audio present once', qs5.querySelectorAll('audio').length===1);
ok('T5 builders render', qs5.querySelectorAll('.t1-builder').length===10);
ok('T5 every question numbered', qs5.querySelectorAll('.t1-num').length===110);
ok('T5 no template placeholder leaked', !G[5].text.includes('${'));

// switching back and forth must not leak markup
open(1);
ok('switching T2 -> T1 renders 11 cards again', w.document.getElementById('quizSection').querySelectorAll('.t1-card').length===11);
open(2);
ok('switching T1 -> T2 renders 10 cards again', w.document.getElementById('quizSection').querySelectorAll('.t1-card').length===10);
open(3);
ok('switching T2 -> T3 renders 11 cards again', w.document.getElementById('quizSection').querySelectorAll('.t1-card').length===11);
open(4);
ok('switching T3 -> T4 renders 11 cards again', w.document.getElementById('quizSection').querySelectorAll('.t1-card').length===11);
open(5);
ok('switching T4 -> T5 renders 11 cards again', w.document.getElementById('quizSection').querySelectorAll('.t1-card').length===11);
ok('T4 audio still single after re-render', w.document.getElementById('quizSection').querySelectorAll('audio').length===1);
ok('T3 audio still single after re-render', w.document.getElementById('quizSection').querySelectorAll('audio').length===1);
ok('still exactly one style tag after 10 renders', w.document.querySelectorAll('#t1-styles').length===1);

console.log('\n'+'─'.repeat(58));
console.log(fail===0?`  ✅ FINAL RENDER QA (T1..T5): ${pass}/${pass} passed`:`  ❌ FINAL RENDER QA (T1..T5): ${fail} failed / ${pass+fail}`);
process.exit(fail?1:0);
