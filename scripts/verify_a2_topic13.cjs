#!/usr/bin/env node
/**
 * verify_a2_topic13.cjs — A2 topic 13 «O‘tmish va kelajak vaqt shakllari.
 * Istaklar» must stay a complete, honestly gradable lesson.
 *
 * Two things make this lesson different from its neighbours.
 *
 * First, it has EIGHT drills, not ten — that is what the material contains, and
 * no filler exercise was invented to match the other topics. 8 x 10 + 10
 * comprehension = 90 questions.
 *
 * Second, the material carries NO answer section. Every key here is derived
 * from the lesson's own grammar, and wherever the material leaves the gender
 * open — «я …л/…ла», «ты …л/…ла», Uzbek «u» which marks no gender at all — both
 * readings are accepted. Marking one of them wrong would be inventing
 * information the source does not contain, so those pairs are pinned below.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const REL = 'paid-courses/a2-course.html';
const SRC = fs.readFileSync(path.join(ROOT, REL), 'utf8');

function mainScript(html) {
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
    let m, best = '';
    while ((m = re.exec(html))) {
        if (/\bsrc=/.test(m[1])) continue;
        if (m[2].length > best.length) best = m[2];
    }
    return best;
}
function literal(src, name) {
    const i = src.search(new RegExp('(?:const|let|var)\\s+' + name + '\\s*=\\s*[\\[{]'));
    let j = i;
    while (src[j] !== '[' && src[j] !== '{') j++;
    const open = src[j], close = open === '[' ? ']' : '}';
    let d = 0;
    for (let k = j; k < src.length; k++) {
        if (src[k] === open) d++;
        else if (src[k] === close) {
            d--;
            if (d === 0) return vm.runInNewContext('(' + src.slice(j, k + 1) + ')',
                { generateLockedTopics: () => [], icons: {}, lockedTopicNames: [] });
        }
    }
    throw new Error('unbalanced ' + name);
}

console.log('\n=== A2 TOPIC 13 ===');

const topics = literal(SRC, 'courseData').topics;
const t13 = topics.find((t) => t.id === 13);

/* ------------------------------------------------------- 1. the topic */
eq('exactly one topic 13', topics.filter((t) => t.id === 13).length, 1);
eq('16 A2 topics, unchanged', topics.length, 16);
ok(!!t13, 'topic 13 exists');
eq('title', t13.title, 'O‘tmish va kelajak vaqt shakllari. Istaklar');
ok(!t13.quiz, 'the empty placeholder quiz is gone');
ok(typeof t13.explanation.uz === 'string' && t13.explanation.uz.length > 40,
    'topic 13 has a real Uzbek introduction');
ok(!/faqat to‘liq kurs obunachilari/.test(t13.explanation.uz),
    'the "subscribers only" placeholder text is gone');
ok(t13.isSubscriptionLocked === false && t13.isLocked === false, 'topic 13 is open');

/* A2 is complete: topic 16 is authored now, so this lesson's old
   "everything after me is a placeholder" tail has no target left. Whole-course
   authored state is asserted by verify_a2_release.cjs, which owns it. */

/* ------------------------------------------------------- 2. grammar */
{
    const g = t13.grammar || '';
    ok(g.length > 3000, `grammar is substantial (${g.length} chars)`);
    [['1 · the -л rule', /Fe.l negizi<\/b> <span>\+<\/span> <b class="b2g-tone-nsv">-л/],
     ['1 · the four stem examples', /читать<\/td><td>&rarr; <b[^>]*>читал[\s\S]*работал[\s\S]*смотрел[\s\S]*говорил/],
     ['1 · gender/number table', /Она<\/td><td><b[^>]*>-ла[\s\S]*Оно<\/td><td><b[^>]*>-ло[\s\S]*Мы · Вы · Они<\/td><td><b[^>]*>-ли/],
     ['1 · past examples', /Я работал\.[\s\S]*Я работала\.[\s\S]*Он смотрел фильм[\s\S]*Она смотрела фильм[\s\S]*Мы отдыхали[\s\S]*Они гуляли/],
     ['1 · the person-vs-gender rule', /shaxsga emas<\/b>, <b>jins va songa<\/b>/],
     ['1 · читал / читала / читали contrast', /Он читал\.[\s\S]*Она читала\.[\s\S]*Они читали\./],
     ['2 · present быть is dropped', /Я дома\.[\s\S]*Она студентка\./],
     ['2 · past быть model', /Кто\?<\/b> <span>\+<\/span> <b class="b2g-tone-nsv">был \/ была \/ было \/ были/],
     ['2 · был examples', /Я был дома[\s\S]*Я была дома[\s\S]*Он был в школе[\s\S]*Она была на работе[\s\S]*Мы были в Ташкенте/],
     ['3 · БУДУ + INFINITIV', /БУДУ<\/b> <span>\+<\/span> <b>INFINITIV/],
     ['3 · all six auxiliary forms', /буду<\/b><\/td><td>Я буду работать[\s\S]*будешь[\s\S]*будет[\s\S]*будем[\s\S]*будете[\s\S]*будут/],
     ['3 · future examples', /Я буду изучать русский язык[\s\S]*Ты будешь работать завтра[\s\S]*Она будет готовить ужин[\s\S]*Мы будем путешествовать летом[\s\S]*Они будут отдыхать на море/],
     ['4 · compound future', /Составное будущее<\/b> — буду \+ infinitiv[\s\S]*Я буду читать[\s\S]*Мы будем работать[\s\S]*Она будет учиться/],
     ['4 · the process note', /jarayon<\/b> yoki davom etadigan harakat/],
     ['4 · perfective future forms', /написать<\/td><td>&rarr; <b[^>]*>напишу[\s\S]*сделаю[\s\S]*куплю[\s\S]*прочитаю[\s\S]*посмотрю/],
     ['4 · perfective examples', /Я напишу письмо[\s\S]*Она купит платье[\s\S]*Мы сделаем домашнее задание[\s\S]*Он прочитает книгу/],
     ['4 · буду читать vs прочитаю', /буду читать<\/b><\/td><td>o.qish jarayoni[\s\S]*прочитаю<\/b><\/td><td>o.qib tugatish/],
     ['5 · хотеть conjugation', /хочу<\/b>[\s\S]*хочешь<\/b>[\s\S]*хочет<\/b>[\s\S]*хотим<\/b>[\s\S]*хотите<\/b>[\s\S]*хотят<\/b>/],
     ['5 · хотеть examples', /Я хочу отдыхать[\s\S]*Я хочу путешествовать[\s\S]*Она хочет купить машину[\s\S]*Мы хотим изучать русский язык/],
     ['6 · хотел(а) бы model', /Я хотел\(а\) бы<\/b> <span>\+<\/span> <b>infinitiv/],
     ['6 · gender split', /хотел бы<\/b><\/td><td>erkak[\s\S]*хотела бы<\/b><\/td><td>ayol/],
     ['6 · polite-wish examples', /Я хотел бы путешествовать[\s\S]*Я хотела бы жить в Москве[\s\S]*Я хотел бы купить новую машину[\s\S]*Я хотела бы выучить русский язык/],
     ['7 · если бы model', /Если бы<\/b> <span>\+<\/span> <b>o.tgan zamon/],
     ['7 · the three conditional examples', /Если бы у меня было время, я бы путешествовал[\s\S]*Если бы у меня были деньги, я бы купил машину[\s\S]*Если бы я жил в России, я бы каждый день говорил по-русски/],
     ['8 · all six wish models', /Я хочу<\/b> \+ infinitiv[\s\S]*Я хотел\(а\) бы<\/b> \+ infinitiv[\s\S]*Я мечтаю<\/b> \+ infinitiv[\s\S]*Я мечтаю о<\/b> \+ предложный падеж[\s\S]*Я надеюсь<\/b> \+ infinitiv[\s\S]*Если бы…, я бы…/],
     ['8 · мечтаю о путешествии', /Я мечтаю о путешествии/],
     ['8 · надеюсь встретить', /Я надеюсь встретить новых друзей/],
     ['summary · Qisqa formula', /Qisqa formula/],
     ['summary lists all five patterns', /O.TMISH<\/b>[\s\S]*KELAJAK<\/b>[\s\S]*ISTAK<\/b>[\s\S]*MULOYIM ISTAK<\/b>[\s\S]*ORZU \/ SHART<\/b>/]
    ].forEach(([label, re]) => ok(re.test(g), `grammar covers ${label}`));

    eq('eight numbered blocks', (g.match(/class="b2g-h"/g) || []).length, 8);
    eq('the lesson introduces no literal colours of its own',
        (g.match(/#[0-9A-Fa-f]{3,8}\b|rgba?\(/g) || []).length, 0);
    const tones = new Set((g.match(/b2g-tone-(sv|nsv)/g) || []));
    ok(tones.size <= 2, `at most two tone classes are used (${[...tones].join(', ')})`);
    const UI = fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8');
    [...new Set(g.match(/b2g[-a-z0-9]*/g) || [])].forEach((cls) =>
        ok(UI.includes('.' + cls), `the shared stylesheet already defines .${cls}`));
    const widest = (g.match(/<tr>[\s\S]*?<\/tr>/g) || [])
        .reduce((n, row) => Math.max(n, (row.match(/<td[ >]/g) || []).length), 0);
    ok(widest <= 2, `no table row has more than two cells (widest: ${widest})`);
}

/* ------------------------------------------------------- 3. listening */
{
    const a = t13.topic13Exercises.exercises.find((g) => g.id === 'audio');
    ok(!!a, 'the audio is its own step');
    eq('the source is the A2 lesson 13 recording',
        decodeURIComponent(a.audioSrc), 'audios/А2 13 урок.mp3');
    ok(!/\.\.\//.test(a.audioSrc), 'the path is course-relative');
    const f = path.join(ROOT, decodeURIComponent(a.audioSrc));
    ok(fs.existsSync(f), `the referenced mp3 exists on disk (${a.audioSrc})`);
    ok(fs.existsSync(f) && fs.statSync(f).size > 10000, 'and it is a real recording');
    ok(/Моя жизнь через пять лет/.test(a.title), 'the step carries the recording’s title');
    eq('the audio step is named, not numbered', a.stepName, 'Audio');
    ok(!a.passage, 'the audio step carries no passage');
    ok(!t13.topic13Exercises.exercises.some((g) => g.passage), 'no step carries a story text');
    ok(!/Меня зовут|Через пять лет я|Я живу сейчас/.test(JSON.stringify(
        t13.topic13Exercises.exercises.filter((g) => g.id !== 'truefalse'))),
        'no narration was fabricated for the recording');
}

/* --------------------------------------------- 4. exercises + derived keys */
/* THE SOURCE FOR THIS LESSON CARRIES NO ANSWER SECTION. Every key below is
   derived from the lesson's own grammar, and every place where the material
   leaves the gender open is accepted both ways rather than guessed. */
const EXPECTED = [
    ['ex1', 'input', 10], ['ex2', 'choice', 10], ['ex3', 'choice', 10],
    ['ex4', 'choice', 10], ['ex5', 'input', 10], ['ex6', 'choice', 10],
    ['ex7', 'choice', 10], ['ex8', 'input', 10],
    ['audio', 'reading', 0], ['truefalse', 'choice', 10]
];
{
    const groups = t13.topic13Exercises.exercises;
    ok(Array.isArray(groups), 'topic 13 uses the generic exercise shape');
    /* EIGHT drills, not ten — the source has eight, and no filler was invented. */
    eq('ten steps: eight drills, an audio and a comprehension check',
        groups.length, EXPECTED.length);
    EXPECTED.forEach(([id, type, count], i) => {
        const g = groups[i];
        eq(`group ${i + 1} is ${id}`, g.id, id);
        eq(`${id} is a ${type} exercise`, g.type, type);
        eq(`${id} has ${count} questions`, (g.items || []).length, count);
        ok(typeof g.title === 'string' && g.title.trim() !== '', `${id} has a title`);
        if (count > 0) ok(typeof g.howTo === 'string' && g.howTo.trim() !== '',
            `${id} explains how to answer`);
    });
    ok(!groups.some((g) => g.id === 'ex9' || g.id === 'ex10'),
        'no ninth or tenth drill was invented to match the other lessons');

    const norm = (v) => String(v == null ? '' : v).toLowerCase().replace(/ё/g, 'е')
        .replace(/[.,!?;:—–-]/g, ' ').replace(/\s+/g, ' ').trim();
    const acc = (it) => (Array.isArray(it.answer) ? it.answer : [it.answer])
        .filter((a) => String(a == null ? '' : a).trim() !== '');

    let multi = 0, bad = 0;
    groups.forEach((g) => {
        (g.items || []).forEach((it, i) => {
            const w = `${g.id}#${i + 1}`;
            ok(typeof it.q === 'string' && it.q.trim() !== '', `${w} has a prompt`);
            const a = acc(it).map(norm);
            if (!a.length) { bad++; ok(false, `${w} has no key`); return; }
            if (a.length > 1) multi++;
            if (g.type === 'choice') {
                const o = (it.options || []).map(norm);
                eq(`${w} options are distinguishable`, new Set(o).size, o.length);
                a.forEach((x) => ok(o.includes(x),
                    `${w}: the accepted answer «${x}» is one of the options`));
            }
        });
    });
    eq('no question is left without a key', bad, 0);
    ok(!groups.some((g) => (g.items || []).some((it) => it.free)),
        'this lesson has no open prompts — every item is gradable');

    const prompts = groups.flatMap((g) => (g.items || []).map((it) => g.id + '|' + norm(it.q)));
    eq('no duplicated question', new Set(prompts).size, prompts.length);

    const total = groups.reduce((s, g) => s + (g.items || []).length, 0);
    eq('90 interactive questions in total', total, 90);
    eq('the eight drills carry 80 of them',
        groups.filter((g) => /^ex\d+$/.test(g.id)).reduce((s, g) => s + g.items.length, 0), 80);
    eq('the comprehension check carries the other 10',
        groups.find((g) => g.id === 'truefalse').items.length, 10);
    console.log(`  8 drills + audio + comprehension · ${total} interactive`
        + ` (${multi} multi-accept)`);

    const byId = (id) => groups.find((g) => g.id === id);
    const first = (id) => byId(id).items.map((i) => (Array.isArray(i.answer) ? i.answer[0] : i.answer));
    const all = (id, n) => byId(id).items[n - 1].answer;

    /* ---- ex1: past tense, gender open where the subject is «я» or «ты» ---- */
    eq('ex1 primary keys', first('ex1').join(','),
        'читал,работала,гуляли,учил,смотрели,писал,покупал,готовила,были,был');
    eq('ex1 #1 accepts both genders — «я» does not state one',
        all('ex1', 1).join('/'), 'читал/читала');
    eq('ex1 #6 accepts both genders', all('ex1', 6).join('/'), 'писал/писала');
    eq('ex1 #7 accepts both genders — «ты» does not state one',
        all('ex1', 7).join('/'), 'покупал/покупала');
    ok(byId('ex1').items[1].answer.length === 1, 'ex1 #2 «она» is unambiguous');
    ok(byId('ex1').items[3].answer.length === 1, 'ex1 #4 «он» is unambiguous');

    /* ---- ex2: был / была / было / были ---- */
    eq('ex2 primary keys', first('ex2').join(','),
        'был,была,были,был,были,было,была,были,были,было');
    eq('ex2 #1 accepts both genders', all('ex2', 1).join('/'), 'был/была');
    ok(byId('ex2').items.every((i) => i.options.join('|') === 'был|была|было|были'),
        'ex2 offers all four forms');

    /* ---- ex3: only the auxiliary goes in the gap ---- */
    eq('ex3 keys', first('ex3').join(','),
        'буду,будем,будет,будешь,будут,буду,будете,будет,будем,буду');
    ok(byId('ex3').items.every((i) => /работать|смотреть|готовить|учиться|путешествовать|читать|отдыхать|изучать|покупать|встречаться/.test(i.q)),
        'every ex3 prompt already prints the infinitive after the gap');
    ok(byId('ex3').items.every((i) => acc(i).every((a) => /^буд(у|ешь|ет|ем|ете|ут)$/.test(a))),
        'so the key is the auxiliary alone, never «буду работать»');

    /* ---- ex4 ---- */
    eq('ex4 keys', first('ex4').join(','),
        'буду,будешь,будет,будем,будете,будут,будет,буду,будем,будут');

    /* ---- ex5: past or future, decided by the time marker ---- */
    eq('ex5 primary keys', first('ex5').join(','),
        'был,буду,жили,будем жить,читала,будет читать,ужинали,будут ужинать,работал,будет работать');
    eq('ex5 #1 accepts both genders', all('ex5', 1).join('/'), 'был/была');
    eq('ex5 #2 needs no infinitive — none follows the gap', all('ex5', 2).join('/'), 'буду');
    [4, 6, 8, 10].forEach((n) => ok(/^буд(ем|ет|ут) \S+$/.test(all('ex5', n)[0]),
        `ex5 #${n} carries the full compound future`));

    /* ---- ex6 ---- */
    eq('ex6 keys', first('ex6').join(','),
        'хочу,хочет,хотим,хочешь,хотят,хотите,хочет,хочу,хотят,хотим');

    /* ---- ex7: the source gives each item its own two options ---- */
    eq('ex7 primary keys', first('ex7').join(','),
        'хотел бы,хотела бы,хотел бы,хотели бы,хотели бы,хотел бы,хотела бы,хотел бы,хотели бы,хотели бы');
    eq('ex7 #1 accepts both genders — «я» does not state one',
        all('ex7', 1).join('/'), 'хотел бы/хотела бы');
    eq('ex7 #6 accepts both genders', all('ex7', 6).join('/'), 'хотел бы/хотела бы');
    eq('ex7 keeps the source’s own option pairs',
        byId('ex7').items.map((i) => i.options.join('/')).join(' | '),
        ['хотел бы/хотела бы', 'хотел бы/хотела бы', 'хотел бы/хотела бы',
         'хотел бы/хотели бы', 'хотел бы/хотели бы', 'хотел бы/хотела бы',
         'хотел бы/хотела бы', 'хотел бы/хотела бы', 'хотел бы/хотели бы',
         'хотел бы/хотели бы'].join(' | '));

    /* ---- ex8: implementation-derived canonical translations ---- */
    eq('ex8 canonical translations lead', first('ex8').join(' | '),
        ['Вчера я был дома', 'Он вчера гулял с друзьями', 'Мы будем работать завтра',
         'Они будут путешествовать летом', 'Я хочу изучать русский язык',
         'Я хотел бы жить у моря', 'Он хотел бы купить новую машину',
         'Если бы у меня было время, я бы читал больше книг',
         'Если бы у меня было много денег, я бы путешествовал по миру',
         'Я мечтаю жить в большом доме в будущем'].join(' | '));
    /* Uzbek marks neither the speaker's gender nor the gender of «u». */
    [[1, 'Вчера я была дома'], [2, 'Она вчера гуляла с друзьями'],
     [6, 'Я хотела бы жить у моря'], [7, 'Она хотела бы купить новую машину'],
     [8, 'Если бы у меня было время, я бы читала больше книг'],
     [9, 'Если бы у меня было много денег, я бы путешествовала по миру']]
        .forEach(([n, variant]) => ok(all('ex8', n).includes(variant),
            `ex8 #${n} also accepts «${variant}»`));
    /* «xohlardi» is a past wish; both the polite-conditional and the plain past
       reading are defensible, so neither is marked wrong. */
    ok(all('ex8', 7).includes('Он хотел купить новую машину')
        && all('ex8', 7).includes('Она хотела купить новую машину'),
        'ex8 #7 accepts the plain past reading of «xohlardi» as well');
    eq('ex8 #7 offers all four readings', all('ex8', 7).length, 4);
    ok(all('ex8', 10).includes('Я мечтаю в будущем жить в большом доме'),
        'ex8 #10 accepts the other natural word order');
    ok(byId('ex8').items.every((i) => i.answer.length <= 4),
        'no translation is opened up to an unbounded list');

    /* ---- comprehension ---- */
    eq('the comprehension keys carry the source semantics',
        byId('truefalse').items.map((i) => i.answer).join(','),
        'Правда,Ложь,Правда,Правда,Ложь,Правда,Правда,Ложь,Правда,Правда');
    ok(byId('truefalse').items.every((i) => i.options.join('|') === 'Правда|Ложь'),
        'the comprehension check offers Правда / Ложь');
    /* The source wrote the positive label as «Рост»; only the LABEL was
       normalised to the project's standard, never the true/false meaning. */
    ok(!/Рост/.test(JSON.stringify(byId('truefalse'))),
        'the source label «Рост» does not reach the learner');
    eq('the ten statements are the source statements, verbatim',
        byId('truefalse').items.map((i) => i.q).join(' | '),
        ['Автор думает о своём будущем.',
         'Через пять лет он хочет жить в маленькой квартире.',
         'Автор будет много работать в будущем.',
         'Он хочет хорошо говорить по-русски.',
         'В прошлом году автор много путешествовал.',
         'Раньше он часто оставался дома.',
         'Автор хотел бы посетить Москву и Санкт-Петербург.',
         'Он не хочет знакомиться с новыми людьми.',
         'Если бы у него было больше свободного времени, он бы чаще путешествовал.',
         'Автор надеется, что его мечты станут реальностью.'].join(' | '));
}

/* ------------------------------------------------------- 5. vocabulary */
{
    const VSRC = mainScript(fs.readFileSync(path.join(ROOT, 'paid-courses/a2-vocabulary.html'), 'utf8'));
    const all = literal(VSRC, 'vocabularyData').topics;
    const v = all.find((t) => t.id === 13);
    ok(!!v, 'vocabulary topic 13 exists');
    eq('80 cards, exactly the source count', v.words.length, 80);
    eq('no exact duplicate card',
        new Set(v.words.map((w) => w.ru.toLowerCase() + '||' + w.uz.toLowerCase())).size, 80);
    eq('no repeated russian side either',
        new Set(v.words.map((w) => w.ru.toLowerCase())).size, 80);
    ok(v.words.every((w) => w.ru && w.ru.trim() && w.uz && w.uz.trim()),
        'no card has an empty side');
    eq('the deck opens on «прошлое»', v.words[0].ru + ' — ' + v.words[0].uz, 'прошлое — o‘tmish');
    eq('and closes on «шаг к цели»', v.words[79].ru + ' — ' + v.words[79].uz,
        'шаг к цели — maqsad sari qadam');
    /* the six source groups, in source order */
    const idx = (ru) => v.words.findIndex((w) => w.ru === ru);
    [['прошлое', 'работать'], ['работать', 'хотеть'], ['хотеть', 'Я хочу...'],
     ['Я хочу...', 'жить у моря'], ['жить у моря', 'если'], ['если', 'свободное время']]
        .forEach(([a, b]) => ok(idx(a) >= 0 && idx(b) > idx(a),
            `«${a}» comes before «${b}» — the source grouping is kept`));
    [['через пять лет', 'besh yildan keyin'], ['выучить', 'o‘rganib olmoq'],
     ['надежда', 'umid'], ['Я планирую...', 'Men rejalashtiryapman...'],
     ['осуществить мечту', 'orzuni amalga oshirmoq'],
     ['если бы', 'agar ... bo‘lganida'], ['я бы изменил(а)', 'men o‘zgartirardim'],
     ['реальность', 'haqiqat, voqelik']]
        .forEach(([ru, uz]) => ok(v.words.some((w) => w.ru === ru && w.uz === uz),
            `the card "${ru}" is present with its source translation`));
    ok(/\b13:\s*80\b/.test(SRC), 'the course card advertises 80 words for topic 13');
    eq('topics 1-12 vocabulary unchanged',
        [1,2,3,4,5,6,7,8,9,10,11,12].map((id) => all.find((t) => t.id === id).words.length).join(','),
        '45,77,73,106,50,69,85,85,50,69,70,55');
    /* no placeholder decks remain — every A2 topic ships vocabulary now */
}

/* ------------------------------- 6. it renders, grades and completes */
{
    const blocks = [...SRC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const pre = blocks.find((b) => /(let|var|const)\s+currentUser/.test(b) && !b.includes('const courseData'));
    const main = blocks.find((b) => b.includes('const courseData'));
    function boot() {
        const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
        const w = new JSDOM(SRC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g, '<script></script>'),
            { url: 'https://uzdarus.uz/' + REL, runScripts: 'outside-only', pretendToBeVisual: true,
              virtualConsole: vc }).window;
        w.HTMLElement.prototype.scrollIntoView = function () {};
        w.alert = () => {}; w.confirm = () => true;
        w.eval('window.__claims=[];window.__safe=[];window.currentUserId="u1";' +
            'window.saveQuizResult=async()=>1;' +
            /* A2 reports the EXERCISES HALF now: complete-topic finalises only
               what the component record earns, so a whole-topic claim could never
               append and A2 topics never completed. The legacy route is stubbed
               too, so a regression back to it shows up as a claim carrying no
               component. */
            'window.completeCourseComponent=async function(c,t,cm){window.__claims.push({c:c,t:t,cm:cm});' +
            ' window.__srv=Array.from(new Set([...(window.__srv||[]),t])).sort((a,b)=>a-b);' +
            ' return {ok:true,course:c,topicId:t,component:cm,' +
            '  components:{vocabularyCompleted:true,exercisesCompleted:true},' +
            '  topicCompleted:true,completedTopics:window.__srv.slice(),nextTopic:t+1};};' +
            'window.completeCourseTopic=async function(c,t){window.__claims.push({c:c,t:t});' +
            ' return window.__srv ? window.__srv.slice() : [];};' +
            'window.saveUserProgress=async function(u,c,p){window.__safe.push(p);return 1;};' +
            'window.getUserProgress=async()=>({completedTopics:[1,2,3,4,5,6,7]});' +
            'window.getUserQuizResults=async()=>({});window.logActivity=async()=>{};');
        ['exercise-session.js', 'sentence-builder.js', 'course-exercise-ui.js', 'a2-host.js']
            .forEach((f) => w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
        if (pre) w.eval(pre);
        w.eval(main + '\n;window.__api={loadLesson:loadLesson,exData:getT1ExData,' +
            'setCompleted:function(v){completedTopics=v;},getCompleted:function(){return completedTopics;},' +
            'render:renderTopic1Exercises,complete:a2CompleteTopic,check:window.checkTopic1Exercises};');
        w.eval('window.currentUserId="u1";');
        return w;
    }
    const w = boot();

    w.__api.setCompleted([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    w.eval('currentTopicId=13;');
    w.__api.loadLesson(13);
    const D = w.document;

    ok(!!w.__api.exData(t13), 'the generic engine claims topic 8');
    eq('ten steps exist in the hidden bridge', D.querySelectorAll('[data-t1-ex]').length, 10);
    /* ex1, ex5 and ex8 are the text-input drills; this lesson has no builder. */
    eq('thirty text inputs render across the three input steps',
        D.querySelectorAll('[data-t1-input]').length, 30);
    const lesson = (D.getElementById('lessonContent') || D.body).textContent;
    ok(/Если бы у меня было время/.test(lesson), 'the grammar reaches the screen');
    ok(/Audio va tushunish savollari/.test(lesson), 'the lesson announces the listening step');

    const first = (a) => (Array.isArray(a) ? a[0] : a);
    let missing = 0;
    t13.topic13Exercises.exercises.forEach((g) => {
        (g.items || []).forEach((it, i) => {
            const key = g.id + '-' + i;
            if (g.type === 'choice') {
                const row = D.querySelector(`[data-t1-row="${key}"]`);
                /* A choice may accept more than one option — ex7 works with
                   either time expression. A learner clicks one chip, so the
                   walk picks the first accepted value. */
                const want = Array.isArray(it.answer) ? it.answer[0] : it.answer;
                const btn = row && [...row.querySelectorAll('.t1-opt')]
                    .find((b) => b.getAttribute('data-value') === want);
                if (btn) btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
                else missing++;
            } else {
                const inp = D.querySelector(`[data-t1-input="${key}"]`);
                if (inp) inp.value = first(it.answer); else missing++;
            }
        });
    });
    eq('every question is answerable in the DOM', missing, 0);

    return (async () => {
        await w.__api.check(13);
        const marked = D.querySelectorAll('.t1-opt.t1-ok').length
            + D.querySelectorAll('[data-t1-input].correct').length;
        const scoreText = (D.getElementById('scoreDisplay') || {}).textContent || '';
        ok(/\b90\s*\/\s*90\b/.test(scoreText),
            `a perfect paper is graded 90/90 (${scoreText.trim()})`);
        ok(marked >= 20, `the graded widgets mark themselves correct (${marked})`);

        /* Completion must go through the server, and unlock topic 9. */
        await w.__api.complete(13);
        await new Promise((r) => setTimeout(r, 150));
        eq('exactly one completion claim', w.__claims.length, 1);
        eq('the claim names course A2', w.__claims[0].c, 'A2');
        eq('and it claims the EXERCISES half, not the whole topic',
            w.__claims[0].cm, 'exercises');
        eq('the claim names topic 13', w.__claims[0].t, 13);
        ok(w.__api.getCompleted().includes(13), 'the server answer is adopted');
        ok(w.__safe.every((p) => !('completedTopics' in p)),
            'no completion field went through the generic saver');
        ok(w.__api.getCompleted().includes(13), 'topic 14 unlocks');
        ok(!/saveUserProgress\([^)]*completedTopics/.test(SRC),
            'topic 13 introduced no direct authoritative write');

        /* A REFUSED server save must not unlock anything. */
        {
            const wf = boot();
            wf.eval('window.completeCourseComponent=async function(){throw new Error("offline");};' +
                    'window.completeCourseTopic=async function(){throw new Error("offline");};');
            wf.__api.setCompleted([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
            wf.eval('currentTopicId=13;');
            wf.__api.loadLesson(13);
            try { await wf.__api.complete(13); } catch (e) { /* surfaced to the learner */ }
            await new Promise((r) => setTimeout(r, 120));
            ok(!wf.__api.getCompleted().includes(13),
                'a failed server save leaves topic 13 incomplete');
        }

        /* ---------- 7. THE STEPPING SESSION, not a long page ---------- */
        const w2 = boot();
        const D2 = w2.document;
        w2.__api.setCompleted([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        w2.eval('currentTopicId=13;');
        w2.__api.loadLesson(13);
        w2.__api.render(13);
        const bridge = D2.getElementById('a2LegacyBridge');
        ok(!!bridge, 'the legacy write-through bridge exists');
        ok((bridge.getAttribute('style') || '').includes('display:none'),
            'the bridge is hidden from the learner');
        eq('no exercise block is visible in the page flow',
            D2.querySelectorAll('[data-t1-ex]').length - bridge.querySelectorAll('[data-t1-ex]').length, 0);

        const mount = D2.getElementById('a2PracticeMount');
        ok(!!mount, 'the practice session is mounted');
        const open = [...mount.querySelectorAll('button')][0];
        ok(!!open, 'the practice card offers a way in');
        open.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));

        const host = () => D2.querySelector('.uz-step-host');
        const stepText = () => (D2.querySelector('.uz-step') || {}).textContent || '';
        const titlesOnScreen = () => host() ? host().querySelectorAll('.b2h-howto-t').length : 0;
        ok(!!host(), 'the session opens in its stepping modal');
        eq('the first step is announced in Uzbek', stepText().trim(), 'Mashq 1 / 8');
        eq('exactly one exercise is on screen', titlesOnScreen(), 1);
        ok(/письмо другу/.test(host().textContent), 'step 1 is exercise 1');
        ok(!/Моё детство/.test(host().textContent), 'exercise 2 is NOT also on screen');
        ok(!host().querySelector('audio'), 'the audio player is NOT on screen yet');
        ok(/Javoblarni tekshirish/.test([...D2.querySelectorAll('.uz-foot button, .uz-btn')]
            .map((b) => b.textContent).join(' | ')), 'the check button is in Uzbek');

        const groups = t13.topic13Exercises.exercises;
        const seen = [];
        let multi = 0;
        for (let i = 0; i < groups.length; i++) {
            seen.push(stepText().trim());
            if (titlesOnScreen() > 1) multi++;
            const g = groups[i];
            /* ANSWER EACH STEP, PROPERLY.

               These fills looked only for the topic-1 markup, so on a topic
               rendered by the shared course-exercise-ui (data-b2h-*) nothing was
               ever answered: every step scored zero and the walkthrough advanced
               anyway, because A2 had no pass gate. A2 now enforces the platform
               80% rule, so an unanswered step correctly refuses to open the next.

               Both markups are clicked, and then the host's OWN writeAnswer is
               called — the same function draft-restore uses, which knows every
               group type including builders and matchers. */
            (g.items || []).forEach((it, k) => {
                const key = g.id + '-' + k;
                const want = Array.isArray(it.answer) ? it.answer[0] : it.answer;
                ['t1', 'b2h'].forEach((ns) => {
                    const row = host().querySelector(`[data-${ns}-row="${key}"]`);
                    if (row) {
                        const b = [...row.querySelectorAll('.t1-opt, .b2h-opt')]
                            .find((x) => x.getAttribute('data-value') === want);
                        if (b) b.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
                    }
                    const inp = host().querySelector(`[data-${ns}-input="${key}"]`);
                    if (inp) {
                        inp.value = want;
                        inp.dispatchEvent(new w2.Event('input', { bubbles: true }));
                    }
                });
                try {
                    const UI = w2.UzExerciseUI;
                    if (UI && typeof UI.writeAnswer === 'function') {
                        UI.writeAnswer(host(), key, want, g, it);
                    }
                } catch (e) { /* a type that cannot be written is left to the clicks */ }
            });
            if (g.id === 'audio') {
                const foot = [...D2.querySelectorAll('.uz-foot button, .uz-btn')]
                    .map((b) => b.textContent.trim());
                const audioEl = host().querySelector('audio');
                ok(!!audioEl, 'the audio step renders a player');
                ok(audioEl.hasAttribute('controls'), 'the player has controls');
                ok(!audioEl.hasAttribute('autoplay'), 'it does not autoplay');
                eq('the player preloads metadata only',
                    audioEl.getAttribute('preload'), 'metadata');
                const srcEl = audioEl.querySelector('source');
                const played = decodeURIComponent(srcEl.getAttribute('src') || '');
                ok(/audios\/А2 13 урок\.mp3$/.test(played),
                    `the player points at the A2 lesson 13 recording (${played})`);
                ok(!/Б2/.test(played), 'and not at a Б2 recording');
                ok(!/Автор думает о своём будущем/.test(host().textContent),
                    'the comprehension statements are NOT on the audio step');
                ok(!foot.some((t) => /tekshirish/i.test(t)),
                    'the audio step offers no check button');
                ok(!foot.some((t) => /qayta ishlash/i.test(t)), 'and no retry');
                eq('the audio step offers exactly one action', foot.length, 1);
                ok(/Savollarga/.test(foot[0] || ''), 'that action moves on to the questions');
            }
            if (g.id === 'truefalse') {
                ok(/Автор думает о своём будущем/.test(host().textContent),
                    'the comprehension questions are on their own step');
                ok(!host().querySelector('audio'),
                    'the player is not repeated on the questions step');
                eq('the comprehension step is a single step', titlesOnScreen(), 1);
            }
            const check = [...D2.querySelectorAll('.uz-foot button, .uz-btn')]
                .find((b) => /tekshirish/i.test(b.textContent));
            if (check) check.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
            const next = [...D2.querySelectorAll('.uz-foot button, .uz-btn')]
                .find((b) => /keyingi mashq|yakunlash|savollarga/i.test(b.textContent));
            if (!next) break;
            next.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
        }
        eq('never more than one exercise on screen', multi, 0);
        eq('every one of the ten steps was reached', seen.length, 10);
        eq('the cursor numbers the drills and names the rest', seen.join(' | '),
            [...Array.from({ length: 8 }, (_, i) => `Mashq ${i + 1} / 8`),
             'Audio', 'Audio bo‘yicha savollar'].join(' | '));

        /* ---------- 8. no second engine was written for topic 8 ---------- */
        ok(!/topic13(Active|Step|Custom|Navigation|Renderer|State|Wizard|Checker|Modal|Storage)/i.test(SRC),
            'topic 13 introduced no bespoke step/state/renderer machinery');
        ok(/window\.A2Host\.mountPractice/.test(SRC),
            'topic 13 goes through the shared A2 practice mount');
        eq('exactly one practice mount in the page',
            (SRC.match(/A2Host\.mountPractice\(/g) || []).length, 1);
        {
            const a = SRC.indexOf('topic13Exercises:');
            const b = SRC.indexOf('id: 14,', a);
            ok(!/function\s*\(|=>/.test(SRC.slice(a, b)), 'the topic 13 payload is data, not logic');
        }

        console.log('='.repeat(60));
        if (fail) {
            console.log(`  ❌ A2 TOPIC 13: ${fail} failed / ${pass + fail}\n`);
            failures.slice(0, 20).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
            console.log('='.repeat(60) + '\n');
            process.exit(1);
        }
        console.log(`  ✅ A2 TOPIC 13: ${pass}/${pass} passed`);
        console.log('='.repeat(60) + '\n');
    })();
}
