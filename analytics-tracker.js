/**
 * analytics-tracker.js — lightweight, buffered learning-event tracker.
 *
 * Classic <script> (no modules) so every course / vocabulary page can load it.
 * Exposes:
 *     window.uzTrack(type, data)     queue one meaningful event
 *     window.uzTrackContext          { course, topic } merged into every event
 *     window.uzTrack.flush()         force a flush
 *
 * Design goals (Stage-2 Part 9 — keep Firestore cheap):
 *   • buffer events in memory (+ localStorage across navigation)
 *   • flush in BATCHES: on threshold, on milestone events, every 45s, and on
 *     page hide/visibility change (keepalive fetch so it survives navigation)
 *   • ONE request per flush → the server writes the whole batch atomically
 *   • self-disables when there is no signed-in Firebase user (demo/guest),
 *     so no anonymous or demo traffic is ever logged
 *
 * Never throws into the host app — analytics must not break learning.
 */
(function () {
    'use strict';
    if (typeof window === 'undefined' || window.uzTrack) return;

    var ENDPOINT = '/api/analytics?action=track';
    var BUFFER_KEY = 'uz_evt_buf_v1';
    var FLUSH_THRESHOLD = 20;      // events buffered before an eager flush
    var FLUSH_INTERVAL_MS = 45000; // periodic flush
    var MAX_BATCH = 200;
    var MILESTONES = { topic_pass: 1, exam_pass: 1, exam_fail: 1, vocab_done: 1, ex_done: 1 };

    var buffer = loadBuffer();
    var flushing = false;
    var cachedToken = null;
    var tokenAt = 0;

    // ---- active-time accounting (for `session` events) ----
    var activeSince = document.visibilityState === 'visible' ? Date.now() : 0;
    var pendingActiveMs = 0;
    function accrueActive() {
        if (activeSince) { pendingActiveMs += Date.now() - activeSince; activeSince = 0; }
    }

    function loadBuffer() {
        try { var raw = localStorage.getItem(BUFFER_KEY); return raw ? JSON.parse(raw) : []; }
        catch (e) { return []; }
    }
    function persist() {
        try { localStorage.setItem(BUFFER_KEY, JSON.stringify(buffer.slice(-MAX_BATCH * 2))); } catch (e) {}
    }

    function inferCourse() {
        var m = (location.pathname.toLowerCase().match(/\b(a1|a2|b1|b2)\b/));
        return m ? m[1].toUpperCase() : null;
    }
    function isDemo() { return /-demo/.test(location.pathname.toLowerCase()); }

    /** Queue one event. Silently ignored on demo pages. */
    function uzTrack(type, data) {
        try {
            if (isDemo()) return;
            var ctx = window.uzTrackContext || {};
            var ev = { t: String(type), cts: Date.now() };
            var course = (data && data.course) || ctx.course || inferCourse();
            var topic = (data && data.topic != null) ? data.topic : ctx.topic;
            if (course) ev.course = course;
            if (topic != null) ev.topic = topic;
            if (data && typeof data === 'object') {
                var d = {};
                for (var k in data) { if (k !== 'course' && k !== 'topic') d[k] = data[k]; }
                if (Object.keys(d).length) ev.data = d;
            }
            buffer.push(ev);
            persist();
            if (MILESTONES[type] || buffer.length >= FLUSH_THRESHOLD) flush();
        } catch (e) { /* never break the app */ }
    }

    async function getToken(force) {
        var bridge = window.uzAuthBridge;
        if (!bridge || typeof bridge.getIdToken !== 'function') return null;
        if (!force && cachedToken && (Date.now() - tokenAt) < 25 * 60 * 1000) return cachedToken;
        try {
            var t = await bridge.getIdToken(false);
            if (t) { cachedToken = t; tokenAt = Date.now(); }
            return t;
        } catch (e) { return null; }
    }

    function buildBatch() {
        accrueActive();
        if (pendingActiveMs > 1000) {
            buffer.push({ t: 'session', cts: Date.now(), data: { activeMs: pendingActiveMs } });
            pendingActiveMs = 0;
        }
        activeSince = document.visibilityState === 'visible' ? Date.now() : 0;
        return buffer.slice(0, MAX_BATCH);
    }

    async function flush(opts) {
        opts = opts || {};
        if (flushing || isDemo()) return;
        if (!buffer.length && pendingActiveMs < 1000 && !activeSince) return;
        var token = opts.token || await getToken(false);
        if (!token) return; // not a signed-in real user → drop (demo/guest)

        flushing = true;
        var batch = buildBatch();
        if (!batch.length) { flushing = false; return; }

        var payload = JSON.stringify({ events: batch });
        try {
            if (opts.keepalive) {
                // best-effort on unload; clear optimistically (keepalive usually lands)
                fetch(ENDPOINT, {
                    method: 'POST', keepalive: true,
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: payload,
                }).catch(function () {});
                buffer = buffer.slice(batch.length);
                persist();
            } else {
                var res = await fetch(ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: payload,
                });
                if (res && res.ok) { buffer = buffer.slice(batch.length); persist(); }
            }
        } catch (e) { /* keep buffer for next flush */ }
        flushing = false;
    }

    // ---- flush triggers ----
    setInterval(function () { flush(); }, FLUSH_INTERVAL_MS);

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') { accrueActive(); flushOnHide(); }
        else if (!activeSince) { activeSince = Date.now(); }
    });
    window.addEventListener('pagehide', flushOnHide);

    function flushOnHide() {
        // Use a cached token synchronously if available (async token may not
        // resolve before the page is gone).
        if (cachedToken && (Date.now() - tokenAt) < 55 * 60 * 1000) {
            flush({ keepalive: true, token: cachedToken });
        } else {
            flush({ keepalive: true }); // best-effort async token
        }
    }

    // Warm the token cache once auth is ready, and flush anything left over
    // from a previous page.
    (function warmup() {
        var bridge = window.uzAuthBridge;
        var kick = function () { getToken(false).then(function (t) { if (t && buffer.length) flush(); }); };
        if (bridge && bridge.ready && typeof bridge.ready.then === 'function') bridge.ready.then(kick);
        else setTimeout(kick, 1500);
    })();

    uzTrack.flush = function () { return flush(); };
    window.uzTrack = uzTrack;
    if (!window.uzTrackContext) window.uzTrackContext = { course: inferCourse(), topic: null };
})();
