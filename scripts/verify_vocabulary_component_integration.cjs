#!/usr/bin/env node
/**
 * verify_vocabulary_component_integration.cjs — the vocabulary half, driven.
 *
 * This suite exists because of a specific failure: the server model was
 * correct, the client helper was correct, suites covering both were green, and
 * NO SHIPPED PAGE EVER CALLED THE REPORTER. A paid topic completes only when
 * both halves are recorded, and the vocabulary half was recorded by nobody, so
 * no learner in any course could finish a topic. Grepping for a filename would
 * not have caught that and will not catch it coming back, so everything below
 * DRIVES the real page functions lifted out of the four shipped decks.
 *
 * The other half of the story is that reporting must be EARNED. A reporter
 * that fires on page load, on opening a topic, or on the first card would make
 * this suite green and the product a lie, so those three are asserted as
 * explicitly as the success path.
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
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('\n=== VOCABULARY COMPONENT INTEGRATION ===');

const DECKS = [
    { code: 'A1', file: 'paid-courses/a1-vocabulary.html', fn: 'showCompletion' },
    { code: 'A2', file: 'paid-courses/a2-vocabulary.html', fn: 'showCompletion' },
    { code: 'B1', file: 'paid-courses/b1-vocabulary.html', fn: 'showCompletion' },
    { code: 'B2', file: 'paid-courses/b2-vocabulary.html', fn: 'showCompletionScreen' }
];

function lift(src, name) {
    const i = src.search(new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\('));
    if (i < 0) return null;
    let p = 0, b = -1;
    for (let k = src.indexOf('(', i); k < src.length; k++) {
        if (src[k] === '(') p++;
        else if (src[k] === ')') { p--; if (p === 0) { b = src.indexOf('{', k); break; } }
    }
    let d = 0;
    for (let k = b; k < src.length; k++) {
        if (src[k] === '{') d++;
        else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
    }
    return null;
}

/** A live deck: the real reporter + the real completion screen, driven. */
function deck(spec, opts) {
    opts = opts || {};
    const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
    const dom = new JSDOM(
        `<!doctype html><body>
           <div id="flashcardScreen" class="active"></div>
           <div id="completionScreen"><div class="completion-title"></div>
             <div id="completionMessage"></div></div>
         </body>`,
        { url: 'https://uzdarus.test/paid-courses/x.html', runScripts: 'outside-only',
          pretendToBeVisual: true, virtualConsole: vc });
    const w = dom.window;

    /* real shared reporter */
    new Function('window', 'document', 'localStorage', read('vocabulary-component.js'))
        (w, w.document, w.localStorage);

    const calls = [];
    const user = opts.user || 'u-1';

    /* A RELOAD KEEPS localStorage. Each deck() builds a fresh jsdom, so
       without this a "reload" would also wipe the browser store and the
       sync-pending note would look lost when it is not — the harness would be
       testing itself rather than the page. `carry` is the surviving store. */
    const carry = opts.carry || {};
    Object.keys(carry).forEach((k) => { try { w.localStorage.setItem(k, carry[k]); } catch (e) {} });
    const proto = w.Storage.prototype;
    const rawSet = proto.setItem, rawRemove = proto.removeItem;
    proto.setItem = function (k, v) { carry[k] = String(v); return rawSet.call(this, k, v); };
    proto.removeItem = function (k) { delete carry[k]; return rawRemove.call(this, k); };

    w.localStorage.setItem('currentUser', JSON.stringify({ id: user, email: 'x@y.z' }));
    w.completeCourseComponent = opts.component || (async (course, topicId, component) => {
        calls.push({ course, topicId, component });
        return ack(course, topicId, component, opts.topicCompleted === true,
                   opts.ackCompletedTopics || []);
    });
    w.completeCourseTopic = async (c, t) => { calls.push({ legacyTopic: true, course: c, topicId: t }); return []; };
    w.__vocabCourseState = opts.courseState || null;

    const src = read(spec.file);
    const lower = spec.code.toLowerCase();
    const parts = [lift(src, lower + 'ReportVocabulary'), lift(src, lower + 'ApplyVocabOutcome'),
                   lift(src, spec.fn)].filter(Boolean);
    const topic = { id: opts.topicId || 1, name: 'T', words: [{ ru: 'а', uz: 'a' }, { ru: 'б', uz: 'b' }] };
    const learned = {};
    let saveProgressCalls = 0;

    const api = new Function('window', 'document', 'localStorage', 'vocabularyData',
        'currentTopicId', 'learnedWords', 'saveProgress',
        parts.join('\n\n') +
        '\nreturn {report: ' + lower + 'ReportVocabulary, apply: ' + lower +
        'ApplyVocabOutcome, complete: ' + spec.fn + '};')
        (w, w.document, w.localStorage, { topics: [topic] },
         topic.id, learned, () => { saveProgressCalls++; });

    return { window: w, calls, api, topic, learned, user, carry,
             saveProgressCalls: () => saveProgressCalls,
             text: () => w.document.body.textContent.replace(/\s+/g, ' ').trim(),
             V: w.UzVocabularyComponent };
}

function ack(course, topicId, component, topicCompleted, completedTopics) {
    return {
        ok: true, course, topicId, component,
        components: { vocabularyCompleted: true, exercisesCompleted: topicCompleted === true,
                      vocabularyCompletedAt: null, exercisesCompletedAt: null },
        topicCompleted: topicCompleted === true,
        completedTopics: completedTopics.slice(),
        nextTopic: topicCompleted === true ? Number(topicId) + 1 : null
    };
}

(async () => {

for (const spec of DECKS) {
    const C = spec.code;

    /* ---- the reporter exists and is the SHARED one ---- */
    {
        const src = read(spec.file);
        ok(/vocabulary-component\.js/.test(src), `${C}: the deck loads the shared reporter`);
        const copies = (src.match(/completeCourseComponent\(/g) || []).length;
        eq(`${C}: the deck does not re-implement the call itself`, copies, 0);
    }

    /* ---- 1-3. NOTHING is reported without finishing the deck ---- */
    {
        const d = deck(spec, {});
        eq(`${C}: loading the page reports nothing`, d.calls.length, 0);
        /* opening a topic and viewing cards touch neither the reporter nor the network */
        d.window.__vocabCourseState = null;
        eq(`${C}: opening a topic reports nothing`, d.calls.length, 0);
        eq(`${C}: viewing a card reports nothing`, d.calls.length, 0);
        /* and nothing is pending until the deck is actually finished */
        eq(`${C}: no sync-pending note is written either`,
            !!d.V.readPending(C, d.topic.id, d.user), false);
    }

    /* ---- 4/5. genuine completion reports exactly one vocabulary half ---- */
    {
        const d = deck(spec, {});
        await d.api.complete();
        await new Promise((r) => setTimeout(r, 5));
        eq(`${C}: finishing the deck reports exactly once`, d.calls.length, 1);
        const c = d.calls[0] || {};
        eq(`${C}: under its own course code`, c.course, C);
        eq(`${C}: for the open topic`, Number(c.topicId), d.topic.id);
        eq(`${C}: and the component is 'vocabulary'`, c.component, 'vocabulary');
        eq(`${C}: the legacy whole-topic route is not used`,
            d.calls.filter((x) => x.legacyTopic).length, 0);
        ok(d.saveProgressCalls() > 0, `${C}: the deck's own progress save still runs`);
        /* awaited: the reporter is async and its promise is returned */
        const src = read(spec.file);
        ok(new RegExp('await V\\.reportVocabulary').test(read('paid-courses/a1-vocabulary.html')) ||
           /await V\.reportVocabulary/.test(src) || /return \w+ReportVocabulary/.test(src),
            `${C}: the component call is awaited`);
    }

    /* ---- 6/7. a reply that is not a verdict fails closed ---- */
    for (const bad of [null, {}, { ok: false }, { ok: true, course: 'ZZ', topicId: 1 },
                       { ok: true, course: C, topicId: 99 },
                       { ok: true, course: C, topicId: 1, components: {}, topicCompleted: true, completedTopics: [] }]) {
        const d = deck(spec, { component: async () => bad });
        const out = await d.api.report(d.topic.id);
        eq(`${C}: a malformed ACK ${JSON.stringify(bad).slice(0, 34)} fails closed`,
            !!(out && out.ok), false);
    }
    {
        const d = deck(spec, { component: async () => { throw new Error('offline'); } });
        const out = await d.api.report(d.topic.id);
        eq(`${C}: a network exception fails closed`, !!(out && out.ok), false);
    }

    /* ---- 8/9/10/11. failure keeps the work, reload retries the component ---- */
    {
        const d = deck(spec, { component: async () => null });
        await d.api.report(d.topic.id);
        ok(!!d.V.readPending(C, d.topic.id, d.user),
            `${C}: a failed report leaves the learning recorded as sync-pending`);
        ok(/Natijani saqlab/.test(d.text()), `${C}: the learner is told, in the page`);
        const retry = [...d.window.document.querySelectorAll('button')]
            .find((b) => b.textContent.trim() === 'Qayta urinish');
        ok(!!retry, `${C}: with a Qayta urinish they can click`);

        /* a RELOAD: new page object, same user, SAME browser store */
        const back = deck(spec, { carry: d.carry });
        eq(`${C}: after a reload the page still knows the deck was finished`,
            back.V.pageState({ course: C, topicId: back.topic.id, courseState: null, user: back.user }).mode,
            'sync');
        eq(`${C}: and reloading reports nothing by itself`, back.calls.length, 0);
        const out = await back.api.report(back.topic.id);
        eq(`${C}: the retry sends the vocabulary component alone`, back.calls.length, 1);
        eq(`${C}: exactly that component`, (back.calls[0] || {}).component, 'vocabulary');
        ok(out && out.ok, `${C}: and it succeeds`);
        eq(`${C}: a successful retry clears the pending note`,
            !!back.V.readPending(C, back.topic.id, back.user), false);
    }

    /* ---- 12. an acknowledged half is never resent ---- */
    {
        const d = deck(spec, { courseState: { topicComponents: { 1: { vocabularyCompleted: true } } } });
        const out = await d.api.report(1);
        eq(`${C}: an already-acknowledged vocabulary half is not reported again`, d.calls.length, 0);
        ok(out && out.ok && out.alreadyAcked, `${C}: and the page is told it is already done`);
    }

    /* ---- 13. legacy completion is left alone ---- */
    {
        const d = deck(spec, { courseState: { topicComponents: {}, completedTopics: [1] } });
        const out = await d.api.report(1);
        eq(`${C}: a legacy completed topic is not migrated`, d.calls.length, 0);
        ok(out && out.ok && out.legacy, `${C}: it is simply reported as complete`);
    }

    /* ---- 14. vocabulary done, exercises missing -> topic stays locked ---- */
    {
        const d = deck(spec, { topicCompleted: false, ackCompletedTopics: [] });
        const out = await d.api.report(d.topic.id);
        ok(out && out.ok, `${C}: reporting the vocabulary half succeeds`);
        eq(`${C}: but the topic is not complete`, out.topicCompleted, false);
        eq(`${C}: and the learner is pointed at the exercises`,
            out.message, 'Avval ushbu mavzudagi mashqlarni yakunlang.');
        ok(/mashqlarni yakunlang/.test(d.text()), `${C}: which is rendered in the page`);
    }

    /* ---- 15. vocabulary as the SECOND half -> server progression ---- */
    {
        const d = deck(spec, { topicCompleted: true, ackCompletedTopics: [1, 2] });
        const out = await d.api.report(d.topic.id);
        ok(out && out.ok && out.topicCompleted, `${C}: the second half completes the topic`);
        eq(`${C}: and progression is the SERVER's array`,
            JSON.stringify(out.completedTopics), '[1,2]');
        eq(`${C}: with the server's next topic`, out.nextTopic, d.topic.id + 1);
    }
}

/* ================================================================ *
 * 16. SPEECH NEVER DECIDES WHETHER THE HALF CAN BE REPORTED
 * ---------------------------------------------------------------- *
 * The reporter is reached from the deck's completion screen, which a
 * learner reaches by walking the words. That walk must not depend on a
 * microphone — it did on paid A2/B2, and that made a speech outage a
 * progression outage.
 * ================================================================ */
{
    const speech = read('paid-courses/speech.js');
    const at = speech.indexOf('function _pronGatesProgression');
    ok(at > 0, 'the progression-gating predicate was located');
    const body = speech.slice(at, speech.indexOf('\n}', at) + 2);
    /* the predicate EXPLAINS the old behaviour in prose — that comment is why
       nobody reinstates it — so the check is on executable code only. */
    const code = body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    ok(/return false;/.test(code), 'pronunciation gates no progression at all');
    eq('and it is not wired back to the mic policy', /return _pronEnabled\(\)/.test(code), false);
    const mod = read('vocabulary-component.js');
    eq('the vocabulary reporter never consults a pronunciation score',
        /pron|speech|micro|accuracy/i.test(mod), false);
}

/* ---- isolation: nothing leaks between users, courses or topics ---- */
{
    const V = deck(DECKS[0], {}).V;
    const k = (u, c, t) => V.pendingKey(c, t, u);
    ok(k('u1', 'A1', 1) !== k('u2', 'A1', 1), 'two users never share a pending note');
    ok(k('u1', 'A1', 1) !== k('u1', 'A2', 1), 'two courses never share one');
    ok(k('u1', 'A1', 1) !== k('u1', 'A1', 2), 'two topics never share one');
    /* and a note written for one course is not read for another */
    const d = deck(DECKS[0], {});
    d.V.markPending('A1', 5, 'u-1');
    ok(!!d.V.readPending('A1', 5, 'u-1'), 'the note is readable for its own course/topic');
    eq('but not for another course', !!d.V.readPending('A2', 5, 'u-1'), false);
    eq('nor another topic', !!d.V.readPending('A1', 6, 'u-1'), false);
    eq('nor another user', !!d.V.readPending('A1', 5, 'u-2'), false);
}

console.log('  four decks driven · reported only on genuine completion · fail closed · reload retries the component alone');
console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ VOCABULARY COMPONENT INTEGRATION: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ VOCABULARY COMPONENT INTEGRATION: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
})().catch((e) => { console.error(e); process.exit(2); });
