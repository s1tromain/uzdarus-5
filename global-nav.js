/* ====================================================================
   UZDARUS — GLOBAL NAVIGATION SIDEBAR  (navigation/UX only)
   --------------------------------------------------------------------
   A reusable, collapsible sidebar drawer shared by every learning page.
   Replaces the old floating button dock so navigation no longer covers
   lesson content on mobile.

   CLOSED  → a slim vertical tab pinned to the left edge, vertically
             centred and always visible (tiny footprint).
   OPEN    → a glass drawer slides in from the left (transform/translateX,
             ~300ms) with the contextual actions + a universal back button.

   The page still drives everything through the same per-page config, so
   NO page markup changes are needed — updating this one file updates all
   pages automatically:

     <script>
       window.UZN_NAV = {
         back: "a1-course.html",                 // fallback parent URL
         buttons: [
           { label: "Mavzular",        icon: "📚", href: "#topics" },
           { label: "Shaxsiy kabinet", icon: "🏠", href: "../my.cabinet/dashboard.html" }
         ]
       };
     </script>
     <script defer src="global-nav.js"></script>

   Self-contained, idempotent and fail-soft: it only ADDS UI and never
   touches auth, subscription, progress, exams, course or vocabulary logic.
   UzdaRus orange accents (#FF9800 / #F57C00) for a native, premium feel.
   ==================================================================== */
(function () {
    'use strict';

    // Idempotent — safe even if the script is included twice.
    if (window.__uznNavInit) return;
    window.__uznNavInit = true;

    var CFG = window.UZN_NAV || {};

    function injectStyles() {
        if (document.getElementById('uzn-nav-style')) return;
        var css =
            "#uznNavRoot{font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;}" +

            /* ---- CLOSED: slim edge tab ---- */
            '.uzn-tab{position:fixed;left:0;top:50%;transform:translateY(-50%);z-index:9000;' +
            'width:30px;height:62px;border:none;cursor:pointer;padding:0;' +
            'background:linear-gradient(135deg,#FF9800,#F57C00);color:#fff;' +
            'border-radius:0 14px 14px 0;box-shadow:2px 3px 14px rgba(0,0,0,.28);' +
            'display:flex;align-items:center;justify-content:center;' +
            'transition:transform .3s cubic-bezier(.4,0,.2,1),opacity .3s ease,width .2s ease;}' +
            '.uzn-tab:hover{filter:brightness(1.07);width:34px;}' +
            '.uzn-tab:focus-visible{outline:3px solid rgba(245,124,0,.6);outline-offset:2px;}' +
            '.uzn-tab svg{width:16px;height:16px;display:block;}' +

            /* ---- Backdrop scrim (tap to close) ---- */
            '.uzn-scrim{position:fixed;inset:0;z-index:9001;background:rgba(15,23,42,.45);' +
            '-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);' +
            'opacity:0;visibility:hidden;transition:opacity .3s ease,visibility .3s ease;}' +

            /* ---- OPEN: glass drawer ---- */
            '.uzn-drawer{position:fixed;top:0;left:0;height:100%;width:248px;max-width:82vw;' +
            'z-index:9002;transform:translateX(-100%);' +
            'transition:transform .3s cubic-bezier(.4,0,.2,1);' +
            'background:linear-gradient(160deg,rgba(255,255,255,.92),rgba(255,248,225,.94));' +
            '-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);' +
            'border-right:1px solid rgba(245,124,0,.25);border-radius:0 22px 22px 0;' +
            'box-shadow:8px 0 44px rgba(0,0,0,.28);' +
            'display:flex;flex-direction:column;padding:16px 14px;' +
            'box-sizing:border-box;}' +

            /* open-state toggles */
            '#uznNavRoot.open .uzn-drawer{transform:translateX(0);}' +
            '#uznNavRoot.open .uzn-scrim{opacity:1;visibility:visible;}' +
            '#uznNavRoot.open .uzn-tab{transform:translateY(-50%) translateX(-130%);opacity:0;pointer-events:none;}' +

            /* drawer header */
            '.uzn-head{display:flex;align-items:center;justify-content:space-between;' +
            'margin:2px 4px 14px;}' +
            '.uzn-title{font-weight:800;font-size:1.02rem;color:#F57C00;letter-spacing:.02em;}' +
            '.uzn-close{width:38px;height:38px;border:none;border-radius:50%;cursor:pointer;' +
            'background:rgba(245,124,0,.12);color:#F57C00;font-size:17px;line-height:1;' +
            'display:flex;align-items:center;justify-content:center;' +
            'transition:background .2s ease,transform .25s ease;}' +
            '.uzn-close:hover{background:rgba(245,124,0,.22);transform:rotate(90deg);}' +
            '.uzn-close:focus-visible{outline:3px solid rgba(245,124,0,.6);outline-offset:2px;}' +

            /* menu items */
            '.uzn-menu{display:flex;flex-direction:column;gap:8px;margin-top:4px;flex:1;}' +
            '.uzn-item{display:flex;align-items:center;gap:12px;text-decoration:none;cursor:pointer;' +
            'background:transparent;border:none;width:100%;text-align:left;box-sizing:border-box;' +
            'padding:14px 14px;border-radius:14px;font-size:1rem;font-weight:600;font-family:inherit;' +
            'color:#3a2f25;transition:background .2s ease,transform .15s ease,color .2s ease;}' +
            '.uzn-item:hover{background:rgba(245,124,0,.12);transform:translateX(3px);color:#E65100;}' +
            '.uzn-item:active{transform:translateX(1px) scale(.99);}' +
            '.uzn-item:focus-visible{outline:3px solid rgba(245,124,0,.55);outline-offset:2px;}' +
            '.uzn-item .uzn-ic{font-size:1.18rem;width:26px;text-align:center;flex:none;}' +
            '.uzn-item-back{margin-top:auto;background:linear-gradient(135deg,#FF9800,#F57C00);' +
            'color:#fff;justify-content:center;box-shadow:0 6px 16px rgba(245,124,0,.32);}' +
            '.uzn-item-back:hover{filter:brightness(1.06);transform:translateX(0);' +
            'background:linear-gradient(135deg,#FF9800,#F57C00);color:#fff;}' +

            /* narrow phones */
            '@media(max-width:380px){.uzn-drawer{width:230px;}.uzn-item{padding:13px 12px;}}' +

            /* respect reduced-motion + print */
            '@media(prefers-reduced-motion:reduce){' +
            '.uzn-tab,.uzn-scrim,.uzn-drawer,.uzn-item,.uzn-close{transition:none!important;}}' +
            '@media print{#uznNavRoot{display:none!important;}}';
        var s = document.createElement('style');
        s.id = 'uzn-nav-style';
        s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
    }

    /* Smart back: if the user reached this page from another platform page,
       go back to it; otherwise fall back to the configured parent page so a
       fresh/deep-linked visit is never a dead end. */
    function smartBack() {
        var fallback = CFG.back || '';
        var sameOrigin = false;
        try {
            var ref = document.referrer;
            sameOrigin = !!ref && new URL(ref).origin === window.location.origin;
        } catch (e) { /* ignore malformed referrer */ }

        if (sameOrigin && window.history.length > 1) {
            window.history.back();
        } else if (fallback) {
            window.location.href = fallback;
        } else if (window.history.length > 1) {
            window.history.back();
        }
    }

    var CHEVRON =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" ' +
        'stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function build() {
        if (!document.body || document.getElementById('uznNavRoot')) return;
        injectStyles();

        var root = document.createElement('div');
        root.id = 'uznNavRoot';

        /* slim edge tab (closed state) */
        var tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'uzn-tab';
        tab.id = 'uznTab';
        tab.setAttribute('aria-label', 'Navigatsiyani ochish');
        tab.setAttribute('aria-expanded', 'false');
        tab.setAttribute('aria-controls', 'uznDrawer');
        tab.innerHTML = CHEVRON;

        /* scrim */
        var scrim = document.createElement('div');
        scrim.className = 'uzn-scrim';
        scrim.id = 'uznScrim';

        /* drawer (open state) */
        var drawer = document.createElement('aside');
        drawer.className = 'uzn-drawer';
        drawer.id = 'uznDrawer';
        drawer.setAttribute('role', 'dialog');
        drawer.setAttribute('aria-modal', 'true');
        drawer.setAttribute('aria-label', 'Navigatsiya');
        drawer.setAttribute('aria-hidden', 'true');

        var head = document.createElement('div');
        head.className = 'uzn-head';
        var title = document.createElement('span');
        title.className = 'uzn-title';
        title.textContent = 'Navigatsiya';
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'uzn-close';
        closeBtn.id = 'uznClose';
        closeBtn.setAttribute('aria-label', 'Yopish');
        closeBtn.innerHTML = '&#10005;'; // ✕
        head.appendChild(title);
        head.appendChild(closeBtn);

        var menu = document.createElement('nav');
        menu.className = 'uzn-menu';
        menu.setAttribute('aria-label', 'Sahifa navigatsiyasi');

        // Contextual actions from the per-page config (e.g. Mavzular, Shaxsiy kabinet).
        (CFG.buttons || []).forEach(function (b) {
            if (!b || !b.href) return;
            var a = document.createElement('a');
            a.className = 'uzn-item';
            a.href = b.href;
            a.innerHTML = '<span class="uzn-ic">' + (b.icon || '') + '</span>' +
                '<span class="uzn-tx">' + (b.label || '') + '</span>';
            // Hash links (e.g. #topics) don't unload the page, so close after click.
            a.addEventListener('click', closeSidebar);
            menu.appendChild(a);
        });

        // Universal back button — pinned to the bottom of the drawer.
        var back = document.createElement('button');
        back.type = 'button';
        back.className = 'uzn-item uzn-item-back';
        back.setAttribute('aria-label', 'Orqaga qaytish');
        back.innerHTML = '<span class="uzn-ic">&#8592;</span><span class="uzn-tx">Orqaga</span>';
        back.addEventListener('click', smartBack);
        menu.appendChild(back);

        drawer.appendChild(head);
        drawer.appendChild(menu);

        root.appendChild(tab);
        root.appendChild(scrim);
        root.appendChild(drawer);
        document.body.appendChild(root);

        function openSidebar() {
            root.classList.add('open');
            drawer.setAttribute('aria-hidden', 'false');
            tab.setAttribute('aria-expanded', 'true');
            try { closeBtn.focus(); } catch (e) { /* ignore */ }
        }
        function closeSidebar() {
            if (!root.classList.contains('open')) return;
            root.classList.remove('open');
            drawer.setAttribute('aria-hidden', 'true');
            tab.setAttribute('aria-expanded', 'false');
            try { tab.focus(); } catch (e) { /* ignore */ }
        }

        tab.addEventListener('click', openSidebar);
        closeBtn.addEventListener('click', closeSidebar);
        scrim.addEventListener('click', closeSidebar);
        document.addEventListener('keydown', function (e) {
            if ((e.key === 'Escape' || e.keyCode === 27) && root.classList.contains('open')) {
                closeSidebar();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', build);
    } else {
        build();
    }
})();
