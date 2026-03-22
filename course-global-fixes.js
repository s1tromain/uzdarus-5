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
                var sel = queryIn(scope, '.quiz-options[data-question="' + i + '"] .quiz-option.selected');
                var selIdx = sel ? parseInt(sel.getAttribute('data-option'), 10) : -1;
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
        }

        if (Array.isArray(topic.quiz.blankQuestions) && Array.isArray(topic.quiz.blankAnswers)) {
            topic.quiz.blankQuestions.forEach(function (question, i) {
                var inp = queryIn(scope, 'input[data-blank="' + i + '"]');
                var uv = inp ? inp.value.trim() : '';
                var exp = topic.quiz.blankAnswers[i];
                var ok = isCorrect(uv, exp);
                markInput(inp, ok);
                var ed = expectedDisplay(exp);
                results.push(makeResult(
                    "Bo'sh joy " + (i + 1), question, uv, ed, ok,
                    generateExplanation(ok, uv, ed, topicTitle, "Bo'sh joy to'ldirish")
                ));
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
                var uv = inp ? inp.value.trim() : '';
                var ok = isCorrect(uv, exp);
                markInput(inp, ok);
                var ed = expectedDisplay(exp);
                results.push(makeResult(
                    'Yozma mashq ' + (qi + 1) + '.' + (ii + 1), '', uv, ed, ok,
                    generateExplanation(ok, uv, ed, topicTitle, "Bo'sh joy to'ldirish")
                ));
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
                var inp = queryIn(scope, 'input[data-section="' + sKey + '"][data-index="' + i + '"]');
                var uv = inp ? inp.value.trim() : '';
                var exp = sec.answers[i];
                var ok = isCorrect(uv, exp);
                markInput(inp, ok);
                var ed = expectedDisplay(exp);
                var qText = String(q || '').replace(/\u2026/g, '_____');
                results.push(makeResult(
                    secTitle + ' \u2014 ' + (i + 1), qText, uv, ed, ok,
                    generateExplanation(ok, uv, ed, topicTitle, secTitle)
                ));
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
            var inp = queryIn(scope, 'input[data-topic4-fill="' + i + '"]');
            var uv = inp ? inp.value.trim() : '';
            var exp = topic.topic4FillExercise.answers[i];
            var ok = isCorrect(uv, exp);
            markInput(inp, ok);
            var ed = expectedDisplay(exp);
            results.push(makeResult(
                exTitle + ' \u2014 ' + (i + 1), prompt, uv, ed, ok,
                generateExplanation(ok, uv, ed, topicTitle, exTitle)
            ));
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
                var blank = queryIn(scope, '.topic5-select-blank[data-topic5-select="' + i + '"]');
                var uv = blank ? (blank.dataset.value || '').trim() : '';
                var exp = q.answer;
                var ok = isCorrect(uv, exp);
                markInput(blank, ok);
                var ed = expectedDisplay(exp);
                results.push(makeResult(
                    ex1Title + ' \u2014 ' + (i + 1), q.text || '', uv || '(tanlanmagan)', ed, ok,
                    generateExplanation(ok, uv, ed, topicTitle, ex1Title)
                ));
            });
        }

        ['exercise2', 'exercise3', 'exercise4'].forEach(function (eKey) {
            var ex = topic.topic5Exercises[eKey];
            if (!ex || !Array.isArray(ex.prompts) || !Array.isArray(ex.answers)) return;
            var num = eKey.replace('exercise', '');
            var eTitle = ex.title || (num + '-mashq');
            ex.prompts.forEach(function (prompt, i) {
                var inp = queryIn(scope, 'input[data-topic5-e' + num + '="' + i + '"]');
                var uv = inp ? inp.value.trim() : '';
                var exp = ex.answers[i];
                var ok = isCorrect(uv, exp);
                markInput(inp, ok);
                var ed = expectedDisplay(exp);
                results.push(makeResult(
                    eTitle + ' \u2014 ' + (i + 1), prompt, uv, ed, ok,
                    generateExplanation(ok, uv, ed, topicTitle, eTitle)
                ));
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
            var uv = inp ? inp.value.trim() : '';
            var exp = item.answers || item.answer;
            var ok = isCorrect(uv, exp);
            markInput(inp, ok);
            var ed = expectedDisplay(exp);
            var qText = item.prompt || item.word || '';
            if (item.hint) qText += ' (' + item.hint + ')';
            results.push(makeResult(exTitle + ' \u2014 ' + (i + 1), qText, uv, ed, ok,
                generateExplanation(ok, uv, ed, topicTitle, exTitle)));
        });
        return results;
    }

    function collectItemsChips(exercise, scope, N, M, exTitle, topicTitle) {
        var results = [];
        var items = exercise.items || [];
        items.forEach(function (item, i) {
            var rowSel = '[data-topic' + N + '-e' + M + '-row="' + i + '"]';
            var row = queryIn(scope, rowSel);
            var uv = '';
            if (row) {
                var selBtn = row.querySelector('.selected');
                uv = selBtn ? (selBtn.dataset.value || selBtn.textContent || '').trim() : '';
                if (!uv && row.dataset.value) uv = row.dataset.value.trim();
            }
            var exp = item.answer;
            var ok = isCorrect(uv, exp);
            var ed = expectedDisplay(exp);
            results.push(makeResult(exTitle + ' \u2014 ' + (i + 1), item.prompt || '', uv || '(tanlanmagan)', ed, ok,
                generateExplanation(ok, uv, ed, topicTitle, exTitle)));
        });
        return results;
    }

    function collectItemsSelect(exercise, scope, N, M, exTitle, topicTitle) {
        var results = [];
        var items = exercise.items || [];
        items.forEach(function (item, i) {
            var el = queryIn(scope, '[data-topic' + N + '-select="' + i + '"]') ||
                     queryIn(scope, '[data-topic' + N + '-e' + M + '="' + i + '"]');
            var uv = el ? (el.dataset.value || el.textContent || '').trim() : '';
            var exp = item.answer;
            var ok = isCorrect(uv, exp);
            markInput(el, ok);
            var ed = expectedDisplay(exp);
            results.push(makeResult(exTitle + ' \u2014 ' + (i + 1), item.template || item.prompt || '', uv || '(tanlanmagan)', ed, ok,
                generateExplanation(ok, uv, ed, topicTitle, exTitle)));
        });
        return results;
    }

    function collectItemsBuilder(exercise, scope, N, M, exTitle, topicTitle) {
        var results = [];
        var items = exercise.items || [];
        items.forEach(function (item, i) {
            var hiddenInput = queryIn(scope, 'input[data-topic' + N + '-builder-selected="' + i + '"]');
            var uv = '';
            if (hiddenInput && hiddenInput.value) {
                uv = hiddenInput.value.split('|').map(function (w) { return w.trim(); }).filter(Boolean).join(' ');
            } else {
                var target = queryIn(scope, '[data-topic' + N + '-builder-target="' + i + '"]');
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
            results.push(makeResult(exTitle + ' \u2014 ' + (i + 1), item.prompt || 'Gap tuzing', uv || "(yig'ilmagan)", ed, ok,
                generateExplanation(ok, uv, ed, topicTitle, exTitle)));
        });
        return results;
    }

    function collectArrayInput(exercise, scope, N, M, exTitle, topicTitle, type) {
        var results = [];
        var questions = type === 'prompts-input' ? exercise.prompts :
                        type === 'sentences-input' ? exercise.sentences : exercise.questions;
        var answers = exercise.answers || [];
        (questions || []).forEach(function (q, i) {
            var inp = queryIn(scope, 'input[data-topic' + N + '-e' + M + '="' + i + '"]');
            var uv = inp ? inp.value.trim() : '';
            var exp = answers[i];
            var ok = isCorrect(uv, exp);
            markInput(inp, ok);
            var ed = expectedDisplay(exp);
            results.push(makeResult(exTitle + ' \u2014 ' + (i + 1), String(q || ''), uv, ed, ok,
                generateExplanation(ok, uv, ed, topicTitle, exTitle)));
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

    function renderDetailedFeedback(host, results) {
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
        var msg;
        if (pct >= 90) msg = "\uD83C\uDF89 Ajoyib! Siz mavzuni mukammal o'zlashtirgansiz!";
        else if (pct >= 70) msg = "\uD83D\uDC4D Yaxshi natija! Siz mavzuni yaxshi tushundingiz.";
        else if (pct >= 50) msg = "\uD83D\uDCDD Qoniqarli. Ba'zi savollarni qayta ko'rib chiqing.";
        else msg = "\uD83D\uDCDA Ko'proq mashq qiling. Mavzuni diqqat bilan o'qib chiqing.";

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

        try { feedback.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* ignore */ }
    }

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
            if (topic && topic.topic4FillExercise && typeof window.checkTopic4FillExercise === 'function') {
                await window.checkTopic4FillExercise(topicId);
            }
            if (topic && topic.topic5Exercises && typeof window.checkTopic5Exercises === 'function') {
                await window.checkTopic5Exercises(topicId);
            }

            /* Dynamic call for topic 6+ check functions */
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
    }

    function startTopicObserver() {
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
