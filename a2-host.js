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
 *
 * A2 supplies no passScore and no completion gate: progression rules are
 * exactly what they were before this file existed.
 * ==========================================================================*/
(function (global) {
    'use strict';

    if (global.A2Host) return;

    function ui() { return global.UzExerciseUI; }
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
        /* A2's lessons state the task in `intro` — worked examples and word
           lists live only there, so A2 opts in to displaying it. */
        if (typeof ui().setOptions === 'function') ui().setOptions({ showTaskLine: true });

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
     * Mount the practice card for a topic — the same shape B2 uses: ONE card
     * that opens the shared session and steps through every exercise. There is
     * no second exercise UI and no grid.
     *
     * Completion is the legacy system's decision, not ours: the answers are
     * mirrored into the legacy fields and the page's own checker is invoked.
     * We only display the outcome, using the shared results screen.
     */
    function mountPractice(opts) {
        var deps = opts.deps;
        var topic = deps.getTopic();
        if (!topic || !Array.isArray(topic.exercises) || !topic.exercises.length) return null;
        if (!session()) return null;

        var api = create(deps);
        var groups = topic.exercises;

        /* A passed topic is finished: the learner may reread the feedback but
           cannot start another attempt. This mirrors how B2 treats completion. */
        var isDone = typeof deps.isCompleted === 'function' && !!deps.isCompleted(topic.id);
        var lastResult = (isDone && typeof deps.loadResult === 'function')
            ? deps.loadResult(topic.id) : null;

        function mirrorAll(answers) {
            groups.forEach(function (g) {
                (g.items || []).forEach(function (item, i) {
                    var key = g.id + '-' + i;
                    if (Object.prototype.hasOwnProperty.call(answers, key)) {
                        api.writeLegacy(g, i, answers[key]);
                    }
                });
            });
        }

        /** Score from the legacy markup the page's own checker also reads. */
        function scoreFromLegacy() {
            var total = 0, correct = 0, breakdown = [], wrong = [];
            groups.forEach(function (g) {
                var gT = 0, gC = 0;
                (g.items || []).forEach(function (item, i) {
                    total++; gT++;
                    var given = api.readLegacy(g, i);
                    if (ui().matchItem(item, given)) { correct++; gC++; }
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
                    id: g.id, title: g.title || g.id, correct: gC, total: gT,
                    percent: gT ? Math.round(gC / gT * 100) : 0
                });
            });
            var percent = total ? Math.round(correct / total * 100) : 0;
            /* THE pass decision is A2's own, taken from the very function the
               legacy scorer uses. Nothing is re-derived, nothing is hardcoded,
               and B2's threshold is never consulted — so the screen and the
               scorer cannot disagree. A host that supplies no rule gets a
               factual screen rather than an invented verdict. */
            var needed = (typeof deps.passNeeded === 'function' && total)
                ? deps.passNeeded(total) : null;
            return {
                topicId: topic.id, score: correct, total: total, errors: total - correct,
                percent: percent,
                passed: needed === null ? null : correct >= needed,
                passPercent: needed === null ? null : Math.round(needed / total * 100),
                passNeeded: needed,
                breakdown: breakdown, wrong: wrong, timestamp: new Date().toISOString()
            };
        }

        if (isDone) {
            /* Review entry instead of a practice card. */
            opts.mountEl.innerHTML =
                '<div class="b2h"><div class="a2-done">' +
                '<div class="a2-done-badge">&#10004; Mavzu yakunlangan</div>' +
                '<p>Siz barcha mashqlarni muvaffaqiyatli bajardingiz. ' +
                'Natijalarni istalgan vaqtda ko\'rishingiz mumkin.</p>' +
                (lastResult
                    ? '<button type="button" class="a2-done-btn" data-a2-review>' +
                      '&#128203; Natijalarni ko\'rish</button>'
                    : '') +
                '</div></div>';
            if (lastResult) {
                opts.mountEl.addEventListener('click', function (e) {
                    if (!e.target.closest || !e.target.closest('[data-a2-review]')) return;
                    var host = document.getElementById('a2ReviewHost') || (function () {
                        var d = document.createElement('div');
                        d.id = 'a2ReviewHost';
                        d.style.display = 'none';
                        document.body.appendChild(d);
                        return d;
                    })();
                    var s = session().mount({
                        course: 'a2', topicId: topic.id, groups: groups, mountEl: host,
                        title: 'Natijalar',
                        renderGroup: ui().renderGroup, bindGroup: ui().bindGroup,
                        readAnswer: ui().readAnswer, writeAnswer: ui().writeAnswer,
                        matchItem: ui().matchItem,
                        renderSummary: function () {
                            lastResult.archived = true;
                            return ui().renderResults(lastResult, { archived: true });
                        },
                        bindSummary: function (root, payload, sess) {
                            root.addEventListener('click', function () {
                                if (sess && sess.close) sess.close();
                            });
                        },
                        draft: { load: function () { return null; },
                                 save: function () {}, clear: function () {} },
                        finish: function () { return lastResult; }
                    });
                    if (s) s.showSummary(lastResult);
                });
            }
            return null;
        }

        return session().mount({
            course: 'a2',
            topicId: topic.id,
            groups: groups,
            mountEl: opts.mountEl,
            title: opts.title || 'Amaliy mashqlar',
            subtitle: opts.subtitle ||
                (groups.length + ' ta mashq. Javoblar avtomatik saqlanadi.'),
            summaryLabel: 'Natijalar',
            renderGroup: ui().renderGroup,
            bindGroup: function (root, g) {
                ui().bindGroup(root, g);
                var sync = function () { api.mirror(root, g); };
                root.addEventListener('input', sync);
                root.addEventListener('change', sync);
                root.addEventListener('click', function () { setTimeout(sync, 0); });
            },
            readAnswer: ui().readAnswer,
            writeAnswer: ui().writeAnswer,
            matchItem: ui().matchItem,
            afterCheck: ui().afterCheck,
            /* No passScore and no stepGate: A2 progression is untouched. */
            draft: {
                load: function () {
                    var answers = {}, any = false;
                    groups.forEach(function (g) {
                        (g.items || []).forEach(function (item, i) {
                            var v = api.readLegacy(g, i);
                            answers[g.id + '-' + i] = v;
                            if (v) any = true;
                        });
                    });
                    return any ? { v: 1, cursor: 0, answers: answers, checked: {} } : null;
                },
                save: function (state) { mirrorAll((state && state.answers) || {}); },
                clear: function () { /* draft lifetime belongs to the page */ }
            },
            finish: function (answers) {
                mirrorAll(answers || {});
                var r = scoreFromLegacy();
                /* keep the attempt so a completed topic can be reviewed later */
                if (typeof deps.saveResult === 'function') {
                    try { deps.saveResult(topic.id, r); } catch (e) {}
                }
                /* The page's own checker owns scoring, progress and Firebase. */
                if (typeof deps.runLegacyCheck === 'function') {
                    try {
                        var p = deps.runLegacyCheck(topic.id);
                        if (p && typeof p.catch === 'function') p.catch(function () {});
                    } catch (e) { /* never cost the learner their screen */ }
                }
                if (typeof deps.showResults === 'function') {
                    try { deps.showResults(ui().renderResults(r, {}), r); } catch (e) {}
                }
                return r;
            },
            renderSummary: function (payload) {
                return ui().renderResults(payload || scoreFromLegacy(), {});
            },
            bindSummary: function (root, payload, sess) {
                root.addEventListener('click', function (e) {
                    var b = e.target && e.target.closest ? e.target.closest('[data-b2h-act]') : null;
                    if (!b) return;
                    var act = b.getAttribute('data-b2h-act');
                    if (act === 'complete' && typeof deps.completeTopic === 'function') {
                        /* presses the page's own completion button: one path to
                           progress, Firebase and statistics */
                        try { deps.completeTopic(topic.id, payload); } catch (err) {}
                    }
                    if (act === 'restart') {
                        if (sess && typeof sess.reset === 'function') sess.reset();
                        if (sess && typeof sess.open === 'function') { sess.open(); return; }
                    }
                    if (sess && typeof sess.close === 'function') sess.close();
                });
            }
        });
    }

    global.A2Host = { create: create, mountPractice: mountPractice };
})(typeof window !== 'undefined' ? window : this);
