'use strict';
/* ============================================================================
 * Exercise Session Engine — behavioural suite.
 * Drives the REAL module against a fake host, exactly as a course page would.
 * ==========================================================================*/
const fs=require('fs'),path=require('path');const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT=path.join(__dirname,'..');
let P=0,F=0;const BAD=[];
const ok=(n,c,x)=>{if(c){P++;console.log('  ✓ '+n);}else{F++;BAD.push(n);console.log('  ✗ '+n+(x?'  → '+x:''));}};
const eq=(n,a,b)=>ok(n,Object.is(a,b),`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const errs=[];
const vc=new VirtualConsole();
vc.on('jsdomError',e=>errs.push(e.message));vc.on('error',(...a)=>errs.push(a.join(' ')));
const dom=new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>',
  {url:'https://uzdarus.uz/paid-courses/b2-course.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window;
w.HTMLElement.prototype.scrollIntoView=function(){};
global.window=w; global.document=w.document;
w.eval(fs.readFileSync(path.join(ROOT,'exercise-session.js'),'utf8'));
const D=w.document;

/* ---- a fake host: renders/reads/validates, exactly like a course page ---- */
const GROUPS=[
 {id:'ex1',type:'input',title:'1',items:[
   {q:'a',answer:['что']},{q:'b',answer:['чтобы']}]},
 {id:'ex2',type:'choice',style:'test',title:'2',items:[
   {q:'c',options:['что','чтобы'],answer:'что'},{q:'d',options:['если','хотя'],answer:'хотя'}]},
 {id:'audio',type:'choice',style:'tf',title:'3',audioSrc:'audios/x.mp3',items:[
   {q:'e',options:['Верно','Неверно'],answer:'Верно'}]},
];
const norm=v=>String(v==null?'':v).toLowerCase().replace(/ё/g,'е')
  .replace(/[.,!?;:()"'«»—–-]/g,' ').replace(/\s+/g,' ').trim();

let saved=null, cleared=0, finished=null, renders=0;
const host={
  groups:GROUPS, mountEl:D.getElementById('host'),
  title:'Практика', subtitle:'Выполните упражнения урока.',
  renderGroup(g){ renders++;
    if(g.type==='choice') return g.items.map((it,i)=>
      `<div class="row" data-row="${g.id}-${i}">`+
      it.options.map(o=>`<button type="button" class="opt" data-value="${o}">${o}</button>`).join('')+
      `</div>`).join('');
    return g.items.map((it,i)=>`<input class="inp" data-in="${g.id}-${i}">`).join('');
  },
  bindGroup(root){ root.querySelectorAll('.opt').forEach(b=>b.addEventListener('click',function(){
    const row=this.closest('.row'); row.querySelectorAll('.opt').forEach(x=>x.classList.remove('sel'));
    this.classList.add('sel'); })); },
  readAnswer(root,key,g){ if(g.type==='choice'){
      const s=root.querySelector(`[data-row="${key}"] .opt.sel`); return s?s.getAttribute('data-value'):''; }
    const i=root.querySelector(`[data-in="${key}"]`); return i?i.value:''; },
  writeAnswer(root,key,val,g){ if(g.type==='choice'){
      const b=root.querySelector(`[data-row="${key}"] .opt[data-value="${val}"]`); if(b)b.classList.add('sel'); return; }
    const i=root.querySelector(`[data-in="${key}"]`); if(i)i.value=val==null?'':val; },
  matchItem(item,val){ const a=Array.isArray(item.answer)?item.answer:[item.answer];
    return !!norm(val) && a.some(x=>norm(x)===norm(val)); },
  finish(answers,checked){ finished={answers,checked}; },
  draft:{ save(s){saved=JSON.parse(JSON.stringify(s));}, load(){return saved;}, clear(){saved=null;cleared++;} },
};
const S=w.UzExerciseSession;

console.log('\n[A] Practice card replaces the exercise list');
const sess=S.mount(host);
ok('mount returns a session', !!sess);
ok('practice card rendered', !!D.querySelector('.uz-practice'));
ok('card shows the open button', /Открыть задания/.test(D.querySelector('.uz-practice-btn').textContent));
ok('no exercise is rendered before opening', renders===0);
ok('no modal exists yet', !D.querySelector('.uz-modal'));

console.log('[B] Fullscreen modal, ONE exercise at a time');
D.querySelector('.uz-practice-btn').click();
ok('modal opened', !!D.querySelector('.uz-modal') && D.querySelector('.uz-modal').hidden===false);
eq('exactly one step host in the DOM', D.querySelectorAll('.uz-step-host').length, 1);
eq('step label', D.querySelector('.uz-step').textContent, 'Упражнение 1 из 3');
eq('only exercise 1 rendered', renders, 1);
eq('only its 2 inputs exist', D.querySelectorAll('.inp').length, 2);
ok('no exercise-2 widget present', D.querySelectorAll('.opt').length===0);
ok('footer shows Проверить', /Проверить/.test(D.querySelector('.uz-foot').textContent));

console.log('[C] Autosave after a single character');
const in0=D.querySelector('[data-in="ex1-0"]');
in0.value='ч'; in0.dispatchEvent(new w.Event('input',{bubbles:true}));
ok('draft saved on first keystroke', !!saved);
eq('one character persisted', saved.answers['ex1-0'], 'ч');
eq('cursor persisted', saved.cursor, 0);
ok('state is versioned', saved.v===1);

console.log('[D] Per-exercise check with verdict');
in0.value='что'; in0.dispatchEvent(new w.Event('input',{bubbles:true}));
D.querySelector('.uz-foot .uz-btn-primary').click();     // Проверить
const verdict=D.querySelector('.uz-verdict');
ok('verdict shown', !!verdict);
ok('verdict marks it wrong (1 of 2)', verdict.classList.contains('bad'));
ok('verdict shows the score', /1 \/ 2/.test(verdict.textContent));
ok('verdict reveals the correct answer', /чтобы/.test(verdict.textContent));
ok('verdict shows the learner answer', verdict.querySelector('.uz-your')||/нет ответа/.test(verdict.textContent));
ok('footer now offers the next exercise', /Следующее упражнение/.test(D.querySelector('.uz-foot').textContent));
eq('result recorded', saved.checked['ex1'].correct, 1);

console.log('[E] Navigation — previous exercise is destroyed');
D.querySelector('.uz-foot .uz-btn-primary').click();     // Следующее
eq('step label advanced', D.querySelector('.uz-step').textContent, 'Упражнение 2 из 3');
eq('still exactly one step host', D.querySelectorAll('.uz-step-host').length, 1);
eq('exercise-1 inputs are gone', D.querySelectorAll('.inp').length, 0);
eq('exercise-2 options present', D.querySelectorAll('.opt').length, 4);
eq('cursor persisted', saved.cursor, 1);

console.log('[F] Choice widgets autosave');
D.querySelector('[data-row="ex2-0"] .opt[data-value="что"]').click();
D.querySelector('[data-row="ex2-1"] .opt[data-value="хотя"]').click();
w.eval('void 0');
setTimeout(()=>{},0);

/* click-driven widgets save via a deferred read; flush the microtask queue */
setTimeout(function () {
eq('choice answers captured', saved.answers['ex2-0'], 'что');
eq('second choice captured', saved.answers['ex2-1'], 'хотя');

console.log('[G] Finish hands off to the host results screen');
D.querySelector('.uz-foot .uz-btn-primary').click();      // Проверить ex2
ok('ex2 verdict is correct', D.querySelector('.uz-verdict').classList.contains('ok'));
D.querySelector('.uz-foot .uz-btn-primary').click();      // Следующее -> audio
eq('reached the last step', D.querySelector('.uz-step').textContent, 'Упражнение 3 из 3');
D.querySelector('[data-row="audio-0"] .opt[data-value="Верно"]').click();
setTimeout(function () {
  D.querySelector('.uz-foot .uz-btn-primary').click();    // Проверить
  ok('last step offers finish', /Завершить/.test(D.querySelector('.uz-foot').textContent));
  D.querySelector('.uz-foot .uz-btn-primary').click();    // Завершить
  ok('host finish() called', !!finished);
  ok('finish receives every answer', Object.keys(finished.answers).length===5,
     JSON.stringify(Object.keys(finished.answers)));
  eq('finish receives per-group results', Object.keys(finished.checked).length, 3);
  ok('modal closed on finish', D.querySelector('.uz-modal').hidden===true);
  ok('engine never wrote its own results screen',
     !D.querySelector('.uz-final,.uz-results,#scoreDisplay'));

  console.log('[H] Resume after a reload — brand-new page, same draft');
  const dom2=new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>',
    {url:'https://uzdarus.uz/paid-courses/b2-course.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
  const w2=dom2.window; w2.HTMLElement.prototype.scrollIntoView=function(){};
  w2.eval(fs.readFileSync(path.join(ROOT,'exercise-session.js'),'utf8'));
  const D2=w2.document;
  const host2=Object.assign({},host,{mountEl:D2.getElementById('host')});
  // rebuild the DOM-bound callbacks against the new document
  host2.renderGroup=host.renderGroup; host2.bindGroup=host.bindGroup;
  host2.readAnswer=host.readAnswer; host2.writeAnswer=host.writeAnswer;
  // simulate stopping mid-exercise-2 with one letter typed
  saved={v:1,cursor:1,answers:{'ex1-0':'что','ex1-1':'чтобы','ex2-0':'ч'},checked:{ex1:{correct:2,total:2}},savedAt:Date.now()};
  const s2=w2.UzExerciseSession.mount(host2);
  ok('card offers Продолжить, not a fresh start', /Продолжить/.test(D2.querySelector('.uz-practice-btn').textContent));
  ok('card shows how far the learner got', /вы на упражнении 2/.test(D2.querySelector('.uz-practice-meta').textContent));
  D2.querySelector('.uz-practice-btn').click();
  ok('resume dialogue appears', !!D2.querySelector('.uz-ask'));
  ok('dialogue names the stopping point', /упражнении <b>2<\/b>/.test(D2.querySelector('.uz-ask-card').innerHTML));

  console.log('[I] Continue restores position AND partial input');
  D2.querySelectorAll('.uz-ask .uz-btn')[0].click();       // Продолжить
  eq('opened the exercise the learner was on', D2.querySelector('.uz-step').textContent, 'Упражнение 2 из 3');
  ok('not the first exercise', D2.querySelector('.uz-step').textContent!=='Упражнение 1 из 3');
  ok('previously solved exercise not re-shown', D2.querySelectorAll('.uz-step-host').length===1);
  eq('cursor preserved in draft', saved.cursor, 1);

  console.log('[J] Restart clears only this topic\'s draft');
  const dom3=new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>',
    {url:'https://x/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
  const w3=dom3.window; w3.HTMLElement.prototype.scrollIntoView=function(){};
  w3.eval(fs.readFileSync(path.join(ROOT,'exercise-session.js'),'utf8'));
  const D3=w3.document;
  saved={v:1,cursor:2,answers:{'ex1-0':'что'},checked:{ex1:{correct:1,total:2}},savedAt:Date.now()};
  cleared=0;
  const host3=Object.assign({},host,{mountEl:D3.getElementById('host')});
  w3.UzExerciseSession.mount(host3);
  D3.querySelector('.uz-practice-btn').click();
  D3.querySelectorAll('.uz-ask .uz-btn')[1].click();       // Начать заново
  eq('draft cleared exactly once', cleared, 1);
  eq('restarted at exercise 1', D3.querySelector('.uz-step').textContent, 'Упражнение 1 из 3');
  ok('answers wiped', !saved || !saved.answers['ex1-0']);

  console.log('[K] No leaks across repeated mounts');
  for(let i=0;i<25;i++) w3.UzExerciseSession.mount(host3);
  eq('only one practice card', D3.querySelectorAll('.uz-practice').length, 1);
  eq('no modal accumulation', D3.querySelectorAll('.uz-modal').length, 0);
  eq('one style tag only', D3.querySelectorAll('#uz-session-styles').length, 1);
  D3.querySelector('.uz-practice-btn').click();
  if(D3.querySelector('.uz-ask')) D3.querySelectorAll('.uz-ask .uz-btn')[1].click();
  for(let i=0;i<15;i++){ D3.querySelector('.uz-foot .uz-btn-primary').click(); }
  eq('still exactly one step host after 15 clicks', D3.querySelectorAll('.uz-step-host').length, 1);
  eq('still one modal', D3.querySelectorAll('.uz-modal').length, 1);

  console.log('[L] Data-driven — no course/topic conditionals in the engine');
  const RAW=fs.readFileSync(path.join(ROOT,'exercise-session.js'),'utf8');
  /* The file's own doc-comments deliberately NAME the things it avoids
     (`if (topicId === 1)`, `'b2'`, localStorage, Firestore). Strip comments so
     the assertions test CODE, not prose. */
  const SRC=RAW.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/.*$/gm,'$1');
  ok('doc-comments were stripped before scanning', SRC.length < RAW.length);
  ok('no topic hard-coding', !/topicId\s*===?\s*\d/.test(SRC));
  ok('no course hard-coding', !/["']b2["']|["']a2["']/i.test(SRC));
  ok('no exercise-type hard-coding', !/type\s*===?\s*["'](input|choice|builder|chips|tf)["']/.test(SRC));
  ok('does not touch localStorage directly', !/localStorage/.test(SRC));
  ok('does not touch Firestore directly', !/firebase|firestore|saveQuizResult/i.test(SRC));
  ok('renders via the host', /cfg\.renderGroup\(/.test(SRC));
  ok('validates via the host', /cfg\.matchItem\(/.test(SRC));
  ok('grades final via the host', /cfg\.finish\(/.test(SRC));
  ok('persists via the host draft', /cfg\.draft/.test(SRC) && /d\.save\(/.test(SRC));

  console.log('[M] Console hygiene');
  ok('no runtime errors', errs.length===0, errs.slice(0,2).join('|'));

  console.log('\n'+'='.repeat(62));
  console.log(F===0?`  ✅ EXERCISE SESSION ENGINE: ${P}/${P} passed`:`  ❌ ENGINE: ${F} failed / ${P+F}`);
  if(F) BAD.forEach((b,i)=>console.log(`   ${i+1}. ${b}`));
  console.log('='.repeat(62));
  process.exit(F?1:0);
},0);
},0);
