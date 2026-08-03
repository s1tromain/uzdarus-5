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
    buildGlobalDelta, buildGlobalAnalytics, staleActivityDays,
    GLOBAL_ACTIVITY_RETENTION_DAYS,
} from '../../api/_lib/analytics.js';
import {
    ingestEvents, readStudentDashboard, readGlobalAnalytics, syncPulse,
    PULSE_COLLECTION, GLOBAL_COLLECTION,
} from '../../api/_lib/analytics-store.js';
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

// ================= GLOBAL AGGREGATES + REALTIME PULSE =================
async function globalTests() {
section('buildGlobalDelta — activity + topic difficulty folding');
{
    const events = [
        { t: 'session', cts: NOW, data: { activeMs: 600000 } },
        { t: 'session', cts: NOW - DAY, data: { activeMs: 300000 } },
        { t: 'pron', cts: NOW, course: 'A1', topic: 2, data: { score: 80 } },
        { t: 'vocab_done', cts: NOW, course: 'A1', topic: 2, data: { learned: 12 } },
        { t: 'ex_done', cts: NOW, course: 'A1', topic: 3, data: { score: 4, total: 10 } },   // 40%
        { t: 'ex_done', cts: NOW, course: 'A1', topic: 3, data: { score: 9, total: 10 } },   // 90%
        { t: 'topic_pass', cts: NOW, course: 'A1', topic: 3, data: { score: 95 } },
        { t: 'topic_pass', cts: NOW, course: 'B1', topic: 7, data: { score: 55 } },
        { t: 'login', cts: NOW },
    ];
    const d = buildGlobalDelta(events);

    const today = dayKey(NOW);
    const yesterday = dayKey(NOW - DAY);
    eq(d.days[today].ms, 600000, 'global: today learning ms');
    eq(d.days[yesterday].ms, 300000, 'global: yesterday learning ms');
    eq(d.days[today].sessions, 1, 'global: one session today');
    eq(d.days[today].pron, 1, 'global: pronunciation counted');
    eq(d.days[today].words, 12, 'global: words counted');
    eq(d.days[today].events, 8, 'global: every event counted for the day');

    const a1t3 = d.topics.A1['3'];
    eq(a1t3.att, 3, 'global: 3 scored attempts on A1/3');
    eq(a1t3.sum, 40 + 90 + 95, 'global: score sum on A1/3');
    eq(a1t3.done, 1, 'global: one completion on A1/3');
    eq(a1t3.fail, 1, 'global: the 40% attempt counted as a failure');

    eq(d.topics.B1['7'].fail, 1, 'global: 55% is below the 60% pass line');
    ok(!d.topics.A1['2'], 'global: pron/vocab do not create a difficulty bucket');
    ok(!d.topics.undefined, 'global: events without a course are activity-only');
}

section('buildGlobalDelta — hostile / partial input');
{
    eq(buildGlobalDelta([]).days, {}, 'global: empty batch → no days');
    eq(buildGlobalDelta().topics, {}, 'global: undefined batch is safe');
    const d = buildGlobalDelta([
        { t: 'ex_done', cts: NOW, course: 'A1', topic: 1, data: { score: 5 } },      // no total
        { t: 'ex_done', cts: NOW, course: 'A1', topic: 1, data: { total: 0 } },      // zero total
        { t: 'topic_pass', cts: NOW, course: 'A1', topic: 1 },                       // no score
        { t: 'session', cts: NOW, data: { activeMs: 999 * 3600000 } },               // absurd time
    ]);
    eq(d.topics.A1['1'].att, 0, 'global: unscorable attempts add no score');
    eq(d.topics.A1['1'].done, 1, 'global: the completion still counts');
    ok(d.days[dayKey(NOW)].ms <= 6 * 3600000, 'global: session time is capped at 6h');
}

section('staleActivityDays — retention');
{
    const days = {};
    days[dayKey(NOW)] = { ms: 1 };
    days[dayKey(NOW - 10 * DAY)] = { ms: 1 };
    days[dayKey(NOW - (GLOBAL_ACTIVITY_RETENTION_DAYS + 5) * DAY)] = { ms: 1 };
    days['not-a-date'] = { ms: 1 };
    const stale = staleActivityDays({ days }, NOW);
    ok(stale.includes(dayKey(NOW - (GLOBAL_ACTIVITY_RETENTION_DAYS + 5) * DAY)), 'retention: expired bucket flagged');
    ok(stale.includes('not-a-date'), 'retention: malformed key flagged');
    ok(!stale.includes(dayKey(NOW)), 'retention: today kept');
    ok(!stale.includes(dayKey(NOW - 10 * DAY)), 'retention: recent bucket kept');
    eq(staleActivityDays(null, NOW), [], 'retention: missing document is safe');
}

section('buildGlobalAnalytics — platform dashboard');
{
    const learner = (over) => buildStudentOverviewRow(over.uid, {
        username: over.uid, displayName: over.uid.toUpperCase(), role: 'customer',
        registeredAt: over.registeredAt, lastActivity: over.lastActivity,
        blocked: over.blocked || false,
        subscription: { active: over.sub !== false, endAt: NOW + 30 * DAY },
        stats: { examsPassed: over.exams || 0, words: over.words || 0, learningMs: over.ms || 0,
                 lastActiveAt: over.lastActivity },
        courses: over.courses || {},
    }, NOW);

    const full = {};
    for (let i = 1; i <= 12; i++) full[i] = true;

    const rows = [
        learner({ uid: 'veteran', registeredAt: NOW - 200 * DAY, lastActivity: NOW - 2 * DAY,
                  exams: 2, words: 300, ms: 40 * 3600000,
                  courses: { A1: { completedTopics: full } } }),                       // A1 complete
        learner({ uid: 'active', registeredAt: NOW - 40 * DAY, lastActivity: NOW - 1000,
                  exams: 1, words: 90, ms: 6 * 3600000,
                  courses: { A1: { completedTopics: { 1: true, 2: true, 3: true } } } }),
        learner({ uid: 'rookie', registeredAt: NOW - 2 * DAY, lastActivity: NOW - 3600000,
                  courses: { A1: { completedTopics: { 1: true } } } }),
        learner({ uid: 'lapsed', registeredAt: NOW - 300 * DAY, lastActivity: NOW - 90 * DAY,
                  courses: { A1: { completedTopics: { 1: true, 2: true } } } }),
        learner({ uid: 'ghost', registeredAt: NOW - 5 * DAY, lastActivity: null }),
    ];
    rows.forEach(r => { r.role = 'customer'; });
    const staff = { ...rows[0], uid: 'boss', role: 'admin' };

    const days = {};
    days[dayKey(NOW)] = { ms: 7200000, sessions: 4, events: 40 };
    days[dayKey(NOW - 3 * DAY)] = { ms: 3600000, sessions: 2, events: 20 };
    days[dayKey(NOW - 20 * DAY)] = { ms: 1800000, sessions: 1, events: 10 };

    const g = buildGlobalAnalytics({
        rows: rows.concat([staff]),
        activity: { days },
        topics: {
            A1: { 3: { att: 10, sum: 350, done: 6, fail: 7 },     // avg 35 — hardest
                  1: { att: 12, sum: 1080, done: 11, fail: 0 },   // avg 90 — most completed
                  5: { att: 2,  sum: 40,   done: 1, fail: 2 } },  // below the attempt floor
            B1: { 7: { att: 8, sum: 480, done: 2, fail: 3 } },    // avg 60
        },
        nowMs: NOW,
    });

    eq(g.users.total, 5, 'global: staff accounts are excluded from the learner total');
    eq(g.users.activeToday, 2, 'global: active today');
    eq(g.users.active, 3, 'global: active in 7 days');
    eq(g.users.inactive, 2, 'global: inactive (30+ days or never)');
    eq(g.users.new30, 2, 'global: new in 30 days');
    eq(g.users.new7, 2, 'global: new in 7 days');
    eq(g.users.returning, 2, 'global: returning = active-30 minus first-week accounts');
    eq(g.users.completedAll, 0, 'global: nobody finished every course');
    eq(g.users.currentlyStudying, 4, 'global: started but not finished');

    const a1 = g.courses.find(c => c.code === 'A1');
    eq(a1.started, 4, 'global: A1 learners with progress');
    eq(a1.completed, 1, 'global: A1 completions');
    eq(a1.completionRate, 25, 'global: A1 completion rate');
    ok(a1.averageProgress > 0 && a1.averageProgress <= 100, 'global: A1 average progress in range');
    const b2 = g.courses.find(c => c.code === 'B2');
    eq(b2.started, 0, 'global: an untouched course reports zero, not NaN');
    eq(b2.completionRate, 0, 'global: no division by zero');

    eq(g.topics.hardest[0].course + '/' + g.topics.hardest[0].topic, 'A1/3', 'global: hardest topic identified');
    eq(g.topics.hardest[0].averageScore, 35, 'global: hardest topic average score');
    ok(!g.topics.hardest.some(t => t.topic === 5), 'global: low-sample topics are not ranked');
    eq(g.topics.mostCompleted[0].topic, 1, 'global: most-completed topic');
    eq(g.topics.leastCompleted[0].topic, 5, 'global: least-completed topic (fewest completions)');
    ok(g.topics.leastCompleted.some(t => t.topic === 7), 'global: a heavily-attempted, rarely-finished topic is listed');

    eq(g.activity.today.ms, 7200000, 'global: today activity');
    eq(g.activity.daily.length, 30, 'global: 30-day series is dense');
    eq(g.activity.weekly.ms, 7200000 + 3600000, 'global: 7-day window sums correctly');
    eq(g.activity.monthly.ms, 7200000 + 3600000 + 1800000, 'global: 30-day window sums correctly');
    ok(g.activity.daily.every(d => typeof d.ms === 'number'), 'global: no gaps in the series');

    ok(g.health.score >= 0 && g.health.score <= 100, 'global: health score is a percentage');
    eq(g.progress.examsPassed, 3, 'global: exams passed summed');
    eq(g.progress.wordsLearned, 390, 'global: words summed');

    const emptyPlatform = buildGlobalAnalytics({ rows: [], nowMs: NOW });
    eq(emptyPlatform.users.total, 0, 'global: empty platform is safe');
    eq(emptyPlatform.progress.averageCompletion, 0, 'global: no NaN on an empty platform');
    eq(emptyPlatform.progress.averageScore, null, 'global: unknown average score is null, not 0');
    eq(emptyPlatform.health.score, 0, 'global: health on an empty platform');
    eq(emptyPlatform.activity.daily.length, 30, 'global: series still dense with no data');
}

section('ingestEvents — realtime pulse + global counters (mock Firestore)');
{
    const { admin, db } = makeAdmin();
    db.seed('users/s9', {
        username: 'sardor', displayName: 'Sardor', role: 'customer',
        registeredAt: NOW - 30 * DAY,
        subscription: { active: true, endAt: NOW + 30 * DAY },
        courses: { A1: { completedTopics: { 1: true, 2: true } } },
    });

    await ingestEvents(admin, 's9', [
        { t: 'session', cts: NOW, data: { activeMs: 900000 } },
        { t: 'ex_done', cts: NOW, course: 'A1', topic: 3, data: { score: 5, total: 10 } },
        { t: 'topic_pass', cts: NOW, course: 'A1', topic: 3, data: { score: 70 } },
    ], NOW);

    const pulse = db.docs.get(`${PULSE_COLLECTION}/s9`);
    ok(!!pulse, 'pulse: a learner row is published on ingest');
    eq(pulse.uid, 's9', 'pulse: carries the uid');
    eq(pulse.username, 'sardor', 'pulse: carries the login');
    eq(pulse.displayName, 'Sardor', 'pulse: carries the display name for teachers');
    eq(pulse.role, 'customer', 'pulse: role recorded');
    eq(pulse.completedTopics, 2, 'pulse: progress mirrored from the user document');
    ok(typeof pulse.updatedAt === 'number', 'pulse: updatedAt is set (client filters on it)');
    ok(pulse.learningMs >= 900000, 'pulse: learning time mirrored from the fresh stats');

    const activity = db.docs.get(`${GLOBAL_COLLECTION}/activity`);
    eq(activity.days[dayKey(NOW)].ms, 900000, 'global doc: activity ms incremented');
    eq(activity.days[dayKey(NOW)].sessions, 1, 'global doc: sessions incremented');

    const topicsA1 = db.docs.get(`${GLOBAL_COLLECTION}/topics_A1`);
    eq(topicsA1['3'].att, 2, 'global doc: attempts incremented');
    eq(topicsA1['3'].sum, 50 + 70, 'global doc: score sum incremented');
    eq(topicsA1['3'].done, 1, 'global doc: completion incremented');
    eq(topicsA1['3'].fail, 1, 'global doc: the 50% attempt is a failure');

    // A SECOND flush must ADD to the counters, never replace them.
    await ingestEvents(admin, 's9', [
        { t: 'session', cts: NOW, data: { activeMs: 60000 } },
        { t: 'topic_pass', cts: NOW, course: 'A1', topic: 3, data: { score: 100 } },
    ], NOW);
    const activity2 = db.docs.get(`${GLOBAL_COLLECTION}/activity`);
    eq(activity2.days[dayKey(NOW)].ms, 960000, 'global doc: increments accumulate across flushes');
    const topics2 = db.docs.get(`${GLOBAL_COLLECTION}/topics_A1`);
    eq(topics2['3'].done, 2, 'global doc: second completion accumulated');
    eq(topics2['3'].att, 3, 'global doc: third attempt accumulated');

    // Staff must NEVER be projected.
    db.seed('users/boss', { username: 'boss', role: 'admin' });
    await ingestEvents(admin, 'boss', [{ t: 'session', cts: NOW, data: { activeMs: 5000 } }], NOW);
    ok(!db.docs.get(`${PULSE_COLLECTION}/boss`), 'pulse: staff accounts are never projected');

    // A user with no document must not create a phantom row.
    await ingestEvents(admin, 'nosuchuser', [{ t: 'session', cts: NOW, data: { activeMs: 5000 } }], NOW);
    ok(!db.docs.get(`${PULSE_COLLECTION}/nosuchuser`), 'pulse: unknown users are not projected');
}

section('syncPulse — admin mutations and deletions');
{
    const { admin, db } = makeAdmin();
    db.seed('users/m1', {
        username: 'learner', role: 'customer',
        subscription: { active: false }, courses: {},
    });

    await syncPulse(admin, 'm1', {}, NOW);
    ok(!!db.docs.get(`${PULSE_COLLECTION}/m1`), 'syncPulse: publishes on demand');
    eq(db.docs.get(`${PULSE_COLLECTION}/m1`).subscription.active, false, 'syncPulse: reflects the current subscription');

    db.seed('users/m1', {
        username: 'learner', role: 'customer',
        subscription: { active: true, endAt: NOW + DAY }, courses: {},
    });
    await syncPulse(admin, 'm1', {}, NOW);
    eq(db.docs.get(`${PULSE_COLLECTION}/m1`).subscription.active, true, 'syncPulse: republishes after an admin edit');

    // Promotion to staff retracts the learner projection.
    db.seed('users/m1', { username: 'learner', role: 'teacher', courses: {} });
    await syncPulse(admin, 'm1', {}, NOW);
    eq(db.docs.get(`${PULSE_COLLECTION}/m1`).deleted, true, 'syncPulse: promotion to staff retracts the row');
    eq(db.docs.get(`${PULSE_COLLECTION}/m1`).username, null, 'syncPulse: a tombstone carries no learner data');

    /* Retraction must be a TOMBSTONE, not a hard delete: subscribers filter on
       updatedAt > baseline, and a deleted document produces no snapshot event
       for a panel whose result set never contained it — the row would survive
       as a ghost everywhere else. */
    db.seed('users/m2', { username: 'gone', role: 'customer', courses: {} });
    await syncPulse(admin, 'm2', {}, NOW);
    eq(db.docs.get(`${PULSE_COLLECTION}/m2`).username, 'gone', 'syncPulse: row exists before deletion');
    await syncPulse(admin, 'm2', { deleted: true }, NOW);
    const tomb = db.docs.get(`${PULSE_COLLECTION}/m2`);
    eq(tomb.deleted, true, 'syncPulse: deletion writes a tombstone every listener can see');
    ok(typeof tomb.updatedAt === 'number', 'syncPulse: the tombstone carries a fresh updatedAt');

    // A vanished user document also retracts the row.
    db.seed('users/m3', { username: 'vanishing', role: 'customer', courses: {} });
    await syncPulse(admin, 'm3', {}, NOW);
    db.docs.delete('users/m3');
    await syncPulse(admin, 'm3', {}, NOW);
    eq(db.docs.get(`${PULSE_COLLECTION}/m3`).deleted, true, 'syncPulse: a missing user document retracts the row');

    // Never throws — an analytics failure must not roll back an admin action.
    const broken = { adminDb: { collection() { throw new Error('boom'); } }, FieldValue: {} };
    const result = await syncPulse(broken, 'x', {}, NOW);
    eq(result, false, 'syncPulse: reports failure instead of throwing');
}

section('readGlobalAnalytics — endpoint assembly + visibility + pruning');
{
    const { admin, db } = makeAdmin();
    db.seed('users/a', { username: 'a', role: 'customer', lastActivity: NOW - 1000,
                         registeredAt: NOW - 50 * DAY, courses: { A1: { completedTopics: { 1: true } } } });
    db.seed('users/b', { username: 'b', role: 'customer', lastActivity: NOW - 60 * DAY,
                         registeredAt: NOW - 400 * DAY, courses: {} });
    db.seed('users/root', { username: 'root', role: 'developer' });

    const days = {};
    days[dayKey(NOW)] = { ms: 60000, sessions: 1, events: 3 };
    days[dayKey(NOW - (GLOBAL_ACTIVITY_RETENTION_DAYS + 3) * DAY)] = { ms: 60000, sessions: 1, events: 3 };
    db.seed(`${GLOBAL_COLLECTION}/activity`, { days });
    db.seed(`${GLOBAL_COLLECTION}/topics_A1`, { 1: { att: 5, sum: 400, done: 4, fail: 1 } });

    const all = await readGlobalAnalytics(admin, { nowMs: NOW });
    eq(all.users.total, 2, 'readGlobal: staff excluded from the learner total');
    eq(all.users.active, 1, 'readGlobal: active learners');
    eq(all.topics.hardest.length, 1, 'readGlobal: topic aggregates loaded');
    eq(all.activity.today.ms, 60000, 'readGlobal: activity document loaded');

    // Visibility predicate is honoured (this is how the teacher scope works).
    const scoped = await readGlobalAnalytics(admin, {
        nowMs: NOW,
        canView: (data) => String(data.role || 'customer') === 'customer',
    });
    eq(scoped.users.total, 2, 'readGlobal: teacher scope still sees every learner');

    const none = await readGlobalAnalytics(admin, { nowMs: NOW, canView: () => false });
    eq(none.users.total, 0, 'readGlobal: a predicate that denies everything yields zero');

    await new Promise(r => setTimeout(r, 5)); // the prune write is fire-and-forget
    const pruned = db.docs.get(`${GLOBAL_COLLECTION}/activity`);
    ok(!pruned.days[dayKey(NOW - (GLOBAL_ACTIVITY_RETENTION_DAYS + 3) * DAY)], 'readGlobal: expired day buckets are pruned');
    ok(!!pruned.days[dayKey(NOW)], 'readGlobal: current day survives pruning');

    // An entirely empty platform must not throw.
    const { admin: emptyAdmin } = makeAdmin();
    const empty = await readGlobalAnalytics(emptyAdmin, { nowMs: NOW });
    eq(empty.users.total, 0, 'readGlobal: empty database is safe');
    eq(empty.topics.tracked, 0, 'readGlobal: no topic data is not an error');
}

section('overview row — new fields are populated and backwards compatible');
{
    const withRegistered = buildStudentOverviewRow('r1', {
        username: 'u', role: 'customer', registeredAt: NOW - 10 * DAY, courses: {},
    }, NOW);
    eq(withRegistered.registeredAt, NOW - 10 * DAY, 'row: registeredAt read');

    const adminCreated = buildStudentOverviewRow('r2', {
        username: 'u', role: 'customer', createdAt: NOW - 3 * DAY, courses: {},
    }, NOW);
    eq(adminCreated.registeredAt, NOW - 3 * DAY, 'row: admin-created accounts fall back to createdAt');

    const undated = buildStudentOverviewRow('r3', { username: 'u', role: 'customer', courses: {} }, NOW);
    eq(undated.registeredAt, null, 'row: an undated account reports null, not 0');
    eq(undated.displayName, 'u', 'row: displayName falls back to the login');

    const certified = buildStudentOverviewRow('r4', {
        username: 'u', role: 'customer',
        courses: { A1: { completedTopics: { 1: true }, certificateNumber: 'UZD-A1-2026-000001' } },
    }, NOW);
    eq(certified.courses.find(c => c.code === 'A1').certificate, true, 'row: per-course certificate flag');
    eq(certified.courses.find(c => c.code === 'A2').certificate, false, 'row: uncertified course is false');
    eq(certified.certificates, 1, 'row: legacy total certificate count unchanged');
}
}

await globalTests();

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
