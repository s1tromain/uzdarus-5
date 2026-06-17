/* Tests the REAL renderFinalExamEntry / showB1Certificate logic from
   b1-course.html against its real DOM (locked / available / completed). */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const src = fs.readFileSync(path.join(__dirname, '..', 'paid-courses', 'b1-course.html'), 'utf8');

// --- extract a `function NAME() { ... }` block by brace-matching (strings aware) ---
function extractFn(text, signature) {
    const start = text.indexOf(signature);
    if (start < 0) throw new Error('not found: ' + signature);
    const braceIdx = text.indexOf('{', start);
    let depth = 0, i = braceIdx, q = null, esc = false;
    for (; i < text.length; i++) {
        const c = text[i];
        if (q) { if (esc) { esc = false; continue; } if (c === '\\') { esc = true; continue; } if (c === q) q = null; continue; }
        if (c === '"' || c === "'" || c === '`') { q = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
    throw new Error('unbalanced: ' + signature);
}

const fnRender = extractFn(src, 'function renderFinalExamEntry()');
const fnCert = extractFn(src, 'function showB1Certificate()');
const fnReadLocal = extractFn(src, 'function readLocalB1Completion()');
const fnMerge = extractFn(src, 'function mergeB1Completion(');
const fnIsPriv = extractFn(src, 'function b1IsPrivileged()');
const fnAllDone = extractFn(src, 'function b1AllTopicsCompleted()');
const fnCertUnlocked = extractFn(src, 'function b1CertificateUnlocked()');

// Minimal page: only the elements the functions touch.
const pageHtml = `<!DOCTYPE html><html><body>
<section id="finalExamEntry" style="display:none;"><div class="container"><div class="final-exam-entry" id="finalExamEntryCard"></div></div></section>
<div class="b1-cert-overlay" id="b1CertOverlay"><div class="b1-cert">
  <div class="b1-cert-name" id="b1CertName"></div>
  <div id="b1CertScore"></div><div id="b1CertDate"></div><div id="b1CertId"></div>
  <button id="b1CertCloseBtn"></button><button id="b1CertPrintBtn"></button>
</div></div>
</body></html>`;

const dom = new JSDOM(pageHtml, { runScripts: 'outside-only' });
const w = dom.window;
w.print = () => {};

// stubs the functions close over
const topics = []; for (let i = 1; i <= 20; i++) topics.push({ id: i });
w.eval(`
  var courseData = { topics: ${JSON.stringify(topics)} };
  var completedTopics = [];
  var currentUser = { id: 'u_abcdef123', name: 'Test Talaba' };
  var b1Completion = { finalExamPassed:false, courseCompleted:false, certificateUnlocked:false, finalExamScore:null, finalExamCompletedAt:null, fbConfirmed:false };
  ${fnReadLocal}
  ${fnMerge}
  ${fnIsPriv}
  ${fnAllDone}
  ${fnCertUnlocked}
  ${fnRender}
  ${fnCert}
`);

let failures = 0;
function check(name, cond) { console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) failures++; }
const card = () => w.document.getElementById('finalExamEntryCard');

console.log('STATE 1 — locked (5/20 topics done)');
w.eval('completedTopics = [1,2,3,4,5]; renderFinalExamEntry();');
check('section visible', w.document.getElementById('finalExamEntry').style.display === '');
check('card has locked class', card().className.includes('locked'));
check('shows QULFLANGAN + progress 5 / 20', /QULFLANGAN/.test(card().innerHTML) && /5 \/ 20 mavzu/.test(card().innerHTML));
check('start button disabled', /disabled/.test(card().innerHTML));

console.log('STATE 2 — available (20/20 done, not passed)');
w.eval('completedTopics = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]; renderFinalExamEntry();');
check('not locked', !card().className.includes('locked') && !card().className.includes('completed'));
check('shows start button text', /Yakuniy Imtihonni Boshlash/.test(card().innerHTML));
check('lists 5 section scores', /Grammatika — 40 ball/.test(card().innerHTML) && /Muloqot va vaziyatlar — 20 ball/.test(card().innerHTML));
const startBtn = w.document.getElementById('b1StartExamBtn');
check('start button wired', !!startBtn && typeof startBtn.onclick === 'function');

console.log('STATE 3 — completed (Firebase-confirmed pass + all topics)');
w.eval("b1Completion = { finalExamPassed:true, courseCompleted:true, certificateUnlocked:true, finalExamScore:92, finalExamCompletedAt:'2026-06-15T10:00:00.000Z', fbConfirmed:true }; renderFinalExamEntry();");
check('card has completed class', card().className.includes('completed'));
check('shows "muvaffaqiyatli tugatildi"', /muvaffaqiyatli tugatildi/.test(card().innerHTML));
check('shows score 92', /92 ball/.test(card().innerHTML));
check('certificate button present', !!w.document.getElementById('b1ShowCertBtn'));

console.log('STATE 3b — certificate modal opens (legitimately unlocked)');
w.eval('showB1Certificate();');
check('cert overlay shown', w.document.getElementById('b1CertOverlay').classList.contains('show'));
check('cert name filled', w.document.getElementById('b1CertName').textContent === 'Test Talaba');
check('cert score 92 / 100', w.document.getElementById('b1CertScore').textContent === '92 / 100');
check('cert id derived', /^B1-/.test(w.document.getElementById('b1CertId').textContent));

console.log('SECURITY — localStorage-only pass (NOT Firebase-confirmed) must NOT unlock cert');
w.eval("document.getElementById('b1CertOverlay').classList.remove('show'); completedTopics = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]; b1Completion = { finalExamPassed:true, courseCompleted:true, certificateUnlocked:true, finalExamScore:99, finalExamCompletedAt:'x', fbConfirmed:false }; renderFinalExamEntry();");
check('NOT completed (no cert) when fbConfirmed=false', !card().className.includes('completed'));
check('no certificate button when fbConfirmed=false', !w.document.getElementById('b1ShowCertBtn'));
w.eval('showB1Certificate();');
check('cert modal stays closed when fbConfirmed=false', !w.document.getElementById('b1CertOverlay').classList.contains('show'));

console.log('SECURITY — passed+confirmed but topics incomplete must NOT unlock cert');
w.eval("completedTopics = [1,2,3]; b1Completion = { finalExamPassed:true, courseCompleted:true, certificateUnlocked:true, finalExamScore:88, finalExamCompletedAt:'x', fbConfirmed:true }; renderFinalExamEntry();");
check('locked state (not completed) when topics<20', card().className.includes('locked'));
w.eval('showB1Certificate();');
check('cert modal stays closed when topics<20', !w.document.getElementById('b1CertOverlay').classList.contains('show'));

console.log('DEVELOPER — bypasses completion: cert + exam entry unlocked with 0 topics done');
w.eval("document.getElementById('b1CertOverlay').classList.remove('show'); window.currentUser = { id:'devUID', name:'Dev Account', role:'developer' }; completedTopics = []; b1Completion = { finalExamPassed:false, courseCompleted:false, certificateUnlocked:false, finalExamScore:null, finalExamCompletedAt:null, fbConfirmed:false }; renderFinalExamEntry();");
check('dev: NOT locked even with 0 topics', !card().className.includes('locked'));
check('dev: certificate button available', !!w.document.getElementById('b1ShowCertBtn'));
w.eval('showB1Certificate();');
check('dev: certificate modal opens', w.document.getElementById('b1CertOverlay').classList.contains('show'));

console.log('CUSTOMER — role cleared: gates re-apply (no bypass leakage)');
w.eval("document.getElementById('b1CertOverlay').classList.remove('show'); window.currentUser = { id:'custUID', name:'Customer', role:'customer' }; completedTopics = [1,2,3]; renderFinalExamEntry();");
check('customer: locked with 3 topics', card().className.includes('locked'));
w.eval('showB1Certificate();');
check('customer: certificate modal stays closed', !w.document.getElementById('b1CertOverlay').classList.contains('show'));

console.log('\n' + (failures === 0 ? 'ALL COURSE-ENTRY TESTS PASSED ✓' : failures + ' CHECK(S) FAILED ✗'));
process.exit(failures === 0 ? 0 : 1);
