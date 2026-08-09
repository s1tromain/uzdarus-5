#!/usr/bin/env node
/**
 * verify_b2_host.cjs — integration tests for the B2 HOST LAYER.
 *
 * Drives the real engine (exercise-session.js) through the real host
 * (b2-host.js) with the real Lesson 1 data (b2-lesson-data.js), against a
 * stubbed B2 page that mimics b2-course.html's actual contracts:
 * #quizResults / .quiz-score, saveProgress(), saveB2QuizDraft/loadB2QuizDraft/
 * clearB2QuizDraft.
 *
 * Proves the things the migration must not get wrong: the ORIGINAL result
 * screen is used, Continue resumes, Restart clears, progress reaches Firebase,
 * and repeated mounts leak nothing.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) {
    if (cond) { pass++; }
    else { fail++; failures.push(label); }
}

const ENGINE = fs.readFileSync(path.join(ROOT, 'exercise-session.js'), 'utf8');
const HOST = fs.readFileSync(path.join(ROOT, 'b2-host.js'), 'utf8');
const DATA = fs.readFileSync(path.join(ROOT, 'b2-lesson-data.js'), 'utf8');

/* ------------------------------------------------------------------ page */

/**
 * Boot a page that stands in for b2-course.html: the same element ids, the
 * same function names, the same storage semantics.
 */
function boot(opts) {
    opts = opts || {};
    const dom = new JSDOM(`<!doctype html><html><body>
        <div id="lessonContent"></div>
        <div id="quizContainer"></div>
        <div id="quizResults" class="quiz-results">
            <div class="quiz-score" id="quizScore"></div>
            <div id="quizResultsBody"></div>
        </div>
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
    w.eval(HOST);
    w.eval(DATA);

    /* --- the B2 page's own state and functions, faithful to b2-course.html --- */
    const spy = {
        progressSaves: [], firebaseProgress: [], results: [], resultSaves: [],
        draftWrites: 0, draftClears: 0
    };
    const store = opts.store || {};        // stands in for localStorage+Firestore draft
    const userProgress = opts.userProgress || {};

    const deps = {
        getTopic: () => w.B2_LESSON_DATA.topics[0],
        showResults: (r) => {
            /* Exactly what b2-course.html does: fill the EXISTING screen. */
            spy.results.push(r);
            const el = w.document.getElementById('quizResults');
            el.querySelector('.quiz-score').textContent = `${r.score} / ${r.total}`;
            el.classList.add('show');
        },
        saveProgress: async (id, r) => {
            spy.progressSaves.push(id);
            userProgress[id] = { completed: true, completedAt: new Date().toISOString() };
            const completed = Object.keys(userProgress)
                .filter(k => userProgress[k] && userProgress[k].completed)
                .map(k => parseInt(k, 10)).filter(Number.isFinite).sort((a, b) => a - b);
            spy.firebaseProgress.push({ course: 'B2', completedTopics: completed });
            return r;
        },
        saveResult: async (id, r) => { spy.resultSaves.push({ id, r }); },
        saveDraft: (id, d) => { spy.draftWrites++; store['b2_quiz_draft_' + id] = JSON.stringify(d); },
        loadDraft: (id) => {
            const raw = store['b2_quiz_draft_' + id];
            try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
        },
        clearDraft: (id) => { spy.draftClears++; delete store['b2_quiz_draft_' + id]; }
    };

    return { dom, w, deps, spy, store, userProgress, errors };
}

function mount(ctx) {
    return ctx.w.B2Host.mountPractice({
        deps: ctx.deps,
        mountEl: ctx.w.document.getElementById('practiceMount'),
        title: 'Практика'
    });
}
const btnOf = (w) => w.document.querySelector('.uz-practice-btn');
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const byText = (w, sel, txt) =>
    Array.from(w.document.querySelectorAll(sel)).find(b => (b.textContent || '').includes(txt));

/* Fill the visible step correctly and advance. Returns false at the end. */
function answerStep(ctx, correct) {
    const w = ctx.w;
    const sess = w.UzExerciseSession.current();
    const g = sess ? sess.cfg.groups[sess.cursor] : null;
    if (!g) return false;
    const host = w.document.querySelector('.uz-step-host') || w.document.querySelector('.uz-body');
    (g.items || []).forEach((item, i) => {
        const key = g.id + '-' + i;
        const want = Array.isArray(item.answer) ? item.answer[0] : item.answer;
        const val = correct ? want : 'ZZZ-wrong';
        if (g.type === 'choice') {
            const row = host.querySelector(`[data-b2h-row="${key}"]`);
            if (!row) return;
            const opts = Array.from(row.querySelectorAll('.b2h-opt'));
            let target = correct
                ? opts.find(o => w.B2Host._norm(o.getAttribute('data-value')) === w.B2Host._norm(want))
                : opts.find(o => w.B2Host._norm(o.getAttribute('data-value')) !== w.B2Host._norm(want));
            if (target) click(w, target);
        } else {
            const inp = host.querySelector(`[data-b2h-input="${key}"]`);
            if (inp) {
                inp.value = val;
                inp.dispatchEvent(new w.Event('input', { bubbles: true }));
            }
        }
    });
    return true;
}

function advance(ctx) {
    const w = ctx.w;
    const check = byText(w, '.uz-foot button', 'Проверить');
    if (check) click(w, check);
    const next = byText(w, '.uz-foot button', 'Следующее упражнение') ||
                 byText(w, '.uz-foot button', 'Завершить');
    if (next) click(w, next);
    /* close() hides the modal node for reuse instead of removing it, so
       "is the modal still open" is the real end-of-run signal. */
    const modal = w.document.querySelector('.uz-modal');
    return !!next && !!modal && modal.hidden !== true;
}

/* The engine defers click-driven autosave by one macrotask on purpose, so the
   host's own click handler runs first. Real browsers flush that between the
   click and the next paint; the test must do the same rather than assert into
   the gap. */
const flush = () => new Promise(r => setTimeout(r, 0));

(async () => {
console.log('\n=== B2 HOST LAYER — INTEGRATION ===\n');

/* ------------------------------------------- 1. mount + practice card */
{
    const ctx = boot({ paid: true });
    const s = mount(ctx);
    ok(!!s, '1.1 mountPractice returns a session');
    ok(!!btnOf(ctx.w), '1.2 practice card rendered into #practiceMount');
    ok(ctx.w.document.querySelectorAll('#uz-session-styles').length === 1, '1.3 engine styles injected once');
    ok(ctx.w.document.querySelectorAll('#b2h-styles').length === 1, '1.4 host styles injected once');
    ok(!ctx.w.document.querySelector('.uz-modal'), '1.5 no modal before the card is clicked');
    ok(ctx.errors.length === 0, '1.6 no console errors on mount');
}

/* ------------------------------------------- 2. one exercise at a time */
{
    const ctx = boot({ paid: true });
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    const w = ctx.w;
    ok(w.document.querySelectorAll('.uz-modal').length === 1, '2.1 exactly one modal opens');
    const items = w.document.querySelectorAll('.b2h-item');
    const g0 = w.B2_LESSON_DATA.topics[0].exercises[0];
    ok(items.length === g0.items.length, `2.2 only group 1 in DOM (${items.length} = ${g0.items.length})`);
    ok(w.document.querySelectorAll('.b2h-audio').length === 0, '2.3 audio group not rendered on step 1');
    ok(!!w.document.querySelector('.uz-progress-fill'), '2.4 progress bar present');
}

/* ------------------------------------------- 3. full 10-group run, all correct */
{
    const ctx = boot({ paid: true });
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    let guard = 0;
    while (answerStep(ctx, true) && guard++ < 40) { if (!advance(ctx)) break; }

    const r = ctx.spy.results[0];
    ok(ctx.spy.results.length === 1, '3.1 finish() fired exactly once');
    ok(!!r && r.total === 100, `3.2 100 items graded (${r && r.total})`);
    ok(!!r && r.score === 100, `3.3 all-correct run scores 100/100 (${r && r.score})`);
    ok(!!r && r.percent === 100, '3.4 percent computed');
    ok(!!r && r.passed === true, '3.5 passed=true');
    ok(!!r && r.wrong.length === 0, '3.6 no wrong entries on a perfect run');
    ok(ctx.errors.length === 0, `3.7 no console errors across the whole run (${ctx.errors[0] || ''})`);
}

/* ------------------------------------------- 4. ORIGINAL result screen reused */
{
    const ctx = boot({ paid: true });
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    let guard = 0;
    while (answerStep(ctx, true) && guard++ < 40) { if (!advance(ctx)) break; }
    const w = ctx.w;
    const screen = w.document.getElementById('quizResults');
    ok(screen.classList.contains('show'), '4.1 B2\'s existing #quizResults is shown');
    ok(screen.querySelector('.quiz-score').textContent.trim() === '100 / 100',
        '4.2 B2\'s existing .quiz-score filled by the host');
    ok(w.document.querySelectorAll('.quiz-results').length === 1, '4.3 no SECOND result screen created');
    ok(w.document.querySelectorAll('.quiz-score').length === 1, '4.4 exactly one score element');
    ok(w.document.querySelector('.uz-modal').hidden === true,
        '4.5 modal closed before results are shown');
    ok(!/quiz-results|quizResults|quiz-score/.test(fs.readFileSync(path.join(ROOT, 'exercise-session.js'), 'utf8')),
        '4.6 engine itself contains no result-screen markup');
}

/* ------------------------------------------- 5. progress + Firebase */
{
    const ctx = boot({ paid: true });
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    let guard = 0;
    while (answerStep(ctx, true) && guard++ < 40) { if (!advance(ctx)) break; }
    ok(ctx.spy.progressSaves.length === 1, '5.1 B2 saveProgress() called once');
    ok(ctx.spy.progressSaves[0] === 1, '5.2 saveProgress called with topic 1');
    ok(ctx.userProgress[1] && ctx.userProgress[1].completed === true, '5.3 userProgress marks topic complete');
    const fb = ctx.spy.firebaseProgress[0];
    ok(!!fb && fb.course === 'B2', '5.4 Firebase sync uses the B2 course key');
    ok(!!fb && JSON.stringify(fb.completedTopics) === '[1]', '5.5 completedTopics synced as [1]');
    ok(ctx.spy.resultSaves.length === 1, '5.6 quiz result persisted');
}

/* ------------------------------------------- 6. failing run does NOT complete */
{
    const ctx = boot({ paid: true });
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    let guard = 0;
    while (answerStep(ctx, false) && guard++ < 40) { if (!advance(ctx)) break; }
    const r = ctx.spy.results[0];
    ok(!!r && r.score === 0, `6.1 all-wrong run scores 0 (${r && r.score})`);
    ok(!!r && r.passed === false, '6.2 passed=false below threshold');
    ok(ctx.spy.progressSaves.length === 0, '6.3 topic NOT marked complete on a failing run');
    ok(!!r && r.wrong.length === 100, '6.4 every wrong item reported for review');
    ok(!!r && r.wrong[0].expected != null, '6.5 wrong entries carry the expected answer');
    ok(ctx.w.document.getElementById('quizResults').classList.contains('show'),
        '6.6 the original screen still shows the failing result');
}

/* ------------------------------------------- 7. autosave -> B2's draft channel */
{
    const ctx = boot({ paid: true });
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    const w = ctx.w;
    const first = w.document.querySelector('.b2h-opt, .b2h-input');
    if (first && first.classList.contains('b2h-input')) {
        first.value = 'ч';
        first.dispatchEvent(new w.Event('input', { bubbles: true }));
    } else if (first) { click(w, first); }
    await flush();
    ok(ctx.spy.draftWrites > 0, '7.1 a single interaction reaches B2\'s draft store');
    const saved = JSON.parse(ctx.store['b2_quiz_draft_1'] || '{}');
    ok(!!saved.session, '7.2 session state stored under the `session` key');
    ok(!!saved.session && saved.session.v === 1, '7.3 state carries a version');
    ok(!!saved.session && typeof saved.session.cursor === 'number', '7.4 cursor persisted');
    ok(!!saved.session && !!saved.session.answers, '7.5 answers persisted');
}

/* --------------------------------- 8. legacy draft preserved (compat) */
{
    const store = { 'b2_quiz_draft_1': JSON.stringify({ mc: [1, 2, 3], blanks: { a: 'x' }, savedAt: 1 }) };
    const ctx = boot({ paid: true, store });
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    const w = ctx.w;
    const first = w.document.querySelector('.b2h-opt, .b2h-input');
    if (first) {
        if (first.classList.contains('b2h-input')) {
            first.value = 'x'; first.dispatchEvent(new w.Event('input', { bubbles: true }));
        } else click(w, first);
    }
    await flush();
    const saved = JSON.parse(store['b2_quiz_draft_1']);
    ok(JSON.stringify(saved.mc) === '[1,2,3]', '8.1 legacy `mc` answers preserved');
    ok(saved.blanks && saved.blanks.a === 'x', '8.2 legacy `blanks` preserved');
    ok(!!saved.session, '8.3 new session state added alongside, not instead');
}

/* ------------------------------------------- 9. Continue resumes exactly */
{
    const store = {};
    const ctx = boot({ paid: true, store });
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    answerStep(ctx, true); advance(ctx);   // finish group 1 -> cursor 1
    answerStep(ctx, true);                 // answer group 2, leave it open
    await flush();
    const cursorBefore = ctx.w.UzExerciseSession.current().cursor;
    const answersBefore = Object.keys(ctx.w.UzExerciseSession.current().answers).length;

    // Fresh page, same draft store — as if the learner came back tomorrow.
    const ctx2 = boot({ paid: true, store });
    mount(ctx2);
    click(ctx2.w, btnOf(ctx2.w));
    const ask = ctx2.w.document.querySelector('.uz-ask');
    ok(!!ask, '9.1 resume dialogue offered when a draft exists');
    const cont = byText(ctx2.w, '.uz-ask button', 'Продолжить');
    ok(!!cont, '9.2 Continue button present');
    if (cont) click(ctx2.w, cont);
    const s2 = ctx2.w.UzExerciseSession.current();
    ok(!!s2 && s2.cursor === cursorBefore, `9.3 resumes at the exact exercise (${s2 && s2.cursor} = ${cursorBefore})`);
    ok(!!s2 && Object.keys(s2.answers).length === answersBefore, '9.4 all saved answers restored');
    const g = s2 && s2.cfg.groups[s2.cursor];
    const key = g && (g.id + '-0');
    const stepHost = ctx2.w.document.querySelector('.uz-step-host');
    const back = (g && stepHost)
        ? ctx2.w.B2Host.create(ctx2.deps).readAnswer(stepHost, key, g) : '';
    ok(!!back, '9.5 restored answers are written back into the DOM');
}

/* ------------------------------------------- 10. Restart clears once */
{
    const store = {};
    const ctx = boot({ paid: true, store });
    mount(ctx);
    click(ctx.w, btnOf(ctx.w));
    answerStep(ctx, true); advance(ctx);
    await flush();
    ok(!!store['b2_quiz_draft_1'], '10.1 draft exists before restart');

    const ctx2 = boot({ paid: true, store });
    mount(ctx2);
    click(ctx2.w, btnOf(ctx2.w));
    const restart = byText(ctx2.w, '.uz-ask button', 'Начать заново');
    ok(!!restart, '10.2 Restart button present');
    if (restart) click(ctx2.w, restart);
    const s2 = ctx2.w.UzExerciseSession.current();
    ok(!!s2 && s2.cursor === 0, '10.3 restart returns to exercise 1');
    ok(!!s2 && Object.keys(s2.answers).length === 0, '10.4 restart clears answers');
    const saved = store['b2_quiz_draft_1'] ? JSON.parse(store['b2_quiz_draft_1']) : null;
    ok(!saved || !saved.session || !Object.keys(saved.session.answers || {}).length,
        '10.5 stored session state cleared');
    ok(ctx2.spy.draftClears === 1, `10.6 draft cleared exactly once, not repeatedly (${ctx2.spy.draftClears})`);
}

/* ------------------------------------------- 11. audio group */
{
    const ctx = boot({ paid: true });
    const topic = ctx.w.B2_LESSON_DATA.topics[0];
    const audioIdx = topic.exercises.findIndex(g => g.audioSrc);
    ok(audioIdx >= 0, '11.1 lesson has an audio group');
    const html = ctx.w.B2Host.create(ctx.deps).renderGroup(topic.exercises[audioIdx]);
    ok(/<audio[^>]*controls/.test(html), '11.2 audio element rendered');
    ok(html.includes('../audios/'), '11.3 paid page resolves audio one level up');

    const demo = boot({ paid: false });
    const dhtml = demo.w.B2Host.create(demo.deps).renderGroup(topic.exercises[audioIdx]);
    ok(dhtml.includes('src="audios/') && !dhtml.includes('../audios/'),
        '11.4 demo page resolves audio at the root');
    const file = path.join(ROOT, 'audios', decodeURIComponent(topic.exercises[audioIdx].audioSrc.replace('audios/', '')));
    ok(fs.existsSync(file), `11.5 audio file exists on disk (${path.basename(file)})`);
}

/* ------------------------------------------- 12. no leaks / one instance */
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
    ok(w.document.querySelectorAll('.uz-modal').length <= 1, '12.1 modals do not accumulate');
    ok(w.document.querySelectorAll('#uz-session-styles').length === 1, '12.2 still one engine style tag after 25 mounts');
    ok(w.document.querySelectorAll('#b2h-styles').length === 1, '12.3 still one host style tag after 25 mounts');
    ok(w.document.querySelectorAll('.uz-practice-btn').length <= 1, '12.4 practice card not duplicated');
    ok(ctx.errors.length === 0, `12.5 no errors across 25 mount/destroy cycles (${ctx.errors[0] || ''})`);
}

/* ------------------------------------------- 13. engine stays generic */
{
    const stripped = ENGINE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    ok(!/\bb2\b/i.test(stripped), '13.1 engine contains no B2 reference');
    ok(!/B2_LESSON_DATA|b2Host|B2Host/.test(stripped), '13.2 engine does not reference B2 host or data');
    ok(!/saveProgress|saveQuizResult|firebase/i.test(stripped), '13.3 engine has no persistence knowledge');
    ok(!/topicId\s*===\s*1|topic\s*===\s*1/.test(stripped), '13.4 engine has no per-lesson branches');
    const hstr = HOST.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    ok(!/topic\.id\s*===\s*1|topicId\s*===\s*1/.test(hstr), '13.5 host has no Lesson-1 branch');
    ok(/UzExerciseSession/.test(HOST), '13.6 host reaches the engine only through its public API');
}

/* ------------------------------------------- report */
console.log(`\n${'='.repeat(52)}`);
if (fail) {
    console.log(`FAILED  ${pass} passed, ${fail} failed\n`);
    failures.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
}
console.log(`PASSED  ${pass}/${pass} B2 host integration checks`);
console.log('='.repeat(52) + '\n');
})().catch(e => { console.error('SUITE CRASHED:', e); process.exit(1); });
