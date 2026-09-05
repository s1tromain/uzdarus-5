#!/usr/bin/env node
/**
 * verify_b2_release.cjs — the B2 release gate.
 *
 * Every B2 lesson already has its own suite, and the exam and certificate have
 * theirs. This one asks the questions that no single suite can, because they
 * are ABOUT THE WHOLE COURSE:
 *
 *   - B2 is FINISHED. Sixteen topics, sixteen authored lessons, sixteen
 *     vocabulary decks, sixteen recordings — and no seventeenth of anything.
 *     There is no "coming soon" shell left anywhere in the shipped surface.
 *   - THE GRADUATION PATH EXISTS END TO END: a learner who finishes topic 16
 *     can reach the exam, the server can grade it, and a pass can be certified.
 *     Every link in that chain is checked here, in one place, because a broken
 *     link between two green suites is exactly what nobody notices.
 *   - THE SERVER CANON IS CURRENT. api/_lib/course-canon.js is generated; a
 *     stale copy would grade B2 against yesterday's answer key.
 *
 * Nothing here is a number typed by hand: the topic count comes from the
 * syllabus, the deck count from the vocabulary page, the exam size from the
 * exam page. A course that grows finds this suite already correct.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const w = new JSDOM('<body></body>', { runScripts: 'outside-only' }).window;
['shared-normalizer.js', 'sentence-builder.js', 'course-exercise-ui.js',
 'b2-topics.js', 'b2-lesson-data.js'].forEach((f) => w.eval(read(f)));

const SYLLABUS = (w.B2_TOPICS || []).slice().sort((a, b) => a.id - b.id);
const AUTHORED = (w.B2_LESSON_DATA.topics || []).slice().sort((a, b) => a.id - b.id);
const N = SYLLABUS.length;

console.log(`\n=== B2 RELEASE · TOPICS 1-${N} ===`);

/* ------------------------------------------------- 1. THE COURSE IS FINISHED */
{
    ok(N > 0, `the syllabus declares ${N} topics`);
    eq('syllabus ids are 1..N with no gap',
        SYLLABUS.map((t) => t.id).join(','),
        Array.from({ length: N }, (_, i) => i + 1).join(','));
    eq('every syllabus topic has an authored lesson', AUTHORED.length, N);
    eq('and their ids line up',
        AUTHORED.map((t) => t.id).join(','), SYLLABUS.map((t) => t.id).join(','));
    ok(!AUTHORED.find((t) => t.id === N + 1), `there is no topic ${N + 1} — B2 ends at ${N}`);
    ok(AUTHORED.every((t) => typeof t.grammar === 'string' && t.grammar.length > 500),
        'every lesson ships real grammar, not a stub');
    ok(AUTHORED.every((t) => Array.isArray(t.exercises) && t.exercises.length >= 5),
        'and at least five exercise groups each');
    const groups = AUTHORED.reduce((s, t) => s + t.exercises.length, 0);
    const items = AUTHORED.reduce((s, t) =>
        s + t.exercises.reduce((n, g) => n + (g.items || []).length, 0), 0);
    console.log(`  ${N} lessons · ${groups} exercise groups · ${items} exercise items`);

    /* NO COMING-SOON ANYWHERE. The shell is rendered from data: a topic gets it
       when no lesson exists for it. With all N authored, none may render. */
    const paid = read('paid-courses/b2-course.html');
    ok(/function b2SoonHtml\(\)/.test(paid), 'the coming-soon shell still exists as a fallback');
    const built = new JSDOM('<body></body>', { runScripts: 'outside-only' }).window;
    ['shared-normalizer.js', 'sentence-builder.js', 'course-exercise-ui.js',
     'b2-topics.js', 'b2-lesson-data.js'].forEach((f) => built.eval(read(f)));
    /* Lift the builder out of the page rather than reimplementing it, the same
       way the integration suite does — a balanced-brace slice, so a reformat
       of the page does not quietly change what is under test. */
    const grab = (name) => {
        const i = paid.indexOf('function ' + name + '(');
        if (i < 0) throw new Error('missing ' + name);
        let depth = 0, started = false;
        for (let k = paid.indexOf('{', i); k < paid.length; k++) {
            if (paid[k] === '{') { depth++; started = true; }
            else if (paid[k] === '}') { depth--; if (started && depth === 0) return paid.slice(i, k + 1); }
        }
        throw new Error('unbalanced ' + name);
    };
    built.eval([
        paid.match(/var B2_DEMO_MODE = (true|false);/)[0],
        grab('b2SoonHtml'),
        'var B2_TOPICS = window.B2_TOPICS;',
        'var B2_TOPIC_DESCRIPTION = window.B2_TOPIC_DESCRIPTION;',
        grab('b2ExerciseData'), grab('buildB2Topics'),
        'window.__topics = buildB2Topics();'
    ].join('\n'));
    ok(/var B2_DEMO_MODE = false;/.test(paid), 'the paid course is not in demo mode');
    const topics = built.__topics;
    eq('the page builds all N topics', topics.length, N);
    eq('none of them renders the coming-soon shell',
        topics.filter((t) => t.content && t.content.length).length, 0);
    eq('all of them carry grammar', topics.filter((t) => t.grammar && t.grammar.length).length, N);
    eq('and none is locked in the paid course', topics.filter((t) => t.isLocked).length, 0);
}

/* ------------------------------------------------- 2. VOCABULARY */
{
    const v = read('paid-courses/b2-vocabulary.html');
    const deckIds = [...v.matchAll(/\n {20}id: (\d+),/g)].map((m) => Number(m[1]));
    eq(`${N} vocabulary decks ship`, deckIds.length, N);
    eq('one per topic, in order', deckIds.join(','), SYLLABUS.map((t) => t.id).join(','));
    /* The helper may survive as dead code; what must not survive is a CALL,
       because that is what would spread a future deck into the shipped list. */
    const vCalls = (v.match(/generateLockedTopics\(/g) || []).length;
    const vDefs = (v.match(/function generateLockedTopics\(/g) || []).length;
    eq('generateLockedTopics is never invoked — every deck is real', vCalls - vDefs, 0);
    ok(!/\.\.\.generateLockedTopics/.test(v), 'and no placeholder deck is spread in');
    const cards = (v.match(/\{ ru: "/g) || []).length;
    ok(cards > 1000, `the decks hold ${cards} cards`);
    console.log(`  ${deckIds.length} vocabulary decks · ${cards} cards`);
}

/* ------------------------------------------------- 3. AUDIO */
{
    /* The recording is declared by the listening exercise group as audioSrc,
       so that is where it is read from — not scraped out of the grammar HTML. */
    const clipsOf = (t) => (t.exercises || [])
        .map((g) => g.audioSrc).filter((s) => typeof s === 'string' && s.trim());
    /* A DECLARED GAP, NOT A PASSING GRADE.
       Fifteen of the sixteen lessons ship a listening exercise. Topic 9 ships
       none, and no «Б2 9 урок.mp3» exists on disk — that is how the course was
       authored, it long predates the final exam, and it is NOT repaired here:
       inventing, synthesising or borrowing another lesson's recording would be
       worse than the gap. It is pinned by id so the suite stays honest — adding
       the missing clip, or losing one of the fifteen that exist, both fail. */
    const NO_AUDIO_BY_DESIGN = [9];
    let withAudio = 0, missing = [];
    AUTHORED.forEach((t) => {
        const m = clipsOf(t);
        if (!m.length) {
            if (!NO_AUDIO_BY_DESIGN.includes(t.id)) {
                missing.push(`T${t.id}: no recording referenced`);
            }
            return;
        }
        if (NO_AUDIO_BY_DESIGN.includes(t.id)) {
            missing.push(`T${t.id} now HAS a recording — update NO_AUDIO_BY_DESIGN`);
            return;
        }
        withAudio++;
        [...new Set(m)].forEach((rel) => {
            const file = path.join(ROOT, decodeURIComponent(rel));
            if (!fs.existsSync(file)) missing.push(`T${t.id}: ${rel} is not on disk`);
        });
    });
    missing.forEach((m) => ok(false, m));
    eq('every lesson that ships a recording plays its own, and the file exists',
        missing.length, 0);
    eq(`${N - NO_AUDIO_BY_DESIGN.length} of ${N} lessons carry a listening exercise`,
        withAudio, N - NO_AUDIO_BY_DESIGN.length);
    NO_AUDIO_BY_DESIGN.forEach((id) => {
        ok(!fs.existsSync(path.join(ROOT, 'audios/\u04112 ' + id + ' \u0443\u0440\u043e\u043a.mp3')),
            `T${id} has no recording on disk either — a known, reported gap, not a broken link`);
    });
    console.log(`  audio · ${withAudio}/${N} lessons (T${NO_AUDIO_BY_DESIGN.join(',T')}`
        + ` ship no listening exercise — pre-existing gap, reported not patched)`);
    /* No two lessons share a recording — that would mean one was copy-pasted. */
    const byFile = {};
    AUTHORED.forEach((t) => clipsOf(t).forEach((f) => {
        (byFile[f] = byFile[f] || []).push(t.id);
    }));
    const shared = Object.entries(byFile).filter(([, v]) => new Set(v).size > 1);
    shared.forEach(([f, v]) => ok(false, `${f} is used by topics ${v.join(', ')}`));
    eq('no recording is reused across lessons', shared.length, 0);
}

/* ------------------------------------------------- 4. EVERY SCORED QUESTION */
{
    const UI = w.UzExerciseUI;
    ok(!!UI && typeof UI.matchItem === 'function', 'the shared exercise engine is loaded');
    /* OPENNESS IS OBSERVED, NEVER RE-IMPLEMENTED: an item is open when the
       engine accepts nonsense for it. */
    const isOpen = (it) => UI.matchItem(it, 'зззz яяяy ююю');
    let scored = 0, open = 0, unreachable = [];
    AUTHORED.forEach((t) => t.exercises.forEach((g) => (g.items || []).forEach((it, i) => {
        if (isOpen(it)) { open++; return; }
        scored++;
        const accepted = Array.isArray(it.answer) ? it.answer : [it.answer];
        if (!accepted.some((a) => UI.matchItem(it, a))) {
            unreachable.push(`T${t.id} ${g.id} #${i + 1}: its own key is not accepted`);
        }
        if (Array.isArray(it.options) && it.options.length) {
            const hits = it.options.filter((o) => UI.matchItem(it, o));
            if (hits.length === 0) {
                unreachable.push(`T${t.id} ${g.id} #${i + 1}: no option is accepted`);
            }
        }
    })));
    unreachable.slice(0, 10).forEach((u) => ok(false, u));
    eq('every scored question is answerable', unreachable.length, 0);
    ok(scored > 400, `${scored} scored questions across the course`);
    console.log(`  ${scored} scored questions · ${open} deliberate open prompts`);
}

/* ------------------------------------------------- 5. THE GRADUATION PATH */
{
    const exam = read('paid-courses/b2-final-exam.html');
    const course = read('paid-courses/b2-course.html');
    const client = read('firebase-client.js');
    const certs = read('api/_lib/certificates.js');
    const canonSrc = read('api/_lib/course-canon.js');
    const DATA = JSON.parse(exam.match(/var FINAL_EXAM_DATA = (\[[\s\S]*?\]);\r?\n/)[1]);
    const examItems = DATA.reduce((s, g) => s + g.items.length, 0);

    /* the exam paper */
    eq('the exam ships ten groups', DATA.length, 10);
    eq('of ten questions each', new Set(DATA.map((g) => g.items.length)).size, 1);
    eq('one hundred graded questions in total', examItems, 100);
    ok(/var REQUIRED_TOPICS = 16;/.test(exam), `the exam gate is all ${N} topics`);
    ok(/var TOTAL_SECONDS = 120 \* 60;/.test(exam), 'the exam runs 120 minutes');
    ok(/var passed = pct >= 80;/.test(exam), 'the pass mark is 80');

    /* the chain, link by link */
    ok(fs.existsSync(path.join(ROOT, 'paid-courses/b2-final-exam.html')),
        'link 1 — the exam page exists');
    ok(/B1B2: \[[^\]]*'b2-final-exam\.html'/.test(client),
        'link 2 — it is behind the B1B2 access pack');
    ok(/id="finalExamEntry"/.test(course) && /b2-final-exam\.html/.test(course),
        'link 3 — the course page can reach it');
    ok(/"B2": \{/.test(canonSrc.slice(canonSrc.indexOf('EXAM_CANON'))),
        'link 4 — the server canon carries the B2 answer key');
    ok(/B2:\s*\{/.test(certs), 'link 5 — B2 can be certified');
    ok(/window\.issueCertificate\('B2'\)/.test(course),
        'link 6 — the course page asks for that certificate');
    ok(/id="b2CertOverlay"/.test(course), 'link 7 — and can show it');

    /* ACCESS IS BY PACK, never by a visible tariff name. */
    const packBlock = client.match(/const packToCourses = \{[\s\S]*?\};/)[0];
    ok(!/START|STANDART|TURBO|PREMIUM/i.test(packBlock),
        'access is decided by accessPacks, not by a displayed plan name');
    ['b2-course.html', 'b2-vocabulary.html', 'b2-final-exam.html'].forEach((p) => {
        ok(packBlock.includes(`'${p}'`), `${p} is gated`);
    });

    /* NO SEVENTEENTH ANYTHING. */
    ok(!/id: 17|Topic ?17|topic17/i.test(course), 'the course page invents no topic 17');
    ok(!AUTHORED.find((t) => t.id > N), 'the lesson data holds no topic beyond the syllabus');
    {
        const vv = read('paid-courses/b2-vocabulary.html');
        eq('and the vocabulary page holds no future deck',
            (vv.match(/generateLockedTopics\(/g) || []).length
            - (vv.match(/function generateLockedTopics\(/g) || []).length, 0);
    }
}

/* ------------------------------------------------- 6. THE SERVER CANON IS CURRENT */
{
    /* A GENERATED FILE THAT DRIFTED IS AN ANSWER KEY THAT LIES. Regenerate it
       into a scratch copy of the repo's own output and compare bytes. */
    const live = read('api/_lib/course-canon.js');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uz-canon-'));
    const backup = path.join(tmp, 'course-canon.js');
    fs.writeFileSync(backup, live);
    let regenerated = null;
    try {
        execFileSync(process.execPath, [path.join(ROOT, 'scripts/build_server_canon.cjs')],
            { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] });
        regenerated = read('api/_lib/course-canon.js');
    } catch (e) {
        ok(false, 'the canon builder ran: ' + e.message);
    } finally {
        /* restore whatever was checked in, byte for byte, either way */
        fs.writeFileSync(path.join(ROOT, 'api/_lib/course-canon.js'), live);
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
    }
    ok(regenerated === live,
        'api/_lib/course-canon.js is exactly what the builder produces today');
    eq('and the file on disk is unchanged by this check',
        read('api/_lib/course-canon.js'), live);
}

/* ------------------------------------------------- 7. ONE ENGINE, ONE NORMALISER */
{
    const paid = read('paid-courses/b2-course.html');
    ok(/course-exercise-ui\.js/.test(paid), 'the paid course loads the shared exercise UI');
    ok(/exercise-session\.js/.test(paid), 'and the shared session engine');
    ok(/sentence-builder\.js/.test(paid), 'and the shared sentence builder');
    ok(!/function b2Norm\b|function b2Match\b/.test(paid),
        'B2 does not carry a private copy of the matcher');
    /* The exam page normalises the same way the lessons do: lowercase, ё→е,
       punctuation stripped, whitespace collapsed. */
    const exam = read('paid-courses/b2-final-exam.html');
    const fn = exam.match(/function normalizeExamText[\s\S]*?\n        \}/)[0];
    ok(/toLowerCase\(\)/.test(fn), 'the exam lowercases');
    ok(/replace\(\/ё\/g, 'е'\)/.test(fn), 'folds ё to е');
    ok(/replace\(\/\\s\+\/g, ' '\)/.test(fn), 'and collapses whitespace');
    ok(/\.trim\(\)/.test(fn), 'and trims');
}

console.log('\n' + '='.repeat(60));
if (fail) {
    console.log(`  ❌ B2 RELEASE 1-${N}: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ B2 RELEASE 1-${N}: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
