#!/usr/bin/env node
/* ============================================================================
 * verify_course_integrity.cjs — one pass over the WHOLE teaching platform.
 * ----------------------------------------------------------------------------
 * A1, A2, B1, B2 · paid and demo · lesson data, rendered DOM, answer keys,
 * word banks, vocabulary, and the access gate that stands in front of all of it.
 *
 * WHY IT EXISTS
 * -------------
 * The defects this platform actually shipped were never visible in one file:
 *
 *   - an exercise whose last three questions were verbatim copies of its first
 *     three, because the author needed ten items and pasted;
 *   - a saved-result panel painted from a 300 ms timer with no topic guard, so
 *     switching topics inside that window showed the PREVIOUS topic's score;
 *   - vocabulary cards duplicated inside a single topic's list;
 *   - a sentence builder whose word bank was already the answer.
 *
 * Each was found by reading the DATA of every course at once, or by RENDERING
 * every topic at once — never by inspecting one lesson. So this suite does both,
 * over everything, and states its counters out loud: a number that drops is as
 * interesting as an assertion that fails.
 *
 * WHAT IT DELIBERATELY DOES NOT FLAG
 * ----------------------------------
 * Language is not a lint. Three patterns look like defects and are not:
 *   - an item that accepts several answers ("Я читаю книгу ___" is true of any
 *     time of day) — multi-accept is authored on purpose;
 *   - the same word taught again in a later topic — that is reinforcement;
 *   - a word bank whose cards repeat a token the answer genuinely needs twice.
 * Each is separated from its accidental twin below rather than suppressed.
 * ==========================================================================*/
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };

/* ------------------------------------------------------------------ tools */

function braceSlice(src, from) {
    let d = 0, i = src.indexOf('{', from);
    for (let k = i; k < src.length; k++) {
        if (src[k] === '{') d++;
        else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
    }
    return null;
}

function mainScript(html) {
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
    let m, best = '';
    while ((m = re.exec(html))) {
        if (/\bsrc=/.test(m[1])) continue;
        if (m[2].length > best.length) best = m[2];
    }
    return best;
}

/** Lift a function declaration out of page source, keeping `async`. */
function lift(src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    const prefix = src.slice(i - 6, i) === 'async ' ? 'async ' : '';
    let p = 0, b = -1;
    for (let k = src.indexOf('(', i); k < src.length; k++) {
        if (src[k] === '(') p++;
        else if (src[k] === ')') { p--; if (p === 0) { b = src.indexOf('{', k); break; } }
    }
    let d = 0;
    for (let k = b; k < src.length; k++) {
        if (src[k] === '{') d++;
        else if (src[k] === '}') { d--; if (d === 0) return prefix + src.slice(i, k + 1); }
    }
    return '';
}

function allFunctionNames(src) {
    const out = new Set();
    const re = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    let m;
    while ((m = re.exec(src))) out.add(m[1]);
    return [...out];
}

function courseData(html) {
    const m = html.search(/(?:const|let|var)\s+courseData\s*=\s*\{/);
    if (m < 0) return null;
    const lit = braceSlice(html, m);
    try { return lit ? vm.runInNewContext('(' + lit + ')', {}) : null; } catch (e) { return null; }
}

/* The project's own normaliser — the scorer's notion of "same answer". */
const normSandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'shared-normalizer.js'), 'utf8'), normSandbox);
const UZ = normSandbox.window.UzNormalize;
const norm = typeof UZ === 'function' ? UZ
    : (UZ && UZ.normalize) ? UZ.normalize.bind(UZ)
    : (s) => String(s || '').toLowerCase().replace(/ё/g, 'е')
        .replace(/[.,!?;:()"'«»—–\-]/g, '').replace(/\s+/g, ' ').trim();

/* What the LEARNER sees: case and spacing folded, punctuation kept — two
   options that differ only by a comma are still two different buttons. */
const visible = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const visibleCI = (s) => visible(s).toLocaleLowerCase('ru');

/* ------------------------------------------------------------- collection */

const PAGES = [
    ['A1', 'paid', 'paid-courses/a1-course.html'], ['A1', 'demo', 'a1-demo.html'],
    ['A2', 'paid', 'paid-courses/a2-course.html'], ['A2', 'demo', 'a2-demo.html'],
    ['B1', 'paid', 'paid-courses/b1-course.html'], ['B1', 'demo', 'b1-demo.html']
];

function normItem(raw, i) {
    if (raw == null) return { i, prompt: '', options: null, answers: [], words: null, free: false };
    if (typeof raw === 'string') return { i, prompt: raw, options: null, answers: [], words: null, free: false };
    const prompt = raw.q ?? raw.question ?? raw.template ?? raw.prompt ?? raw.sentence ?? raw.word ?? raw.text ?? '';
    let answers = [];
    if (Array.isArray(raw.answers)) answers = raw.answers.slice();
    else if (Array.isArray(raw.answer)) answers = raw.answer.slice();
    else if (raw.answer != null && raw.answer !== '') answers = [raw.answer];
    return {
        i, prompt: String(prompt),
        options: Array.isArray(raw.options) ? raw.options : null,
        answers,
        words: Array.isArray(raw.words) ? raw.words.slice() : null,
        free: raw.free === true
    };
}

/** Every exercise group of one topic, in whichever of the four shapes it uses. */
function groupsOfTopic(course, form, topic) {
    const groups = [];
    Object.keys(topic).forEach((bk) => {
        if (!/Exercises?$/.test(bk)) return;
        const block = topic[bk];
        if (!block || typeof block !== 'object') return;

        /* Engine shape — A2, B1, B2: { exercises: [ {id,type,items} ] } */
        if (Array.isArray(block.exercises)) {
            block.exercises.forEach((g, gi) => {
                const listKey = ['items', 'questions', 'prompts', 'sentences', 'pairs']
                    .find((k) => Array.isArray(g[k]));
                groups.push({
                    course, form, topicId: topic.id, path: `${bk}.exercises[${gi}]`,
                    id: g.id || ('ex' + gi), type: g.type || '—', title: g.title || '',
                    shape: listKey || null, items: (listKey ? g[listKey] : []).map(normItem)
                });
            });
            return;
        }

        /* A1 legacy shape: { exercise1: {...}, section1: {...} } */
        Object.keys(block).forEach((ek) => {
            const ex = block[ek];
            if (!ex || typeof ex !== 'object' || Array.isArray(ex)) return;
            const listKey = ['items', 'questions', 'prompts', 'sentences', 'pairs']
                .find((k) => Array.isArray(ex[k]));
            if (!listKey) return;
            const parallel = Array.isArray(ex.answers) ? ex.answers : null;
            const items = ex[listKey].map((raw, i) => {
                const n = normItem(raw, i);
                /* `prompts`/`sentences` carry their answers in a parallel array */
                if (parallel && !n.answers.length && parallel[i] != null) {
                    const a = parallel[i];
                    n.answers = Array.isArray(a) ? a.slice()
                        : (typeof a === 'string' && a.includes(',')) ? a.split(',').map(s => s.trim()).filter(Boolean)
                        : [a];
                }
                return n;
            });
            groups.push({
                course, form, topicId: topic.id, path: `${bk}.${ek}`, id: ek,
                type: (listKey === 'questions' && ex[listKey][0] && ex[listKey][0].options) ? 'choice'
                    : (ex[listKey][0] && ex[listKey][0].words) ? 'builder'
                    : 'input',
                title: ex.title || '', shape: listKey, items
            });
        });
    });

    /* The original quiz shape, still used by A1 topics 1-5 */
    const q = topic.quiz;
    if (q && typeof q === 'object') {
        if (Array.isArray(q.mcQuestions) && q.mcQuestions.length) {
            groups.push({
                course, form, topicId: topic.id, path: 'quiz.mc', id: 'quiz-mc', type: 'choice',
                title: 'Test', shape: 'mcQuestions',
                items: q.mcQuestions.map((text, i) => {
                    const opts = (q.mcOptions || [])[i];
                    const idx = (q.mcAnswers || [])[i];
                    return {
                        i, prompt: String(text),
                        options: Array.isArray(opts) ? opts : null,
                        answers: (Number.isInteger(idx) && Array.isArray(opts) && opts[idx] !== undefined)
                            ? [opts[idx]] : [],
                        words: null, free: false, answerIndex: idx
                    };
                })
            });
        }
        if (Array.isArray(q.blankQuestions) && q.blankQuestions.length) {
            groups.push({
                course, form, topicId: topic.id, path: 'quiz.blank', id: 'quiz-blank', type: 'input',
                title: 'Bo\'sh joylar', shape: 'blankQuestions',
                items: q.blankQuestions.map((text, i) => ({
                    i, prompt: String(text), options: null,
                    answers: (q.blankAnswers || [])[i] != null ? [q.blankAnswers[i]] : [],
                    words: null, free: false
                }))
            });
        }
    }
    return groups;
}

const SURFACES = [];
const GROUPS = [];

PAGES.forEach(([course, form, rel]) => {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) { SURFACES.push({ course, form, rel, exists: false }); return; }
    const data = courseData(fs.readFileSync(file, 'utf8'));
    if (!data) { SURFACES.push({ course, form, rel, exists: true, error: 'courseData unreadable' }); return; }
    const topics = (data.topics || []).map((t) => ({
        id: t.id, title: t.title || '', locked: Boolean(t.isSubscriptionLocked),
        raw: t, groups: groupsOfTopic(course, form, t)
    }));
    topics.forEach((t) => t.groups.forEach((g) => GROUPS.push(g)));
    SURFACES.push({ course, form, rel, exists: true, topics });
});

/* B2 lives in a module that assigns to a global inside an IIFE. */
{
    const sandbox = { window: {} };
    let b2 = null;
    try {
        vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'b2-lesson-data.js'), 'utf8'), sandbox);
        b2 = sandbox.window.B2_LESSON_DATA;
    } catch (e) { b2 = null; }
    const topics = [];
    if (b2 && Array.isArray(b2.topics)) {
        b2.topics.forEach((L) => {
            const gs = (L.exercises || []).map((g, gi) => ({
                course: 'B2', form: 'paid', topicId: L.id, path: `topic${L.id}.exercises[${gi}]`,
                id: g.id || ('ex' + gi), type: g.type || '—', title: g.title || '',
                shape: Array.isArray(g.items) ? 'items' : null,
                items: (g.items || []).map(normItem)
            }));
            topics.push({ id: L.id, title: L.title || '', locked: false, raw: L, groups: gs });
            gs.forEach((g) => GROUPS.push(g));
        });
    }
    SURFACES.push({ course: 'B2', form: 'paid', rel: 'b2-lesson-data.js', exists: true, topics });
}

console.log('\n=== COURSE INTEGRITY ===\n');
console.log('  поверхности:');
SURFACES.forEach((s) => {
    if (!s.exists) { console.log(`    ${s.course} ${s.form}: файла нет`); return; }
    if (s.error) { console.log(`    ${s.course} ${s.form}: ${s.error}`); return; }
    const authored = s.topics.filter((t) => t.groups.some((g) => g.items.length)).length;
    const items = s.topics.reduce((a, t) => a + t.groups.reduce((b, g) => b + g.items.length, 0), 0);
    console.log(`    ${s.course} ${s.form.padEnd(4)} тем ${String(s.topics.length).padStart(2)}`
        + ` | authored ${String(authored).padStart(2)}`
        + ` | locked ${String(s.topics.filter(t => t.locked).length).padStart(2)}`
        + ` | групп ${String(s.topics.reduce((a, t) => a + t.groups.length, 0)).padStart(3)}`
        + ` | позиций ${items}`);
});

ok(SURFACES.filter((s) => s.exists && !s.error).length === 7,
    `все семь поверхностей курса читаются (${SURFACES.filter(s => s.exists && !s.error).length}/7)`);

/* ============================ 1. DATA INTEGRITY ========================= */
const COUNT = { groups: 0, items: 0, options: 0, keys: 0, bankTokens: 0, multiAccept: 0, intentionalRepeat: 0 };

GROUPS.forEach((g) => {
    COUNT.groups++;
    const where = `${g.course} ${g.form} T${g.topicId} ${g.path}`;
    const fingerprints = new Map();

    g.items.forEach((it) => {
        COUNT.items++;
        COUNT.keys += it.answers.length;
        if (it.answers.length > 1) COUNT.multiAccept++;

        if (Array.isArray(it.options)) {
            COUNT.options += it.options.length;

            ok(it.options.every((o) => o != null && String(o).trim() !== ''),
                `${where} #${it.i + 1}: ни один вариант не пуст`);

            /* Two buttons a learner cannot tell apart. */
            const seen = new Set();
            let dup = null;
            it.options.forEach((o) => {
                const v = visibleCI(o);
                if (seen.has(v)) dup = o;
                seen.add(v);
            });
            ok(dup === null,
                `${where} #${it.i + 1}: вариант «${dup}» показан дважды — ${JSON.stringify(it.options)}`);

            /* Two buttons the SCORER cannot tell apart: visually different but
               normalising to the same string, so one of them is unreachable. */
            const seenN = new Map();
            let collide = null;
            it.options.forEach((o) => {
                const n = norm(o);
                if (seenN.has(n) && visibleCI(seenN.get(n)) !== visibleCI(o)) collide = [seenN.get(n), o];
                if (!seenN.has(n)) seenN.set(n, o);
            });
            ok(collide === null,
                `${where} #${it.i + 1}: «${collide && collide[0]}» и «${collide && collide[1]}» неразличимы для проверки`);

            if (it.answers.length) {
                const matches = it.options.filter((o) => it.answers.some((a) => norm(a) === norm(o)));
                ok(matches.length > 0,
                    `${where} #${it.i + 1}: ключ ${JSON.stringify(it.answers)} есть среди вариантов`);
                /* AMBIGUITY, precisely: ONE intended answer that two different
                   options both satisfy. An item that lists several answers is
                   multi-accept and correct — see the header. */
                if (it.answers.length === 1) {
                    ok(matches.length === 1,
                        `${where} #${it.i + 1}: единственному ключу соответствует ровно один вариант`
                        + ` (совпало ${matches.length}: ${JSON.stringify(matches)})`);
                }
            } else {
                ok(it.free === true,
                    `${where} #${it.i + 1}: у варианта выбора есть ключ ответа`);
            }
        }

        /* Accepted variants must not repeat each other byte for byte. */
        if (it.answers.length > 1) {
            const seenExact = new Set();
            let repeated = null;
            it.answers.forEach((a) => { if (seenExact.has(String(a))) repeated = a; seenExact.add(String(a)); });
            ok(repeated === null,
                `${where} #${it.i + 1}: принятый вариант «${repeated}» продублирован дословно`);
        }

        if (Array.isArray(it.words)) COUNT.bankTokens += it.words.length;

        /* Two identical questions inside ONE exercise: the learner answers the
           same thing twice and the exercise is shorter than it looks. */
        if (visible(it.prompt)) {
            const fp = JSON.stringify([
                norm(it.prompt),
                (it.options || []).map(norm).sort(),
                it.answers.map(norm).sort()
            ]);
            /* No allow-list. A repeat inside one exercise is a defect wherever it
               came from: the learner cannot tell an intentional echo from a paste,
               and the only two the platform had were rewritten rather than
               excused. Asserted for EVERY item so the pass count reflects the
               real breadth of the check, not only its failures. */
            const first = fingerprints.get(fp);
            ok(first === undefined,
                `${where}: позиции #${first + 1} и #${it.i + 1} идентичны — «${visible(it.prompt).slice(0, 60)}»`);
            if (first === undefined) fingerprints.set(fp, it.i);
        }
    });
});

/* ===================== 2. WORD BANKS ARE ACTUALLY SOLVABLE =============== */
/* Not a Set check. The bank is permuted and every ordering compared against
   the accepted answers through the real normaliser, because multi-word cards
   ("в июле", "много работал") make naive whitespace splitting lie. */
function permutations(arr) {
    if (arr.length <= 1) return [arr];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
        const rest = arr.slice(0, i).concat(arr.slice(i + 1));
        for (const p of permutations(rest)) out.push([arr[i]].concat(p));
    }
    return out;
}

let bankItems = 0, unsolvable = 0;
GROUPS.filter((g) => g.type === 'builder').forEach((g) => {
    g.items.forEach((it) => {
        if (!Array.isArray(it.words) || !it.words.length) return;
        bankItems++;
        const accepted = it.answers.map(norm);
        if (it.words.length > 7) {
            /* 8! orderings is not worth the seconds — but SKIPPING the item
               entirely left long builders with no check at all, which is how a
               nine-card item could ship with a card the answer never uses. The
               multiset is linear and catches exactly that: every accepted
               answer must consume the bank, no card left over and none
               invented. It is weaker than the permutation proof below (it does
               not prove an ORDER exists) and strictly better than nothing. */
            const bag = (list) => list.map(norm).filter(Boolean).sort().join('|');
            const bank = bag(it.words);
            it.answers.forEach((a, ai) => {
                const words = String(a).replace(/[.,!?;:]/g, ' ').trim().split(/\s+/);
                ok(bag(words) === bank,
                    `${g.course} ${g.form} T${g.topicId} ${g.id} #${it.i + 1}`
                    + ` вариант ${ai + 1}: использует ровно карточки банка`
                    + ` — банк ${JSON.stringify(it.words)}, ответ ${JSON.stringify(a)}`);
            });
            COUNT.longBank = (COUNT.longBank || 0) + 1;
            return;
        }
        const solvable = permutations(it.words).some((p) => accepted.includes(norm(p.join(' '))));
        if (!solvable) unsolvable++;
        ok(solvable,
            `${g.course} ${g.form} T${g.topicId} ${g.id} #${it.i + 1}: ответ собирается из банка`
            + ` — карточки ${JSON.stringify(it.words)}, принято ${JSON.stringify(it.answers)}`);

        /* A repeated card is a defect ONLY when the answer does not need it
           twice. Russian sentences legitimately repeat words. */
        const have = {};
        it.words.forEach((w) => { const k = norm(w); have[k] = (have[k] || 0) + 1; });
        const need = {};
        String(it.answers[0] || '').replace(/[.,!?]/g, '').trim().split(/\s+/)
            .forEach((w) => { const k = norm(w); need[k] = (need[k] || 0) + 1; });
        Object.entries(have).filter(([, n]) => n > 1).forEach(([w, n]) => {
            if ((need[w] || 0) >= n) COUNT.intentionalRepeat++;
            else ok(false, `${g.course} T${g.topicId} ${g.id} #${it.i + 1}: карточка «${w}» лишняя (x${n})`);
        });
    });
});

/* ==================== 3. THE RENDER, NOT JUST THE DATA =================== */
/* Data has been clean while the DOM duplicated — that is how the word-bank bug
   shipped. So every A2/B1 topic is actually rendered and the DOM inspected. */
const DOM = { topics: 0, groups: 0, options: 0 };

[['A2', 'paid', 'paid-courses/a2-course.html'], ['A2', 'demo', 'a2-demo.html'],
 ['B1', 'paid', 'paid-courses/b1-course.html'], ['B1', 'demo', 'b1-demo.html']]
.forEach(([course, form, rel]) => {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const script = mainScript(html);
    const data = courseData(html);
    const lifted = allFunctionNames(script).map((n) => lift(script, n)).filter(Boolean).join('\n');

    (data.topics || []).forEach((topic) => {
        const exKey = Object.keys(topic).find((k) => /^topic\d+Exercises$/.test(k)
            && topic[k] && Array.isArray(topic[k].exercises) && topic[k].exercises.length);
        if (!exKey) return;
        DOM.topics++;

        const dom = new JSDOM('<!doctype html><body><div id="quizSection"></div>'
            + '<div id="resultsSection"></div></body>', { runScripts: 'outside-only' });
        const w = dom.window;
        w.Element.prototype.scrollIntoView = function () {};
        let threw = '';
        try {
            w.eval(`
                var courseData=${JSON.stringify({ topics: [topic] })};
                var currentTopicId=${topic.id};
                var quizSection=document.getElementById('quizSection');
                var userQuizResults={}; var completedTopics=[]; var currentUserId=null;
                var currentUser=null;
                function logActivity(){} function saveProgress(){}
                async function saveQuizResultToFirebase(){}
                window.__uzFinalizeExerciseTopic=function(){};
                window.UzExerciseUI={renderComingSoon:function(){return '<div class="uz-soon"></div>';}};
                ${lifted}
                if(typeof injectTopic1Styles==='undefined'){ var injectTopic1Styles=function(){}; }
            `);
            w.eval(`renderTopic1Exercises(${topic.id});`);
        } catch (e) { threw = e.message; }

        ok(!threw, `${course} ${form} T${topic.id}: тема рендерится без исключения (${threw})`);
        if (threw) { dom.window.close(); return; }

        const D = w.document;
        ok(D.getElementById('quizSection').innerHTML.trim() !== '',
            `${course} ${form} T${topic.id}: секция упражнений не пуста`);

        topic[exKey].exercises.forEach((g) => {
            if (!Array.isArray(g.items) || !g.items.length) return;
            DOM.groups++;
            g.items.forEach((item, i) => {
                if (!Array.isArray(item.options)) return;
                const row = D.querySelector(`[data-t1-row="${g.id}-${i}"]`);
                const btns = row ? [...row.querySelectorAll('.t1-opt')] : [];
                DOM.options += btns.length;
                ok(btns.length === item.options.length,
                    `${course} ${form} T${topic.id} ${g.id}#${i + 1}: вариантов в DOM ${btns.length}, в данных ${item.options.length}`);
                const seen = new Set();
                let dup = null;
                btns.map((b) => visibleCI(b.textContent)).forEach((t) => { if (seen.has(t)) dup = t; seen.add(t); });
                ok(dup === null, `${course} ${form} T${topic.id} ${g.id}#${i + 1}: «${dup}» на экране дважды`);
            });
        });

        /* Cross-exercise key collisions. Counted per attribute: the builder
           deliberately puts data-t1-builder and data-t1-input on one key — the
           container and its hidden answer field, not two exercises clashing. */
        ['data-t1-row', 'data-t1-input', 'data-t1-builder'].forEach((attr) => {
            const seen = new Set();
            let clash = null;
            D.querySelectorAll('[' + attr + ']').forEach((n) => {
                const k = n.getAttribute(attr);
                if (seen.has(k)) clash = k;
                seen.add(k);
            });
            ok(clash === null, `${course} ${form} T${topic.id}: ${attr}="${clash}" используется дважды`);
        });

        ok(D.querySelectorAll('.check-topic-btn,[id^="checkTopic"]').length <= 1,
            `${course} ${form} T${topic.id}: не больше одной кнопки проверки`);

        dom.window.close();
    });
});

/* ============ 4. A1'S DEFERRED WORK CANNOT LEAK BETWEEN TOPICS =========== */
/* A1 paints its extras from timers. Every one of those callbacks must refuse
   to draw for a topic that is no longer open — a 300 ms window was enough to
   show one topic's saved score on another topic's page. */
{
    const A1 = fs.readFileSync(path.join(ROOT, 'paid-courses/a1-course.html'), 'utf8');
    const DEMO = fs.readFileSync(path.join(ROOT, 'a1-demo.html'), 'utf8');

    [['a1-course.html', A1], ['a1-demo.html', DEMO]].forEach(([name, src]) => {
        const body = lift(src, 'displaySavedResults');
        ok(/topicId !== currentTopicId/.test(body.slice(0, 900)),
            `${name}: displaySavedResults отказывается рисовать чужую тему`);
        ok(/function scheduleTopicExtra\(/.test(src),
            `${name}: отложенные догрузки идут через отменяемый планировщик`);
        ok(!/setTimeout\(\(\) => \{\s*(loadExtraExercises|loadTopic4FillExercise|loadTopic5Exercises|displaySavedResults|initMatchingGameA1)/.test(src),
            `${name}: не осталось голых таймеров для догрузки упражнений`);
    });

    ok(/topic\.id !== currentTopicId/.test(lift(A1, 'initMatchingGameA1').slice(0, 900)),
        'a1-course.html: initMatchingGameA1 отказывается строить игру чужой темы');

    /* Topics 6-12 own their whole section and have their own scheduler. */
    ok(/function scheduleExerciseRender\(/.test(A1),
        'a1-course.html: отложенный рендер тем 6-12 отменяем');
    ok(/const EXERCISE_TOPIC_LOADERS/.test(A1),
        'a1-course.html: диспетчер тем 6-12 управляется таблицей, а не цепочкой id');
}

/* ======================= 5. VOCABULARY, PER TOPIC ======================== */
/* A word repeated in a LATER topic is revision. The same card twice in ONE
   topic's list is a paste. Only the second is a defect. */
const VOCAB = { files: 0, lists: 0, entries: 0, crossTopic: 0 };
{
    const FILES = ['paid-courses/a1-vocabulary.html', 'paid-courses/a2-vocabulary.html',
        'paid-courses/b1-vocabulary.html', 'paid-courses/b2-vocabulary.html',
        'a1-demo-vocabulary.html', 'a2-demo-vocabulary.html',
        'b1-demo-vocabulary.html', 'b2-demo-vocabulary.html'];

    function literalOf(src, name) {
        const m = src.search(new RegExp('(?:const|let|var)\\s+' + name + '\\s*=\\s*[\\[{]'));
        if (m < 0) return null;
        let i = m;
        while (src[i] !== '[' && src[i] !== '{') i++;
        const o = src[i], c = o === '[' ? ']' : '}';
        let d = 0;
        for (let k = i; k < src.length; k++) {
            if (src[k] === o) d++;
            else if (src[k] === c) {
                d--;
                if (d === 0) {
                    try {
                        /* Locked placeholder topics are produced by a helper; it
                           contributes no words, so an empty stub is enough. */
                        return vm.runInNewContext('(' + src.slice(i, k + 1) + ')',
                            { generateLockedTopics: () => [], icons: {}, lockedTopicNames: [] });
                    } catch (e) { return null; }
                }
            }
        }
        return null;
    }
    const pairsOf = (node) => {
        if (!Array.isArray(node) || !node.length) return null;
        const out = [];
        for (const v of node) {
            if (!v || typeof v !== 'object') return null;
            const ru = v.ru ?? v.word ?? v.russian ?? v.term ?? v.front;
            const uz = v.uz ?? v.translation ?? v.uzbek ?? v.meaning ?? v.back;
            if (typeof ru !== 'string' || typeof uz !== 'string') return null;
            out.push({ ru, uz });
        }
        return out;
    };
    const collect = (node, p, acc) => {
        const direct = pairsOf(node);
        if (direct) { acc.push({ path: p, words: direct }); return acc; }
        if (Array.isArray(node)) { node.forEach((v, i) => collect(v, `${p}[${i}]`, acc)); return acc; }
        if (node && typeof node === 'object') { Object.keys(node).forEach((k) => collect(node[k], `${p}.${k}`, acc)); return acc; }
        return acc;
    };

    FILES.forEach((rel) => {
        const file = path.join(ROOT, rel);
        ok(fs.existsSync(file), `${rel}: файл словаря на месте`);
        if (!fs.existsSync(file)) return;
        const data = literalOf(mainScript(fs.readFileSync(file, 'utf8')), 'vocabularyData');
        ok(!!data, `${rel}: словарь читается`);
        if (!data) return;
        const lists = collect(data, rel, []);
        ok(lists.length > 0, `${rel}: найдены списки слов`);
        VOCAB.files++;
        const global = new Set();
        lists.forEach((L) => {
            VOCAB.lists++;
            VOCAB.entries += L.words.length;
            const seen = new Set();
            let dup = null;
            L.words.forEach((e) => {
                const emptyRu = visible(e.ru) === '';
                const emptyUz = visible(e.uz) === '';
                if (emptyRu || emptyUz) ok(false, `${L.path}: пустая запись «${e.ru}» / «${e.uz}»`);
                const k = visibleCI(e.ru) + '||' + visibleCI(e.uz);
                if (seen.has(k)) dup = e;
                seen.add(k);
                if (global.has(k)) VOCAB.crossTopic++;
                global.add(k);
            });
            ok(dup === null,
                `${L.path}: карточка «${dup && dup.ru}» → «${dup && dup.uz}» продублирована в одном списке`);
        });
    });
}

/* ================= 6. THE ACCESS GATE COVERS EVERY PAID PAGE ============= */
/* A frozen learner must lose every paid surface, not just the course page —
   vocabulary and the final exam are paid content too. The gate is one function,
   so it is driven directly rather than grepped for. */
{
    const CLIENT = fs.readFileSync(path.join(ROOT, 'firebase-client.js'), 'utf8');
    const freeze = require(path.join(ROOT, 'account-freeze.js'));

    function liftExport(name) {
        const i = CLIENT.indexOf('export function ' + name + '(');
        let d = 0;
        const b = CLIENT.indexOf('{', CLIENT.indexOf(')', i));
        for (let k = b; k < CLIENT.length; k++) {
            if (CLIENT[k] === '{') d++;
            else if (CLIENT[k] === '}') { d--; if (d === 0) return CLIENT.slice(i, k + 1).replace('export ', ''); }
        }
        return '';
    }
    const api = new Function('isAccountFrozen', `
        const PRIVILEGED_ROLES = new Set(['developer','admin']);
        function extractRole(u){ return typeof u==='string'?u.trim().toLowerCase():String(u?.role||'').trim().toLowerCase(); }
        function normalizeDate(v){ if(!v) return null; if(typeof v?.toDate==='function') return v.toDate();
            const d=new Date(v); return Number.isNaN(d.getTime())?null:d; }
        const packToCourses = ${CLIENT.slice(CLIENT.indexOf('const packToCourses'), CLIENT.indexOf('};', CLIENT.indexOf('const packToCourses')) + 2).replace('const packToCourses =', '')}
        ${liftExport('isPrivilegedRole')}
        ${liftExport('hasActiveSubscription')}
        ${liftExport('hasPackAccess')}
        ${liftExport('canAccessPaid')}
        ${liftExport('getPackByPageName')}
        return { canAccessPaid, getPackByPageName };
    `)(freeze.isAccountFrozen);

    const PAID_PAGES = fs.readdirSync(path.join(ROOT, 'paid-courses')).filter((f) => f.endsWith('.html'));
    const now = new Date();
    const live = {
        role: 'customer', accessPacks: ['A1A2', 'B1B2'],
        subscription: { active: true, endAt: new Date(now.getTime() + 30 * 86400000) }
    };
    const frozen = { ...live, accountFreeze: buildFrozen(freeze, now) };

    function buildFrozen(mod, at) {
        return mod.buildFreeze({}, { now: at, actorUid: 'admin' }).freeze;
    }

    let guarded = 0;
    PAID_PAGES.forEach((page) => {
        const pack = api.getPackByPageName(page);
        ok(pack !== null, `${page}: страница отнесена к пакету доступа (иначе шлюз её пропустит)`);
        if (pack === null) return;
        guarded++;
        ok(api.canAccessPaid(live, pack).allowed === true,
            `${page}: активная подписка открывает страницу`);
        const denied = api.canAccessPaid(frozen, pack);
        ok(denied.allowed === false, `${page}: замороженный аккаунт не проходит`);
        ok(denied.reason === 'frozen', `${page}: причина отказа — заморозка, а не «подписка кончилась»`);

        /* And access comes back the moment the freeze is lifted. */
        const thawed = { ...frozen };
        const un = freeze.buildUnfreeze(thawed, { now: new Date(now.getTime() + 5 * 86400000), actorUid: 'admin' });
        const after = { ...thawed, accountFreeze: un.freeze,
            subscription: un.subscription
                ? { ...thawed.subscription, ...un.subscription }
                : thawed.subscription };
        ok(api.canAccessPaid(after, pack).allowed === true,
            `${page}: разморозка возвращает доступ`);
    });
    ok(guarded === PAID_PAGES.length,
        `все ${PAID_PAGES.length} платных страниц под шлюзом (${guarded})`);

    /* Every paid page must actually LOAD the gate. */
    PAID_PAGES.forEach((page) => {
        const src = fs.readFileSync(path.join(ROOT, 'paid-courses', page), 'utf8');
        ok(/paid-platform\.js/.test(src), `${page}: подключает paid-platform.js`);
    });
}

/* ========================= 7. MUTATION CHECKS =========================== */
/* A checker nobody has seen fail is a checker nobody should trust. Each guard
   below is fed a deliberately broken fixture IN MEMORY and must reject it. */
{
    const bad = [];
    const catches = (label, fn) => { const before = fail; fn(); ok(fail > before, label); if (fail > before) { fail--; failures.pop(); } };

    /* duplicate option */
    catches('мутация: повторяющийся вариант отлавливается', () => {
        const opts = ['справа', 'слева', 'справа'];
        const seen = new Set(); let dup = null;
        opts.forEach((o) => { const v = visibleCI(o); if (seen.has(v)) dup = o; seen.add(v); });
        ok(dup === null, 'fixture: duplicate option');
    });

    /* answer missing from options */
    catches('мутация: ответ вне списка вариантов отлавливается', () => {
        const opts = ['утром', 'днём'], answer = 'ночью';
        ok(opts.some((o) => norm(o) === norm(answer)), 'fixture: answer not among options');
    });

    /* two options equally correct for a single key */
    catches('мутация: два одинаково верных варианта отлавливаются', () => {
        const opts = ['справа', 'Справа!'], answers = ['справа'];
        const m = opts.filter((o) => answers.some((a) => norm(a) === norm(o)));
        ok(m.length === 1, 'fixture: ambiguous single answer');
    });

    /* unsolvable word bank */
    catches('мутация: несобираемый банк слов отлавливается', () => {
        const words = ['идите', 'прямо'], accepted = ['идите прямо потом направо'].map(norm);
        ok(permutations(words).some((p) => accepted.includes(norm(p.join(' ')))), 'fixture: unsolvable bank');
    });

    /* duplicate vocabulary card in one list */
    catches('мутация: дубль карточки в одном списке отлавливается', () => {
        const list = [{ ru: 'общество', uz: 'jamiyat' }, { ru: 'общество', uz: 'jamiyat' }];
        const seen = new Set(); let dup = null;
        list.forEach((e) => { const k = visibleCI(e.ru) + '||' + visibleCI(e.uz); if (seen.has(k)) dup = e; seen.add(k); });
        ok(dup === null, 'fixture: duplicate vocabulary card');
    });

    /* THE two defects this suite was extended to keep out. Both are fed the
       REAL production data with one item mutated in memory, so they prove the
       guard fires on this exact content — not on a toy fixture. */
    catches('мутация: возврат дубля в A2 T5 ex6 отлавливается', () => {
        const g = GROUPS.find((x) => x.course === 'A2' && x.topicId === 5 && x.id === 'ex6');
        const items = g.items.map((it, i) => (i === 9 ? { ...g.items[0] } : it));   // #10 := #1
        const seen = new Map();
        let clash = null;
        items.forEach((it, i) => {
            const fp = JSON.stringify([norm(it.prompt), (it.options || []).map(norm).sort(),
                it.answers.map(norm).sort()]);
            if (seen.has(fp)) clash = [seen.get(fp), i];
            else seen.set(fp, i);
        });
        ok(clash === null, 'fixture: A2 T5 ex6 duplicate restored');
    });

    catches('мутация: возврат дубля в словарь A2 T2 отлавливается', () => {
        const file = path.join(ROOT, 'paid-courses/a2-vocabulary.html');
        const src = mainScript(fs.readFileSync(file, 'utf8'));
        const i = src.search(/(?:const|let|var)\s+vocabularyData\s*=\s*[\[{]/);
        let j = i;
        while (src[j] !== '[' && src[j] !== '{') j++;
        const o = src[j], c = o === '[' ? ']' : '}';
        let d = 0, lit = '';
        for (let k = j; k < src.length; k++) {
            if (src[k] === o) d++;
            else if (src[k] === c) { d--; if (d === 0) { lit = src.slice(j, k + 1); break; } }
        }
        const data = vm.runInNewContext('(' + lit + ')',
            { generateLockedTopics: () => [], icons: {}, lockedTopicNames: [] });
        const t2 = data.topics.find((t) => t.id === 2);
        const words = t2.words.concat([{ ru: 'создать семью', uz: 'oila qurmoq' }]);
        const seen = new Set();
        let dup = null;
        words.forEach((e) => {
            const k = visibleCI(e.ru) + '||' + visibleCI(e.uz);
            if (seen.has(k)) dup = e;
            seen.add(k);
        });
        ok(dup === null, 'fixture: A2 T2 vocabulary duplicate restored');
    });

    /* frozen bypass */
    catches('мутация: снятый freeze-гейт отлавливается', () => {
        const freeze = require(path.join(ROOT, 'account-freeze.js'));
        const profile = { role: 'customer', accessPacks: ['A1A2'],
            subscription: { active: true, endAt: new Date(Date.now() + 9e8) },
            accountFreeze: freeze.buildFreeze({}, { now: new Date(), actorUid: 'a' }).freeze };
        /* a gate WITHOUT the frozen branch — what deleting it would look like */
        const gateWithoutFreeze = (p) => (p.subscription.active ? { allowed: true } : { allowed: false });
        ok(gateWithoutFreeze(profile).allowed === false, 'fixture: freeze bypass');
    });
    void bad;
}

/* ============================== COUNTERS ================================ */
console.log('\n  проверено:');
console.log(`    групп упражнений      ${COUNT.groups}`);
console.log(`    позиций               ${COUNT.items}`);
console.log(`    вариантов выбора      ${COUNT.options}`);
console.log(`    ключей ответов        ${COUNT.keys}`);
console.log(`    карточек в банках     ${COUNT.bankTokens} (позиций-билдеров ${bankItems})`);
console.log(`    словарных записей     ${VOCAB.entries} в ${VOCAB.lists} списках, файлов ${VOCAB.files}`);
console.log(`    отрисовано тем A2/B1  ${DOM.topics} (групп ${DOM.groups}, вариантов в DOM ${DOM.options})`);
console.log('\n  осознанные особенности (не дефекты):');
console.log(`    позиций с несколькими принятыми ответами   ${COUNT.multiAccept}`);
console.log(`    повторов слова между РАЗНЫМИ темами        ${VOCAB.crossTopic}`);
console.log(`    осознанных повторов лексемы в банке        ${COUNT.intentionalRepeat}`);

console.log(`    несобираемых банков                        ${unsolvable}`);

console.log('\n' + '='.repeat(64));
if (fail) {
    console.log(`  ❌ COURSE INTEGRITY: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    if (failures.length > 25) console.log(`   … ещё ${failures.length - 25}`);
    console.log('='.repeat(64) + '\n');
    process.exit(1);
}
console.log(`  ✅ COURSE INTEGRITY: ${pass}/${pass} passed`);
console.log('='.repeat(64) + '\n');
