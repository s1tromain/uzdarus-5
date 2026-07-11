/**
 * analytics.js — shared, PURE analytics logic (no Firebase deps here, so it
 * is fully unit-testable). Used by:
 *   - api/analytics.js            (client event ingestion / track)
 *   - api/_admin/student-analytics.js (admin dashboard aggregation)
 *   - api/_admin/students-overview.js (list + filters)
 *
 * DESIGN (minimal footprint — see tests/analytics + Stage-2 report):
 *   Reuse existing data wherever possible:
 *     users/{uid}                  profile, subscription, courses.{lvl}
 *     users/{uid}/quizResults      exercise/exam answers + scores  (Part 3)
 *     users/{uid}/certificates     certificates
 *   Add ONE new event stream for what isn't captured today:
 *     users/{uid}/events/{id}      typed, chronological learning events
 *     users/{uid}/analytics/summary  server-maintained aggregates (server-only)
 *     users/{uid}.stats            tiny denormalized counters for cheap lists
 */

export const COURSE_TOTAL_TOPICS = Object.freeze({ A1: 12, A2: 16, B1: 20, B2: 16 });
export const COURSE_ORDER = ['A1', 'A2', 'B1', 'B2'];

/** Accepted event types and their allowed payload keys (everything else is dropped). */
export const EVENT_TYPES = Object.freeze({
    session:     ['activeMs'],
    login:       [],
    topic_open:  ['topic'],
    vocab_start: ['topic'],
    vocab_card:  ['topic', 'card', 'total'],
    listen:      ['topic', 'card'],
    pron:        ['expected', 'recognized', 'accuracy', 'completeness', 'fluency', 'confidence', 'score', 'stars', 'feedback', 'pass'],
    vocab_done:  ['topic', 'learned', 'total'],
    ex_start:    ['topic'],
    ex_answer:   ['topic', 'q', 'given', 'answer', 'ok', 'attempt'],
    ex_done:     ['topic', 'score', 'total', 'timeMs'],
    topic_pass:  ['topic', 'score'],
    exam_start:  ['topic', 'level'],
    exam_pass:   ['topic', 'level', 'score'],
    exam_fail:   ['topic', 'level', 'score'],
});

const MAX_STR = 300;
const DAILY_RETENTION_DAYS = 62;

function clampNum(v, min, max) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.max(min, Math.min(max, n));
}
function clampStr(v) {
    if (v === null || v === undefined) return null;
    return String(v).slice(0, MAX_STR);
}
function normalizeCourse(c) {
    const v = String(c || '').trim().toUpperCase();
    return COURSE_ORDER.includes(v) ? v : null;
}
export function dayKey(ms) {
    return new Date(ms).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/**
 * Validate + normalize one raw client event into the stored shape, or null.
 * Only whitelisted types and payload keys survive — clients cannot inject
 * arbitrary fields, oversized strings, or spoof a different type.
 */
export function sanitizeEvent(raw, nowMs = Date.now()) {
    if (!raw || typeof raw !== 'object') return null;
    const t = String(raw.t || raw.type || '').trim();
    const allowed = EVENT_TYPES[t];
    if (!allowed) return null;

    const cts = clampNum(raw.cts, 0, nowMs + 5 * 60 * 1000); // client ts (ms), not far in future
    const course = normalizeCourse(raw.course);
    const topic = clampNum(raw.topic, 0, 100000);

    const src = (raw.data && typeof raw.data === 'object') ? raw.data : raw;
    const data = {};
    for (const key of allowed) {
        if (src[key] === undefined || src[key] === null) continue;
        if (['expected', 'recognized', 'feedback', 'given', 'answer', 'q', 'level'].includes(key)) {
            data[key] = clampStr(src[key]);
        } else if (key === 'pass' || key === 'ok') {
            data[key] = Boolean(src[key]);
        } else {
            data[key] = clampNum(src[key], -1, 10 ** 9);
        }
    }

    const ev = { t, cts: cts == null ? nowMs : cts };
    if (course) ev.course = course;
    if (topic != null && topic >= 0) ev.topic = topic;
    if (Object.keys(data).length) ev.data = data;
    return ev;
}

/** Validate + cap a batch of events. Returns { events, dropped }. */
export function sanitizeBatch(rawEvents, nowMs = Date.now(), max = 200) {
    if (!Array.isArray(rawEvents)) return { events: [], dropped: 0 };
    const out = [];
    let dropped = 0;
    for (const raw of rawEvents.slice(0, max)) {
        const ev = sanitizeEvent(raw, nowMs);
        if (ev) out.push(ev); else dropped++;
    }
    return { events: out, dropped };
}

const EMPTY_SUMMARY = () => ({
    learningMs: 0, sessions: 0,
    words: 0, exercises: 0, pron: 0, listens: 0, examsPassed: 0, examsTaken: 0,
    pronScoreSum: 0, pronCount: 0,
    exScoreSum: 0, exCount: 0,
    lastEventCts: 0,
    daily: {},
});

/**
 * Fold a batch of sanitized events into a summary (PURE — returns a new object).
 * This is what the track endpoint persists to users/{uid}/analytics/summary and
 * mirrors the small denormalized users/{uid}.stats.
 */
export function applyEventsToSummary(prev, events) {
    const s = Object.assign(EMPTY_SUMMARY(), prev || {});
    s.daily = Object.assign({}, (prev && prev.daily) || {});

    for (const ev of events) {
        const d = ev.data || {};
        if (ev.cts > s.lastEventCts) s.lastEventCts = ev.cts;

        switch (ev.t) {
            case 'session': {
                const ms = clampNum(d.activeMs, 0, 6 * 60 * 60 * 1000) || 0; // cap 6h/flush
                s.learningMs += ms;
                s.sessions += 1;
                const key = dayKey(ev.cts);
                s.daily[key] = (s.daily[key] || 0) + ms;
                break;
            }
            case 'pron': {
                s.pron += 1;
                const sc = clampNum(d.score, 0, 100);
                if (sc != null) { s.pronScoreSum += sc; s.pronCount += 1; }
                break;
            }
            case 'listen': { s.listens = (s.listens || 0) + 1; break; }
            case 'vocab_done': {
                const learned = clampNum(d.learned, 0, 10000) || 0;
                s.words += learned;
                break;
            }
            case 'ex_done': {
                s.exercises += 1;
                const total = clampNum(d.total, 1, 10000);
                const score = clampNum(d.score, 0, 10000);
                if (total && score != null) {
                    s.exScoreSum += Math.round((score / total) * 100);
                    s.exCount += 1;
                }
                break;
            }
            case 'exam_pass': s.examsPassed += 1; s.examsTaken += 1; break;
            case 'exam_fail': s.examsTaken += 1; break;
            default: break;
        }
    }

    // Retain only the most recent DAILY_RETENTION_DAYS day-buckets.
    const days = Object.keys(s.daily).sort();
    if (days.length > DAILY_RETENTION_DAYS) {
        for (const k of days.slice(0, days.length - DAILY_RETENTION_DAYS)) delete s.daily[k];
    }
    return s;
}

/** Small denormalized counters mirrored onto the user doc for cheap list queries. */
export function summaryToStats(summary, nowMs = Date.now()) {
    const s = summary || {};
    return {
        words: s.words || 0,
        exercises: s.exercises || 0,
        pron: s.pron || 0,
        examsPassed: s.examsPassed || 0,
        learningMs: s.learningMs || 0,
        lastActiveAt: s.lastEventCts || nowMs,
    };
}

/* ================================================================== */
/*  DASHBOARD AGGREGATION (admin read)                                */
/* ================================================================== */

function toMs(value) {
    if (value == null) return null;
    if (typeof value === 'number') return value;
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    if (typeof value?._seconds === 'number') return value._seconds * 1000;
    const p = new Date(value);
    return Number.isNaN(p.getTime()) ? null : p.getTime();
}

function completedTopicsCount(courseProgress) {
    if (!courseProgress) return 0;
    if (Array.isArray(courseProgress)) return new Set(courseProgress).size;
    const direct = courseProgress.completedTopics;
    if (Array.isArray(direct)) return new Set(direct).size;
    if (direct && typeof direct === 'object') {
        return Object.values(direct).filter(v =>
            typeof v === 'boolean' ? v : (v && typeof v === 'object' ? Boolean(v.completed) : Boolean(v))).length;
    }
    const up = courseProgress.userProgress;
    if (up && typeof up === 'object') return Object.values(up).filter(v => v?.completed).length;
    return 0;
}

function vocabLearnedCount(courseProgress) {
    const learned = courseProgress?.vocabulary?.learnedWords;
    if (!learned || typeof learned !== 'object') return 0;
    return Object.values(learned).reduce((sum, v) => {
        const n = Number(v);
        return sum + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
}

/** Percentage of correct answers a quizResult represents (reuses stored score/total). */
function quizPercent(data) {
    const score = Number(data?.score);
    const total = Number(data?.total);
    if (Number.isFinite(score) && Number.isFinite(total) && total > 0) {
        return Math.round((score / total) * 100);
    }
    const pct = Number(data?.percentage);
    return Number.isFinite(pct) ? pct : null;
}

const TIMELINE_LABELS = {
    login:       () => 'Tizimga kirdi',
    session:     () => 'O‘qish sessiyasi',
    topic_open:  (e) => `${e.course || ''} Mavzu ${e.topic ?? ''} ochildi`.trim(),
    vocab_start: (e) => `Lug‘at boshlandi (Mavzu ${e.topic ?? ''})`,
    vocab_card:  (e) => `Karta ${e.data?.card ?? ''}${e.data?.total ? '/' + e.data.total : ''}`,
    listen:      () => 'Tinglash',
    pron:        (e) => `Talaffuz: ${e.data?.score ?? ''}% ${'★'.repeat(e.data?.stars || 0)}`.trim(),
    vocab_done:  (e) => `Lug‘at tugatildi (Mavzu ${e.topic ?? ''})`,
    ex_start:    (e) => `Mashqlar boshlandi (Mavzu ${e.topic ?? ''})`,
    ex_answer:   (e) => `Javob: ${e.data?.ok ? 'to‘g‘ri' : 'xato'}`,
    ex_done:     (e) => `Mashqlar tugatildi ${e.data?.score ?? ''}/${e.data?.total ?? ''}`,
    topic_pass:  (e) => `Mavzu ${e.topic ?? ''} yakunlandi${e.data?.score != null ? ' (' + e.data.score + '%)' : ''}`,
    exam_start:  (e) => `Imtihon boshlandi${e.data?.level ? ' (' + e.data.level + ')' : ''}`,
    exam_pass:   (e) => `Imtihon topshirildi ${e.data?.score ?? ''}%`,
    exam_fail:   (e) => `Imtihon o‘tmadi ${e.data?.score ?? ''}%`,
};

function timelineLabel(e) {
    const fn = TIMELINE_LABELS[e.t];
    return fn ? fn(e) : e.t;
}

/**
 * Assemble the complete admin dashboard for one student from reused data +
 * the new event stream. PURE — all inputs are plain data.
 *
 * @param {object} input
 *   profile       users/{uid} doc data
 *   quizResults   [{ id, ...data }] from users/{uid}/quizResults
 *   certificates  [{ id, ...data }] from users/{uid}/certificates
 *   summary       users/{uid}/analytics/summary doc data (or null)
 *   events        [{ t, cts, course, topic, data }] recent, any order
 *   nowMs
 */
export function buildStudentDashboard(input = {}) {
    const { profile = {}, quizResults = [], certificates = [], summary = null, events = [], nowMs = Date.now() } = input;

    const sortedEvents = events.slice().sort((a, b) => (b.cts || 0) - (a.cts || 0)); // newest first
    const lastActivityMs = Math.max(
        toMs(profile.lastActivity) || 0,
        summary?.lastEventCts || 0,
        sortedEvents[0]?.cts || 0
    ) || null;

    // ---- courses / progress (reused) ----
    const courses = COURSE_ORDER.map((code) => {
        const cp = profile?.courses?.[code] || null;
        const total = COURSE_TOTAL_TOPICS[code] || 0;
        const done = Math.min(total, completedTopicsCount(cp));
        const examDoc = quizResults.find(q => q.course === code && /final|exam/i.test(q.id || ''));
        const cert = certificates.find(c => String(c.course || c.level || '').toUpperCase() === code);
        return {
            code, totalTopics: total, completedTopics: done, remaining: Math.max(0, total - done),
            progressPercent: total ? Math.round((done / total) * 100) : 0,
            vocabLearned: vocabLearnedCount(cp),
            examStatus: examDoc ? (quizPercent(examDoc) >= 60 ? 'passed' : 'failed') : 'not_taken',
            certificate: cert ? { id: cert.id, number: cert.number || cert.certificateNumber || null } : null,
        };
    });

    // ---- current position (latest events) ----
    const latest = (pred) => sortedEvents.find(pred);
    const lastTopicEv = latest(e => e.topic != null && ['topic_open', 'vocab_card', 'ex_answer', 'ex_start', 'vocab_start'].includes(e.t));
    const lastCardEv = latest(e => e.t === 'vocab_card');
    const lastExamEv = latest(e => ['exam_pass', 'exam_fail', 'exam_start'].includes(e.t));
    const current = {
        course: lastTopicEv?.course || courses.filter(c => c.completedTopics > 0 && c.completedTopics < c.totalTopics)[0]?.code || courses.find(c => c.completedTopics > 0)?.code || null,
        topic: lastTopicEv?.topic ?? null,
        activity: sortedEvents[0] ? timelineLabel(sortedEvents[0]) : null,
        vocabCard: lastCardEv ? { topic: lastCardEv.topic, card: lastCardEv.data?.card ?? null, total: lastCardEv.data?.total ?? null } : null,
        exam: lastExamEv ? { type: lastExamEv.t, score: lastExamEv.data?.score ?? null, level: lastExamEv.data?.level || null } : null,
    };

    // ---- exercises / exams (reused from quizResults) ----
    const exercises = quizResults.map((q) => {
        const percent = quizPercent(q);
        const isExam = /final|exam/i.test(q.id || '');
        // Extract per-question answers from arbitrary section maps stored by courses.
        const answers = [];
        for (const [k, v] of Object.entries(q)) {
            if (['id', 'score', 'total', 'timestamp', 'course', 'updatedAt', 'percentage', 'passed'].includes(k)) continue;
            if (v && typeof v === 'object') {
                for (const [qk, qv] of Object.entries(v)) {
                    answers.push({ section: k, question: qk, answer: typeof qv === 'object' ? JSON.stringify(qv) : String(qv) });
                }
            }
        }
        return {
            id: q.id, course: q.course || null, kind: isExam ? 'exam' : 'exercise',
            score: q.score ?? null, total: q.total ?? null, percent,
            passed: percent != null ? percent >= 60 : null,
            timestamp: toMs(q.timestamp) || toMs(q.updatedAt),
            answers,
        };
    }).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // ---- pronunciation history (new events) ----
    const pronunciation = sortedEvents.filter(e => e.t === 'pron').map(e => ({
        ts: e.cts, course: e.course || null, topic: e.topic ?? null,
        expected: e.data?.expected || null, recognized: e.data?.recognized || null,
        accuracy: e.data?.accuracy ?? null, completeness: e.data?.completeness ?? null,
        fluency: e.data?.fluency ?? null, confidence: e.data?.confidence ?? null,
        score: e.data?.score ?? null, stars: e.data?.stars ?? null,
        feedback: e.data?.feedback || null, pass: e.data?.pass ?? null,
    }));

    // ---- timeline ----
    const timeline = sortedEvents.slice(0, 200).map(e => ({
        ts: e.cts, type: e.t, course: e.course || null, topic: e.topic ?? null, label: timelineLabel(e),
    }));

    // ---- statistics (Part 6) ----
    const daily = (summary && summary.daily) || {};
    const nowDay = dayKey(nowMs);
    const within = (days) => {
        const cutoff = nowMs - days * 86400000;
        return Object.entries(daily).reduce((sum, [k, ms]) => {
            const t = new Date(k + 'T00:00:00Z').getTime();
            return t >= cutoff ? sum + (Number(ms) || 0) : sum;
        }, 0);
    };
    const exPercents = exercises.filter(e => e.percent != null).map(e => e.percent);
    const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    const totalCompleted = courses.reduce((s, c) => s + c.completedTopics, 0);
    const totalTopicsAll = courses.reduce((s, c) => s + c.totalTopics, 0);

    const stats = {
        learningTime: {
            today: daily[nowDay] || 0,
            week: within(7),
            month: within(30),
            total: summary?.learningMs || 0,
        },
        avgPronunciation: summary?.pronCount ? Math.round(summary.pronScoreSum / summary.pronCount) : null,
        avgExercise: avg(exPercents),
        avgScore: avg(exPercents), // exercises + exams share the same percent basis
        wordsLearned: courses.reduce((s, c) => s + c.vocabLearned, 0) || (summary?.words || 0),
        topicsCompleted: totalCompleted,
        examsPassed: summary?.examsPassed ?? exercises.filter(e => e.kind === 'exam' && e.passed).length,
        examPassRate: summary?.examsTaken ? Math.round((summary.examsPassed / summary.examsTaken) * 100) : null,
        successRate: exPercents.length ? Math.round((exPercents.filter(p => p >= 60).length / exPercents.length) * 100) : null,
    };

    // ---- subscription / profile (reused) ----
    const sub = profile.subscription || {};
    const endMs = toMs(sub.endAt);
    const subscription = {
        active: Boolean(sub.active),
        tariff: sub.tariff || null,
        endAt: endMs,
        daysLeft: endMs ? Math.ceil((endMs - nowMs) / 86400000) : null,
    };

    return {
        profile: {
            uid: profile.uid || null,
            username: profile.username || null,
            email: profile.email || null,
            displayName: profile.displayName || profile.username || null,
            role: profile.role || 'customer',
            blocked: Boolean(profile.blocked),
            registeredAt: toMs(profile.registeredAt),
            lastActivity: lastActivityMs,
            online: lastActivityMs ? (nowMs - lastActivityMs) < 5 * 60 * 1000 : false,
            deviceCount: Array.isArray(profile.deviceHashes) ? profile.deviceHashes.length : 0,
        },
        subscription,
        overallProgress: totalTopicsAll ? Math.round((totalCompleted / totalTopicsAll) * 100) : 0,
        current,
        courses,
        totals: {
            learningMs: summary?.learningMs || 0,
            words: stats.wordsLearned,
            exercises: exercises.filter(e => e.kind === 'exercise').length,
            pron: summary?.pron ?? pronunciation.length,
            listens: summary?.listens || 0,
            examsPassed: stats.examsPassed,
        },
        stats,
        timeline,
        exercises,
        pronunciation,
        certificates: certificates.map(c => ({
            id: c.id, number: c.number || c.certificateNumber || null,
            course: c.course || c.level || null, issuedAt: toMs(c.issuedAt || c.createdAt),
        })),
    };
}

/* ================================================================== */
/*  OVERVIEW (list + filters, Part 8) — derived from the user doc only */
/* ================================================================== */

/** Compact per-student row for the admin list, from the user doc alone (cheap). */
export function buildStudentOverviewRow(uid, data = {}, nowMs = Date.now()) {
    const courses = COURSE_ORDER.map((code) => {
        const cp = data?.courses?.[code] || null;
        const total = COURSE_TOTAL_TOPICS[code] || 0;
        const done = Math.min(total, completedTopicsCount(cp));
        return { code, completedTopics: done, totalTopics: total, progressPercent: total ? Math.round((done / total) * 100) : 0 };
    });
    const totalDone = courses.reduce((s, c) => s + c.completedTopics, 0);
    const totalTopics = courses.reduce((s, c) => s + c.totalTopics, 0);
    const sub = data.subscription || {};
    const lastActivityMs = Math.max(toMs(data.lastActivity) || 0, data?.stats?.lastActiveAt || 0) || null;
    const st = data.stats || {};
    // Certificates earned — derived cheaply from the user doc itself
    // (issueCertificate() writes courses.<lvl>.certificateNumber), so the
    // list filter needs NO extra reads and NO new denormalized field.
    const certificates = COURSE_ORDER.filter(code => data?.courses?.[code]?.certificateNumber).length;
    return {
        uid,
        username: data.username || null,
        email: data.email || null,
        role: String(data.role || 'customer').toLowerCase(),
        blocked: Boolean(data.blocked),
        subscription: { active: Boolean(sub.active), tariff: sub.tariff || null, endAt: toMs(sub.endAt) },
        courses,
        completedTopics: totalDone,
        overallProgress: totalTopics ? Math.round((totalDone / totalTopics) * 100) : 0,
        lastActivity: lastActivityMs,
        activeToday: lastActivityMs ? dayKey(lastActivityMs) === dayKey(nowMs) : false,
        examsPassed: st.examsPassed || 0,
        wordsLearned: st.words || 0,
        certificates,
    };
}
