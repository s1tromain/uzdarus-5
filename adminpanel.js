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
    customerSearch: '',
    customerStatusFilter: 'all'
};

const ADMIN_ROLES = new Set(['developer', 'admin', 'moderator']);
const SUBSCRIPTION_EDIT_ROLES = new Set(['developer', 'admin']);
const VALID_USER_ROLES = new Set(['customer', 'moderator', 'admin', 'developer']);
const EXPIRING_SOON_DAYS = 7;

function isSupportedRoleInput(value) {
    const raw = String(value || '').trim().toLowerCase();
    return raw === 'user' || VALID_USER_ROLES.has(raw);
}

const adminMeta = document.getElementById('adminMeta');
const customersBody = document.getElementById('customersBody');
const staffBody = document.getElementById('staffBody');
const usersSearchInput = document.getElementById('usersSearchInput');
const usersStatusFilter = document.getElementById('usersStatusFilter');
const customersMeta = document.getElementById('customersMeta');
const staffMeta = document.getElementById('staffMeta');
const tabsNav = document.getElementById('tabsNav');
const staffRoleSelect = document.getElementById('staffRoleSelect');
const createStaffCard = document.getElementById('createStaffCard');
const statTotalUsers = document.getElementById('statTotalUsers');
const statActiveSubs = document.getElementById('statActiveSubs');
const statBlocked = document.getElementById('statBlocked');
const statDevices = document.getElementById('statDevices');
const toastContainer = document.getElementById('toastContainer');

const adminGate = document.getElementById('adminGate');
const adminApp = document.getElementById('adminApp');
const gateInfo = document.getElementById('gateInfo');
const gateError = document.getElementById('gateError');
const adminLoginForm = document.getElementById('adminLoginForm');
const adminLoginBtn = document.getElementById('adminLoginBtn');

const adminModal = document.getElementById('adminModal');
const modalTitle = document.getElementById('adminModalTitle');
const modalAction = document.getElementById('adminModalAction');
const modalForm = document.getElementById('adminModalForm');
const modalError = document.getElementById('adminModalError');
const modalCancel = document.getElementById('adminModalCancel');
const modalConfirm = document.getElementById('adminModalConfirm');

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

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* ---- Toast notifications (PART 5) ---- */
function showToast(text, type = 'success') {
    if (!toastContainer) {
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = type === 'error' ? '⚠️' : type === 'info' ? 'ℹ️' : '✅';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'toast-icon';
    iconSpan.textContent = icon;

    const textSpan = document.createElement('span');
    textSpan.className = 'toast-text';
    textSpan.textContent = text;

    toast.appendChild(iconSpan);
    toast.appendChild(textSpan);
    toastContainer.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    window.setTimeout(() => {
        toast.classList.remove('show');
        window.setTimeout(() => toast.remove(), 280);
    }, 3600);
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
    showToast(text, 'error');
}

function showSuccess(text) {
    showToast(text, 'success');
}

function showGateError(text) {
    showNotice(gateError, text, 'error');
}

function setGateInfo(text) {
    if (gateInfo) {
        gateInfo.textContent = text;
    }
}

/* ---- Loading state helper (PART 5) ---- */
// Keeps the original label in place (hidden via CSS) and overlays a spinner,
// so the button keeps its width and there is no layout shift while loading.
function setButtonLoading(button, loading) {
    if (!button) {
        return;
    }

    if (loading) {
        button.disabled = true;
        button.classList.add('is-loading');
    } else {
        button.disabled = false;
        button.classList.remove('is-loading');
    }
}

/* ---- Confirmation modal (PART 3) ---- */
let modalFields = [];
let modalResolve = null;

function renderModalField(field) {
    const id = `modalField_${field.name}`;
    const label = escapeHtml(field.label);

    if (field.type === 'select') {
        const options = (field.options || [])
            .map((opt) => `<option value="${escapeHtml(opt.value)}" ${String(opt.value) === String(field.value) ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`)
            .join('');
        return `<label for="${id}">${label}<select id="${id}" name="${escapeHtml(field.name)}">${options}</select></label>`;
    }

    if (field.type === 'checkbox-group') {
        const boxes = (field.options || [])
            .map((opt) => `<label class="modal-check"><input type="checkbox" name="${escapeHtml(field.name)}" value="${escapeHtml(opt.value)}" ${opt.checked ? 'checked' : ''}> ${escapeHtml(opt.label)}</label>`)
            .join('');
        return `<div class="modal-field-group"><span class="modal-group-label">${label}</span><div class="modal-check-row">${boxes}</div></div>`;
    }

    const inputType = field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text';
    const attrs = [
        field.min != null ? `min="${escapeHtml(field.min)}"` : '',
        field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : ''
    ].filter(Boolean).join(' ');

    return `<label for="${id}">${label}<input id="${id}" name="${escapeHtml(field.name)}" type="${inputType}" value="${escapeHtml(field.value != null ? field.value : '')}" ${attrs}></label>`;
}

function openModal({ title, action, fields = [], confirmLabel = 'Tasdiqlash', danger = false } = {}) {
    return new Promise((resolve) => {
        // Defensively close any stale modal so we never leak a pending promise.
        if (modalResolve) {
            const previous = modalResolve;
            modalResolve = null;
            previous(null);
        }

        modalResolve = resolve;
        modalFields = fields;

        modalTitle.textContent = title || 'Tasdiqlash';

        if (action) {
            modalAction.textContent = `Amal: ${action}`;
            modalAction.style.display = 'block';
        } else {
            modalAction.textContent = '';
            modalAction.style.display = 'none';
        }

        modalForm.innerHTML = fields.map(renderModalField).join('');
        modalForm.style.display = fields.length ? 'grid' : 'none';
        clearNotice(modalError);

        modalConfirm.textContent = confirmLabel;
        modalConfirm.classList.toggle('btn-danger', Boolean(danger));

        adminModal.hidden = false;
        adminModal.classList.add('show');
        document.body.classList.add('modal-open');

        const firstInput = modalForm.querySelector('input:not([type="checkbox"]), select');
        window.setTimeout(() => (firstInput || modalConfirm).focus(), 30);
    });
}

function closeModal(result) {
    adminModal.classList.remove('show');
    adminModal.hidden = true;
    document.body.classList.remove('modal-open');
    modalConfirm.classList.remove('btn-danger');

    const resolve = modalResolve;
    modalResolve = null;
    modalFields = [];

    if (resolve) {
        resolve(result);
    }
}

function validateAndCollect() {
    const values = {};

    for (const field of modalFields) {
        if (field.type === 'checkbox-group') {
            values[field.name] = Array.from(modalForm.querySelectorAll(`input[name="${field.name}"]:checked`)).map((node) => node.value);
            continue;
        }

        const input = modalForm.querySelector(`[name="${field.name}"]`);
        const raw = input ? String(input.value).trim() : '';

        if (field.required && !raw) {
            return { error: `${field.label} to'ldirilishi shart.` };
        }

        if (field.minlength && raw.length < field.minlength) {
            return { error: `${field.label}: kamida ${field.minlength} ta belgi.` };
        }

        if (field.type === 'number' && raw !== '') {
            const num = Number(raw);
            if (Number.isNaN(num)) {
                return { error: `${field.label}: raqam kiriting.` };
            }
            if (field.min != null && num < Number(field.min)) {
                return { error: `${field.label}: eng kichik qiymat ${field.min}.` };
            }
        }

        values[field.name] = raw;
    }

    return { values };
}

function initModal() {
    if (!adminModal) {
        return;
    }

    modalConfirm.addEventListener('click', () => {
        const result = validateAndCollect();
        if (result.error) {
            showNotice(modalError, result.error, 'error');
            return;
        }
        closeModal(result.values);
    });

    modalCancel.addEventListener('click', () => closeModal(null));

    adminModal.addEventListener('click', (event) => {
        if (event.target === adminModal) {
            closeModal(null);
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !adminModal.hidden) {
            closeModal(null);
        }
    });

    modalForm.addEventListener('submit', (event) => {
        event.preventDefault();
        modalConfirm.click();
    });
}

// Normalize any date-ish value to a JS Date (or null). The admin API returns
// Firebase Admin Timestamps, which serialize over JSON as { _seconds,
// _nanoseconds } with no toDate() method — handle that shape explicitly so
// subscription dates/remaining days/status are read correctly (H1).
function toJsDate(rawDate) {
    if (rawDate == null) {
        return null;
    }

    if (typeof rawDate.toDate === 'function') {
        return rawDate.toDate();
    }

    if (typeof rawDate === 'object') {
        const seconds = typeof rawDate._seconds === 'number'
            ? rawDate._seconds
            : (typeof rawDate.seconds === 'number' ? rawDate.seconds : null);
        if (seconds !== null) {
            const nanos = typeof rawDate._nanoseconds === 'number'
                ? rawDate._nanoseconds
                : (typeof rawDate.nanoseconds === 'number' ? rawDate.nanoseconds : 0);
            return new Date(seconds * 1000 + Math.round(nanos / 1e6));
        }
    }

    return new Date(rawDate);
}

function formatDate(rawDate) {
    if (!rawDate) {
        return '-';
    }

    const date = toJsDate(rawDate);
    if (!date || Number.isNaN(date.getTime())) {
        return '-';
    }

    return date.toLocaleDateString('uz-UZ');
}

function formatDateIso(rawDate) {
    if (!rawDate) {
        return '-';
    }

    const date = toJsDate(rawDate);
    if (!date || Number.isNaN(date.getTime())) {
        return '-';
    }

    return date.toISOString().slice(0, 10);
}

function getRemainingDays(rawDate) {
    const endDate = toJsDate(rawDate);
    if (!endDate || Number.isNaN(endDate.getTime())) {
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

/* ---- Status badge classification (PART 5) ---- */
function getCustomerStatus(user) {
    if (user.blocked) {
        return { cls: 'status-badge badge-blocked', label: 'Bloklangan', category: 'blocked' };
    }

    const days = getRemainingDays(user.subscription?.endAt);
    const active = Boolean(user.subscription?.active) && days != null && days > 0;

    if (!active) {
        return { cls: 'status-badge badge-expired', label: 'Obuna tugagan', category: 'expired' };
    }

    if (days <= EXPIRING_SOON_DAYS) {
        return { cls: 'status-badge badge-expiring', label: `Tugashga ${days} kun`, category: 'expiring' };
    }

    return { cls: 'status-badge badge-active', label: 'Faol', category: 'active' };
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
    const filter = state.customerStatusFilter;
    let customers = state.users.filter((user) => user.role === 'customer');

    if (filter && filter !== 'all') {
        customers = customers.filter((user) => getCustomerStatus(user).category === filter);
    }

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
        customersBody.innerHTML = '<tr><td colspan="7" class="table-empty">Customerlar topilmadi</td></tr>';
        return;
    }

    customersBody.innerHTML = rows
        .map((user) => {
            const status = getCustomerStatus(user);

            const subPill = user.subscription?.active
                ? `<span class="pill ok">${escapeHtml(user.subscription.tariff || 'ACTIVE')} (${escapeHtml(formatDate(user.subscription.endAt))})</span>`
                : '<span class="pill warn">Obuna yo‘q</span>';

            const remainingDays = getRemainingDays(user.subscription?.endAt);
            const remainText = remainingDays == null
                ? 'Muddati tugagan'
                : remainingDays > 0
                    ? `Qolgan: ${remainingDays} kun`
                    : 'Muddati tugagan';

            const dayAdjustControls = canEditSubscription()
                ? `
                    <div class="days-controls">
                        <button class="btn btn-ghost btn-small" data-action="adjust-days" data-delta="1" data-uid="${user.uid}" type="button">+1</button>
                        <button class="btn btn-ghost btn-small" data-action="adjust-days" data-delta="7" data-uid="${user.uid}" type="button">+7</button>
                        <button class="btn btn-ghost btn-small" data-action="adjust-days" data-delta="30" data-uid="${user.uid}" type="button">+30</button>
                        <button class="btn btn-ghost btn-small" data-action="adjust-days" data-delta="-1" data-uid="${user.uid}" type="button">-1</button>
                        <button class="btn btn-ghost btn-small" data-action="adjust-days" data-delta="-7" data-uid="${user.uid}" type="button">-7</button>
                        <button class="btn btn-ghost btn-small" data-action="adjust-days" data-delta="-30" data-uid="${user.uid}" type="button">-30</button>
                        <input class="days-input" type="number" data-days-input="${user.uid}" placeholder="kun">
                        <button class="btn btn-ghost btn-small" data-action="adjust-days-custom" data-uid="${user.uid}" type="button">Qo‘llash</button>
                    </div>
                `
                : '<small>Obuna faqat ko‘rish rejimida</small>';

            return `
                <tr>
                    <td data-label="Login">${escapeHtml(user.username)}</td>
                    <td data-label="Ism">${escapeHtml(user.displayName)}</td>
                    <td data-label="Packs">${escapeHtml((user.accessPacks || []).join(', ') || '-')}</td>
                    <td data-label="Obuna">
                        <div class="sub-lines">
                            ${subPill}
                            <small>Tugash sanasi: ${escapeHtml(formatDateIso(user.subscription?.endAt))}</small>
                            <small>${escapeHtml(remainText)}</small>
                        </div>
                    </td>
                    <td data-label="Qurilmalar">${user.deviceCount || 0}/3</td>
                    <td data-label="Status"><span class="${status.cls}">${escapeHtml(status.label)}</span></td>
                    <td data-label="Amallar" class="actions-cell">
                        <div class="actions-row">
                            <button class="btn btn-ghost" data-action="reset" data-uid="${user.uid}" type="button">Reset parol</button>
                            ${canEditSubscription() ? `<button class="btn btn-ghost" data-action="subscription" data-uid="${user.uid}" type="button">Obuna</button>` : ''}
                            <button class="btn btn-ghost" data-action="unblock" data-uid="${user.uid}" type="button">Unblock</button>
                            ${state.role === 'developer' ? `<button class="btn btn-ghost btn-danger-soft" data-action="delete" data-uid="${user.uid}" type="button">Delete</button>` : ''}
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
        staffBody.innerHTML = '<tr><td colspan="5" class="table-empty">Staff foydalanuvchilar topilmadi</td></tr>';
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

            const statusBadge = user.blocked
                ? '<span class="status-badge badge-blocked">Bloklangan</span>'
                : '<span class="status-badge badge-active">Faol</span>';

            return `
                <tr>
                    <td data-label="Login">${escapeHtml(user.username)}</td>
                    <td data-label="Ism">${escapeHtml(user.displayName)}</td>
                    <td data-label="Role">${escapeHtml(user.role)}</td>
                    <td data-label="Status">${statusBadge}</td>
                    <td data-label="Amallar" class="actions-cell">
                        <div class="actions-row">
                            ${allowRoleChange && canModify ? `
                                <select data-role-select="${user.uid}">
                                    ${options}
                                </select>
                                <button class="btn btn-ghost" data-action="set-role" data-uid="${user.uid}" type="button">Saqlash</button>
                            ` : ''}
                            ${canModify ? `<button class="btn btn-ghost" data-action="reset" data-uid="${user.uid}" type="button">Reset parol</button>` : ''}
                            ${state.role === 'developer' ? `<button class="btn btn-ghost btn-danger-soft" data-action="delete" data-uid="${user.uid}" type="button">Delete</button>` : ''}
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

function renderLoadingState() {
    if (customersBody) {
        customersBody.innerHTML = '<tr><td colspan="7" class="table-loading">Yuklanmoqda…</td></tr>';
    }
    if (staffBody) {
        staffBody.innerHTML = '<tr><td colspan="5" class="table-loading">Yuklanmoqda…</td></tr>';
    }
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

    renderLoadingState();
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

    // Month-duration quick presets (Phase 4): selecting 1/3/6/12 months fills
    // the "Obuna kunlari" field with the matching real day count. The backend
    // computes endAt from these days using real timestamps.
    const presetSelect = form.querySelector('#durationPreset');
    const daysInput = form.querySelector('input[name="subscriptionDays"]');
    if (presetSelect && daysInput) {
        presetSelect.addEventListener('change', () => {
            if (presetSelect.value !== 'custom') {
                daysInput.value = presetSelect.value;
            }
        });
        daysInput.addEventListener('input', () => {
            presetSelect.value = 'custom';
        });
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

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

        const confirmed = await openModal({
            title: 'Tasdiqlash',
            action: `Yangi customer yaratish: ${payload.username || '-'}`,
            confirmLabel: 'Yaratish'
        });
        if (!confirmed) {
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        setButtonLoading(submitBtn, true);

        try {
            await callApi('/api/admin?action=create-user', 'POST', payload);
            showSuccess('Customer yaratildi.');
            form.reset();
            form.querySelector('input[name="packs"][value="A1A2"]').checked = true;
            await refreshData();
        } catch (error) {
            showError(mapApiError(error, 'Customer yaratishda xatolik.'));
        } finally {
            setButtonLoading(submitBtn, false);
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

        const confirmed = await openModal({
            title: 'Tasdiqlash',
            action: `Yangi staff yaratish: ${payload.username || '-'} (${payload.role})`,
            confirmLabel: 'Yaratish'
        });
        if (!confirmed) {
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        setButtonLoading(submitBtn, true);

        try {
            await callApi('/api/admin?action=create-user', 'POST', payload);
            showSuccess('Staff foydalanuvchi yaratildi.');
            form.reset();
            await refreshData();
        } catch (error) {
            showError(mapApiError(error, 'Staff yaratishda xatolik.'));
        } finally {
            setButtonLoading(submitBtn, false);
        }
    });
}

async function resetPasswordFlow(userId, button) {
    const values = await openModal({
        title: 'Parolni tiklash',
        action: 'Foydalanuvchi parolini tiklash',
        fields: [
            { name: 'temporaryPassword', label: 'Yangi vaqtinchalik parol', type: 'text', required: true, minlength: 8, placeholder: 'Kamida 8 ta belgi' }
        ],
        confirmLabel: 'Tiklash'
    });

    if (!values) {
        return false;
    }

    setButtonLoading(button, true);
    try {
        await callApi('/api/admin?action=reset-password', 'POST', { userId, temporaryPassword: values.temporaryPassword });
        showSuccess('Parol tiklandi. Foydalanuvchi keyingi loginda almashtiradi.');
        return true;
    } finally {
        setButtonLoading(button, false);
    }
}

async function subscriptionFlow(userId, button) {
    if (!canEditSubscription()) {
        throw new Error('Bu amal faqat admin/developer uchun mavjud.');
    }

    const values = await openModal({
        title: 'Obunani sozlash',
        action: 'Foydalanuvchi obunasini o‘zgartirish',
        fields: [
            {
                name: 'active',
                label: 'Holat',
                type: 'select',
                value: 'true',
                options: [
                    { value: 'true', label: 'Faol' },
                    { value: 'false', label: 'O‘chirilgan' }
                ]
            },
            { name: 'durationDays', label: 'Necha kunga', type: 'number', value: '30', min: 1 },
            {
                name: 'tariff',
                label: 'Tarif',
                type: 'select',
                value: 'START',
                options: [
                    { value: 'START', label: 'START' },
                    { value: 'TURBO', label: 'TURBO' },
                    { value: 'PREMIUM', label: 'PREMIUM' }
                ]
            },
            {
                name: 'packs',
                label: 'Packlar',
                type: 'checkbox-group',
                options: [
                    { value: 'A1A2', label: 'A1-A2', checked: true },
                    { value: 'B1B2', label: 'B1-B2' }
                ]
            }
        ],
        confirmLabel: 'Saqlash'
    });

    if (!values) {
        return false;
    }

    const active = values.active === 'true';

    setButtonLoading(button, true);
    try {
        if (!active) {
            await callApi('/api/admin?action=set-subscription', 'POST', { userId, active: false });
            showSuccess('Obuna o‘chirildi.');
            return true;
        }

        await callApi('/api/admin?action=set-subscription', 'POST', {
            userId,
            active: true,
            durationDays: Number(values.durationDays || 30),
            tariff: String(values.tariff || 'START').toUpperCase(),
            accessPacks: values.packs || []
        });

        showSuccess('Obuna yangilandi.');
        return true;
    } finally {
        setButtonLoading(button, false);
    }
}

async function adjustSubscriptionDays(userId, daysDelta, button) {
    if (!canEditSubscription()) {
        throw new Error('Bu amal faqat admin/developer uchun mavjud.');
    }

    const delta = Number(daysDelta);
    if (!Number.isInteger(delta) || delta === 0) {
        throw new Error('Kun o‘zgarishi nol bo‘lmagan butun son bo‘lishi kerak.');
    }

    const action = delta > 0
        ? `Obunaga ${delta} kun qo‘shish`
        : `Obunadan ${Math.abs(delta)} kun ayirish`;

    const confirmed = await openModal({ title: 'Tasdiqlash', action, confirmLabel: 'Tasdiqlash' });
    if (!confirmed) {
        return false;
    }

    setButtonLoading(button, true);
    try {
        const result = await callApi('/api/admin?action=adjust-subscription-days', 'POST', { userId, daysDelta: delta });
        const endDate = result?.result?.newEndAt || '-';
        showSuccess(`Obuna yangilandi. Yangi tugash sanasi: ${endDate}`);
        return true;
    } finally {
        setButtonLoading(button, false);
    }
}

async function unblockFlow(userId, button) {
    const confirmed = await openModal({
        title: 'Tasdiqlash',
        action: 'Foydalanuvchini blokdan chiqarish',
        confirmLabel: 'Tasdiqlash'
    });
    if (!confirmed) {
        return false;
    }

    setButtonLoading(button, true);
    try {
        await callApi('/api/admin?action=unblock-user', 'POST', { userId });
        showSuccess('Foydalanuvchi blokdan chiqarildi. Qurilma qulfi ham tozalandi.');
        return true;
    } finally {
        setButtonLoading(button, false);
    }
}

async function setRoleFlow(userId, button) {
    const select = document.querySelector(`select[data-role-select="${userId}"]`);
    if (!select) {
        return false;
    }

    const newRole = select.value;
    const confirmed = await openModal({
        title: 'Tasdiqlash',
        action: `Rolni o‘zgartirish: ${newRole}`,
        confirmLabel: 'Saqlash'
    });
    if (!confirmed) {
        return false;
    }

    setButtonLoading(button, true);
    try {
        await callApi('/api/admin?action=set-role', 'POST', { userId, role: newRole });
        showSuccess('Rol yangilandi.');
        return true;
    } finally {
        setButtonLoading(button, false);
    }
}

async function deleteFlow(userId, button) {
    const confirmed = await openModal({
        title: 'Tasdiqlash',
        action: 'Foydalanuvchini butunlay o‘chirish',
        confirmLabel: 'O‘chirish',
        danger: true
    });
    if (!confirmed) {
        return false;
    }

    setButtonLoading(button, true);
    try {
        await callApi('/api/admin?action=delete-user', 'POST', { userId });
        showSuccess('Foydalanuvchi o‘chirildi.');
        return true;
    } finally {
        setButtonLoading(button, false);
    }
}

function initRowActions() {
    async function handleAction(event) {
        const button = event.target.closest('[data-action]');
        if (!button) {
            return;
        }

        const action = button.dataset.action;
        const userId = button.dataset.uid;
        let performed = false;

        try {
            if (action === 'reset') {
                performed = await resetPasswordFlow(userId, button);
            } else if (action === 'subscription') {
                performed = await subscriptionFlow(userId, button);
            } else if (action === 'adjust-days') {
                const delta = Number(button.dataset.delta || 0);
                performed = await adjustSubscriptionDays(userId, delta, button);
            } else if (action === 'adjust-days-custom') {
                const input = document.querySelector(`input[data-days-input="${userId}"]`);
                const delta = Number(input?.value || 0);
                performed = await adjustSubscriptionDays(userId, delta, button);
                if (performed && input) {
                    input.value = '';
                }
            } else if (action === 'unblock') {
                performed = await unblockFlow(userId, button);
            } else if (action === 'set-role') {
                performed = await setRoleFlow(userId, button);
            } else if (action === 'delete') {
                performed = await deleteFlow(userId, button);
            }

            if (performed) {
                await refreshData();
            }
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

    const refreshBtn = document.getElementById('refreshUsersBtn');
    refreshBtn.addEventListener('click', async () => {
        setButtonLoading(refreshBtn, true);
        try {
            await refreshData();
            showSuccess('Ro‘yxat yangilandi.');
        } catch (error) {
            showError(mapApiError(error, 'Yangilashda xatolik.'));
        } finally {
            setButtonLoading(refreshBtn, false);
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

    if (usersStatusFilter) {
        usersStatusFilter.addEventListener('change', (event) => {
            state.customerStatusFilter = String(event.target.value || 'all');
            renderCustomers();
        });
    }
}

initModal();
initTabs();
initCreateCustomer();
initCreateStaff();
initRowActions();
initActions();
initGate();
