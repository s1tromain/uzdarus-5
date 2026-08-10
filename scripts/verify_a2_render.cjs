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
if(pre)w.eval(pre);
w.eval(main+'\n;window.__api={courseData:courseData,loadLesson:loadLesson};');
const t1=w.__api.courseData.topics.find(t=>t.id===1);

// render the full lesson (grammar + content + exercises)
w.__api.loadLesson(1);
const lc=w.document.getElementById('lessonContent');
const qs=w.document.getElementById('quizSection');
const D=w.document;
let pass=0,fail=0;const ok=(n,c)=>{if(c){pass++;console.log('  ✓ '+n)}else{fail++;console.log('  ✗ '+n)}};

ok('lesson title rendered', /«У меня есть» va kundalik hayotim/.test(lc.textContent));
ok('grammar section rendered', !!lc.querySelector('.grammar-section .b2g'));
ok('grammar lead present', !!lc.querySelector('.b2g-lead-title'));
ok('all 4 past-tense forms shown', ['был','была','было','были'].every(f=>lc.textContent.includes(f)));
ok('all 6 future forms shown', ['буду','будешь','будет','будем','будете','будут'].every(f=>lc.textContent.includes(f)));
ok('genitive-absence table rendered', lc.textContent.includes('Меня не было дома'));
ok('the ❌ wrong-form warning is shown', lc.textContent.includes('Мы не было'));
ok('possession formula shown', lc.textContent.includes('У + kim + есть + nima'));
ok('8 rules block rendered', lc.textContent.includes('8 ta qoida'));
ok('short formula table rendered', lc.textContent.includes('Menda kitob bor edi'));
ok('grammar tables render as real tables', lc.querySelectorAll('.b2g-t').length >= 4);
ok('no unclosed template braces leaked', !lc.textContent.includes('${'));
ok('vocabulary card preserved', lc.textContent.includes("Lug'atni ochish"));
ok('vocabulary card advertises 45 words', lc.textContent.includes("45 ta so'z"));
ok('explanation block preserved', !!lc.querySelector('.topic-explanation'));
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
w.__api.loadLesson(2);
const lc2=w.document.getElementById('lessonContent'), qs2=w.document.getElementById('quizSection');
ok('T2 lesson title rendered', /Oila va munosabatlar/.test(lc2.textContent));
ok('T2 grammar rendered', !!lc2.querySelector('.b2g-lead-title'));
ok('T2 past-tense suffixes shown', ['-л','-ла','-ло','-ли'].every(x=>lc2.textContent.includes(x)));
ok('T2 быть forms shown', ['был','была','было','были'].every(x=>lc2.textContent.includes(x)));
ok('T2 all possessive families shown', ['мой','твой','наш','ваш','его','её','их'].every(x=>lc2.textContent.includes(x)));
ok('T2 grammar tables render', lc2.querySelectorAll('.b2g-t').length >= 8);
ok('T2 no template placeholder leaked', !lc2.textContent.includes('${'));
ok('T2 vocabulary card advertises 79 words', lc2.textContent.includes("79 ta so'z"));
ok('T2 10 exercise cards', qs2.querySelectorAll('.t1-card').length===10);
ok('T2 audio present once', qs2.querySelectorAll('audio').length===1);
ok('T2 builder widgets render', qs2.querySelectorAll('.t1-builder').length===10);
ok('T2 every question numbered', qs2.querySelectorAll('.t1-num').length===100);
ok('T2 no inline style on items', qs2.querySelectorAll('.t1-item[style]').length===0);
// ---------------- TOPIC 3 ----------------
w.__api.loadLesson(3);
const lc3=w.document.getElementById('lessonContent'), qs3=w.document.getElementById('quizSection');
ok('T3 lesson title rendered', /Uy va yashash joyi/.test(lc3.textContent));
ok('T3 grammar rendered', !!lc3.querySelector('.b2g-lead-title'));
ok('T3 all three case formulas shown',
   ['Предложный падеж','Винительный падеж','Родительный падеж'].every(x=>lc3.textContent.includes(x)));
ok('T3 grammar tables render', lc3.querySelectorAll('.b2g-t').length >= 10);
ok('T3 vocabulary card advertises 73 words', lc3.textContent.includes("73 ta so'z"));
ok('T3 11 exercise cards', qs3.querySelectorAll('.t1-card').length===11);
ok('T3 audio present once', qs3.querySelectorAll('audio').length===1);
ok('T3 every question numbered', qs3.querySelectorAll('.t1-num').length===110);
ok('T3 no template placeholder leaked', !lc3.textContent.includes('${'));
ok('T3 no inline style on items', qs3.querySelectorAll('.t1-item[style]').length===0);

// ---------------- TOPIC 4 (paid only) ----------------
w.__api.loadLesson(4);
const lc4=w.document.getElementById('lessonContent'), qs4=w.document.getElementById('quizSection');
ok('T4 lesson title rendered', /Kunlar, oylar va fasllar/.test(lc4.textContent));
ok('T4 grammar rendered', !!lc4.querySelector('.b2g-lead-title'));
ok('T4 all 12 prepositional months shown',
   ['в январе','в феврале','в марте','в апреле','в мае','в июне','в июле','в августе','в сентябре','в октябре','в ноябре','в декабре'].every(x=>lc4.textContent.includes(x)));
ok('T4 hour rule shown', lc4.textContent.includes('5–20'));
ok('T4 grammar tables render', lc4.querySelectorAll('.b2g-t').length >= 12);
ok('T4 vocabulary card advertises 106 words', lc4.textContent.includes("106 ta so'z"));
ok('T4 11 exercise cards', qs4.querySelectorAll('.t1-card').length===11);
ok('T4 audio present once', qs4.querySelectorAll('audio').length===1);
ok('T4 builders render', qs4.querySelectorAll('.t1-builder').length===10);
ok('T4 every question numbered', qs4.querySelectorAll('.t1-num').length===110);
ok('T4 no template placeholder leaked', !lc4.textContent.includes('${'));

// ---------------- TOPIC 5 (paid only) ----------------
w.__api.loadLesson(5);
const lc5=w.document.getElementById('lessonContent'), qs5=w.document.getElementById('quizSection');
ok('T5 lesson title rendered', /Kasblar va mashg/.test(lc5.textContent));
ok('T5 grammar rendered', !!lc5.querySelector('.b2g-lead-title'));
ok('T5 all three conjugation tables shown',
   ['работаешь','учишься','хочешь'].every(x=>lc5.textContent.includes(x)));
ok('T5 instrumental tables shown', ['врачом','медсестрой','учительницей'].every(x=>lc5.textContent.includes(x)));
ok('T5 grammar tables render', lc5.querySelectorAll('.b2g-t').length >= 14);
ok('T5 vocabulary card advertises 50 words', lc5.textContent.includes("50 ta so'z"));
ok('T5 11 exercise cards', qs5.querySelectorAll('.t1-card').length===11);
ok('T5 audio present once', qs5.querySelectorAll('audio').length===1);
ok('T5 builders render', qs5.querySelectorAll('.t1-builder').length===10);
ok('T5 every question numbered', qs5.querySelectorAll('.t1-num').length===110);
ok('T5 no template placeholder leaked', !lc5.textContent.includes('${'));

// switching back and forth must not leak markup
w.__api.loadLesson(1);
ok('switching T2 -> T1 renders 11 cards again', w.document.getElementById('quizSection').querySelectorAll('.t1-card').length===11);
w.__api.loadLesson(2);
ok('switching T1 -> T2 renders 10 cards again', w.document.getElementById('quizSection').querySelectorAll('.t1-card').length===10);
w.__api.loadLesson(3);
ok('switching T2 -> T3 renders 11 cards again', w.document.getElementById('quizSection').querySelectorAll('.t1-card').length===11);
w.__api.loadLesson(4);
ok('switching T3 -> T4 renders 11 cards again', w.document.getElementById('quizSection').querySelectorAll('.t1-card').length===11);
w.__api.loadLesson(5);
ok('switching T4 -> T5 renders 11 cards again', w.document.getElementById('quizSection').querySelectorAll('.t1-card').length===11);
ok('T4 audio still single after re-render', w.document.getElementById('quizSection').querySelectorAll('audio').length===1);
ok('T3 audio still single after re-render', w.document.getElementById('quizSection').querySelectorAll('audio').length===1);
ok('still exactly one style tag after 10 renders', w.document.querySelectorAll('#t1-styles').length===1);

console.log('\n'+'─'.repeat(58));
console.log(fail===0?`  ✅ FINAL RENDER QA (T1..T5): ${pass}/${pass} passed`:`  ❌ FINAL RENDER QA (T1..T5): ${fail} failed / ${pass+fail}`);
process.exit(fail?1:0);
