/* ============================================================================
 * exercise-cards.js — a grid of exercise cards, one per exercise.
 *
 * The topic screen lists its exercises as cards ("1-mashq", "2-mashq", …).
 * Tapping one opens that exercise; finishing it returns here with the card
 * updated. This is the alternative to the single practice card the session
 * engine mounts by default, for courses that want every exercise addressable.
 *
 * Generic on purpose: it knows nothing about any course, lesson or scoring
 * rule. It renders whatever groups it is handed and reports which one was
 * tapped. Progress shown on a card comes from the host, which is the only
 * thing that knows how that course scores.
 *
 *   UzExerciseCards.mount({
 *       mountEl,                       where to render
 *       groups,                        [{ id, title, items:[…] }]
 *       title?, subtitle?,             heading above the grid
 *       stateOf(group, index)          -> { done, correct, total } | null
 *       onOpen(index, group)           tapped
 *   })  -> { refresh(), destroy() }
 * ==========================================================================*/
(function (global) {
    'use strict';

    if (global.UzExerciseCards) return;

    var STYLE_ID = 'uz-cards-styles';

    var C = {
        RADIUS: 16,
        GAP: 14,
        MIN_WIDTH: 240,
        HOVER_LIFT: 3
    };

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var st = document.createElement('style');
        st.id = STYLE_ID;
        st.textContent = [
            '.uzc{--c-ink:#1F2430;--c-dim:#6B7688;--c-line:#E6EAF2;--c-primary:#3B3F8F;',
            '--c-accent:#6C63FF;--c-ok:#1F8A5B;--c-tint:#F7F9FC}',
            '.uzc-head{margin:8px 0 16px}',
            '.uzc-head h3{margin:0 0 6px;font-size:1.25rem;font-weight:800;color:var(--c-ink,#1F2430)}',
            '.uzc-head p{margin:0;color:var(--c-dim,#6B7688);font-size:.97rem;line-height:1.6}',

            '.uzc-grid{display:grid;gap:' + C.GAP + 'px;margin:0 0 8px;',
            'grid-template-columns:repeat(auto-fill,minmax(' + C.MIN_WIDTH + 'px,1fr))}',

            '.uzc-card{position:relative;display:flex;flex-direction:column;gap:10px;text-align:left;',
            'background:#fff;border:1px solid var(--c-line,#E6EAF2);border-radius:' + C.RADIUS + 'px;',
            'padding:18px 20px;cursor:pointer;font-family:inherit;',
            'box-shadow:0 1px 2px rgba(16,24,40,.04);',
            'transition:transform .2s,box-shadow .22s,border-color .22s}',
            '@media(hover:hover){.uzc-card:hover{transform:translateY(-' + C.HOVER_LIFT + 'px);',
            'border-color:#C7D9FF;box-shadow:0 10px 26px rgba(59,63,143,.12)}}',
            '.uzc-card:active{transform:translateY(0)}',
            '.uzc-card.done{border-color:#BCE9D4;background:linear-gradient(180deg,#fff,#F6FCF9)}',

            '.uzc-top{display:flex;align-items:center;gap:10px}',
            '.uzc-num{flex:none;width:32px;height:32px;border-radius:10px;font-weight:800;font-size:.9rem;',
            'display:flex;align-items:center;justify-content:center;color:#fff;',
            'background:linear-gradient(135deg,var(--c-accent,#6C63FF),var(--c-primary,#3B3F8F));',
            'box-shadow:0 2px 8px rgba(59,63,143,.26)}',
            '.uzc-card.done .uzc-num{background:linear-gradient(135deg,#34C77B,#1F8A5B);',
            'box-shadow:0 2px 8px rgba(31,138,91,.26)}',
            '.uzc-name{flex:1;min-width:0;font-weight:700;font-size:1rem;color:var(--c-ink,#1F2430);',
            'line-height:1.35;overflow-wrap:break-word;word-break:normal;hyphens:none}',

            '.uzc-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;',
            'font-size:.86rem;color:var(--c-dim,#6B7688)}',
            '.uzc-badge{padding:3px 10px;border-radius:999px;font-weight:700;font-size:.8rem}',
            '.uzc-badge.todo{background:var(--c-tint,#F7F9FC);color:#5B6478;border:1px solid #E2E7F1}',
            '.uzc-badge.done{background:#E4F8EE;color:var(--c-ok,#1F8A5B);border:1px solid #BCE9D4}',
            '.uzc-bar{height:6px;border-radius:4px;background:#EEF1F7;overflow:hidden}',
            '.uzc-bar i{display:block;height:100%;border-radius:4px;background:#34C77B;',
            'transition:width .5s cubic-bezier(.22,1,.36,1)}',
            '.uzc-go{margin-left:auto;color:var(--c-accent,#6C63FF);font-weight:800;font-size:1.1rem;',
            'transition:transform .2s}',
            '@media(hover:hover){.uzc-card:hover .uzc-go{transform:translateX(3px)}}',

            '@media(prefers-reduced-motion:reduce){',
            '.uzc-card,.uzc-go,.uzc-bar i{transition:none!important}}',
            '@media(max-width:640px){',
            '.uzc-grid{grid-template-columns:1fr;gap:12px}',
            '.uzc-card{padding:16px}}'
        ].join('');
        (document.head || document.documentElement).appendChild(st);
    }

    /** Groups with no answerable items are shown but never scored. */
    function itemCount(g) {
        return (g && Array.isArray(g.items)) ? g.items.length : 0;
    }

    function cardHtml(g, i, state) {
        var total = itemCount(g);
        var done = !!(state && state.done);
        var correct = state ? (state.correct || 0) : 0;
        var pct = (done && total) ? Math.round((correct / total) * 100) : 0;

        var badge = done
            ? '<span class="uzc-badge done">' + correct + ' / ' + total + '</span>'
            : '<span class="uzc-badge todo">' + total + ' ta savol</span>';

        return '<button type="button" class="uzc-card' + (done ? ' done' : '') + '" ' +
               'data-uzc-open="' + i + '">' +
               '<span class="uzc-top">' +
                   '<span class="uzc-num">' + (done ? '&#10003;' : (i + 1)) + '</span>' +
                   '<span class="uzc-name">' + esc(g.title || ('Mashq ' + (i + 1))) + '</span>' +
                   '<span class="uzc-go">&#8250;</span>' +
               '</span>' +
               '<span class="uzc-meta">' + badge + '</span>' +
               (done ? '<span class="uzc-bar"><i style="width:' + pct + '%"></i></span>' : '') +
               '</button>';
    }

    function mount(cfg) {
        if (!cfg || !cfg.mountEl || !Array.isArray(cfg.groups) || !cfg.groups.length) return null;
        injectStyles();

        var el = cfg.mountEl;
        var stateOf = typeof cfg.stateOf === 'function' ? cfg.stateOf : function () { return null; };

        function render() {
            var cards = cfg.groups.map(function (g, i) {
                return cardHtml(g, i, stateOf(g, i));
            }).join('');
            el.innerHTML =
                '<div class="uzc">' +
                (cfg.title || cfg.subtitle
                    ? '<div class="uzc-head">' +
                      (cfg.title ? '<h3>' + esc(cfg.title) + '</h3>' : '') +
                      (cfg.subtitle ? '<p>' + esc(cfg.subtitle) + '</p>' : '') +
                      '</div>'
                    : '') +
                '<div class="uzc-grid">' + cards + '</div>' +
                '</div>';
        }

        function onClick(e) {
            var btn = e.target && e.target.closest ? e.target.closest('[data-uzc-open]') : null;
            if (!btn || !el.contains(btn)) return;
            var i = parseInt(btn.getAttribute('data-uzc-open'), 10);
            if (!isFinite(i) || !cfg.groups[i]) return;
            if (typeof cfg.onOpen === 'function') cfg.onOpen(i, cfg.groups[i]);
        }

        render();
        el.addEventListener('click', onClick);

        return {
            refresh: render,
            destroy: function () {
                el.removeEventListener('click', onClick);
                el.innerHTML = '';
            }
        };
    }

    global.UzExerciseCards = { VERSION: 1, CONST: C, mount: mount, injectStyles: injectStyles };
})(typeof window !== 'undefined' ? window : this);
