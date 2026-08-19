#!/usr/bin/env node
/**
 * verify_a2_topics_1_10_release.cjs — the A2 release gate.
 *
 * Every A2 lesson already has its own suite. This one asks the questions that
 * no per-topic suite can: the ones ABOUT THE SET.
 *
 *   - the authorship frontier is exactly 1-10 authored / 11-16 placeholder;
 *   - A2_VOCAB_COUNTS agrees with the decks actually shipped;
 *   - every authored lesson plays its own recording, and the file exists;
 *   - every scored question is gradable UNDER THE ENGINE'S OWN CONTRACT —
 *     `answer` may be a string or a list of accepted values, and an empty key
 *     marks a deliberate open prompt. A key that is not among the options is
 *     the failure that matters: the learner cannot pick it at all;
 *   - nothing was copy-pasted between lessons — the same grammar block, the
 *     same recording or the same exercise appearing twice is a bug no
 *     single-topic suite can see.
 *
 * It deliberately does NOT re-check what the per-topic suites own (live DOM,
 * perfect runs, completion, viewport). Those stay where they are.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

function mainScript(html) {
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
    let m, best = '';
    while ((m = re.exec(html))) {
        if (/\bsrc=/.test(m[1])) continue;
        if (m[2].length > best.length) best = m[2];
    }
    return best;
}
function literal(src, name) {
    const i = src.search(new RegExp('(?:const|let|var)\\s+' + name + '\\s*=\\s*[\\[{]'));
    let j = i;
    while (src[j] !== '[' && src[j] !== '{') j++;
    const open = src[j], close = open === '[' ? ']' : '}';
    let d = 0;
    for (let k = j; k < src.length; k++) {
        if (src[k] === open) d++;
        else if (src[k] === close) {
            d--;
            if (d === 0) return vm.runInNewContext('(' + src.slice(j, k + 1) + ')',
                { generateLockedTopics: () => [], icons: {}, lockedTopicNames: [] });
        }
    }
    throw new Error('unbalanced ' + name);
}

const SRC = fs.readFileSync(path.join(ROOT, 'paid-courses/a2-course.html'), 'utf8');
const MS = mainScript(SRC);
const courseData = literal(MS, 'courseData');
const VS = mainScript(fs.readFileSync(path.join(ROOT, 'paid-courses/a2-vocabulary.html'), 'utf8'));
const vocabData = literal(VS, 'vocabularyData');

/* The engine's own lookup and the scorer's own normaliser, reproduced. */
const exData = (t) => {
    if (!t) return null;
    for (let n = 1; n <= 20; n++) {
        const d = t['topic' + n + 'Exercises'];
        if (d && Array.isArray(d.exercises)) return d;
    }
    return null;
};
const norm = (v) => String(v == null ? '' : v).toLowerCase().replace(/ё/g, 'е')
    .replace(/[.,!?;:—–-]/g, ' ').replace(/\s+/g, ' ').trim();
/* course-exercise-ui.js: an absent or blank key marks an OPEN prompt, which is
   graded by word count, not by comparison. */
const isOpen = (it) => {
    if (it && it.free) return true;
    const a = it ? it.answer : null;
    if (a == null) return true;
    return Array.isArray(a)
        ? a.every((x) => String(x == null ? '' : x).trim() === '')
        : String(a).trim() === '';
};
const accepted = (it) => (Array.isArray(it.answer) ? it.answer : [it.answer])
    .filter((a) => String(a == null ? '' : a).trim() !== '');

const AUTHORED = 10;
const LAST = 16;

console.log('\n=== A2 RELEASE · TOPICS 1-10 ===');

/* ------------------------------------------------- 1. ids and frontier */
{
    const ids = courseData.topics.map((t) => t.id);
    eq('sixteen topics', ids.length, LAST);
    for (let id = 1; id <= LAST; id++) {
        eq(`exactly one topic id=${id}`, ids.filter((x) => x === id).length, 1);
    }
    for (let id = 1; id <= LAST; id++) {
        const t = courseData.topics.find((x) => x.id === id);
        const claimed = !!exData(t);
        if (id <= AUTHORED) {
            ok(claimed, `topic ${id} is authored, so the engine must claim it`);
            ok((t.grammar || '').length > 500, `topic ${id} has real grammar`);
            ok(!t.quiz, `topic ${id} no longer carries the legacy placeholder quiz`);
        } else {
            ok(!claimed, `topic ${id} is a placeholder — no exercise payload may leak in`);
            eq(`placeholder ${id} has no grammar`, (t.grammar || '').trim(), '');
        }
    }
    eq('the first unauthored topic is 11',
        courseData.topics.filter((t) => exData(t)).map((t) => t.id).sort((a, b) => a - b).pop() + 1, 11);
}

/* ------------------------------------------------- 2. vocabulary */
{
    const block = (MS.match(/A2_VOCAB_COUNTS = \{([^}]*)\}/) || [])[1];
    ok(!!block, 'A2_VOCAB_COUNTS exists');
    const declared = {};
    (block || '').split(',').forEach((p) => {
        const m = p.match(/(\d+)\s*:\s*(\d+)/);
        if (m) declared[+m[1]] = +m[2];
    });
    const EXPECTED = { 1: 45, 2: 77, 3: 73, 4: 106, 5: 50, 6: 69, 7: 85, 8: 85, 9: 50, 10: 69 };
    Object.keys(EXPECTED).forEach((id) => {
        eq(`A2_VOCAB_COUNTS[${id}]`, declared[id], EXPECTED[id]);
        const v = vocabData.topics.find((t) => t.id === +id);
        ok(!!v, `vocabulary topic ${id} exists`);
        const words = (v && v.words) || [];
        eq(`topic ${id} ships the advertised number of cards`, words.length, EXPECTED[id]);
        eq(`topic ${id} has no card with an empty side`,
            words.filter((c) => !c || !String(c.ru || '').trim() || !String(c.uz || '').trim()).length, 0);
        /* A duplicate is an EXACT pair. Two Russian words sharing one Uzbek
           gloss (рядом / около → yonida) is vocabulary, not a defect. */
        eq(`topic ${id} has no exact duplicate card`,
            new Set(words.map((c) => norm(c.ru) + '||' + norm(c.uz))).size, words.length);
    });
    /* Topic 10's source listed 70 rows with «рецепт — retsept» twice. */
    const v10 = vocabData.topics.find((t) => t.id === 10);
    eq('topic 10 keeps «рецепт» exactly once',
        v10.words.filter((w) => w.ru === 'рецепт').length, 1);
    for (let id = AUTHORED + 1; id <= LAST; id++) {
        const v = vocabData.topics.find((t) => t.id === id);
        eq(`placeholder ${id} ships no cards`, ((v && v.words) || []).length, 0);
    }
}

/* ------------------------------------------------- 3. audio */
{
    let withAudio = 0;
    for (let id = 1; id <= AUTHORED; id++) {
        const d = exData(courseData.topics.find((t) => t.id === id));
        if (!d) continue;
        const groups = d.exercises.filter((g) => g.audioSrc);
        eq(`topic ${id} has exactly one audio step`, groups.length, 1);
        if (groups.length !== 1) continue;
        withAudio++;
        const decoded = decodeURIComponent(groups[0].audioSrc);
        eq(`topic ${id} plays its own recording`, decoded, `audios/А2 ${id} урок.mp3`);
        ok(!/Б2/.test(decoded), `topic ${id} does not borrow a Б2 recording`);
        const file = path.join(ROOT, decoded);
        ok(fs.existsSync(file), `${decoded} exists on disk`);
        ok(fs.existsSync(file) && fs.statSync(file).size > 10000, `${decoded} is a real recording`);
    }
    eq('every authored topic has a recording', withAudio, AUTHORED);
    /* The player markup is shared, so one check covers every lesson. */
    const UI = fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8');
    ok(/<audio controls preload="metadata">/.test(UI),
        'the shared player has controls and preloads metadata only');
    ok(!/<audio[^>]*autoplay/.test(UI), 'and never autoplays');
}

/* ------------------------------------------------- 4. every scored question */
{
    let choiceQ = 0, inputQ = 0, builderQ = 0, openQ = 0, multi = 0;
    const bad = { unpickable: 0, noMatch: 0, collide: 0, emptyKey: 0, blankPrompt: 0, unkeyedChoice: 0 };
    for (let id = 1; id <= AUTHORED; id++) {
        const d = exData(courseData.topics.find((t) => t.id === id));
        if (!d) continue;
        d.exercises.forEach((g) => {
            (g.items || []).forEach((it) => {
                if (!it.q || !String(it.q).trim()) bad.blankPrompt++;
                if (isOpen(it)) {
                    openQ++;
                    /* An open prompt is graded by word count — a CHOICE with no
                       key cannot be graded at all. */
                    if (g.type === 'choice') bad.unkeyedChoice++;
                    return;
                }
                const acc = accepted(it).map(norm);
                if (acc.length > 1) multi++;
                if (g.type === 'choice') {
                    choiceQ++;
                    const opts = (it.options || []).map(norm);
                    if (opts.length < 2) { bad.emptyKey++; return; }
                    if (new Set(opts).size !== opts.length) bad.collide++;
                    /* THE failure that matters: a key the learner cannot pick. */
                    if (acc.some((a) => !opts.includes(a))) bad.unpickable++;
                    if (!opts.some((o) => acc.includes(o))) bad.noMatch++;
                } else if (g.type === 'input') {
                    inputQ++;
                    if (!acc.length) bad.emptyKey++;
                } else if (g.type === 'builder') {
                    builderQ++;
                    if (!acc.length) bad.emptyKey++;
                }
            });
        });
    }
    eq('no question has a blank prompt', bad.blankPrompt, 0);
    eq('no choice question is left without a key', bad.unkeyedChoice, 0);
    eq('every accepted answer is actually among the options', bad.unpickable, 0);
    eq('every choice question has at least one correct option', bad.noMatch, 0);
    eq('no two options collapse into each other under the normaliser', bad.collide, 0);
    eq('no scored question has an empty key', bad.emptyKey, 0);
    console.log(`  scored: ${choiceQ} choice · ${inputQ} input · ${builderQ} builder`
        + ` · ${openQ} open · ${multi} multi-accept`);
}

/* ------------------------------------------------- 5. builders assemble */
{
    const SBsrc = fs.readFileSync(path.join(ROOT, 'sentence-builder.js'), 'utf8');
    const box = {
        window: {},
        document: { createElement: () => ({ style: {}, appendChild() {}, setAttribute() {} }),
                    head: { appendChild() {} } },
        navigator: {}
    };
    box.global = box;
    vm.runInNewContext(SBsrc, box);
    const SB = box.window.UzSentenceBuilder;
    ok(!!SB, 'the shared sentence builder loads');
    let checked = 0, impossible = 0;
    if (SB && SB.bank && SB.split) {
        for (let id = 1; id <= AUTHORED; id++) {
            const d = exData(courseData.topics.find((t) => t.id === id));
            if (!d) continue;
            d.exercises.filter((g) => g.type === 'builder').forEach((g) => {
                (g.items || []).forEach((it) => {
                    const target = Array.isArray(it.answer) ? it.answer[0] : it.answer;
                    const need = SB.split(target, g.glue || []).map(norm).filter(Boolean).sort();
                    const have = SB.bank(it, g).map(norm).filter(Boolean).sort();
                    checked++;
                    if (JSON.stringify(need) !== JSON.stringify(have)) impossible++;
                });
            });
        }
    }
    ok(checked > 0, `builder targets were actually checked (${checked})`);
    eq('every builder target assembles from the cards the learner is given', impossible, 0);
}

/* ------------------------------------------------- 6. nothing copy-pasted */
{
    const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
    const grammar = {}, audio = {}, exercises = {}, titles = {};
    let dupGrammar = 0, dupAudio = 0, dupExercise = 0, dupTitle = 0;
    courseData.topics.forEach((t) => {
        if (titles[t.title]) dupTitle++; else titles[t.title] = t.id;
    });
    for (let id = 1; id <= AUTHORED; id++) {
        const t = courseData.topics.find((x) => x.id === id);
        const gk = md5(t.grammar || '');
        if (grammar[gk]) dupGrammar++; else grammar[gk] = id;
        const d = exData(t);
        if (!d) continue;
        d.exercises.forEach((g) => {
            if (g.audioSrc) {
                if (audio[g.audioSrc]) dupAudio++; else audio[g.audioSrc] = id;
            }
            if ((g.items || []).length) {
                const k = md5(JSON.stringify(g.items));
                if (exercises[k]) dupExercise++; else exercises[k] = `${id}/${g.id}`;
            }
        });
        /* group ids and step names must be unique inside a lesson, or the
           session cursor and the legacy bridge address two things by one key */
        const seenId = {}, seenStep = {};
        d.exercises.forEach((g) => {
            ok(!seenId[g.id], `topic ${id}: group id «${g.id}» is unique`);
            seenId[g.id] = 1;
            if (g.stepName) {
                ok(!seenStep[g.stepName], `topic ${id}: step name «${g.stepName}» is unique`);
                seenStep[g.stepName] = 1;
            }
        });
    }
    eq('no two lessons share a grammar block', dupGrammar, 0);
    eq('no two lessons share a recording', dupAudio, 0);
    eq('no exercise was copy-pasted between lessons', dupExercise, 0);
    eq('no two topics share a title', dupTitle, 0);
}

/* ------------------------------------------------- 7. one engine */
{
    eq('exactly one practice mount', (SRC.match(/A2Host\.mountPractice\(/g) || []).length, 1);
    for (let id = 1; id <= AUTHORED; id++) {
        ok(!new RegExp(`topic${id}(Wizard|Renderer|Checker|Navigation|Modal|Storage|AudioEngine)`, 'i').test(SRC),
            `topic ${id} has no bespoke engine of its own`);
    }
    ok(!/saveUserProgress\([^)]*completedTopics/.test(SRC),
        'no authored lesson writes completedTopics through the generic saver');
}

console.log('\n' + '='.repeat(60));
if (fail) {
    console.log(`  ❌ A2 RELEASE 1-10: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ A2 RELEASE 1-10: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
