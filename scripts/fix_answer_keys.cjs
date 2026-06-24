/* ============================================================================
   RESTORE CORRUPTED ANSWER KEYS IN PAID COURSES FROM THE CLEAN DEMO
   ----------------------------------------------------------------------------
   For each (demo, course) pair, match exercises by question text (exact, with a
   >=0.7 fuzzy fallback for single-string differences such as the "РЇ"/"Я"
   mojibake). Where the questions match but the paid course's answer array
   differs, OVERWRITE the course answer-array body with the demo's body.

   Only the answer arrays (answers / blankAnswers / mcAnswers) are touched, and
   only when a confident question match exists — questions, options and locked
   topics are never modified.

   Dry run:  node scripts/fix_answer_keys.cjs
   Apply:    node scripts/fix_answer_keys.cjs --apply
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');

const PAIRS = [
    ['a1-demo.html', 'paid-courses/a1-course.html'],
    ['a2-demo.html', 'paid-courses/a2-course.html'],
    ['b1-demo.html', 'paid-courses/b1-course.html'],
    ['b2-demo.html', 'paid-courses/b2-course.html'],
];
const FAMILIES = [
    ['questions', 'answers', false],
    ['blankQuestions', 'blankAnswers', false],
    ['mcQuestions', 'mcAnswers', true],
];

function parseStringArray(body) {
    const out = [];
    const re = /(["'])((?:\\.|(?!\1).)*)\1/g; let m;
    while ((m = re.exec(body)) !== null) out.push(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'));
    return out;
}
function parseRaw(body) { return body.split(',').map(s => s.trim()).filter(s => s.length); }

// Return arrays with full span: {start, bodyStart, bodyEnd, values}
function findArrays(src, key, raw) {
    const res = [];
    const re = new RegExp('(^|[^A-Za-z0-9_])' + key + '\\s*:\\s*\\[', 'g'); let m;
    while ((m = re.exec(src)) !== null) {
        const bodyStart = m.index + m[0].length;
        let i = bodyStart, depth = 1;
        while (i < src.length && depth > 0) { const c = src[i]; if (c === '[') depth++; else if (c === ']') depth--; i++; }
        const bodyEnd = i - 1; // index of closing ]
        res.push({ start: m.index, bodyStart, bodyEnd, values: raw ? parseRaw(src.slice(bodyStart, bodyEnd)) : parseStringArray(src.slice(bodyStart, bodyEnd)) });
    }
    return res;
}
function records(src) {
    const recs = [];
    for (const [qk, ak, raw] of FAMILIES) {
        const qs = findArrays(src, qk, false);
        const as = findArrays(src, ak, raw);
        for (const q of qs) {
            const a = as.filter(x => x.start > q.start).sort((u, v) => u.start - v.start)[0];
            if (!a || !q.values.length) continue;
            recs.push({ family: ak, qText: q.values, answers: a.values, aSpan: a });
        }
    }
    return recs;
}

let totalFixed = 0;
for (const [demoRel, courseRel] of PAIRS) {
    const demoFile = path.join(ROOT, demoRel), courseFile = path.join(ROOT, courseRel);
    if (!fs.existsSync(demoFile) || !fs.existsSync(courseFile)) continue;
    const demoSrc = fs.readFileSync(demoFile, 'utf8');
    let courseSrc = fs.readFileSync(courseFile, 'utf8');
    const demoRecs = records(demoSrc);

    function matchDemo(c) {
        let best = null, bestScore = 0;
        for (const d of demoRecs) {
            if (d.family !== c.family || d.qText.length !== c.qText.length) continue;
            let same = 0; for (let i = 0; i < d.qText.length; i++) if (d.qText[i] === c.qText[i]) same++;
            const s = same / d.qText.length;
            if (s > bestScore) { bestScore = s; best = d; }
        }
        return bestScore >= 0.7 ? best : null;
    }

    // Re-extract course records every pass (offsets shift after edits) — so we
    // collect all needed edits first, then apply from the END of the file back.
    const edits = [];
    for (const c of records(courseSrc)) {
        const d = matchDemo(c);
        if (!d) continue;
        if (d.answers.join('') === c.answers.join('')) continue;
        if (d.answers.length === 0) continue;
        const newBody = demoSrc.slice(d.aSpan.bodyStart, d.aSpan.bodyEnd);
        edits.push({ family: c.family, from: c.aSpan.bodyStart, to: c.aSpan.bodyEnd, newBody,
                     oldCount: c.answers.length, newCount: d.answers.length,
                     preview: c.qText[0].slice(0, 60) });
    }
    edits.sort((a, b) => b.from - a.from); // apply back-to-front

    if (edits.length) {
        console.log(`\n${courseRel}: ${edits.length} answer key(s) to restore`);
        for (const e of edits) {
            console.log(`  - [${e.family}] ${e.oldCount} -> ${e.newCount} items  (q: "${e.preview}…")`);
            courseSrc = courseSrc.slice(0, e.from) + e.newBody + courseSrc.slice(e.to);
        }
        totalFixed += edits.length;
        if (APPLY) { fs.writeFileSync(courseFile, courseSrc); console.log('    ✔ written'); }
    } else {
        console.log(`\n${courseRel}: clean`);
    }
}
console.log(`\n${APPLY ? 'APPLIED' : 'DRY-RUN'} — ${totalFixed} answer key(s) ${APPLY ? 'restored' : 'would be restored'}`);
if (!APPLY) console.log('Run with --apply to write changes.');
