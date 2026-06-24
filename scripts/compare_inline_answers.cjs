/* ============================================================================
   DEMO vs PAID-COURSE — INLINE ANSWER DIFF
   ----------------------------------------------------------------------------
   Complements compare_demo_vs_course.cjs (which covers parallel question/answer
   ARRAYS). This script covers the INLINE exercise formats where each item keeps
   its own answer:
       { text|words|uz|prompt: <key>, ... answer: '<value>' }
       matchingGame pairs: { left: 'x', right: 'y' }
   It matches items across demo↔course by their key text and reports any case
   where the paid course's answer differs from the demo's — i.e. corruption in a
   shared (free-preview) exercise.

   Usage:  node scripts/compare_inline_answers.cjs
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

// Pull every {... key: '...', ... answer: '...' } pairing.
function inlineAnswers(src) {
    const map = new Map();
    // match a "key" field (text/words/uz/prompt/question) and an answer within the same object-ish window
    const re = /(?:text|uz|prompt|question)\s*:\s*(["'])((?:\\.|(?!\1).)*)\1[\s\S]{0,400}?answer\s*:\s*(["'])((?:\\.|(?!\3).)*)\3/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        const key = m[2].replace(/\\'/g, "'").trim().toLowerCase().replace(/\s+/g, ' ');
        const ans = m[4].replace(/\\'/g, "'").trim();
        if (!key) continue;
        if (!map.has(key)) map.set(key, ans);    // first occurrence wins
    }
    return map;
}
// matchingGame pairs: left -> right
function matchPairs(src) {
    const map = new Map();
    const re = /left\s*:\s*(["'])((?:\\.|(?!\1).)*)\1\s*,\s*right\s*:\s*(["'])((?:\\.|(?!\3).)*)\3/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        const l = m[2].trim().toLowerCase(), r = m[4].trim();
        if (!map.has(l)) map.set(l, r);
    }
    return map;
}

let problems = 0;
for (const [demoRel, courseRel] of PAIRS) {
    const demoFile = path.join(ROOT, demoRel), courseFile = path.join(ROOT, courseRel);
    if (!fs.existsSync(demoFile) || !fs.existsSync(courseFile)) continue;
    const demoSrc = fs.readFileSync(demoFile, 'utf8'), courseSrc = fs.readFileSync(courseFile, 'utf8');

    console.log(`\n=== ${demoRel}  vs  ${courseRel} ===`);
    let fileProblems = 0;

    const dInline = inlineAnswers(demoSrc), cInline = inlineAnswers(courseSrc);
    for (const [key, cAns] of cInline) {
        if (!dInline.has(key)) continue;
        const dAns = dInline.get(key);
        if (dAns !== cAns) {
            fileProblems++; problems++;
            console.log(`  [INLINE MISMATCH] "${key.slice(0, 70)}"`);
            console.log(`      demo:   "${dAns}"`);
            console.log(`      course: "${cAns}"  <-- differs`);
        }
    }
    const dPairs = matchPairs(demoSrc), cPairs = matchPairs(courseSrc);
    for (const [l, cR] of cPairs) {
        if (!dPairs.has(l)) continue;
        if (dPairs.get(l) !== cR) {
            fileProblems++; problems++;
            console.log(`  [MATCH PAIR MISMATCH] left="${l}"  demo right="${dPairs.get(l)}"  course right="${cR}"`);
        }
    }
    if (!fileProblems) console.log('  (no inline-answer mismatches on shared exercises)');
}
console.log(`\n=== TOTAL INLINE MISMATCHES: ${problems} ===`);
process.exitCode = problems ? 1 : 0;
