#!/usr/bin/env node
/**
 * verify_b2_host.cjs — integration tests for the B2 HOST LAYER.
 *
 * Drives the real engine (exercise-session.js) through the real host
 * (b2-host.js) with the real Lesson 1 data (b2-lesson-data.js), against a
 * stubbed B2 page that mimics b2-course.html's actual contracts.
 *
 * Covers the rules that make B2 different from A2: the 85% per-exercise gate,
 * the 85% topic gate, the full results screen, explicit completion, and a
 * finished topic reopening to its archived result.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) pass++; else { fail++; failures.push(l); } };

const ENGINE = fs.readFileSync(path.join(ROOT, 'exercise-session.js'), 'utf8');
const HOST = fs.readFileSync(path.join(ROOT, 'b2-host.js'), 'utf8');
const BUILDER = fs.readFileSync(path.join(ROOT, 'sentence-builder.js'), 'utf8');
const UI = fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8');
/* the shared completion contract — the summary's only action area */
const TCJS = fs.readFileSync(path.join(ROOT, 'topic-completion.js'), 'utf8');
const DATA = fs.readFileSync(path.join(ROOT, 'b2-lesson-data.js'), 'utf8');

/* ------------------------------------------------------------------ page */

function boot(opts) {
    opts = opts || {};
    const dom = new JSDOM(`<!doctype html><html><body>
        <div id="lessonContent"></div>
        <div id="quizResults" class="quiz-results"></div>
        <div id="progressFill"></div><div id="progressPercent"></div>
        <div id="practiceMount"></div>
    </body></html>`, {
        url: opts.paid ? 'https://uzdarus.uz/paid-courses/b2-course.html'
                       : 'https://uzdarus.uz/b2-demo.html',
        pretendToBeVisual: true, runScripts: 'outside-only'
    });
    const w = dom.window;
    /* jsdom implements no layout, so scrollIntoView is absent. Real browsers
       have it; stub it rather than let a harness gap masquerade as a bug. */
    w.Element.prototype.scrollIntoView = function () {};

    const errors = [];
    w.addEventListener('error', e => errors.push(String(e.message)));
    const realErr = w.console.error;
    w.console.error = (...a) => { errors.push(a.join(' ')); realErr.apply(w.console, a); };

    w.eval(ENGINE);
    w.eval(BUILDER);
    w.eval(UI);
    w.eval(TCJS);
    w.eval(HOST);
    w.eval(DATA);

    const spy = {
        results: [], resultSaves: [], completions: [], firebaseProgress: [],
        draftWrites: 0, draftClears: 0, resultHtml: [],
        /* where the shared contract sent the learner, in order */
        navigated: []
    };
    const store = opts.store || {};
    const userProgress = opts.userProgress || {};
    const resultStore = opts.resultStore || {};

    const deps = {
        getTopic: () => opts.topic || w.B2_LESSON_DATA.topics[0],
        showResults: (html, r) => {
            spy.resultHtml.push(html); spy.results.push(r);
            const el = w.document.getElementById('quizResults');
            el.innerHTML = html; el.classList.add('show');
        },
        isCompleted: (id) => !!(userProgress[id] && userProgress[id].completed),
        completeTopic: async (id, r) => {
            spy.completions.push({ id, percent: r.percent });
            resultStore[id] = r;
            userProgress[id] = { completed: true, completedAt: new Date().toISOString() };
            const completed = Object.keys(userProgress)
                .filter(k => userProgress[k] && userProgress[k].completed)
                .map(k => parseInt(k, 10)).filter(Number.isFinite).sort((a, b) => a - b);
            spy.firebaseProgress.push({ course: 'B2', completedTopics: completed });
            /* THE PAGE HANDS BACK THE LIFECYCLE'S VERDICT, and the host now
               closes the window only on a real completion. A stub that
               returned nothing used to be indistinguishable from a dropped
               connection — which is precisely the confusion that let
               "Завершить тему" close in silence on a failure. */
            return spy.completeOutcome !== undefined
                ? spy.completeOutcome
                : { ok: true, stage: 'done', exercisesCompleted: true,
                    topicCompleted: true, completedTopics: completed,
                    nextTopic: Number(id) + 1 };
        },
        /* the only per-course part of the contract: where to go next */
        isLastTopic: (id) => Number(id) >= 16,
        navigate: (next) => { spy.navigated.push(next); },
        openVocabulary: () => {},
        saveResult: (id, r) => { spy.resultSaves.push({ id, r }); resultStore[id] = r; },
        loadResult: (id) => resultStore[id] || null,
        saveDraft: (id, d) => { spy.draftWrites++; store['b2_quiz_draft_' + id] = JSON.stringify(d); },
        loadDraft: (id) => {
            const raw = store['b2_quiz_draft_' + id];
            try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
        },
        clearDraft: (id) => { spy.draftClears++; delete store['b2_quiz_draft_' + id]; }
    };

    return { dom, w, deps, spy, store, userProgress, resultStore, errors };
}

function mount(ctx, extra) {
    return ctx.w.B2Host.mountPractice(Object.assign({
        deps: ctx.deps,
        mountEl: ctx.w.document.getElementById('practiceMount')
    }, extra || {}));
}
const btnOf = (w) => w.document.querySelector('.uz-practice-btn');
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const byText = (w, sel, txt) =>
    Array.from(w.document.querySelectorAll(sel)).find(b => (b.textContent || '').includes(txt));
const stepHost = (w) => w.document.querySelector('.uz-step-host');

/** Split an accepted answer into cards the way the host's bank does. */
function splitAnswer(sentence, glue) {
    const phrases = (glue || []).slice().sort((a, b) => b.length - a.length);
    const out = [];
    let rest = String(sentence || '').trim();
    while (rest) {
        rest = rest.replace(/^\s+/, '');
        if (!rest) break;
        const low = rest.toLowerCase();
        const hit = phrases.find(ph => low.indexOf(ph.toLowerCase()) === 0);
        const tok = hit ? rest.slice(0, hit.length) : /^\S+/.exec(rest)[0];
        out.push(tok);
        rest = rest.slice(tok.length);
    }
    return out;
}

/**
 * Answer the visible step. `wrongCount` items are deliberately answered wrong,
 * so a step's exact percentage can be dialled in.
 */
function answerStep(ctx, wrongCount) {
    const w = ctx.w;
    const sess = w.UzExerciseSession.current();
    const g = sess ? sess.cfg.groups[sess.cursor] : null;
    if (!g) return false;
    const host = stepHost(w);
    let wrongLeft = wrongCount || 0;
    (g.items || []).forEach((item, i) => {
        const key = g.id + '-' + i;
        const want = Array.isArray(item.answer) ? item.answer[0] : item.answer;
        const makeWrong = wrongLeft > 0;
        if (makeWrong) wrongLeft--;
        if (g.type === 'builder') {
            /* Assemble by clicking the word cards in order; a "wrong" item is
               left deliberately incomplete. The bank is derived from the
               answers, so the tap order is derived the same way. */
            const wrap = host.querySelector(`[data-uzb="${key}"]`);
            if (!wrap) return;
            const order = splitAnswer(Array.isArray(item.answer) ? item.answer[0] : item.answer, g.glue);
            const toks = makeWrong ? order.slice(0, 1) : order;
            toks.forEach(tk => {
                const c = Array.from(wrap.querySelectorAll('.uzb-bank .uzb-tok'))
                    .find(x => x.textContent === tk);
                if (c) click(w, c);
            });
            return;
        }
        if (g.type === 'choice') {
            const row = host.querySelector(`[data-b2h-row="${key}"]`);
            if (!row) return;
            const opts = Array.from(row.querySelectorAll('.b2h-opt'));
            const target = makeWrong
                ? opts.find(o => w.B2Host._norm(o.getAttribute('data-value')) !== w.B2Host._norm(want))
                : opts.find(o => w.B2Host._norm(o.getAttribute('data-value')) === w.B2Host._norm(want));
            if (target) click(w, target);
        } else {
            const inp = host.querySelector(`[data-b2h-input="${key}"]`);
            if (inp) {
                inp.value = makeWrong ? 'ZZZ-wrong' : want;
                inp.dispatchEvent(new w.Event('input', { bubbles: true }));
            }
        }
    });
    return true;
}

const checkStep = (ctx) => {
    const b = byText(ctx.w, '.uz-foot button', 'Проверить');
    if (b) click(ctx.w, b);
    return !!b;
};
const nextStep = (ctx) => {
    const n = byText(ctx.w, '.uz-foot button', 'Следующее упражнение') ||
              byText(ctx.w, '.uz-foot button', 'Завершить');
    if (n) click(ctx.w, n);
    return !!n;
};
/* The retry control is found by its ACTION, not its wording: the label is
   product copy (now Uzbek, «Qayta topshirish») and a test that hunts for a
   particular string breaks every time the copy is translated. */
const retryBtn = (ctx) => ctx.w.document.querySelector('.uz-foot [data-uz-act="retry"]');

/** Play a whole topic, `wrongPerStep` wrong answers on every exercise. */
function playTopic(ctx, wrongPerStep) {
    let guard = 0;
    while (guard++ < 40) {
        if (!answerStep(ctx, wrongPerStep)) break;
        checkStep(ctx);
        if (retryBtn(ctx)) return 'blocked';
        if (!nextStep(ctx)) break;
        if (ctx.w.document.querySelector('.uz-summary-host .b2h-res')) return 'summary';
    }
    return 'ended';
}

const settle = () => new Promise((r) => setTimeout(r, 40));
const flush = () => new Promise(r => setTimeout(r, 0));

(async () => {
console.log('\n=== B2 HOST LAYER — INTEGRATION ===\n');

/* ------------------------------------------- 1. mount + styles */
{
    const ctx = boot({ paid: true });
    const s = mount(ctx);
    ok(!!s, '1.1 mountPractice returns a session');
    ok(!!btnOf(ctx.w), '1.2 practice card rendered');
    ok(ctx.w.document.querySelectorAll('#uz-session-styles').length === 1, '1.3 engine styles injected once');
    ok(ctx.w.document.querySelectorAll('#b2h-styles').length === 1, '1.4 host styles injected once');
    ok(ctx.w.B2Host.PASS_PERCENT === 80, '1.5 pass threshold is 80%');
    ok(ctx.errors.length === 0, '1.6 no console errors on mount');
}

/* ------------------------------------------- 2. one exercise at a time */
{
    const ctx = boot({ paid: true });
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    const w = ctx.w;
    ok(w.document.querySelectorAll('.uz-modal').length === 1, '2.1 exactly one modal opens');
    const g0 = w.B2_LESSON_DATA.topics[0].exercises[0];
    ok(w.document.querySelectorAll('.b2h-item').length === g0.items.length,
        '2.2 only the current group is in the DOM');
}

/* ------------------------------------------- 3. inline word fill */
{
    const ctx = boot({ paid: true });
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    const w = ctx.w, host = stepHost(w);
    const g = w.B2_LESSON_DATA.topics[0].exercises[0];
    ok((g.items || []).some(it => /_{3,}/.test(String(it.q || ''))), '3.1 exercise 1 prompts contain a gap');
    const slot = host.querySelector('[data-b2h-slot="ex1-0"]');
    ok(!!slot, '3.2 the gap is rendered as a live slot');
    ok(slot.textContent.indexOf('_') === 0, '3.3 slot starts empty');
    const row = host.querySelector('[data-b2h-row="ex1-0"]');
    const opts = Array.from(row.querySelectorAll('.b2h-opt'));
    click(w, opts[0]);
    ok(slot.textContent === opts[0].getAttribute('data-value'),
        `3.4 chosen word appears in the sentence ("${slot.textContent}")`);
    ok(slot.classList.contains('filled'), '3.5 slot marked filled');
    click(w, opts[1]);
    ok(slot.textContent === opts[1].getAttribute('data-value'), '3.6 changing the answer swaps the word');
    ok(row.querySelectorAll('.b2h-opt.selected').length === 1, '3.7 only one option stays selected');
    ok(host.querySelector('[data-b2h-item="ex1-0"]').classList.contains('is-filled'),
        '3.8 answered card gets the filled state');
    await flush();
}

/* ------------------------------------------- 4. 80% PER-EXERCISE GATE */
{
    /* 7/10 = 70% — below the threshold. The platform rule is 80%, so 8/10
       (which this block used to fail on, when B2 alone required 85%) is now
       a PASS and cannot be used to exercise the gate. §4b below pins that. */
    const ctx = boot({ paid: true });
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    answerStep(ctx, 3);
    checkStep(ctx);
    const w = ctx.w;
    ok(!!retryBtn(ctx), '4.1 at 70% the retry button is shown');
    ok(!byText(w, '.uz-foot button', 'Следующее упражнение'), '4.2 at 70% there is NO next button');
    const gate = w.document.querySelector('.uz-gate');
    ok(!!gate, '4.3 a gate message is shown');
    ok(gate && gate.textContent.includes('80%'), '4.4 the message names the 80% threshold');
    ok(/Mashqdan o‘tish uchun kamida/.test(gate ? gate.textContent : ''),
        '4.5 in the product\'s own words');

    const before = w.UzExerciseSession.current().cursor;
    click(w, retryBtn(ctx));
    const sess = w.UzExerciseSession.current();
    ok(sess.cursor === before, '4.6 retry stays on the SAME exercise');
    ok(Object.keys(sess.answers).filter(k => k.indexOf('ex1-') === 0).length === 0,
        '4.7 retry clears only this exercise\'s answers');
    ok(!sess.checked['ex1'], '4.8 retry clears this exercise\'s stored score');
    ok(!!byText(w, '.uz-foot button', 'Проверить'), '4.9 retry returns to the check state');
    ok(ctx.errors.length === 0, '4.10 no errors during a blocked attempt');
}

/* ------------------------------- 4b. THE BOUNDARY IS EXACTLY 80% */
{
    /* 8/10 is the first passing score. When B2 required 85% this same paper
       was blocked; the product rule is 80% for every course, so it passes. */
    const ctx = boot({ paid: true });
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    answerStep(ctx, 2);
    checkStep(ctx);
    const w = ctx.w;
    ok(!retryBtn(ctx), '4b.1 at 8/10 the exercise is PASSED — no retry button');
    ok(!!byText(w, '.uz-foot button', 'Следующее упражнение'),
        '4b.2 and the next exercise opens');
    ok(!w.document.querySelector('.uz-gate'), '4b.3 no gate message is shown');
    ok(ctx.errors.length === 0, '4b.4 no errors on a passing attempt');
}
{
    /* 9/10 = 90% — at or above the threshold. */
    const ctx = boot({ paid: true });
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    answerStep(ctx, 1);
    checkStep(ctx);
    ok(!retryBtn(ctx), '4.11 at 90% there is no retry button');
    ok(!!byText(ctx.w, '.uz-foot button', 'Следующее упражнение'), '4.12 at 90% the next button appears');
    const before = ctx.w.UzExerciseSession.current().cursor;
    nextStep(ctx);
    ok(ctx.w.UzExerciseSession.current().cursor === before + 1, '4.13 advancing works at 90%');
}
{
    const ctx = boot({ paid: true });
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    answerStep(ctx, 0);
    checkStep(ctx);
    ok(!retryBtn(ctx), '4.14 a perfect exercise is never blocked');
}

/* --------------------------- 5. TOPIC GATE at exactly 84% and 85% */
{
    /* Driven through the host's scorer directly: with the per-exercise gate on,
       a 10-item exercise cannot be passed below 90%, so a 100-item topic can
       never actually FINISH at 84%. The topic gate is therefore proven at its
       own level, where it will matter for exercises of other sizes. */
    const ctx = boot({ paid: true });
    const api = ctx.w.B2Host.create(ctx.deps);
    const topic = ctx.w.B2_LESSON_DATA.topics[0];

    const build = (correctCount) => {
        const answers = {};
        let given = 0;
        topic.exercises.forEach(g => (g.items || []).forEach((item, i) => {
            const want = Array.isArray(item.answer) ? item.answer[0] : item.answer;
            answers[g.id + '-' + i] = (given++ < correctCount) ? want : 'ZZZ-wrong';
        }));
        return answers;
    };

    /* THE BOUNDARY MOVED. These two papers used to be 84 and 85 because B2
       alone required 85%; the platform lesson rule is 80%, so the pair that
       straddles the line is now 79 and 80. Both sides are still asserted, so
       the threshold is pinned from below AND above and cannot drift again. */
    const r79 = api.score(build(79));
    ok(r79.total === 100, '5.1 topic has 100 gradable items');
    ok(r79.score === 79, '5.2 79 correct answers score 79');
    ok(r79.percent === 79, '5.3 percent is 79');
    ok(r79.passed === false, '5.4 79% does NOT pass');
    ok(r79.errors === 21, '5.5 error count reported');

    const r80 = api.score(build(80));
    ok(r80.percent === 80, '5.6 80 correct answers give exactly 80%');
    ok(r80.passed === true, '5.7 80% DOES pass — the threshold is inclusive');

    /* THE SCORE SCREEN AND THE ACTION AREA ARE NOW TWO PIECES. The screen
       reports the marks; topic-completion.js renders what can be pressed, and
       it is the same area in all four courses. Assert each where it lives. */
    const h79 = api.buildResultsHtml(r79);
    ok(h79.includes('Тема не пройдена'), '5.8 79% screen says the topic was not passed');
    ok(!h79.includes('data-uztc="finish"'), '5.9 the score screen draws no buttons of its own');
    ok(/Проходной балл/.test(h79), '5.10 79% states the threshold it missed');

    const h80 = api.buildResultsHtml(r80);
    ok(h80.includes('Тема пройдена'), '5.11 80% screen says the topic was passed');
    ok(/Порог 80% пройден/.test(h80) || !/lug‘at bo‘limini yakunlang/i.test(h80),
        '5.12 and never tells the learner to finish the deck first');

    const TC = ctx.w.UzTopicCompletion;
    const a79 = TC.renderAction({ snapshot: r79 });
    ok(!/data-uztc="finish"/.test(a79), '5.13 79% offers NO completion button');
    ok(/data-uztc="retry-exercises"/.test(a79), '5.14 79% offers another attempt');
    const a80 = TC.renderAction({ snapshot: r80 });
    ok(/data-uztc="finish"/.test(a80), '5.15 exactly 80% offers the completion button');
    ok(/Завершить тему и перейти/.test(a80), '5.16 with the shared label');
    ok(!/data-uztc="retry-exercises"/.test(a80), '5.17 and does not push a retry');
}

/* ------------------------------------------- 6. FULL RESULTS SCREEN */
{
    const ctx = boot({ paid: true });
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    const outcome = playTopic(ctx, 0);
    const w = ctx.w;

    ok(outcome === 'summary', `6.1 the run ends on the summary screen (${outcome})`);
    const modal = w.document.querySelector('.uz-modal');
    ok(!!modal && modal.hidden !== true,
        '6.2 the modal STAYS OPEN — no bounce back to the topic screen');
    const res = w.document.querySelector('.uz-summary-host .b2h-res');
    ok(!!res, '6.3 the results screen is mounted inside the session');

    const txt = res ? res.textContent : '';
    ok(res && res.querySelector('.b2h-res-pct').textContent === '100%', '6.4 overall percent shown');
    ok(txt.includes('100/100'), '6.5 overall score shown');
    ok(txt.includes('Правильных'), '6.6 correct count shown');
    ok(txt.includes('Ошибок'), '6.7 error count shown');
    ok(res && res.querySelectorAll('.b2h-row').length === 10,
        '6.8 per-exercise statistics for all 10 exercises');
    ok(res && !!res.querySelector('.b2h-res-ring i'), '6.9 progress bar shown');
    ok(res && !!res.querySelector('.b2h-tips'), '6.10 recommendations shown');
    ok(res && res.querySelectorAll('.b2h-tips li').length > 0, '6.11 recommendations are not empty');
    ok(res && !!res.querySelector('[data-uztc="finish"]'), '6.12 the completion button is offered at 100%');
    ok(ctx.spy.completions.length === 0, '6.13 nothing completed before the button is pressed');
    ok(ctx.spy.resultHtml.length === 1, '6.14 the page mirror was written once');
    ok(w.document.getElementById('quizResults').classList.contains('show'),
        '6.15 the page\'s existing #quizResults holds the same screen');
    ok(w.document.querySelectorAll('.b2h-res').length === 2,
        '6.16 two mounts of ONE builder (modal + page), not two screens');
    ok(ctx.errors.length === 0, `6.17 no console errors (${ctx.errors[0] || ''})`);
}

/* ------------------------------------------- 7. EXPLICIT COMPLETION */
{
    const ctx = boot({ paid: true });
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    playTopic(ctx, 0);
    const w = ctx.w;
    /* ONE BUTTON, drawn by topic-completion.js and shared with A1, A2 and B1.
       The old per-course action row is gone; so are its selectors. */
    const btn = w.document.querySelector('.uz-summary-host [data-uztc="finish"]');
    ok(!!btn, '7.1 the shared completion button is present');
    ok(!!btn && /Завершить тему и перейти/.test(btn.textContent || ''),
        `7.1b labelled for the learner (${btn && btn.textContent})`);
    if (btn) click(w, btn);
    await flush(); await flush(); await settle();

    ok(ctx.spy.completions.length === 1, '7.2 completeTopic called exactly once');
    ok(ctx.spy.completions[0] && ctx.spy.completions[0].id === 1, '7.3 completed the right topic');
    ok(ctx.userProgress[1] && ctx.userProgress[1].completed === true, '7.4 completedTopics updated');
    const fb = ctx.spy.firebaseProgress[0];
    ok(!!fb && fb.course === 'B2', '7.5 Firebase sync uses the B2 course key');
    ok(!!fb && JSON.stringify(fb.completedTopics) === '[1]', '7.6 completedTopics synced as [1]');
    ok(!!ctx.resultStore[1], '7.7 the attempt result is stored for later');
    ok(w.document.querySelector('.uz-modal').hidden === true, '7.8 modal closes after completing');
    ok(ctx.spy.navigated.length === 1, '7.9 and the learner is taken onward exactly once');
    ok(ctx.spy.navigated[0] === 2, `7.10 to the NEXT topic (${ctx.spy.navigated[0]})`);
}

/* --------------------------- 7b. A COMPLETION THAT DID NOT COMPLETE

   The learner pressed the button and the network refused, or the topic is
   still missing its vocabulary half. Neither may look like success: the
   window stays, the reason is on screen, and the button offered does the
   right thing. */
{
    const ctx = boot({ paid: true });
    ctx.spy.completeOutcome = null;              // a rejected / absent verdict
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    playTopic(ctx, 0);
    const w = ctx.w;
    const btn = w.document.querySelector('.uz-summary-host [data-uztc="finish"]');
    if (btn) click(w, btn);
    await flush(); await flush(); await settle();

    ok(w.document.querySelector('.uz-modal').hidden === false,
        '7b.1 a failed completion does NOT close the window');
    const panel = w.document.querySelector('[data-uztc-area]');
    ok(!!panel, '7b.2 the action area is still there');
    const note = panel && panel.querySelector('.uztc-note');
    ok(!!note && /uztc-err/.test(note.className), '7b.3 marked as an error');
    ok(!!note && (note.textContent || '').length > 10, '7b.4 with a readable message');
    ok(!!panel && !!panel.querySelector('[data-uztc="finish"]'), '7b.5 and a button that retries');
    ok(ctx.spy.navigated.length === 0, '7b.6 and the learner is NOT taken anywhere');
}

/* The server refuses even though the exercises landed: an anomaly, and it
   must read as one — never as "go and finish the vocabulary first". */
{
    const ctx = boot({ paid: true });
    ctx.spy.completeOutcome = { ok: true, stage: 'done', exercisesCompleted: true,
        topicCompleted: false, completedTopics: [], message: null };
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    playTopic(ctx, 0);
    const w = ctx.w;
    const btn = w.document.querySelector('.uz-summary-host [data-uztc="finish"]');
    if (btn) click(w, btn);
    await flush(); await flush(); await settle();

    ok(w.document.querySelector('.uz-modal').hidden === false,
        '7c.1 a server that refuses does NOT close the window either');
    const panel = w.document.querySelector('[data-uztc-area]');
    const note = panel && panel.querySelector('.uztc-note');
    ok(!!note && /uztc-err/.test(note.className), '7c.2 it is reported as a failure');
    ok(!/lug‘at bo‘limini yakunlang/i.test(String(note && note.textContent)),
        '7c.3 and NEVER as an errand to the vocabulary deck');
    ok(ctx.spy.completions.length === 1, '7c.4 the exercises were still reported once');
    ok(ctx.spy.navigated.length === 0, '7c.5 and nothing unlocked');
    ok(!ctx.store['b2_quiz_draft_1'], '7.9 the draft is cleared once the topic is graded');
}

/* --------------------------- 8. FAILING TOPIC NEVER COMPLETES */
{
    const ctx = boot({ paid: true });
    const api = ctx.w.B2Host.create(ctx.deps);
    const r = api.score({});                       // nothing answered at all
    ok(r.percent === 0, '8.1 an empty attempt scores 0%');
    ok(r.passed === false, '8.2 an empty attempt does not pass');

    const w = ctx.w;
    const holder = w.document.createElement('div');
    holder.innerHTML = api.buildResultsHtml(r);
    w.document.body.appendChild(holder);
    api.bindSummary(holder, r, { close() {}, reset() {}, open() {} });
    ok(!holder.querySelector('[data-uztc="finish"]'), '8.3 no completion button below the threshold');
    const again = holder.querySelector('[data-uztc="retry-exercises"]');
    ok(!!again, '8.3b but another attempt is offered');
    if (again) click(w, again);
    await flush();
    ok(ctx.spy.completions.length === 0, '8.4 a failing topic never reaches completeTopic');
    ok(!ctx.userProgress[1], '8.5 progress untouched by a failed attempt');
}

/* --------------------------- 9. REOPENING A COMPLETED TOPIC */
{
    const stored = {
        topicId: 1, score: 96, total: 100, errors: 4, percent: 96, passed: true,
        passPercent: 85, timestamp: new Date().toISOString(), wrong: [],
        breakdown: [{ id: 'ex1', title: '1-mashq', correct: 10, total: 10, percent: 100 }]
    };
    const ctx = boot({
        paid: true,
        userProgress: { 1: { completed: true, completedAt: '2026-01-01' } },
        resultStore: { 1: stored }
    });
    const s = mount(ctx);
    const w = ctx.w;

    ok(s === null, '9.1 no session is started for a finished topic');
    ok(!btnOf(w), '9.2 no "Открыть задания" / "Продолжить" button is offered');
    const mountEl = w.document.getElementById('practiceMount');
    ok(!!mountEl.querySelector('.b2h-res'), '9.3 the last result is shown instead');
    ok(mountEl.querySelector('.b2h-res-pct').textContent === '96%', '9.4 the stored percent is shown');
    ok(mountEl.textContent.includes('96/100'), '9.5 the stored score is shown');
    ok(mountEl.textContent.includes('Тема завершена'), '9.6 it reads as a finished topic');
    ok(!mountEl.querySelector('[data-uztc="finish"]'), '9.7 no second completion is possible');
    ok(!mountEl.querySelector('[data-uztc="retry-exercises"]'), '9.8 no retake is offered yet (by design)');
    ok(!w.document.querySelector('.uz-modal'), '9.9 nothing opens automatically');

    const ctx2 = boot({ paid: true, userProgress: { 1: { completed: true } } });
    ok(mount(ctx2) !== null, '9.10 completed but resultless topic falls back to the exercises');
}

/* --------------------------- 10. draft, resume, restart */
{
    const store = {};
    const ctx = boot({ paid: true, store });
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    click(ctx.w, ctx.w.document.querySelector('.b2h-opt'));
    await flush();
    ok(ctx.spy.draftWrites > 0, '10.1 a single interaction reaches the draft store');
    const saved = JSON.parse(store['b2_quiz_draft_1'] || '{}');
    ok(!!saved.session, '10.2 session state stored under the `session` key');
    ok(!!saved.session && saved.session.v === 1, '10.3 state carries a version');

    answerStep(ctx, 0); checkStep(ctx); nextStep(ctx);
    const cursorBefore = ctx.w.UzExerciseSession.current().cursor;
    await flush();

    const ctx2 = boot({ paid: true, store });
    mount(ctx2);
    click(ctx2.w, btnOf(ctx2.w));
    ok(!!ctx2.w.document.querySelector('.uz-ask'), '10.4 resume dialogue offered');
    const cont = byText(ctx2.w, '.uz-ask button', 'Davom ettirish');
    ok(!!cont, '10.5 Continue offered');
    if (cont) click(ctx2.w, cont);
    ok(ctx2.w.UzExerciseSession.current().cursor === cursorBefore,
        '10.6 Continue resumes at the exact exercise');
    const g = ctx2.w.UzExerciseSession.current().cfg.groups[cursorBefore];
    const restored = ctx2.w.B2Host.create(ctx2.deps).readAnswer(stepHost(ctx2.w), g.id + '-0', g);
    ok(typeof restored === 'string', '10.7 answers are restored into the DOM');

    const ctx3 = boot({ paid: true, store });
    mount(ctx3);
    click(ctx3.w, btnOf(ctx3.w));
    const again = byText(ctx3.w, '.uz-ask button', 'Qaytadan boshlash');
    if (again) click(ctx3.w, again);
    ok(ctx3.w.UzExerciseSession.current().cursor === 0, '10.8 Restart returns to exercise 1');
    ok(Object.keys(ctx3.w.UzExerciseSession.current().answers).length === 0, '10.9 Restart clears answers');
}

/* --------------------------- 11. legacy draft compatibility */
{
    const store = { 'b2_quiz_draft_1': JSON.stringify({ mc: [1, 2, 3], blanks: { a: 'x' }, savedAt: 1 }) };
    const ctx = boot({ paid: true, store });
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    click(ctx.w, ctx.w.document.querySelector('.b2h-opt'));
    await flush();
    const saved = JSON.parse(store['b2_quiz_draft_1']);
    ok(JSON.stringify(saved.mc) === '[1,2,3]', '11.1 legacy `mc` answers preserved');
    ok(saved.blanks && saved.blanks.a === 'x', '11.2 legacy `blanks` preserved');
    ok(!!saved.session, '11.3 new session state added alongside, not instead');
}

/* --------------------------- 12. audio + paths */
{
    const ctx = boot({ paid: true });
    const topic = ctx.w.B2_LESSON_DATA.topics[0];
    const idx = topic.exercises.findIndex(g => g.audioSrc);
    ok(idx >= 0, '12.1 lesson has an audio group');
    const html = ctx.w.B2Host.create(ctx.deps).renderGroup(topic.exercises[idx]);
    ok(/<audio[^>]*controls/.test(html), '12.2 audio element rendered');
    ok(html.includes('../audios/'), '12.3 paid page resolves audio one level up');
    const demo = boot({ paid: false });
    const dhtml = demo.w.B2Host.create(demo.deps).renderGroup(topic.exercises[idx]);
    ok(dhtml.includes('src="audios/') && !dhtml.includes('../audios/'),
        '12.4 demo page resolves audio at the root');
    const file = path.join(ROOT, 'audios',
        decodeURIComponent(topic.exercises[idx].audioSrc.replace('audios/', '')));
    ok(fs.existsSync(file), `12.5 audio file exists (${path.basename(file)})`);
}

/* --------------------------- 13. no leaks */
{
    const ctx = boot({ paid: true });
    const w = ctx.w;
    for (let i = 0; i < 25; i++) {
        const s = mount(ctx);
        click(w, btnOf(w));
        const closeBtn = w.document.querySelector('.uz-modal .uz-close');
        if (closeBtn) click(w, closeBtn);
        if (s && s.destroy) s.destroy();
    }
    ok(w.document.querySelectorAll('.uz-modal').length <= 1, '13.1 modals do not accumulate');
    ok(w.document.querySelectorAll('#uz-session-styles').length === 1, '13.2 one engine style tag after 25 mounts');
    ok(w.document.querySelectorAll('#b2h-styles').length === 1, '13.3 one host style tag after 25 mounts');
    ok(w.document.querySelectorAll('.uz-practice-btn').length <= 1, '13.4 practice card not duplicated');
    ok(ctx.errors.length === 0, `13.5 no errors across 25 cycles (${ctx.errors[0] || ''})`);
}

/* --------------------------- 14. engine stays generic */
{
    const stripped = ENGINE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    ok(!/\bb2\b/i.test(stripped), '14.1 engine contains no B2 reference');
    ok(!/B2_LESSON_DATA|B2Host/.test(stripped), '14.2 engine does not reference B2 host or data');
    ok(!/saveProgress|saveQuizResult|firebase/i.test(stripped), '14.3 engine has no persistence knowledge');
    ok(!/topicId\s*===\s*1|topic\s*===\s*1/.test(stripped), '14.4 engine has no per-lesson branches');
    /* a bare "85" also occurs as an rgba alpha, so assert on the SEMANTICS:
       no threshold constant, no percentage comparison anywhere in the engine */
    ok(!/PASS_PERCENT|passPercent|>=\s*85|85\s*%/.test(stripped),
        '14.5 the 85% threshold does NOT live in the engine');
    ok(/cfg\.stepGate/.test(ENGINE), '14.6 engine exposes a generic gate hook');
    ok(/cfg\.renderSummary/.test(ENGINE), '14.7 engine exposes a generic summary hook');
    const hstr = HOST.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    ok(!/topic\.id\s*===\s*1|topicId\s*===\s*1/.test(hstr), '14.8 host has no Lesson-1 branch');
    ok((HOST.match(/PASS_PERCENT = 80;/g) || []).length === 1,
        '14.9 the threshold is defined exactly once');
    ok(!/PASS_PERCENT = 85;/.test(HOST), '14.10 and the old 85% value is gone');
}

console.log('='.repeat(52));
if (fail) {
    console.log(`FAILED  ${pass} passed, ${fail} failed\n`);
    failures.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
}
console.log(`PASSED  ${pass}/${pass} B2 host integration checks`);
console.log('='.repeat(52) + '\n');
})().catch(e => { console.error('SUITE CRASHED:', e); process.exit(1); });
