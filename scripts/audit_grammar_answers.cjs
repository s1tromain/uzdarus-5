/* ============================================================================
   GRAMMAR ANSWER-KEY AUDIT
   ----------------------------------------------------------------------------
   Extracts every parallel  questions:[...] / answers:[...]  (and
   blankQuestions/blankAnswers) pair from the course + demo HTML files and
   validates agreement for the deterministic exercise families:

     - possessive pronouns:  мой/моя/моё/мои, твой…, наш…, ваш…, свой…
     - demonstratives:       этот/эта/это/эти, тот/та/то/те
     - "весь":               весь/вся/всё/все

   Each answer in those families must agree IN GENDER/NUMBER with the noun in
   the corresponding question ("Это … <noun>"). We resolve the noun's gender
   from a dictionary (NOUN_GENDER). Unknown nouns are reported separately so the
   dictionary can be completed — they are NOT counted as errors.

   Usage:  node scripts/audit_grammar_answers.cjs
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = [
    'a1-demo.html', 'a2-demo.html', 'b1-demo.html', 'b2-demo.html',
    'paid-courses/a1-course.html', 'paid-courses/a2-course.html',
    'paid-courses/b1-course.html', 'paid-courses/b2-course.html',
];

// gender codes: m = masculine, f = feminine, n = neuter, p = plural
const NOUN_GENDER = {
    // masculine
    'класс': 'm', 'дом': 'm', 'город': 'm', 'университет': 'm', 'директор': 'm',
    'проект': 'm', 'офис': 'm', 'праздник': 'm', 'успех': 'm', 'телефон': 'm',
    'брат': 'm', 'учитель': 'm', 'паспорт': 'm', 'ребёнок': 'm', 'ноутбук': 'm',
    'шампунь': 'm', 'чемодан': 'm', 'план': 'm', 'ключ': 'm', 'билет': 'm',
    'ученик': 'm', 'друг': 'm', 'сын': 'm', 'отец': 'm', 'муж': 'm', 'врач': 'm',
    'студент': 'm', 'компьютер': 'm', 'стол': 'm', 'стул': 'm', 'журнал': 'm',
    'словарь': 'm', 'портфель': 'm', 'карандаш': 'm', 'вопрос': 'm', 'ответ': 'm',
    'магазин': 'm', 'банк': 'm', 'парк': 'm', 'мост': 'm', 'автобус': 'm',
    'поезд': 'm', 'самолёт': 'm', 'час': 'm', 'год': 'm', 'день': 'm', 'месяц': 'm',
    'фильм': 'm', 'спорт': 'm', 'язык': 'm', 'урок': 'm', 'экзамен': 'm',
    'результат': 'm', 'опыт': 'm', 'характер': 'm', 'голос': 'm', 'цвет': 'm',
    // feminine
    'школа': 'f', 'страна': 'f', 'семья': 'f', 'идея': 'f', 'проблема': 'f',
    'команда': 'f', 'учёба': 'f', 'учеба': 'f', 'мечта': 'f', 'цель': 'f',
    'учительница': 'f', 'квартира': 'f', 'группа': 'f', 'мама': 'f', 'комната': 'f',
    'машина': 'f', 'сестра': 'f', 'работа': 'f', 'книга': 'f', 'сумка': 'f',
    'дочь': 'f', 'жена': 'f', 'подруга': 'f', 'студентка': 'f', 'ручка': 'f',
    'тетрадь': 'f', 'доска': 'f', 'дверь': 'f', 'улица': 'f', 'площадь': 'f',
    'река': 'f', 'погода': 'f', 'зима': 'f', 'весна': 'f', 'осень': 'f',
    'жизнь': 'f', 'любовь': 'f', 'дружба': 'f', 'история': 'f', 'музыка': 'f',
    'песня': 'f', 'картина': 'f', 'газета': 'f', 'неделя': 'f', 'минута': 'f',
    'девочка': 'f', 'женщина': 'f', 'девушка': 'f', 'фотография': 'f', 'еда': 'f',
    // neuter
    'решение': 'n', 'письмо': 'n', 'окно': 'n', 'место': 'n', 'слово': 'n',
    'имя': 'n', 'утро': 'n', 'море': 'n', 'небо': 'n', 'дерево': 'n', 'облако': 'n',
    'здание': 'n', 'упражнение': 'n', 'задание': 'n', 'предложение': 'n',
    'время': 'n', 'дело': 'n', 'лицо': 'n', 'сердце': 'n', 'кафе': 'n', 'метро': 'n',
    'радио': 'n', 'кино': 'n', 'пальто': 'n', 'число': 'n', 'образование': 'n',
    // plural (pluralia tantum or explicitly plural forms used in these drills)
    'учителя': 'p', 'дети': 'p', 'коллеги': 'p', 'друзья': 'p', 'родители': 'p',
    'документы': 'p', 'книги': 'p', 'вещи': 'p', 'ключи': 'p', 'планы': 'p',
    'деньги': 'p', 'ученики': 'p', 'билеты': 'p', 'чемоданы': 'p', 'каникулы': 'p',
    'часы': 'p', 'очки': 'p', 'люди': 'p', 'студенты': 'p', 'окна': 'p',
    'цветы': 'p',
    // extra masculine/feminine seen in drills
    'дедушка': 'm', 'папа': 'm', 'дядя': 'm', 'бабушка': 'f',
};
// Words that are NOT the head noun even if they appear last (adverbs/adjectives).
const NON_NOUN = new Set(['дома', 'тяжёлая', 'тяжелая', 'интересные', 'готовы', 'есть']);

// Pronoun family -> required gender of the answer token.
const PRONOUN_GENDER = {};
[['мой', 'm'], ['моя', 'f'], ['моё', 'n'], ['мое', 'n'], ['мои', 'p'],
 ['твой', 'm'], ['твоя', 'f'], ['твоё', 'n'], ['твое', 'n'], ['твои', 'p'],
 ['наш', 'm'], ['наша', 'f'], ['наше', 'n'], ['наши', 'p'],
 ['ваш', 'm'], ['ваша', 'f'], ['ваше', 'n'], ['ваши', 'p'],
 ['свой', 'm'], ['своя', 'f'], ['своё', 'n'], ['свое', 'n'], ['свои', 'p'],
 ['этот', 'm'], ['эта', 'f'], ['это', 'n'], ['эти', 'p'],
 ['тот', 'm'], ['та', 'f'], ['то', 'n'], ['те', 'p'],
 ['весь', 'm'], ['вся', 'f'], ['всё', 'n'], ['все', 'p'],
 ['один', 'm'], ['одна', 'f'], ['одно', 'n'], ['одни', 'p'],
].forEach(([w, g]) => { PRONOUN_GENDER[w] = g; });

const GENDER_NAME = { m: 'мужской (m)', f: 'женский (f)', n: 'средний (n)', p: 'множ. (pl)' };

function cleanToken(s) {
    return String(s).trim().toLowerCase().replace(/ё/g, 'ё');
}
// Extract the head noun from a question like "Это … коллеги" / "Где … мама?"
function extractNoun(q) {
    const stripped = String(q)
        .replace(/[…\.]{1,}/g, ' ')            // ellipsis / blank markers
        .replace(/[?!.,:;"'«»()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const words = stripped.split(' ').filter(Boolean).map(w => w.toLowerCase());
    // Prefer a known noun anywhere in the phrase; else the last non-adverb word.
    for (const w of words) { if (NOUN_GENDER[w]) return w; }
    for (let i = words.length - 1; i >= 0; i--) { if (!NON_NOUN.has(words[i])) return words[i]; }
    return words[words.length - 1] || '';
}

// Parse a JS string-array literal body into an array of strings.
function parseStringArray(body) {
    const out = [];
    const re = /(["'])((?:\\.|(?!\1).)*)\1/g;
    let m;
    while ((m = re.exec(body)) !== null) out.push(m[2]);
    return out;
}

// Find every  KEY: [ ... ]  block and return {key, body, index}.
function findArrays(src, key) {
    const res = [];
    const re = new RegExp(key + '\\s*:\\s*\\[', 'g');
    let m;
    while ((m = re.exec(src)) !== null) {
        let i = m.index + m[0].length, depth = 1;
        while (i < src.length && depth > 0) {
            const c = src[i];
            if (c === '[') depth++;
            else if (c === ']') depth--;
            i++;
        }
        res.push({ start: m.index, body: src.slice(m.index + m[0].length, i - 1) });
    }
    return res;
}

let totalPairs = 0, checkedAnswers = 0, errors = [], unknownNouns = new Set();

for (const rel of FILES) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');

    // Build a single document-ordered stream of question/answer arrays, then
    // pair each questions[] with the IMMEDIATELY following answers[] (nothing of
    // either kind in between). This avoids pairing a stray questions[] with a
    // distant answers[] belonging to a different exercise object.
    const stream = [];
    for (const x of findArrays(src, 'questions')) stream.push({ ...x, role: 'q' });
    for (const x of findArrays(src, 'blankQuestions')) stream.push({ ...x, role: 'q' });
    for (const x of findArrays(src, 'answers')) stream.push({ ...x, role: 'a' });
    for (const x of findArrays(src, 'blankAnswers')) stream.push({ ...x, role: 'a' });
    stream.sort((a, b) => a.start - b.start);

    const qArrs = [];
    for (let k = 0; k < stream.length; k++) {
        if (stream[k].role === 'q' && stream[k + 1] && stream[k + 1].role === 'a') {
            qArrs.push({ ...stream[k], answer: stream[k + 1] });
        }
    }

    for (const q of qArrs) {
        const a = q.answer;
        const questions = parseStringArray(q.body);
        const answers = parseStringArray(a.body);
        if (questions.length === 0 || answers.length === 0) continue;
        totalPairs++;

        const n = Math.min(questions.length, answers.length);
        if (questions.length !== answers.length) {
            errors.push({
                file: rel, kind: 'LENGTH-MISMATCH',
                detail: `questions(${questions.length}) != answers(${answers.length}) near char ${q.start}`,
            });
        }
        for (let i = 0; i < n; i++) {
            const ans = cleanToken(answers[i]);
            const reqGender = PRONOUN_GENDER[ans];
            if (!reqGender) continue;            // not an agreement-family answer
            const noun = extractNoun(questions[i]);
            const nounGender = NOUN_GENDER[noun];
            checkedAnswers++;
            if (!nounGender) { unknownNouns.add(noun + '  (in: "' + questions[i] + '")'); continue; }
            if (nounGender !== reqGender) {
                errors.push({
                    file: rel, kind: 'AGREEMENT',
                    detail: `"${questions[i]}" -> answer "${answers[i]}" (${GENDER_NAME[reqGender]}) ` +
                            `but noun "${noun}" is ${GENDER_NAME[nounGender]}`,
                });
            }
        }
    }
}

console.log('=== GRAMMAR ANSWER-KEY AUDIT ===');
console.log(`Files scanned: ${FILES.length}`);
console.log(`Question/answer array pairs found: ${totalPairs}`);
console.log(`Agreement-family answers checked: ${checkedAnswers}`);
console.log(`\n--- AGREEMENT / LENGTH ERRORS: ${errors.length} ---`);
for (const e of errors) console.log(`[${e.kind}] ${e.file}\n    ${e.detail}`);
if (unknownNouns.size) {
    console.log(`\n--- UNKNOWN NOUNS (not validated, add to dictionary): ${unknownNouns.size} ---`);
    for (const u of [...unknownNouns].sort()) console.log('    ' + u);
}
process.exitCode = errors.length ? 1 : 0;
