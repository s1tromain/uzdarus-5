/**
 * _cdp_platform_stub.cjs — the ONE boundary the mobile audit is allowed to fake.
 *
 * paid-platform.js asks Google who the learner is. In a test browser the
 * answer is "nobody", so enforceAccess() redirects to the login page and the
 * page we came to measure never renders. This module produces a replacement
 * with the same exported surface and no live auth, so the shipped page boots.
 *
 * WHAT STAYS REAL: the HTML, the CSS, the inline page script, the deck data,
 * the exercise engine, vocabulary-component.js, speech.js — every byte the
 * audit actually measures. Only the network/identity edge is substituted, and
 * the mobile suite prints that it was.
 *
 * The stub is deliberately DUMB about progression: it returns whatever course
 * state the scenario handed it and records every write. It must never decide
 * anything, because a stub that grants access is a stub that can hide the very
 * defect the security suites exist to catch — those questions are answered by
 * the server-authority suites against the real api/ code, not here.
 */
'use strict';

/**
 * @param {object} state  what the fake server knows: { progress, quizResults }
 * @returns {string} an ES module, byte-compatible with the page's import
 */
function platformStub(state) {
    const s = JSON.stringify(state || {});
    return `
/* CDP AUDIT STUB — not shipped, never written to disk in the repo */
const STATE = ${s};
window.__cdpWrites = [];
const record = (kind, payload) => { window.__cdpWrites.push({ kind, payload }); };

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

function progressFor(course) {
    const c = (STATE.progress || {})[String(course).toUpperCase()];
    return c ? clone(c) : null;
}

window.getUserProgress = async (userId, course) => progressFor(course);
window.getAuthoritativeCourseProgress = async (userId, course) => progressFor(course);

window.saveUserProgress = async (userId, course, data) => {
    record('saveUserProgress', { course, data });
    if (STATE.failSave) throw new Error('CDP: simulated save failure');
    return true;
};
window.saveQuizResult = async (userId, topicId, quizData, course) => {
    record('saveQuizResult', { topicId, course, score: quizData && quizData.score });
    if (STATE.failQuizSave) throw new Error('CDP: simulated quiz save failure');
    return true;
};
window.saveLessonResult = async (userId, topicId, snapshot, course) => {
    record('saveLessonResult', { topicId, course });
    return true;
};
window.saveLessonDraft = async (userId, topicId, draft, course) => {
    record('saveLessonDraft', { topicId, course });
    return true;
};
window.getUserQuizResults = async () => clone(STATE.quizResults || []);
window.getTopicQuizResult = async (userId, topicId) =>
    clone((STATE.quizResults || []).find((r) => Number(r.topicId) === Number(topicId)) || null);

/* The component call. Returns a well-formed ack unless the scenario asks for
   a failure — the two shapes the client must tell apart. */
window.completeCourseComponent = async (course, topicId, component) => {
    record('completeCourseComponent', { course, topicId, component });
    if (STATE.failComponent) throw new Error('CDP: simulated component failure');
    if (STATE.malformedAck) return { ok: true, course, topicId };
    const done = STATE.componentCompletesTopic === true;
    return {
        ok: true, course, topicId, component,
        components: { vocabularyCompleted: component === 'vocabulary',
                      exercisesCompleted: component === 'exercises',
                      vocabularyCompletedAt: null, exercisesCompletedAt: null },
        topicCompleted: done,
        completedTopics: clone(STATE.completedTopics || []),
        nextTopic: done ? Number(topicId) + 1 : null
    };
};
window.completeCourseTopic = async (course, topicId) => {
    record('completeCourseTopic', { course, topicId });
    return clone(STATE.completedTopics || []);
};
window.submitFinalExam = async (course, answers) => {
    record('submitFinalExam', { course, count: answers && answers.length });
    return clone(STATE.examResult || { ok: true, passed: false, score: 0 });
};
window.issueCertificate = async (course) => {
    record('issueCertificate', { course });
    return clone(STATE.certificate || { ok: false, reason: 'not-eligible' });
};

window.firebaseReady = true;
window.__cdpPlatformStub = true;
`;
}

module.exports = { platformStub };
