/**
 * analytics-store.js — the (thin) Firestore glue for analytics, isolated from
 * HTTP so it can be unit-tested with a mock Firestore (see tests/analytics).
 *
 * `admin` is the object returned by initAdmin(): { adminDb, FieldValue }.
 */

import {
    sanitizeBatch, applyEventsToSummary, summaryToStats, buildStudentDashboard,
} from './analytics.js';

/**
 * Ingest a batch of raw client events for one user in a SINGLE Firestore batch:
 *   users/{uid}/events/{autoId}     one doc per event
 *   users/{uid}/analytics/summary   updated aggregates
 *   users/{uid}.stats               denormalized counters
 * @returns {{ written:number, dropped:number }}
 */
export async function ingestEvents(admin, uid, rawEvents, nowMs = Date.now()) {
    const { adminDb, FieldValue } = admin;
    const { events, dropped } = sanitizeBatch(rawEvents, nowMs);
    if (!events.length) return { written: 0, dropped };

    const userRef = adminDb.collection('users').doc(uid);
    const eventsCol = userRef.collection('events');
    const summaryRef = userRef.collection('analytics').doc('summary');

    const summarySnap = await summaryRef.get();
    const prevSummary = summarySnap.exists ? summarySnap.data() : null;
    const nextSummary = applyEventsToSummary(prevSummary, events);

    const batch = adminDb.batch();
    for (const ev of events) {
        batch.set(eventsCol.doc(), { ...ev, ts: FieldValue.serverTimestamp() });
    }
    batch.set(summaryRef, { ...nextSummary, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    batch.set(userRef, {
        stats: summaryToStats(nextSummary, nowMs),
        lastActivity: FieldValue.serverTimestamp(),
    }, { merge: true });

    await batch.commit();
    return { written: events.length, dropped };
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
