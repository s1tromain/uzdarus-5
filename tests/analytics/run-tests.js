#!/usr/bin/env node
/**
 * Analytics validation suite.
 *   node tests/analytics/run-tests.js
 *
 * Covers: event validation, summary folding, dashboard aggregation, overview
 * rows (pure), and the Firestore write/read paths (mock Firestore). Exit 0 iff
 * all assertions pass.
 */

import {
    sanitizeEvent, sanitizeBatch, applyEventsToSummary, summaryToStats,
    buildStudentDashboard, buildStudentOverviewRow, dayKey,
} from '../../api/_lib/analytics.js';
import { ingestEvents, readStudentDashboard } from '../../api/_lib/analytics-store.js';
import { makeAdmin } from './mock-firestore.js';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ~${b})`); }
function section(t) { console.log('\n• ' + t); }

const DAY = 86400000;
const NOW = Date.UTC(2026, 6, 11, 12, 0, 0); // fixed clock

// ============================ sanitizeEvent ============================
section('sanitizeEvent — validation & whitelisting');
{
    const e = sanitizeEvent({ t: 'pron', course: 'a2', topic: 5, cts: NOW,
        data: { expected: 'делать', recognized: 'делать', score: 88, stars: 4, pass: true, evil: 'x', accuracy: 90 } }, NOW);
    ok(e && e.t === 'pron', 'pron type preserved');
    eq(e.course, 'A2', 'course normalized to uppercase');
    eq(e.topic, 5, 'topic kept');
    ok(e.data.evil === undefined, 'non-whitelisted key "evil" dropped');
    eq(e.data.pass, true, 'boolean pass kept');
    eq(e.data.score, 88, 'numeric score kept');

    ok(sanitizeEvent({ t: 'not_a_type' }, NOW) === null, 'unknown type rejected');
    ok(sanitizeEvent(null, NOW) === null, 'null rejected');

    const long = sanitizeEvent({ t: 'pron', data: { expected: 'x'.repeat(1000) } }, NOW);
    ok(long.data.expected.length === 300, 'oversized string clamped to 300');

    const future = sanitizeEvent({ t: 'session', cts: NOW + 999 * DAY, data: { activeMs: 1000 } }, NOW);
    ok(future.cts <= NOW + 5 * 60 * 1000, 'future cts clamped');

    const b = sanitizeBatch([{ t: 'pron', data: { score: 1 } }, { t: 'junk' }, null, { t: 'session', data: { activeMs: 5 } }], NOW);
    eq(b.events.length, 2, 'batch keeps 2 valid');
    eq(b.dropped, 2, 'batch drops 2 invalid');
}

// ========================= applyEventsToSummary =========================
section('applyEventsToSummary — aggregation');
{
    const events = [
        { t: 'session', cts: NOW, data: { activeMs: 60000 } },
        { t: 'pron', cts: NOW, data: { score: 90 } },
        { t: 'pron', cts: NOW, data: { score: 70 } },
        { t: 'vocab_done', cts: NOW, data: { learned: 5 } },
        { t: 'ex_done', cts: NOW, data: { score: 8, total: 10 } },
        { t: 'exam_pass', cts: NOW, data: { score: 85 } },
        { t: 'exam_fail', cts: NOW, data: { score: 40 } },
    ];
    const s = applyEventsToSummary(null, events);
    eq(s.learningMs, 60000, 'learningMs summed');
    eq(s.sessions, 1, 'sessions counted');
    eq(s.pron, 2, 'pron count');
    eq(s.pronScoreSum, 160, 'pron score sum');
    eq(s.words, 5, 'words from vocab_done');
    eq(s.exercises, 1, 'exercises counted');
    eq(s.exScoreSum, 80, 'exercise percent summed (8/10=80)');
    eq(s.examsPassed, 1, 'examsPassed');
    eq(s.examsTaken, 2, 'examsTaken = pass+fail');
    eq(s.daily[dayKey(NOW)], 60000, 'daily bucket for today');

    const s2 = applyEventsToSummary(s, [{ t: 'session', cts: NOW, data: { activeMs: 30000 } }]);
    eq(s2.learningMs, 90000, 'accumulates across calls');
    eq(s2.daily[dayKey(NOW)], 90000, 'daily bucket accumulates');

    // retention: 70 distinct days
    let big = null;
    for (let i = 0; i < 70; i++) big = applyEventsToSummary(big, [{ t: 'session', cts: NOW - i * DAY, data: { activeMs: 1000 } }]);
    ok(Object.keys(big.daily).length <= 62, `daily retention capped (${Object.keys(big.daily).length} <= 62)`);

    const stats = summaryToStats(s2, NOW);
    eq(stats.examsPassed, 1, 'denorm stats.examsPassed');
    eq(stats.words, 5, 'denorm stats.words');
}

// ========================= buildStudentDashboard =========================
section('buildStudentDashboard — reuse + events');
let dash;
{
    const profile = {
        uid: 'u1', username: 'ali', email: 'ali@uzdarus.local', role: 'customer',
        registeredAt: NOW - 40 * DAY, lastActivity: NOW - 2 * 60 * 1000,
        subscription: { active: true, tariff: 'PREMIUM', endAt: NOW + 30 * DAY },
        deviceHashes: ['a', 'b'],
        courses: { A1: { completedTopics: [1, 2, 3, 4, 5, 6], vocabulary: { learnedWords: { '1': 20, '2': 15 } } } },
    };
    const quizResults = [
        { id: 'topic_3', course: 'A1', score: 8, total: 10, timestamp: NOW - DAY },
        { id: 'topic_5_exercises', course: 'A1', sectionA: { q1: 'мой ответ' }, score: 7, total: 10, timestamp: NOW - 2 * DAY },
        { id: 'topic_final', course: 'A1', score: 9, total: 10, timestamp: NOW - 3 * DAY },
    ];
    const certificates = [{ id: 'c1', course: 'A1', number: 100123, issuedAt: NOW - 5 * DAY }];
    const summary = {
        learningMs: 5 * 3600000, pron: 3, pronScoreSum: 264, pronCount: 3,
        examsPassed: 1, examsTaken: 1, lastEventCts: NOW - 60000,
        daily: { [dayKey(NOW)]: 2 * 3600000, [dayKey(NOW - DAY)]: 3600000, [dayKey(NOW - 20 * DAY)]: 3600000 },
    };
    const events = [
        { t: 'topic_open', cts: NOW - 300000, course: 'A1', topic: 6 },
        { t: 'vocab_card', cts: NOW - 200000, course: 'A1', topic: 6, data: { card: 12, total: 40 } },
        { t: 'pron', cts: NOW - 100000, course: 'A1', topic: 6, data: { expected: 'делать', recognized: 'дела', accuracy: 82, completeness: 60, fluency: 70, confidence: 0.8, score: 88, stars: 4, feedback: 'Yaxshi', pass: true } },
        { t: 'exam_pass', cts: NOW - 3 * DAY, course: 'A1', data: { level: 'A1', score: 90 } },
    ];
    dash = buildStudentDashboard({ profile, quizResults, certificates, summary, events, nowMs: NOW });

    eq(dash.courses[0].progressPercent, 50, 'A1 progress 6/12 = 50%');
    eq(dash.courses[0].completedTopics, 6, 'A1 completed topics');
    eq(dash.courses[0].remaining, 6, 'A1 remaining topics');
    eq(dash.courses[0].vocabLearned, 35, 'A1 vocab learned 20+15');
    eq(dash.courses[0].examStatus, 'passed', 'A1 exam status from quizResults');
    ok(dash.courses[0].certificate && dash.courses[0].certificate.number === 100123, 'A1 certificate linked');

    eq(dash.current.topic, 6, 'current topic from latest event');
    eq(dash.current.vocabCard.card, 12, 'current vocab card');
    ok(dash.current.activity, 'current activity label present');

    eq(dash.pronunciation.length, 1, 'one pronunciation attempt');
    eq(dash.pronunciation[0].score, 88, 'pron score stored');
    eq(dash.pronunciation[0].expected, 'делать', 'pron expected stored');
    eq(dash.pronunciation[0].recognized, 'дела', 'pron recognized stored');

    const exDoc = dash.exercises.find(e => e.id === 'topic_5_exercises');
    ok(exDoc && exDoc.answers.some(a => a.answer === 'мой ответ'), 'exercise answers reused from quizResults');
    ok(dash.exercises.find(e => e.id === 'topic_final').kind === 'exam', 'final classified as exam');

    eq(dash.stats.avgPronunciation, 88, 'avg pronunciation from summary (264/3)');
    eq(dash.stats.learningTime.today, 2 * 3600000, 'today learning time');
    eq(dash.stats.learningTime.week, 3 * 3600000, 'week learning time (today+yesterday)');
    eq(dash.stats.topicsCompleted, 6, 'topics completed total');
    near(dash.subscription.daysLeft, 30, 1, 'subscription daysLeft ~30');
    ok(dash.timeline.length === 4, 'timeline has all events');
    ok(dash.timeline[0].label && typeof dash.timeline[0].label === 'string', 'timeline labels are human strings');
    eq(dash.overallProgress, Math.round((6 / (12 + 16 + 20 + 16)) * 100), 'overall progress across all courses');
}

// ========================= buildStudentOverviewRow =========================
section('buildStudentOverviewRow — list/filter row');
{
    const row = buildStudentOverviewRow('u9', {
        username: 'vali', email: 'vali@x', role: 'customer',
        subscription: { active: true, tariff: 'TURBO', endAt: NOW + 10 * DAY },
        lastActivity: NOW - 3600000,
        courses: { A1: { completedTopics: [1, 2, 3], certificateNumber: 500 }, B1: { completedTopics: [1] } },
        stats: { examsPassed: 2, words: 40, lastActiveAt: NOW - 3600000 },
    }, NOW);
    eq(row.completedTopics, 4, 'overview completed topics (3+1)');
    eq(row.activeToday, true, 'active today true');
    eq(row.examsPassed, 2, 'overview examsPassed from stats');
    eq(row.subscription.active, true, 'overview subscription active');
    eq(row.overallProgress, Math.round((4 / 64) * 100), 'overview overall progress');
    eq(row.certificates, 1, 'overview certificates derived from courses.<lvl>.certificateNumber');

    const noCert = buildStudentOverviewRow('u10', { username: 'x', role: 'customer', courses: { A1: { completedTopics: [1] } } }, NOW);
    eq(noCert.certificates, 0, 'overview certificates=0 when none earned');
    eq(noCert.activeToday, false, 'overview inactive when no lastActivity');
}

// ============================ STORE (mock Firestore) ============================
section('ingestEvents / readStudentDashboard — mock Firestore');
async function storeTests() {
    // ingest
    const { admin, db } = makeAdmin();
    db.seed('users/u1', { username: 'ali', role: 'customer', courses: { A1: { completedTopics: [1, 2] } } });
    const r1 = await ingestEvents(admin, 'u1', [
        { t: 'pron', cts: NOW, data: { score: 90, expected: 'x' } },
        { t: 'session', cts: NOW, data: { activeMs: 60000 } },
        { t: 'vocab_done', cts: NOW, data: { learned: 3 } },
        { t: 'garbage' },
    ], NOW);
    eq(r1.written, 3, 'ingest wrote 3 valid events');
    eq(r1.dropped, 1, 'ingest dropped 1 invalid');
    eq(db.list('users/u1/events').length, 3, '3 event docs persisted');
    const sum1 = (await admin.adminDb.collection('users').doc('u1').collection('analytics').doc('summary').get()).data();
    eq(sum1.pron, 1, 'summary pron=1');
    eq(sum1.words, 3, 'summary words=3');
    eq(sum1.learningMs, 60000, 'summary learningMs');
    const user1 = db.docs.get('users/u1');
    ok(user1.stats && user1.stats.words === 3, 'denorm stats written to user doc');

    // second ingest accumulates
    await ingestEvents(admin, 'u1', [{ t: 'pron', cts: NOW, data: { score: 70 } }], NOW);
    const sum2 = (await admin.adminDb.collection('users').doc('u1').collection('analytics').doc('summary').get()).data();
    eq(sum2.pron, 2, 'summary accumulates pron across ingests');
    eq(db.list('users/u1/events').length, 4, 'events accumulate (4 total)');

    // read dashboard
    db.seed('users/u1/quizResults/topic_1', { course: 'A1', score: 9, total: 10, timestamp: NOW });
    db.seed('users/u1/certificates/c1', { course: 'A1', number: 5 });
    const read = await readStudentDashboard(admin, 'u1');
    ok(read.found, 'readStudentDashboard found user');
    eq(read.dashboard.courses[0].progressPercent, Math.round((2 / 12) * 100), 'dashboard progress from seeded courses');
    eq(read.dashboard.pronunciation.length, 2, 'dashboard pronunciation from events');
    ok(read.dashboard.exercises.length === 1, 'dashboard exercises from quizResults');

    const missing = await readStudentDashboard(admin, 'nobody');
    eq(missing.found, false, 'missing user → found:false');

    // demo/guest safety: sanitize drops everything unknown; empty batch → no write
    const empty = await ingestEvents(admin, 'u2', [{ t: 'junk' }], NOW);
    eq(empty.written, 0, 'all-invalid batch writes nothing');
    ok(!db.docs.has('users/u2'), 'no user doc created for empty ingest');

    // end-to-end: a realistic learning session → dashboard reflects it
    const { admin: a2, db: db2 } = makeAdmin();
    db2.seed('users/s1', { username: 'sara', role: 'customer', courses: { B1: { completedTopics: [1, 2] } } });
    const session = [
        { t: 'login', cts: NOW - 700000 },
        { t: 'topic_open', cts: NOW - 690000, course: 'B1', topic: 3 },
        { t: 'vocab_start', cts: NOW - 680000, course: 'B1', topic: 3 },
        { t: 'vocab_card', cts: NOW - 670000, course: 'B1', topic: 3, data: { card: 18, total: 40 } },
        { t: 'listen', cts: NOW - 665000, course: 'B1', topic: 3, data: { card: 18 } },
        { t: 'pron', cts: NOW - 660000, course: 'B1', topic: 3, data: { expected: 'работать', recognized: 'работать', accuracy: 92, score: 95, stars: 5, pass: true } },
        { t: 'vocab_done', cts: NOW - 650000, course: 'B1', topic: 3, data: { learned: 40 } },
        { t: 'ex_done', cts: NOW - 640000, course: 'B1', topic: 3, data: { score: 9, total: 10 } },
        { t: 'session', cts: NOW - 630000, data: { activeMs: 900000 } },
    ];
    await ingestEvents(a2, 's1', session, NOW);
    const read2 = await readStudentDashboard(a2, 's1');
    eq(read2.dashboard.current.vocabCard.card, 18, 'e2e: current card = 18 from events');
    eq(read2.dashboard.current.topic, 3, 'e2e: current topic = 3');
    eq(read2.dashboard.pronunciation.length, 1, 'e2e: 1 pron attempt in history');
    eq(read2.dashboard.pronunciation[0].pass, true, 'e2e: pron pass recorded');
    ok(read2.dashboard.timeline[0].ts >= read2.dashboard.timeline[read2.dashboard.timeline.length - 1].ts, 'e2e: timeline newest-first');
    ok(read2.dashboard.stats.learningTime.total === 900000, 'e2e: learning time from session event');
    ok(read2.dashboard.totals.words === 40, 'e2e: words from vocab_done');
    ok(read2.dashboard.totals.listens === 1, 'e2e: listening usage counted');
}

await storeTests();

// ============================ report ============================
console.log('\n' + '─'.repeat(56));
if (fail === 0) {
    console.log(`  ✅ ANALYTICS: ${pass}/${pass} assertions passed`);
} else {
    console.log(`  ❌ ANALYTICS: ${fail} failed / ${pass + fail} total`);
    fails.forEach(f => console.log('     - ' + f));
}
console.log('─'.repeat(56) + '\n');
process.exit(fail ? 1 : 0);
