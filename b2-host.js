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
 *   PASS_PERCENT (80)  one constant drives BOTH gates, so they cannot drift
 *   per-exercise gate  below 80% the next exercise does not open; the learner
 *                      repeats THAT exercise (engine cfg.stepGate)
 *   topic gate         below 80% overall the topic is not completed and
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
    /* The platform-wide lesson threshold. 80 is the product rule for every
       course; it was 85 here while B2 was the only course with a gate at all.
       Final exams are a different contract and are NOT affected. */
    var PASS_PERCENT = 80;

    /* The shared presentation layer and the sentence-builder component, both
       resolved lazily so load order is free. B2 owns policy — thresholds,
       scoring, the results screen — and nothing about how an exercise looks. */
    function ui() { return global.UzExerciseUI; }
    function builder() { return global.UzSentenceBuilder || null; }

    /* Normalisation and escaping are the shared layer's, so an answer accepted
       in B2 is accepted identically everywhere else. */
    function norm(v) { return ui().norm(v); }
    function escHtml(s) { return ui().escHtml(s); }
    function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }

    /* ------------------------------------------------------------ host API */

    function create(deps) {
        if (!deps || typeof deps.getTopic !== 'function') {
            throw new Error('B2Host.create: deps.getTopic is required');
        }
        ui().injectStyles();

        var renderGroup = ui().renderGroup;
        var bindGroup   = ui().bindGroup;
        var readAnswer  = ui().readAnswer;
        var writeAnswer = ui().writeAnswer;
        var matchItem   = ui().matchItem;
        var afterCheck  = ui().afterCheck;

        var passPercent = Number(deps.passPercent) > 0 ? Number(deps.passPercent) : PASS_PERCENT;
        var topicIdOf = function () { var t = deps.getTopic(); return t ? t.id : null; };

        /* ------------------------------------------------------------ gate */

        /**
         * B2's per-exercise rule: below the threshold the next exercise does not
         * open and the learner repeats THIS one. The engine owns no part of the
         * decision — it only renders the verdict it is handed.
         */
        function stepGate(result) {
            if (!result || !result.total) return { pass: true };
            var correct = result.correct || 0;
            /* EXACT RATIO, NOT A ROUNDED PERCENT. pct() rounds for display, and
               39/49 rounds to 80 while really being 79.6% — which would let a
               learner past a threshold they did not reach. The comparison is
               done in integers so the boundary is exactly where it is written:
               8/10 passes, 7/10 does not, 4/5 passes, 3/5 does not. */
            if (correct * 100 >= result.total * passPercent) return { pass: true };
            return {
                pass: false,
                min: passPercent,
                percent: pct(correct, result.total),
                message: 'Mashqdan o‘tish uchun kamida ' + passPercent + '% natija kerak. ' +
                         'Ushbu mashqni qayta bajaring.'
            };
        }

        /* ----------------------------------------------------------- draft */

        /* THE DRAFT IS SCOPED, AND ITS SHAPE IS CHECKED.
        
           B2's own store is keyed by user and topic only. That is not enough
           on its own: without the COURSE, B2 topic 3 and A2 topic 3 write the
           same entry, and without a structural FINGERPRINT a lesson that gains
           or loses an exercise replays the learner's old answers into
           questions that are no longer the ones they answered. The shared
           lifecycle owns both checks, so all four courses agree on what a
           draft is; B2's existing store is still written alongside, so a
           learner mid-way through the old flow keeps everything they had. */
        function scopedDraft() {
            var L = global.UzExerciseLifecycle;
            var id = topicIdOf();
            if (!L || id == null) return null;
            var t = (typeof deps.getTopic === 'function') ? deps.getTopic() : null;
            var groups = (t && t.exercises) || [];
            var uid = (typeof deps.uid === 'function' ? deps.uid() : null)
                || global.currentUserId
                || (function () { try { return JSON.parse(global.localStorage.getItem('currentUser')).id; }
                                  catch (e) { return null; } })();
            return L.create({ course: 'B2' }).draftFor(uid, id, groups);
        }

        var draft = {
            save: function (state) {
                var sc = scopedDraft();
                if (sc) sc.save(state);
                var id = topicIdOf();
                if (id == null || typeof deps.saveDraft !== 'function') return;
                var existing = (typeof deps.loadDraft === 'function' ? deps.loadDraft(id) : null) || {};
                existing.session = state;
                existing.savedAt = Date.now();
                deps.saveDraft(id, existing);
            },
            load: function () {
                /* the scoped, fingerprinted copy is the authority */
                var sc = scopedDraft();
                if (sc) {
                    var got = sc.load();
                    if (got) return got;
                    /* nothing valid under the new scope: a legacy draft is only
                       usable if the lesson still has the shape it was written
                       against, which is exactly what the fingerprint decides —
                       so an absent scoped draft means start clean. */
                    return null;
                }
                var id = topicIdOf();
                if (id == null || typeof deps.loadDraft !== 'function') return null;
                var d = deps.loadDraft(id);
                return (d && d.session) ? d.session : null;
            },
            clear: function () {
                var sc = scopedDraft();
                if (sc) sc.clear();
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
                /* Same exact-ratio rule as the per-exercise gate, so the topic
                   verdict and the step verdicts can never disagree at the boundary. */
                percent: percent, passed: correct * 100 >= total * passPercent,
                passPercent: passPercent, breakdown: breakdown, wrong: wrong,
                timestamp: new Date().toISOString()
            };
        }

        /* --------------------------------------------------------- summary */

        /* The results screen is the shared one — see course-exercise-ui.js. */
        function buildResultsHtml(r, opts) { return ui().renderResults(r, opts); }

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
            matchItem: matchItem, stepGate: stepGate, afterCheck: afterCheck,
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

        ui().injectStyles();
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
            afterCheck: api.afterCheck,
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
