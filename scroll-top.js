/* ====================================================================
   FLOATING SCROLL-TO-TOP BUTTON  (Phase 7) — standalone include
   --------------------------------------------------------------------
   Identical, self-contained, idempotent implementation used on pages
   that do NOT load course-global-fixes.js (e.g. the vocabulary pages).
   The window guard makes it safe even if both files load together.
   ==================================================================== */
(function () {
    'use strict';
    if (window.__uzScrollTopInit) return;
    window.__uzScrollTopInit = true;

    function init() {
        if (!document.body || document.getElementById('uzScrollTopBtn')) return;

        var style = document.createElement('style');
        style.id = 'uz-scrolltop-style';
        style.textContent =
            '#uzScrollTopBtn{position:fixed;right:20px;bottom:20px;z-index:99998;' +
            'width:48px;height:48px;border:none;border-radius:50%;cursor:pointer;' +
            'background:linear-gradient(135deg,#ff9800,#f57c00);color:#fff;' +
            'font-size:22px;line-height:1;display:flex;align-items:center;justify-content:center;' +
            'box-shadow:0 6px 18px rgba(0,0,0,.28);opacity:0;visibility:hidden;' +
            'transform:translateY(12px);transition:opacity .25s ease,transform .25s ease,visibility .25s;}' +
            '#uzScrollTopBtn.show{opacity:1;visibility:visible;transform:translateY(0);}' +
            '#uzScrollTopBtn:hover{filter:brightness(1.05);transform:translateY(-2px);}' +
            '#uzScrollTopBtn:active{transform:translateY(0);}' +
            '@media(max-width:600px){#uzScrollTopBtn{right:14px;bottom:14px;width:44px;height:44px;font-size:20px;}}' +
            '@media print{#uzScrollTopBtn{display:none!important;}}';
        (document.head || document.documentElement).appendChild(style);

        var btn = document.createElement('button');
        btn.id = 'uzScrollTopBtn';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Yuqoriga');
        btn.title = 'Yuqoriga';
        btn.innerHTML = '↑';
        btn.addEventListener('click', function () {
            try { window.scrollTo({ top: 0, behavior: 'smooth' }); }
            catch (e) { window.scrollTo(0, 0); }
        });
        document.body.appendChild(btn);

        var ticking = false;
        function update() {
            ticking = false;
            var y = window.pageYOffset || document.documentElement.scrollTop || 0;
            if (y > 300) btn.classList.add('show'); else btn.classList.remove('show');
        }
        window.addEventListener('scroll', function () {
            if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
        }, { passive: true });
        update();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
