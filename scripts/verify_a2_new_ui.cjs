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
                 'exercise-cards.js', 'a2-host.js'];

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
    ok(/function mountA2ExerciseCards/.test(s), `${T} defines the card mount`);
    ok(/mountA2ExerciseCards\(topicId\);/.test(s), `${T} calls it after the legacy render`);
    ok(/legacy\.style\.display = 'none'/.test(s), `${T} the legacy markup is hidden, not removed`);
    ok(/data-a2-legacy/.test(s), `${T} the legacy block is marked for the scorer`);

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
        const mounted = w.A2Host.mountCards({
            mountEl, deps: { getTopic: () => topic, getScope: () => qs }
        });
        ok(!!mounted, `topic ${n}: cards mount`);

        const cards = w.document.querySelectorAll('.uzc-card');
        ok(cards.length === groups.length,
            `topic ${n}: one card per exercise (${cards.length}/${groups.length})`);
        ok(Array.from(cards).every(c => c.querySelector('.uzc-name').textContent.trim() !== ''),
            `topic ${n}: every card is labelled`);

        /* open the first exercise */
        cards[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        const sess = w.UzExerciseSession.current();
        ok(!!sess && sess.cfg.groups.length === 1,
            `topic ${n}: a card opens exactly its own exercise`);
        ok(!sess.cfg.passScore && !sess.cfg.stepGate,
            `topic ${n}: no pass gate is applied — A2 progression is unchanged`);

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

console.log('='.repeat(56));
if (fail) {
    console.log(`  ❌ A2 NEW UI: ${fail} failed / ${pass + fail}\n`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(56) + '\n');
    process.exit(1);
}
console.log(`  ✅ A2 NEW UI: ${pass}/${pass} passed`);
console.log('='.repeat(56) + '\n');
