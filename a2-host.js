/* ============================================================================
 * a2-host.js — the A2 HOST LAYER.
 *
 * A2 gets B2's interface without inheriting B2's rules.
 *
 * ---------------------------------------------------------------------------
 * THE CENTRAL DECISION: WRITE THROUGH, DO NOT REPLACE
 * ---------------------------------------------------------------------------
 * A2 already has a scorer — window.checkTopic1Exercises — which reads the
 * legacy exercise markup out of #quizSection and owns scoring, Firebase, the
 * draft store, statistics and progress. Re-implementing any of that here would
 * create a second source of truth for a live course.
 *
 * So the legacy markup stays exactly where it is and keeps its data hooks; it
 * is simply hidden from view. The new session UI renders on top, and every
 * answer the learner gives is mirrored straight back into the corresponding
 * legacy field. The consequences are the point:
 *
 *   scoring        unchanged — the page's own checker reads what it always read
 *   drafts         unchanged — A2's autosave watches those same fields
 *   restore        unchanged — the session seeds itself FROM those fields
 *   Firebase       unchanged — never touched here
 *   progress       unchanged — completion still runs through the page
 *   element ids    unchanged — nothing is renamed or removed
 *
 * ---------------------------------------------------------------------------
 * WHAT IS REUSED
 * ---------------------------------------------------------------------------
 *   course-exercise-ui.js   rendering, binding, reading, matching  (with B2)
 *   sentence-builder.js     word-card exercises                    (with B2)
 *   exercise-session.js     the stepping modal, autosave, resume   (with B2)
 *   exercise-cards.js       the per-exercise card grid
 *
 * A2 supplies no passScore and no completion gate: progression rules are
 * exactly what they were before this file existed.
 * ==========================================================================*/
(function (global) {
    'use strict';

    if (global.A2Host) return;

    function ui() { return global.UzExerciseUI; }
    function cards() { return global.UzExerciseCards; }
    function session() { return global.UzExerciseSession; }

    /* ------------------------------------------------- the legacy substrate */

    /**
     * The legacy field for one item. These are the very hooks A2's own scorer
     * queries, which is why they must keep existing and keep their values.
     */
    function legacyInput(scope, key) {
        return scope ? scope.querySelector('[data-t1-input="' + key + '"]') : null;
    }
    function legacyRow(scope, key) {
        return scope ? scope.querySelector('[data-t1-row="' + key + '"]') : null;
    }

    /** Read an answer out of the legacy markup, so the session starts in sync. */
    function readLegacy(scope, g, i) {
        var key = g.id + '-' + i;
        if (g.type === 'choice') {
            var row = legacyRow(scope, key);
            var sel = row ? row.querySelector('.t1-opt.selected') : null;
            return sel ? (sel.getAttribute('data-value') || '') : '';
        }
        var inp = legacyInput(scope, key);
        return inp ? inp.value : '';
    }

    /**
     * Mirror one answer back into the legacy markup and let the page notice.
     * The `input`/`change` events are what A2's existing autosave listens for,
     * so drafts keep saving through the path they always used.
     */
    function writeLegacy(scope, g, i, value) {
        var key = g.id + '-' + i;
        if (g.type === 'choice') {
            var row = legacyRow(scope, key);
            if (!row) return;
            var hit = null;
            row.querySelectorAll('.t1-opt').forEach(function (o) {
                var same = (o.getAttribute('data-value') || '') === value;
                o.classList.toggle('selected', same);
                if (same) hit = o;
            });
            if (hit) {
                try { hit.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
            }
            return;
        }
        var inp = legacyInput(scope, key);
        if (!inp) return;
        inp.value = (value == null ? '' : value);
        try { inp.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    }

    /** Has the page's own checker already graded this item? */
    function legacyVerdict(scope, g, i) {
        var key = g.id + '-' + i;
        var el = g.type === 'choice' ? legacyRow(scope, key) : legacyInput(scope, key);
        if (!el) return null;
        if (el.classList.contains('correct')) return true;
        if (el.classList.contains('incorrect')) return false;
        return null;
    }

    /* ------------------------------------------------------------- the host */

    /**
     * @param deps.getTopic()   the topic being shown ({ id, exercises: [...] })
     * @param deps.getScope()   the element holding the legacy markup
     * @param deps.onFinish?    called after an exercise is closed
     */
    function create(deps) {
        if (!deps || typeof deps.getTopic !== 'function') {
            throw new Error('A2Host.create: deps.getTopic is required');
        }
        ui().injectStyles();

        var scope = function () {
            return typeof deps.getScope === 'function' ? deps.getScope() : document;
        };

        /** Every answer, mirrored the moment it changes. */
        function mirror(root, g) {
            (g.items || []).forEach(function (item, i) {
                var v = ui().readAnswer(root, g.id + '-' + i, g);
                writeLegacy(scope(), g, i, v);
            });
        }

        /**
         * Drafts are the page's, not ours. `load` seeds the session from the
         * legacy fields (which A2 already restored); `save` writes back into
         * them so A2's own autosave persists exactly as before.
         */
        function draftFor(g) {
            return {
                load: function () {
                    var answers = {};
                    var any = false;
                    (g.items || []).forEach(function (item, i) {
                        var v = readLegacy(scope(), g, i);
                        answers[g.id + '-' + i] = v;
                        if (v) any = true;
                    });
                    return any ? { v: 1, cursor: 0, answers: answers, checked: {} } : null;
                },
                save: function (state) {
                    var a = (state && state.answers) || {};
                    (g.items || []).forEach(function (item, i) {
                        var key = g.id + '-' + i;
                        if (Object.prototype.hasOwnProperty.call(a, key)) {
                            writeLegacy(scope(), g, i, a[key]);
                        }
                    });
                },
                clear: function () { /* the page owns draft lifetime, not us */ }
            };
        }

        /** How far along one exercise is, from the page's own markup. */
        function stateOf(g) {
            var total = (g.items || []).length;
            if (!total) return null;
            var answered = 0, correct = 0, graded = 0;
            (g.items || []).forEach(function (item, i) {
                if (String(readLegacy(scope(), g, i) || '').trim() !== '') answered++;
                var v = legacyVerdict(scope(), g, i);
                if (v !== null) { graded++; if (v) correct++; }
            });
            /* Only claim a score once the page has actually graded the item —
               this host never scores anything itself. */
            if (graded === total) return { done: true, correct: correct, total: total };
            if (answered) return { done: false, correct: answered, total: total, partial: true };
            return null;
        }

        /** Open one exercise in the shared stepping modal. */
        function open(index, onClose) {
            var topic = deps.getTopic();
            var g = topic && topic.exercises && topic.exercises[index];
            if (!g || !session()) return null;

            var holder = document.getElementById('a2SessionHolder');
            if (!holder) {
                holder = document.createElement('div');
                holder.id = 'a2SessionHolder';
                holder.style.display = 'none';
                document.body.appendChild(holder);
            }

            var s = session().mount({
                course: 'a2',
                topicId: topic.id,
                groups: [g],
                mountEl: holder,
                title: g.title || 'Mashq',
                /* No passScore and no stepGate: A2 progression is untouched. */
                renderGroup: ui().renderGroup,
                bindGroup: function (root) {
                    ui().bindGroup(root);
                    /* mirror on every interaction, not only on save */
                    root.addEventListener('input', function () { mirror(root, g); });
                    root.addEventListener('change', function () { mirror(root, g); });
                    root.addEventListener('click', function () {
                        setTimeout(function () { mirror(root, g); }, 0);
                    });
                },
                readAnswer: ui().readAnswer,
                writeAnswer: ui().writeAnswer,
                matchItem: ui().matchItem,
                afterCheck: ui().afterCheck,
                draft: draftFor(g),
                finish: function (answers) {
                    (g.items || []).forEach(function (item, i) {
                        var key = g.id + '-' + i;
                        if (Object.prototype.hasOwnProperty.call(answers, key)) {
                            writeLegacy(scope(), g, i, answers[key]);
                        }
                    });
                    return null;
                },
                onClose: function () { if (typeof onClose === 'function') onClose(); }
            });

            if (s) { s.open(); }
            return s;
        }

        return {
            open: open,
            stateOf: stateOf,
            mirror: mirror,
            readLegacy: function (g, i) { return readLegacy(scope(), g, i); },
            writeLegacy: function (g, i, v) { return writeLegacy(scope(), g, i, v); }
        };
    }

    /**
     * Render the exercise grid for a topic. Tapping a card opens that exercise;
     * closing it refreshes the grid from the page's own markup.
     */
    function mountCards(opts) {
        var deps = opts.deps;
        var topic = deps.getTopic();
        if (!topic || !Array.isArray(topic.exercises) || !topic.exercises.length) return null;
        if (!cards()) return null;

        var api = create(deps);
        var grid = cards().mount({
            mountEl: opts.mountEl,
            groups: topic.exercises,
            title: opts.title || 'Amaliy mashqlar',
            subtitle: opts.subtitle ||
                (topic.exercises.length + ' ta mashq. Har birini alohida bajaring.'),
            stateOf: api.stateOf,
            onOpen: function (i) {
                api.open(i, function () { if (grid) grid.refresh(); });
            }
        });
        return { grid: grid, api: api };
    }

    global.A2Host = { create: create, mountCards: mountCards };
})(typeof window !== 'undefined' ? window : this);
