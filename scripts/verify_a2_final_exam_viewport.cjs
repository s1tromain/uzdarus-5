#!/usr/bin/env node
/**
 * verify_a2_final_exam_viewport.cjs — the A2 final exam must fit a phone,
 * measured by a real browser.
 *
 * The DOM suite next door proves the exam BEHAVES (gate, timer, autosave,
 * server verdict). It cannot prove it FITS: jsdom has no layout engine, so
 * every width it reports is zero. This renders the page's own markup with the
 * page's own stylesheet in headless Chrome and reads back real geometry at four
 * widths the browser genuinely honours.
 *
 * The markup is not hand-written here. The real page is booted in jsdom with
 * the same stubs the DOM suite uses, its own renderExam() builds all 100
 * questions, and the resulting HTML is what Chrome measures — plus the four
 * end states a learner can land on (locked, sync error, PASS, submit error),
 * captured the same way.
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

const CHROME = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium-browser'
].find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch (e) { return false; } });

console.log('\n=== A2 FINAL EXAM · VIEWPORT ===');
if (!CHROME) {
    console.log('  ⚠ Chrome not found — real viewport measurement SKIPPED');
    console.log('='.repeat(60) + '\n');
    process.exit(0);
}

const REL = 'paid-courses/a2-final-exam.html';
let html = fs.readFileSync(path.join(ROOT, REL), 'utf8');
html = html.replace(/<script type="module" src="paid-platform\.js"><\/script>/, '');
html = html.replace(/<script defer src="pro-toast\.js"><\/script>/, '');
const pageCss = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
ok(pageCss.length > 2000, `the exam page stylesheet was lifted (${pageCss.length} chars)`);

const mem = {};
function boot(extra) {
    const dom = new JSDOM(html, {
        runScripts: 'dangerously', pretendToBeVisual: true,
        beforeParse(w) {
            Object.defineProperty(w, 'localStorage', {
                value: {
                    getItem: (k) => (k in mem ? mem[k] : null),
                    setItem: (k, v) => { mem[k] = String(v); },
                    removeItem: (k) => { delete mem[k]; },
                    clear: () => { Object.keys(mem).forEach((k) => delete mem[k]); }
                }, configurable: true
            });
            w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {};
            w.print = () => {};
            w.HTMLElement.prototype.scrollIntoView = () => {};
            w.localStorage.setItem('currentUser', JSON.stringify(
                { id: 'vpUser', name: 'Test Talaba', email: 't@x.uz' }));
            w.saveQuizResult = async () => true;
            w.saveUserProgress = async () => true;
            w.getUserQuizResults = async () => ({});
            w.__completed = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16];
            w.getUserProgress = async () => ({ completedTopics: w.__completed });
            w.getAuthoritativeCourseProgress = async () => {
                if (w.__authFails) throw new Error('read failed');
                return { completedTopics: w.__completed, userExists: true };
            };
            w.submitFinalExam = async (course, answers) => {
                if (w.__submitRejects) {
                    const e = new Error('rejected'); e.status = w.__submitRejects; throw e;
                }
                return Object.assign({ ok: true, course },
                    w.__serverResult || { correct: 100, total: 100, score: 100,
                        passMark: 80, passed: true, certificateUnlocked: true });
            };
            w.uzTrack = () => {};
            if (extra) extra(w);
        }
    });
    return dom;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    /* ---- capture the states a learner can actually see ---- */
    const states = {};

    let dom = boot();
    await wait(500);
    let d = dom.window.document;
    eq('the exam rendered all 100 questions', d.querySelectorAll('[data-exam-row]').length, 100);
    /* There is no #examContainer — the questions live in #examExercises, the
       timer and footer are siblings. Capturing the whole body (minus scripts)
       measures the real page shell: timer, all 100 cards, and the footer. */
    states.exam = d.body.innerHTML.replace(/<script[\s\S]*?<\/script>/g, '');
    ok(d.querySelectorAll('.exam-q-chip').length > 0, 'chips rendered');
    ok(d.querySelectorAll('.exam-q-input').length > 0, 'inputs rendered');
    ok(!!d.getElementById('examTimerDisplay'), 'the timer is on the page');
    ok(!!d.getElementById('examFooterBar'), 'the submit footer is on the page');
    dom.window.close();

    /* PASS result */
    Object.keys(mem).forEach((k) => delete mem[k]);
    dom = boot();
    await wait(400);
    d = dom.window.document;
    d.getElementById('examSubmitBtn').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await wait(800);
    states.pass = d.getElementById('examFeedback').outerHTML;
    ok(/exam-result-box/.test(states.pass), 'a PASS result screen was captured');
    dom.window.close();

    /* FAIL result */
    Object.keys(mem).forEach((k) => delete mem[k]);
    dom = boot((w) => { w.__serverResult = { correct: 20, total: 100, score: 20,
        passMark: 80, passed: false, certificateUnlocked: false }; });
    await wait(400);
    d = dom.window.document;
    d.getElementById('examSubmitBtn').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await wait(800);
    states.fail = d.getElementById('examFeedback').outerHTML;
    ok(/failed/.test(states.fail), 'a FAIL result screen was captured');
    dom.window.close();

    /* submit-error + retry */
    Object.keys(mem).forEach((k) => delete mem[k]);
    dom = boot((w) => { w.__submitRejects = 500; });
    await wait(400);
    d = dom.window.document;
    d.getElementById('examSubmitBtn').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await wait(800);
    states.retry = d.getElementById('examFeedback').outerHTML;
    ok(/examRetrySubmitBtn/.test(states.retry), 'a submit-error screen with retry was captured');
    dom.window.close();

    /* locked */
    Object.keys(mem).forEach((k) => delete mem[k]);
    dom = boot((w) => { w.__completed = [1, 2, 3]; });
    await wait(500);
    d = dom.window.document;
    states.locked = d.getElementById('examExercises').outerHTML;
    ok(/tugatgandan/.test(states.locked), 'the locked screen was captured');
    dom.window.close();

    /* sync error */
    Object.keys(mem).forEach((k) => delete mem[k]);
    dom = boot((w) => { w.__authFails = true; });
    await wait(500);
    d = dom.window.document;
    states.sync = d.getElementById('examExercises').outerHTML;
    ok(/tekshirib bo/.test(states.sync), 'the sync-error screen was captured');
    dom.window.close();

    /* ---- measure every state in real Chrome ---- */
    const VIEWPORTS = [[1280, 900], [1024, 800], [768, 900], [500, 800]];
    const tmp = path.join(os.tmpdir(), 'uz-a2exam-viewport.html');

    for (const [name, markup] of Object.entries(states)) {
        const fixture = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${pageCss}</style><style>body{margin:0}</style></head>
<body><div id="vpWrap">${markup}</div>
<script>
window.addEventListener('load', function () {
  var de = document.documentElement;
  var wide = [];
  document.querySelectorAll('#vpWrap *').forEach(function (n) {
    if (n.getBoundingClientRect().width > de.clientWidth + 1) {
      wide.push((n.tagName + '.' + (n.className || '')).slice(0, 50));
    }
  });
  var taps = [].map.call(document.querySelectorAll('.exam-q-chip, .uz-btn, button'),
    function (b) { var r = b.getBoundingClientRect();
      return { h: Math.round(r.height), w: Math.round(r.width),
               sel: (b.tagName + '.' + (b.className || '')).slice(0, 46),
               txt: (b.textContent || '').trim().slice(0, 22) }; })
    .filter(function (t) { return t.h > 0; });
  taps.sort(function (a, b) { return a.h - b.h; });
  var tap = taps.map(function (t) { return t.h; });
  document.title = 'VP' + JSON.stringify({
    clientWidth: de.clientWidth, scrollWidth: de.scrollWidth,
    overflow: de.scrollWidth - de.clientWidth,
    wide: wide.slice(0, 5),
    minTap: tap.length ? tap[0] : null,
    smallest: taps.slice(0, 3),
    chipMin: (function () {
      var c = [].map.call(document.querySelectorAll('.exam-q-chip'),
        function (b) { return Math.round(b.getBoundingClientRect().height); })
        .filter(function (h) { return h > 0; });
      return c.length ? Math.min.apply(null, c) : null;
    })(),
    controls: tap.length
  });
});
<\/script></body></html>`;
        fs.writeFileSync(tmp, fixture);

        for (const [w, h] of VIEWPORTS) {
            let out = '';
            try {
                out = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
                    '--virtual-time-budget=4000', `--window-size=${w},${h}`,
                    '--force-device-scale-factor=1', '--hide-scrollbars',
                    '--dump-dom', 'file://' + tmp],
                    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 96 * 1024 * 1024 });
            } catch (e) { out = (e.stdout || '').toString(); }
            const m = out.match(/<title>VP(\{[\s\S]*?\})<\/title>/);
            if (!m) {
                fail++; failures.push(`${name} @ ${w}: no measurement`);
                continue;
            }
            const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
            const label = `${name} @ ${w}`;
            console.log(`  ${label.padEnd(16)} client=${r.clientWidth} scroll=${r.scrollWidth}`
                + ` overflow=${r.overflow}`
                + (r.minTap != null ? ` · ${r.controls} controls, min height ${r.minTap}px`
                    + (r.chipMin != null ? ` · answer chips >= ${r.chipMin}px` : '') : ''));
            if (r.smallest && r.smallest.length) {
                console.log(`      smallest: ${r.smallest.map((t) => `${t.h}x${t.w} ${t.sel} «${t.txt}»`).join(' | ')}`);
            }
            ok(Math.abs(r.clientWidth - w) <= 20,
                `${label}: Chrome really opened this width (${r.clientWidth})`);
            ok(r.overflow <= 1, `${label}: no horizontal overflow (${r.overflow}px)`);
            ok(r.wide.length === 0,
                `${label}: nothing is wider than the viewport (${r.wide.join(' ; ')})`);
            /* TOUCH TARGETS — measured, and asserted at the size this page
               actually ships, not at a number invented here.
               The ANSWER CHIPS are what a learner taps 78 times, so they carry
               the assertion. They measure 40px at desktop widths and 37px at
               =768, which is the exam's own long-standing design: the identical
               stylesheet is live in a1-final-exam.html and b1-final-exam.html.
               Raising them to 44px would be a redesign of three shipping exam
               pages, which this audit is explicitly not doing.
               The one control below that floor is .exam-exit-btn, which the
               page turns into an ICON-ONLY button under 768px on purpose
               (`.exam-exit-btn span { display: none; }`) and which then measures
               about 14x22px. That is a real usability nit and it is
               PRE-EXISTING and SHARED with A1 and B1 — it is reported, not
               silently absorbed, and not fixed inside a release that must not
               touch exam layout. */
            if (r.chipMin != null) {
                ok(r.chipMin >= 36,
                    `${label}: answer chips keep their shipped tap height (${r.chipMin}px)`);
            }
            if (r.smallest && r.smallest.length) {
                const tiny = r.smallest.filter((t) => t.h < 36
                    && !/exam-exit-btn/.test(t.sel));
                eq(`${label}: no control below 36px other than the icon-only exit button`,
                    tiny.length, 0);
            }
        }
    }
    try { fs.unlinkSync(tmp); } catch (e) {}

    console.log('='.repeat(60));
    if (fail) {
        console.log(`  ❌ A2 FINAL EXAM VIEWPORT: ${fail} failed / ${pass + fail}\n`);
        failures.slice(0, 20).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
        console.log('='.repeat(60) + '\n');
        process.exit(1);
    }
    console.log(`  ✅ A2 FINAL EXAM VIEWPORT: ${pass}/${pass} passed (measured in Chrome)`);
    console.log('='.repeat(60) + '\n');
})().catch((e) => { console.error(e); process.exit(2); });
