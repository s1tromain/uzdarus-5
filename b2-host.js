/* ============================================================================
 * b2-host.js — the B2 HOST LAYER for the shared Exercise Session Engine.
 *
 * The engine (exercise-session.js) knows nothing about B2. This file knows
 * nothing about the engine's internals. They meet at one documented contract:
 * the host supplies renderGroup / bindGroup / readAnswer / writeAnswer /
 * matchItem / stepGate / finish / renderSummary / draft, and the engine drives
 * the session. Every B2-specific rule lives here and nowhere else.
 *
 * ---------------------------------------------------------------------------
 * WHY A FACTORY AND NOT DIRECT GLOBALS
 * ---------------------------------------------------------------------------
 * B2's own machinery (saveProgress, the #quizResults block, the draft store)
 * lives inside an inline <script> in b2-course.html, so it is NOT reachable
 * from a separate file. Rather than duplicate any of it — which would be the
 * second implementation this migration exists to avoid — the page calls
 * B2Host.create(deps) and injects its own functions.
 *
 * ---------------------------------------------------------------------------
 * THE B2 RULES THIS FILE OWNS
 * ---------------------------------------------------------------------------
 *   PASS_PERCENT (85)  one constant drives BOTH gates, so they cannot drift
 *   per-exercise gate  below 85% the next exercise does not open; the learner
 *                      repeats THAT exercise (engine cfg.stepGate)
 *   topic gate         below 85% overall the topic is not completed and
 *                      nothing is written to progress or Firebase
 *   summary screen     one builder, mounted in the modal AND written into the
 *                      page's existing #quizResults, so a finished topic can
 *                      be reopened straight to its last result
 *
 * ---------------------------------------------------------------------------
 * BACKWARDS COMPATIBILITY
 * ---------------------------------------------------------------------------
 * Session state is stored under a NEW key (`session`) inside the SAME draft
 * object B2 already writes. A learner mid-way through the old MC/blank flow
 * keeps their `mc` and `blanks` untouched. Nothing is migrated destructively.
 * ==========================================================================*/
(function (global) {
    'use strict';

    if (global.B2Host) return;

    /** The single threshold. Both gates read this, so they can never differ. */
    var PASS_PERCENT = 85;

    /* The platform's normalisation, character-for-character identical to the
       one the shared engine's other hosts use. Case, ё/е, punctuation and
       whitespace are ignored; everything else must match. */
    function norm(v) {
        return String(v == null ? '' : v)
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[.,!?;:()"'«»—–\-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function escHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function escAttr(s) { return escHtml(s).replace(/'/g, '&#39;'); }
    function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }

    /* -------------------------------------------------------------- styles */

    /**
     * B2's visual identity: deeper indigo, warm gold accents, more air, more
     * typography. Deliberately NOT the A2 palette — B2 should read as the more
     * advanced, more considered course while staying recognisably UzdaRus.
     * CSS only: no libraries, no canvas, no runtime layout maths.
     */
    function injectStyles() {
        if (document.getElementById('b2h-styles')) return;
        var st = document.createElement('style');
        st.id = 'b2h-styles';
        st.textContent = [
            /* Design tokens. BOTH roots must carry them: the exercise UI mounts
               under .b2h and the grammar lesson under .b2g. A token declared on
               only one of them is invalid-at-computed-value-time in the other,
               which silently drops colour to `inherit` — white text on white
               tables. Every var() below also carries a literal fallback so this
               can never blank a page again. */
            '.b2h,.b2g{--b2-ink:#1a1c2e;--b2-dim:#6b7290;--b2-line:#e4e7f2;--b2-primary:#3B3F8F;',
            '--b2-accent:#6C63FF;--b2-ok:#1F8A5B;--b2-bad:#C63B4E}',

            /* ---- exercise card ---- */
            '.b2h-item{background:#fff;border:1px solid var(--b2-line);border-radius:16px;padding:22px 24px;',
            'margin-bottom:16px;box-shadow:0 1px 2px rgba(26,28,46,.04);',
            'transition:box-shadow .25s,border-color .25s,transform .25s}',
            '.b2h-item:hover{box-shadow:0 8px 26px rgba(59,63,143,.10);border-color:#cfd5ec;transform:translateY(-1px)}',
            '.b2h-item.is-filled{border-color:#c3c8ee;background:linear-gradient(180deg,#fdfdff,#fafbff)}',
            '.b2h-q{display:flex;gap:14px;align-items:flex-start;margin-bottom:16px}',
            '.b2h-num{flex:none;width:30px;height:30px;border-radius:10px;',
            'background:linear-gradient(135deg,var(--b2-accent),var(--b2-primary));color:#fff;',
            'font-weight:800;font-size:.85rem;display:flex;align-items:center;justify-content:center;',
            'box-shadow:0 2px 8px rgba(59,63,143,.28)}',
            '.b2h-text{font-size:1.08rem;color:var(--b2-ink);line-height:1.85;font-weight:500}',

            /* ---- the inline slot the chosen word drops into ---- */
            '.b2h-slot{display:inline-block;min-width:96px;padding:2px 12px;margin:0 4px;border-radius:8px;',
            'background:#F0F1FB;border-bottom:2.5px solid #b9bfe6;color:#9aa0c4;font-weight:700;',
            'text-align:center;transition:all .28s cubic-bezier(.34,1.36,.64,1)}',
            '.b2h-slot.filled{background:linear-gradient(135deg,#EEF0FF,#E4E7FF);',
            'border-bottom-color:var(--b2-accent);color:var(--b2-primary);box-shadow:0 2px 10px rgba(108,99,255,.18)}',
            '.b2h-slot.pop{animation:b2hPop .34s cubic-bezier(.34,1.36,.64,1)}',
            '@keyframes b2hPop{0%{transform:scale(.86)}55%{transform:scale(1.09)}100%{transform:scale(1)}}',
            '.b2h-blank{display:inline-block;min-width:88px;border-bottom:2.5px dashed #b9bfe6;margin:0 5px}',

            /* ---- free-text input ---- */
            '.b2h-input{width:100%;box-sizing:border-box;font-family:inherit;font-size:1.02rem;',
            'padding:14px 16px;border:2px solid var(--b2-line);border-radius:12px;background:#fff;',
            'color:var(--b2-ink);transition:border-color .2s,box-shadow .2s,background .2s}',
            '.b2h-input::placeholder{color:#a8aec8}',
            '.b2h-input:hover{border-color:#cfd5ec}',
            '.b2h-input:focus{outline:none;border-color:var(--b2-accent);background:#fcfcff;',
            'box-shadow:0 0 0 4px rgba(108,99,255,.12)}',
            '.b2h-hint{margin-top:9px;font-size:.86rem;color:var(--b2-dim);font-style:italic}',

            /* ---- options ---- */
            '.b2h-opts{display:flex;gap:10px;flex-wrap:wrap}',
            '.b2h-opts-test,.b2h-opts-tf{flex-direction:column;gap:9px}',
            '.b2h-opt{position:relative;font-family:inherit;cursor:pointer;border-radius:12px;',
            'border:2px solid var(--b2-line);background:#fff;color:#3c4260;font-size:1rem;font-weight:600;',
            'padding:12px 20px;display:flex;align-items:center;gap:11px;',
            'transition:transform .18s,border-color .18s,background .18s,box-shadow .18s}',
            '.b2h-opts-test .b2h-opt,.b2h-opts-tf .b2h-opt{width:100%;text-align:left}',
            '.b2h-opt:hover{border-color:var(--b2-accent);background:#FAFAFF;transform:translateY(-2px);',
            'box-shadow:0 6px 18px rgba(108,99,255,.14)}',
            '.b2h-opt:active{transform:translateY(0) scale(.98)}',
            '.b2h-opt.selected{border-color:var(--b2-accent);color:var(--b2-primary);',
            'background:linear-gradient(135deg,#EEF0FF,#E6E9FF);box-shadow:0 4px 16px rgba(108,99,255,.22)}',
            '.b2h-opt.selected::after{content:"\\2713";margin-left:auto;font-weight:900;color:var(--b2-accent)}',
            '.b2h-key{width:26px;height:26px;flex:none;border-radius:8px;background:#F0F1F8;color:#7d84a6;',
            'font-weight:800;font-size:.8rem;display:flex;align-items:center;justify-content:center;transition:all .18s}',
            '.b2h-opt.selected .b2h-key{background:var(--b2-accent);color:#fff}',

            /* ---- audio ---- */
            '.b2h-audio{background:linear-gradient(135deg,#EEF0FF,#F6F7FF);border:1px solid #dfe3f7;',
            'border-radius:16px;padding:20px 22px;margin-bottom:20px}',
            '.b2h-audio b{display:block;color:var(--b2-primary);font-size:1.02rem;margin-bottom:6px}',
            '.b2h-audio small{color:var(--b2-dim)}',
            '.b2h-audio audio{width:100%;margin-top:12px}',

            /* ---- grammar lesson ---- */
            '.b2g{color:var(--b2-ink,#1a1c2e);line-height:1.8;font-size:1.02rem}',
            '.b2g h4{margin:30px 0 12px;font-size:1.18rem;color:var(--b2-primary,#3B3F8F);font-weight:800;',
            'padding-left:14px;border-left:4px solid var(--b2-accent,#6C63FF)}',
            '.b2g p{margin:0 0 12px}',
            '.b2g-lead{background:linear-gradient(135deg,#F4F5FF,#FAFAFF);border:1px solid #e0e4f7;',
            'border-radius:18px;padding:22px 26px;margin-bottom:8px}',
            '.b2g-lead h4{margin-top:0;border-left:0;padding-left:0}',
            '.b2g-scheme{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin:18px 0;',
            'padding:16px 18px;background:#fff;border:1.5px dashed #c3c8ee;border-radius:14px;font-size:1.06rem}',
            '.b2g-main{background:#E8ECFF;color:#2B3080;padding:5px 12px;border-radius:8px;font-weight:700}',
            '.b2g-sub{background:#FFF3E0;color:#8A5200;padding:5px 12px;border-radius:8px;font-weight:700}',
            '.b2g-link{color:var(--b2-accent,#6C63FF);font-weight:900}',
            '.b2g-scheme-note{font-size:.92rem;color:var(--b2-dim,#6b7290);margin:0}',
            '.b2g-t{width:100%;border-collapse:collapse;margin:14px 0 20px;font-size:.98rem;',
            'background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(26,28,46,.06);display:table}',
            '.b2g-t th{background:linear-gradient(135deg,#3B3F8F,#5A5FC0);color:#fff;text-align:left;',
            'padding:12px 14px;font-weight:700;font-size:.93rem}',
            '.b2g-t td{padding:11px 14px;border-top:1px solid #eef0f7;vertical-align:top;color:#1a1c2e;background:#fff}',
            '.b2g-t tr:nth-child(even) td{background:#FAFBFF}',
            '.b2g-t th{color:#fff}',
            '.b2g-t.b2g-err td:first-child{color:#C63B4E}',
            '.b2g-t.b2g-err td:nth-child(2){color:#1F8A5B}',
            '.b2g-split{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin:16px 0 20px}',
            '.b2g-half{background:#fff;border:1px solid var(--b2-line,#e4e7f2);border-left:4px solid var(--b2-accent,#6C63FF);',
            'border-radius:14px;padding:16px 18px}',
            '.b2g-half>b{color:var(--b2-primary,#3B3F8F);font-size:1.04rem}',
            '.b2g-half p{margin:8px 0 0;font-size:.96rem}',
            '.b2g-ex{background:#F7F8FC;border-radius:10px;padding:10px 12px;margin-top:10px!important}',
            '.b2g-ex small{color:var(--b2-dim,#6b7290)}',
            '.b2g-list{margin:10px 0 18px;padding-left:22px}',
            '.b2g-list li{margin:7px 0}',
            '.b2g-tip{background:#EEF7F1;border:1px solid #BFE3CE;border-radius:12px;padding:13px 16px;color:#14603F}',
            '.b2g-warn{background:#FFF4E5;border:1px solid #FFD8A8;border-radius:12px;padding:13px 16px;color:#8A5200}',
            '.b2g-warn s,.b2g-t s{color:#C63B4E;text-decoration-thickness:2px}',
            '.b2g-chips{display:flex;flex-wrap:wrap;gap:9px;margin:12px 0 20px}',
            '.b2g-chips span{background:linear-gradient(135deg,#EEF0FF,#E6E9FF);color:var(--b2-primary,#3B3F8F);',
            'border:1px solid #d3d8f5;border-radius:20px;padding:8px 16px;font-weight:600;font-size:.94rem}',
            '.b2g-check{background:linear-gradient(135deg,#FFFBF0,#FFF7E4);border:1px solid #F0E0B8;',
            'border-radius:18px;padding:20px 26px;margin-top:24px}',
            '.b2g-check h4{margin-top:0;border-left-color:#C9A227;color:#8A6D0B}',
            '@media(max-width:640px){.b2g-t{font-size:.9rem}.b2g-t th,.b2g-t td{padding:9px 10px}}',
            /* ---- results screen ---- */
            '.b2h-res{max-width:840px;margin:0 auto;padding:8px 0 28px;color:var(--b2-ink)}',
            '.b2h-res-hero{text-align:center;padding:34px 22px;border-radius:22px;margin-bottom:22px;',
            'background:linear-gradient(140deg,#2E3170,#4A4FA8 58%,#6C63FF);color:#fff;',
            'box-shadow:0 16px 42px rgba(46,49,112,.32)}',
            '.b2h-res-hero.fail{background:linear-gradient(140deg,#6A2436,#A33B4F 60%,#C63B4E);',
            'box-shadow:0 16px 42px rgba(106,36,54,.3)}',
            '.b2h-res-pct{font-size:4.4rem;font-weight:900;line-height:1}',
            '.b2h-res-title{font-size:1.5rem;font-weight:800;margin:12px 0 6px}',
            '.b2h-res-sub{opacity:.92;font-size:1.02rem;line-height:1.6;max-width:520px;margin:0 auto}',
            '.b2h-res-ring{height:10px;border-radius:6px;background:rgba(255,255,255,.24);',
            'overflow:hidden;max-width:420px;margin:20px auto 0}',
            '.b2h-res-ring i{display:block;height:100%;border-radius:6px;background:#fff;',
            'transition:width .8s cubic-bezier(.22,1,.36,1)}',
            '.b2h-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:14px;margin-bottom:24px}',
            '.b2h-stat{background:#fff;border:1px solid var(--b2-line);border-radius:16px;padding:18px;text-align:center}',
            '.b2h-stat b{display:block;font-size:2rem;font-weight:900;line-height:1.15}',
            '.b2h-stat span{display:block;font-size:.84rem;color:var(--b2-dim);margin-top:4px;font-weight:600}',
            '.b2h-stat.ok b{color:var(--b2-ok)}.b2h-stat.bad b{color:var(--b2-bad)}',
            '.b2h-stat.neutral b{color:var(--b2-primary)}',
            '.b2h-sec{font-size:1.12rem;font-weight:800;margin:0 0 14px;color:var(--b2-primary)}',
            '.b2h-brk{background:#fff;border:1px solid var(--b2-line);border-radius:16px;overflow:hidden;margin-bottom:24px}',
            '.b2h-row{display:flex;align-items:center;gap:14px;padding:14px 18px;border-bottom:1px solid #f0f2f8}',
            '.b2h-row:last-child{border-bottom:0}',
            '.b2h-row-name{flex:1;font-weight:600;font-size:.97rem}',
            '.b2h-row-bar{flex:none;width:110px;height:8px;border-radius:5px;background:#eef0f7;overflow:hidden}',
            '.b2h-row-bar i{display:block;height:100%;border-radius:5px;background:var(--b2-ok)}',
            '.b2h-row-bar.bad i{background:var(--b2-bad)}',
            '.b2h-row-val{flex:none;width:74px;text-align:right;font-weight:800;font-size:.94rem}',
            '.b2h-tips{background:linear-gradient(135deg,#FFFBF0,#FFF7E4);border:1px solid #F0E0B8;',
            'border-radius:16px;padding:20px 24px;margin-bottom:24px}',
            '.b2h-tips h4{margin:0 0 10px;color:#8A6D0B;font-size:1.04rem}',
            '.b2h-tips ul{margin:0;padding-left:20px;line-height:1.85;color:#5f5330}',
            '.b2h-res-acts{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}',
            '.b2h-cta{border:none;border-radius:12px;padding:15px 34px;font-size:1.04rem;font-weight:800;',
            'cursor:pointer;font-family:inherit;transition:transform .18s,box-shadow .18s,filter .18s}',
            '.b2h-cta:hover{transform:translateY(-2px);filter:brightness(1.06)}',
            '.b2h-cta[disabled]{opacity:.6;cursor:default;transform:none}',
            '.b2h-cta-done{background:linear-gradient(135deg,#1F8A5B,#15704A);color:#fff;',
            'box-shadow:0 6px 20px rgba(31,138,91,.32)}',
            '.b2h-cta-retry{background:linear-gradient(135deg,var(--b2-accent),var(--b2-primary));color:#fff;',
            'box-shadow:0 6px 20px rgba(108,99,255,.3)}',
            '.b2h-done-note{text-align:center;margin-top:16px;color:var(--b2-ok);font-weight:700}',
            '@media(max-width:640px){.b2h-res-pct{font-size:3.4rem}.b2h-item{padding:18px 16px}',
            '.b2h-row-bar{width:64px}.b2h-cta{width:100%}}'
        ].join('');
        (document.head || document.documentElement).appendChild(st);
    }

    /* --------------------------------------------------------- prompt HTML */

    /**
     * Render a prompt. When the group is a word choice with a `___` gap, the
     * first gap becomes a live slot the chosen word is written into, so the
     * learner reads a finished sentence instead of a blank line.
     */
    function renderPrompt(q, key, slotted) {
        var html = escHtml(q).replace(/\n/g, '<br>');
        if (!slotted) return html.replace(/_{3,}/g, '<span class="b2h-blank">______</span>');
        var used = false;
        return html.replace(/_{3,}/g, function () {
            if (used) return '<span class="b2h-blank">______</span>';
            used = true;
            return '<span class="b2h-slot" data-b2h-slot="' + escAttr(key) + '">______</span>';
        });
    }

    /* ------------------------------------------------------------ host API */

    function create(deps) {
        if (!deps || typeof deps.getTopic !== 'function') {
            throw new Error('B2Host.create: deps.getTopic is required');
        }
        injectStyles();

        var passPercent = Number(deps.passPercent) > 0 ? Number(deps.passPercent) : PASS_PERCENT;
        var topicIdOf = function () { var t = deps.getTopic(); return t ? t.id : null; };

        /** Shape-driven, never per-lesson: a choice group whose prompts carry a
         *  gap gets the inline-fill treatment. */
        function isSlotted(g) {
            return g.type === 'choice' && (g.items || []).some(function (it) {
                return /_{3,}/.test(String(it.q || ''));
            });
        }

        /* ------------------------------------------------------- rendering */

        function renderGroup(g) {
            var html = '<div class="b2h">';
            if (g.audioSrc) {
                var src = String(g.audioSrc);
                /* b2-course.html lives in /paid-courses/, b2-demo.html at the
                   root — resolve relative to wherever the page actually is. */
                if (src.indexOf('http') !== 0 && src.indexOf('../') !== 0 &&
                    location.pathname.indexOf('/paid-courses/') !== -1) {
                    src = '../' + src;
                }
                html += '<div class="b2h-audio"><b>&#127911; Tinglab tushunish</b>' +
                        '<small>Audioni tinglang va savollarga javob bering.</small>' +
                        '<audio controls preload="metadata"><source src="' + escAttr(src) +
                        '" type="audio/mpeg"></audio></div>';
            }
            var slotted = isSlotted(g);
            (g.items || []).forEach(function (item, i) {
                var key = g.id + '-' + i;
                var cell;
                if (g.type === 'choice') {
                    var style = g.style || 'chips';
                    var opts = (item.options || []).map(function (o, oi) {
                        var lbl = style === 'test'
                            ? '<span class="b2h-key">' + String.fromCharCode(65 + oi) + '</span>' : '';
                        return '<button type="button" class="b2h-opt" data-value="' + escAttr(o) + '">' +
                               lbl + '<span>' + escHtml(o) + '</span></button>';
                    }).join('');
                    cell = '<div class="b2h-opts b2h-opts-' + style + '" data-b2h-row="' + escAttr(key) + '">' +
                           opts + '</div>';
                } else {
                    cell = '<input type="text" class="b2h-input" data-b2h-input="' + escAttr(key) + '" ' +
                           'placeholder="' + escAttr(item.placeholder || 'Javobingizni yozing...') + '" ' +
                           'autocomplete="off" spellcheck="false">';
                    if (item.hint) cell += '<div class="b2h-hint">' + escHtml(item.hint) + '</div>';
                }
                html += '<div class="b2h-item" data-b2h-item="' + escAttr(key) + '">' +
                        '<div class="b2h-q"><span class="b2h-num">' + (i + 1) + '</span>' +
                        '<span class="b2h-text">' + renderPrompt(item.q, key, slotted) + '</span></div>' +
                        cell + '</div>';
            });
            return html + '</div>';
        }

        /** Put the chosen word into the sentence (and swap it on re-selection). */
        function fillSlot(root, key, value) {
            var slot = root.querySelector('[data-b2h-slot="' + key + '"]');
            if (!slot) return;
            var has = value != null && String(value).trim() !== '';
            slot.textContent = has ? value : '______';
            slot.classList.toggle('filled', has);
            if (has) {
                slot.classList.remove('pop');
                void slot.offsetWidth;         // reflow, so the animation replays
                slot.classList.add('pop');
            }
        }

        function markFilled(root, key, filled) {
            var card = root.querySelector('[data-b2h-item="' + key + '"]');
            if (card) card.classList.toggle('is-filled', !!filled);
        }

        /** One delegated listener pair for the whole step, not one per widget. */
        function bindGroup(root) {
            root.addEventListener('click', function (e) {
                var btn = e.target && e.target.closest ? e.target.closest('.b2h-opt') : null;
                if (!btn || !root.contains(btn)) return;
                var row = btn.closest('.b2h-opts');
                if (!row) return;
                row.querySelectorAll('.b2h-opt').forEach(function (o) { o.classList.remove('selected'); });
                btn.classList.add('selected');
                var key = row.getAttribute('data-b2h-row');
                fillSlot(root, key, btn.getAttribute('data-value'));
                markFilled(root, key, true);
            });
            root.addEventListener('input', function (e) {
                var inp = e.target && e.target.closest ? e.target.closest('.b2h-input') : null;
                if (!inp) return;
                markFilled(root, inp.getAttribute('data-b2h-input'), inp.value.trim() !== '');
            });
        }

        function readAnswer(root, key, g) {
            if (g.type === 'choice') {
                var sel = root.querySelector('[data-b2h-row="' + key + '"] .b2h-opt.selected');
                return sel ? (sel.getAttribute('data-value') || '') : '';
            }
            var inp = root.querySelector('[data-b2h-input="' + key + '"]');
            return inp ? inp.value : '';
        }

        function writeAnswer(root, key, value, g) {
            if (g.type === 'choice') {
                var row = root.querySelector('[data-b2h-row="' + key + '"]');
                if (!row) return;
                row.querySelectorAll('.b2h-opt').forEach(function (o) {
                    o.classList.toggle('selected', o.getAttribute('data-value') === value);
                });
                fillSlot(root, key, value);
                markFilled(root, key, value != null && String(value).trim() !== '');
                return;
            }
            var inp = root.querySelector('[data-b2h-input="' + key + '"]');
            if (inp) {
                inp.value = (value == null ? '' : value);
                markFilled(root, key, inp.value.trim() !== '');
            }
        }

        function matchItem(item, value) {
            var nv = norm(value);
            if (!nv) return false;
            var expected = Array.isArray(item.answer) ? item.answer : [item.answer];
            return expected.some(function (e) { return norm(e) === nv; });
        }

        /* ------------------------------------------------------------ gate */

        /**
         * B2's per-exercise rule: below the threshold the next exercise does not
         * open and the learner repeats THIS one. The engine owns no part of the
         * decision — it only renders the verdict it is handed.
         */
        function stepGate(result) {
            if (!result || !result.total) return { pass: true };
            var p = pct(result.correct || 0, result.total);
            if (p >= passPercent) return { pass: true };
            return {
                pass: false,
                min: passPercent,
                message: 'Для перехода необходимо набрать минимум ' + passPercent + '%. ' +
                         'Ваш результат — ' + p + '%. Пройдите это упражнение заново.'
            };
        }

        /* ----------------------------------------------------------- draft */

        var draft = {
            save: function (state) {
                var id = topicIdOf();
                if (id == null || typeof deps.saveDraft !== 'function') return;
                var existing = (typeof deps.loadDraft === 'function' ? deps.loadDraft(id) : null) || {};
                existing.session = state;
                existing.savedAt = Date.now();
                deps.saveDraft(id, existing);
            },
            load: function () {
                var id = topicIdOf();
                if (id == null || typeof deps.loadDraft !== 'function') return null;
                var d = deps.loadDraft(id);
                return (d && d.session) ? d.session : null;
            },
            clear: function () {
                var id = topicIdOf();
                if (id == null) return;
                /* Clear ONLY this topic's draft. completedTopics, other topics,
                   vocabulary and every stored result are untouched. */
                if (typeof deps.clearDraft === 'function') deps.clearDraft(id);
            }
        };

        /* --------------------------------------------------------- scoring */

        /** Grade the whole topic. Pure: no DOM, no storage, no side effects. */
        function score(answers) {
            var topic = deps.getTopic();
            var groups = (topic && topic.exercises) || [];
            var total = 0, correct = 0;
            var breakdown = [], wrong = [];

            groups.forEach(function (g) {
                var gTotal = 0, gCorrect = 0;
                (g.items || []).forEach(function (item, i) {
                    total++; gTotal++;
                    var key = g.id + '-' + i;
                    var given = answers ? answers[key] : '';
                    if (matchItem(item, given)) { correct++; gCorrect++; }
                    else {
                        wrong.push({
                            group: g.id, index: i + 1, question: item.q,
                            given: (given == null || String(given).trim() === '') ? null : String(given),
                            expected: Array.isArray(item.answer) ? item.answer[0] : item.answer,
                            explanation: item.explanation || item.hint || null
                        });
                    }
                });
                breakdown.push({
                    id: g.id, title: g.title || g.id, correct: gCorrect,
                    total: gTotal, percent: pct(gCorrect, gTotal)
                });
            });

            var percent = pct(correct, total);
            return {
                topicId: topic ? topic.id : null,
                score: correct, total: total, errors: total - correct,
                percent: percent, passed: percent >= passPercent,
                passPercent: passPercent, breakdown: breakdown, wrong: wrong,
                timestamp: new Date().toISOString()
            };
        }

        /* --------------------------------------------------------- summary */

        /** Advice derived from the attempt itself, not canned filler. */
        function recommendations(r) {
            var out = [];
            var weak = r.breakdown
                .filter(function (b) { return b.total && b.percent < r.passPercent; })
                .sort(function (a, b) { return a.percent - b.percent; });
            if (weak.length) {
                out.push('Слабые упражнения: ' + weak.slice(0, 3).map(function (b) {
                    return b.title + ' (' + b.percent + '%)';
                }).join(', ') + ' — повторите их в первую очередь.');
            }
            var explained = r.wrong.filter(function (w) { return w.explanation; });
            if (explained.length) {
                out.push('В ' + explained.length + ' ошибках есть разбор — прочитайте пояснения к ним.');
            }
            var blank = r.wrong.filter(function (w) { return w.given == null; }).length;
            if (blank) {
                out.push('Без ответа осталось: ' + blank +
                         '. Не оставляйте пропуски — отвечайте даже при сомнении.');
            }
            if (r.passed) {
                out.push('Порог ' + r.passPercent + '% пройден. Закрепите тему на словаре и переходите дальше.');
            } else {
                out.push('До порога ' + r.passPercent + '% не хватает ' + (r.passPercent - r.percent) +
                         '%. Разберите грамматику темы и пройдите упражнения заново.');
            }
            return out;
        }

        /**
         * ONE results builder. Its HTML is mounted in the modal (the screen the
         * learner sees at the end) and written into the page's existing
         * #quizResults block (so a finished topic can be reopened to it).
         * One generator, two mount points — not two result screens.
         */
        function buildResultsHtml(r, opts) {
            opts = opts || {};
            var passed = !!r.passed;

            var rows = (r.breakdown || []).map(function (b) {
                var good = b.percent >= r.passPercent;
                return '<div class="b2h-row">' +
                       '<span class="b2h-row-name">' + escHtml(b.title) + '</span>' +
                       '<span class="b2h-row-bar' + (good ? '' : ' bad') + '">' +
                       '<i style="width:' + b.percent + '%"></i></span>' +
                       '<span class="b2h-row-val" style="color:' +
                       (good ? 'var(--b2-ok)' : 'var(--b2-bad)') + '">' +
                       b.correct + '/' + b.total + '</span></div>';
            }).join('');

            var tips = recommendations(r).map(function (t) {
                return '<li>' + escHtml(t) + '</li>';
            }).join('');

            var acts;
            if (opts.archived) {
                acts = '<div class="b2h-done-note">&#10004; Тема завершена. ' +
                       'Это результат вашей последней попытки.</div>';
            } else if (passed) {
                acts = '<div class="b2h-res-acts">' +
                       '<button type="button" class="b2h-cta b2h-cta-done" data-b2h-act="complete">' +
                       'Завершить тему</button></div>';
            } else {
                acts = '<div class="b2h-res-acts">' +
                       '<button type="button" class="b2h-cta b2h-cta-retry" data-b2h-act="restart">' +
                       'Пройти тему заново</button></div>' +
                       '<div class="b2h-done-note" style="color:var(--b2-bad)">' +
                       'Тема не засчитана: нужно минимум ' + r.passPercent + '%.</div>';
            }

            return '<div class="b2h"><div class="b2h-res">' +
                '<div class="b2h-res-hero' + (passed ? '' : ' fail') + '">' +
                    '<div class="b2h-res-pct">' + r.percent + '%</div>' +
                    '<div class="b2h-res-title">' +
                    (passed ? 'Тема пройдена' : 'Тема не пройдена') + '</div>' +
                    '<div class="b2h-res-sub">' + (passed
                        ? 'Отличная работа — вы уверенно владеете материалом темы.'
                        : 'Проходной балл — ' + r.passPercent + '%. Разберите ошибки и попробуйте ещё раз.') +
                    '</div>' +
                    '<div class="b2h-res-ring"><i style="width:' + r.percent + '%"></i></div>' +
                '</div>' +
                '<div class="b2h-stats">' +
                    '<div class="b2h-stat neutral"><b>' + r.score + '/' + r.total + '</b><span>Общий балл</span></div>' +
                    '<div class="b2h-stat ok"><b>' + r.score + '</b><span>Правильных</span></div>' +
                    '<div class="b2h-stat bad"><b>' + r.errors + '</b><span>Ошибок</span></div>' +
                    '<div class="b2h-stat neutral"><b>' + (r.breakdown || []).length +
                    '</b><span>Упражнений</span></div>' +
                '</div>' +
                '<h3 class="b2h-sec">Статистика по упражнениям</h3>' +
                '<div class="b2h-brk">' + rows + '</div>' +
                '<div class="b2h-tips"><h4>Рекомендации</h4><ul>' + tips + '</ul></div>' +
                acts +
            '</div></div>';
        }

        /* ---------------------------------------------------------- finish */

        /**
         * Score the attempt and persist the RESULT — but never the completion.
         * Completion is an explicit act: the learner presses "Завершить тему"
         * on the summary, and only when the threshold was met.
         */
        function finish(answers) {
            var r = score(answers);

            if (typeof deps.saveResult === 'function') {
                try {
                    var p = deps.saveResult(r.topicId, r);
                    if (p && typeof p.catch === 'function') p.catch(function () {});
                } catch (e) { /* a persistence failure must not cost the screen */ }
            }
            /* Mirror into the page's existing #quizResults so the result stays
               visible after the modal is dismissed. Same builder, same markup. */
            if (typeof deps.showResults === 'function') {
                try { deps.showResults(buildResultsHtml(r), r); } catch (e) {}
            }
            /* The attempt is graded — the draft has served its purpose. */
            draft.clear();
            return r;
        }

        function renderSummary(payload) {
            var r = payload || score({});
            return buildResultsHtml(r, { archived: !!r.archived });
        }

        /** Wire the summary's own buttons. */
        function bindSummary(root, payload, session) {
            var r = payload || {};
            root.addEventListener('click', function (e) {
                var btn = e.target && e.target.closest ? e.target.closest('[data-b2h-act]') : null;
                if (!btn) return;
                var act = btn.getAttribute('data-b2h-act');

                if (act === 'complete') {
                    if (!r.passed) return;                       // belt and braces
                    btn.disabled = true;
                    btn.textContent = 'Сохранение...';
                    Promise.resolve()
                        .then(function () {
                            return typeof deps.completeTopic === 'function'
                                ? deps.completeTopic(r.topicId, r) : null;
                        })
                        .catch(function () {})
                        .then(function () {
                            if (session && typeof session.close === 'function') session.close();
                        });
                    return;
                }
                if (act === 'restart') {
                    /* A fresh attempt from exercise 1 — the failed attempt's
                       answers are dropped so nothing carries over. */
                    if (session && typeof session.reset === 'function') session.reset();
                    if (session && typeof session.open === 'function') session.open();
                }
            });
        }

        return {
            renderGroup: renderGroup, bindGroup: bindGroup,
            readAnswer: readAnswer, writeAnswer: writeAnswer,
            matchItem: matchItem, stepGate: stepGate,
            finish: finish, renderSummary: renderSummary, bindSummary: bindSummary,
            draft: draft, score: score, buildResultsHtml: buildResultsHtml,
            passPercent: passPercent, _norm: norm
        };
    }

    /**
     * Mount the practice card for a topic. One entry point for both
     * b2-course.html and b2-demo.html; each passes its own deps.
     *
     * A topic the learner has already completed does NOT offer Start/Continue:
     * it opens straight to the stored result of the last attempt.
     */
    function mountPractice(opts) {
        if (!global.UzExerciseSession) return null;
        var deps = opts.deps;
        var topic = deps.getTopic();
        if (!topic || !Array.isArray(topic.exercises) || !topic.exercises.length) return null;

        var api = create(deps);

        var completed = typeof deps.isCompleted === 'function' && !!deps.isCompleted(topic.id);
        var last = (completed && typeof deps.loadResult === 'function')
            ? deps.loadResult(topic.id) : null;

        /* A finished topic is "read": no Start, no Continue — just the record
           of how it went. Re-taking it will be a separate, explicit feature. */
        if (completed && last) {
            last.archived = true;
            if (opts.mountEl) {
                opts.mountEl.innerHTML = api.buildResultsHtml(last, { archived: true });
            }
            return null;
        }

        return global.UzExerciseSession.mount({
            course: 'b2',
            topicId: topic.id,
            groups: topic.exercises,
            mountEl: opts.mountEl,
            title: opts.title || 'Amaliy mashqlar',
            subtitle: opts.subtitle || 'Mashqlar bittadan bajariladi, javoblar avtomatik saqlanadi.',
            summaryLabel: 'Итоги темы',

            /* Platform "earn your answers" flow — configuration only. The rules
               themselves live in the engine, so every course gets them. */
            passScore: api.passPercent,
            allowAnswerReview: true,
            requireConfirmationBeforeAnswers: true,

            renderGroup: api.renderGroup,
            bindGroup: api.bindGroup,
            readAnswer: api.readAnswer,
            writeAnswer: api.writeAnswer,
            matchItem: api.matchItem,
            stepGate: api.stepGate,
            finish: api.finish,
            renderSummary: api.renderSummary,
            bindSummary: api.bindSummary,
            draft: api.draft
        });
    }

    global.B2Host = {
        create: create, mountPractice: mountPractice,
        PASS_PERCENT: PASS_PERCENT, _norm: norm
    };
})(typeof window !== 'undefined' ? window : this);
