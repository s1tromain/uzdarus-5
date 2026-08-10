/* ============================================================================
 * sentence-builder.js — the SENTENCE BUILDER exercise component.
 *
 * A learner assembles a sentence by tapping word cards instead of typing it.
 * The component owns its markup, its styles, its animation and its feedback,
 * and it emits an ORDINARY STRING — so grading, drafts, answer-review, scoring
 * and results treat a built sentence exactly like a typed one. Nothing in the
 * session engine or in any persistence layer knows this component exists.
 *
 * ---------------------------------------------------------------------------
 * INDEPENDENT BY DESIGN
 * ---------------------------------------------------------------------------
 * It knows nothing about B2, about any lesson, or about the session engine. It
 * takes an item ({ answer: [...], explanation? }) plus an optional group config
 * ({ glue: [...] }) and does the rest. Any course wires it in the same way:
 *
 *   render :  UzSentenceBuilder.renderItem(key, item, group)  -> HTML
 *   bind   :  UzSentenceBuilder.bind(root)                    -> once per step
 *   read   :  UzSentenceBuilder.read(root, key)               -> "word word …"
 *   write  :  UzSentenceBuilder.write(root, key, value)       -> restore a draft
 *   mark   :  UzSentenceBuilder.markResult(root, key, item, group, isCorrect)
 *   reset  :  UzSentenceBuilder.clearMarks(root, key)
 *
 * ---------------------------------------------------------------------------
 * THE WORD BANK
 * ---------------------------------------------------------------------------
 * Cards are derived from EVERY accepted answer, as a multiset union: a word two
 * variants both need once appears once, a word one variant needs twice appears
 * twice. So any correct sentence can be assembled, not just the first one, and
 * leftover cards after a valid answer are expected.
 * ==========================================================================*/
(function (global) {
    'use strict';

    if (global.UzSentenceBuilder) return;

    /* -------------------------------------------------------------------
     * TUNABLES. Every number the component uses lives here — nothing is
     * written twice, and nothing has to be hunted for in a stylesheet.
     * ----------------------------------------------------------------- */
    var C = {
        ANIM_DURATION: 220,      // ms — a card's flight between bank and answer
        ANIM_CLEANUP: 400,       // ms — failsafe if transitionend never fires
        POP_DURATION: 300,       // ms — the spring on a card that does not move
        SUCCESS_DURATION: 460,   // ms — the correct-answer flourish
        TOKEN_RADIUS: 14,        // px
        TOKEN_MIN_HEIGHT: 46,    // px — equal height for every short card
        TOKEN_MIN_HEIGHT_SM: 44, // px — narrow screens
        TOKEN_GAP: 8,            // px — between cards
        TOKEN_PAD_X: 18,         // px
        TOKEN_PAD_X_SM: 14,      // px
        TOKEN_MAX_WIDTH: 320,    // px — a long card grows to here, then wraps
        OUT_MIN_HEIGHT: 74,      // px — the answer area before anything is placed
        OUT_MIN_HEIGHT_SM: 66,   // px
        RESTORE_GUARD: 80,       // max cards consumed when restoring a draft
        SPLIT_GUARD: 200         // max tokens parsed from one sentence
    };

    var STYLE_ID = 'uz-builder-styles';

    /** Wording. Kept together so a host can re-label the whole component. */
    var TEXT = {
        label: 'Ваш ответ',
        placeholder: 'Нажимайте на слова, чтобы собрать предложение',
        undo: '&#8592; Убрать последнее',
        clear: 'Очистить',
        correct: 'Верно!',
        empty: 'Соберите предложение из карточек.',
        order: 'Проверьте порядок слов.',
        conjunction: 'Обратите внимание на союз.',
        retry: 'Попробуйте ещё раз.'
    };

    /* ---------------------------------------------------------------- utils */

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function attr(s) { return esc(s).replace(/'/g, '&#39;'); }

    /* The platform's normalisation: case, ё/е, punctuation and spacing are all
       ignored, so a card reading "работаю," matches the word "работаю". */
    function norm(v) {
        return String(v == null ? '' : v)
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[.,!?;:()"'«»—–\-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /* ---------------------------------------------------------------- styles */

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var st = document.createElement('style');
        st.id = STYLE_ID;
        st.textContent = [
            '.uzb{margin-top:4px}',
            '.uzb-label{font-size:.82rem;font-weight:700;letter-spacing:.03em;',
            'text-transform:uppercase;color:#6B7688;margin-bottom:8px}',

            /* answer area — stretch so cards on one line share a height */
            '.uzb-out{position:relative;min-height:' + C.OUT_MIN_HEIGHT + 'px;display:flex;',
            'flex-wrap:wrap;align-items:stretch;align-content:flex-start;gap:' + C.TOKEN_GAP + 'px;',
            'padding:14px;border-radius:' + (C.TOKEN_RADIUS + 2) + 'px;background:#F7F9FC;',
            'border:2px dashed #D6DEEC;transition:border-color .2s,background .2s}',
            '.uzb-out.has-words{border-style:solid;border-color:#C7D9FF;background:#FBFCFF}',
            '.uzb-out.drop{border-color:#2563EB;background:#EFF4FF}',
            '.uzb-out.ok{border-color:#34C77B;background:#F1FBF6}',
            '.uzb-out.bad{border-color:#F0A0AC;background:#FEF6F7}',
            '.uzb-ph{position:absolute;left:16px;top:50%;transform:translateY(-50%);',
            'color:#9AA4B8;font-size:.95rem;pointer-events:none}',
            '.uzb-out.has-words .uzb-ph{display:none}',
            '.uzb-bank{display:flex;flex-wrap:wrap;align-items:stretch;gap:' + C.TOKEN_GAP + 'px;',
            'margin-top:14px;min-height:44px}',

            /* ---- the card ----
               flex:0 1 auto + min-width:0 means a long card shrinks instead of
               shoving its neighbours out of the row; max-width caps it and lets
               the text wrap inside, so "несмотря на то, что" — or anything
               longer a future lesson invents — stays a tidy rectangle. */
            '.uzb-tok{flex:0 1 auto;min-width:0;max-width:min(100%,' + C.TOKEN_MAX_WIDTH + 'px);',
            'font-family:inherit;font-size:1rem;font-weight:600;color:#1F2430;',
            'display:inline-flex;align-items:center;justify-content:center;text-align:center;',
            'min-height:' + C.TOKEN_MIN_HEIGHT + 'px;padding:8px ' + C.TOKEN_PAD_X + 'px;',
            'background:#fff;border:1px solid #DCE2EE;border-bottom-width:3px;',
            'border-radius:' + C.TOKEN_RADIUS + 'px;cursor:pointer;user-select:none;',
            '-webkit-tap-highlight-color:transparent;white-space:normal;overflow-wrap:break-word;',
            'word-break:normal;hyphens:none;line-height:1.35;',
            'box-shadow:0 1px 2px rgba(16,24,40,.05),0 2px 6px rgba(16,24,40,.04);',
            'transition:transform .14s cubic-bezier(.2,.85,.3,1.1),box-shadow .2s,',
            'border-color .2s,background .2s,color .2s}',
            '@media(hover:hover){.uzb-tok:hover{border-color:#2563EB;background:#F7F9FF;',
            'transform:translateY(-2px);box-shadow:0 6px 16px rgba(37,99,235,.14)}}',
            '.uzb-tok:active{transform:translateY(1px);border-bottom-width:1px;box-shadow:none}',
            '.uzb-out .uzb-tok{background:#EFF4FF;border-color:#C7D9FF;color:#1D4ED8}',
            '.uzb-tok.flying{pointer-events:none;z-index:3;position:relative;',
            'box-shadow:0 10px 24px rgba(37,99,235,.20)}',
            '.uzb-tok.dragging{opacity:.45}',
            '.uzb-tok.pop{animation:uzbPop ' + C.POP_DURATION + 'ms cubic-bezier(.2,.9,.3,1.25)}',
            '@keyframes uzbPop{0%{transform:scale(1)}40%{transform:scale(1.09) translateY(-3px)}',
            '100%{transform:scale(1)}}',

            /* ---- per-card verdict ---- */
            '.uzb-out .uzb-tok.tok-ok{background:#E4F8EE;border-color:#34C77B;color:#0B7A4B}',
            '.uzb-out .uzb-tok.tok-bad{background:#FDECEF;border-color:#EE7C8D;color:#B22740}',
            '.uzb-tok.settle{animation:uzbSettle ' + C.SUCCESS_DURATION + 'ms cubic-bezier(.2,.9,.3,1.2)}',
            '@keyframes uzbSettle{0%{transform:scale(1)}35%{transform:scale(1.06)}',
            '100%{transform:scale(1)}}',

            /* ---- success banner ---- */
            '.uzb-flash{display:flex;align-items:center;gap:10px;margin-top:12px;padding:12px 16px;',
            'border-radius:' + C.TOKEN_RADIUS + 'px;font-weight:700;font-size:.97rem;',
            'animation:uzbRise ' + C.SUCCESS_DURATION + 'ms cubic-bezier(.2,.9,.3,1.1)}',
            '.uzb-flash.ok{background:#E4F8EE;border:1px solid #A6E7C6;color:#0B7A4B}',
            '.uzb-flash.bad{background:#FDECEF;border:1px solid #F6BFC8;color:#B22740}',
            '@keyframes uzbRise{0%{opacity:0;transform:translateY(6px)}100%{opacity:1;transform:none}}',
            '.uzb-check{flex:none;width:24px;height:24px;border-radius:50%;background:#1FA971;',
            'color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:.8rem;',
            'animation:uzbStamp ' + C.SUCCESS_DURATION + 'ms cubic-bezier(.2,.9,.3,1.35)}',
            '@keyframes uzbStamp{0%{transform:scale(.3);opacity:0}55%{transform:scale(1.15);opacity:1}',
            '100%{transform:scale(1)}}',

            /* ---- actions ---- */
            '.uzb-acts{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}',
            '.uzb-btn{font-family:inherit;font-size:.9rem;font-weight:650;color:#4A5468;',
            'background:#fff;border:1px solid #DCE2EE;border-radius:10px;padding:9px 16px;',
            'cursor:pointer;transition:background .18s,border-color .18s,color .18s}',
            '.uzb-btn:hover:not([disabled]){background:#F7F9FC;border-color:#C7D9FF;color:#1D4ED8}',
            '.uzb-btn[disabled]{opacity:.45;cursor:default}',

            '@media(prefers-reduced-motion:reduce){',
            '.uzb-tok,.uzb-tok.flying,.uzb-flash,.uzb-check{',
            'transition:none!important;animation:none!important}',
            '}',
            '@media(max-width:640px){',
            '.uzb-tok{font-size:.97rem;padding:8px ' + C.TOKEN_PAD_X_SM + 'px;',
            'min-height:' + C.TOKEN_MIN_HEIGHT_SM + 'px}',
            '.uzb-out{min-height:' + C.OUT_MIN_HEIGHT_SM + 'px;padding:12px}',
            '.uzb-btn{flex:1 1 auto}',
            '}'
        ].join('');
        (document.head || document.documentElement).appendChild(st);
    }

    /* ------------------------------------------------------------ the bank */

    /**
     * Split a sentence into the cards a learner would tap. `glue` phrases stay
     * on one card; the longest match wins, so "потому что" is never split.
     */
    function split(sentence, glue) {
        var out = [], rest = String(sentence == null ? '' : sentence).trim();
        var phrases = (glue || []).slice().sort(function (a, b) { return b.length - a.length; });
        var guard = 0;
        while (rest && guard++ < C.SPLIT_GUARD) {
            rest = rest.replace(/^\s+/, '');
            if (!rest) break;
            var low = rest.toLowerCase(), hit = null;
            for (var i = 0; i < phrases.length; i++) {
                if (low.indexOf(phrases[i].toLowerCase()) === 0) { hit = phrases[i]; break; }
            }
            if (hit) { out.push(rest.slice(0, hit.length)); rest = rest.slice(hit.length); continue; }
            var m = /^\S+/.exec(rest);
            if (!m) break;
            out.push(m[0]);
            rest = rest.slice(m[0].length);
        }
        return out;
    }

    function variantsOf(item) {
        var a = item ? item.answer : null;
        return (Array.isArray(a) ? a : [a]).filter(function (v) {
            return v != null && String(v).trim() !== '';
        });
    }

    /** Multiset union of every accepted answer — see the file header. */
    function bank(item, group) {
        if (item && Array.isArray(item.tokens) && item.tokens.length) return item.tokens.slice();
        var glue = (group && group.glue) || [];
        var order = [], need = {};

        variantsOf(item).forEach(function (v) {
            var seen = {};
            split(v, glue).forEach(function (tok) {
                var k = norm(tok);
                if (!k) return;
                seen[k] = (seen[k] || 0) + 1;
                if (!order.some(function (o) { return o.key === k; })) order.push({ key: k, text: tok });
            });
            Object.keys(seen).forEach(function (k) {
                if (!need[k] || seen[k] > need[k]) need[k] = seen[k];
            });
        });

        var out = [];
        order.forEach(function (o) {
            for (var i = 0; i < (need[o.key] || 0); i++) out.push(o.text);
        });
        return out;
    }

    function shuffled(list) {
        var a = list.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    /* ---------------------------------------------------------------- render */

    function renderItem(key, item, group) {
        injectStyles();
        var cards = shuffled(bank(item, group)).map(function (t) {
            return '<button type="button" class="uzb-tok" draggable="true">' + esc(t) + '</button>';
        }).join('');
        return '<div class="uzb" data-uzb="' + attr(key) + '">' +
               '<div class="uzb-label">' + TEXT.label + '</div>' +
               '<div class="uzb-out"><span class="uzb-ph">' + TEXT.placeholder + '</span></div>' +
               '<div class="uzb-bank">' + cards + '</div>' +
               '<div class="uzb-acts">' +
               '<button type="button" class="uzb-btn" data-uzb-undo disabled>' + TEXT.undo + '</button>' +
               '<button type="button" class="uzb-btn" data-uzb-clear disabled>' + TEXT.clear + '</button>' +
               '</div></div>';
    }

    /* ------------------------------------------------------------- movement */

    function reducedMotion() {
        try {
            return !!(global.matchMedia &&
                      global.matchMedia('(prefers-reduced-motion: reduce)').matches);
        } catch (e) { return false; }
    }

    /**
     * Move a card with a real transition (FLIP): measure, move in the DOM,
     * measure again, invert the delta and animate it away. The DOM move happens
     * FIRST, so the answer string is already correct when it is read.
     */
    function moveToken(tok, target) {
        var first = tok.getBoundingClientRect ? tok.getBoundingClientRect() : null;
        target.appendChild(tok);
        if (reducedMotion() || !first || !tok.getBoundingClientRect) return;

        var last = tok.getBoundingClientRect();
        var dx = first.left - last.left, dy = first.top - last.top;
        if (!dx && !dy) { pop(tok); return; }

        tok.style.transition = 'none';
        tok.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        void tok.offsetWidth;                       // commit the inverted position
        tok.classList.add('flying');
        tok.style.transition = 'transform ' + C.ANIM_DURATION + 'ms cubic-bezier(.2,.85,.3,1.1)';
        tok.style.transform = '';

        var done = function () {
            tok.style.transition = '';
            tok.style.transform = '';
            tok.classList.remove('flying');
            tok.removeEventListener('transitionend', done);
        };
        tok.addEventListener('transitionend', done);
        setTimeout(done, C.ANIM_CLEANUP);
    }

    function pop(tok) {
        if (reducedMotion()) return;
        tok.classList.remove('pop');
        void tok.offsetWidth;
        tok.classList.add('pop');
        setTimeout(function () { tok.classList.remove('pop'); }, C.POP_DURATION + 20);
    }

    /* ------------------------------------------------------------ accessors */

    var wrapOf = function (root, key) { return root.querySelector('[data-uzb="' + key + '"]'); };
    var placed = function (wrap) { return wrap.querySelectorAll('.uzb-out .uzb-tok'); };

    function sync(wrap) {
        var out = wrap.querySelector('.uzb-out');
        var n = placed(wrap).length;
        out.classList.toggle('has-words', n > 0);
        wrap.querySelectorAll('.uzb-btn').forEach(function (b) { b.disabled = n === 0; });
    }

    function read(root, key) {
        var wrap = wrapOf(root, key);
        if (!wrap) return '';
        return Array.prototype.map.call(placed(wrap), function (t) { return t.textContent; })
            .join(' ').trim();
    }

    /**
     * Restore a saved answer. Matching is on card TEXT, longest first, so a
     * reshuffled bank still restores in the right order and "потому что" is
     * never mistaken for "что".
     */
    function write(root, key, value) {
        var wrap = wrapOf(root, key);
        if (!wrap) return;
        clearMarks(root, key);
        var out = wrap.querySelector('.uzb-out'), bnk = wrap.querySelector('.uzb-bank');
        Array.prototype.slice.call(wrap.querySelectorAll('.uzb-tok'))
            .forEach(function (t) { bnk.appendChild(t); });

        var rest = norm(value), guard = 0;
        while (rest && guard++ < C.RESTORE_GUARD) {
            var chips = Array.prototype.slice.call(bnk.querySelectorAll('.uzb-tok'))
                .sort(function (a, b) { return norm(b.textContent).length - norm(a.textContent).length; });
            var hit = null;
            for (var i = 0; i < chips.length; i++) {
                var t = norm(chips[i].textContent);
                if (!t) continue;
                if (rest === t || rest.indexOf(t + ' ') === 0) {
                    hit = chips[i];
                    rest = rest.slice(t.length).replace(/^\s+/, '');
                    break;
                }
            }
            if (!hit) break;
            out.appendChild(hit);
        }
        sync(wrap);
    }

    /* --------------------------------------------------------- verdict marks */

    function clearMarks(root, key) {
        var wrap = wrapOf(root, key);
        if (!wrap) return;
        var out = wrap.querySelector('.uzb-out');
        out.classList.remove('ok', 'bad');
        wrap.querySelectorAll('.uzb-tok').forEach(function (t) {
            t.classList.remove('tok-ok', 'tok-bad', 'settle');
        });
        var flash = wrap.querySelector('.uzb-flash');
        if (flash) flash.parentNode.removeChild(flash);
    }

    /** The accepted variant this attempt is closest to, position by position. */
    function closestVariant(words, item, group) {
        var glue = (group && group.glue) || [];
        var best = null, bestScore = -1;
        variantsOf(item).forEach(function (v) {
            var toks = split(v, glue), score = 0;
            for (var i = 0; i < Math.min(toks.length, words.length); i++) {
                if (norm(toks[i]) === norm(words[i])) score++;
            }
            if (score > bestScore) { bestScore = score; best = toks; }
        });
        return best || [];
    }

    function sameWords(a, b) {
        if (a.length !== b.length) return false;
        var pool = b.map(norm);
        return a.every(function (w) {
            var i = pool.indexOf(norm(w));
            if (i < 0) return false;
            pool.splice(i, 1);
            return true;
        });
    }

    /**
     * Why is this attempt wrong? The item's own explanation wins when it has
     * one; otherwise the diagnosis comes from the attempt itself.
     */
    function diagnose(words, item, group) {
        if (item && item.explanation) return item.explanation;
        if (!words.length) return TEXT.empty;
        var target = closestVariant(words, item, group);
        if (sameWords(words, target)) return TEXT.order;

        /* did they only get the connective wrong? */
        var glue = (group && group.glue) || [];
        var isConn = function (w) {
            var n = norm(w);
            return glue.some(function (p) { return norm(p) === n; }) ||
                   ['что', 'чтобы', 'если', 'когда', 'хотя', 'поэтому', 'но', 'то'].indexOf(n) >= 0;
        };
        var strip = function (list) { return list.filter(function (w) { return !isConn(w); }); };
        if (target.length && sameWords(strip(words), strip(target))) return TEXT.conjunction;

        return TEXT.retry;
    }

    /**
     * Show the outcome for one item: correct cards green, wrong cards red, and
     * a short message. Cards stay interactive so the learner can fix them.
     */
    function markResult(root, key, item, group, isCorrect) {
        var wrap = wrapOf(root, key);
        if (!wrap) return;
        clearMarks(root, key);

        var out = wrap.querySelector('.uzb-out');
        var cards = Array.prototype.slice.call(placed(wrap));
        var words = cards.map(function (t) { return t.textContent; });
        var reduce = reducedMotion();

        if (isCorrect) {
            out.classList.add('ok');
            cards.forEach(function (t, i) {
                t.classList.add('tok-ok');
                if (reduce) return;
                setTimeout(function () { t.classList.add('settle'); }, i * 40);
            });
            out.insertAdjacentElement('afterend', flash('ok', '&#10003;', TEXT.correct));
            return;
        }

        out.classList.add('bad');
        var target = closestVariant(words, item, group);
        cards.forEach(function (t, i) {
            var right = target[i] != null && norm(target[i]) === norm(words[i]);
            t.classList.add(right ? 'tok-ok' : 'tok-bad');
        });
        out.insertAdjacentElement('afterend',
            flash('bad', '&#10005;', diagnose(words, item, group)));
    }

    function flash(kind, glyph, message) {
        var d = document.createElement('div');
        d.className = 'uzb-flash ' + kind;
        d.innerHTML = '<span class="uzb-check"' +
            (kind === 'ok' ? '' : ' style="background:#D6455E"') + '>' + glyph + '</span>' +
            '<span>' + esc(message) + '</span>';
        return d;
    }

    /* ---------------------------------------------------------------- events */

    /** One delegated listener set per step, however many builders it holds. */
    function bind(root) {
        if (root.__uzbBound) return;
        root.__uzbBound = true;

        root.addEventListener('click', function (e) {
            if (!e.target || !e.target.closest) return;
            var wrap = e.target.closest('.uzb');
            if (!wrap || !root.contains(wrap)) return;
            var out = wrap.querySelector('.uzb-out'), bnk = wrap.querySelector('.uzb-bank');
            var key = wrap.getAttribute('data-uzb');

            if (e.target.closest('[data-uzb-undo]')) {
                clearMarks(root, key);
                var last = out.querySelector('.uzb-tok:last-child');
                if (last) moveToken(last, bnk);
                sync(wrap);
                return;
            }
            if (e.target.closest('[data-uzb-clear]')) {
                clearMarks(root, key);
                Array.prototype.slice.call(out.querySelectorAll('.uzb-tok'))
                    .forEach(function (t) { moveToken(t, bnk); });
                sync(wrap);
                return;
            }
            var tok = e.target.closest('.uzb-tok');
            if (!tok) return;
            /* touching the answer after a verdict means "I am fixing it" */
            clearMarks(root, key);
            moveToken(tok, out.contains(tok) ? bnk : out);
            sync(wrap);
        });

        /* Desktop nicety: drag a placed card to reorder. Touch users get the
           tap flow above, which is the complete interaction on its own. */
        var dragged = null;
        root.addEventListener('dragstart', function (e) {
            var tok = e.target && e.target.closest ? e.target.closest('.uzb-out .uzb-tok') : null;
            if (!tok) return;
            dragged = tok;
            tok.classList.add('dragging');
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        });
        root.addEventListener('dragend', function () {
            if (dragged) dragged.classList.remove('dragging');
            var o = root.querySelector('.uzb-out.drop');
            if (o) o.classList.remove('drop');
            dragged = null;
        });
        root.addEventListener('dragover', function (e) {
            if (!dragged || !e.target || !e.target.closest) return;
            var out = e.target.closest('.uzb-out');
            if (!out || !out.contains(dragged)) return;
            e.preventDefault();
            out.classList.add('drop');
            var over = e.target.closest('.uzb-tok');
            if (over && over !== dragged && out.contains(over)) {
                var box = over.getBoundingClientRect();
                var after = e.clientX > box.left + box.width / 2;
                out.insertBefore(dragged, after ? over.nextSibling : over);
            }
        });
        root.addEventListener('drop', function (e) {
            if (!dragged) return;
            e.preventDefault();
            var out = e.target && e.target.closest ? e.target.closest('.uzb-out') : null;
            if (!out) return;
            out.classList.remove('drop');
            var wrap = out.closest('.uzb');
            clearMarks(root, wrap.getAttribute('data-uzb'));
            sync(wrap);
        });
    }

    global.UzSentenceBuilder = {
        VERSION: 1,
        CONST: C,
        TEXT: TEXT,
        renderItem: renderItem,
        bind: bind,
        read: read,
        write: write,
        markResult: markResult,
        clearMarks: clearMarks,
        bank: bank,
        split: split,
        diagnose: diagnose,
        _norm: norm
    };
})(typeof window !== 'undefined' ? window : this);
