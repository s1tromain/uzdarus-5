/**
 * maintenance-store.js — reading and changing the one maintenance document.
 *
 * The document is written ONLY here, only from the server, only inside a
 * transaction, and only with server timestamps. Two developers on two tabs
 * pressing the switch at the same moment must not open two windows or close
 * one twice, and a retried HTTP request must not add the pause again: the
 * transaction reads the current state and returns unchanged when the requested
 * state is the one already stored.
 */
import { initAdmin } from '../_firebaseAdmin.js';
import {
    MAINTENANCE_COLLECTION,
    MAINTENANCE_DOC_ID,
    MAX_WINDOWS,
    normalizeState,
    normalizeReason
} from '../../maintenance-state.js';

function docRef() {
    const { adminDb } = initAdmin();
    return adminDb.collection(MAINTENANCE_COLLECTION).doc(MAINTENANCE_DOC_ID);
}

/** The stored state, or the "off" default when nothing has ever been written. */
export async function readMaintenance() {
    const snap = await docRef().get();
    return normalizeState(snap.exists ? snap.data() : null);
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
                return { changed: false, reasonUpdated: true, state: { ...current, reason: normalizeReason(reason) } };
            }
            return { changed: false, reasonUpdated: false, state: current };
        }

        if (want) {
            tx.set(ref, {
                active: true,
                startedAt: now,
                reason: normalizeReason(reason),
                updatedAt: now,
                updatedBy: actor,
                version: current.version + 1,
                windows: current.windows.map((w) => ({
                    start: Timestamp.fromMillis(w.start),
                    end: Timestamp.fromMillis(w.end)
                }))
            }, { merge: true });
            return { changed: true, opened: true, state: null };
        }

        /* Closing: the window that just ended is recorded with SERVER time at
           both ends. A client clock is never consulted, so a laptop with the
           wrong date cannot lengthen or shorten everyone's paid period. */
        const started = current.startedAt;
        const windows = current.windows.slice();
        if (started !== null && now.toMillis() > started) {
            windows.push({ start: started, end: now.toMillis() });
        }
        const trimmed = windows.slice(-MAX_WINDOWS);

        tx.set(ref, {
            active: false,
            startedAt: null,
            updatedAt: now,
            updatedBy: actor,
            version: current.version + 1,
            windows: trimmed.map((w) => ({
                start: Timestamp.fromMillis(w.start),
                end: Timestamp.fromMillis(w.end)
            }))
        }, { merge: true });
        return { changed: true, opened: false, state: null };
    });
}
