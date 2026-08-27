#!/usr/bin/env node
/**
 * verify_b2_topic13_viewport.cjs — Topic 13 must fit a phone, measured by a real
 * browser.
 *
 * jsdom has no layout engine, so verify_b2_layout.cjs can only make claims
 * about CSS SOURCE. This renders the ACTUAL Topic 12 markup with the ACTUAL
 * stylesheets in headless Chrome and reads back real geometry.
 *
 * What this lesson puts under pressure:
 *   - twenty-one two-column grammar tables carrying long Russian sentences,
 *   - the tip and warning cards with their 52px icon gutters,
 *   - NINETY writing inputs across nine groups, most taking a full phrase,
 *   - Ex6's bracketed register cues and Ex10's two-line prompts,
 *   - the twenty Правда/Ложь chips,
 *   - the native <audio> player.
 * There is no card builder in this lesson, so none is measured.
 *
 * Chrome is used through --dump-dom, so no browser-automation dependency is
 * added. If Chrome is absent the suite says so and skips rather than pretending
 * to have measured.
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

console.log('\n=== B2 TOPIC 13 · VIEWPORT ===');
if (!CHROME) {
    console.log('  ⚠ Chrome not found — real viewport measurement SKIPPED');
    console.log('='.repeat(60) + '\n');
    process.exit(0);
}

/* ---- the real page stylesheet ---- */
const PAGE = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-course.html'), 'utf8');
const pageCss = PAGE.slice(PAGE.indexOf('<style>') + 7, PAGE.indexOf('</style>'));

/* ---- the real components, executed in a real DOM so their runtime-built
   stylesheet can be read back out of the head exactly as shipped ---- */
const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
const jw = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://uzdarus.uz/paid-courses/b2-course.html',
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc
}).window;
['shared-normalizer.js', 'sentence-builder.js', 'course-exercise-ui.js', 'b2-lesson-data.js']
    .forEach((f) => jw.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
jw.UzExerciseUI.injectStyles();

const t13 = jw.B2_LESSON_DATA.topics.find((t) => t.id === 13);
ok(!!t13, 'topic 13 lesson data loaded');
if (!t13) { console.log('missing lesson 13'); process.exit(1); }
const groups = t13.exercises;

const uiCss = (jw.document.getElementById('b2h-styles') || { textContent: '' }).textContent;
ok(uiCss.length > 0, 'the exercise-UI stylesheet was extracted from the real component');
['.b2h-item', '.b2h-opt', '.b2h-input', '.b2h-audio'].forEach((rule) =>
    ok(uiCss.includes(rule), `the extracted stylesheet defines ${rule}`));
ok(/\.b2g-t\b/.test(uiCss), 'the measured CSS styles the grammar tables (.b2g-t)');
ok(/\.b2g-chips\b/.test(uiCss), 'the measured CSS styles the chip row this lesson uses');

/* exercise-session.js injects its CSS only when a session is opened, which needs
   the whole course page. Its stylesheet IS a named array literal, so it is
   lifted from source. .uz-btn lives ONLY there: omitting it would measure
   unstyled ~20px buttons and report a product bug that does not exist. */
const sessionSrc = fs.readFileSync(path.join(ROOT, 'exercise-session.js'), 'utf8');
function cssLiteral(src, anchor) {
    const at = src.indexOf(anchor);
    if (at < 0) return '';
    const end = src.indexOf('].join(', at);
    if (end < 0) return '';
    const start = src.lastIndexOf('= [', at);
    if (start < 0 || start > at) return '';
    try {
        const parts = vm.runInNewContext('(' + src.slice(start + 2, end + 1) + ')', {});
        return Array.isArray(parts) ? parts.join('') : '';
    } catch (err) { return ''; }
}
const sessionCss = cssLiteral(sessionSrc, '.uz-step{');
ok(/\.uz-btn\{/.test(sessionCss), 'the session stylesheet lifts (.uz-btn present)');

const renderGroup = jw.UzExerciseUI.renderGroup;
const stepsHtml = groups.map((g, n) =>
    `<section class="vp-step" data-step="${n}" data-id="${g.id}">${renderGroup(g)}</section>`).join('');

/* the markup really contains what this lesson is made of. `class="b2h-opt"` is
   matched with its closing quote: the prefix alone also matches the
   .b2h-opts / .b2h-opts-tf CONTAINERS and would over-count by one per item. */
const CHIPS = (stepsHtml.match(/class="b2h-opt"/g) || []).length;
const INPUTS = (stepsHtml.match(/class="b2h-input"/g) || []).length;
eq('every option chip rendered (ex5 3×10 + audio 2×10)', CHIPS, 50);
eq('all ninety writing inputs rendered (nine input groups)', INPUTS, 90);
eq('the audio player rendered exactly once', (stepsHtml.match(/<audio/g) || []).length, 1);
{
    /* the player renders <audio><source src="../audios/…"> — the ../ is the
       real page-relative path from paid-courses/ */
    const src = (stepsHtml.match(/<source[^>]*src="([^"]+)"/) || [])[1] || '';
    ok(!!src, 'the rendered audio element carries a source src');
    eq('the rendered src decodes to the topic 13 recording',
        decodeURIComponent(src).replace(/^\.\.\//, ''), 'audios/Б2 13 урок.mp3');
    eq('exactly one <source> element', (stepsHtml.match(/<source/g) || []).length, 1);
    ok(/<audio controls/.test(stepsHtml), 'the audio player exposes native controls');
    ok(/type="audio\/mpeg"/.test(stepsHtml), 'the source declares the mp3 mime type');
}
eq('no word-card builder in this lesson', (stepsHtml.match(/class="uzb"/g) || []).length, 0);
/* the widest single prompt in the lesson — if anything overflows, it is this */
const LONGEST = groups.flatMap((g) => g.items.map((i) => i.q))
    .reduce((a, b) => (b.length > a.length ? b : a), '');
ok(LONGEST.length > 70, `the longest prompt is genuinely long (${LONGEST.length} chars)`);
console.log(`  UI CSS ${uiCss.length}b · page CSS ${pageCss.length}b · session CSS ${sessionCss.length}b`
    + ` · chips ${CHIPS} · inputs ${INPUTS} · tables ${(t13.grammar.match(/class="b2g-t"/g) || []).length}`
    + ` · longest prompt ${LONGEST.length} chars`);

/* Chrome will not open a window narrower than ~500 CSS px, so a true 360px
   VIEWPORT cannot be produced this way. Two complementary measurements are
   taken and each is reported for what it actually proves:
     - window widths Chrome does honour, which exercise real viewport layout;
     - a 360 / 390 px CONTAINER, which proves no element overflows that width.
   A media-query-accurate 360px viewport needs CDP device emulation; that is a
   browser-automation dependency this suite does not add. */
const VIEWPORTS = [[1280, 900], [1024, 800], [768, 900], [500, 800]];
const NARROW = [360, 390];

const harness = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${pageCss}</style><style>${uiCss}${sessionCss}</style>
<style>body{margin:0}.vp-wrap{padding:12px}.uz-foot{display:flex;gap:8px;padding:10px}</style>
</head><body><div class="vp-wrap" id="vpWrap">
<div class="vp-grammar">${t13.grammar}</div>
${stepsHtml}
<div class="uz-foot">
  <button class="uz-btn uz-btn-primary">Javoblarni tekshirish</button>
  <button class="uz-btn uz-btn-primary">Keyingi mashq</button>
</div>
</div>
<script>
window.addEventListener('load', function () {
  var de = document.documentElement;
  var wrap = document.getElementById('vpWrap');
  /* A wide table is NOT an overflow: below the shared breakpoint .b2g-t becomes
     display:block + overflow-x:auto, so a table too wide for a phone scrolls
     INSIDE ITSELF and the page does not move. Counting its rows as overflow
     reports a bug no learner ever sees. */
  var inScroller = function (n, root) {
    for (var p = n.parentElement; p && p !== root; p = p.parentElement) {
      var ov = getComputedStyle(p).overflowX;
      if (ov === 'auto' || ov === 'scroll') return true;
    }
    var own = getComputedStyle(n).overflowX;
    return own === 'auto' || own === 'scroll';
  };
  var wide = [], scrolledTop = 0;
  wrap.querySelectorAll('*').forEach(function (n) {
    if (n.getBoundingClientRect().width > de.clientWidth + 1) {
      if (inScroller(n, wrap)) { scrolledTop++; return; }
      wide.push((n.tagName + '.' + (n.className || '')).slice(0, 60) + ' = '
        + Math.round(n.getBoundingClientRect().width));
    }
  });
  var rectsOf = function (sel) {
    return [].map.call(document.querySelectorAll(sel), function (n) {
      var r = n.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height),
               l: Math.round(r.left), r: Math.round(r.right) };
    });
  };
  var min = function (a, k) { return a.length ? Math.min.apply(null, a.map(function (x) { return x[k]; })) : 0; };
  var max = function (a, k) { return a.length ? Math.max.apply(null, a.map(function (x) { return x[k]; })) : 0; };
  var chips = rectsOf('.b2h-opt');
  var inputs = rectsOf('.b2h-input');
  var btns = rectsOf('.uz-btn');
  var tables = [].map.call(document.querySelectorAll('table.b2g-t'), function (n) {
    var r = n.getBoundingClientRect();
    return { w: Math.round(r.width), ov: getComputedStyle(n).overflowX };
  });
  /* the tip / warning cards carry a 52px icon gutter — the classic place for
     text to be pushed past the right edge on a phone */
  var cards = rectsOf('.b2g-tip, .b2g-warn');
  /* the longest open prompt: does the text itself stay inside the viewport? */
  var longest = (function () {
    var best = null, bl = 0;
    [].slice.call(document.querySelectorAll('.b2h-text')).forEach(function (n) {
      var t = (n.textContent || '').trim();
      if (t.length > bl) { bl = t.length; best = n; }
    });
    if (!best) return null;
    var r = best.getBoundingClientRect();
    return { len: bl, w: Math.round(r.width), r: Math.round(r.right),
             sw: best.scrollWidth };
  })();
  var out = {
    narrow: (function () {
      var res = {};
      [360, 390].forEach(function (px) {
        wrap.style.width = px + 'px';
        var over = [], scrolled = 0;
        wrap.querySelectorAll('*').forEach(function (n) {
          if (Math.round(n.getBoundingClientRect().width) > px + 1) {
            if (inScroller(n, wrap)) { scrolled++; return; }
            over.push((n.tagName + '.' + (n.className || '') + ' «'
              + (n.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40) + '»').slice(0, 90));
          }
        });
        var nChips = [].map.call(document.querySelectorAll('.b2h-opt'), function (n) {
          return Math.round(n.getBoundingClientRect().height); });
        var nIn = [].map.call(document.querySelectorAll('.b2h-input'), function (n) {
          return Math.round(n.getBoundingClientRect().width); });
        res[px] = { over: over.slice(0, 5), scroll: wrap.scrollWidth, scrolled: scrolled,
                    minChipH: nChips.length ? Math.min.apply(null, nChips) : 0,
                    minInputW: nIn.length ? Math.min.apply(null, nIn) : 0 };
      });
      wrap.style.width = '';
      return res;
    })(),
    clientWidth: de.clientWidth,
    scrollWidth: de.scrollWidth,
    overflow: de.scrollWidth - de.clientWidth,
    tooWide: wide.slice(0, 6),
    scrolledTop: scrolledTop,
    chips: chips.length, minChipH: min(chips, 'h'),
    maxChipRight: max(chips, 'r'), minChipLeft: min(chips, 'l'),
    inputs: inputs.length, minInputH: min(inputs, 'h'), minInputW: min(inputs, 'w'),
    maxInputW: max(inputs, 'w'), maxInputRight: max(inputs, 'r'),
    minBtnH: min(btns, 'h'),
    tables: tables.length,
    tablesScrollable: tables.filter(function (t) { return t.ov === 'auto' || t.ov === 'scroll'; }).length,
    tablesOverViewport: tables.filter(function (t) { return t.w > de.clientWidth + 1; }).length,
    cards: cards.length, maxCardRight: max(cards, 'r'), maxCardW: max(cards, 'w'),
    audioW: (function () {
      var a = document.querySelector('.b2h-audio audio');
      return a ? Math.round(a.getBoundingClientRect().width) : 0;
    })(),
    audioParentW: (function () {
      var a = document.querySelector('.b2h-audio audio');
      return a && a.parentElement
        ? Math.round(a.parentElement.getBoundingClientRect().width) : 0;
    })(),
    longest: longest
  };
  document.title = 'VP' + JSON.stringify(out);
});
</script></body></html>`;

const tmp = path.join(os.tmpdir(), 'uz-b2t12-viewport.html');
fs.writeFileSync(tmp, harness);

VIEWPORTS.forEach(([w, h]) => {
    let dom = '';
    try {
        dom = execFileSync(CHROME, [
            '--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=4000',
            `--window-size=${w},${h}`, '--force-device-scale-factor=1', '--hide-scrollbars',
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
    console.log(`  ${label.padEnd(9)} client=${r.clientWidth} scroll=${r.scrollWidth} `
        + `overflow=${r.overflow} · chip h>=${r.minChipH} · inputs ${r.minInputW}-${r.maxInputW}px `
        + `· audio ${r.audioW}px in ${r.audioParentW}px · tables ${r.tables} (${r.tablesScrollable} scrollable, `
        + `${r.tablesOverViewport} wider than viewport) · tip/warn cards ${r.cards}`
        + (r.longest ? ` · longest prompt ${r.longest.len}ch in ${r.longest.w}px` : ''));
    if (r.tooWide.length) console.log(`      wider than the viewport: ${r.tooWide.join(' ; ')}`);

    /* THE test: nothing may run off the right edge. 1px tolerance for rounding. */
    ok(r.overflow <= 1, `${label}: no horizontal overflow (${r.overflow}px)`);
    ok(r.tooWide.length === 0,
        `${label}: no element is wider than the viewport (${r.tooWide.join(' ; ')})`);

    /* grammar tables */
    eq(`${label}: all twelve grammar tables rendered`, r.tables, 12);
    eq(`${label}: no grammar table is wider than the viewport`, r.tablesOverViewport, 0);
    /* The scroller rule is a @media(max-width:640px) rule: on a phone the table
       scrolls inside itself so the PAGE never moves. Above 640px the tables are
       ordinary width:100% tables. Both directions are asserted, so neither the
       rule nor its breakpoint can vanish silently. */
    if (w <= 640) {
        eq(`${label}: every grammar table is its own horizontal scroller`,
            r.tablesScrollable, r.tables);
    } else {
        eq(`${label}: grammar tables are plain full-width tables above 640px`,
            r.tablesScrollable, 0);
    }

    /* tip / warning cards — the 52px icon gutter must not push text off screen */
    eq(`${label}: all eleven tip/warning cards rendered`, r.cards, 11);
    ok(r.maxCardRight <= r.clientWidth + 1,
        `${label}: no tip/warning card runs past the right edge (${r.maxCardRight} <= ${r.clientWidth})`);

    /* Правда / Ложь chips */
    eq(`${label}: every option chip rendered`, r.chips, 50);
    ok(r.minChipH >= 44, `${label}: every chip clears a 44px touch target (${r.minChipH}px)`);
    ok(r.maxChipRight <= r.clientWidth + 1,
        `${label}: no chip runs past the right edge (${r.maxChipRight} <= ${r.clientWidth})`);
    ok(r.minChipLeft >= -1, `${label}: no chip starts left of the viewport (${r.minChipLeft})`);

    /* seventy writing inputs — forty of them take a whole sentence */
    eq(`${label}: all ninety writing inputs rendered`, r.inputs, 90);
    ok(r.minInputH >= 40, `${label}: every input is tappable (${r.minInputH}px tall)`);
    ok(r.maxInputRight <= r.clientWidth + 1,
        `${label}: no input runs past the right edge (${r.maxInputRight} <= ${r.clientWidth})`);
    ok(r.minInputW >= 120,
        `${label}: even the narrowest input has room for a sentence (${r.minInputW}px)`);

    /* the longest open prompt must wrap, not overflow */
    ok(!!r.longest, `${label}: the longest prompt is on the measured page`);
    if (r.longest) {
        ok(r.longest.r <= r.clientWidth + 1,
            `${label}: the longest prompt stays on screen (right edge ${r.longest.r})`);
        ok(r.longest.sw <= r.longest.w + 1,
            `${label}: the longest prompt wraps instead of scrolling (${r.longest.sw} <= ${r.longest.w})`);
    }

    /* the native audio player is a classic mobile overflow */
    ok(r.audioW > 0 && r.audioW <= r.clientWidth,
        `${label}: the audio player fits the viewport (${r.audioW}px)`);
    ok(r.audioParentW > 0 && r.audioW <= r.audioParentW + 1,
        `${label}: the audio player fits its container (${r.audioW} <= ${r.audioParentW})`);

    ok(r.minBtnH >= 44, `${label}: every action button clears a 44px touch target (${r.minBtnH}px)`);

    /* The window Chrome actually opened must be the one asked for, or the
       measurement is about some other width. */
    ok(Math.abs(r.clientWidth - w) <= 20,
        `${label}: Chrome really opened this viewport (clientWidth=${r.clientWidth})`);

    if (w === 500 && r.narrow) {
        NARROW.forEach((px) => {
            const n = r.narrow[px];
            console.log(`  ${String(px + 'px container').padEnd(14)} `
                + `scrollWidth=${n.scroll} · elements wider than ${px}px: ${n.over.length}`
                + (n.scrolled ? ` (+${n.scrolled} inside a horizontal scroller, by design)` : '')
                + ` · chip h>=${n.minChipH} · narrowest input ${n.minInputW}px`);
            ok(n.over.length === 0, `${px}px width: nothing overflows (${n.over.join(' ; ')})`);
            ok(n.scroll <= px + 1,
                `${px}px width: the content itself does not scroll sideways (${n.scroll})`);
            ok(n.minChipH >= 44, `${px}px width: chips still clear 44px (${n.minChipH}px)`);
            ok(n.minInputW >= 100,
                `${px}px width: inputs still have room to write in (${n.minInputW}px)`);
        });
    }
});

console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ B2 TOPIC 13 VIEWPORT: ${fail} failed / ${pass + fail}\n`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ B2 TOPIC 13 VIEWPORT: ${pass}/${pass} passed (measured in Chrome)`);
console.log('='.repeat(60) + '\n');
