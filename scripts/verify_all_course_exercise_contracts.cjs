#!/usr/bin/env node
/**
 * verify_all_course_exercise_contracts.cjs — the exercise contracts that
 * verify_course_integrity.cjs does NOT already prove, across A1/A2/B1/B2.
 *
 * This is deliberately NOT a second copy of course integrity. That suite
 * already proves, for every item in every course: options are non-empty, no two
 * options collide for the learner or for the scorer, a choice key is among its
 * own options, a single key matches exactly one option, no item repeats another
 * inside its exercise, and a word bank with an explicit `words` array can be
 * permuted into its answer. Re-asserting any of that here would only make two
 * places to update.
 *
 * What it does not reach, and this does:
 *
 *   THE RENDERED WORD BANK. Course integrity checks `item.words`, but A2's
 *   builders do not carry one — their cards are DERIVED from the accepted
 *   answers by UzSentenceBuilder.bank(). Those 80 items therefore fell through
 *   its `if (!Array.isArray(it.words)) return`. Here every builder in the
 *   platform is asked the only question that matters to a learner: can the
 *   sentence be assembled from the cards actually on screen, with none left
 *   over and none missing? A builder that cannot is a release blocker.
 *
 *   THE OPEN/DETERMINISTIC SPLIT. An item flagged `free` must carry no key
 *   (or it is secretly graded), and an item with no key must be flagged `free`
 *   (or it is graded against nothing). Counted per course and per topic.
 *
 *   MULTI-ACCEPT AFTER NORMALISATION. Course integrity rejects byte-identical
 *   repeated variants; two variants that differ only in case or punctuation
 *   survive that and are still the same answer to the scorer.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

console.log('\n=== ALL-COURSE EXERCISE CONTRACTS ===');

function literal(src, name) {
    const i = src.search(new RegExp('(?:const|let|var)\\s+' + name + '\\s*=\\s*[\\[{]'));
    if (i < 0) return null;
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
    return null;
}

/* The real component, so the cards are the product's cards. */
const sandbox = { window: {}, document: { createElement: () => ({ style: {}, appendChild() {} }) } };
sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'sentence-builder.js'), 'utf8'), sandbox);
const SB = sandbox.window.UzSentenceBuilder;
ok(!!SB && typeof SB.bank === 'function', 'the shared sentence builder loads');

/* The real scorer. Openness is not re-implemented here — it is OBSERVED
   through the product's own matchItem(), which applies isOpenItem() before any
   comparison. A nonsense three-word answer is accepted by an open prompt (it
   clears OPEN_ANSWER_MIN_WORDS) and refused by every graded one, so it
   classifies items exactly the way the learner's session does. */
vm.runInContext(fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8'), sandbox);
const UI = sandbox.window.UzExerciseUI;
ok(!!UI && typeof UI.matchItem === 'function', 'the shared exercise scorer loads');
const NONSENSE = 'зззz яяяy ююю';
const isOpen = (item) => UI.matchItem(item, NONSENSE) === true;

/* The platform normaliser — the scorer's notion of "the same answer". */
const norm = (v) => String(v == null ? '' : v).toLowerCase().replace(/ё/g, 'е')
    .replace(/[.,!?;:()"'«»—–-]/g, ' ').replace(/\s+/g, ' ').trim();
const bag = (list) => list.map(norm).filter(Boolean).sort().join('|');

const PAGES = [
    ['A1', 'paid', 'paid-courses/a1-course.html'],
    ['A2', 'paid', 'paid-courses/a2-course.html'],
    ['B1', 'paid', 'paid-courses/b1-course.html'],
    ['B2', 'paid', 'paid-courses/b2-course.html'],
    ['A1', 'demo', 'a1-demo.html'],
    ['A2', 'demo', 'a2-demo.html'],
    ['B1', 'demo', 'b1-demo.html'],
    ['B2', 'demo', 'b2-demo.html']
];

/* B2 ships its lessons as a module that assigns a global inside an IIFE, so it
   is loaded rather than parsed out of a page. Same contracts, same scorer. */
function b2Topics() {
    const f = path.join(ROOT, 'b2-lesson-data.js');
    if (!fs.existsSync(f)) return null;
    const box = { window: {} };
    try { vm.runInNewContext(fs.readFileSync(f, 'utf8'), box); } catch (e) { return null; }
    const d = box.window.B2_LESSON_DATA;
    if (!d || !Array.isArray(d.topics)) return null;
    return {
        topics: d.topics.map((L) => {
            const t = { id: L.id };
            /* the loop below finds payloads by the topicNExercises name */
            t[`topic${L.id}Exercises`] = { exercises: L.exercises || [] };
            return t;
        })
    };
}

const TOTALS = {};
let items = 0, builders = 0, open = 0, deterministic = 0, multi = 0, audioSteps = 0;
let freeWithModel = 0, redundantVariant = 0;
const byType = {};

const SURFACES = PAGES.map(([course, form, rel]) => {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) return null;
    const data = literal(fs.readFileSync(file, 'utf8'), 'courseData');
    if (!data || !Array.isArray(data.topics)) return null;
    return [course, form, data];
}).filter(Boolean);
{
    const b2 = b2Topics();
    ok(!!b2, 'B2 lesson data loads from its module');
    if (b2) SURFACES.push(['B2', 'lessons', b2]);
}

SURFACES.forEach(([course, form, data]) => {
    const label = `${course}/${form}`;
    TOTALS[label] = TOTALS[label] || { topics: 0, items: 0, open: 0, multi: 0, builder: 0, audio: 0, hasPayloads: false };

    data.topics.forEach((t) => {
        const key = Object.keys(t).find((k) => /^topic\d+Exercises$/.test(k));
        if (!key || !t[key]) return;
        TOTALS[label].hasPayloads = true;

        /* TWO PAYLOAD SHAPES ARE IN PRODUCTION.
             generic : { exercises: [ { id, type, items:[{ q, options, answer }] } ] }
                       — A2 and B1
             legacy  : { exercise1: { title, questions:[{ text, options, answer }] } }
                       — A1 topics 5-12
           An earlier version of this file only understood the first and
           reported "A1 0 items" without failing, which is exactly the kind of
           silent hole this suite exists to close. Both are read now, and the
           per-course guard at the end refuses a zero. */
        let groups;
        if (Array.isArray(t[key].exercises)) {
            groups = t[key].exercises;
        } else {
            groups = Object.keys(t[key])
                .filter((k) => /^exercise\d+$/.test(k))
                .map((k) => ({
                    id: k,
                    type: 'choice',
                    items: (t[key][k].questions || []).map((q) => ({
                        q: q.text != null ? q.text : q.q,
                        options: q.options,
                        answer: q.answer,
                        free: q.free
                    }))
                }));
        }
        if (!groups.length) return;
        TOTALS[label].topics++;

        groups.forEach((g) => {
            const type = g.type || 'mixed';
            byType[type] = (byType[type] || 0) + (g.items || []).length;
            if (type === 'reading') { audioSteps++; TOTALS[label].audio++; }

            (g.items || []).forEach((it, i) => {
                items++; TOTALS[label].items++;
                const where = `${label} T${t.id} ${g.id}#${i + 1}`;
                const answers = (Array.isArray(it.answer) ? it.answer : [it.answer])
                    .filter((a) => String(a == null ? '' : a).trim() !== '');

                /* ---- THE OPEN / DETERMINISTIC SPLIT ---- */
                if (type !== 'reading') {
                    /* THE PLATFORM MARKS AN ITEM OPEN TWO WAYS — `free: true`
                       and an empty key (`answer: [""]`). Both are in use: A2
                       uses the flag, B1's "continue the sentence" drills use the
                       empty key. Asking the engine avoids picking one and
                       mis-classifying every lesson that chose the other. */
                    if (isOpen(it)) {
                        open++; TOTALS[label].open++;
                        /* An open prompt must still demand a real attempt. */
                        ok(UI.matchItem(it, 'да') !== true,
                            `${where}: an open prompt refuses a one-word non-attempt`);
                        /* It MAY carry a «Namuna» reference key; that key is
                           inert because openness is decided before comparison. */
                        if (answers.length) freeWithModel++;
                    } else {
                        deterministic++;
                        ok(answers.length > 0,
                            `${where}: a graded item has an answer key`);
                        /* THE SANITY CONTROL: a graded item accepts its own key
                           and refuses nonsense. A scorer that accepted
                           everything would light this up platform-wide. */
                        ok(UI.matchItem(it, answers[0]) === true,
                            `${where}: its own canonical answer is accepted`);
                        ok(UI.matchItem(it, NONSENSE) !== true,
                            `${where}: nonsense is refused`);
                        ok(UI.matchItem(it, '') !== true,
                            `${where}: a blank answer is refused`);
                    }
                }

                /* ---- MULTI-ACCEPT AFTER NORMALISATION ---- */
                if (answers.length > 1) {
                    multi++; TOTALS[label].multi++;
                    const n = answers.map(norm);
                    /* Variants that fold together under the normaliser (ё/е,
                       case, punctuation) are REDUNDANT, not wrong: they accept
                       exactly the inputs the surviving variant already accepts.
                       Several lessons list «У неё …» and «У нее …» side by side
                       deliberately. Counted, not failed. */
                    if (new Set(n).size !== n.length) redundantVariant++;
                    ok(n.every((x) => x.length > 0),
                        `${where}: no accepted variant normalises to nothing`);
                }

                /* ---- THE RENDERED WORD BANK ---- */
                if (type === 'builder') {
                    builders++; TOTALS[label].builder++;
                    const cards = SB.bank(it, g);
                    ok(cards.length > 0, `${where}: the builder renders cards`);
                    ok(answers.length > 0, `${where}: a builder item has an accepted answer`);
                    /* THE COMPONENT'S OWN CONTRACT, not a stricter invention.
                       sentence-builder.js builds the bank as the MULTISET UNION
                       of every accepted answer and says so: "leftover cards
                       after a valid answer are expected". When an item accepts
                       «…потому что…» OR «…поэтому…», both connectives are on the
                       table and either answer leaves the other behind. So exact
                       equality is wrong; the two real rules are:
                         1. no answer may need a card the bank does not have
                            (otherwise it cannot be built at all), and
                         2. no card may exist that NO answer ever uses
                            (otherwise it is an unusable leftover). */
                    const count = (list) => {
                        const m = new Map();
                        list.map(norm).filter(Boolean)
                            .forEach((w) => m.set(w, (m.get(w) || 0) + 1));
                        return m;
                    };
                    const have = count(cards);
                    const union = new Map();
                    answers.forEach((a) => {
                        const need = count(SB.split(String(a), g.glue));
                        need.forEach((n, w) => {
                            if ((union.get(w) || 0) < n) union.set(w, n);
                            ok((have.get(w) || 0) >= n,
                                `${where}: the bank supplies «${w}» x${n}`
                                + ` (has ${have.get(w) || 0}) for «${a}»`);
                        });
                    });
                    have.forEach((n, w) => {
                        ok((union.get(w) || 0) >= n,
                            `${where}: card «${w}» x${n} is used by some accepted answer`
                            + ` (max needed ${union.get(w) || 0})`);
                    });
                }
            });
        });
    });
});

console.log(`  items ${items} · deterministic ${deterministic} · open ${open}`
    + ` · multi-accept ${multi} · builder ${builders} · audio steps ${audioSteps}`);
Object.entries(TOTALS).forEach(([k, v]) => console.log(
    `    ${k.padEnd(9)} topics ${String(v.topics).padStart(2)} · items ${String(v.items).padStart(4)}`
    + ` · open ${String(v.open).padStart(3)} · multi ${String(v.multi).padStart(3)}`
    + ` · builder ${String(v.builder).padStart(3)} · audio ${v.audio}`));
console.log('    types: ' + Object.entries(byType).map(([k, v]) => `${k}=${v}`).join(' '));
console.log(`    open items carrying a reference «Namuna» key: ${freeWithModel}`
    + ` · multi-accept arrays with a normalisation-redundant variant: ${redundantVariant}`);

/* THE ENGINE PROPERTY that makes a reference key on an open item harmless:
   `free` is decided before any comparison, so the key is never graded. */
{
    const UI = fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8');
    ok(/function isOpenItem\(item\) \{\s*\n\s*if \(item && item\.free\) return true;/.test(UI),
        'the engine treats `free` as open BEFORE looking at any answer key');
    ok(/if \(isOpenItem\(item\)\) \{[\s\S]{0,200}OPEN_ANSWER_MIN_WORDS/.test(UI),
        'and grades an open item by the word minimum, never by its key');
}

/* Guard rails: this suite must actually be looking at the platform. */
ok(items > 3000, `the sweep reached the whole platform (${items} items)`);
/* A BUILD THAT SILENTLY YIELDED NOTHING is the failure mode this suite had
   itself: it printed "A1 0 items" and passed anyway. The rule is now derived
   from the page rather than assumed — if a build ships `topicNExercises`
   payloads, this sweep must have read some; if it ships none (B2 generates its
   quizzes at runtime, the A1/B2 demos carry no payload at all) then zero is the
   truth and verify_course_integrity.cjs is what covers those items. */
Object.entries(TOTALS).forEach(([label, v]) => {
    if (v.hasPayloads) {
        ok(v.items > 0, `${label}: the sweep actually read this build (${v.items} items)`);
    } else {
        ok(v.items === 0,
            `${label}: ships no topicNExercises payload — covered by course integrity`);
    }
});
{
    /* …and that claim is checked, not asserted: course integrity must really
       still sweep every course, or the hand-off above is empty. */
    const CI = fs.readFileSync(path.join(ROOT, 'scripts/verify_course_integrity.cjs'), 'utf8');
    /* B2's lessons are not in its HTML — they live in a module that assigns
       window.B2_LESSON_DATA, which is where course integrity reads them. */
    ['a1-course.html', 'a2-course.html', 'b1-course.html', 'b2-lesson-data.js']
        .forEach((src) => ok(CI.includes(src),
            `course integrity still sweeps ${src}`));
}
/* Builders live only in A2 and B1; A1 and B2 have none, so "0 builders" there
   is the truth and not a gap. Stated so a future builder in A1 is noticed. */
ok(builders >= 200,
    `every builder in the platform was checked against its rendered bank (${builders})`);
ok(builders >= 200, `every builder was checked (${builders})`);
ok(open > 0, `open prompts exist and were classified (${open})`);
ok(Object.keys(TOTALS).length >= 4, 'several course builds were read');

/* ---- WRONG-ANSWER SANITY, at platform scale ----
   Every graded item above was asked to accept its own key and refuse both
   nonsense and a blank. Those three assertions per item ARE the sanity control:
   a scorer that accepted everything, or nothing, could not pass them. */
ok(deterministic > 2000, `the sanity control ran on every graded item (${deterministic})`);

console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ ALL-COURSE EXERCISE CONTRACTS: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ ALL-COURSE EXERCISE CONTRACTS: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
