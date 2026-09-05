'use strict';
/* ============================================================================
 * A2 · Lesson 3 — ANSWER-KEY CROSS-CHECK + vocabulary + auto word-count sync.
 * The resource supplies an explicit key for the «Rost yoki yolg'on» task only;
 * mashqlar 1-10 keys are derived from this lesson's own preposition/case tables.
 * ==========================================================================*/
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? '\n      ' + x : '')); } };
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), `expected ${JSON.stringify(b)}\n      got      ${JSON.stringify(a)}`);

function load(rel) {
  const SRC = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const blocks = [...SRC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const pre = blocks.find(b => /(let|var|const)\s+currentUser/.test(b) && !b.includes('const courseData'));
  const main = blocks.find(b => b.includes('const courseData'));
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM(SRC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g, '<script></script>'),
    { url: 'https://uzdarus.uz/' + rel, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = function () {}; w.alert = () => {};
  w.eval("window.saveQuizResult=async()=>1;window.saveUserProgress=async()=>1;window.getUserProgress=async()=>[];window.getUserQuizResults=async()=>({});window.logActivity=async()=>{};");
  if (pre) w.eval(pre);
  w.eval(main + '\n;window.__cd=courseData;');
  return { cd: w.__cd, SRC };
}

/* ---------- prompts, transcribed from the resource ---------- */
const P = {
 ex1:["Моя мама готовит (кухня).","Мы отдыхаем (гостиная).","Дети играют (двор).","Книга лежит (стол).",
      "Картина висит (стена).","Папа работает (офис).","Бабушка живёт (деревня).","Моя одежда висит (шкаф).",
      "Собака спит (комната).","Цветы стоят (балкон)."],
 ex2:["Мы вошли (комната).","Она идёт (кухня).","Дети побежали (двор).","Я поставил книгу (стол).",
      "Он повесил картину (стена).","Мы едем (город).","Девочка вышла (балкон).","Я положил телефон (полка).",
      "Они вошли (магазин).","Мы приехали (деревня)."],
 ex3:["Мы вышли (комната).","Она приехала (город).","Дети вернулись (двор).","Кошка спрыгнула (стол).",
      "Папа пришёл (работа).","Я приехал (деревня).","Они вышли (магазин).","Девочка прибежала (улица).",
      "Мы пришли (школа).","Он приехал (Ташкент)."],
 ex4:["Мы идём ___ парк.","Он вышел ___ дома.","Книга лежит ___ столе.","Мама готовит ___ кухне.",
      "Дети бегут ___ школу.","Я приехал ___ Самарканда.","Цветы стоят ___ окне.","Картина висит ___ стене.",
      "Мы вернулись ___ магазина.","Брат живёт ___ общежитии."],
 ex5:["Я живу ______ квартире.","Мы идём ______ магазин.","Он приехал ______ города.","Кошка сидит ______ диване.",
      "Дети играют ______ дворе.","Мама вошла ______ комнату.","Мы вышли ______ дома.","Цветы стоят ______ балконе.",
      "Бабушка живёт ______ деревне.","Папа пришёл ______ работы."],
 ex6:["Men kvartirada yashayman.","Biz oshxonaga ketyapmiz.","U uydan chiqdi.","Bolalar hovlida o'ynayapti.",
      "Kitob stol ustida turibdi.","Men shaharga ketyapman.","U Toshkentdan keldi.","Mushuk divanda uxlayapti.",
      "Onam xonaga kirdi.","Biz balkondan tushdik."],
 ex7:["Где ты живёшь?","Где стоит телевизор?","Где играет ребёнок?","Куда ты идёшь?","Куда вошла мама?",
      "Куда вы едете?","Откуда ты приехал?","Откуда вышли дети?","Где лежит телефон?","Где готовит мама?"],
 ex8:["Я живу...","Мы идём...","Он пришёл...","Книга лежит...","Мы приехали...","Она вышла...","Цветы стоят...",
      "Дети играют...","Мы вернулись...","Папа работает..."],
 ex9:["Я живу из квартире.","Мы идём в кухне.","Он вышел в дома.","Книга лежит в столе.","Цветы стоят в балконе.",
      "Она приехала в Ташкента.","Мы играем на дворе.","Папа пришёл из работы.","Мама вошла в комнате.",
      "Дети бегут из школу."],
 ex10:["______ ты идёшь?","______ приехала мама?","______ лежит книга?","______ вышли дети?","______ стоит шкаф?",
      "______ вы едете?","______ пришёл папа?","______ находится кухня?","______ поставил чашку?",
      "______ спрыгнула кошка?"],
 audio:["Oila park yaqinidagi kichik uyda yashaydi.","Uyning oldida bog' yo'q.","Uyda to'rtta xona bor.",
      "Mehmonxonada televizor va divan bor.","Oshxona oilaning eng sevimli joyi.",
      "Har kuni ertalab bolalar ishga boradilar.","Kechqurun hamma uyga qaytadi.",
      "Dam olish kunlari oila hovlida dam oladi.","Yozda kattalar gullarga qaraydilar.",
      "Oila o'z uyini juda yaxshi ko'radi."],
};
/* 8-mashq options EXACTLY as printed (wrong distractors preserved) */
const EX8_OPTS = [["из дома","в доме","на дом"],["в комнате","в комнату","из комнаты"],
 ["из школы","в школу","на школу"],["на стол","на столе","из стола"],["в город","из городе","на городе"],
 ["в квартиру","из квартиры","на квартиру"],["на окне","на окно","с окна"],["во двор","во дворе","со двора"],
 ["в магазина","из магазина","на магазин"],["в офисе","в офис","из офиса"]];
const EX8_KEYS = ["в доме","в комнату","из школы","на столе","в город","из квартиры","на окне","во дворе","из магазина","в офисе"];
const EX10_KEYS = ["Куда?","Откуда?","Где?","Откуда?","Где?","Куда?","Откуда?","Где?","Куда?","Откуда?"];
const EX4_KEYS  = ["в","из","на","на","в","из","на","на","из","в"];
const EX5_KEYS  = ["в","в","из","на",["во","в"],"в","из","на","в","с"];
/* «Rost yoki yolg'on» — the resource's own Javoblar list, verbatim */
const TF_KEYS = ["Rost","Yolg'on","Rost","Rost","Rost","Yolg'on","Rost","Rost","Rost","Rost"];
/* first accepted key for the case-form tasks, from this lesson's own tables */
const EX1_FIRST = ["на кухне","в гостиной","во дворе","на столе","на стене","в офисе","в деревне","в шкафу","в комнате","на балконе"];
const EX2_FIRST = ["в комнату","на кухню","во двор","на стол","на стену","в город","на балкон","на полку","в магазин","в деревню"];
const EX3_FIRST = ["из комнаты","из города","со двора","со стола","с работы","из деревни","из магазина","с улицы","из школы","из Ташкента"];
const EX9_FIRST = ["Я живу в квартире","Мы идём на кухню","Он вышел из дома","Книга лежит на столе",
  "Цветы стоят на балконе","Она приехала из Ташкента","Мы играем во дворе","Папа пришёл с работы",
  "Мама вошла в комнату","Дети бегут в школу"];

['paid-courses/a2-course.html', 'a2-demo.html'].forEach((rel) => {
  console.log('\n─── ' + rel + ' ───');
  const { cd } = load(rel);
  const t3 = cd.topics.find(t => t.id === 3);
  const g = {}; t3.topic3Exercises.exercises.forEach(x => { g[x.id] = x; });

  Object.keys(P).forEach(id => {
    ok(id + ': exists', !!g[id]);
    eq(id + ': prompts verbatim', g[id].items.map(i => i.q), P[id]);
  });
  eq('ex4: keys', g.ex4.items.map(i => i.answer), EX4_KEYS);
  eq('ex5: keys', g.ex5.items.map(i => i.answer), EX5_KEYS);
  eq('ex8: options verbatim (wrong distractors preserved)', g.ex8.items.map(i => i.options), EX8_OPTS);
  eq('ex8: keys', g.ex8.items.map(i => i.answer), EX8_KEYS);
  eq('ex10: keys', g.ex10.items.map(i => i.answer), EX10_KEYS);
  eq('audio: Rost/Yolg\'on keys match the resource "Javoblar"', g.audio.items.map(i => i.answer), TF_KEYS);
  eq('audio: both options everywhere', g.audio.items.map(i => i.options.join('|')), Array(10).fill("Rost|Yolg'on"));
  eq('ex1: first key per item', g.ex1.items.map(i => i.answer[0]), EX1_FIRST);
  eq('ex2: first key per item', g.ex2.items.map(i => i.answer[0]), EX2_FIRST);
  eq('ex3: first key per item', g.ex3.items.map(i => i.answer[0]), EX3_FIRST);
  eq('ex9: first key per item', g.ex9.items.map(i => i.answer[0]), EX9_FIRST);

  // ex1/2/3 must also accept the whole sentence, per the namuna
  ok('ex1: whole-sentence answers accepted too',
     g.ex1.items.every(i => i.answer.length === 2 && i.answer[1].split(/\s+/).length > 2));
  ok('ex2: whole-sentence answers accepted too',
     g.ex2.items.every(i => i.answer.length === 2));
  ok('ex3: whole-sentence answers accepted too',
     g.ex3.items.every(i => i.answer.length === 2));

  // 4-mashq option set: the resource's namuna lists only из/в/с, but four items
  // require «на». The option list carries the lesson's own preposition set.
  ok('ex4: every key is selectable from its options',
     g.ex4.items.every(i => i.options.includes(i.answer)));
  ok('ex4: options include на (four items are unanswerable without it)',
     g.ex4.items.every(i => i.options.includes('на')));
  ok('ex4: the namuna prepositions are all still offered',
     g.ex4.items.every(i => ['в','из','с'].every(p => i.options.includes(p))));

  // structural
  const all = t3.topic3Exercises.exercises;
  eq('110 questions', all.reduce((s,x)=>s+x.items.length,0), 110);
  ok('no duplicate group id', new Set(all.map(x=>x.id)).size === all.length);
  ok('every group titled + introduced + iconed', all.every(x => x.title && x.intro && /^fa-/.test(x.icon)));
  ok('choice keys always selectable',
     all.filter(x=>x.type==='choice').every(x=>x.items.every(i=>{
       const a=Array.isArray(i.answer)?i.answer:[i.answer]; return a.some(k=>i.options.includes(k)); })));
  ok('no non-open item ships a blank key',
     all.every(x=>x.items.every(i=>{ if(i.free) return true;
       const a=Array.isArray(i.answer)?i.answer:[i.answer];
       return a.length && a.every(v=>String(v||'').trim()); })));
});

/* ---------------- vocabulary + AUTO word-count sync ---------------- */
console.log('\n─── vocabulary ───');
const VOC = fs.readFileSync(path.join(ROOT, 'paid-courses/a2-vocabulary.html'), 'utf8');
const vblocks = [...VOC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const vdata = vblocks.find(b => b.includes('const vocabularyData'));
const vvc = new VirtualConsole(); vvc.on('jsdomError', () => {});
const vdom = new JSDOM(VOC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g, '<script></script>'),
  { url: 'https://uzdarus.uz/paid-courses/a2-vocabulary.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vvc });
vdom.window.HTMLElement.prototype.scrollIntoView = function () {};
vdom.window.alert = () => {};
vdom.window.speechSynthesis = { speak(){}, cancel(){}, getVoices: () => [] };
vdom.window.eval("window.currentUser={id:'dev',uid:'dev',role:'developer',name:'Dev',email:'d@uzdarus.local'};");
vdom.window.eval(vdata + '\n;window.__v=vocabularyData;');
const v3 = vdom.window.__v.topics.find(t => t.id === 3);
eq('topic 3 vocabulary name', v3.name, 'Uy va yashash joyi');
eq('73 words imported', v3.words.length, 73);
const R3 = [
 ['жить','yashamoq'],['проживать','istiqomat qilmoq'],['переехать',"ko'chib o'tmoq"],
 ['снимать квартиру','kvartira ijaraga olmoq'],['купить дом','uy sotib olmoq'],
 ['строить дом','uy qurmoq'],['возвращаться домой','uyga qaytmoq'],['входить','kirmoq'],
 ['выходить','chiqmoq'],['приходить','kelmoq'],['уходить','ketmoq'],
 ['подниматься','yuqoriga chiqmoq'],['спускаться','pastga tushmoq'],
 ['в','ichida, ...ga'],['на','ustida, ...ga'],['из','ichidan'],['с','ustidan, ...dan'],
 ['от','yonidan, ...dan'],['около','yonida'],['рядом с','yonida'],['напротив',"ro'parasida"],
 ['между','orasida'],['перед','oldida'],['за','orqasida'],['возле','yonida'],
 ['внутри','ichida'],['вне','tashqarisida'],
 ['здесь','bu yerda'],['там','u yerda'],['дома','uyda'],['домой','uyga'],
 ['справа',"o'ng tomonda"],['слева','chap tomonda'],['сверху','tepada'],['снизу','pastda'],
 ['внутри','ichkarida'],['снаружи','tashqarida'],['рядом','yonida'],['далеко','uzoqda'],
 ['близко','yaqin'],['наверху','yuqorida'],['внизу','pastda'],
 ['большой','katta'],['маленький','kichik'],['высокий','baland'],['низкий','past'],
 ['широкий','keng'],['узкий','tor'],['светлый',"yorug'"],['тёмный',"qorong'i"],
 ['чистый','toza'],['грязный','iflos'],['уютный','shinam'],['красивый','chiroyli'],
 ['новый','yangi'],['старый','eski'],['современный','zamonaviy'],['удобный','qulay'],
 ['просторный','keng'],['тихий','tinch'],['шумный','shovqinli'],['тёплый','iliq'],
 ['холодный','sovuq'],
 ['Я живу в квартире.','Men kvartirada yashayman.'],['Мы живём в доме.','Biz uyda yashaymiz.'],
 ['Я иду домой.','Men uyga ketyapman.'],['Я пришёл из дома.','Men uydan keldim.'],
 ['Комната большая.','Xona katta.'],['Дом находится рядом с парком.','Uy park yonida joylashgan.'],
 ['Магазин находится напротив дома.',"Do'kon uyning ro'parasida joylashgan."],
 ['Книга лежит на столе.','Kitob stol ustida turibdi.'],
 ['Телевизор стоит в гостиной.','Televizor mehmonxonada turibdi.'],
 ['Мы переехали в новую квартиру.',"Biz yangi kvartiraga ko'chib o'tdik."],
];
eq('checklist length', R3.length, 73);
let mm = 0;
R3.forEach(([ru, uz], i) => {
  if (v3.words[i].ru !== ru || v3.words[i].uz !== uz) {
    mm++; console.log(`  ✗ word ${i+1}: got ${JSON.stringify(v3.words[i])} want {ru:${JSON.stringify(ru)},uz:${JSON.stringify(uz)}}`);
  }
});
eq('every word matches the resource verbatim, in order', mm, 0);
ok('no empty side', v3.words.every(x => x.ru && x.ru.trim() && x.uz && x.uz.trim()));
ok('every word is speakable through speech.js (.ru is Cyrillic)', v3.words.every(x => /[Ѐ-ӿ]/.test(x.ru)));
ok('lesson 1 vocabulary untouched (45)', vdom.window.__v.topics.find(t=>t.id===1).words.length === 45);
/* Topic 2 was 79. Two cards were byte-identical duplicates inside its own
   list, so the learner met each of them twice in one pass; both later copies
   were removed and A2_VOCAB_COUNTS follows. The pin moves with the content
   and still guards every other count here. */
ok('lesson 2 vocabulary untouched (77 after de-duplication)', vdom.window.__v.topics.find(t=>t.id===2).words.length === 77);

/* AUTO: the card label must equal the ACTUAL imported word count. */
console.log('\n─── word-count auto-sync ───');
/* The count now lives in A2_VOCAB_COUNTS and is rendered by the shared
   vocabulary component, instead of being copied into each topic's markup.
   The guarantee is unchanged: what the learner sees must equal what was
   actually imported. */
[1, 2, 3].forEach((tid) => {
  const actual = vdom.window.__v.topics.find(t => t.id === tid).words.length;
  ['paid-courses/a2-course.html', 'a2-demo.html'].forEach((rel) => {
    const S = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const block = (S.match(/var A2_VOCAB_COUNTS = \{([^}]*)\}/) || [])[1];
    ok(`${rel} T${tid}: the card knows this topic's word count`,
       !!block && new RegExp('\\b' + tid + '\\s*:').test(block));
    if (!block) return;
    const m = new RegExp('\\b' + tid + '\\s*:\\s*(\\d+)').exec(block);
    if (m) eq(`${rel} T${tid}: shown count (${m[1]}) equals imported count (${actual})`,
              Number(m[1]), actual);
    ok(`${rel} T${tid}: rendered through the shared component`,
       /UzExerciseUI\.renderVocabCard/.test(S));
  });
});

console.log('\n' + '─'.repeat(64));
console.log(fail === 0
  ? `  ✅ A2 L3 ANSWERS + VOCAB: ${pass}/${pass} assertions passed`
  : `  ❌ A2 L3 ANSWERS + VOCAB: ${fail} failed / ${pass + fail}`);
process.exit(fail ? 1 : 0);
