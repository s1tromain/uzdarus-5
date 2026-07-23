(function () {
    'use strict';

    var lastTopicKey = null;

    /* ================================================================
       UTILITIES
       ================================================================ */

    function getCourseData() {
        try { if (typeof courseData !== 'undefined') return courseData; } catch (e) { /* ignore */ }
        return window.courseData || null;
    }

    function getCurrentTopicId() {
        try { if (typeof currentTopicId !== 'undefined' && Number.isFinite(currentTopicId)) return currentTopicId; } catch (e) { /* ignore */ }
        if (Number.isFinite(window.currentTopicId)) return window.currentTopicId;
        return null;
    }

    function getCurrentTopicObject() {
        try { if (typeof currentTopic !== 'undefined' && currentTopic) return currentTopic; } catch (e) { /* ignore */ }
        return window.currentTopic || null;
    }

    function getTopicById(topicId) {
        var data = getCourseData();
        if (!data || !Array.isArray(data.topics)) return null;
        return data.topics.find(function (t) { return t.id === topicId; }) || null;
    }

    function getActiveTopic() {
        var topicId = getCurrentTopicId();
        if (Number.isFinite(topicId)) return getTopicById(topicId);
        return getCurrentTopicObject() || null;
    }

    function getActiveTopicKey(topic) {
        var topicId = getCurrentTopicId();
        if (Number.isFinite(topicId)) return 'topic-' + String(topicId);
        if (topic && topic.id !== undefined && topic.id !== null) return 'topic-' + String(topic.id);
        return null;
    }

    /* ================================================================
       NORMALIZATION
       ================================================================ */

    function normalize(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/\u0451/g, '\u0435')
            .replace(/[.,!?;:()"'`\u00AB\u00BB<>\-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isCorrect(userValue, expected) {
        var nu = normalize(userValue);
        if (!nu) return false;
        if (Array.isArray(expected)) return expected.some(function (e) { return normalize(e) === nu; });
        return normalize(expected) === nu;
    }

    function expectedDisplay(expected) {
        if (Array.isArray(expected)) return expected.join(' / ');
        return String(expected || '');
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* ================================================================
       DOM HELPERS
       ================================================================ */

    function queryIn(scope, selector) {
        try { return scope ? scope.querySelector(selector) : document.querySelector(selector); }
        catch (e) { return null; }
    }

    function queryAllIn(scope, selector) {
        try { return Array.from(scope ? scope.querySelectorAll(selector) : document.querySelectorAll(selector)); }
        catch (e) { return []; }
    }

    /* An exercise whose answer element is NOT in the page was never presented to
       the learner on this screen — most often because the course renders it
       under a different DOM hook (A2 topics 1–3 use data-t2-* / data-t3-*
       while the generic collector queries data-topicN-eM). Reporting such an
       item as "(kiritilmagan)" invents an answer the learner never gave, drags
       the summary percentage down and — now that results are persisted — would
       store a fabricated review. So a missing element means "not on this
       screen": skip it entirely rather than score it wrong. Items that ARE on
       screen but left empty still count as incorrect, exactly as before (and
       the completeness gate blocks submitting them in the first place). */
    function isRendered(el) {
        return !!el;
    }

    /* Open-ended ("davomini yozing" / "to'liq javob yozing") items have no single
       right answer: they are flagged either with `free: true` or — as most B1
       topics do — with a blank answer key. This mirrors t1IsOpenAnswer() in
       b1-course.html EXACTLY, so the shared feedback screen agrees with the
       score the course itself computes. Without it, an item like
       { q: "Я думаю, что …", answer: [""] } is graded correct by B1 but shown
       as permanently wrong here (and would be persisted that way). */
    function isOpenAnswerItem(item) {
        if (item && item.free) return true;
        var a = item ? item.answer : null;
        if (a === null || a === undefined) return true;
        if (Array.isArray(a)) {
            return a.every(function (x) { return String(x === null || x === undefined ? '' : x).trim() === ''; });
        }
        return String(a).trim() === '';
    }

    function markInput(el, ok) {
        if (!el) return;
        el.classList.remove('correct', 'incorrect');
        el.classList.add(ok ? 'correct' : 'incorrect');
    }

    /* ================================================================
       RESULT BUILDER
       ================================================================ */

    function makeResult(label, question, userAnswer, correctAnswer, ok, explanation) {
        return {
            label: label || '',
            question: String(question || '').replace(/\u2026/g, '_____'),
            userAnswer: String(userAnswer || ''),
            correctAnswer: String(correctAnswer || ''),
            isCorrect: !!ok,
            explanation: String(explanation || '')
        };
    }

    /* Attach a RESTORE DESCRIPTOR to a result. It records HOW the answer was
       read from the DOM so the very same answer can be written back when the
       learner reopens an already-completed topic (see LESSON RESULT
       PERSISTENCE below). Purely additive \u2014 the descriptor is ignored by the
       renderer and by every existing consumer. */
    function withRef(result, ref) {
        if (result && ref) result.ref = ref;
        return result;
    }

    /* ================================================================
       EXPLANATION SYSTEM
       ================================================================ */

    var GRAMMAR_HINTS = {
        greeting:    "Salomlashish va muloqot qoidalariga ko'ra",
        number:      "Sonlar va raqamlar qoidasiga ko'ra",
        family:      "Oila a'zolari haqidagi qoidalarga ko'ra",
        possessive:  "Egalik olmoshi rodga (мужской/женский/средний) qarab tanlanadi",
        weather:     "Ob-havo va vaqt ifodalari qoidasiga ko'ra",
        profession:  "Kasblar va mashg'ulotlar mavzusi qoidasiga ko'ra",
        place:       "Joy va yo'nalish predloglari (в/на, куда/где) qoidasiga ko'ra",
        food:        "Ovqatlanish mavzusi, Vinitelnyy padej (tusham kelishik) ga ko'ra",
        clothing:    "Kiyim-kechak mavzusi, носить/надевать farqi qoidasiga ko'ra",
        transport:   "Transport va harakatlanish, predloglar qoidasiga ko'ra",
        verb:        "Fe'l shakllarini to'g'ri qo'llash qoidasiga ko'ra",
        'case':      "Kelishik (padej) qoidasiga ko'ra",
        preposition: "Predlog tanlash qoidasiga ko'ra",
        translation: "Tarjima aniqligiga ko'ra",
        correction:  "Grammatik xatolarni topish va to'g'rilash qoidasiga ko'ra",
        builder:     "So'zlarni to'g'ri tartibda joylashtirish qoidasiga ko'ra",
        matching:    "Juftlik mosligiga ko'ra",
        demonstrative: "Ko'rsatish olmoshi (этот/эта/это/эти) rodga qarab tanlanadi",
        aspect:      "Fe'l turi (NSV/SV) farqiga ko'ra",
        general:     "Mavzu qoidalariga ko'ra"
    };

    function detectContext(topicTitle, exTitle) {
        var tt = String(topicTitle || '').toLowerCase();
        var et = String(exTitle || '').toLowerCase();

        if (/tarjima/.test(et)) return 'translation';
        if (/xato.*top|to'g'rila|исправ/.test(et)) return 'correction';
        if (/mos.*juftlik|matching/.test(et)) return 'matching';
        if (/gap\s*tuz|word\s*order|tartib/.test(et)) return 'builder';
        if (/мой|моя|моё|мои|твой|egalik|olmosh/.test(et)) return 'possessive';
        if (/куда|где|predlog|предлог/.test(et)) return 'preposition';
        if (/vinitelnyy|tusham|В\.п|accusative/.test(et)) return 'case';
        if (/этот|эта|это|эти|ko'rsatish/.test(et)) return 'demonstrative';
        if (/носить|надевать/.test(et)) return 'clothing';
        if (/нсв|свершенн|несоверш|aspect/.test(et)) return 'aspect';

        if (/salomlash/.test(tt)) return 'greeting';
        if (/sonlar|raqam/.test(tt)) return 'number';
        if (/oila|qarindosh/.test(tt)) return 'family';
        if (/vaqt|ob-havo|погод/.test(tt)) return 'weather';
        if (/kasb|mashg'ulot|профессии/.test(tt)) return 'profession';
        if (/shahar|joy|город|место/.test(tt)) return 'place';
        if (/ovqat|taom|ресторан|еда|food/.test(tt)) return 'food';
        if (/kiyim|одежда|cloth/.test(tt)) return 'clothing';
        if (/transport|harakatlanish|транспорт/.test(tt)) return 'transport';
        if (/fe'l|глагол/.test(tt)) return 'verb';
        return 'general';
    }

    function generateExplanation(ok, userAnswer, correctAnswer, topicTitle, exTitle) {
        var ctx = detectContext(topicTitle, exTitle);
        var hint = GRAMMAR_HINTS[ctx] || GRAMMAR_HINTS.general;

        if (ok) {
            return "To'g'ri! " + hint + ", \u00AB" + correctAnswer + "\u00BB — to'g'ri javob.";
        }
        if (!userAnswer || userAnswer === '(tanlanmagan)' || userAnswer === '(kiritilmagan)' || userAnswer === "(yig'ilmagan)") {
            return "Javob kiritilmagan. " + hint + ", to'g'ri javob: \u00AB" + correctAnswer + "\u00BB.";
        }
        return hint + ", to'g'ri javob: \u00AB" + correctAnswer + "\u00BB.";
    }

    /* ================================================================
       EXERCISE TYPE DETECTION  (used by generic collector)
       ================================================================ */

    function detectExerciseType(exercise) {
        if (!exercise) return 'unknown';
        if (Array.isArray(exercise.items) && exercise.items.length > 0) {
            var f = exercise.items[0];
            if (f.words && (f.answers || f.answer)) return 'items-builder';
            if (f.template && f.answer && f.options) return 'items-select';
            if (f.options && f.answer !== undefined) return 'items-chips';
            if (f.word && f.answer) return 'items-transform';
            if (f.prompt || f.answer !== undefined || f.answers) return 'items-input';
        }
        if (exercise.sentences && exercise.answers) return 'sentences-input';
        if (exercise.prompts && exercise.answers) return 'prompts-input';
        if (exercise.questions && exercise.answers) return 'questions-input';
        return 'unknown';
    }

    /* ================================================================
       COLLECTORS — return arrays of result objects
       Each result: { label, question, userAnswer, correctAnswer, isCorrect, explanation }
       ================================================================ */

    /* ---- Main Quiz (MC + Blanks) for A1/A2/B1 ---- */

    function collectMainQuizResults(topic, scope) {
        var results = [];
        if (!topic || !topic.quiz) return results;
        var topicTitle = topic.title || '';

        if (Array.isArray(topic.quiz.mcQuestions) && Array.isArray(topic.quiz.mcAnswers)) {
            topic.quiz.mcQuestions.forEach(function (question, i) {
                var box = queryIn(scope, '.quiz-options[data-question="' + i + '"]');
                if (!isRendered(box)) return;
                var sel = queryIn(box, '.quiz-option.selected');
                var selIdx = sel ? parseInt(sel.getAttribute('data-option'), 10) : -1;
                var opts = (topic.quiz.mcOptions && topic.quiz.mcOptions[i]) || [];
                var raw = topic.quiz.mcAnswers[i];
                var cIdx = Number.isInteger(raw) ? raw : parseInt(raw, 10);
                var cText = opts[cIdx] || '(javob topilmadi)';
                var uText = selIdx >= 0 ? (opts[selIdx] || '(tanlanmagan)') : '(tanlanmagan)';
                var ok = selIdx === cIdx;
                results.push(withRef(makeResult(
                    'Test savol ' + (i + 1), question, uText, cText, ok,
                    generateExplanation(ok, uText, cText, topicTitle, 'Test')
                ), { k: 'mc', q: i, o: selIdx, c: cIdx }));
            });
        }

        if (Array.isArray(topic.quiz.blankQuestions) && Array.isArray(topic.quiz.blankAnswers)) {
            topic.quiz.blankQuestions.forEach(function (question, i) {
                var inp = queryIn(scope, 'input[data-blank="' + i + '"]');
                if (!isRendered(inp)) return;
                var uv = inp.value.trim();
                var exp = topic.quiz.blankAnswers[i];
                var ok = isCorrect(uv, exp);
                markInput(inp, ok);
                var ed = expectedDisplay(exp);
                results.push(withRef(makeResult(
                    "Bo'sh joy " + (i + 1), question, uv, ed, ok,
                    generateExplanation(ok, uv, ed, topicTitle, "Bo'sh joy to'ldirish")
                ), { k: 'input', s: 'input[data-blank="' + i + '"]', v: uv }));
            });
        }

        return results;
    }

    /* ---- B2 Quiz (MC via userAnswers global) ---- */

    function getB2UserAnswers() {
        try { if (typeof userAnswers !== 'undefined' && Array.isArray(userAnswers)) return userAnswers.slice(); } catch (e) { /* ignore */ }
        if (Array.isArray(window.userAnswers)) return window.userAnswers.slice();
        return [];
    }

    function collectB2QuizResults(topic) {
        var results = [];
        if (!topic || !topic.quiz || !Array.isArray(topic.quiz.mcQuestions) || !Array.isArray(topic.quiz.mcAnswers)) return results;
        var answers = getB2UserAnswers();
        var topicTitle = topic.title || '';

        topic.quiz.mcQuestions.forEach(function (question, i) {
            var selIdx = Number.isInteger(answers[i]) ? answers[i] : -1;
            var opts = (topic.quiz.mcOptions && topic.quiz.mcOptions[i]) || [];
            var raw = topic.quiz.mcAnswers[i];
            var cIdx = Number.isInteger(raw) ? raw : parseInt(raw, 10);
            var cText = opts[cIdx] || '(javob topilmadi)';
            var uText = selIdx >= 0 ? (opts[selIdx] || '(tanlanmagan)') : '(tanlanmagan)';
            var ok = selIdx === cIdx;
            results.push(makeResult(
                'Test savol ' + (i + 1), question, uText, cText, ok,
                generateExplanation(ok, uText, cText, topicTitle, 'Test')
            ));
        });
        return results;
    }

    /* ---- B2 Blanks (inline inputs) ---- */

    function collectB2BlankResults(topic, scope) {
        var results = [];
        if (!topic || !topic.quiz || !Array.isArray(topic.quiz.blankQuestions) || !Array.isArray(topic.quiz.blankAnswers)) return results;
        var topicTitle = topic.title || '';

        topic.quiz.blankQuestions.forEach(function (_, qi) {
            var expList = topic.quiz.blankAnswers[qi];
            var normList = Array.isArray(expList) ? expList : [expList];
            normList.forEach(function (exp, ii) {
                var sel = '.blank-input-inline[data-q-index="' + qi + '"][data-input-index="' + ii + '"]';
                var inp = queryIn(scope, sel);
                if (!isRendered(inp)) return;
                var uv = inp.value.trim();
                var ok = isCorrect(uv, exp);
                markInput(inp, ok);
                var ed = expectedDisplay(exp);
                results.push(withRef(makeResult(
                    'Yozma mashq ' + (qi + 1) + '.' + (ii + 1), '', uv, ed, ok,
                    generateExplanation(ok, uv, ed, topicTitle, "Bo'sh joy to'ldirish")
                ), { k: 'input', s: sel, v: uv }));
            });
        });
        return results;
    }

    /* ---- Extra Exercises (section-based) ---- */

    function collectExtraExercisesResults(topic, scope) {
        var results = [];
        if (!topic || !topic.extraExercises) return results;
        var topicTitle = topic.title || '';

        Object.keys(topic.extraExercises).forEach(function (sKey) {
            var sec = topic.extraExercises[sKey];
            if (!sec || !Array.isArray(sec.questions) || !Array.isArray(sec.answers)) return;
            var secTitle = sec.title || sKey;

            sec.questions.forEach(function (q, i) {
                var inpSel = 'input[data-section="' + sKey + '"][data-index="' + i + '"]';
                var inp = queryIn(scope, inpSel);
                if (!isRendered(inp)) return;
                var uv = inp.value.trim();
                var exp = sec.answers[i];
                var ok = isCorrect(uv, exp);
                markInput(inp, ok);
                var ed = expectedDisplay(exp);
                var qText = String(q || '').replace(/\u2026/g, '_____');
                results.push(withRef(makeResult(
                    secTitle + ' \u2014 ' + (i + 1), qText, uv, ed, ok,
                    generateExplanation(ok, uv, ed, topicTitle, secTitle)
                ), { k: 'input', s: inpSel, v: uv }));
            });
        });
        return results;
    }

    /* ---- Topic 1 Enhanced Exercises ---- */

    /* New B1 Topic 1 schema: topic1Exercises.exercises = [
         { id, title, type:'choice'|'input', items:[ { q, options?, answer } ] } ]
       DOM: choice rows -> [data-t1-row="<id>-<i>"] with .t1-opt.selected[data-value]
            input cells -> [data-t1-input="<id>-<i>"]                                */
    function collectTopic1ExercisesResults(topic, scope) {
        var results = [];
        var exObj = topic && (topic.topic1Exercises || topic.topic2Exercises || topic.topic3Exercises || topic.topic4Exercises || topic.topic5Exercises || topic.topic6Exercises || topic.topic7Exercises || topic.topic8Exercises || topic.topic9Exercises || topic.topic10Exercises || topic.topic11Exercises || topic.topic12Exercises || topic.topic13Exercises || topic.topic14Exercises || topic.topic15Exercises || topic.topic16Exercises || topic.topic17Exercises || topic.topic18Exercises || topic.topic19Exercises || topic.topic20Exercises);
        if (!exObj || !Array.isArray(exObj.exercises)) return results;
        var topicTitle = topic.title || '';

        exObj.exercises.forEach(function (ex) {
            if (!ex || !Array.isArray(ex.items)) return;
            var exTitle = ex.title || 'Mashq';
            ex.items.forEach(function (item, i) {
                var key = ex.id + '-' + i;
                var uv = '';
                var ref;
                if (ex.type === 'choice') {
                    var rowSel = '[data-t1-row="' + key + '"]';
                    var row = queryIn(scope, rowSel);
                    if (!isRendered(row)) return;
                    var sel = row.querySelector('.t1-opt.selected');
                    uv = sel ? (sel.getAttribute('data-value') || sel.textContent || '').trim() : '';
                    ref = { k: 't1choice', s: rowSel, v: uv, c: expectedDisplay(item.answer) };
                } else {
                    var inpSel = '[data-t1-input="' + key + '"]';
                    var inp = queryIn(scope, inpSel);
                    if (!isRendered(inp)) return;
                    uv = inp.value.trim();
                    markInput(inp, isOpenAnswerItem(item)
                        ? (uv.split(/\s+/).filter(Boolean).length >= 3)
                        : isCorrect(uv, item.answer));
                    ref = { k: 'input', s: inpSel, v: uv, x: '[data-t1-slot="' + key + '"]' };
                }
                var exp = item.answer;
                /* Free completion items: meaningful = non-empty + >= 3 words. */
                var open = isOpenAnswerItem(item);
                var ok = open
                    ? (uv.split(/\s+/).filter(Boolean).length >= 3)
                    : isCorrect(uv, exp);
                var ed = open ? 'Bemalol javob (kamida 3 soʻz)' : expectedDisplay(exp);
                results.push(withRef(makeResult(
                    exTitle + ' — ' + (i + 1),
                    item.q || item.prompt || '',
                    uv || (ex.type === 'choice' ? '(tanlanmagan)' : '(kiritilmagan)'),
                    ed, ok,
                    generateExplanation(ok, uv, ed, topicTitle, exTitle)
                ), ref));
            });
        });

        return results;
    }

    /* ---- Topic 4 Fill Exercise ---- */

    function collectTopic4Results(topic, scope) {
        var results = [];
        if (!topic || !topic.topic4FillExercise) return results;
        var topicTitle = topic.title || '';
        var exTitle = topic.topic4FillExercise.title || "Bo'sh joy to'ldirish";

        topic.topic4FillExercise.questions.forEach(function (prompt, i) {
            var inpSel = 'input[data-topic4-fill="' + i + '"]';
            var inp = queryIn(scope, inpSel);
            if (!isRendered(inp)) return;
            var uv = inp.value.trim();
            var exp = topic.topic4FillExercise.answers[i];
            var ok = isCorrect(uv, exp);
            markInput(inp, ok);
            var ed = expectedDisplay(exp);
            results.push(withRef(makeResult(
                exTitle + ' \u2014 ' + (i + 1), prompt, uv, ed, ok,
                generateExplanation(ok, uv, ed, topicTitle, exTitle)
            ), { k: 'input', s: inpSel, v: uv }));
        });
        return results;
    }

    /* ---- Topic 5 Exercises ---- */

    function collectTopic5Results(topic, scope) {
        var results = [];
        if (!topic || !topic.topic5Exercises) return results;
        var topicTitle = topic.title || '';

        var ex1 = topic.topic5Exercises.exercise1;
        if (ex1 && Array.isArray(ex1.questions)) {
            var ex1Title = ex1.title || '1-mashq';
            ex1.questions.forEach(function (q, i) {
                var blankSel = '.topic5-select-blank[data-topic5-select="' + i + '"]';
                var blank = queryIn(scope, blankSel);
                if (!isRendered(blank)) return;
                var uv = (blank.dataset.value || '').trim();
                var exp = q.answer;
                var ok = isCorrect(uv, exp);
                markInput(blank, ok);
                var ed = expectedDisplay(exp);
                results.push(withRef(makeResult(
                    ex1Title + ' \u2014 ' + (i + 1), q.text || '', uv || '(tanlanmagan)', ed, ok,
                    generateExplanation(ok, uv, ed, topicTitle, ex1Title)
                ), { k: 'dataval', s: blankSel, v: uv }));
            });
        }

        ['exercise2', 'exercise3', 'exercise4'].forEach(function (eKey) {
            var ex = topic.topic5Exercises[eKey];
            if (!ex || !Array.isArray(ex.prompts) || !Array.isArray(ex.answers)) return;
            var num = eKey.replace('exercise', '');
            var eTitle = ex.title || (num + '-mashq');
            ex.prompts.forEach(function (prompt, i) {
                var inpSel = 'input[data-topic5-e' + num + '="' + i + '"]';
                var inp = queryIn(scope, inpSel);
                if (!isRendered(inp)) return;
                var uv = inp.value.trim();
                var exp = ex.answers[i];
                var ok = isCorrect(uv, exp);
                markInput(inp, ok);
                var ed = expectedDisplay(exp);
                results.push(withRef(makeResult(
                    eTitle + ' \u2014 ' + (i + 1), prompt, uv, ed, ok,
                    generateExplanation(ok, uv, ed, topicTitle, eTitle)
                ), { k: 'input', s: inpSel, v: uv }));
            });
        });

        return results;
    }

    /* ---- Matching Game ---- */

    function getMatchingState() {
        try { if (typeof matchingStateA1 !== 'undefined' && matchingStateA1) return matchingStateA1; } catch (e) { /* ignore */ }
        try { if (typeof matchingState !== 'undefined' && matchingState) return matchingState; } catch (e) { /* ignore */ }
        return null;
    }

    function collectMatchingResults(topic) {
        var results = [];
        if (!topic || !topic.quiz || !topic.quiz.matchingGame || !Array.isArray(topic.quiz.matchingGame.pairs)) return results;
        var topicTitle = topic.title || '';
        var state = getMatchingState();
        var pairs = topic.quiz.matchingGame.pairs;
        var map = new Map();

        if (state && Array.isArray(state.matches)) {
            state.matches.forEach(function (m) {
                if (Number.isInteger(m.left) && Number.isInteger(m.right) && !map.has(m.left)) {
                    map.set(m.left, m.right);
                }
            });
        }

        pairs.forEach(function (pair, i) {
            var selRight = map.has(i) ? map.get(i) : null;
            var ok = selRight === i;
            var selPair = Number.isInteger(selRight) ? pairs[selRight] : null;
            var selText = selPair ? selPair.right : '(tanlanmagan)';
            var cText = pair.right;
            results.push(makeResult(
                'Juftlik ' + (i + 1), pair.left + ' \u2192 ...', selText, cText, ok,
                generateExplanation(ok, selText, cText, topicTitle, 'Juftlik topish')
            ));
        });
        return results;
    }

    /* ================================================================
       GENERIC TOPIC-N EXERCISES COLLECTOR (topics 6+)
       Handles: items-input, items-chips, items-transform,
                items-select, items-builder,
                prompts-input, sentences-input, questions-input
       ================================================================ */

    function collectItemsInput(exercise, scope, N, M, exTitle, topicTitle) {
        var results = [];
        var items = exercise.items || [];
        items.forEach(function (item, i) {
            var sel = 'input[data-topic' + N + '-e' + M + '="' + i + '"]';
            var inp = queryIn(scope, sel);
            if (!isRendered(inp)) return;
            var uv = inp.value.trim();
            var exp = item.answers || item.answer;
            var ok = isCorrect(uv, exp);
            markInput(inp, ok);
            var ed = expectedDisplay(exp);
            var qText = item.prompt || item.word || '';
            if (item.hint) qText += ' (' + item.hint + ')';
            results.push(withRef(makeResult(exTitle + ' \u2014 ' + (i + 1), qText, uv, ed, ok,
                generateExplanation(ok, uv, ed, topicTitle, exTitle)), { k: 'input', s: sel, v: uv }));
        });
        return results;
    }

    function collectItemsChips(exercise, scope, N, M, exTitle, topicTitle) {
        var results = [];
        var items = exercise.items || [];
        items.forEach(function (item, i) {
            var rowSel = '[data-topic' + N + '-e' + M + '-row="' + i + '"]';
            var row = queryIn(scope, rowSel);
            if (!isRendered(row)) return;
            var uv = '';
            if (row) {
                var selBtn = row.querySelector('.selected');
                uv = selBtn ? (selBtn.dataset.value || selBtn.textContent || '').trim() : '';
                if (!uv && row.dataset.value) uv = row.dataset.value.trim();
            }
            var exp = item.answer;
            var ok = isCorrect(uv, exp);
            var ed = expectedDisplay(exp);
            results.push(withRef(makeResult(exTitle + ' \u2014 ' + (i + 1), item.prompt || '', uv || '(tanlanmagan)', ed, ok,
                generateExplanation(ok, uv, ed, topicTitle, exTitle)), { k: 'chip', s: rowSel, v: uv }));
        });
        return results;
    }

    function collectItemsSelect(exercise, scope, N, M, exTitle, topicTitle) {
        var results = [];
        var items = exercise.items || [];
        items.forEach(function (item, i) {
            var selA = '[data-topic' + N + '-select="' + i + '"]';
            var selB = '[data-topic' + N + '-e' + M + '="' + i + '"]';
            var el = queryIn(scope, selA);
            var elSel = selA;
            if (!el) { el = queryIn(scope, selB); elSel = selB; }
            if (!isRendered(el)) return;
            var uv = (el.dataset.value || el.textContent || '').trim();
            var exp = item.answer;
            var ok = isCorrect(uv, exp);
            markInput(el, ok);
            var ed = expectedDisplay(exp);
            results.push(withRef(makeResult(exTitle + ' \u2014 ' + (i + 1), item.template || item.prompt || '', uv || '(tanlanmagan)', ed, ok,
                generateExplanation(ok, uv, ed, topicTitle, exTitle)), { k: 'dataval', s: elSel, v: uv }));
        });
        return results;
    }

    function collectItemsBuilder(exercise, scope, N, M, exTitle, topicTitle) {
        var results = [];
        var items = exercise.items || [];
        items.forEach(function (item, i) {
            var hiddenSel = 'input[data-topic' + N + '-builder-selected="' + i + '"]';
            var targetSel = '[data-topic' + N + '-builder-target="' + i + '"]';
            var hiddenInput = queryIn(scope, hiddenSel);
            var builderTarget = queryIn(scope, targetSel);
            if (!isRendered(hiddenInput) && !isRendered(builderTarget)) return;
            var uv = '';
            if (hiddenInput && hiddenInput.value) {
                uv = hiddenInput.value.split('|').map(function (w) { return w.trim(); }).filter(Boolean).join(' ');
            } else {
                var target = queryIn(scope, targetSel);
                if (target) {
                    var tokens = queryAllIn(target, 'button, [class*="token"]');
                    uv = tokens.length
                        ? tokens.map(function (t) { return t.textContent.trim(); }).join(' ')
                        : target.textContent.trim();
                }
            }
            var exp = item.answers || item.answer;
            var ok = isCorrect(uv, exp);
            var ed = expectedDisplay(exp);
            results.push(withRef(makeResult(exTitle + ' \u2014 ' + (i + 1), item.prompt || 'Gap tuzing', uv || "(yig'ilmagan)", ed, ok,
                generateExplanation(ok, uv, ed, topicTitle, exTitle)), { k: 'builder', s: hiddenSel, x: targetSel, v: uv }));
        });
        return results;
    }

    function collectArrayInput(exercise, scope, N, M, exTitle, topicTitle, type) {
        var results = [];
        var questions = type === 'prompts-input' ? exercise.prompts :
                        type === 'sentences-input' ? exercise.sentences : exercise.questions;
        var answers = exercise.answers || [];
        (questions || []).forEach(function (q, i) {
            var inpSel = 'input[data-topic' + N + '-e' + M + '="' + i + '"]';
            var inp = queryIn(scope, inpSel);
            if (!isRendered(inp)) return;
            var uv = inp.value.trim();
            var exp = answers[i];
            var ok = isCorrect(uv, exp);
            markInput(inp, ok);
            var ed = expectedDisplay(exp);
            results.push(withRef(makeResult(exTitle + ' \u2014 ' + (i + 1), String(q || ''), uv, ed, ok,
                generateExplanation(ok, uv, ed, topicTitle, exTitle)), { k: 'input', s: inpSel, v: uv }));
        });
        return results;
    }

    function collectSingleExercise(exercise, scope, N, M, exTitle, topicTitle) {
        var type = detectExerciseType(exercise);
        switch (type) {
            case 'items-transform':
            case 'items-input':    return collectItemsInput(exercise, scope, N, M, exTitle, topicTitle);
            case 'items-chips':    return collectItemsChips(exercise, scope, N, M, exTitle, topicTitle);
            case 'items-select':   return collectItemsSelect(exercise, scope, N, M, exTitle, topicTitle);
            case 'items-builder':  return collectItemsBuilder(exercise, scope, N, M, exTitle, topicTitle);
            case 'prompts-input':
            case 'sentences-input':
            case 'questions-input': return collectArrayInput(exercise, scope, N, M, exTitle, topicTitle, type);
            default: return [];
        }
    }

    function collectGenericTopicExercises(topic, scope) {
        var results = [];
        if (!topic) return results;
        var topicTitle = topic.title || '';

        Object.keys(topic).forEach(function (key) {
            var m = key.match(/^topic(\d+)Exercises$/);
            if (!m) return;
            var N = m[1];
            if (N === '5') return; // handled by dedicated collector
            if (N === '1') return; // handled by dedicated topic1 collector
            var exercises = topic[key];
            if (!exercises || typeof exercises !== 'object') return;

            Object.keys(exercises).forEach(function (eKey) {
                var em = eKey.match(/^exercise(\d+)$/);
                if (!em) return;
                var M = em[1];
                var exercise = exercises[eKey];
                if (!exercise || typeof exercise !== 'object') return;
                var eTitle = exercise.title || ('Mashq ' + M);
                results.push.apply(results, collectSingleExercise(exercise, scope, N, M, eTitle, topicTitle));
            });
        });

        return results;
    }

    /* ================================================================
       FEEDBACK RENDERER — detailed card-based output
       ================================================================ */

    /* Single source of truth for the Uzbek summary wording — shared by the live
       feedback render and by the restored (previously completed) render so a
       reopened topic reads EXACTLY like the screen the learner first saw. */
    function scoreMessage(pct) {
        if (pct >= 90) return "🎉 Ajoyib! Siz mavzuni mukammal o'zlashtirgansiz!";
        if (pct >= 70) return "👍 Yaxshi natija! Siz mavzuni yaxshi tushundingiz.";
        if (pct >= 50) return "📝 Qoniqarli. Ba'zi savollarni qayta ko'rib chiqing.";
        return "📚 Ko'proq mashq qiling. Mavzuni diqqat bilan o'qib chiqing.";
    }

    function renderDetailedFeedback(host, results, options) {
        var opts = options || {};
        var feedback = host ? queryIn(host, '.topic-feedback') : null;
        if (!feedback) return;

        var total = results.length;
        var correct = results.filter(function (r) { return r.isCorrect; }).length;

        if (!total) {
            feedback.innerHTML = '<div class="fb-empty">Tekshirish uchun mashqlar topilmadi.</div>';
            feedback.classList.remove('hidden');
            feedback.classList.add('show');
            return;
        }

        var pct = Math.round((correct / total) * 100);
        var msg = scoreMessage(pct);

        var html = '<div class="fb-summary">' +
            '<div class="fb-summary-score">' + correct + ' / ' + total + " to'g'ri (" + pct + '%)</div>' +
            '<div class="fb-summary-msg">' + escapeHtml(msg) + '</div>' +
            '</div><div class="fb-items">';

        results.forEach(function (r, i) {
            var cls = r.isCorrect ? 'fb-correct' : 'fb-incorrect';
            var badge = r.isCorrect
                ? "<span class=\"fb-badge fb-badge-ok\">\u2713 To'g'ri</span>"
                : "<span class=\"fb-badge fb-badge-bad\">\u2717 Noto'g'ri</span>";

            html += '<div class="fb-card ' + cls + '">';
            html += '<div class="fb-card-head">';
            html += '<span class="fb-card-num">' + (i + 1) + '</span>';
            html += badge;
            if (r.label) html += '<span class="fb-card-label">' + escapeHtml(r.label) + '</span>';
            html += '</div><div class="fb-card-body">';

            if (r.question) {
                html += '<div class="fb-card-q">' + escapeHtml(r.question) + '</div>';
            }

            html += '<div class="fb-card-field">' +
                "<span class=\"fb-card-lbl\">Sizning javobingiz:</span> " +
                '<span class="fb-card-uval">' + escapeHtml(r.userAnswer || '(kiritilmagan)') + '</span></div>';

            html += '<div class="fb-card-field">' +
                "<span class=\"fb-card-lbl\">To'g'ri javob:</span> " +
                '<strong class="fb-card-cval">' + escapeHtml(r.correctAnswer) + '</strong></div>';

            if (r.explanation) {
                html += '<div class="fb-card-expl">' + escapeHtml(r.explanation) + '</div>';
            }

            html += '</div></div>';
        });

        html += '</div>';
        feedback.innerHTML = html;
        feedback.classList.remove('hidden');
        feedback.classList.add('show');

        /* Display-only safety net for the legacy "Sizning natijangiz: 0/0" block.
           The native checkAnswers() derives its total from quiz.mcQuestions +
           quiz.blankQuestions only, so an exercise-only topic rendered a false
           "0/0". We only step in when the displayed DENOMINATOR is still 0:
           courses/topics that drive their own exercise-aware score (denominator
           > 0 — A1 topics 6–12 via __uzFinalizeExerciseTopic, B1 via
           checkTopicNExercises) keep their own score AND completion gate intact.
           This net just prevents a stray 0/0 from ever being the final state. */
        try {
            var scoreEl = document.getElementById('scoreDisplay');
            if (scoreEl) {
                var denomMatch = scoreEl.textContent.match(/\/\s*(\d+)/);
                var denom = denomMatch ? parseInt(denomMatch[1], 10) : 0;
                if (!denom && total > 0) {
                    scoreEl.textContent = 'Sizning natijangiz: ' + correct + '/' + total + ' (' + pct + '%)';
                    var msgEl = document.getElementById('resultsMessage');
                    if (msgEl) msgEl.innerHTML = escapeHtml(msg);
                }
            }
        } catch (e) { /* ignore — legacy score block is optional */ }

        if (opts.scroll === false) return;
        try { feedback.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* ignore */ }
    }

    /* ================================================================
       LESSON RESULT PERSISTENCE  (PAID COURSES ONLY)
       ----------------------------------------------------------------
       PROBLEM: "Javoblarni tekshirish" produced a full result screen
       (score + every answer + correct answer + feedback), but that screen
       lived only in the DOM. Reopening the topic re-rendered a blank
       lesson: `completedTopics` remembered THAT the topic was done, never
       HOW it was done. The per-topic quizResults doc only held the native
       quiz's mc/blank arrays (topics 1–5) or nothing at all (the
       exercise-only topics), and the shared feedback cards were never
       stored anywhere.

       FIX: after a graded check we persist ONE structured snapshot of the
       exact `results` array this file already builds — the same array the
       renderer consumes — into the EXISTING per-topic document
       users/{uid}/quizResults/topic_{topicId}, under the reserved
       `lessonResult` field. On reopen the snapshot is replayed through the
       SAME renderer, and each answer is written back into the DOM through
       the restore descriptor its collector recorded.

       Scope guard: paid A1/A2/B1/B2 course pages only. Demo pages load
       this same file and must NOT persist; vocabulary / pronunciation /
       final-exam pages have their own architecture and are untouched.
       ================================================================ */

    var SNAPSHOT_VERSION = 1;
    var MAX_SNAPSHOT_RESULTS = 400;   // hard cap — keeps the doc far below 1 MB
    var MAX_SNAPSHOT_TEXT = 400;      // per-field character cap
    var RESTORE_MIN_DELAY_MS = 800;   // let the page's own restore paths run first

    /* Returns 'A1' | 'A2' | 'B1' | 'B2' for a paid course page, else null.
       Pure + path-injectable so it is directly testable. */
    function detectPaidCourse(pathname) {
        var p = String(
            pathname !== undefined && pathname !== null
                ? pathname
                : ((window.location && window.location.pathname) || '')
        ).toLowerCase();
        if (p.indexOf('-demo') !== -1) return null;           // demo courses: never persist
        if (p.indexOf('/paid-courses/') === -1) return null;  // outside the paid area
        var m = p.match(/\/(a1|a2|b1|b2)-course\.html$/);     // excludes -vocabulary / -final-exam
        return m ? m[1].toUpperCase() : null;
    }

    function currentUserId() {
        if (window.currentUserId) return String(window.currentUserId);
        try {
            var raw = JSON.parse(localStorage.getItem('currentUser') || 'null');
            if (raw && (raw.id || raw.uid)) return String(raw.id || raw.uid);
        } catch (e) { /* ignore */ }
        return null;
    }

    function clip(value) {
        var s = String(value === null || value === undefined ? '' : value);
        return s.length > MAX_SNAPSHOT_TEXT ? s.slice(0, MAX_SNAPSHOT_TEXT) : s;
    }

    /* Build the persisted snapshot from a live results array. Counters are
       DERIVED, never trusted from elsewhere, so they can never disagree with
       the stored answers. */
    function buildSnapshot(course, topicId, results) {
        var list = [];
        (Array.isArray(results) ? results : []).slice(0, MAX_SNAPSHOT_RESULTS).forEach(function (r) {
            if (!r || typeof r !== 'object') return;
            var item = {
                label: clip(r.label),
                question: clip(r.question),
                userAnswer: clip(r.userAnswer),
                correctAnswer: clip(r.correctAnswer),
                isCorrect: r.isCorrect === true,
                explanation: clip(r.explanation)
            };
            if (r.ref && typeof r.ref === 'object') {
                var ref = { k: clip(r.ref.k) };
                if (r.ref.s) ref.s = clip(r.ref.s);
                if (r.ref.x) ref.x = clip(r.ref.x);
                if (r.ref.v !== undefined) ref.v = clip(r.ref.v);
                if (r.ref.c !== undefined) ref.c = typeof r.ref.c === 'number' ? r.ref.c : clip(r.ref.c);
                if (typeof r.ref.q === 'number') ref.q = r.ref.q;
                if (typeof r.ref.o === 'number') ref.o = r.ref.o;
                item.ref = ref;
            }
            list.push(item);
        });

        var total = list.length;
        var correct = list.filter(function (r) { return r.isCorrect; }).length;
        var percent = total ? Math.round((correct / total) * 100) : 0;

        return {
            v: SNAPSHOT_VERSION,
            course: course,
            topicId: topicId,
            completedAt: new Date().toISOString(),
            score: correct,
            correct: correct,
            incorrect: total - correct,
            total: total,
            percent: percent,
            /* STORAGE-ONLY flag. Used exclusively to stop a later FAILED retry
               from overwriting a stored PASSED result. It is NOT a completion
               rule and nothing reads it to unlock or complete anything — the
               course pages keep their own thresholds untouched. */
            passed: total > 0 && percent >= 60,
            message: scoreMessage(percent),
            results: list
        };
    }

    /* Defensive read: tolerate partial / malformed / foreign data without ever
       throwing, and recompute the counters from the answers actually present. */
    function sanitizeSnapshot(raw) {
        if (!raw || typeof raw !== 'object') return null;
        if (!Array.isArray(raw.results)) return null;

        var list = [];
        raw.results.forEach(function (r) {
            if (!r || typeof r !== 'object') return;
            list.push({
                label: String(r.label || ''),
                question: String(r.question || ''),
                userAnswer: String(r.userAnswer || ''),
                correctAnswer: String(r.correctAnswer || ''),
                isCorrect: r.isCorrect === true,
                explanation: String(r.explanation || ''),
                ref: (r.ref && typeof r.ref === 'object') ? r.ref : null
            });
        });
        if (!list.length) return null;   // nothing reconstructible -> treat as "no snapshot"

        var total = list.length;
        var correct = list.filter(function (r) { return r.isCorrect; }).length;
        var percent = total ? Math.round((correct / total) * 100) : 0;

        return {
            v: Number(raw.v) || 1,
            course: String(raw.course || ''),
            topicId: raw.topicId,
            completedAt: String(raw.completedAt || ''),
            score: correct,
            correct: correct,
            incorrect: total - correct,
            total: total,
            percent: percent,
            passed: raw.passed === true,
            message: raw.message ? String(raw.message) : scoreMessage(percent),
            results: list
        };
    }

    /* ---- storage: Firestore is the source of truth, localStorage is a mirror ---- */

    function localKey(uid, course, topicId) {
        return 'uz_lessonresult_' + (uid || 'guest') + '_' + course + '_' + topicId;
    }

    function readLocalSnapshot(uid, course, topicId) {
        try {
            var raw = localStorage.getItem(localKey(uid, course, topicId));
            return raw ? sanitizeSnapshot(JSON.parse(raw)) : null;
        } catch (e) { return null; }
    }

    function writeLocalSnapshot(uid, course, topicId, snapshot) {
        try { localStorage.setItem(localKey(uid, course, topicId), JSON.stringify(snapshot)); }
        catch (e) { /* quota / private mode — Firestore still holds the truth */ }
    }

    var snapshotCache = {};       // topicId -> snapshot | null   (per page load)
    var draftCache = {};          // topicId -> draft | null      (per page load)
    var persistInFlight = {};     // topicId -> true              (double-click guard)

    async function fetchRemoteSnapshot(uid, course, topicId) {
        try {
            if (typeof window.getTopicQuizResult === 'function') {
                var doc = await window.getTopicQuizResult(uid, topicId);
                return doc ? sanitizeSnapshot(doc.lessonResult) : null;
            }
            if (typeof window.getUserQuizResults === 'function') {
                var all = await window.getUserQuizResults(uid, course);
                var entry = all && all['topic_' + topicId];
                return entry ? sanitizeSnapshot(entry.lessonResult) : null;
            }
        } catch (e) {
            console.warn('lesson-result: remote read failed', e && e.message);
        }
        return null;
    }

    /* Account data wins; the localStorage mirror only fills in when the account
       copy is unreachable (offline / permission race), so the result still
       survives a refresh on the same device. */
    async function loadSnapshot(course, topicId) {
        if (Object.prototype.hasOwnProperty.call(snapshotCache, topicId)) {
            return snapshotCache[topicId];
        }
        var uid = currentUserId();
        var snapshot = uid ? await fetchRemoteSnapshot(uid, course, topicId) : null;
        if (!snapshot) snapshot = readLocalSnapshot(uid, course, topicId);
        snapshotCache[topicId] = snapshot;
        return snapshot;
    }

    /* Decide whether `next` may replace `previous`.
       - never replace a real snapshot with an empty/unusable one;
       - never let a FAILED retry erase a stored PASSED result (the spec: only a
         newly COMPLETED attempt becomes the shown result). */
    function shouldReplaceSnapshot(previous, next) {
        if (!next || !Array.isArray(next.results) || !next.results.length) return false;
        if (!previous) return true;
        if (previous.passed && !next.passed) return false;
        return true;
    }

    async function persistSnapshot(course, topicId, results) {
        if (!course || topicId === null || topicId === undefined) return null;
        if (!Array.isArray(results) || !results.length) return null;   // never store an empty result
        var key = String(topicId);
        if (persistInFlight[key]) return null;                          // double-click / re-entry guard
        persistInFlight[key] = true;

        try {
            var snapshot = buildSnapshot(course, topicId, results);
            var previous = await loadSnapshot(course, topicId);
            if (!shouldReplaceSnapshot(previous, snapshot)) return previous;

            var uid = currentUserId();
            /* Mirror synchronously FIRST so an immediate refresh or navigation
               cannot lose the attempt even if the network write is still in
               flight. */
            writeLocalSnapshot(uid, course, topicId, snapshot);
            snapshotCache[topicId] = snapshot;

            /* ONE merge write per completed lesson. `merge` keeps the native
               mc/blank arrays, the draft field and the course tag that already
               live in this document. A network failure leaves the previously
               stored snapshot untouched. */
            var writer = typeof window.saveLessonResult === 'function'
                ? function () { return window.saveLessonResult(uid, topicId, snapshot, course); }
                : (typeof window.saveQuizResult === 'function'
                    ? function () { return window.saveQuizResult(uid, topicId, { lessonResult: snapshot }, course); }
                    : null);
            if (uid && writer) {
                try { await writer(); }
                catch (e) { console.warn('lesson-result: save failed, kept local mirror', e && e.message); }
            }
            return snapshot;
        } catch (e) {
            console.warn('lesson-result: persist error', e && e.message);
            return null;
        } finally {
            delete persistInFlight[key];
        }
    }

    /* ---- restoration ---- */

    /* Write one stored answer back into the live DOM, reproducing the
       correct/incorrect visual state the learner originally saw. Every branch
       is defensive: a missing node is simply skipped (the feedback card for
       that answer is still rendered). */
    function applyRestoreRef(result, scope) {
        var ref = result && result.ref;
        if (!ref || !ref.k) return;
        var ok = result.isCorrect === true;
        try {
            switch (ref.k) {
                case 'input': {
                    var inp = queryIn(scope, ref.s);
                    if (!inp) return;
                    if (ref.v) inp.value = ref.v;
                    markInput(inp, ok);
                    if (ref.x) markInput(queryIn(scope, ref.x), ok);
                    return;
                }
                case 'dataval': {
                    var el = queryIn(scope, ref.s);
                    if (!el) return;
                    if (ref.v) {
                        try { el.dataset.value = ref.v; } catch (e) { /* ignore */ }
                        if (!el.children.length) el.textContent = ref.v;
                    }
                    markInput(el, ok);
                    return;
                }
                case 'mc': {
                    var box = queryIn(scope, '.quiz-options[data-question="' + ref.q + '"]');
                    if (!box) return;
                    queryAllIn(box, '.quiz-option').forEach(function (opt, idx) {
                        opt.classList.remove('selected', 'correct-answer', 'wrong-answer');
                        if (idx === ref.o) opt.classList.add('selected');
                        if (idx === ref.c) opt.classList.add('correct-answer');
                        if (idx === ref.o && idx !== ref.c) opt.classList.add('wrong-answer');
                    });
                    return;
                }
                case 't1choice': {
                    var row = queryIn(scope, ref.s);
                    if (!row) return;
                    queryAllIn(row, '.t1-opt').forEach(function (btn) {
                        btn.classList.remove('selected', 't1-ok', 't1-bad', 't1-reveal');
                        var value = (btn.getAttribute('data-value') || '').trim();
                        if (ref.c && normalize(value) === normalize(ref.c)) btn.classList.add('t1-reveal');
                        if (ref.v && normalize(value) === normalize(ref.v)) {
                            btn.classList.add('selected', ok ? 't1-ok' : 't1-bad');
                        }
                    });
                    return;
                }
                case 'chip': {
                    var chipRow = queryIn(scope, ref.s);
                    if (!chipRow || !ref.v) return;
                    queryAllIn(chipRow, 'button, .chip, [data-value]').forEach(function (btn) {
                        var value = (btn.dataset && btn.dataset.value) || btn.textContent || '';
                        if (normalize(value) === normalize(ref.v)) btn.classList.add('selected');
                    });
                    return;
                }
                case 'builder': {
                    var hidden = queryIn(scope, ref.s);
                    if (hidden && ref.v) hidden.value = ref.v.split(/\s+/).join('|');
                    var target = ref.x ? queryIn(scope, ref.x) : null;
                    if (target && ref.v && !target.children.length) target.textContent = ref.v;
                    if (target) markInput(target, ok);
                    return;
                }
                default:
                    return;
            }
        } catch (e) { /* one bad descriptor must never break the restore */ }
    }

    /* Re-populate the legacy results block (#scoreDisplay / #resultsMessage)
       ONLY when the page's own saved-result path has not already shown it —
       topics 1–5 of A1/A2/B1 restore that block natively from the quiz doc and
       must keep owning it. Buttons are deliberately left as the page left them:
       restoring a review must never surface a completion action. */
    function restoreScoreBlock(snapshot) {
        try {
            var section = document.getElementById('resultsSection');
            if (!section || section.classList.contains('show')) return;
            var scoreEl = document.getElementById('scoreDisplay');
            if (scoreEl) {
                scoreEl.textContent = 'Sizning natijangiz: ' + snapshot.correct + '/' +
                    snapshot.total + ' (' + snapshot.percent + '%)';
            }
            var msgEl = document.getElementById('resultsMessage');
            if (msgEl) msgEl.innerHTML = escapeHtml(snapshot.message || scoreMessage(snapshot.percent));
            var answersEl = document.getElementById('correctAnswers');
            if (answersEl) answersEl.innerHTML = '';   // the feedback cards are the detail view
            section.classList.add('show');
        } catch (e) { /* legacy block is optional */ }
    }

    /* Replay a stored attempt: the SAME renderer, the same cards, the same
       wording — it simply looks like the screen the learner already saw. */
    function restoreSnapshot(host, snapshot) {
        if (!host || !snapshot || !Array.isArray(snapshot.results) || !snapshot.results.length) return false;
        var feedback = queryIn(host, '.topic-feedback');
        if (!feedback) return false;

        renderDetailedFeedback(host, snapshot.results, { scroll: false });
        feedback.dataset.uzRestored = '1';

        var scope = getActiveTopicRoot() || document;
        snapshot.results.forEach(function (r) { applyRestoreRef(r, scope); });
        restoreScoreBlock(snapshot);
        return true;
    }

    /* ================================================================
       IN-PROGRESS DRAFT  (PAID COURSES ONLY)
       ----------------------------------------------------------------
       PROBLEM: each course page has its own draft autosave, but every one
       of them only reads the NATIVE quiz hooks:
           #quizSection .quiz-options      (multiple choice)
           #quizSection input[data-blank]  (fill-in-the-blank)
       Nothing else was ever captured — not the topicN exercise inputs, the
       t1 choice rows, extraExercises, topic4/topic5 fields, chips, selects
       or sentence builders. Worse, those per-page routines are wired inside
       loadQuiz(), which B1 skips entirely (it early-returns into
       renderTopic1Exercises) and which A1 bypasses for topics 6-12. Net
       effect measured during the audit: B1 saved NOTHING for all 20 topics,
       A1 saved nothing for topics 6-12, and every course lost the exercise
       blocks of its remaining topics. A student answering 60 exercises and
       clicking another topic lost all of it, silently.

       FIX: one generic, course-agnostic draft that lives beside the result
       snapshot. It identifies each answer field by its own data-* attributes
       — which the courses derive from courseData indices and therefore keep
       stable across re-renders — so it works for every exercise type,
       including the bespoke A2 hooks, WITHOUT hardcoding attribute names.

       A draft stores ONLY raw answers: never a score, never correctness.
       That is what keeps state 2 (in-progress) distinguishable from state 3
       (graded) — see the state model in the audit report.
       ================================================================ */

    var DRAFT_DEBOUNCE_MS = 900;
    var MAX_DRAFT_FIELDS = 500;

    /* Stable identity for an answer element: its own data-* attributes, minus
       data-value (which holds the ANSWER, not the identity). */
    function draftKeyFor(el) {
        if (!el || !el.attributes) return null;
        var parts = [];
        for (var i = 0; i < el.attributes.length; i++) {
            var a = el.attributes[i];
            if (a.name.indexOf('data-') !== 0) continue;
            if (a.name === 'data-value' || a.name === 'data-option') continue;
            parts.push(a.name + '=' + a.value);
        }
        if (!parts.length) return null;
        return parts.sort().join('&');
    }

    function selectorFromDraftKey(key) {
        return String(key).split('&').map(function (pair) {
            var idx = pair.indexOf('=');
            if (idx === -1) return '';
            return '[' + pair.slice(0, idx) + '="' + pair.slice(idx + 1).replace(/"/g, '\\"') + '"]';
        }).join('');
    }

    /* Snapshot every answer the learner has entered in `scope`. Values only. */
    function captureDraft(scope) {
        var root = scope || getActiveTopicRoot() || document;
        var fields = {};
        var count = 0;
        var add = function (key, entry) {
            if (!key || count >= MAX_DRAFT_FIELDS) return;
            if (!Object.prototype.hasOwnProperty.call(fields, key)) count++;
            fields[key] = entry;
        };

        /* (1) typed answers — every data-* bearing input/textarea */
        queryAllIn(root, 'input, textarea').forEach(function (el) {
            if (el.type === 'checkbox' || el.type === 'radio') return;
            var v = el.value;
            if (v === undefined || v === null || String(v).trim() === '') return;
            add(draftKeyFor(el), { t: 'v', v: clip(v) });
        });

        /* (2) chosen options — a `.selected` child identifies its container */
        queryAllIn(root, '.selected').forEach(function (sel) {
            var host = sel.parentElement;
            if (!host) return;
            var key = draftKeyFor(host);
            if (!key) return;
            var v = sel.getAttribute('data-value');
            if (v === null) v = sel.getAttribute('data-option');
            if (v === null) v = (sel.textContent || '').trim();
            add(key, { t: 's', v: clip(v) });
        });

        /* (3) widgets that keep their answer in data-value (topic5 blanks,
               topicN selects) rather than in an input */
        queryAllIn(root, '[data-value]').forEach(function (el) {
            if (el.classList && el.classList.contains('selected')) return;
            var v = el.getAttribute('data-value');
            if (!v || !String(v).trim()) return;
            add(draftKeyFor(el), { t: 'd', v: clip(v) });
        });

        return { v: 1, savedAt: Date.now(), fields: fields };
    }

    function draftIsEmpty(draft) {
        return !draft || !draft.fields || !Object.keys(draft.fields).length;
    }

    /* Write a stored draft back into the DOM. Values only — no grading
       classes are ever applied, so a restored draft can never look graded. */
    function applyDraft(scope, draft) {
        if (draftIsEmpty(draft)) return false;
        var root = scope || getActiveTopicRoot() || document;
        var applied = 0;
        Object.keys(draft.fields).forEach(function (key) {
            var entry = draft.fields[key];
            if (!entry || entry.v === undefined) return;
            var el;
            try { el = queryIn(root, selectorFromDraftKey(key)); } catch (e) { el = null; }
            if (!el) return;                     // content changed since the draft
            try {
                if (entry.t === 'v') {
                    el.value = entry.v;
                    applied++;
                } else if (entry.t === 'd') {
                    el.dataset.value = entry.v;
                    if (!el.children.length) el.textContent = entry.v;
                    applied++;
                } else if (entry.t === 's') {
                    var children = queryAllIn(el, '*');
                    var match = null;
                    children.forEach(function (c) {
                        if (match) return;
                        var cv = c.getAttribute('data-value');
                        if (cv === null) cv = c.getAttribute('data-option');
                        if (cv === null) cv = (c.textContent || '').trim();
                        if (String(cv) === String(entry.v)) match = c;
                    });
                    if (match) {
                        children.forEach(function (c) { c.classList.remove('selected'); });
                        match.classList.add('selected');
                        applied++;
                    }
                }
            } catch (e) { /* one bad field must never break the restore */ }
        });
        return applied > 0;
    }

    function draftLocalKey(uid, course, topicId) {
        return 'uz_lessondraft_' + (uid || 'guest') + '_' + course + '_' + topicId;
    }

    function sanitizeDraft(raw) {
        if (!raw || typeof raw !== 'object' || !raw.fields || typeof raw.fields !== 'object') return null;
        var fields = {};
        var n = 0;
        Object.keys(raw.fields).forEach(function (k) {
            if (n >= MAX_DRAFT_FIELDS) return;
            var e = raw.fields[k];
            if (!e || typeof e !== 'object' || e.v === undefined) return;
            fields[k] = { t: String(e.t || 'v'), v: String(e.v) };
            n++;
        });
        if (!n) return null;
        return { v: 1, savedAt: Number(raw.savedAt) || 0, fields: fields };
    }

    var draftSaveTimer = 0;
    var draftSeq = 0;                 // monotonic guard against out-of-order writes
    var draftLastApplied = 0;

    /* Persist the current draft for `topicId`. Local mirror is written
       synchronously so navigating away can never lose the attempt; the account
       write is the source of truth. Fails soft — never throws at the caller. */
    async function persistDraft(topicId) {
        if (!activeCourse || topicId === null || topicId === undefined) return null;
        var draft = captureDraft(getActiveTopicRoot() || document);
        if (draftIsEmpty(draft)) return null;

        var seq = ++draftSeq;
        var uid = currentUserId();
        try { localStorage.setItem(draftLocalKey(uid, activeCourse, topicId), JSON.stringify(draft)); }
        catch (e) { /* quota / private mode */ }

        if (!uid) return draft;                  // signed-out: local mirror only
        try {
            if (typeof window.saveLessonDraft === 'function') {
                await window.saveLessonDraft(uid, topicId, draft, activeCourse);
            } else if (typeof window.saveQuizResult === 'function') {
                await window.saveQuizResult(uid, topicId, { lessonDraft: draft }, activeCourse);
            }
        } catch (e) {
            console.warn('lesson-draft: save failed, kept local mirror', e && e.message);
            return draft;
        }
        /* An older in-flight write that lands after a newer one would roll the
           learner back; re-issue the newest state if that happened. */
        if (seq !== draftSeq) return draft;
        return draft;
    }

    function scheduleDraftSave(topicId) {
        if (!activeCourse) return;
        clearTimeout(draftSaveTimer);
        draftSaveTimer = setTimeout(function () {
            persistDraft(topicId).catch(function () { /* fail soft */ });
        }, DRAFT_DEBOUNCE_MS);
    }

    /* Drop the draft once the attempt has actually been graded — from that
       point the stored RESULT is what a reopen must show. */
    function clearDraft(topicId) {
        if (!activeCourse || topicId === null || topicId === undefined) return;
        clearTimeout(draftSaveTimer);
        draftSeq++;
        var uid = currentUserId();
        try { localStorage.removeItem(draftLocalKey(uid, activeCourse, topicId)); } catch (e) { /* ignore */ }
        if (!uid) return;
        try {
            if (typeof window.saveLessonDraft === 'function') {
                window.saveLessonDraft(uid, topicId, null, activeCourse);
            } else if (typeof window.saveQuizResult === 'function') {
                window.saveQuizResult(uid, topicId, { lessonDraft: null }, activeCourse);
            }
        } catch (e) { /* ignore */ }
    }

    async function loadDraft(course, topicId) {
        var uid = currentUserId();
        var remote = null;
        if (uid) {
            try {
                if (typeof window.getTopicQuizResult === 'function') {
                    var d = await window.getTopicQuizResult(uid, topicId);
                    remote = d ? sanitizeDraft(d.lessonDraft) : null;
                }
            } catch (e) { remote = null; }
        }
        var local = null;
        try {
            var raw = localStorage.getItem(draftLocalKey(uid, course, topicId));
            local = raw ? sanitizeDraft(JSON.parse(raw)) : null;
        } catch (e) { local = null; }

        /* Deterministic conflict rule: the NEWER draft wins by savedAt. The
           account copy is authoritative on ties, so a second device cannot be
           rolled back by a stale local mirror. */
        if (remote && local) return (local.savedAt > remote.savedAt) ? local : remote;
        return remote || local;
    }

    /* Delegated autosave. One listener pair for the whole page: works for
       markup the courses inject later, which per-page listeners bound inside
       loadQuiz() could never see. */
    function startDraftAutosave() {
        if (!activeCourse) return;
        var onEdit = function (e) {
            var t = e.target;
            if (!t || !t.closest) return;
            if (t.closest('.topic-check-section, .check-topic-btn, #retryBtn, .retry-btn')) return;
            var root = getActiveTopicRoot();
            if (!root || !root.contains(t)) return;
            var id = getCurrentTopicId();
            var topic = getActiveTopic();
            if (!Number.isFinite(id) && topic && topic.id !== undefined) id = topic.id;
            if (id === null || id === undefined) return;
            scheduleDraftSave(id);
        };
        document.addEventListener('input', onEdit, true);
        document.addEventListener('change', onEdit, true);
        document.addEventListener('click', onEdit, true);

        /* Flush on the ways a learner actually leaves a page. */
        var flush = function () {
            if (!draftSaveTimer) return;
            clearTimeout(draftSaveTimer);
            draftSaveTimer = 0;
            var id = getCurrentTopicId();
            var topic = getActiveTopic();
            if (!Number.isFinite(id) && topic && topic.id !== undefined) id = topic.id;
            if (id === null || id === undefined) return;
            persistDraft(id).catch(function () { /* fail soft */ });
        };
        window.addEventListener('pagehide', flush);
        window.addEventListener('beforeunload', flush);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') flush();
        });
    }

    /* ---- lifecycle glue ---- */

    var activeCourse = detectPaidCourse();
    var restoreState = { topicId: null, since: 0, loading: false, suppressed: false };

    /* A fresh attempt (a new check) or an explicit retry owns the screen from
       that point on — never paint a stored result over it. */
    function suppressRestore(topicId) {
        if (topicId !== undefined && topicId !== null) restoreState.topicId = topicId;
        restoreState.since = Date.now();
        restoreState.suppressed = true;
    }

    function noteTopicChanged(topicId) {
        /* Leaving a topic must not lose what was typed in it. */
        if (restoreState.topicId !== null && restoreState.topicId !== undefined && draftSaveTimer) {
            var leaving = restoreState.topicId;
            clearTimeout(draftSaveTimer);
            draftSaveTimer = 0;
            persistDraft(leaving).catch(function () { /* fail soft */ });
        }
        restoreState = { topicId: topicId, since: Date.now(), loading: false, suppressed: false };
        draftLastApplied = 0;
    }

    /* Decide what a reopened topic should show.
       A stored RESULT wins, except when the learner started a new attempt
       afterwards (retry): a draft saved AFTER the result means the newer,
       in-progress attempt is the truth. */
    function pickRestoreTarget(snapshot, draft) {
        if (draftIsEmpty(draft)) return snapshot ? { kind: 'result', data: snapshot } : null;
        if (!snapshot) return { kind: 'draft', data: draft };
        var resultAt = Date.parse(snapshot.completedAt || '') || 0;
        return (draft.savedAt > resultAt)
            ? { kind: 'draft', data: draft }
            : { kind: 'result', data: snapshot };
    }

    function maybeRestoreSavedResult(host, topicId) {
        if (!activeCourse || !host) return;
        if (topicId === null || topicId === undefined) return;
        if (restoreState.topicId !== topicId) noteTopicChanged(topicId);
        if (restoreState.suppressed) return;
        if (Date.now() - restoreState.since < RESTORE_MIN_DELAY_MS) return;

        var feedback = queryIn(host, '.topic-feedback');
        if (!feedback || feedback.innerHTML) return;   // live or already-restored feedback wins

        if (!Object.prototype.hasOwnProperty.call(snapshotCache, topicId)) {
            if (restoreState.loading) return;
            restoreState.loading = true;
            var requestedTopic = topicId;              // identity captured per request
            Promise.all([
                loadSnapshot(activeCourse, requestedTopic),
                loadDraft(activeCourse, requestedTopic)
            ]).then(function (pair) {
                /* INVARIANT 6 — never apply a response to a topic the learner
                   has already navigated away from. */
                if (restoreState.topicId !== requestedTopic) return;
                draftCache[requestedTopic] = pair[1] || null;
            }).catch(function () {
                snapshotCache[requestedTopic] = null;
                draftCache[requestedTopic] = null;
            }).then(function () { restoreState.loading = false; });
            return;
        }

        var target = pickRestoreTarget(snapshotCache[topicId], draftCache[topicId]);
        if (!target) return;                           // untouched, or an old topic with no data

        if (target.kind === 'result') {
            restoreSnapshot(host, target.data);
            return;
        }
        /* DRAFT: values only. No score, no feedback, no completion state. */
        if (draftLastApplied === topicId) return;
        if (applyDraft(getActiveTopicRoot() || document, target.data)) {
            draftLastApplied = topicId;
        }
    }

    /* The retry button intentionally starts a NEW attempt — drop the restored
       screen from the DOM, but never touch the stored snapshot: it is replaced
       only once a new attempt has actually been graded. */
    document.addEventListener('click', function (e) {
        var btn = (e.target && e.target.closest) ? e.target.closest('#retryBtn, .retry-btn') : null;
        if (!btn) return;
        suppressRestore();
        draftLastApplied = 0;
        queryAllIn(document, '.topic-feedback').forEach(function (node) {
            node.innerHTML = '';
            node.classList.remove('show');
            node.classList.add('hidden');
            delete node.dataset.uzRestored;
        });
    }, true);

    /* Test/debug surface — pure helpers only, no side effects on import. */
    window.__uzLessonResults = {
        detectPaidCourse: detectPaidCourse,
        buildSnapshot: buildSnapshot,
        sanitizeSnapshot: sanitizeSnapshot,
        shouldReplaceSnapshot: shouldReplaceSnapshot,
        persistSnapshot: persistSnapshot,
        loadSnapshot: loadSnapshot,
        restoreSnapshot: restoreSnapshot,
        applyRestoreRef: applyRestoreRef,
        scoreMessage: scoreMessage,
        renderDetailedFeedback: renderDetailedFeedback,
        captureDraft: captureDraft,
        applyDraft: applyDraft,
        sanitizeDraft: sanitizeDraft,
        persistDraft: persistDraft,
        loadDraft: loadDraft,
        clearDraft: clearDraft,
        pickRestoreTarget: pickRestoreTarget,
        draftKeyFor: draftKeyFor,
        _cache: snapshotCache,
        _draftCache: draftCache,
        _resetForTests: function (course) {
            activeCourse = course === undefined ? detectPaidCourse() : course;
            Object.keys(snapshotCache).forEach(function (k) { delete snapshotCache[k]; });
            Object.keys(draftCache).forEach(function (k) { delete draftCache[k]; });
            restoreState = { topicId: null, since: 0, loading: false, suppressed: false };
            draftLastApplied = 0;
            clearTimeout(draftSaveTimer);
            draftSaveTimer = 0;
        }
    };

    /* ================================================================
       TOPIC CHECK ORCHESTRATOR
       ================================================================ */

    async function runTopicCheck(event) {
        var button = event.currentTarget;
        var host = button ? button.closest('.topic-check-section, .topic-check-host') : null;
        var topicRoot = host ? host.closest('.topic-exercises') : getActiveTopicRoot();
        var results = [];
        var topicId = getCurrentTopicId();
        var topic = getActiveTopic();

        if (typeof window.checkAnswers === 'function' && Number.isFinite(topicId)) {
            /* === A1 / A2 / B1 flow === */
            await window.checkAnswers(topicId);

            if (topic && topic.extraExercises && typeof window.checkExtraExercises === 'function') {
                await window.checkExtraExercises(topicId);
            }
            if (topic && topic.topic1Exercises && typeof window.checkTopic1Exercises === 'function') {
                await window.checkTopic1Exercises(topicId);
            }
            if (topic && topic.topic2Exercises && typeof window.checkTopic2Exercises === 'function') {
                await window.checkTopic2Exercises(topicId);
            }
            if (topic && topic.topic3Exercises && typeof window.checkTopic3Exercises === 'function') {
                await window.checkTopic3Exercises(topicId);
            }
            if (topic && topic.topic4Exercises && typeof window.checkTopic4Exercises === 'function') {
                await window.checkTopic4Exercises(topicId);
            }
            if (topic && topic.topic4FillExercise && typeof window.checkTopic4FillExercise === 'function') {
                await window.checkTopic4FillExercise(topicId);
            }
            if (topic && topic.topic5Exercises && typeof window.checkTopic5Exercises === 'function') {
                await window.checkTopic5Exercises(topicId);
            }

            /* Dynamic call for topic 6+ check functions (already covered for
               topic 6 by the static checkTopic6Exercises hook in the course
               file, but kept for generic forward-compat with topics 7+). */
            for (var n = 6; n <= 30; n++) {
                var exKey = 'topic' + n + 'Exercises';
                var fnName = 'checkTopic' + n + 'Exercises';
                if (topic && topic[exKey] && typeof window[fnName] === 'function') {
                    try { await window[fnName](topicId); } catch (e) { /* ignore */ }
                }
            }

            if (topic && topic.quiz && topic.quiz.matchingGame) {
                if (typeof window.checkMatchingA1 === 'function') window.checkMatchingA1();
                else if (typeof window.checkMatchingGame === 'function') window.checkMatchingGame(topicId);
                else if (typeof window.checkMatching === 'function') window.checkMatching();
            }

            results.push.apply(results, collectMainQuizResults(topic, topicRoot));
            results.push.apply(results, collectTopic1ExercisesResults(topic, topicRoot));
            results.push.apply(results, collectExtraExercisesResults(topic, topicRoot));
            results.push.apply(results, collectTopic4Results(topic, topicRoot));
            results.push.apply(results, collectTopic5Results(topic, topicRoot));
            results.push.apply(results, collectGenericTopicExercises(topic, topicRoot));
            results.push.apply(results, collectMatchingResults(topic));
        } else {
            /* === B2 flow === */
            if (typeof window.submitQuiz === 'function') window.submitQuiz();
            if (typeof window.checkBlankAnswers === 'function') window.checkBlankAnswers();
            if (typeof window.checkMatching === 'function') window.checkMatching();

            var b2Topic = getActiveTopic();
            results.push.apply(results, collectB2QuizResults(b2Topic));
            results.push.apply(results, collectB2BlankResults(b2Topic, topicRoot));
            results.push.apply(results, collectMatchingResults(b2Topic));
        }

        renderDetailedFeedback(host, results);

        /* PAID COURSES ONLY — persist this graded attempt so reopening the topic
           can reproduce this exact screen. Fire-and-forget: persistence must
           never delay or break the feedback the learner is already looking at,
           and completion/validation above is untouched. */
        if (activeCourse) {
            var persistTopicId = Number.isFinite(topicId)
                ? topicId
                : (topic && topic.id !== undefined ? topic.id : null);
            suppressRestore(persistTopicId);
            if (persistTopicId !== null && persistTopicId !== undefined) {
                /* The attempt is graded: the RESULT is now what a reopen shows,
                   so the in-progress draft for this topic is retired. */
                clearDraft(persistTopicId);
                draftCache[persistTopicId] = null;
                persistSnapshot(activeCourse, persistTopicId, results).catch(function () { /* fail soft */ });
            }
        }
    }

    /* ================================================================
       UI MANAGEMENT — button injection / anti-duplicate / scoping
       ================================================================ */

    function bindTopicCheckButton(host) {
        var button = queryIn(host, '.check-topic-btn');
        if (!button) return;
        if (!button.dataset.globalFeedbackBound) {
            button.onclick = null; // remove any legacy onclick (e.g. checkTopic6Exercises)
            button.addEventListener('click', runTopicCheck);
            button.dataset.globalFeedbackBound = '1';
        }
    }

    function removeLegacyGlobalControls() {
        ['#globalCheckHost', '#checkAllAnswersBtn', '#globalFeedback'].forEach(function (sel) {
            queryAllIn(document, sel).forEach(function (n) { n.remove(); });
        });
    }

    function getActiveTopicRoot() {
        var quizSection = document.getElementById('quizSection');
        var root = quizSection ? (quizSection.parentElement || quizSection) : null;
        var exerciseSelectors = '.quiz-container, .quiz-question, .fill-blank, .exercise-block, ' +
            '.matching-game-container, #extraExercises, #topic4FillExercise, #topic5PracticeSection, .blank-section';

        if (root && root.querySelector(exerciseSelectors)) return root;

        var lessonContent = document.getElementById('lessonContent');
        if (lessonContent && lessonContent.querySelector(
            '.quiz-section, .blank-section, .matching-game-container, .quiz-question, ' +
            '.exercise-block, #extraExercises, #topic4FillExercise, #topic5PracticeSection'
        )) return lessonContent;

        return null;
    }

    function clearFeedbackNode(node) {
        if (!node) return;
        node.innerHTML = '';
        node.classList.remove('show');
        node.classList.add('hidden');
    }

    function clearAllTopicFeedback() {
        queryAllIn(document, '.topic-feedback').forEach(clearFeedbackNode);
    }

    function createTopicHost(topicKey) {
        var host = document.createElement('div');
        host.className = 'topic-check-section';
        host.dataset.topicId = topicKey;
        host.innerHTML =
            '<button class="check-topic-btn" type="button">Javoblarni tekshirish</button>' +
            '<div class="topic-feedback hidden"></div>';
        bindTopicCheckButton(host);
        return host;
    }

    function ensureSingleTopicControls() {
        removeLegacyGlobalControls();

        var topic = getActiveTopic();
        var topicKey = getActiveTopicKey(topic);
        var root = getActiveTopicRoot();

        if (!root || !topicKey) {
            queryAllIn(document, '.topic-check-section, .topic-check-host').forEach(function (n) { n.remove(); });
            return;
        }

        root.classList.add('topic-exercises');
        root.setAttribute('data-topic-id', topicKey);

        if (lastTopicKey !== topicKey) {
            clearAllTopicFeedback();
            lastTopicKey = topicKey;
        }

        var sections = queryAllIn(root, '.topic-check-section, .topic-check-host');
        var host = sections.length ? sections[0] : null;

        if (sections.length > 1) {
            sections.slice(1).forEach(function (n) { if (n !== host) n.remove(); });
        }

        if (!host) {
            host = createTopicHost(topicKey);
        } else {
            host.classList.remove('topic-check-host');
            host.classList.add('topic-check-section');
            if (!queryIn(host, '.check-topic-btn') || !queryIn(host, '.topic-feedback')) {
                host.innerHTML =
                    '<button class="check-topic-btn" type="button">Javoblarni tekshirish</button>' +
                    '<div class="topic-feedback hidden"></div>';
            }
            bindTopicCheckButton(host);
        }

        host.dataset.topicId = topicKey;
        if (root.lastElementChild !== host) root.appendChild(host);

        queryAllIn(document, '.topic-check-section, .topic-check-host').forEach(function (n) {
            if (!root.contains(n)) n.remove();
        });

        /* Paid courses: if this topic already has a stored completed attempt and
           nothing has been graded in this session, replay it. No-op everywhere
           else (demo pages, vocabulary, guests, topics without a snapshot). */
        var currentId = getCurrentTopicId();
        if (!Number.isFinite(currentId) && topic && topic.id !== undefined) currentId = topic.id;
        maybeRestoreSavedResult(host, currentId);
    }

    function startTopicObserver() {
        startDraftAutosave();
        ensureSingleTopicControls();
        var observer = new MutationObserver(function () { ensureSingleTopicControls(); });
        if (document.body) observer.observe(document.body, { childList: true, subtree: true });
        setInterval(ensureSingleTopicControls, 650);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startTopicObserver);
    } else {
        startTopicObserver();
    }
})();

/* ====================================================================
   GLOBAL VALIDATION COMPLETENESS GATE  (Phase 2 — platform-wide)
   --------------------------------------------------------------------
   Blocks the "Javoblarni tekshirish" button whenever ANY answer field
   in the active topic is left empty. Runs on the document in the CAPTURE
   phase so it pre-empts the scoring/feedback handler bound to the button
   (stopImmediatePropagation prevents that handler from ever running, so
   no score is calculated, no success feedback shown and the topic cannot
   be marked complete with missing answers).

   It only inspects the explicit data-* hooks the scoring engine already
   reads, so decorative inputs never cause a false "incomplete".
   ==================================================================== */
(function () {
    'use strict';

    var WARN_TEXT = 'Iltimos, barcha mashqlarni bajaring.';

    function isEmpty(v) {
        var s = String(v == null ? '' : v).trim();
        if (!s) return true;
        return s === '(tanlanmagan)' || s === '(kiritilmagan)' || s === "(yig'ilmagan)";
    }

    function visible(el) {
        return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    }

    function getTopicRoot(btn) {
        return (btn && btn.closest && btn.closest('.topic-exercises')) ||
               document.querySelector('.topic-exercises') ||
               document.getElementById('lessonContent') ||
               document;
    }

    function getActiveTopicData() {
        try { if (typeof currentTopic !== 'undefined' && currentTopic) return currentTopic; } catch (e) { /* ignore */ }
        if (window.currentTopic) return window.currentTopic;
        var id = null;
        try { if (typeof currentTopicId !== 'undefined' && Number.isFinite(currentTopicId)) id = currentTopicId; } catch (e) { /* ignore */ }
        if (id === null && Number.isFinite(window.currentTopicId)) id = window.currentTopicId;
        var data = null;
        try { if (typeof courseData !== 'undefined' && courseData) data = courseData; } catch (e) { /* ignore */ }
        if (!data) data = window.courseData || null;
        if (data && Array.isArray(data.topics) && Number.isFinite(id)) {
            return data.topics.find(function (t) { return t.id === id; }) || null;
        }
        return null;
    }

    function getMatchingState() {
        try { if (typeof matchingStateA1 !== 'undefined' && matchingStateA1) return matchingStateA1; } catch (e) { /* ignore */ }
        try { if (typeof matchingState !== 'undefined' && matchingState) return matchingState; } catch (e) { /* ignore */ }
        return window.matchingStateA1 || window.matchingState || null;
    }

    /* Returns every unanswered answer-field (DOM element) in the topic,
       ordered top-to-bottom. Empty array => topic is fully answered. */
    function findIncomplete(root) {
        var miss = [];
        function add(el) { if (el && visible(el) && miss.indexOf(el) === -1) miss.push(el); }

        /* text / inline / dropdown text inputs */
        Array.prototype.forEach.call(
            root.querySelectorAll(
                'input[data-blank], .blank-input-inline, input[data-section],' +
                'input[data-topic4-fill], [data-t1-input],' +
                'input[data-topic5-e2], input[data-topic5-e3], input[data-topic5-e4]'
            ),
            function (el) { if (isEmpty(el.value)) add(el); }
        );

        /* generic topicN inputs + sentence builders (hidden inputs) */
        Array.prototype.forEach.call(root.querySelectorAll('input'), function (el) {
            var attrs = el.attributes, isField = false, isBuilder = false, i;
            for (i = 0; i < attrs.length; i++) {
                var n = attrs[i].name;
                if (/^data-topic\d+-e\d+$/.test(n)) isField = true;
                if (/^data-topic\d+-builder-selected$/.test(n)) isBuilder = true;
            }
            if ((isField || isBuilder) && isEmpty(el.value)) {
                if (isBuilder && !visible(el)) {
                    var t = (el.closest && el.closest('.exercise-block, .quiz-question')) || el.parentElement;
                    add(t);
                } else {
                    add(el);
                }
            }
        });

        /* multiple-choice groups (one option must be selected) */
        Array.prototype.forEach.call(root.querySelectorAll('.quiz-options[data-question]'), function (box) {
            if (!box.querySelector('.quiz-option.selected')) add(box);
        });

        /* topic1-style choice rows */
        Array.prototype.forEach.call(root.querySelectorAll('[data-t1-row]'), function (row) {
            if (!row.querySelector('.t1-opt.selected')) add(row);
        });

        /* topic5 dropdown blanks */
        Array.prototype.forEach.call(root.querySelectorAll('.topic5-select-blank[data-topic5-select]'), function (b) {
            if (isEmpty(b.dataset ? b.dataset.value : '')) add(b);
        });

        /* chip rows (data-topicN-eM-row) — a chip must be selected */
        Array.prototype.forEach.call(root.querySelectorAll('*'), function (row) {
            var attrs = row.attributes, isChipRow = false, i;
            if (!attrs) return;
            for (i = 0; i < attrs.length; i++) {
                if (/^data-topic\d+-e\d+-row$/.test(attrs[i].name)) { isChipRow = true; break; }
            }
            if (isChipRow && !row.querySelector('.selected') && isEmpty(row.dataset ? row.dataset.value : '')) {
                add(row);
            }
        });

        /* matching game — every pair must be matched (data-driven count) */
        var topic = getActiveTopicData();
        var pairs = (topic && topic.quiz && topic.quiz.matchingGame && Array.isArray(topic.quiz.matchingGame.pairs))
            ? topic.quiz.matchingGame.pairs.length : 0;
        if (pairs) {
            var st = getMatchingState();
            var distinct = {};
            if (st && Array.isArray(st.matches)) {
                st.matches.forEach(function (m) {
                    if (m && Number.isInteger(m.left)) distinct[m.left] = true;
                });
            }
            var matched = Object.keys(distinct).length;
            var container = root.querySelector('.matching-game-container, .matching-game');
            if (matched < pairs) add(container || root.querySelector('.matching-game-container') || root);
        }

        miss.sort(function (a, b) {
            return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
        });
        return miss;
    }

    function showWarning(btn, firstEl, missCount) {
        var host = btn.closest('.topic-check-section, .topic-check-host');
        var fb = host ? host.querySelector('.topic-feedback') : null;
        if (fb) {
            fb.innerHTML = '<div class="fb-block-warning">⚠️ ' + WARN_TEXT +
                ' <span class="fb-block-count">(' + missCount +
                ' ta mashq to‘ldirilmagan)</span></div>';
            fb.classList.remove('hidden');
            fb.classList.add('show');
        }
        if (firstEl) {
            try { firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* ignore */ }
            firstEl.classList.add('validation-missing');
            setTimeout(function () { firstEl.classList.remove('validation-missing'); }, 2600);
            var f = (firstEl.matches && firstEl.matches('input, textarea, select'))
                ? firstEl
                : firstEl.querySelector('input, textarea, select, button');
            if (f && typeof f.focus === 'function') {
                try { f.focus({ preventScroll: true }); } catch (e) { try { f.focus(); } catch (e2) { /* ignore */ } }
            }
        } else if (fb) {
            try { fb.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* ignore */ }
        }
    }

    function onClickCapture(e) {
        var btn = (e.target && e.target.closest)
            ? e.target.closest('.check-topic-btn, #submitQuiz, .submit-btn')
            : null;
        if (!btn) return;
        var root = getTopicRoot(btn);
        var miss;
        try { miss = findIncomplete(root); } catch (err) { miss = []; }
        if (miss && miss.length) {
            e.stopImmediatePropagation();
            e.preventDefault();
            showWarning(btn, miss[0], miss.length);
        }
    }

    document.addEventListener('click', onClickCapture, true);

    /* minimal functional styling for the gate (no redesign) */
    function injectStyle() {
        if (document.getElementById('validation-gate-style')) return;
        var css =
            '.validation-missing{outline:2px solid #e74c3c !important;outline-offset:2px;' +
            'border-radius:6px;box-shadow:0 0 0 3px rgba(231,76,60,.25) !important;' +
            'transition:outline .2s ease,box-shadow .2s ease;}' +
            '.fb-block-warning{background:#fdecea;color:#b71c1c;border:1px solid #f5c6cb;' +
            'padding:12px 14px;border-radius:10px;font-weight:600;line-height:1.45;}' +
            '.fb-block-warning .fb-block-count{display:block;font-weight:400;font-size:.9em;' +
            'opacity:.85;margin-top:2px;}';
        var s = document.createElement('style');
        s.id = 'validation-gate-style';
        s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectStyle);
    } else {
        injectStyle();
    }
})();

/* ====================================================================
   FLOATING SCROLL-TO-TOP BUTTON  (Phase 7)
   --------------------------------------------------------------------
   A fixed bottom-right button visible on every lesson / demo / premium
   page. Appears after the user scrolls down, smooth-scrolls to the top
   on click, is fully responsive and self-contained, and is idempotent
   (safe if this file and scroll-top.js both load on the same page).
   ==================================================================== */
(function () {
    'use strict';
    if (window.__uzScrollTopInit) return;
    window.__uzScrollTopInit = true;

    function init() {
        if (!document.body || document.getElementById('uzScrollTopBtn')) return;

        var style = document.createElement('style');
        style.id = 'uz-scrolltop-style';
        style.textContent =
            '#uzScrollTopBtn{position:fixed;right:20px;bottom:20px;z-index:99998;' +
            'width:48px;height:48px;border:none;border-radius:50%;cursor:pointer;' +
            'background:linear-gradient(135deg,#ff9800,#f57c00);color:#fff;' +
            'font-size:22px;line-height:1;display:flex;align-items:center;justify-content:center;' +
            'box-shadow:0 6px 18px rgba(0,0,0,.28);opacity:0;visibility:hidden;' +
            'transform:translateY(12px);transition:opacity .25s ease,transform .25s ease,visibility .25s;}' +
            '#uzScrollTopBtn.show{opacity:1;visibility:visible;transform:translateY(0);}' +
            '#uzScrollTopBtn:hover{filter:brightness(1.05);transform:translateY(-2px);}' +
            '#uzScrollTopBtn:active{transform:translateY(0);}' +
            '@media(max-width:600px){#uzScrollTopBtn{right:14px;bottom:14px;width:44px;height:44px;font-size:20px;}}' +
            '@media print{#uzScrollTopBtn{display:none!important;}}';
        (document.head || document.documentElement).appendChild(style);

        var btn = document.createElement('button');
        btn.id = 'uzScrollTopBtn';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Yuqoriga');
        btn.title = 'Yuqoriga';
        btn.innerHTML = '↑';
        btn.addEventListener('click', function () {
            try { window.scrollTo({ top: 0, behavior: 'smooth' }); }
            catch (e) { window.scrollTo(0, 0); }
        });
        document.body.appendChild(btn);

        var ticking = false;
        function update() {
            ticking = false;
            var y = window.pageYOffset || document.documentElement.scrollTop || 0;
            if (y > 300) btn.classList.add('show'); else btn.classList.remove('show');
        }
        window.addEventListener('scroll', function () {
            if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
        }, { passive: true });
        update();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
