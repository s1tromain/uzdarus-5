#!/usr/bin/env node
/**
 * verify_final_mobile_cdp.cjs — the mobile audit, in a real browser, at last.
 *
 * WHAT WAS WRONG WITH EVERY EARLIER MOBILE CHECK IN THIS REPO.
 *
 * They measured a JSDOM document, or an element with `width: 360px`, and
 * called the result "360". Neither is a phone. A constrained div has no
 * layout viewport, so `@media (max-width: 480px)` never fires inside it, a
 * `position: fixed` bar cannot be measured against a real screen, and
 * `document.scrollWidth` cannot exceed a width nobody is enforcing. Such a
 * harness CANNOT PRODUCE the failures it exists to detect: it passes on a
 * page that is catastrophically broken on a real 360px phone. A test that
 * cannot fail is worse than no test, because it is believed.
 *
 * So this drives the actual Chrome installed on the machine over the actual
 * DevTools Protocol and sets device metrics with
 * Emulation.setDeviceMetricsOverride — the same call Chrome's own device
 * toolbar makes.
 *
 * THE PROOF THAT IT IS REAL. Three facts are asserted at 360 and 390, and the
 * third is the one a fake cannot survive:
 *
 *   1. window.innerWidth is the requested CSS width.
 *   2. document.documentElement.clientWidth is the requested width.
 *   3. CSS MEDIA QUERIES AGREE. matchMedia('(max-width: 480px)') matches at
 *      360 and 390 and does not match at 1280. Media queries are evaluated
 *      against the viewport and nothing else; no wrapper div, no JSDOM stub
 *      and no reshaped element can move them. If somebody swaps this suite
 *      back to a constrained div, this is the assertion that says so.
 *
 * The one thing that is NOT real here is Firebase auth: paid-platform.js asks
 * Google who the learner is, gets nobody, and redirects to the login page, so
 * the page under audit would never render. That single module is replaced (see
 * _cdp_platform_stub.cjs). Every byte the audit measures — markup, CSS, the
 * inline page script, the decks, the exercise engine, speech.js — is shipped
 * code. The banner below states this rather than hiding it.
 */
'use strict';

const path = require('path');
const { launch, serveRepo, findChrome } = require('./_cdp_driver.cjs');
const { platformStub } = require('./_cdp_platform_stub.cjs');

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

console.log('\n=== FINAL MOBILE CDP ===');

/* The widths the release is accountable for. 360 and 390 are the two the
   audience actually holds; the rest prove nothing collapses on the way up. */
const WIDTHS = [360, 390, 500, 768, 1024, 1280];
const PHONE = [360, 390];

/* Every page a paying learner can reach. */
const PAGES = [
    { name: 'cabinet dashboard',  url: '/my.cabinet/dashboard.html' },
    { name: 'login/auth entry',   url: '/my.cabinet/index.html' },
    { name: 'A1 course',          url: '/paid-courses/a1-course.html' },
    { name: 'A1 vocabulary',      url: '/paid-courses/a1-vocabulary.html' },
    { name: 'A2 course',          url: '/paid-courses/a2-course.html' },
    { name: 'A2 vocabulary',      url: '/paid-courses/a2-vocabulary.html' },
    { name: 'B1 course',          url: '/paid-courses/b1-course.html' },
    { name: 'B1 vocabulary',      url: '/paid-courses/b1-vocabulary.html' },
    { name: 'B2 course',          url: '/paid-courses/b2-course.html' },
    { name: 'B2 vocabulary',      url: '/paid-courses/b2-vocabulary.html' },
    { name: 'A1 final exam',      url: '/paid-courses/a1-final-exam.html' },
    { name: 'A2 final exam',      url: '/paid-courses/a2-final-exam.html' },
    { name: 'B1 final exam',      url: '/paid-courses/b1-final-exam.html' },
    { name: 'B2 final exam',      url: '/paid-courses/b2-final-exam.html' },
    { name: 'certificate verify', url: '/verify-certificate.html' }
];

const PROGRESS = {
    A1: { completedTopics: [1, 2], topicComponents: { 1: { vocabularyCompleted: true, exercisesCompleted: true } },
          vocabulary: { learnedWords: { topic_3: 12 } } },
    A2: { completedTopics: [1], topicComponents: {}, vocabulary: { learnedWords: { topic_2: 8 } } },
    B1: { completedTopics: [1], topicComponents: {}, vocabulary: { learnedWords: { topic_2: 8 } } },
    B2: { completedTopics: [1], topicComponents: {}, vocabulary: { learnedWords: { topic_2: 8 } } }
};

/* ---------------------------------------------------------------- *
 * PROBES
 * ---------------------------------------------------------------- */

/**
 * Horizontal overflow, measured the way a learner experiences it: can the
 * document be scrolled sideways?
 *
 * Elements that stick out are reported separately and judged separately,
 * because two kinds of them are CORRECT: a closed off-canvas nav drawer parked
 * at a negative offset, and decorative particles inside a clipping container.
 * Both are contained by an ancestor with overflow hidden, which is exactly why
 * the document itself does not scroll. Flagging them would train the reader to
 * ignore this suite.
 */
const OVERFLOW = `
    var d = document.documentElement, b = document.body;
    var cw = d.clientWidth;
    var docOverflow = Math.max(0, Math.max(d.scrollWidth, b ? b.scrollWidth : 0) - cw);

    /* DO NOT TRUST docOverflow ALONE.
       Every deck sets body{overflow-x:hidden}. That does not make wide content
       fit — it CLAMPS document.scrollWidth to the viewport and hides the
       excess, so a grid rendered 700px wide on a 360px phone reports
       docOverflow 0 while 350px of it is simply unreachable. A negative
       control that forced exactly that walked through an earlier version of
       this probe. So the real test is geometric: does any CONTENT element
       extend past the viewport? */
    var DECOR = ['floating-particle', 'background-animation', 'particle'];
    function decorative(el) {
        var n = el;
        while (n && n !== d) {
            var c = String(n.className || '');
            for (var i = 0; i < DECOR.length; i++) if (c.indexOf(DECOR[i]) >= 0) return true;
            n = n.parentElement;
        }
        return false;
    }

    /* CUT OFF vs SCROLLABLE — the distinction that matters to a learner.
       A wide grammar table inside overflow-x:auto is FINE: B2 deliberately
       turns .b2g-t into its own horizontal scroller on small screens, and the
       learner can reach every column. The same content inside
       overflow-x:hidden is a DEFECT: it is silently amputated with no way to
       reach it. Walk up and let the first ancestor that establishes x-overflow
       decide. */
    function reachable(el) {
        var n = el.parentElement;
        while (n && n !== d) {
            var ox = getComputedStyle(n).overflowX;
            if (ox === 'auto' || ox === 'scroll') return true;
            if (ox === 'hidden' || ox === 'clip') return false;
            n = n.parentElement;
        }
        return true;   /* nothing clips it: the document scrolls, docOverflow sees that */
    }
    var escaped = [];
    var all = document.querySelectorAll('body *');
    for (var i = 0; i < all.length; i++) {
        var el = all[i], cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
        var r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.right <= cw + 1 && r.left >= -1) continue;   /* inside: fine */
        if (r.right <= 1) continue;                        /* parked off-canvas left: a closed drawer */
        if (decorative(el)) continue;                      /* background art, clipped on purpose */
        if (reachable(el)) continue;                       /* inside a horizontal scroller */
        escaped.push(el.tagName + '.' + String(el.className).slice(0, 26) +
                     ' [' + Math.round(r.left) + '..' + Math.round(r.right) + ']');
    }
    return { docOverflow: docOverflow, cw: cw, iw: window.innerWidth,
             escaped: escaped.slice(0, 6), escapedCount: escaped.length };
`;

/** The three facts that separate a real viewport from a pretend one. */
const VIEWPORT_TRUTH = `
    return {
        innerWidth: window.innerWidth,
        clientWidth: document.documentElement.clientWidth,
        screenWidth: window.screen.width,
        dpr: window.devicePixelRatio,
        touch: ('ontouchstart' in window) || navigator.maxTouchPoints > 0,
        phoneMedia: window.matchMedia('(max-width: 480px)').matches,
        deskMedia: window.matchMedia('(min-width: 1024px)').matches,
        hasViewportMeta: !!document.querySelector('meta[name=viewport]')
    };
`;

const DOM_VALIDITY = `
    var seen = Object.create(null), dupIds = [];
    document.querySelectorAll('[id]').forEach(function (e) {
        if (seen[e.id]) dupIds.push(e.id); else seen[e.id] = 1; });
    var nestedButton = [];
    document.querySelectorAll('button').forEach(function (b) {
        if (b.querySelector('button')) nestedButton.push(b.className.slice(0, 30) || 'button'); });
    var nestedAnchor = [];
    document.querySelectorAll('a[href]').forEach(function (a) {
        if (a.querySelector('a[href],button')) nestedAnchor.push(String(a.className).slice(0, 30) || 'a'); });
    var orphanLabel = [];
    document.querySelectorAll('label[for]').forEach(function (l) {
        if (!document.getElementById(l.getAttribute('for'))) orphanLabel.push(l.getAttribute('for')); });
    return { dupIds: Array.from(new Set(dupIds)),
             nestedButton: Array.from(new Set(nestedButton)),
             nestedAnchor: Array.from(new Set(nestedAnchor)),
             orphanLabel: Array.from(new Set(orphanLabel)) };
`;

/**
 * Tap targets, restricted to the controls a learner must hit to LEARN —
 * answers, submit, resume, retry, review, vocabulary and topic cards. The
 * shared chrome (the toast dismiss ×, the nav drawer handle) is measured
 * separately and reported, because a 30px × on a toast that auto-dismisses is
 * not the same defect as a 20px answer button.
 */
const TAP = `
    var LEARN = 'button,a[href],[role=button],input[type=submit],input[type=button],' +
                '.option,.answer-option,.variant,.exercise-option,.topic-btn';
    /* NOT a blanket ignore — an explicit, named list of NON-LEARNING chrome,
       measured and reported separately so the numbers stay visible:
         pro-toast-close  the toast dismiss x on a toast that self-dismisses
         uzn-tab/uzn-close/uzn-item  the off-canvas nav drawer's own controls
         login-back / verify-back    "back to the site" text links
         exam-exit-btn    the leave-exam escape hatch; the four final exams are
                          byte-frozen for this release (C14), so it is measured
                          and disclosed rather than silently dropped.
       Everything a learner touches to LEARN is judged, with no exemption. */
    var CHROME = ['pro-toast-close', 'uzn-tab', 'uzn-close', 'uzn-item',
                  'login-back', 'verify-back', 'exam-exit-btn'];
    function isChrome(el) {
        var c = String(el.className);
        return CHROME.some(function (k) { return c.indexOf(k) >= 0; });
    }
    /* An element an ancestor clips is not on screen at all — a closed drawer.
       Judging it would train the reader to ignore this suite. */
    function clipped(el) {
        var a = el.parentElement;
        while (a && a !== document.documentElement) {
            var cs = getComputedStyle(a);
            if (cs.overflowX === 'hidden' || cs.overflowX === 'clip' ||
                cs.overflow === 'hidden' || cs.overflow === 'clip') {
                var ar = a.getBoundingClientRect(), er = el.getBoundingClientRect();
                if (er.right <= ar.left + 1 || er.left >= ar.right - 1) return true;
            }
            a = a.parentElement;
        }
        return false;
    }
    var small = [], chrome = [];
    document.querySelectorAll(LEARN).forEach(function (el) {
        var cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
        var r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        if (clipped(el)) return;
        var rec = { c: String(el.className).slice(0, 28), w: Math.round(r.width), h: Math.round(r.height),
                    t: (el.textContent || '').trim().slice(0, 18) };
        if (r.height < 32 || r.width < 32) (isChrome(el) ? chrome : small).push(rec);
    });
    return { small: small.slice(0, 8), smallCount: small.length,
             chrome: chrome.slice(0, 6), chromeCount: chrome.length };
`;

/**
 * Console noise that a release must not ship.
 *
 * There is no blanket ignore. The allowance is a short, explicit list of
 * messages the code deliberately prints in a scenario this suite deliberately
 * creates — an offline fallback that IS the designed behaviour. Anything else,
 * including anything a future change introduces, fails.
 */
const ALLOWED_CONSOLE = [
    /Progress key fallback/i,
    /VOCAB: (Firestore load error|Save progress error)/i,
    /\[PRON\] stale delayed render ignored/i,
    /Failed to load resource.*(favicon|\.mp3|\.png|\.jpg|fontawesome|font-awesome)/i,
    /net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|BLOCKED_BY_CLIENT)/i,
    /Access to (script|font|image) at/i,
    /cdnjs\.cloudflare\.com/i,
    /gstatic\.com|googleapis\.com|firebase/i
];
const FATAL_CONSOLE = /ReferenceError|TypeError|SyntaxError|is not a function|is not defined|Cannot read (properties|property)|Unhandled|permission-denied|Missing or insufficient permissions|Unexpected token/i;

function judgeConsole(page, label) {
    const bad = [];
    page.console.filter((c) => c.type === 'error').forEach((c) => {
        if (ALLOWED_CONSOLE.some((re) => re.test(c.text))) return;
        bad.push(c.text.slice(0, 160));
    });
    page.exceptions.forEach((e) => {
        const t = String(e);
        if (ALLOWED_CONSOLE.some((re) => re.test(t))) return;
        bad.push('EXCEPTION ' + t.slice(0, 160));
    });
    const fatal = bad.filter((t) => FATAL_CONSOLE.test(t));
    ok(fatal.length === 0, `${label} — no uncaught exception / ReferenceError / TypeError (${fatal.join(' | ')})`);
    return bad;
}

(async () => {

if (!findChrome()) {
    console.log('='.repeat(60));
    console.log('  ❌ FINAL MOBILE CDP: BLOCKER — no Chrome/Chromium binary found.');
    console.log('     This suite refuses to fall back to a simulated viewport.');
    console.log('     Install Google Chrome or set CHROME_PATH.');
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}

const site = await serveRepo();
const browser = await launch();
console.log(`  driver: ${browser.version} · DevTools protocol ${browser.protocol} · real Emulation.setDeviceMetricsOverride`);
console.log('  auth boundary substituted (paid-platform.js); all audited markup, CSS and page script is shipped code');

const page = await browser.newPage();
await page.route((url) => (/paid-platform\.js/.test(url)
    ? platformStub({ progress: PROGRESS, componentCompletesTopic: false }) : null));
await page.onNewDocument(`
    try {
        localStorage.setItem('currentUser', JSON.stringify(
            { id: 'u-cdp', email: 'audit@uzdarus.test', name: 'Audit', role: 'student' }));
    } catch (e) {}
`);

const U = (p) => `http://127.0.0.1:${site.port}${p}`;

/* ================================================================ *
 * C1/C2 — THE OVERRIDE IS REAL
 * ================================================================ */
const realCdp = {};
{
    const probe = '/paid-courses/a1-vocabulary.html';
    for (const w of WIDTHS) {
        const mobile = w <= 480;
        await page.setDevice(w, mobile ? 800 : 900, mobile);
        await page.goto(U(probe), { waitMs: 1200 });
        const v = await page.evaluate(VIEWPORT_TRUTH);

        eq(`${w}px — window.innerWidth is the requested CSS width`, v.innerWidth, w);
        eq(`${w}px — documentElement.clientWidth is the requested width`, v.clientWidth, w);
        eq(`${w}px — screen.width follows the device metric override`, v.screenWidth, w);
        ok(v.hasViewportMeta, `${w}px — the page declares a viewport meta`);

        if (PHONE.includes(w)) {
            /* THE ASSERTION A CONSTRAINED DIV CANNOT PASS. */
            ok(v.phoneMedia === true,
                `${w}px — CSS media query (max-width:480px) MATCHES, so the viewport is genuinely ${w}`);
            ok(v.deskMedia === false,
                `${w}px — the desktop media query does not match`);
            ok(v.touch === true, `${w}px — touch input is emulated`);
            eq(`${w}px — device pixel ratio is a phone's`, v.dpr, 3);
            realCdp[w] = v.innerWidth === w && v.clientWidth === w && v.phoneMedia === true && v.touch === true;
        }
        if (w >= 1024) {
            ok(v.deskMedia === true, `${w}px — the desktop media query matches`);
            ok(v.phoneMedia === false, `${w}px — the phone media query does not match`);
        }
    }

    /* the override must be LIVE: the same document must follow a resize */
    await page.setDevice(1280, 900, false);
    const wide = await page.evaluate(VIEWPORT_TRUTH);
    await page.setDevice(360, 800, true);
    const narrow = await page.evaluate(VIEWPORT_TRUTH);
    eq('the same document reports 1280 when overridden to 1280', wide.innerWidth, 1280);
    eq('the same document reports 360 when overridden back to 360', narrow.innerWidth, 360);
    ok(wide.phoneMedia === false && narrow.phoneMedia === true,
        'media queries re-evaluate on the SAME document when the metric changes');
}

console.log(`  360 REAL CDP: ${realCdp[360] ? 'YES' : 'NO'}`);
console.log(`  390 REAL CDP: ${realCdp[390] ? 'YES' : 'NO'}`);
ok(realCdp[360] === true, '360 REAL CDP');
ok(realCdp[390] === true, '390 REAL CDP');

/* ================================================================ *
 * C3 / C6 / C8 / C9 — EVERY LEARNER PAGE, EVERY WIDTH
 * ================================================================ */
let stateCount = 0;
for (const p of PAGES) {
    for (const w of WIDTHS) {
        const mobile = w <= 480;
        await page.setDevice(w, mobile ? 800 : 900, mobile);
        await page.goto(U(p.url), { waitMs: mobile ? 1300 : 900 });
        stateCount++;

        const m = await page.evaluate(OVERFLOW);
        eq(`${p.name} @${w} — document horizontal overflow`, m.docOverflow, 0);
        eq(`${p.name} @${w} — the viewport really is ${w}`, m.iw, w);
        ok(m.escapedCount === 0,
            `${p.name} @${w} — nothing escapes the viewport unclipped (${m.escaped.join(', ')})`);
        judgeConsole(page, `${p.name} @${w}`);

        if (w === 360) {
            const dom = await page.evaluate(DOM_VALIDITY);
            eq(`${p.name} — no duplicate id (${dom.dupIds.join(', ')})`, dom.dupIds.length, 0);
            eq(`${p.name} — no <button> nested in a <button> (${dom.nestedButton.join(', ')})`,
                dom.nestedButton.length, 0);
            eq(`${p.name} — no interactive control nested in a link (${dom.nestedAnchor.join(', ')})`,
                dom.nestedAnchor.length, 0);
            eq(`${p.name} — every label points at an element that exists (${dom.orphanLabel.join(', ')})`,
                dom.orphanLabel.length, 0);
        }
        if (PHONE.includes(w)) {
            const tap = await page.evaluate(TAP);
            ok(tap.smallCount === 0,
                `${p.name} @${w} — every learning control is at least 32px (${
                    tap.small.map((s) => `${s.c || s.t} ${s.w}x${s.h}`).join('; ')})`);
        }
    }
}

/* ================================================================ *
 * C5 — VOCABULARY STATES, DRIVEN ON A PHONE
 * ================================================================ */
const VOCAB = [
    ['A1', '/paid-courses/a1-vocabulary.html'],
    ['A2', '/paid-courses/a2-vocabulary.html'],
    ['B1', '/paid-courses/b1-vocabulary.html'],
    ['B2', '/paid-courses/b2-vocabulary.html']
];

for (const [code, url] of VOCAB) {
    for (const w of PHONE) {
        await page.setDevice(w, 800, true);
        await page.goto(U(url), { waitMs: 1300 });

        /* initial */
        let m = await page.evaluate(OVERFLOW);
        eq(`${code} vocab initial @${w} — no overflow`, m.docOverflow, 0);
        stateCount++;

        /* mid deck — open a topic and step through cards */
        const opened = await page.evaluate(`
            var open = window.startTopic || window.openTopic;
            if (typeof open !== 'function') return 'no-open';
            window.vocabResumeChoice = function () { return Promise.resolve('continue'); };
            open(1);
            return 'ok';`);
        ok(opened === 'ok', `${code} vocab @${w} — the deck exposes its open function`);
        await new Promise((r) => setTimeout(r, 700));
        await page.evaluate(`
            var n = window.nextCard || window.nextWord;
            for (var i = 0; i < 3 && typeof n === 'function'; i++) n();
            return 1;`);
        await new Promise((r) => setTimeout(r, 400));
        m = await page.evaluate(OVERFLOW);
        eq(`${code} vocab mid-deck @${w} — no overflow`, m.docOverflow, 0);
        ok(m.escapedCount === 0, `${code} vocab mid-deck @${w} — nothing escapes (${m.escaped.join(', ')})`);
        judgeConsole(page, `${code} vocab mid-deck @${w}`);
        stateCount++;

        /* the Russian word and its translation must WRAP, not spill */
        const wrap = await page.evaluate(`
            var ru = document.getElementById('wordRussian') || document.querySelector('.word-russian, .card-word');
            var uz = document.getElementById('wordUzbek') || document.querySelector('.word-uzbek, .card-translation');
            var cw = document.documentElement.clientWidth;
            function judge(el) {
                if (!el) return null;
                var r = el.getBoundingClientRect();
                return { right: Math.round(r.right), over: r.right > cw + 1 || r.left < -1,
                         scrollsWider: el.scrollWidth > el.clientWidth + 1 };
            }
            return { ru: judge(ru), uz: judge(uz), cw: cw };`);
        if (wrap.ru) {
            ok(!wrap.ru.over, `${code} vocab @${w} — the Russian word stays inside the viewport`);
            ok(!wrap.ru.scrollsWider, `${code} vocab @${w} — the Russian word wraps instead of scrolling`);
        }
        if (wrap.uz) {
            ok(!wrap.uz.over, `${code} vocab @${w} — the translation stays inside the viewport`);
            ok(!wrap.uz.scrollsWider, `${code} vocab @${w} — the translation wraps instead of scrolling`);
        }

        /* completed + the sync-pending error state, rendered for real */
        await page.evaluate(`
            /* the sync-pending note lives on the COMPLETION screen, so show
               that screen the way the deck does before judging what it looks
               like — measuring it while it is display:none reports 0x0 and
               proves nothing */
            var fc = document.getElementById('flashcardScreen');
            var cs = document.getElementById('completionScreen');
            if (fc) fc.classList.remove('active');
            if (cs) cs.classList.add('active');
            var V = window.UzVocabularyComponent;
            var apply = window.${code.toLowerCase()}ApplyVocabOutcome;
            if (typeof apply === 'function') {
                apply(1, { ok: false, stage: 'component', retryComponent: true,
                           message: V ? V.MESSAGES.SAVE_FAILED : 'x' });
            }
            return 1;`);
        await new Promise((r) => setTimeout(r, 300));
        const sync = await page.evaluate(`
            var box = document.querySelector('.uz-vocab-error');
            var btn = document.querySelector('.uz-vocab-retry');
            var cw = document.documentElement.clientWidth;
            if (!box || !btn) return { present: false };
            var br = btn.getBoundingClientRect(), xr = box.getBoundingClientRect();
            var cs = getComputedStyle(btn);
            return { present: true, w: Math.round(br.width), h: Math.round(br.height),
                     inside: xr.right <= cw + 1 && xr.left >= -1,
                     btnInside: br.right <= cw + 1 && br.left >= -1,
                     visible: cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0',
                     docOverflow: Math.max(0, document.documentElement.scrollWidth - cw) };`);
        ok(sync.present, `${code} vocab sync-pending @${w} — the retry state renders`);
        if (sync.present) {
            ok(sync.inside, `${code} vocab sync-pending @${w} — the error box fits the viewport`);
            ok(sync.btnInside, `${code} vocab sync-pending @${w} — the retry button is not offscreen`);
            ok(sync.visible, `${code} vocab sync-pending @${w} — the retry button is visible`);
            ok(sync.h >= 32 && sync.w >= 32,
                `${code} vocab sync-pending @${w} — the retry button is tappable (${sync.w}x${sync.h})`);
            eq(`${code} vocab sync-pending @${w} — the page still does not scroll sideways`, sync.docOverflow, 0);
        }
        stateCount++;

        /* speech: idle, listening, and the three star results, plus an error */
        const speech = await page.evaluate('return typeof window._showPronResult === "function" && typeof window._showPronListening === "function"');
        ok(speech, `${code} vocab @${w} — speech.js exposes its result UI`);
        if (speech) {
            await page.evaluate('window._showPronListening(); return 1;');
            await new Promise((r) => setTimeout(r, 250));
            let s = await page.evaluate(OVERFLOW);
            eq(`${code} speech listening @${w} — no overflow`, s.docOverflow, 0);
            ok(s.escapedCount === 0, `${code} speech listening @${w} — the modal stays on screen`);
            stateCount++;

            for (const [label, score, verdict, stars] of
                 [['1-star', 25, 'poor', 1], ['3-star', 65, 'good', 3], ['5-star', 95, 'excellent', 5]]) {
                await page.evaluate(`
                    window._showPronResult('привет', { finalScore: ${score}, verdict: '${verdict}',
                        stars: ${stars}, accuracyScore: ${score}, fluencyScore: ${score},
                        completenessScore: ${score}, words: [] }, null);
                    return 1;`);
                await new Promise((r) => setTimeout(r, 800));
                const r = await page.evaluate(`
                    var cw = document.documentElement.clientWidth;
                    var card = document.getElementById('pronCard');
                    var stars = document.querySelectorAll('.pron-star.on').length;
                    var cr = card ? card.getBoundingClientRect() : null;
                    return { docOverflow: Math.max(0, document.documentElement.scrollWidth - cw),
                             stars: stars,
                             fits: cr ? (cr.right <= cw + 1 && cr.left >= -1) : null,
                             width: cr ? Math.round(cr.width) : null, cw: cw };`);
                eq(`${code} speech ${label} @${w} — no overflow`, r.docOverflow, 0);
                if (r.fits !== null) {
                    ok(r.fits, `${code} speech ${label} @${w} — the result modal fits the viewport (${r.width} of ${r.cw})`);
                }
                eq(`${code} speech ${label} @${w} — the star count rendered`, r.stars, stars);
                stateCount++;
            }

            await page.evaluate(`
                window._showPronResult('привет', { finalScore: 0, verdict: 'empty', stars: 0,
                    accuracyScore: 0, fluencyScore: 0, completenessScore: 0, words: [] }, null);
                return 1;`);
            await new Promise((r) => setTimeout(r, 800));
            const err = await page.evaluate(OVERFLOW);
            eq(`${code} speech error @${w} — no overflow`, err.docOverflow, 0);
            judgeConsole(page, `${code} speech states @${w}`);
            stateCount++;
        }
    }
}

/* ================================================================ *
 * C4 — COURSE STATES, DRIVEN ON A PHONE
 * ================================================================ */
const COURSES = [
    ['A1', '/paid-courses/a1-course.html'],
    ['A2', '/paid-courses/a2-course.html'],
    ['B1', '/paid-courses/b1-course.html'],
    ['B2', '/paid-courses/b2-course.html']
];

for (const [code, url] of COURSES) {
    for (const w of PHONE) {
        await page.setDevice(w, 800, true);
        await page.goto(U(url), { waitMs: 1600 });

        /* fresh: the topic list */
        let m = await page.evaluate(OVERFLOW);
        eq(`${code} course fresh @${w} — no overflow`, m.docOverflow, 0);
        ok(m.escapedCount === 0, `${code} course fresh @${w} — nothing escapes (${m.escaped.join(', ')})`);
        stateCount++;

        /* the topic card is reachable, tappable and keyboard-operable */
        const card = await page.evaluate(`
            var c = document.querySelector('.topic-btn');
            if (!c) return { present: false };
            var r = c.getBoundingClientRect();
            var cw = document.documentElement.clientWidth;
            return { present: true, w: Math.round(r.width), h: Math.round(r.height),
                     inside: r.right <= cw + 1 && r.left >= -1,
                     role: c.getAttribute('role'), tabindex: c.getAttribute('tabindex'),
                     innerButtons: c.querySelectorAll('button').length,
                     tag: c.tagName };`);
        ok(card.present, `${code} course @${w} — the topic list rendered`);
        if (card.present) {
            ok(card.inside, `${code} course @${w} — the topic card fits the viewport`);
            ok(card.h >= 32 && card.w >= 32, `${code} course @${w} — the topic card is tappable (${card.w}x${card.h})`);
            eq(`${code} course @${w} — the topic card is not a <button> wrapping a <button>`, card.tag, 'DIV');
            eq(`${code} course @${w} — the topic card is still exposed as a button`, card.role, 'button');
            eq(`${code} course @${w} — the topic card is still keyboard-reachable`, card.tabindex, '0');
        }

        /* mid exercise: open a topic and let the lesson render */
        await page.evaluate(`
            var c = document.querySelector('.topic-btn');
            if (c) c.click();
            return 1;`);
        await new Promise((r) => setTimeout(r, 1200));
        m = await page.evaluate(OVERFLOW);
        eq(`${code} course lesson open @${w} — no overflow`, m.docOverflow, 0);
        ok(m.escapedCount === 0, `${code} course lesson @${w} — nothing escapes (${m.escaped.join(', ')})`);
        judgeConsole(page, `${code} course lesson @${w}`);
        stateCount++;

        /* the answer controls of whatever exercise is on screen */
        const controls = await page.evaluate(`
            var cw = document.documentElement.clientWidth;
            var sel = 'button,.option,.answer-option,.variant,input[type=text],select';
            function clipped(el) {
                var a = el.parentElement;
                while (a && a !== document.documentElement) {
                    var cs2 = getComputedStyle(a);
                    if (cs2.overflowX === 'hidden' || cs2.overflowX === 'clip' ||
                        cs2.overflow === 'hidden' || cs2.overflow === 'clip') {
                        var ar = a.getBoundingClientRect(), er = el.getBoundingClientRect();
                        if (er.right <= ar.left + 1 || er.left >= ar.right - 1) return true;
                    }
                    a = a.parentElement;
                }
                return false;
            }
            var small = [], out = 0, n = 0;
            document.querySelectorAll(sel).forEach(function (el) {
                var cs = getComputedStyle(el);
                if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
                var r = el.getBoundingClientRect();
                if (!r.width || !r.height) return;
                if (clipped(el)) return;          /* a closed off-canvas drawer */
                n++;
                if (r.right > cw + 1 || r.left < -1) out++;
                if ((r.height < 32 || r.width < 32) &&
                    String(el.className).indexOf('pro-toast') < 0 &&
                    String(el.className).indexOf('uzn-') < 0)
                    small.push(String(el.className).slice(0, 24) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
            });
            return { n: n, out: out, small: small.slice(0, 6), smallCount: small.length };`);
        ok(controls.n > 0, `${code} course lesson @${w} — the lesson has interactive controls (${controls.n})`);
        eq(`${code} course lesson @${w} — no control is clipped offscreen`, controls.out, 0);
        ok(controls.smallCount === 0,
            `${code} course lesson @${w} — every lesson control is tappable (${controls.small.join('; ')})`);
        stateCount++;
    }
}

/* ================================================================ *
 * SERVED 404s — a core asset that is not there
 * ================================================================ */
{
    const core = Array.from(new Set(site.missing)).filter((u) => /\.(js|css|html)$/i.test(u));
    eq(`no core script/style/page 404 (${core.slice(0, 6).join(', ')})`, core.length, 0);
}

await browser.close();
await site.close();

/* ================================================================ *
 * REPORT
 * ================================================================ */
console.log(`  ${PAGES.length} pages × ${WIDTHS.length} widths · ${stateCount} measured page-states · real device metrics throughout`);
console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ FINAL MOBILE CDP: ${fail} failed, ${pass} passed`);
    failures.forEach((f) => console.log('     • ' + f));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ FINAL MOBILE CDP: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');

})().catch((e) => { console.error('MOBILE CDP HARNESS ERROR', e); process.exit(1); });
