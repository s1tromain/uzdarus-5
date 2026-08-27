/**
 * topic-components.js — what it takes to finish a paid topic.
 *
 * A paid lesson has TWO halves, and a topic is finished only when both are:
 *
 *   vocabulary   the topic's deck, worked through
 *   exercises    every exercise group passed at its own threshold
 *
 * Before this existed, `completedTopics` was appended by whoever asked first,
 * so finishing the exercises alone unlocked the next topic and the vocabulary
 * could be skipped entirely (or the reverse). The component record is the
 * server's memory of which halves are done; `completedTopics` becomes a
 * CONCLUSION drawn from it rather than a claim the client makes.
 *
 * LEGACY IS NEVER REVOKED. Learners finished topics under the old one-step
 * rule, and their ids are already in `completedTopics` with no component
 * record at all. Those topics stay complete: `isTopicComplete()` answers yes
 * for anything already in the array, and nothing here ever removes an id.
 * Only topics NOT yet completed are held to the two-component rule.
 *
 * Shared by the complete-component and complete-topic endpoints so the two
 * cannot drift — which matters, because complete-topic is the older route and
 * must not remain a way around the rule.
 */

export const TOPIC_COMPONENTS = Object.freeze(['vocabulary', 'exercises']);

/** '' when valid, else why not. Keeps every endpoint's validation identical. */
export function normalizeComponent(value) {
    const c = String(value == null ? '' : value).trim().toLowerCase();
    return TOPIC_COMPONENTS.includes(c) ? c : '';
}

/** The stored component record for one topic, always a plain object. */
export function componentsOf(courseState, topicId) {
    const all = (courseState && courseState.topicComponents) || {};
    const rec = all[String(topicId)] || all[topicId] || {};
    return {
        vocabularyCompleted: rec.vocabularyCompleted === true,
        exercisesCompleted: rec.exercisesCompleted === true,
        vocabularyCompletedAt: rec.vocabularyCompletedAt || null,
        exercisesCompletedAt: rec.exercisesCompletedAt || null
    };
}

/** The server's list of finished topic ids, filtered to the canon. */
export function completedIds(courseState, totalTopics) {
    const raw = (courseState && Array.isArray(courseState.completedTopics))
        ? courseState.completedTopics : [];
    return raw
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= totalTopics);
}

/**
 * Are BOTH halves of this topic done?
 *
 * Note this asks about the components only. A legacy topic has no component
 * record and answers false here — which is correct, and why callers ask
 * isTopicComplete() instead when they mean "is this topic finished".
 */
export function bothComponentsComplete(courseState, topicId) {
    const c = componentsOf(courseState, topicId);
    return c.vocabularyCompleted && c.exercisesCompleted;
}

/**
 * Is this topic finished, by either route?
 *
 *   already in completedTopics     -> yes (LEGACY, never revoked)
 *   both components complete       -> yes (the new rule)
 */
export function isTopicComplete(courseState, topicId, totalTopics) {
    if (completedIds(courseState, totalTopics).includes(Number(topicId))) return true;
    return bothComponentsComplete(courseState, topicId);
}

/**
 * May topic `topicId` be worked on at all?
 *
 * The same sequential rule the platform already had: topic 1 needs nothing,
 * every other topic needs the one before it FINISHED — judged against the
 * server's record, by either route above.
 */
export function previousTopicSatisfied(courseState, topicId, totalTopics) {
    const id = Number(topicId);
    if (id <= 1) return true;
    return isTopicComplete(courseState, id - 1, totalTopics);
}

/**
 * The single place a topic id is allowed to enter `completedTopics`.
 *
 * Returns the array to store, or null when nothing should change. Monotonic
 * and idempotent: an id already present is never duplicated and never removed,
 * and a topic whose components are not both done is never added.
 */
export function finalizeCompletedTopics(courseState, topicId, totalTopics) {
    const id = Number(topicId);
    const current = completedIds(courseState, totalTopics);
    if (current.includes(id)) return null;                 /* already done */
    if (!bothComponentsComplete(courseState, id)) return null;  /* not yet earned */
    return Array.from(new Set([...current, id])).sort((a, b) => a - b);
}
