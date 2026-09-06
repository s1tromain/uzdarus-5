/**
 * maintenance-store.js — reading and changing the one maintenance document.
 *
 * The document is written ONLY here, only from the server, only inside a
 * transaction, and only with server timestamps. Two developers on two tabs
 * pressing the switch at the same moment must not open two windows or close
 * one twice, and a retried HTTP request must not add the pause again: the
 * transaction reads the current state and returns unchanged when the requested
 * state is the one already stored.
 *
 * ---------------------------------------------------------------------------
 * THE HISTORY IS NOT CAPPED
 * ---------------------------------------------------------------------------
 * It used to keep the last 200 windows and drop the rest, which would one day
 * have handed a long-lived subscription less time back than the platform owed
 * it — silently, and only for the oldest customers. Now the document carries
 * the most recent INLINE_WINDOWS and everything older moves into immutable
 * chunk documents under system/maintenance/history. Nothing is discarded, and
 * readAllWindows() puts the whole record back together for the clock.
 */
import { initAdmin } from '../_firebaseAdmin.js';
import {
    MAINTENANCE_COLLECTION,
    MAINTENANCE_DOC_ID,
    HISTORY_SUBCOLLECTION,
    INLINE_WINDOWS,
    WINDOWS_PER_CHUNK,
    normalizeState,
    normalizeReason,
    toMs
} from '../../maintenance-state.js';

function docRef() {
    const { adminDb } = initAdmin();
    return adminDb.collection(MAINTENANCE_COLLECTION).doc(MAINTENANCE_DOC_ID);
}

function historyRef() {
    return docRef().collection(HISTORY_SUBCOLLECTION);
}

/** The stored state, or the "off" default when nothing has ever been written. */
export async function readMaintenance() {
    const snap = await docRef().get();
    return normalizeState(snap.exists ? snap.data() : null);
}

/**
 * Every closed window there has ever been, inline and archived, oldest first.
 *
 * Only the server calls this — the browser is handed a credit computed here
 * rather than a list to compute it from, so the size of the history never
 * reaches a phone.
 */
export async function readAllWindows() {
    const state = await readMaintenance();
    if (!state.archivedCount) return state.windows;

    const chunks = await historyRef().orderBy('firstStart').get();
    const archived = [];
    chunks.forEach((doc) => {
        const rows = Array.isArray(doc.data().windows) ? doc.data().windows : [];
        rows.forEach((w) => {
            const start = toMs(w && w.start);
            const end = toMs(w && w.end);
            if (start !== null && end !== null && end > start) archived.push({ start, end });
        });
    });
    return archived.concat(state.windows).sort((a, b) => a.start - b.start);
}

/**
 * Turn the mode on or off.
 *
 * Idempotent: asking for the state it is already in changes nothing and
 * reports `changed: false`, so a double click, a retried request or a second
 * tab cannot open a window twice or close one twice — which is what would make
 * the pause count twice against everyone's paid days.
 */
export async function setMaintenance({ active, reason, actor }) {
    const { adminDb, Timestamp } = initAdmin();
    const ref = docRef();
    const want = active === true;

    return adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const current = normalizeState(snap.exists ? snap.data() : null);
        const now = Timestamp.now();

        if (current.active === want) {
            /* Already there. The reason may still be updated while it is on —
               that is a message change, not a state change, so it neither opens
               nor closes a window. */
            if (want && reason !== undefined && normalizeReason(reason) !== current.reason) {
                tx.set(ref, {
                    reason: normalizeReason(reason),
                    updatedAt: now,
                    updatedBy: actor,
                    version: current.version + 1
                }, { merge: true });
                return { changed: false, reasonUpdated: true };
            }
            return { changed: false, reasonUpdated: false };
        }

        if (want) {
            tx.set(ref, {
                active: true,
                startedAt: now,
                reason: normalizeReason(reason),
                updatedAt: now,
                updatedBy: actor,
                version: current.version + 1
            }, { merge: true });
            return { changed: true, opened: true };
        }

        /* Closing: the window that just ended is recorded with SERVER time at
           both ends. A client clock is never consulted, so a laptop with the
           wrong date cannot lengthen or shorten everyone's paid period. */
        const started = current.startedAt;
        const windows = current.windows.slice();
        if (started !== null && now.toMillis() > started) {
            windows.push({ start: started, end: now.toMillis() });
        }

        const patch = {
            active: false,
            startedAt: null,
            updatedAt: now,
            updatedBy: actor,
            version: current.version + 1
        };

        if (windows.length > INLINE_WINDOWS) {
            /* Overflow moves out; it is never dropped. The chunk is written in
               the SAME transaction as the shortened inline list, so the two can
               never disagree — there is no instant at which a window exists in
               neither place. */
            const overflow = windows.slice(0, windows.length - INLINE_WINDOWS);
            const keep = windows.slice(windows.length - INLINE_WINDOWS);

            for (let i = 0; i < overflow.length; i += WINDOWS_PER_CHUNK) {
                const slice = overflow.slice(i, i + WINDOWS_PER_CHUNK);
                const chunk = historyRef().doc(String(slice[0].start));
                tx.set(chunk, {
                    firstStart: Timestamp.fromMillis(slice[0].start),
                    lastEnd: Timestamp.fromMillis(slice[slice.length - 1].end),
                    windows: slice.map((w) => ({
                        start: Timestamp.fromMillis(w.start),
                        end: Timestamp.fromMillis(w.end)
                    }))
                });
            }

            patch.windows = keep.map((w) => ({
                start: Timestamp.fromMillis(w.start),
                end: Timestamp.fromMillis(w.end)
            }));
            patch.archivedMs = current.archivedMs
                + overflow.reduce((sum, w) => sum + (w.end - w.start), 0);
            patch.archivedCount = current.archivedCount + overflow.length;
            patch.archivedUntil = Timestamp.fromMillis(overflow[overflow.length - 1].end);
        } else {
            patch.windows = windows.map((w) => ({
                start: Timestamp.fromMillis(w.start),
                end: Timestamp.fromMillis(w.end)
            }));
        }

        tx.set(ref, patch, { merge: true });
        return { changed: true, opened: false };
    });
}
