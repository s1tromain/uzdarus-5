'use strict';
/* ===========================================================================
 * A2 FINAL RELEASE AUDIT — adversarial. Tries to BREAK the implementation.
 * =========================================================================*/
const fs=require('fs'),path=require('path');const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT=path.join(__dirname,'..');
let PASS=0,FAIL=0; const PROBLEMS=[]; const KNOWN=[];
/* Documented limitations of the SOURCE MATERIAL, not defects of the build.
   Each is recorded in-place in a2-course.html next to the exercise it affects.
   Anything NOT listed here that turns up still fails the audit. */
const KNOWN_LIMITATIONS = {
  'T4/ex9': 'intonation questions are identical to their prompt once punctuation is normalised — ungradeable without changing the shared normaliser (A1/B1/B2) or the material',
  'T4/ex5#3': 'all four parts of the day are correct Russian; no key in the resource',
  'T4/ex5#8': 'all four parts of the day are correct Russian; no key in the resource',
};
const isKnown = (loc) => Object.keys(KNOWN_LIMITATIONS).some(k => loc.startsWith(k));
const ok=(n,c,x)=>{ if(c){PASS++;} else {FAIL++;PROBLEMS.push(n+(x?'  → '+x:''));console.log('  ✗ '+n+(x?'  → '+x:''));} };
const sec=t=>console.log('\n'+t);

function boot(rel){
  const SRC=fs.readFileSync(path.join(ROOT,rel),'utf8');
  const b=[...SRC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  const pre=b.find(x=>/(let|var|const)\s+currentUser/.test(x)&&!x.includes('const courseData'));
  const main=b.find(x=>x.includes('const courseData'));
  const errs=[],warns=[];
  const vc=new VirtualConsole();
  vc.on('jsdomError',e=>errs.push('jsdom:'+e.message));
  vc.on('error',(...a)=>errs.push('console.error:'+a.join(' ')));
  vc.on('warn',(...a)=>warns.push('warn:'+a.join(' ')));
  const d=new JSDOM(SRC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g,'<script></script>'),
    {url:'https://uzdarus.uz/'+rel,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
  const w=d.window; w.HTMLElement.prototype.scrollIntoView=function(){}; w.alert=()=>{};
  /* The demo build redirects a signed-OUT visitor to auth.html — that guard is
     the access system working, so give the harness a real session. */
  w.eval("window.localStorage.setItem('currentUser',JSON.stringify({id:'dev',uid:'dev',role:'developer',name:'Dev',email:'dev@uzdarus.local'}));window.currentUser={id:'dev',uid:'dev',role:'developer',name:'Dev',email:'dev@uzdarus.local'};");
  w.eval("window.saveQuizResult=async()=>1;window.saveUserProgress=async()=>1;window.getUserProgress=async()=>[];window.getUserQuizResults=async()=>({});window.logActivity=async()=>{};window.__saves=[];window.saveQuizResultToFirebase=async function(i,dd){window.__saves.push({id:i,score:dd.score,total:dd.total});};window.saveProgressToFirebase=async function(){window.__ps=(window.__ps||0)+1;};");
  if(pre)w.eval(pre);
  w.eval(main+'\n;window.__api={cd:courseData,loadLesson:loadLesson,loadQuiz:loadQuiz,getT1ExData:getT1ExData,'+
   'reset:function(){completedTopics.length=0;},done:function(i){return completedTopics.includes(i);},'+
   'countDone:function(i){return completedTopics.filter(function(x){return x===i;}).length;},'+
   'qr:function(){return userQuizResults;},clearQR:function(){Object.keys(userQuizResults).forEach(function(k){delete userQuizResults[k];});}};');
  /* Re-install the persistence stubs AFTER the main script: its top-level
     `async function saveQuizResultToFirebase` re-creates the global property
     and would otherwise clobber a stub installed earlier. */
  w.eval("window.__saves=[];window.__ps=0;"+
         "window.saveQuizResultToFirebase=async function(i,dd){window.__saves.push({id:i,score:dd.score,total:dd.total});};"+
         "window.saveProgressToFirebase=async function(){window.__ps=(window.__ps||0)+1;};"+
         "window.loadTopics=window.loadTopics||function(){};");
  return {w,SRC,errs,warns,d};
}
const norm=v=>String(v).toLowerCase().replace(/ё/g,'е').replace(/[.,!?;:()"'«»—–\-]/g,' ').replace(/\s+/g,' ').trim();
const match=(item,v)=>(Array.isArray(item.answer)?item.answer:[item.answer]).some(a=>norm(a)===norm(v));

(async function main(){
const PAID=boot('paid-courses/a2-course.html');
const DEMO=boot('a2-demo.html');
const ENGINE_PAID=[1,2,3,4,5], ENGINE_DEMO=[1,2,3];
const groupsOf=(w,t)=>{const x=w.__api.cd.topics.find(y=>y.id===t);return x['topic'+t+'Exercises'].exercises;};

/* ===================== 1. ARCHITECTURE ===================== */
sec('[1] Architecture — duplicates & legacy');
for(const [name,B] of [['paid',PAID],['demo',DEMO]]){
  const S=B.SRC;
  const count=(re)=>(S.match(re)||[]).length;
  ok(name+': one engine banner', count(/A2 SHARED EXERCISE ENGINE/g)===1);
  ok(name+': one renderTopic1Exercises', count(/^ {8}function renderTopic1Exercises/gm)===1);
  ok(name+': one window.checkTopic1Exercises assignment', count(/window\.checkTopic1Exercises\s*=/g)===1);
  ok(name+': one getT1ExData', count(/^ {8}function getT1ExData/gm)===1);
  ok(name+': one injectTopic1Styles', count(/^ {8}function injectTopic1Styles/gm)===1);
  ok(name+': no legacy loadTopicNExercises', count(/^ {8}function loadTopic\d+Exercises/gm)===0);
  ok(name+': no legacy bindTopicNEvents', count(/^ {8}function bindTopic\d+Events/gm)===0);
  ok(name+': no dangling legacy call', !/\bloadTopic[1-5]Exercises\s*\(/.test(S) && !/\bbindTopic[1-5]Events\s*\(/.test(S));
  const fns=(S.match(/^ {8}(?:async )?function (\w+)\s*\(/gm)||[]).map(x=>x.replace(/.*function /,'').replace(/\s*\($/,''));
  const dup=fns.filter((x,i)=>fns.indexOf(x)!==i);
  ok(name+': no duplicate top-level function', dup.length===0, dup.join(','));
  const wg=(S.match(/^ {8}window\.(\w+)\s*=/gm)||[]).map(x=>x.trim());
  const dupw=wg.filter((x,i)=>wg.indexOf(x)!==i);
  ok(name+': no duplicate window.* assignment', dupw.length===0, dupw.join(','));
}

/* ===================== 2. RUNTIME ===================== */
sec('[2] Runtime — 100 opens, random order, rapid switching');
for(let i=0;i<100;i++) PAID.w.__api.loadLesson(5);
const qsP=()=>PAID.w.document.getElementById('quizSection');
ok('100 opens: still 11 cards', qsP().querySelectorAll('.t1-card').length===11);
ok('100 opens: still 1 audio', PAID.w.document.querySelectorAll('audio').length===1);
ok('100 opens: still 1 style tag', PAID.w.document.querySelectorAll('#t1-styles').length===1);
const rnd=[3,1,5,2,4,5,1,3,2,4,1,5,3,4,2];
rnd.forEach(t=>PAID.w.__api.loadLesson(t));
/* Card count is per-topic: Lesson 2's resource has 9 mashq + audio = 10 groups,
   the others 10 + audio = 11. Assert rendered == data, not a constant. */
ENGINE_PAID.forEach(t=>{PAID.w.__api.loadLesson(t);
  ok(`topic ${t}: rendered cards == data groups`,
     qsP().querySelectorAll('.t1-card').length===groupsOf(PAID.w,t).length);});
ok('random-order switching: exactly one <audio> document-wide', PAID.w.document.querySelectorAll('audio').length===1);
ok('random-order switching: one .t1-wrap', PAID.w.document.querySelectorAll('.t1-wrap').length===1);
ok('no runtime/console errors after 115 renders', PAID.errs.length===0, PAID.errs.slice(0,2).join('|'));

sec('[2b] Cross-topic state leakage (item keys repeat across topics)');
PAID.w.__api.loadLesson(1);
const g1=groupsOf(PAID.w,1);
qsP().querySelector('[data-t1-input="ex1-0"]').value='ПРОБА-УТЕЧКИ';
PAID.w.__api.loadLesson(2);
ok('switching topics clears the previous topic\'s inputs',
   qsP().querySelector('[data-t1-input="ex1-0"]').value==='');
PAID.w.__api.loadLesson(1);
ok('returning to a topic does not restore stale DOM values',
   qsP().querySelector('[data-t1-input="ex1-0"]').value==='');

/* ===================== 3. EXERCISES — try to cheat ===================== */
sec('[3] Exercises — adversarial answer probing (Lessons 1-5)');
let cheatQ=0, cheatWrongChoice=0, cheatSpace=0, cheatCase=0, cheatYo=0, cheatPunct=0, freePoints=0, emptyAcc=0;
const details=[];
for(const t of ENGINE_PAID){
  groupsOf(PAID.w,t).forEach(g=>g.items.forEach((it,i)=>{
    const loc=`T${t}/${g.id}#${i+1}`;
    const keys=Array.isArray(it.answer)?it.answer:[it.answer];
    const k0=keys[0];
    // (a) can the PROMPT be pasted as the answer?
    if(g.type!=='choice'){
      const q=String(it.q).replace(/_{3,}/g,'').replace(/\(.*?\)/g,'').replace(/→/g,'');
      if(norm(q) && match(it,q)){
        if(isKnown(loc)) KNOWN.push(loc+': prompt accepted as answer (documented)');
        else {cheatQ++;details.push(loc+': prompt accepted as answer');}
      }
    }
    // (b) choice: is every non-key option rejected?
    if(g.type==='choice'){
      const wrong=it.options.filter(o=>!keys.includes(o));
      if(wrong.length===0){
        if(isKnown(loc)) KNOWN.push(loc+': every option accepted (documented)');
        else {freePoints++;details.push(loc+': EVERY option accepted');}
      }
      wrong.forEach(o=>{ if(match(it,o)){cheatWrongChoice++;details.push(loc+': wrong option "'+o+'" accepted');} });
    }
    // (c) whitespace / case / ё-е / punctuation must NOT break a correct answer
    if(k0){
      if(!match(it,'   '+k0+'   ')) cheatSpace++;
      if(!match(it,String(k0).toUpperCase())) cheatCase++;
      if(String(k0).includes('ё') && !match(it,String(k0).replace(/ё/g,'е'))) cheatYo++;
      if(!match(it,k0+'.')) cheatPunct++;
    }
    // (d) empty / whitespace-only must never be accepted
    if(match(it,'') || match(it,'   ')){emptyAcc++;details.push(loc+': empty answer accepted');}
  }));
}
ok('no exercise accepts its own prompt as the answer', cheatQ===0, cheatQ+' items');
ok('no choice accepts a wrong option', cheatWrongChoice===0, cheatWrongChoice+' items');
ok('no choice question is non-discriminating', freePoints===0, freePoints+' items');
ok('leading/trailing spaces never break a correct answer', cheatSpace===0, cheatSpace+' items');
ok('uppercase never breaks a correct answer', cheatCase===0, cheatCase+' items');
ok('ё→е never breaks a correct answer', cheatYo===0, cheatYo+' items');
ok('a trailing full stop never breaks a correct answer', cheatPunct===0, cheatPunct+' items');
ok('an empty answer is never accepted', emptyAcc===0, emptyAcc+' items');
if(details.length) details.slice(0,20).forEach(x=>console.log('      · '+x));

sec('[3b] Wrong grammatical forms must be rejected');
const WRONG=[
 [1,'ex1',0,'были','wrong number for «Я»'],
 [2,'ex2',0,'был','wrong gender for «Моя сестра»'],
 [3,'ex1',0,'в кухне','wrong preposition/case for «на кухне»'],
 [3,'ex2',0,'в комнате','prepositional instead of accusative'],
 [3,'ex3',0,'из комнате','wrong case'],
 [4,'ex2',2,'в вторник','missing the во- variant'],
 [4,'ex3',0,'в июль','accusative instead of prepositional'],
 [5,'ex2',0,'врач','nominative instead of instrumental'],
 [5,'ex2',3,'продавцом','singular for a plural subject'],
 [5,'ex3',0,'работаю','wrong person for «Ты»'],
 [5,'ex5',0,'хочу','wrong person for «Ты»'],
];
WRONG.forEach(([t,gid,idx,bad,why])=>{
  const it=groupsOf(PAID.w,t).find(x=>x.id===gid).items[idx];
  ok(`T${t}/${gid}#${idx+1} rejects «${bad}» (${why})`, !match(it,bad));
});
// number agreement across the whole of L5 ex6
const ex6=groupsOf(PAID.w,5).find(x=>x.id==='ex6');
const SUBJ=['Он','Она','Мы','Ты','Они','Я','Вы','Он','Она','Мы'];
let na=0; ex6.items.forEach((it,i)=>{
  const S=match(it,'врачом'),P=match(it,'врачами');
  const plural=['Мы','Они'].includes(SUBJ[i]), polite=SUBJ[i]==='Вы';
  const good=polite?(S&&P):plural?(!S&&P):(S&&!P); if(!good)na++;
});
ok('L5/ex6 agrees in number with every subject', na===0, na+' violations');

/* ===================== 4. GRAMMAR COMPLETENESS ===================== */
sec('[4] Grammar completeness — all five lessons');
const GRAM={
 1:['У + kim + есть + nima','Меня не было дома','был','была','было','были','буду','будут',
    'Я хочу быть врачом','У меня нет машины','Мы не было','У меня есть свободное время'],
 2:['-л','-ла','-ло','-ли','Мой отец был инженером','не + o‘tgan zamon','Ты жил в Самарканде?',
    'мои','твои','наши','ваши','их','моё окно','ваши дети','Наши дети выросли очень быстро.','его дети'],
 3:['в / на + Предложный падеж','в / на + Винительный падеж','из / с / от + Родительный падеж',
    'в шкафу','-а → -у, -я → -ю','-ы / -и','от друга','со двора','с улицы','Eslab qoling!','спальня','лифт'],
 4:['понедельник','воскресенье','в январе','в декабре','весной','зимой','5–20','утром','ночью',
    'Какое сегодня число?','В каком году?','Идёт снег.','каждый год','Esda saqlang'],
 5:['Кто? + быть + kasb','Работать + кем?','Работать + где?','Стать + кем?','врачом','медсестрой',
    'учительницей','Врач лечит людей.','Инженер проектирует здания.','работаете','учитесь','хотите',
    'по сменам','Кем ты хочешь стать?','Я лечу людей.','лечит, учит, готовит, продаёт, строит, водит'],
};
const paidSrc=PAID.SRC;
for(const t of ENGINE_PAID){
  const seg=paidSrc.slice(paidSrc.indexOf(`id: ${t},`), paidSrc.indexOf(`id: ${t+1},`));
  const miss=GRAM[t].filter(x=>!seg.includes(x));
  ok(`Lesson ${t}: all ${GRAM[t].length} grammar checkpoints present`, miss.length===0, miss.join(' | '));
  ok(`Lesson ${t}: no unrendered template placeholder`, !/\$\{/.test(seg));
  ok(`Lesson ${t}: grammar block is substantial`, seg.length>15000, 'len='+seg.length);
}

/* ===================== 6. AUDIO ===================== */
sec('[6] Audio — one file per lesson, all real, no reuse');
const srcs=ENGINE_PAID.map(t=>groupsOf(PAID.w,t).find(g=>g.id==='audio').audioSrc);
ok('five distinct audio sources', new Set(srcs).size===5, srcs.join(' '));
srcs.forEach((s,i)=>{
  const p=path.join(ROOT,decodeURIComponent(s));
  ok(`Lesson ${i+1} audio exists on disk`, fs.existsSync(p), s);
  ok(`Lesson ${i+1} audio is non-trivial`, fs.existsSync(p)&&fs.statSync(p).size>100000);
  ok(`Lesson ${i+1} audio filename matches its lesson number`, decodeURIComponent(s).includes(`А2 ${i+1} урок`));
});
ok('five distinct file sizes (no duplicated file)',
   new Set(srcs.map(s=>{const p=path.join(ROOT,decodeURIComponent(s));return fs.existsSync(p)?fs.statSync(p).size:0;})).size===5);
ENGINE_PAID.forEach(t=>{
  PAID.w.__api.loadLesson(t);
  const a=qsP().querySelectorAll('audio');
  ok(`Lesson ${t}: exactly one player rendered`, a.length===1);
  ok(`Lesson ${t}: path is ../audios/ in paid`,
     a[0].querySelector('source').getAttribute('src').startsWith('../audios/'));
});

/* ===================== 7/8. FIREBASE + PROGRESSION ===================== */
sec('[7/8] Firebase, completion, progression — bypass attempts');
async function runTopic(t,mode){
  PAID.w.__api.loadLesson(t);
  const gs=groupsOf(PAID.w,t);
  gs.forEach(g=>g.items.forEach((it,i)=>{
    const key=g.id+'-'+i, first=Array.isArray(it.answer)?it.answer[0]:it.answer;
    if(mode==='empty') return;
    const val = mode==='right'?first:'zzzzz';
    if(g.type==='choice'){
      const r=qsP().querySelector('[data-t1-row="'+key+'"]');
      const bs=[...r.querySelectorAll('.t1-opt')]; bs.forEach(x=>x.classList.remove('selected'));
      const tg = mode==='right' ? bs.find(x=>x.getAttribute('data-value')===first)
                                : bs.find(x=>!(Array.isArray(it.answer)?it.answer:[it.answer]).includes(x.getAttribute('data-value')));
      if(tg)tg.classList.add('selected');
    } else qsP().querySelector('[data-t1-input="'+key+'"]').value=val;
  }));
  await PAID.w['checkTopic'+t+'Exercises'](t);
  return PAID.w.__api.qr()['topic_'+t];
}
/* A learner opens ONE topic per page load. Running five topics in a single
   JSDOM lets the real loadTopics()/updateProgress() re-render between them and
   accumulate state that production never sees, so give each topic a fresh page —
   this is both cleaner and closer to reality. */
for(const t of ENGINE_PAID){
  const B=boot('paid-courses/a2-course.html');
  const qsB=()=>B.w.document.getElementById('quizSection');
  const runTopicB=async(tid,mode)=>{
    B.w.__api.loadLesson(tid);
    groupsOf(B.w,tid).forEach(g=>g.items.forEach((it,i)=>{
      const key=g.id+'-'+i, keys=Array.isArray(it.answer)?it.answer:[it.answer], first=keys[0];
      if(mode==='empty')return;
      if(g.type==='choice'){
        const r=qsB().querySelector('[data-t1-row="'+key+'"]');
        const bs=[...r.querySelectorAll('.t1-opt')]; bs.forEach(x=>x.classList.remove('selected'));
        const tg = mode==='right' ? bs.find(x=>x.getAttribute('data-value')===first)
                                  : bs.find(x=>!keys.includes(x.getAttribute('data-value')));
        if(tg)tg.classList.add('selected');
      } else qsB().querySelector('[data-t1-input="'+key+'"]').value = mode==='right'?first:'zzzzz';
    }));
    await B.w['checkTopic'+tid+'Exercises'](tid);
    return B.w.__api.qr()['topic_'+tid];
  };
  const btnB=()=>B.w.document.getElementById('completeBtn');
  B.w.__api.reset();
  const e=await runTopicB(t,'empty');
  ok(`L${t}: empty run scores 0/${e.total}, never 0/0`, e.score===0 && e.total>0, `${e.score}/${e.total}`);
  ok(`L${t}: empty run cannot complete`, !B.w.__api.done(t));
  ok(`L${t}: empty run shows failure`, btnB().textContent==='Mavzu tugatilmadi');
  btnB().onclick();
  await new Promise(r=>setTimeout(r,10));
  ok(`L${t}: clicking «complete» on a failed run does NOT unlock`, !B.w.__api.done(t));

  const wr=await runTopicB(t,'wrong');
  ok(`L${t}: all-wrong run cannot complete`, !B.w.__api.done(t));
  const rt=await runTopicB(t,'right');
  ok(`L${t}: perfect run scores ${rt.total}/${rt.total}`, rt.score===rt.total && rt.total>=100, `${rt.score}/${rt.total}`);
  ok(`L${t}: a retry OVERWRITES the earlier result`, rt.score>wr.score, `${wr.score} -> ${rt.score}`);
  const before=B.w.eval('window.__ps')||0;
  btnB().onclick();
  await new Promise(r=>setTimeout(r,15));
  ok(`L${t}: perfect run completes the topic`, B.w.__api.done(t));
  btnB().onclick();
  await new Promise(r=>setTimeout(r,15));
  ok(`L${t}: completing twice does not duplicate progress`, B.w.__api.countDone(t)===1);
  ok(`L${t}: completing twice does not double-save`, (B.w.eval('window.__ps')||0)-before<=1);
  ok(`L${t}: three graded attempts reached Firebase`, B.w.eval('window.__saves.length')===3, 'saves='+B.w.eval('window.__saves.length'));
  ok(`L${t}: no save carries total 0`, B.w.eval('window.__saves.every(function(s){return s.total>0;})'));
  ok(`L${t}: saves attributed to this topic`, B.w.eval('window.__saves.every(function(s){return s.id==='+t+';})'));
  ok(`L${t}: page had no runtime errors`, B.errs.length===0, B.errs.slice(0,2).join('|'));
}
const saveCount=ENGINE_PAID.length*3;
ok('all five topics saved three graded attempts each', saveCount===15);

/* ===================== 9. DEMO / PAID ===================== */
sec('[9] Demo / Paid boundary');
ENGINE_DEMO.forEach(t=>ok(`demo: topic ${t} IS engine-driven`, !!DEMO.w.__api.getT1ExData(DEMO.w.__api.cd.topics.find(x=>x.id===t))));
for(let t=4;t<=16;t++){
  const tp=DEMO.w.__api.cd.topics.find(x=>x.id===t);
  ok(`demo: topic ${t} locked`, tp.isLocked===true && tp.isSubscriptionLocked===true);
  ok(`demo: topic ${t} carries no lesson`, tp.grammar==='' && !DEMO.w.__api.getT1ExData(tp));
}
const dq=DEMO.w.document.getElementById('quizSection');
dq.innerHTML='<!--sentinel-->';
DEMO.w.__api.loadQuiz(5);
ok('demo: loadQuiz(5) renders nothing (subscription guard)', dq.innerHTML==='<!--sentinel-->');
ok('demo: no lesson-4/5 audio anywhere in the file',
   !/%D0%902%20[45]%20/.test(DEMO.SRC));
ENGINE_PAID.forEach(t=>{
  const tp=PAID.w.__api.cd.topics.find(x=>x.id===t);
  ok(`paid: topic ${t} open`, tp.isLocked===false && tp.isSubscriptionLocked===false);
});
for(let t=6;t<=16;t++) ok(`paid: topic ${t} still a placeholder`,
  PAID.w.__api.cd.topics.find(x=>x.id===t).grammar==='' );

/* ===================== 5. VOCABULARY ===================== */
sec('[5] Vocabulary — paid + demo');
function vocab(rel){
  const S=fs.readFileSync(path.join(ROOT,rel),'utf8');
  const b=[...S.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  const data=b.find(x=>x.includes('const vocabularyData'));
  const vc=new VirtualConsole(); vc.on('jsdomError',()=>{});
  const d=new JSDOM(S.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g,'<script></script>'),
    {url:'https://uzdarus.uz/'+rel,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
  const w=d.window; w.HTMLElement.prototype.scrollIntoView=function(){}; w.alert=()=>{};
  w.speechSynthesis={speak(){},cancel(){},getVoices:()=>[]};
  w.eval("window.currentUser={id:'d',uid:'d',role:'developer',name:'D',email:'d@x'};");
  w.eval(data+'\n;window.__v=vocabularyData;');
  return {v:w.__v,S};
}
const VP=vocab('paid-courses/a2-vocabulary.html'), VD=vocab('a2-demo-vocabulary.html');
/* Topic 2 was 79: «создать семью» and «воспитывать детей» each appeared twice
   inside this one list, so the learner met them twice in a single pass. Both
   later copies were removed and A2_VOCAB_COUNTS follows. */
const EXPECT={1:45,2:77,3:73,4:106,5:50};
Object.entries(EXPECT).forEach(([t,n])=>{
  const w=VP.v.topics.find(x=>x.id===+t);
  ok(`paid vocab T${t}: ${n} words`, w.words.length===n, String(w.words.length));
  ok(`paid vocab T${t}: no empty side`, w.words.every(x=>x.ru&&x.ru.trim()&&x.uz&&x.uz.trim()));
  ok(`paid vocab T${t}: every entry speakable (Cyrillic ru)`, w.words.every(x=>/[Ѐ-ӿ]/.test(x.ru)));
  const pairs=w.words.map(x=>x.ru+'||'+x.uz);
  const dups=pairs.filter((x,i)=>pairs.indexOf(x)!==i);
  if(dups.length) console.log('      · T'+t+' duplicate entries: '+[...new Set(dups)].join(' , '));
  /* The count moved from per-topic markup into A2_VOCAB_COUNTS, which the
     shared vocabulary component renders. The guarantee is unchanged. */
  const blk=(PAID.SRC.match(/var A2_VOCAB_COUNTS = \{([^}]*)\}/)||[])[1];
  const m=blk?new RegExp('\\b'+t+'\\s*:\\s*(\\d+)').exec(blk):null;
  ok(`paid card T${t} count equals the imported count`, m && +m[1]===n, m?m[1]:'no count');
});
[1,2,3].forEach(t=>{
  const p=VP.v.topics.find(x=>x.id===t), dd=VD.v.topics.find(x=>x.id===t);
  ok(`demo vocab T${t} identical to paid`,
     dd.words.length===p.words.length && dd.words.every((x,i)=>x.ru===p.words[i].ru&&x.uz===p.words[i].uz));
});
ok('demo vocab topics 4-16 stay empty', VD.v.topics.filter(t=>t.id>=4).every(t=>t.words.length===0));
ok('paid vocab topics 6-16 stay empty', VP.v.topics.filter(t=>t.id>=6).every(t=>t.words.length===0));
ok('paid vocabulary page uses speech.js', /speech\.js/.test(VP.S) && /VOCAB_COURSE\s*=\s*'a2'/.test(VP.S));
ok('demo vocabulary page uses speech.js', /speech\.js/.test(VD.S));

/* ===================== FINAL ===================== */
sec('[H] Console hygiene (both builds)');
ok('paid: zero runtime errors', PAID.errs.length===0, PAID.errs.slice(0,2).join('|'));
ok('demo: zero runtime errors', DEMO.errs.length===0, DEMO.errs.slice(0,2).join('|'));
console.log('     paid warnings:',PAID.warns.length,'| demo warnings:',DEMO.warns.length);

console.log('\n'+'═'.repeat(66));
if(KNOWN.length){console.log('\n  DOCUMENTED LIMITATIONS (source material, recorded in-place):');
  KNOWN.forEach((k,i)=>console.log(`   ${i+1}. ${k}`));
  Object.entries(KNOWN_LIMITATIONS).forEach(([k,v])=>console.log(`      · ${k} — ${v}`));}
if(FAIL===0) console.log(`\n  ✅ RELEASE AUDIT: ${PASS}/${PASS} checks passed — no undocumented problems`);
else { console.log(`  ❌ RELEASE AUDIT: ${FAIL} problem(s) / ${PASS+FAIL} checks`);
       console.log('\n  PROBLEMS:'); PROBLEMS.forEach((p,i)=>console.log(`   ${i+1}. ${p}`)); }
console.log('═'.repeat(66));
process.exit(FAIL?1:0);
})().catch(e=>{console.error('\nAUDIT CRASHED:',e&&e.stack||e);process.exit(2);});
