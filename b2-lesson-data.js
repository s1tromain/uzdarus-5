/* ============================================================================
 * b2-lesson-data.js — B2 course content, in the platform's GENERIC exercise
 * shape (the same shape A2/B1 use), so it is driven by the shared
 * Exercise Session Engine with no course-specific logic anywhere.
 *
 * Shape per topic:
 *   { id, title, description, isLocked, isSubscriptionLocked,
 *     grammar: "<html>", vocabularyCount: n,
 *     exercises: [ { id, type, style?, icon, title, intro, items:[…] } ] }
 *
 * Exercise types are the platform's existing ones only:
 *   input                       free text, `answer` may be a string or an array
 *                               of every accepted variant
 *   choice + style:"chips"      short inline options
 *   choice + style:"test"       lettered A/B/C/D options
 *   choice + style:"tf"         two-way true/false
 *   group id "audio"            carries `audioSrc`; rendered with a player
 *
 * CONTENT PROVENANCE: every prompt, option and answer key below is taken
 * verbatim from the Lesson 1 resource. Where the resource supplies an explicit
 * key (3-mashq, and the listening task) it is reproduced exactly. Where it does
 * not, keys are derived from this lesson's own grammar section and every
 * grammatically correct variant the lesson teaches is accepted.
 * ==========================================================================*/
(function (global) {
    'use strict';

    /* Conjunction sets reused across exercises — declared once, not re-typed. */
    var CONJ_6 = ['что', 'потому что', 'если', 'хотя', 'чтобы', 'когда'];
    var CAUSE_2 = ['потому что', 'поэтому'];

    var LESSON_1_EXERCISES = [
        {
            id: 'ex1', type: 'choice', style: 'chips', icon: 'fa-hand-pointer', showTask: true,
            title: "1-mashq. To'g'ri bog'lovchini tanlang",
            intro: 'Qavs ichidan mos variantni tanlang: что, потому что, если, хотя, чтобы, когда.',
            items: [
                { q: 'Я считаю, ___ образование играет важную роль в жизни человека.', options: CONJ_6, answer: 'что' },
                { q: 'Я изучаю русский язык, ___ свободно общаться с людьми.', options: CONJ_6, answer: 'чтобы' },
                { q: '___ будет хорошая погода, мы поедем за город.', options: CONJ_6, answer: 'если' },
                { q: 'Я не пошёл на работу, ___ плохо себя чувствовал.', options: CONJ_6, answer: 'потому что' },
                { q: '___ я закончу работу, я позвоню тебе.', options: CONJ_6, answer: 'когда' },
                { q: 'Мне кажется, ___ это решение неправильное.', options: CONJ_6, answer: 'что' },
                { q: '___ было поздно, мы продолжили разговор.', options: CONJ_6, answer: 'хотя' },
                { q: 'Я хочу, ___ мои дети хорошо знали русский язык.', options: CONJ_6, answer: 'чтобы' },
                { q: 'Я уверен, ___ он сможет решить эту проблему.', options: CONJ_6, answer: 'что' },
                { q: '___ ты будешь много практиковаться, твоя речь станет лучше.', options: CONJ_6, answer: 'если' }
            ]
        },
        {
            id: 'ex2', type: 'builder', icon: 'fa-link', showTask: true,
            /* Word cards are derived from `answer` automatically — the bank is the
               union of EVERY accepted variant, so any correct sentence can be built.
               These phrases must stay on one card instead of being split. */
            glue: ['несмотря на то, что', 'потому что', 'так как', 'для того чтобы'],
            title: "2-mashq. Gaplarni birlashtiring",
            intro: 'Berilgan ikki gapni что / потому что / поэтому / хотя / если / чтобы yordamida bitta gapga aylantiring.',
            items: [
                { q: 'Я считаю. Русский язык очень важен.',
                  answer: ['Я считаю, что русский язык очень важен'] },
                { q: 'Я много работаю. Я хочу купить квартиру.',
                  answer: ['Я много работаю, потому что хочу купить квартиру',
                           'Я много работаю, чтобы купить квартиру'] },
                { q: 'Он устал. Он продолжил работать.',
                  answer: ['Хотя он устал, он продолжил работать',
                           'Несмотря на то, что он устал, он продолжил работать',
                           'Он устал, но продолжил работать'] },
                { q: 'Будет свободное время. Мы встретимся.',
                  answer: ['Если будет свободное время, мы встретимся',
                           'Если будет свободное время, то мы встретимся'] },
                { q: 'Я не пришёл на встречу. Я заболел.',
                  answer: ['Я не пришёл на встречу, потому что заболел',
                           'Я не пришёл на встречу, потому что я заболел',
                           'Я заболел, поэтому не пришёл на встречу'] },
                { q: 'Я изучаю английский язык. Я хочу работать за границей.',
                  answer: ['Я изучаю английский язык, потому что хочу работать за границей',
                           'Я изучаю английский язык, чтобы работать за границей'] },
                { q: 'Она хорошо подготовилась. Она сдала экзамен.',
                  answer: ['Она хорошо подготовилась, поэтому сдала экзамен',
                           'Она сдала экзамен, потому что хорошо подготовилась'] },
                { q: 'Был сильный дождь. Мы пошли гулять.',
                  answer: ['Хотя был сильный дождь, мы пошли гулять',
                           'Несмотря на то, что был сильный дождь, мы пошли гулять'] },
                { q: 'Я думаю. Это хорошая идея.',
                  answer: ['Я думаю, что это хорошая идея'] },
                { q: 'Ты будешь регулярно заниматься. Ты быстро улучшишь свой русский.',
                  answer: ['Если ты будешь регулярно заниматься, ты быстро улучшишь свой русский',
                           'Если ты будешь регулярно заниматься, то быстро улучшишь свой русский',
                           'Если ты будешь регулярно заниматься, то ты быстро улучшишь свой русский'] }
            ]
        },
        {
            id: 'ex3', type: 'choice', style: 'test', icon: 'fa-list-check', showTask: true,
            title: "3-mashq. «Я считаю, что…»",
            intro: "To'g'ri variantni tanlang.",
            items: [
                { q: 'Я считаю, ___ изучение иностранных языков расширяет кругозор человека.',
                  options: ['что', 'чтобы', 'если', 'поэтому'], answer: 'что' },
                { q: 'Я считаю, ___ современные технологии значительно изменили нашу жизнь.',
                  options: ['хотя', 'что', 'потому что', 'чтобы'], answer: 'что' },
                { q: 'Я считаю, ___ человек должен постоянно развиваться.',
                  options: ['если', 'несмотря на то, что', 'что', 'поэтому'], answer: 'что' },
                { q: 'Я считаю, ___ удалённая работа подходит не всем людям.',
                  options: ['что', 'чтобы', 'если', 'потому что'], answer: 'что' },
                { q: 'Я считаю, ___ детям необходимо объяснять правила безопасного поведения в интернете.',
                  options: ['хотя', 'поэтому', 'что', 'если'], answer: 'что' },
                { q: 'Я считаю, ___ социальные сети могут быть полезными, если правильно ими пользоваться.',
                  options: ['чтобы', 'что', 'несмотря на то, что', 'поэтому'], answer: 'что' },
                { q: 'Я считаю, ___ выбор профессии должен зависеть не только от уровня зарплаты.',
                  options: ['потому что', 'если', 'что', 'хотя'], answer: 'что' },
                { q: 'Я считаю, ___ путешествия помогают человеку лучше понимать другие культуры.',
                  options: ['что', 'чтобы', 'поэтому', 'если'], answer: 'что' },
                { q: 'Я считаю, ___ образование должно соответствовать требованиям современного рынка труда.',
                  options: ['хотя', 'потому что', 'если', 'что'], answer: 'что' },
                { q: 'Я считаю, ___ знание нескольких языков даёт человеку больше возможностей для профессионального роста.',
                  options: ['поэтому', 'что', 'чтобы', 'несмотря на то, что'], answer: 'что' }
            ]
        },
        {
            id: 'ex4', type: 'input', icon: 'fa-code-compare', showTask: true,
            title: "4-mashq. Gaplarni «Несмотря на то, что…» yordamida birlashtiring",
            intro: 'Namuna: Было холодно. Мы пошли гулять. → Несмотря на то, что было холодно, мы пошли гулять.',
            items: [
                { q: 'Я очень устал. Я продолжил работать.',
                  answer: ['Несмотря на то, что я очень устал, я продолжил работать'] },
                { q: 'Шёл сильный дождь. Мы поехали за город.',
                  answer: ['Несмотря на то, что шёл сильный дождь, мы поехали за город'] },
                { q: 'Экзамен был сложным. Она получила высокую оценку.',
                  answer: ['Несмотря на то, что экзамен был сложным, она получила высокую оценку'] },
                { q: 'У него было мало времени. Он помог мне.',
                  answer: ['Несмотря на то, что у него было мало времени, он помог мне'] },
                { q: 'Он плохо себя чувствовал. Он пришёл на работу.',
                  answer: ['Несмотря на то, что он плохо себя чувствовал, он пришёл на работу'] },
                { q: 'Задание было трудным. Студенты выполнили его.',
                  answer: ['Несмотря на то, что задание было трудным, студенты выполнили его'] },
                { q: 'Поезд опоздал. Мы успели на встречу.',
                  answer: ['Несмотря на то, что поезд опоздал, мы успели на встречу'] },
                { q: 'Она мало готовилась. Она успешно сдала экзамен.',
                  answer: ['Несмотря на то, что она мало готовилась, она успешно сдала экзамен'] },
                { q: 'Я раньше не изучал русский язык. Я смог свободно объясниться.',
                  answer: ['Несмотря на то, что я раньше не изучал русский язык, я смог свободно объясниться'] },
                { q: 'Он был очень занят. Он нашёл время для семьи.',
                  answer: ['Несмотря на то, что он был очень занят, он нашёл время для семьи'] }
            ]
        },
        {
            id: 'ex5', type: 'input', icon: 'fa-arrow-right-arrow-left', showTask: true,
            title: "5-mashq. Gaplarni «Если…, то…» yordamida birlashtiring",
            intro: 'Namuna: Ты будешь много заниматься. Ты хорошо сдашь экзамен. → Если ты будешь много заниматься, то хорошо сдашь экзамен.',
            items: [
                { q: 'Я буду хорошо учиться. Я получу высокую оценку.',
                  answer: ['Если я буду хорошо учиться, то получу высокую оценку',
                           'Если я буду хорошо учиться, то я получу высокую оценку'] },
                { q: 'Будет хорошая погода. Мы поедем на природу.',
                  answer: ['Если будет хорошая погода, то мы поедем на природу'] },
                { q: 'Ты будешь регулярно заниматься русским языком. Ты быстро улучшишь свою речь.',
                  answer: ['Если ты будешь регулярно заниматься русским языком, то быстро улучшишь свою речь',
                           'Если ты будешь регулярно заниматься русским языком, то ты быстро улучшишь свою речь'] },
                { q: 'У меня будет свободное время. Я встречусь с друзьями.',
                  answer: ['Если у меня будет свободное время, то я встречусь с друзьями'] },
                { q: 'Человек много читает. Его словарный запас становится богаче.',
                  answer: ['Если человек много читает, то его словарный запас становится богаче'] },
                { q: 'Мы будем экономить деньги. Мы сможем купить новую машину.',
                  answer: ['Если мы будем экономить деньги, то сможем купить новую машину',
                           'Если мы будем экономить деньги, то мы сможем купить новую машину'] },
                { q: 'Ты будешь больше говорить по-русски. Ты перестанешь бояться ошибок.',
                  answer: ['Если ты будешь больше говорить по-русски, то перестанешь бояться ошибок',
                           'Если ты будешь больше говорить по-русски, то ты перестанешь бояться ошибок'] },
                { q: 'Завтра будет выходной. Мы останемся дома.',
                  answer: ['Если завтра будет выходной, то мы останемся дома'] },
                { q: 'Я получу эту работу. Я начну изучать английский язык.',
                  answer: ['Если я получу эту работу, то начну изучать английский язык',
                           'Если я получу эту работу, то я начну изучать английский язык'] },
                { q: 'Люди будут меньше пользоваться телефоном. Они будут больше общаться друг с другом.',
                  answer: ['Если люди будут меньше пользоваться телефоном, то они будут больше общаться друг с другом',
                           'Если люди будут меньше пользоваться телефоном, то будут больше общаться друг с другом'] }
            ]
        },
        {
            id: 'ex6', type: 'choice', style: 'chips', icon: 'fa-arrows-split-up-and-left', showTask: true,
            title: "6-mashq. «Потому что» yoki «поэтому»?",
            intro: 'Mos variantni tanlang. Потому что — sabab, поэтому — natija.',
            items: [
                { q: 'Я не пришёл на работу, ___ заболел.', options: CAUSE_2, answer: 'потому что' },
                { q: 'Я заболел, ___ не пришёл на работу.', options: CAUSE_2, answer: 'поэтому' },
                { q: 'Он много тренировался, ___ выиграл соревнование.', options: CAUSE_2, answer: 'поэтому' },
                { q: 'Он выиграл соревнование, ___ много тренировался.', options: CAUSE_2, answer: 'потому что' },
                { q: 'Я изучаю русский язык, ___ хочу свободно говорить.', options: CAUSE_2, answer: 'потому что' },
                { q: 'Я хочу свободно говорить по-русски, ___ изучаю язык каждый день.', options: CAUSE_2, answer: 'поэтому' },
                { q: 'Было поздно, ___ мы решили пойти домой.', options: CAUSE_2, answer: 'поэтому' },
                { q: 'Мы решили пойти домой, ___ было поздно.', options: CAUSE_2, answer: 'потому что' },
                { q: 'Она хорошо подготовилась, ___ успешно сдала экзамен.', options: CAUSE_2, answer: 'поэтому' },
                { q: 'Она успешно сдала экзамен, ___ хорошо подготовилась.', options: CAUSE_2, answer: 'потому что' }
            ]
        },
        {
            id: 'ex7', type: 'choice', style: 'test', icon: 'fa-check-double', showTask: true,
            title: "7-mashq. To'g'ri variantni tanlang",
            intro: "Har bir gap uchun to'g'ri bog'lovchini belgilang.",
            items: [
                { q: 'Я думаю, что / чтобы он прав.', options: ['что', 'чтобы'], answer: 'что' },
                { q: 'Я изучаю русский язык, что / чтобы свободно говорить.', options: ['что', 'чтобы'], answer: 'чтобы' },
                { q: 'Если / Хотя будет дождь, мы останемся дома.', options: ['Если', 'Хотя'], answer: 'Если' },
                { q: 'Хотя / Потому что он был занят, он помог мне.', options: ['Хотя', 'Потому что'], answer: 'Хотя' },
                { q: 'Я не пришёл, потому что / поэтому заболел.', options: ['потому что', 'поэтому'], answer: 'потому что' },
                { q: 'Я заболел, потому что / поэтому не пришёл.', options: ['потому что', 'поэтому'], answer: 'поэтому' },
                { q: 'Я хочу, что / чтобы ты мне помог.', options: ['что', 'чтобы'], answer: 'чтобы' },
                { q: 'Когда / Чтобы я закончу работу, я позвоню тебе.', options: ['Когда', 'Чтобы'], answer: 'Когда' },
                { q: 'Несмотря на то, что / Если было трудно, он не сдался.', options: ['Несмотря на то, что', 'Если'], answer: 'Несмотря на то, что' },
                { q: 'Мне кажется, что / чтобы это хорошая идея.', options: ['что', 'чтобы'], answer: 'что' }
            ]
        },
        {
            id: 'ex8', type: 'input', icon: 'fa-wrench', showTask: true,
            title: "8-mashq. Xatoni toping va tuzating",
            intro: "Har bir gapda grammatik xato bor. To'g'ri variantni yozing.",
            items: [
                { q: 'Я думаю, чтобы русский язык очень важный.',
                  answer: ['Я думаю, что русский язык очень важный', 'Я думаю, что русский язык очень важен'],
                  explanation: 'После «Я думаю» ставится «что», а не «чтобы».' },
                { q: 'Я изучаю русский язык, потому что свободно говорить.',
                  answer: ['Я изучаю русский язык, чтобы свободно говорить'],
                  explanation: 'Цель выражается союзом «чтобы» + инфинитив.' },
                { q: 'Если будет дождь, потому что мы останемся дома.',
                  answer: ['Если будет дождь, то мы останемся дома', 'Если будет дождь, мы останемся дома'],
                  explanation: 'После «если» следует «то», а не «потому что».' },
                { q: 'Несмотря на то, что он устал, но продолжил работать.',
                  answer: ['Несмотря на то, что он устал, он продолжил работать'],
                  explanation: '«Несмотря на то, что» и «но» не употребляются вместе.' },
                { q: 'Я хочу, что ты пришёл завтра.',
                  answer: ['Я хочу, чтобы ты пришёл завтра'],
                  explanation: 'Если действие выполняет другое лицо, нужен союз «чтобы».' },
                { q: 'Я не пришёл, поэтому был болен.',
                  answer: ['Я не пришёл, потому что был болен'],
                  explanation: '«Поэтому» вводит следствие, а здесь названа причина — нужно «потому что».' },
                { q: 'Хотя было поздно, но мы продолжили разговор.',
                  answer: ['Хотя было поздно, мы продолжили разговор'],
                  explanation: '«Хотя» и «но» не употребляются вместе.' },
                { q: 'Я считаю чтобы это правильное решение.',
                  answer: ['Я считаю, что это правильное решение'],
                  explanation: 'После «Я считаю» нужен союз «что» и запятая перед ним.' },
                { q: 'Если ты будешь заниматься, потому что улучшишь свой уровень.',
                  answer: ['Если ты будешь заниматься, то улучшишь свой уровень',
                           'Если ты будешь заниматься, ты улучшишь свой уровень'],
                  explanation: 'После «если» следует «то», а не «потому что».' },
                { q: 'Я не пошёл гулять, чтобы было холодно.',
                  answer: ['Я не пошёл гулять, потому что было холодно'],
                  explanation: 'Здесь названа причина, а не цель — нужно «потому что».' }
            ]
        },
        {
            id: 'ex9', type: 'input', icon: 'fa-diagram-project', showTask: true,
            title: "9-mashq. Fikrni bog'lang",
            intro: "Quyidagi ikkita sodda gapni mos bog'lovchi yordamida bitta murakkab gapga aylantiring.",
            items: [
                { q: 'Изучение языков полезно. Они развивают память.',
                  answer: ['Изучение языков полезно, потому что оно развивает память',
                           'Изучение языков полезно, потому что они развивают память',
                           'Изучение языков полезно, потому что языки развивают память'] },
                { q: 'Он много работал. Он хотел добиться успеха.',
                  answer: ['Он много работал, потому что хотел добиться успеха',
                           'Он много работал, чтобы добиться успеха'] },
                { q: 'Было холодно. Мы пошли гулять.',
                  answer: ['Хотя было холодно, мы пошли гулять',
                           'Несмотря на то, что было холодно, мы пошли гулять'] },
                { q: 'Она хорошо подготовилась. Она успешно сдала экзамен.',
                  answer: ['Она хорошо подготовилась, поэтому успешно сдала экзамен',
                           'Она успешно сдала экзамен, потому что хорошо подготовилась'] },
                { q: 'Я хочу путешествовать. Я хочу увидеть разные страны.',
                  answer: ['Я хочу путешествовать, потому что хочу увидеть разные страны',
                           'Я хочу путешествовать, чтобы увидеть разные страны'] },
                { q: 'У меня мало времени. Я каждый день читаю.',
                  answer: ['Хотя у меня мало времени, я каждый день читаю',
                           'Несмотря на то, что у меня мало времени, я каждый день читаю'] },
                { q: 'Ты будешь много говорить. Ты быстрее научишься.',
                  answer: ['Если ты будешь много говорить, то быстрее научишься',
                           'Если ты будешь много говорить, ты быстрее научишься',
                           'Если ты будешь много говорить, то ты быстрее научишься'] },
                { q: 'Он не пришёл. Он плохо себя чувствовал.',
                  answer: ['Он не пришёл, потому что плохо себя чувствовал',
                           'Он плохо себя чувствовал, поэтому не пришёл'] },
                { q: 'Я думаю. Интернет имеет много преимуществ.',
                  answer: ['Я думаю, что интернет имеет много преимуществ'] },
                { q: 'Она устала. Она закончила работу.',
                  answer: ['Она устала, потому что закончила работу',
                           'Она закончила работу, поэтому устала',
                           'Хотя она устала, она закончила работу',
                           'Несмотря на то, что она устала, она закончила работу'] }
            ]
        },
        {
            id: 'audio', type: 'choice', style: 'tf', icon: 'fa-headphones', showTask: true,
            audioSrc: 'audios/%D0%912%201%20%D1%83%D1%80%D0%BE%D0%BA.mp3',
            title: "Matn bo'yicha «Rost yoki yolg'on» mashqi",
            intro: "«Работа и личная жизнь» audio matnini tinglang va gaplar rost (Верно) yoki yolg'on (Неверно) ekanini aniqlang.",
            items: [
                { q: 'Многие люди хотят построить успешную карьеру, потому что считают работу важной для финансовой стабильности.',
                  options: ['Верно', 'Неверно'], answer: 'Верно' },
                { q: "Muallifning fikricha, inson faqat ish haqida o'ylashi kerak.",
                  options: ['Верно', 'Неверно'], answer: 'Неверно' },
                { q: 'Современному человеку важно находить баланс между работой и личной жизнью.',
                  options: ['Верно', 'Неверно'], answer: 'Верно' },
                { q: "Agar inson doimo ishlasa va dam olmasa, uning ishiga bo'lgan qiziqishi kamayishi mumkin.",
                  options: ['Верно', 'Неверно'], answer: 'Верно' },
                { q: "Muallifning fikricha, masofaviy ishning hech qanday afzalligi yo'q.",
                  options: ['Верно', 'Неверно'], answer: 'Неверно' },
                { q: 'При правильном планировании времени человек может успевать выполнять рабочие задачи и проводить больше времени с семьёй.',
                  options: ['Верно', 'Неверно'], answer: 'Верно' },
                { q: 'Работа из дома подходит абсолютно всем людям.',
                  options: ['Верно', 'Неверно'], answer: 'Неверно' },
                { q: "Uyda ishlaydigan odam ba'zan diqqatini jamlashda qiynalishi mumkin.",
                  options: ['Верно', 'Неверно'], answer: 'Верно' },
                { q: "Muallif vaqtni to'g'ri taqsimlashni muhim deb hisoblaydi.",
                  options: ['Верно', 'Неверно'], answer: 'Верно' },
                { q: "Agar inson ustuvorliklarni to'g'ri belgilasa, u kasbiy rivojlanish bilan birga yaqinlariga ham vaqt ajrata oladi.",
                  options: ['Верно', 'Неверно'], answer: 'Верно' }
            ]
        }
    ];

    /* ------------------------------------------------------------------
     * LESSON 1 GRAMMAR — Сложноподчинённые предложения.
     *
     * A full lesson, not a note: what the construction is, when it is used,
     * the schema, the conjunction tables, worked examples, the traps that
     * actually cost B2 learners marks, and a short checklist. It covers
     * exactly the conjunctions the ten exercises test — что, чтобы, если,
     * когда, потому что, поэтому, хотя, несмотря на то что — and nothing
     * the learner is not asked to produce.
     * ------------------------------------------------------------------ */
    var LESSON_1_GRAMMAR = [
        '<div class="b2g">',

        '<div class="b2g-lead">',
            '<h4>Sложноподчинённое предложение nima?</h4>',
            '<p>Bu — <b>bosh gap</b> (главное предложение) va <b>ergash gap</b> (придаточное ',
            'предложение) <b>bog‘lovchi</b> (союз) orqali birlashgan qo‘shma gap. Ergash gap ',
            'mustaqil emas: u bosh gapga tobe bo‘lib, uni izohlaydi, sababini, shartini yoki ',
            'maqsadini ko‘rsatadi.</p>',
            '<div class="b2g-scheme">',
                '<span class="b2g-main">Я считаю</span>',
                '<span class="b2g-link">, что </span>',
                '<span class="b2g-sub">образование меняет жизнь</span>',
            '</div>',
            '<p class="b2g-scheme-note"><b>Sxema:</b> [bosh gap] <b>,</b> + bog‘lovchi + [ergash gap]. ',
            'Vergul har doim bog‘lovchidan <b>oldin</b> qo‘yiladi.</p>',
        '</div>',

        '<h4>1. Bog‘lovchilar jadvali</h4>',
        '<p>B2 darajasida quyidagi sakkiz bog‘lovchi asosiy hisoblanadi. Har birining o‘z ',
        'ma‘nosi va o‘z savoli bor — bog‘lovchini savol orqali tanlang.</p>',
        '<table class="b2g-t">',
            '<tr><th>Bog‘lovchi</th><th>Ma‘nosi</th><th>Savol</th><th>Misol</th></tr>',
            '<tr><td><b>что</b></td><td>izoh, faktni yetkazish</td><td>что?</td>',
                '<td>Я думаю, <b>что</b> он прав.</td></tr>',
            '<tr><td><b>чтобы</b></td><td>maqsad</td><td>зачем? с какой целью?</td>',
                '<td>Я учусь, <b>чтобы</b> найти работу.</td></tr>',
            '<tr><td><b>если</b></td><td>shart</td><td>при каком условии?</td>',
                '<td><b>Если</b> будет время, я приду.</td></tr>',
            '<tr><td><b>когда</b></td><td>vaqt</td><td>когда?</td>',
                '<td><b>Когда</b> я вернулся, все спали.</td></tr>',
            '<tr><td><b>потому что</b></td><td>sabab</td><td>почему?</td>',
                '<td>Я устал, <b>потому что</b> много работал.</td></tr>',
            '<tr><td><b>поэтому</b></td><td>natija</td><td>что из этого следует?</td>',
                '<td>Я много работал, <b>поэтому</b> устал.</td></tr>',
            '<tr><td><b>хотя</b></td><td>qarama-qarshilik</td><td>несмотря на что?</td>',
                '<td><b>Хотя</b> было трудно, я не сдался.</td></tr>',
            '<tr><td><b>несмотря на то, что</b></td><td>kuchli qarama-qarshilik</td>',
                '<td>несмотря на что?</td><td><b>Несмотря на то, что</b> шёл дождь, мы пошли.</td></tr>',
        '</table>',

        '<h4>2. «Потому что» va «поэтому» — eng ko‘p xato qilinadigan juftlik</h4>',
        '<p>Ikkalasi ham sabab-natija bilan bog‘liq, lekin ular <b>qarama-qarshi tomonga</b> ',
        'ishlaydi. Bitta qoidani yodda tuting:</p>',
        '<div class="b2g-split">',
            '<div class="b2g-half">',
                '<b>потому что</b> &rarr; SABAB',
                '<p>Undan keyin <u>sabab</u> keladi.</p>',
                '<p class="b2g-ex">Я опоздал, <b>потому что</b> <i>был пробка</i>.<br>',
                '<small>natija &larr; sabab</small></p>',
            '</div>',
            '<div class="b2g-half">',
                '<b>поэтому</b> &rarr; NATIJA',
                '<p>Undan keyin <u>natija</u> keladi.</p>',
                '<p class="b2g-ex">Была пробка, <b>поэтому</b> <i>я опоздал</i>.<br>',
                '<small>sabab &rarr; natija</small></p>',
            '</div>',
        '</div>',
        '<p class="b2g-tip"><b>Tekshirish usuli:</b> gapni «почему?» savoliga javob bering. ',
        'Agar javob bog‘lovchidan keyin turgan bo‘lsa — <b>потому что</b>. Agar oldin turgan ',
        'bo‘lsa — <b>поэтому</b>.</p>',

        '<h4>3. «Что» va «чтобы» — faktmi yoki maqsadmi?</h4>',
        '<table class="b2g-t">',
            '<tr><th>Mezon</th><th>что</th><th>чтобы</th></tr>',
            '<tr><td>Ma‘no</td><td>fakt, haqiqat</td><td>maqsad, xohish, talab</td></tr>',
            '<tr><td>Fe‘l shakli</td><td>istalgan zamon</td><td>faqat <b>o‘tgan zamon</b> yoki ',
                '<b>infinitiv</b></td></tr>',
            '<tr><td>Misol</td><td>Я знаю, <b>что</b> он <u>придёт</u>.</td>',
                '<td>Я хочу, <b>чтобы</b> он <u>пришёл</u>.</td></tr>',
        '</table>',
        '<p class="b2g-warn"><b>Diqqat!</b> «Чтобы» dan keyin hech qachon hozirgi yoki kelasi ',
        'zamon ishlatilmaydi. <s>Я хочу, чтобы он придёт</s> &rarr; ',
        '<b>Я хочу, чтобы он пришёл.</b></p>',

        '<h4>4. «Если..., то...» — shart konstruksiyasi</h4>',
        '<p>Ergash gap birinchi kelganda, bosh gapni <b>то</b> bilan boshlash mumkin. Bu ',
        'konstruksiya fikrni aniq va rasmiy qiladi.</p>',
        '<div class="b2g-scheme">',
            '<span class="b2g-link">Если </span>',
            '<span class="b2g-sub">человек много читает</span>',
            '<span class="b2g-link">, то </span>',
            '<span class="b2g-main">его словарный запас растёт</span>',
        '</div>',
        '<ul class="b2g-list">',
            '<li><b>Если</b> вы согласны, <b>то</b> начнём. — <i>то</i> ixtiyoriy, lekin uslubni yaxshilaydi.</li>',
            '<li>Bosh gap birinchi kelsa, <b>то</b> ishlatilmaydi: Начнём, <b>если</b> вы согласны.</li>',
        '</ul>',

        '<h4>5. «Хотя» va «несмотря на то, что» — kutilmagan natija</h4>',
        '<p>Ikkalasi ham «kutilgan narsa bo‘lmadi» ma‘nosini beradi. Farqi — uslubda:</p>',
        '<table class="b2g-t">',
            '<tr><th>Konstruksiya</th><th>Uslub</th><th>Misol</th></tr>',
            '<tr><td><b>хотя</b></td><td>neytral, kundalik</td>',
                '<td><b>Хотя</b> он молод, он опытный специалист.</td></tr>',
            '<tr><td><b>несмотря на то, что</b></td><td>rasmiy, yozma</td>',
                '<td><b>Несмотря на то, что</b> он молод, он опытный специалист.</td></tr>',
            '<tr><td><b>несмотря на</b> + ot</td><td>eng ixcham</td>',
                '<td><b>Несмотря на</b> молодость, он опытный специалист.</td></tr>',
        '</table>',
        '<p class="b2g-warn"><b>Vergulga e‘tibor bering:</b> «несмотря на то<b>,</b> что» ',
        'ichida ham vergul bor. Bu — eng ko‘p unutiladigan vergul.</p>',

        '<h4>6. Vergul qoidalari — qisqacha</h4>',
        '<ul class="b2g-list">',
            '<li>Ergash gap bosh gapdan <b>har doim</b> vergul bilan ajratiladi.</li>',
            '<li>Ergash gap o‘rtada bo‘lsa — <b>ikki tomondan</b> vergul: ',
                'Книга, <b>которую</b> я купил, оказалась интересной.</li>',
            '<li>Murakkab bog‘lovchilarda vergul ichkarida: несмотря на то<b>,</b> что; ',
                'в связи с тем<b>,</b> что; для того<b>,</b> чтобы.</li>',
        '</ul>',

        '<h4>7. Tez-tez uchraydigan xatolar</h4>',
        '<table class="b2g-t b2g-err">',
            '<tr><th>Xato</th><th>To‘g‘ri</th><th>Nima uchun</th></tr>',
            '<tr><td>Я думаю <s>что</s> он прав</td><td>Я думаю<b>,</b> что он прав</td>',
                '<td>bog‘lovchidan oldin vergul tushib qolgan</td></tr>',
            '<tr><td>Я хочу, чтобы он <s>придёт</s></td><td>Я хочу, чтобы он <b>пришёл</b></td>',
                '<td>«чтобы» + o‘tgan zamon</td></tr>',
            '<tr><td>Была пробка, <s>потому что</s> я опоздал</td>',
                '<td>Была пробка, <b>поэтому</b> я опоздал</td>',
                '<td>sabab va natija o‘rni almashgan</td></tr>',
            '<tr><td>Несмотря на то <s>что</s> шёл дождь</td>',
                '<td>Несмотря на то<b>,</b> что шёл дождь</td>',
                '<td>murakkab bog‘lovchi ichidagi vergul</td></tr>',
            '<tr><td><s>Если</s> он придёт, я буду рад <s>бы</s></td>',
                '<td>Если он придёт, я буду рад</td>',
                '<td>real shartda «бы» ishlatilmaydi</td></tr>',
        '</table>',

        '<h4>8. Nutqingizni B2 darajasiga ko‘taradigan iboralar</h4>',
        '<div class="b2g-chips">',
            '<span>Я убеждён, что...</span><span>С моей точки зрения,...</span>',
            '<span>Дело в том, что...</span><span>Это объясняется тем, что...</span>',
            '<span>Несмотря на то, что...</span><span>При условии, что...</span>',
            '<span>В то время как...</span><span>Таким образом,...</span>',
        '</div>',

        '<div class="b2g-check">',
            '<h4>Yozishdan oldin o‘zingizni tekshiring</h4>',
            '<ul class="b2g-list">',
                '<li>Bog‘lovchidan oldin vergul qo‘ydimmi?</li>',
                '<li>«Чтобы» dan keyin o‘tgan zamon yoki infinitiv turibdimi?</li>',
                '<li>«Потому что» va «поэтому» ni almashtirib yubormadimmi?</li>',
                '<li>«Несмотря на то, что» ichidagi vergul joyidami?</li>',
                '<li>Bir gapda uchtadan ortiq ergash gap yo‘qmi? (Ko‘p bo‘lsa — bo‘ling.)</li>',
            '</ul>',
        '</div>',

        '</div>'
    ].join('');

    /* ======================================================================
     * LESSON 2 — Причастие (sifatdosh)
     * Authored strictly from the supplied lesson material. Where the material
     * did not print an answer key, the key is the form its own paradigms
     * determine; nothing outside the material was introduced.
     * ==================================================================== */
    var DS_2 = ['Д', 'С'];

    var LESSON_2_GRAMMAR = [
        '<div class="b2g">',
        '<div class="b2g-lead">',
            '<div class="b2g-lead-title">Причастие (sifatdosh)</div>',
            '<p>Причастие — fe’l va sifat xususiyatlarini birlashtirgan so‘z turkumi. ',
            'U harakatni bajarayotgan yoki harakat ta’siriga uchragan predmet/shaxsning belgisini bildiradi.</p>',
            '<p><b>Oddiy qilib:</b> Кто? Что? + что делает / что сделал? → qanday odam/narsa?</p>',
        '</div>',

        '<table class="b2g-t"><tr><th>Gap</th><th>Причастие bilan</th><th>Tarjima</th></tr>',
            '<tr><td>человек работает</td><td>работающий человек</td><td>ishlayotgan odam</td></tr>',
            '<tr><td>книга написана</td><td>написанная книга</td><td>yozilgan kitob</td></tr>',
            '<tr><td>девушка улыбается</td><td>улыбающаяся девушка</td><td>kulayotgan qiz</td></tr>',
        '</table>',

        '<h4>1. Действительное причастие</h4>',
        '<p>Harakatni o‘zi bajarayotgan shaxs yoki predmetni bildiradi. ',
        'Hozirgi zamon qo‘shimchalari: <b>-ущий / -ющий</b>, <b>-ащий / -ящий</b>.</p>',
        '<table class="b2g-t"><tr><th>Fe’l</th><th>Причастие</th><th>Tarjima</th></tr>',
            '<tr><td>читать</td><td>читающий</td><td>o‘qiyotgan</td></tr>',
            '<tr><td>работать</td><td>работающий</td><td>ishlayotgan</td></tr>',
            '<tr><td>говорить</td><td>говорящий</td><td>gapirayotgan</td></tr>',
            '<tr><td>любить</td><td>любящий</td><td>sevadigan</td></tr>',
        '</table>',
        '<div class="b2g-chips">',
            '<span>человек, работающий в школе</span>',
            '<span>девушка, говорящая по-русски</span>',
            '<span>студенты, изучающие язык</span>',
        '</div>',

        '<h4>2. Страдательное причастие</h4>',
        '<p>Harakatni o‘zi bajarmaydi, balki unga harakat amalga oshirilgan bo‘ladi. ',
        'Ko‘pincha <b>-нный, -енный, -анный, -тый</b> qo‘shimchalari ishlatiladi.</p>',
        '<table class="b2g-t"><tr><th>Fe’l</th><th>Причастие</th><th>Tarjima</th></tr>',
            '<tr><td>написать</td><td>написанный</td><td>yozilgan</td></tr>',
            '<tr><td>прочитать</td><td>прочитанный</td><td>o‘qilgan</td></tr>',
            '<tr><td>сделать</td><td>сделанный</td><td>qilingan</td></tr>',
            '<tr><td>купить</td><td>купленный</td><td>sotib olingan</td></tr>',
            '<tr><td>открыть</td><td>открытый</td><td>ochilgan</td></tr>',
        '</table>',
        '<div class="b2g-chips">',
            '<span>книга, написанная известным автором</span>',
            '<span>дом, построенный в прошлом году</span>',
            '<span>фильм, снятый в России</span>',
        '</div>',

        '<h4>3. Причастный оборот</h4>',
        '<p>Причастие boshqa so‘zlar bilan birga kelib, <b>причастный оборот</b> hosil qiladi: ',
        'причастие + unga bog‘langan so‘zlar.</p>',
        '<div class="b2g-chips">',
            '<span>работающий в нашей школе учитель</span>',
            '<span>книга, написанная известным писателем</span>',
            '<span>девушка, сидящая у окна</span>',
        '</div>',

        '<h4>4. Vergul qo‘yilishi</h4>',
        '<p>Agar причастный оборот <b>otdan keyin</b> kelsa, odatda vergul bilan ajratiladi:</p>',
        '<table class="b2g-t"><tr><th>Gap</th><th>Tarjima</th></tr>',
            '<tr><td>Учитель, работающий в нашей школе, очень опытный.</td>',
                '<td>Bizning maktabimizda ishlaydigan o‘qituvchi juda tajribali.</td></tr>',
            '<tr><td>Книга, написанная этим автором, стала популярной.</td>',
                '<td>Bu muallif tomonidan yozilgan kitob mashhur bo‘ldi.</td></tr>',
        '</table>',
        '<p>Lekin otning <b>oldidan</b> kelsa, odatda vergul qo‘yilmaydi:</p>',
        '<div class="b2g-chips">',
            '<span>Работающий в нашей школе учитель очень опытный.</span>',
            '<span>Написанная этим автором книга стала популярной.</span>',
        '</div>',

        '<h4>5. Odam, joy va narsalarni batafsil tasvirlash</h4>',
        '<table class="b2g-t"><tr><th>Nima</th><th>Namuna</th><th>Tarjima</th></tr>',
            '<tr><td>Odam</td><td>мужчина, стоящий у двери</td><td>eshik oldida turgan erkak</td></tr>',
            '<tr><td>Odam</td><td>девушка, читающая книгу</td><td>kitob o‘qiyotgan qiz</td></tr>',
            '<tr><td>Joy</td><td>парк, расположенный в центре города</td><td>shahar markazida joylashgan park</td></tr>',
            '<tr><td>Joy</td><td>дом, построенный в XIX веке</td><td>XIX asrda qurilgan uy</td></tr>',
            '<tr><td>Narsa</td><td>книга, написанная известным автором</td><td>mashhur muallif yozgan kitob</td></tr>',
            '<tr><td>Narsa</td><td>телефон, купленный вчера</td><td>kecha sotib olingan telefon</td></tr>',
        '</table>',
        '<p><b>Asosiy formula:</b> ОТ + ПРИЧАСТИЕ + QO‘SHIMCHA MA’LUMOT</p>',
        '<div class="b2g-chips">',
            '<span>человек, работающий в банке</span>',
            '<span>книга, написанная на русском языке</span>',
            '<span>дом, построенный рядом с парком</span>',
        '</div>',
        '<p>Shu konstruksiya yordamida «Это человек. Он работает в банке» kabi ikkita gapni ',
        'bitta B2 darajadagi «Это человек, работающий в банке» gapiga aylantirish mumkin.</p>',

        '<h4>6. Причастие — падеж shakllari</h4>',
        '<p>Причастие sifat kabi ot bilan <b>rod, son va падеж</b>da moslashadi.</p>',

        '<p><b>Мужской род</b> — работающий студент</p>',
        '<table class="b2g-t"><tr><th>Падеж</th><th>Savol</th><th>Shakli</th></tr>',
            '<tr><td>И.п.</td><td>какой?</td><td>работающий студент</td></tr>',
            '<tr><td>Р.п.</td><td>какого?</td><td>работающего студента</td></tr>',
            '<tr><td>Д.п.</td><td>какому?</td><td>работающему студенту</td></tr>',
            '<tr><td>В.п.</td><td>какого?</td><td>работающего студента</td></tr>',
            '<tr><td>Т.п.</td><td>каким?</td><td>работающим студентом</td></tr>',
            '<tr><td>П.п.</td><td>о каком?</td><td>о работающем студенте</td></tr>',
        '</table>',

        '<p><b>Женский род</b> — работающая девушка</p>',
        '<table class="b2g-t"><tr><th>Падеж</th><th>Savol</th><th>Shakli</th></tr>',
            '<tr><td>И.п.</td><td>какая?</td><td>работающая девушка</td></tr>',
            '<tr><td>Р.п.</td><td>какой?</td><td>работающей девушки</td></tr>',
            '<tr><td>Д.п.</td><td>какой?</td><td>работающей девушке</td></tr>',
            '<tr><td>В.п.</td><td>какую?</td><td>работающую девушку</td></tr>',
            '<tr><td>Т.п.</td><td>какой?</td><td>работающей девушкой</td></tr>',
            '<tr><td>П.п.</td><td>о какой?</td><td>о работающей девушке</td></tr>',
        '</table>',

        '<p><b>Средний род</b> — написанное письмо</p>',
        '<table class="b2g-t"><tr><th>Падеж</th><th>Savol</th><th>Shakli</th></tr>',
            '<tr><td>И.п.</td><td>какое?</td><td>написанное письмо</td></tr>',
            '<tr><td>Р.п.</td><td>какого?</td><td>написанного письма</td></tr>',
            '<tr><td>Д.п.</td><td>какому?</td><td>написанному письму</td></tr>',
            '<tr><td>В.п.</td><td>какое?</td><td>написанное письмо</td></tr>',
            '<tr><td>Т.п.</td><td>каким?</td><td>написанным письмом</td></tr>',
            '<tr><td>П.п.</td><td>о каком?</td><td>о написанном письме</td></tr>',
        '</table>',

        '<p><b>Множественное число</b> — работающие студенты</p>',
        '<table class="b2g-t"><tr><th>Падеж</th><th>Savol</th><th>Shakli</th></tr>',
            '<tr><td>И.п.</td><td>какие?</td><td>работающие студенты</td></tr>',
            '<tr><td>Р.п.</td><td>каких?</td><td>работающих студентов</td></tr>',
            '<tr><td>Д.п.</td><td>каким?</td><td>работающим студентам</td></tr>',
            '<tr><td>В.п.</td><td>каких?</td><td>работающих студентов</td></tr>',
            '<tr><td>Т.п.</td><td>какими?</td><td>работающими студентами</td></tr>',
            '<tr><td>П.п.</td><td>о каких?</td><td>о работающих студентах</td></tr>',
        '</table>',

        '<div class="b2g-check">',
            '<h4>Eng muhim qoida</h4>',
            '<ul class="b2g-list">',
                '<li>Причастие + существительное = bir xil <b>род + число + падеж</b>.</li>',
                '<li>читающий студент → нет читающего студента → помочь читающему студенту</li>',
                '<li>вижу читающего студента → с читающим студентом → о читающем студенте</li>',
                '<li>Faqat причастиени emas, uning ot bilan birga qanday o‘zgarishini yodlang.</li>',
            '</ul>',
        '</div>',

        '</div>'
    ].join('');

    var LESSON_2_EXERCISES = [
        {
            id: 'ex1', type: 'input', icon: 'fa-pen', showTask: true,
            title: "1-mashq. To'g'ri причастие shaklini tanlang",
            intro: "Qavs ichidagi fe'ldan mos причастieni yasang va uni otga mos rod, son va kelishikda qo'ying.",
            namuna: 'Это студент, ______ в университете. (учиться) → учащийся',
            items: [
                { q: 'Это студент, ______ в университете. (учиться)', answer: 'учащийся' },
                { q: 'Я увидел девушку, ______ на остановке. (стоять)', answer: 'стоящую' },
                { q: 'Нам понравился фильм, ______ известным режиссёром. (снять)', answer: 'снятый' },
                { q: 'Это дом, ______ в прошлом году. (построить)', answer: 'построенный' },
                { q: 'Он познакомился с человеком, ______ пятью языками. (владеть)', answer: 'владеющим' },
                { q: 'Мы посетили музей, ______ в центре города. (находиться)', answer: 'находящийся' },
                { q: 'Я прочитал статью, ______ известным журналистом. (написать)', answer: 'написанную' },
                { q: 'Она купила платье, ______ из натурального материала. (сделать)', answer: 'сделанное' },
                { q: 'Я заметил мальчика, ______ около двери. (сидеть)', answer: 'сидящего' },
                { q: 'Это книга, ______ на русский язык. (перевести)', answer: ['переведённая', 'переведенная'] }
            ]
        },
        {
            id: 'ex2', type: 'input', icon: 'fa-arrow-right-arrow-left', showTask: true,
            title: "2-mashq. Fe'lni причастиеga aylantiring",
            intro: "1–5: действительное причастие (harakatni o'zi bajarayotgan). 6–10: страдательное причастие (harakat predmetga nisbatan bajarilgan).",
            namuna: 'работать → работающий; построить → построенный',
            items: [
                { q: 'работать →', answer: 'работающий' },
                { q: 'читать →', answer: 'читающий' },
                { q: 'говорить →', answer: 'говорящий' },
                { q: 'писать →', answer: 'пишущий' },
                { q: 'изучать →', answer: 'изучающий' },
                { q: 'построить →', answer: 'построенный' },
                { q: 'написать →', answer: 'написанный' },
                { q: 'купить →', answer: 'купленный' },
                { q: 'приготовить →', answer: 'приготовленный' },
                { q: 'открыть →', answer: 'открытый' }
            ]
        },
        {
            id: 'ex3', type: 'input', icon: 'fa-code-merge', showTask: true,
            title: '3-mashq. Ikki gapni bitta gapga birlashtiring',
            intro: "Ikkinchi gapni причастный оборотga aylantirib, birinchi gapga qo'shing. Qavs ichidagi kelishikka e'tibor bering.",
            namuna: 'Это девушка. Она работает в нашей компании. → Это девушка, работающая в нашей компании. (И.п.)',
            items: [
                { q: 'Это студент. Он изучает русский язык. (И.п.) → Это студент, ...', answer: 'изучающий русский язык' },
                { q: 'Я увидел женщину. Она разговаривала по телефону. (В.п.) → Я увидел женщину, ...',
                  answer: ['разговаривавшую по телефону', 'разговаривающую по телефону'] },
                { q: 'Мы встретили человека. Он хорошо знает Москву. (В.п.) → Мы встретили человека, ...',
                  answer: ['хорошо знающего Москву', 'знающего Москву'] },
                { q: 'Это книга. Её написал известный писатель. (И.п.) → Это книга, ...', answer: 'написанная известным писателем' },
                { q: 'Я посмотрел фильм. Его сняли в 2025 году. (В.п.) → Я посмотрел фильм, ...', answer: 'снятый в 2025 году' },
                { q: 'Это дом. Его построили недавно. (И.п.) → Это дом, ...', answer: 'построенный недавно' },
                { q: 'Мы посетили музей. Он находится в центре города. (В.п.) → Мы посетили музей, ...',
                  answer: ['находящийся в центре города', 'расположенный в центре города'] },
                { q: 'Она купила телефон. Его произвели в Корее. (В.п.) → Она купила телефон, ...',
                  answer: ['произведённый в Корее', 'произведенный в Корее'] },
                { q: 'Я увидел мальчика. Он играл во дворе. (В.п.) → Я увидел мальчика, ...',
                  answer: ['игравшего во дворе', 'играющего во дворе'] },
                { q: 'Это ресторан. Его открыли несколько лет назад. (И.п.) → Это ресторан, ...', answer: 'открытый несколько лет назад' }
            ]
        },
        {
            id: 'ex4', type: 'choice', style: 'chips', icon: 'fa-list-check', showTask: true,
            title: '4-mashq. Действительное yoki страдательное причастие?',
            intro: "Har bir причастие turini aniqlang: Д — действительное, С — страдательное.",
            namuna: 'работающий → Д (harakatni shaxsning o‘zi bajaryapti: человек работает → работающий человек)',
            items: [
                { q: 'Работающий', options: DS_2, answer: 'Д' },
                { q: 'Написанный', options: DS_2, answer: 'С' },
                { q: 'Читающий', options: DS_2, answer: 'Д' },
                { q: 'Построенный', options: DS_2, answer: 'С' },
                { q: 'Говорящий', options: DS_2, answer: 'Д' },
                { q: 'Приготовленный', options: DS_2, answer: 'С' },
                { q: 'Изучающий', options: DS_2, answer: 'Д' },
                { q: 'Купленный', options: DS_2, answer: 'С' },
                { q: 'Живущий', options: DS_2, answer: 'Д' },
                { q: 'Открытый', options: DS_2, answer: 'С' }
            ]
        },
        {
            id: 'ex5', type: 'choice', style: 'test', icon: 'fa-check-double', showTask: true,
            title: "5-mashq. Kerakli qo'shimchani tanlang",
            intro: "So'zga mos keladigan причастие qo'shimchasini tanlang.",
            items: [
                { q: 'чита__ человек', options: ['-ющий', '-анный'], answer: '-ющий' },
                { q: 'написа__ письмо', options: ['-ющий', '-нное'], answer: '-нное' },
                { q: 'работа__ студент', options: ['-ющий', '-анный'], answer: '-ющий' },
                { q: 'постро__ дом', options: ['-енный', '-ющий'], answer: '-енный' },
                { q: 'говор__ девушка', options: ['-ящая', '-анная'], answer: '-ящая' },
                { q: 'купл__ телефон', options: ['-енный', '-ющий'], answer: '-енный' },
                { q: 'изуча__ язык студент', options: ['-ющий', '-анный'], answer: '-ющий' },
                { q: 'приготовл__ еда', options: ['-енная', '-ющая'], answer: '-енная' },
                { q: 'жив__ рядом человек', options: ['-ущий', '-енный'], answer: '-ущий' },
                { q: 'перевед__ статья', options: ['-ённая', '-ющая'], answer: '-ённая' }
            ]
        },
        {
            id: 'ex6', type: 'input', icon: 'fa-magnifying-glass', showTask: true,
            title: '6-mashq. Причастный оборотni toping',
            intro: "Har bir gapdagi причастный оборотni topib yozing.",
            namuna: 'Девушка, сидящая у окна, читала книгу. → сидящая у окна',
            items: [
                { q: 'Девушка, сидящая у окна, читала книгу.', answer: 'сидящая у окна' },
                { q: 'Мы купили продукты, необходимые для ужина.', answer: 'необходимые для ужина' },
                { q: 'Дом, построенный сто лет назад, сохранился до наших дней.', answer: 'построенный сто лет назад' },
                { q: 'Я поговорил со студентом, изучающим китайский язык.', answer: 'изучающим китайский язык' },
                { q: 'На столе лежало письмо, написанное от руки.', answer: 'написанное от руки' },
                { q: 'Туристы посетили музей, расположенный в центре города.', answer: 'расположенный в центре города' },
                { q: 'Мужчина, стоящий возле машины, оказался нашим соседом.', answer: 'стоящий возле машины' },
                { q: 'Мы посмотрели фильм, получивший несколько наград.', answer: 'получивший несколько наград' },
                { q: 'В комнате находились дети, играющие в настольную игру.', answer: 'играющие в настольную игру' },
                { q: 'Я прочитал статью, опубликованную вчера.', answer: 'опубликованную вчера' }
            ]
        },
        {
            id: 'ex7', type: 'input', icon: 'fa-comment-dots', showTask: true,
            title: "7-mashq. Vergullarni to'g'ri qo'ying",
            intro: "Gapni vergullar bilan to'liq ko'chirib yozing. Причастный оборот otdan keyin kelsa, vergul bilan ajratiladi.",
            namuna: 'Девушка сидящая у окна читает книгу. → Девушка, сидящая у окна, читает книгу.',
            items: [
                { q: 'Девушка сидящая у окна читает книгу.', answer: 'Девушка, сидящая у окна, читает книгу.' },
                { q: 'Книга написанная известным автором стала популярной.', answer: 'Книга, написанная известным автором, стала популярной.' },
                { q: 'Туристы приехавшие из Москвы остановились в гостинице.', answer: 'Туристы, приехавшие из Москвы, остановились в гостинице.' },
                { q: 'Дом построенный в XIX веке является памятником архитектуры.', answer: 'Дом, построенный в XIX веке, является памятником архитектуры.' },
                { q: 'Мужчина работающий рядом с нами очень опытный.', answer: 'Мужчина, работающий рядом с нами, очень опытный.' },
                { q: 'Мы посетили музей расположенный в центре города.', answer: 'Мы посетили музей, расположенный в центре города.' },
                { q: 'Фильм снятый молодым режиссёром получил награду.', answer: 'Фильм, снятый молодым режиссёром, получил награду.' },
                { q: 'Студенты изучающие русский язык выполнили задание.', answer: 'Студенты, изучающие русский язык, выполнили задание.' },
                { q: 'Машина купленная вчера уже сломалась.', answer: 'Машина, купленная вчера, уже сломалась.' },
                { q: 'Женщина стоящая возле входа ждёт вас.', answer: 'Женщина, стоящая возле входа, ждёт вас.' }
            ]
        },
        {
            id: 'ex8', type: 'input', icon: 'fa-wrench', showTask: true,
            title: '8-mashq. Xatoni toping va tuzating',
            intro: "Причастие otga rod, son va kelishikda mos kelmasa, xato bo'ladi. Gapni to'g'ri shaklda yozing. Ba'zi gaplar allaqachon to'g'ri.",
            namuna: 'Это девушка, работающий в нашей компании. → Это девушка, работающая в нашей компании.',
            items: [
                { q: 'Это девушка, работающий в нашей компании.', answer: 'Это девушка, работающая в нашей компании.' },
                { q: 'Я прочитал книгу, написанная известным автором.', answer: 'Я прочитал книгу, написанную известным автором.' },
                { q: 'Мы увидели студентов, изучающий русский язык.', answer: 'Мы увидели студентов, изучающих русский язык.' },
                { q: 'Это дом, построенная в прошлом году.', answer: 'Это дом, построенный в прошлом году.' },
                { q: 'Она встретила мужчину, сидящая в кафе.', answer: 'Она встретила мужчину, сидящего в кафе.' },
                { q: 'Я купил телефон, сделанный в Германии.', answer: 'Я купил телефон, сделанный в Германии.' },
                { q: 'Это статья, написанный профессором.', answer: 'Это статья, написанная профессором.' },
                { q: 'Мы посетили музей, расположенный в центре города.', answer: 'Мы посетили музей, расположенный в центре города.' },
                { q: 'Он познакомился с девушкой, говорящий по-французски.', answer: 'Он познакомился с девушкой, говорящей по-французски.' },
                { q: 'Я посмотрел фильм, снятый известным режиссёром.', answer: 'Я посмотрел фильм, снятый известным режиссёром.' }
            ]
        },
        {
            id: 'ex9', type: 'input', icon: 'fa-language', showTask: true,
            title: '9-mashq. Tarjima qiling',
            intro: "O'zbek tilidan rus tiliga tarjima qiling. Причастие ishlating.",
            namuna: "Maktabda ishlaydigan o'qituvchi juda tajribali. → Учитель, работающий в школе, очень опытный.",
            items: [
                { q: "Maktabda ishlaydigan o'qituvchi juda tajribali.", answer: 'Учитель, работающий в школе, очень опытный.' },
                { q: "Deraza yonida o'tirgan qiz kitob o'qiyapti.", answer: 'Девушка, сидящая у окна, читает книгу.' },
                { q: 'Mashhur yozuvchi tomonidan yozilgan kitob juda qiziqarli.', answer: 'Книга, написанная известным писателем, очень интересная.' },
                { q: 'Shahar markazida joylashgan mehmonxona juda chiroyli.', answer: 'Гостиница, расположенная в центре города, очень красивая.' },
                { q: 'Kecha sotib olingan telefon yaxshi ishlayapti.', answer: 'Телефон, купленный вчера, хорошо работает.' },
                { q: "Rus tilini o'rganayotgan talabalar topshiriq bajaryapti.", answer: 'Студенты, изучающие русский язык, выполняют задание.' },
                { q: "O'tgan yili qurilgan uy juda katta.", answer: 'Дом, построенный в прошлом году, очень большой.' },
                { q: "Televizorda ko'rsatilgan film menga yoqdi.", answer: 'Фильм, показанный по телевизору, мне понравился.' },
                { q: "Eshik oldida turgan erkak bizning o'qituvchimiz.", answer: 'Мужчина, стоящий у двери, наш учитель.' },
                { q: "Rossiyada suratga olingan film juda mashhur bo'ldi.", answer: 'Фильм, снятый в России, стал очень популярным.' }
            ]
        },
        {
            id: 'ex10', type: 'input', icon: 'fa-pen-fancy', showTask: true,
            title: '10-mashq. Batafsil tasvirlang',
            intro: "Berilgan so'z birikmalaridan foydalanib, har biri haqida причастие bilan to'liq gap tuzing.",
            namuna: 'человек / работать / в банке → Это человек, работающий в банке.',
            items: [
                { q: 'человек / работать / в банке', answer: 'Это человек, работающий в банке.' },
                { q: 'девушка / сидеть / в кафе', answer: 'Это девушка, сидящая в кафе.' },
                { q: 'книга / написать / известный автор', answer: 'Это книга, написанная известным автором.' },
                { q: 'дом / построить / сто лет назад', answer: 'Это дом, построенный сто лет назад.' },
                { q: 'парк / находиться / в центре города', answer: 'Это парк, находящийся в центре города.' },
                { q: 'студент / изучать / русский язык', answer: 'Это студент, изучающий русский язык.' },
                { q: 'фильм / снять / молодой режиссёр', answer: 'Это фильм, снятый молодым режиссёром.' },
                { q: 'телефон / купить / вчера', answer: 'Это телефон, купленный вчера.' },
                { q: 'женщина / разговаривать / по телефону', answer: 'Это женщина, разговаривающая по телефону.' },
                { q: 'ресторан / открыть / несколько лет назад', answer: 'Это ресторан, открытый несколько лет назад.' }
            ]
        },
        {
            id: 'audio1', type: 'choice', style: 'tf', icon: 'fa-headphones', showTask: true,
            audioSrc: 'audios/%D0%912%202%20%D1%83%D1%80%D0%BE%D0%BA.mp3',
            title: "Matn bo'yicha «Rost yoki yolg'on» mashqi",
            intro: "«Мой любимый город» audio matnini tinglang va gaplar «Правда» yoki «Ложь» ekanini aniqlang.",
            items: [
                { q: 'Москва — большой и современный город.', options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: 'Москва расположена в центре России.', options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: 'В Москве нет старинных зданий.', options: ['Правда', 'Ложь'], answer: 'Ложь' },
                { q: 'Красная площадь окружена историческими зданиями.', options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: 'Кремль находится далеко от Красной площади.', options: ['Правда', 'Ложь'], answer: 'Ложь' },
                { q: 'На улицах Москвы много людей, спешащих на работу или учёбу.', options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: 'В кафе можно встретить только туристов.', options: ['Правда', 'Ложь'], answer: 'Ложь' },
                { q: 'В Москве есть современные небоскрёбы.', options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: 'Москва сохраняет свою историю и развивается каждый год.', options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: 'Автору не нравится Москва.', options: ['Правда', 'Ложь'], answer: 'Ложь' }
            ]
        },
        {
            id: 'audio2', type: 'input', icon: 'fa-magnifying-glass-plus', showTask: true,
            title: 'Matndagi причастияni toping',
            intro: "Matnga qarab bo'sh joyga mos причастieni yozing.",
            namuna: 'Москва — город, ______ в центре России. → расположенный',
            items: [
                { q: 'город, ______ в центре России', answer: 'расположенный' },
                { q: 'здания, ______ несколько веков назад', answer: 'построенные' },
                { q: 'небоскрёбы, ______ центр города', answer: 'украшающие' },
                { q: 'площадь, ______ историческими зданиями', answer: ['окружённая', 'окруженная'] },
                { q: 'Кремль, ______ одним из символов России', answer: 'являющийся' },
                { q: 'парк, ______ красивыми цветами', answer: 'украшенный' },
                { q: 'людей, ______ на работу', answer: 'спешащих' },
                { q: 'студентов, ______ свои планы', answer: 'обсуждающих' },
                { q: 'туристов, ______ из разных стран', answer: 'приехавших' },
                { q: 'Москва, ______ свою историю', answer: 'сохраняющая' }
            ]
        },
        {
            id: 'audio3', type: 'choice', style: 'chips', icon: 'fa-tags', showTask: true,
            title: 'Причастие turini aniqlang',
            intro: "Matndan olingan причастиеlarni turlarga ajrating: Д — действительное, С — страдательное.",
            items: [
                { q: 'расположенный', options: DS_2, answer: 'С' },
                { q: 'сочетающий', options: DS_2, answer: 'Д' },
                { q: 'построенные', options: DS_2, answer: 'С' },
                { q: 'украшающие', options: DS_2, answer: 'Д' },
                { q: 'окружённая', options: DS_2, answer: 'С' },
                { q: 'являющийся', options: DS_2, answer: 'Д' },
                { q: 'украшенный', options: DS_2, answer: 'С' },
                { q: 'спешащих', options: DS_2, answer: 'Д' },
                { q: 'обсуждающих', options: DS_2, answer: 'Д' },
                { q: 'приехавших', options: DS_2, answer: 'Д' }
            ]
        },
        {
            id: 'audio4', type: 'choice', style: 'test', icon: 'fa-check-double', showTask: true,
            title: "To'g'ri shaklni tanlang",
            intro: "Qavs ichidagi variantlardan otga mos keladiganini tanlang.",
            items: [
                { q: 'Москва — город, (...) в центре России.', options: ['расположенный', 'расположенная'], answer: 'расположенный' },
                { q: 'Это здания, (...) несколько веков назад.', options: ['построенные', 'построенных'], answer: 'построенные' },
                { q: 'Мы увидели туристов, (...) из разных стран.', options: ['приехавших', 'приехавшие'], answer: 'приехавших' },
                { q: 'Я разговаривал со студентами, (...) свои планы.', options: ['обсуждающими', 'обсуждающие'], answer: 'обсуждающими' },
                { q: 'Красная площадь, (...) историческими зданиями, очень красивая.', options: ['окружённая', 'окружённый'], answer: 'окружённая' },
                { q: 'Мы гуляли по парку, (...) цветами.', options: ['украшенному', 'украшенный'], answer: 'украшенному' },
                { q: 'Я встретил людей, (...) на работу.', options: ['спешащих', 'спешащие'], answer: 'спешащих' },
                { q: 'Кремль — символ, (...) частью истории России.', options: ['являющийся', 'являющаяся'], answer: 'являющийся' },
                { q: 'Это город, (...) историю и современные технологии.', options: ['сочетающий', 'сочетающая'], answer: 'сочетающий' },
                { q: 'Москва — город, (...) каждый год.', options: ['развивающийся', 'развивающаяся'], answer: 'развивающийся' }
            ]
        }
    ];

    /* ======================================================================
     * LESSON 3 — Деепричастие (ravishdosh)
     * Authored strictly from the supplied lesson material: every rule, example,
     * exercise and answer key below appears in it. Nothing was invented.
     * ==================================================================== */
    var SEQ_2 = ['Bir vaqtda', 'Ketma-ket'];

    var LESSON_3_GRAMMAR = [
        '<div class="b2g">',
        '<div class="b2g-lead">',
            '<div class="b2g-lead-title">Деепричастие</div>',
            '<p><b>Esda saqlash uchun:</b></p>',
            '<p><b>-а / -я</b> → jarayon, bir vaqtda. <i>Читая книгу, я пью чай.</i> — Kitob o‘qiyotib, choy ichaman.</p>',
            '<p><b>-в / -вши / -ши</b> → oldin bajarilgan harakat. <i>Прочитав книгу, я написал отзыв.</i> — Kitobni o‘qib bo‘lib, sharh yozdim.</p>',
        '</div>',

        '<h4>1. Деепричастие nima?</h4>',
        '<p>Деепричастие — gapda asosiy fe’lga qo‘shimcha bo‘lgan harakatni bildiradi. ',
        'O‘zbek tilidagi “-ib”, “-gan holda”, “-a turib” ma’nolariga yaqin. Ya’ni bir gapda bir nechta ',
        'harakatni qisqa va bog‘langan holda ifodalash uchun ishlatiladi.</p>',
        '<div class="b2g-chips"><span>Читая книгу, я пью кофе.</span>',
        '<span>читая — qo‘shimcha harakat</span><span>пью — asosiy harakat</span></div>',

        '<h4>2. Qanday savollarga javob beradi?</h4>',
        '<table class="b2g-t"><tr><th>Vid</th><th>Savol</th><th>Ma’nosi</th></tr>',
            '<tr><td>Несовершенный вид</td><td>Что делая?</td><td>bir vaqtda sodir bo‘layotgan harakat</td></tr>',
            '<tr><td>Совершенный вид</td><td>Что сделав?</td><td>asosiy harakatdan oldin tugallangan harakat</td></tr>',
        '</table>',
        '<table class="b2g-t"><tr><th>Fe’l</th><th>Деепричастие</th><th>Fe’l</th><th>Деепричастие</th></tr>',
            '<tr><td>читать</td><td>читая</td><td>прочитать</td><td>прочитав</td></tr>',
            '<tr><td>делать</td><td>делая</td><td>сделать</td><td>сделав</td></tr>',
            '<tr><td>работать</td><td>работая</td><td>закончить</td><td>закончив</td></tr>',
            '<tr><td>готовить</td><td>готовя</td><td>прийти</td><td>придя</td></tr>',
            '<tr><td>разговаривать</td><td>разговаривая</td><td>купить</td><td>купив</td></tr>',
        '</table>',
        '<p><i>Работая, я слушаю музыку.</i> — Ishlab turib, men musiqa tinglayman. (har ikki harakat bir vaqtda)</p>',
        '<p><i>Прочитав книгу, он написал отзыв.</i> — Kitobni o‘qib bo‘lib, u sharh yozdi. ',
        '(avval прочитал, keyin написал)</p>',

        '<h4>3. Asosiy konstruksiyalar</h4>',
        '<p><b>Bir vaqtdagi harakat:</b> Делая…, я…</p>',
        '<div class="b2g-chips">',
            '<span>Готовя ужин, я слушаю музыку.</span>',
            '<span>Разговаривая с другом, я иду домой.</span>',
            '<span>Изучая русский язык, она смотрит фильмы.</span>',
        '</div>',
        '<p><b>Ketma-ket harakat:</b> Прочитав…, он…</p>',
        '<div class="b2g-chips">',
            '<span>Прочитав письмо, он ответил на него.</span>',
            '<span>Закончив работу, она пошла домой.</span>',
            '<span>Позавтракав, я пошёл на работу.</span>',
        '</div>',

        '<h4>4. Muhim qoida: bajaruvchi bir xil bo‘lishi kerak</h4>',
        '<p>Деепричастие bilan asosiy fe’lning bajaruvchisi bir xil shaxs bo‘lishi kerak.</p>',
        '<table class="b2g-t"><tr><th></th><th>Gap</th><th>Izoh</th></tr>',
            '<tr><td>✅</td><td>Идя домой, я встретил друга.</td>',
                '<td>идя va встретил — ikkalasini ham «я» bajaryapti</td></tr>',
            '<tr><td>❌</td><td>Идя домой, начался дождь.</td>',
                '<td>go‘yoki «дождь» uyga ketayotgandek ma’no chiqadi</td></tr>',
        '</table>',

        '<h4>5. Vergul bilan ajratiladi</h4>',
        '<p>Деепричастный оборот odatda vergul bilan ajratiladi.</p>',
        '<div class="b2g-chips">',
            '<span>Читая книгу, я делаю заметки.</span>',
            '<span>Я делаю заметки, читая книгу.</span>',
            '<span>Закончив работу, он ушёл домой.</span>',
            '<span>Он ушёл домой, закончив работу.</span>',
        '</div>',

        '<h4>6. Деепричастие yasash</h4>',
        '<table class="b2g-t"><tr><th>Несовершенный вид (-а / -я)</th><th>Совершенный вид (-в / -вши / -ши)</th></tr>',
            '<tr><td>читать → читая</td><td>прочитать → прочитав</td></tr>',
            '<tr><td>делать → делая</td><td>сделать → сделав</td></tr>',
            '<tr><td>играть → играя</td><td>купить → купив</td></tr>',
            '<tr><td>смотреть → смотря</td><td>закончить → закончив</td></tr>',
            '<tr><td>работать → работая</td><td>решить → решив</td></tr>',
            '<tr><td>учиться → учась</td><td>—</td></tr>',
        '</table>',
        '<p>Ba’zi fe’llarda shaklni alohida yodlash kerak:</p>',
        '<div class="b2g-chips"><span>прийти → придя</span><span>уйти → уйдя</span>',
        '<span>найти → найдя</span><span>привести → приведя</span></div>',

        '<h4>7. Ma’no jihatdan farqi</h4>',
        '<table class="b2g-t"><tr><th>Shakl</th><th>Ma’nosi</th><th>Misol</th></tr>',
            '<tr><td>Делая</td><td>harakat jarayonida / bir vaqtda</td>',
                '<td>Делая домашнее задание, я слушал музыку.</td></tr>',
            '<tr><td>Сделав</td><td>harakat tugagandan keyin</td>',
                '<td>Сделав домашнее задание, я пошёл гулять.</td></tr>',
        '</table>',

        '<h4>8. Muloqotda qanday ishlatiladi?</h4>',
        '<p>Деепричастие nutqni qisqa, tabiiy va bog‘langan qiladi.</p>',
        '<table class="b2g-t"><tr><th>Oddiy gap</th><th>Деепричастие bilan</th></tr>',
            '<tr><td>Я готовил ужин и слушал музыку.</td><td>Готовя ужин, я слушал музыку.</td></tr>',
            '<tr><td>Он закончил работу и пошёл домой.</td><td>Закончив работу, он пошёл домой.</td></tr>',
        '</table>',

        '<div class="b2g-check">',
            '<h4>Esda saqlang</h4>',
            '<ul class="b2g-list">',
                '<li><b>Делая</b> → bir vaqtda</li>',
                '<li><b>Сделав</b> → avval bajarib, keyin asosiy harakat</li>',
                '<li>Bajaruvchi ikkala harakatda ham bir xil shaxs bo‘lishi shart.</li>',
                '<li>Деепричастный оборот vergul bilan ajratiladi.</li>',
            '</ul>',
        '</div>',

        '</div>'
    ].join('');

    var LESSON_3_EXERCISES = [
        {
            id: 'ex1', type: 'input', icon: 'fa-pen', showTask: true,
            title: "1-mashq. To'g'ri деепричастие ni tanlang",
            intro: "Qavs ichidagi fe'ldan деепричастие yasang va to'liq gapni yozing.",
            namuna: 'Я ______ книгу, слушал музыку. (читать) → Читая книгу, я слушал музыку.',
            items: [
                { q: 'Она ______ книгу, пила чай. (читать)', answer: 'Читая книгу, она пила чай.' },
                { q: 'Он ______ работу, пошёл домой. (закончить)', answer: 'Закончив работу, он пошёл домой.' },
                { q: 'Я ______ ужин, слушал музыку. (готовить)', answer: 'Готовя ужин, я слушал музыку.' },
                { q: 'Мы ______ фильм, обсудили его. (посмотреть)', answer: 'Посмотрев фильм, мы обсудили его.' },
                { q: 'Она ______ домой, встретила подругу. (идти)', answer: 'Идя домой, она встретила подругу.' },
                { q: 'Он ______ письмо, сразу ответил. (прочитать)', answer: 'Прочитав письмо, он сразу ответил.' },
                { q: 'Я ______ русский язык, смотрю фильмы. (изучать)', answer: 'Изучая русский язык, я смотрю фильмы.' },
                { q: 'Они ______ завтрак, разговаривали. (готовить)', answer: 'Готовя завтрак, они разговаривали.' },
                { q: 'Она ______ задание, пошла гулять. (сделать)', answer: 'Сделав задание, она пошла гулять.' },
                { q: 'Я ______ по улице, разговаривал по телефону. (идти)', answer: 'Идя по улице, я разговаривал по телефону.' }
            ]
        },
        {
            id: 'ex2', type: 'input', icon: 'fa-code-merge', showTask: true,
            title: '2-mashq. Ikki gapni bitta gapga aylantiring',
            intro: "Ikki gapni деепричастие yordamida bitta gapga birlashtiring.",
            namuna: 'Я читал книгу. Я пил чай. → Читая книгу, я пил чай.',
            items: [
                { q: 'Она готовила ужин. Она слушала музыку.', answer: 'Готовя ужин, она слушала музыку.' },
                { q: 'Он закончил работу. Он пошёл домой.', answer: 'Закончив работу, он пошёл домой.' },
                { q: 'Я читал статью. Я делал заметки.', answer: 'Читая статью, я делал заметки.' },
                { q: 'Мы посмотрели фильм. Мы обсудили его.', answer: 'Посмотрев фильм, мы обсудили его.' },
                { q: 'Она шла домой. Она разговаривала по телефону.', answer: 'Идя домой, она разговаривала по телефону.' },
                { q: 'Он сделал домашнее задание. Он пошёл гулять.', answer: 'Сделав домашнее задание, он пошёл гулять.' },
                { q: 'Я изучал русский язык. Я смотрел сериалы.', answer: 'Изучая русский язык, я смотрел сериалы.' },
                { q: 'Она готовила завтрак. Она разговаривала с мамой.', answer: 'Готовя завтрак, она разговаривала с мамой.' },
                { q: 'Мы закончили урок. Мы пошли в кафе.', answer: 'Закончив урок, мы пошли в кафе.' },
                { q: 'Он прочитал сообщение. Он сразу ответил.', answer: 'Прочитав сообщение, он сразу ответил.' }
            ]
        },
        {
            id: 'ex3', type: 'input', icon: 'fa-language', showTask: true,
            title: '3-mashq. Tarjima qiling',
            intro: "O'zbek tilidagi gaplarni rus tiliga tarjima qiling. Деепричастие ishlating.",
            namuna: "Men kitob o'qiyotib, qahva ichdim. → Читая книгу, я пил кофе.",
            items: [
                { q: 'U musiqa tinglab, uy vazifasini bajardi.', answer: 'Слушая музыку, он делал домашнее задание.' },
                { q: 'Ishini tugatib, u uyiga ketdi.', answer: 'Закончив работу, он пошёл домой.' },
                { q: "Men uyga ketayotib, do'stimni uchratdim.", answer: 'Идя домой, я встретил друга.' },
                { q: 'U nonushta tayyorlayotib, televizor ko‘rdi.', answer: 'Готовя завтрак, она смотрела телевизор.' },
                { q: "Filmni ko'rib bo'lib, biz uni muhokama qildik.", answer: 'Посмотрев фильм, мы обсудили его.' },
                { q: 'Xatni o‘qib, u javob yozdi.', answer: 'Прочитав письмо, он написал ответ.' },
                { q: "Rus tilini o'rganayotib, men ko'p mashq qilaman.", answer: 'Изучая русский язык, я много практикуюсь.' },
                { q: 'Uyga kelib, u dam oldi.', answer: 'Придя домой, он отдохнул.' },
                { q: 'Ishlayotib, u musiqa tingladi.', answer: 'Работая, он слушал музыку.' },
                { q: "Vazifani bajarib bo'lib, men sayrga chiqdim.", answer: 'Сделав задание, я пошёл гулять.' }
            ]
        },
        {
            id: 'ex4', type: 'input', icon: 'fa-arrow-right-arrow-left', showTask: true,
            title: '4-mashq. Деепричастие shaklini yozing',
            intro: "Berilgan fe'ldan деепричастие shaklini yasang.",
            namuna: 'читать → читая; прочитать → прочитав',
            items: [
                { q: 'делать →', answer: 'делая' },
                { q: 'работать →', answer: 'работая' },
                { q: 'смотреть →', answer: 'смотря' },
                { q: 'готовить →', answer: 'готовя' },
                { q: 'разговаривать →', answer: 'разговаривая' },
                { q: 'закончить →', answer: 'закончив' },
                { q: 'решить →', answer: 'решив' },
                { q: 'купить →', answer: 'купив' },
                { q: 'написать →', answer: 'написав' },
                { q: 'открыть →', answer: 'открыв' }
            ]
        },
        {
            id: 'ex5', type: 'choice', style: 'test', icon: 'fa-check-double', showTask: true,
            title: "5-mashq. To'g'ri variantni tanlang",
            intro: "Gap ma'nosiga qarab mos деепричастие shaklini tanlang.",
            namuna: '______ книгу, я пил кофе. → Читая',
            items: [
                { q: '______ работу, он пошёл домой.', options: ['Заканчивая', 'Закончив'], answer: 'Закончив' },
                { q: '______ письмо, она сразу ответила.', options: ['Читая', 'Прочитав'], answer: 'Прочитав' },
                { q: '______ ужин, мама разговаривала по телефону.', options: ['Готовя', 'Приготовив'], answer: 'Готовя' },
                { q: '______ фильм, мы обсудили его.', options: ['Смотря', 'Посмотрев'], answer: 'Посмотрев' },
                { q: '______ домой, я встретил друга.', options: ['Идя', 'Придя'], answer: 'Идя' },
                { q: '______ русский язык, он смотрит русские фильмы.', options: ['Изучая', 'Изучив'], answer: 'Изучая' },
                { q: '______ задание, она пошла гулять.', options: ['Делая', 'Сделав'], answer: 'Сделав' },
                { q: '______ музыку, я занимался спортом.', options: ['Слушая', 'Послушав'], answer: 'Слушая' },
                { q: '______ письмо, он положил его на стол.', options: ['Написав', 'Написывая'], answer: 'Написав' },
                { q: '______ завтрак, они разговаривали.', options: ['Готовя', 'Приготовив'], answer: 'Готовя' }
            ]
        },
        {
            id: 'ex6', type: 'choice', style: 'chips', icon: 'fa-clock', showTask: true,
            title: '6-mashq. Bir vaqtda yoki ketma-ket?',
            intro: "Gapdagi harakatlar bir vaqtda sodir bo'ladimi yoki ketma-ket bajariladimi — aniqlang.",
            namuna: 'Читая книгу, я пил чай. → Bir vaqtda',
            items: [
                { q: 'Закончив работу, он пошёл домой.', options: SEQ_2, answer: 'Ketma-ket' },
                { q: 'Готовя ужин, она слушала музыку.', options: SEQ_2, answer: 'Bir vaqtda' },
                { q: 'Прочитав письмо, он позвонил другу.', options: SEQ_2, answer: 'Ketma-ket' },
                { q: 'Идя домой, я встретил учителя.', options: SEQ_2, answer: 'Bir vaqtda' },
                { q: 'Сделав домашнее задание, она пошла гулять.', options: SEQ_2, answer: 'Ketma-ket' },
                { q: 'Работая за компьютером, он слушал музыку.', options: SEQ_2, answer: 'Bir vaqtda' },
                { q: 'Посмотрев фильм, мы обсудили его.', options: SEQ_2, answer: 'Ketma-ket' },
                { q: 'Разговаривая с мамой, она готовила ужин.', options: SEQ_2, answer: 'Bir vaqtda' },
                { q: 'Придя домой, я сразу лёг спать.', options: SEQ_2, answer: 'Ketma-ket' },
                { q: 'Изучая русский язык, он смотрел фильмы.', options: SEQ_2, answer: 'Bir vaqtda' }
            ]
        },
        {
            id: 'ex7', type: 'input', icon: 'fa-pen-fancy', showTask: true,
            title: '7-mashq. Gapni davom ettiring',
            intro: "Деепричастный оборотdan keyin gapni mantiqan davom ettiring.",
            namuna: 'Читая книгу, я... → Читая книгу, я делал заметки.',
            /* OPEN-ENDED TASK. The learner finishes the sentence, so a single
               accepted string would fail every other correct continuation. Each
               item therefore lists the material's own «Namunaviy javob» FIRST,
               then the continuations the lesson itself uses elsewhere, and then
               the same answers written WITHOUT repeating the деепричастный
               оборот — because the prompt already shows it, and most learners
               type only the ending. Nothing here changes the shared scorer: it
               already accepts an array of variants. */
            items: [
                { q: 'Готовя ужин, она...',
                  answer: ['Готовя ужин, она слушала музыку.',
                           'Готовя ужин, она смотрела телевизор.',
                           'Готовя ужин, она разговаривала с мамой.',
                           'Готовя ужин, она разговаривала по телефону.',
                           'она слушала музыку', 'она смотрела телевизор',
                           'она разговаривала с мамой', 'она разговаривала по телефону'] },
                { q: 'Идя домой, я...',
                  answer: ['Идя домой, я встретил друга.',
                           'Идя домой, я встретил учителя.',
                           'Идя домой, я встретил подругу.',
                           'Идя домой, я слушал музыку.',
                           'Идя домой, я разговаривал по телефону.',
                           'я встретил друга', 'я встретил учителя', 'я встретил подругу',
                           'я слушал музыку', 'я разговаривал по телефону'] },
                { q: 'Закончив работу, он...',
                  answer: ['Закончив работу, он пошёл домой.',
                           'Закончив работу, он ушёл домой.',
                           'Закончив работу, он вернулся домой.',
                           'Закончив работу, он отдохнул.',
                           'он пошёл домой', 'он ушёл домой', 'он вернулся домой', 'он отдохнул'] },
                { q: 'Прочитав сообщение, она...',
                  answer: ['Прочитав сообщение, она позвонила мне.',
                           'Прочитав сообщение, она сразу ответила.',
                           'Прочитав сообщение, она написала ответ.',
                           'Прочитав сообщение, она улыбнулась.',
                           'она позвонила мне', 'она сразу ответила',
                           'она написала ответ', 'она улыбнулась'] },
                { q: 'Изучая русский язык, я...',
                  answer: ['Изучая русский язык, я смотрю фильмы.',
                           'Изучая русский язык, я смотрел сериалы.',
                           'Изучая русский язык, я много практикуюсь.',
                           'Изучая русский язык, я смотрю русские фильмы.',
                           'я смотрю фильмы', 'я смотрел сериалы',
                           'я много практикуюсь', 'я смотрю русские фильмы'] },
                { q: 'Посмотрев фильм, мы...',
                  answer: ['Посмотрев фильм, мы обсудили его.',
                           'Посмотрев фильм, мы пошли домой.',
                           'Посмотрев фильм, мы поговорили о нём.',
                           'мы обсудили его', 'мы пошли домой', 'мы поговорили о нём'] },
                { q: 'Придя домой, он...',
                  answer: ['Придя домой, он поужинал.',
                           'Придя домой, он отдохнул.',
                           'Придя домой, он принял душ.',
                           'Придя домой, он сразу лёг спать.',
                           'он поужинал', 'он отдохнул', 'он принял душ', 'он сразу лёг спать'] },
                { q: 'Разговаривая по телефону, она...',
                  answer: ['Разговаривая по телефону, она готовила ужин.',
                           'Разговаривая по телефону, она готовила кофе.',
                           'Разговаривая по телефону, она готовила еду.',
                           'Разговаривая по телефону, она убирала квартиру.',
                           'она готовила ужин', 'она готовила кофе',
                           'она готовила еду', 'она убирала квартиру'] },
                { q: 'Сделав домашнее задание, я...',
                  answer: ['Сделав домашнее задание, я пошёл гулять.',
                           'Сделав домашнее задание, я пошла гулять.',
                           'Сделав домашнее задание, я пошёл спать.',
                           'Сделав домашнее задание, я отдохнул.',
                           'я пошёл гулять', 'я пошла гулять',
                           'я пошёл спать', 'я отдохнул'] },
                { q: 'Работая за компьютером, он...',
                  answer: ['Работая за компьютером, он слушал музыку.',
                           'Работая за компьютером, он пил кофе.',
                           'Работая за компьютером, он разговаривал по телефону.',
                           'он слушал музыку', 'он пил кофе', 'он разговаривал по телефону'] }
            ]
        },
        {
            id: 'ex8', type: 'input', icon: 'fa-rotate', showTask: true,
            title: '8-mashq. Oddiy gapni Деепричастие bilan qayta yozing',
            intro: "«va» bilan bog'langan gapni деепричастный оборот yordamida qayta yozing.",
            namuna: 'Я читал книгу и делал заметки. → Читая книгу, я делал заметки.',
            items: [
                { q: 'Она готовила ужин и слушала музыку.', answer: 'Готовя ужин, она слушала музыку.' },
                { q: 'Он закончил работу и пошёл домой.', answer: 'Закончив работу, он пошёл домой.' },
                { q: 'Я смотрел фильм и ел попкорн.', answer: 'Смотря фильм, я ел попкорн.' },
                { q: 'Она разговаривала по телефону и готовила кофе.', answer: 'Разговаривая по телефону, она готовила кофе.' },
                { q: 'Мы закончили урок и вышли из класса.', answer: 'Закончив урок, мы вышли из класса.' },
                { q: 'Он читал сообщение и улыбался.', answer: 'Читая сообщение, он улыбался.' },
                { q: 'Я шёл по улице и слушал музыку.', answer: 'Идя по улице, я слушал музыку.' },
                { q: 'Она сделала покупки и вернулась домой.', answer: 'Сделав покупки, она вернулась домой.' },
                { q: 'Он изучал русский язык и смотрел фильмы.', answer: 'Изучая русский язык, он смотрел фильмы.' },
                { q: 'Мы посмотрели фотографии и вспомнили поездку.', answer: 'Посмотрев фотографии, мы вспомнили поездку.' }
            ]
        },
        {
            id: 'ex9', type: 'input', icon: 'fa-earth-europe', showTask: true,
            title: "9-mashq. O'zbek tilidan rus tiliga tarjima qiling",
            intro: "Gaplarni rus tiliga tarjima qiling va деепричастие ishlating.",
            namuna: 'Ishlayotib, u musiqa tingladi. → Работая, он слушал музыку.',
            items: [
                { q: "Kitob o'qiyotib, men choy ichdim.", answer: 'Читая книгу, я пил чай.' },
                { q: 'Ishni tugatib, u uyiga ketdi.', answer: 'Закончив работу, он пошёл домой.' },
                { q: "Uyga ketayotib, men do'stimni uchratdim.", answer: 'Идя домой, я встретил друга.' },
                { q: 'Nonushta tayyorlayotib, u musiqa tingladi.', answer: 'Готовя завтрак, она слушала музыку.' },
                { q: "Xatni o'qib bo'lib, u javob yozdi.", answer: 'Прочитав письмо, он написал ответ.' },
                { q: "Filmni ko'rib bo'lib, biz uni muhokama qildik.", answer: 'Посмотрев фильм, мы обсудили его.' },
                { q: "Rus tilini o'rganayotib, men ko'p mashq qilaman.", answer: 'Изучая русский язык, я много практикуюсь.' },
                { q: 'Uyga kelib, u dush qabul qildi.', answer: 'Придя домой, он принял душ.' },
                { q: "Vazifani bajarib bo'lib, bola o'ynashga ketdi.", answer: 'Сделав задание, ребёнок пошёл играть.' },
                { q: 'Telefonda gaplashayotib, u ovqat tayyorladi.', answer: 'Разговаривая по телефону, она готовила еду.' }
            ]
        },
        {
            id: 'ex10', type: 'input', icon: 'fa-wrench', showTask: true,
            title: '10-mashq. Xatoni toping va tuzating',
            intro: "Деепричастие va asosiy fe'lning bajaruvchisi bir xil bo'lishi kerak. Gapni to'g'rilab yozing.",
            namuna: '❌ Читая книгу, мне стало интересно. → ✅ Читая книгу, я заинтересовался.',
            items: [
                { q: 'Идя домой, начался дождь.', answer: 'Когда я шёл домой, начался дождь.' },
                { q: 'Читая книгу, мне стало скучно.', answer: 'Читая книгу, я заскучал.' },
                { q: 'Закончив работу, она пошёл домой.', answer: 'Закончив работу, она пошла домой.' },
                { q: 'Готовя ужин, он смотрела телевизор.', answer: 'Готовя ужин, она смотрела телевизор.' },
                { q: 'Прочитав письмо, она сразу ответил.', answer: 'Прочитав письмо, она сразу ответила.' },
                { q: 'Идя в школу, мне встретился друг.', answer: 'Идя в школу, я встретил друга.' },
                { q: 'Сделав задание, он пошла гулять.', answer: 'Сделав задание, он пошёл гулять.' },
                { q: 'Разговаривая по телефону, я готовила ужин. (erkak haqida)', answer: 'Разговаривая по телефону, я готовил ужин.' },
                { q: 'Посмотрев фильм, она обсудил его.', answer: 'Посмотрев фильм, она обсудила его.' },
                { q: 'Придя домой, я сразу легла спать. (erkak haqida)', answer: 'Придя домой, я сразу лёг спать.' }
            ]
        },
        {
            id: 'ex11', type: 'choice', style: 'test', icon: 'fa-link', showTask: true,
            title: '11-mashq. Moslashtiring',
            intro: "Berilgan деепричастие birikmalarini mos gap davomi bilan bog'lang.",
            namuna: 'Читая книгу → я делал заметки.',
            items: [
                { q: 'Читая книгу...', options: ['я делал заметки.', 'он пошёл домой.', 'она слушала музыку.'], answer: 'я делал заметки.' },
                { q: 'Закончив работу...', options: ['он пошёл домой.', 'она слушала музыку.', 'он ответил.'], answer: 'он пошёл домой.' },
                { q: 'Готовя ужин...', options: ['она слушала музыку.', 'он ответил.', 'я встретил друга.'], answer: 'она слушала музыку.' },
                { q: 'Прочитав сообщение...', options: ['он ответил.', 'я встретил друга.', 'мы обсудили его.'], answer: 'он ответил.' },
                { q: 'Идя домой...', options: ['я встретил друга.', 'мы обсудили его.', 'он принял душ.'], answer: 'я встретил друга.' },
                { q: 'Посмотрев фильм...', options: ['мы обсудили его.', 'он принял душ.', 'я смотрю русские фильмы.'], answer: 'мы обсудили его.' },
                { q: 'Придя домой...', options: ['он принял душ.', 'я смотрю русские фильмы.', 'я пошёл гулять.'], answer: 'он принял душ.' },
                { q: 'Изучая русский язык...', options: ['я смотрю русские фильмы.', 'я пошёл гулять.', 'она готовила ужин.'], answer: 'я смотрю русские фильмы.' },
                { q: 'Сделав задание...', options: ['я пошёл гулять.', 'она готовила ужин.', 'я делал заметки.'], answer: 'я пошёл гулять.' },
                { q: 'Разговаривая по телефону...', options: ['она готовила ужин.', 'я делал заметки.', 'он пошёл домой.'], answer: 'она готовила ужин.' }
            ]
        },
        {
            id: 'audio1', type: 'choice', style: 'tf', icon: 'fa-headphones', showTask: true,
            audioSrc: 'audios/%D0%912%203%20%D1%83%D1%80%D0%BE%D0%BA.mp3',
            title: "Matn bo'yicha «Rost yoki yolg'on» mashqi",
            intro: "«Один обычный день» audio matnini tinglang va gaplar «Правда» yoki «Ложь» ekanini aniqlang.",
            items: [
                { q: 'Герой проснулся поздно утром.', options: ['Правда', 'Ложь'], answer: 'Ложь' },
                { q: 'Встав с кровати, он открыл окно.', options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: 'Он решил пойти на работу пешком.', options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: 'Идя по улице, он слушал музыку.', options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: 'По дороге он встретил своего друга.', options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: 'Придя на работу, он сразу пошёл обедать.', options: ['Правда', 'Ложь'], answer: 'Ложь' },
                { q: 'Читая сообщения, он записывал важные дела в блокнот.', options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: 'Закончив все основные дела, он решил немного отдохнуть.', options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: 'Вечером он поехал домой на машине.', options: ['Правда', 'Ложь'], answer: 'Ложь' },
                { q: 'Придя домой, он поужинал и посмотрел фильм.', options: ['Правда', 'Ложь'], answer: 'Правда' }
            ]
        }
    ];

    /* ======================================================================
     * LESSON 4 — Прямая и косвенная речь
     * Every rule, example, exercise and answer below is taken from the supplied
     * material. Nothing was invented and no answer was re-worded.
     * ==================================================================== */
    var LESSON_4_GRAMMAR = [
        '<div class="b2g">',
        '<div class="b2g-lead">',
            '<div class="b2g-lead-title">Прямая и косвенная речь</div>',
            '<p><b>Прямая речь</b> — ko‘chirma gap. <b>Косвенная речь</b> — o‘zlashtirma gap.</p>',
        '</div>',

        '<h4>1. Прямая речь — Ko‘chirma gap</h4>',
        '<p>Прямая речь — boshqa odamning gapini aynan o‘z holicha yetkazish. ',
        'Ko‘chirma gap odatda qo‘shtirnoq ichida yoziladi.</p>',
        '<table class="b2g-t"><tr><th>Rus tilida</th><th>Tarjima</th></tr>',
            '<tr><td>Он сказал: «Я занят».</td><td>U: «Men bandman», — dedi.</td></tr>',
            '<tr><td>Она спросила: «Ты придёшь?»</td><td>U: «Sen kelasanmi?» — deb so‘radi.</td></tr>',
        '</table>',

        '<h4>2. Косвенная речь — O‘zlashtirma gap</h4>',
        '<p>Косвенная речь — boshqa odamning fikrini mazmunini saqlagan holda, lekin gapni ',
        'o‘zgartirib yetkazish.</p>',
        '<div class="b2g-chips">',
            '<span>Он сказал, что… — U ...ligini aytdi.</span>',
            '<span>Она спросила, почему… — U nima uchun ...ligini so‘radi.</span>',
        '</div>',
        '<table class="b2g-t"><tr><th>Прямая речь</th><th>Косвенная речь</th></tr>',
            '<tr><td>Он сказал: «Я занят».</td><td>Он сказал, что он занят.</td></tr>',
        '</table>',

        '<h4>3. Darak gaplarda: ЧТО</h4>',
        '<p>Agar odam nima deganini yetkazsak, ko‘pincha <b>что</b> ishlatiladi.</p>',
        '<table class="b2g-t"><tr><th>Прямая речь</th><th>Косвенная речь</th></tr>',
            '<tr><td>Он сказал: «Я устал».</td><td>Он сказал, что он устал.</td></tr>',
            '<tr><td>Она сказала: «Я не знаю».</td><td>Она сказала, что она не знает.</td></tr>',
            '<tr><td>Мама сказала: «Мы поедем завтра».</td><td>Мама сказала, что мы поедем завтра.</td></tr>',
        '</table>',
        '<p>📌 <b>Konstruksiya:</b> Он/она сказал(а) + что + gap</p>',

        '<h4>4. Savol gaplarda</h4>',
        '<p>Agar savolni yetkazsak, savol turiga qarab <b>ли, почему, где, когда, как, кто, что</b> ',
        'kabi so‘zlar ishlatiladi.</p>',
        '<p><b>Ha/yo‘q savollari → ЛИ</b></p>',
        '<table class="b2g-t"><tr><th>Прямая речь</th><th>Косвенная речь</th></tr>',
            '<tr><td>Он спросил: «Ты придёшь?»</td><td>Он спросил, придёшь ли ты.</td></tr>',
            '<tr><td>Она спросила: «Ты занят?»</td><td>Она спросила, занят ли я.</td></tr>',
        '</table>',
        '<p>📌 <b>Konstruksiya:</b> Он спросил, + fe’l + ли + ega</p>',
        '<p><b>Savol so‘zi bo‘lsa, u saqlanadi</b></p>',
        '<table class="b2g-t"><tr><th>Прямая речь</th><th>Косвенная речь</th></tr>',
            '<tr><td>Он спросил: «Где ты живёшь?»</td><td>Он спросил, где я живу.</td></tr>',
            '<tr><td>Она спросила: «Почему ты опоздал?»</td><td>Она спросила, почему я опоздал.</td></tr>',
            '<tr><td>Учитель спросил: «Когда вы закончите?»</td><td>Учитель спросил, когда мы закончим.</td></tr>',
        '</table>',
        '<p>📌 <b>Konstruksiya:</b> Он спросил, + вопросительное слово + gap</p>',

        '<h4>5. Kishilik olmoshlari o‘zgaradi</h4>',
        '<p>Прямая речьdan косвенная речьga o‘tganda <b>я, ты, мы, вы</b> kabi olmoshlar ',
        'vaziyatga qarab o‘zgaradi.</p>',
        '<table class="b2g-t"><tr><th>Прямая речь</th><th>Косвенная речь</th></tr>',
            '<tr><td>Он сказал: «Я занят».</td><td>Он сказал, что он занят.</td></tr>',
            '<tr><td>Она сказала: «Я устала».</td><td>Она сказала, что она устала.</td></tr>',
            '<tr><td>Он спросил меня: «Ты занят?»</td><td>Он спросил меня, занят ли я.</td></tr>',
            '<tr><td>Они сказали: «Мы готовы».</td><td>Они сказали, что они готовы.</td></tr>',
        '</table>',

        '<h4>6. Vaqt va joy bildiruvchi so‘zlar ham o‘zgarishi mumkin</h4>',
        '<table class="b2g-t"><tr><th>Прямая речь</th><th>Косвенная речь</th></tr>',
            '<tr><td>сегодня</td><td>в тот день</td></tr>',
            '<tr><td>завтра</td><td>на следующий день</td></tr>',
            '<tr><td>вчера</td><td>накануне</td></tr>',
            '<tr><td>здесь</td><td>там</td></tr>',
            '<tr><td>сейчас</td><td>тогда</td></tr>',
        '</table>',
        '<div class="b2g-chips">',
            '<span>Он сказал: «Я приеду завтра». → Он сказал, что приедет на следующий день.</span>',
            '<span>Она сказала: «Я была здесь вчера». → Она сказала, что была там накануне.</span>',
        '</div>',

        '<h4>7. Buyruq va iltimos</h4>',
        '<p>Buyruq yoki iltimosni yetkazishda ko‘pincha <b>попросил + кого? + инфинитив</b> yoki ',
        '<b>сказал + кому? + инфинитив</b> ishlatiladi.</p>',
        '<table class="b2g-t"><tr><th>Прямая речь</th><th>Косвенная речь</th></tr>',
            '<tr><td>Он сказал: «Закрой дверь».</td><td>Он сказал мне закрыть дверь.</td></tr>',
            '<tr><td>Она попросила: «Помоги мне».</td><td>Она попросила меня помочь ей.</td></tr>',
            '<tr><td>Мама сказала: «Не опаздывай».</td><td>Мама попросила меня не опаздывать.</td></tr>',
        '</table>',

        '<div class="b2g-check">',
            '<h4>⭐ Eng muhim konstruksiyalar</h4>',
            '<ul class="b2g-list">',
                '<li>Он сказал, что… — U ...ligini aytdi.</li>',
                '<li>Она сказала, что… — U ...ligini aytdi.</li>',
                '<li>Он спросил, где… — U qayerda ...ligini so‘radi.</li>',
                '<li>Она спросила, почему… — U nima uchun ...ligini so‘radi.</li>',
                '<li>Он спросил, когда… — U qachon ...ligini so‘radi.</li>',
                '<li>Она спросила, придёшь ли ты… — U sen kelishingni-kelmasligingni so‘radi.</li>',
                '<li>Он попросил меня… — U mendan ...ni so‘radi.</li>',
                '<li>Она сказала мне… — U menga ...ni aytdi.</li>',
            '</ul>',
        '</div>',

        '<h4>Qisqa qoida</h4>',
        '<table class="b2g-t"><tr><th>Прямая речь</th><th>Косвенная речь</th></tr>',
            '<tr><td>Он сказал: «Я занят».</td><td>Он сказал, что он занят.</td></tr>',
            '<tr><td>Она спросила: «Почему ты опоздал?»</td><td>Она спросила, почему я опоздал.</td></tr>',
            '<tr><td>Он спросил: «Ты придёшь?»</td><td>Он спросил, приду ли я.</td></tr>',
        '</table>',

        '</div>'
    ].join('');

    var LESSON_4_EXERCISES = [
        {
            id: 'ex1', type: 'input', icon: 'fa-quote-right', showTask: true,
            title: '1-mashq. Прямую речь → косвенную речь',
            intro: "Ko'chirma gapni o'zlashtirma gapga aylantiring. «что» bog'lovchisidan foydalaning.",
            namuna: 'Он сказал: «Я устал». → Он сказал, что он устал.',
            items: [
                { q: 'Она сказала: «Я занята».', answer: 'Она сказала, что она занята.' },
                { q: 'Он сказал: «Я не понимаю этот вопрос».', answer: 'Он сказал, что он не понимает этот вопрос.' },
                { q: 'Маша сказала: «Я уже закончила работу».', answer: 'Маша сказала, что она уже закончила работу.' },
                { q: 'Они сказали: «Мы скоро вернёмся».', answer: 'Они сказали, что они скоро вернутся.' },
                { q: 'Учитель сказал: «Урок начинается в девять часов».', answer: 'Учитель сказал, что урок начинается в девять часов.' },
                { q: 'Анна сказала: «Я никогда не была в Москве».', answer: 'Анна сказала, что она никогда не была в Москве.' },
                { q: 'Он сказал: «Я хочу изменить свою жизнь».', answer: 'Он сказал, что он хочет изменить свою жизнь.' },
                { q: 'Родители сказали: «Мы гордимся тобой».', answer: 'Родители сказали, что они гордятся мной.' },
                { q: 'Она сказала: «Я не знаю этого человека».', answer: 'Она сказала, что она не знает этого человека.' },
                { q: 'Сергей сказал: «Я позвоню тебе вечером».', answer: 'Сергей сказал, что он позвонит мне вечером.' }
            ]
        },
        {
            id: 'ex2', type: 'input', icon: 'fa-circle-question', showTask: true,
            title: "2-mashq. Savol gaplarni косвенная речьga aylantiring",
            intro: "Savol so'zi saqlanadi: где, почему, когда, как, куда, сколько, кто, что.",
            namuna: 'Он спросил: «Где ты живёшь?» → Он спросил, где я живу.',
            items: [
                { q: 'Она спросила: «Где ты работаешь?»', answer: 'Она спросила, где я работаю.' },
                { q: 'Он спросил: «Почему ты опоздал?»', answer: 'Он спросил, почему я опоздал.' },
                { q: 'Мама спросила: «Когда ты вернёшься?»', answer: 'Мама спросила, когда я вернусь.' },
                { q: 'Учитель спросил: «Почему вы не сделали домашнее задание?»', answer: 'Учитель спросил, почему мы не сделали домашнее задание.' },
                { q: 'Анна спросила: «Как ты себя чувствуешь?»', answer: 'Анна спросила, как я себя чувствую.' },
                { q: 'Он спросил: «Куда вы идёте?»', answer: 'Он спросил, куда мы идём.' },
                { q: 'Она спросила: «Сколько это стоит?»', answer: 'Она спросила, сколько это стоит.' },
                { q: 'Друг спросил: «Когда ты закончишь работу?»', answer: 'Друг спросил, когда я закончу работу.' },
                { q: 'Папа спросил: «Кто тебе позвонил?»', answer: 'Папа спросил, кто мне позвонил.' },
                { q: 'Она спросила: «Что ты сейчас читаешь?»', answer: 'Она спросила, что я сейчас читаю.' }
            ]
        },
        {
            id: 'ex3', type: 'input', icon: 'fa-check-double', showTask: true,
            title: "3-mashq. Да/нет savollarini косвенная речьga aylantiring",
            intro: "Ha/yo'q savollarida «ли» yuklamasi ishlatiladi.",
            namuna: 'Он спросил: «Ты занят?» → Он спросил, занят ли я.',
            items: [
                { q: 'Она спросила: «Ты уже поел?»', answer: 'Она спросила, поел ли я уже.' },
                { q: 'Он спросил: «Ты придёшь завтра?»', answer: 'Он спросил, приду ли я завтра.' },
                { q: 'Мама спросила: «Ты сделал домашнее задание?»', answer: 'Мама спросила, сделал ли я домашнее задание.' },
                { q: 'Учитель спросил: «Вы поняли правило?»', answer: 'Учитель спросил, поняли ли мы правило.' },
                { q: 'Она спросила: «Ты знаешь этого человека?»', answer: 'Она спросила, знаю ли я этого человека.' },
                { q: 'Друг спросил: «Ты был в этом ресторане?»', answer: 'Друг спросил, был ли я в этом ресторане.' },
                { q: 'Папа спросил: «Ты купил хлеб?»', answer: 'Папа спросил, купил ли я хлеб.' },
                { q: 'Он спросил: «Вы готовы?»', answer: 'Он спросил, готовы ли мы.' },
                { q: 'Она спросила: «Ты будешь участвовать в конкурсе?»', answer: 'Она спросила, буду ли я участвовать в конкурсе.' },
                { q: 'Менеджер спросил: «Вы получили письмо?»', answer: 'Менеджер спросил, получили ли мы письмо.' }
            ]
        },
        {
            id: 'ex4', type: 'input', icon: 'fa-hand', showTask: true,
            title: "4-mashq. Buyruq va iltimoslarni o'zlashtirma gapga aylantiring",
            intro: "«попросил + кого? + инфинитив» yoki «сказал + кому? + инфинитив» konstruksiyasidan foydalaning.",
            namuna: 'Мама сказала: «Закрой окно». → Мама сказала мне закрыть окно.',
            items: [
                { q: 'Учитель сказал: «Откройте учебники».', answer: 'Учитель сказал нам открыть учебники.' },
                { q: 'Мама попросила: «Помоги мне».', answer: 'Мама попросила меня помочь ей.' },
                { q: 'Он сказал мне: «Подожди здесь».', answer: 'Он сказал мне подождать здесь.' },
                { q: 'Врач сказал: «Не волнуйтесь».', answer: 'Врач сказал мне не волноваться.' },
                { q: 'Она попросила: «Позвони мне вечером».', answer: 'Она попросила меня позвонить ей вечером.' },
                { q: 'Отец сказал: «Не опаздывай».', answer: 'Отец сказал мне не опаздывать.' },
                { q: 'Учитель попросил: «Повторите предложение».', answer: 'Учитель попросил нас повторить предложение.' },
                { q: 'Друг сказал: «Не рассказывай никому».', answer: 'Друг сказал мне не рассказывать никому.' },
                { q: 'Она попросила: «Передай мне книгу».', answer: 'Она попросила меня передать ей книгу.' },
                { q: 'Начальник сказал: «Закончите работу сегодня».', answer: 'Начальник сказал нам закончить работу сегодня.' }
            ]
        },
        {
            id: 'ex5', type: 'input', icon: 'fa-clock-rotate-left', showTask: true,
            title: "5-mashq. Vaqt va joy so'zlariga e'tibor bering",
            intro: "Vaqt va joy so'zlari o'zgaradi: завтра → на следующий день, вчера → накануне, здесь → там, сейчас → тогда.",
            namuna: 'Он сказал: «Я приеду завтра». → Он сказал, что приедет на следующий день.',
            items: [
                { q: 'Она сказала: «Я была здесь вчера».', answer: 'Она сказала, что была там вчера.' },
                { q: 'Он сказал: «Я позвоню тебе завтра».', answer: 'Он сказал, что позвонит мне на следующий день.' },
                { q: 'Мама сказала: «Я сейчас занята».', answer: 'Мама сказала, что тогда была занята.' },
                { q: 'Он сказал: «Я видел его здесь вчера».', answer: 'Он сказал, что видел его там накануне.' },
                { q: 'Она сказала: «Мы встретимся завтра».', answer: 'Она сказала, что они встретятся на следующий день.' },
                { q: 'Сергей сказал: «Я вернусь сегодня вечером».', answer: 'Сергей сказал, что вернётся тем вечером.' },
                { q: 'Он сказал: «Я был здесь на прошлой неделе».', answer: 'Он сказал, что был там на предыдущей неделе.' },
                { q: 'Она сказала: «Я приехала сюда вчера».', answer: 'Она сказала, что приехала туда накануне.' },
                { q: 'Папа сказал: «Я позвоню тебе сегодня».', answer: 'Папа сказал, что позвонит мне в тот день.' },
                { q: 'Они сказали: «Мы уедем завтра утром».', answer: 'Они сказали, что уедут на следующее утро.' }
            ]
        },
        {
            id: 'ex6', type: 'input', icon: 'fa-shuffle', showTask: true,
            title: '6-mashq. Aralash mashq',
            intro: "Darak, savol va istak gaplarni o'zlashtirma gapga aylantiring.",
            namuna: 'Она сказала: «Я не знаю, где он живёт». → Она сказала, что не знает, где он живёт.',
            items: [
                { q: 'Он сказал: «Я не знаю, когда она придёт».', answer: 'Он сказал, что не знает, когда она придёт.' },
                { q: 'Она спросила: «Почему ты молчишь?»', answer: 'Она спросила, почему я молчу.' },
                { q: 'Мама сказала: «Я хочу знать, где ты был».', answer: 'Мама сказала, что хочет знать, где я был.' },
                { q: 'Он спросил: «Ты понимаешь, что происходит?»', answer: 'Он спросил, понимаю ли я, что происходит.' },
                { q: 'Учитель сказал: «Я хочу, чтобы вы внимательно слушали».', answer: 'Учитель сказал, что хочет, чтобы мы внимательно слушали.' },
                { q: 'Она сказала: «Я не знаю, почему он ушёл».', answer: 'Она сказала, что не знает, почему он ушёл.' },
                { q: 'Он спросил: «Когда вы сможете закончить проект?»', answer: 'Он спросил, когда мы сможем закончить проект.' },
                { q: 'Мама спросила: «Ты знаешь, где лежат ключи?»', answer: 'Мама спросила, знаю ли я, где лежат ключи.' },
                { q: 'Она сказала: «Я хочу, чтобы ты мне помог».', answer: 'Она сказала, что хочет, чтобы я ей помог.' },
                { q: 'Он спросил: «Почему ты не сказал мне об этом?»', answer: 'Он спросил, почему я не сказал ему об этом.' }
            ]
        },
        {
            id: 'audio1', type: 'choice', style: 'tf', icon: 'fa-headphones', showTask: true,
            audioSrc: 'audios/%D0%912%204%20%D1%83%D1%80%D0%BE%D0%BA.mp3',
            title: "Matn bo'yicha «Rost yoki yolg'on» mashqi",
            intro: "«Важный разговор» audio matnini tinglang va gaplar «Правда» yoki «Ложь» ekanini aniqlang.",
            items: [
                { q: 'Анна встретилась с Максимом вчера.', options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: 'Максим поздно пришёл из-за пробки на дороге.', options: ['Правда', 'Ложь'], answer: 'Ложь' },
                { q: 'У Максима было важное собрание на работе.', options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: 'Анна давно хотела поговорить с Максимом.', options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: 'Максим уже окончательно решил сменить работу.', options: ['Правда', 'Ложь'], answer: 'Ложь' },
                { q: 'Максиму предложили новую должность в другой компании.', options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: 'Анна знала, что Максим больше не любит свою работу.', options: ['Правда', 'Ложь'], answer: 'Ложь' },
                { q: 'Максим должен принять решение до конца недели.', options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: 'Анна посоветовала Максиму не торопиться с решением.', options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: 'Максим отказался воспользоваться советом Анны.', options: ['Правда', 'Ложь'], answer: 'Ложь' }
            ]
        }
    ];

    /* ======================================================================
     * LESSON 5 — Условные предложения (shart gaplar)
     * Every rule, example, exercise and answer key comes from the supplied
     * material, verbatim. Where the material prints only a «Namunaviy javob»
     * the exercise is open: ex9 and ex10 therefore accept the sample answer
     * FIRST and the same answer written as a bare continuation — two shapes of
     * the material's own answer, not new content.
     * ==================================================================== */
    var LESSON_5_GRAMMAR = [
        '<div class="b2g">',
        '<div class="b2g-lead">',
            '<div class="b2g-lead-title">Условные предложения — Shart gaplar</div>',
            '<p>Условные предложения — biror shart, faraz yoki ehtimoliy vaziyatni ifodalash uchun ',
            'ishlatiladi. Ayniqsa orzular, farazlar va hayotiy tanlovlar haqida gapirganda ko‘p qo‘llanadi.</p>',
        '</div>',

        '<h4>1. Asosiy konstruksiya: Если бы я…, я бы…</h4>',
        '<p>Haqiqiy bo‘lmagan yoki hozircha amalga oshmagan vaziyat haqida gapirishda ishlatiladi.</p>',
        '<p><b>Formula:</b> Если бы + o‘tgan zamon, ... + бы + fe’l</p>',
        '<table class="b2g-t"><tr><th>Rus tilida</th><th>Tarjima</th></tr>',
            '<tr><td>Если бы я знал, я бы тебе сказал.</td><td>Agar men bilganimda, senga aytardim.</td></tr>',
            '<tr><td>Если бы у меня было больше времени, я бы больше путешествовал.</td>',
                '<td>Agar vaqtim ko‘proq bo‘lganida, ko‘proq sayohat qilardim.</td></tr>',
            '<tr><td>Если бы я выиграл миллион, я бы купил дом.</td>',
                '<td>Agar men million yutganimda, uy sotib olardim.</td></tr>',
            '<tr><td>Если бы она была здесь, она бы нам помогла.</td>',
                '<td>Agar u bu yerda bo‘lganida, bizga yordam bergan bo‘lardi.</td></tr>',
        '</table>',
        '<p><b>Muhim:</b> Rus tilida bu konstruksiyada fe’l shaklan o‘tgan zamonda bo‘ladi, lekin ',
        'ma’nosi ko‘pincha hozirgi yoki kelajakdagi farazni bildiradi.</p>',

        '<h4>2. «бы» yuklamasi</h4>',
        '<p>Бы shart yoki faraz ma’nosini beradi. U fe’l bilan birga yoki gapning boshqa joyida ',
        'kelishi mumkin — ikkalasi ham to‘g‘ri.</p>',
        '<div class="b2g-chips"><span>Я бы пошёл с тобой.</span><span>Я пошёл бы с тобой.</span></div>',
        '<table class="b2g-t"><tr><th></th><th>Gap</th></tr>',
            '<tr><td>❌</td><td>Я бы пойду.</td></tr>',
            '<tr><td>✅</td><td>Я бы пошёл.</td></tr>',
            '<tr><td>❌</td><td>Я бы буду путешествовать.</td></tr>',
            '<tr><td>✅</td><td>Я бы путешествовал.</td></tr>',
        '</table>',

        '<h4>3. Если бы + o‘tgan zamon</h4>',
        '<p>Бы dan keyin fe’l o‘tgan zamonda keladi:</p>',
        '<div class="b2g-chips"><span>Если бы я знал…</span><span>Если бы она пришла…</span>',
        '<span>Если бы мы имели больше времени…</span><span>Если бы они были рядом…</span></div>',
        '<p>Jinsga qarab o‘tgan zamon shakli o‘zgaradi:</p>',
        '<table class="b2g-t"><tr><th>Shakl</th><th>Tarjima</th></tr>',
            '<tr><td>Если бы я был мужчиной…</td><td>Agar men erkak bo‘lganimda…</td></tr>',
            '<tr><td>Если бы я была женщиной…</td><td>Agar men ayol bo‘lganimda…</td></tr>',
        '</table>',
        '<p>Ko‘plikda:</p>',
        '<div class="b2g-chips"><span>Если бы мы были богатыми…</span>',
        '<span>Если бы они знали правду…</span></div>',

        '<h4>4. На твоём месте я бы…</h4>',
        '<p>Bu konstruksiya maslahat berish uchun ishlatiladi. Ma’nosi: ',
        '“Sening o‘rningda bo‘lganimda, men…”</p>',
        '<p><b>Formula:</b> На твоём месте я бы + fe’l</p>',
        '<table class="b2g-t"><tr><th>Rus tilida</th><th>Tarjima</th></tr>',
            '<tr><td>На твоём месте я бы согласился.</td>',
                '<td>Sening o‘rningda bo‘lganimda, rozi bo‘lardim.</td></tr>',
            '<tr><td>На твоём месте я бы не спешил.</td>',
                '<td>Sening o‘rningda bo‘lganimda, shoshilmasdim.</td></tr>',
            '<tr><td>На твоём месте я бы поговорил с ним.</td>',
                '<td>Sening o‘rningda bo‘lganimda, u bilan gaplashardim.</td></tr>',
            '<tr><td>На твоём месте я бы выбрал другую работу.</td>',
                '<td>Sening o‘rningda bo‘lganimda, boshqa ishni tanlardim.</td></tr>',
        '</table>',

        '<h4>5. Если бы… — orzu va afsuslanish</h4>',
        '<p>Bu konstruksiya orzu va afsuslanishni ham ifodalashi mumkin:</p>',
        '<table class="b2g-t"><tr><th>Rus tilida</th><th>Tarjima</th></tr>',
            '<tr><td>Если бы я мог вернуться в прошлое…</td><td>Agar men o‘tmishga qayta olganimda…</td></tr>',
            '<tr><td>Если бы у меня был ещё один шанс…</td><td>Agar menda yana bir imkoniyat bo‘lganida…</td></tr>',
            '<tr><td>Если бы я мог изменить одну вещь в своей жизни…</td>',
                '<td>Agar hayotimdagi bitta narsani o‘zgartira olganimda…</td></tr>',
        '</table>',
        '<p>Davomini: <i>Если бы я мог вернуться в прошлое, я бы поступил иначе.</i> ',
        '— Agar o‘tmishga qayta olganimda, boshqacha yo‘l tutardim.</p>',

        '<h4>6. Если бы… , то…</h4>',
        '<p>Ba’zan <b>то</b> ishlatiladi, lekin majburiy emas.</p>',
        '<div class="b2g-chips">',
            '<span>Если бы у меня было больше денег, то я бы купил квартиру.</span>',
            '<span>Если бы я знал правду, то я бы не согласился.</span>',
        '</div>',
        '<p>Oddiy nutqda <b>то</b> ko‘pincha tushirib qoldiriladi: ',
        '<i>Если бы у меня было больше денег, я бы купил квартиру.</i> ✅</p>',

        '<h4>7. Muloqot uchun tayyor konstruksiyalar</h4>',
        '<table class="b2g-t"><tr><th>Konstruksiya</th><th>Tarjima</th></tr>',
            '<tr><td>Если бы я был на твоём месте, я бы…</td><td>Agar men sening o‘rningda bo‘lganimda…</td></tr>',
            '<tr><td>Если бы у меня была возможность, я бы…</td><td>Agar menda imkoniyat bo‘lganida…</td></tr>',
            '<tr><td>Если бы я мог выбирать, я бы…</td><td>Agar men tanlay olganimda…</td></tr>',
            '<tr><td>Если бы я выиграл миллион, я бы…</td><td>Agar men million yutganimda…</td></tr>',
            '<tr><td>Если бы я мог изменить прошлое, я бы…</td><td>Agar o‘tmishni o‘zgartira olganimda…</td></tr>',
            '<tr><td>На твоём месте я бы…</td><td>Sening o‘rningda bo‘lganimda…</td></tr>',
            '<tr><td>Я бы никогда не…</td><td>Men hech qachon … qilmagan bo‘lardim.</td></tr>',
            '<tr><td>Я бы предпочёл…</td><td>Men …ni afzal ko‘rardim.</td></tr>',
            '<tr><td>Я бы не стал…</td><td>Men … qilmagan bo‘lardim.</td></tr>',
        '</table>',

        '<div class="b2g-check">',
            '<h4>Qisqa qoida</h4>',
            '<ul class="b2g-list">',
                '<li><b>Если бы + o‘tgan zamon → я бы + o‘tgan zamon</b></li>',
                '<li>Если бы я имел возможность, я бы изменил свою жизнь. ',
                    '— Agar menda imkoniyat bo‘lganida, hayotimni o‘zgartirardim.</li>',
                '<li>На твоём месте я бы не боялся. ',
                    '— Sening o‘rningda bo‘lganimda, qo‘rqmasdim.</li>',
            '</ul>',
        '</div>',

        '</div>'
    ].join('');

    var LESSON_5_EXERCISES = [
        {
            id: 'ex1', type: 'input', icon: 'fa-pen', showTask: true,
            title: "1-mashq. Fe'lni to'g'ri shaklda qo'ying",
            intro: "Qavs ichidagi fe'ldan shart gapga mos shaklni yasang.",
            namuna: 'Если бы я имел время, я бы больше читал.',
            items: [
                { q: 'Если бы у меня было много денег, я бы _______ новую машину. (купить)', answer: 'купил' },
                { q: 'Если бы я знал ответ, я бы тебе _______. (сказать)', answer: 'сказал' },
                { q: 'Если бы она была здесь, она бы нам _______. (помочь)', answer: 'помогла' },
                { q: 'Если бы у нас было больше времени, мы бы _______ в путешествие. (поехать)', answer: 'поехали' },
                { q: 'Если бы он хорошо говорил по-русски, он бы _______ с русскими друзьями. (общаться)', answer: 'общался' },
                { q: 'Если бы я мог выбирать, я бы _______ в Москве. (жить)', answer: 'жил' },
                { q: 'Если бы они знали правду, они бы не _______. (молчать)', answer: 'молчали' },
                { q: 'Если бы погода была хорошей, мы бы _______ на природе. (отдыхать)', answer: 'отдыхали' },
                { q: 'Если бы ты позвонил мне, я бы тебе _______. (ответить)', answer: 'ответил' },
                { q: 'Если бы она получила эту работу, она бы много _______. (зарабатывать)', answer: 'зарабатывала' }
            ]
        },
        {
            id: 'ex2', type: 'input', icon: 'fa-pen-fancy', showTask: true,
            title: '2-mashq. Gaplarni davom ettiring',
            intro: "Shart gapning ikkinchi qismini «я бы + o'tgan zamon» shaklida davom ettiring.",
            namuna: 'Если бы я выиграл миллион, я бы купил большой дом.',
            items: [
                { q: 'Если бы у меня было больше свободного времени, я бы…', answer: 'больше путешествовал' },
                { q: 'Если бы я мог поехать в любую страну, я бы…', answer: 'поехал в Италию' },
                { q: 'Если бы я выиграл миллион долларов, я бы…', answer: 'купил дом' },
                { q: 'Если бы я мог изменить одну вещь в своей жизни, я бы…', answer: 'больше времени проводил с семьёй' },
                { q: 'Если бы у меня была возможность учиться за границей, я бы…', answer: 'учился в другой стране' },
                { q: 'Если бы я мог встретиться с известным человеком, я бы…', answer: 'поговорил с ним' },
                { q: 'Если бы я не работал завтра, я бы…', answer: 'долго спал' },
                { q: 'Если бы я мог вернуться в прошлое, я бы…', answer: 'поступил иначе' },
                { q: 'Если бы я получил второй шанс, я бы…', answer: 'исправил свою ошибку' },
                { q: 'Если бы у меня было больше денег, я бы…', answer: 'купил квартиру' }
            ]
        },
        {
            id: 'ex3', type: 'input', icon: 'fa-lightbulb', showTask: true,
            title: "3-mashq. «На твоём месте я бы…» konstruksiyasini ishlating",
            intro: "Har bir vaziyatga «На твоём месте я бы…» konstruksiyasi bilan maslahat bering.",
            namuna: 'Я не знаю, какую работу выбрать. → На твоём месте я бы выбрал эту работу.',
            items: [
                { q: 'Я хочу изучать русский язык, но у меня нет времени.', answer: 'На твоём месте я бы нашёл время для учёбы.' },
                { q: 'Я хочу купить машину, но у меня мало денег.', answer: 'На твоём месте я бы пока не покупал машину.' },
                { q: 'Я поссорился с другом.', answer: 'На твоём месте я бы поговорил с другом.' },
                { q: 'Я получил предложение о новой работе.', answer: 'На твоём месте я бы согласился.' },
                { q: 'Я хочу поехать за границу.', answer: 'На твоём месте я бы поехал.' },
                { q: 'Я боюсь начать новый бизнес.', answer: 'На твоём месте я бы попробовал.' },
                { q: 'Я не знаю, какой университет выбрать.', answer: 'На твоём месте я бы выбрал университет, который мне нравится.' },
                { q: 'Я устал от своей работы.', answer: 'На твоём месте я бы поискал новую работу.' },
                { q: 'Я не знаю, стоит ли мне изучать иностранный язык.', answer: 'На твоём месте я бы обязательно изучал иностранный язык.' },
                { q: 'Я хочу изменить свою жизнь.', answer: 'На твоём месте я бы начал с маленьких изменений.' }
            ]
        },
        {
            id: 'ex4', type: 'input', icon: 'fa-code-merge', showTask: true,
            title: "4-mashq. Ikki gapni «если бы» yordamida birlashtiring",
            intro: "Ikki gapni bitta shart gapga aylantiring.",
            namuna: 'У меня есть время. Я больше читаю. → Если бы у меня было больше времени, я бы больше читал.',
            items: [
                { q: 'У меня есть деньги. Я покупаю новую квартиру.', answer: 'Если бы у меня были деньги, я бы купил новую квартиру.' },
                { q: 'Она знает правду. Она говорит нам всё.', answer: 'Если бы она знала правду, она бы сказала нам всё.' },
                { q: 'Мы имеем возможность. Мы путешествуем по миру.', answer: 'Если бы у нас была возможность, мы бы путешествовали по миру.' },
                { q: 'Он умеет водить. Он покупает машину.', answer: 'Если бы он умел водить, он бы купил машину.' },
                { q: 'Я знаю английский язык. Я работаю за границей.', answer: 'Если бы я знал английский язык, я бы работал за границей.' },
                { q: 'У них есть свободное время. Они занимаются спортом.', answer: 'Если бы у них было свободное время, они бы занимались спортом.' },
                { q: 'Ты приходишь раньше. Мы разговариваем.', answer: 'Если бы ты пришёл раньше, мы бы поговорили.' },
                { q: 'Я могу изменить прошлое. Я исправляю свою ошибку.', answer: 'Если бы я мог изменить прошлое, я бы исправил свою ошибку.' },
                { q: 'Она получает эту работу. Она переезжает в другой город.', answer: 'Если бы она получила эту работу, она бы переехала в другой город.' },
                { q: 'Мы живём ближе. Мы чаще встречаемся.', answer: 'Если бы мы жили ближе, мы бы чаще встречались.' }
            ]
        },
        {
            id: 'ex5', type: 'choice', style: 'test', icon: 'fa-check-double', showTask: true,
            title: "5-mashq. To'g'ri variantni tanlang",
            intro: "Shart gapga mos keladigan fe'l shaklini tanlang.",
            namuna: 'Если бы я был богатым, я (куплю / купил бы) большой дом. → купил бы',
            items: [
                { q: 'Если бы я знал ответ, я ... тебе.', options: ['скажу', 'сказал бы'], answer: 'сказал бы' },
                { q: 'Если бы у меня было время, я ... в спортзал.', options: ['пойду', 'пошёл бы'], answer: 'пошёл бы' },
                { q: 'Если бы она была здесь, она ... нам.', options: ['поможет', 'помогла бы'], answer: 'помогла бы' },
                { q: 'Если бы мы были богатыми, мы ... больше.', options: ['путешествуем', 'путешествовали бы'], answer: 'путешествовали бы' },
                { q: 'Если бы ты спросил меня, я ... всё.', options: ['объясню', 'объяснил бы'], answer: 'объяснил бы' },
                { q: 'Если бы он умел готовить, он ... ужин.', options: ['приготовит', 'приготовил бы'], answer: 'приготовил бы' },
                { q: 'Если бы у меня была машина, я ... на работу на машине.', options: ['езжу', 'ездил бы'], answer: 'ездил бы' },
                { q: 'Если бы они пришли раньше, мы ... встречу раньше.', options: ['начнём', 'начали бы'], answer: 'начали бы' },
                { q: 'Если бы я мог выбирать, я ... первый вариант.', options: ['выбираю', 'выбрал бы'], answer: 'выбрал бы' },
                { q: 'Если бы она знала русский язык, она ... в России.', options: ['работает', 'работала бы'], answer: 'работала бы' }
            ]
        },
        {
            id: 'ex6', type: 'input', icon: 'fa-wrench', showTask: true,
            title: '6-mashq. Xatoni toping va tuzating',
            intro: "«Если бы» dan keyin fe'l o'tgan zamonda bo'lishi kerak. Gapni to'g'rilab yozing.",
            namuna: '❌ Если бы я знаю, я бы сказал. → ✅ Если бы я знал, я бы сказал.',
            items: [
                { q: 'Если бы я имею деньги, я бы купил машину.', answer: 'Если бы я имел деньги, я бы купил машину.' },
                { q: 'Если бы она знает правду, она бы рассказала нам.', answer: 'Если бы она знала правду, она бы рассказала нам.' },
                { q: 'Если бы мы будем свободны, мы бы поехали.', answer: 'Если бы мы были свободны, мы бы поехали.' },
                { q: 'Если бы ты пришёл раньше, я бы встречаю тебя.', answer: 'Если бы ты пришёл раньше, я бы встретил тебя.' },
                { q: 'Если бы он может, он бы помог.', answer: 'Если бы он мог, он бы помог.' },
                { q: 'Если бы у меня есть время, я бы больше читал.', answer: 'Если бы у меня было время, я бы больше читал.' },
                { q: 'Если бы они были здесь, они помогают нам.', answer: 'Если бы они были здесь, они помогли бы нам.' },
                { q: 'Если бы я могу выбирать, я бы выбрал другой вариант.', answer: 'Если бы я мог выбирать, я бы выбрал другой вариант.' },
                { q: 'Если бы она получила работу, она будет очень рада.', answer: 'Если бы она получила работу, она была бы очень рада.' },
                { q: 'Если бы ты спросил меня, я отвечу тебе.', answer: 'Если бы ты спросил меня, я ответил бы тебе.' }
            ]
        },
        {
            id: 'ex7', type: 'input', icon: 'fa-language', showTask: true,
            title: "7-mashq. O'zbek tilidan rus tiliga tarjima qiling",
            intro: "Gaplarni rus tiliga tarjima qiling va shart konstruksiyasini ishlating.",
            namuna: "Agar vaqtim ko'proq bo'lganida, ko'proq kitob o'qirdim. → Если бы у меня было больше времени, я бы больше читал.",
            items: [
                { q: "Agar pulim ko'p bo'lganida, uy sotib olardim.", answer: 'Если бы у меня было много денег, я бы купил дом.' },
                { q: "Agar men sening o'rningda bo'lganimda, bu ishni qabul qilardim.", answer: 'На твоём месте я бы согласился на эту работу.' },
                { q: 'Agar u haqiqatni bilganida, bizga aytardi.', answer: 'Если бы он знал правду, он бы сказал нам.' },
                { q: "Agar vaqtimiz bo'lganida, sayohatga borardik.", answer: 'Если бы у нас было время, мы бы поехали в путешествие.' },
                { q: 'Agar men tanlay olganimda, Moskvada yashardim.', answer: 'Если бы я мог выбирать, я бы жил в Москве.' },
                { q: "Agar u bu yerda bo'lganida, bizga yordam berardi.", answer: 'Если бы она была здесь, она бы помогла нам.' },
                { q: "Agar men million yutganimda, dunyo bo'ylab sayohat qilardim.", answer: 'Если бы я выиграл миллион, я бы путешествовал по миру.' },
                { q: "Agar sen mendan so'raganingda, yordam bergan bo'lardim.", answer: 'Если бы ты спросил меня, я бы помог тебе.' },
                { q: 'Agar ular ertaroq kelganida, biz uchrashgan bo‘lardik.', answer: 'Если бы они пришли раньше, мы бы встретились.' },
                { q: "Agar men o'tmishga qayta olganimda, xatolarimni tuzatardim.", answer: 'Если бы я мог вернуться в прошлое, я бы исправил свои ошибки.' }
            ]
        },
        {
            id: 'ex8', type: 'input', icon: 'fa-pen-to-square', showTask: true,
            title: "8-mashq. «Я бы / я бы не» bilan gap tuzing",
            intro: "Berilgan so'zlardan «я бы» konstruksiyasi bilan to'liq gap tuzing.",
            namuna: 'купить / эту машину → Я бы купил эту машину.',
            items: [
                { q: 'поехать / в Италию', answer: 'Я бы поехал в Италию.' },
                { q: 'купить / большой дом', answer: 'Я бы купил большой дом.' },
                { q: 'не менять / работу', answer: 'Я бы не менял работу.' },
                { q: 'начать / изучать китайский язык', answer: 'Я бы начал изучать китайский язык.' },
                { q: 'больше путешествовать', answer: 'Я бы больше путешествовал.' },
                { q: 'не соглашаться / на это предложение', answer: 'Я бы не согласился на это предложение.' },
                { q: 'открыть / свой бизнес', answer: 'Я бы открыл свой бизнес.' },
                { q: 'переехать / в другой город', answer: 'Я бы переехал в другой город.' },
                { q: 'больше времени проводить / с семьёй', answer: 'Я бы больше времени проводил с семьёй.' },
                { q: 'не возвращаться / в прошлое', answer: 'Я бы не возвращался в прошлое.' }
            ]
        },
        {
            id: 'ex9', type: 'input', icon: 'fa-comments', showTask: true,
            title: '9-mashq. Savolga javob bering',
            intro: "Savolga shart konstruksiyasi bilan to'liq javob yozing.",
            namuna: 'Что бы ты сделал, если бы выиграл миллион? → Если бы я выиграл миллион, я бы купил дом.',
            /* OPEN TASK — same mechanism as Topic 3: the material's «Namunaviy
               javob» first, then the same answer as a bare continuation. */
            items: [
                { q: 'Что бы ты сделал, если бы мог жить в любой стране?',
                  answer: ['Если бы я мог жить в любой стране, я бы жил в Испании.', 'я бы жил в Испании', 'жил в Испании'] },
                { q: 'Что бы ты купил, если бы у тебя было много денег?',
                  answer: ['Если бы у меня было много денег, я бы купил дом.', 'я бы купил дом', 'купил дом'] },
                { q: 'Куда бы ты поехал, если бы у тебя был бесплатный билет?',
                  answer: ['Если бы у меня был бесплатный билет, я бы поехал в Японию.', 'я бы поехал в Японию', 'поехал в Японию'] },
                { q: 'Что бы ты изменил в своей жизни?',
                  answer: ['Если бы я мог, я бы изменил некоторые решения.', 'я бы изменил некоторые решения', 'изменил некоторые решения'] },
                { q: 'Что бы ты сделал, если бы потерял работу?',
                  answer: ['Если бы я потерял работу, я бы нашёл новую.', 'я бы нашёл новую', 'нашёл новую'] },
                { q: 'Что бы ты сделал, если бы получил миллион долларов?',
                  answer: ['Если бы я получил миллион долларов, я бы инвестировал деньги.', 'я бы инвестировал деньги', 'инвестировал деньги'] },
                { q: 'Кого бы ты пригласил на ужин, если бы мог выбрать любого человека?',
                  answer: ['Я бы пригласил на ужин известного актёра.', 'пригласил на ужин известного актёра'] },
                { q: 'Какую профессию ты бы выбрал, если бы мог начать всё сначала?',
                  answer: ['Я бы выбрал профессию врача.', 'выбрал профессию врача'] },
                { q: 'Что бы ты сделал, если бы у тебя был целый год свободного времени?',
                  answer: ['Я бы много путешествовал.', 'много путешествовал'] },
                { q: 'Что бы ты посоветовал другу, если бы он хотел изменить свою жизнь?',
                  answer: ['На его месте я бы начал с небольших изменений.', 'начал с небольших изменений'] }
            ]
        },
        {
            id: 'ex10', type: 'input', icon: 'fa-comment-dots', showTask: true,
            title: "10-mashq. Dialogni to'ldiring",
            intro: "Dialogdagi bo'sh joyni shart konstruksiyasi bilan to'ldiring.",
            namuna: '— Что бы ты сделал, если бы выиграл миллион? — Если бы я выиграл миллион, я бы купил дом.',
            /* OPEN TASK — sample answer first, then the same answer written as a
               full reply built from the prompt's own stem. */
            items: [
                { q: '— Я не знаю, какую работу выбрать. — На твоём месте я бы __________.',
                  answer: ['На твоём месте я бы выбрал работу, которая мне нравится.', 'выбрал работу, которая мне нравится'] },
                { q: '— У меня нет времени на спорт. — Если бы у тебя было больше времени, ты бы __________.',
                  answer: ['занимался спортом', 'Если бы у тебя было больше времени, ты бы занимался спортом.'] },
                { q: '— Что бы ты сделал, если бы мог жить где угодно? — Если бы я мог жить где угодно, я бы __________.',
                  answer: ['жил в Испании', 'Если бы я мог жить где угодно, я бы жил в Испании.'] },
                { q: '— Я хочу открыть бизнес, но боюсь. — На твоём месте я бы __________.',
                  answer: ['попробовал', 'На твоём месте я бы попробовал.'] },
                { q: '— Что бы ты сделал, если бы мог изменить прошлое? — Если бы я мог изменить прошлое, я бы __________.',
                  answer: ['исправил некоторые ошибки', 'Если бы я мог изменить прошлое, я бы исправил некоторые ошибки.'] },
                { q: '— У меня мало денег, но я хочу путешествовать. — Если бы у тебя было больше денег, ты бы __________.',
                  answer: ['поехал в путешествие', 'Если бы у тебя было больше денег, ты бы поехал в путешествие.'] },
                { q: '— Ты хочешь изучать ещё один язык? — Да. Если бы у меня было время, я бы __________.',
                  answer: ['изучал английский язык', 'Если бы у меня было время, я бы изучал английский язык.'] },
                { q: '— Что бы ты купил, если бы выиграл миллион? — Если бы я выиграл миллион, я бы __________.',
                  answer: ['купил квартиру', 'Если бы я выиграл миллион, я бы купил квартиру.'] },
                { q: '— Мне предложили переехать в другой город. Что делать? — На твоём месте я бы __________.',
                  answer: ['согласился', 'На твоём месте я бы согласился.'] },
                { q: '— Что бы ты сделал, если бы получил второй шанс? — Если бы я получил второй шанс, я бы __________.',
                  answer: ['поступил по-другому', 'Если бы я получил второй шанс, я бы поступил по-другому.'] }
            ]
        },
        {
            id: 'audio1', type: 'choice', style: 'tf', icon: 'fa-headphones', showTask: true,
            audioSrc: 'audios/%D0%912%205%20%D1%83%D1%80%D0%BE%D0%BA.mp3',
            title: "Matn bo'yicha «Rost yoki yolg'on» mashqi",
            intro: "«Если бы у меня была возможность начать всё сначала» audio matnini tinglang va gaplar «Правда» yoki «Ложь» ekanini aniqlang.",
            items: [
                { q: "Muallif hayotini boshidan boshlash imkoniyati haqida o'ylaydi.", options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: "Muallif o'tmishdagi barcha qarorlarini o'zgartirmoqchi.", options: ['Правда', 'Ложь'], answer: 'Ложь' },
                { q: 'Muallif xatolar va qiyinchiliklar insonni kuchliroq qiladi, deb hisoblaydi.', options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: "Agar u o'tmishga qayta olsa, ko'proq sayohat qilgan bo'lardi.", options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: "Muallif chet tillarini o'rganishga qiziqmaydi.", options: ['Правда', 'Ложь'], answer: 'Ложь' },
                { q: "Agar uning bo'sh vaqti ko'proq bo'lganida, har yili yangi mamlakatga borgan bo'lardi.", options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: "Agar ko'p puli bo'lganida, u faqat qimmatbaho narsalar sotib olgan bo'lardi.", options: ['Правда', 'Ложь'], answer: 'Ложь' },
                { q: "Muallif pulining bir qismini ta'limga sarflashni xohlaydi.", options: ['Правда', 'Ложь'], answer: 'Правда' },
                { q: "Muallifning fikricha, biz o'tmishni o'zgartira olamiz.", options: ['Правда', 'Ложь'], answer: 'Ложь' },
                { q: "Muallif o'zining o'tmishdagi holatiga xato qilishdan qo'rqmaslikni maslahat bergan bo'lardi.", options: ['Правда', 'Ложь'], answer: 'Правда' }
            ]
        }
    ];

    global.B2_LESSON_DATA = {
        course: 'b2',
        topics: [
            {
                id: 1,
                title: 'Shaxsiy qarashlar va hayotiy pozitsiya',
                description: "Grammatika: Сложноподчинённые предложения — murakkab ergash gapli qo'shma gaplar",
                isLocked: false,
                isSubscriptionLocked: false,
                grammar: LESSON_1_GRAMMAR,
                exercises: LESSON_1_EXERCISES
            },
            {
                id: 2,
                title: 'Причастие',
                description: 'Grammatika: Причастие (sifatdosh) — odam, joy va narsalarni batafsil tasvirlash',
                isLocked: false,
                isSubscriptionLocked: false,
                grammar: LESSON_2_GRAMMAR,
                exercises: LESSON_2_EXERCISES
            },
            {
                id: 3,
                title: 'Деепричастие',
                description: 'Grammatika: Деепричастие (ravishdosh) — bir vaqtda va ketma-ket harakatlar',
                isLocked: false,
                isSubscriptionLocked: false,
                grammar: LESSON_3_GRAMMAR,
                exercises: LESSON_3_EXERCISES
            },
            {
                id: 4,
                title: 'Прямая и косвенная речь',
                description: "Grammatika: To'g'ri va o'zlashtirma gap — boshqalarning so'zini yetkazish",
                isLocked: false,
                isSubscriptionLocked: false,
                grammar: LESSON_4_GRAMMAR,
                exercises: LESSON_4_EXERCISES
            },
            {
                id: 5,
                title: 'Условные предложения',
                description: "Grammatika: Shart gaplar — «Если бы…, я бы…», «На твоём месте я бы…»",
                isLocked: false,
                isSubscriptionLocked: false,
                grammar: LESSON_5_GRAMMAR,
                exercises: LESSON_5_EXERCISES
            }
        ]
    };
})(typeof window !== 'undefined' ? window : this);
