#!/usr/bin/env node
/**
 * verify_answer_review.cjs — the platform "earn your answers" flow.
 *
 * Deliberately driven by a SYNTHETIC host with a made-up course code, not by
 * B2. If these pass, the flow works for A1, A2, B1, B2 and every future course
 * without a line of host code beyond configuration — which is the whole point.
 *
 * Rules under test:
 *   pass    -> score + mistakes + correct answers + explanations + next
 *   fail    -> score + threshold ONLY. No answers. Retry / See answers.
 *   see     -> confirmation dialog first, never immediate, never confirm()
 *   shown   -> answers visible, but the only action left is a fresh attempt
 *   never   -> revealing does not pass, unlock, advance or save progress
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const ENGINE = fs.readFileSync(path.join(ROOT, 'exercise-session.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) pass++; else { fail++; failures.push(l); } };

/* ------------------------------------------------------------ synthetic host */

/** Two groups of 10, so 9/10 = 90% passes an 85% gate and 8/10 = 80% does not. */
function makeGroups() {
    const mk = (id) => ({
        id, type: 'input', title: id.toUpperCase(),
        items: Array.from({ length: 10 }, (_, i) => ({
            q: `${id} question ${i + 1}`,
            answer: `ans${i}`,
            explanation: `because ${id}-${i}`
        }))
    });
    return [mk('g1'), mk('g2')];
}

function boot(cfgExtra) {
    const dom = new JSDOM('<!doctype html><html><body><div id="m"></div></body></html>',
        { url: 'https://uzdarus.uz/courses/whatever.html', pretendToBeVisual: true, runScripts: 'outside-only' });
    const w = dom.window;
    w.Element.prototype.scrollIntoView = function () {};

    const errors = [];
    const realErr = w.console.error;
    w.console.error = (...a) => { errors.push(a.join(' ')); realErr.apply(w.console, a); };

    w.eval(ENGINE);

    const saves = [];
    const groups = makeGroups();

    const cfg = Object.assign({
        course: 'zz-future-course',
        groups,
        mountEl: w.document.getElementById('m'),
        title: 'Practice',
        passScore: 85,
        renderGroup: (g) => g.items.map((it, i) =>
            `<div><label>${it.q}</label><input data-k="${g.id}-${i}"></div>`).join(''),
        bindGroup: () => {},
        readAnswer: (root, key) => {
            const el = root.querySelector(`[data-k="${key}"]`);
            return el ? el.value : '';
        },
        writeAnswer: (root, key, v) => {
            const el = root.querySelector(`[data-k="${key}"]`);
            if (el) el.value = v == null ? '' : v;
        },
        matchItem: (item, v) => String(v || '').trim().toLowerCase() === String(item.answer).toLowerCase(),
        finish: () => ({ done: true }),
        draft: {
            save: (st) => { saves.push(JSON.parse(JSON.stringify(st))); },
            load: () => null,
            clear: () => {}
        }
    }, cfgExtra || {});

    const session = w.UzExerciseSession.mount(cfg);
    return { w, session, saves, errors, groups };
}

const click = (w, el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const act = (w, name) => w.document.querySelector(`.uz-foot [data-uz-act="${name}"]`);
const askAct = (w, name) => w.document.querySelector(`.uz-ask [data-uz-act="${name}"]`);
const verdict = (w) => w.document.querySelector('.uz-verdict');
const footText = (w) => (w.document.querySelector('.uz-foot') || {}).textContent || '';

/** Fill the visible step, leaving `wrong` items incorrect. */
function answer(ctx, wrong) {
    const { w } = ctx;
    const s = w.UzExerciseSession.current();
    const g = s.cfg.groups[s.cursor];
    const host = w.document.querySelector('.uz-step-host');
    let left = wrong;
    g.items.forEach((it, i) => {
        const el = host.querySelector(`[data-k="${g.id}-${i}"]`);
        if (!el) return;
        el.value = left-- > 0 ? 'nope' : it.answer;
        el.dispatchEvent(new w.Event('input', { bubbles: true }));
    });
}
const open = (ctx) => click(ctx.w, ctx.w.document.querySelector('.uz-practice-btn'));
const check = (ctx) => click(ctx.w, act(ctx.w, 'check'));

console.log('\n=== ANSWER-REVIEW FLOW (generic, synthetic course) ===\n');

/* ---------------------------------------------- 1. PASSED: full feedback */
{
    const ctx = boot();
    open(ctx); answer(ctx, 1); check(ctx);       // 9/10 = 90%
    const w = ctx.w, v = verdict(w);
    ok(!!v, '1.1 verdict shown');
    ok(/9 \/ 10/.test(v.textContent), '1.2 score shown');
    ok(!!v.querySelector('.uz-answers'), '1.3 mistakes listed');
    ok(/ans0|ans1|ans2/.test(v.textContent), '1.4 correct answers shown');
    ok(/because g1/.test(v.textContent), '1.5 explanations shown');
    ok(!!act(w, 'next'), '1.6 "next exercise" offered');
    ok(!act(w, 'retry') && !act(w, 'reveal'), '1.7 no retry / reveal buttons on a pass');
    click(w, act(w, 'next'));
    ok(w.UzExerciseSession.current().cursor === 1, '1.8 advancing works');
}

/* ---------------------------------------------- 2. FAILED: answers withheld */
{
    const ctx = boot();
    open(ctx); answer(ctx, 2); check(ctx);       // 8/10 = 80%
    const w = ctx.w, v = verdict(w);
    ok(/8 \/ 10/.test(v.textContent), '2.1 score shown');
    ok(/80%/.test(v.textContent), '2.2 percent shown');
    ok(/85%/.test(v.textContent), '2.3 pass threshold shown');
    ok(v.classList.contains('uz-locked'), '2.4 card is in the locked state');
    ok(!v.querySelector('.uz-answers'), '2.5 NO answer list rendered');
    ok(!/ans0/.test(v.textContent), '2.6 correct answers NOT shown');
    ok(!/because g1/.test(v.textContent), '2.7 explanations NOT shown');
    ok(/ещё раз|заново/i.test(v.textContent), '2.8 tells the learner to try again');

    ok(!!act(w, 'retry'), '2.9 "retry" button present');
    ok(!!act(w, 'reveal'), '2.10 "see answers" button present');
    ok(!act(w, 'next') && !act(w, 'finish'), '2.11 NO next button anywhere');
    ok(w.document.querySelectorAll('.uz-foot button').length === 2, '2.12 exactly two actions');
    ok(!/Следующее/.test(footText(w)), '2.13 footer never offers a way forward');
}

/* ---------------------------------------------- 3. CONFIRMATION dialog */
{
    const ctx = boot();
    open(ctx); answer(ctx, 5); check(ctx);       // 5/10 = 50%
    const w = ctx.w;
    ok(!w.document.querySelector('.uz-ask'), '3.1 no dialog before asking');
    click(w, act(w, 'reveal'));

    const ask = w.document.querySelector('.uz-ask');
    ok(!!ask, '3.2 a styled dialog opens (not confirm())');
    ok(ask.querySelector('.uz-ask-warn'), '3.3 dialog uses the warning style');
    const txt = ask.textContent;
    ok(/Javoblarni ko/.test(txt), '3.4 title is in Uzbek');
    ok(/mustaqil o/.test(txt), '3.5 explains the exercises are for independent study');
    ok(/tavsiya qilamiz/.test(txt), '3.6 recommends trying again first');
    ok(/haqiqiy bilim darajangizni oshirmaydi/.test(txt), '3.7 warns memorising does not build knowledge');
    ok(/davom etishingiz mumkin/.test(txt), '3.8 says they may still continue');
    ok(!!askAct(w, 'cancel') && /Bekor qilish/.test(askAct(w, 'cancel').textContent), '3.9 "Bekor qilish"');
    ok(!!askAct(w, 'confirm') && /Davom etish/.test(askAct(w, 'confirm').textContent), '3.10 "Davom etish"');
    ok(!verdict(w).querySelector('.uz-answers'), '3.11 answers still hidden while the dialog is open');

    /* Cancel keeps everything shut. */
    click(w, askAct(w, 'cancel'));
    ok(!w.document.querySelector('.uz-ask'), '3.12 cancel closes the dialog');
    ok(!verdict(w).querySelector('.uz-answers'), '3.13 cancel does NOT reveal answers');
    ok(!!act(w, 'reveal'), '3.14 the offer remains after cancelling');
}

/* ---------------------------------------------- 4. AFTER confirming */
{
    const ctx = boot();
    open(ctx); answer(ctx, 5); check(ctx);
    const w = ctx.w;
    const savesBefore = ctx.saves.length;
    const checkedBefore = JSON.stringify(w.UzExerciseSession.current().checked);

    click(w, act(w, 'reveal'));
    click(w, askAct(w, 'confirm'));

    const v = verdict(w);
    ok(!w.document.querySelector('.uz-ask'), '4.1 dialog closed');
    ok(v.classList.contains('uz-revealed'), '4.2 card is in the revealed state');
    ok(!!v.querySelector('.uz-answers'), '4.3 answers now shown');
    ok(/ans0/.test(v.textContent), '4.4 correct answers shown');
    ok(/because g1/.test(v.textContent), '4.5 explanations shown');
    ok(/5 \/ 10/.test(v.textContent), '4.6 score still shown');

    ok(!!act(w, 'restart'), '4.7 "Mashqni qayta boshlash" offered');
    ok(/Mashqni qayta boshlash/.test(footText(w)), '4.8 the restart label is the Uzbek one');
    ok(w.document.querySelectorAll('.uz-foot button').length === 1, '4.9 exactly ONE action remains');
    ok(!act(w, 'next') && !act(w, 'finish') && !act(w, 'reveal'), '4.10 no next / re-reveal');

    /* Requirement 4: revealing changes nothing about progress. */
    ok(ctx.saves.length === savesBefore, '4.11 revealing saves NOTHING');
    ok(JSON.stringify(w.UzExerciseSession.current().checked) === checkedBefore,
        '4.12 revealing does not alter the recorded result');
    ok(w.UzExerciseSession.current().cursor === 0, '4.13 revealing does not advance the cursor');
    ok(w.UzExerciseSession.current().checked['g1'].passed === false, '4.14 the step is still marked failed');
    ok(w.UzExerciseSession.current().solvedCount() === 0, '4.15 a revealed failure counts as 0 solved');
}

/* ---------------------------------------------- 5. RESTART after reveal */
{
    const ctx = boot();
    open(ctx); answer(ctx, 5); check(ctx);
    const w = ctx.w;
    click(w, act(w, 'reveal'));
    click(w, askAct(w, 'confirm'));
    click(w, act(w, 'restart'));

    const s = w.UzExerciseSession.current();
    ok(s.cursor === 0, '5.1 restart stays on the same exercise');
    ok(Object.keys(s.answers).length === 0, '5.2 restart clears the answers');
    ok(!s.checked['g1'], '5.3 restart clears the failed result');
    ok(!s.revealed['g1'], '5.4 restart re-arms the answer lock');
    ok(!verdict(w), '5.5 the verdict card is gone');
    ok(!!act(w, 'check'), '5.6 back to the check state');

    const host = w.document.querySelector('.uz-step-host');
    ok(host.querySelector('[data-k="g1-0"]').value === '', '5.7 inputs are empty again');

    /* And the lock really is re-armed: fail again -> answers hidden again. */
    answer(ctx, 5); check(ctx);
    ok(!verdict(w).querySelector('.uz-answers'), '5.8 answers hidden again after restart');
    ok(!!act(w, 'reveal'), '5.9 reveal must be requested again');
}

/* ---------------------------------------------- 6. PASSING after a reveal */
{
    const ctx = boot();
    open(ctx);
    answer(ctx, 5); check(ctx);
    click(ctx.w, act(ctx.w, 'reveal'));
    click(ctx.w, askAct(ctx.w, 'confirm'));
    click(ctx.w, act(ctx.w, 'restart'));

    const w = ctx.w;
    answer(ctx, 0); check(ctx);                  // 10/10 on the honest retry
    const v = verdict(w);
    ok(v.classList.contains('ok'), '6.1 a clean retry is marked correct');
    ok(!!act(w, 'next'), '6.2 the next exercise unlocks only now');
    ok(w.UzExerciseSession.current().checked['g1'].passed === true, '6.3 the step is marked passed');
    ok(w.UzExerciseSession.current().solvedCount() === 1, '6.4 it now counts as solved');
    click(w, act(w, 'next'));
    ok(w.UzExerciseSession.current().cursor === 1, '6.5 advancing works after the honest pass');
}

/* ---------------------------------------------- 7. HOST CONFIGURATION */
{
    /* Review switched off entirely. */
    const a = boot({ allowAnswerReview: false });
    open(a); answer(a, 5); check(a);
    ok(!act(a.w, 'reveal'), '7.1 allowAnswerReview:false removes the reveal button');
    ok(!!act(a.w, 'retry'), '7.2 retry is still offered');

    /* Confirmation switched off. */
    const b = boot({ requireConfirmationBeforeAnswers: false });
    open(b); answer(b, 5); check(b);
    click(b.w, act(b.w, 'reveal'));
    ok(!b.w.document.querySelector('.uz-ask'), '7.3 requireConfirmation:false skips the dialog');
    ok(!!verdict(b.w).querySelector('.uz-answers'), '7.4 answers revealed immediately');

    /* Custom text, custom labels. */
    const c = boot({
        confirmationText: { title: 'MY TITLE', body: ['line one'], cancel: 'NO', confirm: 'YES' },
        labels: { reveal: 'SHOW ME', restart: 'AGAIN' }
    });
    open(c); answer(c, 5); check(c);
    ok(/SHOW ME/.test(footText(c.w)), '7.5 reveal label overridable');
    click(c.w, act(c.w, 'reveal'));
    const ask = c.w.document.querySelector('.uz-ask');
    ok(/MY TITLE/.test(ask.textContent), '7.6 confirmation title overridable');
    ok(/line one/.test(ask.textContent), '7.7 confirmation body overridable');
    ok(/NO/.test(askAct(c.w, 'cancel').textContent), '7.8 cancel label overridable');
    ok(/YES/.test(askAct(c.w, 'confirm').textContent), '7.9 confirm label overridable');
    click(c.w, askAct(c.w, 'confirm'));
    ok(/AGAIN/.test(footText(c.w)), '7.10 restart label overridable');

    /* No threshold at all — the pre-existing behaviour for A1/A2/B1. */
    const d = boot({ passScore: undefined });
    open(d); answer(d, 5); check(d);
    ok(!!act(d.w, 'next'), '7.11 with no passScore every attempt still advances');
    ok(!!verdict(d.w).querySelector('.uz-answers'), '7.12 and answers are shown as before');
    ok(!act(d.w, 'reveal'), '7.13 no reveal button when nothing is withheld');

    /* A function gate still wins over the number. */
    const e = boot({ passScore: 10, stepGate: () => ({ pass: false, min: 99 }) });
    open(e); answer(e, 0); check(e);
    ok(!!act(e.w, 'retry'), '7.14 stepGate overrides passScore');
    ok(/99%/.test(verdict(e.w).textContent), '7.15 the gate\'s own threshold is displayed');
}

/* ---------------------------------------------- 8. ESC / backdrop */
{
    const ctx = boot();
    open(ctx); answer(ctx, 5); check(ctx);
    const w = ctx.w;
    click(w, act(w, 'reveal'));
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok(!w.document.querySelector('.uz-ask'), '8.1 Escape closes the dialog');
    ok(!verdict(w).querySelector('.uz-answers'), '8.2 Escape does not reveal answers');

    click(w, act(w, 'reveal'));
    const ask = w.document.querySelector('.uz-ask');
    click(w, ask);                                  // backdrop
    ok(!w.document.querySelector('.uz-ask'), '8.3 clicking the backdrop closes it');
    ok(!verdict(w).querySelector('.uz-answers'), '8.4 backdrop click does not reveal answers');

    click(w, act(w, 'reveal'));
    const card = w.document.querySelector('.uz-ask-card');
    click(w, card);
    ok(!!w.document.querySelector('.uz-ask'), '8.5 clicking inside the card keeps it open');
}

/* ---------------------------------------------- 9. generic, no course leaks */
{
    const stripped = ENGINE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    ok(!/\bB2\b|\bA2\b|\bA1\b|\bB1\b/.test(stripped), '9.1 engine names no course');
    ok(!/topicId\s*===|topic\s*===\s*\d|lesson\s*===/.test(stripped), '9.2 no per-topic branches');
    ok(!/confirm\(|alert\(/.test(stripped), '9.3 no native confirm() / alert()');
    ok(/DEFAULT_CONFIRM/.test(ENGINE), '9.4 the confirmation text has a platform default');
    ok(/allowAnswerReview/.test(ENGINE), '9.5 allowAnswerReview is engine-level');
    ok(/requireConfirmationBeforeAnswers/.test(ENGINE), '9.6 requireConfirmation is engine-level');
    ok(/passScore/.test(ENGINE), '9.7 passScore is engine-level');
    ok(/cfg\.confirmationText|confirmationText/.test(ENGINE), '9.8 confirmationText is engine-level');

    const errs = [];
    ['exercise-session.js'].forEach(f => {
        const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
        if (/window\.B2|B2Host|B2_LESSON/.test(src)) errs.push(f);
    });
    ok(errs.length === 0, '9.9 engine references no host by name');
}

/* ---------------------------------------------- 10. hygiene */
{
    const ctx = boot();
    for (let i = 0; i < 12; i++) {
        open(ctx); answer(ctx, 5); check(ctx);
        click(ctx.w, act(ctx.w, 'reveal'));
        click(ctx.w, askAct(ctx.w, 'confirm'));
        click(ctx.w, act(ctx.w, 'restart'));
    }
    const w = ctx.w;
    ok(w.document.querySelectorAll('.uz-ask').length === 0, '10.1 no dialog leaks after 12 cycles');
    ok(w.document.querySelectorAll('.uz-verdict').length <= 1, '10.2 verdict cards do not stack');
    ok(w.document.querySelectorAll('#uz-session-styles').length === 1, '10.3 one style tag');
    ok(ctx.errors.length === 0, `10.4 no console errors (${ctx.errors[0] || ''})`);
}

console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ ANSWER REVIEW: ${fail} failed / ${pass + fail}\n`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ ANSWER-REVIEW FLOW: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
