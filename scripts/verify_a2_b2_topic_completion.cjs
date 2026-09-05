#!/usr/bin/env node
/**
 * verify_a2_b2_topic_completion.cjs — A2 and B2 actually finish their topics.
 *
 * REPORTED BY A LEARNER, ON B2:
 *   "Lug'ati to'liq bo'lgandi. Bugun ham qayta ishladim, lekin yana keyingiga
 *    o'tmadi."  — the vocabulary was already complete, I did everything again
 *    today, and it still did not move to the next topic.
 *
 * WHAT WAS WRONG. completeExercises() decides whether an attempt passed with
 * allGroupsPassed(groups, result), which reads result.checked[groupId]. A2's
 * scoreFromAnswers() and B2's score() both return the SCORE object, which
 * carries its per-group figures in `breakdown` and has no `checked` at all.
 * So checked was undefined, every group read as failed, completeExercises
 * returned stage:'gate', and a2/b2ApplyOutcome discards a gate outcome in
 * silence.
 *
 * The learner therefore saw 100%, saw "Завершить тему", pressed it, watched
 * the modal close — and NOTHING had happened: no exercises component, no
 * completion, next topic still locked, no error anywhere.
 *
 * A1/B1 had the same class of defect in a different form and are covered by
 * verify_a1_b1_exercise_ui.cjs. This suite covers the other two courses, and
 * it asserts the thing that actually failed: the network call, the server's
 * resulting state, and the unlocked next topic — never a percentage on screen.
 */
'use strict';

const { launch, serveRepo, findChrome } = require('./_cdp_driver.cjs');
const { progressServer } = require('./_cdp_progress_server.cjs');

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n=== A2 / B2 TOPIC COMPLETION ===' + (process.env.UI_SUITE_FAST === '1' ? '  [FAST subset]' : ''));

const COURSES = {
    A2: { url: '/paid-courses/a2-course.html', groupsOf: 'a2GroupsOf', open: 'loadLesson', last: 16 },
    B2: { url: '/paid-courses/b2-course.html', groupsOf: 'b2GroupsOf', open: 'loadTopic',  last: 16 }
};

const FAST = process.env.UI_SUITE_FAST === '1';
/* Topic 3 is the one the learner reported on B2. */
const CASES = FAST ? [{ course: 'B2', topic: 3 }]
                   : [{ course: 'B2', topic: 3 }, { course: 'B2', topic: 1 },
                      { course: 'A2', topic: 3 }, { course: 'A2', topic: 1 }];

const CUR = `var it=document.querySelector('.uz-body .b2h-item[data-b2h-item]');
 if(it){var k=it.getAttribute('data-b2h-item');return k.slice(0,k.lastIndexOf('-'));}
 var u=document.querySelector('.uz-body .uzb[data-uzb]');
 if(u){var k2=u.getAttribute('data-uzb');return k2.slice(0,k2.lastIndexOf('-'));}
 if(document.querySelector('.uz-body .b2h-passage'))return '__passage__';
 /* A2 topics 6+ put an AUDIO briefing between the last exercise and the
    Rost/Yolg'on questions. It has nothing to answer, so a walker that only
    looks for answerable content stops dead one screen short of the summary. */
 var f=document.querySelector('.uz-foot .uz-btn');
 if(f && document.querySelector('.uz-body') && (document.querySelector('.uz-body').textContent||'').trim())
   return '__stage__';
 return null;`;

const ANS = (fn, t, gid) => `var gs=(typeof ${fn}==='function')?${fn}(${t}):[];
 var G=null;for(var i=0;i<gs.length;i++) if(String(gs[i].id)===${JSON.stringify(gid)}) G=gs[i];
 if(!G)return 'no group';var root=document.querySelector('.uz-body .b2h');if(!root)return 'no root';
 function n(v){return window.UzNormalize?window.UzNormalize(v):String(v==null?'':v).toLowerCase().trim();}
 function op(it){if(!it)return false;if(it.free)return true;var a=it.answer;if(a==null)return true;
  if(Array.isArray(a))return a.every(function(x){return String(x==null?'':x).trim()==='';});return String(a).trim()==='';}
 var miss=[];
 (G.items||[]).forEach(function(item,i){var key=G.id+'-'+i;var a=item.answer;if(Array.isArray(a))a=a[0];
  var want=op(item)?'это очень важно для меня':String(a==null?'':a);
  var row=root.querySelector('[data-b2h-row="'+key+'"]');
  if(row){var bs=row.querySelectorAll('.b2h-opt');
   for(var b=0;b<bs.length;b++) if(n(bs[b].getAttribute('data-value'))===n(want)){bs[b].click();return;}miss.push(key);return;}
  var uzb=root.querySelector('.uzb[data-uzb="'+key+'"]');
  if(uzb){var rem=n(want),gd=0;
   while(rem&&gd++<40){var ch=Array.prototype.slice.call(uzb.querySelectorAll('.uzb-bank .uzb-tok'))
     .sort(function(x,y){return n(y.textContent).length-n(x.textContent).length;});var pk=null;
    for(var c=0;c<ch.length;c++){var ct=n(ch[c].textContent);
     if(ct&&(rem===ct||rem.indexOf(ct+' ')===0)){pk=ch[c];break;}}
    if(!pk)break;pk.click();rem=rem===n(pk.textContent)?'':rem.slice(n(pk.textContent).length+1);}return;}
  var inp=root.querySelector('[data-b2h-input="'+key+'"]');
  if(inp){inp.focus();inp.value=want;inp.dispatchEvent(new Event('input',{bubbles:true}));
   inp.dispatchEvent(new Event('change',{bubbles:true}));inp.blur();return;}
  miss.push(key);});
 return miss.length?('MISS '+miss.join(',')):'ok';`;

const FOOT = `var b=document.querySelector('.uz-foot .uz-btn');if(!b)return null;
 var l=(b.textContent||'').trim();b.click();return l;`;

const SRV = (code, t) => `var s=window.__serverState?window.__serverState():null;
 var c=(s&&s['${code}'])||{completedTopics:[],topicComponents:{}};
 var row=c.topicComponents[${t}]||c.topicComponents['${t}']||{};
 var cards=Array.prototype.slice.call(document.querySelectorAll('.topic-btn'));
 var calls=(window.__calls||[]);
 var comp=calls.filter(function(x){return x.kind==='completeCourseComponent'
   && x.payload && x.payload.component==='exercises';});
 var save=calls.filter(function(x){return x.kind==='saveQuizResult';});
 return { vo:row.vocabularyCompleted===true, ex:row.exercisesCompleted===true,
   done:c.completedTopics.indexOf(${t})>=0,
   compN:comp.length, saveN:save.length,
   order:(save.length&&comp.length)?(save[0].n<comp[0].n):null,
   payload:comp.length?comp[0].payload:null,
   nextLocked:cards[${t}]?/locked/.test(String(cards[${t}].className)):null };`;

(async () => {

if (!findChrome()) {
    console.log('  ❌ A2/B2 TOPIC COMPLETION: BLOCKER — no Chrome/Chromium binary found.\n');
    process.exit(1);
}

const site = await serveRepo();
const browser = await launch();
console.log(`  driver: ${browser.version} · exercises answered by real clicks, verdict read from the server`);

try {
    const p = await browser.newPage();
    let seed = {};
    await p.route((u) => (/paid-platform\.js/.test(u) ? progressServer({ progress: seed, latencyMs: 60 }) : null));
    await p.onNewDocument(
        `try{localStorage.setItem('currentUser',JSON.stringify({id:'a2b2',email:'x@t.uz',role:'student'}));}catch(e){}`);

    for (const { course, topic } of CASES) {
        const cfg = COURSES[course];
        const T = `${course} T${topic}`;

        /* The learner's own situation: the vocabulary half is already in, the
           exercises half is not. Finishing the exercises must close the topic. */
        seed = { [course]: { completedTopics: Array.from({ length: topic - 1 }, (_, i) => i + 1),
                             topicComponents: { [topic]: { vocabularyCompleted: true } } } };

        for (const [w, h, mob] of (FAST ? [[360, 800, true]] : [[360, 800, true], [1440, 900, false]])) {
            await p.goto(`http://127.0.0.1:${site.port}${cfg.url}`, { waitMs: 400 });
            await p.evaluate(`try{localStorage.removeItem('__cdp_server_state__');}catch(e){}return 1;`);
            await p.setDevice(w, h, mob);
            await p.goto(`http://127.0.0.1:${site.port}${cfg.url}`, { waitMs: 2400 });
            await p.evaluate(`try{ ${cfg.open}(${topic}); }catch(e){ try{ loadTopic(${topic}); }catch(e2){} } return 1;`);
            await sleep(1500);
            await p.evaluate(`var b=document.querySelector('.uz-practice-btn'); if(b)b.click(); return 1;`);
            await sleep(1600);

            let walked = 0, finished = false, refused = null;
            for (let i = 0; i < 18; i++) {
                const g = await p.evaluate(CUR);
                if (!g) break;
                walked++;
                /* an interstitial takes ONE press and has nothing to answer;
                   pressing twice submits the NEXT group empty and fails it */
                if (g === '__stage__') { await p.evaluate(FOOT); await sleep(900); continue; }
                if (g !== '__passage__') {
                    const r = await p.evaluate(ANS(cfg.groupsOf, topic, g));
                    if (String(r).indexOf('MISS') === 0) { refused = `${g}: ${r}`; break; }
                    await sleep(210);
                }
                await p.evaluate(FOOT); await sleep(760);
                const l = await p.evaluate(`var b=document.querySelector('.uz-foot .uz-btn');return b?(b.textContent||'').trim():null;`);
                if (l === 'Qayta topshirish' || l === 'Qayta ishlash' || l === 'Посмотреть ответы') { refused = `${g}: gate refused correct answers`; break; }
                if (/Завершить|tugat|Yakunla/i.test(l || '')) { await p.evaluate(FOOT); await sleep(3000); finished = true; break; }
                await p.evaluate(FOOT); await sleep(760);
            }
            ok(!refused, `${T} @${w} — every question offers its correct answer (${refused || ''})`);
            ok(finished, `${T} @${w} — the learner reaches the end of the exercises`);
            if (!finished) continue;

            /* THE BUTTON THE LEARNER PRESSED. It must do the network work, not
               merely close the modal. */
            const btns = await p.evaluate(`var b=document.querySelector('.uz-body');
                return b?Array.prototype.map.call(b.querySelectorAll('[data-b2h-act],button'),
                    function(x){return (x.textContent||'').trim();}):[];`);
            ok(btns.length > 0, `${T} @${w} — the summary offers a completion button (${JSON.stringify(btns)})`);
            const clicked = await p.evaluate(`
                var b=document.querySelector('.uz-body [data-uztc="finish"]');
                if(b){ b.click(); return 'clicked'; } return 'not found';`);
            ok(clicked === 'clicked', `${T} @${w} — the completion button is present and clickable`);
            await sleep(3400);

            const s = await p.evaluate(SRV(course, topic));
            eq(`${T} @${w} — the exercises component was reported exactly once`, s.compN, 1);
            ok(s.saveN >= 1, `${T} @${w} — the result was saved (${s.saveN})`);
            eq(`${T} @${w} — the save happened before the component`, s.order, true);
            ok(s.payload && String(s.payload.course).toUpperCase() === course,
                `${T} @${w} — reported for ${course}`);
            eq(`${T} @${w} — for this topic`, s.payload && Number(s.payload.topicId), topic);
            eq(`${T} @${w} — the server recorded the exercises half`, s.ex, true);
            eq(`${T} @${w} — the vocabulary half was already in`, s.vo, true);
            eq(`${T} @${w} — with both halves the server completed the topic`, s.done, true);
            if (topic < cfg.last) eq(`${T} @${w} — the next topic unlocked`, s.nextLocked, false);

            await p.goto(`http://127.0.0.1:${site.port}${cfg.url}`, { waitMs: 2400 });
            const rl = await p.evaluate(SRV(course, topic));
            eq(`${T} @${w} — still complete after a reload`, rl.done, true);
            if (topic < cfg.last) eq(`${T} @${w} — next still unlocked after a reload`, rl.nextLocked, false);
        }
    }

    /* THE EXERCISES ALONE FINISH A TOPIC. This block used to assert the
       opposite — that one half unlocked nothing — which is the rule that
       stranded learners whose deck was never recorded. */
    {
        const cfg = COURSES.B2, topic = 1, T = 'B2 T1 without vocabulary';
        seed = { B2: { completedTopics: [], topicComponents: {} } };
        await p.goto(`http://127.0.0.1:${site.port}${cfg.url}`, { waitMs: 400 });
        await p.evaluate(`try{localStorage.removeItem('__cdp_server_state__');}catch(e){}return 1;`);
        await p.setDevice(360, 800, true);
        await p.goto(`http://127.0.0.1:${site.port}${cfg.url}`, { waitMs: 2400 });
        await p.evaluate(`try{ loadTopic(${topic}); }catch(e){} return 1;`); await sleep(1500);
        await p.evaluate(`var b=document.querySelector('.uz-practice-btn'); if(b)b.click(); return 1;`); await sleep(1600);
        for (let i = 0; i < 18; i++) {
            const g = await p.evaluate(CUR); if (!g) break;
            if (g !== '__passage__' && g !== '__stage__') { await p.evaluate(ANS(cfg.groupsOf, topic, g)); await sleep(200); }
            await p.evaluate(FOOT); await sleep(760);
            const l = await p.evaluate(`var b=document.querySelector('.uz-foot .uz-btn');return b?(b.textContent||'').trim():null;`);
            if (/Завершить|tugat|Yakunla/i.test(l || '')) { await p.evaluate(FOOT); await sleep(2800); break; }
            if (l === 'Qayta topshirish' || l === 'Qayta ishlash' || l === 'Посмотреть ответы') break;
            await p.evaluate(FOOT); await sleep(760);
        }
        await p.evaluate(`var b=document.querySelector('.uz-body [data-uztc="finish"]'); if(b)b.click(); return 1;`);
        await sleep(3600);
        const s = await p.evaluate(SRV('B2', topic));
        eq(`${T} — the exercises half IS recorded`, s.ex, true);
        eq(`${T} — the deck was never reported`, s.vo, false);
        eq(`${T} — and the topic IS completed without it`, s.done, true);
        eq(`${T} — so the next topic is unlocked`, s.nextLocked, false);
    }
} finally {
    try { await browser.close(); } catch (e) {}
    try { await site.close(); } catch (e) {}
}

console.log('  A2/B2: pressing "Завершить тему" reports the half, the server closes the topic, the next unlocks');
console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ A2/B2 TOPIC COMPLETION: ${fail} failed, ${pass} passed`);
    failures.forEach((f) => console.log('     • ' + f));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ A2/B2 TOPIC COMPLETION: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');

})().catch((e) => { console.error('A2/B2 COMPLETION HARNESS ERROR', e); process.exit(1); });
