/* ============================================================================
   PROOF: premium vocabulary audio auth fix (Bug #3)
   ----------------------------------------------------------------------------
   Extracts the REAL _whenAuthReady / _authHeaders / _getAuthHeaders from
   paid-courses/speech.js and reproduces the race that made paid users look
   anonymous to the server (→ 403 → "Ovoz funksiyasi to'liq versiyada mavjud").

   Scenario: a logged-in PAID user taps Tinglash/Talaffuz BEFORE the cached
   token (window._uzdaIdToken) has been populated.
     - OLD sync _getAuthHeaders(): returns NO Authorization header  -> server
       sees anonymous -> demo/IP limit -> 403 -> demo message.  (reproduces bug)
     - NEW async _authHeaders(): awaits auth readiness + a fresh getIdToken and
       DOES attach the Bearer token.  (bug fixed)
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'paid-courses', 'speech.js'), 'utf8');

function extract(re, name) {
    const m = src.match(re);
    if (!m) { console.error('could not extract ' + name); process.exit(3); }
    return m[0];
}
const readySrc    = extract(/let _authReadyPromise = null;[\s\S]*?\n}/, '_whenAuthReady');
const authSrc     = extract(/async function _authHeaders\(\)[\s\S]*?\n}/, '_authHeaders');
const legacySrc   = extract(/function _getAuthHeaders\(\)[\s\S]*?\n}/, '_getAuthHeaders');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

// Build a logged-in firebase mock whose auth state restores asynchronously
// (the real race) and whose getIdToken resolves a fresh token.
function makeEnv(loggedIn) {
    const user = loggedIn ? { getIdToken: async () => 'FRESH_TOKEN' } : null;
    const fb = {
        auth: () => ({
            currentUser: null, // <- not yet restored at tap time (the race)
            onAuthStateChanged: (cb) => { setTimeout(() => cb(user), 5); return () => {}; },
        }),
    };
    const win = { _uzdaIdToken: null }; // <- token NOT cached yet (the race)
    const factory = new Function('window', 'firebase', 'setTimeout',
        readySrc + '\n' + authSrc + '\n' + legacySrc +
        '\nreturn { _authHeaders, _getAuthHeaders };');
    return { api: factory(win, fb, setTimeout), win };
}

(async () => {
    console.log('[A] PAID user, token not cached yet (the production race)');
    {
        const { api } = makeEnv(true);
        const legacy = api._getAuthHeaders();
        ok('OLD sync _getAuthHeaders sends NO token (reproduces the bug)',
            !legacy.Authorization, JSON.stringify(legacy));
        const fixed = await api._authHeaders();
        ok('NEW _authHeaders attaches Bearer token (bug fixed)',
            fixed.Authorization === 'Bearer FRESH_TOKEN', JSON.stringify(fixed));
    }

    console.log('\n[B] Anonymous visitor (no user) still works without auth');
    {
        const { api } = makeEnv(false);
        const fixed = await api._authHeaders();
        ok('no user -> empty headers (anonymous allowed)', !fixed.Authorization);
    }

    console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
    process.exitCode = fail ? 1 : 0;
})();
