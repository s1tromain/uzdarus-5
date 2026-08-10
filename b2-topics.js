/* ============================================================================
 * b2-topics.js — the B2 syllabus: 16 topics, one source of truth.
 *
 * Both b2-course.html and b2-demo.html build courseData.topics from this list,
 * so the paid course and the demo can never drift apart. Nothing here renders
 * anything; the pages own their own markup.
 *
 * Each entry carries the three descriptors the topic card shows:
 *   grammatika   — the grammar the topic teaches
 *   konstruksiya — the constructions the learner will actually produce
 *   muloqot      — the communicative situations the topic prepares for
 *
 * Lesson content (grammar text, exercises, vocabulary) does NOT live here.
 * Topic 1's lesson lives in b2-lesson-data.js; topics 2-16 carry syllabus
 * metadata only until their lessons are authored.
 * ==========================================================================*/
(function (global) {
    'use strict';

    var TOPICS = [
        {
            id: 1,
            title: 'Сложноподчинённые предложения',
            grammatika: 'Ergash gapli qo‘shma gaplar: что, чтобы, если, когда, потому что, хотя',
            konstruksiya: '«Я считаю, что...», «Если..., то...», «Несмотря на то, что...»',
            muloqot: 'Shaxsiy qarashlar, hayotiy pozitsiya, fikrni asoslash'
        },
        {
            id: 2,
            title: 'Причастие',
            grammatika: 'Sifatdosh: hozirgi va o‘tgan zamon, aniq va majhul nisbat',
            konstruksiya: '«читающий», «прочитанный», «-ущий/-ющий», «-нный/-тый»',
            muloqot: 'Tavsiflash, matnni siqish, rasmiy va ilmiy uslub'
        },
        {
            id: 3,
            title: 'Деепричастие',
            grammatika: 'Ravishdosh: tugallanmagan va tugallangan ko‘rinishlar',
            konstruksiya: '«делая», «сделав», «-я/-в/-вши»',
            muloqot: 'Bir vaqtda sodir bo‘lgan harakatlar, sabab va shartni ifodalash'
        },
        {
            id: 4,
            title: 'Прямая и косвенная речь',
            grammatika: 'To‘g‘ri va o‘zlashtirma gap, olmosh va zamon almashuvi',
            konstruksiya: '«Он сказал, что...», «Он спросил, ...ли...», «Он попросил...»',
            muloqot: 'Boshqalarning so‘zini yetkazish, suhbatni qayta hikoya qilish'
        },
        {
            id: 5,
            title: 'Условные предложения',
            grammatika: 'Shart gaplar: real, noreal va o‘tmishga oid shart',
            konstruksiya: '«Если..., то...», «Если бы..., то бы...», «В случае если...»',
            muloqot: 'Taxmin, ehtimol, rejalar va afsuslanishni ifodalash'
        },
        {
            id: 6,
            title: 'Сравнительные конструкции',
            grammatika: 'Qiyosiy va orttirma daraja, qiyoslash vositalari',
            konstruksiya: '«больше, чем», «настолько..., насколько», «самый», «наиболее»',
            muloqot: 'Taqqoslash, tanlovni asoslash, afzallik berish'
        },
        {
            id: 7,
            title: 'Вид глагола',
            grammatika: 'Fe‘l ko‘rinishi: tugallanmagan va tugallangan nisbat',
            konstruksiya: '«делал / сделал», «читать / прочитать», «-ыва-/-ива-»',
            muloqot: 'Jarayon va natijani farqlash, hikoya qilish'
        },
        {
            id: 8,
            title: 'Глаголы движения с приставками',
            grammatika: 'Harakat fe‘llari va old qo‘shimchalar ma‘nosi',
            konstruksiya: '«при-, у-, вы-, в-, до-, пере-, об-» + идти/ехать/нести',
            muloqot: 'Yo‘nalish, marshrut, sayohat va ko‘chishni tasvirlash'
        },
        {
            id: 9,
            title: 'Модальные конструкции',
            grammatika: 'Modallik: imkoniyat, zarurat, ruxsat va taqiq',
            konstruksiya: '«должен», «нужно», «можно», «нельзя», «следует», «стоит»',
            muloqot: 'Maslahat berish, talab qo‘yish, qoidalarni tushuntirish'
        },
        {
            id: 10,
            title: 'Безличные предложения',
            grammatika: 'Shaxssiz gaplar va ularning turlari',
            konstruksiya: '«мне холодно», «стемнело», «хочется», «не спится»',
            muloqot: 'Holat, kayfiyat, tabiat hodisalari va his-tuyg‘ular'
        },
        {
            id: 11,
            title: 'Отглагольные существительные',
            grammatika: 'Fe‘ldan yasalgan otlar va ularning yasalishi',
            konstruksiya: '«-ение», «-ание», «-ка», «-ство»: решение, развитие, обработка',
            muloqot: 'Rasmiy hujjat tili, ilmiy matn, hisobot va tahlil'
        },
        {
            id: 12,
            title: 'Пассивные конструкции',
            grammatika: 'Majhul nisbat: qisqa sifatdosh va -ся shakllari',
            konstruksiya: '«книга написана», «дом строится», «было принято решение»',
            muloqot: 'Xolis bayon, rasmiy uslub, yangiliklar va e‘lonlar'
        },
        {
            id: 13,
            title: 'Предлоги и управление',
            grammatika: 'Ko‘makchilar va fe‘l boshqaruvi, kelishik tanlovi',
            konstruksiya: '«зависеть от», «влиять на», «стремиться к», «нуждаться в»',
            muloqot: 'Aniq va xatosiz ifoda, yozma nutq madaniyati'
        },
        {
            id: 14,
            title: 'Средства аргументации',
            grammatika: 'Dalil keltirish vositalari va mantiqiy bog‘lovchilar',
            konstruksiya: '«во-первых», «следовательно», «таким образом», «с одной стороны»',
            muloqot: 'Bahs, munozara, insho va nutqni tuzish'
        },
        {
            id: 15,
            title: 'Стилистика речи',
            grammatika: 'Nutq uslublari: so‘zlashuv, rasmiy, ilmiy, publitsistik',
            konstruksiya: 'Uslubga mos leksika va sintaksis tanlash',
            muloqot: 'Vaziyatga qarab uslubni almashtirish, xat va murojaat'
        },
        {
            id: 16,
            title: 'Повторение сложных конструкций B2',
            grammatika: 'B2 darajasidagi barcha murakkab konstruksiyalarni takrorlash',
            konstruksiya: 'Sifatdosh, ravishdosh, shart, majhul nisbat va argumentatsiya',
            muloqot: 'Kompleks amaliyot, imtihonga tayyorgarlik, erkin nutq'
        }
    ];

    /** The one-line summary the legacy topic card still expects. */
    function describe(t) {
        return 'Grammatika: ' + t.grammatika + '. Muloqot: ' + t.muloqot;
    }

    global.B2_TOPICS = TOPICS;
    global.B2_TOPIC_DESCRIPTION = describe;
})(typeof window !== 'undefined' ? window : this);
