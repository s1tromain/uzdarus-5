#!/usr/bin/env node
/**
 * verify_a2_audio_mapping.cjs — every authored A2 lesson must play ITS OWN
 * recording, and that recording must actually exist on disk.
 *
 * The rule for this course is positional, not editorial:
 *
 *     A2 topic N  →  audios/А2 N урок.mp3
 *
 * Two failure modes are worth a permanent test. The first is a lesson pointing
 * at another course's file — a Б2 recording under an A2 topic is silently wrong
 * for a learner: the player works, the audio plays, and every comprehension
 * answer is unanswerable. The second is a lesson pointing at a filename that
 * was never on disk; that one at least fails loudly, but only in a browser.
 *
 * The walk is driven by the DATA, not by a hardcoded topic list: any topic that
 * carries a generic `topicNExercises.exercises` array is treated as authored and
 * must satisfy the rule. A topic authored later is covered the day it lands,
 * without editing this file.
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

/* The engine's own shape-discriminated lookup, reproduced. A topic is authored
   exactly when the generic engine would claim it. */
function exData(topic) {
    if (!topic) return null;
    for (let n = 1; n <= 20; n++) {
        const d = topic['topic' + n + 'Exercises'];
        if (d && Array.isArray(d.exercises)) return d;
    }
    return null;
}

console.log('\n=== A2 AUDIO MAPPING ===');

const BUILDS = [
    { rel: 'paid-courses/a2-course.html', mustCover: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
    { rel: 'a2-demo.html', mustCover: [1, 2, 3] }
];

for (const build of BUILDS) {
    const abs = path.join(ROOT, build.rel);
    if (!fs.existsSync(abs)) { ok(false, `${build.rel} is missing`); continue; }
    const src = mainScript(fs.readFileSync(abs, 'utf8'));
    const courseData = literal(src, 'courseData');
    const topics = (courseData.topics || []).filter(t => t && exData(t));
    const seen = [];

    for (const topic of topics) {
        const groups = exData(topic).exercises.filter(g => g && g.audioSrc);
        const label = `${build.rel} topic ${topic.id}`;
        eq(`${label} — exactly one audio step`, groups.length, 1);
        if (groups.length !== 1) continue;

        const raw = String(groups[0].audioSrc);
        const decoded = decodeURIComponent(raw);
        const expected = `audios/А2 ${topic.id} урок.mp3`;

        eq(`${label} — audio source`, decoded, expected);
        ok(!/Б2/.test(decoded) && !/%D0%912/i.test(raw),
            `${label} — must not borrow a Б2 recording (got ${decoded})`);
        ok(raw !== decoded, `${label} — audio source must stay percent-encoded`);
        ok(fs.existsSync(path.join(ROOT, decoded)),
            `${label} — ${decoded} does not exist on disk`);
        /* Topics 6+ split listening from its comprehension check into two
           steps; topics 1-5 still carry both in one group. Either shape is
           fine here — this suite is about WHICH file plays, and the per-topic
           suites own the step shape. What must hold in both is that the
           questions attached to the recording are gradable. */
        const items = groups[0].items || [];
        ok(items.length === 0 || items.every(q => q && q.answer !== undefined),
            `${label} — every question on the audio group has an answer key`);
        seen.push(topic.id);
    }

    /* A data-driven walk must not be able to pass by walking nothing. */
    for (const id of build.mustCover) {
        ok(seen.includes(id), `${build.rel} — topic ${id} was not covered by the audio walk`);
    }
    console.log(`  ${build.rel}: topics [${seen.join(', ')}] → А2 N урок.mp3`);
}

/* Nothing in the A2 pages may reference a Б2 recording at all. */
for (const build of BUILDS) {
    const abs = path.join(ROOT, build.rel);
    if (!fs.existsSync(abs)) continue;
    const html = fs.readFileSync(abs, 'utf8');
    const borrowed = (html.match(/audios\/[^"']*/g) || [])
        .map(decodeURIComponent).filter(s => /Б2/.test(s));
    eq(`${build.rel} — no Б2 audio referenced`, borrowed.length, 0);
}

console.log('\n' + '='.repeat(60));
if (fail) {
    console.log(`  ❌ A2 AUDIO MAPPING: ${fail} failed / ${pass + fail}\n`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ A2 AUDIO MAPPING: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
