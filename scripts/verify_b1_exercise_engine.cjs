#!/usr/bin/env node
/**
 * verify_b1_exercise_engine.cjs — B1's exercises, reconstructed and gated.
 *
 * B1 was the last course grading a whole lesson at once: checkTopic1Exercises()
 * summed correct/total over every exercise and compared that ONE figure to the
 * bar, so a perfect exercise paid for a failed one. This suite exists to prove
 * two things about the replacement, and to keep proving them:
 *
 *   NOTHING WAS LOST. The scored surface is rebuilt here from the RAW topic
 *   data, independently of b1-host.js, and the two are compared item by item.
 *   A1's migration shipped a bug where composing surfaces the wrong way
 *   silently dropped 118 scored items and every test still passed, because
 *   every test asked the adapter what it contained. This one does not ask.
 *
 *   THE BAR IS PER EXERCISE. Driven on the real groups, including the small
 *   ones: B1's old rule was an ABSOLUTE count (PASSING_SCORE = 7), which on a
 *   five-item exercise is unreachable, so carrying it down would have made
 *   those exercises impossible to pass.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('\n=== B1 EXERCISE ENGINE ===');

const PAGE = read('paid-courses/b1-course.html');
const HOST = read('b1-host.js');
const g = {};
new Function('window', HOST)(g);
const B1 = g.B1Host;

/* the page's own data literal */
const ci = PAGE.indexOf('const courseData');
const cj = PAGE.indexOf('\n        };', ci);
const courseData = (0, eval)('(' + PAGE.slice(PAGE.indexOf('{', ci), cj + 11).replace(/;\s*$/, '') + ')');

eq('B1 has twenty canonical topics', courseData.topics.length, 20);
eq('numbered 1..20', courseData.topics.map((t) => t.id).join(','),
    Array.from({ length: 20 }, (_, i) => i + 1).join(','));

/* ================================================================ *
 * 1. THE TRUE SCORED SURFACE, REBUILT FROM THE RAW DATA
 * ---------------------------------------------------------------- *
 * Deliberately does not call B1Host. It re-implements the page's own
 * reading of the data — getT1ExData() picks the first topic<N>Exercises
 * that exists, renderTopic1Exercises() renders every group in it, and
 * checkTopic1Exercises() scores every item of every group.
 * ================================================================ */
function rawSurface() {
    const out = [];
    courseData.topics.forEach((t) => {
        let ex = null;
        for (let n = 1; n <= 20 && !ex; n++) ex = t['topic' + n + 'Exercises'] || null;
        const groups = ((ex && ex.exercises) || []).filter((x) => x && (x.items || []).length);
        out.push({ id: t.id, groups });
    });
    return out;
}
const RAW = rawSurface();
const rawGroups = RAW.reduce((n, t) => n + t.groups.length, 0);
const rawItems = RAW.reduce((n, t) => n + t.groups.reduce((m, x) => m + x.items.length, 0), 0);

const HOSTED = courseData.topics.map((t) => ({ id: t.id, groups: B1.groupsOf(t) }));
const hostGroups = HOSTED.reduce((n, t) => n + t.groups.length, 0);
const hostItems = HOSTED.reduce((n, t) => n + t.groups.reduce((m, x) => m + x.items.length, 0), 0);

eq('the host reproduces every scored group', hostGroups, rawGroups);
eq('and every scored item', hostItems, rawItems);
ok(rawGroups === 153, `the raw surface is 153 groups (${rawGroups})`);
ok(rawItems === 1504, `the raw surface is 1504 items (${rawItems})`);

/* per topic, and per group, not just in total */
RAW.forEach((rt, i) => {
    const ht = HOSTED[i];
    eq(`T${rt.id}: group count preserved`, ht.groups.length, rt.groups.length);
    eq(`T${rt.id}: group ids and order preserved`,
        ht.groups.map((x) => x.id).join(','), rt.groups.map((x) => x.id).join(','));
    rt.groups.forEach((rg, k) => {
        const hg = ht.groups[k];
        if (!hg) return;
        eq(`T${rt.id}/${rg.id}: item count preserved`, hg.items.length, rg.items.length);
    });
});

/* NOTHING INVENTED, NOTHING REWRITTEN. Every question, option and answer key
   must be the SAME VALUE the lesson data holds — structural wrapping is
   allowed, editing the course is not. */
{
    let checkedQ = 0, checkedO = 0, checkedA = 0, drift = 0;
    RAW.forEach((rt, i) => {
        rt.groups.forEach((rg, k) => {
            const hg = HOSTED[i].groups[k];
            if (!hg) return;
            rg.items.forEach((ri, j) => {
                const hi = hg.items[j];
                if (!hi) { drift++; return; }
                if (JSON.stringify(ri.q) !== JSON.stringify(hi.q)) drift++;
                checkedQ++;
                if (JSON.stringify(ri.options || null) !== JSON.stringify(hi.options || null)) drift++;
                checkedO++;
                if (JSON.stringify(ri.answer) !== JSON.stringify(hi.answer)) drift++;
                checkedA++;
                if (JSON.stringify(ri.words || null) !== JSON.stringify(hi.words || null)) drift++;
            });
        });
    });
    ok(checkedQ === rawItems, `every question was compared (${checkedQ})`);
    eq('educational content drift', drift, 0);
    ok(checkedO > 0 && checkedA > 0, 'options and answer keys were compared too');
}

/* THE SOURCE DATA IS NOT MUTATED. groupsOf() derives a passage for the reading
   groups; writing that back into courseData would make the raw surface and the
   rendered surface disagree, and every integrity suite reads the raw one. */
{
    let wrote = 0;
    courseData.topics.forEach((t) => {
        let ex = null;
        for (let n = 1; n <= 20 && !ex; n++) ex = t['topic' + n + 'Exercises'] || null;
        ((ex && ex.exercises) || []).forEach((x) => { if (x && x.passage) wrote++; });
    });
    eq('groupsOf() never writes a derived field back into the lesson data', wrote, 0);
}

/* ================================================================ *
 * 2. WHAT IS DELIBERATELY NOT SCORED — stated, so it cannot drift
 * ================================================================ */
{
    /* the matching game: rendered by ten topics, never scored by the old
       grader. Folding it into the gate would invent a grade. */
    const withGame = courseData.topics.filter((t) => t.quiz && t.quiz.matchingGame);
    ok(withGame.length > 0, `${withGame.length} topics render a matching game`);
    let inGate = 0;
    withGame.forEach((t) => {
        B1.groupsOf(t).forEach((x) => { if (/match/i.test(x.id)) inGate++; });
    });
    eq('no matching game enters the scored gate', inGate, 0);
    ok(/never scored it|not an exercise|warm-up/i.test(HOST),
        'and the host says so, so a later reader does not "fix" it');

    /* the matchingSlot placeholder carries no item */
    let slots = 0;
    courseData.topics.forEach((t) => {
        let ex = null;
        for (let n = 1; n <= 20 && !ex; n++) ex = t['topic' + n + 'Exercises'] || null;
        ((ex && ex.exercises) || []).forEach((x) => { if (x && x.id === 'matchingSlot') slots++; });
    });
    ok(slots > 0, `${slots} matchingSlot placeholders exist`);
    let slotted = 0;
    HOSTED.forEach((t) => t.groups.forEach((x) => { if (x.id === 'matchingSlot') slotted++; }));
    eq('and none of them is treated as an exercise', slotted, 0);

    /* the legacy quiz arrays: present on nine topics and EMPTY on all of them,
       so nothing learner-visible is lost by leaving them alone */
    const legacy = courseData.topics.filter((t) => t.quiz && t.quiz.mcQuestions);
    ok(legacy.length > 0, `${legacy.length} topics still carry a legacy quiz object`);
    const legacyItems = legacy.reduce((n, t) =>
        n + t.quiz.mcQuestions.length + (t.quiz.blankQuestions || []).length, 0);
    eq('every legacy quiz array is empty — no scored item lives there', legacyItems, 0);
    /* and it is unreachable anyway: loadQuiz/checkAnswers both return early
       for a topic that has topic<N>Exercises, and all twenty do */
    const allHaveEx = courseData.topics.every((t) => {
        for (let n = 1; n <= 20; n++) if (t['topic' + n + 'Exercises']) return true;
        return false;
    });
    eq('all twenty topics have topic<N>Exercises, so loadQuiz always defers',
        allHaveEx, true);
}

/* ================================================================ *
 * 3. THE MEDIA THAT THE QUESTIONS DEPEND ON MUST TRAVEL WITH THEM
 * ---------------------------------------------------------------- *
 * A listening exercise without its audio, or a comprehension exercise
 * without its passage, is unanswerable. The old page rendered both in a
 * card above the questions; the shared renderer has the same two concepts.
 * ================================================================ */
{
    let audio = 0, passage = 0, orphanAudio = 0, orphanPassage = 0;
    courseData.topics.forEach((t) => {
        let ex = null;
        for (let n = 1; n <= 20 && !ex; n++) ex = t['topic' + n + 'Exercises'] || null;
        const rawG = ((ex && ex.exercises) || []).filter((x) => x && (x.items || []).length);
        const hostG = B1.groupsOf(t);
        rawG.forEach((rg, k) => {
            const hg = hostG[k];
            if (rg.audioSrc) { audio++; if (!hg || hg.audioSrc !== rg.audioSrc) orphanAudio++; }
            if (rg.readingText) {
                passage++;
                if (!hg || !hg.passage) { orphanPassage++; return; }
                /* the TEXT must survive, not merely some passage */
                const paras = Array.isArray(rg.readingText) ? rg.readingText : [rg.readingText];
                paras.forEach((p) => {
                    const esc = String(p).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                    if (hg.passage.indexOf(esc) < 0) orphanPassage++;
                });
                if (rg.readingTitle && hg.passage.indexOf(
                    String(rg.readingTitle).replace(/&/g, '&amp;')) < 0) orphanPassage++;
            }
        });
    });
    ok(audio === 15, `fifteen listening groups carry an audio source (${audio})`);
    eq('every one of them keeps it', orphanAudio, 0);
    ok(passage === 5, `five comprehension groups carry a reading text (${passage})`);
    eq('every paragraph and title survives into the passage', orphanPassage, 0);
    /* the shared renderer resolves audio paths with the same rule the page used */
    const UI = read('course-exercise-ui.js');
    ok(/indexOf\('\.\.\/'\) !== 0/.test(UI) && /\/paid-courses\//.test(UI),
        'the shared renderer applies the same ../ path rule b1-course.html did');
}

/* ================================================================ *
 * 4. THE GATE, DRIVEN ON REAL B1 GROUPS
 * ================================================================ */
{
    eq('the host publishes the platform threshold', B1.PASS_PERCENT, 80);
    eq('declared exactly once', (HOST.match(/var PASS_PERCENT = \d+;/g) || []).length, 1);
    ok(/passScore: PASS_PERCENT/.test(HOST), 'and every mount is gated with it');

    const t1 = courseData.topics.find((t) => t.id === 1);
    const groups = B1.groupsOf(t1);
    /* THE FIXTURE MUST NOT PRE-JUDGE. An earlier version of this helper also
       wrote passed: c * 100 >= total * 80 into every entry, and
       allGroupsPassed() short-circuits on that flag — so the fixture's own
       arithmetic answered the question and the HOST's threshold was never
       exercised. Two negative controls (a 70% bar, and a rounded percentage)
       walked straight through this suite because of it. The flag is left
       undefined here, so only the host decides. */
    const attempt = (idx, correct) => {
        const checked = {};
        groups.forEach((x, i) => {
            const total = x.items.length;
            const c = (i === idx) ? correct : total;
            checked[x.id] = { correct: c, total };
        });
        return { answers: {}, checked };
    };
    eq('every group perfect passes', B1.allGroupsPassed(groups, attempt(-1, 0)), true);
    eq('7/10 on ONE group fails the topic', B1.allGroupsPassed(groups, attempt(0, 7)), false);
    eq('8/10 on that group passes', B1.allGroupsPassed(groups, attempt(0, 8)), true);
    eq('0/10 fails', B1.allGroupsPassed(groups, attempt(0, 0)), false);

    /* NO COMPENSATION: this is the behaviour the whole migration is for. */
    const compensate = {};
    groups.forEach((x, i) => {
        const total = x.items.length;
        const c = i === 1 ? Math.floor(total / 2) : total;
        compensate[x.id] = { correct: c, total };
    });
    eq('perfect exercises never pay for a failed one',
        B1.allGroupsPassed(groups, { answers: {}, checked: compensate }), false);

    /* THE SMALL GROUPS. B1's old floor was seven CORRECT ANSWERS, absolute.
       Applied per exercise that is unreachable below seven items, so these
       exercises could never have been passed at all. */
    const small = [];
    courseData.topics.forEach((t) => B1.groupsOf(t).forEach((x) => {
        if (x.items.length < 7) small.push([t.id, x.id, x.items.length]);
    }));
    ok(small.length > 0, `${small.length} exercises have fewer than seven items`);
    small.forEach(([tid, gid, n]) => {
        const gs = B1.groupsOf(courseData.topics.find((t) => t.id === tid));
        const at = (c) => {
            const checked = {};
            gs.forEach((x) => {
                const total = x.items.length;
                const cc = x.id === gid ? c : total;
                checked[x.id] = { correct: cc, total };
            });
            return { answers: {}, checked };
        };
        const need = Math.ceil(n * 0.8);
        eq(`T${tid}/${gid} (${n} items): ${need}/${n} passes`, B1.allGroupsPassed(gs, at(need)), true);
        eq(`T${tid}/${gid}: ${need - 1}/${n} fails`, B1.allGroupsPassed(gs, at(need - 1)), false);
    });
    /* The host EXPLAINS the old absolute floor in prose — that comment is why
       nobody reinstates it — so the check is on executable code only. Filtering
       by line prefix is not enough: a block comment's continuation lines carry
       no marker of their own, which is exactly where the word appears. */
    const hostCode = HOST.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    ok(hostCode.length > 3000, 'the host still has substantial code after comments are stripped');
    ok(/function completeExercises/.test(hostCode), 'and the stripper kept real code');
    eq('the old absolute PASSING_SCORE is not part of the host\'s rule',
        /PASSING_SCORE/.test(hostCode), false);

    /* AND THE FLAG IS NOT A BACK DOOR. A caller that claims passed: true on
       an exercise that did not clear the bar must still be refused — the
       numbers are the authority, not the claim. */
    {
        const lying = {};
        groups.forEach((x, i) => {
            const total = x.items.length;
            const c = i === 0 ? 1 : total;
            lying[x.id] = { correct: c, total, passed: true };
        });
        eq('a checked entry claiming passed:true on 1/10 is still refused',
            B1.allGroupsPassed(groups, { answers: {}, checked: lying }), false);
    }

    /* THE ROUNDING TRAP, DRIVEN THROUGH THE HOST.
       Every B1 exercise today holds 4, 5 or 10 items, and at those sizes a
       rounded percentage and an exact ratio agree on every possible score —
       so swapping one for the other changes NOTHING that this course can
       currently express, and a mutation test over real groups cannot see it.
       That is not a reason to leave the rule untested: the moment an exercise
       has 49 items, 39 correct is 79.59% and rounds to 80. So the comparison
       is driven here on a synthetic group of that size. */
    {
        const wide = [{ id: 'synthetic-49', type: 'input',
                        items: Array.from({ length: 49 }, () => ({ q: 'x', answer: 'y' })) }];
        const at = (c) => ({ answers: {}, checked: { 'synthetic-49': { correct: c, total: 49 } } });
        eq('39/49 is refused (79.59% — a rounded percent would pass it)',
            B1.allGroupsPassed(wide, at(39)), false);
        eq('40/49 is accepted', B1.allGroupsPassed(wide, at(40)), true);
        /* and the same rule guards the durable-snapshot path */
        const snapOf = (c) => ({
            completed: true, topicId: 1, score: c, total: 49, percentage: Math.round(c / 49 * 100),
            groups: [{ groupId: 'synthetic-49', title: 'x', correct: c, total: 49,
                       percentage: Math.round(c / 49 * 100) }]
        });
        eq('a snapshot claiming 39/49 does not prove completion either',
            B1.snapshotProvesCompletion(snapOf(39), wide, 1), false);
        eq('40/49 does', B1.snapshotProvesCompletion(snapOf(40), wide, 1), true);
    }

    /* the rounding trap, on the exact ratio the host uses */
    const ratio = (c, t) => c * 100 >= t * 80;
    eq('39/49 fails (79.59% — rounds to 80)', ratio(39, 49), false);
    eq('40/49 passes', ratio(40, 49), true);
    eq('the host compares an exact integer ratio',
        /\* 100 >= [a-zA-Z.]*total \* PASS_PERCENT|\(c\.correct \|\| 0\) \* 100 >= c\.total \* PASS_PERCENT/.test(HOST), true);
    eq('and never a rounded percentage', /Math\.round\([^)]*\) >= PASS_PERCENT/.test(HOST), false);
}

/* ================================================================ *
 * 5. THE DRAFT: SCOPED, FINGERPRINTED, AND CARRYING NO PROGRESSION
 * ================================================================ */
{
    eq('the draft key names the course', /:' \+ COURSE \+ '/.test(HOST), true);
    const k = B1.draftKey('u-1', 7);
    ok(/^uzdarus:exercise-draft:u-1:B1:7:/.test(k), `the key is user+course+topic scoped (${k})`);
    ok(B1.draftKey('u-1', 7) !== B1.draftKey('u-2', 7), 'two users never share a draft');
    ok(B1.draftKey('u-1', 7) !== B1.draftKey('u-1', 8), 'two topics never share a draft');
    ok(B1.draftKey('u-1', 7).indexOf(':B1:') > 0, 'and the course is in the key, so A1/B2 cannot collide');
    ok(B1.draftKey(null, 7).indexOf(':guest:') > 0, 'a signed-out learner gets a guest key');

    /* the fingerprint must separate every topic — B1 has repeated shapes */
    const fps = courseData.topics.map((t) => B1.fingerprint(B1.groupsOf(t), t.id));
    eq('every topic has a distinct fingerprint', new Set(fps).size, 20);
    const t3 = courseData.topics.find((t) => t.id === 3);
    const g3 = B1.groupsOf(t3);
    const shrunk = g3.map((x, i) => i === 0 ? { id: x.id, items: x.items.slice(1) } : x);
    ok(B1.fingerprint(shrunk, 3) !== B1.fingerprint(g3, 3),
        'a changed item count changes the fingerprint, so stale answers cannot replay');

    const at = HOST.indexOf('draft: {');
    ok(at > 0, 'the host declares a draft block');
    const end = HOST.indexOf('clear: function ()', at);
    const draftBlock = HOST.slice(at, HOST.indexOf('}', end));
    eq('the draft block never carries progression',
        /completedTopics|topicComponents|finalExamPassed/.test(draftBlock), false);
    ok(/d\.course !== COURSE/.test(HOST), 'a draft from another course is refused');
    ok(/d\.fingerprint !== fp/.test(HOST), 'and one from another lesson shape is refused');
}

console.log(`  20 topics · ${hostGroups} groups · ${hostItems} items`);
console.log('  surface rebuilt from raw data · content drift 0 · per-group 80% driven on real groups');
console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ B1 EXERCISE ENGINE: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ B1 EXERCISE ENGINE: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
