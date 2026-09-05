#!/usr/bin/env node
/**
 * verify_learning_route.cjs — the three-stage topic route, everywhere.
 *
 * A topic used to open as a wall of grammar with the exercises somewhere below
 * and the vocabulary reachable only from a button on the topic card. Four
 * courses expressed that differently and the demos differently again. There is
 * now ONE overview — grammar, vocabulary, exercises — drawn by topic-route.js
 * for all four paid courses and all four demos, and ONE grammar reader.
 *
 * THE RULE IS UNCHANGED AND IS CHECKED HERE: a topic is finished by its
 * exercises at 80%. Grammar and vocabulary are recommendations. Neither may
 * gate the exercises, the topic or the next topic.
 *
 * This suite covers the material of all 64 paid topics, the 12 demo topics,
 * and drives the eight real pages in a browser.
 *
 *   UI_SUITE_FAST=1   A1 only, one viewport
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { launch, serveRepo, findChrome } = require('./_cdp_driver.cjs');
const { progressServer } = require('./_cdp_progress_server.cjs');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const FAST = process.env.UI_SUITE_FAST === '1';
const COURSES = FAST ? ['A1'] : ['A1', 'A2', 'B1', 'B2'];
const DEMO_OPEN = 3;

const PAGES = {
    A1: { paid: '/paid-courses/a1-course.html', demo: '/a1-demo.html', gpage: 'grammar-a1a2' },
    A2: { paid: '/paid-courses/a2-course.html', demo: '/a2-demo.html', gpage: 'grammar-a1a2' },
    B1: { paid: '/paid-courses/b1-course.html', demo: '/b1-demo.html', gpage: 'grammar-b1b2' },
    B2: { paid: '/paid-courses/b2-course.html', demo: '/b2-demo.html', gpage: 'grammar-b1b2' }
};

console.log('\n=== LEARNING ROUTE — grammar · vocabulary · exercises ===' +
            (FAST ? '  [FAST subset]' : ''));

(async () => {
const CANON = await import(pathToFileURL(path.join(ROOT, 'api/_lib/course-canon.js')).href);

/* ================================================================ *
 * 1. ONE SOURCE FOR HOW BIG A COURSE IS.
 * ================================================================ */
{
    const g = {};
    // eslint-disable-next-line no-new-func
    new Function('window', read('grammar-reader.js'))(g);
    Object.keys(CANON.COURSE_CANON).forEach((code) => {
        eq(`the reader knows ${code} has ${CANON.COURSE_CANON[code].totalTopics} topics`,
            g.UzGrammarReader.TOTALS[code], CANON.COURSE_CANON[code].totalTopics);
    });
    eq('and knows of no course the server does not',
        Object.keys(g.UzGrammarReader.TOTALS).sort().join(','),
        Object.keys(CANON.COURSE_CANON).sort().join(','));
}

/* ================================================================ *
 * 2. THE MATERIAL OF ALL 64 TOPICS.
 * ================================================================ */
{
    const data = {};
    // eslint-disable-next-line no-new-func
    const load = new Function('window', 'src', 'eval(src);');
    Object.keys(CANON.COURSE_CANON).forEach((code) => {
        const total = CANON.COURSE_CANON[code].totalTopics;
        const idxHost = {};
        load(idxHost, read(`grammar-data/${code.toLowerCase()}-index.js`));
        const index = (idxHost.UzGrammarIndex || {})[code] || [];
        eq(`${code}: the index lists every topic`, index.length, total);

        for (let id = 1; id <= total; id++) {
            const file = `grammar-data/${code.toLowerCase()}/${id}.js`;
            ok(fs.existsSync(path.join(ROOT, file)), `${code}/${id}: the material file exists`);
            if (!fs.existsSync(path.join(ROOT, file))) continue;
            const host = {};
            load(host, read(file));
            const t = ((host.UzGrammarData || {})[code] || {})[id];
            data[code + '/' + id] = t;
            ok(!!t, `${code}/${id}: the module registers its topic`);
            if (!t) continue;
            eq(`${code}/${id}: carries its own id`, Number(t.id), id);
            ok(t.title && t.title.trim().length > 2, `${code}/${id}: has a title`);
            ok(t.objective && /^После этого материала/.test(t.objective),
                `${code}/${id}: states what the learner will be able to do`);
            ok(t.summary && t.summary.trim().length > 20, `${code}/${id}: ends with a summary`);
            const body = String(t.body || '');
            const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            ok(text.length > 0 || (t.images || []).length > 0,
                `${code}/${id}: has material — text or a table image`);
            ok(!/undefined|\[object Object\]|NaN|\{\{|\bTODO\b|Lorem ipsum/.test(body),
                `${code}/${id}: carries no placeholder or technical value`);
            ok(!/<script|onerror=|onclick=|javascript:/i.test(body),
                `${code}/${id}: carries no executable markup`);
            (t.images || []).forEach((src) => {
                /* EVERY PICTURE IS ADDRESSED FROM THE SITE ROOT AND ENCODED, so
                   it resolves from the course page, from either pack reader and
                   from the public demo reader alike — the last of which sits at
                   the root, where the old "../images/…" climbed out of the site
                   and 404'd. The file on disk is the decoded path. */
                const url = String(src);
                ok(/^\/[^\s]+$/.test(url),
                    `${code}/${id}: the image is addressed from the site root (${url})`);
                const rel = decodeURIComponent(url.replace(/^\//, ''));
                ok(fs.existsSync(path.join(ROOT, rel)),
                    `${code}/${id}: the image it needs exists (${rel})`);
            });
            /* the index must agree with the module */
            const row = index.filter((r) => Number(r.id) === id)[0];
            ok(!!row, `${code}/${id}: appears in the index`);
            if (row) eq(`${code}/${id}: the index title matches`, row.title, t.title);
        }
    });

    /* the titles must be the COURSE's titles, not a second copy that drifted */
    const src = { A1: 'paid-courses/a1-course.html', A2: 'paid-courses/a2-course.html',
                  B1: 'paid-courses/b1-course.html' };
    Object.entries(src).forEach(([code, rel]) => {
        const page = read(rel);
        const total = CANON.COURSE_CANON[code].totalTopics;
        let found = 0;
        for (let id = 1; id <= total; id++) {
            const t = data[code + '/' + id];
            if (t && page.indexOf(t.title) >= 0) found++;
        }
        eq(`${code}: every generated title still appears in the course page`, found, total);
    });
}

/* ================================================================ *
 * 3. THE PAGES, DRIVEN.
 * ================================================================ */
if (!findChrome()) {
    console.log('  ❌ LEARNING ROUTE: BLOCKER — no Chrome/Chromium binary found.\n');
    process.exit(1);
}

const site = await serveRepo();
const browser = await launch();
console.log(`  driver: ${browser.version} · eight real pages, real clicks`);
const U = (x) => `http://127.0.0.1:${site.port}${x}`;

const OVERVIEW = `
 var r=document.querySelector('.uzr');
 var cards=r?r.querySelectorAll('.uzr-card'):[];
 return JSON.stringify({
   route:!!r, cards:cards.length,
   stages:Array.prototype.map.call(cards,function(x){return x.getAttribute('data-stage');}),
   title:(r&&r.querySelector('.uzr-title')||{textContent:''}).textContent.trim(),
   ctas:Array.prototype.map.call(r?r.querySelectorAll('.uzr-cta'):[],function(x){return x.textContent.trim();}),
   optional:(r?r.textContent:'').indexOf('majburiy emas')>=0,
   required:(r?r.textContent:'').indexOf('80%')>=0,
   oldGrammar:!!document.querySelector('#lessonContent .grammar-section'),
   sideways:document.documentElement.scrollWidth>window.innerWidth+2,
   focusable:Array.prototype.filter.call(r?r.querySelectorAll('.uzr-card'):[],
       function(x){return x.tagName==='BUTTON';}).length,
   errs:(window.__errs||[]).slice(0,3),
   /* the lesson pane names the topic it opened, numbered, as it always did */
   heading:(function(){var el=document.getElementById('lessonContent')||document.getElementById('lesson');
     var h=el?el.querySelector('.lesson-title,h1,h2,h3'):null;
     return h?String(h.textContent||'').trim():'';})()});`;

try {
    const p = await browser.newPage();
    let seed = {};
    await p.route((u) => (/paid-platform\.js/.test(u) ? progressServer({ progress: seed, latencyMs: 40 }) : null));
    await p.onNewDocument(
        `try{localStorage.setItem('currentUser',JSON.stringify({id:'lr',email:'l@t.uz',role:'student'}));}catch(e){}
         /* a locked topic card calls alert(), which blocks every later evaluate */
         window.alert=function(){};window.confirm=function(){return true;};
         window.addEventListener('error',function(e){(window.__errs=window.__errs||[]).push(String(e.message));});`);

    for (const code of COURSES) {
        const total = CANON.COURSE_CANON[code].totalTopics;
        const cfg = PAGES[code];
        const spots = FAST ? [1] : [1, Math.ceil(total / 2), total];

        for (const [w, h, name] of (FAST ? [[360, 800, 'mobile']] : [[360, 800, 'mobile'], [1440, 900, 'desktop']])) {
            const done = Array.from({ length: total - 1 }, (_, i) => i + 1);
            seed = { [code]: { completedTopics: done, topicComponents: {} } };
            await p.setDevice(w, h, w < 900);
            /* A2, B1 and B2 wait for Firebase and fall back to their own
               localStorage key when it never arrives, so seeding the fake
               server alone leaves every later topic locked — and a locked card
               quietly opens the PREVIOUS topic. Seed both, then reload, or the
               suite ends up testing a topic it did not ask for. */
            await p.goto(U(cfg.paid), { waitMs: 500 });
            await p.evaluate(`try{
                /* the fake server keeps its state in localStorage, so a seed set
                   after an earlier section is ignored until the old state goes */
                localStorage.removeItem('__cdp_server_state__');
                localStorage.setItem('${code.toLowerCase()}_progress_lr',
                    ${JSON.stringify(JSON.stringify(done))});}catch(e){} return 1;`);
            await p.goto(U(cfg.paid), { waitMs: 3000 });

            for (const T of spots) {
                await p.evaluate(`var c=document.querySelectorAll('.topic-btn'); if(c[${T}-1])c[${T}-1].click(); return 1;`);
                await sleep(1400);
                const s = JSON.parse(await p.evaluate(OVERVIEW));
                const N = `${code} T${T} @${name}`;
                ok(s.route, `${N}: the topic opens on its overview`);
                eq(`${N}: three stages`, s.cards, 3);
                eq(`${N}: in order`, (s.stages || []).join(','), 'grammar,vocabulary,exercises');
                eq(`${N}: each stage offers a button`, s.focusable, 3);
                eq(`${N}: every stage has a call to action`, (s.ctas || []).length, 3);
                ok((s.ctas || []).every((c) => c && c.length > 3), `${N}: no empty CTA`);
                ok(s.optional, `${N}: the deck is called optional in so many words`);
                ok(s.required, `${N}: the exercises state the 80% rule`);
                eq(`${N}: the old inline grammar is gone`, s.oldGrammar, false);
                eq(`${N}: no sideways scroll`, s.sideways, false);
                eq(`${N}: no console errors`, (s.errs || []).length, 0);
                eq(`${N}: the lesson pane still names the topic it opened`,
                    /^\s*(\d+)\s*\./.test(s.heading) ? Number(RegExp.$1) : null, T);
            }
        }

        /* ---- THE STAGE MUST NOT DEPEND ON WHO OPENED THE TOPIC ----
           Every page tracks the topic on screen in its own variable, and the
           exercises stage refuses to render for any other topic. When only the
           card handler set that variable, opening a topic any other way left
           the stage dead — one press, nothing happens, no error. */
        {
            const loader = code === 'B2' ? 'loadTopic' : 'loadLesson';
            /* the LAST topic: the seed leaves it unfinished, so the stage has to
               render real exercises rather than an "already done" panel */
            const mid = total;
            seed = { [code]: { completedTopics: Array.from({ length: total - 1 }, (_, i) => i + 1),
                               topicComponents: {} } };
            await p.setDevice(360, 800, true);
            await p.goto(U(cfg.paid), { waitMs: 500 });
            await p.evaluate(`try{localStorage.removeItem('__cdp_server_state__');}catch(e){} return 1;`);
            await p.goto(U(cfg.paid), { waitMs: 3000 });
            await p.evaluate(`try{ ${loader}(${mid}); }catch(e){} return 1;`);
            await sleep(1500);
            await p.evaluate(`var b=document.querySelector('[data-uzr-open=exercises]'); if(b)b.click(); return 1;`);
            await sleep(2600);
            const started = await p.evaluate(`
                var host=document.getElementById('quizSection')||document.getElementById('b2StageHost');
                var body=(host?host.textContent:'').replace(/\s+/g,' ').trim();
                return JSON.stringify({len:body.length, body:body.slice(0,80),
                    crumb:(document.querySelector('.uzr-crumb')||{textContent:''}).textContent.replace(/\s+/g,' ').trim()});`);
            const st = JSON.parse(started);
            const crumbTopic = (String(st.crumb).match(/(\d+)\s*-\s*mavzu/) || [])[1];
            eq(`${code}: ${loader}(${mid}) alone opens that topic`, Number(crumbTopic), mid);
            ok(st.len > 40 && !/avval yakunlangan/.test(st.body || ''),
                `${code}: and its exercises stage still renders (${st.len} chars)`);
        }

        /* the grammar route names THIS course and THIS topic */
        seed = { [code]: { completedTopics: [], topicComponents: {} } };
        await p.setDevice(360, 800, true);
        await p.goto(U(cfg.paid), { waitMs: 3000 });
        await p.evaluate(`var c=document.querySelectorAll('.topic-btn'); if(c[0])c[0].click(); return 1;`);
        await sleep(1400);
        await p.evaluate(`var b=document.querySelector('[data-uzr-open=grammar]'); if(b)b.click(); return 1;`);
        await sleep(2200);
        const where = await p.evaluate(`return location.pathname.split('/').pop()+location.search;`);
        eq(`${code}: grammar opens the right page`, where,
            `${cfg.gpage}.html?course=${code}&topic=1`);
        const shown = await p.evaluate(`var r=document.getElementById('grammarRoot');
            return JSON.stringify({title:(r&&r.querySelector('.gr-title')||{textContent:''}).textContent.trim(),
              goal:!!(r&&r.querySelector('.gr-goal')), back:!!document.getElementById('grBack'),
              sideways:document.documentElement.scrollWidth>window.innerWidth+2});`);
        const g = JSON.parse(shown);
        ok(g.title && g.title.length > 2, `${code}: the reader shows this topic's material (${g.title})`);
        ok(g.goal, `${code}: with its objective`);
        ok(g.back, `${code}: and a way back`);
        eq(`${code}: the reader does not scroll sideways`, g.sideways, false);

        /* ---- THE RULE: 80% finishes a topic, with no vocabulary at all ---- */
        const P = require('./_topic_completion_probe.cjs');
        seed = { [code]: { completedTopics: [], topicComponents: {} } };
        /* The audit server persists its state, and the viewport pass above
           seeded a finished course — a completed topic reopens as its stored
           result, with no practice button to press. */
        await p.goto(U(cfg.paid), { waitMs: 400 });
        await p.evaluate(`try{localStorage.removeItem('__cdp_server_state__');}catch(e){} return 1;`);
        await p.goto(U(cfg.paid), { waitMs: 3000 });
        const walk = await P.walkTopic(p, code, 1, { budgetMs: 200000, log: () => {} });
        ok(walk.reached, `${code}: the exercises can be finished from the overview (${walk.stalled || ''})`);
        if (walk.reached) {
            await p.evaluate(P.press('finish'));
            await sleep(4200);
            const srv = await p.evaluate(P.server(code, 1));
            eq(`${code}: the exercises alone complete the topic`, srv.done, true);
            eq(`${code}: reported exactly once, not twice`, srv.exN, 1);
            eq(`${code}: the deck was never reported`, srv.voN, 0);
            eq(`${code}: nor recorded`, srv.vocabulary, false);
            if (1 < total) eq(`${code}: the next topic unlocked`, await p.evaluate(P.locked(2)), false);
            /* and doing it again changes nothing */
            const again = await p.evaluate(`
                return Promise.resolve(window.completeCourseComponent('${code}',1,'exercises'))
                  .then(function(a){return JSON.stringify({ok:a&&a.ok===true,list:(a&&a.completedTopics)||[]});},
                        function(){return JSON.stringify({ok:false});});`);
            const rp = JSON.parse(again);
            eq(`${code}: repeating the completion is accepted`, rp.ok, true);
            eq(`${code}: with no duplicate id`, (rp.list || []).join(','), '1');
        }
    }

    /* ================================================================ *
     * 4. THE DEMOS: the same overview, three topics, nothing more.
     * ================================================================ */
    for (const code of COURSES) {
        const cfg = PAGES[code];
        await p.setDevice(360, 800, true);
        await p.goto(U(cfg.demo), { waitMs: 3800 });
        /* The demo paints its topic list from script; clicking before the cards
           exist does nothing and leaves the lesson pane on its placeholder. */
        for (let w = 0; w < 20; w++) {
            const n = await p.evaluate(`return document.querySelectorAll('.topic-btn').length;`);
            if (n > 0) break;
            await sleep(400);
        }
        const locks = JSON.parse(await p.evaluate(`
            return JSON.stringify((courseData.topics||[]).slice(0,5).map(function(t){
                return { id:t.id, locked: !!t.isSubscriptionLocked }; }));`));
        locks.forEach((row) => {
            if (row.id <= DEMO_OPEN) eq(`${code} demo: topic ${row.id} is open`, row.locked, false);
            else eq(`${code} demo: topic ${row.id} is behind the paywall`, row.locked, true);
        });

        await p.evaluate(`var c=document.querySelectorAll('.topic-btn'); if(c[0])c[0].click(); return 1;`);
        await sleep(1800);
        const s = JSON.parse(await p.evaluate(OVERVIEW));
        if (!s.route) {
            console.log('    demo diagnostic:', await p.evaluate(`
                return JSON.stringify({ route: typeof window.UzTopicRoute,
                    host: !!document.getElementById('demoTopicRoute'),
                    lesson:(document.getElementById('lessonContent')||{innerHTML:''}).innerHTML.slice(0,140),
                    errs:(window.__errs||[]).slice(0,3) });`));
        }
        ok(s.route, `${code} demo: uses the same overview`);
        eq(`${code} demo: three stages`, s.cards, 3);
        eq(`${code} demo: no sideways scroll`, s.sideways, false);
        eq(`${code} demo: no console errors`, (s.errs || []).length, 0);

        await p.evaluate(`var b=document.querySelector('[data-uzr-open=grammar]'); if(b)b.click(); return 1;`);
        await sleep(2200);
        const dw = await p.evaluate(`return location.pathname.split('/').pop()+location.search;`);
        ok(dw.indexOf('grammar-demo.html') === 0,
            `${code} demo: grammar opens the PUBLIC demo reader, not the paid page (${dw})`);
        const dg = await p.evaluate(`var r=document.getElementById('grammarRoot');
            return (r&&r.querySelector('.gr-title')||{textContent:''}).textContent.trim();`);
        ok(dg && dg.length > 2, `${code} demo: and shows the material (${dg})`);
    }

    /* the public demo reader serves the demo's topics and refuses the rest */
    for (const [q, want] of [['?course=A1&topic=1', 'rendered'], ['?course=B2&topic=3', 'rendered'],
                             ['?course=A1&topic=4', 'topic'], ['?course=B1&topic=20', 'topic'],
                             ['?course=ZZ&topic=1', 'course']]) {
        await p.goto(U('/grammar-demo.html' + q), { waitMs: 2200 });
        const st = await p.evaluate(`var r=document.getElementById('grammarRoot');
            var s=r?r.querySelector('[data-gr-state]'):null;
            return s?s.getAttribute('data-gr-state'):'rendered';`);
        eq(`public demo reader ${q}`, st, want);
    }
    /* ---- A PACK PAGE MAY NOT SERVE THE OTHER PACK ----
       The access gate authorises by page NAME, so grammar-a1a2.html is
       authorised for the A1A2 pack; if it also served B1 material an A1A2
       learner would read the other pack by editing the query. */
    for (const [page, course, want] of [['grammar-a1a2', 'B1', 'course'],
                                        ['grammar-a1a2', 'B2', 'course'],
                                        ['grammar-b1b2', 'A1', 'course'],
                                        ['grammar-b1b2', 'A2', 'course'],
                                        ['grammar-a1a2', 'A2', 'rendered'],
                                        ['grammar-b1b2', 'B1', 'rendered']]) {
        await p.goto(U(`/paid-courses/${page}.html?course=${course}&topic=1`), { waitMs: 2400 });
        const st = await p.evaluate(`var r=document.getElementById('grammarRoot');
            var s=r?r.querySelector('[data-gr-state]'):null;
            return s?s.getAttribute('data-gr-state'):'rendered';`);
        eq(`${page} with course=${course}`, st, want);
    }

    /* ---- ONE PRESS IS ONE PRESS ----
       Reopening a topic redraws the cards; a handler bound to the cards, or
       rebound on every mount, turns one press into two completions. */
    {
        await p.goto(U(PAGES[COURSES[0]].paid), { waitMs: 2600 });
        const fired = await p.evaluate(`
            var T = window.UzTopicRoute;
            if (!T) return -1;
            var host = document.createElement('div');
            document.body.appendChild(host);
            var n = 0;
            var ctx = { course:'A1', topicId:1, title:'T', grammar:{}, vocabulary:{}, exercises:{} };
            var h = { onExercises: function () { n++; } };
            T.mount(host, ctx, h);
            T.mount(host, ctx, h);        /* reopening the same topic */
            T.mount(host, ctx, h);
            host.querySelector('[data-uzr-open="exercises"]')
                .dispatchEvent(new MouseEvent('click', { bubbles: true }));
            var out = n;
            host.remove();
            return out;`);
        eq('three mounts and one press still report once', fired, 1);

        /* A remount draws a different topic into the same node. The press must
           run THAT topic's action, not the one the node was first built with. */
        const served = await p.evaluate(`
            var T = window.UzTopicRoute;
            if (!T) return 'no-module';
            var host = document.createElement('div');
            document.body.appendChild(host);
            var seen = [];
            function ctx(id) { return { course:'A1', topicId:id, title:'T'+id,
                                        grammar:{}, vocabulary:{}, exercises:{} }; }
            T.mount(host, ctx(1), { onExercises: function () { seen.push(1); } });
            T.mount(host, ctx(2), { onExercises: function () { seen.push(2); } });
            host.querySelector('[data-uzr-open="exercises"]')
                .dispatchEvent(new MouseEvent('click', { bubbles: true }));
            var out = seen.join(',');
            host.remove();
            return out;`);
        eq('a remount runs the new topic, not the old one', served, '2');
    }

    ok(!/paid-platform/.test(read('grammar-demo.html')),
        'the public demo reader is deliberately not behind the paid gate');
    ok(/DEMO_TOPICS/.test(read('grammar-demo.html')),
        'and holds its own limit so no paid topic leaks');
} finally {
    try { await browser.close(); } catch (e) {}
    try { await site.close(); } catch (e) {}
    try { execSync('pkill -f "Google Chrome for Testing" 2>/dev/null || true'); } catch (e) {}
}

console.log('  one overview · one reader · the deck never gates anything');
console.log('='.repeat(64));
if (fail) {
    console.log(`  ❌ LEARNING ROUTE: ${fail} failed, ${pass} passed`);
    failures.slice(0, 40).forEach((f) => console.log('     • ' + f));
    console.log('='.repeat(64) + '\n');
    process.exit(1);
}
console.log(`  ✅ LEARNING ROUTE: ${pass}/${pass} passed`);
console.log('='.repeat(64) + '\n');

})().catch((e) => {
    console.error('LEARNING ROUTE HARNESS ERROR', e && e.message);
    try { execSync('pkill -f "Google Chrome for Testing" 2>/dev/null || true'); } catch (x) {}
    process.exit(1);
});
