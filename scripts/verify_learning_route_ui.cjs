#!/usr/bin/env node
/**
 * verify_learning_route_ui.cjs — what the learner actually SEES.
 *
 * The route shipped with green functional tests and an unusable screen: the
 * overview and the reader rendered near-black on a phone in dark mode, the
 * explanations broke to one word per line and spilled out of their cards, the
 * buttons came out a few letters wide, and the grammar pictures did not load.
 * Every one of those was invisible to a suite that counts elements and reads
 * text, so this one measures the render instead: bounding boxes, computed
 * colours, contrast, natural image sizes and the lightbox.
 *
 *   UI_SUITE_FAST=1   A1 only, two viewports
 */
'use strict';
const path = require('path');
const { launch, serveRepo, sleep } = require('./_cdp_driver.cjs');
const { progressServer } = require('./_cdp_progress_server.cjs');

const FAST = process.env.UI_SUITE_FAST === '1';
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const VIEWPORTS = FAST
    ? [[390, 844, true], [1366, 768, false]]
    : [[360, 800, true], [390, 844, true], [414, 896, true],
       [768, 1024, false], [1366, 768, false], [1440, 900, false]];

const COURSES = FAST ? ['A1'] : ['A1', 'A2', 'B1', 'B2'];
const PAGES = {
    A1: { paid: '/paid-courses/a1-course.html', demo: '/a1-demo.html', gpage: 'grammar-a1a2', total: 12 },
    A2: { paid: '/paid-courses/a2-course.html', demo: '/a2-demo.html', gpage: 'grammar-a1a2', total: 16 },
    B1: { paid: '/paid-courses/b1-course.html', demo: '/b1-demo.html', gpage: 'grammar-b1b2', total: 20 },
    B2: { paid: '/paid-courses/b2-course.html', demo: '/b2-demo.html', gpage: 'grammar-b1b2', total: 16 }
};

/* ---------------------------------------------------------------- probes */

/** Luminance and contrast, computed the way WCAG defines them. */
const COLOUR_FNS = `
 function __rgb(c){var m=String(c||'').match(/[\\d.]+/g)||[255,255,255];
   return [Number(m[0]),Number(m[1]),Number(m[2]),m[3]===undefined?1:Number(m[3])];}
 function __lum(c){var v=__rgb(c).slice(0,3).map(function(x){x=x/255;
   return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4);});
   return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2];}
 /* A GRADIENT IS A BACKGROUND TOO. Reading only backgroundColor sees
    rgba(0,0,0,0) behind a gradient button and walks up to the white card,
    so white lettering on indigo scores 1.0 and the check calls a perfectly
    readable button unreadable. Every stop of the gradient counts, and the
    worst of them is the one that has to pass. */
 function __bgLayers(el){
   for(var n=el;n&&n.nodeType===1;n=n.parentElement){
     var cs=getComputedStyle(n);
     var img=cs.backgroundImage;
     if(img&&img!=='none'){
       var stops=img.match(/rgba?\([^)]+\)/g);
       if(stops&&stops.length) return stops;}
     if(__rgb(cs.backgroundColor)[3]>0.1) return [cs.backgroundColor];}
   return [getComputedStyle(document.body).backgroundColor];}
 function __pair(fg,bg){var a=__lum(fg),b=__lum(bg);
   return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);}
 function __contrastOf(el){
   var fg=getComputedStyle(el).color;
   return __bgLayers(el).reduce(function(worst,bg){
     return Math.min(worst,__pair(fg,bg));}, 99);}
 function __paintedBg(el){return __bgLayers(el)[0];}
 function __contrast(fg,bg){return __pair(fg,bg);}`;

/** Everything the eye would catch, measured. */
const LOOK = `${COLOUR_FNS}
 var r=document.querySelector('.uzr');
 if(!r) return JSON.stringify({route:false});
 var cards=Array.prototype.slice.call(r.querySelectorAll('.uzr-card'));
 var rr=r.getBoundingClientRect();
 function box(el){var b=el.getBoundingClientRect();
   return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)};}
 var spill=[], thin=[], lowContrast=[], clipped=[];
 cards.forEach(function(card,i){
   var cb=card.getBoundingClientRect();
   Array.prototype.slice.call(card.querySelectorAll('p,h3,span,div')).forEach(function(el){
     if(!el.textContent.trim()) return;
     var b=el.getBoundingClientRect();
     if(b.width===0&&b.height===0) return;
     /* out of its own card by more than a rounding error */
     if(b.left<cb.left-1||b.right>cb.right+1||b.top<cb.top-1||b.bottom>cb.bottom+1){
       spill.push('card'+i+' '+(el.className||el.tagName)+' '+JSON.stringify(box(el)));}
     /* a paragraph squeezed into a sliver breaks to one word per line */
     if(/uzr-card-body|uzr-note|uzr-cta/.test(el.className||'')&&b.width<90){
       thin.push('card'+i+' '+el.className+' w='+Math.round(b.width));}
     /* text cut off by its own box */
     if(el.scrollWidth>el.clientWidth+2&&getComputedStyle(el).overflow!=='visible'){
       clipped.push('card'+i+' '+(el.className||el.tagName));}
     /* the stage badge is a decorative emoji marked aria-hidden — it carries
        no words, so the rule for text does not apply to it */
     if(!el.closest('[aria-hidden="true"]')){
       var ct=__contrastOf(el);
       if(ct<4.5) lowContrast.push('card'+i+' '+(el.className||el.tagName)+' '+ct.toFixed(2));}
   });
 });
 /* no two cards may sit on top of each other */
 var overlap=[];
 for(var i=0;i<cards.length;i++) for(var j=i+1;j<cards.length;j++){
   var a=cards[i].getBoundingClientRect(), b=cards[j].getBoundingClientRect();
   if(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1)
     overlap.push(i+'/'+j);}
 var ctas=Array.prototype.slice.call(r.querySelectorAll('.uzr-cta')).map(box);
 return JSON.stringify({
   route:true, cards:cards.length,
   pageBg:getComputedStyle(document.body).backgroundColor,
   pageLum:__lum(getComputedStyle(document.body).backgroundColor),
   cardBg:cards[0]?getComputedStyle(cards[0]).backgroundColor:null,
   cardLum:cards[0]?__lum(getComputedStyle(cards[0]).backgroundColor):0,
   bodyFont:cards[0]?parseFloat(getComputedStyle(cards[0].querySelector('.uzr-card-body')).fontSize):0,
   ctas:ctas, spill:spill.slice(0,4), thin:thin.slice(0,4),
   clipped:clipped.slice(0,4), lowContrast:lowContrast.slice(0,4),
   overlap:overlap, sideways:document.documentElement.scrollWidth>document.documentElement.clientWidth+2});`;

const READER = `${COLOUR_FNS}
 var doc=document.querySelector('.gr-doc');
 if(!doc) return JSON.stringify({doc:false});
 var imgs=Array.prototype.slice.call(doc.querySelectorAll('img'));
 var low=[];
 Array.prototype.slice.call(doc.querySelectorAll('p,li,h1,h2,h3,h4,td,th')).forEach(function(el){
   if(!el.textContent.trim()) return;
   var ct=__contrastOf(el);
   if(ct<4.5) low.push((el.className||el.tagName)+' '+ct.toFixed(2));});
 return JSON.stringify({
   doc:true,
   pageBg:getComputedStyle(document.body).backgroundColor,
   pageLum:__lum(getComputedStyle(document.body).backgroundColor),
   titleLum:__lum(getComputedStyle(doc.querySelector('.gr-title')).color),
   images:imgs.length,
   loaded:imgs.filter(function(i){return i.naturalWidth>0&&i.naturalHeight>0;}).length,
   broken:imgs.filter(function(i){return i.complete&&i.naturalWidth===0;})
              .map(function(i){return i.getAttribute('src');}).slice(0,3),
   figures:doc.querySelectorAll('.gr-figure').length,
   openBtns:doc.querySelectorAll('.gr-figure-open').length,
   lowContrast:low.slice(0,4),
   sideways:document.documentElement.scrollWidth>document.documentElement.clientWidth+2});`;

console.log('\n=== LEARNING ROUTE — how it LOOKS ===' + (FAST ? '  [FAST subset]' : ''));

(async () => {
const site = await serveRepo();
const browser = await launch();
const U = (x) => `http://127.0.0.1:${site.port}${x}`;
console.log(`  driver: ${browser.version} · bounding boxes, computed colour, real images`);

try {
    const p = await browser.newPage();
    let seed = {};
    await p.route((u) => (/paid-platform\.js/.test(u) ? progressServer({ progress: seed, latencyMs: 30 }) : null));
    await p.onNewDocument(
        `try{localStorage.setItem('currentUser',JSON.stringify({id:'ui',email:'u@t.uz',role:'student'}));}catch(e){}
         window.alert=function(){};window.confirm=function(){return true;};
         window.addEventListener('error',function(e){(window.__errs=window.__errs||[]).push(String(e.message));});`);

    async function cardsReady(page) {
        for (let i = 0; i < 40; i++) {
            if (Number(await page.evaluate(`return document.querySelectorAll('.topic-btn').length;`)) > 0) return true;
            await sleep(250);
        }
        return false;
    }

    /* ---- 1. THE OVERVIEW, ON EVERY SCREEN THE LEARNER USES ---- */
    for (const code of COURSES) {
        const cfg = PAGES[code];
        for (const [w, h, mob] of VIEWPORTS) {
            const N = `${code} ${w}×${h}`;
            const done = Array.from({ length: cfg.total - 1 }, (_, i) => i + 1);
            seed = { [code]: { completedTopics: done, topicComponents: {} } };
            await p.setDevice(w, h, mob);
            await p.goto(U(cfg.paid), { waitMs: 500 });
            await p.evaluate(`try{localStorage.removeItem('__cdp_server_state__');
                localStorage.setItem('${code.toLowerCase()}_progress_ui',
                ${JSON.stringify(JSON.stringify(done))});}catch(e){} return 1;`);
            await p.goto(U(cfg.paid), { waitMs: 3000 });
            await cardsReady(p);
            await p.evaluate(`var c=document.querySelectorAll('.topic-btn'); if(c[0])c[0].click(); return 1;`);
            await sleep(1600);
            const s = JSON.parse(await p.evaluate(LOOK));
            ok(s.route, `${N}: the overview is on screen`);
            if (!s.route) continue;
            eq(`${N}: three stages`, s.cards, 3);
            ok(s.pageLum > 0.5, `${N}: the page is light (${s.pageBg})`);
            ok(s.cardLum > 0.75, `${N}: the cards are light (${s.cardBg})`);
            eq(`${N}: nothing spills out of its card`, s.spill.join(' | '), '');
            eq(`${N}: no paragraph squeezed to a sliver`, s.thin.join(' | '), '');
            eq(`${N}: no clipped text`, s.clipped.join(' | '), '');
            eq(`${N}: text contrast is at least 4.5:1`, s.lowContrast.join(' | '), '');
            eq(`${N}: cards do not overlap`, s.overlap.join(' | '), '');
            eq(`${N}: no sideways scroll`, s.sideways, false);
            eq(`${N}: three calls to action`, s.ctas.length, 3);
            ok(s.ctas.every((b) => b.w >= 88 && b.h >= 44),
                `${N}: every CTA is a real button (${JSON.stringify(s.ctas)})`);
            if (mob) ok(s.bodyFont >= 16, `${N}: body text is at least 16px (${s.bodyFont})`);
        }
    }

    /* ---- 2. A PHONE IN DARK MODE STILL GETS A LIGHT LESSON ---- */
    for (const code of COURSES) {
        const cfg = PAGES[code];
        await p.send('Emulation.setEmulatedMedia',
            { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
        seed = { [code]: { completedTopics: [], topicComponents: {} } };
        await p.setDevice(390, 844, true);
        await p.goto(U(cfg.paid), { waitMs: 3000 });
        await cardsReady(p);
        await p.evaluate(`var c=document.querySelectorAll('.topic-btn'); if(c[0])c[0].click(); return 1;`);
        await sleep(1600);
        const d = JSON.parse(await p.evaluate(LOOK));
        ok(d.route && d.cardLum > 0.75,
            `${code} @dark: the cards stay light (${d.cardBg})`);
        eq(`${code} @dark: text contrast holds`, (d.lowContrast || []).join(' | '), '');
        await p.send('Emulation.setEmulatedMedia', { features: [] });
    }

    /* ---- 3. THE READER: LIGHT, READABLE, AND ITS PICTURES LOAD ---- */
    const readerSpots = FAST ? [['A1', 1], ['A1', 6]]
        : [['A1', 1], ['A1', 2], ['A1', 6], ['A1', 10], ['A2', 3], ['A2', 16],
           ['B1', 1], ['B1', 20], ['B2', 1], ['B2', 16]];
    for (const [code, topic] of readerSpots) {
        for (const [w, h, mob] of (FAST ? [[390, 844, true]] : [[360, 800, true], [1440, 900, false]])) {
            const N = `${code}/${topic} reader ${w}×${h}`;
            await p.setDevice(w, h, mob);
            await p.goto(U(`/paid-courses/${PAGES[code].gpage}.html?course=${code}&topic=${topic}`),
                { waitMs: 3200 });
            const r = JSON.parse(await p.evaluate(READER));
            ok(r.doc, `${N}: the material is on screen`);
            if (!r.doc) continue;
            ok(r.pageLum > 0.75, `${N}: the reader page is light (${r.pageBg})`);
            ok(r.titleLum < 0.3, `${N}: the heading is dark on it`);
            eq(`${N}: reader text contrast is at least 4.5:1`, r.lowContrast.join(' | '), '');
            eq(`${N}: no sideways scroll`, r.sideways, false);
            eq(`${N}: every picture loaded (${r.loaded}/${r.images})`, r.broken.join(' | '), '');
            eq(`${N}: each picture can be opened`, r.figures, r.images);
            eq(`${N}: and offers a button to do it`, r.openBtns, r.images);
        }
    }

    /* ---- 4. THE FULL-SIZE PICTURE ---- */
    {
        await p.setDevice(390, 844, true);
        await p.goto(U('/paid-courses/grammar-a1a2.html?course=A1&topic=6'), { waitMs: 3200 });
        const before = JSON.parse(await p.evaluate(`
            return JSON.stringify({imgs:document.querySelectorAll('.gr-figure img').length,
              open:!!document.querySelector('.gr-lightbox')});`));
        eq('A1/6 carries its scanned table', before.imgs, 1);
        await p.evaluate(`var b=document.querySelector('.gr-figure-open'); if(b)b.click(); return 1;`);
        await sleep(700);
        const open = JSON.parse(await p.evaluate(`
            var lb=document.querySelector('.gr-lightbox');
            var img=lb?lb.querySelector('img'):null;
            return JSON.stringify({shown:!!lb&&!lb.hidden,
              src:img?img.getAttribute('src'):null,
              natural:img?img.naturalWidth:0,
              wide:img?Math.round(img.getBoundingClientRect().width):0,
              scrollLocked:document.documentElement.style.overflow==='hidden',
              closeBtn:!!(lb&&lb.querySelector('[data-gr-lb="close"]')),
              original:!!(lb&&lb.querySelector('[data-gr-lb="original"]'))});`));
        ok(open.shown, 'pressing the picture opens it full size');
        ok(open.natural > 0, `the full-size picture really loaded (naturalWidth ${open.natural})`);
        ok(open.wide >= 390, `it is magnified rather than shrunk (${open.wide}px wide)`);
        ok(open.scrollLocked, 'the page behind it does not scroll');
        ok(open.closeBtn && open.original, 'it offers close and open-original');
        await p.evaluate(`var e=new KeyboardEvent('keydown',{key:'Escape',bubbles:true});
            document.dispatchEvent(e); return 1;`);
        await sleep(500);
        const closed = JSON.parse(await p.evaluate(`
            var lb=document.querySelector('.gr-lightbox');
            return JSON.stringify({hidden:!lb||lb.hidden,
              scrollFree:document.documentElement.style.overflow!=='hidden',
              focus:document.activeElement?(document.activeElement.className||''):''});`));
        ok(closed.hidden, 'Escape closes it');
        ok(closed.scrollFree, 'and gives the page its scrolling back');
        ok(/gr-figure-open|gr-figure/.test(closed.focus) || closed.focus === '',
            `and hands the focus back (${closed.focus})`);
    }

    /* ---- 5. ONE PRESS IS STILL ONE PRESS ---- */
    {
        await p.goto(U(PAGES[COURSES[0]].paid), { waitMs: 2600 });
        const fired = await p.evaluate(`
            var T=window.UzTopicRoute; if(!T) return -1;
            var host=document.createElement('div'); document.body.appendChild(host);
            var n=0, ctx={course:'A1',topicId:1,title:'T',grammar:{},vocabulary:{},exercises:{}};
            var h={onExercises:function(){n++;}};
            T.mount(host,ctx,h); T.mount(host,ctx,h); T.mount(host,ctx,h);
            host.querySelector('[data-uzr-open="exercises"]')
                .dispatchEvent(new MouseEvent('click',{bubbles:true}));
            var out=n; host.remove(); return out;`);
        eq('three mounts and one press still report once', fired, 1);
    }
} catch (e) {
    fail++; failures.push('harness: ' + (e && e.message));
}

console.log('='.repeat(64));
if (fail) {
    console.log(`  ❌ LEARNING ROUTE UI: ${fail} failed, ${pass} passed`);
    failures.slice(0, 40).forEach((f) => console.log('     • ' + f));
} else {
    console.log(`  ✅ LEARNING ROUTE UI: ${pass}/${pass} passed`);
}
console.log('='.repeat(64) + '\n');
await browser.close();
if (site.close) site.close();
process.exit(fail ? 1 : 0);
})();
