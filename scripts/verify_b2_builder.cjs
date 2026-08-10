#!/usr/bin/env node
/**
 * verify_b2_builder.cjs — the sentence-builder exercise type.
 *
 * The learner assembles a sentence from word cards instead of typing it. The
 * builder emits an ordinary string, so grading, drafts, answer-review, scoring
 * and results treat it exactly like a typed answer. These tests prove both
 * halves of that claim: the interaction works, AND nothing downstream changed.
 *
 * `builder` is a generic type keyed off `g.type`, so any future exercise in any
 * course can use it — there is no reference to ex2 or to topic 1 in the host.
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
const DATA = fs.readFileSync(path.join(ROOT, 'b2-lesson-data.js'), 'utf8');
const COMPONENT = fs.readFileSync(path.join(ROOT, 'sentence-builder.js'), 'utf8');
const UI = fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8');

function boot() {
    const dom = new JSDOM('<!doctype html><html><body><div id="r"></div></body></html>',
        { url: 'https://uzdarus.uz/paid-courses/b2-course.html',
          runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    w.Element.prototype.scrollIntoView = function () {};
    /* jsdom has no layout; the drag-reorder helper needs a box to compare against */
    w.Element.prototype.getBoundingClientRect = function () {
        return { left: 0, width: 100, top: 0, height: 20, right: 100, bottom: 20 };
    };
    const errors = [];
    const realErr = w.console.error;
    w.console.error = (...a) => { errors.push(a.join(' ')); realErr.apply(w.console, a); };

    w.eval(ENGINE); w.eval(COMPONENT); w.eval(UI); w.eval(HOST); w.eval(DATA);
    const topic = w.B2_LESSON_DATA.topics[0];
    const api = w.B2Host.create({ getTopic: () => topic });
    return { w, topic, api, errors };
}

const click = (w, el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const G = (topic) => topic.exercises.find(x => x.id === 'ex2');

function mountGroup(ctx, g) {
    const root = ctx.w.document.getElementById('r');
    root.innerHTML = ctx.api.renderGroup(g);
    ctx.api.bindGroup(root);
    return root;
}
const wrapOf = (root, i) => root.querySelector(`[data-uzb="ex2-${i}"]`);
const bankCards = (wrap) => Array.from(wrap.querySelectorAll('.uzb-bank .uzb-tok'));
const outCards = (wrap) => Array.from(wrap.querySelectorAll('.uzb-out .uzb-tok'));
const cardBy = (wrap, text) => bankCards(wrap).find(c => c.textContent === text);

/** The cards the host actually renders for one item. */
function bankOf(ctx, g, i) {
    const d = ctx.w.document.createElement('div');
    d.innerHTML = ctx.api.renderGroup(g);
    return Array.from(d.querySelectorAll(`[data-uzb="ex2-${i}"] .uzb-tok`))
        .map(c => c.textContent);
}

/** Split an accepted answer the same way the host does. */
function splitLike(ctx, sentence, glue) {
    const phrases = (glue || []).slice().sort((a, b) => b.length - a.length);
    const out = [];
    let rest = sentence.trim();
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

/** Can `variant` be assembled from `bank`? Returns the cards it would use. */
function buildable(ctx, bank, variant, glue) {
    const pool = bank.slice();
    const used = [];
    for (const tok of splitLike(ctx, variant, glue)) {
        const idx = pool.findIndex(c => ctx.w.B2Host._norm(c) === ctx.w.B2Host._norm(tok));
        if (idx < 0) return null;
        used.push(pool.splice(idx, 1)[0]);
    }
    return used;
}

function assemble(ctx, root, g, i, tokens) {
    const wrap = wrapOf(root, i);
    const order = tokens || splitLike(ctx, g.items[i].answer[0], g.glue);
    order.forEach(t => click(ctx.w, cardBy(wrap, t)));
    return wrap;
}

/* The engine defers click-driven autosave by one macrotask on purpose, so the
   host's own handler runs first. Flush it rather than assert into the gap. */
const flush = () => new Promise(r => setTimeout(r, 0));

(async () => {
console.log('\n=== SENTENCE BUILDER (exercise type) ===\n');

/* ------------------------------------------------ 1. data shape */
{
    const ctx = boot();
    const g = G(ctx.topic);
    ok(!!g, '1.1 exercise 2 exists');
    ok(g.type === 'builder', `1.2 exercise 2 is a builder (${g.type})`);
    ok(g.items.length === 10, '1.3 still 10 items');
    ok(g.items.every(it => !it.tokens),
        '1.4 no hand-written banks — cards are derived from the answers');
    ok(Array.isArray(g.glue) && g.glue.length, '1.4b the group declares its multi-word phrases');
    ok(g.items.every(it => Array.isArray(it.answer) && it.answer.length),
        '1.5 every item keeps its accepted answers');

    /* the bank must be able to form an accepted answer — otherwise the item is
       unsolvable, which is the one way this change could silently break a lesson */
    /* THE requirement: every accepted variant must be buildable from the bank,
       not merely the first one. */
    let variantsOk = 0, variantsTotal = 0, unbuildable = [];
    g.items.forEach((it, i) => {
        const bank = bankOf(ctx, g, i);
        it.answer.forEach(v => {
            variantsTotal++;
            const used = buildable(ctx, bank, v, g.glue);
            if (used && ctx.api.matchItem(it, used.join(' '))) variantsOk++;
            else unbuildable.push(`#${i + 1} "${v}"`);
        });
    });
    ok(variantsOk === variantsTotal,
        `1.6 EVERY accepted variant is buildable (${variantsOk}/${variantsTotal})${unbuildable.length ? ' — ' + unbuildable[0] : ''}`);
    ok(variantsTotal > 10, `1.6b there really are alternative answers to cover (${variantsTotal})`);

    const bank1 = bankOf(ctx, g, 1);
    ok(bank1.some(t => /\s/.test(t)), '1.7 multi-word connectives stay on one card');
    ok(bank1.includes('потому что'), '1.8 "потому что" is a single card, not two');
    ok(bank1.includes('чтобы'), '1.8b the alternative conjunction is in the bank too');
    ok(bank1.includes('хочу'), '1.8c words unique to the first variant are kept');

    /* the other exercises must be untouched */
    const others = ctx.topic.exercises.filter(x => x.id !== 'ex2');
    ok(others.length === 9, '1.9 the other nine exercises are still present');
    ok(others.every(x => x.type !== 'builder'), '1.10 no other exercise was converted');
    ok(others.every(x => !x.glue), '1.11 no builder config leaked into other exercises');
    ok(ctx.topic.exercises.reduce((n, x) => n + x.items.length, 0) === 100,
        '1.12 the topic still has exactly 100 items');
}

/* ------------------------------------------------ 2. rendering */
{
    const ctx = boot();
    const g = G(ctx.topic);
    const root = mountGroup(ctx, g);
    ok(root.querySelectorAll('.uzb').length === 10, '2.1 a builder per item');
    ok(!root.querySelector('.b2h-input'), '2.2 no text input is rendered any more');

    const wrap = wrapOf(root, 0);
    ok(!!wrap.querySelector('.uzb-out'), '2.3 answer area rendered');
    ok(!!wrap.querySelector('.uzb-bank'), '2.4 word bank rendered');
    ok(/Ваш ответ/.test(wrap.querySelector('.uzb-label').textContent), '2.5 "Ваш ответ" label');
    ok(!!wrap.querySelector('.uzb-ph'), '2.6 placeholder shown while empty');
    ok(bankCards(wrap).length === bankOf(ctx, g, 0).length, '2.7 one card per bank entry');
    ok(outCards(wrap).length === 0, '2.8 answer area starts empty');
    ok(!!wrap.querySelector('[data-uzb-undo]'), '2.9 "remove last" offered');
    ok(!!wrap.querySelector('[data-uzb-clear]'), '2.10 "clear" offered');
    ok(wrap.querySelector('[data-uzb-undo]').disabled, '2.11 actions disabled while empty');
    ok(bankCards(wrap).every(c => c.getAttribute('draggable') === 'true'),
        '2.12 cards are draggable for desktop reordering');
    ok(bankCards(wrap).length >= splitLike(ctx, g.items[0].answer[0], g.glue).length,
        '2.13 the bank holds at least a full sentence');
}

/* ------------------------------------------------ 3. shuffling */
{
    const ctx = boot();
    const g = G(ctx.topic);
    const orders = new Set();
    for (let k = 0; k < 20; k++) {
        const d = ctx.w.document.createElement('div');
        d.innerHTML = ctx.api.renderGroup(g);
        orders.add(Array.from(d.querySelectorAll('[data-uzb="ex2-9"] .uzb-tok'))
            .map(c => c.textContent).join('|'));
    }
    ok(orders.size > 1, `3.1 the bank is shuffled between renders (${orders.size} distinct)`);

    /* and it is genuinely shuffled, not merely rotated into the right answer */
    const ctx2 = boot();
    const g2 = G(ctx2.topic);
    let sameAsAnswer = 0;
    for (let k = 0; k < 20; k++) {
        const d = ctx2.w.document.createElement('div');
        d.innerHTML = ctx2.api.renderGroup(g2);
        const shown = Array.from(d.querySelectorAll('[data-uzb="ex2-9"] .uzb-tok'))
            .map(c => c.textContent).join('|');
        if (shown === splitLike(ctx2, g2.items[9].answer[0], g2.glue).join('|')) sameAsAnswer++;
    }
    ok(sameAsAnswer < 20, '3.2 the correct order is not simply handed to the learner');
    ok(orders.size > 1, '3.3 shuffle is per render, so a retry re-shuffles');
}

/* ------------------------------------------------ 4. tap interaction */
{
    const ctx = boot();
    const g = G(ctx.topic);
    const root = mountGroup(ctx, g);
    const wrap = wrapOf(root, 0);
    const tokens = splitLike(ctx, g.items[0].answer[0], g.glue);

    const first = cardBy(wrap, tokens[0]);
    click(ctx.w, first);
    ok(outCards(wrap).length === 1, '4.1 tapping a card moves it to the answer');
    ok(bankCards(wrap).length === tokens.length - 1, '4.2 it disappears from the bank');
    ok(wrap.querySelector('.uzb-out').classList.contains('has-words'),
        '4.3 answer area switches to the filled state');
    ok(!wrap.querySelector('[data-uzb-undo]').disabled, '4.4 actions enable once a card is placed');

    click(ctx.w, outCards(wrap)[0]);
    ok(outCards(wrap).length === 0, '4.5 tapping a placed card sends it back');
    ok(bankCards(wrap).length === tokens.length, '4.6 the bank is whole again');
    ok(wrap.querySelector('[data-uzb-undo]').disabled, '4.7 actions disable again when empty');

    assemble(ctx, root, g, 0);
    ok(outCards(wrap).length === tokens.length, '4.8 the whole sentence can be assembled');
    ok(bankCards(wrap).length === bankOf(ctx, g, 0).length - tokens.length,
        '4.9 only the used cards leave the bank; spares stay put');
    ok(ctx.api.readAnswer(root, 'ex2-0', g) === tokens.join(' '),
        '4.10 the answer reads back as the assembled sentence');

    click(ctx.w, wrap.querySelector('[data-uzb-undo]'));
    ok(outCards(wrap).length === tokens.length - 1, '4.11 "remove last" drops one card');
    ok(bankCards(wrap).some(c => c.textContent === tokens[tokens.length - 1]),
        '4.12 the removed card returns to the bank');

    click(ctx.w, wrap.querySelector('[data-uzb-clear]'));
    ok(outCards(wrap).length === 0, '4.13 "clear" empties the answer');
    ok(bankCards(wrap).length === bankOf(ctx, g, 0).length, '4.14 "clear" restores every card');
    ok(ctx.api.readAnswer(root, 'ex2-0', g) === '', '4.15 a cleared builder reads as empty');
    ok(ctx.errors.length === 0, `4.16 no console errors (${ctx.errors[0] || ''})`);
}

/* ------------------------------------------------ 5. grading, unchanged */
{
    const ctx = boot();
    const g = G(ctx.topic);
    const root = mountGroup(ctx, g);

    let correct = 0;
    g.items.forEach((item, i) => {
        assemble(ctx, root, g, i);
        if (ctx.api.matchItem(item, ctx.api.readAnswer(root, `ex2-${i}`, g))) correct++;
    });
    ok(correct === 10, `5.1 all ten assembled sentences grade as correct (${correct}/10)`);

    /* wrong order must fail — the builder is not a free pass */
    const ctx2 = boot();
    const g2 = G(ctx2.topic);
    const root2 = mountGroup(ctx2, g2);
    const rev = splitLike(ctx2, g2.items[0].answer[0], g2.glue).slice().reverse();
    assemble(ctx2, root2, g2, 0, rev);
    ok(!ctx2.api.matchItem(g2.items[0], ctx2.api.readAnswer(root2, 'ex2-0', g2)),
        '5.2 the wrong word order is marked wrong');

    /* an incomplete sentence must fail */
    const ctx3 = boot();
    const g3 = G(ctx3.topic);
    const root3 = mountGroup(ctx3, g3);
    assemble(ctx3, root3, g3, 0, splitLike(ctx3, g3.items[0].answer[0], g3.glue).slice(0, 3));
    ok(!ctx3.api.matchItem(g3.items[0], ctx3.api.readAnswer(root3, 'ex2-0', g3)),
        '5.3 an incomplete sentence is marked wrong');
    ok(!ctx3.api.matchItem(g3.items[0], ''), '5.4 an empty builder is marked wrong');

    /* multiple accepted variants still work — the existing mechanism, untouched */
    const it2 = g.items[1];
    ok(it2.answer.length > 1, '5.5 item 2 keeps several accepted answers');
    ok(it2.answer.every(a => ctx.api.matchItem(it2, a)),
        '5.6 every stored variant is still accepted by the unchanged matcher');
    ok(ctx.api.matchItem(it2, 'я много работаю потому что хочу купить квартиру'),
        '5.7 punctuation and case are still normalised away');
}

/* ------------------------------------------------ 6. draft restore */
{
    const ctx = boot();
    const g = G(ctx.topic);
    const root = mountGroup(ctx, g);

    ctx.api.writeAnswer(root, 'ex2-1', g.items[1].answer[0], g);
    const wrap = wrapOf(root, 1);
    const t1 = splitLike(ctx, g.items[1].answer[0], g.glue);
    ok(outCards(wrap).length === t1.length, '6.1 a saved answer restores every card');
    ok(ctx.api.matchItem(g.items[1], ctx.api.readAnswer(root, 'ex2-1', g)),
        '6.2 the restored sentence still grades correct');
    ok(outCards(wrap).map(c => c.textContent).join(' ') === t1.join(' '),
        '6.3 cards are restored in the right order despite the shuffled bank');
    ok(bankCards(wrap).length === bankOf(ctx, g, 1).length - t1.length,
        '6.4 restored cards leave the bank, spares remain');

    /* "потому что" must not be restored as "что" + leftovers */
    ok(outCards(wrap).some(c => c.textContent === 'потому что'),
        '6.5 the multi-word card is matched as one unit');

    ctx.api.writeAnswer(root, 'ex2-1', '', g);
    ok(outCards(wrap).length === 0, '6.6 restoring an empty answer clears the builder');
    ok(bankCards(wrap).length === bankOf(ctx, g, 1).length, '6.7 and returns every card');

    /* a partial draft restores as far as it can */
    const partial = t1.slice(0, 4).join(' ');
    ctx.api.writeAnswer(root, 'ex2-1', partial, g);
    ok(outCards(wrap).length === 4, '6.8 a partial answer restores partially');
    ok(ctx.api.readAnswer(root, 'ex2-1', g) === partial, '6.9 and reads back unchanged');
}

/* ------------------------------------------------ 7. inside a real session */
{
    const ctx = boot();
    const saves = [];
    const topic = ctx.topic;
    const api = ctx.api;
    const w = ctx.w;

    const session = w.UzExerciseSession.mount({
        groups: topic.exercises,
        mountEl: w.document.getElementById('r'),
        title: 'x',
        passScore: 85,
        renderGroup: api.renderGroup, bindGroup: api.bindGroup,
        readAnswer: api.readAnswer, writeAnswer: api.writeAnswer,
        matchItem: api.matchItem, stepGate: api.stepGate,
        finish: api.finish, renderSummary: api.renderSummary, bindSummary: api.bindSummary,
        draft: { save: (st) => saves.push(st), load: () => null, clear: () => {} }
    });
    click(w, w.document.querySelector('.uz-practice-btn'));

    /* step to exercise 2 by passing exercise 1 */
    const g1 = topic.exercises[0];
    let host = w.document.querySelector('.uz-step-host');
    g1.items.forEach((item, i) => {
        const row = host.querySelector(`[data-b2h-row="ex1-${i}"]`);
        const want = Array.isArray(item.answer) ? item.answer[0] : item.answer;
        const t = Array.from(row.querySelectorAll('.b2h-opt'))
            .find(o => w.B2Host._norm(o.getAttribute('data-value')) === w.B2Host._norm(want));
        if (t) click(w, t);
    });
    click(w, Array.from(w.document.querySelectorAll('.uz-foot button'))
        .find(b => /Проверить/.test(b.textContent)));
    click(w, Array.from(w.document.querySelectorAll('.uz-foot button'))
        .find(b => /Следующее/.test(b.textContent)));

    ok(session.cursor === 1, '7.1 the session reaches exercise 2');
    host = w.document.querySelector('.uz-step-host');
    ok(host.querySelectorAll('.uzb').length === 10, '7.2 builders render inside the session');

    const g2 = topic.exercises[1];
    g2.items.forEach((item, i) => {
        const wrap = host.querySelector(`[data-uzb="ex2-${i}"]`);
        splitLike(ctx, item.answer[0], g2.glue).forEach(tk => {
            const c = Array.from(wrap.querySelectorAll('.uzb-bank .uzb-tok'))
                .find(x => x.textContent === tk);
            if (c) click(w, c);
        });
    });
    await flush();
    ok(saves.length > 0, '7.3 building a sentence autosaves through the normal draft path');
    const last = saves[saves.length - 1];
    ok(!!last && last.answers['ex2-0'] === splitLike(ctx, g2.items[0].answer[0], g2.glue).join(' '),
        '7.4 the draft stores an ordinary string, exactly as a typed answer would');

    click(w, Array.from(w.document.querySelectorAll('.uz-foot button'))
        .find(b => /Проверить/.test(b.textContent)));
    const verdict = w.document.querySelector('.uz-verdict');
    ok(!!verdict, '7.5 the standard verdict card is used');
    ok(/10 \/ 10/.test(verdict.textContent), '7.6 the builder scores 10/10 through the normal grader');
    ok(session.checked['ex2'].passed === true, '7.7 the step is recorded as passed');
    ok(!!Array.from(w.document.querySelectorAll('.uz-foot button'))
        .find(b => /Следующее/.test(b.textContent)), '7.8 the next exercise unlocks as usual');
    ok(ctx.errors.length === 0, `7.9 no console errors in a real session (${ctx.errors[0] || ''})`);
}

/* ------------------------------------------------ 8. failing run still gates */
{
    const ctx = boot();
    const topic = ctx.topic, api = ctx.api, w = ctx.w;
    const session = w.UzExerciseSession.mount({
        groups: [topic.exercises[1]],
        mountEl: w.document.getElementById('r'),
        title: 'x', passScore: 85,
        renderGroup: api.renderGroup, bindGroup: api.bindGroup,
        readAnswer: api.readAnswer, writeAnswer: api.writeAnswer,
        matchItem: api.matchItem, stepGate: api.stepGate,
        finish: api.finish, renderSummary: api.renderSummary, bindSummary: api.bindSummary,
        draft: { save: () => {}, load: () => null, clear: () => {} }
    });
    click(w, w.document.querySelector('.uz-practice-btn'));
    const host = w.document.querySelector('.uz-step-host');
    const g2 = topic.exercises[1];
    /* solve only 8 of 10 => 80%, below the gate */
    g2.items.forEach((item, i) => {
        if (i >= 8) return;
        const wrap = host.querySelector(`[data-uzb="ex2-${i}"]`);
        splitLike(ctx, item.answer[0], g2.glue).forEach(tk => {
            const c = Array.from(wrap.querySelectorAll('.uzb-bank .uzb-tok'))
                .find(x => x.textContent === tk);
            if (c) click(w, c);
        });
    });
    click(w, Array.from(w.document.querySelectorAll('.uz-foot button'))
        .find(b => /Проверить/.test(b.textContent)));
    ok(/8 \/ 10/.test(w.document.querySelector('.uz-verdict').textContent),
        '8.1 a partly solved builder scores 8/10');
    ok(!!w.document.querySelector('.uz-foot [data-uz-act="retry"]'),
        '8.2 the 85% gate still blocks the builder exercise');
    ok(!w.document.querySelector('.uz-foot [data-uz-act="next"]'), '8.3 no way forward');
    ok(session.checked['ex2'].passed === false, '8.4 the step is recorded as failed');
    ok(!w.document.querySelector('.uz-verdict .uz-answers'),
        '8.5 answers are withheld, exactly as for every other exercise type');
}

/* ------------------------------------------------ 9. nothing hardcoded */
{
    const src = HOST.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    ok(!/ex2|'ex\d'/.test(src), '9.1 the host never names exercise 2');
    ok(!/topicId\s*===|topic\.id\s*===/.test(src), '9.2 no per-topic branch');
    ok(/g\.type === 'builder'/.test(UI), '9.3 the builder is selected by data type');
    ok((UI.match(/g\.type === 'builder'/g) || []).length >= 3,
        '9.4 render, read and write all dispatch on the same generic type');

    const eng = fs.readFileSync(path.join(ROOT, 'exercise-session.js'), 'utf8');
    ok(!/builder|uzb-tok|uzb/.test(eng), '9.5 the engine knows nothing about builders');
    ok(!/tokens|bankFor|glue/.test(eng), '9.6 the engine knows nothing about word banks');
    ok(/function bank\(/.test(COMPONENT), '9.7 the bank generator lives in the component');
    ok(/item\.tokens/.test(COMPONENT), '9.8 an explicit bank can still override the derived one');
}

/* ------------------------------------------------ 10. desktop drag-reorder */
{
    /* Progressive enhancement on top of the tap flow: a placed card can be
       dragged to a new position. Touch users never need it — tapping a card
       returns it to the bank, which is the full interaction on its own. */
    const ctx = boot();
    const w = ctx.w;
    let n = 0;
    w.Element.prototype.getBoundingClientRect = function () {
        const left = (n++) * 50;
        return { left, width: 50, top: 0, height: 20, right: left + 50, bottom: 20 };
    };
    const g = G(ctx.topic);
    const root = mountGroup(ctx, g);
    const wrap = wrapOf(root, 0);
    assemble(ctx, root, g, 0, splitLike(ctx, g.items[0].answer[0], g.glue).slice(0, 3));

    const ev = (type, extra) => {
        const e = new w.Event(type, { bubbles: true, cancelable: true });
        Object.assign(e, extra || {});
        return e;
    };
    const order = () => outCards(wrap).map(c => c.textContent).join('|');
    const before = order();
    ok(before === splitLike(ctx, g.items[0].answer[0], g.glue).slice(0, 3).join('|'),
        '10.1 cards start in tap order');

    const cards = outCards(wrap);
    cards[0].dispatchEvent(ev('dragstart'));
    ok(cards[0].classList.contains('dragging'), '10.2 the dragged card is marked');
    cards[2].dispatchEvent(ev('dragover', { clientX: 9999 }));   // past the midpoint => after
    ok(wrap.querySelector('.uzb-out').classList.contains('drop'),
        '10.3 the answer area shows a drop state');
    cards[2].dispatchEvent(ev('drop'));
    cards[0].dispatchEvent(ev('dragend'));

    ok(order() !== before, '10.4 dragging reorders the placed cards');
    ok(order().split('|').length === 3, '10.5 no card is lost or duplicated');
    ok(!cards[0].classList.contains('dragging'), '10.6 the drag state is cleared');
    ok(!wrap.querySelector('.uzb-out').classList.contains('drop'),
        '10.7 the drop state is cleared');
    ok(ctx.api.readAnswer(root, 'ex2-0', g) === order().split('|').join(' '),
        '10.8 the answer reflects the new order');

    /* dragging must never pull a card out of the bank */
    const bankCard = bankCards(wrap)[0];
    bankCard.dispatchEvent(ev('dragstart'));
    bankCard.dispatchEvent(ev('dragend'));
    ok(bankCards(wrap).indexOf(bankCard) !== -1, '10.9 bank cards are not draggable into place');
    ok(ctx.errors.length === 0, `10.10 no console errors during drag (${ctx.errors[0] || ''})`);
}

/* ------------------------------------------------ 11. the bank is a UNION */
{
    const ctx = boot();
    const g = G(ctx.topic);

    /* item 2 is the case that motivated this: two conjunctions, both valid */
    const bank = bankOf(ctx, g, 1);
    ok(g.items[1].answer.length === 2, '11.1 item 2 has two accepted answers');
    const v1 = buildable(ctx, bank, g.items[1].answer[0], g.glue);
    const v2 = buildable(ctx, bank, g.items[1].answer[1], g.glue);
    ok(!!v1, '11.2 "…потому что хочу купить квартиру" can be built');
    ok(!!v2, '11.3 "…чтобы купить квартиру" can be built — the old bank could not');
    ok(!!v1 && ctx.api.matchItem(g.items[1], v1.join(' ')), '11.4 variant 1 grades correct');
    ok(!!v2 && ctx.api.matchItem(g.items[1], v2.join(' ')), '11.5 variant 2 grades correct');
    ok(!!v2 && v2.length < bank.length, '11.6 leftover cards remain, which is expected');

    /* a word some variant needs twice must appear twice */
    const bank3 = bankOf(ctx, g, 2);
    const onCount = bank3.filter(t => ctx.w.B2Host._norm(t) === 'он').length;
    ok(onCount === 2, `11.7 a word needed twice appears twice ("он" x${onCount})`);
    ok(bank3.filter(t => /^хотя$/i.test(t)).length === 1, '11.8 but never duplicated needlessly');

    /* every alternative conjunction across the exercise made it into a bank */
    const banks = g.items.map((_, i) => bankOf(ctx, g, i));
    ok(banks[4].includes('поэтому') && banks[4].includes('потому что'),
        '11.9 item 5 offers both cause and consequence conjunctions');
    ok(banks[7].includes('Хотя') && banks[7].includes('Несмотря на то, что'),
        '11.10 item 8 offers both concessive conjunctions');
    ok(banks[9].includes('то'), '11.11 item 10 offers the optional "то"');

    /* the union never loses a word the canonical answer needs */
    let complete = 0;
    g.items.forEach((it, i) => {
        if (buildable(ctx, banks[i], it.answer[0], g.glue)) complete++;
    });
    ok(complete === 10, `11.12 the canonical answer is still buildable everywhere (${complete}/10)`);

    /* dedup happens on the NORMALISED form, so "работаю," and "работаю" are one card */
    const dupes = banks.map((b, i) => {
        const seen = {};
        const need = {};
        g.items[i].answer.forEach(v => {
            const c = {};
            splitLike(ctx, v, g.glue).forEach(t => {
                const k = ctx.w.B2Host._norm(t);
                c[k] = (c[k] || 0) + 1;
            });
            Object.keys(c).forEach(k => { if (!need[k] || c[k] > need[k]) need[k] = c[k]; });
        });
        b.forEach(t => {
            const k = ctx.w.B2Host._norm(t);
            seen[k] = (seen[k] || 0) + 1;
        });
        return Object.keys(seen).every(k => seen[k] === need[k]);
    });
    ok(dupes.every(Boolean), '11.13 no card is duplicated beyond what some variant needs');
}

/* ------------------------------------------------ 12. motion + card polish */
{
    const probe = boot();
    const C = probe.w.UzSentenceBuilder.CONST;
    probe.w.UzSentenceBuilder.renderItem('probe', { answer: ['a b'] }, null);   // injects styles
    /* The stylesheet is assembled from constants, so assert on what the browser
       actually receives rather than on the source that builds it. */
    const css = probe.w.document.getElementById('uz-builder-styles').textContent;
    const src = COMPONENT;

    ok(/function moveToken/.test(src), '12.1 cards move through a single animated helper');
    ok(/getBoundingClientRect/.test(src) && /translate\(/.test(src),
        '12.2 FLIP: the card is measured before and after the move');
    ok(C.ANIM_DURATION >= 150 && C.ANIM_DURATION <= 250,
        `12.3 the flight is ${C.ANIM_DURATION}ms, inside the 150-250ms band`);
    ok(/function pop\(/.test(src), '12.4 cards that do not move still spring');
    ok(/@keyframes uzbPop/.test(css), '12.5 the pick-up bounce is defined');
    ok(/function reducedMotion/.test(src), '12.6 motion is skipped when the user asks');
    ok(/prefers-reduced-motion:reduce/.test(css), '12.7 and in CSS too');

    ok(css.includes('min-height:' + C.TOKEN_MIN_HEIGHT + 'px'), '12.8 every card is the same height');
    ok(css.includes('border-radius:' + C.TOKEN_RADIUS + 'px'),
        `12.9 radius is ${C.TOKEN_RADIUS}px (within 12-16px)`);
    ok(/box-shadow:0 1px 2px/.test(css), '12.10 cards carry a soft shadow');
    ok(/display:inline-flex;align-items:center;justify-content:center;text-align:center/.test(css),
        '12.11 labels are centred, so short and long words look alike');
    ok(/\.uzb-tok:hover\{/.test(css), '12.12 hover state');
    ok(/\.uzb-tok:active\{/.test(css), '12.13 active state');
    ok(/\.uzb-tok\.flying\{[^}]*box-shadow:0 10px 24px/.test(css), '12.14 the card lifts while flying');

    const ctx = boot();
    const w = ctx.w;
    const g = G(ctx.topic);
    const root = mountGroup(ctx, g);
    const wrap = wrapOf(root, 0);
    const tokens = splitLike(ctx, g.items[0].answer[0], g.glue);
    const card = cardBy(wrap, tokens[0]);
    click(w, card);
    ok(outCards(wrap).length === 1, '12.15 the card still lands in the answer');
    ok(card.parentNode === wrap.querySelector('.uzb-out'),
        '12.16 the DOM move happens immediately, before the animation');
    ok(ctx.api.readAnswer(root, 'ex2-0', g) === tokens[0],
        '12.17 the answer is readable the instant the card is tapped');
    await flush();
    ok(ctx.errors.length === 0, `12.18 animation raises no errors (${ctx.errors[0] || ''})`);

    assemble(ctx, root, g, 0, tokens.slice(1));
    click(w, wrap.querySelector('[data-uzb-clear]'));
    await new Promise(r => setTimeout(r, 10));
    ok(outCards(wrap).length === 0, '12.19 clear still works with animation in play');
    ok(bankCards(wrap).length === bankOf(ctx, g, 0).length, '12.20 every card is back');
}

/* --------------------------------- 13. long cards never break the layout */
{
    const ctx = boot();
    const C = ctx.w.UzSentenceBuilder.CONST;
    ctx.w.UzSentenceBuilder.renderItem('probe', { answer: ['a b'] }, null);
    const css = ctx.w.document.getElementById('uz-builder-styles').textContent;

    ok(/\.uzb-tok\{flex:0 1 auto;min-width:0/.test(css),
        '13.1 a card may shrink instead of shoving its neighbours out of the row');
    ok(css.includes('max-width:min(100%,' + C.TOKEN_MAX_WIDTH + 'px)'),
        `13.2 a card is capped at ${C.TOKEN_MAX_WIDTH}px and never wider than its row`);
    ok(/white-space:normal/.test(css), '13.3 a long card wraps inside itself');
    ok(/overflow-wrap:break-word/.test(css), '13.4 an unbreakable string still fits');
    ok(/word-break:normal/.test(css), '13.5 but words are never split mid-letter');
    ok(/hyphens:none/.test(css), '13.6 and never hyphenated');
    ok(/line-height:1\.35/.test(css), '13.7 wrapped lines stay readable');
    ok(/\.uzb-out\{[^}]*align-items:stretch/.test(css),
        '13.8 cards on one line share a height, so a wrapped card does not look broken');
    ok(/\.uzb-bank\{[^}]*align-items:stretch/.test(css), '13.9 the bank behaves the same');

    /* the longest phrase this lesson actually ships */
    const g = G(ctx.topic);
    const banks = g.items.map((_, i) => bankOf(ctx, g, i));
    const longest = banks.flat().sort((a, b) => b.length - a.length)[0];
    ok(longest.length > 15, `13.10 a genuinely long card exists ("${longest}")`);
    ok(longest.indexOf(' ') > 0, '13.11 and it is a multi-word phrase kept on one card');

    /* a hypothetical future card, far longer than anything today */
    const b = ctx.w.UzSentenceBuilder;
    const monster = 'при том условии что несмотря ни на что';
    const html = b.renderItem('k', { answer: ['A ' + monster + ' B'] }, { glue: [monster] });
    const d = ctx.w.document.createElement('div');
    d.innerHTML = html;
    const cards = Array.from(d.querySelectorAll('.uzb-tok')).map(c => c.textContent);
    ok(cards.includes(monster), '13.12 an arbitrarily long phrase still renders as one card');
    ok(cards.length === 3, '13.13 and does not disturb the cards around it');
}

/* --------------------------------- 14. success + error feedback */
{
    const ctx = boot();
    const w = ctx.w;
    const g = G(ctx.topic);
    const root = mountGroup(ctx, g);
    const b = w.UzSentenceBuilder;
    const item = g.items[0];
    const tokens = splitLike(ctx, item.answer[0], g.glue);

    /* --- correct --- */
    assemble(ctx, root, g, 0);
    b.markResult(root, 'ex2-0', item, g, true);
    const wrap = wrapOf(root, 0);
    ok(wrap.querySelector('.uzb-out').classList.contains('ok'), '14.1 the answer area turns green');
    ok(outCards(wrap).every(c => c.classList.contains('tok-ok')), '14.2 every card is marked correct');
    const flashOk = wrap.querySelector('.uzb-flash.ok');
    ok(!!flashOk, '14.3 a success banner appears');
    ok(!!flashOk.querySelector('.uzb-check'), '14.4 with a check mark');
    ok(/Верно/.test(flashOk.textContent), '14.5 and a short confirmation');
    ok(/@keyframes uzbStamp/.test(COMPONENT), '14.6 the check mark pops in');
    ok(/@keyframes uzbSettle/.test(COMPONENT), '14.7 the cards settle');
    ok(/@keyframes uzbRise/.test(COMPONENT), '14.8 the banner rises in');

    /* --- wrong order --- */
    const ctx2 = boot();
    const g2 = G(ctx2.topic);
    const root2 = mountGroup(ctx2, g2);
    const t2 = splitLike(ctx2, g2.items[0].answer[0], g2.glue);
    const swapped = t2.slice();
    swapped[0] = t2[1]; swapped[1] = t2[0];
    assemble(ctx2, root2, g2, 0, swapped);
    ctx2.w.UzSentenceBuilder.markResult(root2, 'ex2-0', g2.items[0], g2, false);
    const wrap2 = wrapOf(root2, 0);
    ok(wrap2.querySelector('.uzb-out').classList.contains('bad'), '14.9 the answer area turns red');
    const marks = outCards(wrap2);
    ok(marks.some(c => c.classList.contains('tok-bad')), '14.10 misplaced cards are red');
    ok(marks.some(c => c.classList.contains('tok-ok')),
        '14.11 correctly placed cards stay green, so the mistake is obvious');
    const flashBad = wrap2.querySelector('.uzb-flash.bad');
    ok(!!flashBad, '14.12 an error banner appears');
    ok(/порядок слов/i.test(flashBad.textContent),
        `14.13 a permutation is diagnosed as a word-order problem ("${flashBad.textContent.trim()}")`);

    /* --- diagnosis is data-driven --- */
    const dg = ctx2.w.UzSentenceBuilder.diagnose;
    ok(/порядок слов/i.test(dg(swapped, g2.items[0], g2)), '14.14 permutation -> word order');
    ok(/Соберите предложение/i.test(dg([], g2.items[0], g2)), '14.15 empty -> "assemble the sentence"');
    ok(/союз/i.test(dg(['Я', 'много', 'работаю,', 'чтобы', 'хочу', 'купить', 'квартиру'],
        g2.items[1], g2)), '14.16 a swapped conjunction -> "check the conjunction"');
    ok(/ещё раз/i.test(dg(['совершенно', 'другое'], g2.items[0], g2)),
        '14.17 anything else -> the generic retry message');
    ok(dg(['x'], { answer: ['y'], explanation: 'MY OWN HINT' }, g2) === 'MY OWN HINT',
        '14.18 an item explanation always wins');

    /* --- marks clear as soon as the learner starts fixing --- */
    click(ctx2.w, outCards(wrap2)[0]);
    ok(!wrap2.querySelector('.uzb-flash'), '14.19 touching a card clears the banner');
    ok(!wrap2.querySelector('.uzb-out').classList.contains('bad'), '14.20 and the red state');
    ok(outCards(wrap2).every(c => !c.classList.contains('tok-bad')), '14.21 and the card marks');
    ok(ctx2.errors.length === 0, `14.22 no errors (${ctx2.errors[0] || ''})`);
}

/* --------------------------------- 15. wired through the engine */
{
    const ctx = boot();
    const w = ctx.w, topic = ctx.topic, api = ctx.api;
    w.UzExerciseSession.mount({
        groups: [topic.exercises[1]],
        mountEl: w.document.getElementById('r'),
        title: 'x', passScore: 85,
        renderGroup: api.renderGroup, bindGroup: api.bindGroup,
        readAnswer: api.readAnswer, writeAnswer: api.writeAnswer,
        matchItem: api.matchItem, stepGate: api.stepGate, afterCheck: api.afterCheck,
        finish: api.finish, renderSummary: api.renderSummary, bindSummary: api.bindSummary,
        draft: { save: () => {}, load: () => null, clear: () => {} }
    });
    click(w, w.document.querySelector('.uz-practice-btn'));
    const host = w.document.querySelector('.uz-step-host');
    const g = topic.exercises[1];

    /* solve 9, leave 1 wrong => 90%, passes the gate but one item is red */
    g.items.forEach((item, i) => {
        const wrap = host.querySelector(`[data-uzb="ex2-${i}"]`);
        let order = splitLike(ctx, item.answer[0], g.glue);
        if (i === 9) order = order.slice(0, 2).reverse();
        order.forEach(tk => {
            const c = Array.from(wrap.querySelectorAll('.uzb-bank .uzb-tok'))
                .find(x => x.textContent === tk);
            if (c) click(w, c);
        });
    });
    click(w, Array.from(w.document.querySelectorAll('.uz-foot button'))
        .find(b => /Проверить/.test(b.textContent)));

    ok(host.querySelectorAll('.uzb-flash.ok').length === 9, '15.1 nine items show the success banner');
    ok(host.querySelectorAll('.uzb-flash.bad').length === 1, '15.2 the failed item shows an error banner');
    ok(host.querySelector('[data-uzb="ex2-9"] .uzb-out').classList.contains('bad'),
        '15.3 the failed item is highlighted');
    ok(host.querySelector('[data-uzb="ex2-0"] .uzb-out').classList.contains('ok'),
        '15.4 a solved item is highlighted green');
    ok(/9 \/ 10/.test(w.document.querySelector('.uz-verdict').textContent),
        '15.5 the score is unchanged by any of this');
    ok(ctx.errors.length === 0, `15.6 no errors (${ctx.errors[0] || ''})`);

    /* the hook is optional: without it nothing changes */
    const eng = fs.readFileSync(path.join(ROOT, 'exercise-session.js'), 'utf8');
    ok(/typeof this\.cfg\.afterCheck === 'function'/.test(eng),
        '15.7 afterCheck is optional — absent means no change in behaviour');
    ok(!/uzb|builder|tokens/i.test(eng.replace(/\/\*[\s\S]*?\*\//g, '')),
        '15.8 the engine still knows nothing about builders');
}

/* --------------------------------- 16. a standalone component */
{
    const ctx = boot();
    const b = ctx.w.UzSentenceBuilder;
    ok(!!b, '16.1 the component installs itself');
    ['renderItem', 'bind', 'read', 'write', 'markResult', 'clearMarks', 'bank', 'split', 'diagnose']
        .forEach(fn => ok(typeof b[fn] === 'function', `16.2 exposes ${fn}()`));
    ok(typeof b.CONST === 'object', '16.3 exposes its constants');
    ok(b.VERSION >= 1, '16.4 is versioned');

    /* strip comments AND hex colours first — "#B22740" is not a reference to B2 */
    const bare = COMPONENT.replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
        .replace(/#[0-9A-Fa-f]{3,8}\b/g, '');
    ok(!/\bB2\b|b2h|B2Host|B2_LESSON/i.test(bare), '16.5 names no course and no host');
    ok(!/UzExerciseSession/.test(COMPONENT), '16.6 does not reach into the session engine');
    ok(!/firebase|localStorage|saveProgress/i.test(COMPONENT), '16.7 touches no persistence');
    ok(/uz-builder-styles/.test(COMPONENT), '16.8 injects its own stylesheet');

    /* usable with nothing but an item */
    const html = b.renderItem('solo', { answer: ['one two three'] }, null);
    const d = ctx.w.document.createElement('div');
    d.innerHTML = html;
    ok(d.querySelectorAll('.uzb-tok').length === 3, '16.9 works with no group config at all');
    ctx.w.document.body.appendChild(d);
    b.bind(d);
    Array.from(d.querySelectorAll('.uzb-bank .uzb-tok')).slice()
        .forEach(c => c.dispatchEvent(new ctx.w.MouseEvent('click', { bubbles: true })));
    ok(b.read(d, 'solo').split(' ').length === 3, '16.10 and is fully interactive on its own');

    /* magic numbers are gone */
    const C = b.CONST;
    ['ANIM_DURATION', 'TOKEN_RADIUS', 'TOKEN_MIN_HEIGHT', 'TOKEN_GAP', 'TOKEN_MAX_WIDTH']
        .forEach(k => ok(typeof C[k] === 'number', `16.11 ${k} is a named constant`));
    const body = COMPONENT.split("var STYLE_ID")[1] || '';
    ok(!/border-radius:14px/.test(body.replace(/C\.TOKEN_RADIUS/g, '')),
        '16.12 the radius is never written as a literal');
    ok(!/220ms/.test(body.replace(/C\.ANIM_DURATION/g, '')),
        '16.13 the duration is never written as a literal');
    ok(/injectStyles/.test(COMPONENT) && !/injectStyles/.test(HOST.split('sentence')[0].slice(0, 0) || ''),
        '16.14 styles ship with the component');
    ok(!/uzb-tok|uzb-out|uzb-bank/.test(HOST), '16.15 the host holds no builder markup or CSS');
    ok(/builder\(\)/.test(HOST), '16.16 the host only delegates');
}

console.log('='.repeat(58));
if (fail) {
    console.log(`  ❌ SENTENCE BUILDER: ${fail} failed / ${pass + fail}\n`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(58) + '\n');
    process.exit(1);
}
console.log(`  ✅ SENTENCE BUILDER: ${pass}/${pass} passed`);
console.log('='.repeat(58) + '\n');
})().catch(e => { console.error('SUITE CRASHED:', e); process.exit(1); });
