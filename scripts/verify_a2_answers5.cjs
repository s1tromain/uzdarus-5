'use strict';
/* ============================================================================
 * A2 · Lesson 5 — ANSWER-KEY CROSS-CHECK + vocabulary + word-count auto-sync.
 * The resource supplies an explicit key only for the «Правда или ложь?» task.
 * Mashqlar 1-10 keys are derived from this lesson's own tables (Кто? / Кем? →
 * instrumental, Где? → в|на + prepositional, работать/учиться/хотеть
 * conjugations, стать + кем?).
 * ==========================================================================*/
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? '\n      ' + x : '')); } };
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), `expected ${JSON.stringify(b)}\n      got      ${JSON.stringify(a)}`);

const SRC = fs.readFileSync(path.join(ROOT, 'paid-courses/a2-course.html'), 'utf8');
const blocks = [...SRC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const pre = blocks.find(b => /(let|var|const)\s+currentUser/.test(b) && !b.includes('const courseData'));
const main = blocks.find(b => b.includes('const courseData'));
const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
const dom = new JSDOM(SRC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g, '<script></script>'),
  { url: 'https://uzdarus.uz/paid-courses/a2-course.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
w.HTMLElement.prototype.scrollIntoView = function () {}; w.alert = () => {};
w.eval("window.saveQuizResult=async()=>1;window.saveUserProgress=async()=>1;window.getUserProgress=async()=>[];window.getUserQuizResults=async()=>({});window.logActivity=async()=>{};");
if (pre) w.eval(pre);
w.eval(main + '\n;window.__cd=courseData;');
const t5 = w.__cd.topics.find(t => t.id === 5);
const g = {}; t5.topic5Exercises.exercises.forEach(x => { g[x.id] = x; });

console.log('\n─── prompts (verbatim from the resource) ───');
const P = {
 ex1:["Men o'qituvchiman.","U haydovchi.","Biz muhandismiz.","Sen oshpazsan.","U hamshira.",
      "Ular sotuvchilar.","Men dasturchiman.","Siz bank xodimisiz.","U politsiyachi.","Biz talabamiz."],
 ex2:["Она работает (врач).","Он работает (инженер).","Я работаю (повар).","Мы работаем (продавец).",
      "Они работают (водитель).","Ты работаешь (программист).","Она работает (медсестра).",
      "Вы работаете (парикмахер).","Он работает (полицейский).","Мы работаем (официант)."],
 ex3:["Ты ______ в магазине.","Он ______ в больнице.","Мы ______ в офисе.","Они ______ на заводе.",
      "Вы ______ в банке.","Она ______ в ресторане.","Я ______ каждый день.","Мы ______ вместе.",
      "Ты ______ утром.","Они ______ вечером."],
 ex4:["Он работает ___ больнице.","Она работает ___ магазине.","Мы работаем ___ заводе.",
      "Они работают ___ рынке.","Ты работаешь ___ офисе.","Я работаю ___ фабрике.",
      "Он работает ___ университете.","Она работает ___ почте.","Мы работаем ___ банке.",
      "Они работают ___ ферме."],
 ex5:["Ты ______ стать учителем.","Он ______ стать пилотом.","Мы ______ работать в банке.",
      "Вы ______ стать инженерами.","Они ______ стать врачами.","Она ______ работать в школе.",
      "Я ______ работать в офисе.","Ты ______ стать дизайнером.","Мы ______ работать вместе.",
      "Он ______ стать программистом."],
 ex6:["Он хочет стать…","Она хочет стать…","Мы хотим стать…","Ты хочешь стать…","Они хотят стать…",
      "Я хочу стать…","Вы хотите стать…","Он хочет стать…","Она хочет стать…","Мы хотим стать…"],
 ex7:["Она работает учительницей.","Я работаю программистом.","Мы работаем инженерами.",
      "Ты работаешь поваром.","Они работают продавцами.","Он работает полицейским.",
      "Вы работаете водителем.","Она работает медсестрой.","Я работаю бухгалтером.",
      "Мы работаем официантами."],
 ex8:["Он работает в банке.","Она врач.","Мы работаем вместе.","Ты учишься.",
      "Они хотят стать врачами.","Я работаю в школе.","Он водитель.","Вы работаете в офисе.",
      "Она учится в университете.","Мы инженеры."],
 ex9:["врачом / работает / он","магазине / работает / она / в","инженером / хочу / стать / я",
      "учатся / университете / они / в","работает / водитель / автобусе / на",
      "банке / работает / мама / в","хочу / программистом / стать / я","поваром / работает / папа",
      "больнице / работает / сестра / в","работают / друзья / заводе / на"],
 ex10:["Men maktabda ishlayman.","U shifokor bo'lib ishlaydi.","Otam haydovchi bo'lib ishlaydi.",
      "Onam kasalxonada ishlaydi.","Men muhandis bo'lishni xohlayman.","Biz bankda ishlaymiz.",
      "Ular universitetda o'qiydi.","Sen qayerda ishlaysan?","U kim bo'lib ishlaydi?",
      "Siz kim bo'lishni xohlaysiz?"],
 audio:["Дилшоду двадцать лет.","Сейчас Дилшод работает в банке.",
      "Он учится в университете на факультете информационных технологий.",
      "В будущем Дилшод хочет стать программистом.","Он не изучает русский язык.",
      "После окончания университета он хочет работать в международной компании.",
      "Дилшод считает, что только высокая зарплата делает работу хорошей.",
      "В свободное время он любит читать книги, заниматься спортом и проводить время с друзьями.",
      "Он хочет постоянно учиться и получать новый опыт.",
      "Дилшод уверен, что никогда не станет хорошим специалистом."],
};
Object.keys(P).forEach(id => {
  ok(id + ': exists', !!g[id]);
  eq(id + ': prompts verbatim', g[id].items.map(i => i.q), P[id]);
});

console.log('─── answer keys ───');
const first = id => g[id].items.map(i => Array.isArray(i.answer) ? i.answer[0] : i.answer);
eq('ex2: instrumental (Кем?)', first('ex2'),
   ["врачом","инженером","поваром","продавцами","водителями","программистом","медсестрой",
    "парикмахером","полицейским","официантами"]);
/* AUDIT FIX: a plural subject must not accept a singular instrumental — the
   lesson's own grammar shows «Мы работаем инженерами» / «Они работают
   продавцами», so the singular is simply wrong there. */
[[3,'продавцом'],[4,'водителем'],[9,'официантом']].forEach(([i,wrong]) =>
  ok(`ex2 #${i+1} rejects the singular «${wrong}» for a plural subject`,
     !g.ex2.items[i].answer.includes(wrong)));
ok('ex2 #9 uses the adjectival instrumental полицейским', first('ex2')[8] === 'полицейским');
eq('ex3: работать conjugation', first('ex3'),
   ["работаешь","работает","работаем","работают","работаете","работает","работаю","работаем",
    "работаешь","работают"]);
eq('ex4: в / на', first('ex4'), ["в","в","на","на","в","на","в","на","в","на"]);
eq('ex4: options are exactly в and на', g.ex4.items.map(i => i.options.join('|')), Array(10).fill('в|на'));
eq('ex5: хотеть conjugation', first('ex5'),
   ["хочешь","хочет","хотим","хотите","хотят","хочет","хочу","хочешь","хотим","хочет"]);
eq('ex7: Кем ...? questions', first('ex7'),
   ["Кем она работает?","Кем ты работаешь?","Кем вы работаете?","Кем ты работаешь?",
    "Кем они работают?","Кем он работает?","Кем вы работаете?","Кем она работает?",
    "Кем ты работаешь?","Кем вы работаете?"]);
eq('ex8: negation inserts не before the predicate', first('ex8'),
   ["Он не работает в банке","Она не врач","Мы не работаем вместе","Ты не учишься",
    "Они не хотят стать врачами","Я не работаю в школе","Он не водитель",
    "Вы не работаете в офисе","Она не учится в университете","Мы не инженеры"]);
eq('ex9: builder answers', first('ex9'),
   ["Он работает врачом","Она работает в магазине","Я хочу стать инженером",
    "Они учатся в университете","Водитель работает на автобусе","Мама работает в банке",
    "Я хочу стать программистом","Папа работает поваром","Сестра работает в больнице",
    "Друзья работают на заводе"]);
eq('audio: Правда/Ложь keys match the resource', g.audio.items.map(i => i.answer),
   ["Правда","Ложь","Правда","Правда","Ложь","Правда","Ложь","Правда","Правда","Ложь"]);
eq('audio: both options everywhere', g.audio.items.map(i => i.options.join('|')), Array(10).fill('Правда|Ложь'));

console.log('─── 6-mashq (open by design, bounded by this lesson\'s professions) ───');
/* AUDIT FIX: ex6 now agrees in NUMBER with its subject. */
const EX6_SUBJ = ['Он','Она','Мы','Ты','Они','Я','Вы','Он','Она','Мы'];
g.ex6.items.forEach((it, i) => {
  const hasS = it.answer.includes('врачом'), hasP = it.answer.includes('врачами');
  const subj = EX6_SUBJ[i];
  if (subj === 'Вы') ok(`ex6 #${i+1} (Вы) accepts singular AND plural`, hasS && hasP);
  else if (subj === 'Мы' || subj === 'Они')
    ok(`ex6 #${i+1} (${subj}) accepts ONLY the plural`, hasP && !hasS);
  else ok(`ex6 #${i+1} (${subj}) accepts ONLY the singular`, hasS && !hasP);
});
ok('ex6: every item still offers the full profession list for its number',
   g.ex6.items.every(i => Array.isArray(i.answer) && i.answer.length >= 39));
ok('ex6: every item carries a hint', g.ex6.items.every(i => /творительный/.test(i.hint || '')));
const inst = g.ex6.items[0].answer;          // «Он хочет стать…» — singular
['врачом','инженером','пилотом','дизайнером','программистом','учителем','поваром','хирургом']
  .forEach(f => ok(`ex6 singular item accepts «${f}»`, inst.includes(f)));
const instP = g.ex6.items[2].answer;         // «Мы хотим стать…» — plural
['врачами','учителями','инженерами'].forEach(f => ok(`ex6 plural item accepts «${f}»`, instP.includes(f)));
ok('ex6 never accepts a nominative form', !inst.some(x => x === 'врач'));
ok('ex6 singular item rejects the plural form', !inst.includes('врачами'));
ok('ex6 plural item rejects the singular form', !instP.includes('врачом'));

console.log('─── builder integrity ───');
g.ex9.items.forEach((it, i) => {
  eq(`ex9 #${i+1}: pool equals the printed words`, it.words, P.ex9[i].split(' / '));
  ok(`ex9 #${i+1}: answer uses only the pool words`,
     it.answer.every(a => it.words.every(word => a.toLowerCase().includes(word.toLowerCase()))));
  ok(`ex9 #${i+1}: answer has exactly the pool length`,
     it.answer.every(a => a.trim().split(/\s+/).length === it.words.length));
});

console.log('─── lenient normalisation ───');
const norm = v => String(v).toLowerCase().replace(/ё/g,'е').replace(/[.,!?;:()"'«»—–\-]/g,' ').replace(/\s+/g,' ').trim();
const acc = (it, v) => (Array.isArray(it.answer)?it.answer:[it.answer]).some(a => norm(a) === norm(v));
ok('ex1 #2 accepts both genders', acc(g.ex1.items[1],'Он водитель') && acc(g.ex1.items[1],'Она водитель'));
ok('ex1 #9 accepts both genders', acc(g.ex1.items[8],'Он полицейский') && acc(g.ex1.items[8],'Она полицейский'));
ok('ex2 #4 accepts the plural only', acc(g.ex2.items[3],'продавцами') && !acc(g.ex2.items[3],'продавцом'));
ok('ex2 #5 accepts the plural only', acc(g.ex2.items[4],'водителями') && !acc(g.ex2.items[4],'водителем'));
ok('ex2 #8 (Вы) still accepts polite-singular AND plural',
   acc(g.ex2.items[7],'парикмахером') && acc(g.ex2.items[7],'парикмахерами'));
ok('ex7 #2 accepts the ты and вы person-shift', acc(g.ex7.items[1],'Кем ты работаешь?') && acc(g.ex7.items[1],'Кем вы работаете?'));
ok('ex10 #2 accepts both genders', acc(g.ex10.items[1],'Он работает врачом') && acc(g.ex10.items[1],'Она работает врачом'));
ok('ex10 #3 accepts отец and папа', acc(g.ex10.items[2],'Мой отец работает водителем') && acc(g.ex10.items[2],'Папа работает водителем'));
ok('case and punctuation irrelevant', acc(g.ex3.items[0],'РАБОТАЕШЬ.') && acc(g.ex3.items[0],'  работаешь  '));
ok('ё/е normalised', acc(g.ex2.items[0],'врачом'));

console.log('─── structure ───');
const all = t5.topic5Exercises.exercises;
eq('110 questions', all.reduce((s,x)=>s+x.items.length,0), 110);
ok('no duplicate group id', new Set(all.map(x=>x.id)).size === all.length);
ok('every group titled + introduced + iconed', all.every(x => x.title && x.intro && /^fa-/.test(x.icon)));
ok('only existing engine types', all.every(x => ['input','choice','builder'].includes(x.type)));
ok('no item ships a blank key',
   all.every(x=>x.items.every(i=>{ const a=Array.isArray(i.answer)?i.answer:[i.answer];
     return a.length && a.every(v=>String(v||'').trim()); })));
ok('no item is open-ended (all scoreable)', all.every(x => x.items.every(i => !i.free)));
ok('choice keys always selectable',
   all.filter(x=>x.type==='choice').every(x=>x.items.every(i=>{
     const a=Array.isArray(i.answer)?i.answer:[i.answer]; return a.every(k=>i.options.includes(k)); })));

console.log('─── vocabulary + word-count auto-sync ───');
const VOC = fs.readFileSync(path.join(ROOT, 'paid-courses/a2-vocabulary.html'), 'utf8');
const vb = [...VOC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const vdata = vb.find(b => b.includes('const vocabularyData'));
const vvc = new VirtualConsole(); vvc.on('jsdomError', () => {});
const vdom = new JSDOM(VOC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g, '<script></script>'),
  { url: 'https://uzdarus.uz/paid-courses/a2-vocabulary.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vvc });
vdom.window.HTMLElement.prototype.scrollIntoView = function () {};
vdom.window.alert = () => {};
vdom.window.speechSynthesis = { speak(){}, cancel(){}, getVoices: () => [] };
vdom.window.eval("window.currentUser={id:'dev',uid:'dev',role:'developer',name:'Dev',email:'d@uzdarus.local'};");
vdom.window.eval(vdata + '\n;window.__v=vocabularyData;');
const v5 = vdom.window.__v.topics.find(t => t.id === 5);
eq('50 words imported', v5.words.length, 50);
const RES = [[0,'врач','shifokor'],[4,'учитель',"o'qituvchi"],[17,'полицейский','politsiyachi'],
 [22,'секретарь','kotiba'],[34,'охранник',"qo'riqchi"],[35,'Я работаю…','Men ... ishlayman.'],
 [43,'Мы работаем вместе.','Biz birga ishlaymiz.'],[49,'Я работаю по сменам.','Men smenada ishlayman.']];
RES.forEach(([i,ru,uz]) => { eq(`word #${i+1} ru`, v5.words[i].ru, ru); eq(`word #${i+1} uz`, v5.words[i].uz, uz); });
eq('35 professions then 15 phrases', v5.words.slice(0,35).every(x => !/[.?…]/.test(x.ru)), true);
ok('no empty side', v5.words.every(x => x.ru && x.ru.trim() && x.uz && x.uz.trim()));
ok('every word is speakable through speech.js', v5.words.every(x => /[Ѐ-ӿ]/.test(x.ru)));
ok('lessons 1-4 vocabulary untouched',
   [45,79,73,106].every((n,i) => vdom.window.__v.topics.find(t=>t.id===i+1).words.length === n));
ok('vocabulary topics 6-16 still empty',
   vdom.window.__v.topics.filter(t=>t.id>=6).every(t=>t.words.length===0));
[1,2,3,4,5].forEach((tid) => {
  const actual = vdom.window.__v.topics.find(t => t.id === tid).words.length;
  const a = SRC.indexOf(`id: ${tid},`), b = SRC.indexOf(`id: ${tid+1},`);
  const m = /<strong>(\d+) ta so.z<\/strong>/.exec(SRC.slice(a, b));
  ok(`T${tid}: card label present`, !!m);
  if (m) eq(`T${tid}: label (${m[1]}) equals imported count (${actual})`, Number(m[1]), actual);
});

console.log('\n' + '─'.repeat(64));
console.log(fail === 0
  ? `  ✅ A2 L5 ANSWERS + VOCAB: ${pass}/${pass} assertions passed`
  : `  ❌ A2 L5 ANSWERS + VOCAB: ${fail} failed / ${pass + fail}`);
process.exit(fail ? 1 : 0);
