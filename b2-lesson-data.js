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
                { q: "Men uyga ketayotib, do'stimni uchratdim.", answer: ['Идя домой, я встретил друга.', 'Идя домой, я встретила друга.'] },
                { q: 'U nonushta tayyorlayotib, televizor ko‘rdi.', answer: 'Готовя завтрак, она смотрела телевизор.' },
                { q: "Filmni ko'rib bo'lib, biz uni muhokama qildik.", answer: 'Посмотрев фильм, мы обсудили его.' },
                { q: 'Xatni o‘qib, u javob yozdi.', answer: 'Прочитав письмо, он написал ответ.' },
                { q: "Rus tilini o'rganayotib, men ko'p mashq qilaman.", answer: 'Изучая русский язык, я много практикуюсь.' },
                { q: 'Uyga kelib, u dam oldi.', answer: 'Придя домой, он отдохнул.' },
                { q: 'Ishlayotib, u musiqa tingladi.', answer: 'Работая, он слушал музыку.' },
                { q: "Vazifani bajarib bo'lib, men sayrga chiqdim.", answer: ['Сделав задание, я пошёл гулять.', 'Сделав задание, я пошла гулять.'] }
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
                           'я слушал музыку', 'я разговаривал по телефону',
                           'Идя домой, я встретила друга.', 'Идя домой, я встретила учителя.', 'Идя домой, я встретила подругу.', 'Идя домой, я слушала музыку.', 'Идя домой, я разговаривала по телефону.', 'я встретила друга', 'я встретила учителя', 'я встретила подругу', 'я слушала музыку', 'я разговаривала по телефону'] },
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
                           'я много практикуюсь', 'я смотрю русские фильмы',
                           'Изучая русский язык, я смотрела сериалы.', 'я смотрела сериалы'] },
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
                           'я пошёл спать', 'я отдохнул',
                           'Сделав домашнее задание, я пошла спать.', 'Сделав домашнее задание, я отдохнула.', 'я пошла спать', 'я отдохнула'] },
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
                { q: "Kitob o'qiyotib, men choy ichdim.", answer: ['Читая книгу, я пил чай.', 'Читая книгу, я пила чай.'] },
                { q: 'Ishni tugatib, u uyiga ketdi.', answer: 'Закончив работу, он пошёл домой.' },
                { q: "Uyga ketayotib, men do'stimni uchratdim.", answer: ['Идя домой, я встретил друга.', 'Идя домой, я встретила друга.'] },
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
                { q: 'Идя домой, начался дождь.', answer: ['Когда я шёл домой, начался дождь.', 'Когда я шла домой, начался дождь.'] },
                { q: 'Читая книгу, мне стало скучно.', answer: ['Читая книгу, я заскучал.', 'Читая книгу, я заскучала.'] },
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
                { q: 'Я хочу изучать русский язык, но у меня нет времени.', answer: ['На твоём месте я бы нашёл время для учёбы.', 'На твоём месте я бы нашла время для учёбы.'] },
                { q: 'Я хочу купить машину, но у меня мало денег.', answer: ['На твоём месте я бы пока не покупал машину.', 'На твоём месте я бы пока не покупала машину.'] },
                { q: 'Я поссорился с другом.', answer: ['На твоём месте я бы поговорил с другом.', 'На твоём месте я бы поговорила с другом.'] },
                { q: 'Я получил предложение о новой работе.', answer: ['На твоём месте я бы согласился.', 'На твоём месте я бы согласилась.'] },
                { q: 'Я хочу поехать за границу.', answer: ['На твоём месте я бы поехал.', 'На твоём месте я бы поехала.'] },
                { q: 'Я боюсь начать новый бизнес.', answer: ['На твоём месте я бы попробовал.', 'На твоём месте я бы попробовала.'] },
                { q: 'Я не знаю, какой университет выбрать.', answer: ['На твоём месте я бы выбрал университет, который мне нравится.', 'На твоём месте я бы выбрала университет, который мне нравится.'] },
                { q: 'Я устал от своей работы.', answer: ['На твоём месте я бы поискал новую работу.', 'На твоём месте я бы поискала новую работу.'] },
                { q: 'Я не знаю, стоит ли мне изучать иностранный язык.', answer: ['На твоём месте я бы обязательно изучал иностранный язык.', 'На твоём месте я бы обязательно изучала иностранный язык.'] },
                { q: 'Я хочу изменить свою жизнь.', answer: ['На твоём месте я бы начал с маленьких изменений.', 'На твоём месте я бы начала с маленьких изменений.'] }
            ]
        },
        {
            id: 'ex4', type: 'input', icon: 'fa-code-merge', showTask: true,
            title: "4-mashq. Ikki gapni «если бы» yordamida birlashtiring",
            intro: "Ikki gapni bitta shart gapga aylantiring.",
            namuna: 'У меня есть время. Я больше читаю. → Если бы у меня было больше времени, я бы больше читал.',
            items: [
                { q: 'У меня есть деньги. Я покупаю новую квартиру.', answer: ['Если бы у меня были деньги, я бы купил новую квартиру.', 'Если бы у меня были деньги, я бы купила новую квартиру.'] },
                { q: 'Она знает правду. Она говорит нам всё.', answer: 'Если бы она знала правду, она бы сказала нам всё.' },
                { q: 'Мы имеем возможность. Мы путешествуем по миру.', answer: 'Если бы у нас была возможность, мы бы путешествовали по миру.' },
                { q: 'Он умеет водить. Он покупает машину.', answer: 'Если бы он умел водить, он бы купил машину.' },
                { q: 'Я знаю английский язык. Я работаю за границей.', answer: ['Если бы я знал английский язык, я бы работал за границей.', 'Если бы я знала английский язык, я бы работала за границей.'] },
                { q: 'У них есть свободное время. Они занимаются спортом.', answer: 'Если бы у них было свободное время, они бы занимались спортом.' },
                { q: 'Ты приходишь раньше. Мы разговариваем.', answer: 'Если бы ты пришёл раньше, мы бы поговорили.' },
                { q: 'Я могу изменить прошлое. Я исправляю свою ошибку.', answer: ['Если бы я мог изменить прошлое, я бы исправил свою ошибку.', 'Если бы я могла изменить прошлое, я бы исправила свою ошибку.'] },
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
                { q: 'Если бы я имею деньги, я бы купил машину.', answer: ['Если бы я имел деньги, я бы купил машину.', 'Если бы я имела деньги, я бы купила машину.'] },
                { q: 'Если бы она знает правду, она бы рассказала нам.', answer: 'Если бы она знала правду, она бы рассказала нам.' },
                { q: 'Если бы мы будем свободны, мы бы поехали.', answer: 'Если бы мы были свободны, мы бы поехали.' },
                { q: 'Если бы ты пришёл раньше, я бы встречаю тебя.', answer: ['Если бы ты пришёл раньше, я бы встретил тебя.', 'Если бы ты пришёл раньше, я бы встретила тебя.'] },
                { q: 'Если бы он может, он бы помог.', answer: 'Если бы он мог, он бы помог.' },
                { q: 'Если бы у меня есть время, я бы больше читал.', answer: 'Если бы у меня было время, я бы больше читал.' },
                { q: 'Если бы они были здесь, они помогают нам.', answer: 'Если бы они были здесь, они помогли бы нам.' },
                { q: 'Если бы я могу выбирать, я бы выбрал другой вариант.', answer: 'Если бы я мог выбирать, я бы выбрал другой вариант.' },
                { q: 'Если бы она получила работу, она будет очень рада.', answer: 'Если бы она получила работу, она была бы очень рада.' },
                { q: 'Если бы ты спросил меня, я отвечу тебе.', answer: ['Если бы ты спросил меня, я ответил бы тебе.', 'Если бы ты спросил меня, я ответила бы тебе.'] }
            ]
        },
        {
            id: 'ex7', type: 'input', icon: 'fa-language', showTask: true,
            title: "7-mashq. O'zbek tilidan rus tiliga tarjima qiling",
            intro: "Gaplarni rus tiliga tarjima qiling va shart konstruksiyasini ishlating.",
            namuna: "Agar vaqtim ko'proq bo'lganida, ko'proq kitob o'qirdim. → Если бы у меня было больше времени, я бы больше читал.",
            items: [
                { q: "Agar pulim ko'p bo'lganida, uy sotib olardim.", answer: ['Если бы у меня было много денег, я бы купил дом.', 'Если бы у меня было много денег, я бы купила дом.'] },
                { q: "Agar men sening o'rningda bo'lganimda, bu ishni qabul qilardim.", answer: ['На твоём месте я бы согласился на эту работу.', 'На твоём месте я бы согласилась на эту работу.'] },
                { q: 'Agar u haqiqatni bilganida, bizga aytardi.', answer: 'Если бы он знал правду, он бы сказал нам.' },
                { q: "Agar vaqtimiz bo'lganida, sayohatga borardik.", answer: 'Если бы у нас было время, мы бы поехали в путешествие.' },
                { q: 'Agar men tanlay olganimda, Moskvada yashardim.', answer: ['Если бы я мог выбирать, я бы жил в Москве.', 'Если бы я могла выбирать, я бы жила в Москве.'] },
                { q: "Agar u bu yerda bo'lganida, bizga yordam berardi.", answer: 'Если бы она была здесь, она бы помогла нам.' },
                { q: "Agar men million yutganimda, dunyo bo'ylab sayohat qilardim.", answer: ['Если бы я выиграл миллион, я бы путешествовал по миру.', 'Если бы я выиграла миллион, я бы путешествовала по миру.'] },
                { q: "Agar sen mendan so'raganingda, yordam bergan bo'lardim.", answer: 'Если бы ты спросил меня, я бы помог тебе.' },
                { q: 'Agar ular ertaroq kelganida, biz uchrashgan bo‘lardik.', answer: 'Если бы они пришли раньше, мы бы встретились.' },
                { q: "Agar men o'tmishga qayta olganimda, xatolarimni tuzatardim.", answer: ['Если бы я мог вернуться в прошлое, я бы исправил свои ошибки.', 'Если бы я могла вернуться в прошлое, я бы исправила свои ошибки.'] }
            ]
        },
        {
            id: 'ex8', type: 'input', icon: 'fa-pen-to-square', showTask: true,
            title: "8-mashq. «Я бы / я бы не» bilan gap tuzing",
            intro: "Berilgan so'zlardan «я бы» konstruksiyasi bilan to'liq gap tuzing.",
            namuna: 'купить / эту машину → Я бы купил эту машину.',
            items: [
                { q: 'поехать / в Италию', answer: ['Я бы поехал в Италию.', 'Я бы поехала в Италию.'] },
                { q: 'купить / большой дом', answer: ['Я бы купил большой дом.', 'Я бы купила большой дом.'] },
                { q: 'не менять / работу', answer: ['Я бы не менял работу.', 'Я бы не меняла работу.'] },
                { q: 'начать / изучать китайский язык', answer: ['Я бы начал изучать китайский язык.', 'Я бы начала изучать китайский язык.'] },
                { q: 'больше путешествовать', answer: ['Я бы больше путешествовал.', 'Я бы больше путешествовала.'] },
                { q: 'не соглашаться / на это предложение', answer: ['Я бы не согласился на это предложение.', 'Я бы не согласилась на это предложение.'] },
                { q: 'открыть / свой бизнес', answer: ['Я бы открыл свой бизнес.', 'Я бы открыла свой бизнес.'] },
                { q: 'переехать / в другой город', answer: ['Я бы переехал в другой город.', 'Я бы переехала в другой город.'] },
                { q: 'больше времени проводить / с семьёй', answer: ['Я бы больше времени проводил с семьёй.', 'Я бы больше времени проводила с семьёй.'] },
                { q: 'не возвращаться / в прошлое', answer: ['Я бы не возвращался в прошлое.', 'Я бы не возвращалась в прошлое.'] }
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
                  answer: ['Если бы я мог жить в любой стране, я бы жил в Испании.', 'я бы жил в Испании', 'жил в Испании',
                  'Если бы я могла жить в любой стране, я бы жила в Испании.', 'я бы жила в Испании'] },
                { q: 'Что бы ты купил, если бы у тебя было много денег?',
                  answer: ['Если бы у меня было много денег, я бы купил дом.', 'я бы купил дом', 'купил дом'] },
                { q: 'Куда бы ты поехал, если бы у тебя был бесплатный билет?',
                  answer: ['Если бы у меня был бесплатный билет, я бы поехал в Японию.', 'я бы поехал в Японию', 'поехал в Японию'] },
                { q: 'Что бы ты изменил в своей жизни?',
                  answer: ['Если бы я мог, я бы изменил некоторые решения.', 'я бы изменил некоторые решения', 'изменил некоторые решения',
                  'Если бы я могла, я бы изменила некоторые решения.', 'я бы изменила некоторые решения'] },
                { q: 'Что бы ты сделал, если бы потерял работу?',
                  answer: ['Если бы я потерял работу, я бы нашёл новую.', 'я бы нашёл новую', 'нашёл новую',
                  'Если бы я потеряла работу, я бы нашла новую.', 'я бы нашла новую'] },
                { q: 'Что бы ты сделал, если бы получил миллион долларов?',
                  answer: ['Если бы я получил миллион долларов, я бы инвестировал деньги.', 'я бы инвестировал деньги', 'инвестировал деньги',
                  'Если бы я получила миллион долларов, я бы инвестировала деньги.', 'я бы инвестировала деньги'] },
                { q: 'Кого бы ты пригласил на ужин, если бы мог выбрать любого человека?',
                  answer: ['Я бы пригласил на ужин известного актёра.', 'пригласил на ужин известного актёра'] },
                { q: 'Какую профессию ты бы выбрал, если бы мог начать всё сначала?',
                  answer: ['Я бы выбрал профессию врача.', 'выбрал профессию врача'] },
                { q: 'Что бы ты сделал, если бы у тебя был целый год свободного времени?',
                  answer: ['Я бы много путешествовал.', 'много путешествовал',
                  'Я бы много путешествовала.'] },
                { q: 'Что бы ты посоветовал другу, если бы он хотел изменить свою жизнь?',
                  answer: ['На его месте я бы начал с небольших изменений.', 'начал с небольших изменений',
                  'На его месте я бы начала с небольших изменений.'] }
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
                  answer: ['На твоём месте я бы выбрал работу, которая мне нравится.', 'выбрал работу, которая мне нравится',
                  'На твоём месте я бы выбрала работу, которая мне нравится.'] },
                { q: '— У меня нет времени на спорт. — Если бы у тебя было больше времени, ты бы __________.',
                  answer: ['занимался спортом', 'Если бы у тебя было больше времени, ты бы занимался спортом.'] },
                { q: '— Что бы ты сделал, если бы мог жить где угодно? — Если бы я мог жить где угодно, я бы __________.',
                  answer: ['жил в Испании', 'Если бы я мог жить где угодно, я бы жил в Испании.'] },
                { q: '— Я хочу открыть бизнес, но боюсь. — На твоём месте я бы __________.',
                  answer: ['попробовал', 'На твоём месте я бы попробовал.',
                  'На твоём месте я бы попробовала.'] },
                { q: '— Что бы ты сделал, если бы мог изменить прошлое? — Если бы я мог изменить прошлое, я бы __________.',
                  answer: ['исправил некоторые ошибки', 'Если бы я мог изменить прошлое, я бы исправил некоторые ошибки.'] },
                { q: '— У меня мало денег, но я хочу путешествовать. — Если бы у тебя было больше денег, ты бы __________.',
                  answer: ['поехал в путешествие', 'Если бы у тебя было больше денег, ты бы поехал в путешествие.'] },
                { q: '— Ты хочешь изучать ещё один язык? — Да. Если бы у меня было время, я бы __________.',
                  answer: ['изучал английский язык', 'Если бы у меня было время, я бы изучал английский язык.',
                  'Если бы у меня было время, я бы изучала английский язык.'] },
                { q: '— Что бы ты купил, если бы выиграл миллион? — Если бы я выиграл миллион, я бы __________.',
                  answer: ['купил квартиру', 'Если бы я выиграл миллион, я бы купил квартиру.'] },
                { q: '— Мне предложили переехать в другой город. Что делать? — На твоём месте я бы __________.',
                  answer: ['согласился', 'На твоём месте я бы согласился.',
                  'На твоём месте я бы согласилась.'] },
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

    var LESSON_6_GRAMMAR = "<div class=\"b2g\"><div class=\"b2g-lead\"><div class=\"b2g-lead-title\">Сравнительные конструкции — Taqqoslash konstruksiyalari</div><p>Bu konstruksiyalar odamlar, shaharlar, mamlakatlar, narsalar va hayot tarzlarini taqqoslash uchun ishlatiladi.</p></div><h4>1. Чем …, тем … — Qancha …, shuncha …</h4><p>Bu konstruksiya ikki holat o‘rtasidagi bog‘liqlikni ko‘rsatadi.</p><p><b>Formula:</b> Чем + сравнительная степень, тем + сравнительная степень</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Чем больше город, тем больше в нём возможностей.</td><td>Shahar qancha katta bo‘lsa, undagi imkoniyatlar shuncha ko‘p.</td></tr><tr><td>Чем больше человек работает, тем больше он устаёт.</td><td>Odam qancha ko‘p ishlasa, shuncha ko‘p charchaydi.</td></tr><tr><td>Чем дольше я живу здесь, тем больше мне нравится этот город.</td><td>Bu yerda qancha uzoq yashasam, bu shahar menga shuncha ko‘proq yoqadi.</td></tr><tr><td>Чем выше зарплата, тем больше люди могут путешествовать.</td><td>Maosh qancha yuqori bo‘lsa, odamlar shuncha ko‘proq sayohat qila oladi.</td></tr><tr><td>Чем современнее город, тем дороже в нём жильё.</td><td>Shahar qancha zamonaviy bo‘lsa, undagi uy-joy shuncha qimmat.</td></tr></table><p><b>Muhim:</b> bu konstruksiyada ko‘pincha quyidagi shakllar ishlatiladi:</p><div class=\"b2g-chips\"><span>больше</span><span>меньше</span><span>выше</span><span>ниже</span><span>дороже</span><span>дешевле</span><span>лучше</span><span>хуже</span><span>быстрее</span><span>медленнее</span></div><h4>2. Такой же …, как … — Xuddi shunday …, kabi</h4><p>Ikki odam yoki narsaning bir xil, o‘xshash xususiyatini ko‘rsatadi. <b>Такой</b> ega bilan jins va songa moslashadi.</p><table class=\"b2g-t\"><tr><th>Shakl</th><th>Namuna</th></tr><tr><td>такой же — erkak jins</td><td>такой же большой город</td></tr><tr><td>такая же — ayol jins</td><td>такая же красивая улица</td></tr><tr><td>такое же — o‘rta jins</td><td>такое же современное здание</td></tr><tr><td>такие же — ko‘plik</td><td>такие же интересные люди</td></tr></table><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Ташкент такой же большой, как Москва.</td><td>Toshkent Moskva kabi katta.</td></tr><tr><td>Моя квартира такая же светлая, как твоя.</td><td>Mening kvartiram senikidek yorug‘.</td></tr><tr><td>Это кафе такое же уютное, как ресторан.</td><td>Bu kafe restoran kabi shinam.</td></tr><tr><td>Эти города такие же красивые, как европейские города.</td><td>Bu shaharlar Yevropa shaharlari kabi chiroyli.</td></tr><tr><td>Мой брат такой же спокойный, как мой отец.</td><td>Akam otam kabi xotirjam.</td></tr></table><h4>3. Гораздо … — Ancha / juda ham …roq</h4><p>Kuchli taqqoslash uchun ishlatiladi. <b>Ikki usul bor va ikkalasi ham to‘g‘ri.</b></p><p><b>1-usul:</b> гораздо + сравнительная степень</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Ташкент гораздо больше Самарканда.</td><td>Toshkent Samarqanddan ancha katta.</td></tr><tr><td>Этот город гораздо спокойнее столицы.</td><td>Bu shahar poytaxtdan ancha tinchroq.</td></tr><tr><td>Жизнь в деревне гораздо дешевле.</td><td>Qishloqdagi hayot ancha arzonroq.</td></tr><tr><td>Этот вариант гораздо лучше.</td><td>Bu variant ancha yaxshiroq.</td></tr></table><p><b>2-usul:</b> гораздо более + sifat — ayniqsa uzun sifatlar bilan</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Этот район гораздо более современный.</td><td>Bu hudud ancha zamonaviyroq.</td></tr><tr><td>Жизнь в большом городе гораздо более динамичная.</td><td>Katta shahardagi hayot ancha faolroq.</td></tr><tr><td>Этот образ жизни гораздо более комфортный.</td><td>Bu hayot tarzi ancha qulayroq.</td></tr><tr><td>Москва гораздо более шумная, чем маленькие города.</td><td>Moskva kichik shaharlarga qaraganda ancha shovqinli.</td></tr></table><p><b>Diqqat!</b> <b>более</b> ni allaqachon qiyosiy darajada turgan shakl bilan qo‘shib ishlatib bo‘lmaydi.</p><table class=\"b2g-t\"><tr><th></th><th>Gap</th></tr><tr><td>❌</td><td>более спокойнее · более удобнее · более современнее</td></tr><tr><td>✅</td><td>спокойнее · удобнее · современнее</td></tr><tr><td>✅</td><td>более спокойный · более удобный · более современный</td></tr></table><h4>4. Чем отличается … от …? — … nimasi bilan …dan farq qiladi?</h4><p>Odamlar, shaharlar va hayot tarzini taqqoslashda <b>от</b> bilan ishlatiladi.</p><p><b>Formula:</b> Чем + kim/nima + отличается от + kim/nima?</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Чем Ташкент отличается от Самарканда?</td><td>Toshkent Samarqanddan nimasi bilan farq qiladi?</td></tr><tr><td>Чем жизнь в городе отличается от жизни в деревне?</td><td>Shahardagi hayot qishloqdagi hayotdan nimasi bilan farq qiladi?</td></tr><tr><td>Чем современная молодёжь отличается от старшего поколения?</td><td>Zamonaviy yoshlar katta avloddan nimasi bilan farq qiladi?</td></tr></table><h4>5. Более …, чем … — …ga qaraganda …roq</h4><p>Oddiy taqqoslash uchun ishlatiladi. Ikkala shakl ham to‘g‘ri: <b>более + sifat</b> yoki <b>qiyosiy daraja</b>.</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Ташкент больше, чем Самарканд.</td><td>Toshkent Samarqanddan katta.</td></tr><tr><td>Жизнь в городе более активная, чем в деревне.</td><td>Shahardagi hayot qishloqdagiga qaraganda faolroq.</td></tr><tr><td>Этот район спокойнее, чем центр города.</td><td>Bu hudud shahar markaziga qaraganda tinchroq.</td></tr><tr><td>Моя работа интереснее, чем моя прошлая работа.</td><td>Hozirgi ishim oldingi ishimga qaraganda qiziqroq.</td></tr></table><p><b>более активный</b> — to‘g‘ri, lekin <b>более активнее</b> — bu maqsad shakli emas.</p><h4>6. Не такой …, как … — … kabi emas</h4><p>Ikki narsaning teng emasligini ko‘rsatadi. <b>Не такой</b> ham ega bilan moslashadi.</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Ташкент не такой спокойный, как маленькие города.</td><td>Toshkent kichik shaharlar kabi tinch emas.</td></tr><tr><td>Жизнь в городе не такая медленная, как в деревне.</td><td>Shahardagi hayot qishloqdagidek sokin emas.</td></tr><tr><td>Этот район не такой дорогой, как центр.</td><td>Bu hudud markaz kabi qimmat emas.</td></tr><tr><td>Эти люди не такие открытые, как мои друзья.</td><td>Bu odamlar mening do‘stlarim kabi ochiqko‘ngil emas.</td></tr></table><h4>7. Самый / самая / самое / самые — eng …</h4><p>Bir guruh ichidan eng yuqori darajani ko‘rsatadi va otning jinsi hamda soniga moslashadi.</p><table class=\"b2g-t\"><tr><th>Shakl</th><th>Namuna</th></tr><tr><td>самый — erkak jins</td><td>самый красивый район</td></tr><tr><td>самая — ayol jins</td><td>самая активная студентка</td></tr><tr><td>самое — o‘rta jins</td><td>самое удобное место</td></tr><tr><td>самые — ko‘plik</td><td>самые интересные города</td></tr></table><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Это самый красивый район города.</td><td>Bu shaharning eng chiroyli hududi.</td></tr><tr><td>Она самая активная студентка в группе.</td><td>U guruhdagi eng faol talaba.</td></tr><tr><td>Это самое удобное место для жизни.</td><td>Bu yashash uchun eng qulay joy.</td></tr></table><p><b>Tayyor shakl: один из самых …</b> — «eng …lardan biri». Bu yerda <b>самых</b> shakli keladi, <b>самые</b> emas, chunki <b>один из</b> dan keyin ko‘plikning qaratqich shakli turadi.</p><p><b>Formula:</b> один из самых + sifat + ko‘plikdagi ot</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Москва — один из самых больших городов.</td><td>Moskva eng katta shaharlardan biri.</td></tr><tr><td>Это один из самых интересных районов.</td><td>Bu eng qiziqarli hududlardan biri.</td></tr></table><div class=\"b2g-check\"><h4>Asosiy modellarni yodlab oling</h4><ul class=\"b2g-list\"><li><b>Чем …, тем …</b> — Qancha …, shuncha … · Чем больше город, тем больше возможностей.</li><li><b>Такой же …, как …</b> — … kabi · Ташкент такой же красивый, как Самарканд.</li><li><b>Гораздо …</b> — ancha …roq · гораздо спокойнее · гораздо более современный.</li><li><b>Более …, чем …</b> — …ga qaraganda …roq · Жизнь в городе более активная, чем в деревне.</li><li><b>Не такой …, как …</b> — … kabi emas · Этот город не такой шумный, как столица.</li><li><b>Самый / самая / самое / самые</b> — eng … · Это самый красивый город.</li><li><b>Отличаться от …</b> — …dan farq qilmoq · Город отличается от деревни.</li><li><b>Один из самых …</b> — eng …lardan biri · Москва — один из самых больших городов.</li></ul></div></div>";

    var LESSON_6_EXERCISES = [
        {
            id: "ex1",
            type: "input",
            icon: "fa-pen",
            showTask: true,
            title: "1-mashq. Чем…, тем… konstruksiyasini to'ldiring",
            intro: "Qavs ichidagi so'zdan qiyosiy daraja yasab, bo'sh joyni to'ldiring.",
            namuna: "Чем больше город, тем больше в нём возможностей.",
            items: [
                { q: "Чем больше город, тем ______ возможностей. (много)", answer: "больше" },
                { q: "Чем дольше человек работает, тем ______ он устаёт. (сильно)", answer: "сильнее" },
                { q: "Чем выше зарплата, тем ______ жизнь. (комфортный)", answer: "комфортнее" },
                { q: "Чем больше мы путешествуем, тем ______ мест мы узнаём. (много)", answer: "больше" },
                { q: "Чем раньше ты встаёшь, тем ______ у тебя времени утром. (много)", answer: "больше" },
                { q: "Чем дороже квартира, тем ______ её площадь. (большой)", answer: "больше" },
                { q: "Чем больше люди общаются, тем ______ они друг друга понимают. (хорошо)", answer: "лучше" },
                { q: "Чем современнее город, тем ______ в нём транспорт. (удобный)", answer: "удобнее" },
                { q: "Чем меньше машина, тем ______ её парковать. (легко)", answer: "легче" },
                { q: "Чем чаще человек занимается спортом, тем ______ он себя чувствует. (хорошо)", answer: "лучше" }
            ]
        },
        {
            id: "ex2",
            type: "choice",
            style: "test",
            icon: "fa-equals",
            showTask: true,
            title: "2-mashq. Такой же…, как…",
            intro: "Ega bilan jins va songa mos shaklni tanlang.",
            namuna: "Ташкент такой же большой, как Москва.",
            items: [
                { q: "Ташкент ______ большой, как Москва.", options: ["такой же", "такая же", "такое же", "такие же"], answer: "такой же" },
                { q: "Моя квартира ______ светлая, как твоя.", options: ["такой же", "такая же", "такое же", "такие же"], answer: "такая же" },
                { q: "Это кафе ______ уютное, как наш любимый ресторан.", options: ["такой же", "такая же", "такое же", "такие же"], answer: "такое же" },
                { q: "Эти улицы ______ красивые, как улицы в центре.", options: ["такой же", "такая же", "такое же", "такие же"], answer: "такие же" },
                { q: "Мой брат ______ спокойный, как мой отец.", options: ["такой же", "такая же", "такое же", "такие же"], answer: "такой же" },
                { q: "Эта машина ______ удобная, как новая модель.", options: ["такой же", "такая же", "такое же", "такие же"], answer: "такая же" },
                { q: "Это здание ______ современное, как торговый центр.", options: ["такой же", "такая же", "такое же", "такие же"], answer: "такое же" },
                { q: "Эти люди ______ дружелюбные, как наши соседи.", options: ["такой же", "такая же", "такое же", "такие же"], answer: "такие же" },
                { q: "Моя комната ______ большая, как комната сестры.", options: ["такой же", "такая же", "такое же", "такие же"], answer: "такая же" },
                { q: "Эти города ______ интересные, как столица.", options: ["такой же", "такая же", "такое же", "такие же"], answer: "такие же" }
            ]
        },
        {
            id: "ex3",
            type: "input",
            icon: "fa-arrow-up-wide-short",
            showTask: true,
            title: "3-mashq. Гораздо более…",
            intro: "Gaplarni «гораздо более» konstruksiyasi yordamida to'ldiring.",
            namuna: "Этот город гораздо более современный, чем старый.",
            items: [
                { q: "Этот район ______ современный, чем старый район.", answer: "гораздо более" },
                { q: "Жизнь в столице ______ динамичная, чем в маленьком городе.", answer: "гораздо более" },
                { q: "Этот отель ______ комфортный, чем предыдущий.", answer: "гораздо более" },
                { q: "Новый офис ______ просторный, чем старый.", answer: "гораздо более" },
                { q: "Этот образ жизни ______ активный, чем раньше.", answer: "гораздо более" },
                { q: "Москва ______ многолюдная, чем небольшой город.", answer: "гораздо более" },
                { q: "Этот район ______ безопасный, чем центр ночью.", answer: "гораздо более" },
                { q: "Современная квартира ______ удобная, чем старая квартира.", answer: "гораздо более" },
                { q: "Этот город ______ развитый, чем соседний город.", answer: "гораздо более" },
                { q: "Жизнь за городом ______ спокойная, чем жизнь в центре.", answer: "гораздо более" }
            ]
        },
        {
            id: "ex4",
            type: "choice",
            style: "test",
            icon: "fa-check-double",
            showTask: true,
            title: "4-mashq. Более…, чем… — to'g'ri variantni tanlang",
            intro: "«более» ni qiyosiy daraja bilan qo'shib ishlatib bo'lmasligini yodda tuting.",
            namuna: "Ташкент (больше / более большой), чем Самарканд. → больше",
            items: [
                { q: "Ташкент ______, чем Самарканд.", options: ["больше", "более большой"], answer: "больше" },
                { q: "Этот район ______, чем центр.", options: ["спокойнее", "более спокойнее"], answer: "спокойнее" },
                { q: "Жизнь в городе ______, чем в деревне.", options: ["активнее", "более активнее"], answer: "активнее" },
                { q: "Эта квартира ______, чем старая.", options: ["удобнее", "более удобнее"], answer: "удобнее" },
                { q: "Этот город ______, чем наш город.", options: ["современнее", "более современнее"], answer: "современнее" },
                { q: "Новый район ______, чем старый.", options: ["дороже", "более дороже"], answer: "дороже" },
                { q: "Этот вариант ______, чем первый.", options: ["интереснее", "более интереснее"], answer: "интереснее" },
                { q: "Москва ______, чем небольшой город.", options: ["многолюднее", "более многолюднее"], answer: "многолюднее" },
                { q: "Эта улица ______, чем соседняя.", options: ["шире", "более шире"], answer: "шире" },
                { q: "Жизнь здесь ______, чем в столице.", options: ["спокойнее", "более спокойнее"], answer: "спокойнее" }
            ]
        },
        {
            id: "ex5",
            type: "choice",
            style: "test",
            icon: "fa-not-equal",
            showTask: true,
            title: "5-mashq. Не такой…, как…",
            intro: "Ega bilan jins va songa mos inkor shaklni tanlang.",
            namuna: "Этот город не такой шумный, как столица.",
            items: [
                { q: "Этот город ______ шумный, как столица.", options: ["не такой", "не такая", "не такое", "не такие"], answer: "не такой" },
                { q: "Моя квартира ______ большая, как твоя.", options: ["не такой", "не такая", "не такое", "не такие"], answer: "не такая" },
                { q: "Эта улица ______ широкая, как центральная улица.", options: ["не такой", "не такая", "не такое", "не такие"], answer: "не такая" },
                { q: "Это кафе ______ дорогое, как ресторан.", options: ["не такой", "не такая", "не такое", "не такие"], answer: "не такое" },
                { q: "Эти дома ______ высокие, как здания в центре.", options: ["не такой", "не такая", "не такое", "не такие"], answer: "не такие" },
                { q: "Жизнь в деревне ______ быстрая, как жизнь в городе.", options: ["не такой", "не такая", "не такое", "не такие"], answer: "не такая" },
                { q: "Этот район ______ современный, как новый район.", options: ["не такой", "не такая", "не такое", "не такие"], answer: "не такой" },
                { q: "Моя работа ______ сложная, как твоя.", options: ["не такой", "не такая", "не такое", "не такие"], answer: "не такая" },
                { q: "Эти люди ______ открытые, как мои друзья.", options: ["не такой", "не такая", "не такое", "не такие"], answer: "не такие" },
                { q: "Это место ______ популярное, как центр города.", options: ["не такой", "не такая", "не такое", "не такие"], answer: "не такое" }
            ]
        },
        {
            id: "ex6",
            type: "input",
            icon: "fa-city",
            showTask: true,
            title: "6-mashq. Shaharlarni taqqoslang",
            intro: "Berilgan so'zlardan foydalanib, «чем» bilan to'liq gap tuzing. Sifatni qiyosiy darajaga qo'ying.",
            namuna: "Ташкент / большой / Самарканд → Ташкент больше, чем Самарканд.",
            items: [
                { q: "Москва / большой / Ташкент", answer: ["Москва больше, чем Ташкент."] },
                { q: "Самарканд / спокойный / Ташкент", answer: ["Самарканд спокойнее, чем Ташкент.", "Самарканд более спокойный, чем Ташкент."] },
                { q: "Ташкент / современный / маленький город", answer: ["Ташкент современнее, чем маленький город.", "Ташкент более современный, чем маленький город."] },
                { q: "Деревня / тихий / столица", answer: ["Деревня тише, чем столица.", "Деревня более тихая, чем столица."] },
                { q: "Столица / дорогой / небольшой город", answer: ["Столица дороже, чем небольшой город.", "Столица более дорогая, чем небольшой город."] },
                { q: "Маленький город / уютный / столица", answer: ["Маленький город уютнее, чем столица.", "Маленький город более уютный, чем столица."] },
                { q: "Москва / многолюдный / Самарканд", answer: ["Москва многолюднее, чем Самарканд.", "Москва более многолюдная, чем Самарканд."] },
                { q: "Ташкент / активный / небольшой город", answer: ["Ташкент активнее, чем небольшой город.", "Ташкент более активный, чем небольшой город."] },
                { q: "Деревня / экологичный / большой город", answer: ["Деревня экологичнее, чем большой город.", "Деревня более экологичная, чем большой город."] },
                { q: "Центр города / шумный / окраина", answer: ["Центр города шумнее, чем окраина.", "Центр города более шумный, чем окраина."] }
            ]
        },
        {
            id: "ex7",
            type: "choice",
            style: "test",
            icon: "fa-crown",
            showTask: true,
            title: "7-mashq. Eng yuqori daraja",
            intro: "самый / самая / самое / самые / самых shakllaridan mosini tanlang. «Один из…» dan keyin — самых.",
            namuna: "Москва — один из самых больших городов мира.",
            items: [
                { q: "Это ______ красивый город в нашей стране.", options: ["самый", "самая", "самое", "самые", "самых"], answer: "самый" },
                { q: "Она ______ активная студентка в группе.", options: ["самый", "самая", "самое", "самые", "самых"], answer: "самая" },
                { q: "Это ______ удобное место для жизни.", options: ["самый", "самая", "самое", "самые", "самых"], answer: "самое" },
                { q: "Это ______ интересные города для туристов.", options: ["самый", "самая", "самое", "самые", "самых"], answer: "самые" },
                { q: "Москва — один из ______ больших городов мира.", options: ["самый", "самая", "самое", "самые", "самых"], answer: "самых" },
                { q: "Это ______ дорогая квартира в нашем доме.", options: ["самый", "самая", "самое", "самые", "самых"], answer: "самая" },
                { q: "Этот район — ______ спокойный район города.", options: ["самый", "самая", "самое", "самые", "самых"], answer: "самый" },
                { q: "Они ______ дружелюбные люди в нашей компании.", options: ["самый", "самая", "самое", "самые", "самых"], answer: "самые" },
                { q: "Это ______ современное здание в городе.", options: ["самый", "самая", "самое", "самые", "самых"], answer: "самое" },
                { q: "Это ______ популярное место среди туристов.", options: ["самый", "самая", "самое", "самые", "самых"], answer: "самое" }
            ]
        },
        {
            id: "ex8",
            type: "choice",
            style: "test",
            icon: "fa-list-check",
            showTask: true,
            title: "8-mashq. To'g'ri variantni tanlang",
            intro: "Taqqoslash konstruksiyalariga mos so'zni tanlang.",
            namuna: "Чем больше город, (тем / чем) больше возможностей. → тем",
            items: [
                { q: "Чем больше город, ______ больше возможностей.", options: ["тем", "чем"], answer: "тем" },
                { q: "Ташкент такой же большой, ______ Москва.", options: ["как", "чем"], answer: "как" },
                { q: "Этот район гораздо ______ современный.", options: ["более", "самый"], answer: "более" },
                { q: "Жизнь в городе активнее, ______ в деревне.", options: ["как", "чем"], answer: "чем" },
                { q: "Это самый красивый город ______ стране.", options: ["в", "чем"], answer: "в" },
                { q: "Этот район не такой шумный, ______ центр.", options: ["как", "чем"], answer: "как" },
                { q: "Чем больше человек путешествует, ______ больше он узнаёт.", options: ["тем", "как"], answer: "тем" },
                { q: "Эта квартира такая же светлая, ______ моя.", options: ["как", "чем"], answer: "как" },
                { q: "Новый район гораздо более удобный, ______ старый.", options: ["как", "чем"], answer: "чем" },
                { q: "Чем выше зарплата, ______ комфортнее жизнь.", options: ["тем", "чем"], answer: "тем" }
            ]
        },
        {
            id: "ex9",
            type: "input",
            icon: "fa-wrench",
            showTask: true,
            title: "9-mashq. Xatoni toping va to'g'rilang",
            intro: "Har bir gapda bitta xato bor. To'g'ri gapni to'liq yozing.",
            namuna: "Чем больше город, чем больше возможностей. → Чем больше город, тем больше возможностей.",
            items: [
                { q: "Чем больше город, чем больше возможностей.", answer: ["Чем больше город, тем больше возможностей."] },
                { q: "Ташкент такой же большой, чем Москва.", answer: ["Ташкент такой же большой, как Москва."] },
                { q: "Эта квартира более удобнее, чем моя.", answer: ["Эта квартира удобнее, чем моя.", "Эта квартира более удобная, чем моя."] },
                { q: "Этот район гораздо самый современный.", answer: ["Этот район гораздо более современный.", "Этот район гораздо современнее."] },
                { q: "Чем больше человек работает, как больше он устаёт.", answer: ["Чем больше человек работает, тем больше он устаёт."] },
                { q: "Моя комната такой же светлая, как твоя.", answer: ["Моя комната такая же светлая, как твоя."] },
                { q: "Это самая красивый город.", answer: ["Это самый красивый город."] },
                { q: "Жизнь в деревне спокойнее, как в городе.", answer: ["Жизнь в деревне спокойнее, чем в городе."] },
                { q: "Эти города такой же интересные, как столица.", answer: ["Эти города такие же интересные, как столица."] },
                { q: "Этот район не такая дорогой, как центр.", answer: ["Этот район не такой дорогой, как центр."] }
            ]
        },
        {
            id: "audio1",
            type: "choice",
            style: "tf",
            icon: "fa-headphones",
            showTask: true,
            audioSrc: "audios/%D0%912%206%20%D1%83%D1%80%D0%BE%D0%BA.mp3",
            title: "Audio bo'yicha «Rost yoki yolg'on» mashqi",
            intro: "«Два разных образа жизни» audiosini tinglang va gaplar «Правда» yoki «Ложь» ekanini aniqlang.",
            items: [
                { q: "Малика живёт в Ташкенте.", options: ["Правда", "Ложь"], answer: "Правда" },
                { q: "София живёт в большом городе.", options: ["Правда", "Ложь"], answer: "Ложь" },
                { q: "В Ташкенте больше возможностей для работы и учёбы.", options: ["Правда", "Ложь"], answer: "Правда" },
                { q: "Жизнь в Ташкенте спокойнее, чем в маленьком городе.", options: ["Правда", "Ложь"], answer: "Ложь" },
                { q: "В городе Софии меньше машин и людей.", options: ["Правда", "Ложь"], answer: "Правда" },
                { q: "София считает, что большой город лучше для молодых людей.", options: ["Правда", "Ложь"], answer: "Ложь" },
                { q: "Малика думает, что большой город лучше для молодых людей.", options: ["Правда", "Ложь"], answer: "Правда" },
                { q: "Девушки считают, что у каждого образа жизни есть свои плюсы и минусы.", options: ["Правда", "Ложь"], answer: "Правда" },
                { q: "Чем больше город, тем меньше возможностей.", options: ["Правда", "Ложь"], answer: "Ложь" },
                { q: "В конце девушки понимают, что нельзя сказать, какой город лучше для всех.", options: ["Правда", "Ложь"], answer: "Правда" }
            ]
        }
    ];

    var LESSON_7_GRAMMAR = "<div class=\"b2g\"><div class=\"b2g-lead\"><div class=\"b2g-lead-title\">Вид глагола — СВ / НСВ</div><p>Rus tilida fe’lning ikki turi bor. Ular bir xil harakatni ikki xil nuqtai nazardan ko‘rsatadi: <span class=\"b2g-tone-nsv\">НСВ</span> — jarayonni, <span class=\"b2g-tone-sv\">СВ</span> — natijani.</p></div><table class=\"b2g-t\"><tr><th>Vid</th><th>Nimani bildiradi</th></tr><tr><td><span class=\"b2g-tone-nsv\">НСВ — несовершенный вид</span></td><td>harakatning jarayoni, davomiyligi, odati yoki takrorlanishi</td></tr><tr><td><span class=\"b2g-tone-sv\">СВ — совершенный вид</span></td><td>harakatning tugallangani, natijaga erishilgani</td></tr></table><p><b>Asosiy savollar:</b></p><table class=\"b2g-t\"><tr><th>Vid</th><th>Savollar</th></tr><tr><td><span class=\"b2g-tone-nsv\">НСВ</span></td><td>Что делать? · Что делал? · Что буду делать?</td></tr><tr><td><span class=\"b2g-tone-sv\">СВ</span></td><td>Что сделать? · Что сделал? · Что сделаю?</td></tr></table><p><b>Vid juftliklari:</b></p><div class=\"b2g-chips\"><span>читать → прочитать</span><span>писать → написать</span><span>делать → сделать</span><span>покупать → купить</span><span>готовить → приготовить</span><span>решать → решить</span><span>смотреть → посмотреть</span><span>учить → выучить</span></div><h4>1. НСВ — jarayon yoki davom etayotgan harakat</h4><p>Agar biz harakatning qanday davom etganiga, uning jarayoniga e’tibor qaratsak, <span class=\"b2g-tone-nsv\">НСВ</span> ishlatiladi.</p><p><b>Konstruksiya:</b> Я + <span class=\"b2g-tone-nsv\">НСВ</span></p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я читал книгу весь вечер.</td><td>Men butun kechqurun kitob o‘qidim.</td></tr><tr><td>Я готовил ужин два часа.</td><td>Men ikki soat kechki ovqat tayyorladim.</td></tr><tr><td>Она изучала русский язык несколько лет.</td><td>U bir necha yil rus tilini o‘rgandi.</td></tr><tr><td>Мы обсуждали этот вопрос долго.</td><td>Biz bu masalani uzoq muhokama qildik.</td></tr></table><p>Bu gaplarda asosiy e’tibor natijaga emas, <b>jarayonga</b> qaratilgan.</p><p><b>Jarayon va davomiylikni ko‘rsatadigan so‘zlar:</b></p><div class=\"b2g-chips\"><span>долго</span><span>весь день</span><span>весь вечер</span><span>несколько часов</span><span>часто</span><span>обычно</span><span>иногда</span><span>каждый день</span><span>постоянно</span></div><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я долго готовил презентацию.</td><td>Men prezentatsiyani uzoq tayyorladim.</td></tr><tr><td>Она часто читала книги на русском.</td><td>U tez-tez rus tilida kitob o‘qirdi.</td></tr><tr><td>Мы обычно смотрели фильмы по вечерам.</td><td>Biz odatda kechqurunlari film ko‘rardik.</td></tr></table><h4>2. СВ — tugallangan harakat va natija</h4><p>Agar harakat tugagan va natija mavjud bo‘lsa, <span class=\"b2g-tone-sv\">СВ</span> ishlatiladi.</p><p><b>Konstruksiya:</b> Я + <span class=\"b2g-tone-sv\">СВ</span></p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я прочитал книгу.</td><td>Men kitobni o‘qib chiqdim.</td></tr><tr><td>Я приготовил ужин.</td><td>Men kechki ovqatni tayyorladim.</td></tr><tr><td>Она выучила новые слова.</td><td>U yangi so‘zlarni yodladi.</td></tr><tr><td>Мы решили проблему.</td><td>Biz muammoni hal qildik.</td></tr><tr><td>Он написал письмо.</td><td>U xat yozdi.</td></tr></table><p>Bu yerda asosiy ma’no — <b>«ish bajarildi»</b>.</p><p><b>Слова, которые часто встречаются в контексте результата:</b></p><div class=\"b2g-chips\"><span>уже</span><span>наконец</span><span>полностью</span><span>успешно</span><span>сразу</span><span>однажды</span></div><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я уже прочитал эту книгу.</td><td>Men bu kitobni o‘qib bo‘ldim.</td></tr><tr><td>Она наконец закончила работу.</td><td>U nihoyat ishni tugatdi.</td></tr><tr><td>Мы успешно решили проблему.</td><td>Biz muammoni muvaffaqiyatli hal qildik.</td></tr><tr><td>Он сразу понял вопрос.</td><td>U savolni darhol tushundi.</td></tr></table><div class=\"b2g-warn\"><b>Diqqat: bu so‘zlar avtomatik qoida emas.</b> Ular ko‘pincha natija haqidagi kontekstda uchraydi, lekin vidni <b>ma’no</b> tanlaydi, bitta «signal so‘z» emas. Masalan, «уже» ikkala vid bilan ham keladi:<table class=\"b2g-t\"><tr><th>Gap</th><th>Ma’nosi</th></tr><tr><td>Я уже <span class=\"b2g-tone-nsv\">читал</span> эту книгу.</td><td>Men bu kitobni avval o‘qiganman — tajriba haqida.</td></tr><tr><td>Я уже <span class=\"b2g-tone-sv\">прочитал</span> эту книгу.</td><td>Men bu kitobni o‘qib bo‘ldim — natija bor.</td></tr></table><p>Shu sababli «однажды» yoki «сразу» ham vidni majburan belgilamaydi.</p></div><h4>3. «Я уже…» + СВ</h4><p>«Уже» ko‘pincha harakatning tugaganini va natija borligini ko‘rsatadi.</p><p><b>Model:</b> Я уже + <span class=\"b2g-tone-sv\">СВ</span></p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я уже поел.</td><td>Men ovqatlanib bo‘ldim.</td></tr><tr><td>Я уже сделал домашнее задание.</td><td>Men uy vazifasini bajardim.</td></tr><tr><td>Я уже посмотрел этот фильм.</td><td>Men bu filmni ko‘rib bo‘ldim.</td></tr><tr><td>Я уже купил билеты.</td><td>Men chiptalarni sotib oldim.</td></tr><tr><td>Я уже отправил письмо.</td><td>Men xatni jo‘natdim.</td></tr></table><p><b>B2 darajada muhim farq:</b></p><table class=\"b2g-t\"><tr><th>Gap</th><th>Ma’nosi</th></tr><tr><td>Я уже читал эту книгу.</td><td>Men bu kitobni avval o‘qiganman. Tajriba haqida gap.</td></tr><tr><td>Я уже прочитал эту книгу.</td><td>Men bu kitobni o‘qib bo‘ldim. Natija bor.</td></tr></table><ul class=\"b2g-list\"><li><span class=\"b2g-tone-nsv\">читал</span> → tajriba yoki jarayon</li><li><span class=\"b2g-tone-sv\">прочитал</span> → tugallangan natija</li></ul><h4>4. «Я обычно…» + НСВ</h4><p>«Обычно» odat, takroriy harakat yoki muntazam faoliyatni bildiradi, shuning uchun odatda <span class=\"b2g-tone-nsv\">НСВ</span> ishlatiladi.</p><p><b>Model:</b> Я обычно + <span class=\"b2g-tone-nsv\">НСВ</span></p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я обычно читаю перед сном.</td><td>Men odatda uxlashdan oldin o‘qiyman.</td></tr><tr><td>Я обычно готовлю дома.</td><td>Men odatda uyda ovqat tayyorlayman.</td></tr><tr><td>Я обычно покупаю продукты в выходные.</td><td>Men odatda dam olish kunlari xarid qilaman.</td></tr><tr><td>Я обычно смотрю фильмы вечером.</td><td>Men odatda kechqurun film ko‘raman.</td></tr><tr><td>Я обычно занимаюсь спортом утром.</td><td>Men odatda ertalab sport bilan shug‘ullanaman.</td></tr></table><p><b>Taqqoslang:</b></p><table class=\"b2g-t\"><tr><th>Gap</th><th>Ma’nosi</th></tr><tr><td>Я обычно читаю книги вечером.</td><td>Bu mening odatim.</td></tr><tr><td>Вчера я прочитал книгу.</td><td>Kecha bitta kitobni o‘qib tugatdim.</td></tr></table><h4>5. «Я успел…» + СВ</h4><p><b>Успеть</b> — «ulgurmoq». Bu konstruksiya harakat belgilangan vaqt tugashidan oldin bajarilganini bildiradi.</p><p><b>Model:</b> Я успел + <span class=\"b2g-tone-sv\">СВ</span> (infinitiv)</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я успел закончить работу.</td><td>Men ishni tugatishga ulgurdim.</td></tr><tr><td>Я успел купить билет.</td><td>Men chipta sotib olishga ulgurdim.</td></tr><tr><td>Она успела подготовиться к экзамену.</td><td>U imtihonga tayyorlanishga ulgurdi.</td></tr><tr><td>Мы успели обсудить все вопросы.</td><td>Biz barcha savollarni muhokama qilishga ulgurdik.</td></tr><tr><td>Он успел позвонить врачу.</td><td>U shifokorga qo‘ng‘iroq qilishga ulgurdi.</td></tr></table><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я успел сделать всё до шести часов.</td><td>Men soat oltigacha hammasini bajarishga ulgurdim.</td></tr><tr><td>Я не успел сделать домашнее задание.</td><td>Men uy vazifasini bajarishga ulgurmadim.</td></tr></table><div class=\"b2g-tip\"><b>Qaysi infinitiv?</b> Bu darsdagi ma’no uchun — «ulgurib <u>tugatmoq</u>» — odatda <span class=\"b2g-tone-sv\">tugallangan (СВ) infinitiv</span> keladi: <b>успел сделать · успел купить · успел закончить</b>. «Успеть» dan keyin <span class=\"b2g-tone-nsv\">НСВ</span> infinitiv boshqa kontekstual ma’nolarda uchrashi mumkin, shuning uchun bu rus tilining umumiy taqiqi emas — bu shu modelning tanlovi.</div><h4>6. Tajriba haqida gapirish</h4><p>B2 darajada tajriba haqida gapirganda vid tanlovi ma’noni o‘zgartiradi.</p><p><b><span class=\"b2g-tone-nsv\">НСВ</span> — tajriba bo‘lganini bildiradi:</b> Я когда-то / раньше + <span class=\"b2g-tone-nsv\">НСВ</span></p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я когда-то работал в другой компании.</td><td>Men bir vaqtlar boshqa kompaniyada ishlaganman.</td></tr><tr><td>Я раньше изучал китайский язык.</td><td>Men ilgari xitoy tilini o‘rganganman.</td></tr><tr><td>Я несколько лет занимался теннисом.</td><td>Men bir necha yil tennis bilan shug‘ullanganman.</td></tr><tr><td>Я когда-то жил в Москве.</td><td>Men bir vaqtlar Moskvada yashaganman.</td></tr></table><p><b><span class=\"b2g-tone-sv\">СВ</span> — aniq tugallangan natija yoki bajarilgan ishlar soni:</b></p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я посетил пять стран.</td><td>Men beshta mamlakatga borganman.</td></tr><tr><td>Я прочитал десять книг на русском.</td><td>Men rus tilida o‘nta kitob o‘qib chiqdim.</td></tr><tr><td>Я прошёл этот курс.</td><td>Men bu kursni tamomladim.</td></tr><tr><td>Я сдал международный экзамен.</td><td>Men xalqaro imtihon topshirdim.</td></tr></table><h4>7. «Когда…» bilan СВ / НСВ</h4><p>Ikki fe’l bir gapda kelganda ularning vidi ma’noni o‘zgartiradi.</p><table class=\"b2g-t\"><tr><th>Model</th><th>Ma’nosi</th></tr><tr><td><span class=\"b2g-tone-nsv\">НСВ</span> + <span class=\"b2g-tone-nsv\">НСВ</span></td><td>ikki harakat bir vaqtda davom etayotgan bo‘lishi mumkin</td></tr><tr><td><span class=\"b2g-tone-sv\">СВ</span> + <span class=\"b2g-tone-sv\">СВ</span></td><td>bir harakat tugagach, ikkinchisi sodir bo‘ladi</td></tr></table><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Когда я готовил ужин, муж смотрел телевизор.</td><td>Men ovqat tayyorlayotganimda, erim televizor ko‘rayotgan edi.</td></tr><tr><td>Когда я приготовил ужин, мы поужинали.</td><td>Men ovqatni tayyorlab bo‘lganimdan keyin, biz ovqatlandik.</td></tr></table><p>Bu — juda keng tarqalgan model. Boshqa kontekstda ikki <span class=\"b2g-tone-sv\">СВ</span> har doim ham ketma-ketlikni bildirmasligi mumkin, shuning uchun ma’noga qarang.</p><h4>8. «Пока…» + НСВ</h4><p>«Пока» ko‘pincha bir vaqtning o‘zida davom etayotgan jarayonlarni bildiradi.</p><p><b>Model:</b> Пока + <span class=\"b2g-tone-nsv\">НСВ</span>, <span class=\"b2g-tone-nsv\">НСВ</span></p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Пока я готовил, дети играли.</td><td>Men ovqat tayyorlayotganimda, bolalar o‘ynashardi.</td></tr><tr><td>Пока она работала, я читал.</td><td>U ishlayotganda, men o‘qirdim.</td></tr><tr><td>Пока мы ждали, они разговаривали.</td><td>Biz kutayotganimizda, ular suhbatlashardi.</td></tr></table><p>Bu modelda ikkala harakat ham jarayon sifatida ko‘rsatiladi.</p><h4>9. «Наконец» + СВ</h4><p>«Наконец» kutilgan natijaga erishilganini bildiradi.</p><p><b>Model:</b> Наконец + <span class=\"b2g-tone-sv\">СВ</span></p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я наконец закончил работу.</td><td>Men nihoyat ishni tugatdim.</td></tr><tr><td>Она наконец сдала экзамен.</td><td>U nihoyat imtihon topshirdi.</td></tr><tr><td>Мы наконец решили эту проблему.</td><td>Biz nihoyat bu muammoni hal qildik.</td></tr><tr><td>Он наконец купил квартиру.</td><td>U nihoyat kvartira sotib oldi.</td></tr></table><p>Bu modelda <span class=\"b2g-tone-nsv\">НСВ</span> ishlatilsa, gap boshqa, maxsus kontekstni talab qiladi.</p><h4>10. Takroriy harakat</h4><p>Agar harakat takrorlangan jarayon sifatida ko‘rsatilsa, odatda <span class=\"b2g-tone-nsv\">НСВ</span> keladi:</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я часто путал эти слова.</td><td>Men bu so‘zlarni tez-tez adashtirardim.</td></tr><tr><td>Она несколько раз звонила мне.</td><td>U menga bir necha marta qo‘ng‘iroq qilardi.</td></tr><tr><td>Мы каждый год путешествовали.</td><td>Biz har yili sayohat qilardik.</td></tr><tr><td>Он постоянно опаздывал.</td><td>U doim kechikardi.</td></tr></table><p>Ammo <span class=\"b2g-tone-sv\">СВ</span> bajarilgan harakatlar <b>sonini va natijasini</b> ko‘rsatishi mumkin:</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я три раза прочитал эту статью.</td><td>Men bu maqolani uch marta o‘qib chiqdim.</td></tr><tr><td>Она два раза позвонила мне.</td><td>U menga ikki marta qo‘ng‘iroq qildi.</td></tr><tr><td>Мы пять раз посетили этот музей.</td><td>Biz bu muzeyga besh marta borganmiz.</td></tr></table><div class=\"b2g-warn\"><b>Muhim:</b> «несколько раз / три раза» kabi so‘zlar vidni mexanik ravishda <span class=\"b2g-tone-nsv\">НСВ</span> ga majburlamaydi. Vid so‘zlovchi harakatni takroriy <b>jarayon</b> sifatida ko‘rsatayotganiga yoki tugallangan hodisalarni <b>sanayotganiga</b> bog‘liq.</div><h4>11. «Долго» bilan qanday ishlash kerak</h4><p>«Долго» jarayonning davomiyligini tasvirlaydi, shuning uchun u ko‘pincha <span class=\"b2g-tone-nsv\">НСВ</span> bilan keladi:</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я долго читал книгу.</td><td>Men kitobni uzoq o‘qidim.</td></tr><tr><td>Она долго готовила ужин.</td><td>U kechki ovqatni uzoq tayyorladi.</td></tr><tr><td>Мы долго обсуждали проблему.</td><td>Biz muammoni uzoq muhokama qildik.</td></tr></table><p>Agar uzoq jarayondan <b>keyin natija</b> paydo bo‘lsa, odatda ikkita ma’no qismi ishlatiladi: uzoq davom etgan jarayon (<span class=\"b2g-tone-nsv\">НСВ</span>) va natija (<span class=\"b2g-tone-sv\">СВ</span>).</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Он долго <span class=\"b2g-tone-nsv\">думал</span> и наконец <span class=\"b2g-tone-sv\">решил</span> проблему.</td><td>U uzoq o‘yladi va nihoyat muammoni hal qildi.</td></tr><tr><td>Я долго <span class=\"b2g-tone-nsv\">пытался</span> решить проблему и наконец <span class=\"b2g-tone-sv\">решил</span> её.</td><td>Men muammoni hal qilishga uzoq urindim va nihoyat uni hal qildim.</td></tr><tr><td>Я долго не мог решить эту проблему.</td><td>Men bu muammoni uzoq hal qila olmadim.</td></tr></table><div class=\"b2g-tip\"><b>Natijaga qancha vaqtda erishilgani</b> uchun esa «долго» emas, o‘lchangan vaqt ishlatiladi: <b>за два часа · за неделю · за несколько дней</b> + <span class=\"b2g-tone-sv\">СВ</span>. Masalan: <b>Я написал письмо за два часа.</b></div><h4>12. «Сколько времени?» va «За сколько времени?»</h4><p>Bu ikki savol vidni ajratishda juda foydali.</p><table class=\"b2g-t\"><tr><th>Savol</th><th>Vid va ma’no</th></tr><tr><td>Сколько времени?</td><td><span class=\"b2g-tone-nsv\">НСВ</span> — jarayonning davomiyligi</td></tr><tr><td>За сколько времени?</td><td><span class=\"b2g-tone-sv\">СВ</span> — natijaga erishish vaqti</td></tr></table><table class=\"b2g-t\"><tr><th>Savol va javob</th><th>Tarjima</th></tr><tr><td>— Сколько времени ты писал письмо? — Я писал письмо два часа.</td><td>Xatni qancha vaqt yozding? — Men xatni ikki soat yozdim.</td></tr><tr><td>— За сколько времени ты написал письмо? — Я написал письмо за два часа.</td><td>Xatni qancha vaqtda yozib tugatding? — Men xatni ikki soatda yozdim.</td></tr></table><h4>13. «Вчера» bilan ma’no farqi</h4><table class=\"b2g-t\"><tr><th>Gap</th><th>Ma’nosi</th></tr><tr><td>Вчера я читал книгу.</td><td>Kecha kitob o‘qish bilan shug‘ullandim. Tugatganim noma’lum.</td></tr><tr><td>Вчера я прочитал книгу.</td><td>Kecha kitobni o‘qib tugatdim.</td></tr></table><p>Shuning uchun bu juftliklar bir xil emas:</p><div class=\"b2g-chips\"><span>читал ≠ прочитал</span><span>делал ≠ сделал</span><span>писал ≠ написал</span><span>смотрел ≠ посмотрел</span><span>покупал ≠ купил</span></div><h4>14. Vidni tanlashning B2 formulasi</h4><p>Gap tuzishda o‘zingizga quyidagi savollarni bering:</p><table class=\"b2g-t\"><tr><th>Savol</th><th>Odatda</th></tr><tr><td>Harakat jarayonmi?</td><td>ko‘pincha <span class=\"b2g-tone-nsv\">НСВ</span></td></tr><tr><td>Harakat odatmi yoki takrorlanadimi?</td><td>ko‘pincha <span class=\"b2g-tone-nsv\">НСВ</span></td></tr><tr><td>Natija muhimmi?</td><td>ko‘pincha <span class=\"b2g-tone-sv\">СВ</span></td></tr><tr><td>Ish tugaganmi?</td><td>ko‘pincha <span class=\"b2g-tone-sv\">СВ</span></td></tr><tr><td>«уже», «наконец», «успел» natija kontekstidami?</td><td>ko‘pincha <span class=\"b2g-tone-sv\">СВ</span></td></tr><tr><td>«обычно», «часто», «каждый день» odat haqidami?</td><td>ko‘pincha <span class=\"b2g-tone-nsv\">НСВ</span></td></tr><tr><td>«Сколько времени?» deb so‘rayapmizmi?</td><td><span class=\"b2g-tone-nsv\">НСВ</span> — jarayon</td></tr><tr><td>«За сколько времени?» deb so‘rayapmizmi?</td><td><span class=\"b2g-tone-sv\">СВ</span> — natija</td></tr></table><div class=\"b2g-check\"><h4>Asosiy konstruksiyalar</h4><ul class=\"b2g-list\"><li><b>Я уже + СВ</b> → Я уже сделал.</li><li><b>Я обычно + НСВ</b> → Я обычно делаю.</li><li><b>Я успел + СВ</b> → Я успел сделать.</li><li><b>Я раньше + НСВ</b> → Я раньше работал здесь.</li><li><b>Я когда-то + НСВ</b> → Я когда-то жил в Москве.</li><li><b>Я уже несколько раз + СВ</b> → Я уже несколько раз посмотрел этот фильм.</li><li><b>Я часто + НСВ</b> → Я часто смотрю фильмы.</li><li><b>Наконец + СВ</b> → Наконец я закончил работу.</li><li><b>Пока + НСВ, НСВ</b> → Пока я готовил, она читала.</li><li><b>Когда + СВ, СВ</b> → Когда я закончил работу, я пошёл домой.</li></ul><p><b>Eslab qoling:</b> вид выбирается прежде всего по смыслу, а не только по одному «сигнальному» слову.</p></div></div>";

    var LESSON_7_EXERCISES = [
        {
            id: "ex1",
            type: "input",
            icon: "fa-check-double",
            showTask: true,
            title: "1-mashq. «Я уже…» + СВ",
            intro: "Qavs ichidagi tugallangan (СВ) fe'lni o'tgan zamonda qo'ying. «Я» erkak ham, ayol ham bo'lishi mumkin — ikkala shakl ham to'g'ri.",
            namuna: "Я уже прочитал эту книгу. / Я уже прочитала эту книгу.",
            items: [
                { q: "Я уже ________ домашнее задание. (сделать)", answer: ["сделал", "сделала"] },
                { q: "Я уже ________ это письмо. (написать)", answer: ["написал", "написала"] },
                { q: "Я уже ________ этот фильм. (посмотреть)", answer: ["посмотрел", "посмотрела"] },
                { q: "Я уже ________ все необходимые документы. (подготовить)", answer: ["подготовил", "подготовила"] },
                { q: "Я уже ________ билеты на поезд. (купить)", answer: ["купил", "купила"] },
                { q: "Я уже ________ эту проблему. (решить)", answer: ["решил", "решила"] },
                { q: "Я уже ________ все новые слова. (выучить)", answer: ["выучил", "выучила"] },
                { q: "Я уже ________ своему преподавателю. (позвонить)", answer: ["позвонил", "позвонила"] },
                { q: "Я уже ________ комнату. (убрать)", answer: ["убрал", "убрала"] },
                { q: "Я уже ________ все вопросы. (обсудить)", answer: ["обсудил", "обсудила"] }
            ]
        },
        {
            id: "ex2",
            type: "input",
            icon: "fa-repeat",
            showTask: true,
            title: "2-mashq. «Я обычно…» + НСВ",
            intro: "Qavs ichidagi tugallanmagan (НСВ) fe'lni hozirgi zamonda, birinchi shaxs birlikda qo'ying.",
            namuna: "Я обычно читаю перед сном.",
            items: [
                { q: "Я обычно ________ рано утром. (вставать)", answer: "встаю" },
                { q: "Я обычно ________ дома. (завтракать)", answer: "завтракаю" },
                { q: "Я обычно ________ книги вечером. (читать)", answer: "читаю" },
                { q: "Я обычно ________ на работу на метро. (ездить)", answer: "езжу" },
                { q: "Я обычно ________ покупки по выходным. (делать)", answer: "делаю" },
                { q: "Я обычно ________ новые слова несколько раз. (повторять)", answer: "повторяю" },
                { q: "Я обычно ________ фильмы дома. (смотреть)", answer: "смотрю" },
                { q: "Я обычно ________ работу заранее. (планировать)", answer: "планирую" },
                { q: "Я обычно ________ с друзьями по вечерам. (встречаться)", answer: "встречаюсь" },
                { q: "Я обычно ________ перед важным экзаменом. (готовиться)", answer: "готовлюсь" }
            ]
        },
        {
            id: "ex3",
            type: "input",
            icon: "fa-hourglass-half",
            showTask: true,
            title: "3-mashq. «Я успел…» + СВ",
            intro: "«Успел» dan keyin fe'l infinitivda turadi. Qavs ichidagi СВ infinitivni yozing.",
            namuna: "Я успел закончить работу до шести часов.",
            items: [
                { q: "Я успел ________ домашнее задание. (сделать)", answer: "сделать" },
                { q: "Я успел ________ письмо до обеда. (написать)", answer: "написать" },
                { q: "Я успел ________ продукты до закрытия магазина. (купить)", answer: "купить" },
                { q: "Я успел ________ к экзамену. (подготовиться)", answer: "подготовиться" },
                { q: "Я успел ________ все вопросы. (обсудить)", answer: "обсудить" },
                { q: "Я успел ________ врачу. (позвонить)", answer: "позвонить" },
                { q: "Я успел ________ отчёт до встречи. (закончить)", answer: "закончить" },
                { q: "Я успел ________ билеты онлайн. (забронировать)", answer: "забронировать" },
                { q: "Я успел ________ все документы. (проверить)", answer: "проверить" },
                { q: "Я успел ________ домой до дождя. (вернуться)", answer: "вернуться" }
            ]
        },
        {
            id: "ex4",
            type: "input",
            icon: "fa-clock-rotate-left",
            showTask: true,
            title: "4-mashq. «Я раньше…» + НСВ",
            intro: "Qavs ichidagi tugallanmagan (НСВ) fe'lni o'tgan zamonda qo'ying. «Я» erkak ham, ayol ham bo'lishi mumkin.",
            namuna: "Я раньше работал в другой компании. / Я раньше работала в другой компании.",
            items: [
                { q: "Я раньше часто ________ в библиотеке. (заниматься)", answer: ["занимался", "занималась"] },
                { q: "Я раньше ________ на работу на автобусе. (ездить)", answer: ["ездил", "ездила"] },
                { q: "Я раньше много ________ книг. (читать)", answer: ["читал", "читала"] },
                { q: "Я раньше часто ________ с друзьями после работы. (встречаться)", answer: ["встречался", "встречалась"] },
                { q: "Я раньше ________ иностранный язык. (изучать)", answer: ["изучал", "изучала"] },
                { q: "Я раньше часто ________ эти слова. (путать)", answer: ["путал", "путала"] },
                { q: "Я раньше ________ здесь. (работать)", answer: ["работал", "работала"] },
                { q: "Я раньше ________ кофе каждое утро. (пить)", answer: ["пил", "пила"] },
                { q: "Я раньше часто ________ поздно. (ложиться)", answer: ["ложился", "ложилась"] },
                { q: "Я раньше ________ спортом каждый день. (заниматься)", answer: ["занимался", "занималась"] }
            ]
        },
        {
            id: "ex5",
            type: "input",
            icon: "fa-pen-to-square",
            showTask: true,
            title: "5-mashq. «Я обычно…» ↔ «Я уже…»",
            intro: "Berilgan birikma bilan ikkita TO'LIQ gap yozing: 1) «Я обычно…» + НСВ (odat), 2) «Я уже…» + СВ (natija). Bu ochiq mashq — har xil to'g'ri javoblar bo'lishi mumkin.",
            namuna: "читать книги → Я обычно читаю книги вечером. Я уже прочитал эту книгу.",
            items: [
                { free: true, q: "делать домашнее задание", answer: null, placeholder: "Я обычно… Я уже…" },
                { free: true, q: "смотреть фильмы", answer: null, placeholder: "Я обычно… Я уже…" },
                { free: true, q: "готовить ужин", answer: null, placeholder: "Я обычно… Я уже…" },
                { free: true, q: "читать книги", answer: null, placeholder: "Я обычно… Я уже…" },
                { free: true, q: "покупать продукты", answer: null, placeholder: "Я обычно… Я уже…" },
                { free: true, q: "повторять слова", answer: null, placeholder: "Я обычно… Я уже…" },
                { free: true, q: "писать письма", answer: null, placeholder: "Я обычно… Я уже…" },
                { free: true, q: "убирать комнату", answer: null, placeholder: "Я обычно… Я уже…" },
                { free: true, q: "решать задачи", answer: null, placeholder: "Я обычно… Я уже…" },
                { free: true, q: "изучать новую тему", answer: null, placeholder: "Я обычно… Я уже…" }
            ]
        },
        {
            id: "ex6",
            type: "input",
            icon: "fa-arrows-split-up-and-left",
            showTask: true,
            title: "6-mashq. «Я обычно…, но сегодня уже…»",
            intro: "Model asosida TO'LIQ gap yozing. Birinchi qismdagi odatni saqlang, ikkinchi qismda bugungi tugallangan natijani СВ bilan ifodalang. Bir nechta to'g'ri javob bo'lishi mumkin.",
            namuna: "Я обычно готовлю дома, но сегодня уже пообедал в кафе.",
            items: [
                { free: true, q: "Я обычно читаю вечером, но сегодня уже ________.", answer: null, placeholder: "To'liq gapni yozing..." },
                { free: true, q: "Я обычно готовлю дома, но сегодня уже ________.", answer: null, placeholder: "To'liq gapni yozing..." },
                { free: true, q: "Я обычно езжу на работу на метро, но сегодня уже ________.", answer: null, placeholder: "To'liq gapni yozing..." },
                { free: true, q: "Я обычно делаю покупки вечером, но сегодня уже ________.", answer: null, placeholder: "To'liq gapni yozing..." },
                { free: true, q: "Я обычно смотрю фильмы ночью, но сегодня уже ________.", answer: null, placeholder: "To'liq gapni yozing..." },
                { free: true, q: "Я обычно занимаюсь спортом утром, но сегодня уже ________.", answer: null, placeholder: "To'liq gapni yozing..." },
                { free: true, q: "Я обычно пишу отчёт вечером, но сегодня уже ________.", answer: null, placeholder: "To'liq gapni yozing..." },
                { free: true, q: "Я обычно повторяю слова дома, но сегодня уже ________.", answer: null, placeholder: "To'liq gapni yozing..." },
                { free: true, q: "Я обычно убираю комнату в выходные, но сегодня уже ________.", answer: null, placeholder: "To'liq gapni yozing..." },
                { free: true, q: "Я обычно звоню родителям вечером, но сегодня уже ________.", answer: null, placeholder: "To'liq gapni yozing..." }
            ]
        },
        {
            id: "ex7",
            type: "input",
            icon: "fa-flag-checkered",
            showTask: true,
            title: "7-mashq. «Я долго…, но наконец…»",
            intro: "Berilgan fe'llardan foydalanib TO'LIQ gap tuzing: uzoq davom etgan jarayon НСВ bilan, natija esa СВ bilan. Ob'ektni o'zingiz tanlaysiz, shuning uchun bir nechta to'g'ri javob bor.",
            namuna: "Я долго искал информацию, но наконец нашёл нужный сайт.",
            items: [
                { free: true, q: "долго / искать / найти", answer: null, placeholder: "Я долго…, но наконец…" },
                { free: true, q: "долго / готовить / приготовить", answer: null, placeholder: "Я долго…, но наконец…" },
                { free: true, q: "долго / решать / решить", answer: null, placeholder: "Я долго…, но наконец…" },
                { free: true, q: "долго / писать / написать", answer: null, placeholder: "Я долго…, но наконец…" },
                { free: true, q: "долго / выбирать / выбрать", answer: null, placeholder: "Я долго…, но наконец…" },
                { free: true, q: "долго / объяснять / объяснить", answer: null, placeholder: "Я долго…, но наконец…" },
                { free: true, q: "долго / ждать / дождаться", answer: null, placeholder: "Я долго…, но наконец…" },
                { free: true, q: "долго / готовиться / подготовиться", answer: null, placeholder: "Я долго…, но наконец…" },
                { free: true, q: "долго / думать / придумать", answer: null, placeholder: "Я долго…, но наконец…" },
                { free: true, q: "долго / работать / закончить", answer: null, placeholder: "Я долго…, но наконец…" }
            ]
        },
        {
            id: "ex8",
            type: "input",
            icon: "fa-people-arrows",
            showTask: true,
            title: "8-mashq. Пока + НСВ, НСВ",
            intro: "Berilgan ega va fe'llardan «Пока…» modelida to'liq gap tuzing. Ikkala fe'l ham НСВ, o'tgan zamonda bo'ladi.",
            namuna: "я / готовить / дети / играть → Пока я готовил, дети играли.",
            items: [
                { q: "я / читать / сестра / смотреть телевизор", answer: ["Пока я читал, сестра смотрела телевизор.", "Пока я читала, сестра смотрела телевизор."] },
                { q: "мама / готовить / дети / играть", answer: ["Пока мама готовила, дети играли."] },
                { q: "я / работать / друг / ждать", answer: ["Пока я работал, друг ждал.", "Пока я работала, друг ждал."] },
                { q: "она / учиться / брат / заниматься спортом", answer: ["Пока она училась, брат занимался спортом."] },
                { q: "мы / обсуждать / они / слушать", answer: ["Пока мы обсуждали, они слушали."] },
                { q: "я / писать письмо / жена / готовить ужин", answer: ["Пока я писал письмо, жена готовила ужин.", "Пока я писала письмо, жена готовила ужин."] },
                { q: "дети / делать уроки / родители / отдыхать", answer: ["Пока дети делали уроки, родители отдыхали."] },
                { q: "он / работать / коллеги / разговаривать", answer: ["Пока он работал, коллеги разговаривали."] },
                { q: "я / убирать комнату / брат / смотреть фильм", answer: ["Пока я убирал комнату, брат смотрел фильм.", "Пока я убирала комнату, брат смотрел фильм."] },
                { q: "мы / ехать / дети / спать", answer: ["Пока мы ехали, дети спали."] }
            ]
        },
        {
            id: "ex9",
            type: "input",
            icon: "fa-list-ol",
            showTask: true,
            title: "9-mashq. Когда + СВ, СВ",
            intro: "«Когда я …, я …» modelida to'liq gap tuzing. Ikkala fe'l ham СВ va bitta jinsga mos bo'lishi kerak.",
            namuna: "закончить работу → пойти домой → Когда я закончил работу, я пошёл домой.",
            items: [
                { q: "закончить работу → позвонить другу", answer: ["Когда я закончил работу, я позвонил другу.", "Когда я закончила работу, я позвонила другу."] },
                { q: "сделать домашнее задание → посмотреть фильм", answer: ["Когда я сделал домашнее задание, я посмотрел фильм.", "Когда я сделала домашнее задание, я посмотрела фильм."] },
                { q: "приготовить ужин → пригласить гостей", answer: ["Когда я приготовил ужин, я пригласил гостей.", "Когда я приготовила ужин, я пригласила гостей."] },
                { q: "купить билеты → сообщить родителям", answer: ["Когда я купил билеты, я сообщил родителям.", "Когда я купила билеты, я сообщила родителям."] },
                { q: "закончить курс → получить сертификат", answer: ["Когда я закончил курс, я получил сертификат.", "Когда я закончила курс, я получила сертификат."] },
                { q: "решить проблему → сообщить руководителю", answer: ["Когда я решил проблему, я сообщил руководителю.", "Когда я решила проблему, я сообщила руководителю."] },
                { q: "прочитать книгу → обсудить её", answer: ["Когда я прочитал книгу, я обсудил её.", "Когда я прочитала книгу, я обсудила её."] },
                { q: "подготовиться к экзамену → сдать его", answer: ["Когда я подготовился к экзамену, я сдал его.", "Когда я подготовилась к экзамену, я сдала его."] },
                { q: "убрать комнату → пригласить друзей", answer: ["Когда я убрал комнату, я пригласил друзей.", "Когда я убрала комнату, я пригласила друзей."] },
                { q: "написать письмо → отправить его", answer: ["Когда я написал письмо, я отправил его.", "Когда я написала письмо, я отправила его."] }
            ]
        },
        {
            id: "ex10",
            type: "input",
            icon: "fa-award",
            showTask: true,
            title: "10-mashq. Tajriba va natija",
            intro: "Model asosida bitta TO'LIQ gap yozing: avvalgi odat yoki tajribani НСВ bilan, hozirgi tugallangan natijani esa СВ bilan taqqoslang. Bu ochiq mashq.",
            namuna: "Я раньше часто путешествовал по Европе, но в этом году уже посетил три новые страны.",
            items: [
                { free: true, q: "раньше / часто читать книги → уже / прочитать / пять книг", answer: null, placeholder: "Раньше…, но уже…" },
                { free: true, q: "раньше / изучать английский → уже / выучить / много новых слов", answer: null, placeholder: "Раньше…, но уже…" },
                { free: true, q: "раньше / путешествовать → уже / посетить / несколько стран", answer: null, placeholder: "Раньше…, но уже…" },
                { free: true, q: "раньше / работать в офисе → уже / перейти / на удалённую работу", answer: null, placeholder: "Раньше…, но уже…" },
                { free: true, q: "раньше / часто готовить дома → уже / научиться / готовить несколько новых блюд", answer: null, placeholder: "Раньше…, но уже…" },
                { free: true, q: "раньше / заниматься спортом → уже / пробежать / свой первый марафон", answer: null, placeholder: "Раньше…, но уже…" },
                { free: true, q: "раньше / смотреть русские фильмы → уже / посмотреть / много фильмов без субтитров", answer: null, placeholder: "Раньше…, но уже…" },
                { free: true, q: "раньше / бояться говорить по-русски → уже / провести / несколько разговоров", answer: null, placeholder: "Раньше…, но уже…" },
                { free: true, q: "раньше / делать много ошибок → уже / исправить / большинство ошибок", answer: null, placeholder: "Раньше…, но уже…" },
                { free: true, q: "раньше / плохо понимать русскую речь → уже / начать / понимать фильмы без перевода", answer: null, placeholder: "Раньше…, но уже…" }
            ]
        },
        {
            id: "audio1",
            type: "choice",
            style: "tf",
            icon: "fa-headphones",
            showTask: true,
            title: "Audio bo'yicha «Rost yoki yolg'on» mashqi",
            intro: "Audioni tinglang va gaplar «Правда» yoki «Ложь» ekanini aniqlang.",
            audioSrc: "audios/%D0%912%207%20%D1%83%D1%80%D0%BE%D0%BA.mp3",
            items: [
                { q: "Раньше герой очень хорошо говорил по-русски.", options: ["Правда", "Ложь"], answer: "Ложь" },
                { q: "Он часто делал ошибки и забывал простые выражения.", options: ["Правда", "Ложь"], answer: "Правда" },
                { q: "Обычно он читал короткие тексты и смотрел фильмы с субтитрами.", options: ["Правда", "Ложь"], answer: "Правда" },
                { q: "Герой решил серьёзно заняться русским языком после одной встречи.", options: ["Правда", "Ложь"], answer: "Ложь" },
                { q: "Он начал заниматься русским каждый день.", options: ["Правда", "Ложь"], answer: "Правда" },
                { q: "Через несколько месяцев он выучил много новых слов.", options: ["Правда", "Ложь"], answer: "Правда" },
                { q: "Герой никогда не разговаривал с носителями русского языка.", options: ["Правда", "Ложь"], answer: "Ложь" },
                { q: "Сейчас он обычно занимается русским утром.", options: ["Правда", "Ложь"], answer: "Ложь" },
                { q: "Сегодня он уже сделал все упражнения и прочитал один текст.", options: ["Правда", "Ложь"], answer: "Правда" },
                { q: "Раньше ему было сложно понять разницу между СВ и НСВ.", options: ["Правда", "Ложь"], answer: "Правда" }
            ]
        }
    ];

    var LESSON_8_GRAMMAR = "<div class=\"b2g\"><div class=\"b2g-lead\"><div class=\"b2g-lead-title\">Глаголы движения с приставками</div><p>Приставka harakat fe’liga qo‘shilganda uning ma’nosi o‘zgaradi: harakat qayerga yo‘nalgani, qayerdan chiqilgani, boshlangani yoki tugagani aniq ko‘rsatiladi.</p></div><h4>1. Asosiy qoida</h4><p>Bitta fe’l turli приставкalar bilan butunlay boshqa vaziyatni ifodalaydi.</p><table class=\"b2g-t\"><tr><th>Fe’l</th><th>Ma’nosi</th></tr><tr><td>ехать → приехать</td><td>yetib kelmoq</td></tr><tr><td>ехать → уехать</td><td>ketib qolmoq</td></tr><tr><td>ехать → въехать</td><td>transportda ichkariga kirmoq</td></tr><tr><td>ехать → выехать</td><td>transportda tashqariga chiqmoq</td></tr><tr><td>идти → зайти</td><td>kirib o‘tmoq</td></tr><tr><td>идти → выйти</td><td>chiqmoq</td></tr><tr><td>идти → подойти</td><td>yaqinlashmoq</td></tr><tr><td>идти → отойти</td><td>uzoqlashmoq</td></tr></table><p>Приставkaning ma’nosi kontekstga qarab aniqlashadi — bitta приставka har doim bitta o‘zbekcha ekvivalentga to‘g‘ri kelavermaydi.</p><h4>2. Eng muhim приставкalar</h4><p><b>В- / ВО- — ichkariga kirish.</b> идти → войти · ехать → въехать</p><p><b>Model:</b> войти / въехать + <b>в</b> + В.п. — <i>Куда?</i></p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я вошёл в комнату.</td><td>Men xonaga kirdim.</td></tr><tr><td>Мы вошли в музей.</td><td>Biz muzeyga kirdik.</td></tr><tr><td>Машина въехала в гараж.</td><td>Mashina garajga kirdi.</td></tr><tr><td>Я вошёл в магазин.</td><td>Men do‘konga kirdim.</td></tr></table><p><b>ВЫ- — ichkaridan tashqariga chiqish.</b> идти → выйти · ехать → выехать · лететь → вылететь</p><p><b>Model:</b> выйти / выехать / вылететь + <b>из</b> + Р.п. — <i>Откуда?</i></p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Он вышел из дома.</td><td>U uydan chiqdi.</td></tr><tr><td>Мы выехали из города.</td><td>Biz shahardan chiqdik.</td></tr><tr><td>Пассажиры вышли из автобуса.</td><td>Yo‘lovchilar avtobusdan tushdi.</td></tr><tr><td>Самолёт вылетел из аэропорта.</td><td>Samolyot aeroportdan uchib ketdi.</td></tr></table><p><b>ПРИ- — manzilga yetib kelish.</b> ехать → приехать · идти → прийти · лететь → прилететь</p><p><b>Model:</b> приехать / прийти / прилететь + <b>в/на</b> + В.п.</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я приехал в Самарканд.</td><td>Men Samarqandga yetib keldim.</td></tr><tr><td>Она пришла на работу.</td><td>U ishga keldi.</td></tr><tr><td>Самолёт прилетел в Москву.</td><td>Samolyot Moskvaga uchib keldi.</td></tr></table><table class=\"b2g-t\"><tr><th>Gap</th><th>Ma’nosi</th></tr><tr><td>Я <span class=\"b2g-tone-nsv\">ехал</span> в Самарканд.</td><td>Men Samarqand tomon ketayotgan edim — jarayon.</td></tr><tr><td>Я <span class=\"b2g-tone-sv\">приехал</span> в Самарканд.</td><td>Men Samarqandga yetib keldim — natija.</td></tr></table><p><b>У- — biror joyni tark etish.</b> ехать → уехать · идти → уйти · лететь → улететь</p><p><b>Model:</b> уехать / уйти + <b>из</b> + Р.п. <b>yoki</b> + <b>с</b> + Р.п.</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Он уехал из города.</td><td>U shahardan ketdi.</td></tr><tr><td>Она ушла с работы.</td><td>U ishdan ketdi.</td></tr><tr><td>Мы улетели из Москвы.</td><td>Biz Moskvadan uchib ketdik.</td></tr><tr><td>Когда мы приехали, они уже уехали.</td><td>Biz kelganimizda, ular allaqachon ketishgan edi.</td></tr></table><p>Predlog joyning turiga bog‘liq: <b>из города</b>, lekin <b>с работы</b>, <b>с вокзала</b>, <b>с остановки</b>.</p><p><b>ЗА- — yo‘l-yo‘lakay qisqa muddatga kirib o‘tish.</b> Bu приставка B2 darajada juda muhim va ikki shakli bor:</p><table class=\"b2g-t\"><tr><th>Fe’l</th><th>Qachon ishlatiladi</th></tr><tr><td>зайти</td><td>piyoda kirib o‘tmoq</td></tr><tr><td>заехать</td><td>transportda yo‘l-yo‘lakay kirib o‘tmoq</td></tr></table><p><b>Model:</b> зайти / заехать + <b>в/на</b> + В.п. &nbsp;·&nbsp; зайти / заехать + <b>к</b> + Д.п.</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я зашёл в магазин за водой.</td><td>Men suv olish uchun do‘konga kirib o‘tdim.</td></tr><tr><td>Мы зашли в кафе выпить кофе.</td><td>Biz qahva ichish uchun kafega kirib o‘tdik.</td></tr><tr><td>По дороге домой я зашёл к другу.</td><td>Uyga ketayotib do‘stimnikiga kirib o‘tdim.</td></tr><tr><td>По дороге мы заехали в небольшое кафе.</td><td>Yo‘lda biz kichik kafega kirib o‘tdik.</td></tr><tr><td>Мы заехали на заправку.</td><td>Biz zapravkaga kirib o‘tdik.</td></tr></table><p><b>ПОД- — yaqinlashish.</b> подойти — piyoda · подъехать — transportda</p><p><b>Model:</b> подойти / подъехать + <b>к</b> + Д.п.</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я подошёл к окну.</td><td>Men derazaga yaqinlashdim.</td></tr><tr><td>Машина подъехала к отелю.</td><td>Mashina mehmonxonaga yaqinlashdi.</td></tr><tr><td>Мы подъехали к аэропорту.</td><td>Biz aeroportga yaqinlashdik.</td></tr></table><p><b>ОТ- — uzoqlashish.</b> отойти — piyoda · отъехать — transportda</p><p><b>Model:</b> отойти / отъехать + <b>от</b> + Р.п.</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Он отошёл от двери.</td><td>U eshikdan uzoqlashdi.</td></tr><tr><td>Автобус отъехал от остановки.</td><td>Avtobus bekatdan jo‘nab ketdi.</td></tr><tr><td>Я немного отошёл от группы.</td><td>Men guruhdan biroz uzoqlashdim.</td></tr></table><p><b>ПЕРЕ- — bir joydan ikkinchi joyga o‘tish.</b></p><div class=\"b2g-chips\"><span>перейти дорогу</span><span>переехать в другой город</span><span>перелететь через границу</span><span>переплыть реку</span></div><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Мы перешли через дорогу.</td><td>Biz yo‘ldan o‘tdik.</td></tr><tr><td>Они переехали в другой город.</td><td>Ular boshqa shaharga ko‘chib o‘tishdi.</td></tr><tr><td>Семья переехала из Ташкента в Алматы.</td><td>Oila Toshkentdan Olmaotaga ko‘chib o‘tdi.</td></tr></table><p><b>ОБ- / О- — aylanib yoki chetlab o‘tish.</b></p><div class=\"b2g-chips\"><span>обойти здание</span><span>объехать пробку</span><span>обойти препятствие</span></div><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Водитель объехал пробку и приехал вовремя.</td><td>Haydovchi tirbandlikni aylanib o‘tdi va vaqtida yetib keldi.</td></tr></table><p><b>ПРО- — masofani bosib o‘tish yoki yonidan o‘tib ketish.</b> Bu приставкaning ikkita ma’nosi bor va darsda ikkalasi ham uchraydi:</p><table class=\"b2g-t\"><tr><th>Ma’nosi</th><th>Namuna</th></tr><tr><td>bosib o‘tilgan masofa</td><td>пройти пять километров · проехать десять километров</td></tr><tr><td>biror narsaning yonidan o‘tib ketish</td><td>пройти мимо дома</td></tr></table><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Мы прошли пять километров, прежде чем нашли гостиницу.</td><td>Mehmonxonani topgunimizcha besh kilometr yurdik.</td></tr></table><h4>3. Sayohatda eng ko‘p ishlatiladigan modellar</h4><table class=\"b2g-t\"><tr><th>Model</th><th>Namuna</th></tr><tr><td>Я приехал в…</td><td>Я приехал в Бухару. · Я приехал в аэропорт.</td></tr><tr><td>Он вышел из…</td><td>Он вышел из автобуса. · Он вышел из гостиницы.</td></tr><tr><td>Мы зашли в…</td><td>Мы зашли в кафе. · Мы зашли в туристический центр.</td></tr><tr><td>Они уехали из…</td><td>Они уехали из Самарканда.</td></tr><tr><td>Она подошла к…</td><td>Она подошла к кассе.</td></tr><tr><td>Машина отъехала от…</td><td>Машина отъехала от отеля.</td></tr><tr><td>Мы переехали в…</td><td>Мы переехали в другой город.</td></tr></table><h4>4. Приставка + падеж</h4><p>Harakat fe’llari bilan predlog va kelishikni to‘g‘ri tanlash juda muhim.</p><table class=\"b2g-t\"><tr><th>Куда?</th><th>Namuna</th></tr><tr><td>в + В.п.</td><td>приехать в город</td></tr><tr><td>на + В.п.</td><td>приехать на вокзал</td></tr><tr><td>к + Д.п.</td><td>подойти к кассе</td></tr></table><table class=\"b2g-t\"><tr><th>Откуда?</th><th>Namuna</th></tr><tr><td>из + Р.п.</td><td>выйти из здания</td></tr><tr><td>с + Р.п.</td><td>уйти с работы</td></tr><tr><td>от + Р.п.</td><td>отойти от двери</td></tr></table><p><b>Qisqacha:</b> Куда? → в / на / к &nbsp;·&nbsp; Откуда? → из / с / от</p><h4>5. СВ va НСВ bilan farqi</h4><p>Darsdagi maqsad shakllarning ko‘pi <span class=\"b2g-tone-sv\">tugallangan (СВ)</span> bo‘ladi:</p><div class=\"b2g-chips\"><span>приехать</span><span>уехать</span><span>прийти</span><span>уйти</span><span>войти</span><span>выйти</span><span>зайти</span><span>подойти</span><span>отойти</span><span>переехать</span></div><div class=\"b2g-warn\"><b>Diqqat: приставка borligi vidni o‘zi belgilamaydi.</b> Приставkali harakat fe’llarining odatdagi <span class=\"b2g-tone-nsv\">tugallanmagan (НСВ)</span> juftlari ham bor, va ular takroriy yoki davom etayotgan harakat uchun kerak:<table class=\"b2g-t\"><tr><th><span class=\"b2g-tone-nsv\">НСВ</span></th><th><span class=\"b2g-tone-sv\">СВ</span></th></tr><tr><td>приезжать</td><td>приехать</td></tr><tr><td>уезжать</td><td>уехать</td></tr><tr><td>входить</td><td>войти</td></tr><tr><td>выходить</td><td>выйти</td></tr><tr><td>заходить</td><td>зайти</td></tr><tr><td>подходить</td><td>подойти</td></tr><tr><td>отходить</td><td>отойти</td></tr><tr><td>подъезжать</td><td>подъехать</td></tr><tr><td>отъезжать</td><td>отъехать</td></tr><tr><td>переезжать</td><td>переехать</td></tr><tr><td>прилетать</td><td>прилететь</td></tr><tr><td>улетать</td><td>улететь</td></tr></table></div><p>Приставkasiz harakat fe’llarida yana bir farq bor — bir yo‘nalishli harakat va takroriy yo‘nalish:</p><table class=\"b2g-t\"><tr><th>Shakl</th><th>Ma’nosi</th></tr><tr><td><span class=\"b2g-tone-nsv\">ездить</span></td><td>takroriy, odatiy yo‘nalish — Каждый день она ездит на работу.</td></tr><tr><td><span class=\"b2g-tone-nsv\">ехать</span></td><td>hozirgi bir yo‘nalishli jarayon — Я ехал в Самарканд.</td></tr><tr><td><span class=\"b2g-tone-sv\">приехать</span></td><td>yetib kelish, natija — Я приехал в Самарканд.</td></tr><tr><td><span class=\"b2g-tone-nsv\">приезжать</span></td><td>takroriy yetib kelish — Он часто приезжает к нам.</td></tr></table><table class=\"b2g-t\"><tr><th>Gap</th><th>Ma’nosi</th></tr><tr><td>Я ехал в аэропорт.</td><td>Men aeroportga ketayotgan edim.</td></tr><tr><td>Я приехал в аэропорт.</td><td>Men aeroportga yetib keldim.</td></tr></table><h4>6. Kutilmagan vaziyatlarda</h4><p>Sayohatdagi kutilmagan holatlarni tasvirlash uchun приставkali fe’llar juda qulay.</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Мы заблудились и случайно вышли не на той улице.</td><td>Biz adashib qoldik va tasodifan boshqa ko‘chaga chiqib qoldik.</td></tr><tr><td>Автобус уехал, пока мы покупали билеты.</td><td>Biz chipta sotib olayotganimizda avtobus jo‘nab ketdi.</td></tr><tr><td>Мы опоздали и приехали слишком поздно.</td><td>Biz kechikdik va juda kech yetib keldik.</td></tr><tr><td>Водитель объехал пробку.</td><td>Haydovchi tirbandlikni aylanib o‘tdi.</td></tr><tr><td>Самолёт улетел без нас.</td><td>Samolyot bizsiz uchib ketdi.</td></tr><tr><td>Мы зашли не в тот вагон.</td><td>Biz noto‘g‘ri vagonga kirib qoldik.</td></tr><tr><td>Турист отошёл от группы и потерялся.</td><td>Sayyoh guruhdan uzoqlashib, yo‘qolib qoldi.</td></tr><tr><td>Мы вышли из автобуса, но забыли там сумку.</td><td>Biz avtobusdan tushdik, lekin sumkani u yerda unutdik.</td></tr></table><h4>7. B2 uchun muhim konstruksiyalar</h4><table class=\"b2g-t\"><tr><th>Konstruksiya</th><th>Namuna</th></tr><tr><td>Я приехал в…, чтобы…</td><td>Я приехал в Бухару, чтобы посетить старый город.</td></tr><tr><td>Когда я приехал…, уже…</td><td>Когда я приехал в аэропорт, самолёт уже улетел.</td></tr><tr><td>Как только мы вышли из…, …</td><td>Как только мы вышли из гостиницы, начался сильный дождь.</td></tr><tr><td>По дороге мы зашли в…, чтобы…</td><td>По дороге мы зашли в кафе, чтобы немного отдохнуть.</td></tr><tr><td>Несмотря на то что…, мы…</td><td>Несмотря на то что мы заблудились, мы всё-таки дошли до гостиницы.</td></tr><tr><td>Из-за того что…, пришлось…</td><td>Из-за того что автобус сломался, нам пришлось выйти и ждать другой.</td></tr></table><div class=\"b2g-check\"><h4>B2 darajada asosiy maqsad</h4><p>O‘quvchi faqat <b>приехал / вышел / зашёл</b> shakllarini yodlamasdan, bitta gapda quyidagilarni birga ifodalay olishi kerak:</p><ul class=\"b2g-list\"><li>harakatning <b>yo‘nalishi</b></li><li><b>manzili</b></li><li><b>boshlanish nuqtasi</b></li><li>harakat <b>natijasi</b></li><li>vaziyatning <b>sababi</b></li></ul><p><b>Namuna:</b> Когда мы приехали в аэропорт, оказалось, что наш самолёт уже улетел, поэтому нам пришлось вернуться в гостиницу и перенести поездку на следующий день.</p></div></div>";

    var LESSON_8_EXERCISES = [
        {
            id: "ex1",
            type: "input",
            icon: "fa-route",
            showTask: true,
            title: "1-mashq. To'g'ri fe'lni tanlang",
            intro: "Qavs ichidagi ikki fe'ldan mosini tanlang va uni gapdagi shaklda yozing.",
            namuna: "Мы ___ в Самарканд вечером. (приехать / уехать) → Мы приехали в Самарканд вечером.",
            items: [
                { q: "Вчера мы ___ в Бухару поздно вечером. (приехать / уехать)", answer: ["приехали"] },
                { q: "Когда я ___ из дома, начался дождь. (выйти / войти)", answer: ["вышел", "вышла"] },
                { q: "Туристы ___ в музей и сразу пошли к экскурсоводу. (зайти / выйти)", answer: ["зашли"] },
                { q: "Автобус уже ___ от остановки. (отъехать / подъехать)", answer: ["отъехал"] },
                { q: "Машина медленно ___ к гостинице. (подъехать / отъехать)", answer: ["подъехала"] },
                { q: "После экскурсии мы ___ из музея. (выйти / войти)", answer: ["вышли"] },
                { q: "Они решили ___ в другой город. (переехать / подойти)", answer: ["переехать"] },
                { q: "Самолёт ___ из аэропорта вовремя. (улететь / приехать)", answer: ["улетел"] },
                { q: "Мы случайно ___ не в тот вагон. (зайти / выйти)", answer: ["зашли"] },
                { q: "Я ___ к кассе и спросил о билетах. (подойти / отойти)", answer: ["подошёл"] }
            ]
        },
        {
            id: "ex2",
            type: "input",
            icon: "fa-signs-post",
            showTask: true,
            title: "2-mashq. To'g'ri predlogni qo'ying",
            intro: "Bo'sh joyga faqat predlogni yozing: Куда? → в / на / к, Откуда? → из / с / от.",
            namuna: "Мы приехали ___ аэропорт. → Мы приехали в аэропорт.",
            items: [
                { q: "Он вышел ___ автобуса.", answer: "из" },
                { q: "Туристы подошли ___ карте.", answer: "к" },
                { q: "Она ушла ___ работы раньше.", answer: "с" },
                { q: "Мы зашли ___ кафе.", answer: "в" },
                { q: "Машина отъехала ___ гостиницы.", answer: "от" },
                { q: "Они приехали ___ Бухару утром.", answer: "в" },
                { q: "Я вышел ___ комнаты.", answer: "из" },
                { q: "Автобус подъехал ___ остановке.", answer: "к" },
                { q: "Мы вернулись ___ экскурсии поздно вечером.", answer: "с" },
                { q: "Самолёт вылетел ___ аэропорта.", answer: "из" }
            ]
        },
        {
            id: "ex3",
            type: "input",
            icon: "fa-arrows-left-right-to-line",
            showTask: true,
            title: "3-mashq. СВ yoki НСВ ni tanlang",
            intro: "Qavs ichidagi ikki fe'ldan vaziyatga mosini tanlang va gapdagi shaklda yozing.",
            namuna: "Когда я ___ домой, мне позвонил друг. (идти / прийти) → Когда я шёл домой, мне позвонил друг.",
            items: [
                { q: "Вчера мы долго ___ в аэропорт. (ехать / приехать)", answer: ["ехали"] },
                { q: "Наконец мы ___ в гостиницу. (приезжать / приехать)", answer: ["приехали"] },
                { q: "Как только я ___ из дома, начался дождь. (выходить / выйти)", answer: ["вышел", "вышла"] },
                { q: "Каждый день она ___ на работу на автобусе. (ездить / приехать)", answer: ["ездит"] },
                { q: "Вчера утром они окончательно ___ из Ташкента в Самарканд. (уезжать / уехать)", answer: ["уехали"] },
                { q: "Пока мы ___ к вокзалу, начался дождь. (подходить / подойти)", answer: ["подходили"] },
                { q: "Как только автобус ___ к остановке, двери открылись. (подъезжать / подъехать)", answer: ["подъехал"] },
                { q: "Мы долго ___ по городу. (ходить / пойти)", answer: ["ходили"] },
                { q: "Самолёт уже ___, когда мы приехали. (улетать / улететь)", answer: ["улетел"] },
                { q: "Обычно я ___ домой после девяти часов. (возвращаться / вернуться)", answer: ["возвращаюсь"] }
            ]
        },
        {
            id: "ex4",
            type: "input",
            icon: "fa-comments",
            showTask: true,
            title: "4-mashq. Savolga to'liq javob bering",
            intro: "Savolga bir so'z bilan emas, TO'LIQ gap bilan javob bering. Bu ochiq mashq — javobni o'zingiz tanlaysiz.",
            namuna: "— Куда вы приехали? → Я приехал в Самарканд.",
            items: [
                { free: true, q: "Куда ты приехал?", answer: null, placeholder: "To'liq gap bilan javob bering..." },
                { free: true, q: "Откуда он вышел?", answer: null, placeholder: "To'liq gap bilan javob bering..." },
                { free: true, q: "Куда вы зашли?", answer: null, placeholder: "To'liq gap bilan javob bering..." },
                { free: true, q: "Откуда они уехали?", answer: null, placeholder: "To'liq gap bilan javob bering..." },
                { free: true, q: "К кому она подошла?", answer: null, placeholder: "To'liq gap bilan javob bering..." },
                { free: true, q: "Откуда отъехала машина?", answer: null, placeholder: "To'liq gap bilan javob bering..." },
                { free: true, q: "Куда вы переехали?", answer: null, placeholder: "To'liq gap bilan javob bering..." },
                { free: true, q: "Откуда прилетели туристы?", answer: null, placeholder: "To'liq gap bilan javob bering..." },
                { free: true, q: "Куда ты вошёл?", answer: null, placeholder: "To'liq gap bilan javob bering..." },
                { free: true, q: "Откуда они вышли?", answer: null, placeholder: "To'liq gap bilan javob bering..." }
            ]
        },
        {
            id: "ex5",
            type: "input",
            icon: "fa-link",
            showTask: true,
            title: "5-mashq. Ikki gapni birlashtiring",
            intro: "Ikki gapni «Когда…» modeli yordamida bitta gapga birlashtiring va to'liq yozing.",
            namuna: "Мы приехали в гостиницу. Мы оставили вещи. → Когда мы приехали в гостиницу, мы оставили вещи.",
            items: [
                { q: "Мы вышли из аэропорта. Начался сильный дождь.", answer: ["Когда мы вышли из аэропорта, начался сильный дождь."] },
                { q: "Туристы зашли в музей. Экскурсовод начал рассказ.", answer: ["Когда туристы зашли в музей, экскурсовод начал рассказ."] },
                { q: "Автобус подъехал к остановке. Пассажиры вошли.", answer: ["Когда автобус подъехал к остановке, пассажиры вошли."] },
                { q: "Мы приехали в гостиницу. Мы оставили вещи.", answer: ["Когда мы приехали в гостиницу, мы оставили вещи."] },
                { q: "Я вышел из дома. Мне позвонил друг.", answer: ["Когда я вышел из дома, мне позвонил друг.", "Когда я вышла из дома, мне позвонил друг."] },
                { q: "Самолёт прилетел. Пассажиры вышли.", answer: ["Когда самолёт прилетел, пассажиры вышли."] },
                { q: "Мы подошли к кассе. Билеты уже закончились.", answer: ["Когда мы подошли к кассе, билеты уже закончились."] },
                { q: "Они уехали из города. Погода резко изменилась.", answer: ["Когда они уехали из города, погода резко изменилась."] },
                { q: "Мы вошли в вагон. Поезд сразу отправился.", answer: ["Когда мы вошли в вагон, поезд сразу отправился."] },
                { q: "Я вернулся домой. Я обнаружил, что забыл ключи.", answer: ["Когда я вернулся домой, я обнаружил, что забыл ключи.", "Когда я вернулась домой, я обнаружила, что забыла ключи."] }
            ]
        },
        {
            id: "ex6",
            type: "input",
            icon: "fa-eraser",
            showTask: true,
            title: "6-mashq. Xatoni toping va tuzating",
            intro: "Har bir gapda predlog yoki kelishik xatosi bor. Fe'lni o'zgartirmasdan to'g'ri gapni to'liq yozing.",
            namuna: "Я приехал из Самарканд. → Я приехал в Самарканд.",
            items: [
                { q: "Я приехал из Самарканд.", answer: ["Я приехал в Самарканд.", "Я приехал из Самарканда."] },
                { q: "Он вышел в автобуса.", answer: ["Он вышел из автобуса."] },
                { q: "Мы подошли от кассе.", answer: ["Мы подошли к кассе."] },
                { q: "Они зашли из магазин.", answer: ["Они зашли в магазин."] },
                { q: "Машина подъехала от гостиницы.", answer: ["Машина подъехала к гостинице."] },
                { q: "Я уехал в Ташкента.", answer: ["Я уехал из Ташкента.", "Я уехал в Ташкент."] },
                { q: "Туристы вышли в музея.", answer: ["Туристы вышли из музея."] },
                { q: "Мы приехали на Бухару.", answer: ["Мы приехали в Бухару."] },
                { q: "Она отошла к двери.", answer: ["Она отошла от двери."] },
                { q: "Самолёт вылетел в аэропорта.", answer: ["Самолёт вылетел из аэропорта.", "Самолёт вылетел в аэропорт."] }
            ]
        },
        {
            id: "ex7",
            type: "input",
            icon: "fa-list-check",
            showTask: true,
            title: "7-mashq. Vaziyatga mos fe'lni tanlang",
            intro: "Fe'llar: приехать, уехать, выйти, войти, зайти, подойти, отойти, подъехать, переехать, выехать. Har bir fe'lni faqat BIR MARTA ishlating va gapdagi shaklda yozing.",
            namuna: "Машина медленно ___ к отелю. → Машина медленно подъехала к отелю.",
            items: [
                { q: "Мы ___ из города рано утром.", answer: "уехали" },
                { q: "Я ___ в комнату и увидел друзей.", answer: "вошёл" },
                { q: "Машина ___ к отелю.", answer: "подъехала" },
                { q: "Он ___ от окна и сел на диван.", answer: "отошёл" },
                { q: "Туристы ___ в кафе по дороге.", answer: "зашли" },
                { q: "Она ___ к администратору.", answer: "подошла" },
                { q: "После университета они ___ в другую страну.", answer: "переехали" },
                { q: "Мы ___ из автобуса на следующей остановке.", answer: "вышли" },
                { q: "Автомобиль ___ из гаража.", answer: "выехал" },
                { q: "Наконец мы ___ в Самарканд.", answer: "приехали" }
            ]
        },
        {
            id: "ex8",
            type: "input",
            icon: "fa-circle-question",
            showTask: true,
            title: "8-mashq. Kutilmagan vaziyatni davom ettiring",
            intro: "Gapni mantiqan davom ettirib, TO'LIQ yozing. Bu ochiq mashq — bir nechta to'g'ri davom bo'lishi mumkin.",
            namuna: "Когда мы приехали в аэропорт, оказалось, что… → …наш самолёт уже улетел.",
            items: [
                { free: true, q: "Мы зашли в кафе, но неожиданно…", answer: null, placeholder: "Gapni to'liq davom ettiring..." },
                { free: true, q: "Когда автобус подъехал к остановке,…", answer: null, placeholder: "Gapni to'liq davom ettiring..." },
                { free: true, q: "Мы вышли из гостиницы и вдруг…", answer: null, placeholder: "Gapni to'liq davom ettiring..." },
                { free: true, q: "Самолёт уже улетел, поэтому…", answer: null, placeholder: "Gapni to'liq davom ettiring..." },
                { free: true, q: "По дороге в Самарканд мы заехали…", answer: null, placeholder: "Gapni to'liq davom ettiring..." },
                { free: true, q: "Когда я подошёл к кассе,…", answer: null, placeholder: "Gapni to'liq davom ettiring..." },
                { free: true, q: "Мы заблудились и случайно вышли…", answer: null, placeholder: "Gapni to'liq davom ettiring..." },
                { free: true, q: "Из-за пробки водитель решил объехать…", answer: null, placeholder: "Gapni to'liq davom ettiring..." },
                { free: true, q: "Когда мы вошли в вагон,…", answer: null, placeholder: "Gapni to'liq davom ettiring..." },
                { free: true, q: "Когда мы переехали в новый город,…", answer: null, placeholder: "Gapni to'liq davom ettiring..." }
            ]
        },
        {
            id: "ex9",
            type: "input",
            icon: "fa-language",
            showTask: true,
            title: "9-mashq. Tarjima qiling",
            intro: "O'zbekcha gapni rus tiliga to'liq tarjima qiling. Jins yoki transport turi ko'rsatilmagan joyda bir nechta to'g'ri variant bor.",
            namuna: "Men Samarqandga kechqurun yetib keldim. → Я приехал в Самарканд вечером.",
            items: [
                { q: "U avtobusdan tushdi.", answer: ["Он вышел из автобуса.", "Она вышла из автобуса."] },
                { q: "Biz kafega kirib o‘tdik.", answer: ["Мы зашли в кафе.", "Мы заехали в кафе."] },
                { q: "Mashina mehmonxonaga yaqinlashdi.", answer: ["Машина подъехала к гостинице."] },
                { q: "U eshikdan uzoqlashdi.", answer: ["Он отошёл от двери.", "Она отошла от двери."] },
                { q: "Ular Toshkentdan ertalab ketishdi.", answer: ["Они уехали из Ташкента утром."] },
                { q: "Biz boshqa shaharga ko‘chib o‘tdik.", answer: ["Мы переехали в другой город."] },
                { q: "Men aeroportdan chiqqanimda yomg‘ir yog‘ayotgan edi.", answer: ["Когда я вышел из аэропорта, шёл дождь.", "Когда я вышла из аэропорта, шёл дождь."] },
                { q: "Biz yo‘lda kichik qishloqqa kirib o‘tdik.", answer: ["Мы по дороге зашли в небольшую деревню.", "Мы по дороге заехали в небольшую деревню.", "Мы по дороге зашли в маленькую деревню.", "Мы по дороге заехали в маленькую деревню."] },
                { q: "Avtobus bekatdan jo‘nab ketdi.", answer: ["Автобус отъехал от остановки."] },
                { q: "Ular Moskvaga samolyotda uchib kelishdi.", answer: ["Они прилетели в Москву.", "Они прилетели в Москву на самолёте."] }
            ]
        },
        {
            id: "ex10",
            type: "input",
            icon: "fa-map-location-dot",
            showTask: true,
            title: "10-mashq. «Куда? Откуда?»",
            intro: "Savolga приставkali fe'l + predlog + kelishik yordamida TO'LIQ javob bering. Bu ochiq mashq — javob o'zingiz haqingizda bo'ladi.",
            namuna: "— Куда приехали туристы? → Туристы приехали в Бухару.",
            items: [
                { free: true, q: "Куда приехала ваша семья?", answer: null, placeholder: "Fe'l + predlog + kelishik bilan to'liq javob..." },
                { free: true, q: "Откуда вы вышли утром?", answer: null, placeholder: "Fe'l + predlog + kelishik bilan to'liq javob..." },
                { free: true, q: "Куда вы зашли по дороге?", answer: null, placeholder: "Fe'l + predlog + kelishik bilan to'liq javob..." },
                { free: true, q: "Откуда уехали туристы?", answer: null, placeholder: "Fe'l + predlog + kelishik bilan to'liq javob..." },
                { free: true, q: "К кому подошёл экскурсовод?", answer: null, placeholder: "Fe'l + predlog + kelishik bilan to'liq javob..." },
                { free: true, q: "К чему подъехала машина?", answer: null, placeholder: "Fe'l + predlog + kelishik bilan to'liq javob..." },
                { free: true, q: "От чего отошёл пассажир?", answer: null, placeholder: "Fe'l + predlog + kelishik bilan to'liq javob..." },
                { free: true, q: "Куда переехали ваши друзья?", answer: null, placeholder: "Fe'l + predlog + kelishik bilan to'liq javob..." },
                { free: true, q: "Откуда вы выехали рано утром?", answer: null, placeholder: "Fe'l + predlog + kelishik bilan to'liq javob..." },
                { free: true, q: "Куда вошли пассажиры?", answer: null, placeholder: "Fe'l + predlog + kelishik bilan to'liq javob..." }
            ]
        },
        {
            id: "audio1",
            type: "choice",
            style: "tf",
            icon: "fa-headphones",
            showTask: true,
            title: "Audio bo'yicha «Rost yoki yolg'on» mashqi",
            intro: "Audioni tinglang va gaplar «Правда» yoki «Ложь» ekanini aniqlang.",
            audioSrc: "audios/%D0%912%208%20%D1%83%D1%80%D0%BE%D0%BA.mp3",
            items: [
                { q: "Друзья решили поехать в Бухару на несколько дней.", options: ["Правда", "Ложь"], answer: "Правда" },
                { q: "Они выехали из Ташкента вечером.", options: ["Правда", "Ложь"], answer: "Ложь" },
                { q: "Поезд задерживался почти на час.", options: ["Правда", "Ложь"], answer: "Правда" },
                { q: "Друзья зашли в кафе после объявления о посадке.", options: ["Правда", "Ложь"], answer: "Ложь" },
                { q: "В Бухаре они сразу нашли гостиницу.", options: ["Правда", "Ложь"], answer: "Ложь" },
                { q: "Они перепутали улицы и случайно оказались в другом районе.", options: ["Правда", "Ложь"], answer: "Правда" },
                { q: "Прохожий помог им найти дорогу к гостинице.", options: ["Правда", "Ложь"], answer: "Правда" },
                { q: "На следующий день автобус попал в аварию.", options: ["Правда", "Ложь"], answer: "Ложь" },
                { q: "Пассажирам пришлось выйти из автобуса из-за поломки.", options: ["Правда", "Ложь"], answer: "Правда" },
                { q: "Друзья решили, что неожиданные ситуации сделали путешествие более запоминающимся.", options: ["Правда", "Ложь"], answer: "Правда" }
            ]
        }
    ];

    var LESSON_9_GRAMMAR = "<div class=\"b2g\"><div class=\"b2g-lead\"><div class=\"b2g-lead-title\">Модальные конструкции</div><p>Bu konstruksiyalar harakatga bo‘lgan <b>majburiyat</b>, <b>zarurat</b>, <b>imkoniyat</b>, <b>qiyinchilik</b> yoki <b>natijaga erishish</b> ma’nolarini bildiradi.</p></div><h4>1. Мне пришлось + infinitiv</h4><p>Ma’nosi: «men majbur bo‘ldim / menga to‘g‘ri keldi». Odatda vaziyat yoki sharoit sababli majburan bajarilgan harakatni bildiradi.</p><p><b>Model:</b> Мне пришлось + infinitiv.</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Мне пришлось отменить поездку.</td><td>Men safarni bekor qilishga majbur bo‘ldim.</td></tr><tr><td>Из-за дождя нам пришлось остаться дома.</td><td>Yomg‘ir sababli biz uyda qolishga majbur bo‘ldik.</td></tr><tr><td>Мне пришлось изменить свои планы.</td><td>Rejalarimni o‘zgartirishga to‘g‘ri keldi.</td></tr></table><div class=\"b2g-warn\"><b>Muhim:</b> «пришлось» shaxsning o‘z xohishidan ko‘ra, tashqi vaziyat majbur qilganini ko‘rsatadi.<table class=\"b2g-t\"><tr><th>Gap</th><th>Ma’nosi</th></tr><tr><td>Я решил остаться дома.</td><td>Men uyda qolishga qaror qildim — o‘z qarorim.</td></tr><tr><td>Мне пришлось остаться дома.</td><td>Uyda qolishga majbur bo‘ldim — vaziyat sabab.</td></tr></table></div><h4>2. Мне удалось + infinitiv</h4><p>Ma’nosi: «uddaladim / muvaffaq bo‘ldim». Bu konstruksiya qiyinchiliklarga qaramay biror natijaga erishilganini bildiradi.</p><p><b>Model:</b> Мне удалось + infinitiv.</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Мне удалось решить эту проблему.</td><td>Men bu muammoni hal qila oldim.</td></tr><tr><td>Нам удалось найти нужную информацию.</td><td>Biz kerakli ma’lumotni topa oldik.</td></tr><tr><td>Ему удалось получить хорошую работу.</td><td>U yaxshi ish topishga muvaffaq bo‘ldi.</td></tr></table><p>«Удалось» bilan ko‘pincha quyidagi so‘zlar uchraydi — lekin ular <b>majburiy emas</b>:</p><div class=\"b2g-chips\"><span>наконец</span><span>всё-таки</span><span>успешно</span><span>несмотря на…</span></div><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Мне наконец удалось закончить проект.</td><td>Nihoyat loyihani tugatishga muvaffaq bo‘ldim.</td></tr><tr><td>Нам всё-таки удалось договориться.</td><td>Baribir kelishib olishga muvaffaq bo‘ldik.</td></tr><tr><td>Несмотря на трудности, ему удалось добиться успеха.</td><td>Qiyinchiliklarga qaramay, u muvaffaqiyatga erisha oldi.</td></tr></table><h4>3. Я вынужден + infinitiv</h4><p>Ma’nosi: «majburman». Kuchli majburiyatni yoki boshqa imkoniyat yo‘qligini bildiradi. «Вынужден» — <b>shaxsli</b> konstruksiya, shuning uchun ega bilan jins va songa moslashadi.</p><p><b>Model:</b> Я вынужден / вынуждена + infinitiv.</p><table class=\"b2g-t\"><tr><th>Shaxs</th><th>Shakl</th></tr><tr><td>я, ты (erkak)</td><td>вынужден</td></tr><tr><td>я, ты (ayol)</td><td>вынуждена</td></tr><tr><td>он</td><td>вынужден</td></tr><tr><td>она</td><td>вынуждена</td></tr><tr><td>мы, вы, они</td><td>вынуждены</td></tr></table><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я вынужден отказаться от этой работы.</td><td>Men bu ishdan voz kechishga majburman.</td></tr><tr><td>Мы вынуждены изменить условия договора.</td><td>Biz shartnoma shartlarini o‘zgartirishga majburmiz.</td></tr><tr><td>Она вынуждена обратиться за помощью.</td><td>U yordam so‘rashga majbur.</td></tr><tr><td>Я вынуждена уйти.</td><td>Men ketishga majburman.</td></tr></table><p><b>Zamonlar bo‘yicha shakllari:</b></p><table class=\"b2g-t\"><tr><th>Zamon</th><th>Namuna</th></tr><tr><td>Сейчас</td><td>Я вынужден изменить план. · Я вынуждена изменить план. · Мы вынуждены изменить план.</td></tr><tr><td>В прошлом</td><td>Я был вынужден изменить план. · Я была вынуждена изменить план. · Мы были вынуждены изменить план.</td></tr><tr><td>В будущем</td><td>Я буду вынужден изменить план. · Я буду вынуждена изменить план. · Мы будем вынуждены изменить план.</td></tr></table><p>Kelasi zamon uchun shaxssiz model ham juda tabiiy: <b>Мне придётся изменить план.</b></p><h4>4. Мне пришлось va Я вынужден — farqi</h4><p>Ikkalasi ham majburiyatni bildiradi, lekin biri <b>shaxssiz</b>, ikkinchisi <b>shaxsli</b> konstruksiya.</p><table class=\"b2g-t\"><tr><th>Konstruksiya</th><th>Ma’nosi</th></tr><tr><td>Мне пришлось…</td><td>shaxssiz: vaziyat harakatni zarur qilib qo‘ydi. Bu darsda o‘tgan zamondagi zaruratni bildiradi.</td></tr><tr><td>Я вынужден / вынуждена…</td><td>shaxsli: odamning boshqa real chorasi yo‘q.</td></tr><tr><td>Я был вынужден / была вынуждена…</td><td>xuddi shu shaxsli konstruksiya o‘tgan zamonda.</td></tr><tr><td>Мне придётся…</td><td>kelasi zamondagi zarurat, vaziyat sababli.</td></tr></table><table class=\"b2g-t\"><tr><th>Gap</th><th>Zamoni</th></tr><tr><td>Вчера мне пришлось работать допоздна.</td><td>o‘tgan zamon, shaxssiz</td></tr><tr><td>Вчера я был вынужден работать допоздна.</td><td>o‘tgan zamon, shaxsli</td></tr><tr><td>Сейчас я вынужден работать допоздна.</td><td>hozirgi zamon, shaxsli</td></tr><tr><td>Завтра мне придётся работать допоздна.</td><td>kelasi zamon, shaxssiz</td></tr></table><div class=\"b2g-tip\"><b>Diqqat:</b> «вынужден» faqat hozirgi zamon shakli emas. <b>Я был вынужден…</b> — bu mutlaqo normal rus tili. Farq zamonda emas, konstruksiyaning <b>shaxsli / shaxssiz</b> bo‘lishida.</div><h4>5. Мне удалось va Я смог — farqi</h4><p>Ikkalasi ham «qila oldim» ma’nosida, ammo urg‘u boshqacha.</p><table class=\"b2g-t\"><tr><th>Konstruksiya</th><th>Urg‘u</th></tr><tr><td>Я смог / смогла + infinitiv</td><td>imkoniyat yoki qobiliyatga urg‘u</td></tr><tr><td>Мне удалось + infinitiv</td><td>qiyinchilikka qaramay natijaga erishishga urg‘u</td></tr></table><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я смог закончить работу.</td><td>Men ishni tugata oldim.</td></tr><tr><td>Мне удалось закончить работу, хотя было очень мало времени.</td><td>Vaqt juda kam bo‘lishiga qaramay, ishni tugatishga muvaffaq bo‘ldim.</td></tr></table><p><b>«Смочь» ham ega bilan moslashadi:</b> Я смог (erkak) · Я смогла (ayol) · Мы смогли. Inkor shakli: Я не смог / не смогла.</p><h4>6. Sabab, qarama-qarshilik va shartni ko‘rsatish</h4><p>B2 darajada fikrni murakkablashtirish uchun sabab va shart konstruksiyalari ishlatiladi.</p><table class=\"b2g-t\"><tr><th>Konstruksiya</th><th>Namuna</th></tr><tr><td>из-за + Р.п.</td><td>Из-за пробок мне пришлось взять такси.</td></tr><tr><td>из-за того, что + gap</td><td>Мне пришлось отменить встречу из-за того, что я заболел.</td></tr><tr><td>несмотря на + В.п.</td><td>Несмотря на трудности, мне удалось закончить проект.</td></tr><tr><td>несмотря на то, что + gap</td><td>Несмотря на то, что времени было мало, нам удалось всё сделать.</td></tr><tr><td>если + gap</td><td>Если возникнут проблемы, нам придётся изменить план.</td></tr></table><p>Mashqlarda quyidagi bog‘lovchilar ham uchraydi:</p><table class=\"b2g-t\"><tr><th>Bog‘lovchi</th><th>Ma’nosi va namuna</th></tr><tr><td>потому что</td><td>chunki — Мне пришлось уйти, потому что я плохо себя чувствовал.</td></tr><tr><td>поскольку</td><td>chunki, sababli — Поскольку поезд отменили, мне пришлось изменить маршрут.</td></tr><tr><td>благодаря + Д.п.</td><td>tufayli (ijobiy sabab) — Благодаря поддержке друзей мне удалось решить проблему.</td></tr><tr><td>хотя</td><td>garchi — Хотя задача была сложной, мне удалось выполнить её.</td></tr></table><h4>7. Asosiy modellar</h4><p><b>Majburiyat:</b></p><div class=\"b2g-chips\"><span>Мне пришлось + инфинитив</span><span>Мне придётся + инфинитив</span><span>Я вынужден/вынуждена + инфинитив</span><span>Я был вынужден / была вынуждена + инфинитив</span></div><p><b>Imkoniyat va muvaffaqiyat:</b></p><div class=\"b2g-chips\"><span>Мне удалось + инфинитив</span><span>Мне не удалось + инфинитив</span><span>Мне удалось добиться + Р.п.</span></div><p><b>Qobiliyat:</b></p><div class=\"b2g-chips\"><span>Я смог / смогла + инфинитив</span><span>Я не смог / не смогла + инфинитив</span></div><p><b>«Добиться» + Р.п.:</b> добиться успеха · добиться результата.</p><p><b>B2 darajadagi namunalar:</b></p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Из-за непредвиденных обстоятельств мне пришлось изменить маршрут.</td><td>Kutilmagan holatlar sababli yo‘nalishni o‘zgartirishga to‘g‘ri keldi.</td></tr><tr><td>Несмотря на нехватку времени, нам удалось завершить проект.</td><td>Vaqt yetishmasligiga qaramay, loyihani yakunlashga muvaffaq bo‘ldik.</td></tr><tr><td>Из-за сложившейся ситуации я вынужден отказаться от поездки.</td><td>Yuzaga kelgan vaziyat sababli safardan voz kechishga majburman.</td></tr><tr><td>Если проблема не решится сегодня, нам придётся искать другой вариант.</td><td>Agar muammo bugun hal bo‘lmasa, boshqa variant izlashimizga to‘g‘ri keladi.</td></tr><tr><td>Хотя задача казалась почти невыполнимой, ему всё-таки удалось найти решение.</td><td>Vazifa deyarli bajarib bo‘lmaydigandek tuyulsa-da, u baribir yechim topa oldi.</td></tr></table><div class=\"b2g-check\"><h4>Qisqa xulosa</h4><ul class=\"b2g-list\"><li><b>Мне пришлось…</b> → vaziyat sabab majbur bo‘ldim — o‘tgan zamon, shaxssiz</li><li><b>Мне придётся…</b> → kelajakda majbur bo‘laman — kelasi zamon, shaxssiz</li><li><b>Я вынужден / вынуждена…</b> → boshqa real chora yo‘q — hozir, shaxsli</li><li><b>Я был вынужден / была вынуждена…</b> → xuddi shu shaxsli zarurat o‘tgan zamonda</li><li><b>Мне удалось…</b> → qiyinchilikka qaramay uddaladim</li><li><b>Мне не удалось…</b> → kutilgan natijaga erisha olmadim</li><li><b>Я смог / смогла…</b> → qila oldim, imkonim bo‘ldi</li></ul></div></div>";

    var LESSON_9_EXERCISES = [
        {
            id: "ex1",
            type: "input",
            icon: "fa-list-check",
            showTask: true,
            title: "1-mashq. To'g'ri konstruksiyani tanlang",
            intro: "Qavs ichidan vaziyatga mos variantni tanlab yozing. «Я» erkak ham, ayol ham bo'lishi mumkin.",
            namuna: "Из-за дождя ___ остаться дома. → Мне пришлось",
            items: [
                { q: "Из-за плохой погоды ___ отменить поездку. (мне пришлось / мне удалось)", answer: ["мне пришлось"] },
                { q: "Несмотря на трудности, ___ закончить проект вовремя. (мне удалось / мне пришлось)", answer: ["мне удалось"] },
                { q: "Из-за срочной работы ___ задержаться в офисе. (я вынужден / я вынуждена / мне удалось)", answer: ["я вынужден", "я вынуждена"] },
                { q: "Если ситуация не изменится, ___ искать другое решение. (мне придётся / мне удалось)", answer: ["мне придётся"] },
                { q: "Благодаря поддержке друзей ___ решить эту проблему. (мне удалось / мне пришлось)", answer: ["мне удалось"] },
                { q: "Из-за отсутствия билетов ___ ехать на автобусе. (нам пришлось / нам удалось)", answer: ["нам пришлось"] },
                { q: "Сейчас я ___ отказаться от этой идеи. (вынужден / вынуждена / удалось)", answer: ["вынужден", "вынуждена"] },
                { q: "После нескольких попыток ему ___ найти ошибку. (удалось / пришлось)", answer: ["удалось"] },
                { q: "Из-за поломки машины нам ___ вызвать такси. (пришлось / удалось)", answer: ["пришлось"] },
                { q: "Несмотря на сильный стресс, она ___ успешно пройти собеседование. (смогла / пришлось)", answer: ["смогла"] }
            ]
        },
        {
            id: "ex2",
            type: "input",
            icon: "fa-i-cursor",
            showTask: true,
            title: "2-mashq. Fe'lni to'g'ri shaklda qo'ying",
            intro: "Modal konstruksiyadan keyin fe'l infinitiv shaklida turadi. Qavs ichidagi fe'lni o'zgartirmasdan yozing.",
            namuna: "Мне пришлось ___ (изменить) план. → Мне пришлось изменить план.",
            items: [
                { q: "Мне удалось ___ (найти) нужную информацию.", answer: "найти" },
                { q: "Нам пришлось ___ (перенести) встречу.", answer: "перенести" },
                { q: "Я вынужден ___ (отказаться) от предложения.", answer: "отказаться" },
                { q: "Ей удалось ___ (решить) сложную задачу.", answer: "решить" },
                { q: "Нам придётся ___ (обсудить) этот вопрос ещё раз.", answer: "обсудить" },
                { q: "Он смог ___ (закончить) работу до вечера.", answer: "закончить" },
                { q: "Мне пришлось ___ (обратиться) за помощью.", answer: "обратиться" },
                { q: "Им удалось ___ (договориться) о сотрудничестве.", answer: "договориться" },
                { q: "Я вынуждена ___ (изменить) свои планы.", answer: "изменить" },
                { q: "Вам придётся ___ (принять) окончательное решение.", answer: "принять" }
            ]
        },
        {
            id: "ex3",
            type: "input",
            icon: "fa-scale-balanced",
            showTask: true,
            title: "3-mashq. Мне пришлось yoki Мне удалось?",
            intro: "Gap mazmuniga qarab kerakli konstruksiyani tanlang: majburiyatmi yoki muvaffaqiyatmi?",
            namuna: "Было очень поздно, поэтому ___ вызвать такси. → Мне пришлось",
            items: [
                { q: "После нескольких часов работы ___ найти решение.", answer: "мне удалось" },
                { q: "Из-за болезни ___ отменить встречу.", answer: "мне пришлось" },
                { q: "Несмотря на нехватку времени, ___ закончить презентацию.", answer: "мне удалось" },
                { q: "Из-за пробок ___ приехать на метро.", answer: "мне пришлось" },
                { q: "После долгих поисков ___ найти нужный документ.", answer: "мне удалось" },
                { q: "Из-за технической проблемы ___ перезапустить компьютер.", answer: "мне пришлось" },
                { q: "Хотя задача была сложной, ___ выполнить её самостоятельно.", answer: "мне удалось" },
                { q: "Из-за сильного дождя ___ остаться в гостинице.", answer: "мне пришлось" },
                { q: "После нескольких попыток ___ связаться с менеджером.", answer: "мне удалось" },
                { q: "Поскольку поезд отменили, ___ изменить маршрут.", answer: "мне пришлось" }
            ]
        },
        {
            id: "ex4",
            type: "input",
            icon: "fa-clock",
            showTask: true,
            title: "4-mashq. Мне пришлось / Мне придётся / вынужден(а/ы)",
            intro: "Vaqt, shaxs, son va jinsga qarab to'g'ri modal shaklni tanlang.",
            namuna: "Вчера я заболел, поэтому ___ остаться дома. → мне пришлось",
            items: [
                { q: "Завтра у меня экзамен, поэтому ___ готовиться всю ночь.", answer: ["мне придётся"] },
                { q: "Из-за сложной ситуации сейчас я ___ изменить своё решение.", answer: ["вынужден", "вынуждена"] },
                { q: "Вчера из-за аварии нам ___ ждать два часа.", answer: ["пришлось"] },
                { q: "Если ничего не изменится, нам ___ отказаться от поездки.", answer: ["придётся"] },
                { q: "Сейчас он ___ работать в другом городе.", answer: ["вынужден"] },
                { q: "В прошлом месяце мне ___ искать новую квартиру.", answer: ["пришлось"] },
                { q: "Если опоздаем на поезд, нам ___ покупать новые билеты.", answer: ["придётся"] },
                { q: "Из-за отсутствия денег сейчас она ___ отказаться от этой покупки.", answer: ["вынуждена"] },
                { q: "Вчера вам ___ самостоятельно решать эту проблему?", answer: ["пришлось"] },
                { q: "В сложившихся обстоятельствах сейчас мы ___ принять это решение.", answer: ["вынуждены"] }
            ]
        },
        {
            id: "ex5",
            type: "input",
            icon: "fa-pen-to-square",
            showTask: true,
            title: "5-mashq. Gapni davom ettiring",
            intro: "Berilgan konstruksiya yordamida mazmunli TO'LIQ gap tuzing. Bu ochiq mashq — javobni o'zingiz tanlaysiz.",
            namuna: "Мне пришлось… → Мне пришлось отменить встречу из-за плохого самочувствия.",
            items: [
                { free: true, q: "Мне пришлось…", answer: null, placeholder: "Gapni to'liq davom ettiring..." },
                { free: true, q: "Мне удалось…", answer: null, placeholder: "Gapni to'liq davom ettiring..." },
                { free: true, q: "Я вынужден…", answer: null, placeholder: "Gapni to'liq davom ettiring..." },
                { free: true, q: "Мне придётся…", answer: null, placeholder: "Gapni to'liq davom ettiring..." },
                { free: true, q: "Я смог…", answer: null, placeholder: "Gapni to'liq davom ettiring..." },
                { free: true, q: "Мне не удалось…", answer: null, placeholder: "Gapni to'liq davom ettiring..." },
                { free: true, q: "Несмотря на трудности, мне удалось…", answer: null, placeholder: "Gapni to'liq davom ettiring..." },
                { free: true, q: "Из-за непредвиденных обстоятельств мне пришлось…", answer: null, placeholder: "Gapni to'liq davom ettiring..." },
                { free: true, q: "Если ситуация не изменится, мне придётся…", answer: null, placeholder: "Gapni to'liq davom ettiring..." },
                { free: true, q: "Я был вынужден…", answer: null, placeholder: "Gapni to'liq davom ettiring..." }
            ]
        },
        {
            id: "ex6",
            type: "input",
            icon: "fa-diagram-project",
            showTask: true,
            title: "6-mashq. Sababni qo'shing",
            intro: "Gapni из-за, потому что yoki несмотря на то, что yordamida kengaytiring va TO'LIQ yozing. Bu ochiq mashq.",
            namuna: "Мне пришлось уйти. → Мне пришлось уйти, потому что я плохо себя чувствовал.",
            items: [
                { free: true, q: "Мне пришлось отменить поездку.", answer: null, placeholder: "из-за… / потому что… / несмотря на то, что…" },
                { free: true, q: "Нам удалось закончить проект.", answer: null, placeholder: "из-за… / потому что… / несмотря на то, что…" },
                { free: true, q: "Я был вынужден изменить планы.", answer: null, placeholder: "из-за… / потому что… / несмотря на то, что…" },
                { free: true, q: "Ей удалось получить эту работу.", answer: null, placeholder: "из-за… / потому что… / несмотря на то, что…" },
                { free: true, q: "Нам пришлось вызвать врача.", answer: null, placeholder: "из-за… / потому что… / несмотря на то, что…" },
                { free: true, q: "Мне удалось решить проблему.", answer: null, placeholder: "из-за… / потому что… / несмотря на то, что…" },
                { free: true, q: "Он был вынужден переехать.", answer: null, placeholder: "из-за… / потому что… / несмотря на то, что…" },
                { free: true, q: "Нам пришлось перенести встречу.", answer: null, placeholder: "из-за… / потому что… / несмотря на то, что…" },
                { free: true, q: "Ей удалось сдать экзамен.", answer: null, placeholder: "из-за… / потому что… / несмотря на то, что…" },
                { free: true, q: "Я не смог закончить работу.", answer: null, placeholder: "из-за… / потому что… / несмотря на то, что…" }
            ]
        },
        {
            id: "ex7",
            type: "input",
            icon: "fa-eraser",
            showTask: true,
            title: "7-mashq. Xatoni toping va tuzating",
            intro: "Har bir gapda grammatik xato bor. Birinchi modal ma'noni saqlang va ortiqcha yoki noto'g'ri elementni tuzatib, to'liq gap yozing.",
            namuna: "Мне удалось должен закончить работу. → Мне удалось закончить работу.",
            items: [
                { q: "Мне пришлось должен уйти раньше.", answer: ["Мне пришлось уйти раньше."] },
                { q: "Мне удалось смог решить эту проблему.", answer: ["Мне удалось решить эту проблему."] },
                { q: "Сейчас мне вынужден отказаться от этого предложения.", answer: ["Сейчас я вынужден отказаться от этого предложения."] },
                { q: "Нам пришлось удалось изменить маршрут.", answer: ["Нам пришлось изменить маршрут."] },
                { q: "Мне придётся смог сделать это завтра.", answer: ["Мне придётся сделать это завтра."] },
                { q: "Ей удалось была получить хорошую работу.", answer: ["Ей удалось получить хорошую работу."] },
                { q: "Я вынуждена пришлось отменить встречу.", answer: ["Я вынуждена отменить встречу."] },
                { q: "Нам удалось пришлось договориться.", answer: ["Нам удалось договориться."] },
                { q: "Мне пришлось удалось обратиться к специалисту.", answer: ["Мне пришлось обратиться к специалисту."] },
                { q: "Вчера он вынужден изменить решение.", answer: ["Вчера он был вынужден изменить решение.", "Вчера он вынужден был изменить решение."] }
            ]
        },
        {
            id: "ex8",
            type: "input",
            icon: "fa-comments",
            showTask: true,
            title: "8-mashq. Dialogni to'ldiring",
            intro: "Bo'sh joyga mos modal konstruksiyani yozing. Faqat bo'sh joyga tushadigan qismni yozing.",
            namuna: "— Почему ты не пришёл вчера? — Мне пришлось работать допоздна.",
            items: [
                { q: "— Почему ты отменил поездку?\n— ___ из-за болезни.", answer: "Мне пришлось отменить поездку" },
                { q: "— Ты решил эту проблему?\n— Да, ___ найти решение.", answer: "мне удалось" },
                { q: "— Почему вы меняете план?\n— Мы ___ изменить его из-за обстоятельств.", answer: "вынуждены" },
                { q: "— Ты сможешь прийти завтра?\n— Нет, мне ___ работать.", answer: "придётся" },
                { q: "— Как вы закончили проект так быстро?\n— Несмотря на трудности, нам ___ всё закончить.", answer: "удалось" },
                { q: "— Почему она ищет новую работу?\n— Она ___ уволиться.", answer: "вынуждена" },
                { q: "— Ты смог связаться с клиентом?\n— Да, мне ___ ему дозвониться.", answer: "удалось" },
                { q: "— Почему вы не поехали на машине?\n— Нам ___ ехать на метро.", answer: "пришлось" },
                { q: "— Что будете делать, если проблема повторится?\n— Нам ___ искать другое решение.", answer: "придётся" },
                { q: "— Ты смог выполнить всё самостоятельно?\n— Да, я ___ сделать всё сам.", answer: "смог" }
            ]
        },
        {
            id: "ex9",
            type: "input",
            icon: "fa-language",
            showTask: true,
            title: "9-mashq. O'zbekchadan rus tiliga tarjima qiling",
            intro: "Darsdagi modal konstruksiyalardan foydalaning. Jins ko'rsatilmagan joyda bir nechta to'g'ri variant bor.",
            namuna: "Men safarni bekor qilishga majbur bo‘ldim. → Мне пришлось отменить поездку.",
            items: [
                { q: "Men kecha uyda qolishga majbur bo‘ldim.", answer: ["Вчера мне пришлось остаться дома.", "Мне пришлось остаться дома вчера.", "Вчера я был вынужден остаться дома.", "Вчера я была вынуждена остаться дома."] },
                { q: "Men bu muammoni hal qilishga muvaffaq bo‘ldim.", answer: ["Мне удалось решить эту проблему."] },
                { q: "Men bu qarorni o‘zgartirishga majburman.", answer: ["Я вынужден изменить это решение.", "Я вынуждена изменить это решение."] },
                { q: "Ertaga biz ertaroq kelishga majbur bo‘lamiz.", answer: ["Завтра нам придётся прийти раньше."] },
                { q: "U qiyin vazifani bajarishga muvaffaq bo‘ldi.", answer: ["Ему удалось выполнить сложную задачу.", "Ей удалось выполнить сложную задачу."] },
                { q: "Biz safarni bekor qilishga majbur bo‘ldik.", answer: ["Нам пришлось отменить поездку.", "Мы были вынуждены отменить поездку."] },
                { q: "Men barcha hujjatlarni topishga muvaffaq bo‘ldim.", answer: ["Мне удалось найти все документы."] },
                { q: "U boshqa shaharga ko‘chishga majbur bo‘ldi.", answer: ["Ему пришлось переехать в другой город.", "Ей пришлось переехать в другой город.", "Он был вынужден переехать в другой город.", "Она была вынуждена переехать в другой город."] },
                { q: "Men bu ishni o‘zim bajara oldim.", answer: ["Я смог выполнить эту работу самостоятельно.", "Я смогла выполнить эту работу самостоятельно.", "Я смог выполнить эту работу сам.", "Я смогла выполнить эту работу сама."] },
                { q: "Vaqt kam bo‘lishiga qaramay, biz loyihani tugatishga muvaffaq bo‘ldik.", answer: ["Несмотря на то что времени было мало, нам удалось закончить проект."] }
            ]
        },
        {
            id: "ex10",
            type: "input",
            icon: "fa-rotate",
            showTask: true,
            title: "10-mashq. Ma'noni saqlagan holda gapni qayta tuzing",
            intro: "Gap ma'nosini o'zgartirmasdan, ko'rsatilgan konstruksiya yordamida qayta yozing.",
            namuna: "Я должен был уйти раньше. Используйте: пришлось → Мне пришлось уйти раньше.",
            items: [
                { q: "Из-за отмены рейса мы были вынуждены остаться ещё на одну ночь.\nИспользуйте: пришлось", answer: ["Из-за отмены рейса нам пришлось остаться ещё на одну ночь."] },
                { q: "Несмотря на трудности, мы смогли закончить проект вовремя.\nИспользуйте: удалось", answer: ["Несмотря на трудности, нам удалось закончить проект вовремя."] },
                { q: "Сейчас у меня нет другого выхода: я должен отказаться от предложения.\nИспользуйте: вынужден / вынуждена", answer: ["Сейчас я вынужден отказаться от предложения.", "Сейчас я вынуждена отказаться от предложения."] },
                { q: "Завтра мы должны будем изменить маршрут.\nИспользуйте: придётся", answer: ["Завтра нам придётся изменить маршрут."] },
                { q: "После нескольких попыток он смог дозвониться до клиента.\nИспользуйте: удалось", answer: ["После нескольких попыток ему удалось дозвониться до клиента."] },
                { q: "Несмотря на долгие поиски, я не смог найти документы.\nИспользуйте: не удалось", answer: ["Мне не удалось найти документы, несмотря на долгие поиски.", "Несмотря на долгие поиски, мне не удалось найти документы."] },
                { q: "Из-за срочного звонка она должна была уйти раньше.\nИспользуйте: пришлось", answer: ["Из-за срочного звонка ей пришлось уйти раньше."] },
                { q: "Сейчас у нас нет другого выбора: мы должны ждать.\nИспользуйте: вынуждены", answer: ["Сейчас мы вынуждены ждать."] },
                { q: "Несмотря на нехватку времени, я смог подготовить презентацию.\nИспользуйте: удалось", answer: ["Несмотря на нехватку времени, мне удалось подготовить презентацию."] },
                { q: "Если проблема повторится, мы будем обязаны искать другой вариант.\nИспользуйте: придётся", answer: ["Если проблема повторится, нам придётся искать другой вариант."] }
            ]
        }
    ];

    var LESSON_10_GRAMMAR = "<div class=\"b2g\"><div class=\"b2g-lead\"><div class=\"b2g-lead-title\">Безличные предложения</div><p>Bu gaplar fikr, hissiyot, zarurat, ruxsat va tajribani <b>neytral</b> va <b>tabiiy</b> tarzda ifodalash uchun ishlatiladi.</p></div><h4>1. Безличное предложение nima?</h4><p><b>Безличное предложение</b> — bu gapda <b>именительный падеж</b>dagi grammatik ega bo‘lmaydi. Ya’ni kesim hech qanday «кто? / что?» savoliga javob beradigan nominativ ega bilan grammatik jihatdan bog‘lanmaydi.</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Мне холодно.</td><td>Menga sovuq.</td></tr><tr><td>Мне кажется, что он прав.</td><td>Menimcha, u haq.</td></tr><tr><td>Мне удалось решить проблему.</td><td>Muammoni hal qilishga muvaffaq bo‘ldim.</td></tr><tr><td>Необходимо принять решение.</td><td>Qaror qabul qilish zarur.</td></tr><tr><td>Следует обратить внимание на детали.</td><td>Tafsilotlarga e’tibor berish kerak.</td></tr><tr><td>Нельзя игнорировать эту проблему.</td><td>Bu muammoni e’tiborsiz qoldirish mumkin emas.</td></tr></table><div class=\"b2g-tip\"><b>Diqqat:</b> masala faqat «кто?» savolida emas. Oddiy egalar <b>«что?»</b> savoliga ham javob beradi (<i>Решение принято.</i>). Безличное предложениеda esa <b>umuman</b> nominativ ega yo‘q.</div><h4>2. Мне кажется, что…</h4><p>Shaxsiy fikr, taassurot yoki taxminni bildiradi.</p><p><b>Konstruksiya:</b> Мне кажется, что + gap</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Мне кажется, что он слишком много работает.</td><td>Menimcha, u haddan tashqari ko‘p ishlaydi.</td></tr><tr><td>Мне кажется, что это решение было правильным.</td><td>Menimcha, bu qaror to‘g‘ri edi.</td></tr><tr><td>Мне кажется, что ситуация постепенно меняется.</td><td>Menimcha, vaziyat asta-sekin o‘zgaryapti.</td></tr><tr><td>Мне кажется, что нам необходимо пересмотреть этот план.</td><td>Menimcha, bu rejani qayta ko‘rib chiqishimiz zarur.</td></tr></table><p>B2 darajada muqobil variantlar:</p><div class=\"b2g-chips\"><span>Мне кажется, что…</span><span>Мне представляется, что…</span><span>Мне думается, что…</span><span>Мне не кажется, что…</span><span>Мне кажется маловероятным, что…</span></div><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Мне кажется маловероятным, что проблема решится сама собой.</td><td>Menimcha, muammo o‘z-o‘zidan hal bo‘lishi ehtimoldan uzoq.</td></tr></table><h4>3. Мне удалось…</h4><p>Qiyinchilikdan keyin biror ishni bajarishga muvaffaq bo‘lishni bildiradi.</p><p><b>Konstruksiya:</b> Мне удалось + infinitiv</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Мне удалось решить эту проблему.</td><td>Bu muammoni hal qilishga muvaffaq bo‘ldim.</td></tr><tr><td>Мне удалось найти нужную информацию.</td><td>Kerakli ma’lumotni topishga muvaffaq bo‘ldim.</td></tr><tr><td>Мне удалось убедить его изменить решение.</td><td>Uni qarorini o‘zgartirishga ko‘ndira oldim.</td></tr><tr><td>Мне удалось справиться с трудной ситуацией.</td><td>Qiyin vaziyatni uddalay oldim.</td></tr></table><table class=\"b2g-t\"><tr><th>Konstruksiya</th><th>Urg‘u</th></tr><tr><td>Я смог…</td><td>imkoniyat yoki qobiliyat — men qila oldim</td></tr><tr><td>Мне удалось…</td><td>natija — qiyinchilikka qaramay muvaffaq bo‘ldim</td></tr></table><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Я смог закончить проект вовремя.</td><td>Loyihani vaqtida tugata oldim.</td></tr><tr><td>Мне удалось закончить проект вовремя, несмотря на нехватку времени.</td><td>Vaqt yetishmasligiga qaramay, loyihani vaqtida tugatishga muvaffaq bo‘ldim.</td></tr></table><p>B2 darajada <b>несмотря на…</b>, <b>благодаря…</b>, <b>после того как…</b> konstruksiyalari bilan birga ishlatiladi.</p><h4>4. Необходимо…</h4><p><b>Необходимо</b> — zarur, shart. Rasmiyroq va neytral uslubga ega.</p><p><b>1-model:</b> Необходимо + infinitiv</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Необходимо принять решение.</td><td>Qaror qabul qilish zarur.</td></tr><tr><td>Необходимо проверить документы.</td><td>Hujjatlarni tekshirish zarur.</td></tr><tr><td>Необходимо учитывать мнение других людей.</td><td>Boshqalarning fikrini hisobga olish zarur.</td></tr></table><p><b>2-model:</b> Необходимо, чтобы + ega + fe’lning <b>-л</b> shakli</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Необходимо, чтобы каждый участник подготовил отчёт.</td><td>Har bir ishtirokchi hisobot tayyorlashi zarur.</td></tr><tr><td>Необходимо, чтобы решение было принято как можно скорее.</td><td>Qaror imkon qadar tezroq qabul qilinishi zarur.</td></tr></table><div class=\"b2g-warn\"><b>Muhim:</b> «чтобы» dan keyingi shakl <b>o‘tgan zamon shakliga o‘xshaydi</b>, lekin u <b>o‘tgan zamonni bildirmaydi</b>. U talab qilinayotgan yoki istalayotgan harakatni ifodalaydi: <i>Необходимо, чтобы он пришёл завтра.</i> — bu kelajak haqida.</div><p><b>3-model:</b> Необходимо + ot</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Необходимо дополнительное оборудование.</td><td>Qo‘shimcha jihoz kerak.</td></tr><tr><td>Необходимо время для анализа ситуации.</td><td>Vaziyatni tahlil qilish uchun vaqt kerak.</td></tr></table><div class=\"b2g-tip\">Rasmiy nutqda <b>«необходимо + существительное»</b> ham uchraydi. Lekin bunday gaplarda otning grammatik tahlili «необходимо + infinitiv» modelidan farq qilishi mumkin. Shuning uchun bu darsda безличное предложение uchun asosiy model sifatida <b>«Необходимо + infinitiv»</b> va <b>«Необходимо, чтобы…»</b> ishlatamiz.</div><h4>5. Следует…</h4><p><b>Следует</b> — kerak, lozim, ma’qul. Ko‘pincha maslahat yoki tavsiyani ifodalaydi.</p><p><b>Konstruksiya:</b> Следует + infinitiv</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Следует обратить внимание на эту проблему.</td><td>Bu muammoga e’tibor berish kerak.</td></tr><tr><td>Следует заранее подготовиться к экзамену.</td><td>Imtihonga oldindan tayyorlanish kerak.</td></tr><tr><td>Следует учитывать возможные последствия.</td><td>Bo‘lishi mumkin oqibatlarni hisobga olish kerak.</td></tr><tr><td>Следует тщательно проверить информацию.</td><td>Ma’lumotni sinchiklab tekshirish kerak.</td></tr></table><p><b>B2 varianti:</b> Следует + infinitiv + чтобы…</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Следует заранее обсудить этот вопрос, чтобы избежать недоразумений.</td><td>Tushunmovchiliklardan qochish uchun bu masalani oldindan muhokama qilish kerak.</td></tr></table><h4>6. Hissiyot va holatni ifodalash</h4><p>Bu turdagi gaplarda shaxs <b>дательный падеж</b>da keladi, keyin holat yoki hissiyot.</p><p><b>Model:</b> Кому? + predikativ</p><div class=\"b2g-chips\"><span>мне</span><span>тебе</span><span>ему</span><span>ей</span><span>нам</span><span>вам</span><span>им</span></div><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Мне грустно.</td><td>Men g‘amginman.</td></tr><tr><td>Ему неловко.</td><td>U xijolatda.</td></tr><tr><td>Ей тревожно.</td><td>U xavotirda.</td></tr><tr><td>Нам интересно.</td><td>Bizga qiziq.</td></tr><tr><td>Им весело.</td><td>Ular quvnoq.</td></tr><tr><td>Тебе неприятно.</td><td>Senga yoqimsiz.</td></tr></table><p>B2 darajada o‘tgan zamon va holat o‘zgarishi bilan:</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Мне было трудно принять это решение.</td><td>Bu qarorni qabul qilish men uchun qiyin edi.</td></tr><tr><td>Ему стало неловко после этого разговора.</td><td>Bu suhbatdan keyin u xijolat bo‘lib qoldi.</td></tr><tr><td>Нам было приятно узнать эту новость.</td><td>Bu yangilikni bilish bizga yoqimli edi.</td></tr><tr><td>Ей оказалось сложно объяснить свою позицию.</td><td>O‘z pozitsiyasini tushuntirish u uchun murakkab bo‘lib chiqdi.</td></tr></table><h4>7. Мне пришлось…</h4><p>Majburiyat yoki noqulay vaziyat sababli biror ishni qilishga to‘g‘ri kelganini bildiradi.</p><p><b>Konstruksiya:</b> Мне пришлось + infinitiv</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Мне пришлось изменить планы.</td><td>Rejalarimni o‘zgartirishga to‘g‘ri keldi.</td></tr><tr><td>Мне пришлось отказаться от поездки.</td><td>Safardan voz kechishga to‘g‘ri keldi.</td></tr><tr><td>Мне пришлось принять непростое решение.</td><td>Oson bo‘lmagan qaror qabul qilishga to‘g‘ri keldi.</td></tr></table><table class=\"b2g-t\"><tr><th>Zamon</th><th>Shakl va namuna</th></tr><tr><td>Hozirgi zamon</td><td>приходится — Мне приходится много работать.</td></tr><tr><td>O‘tgan zamon</td><td>пришлось — Мне пришлось много работать.</td></tr><tr><td>Kelasi zamon</td><td>придётся — Мне придётся изменить планы.</td></tr></table><h4>8. Мне не удалось…</h4><p>Biror ishni bajarishga muvaffaq bo‘lmaganlikni bildiradi.</p><p><b>Konstruksiya:</b> Мне не удалось + infinitiv</p><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Мне не удалось закончить работу вовремя.</td><td>Ishni vaqtida tugatishga muvaffaq bo‘lmadim.</td></tr><tr><td>Мне не удалось убедить его.</td><td>Uni ko‘ndira olmadim.</td></tr><tr><td>Мне не удалось найти подходящее решение.</td><td>Mos yechim topa olmadim.</td></tr></table><table class=\"b2g-t\"><tr><th>Tasdiq</th><th>Inkor</th></tr><tr><td>Мне удалось решить проблему.</td><td>Мне не удалось решить проблему.</td></tr></table><h4>9. Безличное слово + infinitiv</h4><p>B2 darajada eng ko‘p ishlatiladigan model.</p><div class=\"b2g-chips\"><span>Нужно подумать.</span><span>Необходимо действовать.</span><span>Следует учитывать.</span><span>Можно попробовать.</span><span>Нельзя забывать.</span><span>Важно понимать.</span><span>Невозможно предсказать.</span></div><table class=\"b2g-t\"><tr><th>Rus tilida</th><th>Tarjima</th></tr><tr><td>Важно понимать последствия своего решения.</td><td>O‘z qarorining oqibatlarini tushunish muhim.</td></tr><tr><td>Невозможно заранее предсказать результат.</td><td>Natijani oldindan aytishning iloji yo‘q.</td></tr><tr><td>Нельзя недооценивать значение опыта.</td><td>Tajribaning ahamiyatini kam baholash mumkin emas.</td></tr></table><h4>10. Личное va безличное предложение farqi</h4><table class=\"b2g-t\"><tr><th>Личное (ega bor)</th><th>Безличное (ega yo‘q)</th></tr><tr><td>Я должен принять решение.</td><td>Мне необходимо принять решение.</td></tr><tr><td>Я смог решить проблему.</td><td>Мне удалось решить проблему.</td></tr><tr><td>Я должен был изменить планы.</td><td>Мне пришлось изменить планы.</td></tr><tr><td>Я думаю, что это важно.</td><td>Мне кажется, что это важно.</td></tr></table><p>Birinchi ustunda <b>я</b> — именительный падежdagi ega. Ikkinchi ustunda <b>мне</b> ega emas: u <b>дательный падеж</b>da turadi va <b>кому?</b> savoliga javob beradi.</p><h4>11. B2 uchun asosiy konstruksiyalar</h4><table class=\"b2g-t\"><tr><th>Konstruksiya</th><th>Ma’nosi</th></tr><tr><td>Мне кажется, что…</td><td>Menimcha…</td></tr><tr><td>Мне удалось + infinitiv</td><td>… qilishga muvaffaq bo‘ldim</td></tr><tr><td>Мне не удалось + infinitiv</td><td>… qilishga muvaffaq bo‘lmadim</td></tr><tr><td>Мне пришлось + infinitiv</td><td>… qilishimga to‘g‘ri keldi</td></tr><tr><td>Мне приходится + infinitiv</td><td>… qilishimga to‘g‘ri keladi (odatda)</td></tr><tr><td>Мне придётся + infinitiv</td><td>… qilishimga to‘g‘ri keladi (kelajakda)</td></tr><tr><td>Необходимо + infinitiv</td><td>… qilish zarur</td></tr><tr><td>Необходимо, чтобы…</td><td>… bo‘lishi zarur</td></tr><tr><td>Следует + infinitiv</td><td>… qilish kerak / lozim</td></tr><tr><td>Важно + infinitiv</td><td>… qilish muhim</td></tr><tr><td>Невозможно + infinitiv</td><td>… qilishning iloji yo‘q</td></tr><tr><td>Можно + infinitiv</td><td>… qilish mumkin</td></tr><tr><td>Нельзя + infinitiv</td><td>… qilish mumkin emas</td></tr></table><h4>12. Muloqotda qo‘llash</h4><table class=\"b2g-t\"><tr><th>Maqsad</th><th>Namuna</th></tr><tr><td>His-tuyg‘u</td><td>Мне было неприятно это слышать, но я постарался спокойно отреагировать.</td></tr><tr><td>Qaror</td><td>Мне пришлось принять непростое решение.</td></tr><tr><td>Tajriba</td><td>Мне удалось справиться с этой ситуацией благодаря поддержке друзей.</td></tr><tr><td>Fikr</td><td>Мне кажется, что иногда человеку необходимо выйти из зоны комфорта.</td></tr><tr><td>Maslahat</td><td>Следует внимательно подумать о последствиях, прежде чем принимать решение.</td></tr><tr><td>Zarurat</td><td>Необходимо учитывать не только свои интересы, но и мнение окружающих.</td></tr></table><div class=\"b2g-check\"><h4>B2 uchun asosiy qoida</h4><p>Безличные предложения nutqni yanada <b>neytral</b>, <b>tabiiy</b>, <b>rasmiy</b> va <b>mantiqiy</b> qiladi. Ular ayniqsa quyidagilarda faol ishlatiladi:</p><ul class=\"b2g-list\"><li>fikr bildirish</li><li>hissiyotlarni tasvirlash</li><li>qarorlar haqida gapirish</li><li>shaxsiy tajribani bayon qilish</li><li>maslahat va tavsiya berish</li><li>zaruratni ifodalash</li></ul><p>Asosiy vositalar: <b>мне кажется · мне удалось · мне пришлось · необходимо · следует · важно · невозможно · можно · нельзя</b>.</p></div></div>";

    var LESSON_10_EXERCISES = [
        {
            id: "ex1",
            type: "input",
            icon: "fa-comment-dots",
            showTask: true,
            title: "1-mashq. «Мне кажется…»",
            intro: "«Я думаю, что…» gapini «Мне кажется, что…» konstruksiyasi bilan qayta yozing. Gap mazmunini o'zgartirmang.",
            namuna: "Я думаю, что он устал. → Мне кажется, что он устал.",
            items: [
                { q: "Я думаю, что она ошибается.", answer: ["Мне кажется, что она ошибается."] },
                { q: "Я думаю, что этот фильм очень интересный.", answer: ["Мне кажется, что этот фильм очень интересный."] },
                { q: "Я думаю, что они уже приехали.", answer: ["Мне кажется, что они уже приехали."] },
                { q: "Я думаю, что решение было правильным.", answer: ["Мне кажется, что решение было правильным."] },
                { q: "Я думаю, что он не знает об этом.", answer: ["Мне кажется, что он не знает об этом."] },
                { q: "Я думаю, что погода скоро изменится.", answer: ["Мне кажется, что погода скоро изменится."] },
                { q: "Я думаю, что нам нужно подождать.", answer: ["Мне кажется, что нам нужно подождать."] },
                { q: "Я думаю, что она хорошо подготовилась.", answer: ["Мне кажется, что она хорошо подготовилась."] },
                { q: "Я думаю, что этот вариант лучше.", answer: ["Мне кажется, что этот вариант лучше."] },
                { q: "Я думаю, что они неправильно поняли ситуацию.", answer: ["Мне кажется, что они неправильно поняли ситуацию."] }
            ]
        },
        {
            id: "ex2",
            type: "input",
            icon: "fa-i-cursor",
            showTask: true,
            title: "2-mashq. «Мне удалось…»",
            intro: "«Удалось» dan keyin fe'l infinitivda turadi. Qavs ichidagi fe'lni o'zgartirmasdan yozing.",
            namuna: "Мне удалось ___ проблему. (решить) → Мне удалось решить проблему.",
            items: [
                { q: "Мне удалось ___ нужную информацию. (найти)", answer: "найти" },
                { q: "Ей удалось ___ экзамен. (сдать)", answer: "сдать" },
                { q: "Нам удалось ___ все документы. (подготовить)", answer: "подготовить" },
                { q: "Ему удалось ___ работу вовремя. (закончить)", answer: "закончить" },
                { q: "Им удалось ___ хорошее решение. (принять)", answer: "принять" },
                { q: "Мне удалось ___ с преподавателем. (поговорить)", answer: "поговорить" },
                { q: "Вам удалось ___ эту проблему? (решить)", answer: "решить" },
                { q: "Ей удалось ___ ошибку. (исправить)", answer: "исправить" },
                { q: "Нам удалось ___ билеты. (купить)", answer: "купить" },
                { q: "Ему удалось ___ сложную ситуацию. (избежать)", answer: "избежать" }
            ]
        },
        {
            id: "ex3",
            type: "input",
            icon: "fa-circle-xmark",
            showTask: true,
            title: "3-mashq. «Мне не удалось…»",
            intro: "Gapni «не удалось + infinitiv» konstruksiyasi bilan qayta yozing. Shaxsni дательный падежda saqlang.",
            namuna: "Я не закончил проект. → Мне не удалось закончить проект.",
            items: [
                { q: "Я не нашёл нужную книгу.", answer: ["Мне не удалось найти нужную книгу."] },
                { q: "Она не приехала вовремя.", answer: ["Ей не удалось приехать вовремя."] },
                { q: "Мы не договорились с партнёрами.", answer: ["Нам не удалось договориться с партнёрами."] },
                { q: "Он не сдал экзамен.", answer: ["Ему не удалось сдать экзамен."] },
                { q: "Я не смог найти решение.", answer: ["Мне не удалось найти решение."] },
                { q: "Они не купили билеты.", answer: ["Им не удалось купить билеты."] },
                { q: "Она не закончила работу.", answer: ["Ей не удалось закончить работу."] },
                { q: "Мы не успели обсудить вопрос.", answer: ["Нам не удалось обсудить вопрос."] },
                { q: "Он не исправил ошибку.", answer: ["Ему не удалось исправить ошибку."] },
                { q: "Я не смог связаться с преподавателем.", answer: ["Мне не удалось связаться с преподавателем."] }
            ]
        },
        {
            id: "ex4",
            type: "input",
            icon: "fa-exclamation",
            showTask: true,
            title: "4-mashq. «Необходимо…»",
            intro: "Gapni «необходимо + infinitiv» yordamida qayta tuzing va to'liq yozing.",
            namuna: "Нужно проверить документы. → Необходимо проверить документы.",
            items: [
                { q: "Нужно подготовить отчёт.", answer: ["Необходимо подготовить отчёт."] },
                { q: "Нужно обсудить этот вопрос.", answer: ["Необходимо обсудить этот вопрос."] },
                { q: "Нужно изменить план.", answer: ["Необходимо изменить план."] },
                { q: "Нужно проверить информацию.", answer: ["Необходимо проверить информацию."] },
                { q: "Нужно принять решение.", answer: ["Необходимо принять решение."] },
                { q: "Нужно соблюдать правила.", answer: ["Необходимо соблюдать правила."] },
                { q: "Нужно заранее подготовиться.", answer: ["Необходимо заранее подготовиться."] },
                { q: "Нужно учитывать мнение специалистов.", answer: ["Необходимо учитывать мнение специалистов."] },
                { q: "Нужно решить эту проблему как можно скорее.", answer: ["Необходимо решить эту проблему как можно скорее."] },
                { q: "Нужно предоставить дополнительные документы.", answer: ["Необходимо предоставить дополнительные документы."] }
            ]
        },
        {
            id: "ex5",
            type: "input",
            icon: "fa-thumbs-up",
            showTask: true,
            title: "5-mashq. «Следует…»",
            intro: "Gapni «следует» yoki «не следует» yordamida qayta tuzing va to'liq yozing.",
            namuna: "Нужно больше отдыхать. → Следует больше отдыхать.",
            items: [
                { q: "Нужно обратить внимание на эту проблему.", answer: ["Следует обратить внимание на эту проблему."] },
                { q: "Не нужно торопиться с решением.", answer: ["Не следует торопиться с решением."] },
                { q: "Нужно заранее подготовиться к экзамену.", answer: ["Следует заранее подготовиться к экзамену."] },
                { q: "Не нужно игнорировать мнение других людей.", answer: ["Не следует игнорировать мнение других людей."] },
                { q: "Нужно проверить все данные.", answer: ["Следует проверить все данные."] },
                { q: "Нужно учитывать возможные последствия.", answer: ["Следует учитывать возможные последствия."] },
                { q: "Не нужно делать поспешные выводы.", answer: ["Не следует делать поспешные выводы."] },
                { q: "Нужно внимательно изучить документы.", answer: ["Следует внимательно изучить документы."] },
                { q: "Не нужно забывать о своих обязанностях.", answer: ["Не следует забывать о своих обязанностях."] },
                { q: "Нужно обсудить этот вопрос с руководителем.", answer: ["Следует обсудить этот вопрос с руководителем."] }
            ]
        },
        {
            id: "ex6",
            type: "input",
            icon: "fa-scale-balanced",
            showTask: true,
            title: "6-mashq. «Нужно / надо / необходимо / следует»",
            intro: "Vaziyat va uslubga qarab eng mos variantni tanlang. Qavsdagi izoh registrni ko'rsatadi. Faqat bitta so'z yozing.",
            namuna: "(Tavsiya) Вам ___ обратиться к специалисту. → следует",
            items: [
                { q: "(Oddiy shaxsiy zarurat) Мне ___ закончить эту работу сегодня.", answer: "нужно" },
                { q: "(Rasmiy talab) Вам ___ предоставить паспорт.", answer: "необходимо" },
                { q: "(Ish yuzasidan tavsiya) Нам ___ обсудить результаты встречи.", answer: "следует" },
                { q: "(Og‘zaki, oddiy maslahat) Тебе ___ немного отдохнуть.", answer: "надо" },
                { q: "(Rasmiy o‘quv talabi) Студентам ___ подготовиться к экзамену.", answer: "необходимо" },
                { q: "(Umumiy tavsiya) В такой ситуации ___ сохранять спокойствие.", answer: "следует" },
                { q: "(Amaliy zarurat) Нам ___ учитывать мнение клиентов.", answer: "нужно" },
                { q: "(Og‘zaki maslahat) Тебе ___ поговорить с ним.", answer: "надо" },
                { q: "(Rasmiy tanlov sharti) Для участия в конкурсе ___ заполнить анкету.", answer: "необходимо" },
                { q: "(Tavsiya) Вам ___ внимательно прочитать инструкцию.", answer: "следует" }
            ]
        },
        {
            id: "ex7",
            type: "input",
            icon: "fa-ban",
            showTask: true,
            title: "7-mashq. «Можно / нельзя»",
            intro: "Gapni «можно» yoki «нельзя» yordamida qayta tuzing va to'liq yozing.",
            namuna: "Здесь разрешено фотографировать. → Здесь можно фотографировать.",
            items: [
                { q: "Здесь разрешено пользоваться телефоном.", answer: ["Здесь можно пользоваться телефоном."] },
                { q: "В этой комнате запрещено курить.", answer: ["В этой комнате нельзя курить."] },
                { q: "Здесь разрешено оставлять вещи.", answer: ["Здесь можно оставлять вещи."] },
                { q: "В библиотеке запрещено громко разговаривать.", answer: ["В библиотеке нельзя громко разговаривать."] },
                { q: "В этом месте разрешено парковаться.", answer: ["В этом месте можно парковаться."] },
                { q: "Во время экзамена запрещено пользоваться телефоном.", answer: ["Во время экзамена нельзя пользоваться телефоном."] },
                { q: "Здесь разрешено задавать вопросы.", answer: ["Здесь можно задавать вопросы."] },
                { q: "В этом здании запрещено входить без разрешения.", answer: ["В этом здании нельзя входить без разрешения."] },
                { q: "В этом музее разрешено фотографировать.", answer: ["В этом музее можно фотографировать."] },
                { q: "Во время урока запрещено разговаривать.", answer: ["Во время урока нельзя разговаривать."] }
            ]
        },
        {
            id: "ex8",
            type: "input",
            icon: "fa-person-walking",
            showTask: true,
            title: "8-mashq. Безличный глагол",
            intro: "Qavs ichidagi fe'lni shaxssiz shaklda qo'ying. Faqat fe'l shaklini yozing.",
            namuna: "Мне не ___ сегодня. (спаться) → спится",
            items: [
                { q: "Мне совсем не ___ после такого разговора. (работаться)", answer: "работается" },
                { q: "Ему сегодня не ___. (спаться)", answer: "спится" },
                { q: "Нам не ___ дома в такую погоду. (сидеться)", answer: "сидится" },
                { q: "Мне хорошо ___ в этом городе. (житься)", answer: "живётся" },
                { q: "Ей не ___ о прошлом. (думаться)", answer: "думается" },
                { q: "После отпуска мне легко ___. (работаться)", answer: "работается" },
                { q: "Ему совсем не ___. (вериться)", answer: "верится" },
                { q: "Нам сегодня хорошо ___. (отдыхаться)", answer: "отдыхается" },
                { q: "Мне почему-то не ___. (учиться)", answer: "учится" },
                { q: "На свежем воздухе мне легко ___. (дышаться)", answer: "дышится" }
            ]
        },
        {
            id: "ex9",
            type: "input",
            icon: "fa-eraser",
            showTask: true,
            title: "9-mashq. Xatoni toping va tuzating",
            intro: "Har bir gapda безличная konstruksiya bilan bog'liq haqiqiy grammatik xato bor. Agar gapda shaxs ko'rsatilgan bo'lsa, uni saqlab qoling. To'liq tuzatilgan gapni yozing.",
            namuna: "Я не спится. → Мне не спится.",
            items: [
                { q: "Я кажется, что он прав.", answer: ["Мне кажется, что он прав."] },
                { q: "Я удалось решить проблему.", answer: ["Мне удалось решить проблему."] },
                { q: "Я необходимо подготовиться к экзамену.", answer: ["Мне необходимо подготовиться к экзамену."] },
                { q: "Мне кажется он ошибается.", answer: ["Мне кажется, что он ошибается."] },
                { q: "Я не удалось закончить работу.", answer: ["Мне не удалось закончить работу."] },
                { q: "Мне следует обратился к врачу.", answer: ["Мне следует обратиться к врачу."] },
                { q: "Я нельзя здесь парковаться.", answer: ["Мне нельзя здесь парковаться."] },
                { q: "Я нужно больше заниматься.", answer: ["Мне нужно больше заниматься."] },
                { q: "Мне удалось нашёл решение.", answer: ["Мне удалось найти решение."] },
                { q: "Я не работается сегодня.", answer: ["Мне не работается сегодня."] }
            ]
        },
        {
            id: "ex10",
            type: "input",
            icon: "fa-lightbulb",
            showTask: true,
            title: "10-mashq. Vaziyatga mos gap tuzing",
            intro: "Berilgan vaziyat bo'yicha gap tuzing. Qavsda ko'rsatilgan konstruksiyani ishlating va to'liq gap yozing.",
            namuna: "Siz muammoni hal qila oldingiz. Используйте: мне удалось → Мне удалось решить проблему.",
            items: [
                { q: "Siz kerakli ma’lumotni topa oldingiz.\nИспользуйте: мне удалось", answer: ["Мне удалось найти нужную информацию."] },
                { q: "Siz ishni vaqtida tugata olmadingiz.\nИспользуйте: мне не удалось", answer: ["Мне не удалось закончить работу вовремя."] },
                { q: "Sizningcha, u haqiqatni aytmayapti.\nИспользуйте: мне кажется, что", answer: ["Мне кажется, что он не говорит правду."] },
                { q: "Hujjatlarni tekshirish kerak.\nИспользуйте: необходимо", answer: ["Необходимо проверить документы."] },
                { q: "Bu masalaga e’tibor berish lozim.\nИспользуйте: следует", answer: ["Следует обратить внимание на этот вопрос.", "Следует обратить внимание на эту проблему."] },
                { q: "Bu yerda telefon ishlatish mumkin emas.\nИспользуйте: нельзя", answer: ["Здесь нельзя пользоваться телефоном."] },
                { q: "Sizga bugun ishlash qiyin.\nИспользуйте: мне трудно", answer: ["Мне трудно работать сегодня.", "Сегодня мне трудно работать."] },
                { q: "Sizningcha, bu qaror to‘g‘ri.\nИспользуйте: мне кажется, что", answer: ["Мне кажется, что это решение правильное."] },
                { q: "Sizga imtihonga yaxshiroq tayyorlanish kerak.\nИспользуйте: следует", answer: ["Мне следует лучше подготовиться к экзамену."] },
                { q: "Siz bu vaziyatdan chiqish yo‘lini topa oldingiz.\nИспользуйте: мне удалось", answer: ["Мне удалось найти выход из этой ситуации."] }
            ]
        },
        {
            id: "audio1",
            type: "choice",
            style: "tf",
            icon: "fa-headphones",
            showTask: true,
            title: "Audio bo'yicha «Rost yoki yolg'on» mashqi",
            intro: "«Неожиданное решение» audiosini tinglang va gaplar «Правда» yoki «Ложь» ekanini aniqlang.",
            audioSrc: "audios/%D0%912%2010%20%D1%83%D1%80%D0%BE%D0%BA.mp3",
            items: [
                { q: "Muallif so‘nggi paytlarda ishga juda ko‘p vaqt ajratayotganini his qiladi.", options: ["Правда", "Ложь"], answer: "Правда" },
                { q: "Muallif avvalgidek ish, o‘qish va shaxsiy hayotini bemalol birlashtira olgan.", options: ["Правда", "Ложь"], answer: "Ложь" },
                { q: "Bir kuni kechqurun muallif uxlay olmagan va hayoti haqida o‘ylagan.", options: ["Правда", "Ложь"], answer: "Правда" },
                { q: "Muallif hech narsani o‘zgartirish kerak emas, deb qaror qilgan.", options: ["Правда", "Ложь"], answer: "Ложь" },
                { q: "Muallif rahbari bilan o‘z ish jadvali haqida gaplashgan.", options: ["Правда", "Ложь"], answer: "Правда" },
                { q: "Rahbari uning iltimosiga salbiy munosabat bildirgan.", options: ["Правда", "Ложь"], answer: "Ложь" },
                { q: "Endi muallif har kuni kechgacha ishlashga majbur emas.", options: ["Правда", "Ложь"], answer: "Правда" },
                { q: "Muallif yangi ish tartibiga darhol ko‘nikib ketgan.", options: ["Правда", "Ложь"], answer: "Ложь" },
                { q: "Muallif vaqtini to‘g‘ri taqsimlash va dam olishga vaqt ajratish kerakligini tushungan.", options: ["Правда", "Ложь"], answer: "Правда" },
                { q: "Muallif hayotda oldinga siljish uchun doimo ko‘proq ishlash kerak, degan xulosaga kelgan.", options: ["Правда", "Ложь"], answer: "Ложь" }
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
            },
            {
                id: 6,
                title: 'Сравнительные конструкции',
                description: "Grammatika: Taqqoslash konstruksiyalari — «чем…, тем…», «такой же…, как», «гораздо более»",
                isLocked: false,
                isSubscriptionLocked: false,
                grammar: LESSON_6_GRAMMAR,
                exercises: LESSON_6_EXERCISES
            },
            {
                id: 7,
                title: 'Вид глагола',
                description: "Grammatika: Fe'l vidi — СВ / НСВ, jarayon va natijani farqlash",
                isLocked: false,
                isSubscriptionLocked: false,
                grammar: LESSON_7_GRAMMAR,
                exercises: LESSON_7_EXERCISES
            },
            {
                id: 8,
                title: 'Глаголы движения с приставками',
                description: "Grammatika: Harakat fe'llari va приставкalar — yo'nalish, manzil va natija",
                isLocked: false,
                isSubscriptionLocked: false,
                grammar: LESSON_8_GRAMMAR,
                exercises: LESSON_8_EXERCISES
            },
            {
                id: 9,
                title: 'Модальные конструкции',
                description: "Grammatika: Modal konstruksiyalar — majburiyat, zarurat va natijaga erishish",
                isLocked: false,
                isSubscriptionLocked: false,
                grammar: LESSON_9_GRAMMAR,
                exercises: LESSON_9_EXERCISES
            },
            {
                id: 10,
                title: 'Безличные предложения',
                description: "Grammatika: Shaxssiz gaplar — fikr, hissiyot, zarurat va ruxsat",
                isLocked: false,
                isSubscriptionLocked: false,
                grammar: LESSON_10_GRAMMAR,
                exercises: LESSON_10_EXERCISES
            }
        ]
    };
})(typeof window !== 'undefined' ? window : this);
