'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'paid-courses/a2-vocabulary.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x ? '  → ' + x : '')); } };
const eq = (n, a, b) => ok(n, Object.is(a, b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const blocks = [...SRC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const data = blocks.find(b => b.includes('const vocabularyData'));
ok('vocabularyData block found', !!data);

const vc = new VirtualConsole();
// The data block also wires DOM handlers, so it needs the real document.
const dom = new JSDOM(SRC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g, '<script></script>'),
  { url: 'https://uzdarus.uz/paid-courses/a2-vocabulary.html', runScripts: 'outside-only',
    pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
w.HTMLElement.prototype.scrollIntoView = function () {};
w.alert = () => {};
w.speechSynthesis = { speak(){}, cancel(){}, getVoices: () => [] };
w.eval("window.currentUser = { id:'dev', uid:'dev', role:'developer', name:'Dev', email:'d@uzdarus.local' };");
// Evaluate the whole data block, then export. Splitting on '\n};' is fragile
// because the file contains other object literals; the block parses as-is.
w.eval(data + '\n;window.__v = vocabularyData;');
const v = w.__v;
ok('vocabularyData parsed', !!v && Array.isArray(v.topics));

const t1 = v.topics.find(t => t.id === 1);
ok('topic 1 present', !!t1);
eq('topic 1 name matches the lesson', t1.name, '«У меня есть» va kundalik hayotim');
eq('topic 1 unlocked (demo + paid)', t1.isLocked, false);
eq('45 words imported from the resource', t1.words.length, 45);

const RESOURCE = [
  ['занят','band'],['свободный',"bo'sh"],['счастливый','baxtli'],['грустный','xafa'],
  ['уставший','charchagan'],['здоровый',"sog'lom"],['больной','kasal'],['готов','tayyor'],
  ['спокойный','xotirjam'],['внимательный',"e'tiborli"],
  ['быть',"bo'lmoq"],['жить','yashamoq'],['работать','ishlamoq'],['учиться',"o'qimoq"],
  ['читать',"o'qimoq (kitob)"],['писать','yozmoq'],['говорить','gapirmoq'],
  ['смотреть','tomosha qilmoq'],['слушать','tinglamoq'],['заниматься',"shug'ullanmoq"],
  ['отдыхать','dam olmoq'],['мечтать','orzu qilmoq'],['хотеть','xohlamoq'],['любить','sevmoq'],
  ['иметь',"ega bo'lmoq (kam ishlatiladi)"],
  ['У меня есть...','Menda ... bor.'],['У тебя есть...?','Senda ... bormi?'],
  ['У него есть...','Unda ... bor.'],['У неё есть...','Unda ... bor.'],
  ['У нас есть...','Bizda ... bor.'],['У вас есть...?','Sizda ... bormi?'],
  ['У них есть...','Ularda ... bor.'],['У меня нет...',"Menda ... yo'q."],
  ['У него нет...',"Unda ... yo'q."],['У нас нет...',"Bizda ... yo'q."],
  ['Я был...','Men ... edim.'],['Я была...','Men ... edim. (ayol)'],
  ['Мы были...','Biz ... edik.'],['Меня не было...',"Men ...da yo'q edim."],
  ['Нас не было...',"Biz ...da yo'q edik."],['Я буду...',"Men ... bo'laman."],
  ['Мы будем...',"Biz ... bo'lamiz."],['У меня будет...',"Menda ... bo'ladi."],
  ['У нас будут...',"Bizda ... bo'ladi."],['Я хочу быть...',"Men ... bo'lishni xohlayman."],
];
eq('checklist length matches', RESOURCE.length, 45);
let mismatch = 0;
RESOURCE.forEach(([ru, uz], i) => {
  if (t1.words[i].ru !== ru || t1.words[i].uz !== uz) {
    mismatch++;
    console.log(`  ✗ word ${i + 1}: got ${JSON.stringify(t1.words[i])} want {ru:${JSON.stringify(ru)},uz:${JSON.stringify(uz)}}`);
  }
});
eq('every word matches the resource verbatim (ru + uz, in order)', mismatch, 0);
ok('no empty russian side', t1.words.every(x => x.ru && x.ru.trim()));
ok('no empty uzbek side', t1.words.every(x => x.uz && x.uz.trim()));
ok('every word is speakable (TTS reads the .ru field)',
   t1.words.every(x => /[Ѐ-ӿ]/.test(x.ru)));

// ---------------- TOPIC 2 (Lesson 2) ----------------
const t2 = v.topics.find(t => t.id === 2);
ok('topic 2 present', !!t2);
eq('topic 2 name matches the lesson', t2.name, 'Oila va munosabatlar');
eq('topic 2 unlocked', t2.isLocked, false);
eq('79 words imported from the resource', t2.words.length, 79);
const R2 = [
 ['любовь','sevgi'],['дружба',"do'stlik"],['уважение','hurmat'],['доверие','ishonch'],
 ['поддержка',"qo'llab-quvvatlash"],['забота',"g'amxo'rlik"],['понимание','tushunish'],
 ['взаимопонимание',"o'zaro tushunish"],['счастье','baxt'],['радость','quvonch'],
 ['верность','sadoqat'],['честность','halollik'],['искренность','samimiylik'],
 ['ответственность',"mas'uliyat"],['помощь','yordam'],['общение','muloqot'],
 ['конфликт','mojaro'],['ссора','janjal'],['мир','totuvlik'],['согласие','hamjihatlik'],
 ['жить','yashamoq'],['родиться',"tug'ilmoq"],['расти',"ulg'aymoq"],['воспитывать','tarbiyalamoq'],
 ['любить','sevmoq'],['уважать','hurmat qilmoq'],['помогать','yordam bermoq'],
 ['заботиться',"g'amxo'rlik qilmoq"],['поддерживать',"qo'llab-quvvatlamoq"],['познакомиться','tanishmoq'],
 ['встречаться','uchrashib yurmoq'],['жениться','uylanmoq'],['выйти замуж','turmushga chiqmoq'],
 ['создать семью','oila qurmoq'],['воспитывать детей','farzand tarbiyalamoq'],
 ['проводить время',"vaqt o'tkazmoq"],['отмечать','nishonlamoq'],['праздновать','bayram qilmoq'],
 ['переехать',"ko'chib o'tmoq"],['скучать','sog\'inmoq'],
 ['дружный','ahil'],['добрый','mehribon'],['заботливый',"g'amxo'r"],['честный','halol'],
 ['искренний','samimiy'],['счастливый','baxtli'],['весёлый','quvnoq'],['трудолюбивый','mehnatkash'],
 ['ответственный',"mas'uliyatli"],['спокойный','xotirjam'],['терпеливый','sabrli'],
 ['вежливый','xushmuomala'],['внимательный',"e'tiborli"],['надёжный','ishonchli'],
 ['общительный','kirishimli'],['дружелюбный',"do'stona"],['любимый','sevimli'],
 ['близкий','yaqin'],['семейный','oilaviy'],
 ['создать семью','oila qurmoq'],['жить вместе','birga yashamoq'],
 ['проводить время вместе',"birga vaqt o'tkazmoq"],['заботиться друг о друге',"bir-biriga g'amxo'rlik qilmoq"],
 ['поддерживать друг друга',"bir-birini qo'llab-quvvatlamoq"],['уважать родителей','ota-onani hurmat qilmoq'],
 ['воспитывать детей','farzand tarbiyalamoq'],['отмечать праздники вместе','bayramlarni birga nishonlamoq'],
 ['собираться всей семьёй',"butun oila bo'lib yig'ilmoq"],['жить в мире и согласии','tinch va ahil yashamoq'],
 ['доверять друг другу','bir-biriga ishonmoq'],['решать проблемы вместе','muammolarni birgalikda hal qilmoq'],
 ['хранить семейные традиции',"oilaviy an'analarni saqlamoq"],['быть опорой для семьи',"oila uchun tayanch bo'lmoq"],
 ['гордиться своей семьёй','oilasi bilan faxrlanmoq'],['любить своих близких','yaqinlarini sevmoq'],
 ['уважать мнение друг друга','bir-birining fikrini hurmat qilmoq'],
 ['проводить выходные с семьёй',"dam olish kunlarini oila bilan o'tkazmoq"],
 ['помогать родителям','ota-onaga yordam bermoq'],['жить счастливо','baxtli yashamoq'],
];
eq('topic 2 checklist length', R2.length, 79);
let mm2 = 0;
R2.forEach(([ru, uz], i) => {
  if (t2.words[i].ru !== ru || t2.words[i].uz !== uz) {
    mm2++;
    console.log(`  ✗ T2 word ${i + 1}: got ${JSON.stringify(t2.words[i])} want {ru:${JSON.stringify(ru)},uz:${JSON.stringify(uz)}}`);
  }
});
eq('every topic-2 word matches the resource verbatim, in order', mm2, 0);
ok('no empty side in topic 2', t2.words.every(x => x.ru && x.ru.trim() && x.uz && x.uz.trim()));
ok('every topic-2 word is speakable', t2.words.every(x => /[Ѐ-ӿ]/.test(x.ru)));

// other topics untouched
eq('16 vocabulary topics still present', v.topics.length, 16);
ok('topic 3 vocabulary untouched', v.topics.find(t => t.id === 3).words.length > 0);

// course card + deep link
const COURSE = fs.readFileSync(path.join(ROOT, 'paid-courses/a2-course.html'), 'utf8');
/* The word count and the deep link moved out of per-topic markup into
   A2_VOCAB_COUNTS + the shared vocabulary component. Same guarantees, new
   home: the figures are asserted against the real word lists further down. */
const DEMO = fs.readFileSync(path.join(ROOT, 'a2-demo.html'), 'utf8');
ok('topic 1 card advertises 45 words', /\b1\s*:\s*45\b/.test(COURSE));
ok('topic 2 card advertises 79 words', /\b2\s*:\s*79\b/.test(COURSE));
ok('demo topic 1 card also says 45', /\b1\s*:\s*45\b/.test(DEMO));
ok('demo topic 2 card also says 79', /\b2\s*:\s*79\b/.test(DEMO));
ok('no stale 40-word label remains anywhere', !/40 ta so'z/.test(COURSE) && !/40 ta so'z/.test(DEMO));
ok('course card deep-links by topic id',
   /a2-vocabulary\.html\?topic=' \+ topicId/.test(COURSE));
ok('demo card deep-links to its own vocabulary page',
   /a2-demo-vocabulary\.html\?topic=' \+ topicId/.test(DEMO));
ok('vocabulary page declares its course for speech.js', /window\.VOCAB_COURSE\s*=\s*'a2'/.test(SRC));
ok('speech engine loaded on the vocabulary page', /paid-courses\/speech\.js/.test(SRC));

/* ------------------------------------------------------------------
   THE DEMO HAS ITS OWN VOCABULARY PAGE.
   a2-demo.html deep-links to a2-demo-vocabulary.html, NOT to
   paid-courses/a2-vocabulary.html. Updating only the paid page (as the
   first two lessons did) left demo learners on the pre-lesson word
   lists for every topic. Both pages must carry identical words.
   ------------------------------------------------------------------ */
console.log('\n─── demo vocabulary page ───');
const DVOC = fs.readFileSync(path.join(ROOT, 'a2-demo-vocabulary.html'), 'utf8');
const dblocks = [...DVOC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const ddata = dblocks.find(b => b.includes('const vocabularyData'));
ok('demo vocabularyData block found', !!ddata);
const dvc = new VirtualConsole(); dvc.on('jsdomError', () => {});
const ddom = new JSDOM(DVOC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g, '<script></script>'),
  { url: 'https://uzdarus.uz/a2-demo-vocabulary.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: dvc });
const dw = ddom.window;
dw.HTMLElement.prototype.scrollIntoView = function () {};
dw.alert = () => {};
dw.speechSynthesis = { speak(){}, cancel(){}, getVoices: () => [] };
dw.eval("window.currentUser={id:'dev',uid:'dev',role:'developer',name:'Dev',email:'d@uzdarus.local'};");
dw.eval(ddata + '\n;window.__v = vocabularyData;');
const dv = dw.__v;
ok('demo vocabulary parsed', !!dv && Array.isArray(dv.topics));
eq('demo has 16 vocabulary topics', dv.topics.length, 16);
[1, 2, 3].forEach((tid) => {
  const paid = v.topics.find(t => t.id === tid);
  const demo = dv.topics.find(t => t.id === tid);
  eq(`demo T${tid} word count equals paid`, demo.words.length, paid.words.length);
  const same = demo.words.every((x, i) => x.ru === paid.words[i].ru && x.uz === paid.words[i].uz);
  ok(`demo T${tid} words are byte-identical to paid (ru + uz, in order)`, same);
});
ok('demo topics 4-16 left untouched (they carry no words, as before)',
   dv.topics.filter(t => t.id >= 4).every(t => t.words.length === 0));
ok('demo vocabulary page uses the same speech engine', /paid-courses\/speech\.js/.test(DVOC) || /speech\.js/.test(DVOC));
ok('demo course deep-links to the DEMO vocabulary page',
   /a2-demo-vocabulary\.html\?topic=' \+ topicId/.test(DEMO) &&
   !/[^-]a2-vocabulary\.html\?topic=' \+ topicId/.test(DEMO));

/* AUTO word-count sync must hold for the DEMO page too — now read from
   A2_VOCAB_COUNTS, which the shared vocabulary component renders. */
[1, 2, 3].forEach((tid) => {
  const actual = dv.topics.find(t => t.id === tid).words.length;
  const block = (DEMO.match(/var A2_VOCAB_COUNTS = \{([^}]*)\}/) || [])[1];
  ok(`demo T${tid} card knows its word count`,
     !!block && new RegExp('\\b' + tid + '\\s*:').test(block));
  if (!block) return;
  const mm = new RegExp('\\b' + tid + '\\s*:\\s*(\\d+)').exec(block);
  if (mm) eq(`demo T${tid}: shown count (${mm[1]}) equals imported count (${actual})`,
             Number(mm[1]), actual);
});

console.log('\n' + '─'.repeat(60));
console.log(fail === 0 ? `  ✅ A2 VOCAB (paid+demo): ${pass}/${pass} passed` : `  ❌ A2 VOCAB (paid+demo): ${fail} failed / ${pass + fail}`);

/* ---------------------------------------------------------------------------
 * The vocabulary card's word count must equal the real word list. A2 showed
 * this figure before the UI migration and still must; this is what stops the
 * displayed number drifting away from the data.
 * ------------------------------------------------------------------------ */
{
  const pairs = [
    ['paid-courses/a2-course.html', 'paid-courses/a2-vocabulary.html'],
    ['a2-demo.html', 'a2-demo-vocabulary.html']
  ];
  for (const [page, vocabFile] of pairs) {
    const src = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const m = src.match(/var A2_VOCAB_COUNTS = \{([^}]*)\}/);
    ok(`${page}: declares per-topic word counts`, !!m);
    if (!m) continue;
    const declared = {};
    m[1].split(',').forEach(part => {
      const kv = part.split(':').map(x => x.trim());
      if (kv.length === 2 && kv[0]) declared[+kv[0]] = +kv[1];
    });

    const vh = fs.readFileSync(path.join(ROOT, vocabFile), 'utf8');
    const i = vh.search(/(?:const|let|var)\s+vocabularyData\s*=/);
    let d = 0, o = vh.indexOf('{', i), e = -1;
    for (let k = o; k < vh.length; k++) {
      if (vh[k] === '{') d++;
      else if (vh[k] === '}') { d--; if (d === 0) { e = k; break; } }
    }
    const data = vm.runInNewContext('(' + vh.slice(o, e + 1) + ')', { generateLockedTopics: () => [] });
    const real = {};
    (data.topics || []).forEach(t => { real[t.id] = (t.words || []).length; });

    Object.keys(declared).forEach(id => {
      eq(`${page}: topic ${id} card count equals the real word list`, declared[id], real[id]);
    });
    ok(`${page}: the card renders through the shared component`,
       /window\.UzExerciseUI\.renderVocabCard/.test(src));
    ok(`${page}: exactly one vocabulary card implementation`,
       (src.match(/class="b2-vocab-card"/g) || []).length === 0);
  }
}

console.log('─'.repeat(60));
process.exit(fail ? 1 : 0);
