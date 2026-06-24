/* ============================================================================
   DEMO vs PAID-COURSE ANSWER-KEY DIFF
   ----------------------------------------------------------------------------
   The *-demo.html files are the clean reference for the free preview topics
   (1-3). The paid *-course.html files contain the SAME exercises (plus locked
   topics). Several paid files have answer arrays that were overwritten with
   data from a different exercise. This script matches exercises across the two
   files BY QUESTION TEXT and reports any case where the questions are identical
   but the answer key differs — i.e. a corrupted answer key in the paid course.

   Covered answer arrays:  answers / blankAnswers / mcAnswers
   (each paired with the questions / blankQuestions / mcQuestions that precede).

   Usage:  node scripts/compare_demo_vs_course.cjs
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const PAIRS = [
    ['a1-demo.html', 'paid-courses/a1-course.html'],
    ['a2-demo.html', 'paid-courses/a2-course.html'],
    ['b1-demo.html', 'paid-courses/b1-course.html'],
    ['b2-demo.html', 'paid-courses/b2-course.html'],
];

function parseStringArray(body) {
    const out = [];
    const re = /(["'])((?:\\.|(?!\1).)*)\1/g;
    let m;
    while ((m = re.exec(body)) !== null) out.push(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'));
    return out;
}
function parseRawArray(body) {
    // numbers / mixed — keep tokens as trimmed strings
    return body.split(',').map(s => s.trim()).filter(s => s.length);
}
function findArrays(src, key, raw) {
    const res = [];
    const re = new RegExp('(^|[^A-Za-z0-9_])' + key + '\\s*:\\s*\\[', 'g');
    let m;
    while ((m = re.exec(src)) !== null) {
        const open = m.index + m[0].length;
        let i = open, depth = 1;
        while (i < src.length && depth > 0) {
            const c = src[i];
            if (c === '[') depth++; else if (c === ']') depth--;
            i++;
        }
        const body = src.slice(open, i - 1);
        res.push({ start: m.index, values: raw ? parseRawArray(body) : parseStringArray(body) });
    }
    return res;
}

// Build ordered list of {qKey, qText, answers} records for a file.
function extract(file) {
    const src = fs.readFileSync(file, 'utf8');
    const recs = [];
    const families = [
        ['questions', 'answers', false],
        ['blankQuestions', 'blankAnswers', false],
        ['mcQuestions', 'mcAnswers', true],
    ];
    for (const [qk, ak, raw] of families) {
        const qs = findArrays(src, qk, false);
        const as = findArrays(src, ak, raw);
        for (const q of qs) {
            // nearest answer array after this question array
            const a = as.filter(x => x.start > q.start).sort((u, v) => u.start - v.start)[0];
            if (!a) continue;
            if (!q.values.length) continue;
            recs.push({
                family: qk,
                qKey: q.values.join(' ||| ').toLowerCase().replace(/\s+/g, ' ').trim(),
                qText: q.values,
                answers: a.values,
            });
        }
    }
    return recs;
}

let problems = 0;
for (const [demoRel, courseRel] of PAIRS) {
    const demoFile = path.join(ROOT, demoRel);
    const courseFile = path.join(ROOT, courseRel);
    if (!fs.existsSync(demoFile) || !fs.existsSync(courseFile)) continue;

    const demo = extract(demoFile);
    const course = extract(courseFile);
    // index demo by qKey
    const demoByKey = new Map();
    for (const r of demo) if (!demoByKey.has(r.qKey)) demoByKey.set(r.qKey, r);

    // Fuzzy fallback: find the demo record (same family, same length) whose
    // question entries best overlap this course record. Handles cases where a
    // single question string differs (e.g. mojibake "РЇ" vs "Я").
    function fuzzyMatch(c) {
        let best = null, bestScore = 0;
        for (const d of demo) {
            if (d.family !== c.family) continue;
            if (d.qText.length !== c.qText.length) continue;
            let same = 0;
            for (let i = 0; i < d.qText.length; i++) if (d.qText[i] === c.qText[i]) same++;
            const score = same / d.qText.length;
            if (score > bestScore) { bestScore = score; best = d; }
        }
        return bestScore >= 0.7 ? best : null;
    }

    console.log(`\n=== ${demoRel}  vs  ${courseRel} ===`);
    let fileProblems = 0;
    for (const c of course) {
        const d = demoByKey.get(c.qKey) || fuzzyMatch(c);
        if (!d) continue;                       // exercise only in course (locked topics) — skip
        const da = d.answers.join(' | ');
        const ca = c.answers.join(' | ');
        if (da !== ca) {
            fileProblems++; problems++;
            console.log(`\n  [MISMATCH] family=${c.family}`);
            console.log(`    questions: ${c.qText.slice(0, 6).join(' / ')}${c.qText.length > 6 ? ' …' : ''}`);
            console.log(`    demo  answers: [${da}]`);
            console.log(`    COURSE answers:[${ca}]   <-- corrupted`);
        }
    }
    if (!fileProblems) console.log('  (no answer-key mismatches on shared exercises)');
}
console.log(`\n=== TOTAL MISMATCHED ANSWER KEYS: ${problems} ===`);
process.exitCode = problems ? 1 : 0;
