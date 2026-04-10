import {
    auth,
    signInWithEmailAndPassword,
    signOut,
    usernameToEmail,
    getUserProfile,
    saveLocalUser,
    clearLocalUser,
    callApi
} from './firebase-client.js';

const state = {
    user: null,
    profile: null,
    role: 'customer',
    users: [],
    customerSearch: ''
};

const ADMIN_ROLES = new Set(['developer', 'admin', 'moderator']);
const SUBSCRIPTION_EDIT_ROLES = new Set(['developer', 'admin']);
const VALID_USER_ROLES = new Set(['customer', 'moderator', 'admin', 'developer']);

function isSupportedRoleInput(value) {
    const raw = String(value || '').trim().toLowerCase();
    return raw === 'user' || VALID_USER_ROLES.has(raw);
}

const globalError = document.getElementById('globalError');
const globalSuccess = document.getElementById('globalSuccess');
const adminMeta = document.getElementById('adminMeta');
const customersBody = document.getElementById('customersBody');
const staffBody = document.getElementById('staffBody');
const usersSearchInput = document.getElementById('usersSearchInput');
const customersMeta = document.getElementById('customersMeta');
const staffMeta = document.getElementById('staffMeta');
const tabsNav = document.getElementById('tabsNav');
const staffRoleSelect = document.getElementById('staffRoleSelect');
const createStaffCard = document.getElementById('createStaffCard');
const statTotalUsers = document.getElementById('statTotalUsers');
const statActiveSubs = document.getElementById('statActiveSubs');
const statBlocked = document.getElementById('statBlocked');
const statDevices = document.getElementById('statDevices');

const adminGate = document.getElementById('adminGate');
const adminApp = document.getElementById('adminApp');
const gateInfo = document.getElementById('gateInfo');
const gateError = document.getElementById('gateError');
const adminLoginForm = document.getElementById('adminLoginForm');
const adminLoginBtn = document.getElementById('adminLoginBtn');

function normalizeRole(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'user') {
        return 'customer';
    }

    return VALID_USER_ROLES.has(raw) ? raw : 'customer';
}

function sanitizeRecord(user) {
    if (!user || typeof user !== 'object') {
        return null;
    }

    const uid = String(user.uid || user.docId || '').trim();
    const username = String(user.username || user.login || '').trim().toLowerCase();

    if (!isSupportedRoleInput(user.role)) {
        return null;
    }

    const role = normalizeRole(user.role);

    if (!uid || !username || username === '-' || !VALID_USER_ROLES.has(role)) {
        return null;
    }

    return {
        ...user,
        uid,
        username,
        role,
        displayName: String(user.displayName || '').trim() || username,
        accessPacks: Array.isArray(user.accessPacks) ? user.accessPacks : [],
        blocked: Boolean(user.blocked),
        deviceCount: Number(user.deviceCount || 0),
        subscription: user.subscription && typeof user.subscription === 'object' ? user.subscription : {}
    };
}

function showNotice(element, text, type = 'error') {
    if (!element) {
        return;
    }

    element.textContent = text;
    element.classList.remove('error', 'success');
    element.classList.add('show', type);
}

function clearNotice(element) {
    if (!element) {
        return;
    }

    element.textContent = '';
    element.classList.remove('show', 'error', 'success');
}

function showError(text) {
    clearNotice(globalSuccess);
    showNotice(globalError, text, 'error');
}

function showSuccess(text) {
    clearNotice(globalError);
    showNotice(globalSuccess, text, 'success');
}

function showGateError(text) {
    showNotice(gateError, text, 'error');
}

function setGateInfo(text) {
    if (gateInfo) {
        gateInfo.textContent = text;
    }
}

function formatDate(rawDate) {
    if (!rawDate) {
        return '-';
    }

    const date = typeof rawDate?.toDate === 'function' ? rawDate.toDate() : new Date(rawDate);
    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return date.toLocaleDateString('uz-UZ');
}

function formatDateIso(rawDate) {
    if (!rawDate) {
        return '-';
    }

    const date = typeof rawDate?.toDate === 'function' ? rawDate.toDate() : new Date(rawDate);
    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return date.toISOString().slice(0, 10);
}

function getRemainingDays(rawDate) {
    const endDate = typeof rawDate?.toDate === 'function' ? rawDate.toDate() : new Date(rawDate);
    if (!rawDate || Number.isNaN(endDate.getTime())) {
        return null;
    }

    const ms = endDate.getTime() - Date.now();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function roleAllowed(role) {
    return ADMIN_ROLES.has(normalizeRole(role));
}

function collectPacks(form) {
    const values = [];
    form.querySelectorAll('input[name="packs"]:checked').forEach((node) => values.push(node.value));
    return values;
}

function canEditSubscription() {
    return SUBSCRIPTION_EDIT_ROLES.has(state.role);
}

function mapAdminLoginError(error) {
    const code = String(error?.code || '').toLowerCase();

    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        return 'Login yoki parol noto‘g‘ri';
    }

    if (code === 'auth/too-many-requests') {
        return 'Juda ko‘p urinish bo‘ldi. Keyinroq qayta urinib ko‘ring';
    }

    if (code === 'auth/network-request-failed') {
        return 'Internet aloqasi mavjud emas';
    }

    return 'Kirish amalga oshmadi. Qayta urinib ko‘ring';
}

function mapApiError(error, fallback = 'Amalni bajarishda xatolik yuz berdi') {
    const raw = String(error?.message || '').toLowerCase();

    if (!raw) {
        return fallback;
    }

    if (raw.includes('authorization token required') || raw.includes('invalid token')) {
        return 'Qayta login qiling.';
    }

    if (raw.includes('access denied') || raw.includes('role hierarchy violation')) {
        return 'Ushbu amal uchun ruxsat yetarli emas.';
    }

    if (raw.includes('user not found') || raw.includes('target user not found')) {
        return 'Foydalanuvchi topilmadi.';
    }

    if (raw.includes('temporary password')) {
        return 'Parol kamida 8 ta belgidan iborat bo‘lishi kerak.';
    }

    if (raw.includes('username already exists')) {
        return 'Bunday login allaqachon mavjud.';
    }

    if (raw.includes('invalid json body') || raw.includes('invalid request body')) {
        return 'So‘rov formati noto‘g‘ri.';
    }

    return String(error?.message || fallback);
}

function hideProtectedUi() {
    if (adminApp) {
        adminApp.hidden = true;
    }

    if (adminGate) {
        adminGate.style.display = 'flex';
    }
}

function showProtectedUi() {
    if (adminGate) {
        adminGate.style.display = 'none';
    }

    if (adminApp) {
        adminApp.hidden = false;
    }
}

function redirectUnauthorized() {
    window.location.replace('./my.cabinet/dashboard.html?status=no-access');
}

function getCustomerRows() {
    const q = state.customerSearch.trim().toLowerCase();
    const customers = state.users.filter((user) => user.role === 'customer');

    if (!q) {
        return customers;
    }

    return customers.filter((user) => {
        const login = user.username || '';
        const name = user.displayName || '';
        return login.includes(q) || name.toLowerCase().includes(q);
    });
}

function renderCustomers() {
    const rows = getCustomerRows();

    if (customersMeta) {
        customersMeta.textContent = `${rows.length} ta customer`;
    }

    if (!rows.length) {
        customersBody.innerHTML = '<tr><td colspan="7">Customerlar topilmadi</td></tr>';
        return;
    }

    customersBody.innerHTML = rows
        .map((user) => {
            const subPill = user.subscription?.active
                ? `<span class="pill ok">${user.subscription.tariff || 'ACTIVE'} (${formatDate(user.subscription.endAt)})</span>`
                : '<span class="pill warn">No subscription</span>';

            const remainingDays = getRemainingDays(user.subscription?.endAt);
            const remainText = remainingDays == null
                ? 'Muddati tugagan'
                : remainingDays > 0
                    ? `Qolgan: ${remainingDays} kun`
                    : 'Muddati tugagan';

            const blockedPill = user.blocked
                ? '<span class="pill bad">Blocked</span>'
                : '<span class="pill ok">Active</span>';

            const dayAdjustControls = canEditSubscription()
                ? `
                    <div class="days-controls">
                        <button class="btn btn-ghost btn-small" data-action="adjust-days" data-delta="1" data-uid="${user.uid}" type="button">+1</button>
                        <button class="btn btn-ghost btn-small" data-action="adjust-days" data-delta="7" data-uid="${user.uid}" type="button">+7</button>
                        <button class="btn btn-ghost btn-small" data-action="adjust-days" data-delta="30" data-uid="${user.uid}" type="button">+30</button>
                        <button class="btn btn-ghost btn-small" data-action="adjust-days" data-delta="-1" data-uid="${user.uid}" type="button">-1</button>
                        <button class="btn btn-ghost btn-small" data-action="adjust-days" data-delta="-7" data-uid="${user.uid}" type="button">-7</button>
                        <button class="btn btn-ghost btn-small" data-action="adjust-days" data-delta="-30" data-uid="${user.uid}" type="button">-30</button>
                        <input class="days-input" type="number" data-days-input="${user.uid}" placeholder="days">
                        <button class="btn btn-ghost btn-small" data-action="adjust-days-custom" data-uid="${user.uid}" type="button">Qo‘llash</button>
                    </div>
                `
                : '<small>Obuna faqat ko‘rish rejimida</small>';

            return `
                <tr>
                    <td>${user.username}</td>
                    <td>${user.displayName}</td>
                    <td>${(user.accessPacks || []).join(', ') || '-'}</td>
                    <td>
                        <div class="sub-lines">
                            ${subPill}
                            <small>Tugash sanasi: ${formatDateIso(user.subscription?.endAt)}</small>
                            <small>${remainText}</small>
                        </div>
                    </td>
                    <td>${user.deviceCount || 0}/3</td>
                    <td>${blockedPill}</td>
                    <td>
                        <div class="actions-row">
                            <button class="btn btn-ghost" data-action="reset" data-uid="${user.uid}" type="button">Reset parol</button>
                            ${canEditSubscription() ? `<button class="btn btn-ghost" data-action="subscription" data-uid="${user.uid}" type="button">Obuna</button>` : ''}
                            <button class="btn btn-ghost" data-action="clear-devices" data-uid="${user.uid}" type="button">Clear devices</button>
                            <button class="btn btn-ghost" data-action="unblock" data-uid="${user.uid}" type="button">Unblock</button>
                            ${state.role === 'developer' ? `<button class="btn btn-ghost" data-action="delete" data-uid="${user.uid}" type="button">Delete</button>` : ''}
                            ${dayAdjustControls}
                        </div>
                    </td>
                </tr>
            `;
        })
        .join('');
}

function renderStaff() {
    const rows = state.users.filter((user) => user.role !== 'customer');

    if (staffMeta) {
        staffMeta.textContent = `${rows.length} ta staff`;
    }

    if (!rows.length) {
        staffBody.innerHTML = '<tr><td colspan="5">Staff foydalanuvchilar topilmadi</td></tr>';
        return;
    }

    const allowRoleChange = state.role === 'admin' || state.role === 'developer';

    staffBody.innerHTML = rows
        .map((user) => {
            const canModify = state.role === 'developer' || (state.role === 'admin' && user.role === 'moderator');
            const options = ['moderator', 'admin', 'developer']
                .filter((role) => role === user.role || (state.role === 'developer' || role !== 'developer'))
                .filter((role) => !(state.role === 'admin' && role === 'admin'))
                .map((role) => `<option value="${role}" ${role === user.role ? 'selected' : ''}>${role}</option>`)
                .join('');

            return `
                <tr>
                    <td>${user.username}</td>
                    <td>${user.displayName}</td>
                    <td>${user.role}</td>
                    <td>${user.blocked ? '<span class="pill bad">Blocked</span>' : '<span class="pill ok">Active</span>'}</td>
                    <td>
                        <div class="actions-row">
                            ${allowRoleChange && canModify ? `
                                <select data-role-select="${user.uid}">
                                    ${options}
                                </select>
                                <button class="btn btn-ghost" data-action="set-role" data-uid="${user.uid}" type="button">Saqlash</button>
                            ` : ''}
                            ${canModify ? `<button class="btn btn-ghost" data-action="reset" data-uid="${user.uid}" type="button">Reset parol</button>` : ''}
                            ${state.role === 'developer' ? `<button class="btn btn-ghost" data-action="delete" data-uid="${user.uid}" type="button">Delete</button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        })
        .join('');
}

function renderAll() {
    renderCustomers();
    renderStaff();
}

async function loadUsers() {
    const result = await callApi('/api/admin?action=list-users', 'GET');
    const rawUsers = Array.isArray(result.users) ? result.users : [];
    state.users = rawUsers.map((user) => sanitizeRecord(user)).filter(Boolean);
    renderAll();
}

async function loadStats() {
    const result = await callApi('/api/admin?action=stats', 'GET');
    const stats = result?.stats || {};

    if (statTotalUsers) {
        statTotalUsers.textContent = String(stats.totalUsers || 0);
    }

    if (statActiveSubs) {
        statActiveSubs.textContent = String(stats.activeSubscriptions || 0);
    }

    if (statBlocked) {
        statBlocked.textContent = String(stats.blockedUsers || 0);
    }

    if (statDevices) {
        statDevices.textContent = String(stats.registeredDevices || 0);
    }
}

async function refreshData() {
    await Promise.all([loadUsers(), loadStats()]);
}

function applyRoleUi() {
    if (state.role === 'moderator') {
        if (createStaffCard) {
            createStaffCard.style.display = 'none';
        }
    }

    if (state.role === 'admin') {
        Array.from(staffRoleSelect.options).forEach((option) => {
            option.style.display = option.value === 'moderator' ? 'block' : 'none';
        });
        staffRoleSelect.value = 'moderator';
    }

    if (state.role === 'moderator') {
        Array.from(staffRoleSelect.options).forEach((option) => {
            option.style.display = 'none';
        });
    }

    if (state.role === 'developer') {
        Array.from(staffRoleSelect.options).forEach((option) => {
            option.style.display = 'block';
        });
    }
}

function debounce(fn, wait = 250) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}

async function unlockAdminPanel(username, password) {
    const email = usernameToEmail(username);
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const profile = await getUserProfile(credential.user.uid);

    if (!profile) {
        throw new Error('Profil topilmadi');
    }

    const role = normalizeRole(profile.role);
    if (!roleAllowed(role)) {
        await signOut(auth).catch(() => null);
        clearLocalUser();
        throw Object.assign(new Error('Sizda admin panelga ruxsat yo‘q'), { statusCode: 403 });
    }

    state.user = credential.user;
    state.profile = profile;
    state.role = role;
    saveLocalUser(credential.user, profile);

    adminMeta.textContent = `${profile.displayName || profile.username || credential.user.email} • ${state.role}`;
    applyRoleUi();

    await refreshData();
}

async function initGate() {
    hideProtectedUi();
    setGateInfo('Admin panel uchun qayta login qiling.');
    clearNotice(gateError);

    adminLoginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearNotice(gateError);

        const data = new FormData(adminLoginForm);
        const username = String(data.get('username') || '').trim();
        const password = String(data.get('password') || '');

        if (!username || !password) {
            showGateError('Login va parolni kiriting');
            return;
        }

        adminLoginBtn.disabled = true;
        adminLoginBtn.textContent = 'Tekshirilmoqda...';

        try {
            setGateInfo('Ruxsatlar tekshirilmoqda...');
            await unlockAdminPanel(username, password);
            showProtectedUi();
            showSuccess('Admin panel tayyor');
        } catch (error) {
            if (error?.statusCode === 403) {
                showGateError('Sizda admin panelga ruxsat yo‘q');
                setTimeout(() => {
                    redirectUnauthorized();
                }, 120);
                return;
            }

            showGateError(mapAdminLoginError(error));
        } finally {
            adminLoginBtn.disabled = false;
            adminLoginBtn.textContent = 'Kirish';
            setGateInfo('Xavfsizlik uchun admin panel alohida login talab qiladi.');
        }
    });
}

function initTabs() {
    tabsNav.addEventListener('click', (event) => {
        const button = event.target.closest('[data-tab]');
        if (!button) {
            return;
        }

        const tab = button.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach((node) => node.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((node) => node.classList.remove('active'));

        button.classList.add('active');
        const panel = document.getElementById(`tab-${tab}`);
        if (panel) {
            panel.classList.add('active');
        }
    });
}

function initCreateCustomer() {
    const form = document.getElementById('createCustomerForm');
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearNotice(globalError);

        const data = new FormData(form);
        const payload = {
            username: String(data.get('username') || '').trim(),
            displayName: String(data.get('displayName') || '').trim(),
            temporaryPassword: String(data.get('temporaryPassword') || ''),
            role: 'customer',
            tariff: String(data.get('tariff') || 'START'),
            subscriptionDays: Number(data.get('subscriptionDays') || 30),
            subscriptionActive: true,
            accessPacks: collectPacks(form)
        };

        try {
            await callApi('/api/admin?action=create-user', 'POST', payload);
            showSuccess('Customer yaratildi.');
            form.reset();
            form.querySelector('input[name="packs"][value="A1A2"]').checked = true;
            await refreshData();
        } catch (error) {
            showError(mapApiError(error, 'Customer yaratishda xatolik.'));
        }
    });
}

function initCreateStaff() {
    const form = document.getElementById('createStaffForm');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (state.role === 'moderator') {
            showError('Moderator staff yarata olmaydi.');
            return;
        }

        const data = new FormData(form);
        const payload = {
            username: String(data.get('username') || '').trim(),
            displayName: String(data.get('displayName') || '').trim(),
            temporaryPassword: String(data.get('temporaryPassword') || ''),
            role: String(data.get('role') || 'moderator')
        };

        try {
            await callApi('/api/admin?action=create-user', 'POST', payload);
            showSuccess('Staff foydalanuvchi yaratildi.');
            form.reset();
            await refreshData();
        } catch (error) {
            showError(mapApiError(error, 'Staff yaratishda xatolik.'));
        }
    });
}

async function resetPasswordFlow(userId) {
    const temporaryPassword = prompt('Yangi vaqtinchalik parol (kamida 8 belgi):');
    if (!temporaryPassword) {
        return;
    }

    await callApi('/api/admin?action=reset-password', 'POST', { userId, temporaryPassword });
    showSuccess('Parol tiklandi. Foydalanuvchi keyingi login’da almashtiradi.');
}

async function subscriptionFlow(userId) {
    if (!canEditSubscription()) {
        throw new Error('Bu amal faqat admin/developer uchun mavjud.');
    }

    const active = confirm('Obuna faol bo‘lsinmi? (OK = faol, Cancel = o‘chirish)');

    if (!active) {
        await callApi('/api/admin?action=set-subscription', 'POST', { userId, active: false });
        showSuccess('Obuna o‘chirildi.');
        await refreshData();
        return;
    }

    const durationDays = Number(prompt('Necha kunga aktiv qilinsin?', '30') || 30);
    const tariff = String(prompt('Tarif nomi (START/GOLD/PLATINUM):', 'START') || 'START').toUpperCase();
    const packsInput = String(prompt('Packlar (vergul bilan): A1A2,B1B2', 'A1A2') || '');
    const accessPacks = packsInput
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

    await callApi('/api/admin?action=set-subscription', 'POST', {
        userId,
        active: true,
        durationDays,
        tariff,
        accessPacks
    });

    showSuccess('Obuna yangilandi.');
    await refreshData();
}

async function adjustSubscriptionDays(userId, daysDelta) {
    if (!canEditSubscription()) {
        throw new Error('Bu amal faqat admin/developer uchun mavjud.');
    }

    const delta = Number(daysDelta);
    if (!Number.isInteger(delta) || delta === 0) {
        throw new Error('Kun o‘zgarishi butun son bo‘lishi kerak.');
    }

    const result = await callApi('/api/admin?action=adjust-subscription-days', 'POST', { userId, daysDelta: delta });
    const endDate = result?.result?.newEndAt || '-';
    showSuccess(`Obuna yangilandi. Yangi tugash sanasi: ${endDate}`);
}

function initRowActions() {
    async function handleAction(event) {
        const button = event.target.closest('[data-action]');
        if (!button) {
            return;
        }

        const action = button.dataset.action;
        const userId = button.dataset.uid;

        try {
            if (action === 'reset') {
                await resetPasswordFlow(userId);
            }

            if (action === 'subscription') {
                await subscriptionFlow(userId);
            }

            if (action === 'adjust-days') {
                const delta = Number(button.dataset.delta || 0);
                await adjustSubscriptionDays(userId, delta);
            }

            if (action === 'adjust-days-custom') {
                const input = document.querySelector(`input[data-days-input="${userId}"]`);
                const delta = Number(input?.value || 0);
                await adjustSubscriptionDays(userId, delta);
                if (input) {
                    input.value = '';
                }
            }

            if (action === 'clear-devices') {
                await callApi('/api/admin?action=clear-devices', 'POST', { userId });
                showSuccess('Qurilmalar ro‘yxati tozalandi.');
            }

            if (action === 'unblock') {
                await callApi('/api/admin?action=unblock-user', 'POST', { userId });
                showSuccess('Foydalanuvchi unblock qilindi.');
            }

            if (action === 'set-role') {
                const select = document.querySelector(`select[data-role-select="${userId}"]`);
                if (!select) {
                    return;
                }

                await callApi('/api/admin?action=set-role', 'POST', {
                    userId,
                    role: select.value
                });
                showSuccess('Role yangilandi.');
            }

            if (action === 'delete') {
                const ok = confirm('Foydalanuvchini butunlay o‘chirishni tasdiqlaysizmi?');
                if (!ok) {
                    return;
                }

                await callApi('/api/admin?action=delete-user', 'POST', { userId });
                showSuccess('Foydalanuvchi o‘chirildi.');
            }

            await refreshData();
        } catch (error) {
            showError(mapApiError(error, 'Amal bajarilmadi.'));
        }
    }

    customersBody.addEventListener('click', handleAction);
    staffBody.addEventListener('click', handleAction);
}

function initActions() {
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await signOut(auth);
        clearLocalUser();
        window.location.href = './my.cabinet/index.html?logout=1';
    });

    document.getElementById('refreshUsersBtn').addEventListener('click', async () => {
        try {
            await refreshData();
            showSuccess('Ro‘yxat yangilandi.');
        } catch (error) {
            showError(mapApiError(error, 'Yangilashda xatolik.'));
        }
    });

    if (usersSearchInput) {
        const debounced = debounce((value) => {
            state.customerSearch = value;
            renderCustomers();
        }, 250);

        usersSearchInput.addEventListener('input', (event) => {
            debounced(String(event.target.value || ''));
        });
    }
}

initTabs();
initCreateCustomer();
initCreateStaff();
initRowActions();
initActions();
initGate();
