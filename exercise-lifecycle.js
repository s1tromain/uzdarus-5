/**
 * exercise-lifecycle.js — the finish-a-topic half of the exercise stack.
 *
 * A1 and B1 each grew their own copy of this while their courses were being
 * migrated, and those two are frozen: their suites pin 1255/181/120 and
 * 259/66/76 respectively, and rewriting them to share code would risk closed
 * work for a tidiness that buys nothing. A2 and B2 needed the same lifecycle,
 * and a third and fourth copy is where behaviour starts to drift — so the
 * logic is factored HERE, once, and the two remaining courses are built from
 * it.
 *
 * What lives here is everything that is the same for every course:
 *
 *   - the durable snapshot of a finished attempt
 *   - the gate (every exercise clears the bar on its own numbers)
 *   - save-then-report, both awaited, failing closed at either step
 *   - ACK validation, because a 200 that is not shaped like a verdict is not
 *     one
 *   - the component-only retry, so a network failure after a successful save
 *     never asks the learner to solve the topic again
 *   - the read-only review of a stored attempt, which is never rescored
 *   - the four load states: exercise / sync / review / legacy
 *
 * What does NOT live here is anything a course decides for itself: its data
 * shape, its renderer, its draft store, its DOM. create() takes the course
 * code and the field its snapshot is stored under and returns the lifecycle
 * bound to them.
 */
(function (global) {
    'use strict';

    var PASS_PERCENT = 80;

    /**
     * Build the lifecycle for one course.
     *
     * opts: { course: 'A2', resultField: 'a2ExerciseResult' }
     */
    function create(opts) {
        opts = opts || {};
        var COURSE = String(opts.course || '').toUpperCase();
        var RESULT_FIELD = opts.resultField || (COURSE.toLowerCase() + 'ExerciseResult');
        if (!COURSE) throw new Error('exercise-lifecycle: a course code is required');

        /* ------------------------------------------------- completion */

        /** The Firestore field the durable A1 exercise attempt lives in. */


        /**
         * The durable record of a finished A1 exercise section.
         *
         * Enough to REPLAY the attempt read-only later: every group, every
         * learner response, the per-group score and pass state. It stores no DOM
         * and no canonical answers — those come from the live groups at review
         * time, so a lesson correction is reflected without rewriting history.
         */
        function buildSnapshot(topicId, groups, result) {
            var answers = (result && result.answers) || {};
            var checked = (result && result.checked) || {};
            var correct = 0, total = 0;
            var breakdown = (groups || []).map(function (g) {
                var c = checked[g.id] || {};
                var gTotal = c.total != null ? c.total : (g.items || []).length;
                var gCorrect = c.correct || 0;
                correct += gCorrect; total += gTotal;
                return {
                    groupId: g.id,
                    title: g.title || g.id,
                    correct: gCorrect,
                    total: gTotal,
                    percentage: gTotal ? Math.round((gCorrect / gTotal) * 100) : 0,
                    passed: c.passed !== false,
                    answers: (g.items || []).map(function (_, i) {
                        var v = answers[g.id + '-' + i];
                        return v == null ? '' : String(v);
                    })
                };
            });
            return {
                version: 2,
                course: COURSE,
                topicId: topicId,
                completed: true,
                score: correct,
                total: total,
                percentage: total ? Math.round((correct / total) * 100) : 0,
                passPercent: PASS_PERCENT,
                groups: breakdown,
                completedAt: new Date().toISOString()
            };
        }

        /** Is every required group passed? The gate for the whole pipeline. */
        function allGroupsPassed(groups, result) {
            var checked = (result && result.checked) || {};
            if (!groups || !groups.length) return false;
            return groups.every(function (g) {
                var c = checked[g.id];
                if (!c || !c.total) return false;
                if (c.passed === false) return false;
                return (c.correct || 0) * 100 >= c.total * PASS_PERCENT;
            });
        }

        /**
         * Is a STORED snapshot proof that the work was done?
         *
         * After a reload there is no live attempt to gate on — the session that
         * produced it is gone. What survives is the durable snapshot the server
         * already holds, and it carries the same per-group breakdown, so it can
         * answer the same question. It is checked exactly as strictly: the
         * snapshot must claim completion for THIS topic, cover every group that
         * exists now, and every one of those groups must clear the threshold on
         * its own recorded numbers. A snapshot is never taken on trust because it
         * says completed: true.
         */
        function snapshotProvesCompletion(snapshot, groups, topicId) {
            if (!snapshot || snapshot.completed !== true) return false;
            if (Number(snapshot.topicId) !== Number(topicId)) return false;
            if (!groups || !groups.length) return false;
            var byId = {};
            (snapshot.groups || []).forEach(function (g) { byId[g.groupId] = g; });
            return groups.every(function (g) {
                var sg = byId[g.id];
                if (!sg || !sg.total) return false;
                if (sg.passed === false) return false;
                return (sg.correct || 0) * 100 >= sg.total * PASS_PERCENT;
            });
        }

        /** A component reply is a verdict only when it is shaped like one. */
        function validAck(ack, topicId) {
            if (!ack || ack.ok !== true) return false;
            if (String(ack.course).toUpperCase() !== COURSE) return false;
            if (Number(ack.topicId) !== Number(topicId)) return false;
            if (!ack.components || typeof ack.components !== 'object') return false;
            if (ack.components.exercisesCompleted !== true) return false;
            if (typeof ack.topicCompleted !== 'boolean') return false;
            if (!Array.isArray(ack.completedTopics)) return false;
            return true;
        }

        var SAVE_FAILED = 'Natijani saqlab bo‘lmadi.\nInternet aloqasini tekshirib, qayta urinib ko‘ring.';
        var NEED_VOCAB = 'Avval ushbu mavzuning lug‘at bo‘limini yakunlang.';

        /**
         * Finish the exercise section, authoritatively.
         *
         * THE ORDER IS LOAD-BEARING and the whole reason this is one function:
         *
         *   1. every group passed          — otherwise nothing happens at all
         *   2. build the durable snapshot
         *   3. AWAIT saveQuizResult        — a failure stops here; the component
         *                                    is never told, so nothing unlocks
         *   4. AWAIT completeCourseComponent('A1', topicId, 'exercises')
         *   5. validate the reply          — a malformed one is not a verdict
         *   6. only then report progression, and only the SERVER's
         *
         * Both awaits matter. A fire-and-forget save would let the component
         * succeed against a result that never landed, and a fire-and-forget
         * component call would let the UI unlock on a request that failed.
         *
         * When the save succeeded but the component did not, retryComponent is
         * true: the learner's work is already durable and they must never be
         * asked to solve 685 items again — the retry sends the component call
         * alone.
         */
        async function completeExercises(opts) {
            opts = opts || {};
            var topicId = opts.topicId;
            var groups = opts.groups || [];
            var api = opts.api || {};
            var result = opts.result;

            /* THE GATE, from whichever proof exists. A live attempt is graded
               from its own checked map. A retry after a reload has no live
               attempt — the durable snapshot is the proof, and it is held to the
               identical per-group threshold. Neither path can be skipped: with
               no result AND no snapshot this stops here. */
            var passed = opts.result != null
                ? allGroupsPassed(groups, result)
                : snapshotProvesCompletion(opts.snapshot, groups, topicId);
            if (!passed) {
                return { ok: false, stage: 'gate', message: null };
            }

            var snapshot = opts.snapshot || buildSnapshot(topicId, groups, result);

            /* ---- 3. the durable result, first and awaited ---- */
            if (!opts.skipSave) {
                if (typeof api.saveQuizResult !== 'function') {
                    return { ok: false, stage: 'save', snapshot: snapshot,
                             retryComponent: false, message: SAVE_FAILED };
                }
                var saved;
                try {
                    var payload = {};
                    payload[RESULT_FIELD] = snapshot;
                    saved = await api.saveQuizResult(opts.uid, topicId, payload, COURSE);
                } catch (e) {
                    saved = false;
                }
                if (saved === false || saved == null) {
                    return { ok: false, stage: 'save', snapshot: snapshot,
                             retryComponent: false, message: SAVE_FAILED };
                }
            }

            /* ---- 4/5. the authoritative component, second and awaited ---- */
            if (typeof api.completeCourseComponent !== 'function') {
                return { ok: false, stage: 'component', snapshot: snapshot,
                         retryComponent: true, message: SAVE_FAILED };
            }
            var ack;
            try {
                ack = await api.completeCourseComponent(COURSE, topicId, 'exercises');
            } catch (e) {
                ack = null;
            }
            if (!validAck(ack, topicId)) {
                /* The work is durable; only the acknowledgement is missing. */
                return { ok: false, stage: 'component', snapshot: snapshot,
                         retryComponent: true, message: SAVE_FAILED };
            }

            /* ---- 6/7. the server's progression, never the client's ---- */
            if (opts.clearDraft) { try { opts.clearDraft(); } catch (e) {} }

            return {
                ok: true,
                stage: 'done',
                snapshot: snapshot,
                exercisesCompleted: true,
                topicCompleted: ack.topicCompleted === true,
                completedTopics: ack.completedTopics.slice(),
                nextTopic: ack.topicCompleted === true ? (ack.nextTopic == null ? null : ack.nextTopic) : null,
                message: ack.topicCompleted === true ? null : NEED_VOCAB
            };
        }

        /** Retry ONLY the component call, against an already-durable snapshot. */
        function retryComponent(opts) {
            return completeExercises(Object.assign({}, opts, { skipSave: true }));
        }

        /* ------------------------------------------------------- review */

        /** The durable attempt for a topic, or null. Server state, not memory. */
        function durableResult(userQuizResults, topicId) {
            var doc = userQuizResults && (userQuizResults['topic_' + topicId] || userQuizResults[topicId]);
            var r = doc && doc[RESULT_FIELD];
            if (!r || r.completed !== true) return null;
            if (Number(r.topicId) !== Number(topicId)) return null;
            return r;
        }

        /** Which label the exercise call-to-action should carry. */
        function ctaLabel(userQuizResults, topicId) {
            return durableResult(userQuizResults, topicId)
                ? 'Javoblarni ko‘rish'
                : 'Mashqlarni bajarish';
        }

        /**
         * The read-only view of a finished attempt.
         *
         * The learner's responses come from the STORED snapshot — that is the
         * attempt, and it is never rescored. Canonical answers are read from the
         * live groups for display only, and an item whose group no longer exists
         * simply shows what the learner wrote.
         */
        /**
         * Is this prompt open-ended? EXACTLY the rule the shared scorer applies
         * (course-exercise-ui.js isOpenItem), so the review and the grade can
         * never disagree about what kind of question it was.
         */
        function isOpen(item) {
            if (!item) return false;
            if (item.free) return true;
            var a = item.answer;
            if (a == null) return true;
            if (Array.isArray(a)) {
                return a.every(function (x) { return String(x == null ? '' : x).trim() === ''; });
            }
            return String(a).trim() === '';
        }

        function buildReview(snapshot, groups) {
            if (!snapshot) return null;
            var byId = {};
            (groups || []).forEach(function (g) { byId[g.id] = g; });
            return {
                topicId: snapshot.topicId,
                score: snapshot.score,
                total: snapshot.total,
                percentage: snapshot.percentage,
                completedAt: snapshot.completedAt,
                groups: (snapshot.groups || []).map(function (sg) {
                    var live = byId[sg.groupId];
                    return {
                        groupId: sg.groupId,
                        title: sg.title,
                        correct: sg.correct,
                        total: sg.total,
                        percentage: sg.percentage,
                        passed: sg.passed,
                        items: (sg.answers || []).map(function (given, i) {
                            var item = live && live.items ? live.items[i] : null;
                            var expected = item ? item.answer : undefined;
                            var canonical = Array.isArray(expected) ? expected[0] : expected;
                            /* THE REVIEW MUST GRADE THE WAY THE SCORER GRADED.
                               Eighty B1 prompts are open — "Что вы сделаете,
                               если…" — and they are authored as free: true WITH a
                               model answer beside them. The scorer reads `free`
                               and accepts any real attempt; a review that only
                               looked at whether an answer key was present would
                               call the model answer the right one and mark the
                               learner's accepted sentence WRONG. So openness is
                               decided by the same rule the scorer uses, and an
                               open item gets no verdict at all. */
                            var open = isOpen(item);
                            var deterministic = !open && canonical != null
                                && String(canonical).trim() !== '';
                            return {
                                q: item ? item.q : null,
                                given: given,
                                correctAnswer: deterministic ? canonical : null,
                                /* the authored model answer, shown as an example and
                                   never as a verdict */
                                sample: open && canonical != null
                                    && String(canonical).trim() !== '' ? canonical : null,
                                open: open,
                                deterministic: deterministic,
                                correct: deterministic
                                    ? (Array.isArray(expected) ? expected : [expected])
                                        .some(function (e) { return norm(e) === norm(given); })
                                    : null
                            };
                        })
                    };
                })
            };
        }

        /* --------------------------------------------- load reconciliation */

        /**
         * Has the SERVER acknowledged the exercises half of this topic?
         *
         * The only authority is courses.<COURSE>.topicComponents.<id>, written by
         * /api/progress?action=complete-component. Absence is not a denial and not
         * a confirmation — it is simply "no record", which callers weigh against
         * the durable result and the legacy completedTopics array.
         */
        function componentAcked(courseState, topicId) {
            var tc = courseState && courseState.topicComponents;
            var row = tc && (tc[topicId] != null ? tc[topicId] : tc[String(topicId)]);
            return !!(row && row.exercisesCompleted === true);
        }

        /**
         * WHAT THE EXERCISE SECTION SHOULD SHOW WHEN IT OPENS.
         *
         * The learner's work and the server's bookkeeping are two different facts
         * and they can disagree. A save can land and the component call can fail —
         * the learner then closes the page, and the in-memory retry handle dies
         * with it. On the next visit the durable snapshot still proves the work
         * was done, so asking them to solve the topic again would be wrong, and
         * unlocking the next topic without an acknowledgement would be worse.
         *
         *   'exercise' — no durable attempt. Solve, resume, the normal path.
         *   'review'   — durable attempt AND the server agrees. Read-only.
         *   'sync'     — durable attempt, no acknowledgement. The LEARNING is
         *                done, the PROGRESSION is not: offer the component call
         *                alone, never the exercises again.
         *   'legacy'   — finished before components existed: completedTopics
         *                carries the topic but there is no snapshot to show.
         *                That is COMPLETE, not a sync failure.
         *
         * A durable attempt outranks any leftover draft: none of the three
         * non-'exercise' modes mounts a session, so a stale resume prompt can
         * never appear over finished work.
         */
        function pageState(ctx) {
            ctx = ctx || {};
            var topicId = ctx.topicId;
            var durable = durableResult(ctx.userQuizResults, topicId);
            var completed = Array.isArray(ctx.completedTopics) ? ctx.completedTopics : [];
            var legacyDone = completed.some(function (n) { return Number(n) === Number(topicId); });
            var acked = componentAcked(ctx.courseState, topicId);

            if (durable) {
                return { mode: (acked || legacyDone) ? 'review' : 'sync',
                         durable: durable, topicId: topicId };
            }
            /* NO SNAPSHOT. A topic already in completedTopics stays complete —
               missing component metadata on old progress is not a regression. */
            if (legacyDone) return { mode: 'legacy', durable: null, topicId: topicId };
            return { mode: 'exercise', durable: null, topicId: topicId };
        }

        var SYNC_PENDING = 'Mashqlar bajarildi, ammo natija serverga yozilmadi.\nKeyingi mavzu ochilishi uchun qayta urinib ko‘ring.';
        var LEGACY_DONE = 'Ushbu mavzu avval yakunlangan.';

        /* the same tolerant comparison the platform uses for display */
        function norm(v) {
            return String(v == null ? '' : v).toLowerCase().replace(/ё/g, 'е')
                .replace(/[.,!?;:()"'«»—–-]/g, ' ').replace(/\s+/g, ' ').trim();
        }


        /* --------------------------------------------------- draft scope */

        /**
         * A STRUCTURAL FINGERPRINT OF THE LESSON.
         *
         * A draft holds answers keyed by "<groupId>-<index>". Replay those into
         * a lesson whose exercises have changed underneath them and the learner
         * silently inherits answers to questions that are no longer there. The
         * topic id is part of it because courses repeat shapes: several topics
         * are "six exercises of ten" and would otherwise be indistinguishable.
         */
        function fingerprint(groups, topicId) {
            return 'v2:t' + topicId + ':' + (groups || []).map(function (g) {
                return g.id + ':' + ((g.items || []).length);
            }).join('|');
        }

        /**
         * Where one learner's unfinished attempt at one topic lives.
         *
         * Every part is load-bearing: without the uid two people on a shared
         * device inherit each other's answers, without the course A2 topic 3
         * and B2 topic 3 collide, and without the topic every lesson shares one
         * draft.
         */
        function draftKey(uid, topicId) {
            return 'uzdarus:exercise-draft:' + (uid || 'guest') + ':' + COURSE + ':' + topicId + ':v2';
        }

        function store() {
            return {
                get: function (k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } },
                set: function (k, v) { try { global.localStorage.setItem(k, v); } catch (e) {} },
                remove: function (k) { try { global.localStorage.remove ? global.localStorage.removeItem(k) : global.localStorage.removeItem(k); } catch (e) {} }
            };
        }

        /**
         * The scoped, fingerprinted session draft.
         *
         * It carries the whole unfinished attempt — where the learner is, what
         * they typed, which exercises they have already cleared and with what
         * score — so "Davom ettirish" resumes the session rather than just the
         * answers. Progression is deliberately NOT in here: a draft is local
         * resume state and never evidence that anything was completed.
         */
        function draftFor(uid, topicId, groups, backing) {
            var fp = fingerprint(groups, topicId);
            var key = draftKey(uid, topicId);
            var st = backing || store();
            return {
                key: key,
                fingerprint: fp,
                load: function () {
                    var raw = st.get(key);
                    if (!raw) return null;
                    var d;
                    try { d = JSON.parse(raw); } catch (e) { return null; }
                    if (!d || d.fingerprint !== fp) return null;          /* stale shape */
                    if (d.course !== COURSE) return null;                 /* another course */
                    if (Number(d.topicId) !== Number(topicId)) return null;
                    return { v: d.v || 1, cursor: d.cursor || 0,
                             answers: d.answers || {}, checked: d.checked || {} };
                },
                save: function (state) {
                    st.set(key, JSON.stringify({
                        v: (state && state.v) || 1,
                        fingerprint: fp,
                        course: COURSE,
                        topicId: topicId,
                        cursor: (state && state.cursor) || 0,
                        answers: (state && state.answers) || {},
                        checked: (state && state.checked) || {},
                        updatedAt: Date.now()
                    }));
                },
                clear: function () { st.remove(key); }
            };
        }

        return {
            COURSE: COURSE,
            fingerprint: fingerprint,
            draftKey: draftKey,
            draftFor: draftFor,
            RESULT_FIELD: RESULT_FIELD,
            PASS_PERCENT: PASS_PERCENT,
            buildSnapshot: buildSnapshot,
            allGroupsPassed: allGroupsPassed,
            snapshotProvesCompletion: snapshotProvesCompletion,
            validAck: validAck,
            completeExercises: completeExercises,
            retryComponent: retryComponent,
            durableResult: durableResult,
            ctaLabel: ctaLabel,
            buildReview: buildReview,
            isOpen: isOpen,
            componentAcked: componentAcked,
            pageState: pageState,
            MESSAGES: { SAVE_FAILED: SAVE_FAILED, NEED_VOCAB: NEED_VOCAB,
                        SYNC_PENDING: SYNC_PENDING, LEGACY_DONE: LEGACY_DONE }
        };
    }

    global.UzExerciseLifecycle = { create: create, PASS_PERCENT: PASS_PERCENT };
})(typeof window !== 'undefined' ? window : this);
