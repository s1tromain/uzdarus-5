/**
 * topic-components.js — what it takes to finish a paid topic.
 *
 * THE RULE, AND THE ONLY RULE:
 *
 *   a topic is finished  <=>  its EXERCISES are finished
 *
 * and the exercises are finished when the learner's authoritative score
 * reaches the 80% threshold. The vocabulary deck is a study aid. Its progress
 * is recorded, it is reported here like any other component, and it changes
 * NOTHING about whether the next topic opens.
 *
 * WHY THIS CHANGED. The previous rule required BOTH halves, and it stranded
 * learners in a way nothing in the client could repair. Two were reported on
 * the same day: one had finished a B2 topic three times over, and a brand-new
 * A1 account finished the exercises and the whole deck and still faced a
 * locked topic 2. Anything that leaves the vocabulary half unrecorded — a deck
 * finished before the component model shipped, a completion screen closed one
 * tap early, a single dropped network call — locked the learner out of the
 * rest of the course with no way back, because the only remedy on offer was to
 * walk a hundred words again and hope the call landed the second time. A
 * mandatory half that the learner cannot reliably report is not a gate, it is
 * a trap. The exercises are the assessment; they decide.
 *
 * LEGACY IS NEVER REVOKED. Ids already in `completedTopics` stay there, with
 * or without a component record, and nothing here ever removes one.
 *
 * `completedTopics` is still a CONCLUSION the server draws, never a claim the
 * client makes. Shared by the complete-component and complete-topic endpoints
 * so the two cannot drift.
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
 * REPORTING ONLY. This is what the client shows about the deck; it is not a
 * gate and no progression decision may be taken from it. `isTopicComplete()`
 * is the question that decides anything.
 */
export function bothComponentsComplete(courseState, topicId) {
    const c = componentsOf(courseState, topicId);
    return c.vocabularyCompleted && c.exercisesCompleted;
}

/**
 * Is the assessed half done? THE gate.
 *
 * The exercises component is written only after the client has passed every
 * required exercise group at the shared 80% threshold, so this is the stored
 * form of `exerciseScore >= 80`.
 */
export function exercisesComplete(courseState, topicId) {
    return componentsOf(courseState, topicId).exercisesCompleted === true;
}

/**
 * Is this topic finished?
 *
 *   already in completedTopics  -> yes (LEGACY, never revoked)
 *   the exercises are complete  -> yes
 *
 * The vocabulary deck is deliberately absent from this answer.
 */
export function isTopicComplete(courseState, topicId, totalTopics) {
    if (completedIds(courseState, totalTopics).includes(Number(topicId))) return true;
    return exercisesComplete(courseState, topicId);
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
 * and a topic whose exercises are not done is never added. Reporting the
 * vocabulary half alone adds nothing — it never did, and now it never blocks
 * anything either.
 */
export function finalizeCompletedTopics(courseState, topicId, totalTopics) {
    const id = Number(topicId);
    const current = completedIds(courseState, totalTopics);
    if (current.includes(id)) return null;                 /* already done */
    if (!exercisesComplete(courseState, id)) return null;  /* not yet earned */
    return Array.from(new Set([...current, id])).sort((a, b) => a - b);
}
