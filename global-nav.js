/* ====================================================================
   UZDARUS — GLOBAL NAVIGATION DOCK  (navigation/UX only)
   --------------------------------------------------------------------
   Adds a fixed, always-visible navigation cluster to every page so the
   user is never stuck at a dead end and always knows how to return:

     • "← Orqaga"  — universal back button (history.back with a safe
                     fallback to the page's parent when there is no
                     same-origin history to go back to).
     • Contextual return buttons (course / dashboard / home) supplied
       per page via the inline `window.UZN_NAV` config.

   Self-contained, idempotent and fail-soft: it only ADDS a component,
   never touches auth, subscription, progress, exams or vocabulary
   logic. Styled with the UzdaRus brand teal (#08617f, the logo "Rus")
   so it looks native across every level's colour scheme.

   Per-page usage (place just before </body>):
     <script>
       window.UZN_NAV = {
         back: "a1-course.html",                 // fallback parent URL
         buttons: [
           { label: "Shaxsiy kabinet", icon: "🏠", href: "../my.cabinet/dashboard.html" },
           { label: "Mavzular",        icon: "📚", href: "#topics" }
         ]
       };
     </script>
     <script defer src="global-nav.js"></script>
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
            '.uzn-dock{position:fixed;left:16px;bottom:16px;z-index:9000;display:flex;' +
            'flex-direction:column-reverse;gap:8px;align-items:flex-start;max-width:70vw;' +
            "font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;}" +
            '.uzn-btn{display:inline-flex;align-items:center;gap:8px;text-decoration:none;' +
            'background:linear-gradient(135deg,#0a7396,#08617f);color:#fff;border:none;' +
            'border-radius:30px;padding:11px 16px;font-size:14px;font-weight:600;' +
            'font-family:inherit;line-height:1;white-space:nowrap;cursor:pointer;' +
            'box-shadow:0 6px 18px rgba(0,0,0,.25);' +
            'transition:transform .2s ease,filter .2s ease,box-shadow .2s ease;}' +
            '.uzn-btn:hover{filter:brightness(1.08);transform:translateY(-2px);' +
            'box-shadow:0 9px 24px rgba(0,0,0,.30);color:#fff;}' +
            '.uzn-btn:active{transform:translateY(0);}' +
            '.uzn-btn:focus-visible{outline:3px solid rgba(10,115,150,.55);outline-offset:2px;}' +
            '.uzn-btn .uzn-ic{font-size:16px;line-height:1;}' +
            '.uzn-back{background:linear-gradient(135deg,#08617f,#064d63);}' +
            '@media(max-width:600px){' +
            '.uzn-dock{left:10px;bottom:10px;gap:6px;max-width:80vw;}' +
            '.uzn-btn{padding:12px 16px;font-size:14px;min-height:46px;}}' +
            /* Step aside during immersive full-screen vocabulary study screens
               (they carry their own close/return buttons) so the dock never
               overlaps their centred controls on small viewports. Pure CSS via
               :has(); on browsers without :has() the dock simply stays visible. */
            'body:has(.flashcard-screen.active) .uzn-dock,' +
            'body:has(.completion-screen.active) .uzn-dock{display:none;}' +
            '@media print{.uzn-dock{display:none!important;}}';
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

    function makeBtn(label, icon, isBack) {
        var el = isBack ? document.createElement('button') : document.createElement('a');
        el.className = 'uzn-btn' + (isBack ? ' uzn-back' : '');
        if (isBack) el.type = 'button';
        el.innerHTML = '<span class="uzn-ic">' + (icon || '') + '</span>' +
            '<span class="uzn-tx">' + (label || '') + '</span>';
        return el;
    }

    function build() {
        if (!document.body || document.getElementById('uznNavDock')) return;
        injectStyles();

        var dock = document.createElement('nav');
        dock.id = 'uznNavDock';
        dock.className = 'uzn-dock';
        dock.setAttribute('aria-label', 'Sahifa navigatsiyasi');

        // Universal back button — always first (rendered nearest the thumb on
        // mobile thanks to column-reverse).
        var back = makeBtn('Orqaga', '←', true);
        back.setAttribute('aria-label', 'Orqaga qaytish');
        back.addEventListener('click', smartBack);
        dock.appendChild(back);

        // Contextual return buttons from the per-page config.
        (CFG.buttons || []).forEach(function (b) {
            if (!b || !b.href) return;
            var a = makeBtn(b.label, b.icon, false);
            a.href = b.href;
            dock.appendChild(a);
        });

        document.body.appendChild(dock);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', build);
    } else {
        build();
    }
})();
