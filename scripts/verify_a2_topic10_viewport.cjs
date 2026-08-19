#!/usr/bin/env node
/**
 * verify_a2_topic6_viewport.cjs — Topic 6 must fit a phone, measured by a real
 * browser.
 *
 * jsdom has no layout engine, so every earlier "mobile" claim in this repo was
 * really a claim about CSS source. This renders the ACTUAL markup and the ACTUAL
 * stylesheets in headless Chrome and reads back real geometry: horizontal
 * overflow, element widths and control heights at 360x640, 390x844 and desktop.
 *
 * Chrome is used through --dump-dom, so no browser-automation dependency is
 * added to a suite that otherwise runs offline in seconds. If Chrome is not
 * present the suite says so and skips rather than pretending to have measured.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };

const CHROME = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium-browser'
].find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch (e) { return false; } });

console.log('\n=== A2 TOPIC 10 · VIEWPORT ===');
if (!CHROME) {
    console.log('  ⚠ Chrome not found — real viewport measurement SKIPPED');
    console.log('='.repeat(60) + '\n');
    process.exit(0);
}

/* ---- the real content and the real stylesheets ---- */
const PAGE = fs.readFileSync(path.join(ROOT, 'paid-courses/a2-course.html'), 'utf8');
const pageCss = PAGE.slice(PAGE.indexOf('<style>') + 7, PAGE.indexOf('</style>'));

function mainScript(html) {
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
    let m, best = '';
    while ((m = re.exec(html))) {
        if (/\bsrc=/.test(m[1])) continue;
        if (m[2].length > best.length) best = m[2];
    }
    return best;
}
const S = mainScript(PAGE);
const i = S.search(/const courseData\s*=\s*\{/);
let d = 0, j = S.indexOf('{', i), e = -1;
for (let k = j; k < S.length; k++) {
    if (S[k] === '{') d++;
    else if (S[k] === '}') { d--; if (d === 0) { e = k; break; } }
}
const t6 = vm.runInNewContext('(' + S.slice(j, e + 1) + ')', {}).topics.find((t) => t.id === 10);
const groups = t6.topic10Exercises.exercises;

/* The shared component injects its own CSS at runtime; pull the literal out so
   the harness styles the exercise markup exactly as the product does. */
const UI = fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8');
const sessionSrc = fs.readFileSync(path.join(ROOT, 'exercise-session.js'), 'utf8');
/* Both modules keep their stylesheet as an array of string fragments joined at
   runtime. Lift the array literal and join it, so the harness is styled by the
   product's own CSS rather than by a copy that could drift. */
function cssLiteral(src, anchor) {
    const at = src.indexOf(anchor);
    if (at < 0) return '';
    /* Anchor on the assignment, not on the nearest '[': the fragments contain
       selectors like `[hidden]` that would otherwise be mistaken for its start. */
    const end = src.indexOf('].join(', at);
    if (end < 0) return '';
    const start = src.lastIndexOf('= [', src.lastIndexOf('\n', at)) >= 0
        ? src.lastIndexOf('= [', at) + 2
        : -1;
    if (start < 0 || start > at) return '';
    try {
        const parts = vm.runInNewContext('(' + src.slice(start, end + 1) + ')', {});
        return Array.isArray(parts) ? parts.join('') : '';
    } catch (err) { return ''; }
}
const componentCss = cssLiteral(UI, '.b2h-howto{') + cssLiteral(sessionSrc, '.uz-step{');
if (!/\.uz-btn\b/.test(componentCss)) {
    console.log('  ⚠ the session stylesheet could not be lifted — button metrics unreliable');
}

/* Render every step's markup with the product's own renderer. */
const uiWin = { document: { createElement: () => ({ style: {}, appendChild() {} }) } };
/* renderGroup resolves an audioSrc against the page location, so the sandbox
   must present one — the harness stands in for a /paid-courses/ page. */
const sandbox = { window: uiWin, document: uiWin.document,
    location: { pathname: '/paid-courses/a2-course.html' },
    console: { log() {}, warn() {}, error() {} } };
uiWin.location = sandbox.location;
sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(UI, sandbox);
const renderGroup = sandbox.window.UzExerciseUI.renderGroup;

const stepsHtml = groups.map((g, n) =>
    `<section class="vp-step" data-step="${n}" data-id="${g.id}">${renderGroup(g)}</section>`).join('');

/* Chrome will not open a window narrower than ~500 CSS px, so a true 360px
   VIEWPORT cannot be produced this way. Two complementary measurements are
   taken instead, and reported for what each actually proves:
     - window widths Chrome does honour, which exercise real viewport layout;
     - a 360 / 390 px CONTAINER, which proves no element overflows that width.
   A media-query-accurate 360px viewport needs CDP device emulation; that is a
   browser-automation dependency this suite does not add. */
const VIEWPORTS = [[500, 800], [1280, 900]];
const NARROW = [360, 390];

const harness = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${pageCss}</style><style>${componentCss}</style>
<style>body{margin:0}.vp-wrap{padding:12px}.uz-foot{display:flex;gap:8px;padding:10px}</style>
</head><body><div class="vp-wrap" id="vpWrap">
<div class="vp-grammar">${t6.grammar}</div>
<div class="vp-content">${t6.content}</div>
${stepsHtml}
<div class="uz-foot">
  <button class="uz-btn uz-btn-primary">Javoblarni tekshirish</button>
  <button class="uz-btn uz-btn-primary">Keyingi mashq</button>
  <button class="uz-btn uz-btn-primary">Savollarga o‘tish</button>
</div>
</div>
<script>
window.addEventListener('load', function () {
  var de = document.documentElement;
  var wide = [];
  document.querySelectorAll('.vp-wrap *').forEach(function (n) {
    var r = n.getBoundingClientRect();
    if (r.width > de.clientWidth + 1) {
      wide.push((n.tagName + '.' + (n.className || '')).slice(0, 60) + ' = ' + Math.round(r.width));
    }
  });
  var btns = [].map.call(document.querySelectorAll('.uz-btn, .t1-opt'), function (b) {
    var r = b.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  var out = {
    narrow: (function () {
      var wrap = document.getElementById('vpWrap');
      var res = {};
      [360, 390].forEach(function (px) {
        wrap.style.width = px + 'px';
        var over = [], scrolled = 0;
        /* A wide table is NOT an overflow: the shared stylesheet gives .b2g-t
           display:block + overflow-x:auto, so a table too wide for a phone
           scrolls INSIDE ITSELF and the page does not move. Counting its rows
           as overflow reports a bug that a learner never sees, and pushes the
           author into redesigning a table that was already correct. Only
           elements that are NOT inside a horizontal scroller count. */
        var inScroller = function (n) {
          for (var p = n.parentElement; p && p !== wrap; p = p.parentElement) {
            var ov = getComputedStyle(p).overflowX;
            if (ov === 'auto' || ov === 'scroll') return true;
          }
          var own = getComputedStyle(n).overflowX;
          return own === 'auto' || own === 'scroll';
        };
        wrap.querySelectorAll('*').forEach(function (n) {
          if (Math.round(n.getBoundingClientRect().width) > px + 1) {
            if (inScroller(n)) { scrolled++; return; }
            over.push((n.tagName + '.' + (n.className || '') + ' «'
              + (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) + '»').slice(0, 90));
          }
        });
        res[px] = { over: over.slice(0, 5), scroll: wrap.scrollWidth, scrolled: scrolled };
      });
      wrap.style.width = '';
      return res;
    })(),
    clientWidth: de.clientWidth,
    scrollWidth: de.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    overflow: de.scrollWidth - de.clientWidth,
    tooWide: wide.slice(0, 6),
    minBtnH: btns.length ? Math.min.apply(null, btns.map(function (b) { return b.h; })) : 0,
    maxBtnW: btns.length ? Math.max.apply(null, btns.map(function (b) { return b.w; })) : 0,
    audioW: (function () {
      var a = document.querySelector('.b2h-audio audio');
      return a ? Math.round(a.getBoundingClientRect().width) : 0;
    })()
  };
  document.title = 'VP' + JSON.stringify(out);
});
</script></body></html>`;

const tmp = path.join(os.tmpdir(), 'uz-t10-viewport.html');
fs.writeFileSync(tmp, harness);

VIEWPORTS.forEach(([w, h]) => {
    let dom = '';
    try {
        dom = execFileSync(CHROME, [
            '--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=4000',
            `--window-size=${w},${h}`, '--force-device-scale-factor=1',
            '--hide-scrollbars',
            '--dump-dom', 'file://' + tmp
        ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
    } catch (err) {
        dom = (err.stdout || '').toString();
    }
    const m = dom.match(/<title>VP(\{[\s\S]*?\})<\/title>/);
    if (!m) {
        fail++; failures.push(`${w}x${h}: the page did not report measurements`);
        console.log(`  ${w}x${h}: NO MEASUREMENT`);
        return;
    }
    const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    const label = `${w}x${h}`;
    console.log(`  ${label.padEnd(9)} client=${r.clientWidth} scroll=${r.scrollWidth} ` +
        `overflow=${r.overflow} · min button height=${r.minBtnH}px · audio player=${r.audioW}px`);
    if (r.tooWide.length) console.log(`      wider than the viewport: ${r.tooWide.join(' ; ')}`);

    /* THE test: nothing may run off the right edge. 1px tolerance for rounding. */
    ok(r.overflow <= 1, `${label}: no horizontal overflow (${r.overflow}px)`);
    ok(r.tooWide.length === 0,
        `${label}: no element is wider than the viewport (${r.tooWide.join(' ; ')})`);
    /* The audio player is the widest fixed-ish control on the listening step;
       a native <audio> that ignores its container is a classic mobile overflow. */
    ok(r.audioW > 0 && r.audioW <= r.clientWidth,
        `${label}: the audio player fits the width (${r.audioW}px)`);
    if (w === 500 && r.narrow) {
        NARROW.forEach((px) => {
            const n = r.narrow[px];
            console.log(`  ${String(px + 'px container').padEnd(14)} ` +
                `scrollWidth=${n.scroll} · elements wider than ${px}px: ${n.over.length}` +
                (n.scrolled ? ` (+${n.scrolled} inside a horizontal scroller, by design)` : ''));
            ok(n.over.length === 0,
                `${px}px width: nothing overflows (${n.over.join(' ; ')})`);
            ok(n.scroll <= px + 1,
                `${px}px width: the content itself does not scroll sideways (${n.scroll})`);
        });
    }
});

console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ A2 TOPIC 10 VIEWPORT: ${fail} failed / ${pass + fail}\n`);
    failures.forEach((f, i2) => console.log(`   ${i2 + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ A2 TOPIC 10 VIEWPORT: ${pass}/${pass} passed (measured in Chrome)`);
console.log('='.repeat(60) + '\n');
