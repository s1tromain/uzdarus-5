#!/usr/bin/env node
/**
 * verify_speech_pronunciation_integration.cjs — pronunciation feedback that
 * actually says something.
 *
 * THE DEFECT THIS EXISTS FOR. Learners reported that pronunciation feedback
 * was effectively always "Yaxshi" with three stars. The provider was never the
 * problem — it is real Azure Pronunciation Assessment, ru-RU, phoneme
 * granularity, prosody enabled, and it returns genuinely different numbers.
 * The bands were the problem: 95 / 85 / 70 / 50 put the third band at 15
 * points wide starting at 70, and a learner reading a short Russian word lands
 * in the seventies far more often than anywhere else. The common case and the
 * good case collapsed into one verdict, so the stars carried no information.
 *
 * The bands are now 90 / 75 / 60 / 40 and every boundary is pinned below, on
 * BOTH sides, because a band table is exactly the kind of thing that gets
 * "tidied" back to round numbers later.
 *
 * The other two properties asserted here are safety ones: the provider
 * credential must never reach the browser, and pronunciation must never be
 * able to move a learner's progress.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('\n=== SPEECH PRONUNCIATION INTEGRATION ===');

const SRC = read('paid-courses/speech.js');

/* ================================================================ *
 * 1. THE PROVIDER IS REAL, AND IT IS ASSESSING PRONUNCIATION
 * ---------------------------------------------------------------- *
 * Not transcript similarity wearing a pronunciation label.
 * ================================================================ */
{
    ok(/microsoft-cognitiveservices-speech-sdk/.test(SRC),
        'the provider is the Microsoft Cognitive Services Speech SDK');
    ok(/new SpeechSDK\.PronunciationAssessmentConfig\(/.test(SRC),
        'it runs a real PronunciationAssessmentConfig');
    ok(/PronunciationAssessmentGranularity\.Phoneme/.test(SRC),
        'at phoneme granularity');
    ok(/enableProsodyAssessment = true/.test(SRC), 'with prosody assessment enabled');
    ok(/speechRecognitionLanguage = 'ru-RU'/.test(SRC), 'against ru-RU');
    ok(/PronunciationAssessmentResult\.fromResult\(/.test(SRC),
        'and reads the assessment result the provider returns');
    /* the four real metrics, used only because the provider supplies them */
    ['accuracyScore', 'fluencyScore', 'completenessScore'].forEach((f) =>
        ok(new RegExp(f).test(SRC), `the real ${f} is carried through`));
}

/* ================================================================ *
 * 2. THE CREDENTIAL NEVER REACHES THE BROWSER
 * ================================================================ */
{
    const server = read('api/speech-token.js');
    ok(/process\.env\.AZURE_SPEECH_KEY/.test(server),
        'the subscription key is read from the server environment');
    ok(/issueToken/.test(server), 'and exchanged for a short-lived token server-side');
    ok(/sendJson\(res, 200, \{ token, region \}\)/.test(server),
        'only the token and region are returned to the client');
    eq('the key itself is never sent to the client',
        /sendJson\([^)]*speechKey/.test(server), false);
    ok(/\/api\/speech-token/.test(SRC), 'and the client asks that endpoint for it');

    /* no client file may carry a provider credential. The Firebase Web API key
       is deliberately excluded: it is a public project identifier, not a
       secret — Firestore rules are what protect that data. */
    const clientFiles = [];
    const walk = (dir) => {
        for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
            if (['node_modules', '.git', 'api', 'scripts', 'tests'].includes(e.name)) continue;
            const rel = dir === '.' ? e.name : dir + '/' + e.name;
            if (e.isDirectory()) walk(rel);
            else if (/\.(html|js)$/.test(e.name)) clientFiles.push(rel);
        }
    };
    walk('.');
    ok(clientFiles.length > 20, `${clientFiles.length} client files scanned`);
    const leaks = [];
    const PATTERNS = [/AZURE_SPEECH_KEY/, /Ocp-Apim-Subscription-Key/, /SUBSCRIPTION_KEY/,
                      /AZURE_REGION\s*=\s*['"][a-z]/i];
    clientFiles.forEach((f) => {
        const src = read(f);
        PATTERNS.forEach((p) => { if (p.test(src)) leaks.push(f); });
    });
    eq(`no client file carries a provider credential (${leaks.join(', ') || 'none'})`,
        leaks.length, 0);
}

/* ================================================================ *
 * 3. THE BANDS — every boundary, on both sides
 * ---------------------------------------------------------------- *
 * Driven through the SHIPPED classifier and the SHIPPED label table, not a
 * copy of the thresholds.
 * ================================================================ */
function grader() {
    const consts = (SRC.match(/var SPEECH_STAR\d_MIN = \d+;/g) || []).join('\n');
    ok(consts.split('\n').length === 4, 'all four band constants were located');
    const at = SRC.search(/function\s+_scoreToVerdict\s*\(/);
    let d = 0, b = SRC.indexOf('{', at), body = '';
    for (let k = b; k < SRC.length; k++) {
        if (SRC[k] === '{') d++;
        else if (SRC[k] === '}') { d--; if (!d) { body = SRC.slice(at, k + 1); break; } }
    }
    const tStart = SRC.indexOf('    excellent:      { stars:');
    const table = SRC.slice(tStart, SRC.indexOf('};', tStart));
    ok(tStart > 0 && table.length > 200, 'the verdict label table was located');
    return new Function(consts + '\n' + body + '\nvar T={' + table + '};' +
        'return function(sc){var v=_scoreToVerdict(sc);' +
        'return {verdict:v, stars:T[v]?T[v].stars:null, text:T[v]?T[v].text:null};};')();
}
const g = grader();

const BANDS = [
    [0,   1, 'Yana bir bor urinib ko‘ring'],
    [39,  1, 'Yana bir bor urinib ko‘ring'],
    [40,  2, 'Yaxshi boshlanish'],
    [59,  2, 'Yaxshi boshlanish'],
    [60,  3, 'Yaxshi'],
    [74,  3, 'Yaxshi'],
    [75,  4, 'Juda yaxshi!'],
    [89,  4, 'Juda yaxshi!'],
    [90,  5, "A'lo"],
    [100, 5, "A'lo"]
];
BANDS.forEach(([score, stars, text]) => {
    const r = g(score);
    eq(`score ${score} -> ${stars} star(s)`, r.stars, stars);
    eq(`score ${score} -> "${text}"`, r.text, text);
});

/* THE BOUNDARIES ARE EXCLUSIVE ON THE LOW SIDE. One point below each band
   start must drop a star — this is what a "tidied" table would break. */
[[40, 39], [60, 59], [75, 74], [90, 89]].forEach(([lo, below]) => {
    ok(g(lo).stars === g(below).stars + 1,
        `${below} and ${lo} are in different bands (${g(below).stars} vs ${g(lo).stars})`);
});

/* ================================================================ *
 * 4. DIFFERENT PROVIDER SCORES PRODUCE DIFFERENT FEEDBACK
 * ---------------------------------------------------------------- *
 * The reported defect, stated as a test: three genuinely different Azure
 * results must not collapse into one verdict.
 * ================================================================ */
{
    eq('a weak attempt (25) shows one star', g(25).stars, 1);
    eq('a middling attempt (65) shows three stars', g(65).stars, 3);
    eq('a strong attempt (95) shows five stars', g(95).stars, 5);
    const distinct = new Set([g(25).stars, g(65).stars, g(95).stars]);
    eq('all three are different', distinct.size, 3);

    /* and across the whole range, every star count is actually reachable */
    const seen = new Set();
    for (let s = 0; s <= 100; s++) seen.add(g(s).stars);
    eq('every star count from 1 to 5 is reachable', [...seen].sort().join(','), '1,2,3,4,5');

    /* no constant path: the number of DISTINCT verdicts over 0..100 is five */
    const verdicts = new Set();
    for (let s = 0; s <= 100; s++) verdicts.add(g(s).verdict);
    eq('the classifier produces five distinct verdicts', verdicts.size, 5);

    /* the old bands must not come back */
    eq('the third band no longer starts at 70', g(70).stars, 3);
    ok(g(85).stars === 4, 'and 85 is four stars, not five as it was under the old table');
    ok(g(50).stars === 2, '50 is two stars');

    /* ------------------------------------------------------------------ *
     * THERE ARE TWO STAR TABLES, AND BOTH HAVE TO BE PINNED.
     * ------------------------------------------------------------------ *
     * Everything above reconstructs stars from _PRON_CATEGORY, which is the
     * table the RENDERER falls back to. The shipped grader does not use it:
     * _packageGrade() returns _STAR_COUNT[verdict]. A negative control that
     * hardcoded `stars: 3` in _packageGrade — the exact original defect,
     * "Yaxshi and three stars every time" — walked straight through this
     * suite because nothing here had ever read that line.
     *
     * So: the grader's table must exist, must agree with the renderer's for
     * every verdict, and the grader must still be looking the verdict up
     * rather than answering with a number.
     */
    const starCountSrc = SRC.match(/var _STAR_COUNT\s*=\s*\{[^}]*\}/);
    ok(!!starCountSrc, 'the grader has its own star table (_STAR_COUNT)');
    if (starCountSrc) {
        const STAR_COUNT = (0, eval)('(' + starCountSrc[0].replace(/^var _STAR_COUNT\s*=\s*/, '') + ')');
        const RENDER = { excellent: 5, great: 4, good: 3, fair: 2, poor: 1, empty: 0, low_confidence: 0 };
        Object.keys(RENDER).forEach((v) => {
            eq(`_STAR_COUNT.${v} agrees with the renderer's table`, STAR_COUNT[v], RENDER[v]);
        });
        eq('_STAR_COUNT covers exactly the seven verdicts',
            Object.keys(STAR_COUNT).sort().join(','), Object.keys(RENDER).sort().join(','));
        const reachable = new Set(Object.keys(STAR_COUNT)
            .filter((v) => v !== 'empty' && v !== 'low_confidence').map((v) => STAR_COUNT[v]));
        eq('the grader can still award every star count from 1 to 5',
            [...reachable].sort().join(','), '1,2,3,4,5');
    }

    /* the grader LOOKS THE VERDICT UP; it does not answer with a literal */
    const packaged = SRC.match(/stars:\s*([^\n,]+),/);
    ok(!!packaged && /_STAR_COUNT\[verdict\]/.test(packaged[1]),
        `_packageGrade derives stars from the verdict, not a constant (got ${packaged ? packaged[1].trim() : 'nothing'})`);
    ok(!/stars:\s*\d+\s*,/.test(SRC.slice(SRC.indexOf('function _packageGrade'),
        SRC.indexOf('function _packageGrade') + 4000)),
        'no literal star count is returned anywhere in the grading path');

    /* the renderer must not hardcode one either */
    const renderStar = SRC.match(/var starCount = ([^;]+);/);
    ok(!!renderStar && /ui\.stars|_STAR_COUNT\[verdict\]/.test(renderStar[1]),
        'the result screen renders the graded star count, not a constant');
}

/* THE ACCURACY CEILING IS ANCHORED TO THE BANDS.
   This table caps the blended score by what Azure actually heard. Its rungs
   and the star bands have to move together: while five stars began at 95 a
   ceiling of 94 kept an 80-89 accuracy out of the top band, but once the top
   band started at 90 that same 94 let an accuracy of 82 be presented as
   "A'lo". The recorded-fixture harness in tests/pronunciation caught it as
   21 invariant violations. */
{
    const at = SRC.indexOf('function _accuracyCeiling');
    ok(at > 0, 'the accuracy ceiling exists');
    const body = SRC.slice(at, SRC.indexOf('\n}', at) + 2);
    const ceil = new Function(body + '\nreturn _accuracyCeiling;')();
    const FIVE = 90;
    ok(ceil(95) >= FIVE, 'an accuracy of 95 may reach five stars');
    ok(ceil(90) >= FIVE, 'an accuracy of 90 may reach five stars');
    ok(ceil(89) < FIVE, 'an accuracy of 89 may NOT reach five stars');
    ok(ceil(82) < FIVE, 'nor 82 — the case the fixtures caught');
    ok(ceil(70) < FIVE, 'nor 70');
    for (let a = 0; a < 90; a++) {
        if (ceil(a) >= FIVE) { ok(false, 'accuracy ' + a + ' must not reach the top band'); break; }
    }
    ok(true, 'no accuracy below 90 can reach the top band');
    /* the pass mark stays where the calibration put it */
    const pm = (SRC.match(/var SPEECH_PASS_SCORE = (\d+);/) || [])[1];
    eq('the accepted-attempt mark is 70, as the fixture calibration requires', pm, '70');
}

/* ================================================================ *
 * 5. PRONUNCIATION IS PRACTICE — it moves nothing
 * ================================================================ */
{
    /* the gate predicate, stripped of the comment that explains its history */
    const at = SRC.indexOf('function _pronGatesProgression');
    ok(at > 0, 'the progression-gating predicate exists');
    const body = SRC.slice(at, SRC.indexOf('\n}', at) + 2);
    const code = body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    ok(/return false;/.test(code), 'pronunciation gates no progression');
    eq('and it is not wired back to the mic policy', /return _pronEnabled\(\)/.test(code), false);

    /* speech may never report a component or claim a topic */
    eq('speech.js never reports a course component',
        /completeCourseComponent/.test(SRC), false);
    eq('speech.js never claims a topic', /completeCourseTopic/.test(SRC), false);
    eq('speech.js never appends to completedTopics',
        /completedTopics\s*\.\s*push/.test(SRC), false);

    /* the vocabulary reporter never consults a pronunciation score */
    const vocab = read('vocabulary-component.js');
    eq('the vocabulary reporter never consults a pronunciation score',
        /pron|speech|micro|accuracy|stars/i.test(vocab), false);
}

/* ================================================================ *
 * 6. EVERY FAILURE MODE STILL LEAVES THE LEARNER ABLE TO CONTINUE
 * ---------------------------------------------------------------- *
 * A speech outage must never become a progression outage — that was a real
 * defect on paid A2 and B2, where the only writer of the word frontier was a
 * passing pronunciation.
 * ================================================================ */
{
    /* the listen-only advance path is unconditional now */
    ok(/_notePassiveProgress\(word\.topicId/.test(SRC),
        'listening records forward progress');
    ok(/!_pronGatesProgression\(\)/.test(SRC),
        'and the Keyingi handler advances when nothing gates it');
    /* each error mode has learner-facing handling, not a thrown stack */
    [['micDenied', 'microphone permission denied'],
     ['Mikrofon tizimi yuklanmadi', 'the SDK failing to load'],
     ['Vaqt tugadi', 'a provider timeout']].forEach(([needle, what]) =>
        ok(SRC.indexOf(needle) > 0, `there is learner-facing handling for ${what}`));
    ok(/catch/.test(SRC), 'and the assessment path is guarded');

    /* the word-lock predicate cannot pin a learner at card 0 */
    const lockAt = SRC.indexOf('function _isWordLocked');
    ok(lockAt > 0, 'the word-lock predicate exists');
    const lockBody = SRC.slice(lockAt, SRC.indexOf('\n}', lockAt) + 2);
    ok(/if \(!_pronGatesProgression\(\)\) return false;/.test(lockBody),
        'and it returns unlocked whenever pronunciation does not gate');
}

console.log('  real Azure ru-RU phoneme assessment · 90/75/60/40 bands pinned both sides · no client credential · gates nothing');
console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ SPEECH PRONUNCIATION INTEGRATION: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ SPEECH PRONUNCIATION INTEGRATION: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
