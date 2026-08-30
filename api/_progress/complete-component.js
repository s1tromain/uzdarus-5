import { initAdmin } from '../_firebaseAdmin.js';
import {
    assertMethod, handleCors, readBody, requireSession, sendJson, safeError
} from '../_lib/request.js';
import { normalizeRole } from '../_lib/roles.js';
import { isAccountFrozen } from '../../account-freeze.js';
import { COURSE_CANON } from '../_lib/course-canon.js';
import {
    normalizeComponent, componentsOf, completedIds,
    previousTopicSatisfied, finalizeCompletedTopics, isTopicComplete
} from '../_lib/topic-components.js';

/**
 * POST /api/progress?action=complete-component  { course, topicId, component }
 *
 * A paid topic has two sections — the vocabulary deck and the exercises — and
 * this is how a learner reports finishing one of them. It is the ONLY way
 * `completedTopics` grows for a topic that is not already complete: the topic
 * id is appended here, by the server, the moment the EXERCISES land. The deck
 * is recorded the same way and gates nothing (see topic-components.js).
 *
 * What the client sends is a claim about ONE half of ONE topic. It cannot send
 * the array, cannot name another user, cannot reach a topic it has not walked
 * up to, and cannot decide that the topic is finished — that conclusion is
 * drawn from the stored record inside the transaction.
 *
 * HONEST LIMIT, unchanged from complete-topic: whether the learner really
 * worked through the deck or really passed the exercises is asserted by the
 * browser. What this closes is the structural hole — finishing one half and
 * having the next topic open anyway.
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

        const totalTopics = canon.totalTopics;
        const topicId = Number(body.topicId);
        if (!Number.isInteger(topicId) || topicId < 1 || topicId > canon.totalTopics) {
            throw Object.assign(new Error('Noto‘g‘ri mavzu raqami'), { statusCode: 400 });
        }

        const component = normalizeComponent(body.component);
        if (!component) {
            throw Object.assign(new Error('Noto‘g‘ri bo‘lim'), { statusCode: 400 });
        }

        const userRef = adminDb.collection('users').doc(uid);

        const result = await adminDb.runTransaction(async (transaction) => {
            const snap = await transaction.get(userRef);
            if (!snap.exists) {
                throw Object.assign(new Error('Foydalanuvchi topilmadi'), { statusCode: 404 });
            }
            const data = snap.data() || {};

            /* The same gates every paid surface applies. */
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

            /* No skipping. Judged against the SERVER's record, by either the
               legacy route or both components. */
            if (!privileged && !previousTopicSatisfied(courseState, topicId, canon.totalTopics)) {
                throw Object.assign(
                    new Error('Avvalgi mavzuni tugatish kerak'),
                    { statusCode: 409 }
                );
            }

            const before = componentsOf(courseState, topicId);
            const alreadyThisOne = before[`${component}Completed`] === true;

            const stamp = new Date().toISOString();
            const update = {
                [`courses.${course}.lastUpdated`]: stamp,
                lastActivity: FieldValue.serverTimestamp()
            };
            /* IDEMPOTENT: a second report of the same half rewrites nothing, so
               the original completion timestamp survives. */
            if (!alreadyThisOne) {
                update[`courses.${course}.topicComponents.${topicId}.${component}Completed`] = true;
                update[`courses.${course}.topicComponents.${topicId}.${component}CompletedAt`] = stamp;
            }

            /* The state as it will be AFTER this write, used to decide whether
               the topic is now finished. Computed, never taken from the body. */
            const after = {
                ...courseState,
                topicComponents: {
                    ...(courseState.topicComponents || {}),
                    [topicId]: { ...before, [`${component}Completed`]: true }
                }
            };

            const finalized = finalizeCompletedTopics(after, topicId, canon.totalTopics);
            if (finalized) {
                update[`courses.${course}.completedTopics`] = finalized;
            }

            transaction.update(userRef, update);

            const components = componentsOf(after, topicId);
            const completedTopics = finalized || completedIds(courseState, canon.totalTopics);
            return {
                components,
                /* THE GATE IS THE EXERCISES, and isTopicComplete() is the only
                   place that decides it. The deck never appears here. */
                topicCompleted: isTopicComplete(after, topicId, totalTopics),
                completedTopics,
                changed: !alreadyThisOne
            };
        });

        sendJson(res, 200, {
            ok: true,
            course,
            topicId,
            component,
            /* The client renders THIS, not its own idea of progress. */
            components: result.components,
            topicCompleted: result.topicCompleted,
            completedTopics: result.completedTopics,
            nextTopic: result.topicCompleted && topicId < canon.totalTopics
                ? topicId + 1
                : null
        });
    } catch (error) {
        safeError(res, error);
    }
}
