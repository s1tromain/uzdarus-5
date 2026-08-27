#!/usr/bin/env node
/**
 * verify_a1_exercise_viewport.cjs — the A1 exercise section on real screens.
 *
 * A1 now has faces that never existed when the other viewport suites were
 * written: a finished-topic panel, a "saved but not acknowledged" sync prompt,
 * a save-error retry, and a full read-only review that prints every question,
 * the learner's own answer and the canonical one. Those are the widest things
 * on the page — a long Russian sentence next to a long Russian answer — and
 * they are exactly where a phone starts scrolling sideways.
 *
 * NOTHING HERE IS MOCK MARKUP. Every fragment measured below is produced by
 * running the shipped code: the real session is opened, really answered wrong
 * to reach the retry verdict, really given a stale draft to raise the resume
 * dialog, and the real page functions render the panels and the review. The
 * DOM those produce is then measured in Chrome under the real stylesheets.
 *
 * ON THE TWO NARROWEST WIDTHS: Chrome will not open a window below ~500 CSS
 * px, so 390 and 360 cannot be true viewports here. They are measured as
 * fixed-width CONTAINERS instead, which proves no element exceeds that width —
 * and each is reported for what it actually is. A media-query-accurate 360px
 * viewport needs CDP device emulation, a browser-automation dependency this
 * repository deliberately does not carry.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

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

console.log('\n=== A1 EXERCISE SECTION · VIEWPORT ===');
if (!CHROME) {
    console.log('  ⚠ Chrome not found — real viewport measurement SKIPPED');
    console.log('='.repeat(60) + '\n');
    process.exit(0);
}

const H = require('./_a1_page_harness.cjs');
const PAGE = H.PAGE;

/* ---- the page's own stylesheet, biggest <style> block ---- */
function pageCss() {
    let best = '', i = -1;
    while ((i = PAGE.indexOf('<style', i + 1)) > 0) {
        const s = PAGE.indexOf('>', i) + 1, e = PAGE.indexOf('</style>', s);
        if (e - s > best.length) best = PAGE.slice(s, e);
    }
    return best;
}

/* ================================================================ *
 * CAPTURE — every fragment below is produced by running the shipped code
 * ================================================================ */
const TOPICS = [3, 5, 8, 12];
const captured = {};
let uiCss = '', sessionCss = '';

function newCtx(extra) { return H.makePage(extra || {}); }
function groupsOf(ctx, id) {
    return ctx.window.A1Host.groupsOf(ctx.courseData.topics.find((t) => t.id === id));
}
/** Open the real session modal for a topic and hand back its window. */
function openSession(ctx, id) {
    ctx.mountA1Practice(id);
    const btn = ctx.quizSection.querySelector('.uz-practice-btn');
    if (!btn) return null;
    btn.click();
    return ctx.window.document.querySelector('.uz-modal');
}

TOPICS.forEach((id) => {
    const states = {};

    /* --- the session, step 1: the ordinary case --- */
    {
        const ctx = newCtx();
        ctx.window.UzExerciseUI.injectStyles();
        const modal = openSession(ctx, id);
        ok(!!modal, `T${id}: the real session modal opened`);
        if (modal) states.normal = modal.outerHTML;
        if (!uiCss) {
            const st = ctx.window.document.getElementById('b2h-styles')
                || [...ctx.window.document.querySelectorAll('style')]
                    .find((s) => /b2h-item|b2h-opt/.test(s.textContent));
            uiCss = st ? st.textContent : '';
            const ss = ctx.window.document.getElementById('uz-session-styles');
            sessionCss = ss ? ss.textContent : '';
        }
    }

    /* --- the step holding this topic's LONGEST prompt --- */
    {
        const ctx = newCtx();
        ctx.window.UzExerciseUI.injectStyles();
        const groups = groupsOf(ctx, id);
        let bestG = 0, bestLen = 0;
        groups.forEach((g, gi) => g.items.forEach((it) => {
            const n = String(it.q || '').length;
            if (n > bestLen) { bestLen = n; bestG = gi; }
        }));
        const modal = openSession(ctx, id);
        const d = ctx.window.document;
        for (let k = 0; k < bestG; k++) {
            const nxt = [...d.querySelectorAll('.uz-foot button')]
                .find((b) => /Провер/.test(b.textContent));
            if (!nxt) break;
            /* answer this step correctly so the gate opens onto the next */
            const g = groups[k];
            d.querySelectorAll('.b2h-item').forEach((node, i) => {
                const item = g.items[i]; if (!item) return;
                const want = String(Array.isArray(item.answer) ? item.answer[0] : item.answer);
                const inp = node.querySelector('.b2h-input');
                if (inp) { inp.value = want; return; }
                const hit = [...node.querySelectorAll('.b2h-opt')]
                    .find((o) => o.textContent.trim() === want.trim());
                if (hit) hit.click();
            });
            nxt.click();
            const go = [...d.querySelectorAll('.uz-foot button')]
                .find((b) => /Keyingi|Далее|Следующ/i.test(b.textContent));
            if (go) go.click(); else break;
        }
        states.long = d.querySelector('.uz-modal').outerHTML;
        ok(bestLen > 30, `T${id}: the longest prompt is genuinely long (${bestLen} chars)`);
        states._longLen = bestLen;
    }

    /* --- a CHOICE step and an INPUT step, whichever this topic has --- */
    ['choice', 'input'].forEach((kind) => {
        const ctx = newCtx();
        ctx.window.UzExerciseUI.injectStyles();
        const groups = groupsOf(ctx, id);
        const want = groups.findIndex((g) => kind === 'choice'
            ? g.items.some((i) => Array.isArray(i.options) && i.options.length)
            : g.items.every((i) => !i.options || !i.options.length));
        if (want < 0) return;
        const modal = openSession(ctx, id);
        const d = ctx.window.document;
        for (let k = 0; k < want; k++) {
            const g = groups[k];
            d.querySelectorAll('.b2h-item').forEach((node, i) => {
                const item = g.items[i]; if (!item) return;
                const w = String(Array.isArray(item.answer) ? item.answer[0] : item.answer);
                const inp = node.querySelector('.b2h-input');
                if (inp) { inp.value = w; return; }
                const hit = [...node.querySelectorAll('.b2h-opt')]
                    .find((o) => o.textContent.trim() === w.trim());
                if (hit) hit.click();
            });
            const chk = [...d.querySelectorAll('.uz-foot button')]
                .find((b) => /Провер/.test(b.textContent));
            if (chk) chk.click();
            const go = [...d.querySelectorAll('.uz-foot button')]
                .find((b) => /Keyingi|Далее|Следующ/i.test(b.textContent));
            if (go) go.click(); else break;
        }
        const m = d.querySelector('.uz-modal');
        if (m) states[kind] = m.outerHTML;
    });

    /* --- a FAILED attempt: the sub-80% verdict and Qayta topshirish --- */
    {
        const ctx = newCtx();
        ctx.window.UzExerciseUI.injectStyles();
        openSession(ctx, id);
        const d = ctx.window.document;
        const g0 = groupsOf(ctx, id)[0];
        d.querySelectorAll('.b2h-input').forEach((i) => { i.value = 'ZZZ'; });
        /* CHOOSE THE WRONG ONE ON PURPOSE. Clicking "the first option" is not a
           failing attempt: topic 12 opens with a two-option group, where the
           first chip happens to be right eight times out of ten — 80%, a PASS,
           and the retry state this fragment exists to measure never appears. */
        d.querySelectorAll('.b2h-item').forEach((node, i) => {
            const item = g0.items[i];
            const want = item
                ? String(Array.isArray(item.answer) ? item.answer[0] : item.answer).trim()
                : null;
            const opts = [...node.querySelectorAll('.b2h-opt')];
            const wrong = opts.find((o) => o.textContent.trim() !== want);
            if (wrong) wrong.click(); else if (opts[0]) opts[0].click();
        });
        const chk = [...d.querySelectorAll('.uz-foot button')]
            .find((b) => /Провер/.test(b.textContent));
        if (chk) chk.click();
        const verdict = d.querySelector('.uz-verdict');
        ok(!!verdict, `T${id}: a failing attempt produces a verdict`);
        const retry = [...d.querySelectorAll('.uz-foot button')]
            .find((b) => /Qayta topshirish/.test(b.textContent));
        ok(!!retry, `T${id}: and offers Qayta topshirish`);
        states.failed = d.querySelector('.uz-modal').outerHTML;
    }

    /* --- the resume dialog, raised by a genuine stale draft --- */
    {
        const ctx = newCtx();
        ctx.window.UzExerciseUI.injectStyles();
        const A1 = ctx.window.A1Host;
        const groups = groupsOf(ctx, id);
        ctx.window.localStorage.setItem(A1.draftKey('u-1', id), JSON.stringify({
            v: 1, fingerprint: A1.fingerprint(groups, id), course: 'A1', topicId: id,
            cursor: Math.min(2, groups.length - 1), answers: {}, checked: {}, updatedAt: Date.now()
        }));
        openSession(ctx, id);
        const ask = ctx.window.document.querySelector('.uz-ask');
        ok(!!ask, `T${id}: a stale draft raises the resume dialog`);
        if (ask) states.resume = ask.outerHTML;
    }

    /* --- the page's own panels: save error, done, sync, review --- */
    {
        const ctx = newCtx({ save: async () => false });
        ctx.window.UzExerciseUI.injectStyles();
        const A1 = ctx.window.A1Host;
        const groups = groupsOf(ctx, id);
        const real = A1.mountPractice;
        let onFinish = null;
        A1.mountPractice = (o) => { onFinish = o.onFinish; return real(o); };
        ctx.mountA1Practice(id);
        A1.mountPractice = real;
        const done = onFinish(H.finishedAttempt(groups, 0));
        states._saveErrPending = done;
        states._ctx = ctx;
    }

    captured[id] = states;
});

/* the save-error panel needs its promise settled before it can be read */
(async () => {
for (const id of TOPICS) {
    const states = captured[id];
    await states._saveErrPending;
    states.saveerr = states._ctx.quizSection.innerHTML;
    ok(/a1-save-error/.test(states.saveerr), `T${id}: the save-error panel rendered`);
    delete states._saveErrPending; delete states._ctx;

    /* a finished topic: the CTA panel, the sync panel, and the review */
    const base = newCtx();
    const groups = groupsOf(base, id);
    const snapshot = base.window.A1Host.buildSnapshot(id, groups, H.finishedAttempt(groups, 2));

    const doneCtx = newCtx({ userQuizResults: { ['topic_' + id]: { a1ExerciseResult: snapshot } },
                             courseState: { topicComponents: { [id]: { exercisesCompleted: true } } } });
    doneCtx.window.UzExerciseUI.injectStyles();
    doneCtx.mountA1Practice(id);
    ok(!!doneCtx.button('Javoblarni ko‘rish'), `T${id}: the completed CTA rendered`);
    states.done = doneCtx.quizSection.innerHTML;
    doneCtx.button('Javoblarni ko‘rish').click();
    ok(!!doneCtx.q('.a1-review'), `T${id}: the review rendered`);
    states.review = doneCtx.quizSection.innerHTML;

    const syncCtx = newCtx({ userQuizResults: { ['topic_' + id]: { a1ExerciseResult: snapshot } } });
    syncCtx.mountA1Practice(id);
    ok(!!syncCtx.button('Qayta urinish'), `T${id}: the sync-pending panel rendered`);
    states.sync = syncCtx.quizSection.innerHTML;
}

ok(uiCss.length > 500, `the exercise-UI stylesheet was extracted (${uiCss.length}b)`);
ok(/\.uz-btn\{/.test(sessionCss) || /\.uz-btn\s*\{/.test(sessionCss),
    `the session stylesheet was extracted (${sessionCss.length}b)`);
const CSS = pageCss();
ok(CSS.length > 10000, `the page stylesheet was extracted (${CSS.length}b)`);
['.a1-done-panel', '.a1-review', '.a1-cta', '.a1-sync-warn', '.a1-save-error']
    .forEach((r) => ok(CSS.includes(r), `the measured CSS styles ${r}`));

/* ================================================================ *
 * MEASURE
 * ================================================================ */
const CHROME_WIDTHS = [1280, 1024, 768, 500];
const CONTAINER_WIDTHS = [390, 360];
const STATES = ['normal', 'long', 'choice', 'input', 'failed', 'resume',
                'saveerr', 'done', 'sync', 'review'];
/* controls the learner MUST be able to reach in each state */
const CRITICAL = {
    failed: '.uz-foot button', resume: '.uz-ask-actions button',
    saveerr: '.a1-retry-save', done: '.a1-cta', sync: '.a1-retry-save',
    review: '.a1-review-close', normal: '.uz-foot button',
    long: '.uz-foot button', choice: '.uz-foot button', input: '.uz-foot button'
};

const PROBE = `
window.addEventListener('load', function () {
  var de = document.documentElement, wrap = document.getElementById('vpWrap');
  function inScroller(n, root) {
    for (var p = n.parentElement; p && p !== root; p = p.parentElement) {
      var ov = getComputedStyle(p).overflowX;
      if (ov === 'auto' || ov === 'scroll') return true;
    }
    var own = getComputedStyle(n).overflowX;
    return own === 'auto' || own === 'scroll';
  }
  function overflowing(limit) {
    var out = [];
    wrap.querySelectorAll('*').forEach(function (n) {
      var r = n.getBoundingClientRect();
      if (Math.round(r.width) > limit + 1 || Math.round(r.right) > limit + 1) {
        if (inScroller(n, wrap)) return;
        out.push((n.tagName + '.' + (n.className || '') + ' «' +
          (n.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 34) + '» w=' +
          Math.round(r.width) + ' r=' + Math.round(r.right)).slice(0, 110));
      }
    });
    return out;
  }
  var sel = window.__CRIT__;
  function critical(limit) {
    var bad = [], seen = 0;
    document.querySelectorAll(sel).forEach(function (n) {
      seen++;
      var r = n.getBoundingClientRect();
      if (r.width < 24 || r.height < 18) bad.push('too small: ' + Math.round(r.width) + 'x' + Math.round(r.height));
      else if (Math.round(r.right) > limit + 1 || Math.round(r.left) < -1) bad.push('clipped: l=' + Math.round(r.left) + ' r=' + Math.round(r.right));
    });
    return { seen: seen, bad: bad.slice(0, 3) };
  }
  var sheet = document.querySelector('.uz-sheet, .uz-ask-card');
  var narrow = {};
  [390, 360].forEach(function (px) {
    wrap.style.width = px + 'px';
    narrow[px] = { over: overflowing(px).slice(0, 4), scroll: wrap.scrollWidth,
                   crit: critical(px) };
  });
  wrap.style.width = '';
  document.title = 'VP' + JSON.stringify({
    clientWidth: de.clientWidth, scrollWidth: de.scrollWidth,
    overflow: de.scrollWidth - de.clientWidth,
    over: overflowing(de.clientWidth).slice(0, 4),
    crit: critical(de.clientWidth),
    sheet: sheet ? { w: Math.round(sheet.getBoundingClientRect().width),
                     r: Math.round(sheet.getBoundingClientRect().right),
                     l: Math.round(sheet.getBoundingClientRect().left) } : null,
    narrow: narrow
  });
});`;

const tmp = path.join(os.tmpdir(), 'uz-a1-viewport.html');
const worst = {};
CHROME_WIDTHS.concat(CONTAINER_WIDTHS).forEach((w) => { worst[w] = 0; });

TOPICS.forEach((id) => {
    const states = captured[id];
    STATES.forEach((st) => {
        const frag = states[st];
        if (!frag) return;
        /* The modal is position:fixed;inset:0 — inside the measuring wrapper it
           is pinned to the VIEWPORT, which is what we want to measure. The
           wrapper is only a query root, so it is not given a width of its own
           except when the two narrow container widths are applied. */
        const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${CSS}</style><style>${uiCss}${sessionCss}</style>
<style>html,body{margin:0;padding:0}#vpWrap{padding:10px;box-sizing:border-box}
.uz-modal,.uz-ask{position:static !important;inset:auto !important}</style>
</head><body><div id="vpWrap">${frag}</div>
<script>window.__CRIT__=${JSON.stringify(CRITICAL[st] || 'button')};${PROBE}<\/script>
</body></html>`;
        fs.writeFileSync(tmp, html);

        CHROME_WIDTHS.forEach((w) => {
            let dom = '';
            try {
                dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
                    '--virtual-time-budget=3000', `--window-size=${w},900`,
                    '--force-device-scale-factor=1', '--hide-scrollbars', '--dump-dom',
                    'file://' + tmp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
                    maxBuffer: 64 * 1024 * 1024 });
            } catch (err) { dom = (err.stdout || '').toString(); }
            const m = dom.match(/<title>VP(\{[\s\S]*?\})<\/title>/);
            if (!m) { fail++; failures.push(`T${id} ${st} @${w}: no measurement`); return; }
            const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
            const tag = `T${id} ${st} @${w}`;
            worst[w] = Math.max(worst[w], r.overflow);

            ok(r.overflow <= 1, `${tag}: no horizontal overflow (${r.overflow}px)`);
            ok(r.over.length === 0, `${tag}: nothing exceeds the viewport (${r.over.join(' ; ')})`);
            ok(r.crit.seen > 0, `${tag}: the critical control is present`);
            ok(r.crit.bad.length === 0, `${tag}: critical controls usable (${r.crit.bad.join(' ; ')})`);
            if (r.sheet) {
                ok(r.sheet.r <= r.clientWidth + 1 && r.sheet.l >= -1,
                    `${tag}: the modal sheet stays inside the viewport (l=${r.sheet.l} r=${r.sheet.r} vs ${r.clientWidth})`);
            }
            CONTAINER_WIDTHS.forEach((px) => {
                const n = r.narrow[px];
                worst[px] = Math.max(worst[px], Math.max(0, n.scroll - px));
                if (w !== CHROME_WIDTHS[CHROME_WIDTHS.length - 1]) return;  /* measure once */
                ok(n.over.length === 0,
                    `T${id} ${st} @${px}px container: nothing exceeds it (${n.over.join(' ; ')})`);
                ok(n.crit.bad.length === 0,
                    `T${id} ${st} @${px}px container: critical controls usable (${n.crit.bad.join(' ; ')})`);
            });
        });
        console.log(`  T${String(id).padEnd(2)} ${st.padEnd(8)} measured at ${CHROME_WIDTHS.join('/')} + ${CONTAINER_WIDTHS.join('/')}px containers`);
    });
});

console.log('  ' + '-'.repeat(58));
CHROME_WIDTHS.forEach((w) => console.log(`  ${String(w).padStart(4)}px viewport   worst horizontal overflow: ${worst[w]}px`));
CONTAINER_WIDTHS.forEach((w) => console.log(`  ${String(w).padStart(4)}px container  worst horizontal overflow: ${worst[w]}px  (container, not a true viewport — see header)`));
console.log('  real session + real verdict + real resume + real panels + real review');
console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ A1 EXERCISE VIEWPORT: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ A1 EXERCISE VIEWPORT: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
})().catch((e) => { console.error(e); process.exit(2); });
