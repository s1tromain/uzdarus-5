#!/usr/bin/env node
/**
 * verify_a1_exercise_engine.cjs — A1 on the shared exercise stack.
 *
 * THE DEFECT THIS SUITE EXISTS FOR. A1 put every exercise of a topic on one
 * screen, graded them together, and reported one TOPIC-WIDE figure. A perfect
 * exercise therefore paid for a failed one — 10/10 then 5/10 averages to 75%,
 * and the learner moved on having never understood the second exercise. The
 * product rule is that every scored exercise is earned on its own.
 *
 * a1-host.js expresses A1's existing data as GROUPS so the shared engine can
 * gate each one. This suite proves three separate things:
 *
 *   COVERAGE   every one of the twelve topics maps to groups, and every scored
 *              exercise ends up inside one. Nothing may stay outside the gate.
 *
 *   FIDELITY   no question, option or answer changed. The normaliser moves
 *              text between field names; it must never rewrite it. Proven by
 *              comparing every value against the source data, not by reading
 *              the normaliser.
 *
 *   BEHAVIOUR  the per-group gate, driven through the real adapter and the real
 *              engine at the real boundary — including the acceptance case that
 *              a topic-wide gate gets wrong.
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
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('\n=== A1 EXERCISE ENGINE ===');

/* ---- the real host, and the real course data ---- */
const HOSTSRC = read('a1-host.js');
const g = {};
new Function('window', HOSTSRC)(g);
const A1 = g.A1Host;
ok(!!A1, 'a1-host.js installs A1Host');
eq('it declares the platform threshold', A1.PASS_PERCENT, 80);
eq('and its own course', A1.COURSE, 'A1');

const PAGE = read('paid-courses/a1-course.html');
const ci = PAGE.indexOf('const courseData');
const cj = PAGE.indexOf('\n        };', ci);
const courseData = vm.runInNewContext(
    '(' + PAGE.slice(PAGE.indexOf('{', ci), cj + 11).replace(/;\s*$/, '') + ')', {});
const TOPICS = courseData.topics;
eq('A1 has twelve canonical topics', TOPICS.length, 12);

/* ================================================================ *
 * 1. COVERAGE — every topic, every scored exercise
 * ================================================================ */
const MAP = {};
{
    let totalGroups = 0, totalItems = 0;
    TOPICS.forEach((t) => {
        const groups = A1.groupsOf(t);
        MAP[t.id] = groups;
        ok(groups.length > 0, `T${t.id}: maps to at least one group (${groups.length})`);
        groups.forEach((grp) => {
            ok(!!grp.id, `T${t.id}.${grp.id}: has an id`);
            ok(!!grp.title, `T${t.id}.${grp.id}: has a title`);
            ok(Array.isArray(grp.items) && grp.items.length > 0,
                `T${t.id}.${grp.id}: has items (${(grp.items || []).length})`);
            grp.items.forEach((it, i) => {
                ok(typeof it.q === 'string' && it.q.length > 0,
                    `T${t.id}.${grp.id}#${i + 1}: carries its question text`);
            });
        });
        /* no duplicate group ids inside a topic — the draft keys on them */
        eq(`T${t.id}: group ids are unique`,
            new Set(groups.map((x) => x.id)).size, groups.length);
        totalGroups += groups.length;
        totalItems += groups.reduce((s, x) => s + x.items.length, 0);
    });
    ok(totalGroups >= 50, `A1 maps ${totalGroups} exercise groups`);
    ok(totalItems >= 500, `covering ${totalItems} items`);
    console.log(`  ${TOPICS.length} topics · ${totalGroups} groups · ${totalItems} items`);

    /* NOTHING SCORED MAY REMAIN OUTSIDE. Every exercise the source data
       declares must appear as a group — counted from the raw data, not from
       the normaliser's own output. */
    /* THE TRUE LEARNER SURFACE, INDEPENDENTLY RECONSTRUCTED.

       An earlier version of this check looked only at topic<N>Exercises and,
       for topics without it, at the base quiz — the same either/or the adapter
       used. It therefore agreed with the adapter instead of checking it, and
       118 scored questions sat outside the gate unnoticed: topic 5's whole base
       quiz (10), topic 3's four extraExercises sections (100) and topic 4's fill
       exercise (8).

       The expected surface is now built from the RAW topic object, counting
       every scored thing A1 ships, and compared against what the adapter
       produced. A surface the adapter forgets fails here. */
    function trueSurfaces(t) {
        const out = [];
        const q = t.quiz || {};
        if ((q.mcQuestions || []).length) out.push(['quiz-mc', q.mcQuestions.length]);
        if ((q.blankQuestions || []).length) out.push(['quiz-blank', q.blankQuestions.length]);
        if (t.extraExercises) {
            Object.keys(t.extraExercises).sort().forEach((sec) => {
                const v = t.extraExercises[sec];
                const n = (v.items || v.questions || v.prompts || v.sentences || []).length;
                if (n) out.push(['extra-' + sec, n]);
            });
        }
        if (t.topic4FillExercise) {
            const v = t.topic4FillExercise;
            const n = (v.items || v.questions || v.prompts || v.sentences || []).length;
            if (n) out.push(['fill', n]);
        }
        const key = Object.keys(t).filter((k) => /^topic\d+Exercises$/.test(k))[0];
        if (key) {
            Object.keys(t[key]).filter((k) => /^exercise\d+$/.test(k))
                .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))
                .forEach((gid) => {
                    const v = t[key][gid];
                    const n = (v.items || v.questions || v.prompts || v.sentences || []).length;
                    if (n) out.push([gid, n]);
                });
        }
        return out;
    }

    let trueItems = 0, mappedItems = 0;
    TOPICS.forEach((t) => {
        const want = trueSurfaces(t);
        const got = MAP[t.id].map((x) => [x.id, x.items.length]);
        trueItems += want.reduce((a, b) => a + b[1], 0);
        mappedItems += got.reduce((a, b) => a + b[1], 0);
        eq(`T${t.id}: every scored surface is inside the gate, in order`,
            got.map((x) => x[0]).join(','), want.map((x) => x[0]).join(','));
        want.forEach(([id, n]) => {
            const m = got.find((x) => x[0] === id);
            eq(`T${t.id}.${id}: all ${n} scored items are present`, m ? m[1] : 0, n);
        });
        eq(`T${t.id}: no group was invented`, got.length, want.length);
    });
    eq('no scored item was dropped or duplicated across A1', mappedItems, trueItems);
    ok(trueItems > 600, `${trueItems} scored items in the true A1 surface`);

    /* the specific surfaces that were missing, named so a regression is obvious */
    eq('T5 keeps its base quiz alongside its exercises',
        MAP[5].filter((x) => x.id.indexOf('quiz-') === 0).length, 2);
    eq('T3 extraExercises are inside the gate',
        MAP[3].filter((x) => x.id.indexOf('extra-') === 0).length, 4);
    eq('T4 fill exercise is inside the gate',
        MAP[4].filter((x) => x.id === 'fill').length, 1);
}

/* ================================================================ *
 * 2. FIDELITY — no lesson content changed
 * ================================================================ */
{
    const norm = (v) => (v == null ? null : String(v));
    let checked = 0, drift = [];
    TOPICS.forEach((t) => {
        const key = Object.keys(t).filter((k) => /^topic\d+Exercises$/.test(k))[0];
        if (!key) return;
        MAP[t.id].forEach((grp) => {
            const raw = t[key][grp.id];
            if (!raw) return;
            const source = Array.isArray(raw.items) ? raw.items
                : Array.isArray(raw.questions) ? raw.questions : null;
            if (source) {
                eq(`T${t.id}.${grp.id}: item count preserved`, grp.items.length, source.length);
                source.forEach((rawItem, i) => {
                    const out = grp.items[i];
                    checked++;
                    const q = rawItem.prompt != null ? rawItem.prompt
                        : rawItem.question != null ? rawItem.question
                        : rawItem.word != null ? rawItem.word
                        : rawItem.text != null ? rawItem.text : '';
                    if (norm(out.q) !== norm(q)) drift.push(`${t.id}.${grp.id}#${i} question`);
                    const rawAns = Array.isArray(rawItem.answers) ? rawItem.answers
                        : (rawItem.answer !== undefined ? rawItem.answer : undefined);
                    if (JSON.stringify(out.answer) !== JSON.stringify(rawAns)) {
                        drift.push(`${t.id}.${grp.id}#${i} answer`);
                    }
                    if (Array.isArray(rawItem.options)
                        && JSON.stringify(out.options) !== JSON.stringify(rawItem.options)) {
                        drift.push(`${t.id}.${grp.id}#${i} options`);
                    }
                });
            } else if (Array.isArray(raw.prompts) || Array.isArray(raw.sentences)) {
                const texts = raw.prompts || raw.sentences;
                eq(`T${t.id}.${grp.id}: zipped item count preserved`, grp.items.length, texts.length);
                texts.forEach((text, i) => {
                    checked++;
                    if (norm(grp.items[i].q) !== norm(text)) drift.push(`${t.id}.${grp.id}#${i} prompt`);
                    if (norm(grp.items[i].answer) !== norm((raw.answers || [])[i])) {
                        drift.push(`${t.id}.${grp.id}#${i} zipped answer`);
                    }
                });
            }
        });
    });
    drift.slice(0, 10).forEach((d) => ok(false, `CONTENT DRIFT at ${d}`));
    eq('no question, option or answer was changed', drift.length, 0);
    ok(checked > 400, `${checked} items compared against the source data`);

    /* THE NEWLY-INCLUDED SURFACES, likewise. The fidelity loop above walks
       topic<N>Exercises; topic 3's extra sections and topic 4's fill exercise
       live elsewhere on the topic object and were never compared. They are the
       exact surfaces that went missing, so their content is pinned too. */
    {
        const raws = [];
        TOPICS.forEach((t) => {
            if (t.extraExercises) {
                Object.keys(t.extraExercises).sort().forEach((sec) => {
                    raws.push([t.id, 'extra-' + sec, t.extraExercises[sec]]);
                });
            }
            if (t.topic4FillExercise) raws.push([t.id, 'fill', t.topic4FillExercise]);
        });
        ok(raws.length >= 5, `${raws.length} extra/fill surfaces to compare`);
        let compared = 0, drift2 = [];
        raws.forEach(([tid, gid, raw]) => {
            const grp = MAP[tid].find((x) => x.id === gid);
            ok(!!grp, `T${tid}.${gid}: present in the mapped groups`);
            if (!grp) return;
            const texts = raw.items || raw.questions || raw.prompts || raw.sentences || [];
            eq(`T${tid}.${gid}: item count preserved`, grp.items.length, texts.length);
            texts.forEach((rawItem, i) => {
                compared++;
                const out = grp.items[i];
                if (typeof rawItem === 'object') {
                    const q = rawItem.prompt != null ? rawItem.prompt
                        : rawItem.question != null ? rawItem.question
                        : rawItem.word != null ? rawItem.word
                        : rawItem.text != null ? rawItem.text : '';
                    if (String(out.q) !== String(q)) drift2.push(`${tid}.${gid}#${i} question`);
                    const a = Array.isArray(rawItem.answers) ? rawItem.answers
                        : (rawItem.answer !== undefined ? rawItem.answer : undefined);
                    if (JSON.stringify(out.answer) !== JSON.stringify(a)) {
                        drift2.push(`${tid}.${gid}#${i} answer`);
                    }
                } else {
                    /* parallel arrays: the text and its answer by index */
                    if (String(out.q) !== String(rawItem)) drift2.push(`${tid}.${gid}#${i} text`);
                    const a = (raw.answers || [])[i];
                    if (String(out.answer) !== String(a)) drift2.push(`${tid}.${gid}#${i} zipped answer`);
                }
            });
        });
        drift2.slice(0, 10).forEach((d) => ok(false, `CONTENT DRIFT at ${d}`));
        eq('no extra/fill question or answer was changed', drift2.length, 0);
        ok(compared >= 100, `${compared} extra/fill items compared against the source`);
    }

    /* the legacy quiz, likewise */
    TOPICS.filter((t) => !Object.keys(t).some((k) => /^topic\d+Exercises$/.test(k)) && t.quiz)
        .forEach((t) => {
            const q = t.quiz;
            const mc = MAP[t.id].find((x) => x.id === 'mc');
            if (mc) {
                eq(`T${t.id}: mc count preserved`, mc.items.length, q.mcQuestions.length);
                mc.items.forEach((it, i) => {
                    eq(`T${t.id}.mc#${i + 1}: question preserved`, it.q, String(q.mcQuestions[i]));
                    eq(`T${t.id}.mc#${i + 1}: options preserved`,
                        JSON.stringify(it.options), JSON.stringify(q.mcOptions[i]));
                    /* mcAnswers holds an INDEX on this page; the option text it
                       points at must be what the learner is graded against. */
                    const a = q.mcAnswers[i];
                    const wanted = typeof a === 'number' ? q.mcOptions[i][a] : a;
                    eq(`T${t.id}.mc#${i + 1}: the correct option is carried across`, it.answer, wanted);
                    ok(it.options.includes(it.answer),
                        `T${t.id}.mc#${i + 1}: and it is one of the offered options`);
                });
            }
            const bl = MAP[t.id].find((x) => x.id === 'blank');
            if (bl) {
                eq(`T${t.id}: blank count preserved`, bl.items.length, q.blankQuestions.length);
                bl.items.forEach((it, i) => {
                    eq(`T${t.id}.blank#${i + 1}: question preserved`, it.q, String(q.blankQuestions[i]));
                    eq(`T${t.id}.blank#${i + 1}: answer preserved`, it.answer, q.blankAnswers[i]);
                });
            }
        });
}

/* ================================================================ *
 * 3. ANSWERABILITY — every scored item can actually be answered
 * ================================================================ */
{
    const UI = (() => {
        const d = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
        d.window.eval(read('shared-normalizer.js'));
        d.window.eval(read('sentence-builder.js'));
        d.window.eval(read('course-exercise-ui.js'));
        return d.window.UzExerciseUI;
    })();
    ok(!!UI && typeof UI.matchItem === 'function', 'the shared matcher is available');

    let scored = 0, open = 0, unreachable = [];
    Object.entries(MAP).forEach(([tid, groups]) => {
        groups.forEach((grp) => grp.items.forEach((it, i) => {
            /* openness is OBSERVED through the engine, never re-implemented */
            if (UI.matchItem(it, 'зззz яяяy ююю')) { open++; return; }
            scored++;
            const accepted = Array.isArray(it.answer) ? it.answer : [it.answer];
            if (!accepted.some((a) => UI.matchItem(it, a))) {
                unreachable.push(`T${tid}.${grp.id}#${i + 1}: its own key is not accepted`);
            }
            if (Array.isArray(it.options) && it.options.length
                && !it.options.some((o) => UI.matchItem(it, o))) {
                unreachable.push(`T${tid}.${grp.id}#${i + 1}: no offered option is accepted`);
            }
        }));
    });
    unreachable.slice(0, 10).forEach((u) => ok(false, u));
    eq('every scored A1 item is answerable', unreachable.length, 0);
    ok(scored > 300, `${scored} scored items · ${open} open prompts`);
    console.log(`  ${scored} scored · ${open} open (existing open-answer policy, unchanged)`);
}

/* ================================================================ *
 * 4. THE PER-GROUP GATE, DRIVEN THROUGH THE REAL ADAPTER
 * ================================================================ */
{
    const ENGINE = read('exercise-session.js');
    function play(groups, answerPlan) {
        const dom = new JSDOM('<!doctype html><body><div id="m"></div></body>',
            { runScripts: 'outside-only', pretendToBeVisual: true });
        const w = dom.window;
        w.HTMLElement.prototype.scrollIntoView = function () {};
        w.eval(ENGINE);
        w.__g = JSON.parse(JSON.stringify(groups));
        w.__pass = A1.PASS_PERCENT;
        w.eval(`
            UzExerciseSession.mount({
                mountEl: document.getElementById('m'),
                groups: window.__g, passScore: window.__pass,
                renderGroup: function (g) {
                    return (g.items || []).map(function (it, i) {
                        return '<input data-k="' + g.id + '-' + i + '">';
                    }).join('');
                },
                readAnswer: function (root, key) {
                    var e = root.querySelector('[data-k="' + key + '"]'); return e ? e.value : '';
                },
                writeAnswer: function (root, key, v) {
                    var e = root.querySelector('[data-k="' + key + '"]');
                    if (e) e.value = v == null ? '' : v;
                },
                matchItem: function (item, given) {
                    var a = Array.isArray(item.answer) ? item.answer : [item.answer];
                    return a.some(function (x) { return String(x) === String(given); });
                },
                renderSummary: function () { return '<div></div>'; },
                draft: { save: function () {}, load: function () { return null; }, clear: function () {} },
                finish: function (r) { window.__fin = r; }
            });
        `);
        const open = w.document.querySelector('.uz-practice button');
        if (open) open.dispatchEvent(new w.Event('click', { bubbles: true }));
        const sess = () => w.eval('UzExerciseSession.current()');
        const act = (n) => w.document.querySelector('.uz-foot [data-uz-act="' + n + '"]');
        const click = (n) => { const b = act(n); if (b) b.dispatchEvent(new w.Event('click', { bubbles: true })); return !!b; };
        const check = () => {
            const b = w.document.querySelector('.uz-foot [data-uz-act="check"]');
            if (b) b.dispatchEvent(new w.Event('click', { bubbles: true }));
        };
        const answer = (gi, correct) => {
            const grp = w.__g[gi];
            grp.items.forEach((it, i) => {
                const el = w.document.querySelector('[data-k="' + grp.id + '-' + i + '"]');
                if (!el) return;
                const a = Array.isArray(it.answer) ? it.answer[0] : it.answer;
                el.value = (i < correct) ? String(a) : 'ZZZ-wrong';
            });
        };
        const out = answerPlan({ w, sess, act, click, check, answer });
        w.close();
        return out;
    }

    /* THE BOUNDARY, on a real A1 group */
    const t7 = MAP[7];
    const first = t7[0];
    const n = first.items.length;
    ok(n >= 5, `T7.${first.id} has ${n} items to gate on`);
    const need = Math.ceil(n * 0.8);
    [[need - 1, false], [need, true], [n, true], [0, false]].forEach(([correct, want]) => {
        const r = play([first], ({ sess, act, check, answer }) => {
            answer(0, correct); check();
            return { passed: (sess().checked[first.id] || {}).passed, retry: !!act('retry') };
        });
        eq(`T7.${first.id}: ${correct}/${n} -> ${want ? 'PASS' : 'FAIL'}`, r.passed, want);
        eq(`  and the retry offer matches`, r.retry, !want);
    });

    /* THE ACCEPTANCE CASE. Three perfect exercises must NOT pay for a bad one. */
    {
        const groups = MAP[8].slice(0, 4).map((x) => JSON.parse(JSON.stringify(x)));
        ok(groups.length === 4, 'T8 offers four groups for the acceptance case');
        const r = play(groups, ({ sess, act, click, check, answer }) => {
            /* three perfect */
            for (let i = 0; i < 3; i++) { answer(i, groups[i].items.length); check(); click('next'); }
            /* then half of the fourth */
            answer(3, Math.floor(groups[3].items.length / 2));
            check();
            return {
                cursor: sess().cursor,
                fourth: (sess().checked[groups[3].id] || {}).passed,
                earlier: groups.slice(0, 3).every((x) => sess().checked[x.id].passed !== false),
                hasNext: !!act('next'), hasRetry: !!act('retry')
            };
        });
        eq('acceptance: the first three exercises passed', r.earlier, true);
        eq('acceptance: the fourth FAILS at half marks', r.fourth, false);
        eq('acceptance: there is NO way forward', r.hasNext, false);
        eq('acceptance: a retry is offered instead', r.hasRetry, true);
        eq('acceptance: the learner stays on the fourth exercise', r.cursor, 3);
        ok(true, 'a topic-wide gate would have let this through — this one does not');
    }

    /* RETRY IS GROUP-LOCAL */
    {
        const groups = MAP[8].slice(0, 3).map((x) => JSON.parse(JSON.stringify(x)));
        const r = play(groups, ({ sess, click, check, answer }) => {
            answer(0, groups[0].items.length); check(); click('next');
            answer(1, groups[1].items.length); check(); click('next');
            answer(2, 1); check();
            const before = JSON.stringify(sess().checked[groups[0].id]);
            click('retry');
            return {
                cursor: sess().cursor,
                firstIntact: JSON.stringify(sess().checked[groups[0].id]) === before,
                secondIntact: !!sess().checked[groups[1].id],
                thirdCleared: sess().checked[groups[2].id] === undefined,
                firstAnswersKept: Object.keys(sess().answers)
                    .filter((k) => k.indexOf(groups[0].id + '-') === 0).length,
                thirdAnswersCleared: Object.keys(sess().answers)
                    .filter((k) => k.indexOf(groups[2].id + '-') === 0).length
            };
        });
        eq('retry stays on the failed exercise', r.cursor, 2);
        eq('the first exercise result is untouched', r.firstIntact, true);
        eq('the second exercise result is untouched', r.secondIntact, true);
        eq('the failed exercise score is cleared', r.thirdCleared, true);
        ok(r.firstAnswersKept > 0, 'the first exercise answers survive');
        eq('the failed exercise answers are cleared', r.thirdAnswersCleared, 0);
    }
    console.log('  gate driven on real A1 groups · acceptance case blocked · retry group-local');
}

/* ================================================================ *
 * 5. DRAFT IDENTITY AND SCHEMA SAFETY
 * ================================================================ */
{
    const k = A1.draftKey('u1', 5);
    ok(k.includes('u1'), 'the draft key carries the uid');
    ok(k.includes(':A1:'), 'and the course');
    ok(k.includes(':5:'), 'and the topic');
    ok(/v\d+$/.test(k), 'and a version');
    /* isolation */
    ok(A1.draftKey('u1', 5) !== A1.draftKey('u2', 5), 'two users get different keys');
    ok(A1.draftKey('u1', 5) !== A1.draftKey('u1', 6), 'two topics get different keys');
    ok(A1.draftKey('u1', 5) !== 'uzdarus:exercise-draft:u1:A2:5:v2',
        'and A1 cannot collide with A2');
    eq('a guest gets its own key', A1.draftKey(null, 5).includes('guest'), true);

    /* fingerprint changes when the lesson changes */
    const fp = A1.fingerprint(MAP[6], 6);
    ok(!!fp && fp.startsWith('v2:'), `a fingerprint is produced (${fp.slice(0, 40)}…)`);
    eq('the same groups fingerprint the same', A1.fingerprint(MAP[6], 6), fp);
    const fewer = MAP[6].slice(0, MAP[6].length - 1);
    ok(A1.fingerprint(fewer, 6) !== fp, 'removing a group changes the fingerprint');
    const renamed = MAP[6].map((x, i) => (i === 0 ? { ...x, id: 'zzz' } : x));
    ok(A1.fingerprint(renamed, 6) !== fp, 'renaming a group changes the fingerprint');
    const shorter = MAP[6].map((x, i) => (i === 0 ? { ...x, items: x.items.slice(1) } : x));
    ok(A1.fingerprint(shorter, 6) !== fp, 'removing an item changes the fingerprint');
    /* every topic has a distinct fingerprint, so a draft cannot cross topics */
    const fps = Object.entries(MAP).map(([tid, gs]) => A1.fingerprint(gs, tid));
    eq('every topic fingerprints distinctly', new Set(fps).size, 12);
    ok(A1.fingerprint(MAP[1], 1) !== A1.fingerprint(MAP[2], 2),
        'topics 1 and 2 differ despite identical shapes');
}

/* ================================================================ *
 * 6. THE REAL PAGE MOUNTS THE REAL GATE
 * ---------------------------------------------------------------- *
 * Everything above proves the ADAPTER is right. This proves the PAGE
 * uses it — the distinction that mattered when A1, A2 and B1 all had a
 * shared engine available and none of them configured a threshold.
 * ================================================================ */
{
    const page = read('paid-courses/a1-course.html');

    /* the shared stack is actually loaded */
    ['exercise-session.js', 'course-exercise-ui.js', 'a1-host.js'].forEach((f) => {
        ok(new RegExp(f.replace('.', '\\.')).test(page), `the page loads ${f}`);
    });

    /* EVERY TOPIC ROUTES THROUGH THE SHARED MOUNT — EXECUTED, NOT MATCHED.

       The previous version of this check asked, for each topic n, whether the
       source contained `mountA1Practice(n)` OR `mountA1Practice(topicId)`. The
       alternation made it a false positive: a single generic call written for
       one topic satisfied the assertion for all twelve, and topics 1-4 were
       reported as covered while they still rendered the old ungated quiz.

       The loader table is now RUN. Each entry is invoked and the topic id it
       actually passes to mountA1Practice is recorded, so a topic that stops
       routing — or routes as the wrong topic — fails on its own. */
    ok(/function mountA1Practice\(/.test(page), 'the page defines the shared mount');
    ok(/A1Host\.mountPractice\(/.test(page), 'which calls into the host');
    {
        const at = page.indexOf('const EXERCISE_TOPIC_LOADERS');
        ok(at > 0, 'the loader table exists');
        const table = page.slice(at, page.indexOf('};', at) + 2);

        const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
        const w = dom.window;
        w.eval(`
            window.__mounted = [];
            window.__fellBack = [];
            function mountA1Practice(id) { window.__mounted.push(id); return true; }
            function loadQuiz(id) { window.__fellBack.push(id); }
            [5,6,7,8,9,10,11,12].forEach(function (n) {
                window['loadTopic' + n + 'Exercises'] = function (id) { window.__fellBack.push(id); };
            });
            ${table}
            window.__table = EXERCISE_TOPIC_LOADERS;
        `);

        const ids = Object.keys(w.__table).map(Number).sort((a, b) => a - b);
        eq('every topic 1-12 is in the loader table',
            ids.join(','), Array.from({ length: 12 }, (_, i) => i + 1).join(','));

        for (let n = 1; n <= 12; n++) {
            w.__mounted.length = 0;
            w.__fellBack.length = 0;
            w.__table[n]();
            eq(`topic ${n}: the dispatcher calls the shared mount exactly once`,
                w.__mounted.length, 1);
            eq(`topic ${n}: and passes ITS OWN id`, w.__mounted[0], n);
            eq(`topic ${n}: the legacy renderer is not used when the mount succeeds`,
                w.__fellBack.length, 0);
        }

        /* and when the shared stack is absent the legacy path still runs, so a
           learner is never left with a blank exercise section */
        const dom2 = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
        const w2 = dom2.window;
        w2.eval(`
            window.__fellBack = [];
            function mountA1Practice() { return false; }
            function loadQuiz(id) { window.__fellBack.push(id); }
            [5,6,7,8,9,10,11,12].forEach(function (n) {
                window['loadTopic' + n + 'Exercises'] = function (id) { window.__fellBack.push(id); };
            });
            ${table}
            window.__table = EXERCISE_TOPIC_LOADERS;
        `);
        for (let n = 1; n <= 12; n++) {
            w2.__fellBack.length = 0;
            w2.__table[n]();
            eq(`topic ${n}: falls back to its legacy renderer if the stack is missing`,
                w2.__fellBack.join(','), String(n));
        }
        dom.window.close(); dom2.window.close();

        /* THE FALSE-POSITIVE SHAPE MUST NOT COME BACK. A generic call IN THE
           TABLE would make one entry satisfy every topic again — that is the
           defect that hid topics 1-4. The check is scoped to the table, not
           to the file: re-rendering the section after a state change is a
           legitimate mountA1Practice(topicId), and forbidding it everywhere
           would only push that re-render into a worse shape. */
        const genericCalls = table.split('\n').filter((l) => {
            const t = l.trim();
            if (!/mountA1Practice\(topicId\)/.test(l)) return false;
            return !(t.startsWith('*') || t.startsWith('/*') || t.startsWith('//'));
        });
        eq('no generic mountA1Practice(topicId) call exists in the dispatch table',
            genericCalls.length, 0);
        /* and every DISPATCH entry still names its own topic explicitly */
        eq('the table dispatches by literal topic id only',
            (table.match(/mountA1Practice\((\d+)\)/g) || []).length, 12);
        for (let n = 1; n <= 12; n++) {
            ok(new RegExp(`${n}: \\(\\) => mountA1Practice\\(${n}\\)`).test(table),
                `topic ${n} has its OWN explicit table entry`);
        }
    }

    /* and the host supplies the platform threshold, per exercise */
    const host = read('a1-host.js');
    ok(/passScore: PASS_PERCENT/.test(host), 'the host gates every mount');
    eq('with the platform threshold', (host.match(/var PASS_PERCENT = (\d+);/) || [])[1], '80');
    eq('declared exactly once', (host.match(/var PASS_PERCENT = \d+;/g) || []).length, 1);
    eq('and every mount site carries it',
        (host.match(/passScore:/g) || []).length, (host.match(/mountEl:/g) || []).length);

    /* THE TOPIC-WIDE GATE NO LONGER DECIDES ADVANCEMENT. It may still render
       the historical results panel, but the learner's path through the
       exercises is the session's. */
    ok(/__uzFinalizeExerciseTopic/.test(page), 'the legacy finalizer still exists for its panel');
    {
        const at = page.indexOf('const EXERCISE_TOPIC_LOADERS');
        const block_ = page.slice(at, page.indexOf('};', at));
        eq('but the exercise loaders no longer call it directly',
            /__uzFinalizeExerciseTopic/.test(block_), false);
        ok(/mountA1Practice/.test(block_), 'they mount the session instead');
    }

    /* the draft the page asks for is user- and topic-scoped */
    ok(/uid: uid/.test(page), 'the mount is given the current uid');
    ok(/uzdarus:exercise-draft:/.test(host), 'and the host scopes the draft key');
    /* A DRAFT IS LOCAL RESUME STATE, NEVER PROGRESSION. The host as a whole
       legitimately names completedTopics — that is the SERVER ACK the
       completion pipeline reads back. What must stay clean is the draft
       BLOCK itself, so scope the check there instead of to the file. */
    {
        const at = host.indexOf('draft: {');
        ok(at > 0, 'the host declares a draft block');
        const end = host.indexOf('clear: function ()', at);
        const draftBlock = host.slice(at, host.indexOf('}', end));
        eq('the draft block never carries progression',
            /completedTopics|topicComponents|finalExamPassed/.test(draftBlock), false);
    }
}

/* ================================================================ *
 * 7. THE DRAFT ITSELF, DRIVEN
 * ---------------------------------------------------------------- *
 * §5 proves the KEY and the FINGERPRINT are well formed. That is not the
 * same as proving the load path CONSULTS them — a draft.load() that
 * skipped the fingerprint check would replay a learner's answers into a
 * lesson whose questions had changed underneath them, and a key-shape
 * test would never notice.
 * ================================================================ */
{
    /* capture the cfg the host hands the engine, without a real session */
    function captureCfg(topic, uid, store) {
        const g2 = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
        let captured = null;
        g2.UzExerciseSession = { mount: (cfg) => { captured = cfg; return {}; } };
        g2.UzExerciseUI = {
            renderGroup: () => '', bindGroup() {}, readAnswer: () => '',
            writeAnswer() {}, matchItem: () => false, afterCheck() {}
        };
        new Function('window', HOSTSRC)(g2);
        g2.A1Host.mountPractice({ topic, mountEl: {}, uid, draftStore: store });
        return captured;
    }
    const mkStore = () => { const m = {}; return {
        get: (k) => (k in m ? m[k] : null), set: (k, v) => { m[k] = v; },
        remove: (k) => { delete m[k]; } }; };
    const store = mkStore();

    const t6 = TOPICS.find((t) => t.id === 6);
    const cfg = captureCfg(t6, 'u1', store);
    ok(!!cfg, 'the host mounts and hands the engine a config');
    eq('with the platform threshold', cfg.passScore, 80);
    ok(cfg.draft && typeof cfg.draft.load === 'function', 'and a draft with load/save/clear');

    cfg.draft.save({ v: 1, cursor: 2, answers: { 'exercise1-0': 'x' },
                     checked: { exercise1: { correct: 9, total: 10, passed: true } } });
    const back = cfg.draft.load();
    ok(!!back, 'a freshly saved draft loads back');
    eq('  the cursor survives', back.cursor, 2);
    eq('  the answers survive', back.answers['exercise1-0'], 'x');
    eq('  the passed group survives', back.checked.exercise1.passed, true);

    /* A STALE FINGERPRINT IS REFUSED. */
    {
        const key = A1.draftKey('u1', 6);
        const raw = JSON.parse(store.get(key));
        store.set(key, JSON.stringify(Object.assign({}, raw, { fingerprint: 'v2:t6:exercise1:999' })));
        eq('a draft whose lesson structure changed is REFUSED', cfg.draft.load(), null);
        store.set(key, JSON.stringify(Object.assign({}, raw, { fingerprint: 'v1:whatever' })));
        eq('and so is one from an older draft version', cfg.draft.load(), null);
        store.set(key, JSON.stringify(raw));
        ok(!!cfg.draft.load(), 'the correct fingerprint still loads');

        /* A DRAFT FROM ANOTHER COURSE OR TOPIC IS REFUSED. */
        store.set(key, JSON.stringify(Object.assign({}, raw, { course: 'A2' })));
        eq('a draft tagged for another COURSE is refused', cfg.draft.load(), null);
        store.set(key, JSON.stringify(Object.assign({}, raw, { topicId: 7 })));
        eq('a draft tagged for another TOPIC is refused', cfg.draft.load(), null);
        store.set(key, JSON.stringify(raw));
        ok(!!cfg.draft.load(), 'and the matching one still loads');

        store.set(key, '{not json');
        eq('malformed JSON is refused, not thrown', cfg.draft.load(), null);
        store.set(key, 'null');
        eq('a null draft is refused', cfg.draft.load(), null);
        store.remove(key);
        eq('no draft at all is refused', cfg.draft.load(), null);
    }

    /* USER AND TOPIC ISOLATION, through the real load path */
    {
        const shared = mkStore();
        const a = captureCfg(t6, 'userA', shared);
        a.draft.save({ v: 1, cursor: 3, answers: { 'exercise1-0': 'secret' }, checked: {} });
        const b = captureCfg(t6, 'userB', shared);
        eq("user B cannot see user A's draft", b.draft.load(), null);
        const t7cfg = captureCfg(TOPICS.find((t) => t.id === 7), 'userA', shared);
        eq('the same user cannot see it on another topic', t7cfg.draft.load(), null);
        ok(!!a.draft.load(), 'while the owner still sees it');
        a.draft.clear();
        eq('clear removes it', a.draft.load(), null);
    }

    /* THE DRAFT IS NOT PROGRESSION */
    {
        const key = A1.draftKey('u1', 6);
        cfg.draft.save({ v: 1, cursor: 0, answers: {}, checked: {} });
        const stored = JSON.parse(store.get(key));
        eq('the stored draft carries no completedTopics', 'completedTopics' in stored, false);
        eq('and no component flags', 'topicComponents' in stored, false);
        ok('fingerprint' in stored && 'course' in stored && 'topicId' in stored,
            'but it does carry what identifies the lesson');
    }
}

/* ================================================================ *
 * 8. GROUP TYPING
 * ---------------------------------------------------------------- *
 * A group is a CHOICE group only when EVERY item offers options. A group
 * with one option-less item typed as choice would render that item as a
 * chooser with nothing to choose, making it unanswerable.
 * ================================================================ */
{
    const allOpts = A1.normaliseGroup('g', { title: 't', items: [
        { prompt: 'a', options: ['1', '2'], answer: '1' },
        { prompt: 'b', options: ['3', '4'], answer: '3' }] });
    eq('a group whose items all offer options is a choice group', allOpts.type, 'choice');

    const mixed = A1.normaliseGroup('g', { title: 't', items: [
        { prompt: 'a', options: ['1', '2'], answer: '1' },
        { prompt: 'b', answer: 'typed' }] });
    eq('a MIXED group is NOT a choice group', mixed.type, undefined);
    ok(true, 'so its option-less item stays answerable as an input');

    const noOpts = A1.normaliseGroup('g', { title: 't', items: [{ prompt: 'a', answer: 'x' }] });
    eq('a group with no options at all is an input group', noOpts.type, undefined);

    let mixedFound = 0;
    Object.entries(MAP).forEach(([tid, groups]) => groups.forEach((grp) => {
        const withOpts = grp.items.filter((it) => Array.isArray(it.options) && it.options.length).length;
        if (withOpts > 0 && withOpts < grp.items.length) {
            mixedFound++;
            eq(`T${tid}.${grp.id}: mixed group is not typed choice`, grp.type, undefined);
        }
        if (grp.type === 'choice') {
            eq(`T${tid}.${grp.id}: a choice group offers options on every item`,
                grp.items.every((it) => Array.isArray(it.options) && it.options.length), true);
        }
    }));
    ok(true, `${mixedFound} mixed groups in the real A1 data`);
}

console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ A1 EXERCISE ENGINE: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ A1 EXERCISE ENGINE: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
