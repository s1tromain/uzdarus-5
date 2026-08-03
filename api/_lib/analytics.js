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
        // Skipped keys are NOT section->answers maps and must never be flattened
        // into a student's submitted answers:
        //   lessonResult          completed-lesson UI snapshot (surfaced as `lesson`)
        //   draft / lessonDraft   work IN PROGRESS — never submitted, never graded.
        //                         Flattening these showed unfinished typing (and the
        //                         raw `savedAt` epoch) as if the student had answered.
        const answers = [];
        for (const [k, v] of Object.entries(q)) {
            if (['id', 'score', 'total', 'timestamp', 'course', 'updatedAt', 'percentage', 'passed',
                 'lessonResult', 'draft', 'lessonDraft'].includes(k)) continue;
            if (v && typeof v === 'object') {
                for (const [qk, qv] of Object.entries(v)) {
                    answers.push({ section: k, question: qk, answer: typeof qv === 'object' ? JSON.stringify(qv) : String(qv) });
                }
            }
        }
        /* ---- completed-lesson snapshot (course-global-fixes.js) ----
           This is the RICHEST record the platform holds: per question it has
           the learner's submitted answer, the expected answer, correctness
           and the feedback they were shown. For the exercise-only topics
           (all of B1, A1 topics 6-12) it is the ONLY record — those topics
           write no native mc/blank arrays — so an admin previously saw
           "— (0/?) · Javoblar saqlanmagan" for a fully graded lesson.
           Counters are recomputed from `results` rather than trusted. */
        const lr = q.lessonResult;
        const hasLesson = lr && typeof lr === 'object' && Array.isArray(lr.results) && lr.results.length > 0;
        const lessonAnswers = hasLesson
            ? lr.results.map((r, i) => ({
                index: i + 1,
                label: String(r?.label || ''),
                question: String(r?.question || ''),
                submitted: String(r?.userAnswer || ''),
                expected: String(r?.correctAnswer || ''),
                isCorrect: r?.isCorrect === true,
                feedback: String(r?.explanation || ''),
            }))
            : [];
        const lessonCorrect = lessonAnswers.filter(a => a.isCorrect).length;
        const lessonTotal = lessonAnswers.length;
        const lessonCompletedAt = hasLesson ? (toMs(lr.completedAt) || null) : null;
        const lesson = hasLesson
            ? {
                correct: lessonCorrect,
                incorrect: lessonTotal - lessonCorrect,
                total: lessonTotal,
                percent: lessonTotal ? Math.round((lessonCorrect / lessonTotal) * 100) : null,
                completedAt: lessonCompletedAt,
                message: lr.message ? String(lr.message) : null,
                course: lr.course || null,
                topicId: lr.topicId ?? null,
                answers: lessonAnswers,
            }
            : null;

        /* ---- in-progress draft ----
           A draft is UNFINISHED work that was never submitted. It must never
           be presented as a graded attempt: no score, no pass/fail, and an
           explicit status the UI can render as "in progress". */
        const rawDraft = q.lessonDraft || q.draft;
        const draftFieldCount = rawDraft && typeof rawDraft === 'object'
            ? (rawDraft.fields && typeof rawDraft.fields === 'object'
                ? Object.keys(rawDraft.fields).length
                : ['mc', 'blanks'].reduce((n, k) => n + (rawDraft[k] && typeof rawDraft[k] === 'object'
                    ? Object.keys(rawDraft[k]).length : 0), 0))
            : 0;
        const draft = draftFieldCount > 0
            ? { answered: draftFieldCount, savedAt: toMs(rawDraft.savedAt) || null }
            : null;

        /* Effective score: native quiz fields when present (legacy accounts),
           otherwise the lesson snapshot. The two never overwrite each other —
           native wins only because it is the older, explicitly-graded record. */
        const effScore = q.score ?? (hasLesson ? lessonCorrect : null);
        const effTotal = q.total ?? (hasLesson ? lessonTotal : null);
        const effPercent = percent != null ? percent : (lesson ? lesson.percent : null);

        /* A row is only `graded` when something was actually submitted. A
           draft-only document is `in_progress` and carries no score at all. */
        const graded = q.score != null || hasLesson;
        const status = graded ? 'graded' : (draft ? 'in_progress' : 'empty');

        return {
            id: q.id, course: q.course || (lesson && lesson.course) || null,
            kind: isExam ? 'exam' : 'exercise',
            status,
            score: graded ? effScore : null,
            total: graded ? effTotal : null,
            percent: graded ? effPercent : null,
            passed: graded && effPercent != null ? effPercent >= 60 : null,
            timestamp: toMs(q.timestamp) || lessonCompletedAt || toMs(q.updatedAt),
            answers,
            lesson,
            draft,
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
        return {
            code,
            completedTopics: done,
            totalTopics: total,
            progressPercent: total ? Math.round((done / total) * 100) : 0,
            certificate: Boolean(cp && cp.certificateNumber),
        };
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
        /* The teacher surface renders the student list from these rows alone
           (a teacher may not call list-users), so the human-readable name has
           to travel with the row. */
        displayName: data.displayName || data.username || null,
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
        /* Cohort analysis (Stage 7) needs to tell a brand-new account apart
           from a returning one. Cheap: it is already on the user document.
           Two field names exist in production data — self-registered accounts
           carry `registeredAt`, admin-created ones `createdAt` — so both are
           accepted rather than silently reporting half the base as undated. */
        registeredAt: toMs(data.registeredAt) ?? toMs(data.createdAt),
        learningMs: st.learningMs || 0,
    };
}

/* ================================================================== */
/*  GLOBAL AGGREGATES (Stage 6/7)                                      */
/*  --------------------------------------------------------------    */
/*  Platform-wide numbers must never be computed by fanning out over   */
/*  every learner's subcollections — that would be O(users) reads per  */
/*  page view. Instead the ingest path folds each batch into a handful */
/*  of counter documents, and the admin page reads those.              */
/*                                                                     */
/*  Everything here is PURE. The Firestore glue lives in               */
/*  analytics-store.js and the unit tests drive these functions        */
/*  directly.                                                          */
/* ================================================================== */

/** Day buckets kept in the global activity document. */
export const GLOBAL_ACTIVITY_RETENTION_DAYS = 92;

/** An attempt is only meaningful for difficulty ranking above this count. */
export const TOPIC_MIN_ATTEMPTS = 3;

/** Percentage at or above which an attempt counts as a pass. */
export const PASS_THRESHOLD = 60;

/**
 * Fold one sanitized batch into the deltas that must be applied to the global
 * counter documents.
 *
 * @returns {{
 *   days: Record<string, { ms:number, events:number, sessions:number, pron:number, words:number }>,
 *   topics: Record<string, Record<string, { att:number, sum:number, done:number, fail:number }>>
 * }}
 */
export function buildGlobalDelta(events = []) {
    const days = {};
    const topics = {};

    const day = (ms) => {
        const key = dayKey(ms);
        return days[key] || (days[key] = { ms: 0, events: 0, sessions: 0, pron: 0, words: 0 });
    };
    const topic = (course, topicId) => {
        const bucket = topics[course] || (topics[course] = {});
        const key = String(topicId);
        return bucket[key] || (bucket[key] = { att: 0, sum: 0, done: 0, fail: 0 });
    };

    for (const ev of events) {
        const d = day(ev.cts);
        d.events += 1;

        const data = ev.data || {};

        switch (ev.t) {
            case 'session': {
                const ms = clampNum(data.activeMs, 0, 6 * 60 * 60 * 1000) || 0;
                d.ms += ms;
                d.sessions += 1;
                break;
            }
            case 'pron':
                d.pron += 1;
                break;
            case 'vocab_done':
                d.words += clampNum(data.learned, 0, 10000) || 0;
                break;
            default:
                break;
        }

        /* Topic difficulty needs a course AND a topic to attribute a score to.
           Events that carry neither (login, session) are activity-only. */
        if (!ev.course || ev.topic == null) continue;

        if (ev.t === 'ex_done') {
            const total = clampNum(data.total, 1, 10000);
            const score = clampNum(data.score, 0, 10000);
            if (total && score != null) {
                const percent = Math.round((score / total) * 100);
                const t = topic(ev.course, ev.topic);
                t.att += 1;
                t.sum += percent;
                if (percent < PASS_THRESHOLD) t.fail += 1;
            }
        } else if (ev.t === 'topic_pass') {
            const t = topic(ev.course, ev.topic);
            t.done += 1;
            const percent = clampNum(data.score, 0, 100);
            if (percent != null) {
                t.att += 1;
                t.sum += percent;
                if (percent < PASS_THRESHOLD) t.fail += 1;
            }
        }
    }

    return { days, topics };
}

/** Drop day buckets older than the retention window. Returns the keys removed. */
export function staleActivityDays(activity, nowMs = Date.now()) {
    const days = (activity && activity.days) || {};
    const cutoff = nowMs - GLOBAL_ACTIVITY_RETENTION_DAYS * 86400000;
    return Object.keys(days).filter((key) => {
        const t = new Date(`${key}T00:00:00Z`).getTime();
        return !Number.isFinite(t) || t < cutoff;
    });
}

function seriesFor(days, nowMs, count) {
    const out = [];
    for (let i = count - 1; i >= 0; i -= 1) {
        const key = dayKey(nowMs - i * 86400000);
        const bucket = days[key] || null;
        out.push({
            day: key,
            ms: Number(bucket?.ms) || 0,
            sessions: Number(bucket?.sessions) || 0,
            events: Number(bucket?.events) || 0,
        });
    }
    return out;
}

function sumRange(days, nowMs, count) {
    return seriesFor(days, nowMs, count).reduce((acc, p) => {
        acc.ms += p.ms;
        acc.sessions += p.sessions;
        acc.events += p.events;
        return acc;
    }, { ms: 0, sessions: 0, events: 0 });
}

/**
 * Assemble the whole platform dashboard.
 *
 * @param {object} input
 *   rows      compact overview rows (buildStudentOverviewRow) — LEARNERS only
 *   activity  analyticsGlobal/activity document data (or null)
 *   topics    { A1: {topicKey: {att,sum,done,fail}}, ... } (or null)
 *   nowMs
 */
export function buildGlobalAnalytics(input = {}) {
    const { rows = [], activity = null, topics = null, nowMs = Date.now() } = input;

    const DAY = 86400000;
    const learners = rows.filter((r) => r && r.role === 'customer');
    const totalUsers = learners.length;

    const activeSince = (windowMs) => learners.filter((r) => r.lastActivity && (nowMs - r.lastActivity) <= windowMs);
    const activeToday = activeSince(DAY).length;
    const active7 = activeSince(7 * DAY);
    const active30 = activeSince(30 * DAY);

    const newUsers30 = learners.filter((r) => r.registeredAt && (nowMs - r.registeredAt) <= 30 * DAY);
    const newUsers7 = learners.filter((r) => r.registeredAt && (nowMs - r.registeredAt) <= 7 * DAY);

    /* A "returning" learner is one who came back AFTER their first week —
       i.e. recent activity on an account that is no longer new. That is the
       number that actually says whether the platform retains people. */
    const returning = active30.filter((r) => r.registeredAt && (nowMs - r.registeredAt) > 7 * DAY).length;

    const inactive = learners.filter((r) => !r.lastActivity || (nowMs - r.lastActivity) > 30 * DAY).length;
    const blocked = learners.filter((r) => r.blocked).length;
    const subscribed = learners.filter((r) => r.subscription && r.subscription.active).length;

    // ---- per-course progress ----
    const courses = COURSE_ORDER.map((code) => {
        const withCourse = learners.filter((r) => {
            const c = (r.courses || []).find((x) => x.code === code);
            return c && c.completedTopics > 0;
        });
        const completed = learners.filter((r) => {
            const c = (r.courses || []).find((x) => x.code === code);
            return c && c.totalTopics > 0 && c.completedTopics >= c.totalTopics;
        }).length;
        const progressSum = withCourse.reduce((sum, r) => {
            const c = (r.courses || []).find((x) => x.code === code);
            return sum + (c ? c.progressPercent : 0);
        }, 0);
        const certificates = learners.reduce((sum, r) => {
            const c = (r.courses || []).find((x) => x.code === code);
            return sum + (c && c.certificate ? 1 : 0);
        }, 0);
        return {
            code,
            totalTopics: COURSE_TOTAL_TOPICS[code] || 0,
            studying: Math.max(0, withCourse.length - completed),
            started: withCourse.length,
            completed,
            completionRate: withCourse.length ? Math.round((completed / withCourse.length) * 100) : 0,
            averageProgress: withCourse.length ? Math.round(progressSum / withCourse.length) : 0,
            certificates,
        };
    });

    const startedAny = learners.filter((r) => (r.overallProgress || 0) > 0);
    const finishedAll = learners.filter((r) => (r.overallProgress || 0) >= 100).length;
    const currentlyStudying = startedAny.filter((r) => (r.overallProgress || 0) < 100).length;
    const averageCompletion = totalUsers
        ? Math.round(learners.reduce((s, r) => s + (r.overallProgress || 0), 0) / totalUsers)
        : 0;

    // ---- topic difficulty ----
    const topicRows = [];
    for (const code of COURSE_ORDER) {
        const bucket = (topics && topics[code]) || {};
        for (const [key, raw] of Object.entries(bucket)) {
            const att = Number(raw?.att) || 0;
            const done = Number(raw?.done) || 0;
            const fail = Number(raw?.fail) || 0;
            const sum = Number(raw?.sum) || 0;
            topicRows.push({
                course: code,
                topic: Number(key),
                attempts: att,
                completions: done,
                failures: fail,
                averageScore: att ? Math.round(sum / att) : null,
                failRate: att ? Math.round((fail / att) * 100) : null,
            });
        }
    }

    const ranked = topicRows.filter((t) => t.attempts >= TOPIC_MIN_ATTEMPTS && t.averageScore != null);
    const hardest = ranked.slice().sort((a, b) =>
        (a.averageScore - b.averageScore) || (b.failRate - a.failRate)).slice(0, 8);
    const mostCompleted = topicRows
        .filter((t) => t.completions > 0)
        .sort((a, b) => b.completions - a.completions)
        .slice(0, 8);

    /* "Least completed" is keyed off ATTEMPTS, not completions: a topic that
       learners keep opening and nobody ever finishes is the single most
       important row on this list, and filtering on completions > 0 would have
       hidden exactly that case. */
    const leastCompleted = topicRows
        .filter((t) => t.attempts > 0)
        .sort((a, b) => (a.completions - b.completions) || (b.attempts - a.attempts))
        .slice(0, 8);

    const scoredAttempts = topicRows.reduce((s, t) => s + t.attempts, 0);
    const scoreWeighted = topicRows.reduce((s, t) => s + (t.averageScore != null ? t.averageScore * t.attempts : 0), 0);
    const averageScore = scoredAttempts ? Math.round(scoreWeighted / scoredAttempts) : null;

    // ---- activity series ----
    const days = (activity && activity.days) || {};
    const daily = seriesFor(days, nowMs, 30);
    const weekly = sumRange(days, nowMs, 7);
    const monthly = sumRange(days, nowMs, 30);
    const today = daily[daily.length - 1] || { ms: 0, sessions: 0, events: 0 };

    /* ---- platform health ----
       A single 0-100 number an admin can glance at, built from four signals
       that each say something different, so one good number cannot mask a bad
       one: engagement (are people here), retention (do they come back),
       progression (are they moving) and outcomes (are they succeeding). */
    const engagement = totalUsers ? Math.round((active7.length / totalUsers) * 100) : 0;
    const retention = active30.length ? Math.round((returning / active30.length) * 100) : 0;
    const progression = totalUsers ? Math.round((startedAny.length / totalUsers) * 100) : 0;
    const outcomes = averageScore == null ? null : averageScore;
    const healthParts = [engagement, retention, progression].concat(outcomes == null ? [] : [outcomes]);
    const healthScore = healthParts.length
        ? Math.round(healthParts.reduce((a, b) => a + b, 0) / healthParts.length)
        : 0;

    return {
        generatedAt: nowMs,
        users: {
            total: totalUsers,
            active: active7.length,
            activeToday,
            active30: active30.length,
            inactive,
            new30: newUsers30.length,
            new7: newUsers7.length,
            returning,
            blocked,
            subscribed,
            currentlyStudying,
            completedAll: finishedAll,
        },
        progress: {
            averageCompletion,
            averageScore,
            certificates: learners.reduce((s, r) => s + (r.certificates || 0), 0),
            examsPassed: learners.reduce((s, r) => s + (r.examsPassed || 0), 0),
            wordsLearned: learners.reduce((s, r) => s + (r.wordsLearned || 0), 0),
            learningMs: learners.reduce((s, r) => s + (r.learningMs || 0), 0),
        },
        courses,
        topics: { hardest, mostCompleted, leastCompleted, ranked: ranked.length, tracked: topicRows.length },
        activity: { daily, today, weekly, monthly },
        health: { score: healthScore, engagement, retention, progression, outcomes },
    };
}
