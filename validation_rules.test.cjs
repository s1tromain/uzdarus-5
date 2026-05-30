/* ============================================================================
   VALIDATION RULES TEST  (no dependencies — runs anywhere with node)
   ----------------------------------------------------------------------------
   Extracts the REAL normalize() / isCorrect() / isEmpty() function bodies out
   of the shipped course-global-fixes.js and executes them against the spec's
   exact cases. This proves the correctness rules that power:
     - Translation validation (Phase 3)
     - Sentence-builder word-set + order (Phase 4, via exact normalized match)
     - Fill-in input normalization (Phase 8)
     - The completeness gate's "empty" detection (Phase 2)
   Run:  node validation_rules.test.cjs
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'course-global-fixes.js'), 'utf8');

/* Pull a top-level `function name(...) { ... }` out of the source by brace
   matching (these functions contain no braces inside strings/regex). */
function extractFn(name) {
    const sig = 'function ' + name + '(';
    const start = src.indexOf(sig);
    if (start < 0) throw new Error('not found: ' + name);
    let i = src.indexOf('{', start), depth = 0, j = i;
    for (; j < src.length; j++) {
        const c = src[j];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
    }
    return src.slice(start, j);
}

/* eval the real bodies as expressions (direct eval -> closes over this scope,
   so isCorrect can see normalize even under 'use strict'). */
const normalize = eval('(' + extractFn('normalize') + ')');
const isCorrect = eval('(' + extractFn('isCorrect') + ')');
const isEmpty   = eval('(' + extractFn('isEmpty')   + ')');

let passed = 0, failed = 0; const failures = [];
function ok(name, cond, extra) {
    if (cond) { passed++; console.log('   ✓ ' + name); }
    else { failed++; failures.push(name + (extra ? ' (' + extra + ')' : '')); console.log('   ✗ ' + name + (extra ? ' (' + extra + ')' : '')); }
}

console.log('\n=== VALIDATION RULES (real functions from course-global-fixes.js) ===\n');

console.log('[Translation / input normalization]');
const T = 'Я читаю новости.'; // "Я читаю новости."
ok('exact match accepted', isCorrect(T, T));
ok('lowercase accepted', isCorrect('я читаю новости', T));      // я читаю новости
ok('missing period accepted', isCorrect('Я читаю новости', T));
ok('leading/trailing/duplicate spaces accepted', isCorrect('  я   читаю   новости  ', T));
ok('ё vs е normalized', isCorrect('всё', 'все'));                                   // всё == все
ok('WRONG WORD ORDER rejected', !isCorrect('новости читаю я', T));  // новости читаю я
ok('WRONG VOCABULARY rejected', !isCorrect('я смотрю новости', T)); // я смотрю новости
ok('EMPTY answer rejected', !isCorrect('', T));
ok('multiple accepted answers (array)', isCorrect('privet', ['salom', 'privet']));

console.log('\n[Sentence builder — words joined by space, exact normalized match]');
const ANS = 'Я читаю новости'; // "Я читаю новости"
const join = words => words.join(' ');
ok('all words, correct order -> correct', isCorrect(join(['Я', 'читаю', 'новости']), ANS));
ok('wrong order -> incorrect', !isCorrect(join(['новости', 'читаю', 'Я']), ANS));
ok('missing word -> incorrect', !isCorrect(join(['Я', 'читаю']), ANS));
ok('duplicate word -> incorrect', !isCorrect(join(['Я', 'читаю', 'читаю']), ANS));
ok('extra word -> incorrect', !isCorrect(join(['Я', 'читаю', 'новости', 'сегодня']), ANS));

console.log('\n[Completeness gate — isEmpty()]');
ok('empty string is empty', isEmpty(''));
ok('whitespace is empty', isEmpty('   '));
ok('null is empty', isEmpty(null));
ok('"(tanlanmagan)" is empty', isEmpty('(tanlanmagan)'));
ok('"(kiritilmagan)" is empty', isEmpty('(kiritilmagan)'));
ok('"(yig‘ilmagan)" is empty', isEmpty("(yig'ilmagan)"));
ok('real answer is NOT empty', !isEmpty('новости'));

console.log('\n=== RESULT: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) { console.log('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1); }
process.exit(0);
