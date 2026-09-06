/* ============================================================================
 * maintenance-gate.js — the platform-wide maintenance screen.
 *
 * ONE file, one <script> line per page. It runs before the page paints, asks
 * the server whether the platform is off, and either lets the page through or
 * replaces it with the maintenance screen.
 *
 * WHY IT HIDES FIRST AND ASKS SECOND
 * ----------------------------------
 * A gate that renders after the page has painted shows the learner a flash of
 * the platform they are not supposed to be using — lesson text, their own
 * progress, a half-loaded exam. So the document is hidden by the first thing
 * that executes and revealed only once the answer is known. If the answer
 * never comes (the endpoint is down, the network is gone) the page is revealed
 * anyway after a short wait: an unreachable status endpoint must not become an
 * outage of its own.
 *
 * WHY A DEVELOPER STILL SEES THE PLATFORM
 * ---------------------------------------
 * The mode exists so that a developer can work on a platform nobody else is
 * touching. Their role lives in Firestore and takes a moment to resolve, so
 * the screen goes up first and comes down again if the viewer turns out to be
 * a developer — the opposite order would flash the platform at everyone.
 *
 * The screen is presentation. The rule is on the server: while the mode is on,
 * a learner's write is refused with 503 MAINTENANCE_MODE whatever page, tab or
 * script it comes from.
 * ==========================================================================*/
(function (global) {
    'use strict';

    var STATUS_URL = '/api/maintenance?action=status';
    var REVEAL_TIMEOUT_MS = 4000;      /* never hide the platform longer than this */
    var POLL_MS = 20000;               /* while the screen is up, ask again */
    var HIDE_ID = 'uzm-hide';

    var doc = global.document;
    if (!doc) return;

    /* ------------------------------------------------------------- hide now */

    function hideDocument() {
        if (doc.getElementById(HIDE_ID)) return;
        var style = doc.createElement('style');
        style.id = HIDE_ID;
        /* visibility, not display: the page keeps its layout and scripts keep
           running, so revealing costs no reflow and nothing re-initialises */
        style.textContent = 'html.uzm-checking body{visibility:hidden!important}';
        (doc.head || doc.documentElement).appendChild(style);
        doc.documentElement.classList.add('uzm-checking');
    }

    function revealDocument() {
        doc.documentElement.classList.remove('uzm-checking');
    }

    hideDocument();
    var revealTimer = global.setTimeout(revealDocument, REVEAL_TIMEOUT_MS);

    /* --------------------------------------------------------- the screen */

    var COPY = {
        title: 'Platformada texnik ishlar olib borilmoqda',
        body: 'UzdaRus platformasini yanada yaxshilash uchun vaqtinchalik texnik '
            + 'ishlar olib boryapmiz. Tez orada yana o‘qishni davom ettira olasiz.',
        calmTitle: 'Xavotir olmang',
        calm: 'Texnik ishlar davomida obunangiz kunlari hisoblanmaydi. O‘quv '
            + 'natijalaringiz, tugallangan mavzularingiz va barcha yutuqlaringiz '
            + 'xavfsiz saqlanadi.',
        auto: 'Texnik ishlar yakunlangach, ushbu sahifa avtomatik yangilanadi.',
        check: 'Holatni tekshirish',
        checking: 'Tekshirilmoqda…'
    };

    var CSS = [
        '.uzm-screen{position:fixed;inset:0;z-index:2147483000;overflow-y:auto;',
        '  background:#FFF8E1;color:#1F2430;',
        '  font-family:inherit;display:flex;align-items:center;justify-content:center;',
        '  padding:24px 16px;padding-bottom:max(24px,calc(env(safe-area-inset-bottom) + 16px));',
        '  -webkit-font-smoothing:antialiased;color-scheme:light}',
        '.uzm-card{width:100%;max-width:560px;background:#FFFFFF;border:1px solid #E4E7F2;',
        '  border-radius:22px;box-shadow:0 10px 40px rgba(31,36,48,.08);padding:32px 24px;text-align:center}',
        '.uzm-logo{font-size:1.6rem;font-weight:900;letter-spacing:-.02em;margin:0 0 22px}',
        '.uzm-logo b{color:#F59E0B}.uzm-logo i{font-style:normal;color:#0F5C8C}',
        '.uzm-gears{display:flex;justify-content:center;align-items:center;gap:6px;margin:0 0 20px}',
        '.uzm-gear{width:46px;height:46px;animation:uzmSpin 6s linear infinite;color:#5B4BC4}',
        '.uzm-gear.two{width:32px;height:32px;color:#0B7A54;animation-direction:reverse;animation-duration:4.5s}',
        '@keyframes uzmSpin{to{transform:rotate(360deg)}}',
        '.uzm-h1{margin:0 0 12px;font-size:clamp(1.2rem,4.6vw,1.6rem);font-weight:800;line-height:1.3}',
        '.uzm-p{margin:0 0 18px;font-size:1rem;line-height:1.6;color:#4A5163;overflow-wrap:break-word}',
        '.uzm-calm{margin:0 0 18px;padding:16px 18px;border-radius:16px;text-align:left;',
        '  background:#E9F9F1;border:1px solid #BCE9D4;color:#0B5D46}',
        '.uzm-calm h2{margin:0 0 6px;font-size:1rem;font-weight:800}',
        '.uzm-calm p{margin:0;font-size:.97rem;line-height:1.55}',
        '.uzm-reason{margin:0 0 18px;padding:14px 16px;border-radius:14px;text-align:left;',
        '  background:#FFF7E8;border:1px solid #F1DFB4;color:#7A5713;font-size:.97rem;line-height:1.55}',
        '.uzm-auto{margin:0 0 20px;font-size:.92rem;color:#5A6178}',
        '.uzm-btn{min-height:48px;min-width:160px;padding:13px 26px;border:none;border-radius:14px;',
        '  cursor:pointer;font-family:inherit;font-size:1rem;font-weight:800;color:#fff;',
        '  background:linear-gradient(135deg,#3F51B5,#4A5CB8)}',
        '.uzm-btn[disabled]{opacity:.65;cursor:progress}',
        '.uzm-btn:focus-visible{outline:3px solid #1F2430;outline-offset:3px}',
        '.uzm-staff{position:fixed;left:0;right:0;bottom:0;z-index:2147482000;',
        '  background:#5B4BC4;color:#fff;font-family:inherit;font-size:.92rem;font-weight:700;',
        '  padding:10px 16px;padding-bottom:max(10px,calc(env(safe-area-inset-bottom) + 6px));',
        '  display:flex;gap:12px;align-items:center;justify-content:center;text-align:center}',
        '.uzm-staff a{color:#fff;font-weight:800}',
        '.uzm-staff-link{margin:16px 0 0}',
        '.uzm-link{background:none;border:none;padding:10px 12px;min-height:44px;cursor:pointer;',
        '  font-family:inherit;font-size:.95rem;font-weight:700;color:#3F51B5;text-decoration:underline}',
        '.uzm-link:focus-visible{outline:3px solid #1F2430;outline-offset:2px}',
        '@media (prefers-reduced-motion: reduce){.uzm-gear{animation:none}}'
    ].join('\n');

    function gear(cls) {
        return '<svg class="uzm-gear ' + (cls || '') + '" viewBox="0 0 24 24" fill="currentColor" '
            + 'aria-hidden="true" focusable="false"><path d="M19.14 12.94a7.6 7.6 0 0 0 .05-.94 7.6 7.6 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.62l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.86a.5.5 0 0 0 .12.62l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.62l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.62l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5Z"/></svg>';
    }

    /** Is this the sign-in page, which must stay reachable? */
    function isLoginPage() {
        try {
            var tag = doc.currentScript || doc.querySelector('script[data-uzm-page]');
            if (tag && tag.getAttribute('data-uzm-page') === 'login') return true;
        } catch (e) { /* currentScript is unavailable in some embeddings */ }
        /* the form itself lives in the cabinet; auth.html only forwards to it */
        return /\/my\.cabinet\/index\.html$|\/my\.cabinet\/?$/i.test(global.location.pathname);
    }

    function esc(v) {
        return String(v === null || v === undefined ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    var screenEl = null;

    function showScreen(state) {
        if (screenEl) {
            updateReason(state);
            return;
        }
        if (!doc.getElementById('uzm-style')) {
            var st = doc.createElement('style');
            st.id = 'uzm-style';
            st.textContent = CSS;
            (doc.head || doc.documentElement).appendChild(st);
        }
        screenEl = doc.createElement('div');
        screenEl.className = 'uzm-screen';
        screenEl.setAttribute('role', 'dialog');
        screenEl.setAttribute('aria-modal', 'true');
        screenEl.setAttribute('aria-labelledby', 'uzmTitle');
        screenEl.innerHTML =
            '<div class="uzm-card">' +
                '<p class="uzm-logo"><i>Uzda</i><b>Rus</b></p>' +
                '<div class="uzm-gears" aria-hidden="true">' + gear('') + gear('two') + '</div>' +
                '<h1 class="uzm-h1" id="uzmTitle">' + esc(COPY.title) + '</h1>' +
                '<p class="uzm-p">' + esc(COPY.body) + '</p>' +
                '<div class="uzm-reason" data-uzm="reason" hidden></div>' +
                '<div class="uzm-calm"><h2>' + esc(COPY.calmTitle) + '</h2>' +
                    '<p>' + esc(COPY.calm) + '</p></div>' +
                '<p class="uzm-auto">' + esc(COPY.auto) + '</p>' +
                '<button type="button" class="uzm-btn" data-uzm="check">' + esc(COPY.check) + '</button>' +
                (isLoginPage()
                    ? '<p class="uzm-staff-link"><button type="button" class="uzm-link" '
                      + 'data-uzm="staff">Xodimlar uchun kirish</button></p>'
                    : '') +
            '</div>';
        doc.documentElement.classList.add('uzm-on');
        (doc.body || doc.documentElement).appendChild(screenEl);
        revealDocument();

        var btn = screenEl.querySelector('[data-uzm="check"]');
        btn.addEventListener('click', function () {
            if (btn.disabled) return;
            btn.disabled = true;
            btn.textContent = COPY.checking;
            check(true).then(function () {
                btn.disabled = false;
                btn.textContent = COPY.check;
            });
        });
        var staff = screenEl.querySelector('[data-uzm="staff"]');
        if (staff) {
            /* THE WAY BACK IN. Every protected surface is gated, and every
               learner write is refused by the server, so the sign-in form
               itself grants nothing — but it is the only way a signed-out
               developer can reach the switch that lifts the mode. Hiding it
               behind a secret would make the platform unrecoverable; leaving it
               visible costs nothing, because signing in during maintenance
               lands on a page that is still gated. */
            staff.addEventListener('click', function () { hideScreen(); });
        }
        btn.focus();
        updateReason(state);
    }

    function updateReason(state) {
        if (!screenEl) return;
        var box = screenEl.querySelector('[data-uzm="reason"]');
        var text = state && state.reason ? String(state.reason) : '';
        if (text) { box.textContent = text; box.hidden = false; }
        else { box.textContent = ''; box.hidden = true; }
    }

    function hideScreen() {
        if (!screenEl) return;
        screenEl.remove();
        screenEl = null;
        doc.documentElement.classList.remove('uzm-on');
        revealDocument();
    }

    function showStaffBanner(state) {
        if (doc.querySelector('.uzm-staff')) return;
        if (!doc.getElementById('uzm-style')) {
            var st = doc.createElement('style');
            st.id = 'uzm-style';
            st.textContent = CSS;
            (doc.head || doc.documentElement).appendChild(st);
        }
        var bar = doc.createElement('div');
        bar.className = 'uzm-staff';
        bar.setAttribute('role', 'status');
        bar.textContent = '🛠 Texnik rejim yoqilgan — platforma faqat siz uchun ochiq.';
        (doc.body || doc.documentElement).appendChild(bar);
    }

    /* -------------------------------------------------------------- state */

    var lastVersion = null;
    var pollTimer = null;

    function fetchState() {
        if (typeof global.fetch !== 'function') return Promise.resolve(null);
        return global.fetch(STATUS_URL, { cache: 'no-store', credentials: 'omit' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) { return j && j.ok ? j.maintenance : null; })
            .catch(function () { return null; });
    }

    /** The viewer's role, if the platform's own client has already resolved it. */
    function viewerRole() {
        try {
            var p = global.UZ_PROFILE || global.currentUserProfile || null;
            if (p && p.role) return String(p.role).toLowerCase();
            var raw = global.localStorage && global.localStorage.getItem('currentUser');
            if (raw) {
                var u = JSON.parse(raw);
                if (u && u.role) return String(u.role).toLowerCase();
            }
        } catch (e) { /* storage may be unavailable; that is not an error here */ }
        return null;
    }

    function isDeveloper() {
        return viewerRole() === 'developer';
    }

    function apply(state) {
        if (global.UzFirebaseClient && typeof global.UzFirebaseClient.setMaintenanceState === 'function') {
            global.UzFirebaseClient.setMaintenanceState(state);
        }
        global.UZ_MAINTENANCE = state;

        if (!state || !state.active) {
            var wasOn = !!screenEl;
            hideScreen();
            stopPoll();
            if (wasOn) {
                /* the platform came back: return the learner to what they asked
                   for, which is the page they are already on */
                global.location.reload();
            }
            return;
        }

        if (isDeveloper()) {
            hideScreen();
            revealDocument();
            showStaffBanner(state);
            return;
        }

        lastVersion = state.version;
        showScreen(state);
        startPoll();
    }

    function check(force) {
        return fetchState().then(function (state) {
            global.clearTimeout(revealTimer);
            apply(state);
            if (!state || !state.active) revealDocument();
            return state;
        });
    }

    function startPoll() {
        if (pollTimer) return;
        /* a calm heartbeat, and only while the screen is up — never a tight
           loop and never a timer left running on a working platform */
        pollTimer = global.setInterval(function () {
            if (doc.hidden) return;
            check(false);
        }, POLL_MS);
    }

    function stopPoll() {
        if (!pollTimer) return;
        global.clearInterval(pollTimer);
        pollTimer = null;
    }

    global.UzMaintenanceGate = {
        check: check,
        apply: apply,
        showScreen: showScreen,
        hideScreen: hideScreen,
        isDeveloper: isDeveloper,
        state: function () { return global.UZ_MAINTENANCE || null; }
    };

    check(false);
})(typeof window !== 'undefined' ? window : this);
