#!/usr/bin/env node
/**
 * verify_a2_topic16_viewport.cjs — Topic 16 must fit a phone, measured by a real
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
const { JSDOM, VirtualConsole } = require('jsdom');

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

console.log('\n=== A2 TOPIC 16 · VIEWPORT ===');
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
const t6 = vm.runInNewContext('(' + S.slice(j, e + 1) + ')', {}).topics.find((t) => t.id === 16);
const groups = t6.topic16Exercises.exercises;

/* ---------------------------------------------------------------------------
 * THE COMPONENTS' OWN STYLESHEETS AND THE COMPONENTS' OWN MARKUP.
 *
 * Both course-exercise-ui.js and sentence-builder.js build their CSS at runtime
 * and inject it into document.head. An earlier version of this suite lifted the
 * array literal out of the SOURCE instead, which worked for the exercise UI but
 * silently produced NOTHING for the builder — its fragments are assigned to
 * st.textContent inside injectStyles(), not to a named variable.
 *
 * Worse, the stub `document` that lift relied on also stopped the builder from
 * rendering AT ALL: renderGroup emitted ex9's prompts with empty answer cells,
 * so the page Chrome measured had no word cards on it. The suite was green
 * about geometry that was never on the page.
 *
 * Both modules are therefore executed in a REAL DOM now. The stylesheets are
 * read back out of document.head exactly as the product injected them, and the
 * markup is whatever the product actually renders — builder included.
 * ------------------------------------------------------------------------ */
const UI = fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8');
const sessionSrc = fs.readFileSync(path.join(ROOT, 'exercise-session.js'), 'utf8');
const builderSrc = fs.readFileSync(path.join(ROOT, 'sentence-builder.js'), 'utf8');

/* exercise-session.js only injects its CSS when a session is actually opened,
   which needs the whole course page. Its stylesheet IS a named array literal,
   so it is still lifted from source; the two that matter here are not. */
function cssLiteral(src, anchor) {
    const at = src.indexOf(anchor);
    if (at < 0) return '';
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

const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
const jw = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://uzdarus.uz/paid-courses/a2-course.html',
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc
}).window;
jw.eval(builderSrc);
jw.eval(UI);
/* renderGroup styles itself lazily through the host; the builder injects on its
   first renderItem. Call the exercise UI's own exported injector so BOTH
   stylesheets are in this head before they are read back. */
jw.UzExerciseUI.injectStyles();
const renderGroup = jw.UzExerciseUI.renderGroup;

/* Render every step with the product's own renderer, in that real DOM. This is
   also what triggers the builder's injectStyles(). */
const stepsHtml = groups.map((g, n) =>
    `<section class="vp-step" data-step="${n}" data-id="${g.id}">${renderGroup(g)}</section>`).join('');

/* Now read the stylesheets back out of the head the components wrote them to. */
const styleText = (id) => {
    const el = jw.document.getElementById(id);
    return el ? el.textContent : '';
};
const builderCss = styleText('uz-builder-styles');
const uiCss = styleText('b2h-styles');
const sessionCss = cssLiteral(sessionSrc, '.uz-step{');
const componentCss = uiCss + builderCss + sessionCss;

/* ---- THESE ARE ASSERTIONS, NOT WARNINGS ----
   If the builder stylesheet or the builder markup is missing, every number this
   suite prints about word cards is meaningless. It must fail, not shrug. */
ok(builderCss.length > 0, 'the builder stylesheet was extracted from the real component');
['.uzb{', '.uzb-out{', '.uzb-bank{', '.uzb-tok{'].forEach((rule) =>
    ok(builderCss.includes(rule),
        `the extracted builder stylesheet defines ${rule.slice(0, -1)}`));
ok(uiCss.length > 0, 'the exercise-UI stylesheet was extracted from the real component');
ok(/\.b2h-howto\b/.test(uiCss), 'and it defines .b2h-howto');
ok(/\.uz-btn\b/.test(sessionCss), 'the session stylesheet still lifts (.uz-btn present)');
/* The production touch target lives in the component's own constants. Reading
   it here means the suite tracks the product rather than a number invented in
   a test: TOKEN_MIN_HEIGHT 46px, TOKEN_MIN_HEIGHT_SM 44px on narrow screens. */
const TOKEN_MIN = jw.UzSentenceBuilder.CONST.TOKEN_MIN_HEIGHT;
const TOKEN_MIN_SM = jw.UzSentenceBuilder.CONST.TOKEN_MIN_HEIGHT_SM;
ok(TOKEN_MIN >= 44 && TOKEN_MIN_SM >= 44,
    `the builder's own minimum card height already clears 44px (${TOKEN_MIN}/${TOKEN_MIN_SM})`);

/* ---- and the markup really contains the builder ---- */
ok(/class="uzb"/.test(stepsHtml), 'ex9 rendered the real word-card builder');
['uzb-out', 'uzb-bank', 'uzb-tok', 'uzb-label'].forEach((cls) =>
    ok(stepsHtml.includes(cls), `the rendered builder markup contains .${cls}`));
let EXPECTED_CARDS = 0;
{
    /* one card per cue word, for every one of the ten items */
    const ex9 = groups.find((g) => g.id === 'ex9');
    const html = renderGroup(ex9);
    EXPECTED_CARDS = ex9.items.reduce((n, it) => n + it.q.split('/').length, 0);
    const got = (html.match(/class="uzb-tok"/g) || []).length;
    ok(got === EXPECTED_CARDS,
        `ex9 renders one card per cue word (${got} of ${EXPECTED_CARDS})`);
    /* This lesson glues six multi-word cues. Each must stay ONE card — they are
       also the widest cards in the lesson, so they are what would overflow. */
    /* The builder keeps each card's ORIGINAL casing from the accepted sentence,
       so a glue phrase that opens a sentence renders capitalised («У нас»).
       Match case-insensitively — the point is that it is ONE card, not two. */
    ['для меня', 'у нас', 'в нашей', 'много еды', 'о культуре', 'всей семьёй']
        .forEach((g) => {
            const re = new RegExp('>' + g.replace(/ /g, '\\s') + '<', 'i');
            ok(re.test(html),
                `«${g}» is rendered as a single glued card, as the source cue writes it`);
        });
}
console.log(`  builder CSS ${builderCss.length}b · UI CSS ${uiCss.length}b `
    + `· session CSS ${sessionCss.length}b · cards `
    + `${(stepsHtml.match(/class="uzb-tok"/g) || []).length}`);

/* Chrome will not open a window narrower than ~500 CSS px, so a true 360px
   VIEWPORT cannot be produced this way. Two complementary measurements are
   taken instead, and reported for what each actually proves:
     - window widths Chrome does honour, which exercise real viewport layout;
     - a 360 / 390 px CONTAINER, which proves no element overflows that width.
   A media-query-accurate 360px viewport needs CDP device emulation; that is a
   browser-automation dependency this suite does not add. */
/* Four REAL browser viewports — Chrome opens a window at each of these and the
   page lays itself out for that width, media queries included. The narrow pair
   below is a different, weaker measurement and is labelled as such. */
const VIEWPORTS = [[1280, 900], [1024, 800], [768, 900], [500, 800]];
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
    audioParentW: (function () {
        var a = document.querySelector('audio');
        return a && a.parentElement
            ? Math.round(a.parentElement.getBoundingClientRect().width) : 0;
    })(),
    audioW: (function () {
      var a = document.querySelector('.b2h-audio audio');
      return a ? Math.round(a.getBoundingClientRect().width) : 0;
    })(),
    /* ---- the word-card builder, ex9 ---- */
    builder: (function () {
      var de = document.documentElement;
      var wraps = [].slice.call(document.querySelectorAll('.uzb'));
      var toks = [].slice.call(document.querySelectorAll('.uzb-tok'));
      if (!wraps.length || !toks.length) return null;
      var wide = function (sel) {
        return [].slice.call(document.querySelectorAll(sel)).map(function (n) {
          return Math.round(n.getBoundingClientRect().width);
        });
      };
      var overParent = 0;
      [].slice.call(document.querySelectorAll('.uzb-out, .uzb-bank')).forEach(function (n) {
        var p = n.parentElement;
        if (p && n.getBoundingClientRect().width > p.getBoundingClientRect().width + 1) overParent++;
      });
      var rects = toks.map(function (t) { return t.getBoundingClientRect(); });
      var widest = toks[0], wmax = 0;
      rects.forEach(function (r, i) { if (r.width > wmax) { wmax = r.width; widest = toks[i]; } });
      return {
        wraps: wraps.length,
        tokens: toks.length,
        maxWrapW: Math.max.apply(null, wide('.uzb')),
        maxOutW: Math.max.apply(null, wide('.uzb-out')),
        maxBankW: Math.max.apply(null, wide('.uzb-bank')),
        outOverParent: overParent,
        maxTokRight: Math.round(Math.max.apply(null, rects.map(function (r) { return r.right; }))),
        minTokLeft: Math.round(Math.min.apply(null, rects.map(function (r) { return r.left; }))),
        maxTokW: Math.round(wmax),
        widestTokText: (widest.textContent || '').trim().slice(0, 30),
        minTokH: Math.round(Math.min.apply(null, rects.map(function (r) { return r.height; }))),
        outsideViewport: rects.filter(function (r) {
          return r.left < -1 || r.right > de.clientWidth + 1;
        }).length,
        gluedW: (function () {
          var g = toks.filter(function (t) { return (t.textContent || '').trim() === 'всей семьёй'; });
          return g.length ? Math.round(g[0].getBoundingClientRect().width) : 0;
        })(),
        gluedCards: toks.filter(function (t) {
          return (t.textContent || '').trim() === 'всей семьёй';
        }).length
      };
    })()
  };
  document.title = 'VP' + JSON.stringify(out);
});
</script></body></html>`;

const tmp = path.join(os.tmpdir(), 'uz-t16-viewport.html');
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
        `overflow=${r.overflow} · min button height=${r.minBtnH}px · audio ${r.audioW}px in ${r.audioParentW}px`);
    if (r.tooWide.length) console.log(`      wider than the viewport: ${r.tooWide.join(' ; ')}`);

    /* THE test: nothing may run off the right edge. 1px tolerance for rounding. */
    ok(r.overflow <= 1, `${label}: no horizontal overflow (${r.overflow}px)`);
    ok(r.tooWide.length === 0,
        `${label}: no element is wider than the viewport (${r.tooWide.join(' ; ')})`);
    /* The audio player is the widest fixed-ish control on the listening step;
       a native <audio> that ignores its container is a classic mobile overflow. */
    ok(r.audioW > 0 && r.audioW <= r.clientWidth,
        `${label}: the audio player fits the viewport (${r.audioW}px)`);
    ok(r.audioParentW > 0 && r.audioW <= r.audioParentW + 1,
        `${label}: the audio player fits its container (${r.audioW} <= ${r.audioParentW})`);
    /* Every tappable control must clear the 44px touch target. This lesson's
       densest grid is ex7: three full-sentence chips on each of ten rows, plus
       the builder's word cards. */
    ok(r.minBtnH >= 44,
        `${label}: every button and chip clears a 44px touch target (${r.minBtnH}px)`);

    /* ---- THE WORD-CARD BUILDER (ex9) ---- */
    const b = r.builder;
    ok(!!b, `${label}: the builder is on the measured page`);
    if (b) {
        console.log(`      builder: ${b.wraps} wraps · ${b.tokens} cards · wrap<=${b.maxWrapW} `
            + `out<=${b.maxOutW} bank<=${b.maxBankW} · card h>=${b.minTokH} `
            + `· widest ${b.maxTokW}px «${b.widestTokText}» · right edge ${b.maxTokRight}`);
        eq(`${label}: all ten builder rows rendered`, b.wraps, 10);
        eq(`${label}: every word card rendered`, b.tokens, EXPECTED_CARDS);
        ok(b.maxWrapW <= r.clientWidth + 1,
            `${label}: the builder wrapper fits the viewport (${b.maxWrapW} <= ${r.clientWidth})`);
        ok(b.maxOutW <= b.maxWrapW + 1,
            `${label}: the answer area fits its wrapper (${b.maxOutW} <= ${b.maxWrapW})`);
        ok(b.maxBankW <= b.maxWrapW + 1,
            `${label}: the card bank fits its wrapper (${b.maxBankW} <= ${b.maxWrapW})`);
        eq(`${label}: no builder area is wider than its own parent`, b.outOverParent, 0);
        eq(`${label}: no word card falls outside the viewport`, b.outsideViewport, 0);
        ok(b.minTokLeft >= -1,
            `${label}: no word card starts left of the viewport (${b.minTokLeft})`);
        ok(b.maxTokRight <= r.clientWidth + 1,
            `${label}: no word card runs past the right edge (${b.maxTokRight} <= ${r.clientWidth})`);
        /* The card is the tap target. The component's own constants promise
           46px, 44px on narrow screens — this measures whether it delivers. */
        ok(b.minTokH >= 44,
            `${label}: every word card clears a 44px touch target (${b.minTokH}px)`);
        /* The glued multi-word cards are the widest in the lesson, so they are
           what would overflow a phone first. */
        eq(`${label}: «всей семьёй» stays a single glued card`, b.gluedCards, 1);
        ok(b.gluedW > 0 && b.gluedW <= r.clientWidth,
            `${label}: the glued «всей семьёй» card fits (${b.gluedW}px)`);
    }
    /* The window Chrome actually opened must be the one asked for, or the
       measurement is about some other width. */
    ok(Math.abs(r.clientWidth - w) <= 20,
        `${label}: Chrome really opened this viewport (clientWidth=${r.clientWidth})`);
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
    console.log(`  ❌ A2 TOPIC 16 VIEWPORT: ${fail} failed / ${pass + fail}\n`);
    failures.forEach((f, i2) => console.log(`   ${i2 + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ A2 TOPIC 16 VIEWPORT: ${pass}/${pass} passed (measured in Chrome)`);
console.log('='.repeat(60) + '\n');
