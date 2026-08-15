import { initAdmin } from '../_firebaseAdmin.js';
import {
    assertMethod, handleCors, readBody, requireSession, sendJson, safeError
} from '../_lib/request.js';
import { normalizeRole } from '../_lib/roles.js';
import { isAccountFrozen } from '../../account-freeze.js';
import { COURSE_CANON } from '../_lib/course-canon.js';
import { gradeExam, assertSubmissionShape, isExamCourse } from '../_lib/exam-scoring.js';

/**
 * POST /api/progress?action=final-exam   { course, answers }
 *
 * The server grades the exam and writes the verdict. The learner sends what
 * they answered; they do not send how they did.
 *
 * This is the field the certificate rests on. api/_lib/certificates.js issues on
 * `courses.<C>.finalExamPassed === true`, which used to be writable by the very
 * person it certifies — a one-line DevTools edit produced a real, numbered
 * certificate. `passed` is now a conclusion drawn here, from the canonical
 * answer key, and Firestore rules forbid the owner from writing it at all.
 *
 * `score` and `passed` in the request body are not read. There is no code path
 * that reads them; sending them changes nothing.
 */
export default async function handler(req, res) {
    if (handleCors(req, res, ['POST'])) return;
    if (!assertMethod(req, res, 'POST')) return;

    try {
        const session = await requireSession(req);
        const { adminDb, FieldValue } = initAdmin();
        const body = await readBody(req);

        const uid = session.uid;                     // session only, never the body

        const course = String(body.course || '').trim().toUpperCase();
        if (!COURSE_CANON[course] || !isExamCourse(course)) {
            throw Object.assign(new Error('Bu kurs uchun imtihon mavjud emas'), { statusCode: 400 });
        }

        /* Refuse a malformed or oversized submission before grading it. */
        assertSubmissionShape(course, body.answers);

        /* THE VERDICT. Computed from the answers, never taken from the body. */
        const graded = gradeExam(course, body.answers);

        const userRef = adminDb.collection('users').doc(uid);

        const outcome = await adminDb.runTransaction(async (transaction) => {
            const snap = await transaction.get(userRef);
            if (!snap.exists) {
                throw Object.assign(new Error('Foydalanuvchi topilmadi'), { statusCode: 404 });
            }
            const data = snap.data() || {};

            const role = normalizeRole(data.role);
            const privileged = role === 'developer' || role === 'admin';
            if (!privileged) {
                if (data.blocked === true) {
                    throw Object.assign(new Error('Akkaunt bloklangan'), { statusCode: 403 });
                }
                if (isAccountFrozen(data)) {
                    throw Object.assign(new Error('Akkaunt muzlatilgan'), { statusCode: 403 });
                }
            }

            const courseState = (data.courses && data.courses[course]) || {};
            const previousBest = Number(courseState.finalExamScore) || 0;
            const alreadyPassed = courseState.finalExamPassed === true;

            /* A retake may improve a record; it may never damage one. A learner
               who has passed and then sits it again for practice keeps their
               pass and their best score, and any certificate already issued is
               untouched — certificateNumber is not written here at all. */
            const bestScore = Math.max(previousBest, graded.score);
            const passed = alreadyPassed || graded.passed;

            const update = {
                [`courses.${course}.finalExamScore`]: bestScore,
                [`courses.${course}.finalExamPassed`]: passed,
                [`courses.${course}.lastUpdated`]: new Date().toISOString(),
                lastActivity: FieldValue.serverTimestamp()
            };

            /* Completion timestamps and unlocks are recorded on the attempt that
               first earned them, and never rewritten by a later one. */
            if (passed && !alreadyPassed) {
                update[`courses.${course}.finalExamCompletedAt`] = new Date().toISOString();
                update[`courses.${course}.courseCompleted`] = true;
                update[`courses.${course}.certificateUnlocked`] = true;
            }

            transaction.update(userRef, update);

            return { bestScore, passed, firstPass: passed && !alreadyPassed };
        });

        sendJson(res, 200, {
            ok: true,
            course,
            /* What the learner is told, and what was written, are the same
               numbers — the page renders this response. */
            correct: graded.correct,
            total: graded.total,
            score: graded.score,
            passMark: graded.passMark,
            passed: outcome.passed,
            bestScore: outcome.bestScore,
            certificateUnlocked: outcome.passed
        });
    } catch (error) {
        safeError(res, error);
    }
}
