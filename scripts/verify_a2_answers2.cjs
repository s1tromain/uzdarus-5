'use strict';
/* ============================================================================
 * A2 · Lesson 2 — ANSWER-KEY CROSS-CHECK against the lesson resource.
 * The resource supplies an explicit key for the «Правда или ложь?» task only;
 * mashqlar 1-9 keys are derived from the resource's own grammar section and
 * locked here so they cannot drift.
 * ==========================================================================*/
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? '\n      ' + x : '')); } };
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), `expected ${JSON.stringify(b)}\n      got      ${JSON.stringify(a)}`);

function topic2(rel) {
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
  return { t2: w.__cd.topics.find(t => t.id === 2), SRC };
}

/* ---------- transcribed from the resource ---------- */
const P = {
 ex1:["Моя мама (работать) врачом.","Мы (отдыхать) летом.","Отец (купить) новую машину.","Дети (играть) во дворе.",
      "Брат (учиться) в университете.","Бабушка (готовить) плов.","Я (познакомиться) с другом.",
      "Они (переехать) в Самарканд.","Муж (вернуться) поздно.","Жена (прочитать) книгу."],
 ex2:["Моя сестра ______ дома.","Мы ______ счастливы.","Дедушка ______ инженером.","Родители ______ на работе.",
      "Девочка ______ книгу.","Мальчик ______ домой.","Они ______ вместе.","Бабушка ______ вкусный суп.",
      "Я ______ письмо.","Семья ______ в отпуск."],
 ex3:["Мы были счастливы.","Она работала учителем.","Дети играли.","Я жил в Москве.","Отец купил машину.",
      "Бабушка приготовила ужин.","Они познакомились.","Муж приехал вечером.","Семья отдыхала летом.",
      "Сестра окончила школу."],
 ex4:["Он работал врачом.","Вы были в Ташкенте летом.","Они познакомились в университете.",
      "Семья жила в Самарканде пять лет.","Дети играли во дворе вечером.","Мама приготовила вкусный обед.",
      "Отец купил квартиру в прошлом году.","Ты учился в школе № 25.","Брат приехал вчера вечером.",
      "Бабушка была дома одна."],
 ex5:["_____ мама","_____ брат","_____ родители","_____ семья","_____ дети","_____ имя","_____ сестра",
      "_____ муж","_____ бабушка","_____ родители"],
 ex6:["_____ отец инженер.","_____ мама врач.","_____ семья большая.","_____ дети маленькие.","_____ брат студент.",
      "_____ сестра работает.","_____ бабушка добрая.","_____ дедушка рыбак.","_____ родители живут в Бухаре.",
      "_____ имя Азиз."],
 ex7:["Mening oilam katta edi.","Bizning otamiz shifokor edi.","Uning onasi maktabda ishlagan.",
      "Mening akam universitetda o'qigan.","Ularning bolalari futbol o'ynashgan.","Mening buvim mazali ovqat pishirgan.",
      "Bizning oilamiz Toshkentda yashagan.","Uning singlisi kitob o'qigan.","Mening erim kecha kelgan.",
      "Bizning ota-onamiz baxtli edilar."],
 ex8:["моя / была / добрая / бабушка","отец / мой / работал / врачом","познакомились / родители / мои",
      "дети / играли / наши","семья / большая / наша / была","её / брат / приехал",
      "мой / университет / окончил / брат","родители / были / дома / мои","муж / вечером / пришёл / мой",
      "их / переехала / семья"],
 ex9:["Моя мама __________ врачом.","Мы __________ очень счастливы.","Мой дедушка __________ в деревне.",
      "Бабушка __________ вкусный ужин.","Мои родители __________ в институте.","Мой брат __________ новую машину.",
      "Муж __________ поздно вечером.","Дети __________ во дворе.","Моя сестра __________ университет.",
      "Наш сын __________ в 2018 году."],
 audio:["Тимур и его семья раньше жили в небольшом городе.","Его отец работал врачом.","Его мама была учительницей.",
      "У Тимура была только младшая сестра.","Его брат окончил университет и стал программистом.",
      "Каждые выходные семья ездила к бабушке и дедушке.","Бабушка Тимура не любила готовить.",
      "В прошлом году родители Тимура отметили тридцатую годовщину свадьбы.",
      "На праздник приехали родственники из разных городов.",
      "Тимур считает, что его семья не повлияла на его жизнь."],
};
/* option lists EXACTLY as printed — distractors preserved verbatim */
const EX2_OPTS = [["был","была","были"],["был","была","были"],["был","была","были"],["был","была","были"],
  ["прочитал","прочитала","прочитали"],["пришёл","пришла","пришли"],["жил","жила","жили"],
  ["приготовила","приготовил","приготовили"],["написал(а)","написали","написало"],["поехала","поехали","поехал"]];
const EX2_KEYS = ["была","были","был","были","прочитала","пришёл","жили","приготовила","написал(а)","поехала"];
const EX5_OPTS = [["мой","моя","моё"],["моя","мой","мои"],["мои","мой","моя"],["наш","наша","наше"],
  ["наши","наша","наш"],["мой","моё","моя"],["твоя","твой","твоё"],["ваш","ваша","ваши"],
  ["её","еёй","еёя"],["их","ихний","ихняя"]];
const EX5_KEYS = ["моя","мой","мои","наша","наши","моё","твоя","ваш","её","их"];
const EX1_KEYS = ["работала","отдыхали","купил","играли","учился","готовила",
                  ["познакомился","познакомилась"],"переехали","вернулся","прочитала"];
const EX9_KEYS = ["работала","были","жил","приготовила","познакомились","купил","приехал","играли","окончила","родился"];
const TF_KEYS  = ["Правда","Ложь","Правда","Ложь","Правда","Правда","Ложь","Правда","Правда","Ложь"];
const EX9_BANK = ["жил","работала","приготовила","были","познакомились","приехал","окончила","играли","купил","родился"];

['paid-courses/a2-course.html', 'a2-demo.html'].forEach((rel) => {
  console.log('\n─── ' + rel + ' ───');
  const { t2 } = topic2(rel);
  const g = {}; t2.topic2Exercises.exercises.forEach(x => { g[x.id] = x; });

  Object.keys(P).forEach((id) => {
    ok(id + ': exists', !!g[id]);
    eq(id + ': prompts verbatim', g[id].items.map(i => i.q), P[id]);
  });
  eq('ex2: options verbatim (distractors preserved)', g.ex2.items.map(i => i.options), EX2_OPTS);
  eq('ex2: keys', g.ex2.items.map(i => i.answer), EX2_KEYS);
  eq('ex5: options verbatim (еёй/еёя, ихний/ихняя preserved)', g.ex5.items.map(i => i.options), EX5_OPTS);
  eq('ex5: keys', g.ex5.items.map(i => i.answer), EX5_KEYS);
  eq('ex1: keys', g.ex1.items.map(i => i.answer), EX1_KEYS);
  eq('ex9: keys', g.ex9.items.map(i => i.answer), EX9_KEYS);
  eq('audio: T/F keys match the resource "Javoblar"', g.audio.items.map(i => i.answer), TF_KEYS);
  eq('audio: both options everywhere', g.audio.items.map(i => i.options.join('|')), Array(10).fill('Правда|Ложь'));

  // 9-mashq keys must all come from the word bank the resource prints
  const inBank = g.ex9.items.every(i => EX9_BANK.includes(i.answer));
  ok('ex9: every key comes from the printed word bank', inBank);
  eq('ex9: bank fully used, each word once', g.ex9.items.map(i => i.answer).slice().sort().join('|'),
     EX9_BANK.slice().sort().join('|'));

  // 8-mashq builder: the word pool must be exactly the scrambled words given
  g.ex8.items.forEach((it, i) => {
    eq(`ex8 #${i+1}: word pool equals the printed words`, it.words, P.ex8[i].split(' / '));
    const key = (Array.isArray(it.answer) ? it.answer[0] : it.answer).toLowerCase().replace(/[^а-яё ]/gi,'').trim().split(/\s+/).sort().join(' ');
    const pool = it.words.map(x => x.toLowerCase()).sort().join(' ');
    ok(`ex8 #${i+1}: answer is a permutation of the pool (no word invented/dropped)`, key === pool);
  });

  // 4-mashq is genuinely open (resource gives no key) — must be flagged, with a model
  ok('ex4: every item flagged open-ended', g.ex4.items.every(i => i.free === true));
  ok('ex4: every item ships a model question as a hint', g.ex4.items.every(i => /^Namuna: /.test(i.hint || '')));
  ok('ex4: every model is >= 3 words (the engine\'s acceptance floor)',
     g.ex4.items.every(i => i.hint.replace('Namuna: ','').trim().split(/\s+/).length >= 3));

  // gender variants accepted wherever the subject allows both
  const norm = v => String(v).toLowerCase().replace(/ё/g,'е').replace(/[.,!?;:()"'«»—–\-]/g,' ').replace(/\s+/g,' ').trim();
  const acc = (it, v) => (Array.isArray(it.answer)?it.answer:[it.answer]).some(a => norm(a) === norm(v));
  ok('gender: ex1 «Я (познакомиться)» takes both forms',
     acc(g.ex1.items[6],'познакомился') && acc(g.ex1.items[6],'познакомилась'));
  ok('gender: ex3 «Я жил в Москве» takes both forms',
     acc(g.ex3.items[3],'Я не жил в Москве') && acc(g.ex3.items[3],'Я не жила в Москве'));
  ok('gender: ex7 «Uning onasi» takes его AND её',
     acc(g.ex7.items[2],'Его мама работала в школе') && acc(g.ex7.items[2],'Её мама работала в школе'));
  ok('gender: ex7 «Uning singlisi» takes его AND её',
     acc(g.ex7.items[7],'Его сестра читала книгу') && acc(g.ex7.items[7],'Её сестра читала книгу'));

  // structural
  const all = t2.topic2Exercises.exercises;
  eq('100 questions', all.reduce((s,x)=>s+x.items.length,0), 100);
  ok('no duplicate group id', new Set(all.map(x=>x.id)).size === all.length);
  ok('every group titled + introduced + iconed',
     all.every(x => x.title && x.intro && /^fa-/.test(x.icon)));
  ok('choice keys always selectable',
     all.filter(x=>x.type==='choice').every(x=>x.items.every(i=>{
       const a = Array.isArray(i.answer)?i.answer:[i.answer]; return a.some(k=>i.options.includes(k)); })));
  ok('no non-open item ships a blank key',
     all.every(x=>x.items.every(i=>{ if(i.free) return true;
       const a=Array.isArray(i.answer)?i.answer:[i.answer];
       return a.length && a.every(v=>String(v||'').trim()); })));
});

console.log('\n' + '─'.repeat(64));
console.log(fail === 0
  ? `  ✅ A2 L2 ANSWER KEYS: ${pass}/${pass} assertions passed`
  : `  ❌ A2 L2 ANSWER KEYS: ${fail} failed / ${pass + fail}`);
process.exit(fail ? 1 : 0);
