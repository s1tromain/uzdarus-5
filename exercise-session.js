/* ============================================================================
 * exercise-session.js — THE Exercise Session Engine.
 *
 * ONE engine for every course (A2, B2, and whatever comes next) and every
 * lesson. It is deliberately data-driven: there is no `if (topicId === 1)`,
 * no `if (course === 'b2')`, and no knowledge of any particular exercise type
 * anywhere in this file.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE OWNS — and, more importantly, WHAT IT DOES NOT
 * ---------------------------------------------------------------------------
 * Owns:   the practice card, the fullscreen modal, the step cursor, one-at-a-
 *         time navigation, per-exercise feedback, and the resume/restart
 *         dialogue.
 *
 * Does NOT own — every one of these is DELEGATED to the host page, because the
 * host already has a production implementation and a second one would be a
 * second engine:
 *         rendering an exercise      -> host.renderGroup(group)
 *         binding its widgets        -> host.bindGroup(root, group)
 *         reading a learner answer   -> host.readAnswer(root, key, group, item)
 *         validating an answer       -> host.matchItem(item, value)
 *         grading + results screen   -> host.finish(answers)
 *         persistence                -> host.draft.save()/load()/clear()
 *
 * That inversion is the whole design. Adding a new exercise type (drag/drop,
 * matching, anything) requires ZERO changes here: the host renders it, the
 * host reads it, the host validates it.
 *
 * ---------------------------------------------------------------------------
 * PERSISTENCE
 * ---------------------------------------------------------------------------
 * This engine never touches localStorage or Firestore directly. It hands a
 * plain object to `host.draft.save()` and expects the same shape back from
 * `host.draft.load()`. On the existing platform that is wired to
 * course-global-fixes.js (localStorage + Firestore `lessonDraft`, newest-wins
 * across devices), so there is exactly one storage mechanism, not two.
 *
 * Session state shape (versioned, forward-compatible):
 *   { v: 1, cursor: <int>, answers: { "<groupId>-<i>": <any> },
 *     checked: { "<groupId>": { correct: n, total: n } }, savedAt: <ms> }
 * ==========================================================================*/
(function (global) {
    'use strict';

    if (global.UzExerciseSession) return;          // never install twice

    var STATE_VERSION = 1;
    var STYLE_ID = 'uz-session-styles';

    /* ------------------------------------------------------------------
     * PLATFORM DEFAULTS for the "earn your answers" flow.
     *
     * Every one of these is overridable per host via mount(cfg), but the
     * behaviour itself is the engine's, not any course's. A2, A1, B1, B2 and
     * every future course get it by existing — no host code required.
     *
     *   cfg.passScore                        percent (0-100) a step must reach
     *   cfg.stepGate(result, group)          optional; overrides passScore
     *   cfg.allowAnswerReview                default true
     *   cfg.requireConfirmationBeforeAnswers default true
     *   cfg.confirmationText                 { title, body[], cancel, confirm }
     *   cfg.labels                           button label overrides
     * ------------------------------------------------------------------ */
    var DEFAULT_CONFIRM = {
        title: '⚠️ Javoblarni ko‘rishni xohlaysizmi?',
        body: [
            'Biz ushbu mashqlarni sizning rus tilini mustaqil o‘rganishingiz uchun yaratganmiz.',
            'Javoblarni ko‘rishdan oldin yana bir marta mustaqil yechishga harakat qilishingizni tavsiya qilamiz.',
            'Javoblarni ko‘rganingizdan so‘ng ularni yodlab olib testni qayta topshirish oson bo‘ladi, ' +
            'ammo bu sizning haqiqiy bilim darajangizni oshirmaydi.',
            'Agar baribir javoblarni ko‘rishni istasangiz, davom etishingiz mumkin.'
        ],
        cancel: 'Bekor qilish',
        confirm: 'Davom etish'
    };

    var DEFAULT_LABELS = {
        check: 'Проверить',
        next: 'Следующее упражнение',
        finish: 'Завершить и посмотреть результат',
        retry: 'Пройти упражнение заново',
        reveal: 'Посмотреть ответы',
        restart: 'Mashqni qayta boshlash'
    };

    function opt(cfg, name, dflt) {
        return (cfg && cfg[name] !== undefined && cfg[name] !== null) ? cfg[name] : dflt;
    }
    function labelOf(cfg, key) {
        var over = cfg && cfg.labels;
        return (over && over[key]) ? over[key] : DEFAULT_LABELS[key];
    }

    /* ---------------------------------------------------------------- utils */

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function el(tag, cls, html) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (html != null) n.innerHTML = html;
        return n;
    }

    /* Groups that carry no answerable items (a reading passage, a bare audio
       player) are still shown as steps, but they can never be "wrong". */
    function isGradable(group) {
        return !!(group && Array.isArray(group.items) && group.items.length);
    }

    function itemCount(groups) {
        return groups.reduce(function (n, g) { return n + (isGradable(g) ? g.items.length : 0); }, 0);
    }

    /* ---------------------------------------------------------------- styles */

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var st = document.createElement('style');
        st.id = STYLE_ID;
        st.textContent = [
            /* practice card — deliberately mirrors the vocabulary card so the
               lesson page reads as one design, not two */
            '.uz-practice{background:linear-gradient(135deg,#5B6EF5,#3F51B5);border-radius:15px;padding:30px;',
            'text-align:center;margin:20px 0;box-shadow:0 8px 25px rgba(63,81,181,.3)}',
            '.uz-practice-ico{font-size:4rem;margin-bottom:15px}',
            '.uz-practice h3{color:#fff;margin-bottom:10px;font-size:1.8rem}',
            '.uz-practice p{color:rgba(255,255,255,.9);margin-bottom:22px;font-size:1.05rem}',
            '.uz-practice-btn{background:#fff;color:#3F51B5;border:none;padding:15px 40px;border-radius:50px;',
            'font-size:1.15rem;font-weight:700;cursor:pointer;transition:transform .2s,box-shadow .2s;',
            'box-shadow:0 4px 15px rgba(0,0,0,.2);font-family:inherit}',
            '.uz-practice-btn:hover{transform:translateY(-3px);box-shadow:0 6px 20px rgba(0,0,0,.3)}',
            '.uz-practice-meta{color:rgba(255,255,255,.85);margin-top:14px;font-size:.9rem}',
            '.uz-practice-bar{height:8px;border-radius:5px;background:rgba(255,255,255,.25);overflow:hidden;',
            'margin:0 auto 14px;max-width:340px}',
            '.uz-practice-fill{height:100%;background:#fff;border-radius:5px;transition:width .3s}',
            /* fullscreen modal */
            '.uz-modal{position:fixed;inset:0;z-index:99999;background:rgba(16,20,40,.72);',
            'display:flex;align-items:stretch;justify-content:center;padding:0}',
            '.uz-modal[hidden]{display:none}',
            '.uz-sheet{background:#f6f8fc;width:100%;max-width:100%;display:flex;flex-direction:column;overflow:hidden}',
            '.uz-head{display:flex;align-items:center;gap:14px;padding:16px 20px;background:#fff;',
            'border-bottom:1px solid #e3e8f5;flex:none}',
            '.uz-step{font-weight:800;color:#3F51B5;font-size:1rem;white-space:nowrap}',
            '.uz-progress{flex:1;height:8px;border-radius:5px;background:#e8ebf5;overflow:hidden}',
            '.uz-progress-fill{height:100%;background:linear-gradient(90deg,#5B6EF5,#3F51B5);',
            'border-radius:5px;transition:width .3s}',
            '.uz-close{border:none;background:#eef1f8;color:#5b6480;width:38px;height:38px;border-radius:10px;',
            'font-size:1.1rem;cursor:pointer;flex:none;font-family:inherit}',
            '.uz-close:hover{background:#e2e7f3}',
            '.uz-body{flex:1;overflow-y:auto;padding:20px;-webkit-overflow-scrolling:touch}',
            '.uz-foot{flex:none;padding:14px 20px;background:#fff;border-top:1px solid #e3e8f5;',
            'display:flex;gap:12px;justify-content:flex-end;align-items:center;flex-wrap:wrap}',
            '.uz-btn{border:none;border-radius:10px;padding:13px 26px;font-size:1rem;font-weight:700;',
            'cursor:pointer;font-family:inherit;transition:filter .15s}',
            '.uz-btn:hover{filter:brightness(1.07)}',
            '.uz-btn[disabled]{opacity:.5;cursor:not-allowed;filter:none}',
            '.uz-btn-primary{background:linear-gradient(135deg,#5B6EF5,#3F51B5);color:#fff}',
            '.uz-btn-ghost{background:#eef1f8;color:#3d4663}',
            /* per-exercise verdict */
            /* blocked / revealed states + the confirmation dialog */
            '.uz-verdict-score{font-size:1.28rem;margin:6px 0 4px;letter-spacing:.01em}',
            '.uz-need{font-size:.98rem;margin-bottom:8px;opacity:.9}',
            '.uz-verdict.uz-locked{background:#FFF7ED;border-color:#F2C078;color:#7A4A0B}',
            '.uz-verdict.uz-revealed{background:#F4F6FF;border-color:#B9BFE6;color:#2B3080}',
            '.uz-verdict.uz-revealed .uz-right{color:#2B3080}',
            '.uz-answers{margin:8px 0 0;padding-left:20px}',
            '.uz-answers li{margin:5px 0}',
            '.uz-ask{animation:uzFade .22s ease}',
            '.uz-ask-card{animation:uzRise .3s cubic-bezier(.22,1,.36,1)}',
            '@keyframes uzFade{from{opacity:0}to{opacity:1}}',
            '@keyframes uzRise{from{opacity:0;transform:translateY(18px) scale(.97)}',
            'to{opacity:1;transform:none}}',
            '.uz-ask-warn{max-width:520px;text-align:left;border-top:5px solid #F0A63C}',
            '.uz-ask-warn h3{text-align:center;color:#8A5200;font-size:1.22rem;line-height:1.45}',
            '.uz-ask-warn p{margin:0 0 12px;font-size:.99rem;line-height:1.7;color:#4c5470}',
            '.uz-ask-warn p:last-of-type{margin-bottom:20px;font-weight:600;color:#2f3550}',
            '@media(max-width:520px){.uz-ask-warn{padding:22px 20px}',
            '.uz-ask-actions .uz-btn{flex:1 1 100%}}',
            '.uz-gate{margin-top:12px;padding:12px 14px;border-radius:10px;background:#fff4e5;'+
            'border:1px solid #ffd8a8;color:#8a5200;font-weight:600;line-height:1.5}',
            '.uz-verdict{border-radius:12px;padding:14px 16px;margin:16px 0 4px;font-size:.98rem;line-height:1.6}',
            '.uz-verdict.ok{background:#E8F5E9;border:1.5px solid #4CAF50;color:#1B5E20}',
            '.uz-verdict.bad{background:#FFEBEE;border:1.5px solid #EF5350;color:#B71C1C}',
            '.uz-verdict h4{margin:0 0 8px;font-size:1.05rem}',
            '.uz-verdict ul{margin:8px 0 0;padding-left:20px}',
            '.uz-verdict li{margin:5px 0}',
            '.uz-verdict .uz-right{color:#1B5E20;font-weight:700}',
            '.uz-verdict .uz-your{color:#B71C1C;text-decoration:line-through}',
            '.uz-score{font-weight:800;margin-right:auto;color:#3d4663}',
            /* resume dialogue */
            '.uz-ask{position:fixed;inset:0;z-index:100000;background:rgba(16,20,40,.72);',
            'display:flex;align-items:center;justify-content:center;padding:20px}',
            '.uz-ask[hidden]{display:none}',
            '.uz-ask-card{background:#fff;border-radius:16px;padding:26px;max-width:440px;width:100%;',
            'box-shadow:0 24px 60px rgba(0,0,0,.3);text-align:center}',
            '.uz-ask-card h3{margin:0 0 10px;font-size:1.25rem;color:#1a1f36}',
            '.uz-ask-card p{margin:0 0 20px;color:#5b6480;line-height:1.6}',
            '.uz-ask-actions{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}',
            '@media(max-width:640px){.uz-head{padding:12px 14px}.uz-body{padding:14px}',
            '.uz-foot{padding:12px 14px}.uz-btn{flex:1 1 auto;padding:13px 18px}',
            '.uz-step{font-size:.9rem}.uz-practice{padding:22px}}'
        ].join('');
        (document.head || document.documentElement).appendChild(st);
    }

    /* ============================================================ Session */

    function Session(cfg) {
        this.cfg = cfg;
        this.groups = cfg.groups || [];
        this.cursor = 0;
        this.answers = {};
        this.checked = {};
        this.dom = null;
        this._onKey = null;
        this.finished = false;
        /* Which groups have had their answers revealed. Deliberately NOT
           persisted and deliberately NOT a pass: revealing is a study aid,
           never a way through. */
        this.revealed = {};
        this._lastResult = null;
    }

    Session.prototype.total = function () { return this.groups.length; };

    /** Everything the host must persist, in one plain object. */
    Session.prototype.serialize = function () {
        return {
            v: STATE_VERSION,
            cursor: this.cursor,
            answers: this.answers,
            checked: this.checked,
            savedAt: Date.now()
        };
    };

    /** Tolerant of older/absent state — an unknown shape simply starts fresh. */
    Session.prototype.restore = function (state) {
        if (!state || typeof state !== 'object') return false;
        var cur = Number(state.cursor);
        this.cursor = (Number.isFinite(cur) && cur >= 0 && cur < this.total()) ? cur : 0;
        this.answers = (state.answers && typeof state.answers === 'object') ? state.answers : {};
        this.checked = (state.checked && typeof state.checked === 'object') ? state.checked : {};
        return true;
    };

    /** True once anything at all has been entered — drives the resume prompt. */
    Session.prototype.hasProgress = function () {
        if (this.cursor > 0) return true;
        if (Object.keys(this.checked).length) return true;
        var a = this.answers;
        return Object.keys(a).some(function (k) {
            var v = a[k];
            if (Array.isArray(v)) return v.length > 0;
            return v != null && String(v).trim() !== '';
        });
    };

    /** Only PASSED steps count as solved. Entries written before this field
     *  existed have no `passed` flag and are still counted, so stored progress
     *  from an earlier version is never downgraded. */
    Session.prototype.solvedCount = function () {
        var c = this.checked;
        return Object.keys(c).filter(function (k) {
            return !c[k] || c[k].passed !== false;
        }).length;
    };

    Session.prototype._save = function () {
        /* Once the attempt is graded the draft is deliberately gone. Autosave
           from a click is deferred by a macrotask, so without this guard a
           late-firing capture would write the draft straight back after the
           host cleared it, and the finished topic would look resumable. */
        if (this.finished) return;
        var d = this.cfg.draft;
        if (d && typeof d.save === 'function') {
            try { d.save(this.serialize()); } catch (e) { /* persistence must never break practice */ }
        }
    };

    /* ------------------------------------------------------------ rendering */

    Session.prototype._group = function () { return this.groups[this.cursor]; };

    Session.prototype._renderStep = function () {
        var g = this._group();
        var body = this.dom.body;

        /* Full teardown before every step: this is what guarantees only ONE
           exercise exists at a time, and why no listener can accumulate. */
        body.innerHTML = '';

        var host = el('div', 'uz-step-host');
        host.innerHTML = this.cfg.renderGroup(g) || '';
        body.appendChild(host);

        if (typeof this.cfg.bindGroup === 'function') this.cfg.bindGroup(host, g);

        this._applyAnswers(host, g);
        this._wireAutosave(host, g);

        this.dom.step.textContent = this.cfg.stepLabel
            ? this.cfg.stepLabel(this.cursor + 1, this.total())
            : ('Упражнение ' + (this.cursor + 1) + ' из ' + this.total());
        this.dom.fill.style.width = Math.round((this.cursor / this.total()) * 100) + '%';
        body.scrollTop = 0;

        var already = this.checked[g.id];
        if (already) this._showVerdict(already, g, host);
        else this._setFooter('check');
    };

    /** Push saved answers back into freshly rendered widgets. */
    Session.prototype._applyAnswers = function (root, g) {
        if (!isGradable(g) || typeof this.cfg.writeAnswer !== 'function') return;
        var self = this;
        g.items.forEach(function (item, i) {
            var key = g.id + '-' + i;
            if (!Object.prototype.hasOwnProperty.call(self.answers, key)) return;
            try { self.cfg.writeAnswer(root, key, self.answers[key], g, item); }
            catch (e) { /* a widget that cannot be restored is left blank */ }
        });
    };

    /**
     * Autosave. ONE delegated listener pair per step (not per widget), so a
     * hundred inputs still cost two listeners, and the teardown in
     * _renderStep() disposes of them with the node.
     */
    Session.prototype._wireAutosave = function (root, g) {
        if (!isGradable(g)) return;
        var self = this;
        var capture = function () { self._collect(root, g); self._save(); };
        root.addEventListener('input', capture);
        root.addEventListener('change', capture);
        root.addEventListener('click', function (e) {
            /* chips / options / matching are click-driven; let the host's own
               handler run first, then read the resulting state. */
            if (e.target && e.target.closest) setTimeout(capture, 0);
        });
    };

    Session.prototype._collect = function (root, g) {
        if (!isGradable(g) || typeof this.cfg.readAnswer !== 'function') return;
        var self = this;
        g.items.forEach(function (item, i) {
            var key = g.id + '-' + i;
            try { self.answers[key] = self.cfg.readAnswer(root, key, g, item); }
            catch (e) { /* leave the previous value */ }
        });
    };

    /**
     * Is this attempt good enough to move on? A host may supply a function
     * (stepGate) or just a number (passScore); the engine understands both and
     * has no opinion of its own beyond "no rule means always pass".
     */
    Session.prototype._gate = function (result, g) {
        var cfg = this.cfg;
        if (typeof cfg.stepGate === 'function') {
            try {
                var r = cfg.stepGate(result, g);
                if (r && typeof r === 'object') return r;
                if (typeof r === 'boolean') return { pass: r };
            } catch (e) { /* a broken gate must never trap the learner */ }
        }
        var min = Number(cfg.passScore);
        if (!isFinite(min) || min <= 0 || !result || !result.total) return { pass: true };
        var p = Math.round((result.correct || 0) / result.total * 100);
        if (p >= min) return { pass: true };
        return { pass: false, min: min, percent: p };
    };

    /* -------------------------------------------------------------- footer */

    Session.prototype._setFooter = function (mode) {
        var f = this.dom.foot;
        f.innerHTML = '';
        var score = el('span', 'uz-score');
        var solved = this.solvedCount();
        score.textContent = solved ? (solved + ' / ' + this.total()) : '';
        f.appendChild(score);

        var self = this;
        var cfg = this.cfg;
        var mk = function (key, cls, fn) {
            var b = el('button', 'uz-btn ' + cls, esc(labelOf(cfg, key)));
            b.type = 'button';
            b.setAttribute('data-uz-act', key);
            b.addEventListener('click', fn);
            f.appendChild(b);
            return b;
        };

        if (mode === 'check') {
            mk('check', 'uz-btn-primary', function () { self._check(); });

        } else if (mode === 'blocked') {
            /* Failed the gate and has not looked at the answers. Exactly two
               ways out — try again, or make the deliberate choice to look.
               There is no "next" button to find. */
            mk('retry', 'uz-btn-primary', function () { self._retryStep(); });
            if (opt(cfg, 'allowAnswerReview', true)) {
                mk('reveal', 'uz-btn-ghost', function () { self._requestReveal(); });
            }

        } else if (mode === 'revealed') {
            /* The answers are on screen. Seeing them is not passing, so the
               only remaining action is a genuine fresh attempt. */
            mk('restart', 'uz-btn-primary', function () { self._retryStep(); });

        } else {
            var last = this.cursor >= this.total() - 1;
            mk(last ? 'finish' : 'next', 'uz-btn-primary', function () {
                last ? self._finish() : self._next();
            });
        }
    };

    /**
     * Re-run the current exercise from a clean slate. Only this group's answers
     * are dropped; every other group keeps its result, so a retry never costs
     * the learner work they already did.
     */
    Session.prototype._retryStep = function () {
        var g = this._group();
        var self = this;
        (g.items || []).forEach(function (item, i) { delete self.answers[g.id + '-' + i]; });
        delete this.checked[g.id];
        delete this.revealed[g.id];
        this._lastResult = null;
        this._save();
        this._renderStep();
    };

    /* -------------------------------------------------------------- grading */

    Session.prototype._check = function () {
        var g = this._group();
        var root = this.dom.body.querySelector('.uz-step-host');
        this._collect(root, g);

        var correct = 0, total = 0, wrong = [];
        var self = this;
        if (isGradable(g)) {
            g.items.forEach(function (item, i) {
                total++;
                var key = g.id + '-' + i;
                var val = self.answers[key];
                var okItem = false;
                try { okItem = !!self.cfg.matchItem(item, val, g); } catch (e) { okItem = false; }
                if (okItem) correct++;
                else wrong.push({ n: i + 1, item: item, given: val });
            });
        }

        var result = { correct: correct, total: total, wrong: wrong };
        var gate = this._gate(result, g);
        var passed = gate.pass !== false;
        /* `passed` is what unlocks anything downstream. A failed attempt is
           still recorded — the learner keeps their draft — but it never counts
           as solved and never opens the next step. */
        this.checked[g.id] = { correct: correct, total: total, passed: passed };
        this._lastResult = result;
        this._save();
        this._showVerdict(result, g, root);

        /* Let the host decorate the step it just graded — per-item highlighting,
           a success flourish, whatever that course needs. Generic: the engine
           passes the result and the DOM and forms no opinion about either, and
           a host that supplies nothing sees no change in behaviour. */
        if (typeof this.cfg.afterCheck === 'function') {
            try { this.cfg.afterCheck(result, g, root, passed); } catch (e) { /* never break practice */ }
        }
    };

    /**
     * Show the outcome of one exercise. Three states, and which one appears is
     * decided entirely by the gate — never by course, lesson or topic:
     *
     *   PASSED    full feedback: score, mistakes, correct answers, explanations,
     *             and the way forward.
     *   BLOCKED   score and the threshold only. NO correct answers. Two choices:
     *             try again, or deliberately ask to see the answers.
     *   REVEALED  the learner chose to look. Full feedback is shown, but seeing
     *             it is not passing: the only action left is a fresh attempt.
     */
    Session.prototype._showVerdict = function (result, g, root) {
        var body = this.dom.body;
        var old = body.querySelector('.uz-verdict');
        if (old) old.remove();

        var total = result.total != null ? result.total : (g.items ? g.items.length : 0);
        var correct = result.correct || 0;
        var percent = total ? Math.round(correct / total * 100) : 0;

        var gate = this._gate(result, g);
        var passed = gate.pass !== false;
        var revealed = !!this.revealed[g.id];
        var perfect = total > 0 && correct === total;

        /* Colour tracks MISTAKES, not the gate: a host with no threshold
           configured (A1/A2/B1 today) keeps exactly the feedback it had. */
        var v = el('div', 'uz-verdict ' + (perfect ? 'ok' : 'bad'));
        var head, score = '<div class="uz-verdict-score"><b>' + correct + ' / ' + total +
                          '</b> &mdash; ' + percent + '%</div>';

        if (passed) {
            head = perfect ? '<h4>&#9989; Правильно</h4>' : '<h4>&#10060; Есть ошибки</h4>';
            v.innerHTML = head + score + this._answersHtml(result);

        } else if (!revealed) {
            /* The card that deliberately withholds the answers. */
            v.classList.add('uz-locked');
            var need = gate.min || (this.cfg.passScore ? Number(this.cfg.passScore) : null);
            var needLine = need
                ? '<div class="uz-need">Проходной балл: <b>' + need + '%</b></div>'
                : '';
            var msg = gate.message ||
                'Упражнение нужно пройти ещё раз — правильные ответы пока скрыты.';
            v.innerHTML =
                '<h4>&#10060; Упражнение не пройдено</h4>' + score + needLine +
                '<div class="uz-gate">' + esc(msg) + '</div>';

        } else {
            /* Answers shown, but this attempt still did not pass. */
            v.classList.add('uz-revealed');
            v.innerHTML =
                '<h4>&#128065; Правильные ответы</h4>' + score +
                this._answersHtml(result) +
                '<div class="uz-gate">Просмотр ответов не засчитывается как прохождение. ' +
                'Чтобы открыть следующее упражнение, пройдите это упражнение заново.</div>';
        }

        body.appendChild(v);
        v.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        this._setFooter(passed ? 'next' : (revealed ? 'revealed' : 'blocked'));
    };

    /** Mistakes, correct answers and explanations. Shown only when allowed. */
    Session.prototype._answersHtml = function (result) {
        var wrong = (result && result.wrong) || [];
        if (!wrong.length) return '';
        return '<ul class="uz-answers">' + wrong.map(function (w) {
            var expected = Array.isArray(w.item.answer) ? w.item.answer[0] : w.item.answer;
            var given = (w.given == null || String(w.given).trim() === '')
                ? '<i>нет ответа</i>' : '<span class="uz-your">' + esc(w.given) + '</span>';
            var why = w.item.explanation || w.item.hint || '';
            return '<li>№' + w.n + ': ' + given +
                   ' &rarr; <span class="uz-right">' + esc(expected) + '</span>' +
                   (why ? '<br><small>' + esc(why) + '</small>' : '') + '</li>';
        }).join('') + '</ul>';
    };

    /** "Посмотреть ответы" — never immediate, unless a host opts out. */
    Session.prototype._requestReveal = function () {
        var self = this;
        var cfg = this.cfg;
        if (opt(cfg, 'allowAnswerReview', true) === false) return;
        if (opt(cfg, 'requireConfirmationBeforeAnswers', true) === false) {
            this._reveal();
            return;
        }
        askConfirm(cfg.confirmationText, function (agreed) {
            if (agreed) self._reveal();
        });
    };

    /**
     * Reveal the answers for the current step. Note what is absent: no _save(),
     * no change to `checked`, no cursor movement. Looking is not progress.
     */
    Session.prototype._reveal = function () {
        var g = this._group();
        if (!g || !this._lastResult) return;
        this.revealed[g.id] = true;
        this._showVerdict(this._lastResult, g, this.dom.body.querySelector('.uz-step-host'));
    };

    /* ----------------------------------------------------------- navigation */

    Session.prototype._next = function () {
        if (this.cursor >= this.total() - 1) return this._finish();
        this.cursor++;
        this._save();
        this._renderStep();
    };

    Session.prototype._finish = function () {
        this.finished = true;
        var payload = null;
        if (typeof this.cfg.finish === 'function') {
            /* The host scores the attempt and owns everything that follows:
               its results markup, its progress store, its Firebase sync. */
            try { payload = this.cfg.finish(this.answers, this.checked); } catch (e) { payload = null; }
        }
        /* A host that can render a summary keeps the learner in place and shows
           it; one that cannot simply falls back to the previous behaviour. */
        if (typeof this.cfg.renderSummary === 'function') this.showSummary(payload);
        else this.close();
    };

    /**
     * Show the host's summary in place of the exercise steps. Public, so a host
     * can open a finished topic straight to its last result without the learner
     * passing through the exercises again.
     */
    Session.prototype.showSummary = function (payload) {
        if (typeof this.cfg.renderSummary !== 'function') { this.close(); return; }
        this.open(true);

        var body = this.dom.body;
        body.innerHTML = '';
        var host = el('div', 'uz-step-host uz-summary-host');
        var html = '';
        try { html = this.cfg.renderSummary(payload, this.answers, this.checked) || ''; }
        catch (e) { html = ''; }
        host.innerHTML = html;
        body.appendChild(host);

        this.dom.step.textContent = this.cfg.summaryLabel || 'Итоги';
        this.dom.fill.style.width = '100%';
        this.dom.foot.innerHTML = '';
        body.scrollTop = 0;

        if (typeof this.cfg.bindSummary === 'function') {
            try { this.cfg.bindSummary(host, payload, this); } catch (e) {}
        }
    };

    /* ---------------------------------------------------------------- modal */

    Session.prototype.open = function (skipRender) {
        injectStyles();
        if (this.dom) {
            this.dom.modal.hidden = false;
            if (!skipRender) this._renderStep();
            return;
        }

        var modal = el('div', 'uz-modal');
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');

        var sheet = el('div', 'uz-sheet');
        var head = el('div', 'uz-head');
        var step = el('span', 'uz-step');
        var prog = el('div', 'uz-progress');
        var fill = el('div', 'uz-progress-fill');
        prog.appendChild(fill);
        var close = el('button', 'uz-close', '&#10005;');
        close.type = 'button';
        close.setAttribute('aria-label', 'Закрыть');
        head.appendChild(step); head.appendChild(prog); head.appendChild(close);

        var body = el('div', 'uz-body');
        var foot = el('div', 'uz-foot');
        sheet.appendChild(head); sheet.appendChild(body); sheet.appendChild(foot);
        modal.appendChild(sheet);
        document.body.appendChild(modal);

        this.dom = { modal: modal, sheet: sheet, head: head, step: step, fill: fill, body: body, foot: foot };

        var self = this;
        close.addEventListener('click', function () { self.close(); });
        this._onKey = function (e) { if (e.key === 'Escape') self.close(); };
        document.addEventListener('keydown', this._onKey);

        document.body.style.overflow = 'hidden';
        if (!skipRender) this._renderStep();
    };

    Session.prototype.close = function () {
        this._save();
        if (!this.dom) return;
        this.dom.modal.hidden = true;
        document.body.style.overflow = '';
        if (typeof this.cfg.onClose === 'function') this.cfg.onClose(this);
    };

    /** Full teardown — used on topic switch so nothing survives into the next. */
    Session.prototype.destroy = function () {
        if (this._onKey) { document.removeEventListener('keydown', this._onKey); this._onKey = null; }
        if (this.dom && this.dom.modal && this.dom.modal.parentNode) {
            this.dom.modal.parentNode.removeChild(this.dom.modal);
        }
        this.dom = null;
        document.body.style.overflow = '';
    };

    Session.prototype.reset = function () {
        this.cursor = 0;
        this.answers = {};
        this.checked = {};
        this.finished = false;
        var d = this.cfg.draft;
        if (d && typeof d.clear === 'function') { try { d.clear(); } catch (e) {} }
    };

    /* ======================================================= public surface */

    var active = null;

    /**
     * A styled confirmation, never window.confirm(). Generic: the caller
     * supplies the text, so any course or any future flow can reuse it.
     */
    function askConfirm(text, onChoice) {
        injectStyles();
        var t = text || {};
        var lines = Array.isArray(t.body) ? t.body : DEFAULT_CONFIRM.body;

        var ask = el('div', 'uz-ask');
        var card = el('div', 'uz-ask-card uz-ask-warn');
        card.innerHTML =
            '<h3>' + esc(t.title || DEFAULT_CONFIRM.title) + '</h3>' +
            lines.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');

        var acts = el('div', 'uz-ask-actions');
        var no = el('button', 'uz-btn uz-btn-ghost', esc(t.cancel || DEFAULT_CONFIRM.cancel));
        var yes = el('button', 'uz-btn uz-btn-primary', esc(t.confirm || DEFAULT_CONFIRM.confirm));
        no.type = yes.type = 'button';
        no.setAttribute('data-uz-act', 'cancel');
        yes.setAttribute('data-uz-act', 'confirm');
        acts.appendChild(no); acts.appendChild(yes);
        card.appendChild(acts); ask.appendChild(card);
        document.body.appendChild(ask);

        var done = function (agreed) {
            if (ask.parentNode) ask.parentNode.removeChild(ask);
            document.removeEventListener('keydown', onKey);
            onChoice(agreed);
        };
        var onKey = function (e) { if (e.key === 'Escape') done(false); };
        document.addEventListener('keydown', onKey);
        no.addEventListener('click', function () { done(false); });
        yes.addEventListener('click', function () { done(true); });
        ask.addEventListener('click', function (e) { if (e.target === ask) done(false); });
    }

    function askResume(session, onChoice) {
        injectStyles();
        var ask = el('div', 'uz-ask');
        var card = el('div', 'uz-ask-card');
        card.innerHTML =
            '<h3>Вы не закончили прохождение</h3>' +
            '<p>Вы остановились на упражнении <b>' + (session.cursor + 1) +
            '</b> из <b>' + session.total() + '</b>. Продолжить с этого места или начать заново?</p>';
        var acts = el('div', 'uz-ask-actions');
        var cont = el('button', 'uz-btn uz-btn-primary', 'Продолжить');
        var again = el('button', 'uz-btn uz-btn-ghost', 'Начать заново');
        cont.type = again.type = 'button';
        acts.appendChild(cont); acts.appendChild(again);
        card.appendChild(acts); ask.appendChild(card);
        document.body.appendChild(ask);

        var done = function (choice) {
            if (ask.parentNode) ask.parentNode.removeChild(ask);
            onChoice(choice);
        };
        cont.addEventListener('click', function () { done('continue'); });
        again.addEventListener('click', function () { done('restart'); });
    }

    /**
     * Render the practice card and take ownership of this topic's session.
     *
     * Calling mount() again (a topic switch, a re-render) tears the previous
     * session down first, which is why repeated renders cannot leak modals,
     * listeners or DOM.
     */
    function mount(cfg) {
        if (!cfg || !cfg.mountEl || !Array.isArray(cfg.groups) || !cfg.groups.length) return null;
        injectStyles();
        if (active) active.destroy();

        var session = new Session(cfg);
        active = session;

        var stored = null;
        if (cfg.draft && typeof cfg.draft.load === 'function') {
            try { stored = cfg.draft.load(); } catch (e) { stored = null; }
        }
        if (stored) session.restore(stored);

        var solved = session.solvedCount();
        var totalSteps = session.total();
        var totalItems = itemCount(cfg.groups);
        var resumable = session.hasProgress();

        var card = el('div', 'uz-practice');
        card.innerHTML =
            '<div class="uz-practice-ico">&#128218;</div>' +
            '<h3>' + esc(cfg.title || 'Практика') + '</h3>' +
            '<p>' + esc(cfg.subtitle || 'Выполните упражнения урока.') + '</p>' +
            (resumable
                ? '<div class="uz-practice-bar"><div class="uz-practice-fill" style="width:' +
                  Math.round((solved / totalSteps) * 100) + '%"></div></div>'
                : '') +
            '<button type="button" class="uz-practice-btn">' +
            (resumable ? '&#9654; Продолжить' : '&#9654; Открыть задания') + '</button>' +
            '<div class="uz-practice-meta">' +
            (resumable
                ? ('Пройдено ' + solved + ' из ' + totalSteps + ' &middot; вы на упражнении ' + (session.cursor + 1))
                : (totalSteps + ' упражнений &middot; ' + totalItems + ' заданий')) +
            '</div>';

        cfg.mountEl.innerHTML = '';
        cfg.mountEl.appendChild(card);

        card.querySelector('.uz-practice-btn').addEventListener('click', function () {
            if (session.hasProgress()) {
                askResume(session, function (choice) {
                    if (choice === 'restart') session.reset();
                    session.open();
                });
            } else {
                session.open();
            }
        });

        return session;
    }

    global.UzExerciseSession = {
        mount: mount,
        current: function () { return active; },
        destroy: function () { if (active) { active.destroy(); active = null; } },
        _Session: Session,
        VERSION: STATE_VERSION
    };
})(typeof window !== 'undefined' ? window : this);
