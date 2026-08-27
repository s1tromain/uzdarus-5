#!/usr/bin/env node
/**
 * verify_b2_topic13.cjs — B2 Lesson 13 «Предлоги и управление».
 *
 * Eight grammar repairs and five exercise repairs are pinned here:
 *
 *  1. «благодаря» is taught as a TENDENCY (favourable / enabling cause), with
 *     «из-за» for an unwanted cause and «в связи с» for a neutral formal one —
 *     never as an absolute "благодаря can only ever be positive" rule.
 *  2. «несмотря на» (written together, concessive preposition) is distinguished
 *     from «не смотря» (the gerund, literally "without looking").
 *  3. The source's «решения вопрос» is malformed. The lesson ships the repaired
 *     «решения вопроса», teaching в связи с + творительный AND решение + родительный.
 *  4. «согласно» + дательный, with the «согласен с договором» confusion guard.
 *     «согласно с договором» is never taught as the target construction.
 *  5. «в соответствии с» + творительный is TAUGHT, not just listed in the
 *     vocabulary as the source left it.
 *  6. A semantic comparison table explains WHY each construction is chosen.
 *  7. The source's four-construction sentence is shown only as a thing to
 *     AVOID; a natural one/two-construction model is recommended instead.
 *  8. Adjective+noun transformations are given for all five constructions.
 *
 *  Ex1 #2/#6/#10 had case cues that made the intended answer ungrammatical.
 *  Ex3 #9 was not a "find the error" row at all — the source sentence was
 *  already correct. Ex5's matching set was internally impossible and is
 *  replaced by a case-identification exercise built from the same vocabulary.
 *  Ex7 #2/#3/#9 had nothing to transform, or changed the meaning.
 *  Ex4/6/8/9/10 are genuinely productive and stay OPEN.
 *
 *  The audio truth map was NOT supplied by the source. It was derived from the
 *  real MP3 by two independent local whisper.cpp decodes (greedy and
 *  beam-search-5) which agreed 100%, and is pinned below. No transcript ships.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const vc = new VirtualConsole();
vc.on('jsdomError', () => {});
const w = new JSDOM('<body></body>', { runScripts: 'outside-only', virtualConsole: vc }).window;
['shared-normalizer.js', 'sentence-builder.js', 'course-exercise-ui.js',
 'b2-topics.js', 'b2-lesson-data.js'].forEach(f =>
    w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const UI = w.UzExerciseUI;

console.log('\n=== B2 TOPIC 13 — Предлоги и управление ===');

/* ------------------------------------------------------------ data presence */
const all = w.B2_LESSON_DATA.topics;
for (let i = 1; i <= 12; i++) ok(!!all.find(t => t.id === i), `topic ${i} still present`);
const t13 = all.find(t => t.id === 13);
ok(!!t13, 'topic 13 exists');
if (!t13) { console.log('missing lesson 13'); process.exit(1); }
eq('topic 13 appears exactly once', all.filter(t => t.id === 13).length, 1);
eq('topic 13 title', t13.title, 'Предлоги и управление');
ok(t13.isLocked === false && t13.isSubscriptionLocked === false, 'topic 13 ships unlocked');

const syll = w.B2_TOPICS;
eq('B2 syllabus still has 16 topics', syll.length, 16);
eq('syllabus and lesson agree on the topic 13 title',
    (syll.find(t => t.id === 13) || {}).title, t13.title);
eq('topic 14 keeps its canonical title',
    (syll.find(t => t.id === 14) || {}).title, 'Средства аргументации');

const ids = all.map(t => t.id).sort((a, b) => a - b);
const frontier = ids[ids.length - 1];
ok(ids.join(',') === Array.from({ length: frontier }, (_, i) => i + 1).join(','),
    `authored lesson ids are contiguous 1..${frontier}`);
ok(frontier >= 13, `topic 13 is authored (frontier ${frontier})`);
/* FINAL-FRONTIER SAFE. While canonical topics remain unauthored, the one just
   past the authored range must have no payload so its coming-soon shell stays
   on screen. Once every canonical topic is authored there is no "next" topic
   at all, and demanding one would assert a phantom Topic 17. */
if (frontier < syll.length) {
    ok(!all.find(t => t.id === frontier + 1),
        `topic ${frontier + 1} has no lesson payload — it stays "coming soon"`);
} else {
    eq('the authored frontier is the canonical end of the course', frontier, syll.length);
    ok(!all.find(t => t.id === frontier + 1),
        `there is no topic ${frontier + 1} — B2 ends at ${syll.length}`);
}

/* ---------------------------------------------------------------- grammar */
const G = t13.grammar || '';
const gdoc = new JSDOM('<body><div id="g"></div></body>').window.document;
gdoc.getElementById('g').innerHTML = G;
const GT = gdoc.getElementById('g').textContent.replace(/\s+/g, ' ');

ok(G.length > 8000, `grammar is a full lesson (${G.length} chars)`);
ok(!/\$\{/.test(G), 'no template placeholder leaked');
for (let n = 1; n <= 10; n++) {
    ok(G.indexOf('<h4>' + n + '. ') !== -1, `grammar block ${n} is numbered`);
}
eq('10 numbered blocks + 1 summary heading', (G.match(/<h4/g) || []).length, 11);
ok(/b2g-check/.test(G), 'the closing algorithm uses the B2 check card');

/* --- the four source constructions and their cases must all survive --- */
[['благодаря', 'дательный падеж', 'кому? чему?'],
 ['несмотря на', 'винительный падеж', 'кого? что?'],
 ['в связи с', 'творительный падеж', 'кем? чем?'],
 ['согласно', 'дательный падеж', 'кому? чему?']
].forEach(([prep, cse, q]) => {
    ok(GT.indexOf(prep) !== -1, `grammar teaches «${prep}»`);
    ok(GT.indexOf(cse) !== -1, `grammar names the ${cse}`);
    ok(GT.indexOf(q) !== -1, `grammar gives the question «${q}»`);
});

[['благодаря model', 'Благодаря опыту сотрудник быстро решил проблему.'],
 ['благодаря support', 'Благодаря поддержке коллег проект был успешно завершён.'],
 ['благодаря tech', 'Благодаря новым технологиям компания сократила расходы.'],
 ['несмотря на difficulties', 'Несмотря на трудности, работа продолжилась.'],
 ['несмотря на weather', 'Несмотря на плохую погоду, сотрудники приехали на встречу.'],
 ['несмотря на cost', 'Несмотря на высокую стоимость, услуга пользуется спросом.'],
 ['в связи с schedule', 'В связи с изменением графика встреча переносится.'],
 ['в связи с repair', 'В связи с ремонтом офис будет закрыт.'],
 ['согласно law', 'Согласно закону работодатель обязан соблюдать права сотрудников.'],
 ['согласно contract', 'Согласно договору оплата производится в конце месяца.'],
 ['согласно plan', 'Согласно плану проект должен быть завершён в декабре.']
].forEach(([label, needle]) => ok(GT.indexOf(needle) !== -1, `grammar keeps: ${label}`));

/* --- REPAIR 1: благодаря is a TENDENCY, not an absolute positivity rule --- */
{
    const b2 = G.slice(G.indexOf('<h4>2. '), G.indexOf('<h4>3. '));
    const b2t = b2.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    ok(b2t.indexOf('из-за') !== -1, 'block 2 contrasts благодаря with из-за');
    ok(b2t.indexOf('в связи с') !== -1, 'block 2 also offers в связи с as the neutral formal option');
    ok(/Из-за технических проблем система не работает\./.test(b2t),
        'block 2 shows a real из-за example for an unwanted cause');
    ok(/tendensiya/i.test(b2t), 'block 2 calls the preference a tendency');
    ok(/temir qoida emas|qat’iy cheklov yo‘q/.test(b2t),
        'block 2 states outright that this is NOT an absolute rule');
    ok(b2.indexOf('благодаря хорошую работу') !== -1 && b2.indexOf('благодаря хорошей работе') !== -1,
        'block 2 keeps the ❌/✅ case pair');
}

/* --- REPAIR 2: несмотря на vs не смотря --- */
{
    const b3 = G.slice(G.indexOf('<h4>3. '), G.indexOf('<h4>4. '));
    const b3t = b3.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    ok(b3t.indexOf('Он шёл, не смотря по сторонам.') !== -1,
        'block 3 gives the literal «не смотря» gerund example');
    ok(/qo‘shib yoziladi/.test(b3t), 'block 3 says несмотря на is written together');
    ok(/ajratib yoziladi/.test(b3t), 'block 3 says не смотря is written apart');
    ok(/ravishdosh/.test(b3t), 'block 3 names «не смотря» as a gerund');
    /* and it must not balloon into a gerund lesson */
    ok(b3.length < 2200, `the spelling note stays concise (${b3.length} chars)`);
}

/* --- REPAIR 3: «решения вопроса», never the source's «решения вопрос» --- */
{
    ok(GT.indexOf('В связи с необходимостью срочного решения вопроса совещание перенесли на утро.') !== -1,
        'the repaired в связи с model sentence is taught');
    /* «решения вопрос» may appear ONLY as an explicitly marked ❌ form; it must
       never be the taught model. Both places that show it are ❌ columns. */
    const badOccurrences = GT.split('решения вопрос').length - 1
        - (GT.split('решения вопроса').length - 1);
    eq('«решения вопрос» appears only in the two ❌ slots', badOccurrences, 2);
    ok(GT.indexOf('❌ решения вопрос ·') !== -1 || /❌[^✅]{0,40}решения вопрос/.test(GT),
        'block 4 marks «решения вопрос» with ❌');
    ok(!/✅[^❌]{0,30}решения вопрос(?!а)/.test(GT),
        'the malformed wording is never presented as the ✅ form');
    const b4 = G.slice(G.indexOf('<h4>4. '), G.indexOf('<h4>5. '));
    const b4t = b4.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    ok(b4t.indexOf('необходимостью') !== -1, 'block 4 shows в связи с governing творительный');
    ok(b4t.indexOf('родительный') !== -1, 'block 4 names the родительный inside the noun phrase');
    ok(b4t.indexOf('решения вопроса') !== -1, 'block 4 pins «решения вопроса»');
    ok(/❌\s*решения вопрос\b/.test(b4t) || b4t.indexOf('решения вопрос ·') !== -1
        || /решения вопрос\s*·/.test(b4t),
        'block 4 shows «решения вопрос» explicitly as the ❌ form');
}

/* --- REPAIR 4: согласно + дательный, and the согласен-с confusion guard --- */
{
    const b5 = G.slice(G.indexOf('<h4>5. '), G.indexOf('<h4>6. '));
    const b5t = b5.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    /* A negative control flipped ❌ to ✅ on «согласно закона» and this block
       stayed green, because it only checked the string was PRESENT. Presence is
       not the property that matters — POLARITY is. The ❌/✅ segments are now
       read separately, so a wrong form marked correct fails. */
    const bare = b5.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
    const seg = bare.split(/(?=[❌✅])/).map(x => x.trim()).filter(Boolean);
    const wrongMarked = seg.filter(x => x[0] === '❌').join(' | ');
    const rightMarked = seg.filter(x => x[0] === '✅').join(' | ');
    ok(wrongMarked.indexOf('согласно закона') !== -1,
        'block 5 marks «согласно закона» with ❌');
    ok(wrongMarked.indexOf('согласно договором') !== -1,
        'block 5 marks «согласно договором» with ❌');
    ok(rightMarked.indexOf('согласно закону') !== -1,
        'block 5 marks «согласно закону» with ✅');
    ok(rightMarked.indexOf('согласно договору') !== -1,
        'block 5 marks «согласно договору» with ✅');
    ok(rightMarked.indexOf('согласно закона') === -1,
        'the genitive «согласно закона» is never marked correct');
    ok(rightMarked.indexOf('согласно договором') === -1,
        'the instrumental «согласно договором» is never marked correct');
    ok(wrongMarked.indexOf('согласно закону') === -1,
        'the correct dative «согласно закону» is never marked wrong');
    ok(b5t.indexOf('согласен с договором') !== -1, 'block 5 contrasts «согласен с договором»');
    ok(b5t.indexOf('согласно договору') !== -1, 'block 5 keeps «согласно договору» as the target');
    ok(/qisqa sifat/.test(b5t), 'block 5 explains согласен as a short adjective, a different structure');
    ok(GT.indexOf('согласно с договором') === -1
        || /deb yozmang|yozmang/.test(b5t),
        '«согласно с договором» is never presented as the target construction');
}

/* --- REPAIR 5: в соответствии с is TAUGHT, not merely listed --- */
{
    ok(G.indexOf('<h4>6. ') !== -1, 'в соответствии с gets its own numbered block');
    const b6 = G.slice(G.indexOf('<h4>6. '), G.indexOf('<h4>7. '));
    const b6t = b6.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    ok(b6t.indexOf('в соответствии с') !== -1 || b6t.indexOf('В соответствии с') !== -1,
        'block 6 teaches the construction itself');
    ok(b6t.indexOf('творительный') !== -1, 'block 6 names its case as творительный');
    ok(b6t.indexOf('В соответствии с законом работодатель обязан соблюдать права сотрудников.') !== -1,
        'block 6 gives the law example');
    ok(b6t.indexOf('В соответствии с требованиями документы необходимо обновить.') !== -1,
        'block 6 gives the requirements example');
    ok(b6t.indexOf('Согласно закону') !== -1, 'block 6 contrasts it with согласно');
    ok(/rasmiy va kanselyar|kanselyar/.test(b6t),
        'block 6 marks в соответствии с as the more bureaucratic option');
    ok(/har qanday.{0,80}o‘rnini bosa oladi deb hisoblamang|o‘rnini bosa oladi deb hisoblamang/.test(b6t),
        'block 6 denies that the two are freely interchangeable everywhere');
}

/* --- REPAIR 6: the semantic choice table covers all five constructions --- */
{
    const b7 = G.slice(G.indexOf('<h4>7. '), G.indexOf('<h4>8. '));
    ['благодаря', 'несмотря на', 'в связи с', 'согласно', 'в соответствии с']
        .forEach(p => ok(b7.indexOf(p) !== -1, `the choice table lists «${p}»`));
    ['Д.п.', 'В.п.', 'Т.п.'].forEach(c =>
        ok(b7.indexOf(c) !== -1, `the choice table names the ${c} case`));
    ok(/b2g-chips/.test(b7), 'the choice block ends with a quick-recall chip row');
    ok(b7.indexOf('из-за') !== -1, 'the chip row keeps the из-за contrast');
}

/* --- REPAIR 7: overloading is shown as a fault, never recommended --- */
{
    const b9 = G.slice(G.indexOf('<h4>9. '), G.indexOf('<h4>10. '));
    const b9t = b9.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    ok(b9.indexOf('b2g-warn') !== -1, 'the overload example lives in a warning card');
    ok(b9t.indexOf('Согласно новому плану, несмотря на экономические трудности, благодаря поддержке партнёров, проект продолжается в связи с необходимостью его завершения.') !== -1,
        'the source’s four-construction sentence appears — as the thing to avoid');
    ok(/yomon uslub/.test(b9t), 'it is labelled bad style');
    ok(/❌/.test(b9t), 'it carries the ❌ marker');
    ok(b9t.indexOf('Согласно новому плану, проект продолжается несмотря на экономические трудности.') !== -1,
        'a natural two-construction model is recommended instead');
    ok(/ikki gapga bo‘ling/.test(b9t), 'and the lesson tells the learner to split the sentence');
}

/* --- REPAIR 8: adjective + noun transformations for all five --- */
{
    const b8 = G.slice(G.indexOf('<h4>8. '), G.indexOf('<h4>9. '));
    const b8t = b8.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
    [['хорошая подготовка', 'благодаря хорошей подготовке'],
     ['новые технологии', 'благодаря новым технологиям'],
     ['сложная ситуация', 'несмотря на сложную ситуацию'],
     ['плохая погода', 'несмотря на плохую погоду'],
     ['экономические трудности', 'несмотря на экономические трудности'],
     ['изменение графика', 'в связи с изменением графика'],
     ['ремонт офиса', 'в связи с ремонтом офиса'],
     ['технические проблемы', 'в связи с техническими проблемами'],
     ['новый закон', 'согласно новому закону'],
     ['утверждённый план', 'согласно утверждённому плану'],
     ['новые требования', 'в соответствии с новыми требованиями']
    ].forEach(([from, to]) => {
        ok(b8t.indexOf(from) !== -1, `transformation table keeps the base form «${from}»`);
        ok(b8t.indexOf(to) !== -1, `transformation table gives «${to}»`);
    });
}

/* --- typical-mistake table --- */
{
    const b10 = G.slice(G.indexOf('<h4>10. '));
    const b10t = b10.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
    ['благодаря хорошую подготовку', 'несмотря на сложной ситуации',
     'в связи с изменение графика', 'решения вопрос'
    ].forEach(bad => ok(b10t.indexOf(bad) !== -1, `the mistake table shows ❌ «${bad}»`));
    ok(/Itogiy algoritm/.test(b10), 'the closing algorithm is present');
    ok((b10.match(/<li>/g) || []).length >= 6, 'the algorithm has at least six steps');
}

/* --- MARKUP: raw well-formedness (the browser repairs, so read the raw string) */
{
    const VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1,
                   link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1 };
    const stack = [];
    let pDepth = 0, stray = null, nested = null, unopened = null, order = null;
    const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)(?:\s[^>]*)?>/g;
    let m;
    while ((m = re.exec(G)) !== null) {
        const closing = m[1] === '/', tag = m[2].toLowerCase();
        if (VOID[tag]) continue;
        if (tag === 'p') {
            if (closing) { if (pDepth === 0) { if (stray === null) stray = m.index; } else pDepth--; }
            else { if (pDepth > 0 && nested === null) nested = m.index; pDepth++; }
        }
        if (closing) {
            if (!stack.length) { if (unopened === null) unopened = tag; }
            else if (stack[stack.length - 1] !== tag) {
                if (order === null) order = `<${stack[stack.length - 1]}> closed by </${tag}>`;
            } else stack.pop();
        } else stack.push(tag);
    }
    ok(stray === null, `topic 13 grammar never closes a paragraph it did not open${stray === null ? '' : ` (at ${stray})`}`);
    ok(nested === null, 'topic 13 grammar never nests <p> inside <p>');
    eq('topic 13 grammar closes every paragraph it opens', pDepth, 0);
    ok(unopened === null, `topic 13 grammar has no unopened closing tag${unopened === null ? '' : ` (</${unopened}>)`}`);
    ok(order === null, `topic 13 grammar closes its tags in order${order === null ? '' : ` (${order})`}`);
    eq('topic 13 grammar leaves no tag unclosed', stack.length, 0);
    ['p', 'div', 'table', 'tr', 'th', 'td', 'h4', 'b', 'ul', 'li', 'span', 'i'].forEach(t => {
        const o = (G.match(new RegExp('<' + t + '(?=[ >])', 'g')) || []).length;
        const c = (G.match(new RegExp('</' + t + '>', 'g')) || []).length;
        if (o || c) eq(`topic 13 grammar balances <${t}>`, c, o);
    });
}

{
    const tables = [...gdoc.querySelectorAll('table.b2g-t')];
    eq('grammar renders its 12 b2g-t tables', tables.length, 12);
    let wide = 0, headless = 0;
    tables.forEach(tb => {
        [...tb.querySelectorAll('tr')].forEach(tr => { if (tr.children.length !== 2) wide++; });
        if (!tb.querySelector('th')) headless++;
    });
    eq('every grammar table row has exactly 2 cells', wide, 0);
    eq('every grammar table has a header row', headless, 0);
}

/* -------------------------------------------------------------- exercises */
const ex = t13.exercises || [];
const byId = {};
ex.forEach(g => { byId[g.id] = g; });
const grp = id => byId[id] || { items: [] };
const items = id => (byId[id] && byId[id].items) || [];
const at = (id, i) => items(id)[i] || {};

eq('11 exercise groups', ex.length, 11);
eq('group ids follow the B2 convention', ex.map(g => g.id).join(','),
    'ex1,ex2,ex3,ex4,ex5,ex6,ex7,ex8,ex9,ex10,audio1');
ex.forEach(g => {
    eq(`${g.id} has 10 items`, g.items.length, 10);
    ok(!!g.title && /mashq/.test(g.title), `${g.id} has an Uzbek task title`);
    ok(!!g.intro && g.intro.length > 20, `${g.id} has a real instruction`);
    ok(g.id === 'audio1' || !!g.namuna, `${g.id} shows a worked model`);
    ok(g.showTask === true, `${g.id} shows its task text`);
});
eq('110 items in total', ex.reduce((n, g) => n + g.items.length, 0), 110);

/* -------------------------------------------------------------- audio
 * The source supplied ten Правда/Ложь statements but NO truth key. The keys
 * below were derived from the REAL recording by two independent local
 * whisper.cpp decodes (greedy and beam-search-5) that agreed 100%. Nothing
 * here was inferred from what "sounds plausible", and no transcript ships. */
{
    const audio = ex.filter(g => g.audioSrc || /^audio/i.test(g.id));
    eq('exactly one audio group', audio.length, 1);
    const a = audio[0] || { items: [], options: [] };
    eq('the audio group is audio1', a.id, 'audio1');
    eq('audio1 is the last group', ex[ex.length - 1].id, 'audio1');
    eq('audio1 is a choice exercise', a.type, 'choice');
    eq('audio1 uses the true/false style', a.style, 'tf');
    ok(a.showTask === true, 'audio1 shows its task text');
    eq('audio1 has 10 items', a.items.length, 10);

    /* the file, by the same URL-encoding convention as topics 10-12 */
    const EXPECTED = 'audios/' + encodeURIComponent('Б2 13 урок.mp3');
    eq('audio1 points at the topic 13 recording', a.audioSrc, EXPECTED);
    eq('the src decodes to the real path', decodeURIComponent(a.audioSrc),
        'audios/Б2 13 урок.mp3');
    ok(fs.existsSync(path.join(ROOT, decodeURIComponent(a.audioSrc))),
        'the topic 13 MP3 exists on disk');
    const dataSrc = fs.readFileSync(path.join(ROOT, 'b2-lesson-data.js'), 'utf8');
    eq('the topic 13 MP3 is referenced exactly once',
        dataSrc.split(EXPECTED).length - 1, 1);
    /* and never another lesson's recording */
    [10, 11, 12].forEach(n => ok(
        a.audioSrc.indexOf(encodeURIComponent('Б2 ' + n + ' урок.mp3')) === -1,
        `audio1 does not point at the topic ${n} recording`));

    /* a LISTEN instruction — this lesson ships no passage to read */
    ok(/tinglang/.test(a.intro), 'audio1 tells the learner to LISTEN');
    ok(a.intro.indexOf('Работа и общество') !== -1, 'audio1 names the recording');
    ['Matnga asoslanib', 'Matn asosida', 'по тексту', 'прочитайте текст', 'Matnni o']
        .forEach(bad => ok(a.intro.indexOf(bad) === -1,
            `audio1 instruction is not a read-the-text task («${bad}»)`));

    /* B2 labels, not the legacy A-level ones */
    a.items.forEach((it, i) => {
        eq(`audio1 #${i + 1} offers Правда / Ложь`, (it.options || []).join(','), 'Правда,Ложь');
        ok(it.answer === 'Правда' || it.answer === 'Ложь',
            `audio1 #${i + 1} key is one of the two options`);
    });
    const flat = JSON.stringify(a);
    ['Неправда', 'Верно', 'Неверно'].forEach(bad =>
        ok(flat.indexOf(bad) === -1, `audio1 does not use the legacy label «${bad}»`));

    /* the ten source statements, unchanged */
    const STATEMENTS = [
        'Современные технологии помогают сделать рабочие процессы быстрее и эффективнее.',
        'Современные компании не сталкиваются с экономическими трудностями.',
        'Благодаря поддержке коллег специалистам легче решать сложные задачи.',
        'В связи с изменением законодательства компании иногда пересматривают внутренние правила.',
        'Согласно новому закону работодатель не обязан соблюдать права сотрудников.',
        'Работодатель и работник имеют определённые права и обязанности согласно договору.',
        'В тексте говорится, что проблемы на работе нужно всегда игнорировать.',
        'Профессионализм и сотрудничество имеют важное значение для успешной работы.',
        'Несмотря на трудности, организация может достигать хороших результатов.',
        'Согласно тексту, успех компании зависит только от современных технологий.'
    ];
    STATEMENTS.forEach((s, i) => eq(`audio1 #${i + 1} keeps the source statement`, a.items[i].q, s));

    /* the truth map verified against the recording itself */
    eq('audio answers follow the VERIFIED recording',
        a.items.map(it => it.answer).join(','),
        'Правда,Ложь,Правда,Правда,Ложь,Правда,Ложь,Правда,Правда,Ложь');
    /* the distribution is whatever the recording says — 6 true / 4 false — not
       a balance the lesson chose. Pinned so a "tidying" rebalance is caught. */
    eq('six Правда, as the recording dictates',
        a.items.filter(it => it.answer === 'Правда').length, 6);
    eq('four Ложь, as the recording dictates',
        a.items.filter(it => it.answer === 'Ложь').length, 4);

    /* real scorer: own key passes, opposite fails, blank fails */
    let own = 0, opp = 0, blank = 0;
    a.items.forEach(it => {
        if (UI.matchItem(it, it.answer) === true) own++;
        if (UI.matchItem(it, it.answer === 'Правда' ? 'Ложь' : 'Правда') === false) opp++;
        if (UI.matchItem(it, '') === false) blank++;
    });
    eq('every verified audio key is accepted by the real scorer', own, 10);
    eq('every opposite audio answer is rejected', opp, 10);
    eq('every blank audio answer is rejected', blank, 10);

    /* NO transcript may ship: the source never provided one */
    const lesson = JSON.stringify(t13);
    ['Современная рабочая среда', 'обмениваться документами', 'взаимовыгодное решение',
     'обеспечивать безопасные условия труда', 'действуют согласованно'
    ].forEach(line => ok(lesson.indexOf(line) === -1,
        'no transcript sentence leaked into the product'));
}

/* -------------------------------------------- openness, observed not assumed */
const NONSENSE = 'зззz яяяy ююю';
const isOpen = (it) => UI.matchItem(it, NONSENSE) === true;
const OPEN_GROUPS = ['ex4', 'ex6', 'ex8', 'ex9', 'ex10'];
const DET_GROUPS = ['ex1', 'ex2', 'ex3', 'ex5', 'ex7'];
const OPEN_SAMPLE = 'Благодаря поддержке коллег работа была завершена вовремя.';

let openCount = 0, detCount = 0, multi = 0, variants = 0;
let missing = 0, junk = 0, badOpt = 0, unmatched = 0, nonsenseAccepted = 0, blankAccepted = 0;

ex.forEach(g => g.items.forEach((it, i) => {
    const where = `${g.id} #${i + 1}`;
    if (isOpen(it)) {
        openCount++;
        if (OPEN_GROUPS.indexOf(g.id) === -1) { fail++; failures.push(`${where}: unexpectedly OPEN`); }
        if (it.free !== true) { fail++; failures.push(`${where}: open but not flagged free:true`); }
        if (it.answer !== null) { fail++; failures.push(`${where}: open item carries a key`); }
        if (!UI.matchItem(it, OPEN_SAMPLE)) {
            fail++; failures.push(`${where}: open refuses a meaningful answer`);
        }
        if (UI.matchItem(it, 'да')) { fail++; failures.push(`${where}: open accepts one word`); }
        if (UI.matchItem(it, '')) { fail++; failures.push(`${where}: open accepts blank`); }
        return;
    }
    detCount++;
    if (OPEN_GROUPS.indexOf(g.id) !== -1) { fail++; failures.push(`${where}: ${g.id} must stay open`); }
    const acc = Array.isArray(it.answer) ? it.answer : [it.answer];
    variants += acc.length;
    if (acc.length > 1) multi++;
    if (!acc.length || acc.every(x => x == null || !String(x).trim())) missing++;
    if (/TODO|FIXME|placeholder|undefined|null/i.test(JSON.stringify(it.answer))) junk++;
    if (Array.isArray(it.options) && !acc.some(x => it.options.indexOf(x) !== -1)) badOpt++;
    acc.forEach(x => { if (!UI.matchItem(it, x)) unmatched++; });
    if (UI.matchItem(it, NONSENSE)) nonsenseAccepted++;
    if (UI.matchItem(it, '')) blankAccepted++;
}));

eq('50 genuinely open items', openCount, 50);
eq('60 deterministic items', detCount, 60);
eq('no deterministic key is empty', missing, 0);
eq('no placeholder leaked into a key', junk, 0);
eq('every choice key belongs to its own options', badOpt, 0);
eq('every accepted answer is accepted by the real scorer', unmatched, 0);
eq('no deterministic item accepts nonsense', nonsenseAccepted, 0);
eq('no deterministic item accepts a blank', blankAccepted, 0);
OPEN_GROUPS.forEach(id => ok(items(id).every(it => it.free === true && it.answer === null),
    `${id} is wholly open`));
DET_GROUPS.forEach(id => ok(items(id).every(it => it.free !== true && it.answer !== null),
    `${id} is wholly deterministic`));

/* ------------------------------------------------------------------- Ex1 */
{
    const g = grp('ex1');
    eq('ex1 is an input exercise', g.type, 'input');
    const keys = items('ex1').map(it => it.answer);
    eq('ex1 keys', keys.join(' | '),
        'Благодаря | Несмотря на | В связи с | Согласно | Благодаря | Несмотря на | В связи с | Согласно | Благодаря | Несмотря на');
    /* the learner fills ONLY the construction */
    items('ex1').forEach((it, i) => {
        ok(it.q.indexOf('______') === 0, `ex1 #${i + 1} puts the gap first`);
        ok(String(it.answer).split(' ').length <= 3, `ex1 #${i + 1} answer is the construction alone`);
    });
    /* REPAIRED CUES: the source cases made the intended answer ungrammatical */
    eq('ex1 #2 case cue repaired to винительный', at('ex1', 1).q,
        '______ сложную ситуацию сотрудники продолжили работу.');
    eq('ex1 #6 case cue repaired to винительный', at('ex1', 5).q,
        '______ плохую погоду мероприятие состоялось.');
    eq('ex1 #10 case cue repaired to винительный', at('ex1', 9).q,
        '______ экономические трудности компания продолжает развиваться.');
    /* and the broken source cues must never come back */
    ['сложной ситуации сотрудники', 'плохой погоде мероприятие', 'экономическим трудностям компания']
        .forEach(bad => ok(items('ex1').every(it => it.q.indexOf(bad) === -1),
            `ex1 never ships the broken source cue «${bad}»`));
    /* every несмотря на item must be followed by an accusative phrase */
    items('ex1').forEach((it, i) => {
        if (it.answer !== 'Несмотря на') return;
        ok(/^______ (сложную ситуацию|плохую погоду|экономические трудности)/.test(it.q),
            `ex1 #${i + 1} gives несмотря на a винительный complement`);
    });
}

/* ------------------------------------------------------------------- Ex2 */
{
    eq('ex2 is an input exercise', grp('ex2').type, 'input');
    eq('ex2 keys', items('ex2').map(it => it.answer).join(' | '),
        'поддержке коллег | новому закону | сложную ситуацию | ремонтом офиса | '
        + 'современным технологиям | договору | экономические трудности | '
        + 'изменением графика | профессиональному подходу | утверждённому плану');
    items('ex2').forEach((it, i) => {
        ok(/\([^)]+\)/.test(it.q), `ex2 #${i + 1} shows the base form in brackets`);
        ok(it.answer.indexOf('(') === -1, `ex2 #${i + 1} answers with the inflected phrase only`);
    });
    eq('ex2 adds no accepted-answer variants',
        items('ex2').filter(it => Array.isArray(it.answer)).length, 0);
}

/* ------------------------------------------------------------------- Ex3 */
{
    eq('ex3 is an input exercise', grp('ex3').type, 'input');
    items('ex3').forEach((it, i) => {
        ok(it.q !== it.answer, `ex3 #${i + 1} prompt differs from its answer`);
        ok(!UI.matchItem(it, it.q), `ex3 #${i + 1} rejects the uncorrected prompt`);
    });
    /* REPAIR: source row 9 was already correct and could not be an error row */
    eq('ex3 #9 prompt is genuinely wrong', at('ex3', 8).q,
        'Благодаря поддержкой партнёров компания достигла успеха.');
    eq('ex3 #9 correction', at('ex3', 8).answer,
        'Благодаря поддержке партнёров компания достигла успеха.');
    /* the other nine corrections stay exactly as the source intended */
    eq('ex3 corrections', items('ex3').map(it => it.answer).join(' | '),
        'Благодаря хорошей подготовке команда победила. | '
        + 'Несмотря на сложную ситуацию проект продолжается. | '
        + 'Согласно договору клиент должен оплатить услугу. | '
        + 'В связи с изменением графика встреча отменяется. | '
        + 'Благодаря опытному сотруднику проблема была решена. | '
        + 'Несмотря на экономические трудности компания развивается. | '
        + 'Согласно новым правилам компания должна изменить систему. | '
        + 'В связи с ремонтом офис временно закрыт. | '
        + 'Благодаря поддержке партнёров компания достигла успеха. | '
        + 'Несмотря на высокую стоимость услуга остаётся популярной.');
}

/* ------------------------------------------------------------------- Ex5 */
{
    const g = grp('ex5');
    eq('ex5 is a choice exercise', g.type, 'choice');
    /* the broken source matching mechanic must not come back */
    ok(items('ex5').every(it => it.q.indexOf('сложным обстоятельствам') === -1),
        'ex5 never ships the impossible «несмотря на + дательный» pairing');
    ok(items('ex5').every(it => it.q.indexOf('изменению расписания') === -1),
        'ex5 never ships the impossible «в связи с + дательный» pairing');
    ok(items('ex5').every(it => it.q.indexOf('ремонту здания') === -1),
        'ex5 never ships «в связи с ремонту здания»');
    /* but the source vocabulary is preserved in a valid form */
    ['сложные обстоятельства', 'изменением расписания', 'ремонтом зданияsentinel']
        .slice(0, 2)
        .forEach(kept => ok(items('ex5').some(it => it.q.indexOf(kept) !== -1),
            `ex5 keeps the source vocabulary «${kept}» in a grammatical form`));
    ok(items('ex5').some(it => it.q.indexOf('ремонтом здания') !== -1),
        'ex5 keeps «ремонт здания» in the творительный');
    eq('ex5 keys', items('ex5').map(it => it.answer).join(','),
        'Дательный,Винительный,Творительный,Дательный,Дательный,Винительный,Дательный,Дательный,Творительный,Дательный');
    items('ex5').forEach((it, i) => {
        eq(`ex5 #${i + 1} offers the three cases`, (it.options || []).join(','),
            'Дательный,Винительный,Творительный');
        /* the label must match the construction actually shown */
        const q = it.q;
        const want = /^благодаря |^согласно /.test(q) ? 'Дательный'
                   : /^несмотря на /.test(q) ? 'Винительный'
                   : /^в связи с /.test(q) ? 'Творительный' : null;
        ok(want !== null, `ex5 #${i + 1} starts with a topic 13 construction`);
        eq(`ex5 #${i + 1} case matches its construction`, it.answer, want);
    });
}

/* ------------------------------------------------------------------- Ex7 */
{
    eq('ex7 is an input exercise', grp('ex7').type, 'input');
    /* each prompt names its target construction, which is what makes it gradable */
    items('ex7').forEach((it, i) => {
        const tag = (it.q.match(/\[([^\]]+)\]$/) || [])[1];
        ok(!!tag, `ex7 #${i + 1} names its target construction`);
        const head = String(it.answer).toLowerCase();
        ok(head.indexOf(String(tag).toLowerCase().split(' ')[0]) === 0
            || head.indexOf(String(tag).toLowerCase()) === 0,
            `ex7 #${i + 1} answer actually starts with the requested «${tag}»`);
        ok(it.q.replace(/\s*\[[^\]]+\]$/, '') !== it.answer,
            `ex7 #${i + 1} really transforms the sentence`);
    });
    /* REPAIR #2: the source turned a CAUSE into a RULE-BASIS */
    eq('ex7 #2 prompt repaired', at('ex7', 1).q,
        'По новому закону компания должна изменить правила. [согласно]');
    eq('ex7 #2 answer', at('ex7', 1).answer,
        'Согласно новому закону компания должна изменить правила.');
    ok(items('ex7').every(it => it.q.indexOf('Из-за закона компания изменила правила.') === -1),
        'ex7 never ships the cause→basis source defect');
    /* REPAIR #3 and #9: the source prompts were ALREADY in the target form */
    eq('ex7 #3 prompt repaired', at('ex7', 2).q,
        'С помощью коллег работа была выполнена быстро. [благодаря]');
    eq('ex7 #3 answer', at('ex7', 2).answer,
        'Благодаря помощи коллег работа была выполнена быстро.');
    eq('ex7 #9 prompt repaired', at('ex7', 8).q,
        'Новые технологии помогли увеличить производство. [благодаря]');
    eq('ex7 #9 answer', at('ex7', 8).answer,
        'Благодаря новым технологиям производство увеличилось.');
    items('ex7').forEach((it, i) => {
        ok(!/^Благодаря /.test(it.q), `ex7 #${i + 1} prompt is not already in the благодаря form`);
    });
}

/* ---------------------------- open groups keep every source prompt intact */
{
    eq('ex4 keeps the ten source sentence pairs',
        items('ex4').filter(it => /\.\s/.test(it.q) && it.q.split('. ').length >= 2).length, 10);
    eq('ex6 first question', at('ex6', 0).q, 'Почему компания увеличила прибыль?');
    eq('ex6 last question', at('ex6', 9).q, 'Несмотря на что компания продолжает развиваться?');
    ok(items('ex6').every(it => /\?$/.test(it.q)), 'every ex6 prompt is a question');
    eq('ex8 keeps ten Uzbek prompts',
        items('ex8').filter(it => /[‘’ʻ]|[a-z]/.test(it.q)).length, 10);
    ok(items('ex9').every(it => /…$/.test(it.q)), 'every ex9 prompt is an unfinished formal opening');
    eq('ex9 first opening', at('ex9', 0).q, 'Согласно новому закону…');
    ok(items('ex10').every(it => it.q.indexOf(' / ') !== -1), 'every ex10 prompt is a cue set');
    eq('ex10 first cue set', at('ex10', 0).q,
        'Благодаря / поддержка коллег / проект / успешно завершить.');
}

/* ----------------------------------------------------------------- format */
{
    let dupPrompt = 0, empty = 0, longQ = 0;
    const seen = Object.create(null);
    ex.forEach(g => g.items.forEach(it => {
        const k = g.id + '::' + it.q;
        if (seen[k]) dupPrompt++; seen[k] = 1;
        if (!String(it.q || '').trim()) empty++;
        if (String(it.q).length > 220) longQ++;
    }));
    eq('no duplicate prompt inside a group', dupPrompt, 0);
    eq('no empty prompt', empty, 0);
    eq('no runaway prompt length', longQ, 0);
    const prompts = [];
    ex.forEach(g => g.items.forEach(it => prompts.push(it.q)));
    eq('110 prompts in total', prompts.length, 110);
    ok(new Set(prompts).size >= 108, `prompts are essentially distinct (${new Set(prompts).size}/110)`);
    /* no lesson text may contain the malformed source phrase */
    ok(JSON.stringify(t13).indexOf('решения вопрос"') === -1, 'no item ships «решения вопрос»');
}

/* ------------------------------------------------- vocabulary (paid only) */
{
    const v = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-vocabulary.html'), 'utf8');
    const a = v.indexOf('name: "Предлоги и управление"');
    ok(a > -1, 'paid vocabulary has a topic 13 deck');
    const authoredIds = [...v.matchAll(/\n                    id: (\d+),/g)].map(m => Number(m[1]));
    const vFrontier = Math.max.apply(null, authoredIds);
    eq('vocabulary frontier matches the lesson frontier', vFrontier, frontier);
    /* FINAL-FRONTIER SAFE. While canonical decks remain unauthored they are
       generated from the next id. Once every canonical deck is real the spread
       is removed entirely — demanding generateLockedTopics(N+1) then would
       assert a phantom Topic 17. */
    const _genSpread = v.indexOf('...generateLockedTopics(') !== -1;
    if (_genSpread) {
        ok(new RegExp('generateLockedTopics\\(' + (vFrontier + 1) + '\\)').test(v),
            `future decks are generated from ${vFrontier + 1}`);
    } else {
        ok(!new RegExp('generateLockedTopics\\(' + (vFrontier + 1) + '\\)').test(v),
            'the paid deck list is complete — no future deck is generated');
        ok(v.split('...generateLockedTopics(').length - 1 === 0,
            'no generated future deck remains in the paid deck list');
    }
    eq(`no stale generateLockedTopics(${vFrontier})`,
        v.split('generateLockedTopics(' + vFrontier + ')').length - 1, 0);

    /* The deck ends at the NEXT deck, not at the generateLockedTopics marker.
       Slicing to the marker silently swallowed every later deck the moment a
       further topic was authored, which is exactly what happened here. */
    const nextDeck = v.indexOf('\n                    id: ', a + 1);
    let marker = v.indexOf('generateLockedTopics(' + (vFrontier + 1) + ')');
    if (marker < 0) marker = v.length;          /* final frontier: no marker left */
    const b = (nextDeck > -1 && nextDeck < marker) ? nextDeck : marker;
    const seg = v.slice(a, b);
    const cards = [...seg.matchAll(/\{ ru: "((?:[^"\\]|\\.)*)", uz: "((?:[^"\\]|\\.)*)" \}/g)]
        .map(m => [m[1], m[2]]);
    eq('paid vocabulary topic 13 has all 60 cards', cards.length, 60);
    const ru = cards.map(c => c[0]);
    eq('60 unique Russian units', new Set(ru).size, 60);
    eq('no duplicate card', new Set(cards.map(c => c.join('|'))).size, 60);
    eq('no empty Russian side', ru.filter(x => !x.trim()).length, 0);
    eq('no empty Uzbek side', cards.filter(c => !c[1].trim()).length, 0);
    /* the source distinguishes these two — neither may be "tidied away" */
    ok(ru.indexOf('условие') !== -1, 'the deck keeps «условие»');
    ok(ru.indexOf('условия') !== -1, 'the deck keeps «условия»');
    /* the four constructions and the two в соответствии с phrases are present */
    ['благодаря', 'несмотря на', 'в связи с', 'согласно',
     'в соответствии с законом', 'в соответствии с требованиями'
    ].forEach(k => ok(ru.indexOf(k) !== -1, `the deck keeps «${k}»`));
    eq('first card', ru[0], 'благодаря');
    eq('last card', ru[59], 'достичь результата');

    /* topic 13 must not leak into the free demo deck */
    const demo = fs.readFileSync(path.join(ROOT, 'b2-demo-vocabulary.html'), 'utf8');
    ok(demo.indexOf('Предлоги и управление') === -1
        || /generateLockedTopics\(4\)/.test(demo),
        'topic 13 vocabulary does not become free demo content');
}

/* --------------------------------------- runtime frontier: paid vs demo */
{
    const grab = (host, name) => {
        const i = host.indexOf('function ' + name + '(');
        if (i < 0) return null;
        let d = 0;
        for (let k = host.indexOf('{', i); k < host.length; k++) {
            if (host[k] === '{') d++;
            else if (host[k] === '}') { d--; if (!d) return host.slice(i, k + 1); }
        }
        return null;
    };
    [['paid-courses/b2-course.html', false, 'paid'],
     ['b2-demo.html', true, 'demo']].forEach(([file, demoMode, tag]) => {
        const host = fs.readFileSync(path.join(ROOT, file), 'utf8');
        const hw = new JSDOM('<body></body>', { runScripts: 'outside-only', virtualConsole: vc }).window;
        ['shared-normalizer.js', 'sentence-builder.js', 'course-exercise-ui.js',
         'b2-topics.js', 'b2-lesson-data.js'].forEach(f =>
            hw.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
        hw.eval('var B2_DEMO_MODE = ' + demoMode + ';');
        ['b2SoonHtml', 'b2ExerciseData', 'buildB2Topics'].forEach(n => {
            const src = grab(host, n);
            ok(!!src, `${tag}: ${n}() found`);
            if (src) hw.eval(src);
        });
        const list = hw.eval('buildB2Topics()');
        eq(`${tag}: 16 topics are rendered`, list.length, 16);
        const t = list.find(x => x.id === 13);
        ok(!!(t && t.grammar && t.grammar.length > 1000), `${tag}: topic 13 renders a real lesson`);
        eq(`${tag}: topic 13 shows no coming-soon shell`, t.content, '');
        eq(`${tag}: topic 13 lock state`, t.isLocked, demoMode);
        eq(`${tag}: topic 13 subscription lock state`, t.isSubscriptionLocked, demoMode);
        const next = list.find(x => x.id === frontier + 1);
        if (frontier < list.length) {
            ok(!!next, `${tag}: topic ${frontier + 1} is still listed`);
            eq(`${tag}: topic ${frontier + 1} has no grammar`, (next || {}).grammar, '');
            ok((next || {}).content && next.content.length > 50,
                `${tag}: topic ${frontier + 1} shows the coming-soon shell`);
            ok(hw.eval('b2ExerciseData(' + (frontier + 1) + ')') === null,
                `${tag}: topic ${frontier + 1} has no lesson payload`);
        } else {
            /* the course is complete: no next topic, no coming-soon shells */
            eq(`${tag}: the authored frontier reached the canonical end`, frontier, list.length);
            ok(!next, `${tag}: there is no topic ${frontier + 1} — the course ends at ${list.length}`);
            eq(`${tag}: no canonical topic is left as a coming-soon shell`,
                list.filter(x => x.content).length, 0);
        }
        if (demoMode) {
            eq('demo: only topics 1-3 stay open',
                list.filter(x => !x.isLocked).map(x => x.id).join(','), '1,2,3');
        }
    });
}

/* ------------------------------------------------------------------ report */
console.log('='.repeat(60));
if (fail === 0) {
    console.log(`  ✅ B2 TOPIC 13: ${pass}/${pass} passed`
        + `  (open ${openCount} · deterministic ${detCount} · multi ${multi}`
        + ` · accepted variants ${variants})`);
} else {
    console.log(`  ❌ B2 TOPIC 13: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
}
console.log('='.repeat(60) + '\n');
process.exit(fail === 0 ? 0 : 1);
