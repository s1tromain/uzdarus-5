#!/usr/bin/env node
/**
 * verify_graduation_platform.cjs — the invariants that span A1, A2, B1 and B2.
 *
 * Every course already has its own verifiers, and they were all green while A2
 * shipped a certificate no learner could open. They were green because each of
 * them tested ITS OWN course against ITS OWN expectations, and none of them
 * asked the question that would have caught it:
 *
 *     "does every course wire its graduation the same way?"
 *
 * A2 was the odd one out — mergeA2Completion() defined and never called — and
 * nothing compared the four. That is what this suite is for. It does not
 * duplicate the per-course suites; it asserts the CROSS-COURSE contract:
 *
 *   CONFIG   every certifiable course has a canon, an exam, a certificate
 *            registry entry, a course page, an exam page and an access pack,
 *            and all six agree on the same course code and the same size.
 *
 *   WIRING   every course page that has a certificate hydrates it from
 *            Firestore, and only Firestore may confirm a pass.
 *
 *   GATE     unfinished -> no certificate; local-only pass -> no certificate;
 *            remote pass + unfinished -> no certificate; remote pass +
 *            finished -> eligible. Driven per course, not asserted per course.
 *
 *   SHAPE    the final exam is a resource beside the course, never a topic
 *            after the last one.
 *
 * Course-specific numbers are read from the repository, never typed here, so a
 * course that grows finds this suite already correct.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l) => { if (c) { pass++; } else { fail++; failures.push(l); } };
const eq = (l, a, b) => ok(Object.is(a, b), `${l} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ids = (n) => Array.from({ length: n }, (_, i) => i + 1);

console.log('\n=== GRADUATION PLATFORM (A1 · A2 · B1 · B2) ===');

/* ------------------------------------------------------------------ *
 * THE COURSE TABLE — derived, not declared.
 * ------------------------------------------------------------------ */
const CERT_SRC = read('api/_lib/certificates.js');
const CANON_SRC = read('api/_lib/course-canon.js');
const CLIENT = read('firebase-client.js');

const certCourses = [...CERT_SRC.matchAll(/^ {4}([A-Z0-9]+): \{/gm)].map((m) => m[1]);
/* the two generated literals, evaluated rather than pattern-matched */
const vm = require('vm');
const grabLiteral = (src, name) => vm.runInNewContext('(' + src.slice(
    src.indexOf('{', src.indexOf('export const ' + name)),
    src.indexOf('\n};', src.indexOf('export const ' + name)) + 2) + ')', {});
const COURSE_CANON = grabLiteral(CANON_SRC, 'COURSE_CANON');
const EXAM_CANON = grabLiteral(CANON_SRC, 'EXAM_CANON');

const COURSES = certCourses.map((code) => ({
    code,
    lower: code.toLowerCase(),
    coursePage: `paid-courses/${code.toLowerCase()}-course.html`,
    examPage: `paid-courses/${code.toLowerCase()}-final-exam.html`,
    pack: code.startsWith('A') ? 'A1A2' : 'B1B2'
}));
console.log(`  certifiable courses: ${certCourses.join(', ')}`);

/* ================================================================ *
 * 1. CONFIG MATRIX — every course agrees with itself everywhere
 * ================================================================ */
{
    ok(certCourses.length >= 4, `at least four certifiable courses (${certCourses.length})`);
    certCourses.forEach((c) => {
        ok(!!COURSE_CANON[c], `${c}: exists in COURSE_CANON`);
        ok(!!EXAM_CANON[c], `${c}: has a final exam in EXAM_CANON`);
    });
    /* and nothing is certifiable that has no exam, or examinable with no canon */
    Object.keys(EXAM_CANON).forEach((c) => {
        ok(!!COURSE_CANON[c], `${c}: an exam course must have a canon`);
    });
    Object.keys(COURSE_CANON).forEach((c) => {
        ok(certCourses.includes(c) || !EXAM_CANON[c],
            `${c}: a course with an exam is certifiable`);
    });

    COURSES.forEach((c) => {
        const total = COURSE_CANON[c.code].totalTopics;
        ok(total > 0, `${c.code}: canon declares ${total} topics`);
        eq(`${c.code}: canon topic ids are 1..${total}`,
            COURSE_CANON[c.code].topicIds.join(','), ids(total).join(','));
        ok(fs.existsSync(path.join(ROOT, c.coursePage)), `${c.code}: the course page exists`);
        ok(fs.existsSync(path.join(ROOT, c.examPage)), `${c.code}: the exam page exists`);

        /* ONE GATE, NOT FOUR. Each page used to carry its own required-topic
           constant and its own two failure screens; the four copies drifted,
           and A1's read the platform helper before the deferred module had
           installed it — so every A1 learner was told to check their internet.
           The number now lives in exam-gate.js, pinned to this same canon by
           verify_exam_progression.cjs, and the page's job is to delegate. */
        const exam = read(c.examPage);
        const gateSrc = read('exam-gate.js');
        ok(/<script src="\.\.\/exam-gate\.js">/.test(exam),
            `${c.code}: the exam page loads the shared gate`);
        ok(/UzExamGate\.mount\(/.test(exam),
            `${c.code}: and delegates the decision to it`);
        eq(`${c.code}: the shared gate knows this course is ${total} topics`,
            Number((gateSrc.match(new RegExp(c.code + ':\\s*(\\d+)')) || [])[1]), total);
        /* the exam may be started ONLY from the gate's eligible callback */
        ok(/onEligible: function \(\) \{[\s\S]{0,400}?startExam\(\);/.test(exam),
            `${c.code}: an unfinished course is locked out`);
        ok(!/^(?![\s\S]*onEligible)[\s\S]*startExam\(\)/.test(exam),
            `${c.code}: nothing starts the exam outside that callback`);
        /* and the gate itself is eligible ONLY when nothing is missing */
        ok(/state: missing\.length \? STATES\.LOCKED : STATES\.ELIGIBLE/.test(gateSrc),
            `${c.code}: an unreadable course state fails CLOSED`);
        ok(/window\.getAuthoritativeCourseProgress/.test(exam),
            `${c.code}: eligibility comes from the authoritative helper`);
        /* the page speaks for its own course, however it says so */
        const declared = (exam.match(/var COURSE = '([A-Z0-9]+)';/) || [])[1];
        ok(declared === c.code || !declared,
            `${c.code}: any declared COURSE constant is its own`);
        eq(`${c.code}: it submits as its own course`,
            new RegExp(`submitFinalExam\\('${c.code}',`).test(exam), true);
        certCourses.filter((o) => o !== c.code).forEach((o) => {
            eq(`${c.code}: it never submits as ${o}`,
                new RegExp(`submitFinalExam\\('${o}',`).test(exam), false);
        });
        ok(new RegExp(`'${c.lower}-course\\.html`).test(exam),
            `${c.code}: it returns to its own course page`);
        /* the completion cache is course- and user-scoped, in either idiom */
        ok(new RegExp(`'${c.lower}_completion_' \\+ (USER_ID|uid)`).test(exam),
            `${c.code}: the completion cache key is ${c.lower}_completion_<uid>`);
        /* and every localStorage key this page writes carries the user */
        const keys = [...exam.matchAll(/localStorage\.setItem\(\s*(?:'|")([a-z0-9_]+)(?:'|")\s*\+/g)]
            .map((m) => m[1]);
        keys.forEach((k) => ok(k.startsWith(c.lower + '_'),
            `${c.code}: cache key '${k}…' is namespaced to its own course`));
        const bare = [...exam.matchAll(/localStorage\.setItem\(\s*(?:'|")([a-z0-9_]+)(?:'|")\s*[,)]/g)]
            .map((m) => m[1]).filter((k) => k !== 'currentUser');
        eq(`${c.code}: no exam cache key is shared across users`, bare.length, 0);

        /* PASS MARK — read from the page, compared with the canon the server uses */
        const mark = exam.match(/var (?:passed|previewPassed) = (?:finalScore|pct|previewPct) >= (\d+);/);
        ok(!!mark, `${c.code}: the exam page declares a pass mark`);
        if (mark) {
            eq(`${c.code}: page pass mark == server canon pass mark`,
                Number(mark[1]), EXAM_CANON[c.code].passMark);
        }
        /* the exam bank the server grades is the bank the page shows */
        /* the bank is a JS literal, not guaranteed JSON — A1 and B1 use single
           quotes — so it is evaluated the way the browser evaluates it */
        const literal = exam.match(/var FINAL_EXAM_DATA = (\[[\s\S]*?\]);\r?\n/);
        ok(!!literal, `${c.code}: the exam page carries FINAL_EXAM_DATA`);
        const data = literal ? vm.runInNewContext('(' + literal[1] + ')', {}) : [];
        eq(`${c.code}: page groups == canon groups`, data.length, EXAM_CANON[c.code].groups.length);
        const pageItems = data.reduce((s, g) => s + g.items.length, 0);
        const canonItems = EXAM_CANON[c.code].groups.reduce((s, g) => s + g.items.length, 0);
        eq(`${c.code}: page items == canon items`, pageItems, canonItems);
        c.__items = pageItems;
        c.__groups = data.length;
        c.__mark = mark ? Number(mark[1]) : null;
        c.__total = total;
    });
}

/* ================================================================ *
 * 2. ACCESS — every paid learning surface routes to a pack
 * ================================================================ */
const freeze = require(path.join(ROOT, 'account-freeze.js'));
function liftExport(name) {
    const i = CLIENT.indexOf('export function ' + name + '(');
    let d = 0;
    const b = CLIENT.indexOf('{', CLIENT.indexOf(')', i));
    for (let k = b; k < CLIENT.length; k++) {
        if (CLIENT[k] === '{') d++;
        else if (CLIENT[k] === '}') { d--; if (d === 0) return CLIENT.slice(i, k + 1).replace('export ', ''); }
    }
    throw new Error('unbalanced ' + name);
}
const GATE = new Function('isAccountFrozen', `
    const PRIVILEGED_ROLES = new Set(['developer','admin']);
    function extractRole(u){ return typeof u==='string'?u.trim().toLowerCase():String(u?.role||'').trim().toLowerCase(); }
    function normalizeDate(v){ if(!v) return null; if(typeof v?.toDate==='function') return v.toDate();
        const d=new Date(v); return Number.isNaN(d.getTime())?null:d; }
    const packToCourses = ${CLIENT.slice(CLIENT.indexOf('const packToCourses'),
        CLIENT.indexOf('};', CLIENT.indexOf('const packToCourses')) + 2).replace('const packToCourses =', '')}
    ${liftExport('isPrivilegedRole')}
    ${liftExport('hasActiveSubscription')}
    ${liftExport('hasPackAccess')}
    ${liftExport('canAccessPaid')}
    ${liftExport('getPackByPageName')}
    return { canAccessPaid, getPackByPageName, packToCourses };
`)(freeze.isAccountFrozen);
{
    const now = new Date();
    const holder = (packs) => ({ role: 'customer', accessPacks: packs,
        subscription: { active: true, endAt: new Date(now.getTime() + 30 * 86400000) } });

    /* EVERY paid page is mapped. An unmapped paid page has no gate at all. */
    const paidPages = fs.readdirSync(path.join(ROOT, 'paid-courses')).filter((f) => f.endsWith('.html'));
    const unmapped = paidPages.filter((p) => GATE.getPackByPageName(p) === null);
    unmapped.forEach((p) => ok(false, `${p}: PAID PAGE WITH NO ACCESS PACK — the gate would let it through`));
    eq('every paid page routes to a pack', unmapped.length, 0);

    /* No page is claimed by two packs, and no mapping names a file that is gone. */
    const map = GATE.packToCourses;
    const seen = {};
    Object.entries(map).forEach(([pack, list]) => list.forEach((page) => {
        if (seen[page]) ok(false, `${page} is mapped by both ${seen[page]} and ${pack}`);
        seen[page] = pack;
        ok(fs.existsSync(path.join(ROOT, 'paid-courses', page)),
            `${pack} -> ${page}: the file exists`);
    }));
    eq('no page is mapped twice', Object.keys(seen).length,
        Object.values(map).reduce((s, l) => s + l.length, 0));

    COURSES.forEach((c) => {
        eq(`${c.code}: the course page is in the ${c.pack} pack`,
            GATE.getPackByPageName(`${c.lower}-course.html`), c.pack);
        eq(`${c.code}: the exam page is in the ${c.pack} pack`,
            GATE.getPackByPageName(`${c.lower}-final-exam.html`), c.pack);
        /* holding the OTHER pack must not open this exam */
        const other = c.pack === 'A1A2' ? 'B1B2' : 'A1A2';
        eq(`${c.code}: holding only ${other} does NOT open this exam`,
            GATE.canAccessPaid(holder([other]), c.pack).allowed, false);
        eq(`${c.code}: holding ${c.pack} does`,
            GATE.canAccessPaid(holder([c.pack]), c.pack).allowed, true);
        const frozen = Object.assign(holder([c.pack]),
            { accountFreeze: freeze.buildFreeze({}, { now, actorUid: 'admin' }).freeze });
        eq(`${c.code}: a frozen holder is refused as frozen`,
            GATE.canAccessPaid(frozen, c.pack).reason, 'frozen');
    });
    /* a demo must never be gated as a paid certifying surface */
    ['b2-demo.html', 'a2-demo.html', 'b1-demo.html', 'a1-demo.html'].forEach((d) => {
        if (!fs.existsSync(path.join(ROOT, d))) return;
        eq(`${d} is not mapped as a paid page`, GATE.getPackByPageName(d), null);
    });
}

/* ================================================================ *
 * 3. HYDRATION — THE GUARD THAT WOULD HAVE CAUGHT THE A2 BUG
 * ---------------------------------------------------------------- *
 * Each course page holds the same two helpers. A2 shipped with both
 * DEFINED and NEITHER CALLED, so its certificate could never open.
 * Counting call sites across all four courses is cheap, and it is
 * exactly the comparison no per-course suite was making.
 * ================================================================ */
const PAGES = {};
COURSES.forEach((c) => { PAGES[c.code] = read(c.coursePage); });
{
    COURSES.forEach((c) => {
        const src = PAGES[c.code];
        const C = c.code;
        const calls = (name) =>
            (src.split(name).length - 1) - (src.split('function ' + name).length - 1);

        const merge = `merge${C}Completion`;
        const readLocal = `readLocal${C}Completion`;
        ok(new RegExp('function ' + merge + '\\(').test(src), `${C}: ${merge}() is defined`);
        ok(new RegExp('function ' + readLocal + '\\(').test(src), `${C}: ${readLocal}() is defined`);
        /* THE REGRESSION. A definition with no call site is dead wiring. */
        ok(calls(merge) >= 1, `${C}: ${merge}() IS CALLED (${calls(merge)} call sites)`);
        ok(calls(readLocal) >= 1, `${C}: ${readLocal}() IS CALLED (${calls(readLocal)} call sites)`);

        /* the authoritative merge must exist and be fed a server record */
        ok(new RegExp(merge + '\\((savedProgress|rp|remote|progress)[^,]*, true\\)').test(src),
            `${C}: the Firestore record is merged as authoritative`);
        /* and the cache merge must never claim to be one */
        eq(`${C}: no localStorage merge is passed fromFirebase=true`,
            new RegExp(merge + '\\(' + readLocal + '\\(\\), true\\)').test(src), false);
        ok(new RegExp(merge + '\\(' + readLocal + '\\(\\), false\\)').test(src),
            `${C}: the localStorage cache is merged as NON-authoritative`);

        /* exactly one writer of the confirmation flag, and it is the remote branch */
        const writers = (src.match(new RegExp(c.lower + 'Completion\\.fbConfirmed = true', 'g')) || []).length;
        eq(`${C}: exactly one writer of fbConfirmed`, writers, 1);
        ok(new RegExp('if \\(fromFirebase && src\\.finalExamPassed\\) ' + c.lower +
            'Completion\\.fbConfirmed = true;').test(src),
            `${C}: fbConfirmed is written only on a Firebase-sourced pass`);

        /* the gate needs BOTH halves */
        ok(new RegExp(c.lower + 'AllTopicsCompleted\\(\\) && ' + c.lower +
            'Completion\\.finalExamPassed && ' + c.lower + 'Completion\\.fbConfirmed').test(src),
            `${C}: the certificate needs all topics AND a confirmed pass`);
        /* issuance names its own course */
        ok(new RegExp("issueCertificate\\('" + C + "'\\)").test(src),
            `${C}: issuance asks for ${C}`);
        certCourses.filter((o) => o !== C).forEach((o) => {
            eq(`${C}: never asks for ${o}`,
                new RegExp("issueCertificate\\('" + o + "'\\)").test(src), false);
        });
        /* the completion cache key is course- and user-scoped */
        ok(new RegExp("'" + c.lower + "_completion_' \\+ uid").test(src),
            `${C}: the completion cache key is ${c.lower}_completion_<uid>`);
        /* the exam CTA points at its own exam */
        ok(new RegExp(c.lower + '-final-exam\\.html').test(src),
            `${C}: the entry card opens its own exam`);
    });
}

/* ================================================================ *
 * 4. THE GATE, DRIVEN — the same five states for every course
 * ================================================================ */
function extractFn(text, signature) {
    const start = text.indexOf(signature);
    if (start < 0) return null;
    let depth = 0, q = null, esc = false;
    for (let i = text.indexOf('{', start); i < text.length; i++) {
        const ch = text[i];
        if (q) { if (esc) { esc = false; continue; } if (ch === '\\') { esc = true; continue; } if (ch === q) q = null; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
    return null;
}
/** Boot one course's certificate gate over a fixture, using its own code. */
function bootGate(c, { completed, role = 'customer', remote = null, local = null }) {
    const src = PAGES[c.code], C = c.code, l = c.lower;
    const total = c.__total;
    const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
    const w = dom.window, mem = {};
    Object.defineProperty(w, 'localStorage', { value: {
        getItem: (k) => (k in mem ? mem[k] : null),
        setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } },
        configurable: true });
    w.currentUser = { id: 'u1', name: 'Test Talaba', role };
    w.currentUserId = 'u1';
    if (local) mem[`${l}_completion_u1`] = JSON.stringify(local);
    const done = ids(completed);
    /* both progress shapes: A1/A2/B1 read completedTopics, B2 reads userProgress */
    const userProgress = {};
    done.forEach((id) => { userProgress[id] = { completed: true }; });
    const decl = (src.match(new RegExp(' *let ' + l + 'Completion = \\{[^\\n]*\\n')) || [''])[0]
        .replace('let ', 'var ');
    ok(!!decl.trim(), `${C}: the completion state declaration was found`);
    const fns = [`function readLocal${C}Completion()`, `function merge${C}Completion(`,
        `function ${l}IsPrivileged()`, `function ${l}AllTopicsCompleted()`,
        `function ${l}CertificateUnlocked()`]
        .map((sig) => extractFn(src, sig));
    fns.forEach((f, i) => ok(!!f, `${C}: gate function #${i + 1} was extracted`));
    w.eval(`
        var courseData = { topics: ${JSON.stringify(ids(total).map((id) => ({ id })))} };
        var completedTopics = ${JSON.stringify(done)};
        var userProgress = ${JSON.stringify(userProgress)};
        var currentUser = { id: 'u1', name: 'Test Talaba', role: ${JSON.stringify(role)} };
        var currentUserId = 'u1';
        ${decl}
        ${fns.filter(Boolean).join('\n')}
    `);
    if (remote) w.eval(`merge${C}Completion(${JSON.stringify(remote)}, true);`);
    if (local) w.eval(`merge${C}Completion(readLocal${C}Completion(), false);`);
    return w;
}
{
    COURSES.forEach((c) => {
        const C = c.code, l = c.lower, total = c.__total;

        /* STATE 1 — unfinished, no exam: nothing is granted */
        {
            const w = bootGate(c, { completed: Math.max(1, total - 5) });
            eq(`${C}: unfinished course -> no certificate`, w.eval(`${l}CertificateUnlocked()`), false);
            w.close();
        }
        /* STATE 2 — every topic done, exam not passed */
        {
            const w = bootGate(c, { completed: total, remote: { finalExamScore: 0 } });
            eq(`${C}: finished but not passed -> no certificate`,
                w.eval(`${l}CertificateUnlocked()`), false);
            eq(`${C}: all topics ARE recognised as complete`,
                w.eval(`${l}AllTopicsCompleted()`), true);
            w.close();
        }
        /* STATE 3 — server-confirmed pass + finished */
        {
            const w = bootGate(c, { completed: total,
                remote: { finalExamPassed: true, finalExamScore: 88 } });
            eq(`${C}: remote pass + finished -> ELIGIBLE`, w.eval(`${l}CertificateUnlocked()`), true);
            eq(`${C}: and Firebase-confirmed`, w.eval(`${l}Completion.fbConfirmed`), true);
            eq(`${C}: the server score hydrated`, w.eval(`${l}Completion.finalExamScore`), 88);
            w.close();
        }
        /* STATE 4 — a pass invented in localStorage */
        {
            const w = bootGate(c, { completed: total, local: {
                finalExamPassed: true, courseCompleted: true, certificateUnlocked: true,
                finalExamScore: 100, fbConfirmed: true,
                certificateNumber: `UZD-${C}-2026-999999` } });
            eq(`${C}: local-only pass -> NOT confirmed`, w.eval(`${l}Completion.fbConfirmed`), false);
            eq(`${C}: local-only pass -> NO certificate`, w.eval(`${l}CertificateUnlocked()`), false);
            w.close();
        }
        /* STATE 5 — remote pass but a topic missing */
        {
            const w = bootGate(c, { completed: total - 1,
                remote: { finalExamPassed: true, finalExamScore: 100 } });
            eq(`${C}: remote pass + ${total - 1}/${total} -> NO certificate`,
                w.eval(`${l}CertificateUnlocked()`), false);
            eq(`${C}: (the pass itself IS confirmed)`, w.eval(`${l}Completion.fbConfirmed`), true);
            w.close();
        }
        /* privileged bypass, identical across courses */
        {
            ['developer', 'admin'].forEach((role) => {
                const w = bootGate(c, { completed: 0, role });
                eq(`${C}: ${role} keeps the testing bypass`,
                    w.eval(`${l}CertificateUnlocked()`), true);
                w.close();
            });
        }
    });
}

/* ================================================================ *
 * 4b. THE CERTIFICATE ON SCREEN MUST MATCH THE ONE THAT ISSUES
 * ---------------------------------------------------------------- *
 * The modal a learner reads and the record the server writes are two
 * separate pieces of text, and they drifted: A2's modal was copied
 * from B1 and told the learner they had completed «O'rta daraja» and
 * TWENTY topics, while the issued A2 certificate said «Elementar
 * daraja» and the course has sixteen. Nothing compared them.
 *
 * CERT_COURSES is the authority; the modal is checked against it, and
 * the topic count against the canon.
 * ================================================================ */
{
    const CERT = vm.runInNewContext('(' + CERT_SRC.slice(
        CERT_SRC.indexOf('{', CERT_SRC.indexOf('CERT_COURSES = Object.freeze')),
        CERT_SRC.indexOf('\n});', CERT_SRC.indexOf('CERT_COURSES = Object.freeze')) + 2) + ')',
        { Object });
    COURSES.forEach((c) => {
        const src = PAGES[c.code];
        const cfg = CERT[c.code];
        ok(!!cfg, `${c.code}: has a CERT_COURSES entry`);
        if (!cfg) return;
        eq(`${c.code}: the registry level is its own code`, cfg.level, c.code);
        eq(`${c.code}: the registry title is its own`, cfg.courseTitle,
            `${c.code} Daraja — Rus tili`);
        ok(cfg.levelLabel.startsWith(c.code + ' «'),
            `${c.code}: the registry level label opens with its own code (${cfg.levelLabel})`);
        /* no two courses may share a level label — that is what a copy/paste
           between two course configs looks like */
        certCourses.filter((o) => o !== c.code).forEach((o) => {
            eq(`${c.code}: does not share ${o}'s level label`,
                cfg.levelLabel === CERT[o].levelLabel, false);
            eq(`${c.code}: does not share ${o}'s course title`,
                cfg.courseTitle === CERT[o].courseTitle, false);
        });

        /* ---- the modal in the page ---- */
        const body = (src.match(new RegExp(
            '<div class="' + c.lower + '-cert-body">([\\s\\S]*?)</div>')) || [])[1];
        ok(!!body, `${c.code}: the certificate modal has a body`);
        if (!body) return;
        /* the level phrase the modal shows must be the registry's, minus the
           course code the modal already prints in its own title */
        const phrase = cfg.levelLabel.replace(c.code + ' ', '');
        ok(body.includes(phrase),
            `${c.code}: the modal states the registry level ${phrase} — modal says «`
            + ((body.match(/«[^»]*»/) || ['none'])[0]) + '»');
        /* and the topic count must be the canon's */
        const said = [...body.matchAll(/(\d+) ta mavzu/g)].map((m) => Number(m[1]));
        eq(`${c.code}: the modal names exactly one topic count`, said.length, 1);
        eq(`${c.code}: and it is the canon's ${c.__total}`, said[0], c.__total);

        const title = (src.match(new RegExp(
            '<div class="' + c.lower + '-cert-title">([^<]*)</div>')) || [])[1];
        eq(`${c.code}: the modal title is the registry course title`, title, cfg.courseTitle);
    });
}

/* ================================================================ *
 * 5. SHAPE — the exam is a resource, never a phantom next topic
 * ================================================================ */
{
    COURSES.forEach((c) => {
        const total = c.__total;
        const src = PAGES[c.code];
        const phantom = total + 1;
        eq(`${c.code}: the course page invents no topic ${phantom}`,
            new RegExp(`\\bid: ${phantom}\\b|Topic ?${phantom}\\b|topic${phantom}\\b`, 'i').test(src), false);
        eq(`${c.code}: the exam page invents no topic ${phantom}`,
            new RegExp(`\\bid: ${phantom}\\b|Topic ?${phantom}\\b|topic${phantom}\\b`, 'i').test(read(c.examPage)), false);
        eq(`${c.code}: canon stops at ${total}`, COURSE_CANON[c.code].topicIds.includes(phantom), false);
        /* the entry lives in its own section, not in the topic grid */
        ok(/id="finalExamEntry"/.test(src), `${c.code}: the exam entry has its own section`);
    });
    /* NO CROSS-COURSE TOPIC COUNTS IN GRADUATION COPY. Each course may only
       speak its own number. */
    const totals = COURSES.map((c) => c.__total);
    COURSES.forEach((c) => {
        const exam = read(c.examPage);
        totals.filter((t) => t !== c.__total).forEach((foreign) => {
            eq(`${c.code}: the exam page never says "${foreign} ta mavzu"`,
                new RegExp(`${foreign} ta mavzu`).test(exam), false);
        });
        ok(new RegExp(`${c.__total} ta mavzu`).test(exam),
            `${c.code}: the exam page says its own ${c.__total} topics`);
    });
}

/* ------------------------------------------------------------------ */
console.log('');
console.log('  Course | Canon | Exam groups × items | Pass | Cert | Pack');
console.log('  -------+-------+---------------------+------+------+-------');
COURSES.forEach((c) => {
    console.log(`  ${c.code.padEnd(6)} | ${String(c.__total).padStart(5)} | `
        + `${String(c.__groups).padStart(6)} × ${String(c.__items).padEnd(10)} | `
        + `${String(c.__mark).padStart(4)} | ${'yes'.padStart(4)} | ${c.pack}`);
});
console.log('');
console.log('='.repeat(62));
if (fail) {
    console.log(`  ❌ GRADUATION PLATFORM: ${fail} failed / ${pass + fail}\n`);
    failures.slice(0, 30).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('='.repeat(62) + '\n');
    process.exit(1);
}
console.log(`  ✅ GRADUATION PLATFORM: ${pass}/${pass} passed`);
console.log('='.repeat(62) + '\n');
