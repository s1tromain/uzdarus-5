import { initAdmin } from '../_firebaseAdmin.js';
import {
    assertMethod, handleCors, readBody, requireSession, sendJson, safeError
} from '../_lib/request.js';
import { normalizeRole } from '../_lib/roles.js';
import { isAccountFrozen } from '../../account-freeze.js';
import { COURSE_CANON } from '../_lib/course-canon.js';
import {
    completedIds, previousTopicSatisfied, finalizeCompletedTopics
} from '../_lib/topic-components.js';

/**
 * POST /api/progress?action=complete-topic   { course, topicId }
 *
 * The ONLY way a learner's completedTopics may grow.
 *
 * Firestore rules no longer let the owner write courses.<C>.completedTopics, so
 * this is not merely the preferred path — it is the only one. What the client
 * sends is a CLAIM about one topic, never the array: a request may add exactly
 * one id, to the caller's own record, and only if the previous topic is already
 * there. It cannot supply the array, cannot name a user, and cannot reach a
 * topic it has not walked up to.
 *
 * SINCE THE COMPONENT MODEL EXISTS THIS ROUTE NO LONGER COMPLETES ANYTHING.
 * A paid topic is finished only when BOTH of its halves are — the vocabulary
 * deck and the exercise section — and those are reported through
 * ?action=complete-component, which is the one place an id may be appended.
 * Leaving this endpoint able to append would have left the whole rule
 * bypassable by one hand-written request, so it now FINALIZES rather than
 * completes: it re-reads the stored component record and appends only what
 * that record already earns. A topic with one half done is refused.
 *
 * A topic already in completedTopics — every topic finished under the old
 * one-step rule — still answers success and is never removed.
 *
 * HONEST LIMIT: whether the learner actually answered the topic correctly is
 * still asserted by the browser — lesson grading lives in the course pages. What
 * this closes is arbitrary progress authorship: no more "I finished all twelve",
 * no more editing someone else's record, no more skipping to the end. The final
 * exam, which is what a certificate depends on, IS scored server-side.
 */
export default async function handler(req, res) {
    if (handleCors(req, res, ['POST'])) return;
    if (!assertMethod(req, res, 'POST')) return;

    try {
        const session = await requireSession(req);
        const { adminDb, FieldValue } = initAdmin();
        const body = await readBody(req);

        /* uid comes from the verified session and nowhere else. A `uid` in the
           body is ignored entirely — there is no code path that reads it. */
        const uid = session.uid;

        const course = String(body.course || '').trim().toUpperCase();
        const canon = COURSE_CANON[course];
        if (!canon) {
            throw Object.assign(new Error('Noma’lum kurs'), { statusCode: 400 });
        }

        const topicId = Number(body.topicId);
        if (!Number.isInteger(topicId) || topicId < 1 || topicId > canon.totalTopics) {
            throw Object.assign(new Error('Noto‘g‘ri mavzu raqami'), { statusCode: 400 });
        }

        const userRef = adminDb.collection('users').doc(uid);

        const result = await adminDb.runTransaction(async (transaction) => {
            const snap = await transaction.get(userRef);
            if (!snap.exists) {
                throw Object.assign(new Error('Foydalanuvchi topilmadi'), { statusCode: 404 });
            }
            const data = snap.data() || {};

            /* Same gates the paid pages apply, read from the same fields, so a
               blocked or frozen account cannot bank progress through the API
               after being refused at the door. Staff keep their testing flow. */
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
            const current = completedIds(courseState, canon.totalTopics);

            /* Already done — succeed without writing. Two tabs finishing the
               same topic produce one record, not two. */
            if (current.includes(topicId)) {
                return { completedTopics: current.slice().sort((a, b) => a - b), changed: false };
            }

            /* No skipping. Topic 1 needs nothing; every other topic needs the
               one before it FINISHED, judged against the SERVER's record by
               either the legacy array or both components. */
            if (!previousTopicSatisfied(courseState, topicId, canon.totalTopics)) {
                throw Object.assign(
                    new Error('Avvalgi mavzuni tugatish kerak'),
                    { statusCode: 409 }
                );
            }

            /* THE GATE. finalizeCompletedTopics() returns an array only when the
               stored record already earns the id — the EXERCISES reported — and
               null otherwise. This endpoint has no way to overrule it.

               The refusal names the exercises and nothing else. It used to send
               a learner whose exercises were done off to the vocabulary deck,
               which is precisely the errand that stranded them. */
            const next = finalizeCompletedTopics(courseState, topicId, canon.totalTopics);
            if (!next) {
                throw Object.assign(
                    new Error('Avval ushbu mavzudagi mashqlarni yakunlang.'),
                    { statusCode: 409 }
                );
            }

            transaction.update(userRef, {
                [`courses.${course}.completedTopics`]: next,
                [`courses.${course}.lastUpdated`]: new Date().toISOString(),
                lastActivity: FieldValue.serverTimestamp()
            });

            return { completedTopics: next, changed: true };
        });

        sendJson(res, 200, {
            ok: true,
            course,
            topicId,
            /* The client treats THIS as the progress, not its own array. */
            completedTopics: result.completedTopics
        });
    } catch (error) {
        safeError(res, error);
    }
}
