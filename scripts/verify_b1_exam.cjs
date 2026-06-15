const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'paid-courses', 'b1-final-exam.html'), 'utf8');
const data = JSON.parse(html.match(/var FINAL_EXAM_DATA = (\[.*?\]);/s)[1]);

// Replicate the exam's normalization/validation EXACTLY (matches B1 t1Norm/t1Match).
function norm(v) {
    return String(v == null ? '' : v)
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[.,!?;:()"'«»—–\-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function ok(u, e) {
    const nu = norm(u);
    if (!nu) return false;
    if (Array.isArray(e)) return e.some(x => norm(x) === nu);
    return norm(e) === nu;
}

let total = 0, perfect = 0, emptyPass = 0, chipBad = 0, ambiguous = 0, wrongPass = 0;
data.forEach(s => s.items.forEach(it => {
    total++;
    const exp = it.answer;
    const goodAns = Array.isArray(exp) ? exp[0] : exp;
    if (ok(goodAns, exp)) perfect++;
    if (ok('', exp)) emptyPass++;
    // a clearly-wrong free-text answer must not pass
    if (it.mode !== 'chip' && ok('zzz qqq xxx', exp)) wrongPass++;
    if (it.mode === 'chip') {
        const sel = (it.opts || []).filter(o => ok(o, exp));
        if (sel.length === 0) chipBad++;
        if (sel.length > 1) ambiguous++;
    }
}));

const passScore = Math.round(perfect / total * 100);
console.log('Total questions:            ', total, '(expect 100)');
console.log('Perfect-key correct:        ', perfect, '(expect 100)');
console.log('Empty-submission passes:    ', emptyPass, '(expect 0)');
console.log('Wrong free-text passes:     ', wrongPass, '(expect 0)');
console.log('Chip answer not in options: ', chipBad, '(expect 0)');
console.log('Chip ambiguous matches:     ', ambiguous, '(expect 0)');
console.log('Perfect-key score:          ', passScore + '%  pass(>=80%):', passScore >= 80);

const fail = total !== 100 || perfect !== 100 || emptyPass !== 0 || wrongPass !== 0 || chipBad !== 0 || ambiguous !== 0;
console.log(fail ? '\nRESULT: FAIL' : '\nRESULT: PASS');
process.exit(fail ? 1 : 0);
