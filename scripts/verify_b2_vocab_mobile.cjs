#!/usr/bin/env node
/**
 * verify_b2_vocab_mobile.cjs — the deck must be navigable on a phone, and the
 * speech controls must not eat the screen that navigation needs.
 *
 * THE BUG THIS EXISTS TO CATCH
 * ---------------------------
 * A learner sent a screenshot of B2 vocabulary on Android: card, hint, gender
 * buttons and a microphone chooser were visible, and «Oldingi» / «Keyingi» were
 * not. They were not merely below the fold — they were UNREACHABLE.
 *
 *     body            { overflow: hidden; height: 100vh; }
 *     .flashcard-screen { position: fixed; inset: 0; }
 *
 * Nothing in that tree scrolled. The column inside it — header, card, hint,
 * gender switch, injected mic selector, two audio buttons and two navigation
 * buttons — measured roughly 950px against about 590 visible CSS pixels on a
 * 360x640 phone, so the last ~360px simply did not exist for the user. Both
 * button pairs were stacked into COLUMNS on mobile, doubling their height for
 * no benefit, and `100vh` on Android Chrome is the large viewport (bars hidden),
 * so the layout was already taller than the space it had.
 *
 * The fix: the middle scrolls, the navigation is stuck to the bottom of it, the
 * card is sized from the viewport instead of a fixed 300px, and the two button
 * pairs sit side by side.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE
 * ----------------------------------
 * jsdom has no layout engine, so it cannot measure that the buttons are on
 * screen — that stays a manual check. What it CAN prove is every structural
 * precondition that made them unreachable, plus the behaviour of the controls
 * themselves, which is done by driving the page's real functions.
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

const PAGE = path.join(ROOT, 'paid-courses/b2-vocabulary.html');
const HTML = fs.readFileSync(PAGE, 'utf8');
const SPEECH = fs.readFileSync(path.join(ROOT, 'paid-courses/speech.js'), 'utf8');

function mainScript(html) {
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
    let m, best = '';
    while ((m = re.exec(html))) {
        if (/\bsrc=/.test(m[1])) continue;
        if (m[2].length > best.length) best = m[2];
    }
    return best;
}
const S = mainScript(HTML);

function liftFrom(src, name) {
    let i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('missing ' + name);
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
    throw new Error('unbalanced ' + name);
}
const lift = (n) => liftFrom(S, n);

function literal(name) {
    const i = S.search(new RegExp('(?:const|let|var)\\s+' + name + '\\s*=\\s*[\\[{]'));
    let j = i;
    while (S[j] !== '[' && S[j] !== '{') j++;
    const open = S[j], close = open === '[' ? ']' : '}';
    let d = 0;
    for (let k = j; k < S.length; k++) {
        if (S[k] === open) d++;
        else if (S[k] === close) {
            d--;
            if (d === 0) return vm.runInNewContext('(' + S.slice(j, k + 1) + ')',
                { generateLockedTopics: () => [], icons: {}, lockedTopicNames: [] });
        }
    }
    throw new Error('unbalanced ' + name);
}

/** One CSS rule body, by exact selector, from the page's <style>. */
function rule(selector, withinMedia) {
    const style = HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>'));
    const scope = withinMedia
        ? style.slice(style.indexOf('@media (max-width: 768px)'))
        : style.slice(0, style.indexOf('@media'));
    const at = scope.indexOf(selector + ' {');
    if (at < 0) return null;
    return scope.slice(at, scope.indexOf('}', at));
}

console.log('\n=== B2 VOCABULARY · MOBILE ===');

/* ------------------------------- 1. the screen can no longer trap content */
{
    const screen = rule('.flashcard-screen');
    ok(!!screen, '.flashcard-screen is styled');
    /* Android Chrome's 100vh is the LARGE viewport, so the fixed screen was
       taller than the space actually visible while the bars were showing. */
    ok(/height:\s*100dvh/.test(screen), '.flashcard-screen sizes itself with 100dvh');
    ok(/height:\s*100vh/.test(screen), '100vh is kept first as the fallback');

    const container = rule('.flashcard-container');
    ok(!!container, '.flashcard-container is styled');
    /* THE fix: the middle scrolls, so nothing inside it can be unreachable. */
    ok(/overflow-y:\s*auto/.test(container), 'the card column scrolls');
    ok(/min-height:\s*0/.test(container),
        'the scrolling column may shrink (a flex child without this never scrolls)');
}

/* ------------------------- 2. navigation is pinned on small screens */
{
    const nav = rule('.flashcard-controls', true);
    ok(!!nav, '.flashcard-controls has a mobile rule');
    ok(/position:\s*sticky/.test(nav), 'navigation is pinned on mobile');
    ok(/bottom:\s*0/.test(nav), 'it is pinned to the BOTTOM');
    ok(/flex-direction:\s*row/.test(nav),
        'the two buttons sit side by side, not stacked (stacking is what pushed them off)');
    ok(/env\(safe-area-inset-bottom/.test(nav),
        'the safe area is respected so the buttons clear the home indicator');
    ok(/background:/.test(nav),
        'the pinned bar is opaque enough that content does not read through it');

    const btn = rule('.control-btn', true);
    ok(/min-height:\s*44px/.test(btn), 'each control is a 44px touch target');

    const audio = rule('.audio-controls', true);
    ok(/flex-direction:\s*row/.test(audio),
        'the audio pair is side by side too — as a column it cost double the height');
    const audioBtn = rule('.audio-button', true);
    ok(/min-height:\s*44px/.test(audioBtn), 'audio buttons are a 44px touch target');

    const card = rule('.flashcard', true);
    ok(/clamp\(/.test(card),
        'the card is sized from the viewport, not pinned at 300px');
    ok(!/height:\s*300px/.test(card), 'the fixed mobile height is gone');

    const mic = rule('.mic-selector-wrap', true);
    ok(!!mic && /width:\s*100%/.test(mic),
        'the injected mic selector does not claim a fixed column on a phone');
}

/* --------------------------------- 3. the controls actually work */
{
    const V = literal('vocabularyData');
    const dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'https://uzdarus.test/' });
    const w = dom.window, D = w.document;
    const topic1 = V.topics.find((t) => t.id === 1);

    w.eval(`
        var vocabularyData = ${JSON.stringify(V)};
        var currentTopicId = 1, currentCardIndex = 0, isFlipped = false;
        var currentWords = ${JSON.stringify(topic1.words)};
        var learnedWords = {};
        function saveProgress() {}
        function _isWordLocked() { return false; }
        function updateProgressUI() {}
        ${['updateCard', 'flipCard', 'nextCard', 'previousCard'].map(lift).join('\n')}
        window.__set = function (i) { currentCardIndex = i; updateCard(); };
        window.__idx = function () { return currentCardIndex; };
    `);

    /* Exactly one of each control, and both are real buttons. */
    const prev = [...D.querySelectorAll('[onclick*="previousCard"]')];
    const next = [...D.querySelectorAll('[onclick*="nextCard"]')];
    eq('exactly one «Oldingi»', prev.length, 1);
    eq('exactly one «Keyingi»', next.length, 1);
    ok(prev[0].tagName === 'BUTTON' && next[0].tagName === 'BUTTON',
        'both controls are <button> elements');
    ok(/Oldingi/.test(prev[0].textContent) && /Keyingi/.test(next[0].textContent),
        'both are labelled in the interface language');

    /* jsdom does not run inline onclick attributes, so invoke the very handler
       the markup names — the real function, not a copy. */
    const fire = (el) => w.eval(el.getAttribute('onclick'));
    const counter = () => D.getElementById('progressIndicator').textContent.trim();
    const word = () => D.getElementById('wordUzbek').textContent.trim();

    w.eval('__set(0);');
    const firstWord = word();
    eq('the deck opens on card 1', counter(), `1 / ${topic1.words.length}`);

    fire(next[0]);
    eq('«Keyingi» advances the counter', counter(), `2 / ${topic1.words.length}`);
    ok(word() !== firstWord, '«Keyingi» changes the word on screen');

    fire(prev[0]);
    eq('«Oldingi» goes back', counter(), `1 / ${topic1.words.length}`);
    eq('and restores the same word', word(), firstWord);

    /* Boundary: the first card must not walk off the start. */
    fire(prev[0]);
    eq('«Oldingi» on card 1 stays on card 1', w.eval('__idx()'), 0);

    /* Flip, and flip state must not survive a card change. */
    const card = D.getElementById('flashcard');
    w.eval('flipCard();');
    ok(card.classList.contains('flipped'), 'tapping the card flips it');
    w.eval('flipCard();');
    ok(!card.classList.contains('flipped'), 'tapping again flips it back');
    w.eval('flipCard();');
    fire(next[0]);
    ok(!card.classList.contains('flipped'),
        'the next card is not still showing the previous translation');

    /* Every authored topic is complete — no empty card can be reached. */
    let emptySides = 0, topicsWithWords = 0, total = 0;
    V.topics.forEach((t) => {
        const words = t.words || [];
        if (!words.length) return;
        topicsWithWords++;
        total += words.length;
        words.forEach((entry) => {
            if (!entry || !entry.ru || !String(entry.ru).trim()
                || !entry.uz || !String(entry.uz).trim()) emptySides++;
        });
    });
    eq('no vocabulary card has an empty side', emptySides, 0);
    ok(topicsWithWords > 0 && total > 0,
        `B2 vocabulary has content (${topicsWithWords} topics, ${total} cards)`);
    console.log(`  ${topicsWithWords} topics · ${total} cards`);
}

/* ------------------------------- 4. speech UI: language and dead controls */
{
    /* Two user-facing strings were hardcoded in Russian on a page whose entire
       interface is Uzbek, bypassing the _t() table that everything else uses. */
    ok(!/Выберите микрофон/.test(SPEECH), 'the mic label is no longer hardcoded Russian');
    ok(!/Доступно только в Premium/.test(SPEECH), 'the premium note is no longer hardcoded Russian');
    ok(/micLabel:\s*"🎤 Mikrofonni tanlang"/.test(SPEECH), 'the Uzbek mic label is in the table');
    ok(/premiumOnly:/.test(SPEECH) && /micDenied:/.test(SPEECH),
        'both new strings are translatable keys, not literals');
    ok(/_t\('micLabel'\)/.test(SPEECH) && /_t\('premiumOnly'\)/.test(SPEECH),
        'both call sites go through _t()');

    /* The stale-attempt guard is what stops a slow result from a previous card
       landing on the next one — the "speech state leaks across cards" class. */
    ok((SPEECH.match(/attemptId !== _activeAttemptId/g) || []).length >= 3,
        'a late result from an earlier attempt cannot render on a later card');
    ok(/getTracks\(\)\.forEach\(function \(t\) \{ t\.stop\(\); \}\)/.test(SPEECH),
        'microphone tracks are stopped, not left open');
    ok(/recognizer\.close\(\)/.test(SPEECH), 'the recognizer is closed');

    /* No polling was introduced for any of this. */
    ok(!/setInterval[\s\S]{0,80}micSelect/.test(SPEECH),
        'the mic selector is not polled');
}

/* ------------- 5. the mic chooser appears only when there is a choice */
{
    const TEXT = SPEECH.slice(SPEECH.indexOf('var TEXT = {'), SPEECH.indexOf('function _t(key)'));

    async function state({ devices, deny }) {
        const w = new JSDOM(
            '<!doctype html><body><div class="mic-selector-wrap">' +
            '<label class="mic-label" for="micSelect">x</label>' +
            '<select id="micSelect" class="mic-select"></select></div></body>',
            { runScripts: 'outside-only', url: 'https://uzdarus.test/' }).window;
        w.navigator.mediaDevices = {
            getUserMedia: async () => {
                if (deny) { const e = new Error('denied'); e.name = 'NotAllowedError'; throw e; }
                return { getTracks: () => [{ stop() {} }] };
            },
            enumerateDevices: async () => devices
        };
        w.console.log = () => {};
        w.eval(`var LANG='uz'; ${TEXT} ${liftFrom(SPEECH, '_t')}
            function _getSavedMicId(){ return localStorage.getItem('mic_device') || ''; }
            ${liftFrom(SPEECH, '_enumerateMics')}
            ${liftFrom(SPEECH, '_initMicSelector')}`);
        await w._initMicSelector();
        const wrap = w.document.querySelector('.mic-selector-wrap');
        const sel = w.document.getElementById('micSelect');
        return {
            visible: wrap.style.display !== 'none',
            selectVisible: sel.style.display !== 'none',
            label: w.document.querySelector('.mic-label').textContent,
            options: sel.options.length
        };
    }
    const mics = (n) => Array.from({ length: n },
        (_, i) => ({ kind: 'audioinput', deviceId: 'd' + i, label: 'Mic ' + (i + 1) }));

    return (async () => {
        let r = await state({ devices: [], deny: false });
        ok(!r.visible, 'no microphone: no empty chooser is shown');

        r = await state({ devices: mics(1), deny: false });
        ok(!r.visible, 'one microphone: nothing to choose, so nothing is shown');

        r = await state({ devices: mics(2), deny: false });
        ok(r.visible && r.selectVisible, 'two microphones: the chooser appears');
        eq('both devices are listed', r.options, 2);
        ok(/Mikrofonni tanlang/.test(r.label), 'the label is in the interface language');

        r = await state({ devices: [], deny: true });
        ok(r.visible, 'permission denied: the learner is told, not left with a blank');
        ok(!r.selectVisible, 'permission denied: no useless empty dropdown');
        ok(/ruxsat/.test(r.label), 'the denial message is in the interface language');
        ok(!/NotAllowedError|undefined/.test(r.label), 'no raw error text reaches the learner');

        console.log('='.repeat(60));
        if (fail) {
            console.log(`  ❌ B2 VOCABULARY MOBILE: ${fail} failed / ${pass + fail}\n`);
            failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
            console.log('='.repeat(60) + '\n');
            process.exit(1);
        }
        console.log(`  ✅ B2 VOCABULARY MOBILE: ${pass}/${pass} passed`);
        console.log('  (visual fit on a real phone is a manual check — jsdom has no layout)');
        console.log('='.repeat(60) + '\n');
    })();
}
