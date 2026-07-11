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
    customerStatusFilter: 'all',
    // Analytics filters (Part 8) + per-uid overview rows from students-overview
    overview: {},
    courseFilter: 'all',
    progressFilter: 'all',
    activityFilter: 'all',
    achievementFilter: 'all'
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

    // Analytics filters (Part 8) — driven by the cheap students-overview rows.
    const ov = (u) => state.overview[u.uid] || null;
    if (state.courseFilter !== 'all') {
        customers = customers.filter((u) => {
            const c = ov(u)?.courses?.find((x) => x.code === state.courseFilter);
            return c && c.completedTopics > 0;
        });
    }
    if (state.progressFilter !== 'all') {
        customers = customers.filter((u) => {
            const p = ov(u)?.overallProgress ?? 0;
            switch (state.progressFilter) {
                case '0': return p === 0;
                case '1-49': return p >= 1 && p <= 49;
                case '50-99': return p >= 50 && p <= 99;
                case '100': return p >= 100;
                default: return true;
            }
        });
    }
    if (state.activityFilter === 'today') {
        customers = customers.filter((u) => ov(u)?.activeToday);
    } else if (state.activityFilter === 'inactive') {
        const cutoff = Date.now() - 7 * 86400000;
        customers = customers.filter((u) => {
            const la = ov(u)?.lastActivity;
            return !la || la < cutoff;
        });
    }
    if (state.achievementFilter === 'exam') {
        customers = customers.filter((u) => (ov(u)?.examsPassed || 0) > 0);
    } else if (state.achievementFilter === 'cert') {
        customers = customers.filter((u) => (ov(u)?.certificates || 0) > 0);
    }

    if (!q) {
        return customers;
    }

    return customers.filter((user) => {
        const login = (user.username || '').toLowerCase();
        const name = (user.displayName || '').toLowerCase();
        const email = (user.email || '').toLowerCase();
        return login.includes(q) || name.includes(q) || email.includes(q);
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
                            <button class="btn btn-analytics" data-action="analytics" data-uid="${user.uid}" type="button">📊 Analitika</button>
                            <button class="btn btn-ghost" data-action="reset" data-uid="${user.uid}" type="button">Reset parol</button>
                            ${canEditSubscription() ? `<button class="btn btn-ghost" data-action="subscription" data-uid="${user.uid}" type="button">Obuna</button>` : ''}
                            <button class="btn btn-ghost" data-action="certificates" data-uid="${user.uid}" type="button">Sertifikatlar</button>
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

async function loadOverview() {
    try {
        const result = await callApi('/api/admin?action=students-overview', 'GET');
        const rows = Array.isArray(result.students) ? result.students : [];
        const map = {};
        rows.forEach((r) => { if (r && r.uid) map[r.uid] = r; });
        state.overview = map;
    } catch (error) {
        // Analytics overview is best-effort; the customer list still works.
        console.warn('students-overview load failed:', error?.message || error);
    }
}

async function refreshData() {
    await Promise.all([loadUsers(), loadStats(), loadOverview()]);
    // Re-render once the overview map is in so analytics filters/badges apply.
    renderCustomers();
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

function setActiveTab(tab) {
    document.querySelectorAll('.tab-btn').forEach((node) => {
        node.classList.toggle('active', node.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-panel').forEach((node) => node.classList.remove('active'));
    const panel = document.getElementById(`tab-${tab}`);
    if (panel) {
        panel.classList.add('active');
    }
}

function initTabs() {
    tabsNav.addEventListener('click', (event) => {
        const button = event.target.closest('[data-tab]');
        if (!button) {
            return;
        }

        setActiveTab(button.dataset.tab);
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

/* ================= CERTIFICATES (Part 8/9/10) ================= */
let certRows = [];

function certCourseLabel(cert) {
    const course = cert.course || '';
    return cert.level && cert.level !== course ? `${course} (${cert.level})` : course;
}

function renderCertRows(rows, metaText) {
    certRows = Array.isArray(rows) ? rows : [];
    const body = document.getElementById('certSearchBody');
    const meta = document.getElementById('certSearchMeta');

    if (meta) {
        meta.textContent = metaText || `${certRows.length} ta sertifikat`;
    }
    if (!body) {
        return;
    }

    if (!certRows.length) {
        body.innerHTML = '<tr><td colspan="6" class="table-empty">Sertifikat topilmadi</td></tr>';
        return;
    }

    body.innerHTML = certRows
        .map((c, i) => {
            const owner = [c.userName, c.username ? `@${c.username}` : '', c.email]
                .filter(Boolean)
                .join(' · ');
            return `
                <tr>
                    <td data-label="Raqam">${escapeHtml(c.certificateNumber || '-')}</td>
                    <td data-label="Egasi">${escapeHtml(owner || '-')}</td>
                    <td data-label="Kurs">${escapeHtml(certCourseLabel(c))}</td>
                    <td data-label="Sana">${escapeHtml(formatDate(c.issueDate))}</td>
                    <td data-label="Status">${escapeHtml(c.status || 'active')}</td>
                    <td data-label="Amallar"><button class="btn btn-ghost btn-small" data-cert-view="${i}" type="button">Ko‘rish</button></td>
                </tr>
            `;
        })
        .join('');
}

function buildAdminCertHtml(cert) {
    const owner = cert.userName || '-';
    const number = cert.certificateNumber || '-';
    const course = certCourseLabel(cert);
    const date = formatDate(cert.issueDate);
    const score = (cert.score != null) ? `${cert.score} / 100` : '—';
    const extra = [cert.username ? `@${cert.username}` : '', cert.email].filter(Boolean).join(' · ');

    return `
        <div style="background:#fffdf5;border:8px double #C9A227;border-radius:14px;padding:28px 24px;text-align:center;font-family:Georgia,'Segoe UI',serif;">
            <div style="font-weight:800;color:#0f3460;letter-spacing:1px;">Uzda<span style="color:#08617f;">Rus</span> PRO</div>
            <div style="font-size:.78rem;letter-spacing:3px;color:#C9A227;text-transform:uppercase;font-weight:700;margin-top:6px;">Sertifikat</div>
            <div style="font-size:1.4rem;font-weight:800;color:#1a1a2e;margin:14px 0 4px;">${escapeHtml(course)} — Rus tili</div>
            <div style="font-size:1.3rem;font-weight:800;color:#0f3460;border-bottom:2px solid #C9A227;display:inline-block;padding:0 16px 6px;margin:8px 0 4px;">${escapeHtml(owner)}</div>
            ${extra ? `<div style="font-size:.82rem;color:#666;margin:6px 0 0;">${escapeHtml(extra)}</div>` : ''}
            <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:18px;font-size:.85rem;color:#444;text-align:left;">
                <div style="flex:1;min-width:120px;">Yakuniy ball<b style="display:block;color:#0f3460;">${escapeHtml(score)}</b></div>
                <div style="flex:1;min-width:120px;">Sana<b style="display:block;color:#0f3460;">${escapeHtml(date)}</b></div>
                <div style="flex:1;min-width:120px;">Raqam<b style="display:block;color:#0f3460;word-break:break-word;">${escapeHtml(number)}</b></div>
                <div style="flex:1;min-width:120px;">Status<b style="display:block;color:#0f3460;">${escapeHtml(cert.status || 'active')}</b></div>
            </div>
        </div>
    `;
}

function openCertDetail(cert) {
    const overlay = document.getElementById('certDetailOverlay');
    const body = document.getElementById('certDetailBody');
    if (!overlay || !body) {
        return;
    }
    body.innerHTML = buildAdminCertHtml(cert);
    overlay.hidden = false;
    document.body.classList.add('modal-open');
}

function closeCertDetail() {
    const overlay = document.getElementById('certDetailOverlay');
    if (overlay) {
        overlay.hidden = true;
    }
    document.body.classList.remove('modal-open');
}

async function runCertSearch() {
    const input = document.getElementById('certSearchInput');
    const meta = document.getElementById('certSearchMeta');
    const q = String(input?.value || '').trim();

    if (!q) {
        renderCertRows([], 'Qidiruv so‘zini kiriting.');
        return;
    }

    if (meta) {
        meta.textContent = 'Qidirilmoqda...';
    }

    try {
        const result = await callApi(`/api/admin?action=search-certificates&q=${encodeURIComponent(q)}`, 'GET');
        const rows = result.results || [];
        renderCertRows(rows, `${rows.length} ta natija`);
    } catch (error) {
        renderCertRows([], mapApiError(error, 'Qidiruvda xatolik.'));
    }
}

async function viewUserCertificates(userId) {
    try {
        const result = await callApi(`/api/admin?action=list-user-certificates&userId=${encodeURIComponent(userId)}`, 'GET');
        const rows = result.certificates || [];
        setActiveTab('certificates');
        renderCertRows(rows, `${rows.length} ta sertifikat`);
    } catch (error) {
        showError(mapApiError(error, 'Sertifikatlarni yuklab bo‘lmadi.'));
    }
}

function initCertificates() {
    const searchBtn = document.getElementById('certSearchBtn');
    const searchInput = document.getElementById('certSearchInput');
    const body = document.getElementById('certSearchBody');
    const overlay = document.getElementById('certDetailOverlay');
    const closeBtn = document.getElementById('certDetailClose');

    if (searchBtn) {
        searchBtn.addEventListener('click', runCertSearch);
    }
    if (searchInput) {
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                runCertSearch();
            }
        });
    }
    if (body) {
        body.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-cert-view]');
            if (!btn) {
                return;
            }
            const cert = certRows[Number(btn.dataset.certView)];
            if (cert) {
                openCertDetail(cert);
            }
        });
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closeCertDetail);
    }
    if (overlay) {
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                closeCertDetail();
            }
        });
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
            } else if (action === 'certificates') {
                await viewUserCertificates(userId);
                performed = false;
            } else if (action === 'analytics') {
                await openStudentAnalytics(userId);
                performed = false;
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

    // Analytics filters (Part 8)
    [
        ['usersCourseFilter', 'courseFilter'],
        ['usersProgressFilter', 'progressFilter'],
        ['usersActivityFilter', 'activityFilter'],
        ['usersAchievementFilter', 'achievementFilter'],
    ].forEach(([elId, stateKey]) => {
        const el = document.getElementById(elId);
        if (el) {
            el.addEventListener('change', (event) => {
                state[stateKey] = String(event.target.value || 'all');
                renderCustomers();
            });
        }
    });
}

initModal();
initTabs();
initCreateCustomer();
initCreateStaff();
initRowActions();
initActions();
initCertificates();
initGate();
// NOTE: initStudentAnalytics() is intentionally NOT called here. Its module
// state (_saOverlay/_saData/_saTab) is declared with `let` further down the
// file, so calling it at this point would hit the temporal dead zone
// (ReferenceError: Cannot access '_saOverlay' before initialization) and abort
// the whole module — breaking admin login. It is invoked at the END of the
// file instead, once those declarations have been initialized. It is also
// lazily called by openStudentAnalytics(), so it is idempotent.

/* ==================================================================
 *  STUDENT ANALYTICS DASHBOARD (Stage 2)
 *  Full learning-analytics view rendered inside the existing admin
 *  panel. Data comes from GET /api/admin?action=student-analytics&uid=…
 *  (staff-only, server-verified). No raw JSON — a professional dashboard.
 * ================================================================== */
let _saOverlay = null;
let _saData = null;
let _saTab = 'overview';

function saDur(ms) {
    ms = Number(ms) || 0;
    const min = Math.round(ms / 60000);
    if (min < 1) return '0 daq';
    if (min < 60) return `${min} daq`;
    const h = Math.floor(min / 60), m = min % 60;
    return `${h} soat${m ? ' ' + m + ' daq' : ''}`;
}
function saDateTime(ms) { return ms ? new Date(ms).toLocaleString('uz-UZ') : '—'; }
function saDate(ms) { return ms ? new Date(ms).toLocaleDateString('uz-UZ') : '—'; }
function saTime(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function saStars(n) { n = Math.max(0, Math.min(5, Number(n) || 0)); return '★'.repeat(n) + '☆'.repeat(5 - n); }
function saBar(pct, cls) {
    pct = Math.max(0, Math.min(100, Number(pct) || 0));
    return `<div class="sa-bar"><div class="sa-bar-fill ${cls || ''}" style="width:${pct}%"></div></div>`;
}
function saStat(label, value, sub) {
    return `<div class="sa-stat"><div class="sa-stat-val">${value}</div><div class="sa-stat-lbl">${escapeHtml(label)}</div>${sub ? `<div class="sa-stat-sub">${escapeHtml(sub)}</div>` : ''}</div>`;
}
function saNum(v, dash) { return (v === null || v === undefined) ? (dash || '—') : String(v); }

function initStudentAnalytics() {
    if (document.getElementById('studentAnalyticsOverlay')) {
        _saOverlay = document.getElementById('studentAnalyticsOverlay');
        return;
    }
    injectAnalyticsStyles();
    const ov = document.createElement('div');
    ov.id = 'studentAnalyticsOverlay';
    ov.className = 'sa-overlay';
    ov.innerHTML = `
        <div class="sa-panel" role="dialog" aria-modal="true" aria-label="Talaba analitikasi">
            <div class="sa-head">
                <div class="sa-head-main" id="saHeadMain"></div>
                <button class="sa-close" id="saClose" type="button" aria-label="Yopish">✕</button>
            </div>
            <div class="sa-tabs" id="saTabs"></div>
            <div class="sa-body" id="saBody"></div>
        </div>`;
    document.body.appendChild(ov);
    _saOverlay = ov;
    ov.addEventListener('click', (e) => { if (e.target === ov) closeStudentAnalytics(); });
    document.getElementById('saClose').addEventListener('click', closeStudentAnalytics);
    document.getElementById('saTabs').addEventListener('click', (e) => {
        const b = e.target.closest('[data-sa-tab]');
        if (!b) return;
        _saTab = b.dataset.saTab;
        renderAnalyticsTabs();
        renderAnalyticsBody();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _saOverlay && _saOverlay.classList.contains('open')) closeStudentAnalytics();
    });
}

async function openStudentAnalytics(uid) {
    initStudentAnalytics();
    _saTab = 'overview';
    _saData = null;
    _saOverlay.classList.add('open');
    document.getElementById('saHeadMain').innerHTML = '<div class="sa-title">Yuklanmoqda…</div>';
    document.getElementById('saTabs').innerHTML = '';
    document.getElementById('saBody').innerHTML = '<div class="sa-loading">📊 Ma’lumotlar yuklanmoqda…</div>';
    try {
        const res = await callApi('/api/admin?action=student-analytics&uid=' + encodeURIComponent(uid), 'GET');
        _saData = res.dashboard;
        renderAnalyticsHead();
        renderAnalyticsTabs();
        renderAnalyticsBody();
    } catch (error) {
        document.getElementById('saBody').innerHTML =
            `<div class="sa-error">${escapeHtml(mapApiError(error, 'Analitikani yuklab bo‘lmadi.'))}</div>`;
    }
}

function closeStudentAnalytics() {
    if (_saOverlay) _saOverlay.classList.remove('open');
}

function renderAnalyticsHead() {
    const p = _saData.profile;
    const online = p.online
        ? '<span class="sa-dot online"></span> Onlayn'
        : '<span class="sa-dot"></span> Oflayn';
    document.getElementById('saHeadMain').innerHTML = `
        <div class="sa-avatar">${escapeHtml((p.username || '?').slice(0, 2).toUpperCase())}</div>
        <div class="sa-head-info">
            <div class="sa-title">${escapeHtml(p.displayName || p.username || '—')}</div>
            <div class="sa-sub">@${escapeHtml(p.username || '')}${p.email ? ' · ' + escapeHtml(p.email) : ''} · <b>${escapeHtml(p.role || 'customer')}</b></div>
            <div class="sa-sub sa-meta">${online} · Qurilmalar: ${saNum(p.deviceCount, '0')} · Ro‘yxatdan: ${saDate(p.registeredAt)} · Oxirgi faollik: ${saDateTime(p.lastActivity)}</div>
        </div>`;
}

function renderAnalyticsTabs() {
    const tabs = [
        ['overview', 'Umumiy'], ['timeline', 'Timeline'], ['exercises', 'Mashqlar'],
        ['pronunciation', 'Talaffuz'], ['vocabulary', 'Lug‘at'],
    ];
    document.getElementById('saTabs').innerHTML = tabs.map(([k, l]) =>
        `<button class="sa-tab ${_saTab === k ? 'active' : ''}" data-sa-tab="${k}" type="button">${l}</button>`).join('');
}

function renderAnalyticsBody() {
    const el = document.getElementById('saBody');
    if (!_saData) { el.innerHTML = '<div class="sa-loading">…</div>'; return; }
    let html = '';
    if (_saTab === 'overview') html = renderSAOverview(_saData);
    else if (_saTab === 'timeline') html = renderSATimeline(_saData);
    else if (_saTab === 'exercises') html = renderSAExercises(_saData);
    else if (_saTab === 'pronunciation') html = renderSAPron(_saData);
    else if (_saTab === 'vocabulary') html = renderSAVocab(_saData);
    el.innerHTML = html;
    el.scrollTop = 0;
}

function renderSAOverview(d) {
    const sub = d.subscription || {};
    const subCls = sub.active ? 'ok' : 'warn';
    const subText = sub.active
        ? `${escapeHtml(sub.tariff || 'FAOL')} · ${sub.daysLeft != null ? sub.daysLeft + ' kun qoldi' : ''}`
        : 'Obuna yo‘q / tugagan';
    const cur = d.current || {};
    const st = d.stats || {};
    const lt = st.learningTime || {};

    const courseCards = (d.courses || []).map((c) => {
        const cert = c.certificate ? `<span class="sa-pill ok">🎓 #${escapeHtml(String(c.certificate.number || '✓'))}</span>` : '';
        const exam = c.examStatus === 'passed' ? '<span class="sa-pill ok">Imtihon ✓</span>'
            : c.examStatus === 'failed' ? '<span class="sa-pill bad">Imtihon ✗</span>'
            : '<span class="sa-pill">Imtihon —</span>';
        return `
            <div class="sa-course">
                <div class="sa-course-top"><b>${c.code}</b><span>${c.progressPercent}%</span></div>
                ${saBar(c.progressPercent, c.progressPercent >= 100 ? 'green' : '')}
                <div class="sa-course-meta">${c.completedTopics}/${c.totalTopics} mavzu · ${c.remaining} qoldi</div>
                <div class="sa-course-meta">📚 ${c.vocabLearned} so‘z</div>
                <div class="sa-chips">${exam} ${cert}</div>
            </div>`;
    }).join('');

    const curCard = `
        <div class="sa-card sa-current">
            <div class="sa-card-h">📍 Hozirgi holat</div>
            <div class="sa-cur-grid">
                <div><span>Kurs</span><b>${escapeHtml(cur.course || '—')}</b></div>
                <div><span>Mavzu</span><b>${saNum(cur.topic)}</b></div>
                <div><span>Lug‘at kartasi</span><b>${cur.vocabCard ? `${saNum(cur.vocabCard.card)}${cur.vocabCard.total ? '/' + cur.vocabCard.total : ''}` : '—'}</b></div>
                <div><span>Imtihon</span><b>${cur.exam ? escapeHtml((cur.exam.level || '') + ' ' + (cur.exam.score != null ? cur.exam.score + '%' : '')) : '—'}</b></div>
            </div>
            <div class="sa-cur-activity">Oxirgi harakat: ${escapeHtml(cur.activity || '—')}</div>
        </div>`;

    return `
        <div class="sa-grid-2">
            <div class="sa-card sa-hero">
                <div class="sa-hero-pct">${d.overallProgress}%</div>
                <div class="sa-hero-lbl">Umumiy kurs progressi</div>
                ${saBar(d.overallProgress)}
                <div class="sa-hero-sub">${(d.totals && d.totals.words) || 0} so‘z · ${st.topicsCompleted || 0} mavzu · ${st.examsPassed || 0} imtihon</div>
            </div>
            <div class="sa-card sa-subcard ${subCls}">
                <div class="sa-card-h">💳 Obuna</div>
                <div class="sa-sub-status ${subCls}">${escapeHtml(subText)}</div>
                <div class="sa-sub-meta">Tugash sanasi: ${saDate(sub.endAt)}</div>
            </div>
        </div>
        ${curCard}
        <div class="sa-card">
            <div class="sa-card-h">📊 Statistika</div>
            <div class="sa-stats">
                ${saStat('Bugun', saDur(lt.today))}
                ${saStat('Bu hafta', saDur(lt.week))}
                ${saStat('Bu oy', saDur(lt.month))}
                ${saStat('Jami vaqt', saDur(lt.total))}
                ${saStat('O‘rt. talaffuz', st.avgPronunciation != null ? st.avgPronunciation + '%' : '—')}
                ${saStat('O‘rt. mashq', st.avgExercise != null ? st.avgExercise + '%' : '—')}
                ${saStat('Muvaffaqiyat', st.successRate != null ? st.successRate + '%' : '—')}
                ${saStat('Imtihon o‘tish', st.examPassRate != null ? st.examPassRate + '%' : '—')}
                ${saStat('So‘z o‘rgandi', st.wordsLearned || 0)}
                ${saStat('Mavzu tugatdi', st.topicsCompleted || 0)}
                ${saStat('Talaffuz urinish', (d.totals && d.totals.pron) || 0)}
                ${saStat('Mashq bajardi', (d.totals && d.totals.exercises) || 0)}
                ${saStat('Imtihon o‘tdi', st.examsPassed || 0)}
                ${saStat('Sertifikatlar', (d.certificates || []).length)}
            </div>
        </div>
        <div class="sa-card">
            <div class="sa-card-h">🎯 Kurslar bo‘yicha progress</div>
            <div class="sa-courses">${courseCards}</div>
        </div>
        ${(d.certificates || []).length ? `
        <div class="sa-card">
            <div class="sa-card-h">🎓 Sertifikatlar</div>
            <div class="sa-chips">${d.certificates.map(c => `<span class="sa-pill ok">${escapeHtml(String(c.course || ''))} · #${escapeHtml(String(c.number || '—'))} · ${saDate(c.issuedAt)}</span>`).join('')}</div>
        </div>` : ''}`;
}

function renderSATimeline(d) {
    const items = d.timeline || [];
    if (!items.length) return '<div class="sa-empty">Hozircha faoliyat qayd etilmagan.</div>';
    // group by day
    const groups = {};
    items.forEach((e) => {
        const day = e.ts ? new Date(e.ts).toLocaleDateString('uz-UZ') : '—';
        (groups[day] = groups[day] || []).push(e);
    });
    return '<div class="sa-timeline">' + Object.entries(groups).map(([day, evs]) => `
        <div class="sa-tl-day">${escapeHtml(day)}</div>
        ${evs.map(e => `
            <div class="sa-tl-row">
                <div class="sa-tl-time">${saTime(e.ts)}</div>
                <div class="sa-tl-dot ${saTlClass(e.type)}"></div>
                <div class="sa-tl-label">${escapeHtml(e.label || e.type)}${e.course ? ` <span class="sa-tl-course">${escapeHtml(e.course)}</span>` : ''}</div>
            </div>`).join('')}
    `).join('') + '</div>';
}
function saTlClass(type) {
    if (type === 'pron') return 'p';
    if (type === 'exam_pass' || type === 'topic_pass' || type === 'vocab_done' || type === 'ex_done') return 'g';
    if (type === 'exam_fail') return 'r';
    return '';
}

function renderSAExercises(d) {
    const ex = (d.exercises || []).filter(e => e.kind === 'exercise' || e.kind === 'exam');
    if (!ex.length) return '<div class="sa-empty">Mashq/imtihon natijalari yo‘q.</div>';
    return '<div class="sa-exlist">' + ex.map((e) => {
        const cls = e.passed === true ? 'ok' : e.passed === false ? 'bad' : '';
        const answers = (e.answers || []).length
            ? `<div class="sa-answers">${e.answers.map(a => `
                <div class="sa-ans">
                    <span class="sa-ans-q">${escapeHtml(a.section ? a.section + ' · ' : '')}${escapeHtml(a.question || '')}</span>
                    <span class="sa-ans-a">${escapeHtml(a.answer || '')}</span>
                </div>`).join('')}</div>`
            : '<div class="sa-answers sa-muted">Javoblar saqlanmagan.</div>';
        return `
            <details class="sa-ex">
                <summary>
                    <span class="sa-ex-title">${escapeHtml(e.id || '')} <span class="sa-tag ${e.kind === 'exam' ? 'exam' : ''}">${e.kind === 'exam' ? 'Imtihon' : 'Mashq'}</span></span>
                    <span class="sa-ex-score sa-pill ${cls}">${e.percent != null ? e.percent + '%' : '—'} (${saNum(e.score, '0')}/${saNum(e.total, '?')})</span>
                    <span class="sa-ex-date">${saDateTime(e.timestamp)}</span>
                </summary>
                ${answers}
            </details>`;
    }).join('') + '</div>';
}

function renderSAPron(d) {
    const pr = d.pronunciation || [];
    if (!pr.length) return '<div class="sa-empty">Talaffuz urinishlari qayd etilmagan.</div>';
    return `
        <div class="sa-card"><div class="sa-card-h">🎤 Talaffuz tarixi (${pr.length})</div>
        <div class="sa-pron-list">${pr.map((a) => {
            const cls = a.pass ? 'ok' : 'bad';
            return `
            <div class="sa-pron ${cls}">
                <div class="sa-pron-top">
                    <span class="sa-pron-stars">${saStars(a.stars)}</span>
                    <span class="sa-pron-score">${a.score != null ? a.score + '%' : '—'}</span>
                    <span class="sa-pill ${cls}">${a.pass ? 'O‘tdi' : 'O‘tmadi'}</span>
                    <span class="sa-pron-date">${saDateTime(a.ts)}</span>
                </div>
                <div class="sa-pron-words">
                    <span class="sa-pron-exp">Kutilgan: «${escapeHtml(a.expected || '—')}»</span>
                    <span class="sa-pron-rec">Eshitildi: «${escapeHtml(a.recognized || '—')}»</span>
                </div>
                <div class="sa-pron-metrics">
                    <span>Accuracy: <b>${saNum(a.accuracy)}</b></span>
                    <span>Completeness: <b>${saNum(a.completeness)}</b></span>
                    <span>Fluency: <b>${saNum(a.fluency)}</b></span>
                    <span>Confidence: <b>${a.confidence != null ? a.confidence : '—'}</b></span>
                </div>
                ${a.feedback ? `<div class="sa-pron-fb">${escapeHtml(a.feedback)}</div>` : ''}
            </div>`;
        }).join('')}</div></div>`;
}

function renderSAVocab(d) {
    const cur = d.current || {};
    const cards = (d.courses || []).map(c => `
        <div class="sa-course">
            <div class="sa-course-top"><b>${c.code}</b><span>${c.vocabLearned} so‘z</span></div>
            ${saBar(c.progressPercent)}
            <div class="sa-course-meta">${c.completedTopics}/${c.totalTopics} mavzu</div>
        </div>`).join('');
    return `
        <div class="sa-card sa-current">
            <div class="sa-card-h">📖 Hozirgi lug‘at holati</div>
            <div class="sa-cur-grid">
                <div><span>Kurs</span><b>${escapeHtml(cur.course || '—')}</b></div>
                <div><span>Mavzu</span><b>${saNum(cur.topic)}</b></div>
                <div><span>Karta</span><b>${cur.vocabCard ? `${saNum(cur.vocabCard.card)}${cur.vocabCard.total ? '/' + cur.vocabCard.total : ''}` : '—'}</b></div>
                <div><span>Talaffuz urinishlari</span><b>${(d.totals && d.totals.pron) || 0}</b></div>
                <div><span>Tinglash soni</span><b>${(d.totals && d.totals.listens) || 0}</b></div>
            </div>
        </div>
        <div class="sa-card">
            <div class="sa-card-h">📚 Kurslar bo‘yicha lug‘at</div>
            <div class="sa-courses">${cards}</div>
        </div>`;
}

function injectAnalyticsStyles() {
    if (document.getElementById('saStyles')) return;
    const s = document.createElement('style');
    s.id = 'saStyles';
    s.textContent = `
.sa-overlay{position:fixed;inset:0;background:rgba(12,15,32,.72);backdrop-filter:blur(4px);z-index:11000;display:none;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto}
.sa-overlay.open{display:flex}
.sa-panel{background:#f6f8fc;color:#1a1f36;width:100%;max-width:1080px;border-radius:20px;box-shadow:0 30px 90px rgba(0,0,0,.4);overflow:hidden;display:flex;flex-direction:column;max-height:94vh}
.sa-head{display:flex;align-items:center;gap:14px;padding:18px 22px;background:linear-gradient(135deg,#5b6ef5,#7d4fe0);color:#fff}
.sa-head-main{display:flex;align-items:center;gap:14px;flex:1;min-width:0}
.sa-avatar{width:52px;height:52px;border-radius:14px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.1rem;flex:0 0 auto}
.sa-title{font-size:1.25rem;font-weight:800;line-height:1.2}
.sa-sub{font-size:.82rem;opacity:.92;margin-top:2px;word-break:break-word}
.sa-meta{opacity:.8}
.sa-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#9aa3c7;margin-right:2px}
.sa-dot.online{background:#4ade80;box-shadow:0 0 0 3px rgba(74,222,128,.3)}
.sa-close{background:rgba(255,255,255,.16);border:none;color:#fff;width:38px;height:38px;border-radius:10px;font-size:1.1rem;cursor:pointer;flex:0 0 auto}
.sa-close:hover{background:rgba(255,255,255,.28)}
.sa-tabs{display:flex;gap:4px;padding:10px 16px 0;background:#eef1f8;overflow-x:auto}
.sa-tab{border:none;background:transparent;padding:10px 16px;font-weight:700;font-size:.9rem;color:#5b6480;cursor:pointer;border-radius:10px 10px 0 0;white-space:nowrap}
.sa-tab.active{background:#f6f8fc;color:#5b6ef5}
.sa-body{padding:18px;overflow:auto;flex:1}
.sa-loading,.sa-empty,.sa-error{padding:40px;text-align:center;color:#7a83a3;font-weight:600}
.sa-error{color:#e2444b}
.sa-card{background:#fff;border-radius:16px;padding:16px 18px;margin-bottom:14px;box-shadow:0 2px 10px rgba(20,30,80,.05)}
.sa-card-h{font-weight:800;font-size:.98rem;margin-bottom:12px}
.sa-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
.sa-hero{display:flex;flex-direction:column;gap:6px}
.sa-hero-pct{font-size:2.6rem;font-weight:900;color:#5b6ef5;line-height:1}
.sa-hero-lbl{font-weight:700;color:#5b6480;font-size:.86rem}
.sa-hero-sub{font-size:.8rem;color:#8791b0;margin-top:4px}
.sa-subcard .sa-sub-status{font-size:1.05rem;font-weight:800;margin-bottom:6px}
.sa-subcard.ok .sa-sub-status{color:#12b76a}.sa-subcard.warn .sa-sub-status{color:#f79009}
.sa-sub-meta{font-size:.82rem;color:#8791b0}
.sa-bar{height:9px;background:#e8ebf5;border-radius:6px;overflow:hidden;margin:4px 0}
.sa-bar-fill{height:100%;background:linear-gradient(90deg,#5b6ef5,#7d4fe0);border-radius:6px;transition:width .5s}
.sa-bar-fill.green{background:linear-gradient(90deg,#12b76a,#0e9f5b)}
.sa-current .sa-cur-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.sa-cur-grid>div{background:#f4f6fc;border-radius:10px;padding:10px}
.sa-cur-grid span{display:block;font-size:.72rem;color:#8791b0;font-weight:600}
.sa-cur-grid b{font-size:1.05rem}
.sa-cur-activity{margin-top:10px;font-size:.84rem;color:#5b6480;background:#f4f6fc;padding:8px 12px;border-radius:10px}
.sa-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
.sa-stat{background:#f4f6fc;border-radius:12px;padding:12px;text-align:center}
.sa-stat-val{font-size:1.3rem;font-weight:800;color:#3a4266}
.sa-stat-lbl{font-size:.74rem;color:#8791b0;font-weight:600;margin-top:2px}
.sa-courses{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.sa-course{background:#f4f6fc;border-radius:12px;padding:12px}
.sa-course-top{display:flex;justify-content:space-between;font-size:.95rem;margin-bottom:4px}
.sa-course-meta{font-size:.76rem;color:#8791b0;margin-top:4px}
.sa-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.sa-pill{display:inline-block;padding:3px 9px;border-radius:8px;font-size:.72rem;font-weight:700;background:#e8ebf5;color:#5b6480}
.sa-pill.ok{background:#d6f5e3;color:#0e9f5b}.sa-pill.bad{background:#ffe0e0;color:#e2444b}.sa-pill.warn{background:#fff0d6;color:#b7791f}
.sa-timeline{position:relative}
.sa-tl-day{font-weight:800;font-size:.82rem;color:#8791b0;margin:14px 0 8px;text-transform:uppercase}
.sa-tl-row{display:flex;align-items:center;gap:12px;padding:5px 0}
.sa-tl-time{width:48px;font-size:.8rem;color:#8791b0;font-weight:700;flex:0 0 auto;text-align:right}
.sa-tl-dot{width:10px;height:10px;border-radius:50%;background:#c3cae0;flex:0 0 auto;position:relative}
.sa-tl-dot.g{background:#12b76a}.sa-tl-dot.r{background:#e2444b}.sa-tl-dot.p{background:#7d4fe0}
.sa-tl-label{font-size:.9rem;color:#2b3255}
.sa-tl-course{font-size:.7rem;background:#eef1f8;color:#5b6ef5;padding:1px 6px;border-radius:6px;font-weight:700}
.sa-exlist,.sa-pron-list{display:flex;flex-direction:column;gap:8px}
.sa-ex{background:#f4f6fc;border-radius:12px;overflow:hidden}
.sa-ex>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:12px 14px;flex-wrap:wrap}
.sa-ex>summary::-webkit-details-marker{display:none}
.sa-ex-title{font-weight:700;flex:1;min-width:120px}
.sa-tag{font-size:.68rem;background:#e8ebf5;color:#5b6480;padding:1px 7px;border-radius:6px;margin-left:4px}
.sa-tag.exam{background:#efe4ff;color:#7d4fe0}
.sa-ex-date{font-size:.74rem;color:#8791b0}
.sa-answers{padding:0 14px 12px;display:flex;flex-direction:column;gap:4px}
.sa-ans{display:flex;justify-content:space-between;gap:12px;font-size:.82rem;padding:5px 10px;background:#fff;border-radius:8px}
.sa-ans-q{color:#8791b0}.sa-ans-a{font-weight:600}
.sa-muted{color:#a7afca;font-size:.8rem;font-style:italic}
.sa-pron{background:#f4f6fc;border-radius:12px;padding:12px 14px;border-left:4px solid #c3cae0}
.sa-pron.ok{border-left-color:#12b76a}.sa-pron.bad{border-left-color:#e2444b}
.sa-pron-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.sa-pron-stars{color:#ffc400;font-size:1rem;letter-spacing:1px}
.sa-pron-score{font-weight:800}
.sa-pron-date{font-size:.74rem;color:#8791b0;margin-left:auto}
.sa-pron-words{display:flex;gap:16px;flex-wrap:wrap;font-size:.85rem;margin-bottom:6px}
.sa-pron-exp{color:#5b6480}.sa-pron-rec{color:#2b3255;font-weight:600}
.sa-pron-metrics{display:flex;gap:14px;flex-wrap:wrap;font-size:.78rem;color:#8791b0}
.sa-pron-fb{margin-top:6px;font-size:.82rem;color:#5b6ef5;font-weight:600}
.btn-analytics{background:linear-gradient(135deg,#5b6ef5,#7d4fe0);color:#fff;border:none}
.btn-analytics:hover{filter:brightness(1.08)}
@media(max-width:720px){.sa-grid-2{grid-template-columns:1fr}.sa-current .sa-cur-grid{grid-template-columns:repeat(2,1fr)}}
`;
    document.head.appendChild(s);
}

// Initialise Student Analytics LAST — every module-level variable it touches
// (_saOverlay, _saData, _saTab) and every helper it uses are now declared and
// initialized above, so this runs outside the temporal dead zone.
initStudentAnalytics();
