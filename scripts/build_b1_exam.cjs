/* Builds FINAL_EXAM_DATA for the B1 final exam strictly from material that
   already exists inside the 20 B1 topics (paid-courses/b1-course.html) plus
   the B1 vocabulary file. Output: scripts/b1_exam_data.json
   - Section A Grammar:        40 (2 per topic, real choice items)
   - Section B Translation:    20 (1 per topic, real translation items)
   - Section C Vocabulary:     10 (real B1 vocabulary words)
   - Section D Reading:        10 (real course reading passage + questions)
   - Section E Communication:  20 (real dialogue / formal / service / problem items)
   = 100 graded answers. */
const fs = require('fs');
const path = require('path');
const dump = JSON.parse(fs.readFileSync(path.join(__dirname, 'b1_exercises_dump.json'), 'utf8'));
const { titles, exercises } = dump;

function firstGroup(n, pred) {
    return (exercises[n].exercises || []).find(pred);
}
function byId(n, id) {
    return (exercises[n].exercises || []).find(g => g.id === id);
}

// ---------- SECTION A — GRAMMAR (40) ----------
const grammarItems = [];
for (let n = 1; n <= 20; n++) {
    const g = firstGroup(n, x =>
        x.type === 'choice' &&
        (x.style === 'chips' || x.style === 'test') &&
        x.id !== 'audio' && x.id !== 'reading');
    if (!g) throw new Error('No grammar choice group for topic ' + n);
    const picks = (g.items || []).slice(0, 2);
    if (picks.length < 2) throw new Error('Grammar group too small topic ' + n);
    picks.forEach(it => {
        grammarItems.push({ mode: 'chip', q: it.q, opts: it.options, answer: it.answer });
    });
}

// ---------- SECTION B — TRANSLATION (20) ----------
const translationItems = [];
for (let n = 1; n <= 20; n++) {
    const g = firstGroup(n, x => /arjima|rus tiliga/i.test(x.title || ''));
    if (!g) throw new Error('No translation group for topic ' + n);
    const it = (g.items || [])[0];
    translationItems.push({ mode: 'input', q: it.q, answer: it.answer });
}

// ---------- SECTION C — VOCABULARY (10) ----------
// Real B1 vocabulary words (one per topic, spanning the course). Russian word
// shown, learner picks the Uzbek meaning. Distractors are other real B1 words.
const vocabularyItems = [
    { mode: 'chip', q: 'опыт', opts: ["tajriba", "martaba", "lavozim"], answer: 'tajriba' },
    { mode: 'chip', q: 'образование', opts: ["ta'lim", "rivojlanish", "tajriba"], answer: "ta'lim" },
    { mode: 'chip', q: 'привычка', opts: ["odat", "sport", "sog'liq"], answer: 'odat' },
    { mode: 'chip', q: 'воспоминание', opts: ["xotira", "bolalik", "kelajak"], answer: 'xotira' },
    { mode: 'chip', q: 'настроение', opts: ["kayfiyat", "his", "munosabat"], answer: 'kayfiyat' },
    { mode: 'chip', q: 'общество', opts: ["jamiyat", "shaxs", "muloqot"], answer: 'jamiyat' },
    { mode: 'chip', q: 'расходы', opts: ["xarajatlar", "maosh", "budjet"], answer: 'xarajatlar' },
    { mode: 'chip', q: 'закон', opts: ["qonun", "qoida", "majburiyat"], answer: 'qonun' },
    { mode: 'chip', q: 'мечта', opts: ["orzu", "reja", "maqsad"], answer: 'orzu' },
    { mode: 'chip', q: 'безопасность', opts: ["xavfsizlik", "kasallik", "kulfat"], answer: 'xavfsizlik' }
];

// ---------- SECTION D — READING (10) ----------
// Real course reading passage (Topic 17 — "Мой бюджет и мои планы") + its
// 10 true/false comprehension questions, exactly as taught in the course.
const t17reading = byId(17, 'reading');
const readingPassage = t17reading.readingText.slice();
const readingItems = (t17reading.items || []).map(it => ({
    mode: 'chip',
    q: it.q,
    opts: ['Правда', 'Ложь'],
    answer: Array.isArray(it.answer) ? it.answer[0] : it.answer
}));

// ---------- SECTION E — COMMUNICATION / SITUATIONS (20) ----------
const commItems = [];
// Formal / service communication (Topic 18 — polite phrases): 6
byId(18, 'ex5').items.slice(0, 6).forEach(it =>
    commItems.push({ mode: 'chip', q: it.q, opts: it.options, answer: it.answer }));
// Problem / complaint situations (Topic 15 — complaints): 5
byId(15, 'ex4').items.slice(0, 5).forEach(it =>
    commItems.push({ mode: 'chip', q: it.q, opts: it.options, answer: it.answer }));
// Social / opinion dialogue (Topic 13 — discussion dialog): 5
byId(13, 'ex5').items.slice(0, 5).forEach(it =>
    commItems.push({ mode: 'chip', q: it.q, opts: it.options, answer: it.answer }));
// Open dialogue completion (Topic 1 — continue the dialogue): 4
byId(1, 'ex6').items.slice(0, 4).forEach(it =>
    commItems.push({ mode: 'input', q: it.q, answer: it.answer }));

const examData = [
    { section: 'A', icon: '📝', title: "A bo'lim — Grammatika", subtitle: '20 ta mavzu grammatikasi · 40 ball', type: 'mixed', items: grammarItems },
    { section: 'B', icon: '🌐', title: "B bo'lim — Tarjima", subtitle: 'Har bir mavzudan tarjima · 20 ball', type: 'mixed', items: translationItems },
    { section: 'C', icon: '📚', title: "C bo'lim — Lug'at", subtitle: 'B1 kursi lug\'ati · 10 ball', type: 'mixed', items: vocabularyItems },
    { section: 'D', icon: '📖', title: "D bo'lim — O'qib tushunish", subtitle: 'Matn bo\'yicha savollar · 10 ball', type: 'mixed', items: readingItems, passage: readingPassage, passageTitle: t17reading.readingTitle || '' },
    { section: 'E', icon: '💬', title: "E bo'lim — Muloqot va vaziyatlar", subtitle: 'Dialog, rasmiy muomala, vaziyatlar · 20 ball', type: 'mixed', items: commItems }
];

// Validate counts
const counts = examData.map(s => s.items.length);
const total = counts.reduce((a, b) => a + b, 0);
console.log('Section counts:', JSON.stringify({ A: counts[0], B: counts[1], C: counts[2], D: counts[3], E: counts[4] }));
console.log('TOTAL graded answers:', total);
if (total !== 100) throw new Error('Expected 100 answers, got ' + total);
if (counts[0] !== 40 || counts[1] !== 20 || counts[2] !== 10 || counts[3] !== 10 || counts[4] !== 20)
    throw new Error('Section distribution mismatch: ' + counts.join(','));

// Sanity: every item has a non-empty answer
let idx = 0;
examData.forEach(s => s.items.forEach(it => {
    idx++;
    const a = Array.isArray(it.answer) ? it.answer : [it.answer];
    if (!a.length || a.some(x => x == null || String(x).trim() === ''))
        throw new Error('Empty answer at global item ' + idx + ' (' + JSON.stringify(it.q) + ')');
    if (it.mode === 'chip' && (!Array.isArray(it.opts) || it.opts.length < 2))
        throw new Error('Chip item missing options at ' + idx);
    if (it.mode === 'chip' && !it.opts.some(o => a.includes(o)))
        throw new Error('Chip answer not among options at ' + idx + ': ' + JSON.stringify(it));
}));

fs.writeFileSync(path.join(__dirname, 'b1_exam_data.json'), JSON.stringify(examData, null, 1), 'utf8');
console.log('Wrote scripts/b1_exam_data.json  (' + idx + ' items validated)');
