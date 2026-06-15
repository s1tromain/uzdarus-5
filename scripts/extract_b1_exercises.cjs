/* One-off analysis helper: extract every topicNExercises block from
   b1-course.html into structured JSON so the final exam can be built
   from real course material. Read-only — does not modify the course. */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'paid-courses', 'b1-course.html'), 'utf8');

function matchBlock(text, startIdx) {
    // startIdx points at the '{' that opens the object literal.
    let depth = 0;
    let i = startIdx;
    let quote = null;      // current string delimiter or null
    let escaped = false;
    for (; i < text.length; i++) {
        const ch = text[i];
        if (quote) {
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (ch === quote) { quote = null; }
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return text.slice(startIdx, i + 1);
        }
    }
    throw new Error('Unbalanced block from ' + startIdx);
}

const out = {};
for (let n = 1; n <= 20; n++) {
    const key = 'topic' + n + 'Exercises';
    const re = new RegExp(key + '\\s*:\\s*\\{');
    const m = re.exec(src);
    if (!m) { out[n] = null; continue; }
    const braceIdx = src.indexOf('{', m.index + key.length);
    const block = matchBlock(src, braceIdx);
    // eslint-disable-next-line no-eval
    const obj = eval('(' + block + ')');
    out[n] = obj;
}

// Also pull topic titles
const titleRe = /id:\s*(\d+),\s*\n\s*title:\s*"([^"]+)"/g;
const titles = {};
let tm;
while ((tm = titleRe.exec(src)) !== null) {
    titles[tm[1]] = tm[2];
}

const result = { titles, exercises: out };
fs.writeFileSync(path.join(__dirname, 'b1_exercises_dump.json'), JSON.stringify(result, null, 1), 'utf8');

// Print a compact summary
for (let n = 1; n <= 20; n++) {
    const ex = out[n];
    if (!ex) { console.log(n, titles[n] || '?', '-> NONE'); continue; }
    const groups = (ex.exercises || []).map(g => `${g.id}[${g.type}/${g.style||'-'}:${(g.items||[]).length}]`);
    console.log(n + '. ' + (titles[n] || '?'));
    console.log('   ' + groups.join('  '));
}
