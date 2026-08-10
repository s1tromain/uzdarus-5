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
    ok(/completeTopic: function \(id, r\)[\s\S]{0,400}saveProgress\(id\)/.test(s),
        `${T} completion routes through the page's existing saveProgress`);
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
    ok(/var locked = B2_DEMO_MODE && t\.id !== 1;/.test(demo),
        'demo locks every topic except Lesson 1');
    ok(/var locked = B2_DEMO_MODE && t\.id !== 1;/.test(paid),
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
    ok(/PASS_PERCENT = 85/.test(fs.readFileSync(path.join(ROOT, 'b2-host.js'), 'utf8')),
        'B2 keeps its own threshold in its own host');
    const a2bare = fs.readFileSync(path.join(ROOT, 'a2-host.js'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    ok(!/passScore|stepGate|PASS_PERCENT/.test(a2bare),
        'A2 declares no gate — its progression rules are unchanged');
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
    ok(/PASS_PERCENT = 85/.test(host), 'host defines the 85% threshold');
    ok(/function stepGate/.test(host), 'host implements the per-exercise gate');
    ok(/function buildResultsHtml/.test(host), 'host owns ONE results builder');
    ok((host.match(/function buildResultsHtml/g) || []).length === 1, 'exactly one results builder');
    ok(/data-b2h-act="complete"/.test(host), 'results screen offers explicit completion');
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
       page's real buildB2Topics / b2ExerciseData / B2_SOON_HTML are lifted out
       of the inline script and executed against the real modules. */
    const { JSDOM } = require('jsdom');

    function runBuilder(file, expectDemo) {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
        const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
        const w = dom.window;
        w.eval(fs.readFileSync(path.join(ROOT, 'b2-topics.js'), 'utf8'));
        w.eval(fs.readFileSync(path.join(ROOT, 'b2-lesson-data.js'), 'utf8'));

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
        const soon = src.match(/var B2_SOON_HTML = \[[\s\S]*?\]\.join\(''\);/)[0];
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
        ok(topics.slice(1).every(t => !t.grammar), `${L} unauthored topics carry no grammar`);
        ok(topics.slice(1).every(t => /tayyorlanmoqda/.test(t.content)),
            `${L} unauthored topics show the "in preparation" panel`);
        ok(topics[0].content === '', `${L} topic 1 shows its lesson, not the placeholder`);
        ok(/Grammatika:/.test(topics[0].description) && /Muloqot:/.test(topics[0].description),
            `${L} legacy one-line description still generated`);

        if (demo) {
            ok(topics[0].isLocked === false, 'demo topic 1 is UNLOCKED');
            ok(topics[0].isSubscriptionLocked === false, 'demo topic 1 is not subscription-locked');
            ok(topics.slice(1).every(t => t.isLocked === true), 'demo topics 2-16 are ALL locked');
            ok(topics.slice(1).every(t => t.isSubscriptionLocked === true),
                'demo topics 2-16 are subscription-locked');
        } else {
            ok(topics.every(t => t.isLocked === false), 'paid topics are all unlocked');
        }
    });
}

console.log('='.repeat(52));
if (fail) {
    console.log(`FAILED  ${pass} passed, ${fail} failed\n`);
    failures.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
}
console.log(`PASSED  ${pass}/${pass} B2 integration checks`);
console.log('='.repeat(52) + '\n');
