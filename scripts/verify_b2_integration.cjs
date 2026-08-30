#!/usr/bin/env node
/**
 * verify_b2_integration.cjs — proves the B2 pages are wired to the shared
 * Exercise Session Engine correctly, and that nothing legacy was broken.
 *
 * The runtime behaviour of the host is covered by verify_b2_host.cjs; this
 * file covers the part that only the real pages can answer: are the scripts
 * loaded, is dispatch shape-based, is there exactly ONE result screen, are
 * the demo locks right, and is the legacy path still intact.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) pass++; else { fail++; failures.push(l); } };

const PAGES = [
    { file: 'paid-courses/b2-course.html', prefix: '../', label: 'paid' },
    { file: 'b2-demo.html', prefix: './', label: 'demo' }
];

console.log('\n=== B2 PRODUCTION INTEGRATION ===\n');

/* ------------------------------------------------ assets exist */
['exercise-session.js', 'b2-host.js', 'b2-lesson-data.js'].forEach(f => {
    ok(fs.existsSync(path.join(ROOT, f)), `asset ${f} exists at repo root`);
});

for (const p of PAGES) {
    const abs = path.join(ROOT, p.file);
    const raw = fs.readFileSync(abs);
    const s = raw.toString('utf8');
    const T = p.label;

    /* --------------------------------------- 1. scripts loaded, right depth */
    ['exercise-session.js', 'b2-host.js', 'b2-lesson-data.js'].forEach(f => {
        ok(s.includes(`src="${p.prefix}${f}"`), `${T} loads ${p.prefix}${f}`);
        ok(s.split(`src="${p.prefix}${f}"`).length === 2, `${T} loads ${f} exactly once`);
        /* the src must actually resolve from the page's own directory */
        const resolved = path.resolve(path.dirname(abs), p.prefix + f);
        ok(fs.existsSync(resolved), `${T} ${f} path resolves on disk`);
    });
    const engIdx = s.indexOf('exercise-session.js');
    const hostIdx = s.indexOf('b2-host.js');
    const dataIdx = s.indexOf('b2-lesson-data.js');
    ok(engIdx < hostIdx && hostIdx < dataIdx, `${T} engine loads before host before data`);

    /* --------------------------------------- 2. shape-based dispatch */
    ok(/function b2ExerciseData/.test(s), `${T} defines b2ExerciseData`);
    ok(/Array\.isArray\(x\.exercises\)/.test(s), `${T} claims a topic only by exercises[] shape`);
    ok(/function mountB2Practice/.test(s), `${T} defines mountB2Practice`);
    ok(/const b2Ex = /.test(s), `${T} loadTopic computes the dispatch flag`);
    ok(/if \(b2Ex\) \{\s*[\r\n]+\s*mountB2Practice\(topicId\);/.test(s),
        `${T} loadTopic mounts the session for exercise-shaped topics`);
    ok(!/if\s*\(\s*topicId\s*===\s*1\s*\)/.test(s), `${T} contains no hard-coded Lesson-1 branch`);

    /* --------------------------------------- 3. legacy path preserved */
    ok(/topic\.quiz && topic\.quiz\.mcQuestions\.length > 0 \? renderQuiz/.test(s),
        `${T} legacy multiple-choice still rendered for legacy topics`);
    ok(/topic\.quiz && topic\.quiz\.blankQuestions\.length > 0 \? renderBlankTest/.test(s),
        `${T} legacy blank test preserved`);
    ok(/topic\.quiz && topic\.quiz\.matchingGame \? renderMatchingGame/.test(s),
        `${T} legacy matching game preserved`);
    ['initQuiz', 'initBlankTest', 'initMatchingGame', 'renderQuiz', 'renderBlankTest',
     'renderMatchingGame', 'saveProgress', 'updateProgressBar', 'renderTopics',
     'generateLockedTopics'].forEach(fn => {
        ok(new RegExp('function ' + fn + '\\s*\\(').test(s), `${T} legacy function ${fn} still defined`);
    });
    ok(/mcQuestions:\s*\[/.test(s), `${T} legacy quiz DATA left in place (nothing deleted)`);

    /* --------------------------------------- 4. exactly ONE result screen */
    const resultDivs = (s.match(/id="quizResults"/g) || []).length;
    ok(resultDivs === 2, `${T} #quizResults declared in both branches only (${resultDivs})`);
    ok(/\$\{b2Ex \? `/.test(s), `${T} the two branches are mutually exclusive`);
    ok(/<div class="quiz-score">/.test(s) || /class="quiz-score"/.test(s),
        `${T} host fills the page's own .quiz-score`);
    ok(!/uz-result|uz-final|new-result-screen/.test(s), `${T} no second result screen introduced`);

    /* --------------------------------------- 5. one storage mechanism */
    ok(/function b2SessionDraftSave/.test(s), `${T} session draft goes through the page's store`);
    ok(/typeof _b2QuizDraftKey === 'function'\) return _b2QuizDraftKey\(topicId\)/.test(s),
        `${T} reuses the existing draft key when the page has one`);
    ok(/window\.saveQuizResult\(currentUserId, topicId, \{ draft: draft \}, 'B2'\)/.test(s),
        `${T} draft syncs to the same Firestore field as before`);

    /* --------------------------------------- 6. completion path */
    ok(/!topic\.isSubscriptionLocked && !b2Ex \?/.test(s),
        `${T} legacy "finish topic" button suppressed for session topics (one completion path)`);
    /* THE PAID PAGE routes completion into the shared lifecycle, which saves
       the attempt and AWAITS it before reporting the exercises half. It used to
       call saveProgress(id) directly, claiming the whole topic — a route that
       finalises only what the component record earns and so could never append.
       b2-demo.html has no server behind it and keeps its own flow, so the two
       are asserted apart rather than one bent to fit the other. */
    if (p.label === 'paid') {
        ok(/completeTopic: function \(id, r\)[\s\S]{0,900}b2FinishExercises\(id, r\)/.test(s),
            `${T} completion routes through the shared exercise lifecycle`);
        ok(/function b2FinishExercises/.test(s),
            `${T} defines that lifecycle completion on the page`);
    } else {
        ok(/completeTopic: function \(id, r\)[\s\S]{0,400}saveProgress\(id\)/.test(s),
            `${T} completion routes through the page's existing saveProgress`);
    }
    ok(!/passPercent:\s*\d+/.test(s),
        `${T} the page does not override the host's threshold`);
    ok(/b2SaveTopicResult|b2LoadTopicResult/.test(s), `${T} stores the last attempt result`);
    ok(/isCompleted: function/.test(s), `${T} tells the host whether the topic is finished`);

    /* --------------------------------------- 7. file hygiene */
    ok(raw.includes(Buffer.from('\r\n')), `${T} CRLF line endings preserved`);
    const lf = (s.match(/(?<!\r)\n/g) || []).length;
    ok(lf === 0, `${T} no stray LF-only lines introduced (${lf})`);
}

/* ------------------------------------------------ demo access rules */
{
    const demo = fs.readFileSync(path.join(ROOT, 'b2-demo.html'), 'utf8');
    const paid = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-course.html'), 'utf8');
    ok(/var B2_DEMO_MODE = true;/.test(demo), 'demo declares itself as the demo build');
    ok(/var B2_DEMO_MODE = false;/.test(paid), 'paid build is not in demo mode');
    /* Demo opens topics 1-3, and only where a lesson is actually authored, so
       it never shows an empty lesson. Paid is unaffected: its flag is false. */
    ok(/var locked = B2_DEMO_MODE && t\.id > 3;/.test(demo),
        'demo opens topics 1-3');
    ok(/var locked = B2_DEMO_MODE && t\.id > 3;/.test(paid),
        'paid build applies the same rule, and its flag leaves everything open');
}

/* ------------------------------------------------ engine stays generic */
{
    const eng = fs.readFileSync(path.join(ROOT, 'exercise-session.js'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    ok(!/\bB2\b|b2Host|B2_LESSON_DATA/i.test(eng), 'engine has no B2 knowledge');
    ok(!/quizResults|saveProgress|firebase/i.test(eng), 'engine has no page/persistence knowledge');
}

/* ------------------------------------------------ A2 untouched */
{
    /* A2 and B2 now deliberately share the presentation stack, so "B2 touched
       no A2 file" is no longer the invariant — sharing is. What still must hold
       is that the shared modules carry no course-specific policy, and that each
       course keeps its own rules in its own host. */
    const SHARED = fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8');
    const bare = SHARED.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    ok(!/\bA2\b|\bB2\b|A2Host|B2Host|passScore|PASS_PERCENT|stepGate/.test(bare),
        'the shared exercise UI carries no course name and no course policy');
    ok(/PASS_PERCENT = 80;/.test(fs.readFileSync(path.join(ROOT, 'b2-host.js'), 'utf8')),
        'B2 keeps its lesson threshold in its own host');
    const a2bare = fs.readFileSync(path.join(ROOT, 'a2-host.js'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    /* A2 NOW DECLARES THE SAME LESSON GATE. This asserted the opposite while
       B2 was the only course with one; the 80% rule is platform-wide, and each
       host still owns its own copy rather than the shared UI carrying policy.
       What must stay true is that A2 does NOT invent a private rule: it uses
       the shared passScore hook, not a bespoke stepGate. */
    ok(/PASS_PERCENT = 80;/.test(a2bare), 'A2 declares the platform 80% lesson gate');
    ok(/passScore: PASS_PERCENT/.test(a2bare),
        'through the shared passScore hook, from its own constant');
    ok(!/stepGate/.test(a2bare), 'and invents no private gate of its own');
}

/* ------------------------------------------------ 16-topic syllabus */
{
    const w = {};
    // eslint-disable-next-line no-new-func
    new Function('window', fs.readFileSync(path.join(ROOT, 'b2-topics.js'), 'utf8'))(w);
    const T = w.B2_TOPICS;
    const EXPECTED = [
        'Сложноподчинённые предложения', 'Причастие', 'Деепричастие',
        'Прямая и косвенная речь', 'Условные предложения', 'Сравнительные конструкции',
        'Вид глагола', 'Глаголы движения с приставками', 'Модальные конструкции',
        'Безличные предложения', 'Отглагольные существительные', 'Пассивные конструкции',
        'Предлоги и управление', 'Средства аргументации', 'Стилистика речи',
        'Повторение сложных конструкций B2'
    ];
    ok(Array.isArray(T) && T.length === 16, `syllabus has 16 topics (${T && T.length})`);
    EXPECTED.forEach((title, i) => {
        ok(T[i] && T[i].title === title, `topic ${i + 1} is "${title}"`);
        ok(T[i] && T[i].id === i + 1, `topic ${i + 1} has id ${i + 1}`);
    });
    ok(T.every(t => t.grammatika && t.grammatika.length > 10), 'every topic has a Grammatika line');
    ok(T.every(t => t.konstruksiya && t.konstruksiya.length > 5), 'every topic has a Konstruksiya line');
    ok(T.every(t => t.muloqot && t.muloqot.length > 10), 'every topic has a Muloqot line');
    ok(new Set(T.map(t => t.title)).size === 16, 'no duplicate topic titles');
}

/* ------------------------------------------------ Lesson 1 grammar */
{
    const w = {};
    // eslint-disable-next-line no-new-func
    new Function('window', fs.readFileSync(path.join(ROOT, 'b2-lesson-data.js'), 'utf8'))(w);
    const t1 = w.B2_LESSON_DATA.topics[0];
    const g = t1.grammar || '';
    ok(g.length > 4000, `Lesson 1 grammar is a full lesson, not a note (${g.length} chars)`);
    ok((g.match(/<h4>/g) || []).length >= 8, 'grammar has at least 8 sections');
    ok((g.match(/<table/g) || []).length >= 3, 'grammar has at least 3 tables');
    ok(/b2g-scheme/.test(g), 'grammar includes a visual schema');
    ok(/b2g-err/.test(g), 'grammar includes a common-mistakes table');
    ok(/b2g-check/.test(g), 'grammar includes a self-check list');
    ok(/b2g-tip|b2g-warn/.test(g), 'grammar includes tips / warnings');
    ['что', 'чтобы', 'если', 'когда', 'потому что', 'поэтому', 'хотя', 'несмотря на то'].forEach(c => {
        ok(g.includes(c), `grammar explains the conjunction "${c}" the exercises test`);
    });
    ok(t1.exercises.length === 10, 'Lesson 1 still has all 10 exercises');
    const items = t1.exercises.reduce((n, x) => n + x.items.length, 0);
    ok(items === 100, `Lesson 1 still has all 100 items (${items})`);
}

/* ------------------------------------------------ host rules */
{
    const host = fs.readFileSync(path.join(ROOT, 'b2-host.js'), 'utf8');
    const SHARED_UI = fs.readFileSync(path.join(ROOT, 'course-exercise-ui.js'), 'utf8');
    /* 80 is the platform-wide LESSON rule, shared by A1, A2, B1 and B2. It was
       85 while B2 was the only course with a per-exercise gate at all. Final
       exams keep their own, separate, contract. */
    ok(/PASS_PERCENT = 80;/.test(host), 'host defines the 80% lesson threshold');
    ok(!/PASS_PERCENT = 85;/.test(host), 'and no stale 85% threshold survives');
    ok(/function stepGate/.test(host), 'host implements the per-exercise gate');
    ok(/function buildResultsHtml/.test(host), 'host owns ONE results builder');
    ok((host.match(/function buildResultsHtml/g) || []).length === 1, 'exactly one results builder');
    /* COMPLETION LIVES IN ONE PLACE FOR ALL FOUR COURSES. The results screen
       reports the marks; topic-completion.js renders the single button that
       finishes the topic, so B2 cannot drift away from A1, A2 and B1 again. */
    const TC = fs.readFileSync(path.join(ROOT, 'topic-completion.js'), 'utf8');
    ok(!/data-b2h-act="complete"/.test(SHARED_UI), 'the results screen draws no completion button of its own');
    ok(/data-uztc="finish"/.test(TC.replace(/\s+/g, ' ')) || /'finish'/.test(TC),
        'the shared contract owns the completion button');
    ok(/Завершить тему и перейти дальше/.test(TC), 'with the label the product specifies');
    ok(/UzTopicCompletion/.test(host), 'the B2 host presses that shared contract');
    ok(/b2h-slot/.test(SHARED_UI), 'the shared UI renders inline answer slots');
    ok(/@keyframes b2hPop/.test(SHARED_UI), 'the shared UI ships the selection animation');
    ok(/b2g-t|b2g-scheme/.test(SHARED_UI), 'the shared UI styles the grammar lesson');
    /* the "earn your answers" flow: configured by the host, ruled by the engine */
    ok(/passScore: api\.passPercent/.test(host), 'host passes its threshold as passScore');
    ok(/allowAnswerReview: true/.test(host), 'host enables answer review');
    ok(/requireConfirmationBeforeAnswers: true/.test(host), 'host requires confirmation first');
    ok(/min: passPercent/.test(host), 'host reports the threshold so the engine can display it');
    ok(!/Javoblarni ko/.test(host), 'the confirmation text is NOT duplicated in the host');
    ok(!/uz-ask|askConfirm/.test(host), 'the dialog is NOT reimplemented in the host');

    const eng = fs.readFileSync(path.join(ROOT, 'exercise-session.js'), 'utf8');
    ok(/DEFAULT_CONFIRM/.test(eng), 'the confirmation flow lives in the engine');
    ok(/allowAnswerReview/.test(eng), 'allowAnswerReview is an engine-level setting');
    ok(/requireConfirmationBeforeAnswers/.test(eng), 'requireConfirmation is an engine-level setting');
    ok(!/confirm\(|alert\(/.test(eng.replace(/\/\*[\s\S]*?\*\//g, '')),
        'no native confirm() / alert() anywhere in the engine');
    ok(/cfg\.stepGate/.test(eng), 'engine exposes a generic gate hook');
    ok(/cfg\.renderSummary/.test(eng), 'engine exposes a generic summary hook');
    ok(!/PASS_PERCENT|passPercent/.test(eng), 'the threshold does not leak into the engine');
}

/* ------------------------------------------------ RUNTIME: the page's own builder */
{
    /* Static checks prove the wiring is written; this proves it RUNS. The
       page's real buildB2Topics / b2ExerciseData / b2SoonHtml are lifted out
       of the inline script and executed against the real modules. */
    const { JSDOM } = require('jsdom');

    function runBuilder(file, expectDemo) {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
        const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
        const w = dom.window;
        /* The coming-soon screen is rendered by the shared UzExerciseUI
           component, so the sandbox needs it exactly as the page does. */
        ['shared-normalizer.js', 'sentence-builder.js', 'course-exercise-ui.js',
         'b2-topics.js', 'b2-lesson-data.js']
            .forEach(f => w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

        const grab = (name) => {
            const i = src.indexOf('function ' + name + '(');
            if (i < 0) throw new Error('missing ' + name + ' in ' + file);
            let depth = 0, started = false;
            for (let k = src.indexOf('{', i); k < src.length; k++) {
                if (src[k] === '{') { depth++; started = true; }
                else if (src[k] === '}') { depth--; if (started && depth === 0) return src.slice(i, k + 1); }
            }
            throw new Error('unbalanced ' + name);
        };
        /* Now a function delegating to the shared UzExerciseUI component. */
        const soon = grab('b2SoonHtml');
        const flag = src.match(/var B2_DEMO_MODE = (true|false);/)[0];

        w.eval([
            flag, soon,
            'var B2_TOPICS = window.B2_TOPICS;',
            'var B2_TOPIC_DESCRIPTION = window.B2_TOPIC_DESCRIPTION;',
            grab('b2ExerciseData'), grab('buildB2Topics'),
            'window.__topics = buildB2Topics();'
        ].join('\n'));
        return w.__topics;
    }

    [['paid-courses/b2-course.html', false], ['b2-demo.html', true]].forEach(([file, demo]) => {
        const L = demo ? 'demo' : 'paid';
        let topics = null, err = null;
        try { topics = runBuilder(file, demo); } catch (e) { err = e; }
        ok(!err, `${L} buildB2Topics() runs without error (${err ? err.message : 'ok'})`);
        if (!topics) return;

        ok(topics.length === 16, `${L} builder produces 16 topics (${topics.length})`);
        ok(topics[0].title === 'Сложноподчинённые предложения', `${L} topic 1 is the new title`);
        ok(topics[15].title === 'Повторение сложных конструкций B2', `${L} topic 16 is the review topic`);
        ok(topics.every(t => t.grammatika && t.konstruksiya && t.muloqot),
            `${L} every topic carries all three descriptors`);
        ok(topics.every(t => t.quiz && Array.isArray(t.quiz.mcQuestions)),
            `${L} legacy quiz shape kept on every topic (no renderer breaks)`);
        ok(topics[0].grammar && topics[0].grammar.length > 4000,
            `${L} topic 1 gets the full grammar lesson (${topics[0].grammar.length} chars)`);
        /* Authored lessons are discovered from B2_LESSON_DATA, never hardcoded,
           so this grows by itself as lessons are written. */
        const authored = topics.filter(t => !!t.grammar).map(t => t.id);
        ok(authored.length >= 2 && authored[0] === 1 && authored[1] === 2,
            `${L} lessons 1 and 2 are authored (authored: ${authored.join(',')})`);
        ok(topics[1].grammar && topics[1].grammar.length > 4000,
            `${L} topic 2 gets the full grammar lesson (${topics[1].grammar.length} chars)`);
        ok(topics.filter(t => authored.indexOf(t.id) === -1).every(t => !t.grammar),
            `${L} unauthored topics carry no grammar`);
        /* Unauthored topics now render the SHARED coming-soon screen (the same
           one A2 uses), with its three navigation buttons — not a bare panel. */
        ok(topics.filter(t => authored.indexOf(t.id) === -1)
                 .every(t => /tez orada qo/.test(t.content)),
            `${L} unauthored topics show the shared "coming soon" screen`);
        ok(topics.filter(t => authored.indexOf(t.id) === -1)
                 .every(t => (t.content.match(/uz-soon-btn/g) || []).length === 3),
            `${L} the coming-soon screen offers all three navigation buttons`);
        ok(topics.filter(t => authored.indexOf(t.id) !== -1).every(t => t.content === ''),
            `${L} authored topics show their lesson, not the placeholder`);
        ok(/Grammatika:/.test(topics[0].description) && /Muloqot:/.test(topics[0].description),
            `${L} legacy one-line description still generated`);

        if (demo) {
            ok(topics[0].isLocked === false, 'demo topic 1 is UNLOCKED');
            ok(topics[0].isSubscriptionLocked === false, 'demo topic 1 is not subscription-locked');
            ok(topics[1].isLocked === false, 'demo topic 2 is UNLOCKED');
            ok(topics[1].isSubscriptionLocked === false, 'demo topic 2 is not subscription-locked');
            /* the paywall itself is untouched: everything past the demo window
               stays locked, and so does any topic without an authored lesson */
            ok(topics.filter(t => t.id > 3).every(t => t.isLocked === true),
                'demo topics 4-16 are ALL locked');
            ok(topics.filter(t => t.id > 3).every(t => t.isSubscriptionLocked === true),
                'demo topics 4-16 are subscription-locked');
            ok(topics.find(t => t.id === 3).isLocked === false, 'demo topic 3 is UNLOCKED');
        } else {
            ok(topics.every(t => t.isLocked === false), 'paid topics are all unlocked');
        }
    });
}


/* ------------------------------------------------------- GENDER FAIRNESS
 * When a learner writes a sentence about THEMSELVES from a gender-neutral cue,
 * a woman's fully consistent sentence is exactly as correct as a man's, so the
 * scorer must accept both. Checked across EVERY authored B2 topic as a semantic
 * rule, so a newly authored lesson inherits the protection automatically.
 *
 * Deliberately NOT demanded:
 *   - a form the PROMPT already supplies — the learner is copying given source
 *     material, not describing themselves (Topic 2's error-correction rows and
 *     Topic 1's builder source sentences are of this kind);
 *   - a form belonging to a different subject — «Пока я читал, сестра смотрела
 *     телевизор» is correct and must never be "corrected";
 *   - multiple-choice groups, where the offered options fix what can be chosen.
 *
 * JS \b is ASCII-only and never fires between a Cyrillic letter and a space,
 * so every boundary below is written with explicit delimiters.
 */
{
    const { JSDOM } = require('jsdom');
    const gw = new JSDOM('<body></body>', { runScripts: 'outside-only' }).window;
    ['shared-normalizer.js', 'sentence-builder.js', 'course-exercise-ui.js', 'b2-lesson-data.js']
        .forEach(f => gw.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    const UI = gw.UzExerciseUI;

    const IRREG = { 'шёл': 'шла', 'пошёл': 'пошла', 'пришёл': 'пришла', 'ушёл': 'ушла',
        'вышел': 'вышла', 'зашёл': 'зашла', 'подошёл': 'подошла', 'отошёл': 'отошла',
        'нашёл': 'нашла', 'перешёл': 'перешла', 'смог': 'смогла', 'мог': 'могла',
        'был': 'была', 'вынужден': 'вынуждена', 'должен': 'должна', 'рад': 'рада',
        'болен': 'больна', 'готов': 'готова',
        /* emphatic pronouns and short adjectives agree too — feminising the
           verb but leaving «сам» yields «Я смогла … сам», which is not
           Russian, and the rule would then demand an invalid sentence. */
        'сам': 'сама', 'один': 'одна', 'занят': 'занята', 'свободен': 'свободна' };
    const OTHER = ['ты', 'он', 'она', 'оно', 'мы', 'вы', 'они', 'кто'];
    const wordsOf = (x) => String(x).toLowerCase().replace(/[«»"„”()]/g, ' ')
        .split(/[\s,.!?;:—–-]+/).filter(Boolean);
    const isMasc = (t) => IRREG[t] !== undefined
        || (!/^[а-яё]{2,}(ла|лась)$/.test(t) && /^[а-яё]{2,}(л|лся)$/.test(t));
    const femOf = (t) => IRREG[t] || (/лся$/.test(t) ? t.replace(/лся$/, 'лась') : t + 'а');
    const feminise = (sentence) => {
        let changed = 0;
        const text = String(sentence).split(/([,;])/).map(chunk => {
            if (/^[,;]$/.test(chunk)) return chunk;
            const ws = wordsOf(chunk);
            if (!ws.includes('я') || ws.some(t => OTHER.includes(t))) return chunk;
            return chunk.replace(/[А-Яа-яЁё]+/g, word => {
                const low = word.toLowerCase();
                if (!isMasc(low)) return word;
                changed++;
                const f = femOf(low);
                return word[0] === word[0].toUpperCase() ? f[0].toUpperCase() + f.slice(1) : f;
            });
        }).join('');
        return { text, changed };
    };
    /* the same subject must not carry both genders */
    const mixed = (sentence) => {
        let m = false, f = false;
        String(sentence).split(/[,;]/).forEach(clause => {
            const ws = wordsOf(clause);
            if (!ws.includes('я') || ws.some(t => OTHER.includes(t))) return;
            ws.forEach(t => {
                if (isMasc(t)) m = true;
                else if (IRREG[Object.keys(IRREG).find(k => IRREG[k] === t)] !== undefined
                         || /^[а-яё]{2,}(ла|лась)$/.test(t)) f = true;
            });
        });
        return m && f;
    };

    let examined = 0, refused = 0, mixedAccepted = 0;
    gw.B2_LESSON_DATA.topics.forEach(L => (L.exercises || []).forEach(g => {
        if (g.type === 'choice') return;
        (g.items || []).forEach((it, i) => {
            if (it.free === true || it.answer == null) return;
            const acc = (Array.isArray(it.answer) ? it.answer : [it.answer]).map(String);
            const prompt = String(it.q).toLowerCase();
            acc.forEach(canon => {
                const { text: fem, changed } = feminise(canon);
                if (!changed || fem === canon) return;
                if (wordsOf(canon).some(t => isMasc(t) && prompt.indexOf(t) !== -1)) return;
                examined++;
                if (!UI.matchItem(it, fem)) {
                    refused++;
                    if (refused <= 6) failures.push(`T${L.id} ${g.id}#${i + 1}: a woman's sentence «${fem.slice(0, 44)}» is refused`);
                }
            });
            /* and no accepted answer may itself mix genders for one «я» */
            acc.forEach(a => { if (mixed(a)) { mixedAccepted++; failures.push(`T${L.id} ${g.id}#${i + 1}: MIXED-gender accepted «${a.slice(0, 44)}»`); } });
        });
    }));
    if (refused) fail += Math.min(refused, 6);
    if (mixedAccepted) fail += mixedAccepted;
    ok(examined > 50, `gender-fairness rule examined the course (${examined} gendered answers)`);
    ok(refused === 0, `every gender-neutral «я» answer also accepts the feminine form (${refused} refused)`);
    ok(mixedAccepted === 0, `no accepted answer mixes genders for one «я» (${mixedAccepted})`);
}


/* ------------------------------------------------- PROGRESSION AUTHORITY
 * A1 has asserted since its own hardening that saveProgressToFirebase() AWAITS
 * the server and adopts the array the server returns. B2 had no equivalent
 * guard: a checkpoint negative control replaced the awaited
 * completeCourseTopic() call with a localStorage read and every B2 suite still
 * passed. The product was correct — the tests simply were not watching, so the
 * guard is added here rather than left to a scratch audit script.
 *
 * localStorage may MIRROR progress for offline display; it must never be the
 * thing that decides a topic is complete. */
{
    const paidSrc = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-course.html'), 'utf8');
    const at = paidSrc.indexOf('async function saveProgress');
    ok(at > -1, 'B2 exposes saveProgress()');
    /* the function body, bounded by its own braces */
    let depth = 0, start = paidSrc.indexOf('{', at), end = -1;
    for (let i = start; i < paidSrc.length; i++) {
        if (paidSrc[i] === '{') depth++;
        else if (paidSrc[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = paidSrc.slice(at, end + 1);

    /* THE ROUTE CHANGED; THE PROPERTY DID NOT. saveProgress reports the
       EXERCISES HALF rather than claiming the topic, because complete-topic
       finalises only what the component record earns. What still has to hold
       is that the server is awaited and its answer adopted, never assumed. */
    ok(/const ack = await window\.completeCourseComponent\(B2_COURSE, topicId, 'exercises'\)/.test(body),
        'B2 saveProgress reports the exercises half');
    ok(/const authoritative = ack\.completedTopics;/.test(body),
        'B2 saveProgress AWAITS the server for its authoritative value');
    ok(!/const authoritative\s*=\s*JSON\.parse\(\s*localStorage/.test(body),
        'the authoritative value never comes from localStorage');
    ok(/!Array\.isArray\(ack\.completedTopics\)[\s\S]{0,120}return false/.test(body),
        'a refused or malformed server answer reports failure instead of completing');
    ok(/ack\.components\.exercisesCompleted !== true/.test(body),
        'and a reply that does not confirm the half is not a verdict');

    /* the in-memory array is adopted only AFTER the server answered */
    const awaitAt = body.indexOf('await window.completeCourseComponent');
    const applyAt = body.indexOf('b2ApplyCompletedArray(authoritative)');
    ok(awaitAt > 0 && applyAt > awaitAt,
        'completion is applied only after the server accepted the claim');

    /* every localStorage use in the body must be a mirror, never a source */
    const reads = body.match(/localStorage\.getItem/g) || [];
    ok(reads.length === 0,
        `saveProgress never READS client storage (${reads.length} reads found)`);
    ok(/localStorage\.setItem\(b2LocalKey\(\), JSON\.stringify\(authoritative\)\)/.test(body),
        'client storage is written from the server answer — a mirror, not a source');

    /* and a server failure must leave the topic incomplete */
    ok(/catch \(error\)[\s\S]{0,140}return false;/.test(body),
        'a thrown server error returns false rather than completing the topic');
}


/* ------------------------------------------------- RAW GRAMMAR MARKUP
 * Two authored lessons shipped a closing </p> with no opening <p>. The
 * browser — and JSDOM — repair that silently, so every DOM-based and viewport
 * assertion stayed green while the authored string was malformed. It is a
 * CLASS of defect, not a one-off, so the scan lives here and runs against
 * EVERY authored B2 grammar payload: a newly authored lesson inherits the
 * protection the moment its data is added.
 *
 * The scan reads the RAW authored string, BEFORE any parsing.
 *
 * Deliberately conservative — it reports only unambiguous structural faults:
 *   - a closing </p> with no opening <p>
 *   - a <p> opened inside another <p>
 *   - a closing tag with nothing open
 *   - a closing tag that does not match the innermost open tag
 *   - a tag left unclosed at the end
 * Void elements never open a scope, so <br>, <hr>, <img> and <input> cannot
 * produce a false positive. Optional-close tags are NOT flagged: B2 grammar
 * closes every non-void element it opens, and demanding more would invent
 * failures rather than find them. */
{
    const { JSDOM } = require('jsdom');
    const mw = new JSDOM('<body></body>', { runScripts: 'outside-only' }).window;
    ['shared-normalizer.js', 'sentence-builder.js', 'course-exercise-ui.js', 'b2-lesson-data.js']
        .forEach(f => mw.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

    /* Void elements open no scope. Anything else must be closed explicitly. */
    const VOID = {
        area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1,
        link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1
    };

    /** Structural faults in a raw HTML fragment. Empty array === well formed. */
    function rawMarkupFaults(html) {
        const faults = [];
        const stack = [];
        let pDepth = 0;
        const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)(?:\s[^>]*)?>/g;
        let m;
        while ((m = re.exec(html)) !== null) {
            const closing = m[1] === '/';
            const tag = m[2].toLowerCase();
            if (VOID[tag]) continue;
            if (tag === 'p') {
                if (closing) {
                    if (pDepth === 0) faults.push(`stray </p> at ${m.index}`);
                    else pDepth--;
                } else {
                    if (pDepth > 0) faults.push(`nested <p> at ${m.index}`);
                    pDepth++;
                }
            }
            if (closing) {
                if (!stack.length) faults.push(`unopened </${tag}> at ${m.index}`);
                else if (stack[stack.length - 1] !== tag) {
                    faults.push(`<${stack[stack.length - 1]}> closed by </${tag}> at ${m.index}`);
                } else stack.pop();
            } else stack.push(tag);
        }
        if (pDepth > 0) faults.push(`${pDepth} unclosed <p>`);
        if (stack.length) faults.push(`unclosed: ${stack.join(',')}`);
        return faults;
    }

    /* the scanner must actually be able to see the defect it was written for */
    ok(rawMarkupFaults('<div><p>a</p></div>').length === 0,
        'raw markup scanner accepts a well-formed fragment');
    ok(rawMarkupFaults('<div>a</p><table></table></div>').length > 0,
        'raw markup scanner catches a stray </p>');
    ok(rawMarkupFaults('<div><p>a<p>b</p></p></div>').length > 0,
        'raw markup scanner catches a nested <p>');
    ok(rawMarkupFaults('<div><b>a</div></b>').length > 0,
        'raw markup scanner catches an out-of-order close');
    ok(rawMarkupFaults('<div><p>a</p>').length > 0,
        'raw markup scanner catches an unclosed tag');
    ok(rawMarkupFaults('<p>a<br>b<hr><img src="x">c</p>').length === 0,
        'raw markup scanner treats br/hr/img as void — no false positive');
    ok(rawMarkupFaults('<p>a<input></p>').length === 0,
        'raw markup scanner treats input as void — no false positive');

    /* every AUTHORED topic, discovered from the data — never a hardcoded list */
    const authored = (mw.B2_LESSON_DATA.topics || [])
        .filter(t => typeof t.grammar === 'string' && t.grammar.length)
        .sort((a, b) => a.id - b.id);
    ok(authored.length > 0, 'at least one authored B2 grammar payload was found');

    let defective = 0;
    authored.forEach(t => {
        const faults = rawMarkupFaults(t.grammar);
        if (faults.length) defective++;
        ok(faults.length === 0,
            `topic ${t.id} grammar is well-formed HTML in its RAW authored form`
            + (faults.length ? ` — ${faults.slice(0, 3).join('; ')}` : ''));
    });
    ok(defective === 0,
        `no authored B2 grammar payload is malformed (${defective}/${authored.length} defective)`);

    /* the two specific cards that shipped broken stay fixed by name */
    const t11 = authored.find(t => t.id === 11);
    if (t11) ok(t11.grammar.indexOf('<div class="b2g-warn"><p><b>Muhim:</b>') !== -1,
        'topic 11 block 2 warn card keeps its opening <p>');
    const t12 = authored.find(t => t.id === 12);
    if (t12) ok(t12.grammar.indexOf('<div class="b2g-warn"><p>Passiv <b>mexanik</b>') !== -1,
        'topic 12 block 9 warn card keeps its opening <p>');
}


/* ------------------------------------------------- SCORED-LABEL LANGUAGE
 * Topic 15's source labelled its true/false choices «Рост / Ложь». «Рост»
 * means "growth" — it is not a truth value, and mixing an Uzbek-style or
 * nonsense label into a Russian scored option is a real product defect: the
 * learner is asked a Russian question and offered a button that is not an
 * answer to it.
 *
 * This guard reads STRUCTURED exercise data only — group.items[].options and
 * group.items[].answer. Lesson prose, task instructions and vocabulary are
 * never scanned, so an Uzbek instruction or an Uzbek gloss can never trip it.
 * That distinction is the whole point: the shell may be Uzbek, the SCORED
 * labels must stay in one language.
 *
 * It is discovered from the data, so a newly authored topic inherits it. */
{
    const { JSDOM } = require('jsdom');
    const lw = new JSDOM('<body></body>', { runScripts: 'outside-only' }).window;
    ['shared-normalizer.js', 'sentence-builder.js', 'course-exercise-ui.js', 'b2-lesson-data.js']
        .forEach(f => lw.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

    /* labels that must never appear as a SCORED value */
    const FORBIDDEN = [
        [/^Рост$/, 'Рост'],
        [/Rost/, 'Rost'],
        [/Yolg[‘’']?on/i, 'Yolg‘on'],
        [/Yolgon/i, 'Yolgon'],
        [/To[‘’']g[‘’']ri/i, 'To‘g‘ri'],
        [/Noto[‘’']g[‘’']ri/i, 'Noto‘g‘ri']
    ];
    /* the two Russian true/false pairs this course actually uses. Topic 1 ships
       Верно/Неверно deliberately and must NOT be homogenised to match the rest. */
    const TF_PAIRS = [['Ложь', 'Правда'], ['Верно', 'Неверно']];

    const topics = (lw.B2_LESSON_DATA.topics || []).slice().sort((a, b) => a.id - b.id);
    ok(topics.length > 0, 'language guard found the authored B2 topics');

    let scoredGroups = 0, tfGroups = 0, forbiddenHits = 0, oddPairs = 0;
    topics.forEach(t => {
        (t.exercises || []).forEach(g => {
            const optionSets = (g.items || [])
                .map(it => Array.isArray(it.options) ? it.options.slice() : null)
                .filter(Boolean);
            const answers = (g.items || [])
                .map(it => it.answer)
                .filter(a => a != null && !Array.isArray(a))
                .map(String);
            const scored = [].concat.apply([], optionSets).concat(answers).map(String);
            if (!scored.length) return;
            if (optionSets.length) scoredGroups++;

            scored.forEach(label => {
                FORBIDDEN.forEach(([rx, name]) => {
                    if (rx.test(label)) {
                        forbiddenHits++;
                        ok(false, `T${t.id} ${g.id}: scored label "${label}" uses «${name}»`);
                    }
                });
            });

            /* a true/false group must use ONE internally consistent Russian pair */
            const distinct = [...new Set([].concat.apply([], optionSets))].sort();
            const looksTF = g.style === 'tf'
                || (distinct.length === 2
                    && distinct.some(x => /^(Правда|Ложь|Верно|Неверно)$/.test(x)));
            if (!looksTF) return;
            tfGroups++;
            const matched = TF_PAIRS.some(pair => pair.join('|') === distinct.join('|'));
            if (!matched) oddPairs++;
            ok(matched,
                `T${t.id} ${g.id}: true/false options are one consistent Russian pair `
                + `(got ${JSON.stringify(distinct)})`);
            /* and every key must be one of the two labels the group offers */
            const strayKey = answers.filter(a => distinct.indexOf(a) === -1);
            ok(strayKey.length === 0,
                `T${t.id} ${g.id}: every true/false key is one of its own options`
                + (strayKey.length ? ` (stray ${JSON.stringify(strayKey)})` : ''));
        });
    });

    ok(scoredGroups > 0, `language guard inspected ${scoredGroups} groups with scored options`);
    ok(tfGroups > 0, `language guard inspected ${tfGroups} true/false groups`);
    ok(forbiddenHits === 0, `no scored label uses a forbidden token (${forbiddenHits})`);
    ok(oddPairs === 0, `every true/false group uses a consistent Russian pair (${oddPairs} odd)`);

    /* the guard must actually be able to see the defect it was written for */
    const probe = (labels) => TF_PAIRS.some(p => p.join('|') === labels.slice().sort().join('|'));
    ok(probe(['Правда', 'Ложь']), 'language guard accepts Правда / Ложь');
    ok(probe(['Верно', 'Неверно']), 'language guard accepts the legacy Верно / Неверно');
    ok(!probe(['Рост', 'Ложь']), 'language guard rejects Рост / Ложь');
    ok(!probe(['Rost', 'Yolg‘on']), 'language guard rejects Rost / Yolg‘on');
    ok(!probe(['Правда', 'Неверно']), 'language guard rejects a mixed Правда / Неверно pair');
    ok(FORBIDDEN.some(([rx]) => rx.test('Rost')), 'the forbidden list really matches «Rost»');
    ok(FORBIDDEN.some(([rx]) => rx.test('Рост')), 'the forbidden list really matches «Рост»');
    ok(!FORBIDDEN.some(([rx]) => rx.test('Правда')), 'the forbidden list does not match «Правда»');
    ok(!FORBIDDEN.some(([rx]) => rx.test('Ростов')), 'the forbidden list does not match «Ростов»');
}


/* ------------------------------------------------- MIXED-SCRIPT HOMOGLYPHS
 * A Russian word once shipped as «понимaю» with a LATIN a (U+0061) instead of
 * Cyrillic а (U+0430), and a Topic 1 heading as «Sложноподчинённое» with a
 * Latin S. Both render identically on screen, so no reviewer sees them — but
 * search, copy-paste and the answer normaliser all treat them as different
 * words. That is a real text-quality defect and it needs a machine to catch it.
 *
 * This guard is deliberately narrow, because this course legitimately mixes
 * scripts in TWO ways that must NOT be flagged:
 *
 *   1. separate neighbouring tokens — «B2 курс», «IT-компания», and an Uzbek
 *      instruction quoting a Russian example. Tokenising on every non-letter
 *      (hyphens included) keeps those as distinct tokens.
 *   2. the course's own Uzbek-agglutination convention, where a Russian
 *      grammar term takes a trailing Uzbek suffix in Latin script —
 *      «падежda», «причастиеga», «оборотni», «приставkali». These appear
 *      across Topics 2, 3, 4, 8, 10, 11, 12 and 13 and are authorial style.
 *
 * So a token is reported ONLY when a Latin letter sits where a Cyrillic letter
 * belongs: at the START of a Cyrillic word, or INTERIOR to it (Cyrillic on
 * both sides). A purely TRAILING Latin run is the suffix convention and is
 * accepted. Scored fields are covered too, where a homoglyph would silently
 * break matching. */
{
    const { JSDOM } = require('jsdom');
    const hw = new JSDOM('<body></body>', { runScripts: 'outside-only' }).window;
    ['shared-normalizer.js', 'sentence-builder.js', 'course-exercise-ui.js', 'b2-lesson-data.js']
        .forEach(f => hw.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

    const CYR = /[Ѐ-ӿԀ-ԯ]/;
    const LAT = /[A-Za-z]/;
    const stripTags = h => String(h == null ? '' : h).replace(/<[^>]*>/g, ' ');
    /* hyphens and apostrophes SPLIT, so IT-компания is two tokens */
    const tokenise = str => String(str == null ? '' : str)
        .split(/[^0-9A-Za-zЀ-ӿԀ-ԯ]+/).filter(Boolean);

    /** '' when clean, else the reason a token is contaminated. */
    function contamination(tok) {
        if (!CYR.test(tok) || !LAT.test(tok)) return '';
        const kinds = [];
        for (const ch of tok) kinds.push(LAT.test(ch) ? 'L' : (CYR.test(ch) ? 'C' : 'x'));
        if (kinds[0] === 'L') return 'Latin letter opens a Cyrillic word';
        let lastC = -1;
        for (let i = 0; i < kinds.length; i++) if (kinds[i] === 'C') lastC = i;
        for (let i = 0; i < lastC; i++) if (kinds[i] === 'L') return 'Latin letter inside a Cyrillic word';
        return '';                       /* trailing Latin = Uzbek suffix */
    }
    const codepoints = t => [...t]
        .map(c => c + ' U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'))
        .join(' ');

    /* the guard must actually be able to see what it was written for */
    const REJECT = [
        ['понимaю (Latin a)', 'понимaю'],
        ['технoлогии (Latin o)', 'технoлогии'],
        ['согласeн (Latin e)', 'согласeн'],
        ['Sложноподчинённое (Latin S)', 'Sложноподчинённое']
    ];
    REJECT.forEach(([name, t]) => ok(contamination(t) !== '',
        `homoglyph guard rejects ${name}`));
    const ACCEPT = [
        ['понимаю (all Cyrillic)', 'понимаю'],
        ['падежda (Uzbek suffix)', 'падежda'],
        ['причастиеga (Uzbek suffix)', 'причастиеga'],
        ['plain Latin B2', 'B2'],
        ['plain Cyrillic курс', 'курс']
    ];
    ACCEPT.forEach(([name, t]) => ok(contamination(t) === '',
        `homoglyph guard accepts ${name}`));
    /* multi-token strings must never be flagged */
    [['B2 курс', 'B2 курс'],
     ['IT-компания', 'IT-компания'],
     ['bilingual instruction', 'Rahbar bilan: «Разрешите уточнить?»']
    ].forEach(([name, str]) => ok(
        tokenise(str).filter(t => contamination(t) !== '').length === 0,
        `homoglyph guard accepts the multi-token «${name}»`));

    /* ---- the real sweep over authored B2 user-facing text ---- */
    const hits = [];
    const sweep = (topic, where, str) => tokenise(str).forEach(t => {
        const why = contamination(t);
        if (why) hits.push({ topic, where, t, why });
    });
    let scanned = 0;
    (hw.B2_LESSON_DATA.topics || []).forEach(t => {
        sweep(t.id, 'grammar', stripTags(t.grammar)); scanned++;
        sweep(t.id, 'title', t.title); scanned++;
        (t.exercises || []).forEach(g => {
            ['title', 'intro', 'namuna'].forEach(k => {
                if (g[k] == null) return;
                sweep(t.id, g.id + '.' + k, g[k]); scanned++;
            });
            (g.items || []).forEach((it, i) => {
                sweep(t.id, g.id + ' #' + (i + 1) + ' q', it.q); scanned++;
                (it.options || []).forEach(o => { sweep(t.id, g.id + ' #' + (i + 1) + ' option', o); scanned++; });
                (Array.isArray(it.answer) ? it.answer : [it.answer]).forEach(aa => {
                    if (aa == null) return;
                    sweep(t.id, g.id + ' #' + (i + 1) + ' answer', aa); scanned++;
                });
            });
        });
    });
    /* the Russian side of the paid vocabulary decks */
    const vsrc = fs.readFileSync(path.join(ROOT, 'paid-courses/b2-vocabulary.html'), 'utf8');
    [...vsrc.matchAll(/\{ ru: "((?:[^"\\]|\\.)*)", uz: "((?:[^"\\]|\\.)*)" \}/g)]
        .forEach(m => { sweep('vocab', 'ru card', m[1]); scanned++; });

    hits.forEach(h => ok(false,
        `T${h.topic} ${h.where}: «${h.t}» — ${h.why} [${codepoints(h.t)}]`));
    ok(scanned > 1000, `homoglyph guard inspected ${scanned} user-facing text fields`);
    ok(hits.length === 0,
        `no authored B2 text mixes Cyrillic and Latin inside one word (${hits.length})`);
}

console.log('='.repeat(52));
if (fail) {
    console.log(`FAILED  ${pass} passed, ${fail} failed\n`);
    failures.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
}
console.log(`PASSED  ${pass}/${pass} B2 integration checks`);
console.log('='.repeat(52) + '\n');
