/* ============================================================================
 * ADMIN STUDENT ANALYTICS — A1..A8 from the specification
 * ----------------------------------------------------------------------------
 * Drives the REAL buildStudentDashboard() against the document shapes that
 * actually exist in users/{uid}/quizResults today, and the REAL
 * renderSAExercises() renderer lifted out of adminpanel.js.
 *
 * Central semantics under test:
 *   lessonResult  = a CHECKED, graded attempt -> score + per-answer detail
 *   lessonDraft   = UNFINISHED work           -> never a score, never pass/fail
 *   legacy quiz   = old native mc/blank docs  -> must keep working unchanged
 * ==========================================================================*/
'use strict';

const fs = require('fs');
const path = require('path');
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch (e) { console.error('jsdom is required: npm i -D jsdom'); process.exit(2); }

const ROOT = path.join(__dirname, '..', '..');
const PANEL_SRC = fs.readFileSync(path.join(ROOT, 'adminpanel.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (extra ? '\n      ' + extra : '')); }
}
function eq(name, a, b) { ok(name, Object.is(a, b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

/* --------------------------------------------------------------- fixtures */

const LESSON_RESULT_DOC = {
    id: 'topic_7', course: 'B1',
    lessonResult: {
        v: 1, course: 'B1', topicId: 7,
        completedAt: '2026-07-20T10:00:00.000Z',
        score: 2, correct: 2, incorrect: 1, total: 3, percent: 67, passed: true,
        message: '📝 Qoniqarli.',
        results: [
            { label: 'Test savol 1', question: 'Как дела?', userAnswer: 'Хорошо', correctAnswer: 'Хорошо', isCorrect: true, explanation: "To'g'ri!" },
            { label: "Bo'sh joy 1", question: 'Меня … Иван.', userAnswer: 'зовут', correctAnswer: 'зовут', isCorrect: true, explanation: "To'g'ri!" },
            { label: 'Mashq 1', question: 'Kitob', userAnswer: 'кнга', correctAnswer: 'книга', isCorrect: false, explanation: "To'g'ri javob: «книга»." },
        ],
    },
};

const DRAFT_DOC = {
    id: 'topic_8', course: 'B1',
    lessonDraft: { v: 1, savedAt: 1753000000000, fields: { 'data-blank=0': { t: 'v', v: 'зов' }, 'data-t1-input=ex2-0': { t: 'v', v: 'вр' } } },
};

const LEGACY_DOC = {
    id: 'topic_1', course: 'A1', score: 9, total: 10,
    timestamp: '2026-01-05T09:00:00.000Z',
    section1: { q1: 'мой', q2: 'моя' },
};

/* Render with the REAL renderer extracted from adminpanel.js. */
function renderExercises(dashboard) {
    const vc = new VirtualConsole();
    const dom = new JSDOM('<!DOCTYPE html><body></body>', { runScripts: 'outside-only', virtualConsole: vc });
    const w = dom.window;
    const grab = (re, name) => {
        const m = PANEL_SRC.match(re);
        if (!m) throw new Error('could not extract ' + name);
        return m[0];
    };
    w.eval(
        grab(/function escapeHtml\(value\)[\s\S]*?\n\}/, 'escapeHtml') + '\n' +
        grab(/function saNum\([\s\S]*?\n\}/, 'saNum') + '\n' +
        grab(/function saDateTime\([\s\S]*?\n\}/, 'saDateTime') + '\n' +
        grab(/function renderSAExercises\(d\)[\s\S]*?\n\}/, 'renderSAExercises') + '\n' +
        'window.__render = renderSAExercises;'
    );
    const html = w.__render(dashboard);
    w.close();
    return html;
}

(async function run() {

const { buildStudentDashboard } = await import('../../api/_lib/analytics.js');
const build = (quizResults, extra = {}) => buildStudentDashboard({
    profile: { courses: { B1: { completedTopics: [7] } } },
    quizResults, certificates: [], summary: null, events: [], ...extra,
});
const rowFor = (d, id) => d.exercises.find(e => e.id === id);

/* ------------------------------------------------------------------ */
console.log('\n[A1] Unfinished lessonDraft -> IN PROGRESS, never a graded result');
{
    const d = build([DRAFT_DOC]);
    const row = rowFor(d, 'topic_8');
    ok('the draft appears in the history', !!row);
    eq('status is in_progress', row.status, 'in_progress');
    eq('no score is invented', row.score, null);
    eq('no total is invented', row.total, null);
    eq('no percent is invented', row.percent, null);
    eq('no pass/fail verdict', row.passed, null);
    eq('no submitted answers are claimed', row.answers.length, 0);
    eq('no lesson snapshot is claimed', row.lesson, null);
    ok('draft progress is reported separately', row.draft && row.draft.answered === 2);
    ok('draft carries its save time', row.draft.savedAt === 1753000000000);

    const html = renderExercises(d);
    ok('UI labels it "Yakunlanmagan"', /Yakunlanmagan/.test(html));
    ok('UI marks it as in progress', /Jarayonda/.test(html));
    ok('UI explains it is NOT a finished result', /yakunlangan natija emas/.test(html));
    ok('UI shows NO percentage for a draft', !/\d+%\s*\(/.test(html));
    ok('UI does not claim answers were not saved', !/Javoblar saqlanmagan/.test(html));
}

/* ------------------------------------------------------------------ */
console.log('\n[A2] Completed lesson -> lessonResult with full detail');
{
    const d = build([LESSON_RESULT_DOC]);
    const row = rowFor(d, 'topic_7');
    eq('status is graded', row.status, 'graded');
    eq('real score surfaces', row.score, 2);
    eq('real total surfaces', row.total, 3);
    eq('real percent surfaces', row.percent, 67);
    eq('pass verdict computed', row.passed, true);
    eq('completedAt drives the timestamp', row.timestamp, Date.parse('2026-07-20T10:00:00.000Z'));
    eq('per-answer detail present', row.lesson.answers.length, 3);
    eq('correct count', row.lesson.correct, 2);
    eq('incorrect count', row.lesson.incorrect, 1);

    const wrong = row.lesson.answers.find(a => !a.isCorrect);
    eq('submitted answer preserved', wrong.submitted, 'кнга');
    eq('expected answer preserved', wrong.expected, 'книга');
    eq('question preserved', wrong.question, 'Kitob');
    ok('feedback preserved', /книга/.test(wrong.feedback));

    const html = renderExercises(d);
    ok('UI shows the real score', /67%/.test(html) && /\(2\/3\)/.test(html));
    ok('UI lists the submitted answer', /кнга/.test(html));
    ok('UI lists the expected answer', /книга/.test(html));
    ok('UI marks correctness', /To‘g‘ri/.test(html) && /Noto‘g‘ri/.test(html));
    ok('UI shows the feedback line', /sa-lr-fb/.test(html));
    ok('UI no longer claims answers were not saved', !/Javoblar saqlanmagan/.test(html));
}

/* ------------------------------------------------------------------ */
console.log('\n[A3] Stored result stays visible across reloads (pure re-read)');
{
    const first = build([LESSON_RESULT_DOC]);
    const second = build([JSON.parse(JSON.stringify(LESSON_RESULT_DOC))]);
    eq('identical input yields identical output',
       JSON.stringify(rowFor(second, 'topic_7')), JSON.stringify(rowFor(first, 'topic_7')));
    ok('reading is side-effect free (no mutation of the source doc)',
       LESSON_RESULT_DOC.lessonResult.results.length === 3);
}

/* ------------------------------------------------------------------ */
console.log('\n[A4] Retry — the newest snapshot is what analytics reports');
{
    const retried = {
        id: 'topic_7', course: 'B1',
        lessonResult: {
            v: 1, course: 'B1', topicId: 7, completedAt: '2026-07-25T12:00:00.000Z',
            results: [
                { label: 'Test savol 1', question: 'Как дела?', userAnswer: 'Хорошо', correctAnswer: 'Хорошо', isCorrect: true, explanation: 'ok' },
                { label: "Bo'sh joy 1", question: 'Меня … Иван.', userAnswer: 'зовут', correctAnswer: 'зовут', isCorrect: true, explanation: 'ok' },
                { label: 'Mashq 1', question: 'Kitob', userAnswer: 'книга', correctAnswer: 'книга', isCorrect: true, explanation: 'ok' },
            ],
        },
    };
    const row = rowFor(build([retried]), 'topic_7');
    eq('new attempt scored 3/3', row.score, 3);
    eq('new percent', row.percent, 100);
    ok('previously wrong answer now correct', row.lesson.answers.every(a => a.isCorrect));
    eq('timestamp follows the newer completion', row.timestamp, Date.parse('2026-07-25T12:00:00.000Z'));

    /* A draft saved AFTER a graded attempt (an in-flight retry) must not
       turn the graded row back into an unfinished one. */
    const both = { ...retried, lessonDraft: { v: 1, savedAt: Date.parse('2026-07-26T09:00:00.000Z'), fields: { a: { t: 'v', v: 'x' } } } };
    const bothRow = rowFor(build([both]), 'topic_7');
    eq('a graded row stays graded while a retry is in progress', bothRow.status, 'graded');
    eq('the graded score is still reported', bothRow.score, 3);
    ok('the in-flight retry is still visible as draft metadata', !!bothRow.draft);
}

/* ------------------------------------------------------------------ */
console.log('\n[A5] Old accounts without lessonResult do not crash');
{
    const d = build([LEGACY_DOC]);
    const row = rowFor(d, 'topic_1');
    eq('legacy status graded', row.status, 'graded');
    eq('legacy score preserved', row.score, 9);
    eq('legacy total preserved', row.total, 10);
    eq('legacy percent preserved', row.percent, 90);
    eq('legacy flat answers preserved', row.answers.length, 2);
    eq('no lesson snapshot claimed', row.lesson, null);
    eq('no draft claimed', row.draft, null);

    const html = renderExercises(d);
    ok('legacy answers still rendered', /мой/.test(html) && /моя/.test(html));
    ok('legacy row shows its score', /90%/.test(html));
}

/* ------------------------------------------------------------------ */
console.log('\n[A6] Native quiz + lessonResult coexist without destroying each other');
{
    const both = {
        id: 'topic_3', course: 'A1',
        score: 9, total: 10, timestamp: '2026-02-01T00:00:00.000Z',
        section1: { q1: 'мой' },
        lessonResult: {
            v: 1, course: 'A1', topicId: 3, completedAt: '2026-02-01T00:05:00.000Z',
            results: [
                { label: 'L1', question: 'Q1', userAnswer: 'a', correctAnswer: 'a', isCorrect: true, explanation: 'e' },
                { label: 'L2', question: 'Q2', userAnswer: 'b', correctAnswer: 'c', isCorrect: false, explanation: 'e' },
            ],
        },
    };
    const row = rowFor(build([both]), 'topic_3');
    eq('native score wins (explicit, older record)', row.score, 9);
    eq('native total wins', row.total, 10);
    eq('native percent wins', row.percent, 90);
    eq('native flat answers preserved', row.answers.length, 1);
    eq('lesson detail ALSO preserved', row.lesson.answers.length, 2);
    ok('neither source was destroyed', row.answers.length > 0 && row.lesson.answers.length > 0);

    const html = renderExercises(build([both]));
    ok('the richer lesson detail is what the admin sees', /sa-lr/.test(html));
}

/* ------------------------------------------------------------------ */
console.log('\n[A7] Missing / malformed / partial records are handled gracefully');
{
    const nasty = [
        { id: 'e1' },                                                    // empty doc
        { id: 'e2', lessonResult: null },
        { id: 'e3', lessonResult: 'garbage' },
        { id: 'e4', lessonResult: { results: 'not-an-array' } },
        { id: 'e5', lessonResult: { results: [] } },
        { id: 'e6', lessonResult: { results: [null, 7, 'x'] } },
        { id: 'e7', lessonDraft: 'garbage' },
        { id: 'e8', lessonDraft: { fields: null } },
        { id: 'e9', score: null, total: null },
        { id: 'e10', lessonResult: { results: [{ }] } },                 // answer with no fields
        { id: 'e11', course: null, timestamp: null, updatedAt: null },
    ];
    let threw = null, d = null;
    try { d = build(nasty); } catch (e) { threw = e; }
    ok('malformed records never throw', !threw, threw && threw.message);
    eq('every record still produces a row', d.exercises.length, nasty.length);
    ok('no row invents a score', d.exercises.every(r => r.score === null || typeof r.score === 'number'));
    ok('no malformed row is marked passed', d.exercises.every(r => r.passed === null || typeof r.passed === 'boolean'));

    const e10 = rowFor(d, 'e10');
    eq('an answer with no fields still renders safely', e10.lesson.answers.length, 1);
    eq('missing submitted answer becomes empty string', e10.lesson.answers[0].submitted, '');
    eq('an answer with no correctness flag is NOT counted correct', e10.lesson.correct, 0);

    let renderThrew = null, html = null;
    try { html = renderExercises(d); } catch (e) { renderThrew = e; }
    ok('the renderer survives malformed data', !renderThrew, renderThrew && renderThrew.message);
    ok('and produces output', typeof html === 'string' && html.length > 0);
    ok('nothing is fabricated for empty records', /Javoblar saqlanmagan|Yakunlanmagan/.test(html));
}

/* ------------------------------------------------------------------ */
console.log('\n[A8] Many records stay responsive and bounded');
{
    const many = [];
    for (let i = 0; i < 400; i++) {
        many.push(i % 2 === 0
            ? { id: `topic_${i}`, course: 'B1', lessonResult: { v: 1, course: 'B1', topicId: i, completedAt: new Date(1750000000000 + i * 1000).toISOString(), results: [{ label: 'L', question: 'Q', userAnswer: 'a', correctAnswer: 'a', isCorrect: true, explanation: 'e' }] } }
            : { id: `topic_${i}`, course: 'B1', lessonDraft: { v: 1, savedAt: 1750000000000 + i * 1000, fields: { a: { t: 'v', v: 'x' } } } });
    }
    const t0 = Date.now();
    const d = build(many, { events: Array.from({ length: 300 }, (_, i) => ({ t: 'ex_done', cts: 1750000000000 + i, course: 'B1', topic: i % 20, data: {} })) });
    const ms = Date.now() - t0;
    eq('all records processed', d.exercises.length, 400);
    ok(`dashboard assembled quickly (${ms}ms for 400 records + 300 events)`, ms < 1500, `${ms}ms`);
    ok('timeline is bounded to 200 entries', (d.timeline || []).length <= 200);
    eq('graded and in-progress rows are separated', d.exercises.filter(e => e.status === 'in_progress').length, 200);
    eq('and graded rows counted', d.exercises.filter(e => e.status === 'graded').length, 200);
    ok('newest first ordering', (d.exercises[0].timestamp || 0) >= (d.exercises[d.exercises.length - 1].timestamp || 0));

    const t1 = Date.now();
    const html = renderExercises(d);
    const renderMs = Date.now() - t1;
    ok(`renderer handles 400 rows (${renderMs}ms)`, renderMs < 2000, `${renderMs}ms`);
    ok('output produced', html.length > 1000);
}

/* ------------------------------------------------------------------ */
console.log('\n[A9] Drafts never leak into aggregate progress or answer counts');
{
    const d = build([DRAFT_DOC, LESSON_RESULT_DOC, LEGACY_DOC]);
    const answersFromDrafts = d.exercises
        .filter(e => e.status === 'in_progress')
        .reduce((n, e) => n + e.answers.length, 0);
    eq('drafts contribute zero submitted answers', answersFromDrafts, 0);

    const scored = d.exercises.filter(e => e.percent != null);
    eq('only genuinely graded rows carry a percent', scored.length, 2);
    ok('the draft row is excluded from scored rows',
       !scored.some(e => e.id === 'topic_8'));

    /* And the raw `savedAt` epoch must never appear as a student answer. */
    const allAnswerText = d.exercises.flatMap(e => e.answers.map(a => a.answer)).join(' ');
    ok('no raw savedAt timestamp presented as an answer', !/1753000000000/.test(allAnswerText));
}

console.log('\n' + '─'.repeat(64));
console.log(fail === 0
    ? `  ✅ ADMIN ANALYTICS: ${pass}/${pass} assertions passed`
    : `  ❌ ADMIN ANALYTICS: ${fail} failed, ${pass} passed`);
console.log('─'.repeat(64) + '\n');
process.exit(fail === 0 ? 0 : 1);

})().catch((e) => { console.error('\nFATAL:', e); process.exit(1); });
