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

async function firestoreSaveUserProgress(userId, course, progressData) {
    if (!userId) {
        return false;
    }
    try {
        await authReady();
        const userRef = doc(db, 'users', userId);
        if (Array.isArray(course)) {
            // Legacy signature: (userId, completedTopicsArray)
            await updateDoc(userRef, {
                completedTopics: course,
                lastActivity: serverTimestamp()
            });
        } else if (progressData && typeof progressData === 'object') {
            // Merge each field of the course progress INDEPENDENTLY using dotted
            // field paths. This is critical: the lesson page writes
            // { completedTopics } while the vocabulary page writes { vocabulary }.
            // Writing the whole `courses.<course>` map would let one writer wipe
            // the other's data — dotted paths merge them field-by-field instead.
            const updates = { lastActivity: serverTimestamp() };
            Object.keys(progressData).forEach((key) => {
                updates[`courses.${course}.${key}`] = progressData[key];
            });
            await updateDoc(userRef, updates);
        } else {
            await updateDoc(userRef, {
                [`courses.${course}`]: progressData,
                lastActivity: serverTimestamp()
            });
        }
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
        return true;
    } catch (error) {
        console.warn('progress-sync: saveQuizResult fallback', error?.message || error);
        return false;
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
window.saveUserProgress = firestoreSaveUserProgress;
window.saveQuizResult = firestoreSaveQuizResult;
window.getUserQuizResults = firestoreGetUserQuizResults;
window.firebaseReady = true;

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
