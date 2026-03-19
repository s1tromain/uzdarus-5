(function () {
    'use strict';

    var lastTopicKey = null;

    function getCourseData() {
        try {
            if (typeof courseData !== 'undefined') {
                return courseData;
            }
        } catch (e) {
            // ignore
        }

        return window.courseData || null;
    }

    function getCurrentTopicId() {
        try {
            if (typeof currentTopicId !== 'undefined' && Number.isFinite(currentTopicId)) {
                return currentTopicId;
            }
        } catch (e) {
            // ignore
        }

        if (Number.isFinite(window.currentTopicId)) {
            return window.currentTopicId;
        }

        return null;
    }

    function getCurrentTopicObject() {
        try {
            if (typeof currentTopic !== 'undefined' && currentTopic) {
                return currentTopic;
            }
        } catch (e) {
            // ignore
        }

        return window.currentTopic || null;
    }

    function getTopicById(topicId) {
        var data = getCourseData();
        if (!data || !Array.isArray(data.topics)) {
            return null;
        }

        return data.topics.find(function (topic) {
            return topic.id === topicId;
        }) || null;
    }

    function getActiveTopic() {
        var topicId = getCurrentTopicId();
        if (Number.isFinite(topicId)) {
            return getTopicById(topicId);
        }

        var topic = getCurrentTopicObject();
        return topic || null;
    }

    function getActiveTopicKey(topic) {
        var topicId = getCurrentTopicId();

        if (Number.isFinite(topicId)) {
            return 'topic-' + String(topicId);
        }

        if (topic && topic.id !== undefined && topic.id !== null) {
            return 'topic-' + String(topic.id);
        }

        return null;
    }

    function normalize(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/\u0451/g, '\u0435')
            .replace(/[.,!?;:()"'`<>\-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isCorrect(userValue, expected) {
        var normalizedUser = normalize(userValue);
        if (!normalizedUser) {
            return false;
        }

        if (Array.isArray(expected)) {
            return expected.some(function (item) {
                return normalize(item) === normalizedUser;
            });
        }

        return normalize(expected) === normalizedUser;
    }

    function feedbackRow(type, text) {
        return '<div class="feedback-row ' + type + '">' + text + '</div>';
    }

    function queryIn(scope, selector) {
        return scope ? scope.querySelector(selector) : document.querySelector(selector);
    }

    function queryAllIn(scope, selector) {
        return Array.from(scope ? scope.querySelectorAll(selector) : document.querySelectorAll(selector));
    }

    function collectMainQuizFeedback(topic, scope) {
        var rows = [];
        if (!topic || !topic.quiz) {
            return rows;
        }

        if (Array.isArray(topic.quiz.mcQuestions) && Array.isArray(topic.quiz.mcAnswers)) {
            topic.quiz.mcQuestions.forEach(function (question, index) {
                var selectedOption = queryIn(scope, '.quiz-options[data-question="' + index + '"] .quiz-option.selected');
                var selectedIndex = selectedOption ? parseInt(selectedOption.getAttribute('data-option'), 10) : -1;
                var options = Array.isArray(topic.quiz.mcOptions && topic.quiz.mcOptions[index])
                    ? topic.quiz.mcOptions[index]
                    : [];

                var rawCorrectIndex = topic.quiz.mcAnswers[index];
                var correctIndex = Number.isInteger(rawCorrectIndex)
                    ? rawCorrectIndex
                    : parseInt(rawCorrectIndex, 10);

                var correctText = options[correctIndex] || '(javob topilmadi)';
                var userText = selectedIndex >= 0 ? (options[selectedIndex] || '(tanlanmagan)') : '(tanlanmagan)';
                var ok = selectedIndex === correctIndex;
                var status = ok ? 'OK' : 'X';

                rows.push(
                    feedbackRow(
                        ok ? 'ok' : 'bad',
                        status + ' ' + question + ' - Siz: <strong>' + userText + '</strong>; To\'g\'ri javob: <strong>' + correctText + '</strong>'
                    )
                );
            });
        }

        if (Array.isArray(topic.quiz.blankQuestions) && Array.isArray(topic.quiz.blankAnswers)) {
            topic.quiz.blankQuestions.forEach(function (question, index) {
                var input = queryIn(scope, 'input[data-blank="' + index + '"]');
                var userValue = input ? input.value.trim() : '';
                var expected = topic.quiz.blankAnswers[index];
                var ok = isCorrect(userValue, expected);
                var expectedText = Array.isArray(expected) ? expected.join(' / ') : expected;
                var status = ok ? 'OK' : 'X';

                rows.push(
                    feedbackRow(
                        ok ? 'ok' : 'bad',
                        status + ' ' + question + ' - To\'g\'ri javob: <strong>' + expectedText + '</strong>'
                    )
                );
            });
        }

        return rows;
    }

    function getB2UserAnswers() {
        try {
            if (typeof userAnswers !== 'undefined' && Array.isArray(userAnswers)) {
                return userAnswers.slice();
            }
        } catch (e) {
            // ignore
        }

        if (Array.isArray(window.userAnswers)) {
            return window.userAnswers.slice();
        }

        return [];
    }

    function collectB2QuizFeedback(topic) {
        var rows = [];
        if (!topic || !topic.quiz || !Array.isArray(topic.quiz.mcQuestions) || !Array.isArray(topic.quiz.mcAnswers)) {
            return rows;
        }

        var answers = getB2UserAnswers();

        topic.quiz.mcQuestions.forEach(function (question, index) {
            var selectedIndex = Number.isInteger(answers[index]) ? answers[index] : -1;
            var options = Array.isArray(topic.quiz.mcOptions && topic.quiz.mcOptions[index])
                ? topic.quiz.mcOptions[index]
                : [];

            var rawCorrectIndex = topic.quiz.mcAnswers[index];
            var correctIndex = Number.isInteger(rawCorrectIndex)
                ? rawCorrectIndex
                : parseInt(rawCorrectIndex, 10);

            var correctText = options[correctIndex] || '(javob topilmadi)';
            var userText = selectedIndex >= 0 ? (options[selectedIndex] || '(tanlanmagan)') : '(tanlanmagan)';
            var ok = selectedIndex === correctIndex;
            var status = ok ? 'OK' : 'X';

            rows.push(
                feedbackRow(
                    ok ? 'ok' : 'bad',
                    status + ' ' + question + ' - Siz: <strong>' + userText + '</strong>; To\'g\'ri javob: <strong>' + correctText + '</strong>'
                )
            );
        });

        return rows;
    }

    function collectExtraExercisesFeedback(topic, scope) {
        var rows = [];
        if (!topic || !topic.extraExercises) {
            return rows;
        }

        Object.keys(topic.extraExercises).forEach(function (sectionKey) {
            var section = topic.extraExercises[sectionKey];
            if (!section || !Array.isArray(section.questions) || !Array.isArray(section.answers)) {
                return;
            }

            section.questions.forEach(function (question, index) {
                var input = queryIn(scope, 'input[data-section="' + sectionKey + '"][data-index="' + index + '"]');
                var userValue = input ? input.value.trim() : '';
                var expected = section.answers[index];
                var ok = isCorrect(userValue, expected);

                if (input) {
                    input.classList.remove('correct', 'incorrect');
                    if (!userValue) {
                        input.classList.add('incorrect');
                    } else if (ok) {
                        input.classList.add('correct');
                    } else {
                        input.classList.add('incorrect');
                    }
                }

                var readableQuestion = String(question || '').replace(/\u2026/g, '_____');
                var status = ok ? 'OK' : 'X';

                rows.push(
                    feedbackRow(
                        ok ? 'ok' : 'bad',
                        status + ' ' + readableQuestion + ' - To\'g\'ri javob: <strong>' + expected + '</strong>'
                    )
                );
            });
        });

        return rows;
    }

    function collectTopic4Feedback(topic, scope) {
        var rows = [];
        if (!topic || !topic.topic4FillExercise) {
            return rows;
        }

        topic.topic4FillExercise.questions.forEach(function (prompt, index) {
            var input = queryIn(scope, 'input[data-topic4-fill="' + index + '"]');
            var userValue = input ? input.value.trim() : '';
            var expected = topic.topic4FillExercise.answers[index];
            var ok = isCorrect(userValue, expected);

            if (input) {
                input.classList.remove('correct', 'incorrect');
                if (!userValue) {
                    input.classList.add('incorrect');
                } else if (ok) {
                    input.classList.add('correct');
                } else {
                    input.classList.add('incorrect');
                }
            }

            var status = ok ? 'OK' : 'X';
            rows.push(
                feedbackRow(
                    ok ? 'ok' : 'bad',
                    status + ' ' + prompt + ' - To\'g\'ri javob: <strong>' + expected + '</strong>'
                )
            );
        });

        return rows;
    }

    function collectTopic5Feedback(topic, scope) {
        var rows = [];
        if (!topic || !topic.topic5Exercises) {
            return rows;
        }

        var ex1 = topic.topic5Exercises.exercise1;
        if (ex1 && Array.isArray(ex1.questions)) {
            ex1.questions.forEach(function (question, index) {
                var blank = queryIn(scope, '.topic5-select-blank[data-topic5-select="' + index + '"]');
                var userValue = blank ? (blank.dataset.value || '').trim() : '';
                var expected = question.answer;
                var ok = isCorrect(userValue, expected);

                if (blank) {
                    blank.classList.remove('correct', 'incorrect');
                    if (!userValue) {
                        blank.classList.add('incorrect');
                    } else if (ok) {
                        blank.classList.add('correct');
                    } else {
                        blank.classList.add('incorrect');
                    }
                }

                var status = ok ? 'OK' : 'X';
                rows.push(
                    feedbackRow(
                        ok ? 'ok' : 'bad',
                        status + ' ' + question.text + ' - To\'g\'ri javob: <strong>' + expected + '</strong>'
                    )
                );
            });
        }

        var ex2 = topic.topic5Exercises.exercise2;
        if (ex2 && Array.isArray(ex2.prompts) && Array.isArray(ex2.answers)) {
            ex2.prompts.forEach(function (prompt, index) {
                var input = queryIn(scope, 'input[data-topic5-e2="' + index + '"]');
                var userValue = input ? input.value.trim() : '';
                var expected = ex2.answers[index];
                var ok = isCorrect(userValue, expected);

                if (input) {
                    input.classList.remove('correct', 'incorrect');
                    if (!userValue) {
                        input.classList.add('incorrect');
                    } else if (ok) {
                        input.classList.add('correct');
                    } else {
                        input.classList.add('incorrect');
                    }
                }

                var status = ok ? 'OK' : 'X';
                rows.push(
                    feedbackRow(
                        ok ? 'ok' : 'bad',
                        status + ' ' + prompt + ' - To\'g\'ri javob: <strong>' + expected + '</strong>'
                    )
                );
            });
        }

        var ex3 = topic.topic5Exercises.exercise3;
        if (ex3 && Array.isArray(ex3.prompts) && Array.isArray(ex3.answers)) {
            ex3.prompts.forEach(function (prompt, index) {
                var input = queryIn(scope, 'input[data-topic5-e3="' + index + '"]');
                var userValue = input ? input.value.trim() : '';
                var expected = ex3.answers[index];
                var ok = isCorrect(userValue, expected);

                if (input) {
                    input.classList.remove('correct', 'incorrect');
                    if (!userValue) {
                        input.classList.add('incorrect');
                    } else if (ok) {
                        input.classList.add('correct');
                    } else {
                        input.classList.add('incorrect');
                    }
                }

                var status = ok ? 'OK' : 'X';
                rows.push(
                    feedbackRow(
                        ok ? 'ok' : 'bad',
                        status + ' ' + prompt + ' - To\'g\'ri javob: <strong>' + expected + '</strong>'
                    )
                );
            });
        }

        var ex4 = topic.topic5Exercises.exercise4;
        if (ex4 && Array.isArray(ex4.prompts) && Array.isArray(ex4.answers)) {
            ex4.prompts.forEach(function (prompt, index) {
                var input = queryIn(scope, 'input[data-topic5-e4="' + index + '"]');
                var userValue = input ? input.value.trim() : '';
                var expected = ex4.answers[index];
                var ok = isCorrect(userValue, expected);
                var expectedText = Array.isArray(expected) ? expected.join(' / ') : expected;

                if (input) {
                    input.classList.remove('correct', 'incorrect');
                    if (!userValue) {
                        input.classList.add('incorrect');
                    } else if (ok) {
                        input.classList.add('correct');
                    } else {
                        input.classList.add('incorrect');
                    }
                }

                var status = ok ? 'OK' : 'X';
                rows.push(
                    feedbackRow(
                        ok ? 'ok' : 'bad',
                        status + ' ' + prompt + ' - To\'g\'ri javob: <strong>' + expectedText + '</strong>'
                    )
                );
            });
        }

        return rows;
    }

    function getMatchingState() {
        try {
            if (typeof matchingStateA1 !== 'undefined' && matchingStateA1) {
                return matchingStateA1;
            }
        } catch (e) {
            // ignore
        }

        try {
            if (typeof matchingState !== 'undefined' && matchingState) {
                return matchingState;
            }
        } catch (e) {
            // ignore
        }

        return null;
    }

    function collectMatchingFeedback(topic) {
        var rows = [];
        if (!topic || !topic.quiz || !topic.quiz.matchingGame || !Array.isArray(topic.quiz.matchingGame.pairs)) {
            return rows;
        }

        var state = getMatchingState();
        var pairs = topic.quiz.matchingGame.pairs;
        var map = new Map();

        if (state && Array.isArray(state.matches)) {
            state.matches.forEach(function (match) {
                if (Number.isInteger(match.left) && Number.isInteger(match.right) && !map.has(match.left)) {
                    map.set(match.left, match.right);
                }
            });
        }

        pairs.forEach(function (pair, index) {
            var selectedRight = map.has(index) ? map.get(index) : null;
            var ok = selectedRight === index;
            var selectedPair = Number.isInteger(selectedRight) ? pairs[selectedRight] : null;
            var selectedText = selectedPair ? selectedPair.right : '(tanlanmagan)';
            var status = ok ? 'OK' : 'X';

            rows.push(
                feedbackRow(
                    ok ? 'ok' : 'bad',
                    status + ' ' + pair.left + ' -> ' + selectedText + ' - To\'g\'ri javob: <strong>' + pair.right + '</strong>'
                )
            );
        });

        return rows;
    }

    function collectB2BlankFeedback(topic, scope) {
        var rows = [];
        if (!topic || !topic.quiz || !Array.isArray(topic.quiz.blankQuestions) || !Array.isArray(topic.quiz.blankAnswers)) {
            return rows;
        }

        topic.quiz.blankQuestions.forEach(function (_, qIndex) {
            var expectedList = topic.quiz.blankAnswers[qIndex];
            var normalizedExpectedList = Array.isArray(expectedList) ? expectedList : [expectedList];

            normalizedExpectedList.forEach(function (expected, inputIndex) {
                var selector = '.blank-input-inline[data-q-index="' + qIndex + '"][data-input-index="' + inputIndex + '"]';
                var input = queryIn(scope, selector);
                var userValue = input ? input.value.trim() : '';
                var ok = isCorrect(userValue, expected);

                if (input) {
                    input.classList.remove('correct', 'incorrect');
                    if (!userValue) {
                        input.classList.add('incorrect');
                    } else if (ok) {
                        input.classList.add('correct');
                    } else {
                        input.classList.add('incorrect');
                    }
                }

                var status = ok ? 'OK' : 'X';
                rows.push(
                    feedbackRow(
                        ok ? 'ok' : 'bad',
                        status + ' Yozma mashq ' + (qIndex + 1) + '.' + (inputIndex + 1) + ' - To\'g\'ri javob: <strong>' + expected + '</strong>'
                    )
                );
            });
        });

        return rows;
    }

    function clearFeedbackNode(node) {
        if (!node) {
            return;
        }

        node.innerHTML = '';
        node.classList.remove('show');
        node.classList.add('hidden');
    }

    function clearAllTopicFeedback() {
        queryAllIn(document, '.topic-feedback').forEach(function (node) {
            clearFeedbackNode(node);
        });
    }

    function renderTopicFeedback(host, rows) {
        var feedback = host ? queryIn(host, '.topic-feedback') : null;
        if (!feedback) {
            return;
        }

        var totalCount = rows.length;
        var correctCount = rows.filter(function (row) {
            return row.indexOf('feedback-row ok') !== -1;
        }).length;

        if (!totalCount) {
            feedback.innerHTML = '<div class="feedback-empty">Tekshirish uchun mashqlar topilmadi.</div>';
            feedback.classList.remove('hidden');
            feedback.classList.add('show');
            return;
        }

        feedback.innerHTML =
            '<div class="topic-feedback-title">Natija: ' + correctCount + '/' + totalCount + '</div>' +
            rows.join('');

        feedback.classList.remove('hidden');
        feedback.classList.add('show');
    }

    function removeLegacyGlobalControls() {
        queryAllIn(document, '#globalCheckHost').forEach(function (node) {
            node.remove();
        });

        queryAllIn(document, '#checkAllAnswersBtn').forEach(function (node) {
            node.remove();
        });

        queryAllIn(document, '#globalFeedback').forEach(function (node) {
            node.remove();
        });
    }

    function getActiveTopicRoot() {
        var quizSection = document.getElementById('quizSection');
        if (
            quizSection &&
            quizSection.querySelector('.quiz-container, .quiz-question, .fill-blank, .exercise-block, .matching-game-container, #extraExercises, #topic4FillExercise, #topic5PracticeSection, .blank-section')
        ) {
            return quizSection;
        }

        var lessonContent = document.getElementById('lessonContent');
        if (
            lessonContent &&
            lessonContent.querySelector('.quiz-section, .blank-section, .matching-game-container, .quiz-question, .exercise-block, #extraExercises, #topic4FillExercise, #topic5PracticeSection')
        ) {
            return lessonContent;
        }

        return null;
    }

    function pickTopicAnchor(root) {
        if (!root) {
            return null;
        }

        return (
            queryIn(root, '#topic5PracticeSection') ||
            queryIn(root, '#topic4FillExercise') ||
            queryIn(root, '#extraExercises') ||
            queryIn(root, '#matchingGameA1') ||
            queryIn(root, '#matchingGame') ||
            queryIn(root, '.matching-game-container:last-of-type') ||
            queryIn(root, '.blank-section:last-of-type') ||
            queryIn(root, '.quiz-section:last-of-type') ||
            queryIn(root, '.quiz-container:last-of-type') ||
            root.lastElementChild ||
            root
        );
    }

    async function runTopicCheck(event) {
        var button = event.currentTarget;
        var host = button ? button.closest('.topic-check-host') : null;
        var topicRoot = host ? host.closest('.topic-exercises') : getActiveTopicRoot();

        var rows = [];
        var topicId = getCurrentTopicId();
        var topic = getActiveTopic();

        if (typeof window.checkAnswers === 'function' && Number.isFinite(topicId)) {
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

            if (topic && topic.quiz && topic.quiz.matchingGame) {
                if (typeof window.checkMatchingA1 === 'function') {
                    window.checkMatchingA1();
                } else if (typeof window.checkMatchingGame === 'function') {
                    window.checkMatchingGame(topicId);
                } else if (typeof window.checkMatching === 'function') {
                    window.checkMatching();
                }
            }

            rows.push.apply(rows, collectMainQuizFeedback(topic, topicRoot));
            rows.push.apply(rows, collectExtraExercisesFeedback(topic, topicRoot));
            rows.push.apply(rows, collectTopic4Feedback(topic, topicRoot));
            rows.push.apply(rows, collectTopic5Feedback(topic, topicRoot));
            rows.push.apply(rows, collectMatchingFeedback(topic));
        } else {
            if (typeof window.submitQuiz === 'function') {
                window.submitQuiz();
            }

            if (typeof window.checkBlankAnswers === 'function') {
                window.checkBlankAnswers();
            }

            if (typeof window.checkMatching === 'function') {
                window.checkMatching();
            }

            var b2Topic = getActiveTopic();
            rows.push.apply(rows, collectB2QuizFeedback(b2Topic));
            rows.push.apply(rows, collectB2BlankFeedback(b2Topic, topicRoot));
            rows.push.apply(rows, collectMatchingFeedback(b2Topic));
        }

        renderTopicFeedback(host, rows);
    }

    function createTopicHost(topicKey) {
        var host = document.createElement('div');
        host.className = 'topic-check-host';
        host.dataset.topicId = topicKey;

        host.innerHTML =
            '<button class="check-topic-btn" type="button">Javoblarni tekshirish</button>' +
            '<div class="topic-feedback hidden"></div>';

        var button = queryIn(host, '.check-topic-btn');
        if (button) {
            button.addEventListener('click', runTopicCheck);
        }

        return host;
    }

    function ensureSingleTopicControls() {
        removeLegacyGlobalControls();

        var topic = getActiveTopic();
        var topicKey = getActiveTopicKey(topic);
        var root = getActiveTopicRoot();

        if (!root || !topicKey) {
            queryAllIn(document, '.topic-check-host').forEach(function (node) {
                node.remove();
            });
            return;
        }

        root.classList.add('topic-exercises');
        root.setAttribute('data-topic-id', topicKey);

        if (lastTopicKey !== topicKey) {
            clearAllTopicFeedback();
            lastTopicKey = topicKey;
        }

        var hosts = queryAllIn(root, '.topic-check-host');
        if (hosts.length > 1) {
            hosts.slice(1).forEach(function (node) {
                node.remove();
            });
        }

        var host = queryIn(root, '.topic-check-host');
        if (!host) {
            host = createTopicHost(topicKey);
        }

        host.dataset.topicId = topicKey;

        var anchor = pickTopicAnchor(root);
        if (anchor && anchor !== host && host.previousElementSibling !== anchor) {
            anchor.insertAdjacentElement('afterend', host);
        }

        queryAllIn(document, '.topic-check-host').forEach(function (node) {
            if (!root.contains(node)) {
                node.remove();
            }
        });
    }

    function startTopicObserver() {
        ensureSingleTopicControls();

        var observer = new MutationObserver(function () {
            ensureSingleTopicControls();
        });

        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        setInterval(ensureSingleTopicControls, 650);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startTopicObserver);
    } else {
        startTopicObserver();
    }
})();
