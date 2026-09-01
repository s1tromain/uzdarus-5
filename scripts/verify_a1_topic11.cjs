#!/usr/bin/env node
/**
 * verify_a1_topic11.cjs — every exercise in A1 topic 11, audited and driven.
 *
 * REPORTED BY A LEARNER, ON THE LIVE COURSE:
 *   - exercise 1 showed markup inside the sentences:
 *       "Я <em>shug'ullanaman</em> спортом."
 *   - exercise 5 was titled True/False and rendered text boxes; checking it
 *     produced 4/8 with no usable answer key and nothing to read it against.
 *
 * WHAT WAS WRONG. Both were DATA, not the renderer.
 *   1. every prompt in exercise 1 carried the Uzbek cue INSIDE the Russian
 *      sentence, wrapped in <em>. Prompts are escaped — correctly, they must
 *      be, they are content — so the learner read the tag. The cue could not
 *      simply be deleted either: "Я ___ спортом." accepts заниматься,
 *      увлекаться AND интересоваться, so the item would have had no single
 *      right answer. It moved to `hint`, which the shared renderer draws as
 *      its own escaped line.
 *   2. exercise 5 had no `options`, so normaliseGroup made it an input group,
 *      and its answer keys were the characters ✅ and ❌ — untypeable. Its
 *      statements were also unanswerable: grammar judgements with no source
 *      text. It was rebuilt as what its title claimed: a short A1 passage and
 *      eight statements the passage settles, two options each.
 *
 * This suite audits ALL EIGHT exercises statically, then drives every one of
 * them in a real browser: wrong answers, the verdict, "Посмотреть ответы",
 * "Qayta topshirish", a clean retake, and a perfect run that completes the
 * topic under the current rule.
 */
'use strict';

const path = require('path');
const { launch, serveRepo, findChrome } = require('./_cdp_driver.cjs');
const { progressServer } = require('./_cdp_progress_server.cjs');
const H = require('./_a1_page_harness.cjs');
const { execSync } = require('child_process');

const TOPIC = 11;
const EXPECTED_GROUPS = 8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

console.log(`\n=== A1 TOPIC ${TOPIC} — every exercise, audited and driven ===`);

/* ================================================================ *
 * 1. THE DATA. Nothing below can be right if this is wrong.
 * ================================================================ */
const ctx0 = H.makePage({ topicId: TOPIC });
const topic = ((ctx0.courseData || ctx0.window.courseData).topics || [])
    .find((t) => t.id === TOPIC);
ok(!!topic, `topic ${TOPIC} exists`);
const GROUPS = topic ? (ctx0.window.A1Host.groupsOf(topic) || []) : [];
eq(`topic ${TOPIC} offers ${EXPECTED_GROUPS} exercises`, GROUPS.length, EXPECTED_GROUPS);

/* Uzbek verb stems that belong in a hint, never inside a Russian sentence. */
const UZ_IN_RU = /(shug['’]ullan|qiziq|yoqadi|tanlang|to['’]ldiring)/i;
const CYRILLIC = /[А-Яа-яЁё]/;

GROUPS.forEach((g, gi) => {
    const N = `ex${gi + 1}(${g.id})`;
    ok(!!g.title && g.title.trim().length > 3, `${N} has a title`);
    ok(!!g.intro && g.intro.trim().length > 5, `${N} has an instruction`);
    ok((g.items || []).length >= 8, `${N} has at least 8 questions (${(g.items || []).length})`);

    (g.items || []).forEach((it, i) => {
        const at = `${N} q${i + 1}`;
        const q = String(it.q == null ? '' : it.q);
        ok(q.trim().length > 0, `${at} is not empty`);
        ok(!/<[a-z/!][^>]*>/i.test(q), `${at} carries no markup (${q.slice(0, 46)})`);
        ok(!/undefined|\[object Object\]|NaN|null/.test(q), `${at} carries no technical value (${q.slice(0, 46)})`);
        /* A Russian sentence may not contain an Uzbek instruction word. The cue
           belongs in `hint`, where it is a cue and not part of the sentence. */
        ok(!(CYRILLIC.test(q) && UZ_IN_RU.test(q)),
            `${at} keeps Uzbek out of the Russian sentence (${q.slice(0, 52)})`);

        const answers = Array.isArray(it.answer) ? it.answer : [it.answer];
        ok(answers.length > 0 && answers.every((a) => a != null && String(a).trim() !== ''),
            `${at} has an answer`);
        answers.forEach((a) => {
            ok(!/^[✅❌✔✘]+$/.test(String(a).trim()),
                `${at} answer is typable text, not a symbol (${a})`);
            ok(!/<[a-z/!][^>]*>/i.test(String(a)), `${at} answer carries no markup`);
        });

        if (g.type === 'choice') {
            ok(Array.isArray(it.options) && it.options.length >= 2,
                `${at} offers at least two options`);
            const norm = (v) => ctx0.window.UzNormalize
                ? ctx0.window.UzNormalize(v)
                : String(v).toLowerCase().trim();
            const hits = (it.options || []).filter((o) => answers.some((a) => norm(a) === norm(o)));
            eq(`${at} the key matches exactly ONE option`, hits.length, 1);
        }
        if (it.hint != null) {
            ok(!/<[a-z/!][^>]*>/i.test(String(it.hint)), `${at} hint carries no markup`);
        }
    });
});

/* ---- exercise 1: the reported defect, and the answer keys ---- */
{
    const g = GROUPS[0];
    ok(g && g.type === 'choice', 'exercise 1 is a choice exercise');
    const raw = (g.items || []).filter((it) => /<em>|shug|qiziq/i.test(String(it.q)));
    eq('exercise 1: NO prompt contains the Uzbek cue or <em>', raw.length, 0);
    const withHint = (g.items || []).filter((it) => it.hint && String(it.hint).trim());
    eq('exercise 1: every question carries its cue as a hint', withHint.length, (g.items || []).length);
    ok((g.items || []).every((it) => /___|_{3,}/.test(String(it.q))),
        'exercise 1: every sentence shows a blank');
    /* The four sentences the learner reported, with the verb that belongs. */
    const KEYS = [
        ['Я ___ спортом.', 'занимаюсь'],
        ['Он ___ музыкой с детства.', 'увлекается'],
        ['Мы ___ историей.', 'интересуемся'],
        ['Она ___ танцами каждый день.', 'занимается']
    ];
    KEYS.forEach(([q, a]) => {
        const it = (g.items || []).find((x) => String(x.q).trim() === q);
        ok(!!it, `exercise 1: "${q}" is present as a clean Russian sentence`);
        if (it) eq(`exercise 1: "${q}" is keyed to ${a}`, it.answer, a);
    });
}

/* ---- exercise 5: rebuilt, self-contained, two buttons ---- */
{
    const g = GROUPS[4];
    ok(g && g.type === 'choice', 'exercise 5 is a two-option exercise, not a text box');
    ok(!!g.passage && String(g.passage).length > 80,
        'exercise 5 supplies the text its statements are read against');
    eq('exercise 5 has 8 statements', (g.items || []).length, 8);
    const opts = new Set();
    (g.items || []).forEach((it) => (it.options || []).forEach((o) => opts.add(o)));
    eq('exercise 5 offers exactly two labels', opts.size, 2);
    const yes = (g.items || []).filter((it) => /^To/i.test(String(it.answer))).length;
    ok(yes >= 2 && yes <= (g.items || []).length - 2,
        `exercise 5 mixes true and false (${yes} true of 8)`);
    /* Every statement must be settled by the passage — check the nouns it
       turns on actually appear in the text. */
    const text = String(g.passage).replace(/<[^>]+>/g, ' ').toLowerCase();
    ['азиз', 'малика', 'тимур', 'футбол', 'музык', 'пианино', 'истори', 'фильм']
        .forEach((w) => ok(text.indexOf(w) >= 0, `exercise 5: the passage mentions "${w}"`));
}

/* ---- the legacy fallback must agree with the data it renders ----

   The page keeps a hand-written renderer for topic 11, reached only when the
   shared engine fails to mount. Its True/False chips were hard-coded to the
   characters that used to be the answer keys, so once exercise 5 was rebuilt
   with real labels that path would have marked every answer wrong. */
{
    const fs = require('fs');
    const src = fs.readFileSync(path.join(__dirname, '..', 'paid-courses', 'a1-course.html'), 'utf8');
    /* Anchor on the one string unique to topic 11's own render block:
       "EXERCISE 5" and `exercises.exercise5.title` both appear in the
       hand-written renderers of several other topics, and the first
       data-topic11-e5-row is the click binding rather than the markup. */
    const at = src.indexOf('data-topic11-e5-option="${index}"');
    const block = at > 0 ? src.slice(at - 1800, at + 600) : '';
    ok(block.length > 0, 'the legacy topic 11 renderer is present');
    ok(/item\.options/.test(block), 'the legacy chips read their labels from the item');
    ok(!/data-value="✅"|data-value="❌"/.test(block),
        'and no answer label is hard-coded into the markup');
    ok(/exercises\.exercise5\.passage/.test(block),
        'the legacy path also shows the passage');
}

/* ================================================================ *
 * 2. THE BROWSER. Every exercise, driven.
 * ================================================================ */
const ANSWER = (g, mode) => `
 var G=${JSON.stringify({ id: g.id, items: (g.items || []).map((i) => ({
     answer: Array.isArray(i.answer) ? i.answer[0] : i.answer,
     options: i.options || null })) })};
 var MODE=${JSON.stringify(mode)};
 var root=document.querySelector('.uz-body'); if(!root) return 'no root';
 function n(v){return window.UzNormalize?window.UzNormalize(v):String(v==null?'':v).toLowerCase().trim();}
 var miss=[];
 G.items.forEach(function(item,i){
  var key=G.id+'-'+i;
  var want=String(item.answer);
  var row=root.querySelector('[data-b2h-row="'+key+'"]');
  if(row){
   var bs=row.querySelectorAll('.b2h-opt'), pick=null;
   for(var b=0;b<bs.length;b++){
    var same=n(bs[b].getAttribute('data-value'))===n(want);
    if(MODE==='right'?same:!same){pick=bs[b];break;}
   }
   if(!pick){miss.push(key);return;}
   pick.click(); return;
  }
  var inp=root.querySelector('[data-b2h-input="'+key+'"]');
  if(inp){
   inp.focus(); inp.value = (MODE==='right') ? want : 'zzz';
   inp.dispatchEvent(new Event('input',{bubbles:true}));
   inp.dispatchEvent(new Event('change',{bubbles:true})); inp.blur(); return;
  }
  miss.push(key);
 });
 return miss.length ? ('MISS '+miss.length+' '+miss.slice(0,2).join(',')) : 'ok';`;

const SCREEN = `
 var body=document.querySelector('.uz-body');
 var v=body?body.querySelector('.uz-verdict'):null;
 var foot=document.querySelector('.uz-foot');
 return {
   head:(document.querySelector('.uz-head')||{textContent:''}).textContent.trim().slice(0,60),
   text: body?body.textContent.replace(/\\s+/g,' ').trim():'',
   verdict: v?String(v.className):null,
   score: v?((v.querySelector('.uz-verdict-score')||{textContent:''}).textContent.replace(/\\s+/g,' ').trim()):null,
   answers: v?Array.prototype.map.call(v.querySelectorAll('.uz-answers li'),function(li){
       var r=li.querySelector('.uz-right'); var y=li.querySelector('.uz-your');
       return { line:(li.textContent||'').replace(/\\s+/g,' ').trim().slice(0,70),
                right:r?r.textContent.trim():null, your:y?y.textContent.trim():null };}):[],
   passage: body?!!body.querySelector('.b2h-passage'):false,
   hints: body?body.querySelectorAll('.b2h-hint').length:0,
   inputs: body?body.querySelectorAll('[data-b2h-input]').length:0,
   opts: body?body.querySelectorAll('.b2h-opt').length:0,
   picked: body?body.querySelectorAll('.b2h-opt.is-on,.b2h-opt.selected,.b2h-opt[aria-pressed="true"]').length:0,
   filled: body?Array.prototype.filter.call(body.querySelectorAll('[data-b2h-input]'),
       function(i){return String(i.value||'').trim()!=='';}).length:0,
   buttons: foot?Array.prototype.map.call(foot.querySelectorAll('button'),
       function(b){return (b.textContent||'').trim();}):[] };`;

const pressFoot = (label) => `
 var bs=Array.prototype.slice.call(document.querySelectorAll('.uz-foot button'));
 var b=bs.filter(function(x){return new RegExp(${JSON.stringify(label)},'i').test(x.textContent||'');})[0];
 if(!b) return 'missing:'+bs.map(function(x){return (x.textContent||'').trim();}).join('|');
 b.click(); return 'clicked';`;

/* The dialog offers "Bekor qilish" (cancel) and "Davom etish" (go on). Match
   the one that is NOT a cancel — a /ko/ pattern hits "BeKOr qilish". */
const CONFIRM = `
 var a=document.querySelector('.uz-ask'); if(!a) return 'no dialog';
 var b=Array.prototype.slice.call(a.querySelectorAll('button'))
   .filter(function(x){return !/bekor|отмен|cancel|yo['’]q|нет/i.test(x.textContent||'');})[0];
 if(b){b.click();return 'confirmed';} return 'only cancel';`;

(async () => {

if (!findChrome()) {
    console.log('  ❌ A1 TOPIC 11: BLOCKER — no Chrome/Chromium binary found.\n');
    process.exit(1);
}

const site = await serveRepo();
const browser = await launch();
console.log(`  driver: ${browser.version} · real clicks, real typing`);

try {
    const p = await browser.newPage();
    let seed = { A1: { completedTopics: [1,2,3,4,5,6,7,8,9,10], topicComponents: {} } };
    await p.route((u) => (/paid-platform\.js/.test(u) ? progressServer({ progress: seed, latencyMs: 50 }) : null));
    await p.onNewDocument(
        `try{localStorage.setItem('currentUser',JSON.stringify({id:'t11',email:'t@t.uz',role:'student'}));}catch(e){}`);
    const U = (x) => `http://127.0.0.1:${site.port}${x}`;

    async function openPractice(w, h) {
        await p.goto(U('/paid-courses/a1-course.html'), { waitMs: 400 });
        await p.evaluate(`try{ localStorage.clear();
            localStorage.setItem('currentUser',JSON.stringify({id:'t11',email:'t@t.uz',role:'student'}));
            }catch(e){} return 1;`);
        await p.setDevice(w, h, w < 900);
        await p.goto(U('/paid-courses/a1-course.html'), { waitMs: 2800 });
        await p.evaluate(`var cards=Array.prototype.slice.call(document.querySelectorAll('.topic-btn'));
            if(cards[${TOPIC} - 1]) cards[${TOPIC} - 1].click(); return 1;`);
        await sleep(1800);
        const started = await p.evaluate(
            `var b=document.querySelector('.uz-practice-btn'); if(b){b.click();return 1;} return 0;`);
        await sleep(1700);
        return started === 1;
    }

    /* ---------- the full drive, on the phone the learner used ---------- */
    {
        const deadline = Date.now() + 900000;
        ok(await openPractice(360, 800), 'A1 topic 11 opens its exercises on a 360px phone');

        for (let gi = 0; gi < GROUPS.length; gi++) {
            const g = GROUPS[gi];
            const N = `ex${gi + 1}(${g.id})`;
            if (Date.now() > deadline) { ok(false, `${N} — ran out of time`); break; }
            console.log(`    ${N}: ${g.title}`);

            let s = await p.evaluate(SCREEN);
            /* nothing technical on screen, ever */
            ok(!/<em>|<\/em>|undefined|\[object Object\]/.test(s.text),
                `${N} — the question area shows no markup or technical value`);
            ok(s.opts > 0 || s.inputs > 0, `${N} — it offers controls (${s.opts} options, ${s.inputs} boxes)`);
            if (g.type === 'choice') {
                ok(s.opts > 0 && s.inputs === 0,
                    `${N} — a choice exercise offers buttons and NO text boxes (${s.opts}/${s.inputs})`);
            }
            if (g.id === 'exercise1') {
                ok(s.hints >= 1, `${N} — the Uzbek cue is shown as a hint (${s.hints})`);
                ok(!/shug|qiziq/i.test(s.text.replace(/[^]*?(?=Я |Он |Мы |Она )/, '')) || s.hints > 0,
                    `${N} — and not inside the sentence`);
            }
            if (g.id === 'exercise5') {
                ok(s.passage, `${N} — the text to read is on screen`);
                ok(/Азиз/.test(s.text), `${N} — and it is the passage the statements ask about`);
            }

            /* ---- WRONG ON PURPOSE ---- */
            const bad = await p.evaluate(ANSWER(g, 'wrong'));
            ok(String(bad).indexOf('MISS') !== 0, `${N} — a wrong answer can be given (${bad})`);
            await sleep(250);
            await p.evaluate(pressFoot('tekshirish|Проверить'));
            await sleep(900);
            s = await p.evaluate(SCREEN);
            ok(!!s.verdict, `${N} — checking produces a verdict`);
            ok(/\d+\s*\/\s*\d+/.test(String(s.score)), `${N} — with a score (${s.score})`);
            ok(!/^0 \/ 0/.test(String(s.score)), `${N} — that is not 0/0 (${s.score})`);

            /* the answers are either shown, or shown after "Посмотреть ответы" */
            if (!s.answers.length) {
                const rv = await p.evaluate(pressFoot('Посмотреть ответы'));
                if (rv === 'clicked') { await sleep(500); await p.evaluate(CONFIRM); await sleep(700); }
                s = await p.evaluate(SCREEN);
            }
            ok(s.answers.length > 0, `${N} — the mistakes are listed (${s.answers.length})`);
            ok(s.answers.every((a) => a.right && a.right.trim()),
                `${N} — each mistake shows the correct answer (${JSON.stringify(s.answers[0])})`);
            ok(s.answers.every((a) => !/[✅❌]/.test(a.right)),
                `${N} — and it is readable text, not a symbol`);
            if (g.id === 'exercise5') {
                ok(s.answers.every((a) => /To|Noto/i.test(String(a.right))),
                    `${N} — the reference answer is To'g'ri / Noto'g'ri (${s.answers[0] && s.answers[0].right})`);
            }

            /* ---- RETAKE MUST FORGET EVERYTHING ---- */
            /* After a reveal the engine offers "Mashqni qayta boshlash" instead of
               "Qayta topshirish" — looking at the answers is deliberately not a
               pass, so the whole exercise is retaken. Both are the reset. */
            const rt = await p.evaluate(pressFoot('Qayta topshirish|Qayta ishlash|qayta boshlash|заново'));
            ok(rt === 'clicked', `${N} — a retake is offered (${rt})`);
            await sleep(900);
            s = await p.evaluate(SCREEN);
            eq(`${N} — the retake clears the verdict`, s.verdict, null);
            eq(`${N} — and every text box`, s.filled, 0);
            eq(`${N} — and every choice`, s.picked, 0);

            /* ---- NOW PERFECTLY ---- */
            const good = await p.evaluate(ANSWER(g, 'right'));
            eq(`${N} — every question offers its correct answer`, String(good), 'ok');
            await sleep(250);
            await p.evaluate(pressFoot('tekshirish|Проверить'));
            await sleep(900);
            s = await p.evaluate(SCREEN);
            ok(/uz-verdict[^"]*\bok\b/.test(String(s.verdict)),
                `${N} — a perfect attempt reads as correct (${s.verdict})`);
            const m = String(s.score).match(/(\d+)\s*\/\s*(\d+)/);
            ok(m && m[1] === m[2], `${N} — scored ${s.score}`);
            eq(`${N} — with ${(g.items || []).length} questions counted`,
                m ? Number(m[2]) : null, (g.items || []).length);
            eq(`${N} — and nothing left in the mistake list`, s.answers.length, 0);

            /* ---- ON TO THE NEXT ---- */
            const nx = await p.evaluate(pressFoot('Keyingi|Следующее|Завершить|Yakunla'));
            ok(nx === 'clicked', `${N} — the way forward is offered (${nx})`);
            await sleep(gi === GROUPS.length - 1 ? 3000 : 1100);
        }

        /* ---- THE TOPIC COMPLETES UNDER THE CURRENT RULE ---- */
        const acts = await p.evaluate(`var b=document.querySelector('.uz-body');
            var n=b?b.querySelector('.uztc-note'):null;
            return { acts: b?Array.prototype.map.call(b.querySelectorAll('[data-uztc]'),function(x){
                return x.getAttribute('data-uztc')+':'+(x.textContent||'').trim();}):[],
              note: n?(n.textContent||'').trim():null };`);
        ok(acts.acts.some((a) => a.indexOf('finish:') === 0),
            `topic 11 — a perfect run offers the completion button (${JSON.stringify(acts.acts)})`);
        await p.evaluate(`var b=document.querySelector('.uz-body [data-uztc="finish"]'); if(b)b.click(); return 1;`);
        await sleep(4200);
        const srv = await p.evaluate(`
            var s=window.__serverState?window.__serverState():null;
            var c=(s&&s.A1)||{completedTopics:[],topicComponents:{}};
            var row=c.topicComponents[${TOPIC}]||{};
            var cards=Array.prototype.slice.call(document.querySelectorAll('.topic-btn'));
            return { done:c.completedTopics.indexOf(${TOPIC})>=0,
                     vocabulary:row.vocabularyCompleted===true,
                     nextLocked:cards[${TOPIC}]?/locked/.test(String(cards[${TOPIC}].className)):null };`);
        eq('topic 11 completes at 100%', srv.done, true);
        eq('topic 11 completes WITHOUT the vocabulary deck', srv.vocabulary, false);
        eq('topic 12 unlocks', srv.nextLocked, false);
    }

    /* ---------- it renders on the other two screens too ---------- */
    for (const [w, h, name] of [[390, 844, 'iPhone'], [1440, 900, 'desktop']]) {
        ok(await openPractice(w, h), `A1 topic 11 opens on ${name}`);
        const s = await p.evaluate(SCREEN);
        ok(!/<em>|undefined|\[object Object\]/.test(s.text), `${name} — no markup on screen`);
        const layout = await p.evaluate(`
            var body=document.querySelector('.uz-body'); var foot=document.querySelector('.uz-foot');
            var cut=0, overlap=null, btnHidden=0;
            if(body&&foot){
              var br=body.getBoundingClientRect(), fr=foot.getBoundingClientRect();
              overlap = Math.max(0, Math.round(br.bottom - fr.top));
              Array.prototype.forEach.call(body.querySelectorAll('.b2h-item,.b2h-opt'),function(el){
                if(el.scrollWidth > el.clientWidth + 2) cut++;
              });
              Array.prototype.forEach.call(foot.querySelectorAll('button'),function(b){
                var r=b.getBoundingClientRect();
                if(r.width<10||r.height<10||r.bottom>window.innerHeight+1) btnHidden++;
              });
            }
            return { cut: cut, overlap: overlap, btnHidden: btnHidden,
              sideways: document.documentElement.scrollWidth > window.innerWidth + 2,
              narrow: window.matchMedia('(max-width: 640px)').matches };`);
        eq(`${name} — the scrolling body never runs under the footer`, layout.overlap, 0);
        eq(`${name} — every footer button is fully on screen`, layout.btnHidden, 0);
        eq(`${name} — no card clips its own text`, layout.cut, 0);
        eq(`${name} — the page does not scroll sideways`, layout.sideways, false);
        if (w < 900) eq(`${name} — really is a phone viewport`, layout.narrow, true);
    }
} finally {
    try { await browser.close(); } catch (e) {}
    try { await site.close(); } catch (e) {}
    try { execSync('pkill -f "Google Chrome for Testing" 2>/dev/null || true'); } catch (e) {}
}

console.log('  all 8 exercises: readable, answerable, marked, revealable, retakeable');
console.log('='.repeat(64));
if (fail) {
    console.log(`  ❌ A1 TOPIC 11: ${fail} failed, ${pass} passed`);
    failures.slice(0, 40).forEach((f) => console.log('     • ' + f));
    console.log('='.repeat(64) + '\n');
    process.exit(1);
}
console.log(`  ✅ A1 TOPIC 11: ${pass}/${pass} passed`);
console.log('='.repeat(64) + '\n');

})().catch((e) => {
    console.error('A1 TOPIC 11 HARNESS ERROR', e && e.message);
    try { execSync('pkill -f "Google Chrome for Testing" 2>/dev/null || true'); } catch (x) {}
    process.exit(1);
});
