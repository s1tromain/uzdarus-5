#!/usr/bin/env node
/**
 * verify_vocabulary_reconciliation.cjs — the deck reports itself, and gates
 * nothing.
 *
 * The vocabulary deck is optional: finishing a topic needs the exercises at
 * 80% and nothing else (verify_topic_completion_rule.cjs owns that contract
 * for all four courses). What this suite protects is the OTHER half of that
 * promise — the deck's own progress must still be recorded honestly.
 *
 *   - a deck finished before the component model shipped is reported once,
 *     without asking the learner to walk a hundred words again;
 *   - it is reported through the authoritative API, never by writing progress
 *     from the client;
 *   - it is idempotent: the second visit sends nothing;
 *   - and reporting the deck NEVER completes a topic on its own.
 *
 * The suite that used to live here asserted the superseded rule — that
 * finishing the exercises left the topic locked until the deck was done, and
 * offered the learner a button to the deck. That errand is exactly what
 * stranded the learners this work exists to unstrand.
 */
'use strict';

const { launch, serveRepo, findChrome } = require('./_cdp_driver.cjs');
const { progressServer } = require('./_cdp_progress_server.cjs');

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n=== VOCABULARY RECONCILIATION — the deck records itself, and gates nothing ===' +
            (process.env.UI_SUITE_FAST === '1' ? '  [FAST subset]' : ''));

const C = {
    B2: { course: '/paid-courses/b2-course.html', vocab: '/paid-courses/b2-vocabulary.html',
          groupsOf: 'b2GroupsOf', open: 'loadTopic' },
    A2: { course: '/paid-courses/a2-course.html', vocab: '/paid-courses/a2-vocabulary.html',
          groupsOf: 'a2GroupsOf', open: 'loadLesson' }
};
const FAST = process.env.UI_SUITE_FAST === '1';
const CODES = FAST ? ['B2'] : ['B2', 'A2'];

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
 (G.items||[]).forEach(function(item,i){var key=G.id+'-'+i;var a=item.answer;if(Array.isArray(a))a=a[0];
  var want=op(item)?'это очень важно для меня':String(a==null?'':a);
  var row=root.querySelector('[data-b2h-row="'+key+'"]');
  if(row){var bs=row.querySelectorAll('.b2h-opt');
   for(var b=0;b<bs.length;b++) if(n(bs[b].getAttribute('data-value'))===n(want)){bs[b].click();return;}return;}
  var uzb=root.querySelector('.uzb[data-uzb="'+key+'"]');
  if(uzb){var rem=n(want),gd=0;
   while(rem&&gd++<40){var ch=Array.prototype.slice.call(uzb.querySelectorAll('.uzb-bank .uzb-tok'))
     .sort(function(x,y){return n(y.textContent).length-n(x.textContent).length;});var pk=null;
    for(var c=0;c<ch.length;c++){var ct=n(ch[c].textContent);
     if(ct&&(rem===ct||rem.indexOf(ct+' ')===0)){pk=ch[c];break;}}
    if(!pk)break;pk.click();rem=rem===n(pk.textContent)?'':rem.slice(n(pk.textContent).length+1);}return;}
  var inp=root.querySelector('[data-b2h-input="'+key+'"]');
  if(inp){inp.focus();inp.value=want;inp.dispatchEvent(new Event('input',{bubbles:true}));
   inp.dispatchEvent(new Event('change',{bubbles:true}));inp.blur();}});
 return 'ok';`;

const FOOT = `var b=document.querySelector('.uz-foot .uz-btn');if(!b)return null;
 var l=(b.textContent||'').trim();b.click();return l;`;

/** Walk a topic's exercises to the summary. Answers are always correct. */
async function reachSummary(p, cfg, topic) {
    await p.evaluate(`try{ ${cfg.open}(${topic}); }catch(e){ try{ loadTopic(${topic}); }catch(e2){} } return 1;`);
    await sleep(1500);
    await p.evaluate(`var b=document.querySelector('.uz-practice-btn'); if(b)b.click(); return 1;`);
    await sleep(1600);
    for (let i = 0; i < 18; i++) {
        const g = await p.evaluate(CUR);
        if (!g) return false;
        if (g === '__stage__') { await p.evaluate(FOOT); await sleep(900); continue; }
        if (g !== '__passage__') { await p.evaluate(ANS(cfg.groupsOf, topic, g)); await sleep(200); }
        await p.evaluate(FOOT); await sleep(760);
        const l = await p.evaluate(`var b=document.querySelector('.uz-foot .uz-btn');return b?(b.textContent||'').trim():null;`);
        if (l === 'Qayta topshirish' || l === 'Qayta ishlash' || l === 'Посмотреть ответы') return false;
        if (/Завершить|tugat|Yakunla/i.test(l || '')) { await p.evaluate(FOOT); await sleep(3000); return true; }
        await p.evaluate(FOOT); await sleep(760);
    }
    return false;
}

const CLICK = (act) => `var b=document.querySelector('.uz-body [data-b2h-act="${act}"]')
 || Array.prototype.slice.call(document.querySelectorAll('.uz-body button'))
      .filter(function(x){return /Завершить|tugat/i.test(x.textContent||'');})[0];
 if(!b)return 'missing'; b.click(); return 'clicked';`;

/* The engine hides its modal rather than destroying it, so "is it open" is the
   hidden flag — not the presence of a node. A panel left inside a hidden modal
   is still a defect: it reappears the next time the summary is opened. */
const MODAL = `var m=document.querySelector('.uz-modal');
 var st=document.querySelector('.uz-body [data-b2h-status]');
 return { open: !!(m && !m.hidden),
   status: st?String(st.className):null,
   text: st?(st.textContent||'').trim():null,
   acts: st?Array.prototype.map.call(st.querySelectorAll('[data-b2h-act]'),
        function(x){return x.getAttribute('data-b2h-act');}):[] };`;

const SRV = (code, t) => `var s=window.__serverState?window.__serverState():null;
 var c=(s&&s['${code}'])||{completedTopics:[],topicComponents:{}};
 var row=c.topicComponents[${t}]||c.topicComponents['${t}']||{};
 var calls=(window.__calls||[]);
 return { vo:row.vocabularyCompleted===true, ex:row.exercisesCompleted===true,
   done:c.completedTopics.indexOf(${t})>=0, list:c.completedTopics.slice(),
   exN:calls.filter(function(x){return x.kind==='completeCourseComponent'
        && x.payload && x.payload.component==='exercises';}).length,
   voN:calls.filter(function(x){return x.kind==='completeCourseComponent'
        && x.payload && x.payload.component==='vocabulary';}).length };`;

(async () => {

if (!findChrome()) {
    console.log('  ❌ VOCABULARY RECONCILIATION: BLOCKER — no Chrome/Chromium binary found.\n');
    process.exit(1);
}

const site = await serveRepo();
const browser = await launch();
console.log(`  driver: ${browser.version} · real pages, verdict read from the server`);
const U = (path) => `http://127.0.0.1:${site.port}${path}`;

try {
    const p = await browser.newPage();
    let seed = {};
    await p.route((u) => (/paid-platform\.js/.test(u) ? progressServer({ progress: seed, latencyMs: 60 }) : null));
    await p.onNewDocument(
        `try{localStorage.setItem('currentUser',JSON.stringify({id:'voc1',email:'v@t.uz',role:'student'}));}catch(e){}`);
    const reset = async (path) => {
        await p.goto(U(path), { waitMs: 350 });
        await p.evaluate(`try{localStorage.removeItem('__cdp_server_state__');
            Object.keys(localStorage).filter(function(k){return /vocab-pending|vocabulary_progress/.test(k);})
              .forEach(function(k){localStorage.removeItem(k);});}catch(e){}return 1;`);
    };

    for (const code of CODES) {
        const cfg = C[code];

        /* ---- THE LEGACY DECK. 100% on screen, nothing on the server. ---- */
        seed = { [code]: { completedTopics: [], topicComponents: {}, vocabulary: { learnedWords: {} } } };
        await reset(cfg.vocab);
        await p.setDevice(360, 800, true);
        await p.goto(U(cfg.vocab), { waitMs: 2800 });
        const counts = await p.evaluate(`return (vocabularyData.topics||[]).slice(0,3).map(function(t){
            return { id:t.id, total:(t.words||[]).length }; });`);
        ok(counts.length === 3, `${code} — the deck exposes its topics`);

        const learned = {};
        counts.forEach((c) => { learned['topic_' + c.id] = c.total; });
        /* full word counts and NOT ONE component record — exactly the state a
           learner who finished before the component model is left in */
        seed = { [code]: { completedTopics: [], topicComponents: {},
                           vocabulary: { learnedWords: learned } } };
        await reset(cfg.vocab);
        await p.goto(U(cfg.vocab), { waitMs: 4200 });
        await sleep(1800);
        const v = await p.evaluate(SRV(code, counts[0].id));
        eq(`${code} — a finished deck is reported without redoing it`, v.vo, true);
        eq(`${code} — once per finished topic, no more`, v.voN, counts.length);
        eq(`${code} — the deck alone completes NO topic`, v.done, false);
        eq(`${code} — and completedTopics is untouched by the client`, v.list.length, 0);
        eq(`${code} — the client reported no exercises it had not done`, v.exN, 0);

        /* idempotent: the same page again must send nothing */
        await p.goto(U(cfg.vocab), { waitMs: 4200 });
        await sleep(1800);
        const v2 = await p.evaluate(SRV(code, counts[0].id));
        eq(`${code} — a second visit reports nothing at all`, v2.voN, 0);
        eq(`${code} — the acknowledgement survives`, v2.vo, true);

        /* a HALF-finished deck is never reported */
        const partial = {};
        counts.forEach((c) => { partial['topic_' + c.id] = Math.max(0, c.total - 1); });
        seed = { [code]: { completedTopics: [], topicComponents: {},
                           vocabulary: { learnedWords: partial } } };
        await reset(cfg.vocab);
        await p.goto(U(cfg.vocab), { waitMs: 4200 });
        await sleep(1800);
        const v3 = await p.evaluate(SRV(code, counts[0].id));
        eq(`${code} — a deck one word short is never reported`, v3.voN, 0);
        eq(`${code} — and nothing is completed`, v3.list.length, 0);

        /* ---- AND THE COURSE PAGE NEEDS NONE OF IT ---- */
        seed = { [code]: { completedTopics: [], topicComponents: {} } };
        await reset(cfg.course);
        await p.goto(U(cfg.course), { waitMs: 2600 });
        const optional = await p.evaluate(`
            var TC = window.UzTopicCompletion;
            if (!TC) return 'no contract';
            var html = TC.renderAction({ snapshot: { score: 10, total: 10 } });
            return JSON.stringify({
                finish: /data-uztc="finish"/.test(html),
                saysOptional: /не\\s*обязател/i.test(html),
                demandsDeck: /yakunlang/i.test(html) });`);
        const o = JSON.parse(optional);
        eq(`${code} — the course page offers the completion button`, o.finish, true);
        eq(`${code} — and says the deck is optional`, o.saysOptional, true);
        eq(`${code} — and never demands it`, o.demandsDeck, false);
    }
} finally {
    try { await browser.close(); } catch (e) {}
    try { await site.close(); } catch (e) {}
}

console.log('  the deck reports itself once, idempotently, and completes nothing on its own');
console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ VOCABULARY RECONCILIATION: ${fail} failed, ${pass} passed`);
    failures.forEach((f) => console.log('     • ' + f));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ VOCABULARY RECONCILIATION: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');

})().catch((e) => { console.error('VOCABULARY RECONCILIATION HARNESS ERROR', e); process.exit(1); });
