/**
 * exam-gate.js — may this learner sit the final exam, and if not, why not.
 *
 * WHAT WENT WRONG. A learner who had finished all twelve A1 topics opened the
 * A1 final exam and was told "Kurs holatini tekshirib bo'lmadi. Internet
 * aloqasini tekshirib, qayta urinib ko'ring." — check your connection. Their
 * connection was fine. No request was made at all.
 *
 * paid-platform.js is a deferred ES module; the exam page's own logic is a
 * classic inline script, which runs FIRST. A1 read
 * window.getAuthoritativeCourseProgress before the module had installed it,
 * found undefined, and returned its one failure shape — which the page
 * rendered as a network error. A2, B1 and B2 happened to await a
 * waitForSync() helper before looking, so only A1 broke, and it broke for
 * every A1 learner on every load: a race with a fixed outcome, not a flake.
 *
 * Underneath that was the real defect: ONE failure shape for every way the
 * check can fail. "You are not signed in", "you have not bought this course",
 * "you have three topics left", "the server is down" and "the module did not
 * load" all became the same sentence about the internet. This module gives
 * each its own state, and each state its own screen.
 *
 * WHAT IT NEVER DOES. It never decides eligibility from localStorage, and it
 * never guesses: a read that did not succeed is an error state, never a
 * silent "not finished". Completion is the SERVER's completedTopics, and the
 * only rule is the platform rule — the exercises at 80%. The vocabulary deck
 * is not consulted here, and never was.
 */
(function (global) {
    'use strict';

    var STATES = {
        LOADING: 'LOADING',
        ELIGIBLE: 'ELIGIBLE',
        LOCKED: 'LOCKED',
        UNAUTHORIZED: 'UNAUTHORIZED',
        FORBIDDEN: 'FORBIDDEN',
        NETWORK_ERROR: 'NETWORK_ERROR',
        SERVER_ERROR: 'SERVER_ERROR'
    };

    /* The size of each course. Pinned here because an exam page is a classic
       script and cannot import the server canon; verify_exam_progression.cjs
       compares these against api/_lib/course-canon.js so they cannot drift. */
    var TOPIC_TOTALS = { A1: 12, A2: 16, B1: 20, B2: 16 };

    /* How long to wait for paid-platform.js. It is a deferred module, so it
       always lands after the page's inline script — the wait is the normal
       path, not an error path. */
    var PLATFORM_WAIT_MS = 8000;

    function totalFor(course) {
        return TOPIC_TOTALS[String(course || '').trim().toUpperCase()] || 0;
    }

    /** Wait for a global to appear, or give up. */
    function waitFor(name, maxMs) {
        return new Promise(function (resolve) {
            if (typeof global[name] === 'function') return resolve(true);
            var waited = 0;
            var iv = setInterval(function () {
                waited += 100;
                if (typeof global[name] === 'function' || waited >= maxMs) {
                    clearInterval(iv);
                    resolve(typeof global[name] === 'function');
                }
            }, 100);
        });
    }

    /**
     * The learner's completed topic ids, as a set of numbers in range.
     *
     * Firestore has held these as numbers and, for older records, as strings.
     * Reading only `typeof n === 'number'` silently dropped every string id
     * and turned a finished course into an empty one, so coerce first and
     * range-check after.
     */
    function normaliseIds(list, total) {
        var out = {};
        (Array.isArray(list) ? list : []).forEach(function (raw) {
            var n = Number(raw);
            if (Number.isInteger(n) && n >= 1 && (!total || n <= total)) out[n] = true;
        });
        return Object.keys(out).map(Number).sort(function (a, b) { return a - b; });
    }

    /** Which of the course's topics are still outstanding. */
    function missingFrom(done, total) {
        var have = {};
        done.forEach(function (n) { have[n] = true; });
        var out = [];
        for (var i = 1; i <= total; i++) if (!have[i]) out.push(i);
        return out;
    }

    /**
     * Why did the authoritative read fail?
     *
     * The distinction matters more than the wording: telling a signed-out
     * learner to check their internet sends them to fix the wrong thing.
     */
    function classify(err) {
        var m = String((err && (err.code || err.message)) || '').toLowerCase();
        if (/permission|forbidden|403/.test(m)) return STATES.FORBIDDEN;
        if (/unauthenticated|unauthorized|401|no session|sign/.test(m)) return STATES.UNAUTHORIZED;
        if (/timed out|timeout|unavailable|network|offline|failed to fetch|deadline/.test(m)) {
            return STATES.NETWORK_ERROR;
        }
        return STATES.SERVER_ERROR;
    }

    /**
     * Topics this learner has already EARNED but which the server has not
     * recorded — an attempt stored at 80% or better with no completion.
     *
     * Reported through the same authoritative call the course page uses, so
     * the client still never writes completedTopics, the server still applies
     * its own rule, and nothing below the threshold is ever sent. Idempotent:
     * a topic already complete, or already reported, is not sent again.
     */
    async function reconcile(course, uid, total) {
        var TC = global.UzTopicCompletion;
        if (!TC || typeof TC.reconcile !== 'function') return { reported: [] };
        if (typeof global.completeCourseComponent !== 'function') return { reported: [] };
        if (typeof global.getUserQuizResults !== 'function') return { reported: [] };

        var results = {};
        try { results = (await global.getUserQuizResults(uid, course)) || {}; } catch (e) { return { reported: [] }; }

        var state = {};
        try {
            if (typeof global.getUserProgress === 'function') {
                state = (await global.getUserProgress(uid, course)) || {};
            }
        } catch (e) { state = {}; }

        var ids = [];
        for (var i = 1; i <= total; i++) ids.push(i);
        return TC.reconcile({
            topicIds: ids,
            courseState: state,
            results: results,
            resultField: String(course).toLowerCase() + 'ExerciseResult',
            report: function (id) { return global.completeCourseComponent(course, id, 'exercises'); }
        });
    }

    /**
     * The whole question, answered once.
     *
     * opts: { course, uid, privileged, waitMs, allowReconcile }
     * returns { state, done, missing, total, detail }
     */
    async function evaluate(opts) {
        var o = opts || {};
        var course = String(o.course || '').trim().toUpperCase();
        var total = totalFor(course);
        var base = { state: STATES.SERVER_ERROR, done: [], missing: [], total: total, detail: '' };

        if (!total) {
            return Object.assign(base, { detail: 'unknown course ' + course });
        }
        if (o.privileged === true) {
            /* Staff keep their existing testing bypass. */
            return { state: STATES.ELIGIBLE, done: [], missing: [], total: total, detail: 'privileged' };
        }

        var uid = o.uid;
        if (!uid || uid === 'guest') {
            return Object.assign(base, { state: STATES.UNAUTHORIZED, detail: 'no session' });
        }

        /* THE FIX FOR THE REPORTED BUG. paid-platform.js is a deferred module
           and the page's own script runs first; not waiting for it produced a
           "check your internet" screen with no request behind it. */
        var ready = await waitFor('getAuthoritativeCourseProgress',
            Number(o.waitMs) || PLATFORM_WAIT_MS);
        if (!ready) {
            return Object.assign(base, {
                state: STATES.SERVER_ERROR,
                detail: 'paid-platform.js did not load'
            });
        }

        async function read() {
            var p = await global.getAuthoritativeCourseProgress(uid, course);
            return normaliseIds(p && p.completedTopics, total);
        }

        var done;
        try {
            done = await read();
        } catch (e) {
            return Object.assign(base, { state: classify(e), detail: String((e && e.message) || e) });
        }

        /* Short of the full course? The learner may have EARNED topics the
           server never recorded — repair that once, then read again. Nothing
           here can open a topic that was not earned. */
        if (done.length < total && o.allowReconcile !== false) {
            try {
                var rec = await reconcile(course, uid, total);
                if (rec && rec.reported && rec.reported.length) {
                    done = await read();
                }
            } catch (e) { /* reconciliation is a repair, never a gate */ }
        }

        var missing = missingFrom(done, total);
        return {
            state: missing.length ? STATES.LOCKED : STATES.ELIGIBLE,
            done: done, missing: missing, total: total, detail: ''
        };
    }

    /* ------------------------------------------------------------ the screen */

    var COPY = {
        LOADING: {
            icon: '⏳', title: 'Kurs holati tekshirilmoqda…',
            body: 'Bir necha soniya kuting.'
        },
        LOCKED: {
            icon: '🔒', title: 'Yakuniy imtihon hali ochilmagan.',
            body: 'Kursning barcha mavzularini tugating.'
        },
        UNAUTHORIZED: {
            icon: '🔑', title: 'Tizimga kirish kerak.',
            body: 'Sessiya tugagan. Kabinetga qayta kiring va imtihonni oching.'
        },
        FORBIDDEN: {
            icon: '🚫', title: 'Bu kursga ruxsatingiz yo‘q.',
            body: 'Kursni sotib olgandan so‘ng yakuniy imtihon ochiladi.'
        },
        NETWORK_ERROR: {
            icon: '📶', title: 'Aloqa uzildi.',
            body: 'Internet aloqasini tekshirib, qayta urinib ko‘ring.'
        },
        SERVER_ERROR: {
            icon: '⚠️', title: 'Kurs holatini hozir tekshirib bo‘lmadi.',
            body: 'Bu kurs tugallanmagan degani emas. Biroz kutib, qayta urinib ko‘ring.'
        }
    };

    var TONE = {
        LOADING: ['#90A4AE', '#ECEFF1', '#CFD8DC'],
        LOCKED: ['#F44336', '#FFEBEE', '#FFCDD2'],
        UNAUTHORIZED: ['#3F51B5', '#E8EAF6', '#C5CAE9'],
        FORBIDDEN: ['#7E57C2', '#EDE7F6', '#D1C4E9'],
        NETWORK_ERROR: ['#FF9800', '#FFF3E0', '#FFE0B2'],
        SERVER_ERROR: ['#FF9800', '#FFF3E0', '#FFE0B2']
    };

    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function btn(act, label, primary) {
        return '<button type="button" data-examgate="' + act + '" style="' +
               (primary
                   ? 'background:linear-gradient(135deg,#FF9800,#E65100);color:#fff;border:none;'
                   : 'background:#607d8b;color:#fff;border:none;') +
               'padding:12px 28px;border-radius:50px;font-size:1rem;font-weight:700;' +
               'cursor:pointer;margin:4px 4px 0;">' + esc(label) + '</button>';
    }

    /**
     * The screen for one outcome.
     *
     * LOCKED names the topics that are actually left, because "finish the
     * course" is not an instruction anyone can act on. Every failure state
     * offers a retry that re-runs the check — never a page reload dressed up
     * as one, which is what the old screen offered.
     */
    function render(result, opts) {
        var r = result || {};
        var o = opts || {};
        var state = r.state || STATES.SERVER_ERROR;
        var copy = COPY[state] || COPY.SERVER_ERROR;
        var tone = TONE[state] || TONE.SERVER_ERROR;

        var body = copy.body;
        if (state === STATES.LOCKED && r.missing && r.missing.length) {
            body = (r.total - r.missing.length) + ' / ' + r.total +
                   ' ta mavzu tugatilgan. Qolgan mavzular: ' + r.missing.join(', ') + '.';
        }

        var acts = '';
        if (state === STATES.LOCKED) {
            acts = btn('course', 'Kursga qaytish', true);
        } else if (state === STATES.UNAUTHORIZED) {
            acts = btn('login', 'Kirish', true) + btn('retry', 'Qayta urinish', false);
        } else if (state === STATES.FORBIDDEN) {
            acts = btn('course', 'Kursga qaytish', true);
        } else if (state === STATES.NETWORK_ERROR || state === STATES.SERVER_ERROR) {
            acts = btn('retry', 'Qayta urinish', true) + btn('course', 'Kursga qaytish', false);
        }

        return '<div class="exam-intro" data-examgate-screen="' + state + '" style="border-color:' +
               tone[0] + ';background:linear-gradient(135deg,' + tone[1] + ',' + tone[2] + ');">' +
               '<div style="font-size:2.4rem;margin-bottom:8px;">' + copy.icon + '</div>' +
               '<div style="font-size:1.12rem;font-weight:800;margin-bottom:6px;">' +
               esc(copy.title) + '</div>' +
               '<div style="font-size:0.95rem;font-weight:600;">' + esc(body) + '</div>' +
               (acts ? '<div style="margin-top:16px;">' + acts + '</div>' : '') +
               (o.detail && r.detail
                   ? '<div style="margin-top:10px;font-size:.8rem;opacity:.7;">' + esc(r.detail) + '</div>'
                   : '') +
               '</div>';
    }

    /**
     * Run the check, paint the outcome, and keep the retry working.
     *
     * `onEligible` is called only when the server said so. Everything else
     * stays on this screen — the exam is never rendered on a guess.
     */
    function mount(opts) {
        var o = opts || {};
        var host = o.host;
        var busy = false;

        function paint(result) {
            if (!host) return;
            host.innerHTML = render(result, o);
        }

        async function run() {
            if (busy) return;
            busy = true;
            paint({ state: STATES.LOADING, total: totalFor(o.course), missing: [], done: [] });
            var result;
            try {
                result = await evaluate(o);
            } catch (e) {
                result = { state: STATES.SERVER_ERROR, done: [], missing: [],
                           total: totalFor(o.course), detail: String((e && e.message) || e) };
            }
            busy = false;
            if (result.state === STATES.ELIGIBLE) {
                if (host) host.innerHTML = '';
                if (typeof o.onEligible === 'function') o.onEligible(result);
                return result;
            }
            paint(result);
            if (typeof o.onBlocked === 'function') o.onBlocked(result);
            return result;
        }

        if (host && !host.__examGateBound) {
            host.__examGateBound = true;
            host.addEventListener('click', function (e) {
                var b = e.target && e.target.closest ? e.target.closest('[data-examgate]') : null;
                if (!b) return;
                var act = b.getAttribute('data-examgate');
                /* THE RETRY REALLY RETRIES. The old one called
                   location.reload(), which re-ran the same losing race and
                   returned the learner to the same screen. */
                if (act === 'retry') { run(); return; }
                if (act === 'course' && o.coursePage) { global.location.href = o.coursePage; return; }
                if (act === 'login' && o.loginPage) { global.location.href = o.loginPage; }
            });
        }
        return run();
    }

    global.UzExamGate = {
        STATES: STATES,
        TOPIC_TOTALS: TOPIC_TOTALS,
        PLATFORM_WAIT_MS: PLATFORM_WAIT_MS,
        totalFor: totalFor,
        normaliseIds: normaliseIds,
        missingFrom: missingFrom,
        classify: classify,
        evaluate: evaluate,
        render: render,
        mount: mount
    };
})(typeof window !== 'undefined' ? window : this);
