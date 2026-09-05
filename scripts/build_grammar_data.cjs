#!/usr/bin/env node
/**
 * build_grammar_data.cjs — regenerate grammar-data/<course>.js from the REAL
 * course pages.
 *
 * The grammar reader is one small page shared by every course, so it cannot
 * parse a 600 KB course document at runtime to find one topic's material. The
 * material is therefore extracted here, at authoring time, into one small
 * module per course that the reader fetches on demand.
 *
 * THE COURSE PAGE STAYS THE SOURCE. Nothing is authored twice: the rule text,
 * tables and examples are exactly the markup the course already ships, and
 * verify_grammar_coverage.cjs re-extracts on every run and fails if these
 * files no longer match. Run this after editing a topic's grammar.
 *
 * The per-topic teaching frame — the objective a learner reads before the
 * material and the summary they read after — is NOT extracted, because the
 * course pages have never carried one. It is authored in
 * grammar-frames.json and merged in here, so regenerating never loses it.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { launch, serveRepo } = require('./_cdp_driver.cjs');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'grammar-data');

const PAGES = {
    A1: '/paid-courses/a1-course.html',
    A2: '/paid-courses/a2-course.html',
    B1: '/paid-courses/b1-course.html',
    B2: '/paid-courses/b2-course.html'
};

/** Collapse the authored markup to the text a reader would speak aloud. */
function textOf(html) {
    return String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

/** Every image the material depends on, so a missing file is a build error. */
function imagesIn(html) {
    return [...String(html || '').matchAll(/src=["']([^"']+\.(?:jpg|jpeg|png|webp|gif))["']/gi)]
        .map((m) => m[1]);
}

const frames = JSON.parse(fs.readFileSync(path.join(ROOT, 'grammar-frames.json'), 'utf8'));

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

(async () => {
let totalTopics = 0, withText = 0, withImages = 0;
const missingFrames = [];
const site = await serveRepo();
const browser = await launch();
try {
    const p = await browser.newPage();
    await p.route((u) => (/paid-platform\.js/.test(u)
        ? 'window.getUserProgress=async()=>null;window.getUserQuizResults=async()=>({});'
          + 'window.firebaseReady=true;'
        : null));
    await p.onNewDocument(
        `try{localStorage.setItem('currentUser',JSON.stringify({id:'build',email:'b@t.uz',role:'developer'}));}catch(e){}`);

    for (const [course, url] of Object.entries(PAGES)) {
        await p.goto(`http://127.0.0.1:${site.port}${url}`, { waitMs: 3200 });
        /* THE PAGE'S OWN RESOLVED DATA. B2 assembles courseData at runtime from
           b2-topics.js and b2-lesson-data.js, and A1/A2/B1 hold it inline;
           reading it here means one extractor rather than four. */
        /* EVERYTHING THE LESSON PANE USED TO SHOW. The old pane drew the grammar,
           then a "Mavzu Tushuntirish" note built from explanation.uz, then the
           topic's own content block. Taking only the grammar would quietly drop
           the other two from the product, so the reader carries all three. */
        const raw = await p.evaluate(`
            /* THE DECK PROMO IS NOT MATERIAL. A1 and B1 put nothing in content but
               a card advertising the vocabulary, and A2 sometimes adds one below
               its prose. The overview already offers the deck as its own stage, so
               carrying the card into the reader would duplicate it and leave a
               button there that goes nowhere once its handler is stripped. */
            function withoutDeckPromo(html) {
                var d = document.createElement('div');
                d.innerHTML = String(html || '');
                Array.prototype.slice.call(d.querySelectorAll('button,a')).forEach(function (el) {
                    var target = (el.getAttribute('onclick') || '') + ' ' + (el.getAttribute('href') || '');
                    if (!/vocabulary\.html/.test(target)) return;
                    var card = el;
                    while (card.parentElement && card.parentElement !== d) card = card.parentElement;
                    card.parentElement && card.parentElement.removeChild(card);
                });
                return d.innerHTML;
            }
            return JSON.stringify((courseData.topics||[]).map(function(t){
            return { id: t.id, title: String(t.title||''),
                     description: String(t.description||''),
                     grammar: String(t.grammar||''),
                     explanation: String((t.explanation && t.explanation.uz) || ''),
                     content: withoutDeckPromo(t.content) }; }));`);
        const topics = JSON.parse(raw).map((t) => {
            /* STRIP THE HANDLERS AT BUILD TIME. grammar-reader.js sanitises
               anyway, but material that ships with onclick= is one careless
               innerHTML away from running, and nothing in a grammar page needs
               one — the image zoom the course used is replaced by the reader's
               own responsive image. */
            const explain = t.explanation.trim()
                ? `<div class="gr-note"><h3>Mavzu tushuntirish</h3><p>${t.explanation.trim()}</p></div>`
                : '';
            const body = [t.grammar, explain, t.content]
                .map((x) => String(x || '').trim()).filter(Boolean).join('\n')
                .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
                .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
                .trim();
            const frame = (frames[course] || {})[String(t.id)] || {};
            totalTopics++;
            if (textOf(body).length >= 120) withText++;
            const images = imagesIn(body);
            if (images.length) withImages++;
            if (!frame.objective || !frame.summary) missingFrames.push(`${course}/${t.id}`);
            return {
                id: t.id,
                title: t.title,
                description: t.description,
                objective: frame.objective || '',
                summary: frame.summary || '',
                notes: frame.notes || [],
                mistakes: frame.mistakes || [],
                selfCheck: frame.selfCheck || [],
                /* AUTHORED COURSE MARKUP, not learner input. It is rendered as
                   markup by design — that is how the tables and highlighting the
                   material depends on survive — and grammar-reader.js sanitises
                   it to a small tag allowlist before it reaches the document. */
                body: body,
                images: images
            };
        });

        /* ONE FILE PER TOPIC. Opening one topic must not download the other
           fifteen: A2's material alone is 246 KB together and about 15 KB
           apart, and the reader needs exactly one of them. */
        const dir = path.join(OUT_DIR, course.toLowerCase());
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        let bytes = 0;
        topics.forEach((t) => {
            const one =
`/* GENERATED by scripts/build_grammar_data.cjs — do not edit by hand.
   Source: the ${course} course page (topic ${t.id}) plus grammar-frames.json. */
(function (global) {
    'use strict';
    global.UzGrammarData = global.UzGrammarData || {};
    global.UzGrammarData[${JSON.stringify(course)}] = global.UzGrammarData[${JSON.stringify(course)}] || {};
    global.UzGrammarData[${JSON.stringify(course)}][${t.id}] = ${JSON.stringify(t, null, 4)};
})(typeof window !== 'undefined' ? window : this);
`;
            const file = path.join(dir, t.id + '.js');
            fs.writeFileSync(file, one);
            bytes += Buffer.byteLength(one);
        });
        /* A tiny index, so a page can list a course without loading any
           material: titles and whether the topic has one. */
        const index =
`/* GENERATED by scripts/build_grammar_data.cjs — do not edit by hand. */
(function (global) {
    'use strict';
    global.UzGrammarIndex = global.UzGrammarIndex || {};
    global.UzGrammarIndex[${JSON.stringify(course)}] = ${JSON.stringify(
        topics.map((t) => ({ id: t.id, title: t.title, description: t.description,
                             objective: t.objective,
                             chars: textOf(t.body).length, images: t.images.length })), null, 4)};
})(typeof window !== 'undefined' ? window : this);
`;
        fs.writeFileSync(path.join(OUT_DIR, course.toLowerCase() + '-index.js'), index);
        console.log(`  ${course}: ${topics.length} topics -> grammar-data/${course.toLowerCase()}/`
            + ` (avg ${Math.round(bytes / topics.length / 1024)} KB each)`);
    }
} finally {
    try { await browser.close(); } catch (e) {}
    try { await site.close(); } catch (e) {}
    try { execSync('pkill -f "Google Chrome for Testing" 2>/dev/null || true'); } catch (e) {}
}

console.log(`\n  ${totalTopics} topics · ${withText} with written material · ${withImages} with a scanned table`);
if (missingFrames.length) {
    console.log(`  frames still to author (${missingFrames.length}): ${missingFrames.join(', ')}`);
}
})().catch((e) => { console.error('BUILD ERROR', e && e.message); process.exit(1); });
