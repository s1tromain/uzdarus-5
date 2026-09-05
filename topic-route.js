/**
 * topic-route.js — the topic overview: grammar, vocabulary, exercises.
 *
 * ONE overview for A1, A2, B1, B2 and all four demos. Before this, opening a
 * topic dropped the learner straight into a wall of grammar with the exercises
 * somewhere below and the vocabulary reachable only from a button on the topic
 * card. There was no screen that said what a topic contains or in what order
 * to do it, and each course expressed what it did have differently.
 *
 * THE ROUTE IS A RECOMMENDATION, NOT A GATE.
 *
 *     grammar  ->  vocabulary  ->  exercises
 *
 * The platform rule is unchanged and is not weakened here: a topic is finished
 * when its exercises reach 80%. Grammar and vocabulary are shown with their
 * own progress, they are labelled as optional in so many words, and neither
 * can block the exercises, the topic, or the next topic. The only thing that
 * blocks a topic is the topic before it, which is the rule the course already
 * had.
 */
(function (global) {
    'use strict';

    var STAGES = ['grammar', 'vocabulary', 'exercises'];

    var COPY = {
        grammar: {
            icon: '📘',
            title: 'Grammatika',
            lead: 'Mavzu qoidalari, sxemalar va misollar bilan tanishasiz.',
            optional: 'Tavsiya etiladi — mavzuni tugatish uchun shart emas.',
            cta: { not_started: 'Grammatikani o‘rganish',
                   opened: 'O‘qishni davom ettirish',
                   viewed: 'Materialni takrorlash' },
            status: { not_started: 'Ochilmagan', opened: 'Boshlangan', viewed: 'Ko‘rib chiqilgan' }
        },
        vocabulary: {
            icon: '🗂️',
            title: 'Mavzu lug‘ati',
            lead: 'Mavzu so‘zlarini yodlab, gaplarni erkin tuzasiz.',
            optional: 'Lug‘at mavzuni mustahkamlaydi, ammo keyingi bosqichga o‘tish uchun majburiy emas.',
            cta: { not_started: 'Lug‘atni ochish',
                   opened: 'Davom ettirish',
                   viewed: 'Takrorlash' },
            status: { not_started: 'Ochilmagan', opened: 'Boshlangan', viewed: 'To‘liq o‘rganilgan' }
        },
        exercises: {
            icon: '🎯',
            title: 'Mashqlar',
            lead: 'Mavzuni mustahkamlaydigan mashqlar to‘plami.',
            required: 'Mavzuni tugatish va keyingisini ochish uchun kamida 80% to‘plang.',
            cta: { not_started: 'Mashqlarni boshlash',
                   opened: 'Davom ettirish',
                   viewed: 'Qayta ishlash',
                   done: 'Mavzuni takrorlash' },
            status: { not_started: 'Boshlanmagan', opened: 'Boshlangan',
                      viewed: 'Bajarilgan', done: 'Tugatilgan' }
        }
    };

    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* ------------------------------------------------- the grammar status

       Deliberately local and deliberately informational. The server schema is
       untouched: grammar is not a course component, it is never reported, and
       a learner whose browser has no record of it simply sees "not opened".
       Nothing reads this to decide anything. */
    var KEY = 'uzdarus:grammar-seen';

    function seenStore() {
        try { return JSON.parse(global.localStorage.getItem(KEY) || '{}') || {}; }
        catch (e) { return {}; }
    }
    function grammarStatus(course, topicId) {
        var all = seenStore();
        return (all[course + ':' + topicId]) || 'not_started';
    }
    function markGrammar(course, topicId, status) {
        try {
            var all = seenStore();
            var was = all[course + ':' + topicId];
            /* only ever forward: opened never overwrites viewed */
            if (was === 'viewed') return was;
            all[course + ':' + topicId] = status;
            global.localStorage.setItem(KEY, JSON.stringify(all));
            return status;
        } catch (e) { return status; }   /* a full quota must not break a lesson */
    }

    /* ------------------------------------------------------------ rendering */

    function statusPill(stage, state) {
        var c = COPY[stage];
        var label = (c.status && c.status[state]) || '';
        if (!label) return '';
        var cls = state === 'done' || state === 'viewed' ? ' is-done' : '';
        return '<span class="uzr-tag' + cls + '">' + esc(label) + '</span>';
    }

    function card(stage, s, index) {
        var c = COPY[stage];
        var state = s.state || 'not_started';
        var cta = (c.cta && (c.cta[state] || c.cta.not_started)) || 'Ochish';
        var blocked = !!s.blocked;

        var meta = '';
        if (s.meta && s.meta.length) {
            meta = '<p class="uzr-meta">' + s.meta.map(function (m) {
                return '<span>' + esc(m.label) + ': <b>' + esc(m.value) + '</b></span>';
            }).join('') + '</p>';
        }
        var bar = (typeof s.percent === 'number')
            ? '<div class="uzr-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
              Math.max(0, Math.min(100, Math.round(s.percent))) + '"><i style="width:' +
              Math.max(0, Math.min(100, Math.round(s.percent))) + '%"></i></div>'
            : '';

        var tagRec = stage === 'exercises'
            ? '<span class="uzr-tag is-req">Majburiy</span>'
            : '<span class="uzr-tag is-rec">Tavsiya etiladi</span>';

        var note = stage === 'exercises' ? c.required : c.optional;

        return '<' + (blocked ? 'div' : 'button') +
            ' class="uzr-card' + (s.current ? ' is-current' : '') + (blocked ? ' is-blocked' : '') +
            '" data-stage="' + stage + '"' +
            (blocked ? '' : ' type="button" data-uzr-open="' + stage + '"') +
            ' aria-label="' + esc(c.title) + '">' +
            '<span class="uzr-step" aria-hidden="true">' + c.icon + '</span>' +
            /* ONE COLUMN FOR EVERYTHING THE CARD SAYS. The icon and the text
               used to be siblings in the same grid, so once the icon's row span
               ran out the remaining paragraphs were auto-placed UNDER it, in a
               column the width of the icon — the explanation broke to one word
               per line and the button came out a few letters wide. The text now
               lives in its own column that is allowed to shrink. */
            '<div class="uzr-card-main">' +
                '<div class="uzr-card-head">' +
                    '<h3 class="uzr-card-title">' + (index + 1) + '. ' + esc(c.title) + '</h3>' +
                    tagRec + statusPill(stage, state) +
                '</div>' +
                '<p class="uzr-card-body">' + esc(s.lead || c.lead) + '</p>' +
                meta + bar +
                '<p class="uzr-note">' + esc(note) + '</p>' +
                (blocked
                    ? '<p class="uzr-blocked">' + esc(s.blockedReason ||
                          'Bu bo‘lim hozircha mavjud emas.') + '</p>'
                    : '<span class="uzr-cta">' + esc(cta) + '</span>') +
            '</div>' +
            '</' + (blocked ? 'div' : 'button') + '>';
    }

    /**
     * ctx: {
     *   course, topicId, title, description,
     *   locked, lockedReason,          the PREVIOUS topic rule, nothing else
     *   completed,                     the server's verdict for this topic
     *   grammar:    { state, lead, meta }
     *   vocabulary: { state, percent, meta }
     *   exercises:  { state, percent, meta }
     * }
     */
    function render(ctx) {
        var c = ctx || {};
        var doneTag = c.completed
            ? '<span class="uzr-state is-done">✓ Tugatilgan</span>'
            : '<span class="uzr-state">Jarayonda</span>';

        if (c.locked) {
            return '<div class="uzr">' +
                '<div class="uzr-head"><div class="uzr-head-main">' +
                '<div class="uzr-crumb"><span class="uzr-level">' + esc(c.course) + '</span>' +
                '<span class="uzr-sep" aria-hidden="true">·</span><span>' +
                c.topicId + '-mavzu</span></div>' +
                '<h2 class="uzr-title">' + esc(c.title) + '</h2></div></div>' +
                '<div class="uzr-blocked" style="margin-top:16px;">' +
                esc(c.lockedReason || 'Avvalgi mavzuni tugatgandan so‘ng ochiladi.') +
                '</div></div>';
        }

        var stages = STAGES.map(function (stage, i) {
            return card(stage, c[stage] || {}, i);
        }).join('');

        return '<div class="uzr">' +
            '<div class="uzr-head">' +
                '<div class="uzr-head-main">' +
                    '<div class="uzr-crumb">' +
                        '<span class="uzr-level">' + esc(c.course) + '</span>' +
                        '<span class="uzr-sep" aria-hidden="true">·</span>' +
                        '<span>' + c.topicId + '-mavzu</span>' +
                    '</div>' +
                    '<h2 class="uzr-title">' + esc(c.title) + '</h2>' +
                    (c.description ? '<p class="uzr-desc">' + esc(c.description) + '</p>' : '') +
                '</div>' +
                doneTag +
            '</div>' +
            '<div class="uzr-route">' + stages + '</div>' +
            '</div>';
    }

    /**
     * Draw the overview into `host` and wire its three cards.
     *
     * The listener is bound to the HOST once, not to the cards, so reopening a
     * topic — which redraws the cards — can never accumulate handlers.
     */
    function mount(host, ctx, handlers) {
        if (!host) return null;
        var h = handlers || {};
        host.innerHTML = render(ctx);
        /* One listener for the life of the host, and it reads the handlers back
           off the host rather than closing over them. Binding once keeps a
           press to a single action; reading them back keeps a remount — a new
           topic drawn into the same node — from firing the previous topic's. */
        host.__uzrHandlers = h;
        if (!host.__uzrBound) {
            host.__uzrBound = true;
            host.addEventListener('click', function (e) {
                var b = e.target && e.target.closest ? e.target.closest('[data-uzr-open]') : null;
                if (!b) return;
                var stage = b.getAttribute('data-uzr-open');
                var live = host.__uzrHandlers || {};
                var fn = live['on' + stage.charAt(0).toUpperCase() + stage.slice(1)];
                if (typeof fn === 'function') fn(stage);
            });
        }
        return host;
    }

    /* ------------------------------------------------- the page adapter

       Everything a course page has to do, in one call. The pages differ in
       where their lesson body lives and how their exercises start; they do not
       differ in what a topic overview is, so only those two things are passed
       in. Eight pages, one implementation. */

    /** The word count a course wrote into its own vocabulary banner. */
    function wordCountFrom(html) {
        var m = String(html || '').match(/(\d+)\s*ta\s+so\u2018?['\u2018\u2019]?z/i);
        return m ? Number(m[1]) : null;
    }

    /**
     * opts: {
     *   course, topicId, title, description, host,
     *   demo,                        a demo page: only its open topics exist
     *   locked, lockedReason,
     *   completed, exercisePercent, exerciseCount, exerciseState,
     *   vocabPercent, vocabWords,
     *   grammarChars, grammarHref, vocabHref,
     *   onExercises                  start THIS page's existing exercise flow
     * }
     */
    function open(opts) {
        var o = opts || {};
        var gState = grammarStatus(o.course, o.topicId);

        var grammarMeta = [];
        if (o.grammarChars) {
            /* an honest estimate from the material itself: ~900 characters a
               minute of careful reading, floored at one minute */
            grammarMeta.push({ label: 'Taxminiy vaqt',
                               value: Math.max(1, Math.round(o.grammarChars / 900)) + ' daq' });
        }

        var vocabMeta = [];
        if (o.vocabWords) vocabMeta.push({ label: 'So\u2018zlar', value: String(o.vocabWords) });
        if (typeof o.vocabPercent === 'number') {
            vocabMeta.push({ label: 'Progress', value: Math.round(o.vocabPercent) + '%' });
        }

        var exMeta = [];
        if (o.exerciseCount) exMeta.push({ label: 'Mashqlar', value: String(o.exerciseCount) });
        if (typeof o.exerciseBest === 'number') {
            exMeta.push({ label: 'Eng yaxshi natija', value: Math.round(o.exerciseBest) + '%' });
        }
        if (typeof o.exerciseLast === 'number') {
            exMeta.push({ label: 'Oxirgi urinish', value: Math.round(o.exerciseLast) + '%' });
        }

        var vocabState = (typeof o.vocabPercent === 'number' && o.vocabPercent >= 100) ? 'viewed'
                       : (typeof o.vocabPercent === 'number' && o.vocabPercent > 0) ? 'opened'
                       : 'not_started';
        var exState = o.completed ? 'done' : (o.exerciseState || 'not_started');

        var ctx = {
            course: o.course, topicId: o.topicId,
            title: o.title, description: o.description,
            locked: o.locked, lockedReason: o.lockedReason,
            completed: !!o.completed,
            grammar: { state: gState, meta: grammarMeta,
                       blocked: o.grammarChars === 0 && !o.grammarHref,
                       blockedReason: 'Bu mavzu uchun material tayyorlanmoqda.' },
            vocabulary: { state: vocabState, percent: o.vocabPercent, meta: vocabMeta },
            exercises: { state: exState, percent: o.exercisePercent, meta: exMeta,
                         current: !o.completed }
        };

        return mount(o.host, ctx, {
            onGrammar: function () {
                /* opened, never viewed: only the reader can say it was read */
                markGrammar(o.course, o.topicId, 'opened');
                if (o.grammarHref) global.location.href = o.grammarHref;
            },
            onVocabulary: function () {
                if (o.vocabHref) global.location.href = o.vocabHref;
            },
            onExercises: function () {
                if (typeof o.onExercises === 'function') o.onExercises();
            }
        });
    }

    global.UzTopicRoute = {
        open: open,
        wordCountFrom: wordCountFrom,
        STAGES: STAGES,
        COPY: COPY,
        render: render,
        mount: mount,
        grammarStatus: grammarStatus,
        markGrammar: markGrammar,
        GRAMMAR_KEY: KEY
    };
})(typeof window !== 'undefined' ? window : this);
