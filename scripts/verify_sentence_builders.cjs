#!/usr/bin/env node
/**
 * verify_sentence_builders.cjs — no word may ever appear twice in a "Gap tuzing"
 * exercise, neither in the data nor on the screen.
 *
 * THE BUG THIS EXISTS TO CATCH
 * ----------------------------
 * Learners reported duplicated words: "аптека / слева / от / банка" showing
 * "банка" twice. The DATA was clean. What duplicated was the rendering: a word
 * placed into the sentence stayed in the word bank, merely recoloured
 * (.used only changed border/background), so it was on screen twice — once as
 * a token in the answer, once as a chip in the bank.
 *
 * So this suite asserts BOTH halves:
 *   1. every builder item carries unique words (data)
 *   2. after a word is picked it appears exactly once on screen (render)
 *
 * Assertion 1 alone passed while the bug was live. Assertion 2 is the one that
 * fails without the fix — do not weaken it into a data-only check.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };

const PAGES = ['paid-courses/a1-course.html', 'paid-courses/a2-course.html',
               'paid-courses/b1-course.html', 'a1-demo.html', 'a2-demo.html', 'b1-demo.html'];

console.log('\n=== SENTENCE BUILDERS ===');

let exercises = 0, items = 0;

/* ------------------------------------------------------------ 1. the data */
for (const rel of PAGES) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    const start = html.search(/(?:const|let|var)\s+courseData\s*=\s*\{/);
    if (start === -1) continue;
    let d = 0, i = html.indexOf('{', start), end = -1;
    for (let k = i; k < html.length; k++) {
        if (html[k] === '{') d++;
        else if (html[k] === '}') { d--; if (d === 0) { end = k; break; } }
    }
    let data;
    try { data = vm.runInNewContext('(' + html.slice(i, end + 1) + ')', {}); } catch (e) { continue; }

    (data.topics || []).forEach((topic) => {
        Object.keys(topic).forEach((blockKey) => {
            if (!/Exercises?$/.test(blockKey)) return;
            const block = topic[blockKey];
            if (!block || typeof block !== 'object') return;
            Object.keys(block).forEach((exKey) => {
                const ex = block[exKey];
                if (!ex || typeof ex !== 'object' || !Array.isArray(ex.items)) return;
                const builder = ex.items.length && ex.items[0] && Array.isArray(ex.items[0].words);
                if (!builder) return;
                exercises++;
                ex.items.forEach((item, n) => {
                    items++;
                    const words = item.words || [];
                    const where = `${rel} ${topic.id}/${exKey}#${n + 1}`;
                    const seen = {};
                    words.forEach(w => { seen[w] = (seen[w] || 0) + 1; });
                    const repeated = Object.keys(seen).filter(w => seen[w] > 1);
                    ok(repeated.length === 0,
                        `${where}: no word appears twice (${repeated.join(', ')})`);
                    ok(words.length > 0, `${where}: the word bank is not empty`);
                    ok(words.every(w => typeof w === 'string' && w.trim() !== ''),
                        `${where}: every word is a non-empty string`);
                    /* the accepted sentence must be buildable from exactly these words */
                    const accepted = item.answers || (item.answer ? [item.answer] : []);
                    ok(accepted.length > 0, `${where}: at least one accepted answer`);
                    accepted.forEach((sentence) => {
                        const need = String(sentence).replace(/[.,!?]/g, '').trim().split(/\s+/);
                        const bank = words.slice();
                        const missing = need.filter((word) => {
                            const at = bank.findIndex(b => b.toLowerCase() === word.toLowerCase());
                            if (at === -1) return true;
                            bank.splice(at, 1);
                            return false;
                        });
                        ok(missing.length === 0,
                            `${where}: "${sentence}" is buildable from the bank (missing: ${missing.join(', ')})`);
                        ok(bank.length === 0,
                            `${where}: "${sentence}" uses every word, none left over (${bank.join(', ')})`);
                    });
                });
            });
        });
    });
}
console.log(`  builder exercises: ${exercises} | items: ${items}`);

/* ------------------------------------------------- 2. the render (A1 topic 6) */
{
    const html = fs.readFileSync(path.join(ROOT, 'paid-courses/a1-course.html'), 'utf8');

    /* a used word must be REMOVED from the bank, not merely recoloured */
    const rule = html.match(/\.topic6-word-chip\.used\s*\{[^}]*\}/);
    ok(!!rule, 'the used-word rule exists');
    ok(!!rule && /display:\s*none/.test(rule[0]),
        'a word placed into the sentence leaves the bank (display:none)');
    ok(!!rule && !/border-color|background:\s*var/.test(rule[0]),
        'the used word is not merely recoloured — that is what duplicated it on screen');

    function fn(name) {
        const i = html.indexOf('function ' + name + '(');
        let p = 0, b = -1;
        for (let k = html.indexOf('(', i); k < html.length; k++) {
            if (html[k] === '(') p++;
            else if (html[k] === ')') { p--; if (p === 0) { b = html.indexOf('{', k); break; } }
        }
        let d = 0;
        for (let k = b; k < html.length; k++) {
            if (html[k] === '{') d++;
            else if (html[k] === '}') { d--; if (d === 0) return html.slice(i, k + 1); }
        }
    }
    const cd = html.indexOf('const courseData');
    let d = 0, st = html.indexOf('{', cd), e = -1;
    for (let k = st; k < html.length; k++) {
        if (html[k] === '{') d++;
        else if (html[k] === '}') { d--; if (d === 0) { e = k; break; } }
    }
    const t6 = vm.runInNewContext('(' + html.slice(st, e + 1) + ')', {}).topics.find(t => t.id === 6);
    const w = new JSDOM('<!doctype html><body><div id="quizSection"></div>' +
        '<div id="checkTopic6Btn"></div><div id="topic6Feedback"></div></body>',
        { runScripts: 'outside-only' }).window;
    w.eval(`var courseData={topics:[${JSON.stringify(t6)}]};var currentTopicId=6;
        var quizSection=document.getElementById('quizSection');var userQuizResults={};
        var completedTopics=[];var currentUserId=null;var topic6BuilderState={};
        function clearExtraExercises(){}
        ${fn('normalizeTopic6Text')} ${fn('topic6IsCorrect')} ${fn('getTopic6BuilderSelection')}
        ${fn('setTopic6BuilderSelection')} ${fn('renderTopic6BuilderSelection')}
        ${fn('bindTopic6CheckButton')} ${fn('bindTopic6ExerciseEvents')} ${fn('loadTopic6Exercises')}
        async function saveQuizResultToFirebase(){}`);
    w.loadTopic6Exercises(6);
    w.bindTopic6ExerciseEvents();

    const ex5 = t6.topic6Exercises.exercise5;
    /* a chip is on screen only when neither it nor an ancestor is display:none.
       jsdom has no layout, so read the stylesheet rule we just asserted. */
    const visibleWords = (i) => {
        const bank = [...w.document.querySelectorAll(`[data-topic6-builder-word="${i}"]`)]
            .filter(c => !c.classList.contains('used'))
            .map(c => c.dataset.value);
        const tokens = [...w.document.querySelectorAll(`[data-topic6-builder-remove="${i}"]`)]
            .map(t => t.textContent.trim());
        return bank.concat(tokens);
    };

    ex5.items.forEach((item, i) => {
        const before = visibleWords(i);
        ok(new Set(before).size === before.length,
            `render #${i + 1}: no duplicate word before answering (${before.join(', ')})`);

        /* build the whole sentence, checking after every single pick */
        item.words.forEach((word) => {
            const chip = [...w.document.querySelectorAll(`[data-topic6-builder-word="${i}"]`)]
                .find(c => c.dataset.value === word && !c.classList.contains('used'));
            if (chip) chip.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
            const shown = visibleWords(i);
            ok(new Set(shown).size === shown.length,
                `render #${i + 1}: no duplicate after picking "${word}" (${shown.join(', ')})`);
        });

        const after = visibleWords(i);
        ok(after.length === item.words.length,
            `render #${i + 1}: every word is on screen exactly once when complete`);
    });
}

console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ SENTENCE BUILDERS: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 20).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ SENTENCE BUILDERS: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
