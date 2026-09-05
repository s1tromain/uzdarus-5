/**
 * _topic_completion_probe.cjs — drive a real course page through a real topic.
 *
 * Shared by the topic-completion suites. Everything here is a real click in a
 * real browser; the verdict is always read from the fake server's stored state
 * or from the page's own DOM, never from a string in a source file.
 *
 * Bounded on purpose: a deadline per topic, the course and topic on every
 * line, a dump of whatever screen it stalled on, and Chrome killed by the
 * caller's finally.
 */
'use strict';

const COURSES = {
    A1: { page: '/paid-courses/a1-course.html', vocab: '/paid-courses/a1-vocabulary.html',
          open: 'loadLesson', last: 12, exam: 'a1-final-exam.html',
          groups: "var t=(courseData.topics||[]).filter(function(x){return x.id===@T@;})[0];" +
                  "return JSON.stringify((window.A1Host&&t)?(window.A1Host.groupsOf(t)||[]):[]);" },
    A2: { page: '/paid-courses/a2-course.html', vocab: '/paid-courses/a2-vocabulary.html',
          open: 'loadLesson', last: 16, exam: 'a2-final-exam.html',
          groups: "return JSON.stringify(typeof a2GroupsOf==='function'?(a2GroupsOf(@T@)||[]):[]);" },
    B1: { page: '/paid-courses/b1-course.html', vocab: '/paid-courses/b1-vocabulary.html',
          open: 'loadLesson', last: 20, exam: 'b1-final-exam.html',
          groups: "var t=(courseData.topics||[]).filter(function(x){return x.id===@T@;})[0];" +
                  "return JSON.stringify((window.B1Host&&t)?(window.B1Host.groupsOf(t)||[]):[]);" },
    B2: { page: '/paid-courses/b2-course.html', vocab: '/paid-courses/b2-vocabulary.html',
          open: 'loadTopic', last: 16, exam: 'b2-final-exam.html',
          groups: "return JSON.stringify(typeof b2GroupsOf==='function'?(b2GroupsOf(@T@)||[]):[]);" }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Which screen is showing, and what can be pressed? Printed on every stall. */
const DIAG = `var m=document.querySelector('.uz-modal'); var b=document.querySelector('.uz-body');
 return { modal: m?(m.hidden?'hidden':'open'):'none',
   head:(document.querySelector('.uz-head')||{textContent:''}).textContent.trim().slice(0,44),
   foot:(document.querySelector('.uz-foot .uz-btn')||{textContent:''}).textContent.trim().slice(0,34),
   uztc: b?Array.prototype.map.call(b.querySelectorAll('[data-uztc]'),function(x){
        return x.getAttribute('data-uztc');}):[],
   text: b?b.textContent.trim().replace(/\\s+/g,' ').slice(0,150):null };`;

const CUR = `var it=document.querySelector('.uz-body .b2h-item[data-b2h-item]');
 if(it){var k=it.getAttribute('data-b2h-item');return k.slice(0,k.lastIndexOf('-'));}
 var u=document.querySelector('.uz-body .uzb[data-uzb]');
 if(u){var k2=u.getAttribute('data-uzb');return k2.slice(0,k2.lastIndexOf('-'));}
 if(document.querySelector('.uz-body .b2h-passage'))return '__passage__';
 var f=document.querySelector('.uz-foot .uz-btn'); var b=document.querySelector('.uz-body');
 if(f && b && (b.textContent||'').trim()) return '__stage__';
 return null;`;

const FOOT = `var b=document.querySelector('.uz-foot .uz-btn');if(!b)return null;
 var l=(b.textContent||'').trim();b.click();return l;`;

/**
 * Fill one exercise group.
 *
 * `wrong` is how many items to answer INCORRECTLY, so a suite can aim at an
 * exact overall percentage — the whole point of a threshold is the boundary.
 */
function fill(group, wrong) {
    const items = (group.items || []).map((i) => ({
        answer: Array.isArray(i.answer) ? i.answer[0] : i.answer, free: !!i.free
    }));
    return `var G=${JSON.stringify({ id: group.id, items: items })}; var WRONG=${Number(wrong) || 0};
 var root=document.querySelector('.uz-body'); if(!root) return 'no root';
 function n(v){return window.UzNormalize?window.UzNormalize(v):String(v==null?'':v).toLowerCase().trim();}
 var miss=[], spoiled=0;
 G.items.forEach(function(item,i){
  var key=G.id+'-'+i;
  var open=item.free||item.answer==null||String(item.answer).trim()==='';
  var want=open?'это очень важно для меня':String(item.answer);
  var makeWrong = spoiled < WRONG;
  var row=root.querySelector('[data-b2h-row="'+key+'"]');
  if(row){
   var bs=row.querySelectorAll('.b2h-opt');
   var pick=null;
   for(var b=0;b<bs.length;b++){
    var same = n(bs[b].getAttribute('data-value'))===n(want);
    if(makeWrong ? !same : same){ pick=bs[b]; break; }
   }
   if(!pick && makeWrong){ /* only one option: leave it blank instead */ spoiled++; return; }
   if(!pick){ miss.push(key); return; }
   if(makeWrong) spoiled++;
   pick.click(); return;
  }
  var uzb=root.querySelector('.uzb[data-uzb="'+key+'"]');
  if(uzb){
   if(makeWrong){ spoiled++; return; }              /* an empty build is wrong */
   var rem=n(want),gd=0;
   while(rem&&gd++<40){
    var ch=Array.prototype.slice.call(uzb.querySelectorAll('.uzb-bank .uzb-tok'))
      .sort(function(x,y){return n(y.textContent).length-n(x.textContent).length;});
    var pk=null;
    for(var c=0;c<ch.length;c++){var ct=n(ch[c].textContent);
     if(ct&&(rem===ct||rem.indexOf(ct+' ')===0)){pk=ch[c];break;}}
    if(!pk)break; pk.click();
    rem = rem===n(pk.textContent) ? '' : rem.slice(n(pk.textContent).length+1);
   }
   return;
  }
  var inp=root.querySelector('[data-b2h-input="'+key+'"]');
  if(inp){
   if(makeWrong){ spoiled++; inp.focus(); inp.value='zzz'; }
   else { inp.focus(); inp.value=want; }
   inp.dispatchEvent(new Event('input',{bubbles:true}));
   inp.dispatchEvent(new Event('change',{bubbles:true})); inp.blur(); return;
  }
  miss.push(key);
 });
 return miss.length ? ('MISS '+miss.length+' '+miss.slice(0,2).join(',')) : ('ok wrong='+spoiled);`;
}

/**
 * Open a topic and walk its exercises to the summary.
 *
 * Returns { reached, groups, stalled, screen } — never throws for a stall, so
 * a suite can report WHY rather than dying on a timeout.
 */
async function walkTopic(p, code, topicId, opts) {
    const o = opts || {};
    const cfg = COURSES[code];
    const deadline = Date.now() + (o.budgetMs || 220000);
    const log = o.log || (() => {});

    /* OPEN IT THE WAY A LEARNER DOES — by pressing the topic's card. A1 and B1
       keep loadLesson() inside the page closure, so calling it from outside
       throws and the topic silently never opens; a card click is both the real
       user action and the only one that works everywhere. */
    const opened = await p.evaluate(`
        var cards = Array.prototype.slice.call(document.querySelectorAll('.topic-btn'));
        var el = cards[${topicId} - 1];
        if (el) { el.click(); return 'card'; }
        try { ${cfg.open}(${topicId}); return 'fn'; } catch (e) {}
        try { if (typeof loadTopic === 'function') { loadTopic(${topicId}); return 'fn'; } } catch (e) {}
        return 'none';`);
    if (opened === 'none') {
        return { reached: false, stalled: 'cannot open the topic',
                 screen: await p.evaluate(DIAG), groups: [] };
    }
    await sleep(1800);
    const practice = await p.evaluate(
        `var b=document.querySelector('.uz-practice-btn'); if(b){b.click();return 1;} return 0;`);
    if (!practice) {
        return { reached: false, stalled: `no practice button (opened via ${opened})`,
                 screen: await p.evaluate(DIAG), groups: [] };
    }
    await sleep(1700);

    const groups = JSON.parse(await p.evaluate(cfg.groups.replace(/@T@/g, String(topicId))));
    /* how many items to get wrong, spread over the groups, to hit a target */
    let budget = Number(o.wrong) || 0;

    for (let i = 0; i < 26; i++) {
        if (Date.now() > deadline) {
            return { reached: false, stalled: 'deadline', screen: await p.evaluate(DIAG), groups };
        }
        const g = await p.evaluate(CUR);
        if (!g) return { reached: false, stalled: 'no active screen', screen: await p.evaluate(DIAG), groups };
        if (g === '__stage__') { await p.evaluate(FOOT); await sleep(900); continue; }
        if (g !== '__passage__') {
            const G = groups.find((x) => String(x.id) === String(g));
            if (!G) return { reached: false, stalled: 'unknown group ' + g, screen: await p.evaluate(DIAG), groups };
            const take = Math.min(budget, (G.items || []).length);
            const r = await p.evaluate(fill(G, take));
            if (String(r).indexOf('MISS') === 0) {
                return { reached: false, stalled: `${g}: ${r}`, screen: await p.evaluate(DIAG), groups };
            }
            budget -= take;
            await sleep(210);
        }
        await p.evaluate(FOOT); await sleep(780);
        const l = await p.evaluate(
            `var b=document.querySelector('.uz-foot .uz-btn');return b?(b.textContent||'').trim():null;`);
        /* A failed exercise cannot be walked past — that rule is unchanged. */
        if (l === 'Qayta topshirish' || l === 'Qayta ishlash' || l === 'Посмотреть ответы') {
            if (o.noRetake) {
                /* The per-exercise gate refused it and the caller wants to see
                   exactly that: a learner below the bar never gets a summary. */
                return { reached: false, stalled: `exercise ${g} refused (${l})`,
                         refusedAt: g, screen: await p.evaluate(DIAG), groups };
            }
            log(`    ${code} T${topicId}: exercise ${g} refused (${l}) — retaking it`);
            await p.evaluate(FOOT); await sleep(900);
            const again = await p.evaluate(CUR);
            if (again === g) {
                const G = groups.find((x) => String(x.id) === String(g));
                if (G) { await p.evaluate(fill(G, 0)); await sleep(210); }
                await p.evaluate(FOOT); await sleep(780);
            }
            const l2 = await p.evaluate(
                `var b=document.querySelector('.uz-foot .uz-btn');return b?(b.textContent||'').trim():null;`);
            if (/Завершить|tugat|Yakunla/i.test(l2 || '')) {
                await p.evaluate(FOOT); await sleep(2800);
                return { reached: true, groups, screen: await p.evaluate(DIAG) };
            }
            await p.evaluate(FOOT); await sleep(780);
            continue;
        }
        if (/Завершить|tugat|Yakunla/i.test(l || '')) {
            await p.evaluate(FOOT); await sleep(3000);
            return { reached: true, groups, screen: await p.evaluate(DIAG) };
        }
        await p.evaluate(FOOT); await sleep(780);
    }
    return { reached: false, stalled: 'ran out of steps', screen: await p.evaluate(DIAG), groups };
}

/** What the shared action area is offering right now. */
const ACTIONS = `var b=document.querySelector('.uz-body');
 var n=b?b.querySelector('.uztc-note'):null;
 return { acts: b?Array.prototype.map.call(b.querySelectorAll('[data-uztc]'),function(x){
     return { act:x.getAttribute('data-uztc'), label:(x.textContent||'').trim(),
              disabled:!!x.disabled };}):[],
   note: n?(n.className+' :: '+(n.textContent||'').trim()):null,
   modal: (function(){var m=document.querySelector('.uz-modal');
     return m?(m.hidden?'hidden':'open'):'none';})() };`;

const press = (act) => `var b=document.querySelector('.uz-body [data-uztc="${act}"]');
 if(!b) return 'missing'; b.click(); return 'clicked';`;

/** The fake server's stored truth for one topic. */
const server = (code, t) => `var s=window.__serverState?window.__serverState():null;
 var c=(s&&s['${code}'])||{completedTopics:[],topicComponents:{}};
 var row=c.topicComponents[${t}]||c.topicComponents['${t}']||{};
 var calls=(window.__calls||[]).filter(function(x){return x.kind==='completeCourseComponent';});
 return { vocabulary:row.vocabularyCompleted===true, exercises:row.exercisesCompleted===true,
   done:c.completedTopics.indexOf(${t})>=0, list:c.completedTopics.slice(),
   exN:calls.filter(function(x){return x.payload.component==='exercises';}).length,
   voN:calls.filter(function(x){return x.payload.component==='vocabulary';}).length,
   wrongTopic:calls.filter(function(x){return Number(x.payload.topicId)!==${t};}).length,
   wrongCourse:calls.filter(function(x){return String(x.payload.course).toUpperCase()!=='${code}';}).length };`;

/** Is the card for `topicId` locked in the rendered list? */
const locked = (topicId) => `var cards=Array.prototype.slice.call(document.querySelectorAll('.topic-btn'));
 var el=cards[${topicId} - 1];
 return el ? /locked/.test(String(el.className)) : null;`;

/** Which topic is on screen, judged by the lesson pane's own heading. */
const openTopic = `var el=document.getElementById('lessonContent')||document.getElementById('lesson');
 if(!el) return null;
 var h=el.querySelector('.lesson-title,h1,h2,h3');
 var m=h?String(h.textContent||'').match(/^\\s*(\\d+)\\s*\\./):null;
 return m?Number(m[1]):null;`;

module.exports = { COURSES, walkTopic, fill, sleep, DIAG, CUR, FOOT,
                   ACTIONS, press, server, locked, openTopic };
