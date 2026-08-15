#!/usr/bin/env node
/**
 * verify_a1_progression.cjs — finishing a topic must open the next one, and a
 * reload must never take that back.
 *
 * THE BUG THIS EXISTS TO CATCH
 * ---------------------------
 * Learners reported that A1 "does not let me into the next lesson after topic
 * 9". Completion itself worked: the score was right, the topic was pushed into
 * `completedTopics`, the next card unlocked. The loss happened on the NEXT PAGE
 * LOAD.
 *
 * Completing a topic writes twice — localStorage (synchronous, reliable) and
 * Firestore (asynchronous, can fail). saveProgressToFirebase() was already
 * hardened against the two copies diverging: it UNIONS them before saving,
 * because topic completion is monotonic. loadUserData() was not:
 *
 *     completedTopics = savedProgress.completedTopics;   // remote replaces local
 *     localStorage.setItem(key, ...);                    // and overwrites it
 *
 * A learner whose remote write did not land therefore came back to a profile
 * missing the topic they had just finished — and the second line destroyed the
 * local copy that still had it, making the loss permanent. The next topic
 * stayed locked forever.
 *
 * THE SECOND BUG, INTRODUCED BY THE FIRST FIX
 * ------------------------------------------
 * The first repair unioned the localStorage copy into the authoritative array
 * and pushed the result back to Firestore. localStorage belongs to the user, so
 *
 *     localStorage.setItem('a1_progress_<uid>', '[1,2,3,4,5,6,7,8,9,10,11,12]')
 *
 * plus a reload unlocked the entire course AND had the app write the forgery to
 * the server. One line in DevTools, no tooling. That is now closed:
 *
 *     authoritative : the server's courses.A1.completedTopics
 *     cache         : localStorage — display only, never promoted
 *     session       : topics THIS tab graded and passed, the only additions
 *                     this client may make to the server's record
 *
 * and a completion is only claimed once the write has actually landed.
 *
 * These assertions drive the REAL functions lifted out of the page, so removing
 * any of it brings one of the two bugs back with a red suite.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(JSON.stringify(a) === JSON.stringify(b),
    `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const HTML = fs.readFileSync(path.join(ROOT, 'paid-courses/a1-course.html'), 'utf8');

function mainScript(html) {
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
    let m, best = '';
    while ((m = re.exec(html))) {
        if (/\bsrc=/.test(m[1])) continue;
        if (m[2].length > best.length) best = m[2];
    }
    return best;
}
const S = mainScript(HTML);

function lift(name) {
    const i = S.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('missing ' + name);
    const prefix = S.slice(i - 6, i) === 'async ' ? 'async ' : '';
    let p = 0, b = -1;
    for (let k = S.indexOf('(', i); k < S.length; k++) {
        if (S[k] === '(') p++;
        else if (S[k] === ')') { p--; if (p === 0) { b = S.indexOf('{', k); break; } }
    }
    let d = 0;
    for (let k = b; k < S.length; k++) {
        if (S[k] === '{') d++;
        else if (S[k] === '}') { d--; if (d === 0) return prefix + S.slice(i, k + 1); }
    }
    throw new Error('unbalanced ' + name);
}

console.log('\n=== A1 PROGRESSION ===');

/* --------------------------------------------------- 1. the unlock rule */
/* Lifted verbatim from loadTopics() so the test cannot drift from the page. */
const RULE = S.match(/const isSequenceLocked = !isPrivileged[\s\S]*?;\n/);
ok(!!RULE, 'the sequential-unlock rule is present in loadTopics()');
ok(!!RULE && /!completedTopics\.includes\(topic\.id - 1\)/.test(RULE[0]),
    'a topic unlocks when the PREVIOUS topic id is in completedTopics');
ok(!!RULE && /!completedTopics\.includes\(topic\.id\)/.test(RULE[0]),
    'an already-completed topic never re-locks');
/* The rule must be derived from ids, never from array positions. */
ok(!/completedTopics\.includes\(\s*(index|i|idx)\s*\)/.test(S),
    'unlocking never tests an array index against completedTopics');
/* And never special-cased per topic. */
ok(!/topicId\s*===\s*9\b[\s\S]{0,120}unlock/i.test(S),
    'no topic number is hard-coded into the unlock path');

function unlocked(completedTopics, topicId) {
    /* the real expression, evaluated */
    return !(topicId > 1
        && !completedTopics.includes(topicId - 1)
        && !completedTopics.includes(topicId));
}

/* ---------------------------------- 2. every neighbouring transition */
for (let n = 1; n <= 11; n++) {
    const done = Array.from({ length: n }, (_, i) => i + 1);
    ok(unlocked(done, n + 1), `${n} completed → topic ${n + 1} unlocks`);
    if (n + 2 <= 12) {
        ok(!unlocked(done, n + 2),
            `${n} completed → topic ${n + 2} stays locked (no skipping)`);
    }
}
/* the reported case, stated on its own */
ok(unlocked([1, 2, 3, 4, 5, 6, 7, 8, 9], 10), 'topic 9 completed → topic 10 unlocks');
ok(!unlocked([1, 2, 3, 4, 5, 6, 7, 8], 10), 'topic 9 NOT completed → topic 10 locked');
ok(unlocked([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 12),
    'the final topic stays open once completed');
ok(!Array.from({ length: 12 }, (_, i) => i + 1).includes(13),
    'there is no topic 13 to unlock');

/* ------------------------------- 3. reload reconciliation — the real fix */
{
    const w = new JSDOM('<!doctype html><body></body>',
        { runScripts: 'outside-only', url: 'https://uzdarus.test/' }).window;
    /* The reconciler and the helpers it uses, lifted from the page. */
    w.eval(['cleanTopicIds', 'readCachedTopics', 'writeCachedTopics',
        'reconcileCompletedTopics'].map(lift).join('\n'));

    async function reload(local, remote, opts = {}) {
        w.localStorage.setItem('a1_progress_u1', JSON.stringify(local));
        w.__repaired = null;
        w.saveUserProgress = opts.noSaver
            ? undefined
            : async (uid, course, data) => {
                if (opts.failRepair) throw new Error('offline');
                w.__repaired = data.completedTopics;
            };
        const out = await w.reconcileCompletedTopics('u1',
            remote === null ? null : { completedTopics: remote });
        let stored = null;
        try { stored = JSON.parse(w.localStorage.getItem('a1_progress_u1')); } catch (e) { /* */ }
        return { out, stored, repaired: w.__repaired };
    }

    return (async () => {
        /* ---------------- ATTACK 1: a forged cache must not escalate --------- */
        let r = await reload([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], [1, 2, 3]);
        eq('forged localStorage cannot escalate remote course progress', r.out, [1, 2, 3]);
        ok(r.repaired === null, 'a forged cache is never written to the server');
        /* Topic 4 IS legitimately open — the server says 3 is done. What the
           forgery must not buy is anything BEYOND the server's own frontier. */
        ok(unlocked(r.out, 4), 'the server frontier still opens the next topic');
        ok(!unlocked(r.out, 5), 'a forged cache does not unlock topic 5');
        ok(!unlocked(r.out, 12), 'a forged cache does not unlock topic 12');

        /* ---------------- ATTACK 2: forging a single topic ------------------- */
        r = await reload([1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 5, 6, 7, 8]);
        eq('a single forged topic is not adopted', r.out, [1, 2, 3, 4, 5, 6, 7, 8]);
        ok(r.repaired === null, 'no server repair from an unverifiable local claim');
        ok(!unlocked(r.out, 10), 'topic 10 stays locked on a forged claim');

        /* -------- the server record is the truth whenever it exists ---------- */
        r = await reload([1, 2, 3], [1, 2, 3, 4, 5]);
        eq('the server record is adopted in full', r.out, [1, 2, 3, 4, 5]);
        ok(r.repaired === null, 'reading never writes');
        eq('the cache is refreshed FROM the server', r.stored, [1, 2, 3, 4, 5]);

        /* ---- no server record at all: the cache may be shown, never promoted */
        r = await reload([1, 2, 3, 4], null);
        eq('with no server record the cache is shown', r.out, [1, 2, 3, 4]);
        ok(r.repaired === null, 'and it is still never written to the server');

        /* junk in the cache is not a topic */
        r = await reload([1, '2', null, 3, {}, 'x', -4, 2.5], null);
        eq('only positive integer topic ids survive', r.out, [1, 2, 3]);

        /* corrupt cache must not take the page down */
        w.localStorage.setItem('a1_progress_u1', '{not json');
        const out = await w.reconcileCompletedTopics('u1', { completedTopics: [1, 2] });
        eq('corrupt cache falls back to the server copy', out, [1, 2]);
        w.localStorage.setItem('a1_progress_u1', '{not json');
        eq('corrupt cache with no server record yields nothing',
            await w.reconcileCompletedTopics('u1', null), []);

        /* ---------------------- 4. the read path really uses it ---------- */
        /* Checked against the FUNCTION BODY, not the whole file: the fix's own
           comment quotes the old line, and a test that grepped the file would
           be satisfied by deleting that explanation. */
        const loadBody = lift('loadUserData');
        ok(/completedTopics = reconcileCompletedTopics\(/.test(loadBody),
            'loadUserData() goes through the reconciler');
        ok(!/^\s*completedTopics = savedProgress\.completedTopics;/m.test(loadBody),
            'the destructive assignment is gone from loadUserData()');

        /* READING MUST NOT WRITE. This is the whole security property: a page
           load may never push anything to the server, because everything it
           could push came from a store the user controls. */
        const readBody = lift('reconcileCompletedTopics');
        ok(!/saveUserProgress/.test(readBody),
            'reconcileCompletedTopics() never calls saveUserProgress');
        ok(!/await/.test(readBody),
            'reconcileCompletedTopics() performs no remote work at all');

        /* THE CLIENT NO LONGER AUTHORS PROGRESS AT ALL.
           It used to compute the array itself (server record ∪ this session) and
           write it with saveUserProgress. Firestore rules now refuse
           completedTopics from the owner, so the array is claimed one topic at a
           time through /api/progress and the SERVER's answer is adopted. */
        const saveBody = lift('saveProgressToFirebase');
        ok(/window\.completeCourseTopic\('A1', id\)/.test(saveBody),
            'saveProgressToFirebase() claims topics through the server endpoint');
        ok(!/saveUserProgress/.test(saveBody),
            'it no longer writes progress to Firestore directly');
        ok(/sessionCompletedTopics/.test(saveBody),
            'only topics graded in this session are claimed');
        ok(!/\.\.\.completedTopics\b/.test(saveBody),
            'the in-memory array — which may be cache-seeded — is never the claim set');
        ok(/const sessionCompletedTopics = new Set\(\)/.test(S),
            'the session set exists');
        ok(/sessionCompletedTopics\.add\(topicId\)/.test(S),
            'only __uzCompleteTopic vouches for a topic');

        /* PROMOTION HAPPENS AFTER THE SERVER ANSWERS, NEVER BEFORE, and what is
           adopted is the SERVER's array — not anything the client assembled. */
        const awaitAt = saveBody.indexOf('await window.completeCourseTopic');
        const assignAt = saveBody.search(/^\s*completedTopics = authoritative;/m);
        ok(awaitAt > 0 && assignAt > awaitAt,
            'in-memory progress moves only after the server accepted the claim');
        ok(/completedTopics = authoritative;/.test(saveBody),
            'the adopted array is the one the server returned');
        ok(/if \(!Array\.isArray\(next\)\)[\s\S]{0,60}return false;/.test(saveBody),
            'a refused claim reports failure instead of pretending');

        /* A FAILED SAVE MUST NOT CLAIM SUCCESS. */
        const completeBody = S.slice(S.indexOf('window.__uzCompleteTopic = async function'));
        ok(/if \(!saved\)/.test(completeBody), 'a failed save is detected');
        ok(/sessionCompletedTopics\.delete\(topicId\)/.test(completeBody),
            'a failed save withdraws the session claim');
        ok(/__uzShowSaveFailure\(topicId\)/.test(completeBody),
            'a failed save tells the learner');
        const failBody = lift('__uzShowSaveFailure');
        ok(/qayta urinib ko/i.test(failBody), 'the message is in the interface language');
        ok(/Qayta saqlash/.test(failBody), 'a retry control is offered');
        ok(!/Firebase|permission-denied|undefined/.test(failBody),
            'no technical error text reaches the learner');
        ok(!/setInterval/.test(failBody), 'the retry is manual — no polling was added');

        /* NO TOPIC IS SPECIAL-CASED. */
        ok(!/topicId\s*===\s*(9|10)\b/.test(S),
            'no topic number is hard-coded into completion or unlocking');

        console.log('='.repeat(60));
        if (fail) {
            console.log(`  ❌ A1 PROGRESSION: ${fail} failed / ${pass + fail}\n`);
            failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
            console.log('='.repeat(60) + '\n');
            process.exit(1);
        }
        console.log(`  ✅ A1 PROGRESSION: ${pass}/${pass} passed`);
        console.log('='.repeat(60) + '\n');
    })();
}
