/**
 * vocabulary-component.js — reporting the vocabulary half of a paid topic.
 *
 * WHY THIS FILE EXISTS.
 *
 * A paid topic has two halves, and since the component model landed the server
 * completes a topic only when BOTH are reported: /api/progress?action=
 * complete-topic no longer completes anything, it only finalises what the
 * stored component record already earns. The exercise half is reported by the
 * course pages. The vocabulary half was reported by NOBODY — not one of the
 * four vocabulary pages called completeCourseComponent — so for a new learner
 * bothComponentsComplete() was never true, finalizeCompletedTopics() always
 * returned null, and no topic in any course could be completed at all. The
 * backend model was right, the client helper was right, and there was no
 * shipped path that could reach completion. This is the missing half.
 *
 * WHAT COUNTS AS DONE. Not opening the page, not viewing a card, not a timer —
 * the deck's own completion screen, which a learner reaches only by walking
 * every word of the topic. That screen already existed and already persisted
 * progress; this hangs the authoritative report off it.
 *
 * WHAT IT REFUSES TO DO. It never reports on load, never reports a topic twice
 * when the server already has it, never trusts a reply that is not shaped like
 * a verdict, and never decides progression itself — the server's array is the
 * only progression there is.
 */
(function (global) {
    'use strict';

    var SAVE_FAILED = 'Natijani saqlab bo‘lmadi.\nInternet aloqasini tekshirib, qayta urinib ko‘ring.';
    var NEED_EXERCISES = 'Avval ushbu mavzudagi mashqlarni yakunlang.';
    var LEGACY_DONE = 'Ushbu mavzu avval yakunlangan.';

    function store() {
        return {
            get: function (k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } },
            set: function (k, v) { try { global.localStorage.setItem(k, v); } catch (e) {} },
            remove: function (k) { try { global.localStorage.removeItem(k); } catch (e) {} }
        };
    }

    /** Who is reading. Vocabulary pages keep the session under `currentUser`. */
    function uid() {
        try { return (JSON.parse(global.localStorage.getItem('currentUser')) || {}).id || null; }
        catch (e) { return null; }
    }

    /**
     * The local note that says "the learner finished this deck, the server has
     * not confirmed it yet". It exists so a failed component call survives the
     * page: without it the retry handle dies on reload and the learner would
     * be asked to walk the whole deck again to produce a signal the server
     * already deserves. Scoped by user, course and topic so nothing leaks
     * between them.
     */
    function pendingKey(course, id, who) {
        return 'uzdarus:vocab-pending:' + (who || 'guest') + ':' + course + ':' + id;
    }
    function markPending(course, id, who) {
        store().set(pendingKey(course, id, who),
            JSON.stringify({ v: 1, course: course, topicId: Number(id), at: Date.now() }));
    }
    function readPending(course, id, who) {
        var raw = store().get(pendingKey(course, id, who));
        if (!raw) return null;
        var d;
        try { d = JSON.parse(raw); } catch (e) { return null; }
        /* a note from another course or another topic is not this one's proof */
        if (!d || d.course !== course || Number(d.topicId) !== Number(id)) return null;
        return d;
    }
    function clearPending(course, id, who) { store().remove(pendingKey(course, id, who)); }

    /** Has the SERVER already recorded the vocabulary half of this topic? */
    function vocabularyAcked(courseState, topicId) {
        var tc = courseState && courseState.topicComponents;
        var row = tc && (tc[topicId] != null ? tc[topicId] : tc[String(topicId)]);
        return !!(row && row.vocabularyCompleted === true);
    }

    /** A topic finished under the old one-step rule is complete and stays so. */
    function legacyComplete(courseState, topicId) {
        var list = (courseState && courseState.completedTopics) || [];
        return Array.isArray(list) && list.some(function (n) { return Number(n) === Number(topicId); });
    }

    /** A component reply is a verdict only when it is shaped like one. */
    function validAck(ack, course, topicId) {
        if (!ack || ack.ok !== true) return false;
        if (String(ack.course).toUpperCase() !== String(course).toUpperCase()) return false;
        if (Number(ack.topicId) !== Number(topicId)) return false;
        if (!ack.components || typeof ack.components !== 'object') return false;
        if (ack.components.vocabularyCompleted !== true) return false;
        if (typeof ack.topicCompleted !== 'boolean') return false;
        if (!Array.isArray(ack.completedTopics)) return false;
        return true;
    }

    /** Does the learner's own stored progress prove this deck is finished? */
    function deckFinished(learned, id, total) {
        var need = Number(total);
        if (!Number.isFinite(need) || need <= 0) return false;
        var have = Number((learned || {})['topic_' + id]);
        return Number.isFinite(have) && have >= need;
    }

    /**
     * THE LEARNER ALREADY DID THE WORK; THE SERVER NEVER HEARD ABOUT IT.
     *
     * Nobody reported the vocabulary half until this file shipped, so every
     * deck finished before then is invisible to the component model: the page
     * shows 100%, the server has no vocabularyCompleted, and the topic can
     * never close. The only remedy on offer was to walk the whole deck again —
     * which is precisely what the learner who reported this did, twice, to no
     * effect.
     *
     * So report what their stored progress already proves, through the SAME
     * authoritative call the completion screen makes. Nothing here decides
     * progression: the server owns completedTopics and still refuses to
     * complete a topic whose exercises half is missing. Re-running it costs
     * nothing — reportVocabulary answers `already` for anything acknowledged,
     * so the second load of the page sends no calls at all.
     *
     * opts: { course, topics:[{id,total}], learned, courseState, api, user }
     */
    async function reconcileLearned(opts) {
        opts = opts || {};
        var course = String(opts.course || '').toUpperCase();
        var topics = Array.isArray(opts.topics) ? opts.topics : [];
        var state = opts.courseState || {};
        var out = { course: course, reported: [], failed: [], skipped: 0 };
        if (!course || !topics.length) return out;

        for (var i = 0; i < topics.length; i++) {
            var id = Number(topics[i] && topics[i].id);
            if (!Number.isFinite(id) || id < 1) continue;
            /* ONLY what the learner's own progress proves — never a guess. */
            if (!deckFinished(opts.learned, id, topics[i].total)) continue;
            if (vocabularyAcked(state, id) || legacyComplete(state, id)) { out.skipped++; continue; }

            var res = await reportVocabulary({
                course: course, topicId: id, courseState: state,
                api: opts.api, user: opts.user
            });
            if (res && res.ok === true && res.stage === 'done') {
                state.topicComponents = state.topicComponents || {};
                state.topicComponents[id] = Object.assign(
                    {}, state.topicComponents[id], { vocabularyCompleted: true });
                if (Array.isArray(res.completedTopics)) {
                    state.completedTopics = res.completedTopics.slice();
                }
                out.reported.push(id);
                out.completedTopics = state.completedTopics;
            } else if (!res || res.ok !== true) {
                /* A network that just refused will refuse the rest too. The
                   pending note reportVocabulary left survives the reload. */
                out.failed.push(id);
                break;
            } else {
                out.skipped++;
            }
        }
        return out;
    }

    /**
     * Report the vocabulary half, authoritatively.
     *
     * opts: { course, topicId, courseState, api:{completeCourseComponent}, user }
     *
     * Returns a plain outcome; the page renders it. Nothing here writes to the
     * DOM, so the same function serves four pages that look nothing alike.
     */
    async function reportVocabulary(opts) {
        opts = opts || {};
        var course = String(opts.course || '').toUpperCase();
        var topicId = Number(opts.topicId);
        var who = opts.user || uid();
        var api = opts.api || {};

        if (!course || !Number.isFinite(topicId) || topicId < 1) {
            return { ok: false, stage: 'input', message: null };
        }
        /* Already recorded — say so and send nothing. Re-reporting on every
           visit would be harmless server-side and wasteful everywhere else. */
        if (vocabularyAcked(opts.courseState, topicId)) {
            clearPending(course, topicId, who);
            return { ok: true, stage: 'already', alreadyAcked: true, topicCompleted: false, message: null };
        }
        /* A topic completed under the legacy rule needs no component at all. */
        if (legacyComplete(opts.courseState, topicId)) {
            clearPending(course, topicId, who);
            return { ok: true, stage: 'legacy', legacy: true, topicCompleted: true, message: null };
        }

        /* THE WORK IS DONE LOCALLY WHETHER OR NOT THE NETWORK AGREES. Written
           before the call, so a failure here is recoverable after a reload. */
        markPending(course, topicId, who);

        if (typeof api.completeCourseComponent !== 'function') {
            return { ok: false, stage: 'component', retryComponent: true, message: SAVE_FAILED };
        }
        var ack;
        try {
            ack = await api.completeCourseComponent(course, topicId, 'vocabulary');
        } catch (e) {
            ack = null;
        }
        if (!validAck(ack, course, topicId)) {
            return { ok: false, stage: 'component', retryComponent: true, message: SAVE_FAILED };
        }

        clearPending(course, topicId, who);
        return {
            ok: true,
            stage: 'done',
            vocabularyCompleted: true,
            topicCompleted: ack.topicCompleted === true,
            completedTopics: ack.completedTopics.slice(),
            nextTopic: ack.topicCompleted === true ? (ack.nextTopic == null ? null : ack.nextTopic) : null,
            message: ack.topicCompleted === true ? null : NEED_EXERCISES
        };
    }

    /**
     * What the page should show when a topic is opened.
     *
     *   'learn'   — nothing recorded; the deck behaves normally.
     *   'sync'    — the learner finished the deck but the server never
     *               acknowledged it. Offer the component call ALONE.
     *   'done'    — the server has the vocabulary half.
     *   'legacy'  — finished before components existed; complete, no snapshot.
     */
    function pageState(ctx) {
        ctx = ctx || {};
        var course = String(ctx.course || '').toUpperCase();
        var topicId = Number(ctx.topicId);
        var who = ctx.user || uid();
        if (legacyComplete(ctx.courseState, topicId)) return { mode: 'legacy', topicId: topicId };
        if (vocabularyAcked(ctx.courseState, topicId)) return { mode: 'done', topicId: topicId };
        if (readPending(course, topicId, who)) return { mode: 'sync', topicId: topicId };
        return { mode: 'learn', topicId: topicId };
    }

    global.UzVocabularyComponent = {
        reportVocabulary: reportVocabulary,
        reconcileLearned: reconcileLearned,
        deckFinished: deckFinished,
        pageState: pageState,
        vocabularyAcked: vocabularyAcked,
        legacyComplete: legacyComplete,
        validAck: validAck,
        markPending: markPending,
        readPending: readPending,
        clearPending: clearPending,
        pendingKey: pendingKey,
        uid: uid,
        MESSAGES: { SAVE_FAILED: SAVE_FAILED, NEED_EXERCISES: NEED_EXERCISES, LEGACY_DONE: LEGACY_DONE }
    };
})(typeof window !== 'undefined' ? window : this);
