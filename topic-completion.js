/**
 * topic-completion.js — finishing a topic. One rule, one button, four courses.
 *
 * THE RULE
 *
 *     a topic is earned  <=>  the official exercise score reaches 80%
 *
 * and nothing else. The vocabulary deck is a study aid: its progress is kept,
 * it is reported to the server like any other section, and it decides nothing.
 *
 * WHY IT CHANGED. The old rule needed BOTH halves, and it stranded learners in
 * a way no amount of client repair could reach. Two arrived the same day: one
 * had finished a B2 topic three times over, and a brand-new A1 account
 * finished the exercises AND the whole deck and still faced a locked topic 2.
 * Anything that left the deck unrecorded — finished before the component model
 * shipped, a completion screen closed one tap early, one dropped call — locked
 * the learner out of the rest of the course, and the only remedy on offer was
 * to walk a hundred words again and hope. A mandatory half a learner cannot
 * reliably report is not a gate, it is a trap.
 *
 * WHY THIS FILE EXISTS. The same pipeline was written three times over —
 * exercise-lifecycle.js for A2/B2, a1-host.js, b1-host.js — and the three
 * drifted, which is how a rule can be "fixed" in one course and still be
 * wrong in the others. The RULE, the BUTTON, the MESSAGES, the NAVIGATION and
 * the RECONCILIATION now live here once. What stays per-course is only what
 * genuinely differs: which page function opens the next topic.
 *
 * THE ONE HONEST LIMIT, unchanged: the browser asserts the score. The server
 * records what it is told and draws its own conclusion from the record; it
 * cannot re-mark the paper.
 */
(function (global) {
    'use strict';

    var PASS_PERCENT = 80;

    var SAVE_FAILED = 'Natijani saqlab bo‘lmadi.\nInternet aloqasini tekshirib, qayta urinib ko‘ring.';
    var NOT_EARNED = 'Mavzuni yakunlash uchun kamida 80% kerak.';
    var FINISH_LABEL = 'Завершить тему и перейти дальше';
    var FINISH_LAST_LABEL = 'Завершить тему и перейти к экзамену';
    var SAVING_LABEL = 'Сохранение...';
    var RETRY_LABEL = 'Qayta urinish';

    /* ------------------------------------------------------------ the rule */

    /**
     * The official score of an attempt, as {score, total, percent}.
     *
     * Accepts either a durable snapshot ({score, total}) or a live score
     * object ({score, total}) — A1/B1 and A2/B2 built different shapes and
     * both carry these two numbers, which is all the rule needs.
     */
    function officialScore(x) {
        var o = x || {};
        var score = Number(o.score);
        var total = Number(o.total);
        if (!Number.isFinite(score) || score < 0) score = 0;
        if (!Number.isFinite(total) || total < 0) total = 0;
        return {
            score: score,
            total: total,
            /* the DISPLAYED percent; the verdict never rounds (see earned) */
            percent: total ? Math.round((score / total) * 100) : 0
        };
    }

    /**
     * Is the topic earned?
     *
     * An EXACT integer ratio, never a rounded percent: Math.round puts the
     * boundary in the wrong place — 39/49 rounds to 80 while really being
     * 79.6% — and a learner would clear a bar they had not reached. Exactly
     * 80% passes; 79% does not.
     *
     * Unanswered questions are already counted in `total`, so an attempt with
     * gaps that still reaches 80% overall is earned, exactly as intended.
     */
    function earned(x) {
        var s = officialScore(x);
        if (!s.total) return false;
        return s.score * 100 >= s.total * PASS_PERCENT;
    }

    /* --------------------------------------------------------- the button */

    /**
     * The one action area every course's summary shows.
     *
     * state: { snapshot, outcome, isLast, hasVocabulary }
     *
     *   not earned          -> say what is missing, offer another attempt
     *   earned, not sent    -> THE button
     *   sent and completed  -> confirmation and the way onward
     *   sent and failed     -> what happened, and a retry that works
     */
    function renderAction(state) {
        var st = state || {};
        var out = st.outcome;
        var isLast = st.isLast === true;
        var ok = earned(st.snapshot);

        if (!ok) {
            return note('err', NOT_EARNED) +
                   acts(btn('retry-exercises', 'Qayta ishlash', 'primary'));
        }

        var done = out && out.ok === true && out.topicCompleted !== false;
        var failed = out && !done;

        if (failed) {
            /* A completion that did not land. NEVER a silent close: say what
               happened, and leave a button that really tries again. */
            return note('err', out.message || SAVE_FAILED) +
                   acts(btn('finish', RETRY_LABEL, 'primary') + btn('close', 'Закрыть', 'ghost'));
        }

        /* ONE BUTTON, THE SAME IN ALL FOUR COURSES, in both the state where the
           report still has to be sent (A2/B2 ask first) and the state where it
           already landed (A1/B1 report as the exercises end). The learner
           cannot see that difference and should not have to: the promise the
           screen makes is that passing the threshold takes them onward, and
           one press does exactly that either way. */
        return note(done ? 'done' : 'pass',
                    done
                        ? (isLast
                            ? 'Тема завершена. Все темы курса пройдены — доступен итоговый экзамен.'
                            : 'Тема завершена. Следующая тема открыта.')
                        : ('Порог ' + PASS_PERCENT + '% пройден. Тему можно завершить.' +
                           (st.hasVocabulary === false ? '' :
                            ' Словарь темы — дополнительный тренажёр, он не обязателен.'))) +
               acts(btn('finish', isLast ? FINISH_LAST_LABEL : FINISH_LABEL, 'primary') +
                    (st.hasVocabulary === false ? '' :
                     btn('vocab', 'Lug‘atni ochish', 'ghost')));
    }

    function note(kind, text) {
        return '<div class="uztc-note uztc-' + kind + '">' +
               esc(text).replace(/\n/g, '<br>') + '</div>';
    }
    function acts(inner) { return '<div class="uztc-acts">' + inner + '</div>'; }
    function btn(act, label, kind) {
        return '<button type="button" class="uztc-btn' + (kind === 'ghost' ? ' ghost' : '') +
               '" data-uztc="' + act + '">' + esc(label) + '</button>';
    }
    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    var STYLE_ID = 'uz-topic-completion-css';
    function injectStyles() {
        if (typeof document === 'undefined' || !document.getElementById) return;
        if (document.getElementById(STYLE_ID)) return;
        var css = [
            '.uztc-note{margin:18px 0 0;border-radius:14px;padding:14px 16px;text-align:center;',
            'font-size:.98rem;line-height:1.6}',
            '.uztc-note.uztc-pass{background:#EFFAF4;border:1px solid #BCE9D4;color:#0B5D46}',
            '.uztc-note.uztc-done{background:#EFFAF4;border:1px solid #BCE9D4;color:#0B5D46}',
            '.uztc-note.uztc-err{background:#FFF5F5;border:1px solid #EFB3B3;color:#8E2B2B}',
            '.uztc-acts{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:16px}',
            '.uztc-btn{font-family:inherit;font-size:1rem;font-weight:800;border:none;cursor:pointer;',
            'border-radius:12px;padding:15px 28px;background:linear-gradient(135deg,#3F51B5,#5C6BC0);',
            'color:#fff;line-height:1.25}',
            '.uztc-btn.ghost{background:#fff;color:#3F51B5;border:1px solid #C9D4EE;font-weight:700}',
            '.uztc-btn:disabled{opacity:.6;cursor:default}',
            '@media(max-width:640px){.uztc-btn{width:100%;padding:16px 18px}}'
        ].join('');
        var el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = css;
        (document.head || document.documentElement).appendChild(el);
    }

    /** Put the action area into an open summary, replacing any earlier one. */
    function apply(root, state) {
        if (!root || !root.querySelector) return null;
        injectStyles();
        var old = root.querySelector('[data-uztc-area]');
        if (old && old.parentNode) old.parentNode.removeChild(old);
        var doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
        if (!doc) return null;
        var box = doc.createElement('div');
        box.setAttribute('data-uztc-area', '1');
        box.innerHTML = renderAction(state);
        (root.querySelector('.b2h-sum') || root.querySelector('.b2h-res') || root).appendChild(box);
        return box;
    }

    /* --------------------------------------------------------- the action */

    /**
     * Press the button: save, report, apply the server's answer, move on.
     *
     * ctx: {
     *   topicId, isLast, hasVocabulary,
     *   snapshot,                        the attempt, for the rule
     *   outcome,                         a completion that ALREADY ran (A1/B1
     *                                    report at the end of the exercises)
     *   finish()      -> Promise<outcome>   the host's own pipeline
     *   onCompleted(nextTopic, outcome)     apply the server's array, repaint
     *   navigate(nextTopic, outcome)        null nextTopic = course finished
     *   openVocabulary(id), retryExercises(), close()
     * }
     *
     * ONE navigate() rather than four callbacks: where a course sends the
     * learner is the only thing that genuinely differs between the four.
     *
     * Nothing here decides progression. The server's outcome does; this only
     * refuses to pretend.
     */
    function bind(root, ctx) {
        if (!root || !root.addEventListener) return;
        var c = ctx || {};
        var state = { snapshot: c.snapshot, outcome: c.outcome || null,
                      isLast: c.isLast === true, hasVocabulary: c.hasVocabulary };
        var busy = false;

        root.addEventListener('click', function (e) {
            var b = e.target && e.target.closest ? e.target.closest('[data-uztc]') : null;
            if (!b) return;
            var act = b.getAttribute('data-uztc');

            if (act === 'close') { call(c.close); return; }
            if (act === 'vocab') { call(c.close); call(c.openVocabulary, c.topicId); return; }
            if (act === 'retry-exercises') { call(c.retryExercises); return; }
            if (act !== 'finish' || busy) return;

            /* ALREADY DONE: this press is only the journey onward. */
            if (state.outcome && state.outcome.ok === true
                && state.outcome.topicCompleted !== false) {
                go(state.outcome);
                return;
            }

            /* THE THRESHOLD IS THE ONLY PRECONDITION. */
            if (!earned(state.snapshot)) {
                state.outcome = { ok: false, message: NOT_EARNED };
                apply(root, state); bindOnce();
                return;
            }
            busy = true;
            b.disabled = true;
            b.textContent = SAVING_LABEL;
            Promise.resolve()
                .then(function () { return typeof c.finish === 'function' ? c.finish() : null; })
                .then(function (outcome) {
                    busy = false;
                    if (outcome && outcome.ok === true && outcome.topicCompleted !== false) {
                        state.outcome = outcome;
                        go(outcome);
                        return;
                    }
                    /* A PIPELINE THAT RESOLVES WITH NOTHING IS NOT A SUCCESS.
                       Silence here used to render as "the threshold is passed,
                       press to finish" — a button the learner had just pressed,
                       offering no hint that anything had gone wrong. */
                    state.outcome = outcome || { ok: false, message: SAVE_FAILED };
                    apply(root, state);
                }, function () {
                    busy = false;
                    state.outcome = { ok: false, message: SAVE_FAILED };
                    apply(root, state);
                });
        });

        /* Repaint the topic list from the SERVER's answer, then move. The
           page repaints before the learner is sent anywhere, so the list they
           land on already shows the next topic open. */
        function go(outcome) {
            call(c.onCompleted, outcome.nextTopic == null ? null : outcome.nextTopic, outcome);
            call(c.close);
            call(c.navigate, outcome.nextTopic == null ? null : outcome.nextTopic, outcome);
        }

        /* The action area is re-rendered in place; the delegated listener above
           is on the summary root, so it keeps working without rebinding. */
        apply(root, state);
        return state;
    }

    /**
     * The whole contract in one call, for a host that has a summary root.
     *
     * Returns the live state object so a test can read what the learner is
     * actually being offered rather than guessing from markup.
     */
    function attach(root, ctx) {
        injectStyles();
        return bind(root, ctx);
    }

    function call(fn, a, b) {
        if (typeof fn !== 'function') return false;
        try { fn(a, b); } catch (e) {}
        return true;
    }

    /* -------------------------------------------------- stuck learners */

    /**
     * Topics whose stored attempt ALREADY earned them, but which the server
     * never completed — because the old rule was still waiting on a deck.
     *
     * Returns the ids to report. Idempotent by construction: a topic already
     * in `completedTopics`, or with the exercises component already recorded,
     * is not returned, so a second page load asks for nothing. A stored
     * attempt below 80% is never returned.
     */
    function stuckTopics(opts) {
        var o = opts || {};
        var results = o.results || {};
        var state = o.courseState || {};
        var done = (state.completedTopics || []).map(Number);
        var comps = state.topicComponents || {};
        var field = o.resultField;
        var out = [];
        (o.topicIds || []).forEach(function (id) {
            var n = Number(id);
            if (done.indexOf(n) >= 0) return;
            var row = comps[n] || comps[String(n)] || {};
            if (row.exercisesCompleted === true) return;   /* already reported */
            var rec = results['topic_' + n] || results[n] || results[String(n)] || {};
            var snap = field ? rec[field] : null;
            if (!snap) {
                /* every shape the four courses ever stored an attempt in */
                snap = rec.a1ExerciseResult || rec.b1ExerciseResult
                    || rec.a2ExerciseResult || rec.b2ExerciseResult || null;
            }
            if (!snap || snap.completed !== true) return;
            if (Number(snap.topicId) !== n) return;
            if (!earned(snap)) return;                     /* below 80: never */
            out.push(n);
        });
        return out;
    }

    /**
     * Report those topics, one at a time, through the SAME authoritative call
     * the button uses. The client never writes `completedTopics`.
     */
    async function reconcile(opts) {
        var o = opts || {};
        var ids = stuckTopics(o);
        var res = { checked: (o.topicIds || []).length, reported: [], failed: [] };
        if (!ids.length || typeof o.report !== 'function') return res;
        for (var i = 0; i < ids.length; i++) {
            var ack;
            try { ack = await o.report(ids[i]); } catch (e) { ack = null; }
            if (ack && ack.ok === true) {
                res.reported.push(ids[i]);
                if (Array.isArray(ack.completedTopics)) res.completedTopics = ack.completedTopics.slice();
            } else {
                res.failed.push(ids[i]);
                break;                     /* a refusing network refuses the rest */
            }
        }
        return res;
    }

    global.UzTopicCompletion = {
        PASS_PERCENT: PASS_PERCENT,
        officialScore: officialScore,
        earned: earned,
        renderAction: renderAction,
        injectStyles: injectStyles,
        apply: apply,
        bind: bind,
        attach: attach,
        stuckTopics: stuckTopics,
        reconcile: reconcile,
        MESSAGES: { SAVE_FAILED: SAVE_FAILED, NOT_EARNED: NOT_EARNED,
                    FINISH: FINISH_LABEL, FINISH_LAST: FINISH_LAST_LABEL }
    };
})(typeof window !== 'undefined' ? window : this);
