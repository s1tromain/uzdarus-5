#!/usr/bin/env node
/**
 * verify_sentence_builders.cjs — the A1 sentence builders are gone and must
 * stay gone; the B2 one is a different thing and must stay.
 *
 * WHY THE A1 BUILDERS WERE REMOVED
 * -------------------------------
 * Topic 6 exercise 5, topic 10 exercise 8 and topic 12 exercise 6 asked the
 * learner to assemble a Russian sentence from word cards, then compared the
 * result against a short list of accepted orders:
 *
 *     words:   ['находится', 'аптека', 'справа']
 *     answers: ['аптека находится справа']
 *
 * Russian word order is free. "Справа находится аптека" is equally correct and
 * was marked wrong. Enumerating the permutations is not a fix — a 5-word
 * sentence has 120 of them and only a handful are natural, so the exercise was
 * asking for the one thing the language does not have: a single right order.
 *
 * Two earlier rounds of repair (removing duplicate cards from the bank, then
 * shuffling the bank so it was not already the answer) fixed real defects and
 * the learner still reported the exercise as broken, because the defect that
 * mattered was in the mechanic, not the rendering. All three were replaced with
 * multiple choice on the same t6q- machinery that exercise 2 already used.
 *
 * WHY B2 KEEPS ITS BUILDER
 * -----------------------
 * B2 lesson 1 exercise 2 is a different exercise built on different code
 * (sentence-builder.js, driven by the exercise-session engine). It asks the
 * learner to JOIN two sentences with a conjunction, every item lists all
 * accepted forms, and its card bank is the multiset union of those forms — so
 * any correct answer can be built and is accepted. The A1 defect cannot occur
 * there, and B2 is frozen. This suite pins that distinction so a future cleanup
 * does not "finish the job" by deleting a component that is working.
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

console.log('\n=== SENTENCE BUILDERS ===');

const A1 = fs.readFileSync(path.join(ROOT, 'paid-courses/a1-course.html'), 'utf8');

function courseData(html) {
    const start = html.search(/(?:const|let|var)\s+courseData\s*=\s*\{/);
    let d = 0, i = html.indexOf('{', start), end = -1;
    for (let k = i; k < html.length; k++) {
        if (html[k] === '{') d++;
        else if (html[k] === '}') { d--; if (d === 0) { end = k; break; } }
    }
    return vm.runInNewContext('(' + html.slice(i, end + 1) + ')', {});
}

function lift(html, name) {
    const i = html.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('missing ' + name);
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
    throw new Error('unbalanced ' + name);
}

/* ------------------------------------------- 1. no builder data survives A1 */
{
    const data = courseData(A1);
    let builderItems = 0;
    (data.topics || []).forEach((topic) => {
        Object.keys(topic).forEach((blockKey) => {
            if (!/Exercises?$/.test(blockKey)) return;
            const block = topic[blockKey];
            if (!block || typeof block !== 'object') return;
            Object.keys(block).forEach((exKey) => {
                const ex = block[exKey];
                if (!ex || !Array.isArray(ex.items)) return;
                ex.items.forEach((item) => {
                    if (Array.isArray(item.words)) {
                        builderItems++;
                        failures.push(`${topic.id}/${exKey}: builder item still carries words[]`);
                        fail++;
                    }
                });
            });
        });
    });
    ok(builderItems === 0, `no A1 exercise carries builder data (${builderItems} found)`);

    /* the three replacements are real, complete multiple-choice exercises */
    const REPLACED = [
        [6, 'topic6Exercises', 'exercise5'],
        [10, 'topic10Exercises', 'exercise8'],
        [12, 'topic12Exercises', 'exercise6']
    ];
    REPLACED.forEach(([id, blockKey, exKey]) => {
        const ex = ((data.topics.find(t => t.id === id) || {})[blockKey] || {})[exKey];
        const where = `topic ${id} ${exKey}`;
        ok(!!ex, `${where}: still exists`);
        if (!ex) return;
        ok(!ex.items, `${where}: no leftover builder items`);
        ok(Array.isArray(ex.questions) && ex.questions.length === 10,
            `${where}: ten multiple-choice questions`);
        (ex.questions || []).forEach((q, i) => {
            const at = `${where}#${i + 1}`;
            ok(typeof q.question === 'string' && q.question.includes('___'),
                `${at}: the sentence has a gap to fill`);
            ok(Array.isArray(q.options) && q.options.length === 3,
                `${at}: exactly three options`);
            ok(new Set(q.options).size === (q.options || []).length,
                `${at}: no duplicate options`);
            ok((q.options || []).indexOf(q.answer) !== -1,
                `${at}: the answer is one of the options`);
            ok((q.options || []).every(o => typeof o === 'string' && o.trim() !== ''),
                `${at}: every option is a non-empty string`);
        });
        /* an exercise whose answer is always in the same slot teaches the slot */
        const slots = new Set((ex.questions || []).map(q => q.options.indexOf(q.answer)));
        ok(slots.size >= 2, `${where}: the correct answer is not always in the same position`);
    });
}

/* ------------------------------------ 2. no builder code or markup survives */
{
    const GONE = [
        ['data-topic6-builder', 'topic 6 builder markup'],
        ['data-topic7-builder', 'topic 7 builder markup'],
        ['data-topic10-builder', 'topic 10 builder markup'],
        ['data-topic12-builder', 'topic 12 builder markup'],
        ['topic6-word-chip', 'the word-card class'],
        ['topic6-builder-bank', 'the word-bank class'],
        ['topic6-builder-token', 'the placed-word class'],
        ['BuilderSelection', 'the builder selection helpers'],
        ['topic6BuilderBankOrder', 'the bank-shuffling helper']
    ];
    GONE.forEach(([needle, what]) => {
        const n = A1.split(needle).length - 1;
        ok(n === 0, `${what} is gone from a1-course.html (${n} occurrence(s))`);
    });

    /* One MCQ implementation, not four copies of one. Count CALL SITES, not
       every mention — the source also names these functions in comments. */
    ok((A1.match(/function renderChoiceQuestion\(/g) || []).length === 1,
        'renderChoiceQuestion() is defined exactly once');
    ok((A1.match(/function gradeChoiceQuestion\(/g) || []).length === 1,
        'gradeChoiceQuestion() is defined exactly once');
    const renders = (A1.match(/html \+= renderChoiceQuestion\(/g) || []).length;
    const grades = (A1.match(/= gradeChoiceQuestion\(/g) || []).length;
    ok(renders === 4, `all four MCQ exercises render through it (got ${renders})`);
    ok(grades === 4, `all four MCQ exercises grade through it (got ${grades})`);
}

/* --------------------- 3. the replacements render, and do not collide */
{
    const data = courseData(A1);
    const CASES = [
        [6, 'topic6Exercises', 'exercise5', 'e5'],
        [10, 'topic10Exercises', 'exercise8', 'e8'],
        [12, 'topic12Exercises', 'exercise6', 'e6']
    ];

    CASES.forEach(([id, blockKey, exKey, prefix]) => {
        const topic = data.topics.find(t => t.id === id);
        const w = new JSDOM('<!doctype html><body><div id="quizSection"></div></body>',
            { runScripts: 'outside-only' }).window;
        const names = ['normalizeTopic6Text', 'topic6IsCorrect', 'renderChoiceQuestion',
            'gradeChoiceQuestion', 'bindChoiceQuestions', 'bindTopic6ExerciseEvents',
            `normalizeTopic${id}Text`, `topic${id}IsCorrect`, `bindTopic${id}ChoiceEvents`,
            `bindTopic${id}CheckButton`, `loadTopic${id}Exercises`];
        const src = names.map(n => { try { return lift(A1, n); } catch (e) { return ''; } })
            .filter(Boolean).join('\n');
        w.eval(`var courseData={topics:[${JSON.stringify(topic)}]};
            var currentTopicId=${id};
            var quizSection=document.getElementById('quizSection');
            var userQuizResults={}; var completedTopics=[]; var currentUserId=null;
            var topic5OutsideClickBound=false;
            function clearExtraExercises(){} function saveProgress(){}
            function renderMatchingGameA1(){} function initMatchingGameA1(){}
            async function saveQuizResultToFirebase(){}
            window.__uzFinalizeExerciseTopic=function(){};
            ${src}`);

        let threw = '';
        try { w.eval(`loadTopic${id}Exercises(${id});`); } catch (e) { threw = e.message; }
        ok(!threw, `topic ${id}: the exercises render (${threw})`);
        if (threw) return;

        const D = w.document;
        const ex = topic[blockKey][exKey];
        ex.questions.forEach((q, i) => {
            const buttons = D.querySelectorAll(`[data-t6q-option="${prefix}-${i}"]`);
            ok(buttons.length === 3, `topic ${id} #${i + 1}: three option buttons render`);
            const values = [...buttons].map(b => b.dataset.value);
            ok(values.join('|') === q.options.join('|'),
                `topic ${id} #${i + 1}: the buttons carry the authored options`);
        });

        /* no builder DOM anywhere on the page any more */
        ok(D.querySelectorAll('[data-topic6-builder-word],[data-topic10-builder-word],' +
            '[data-topic12-builder-word],.topic6-word-chip').length === 0,
            `topic ${id}: no word-bank markup is rendered`);

        /* clicking one exercise must not select in another */
        const first = D.querySelector(`[data-t6q-option="${prefix}-0"]`);
        first.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        const selected = [...D.querySelectorAll('.t6q-option.is-selected')];
        ok(selected.length === 1,
            `topic ${id}: one click selects exactly one option page-wide (${selected.length})`);
        ok(selected[0] === first, `topic ${id}: the selection landed on the clicked button`);
    });
}

/* ------------------------- 3b. saved answers survive, old drafts do not crash */
{
    const data = courseData(A1);
    const CASES = [
        [6, 'topic6Exercises', 'exercise5', 'e5'],
        [10, 'topic10Exercises', 'exercise8', 'e8'],
        [12, 'topic12Exercises', 'exercise6', 'e6']
    ];

    function boot(id, saved) {
        const topic = data.topics.find(t => t.id === id);
        const w = new JSDOM('<!doctype html><body><div id="quizSection"></div></body>',
            { runScripts: 'outside-only' }).window;
        const names = ['normalizeTopic6Text', 'topic6IsCorrect', 'renderChoiceQuestion',
            'gradeChoiceQuestion', 'bindChoiceQuestions', 'bindTopic6ExerciseEvents',
            `normalizeTopic${id}Text`, `topic${id}IsCorrect`, `bindTopic${id}ChoiceEvents`,
            `bindTopic${id}CheckButton`, `loadTopic${id}Exercises`];
        const src = names.map(n => { try { return lift(A1, n); } catch (e) { return ''; } })
            .filter(Boolean).join('\n');
        w.eval(`var courseData={topics:[${JSON.stringify(topic)}]};
            var currentTopicId=${id};
            var quizSection=document.getElementById('quizSection');
            var userQuizResults=${JSON.stringify(saved)};
            var completedTopics=[]; var currentUserId=null; var topic5OutsideClickBound=false;
            function clearExtraExercises(){} function saveProgress(){}
            function renderMatchingGameA1(){} function initMatchingGameA1(){}
            async function saveQuizResultToFirebase(){}
            window.__uzFinalizeExerciseTopic=function(){};
            ${src}`);
        w.eval(`loadTopic${id}Exercises(${id});`);
        return w;
    }

    CASES.forEach(([id, blockKey, exKey, prefix]) => {
        const ex = data.topics.find(t => t.id === id)[blockKey][exKey];
        const answers = ex.questions.map(q => q.answer);

        /* a saved attempt comes back selected */
        const w = boot(id, { [`topic_${id}_practice`]: { [exKey + 'Answers']: answers } });
        const restored = [...w.document.querySelectorAll(
            `[data-t6q-option^="${prefix}-"].is-selected`)].map(b => b.dataset.value);
        ok(restored.length === 10 && restored.every((v, i) => v === answers[i]),
            `topic ${id}: a saved attempt is restored (${restored.length}/10)`);

        /* a draft written by the OLD builder is word arrays, not strings. It
           must be ignored, not coerced and not thrown on — a learner who left a
           half-finished builder answer behind still gets a working exercise. */
        let threw = '';
        let stale = null;
        try {
            stale = boot(id, {
                [`topic_${id}_practice`]: {
                    [exKey + 'Answers']: Array.from({ length: 10 }, (_, i) => ['so\'z' + i, 'yana' + i])
                }
            });
        } catch (e) { threw = e.message; }
        ok(!threw, `topic ${id}: an old builder draft does not break the render (${threw})`);
        if (stale) {
            ok(stale.document.querySelectorAll(`[data-t6q^="${prefix}-"]`).length === 10,
                `topic ${id}: all ten questions still render over a stale draft`);
            ok(stale.document.querySelectorAll(
                `[data-t6q-option^="${prefix}-"].is-selected`).length === 0,
                `topic ${id}: a stale builder draft selects nothing`);
        }
    });
}

/* ---------------------------------- 4. B2 keeps its builder, and its safety net */
{
    const component = path.join(ROOT, 'sentence-builder.js');
    ok(fs.existsSync(component), 'sentence-builder.js still exists (B2 uses it)');
    const B2 = fs.readFileSync(path.join(ROOT, 'b2-lesson-data.js'), 'utf8');
    ok(/type:\s*'builder'/.test(B2), 'the B2 builder exercise is still declared');

    /* The property that makes the B2 builder immune to the defect that killed
       the A1 ones: every item enumerates the accepted forms, and the card bank
       is built from all of them. An item with a single accepted answer would be
       the A1 bug reappearing in B2. */
    const src = fs.readFileSync(component, 'utf8');
    ok(/multiset union/i.test(src),
        'the card bank is documented as the union of every accepted answer');
    const ex2 = B2.slice(B2.indexOf("id: 'ex2', type: 'builder'"));
    const answers = ex2.slice(0, ex2.indexOf('\n        }')).match(/answer:\s*\[/g) || [];
    ok(answers.length >= 8, `every B2 builder item lists its accepted forms (${answers.length})`);
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
