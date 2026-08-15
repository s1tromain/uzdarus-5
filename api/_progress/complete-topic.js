import { initAdmin } from '../_firebaseAdmin.js';
import {
    assertMethod, handleCors, readBody, requireSession, sendJson, safeError
} from '../_lib/request.js';
import { normalizeRole } from '../_lib/roles.js';
import { isAccountFrozen } from '../../account-freeze.js';
import { COURSE_CANON } from '../_lib/course-canon.js';

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
            const current = (Array.isArray(courseState.completedTopics) ? courseState.completedTopics : [])
                .map(Number)
                .filter((n) => Number.isInteger(n) && n > 0 && n <= canon.totalTopics);

            /* Already done — succeed without writing. Two tabs finishing the
               same topic produce one record, not two. */
            if (current.includes(topicId)) {
                return { completedTopics: current.slice().sort((a, b) => a - b), changed: false };
            }

            /* No skipping. Topic 1 needs nothing; every other topic needs the
               one before it, judged against the SERVER's record. */
            if (topicId > 1 && !current.includes(topicId - 1)) {
                throw Object.assign(
                    new Error('Avvalgi mavzuni tugatish kerak'),
                    { statusCode: 409 }
                );
            }

            /* Monotonic: the union is read and rewritten inside the transaction,
               so a concurrent completion of another topic cannot be lost. */
            const next = Array.from(new Set([...current, topicId])).sort((a, b) => a - b);

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
