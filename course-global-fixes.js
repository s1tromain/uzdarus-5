(function () {
    'use strict';

    function getCourseData() {
        try {
            if (typeof courseData !== 'undefined') return courseData;
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
        const data = getCourseData();
        if (!data || !Array.isArray(data.topics)) {
            return null;
        }
        return data.topics.find((topic) => topic.id === topicId) || null;
    }

    function getActiveTopic() {
        const topicId = getCurrentTopicId();
        if (Number.isFinite(topicId)) {
            return getTopicById(topicId);
        }

        const topic = getCurrentTopicObject();
        if (topic) {
            return topic;
        }

        return null;
    }

    function normalize(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[.,!?;:()"'`«»\-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isCorrect(userValue, expected) {
        const normalizedUser = normalize(userValue);
        if (!normalizedUser) {
            return false;
        }

        if (Array.isArray(expected)) {
            return expected.some((item) => normalize(item) === normalizedUser);
        }

        return normalize(expected) === normalizedUser;
    }

    function feedbackRow(type, text) {
        return `<div class="feedback-row ${type}">${text}</div>`;
    }

    function collectMainQuizFeedback(topic) {
        const rows = [];
        if (!topic || !topic.quiz) {
            return rows;
        }

        if (Array.isArray(topic.quiz.mcQuestions) && Array.isArray(topic.quiz.mcAnswers)) {
            topic.quiz.mcQuestions.forEach((question, index) => {
                const selectedOption = document.querySelector(`.quiz-options[data-question="${index}"] .quiz-option.selected`);
                const selectedIndex = selectedOption ? parseInt(selectedOption.getAttribute('data-option'), 10) : -1;
                const options = Array.isArray(topic.quiz.mcOptions?.[index]) ? topic.quiz.mcOptions[index] : [];
                const correctIndex = Number.isInteger(topic.quiz.mcAnswers[index])
                    ? topic.quiz.mcAnswers[index]
                    : parseInt(topic.quiz.mcAnswers[index], 10);
                const correctText = options[correctIndex] || '(javob topilmadi)';
                const userText = selectedIndex >= 0 ? (options[selectedIndex] || '(tanlanmagan)') : '(tanlanmagan)';
                const ok = selectedIndex === correctIndex;
                const status = ok ? 'OK' : 'X';

                rows.push(
                    feedbackRow(
                        ok ? 'ok' : 'bad',
                        `${status} ${question} - Siz: <strong>${userText}</strong>; To'g'ri javob: <strong>${correctText}</strong>`
                    )
                );
            });
        }

        if (Array.isArray(topic.quiz.blankQuestions) && Array.isArray(topic.quiz.blankAnswers)) {
            topic.quiz.blankQuestions.forEach((question, index) => {
                const input = document.querySelector(`input[data-blank="${index}"]`);
                const userValue = input ? input.value.trim() : '';
                const expected = topic.quiz.blankAnswers[index];
                const ok = isCorrect(userValue, expected);
                const expectedText = Array.isArray(expected) ? expected.join(' / ') : expected;
                const status = ok ? 'OK' : 'X';

                rows.push(
                    feedbackRow(
                        ok ? 'ok' : 'bad',
                        `${status} ${question} - To'g'ri javob: <strong>${expectedText}</strong>`
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
        const rows = [];
        if (!topic || !topic.quiz || !Array.isArray(topic.quiz.mcQuestions) || !Array.isArray(topic.quiz.mcAnswers)) {
            return rows;
        }

        const answers = getB2UserAnswers();

        topic.quiz.mcQuestions.forEach((question, index) => {
            const selectedIndex = Number.isInteger(answers[index]) ? answers[index] : -1;
            const options = Array.isArray(topic.quiz.mcOptions?.[index]) ? topic.quiz.mcOptions[index] : [];
            const correctIndex = Number.isInteger(topic.quiz.mcAnswers[index])
                ? topic.quiz.mcAnswers[index]
                : parseInt(topic.quiz.mcAnswers[index], 10);
            const correctText = options[correctIndex] || '(javob topilmadi)';
            const userText = selectedIndex >= 0 ? (options[selectedIndex] || '(tanlanmagan)') : '(tanlanmagan)';
            const ok = selectedIndex === correctIndex;
            const status = ok ? 'OK' : 'X';

            rows.push(
                feedbackRow(
                    ok ? 'ok' : 'bad',
                    `${status} ${question} - Siz: <strong>${userText}</strong>; To'g'ri javob: <strong>${correctText}</strong>`
                )
            );
        });

        return rows;
    }

    function collectExtraExercisesFeedback(topic) {
        const rows = [];
        if (!topic || !topic.extraExercises) {
            return rows;
        }

        Object.keys(topic.extraExercises).forEach((sectionKey) => {
            const section = topic.extraExercises[sectionKey];
            if (!section || !Array.isArray(section.questions) || !Array.isArray(section.answers)) {
                return;
            }

            section.questions.forEach((question, index) => {
                const input = document.querySelector(`input[data-section="${sectionKey}"][data-index="${index}"]`);
                const userValue = input ? input.value.trim() : '';
                const expected = section.answers[index];
                const ok = isCorrect(userValue, expected);

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

                const readableQuestion = String(question || '').replace(/…/g, '_____');
                const status = ok ? 'OK' : 'X';
                rows.push(
                    feedbackRow(
                        ok ? 'ok' : 'bad',
                        `${status} ${readableQuestion} - To'g'ri javob: <strong>${expected}</strong>`
                    )
                );
            });
        });

        return rows;
    }

    function collectTopic4Feedback(topic) {
        const rows = [];
        if (!topic || !topic.topic4FillExercise) {
            return rows;
        }

        topic.topic4FillExercise.questions.forEach((prompt, index) => {
            const input = document.querySelector(`input[data-topic4-fill="${index}"]`);
            const userValue = input ? input.value.trim() : '';
            const expected = topic.topic4FillExercise.answers[index];
            const ok = isCorrect(userValue, expected);

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

            const status = ok ? 'OK' : 'X';
            rows.push(
                feedbackRow(
                    ok ? 'ok' : 'bad',
                    `${status} ${prompt} - To'g'ri javob: <strong>${expected}</strong>`
                )
            );
        });

        return rows;
    }

    function collectTopic5Feedback(topic) {
        const rows = [];
        if (!topic || !topic.topic5Exercises) {
            return rows;
        }

        const ex1 = topic.topic5Exercises.exercise1;
        if (ex1 && Array.isArray(ex1.questions)) {
            ex1.questions.forEach((question, index) => {
                const blank = document.querySelector(`.topic5-select-blank[data-topic5-select="${index}"]`);
                const userValue = blank ? (blank.dataset.value || '').trim() : '';
                const expected = question.answer;
                const ok = isCorrect(userValue, expected);

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

                const status = ok ? 'OK' : 'X';
                rows.push(
                    feedbackRow(
                        ok ? 'ok' : 'bad',
                        `${status} ${question.text} - To'g'ri javob: <strong>${expected}</strong>`
                    )
                );
            });
        }

        const ex2 = topic.topic5Exercises.exercise2;
        if (ex2 && Array.isArray(ex2.prompts) && Array.isArray(ex2.answers)) {
            ex2.prompts.forEach((prompt, index) => {
                const input = document.querySelector(`input[data-topic5-e2="${index}"]`);
                const userValue = input ? input.value.trim() : '';
                const expected = ex2.answers[index];
                const ok = isCorrect(userValue, expected);

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

                const status = ok ? 'OK' : 'X';
                rows.push(
                    feedbackRow(
                        ok ? 'ok' : 'bad',
                        `${status} ${prompt} - To'g'ri javob: <strong>${expected}</strong>`
                    )
                );
            });
        }

        const ex3 = topic.topic5Exercises.exercise3;
        if (ex3 && Array.isArray(ex3.prompts) && Array.isArray(ex3.answers)) {
            ex3.prompts.forEach((prompt, index) => {
                const input = document.querySelector(`input[data-topic5-e3="${index}"]`);
                const userValue = input ? input.value.trim() : '';
                const expected = ex3.answers[index];
                const ok = isCorrect(userValue, expected);

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

                const status = ok ? 'OK' : 'X';
                rows.push(
                    feedbackRow(
                        ok ? 'ok' : 'bad',
                        `${status} ${prompt} - To'g'ri javob: <strong>${expected}</strong>`
                    )
                );
            });
        }

        const ex4 = topic.topic5Exercises.exercise4;
        if (ex4 && Array.isArray(ex4.prompts) && Array.isArray(ex4.answers)) {
            ex4.prompts.forEach((prompt, index) => {
                const input = document.querySelector(`input[data-topic5-e4="${index}"]`);
                const userValue = input ? input.value.trim() : '';
                const expected = ex4.answers[index];
                const ok = isCorrect(userValue, expected);
                const expectedText = Array.isArray(expected) ? expected.join(' / ') : expected;

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

                const status = ok ? 'OK' : 'X';
                rows.push(
                    feedbackRow(
                        ok ? 'ok' : 'bad',
                        `${status} ${prompt} - To'g'ri javob: <strong>${expectedText}</strong>`
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
        const rows = [];
        if (!topic || !topic.quiz || !topic.quiz.matchingGame || !Array.isArray(topic.quiz.matchingGame.pairs)) {
            return rows;
        }

        const state = getMatchingState();
        const pairs = topic.quiz.matchingGame.pairs;
        const map = new Map();

        if (state && Array.isArray(state.matches)) {
            state.matches.forEach((match) => {
                if (Number.isInteger(match.left) && Number.isInteger(match.right) && !map.has(match.left)) {
                    map.set(match.left, match.right);
                }
            });
        }

        pairs.forEach((pair, index) => {
            const selectedRight = map.has(index) ? map.get(index) : null;
            const ok = selectedRight === index;
            const selectedPair = Number.isInteger(selectedRight) ? pairs[selectedRight] : null;
            const selectedText = selectedPair ? selectedPair.right : '(tanlanmagan)';
            const status = ok ? 'OK' : 'X';

            rows.push(
                feedbackRow(
                    ok ? 'ok' : 'bad',
                    `${status} ${pair.left} -> ${selectedText} - To'g'ri javob: <strong>${pair.right}</strong>`
                )
            );
        });

        return rows;
    }

    function collectB2BlankFeedback(topic) {
        const rows = [];
        if (!topic || !topic.quiz || !Array.isArray(topic.quiz.blankQuestions) || !Array.isArray(topic.quiz.blankAnswers)) {
            return rows;
        }

        topic.quiz.blankQuestions.forEach((_, qIndex) => {
            const expectedList = topic.quiz.blankAnswers[qIndex];
            const normalizedExpectedList = Array.isArray(expectedList) ? expectedList : [expectedList];

            normalizedExpectedList.forEach((expected, inputIndex) => {
                const input = document.querySelector(`.blank-input-inline[data-q-index="${qIndex}"][data-input-index="${inputIndex}"]`);
                const userValue = input ? input.value.trim() : '';
                const ok = isCorrect(userValue, expected);

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

                const status = ok ? 'OK' : 'X';
                rows.push(
                    feedbackRow(
                        ok ? 'ok' : 'bad',
                        `${status} Yozma mashq ${qIndex + 1}.${inputIndex + 1} - To'g'ri javob: <strong>${expected}</strong>`
                    )
                );
            });
        });

        return rows;
    }

    function renderGlobalFeedback(rows) {
        const feedback = document.getElementById('globalFeedback');
        if (!feedback) {
            return;
        }

        if (!rows.length) {
            feedback.innerHTML = '<div class="feedback-empty">Tekshirish uchun mashqlar topilmadi.</div>';
            feedback.classList.add('show');
            return;
        }

        feedback.innerHTML = `
            <div class="global-feedback-title">Umumiy natija (barcha mashqlar)</div>
            ${rows.join('')}
        `;
        feedback.classList.add('show');
    }

    function pickAnchor() {
        return (
            document.getElementById('topic5PracticeSection') ||
            document.getElementById('topic4FillExercise') ||
            document.getElementById('extraExercises') ||
            document.getElementById('matchingGameA1') ||
            document.getElementById('matchingGame') ||
            document.querySelector('.matching-game-container:last-of-type') ||
            document.querySelector('.blank-section:last-of-type') ||
            document.querySelector('.quiz-section:last-of-type') ||
            document.getElementById('quizSection') ||
            document.getElementById('lessonContent')
        );
    }

    function ensureGlobalControls() {
        const anchor = pickAnchor();
        if (!anchor || !anchor.parentNode) {
            return;
        }

        let host = document.getElementById('globalCheckHost');
        if (!host) {
            host = document.createElement('div');
            host.id = 'globalCheckHost';
            host.className = 'exercise-block';
            host.innerHTML = `
                <button id="checkAllAnswersBtn" class="primary-btn" type="button">Javoblarni tekshirish</button>
                <div id="globalFeedback"></div>
            `;

            const btn = host.querySelector('#checkAllAnswersBtn');
            if (btn) {
                btn.addEventListener('click', runGlobalCheck);
            }
        }

        const shouldMove = host.previousElementSibling !== anchor;
        if (shouldMove) {
            anchor.insertAdjacentElement('afterend', host);
        }
    }

    async function runGlobalCheck() {
        const rows = [];
        const topicId = getCurrentTopicId();
        const topic = getActiveTopic();

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

            rows.push(...collectMainQuizFeedback(topic));
            rows.push(...collectExtraExercisesFeedback(topic));
            rows.push(...collectTopic4Feedback(topic));
            rows.push(...collectTopic5Feedback(topic));
            rows.push(...collectMatchingFeedback(topic));
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

            const b2Topic = getActiveTopic();
            rows.push(...collectB2QuizFeedback(b2Topic));
            rows.push(...collectB2BlankFeedback(b2Topic));
            rows.push(...collectMatchingFeedback(b2Topic));
        }

        renderGlobalFeedback(rows);
    }

    function startGlobalObserver() {
        ensureGlobalControls();

        const observer = new MutationObserver(() => {
            ensureGlobalControls();
        });

        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        setInterval(ensureGlobalControls, 700);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startGlobalObserver);
    } else {
        startGlobalObserver();
    }
})();
