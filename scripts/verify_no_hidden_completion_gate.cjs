/* ============================================================================
   GUARD: no paid course may re-fail completion after a passing score
   ----------------------------------------------------------------------------
   The B1 Topic-11 bug was caused by a SECOND completion gate that ANDed a
   hidden, non-graded condition (matching game / 100%-exact) on top of the
   shared scorer, flipping a passing #completeBtn back to "Mavzu tugatilmadi".
   This guard fails if any paid course re-introduces that anti-pattern, i.e. an
   `allCorrect`/`matchingOk`-style variable that gates a completeBtn "failed"
   flip. Completion must be driven by ONE flow: the per-topic score threshold.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const FILES = ['a1-course.html', 'a2-course.html', 'b1-course.html', 'b2-course.html'];
const BANNED = [
    /\bmatchingOk\b/,                       // separate matching-game requirement
    /\ballCorrect\s*=\s*\(currentScore/,    // "all exercises exact" override gate
    /currentScore\s*>=\s*total\)\s*&&\s*matchingOk/,
];

let fail = 0;
FILES.forEach(function (name) {
    const p = path.join(__dirname, '..', 'paid-courses', name);
    const src = fs.readFileSync(p, 'utf8');
    let hit = null;
    for (const re of BANNED) { if (re.test(src)) { hit = re; break; } }
    if (hit) { fail++; console.log('  ✗ ' + name + ' contains hidden completion gate: ' + hit); }
    else { console.log('  ✓ ' + name + ' — no hidden completion gate'); }
});

console.log('\n=== GUARD: ' + (fail ? fail + ' FILE(S) FAILED' : 'all paid courses clean') + ' ===');
process.exitCode = fail ? 1 : 0;
