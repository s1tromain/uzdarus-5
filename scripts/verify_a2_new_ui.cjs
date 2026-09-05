#!/usr/bin/env node
/**
 * verify_a2_new_ui.cjs — A2 on the shared exercise stack.
 *
 * A2 topics 1-5 now render through the same components as B2. What must NOT
 * change is everything behind the interface, so these tests are aimed squarely
 * at that: the legacy markup still exists with all its hooks, every answer is
 * mirrored back into it, and A2 declares none of B2's progression rules.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) pass++; else { fail++; failures.push(l); } };

const PAGES = [
    { file: 'paid-courses/a2-course.html', label: 'paid', prefix: '../' },
    { file: 'a2-demo.html', label: 'demo', prefix: './' }
];
const MODULES = ['exercise-session.js', 'sentence-builder.js', 'course-exercise-ui.js',
                 'a2-host.js'];

console.log('\n=== A2 ON THE SHARED EXERCISE STACK ===\n');

/* ------------------------------------------------ wiring */
for (const p of PAGES) {
    const s = fs.readFileSync(path.join(ROOT, p.file), 'utf8');
    const T = p.label;
    MODULES.forEach(m => {
        ok(s.includes(`src="${p.prefix}${m}"`), `${T} loads ${m}`);
        ok(s.split(`src="${p.prefix}${m}"`).length === 2, `${T} loads ${m} exactly once`);
        ok(fs.existsSync(path.resolve(path.dirname(path.join(ROOT, p.file)), p.prefix + m)),
            `${T} ${m} resolves on disk`);
    });
    ok(/function mountA2Practice/.test(s), `${T} defines the practice mount`);
    ok(/mountA2Practice\(topicId\);/.test(s), `${T} calls it after the legacy render`);
    ok(/id="a2LegacyBridge"[^>]*style="display:none"/.test(s),
        `${T} the legacy substrate is display:none — it renders nothing`);
    ok(/aria-hidden="true"/.test(s), `${T} the substrate is out of the accessibility tree`);
    ok(/id="a2PracticeMount"/.test(s), `${T} the visible quiz area holds only the practice mount`);
    ok(/id="a2QuizResults"/.test(s), `${T} results container present`);
    ok(!/UzExerciseCards|mountCards/.test(s), `${T} the old card grid is gone`);
    const gsec = (s.match(/\.grammar-section\s*\{[^}]*\}/) || [''])[0];
    ok(!/linear-gradient/.test(gsec), `${T} the blue grammar block is gone`);
    ok(/background:\s*#FFFFFF/.test(gsec), `${T} grammar uses B2's light surface`);
    ok(!/class="b2-vocab-card"/.test(s),
        `${T} the page holds no private vocabulary card markup`);
    ok(/UzExerciseUI\.renderVocabCard/.test(s),
        `${T} the vocabulary card comes from the shared component`);
    ok(/var A2_VOCAB_COUNTS/.test(s), `${T} per-topic word counts are preserved`);

    /* behaviour must be untouched */
    ok(/window\.checkTopic1Exercises = async function/.test(s), `${T} the original scorer is intact`);
    ok(/function renderT1Group/.test(s), `${T} the legacy renderer is intact`);
    ok(/function getT1ExData/.test(s), `${T} the legacy data accessor is intact`);
    ok(!/passScore|stepGate|PASS_PERCENT/.test(s), `${T} no B2 gate was introduced`);
}

/* ------------------------------------------------ shared, not duplicated */
{
    const ui = fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8');
    const a2 = fs.readFileSync(path.join(ROOT, 'a2-host.js'), 'utf8');
    const b2 = fs.readFileSync(path.join(ROOT, 'b2-host.js'), 'utf8');
    ok(/UzExerciseUI/.test(a2) && /UzExerciseUI/.test(b2), 'both hosts use the shared UI');
    ok(!/renderGroup\s*\(g\)\s*\{/.test(a2), 'A2 does not re-implement rendering');
    ok(!/function renderGroup/.test(b2), 'B2 does not re-implement rendering');
    ok(/renderGroup: ui\(\)\.renderGroup/.test(a2), 'A2 renders through the shared layer');
    const bare = ui.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    ok(!/\bA2\b|\bB2\b|A2Host|B2Host/.test(bare), 'the shared layer names no course');
}

/* ------------------------------------------------ runtime, per topic */
{
    const html = fs.readFileSync(path.join(ROOT, 'paid-courses/a2-course.html'), 'utf8');
    const grab = (name) => {
        const i = html.indexOf('function ' + name + '(');
        if (i < 0) return null;
        let d = 0, st = false;
        for (let k = html.indexOf('{', i); k < html.length; k++) {
            if (html[k] === '{') { d++; st = true; }
            else if (html[k] === '}') { d--; if (st && d === 0) return html.slice(i, k + 1); }
        }
        return null;
    };
    const helpers = [...new Set([...html.matchAll(/function\s+(t1[A-Za-z0-9_]*|renderT1[A-Za-z0-9_]*)\s*\(/g)]
        .map(m => m[1]))];

    const exercisesOf = (n) => {
        const i = html.indexOf(`topic${n}Exercises: {`);
        if (i < 0) return null;
        let d = 0, open = html.indexOf('{', i + `topic${n}Exercises:`.length), end = -1;
        for (let k = open; k < html.length; k++) {
            if (html[k] === '{') d++;
            else if (html[k] === '}') { d--; if (d === 0) { end = k; break; } }
        }
        return vm.runInNewContext('(' + html.slice(open, end + 1) + ')', {});
    };

    for (let n = 1; n <= 5; n++) {
        const data = exercisesOf(n);
        ok(!!data && Array.isArray(data.exercises), `topic ${n}: exercise data found`);
        if (!data) continue;
        const groups = data.exercises;

        const dom = new JSDOM('<!doctype html><body><div id="quizSection"></div></body>',
            { runScripts: 'outside-only', pretendToBeVisual: true });
        const w = dom.window;
        w.Element.prototype.scrollIntoView = function () {};
        const errors = [];
        w.console.error = (...a) => errors.push(a.join(' '));
        MODULES.forEach(m => w.eval(fs.readFileSync(path.join(ROOT, m), 'utf8')));
        helpers.forEach(h => { const src = grab(h); if (src) { try { w.eval(src); } catch (e) {} } });

        const qs = w.document.getElementById('quizSection');
        qs.innerHTML = '<div class="t1-wrap">' +
            groups.map(g => w.renderT1Group(g)).join('') + '</div>';

        const expectedItems = groups.reduce((a, g) => a + g.items.length, 0);
        const hooks = qs.querySelectorAll('[data-t1-input],[data-t1-row]').length;
        ok(hooks === expectedItems,
            `topic ${n}: every legacy hook the scorer needs is present (${hooks}/${expectedItems})`);

        const mountEl = w.document.createElement('div');
        qs.appendChild(mountEl);
        const topic = { id: n, exercises: groups };
        const mounted = w.A2Host.mountPractice({
            mountEl, deps: { getTopic: () => topic, getScope: () => qs }
        });
        ok(!!mounted, `topic ${n}: practice card mounts`);
        ok(!w.document.querySelector('.uzc-grid'), `topic ${n}: no exercise grid — B2 model`);
        const openBtn = w.document.querySelector('.uz-practice-btn');
        ok(!!openBtn, `topic ${n}: one practice card with an open button`);

        openBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        const sess = w.UzExerciseSession.current();
        ok(!!sess && sess.cfg.groups.length === groups.length,
            `topic ${n}: the session steps through every exercise (${sess && sess.cfg.groups.length}/${groups.length})`);
        /* A2 NOW ENFORCES THE PLATFORM 80% RULE. This used to assert the
           opposite — that A2 supplied no gate — which is exactly why a learner
           could score 5/10 on one exercise and open the next. Every scored
           group must reach the threshold on its own. */
        ok(sess.cfg.passScore === 80,
            `topic ${n}: the platform 80% gate is applied (got ${sess.cfg.passScore})`);
        ok(!sess.cfg.stepGate,
            `topic ${n}: through the shared passScore, not a private rule`);

        const host = w.document.querySelector('.uz-step-host');
        const g0 = groups[0];
        ok(host.querySelectorAll('.b2h-item').length === g0.items.length,
            `topic ${n}: the exercise renders through the shared UI`);

        /* answering must write through to the legacy field the scorer reads */
        const item = g0.items[0];
        const want = Array.isArray(item.answer) ? item.answer[0] : item.answer;
        if (g0.type === 'choice') {
            const row = host.querySelector(`[data-b2h-row="${g0.id}-0"]`);
            const opt = Array.from(row.querySelectorAll('.b2h-opt'))
                .find(o => o.getAttribute('data-value') === want);
            if (opt) opt.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        } else {
            const inp = host.querySelector(`[data-b2h-input="${g0.id}-0"]`);
            if (inp) { inp.value = want; inp.dispatchEvent(new w.Event('input', { bubbles: true })); }
        }

        const readLegacy = () => {
            if (g0.type === 'choice') {
                const s = qs.querySelector(`[data-t1-row="${g0.id}-0"] .t1-opt.selected`);
                return s ? s.getAttribute('data-value') : null;
            }
            const el = qs.querySelector(`[data-t1-input="${g0.id}-0"]`);
            return el ? el.value : null;
        };
        ok(readLegacy() === want,
            `topic ${n}: the answer is mirrored into the legacy field (${JSON.stringify(readLegacy())})`);
        ok(errors.length === 0, `topic ${n}: no console errors (${errors[0] || ''})`);
    }
}


/* ------------------------------------------------ pass/fail agreement
 * The results screen must never disagree with the legacy scorer about whether
 * a topic was passed. Both read ONE rule — a2PassNeeded — so this test walks
 * the whole range, including both sides of the boundary.
 * ------------------------------------------------------------------- */
{
    const html = fs.readFileSync(path.join(ROOT, 'paid-courses/a2-course.html'), 'utf8');

    ok((html.match(/function a2PassNeeded/g) || []).length === 1,
        'A2 declares its pass rule exactly once');
    ok(/var passNeeded = a2PassNeeded\(total\);/.test(html),
        'the legacy scorer uses that rule');
    ok(/passNeeded: a2PassNeeded/.test(html), 'the new UI is handed the same rule');
    const hostSrc = fs.readFileSync(path.join(ROOT, 'a2-host.js'), 'utf8');
    ok(!/0\.6|PASSING_SCORE|passed: true/.test(hostSrc),
        'the host hardcodes no threshold and no verdict');
    /* the generic scorer populates the legacy panel but must never reveal it */
    const scorer = (() => {
        const i = html.indexOf('window.checkTopic1Exercises = async function');
        if (i < 0) return '';
        let d = 0, st = false;
        for (let k = html.indexOf('{', i); k < html.length; k++) {
            if (html[k] === '{') { d++; st = true; }
            else if (html[k] === '}') { d--; if (st && d === 0) return html.slice(i, k + 1); }
        }
        return '';
    })();
    ok(scorer.length > 0, 'the generic scorer was located');
    ok(!/resultsSection\.classList\.add\(["']show["']\)/.test(scorer),
        'the legacy results panel never appears beside the new screen');
    ok(/id="resultsWrap"[^>]*display:none/.test(html),
        'the legacy results section reserves no layout space by default');

    const grab = (name) => {
        const i = html.indexOf('function ' + name + '(');
        if (i < 0) return null;
        let d = 0, st = false;
        for (let k = html.indexOf('{', i); k < html.length; k++) {
            if (html[k] === '{') { d++; st = true; }
            else if (html[k] === '}') { d--; if (st && d === 0) return html.slice(i, k + 1); }
        }
        return null;
    };
    const sandbox = { PASSING_SCORE: 7 };
    vm.runInNewContext(grab('a2PassNeeded') + ';this.__f = a2PassNeeded;', sandbox);
    const passNeeded = sandbox.__f;

    const dom = new JSDOM('<!doctype html><body></body></html>', { runScripts: 'outside-only' });
    const w = dom.window;
    ['sentence-builder.js', 'course-exercise-ui.js'].forEach(f =>
        w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

    const TOTAL = 110;
    const need = passNeeded(TOTAL);
    ok(need === Math.max(7, Math.ceil(TOTAL * 0.6)), `pass threshold for ${TOTAL} items is ${need}`);

    [0, 1, need - 2, need - 1, need, need + 1, TOTAL - 1, TOTAL].forEach(correct => {
        const legacyPassed = correct >= passNeeded(TOTAL);
        const r = {
            score: correct, total: TOTAL, errors: TOTAL - correct,
            percent: Math.round(correct / TOTAL * 100),
            passed: correct >= passNeeded(TOTAL),
            passPercent: Math.round(passNeeded(TOTAL) / TOTAL * 100),
            breakdown: [], wrong: []
        };
        const txt = w.UzExerciseUI.renderResults(r, {}).replace(/<[^>]+>/g, ' ');
        const uiPassed = /Тема пройдена/.test(txt) && !/Тема не пройдена/.test(txt);
        ok(uiPassed === legacyPassed,
            `${correct}/${TOTAL}: screen says "${uiPassed ? 'пройдена' : 'не пройдена'}", scorer says "${legacyPassed ? 'пройдена' : 'не пройдена'}"`);
    });
}


/* ------------------------------------------------ RC polish invariants
 * Everything the release-candidate pass fixed, asserted so it cannot come back.
 * ------------------------------------------------------------------- */
{
    const vm2 = require('vm');
    for (const p of PAGES) {
        const s = fs.readFileSync(path.join(ROOT, p.file), 'utf8');
        const T = p.label;

        /* one vocabulary card, no orphaned debris from the old inline card */
        ok((s.match(/\$\{a2VocabCard\(topic\.id\)\}/g) || []).length === 1,
            `${T} exactly one vocabulary card call`);
        ok(!/Lug'atni ochish/.test(s), `${T} no leftover vocabulary markup in the page`);

        /* the legacy results surface never occupies the layout */
        ok(/id="resultsWrap"[^>]*style="display:none"/.test(s),
            `${T} the legacy results section is out of the layout by default`);
        ok(/function setResultsWrapVisible/.test(s),
            `${T} the wrapper is toggled together with the panel`);

        /* every exercise group carries an instruction card */
        const topics = T === 'paid' ? [1, 2, 3, 4, 5] : [1, 2, 3];
        topics.forEach(n => {
            const key = `topic${n}Exercises: {`;
            const i = s.indexOf(key);
            ok(i > 0, `${T} topic ${n} exercise data found`);
            if (i < 0) return;
            let d = 0, o = s.indexOf('{', i + key.length - 1), end = -1;
            for (let k = o; k < s.length; k++) {
                if (s[k] === '{') d++;
                else if (s[k] === '}') { d--; if (d === 0) { end = k; break; } }
            }
            const data = vm2.runInNewContext('(' + s.slice(o, end + 1) + ')', {});
            const missing = data.exercises.filter(g => !Array.isArray(g.howTo) || g.howTo.length < 2);
            ok(missing.length === 0,
                `${T} topic ${n}: every exercise has an instruction (${missing.map(g => g.id).join(',') || 'all present'})`);
            const texts = data.exercises.map(g => (g.howTo || []).join(' '));
            ok(new Set(texts).size === texts.length,
                `${T} topic ${n}: no instruction is copied between exercises`);
            ok(texts.every(t => t.length > 80),
                `${T} topic ${n}: every instruction is substantial`);
        });
    }

    /* the instruction card actually renders through the shared component */
    const w = new JSDOM('<!doctype html><html><body></body></html>',
        { runScripts: 'outside-only', pretendToBeVisual: true }).window;
    w.Element.prototype.scrollIntoView = function () {};
    ['shared-normalizer.js', 'sentence-builder.js', 'course-exercise-ui.js']
        .forEach(f => w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    const html = w.UzExerciseUI.renderGroup({
        id: 'g', type: 'input', title: 'T', howTo: ['a', 'b'], items: [{ q: 'q', answer: 'a' }]
    });
    ok(/b2h-howto/.test(html), 'the shared UI renders the instruction card');
    ok(/Как выполнять/.test(html), 'the instruction card carries the B2 heading');
}


/* ------------------------------------------------ completed-topic behaviour
 * A passed topic is finished: the lesson page offers review, never a new
 * attempt, and no legacy check button exists anywhere in the migrated flow.
 * ------------------------------------------------------------------- */
{
    for (const p of PAGES) {
        const s = fs.readFileSync(path.join(ROOT, p.file), 'utf8');
        const T = p.label;
        /* the dead extra-exercises workflow and its check button are gone */
        ok(!/Javoblarni Tekshirish/.test(s), `${T} the extra-exercises check button is deleted`);
        ok(!/ExtraExercises/.test(s), `${T} no extra-exercises code remains`);
        /* the legacy quiz check button survives ONLY for unmigrated topics */
        /* Counted as MARKUP, not as a phrase: the stepping session is now
           configured with the same Uzbek wording for its own check button,
           and a bare text match would read that label as a second legacy
           button. What must stay unique is the legacy <button>. */
        const submits = (s.match(/<button[^>]*>Javoblarni tekshirish<\/button>/g) || []).length;
        ok(submits === 1, `${T} exactly one legacy check button, for unmigrated topics (${submits})`);
        const quiz = s.slice(s.indexOf('function loadQuiz'), s.indexOf('function loadQuiz') + 2000);
        ok(/if \(getT1ExData\(topic\)\) \{ renderTopic1Exercises\(topicId\); return; \}/.test(quiz),
            `${T} migrated topics return before that button is ever built`);

        /* completion state */
        ok(/isCompleted: function \(id\)/.test(s), `${T} the host is told when a topic is done`);
        ok(/saveResult: a2SaveTopicResult/.test(s), `${T} the attempt is stored for review`);
        ok(/loadResult: a2LoadTopicResult/.test(s), `${T} the stored attempt is read back`);
    }
    const host = fs.readFileSync(path.join(ROOT, 'a2-host.js'), 'utf8');
    ok(/var isDone =/.test(host), 'the host branches on completion');
    ok(/a2-done-badge/.test(host), 'a completed topic shows a finished card');
    ok(/data-a2-review/.test(host), 'a completed topic offers review');
    const doneBranch = host.slice(host.indexOf('if (isDone) {'), host.indexOf('return session().mount({'));
    ok(/return null;/.test(doneBranch), 'a completed topic never mounts a new attempt');
    ok(!/uz-practice/.test(doneBranch), 'no practice card is rendered once the topic is passed');
    const ui = fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8');
    ok(/\.a2-done\{/.test(ui), 'the completed card is styled by the shared component');
}

console.log('='.repeat(56));
if (fail) {
    console.log(`  ❌ A2 NEW UI: ${fail} failed / ${pass + fail}\n`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(56) + '\n');
    process.exit(1);
}
console.log(`  ✅ A2 NEW UI: ${pass}/${pass} passed`);
console.log('='.repeat(56) + '\n');
