#!/usr/bin/env node
/**
 * verify_course_prerequisites.cjs — a pack is not a permission to skip a course.
 *
 * THE DEFECT THIS SUITE EXISTS FOR. Buying the A1A2 pack opened A1 *and* A2
 * immediately, so a learner could start A2 without a single A1 lesson. The two
 * ideas had been conflated:
 *
 *   ENTITLEMENT  — what the learner PAID FOR   (accessPacks + subscription)
 *   PREREQUISITE — what the learner EARNED     (previous course finished)
 *
 * Both must hold before a paid course page opens. This suite drives the real
 * helpers out of firebase-client.js — nothing here re-implements them.
 *
 * Only WITHIN-pack progression is asserted: A2 requires A1, B2 requires B1.
 * A2 -> B1 is deliberately NOT a prerequisite, because B1B2 is sold on its own
 * and a learner who buys it must be able to begin B1 at once. A test that
 * demanded otherwise would be inventing business policy.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('\n=== COURSE PREREQUISITES ===');

const CLIENT = read('firebase-client.js');
const freeze = require(path.join(ROOT, 'account-freeze.js'));
function lift(name) {
    const i = CLIENT.indexOf('export function ' + name + '(');
    if (i < 0) throw new Error('missing export ' + name);
    let d = 0;
    for (let k = CLIENT.indexOf('{', CLIENT.indexOf(')', i)); k < CLIENT.length; k++) {
        if (CLIENT[k] === '{') d++;
        else if (CLIENT[k] === '}') { d--; if (d === 0) return CLIENT.slice(i, k + 1).replace('export ', ''); }
    }
    throw new Error('unbalanced ' + name);
}
const constOf = (name) => {
    const i = CLIENT.indexOf('export const ' + name + ' = Object.freeze({');
    if (i < 0) throw new Error('missing const ' + name);
    return CLIENT.slice(i, CLIENT.indexOf('});', i) + 3).replace('export ', '');
};
const API = new Function('isAccountFrozen', `
    const PRIVILEGED_ROLES = new Set(['developer','admin']);
    function extractRole(u){ return typeof u==='string'?u.trim().toLowerCase():String(u?.role||'').trim().toLowerCase(); }
    function normalizeDate(v){ if(!v) return null; if(typeof v?.toDate==='function') return v.toDate();
        const d=new Date(v); return Number.isNaN(d.getTime())?null:d; }
    const packToCourses = ${CLIENT.slice(CLIENT.indexOf('const packToCourses'),
        CLIENT.indexOf('};', CLIENT.indexOf('const packToCourses')) + 2).replace('const packToCourses =', '')}
    ${lift('isPrivilegedRole')}
    ${lift('hasActiveSubscription')}
    ${lift('hasPackAccess')}
    ${lift('canAccessPaid')}
    ${lift('getPackByPageName')}
    ${constOf('COURSE_PREREQUISITE')}
    ${constOf('COURSE_TOPIC_TOTALS')}
    ${lift('isCourseCompleted')}
    ${lift('getCoursePrerequisiteState')}
    ${lift('getCourseByPageName')}
    ${lift('canOpenCoursePage')}
    return { canAccessPaid, getPackByPageName, isCourseCompleted,
             getCoursePrerequisiteState, canOpenCoursePage, getCourseByPageName,
             COURSE_PREREQUISITE, COURSE_TOPIC_TOTALS };
`)(freeze.isAccountFrozen);

/* ---------------- fixtures ---------------- */
const now = new Date();
const ids = (n) => Array.from({ length: n }, (_, i) => i + 1);
const TOT = API.COURSE_TOPIC_TOTALS;
/** A learner who owns `packs`, with per-course server state. */
const learner = (packs, courses = {}, over = {}) => Object.assign({
    role: 'customer', accessPacks: packs,
    subscription: { active: true, endAt: new Date(now.getTime() + 30 * 86400000) },
    courses
}, over);
/** The server record of a genuinely finished course. */
const finished = (code) => ({ completedTopics: ids(TOT[code]), finalExamPassed: true, finalExamScore: 88 });
/** Topics done, exam not passed. */
const topicsOnly = (code) => ({ completedTopics: ids(TOT[code]) });
/** One topic short, exam passed. */
const oneShort = (code) => ({ completedTopics: ids(TOT[code] - 1), finalExamPassed: true });

/* ================================================================ *
 * 1. THE DECLARATION — within-pack only
 * ================================================================ */
{
    eq('A2 requires A1', API.COURSE_PREREQUISITE.A2, 'A1');
    eq('B2 requires B1', API.COURSE_PREREQUISITE.B2, 'B1');
    eq('A1 requires nothing', API.COURSE_PREREQUISITE.A1, undefined);
    eq('B1 requires nothing — B1B2 is sold on its own', API.COURSE_PREREQUISITE.B1, undefined);
    eq('exactly two prerequisites are declared',
        Object.keys(API.COURSE_PREREQUISITE).sort().join(','), 'A2,B2');
    /* the cross-pack rule that must NOT exist */
    ok(API.COURSE_PREREQUISITE.B1 !== 'A2',
        'no A2 -> B1 prerequisite was invented');

    /* the topic totals must agree with the two other places that declare them */
    const cabinet = read('my.cabinet/cabinet.js');
    const cabinetTotals = vm.runInNewContext('(' + cabinet.slice(
        cabinet.indexOf('{', cabinet.indexOf('COURSE_TOTAL_TOPICS')),
        cabinet.indexOf('});', cabinet.indexOf('COURSE_TOTAL_TOPICS')) + 1) + ')', {});
    const canonSrc = read('api/_lib/course-canon.js');
    const canon = vm.runInNewContext('(' + canonSrc.slice(
        canonSrc.indexOf('{', canonSrc.indexOf('export const COURSE_CANON')),
        canonSrc.indexOf('\n};', canonSrc.indexOf('export const COURSE_CANON')) + 2) + ')', {});
    Object.keys(TOT).forEach((c) => {
        eq(`${c}: firebase-client total == cabinet total`, TOT[c], cabinetTotals[c]);
        eq(`${c}: firebase-client total == server canon total`, TOT[c], canon[c].totalTopics);
    });
}

/* ================================================================ *
 * 2. WHAT "COMPLETED" MEANS — server fields only
 * ================================================================ */
{
    eq('a finished A1 is complete', API.isCourseCompleted(learner(['A1A2'], { A1: finished('A1') }), 'A1'), true);
    eq('all topics but no exam is NOT complete',
        API.isCourseCompleted(learner(['A1A2'], { A1: topicsOnly('A1') }), 'A1'), false);
    eq('exam passed but a topic missing is NOT complete',
        API.isCourseCompleted(learner(['A1A2'], { A1: oneShort('A1') }), 'A1'), false);
    eq('no course record at all is NOT complete',
        API.isCourseCompleted(learner(['A1A2'], {}), 'A1'), false);
    eq('an unknown course is never complete',
        API.isCourseCompleted(learner(['A1A2'], { ZZ: finished('A1') }), 'ZZ'), false);

    /* malformed completedTopics must never be counted as coverage */
    const malformed = [
        ['null', null], ['a string', '1,2,3,4,5,6,7,8,9,10,11,12'],
        ['an object', { 1: true, 2: true }],
        ['twelve duplicates of topic 1', Array(12).fill(1)],
        ['eleven real ids padded with 999', ids(11).concat([999])],
        ['ids with a non-numeric member', [1, 2, 'x', 4, 5, 6, 7, 8, 9, 10, 11, 12]],
        ['floats', ids(11).concat([12.5])],
        ['negatives padding', ids(11).concat([-1])],
        ['zero padding', ids(11).concat([0])]
    ];
    malformed.forEach(([label, completedTopics]) => {
        eq(`malformed completedTopics (${label}) is NOT completion`,
            API.isCourseCompleted(
                learner(['A1A2'], { A1: { completedTopics, finalExamPassed: true } }), 'A1'), false);
    });
    /* and the one genuine shape IS */
    eq('twelve genuine ids + a pass IS completion',
        API.isCourseCompleted(learner(['A1A2'], { A1: finished('A1') }), 'A1'), true);
    /* each course is sized by its own canon */
    eq('B1 needs twenty topics, not twelve',
        API.isCourseCompleted(learner(['B1B2'],
            { B1: { completedTopics: ids(12), finalExamPassed: true } }), 'B1'), false);
    eq('B1 with twenty is complete',
        API.isCourseCompleted(learner(['B1B2'], { B1: finished('B1') }), 'B1'), true);
}

/* ================================================================ *
 * 3. THE PREREQUISITE STATE
 * ================================================================ */
{
    /* CASE A — owns A1A2, A1 unfinished */
    const a = learner(['A1A2'], { A1: topicsOnly('A1') });
    eq('A · A1 has no prerequisite', API.getCoursePrerequisiteState(a, 'A1').satisfied, true);
    eq('A · A2 prerequisite NOT satisfied', API.getCoursePrerequisiteState(a, 'A2').satisfied, false);
    eq('A · and names A1', API.getCoursePrerequisiteState(a, 'A2').required, 'A1');
    eq('A · with the exact Uzbek message',
        API.getCoursePrerequisiteState(a, 'A2').message, 'Avval A1 kursini yakunlang');

    /* CASE B — owns A1A2, A1 genuinely finished */
    const b = learner(['A1A2'], { A1: finished('A1') });
    eq('B · A2 prerequisite satisfied', API.getCoursePrerequisiteState(b, 'A2').satisfied, true);

    /* CASE D — owns B1B2, B1 unfinished */
    const d = learner(['B1B2'], { B1: topicsOnly('B1') });
    eq('D · B1 opens with no prerequisite', API.getCoursePrerequisiteState(d, 'B1').satisfied, true);
    eq('D · B2 prerequisite NOT satisfied', API.getCoursePrerequisiteState(d, 'B2').satisfied, false);
    eq('D · with the exact Uzbek message',
        API.getCoursePrerequisiteState(d, 'B2').message, 'Avval B1 kursini yakunlang');

    /* CASE E — owns B1B2, B1 finished */
    const e = learner(['B1B2'], { B1: finished('B1') });
    eq('E · B2 prerequisite satisfied', API.getCoursePrerequisiteState(e, 'B2').satisfied, true);

    /* CASE F — owns both packs, A1 incomplete: B1 must still open */
    const f = learner(['A1A2', 'B1B2'], { A1: topicsOnly('A1') });
    eq('F · B1 opens even with A1 unfinished (no cross-pack rule)',
        API.getCoursePrerequisiteState(f, 'B1').satisfied, true);
    eq('F · but A2 stays locked', API.getCoursePrerequisiteState(f, 'A2').satisfied, false);

    /* a finished A2 does not satisfy B2 */
    const g = learner(['A1A2', 'B1B2'], { A1: finished('A1'), A2: finished('A2'), B1: topicsOnly('B1') });
    eq('a finished A2 does NOT unlock B2', API.getCoursePrerequisiteState(g, 'B2').satisfied, false);
    eq('finishing A1 unlocks only A2', API.getCoursePrerequisiteState(g, 'A2').satisfied, true);

    /* privileged bypass, as everywhere else on the platform */
    ['developer', 'admin'].forEach((role) => {
        const staff = learner([], {}, { role });
        eq(`${role} bypasses the prerequisite`,
            API.getCoursePrerequisiteState(staff, 'A2').satisfied, true);
        eq(`${role} bypass is reported as such`,
            API.getCoursePrerequisiteState(staff, 'A2').reason, 'privileged');
        eq(`${role} does NOT bypass when asked without the bypass`,
            API.getCoursePrerequisiteState(staff, 'A2', { allowPrivileged: false }).satisfied, false);
    });
    eq('a customer never bypasses',
        API.getCoursePrerequisiteState(learner(['A1A2'], {}, { role: 'customer' }), 'A2').satisfied, false);
}

/* ================================================================ *
 * 4. LOCAL FORGERY CANNOT SATISFY A PREREQUISITE
 * ================================================================ */
{
    /* The helper reads the PROFILE ONLY. There is no code path from
       localStorage into it, and these fixtures prove the fields a tampering
       learner would invent are simply not consulted. */
    const forged = learner(['A1A2'], {
        A1: {
            completedTopics: ids(3),
            finalExamPassed: false,
            /* everything a browser console could write: */
            courseCompleted: true, certificateUnlocked: true, certificateNumber: 'UZD-A1-2026-000001',
            finalExamScore: 100, localCompleted: true, fbConfirmed: true
        }
    });
    eq('a forged courseCompleted flag does not complete A1',
        API.isCourseCompleted(forged, 'A1'), false);
    eq('and does not unlock A2', API.getCoursePrerequisiteState(forged, 'A2').satisfied, false);

    /* THE HARDER CASE. Above, coverage was short, so the exam check was never
       even reached — a fallback that honoured `courseCompleted` would have gone
       unnoticed. Here EVERY topic is genuinely complete and only the exam is
       missing, so the exam condition is the single thing standing between the
       learner and the next course. Every flag a browser console can write is
       set to true alongside it. */
    const examOnlyMissing = learner(['A1A2'], {
        A1: {
            completedTopics: ids(TOT.A1),
            finalExamPassed: false,
            courseCompleted: true, certificateUnlocked: true, fbConfirmed: true,
            completed: true, passed: true, isComplete: true, done: true,
            finalExamScore: 100, certificateNumber: 'UZD-A1-2026-000001'
        }
    });
    eq('all topics + every forged flag but NO server exam pass: not complete',
        API.isCourseCompleted(examOnlyMissing, 'A1'), false);
    eq('and A2 stays locked', API.getCoursePrerequisiteState(examOnlyMissing, 'A2').satisfied, false);
    eq('and the A2 course page stays shut',
        API.canOpenCoursePage(examOnlyMissing, 'a2-course.html').allowed, false);
    /* the same for B1 -> B2 */
    const b1ExamMissing = learner(['B1B2'], {
        B1: { completedTopics: ids(TOT.B1), finalExamPassed: false,
              courseCompleted: true, certificateUnlocked: true, finalExamScore: 100 }
    });
    eq('B1 all topics + forged flags but no exam pass: B2 stays locked',
        API.getCoursePrerequisiteState(b1ExamMissing, 'B2').satisfied, false);
    /* adding the real server pass is the ONLY thing that opens it */
    const withPass = learner(['B1B2'], {
        B1: { completedTopics: ids(TOT.B1), finalExamPassed: true } });
    eq('the server exam pass is what opens B2',
        API.getCoursePrerequisiteState(withPass, 'B2').satisfied, true);

    const forgedB = learner(['B1B2'], {
        B1: { completedTopics: ids(2), finalExamPassed: false, courseCompleted: true,
              certificateNumber: 'UZD-B1-2026-000001', finalExamScore: 100 }
    });
    eq('a forged B1 completion does not unlock B2',
        API.getCoursePrerequisiteState(forgedB, 'B2').satisfied, false);

    /* the helper's source must not read browser storage at all */
    const src = CLIENT.slice(CLIENT.indexOf('export function isCourseCompleted'),
                             CLIENT.indexOf('export function canOpenCoursePage'));
    eq('the prerequisite helpers never touch localStorage', /localStorage/.test(src), false);
    eq('nor sessionStorage', /sessionStorage/.test(src), false);
    eq('nor the DOM', /document\./.test(src), false);
    ok(/profile\?\.courses/.test(src), 'they read the Firestore profile');
    ok(/finalExamPassed === true/.test(src), 'and require the server-written exam pass');
}

/* ================================================================ *
 * 5. THE PAGE GATE — entitlement first, then prerequisite
 * ================================================================ */
{
    const A2_PAGES = ['a2-course.html', 'a2-vocabulary.html', 'a2-final-exam.html'];
    const B2_PAGES = ['b2-course.html', 'b2-vocabulary.html', 'b2-final-exam.html'];
    const A1_PAGES = ['a1-course.html', 'a1-vocabulary.html', 'a1-final-exam.html'];
    const B1_PAGES = ['b1-course.html', 'b1-vocabulary.html', 'b1-final-exam.html'];

    /* the page -> course mapping the gate depends on */
    A2_PAGES.forEach((p) => eq(`${p} belongs to A2`, API.getCourseByPageName(p), 'A2'));
    B2_PAGES.forEach((p) => eq(`${p} belongs to B2`, API.getCourseByPageName(p), 'B2'));
    A1_PAGES.forEach((p) => eq(`${p} belongs to A1`, API.getCourseByPageName(p), 'A1'));
    B1_PAGES.forEach((p) => eq(`${p} belongs to B1`, API.getCourseByPageName(p), 'B1'));
    eq('a full URL resolves too',
        API.getCourseByPageName('/paid-courses/a2-vocabulary.html?topic=3#x'), 'A2');
    eq('a non-course page has no course', API.getCourseByPageName('dashboard.html'), null);

    /* DIRECT URL — owns A1A2, A1 unfinished */
    const blocked = learner(['A1A2'], { A1: topicsOnly('A1') });
    A1_PAGES.forEach((p) => {
        eq(`${p} opens (A1 has no prerequisite)`, API.canOpenCoursePage(blocked, p).allowed, true);
    });
    A2_PAGES.forEach((p) => {
        const r = API.canOpenCoursePage(blocked, p);
        eq(`${p} is REFUSED by direct URL`, r.allowed, false);
        eq(`${p} refusal reason is the prerequisite`, r.reason, 'prerequisite');
        eq(`${p} names the required course`, r.requiredCourse, 'A1');
        eq(`${p} carries the exact message`, r.message, 'Avval A1 kursini yakunlang');
    });

    /* once A1 is finished every A2 surface opens */
    const opened = learner(['A1A2'], { A1: finished('A1') });
    A2_PAGES.forEach((p) => eq(`${p} opens once A1 is finished`,
        API.canOpenCoursePage(opened, p).allowed, true));

    /* B2 by direct URL */
    const bBlocked = learner(['B1B2'], { B1: topicsOnly('B1') });
    B1_PAGES.forEach((p) => eq(`${p} opens (B1 has no prerequisite)`,
        API.canOpenCoursePage(bBlocked, p).allowed, true));
    B2_PAGES.forEach((p) => {
        const r = API.canOpenCoursePage(bBlocked, p);
        eq(`${p} is REFUSED by direct URL`, r.allowed, false);
        eq(`${p} carries the exact message`, r.message, 'Avval B1 kursini yakunlang');
    });
    const bOpened = learner(['B1B2'], { B1: finished('B1') });
    B2_PAGES.forEach((p) => eq(`${p} opens once B1 is finished`,
        API.canOpenCoursePage(bOpened, p).allowed, true));

    /* ENTITLEMENT IS ANSWERED FIRST. A learner with no pack must be told they
       have no access, not that they should go and finish A1. */
    const noPack = learner([], { A1: finished('A1') });
    const r = API.canOpenCoursePage(noPack, 'a2-course.html');
    eq('no pack: refused', r.allowed, false);
    eq('no pack: the reason is the pack, not the prerequisite', r.reason, 'pack');
    const wrongPack = learner(['B1B2'], { A1: finished('A1') });
    eq('wrong pack: refused on the pack', API.canOpenCoursePage(wrongPack, 'a2-course.html').reason, 'pack');
    /* frozen and expired still outrank the prerequisite */
    const frozen = learner(['A1A2'], { A1: topicsOnly('A1') },
        { accountFreeze: freeze.buildFreeze({}, { now, actorUid: 'admin' }).freeze });
    eq('frozen: refused as frozen, not as prerequisite',
        API.canOpenCoursePage(frozen, 'a2-course.html').reason, 'frozen');
    const expired = learner(['A1A2'], { A1: topicsOnly('A1') },
        { subscription: { active: true, endAt: new Date(now.getTime() - 86400000) } });
    eq('expired: refused as subscription',
        API.canOpenCoursePage(expired, 'a2-course.html').reason, 'subscription');
    const blockedAcct = learner(['A1A2'], { A1: topicsOnly('A1') }, { blocked: true });
    eq('blocked: refused as blocked',
        API.canOpenCoursePage(blockedAcct, 'a2-course.html').reason, 'blocked');

    /* staff open everything */
    ['developer', 'admin'].forEach((role) => {
        const staff = learner([], {}, { role });
        A2_PAGES.concat(B2_PAGES).forEach((p) => {
            eq(`${role} opens ${p}`, API.canOpenCoursePage(staff, p).allowed, true);
        });
    });

    /* THE GATEWAY MUST ACTUALLY ASK. Everything above proves the helper is
       right; this proves the paid pages CALL it. paid-platform.js is the single
       place every paid page passes through, and reverting it to the pack-only
       question is exactly how a direct-URL bypass comes back. */
    {
        const platform = read('paid-courses/paid-platform.js');
        ok(/canOpenCoursePage,/.test(platform),
            'the paid gateway imports the prerequisite-aware gate');
        ok(/const access = canOpenCoursePage\(profile, window\.location\.pathname\);/.test(platform),
            'and uses it to decide whether a paid page opens');
        eq('it no longer asks the pack-only question',
            /const access = canAccessPaid\(profile, requiredPack\);/.test(platform), false);
        ok(/access\.reason === 'prerequisite'/.test(platform),
            'it handles the prerequisite refusal specifically');
        {
            const at = platform.indexOf("access.reason === 'prerequisite'");
            const body = platform.slice(at, at + 400);
            ok(/showOverlayMessage\(access\.message/.test(body),
                'showing the message the helper produced, not an invented one');
            eq('and never «Ruxsat yo‘q» for a learner who owns the pack',
                /pack huquqingizga kirmaydi/.test(body), false);
        }
        /* the cabinet must call the same helper, so the two surfaces agree */
        const cabinet = read('my.cabinet/cabinet.js');
        ok(/getCoursePrerequisiteState/.test(cabinet),
            'the cabinet imports the same prerequisite helper');
        ok(/prerequisite: getCoursePrerequisiteState\(profile, courseCode\),/.test(cabinet),
            'and passes its result to every course card');
    }

    /* an ungated page is not accidentally swept into the prerequisite system */
    eq('a demo page stays ungated', API.canOpenCoursePage(blocked, 'b2-demo.html').allowed, true);
}

/* ================================================================ *
 * 6. THE CABINET CARD — the fourth state, rendered by the real code
 * ---------------------------------------------------------------- *
 * A learner who owns A1A2 and has not finished A1 used to be shown
 * «Ruxsat yo‘q» on the A2 card — a no-access button for something they
 * had already paid for. The card must distinguish NO ENTITLEMENT from
 * ENTITLED-BUT-NOT-EARNED, and it must say so in the exact words.
 * ================================================================ */
{
    const { JSDOM } = require('jsdom');
    const CAB = read('my.cabinet/cabinet.js');
    function liftFn(src, sig) {
        const i = src.indexOf(sig);
        if (i < 0) throw new Error('missing ' + sig);
        /* Start at the body brace, NOT the first brace after the name: a
           destructured parameter list — function f({ a, b }) — opens a brace of
           its own, and matching from there returns the signature instead of the
           function. */
        let d = 0, q = null, esc = false;
        for (let k = src.indexOf('{', src.indexOf(')', i)); k < src.length; k++) {
            const c = src[k];
            if (q) { if (esc) { esc = false; continue; } if (c === '\\') { esc = true; continue; } if (c === q) q = null; continue; }
            if (c === '"' || c === "'" || c === '`') { q = c; continue; }
            if (c === '{') d++;
            else if (c === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
        }
        throw new Error('unbalanced ' + sig);
    }
    const dom = new JSDOM('<!doctype html><body><div id="courses"></div></body>',
        { runScripts: 'outside-only' });
    const w = dom.window;
    w.canAccessPaid = API.canAccessPaid;
    w.getCoursePrerequisiteState = API.getCoursePrerequisiteState;
    w.eval(`
        var COMING_SOON_LABEL = 'Tez orada';
        var COMING_SOON_COURSES = new Set();
        ${CAB.slice(CAB.indexOf('const COURSE_CONFIG'), CAB.indexOf('});', CAB.indexOf('const COURSE_CONFIG')) + 3).replace('const ', 'var ')}
        ${CAB.slice(CAB.indexOf('const COURSE_TO_PACK'), CAB.indexOf('});', CAB.indexOf('const COURSE_TO_PACK')) + 3).replace('const ', 'var ')}
        ${CAB.slice(CAB.indexOf('const COURSE_TOTAL_TOPICS'), CAB.indexOf('});', CAB.indexOf('const COURSE_TOTAL_TOPICS')) + 3).replace('const ', 'var ')}
        ${liftFn(CAB, 'function isCourseComingSoon(')}
        ${liftFn(CAB, 'function getVocabLearnedCount(')}
        ${liftFn(CAB, 'function getCompletedTopicsCount(')}
        ${liftFn(CAB, 'function getCourseProgress(')}
        ${liftFn(CAB, 'function createCourseCard(')}
        ${liftFn(CAB, 'function renderDashboardCourses(')}
        var canAccessPaid = window.canAccessPaid;
        var getCoursePrerequisiteState = window.getCoursePrerequisiteState;
    `);

    /** Render the dashboard for a profile and read back each course card. */
    function cards(profile, privileged = false) {
        const host = w.document.getElementById('courses');
        w.__profile = profile;
        w.eval(`renderDashboardCourses(document.getElementById('courses'), window.__profile, ${privileged});`);
        const out = {};
        [...host.querySelectorAll('.course-card')].forEach((card, i) => {
            const code = ['A1', 'A2', 'B1', 'B2'][i];
            const btn = card.querySelector('button');
            const link = card.querySelector('a.btn');
            out[code] = {
                locked: card.className.includes('course-card-locked'),
                open: !!link,
                href: link ? link.getAttribute('href') : null,
                label: link ? link.textContent : (btn ? btn.textContent : null),
                disabled: btn ? btn.disabled : null,
                prereqAttr: btn ? btn.getAttribute('data-prerequisite') : null
            };
        });
        return out;
    }

    /* CASE A — owns A1A2, A1 unfinished */
    {
        const c = cards(learner(['A1A2'], { A1: topicsOnly('A1') }));
        eq('CASE A · A1 card is open', c.A1.open, true);
        eq('CASE A · pointing at the A1 course', c.A1.href, '../paid-courses/a1-course.html');
        eq('CASE A · A2 card is NOT open', c.A2.open, false);
        eq('CASE A · A2 card is visually locked', c.A2.locked, true);
        eq('CASE A · A2 button is disabled', c.A2.disabled, true);
        eq('CASE A · A2 says the exact prerequisite', c.A2.label, 'Avval A1 kursini yakunlang');
        ok(c.A2.label !== 'Ruxsat yo‘q',
            'CASE A · and NOT «Ruxsat yo‘q» — the learner already owns this pack');
        ok(c.A2.label !== 'Sotib oling', 'CASE A · and never «Sotib oling»');
        eq('CASE A · the card names the required course', c.A2.prereqAttr, 'A1');
    }
    /* CASE B — owns A1A2, A1 finished */
    {
        const c = cards(learner(['A1A2'], { A1: finished('A1') }));
        eq('CASE B · A2 card opens', c.A2.open, true);
        eq('CASE B · with the normal label', c.A2.label, 'Kursni ochish');
        eq('CASE B · and is not locked', c.A2.locked, false);
    }
    /* CASE C — no A1A2 at all */
    {
        const c = cards(learner(['B1B2'], { A1: finished('A1') }));
        eq('CASE C · A2 is refused', c.A2.open, false);
        eq('CASE C · as a no-entitlement card', c.A2.label, 'Ruxsat yo‘q');
        ok(c.A2.label !== 'Avval A1 kursini yakunlang',
            'CASE C · not as a prerequisite card — they have not bought it');
    }
    /* CASE D — owns B1B2, B1 unfinished */
    {
        const c = cards(learner(['B1B2'], { B1: topicsOnly('B1') }));
        eq('CASE D · B1 card is open', c.B1.open, true);
        eq('CASE D · B2 card is locked', c.B2.locked, true);
        eq('CASE D · B2 says the exact prerequisite', c.B2.label, 'Avval B1 kursini yakunlang');
        eq('CASE D · naming B1', c.B2.prereqAttr, 'B1');
    }
    /* CASE E — owns B1B2, B1 finished */
    {
        const c = cards(learner(['B1B2'], { B1: finished('B1') }));
        eq('CASE E · B2 card opens', c.B2.open, true);
        eq('CASE E · with the normal label', c.B2.label, 'Kursni ochish');
    }
    /* CASE F — owns both packs, A1 incomplete: B1 unaffected */
    {
        const c = cards(learner(['A1A2', 'B1B2'], { A1: topicsOnly('A1') }));
        eq('CASE F · B1 opens despite an unfinished A1', c.B1.open, true);
        eq('CASE F · A2 stays locked', c.A2.open, false);
        eq('CASE F · B2 is locked on ITS own prerequisite', c.B2.label, 'Avval B1 kursini yakunlang');
    }
    /* forged local-style flags on the profile cannot open the card */
    {
        const c = cards(learner(['A1A2'], {
            A1: { completedTopics: ids(2), courseCompleted: true, certificateUnlocked: true,
                  finalExamScore: 100, finalExamPassed: false } }));
        eq('forged flags do not open the A2 card', c.A2.open, false);
        eq('and it still states the prerequisite', c.A2.label, 'Avval A1 kursini yakunlang');
    }
    /* staff see everything */
    {
        const c = cards(learner([], {}, { role: 'developer' }), true);
        eq('developer: A2 card opens', c.A2.open, true);
        eq('developer: B2 card opens', c.B2.open, true);
    }
    dom.window.close();
}

console.log(`  A2 requires A1 · B2 requires B1 · no A2→B1 · entitlement answered before prerequisite`);
console.log('='.repeat(60));
if (fail) {
    console.log(`  ❌ COURSE PREREQUISITES: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ COURSE PREREQUISITES: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
