/* ============================================================================
   SMOKE TEST: global-nav.js (recently-reworked mobile navigation)
   ----------------------------------------------------------------------------
   Loads the REAL global-nav.js in a JSDOM page with a per-page UZN_NAV config
   and asserts it builds, opens, closes and is idempotent without throwing —
   guarding the mobile nav against JS regressions.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
let JSDOM; try { ({ JSDOM } = require('jsdom')); } catch (e) { console.error('need jsdom'); process.exit(2); }

const src = fs.readFileSync(path.join(__dirname, '..', 'global-nav.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  ' + x : ''))); };

const dom = new JSDOM('<!DOCTYPE html><body><main>content</main></body>',
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/paid-courses/a1-course.html' });
const w = dom.window;
w.HTMLElement.prototype.scrollIntoView = function () {};

w.eval('window.UZN_NAV = { back: "a1-course.html", buttons: [' +
    '{ label:"Mavzular", icon:"📚", href:"#topics" },' +
    '{ label:"Shaxsiy kabinet", icon:"🏠", href:"../my.cabinet/dashboard.html" } ] };');

let threw = null;
try {
    w.eval(src);
    // build() may be deferred to DOMContentLoaded depending on readyState.
    if (!w.document.getElementById('uznNavRoot')) {
        w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    }
} catch (e) { threw = e; }
ok('global-nav.js executes without throwing', !threw, threw && threw.message);

const root = w.document.getElementById('uznNavRoot');
ok('nav root mounted', !!root);
ok('edge tab present', !!w.document.getElementById('uznTab'));
ok('drawer present', !!w.document.getElementById('uznDrawer'));
ok('configured buttons + back rendered', w.document.querySelectorAll('.uzn-item').length === 3);

// open
w.document.getElementById('uznTab').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok('opens (drawer state)', root.classList.contains('open'));
// close via scrim
w.document.getElementById('uznScrim').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok('closes via scrim', !root.classList.contains('open'));

// idempotent — running again must not duplicate the root
let threw2 = null;
try { w.eval(src); } catch (e) { threw2 = e; }
ok('idempotent re-run does not throw', !threw2, threw2 && threw2.message);
ok('no duplicate nav roots', w.document.querySelectorAll('#uznNavRoot').length === 1);

console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exitCode = fail ? 1 : 0;
