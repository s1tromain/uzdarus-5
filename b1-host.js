/**
 * b1-host.js — B1 on the shared exercise stack.
 *
 * B1 was the last course still grading a whole topic at once. Its
 * checkTopic1Exercises() walked every exercise of a lesson, summed one
 * correct/total across all of them and compared THAT to the threshold, so a
 * perfect exercise 1 paid for a failed exercise 2 and the learner moved on
 * having never met the material they got wrong. This file removes that
 * arithmetic from the learner's path: each exercise is stepped through by
 * UzExerciseSession and must clear the platform bar on its own numbers.
 *
 * WHAT B1 DID NOT NEED. Unlike A1 — which hid five different legacy shapes
 * behind three different renderers — B1's exercises are already stored in the
 * shape the shared UI reads: { id, type, title, intro, items:[{q, options,
 * answer, words}] }. So there is deliberately NO normalisation layer here.
 * Inventing one would be a place for content to drift, and the whole point of
 * this migration is that nothing the learner sees changes.
 *
 * WHAT IS DELIBERATELY LEFT ALONE:
 *
 *   - the matching game. Ten topics render one, and the topic-wide grader
 *     never scored it — it is a warm-up widget, not an exercise. Folding it
 *     into the gate now would invent a score the course never had, so it
 *     keeps rendering exactly where and how it does today, outside the
 *     session.
 *   - the empty legacy quiz. Topics 12-20 still carry quiz.mcQuestions and
 *     quiz.blankQuestions, and every one of those arrays is EMPTY; loadQuiz()
 *     and checkAnswers() both return early for all twenty topics anyway. No
 *     learner-visible item lives there, so nothing is lost by leaving it.
 *   - the open-answer rule. B1 accepted a free item on three or more words,
 *     which is exactly what the shared UI already does, so the policy carries
 *     over untouched rather than being re-specified here.
 */
(function (global) {
    'use strict';

    /* THE PLATFORM THRESHOLD, per exercise. B1's old rule was an ABSOLUTE
       count — PASSING_SCORE = 7 — applied to the topic total. Carried down to
       a single exercise that number is nonsense: a five-item exercise can
       never yield seven correct, so it could never be passed. The bar is a
       ratio, and it is the same ratio as every other course. */
    var PASS_PERCENT = 80;

    var COURSE = 'B1';

    function session() { return global.UzExerciseSession; }
    function ui() { return global.UzExerciseUI; }

    /* ----------------------------------------------------------- groups */

    /**
     * Every SCORED exercise of one B1 topic, in the order the learner meets
     * them.
     *
     * The data already matches the shared contract, so this filters rather
     * than converts. Two things are excluded, and both are excluded because
     * they carry no scored item:
     *
     *   - { id: "matchingSlot" } — a positioning placeholder that tells the
     *     renderer where to drop the matching game. It has no type and no
     *     items.
     *   - any group whose items array is empty.
     *
     * A group that HAS items is never dropped, whatever its type, so a new
     * exercise kind cannot silently fall out of the gate.
     */
    function exDataOf(topic) {
        if (!topic) return null;
        for (var n = 1; n <= 20; n++) {
            var v = topic['topic' + n + 'Exercises'];
            if (v) return v;
        }
        return null;
    }

    /* B1's own HTML escape, copied exactly (t1EscHtml in b1-course.html) so
       the passage reads character-for-character as it does today. */
    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * THE READING TEXT MUST COME WITH THE QUESTIONS.
     *
     * Five topics ask comprehension questions about a passage the old page
     * rendered in a card above them (readingTitle + readingText). The shared
     * renderer has exactly this concept already — `passage` — so the group is
     * handed across with the text converted into it. The FIFTEEN listening
     * groups need nothing: they carry `audioSrc`, and the shared renderer
     * resolves that path with the same ../ rule b1-course.html used.
     *
     * The source group is never mutated: courseData is shared with the legacy
     * renderer and with the integrity suites, and writing a derived field into
     * it would make the raw surface disagree with itself. A shallow copy is
     * returned instead, and only when there is something to convert.
     */
    function withPassage(g) {
        if (!g || g.passage || !g.readingText) return g;
        var paras = Array.isArray(g.readingText) ? g.readingText : [g.readingText];
        var html = '';
        if (g.readingTitle) html += '<h4>' + esc(g.readingTitle) + '</h4>';
        html += paras.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
        var copy = {};
        Object.keys(g).forEach(function (k) { copy[k] = g[k]; });
        copy.passage = html;
        return copy;
    }

    function groupsOf(topic) {
        var ex = exDataOf(topic);
        var list = (ex && ex.exercises) || [];
        var out = [];
        list.forEach(function (g) {
            if (!g || !g.id) return;
            var items = g.items || [];
            if (!items.length) return;          /* matchingSlot and friends */
            out.push(withPassage(g));
        });
        return out;
    }

    /** How many scored items a topic really has — used by the guards. */
    function itemCount(topic) {
        return groupsOf(topic).reduce(function (n, g) { return n + (g.items || []).length; }, 0);
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
     * Put one B1 topic on the shared exercise stack.
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

        /* The exercise stylesheet, and B1's own task lines.
           B1 authors a `title` AND an `intro` on all 153 of its groups, but
           without the page-wide switch the renderer showed neither — twenty
           topics of unlabelled, uninstructed questions. Both calls are
           idempotent. */
        if (typeof U.injectStyles === 'function') U.injectStyles();
        if (typeof U.setOptions === 'function') U.setOptions({ showTaskLine: true });

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
            /* THE SESSION HANDS TWO ARGUMENTS; THE PAGE EXPECTS ONE OBJECT.
               cfg.finish is invoked as finish(answers, checked), but
               completeExercises() grades through result.checked — so wiring
               opts.onFinish here directly meant result.checked was undefined,
               allGroupsPassed() returned false for every group, the call
               returned stage:'gate', and b1ApplyOutcome dropped it without a
               word. The learner finished every exercise correctly and NOTHING
               was saved, no exercises component was reported, and the topic
               could never complete. Assemble the shape the page documents, and
               return the promise so the session can wait for the network. */
            finish: function (answers, checked) {
                var result = { answers: answers, checked: checked };
                var snapshot = buildSnapshot(topicId, groups, result);
                return Promise.resolve(
                    typeof opts.onFinish === 'function' ? opts.onFinish(result) : null
                ).then(function (outcome) {
                    return { snapshot: snapshot, outcome: outcome || null };
                }, function () {
                    return { snapshot: snapshot, outcome: null };
                });
            },
            /* A real closing screen. Without these the session showed an empty
               modal titled "Итоги" with no score and no button. */
            renderSummary: function (payload) {
                var U = ui();
                if (!U || typeof U.renderExerciseSummary !== 'function') return '';
                var pl = payload || {};
                return U.renderExerciseSummary(pl.snapshot, pl.outcome);
            },
            bindSummary: function (root, payload, session) {
                var pl = payload || {};
                /* ONE CONTRACT, FOUR COURSES. The summary no longer draws its own
                   buttons and no longer decides anything: topic-completion.js owns the
                   rule, the wording and the action, so a fix here cannot leave the other
                   three courses behind — which is exactly how the vocabulary gate
                   survived being "fixed" twice. */
                var TC = global.UzTopicCompletion;
                if (!TC || typeof TC.attach !== 'function') return;
                TC.attach(root, {
                    topicId: topicId,
                    snapshot: pl.snapshot,
                    outcome: pl.outcome || null,
                    isLast: typeof opts.isLastTopic === 'function' ? !!opts.isLastTopic(topicId) : false,
                    hasVocabulary: typeof opts.onOpenVocabulary === 'function',
                    finish: function () {
                        return typeof opts.onRetry === 'function' ? opts.onRetry(topicId) : null;
                    },
                    navigate: function (next, outcome) {
                        if (typeof opts.onNavigate === 'function') opts.onNavigate(next, outcome);
                    },
                    openVocabulary: function () {
                        if (typeof opts.onOpenVocabulary === 'function') opts.onOpenVocabulary(topicId);
                    },
                    retryExercises: function () {
                        if (session && typeof session.reset === 'function') session.reset();
                        if (session && typeof session.open === 'function') session.open();
                    },
                    close: function () {
                        if (session && typeof session.close === 'function') session.close();
                    }
                });
            }
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
    var RESULT_FIELD = 'b1ExerciseResult';

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
    var NOT_EARNED = 'Mavzuni yakunlash uchun kamida 80 foiz kerak.';

    /**
     * THE ONE RULE, shared with topic-completion.js and mirrored by the server.
     *
     * An EXACT integer ratio, never a rounded percent: Math.round puts the
     * boundary in the wrong place (39/49 rounds to 80 and is really 79.6).
     * Exactly 80 passes, 79 does not. The vocabulary deck is not consulted.
     */
    function topicEarned(snapshot) {
        var TC = global.UzTopicCompletion;
        if (TC && typeof TC.earned === 'function') return TC.earned(snapshot);
        var s = snapshot || {};
        var score = Number(s.score) || 0;
        var total = Number(s.total) || 0;
        return total > 0 && score * 100 >= total * PASS_PERCENT;
    }

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
        /* THE GATE IS THE OFFICIAL SCORE, AND NOTHING ELSE.
           It used to be allGroupsPassed(), a per-exercise rule the summary
           screen does not use — so a screen reading "the 80 threshold is
           passed" could sit above a handler that refused. One formula now
           decides both, and it lives in topic-completion.js beside the
           button that presses it. Unanswered questions are already inside
           `total`, so an attempt with gaps that still reaches the threshold
           is earned. The per-exercise rule keeps its real job: you cannot
           walk past an exercise you failed while the session is running. */
        var snapshot = opts.snapshot || buildSnapshot(topicId, groups, result);
        if (!topicEarned(snapshot)) {
            return { ok: false, stage: 'gate', snapshot: snapshot, message: NOT_EARNED };
        }

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
            /* The server completes a topic on the exercises alone, so a
               false verdict here is an anomaly, not a missing deck. */
            message: ack.topicCompleted === true ? null : SAVE_FAILED
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

    global.B1Host = {
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
        isOpen: isOpen,
        /* NEED_VOCAB IS GONE ON PURPOSE. There is no state in which
                   finishing a topic waits on the deck; a message saying so
                   would be a lie, and its presence is what a negative control
                   re-introduces. */
            MESSAGES: { SAVE_FAILED: SAVE_FAILED, NOT_EARNED: NOT_EARNED,
                    SYNC_PENDING: SYNC_PENDING, LEGACY_DONE: LEGACY_DONE },
        PASS_PERCENT: PASS_PERCENT,
        mountPractice: mountPractice,
        COURSE: COURSE,
        groupsOf: groupsOf,
        exDataOf: exDataOf,
        withPassage: withPassage,
        itemCount: itemCount,
        fingerprint: fingerprint,
        draftKey: draftKey,
        _session: session,
        _ui: ui
    };
})(typeof window !== 'undefined' ? window : this);
