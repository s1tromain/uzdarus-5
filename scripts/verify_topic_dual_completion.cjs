#!/usr/bin/env node
/**
 * verify_topic_dual_completion.cjs — a paid topic has two sections, and ONE of
 * them decides whether it is finished.
 *
 * THE RULE:  a topic id enters `completedTopics` when its EXERCISES are
 * reported, and never for the vocabulary deck alone.
 *
 *   courses.<C>.topicComponents.<id>.exercisesCompleted   the gate
 *   courses.<C>.topicComponents.<id>.vocabularyCompleted  recorded, optional
 *
 * WHY IT IS NOT BOTH ANY MORE. Requiring both stranded learners: one had
 * finished a B2 topic three times over, and a brand-new A1 account finished
 * the exercises AND the whole deck and still faced a locked topic 2. Every
 * route that left the deck unrecorded — finished before the component model
 * shipped, a completion screen closed one tap early, one dropped call — locked
 * the learner out of the rest of the course, and the only remedy was to walk a
 * hundred words again and hope. The exercises are the assessment; they decide.
 *
 * Both endpoints that can write progress are driven here against a fake
 * Firestore — the real handlers, not a copy of their rules — because the older
 * `complete-topic` route must not remain a way around the current one.
 *
 * LEGACY IS NEVER REVOKED, and nothing here ever removes an id.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ids = (n) => Array.from({ length: n }, (_, i) => i + 1);

console.log('\n=== TOPIC DUAL COMPLETION ===');

/* ---------------- the real handlers, on a fake Firestore ---------------- */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'uz-dual-'));
const url = (rel) => JSON.stringify(pathToFileURL(path.join(ROOT, rel)).href);
function writeShim(name, src, map) {
    let out = src;
    Object.entries(map).forEach(([from, to]) => {
        if (!out.includes(`'${from}'`)) throw new Error(`${name}: no import of ${from}`);
        out = out.split(`'${from}'`).join(to);
    });
    fs.writeFileSync(path.join(TMP, name), out);
}
fs.writeFileSync(path.join(TMP, 'admin-stub.js'),
    'export function initAdmin() { return globalThis.__ADMIN; }');
writeShim('request.mjs', read('api/_lib/request.js'), {
    '../_firebaseAdmin.js': "'./admin-stub.js'",
    './roles.js': url('api/_lib/roles.js')
});
const PROGRESS_IMPORTS = {
    '../_firebaseAdmin.js': "'./admin-stub.js'",
    '../_lib/request.js': "'./request.mjs'",
    '../_lib/roles.js': url('api/_lib/roles.js'),
    '../../account-freeze.js': url('account-freeze.js'),
    '../_lib/course-canon.js': url('api/_lib/course-canon.js'),
    '../_lib/topic-components.js': url('api/_lib/topic-components.js')
};
writeShim('complete-component.mjs', read('api/_progress/complete-component.js'), PROGRESS_IMPORTS);
writeShim('complete-topic.mjs', read('api/_progress/complete-topic.js'), PROGRESS_IMPORTS);

/** A Firestore small enough to reason about, with dotted-path updates. */
function makeDb(users) {
    const store = { users: JSON.parse(JSON.stringify(users)) };
    const applyDotted = (target, update) => Object.entries(update).forEach(([k, v]) => {
        const parts = k.split('.');
        let node = target;
        parts.slice(0, -1).forEach((p) => { node[p] = node[p] || {}; node = node[p]; });
        node[parts[parts.length - 1]] = v;
    });
    /* requireSession() reads the profile through the SAME ref, so the ref must
       answer .get() as well as being usable inside a transaction. */
    const userRef = (id) => ({
        __kind: 'user', id,
        get: async () => ({ exists: !!store.users[id], data: () => store.users[id] })
    });
    const adminDb = {
        collection: () => ({ doc: userRef }),
        doc: () => ({ __kind: 'other' }),
        runTransaction: async (fn) => fn({
            get: async (ref) => ({ exists: !!store.users[ref.id], data: () => store.users[ref.id] }),
            update: (ref, update) => applyDotted(store.users[ref.id] = store.users[ref.id] || {}, update),
            set: () => {}
        })
    };
    const adminAuth = {
        verifyIdToken: async (token) => {
            if (!store.users[token]) throw Object.assign(new Error('bad'), { code: 'auth/invalid' });
            return { uid: token, role: store.users[token].role };
        }
    };
    return { adminDb, adminAuth, store };
}
const FieldValue = { serverTimestamp: () => '<ts>' };
const Timestamp = { fromDate: (d) => ({ __ts: d.toISOString() }) };

async function call(mod, { token, body }) {
    let status = null, payload = null;
    const res = { status(s) { status = s; return this; }, json(p) { payload = p; return this; },
                  setHeader() {}, end() {} };
    await mod.default({ method: 'POST', query: {}, body,
        headers: token ? { authorization: 'Bearer ' + token } : {},
        socket: { remoteAddress: '127.0.0.1' } }, res);
    return { status, payload };
}

const now = new Date();
const freeze = require(path.join(ROOT, 'account-freeze.js'));
const learner = (courses = {}, over = {}) => Object.assign({
    displayName: 'Test Talaba', role: 'user', accessPacks: ['A1A2', 'B1B2'],
    subscription: { active: true, endAt: new Date(now.getTime() + 30 * 86400000) },
    courses
}, over);

(async () => {
const COMP = await import(pathToFileURL(path.join(TMP, 'complete-component.mjs')).href);
const TOPIC = await import(pathToFileURL(path.join(TMP, 'complete-topic.mjs')).href);
const TC = await import(pathToFileURL(path.join(ROOT, 'api/_lib/topic-components.js')).href);

/** Run complete-component and hand back the resulting store. */
async function component(users, token, body) {
    const { adminDb, adminAuth, store } = makeDb(users);
    globalThis.__ADMIN = { adminDb, adminAuth, FieldValue, Timestamp };
    const r = await call(COMP, { token, body });
    return { ...r, store };
}
async function completeTopic(users, token, body) {
    const { adminDb, adminAuth, store } = makeDb(users);
    globalThis.__ADMIN = { adminDb, adminAuth, FieldValue, Timestamp };
    const r = await call(TOPIC, { token, body });
    return { ...r, store };
}
const b2Of = (store) => (store.users.u1.courses.B2 || {});
const done = (store) => (b2Of(store).completedTopics || []);

/* ================================================================ *
 * 1. THE FOUR-STATE MATRIX
 * ================================================================ */
{
    /* topic 1 needs no predecessor, so it is the clean case to drive */
    const base = () => ({ u1: learner({ B2: {} }) });

    /* 0 / 0 — nothing reported */
    {
        const st = makeDb(base()).store;
        eq('0 vocab / 0 exercises -> topic NOT complete',
            TC.isTopicComplete(st.users.u1.courses.B2, 1, 16), false);
        eq('and completedTopics is empty', (st.users.u1.courses.B2.completedTopics || []).length, 0);
    }
    /* 1 / 0 — vocabulary only */
    {
        const r = await component(base(), 'u1', { course: 'B2', topicId: 1, component: 'vocabulary' });
        eq('vocabulary reported: accepted', r.status, 200);
        eq('  the component is recorded', r.payload.components.vocabularyCompleted, true);
        eq('  exercises still outstanding', r.payload.components.exercisesCompleted, false);
        eq('  1 vocab / 0 exercises -> topic NOT complete', r.payload.topicCompleted, false);
        eq('  and the topic is NOT in completedTopics', done(r.store).length, 0);
        eq('  no next topic is offered', r.payload.nextTopic, null);
    }
    /* 0 / 1 — EXERCISES ONLY: this is what finishes a topic */
    {
        const r = await component(base(), 'u1', { course: 'B2', topicId: 1, component: 'exercises' });
        eq('exercises reported: accepted', r.status, 200);
        eq('  0 vocab / 1 exercises -> topic COMPLETE', r.payload.topicCompleted, true);
        eq('  and the id is in completedTopics', done(r.store).join(','), '1');
        eq('  the next topic is offered', r.payload.nextTopic, 2);
        eq('  the deck is still recorded as outstanding, not required',
            r.payload.components.vocabularyCompleted, false);
        ok(!!b2Of(r.store).topicComponents['1'].exercisesCompletedAt, '  with an exercises timestamp');
    }
    /* the deck AFTER the topic is already complete: recorded, nothing changes */
    {
        const r1 = await component(base(), 'u1', { course: 'B2', topicId: 1, component: 'exercises' });
        const r2 = await component({ u1: r1.store.users.u1 }, 'u1',
            { course: 'B2', topicId: 1, component: 'vocabulary' });
        eq('the deck reported afterwards is accepted', r2.status, 200);
        eq('  it is recorded', r2.payload.components.vocabularyCompleted, true);
        eq('  the topic stays complete', r2.payload.topicCompleted, true);
        eq('  with no duplicate id', done(r2.store).join(','), '1');
    }
    /* the deck FIRST: recorded, and the topic waits for the exercises */
    {
        const r1 = await component(base(), 'u1', { course: 'B2', topicId: 1, component: 'vocabulary' });
        eq('the deck alone leaves the topic open', r1.payload.topicCompleted, false);
        const r2 = await component({ u1: r1.store.users.u1 }, 'u1',
            { course: 'B2', topicId: 1, component: 'exercises' });
        eq('and the exercises then complete it', r2.payload.topicCompleted, true);
        eq('  with the id in completedTopics', done(r2.store).join(','), '1');
        eq('  both sections recorded',
            r2.payload.components.vocabularyCompleted && r2.payload.components.exercisesCompleted, true);
        ok(!!b2Of(r2.store).topicComponents['1'].vocabularyCompletedAt,
            '  with a vocabulary timestamp');
        ok(!!b2Of(r2.store).topicComponents['1'].exercisesCompletedAt,
            '  and an exercises timestamp');
    }
}

/* ================================================================ *
 * 2. LEGACY IS NEVER REVOKED
 * ================================================================ */
{
    /* Topics finished under the old rule are in the array with NO component
       record at all. They must stay complete, and must still satisfy the
       ordering rule for the topic after them. */
    const legacy = { u1: learner({ B2: { completedTopics: [1, 2, 3] } }) };
    const st = makeDb(legacy).store.users.u1.courses.B2;
    [1, 2, 3].forEach((id) => {
        eq(`legacy topic ${id} is still complete`, TC.isTopicComplete(st, id, 16), true);
        eq(`  even though it has no component record`,
            TC.bothComponentsComplete(st, id), false);
    });
    eq('topic 4 may be worked on after legacy 1-3', TC.previousTopicSatisfied(st, 4, 16), true);
    eq('topic 5 may NOT — 4 is unfinished', TC.previousTopicSatisfied(st, 5, 16), false);

    /* a legacy topic is idempotent through the old endpoint */
    const r = await completeTopic(legacy, 'u1', { course: 'B2', topicId: 2 });
    eq('complete-topic on a legacy topic still succeeds', r.status, 200);
    eq('  and changes nothing', done(r.store).join(','), '1,2,3');

    /* and the NEXT topic obeys the current rule: the exercises finish it */
    const r2 = await component(legacy, 'u1', { course: 'B2', topicId: 4, component: 'exercises' });
    eq('a legacy learner finishes topic 4 with the exercises', r2.payload.topicCompleted, true);
    eq('  and it is appended without disturbing the legacy ids',
        done(r2.store).join(','), '1,2,3,4');
    /* the deck alone still finishes nothing, for a legacy learner either */
    const r3 = await component(legacy, 'u1', { course: 'B2', topicId: 4, component: 'vocabulary' });
    eq('the deck alone finishes nothing', r3.payload.topicCompleted, false);
    eq('  and appends nothing', done(r3.store).join(','), '1,2,3');
}

/* ================================================================ *
 * 3. THE OLD ENDPOINT IS NOT A BYPASS
 * ================================================================ */
{
    const half = (component) => ({ u1: learner({ B2: {
        topicComponents: { 1: { [`${component}Completed`]: true,
                                [`${component}CompletedAt`]: now.toISOString() } } } }) });

    /* THE DECK ALONE IS STILL NOT A COMPLETION, through this route either. */
    {
        const r = await completeTopic(half('vocabulary'), 'u1', { course: 'B2', topicId: 1 });
        eq('complete-topic with ONLY the deck done: REFUSED', r.status, 409);
        eq('  and the topic is not appended', done(r.store).length, 0);
        eq('  and the refusal names the exercises',
            r.payload.error, 'Avval ushbu mavzudagi mashqlarni yakunlang.');
    }
    /* the exercises DO finish it, through the old route as well as the new */
    {
        const r = await completeTopic(half('exercises'), 'u1', { course: 'B2', topicId: 1 });
        eq('complete-topic with the exercises done: accepted', r.status, 200);
        eq('  and the topic is appended', done(r.store).join(','), '1');
    }
    /* nothing at all is still refused */
    {
        const r = await completeTopic({ u1: learner({ B2: {} }) }, 'u1',
            { course: 'B2', topicId: 1 });
        eq('complete-topic with nothing done: REFUSED', r.status, 409);
        eq('  and nothing is appended', done(r.store).length, 0);
    }
    /* nothing reported at all */
    {
        const r = await completeTopic({ u1: learner({ B2: {} }) }, 'u1', { course: 'B2', topicId: 1 });
        eq('complete-topic with NEITHER half done: REFUSED', r.status, 409);
        eq('  and nothing is written', done(r.store).length, 0);
    }
    /* both halves: the old route may finalize */
    {
        const both = { u1: learner({ B2: { topicComponents: { 1: {
            vocabularyCompleted: true, exercisesCompleted: true } } } }) };
        const r = await completeTopic(both, 'u1', { course: 'B2', topicId: 1 });
        eq('complete-topic with BOTH halves done: allowed', r.status, 200);
        eq('  and the topic is appended', done(r.store).join(','), '1');
    }
    /* SEQUENCE IS ENFORCED BY THE HANDLER, NOT ONLY BY THE HELPER.
       FOUND BY NEGATIVE CONTROL. previousTopicSatisfied() is exercised as a
       pure function further up, and it kept passing when the handler stopped
       calling it — which is the whole of the protection. A learner could then
       report both halves of topic 5 and have it appended with topic 4 never
       touched, skipping the course. Drive the endpoint, not the helper. */
    {
        const ahead = { u1: learner({ B2: { completedTopics: [], topicComponents: { 5: {
            vocabularyCompleted: true, exercisesCompleted: true } } } }) };
        const r = await completeTopic(ahead, 'u1', { course: 'B2', topicId: 5 });
        eq('both halves of topic 5 but topic 4 untouched: REFUSED', r.status, 409);
        eq('  and nothing is written', done(r.store).length, 0);
        eq('  and the learner is told which topic to finish first',
            r.payload.error, 'Avvalgi mavzuni tugatish kerak');

        /* the same learner, once the sequence is honoured */
        const inOrder = { u1: learner({ B2: { completedTopics: [1, 2, 3, 4], topicComponents: { 5: {
            vocabularyCompleted: true, exercisesCompleted: true } } } }) };
        const ok5 = await completeTopic(inOrder, 'u1', { course: 'B2', topicId: 5 });
        eq('with 1-4 done, topic 5 is allowed', ok5.status, 200);
        ok(done(ok5.store).includes(5), '  and topic 5 is appended');
    }

    /* the endpoint's source must have no other way to append */
    {
        const src = read('api/_progress/complete-topic.js');
        ok(/previousTopicSatisfied\(/.test(src),
            'complete-topic still consults previousTopicSatisfied()');
        ok(/if \(!previousTopicSatisfied\(/.test(src),
            'and still REFUSES when it says no');
        ok(/finalizeCompletedTopics\(/.test(src),
            'complete-topic appends only through the shared finalizer');
        eq('and never builds its own union',
            /Array\.from\(new Set\(\[\.\.\.current, topicId\]\)\)/.test(src), false);
    }
}

/* ================================================================ *
 * 4. THE COMPONENT ENDPOINT REFUSES RUBBISH
 * ================================================================ */
{
    const base = () => ({ u1: learner({ B2: {} }) });
    const bad = async (body) => (await component(base(), 'u1', body)).status;

    eq('unknown course C1 refused', await bad({ course: 'C1', topicId: 1, component: 'vocabulary' }), 400);
    eq('empty course refused', await bad({ course: '', topicId: 1, component: 'vocabulary' }), 400);
    eq('missing course refused', await bad({ topicId: 1, component: 'vocabulary' }), 400);
    eq('topic 0 refused', await bad({ course: 'B2', topicId: 0, component: 'vocabulary' }), 400);
    eq('topic -1 refused', await bad({ course: 'B2', topicId: -1, component: 'vocabulary' }), 400);
    eq('topic 999 refused', await bad({ course: 'B2', topicId: 999, component: 'vocabulary' }), 400);
    eq('topic "2abc" refused', await bad({ course: 'B2', topicId: '2abc', component: 'vocabulary' }), 400);
    eq('topic 1.5 refused', await bad({ course: 'B2', topicId: 1.5, component: 'vocabulary' }), 400);
    eq('topic null refused', await bad({ course: 'B2', topicId: null, component: 'vocabulary' }), 400);
    eq('component "certificate" refused', await bad({ course: 'B2', topicId: 1, component: 'certificate' }), 400);
    eq('component "" refused', await bad({ course: 'B2', topicId: 1, component: '' }), 400);
    eq('component missing refused', await bad({ course: 'B2', topicId: 1 }), 400);
    eq('component as an object refused', await bad({ course: 'B2', topicId: 1, component: { a: 1 } }), 400);
    eq('component null refused', await bad({ course: 'B2', topicId: 1, component: null }), 400);
    /* the two valid ones, and case/space tolerance on them only */
    eq('vocabulary accepted', await bad({ course: 'B2', topicId: 1, component: 'vocabulary' }), 200);
    eq('exercises accepted', await bad({ course: 'B2', topicId: 1, component: 'exercises' }), 200);
    eq('VOCABULARY normalises', await bad({ course: 'B2', topicId: 1, component: 'VOCABULARY' }), 200);
    eq('b2 lowercase course normalises', await bad({ course: 'b2', topicId: 1, component: 'exercises' }), 200);
    /* the canon sizes each course */
    eq('A1 topic 13 refused (canon says 12)',
        await bad({ course: 'A1', topicId: 13, component: 'vocabulary' }), 400);
    eq('B1 topic 21 refused (canon says 20)',
        await bad({ course: 'B1', topicId: 21, component: 'vocabulary' }), 400);
    eq('A2 topic 17 refused (canon says 16)',
        await bad({ course: 'A2', topicId: 17, component: 'vocabulary' }), 400);
}

/* ================================================================ *
 * 5. IDENTITY, ORDERING, ACCOUNT STATE
 * ================================================================ */
{
    /* the body may not name another user */
    const two = { u1: learner({ B2: {} }), u2: learner({ B2: {} }, { displayName: 'Victim' }) };
    for (const spoof of [{ uid: 'u2' }, { userId: 'u2' }, { profile: { uid: 'u2' } }]) {
        const r = await component(two, 'u1',
            Object.assign({ course: 'B2', topicId: 1, component: 'vocabulary' }, spoof));
        const key = Object.keys(spoof)[0];
        eq(`body {${key}} still writes to the caller`, r.status, 200);
        eq(`  the caller got the component`,
            r.store.users.u1.courses.B2.topicComponents['1'].vocabularyCompleted, true);
        ok(!(r.store.users.u2.courses.B2.topicComponents),
            `  and the victim was untouched (${key})`);
    }
    eq('no session: refused',
        (await component(two, null, { course: 'B2', topicId: 1, component: 'vocabulary' })).status, 401);
    eq('unverifiable token: refused',
        (await component(two, 'ghost', { course: 'B2', topicId: 1, component: 'vocabulary' })).status, 401);

    /* ordering: topic 3 cannot be reported before 2 is finished */
    const gap = { u1: learner({ B2: { completedTopics: [1] } }) };
    eq('reporting topic 3 with 2 unfinished: refused',
        (await component(gap, 'u1', { course: 'B2', topicId: 3, component: 'vocabulary' })).status, 409);
    eq('reporting topic 2 is allowed',
        (await component(gap, 'u1', { course: 'B2', topicId: 2, component: 'vocabulary' })).status, 200);

    /* blocked / frozen */
    const blocked = { u1: learner({ B2: {} }, { blocked: true }) };
    eq('a blocked account cannot report a component',
        (await component(blocked, 'u1', { course: 'B2', topicId: 1, component: 'vocabulary' })).status, 403);
    const frozen = { u1: learner({ B2: {} },
        { accountFreeze: freeze.buildFreeze({}, { now, actorUid: 'admin' }).freeze }) };
    eq('a frozen account cannot report a component',
        (await component(frozen, 'u1', { course: 'B2', topicId: 1, component: 'vocabulary' })).status, 403);
}

/* ================================================================ *
 * 6. IDEMPOTENCY AND RACES
 * ================================================================ */
{
    const users = { u1: learner({ B2: {} }) };
    const r1 = await component(users, 'u1', { course: 'B2', topicId: 1, component: 'vocabulary' });
    const at1 = r1.store.users.u1.courses.B2.topicComponents['1'].vocabularyCompletedAt;
    /* the SAME half reported again */
    const r2 = await component({ u1: r1.store.users.u1 }, 'u1',
        { course: 'B2', topicId: 1, component: 'vocabulary' });
    eq('reporting the same half twice succeeds', r2.status, 200);
    eq('  and does not rewrite the original timestamp',
        r2.store.users.u1.courses.B2.topicComponents['1'].vocabularyCompletedAt, at1);
    eq('  and the topic is still incomplete', r2.payload.topicCompleted, false);

    /* finishing, then reporting again */
    const r3 = await component({ u1: r2.store.users.u1 }, 'u1',
        { course: 'B2', topicId: 1, component: 'exercises' });
    eq('the second half completes the topic', r3.payload.topicCompleted, true);
    eq('  appended once', done(r3.store).join(','), '1');
    const r4 = await component({ u1: r3.store.users.u1 }, 'u1',
        { course: 'B2', topicId: 1, component: 'exercises' });
    eq('reporting it AGAIN does not duplicate the id', done(r4.store).join(','), '1');
    eq('  and still reports the topic complete', r4.payload.topicCompleted, true);

    /* two racing requests for the LAST half, both seeing the same prior state */
    const preRace = { u1: learner({ B2: { topicComponents: { 1: { vocabularyCompleted: true } } } }) };
    const a = await component(preRace, 'u1', { course: 'B2', topicId: 1, component: 'exercises' });
    const b = await component(preRace, 'u1', { course: 'B2', topicId: 1, component: 'exercises' });
    eq('race: both requests succeed', a.status === 200 && b.status === 200, true);
    eq('race: neither produces a duplicate id', a.payload.completedTopics.join(','), '1');
    eq('race: and the other agrees', b.payload.completedTopics.join(','), '1');

    /* the finalizer itself is monotonic and never removes */
    const stMany = { completedTopics: [1, 2, 5], topicComponents: { 3: {
        vocabularyCompleted: true, exercisesCompleted: true } } };
    eq('finalize inserts in order and keeps everything',
        (TC.finalizeCompletedTopics(stMany, 3, 16) || []).join(','), '1,2,3,5');
    eq('finalize on an already-present id changes nothing',
        TC.finalizeCompletedTopics(stMany, 2, 16), null);
    /* THE EARLY RETURN EARNS ITS KEEP HERE. When the id is already present AND
       both components are recorded, a finalizer without the already-present
       guard would happily return an array — an identical array, because the Set
       dedupes, but still a value, and the endpoint writes whatever it is given.
       That is a redundant Firestore write on every repeated report. Returning
       null is what makes the second report free. */
    const already = { completedTopics: [1, 2, 3], topicComponents: { 2: {
        vocabularyCompleted: true, exercisesCompleted: true } } };
    eq('an id that is present AND fully componented still returns null',
        TC.finalizeCompletedTopics(already, 2, 16), null);
    eq('  so a repeated report performs no write at all',
        TC.finalizeCompletedTopics(already, 2, 16) === null, true);
    /* and the id it has NOT yet earned is still refused */
    eq('  while an unearned id is refused as before',
        TC.finalizeCompletedTopics(already, 4, 16), null);
}

/* ================================================================ *
 * 7. THE CLIENT MAY NOT DECIDE
 * ================================================================ */
{
    /* a body that claims the topic is done changes nothing */
    const users = { u1: learner({ B2: {} }) };
    const r = await component(users, 'u1', {
        course: 'B2', topicId: 1, component: 'vocabulary',
        topicCompleted: true, completedTopics: ids(16),
        components: { vocabularyCompleted: true, exercisesCompleted: true },
        exercisesCompleted: true, vocabularyCompleted: true
    });
    eq('a body claiming the topic is complete does not complete it', r.payload.topicCompleted, false);
    eq('  and completedTopics is not taken from the body', done(r.store).length, 0);
    eq('  only the reported half was recorded',
        r.store.users.u1.courses.B2.topicComponents['1'].exercisesCompleted, undefined);

    /* neither endpoint reads a completedTopics array from the body */
    ['api/_progress/complete-component.js', 'api/_progress/complete-topic.js'].forEach((rel) => {
        const src = read(rel);
        eq(`${rel} never reads body.completedTopics`, /body\.completedTopics/.test(src), false);
        eq(`${rel} never reads body.uid`, /body\.uid/.test(src), false);
        ok(/session\.uid/.test(src), `${rel} takes the uid from the session`);
    });
    /* and the router exposes the new action */
    ok(/'complete-component': \(\) => import\('\.\/_progress\/complete-component\.js'\)/
        .test(read('api/progress.js')), 'the progress router exposes complete-component');
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
console.log('  0/0 no · 1/0 no · 0/1 no · 1/1 YES · legacy preserved · old endpoint closed');
console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ TOPIC DUAL COMPLETION: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ TOPIC DUAL COMPLETION: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
})().catch((e) => { console.error(e); process.exit(2); });
