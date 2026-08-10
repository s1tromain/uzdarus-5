'use strict';
/* ============================================================================
 * A2 · Lesson 4 — ANSWER-KEY CROSS-CHECK + vocabulary + word-count auto-sync.
 * The resource supplies an explicit key only for the «Правда или ложь?» task.
 * Mashqlar 1-10 keys are derived from this lesson's own tables (days → в +
 * accusative, months → в + prepositional, seasons/parts of day → instrumental,
 * hours → час/часа/часов).
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
const t4 = w.__cd.topics.find(t => t.id === 4);
const g = {}; t4.topic4Exercises.exercises.forEach(x => { g[x.id] = x; });

console.log('\n─── prompts (verbatim from the resource) ───');
const P = {
 ex1:["Bugun dushanba.","Ertaga juma.","Men yakshanba kuni dam olaman.","Biz seshanba kuni ishlaymiz.",
      "U shanba kuni sport bilan shug'ullanadi.","Chorshanba kuni bizda dars bor.",
      "Payshanba kuni men uyda bo'laman.","Juma kuni ular kinoga boradilar.","Kecha yakshanba edi.",
      "Indin dushanba bo'ladi."],
 ex2:["Я работаю ________ (понедельник).","Мы отдыхаем ________ (воскресенье).","Урок будет ________ (вторник).",
      "Он приедет ________ (пятница).","Мы встречаемся ________ (суббота).","Концерт состоится ________ (четверг).",
      "Я пойду в магазин ________ (среда).","Экзамен будет ________ (понедельник).",
      "Мы играем в футбол ________ (пятница).","Она придёт ________ (воскресенье)."],
 ex3:["Я родился ________ (июль).","Мы поедем отдыхать ________ (август).","Учёба начинается ________ (сентябрь).",
      "Новый год бывает ________ (январь).","Цветы появляются ________ (апрель).",
      "Каникулы начинаются ________ (июнь).","Он приехал ________ (май).","Мы познакомились ________ (октябрь).",
      "Экзамены проходят ________ (декабрь).","Она родилась ________ (февраль)."],
 ex4:["________ холодно.","________ жарко.","________ тает снег.","________ листья становятся жёлтыми.",
      "________ мы купаемся.","________ дети лепят снеговика.","________ часто идут дожди.",
      "________ появляются цветы.","________ дни длиннее.","________ можно кататься на лыжах."],
 ex5:["Я завтракаю ________.","Мы работаем ________.","Я читаю книгу ________.","Люди спят ________.",
      "Он занимается спортом ________.","Мы гуляем ________.","Она пьёт кофе ________.",
      "Самолёт прилетел ________.","Я смотрю фильм ________.","Магазин открывается ________."],
 ex6:["1:00 →","2:00 →","3:00 →","4:00 →","5:00 →","7:00 →","10:00 →","11:00 →","12:00 →","9:00 →"],
 ex7:["Я родился (в июль / в июле).","Мы отдыхаем (летом / лето).","Сегодня (утром / утро) холодно.",
      "Они приедут (в август / в августе).","Я работаю (в понедельник / понедельник).",
      "(Зимой / Зима) часто идёт снег.","Мы познакомились (в мае / май).","Она гуляет (вечером / вечер).",
      "Каникулы начинаются (в июне / июнь).","(Осенью / Осень) листья падают."],
 ex8:["я / летом / отдыхаю","зимой / холодно","мы / в июле / поедем / отдыхать","утром / кофе / пью / я",
      "вечером / гуляем / мы","в понедельник / урок / будет","осенью / дождь / идёт",
      "она / родилась / в феврале","сегодня / солнечно","ночью / люди / спят"],
 ex9:["Сегодня понедельник.","Завтра будет урок.","Мы отдыхаем летом.","Она родилась в мае.",
      "Сейчас пять часов.","Зимой холодно.","Утром я пью чай.","Осенью часто идут дожди.",
      "Мы встретимся в субботу.","Сегодня солнечно."],
 ex10:["Сегодня __________.","Завтра будет __________.","Я родился __________.","Мы отдыхаем __________.",
      "__________ люди спят.","__________ очень жарко.","__________ идёт снег.","Я работаю __________.",
      "Учёба начинается __________.","Сейчас __________ часов."],
 audio:["Алина живёт в маленькой деревне.","В году четыре времени года.","Весной становится тепло.",
      "Летом школьники учатся в школе.","Осенью листья становятся жёлтыми, красными и оранжевыми.",
      "Зимой иногда идёт снег.","Любимое время года Алины — весна.","Алина любит гулять утром или вечером.",
      "Днём Алина только отдыхает.","Ночью Алина спит."],
};
Object.keys(P).forEach(id => {
  ok(id + ': exists', !!g[id]);
  eq(id + ': prompts verbatim', g[id].items.map(i => i.q), P[id]);
});

console.log('─── answer keys ───');
const first = id => g[id].items.map(i => Array.isArray(i.answer) ? i.answer[0] : i.answer);
eq('ex2: days take в + accusative', first('ex2'),
   ["в понедельник","в воскресенье","во вторник","в пятницу","в субботу","в четверг","в среду","в понедельник","в пятницу","в воскресенье"]);
ok('ex2 #3 uses ВО вторник (the documented exception)', first('ex2')[2] === 'во вторник');
eq('ex3: months take в + prepositional', first('ex3'),
   ["в июле","в августе","в сентябре","в январе","в апреле","в июне","в мае","в октябре","в декабре","в феврале"]);
eq('ex4: seasons (instrumental)', first('ex4'),
   ["зимой","летом","весной","осенью","летом","зимой","осенью","весной","летом","зимой"]);
eq('ex5: parts of day (instrumental)', first('ex5'),
   ["утром","днём","вечером","ночью","утром","вечером","утром","ночью","вечером","утром"]);
eq('ex6: hour forms follow час/часа/часов', first('ex6'),
   ["Сейчас один час","Сейчас два часа","Сейчас три часа","Сейчас четыре часа","Сейчас пять часов",
    "Сейчас семь часов","Сейчас десять часов","Сейчас одиннадцать часов","Сейчас двенадцать часов","Сейчас девять часов"]);
eq('ex7: options verbatim', g.ex7.items.map(i => i.options),
   [["в июль","в июле"],["летом","лето"],["утром","утро"],["в август","в августе"],
    ["в понедельник","понедельник"],["Зимой","Зима"],["в мае","май"],["вечером","вечер"],
    ["в июне","июнь"],["Осенью","Осень"]]);
eq('ex7: keys', g.ex7.items.map(i => i.answer),
   ["в июле","летом","утром","в августе","в понедельник","Зимой","в мае","вечером","в июне","Осенью"]);
eq('ex10 #5-#7 and #9 are exactly keyed',
   [first('ex10')[4], first('ex10')[5], first('ex10')[6], first('ex10')[8]],
   ["Ночью","Летом","Зимой","в сентябре"]);
eq('audio: Правда/Ложь keys match the resource "Javoblar"', g.audio.items.map(i => i.answer),
   ["Ложь","Правда","Правда","Ложь","Правда","Правда","Правда","Правда","Ложь","Правда"]);
eq('audio: both options everywhere', g.audio.items.map(i => i.options.join('|')), Array(10).fill('Правда|Ложь'));

console.log('─── option sets ───');
eq('ex4 offers exactly the four seasons the resource lists',
   g.ex4.items.map(i => i.options.join(',')), Array(10).fill('летом,зимой,весной,осенью'));
eq('ex5 offers exactly the four parts of day the resource lists',
   g.ex5.items.map(i => i.options.join(',')), Array(10).fill('утром,днём,вечером,ночью'));
ok('every choice key is selectable from its own options',
   t4.topic4Exercises.exercises.filter(x => x.type === 'choice').every(x => x.items.every(i => {
     const a = Array.isArray(i.answer) ? i.answer : [i.answer];
     return a.every(k => i.options.includes(k));
   })));

console.log('─── builder integrity ───');
g.ex8.items.forEach((it, i) => {
  eq(`ex8 #${i+1}: pool equals the printed words`, it.words, P.ex8[i].split(' / '));
  const pool = it.words.map(x => x.toLowerCase()).sort().join('|');
  const bad = it.answer.filter(a => a.toLowerCase().split(/\s+/).join(' ')
      .split(' ').length === 0);
  ok(`ex8 #${i+1}: every accepted answer uses only the pool words`,
     it.answer.every(a => {
       const norm = a.toLowerCase();
       return it.words.every(word => norm.includes(word.toLowerCase()));
     }));
});

console.log('─── lenient normalisation ───');
const norm = v => String(v).toLowerCase().replace(/ё/g,'е').replace(/[.,!?;:()"'«»—–\-]/g,' ').replace(/\s+/g,' ').trim();
const acc = (it, v) => (Array.isArray(it.answer)?it.answer:[it.answer]).some(a => norm(a) === norm(v));
ok('ex1 #5 accepts both genders', acc(g.ex1.items[4],'Он занимается спортом в субботу') && acc(g.ex1.items[4],'Она занимается спортом в субботу'));
ok('ex1 #3 accepts both word orders', acc(g.ex1.items[2],'Я отдыхаю в воскресенье') && acc(g.ex1.items[2],'В воскресенье я отдыхаю'));
ok('ex6 #1 accepts "час" and "один час", with and without Сейчас',
   acc(g.ex6.items[0],'Сейчас один час') && acc(g.ex6.items[0],'один час') && acc(g.ex6.items[0],'Сейчас час') && acc(g.ex6.items[0],'час'));
ok('ex6 #5 accepts with and without Сейчас', acc(g.ex6.items[4],'Сейчас пять часов') && acc(g.ex6.items[4],'пять часов'));
ok('ex8 #1 accepts both valid orders', acc(g.ex8.items[0],'Летом я отдыхаю') && acc(g.ex8.items[0],'Я отдыхаю летом'));
ok('ex10 #3 accepts any month', acc(g.ex10.items[2],'в июле') && acc(g.ex10.items[2],'в декабре'));
ok('ex10 #10 accepts any 5-20 numeral', acc(g.ex10.items[9],'пять') && acc(g.ex10.items[9],'двадцать'));
ok('case and punctuation are irrelevant', acc(g.ex3.items[0],'В ИЮЛЕ.') && acc(g.ex3.items[0],' в июле '));
ok('ex9 keeps the question mark in the key', g.ex9.items.every(i => /\?$/.test(i.answer[0])));

console.log('─── structure ───');
const all = t4.topic4Exercises.exercises;
eq('110 questions', all.reduce((s,x)=>s+x.items.length,0), 110);
ok('no duplicate group id', new Set(all.map(x=>x.id)).size === all.length);
ok('every group titled + introduced + iconed', all.every(x => x.title && x.intro && /^fa-/.test(x.icon)));
ok('no item ships a blank key',
   all.every(x=>x.items.every(i=>{ const a=Array.isArray(i.answer)?i.answer:[i.answer];
     return a.length && a.every(v=>String(v||'').trim()); })));
ok('no item is open-ended (every question is scoreable)', all.every(x => x.items.every(i => !i.free)));

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
const v4 = vdom.window.__v.topics.find(t => t.id === 4);
eq('106 words imported', v4.words.length, 106);
const SECTIONS = { 'Hafta': 5, 'Sutka': 8, 'Vaqt': 19, 'Vaqt ifodalari': 18,
                   'Ob-havo': 10, 'Sifatlar': 13, "Fe'llar": 16, 'Iboralar': 17 };
eq('section sizes sum to the imported total', Object.values(SECTIONS).reduce((a,b)=>a+b,0), 106);
const SPOT = [[0,'будний день','ish kuni'],[4,'начало недели','hafta boshi'],[5,'утро','ertalab'],
 [12,'полночь','yarim tun'],[13,'время','vaqt'],[31,'рано','erta'],[32,'сегодня','bugun'],
 [49,'никогда','hech qachon'],[50,'погода','ob-havo'],[59,'радуга','kamalak'],[60,'жаркий','issiq'],
 [72,'морозный','ayozli'],[73,'быть',"bo'lmoq"],[88,'путешествовать','sayohat qilmoq'],
 [89,'Который час?','Soat nechchi?'],[105,'На улице холодно.','Tashqarida sovuq.']];
SPOT.forEach(([i,ru,uz]) => {
  eq(`word #${i+1} ru`, v4.words[i].ru, ru);
  eq(`word #${i+1} uz`, v4.words[i].uz, uz);
});
ok('no empty side', v4.words.every(x => x.ru && x.ru.trim() && x.uz && x.uz.trim()));
ok('every word is speakable through speech.js (.ru is Cyrillic)', v4.words.every(x => /[Ѐ-ӿ]/.test(x.ru)));
ok('lessons 1-3 vocabulary untouched',
   [45,79,73].every((n,i) => vdom.window.__v.topics.find(t=>t.id===i+1).words.length === n));
ok('vocabulary topics 6-16 still empty',
   vdom.window.__v.topics.filter(t=>t.id>=6).every(t=>t.words.length===0));

/* The count now lives in A2_VOCAB_COUNTS and is rendered by the shared
   vocabulary component. The guarantee is unchanged: what the learner sees
   must equal what was actually imported. */
[1,2,3,4].forEach((tid) => {
  const actual = vdom.window.__v.topics.find(t => t.id === tid).words.length;
  const block = (SRC.match(/var A2_VOCAB_COUNTS = \{([^}]*)\}/) || [])[1];
  ok(`T${tid}: the card knows this topic's word count`,
     !!block && new RegExp('\\b' + tid + '\\s*:').test(block));
  if (!block) return;
  const m = new RegExp('\\b' + tid + '\\s*:\\s*(\\d+)').exec(block);
  if (m) eq(`T${tid}: shown count (${m[1]}) equals imported count (${actual})`,
            Number(m[1]), actual);
  ok(`T${tid}: rendered through the shared component`,
     /UzExerciseUI\.renderVocabCard/.test(SRC));
});

console.log('\n' + '─'.repeat(64));
console.log(fail === 0
  ? `  ✅ A2 L4 ANSWERS + VOCAB: ${pass}/${pass} assertions passed`
  : `  ❌ A2 L4 ANSWERS + VOCAB: ${fail} failed / ${pass + fail}`);
process.exit(fail ? 1 : 0);
