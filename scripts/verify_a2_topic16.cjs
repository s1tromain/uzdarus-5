#!/usr/bin/env node
/**
 * verify_a2_topic16.cjs — A2 topic 16 «Madaniyat va an'analar», THE FINAL A2
 * LESSON, must stay a complete, honestly gradable lesson.
 *
 * This suite carries two jobs the other topic suites do not.
 *
 * FIRST, A2 IS NOW COMPLETE. There is no placeholder tail after this lesson and
 * no topic 17 was invented to keep old "the next one is a placeholder" habits
 * alive. Finishing topic 16 must congratulate the learner rather than send them
 * to a lesson that does not exist — the shared completion path used to say
 * `topicId + 1` unconditionally, and that is fixed generically from courseData.
 *
 * SECOND, THE MATERIAL SUPPLIES AN ANSWER KEY ONLY FOR THE AUDIO. Every key for
 * Ex1-Ex10 is IMPLEMENTATION-DERIVED from the lesson's own grammar and task
 * wording. It is not a source key and is never described as one.
 *
 * Nine source defects are repaired and pinned here:
 *   Ex1 #2   had nothing to compare against in a чем drill
 *   Ex2 #3   «один из ___» needs самых, which the grammar now teaches
 *   Ex4 #8   the cue «готовить / праздник» was too thin to build from
 *   Ex5 #5/#6/#10 accepted several different words each
 *   Ex6 #6   read correctly with BOTH на and в
 *   Ex8 #6   «похожи на друг на друга» — a broken double на
 *   Ex8 #7   «похожа на нашей культуре» — wrong case after на
 *   Ex9 #4   cue gave nominative «современные», unusable
 *   Ex9 #5   cue was missing the obligatory «тем»
 *   Ex9 #8   cue gave nominative «наша» instead of accusative «нашу»
 * plus: старше scoped to people, «как обычно» not sold as «как + noun», and the
 * mixed-language heading «Маданият и традиции» normalised to «Культура и
 * традиции».
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

console.log('\n=== A2 TOPIC 16 · FINAL A2 LESSON ===');

const topics = literal(SRC, 'courseData').topics;
const t16 = topics.find((t) => t.id === 16);

/* ------------------------------------- 1. the topic, and the end of A2 */
eq('exactly one topic 16', topics.filter((t) => t.id === 16).length, 1);
eq('sixteen A2 topics', topics.length, 16);
ok(!!t16, 'topic 16 exists');
/* The straight apostrophe here is the project's committed value — it is what
   HEAD's placeholder title carried and what the vocabulary deck name uses.
   Pinned as-is rather than silently retyped to a typographic one. */
eq('title', t16.title, "Madaniyat va an'analar");
ok(!t16.quiz, 'the empty placeholder quiz is gone');
ok(typeof t16.explanation.uz === 'string' && t16.explanation.uz.length > 40,
    'topic 16 has a real Uzbek introduction');
ok(!/faqat to‘liq kurs obunachilari/.test(t16.explanation.uz),
    'the "subscribers only" placeholder text is gone');
ok(t16.isSubscriptionLocked === false && t16.isLocked === false, 'topic 16 is open');

/* THE COURSE IS FINISHED — and no phantom next lesson was created. */
eq('the highest topic id is 16', Math.max(...topics.map((t) => t.id)), 16);
ok(!topics.some((t) => t.id === 17), 'NO topic 17 was invented');
ok(!topics.some((t) => t.id > 16), 'and nothing beyond 16 exists at all');
ok(topics.every((t) => (t.grammar || '').length > 500),
    'every one of the sixteen topics carries real grammar');
ok(topics.every((t) => !t.quiz), 'no topic still carries the legacy placeholder quiz');
ok(topics.every((t) => Object.keys(t).some((k) => /^topic\d+Exercises$/.test(k))),
    'every topic carries its own exercise payload — A2 has no placeholder left');
ok(!/topic17Exercises/.test(SRC), 'no topic17 payload exists in the page');

/* ------------------------------------------------------- 2. grammar */
{
    const g = t16.grammar || '';
    ok(g.length > 3000, `grammar is substantial (${g.length} chars)`);
    [['lead names the Russian topic', /Культура и традиции/],
     ['1 · comparative model', /<b>A<\/b> <span>\+<\/span> <b[^>]*>qiyosiy daraja<\/b> <span>\+<\/span> <b>чем<\/b> <span>\+<\/span> <b>B<\/b>/],
     ['1 · the three source examples', /Узбекские традиции интереснее, чем русские[\s\S]*Этот праздник красивее, чем тот[\s\S]*Семейные праздники важнее, чем другие праздники/],
     ['1 · the five comparative forms', /интереснее[\s\S]*красивее[\s\S]*важнее[\s\S]*добрее[\s\S]*моложе/],
     ['2 · all four самый forms', /самый<\/b> — erkak jins[\s\S]*самая<\/b> — ayol jins[\s\S]*самое<\/b> — o.rta jins[\s\S]*самые<\/b> — ko.plik/],
     ['2 · the source самый phrases', /самый важный праздник[\s\S]*самый интересный обычай[\s\S]*самая красивая традиция[\s\S]*самая интересная культура[\s\S]*самое важное событие[\s\S]*самые известные традиции/],
     ['3 · чем…, тем… model', /<b>Чем<\/b> <span>\+<\/span> <b[^>]*>qiyosiy daraja<\/b><span>,<\/span> <b>тем<\/b>/],
     ['3 · the three source examples', /Чем больше мы знаем о культуре, тем интереснее она становится[\s\S]*Чем больше мы путешествуем, тем больше узнаём о традициях[\s\S]*Чем старше человек, тем больше он ценит традиции/],
     ['5 · в нашей культуре model', /<b[^>]*>В нашей культуре<\/b> <span>\+<\/span> <b>mavjudlik yoki harakat<\/b>/],
     ['5 · the three source examples', /В нашей культуре есть много интересных традиций[\s\S]*В нашей культуре принято уважать старших[\s\S]*В нашей культуре люди часто собираются всей семьёй/],
     ['6 · у нас принято + infinitive', /<b[^>]*>У нас принято<\/b> <span>\+<\/span> <b>infinitiv<\/b>/],
     ['6 · the four source examples', /У нас принято уважать старших[\s\S]*У нас принято приглашать гостей домой[\s\S]*У нас принято готовить много еды на праздник[\s\S]*У нас принято дарить подарки детям/],
     ['7 · обычно мы + verb', /<b[^>]*>Обычно<\/b> <span>\+<\/span> <b>мы<\/b> <span>\+<\/span> <b>fe.l<\/b>/],
     ['7 · the four source examples', /Обычно мы празднуем Новый год дома[\s\S]*Обычно мы собираемся всей семьёй[\s\S]*Обычно люди готовят традиционные блюда[\s\S]*Обычно гости приходят вечером/],
     ['8 · на праздник examples', /Мы готовим еду на праздник[\s\S]*Я купила подарок на праздник[\s\S]*Они пришли на праздник/],
     ['8 · в праздник examples', /В праздник мы собираемся всей семьёй[\s\S]*В праздник люди надевают красивую одежду[\s\S]*В праздник мы готовим традиционные блюда/],
     ['9 · all three opinion frames', /Я думаю, что<\/b> \+ gap[\s\S]*Я считаю, что<\/b> \+ gap[\s\S]*По-моему,<\/b> \+ gap/],
     ['9 · the source opinion examples', /Я думаю, что традиции очень важны[\s\S]*Я считаю, что нужно сохранять традиции[\s\S]*По-моему, семейные традиции очень важны[\s\S]*По-моему, национальная кухня — важная часть культуры/]
    ].forEach(([label, re]) => ok(re.test(g), `grammar covers ${label}`));

    /* ---- SOURCE FIX: старше is about a person's age ---- */
    ok(/старше<\/b> odatda <b>odamning yoshi<\/b>/.test(g), 'старше is scoped to a person’s age');
    ok(/Мой брат старше меня/.test(g) && /Этот человек старше меня/.test(g),
        'with the two person examples');
    ok(/старее<\/b> yoki <b[^>]*>более старый/.test(g),
        'and traditions / objects get старее or более старый');
    ok(/Эта традиция старее той\./.test(g),
        'illustrated with an example from this very lesson');
    ok(!/старый<\/td><td>&rarr; <b[^>]*>старше/.test(g),
        'старый → старше is NOT listed as a plain universal comparative');

    /* ---- SOURCE FIX: «один из самых» is taught, because Ex2 #3 needs it ---- */
    ok(/один из<\/b> <span>\+<\/span> <b[^>]*>самых<\/b>/.test(g),
        'the «один из самых ...» model is shown as its own scheme');
    ok(/Навруз — один из самых известных праздников\./.test(g)
        && /Новый год — один из самых популярных праздников\./.test(g),
        'with both ready-made examples');
    ok(/самых<\/b> shakli keladi/.test(g),
        'and it says explicitly that the form here is самых');

    /* ---- SOURCE FIX: the похож heading covers BOTH constructions ---- */
    ok(/O.xshatish — похож на \/ как/.test(g),
        'the block is titled for похож на AND как, not for «как» alone');
    ['похож на', 'похожа на', 'похоже на', 'похожи на'].forEach((f) =>
        ok(g.includes(f), `похож agreement covers «${f}»`));
    ok(/Этот праздник похож на семейный праздник/.test(g)
        && /Эта традиция похожа на нашу традицию/.test(g)
        && /Эти обычаи похожи на наши обычаи/.test(g),
        'with an example for each gender/number');
    ok(/tushum kelishigida/.test(g), 'and the accusative after «на» is stated');

    /* ---- SOURCE FIX: «как обычно» is a fixed phrase, not «как + noun» ---- */
    ok(/обычно<\/b> ot emas, ravish/.test(g),
        '«обычно» is called an adverb, so «как обычно» is not sold as «как + noun»');
    ok(/tayyor ibora/.test(g), 'and «как обычно» is labelled a ready-made phrase');
    ok(/Он говорит как настоящий специалист/.test(g),
        'the genuine «как + noun» example is kept');
    ok(/Мы отмечаем этот праздник как обычно/.test(g), 'as is the source sentence');

    /* ---- the summary keeps all ten source models, plus «один из самых» ---- */
    ['Этот праздник интереснее, чем тот.', 'Это самый важный праздник.',
     'Чем больше мы узнаём, тем интереснее.', 'В нашей культуре есть много традиций.',
     'У нас принято уважать старших.', 'Обычно мы собираемся всей семьёй.',
     'Я думаю, что традиции важны.', 'Я считаю, что культуру нужно сохранять.',
     'По-моему, этот праздник очень красивый.', 'Эта традиция похожа на нашу.']
        .forEach((s, i) => ok(g.includes(`<b>${i + 1}.</b>`) && g.includes(s),
            `summary model ${i + 1} is present («${s}»)`));
    ok(/A2 uchun asosiy modellar/.test(g), 'the summary section is titled as the source titles it');

    eq('nine numbered blocks', (g.match(/class="b2g-h"/g) || []).length, 9);
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
    const a = t16.topic16Exercises.exercises.find((g) => g.id === 'audio');
    ok(!!a, 'the audio is its own step');
    eq('the source is the A2 lesson 16 recording',
        decodeURIComponent(a.audioSrc), 'audios/А2 16 урок.mp3');
    ok(!/\.\.\//.test(a.audioSrc), 'the path is course-relative');
    const f = path.join(ROOT, decodeURIComponent(a.audioSrc));
    ok(fs.existsSync(f), `the referenced mp3 exists on disk (${a.audioSrc})`);
    ok(fs.existsSync(f) && fs.statSync(f).size > 10000, 'and it is a real recording');
    /* SOURCE NORMALISATION: the material headed this «Маданият и традиции»,
       which is Uzbek words in Cyrillic script, not Russian. */
    ok(/Культура и традиции/.test(a.title), 'the step carries a real Russian title');
    ok(!/Маданият/.test(SRC), 'the mixed-language «Маданият» never reaches the learner');
    eq('the audio step is named, not numbered', a.stepName, 'Audio');
    ok(!a.passage, 'the audio step carries no passage');
    ok(!t16.topic16Exercises.exercises.some((g) => g.passage), 'no step carries a story text');
    /* The material has no transcript. None was written. */
    ok(!/Автор (рассказывает|живёт|говорит)|Перед праздником семья убирает дом и готовит/i.test(
        JSON.stringify(t16.topic16Exercises.exercises.filter((g) => g.id !== 'truefalse'))),
        'no narration was fabricated for the recording');
}

/* ------------------- 4. exercises + IMPLEMENTATION-DERIVED keys ------------ */
const EXPECTED = [
    ['ex1', 'input', 10], ['ex2', 'choice', 10], ['ex3', 'input', 10],
    ['ex4', 'input', 10], ['ex5', 'input', 10], ['ex6', 'choice', 10],
    ['ex7', 'input', 10], ['ex8', 'choice', 10], ['ex9', 'builder', 10],
    ['ex10', 'input', 10], ['audio', 'reading', 0], ['truefalse', 'choice', 10]
];
{
    const groups = t16.topic16Exercises.exercises;
    ok(Array.isArray(groups), 'topic 16 uses the generic exercise shape');
    eq('twelve steps: ten drills, an audio and a comprehension check',
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
    ok(!groups.some((g) => g.id === 'ex11'), 'no eleventh drill was invented');

    const norm = (v) => String(v == null ? '' : v).toLowerCase().replace(/ё/g, 'е')
        .replace(/[.,!?;:()"'«»—–-]/g, ' ').replace(/\s+/g, ' ').trim();
    const acc = (it) => (Array.isArray(it.answer) ? it.answer : [it.answer])
        .filter((a) => String(a == null ? '' : a).trim() !== '');

    let multi = 0, open = 0, bad = 0;
    groups.forEach((g) => {
        (g.items || []).forEach((it, i) => {
            const w = `${g.id}#${i + 1}`;
            ok(typeof it.q === 'string' && it.q.trim() !== '', `${w} has a prompt`);
            if (it.free) { open++; eq(`${w} carries no key`, acc(it).length, 0); return; }
            const a = acc(it).map(norm);
            if (!a.length) { bad++; ok(false, `${w} has no key`); return; }
            if (a.length > 1) multi++;
            eq(`${w}: no two accepted answers are the same after normalisation`,
                new Set(a).size, a.length);
            if (g.type === 'choice') {
                const o = (it.options || []).map(norm);
                eq(`${w} options are distinguishable`, new Set(o).size, o.length);
                a.forEach((x) => ok(o.includes(x),
                    `${w}: the accepted answer «${x}» is one of the options`));
            }
        });
    });
    eq('no gradable question is left without a key', bad, 0);

    const prompts = groups.flatMap((g) => (g.items || []).map((it) => g.id + '|' + norm(it.q)));
    eq('no duplicated question', new Set(prompts).size, prompts.length);

    const total = groups.reduce((s, g) => s + (g.items || []).length, 0);
    eq('110 interactive questions in total', total, 110);
    eq('the ten drills carry 100 of them',
        groups.filter((g) => /^ex\d+$/.test(g.id)).reduce((s, g) => s + g.items.length, 0), 100);
    eq('the comprehension check carries the other 10',
        groups.find((g) => g.id === 'truefalse').items.length, 10);
    eq('exactly ten open prompts, all of them in ex3', open, 10);
    console.log(`  10 drills + audio + comprehension · ${total} interactive`
        + ` (${open} open, ${multi} multi-accept)`);

    const byId = (id) => groups.find((g) => g.id === id);
    const first = (id) => byId(id).items.map((i) => (Array.isArray(i.answer) ? i.answer[0] : i.answer));
    const all = (id, n) => byId(id).items[n - 1].answer;

    /* ---- ex1: comparative formation ---- */
    eq('ex1 keys', first('ex1').join(','),
        'интереснее,важнее,вкуснее,современнее,красивее,интереснее,ярче,веселее,богаче,важнее');
    ok(byId('ex1').items.every((i) => /\((интересный|важный|вкусный|современный|красивый|яркий|весёлый|богатый)\)/.test(i.q)),
        'every ex1 prompt prints the adjective it is built from');
    /* SOURCE FIX: #2 had no comparison target in a drill about чем. */
    ok(/чем другие традиции/.test(byId('ex1').items[1].q),
        'ex1 #2 now names what the traditions are compared with');
    eq('ex1 #2 still answers важнее', all('ex1', 2).join('/'), 'важнее');
    ok(byId('ex1').items.every((i) => acc(i).length === 1 && !/\s/.test(acc(i)[0].trim())),
        'every ex1 key is the single comparative word');

    /* ---- ex2: самый forms, including «один из самых» ---- */
    eq('ex2 keys', first('ex2').join(','),
        'самый,самая,самых,самое,самый,самые,самый,самое,самая,самые');
    ok(byId('ex2').items.every((i) => i.options.join('|')
        === 'самый|самая|самое|самые|самых'),
        'ex2 offers all five forms, самых included');
    /* THE CRITICAL ONE: «один из ___ популярных праздников» takes самых. */
    ok(/один из ______ популярных праздников/.test(byId('ex2').items[2].q),
        'ex2 #3 keeps the source «один из ...» prompt');
    eq('ex2 #3 answers самых, not самые', all('ex2', 3), 'самых');
    eq('and only ex2 #3 does',
        byId('ex2').items.filter((i) => i.answer === 'самых').length, 1);

    /* ---- ex3: OPEN ---- */
    eq('ex3 has ten questions', byId('ex3').items.length, 10);
    ok(byId('ex3').items.every((i) => i.free === true),
        'every ex3 item is open — «тем ...» has no unique completion');
    ok(byId('ex3').items.every((i) => acc(i).length === 0),
        'and none of them smuggles in a hidden key');
    ok(byId('ex3').items.every((i) => /^Чем /.test(i.q) && /тем \.\.\.$/.test(i.q)),
        'every ex3 prompt gives the Чем... half and stops at тем');
    ok(/TO‘LIQ/.test(byId('ex3').howTo),
        'ex3 asks for the WHOLE sentence, so a short continuation still scores');
    ok(/Kamida uch so‘z/.test(byId('ex3').howTo),
        'the how-to states the platform’s three-word minimum');
    ok(/Namuna/.test(byId('ex3').intro) && /Namunani ko‘chirmang/.test(byId('ex3').intro),
        'a sample is offered and the learner is told not to copy it');
    {
        const UI = fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8');
        ok(/OPEN_ANSWER_MIN_WORDS\s*=\s*3/.test(UI),
            'the shared open-answer minimum is still 3 — topic 16 did not move it');
    }

    /* ---- ex4: У нас принято ---- */
    eq('ex4 canonical sentences', first('ex4').join(' | '),
        ['У нас принято уважать старших.',
         'У нас принято приглашать гостей домой.',
         'У нас принято готовить традиционные блюда.',
         'У нас принято дарить подарки.',
         'У нас принято собираться всей семьёй.',
         'У нас принято помогать родственникам.',
         'У нас принято поздравлять друзей.',
         'У нас принято готовить много еды на праздник.',
         'У нас принято встречать гостей.',
         'У нас принято носить национальную одежду.'].join(' | '));
    ok(byId('ex4').items.every((i) => /^У нас принято /.test(acc(i)[0])),
        'every ex4 answer uses the У нас принято model');
    /* SOURCE FIX #8 */
    eq('ex4 #8 cue now carries what to cook and when',
        byId('ex4').items[7].q, 'готовить / много еды / на праздник');
    ok(!byId('ex4').items.some((i) => i.q.trim() === 'готовить / праздник'),
        'the under-specified source cue «готовить / праздник» has not returned');

    /* ---- ex5: В нашей культуре ---- */
    eq('ex5 keys', first('ex5').join(','),
        'есть,уважают,приглашать,собираются,национальных,отмечать,уважать,готовят,дарят,семейные');
    /* SOURCE FIXES #5 #6 #10 — each prompt now names its target word */
    [[5, 'национальный'], [6, 'отмечать'], [10, 'семейный']]
        .forEach(([n, cue]) => ok(byId('ex5').items[n - 1].q.includes(`(${cue})`),
            `ex5 #${n} names its target word «${cue}», so it has one answer`));
    ok(!byId('ex5').items.some((i) => i.q.trim()
        === 'В нашей культуре есть ______ национальные блюда.'),
        'the ambiguous source form of ex5 #5 has not returned');
    ok(byId('ex5').items.every((i) => acc(i).length === 1),
        'every ex5 item has exactly one answer');

    /* ---- ex6: на / в праздник ---- */
    eq('ex6 keys', first('ex6').join(','), 'на,в,на,в,на,в,на,в,на,в');
    ok(byId('ex6').items.every((i) => i.options.join('|') === 'на|в'), 'ex6 offers на / в');
    /* SOURCE FIX #6 */
    eq('ex6 #6 is now decidable', byId('ex6').items[5].q,
        '______ праздник мы поём и танцуем.');
    ok(!byId('ex6').items.some((i) => /приглашаем родственников/.test(i.q)),
        'the both-ways-correct «приглашаем родственников» prompt has not returned');

    /* ---- ex7: controlled transformation, all three frames accepted ---- */
    eq('ex7 keeps the source propositions', byId('ex7').items.map((i) => i.q).join(' | '),
        ['Традиции очень важны.',
         'Молодые люди должны знать свою культуру.',
         'Семейные праздники объединяют людей.',
         'Национальная кухня — часть культуры.',
         'Нужно сохранять старые традиции.',
         'Праздники помогают людям отдыхать.',
         'Каждый народ имеет свои традиции.',
         'Дети должны знать историю своей страны.',
         'Семейные традиции нужно передавать детям.',
         'Культура делает народ особенным.'].join(' | '));
    ok(byId('ex7').items.every((i) => !i.free), 'ex7 is NOT open — it is a controlled transformation');
    eq('every ex7 item accepts exactly three frames',
        byId('ex7').items.filter((i) => acc(i).length === 3).length, 10);
    byId('ex7').items.forEach((it, n) => {
        const a = acc(it);
        ok(/^Я думаю, что /.test(a[0]), `ex7 #${n + 1} accepts «Я думаю, что ...»`);
        ok(a.some((x) => /^Я считаю, что /.test(x)), `ex7 #${n + 1} accepts «Я считаю, что ...»`);
        ok(a.some((x) => /^По-моему, /.test(x)), `ex7 #${n + 1} accepts «По-моему, ...»`);
        /* the proposition itself must survive the transformation unchanged */
        const body = it.q.charAt(0).toLowerCase() + it.q.slice(1);
        ok(a.every((x) => x.endsWith(body)), `ex7 #${n + 1} keeps the source proposition intact`);
    });

    /* ---- ex8: похож agreement ---- */
    eq('ex8 keys', first('ex8').join(' | '),
        ['похожа на', 'похож на', 'похожи на', 'похожа на', 'похож на',
         'похожи на', 'похожа на', 'похож на', 'похожи на', 'похожа на'].join(' | '));
    /* SOURCE BUG #6: «похожи на друг на друга» */
    eq('ex8 #6 no longer produces a double на', byId('ex8').items[5].q,
        'Эти праздники __________ другие праздники.');
    ok(!byId('ex8').items.some((i) => /друг на друга/.test(i.q)),
        'the «друг на друга» prompt that broke with «похожи на» has not returned');
    /* SOURCE BUG #7: wrong case after на */
    eq('ex8 #7 now uses the accusative after на', byId('ex8').items[6].q,
        'Эта культура __________ нашу культуру.');
    ok(!byId('ex8').items.some((i) => /нашей культуре/.test(i.q)),
        'the dative «нашей культуре» prompt has not returned');
    ok(byId('ex8').items.every((i) => i.options.join('|')
        === 'похож на|похожа на|похожи на'),
        'ex8 offers the three agreement forms');

    /* ---- ex9: builder ---- */
    const b = byId('ex9');
    eq('ex9 canonical sentences lead', first('ex9').join(' | '),
        ['Навруз — самый интересный праздник для меня.',
         'У нас принято уважать старших.',
         'В нашей культуре есть много традиций.',
         'Старые традиции важнее современных.',
         'Чем больше мы узнаём о культуре, тем интереснее она становится.',
         'На праздник мы готовим много еды.',
         'Я думаю, что традиции важны.',
         'Эта традиция похожа на нашу.',
         'Обычно мы собираемся всей семьёй.',
         'Культура каждого народа особенная.'].join(' | '));
    /* SOURCE BUG #4 — the cue had nominative «современные» */
    ok(b.items[3].q.includes('современных'),
        'ex9 #4 cue carries the genitive «современных» the sentence needs');
    ok(!b.items[3].q.includes('современные'),
        'and no longer the unusable nominative «современные»');
    /* SOURCE BUG #5 — the cue lacked «тем» */
    ok(b.items[4].q.split('/').map((s) => s.trim()).includes('тем'),
        'ex9 #5 cue now contains the obligatory «тем»');
    ok(/чем/.test(b.items[4].q) && /становится/.test(b.items[4].q),
        'and builds the full чем..., тем... sentence from grammar #3');
    /* SOURCE BUG #8 — the cue had nominative «наша» */
    ok(b.items[7].q.includes('нашу'), 'ex9 #8 cue carries the accusative «нашу»');
    ok(!b.items[7].q.split('/').map((s) => s.trim()).includes('наша'),
        'and no longer the unusable nominative «наша»');
    /* deliberately supported natural orders */
    [[1, 'Для меня Навруз — самый интересный праздник.'],
     [6, 'Мы готовим много еды на праздник.'],
     [9, 'Мы обычно собираемся всей семьёй.']]
        .forEach(([n, variant]) => ok(all('ex9', n).some((a) => norm(a) === norm(variant)),
            `ex9 #${n} also accepts «${variant}»`));
    ok(b.items.every((i) => i.answer.length <= 2),
        'no builder item is opened up to a pile of permutations');
    /* EVERY accepted order must be a re-ordering of the SAME cards. */
    {
        const sbx = { window: {}, document: { createElement: () => ({ style: {}, appendChild() {} }) } };
        sbx.self = sbx; sbx.globalThis = sbx;
        vm.createContext(sbx);
        vm.runInContext(fs.readFileSync(path.join(ROOT, 'sentence-builder.js'), 'utf8'), sbx);
        const SB = sbx.window.UzSentenceBuilder;
        ok(!!SB, 'the shared sentence builder loads');
        const bag = (s) => SB.split(s, b.glue).map(norm).filter(Boolean).sort().join('|');
        b.items.forEach((it, i) => {
            const cue = it.q.split('/').map((t) => norm(t.trim())).filter(Boolean).sort().join('|');
            const sets = new Set(it.answer.map(bag));
            eq(`ex9 #${i + 1}: every accepted order uses one and the same token multiset`,
                sets.size, 1);
            eq(`ex9 #${i + 1}: those tokens are exactly the cue`, [...sets][0], cue);
            eq(`ex9 #${i + 1}: the card bank has one card per cue word`,
                SB.bank(it, b).length, it.q.split('/').length);
        });
    }

    /* ---- ex10: implementation-derived translations ---- */
    eq('ex10 keeps the source Uzbek prompts', byId('ex10').items.map((i) => i.q).join(' | '),
        ['Bizning madaniyatimizda ko‘plab qiziqarli an’analar bor.',
         'Bizda kattalarni hurmat qilish odat.',
         'Bu bayram boshqasidan qiziqroq.',
         'Navro‘z eng mashhur bayramlardan biridir.',
         'Bayramga biz ko‘p ovqat tayyorlaymiz.',
         'Bayramda butun oila yig‘iladi.',
         'Menimcha, an’analar juda muhim.',
         'Menimcha, yoshlar o‘z madaniyatini bilishi kerak.',
         'Qancha ko‘p o‘rgansak, shuncha ko‘p bilamiz.',
         'Bu an’ana bizning an’anamizga o‘xshaydi.'].join(' | '));
    ok(byId('ex10').items.every((i) => !i.free), 'ex10 is graded, not open');
    ok(/один из самых/.test(all('ex10', 4)[0]),
        'ex10 #4 uses the «один из самых» model the grammar teaches');
    ok(all('ex10', 4).length === 2, 'ex10 #4 accepts известных and популярных');
    ok(all('ex10', 7).length === 3 && all('ex10', 8).length === 3,
        'ex10 #7 and #8 accept all three opinion frames');
    ok(byId('ex10').items.every((i) => acc(i).length <= 3),
        'no translation is opened up to an unbounded list');

    /* ---- comprehension: the ONLY key the material supplies ---- */
    eq('the comprehension keys are the source key, verbatim',
        byId('truefalse').items.map((i) => i.answer).join(','),
        'Правда,Ложь,Правда,Ложь,Правда,Ложь,Правда,Правда,Ложь,Правда');
    ok(byId('truefalse').items.every((i) => i.options.join('|') === 'Правда|Ложь'),
        'the comprehension check offers Правда / Ложь');
    ok(!/Rost|Yolg/.test(JSON.stringify(byId('truefalse'))),
        'no Uzbek true/false labels reach the learner');
    eq('the ten statements are the source statements, verbatim',
        byId('truefalse').items.map((i) => i.q).join(' | '),
        ['Каждый народ имеет свою культуру и свои традиции.',
         'Традиции не передаются от родителей к детям.',
         'В нашей культуре важно уважать старших.',
         'В семье автора не любят семейные праздники.',
         'Перед праздником семья убирает дом и готовит разные блюда.',
         'На праздник мама обычно готовит только салаты.',
         'В праздник вся семья собирается за одним столом.',
         'Автор считает, что семейные традиции объединяют людей.',
         'Все традиции разных народов абсолютно одинаковые.',
         'Автор считает, что молодые люди должны знать традиции своего народа.'].join(' | '));
}

/* ------------------------------------------------------- 5. vocabulary */
{
    const VSRC = mainScript(fs.readFileSync(path.join(ROOT, 'paid-courses/a2-vocabulary.html'), 'utf8'));
    const all = literal(VSRC, 'vocabularyData').topics;
    const v = all.find((t) => t.id === 16);
    ok(!!v, 'vocabulary topic 16 exists');
    /* 70 rows listed, one of them an exact repeat — the deck is 69. */
    eq('69 unique cards', v.words.length, 69);
    eq('no exact duplicate card',
        new Set(v.words.map((w) => w.ru.toLowerCase() + '||' + w.uz.toLowerCase())).size, 69);
    eq('no repeated russian side either',
        new Set(v.words.map((w) => w.ru.toLowerCase())).size, 69);
    ok(v.words.every((w) => w.ru && w.ru.trim() && w.uz && w.uz.trim()),
        'no card has an empty side');
    eq('the deck opens on «культура»', v.words[0].ru + ' — ' + v.words[0].uz,
        'культура — madaniyat');
    eq('and closes on «уважать традиции»', v.words[68].ru + ' — ' + v.words[68].uz,
        'уважать традиции — an’analarni hurmat qilmoq');
    /* THE SOURCE REPEAT: «поколение» is listed at source #8 and #27. */
    eq('«поколение» is listed twice in the source and shipped once',
        v.words.filter((w) => w.ru === 'поколение').length, 1);
    /* DIFFERENT Russian units must NOT be collapsed. */
    [['гость', 'гости'],
     ['традиция', 'семейная традиция'],
     ['семейная традиция', 'национальная традиция'],
     ['праздновать', 'отмечать'],
     ['блюдо', 'традиционное блюдо'],
     ['музыка', 'народная музыка']]
        .forEach(([a, c]) => ok(v.words.some((w) => w.ru === a) && v.words.some((w) => w.ru === c),
            `«${a}» and «${c}» are both kept — distinct Russian units`));
    /* the six source sections, in source order */
    const idx = (ru) => v.words.findIndex((w) => w.ru === ru);
    [['культура', 'праздник'],
     ['праздник', 'семья'],
     ['семья', 'национальная кухня'],
     ['национальная кухня', 'национальная одежда'],
     ['национальная одежда', 'важный'],
     ['важный', 'В нашей культуре']]
        .forEach(([a, c]) => ok(idx(a) >= 0 && idx(c) > idx(a),
            `«${a}» comes before «${c}» — the source grouping is kept`));
    [['наследие', 'meros'], ['торжество', 'tantana'],
     ['молодёжь', 'yoshlar'], ['накрывать на стол', 'dasturxon yozmoq'],
     ['орнамент', 'naqsh'], ['ремесло', 'hunarmandchilik'],
     ['древний', 'qadimiy'], ['сохранять культуру', 'madaniyatni saqlamoq']]
        .forEach(([ru, uz]) => ok(v.words.some((w) => w.ru === ru && w.uz === uz),
            `the card "${ru}" is present with its source translation`));
    ok(/\b16:\s*69\b/.test(SRC), 'the course card advertises 69 words for topic 16');
    ok(!/\b16:\s*70\b/.test(SRC), 'and not the raw 70 listed rows');
    eq('topics 1-15 vocabulary unchanged',
        [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].map((id) => all.find((t) => t.id === id).words.length).join(','),
        '45,77,73,106,50,69,85,85,50,69,70,55,80,60,91');
    eq('sixteen vocabulary topics, every one of them stocked',
        all.filter((t) => t.words.length > 0).length, 16);
}

/* ------------------------------- 6. it renders, grades and completes */
{
    const blocks = [...SRC.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const pre = blocks.find((b) => /(let|var|const)\s+currentUser/.test(b) && !b.includes('const courseData'));
    const main = blocks.find((b) => b.includes('const courseData'));

    /* Ex3: the learner's own continuations, written as whole sentences and
       deliberately NOT the sample. #3 is a short one — the case the three-word
       minimum would fail if only the tail had been asked for. */
    const EX3 = [
        'Чем больше мы узнаём о культуре, тем больше мы её ценим.',
        'Чем больше мы путешествуем, тем больше друзей у нас появляется.',
        'Чем старше человек, тем мудрее.',
        'Чем больше мы читаем, тем лучше говорим по-русски.',
        'Чем лучше мы знаем традиции, тем легче понимаем людей.',
        'Чем больше людей участвует в празднике, тем веселее.',
        'Чем интереснее праздник, тем дольше его помнят.',
        'Чем больше мы говорим о культуре, тем лучше её понимаем.',
        'Чем больше мы изучаем историю, тем яснее наше будущее.',
        'Чем чаще мы встречаемся с семьёй, тем мы счастливее.'
    ];
    const answerFor = (g, it, i) => (g.id === 'ex3' ? EX3[i]
        : (Array.isArray(it.answer) ? it.answer[0] : it.answer));

    function boot() {
        const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
        const w = new JSDOM(SRC.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g, '<script></script>'),
            { url: 'https://uzdarus.uz/' + REL, runScripts: 'outside-only', pretendToBeVisual: true,
              virtualConsole: vc }).window;
        w.HTMLElement.prototype.scrollIntoView = function () {};
        w.__alerts = [];
        w.alert = function (m) { w.__alerts.push(String(m)); };
        w.confirm = () => true;
        w.eval('window.__claims=[];window.__safe=[];window.__loaded=[];window.currentUserId="u1";' +
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
        w.eval(main + '\n;window.__api={loadLesson:function(id){window.__loaded.push(id);return loadLesson(id);},' +
            'exData:getT1ExData,' +
            'setCompleted:function(v){completedTopics=v;},getCompleted:function(){return completedTopics;},' +
            'render:renderTopic1Exercises,complete:a2CompleteTopic,check:window.checkTopic1Exercises,' +
            'cd:courseData};');
        w.eval('window.currentUserId="u1";');
        return w;
    }
    const DONE = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];
    const w = boot();

    w.__api.setCompleted(DONE.slice());
    w.eval('currentTopicId=16;');
    w.__api.loadLesson(16);
    const D = w.document;

    ok(!!w.__api.exData(t16), 'the generic engine claims topic 16');
    eq('twelve steps exist in the hidden bridge', D.querySelectorAll('[data-t1-ex]').length, 12);
    /* ex1, ex3, ex4, ex5, ex7, ex10 are text inputs; ex9 is a builder, which
       also renders one hidden input per item. */
    eq('seventy text inputs render across the six input steps and the builder',
        D.querySelectorAll('[data-t1-input]').length, 70);
    const lesson = (D.getElementById('lessonContent') || D.body).textContent;
    ok(/один из самых известных праздников/.test(lesson),
        'the corrected grammar reaches the screen');
    ok(/Audio va tushunish savollari/.test(lesson), 'the lesson announces the listening step');

    let missing = 0;
    t16.topic16Exercises.exercises.forEach((g) => {
        (g.items || []).forEach((it, i) => {
            const key = g.id + '-' + i;
            if (g.type === 'choice') {
                const row = D.querySelector(`[data-t1-row="${key}"]`);
                const want = Array.isArray(it.answer) ? it.answer[0] : it.answer;
                const btn = row && [...row.querySelectorAll('.t1-opt')]
                    .find((b) => b.getAttribute('data-value') === want);
                if (btn) btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
                else missing++;
            } else {
                const inp = D.querySelector(`[data-t1-input="${key}"]`);
                if (inp) inp.value = answerFor(g, it, i); else missing++;
            }
        });
    });
    eq('every question is answerable in the DOM', missing, 0);

    return (async () => {
        await w.__api.check(16);
        const marked = D.querySelectorAll('.t1-opt.t1-ok').length
            + D.querySelectorAll('[data-t1-input].correct').length;
        const scoreText = (D.getElementById('scoreDisplay') || {}).textContent || '';
        ok(/\b110\s*\/\s*110\b/.test(scoreText),
            `a perfect paper is graded 110/110 (${scoreText.trim()})`);
        ok(marked >= 20, `the graded widgets mark themselves correct (${marked})`);

        /* ---------- THE FINAL TOPIC COMPLETES SAFELY ---------- */
        const loadedBefore = w.__loaded.length;
        await w.__api.complete(16);
        await new Promise((r) => setTimeout(r, 400));
        eq('exactly one completion claim', w.__claims.length, 1);
        eq('the claim names course A2', w.__claims[0].c, 'A2');
        eq('and it claims the EXERCISES half, not the whole topic',
            w.__claims[0].cm, 'exercises');
        eq('the claim names topic 16', w.__claims[0].t, 16);
        ok(w.__api.getCompleted().includes(16), 'the server answer is adopted');
        ok(w.__safe.every((p) => !('completedTopics' in p)),
            'no completion field went through the generic saver');
        ok(!/saveUserProgress\([^)]*completedTopics/.test(SRC),
            'topic 16 introduced no direct authoritative write');
        /* NO TOPIC 17 ANYWHERE */
        ok(!w.__loaded.slice(loadedBefore).includes(17), 'no loadLesson(17) was attempted');
        eq('currentTopicId was not advanced past the last topic',
            w.eval('typeof currentTopicId === "number" ? currentTopicId : null'), 16);
        ok(!w.__api.getCompleted().includes(17), 'topic 17 was never marked complete');
        ok(!w.__api.cd.topics.some((t) => t.id === 17), 'and no topic 17 was created');
        /* THE FINAL-TOPIC MESSAGE: the shared path used to promise topic 17. */
        {
            const msg = w.__alerts.join(' || ');
            ok(w.__alerts.length > 0, `the learner is told the topic is finished (${msg.slice(0, 90)})`);
            ok(!/17-mavzuni/.test(msg),
                'the completion message does NOT send the learner to a topic 17');
            ok(/barcha mavzularini tugatdingiz/.test(msg),
                'it congratulates them on finishing the whole course instead');
        }

        /* A REFUSED server save must not complete or unlock anything. */
        {
            const wf = boot();
            wf.eval('window.completeCourseComponent=async function(){throw new Error("offline");};' +
                    'window.completeCourseTopic=async function(){throw new Error("offline");};');
            wf.__api.setCompleted(DONE.slice());
            wf.eval('currentTopicId=16;');
            wf.__api.loadLesson(16);
            try { await wf.__api.complete(16); } catch (e) { /* surfaced to the learner */ }
            await new Promise((r) => setTimeout(r, 150));
            ok(!wf.__api.getCompleted().includes(16),
                'a failed server save leaves topic 16 incomplete');
            ok(!wf.__alerts.join(' ').includes('barcha mavzularini tugatdingiz'),
                'and no course-finished message is shown on a refused save');
            ok(!wf.__loaded.includes(17), 'and still nothing tries to open a topic 17');
        }

        /* ---------- 7. THE STEPPING SESSION ---------- */
        const w2 = boot();
        const D2 = w2.document;
        w2.__api.setCompleted(DONE.slice());
        w2.eval('currentTopicId=16;');
        w2.__api.loadLesson(16);
        w2.__api.render(16);
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
        eq('the first step is announced in Uzbek', stepText().trim(), 'Mashq 1 / 10');
        eq('exactly one exercise is on screen', titlesOnScreen(), 1);
        ok(/Taqqoslash darajasini to‘g‘ri qo‘ying/.test(host().textContent), 'step 1 is exercise 1');
        ok(!host().querySelector('audio'), 'the audio player is NOT on screen yet');

        const groups = t16.topic16Exercises.exercises;
        const seen = [];
        let multiOnScreen = 0, builderFilled = 0;
        for (let i = 0; i < groups.length; i++) {
            seen.push(stepText().trim());
            if (titlesOnScreen() > 1) multiOnScreen++;
            const g = groups[i];
            (g.items || []).forEach((it, k) => {
                const key = g.id + '-' + k;
                const row = host().querySelector(`[data-t1-row="${key}"]`);
                if (row) {
                    const want = Array.isArray(it.answer) ? it.answer[0] : it.answer;
                    const b2 = [...row.querySelectorAll('.t1-opt')]
                        .find((x) => x.getAttribute('data-value') === want);
                    if (b2) b2.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
                }
                /* The same click against the SHARED markup. Looking only for the
                   topic-1 row meant a course-exercise-ui topic was never answered:
                   the step scored zero and advanced anyway, because A2 had no pass
                   gate. A2 now enforces the platform 80% rule. */
                const rowB = host().querySelector(`[data-b2h-row="${key}"]`);
                if (rowB) {
                    const want2 = Array.isArray(it.answer) ? it.answer[0] : it.answer;
                    const b2B = [...rowB.querySelectorAll('.b2h-opt')]
                        .find((x) => x.getAttribute('data-value') === want2);
                    if (b2B) b2B.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
                }
                if (g.type === 'builder') {
                    /* A builder is graded from the CARDS the learner placed, so
                       the walk must actually place them. */
                    w2.UzSentenceBuilder.write(host(), key, it.answer[0]);
                    if (w2.UzSentenceBuilder.read(host(), key).trim()) builderFilled++;
                    return;
                }
                /* Fill BOTH input markups, then let the host's own writeAnswer —
                   the function draft-restore uses — handle any type the two
                   selectors miss. Without this the step scores zero, which used
                   to advance anyway and now correctly does not. */
                const wantI = answerFor(g, it, k);
                ['t1', 'b2h'].forEach((ns) => {
                    const inp = host().querySelector(`[data-${ns}-input="${key}"]`);
                    if (inp) {
                        inp.value = wantI;
                        inp.dispatchEvent(new w2.Event('input', { bubbles: true }));
                    }
                });
                try {
                    const UI = w2.UzExerciseUI;
                    if (UI && typeof UI.writeAnswer === 'function') {
                        UI.writeAnswer(host(), key, wantI, g, it);
                    }
                } catch (e) { /* left to the selectors above */ }
            });
            if (g.id === 'ex9') {
                ok(!!host().querySelector('.uzb'), 'ex9 renders the shared word-card builder');
                eq('every builder card row was assembled', builderFilled, 10);
            }
            if (g.id === 'audio') {
                const foot = [...D2.querySelectorAll('.uz-foot button, .uz-btn')]
                    .map((t) => t.textContent.trim());
                const audioEl = host().querySelector('audio');
                ok(!!audioEl, 'the audio step renders a player');
                ok(audioEl.hasAttribute('controls'), 'the player has controls');
                ok(!audioEl.hasAttribute('autoplay'), 'it does not autoplay');
                eq('the player preloads metadata only',
                    audioEl.getAttribute('preload'), 'metadata');
                const played = decodeURIComponent(
                    audioEl.querySelector('source').getAttribute('src') || '');
                ok(/audios\/А2 16 урок\.mp3$/.test(played),
                    `the player points at the A2 lesson 16 recording (${played})`);
                ok(!/Б2/.test(played), 'and not at a Б2 recording');
                ok(!/Каждый народ имеет/.test(host().textContent),
                    'the comprehension statements are NOT on the audio step');
                eq('the audio step offers exactly one action', foot.length, 1);
                ok(/Savollarga/.test(foot[0] || ''), 'that action moves on to the questions');
            }
            if (g.id === 'truefalse') {
                ok(/Каждый народ имеет/.test(host().textContent),
                    'the comprehension questions are on their own step');
                ok(!host().querySelector('audio'),
                    'the player is not repeated on the questions step');
            }
            const check = [...D2.querySelectorAll('.uz-foot button, .uz-btn')]
                .find((b2) => /tekshirish/i.test(b2.textContent));
            if (check) check.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
            const next = [...D2.querySelectorAll('.uz-foot button, .uz-btn')]
                .find((b2) => /keyingi mashq|yakunlash|savollarga/i.test(b2.textContent));
            if (!next) break;
            next.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
        }
        eq('never more than one exercise on screen', multiOnScreen, 0);
        eq('every one of the twelve steps was reached', seen.length, 12);
        eq('the cursor numbers the drills and names the rest', seen.join(' | '),
            [...Array.from({ length: 10 }, (_, i) => `Mashq ${i + 1} / 10`),
             'Audio', 'Audio bo‘yicha savollar'].join(' | '));

        /* ---------- 8. no second engine was written for topic 16 ---------- */
        ok(!/topic16(Active|Step|Custom|Navigation|Renderer|State|Wizard|Checker|Modal|Storage|Normalizer)/i.test(SRC),
            'topic 16 introduced no bespoke step/state/renderer machinery');
        ok(/window\.A2Host\.mountPractice/.test(SRC),
            'topic 16 goes through the shared A2 practice mount');
        eq('exactly one practice mount in the page',
            (SRC.match(/A2Host\.mountPractice\(/g) || []).length, 1);
        {
            const a = SRC.indexOf('topic16Exercises:');
            ok(!/function\s*\(|=>/.test(SRC.slice(a, a + 60000).split('\n')[0]),
                'the topic 16 payload is data, not logic');
        }
        /* THE GENERIC FIX: the next topic is read from the data, not computed. */
        ok(/var nextTopic = courseData\.topics\.find\(/.test(SRC),
            'the completion message resolves the next topic from courseData');
        ok(!/\(topicId \+ 1\) \+ "-mavzuni/.test(SRC),
            'and no longer assumes topicId + 1 exists');

        console.log('='.repeat(60));
        if (fail) {
            console.log(`  ❌ A2 TOPIC 16: ${fail} failed / ${pass + fail}\n`);
            failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
            console.log('='.repeat(60) + '\n');
            process.exit(1);
        }
        console.log(`  ✅ A2 TOPIC 16: ${pass}/${pass} passed`);
        console.log('='.repeat(60) + '\n');
    })();
}
