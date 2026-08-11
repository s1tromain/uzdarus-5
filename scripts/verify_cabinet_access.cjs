#!/usr/bin/env node
/**
 * verify_cabinet_access.cjs — the Dashboard course card must be decided by the
 * SUBSCRIPTION, not by an editorial flag.
 *
 * THE BUG THIS EXISTS TO CATCH
 * ----------------------------
 * createCourseCard() branches like this:
 *
 *     if (comingSoon)      -> "Tez orada", disabled
 *     else if (hasAccess)  -> "Kursni ochish"
 *     else                 -> "Ruxsat yo'q"
 *
 * `comingSoon` short-circuits BEFORE `hasAccess` is consulted. So a course
 * listed in COMING_SOON_COURSES shows "Tez orada" to a paying customer whose
 * subscription was computed correctly and then silently discarded.
 *
 * A2 and B2 sat in that set from Phase 5, when they had no lessons. Both ship
 * authored lessons now, so paying customers with an active A1A2 / B1B2 pack
 * were locked out of courses they had paid for. cabinet.js had NO test
 * coverage at all, which is why it survived to release.
 *
 * These assertions pin both directions:
 *   1. empty set + active subscription  -> "Kursni ochish" for all four courses
 *   2. course inside the set            -> "Tez orada" REGARDLESS of subscription
 *   3. A2/B2 may never be re-added to the set while they have lessons
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };

const SRC = fs.readFileSync(path.join(ROOT, 'my.cabinet/cabinet.js'), 'utf8');

/** Lift a function out of cabinet.js by brace matching — the real source. */
function grab(name) {
    const i = SRC.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('missing ' + name);
    /* Skip the parameter list first: createCourseCard destructures its argument,
       so the first '{' after the name belongs to the parameters, not the body. */
    let p = 0, bodyStart = -1;
    for (let k = SRC.indexOf('(', i); k < SRC.length; k++) {
        if (SRC[k] === '(') p++;
        else if (SRC[k] === ')') { p--; if (p === 0) { bodyStart = SRC.indexOf('{', k); break; } }
    }
    if (bodyStart < 0) throw new Error('no body for ' + name);
    let d = 0;
    for (let k = bodyStart; k < SRC.length; k++) {
        if (SRC[k] === '{') d++;
        else if (SRC[k] === '}') { d--; if (d === 0) return SRC.slice(i, k + 1); }
    }
    throw new Error('unbalanced ' + name);
}
const grabConst = (re, label) => {
    const m = SRC.match(re);
    if (!m) throw new Error('missing ' + label);
    return m[0];
};

console.log('\n=== DASHBOARD COURSE ACCESS ===');

const w = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' }).window;
w.eval([
    grabConst(/const COMING_SOON_COURSES = Object\.freeze\(new Set\((?:\[[^\]]*\])?\)\);/, 'COMING_SOON_COURSES'),
    grabConst(/const COMING_SOON_LABEL = '[^']*';/, 'COMING_SOON_LABEL'),
    grabConst(/const COURSE_TO_PACK = Object\.freeze\(\{[\s\S]*?\}\);/, 'COURSE_TO_PACK'),
    grab('isCourseComingSoon'),
    grab('createCourseCard'),
    'window.__api = { SET: COMING_SOON_COURSES, LABEL: COMING_SOON_LABEL,' +
    ' MAP: COURSE_TO_PACK, soon: isCourseComingSoon, card: createCourseCard };'
].join('\n'));

const API = w.__api;
const COURSES = ['A1', 'A2', 'B1', 'B2'];
const PROGRESS = { completedTopics: 0, totalTopics: 16, progressPercent: 0 };

/** Render a card exactly the way renderCourseCards() does, and read its CTA. */
function cta(courseCode, { comingSoon, hasAccess }) {
    const card = API.card({
        courseCode, title: courseCode, description: 'd', href: './x.html',
        progress: PROGRESS, comingSoon, hasAccess, vocabLearned: 0
    });
    const btn = card.querySelector('a.btn, button.btn');
    return btn ? btn.textContent.trim() : '(no control)';
}

/* ------------------------------------------------ 1. the mapping is intact */
ok(JSON.stringify(API.MAP) ===
   JSON.stringify({ A1: 'A1A2', A2: 'A1A2', B1: 'B1B2', B2: 'B1B2' }),
    'course -> pack mapping unchanged (A2 belongs to A1A2, B2 to B1B2)');

/* --------------------------- 2. A2/B2 must not be force-hidden any more */
ok(!API.SET.has('A2'), 'A2 is NOT in COMING_SOON_COURSES (it has authored lessons)');
ok(!API.SET.has('B2'), 'B2 is NOT in COMING_SOON_COURSES (it has authored lessons)');
console.log(`  COMING_SOON_COURSES = {${[...API.SET].join(', ') || ''}} (size ${API.SET.size})`);

COURSES.forEach(c => {
    ok(API.soon(c, false) === false, `${c}: not "coming soon" for a customer`);
    ok(API.soon(c, true) === false, `${c}: not "coming soon" for staff`);
});

/* ------------- 3. active subscription => "Kursni ochish" for every course */
console.log('\n  active subscription:');
COURSES.forEach(c => {
    const label = cta(c, { comingSoon: API.soon(c, false), hasAccess: true });
    console.log(`    ${c} -> ${label}`);
    ok(label === 'Kursni ochish', `${c}: a paying customer gets "Kursni ochish"`);
});

/* ------------------------ 4. no subscription => the no-access control */
console.log('\n  no subscription:');
COURSES.forEach(c => {
    const label = cta(c, { comingSoon: API.soon(c, false), hasAccess: false });
    console.log(`    ${c} -> ${label}`);
    ok(label !== 'Kursni ochish', `${c}: a customer without a pack does not get the course`);
    ok(label !== API.LABEL, `${c}: a customer without a pack sees "no access", not "coming soon"`);
});

/* ---- 5. the reverse: a course inside the set is hidden REGARDLESS of pack */
console.log('\n  forced into COMING_SOON_COURSES:');
[true, false].forEach(hasAccess => {
    const label = cta('C1', { comingSoon: true, hasAccess });
    console.log(`    C1 (hasAccess=${hasAccess}) -> ${label}`);
    ok(label === API.LABEL,
        `a listed course shows "${API.LABEL}" even when hasAccess=${hasAccess}`);
});

/* ---- 6. and that is precisely why the flag must never hold a live course */
ok(cta('A2', { comingSoon: true, hasAccess: true }) === API.LABEL,
    'proof of the failure mode: listing A2 would override an active subscription');

console.log('\n' + '='.repeat(60));
if (fail) {
    console.log(`  ❌ DASHBOARD COURSE ACCESS: ${fail} failed / ${pass + fail}\n`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(60) + '\n');
    process.exit(1);
}
console.log(`  ✅ DASHBOARD COURSE ACCESS: ${pass}/${pass} passed`);
console.log('='.repeat(60) + '\n');
