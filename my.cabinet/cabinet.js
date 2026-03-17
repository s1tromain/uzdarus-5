import {
    auth,
    db,
    doc,
    updateDoc,
    serverTimestamp,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    updatePassword,
    usernameToEmail,
    getUserProfile,
    isPrivilegedRole,
    hasActiveSubscription,
    canAccessPaid,
    saveLocalUser,
    clearLocalUser,
    getOrCreateDeviceId,
    sha256Hex,
    callApi
} from '../firebase-client.js';

const COURSE_TOTAL_TOPICS = Object.freeze({
    A1: 12,
    A2: 16,
    B1: 20,
    B2: 16
});

const COURSE_CONFIG = Object.freeze({
    A1: {
        title: 'A1 kursi',
        description: 'Boshlang‘ich daraja materiallari',
        href: '../paid-courses/a1-course.html'
    },
    A2: {
        title: 'A2 kursi',
        description: 'Asosiy daraja materiallari',
        href: '../paid-courses/a2-course.html'
    },
    B1: {
        title: 'B1 kursi',
        description: 'O‘rta daraja materiallari',
        href: '../paid-courses/b1-course.html'
    },
    B2: {
        title: 'B2 kursi',
        description: 'Yuqori-o‘rta daraja materiallari',
        href: '../paid-courses/b2-course.html'
    }
});

const PACKAGE_CONFIG = Object.freeze({
    A1A2: {
        title: 'Pack 1: A1-A2',
        description: 'A1 va A2 kurslarining progress holati',
        href: './a1-a2.html',
        courses: ['A1', 'A2']
    },
    B1B2: {
        title: 'Pack 2: B1-B2',
        description: 'B1 va B2 kurslarining progress holati',
        href: './b1-b2.html',
        courses: ['B1', 'B2']
    }
});

function showNotice(element, text, type = 'error') {
    if (!element) {
        return;
    }

    element.textContent = text;
    element.classList.remove('error', 'success');
    element.classList.add(type, 'show');
}

function clearNotice(element) {
    if (!element) {
        return;
    }

    element.textContent = '';
    element.classList.remove('show', 'error', 'success');
}

function resolveFirebaseAuthCode(error) {
    const directCode = typeof error?.code === 'string' ? error.code : '';
    if (directCode.startsWith('auth/')) {
        return directCode;
    }

    const message = String(error?.message || '');
    const match = message.match(/auth\/[a-z-]+/i);
    return match ? match[0].toLowerCase() : '';
}

function mapLoginErrorMessage(error) {
    const code = resolveFirebaseAuthCode(error);

    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        return 'Login yoki parol noto‘g‘ri';
    }

    if (code === 'auth/too-many-requests') {
        return 'Juda ko‘p urinish. Keyinroq qayta urinib ko‘ring';
    }

    if (code === 'auth/network-request-failed') {
        return 'Internet aloqasi mavjud emas';
    }

    if (error?.message === 'Profil topilmadi. Moderatsiyaga murojaat qiling.') {
        return error.message;
    }

    return 'Xatolik yuz berdi. Keyinroq qayta urinib ko‘ring';
}

function getRedirectTarget(defaultPath = './dashboard.html') {
    const params = new URLSearchParams(window.location.search);
    return params.get('redirect') || defaultPath;
}

async function registerCurrentDevice() {
    const deviceId = getOrCreateDeviceId();
    const deviceIdHash = await sha256Hex(deviceId);
    return callApi('/api/auth/register-device', 'POST', { deviceIdHash });
}

function formatDate(dateValue) {
    if (!dateValue) {
        return '-';
    }

    const date = typeof dateValue?.toDate === 'function' ? dateValue.toDate() : new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return date.toLocaleDateString('uz-UZ');
}

function normalizeRole(rawRole) {
    const role = String(rawRole || '').trim().toLowerCase();
    return role === 'user' ? 'customer' : role;
}

function getDaysLeft(dateValue) {
    const date = typeof dateValue?.toDate === 'function' ? dateValue.toDate() : new Date(dateValue);
    if (!dateValue || Number.isNaN(date.getTime())) {
        return null;
    }

    const diffMs = date.getTime() - Date.now();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getCompletedTopicsCount(courseProgress) {
    if (!courseProgress) {
        return 0;
    }

    if (Array.isArray(courseProgress)) {
        return new Set(courseProgress).size;
    }

    const directCompleted = courseProgress.completedTopics;
    if (Array.isArray(directCompleted)) {
        return new Set(directCompleted).size;
    }

    if (directCompleted && typeof directCompleted === 'object') {
        return Object.values(directCompleted).filter((item) => {
            if (typeof item === 'boolean') {
                return item;
            }

            if (item && typeof item === 'object') {
                return Boolean(item.completed);
            }

            return Boolean(item);
        }).length;
    }

    const objectProgress = courseProgress.userProgress;
    if (objectProgress && typeof objectProgress === 'object') {
        return Object.values(objectProgress).filter((item) => item?.completed).length;
    }

    return 0;
}

function getCourseProgress(profile, courseCode) {
    const totalTopics = COURSE_TOTAL_TOPICS[courseCode] || 0;
    const courseProgress = profile?.courses?.[courseCode] || null;
    const completedTopicsRaw = getCompletedTopicsCount(courseProgress);
    const completedTopics = Math.max(0, Math.min(totalTopics, completedTopicsRaw));
    const progressPercent = totalTopics > 0
        ? Math.round((completedTopics / totalTopics) * 100)
        : 0;

    return {
        completedTopics,
        totalTopics,
        progressPercent
    };
}

function buildProfileMeta(profile, role, privilegedRole) {
    if (privilegedRole) {
        return `@${profile.username || ''} • ${profile.role || 'customer'} • To‘liq ruxsat`;
    }

    if (role === 'moderator') {
        return `@${profile.username || ''} • moderator • Admin panel ruxsati`;
    }

    return `@${profile.username || ''} • ${profile.role || 'customer'} • ${profile.subscription?.tariff || 'Tarif yo‘q'} (${formatDate(profile.subscription?.endAt)} gacha)`;
}

function buildCountdownText(profile, role, privilegedRole) {
    if (privilegedRole) {
        return 'Muddatsiz';
    }

    if (role === 'moderator') {
        return 'Staff akkaunt: customer obuna hisobi qo‘llanmaydi';
    }

    const daysLeft = getDaysLeft(profile.subscription?.endAt);
    return daysLeft && daysLeft > 0
        ? `Qolgan: ${daysLeft} kun`
        : 'Muddati tugagan';
}

function applySubscriptionBadge(profile, role, privilegedRole, activeSubscription, badgeElement) {
    if (!badgeElement) {
        return;
    }

    if (profile.blocked && !privilegedRole) {
        badgeElement.textContent = 'Bloklangan';
        badgeElement.className = 'status-pill status-inactive';
        return;
    }

    if (privilegedRole) {
        badgeElement.textContent = 'To‘liq ruxsat';
        badgeElement.className = 'status-pill status-active';
        return;
    }

    if (role === 'moderator') {
        badgeElement.textContent = 'Staff';
        badgeElement.className = 'status-pill status-active';
        return;
    }

    if (activeSubscription) {
        badgeElement.textContent = 'Obuna faol';
        badgeElement.className = 'status-pill status-active';
        return;
    }

    badgeElement.textContent = 'Obuna faol emas';
    badgeElement.className = 'status-pill status-inactive';
}

function attachLogoutHandler(button) {
    if (!button) {
        return;
    }

    button.addEventListener('click', async () => {
        await signOut(auth);
        clearLocalUser();
        window.location.href = './index.html';
    });
}

function mapAccessReasonToDashboardStatus(reason) {
    if (reason === 'blocked') {
        return 'blocked';
    }

    if (reason === 'subscription') {
        return 'expired';
    }

    return 'no-access';
}

async function ensureAuthenticated({ requirePasswordReset = false } = {}) {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            unsubscribe();

            try {
                if (!user) {
                    window.location.href = './index.html';
                    return;
                }

                const profile = await getUserProfile(user.uid);
                if (!profile) {
                    await signOut(auth);
                    clearLocalUser();
                    window.location.href = './index.html';
                    return;
                }

                saveLocalUser(user, profile);

                if (requirePasswordReset && !profile.forcePasswordChange) {
                    window.location.href = './dashboard.html';
                    return;
                }

                if (!requirePasswordReset && profile.forcePasswordChange) {
                    window.location.href = './change-password.html';
                    return;
                }

                resolve({ user, profile });
            } catch (error) {
                reject(error);
            }
        }, reject);
    });
}

async function initLoginPage() {
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginBtn');

    if (!loginForm) {
        return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('logout') === '1') {
        await signOut(auth).catch(() => null);
        clearLocalUser();
        params.delete('logout');
        const query = params.toString();
        const cleanUrl = query ? `./index.html?${query}` : './index.html';
        window.history.replaceState({}, '', cleanUrl);
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        unsubscribe();

        if (!user) {
            return;
        }

        const profile = await getUserProfile(user.uid);
        if (!profile) {
            return;
        }

        saveLocalUser(user, profile);

        if (profile.forcePasswordChange) {
            window.location.href = './change-password.html';
            return;
        }

        const redirect = getRedirectTarget('./dashboard.html');
        window.location.href = redirect;
    });

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearNotice(loginError);

        const formData = new FormData(loginForm);
        const username = String(formData.get('username') || '').trim();
        const password = String(formData.get('password') || '');

        if (!username || !password) {
            showNotice(loginError, 'Login va parolni kiriting.');
            return;
        }

        loginBtn.disabled = true;
        loginBtn.textContent = 'Tekshirilmoqda...';

        try {
            const email = usernameToEmail(username);
            const credential = await signInWithEmailAndPassword(auth, email, password);
            const profile = await getUserProfile(credential.user.uid);

            if (!profile) {
                throw new Error('Profil topilmadi. Moderatsiyaga murojaat qiling.');
            }

            saveLocalUser(credential.user, profile);

            if (profile.forcePasswordChange) {
                window.location.href = './change-password.html';
                return;
            }

            const registerResult = await registerCurrentDevice();
            if (registerResult?.blocked) {
                window.location.href = './dashboard.html?status=blocked';
                return;
            }

            const redirect = getRedirectTarget('./dashboard.html');
            window.location.href = redirect;
        } catch (error) {
            showNotice(loginError, mapLoginErrorMessage(error));
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Kirish';
        }
    });
}

async function initChangePasswordPage() {
    const form = document.getElementById('changePasswordForm');
    const errorNotice = document.getElementById('changeError');
    const successNotice = document.getElementById('changeSuccess');
    const button = document.getElementById('changeBtn');

    if (!form) {
        return;
    }

    const { user, profile } = await ensureAuthenticated({ requirePasswordReset: true });

    if (!profile.forcePasswordChange) {
        window.location.href = './dashboard.html';
        return;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearNotice(errorNotice);
        clearNotice(successNotice);

        const formData = new FormData(form);
        const newPassword = String(formData.get('newPassword') || '');
        const confirmPassword = String(formData.get('confirmPassword') || '');

        if (newPassword.length < 8) {
            showNotice(errorNotice, 'Parol kamida 8 ta belgidan iborat bo‘lishi kerak.');
            return;
        }

        if (newPassword !== confirmPassword) {
            showNotice(errorNotice, 'Parollar bir xil emas.');
            return;
        }

        button.disabled = true;
        button.textContent = 'Saqlanmoqda...';

        try {
            await updatePassword(user, newPassword);
            await updateDoc(doc(db, 'users', user.uid), {
                forcePasswordChange: false,
                updatedAt: serverTimestamp(),
                lastPasswordChangeAt: serverTimestamp()
            });

            await registerCurrentDevice();
            showNotice(successNotice, 'Parol muvaffaqiyatli yangilandi.', 'success');
            setTimeout(() => {
                window.location.href = './dashboard.html';
            }, 700);
        } catch (error) {
            showNotice(errorNotice, error.message || 'Parolni yangilashda xatolik yuz berdi.');
        } finally {
            button.disabled = false;
            button.textContent = 'Parolni saqlash';
        }
    });
}

function createPackCard({ title, description, href, enabled }) {
    const card = document.createElement('article');
    card.className = 'pack-card';

    const titleElement = document.createElement('h3');
    titleElement.textContent = title;

    const descriptionElement = document.createElement('p');
    descriptionElement.textContent = description;

    card.appendChild(titleElement);
    card.appendChild(descriptionElement);

    if (enabled) {
        const link = document.createElement('a');
        link.className = 'btn';
        link.href = href;
        link.textContent = 'Paketni ochish';
        card.appendChild(link);
    } else {
        const button = document.createElement('button');
        button.className = 'btn btn-secondary';
        button.type = 'button';
        button.disabled = true;
        button.textContent = 'Ruxsat yo‘q';
        card.appendChild(button);
    }

    return card;
}

function createCourseCard({ courseCode, title, description, href, progress }) {
    const card = document.createElement('article');
    card.className = 'pack-card course-card';

    const titleElement = document.createElement('h3');
    titleElement.textContent = title;

    const descriptionElement = document.createElement('p');
    descriptionElement.textContent = description;

    const progressText = document.createElement('p');
    progressText.className = 'course-progress-text';
    progressText.textContent = `Progress: ${progress.progressPercent}% (${progress.completedTopics}/${progress.totalTopics})`;

    const progressTrack = document.createElement('div');
    progressTrack.className = 'course-progress-track';

    const progressFill = document.createElement('div');
    progressFill.className = 'course-progress-fill';
    progressFill.style.width = `${progress.progressPercent}%`;
    progressFill.setAttribute('aria-label', `${courseCode} progress ${progress.progressPercent}%`);

    progressTrack.appendChild(progressFill);

    const actionLink = document.createElement('a');
    actionLink.className = 'btn';
    actionLink.href = href;
    actionLink.textContent = 'Kursni ochish';

    card.appendChild(titleElement);
    card.appendChild(descriptionElement);
    card.appendChild(progressText);
    card.appendChild(progressTrack);
    card.appendChild(actionLink);

    return card;
}

async function initDashboardPage() {
    const profileName = document.getElementById('profileName');
    const profileMeta = document.getElementById('profileMeta');
    const subscriptionBadge = document.getElementById('subscriptionBadge');
    const subscriptionCountdown = document.getElementById('subscriptionCountdown');
    const dashboardError = document.getElementById('dashboardError');
    const dashboardInfo = document.getElementById('dashboardInfo');
    const blockBanner = document.getElementById('dashboardBlock');
    const packGrid = document.getElementById('packGrid');
    const logoutBtn = document.getElementById('logoutBtn');
    const adminPanelBtn = document.getElementById('adminPanelBtn');

    const { user, profile } = await ensureAuthenticated();
    const role = normalizeRole(profile.role);
    const canOpenAdminPanel = ['developer', 'admin', 'moderator'].includes(role);

    if (adminPanelBtn) {
        adminPanelBtn.style.display = canOpenAdminPanel ? 'inline-flex' : 'none';
    }

    attachLogoutHandler(logoutBtn);

    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const privilegedRole = isPrivilegedRole(profile);

    if (status === 'blocked' && !privilegedRole) {
        showNotice(dashboardError, 'Akkaunt vaqtincha bloklangan, moderatsiyaga murojaat qiling.');
    }

    if (status === 'expired' && !privilegedRole) {
        showNotice(dashboardError, 'Obuna muddati tugagan. Moderatsiyaga murojaat qiling.');
    }

    if (status === 'no-access' && !privilegedRole) {
        showNotice(dashboardError, 'Sizda bu kursga ruxsat yo‘q.');
    }

    const activeSubscription = hasActiveSubscription(profile);

    profileName.textContent = profile.displayName || profile.username || 'Foydalanuvchi';
    profileMeta.textContent = buildProfileMeta(profile, role, privilegedRole);

    if (subscriptionCountdown) {
        subscriptionCountdown.textContent = buildCountdownText(profile, role, privilegedRole);
    }

    applySubscriptionBadge(profile, role, privilegedRole, activeSubscription, subscriptionBadge);

    if (profile.blocked && !privilegedRole) {
        if (blockBanner) {
            blockBanner.style.display = 'block';
            blockBanner.textContent = 'Akkaunt vaqtincha bloklangan, moderatsiyaga murojaat qiling.';
        }
    } else if (privilegedRole) {
        if (blockBanner) {
            blockBanner.style.display = 'none';
            blockBanner.textContent = '';
        }
    }

    if (!profile.blocked || privilegedRole) {
        try {
            const registerResult = await registerCurrentDevice();
            if (registerResult?.blocked && !privilegedRole) {
                if (blockBanner) {
                    blockBanner.style.display = 'block';
                    blockBanner.textContent = 'Akkaunt vaqtincha bloklangan, moderatsiyaga murojaat qiling.';
                }
            }
        } catch (error) {
            showNotice(dashboardError, error.message || 'Qurilma tekshiruvida xatolik yuz berdi.');
        }
    }

    const cards = ['A1A2', 'B1B2']
        .map((packCode) => {
            const config = PACKAGE_CONFIG[packCode];
            if (!config) {
                return null;
            }

            return {
                title: config.title,
                description: config.description,
                href: config.href,
                enabled: canAccessPaid(profile, packCode).allowed
            };
        })
        .filter(Boolean);

    packGrid.innerHTML = '';
    cards.forEach((card) => packGrid.appendChild(createPackCard(card)));

    saveLocalUser(user, profile);

    showNotice(dashboardInfo, 'Kabinet muvaffaqiyatli yuklandi.', 'success');
}

async function initPackageOverviewPage() {
    const packageTitle = document.getElementById('packageTitle');
    const packageSubtitle = document.getElementById('packageSubtitle');
    const packageError = document.getElementById('packageError');
    const packageInfo = document.getElementById('packageInfo');
    const profileName = document.getElementById('profileName');
    const profileMeta = document.getElementById('profileMeta');
    const subscriptionBadge = document.getElementById('subscriptionBadge');
    const subscriptionCountdown = document.getElementById('subscriptionCountdown');
    const courseGrid = document.getElementById('courseGrid');
    const logoutBtn = document.getElementById('logoutBtn');

    const packCode = String(document.body.dataset.pack || '').toUpperCase();
    const packageConfig = PACKAGE_CONFIG[packCode];

    if (!packageConfig || !courseGrid) {
        throw new Error('Paket sahifasi noto‘g‘ri sozlangan.');
    }

    const authState = await ensureAuthenticated();
    const freshProfile = await getUserProfile(authState.user.uid, { forceRefresh: true });
    const user = authState.user;
    const profile = freshProfile || authState.profile;

    const role = normalizeRole(profile.role);
    const privilegedRole = isPrivilegedRole(profile);
    const activeSubscription = hasActiveSubscription(profile);
    const access = canAccessPaid(profile, packCode);

    if (!access.allowed) {
        const status = mapAccessReasonToDashboardStatus(access.reason);
        window.location.href = `./dashboard.html?status=${status}`;
        return;
    }

    if (packageTitle) {
        packageTitle.textContent = packageConfig.title;
    }

    if (packageSubtitle) {
        packageSubtitle.textContent = packageConfig.description;
    }

    if (profileName) {
        profileName.textContent = profile.displayName || profile.username || 'Foydalanuvchi';
    }

    if (profileMeta) {
        profileMeta.textContent = buildProfileMeta(profile, role, privilegedRole);
    }

    if (subscriptionCountdown) {
        subscriptionCountdown.textContent = buildCountdownText(profile, role, privilegedRole);
    }

    applySubscriptionBadge(profile, role, privilegedRole, activeSubscription, subscriptionBadge);
    attachLogoutHandler(logoutBtn);

    courseGrid.innerHTML = '';
    packageConfig.courses.forEach((courseCode) => {
        const courseConfig = COURSE_CONFIG[courseCode];
        if (!courseConfig) {
            return;
        }

        const progress = getCourseProgress(profile, courseCode);
        const card = createCourseCard({
            courseCode,
            title: courseConfig.title,
            description: courseConfig.description,
            href: courseConfig.href,
            progress
        });

        courseGrid.appendChild(card);
    });

    saveLocalUser(user, profile);
    clearNotice(packageError);
    showNotice(packageInfo, 'Kurslardan birini tanlab davom eting.', 'success');
}

const page = document.body.dataset.page;

if (page === 'login') {
    initLoginPage();
}

if (page === 'change-password') {
    initChangePasswordPage().catch((error) => {
        const notice = document.getElementById('changeError');
        showNotice(notice, error.message || 'Sahifani yuklashda xatolik.');
    });
}

if (page === 'dashboard') {
    initDashboardPage().catch((error) => {
        const notice = document.getElementById('dashboardError');
        showNotice(notice, error.message || 'Dashboard yuklanmadi.');
    });
}

if (page === 'package-overview') {
    initPackageOverviewPage().catch((error) => {
        const notice = document.getElementById('packageError');
        showNotice(notice, error.message || 'Paket sahifasini yuklashda xatolik.');
    });
}
