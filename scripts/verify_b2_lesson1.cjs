'use strict';
/* B2 Lesson 1 driven end-to-end through the shared Exercise Session Engine. */
const fs=require('fs'),path=require('path');const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT=path.join(__dirname,'..');
let P=0,F=0;const BAD=[];
const ok=(n,c,x)=>{if(c){P++;}else{F++;BAD.push(n+(x?' → '+x:''));console.log('  ✗ '+n+(x?' → '+x:''));}};
const eq=(n,a,b)=>ok(n,Object.is(a,b),`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const errs=[];const vc=new VirtualConsole();
vc.on('jsdomError',e=>errs.push(e.message));vc.on('error',(...a)=>errs.push(a.join(' ')));
const dom=new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>',
  {url:'https://uzdarus.uz/paid-courses/b2-course.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window; w.HTMLElement.prototype.scrollIntoView=function(){};
w.eval(fs.readFileSync(path.join(ROOT,'exercise-session.js'),'utf8'));
w.eval(fs.readFileSync(path.join(ROOT,'b2-lesson-data.js'),'utf8'));
const D=w.document;
const topic=w.B2_LESSON_DATA.topics[0], GROUPS=topic.exercises;

console.log('\n[1] Content vs resource');
eq('10 exercise groups', GROUPS.length, 10);
eq('100 graded items', GROUPS.reduce((s,g)=>s+g.items.length,0), 100);
eq('group ids/order', GROUPS.map(g=>g.id).join(','), 'ex1,ex2,ex3,ex4,ex5,ex6,ex7,ex8,ex9,audio');
/* The types the host actually implements. `builder` was added for the
   sentence-assembly exercise; anything outside this list would render blank. */
const HOST_TYPES=['input','choice','builder'];
ok('only host-implemented types', GROUPS.every(g=>HOST_TYPES.includes(g.type)));
/* type dispatch lives in the shared presentation layer, not in any host */
ok('every declared type is handled by the shared exercise UI',
   HOST_TYPES.every(t=>t==='input'||new RegExp("g\\.type === '"+t+"'").test(
       fs.readFileSync(path.join(ROOT,'course-exercise-ui.js'),'utf8'))));
ok('only existing choice styles', GROUPS.filter(g=>g.type==='choice').every(g=>['chips','test','tf'].includes(g.style)));
// resource keys, verbatim
eq('3-mashq key is «что» for all 10 (resource: A,B,C,A,C,B,C,A,D,B)',
   GROUPS.find(g=>g.id==='ex3').items.every(i=>i.answer==='что'), true);
eq('listening keys match the resource Javoblar',
   GROUPS.find(g=>g.id==='audio').items.map(i=>i.answer).join(','),
   'Верно,Неверно,Верно,Верно,Неверно,Верно,Неверно,Верно,Верно,Верно');
eq('6-mashq cause/result keys',
   GROUPS.find(g=>g.id==='ex6').items.map(i=>i.answer).join('|'),
   'потому что|поэтому|поэтому|потому что|потому что|поэтому|поэтому|потому что|поэтому|потому что');
eq('1-mashq keys',
   GROUPS.find(g=>g.id==='ex1').items.map(i=>i.answer).join('|'),
   'что|чтобы|если|потому что|когда|что|хотя|чтобы|что|если');
eq('7-mashq keys',
   GROUPS.find(g=>g.id==='ex7').items.map(i=>i.answer).join('|'),
   'что|чтобы|Если|Хотя|потому что|поэтому|чтобы|Когда|Несмотря на то, что|что');
ok('8-mashq every item carries an explanation',
   GROUPS.find(g=>g.id==='ex8').items.every(i=>i.explanation&&i.explanation.trim()));
eq('audio wired to Lesson 1 file',
   GROUPS.find(g=>g.id==='audio').audioSrc,'audios/%D0%912%201%20%D1%83%D1%80%D0%BE%D0%BA.mp3');
ok('audio file exists', fs.existsSync(path.join(ROOT,decodeURIComponent(GROUPS.find(g=>g.id==='audio').audioSrc))));

console.log('[2] Host adapter + engine end-to-end');
const norm=v=>String(v==null?'':v).toLowerCase().replace(/ё/g,'е')
  .replace(/[.,!?;:()"'«»—–-]/g,' ').replace(/\s+/g,' ').trim();
let saved=null, finished=null;
const host={
  groups:GROUPS, mountEl:D.getElementById('host'), title:'Практика',
  renderGroup(g){ return g.items.map((it,i)=> g.type==='choice'
      ? `<div class="row" data-row="${g.id}-${i}">`+it.options.map(o=>
          `<button type="button" class="opt" data-value="${o.replace(/"/g,'&quot;')}">${o}</button>`).join('')+`</div>`
      : `<input class="inp" data-in="${g.id}-${i}">`).join('')
      + (g.audioSrc?`<audio controls><source src="../${g.audioSrc}"></audio>`:''); },
  bindGroup(root){ root.querySelectorAll('.opt').forEach(b=>b.addEventListener('click',function(){
    const r=this.closest('.row'); r.querySelectorAll('.opt').forEach(x=>x.classList.remove('sel')); this.classList.add('sel');})); },
  readAnswer(root,key,g){ if(g.type==='choice'){const s=root.querySelector(`[data-row="${key}"] .opt.sel`);return s?s.getAttribute('data-value'):'';}
    const i=root.querySelector(`[data-in="${key}"]`);return i?i.value:''; },
  writeAnswer(root,key,v,g){ if(g.type==='choice'){const b=root.querySelector(`[data-row="${key}"] .opt[data-value="${String(v).replace(/"/g,'&quot;')}"]`);if(b)b.classList.add('sel');return;}
    const i=root.querySelector(`[data-in="${key}"]`);if(i)i.value=v==null?'':v; },
  matchItem(item,val){const a=Array.isArray(item.answer)?item.answer:[item.answer];
    return !!norm(val)&&a.some(x=>norm(x)===norm(val));},
  finish(answers,checked){finished={answers,checked};},
  draft:{save(s){saved=JSON.parse(JSON.stringify(s));},load(){return saved;},clear(){saved=null;}},
};
const S=w.UzExerciseSession;
S.mount(host);
ok('practice card rendered instead of the exercise list', !!D.querySelector('.uz-practice'));
ok('no exercise in DOM before opening', D.querySelectorAll('.inp,.opt').length===0);
D.querySelector('.uz-practice-btn').click();
eq('step 1 of 10', D.querySelector('.uz-step').textContent, 'Упражнение 1 из 10');
eq('exactly one exercise in DOM', D.querySelectorAll('.uz-step-host').length, 1);
eq('only ex1 widgets present', D.querySelectorAll('.opt').length, 60); // 10 items x 6 chips
ok('no ex2 inputs present', D.querySelectorAll('.inp').length===0);

console.log('[3] Full pass — every group, every type');
(function run(){
  for(let step=0; step<GROUPS.length; step++){
    const g=GROUPS[step];
    const root=D.querySelector('.uz-step-host');
    g.items.forEach((it,i)=>{
      const key=g.id+'-'+i, first=Array.isArray(it.answer)?it.answer[0]:it.answer;
      if(g.type==='choice'){const b=root.querySelector(`[data-row="${key}"] .opt[data-value="${String(first).replace(/"/g,'&quot;')}"]`);if(b)b.click();}
      else{const inp=root.querySelector(`[data-in="${key}"]`);inp.value=first;inp.dispatchEvent(new w.Event('input',{bubbles:true}));}
    });
    D.querySelector('.uz-foot .uz-btn-primary').click();   // Проверить
    const v=D.querySelector('.uz-verdict');
    ok(`${g.id}: verdict shown`, !!v);
    ok(`${g.id}: all 10 correct`, v && v.classList.contains('ok'), v?v.textContent.slice(0,40):'');
    if(g.audioSrc) eq(`${g.id}: exactly one audio player`, D.querySelectorAll('.uz-step-host audio').length, 1);
    D.querySelector('.uz-foot .uz-btn-primary').click();   // Следующее / Завершить
  }
})();
ok('host.finish() called after the last exercise', !!finished);
eq('finish received all 100 answers', Object.keys(finished.answers).length, 100);
eq('finish received all 10 group results', Object.keys(finished.checked).length, 10);
eq('every group scored 10/10', Object.values(finished.checked).every(c=>c.correct===10&&c.total===10), true);
ok('engine wrote no results screen of its own', !D.querySelector('#scoreDisplay,.uz-results'));
ok('modal closed', D.querySelector('.uz-modal').hidden===true);
eq('only one modal ever created', D.querySelectorAll('.uz-modal').length, 1);
eq('one style tag', D.querySelectorAll('#uz-session-styles').length, 1);
ok('no runtime errors', errs.length===0, errs.slice(0,2).join('|'));

console.log('\n'+'='.repeat(62));
console.log(F===0?`  ✅ B2 LESSON 1 (data + engine): ${P}/${P} passed`:`  ❌ B2 LESSON 1: ${F} failed / ${P+F}`);
if(F) BAD.forEach((b,i)=>console.log(`   ${i+1}. ${b}`));
console.log('='.repeat(62));
process.exit(F?1:0);
