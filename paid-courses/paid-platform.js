import {
    auth,
    db,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    collection,
    getDocs,
    serverTimestamp,
    onAuthStateChanged,
    signOut,
    getUserProfile,
    saveLocalUser,
    clearLocalUser,
    getPackByPageName,
    isPrivilegedRole,
    canAccessPaid,
    getOrCreateDeviceId,
    sha256Hex,
    callApi
} from '../firebase-client.js';

const CABINET_LOGIN = '../my.cabinet/index.html';

/* ================================================================
   GLOBAL PROGRESS SYNC  (Phase 6)
   ----------------------------------------------------------------
   Wires real Firestore-backed progress / quiz persistence onto the
   window object so every course + vocabulary page that calls
   window.getUserProgress / window.saveUserProgress / window.saveQuizResult
   / window.getUserQuizResults writes to and reads from the user's
   Firestore document (collection "users", field `courses.<COURSE>`).

   This module is loaded (as a deferred module) on every paid course
   and vocabulary page AFTER the page's inline stub assignments, so the
   real implementations below win. Every function fails soft: on any
   error it falls back to (and keeps mirroring into) localStorage, which
   the course pages already use as a fallback. This guarantees the
   change can never break an existing flow — worst case it behaves
   exactly like the previous localStorage-only behaviour.
   ================================================================ */

const PROGRESS_READ_TIMEOUT_MS = 6000;
const AUTH_READY_TIMEOUT_MS = 4000;

function withTimeout(promise, ms, fallbackValue) {
    return Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve(fallbackValue), ms))
    ]);
}

/* Resolve once Firebase Auth has restored a signed-in user (or after a
   short timeout). Firestore reads on the user document require the auth
   token; without this a fresh page load may race ahead of auth restore
   and read unauthenticated (permission denied -> localStorage fallback). */
function authReady() {
    if (auth.currentUser) {
        return Promise.resolve(auth.currentUser);
    }
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                try { unsubscribe(); } catch (e) { /* ignore */ }
                finish(user);
            }
        });
        setTimeout(() => {
            try { unsubscribe(); } catch (e) { /* ignore */ }
            finish(auth.currentUser);
        }, AUTH_READY_TIMEOUT_MS);
    });
}

async function firestoreGetUserProgress(userId, course) {
    if (!userId) {
        return course ? null : [];
    }
    try {
        await authReady();
        const snap = await withTimeout(getDoc(doc(db, 'users', userId)), PROGRESS_READ_TIMEOUT_MS, null);
        if (!snap || !snap.exists()) {
            return course ? null : [];
        }
        const data = snap.data() || {};
        if (course) {
            return (data.courses && data.courses[course]) || null;
        }
        return Array.isArray(data.completedTopics) ? data.completedTopics : [];
    } catch (error) {
        console.warn('progress-sync: getUserProgress fallback', error?.message || error);
        return course ? null : [];
    }
}

/* Emit a learning-analytics event (fails soft; tracker self-disables on
   demo/guest and buffers/batches to /api/analytics). */
function trackEvent(type, data) {
    try { if (window.uzTrack) window.uzTrack(type, data); } catch (e) { /* never break saves */ }
}
const _lastTopicPass = {}; // course -> highest completed topic already announced

/* ------------------------------------------------------------------ *
 * WHO MAY WRITE WHAT
 * ------------------------------------------------------------------
 * Everything in the platform that records course progress funnels through
 * window.saveUserProgress, so the trust split is enforced here, once.
 *
 * AUTHORITATIVE — the fields that decide what a learner has achieved. They are
 * written ONLY by /api/progress, from a verified session, and Firestore rules
 * refuse them from the owner. Before this split a customer could open DevTools
 * and set courses.B1.finalExamPassed = true, then collect a real certificate.
 *
 * SAFE — vocabulary position and a display timestamp. Nothing gates on them, so
 * they keep going straight to Firestore: routing a card flip through an API
 * call would add a request per swipe for no security gain.
 * ------------------------------------------------------------------ */
const AUTHORITATIVE_PROGRESS_FIELDS = Object.freeze([
    'completedTopics',
    'finalExamPassed',
    'finalExamScore',
    'finalExamCompletedAt',
    'courseCompleted',
    'certificateUnlocked',
    'certificateNumber'
]);

function isAuthoritativeProgressKey(key) {
    const head = String(key || '').split('.')[0];
    return AUTHORITATIVE_PROGRESS_FIELDS.indexOf(head) !== -1;
}

/**
 * Record that the learner finished a topic. Returns the SERVER's progress
 * array, or null when the server refused — the caller must not treat a null
 * as success.
 */
async function completeCourseTopic(course, topicId) {
    const result = await callApi('/api/progress?action=complete-topic', 'POST',
        { course: course, topicId: topicId });
    if (!result || !Array.isArray(result.completedTopics)) {
        return null;
    }

    /* Timeline: announce a newly reached highest topic ONCE, driven by the
       SERVER's array rather than by what the client believed. The event is
       analytics only — it proves nothing and nothing gates on it. */
    const highest = result.completedTopics.filter(function (n) { return Number.isFinite(n); });
    const max = highest.length ? Math.max.apply(null, highest) : 0;
    if (max > (_lastTopicPass[course] || 0)) {
        _lastTopicPass[course] = max;
        trackEvent('topic_pass', { course: course, topic: max });
    }

    return result.completedTopics;
}
window.completeCourseTopic = completeCourseTopic;

/**
 * Submit a final exam for SERVER grading. The answers go up; the score and the
 * verdict come back. Nothing about the outcome is sent from here — see
 * api/_progress/final-exam.js.
 */
async function submitFinalExam(course, answers) {
    return callApi('/api/progress?action=final-exam', 'POST',
        { course: course, answers: answers });
}
window.submitFinalExam = submitFinalExam;

async function firestoreSaveUserProgress(userId, course, progressData) {
    if (!userId) {
        return false;
    }

    /* The legacy array signature wrote the ROOT completedTopics field. That
       field is authoritative and the rules now refuse it, so rather than let
       the write fail somewhere out of sight, it is refused here with a reason. */
    if (Array.isArray(course)) {
        console.error('saveUserProgress: completedTopics must go through ' +
            'completeCourseTopic() — the legacy array form is no longer accepted.');
        return false;
    }

    if (!progressData || typeof progressData !== 'object') {
        return false;
    }

    /* A caller that still hands us an authoritative field gets a loud refusal
       rather than a silent Firestore permission-denied further down. */
    const offending = Object.keys(progressData).filter(isAuthoritativeProgressKey);
    if (offending.length) {
        console.error('saveUserProgress: refusing to write authoritative field(s) [' +
            offending.join(', ') + '] — use completeCourseTopic() / submitFinalExam().');
        return false;
    }

    try {
        await authReady();
        const userRef = doc(db, 'users', userId);
        /* Merge each field INDEPENDENTLY using dotted field paths: the lesson
           page and the vocabulary page write different keys of the same course
           map, and writing the whole map would let one wipe the other. */
        const updates = { lastActivity: serverTimestamp() };
        Object.keys(progressData).forEach((key) => {
            updates[`courses.${course}.${key}`] = progressData[key];
        });
        await updateDoc(userRef, updates);
        return true;
    } catch (error) {
        console.warn('progress-sync: saveUserProgress fallback', error?.message || error);
        return false;
    }
}

async function firestoreSaveQuizResult(userId, topicId, quizData, course = '') {
    if (!userId) {
        return false;
    }
    try {
        await authReady();
        const resultRef = doc(db, 'users', userId, 'quizResults', `topic_${topicId}`);
        await setDoc(resultRef, {
            ...quizData,
            course,
            updatedAt: serverTimestamp()
        }, { merge: true });
        // Timeline: exercise / exam completion (answers themselves are reused
        // from this very quizResults doc — no duplication).
        const idStr = String(topicId);
        const topicNum = parseInt(idStr, 10);
        const scoreNum = Number(quizData && quizData.score);
        const totalNum = Number(quizData && quizData.total);
        const pct = (Number.isFinite(scoreNum) && Number.isFinite(totalNum) && totalNum > 0)
            ? Math.round((scoreNum / totalNum) * 100) : null;
        if (/final|exam/i.test(idStr)) {
            trackEvent(pct != null && pct >= 60 ? 'exam_pass' : 'exam_fail',
                { course, level: course, topic: Number.isFinite(topicNum) ? topicNum : undefined, score: pct });
        } else {
            trackEvent('ex_done', {
                course,
                topic: Number.isFinite(topicNum) ? topicNum : undefined,
                score: Number.isFinite(scoreNum) ? scoreNum : undefined,
                total: Number.isFinite(totalNum) ? totalNum : undefined,
            });
        }
        return true;
    } catch (error) {
        console.warn('progress-sync: saveQuizResult fallback', error?.message || error);
        return false;
    }
}

/* Persist ONE completed-lesson snapshot into the EXISTING per-topic document
   users/{uid}/quizResults/topic_{topicId}, under the reserved `lessonResult`
   field. Deliberately separate from saveQuizResult(): that function also emits
   an `ex_done` / `exam_*` analytics event, and this write is a UI-restoration
   snapshot of an attempt that has ALREADY been tracked by the course page —
   emitting again would double-count exercises on the admin timeline.
   `merge: true` keeps every sibling field (native mc/blank answers, draft,
   course tag) intact. */
async function firestoreSaveLessonResult(userId, topicId, snapshot, course = '') {
    if (!userId || topicId === null || topicId === undefined) {
        return false;
    }
    if (!snapshot || typeof snapshot !== 'object') {
        return false;
    }
    try {
        await authReady();
        const resultRef = doc(db, 'users', userId, 'quizResults', `topic_${topicId}`);
        await setDoc(resultRef, {
            lessonResult: snapshot,
            course,
            updatedAt: serverTimestamp()
        }, { merge: true });
        return true;
    } catch (error) {
        console.warn('progress-sync: saveLessonResult failed', error?.message || error);
        return false;
    }
}

/* Persist (or clear, with `draft === null`) the in-progress draft for ONE
   topic. Same reasoning as saveLessonResult: kept separate from
   saveQuizResult() so an autosave never emits an `ex_done` analytics event —
   a draft is unfinished work, not a completed exercise. */
async function firestoreSaveLessonDraft(userId, topicId, draft, course = '') {
    if (!userId || topicId === null || topicId === undefined) {
        return false;
    }
    try {
        await authReady();
        const resultRef = doc(db, 'users', userId, 'quizResults', `topic_${topicId}`);
        await setDoc(resultRef, {
            lessonDraft: draft || null,
            course,
            updatedAt: serverTimestamp()
        }, { merge: true });
        return true;
    } catch (error) {
        console.warn('progress-sync: saveLessonDraft failed', error?.message || error);
        return false;
    }
}

/* Single-document read of ONE topic's quiz/result record. Used by
   course-global-fixes.js to restore a previously completed lesson without
   pulling the learner's whole quizResults collection on every topic open.
   Mirrors firebase-utils.getTopicQuizResult; fails soft (null) so the page
   simply behaves as if no saved result existed. */
async function firestoreGetTopicQuizResult(userId, topicId) {
    if (!userId || topicId === null || topicId === undefined) {
        return null;
    }
    try {
        await authReady();
        const resultRef = doc(db, 'users', userId, 'quizResults', `topic_${topicId}`);
        const snap = await withTimeout(getDoc(resultRef), PROGRESS_READ_TIMEOUT_MS, null);
        if (!snap || !snap.exists()) {
            return null;
        }
        return snap.data() || null;
    } catch (error) {
        console.warn('progress-sync: getTopicQuizResult fallback', error?.message || error);
        return null;
    }
}

async function firestoreGetUserQuizResults(userId, course) {
    if (!userId) {
        return {};
    }
    try {
        await authReady();
        const resultsRef = collection(db, 'users', userId, 'quizResults');
        const snapshot = await withTimeout(getDocs(resultsRef), PROGRESS_READ_TIMEOUT_MS, null);
        if (!snapshot) {
            return {};
        }
        const results = {};
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (!course || data.course === course) {
                results[docSnap.id] = data;
            }
        });
        return results;
    } catch (error) {
        console.warn('progress-sync: getUserQuizResults fallback', error?.message || error);
        return {};
    }
}

// Expose at module load (deferred) so it overrides the inline page stubs.
window.getUserProgress = firestoreGetUserProgress;

/**
 * AUTHORITATIVE course progress, for AUTHORIZATION decisions only.
 *
 * firestoreGetUserProgress() answers "what should I render?" and deliberately
 * fails soft: a timeout, an offline device or a permission error all return the
 * same null a learner with no progress gets. That is right for rendering and
 * wrong for deciding whether to open a final exam, because those two cases must
 * not be treated alike — one means "you have not finished the course", the
 * other means "we do not know yet".
 *
 * This reads the SAME user document — it is not a second progress store — and
 * refuses to guess: it THROWS when the read did not succeed, so the caller can
 * fail closed and tell the learner which situation they are in.
 */
async function getAuthoritativeCourseProgress(userId, course) {
    if (!userId || !course) {
        throw new Error('authoritative progress: missing user or course');
    }
    await authReady();
    const MISSED = Symbol('timeout');
    const snap = await withTimeout(
        getDoc(doc(db, 'users', userId)), PROGRESS_READ_TIMEOUT_MS, MISSED);
    if (snap === MISSED) {
        throw new Error('authoritative progress: read timed out');
    }
    const data = (snap && snap.exists() ? snap.data() : null) || {};
    const state = (data.courses && data.courses[course]) || {};
    const ids = Array.isArray(state.completedTopics) ? state.completedTopics : [];
    return {
        /* A successful read of a learner with nothing done is `[]` — a real
           answer, not an error. The caller can trust this shape. */
        completedTopics: ids.filter((n) => Number.isInteger(n) && n > 0),
        userExists: !!(snap && snap.exists())
    };
}
window.getAuthoritativeCourseProgress = getAuthoritativeCourseProgress;
window.saveUserProgress = firestoreSaveUserProgress;
window.saveQuizResult = firestoreSaveQuizResult;
window.getUserQuizResults = firestoreGetUserQuizResults;
window.getTopicQuizResult = firestoreGetTopicQuizResult;
window.saveLessonResult = firestoreSaveLessonResult;
window.saveLessonDraft = firestoreSaveLessonDraft;
window.firebaseReady = true;

/* ================================================================
   CERTIFICATE ISSUANCE (server-side, idempotent)
   ----------------------------------------------------------------
   Course pages call window.issueCertificate('A1' | 'B1') once the
   certificate is legitimately unlocked. Issuance is performed by the
   Admin SDK on the server (atomic unique number); calling it on every
   load is safe — the server returns the already-issued record.
   Fails soft: returns null on any error so the page never breaks.
   ================================================================ */
async function issueUserCertificate(course) {
    if (!course) {
        return null;
    }
    try {
        await authReady();
        const result = await callApi('/api/certificate?action=issue', 'POST', { course });
        return (result && result.certificate) ? result.certificate : null;
    } catch (error) {
        console.warn('certificate: issue fallback', error?.message || error);
        return null;
    }
}

window.issueCertificate = issueUserCertificate;

function showOverlayMessage(text) {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.inset = '0';
    wrapper.style.background = 'rgba(10, 15, 35, 0.88)';
    wrapper.style.backdropFilter = 'blur(2px)';
    wrapper.style.zIndex = '99999';
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.justifyContent = 'center';

    const card = document.createElement('div');
    card.style.maxWidth = '520px';
    card.style.width = '92%';
    card.style.background = '#101832';
    card.style.border = '1px solid rgba(130, 160, 255, 0.25)';
    card.style.borderRadius = '16px';
    card.style.padding = '22px';
    card.style.color = '#ffffff';
    card.style.textAlign = 'center';
    card.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';

    card.innerHTML = `
        <h3 style="margin:0 0 10px; font-size: 1.2rem;">Kirish cheklangan</h3>
        <p style="margin:0; line-height:1.45; opacity:0.92;">${text}</p>
    `;

    wrapper.appendChild(card);
    document.body.appendChild(wrapper);
}

async function registerDevice() {
    const deviceId = getOrCreateDeviceId();
    const deviceIdHash = await sha256Hex(deviceId);
    return callApi('/api/auth/register-device', 'POST', { deviceIdHash });
}

function redirectToLoginWithReturn() {
    const current = `${window.location.pathname}${window.location.search}`;
    const redirect = encodeURIComponent(current);
    window.location.href = `${CABINET_LOGIN}?redirect=${redirect}`;
}

function redirectToDashboard(status) {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    window.location.href = `../my.cabinet/dashboard.html${query}`;
}

async function enforceAccess() {
    const requiredPack = getPackByPageName(window.location.pathname);

    if (!requiredPack) {
        return;
    }

    await new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            unsubscribe();

            if (!user) {
                redirectToLoginWithReturn();
                return;
            }

            const profile = await getUserProfile(user.uid);
            if (!profile) {
                await signOut(auth);
                clearLocalUser();
                redirectToLoginWithReturn();
                return;
            }

            saveLocalUser(user, profile);
            const privilegedRole = isPrivilegedRole(profile);

            if (profile.forcePasswordChange) {
                window.location.href = '../my.cabinet/change-password.html';
                return;
            }

            const access = canAccessPaid(profile, requiredPack);
            if (!access.allowed) {
                if (access.reason === 'blocked') {
                    showOverlayMessage('Akkaunt vaqtincha bloklangan. Moderatsiyaga murojaat qiling.');
                    redirectToDashboard('blocked');
                    return;
                }

                /* FROZEN IS NOT EXPIRED. The learner still owns every paid
                   day; they are simply paused. Telling them their subscription
                   ended would be false and would send them to buy time they
                   already have — so the frozen case is answered before the
                   subscription case and with its own message. */
                if (access.reason === 'frozen') {
                    showOverlayMessage('Akkaunt vaqtincha muzlatilgan. Obuna muddati saqlanib qolmoqda.');
                    redirectToDashboard('frozen');
                    return;
                }

                if (access.reason === 'subscription') {
                    showOverlayMessage('Obuna muddati tugagan yoki faol emas. Moderatsiyaga murojaat qiling.');
                    redirectToDashboard('expired');
                    return;
                }

                if (access.reason === 'pack') {
                    showOverlayMessage('Ushbu bo‘lim sizning pack huquqingizga kirmaydi.');
                    redirectToDashboard('no-access');
                    return;
                }

                showOverlayMessage('Kirish amalga oshmadi. Qayta urinib ko‘ring.');
                redirectToDashboard('no-access');
                return;
            }

            try {
                const deviceResult = await registerDevice();
                if (deviceResult?.blocked && !privilegedRole) {
                    showOverlayMessage('Qurilmalar limiti oshgan. Akkaunt bloklandi, moderatsiyaga murojaat qiling.');
                    redirectToDashboard('blocked');
                    return;
                }
            } catch (error) {
                showOverlayMessage(error.message || 'Qurilma tekshiruvi amalga oshmadi. Qayta urinib ko‘ring.');
                return;
            }

            resolve();
        });
    });
}

enforceAccess();
