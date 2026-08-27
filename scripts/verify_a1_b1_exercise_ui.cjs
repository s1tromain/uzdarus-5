#!/usr/bin/env node
/**
 * verify_a1_b1_exercise_ui.cjs — A1 and B1 exercises, in a real browser.
 *
 * TWO DEFECTS SHIPPED THROUGH A FULLY GREEN TEST SUITE, and both were
 * invisible to every string-matching check in this repo.
 *
 * 1. NO STYLESHEET. A1Host and B1Host render through the shared
 *    course-exercise-ui markup but never called injectStyles() — A2Host and
 *    B2Host happen to call it inside their create(), and A1/B1 have no
 *    create(). So thirty-two topics rendered correct markup with NO CSS: the
 *    question number ran into the question text ("1Noma'lum kishiga..."),
 *    every answer was a 20px user-agent grey button, cards had no background,
 *    padding or radius, and the whole exercise sat crushed in the top-left
 *    corner. The markup assertions all passed, because the markup was right.
 *
 * 2. THE TOPIC NEVER COMPLETED. The session calls cfg.finish(answers,
 *    checked) with TWO arguments; A1/B1 wired that straight to a page callback
 *    that takes ONE result object and grades through result.checked. So
 *    result.checked was undefined, allGroupsPassed() said no, completeExercises
 *    returned stage:'gate', and the page dropped it silently. A learner could
 *    answer every question correctly and NOTHING was saved, no exercises
 *    component was reported, and no topic could ever complete — with no error
 *    in the console.
 *
 * So this suite refuses to read source. It drives real Chrome, answers real
 * exercises through real clicks and keystrokes, and asserts computed styles,
 * geometry, the ORDER of the network calls, and the server's resulting state.
 */
'use strict';

const path = require('path');
const { launch, serveRepo, findChrome } = require('./_cdp_driver.cjs');
const { progressServer } = require('./_cdp_progress_server.cjs');

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n=== A1 / B1 EXERCISE UI + TOPIC COMPLETION ===' + (process.env.UI_SUITE_FAST === '1' ? '  [FAST subset]' : ''));

const COURSES = {
    A1: { url: '/paid-courses/a1-course.html', mount: 'mountA1Practice', host: 'A1Host', last: 12 },
    B1: { url: '/paid-courses/b1-course.html', mount: 'mountB1Practice', host: 'B1Host', last: 20 }
};

/* A representative spread: the first topic of each course, the A1 9->10 step
   that has broken before, and a B1 topic that carries a sentence builder. The
   exhaustive 32-topic sweep is a separate audit; what must never regress is
   pinned here so `npm test` catches it. */
const ALL_CASES = [
    { course: 'A1', topic: 1 },
    { course: 'A1', topic: 9 },
    { course: 'B1', topic: 1 },
    { course: 'B1', topic: 4 }
];

/* UI_SUITE_FAST runs a strict SUBSET of the very same assertions — one topic
   per course instead of two. It exists for the negative-control harness, which
   only needs the suite to fail, and which otherwise re-runs every walk 17 times
   on a memory-constrained machine. `npm test` always runs the full set, so the
   release is never judged by the subset. */
const FAST = process.env.UI_SUITE_FAST === '1';
const CASES = FAST ? [{ course: 'A1', topic: 1 }, { course: 'B1', topic: 1 }] : ALL_CASES;

const CURRENT_GROUP = `
    var it=document.querySelector('.uz-body .b2h-item[data-b2h-item]');
    if(it){var k=it.getAttribute('data-b2h-item');return k.slice(0,k.lastIndexOf('-'));}
    var u=document.querySelector('.uz-body .uzb[data-uzb]');
    if(u){var k2=u.getAttribute('data-uzb');return k2.slice(0,k2.lastIndexOf('-'));}
    if(document.querySelector('.uz-body .b2h-passage'))return '__passage__';
    return null;`;

const RENDER = `
    var out={problems:[]};
    var badf=function(m){out.problems.push(m);};
    out.styleTag=!!document.getElementById('b2h-styles');
    if(!out.styleTag) badf('no stylesheet injected');
    var root=document.querySelector('.uz-body .b2h');
    if(!root){ badf('no .b2h root'); return out; }

    var t=root.querySelector('.b2h-howto-t'), ty=root.querySelector('.b2h-howto-type');
    out.hasTitle=!!t; out.hasType=!!ty;
    out.hasInstruction=!!(root.querySelector('.b2h-howto-task')||root.querySelector('.b2h-howto p'));
    if(!t) badf('no exercise title');
    if(!ty) badf('no exercise type badge');
    if(!out.hasInstruction) badf('no instruction');
    if(ty){var tr=ty.getBoundingClientRect(); if(!tr.width||!tr.height) badf('type badge invisible');}

    var items=root.querySelectorAll('.b2h-item');
    out.items=items.length;
    if(!items.length && !root.querySelector('.b2h-passage')) badf('no question cards');
    var prev=null;
    for(var i=0;i<items.length;i++){
        var el=items[i], cs=getComputedStyle(el), r=el.getBoundingClientRect();
        if(cs.backgroundColor==='rgba(0, 0, 0, 0)'){badf('card '+(i+1)+' has no background');break;}
        if(parseFloat(cs.borderTopLeftRadius)<4){badf('card '+(i+1)+' not rounded');break;}
        if(parseFloat(cs.paddingTop)<8||parseFloat(cs.paddingLeft)<8){badf('card '+(i+1)+' has no padding');break;}
        if(i>0&&prev!==null&&(r.top-prev)<6){badf('cards '+i+'/'+(i+1)+' touch');break;}
        prev=r.bottom;
        var n=el.querySelector('.b2h-num'), tx=el.querySelector('.b2h-text');
        if(n&&tx){
            if(getComputedStyle(n).display==='inline'){badf('number '+(i+1)+' is inline (glued to text)');break;}
            var sep=tx.getBoundingClientRect().left-n.getBoundingClientRect().right;
            if(sep<4){badf('number '+(i+1)+' only '+Math.round(sep)+'px from text');break;}
            var nb=n.getBoundingClientRect();
            if(nb.width<16||nb.height<16){badf('number '+(i+1)+' badge too small');break;}
        }
    }
    var opts=root.querySelectorAll('.b2h-opt');
    out.opts=opts.length;
    if(opts.length){
        var os=getComputedStyle(opts[0]), orr=opts[0].getBoundingClientRect();
        if(os.appearance==='auto'&&os.backgroundColor==='rgb(239, 239, 239)') badf('options are user-agent default buttons');
        if(parseFloat(os.borderTopLeftRadius)<4) badf('options not rounded');
        if(orr.height<44) badf('option height '+Math.round(orr.height)+'px < 44');
        if(opts.length>1){
            var a=opts[0].getBoundingClientRect(), b=opts[1].getBoundingClientRect();
            var same=Math.abs(a.top-b.top)<4;
            var g=same?(b.left-a.right):(b.top-a.bottom);
            if(g<4) badf('options touch (gap '+Math.round(g)+'px)');
        }
    }
    var toks=root.querySelectorAll('.uzb-tok');
    out.toks=toks.length;
    if(toks.length){
        var ts=getComputedStyle(toks[0]);
        if(ts.appearance==='auto'&&ts.backgroundColor==='rgb(239, 239, 239)') badf('builder tokens are UA default');
        if(!root.querySelector('.uzb-out')) badf('builder has no answer area');
    }
    var cw=document.documentElement.clientWidth, esc=0;
    root.querySelectorAll('.b2h-item,.b2h-opt,.b2h-input,.b2h-howto,.uzb,.uzb-tok').forEach(function(e){
        var rr=e.getBoundingClientRect();
        if(rr.width&&(rr.right>cw+1||rr.left<-1)) esc++; });
    if(esc) badf(esc+' element(s) outside the viewport');
    var foot=document.querySelector('.uz-foot'), body=document.querySelector('.uz-body');
    if(foot&&body&&items.length){
        var fr=foot.getBoundingClientRect(), br=body.getBoundingClientRect();
        if(fr.top<br.top+10) badf('footer overlaps the questions');
    }
    out.hasFooterAction=!!document.querySelector('.uz-foot .uz-btn');
    if(!out.hasFooterAction) badf('no footer action button');
    return out;`;

const ANSWER = (host, topicId, gid) => `
    var H=window.${host};
    var t=courseData.topics.find(function(x){return x.id===${topicId};});
    var gs=H.groupsOf(t)||[];var g=null;
    for(var i=0;i<gs.length;i++) if(String(gs[i].id)===${JSON.stringify(gid)}) g=gs[i];
    if(!g) return 'no group';
    var root=document.querySelector('.uz-body .b2h'); if(!root) return 'no root';
    function norm(v){return window.UzNormalize?window.UzNormalize(v):String(v==null?'':v).toLowerCase().trim();}
    function isOpen(it){if(!it)return false;if(it.free)return true;var a=it.answer;
        if(a==null)return true;
        if(Array.isArray(a))return a.every(function(x){return String(x==null?'':x).trim()==='';});
        return String(a).trim()==='';}
    var miss=[];
    (g.items||[]).forEach(function(item,i){
        var key=g.id+'-'+i;var ans=item.answer;if(Array.isArray(ans))ans=ans[0];
        var want=isOpen(item)?'это очень важно для меня':String(ans==null?'':ans);
        var row=root.querySelector('[data-b2h-row="'+key+'"]');
        if(row){var bs=row.querySelectorAll('.b2h-opt');
            for(var b=0;b<bs.length;b++) if(norm(bs[b].getAttribute('data-value'))===norm(want)){bs[b].click();return;}
            miss.push(key);return;}
        var uzb=root.querySelector('.uzb[data-uzb="'+key+'"]');
        if(uzb){var rem=norm(want),guard=0;
            while(rem&&guard++<40){var chips=Array.prototype.slice.call(uzb.querySelectorAll('.uzb-bank .uzb-tok'))
                .sort(function(a,b){return norm(b.textContent).length-norm(a.textContent).length;});
                var pick=null;
                for(var c=0;c<chips.length;c++){var ct=norm(chips[c].textContent);
                    if(ct&&(rem===ct||rem.indexOf(ct+' ')===0)){pick=chips[c];break;}}
                if(!pick)break;pick.click();
                rem=rem===norm(pick.textContent)?'':rem.slice(norm(pick.textContent).length+1);}
            return;}
        var inp=root.querySelector('[data-b2h-input="'+key+'"]');
        if(inp){inp.focus();inp.value=want;
            inp.dispatchEvent(new Event('input',{bubbles:true}));
            inp.dispatchEvent(new Event('change',{bubbles:true}));inp.blur();return;}
        miss.push(key);
    });
    return miss.length?('MISS '+miss.join(',')):'filled';`;

const FOOT = `var b=document.querySelector('.uz-foot .uz-btn');if(!b)return null;
    var l=(b.textContent||'').trim();b.click();return l;`;

async function openTopic(p, site, cfg, topicId) {
    await p.goto(`http://127.0.0.1:${site.port}${cfg.url}`, { waitMs: 400 });
    await p.evaluate(`try{localStorage.removeItem('__cdp_server_state__');}catch(e){} return 1;`);
    await p.goto(`http://127.0.0.1:${site.port}${cfg.url}`, { waitMs: 1800 });
    await p.evaluate(`try{ ${cfg.mount}(${topicId}); }catch(e){} return 1;`);
    await sleep(550);
    await p.evaluate(`var b=document.querySelector('.uz-practice-btn'); if(b)b.click(); return 1;`);
    await sleep(1100);
}

/** Walk to the end, answering correctly. Returns true if FINISH was pressed. */
async function walkToEnd(p, cfg, topicId, T, checkRenderAt) {
    const total = await p.evaluate(`
        var t=courseData.topics.find(function(x){return x.id===${topicId};});
        return (window.${cfg.host}.groupsOf(t)||[]).length;`);
    for (let i = 0; i < total + 3; i++) {
        const gid = await p.evaluate(CURRENT_GROUP);
        if (!gid) return false;
        if (checkRenderAt && i === 0) {
            const r = await p.evaluate(RENDER);
            ok(r.problems.length === 0, `${T} first exercise renders correctly (${r.problems.join('; ')})`);
            ok(r.styleTag === true, `${T} the shared exercise stylesheet is injected`);
            ok(r.hasTitle === true, `${T} the exercise shows its title`);
            ok(r.hasType === true, `${T} the exercise shows its type`);
            ok(r.hasInstruction === true, `${T} the exercise shows an instruction`);
        }
        if (gid !== '__passage__') {
            const f = await p.evaluate(ANSWER(cfg.host, topicId, gid));
            if (String(f).indexOf('MISS') === 0) {
                ok(false, `${T} every question offers its correct answer (${f})`);
                return false;
            }
            await sleep(160);
        }
        await p.evaluate(FOOT);
        await sleep(600);
        const lbl = await p.evaluate(`var b=document.querySelector('.uz-foot .uz-btn');return b?(b.textContent||'').trim():null;`);
        if (lbl === 'Qayta topshirish' || lbl === 'Посмотреть ответы') {
            ok(false, `${T} correct answers pass the gate (got "${lbl}" on ${gid})`);
            return false;
        }
        if (lbl === 'Завершить и посмотреть результат') {
            await p.evaluate(FOOT);
            await sleep(2400);
            return true;
        }
        await p.evaluate(FOOT);
        await sleep(640);
    }
    return false;
}

(async () => {

if (!findChrome()) {
    console.log('='.repeat(60));
    console.log('  ❌ A1/B1 EXERCISE UI: BLOCKER — no Chrome/Chromium binary found.');
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}

const site = await serveRepo();
const browser = await launch();
console.log(`  driver: ${browser.version} · real exercises answered by real clicks`);

try {
    const p = await browser.newPage();
    let seed = {};
    await p.route((u) => (/paid-platform\.js/.test(u) ? progressServer({ progress: seed, latencyMs: 60 }) : null));
    await p.onNewDocument(
        `try{localStorage.setItem('currentUser',JSON.stringify({id:'u-ui',email:'t@t.uz',role:'student'}));}catch(e){}`);

    /* ---------------------------------------------------------------- *
     * 1. THE UI, DESKTOP AND PHONE
     * ---------------------------------------------------------------- */
    for (const { course, topic } of CASES) {
        const cfg = COURSES[course];
        const WIDTHS_UI = FAST ? [[1440, 900, false], [360, 800, true]] : [[1440, 900, false], [360, 800, true]];
        for (const [w, h, mob] of WIDTHS_UI) {
            seed = { [course]: { completedTopics: Array.from({ length: topic - 1 }, (_, i) => i + 1),
                                 topicComponents: { [topic]: { vocabularyCompleted: true } } } };
            await p.setDevice(w, h, mob);
            await openTopic(p, site, cfg, topic);
            const r = await p.evaluate(RENDER);
            const T = `${course} T${topic} @${w}`;
            ok(r.problems.length === 0, `${T} — exercise renders correctly (${r.problems.join('; ')})`);
            eq(`${T} — stylesheet injected`, r.styleTag, true);
            eq(`${T} — title present`, r.hasTitle, true);
            eq(`${T} — type badge present`, r.hasType, true);
            eq(`${T} — instruction present`, r.hasInstruction, true);
            eq(`${T} — footer action present`, r.hasFooterAction, true);
        }
    }

    /* ---------------------------------------------------------------- *
     * 1b. THE SHARED RENDERER IS SELF-SUFFICIENT
     * ---------------------------------------------------------------- *
     * FOUND BY NEGATIVE CONTROL. Removing injectStyles() from renderGroup
     * changed nothing, because A1Host and B1Host also call it — the very
     * redundancy added when this defect was fixed. That redundancy is worth
     * keeping, but it must not be the ONLY thing holding the styles up: a
     * future host written without the call would ship unstyled exercises
     * again. So prove the renderer alone restores its stylesheet.
     * ---------------------------------------------------------------- */
    {
        const r = await p.evaluate(`
            var tag = document.getElementById('b2h-styles');
            if (tag) tag.remove();
            var before = !!document.getElementById('b2h-styles');
            window.UzExerciseUI.renderGroup({ id: '__probe__', title: 'probe', type: 'choice',
                items: [{ q: 'q', options: ['a', 'b'], answer: 'a' }] });
            var after = !!document.getElementById('b2h-styles');
            if (!after) window.UzExerciseUI.injectStyles();
            return { before: before, after: after };`);
        eq('the stylesheet really was removed for the probe', r.before, false);
        eq('renderGroup() re-injects the stylesheet on its own', r.after, true);
    }

    /* ---------------------------------------------------------------- *
     * 1c. AN AUTHORED TASK LINE IS THE ONE THE LEARNER READS
     * ---------------------------------------------------------------- *
     * FOUND BY NEGATIVE CONTROL. Turning off B1's showTaskLine left the
     * header in place — a generated, type-derived instruction quietly took
     * the place of the sentence the course actually wrote. "An instruction is
     * present" was true either way, so nothing failed. Where the material
     * authored an intro, that exact text must be on screen.
     * ---------------------------------------------------------------- */
    for (const [course, topic] of [['B1', 1], ['A1', 1]]) {
        const cfg = COURSES[course];
        seed = { [course]: { completedTopics: Array.from({ length: topic - 1 }, (_, i) => i + 1),
                             topicComponents: { [topic]: { vocabularyCompleted: true } } } };
        await p.setDevice(1440, 900, false);
        await openTopic(p, site, cfg, topic);
        const r = await p.evaluate(`
            var gid=(function(){var it=document.querySelector('.uz-body .b2h-item[data-b2h-item]');
                if(!it)return null;var k=it.getAttribute('data-b2h-item');return k.slice(0,k.lastIndexOf('-'));})();
            var t=courseData.topics.find(function(x){return x.id===${topic};});
            var gs=window.${cfg.host}.groupsOf(t)||[];var g=null;
            for(var i=0;i<gs.length;i++) if(String(gs[i].id)===gid) g=gs[i];
            var el=document.querySelector('.uz-body .b2h-howto-task');
            return { authored: g?(g.intro||null):null,
                     shown: el?el.textContent.trim():null };`);
        if (r.authored) {
            eq(`${course} T${topic} — the authored task line is the one displayed`,
                r.shown, String(r.authored).trim());
        } else {
            ok(!!r.shown, `${course} T${topic} — an instruction is shown even with none authored`);
        }
    }

    /* ---------------------------------------------------------------- *
     * 2. FINISHING A TOPIC ACTUALLY FINISHES IT
     * ---------------------------------------------------------------- */
    await p.setDevice(1440, 900, false);
    for (const { course, topic } of CASES) {
        const cfg = COURSES[course];
        const T = `${course} T${topic} completion`;
        seed = { [course]: { completedTopics: Array.from({ length: topic - 1 }, (_, i) => i + 1),
                             topicComponents: { [topic]: { vocabularyCompleted: true } } } };
        await openTopic(p, site, cfg, topic);
        const finished = await walkToEnd(p, cfg, topic, T, true);
        ok(finished, `${T} — the learner can reach and press finish`);
        if (!finished) continue;

        const a = await p.evaluate(`
            var body=document.querySelector('.uz-body');
            var cards=Array.prototype.slice.call(document.querySelectorAll('.topic-btn'));
            var calls=window.__calls||[];
            var save=calls.filter(function(c){return c.kind==='saveQuizResult';});
            var comp=calls.filter(function(c){return c.kind==='completeCourseComponent'
                && c.payload && c.payload.component==='exercises';});
            var srv=window.__serverState?window.__serverState():null;
            var cs=(srv&&srv['${course}'])||{completedTopics:[],topicComponents:{}};
            var row=cs.topicComponents[${topic}]||{};
            return { summaryText:(body?(body.innerText||''):'').trim(),
                     summaryButtons: body?Array.prototype.map.call(body.querySelectorAll('button'),
                        function(x){return (x.textContent||'').trim();}):[],
                     saveCount:save.length, compCount:comp.length,
                     saveFirst:(save.length&&comp.length)?(save[0].n<comp[0].n):null,
                     compPayload: comp.length?comp[0].payload:null,
                     serverExercises: row.exercisesCompleted===true,
                     serverComplete: cs.completedTopics.indexOf(${topic})>=0,
                     clientComplete: (typeof completedTopics!=='undefined')?completedTopics.indexOf(${topic})>=0:null,
                     cardCompleted: cards[${topic}-1]?/completed/.test(String(cards[${topic}-1].className)):null,
                     nextUnlocked: ${topic} < ${cfg.last}
                        ? (cards[${topic}]?!/locked/.test(String(cards[${topic}].className)):null):'last' };`);

        ok(a.summaryText.length > 20, `${T} — the summary is not blank (${a.summaryText.length} chars)`);
        ok(a.summaryButtons.length > 0, `${T} — the summary offers a way forward`);
        eq(`${T} — the result was saved exactly once`, a.saveCount, 1);
        eq(`${T} — the exercises component was reported exactly once`, a.compCount, 1);
        eq(`${T} — the save happened BEFORE the component`, a.saveFirst, true);
        ok(a.compPayload && String(a.compPayload.course).toUpperCase() === course,
            `${T} — the component was reported for ${course}`);
        eq(`${T} — for this topic`, a.compPayload && Number(a.compPayload.topicId), topic);
        eq(`${T} — as the exercises half`, a.compPayload && a.compPayload.component, 'exercises');
        eq(`${T} — the server recorded the exercises half`, a.serverExercises, true);
        eq(`${T} — with both halves in, the server completed the topic`, a.serverComplete, true);
        eq(`${T} — the client applied the server's completedTopics`, a.clientComplete, true);
        eq(`${T} — the topic card shows completed`, a.cardCompleted, true);
        if (topic < cfg.last) eq(`${T} — the next topic unlocked`, a.nextUnlocked, true);

        /* durability */
        await p.goto(`http://127.0.0.1:${site.port}${cfg.url}`, { waitMs: 2000 });
        const rl = await p.evaluate(`
            var cards=Array.prototype.slice.call(document.querySelectorAll('.topic-btn'));
            var srv=window.__serverState?window.__serverState():null;
            var cs=(srv&&srv['${course}'])||{completedTopics:[]};
            return { serverComplete: cs.completedTopics.indexOf(${topic})>=0,
                     cardCompleted: cards[${topic}-1]?/completed/.test(String(cards[${topic}-1].className)):null,
                     nextUnlocked: ${topic} < ${cfg.last}
                        ? (cards[${topic}]?!/locked/.test(String(cards[${topic}].className)):null):'last' };`);
        eq(`${T} — still complete after a reload`, rl.serverComplete, true);
        eq(`${T} — the card is still completed after a reload`, rl.cardCompleted, true);
        if (topic < cfg.last) eq(`${T} — the next topic is still unlocked after a reload`, rl.nextUnlocked, true);
    }

    /* ---------------------------------------------------------------- *
     * 3. ONE HALF IS NOT A TOPIC — fail closed without the vocabulary
     * ---------------------------------------------------------------- */
    for (const course of (FAST ? ['A1'] : ['A1', 'B1'])) {
        const cfg = COURSES[course];
        const T = `${course} T1 without vocabulary`;
        seed = { [course]: { completedTopics: [], topicComponents: {} } };
        await openTopic(p, site, cfg, 1);
        const finished = await walkToEnd(p, cfg, 1, T, false);
        ok(finished, `${T} — the exercises can still be finished`);
        if (!finished) continue;
        const a = await p.evaluate(`
            var cards=Array.prototype.slice.call(document.querySelectorAll('.topic-btn'));
            var calls=window.__calls||[];
            var srv=window.__serverState?window.__serverState():null;
            var cs=(srv&&srv['${course}'])||{completedTopics:[],topicComponents:{}};
            var row=cs.topicComponents[1]||{};
            var body=document.querySelector('.uz-body');
            return { exercises: row.exercisesCompleted===true,
                     complete: cs.completedTopics.indexOf(1)>=0,
                     nextLocked: cards[1]?/locked/.test(String(cards[1].className)):null,
                     summary:(body?(body.innerText||''):'').trim(),
                     buttons: body?Array.prototype.map.call(body.querySelectorAll('button'),
                        function(x){return (x.textContent||'').trim();}):[] };`);
        eq(`${T} — the exercises half IS recorded`, a.exercises, true);
        eq(`${T} — but the topic is NOT completed`, a.complete, false);
        eq(`${T} — and the next topic stays locked`, a.nextLocked, true);
        ok(a.summary.length > 20, `${T} — the learner still sees a summary`);
        ok(a.buttons.length > 0, `${T} — with a way forward`);
        ok(/lug|Lug/.test(a.summary), `${T} — the summary says the vocabulary is still needed`);
    }
} finally {
    try { await browser.close(); } catch (e) {}
    try { await site.close(); } catch (e) {}
}

console.log('  A1/B1 exercises: styled, titled, instructed · finishing a topic saves, reports and unlocks');
console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ A1/B1 EXERCISE UI: ${fail} failed, ${pass} passed`);
    failures.forEach((f) => console.log('     • ' + f));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ A1/B1 EXERCISE UI: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');

})().catch((e) => { console.error('A1/B1 UI HARNESS ERROR', e); process.exit(1); });
