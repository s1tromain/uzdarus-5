/**
 * a1-host.js — A1 on the shared exercise stack.
 *
 * WHY THIS EXISTS. A1's exercises were rendered by eight hand-written
 * loadTopicNExercises() functions that put every exercise of a topic on one
 * screen, graded them all at once, and reported a single figure to
 * __uzFinalizeExerciseTopic(). That figure was a TOPIC-WIDE aggregate, so a
 * perfect exercise paid for a failed one: 10/10 then 5/10 averaged to 75% and
 * the learner moved on having never understood the second exercise.
 *
 * The product rule is that every scored exercise is earned on its own — 80%,
 * that exercise, no help from any other. That rule already lives in
 * UzExerciseSession (cfg.passScore) and is what A2 and B2 use. A1 does not need
 * a ninth engine; it needs its data expressed as GROUPS.
 *
 * That is all this file does. It reads the exercise data A1 already ships and
 * normalises it into the shape the shared engine and the shared renderer
 * already understand. NO QUESTION, OPTION OR ANSWER IS CHANGED — every value is
 * carried across verbatim, and verify_a1_exercise_engine.cjs fingerprints the
 * content before and after to prove it.
 *
 * A1 ships five different group shapes and seven different item shapes, grown
 * over twelve topics. They are enumerated in normaliseGroup()/normaliseItem()
 * below rather than special-cased per topic, so a topic added later in any of
 * those shapes is handled by existing code.
 */
(function (global) {
    'use strict';

    if (global.A1Host) return;

    /* The platform lesson threshold. Same rule, same number, as A2 and B2.
       Final exams are a separate contract and are not affected. */
    var PASS_PERCENT = 80;

    var COURSE = 'A1';

    function session() { return global.UzExerciseSession; }
    function ui() { return global.UzExerciseUI; }

    /* ------------------------------------------------------------ items */

    /**
     * One A1 item -> one shared item.
     *
     * A1 asks its question under four different names and gives its answer
     * under two. Nothing is invented here: the text is moved, not rewritten.
     *
     *   prompt | question | word | text   ->  q
     *   answer                            ->  answer
     *   answers (alternatives)            ->  answer (the engine already
     *                                        accepts an array and matches any)
     *
     * `hint` and `options` pass through untouched; the shared renderer already
     * understands both. An item with no answer at all is left with none, so the
     * platform's existing open-answer policy decides it — this file does not
     * invent a key for a prompt that never had one.
     */
    function normaliseItem(raw) {
        if (!raw || typeof raw !== 'object') return null;
        var q = raw.prompt != null ? raw.prompt
              : raw.question != null ? raw.question
              : raw.word != null ? raw.word
              : raw.text != null ? raw.text
              : '';
        var item = { q: String(q) };
        /* `answers` is a list of ACCEPTED ALTERNATIVES for one response — never
           one answer per blank; no A1 prompt has more than a single blank. The
           engine's matcher already treats an array that way. */
        if (Array.isArray(raw.answers)) item.answer = raw.answers.slice();
        else if (raw.answer !== undefined) item.answer = raw.answer;
        if (Array.isArray(raw.options)) item.options = raw.options.slice();
        if (raw.hint != null) item.hint = raw.hint;
        if (raw.placeholder != null) item.placeholder = raw.placeholder;
        if (raw.free) item.free = true;
        return item;
    }

    /* ----------------------------------------------------------- groups */

    /**
     * One A1 exercise -> one shared group.
     *
     * Five shapes exist across the twelve topics:
     *
     *   { items: [...] }                      the common one
     *   { instruction, items: [...] }         instruction becomes the intro
     *   { questions: [...] }                  same items, older key
     *   { prompts: [...], answers: [...] }    two parallel arrays, zipped
     *   { sentences: [...], answers: [...] }  the same, older key
     *
     * A group whose items all carry options is a choice group; the shared
     * renderer dispatches on that, exactly as it does for A2 and B2.
     */
    function normaliseGroup(id, raw) {
        if (!raw || typeof raw !== 'object') return null;

        /* `questions` is overloaded in A1: sometimes an array of item
           OBJECTS ({text, options, answer}), sometimes an array of plain
           STRINGS paired with a parallel `answers` array. Treating the
           second as items would produce items with no question and no
           answer, which is how a whole exercise silently leaves the gate. */
        var questionsAreObjects = Array.isArray(raw.questions)
            && raw.questions.length > 0
            && typeof raw.questions[0] === 'object';
        var source = Array.isArray(raw.items) ? raw.items
                   : (questionsAreObjects ? raw.questions : null);
        var items = [];

        if (source) {
            items = source.map(normaliseItem).filter(Boolean);
        } else if (Array.isArray(raw.prompts) || Array.isArray(raw.sentences)
                   || Array.isArray(raw.questions)) {
            /* Two parallel arrays. Zipped by index, which is how the page has
               always paired them. */
            var texts = Array.isArray(raw.prompts) ? raw.prompts
                      : Array.isArray(raw.sentences) ? raw.sentences
                      : raw.questions;
            var answers = Array.isArray(raw.answers) ? raw.answers : [];
            items = texts.map(function (text, i) {
                return normaliseItem({ prompt: text, answer: answers[i] });
            }).filter(Boolean);
        }

        if (!items.length) return null;

        var group = { id: id, title: raw.title || id, items: items };
        if (raw.instruction) group.intro = raw.instruction;
        if (raw.namuna) group.namuna = raw.namuna;
        /* Choice only when EVERY item offers options — a mixed group stays an
           input group so an option-less item is still answerable. */
        if (items.every(function (it) { return Array.isArray(it.options) && it.options.length; })) {
            group.type = 'choice';
        }
        return group;
    }

    /**
     * Every scored group of one A1 topic, in order.
     *
     * Two sources, because A1 has two generations of content:
     *
     *   topic<N>Exercises   topics 5-12, already group-shaped
     *   quiz                topics 1-4, the original two-part quiz:
     *                       multiple choice, then fill-in-the-blank
     *
     * Both become the same list of groups, so everything downstream — the gate,
     * the draft, the review — has exactly one shape to deal with.
     */
    function groupsOf(topic) {
        if (!topic) return [];
        var out = [];

        /* EVERY SCORED SURFACE, IN THE ORDER THE LEARNER MEETS IT.

           This used to be an either/or: the topic<N>Exercises data if it
           existed, otherwise the base quiz. That silently dropped 118 scored
           questions — topic 5 has BOTH a base quiz and four exercises and lost
           the quiz; topic 3 has four extraExercises sections worth 100
           questions; topic 4 has a fill exercise worth 8. None of them were
           inside the per-exercise gate.

           The surfaces are composed instead, each with a stable unique id. */

        /* 1. the base quiz */
        appendQuiz(out, topic.quiz);

        /* 2. topic 3's extra sections */
        if (topic.extraExercises) {
            Object.keys(topic.extraExercises).sort().forEach(function (sec) {
                var g = normaliseGroup('extra-' + sec, topic.extraExercises[sec]);
                if (g) out.push(g);
            });
        }

        /* 3. topic 4's fill exercise */
        if (topic.topic4FillExercise) {
            var fill = normaliseGroup('fill', topic.topic4FillExercise);
            if (fill) out.push(fill);
        }

        /* 4. the group-shaped exercise data, topics 5-12 */
        var key = Object.keys(topic).filter(function (k) {
            return /^topic\d+Exercises$/.test(k);
        })[0];
        if (key && topic[key]) {
            Object.keys(topic[key])
                .filter(function (k) { return /^exercise\d+$/.test(k); })
                .sort(function (a, b) {
                    return Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, ''));
                })
                .forEach(function (gid) {
                    var g = normaliseGroup(gid, topic[key][gid]);
                    if (g) out.push(g);
                });
        }

        return out;
    }

    /** The base quiz, as two groups: multiple choice, then blanks. */
    function appendQuiz(out, q) {
        if (!q) return;
        {
            var mcQ = q.mcQuestions || [], mcO = q.mcOptions || [], mcA = q.mcAnswers || [];
            if (mcQ.length) {
                out.push({
                    id: 'quiz-mc', title: 'Тест', type: 'choice',
                    items: mcQ.map(function (text, i) {
                        var opts = mcO[i] || [];
                        /* mcAnswers stores the INDEX of the correct option on
                           this page; carry the option itself across so the
                           shared matcher can compare text, as it does
                           everywhere else. An answer that is already text is
                           left alone. */
                        var a = mcA[i];
                        var answer = (typeof a === 'number') ? opts[a] : a;
                        return { q: String(text), options: opts.slice(), answer: answer };
                    })
                });
            }
            var bQ = q.blankQuestions || [], bA = q.blankAnswers || [];
            if (bQ.length) {
                out.push({
                    id: 'quiz-blank', title: 'Bo‘shliqni to‘ldiring',
                    items: bQ.map(function (text, i) {
                        return { q: String(text), answer: bA[i] };
                    })
                });
            }
        }
    }

    /* ------------------------------------------------------- fingerprint */

    /**
     * A cheap, stable description of ONE TOPIC'S exercise structure.
     *
     * Stored with a draft so answers can never be replayed into a lesson that
     * has changed underneath them: a different group count, a renamed group or
     * a different number of items all produce a different fingerprint, and the
     * draft is then discarded rather than mapped onto the wrong questions.
     *
     * THE TOPIC ID IS PART OF IT. A1 topics 1, 2 and 3 have identical shapes —
     * five multiple-choice questions and five blanks each — so a purely
     * structural fingerprint matches across all three. The draft key already
     * scopes by topic, but a fingerprint that cannot tell two lessons apart is
     * a poor second line of defence, so it names the topic as well.
     */
    function fingerprint(groups, topicId) {
        return 'v2:t' + (topicId == null ? '?' : topicId) + ':'
            + (groups || []).map(function (g) {
                return g.id + ':' + (g.items || []).length;
            }).join('|');
    }

    function draftKey(uid, topicId) {
        return 'uzdarus:exercise-draft:' + (uid || 'guest') + ':' + COURSE + ':' + topicId + ':v2';
    }

    /* ------------------------------------------------------------ mount */

    /**
     * Put one A1 topic on the shared exercise stack.
     *
     * This is the whole point of the file: A1 stops rendering every exercise
     * of a topic on one screen and grading them together, and instead steps
     * through them one at a time under UzExerciseSession, which applies the
     * per-group threshold. The renderer and the matcher are the SHARED ones
     * that A2 and B2 already use — A1 contributes its data, not a ninth
     * engine.
     *
     * opts: { topic, mountEl, uid, draftStore, onFinish }
     * Returns the session, or null when the topic has no scored exercises.
     */
    function mountPractice(opts) {
        opts = opts || {};
        var S = session(), U = ui();
        if (!S || !U || !opts.topic || !opts.mountEl) return null;

        var groups = groupsOf(opts.topic);
        if (!groups.length) return null;

        var topicId = opts.topic.id;
        var fp = fingerprint(groups, topicId);
        var key = draftKey(opts.uid, topicId);
        var store = opts.draftStore || defaultStore();

        return S.mount({
            course: COURSE,
            topicId: topicId,
            groups: groups,
            mountEl: opts.mountEl,
            title: opts.title || "Amaliy mashqlar",
            /* THE PER-EXERCISE GATE. The engine owns the comparison; this only
               says where the bar is, and it is the platform bar. */
            passScore: PASS_PERCENT,
            renderGroup: U.renderGroup,
            bindGroup: U.bindGroup,
            readAnswer: U.readAnswer,
            writeAnswer: U.writeAnswer,
            matchItem: U.matchItem,
            afterCheck: U.afterCheck,
            renderSummary: opts.renderSummary || function () { return ""; },
            /* A DRAFT IS LOCAL RESUME STATE, NEVER PROGRESSION. It is scoped to
               uid + course + topic, and carries the structural fingerprint so
               answers can never be replayed into a lesson that has changed. */
            draft: {
                load: function () {
                    var raw = store.get(key);
                    if (!raw) return null;
                    var d;
                    try { d = JSON.parse(raw); } catch (e) { return null; }
                    if (!d || d.fingerprint !== fp) return null;   /* stale schema */
                    if (d.course !== COURSE || Number(d.topicId) !== Number(topicId)) return null;
                    return { v: d.v || 1, cursor: d.cursor || 0,
                             answers: d.answers || {}, checked: d.checked || {} };
                },
                save: function (state) {
                    try {
                        store.set(key, JSON.stringify({
                            v: (state && state.v) || 1,
                            fingerprint: fp,
                            course: COURSE,
                            topicId: topicId,
                            cursor: (state && state.cursor) || 0,
                            answers: (state && state.answers) || {},
                            checked: (state && state.checked) || {},
                            updatedAt: Date.now()
                        }));
                    } catch (e) { /* a full quota must never break the lesson */ }
                },
                clear: function () { store.remove(key); }
            },
            finish: opts.onFinish || function () {}
        });
    }

    /** localStorage, wrapped so a private-mode throw cannot break a lesson. */
    function defaultStore() {
        return {
            get: function (k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } },
            set: function (k, v) { try { global.localStorage.setItem(k, v); } catch (e) {} },
            remove: function (k) { try { global.localStorage.removeItem(k); } catch (e) {} }
        };
    }

    /* ------------------------------------------------- completion */

    /** The Firestore field the durable A1 exercise attempt lives in. */
    var RESULT_FIELD = 'a1ExerciseResult';

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
                        var deterministic = canonical != null && String(canonical).trim() !== '';
                        return {
                            q: item ? item.q : null,
                            given: given,
                            correctAnswer: deterministic ? canonical : null,
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

    global.A1Host = {
        RESULT_FIELD: RESULT_FIELD,
        buildSnapshot: buildSnapshot,
        allGroupsPassed: allGroupsPassed,
        snapshotProvesCompletion: snapshotProvesCompletion,
        validAck: validAck,
        completeExercises: completeExercises,
        retryComponent: retryComponent,
        durableResult: durableResult,
        componentAcked: componentAcked,
        pageState: pageState,
        ctaLabel: ctaLabel,
        buildReview: buildReview,
        MESSAGES: { SAVE_FAILED: SAVE_FAILED, NEED_VOCAB: NEED_VOCAB,
                    SYNC_PENDING: SYNC_PENDING, LEGACY_DONE: LEGACY_DONE },
        PASS_PERCENT: PASS_PERCENT,
        mountPractice: mountPractice,
        COURSE: COURSE,
        normaliseItem: normaliseItem,
        normaliseGroup: normaliseGroup,
        groupsOf: groupsOf,
        fingerprint: fingerprint,
        draftKey: draftKey,
        _session: session,
        _ui: ui
    };
})(typeof window !== 'undefined' ? window : this);
