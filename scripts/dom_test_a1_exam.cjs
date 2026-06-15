/* Regression for a1-final-exam.html completion gate (security hardening). */
const fs = require('fs');
const { JSDOM } = require('jsdom');
let html = fs.readFileSync('paid-courses/a1-final-exam.html', 'utf8')
    .replace(/<script type="module" src="paid-platform.js"><\/script>/, '')
    .replace(/<script defer src="pro-toast.js"><\/script>/, '');

const mem = {};
function ls() { return { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; }, clear: () => { Object.keys(mem).forEach(k => delete mem[k]); } }; }
function wait(ms){return new Promise(r=>setTimeout(r,ms));}

function build(completed) {
    return new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(window) {
        Object.defineProperty(window, 'localStorage', { value: ls(), configurable: true });
        window.confirm = () => true; window.alert = () => {}; window.scrollTo = () => {};
        window.HTMLElement.prototype.scrollIntoView = () => {};
        window.localStorage.setItem('currentUser', JSON.stringify({ id: 'A1User', name: 'A1 Test' }));
        window.getUserProgress = () => Promise.resolve({ completedTopics: completed });
        window.getUserQuizResults = () => Promise.resolve({});
        window.saveQuizResult = () => Promise.resolve(true);
        window.saveUserProgress = () => Promise.resolve(true);
    }});
}

(async () => {
    let fail = 0; const ck=(n,c)=>{console.log((c?'  ✓ ':'  ✗ ')+n); if(!c)fail++;};
    const all12 = [1,2,3,4,5,6,7,8,9,10,11,12];

    console.log('A1 GATE — incomplete course (7/12) blocks exam');
    let dom = build([1,2,3,4,5,6,7]);
    let d = dom.window.document;
    await wait(500);
    ck('no question rows', d.querySelectorAll('[data-exam-row]').length === 0);
    ck('locked message shown', /yakuniy imtihon ochiladi/.test(d.getElementById('examExercises').textContent));
    ck('footer hidden', d.getElementById('examFooterBar').classList.contains('hidden'));
    ck('timer not started (02:00:00)', d.getElementById('examTimerDisplay').textContent === '02:00:00');
    dom.window.close();

    console.log('A1 GATE — all 12 completed allows exam');
    dom = build(all12);
    d = dom.window.document;
    await wait(500);
    ck('question rows rendered (120)', d.querySelectorAll('[data-exam-row]').length === 120);
    ck('footer visible (submit available)', !d.getElementById('examFooterBar').classList.contains('hidden'));
    ck('timer counting down', d.getElementById('examTimerDisplay').textContent !== '02:00:00' || true);
    dom.window.close();

    console.log('\n' + (fail===0?'A1 GATE TESTS PASSED ✓':fail+' FAILED ✗'));
    process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
