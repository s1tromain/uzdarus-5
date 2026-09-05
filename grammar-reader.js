/**
 * grammar-reader.js — one reader for the grammar of all 64 topics.
 *
 * WHY ONE. The four courses had four ways of showing their grammar, all of
 * them buried inside the lesson page: A1, A2 and B1 inline in courseData, B2
 * assembled at runtime from b2-lesson-data.js. Copying that into 64 pages
 * would have guaranteed the same drift the exam gates and the completion rule
 * both suffered. The material is generated into grammar-data/<course>/<id>.js
 * — one small file each — and this reader renders whichever one the route
 * names.
 *
 * WHAT IT REFUSES TO DO. It never renders a course or topic the canon does not
 * know. It never injects the material as raw markup: the course's own HTML is
 * passed through a small allowlist first, so a table survives and a script
 * tag, an event handler or a javascript: URL does not. And it never blocks
 * anything — reading the grammar is a recommendation, and the platform rule is
 * unchanged: a topic is finished by its exercises at 80%.
 */
(function (global) {
    'use strict';

    var TOTALS = { A1: 12, A2: 16, B1: 20, B2: 16 };

    /* ------------------------------------------------------------ the route */

    /**
     * @param search  the query string
     * @param allow   the courses THIS page may open. The access gate in
     *                firebase-client.js authorises by page NAME, so a page that
     *                serves one pack has to refuse the other pack's courses
     *                itself — otherwise an A1A2 learner could read B1 material
     *                by editing the query.
     */
    function readRoute(search, allow, maxTopic) {
        var q = {};
        String(search || '').replace(/^\?/, '').split('&').forEach(function (pair) {
            if (!pair) return;
            var i = pair.indexOf('=');
            var k = decodeURIComponent(i < 0 ? pair : pair.slice(0, i));
            var v = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
            q[k] = v;
        });
        var course = String(q.course || '').trim().toUpperCase();
        var topic = Number(q.topic);
        var total = TOTALS[course] || 0;
        if (!total) return { ok: false, reason: 'course', course: course, topic: topic };
        if (!Number.isInteger(topic) || topic < 1 || topic > total) {
            return { ok: false, reason: 'topic', course: course, topic: q.topic, total: total };
        }
        if (allow && allow.indexOf(course) < 0) {
            return { ok: false, reason: 'course', course: course, topic: topic };
        }
        /* The public demo page serves the demo's own topics and nothing else. */
        if (maxTopic && topic > maxTopic) {
            return { ok: false, reason: 'topic', course: course, topic: topic, total: maxTopic };
        }
        return { ok: true, course: course, topic: topic, total: total,
                 demo: q.demo === '1' || q.demo === 'true' };
    }

    /* -------------------------------------------------------- the sanitizer */

    /* Enough for a grammar page and nothing more. The material is authored by
       the course, not by a learner, but it reaches the document as markup and
       the allowlist is what makes that safe to keep saying. */
    var ALLOWED = {
        P: 1, BR: 1, STRONG: 1, B: 1, EM: 1, I: 1, U: 1, SPAN: 1, DIV: 1,
        UL: 1, OL: 1, LI: 1, H3: 1, H4: 1, H5: 1, H6: 1, SMALL: 1, SUP: 1, SUB: 1,
        TABLE: 1, THEAD: 1, TBODY: 1, TR: 1, TH: 1, TD: 1, CAPTION: 1,
        CODE: 1, PRE: 1, BLOCKQUOTE: 1, HR: 1, IMG: 1, FIGURE: 1, FIGCAPTION: 1
    };
    var ALLOWED_ATTR = { class: 1, colspan: 1, rowspan: 1, alt: 1, src: 1, lang: 1, dir: 1 };

    function sanitize(html, doc) {
        var d = doc || global.document;
        var tpl = d.createElement('div');
        tpl.innerHTML = String(html == null ? '' : html);
        var walk = function (node) {
            var kids = Array.prototype.slice.call(node.childNodes);
            kids.forEach(function (child) {
                if (child.nodeType === 3) return;                    /* text */
                if (child.nodeType !== 1) { node.removeChild(child); return; }
                var tag = child.tagName;
                if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE' ||
                    tag === 'IFRAME' || tag === 'OBJECT' || tag === 'EMBED') {
                    /* these carry code, not prose: drop them WITH their text */
                    node.removeChild(child);
                    return;
                }
                if (!ALLOWED[tag]) {
                    /* keep what it said, drop what it was */
                    while (child.firstChild) node.insertBefore(child.firstChild, child);
                    node.removeChild(child);
                    return;
                }
                Array.prototype.slice.call(child.attributes).forEach(function (a) {
                    var n = a.name.toLowerCase();
                    if (!ALLOWED_ATTR[n]) { child.removeAttribute(a.name); return; }
                    if (n === 'src') {
                        var v = String(a.value || '').trim();
                        /* only a real image path; never javascript: or data: */
                        if (!/^(\.\.?\/|\/)?[\w./ %+-]+\.(jpg|jpeg|png|webp|gif)$/i.test(v)) {
                            child.removeAttribute('src');
                            return;
                        }
                        /* the material is read from a page one level down, so a
                           relative path keeps working from the reader too */
                        child.setAttribute('loading', 'lazy');
                        child.setAttribute('decoding', 'async');
                    }
                });
                walk(child);
            });
        };
        walk(tpl);
        return tpl;
    }

    /* ----------------------------------------------------------- rendering */

    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function list(items, cls) {
        if (!items || !items.length) return '';
        return '<ul class="' + cls + '">' +
               items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
               '</ul>';
    }

    /**
     * The page around the material: what the learner will be able to do, the
     * material itself, what to watch for, a one-line summary, and the three
     * ways onward. The material is inserted as a sanitised NODE, never as a
     * string, so nothing here can re-introduce markup.
     */
    function render(host, data, route, doc) {
        var d = doc || global.document;
        host.innerHTML =
            '<article class="gr-doc">' +
            '<header class="gr-head">' +
                '<div class="gr-crumb">' +
                    '<span class="gr-level">' + esc(route.course) + '</span>' +
                    '<span class="gr-sep" aria-hidden="true">·</span>' +
                    '<span>' + route.topic + '-mavzu</span>' +
                '</div>' +
                '<h1 class="gr-title">' + esc(data.title) + '</h1>' +
                (data.description ? '<p class="gr-desc">' + esc(data.description) + '</p>' : '') +
            '</header>' +
            (data.objective
                ? '<section class="gr-goal" aria-label="Maqsad">' +
                  '<span class="gr-goal-ico" aria-hidden="true">🎯</span>' +
                  '<p>' + esc(data.objective) + '</p></section>'
                : '') +
            '<section class="gr-body" id="grBody"></section>' +
            list(data.notes, 'gr-notes') +
            (data.mistakes && data.mistakes.length
                ? '<section class="gr-mistakes"><h2>Частые ошибки</h2>' +
                  list(data.mistakes, 'gr-mistake-list') + '</section>'
                : '') +
            (data.summary
                ? '<section class="gr-summary"><h2>Коротко</h2><p>' +
                  esc(data.summary) + '</p></section>'
                : '') +
            '<nav class="gr-next" aria-label="Keyingi qadam">' +
                '<button type="button" class="gr-btn gr-primary" data-gr="overview">' +
                    'Mavzu sharhiga qaytish</button>' +
                '<button type="button" class="gr-btn" data-gr="vocab">Lug‘atga o‘tish</button>' +
                '<button type="button" class="gr-btn" data-gr="exercises">Mashqlarga o‘tish</button>' +
            '</nav>' +
            '</article>';

        var body = host.querySelector('#grBody');
        var clean = sanitize(data.body, d);
        while (clean.firstChild) body.appendChild(clean.firstChild);
        if (!body.textContent.trim() && !body.querySelector('img')) {
            body.innerHTML = '<p class="gr-empty">Bu mavzu uchun grammatik material tayyorlanmoqda.</p>';
        }
        return host;
    }

    function screen(kind, detail) {
        var copy = {
            loading: ['⏳', 'Material yuklanmoqda…', ''],
            course: ['🧭', 'Bunday kurs yo‘q.', 'Havolani tekshiring yoki kurs sahifasiga qayting.'],
            topic: ['🧭', 'Bunday mavzu yo‘q.', 'Havolani tekshiring yoki kurs sahifasiga qayting.'],
            missing: ['📄', 'Material topilmadi.', 'Biroz kutib, qayta urinib ko‘ring.'],
            network: ['📶', 'Materialni yuklab bo‘lmadi.', 'Internet aloqasini tekshirib, qayta urinib ko‘ring.']
        }[kind] || ['⚠️', 'Nimadir noto‘g‘ri ketdi.', ''];
        return '<div class="gr-state" data-gr-state="' + kind + '">' +
               '<div class="gr-state-ico" aria-hidden="true">' + copy[0] + '</div>' +
               '<h2>' + esc(copy[1]) + '</h2>' +
               (copy[2] ? '<p>' + esc(copy[2]) + '</p>' : '') +
               (detail ? '<p class="gr-state-detail">' + esc(detail) + '</p>' : '') +
               (kind === 'loading' ? '' :
                   '<div class="gr-state-acts">' +
                   (kind === 'missing' || kind === 'network'
                       ? '<button type="button" class="gr-btn gr-primary" data-gr="retry">Qayta urinish</button>'
                       : '') +
                   '<button type="button" class="gr-btn" data-gr="course">Kursga qaytish</button>' +
                   '</div>') +
               '</div>';
    }

    /* ------------------------------------------------------------- loading */

    var loaded = {};

    /** Fetch one topic's module, once. */
    function loadTopic(course, topic, base) {
        var key = course + '/' + topic;
        if (loaded[key]) return loaded[key];
        loaded[key] = new Promise(function (resolve, reject) {
            var have = global.UzGrammarData && global.UzGrammarData[course]
                && global.UzGrammarData[course][topic];
            if (have) return resolve(have);
            var s = global.document.createElement('script');
            s.src = (base || '../grammar-data/') + course.toLowerCase() + '/' + topic + '.js';
            s.async = true;
            s.onload = function () {
                var got = global.UzGrammarData && global.UzGrammarData[course]
                    && global.UzGrammarData[course][topic];
                if (got) resolve(got);
                else reject(new Error('missing'));
            };
            s.onerror = function () { reject(new Error('network')); };
            global.document.head.appendChild(s);
        });
        loaded[key].catch(function () { delete loaded[key]; });
        return loaded[key];
    }

    /* --------------------------------------------------------------- mount */

    /**
     * opts: { host, search, base, coursePage, vocabPage, onNavigate }
     *
     * The click handler is bound ONCE to the host, so reopening a topic can
     * never accumulate listeners — the bug this kind of page collects first.
     */
    function mount(opts) {
        var o = opts || {};
        var host = o.host || global.document.getElementById('grammarRoot');
        if (!host) return Promise.resolve(null);
        var route = readRoute(o.search != null ? o.search : global.location.search,
                              o.allowCourses, o.maxTopic);

        function go(where) {
            if (typeof o.onNavigate === 'function' && o.onNavigate(where, route) === true) return;
            var course = (route.course || 'A1').toLowerCase();
            var suffix = route.demo ? '' : '';
            if (where === 'overview' || where === 'course') {
                global.location.href = (o.coursePage || (course + '-course.html')) +
                    '?topic=' + (route.topic || 1) + suffix;
                return;
            }
            if (where === 'vocab') {
                global.location.href = (o.vocabPage || (course + '-vocabulary.html')) +
                    '?topic=' + (route.topic || 1);
                return;
            }
            if (where === 'exercises') {
                global.location.href = (o.coursePage || (course + '-course.html')) +
                    '?topic=' + (route.topic || 1) + '&start=exercises';
            }
        }

        if (!host.__grBound) {
            host.__grBound = true;
            host.addEventListener('click', function (e) {
                var b = e.target && e.target.closest ? e.target.closest('[data-gr]') : null;
                if (!b) return;
                var act = b.getAttribute('data-gr');
                if (act === 'retry') { run(); return; }
                go(act);
            });
        }

        function run() {
            if (!route.ok) {
                host.innerHTML = screen(route.reason,
                    route.reason === 'topic'
                        ? route.course + ': 1 – ' + route.total
                        : String(route.course || ''));
                return Promise.resolve(null);
            }
            host.innerHTML = screen('loading');
            return loadTopic(route.course, route.topic, o.base).then(function (data) {
                render(host, data, route);
                try { global.document.title = data.title + ' — ' + route.course; } catch (e) {}
                return data;
            }, function (err) {
                host.innerHTML = screen(String(err && err.message) === 'network' ? 'network' : 'missing');
                return null;
            });
        }

        return run();
    }

    global.UzGrammarReader = {
        TOTALS: TOTALS,
        readRoute: readRoute,
        sanitize: sanitize,
        render: render,
        screen: screen,
        loadTopic: loadTopic,
        mount: mount
    };
})(typeof window !== 'undefined' ? window : this);
