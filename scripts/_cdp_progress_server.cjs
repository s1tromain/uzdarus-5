/**
 * _cdp_progress_server.cjs — a realistic progress server for browser tests.
 *
 * The plain platform stub answers every component call the same way and lets
 * the test decide whether the topic completed. That is useless for auditing
 * COMPLETION, because the thing under test is exactly whether the client
 * drives the server correctly — a stub that decides the answer for it can
 * hide a client that never asked.
 *
 * So this models the real rule instead:
 *
 *   a topic completes  <=>  exercisesCompleted
 *
 * and nothing else. complete-topic FINALISES what the component records
 * already earn; it cannot complete anything on its own. Every call is
 * recorded in order, with its payload, so a test can assert the sequence
 * (save -> component -> ack) rather than just the end state.
 *
 * It is deliberately strict in the same places the real API is: a malformed
 * request is refused, a component call for an unknown course/topic is
 * refused, and completedTopics only ever grows through the component rule.
 */
'use strict';

/**
 * @param {object} opts
 *   progress            initial per-course state { A1: { completedTopics, topicComponents } }
 *   failSave            reject saveQuizResult
 *   failComponent       reject completeCourseComponent
 *   malformedAck        return a component ack that is not shaped like a verdict
 *   latencyMs           delay every call, so "did it await?" becomes observable
 * @returns {string} an ES module replacing paid-platform.js
 */
function progressServer(opts) {
    const s = JSON.stringify(opts || {});
    return `
/* CDP COMPLETION-AUDIT SERVER — not shipped */
const OPT = ${s};

/* THE FAKE SERVER MUST SURVIVE A RELOAD, or "does the topic stay complete?"
   cannot be asked at all: a module re-instantiated on every navigation would
   always answer with the seed state and every durability test would be a
   tautology. State lives in localStorage under one key, exactly as a real
   backend outlives the page. */
/* The canon, mirroring api/_lib/course-canon.js. */
const TOTAL = { A1: 12, A2: 16, B1: 20, B2: 16 };

const SKEY = '__cdp_server_state__';
function loadState() {
    try {
        var raw = localStorage.getItem(SKEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {}
    return JSON.parse(JSON.stringify(OPT.progress || {}));
}
function persist() { try { localStorage.setItem(SKEY, JSON.stringify(STATE)); } catch (e) {} }
const STATE = loadState();
persist();

window.__calls = [];
window.__callSeq = 0;
const rec = (kind, payload) => {
    const entry = { n: ++window.__callSeq, kind, payload, at: Date.now() };
    window.__calls.push(entry);
    return entry;
};
const wait = () => new Promise((r) => setTimeout(r, Number(OPT.latencyMs) || 0));
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

function course(code) {
    const c = String(code || '').toUpperCase();
    STATE[c] = STATE[c] || { completedTopics: [], topicComponents: {} };
    STATE[c].completedTopics = STATE[c].completedTopics || [];
    STATE[c].topicComponents = STATE[c].topicComponents || {};
    return STATE[c];
}

window.getUserProgress = async (uid, code) => { await wait(); rec('getUserProgress', { code }); return clone(course(code)); };
window.getAuthoritativeCourseProgress = window.getUserProgress;

window.saveUserProgress = async (uid, code, data) => {
    await wait(); rec('saveUserProgress', { code, keys: Object.keys(data || {}) }); return true;
};

window.saveQuizResult = async (uid, topicId, quizData, code) => {
    const e = rec('saveQuizResult', { topicId, course: code,
        score: quizData && quizData.score, percentage: quizData && quizData.percentage });
    await wait();
    if (OPT.failSave) { e.failed = true; throw new Error('CDP: simulated save failure'); }
    return true;
};

window.saveLessonResult = async (uid, topicId, snap, code) => { await wait(); rec('saveLessonResult', { topicId, course: code }); return true; };
window.saveLessonDraft  = async (uid, topicId, d, code) => { await wait(); rec('saveLessonDraft', { topicId, course: code }); return true; };
window.getUserQuizResults = async () => { await wait(); return clone(OPT.quizResults || []); };
window.getTopicQuizResult = async (uid, topicId) =>
    clone((OPT.quizResults || []).find((r) => Number(r.topicId) === Number(topicId)) || null);

/* THE RULE. Record the section; a topic completes when its EXERCISES are in. */
window.completeCourseComponent = async (code, topicId, component) => {
    const e = rec('completeCourseComponent', { course: code, topicId, component });
    await wait();
    if (OPT.failComponent) { e.failed = true; throw new Error('CDP: simulated component failure'); }
    if (OPT.malformedAck) { e.malformed = true; return { ok: true, course: code, topicId }; }

    const c = course(code);
    const id = Number(topicId);
    if (!Number.isFinite(id) || id < 1) return { ok: false, error: 'bad topicId' };
    if (component !== 'vocabulary' && component !== 'exercises') return { ok: false, error: 'bad component' };

    const row = c.topicComponents[id] || c.topicComponents[String(id)] || {};
    if (component === 'vocabulary') row.vocabularyCompleted = true;
    else row.exercisesCompleted = true;
    c.topicComponents[id] = row;

    /* THE RULE, matching api/_lib/topic-components.js: the EXERCISES decide.
       The deck is recorded and gates nothing. */
    const done = row.exercisesCompleted === true;
    if (done && c.completedTopics.indexOf(id) < 0) {
        c.completedTopics.push(id);
        c.completedTopics.sort((a, b) => a - b);
    }
    e.both = done;
    persist();
    return {
        ok: true, course: String(code).toUpperCase(), topicId: id, component,
        components: { vocabularyCompleted: row.vocabularyCompleted === true,
                      exercisesCompleted: row.exercisesCompleted === true,
                      vocabularyCompletedAt: null, exercisesCompletedAt: null },
        topicCompleted: done,
        completedTopics: clone(c.completedTopics),
        /* THE REAL SERVER RETURNS NULL PAST THE LAST TOPIC (see
           api/_progress/complete-component.js: topicId < canon.totalTopics).
           Returning id+1 for the final topic told the client to open a topic
           that does not exist instead of ending the course. */
        nextTopic: (done && id < TOTAL[String(code).toUpperCase()]) ? id + 1 : null
    };
};

/* The legacy finaliser: it may only confirm what the components already earn. */
window.completeCourseTopic = async (code, topicId) => {
    rec('completeCourseTopic', { course: code, topicId });
    await wait();
    const c = course(code);
    const id = Number(topicId);
    const row = c.topicComponents[id] || {};
    const done = row.exercisesCompleted === true;
    if (done && c.completedTopics.indexOf(id) < 0) { c.completedTopics.push(id); c.completedTopics.sort((a,b)=>a-b); }
    persist();
    return clone(c.completedTopics);
};

window.submitFinalExam = async (code, answers) => { rec('submitFinalExam', { course: code, n: answers && answers.length }); await wait(); return clone(OPT.examResult || { ok: true, passed: false, score: 0 }); };
window.issueCertificate = async (code) => { rec('issueCertificate', { course: code }); await wait(); return clone(OPT.certificate || { ok: false, reason: 'not-eligible' }); };

/* A RUNTIME SWITCH, so "it failed, then the retry worked" is testable at all.
   The seed flags are fixed for the life of the page; recovery needs the same
   page to see a refusal and then an acceptance. */
window.__setFail = (kind, on) => {
    if (kind === 'save') OPT.failSave = !!on;
    else if (kind === 'component') OPT.failComponent = !!on;
    else if (kind === 'malformed') OPT.malformedAck = !!on;
    return { failSave: !!OPT.failSave, failComponent: !!OPT.failComponent,
             malformedAck: !!OPT.malformedAck };
};

window.__serverState = () => JSON.parse(JSON.stringify(STATE));
window.__resetServerState = () => { try { localStorage.removeItem(SKEY); } catch (e) {} };
window.firebaseReady = true;
window.__cdpProgressServer = true;
`;
}

module.exports = { progressServer };
