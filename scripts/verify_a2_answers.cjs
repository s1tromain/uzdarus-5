'use strict';
/* ============================================================================
 * A2 · Lesson 1 — ANSWER-KEY CROSS-CHECK
 * ----------------------------------------------------------------------------
 * Independent verification that what shipped equals what the lesson resource
 * specifies: every prompt, every option list, every key — in order.
 *
 * NOTE ON PROVENANCE: the resource supplies an explicit answer key for exactly
 * ONE task, the «Правда или ложь?» quiz (its "Javoblar" list). Those ten are
 * asserted verbatim. Mashqlar 1-10 ship WITHOUT keys in the resource, so their
 * keys are derived from the resource's own grammar section (the authoritative
 * rule set for this lesson) and are asserted here so they can never drift.
 * ==========================================================================*/
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + n + (x ? '\n      ' + x : '')); } };
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), `expected ${JSON.stringify(b)}\n      got      ${JSON.stringify(a)}`);

function loadTopic1(rel) {
  const SRC = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const blocks = [...SRC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const pre = blocks.find(b => /(let|var|const)\s+currentUser/.test(b) && !b.includes('const courseData'));
  const main = blocks.find(b => b.includes('const courseData'));
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  const dom = new JSDOM(SRC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g, '<script></script>'),
    { url: 'https://uzdarus.uz/' + rel, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.alert = () => {};
  w.eval('window.saveQuizResult=async()=>1;window.saveUserProgress=async()=>1;window.getUserProgress=async()=>[];window.getUserQuizResults=async()=>({});window.logActivity=async()=>{};');
  if (pre) w.eval(pre);
  w.eval(main + '\n;window.__cd = courseData;');
  return w.__cd.topics.find(t => t.id === 1);
}

/* ---- THE CHECKLIST, transcribed from the lesson resource ---- */
const Q = {
  ex1: ["Я ___ дома вчера.","Она ___ в школе утром.","Мы ___ очень заняты.","Он ___ врачом.",
        "Они ___ в магазине.","Ты ___ на работе?","Вы ___ счастливы.","Ребёнок ___ дома.",
        "Мои друзья ___ в Ташкенте.","Мама ___ очень уставшей."],
  ex2: ["Она была в магазине.","Мы были готовы.","Он был счастлив.","Они были дома.","Вы были заняты.",
        "Я был на работе.","Ты был в школе.","Она была врачом.","Мы были вместе.","Они были в парке."],
  ex3: ["Я не был в школе.","Ты не был вчера.","Он не был на работе.","Она не была дома.",
        "Мы не были в городе.","Вы не были в магазине.","Они не были здесь.","Я не был на уроке.",
        "Мы не были на встрече.","Она не была в офисе."],
  ex4: ["Menda ___ книга.","Unda (m) ___ машина.","Senda ___ брат.","Unda (j) ___ сестра.",
        "Ularda ___ телефон.","Senda ___ работа.","Ularda ___ дети.","Unda (m) ___ компьютер.",
        "Unda (j) ___ время.","Ularda ___ деньги."],
  ex5: ["У меня есть машина.","У неё есть брат.","У него есть работа.","У нас есть дети.",
        "У вас есть вопросы.","У них есть дом.","У тебя есть телефон.","У меня есть время.",
        "У неё есть компьютер.","У него есть деньги."],
  ex6: ["У меня есть машина.","У него есть телефон.","У неё есть работа.","У нас есть собака.",
        "У них есть дети.","У тебя есть компьютер.","У вас есть квартира.","У меня есть идея.",
        "У неё есть мечта.","У него есть велосипед."],
  ex7: ["У меня есть работа.","У него есть машина.","У неё есть отпуск.","У нас есть экзамен.",
        "У них есть дом.","У тебя есть идея.","У вас есть вопросы.","У меня есть телефон.",
        "У неё есть компьютер.","У них есть дети."],
  ex8: ["Menda kitob bor.","Menda mashina yo'q.","Kecha men uyda edim.","Kecha biz uyda yo'q edik.",
        "U ishda edi.","Unda yangi telefon bor.","Bizda vaqt yo'q.","Ertaga menda imtihon bo'ladi.",
        "Men shifokor bo'lishni xohlayman.","Ular kecha bu yerda yo'q edi."],
  ex9: ["Я ___ дома вчера.","Мы ___ вместе.","У меня ___ книга.","У неё ___ машины.","Нас ___ дома.",
        "Они ___ счастливы.","Я хочу ___ врачом.","У него ___ работа.","Меня ___ вчера.","У нас ___ отпуск."],
  ex10:["Menda akam bor.","Bizda mashina yo'q.","Kecha men ishda edim.","Kecha meni uyda yo'q edi.",
        "U shifokor bo'ladi.","Men tarjimon bo'lishni xohlayman.","Ularda yangi uy bor.",
        "Ertaga bizda uchrashuv bo'ladi.","Sen kecha maktabda yo'q eding.","Bizda bo'sh vaqt bor."],
  audio:["Алим живёт в Ташкенте.","У Алима нет семьи.","У него есть своя комната и компьютер.",
        "Сейчас он изучает английский язык.","Каждый день у него есть уроки и домашнее задание.",
        "В прошлом году у него было много свободного времени.","Вчера Алим был дома вечером.",
        "Его друг был вместе с ним и смотрел фильм.","Завтра у Алима будет важный урок русского языка.",
        "Алим хочет быть хорошим специалистом и свободно говорить по-русски."],
};
/* ex9 option lists exactly as printed in the resource */
const EX9_OPTS = [["был","была","были"],["был","была","были"],["есть","был","будет"],
  ["нет","не","был"],["не был","не было","не были"],["будет","будут","был"],
  ["быть","был","будет"],["есть","была","будут"],["не было","не был","не были"],
  ["будет","будут","был"]];
/* ex9 keys — each derived from the grammar section of the SAME resource */
const EX9_KEYS = [["был","была"],"были","есть","нет","не было","будут","быть","есть","не было","будет"];
/* «Правда или ложь?» — the resource's own "Javoblar" list, verbatim */
const TF_KEYS = ["Правда","Ложь","Правда","Ложь","Правда","Ложь","Правда","Ложь","Правда","Правда"];
/* First accepted key per item for the free-text tasks (grammar-derived) */
const KEYS = {
  ex1: [["был","была"],"была","были","был","были",["был","была"],"были","был","были","была"],
  ex3: ["Меня не было в школе","Тебя не было вчера","Его не было на работе",["Её не было дома","Ее не было дома"],
        "Нас не было в городе","Вас не было в магазине","Их не было здесь","Меня не было на уроке",
        "Нас не было на встрече",["Её не было в офисе","Ее не было в офисе"]],
  ex5: ["У меня нет машины",["У неё нет брата","У нее нет брата"],"У него нет работы","У нас нет детей",
        "У вас нет вопросов","У них нет дома","У тебя нет телефона","У меня нет времени",
        ["У неё нет компьютера","У нее нет компьютера"],"У него нет денег"],
  ex6: ["У меня была машина","У него был телефон",["У неё была работа","У нее была работа"],"У нас была собака",
        "У них были дети","У тебя был компьютер","У вас была квартира","У меня была идея",
        ["У неё была мечта","У нее была мечта"],"У него был велосипед"],
  ex7: ["У меня будет работа","У него будет машина",["У неё будет отпуск","У нее будет отпуск"],
        "У нас будет экзамен","У них будет дом","У тебя будет идея","У вас будут вопросы",
        "У меня будет телефон",["У неё будет компьютер","У нее будет компьютер"],"У них будут дети"],
};

['paid-courses/a2-course.html', 'a2-demo.html'].forEach((rel) => {
  console.log('\n─── ' + rel + ' ───');
  const t1 = loadTopic1(rel);
  const byId = {};
  t1.topic1Exercises.exercises.forEach(g => { byId[g.id] = g; });

  eq('exercise ids and order', Object.keys(byId),
     ['ex1','ex2','ex3','ex4','ex5','ex6','ex7','ex8','ex9','ex10','audio']);

  Object.keys(Q).forEach((id) => {
    const g = byId[id];
    ok(id + ': group exists', !!g);
    if (!g) return;
    eq(id + ': prompts match the resource verbatim', g.items.map(i => i.q), Q[id]);
    eq(id + ': 10 questions', g.items.length, 10);
  });

  // exact keys
  eq('ex9: option lists match the resource', byId.ex9.items.map(i => i.options), EX9_OPTS);
  eq('ex9: answer keys', byId.ex9.items.map(i => i.answer), EX9_KEYS);
  eq('audio: True/False keys match the resource "Javoblar" list',
     byId.audio.items.map(i => i.answer), TF_KEYS);
  eq('audio: every item offers Правда/Ложь',
     byId.audio.items.map(i => i.options.join('|')),
     Array(10).fill('Правда|Ложь'));
  Object.keys(KEYS).forEach((id) => {
    eq(id + ': answer keys', byId[id].items.map(i => i.answer), KEYS[id]);
  });

  // structural guarantees
  const all = t1.topic1Exercises.exercises;
  eq('110 graded questions total', all.reduce((s, g) => s + g.items.length, 0), 110);
  ok('no duplicate exercise id', new Set(all.map(g => g.id)).size === all.length);
  ok('every group has a title', all.every(g => g.title && g.title.trim()));
  ok('every group has an intro', all.every(g => g.intro && g.intro.trim()));
  ok('every group has an icon', all.every(g => g.icon && /^fa-/.test(g.icon)));
  ok('every item carries a prompt', all.every(g => g.items.every(i => i.q && i.q.trim())));
  ok('no item is open-ended / unscoreable',
     all.every(g => g.items.every(i => {
       const a = Array.isArray(i.answer) ? i.answer : [i.answer];
       return a.length && a.every(x => String(x || '').trim());
     })));
  ok('choice groups always ship options',
     all.filter(g => g.type === 'choice').every(g => g.items.every(i => Array.isArray(i.options) && i.options.length >= 2)));
  ok('choice keys are always selectable',
     all.filter(g => g.type === 'choice').every(g => g.items.every(i => {
       const a = Array.isArray(i.answer) ? i.answer : [i.answer];
       return a.some(k => i.options.includes(k));
     })));
  ok('input groups never ship options',
     all.filter(g => g.type === 'input').every(g => g.items.every(i => i.options === undefined)));

  // grammar completeness
  const g = t1.grammar;
  [['«Быть» fe\'li va «У меня есть»','hero title'],['У + kim + есть + nima','possession formula'],
   ['Меня не было дома','genitive absence'],['был','past m'],['была','past f'],['было','past n'],
   ['были','past pl'],['буду','future 1sg'],['будут','future 3pl'],['Я хочу быть врачом','infinitive'],
   ['У меня нет машины','negation'],['У меня будет новая работа','future possession'],
   ['Мы не было','the wrong-form warning'],['У меня есть свободное время','daily phrase'],
  ].forEach(([needle, what]) => ok('grammar contains ' + what, g.includes(needle), needle));
  ok('grammar has no unrendered template placeholders', !/\$\{/.test(g));
});

console.log('\n' + '─'.repeat(64));
console.log(fail === 0
  ? `  ✅ A2 L1 ANSWER KEYS: ${pass}/${pass} assertions passed`
  : `  ❌ A2 L1 ANSWER KEYS: ${fail} failed / ${pass + fail}`);
console.log('─'.repeat(64));
process.exit(fail ? 1 : 0);
