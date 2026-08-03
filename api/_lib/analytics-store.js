/**
 * analytics-store.js — the (thin) Firestore glue for analytics, isolated from
 * HTTP so it can be unit-tested with a mock Firestore (see tests/analytics).
 *
 * `admin` is the object returned by initAdmin(): { adminDb, FieldValue }.
 */

import {
    sanitizeBatch, applyEventsToSummary, summaryToStats, buildStudentDashboard,
    buildStudentOverviewRow, buildGlobalDelta, buildGlobalAnalytics, staleActivityDays,
} from './analytics.js';

/* Collections that make the admin panel live without polling. Both are written
   ONLY here (Admin SDK) and are read-only to every client — see firestore.rules. */
export const PULSE_COLLECTION = 'studentPulse';
export const GLOBAL_COLLECTION = 'analyticsGlobal';
export const GLOBAL_ACTIVITY_DOC = 'activity';

/**
 * Project one learner's compact overview row into studentPulse/{uid}.
 *
 * WHY A PROJECTION AND NOT A LISTENER ON `users`
 * ---------------------------------------------
 * The admin panel needs student changes to appear instantly. Subscribing the
 * browser directly to the `users` collection would have meant opening every
 * user document to every staff role in firestore.rules — including staff
 * accounts, e-mail addresses and device hashes — and the per-role visibility
 * policy (canViewUser) is not expressible there. So the server publishes a
 * narrow, already-filtered projection instead: LEARNERS ONLY, exactly the
 * fields the admin list renders. A teacher subscribing to the whole collection
 * still cannot see a single staff account, because none is ever written.
 *
 * `updatedAt` is what the client filters on, so a panel that has just loaded
 * its baseline over HTTP subscribes with `where('updatedAt','>',loadedAt)` and
 * pays for changed documents only — the steady-state cost of "realtime" is one
 * document read per student action, and zero when nobody is studying.
 */
function writePulse(batch, admin, uid, userData, nowMs) {
    const { adminDb, FieldValue } = admin;
    const role = String(userData?.role || 'customer').toLowerCase();

    if (role !== 'customer') {
        return false;                        // staff are never projected
    }

    const row = buildStudentOverviewRow(uid, userData, nowMs);
    if (!row.username) {
        return false;                        // incomplete/system document
    }

    batch.set(adminDb.collection(PULSE_COLLECTION).doc(uid), {
        ...row,
        updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
}

/** Convert the pure global deltas into Firestore increment payloads. */
function globalIncrements(admin, delta) {
    const { FieldValue } = admin;
    const activity = { days: {} };

    for (const [day, bucket] of Object.entries(delta.days)) {
        activity.days[day] = {
            ms: FieldValue.increment(bucket.ms),
            events: FieldValue.increment(bucket.events),
            sessions: FieldValue.increment(bucket.sessions),
            pron: FieldValue.increment(bucket.pron),
            words: FieldValue.increment(bucket.words),
        };
    }

    const topics = {};
    for (const [course, bucket] of Object.entries(delta.topics)) {
        const t = {};
        for (const [topicKey, counters] of Object.entries(bucket)) {
            t[topicKey] = {
                att: FieldValue.increment(counters.att),
                sum: FieldValue.increment(counters.sum),
                done: FieldValue.increment(counters.done),
                fail: FieldValue.increment(counters.fail),
            };
        }
        topics[course] = t;
    }

    return { activity, topics };
}

/**
 * Ingest a batch of raw client events for one user in a SINGLE Firestore batch:
 *   users/{uid}/events/{autoId}     one doc per event
 *   users/{uid}/analytics/summary   updated aggregates
 *   users/{uid}.stats               denormalized counters
 *   studentPulse/{uid}              realtime projection for the admin panel
 *   analyticsGlobal/*               platform-wide counters (Stage 7)
 *
 * Everything still commits atomically in ONE batch, so the admin panel can
 * never observe a half-applied action.
 *
 * @returns {{ written:number, dropped:number }}
 */
export async function ingestEvents(admin, uid, rawEvents, nowMs = Date.now()) {
    const { adminDb, FieldValue } = admin;
    const { events, dropped } = sanitizeBatch(rawEvents, nowMs);
    if (!events.length) return { written: 0, dropped };

    const userRef = adminDb.collection('users').doc(uid);
    const eventsCol = userRef.collection('events');
    const summaryRef = userRef.collection('analytics').doc('summary');

    /* The user document is needed to project the pulse row (progress lives
       there, written directly by the course pages). Reading it ALONGSIDE the
       summary rather than after it keeps the added latency at zero. */
    const [summarySnap, userSnap] = await Promise.all([
        summaryRef.get(),
        userRef.get(),
    ]);

    const prevSummary = summarySnap.exists ? summarySnap.data() : null;
    const nextSummary = applyEventsToSummary(prevSummary, events);
    const stats = summaryToStats(nextSummary, nowMs);

    const batch = adminDb.batch();
    for (const ev of events) {
        batch.set(eventsCol.doc(), { ...ev, ts: FieldValue.serverTimestamp() });
    }
    batch.set(summaryRef, { ...nextSummary, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    batch.set(userRef, {
        stats,
        lastActivity: FieldValue.serverTimestamp(),
    }, { merge: true });

    /* Pulse row reflects the state AFTER this batch, so the admin panel sees
       the new counters in the same update that carries the new progress. */
    if (userSnap.exists) {
        const userData = userSnap.data() || {};
        writePulse(batch, admin, uid, { ...userData, stats, lastActivity: nowMs }, nowMs);
    }

    const delta = buildGlobalDelta(events);
    const { activity, topics } = globalIncrements(admin, delta);

    if (Object.keys(activity.days).length) {
        batch.set(adminDb.collection(GLOBAL_COLLECTION).doc(GLOBAL_ACTIVITY_DOC), activity, { merge: true });
    }
    for (const [course, payload] of Object.entries(topics)) {
        batch.set(adminDb.collection(GLOBAL_COLLECTION).doc(`topics_${course}`), payload, { merge: true });
    }

    await batch.commit();
    return { written: events.length, dropped };
}

/**
 * Republish (or remove) one learner's pulse row outside the ingest path.
 *
 * Called by the admin mutations that change what the list shows — creation,
 * subscription edits, blocking, role changes, deletion — so a second admin's
 * open panel updates without a refresh, and a deleted account disappears
 * instead of lingering as a ghost row.
 *
 * Best-effort by design: a pulse failure must never roll back the admin action
 * that already succeeded (the authoritative data lives on the user document).
 */
export async function syncPulse(admin, uid, { deleted = false } = {}, nowMs = Date.now()) {
    const { adminDb, FieldValue } = admin;

    try {
        const pulseRef = adminDb.collection(PULSE_COLLECTION).doc(uid);

        /* ---- retraction is a TOMBSTONE, not a delete ----
           Subscribers filter on `updatedAt > baseline`, so a document that has
           not changed since a panel loaded is not in that panel's result set —
           and deleting it therefore produces NO snapshot event there. The row
           would survive as a ghost in every other admin's open panel until
           they reloaded. A tombstone carries a fresh `updatedAt`, so it MATCHES
           the query and every listener is told to drop the row. It is a handful
           of bytes and deletions are rare. */
        const retract = async () => {
            await pulseRef.set({
                uid,
                deleted: true,
                role: null,
                username: null,
                updatedAt: FieldValue.serverTimestamp(),
            });
        };

        if (deleted) {
            await retract();
            return true;
        }

        const snap = await adminDb.collection('users').doc(uid).get();
        if (!snap.exists) {
            await retract();
            return true;
        }

        const batch = adminDb.batch();
        const written = writePulse(batch, admin, uid, snap.data() || {}, nowMs);

        if (!written) {
            /* Role changed customer -> staff: retract the projection so the
               account stops appearing in the learner list. */
            await retract();
            return true;
        }

        await batch.commit();
        return true;
    } catch (error) {
        console.error('[pulse] sync failed for', uid, error?.message || error);
        return false;
    }
}

/**
 * Read the platform-wide dashboard.
 *
 * Cost: one users-collection scan (same as students-overview, which the admin
 * panel already performs) plus five small counter documents — NOT a fan-out
 * over per-user subcollections.
 */
export async function readGlobalAnalytics(admin, { canView, nowMs = Date.now() } = {}) {
    const { adminDb } = admin;
    const globalCol = adminDb.collection(GLOBAL_COLLECTION);

    const [usersSnap, activitySnap, ...topicSnaps] = await Promise.all([
        adminDb.collection('users').get(),
        globalCol.doc(GLOBAL_ACTIVITY_DOC).get().catch(() => ({ exists: false })),
        ...['A1', 'A2', 'B1', 'B2'].map((code) =>
            globalCol.doc(`topics_${code}`).get().catch(() => ({ exists: false }))),
    ]);

    const rows = usersSnap.docs
        .map((d) => ({ uid: d.id, data: d.data() || {} }))
        .filter(({ data }) => (typeof canView === 'function' ? canView(data) : true))
        .map(({ uid, data }) => buildStudentOverviewRow(uid, data, nowMs))
        .filter((r) => r.username);

    const activity = activitySnap.exists ? activitySnap.data() : null;
    const topics = {};
    ['A1', 'A2', 'B1', 'B2'].forEach((code, i) => {
        const snap = topicSnaps[i];
        if (snap && snap.exists) topics[code] = snap.data() || {};
    });

    const analytics = buildGlobalAnalytics({ rows, activity, topics, nowMs });

    /* Opportunistic retention: the activity document is already in hand, so
       trimming expired day buckets here costs one write and only when there is
       something to trim — no scheduled job, no unbounded document growth. */
    const stale = staleActivityDays(activity, nowMs);
    if (stale.length) {
        const { FieldValue } = admin;
        const payload = { days: {} };
        stale.forEach((key) => { payload.days[key] = FieldValue.delete(); });
        globalCol.doc(GLOBAL_ACTIVITY_DOC)
            .set(payload, { merge: true })
            .catch((e) => console.error('[global] prune failed', e?.message || e));
    }

    return analytics;
}

/**
 * Read everything needed for the admin dashboard (bounded reads) and assemble
 * it. Returns { found:false } if the user does not exist, else
 * { found:true, profile, dashboard }.
 */
export async function readStudentDashboard(admin, uid, { eventLimit = 300 } = {}) {
    const { adminDb } = admin;
    const userRef = adminDb.collection('users').doc(uid);

    const [userSnap, quizSnap, certSnap, summarySnap, eventsSnap] = await Promise.all([
        userRef.get(),
        userRef.collection('quizResults').get(),
        userRef.collection('certificates').get().catch(() => ({ docs: [] })),
        userRef.collection('analytics').doc('summary').get().catch(() => ({ exists: false })),
        userRef.collection('events').orderBy('ts', 'desc').limit(eventLimit).get().catch(() => ({ docs: [] })),
    ]);

    if (!userSnap.exists) return { found: false };
    const profile = { uid, ...userSnap.data() };
    const quizResults = quizSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const certificates = (certSnap.docs || []).map(d => ({ id: d.id, ...d.data() }));
    const summary = summarySnap.exists ? summarySnap.data() : null;
    const events = (eventsSnap.docs || []).map(d => d.data());

    const dashboard = buildStudentDashboard({ profile, quizResults, certificates, summary, events });
    return { found: true, profile, dashboard };
}
