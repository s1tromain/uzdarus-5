import { initAdmin } from '../_firebaseAdmin.js';

/**
 * Certificate ecosystem — shared server-side logic (Admin SDK only).
 *
 * Firestore layout (all written exclusively here, via the Admin SDK):
 *   users/{uid}/certificates/{certificateNumber}  — full per-user record
 *   certificateRegistry/{certificateNumber}        — public-safe lookup record
 *   counters/certificates                          — monotonic per-course/year counters
 *
 * Certificate numbers are globally unique and sequential, generated inside a
 * Firestore transaction so concurrent issuance can never collide or duplicate.
 * Format: UZD-<COURSE>-<YEAR>-<6-digit-seq>  e.g. UZD-A1-2026-000001
 */

// Only courses with a complete topic + final-exam + completion flow can issue
// certificates. A2/B2 are "coming soon" and intentionally excluded for now.
export const CERT_COURSES = Object.freeze({
    A1: {
        level: 'A1',
        courseTitle: "A1 Daraja — Rus tili",
        levelLabel: "A1 «Boshlang'ich daraja»"
    },
    B1: {
        level: 'B1',
        courseTitle: "B1 Daraja — Rus tili",
        levelLabel: "B1 «O'rta daraja»"
    }
});

const REGISTRY_COLLECTION = 'certificateRegistry';
const COUNTER_DOC_PATH = 'counters/certificates';

export function normalizeCourse(course) {
    return String(course || '').trim().toUpperCase();
}

export function isCertifiableCourse(course) {
    return Object.prototype.hasOwnProperty.call(CERT_COURSES, normalizeCourse(course));
}

function resolveUserName(profile) {
    return (
        profile?.displayName ||
        profile?.username ||
        profile?.name ||
        'Foydalanuvchi'
    );
}

function privilegedRole(role) {
    const r = String(role || '').trim().toLowerCase();
    return r === 'developer' || r === 'admin';
}

/**
 * Issue (or return the already-issued) certificate for a user + course.
 *
 * Idempotent and atomic: the user document's `courses.<COURSE>.certificateNumber`
 * is the single source of truth for "already issued", read and written inside the
 * same transaction that allocates the sequential number.
 *
 * Eligibility (non-privileged): the user's `courses.<COURSE>.finalExamPassed`
 * must be true. That flag is only ever written by the final-exam page AFTER it
 * verified a >=80% pass AND all topics complete, so it is the authoritative,
 * tamper-proof completion signal (localStorage alone can never set it server-side).
 *
 * @returns {Promise<{ certificate: object, number: string, alreadyIssued: boolean }>}
 */
export async function issueCertificate({ uid, course, profile, isPrivileged }) {
    const { adminDb, FieldValue, Timestamp } = initAdmin();

    const COURSE = normalizeCourse(course);
    const config = CERT_COURSES[COURSE];
    if (!config) {
        throw Object.assign(new Error('Sertifikat berib bo‘lmaydigan kurs'), { statusCode: 400 });
    }

    const privileged = typeof isPrivileged === 'boolean'
        ? isPrivileged
        : privilegedRole(profile?.role);

    const userRef = adminDb.collection('users').doc(uid);
    const counterRef = adminDb.doc(COUNTER_DOC_PATH);
    const year = new Date().getFullYear();
    const counterKey = `${COURSE}_${year}`;

    const outcome = await adminDb.runTransaction(async (t) => {
        const userSnap = await t.get(userRef);
        if (!userSnap.exists) {
            throw Object.assign(new Error('Foydalanuvchi topilmadi'), { statusCode: 404 });
        }

        const userData = userSnap.data() || {};
        const courseData = (userData.courses && userData.courses[COURSE]) || {};

        // Eligibility — privileged accounts (developer/admin) bypass for testing.
        const eligible = privileged || courseData.finalExamPassed === true;
        if (!eligible) {
            throw Object.assign(new Error('Sertifikat sharti bajarilmagan'), { statusCode: 403 });
        }

        // Idempotency — never generate a second number for the same user + course.
        if (courseData.certificateNumber) {
            const existingRef = userRef.collection('certificates').doc(courseData.certificateNumber);
            const existingSnap = await t.get(existingRef);
            return {
                alreadyIssued: true,
                number: courseData.certificateNumber,
                certificate: existingSnap.exists ? existingSnap.data() : null
            };
        }

        const counterSnap = await t.get(counterRef);
        const counterData = counterSnap.exists ? (counterSnap.data() || {}) : {};
        const seq = (Number(counterData[counterKey]) || 0) + 1;
        const number = `UZD-${COURSE}-${year}-${String(seq).padStart(6, '0')}`;

        const now = new Date();
        const issueTs = Timestamp.fromDate(now);
        const userName = resolveUserName(userData);
        const score = Number.isFinite(Number(courseData.finalExamScore))
            ? Number(courseData.finalExamScore)
            : null;

        const certificate = {
            certificateId: number,
            certificateNumber: number,
            course: COURSE,
            level: config.level,
            issueDate: issueTs,
            userId: uid,
            userName,
            score,
            status: 'active',
            certificateData: {
                courseTitle: config.courseTitle,
                levelLabel: config.levelLabel,
                name: userName,
                score,
                date: now.toISOString(),
                number
            }
        };

        const registryRecord = {
            certificateNumber: number,
            course: COURSE,
            level: config.level,
            userId: uid,
            userName,
            issueDate: issueTs,
            score,
            status: 'active'
        };

        // All writes — atomic with the counter increment + idempotency anchor.
        t.set(counterRef, { [counterKey]: seq, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        t.set(userRef, {
            courses: { [COURSE]: { certificateNumber: number, certificateIssuedAt: issueTs } }
        }, { merge: true });
        t.set(userRef.collection('certificates').doc(number), certificate);
        t.set(adminDb.collection(REGISTRY_COLLECTION).doc(number), registryRecord);

        return { alreadyIssued: false, number, certificate };
    });

    return outcome;
}

/** Public verification lookup — registry record by exact certificate number. */
export async function getRegistryCertificate(certificateNumber) {
    const { adminDb } = initAdmin();
    const number = String(certificateNumber || '').trim().toUpperCase();
    if (!number) {
        return null;
    }

    const snap = await adminDb.collection(REGISTRY_COLLECTION).doc(number).get();
    return snap.exists ? snap.data() : null;
}

/** All certificates for a single user (admin / per-user view). */
export async function listUserCertificates(uid) {
    const { adminDb } = initAdmin();
    if (!uid) {
        return [];
    }

    const snap = await adminDb.collection('users').doc(uid).collection('certificates').get();
    return snap.docs.map((d) => d.data());
}
