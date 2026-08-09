/* ============================================================================
 * b2-host.js — the B2 HOST LAYER for the shared Exercise Session Engine.
 *
 * The engine (exercise-session.js) knows nothing about B2. This file knows
 * nothing about the engine's internals. They meet at one documented contract:
 * the host supplies renderGroup / bindGroup / readAnswer / writeAnswer /
 * matchItem / finish / draft, the engine drives the session.
 *
 * ---------------------------------------------------------------------------
 * WHY A FACTORY AND NOT DIRECT GLOBALS
 * ---------------------------------------------------------------------------
 * B2's own machinery (saveProgress, saveB2QuizDraft, userProgress, the
 * #quizResults screen) lives inside an inline <script> in b2-course.html, so
 * it is NOT reachable from a separate file. Rather than duplicate any of it —
 * which would be the second implementation this migration exists to avoid —
 * the page calls B2Host.create(deps) and injects its own functions. Every
 * B2-specific behaviour therefore stays in B2, and this file only adapts.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS REUSED, NOT REBUILT
 * ---------------------------------------------------------------------------
 *   result screen   deps.showResults()  -> B2's existing #quizResults markup
 *   progress        deps.saveProgress() -> B2's existing saveProgress(), which
 *                                          already mirrors to localStorage AND
 *                                          syncs completedTopics to Firebase
 *   draft storage   deps.saveDraft/loadDraft/clearDraft -> B2's existing
 *                                          saveB2QuizDraft/loadB2QuizDraft/
 *                                          clearB2QuizDraft (localStorage +
 *                                          Firestore `draft`)
 * There is exactly one storage mechanism and one result screen, as before.
 *
 * ---------------------------------------------------------------------------
 * BACKWARDS COMPATIBILITY
 * ---------------------------------------------------------------------------
 * The session state is stored under a NEW key (`session`) inside the SAME
 * draft object B2 already writes. A learner mid-way through the old MC/blank
 * flow keeps their `mc` and `blanks` untouched; a learner with no `session`
 * simply starts the new flow at exercise 1. Nothing is migrated destructively.
 * ==========================================================================*/
(function (global) {
    'use strict';

    if (global.B2Host) return;

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

    /** Render `___` placeholders as visible blanks, as the courses do. */
    function renderPrompt(q) {
        return escHtml(q).replace(/\n/g, '<br>').replace(/_{3,}/g, '<span class="b2h-blank">______</span>');
    }

    function injectStyles() {
        if (document.getElementById('b2h-styles')) return;
        var st = document.createElement('style');
        st.id = 'b2h-styles';
        st.textContent = [
            '.b2h-audio{background:#eef2ff;border:1.5px solid #c7d2fe;border-radius:12px;padding:14px;margin-bottom:16px}',
            '.b2h-audio audio{width:100%;margin-top:8px}',
            '.b2h-item{background:#fff;border:1px solid #e3e8f5;border-radius:12px;padding:14px;margin-bottom:12px}',
            '.b2h-q{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px}',
            '.b2h-num{flex:none;width:26px;height:26px;border-radius:50%;background:#3F51B5;color:#fff;',
            'font-weight:700;font-size:.82rem;display:flex;align-items:center;justify-content:center}',
            '.b2h-text{font-size:1rem;color:#22283d;line-height:1.6}',
            '.b2h-blank{display:inline-block;min-width:70px;border-bottom:2px dashed #3F51B5;margin:0 3px}',
            '.b2h-input{width:100%;box-sizing:border-box;font-family:inherit;font-size:1rem;padding:11px 14px;',
            'border:2px solid #dfe4f3;border-radius:10px;background:#fff;color:#22283d}',
            '.b2h-input:focus{outline:none;border-color:#3F51B5;background:#fbfcff}',
            '.b2h-hint{margin-top:6px;font-size:.82rem;color:#7c85a3;font-style:italic}',
            '.b2h-opts{display:flex;gap:10px;flex-wrap:wrap}',
            '.b2h-opts-test,.b2h-opts-tf{flex-direction:column}',
            '.b2h-opt{font-family:inherit;cursor:pointer;border-radius:10px;border:2px solid #dfe4f3;background:#fff;',
            'color:#3d4663;font-size:.97rem;padding:10px 16px;display:flex;align-items:center;gap:8px;transition:all .15s}',
            '.b2h-opts-test .b2h-opt,.b2h-opts-tf .b2h-opt{width:100%;text-align:left}',
            '.b2h-opt:hover{border-color:#3F51B5;background:#f3f5ff}',
            '.b2h-opt.selected{border-color:#3F51B5;background:#e5e9ff;color:#26307a;font-weight:700}',
            '.b2h-key{width:24px;height:24px;flex:none;border-radius:6px;background:#eef1f8;color:#666;',
            'font-weight:800;font-size:.8rem;display:flex;align-items:center;justify-content:center}',
            '.b2h-opt.selected .b2h-key{background:#3F51B5;color:#fff}'
        ].join('');
        (document.head || document.documentElement).appendChild(st);
    }

    /* ------------------------------------------------------------- host API */

    function create(deps) {
        if (!deps || typeof deps.getTopic !== 'function') {
            throw new Error('B2Host.create: deps.getTopic is required');
        }
        injectStyles();

        var topicIdOf = function () { var t = deps.getTopic(); return t ? t.id : null; };

        /** renderGroup — ONE exercise group to HTML. No engine knowledge. */
        function renderGroup(g) {
            var html = '';
            if (g.audioSrc) {
                var src = String(g.audioSrc);
                /* b2-course.html lives in /paid-courses/, b2-demo.html at the
                   root — resolve relative to wherever the page actually is. */
                if (src.indexOf('http') !== 0 && src.indexOf('../') !== 0 &&
                    location.pathname.indexOf('/paid-courses/') !== -1) {
                    src = '../' + src;
                }
                html += '<div class="b2h-audio"><b>&#127911; Tinglab tushunish</b>' +
                        '<audio controls preload="metadata"><source src="' + escAttr(src) +
                        '" type="audio/mpeg"></audio></div>';
            }
            (g.items || []).forEach(function (item, i) {
                var key = g.id + '-' + i;
                var cell;
                if (g.type === 'choice') {
                    var style = g.style || 'chips';
                    var opts = (item.options || []).map(function (o, oi) {
                        var lbl = style === 'test'
                            ? '<span class="b2h-key">' + String.fromCharCode(65 + oi) + '</span>' : '';
                        return '<button type="button" class="b2h-opt" data-value="' + escAttr(o) + '">' +
                               lbl + escHtml(o) + '</button>';
                    }).join('');
                    cell = '<div class="b2h-opts b2h-opts-' + style + '" data-b2h-row="' + escAttr(key) + '">' +
                           opts + '</div>';
                } else {
                    cell = '<input type="text" class="b2h-input" data-b2h-input="' + escAttr(key) + '" ' +
                           'placeholder="' + escAttr(item.placeholder || 'Javobingizni yozing...') + '" ' +
                           'autocomplete="off" spellcheck="false">';
                    if (item.hint) cell += '<div class="b2h-hint">' + escHtml(item.hint) + '</div>';
                }
                html += '<div class="b2h-item"><div class="b2h-q"><span class="b2h-num">' + (i + 1) +
                        '</span><span class="b2h-text">' + renderPrompt(item.q) + '</span></div>' + cell + '</div>';
            });
            return html;
        }

        /** bindGroup — one delegated listener for the whole step, not per option. */
        function bindGroup(root) {
            root.addEventListener('click', function (e) {
                var btn = e.target && e.target.closest ? e.target.closest('.b2h-opt') : null;
                if (!btn || !root.contains(btn)) return;
                var row = btn.closest('.b2h-opts');
                if (!row) return;
                row.querySelectorAll('.b2h-opt').forEach(function (o) { o.classList.remove('selected'); });
                btn.classList.add('selected');
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
                return;
            }
            var inp = root.querySelector('[data-b2h-input="' + key + '"]');
            if (inp) inp.value = (value == null ? '' : value);
        }

        /** matchItem — the platform's normalisation, every accepted variant. */
        function matchItem(item, value) {
            var nv = norm(value);
            if (!nv) return false;
            var expected = Array.isArray(item.answer) ? item.answer : [item.answer];
            return expected.some(function (e) { return norm(e) === nv; });
        }

        /* ------------------------------------------------------------ draft */

        /**
         * The engine's session state rides INSIDE B2's existing draft object,
         * under a new `session` key. B2's own `mc` / `blanks` fields are read
         * back and re-emitted untouched, so an in-flight legacy attempt is
         * never destroyed by the new flow.
         */
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

        /* ----------------------------------------------------------- finish */

        /**
         * Grade the whole topic and hand off to B2's EXISTING result screen.
         * This function deliberately renders nothing itself.
         */
        function finish(answers, checked) {
            var topic = deps.getTopic();
            if (!topic) return;
            var groups = topic.exercises || [];

            var total = 0, correct = 0;
            var details = [];
            groups.forEach(function (g) {
                (g.items || []).forEach(function (item, i) {
                    total++;
                    var key = g.id + '-' + i;
                    var given = answers ? answers[key] : '';
                    var okItem = matchItem(item, given);
                    if (okItem) correct++;
                    else {
                        details.push({
                            group: g.id, index: i + 1, question: item.q,
                            given: (given == null || String(given).trim() === '') ? null : String(given),
                            expected: Array.isArray(item.answer) ? item.answer[0] : item.answer,
                            explanation: item.explanation || item.hint || null
                        });
                    }
                });
            });

            var percent = total ? Math.round((correct / total) * 100) : 0;
            var passed = percent >= (deps.passPercent || 60);

            var result = {
                topicId: topic.id, score: correct, total: total, percent: percent,
                passed: passed, wrong: details, checked: checked || {},
                timestamp: new Date().toISOString()
            };

            /* B2's own screen — never a second one built here. */
            if (typeof deps.showResults === 'function') deps.showResults(result);

            /* B2's own persistence: saveProgress() already mirrors to
               localStorage AND syncs completedTopics to Firebase. */
            if (passed && typeof deps.saveProgress === 'function') {
                try {
                    var maybe = deps.saveProgress(topic.id, result);
                    if (maybe && typeof maybe.catch === 'function') maybe.catch(function () {});
                } catch (e) { /* a persistence failure must not lose the screen */ }
            }
            if (typeof deps.saveResult === 'function') {
                try {
                    var r = deps.saveResult(topic.id, result);
                    if (r && typeof r.catch === 'function') r.catch(function () {});
                } catch (e) {}
            }
            /* The attempt is graded — the draft has served its purpose. */
            draft.clear();
            return result;
        }

        return {
            renderGroup: renderGroup,
            bindGroup: bindGroup,
            readAnswer: readAnswer,
            writeAnswer: writeAnswer,
            matchItem: matchItem,
            finish: finish,
            draft: draft,
            _norm: norm
        };
    }

    /**
     * Mount the practice card for a topic. The single entry point b2-course.html
     * and b2-demo.html call; both pass their own deps, so there is one code path
     * for paid and demo.
     */
    function mountPractice(opts) {
        if (!global.UzExerciseSession) return null;
        var topic = opts.deps.getTopic();
        if (!topic || !Array.isArray(topic.exercises) || !topic.exercises.length) return null;

        var api = create(opts.deps);
        return global.UzExerciseSession.mount({
            course: 'b2',
            topicId: topic.id,
            groups: topic.exercises,
            mountEl: opts.mountEl,
            title: opts.title || 'Практика',
            subtitle: opts.subtitle || 'Выполните упражнения урока.',
            renderGroup: api.renderGroup,
            bindGroup: api.bindGroup,
            readAnswer: api.readAnswer,
            writeAnswer: api.writeAnswer,
            matchItem: api.matchItem,
            finish: api.finish,
            draft: api.draft
        });
    }

    global.B2Host = { create: create, mountPractice: mountPractice, _norm: norm };
})(typeof window !== 'undefined' ? window : this);
