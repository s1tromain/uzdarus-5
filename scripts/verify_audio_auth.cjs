/* ============================================================================
   PROOF: premium vocabulary audio auth fix (root cause: SDK mismatch)
   ----------------------------------------------------------------------------
   ROOT CAUSE
     paid-courses/speech.js authenticated the TTS / pronunciation endpoints
     through a COMPAT Firebase global (`firebase.auth()`). The paid platform
     only ever loads the MODULAR SDK (firebase-client.js), which does NOT create
     that global. So `typeof firebase === 'undefined'` on every paid page, the
     Authorization header was NEVER attached, and the server billed a paid user
     as anonymous → demo/IP quota → 403 → the client showed
     "Ovoz funksiyasi to'liq versiyada mavjud." to Premium users.

   FIX
     firebase-client.js now publishes a stable auth bridge on
     window.uzAuthBridge, and speech.js reads the signed-in user + fresh ID
     token from that SAME modular session (compat kept only as a fallback).

   This script extracts the REAL auth helpers from speech.js and exercises them
   in a PRODUCTION-LIKE sandbox: the compat `firebase` global is undefined, and
   the modular bridge is (or isn't) present. It proves:
     A) paid page + bridge + signed-in paid user  -> Bearer token attached (FIX)
     B) paid page + NO bridge (the old broken prod) -> NO token (reproduces bug)
     C) demo page (no bridge by design)             -> anonymous, resolves fast
     D) bridge present + signed-out user            -> anonymous (empty headers)
   Note: `firebase` is intentionally never defined here — exactly as in prod.
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
const bridgeSrc  = extract(/function _getAuthBridge\(\)[\s\S]*?\n}/, '_getAuthBridge');
const waitSrc    = extract(/function _waitForAuthBridge\(timeoutMs\)[\s\S]*?\n}/, '_waitForAuthBridge');
const resolveSrc = extract(/async function _resolveAuthUser\(\)[\s\S]*?\n}/, '_resolveAuthUser');
const readySrc   = extract(/let _authReadyPromise = null;[\s\S]*?\n}/, '_whenAuthReady');
const authSrc    = extract(/async function _authHeaders\(\)[\s\S]*?\n}/, '_authHeaders');
const legacySrc  = extract(/function _getAuthHeaders\(\)[\s\S]*?\n}/, '_getAuthHeaders');

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  ' + extra : ''))); };

/* Build the real speech.js auth helpers in a sandbox. `firebase` (compat) is
   NEVER provided — `typeof firebase` resolves to 'undefined', exactly as on the
   live paid pages. The modular session is provided via window.uzAuthBridge. */
function makeApi({ hasBridge, loggedIn, isDemo }) {
    const user = loggedIn ? { getIdToken: async () => 'FRESH_TOKEN' } : null;
    const win = { _uzdaIdToken: null };
    if (hasBridge) {
        win.uzAuthBridge = {
            ready: Promise.resolve(user),
            getUser: () => user,
            isRestored: () => true,
            getIdToken: async () => (user ? 'FRESH_TOKEN' : null),
            onChange: () => () => {},
        };
    }
    const _isDemoSpeechPage = () => !!isDemo;
    const factory = new Function(
        'window', 'setTimeout', 'setInterval', 'clearInterval', 'Date', 'Promise', '_isDemoSpeechPage',
        [bridgeSrc, waitSrc, resolveSrc, readySrc, authSrc, legacySrc].join('\n') +
        '\nreturn { _authHeaders, _getAuthHeaders, _whenAuthReady };'
    );
    return {
        api: factory(win, setTimeout, setInterval, clearInterval, Date, Promise, _isDemoSpeechPage),
        win,
    };
}

(async () => {
    console.log('[A] PAID page + modular bridge + signed-in PAID user (the fix)');
    {
        const { api } = makeApi({ hasBridge: true, loggedIn: true, isDemo: false });
        const h = await api._authHeaders();
        ok('_authHeaders attaches Bearer token from the modular session',
            h.Authorization === 'Bearer FRESH_TOKEN', JSON.stringify(h));
    }

    console.log('\n[B] PAID page + NO bridge, compat undefined (reproduces the OLD bug)');
    {
        const { api } = makeApi({ hasBridge: false, loggedIn: true, isDemo: false });
        const h = await api._authHeaders();   // waits out the bridge timeout, then null
        ok('without the bridge NO token is sent -> server sees anonymous (the bug)',
            !h.Authorization, JSON.stringify(h));
    }

    console.log('\n[C] DEMO page (no Firebase session by design)');
    {
        const { api } = makeApi({ hasBridge: false, loggedIn: false, isDemo: true });
        const t0 = Date.now();
        const h = await api._authHeaders();
        const dt = Date.now() - t0;
        ok('demo page resolves anonymous with NO token', !h.Authorization, JSON.stringify(h));
        ok('demo page does NOT stall waiting for a bridge (<1s)', dt < 1000, dt + 'ms');
    }

    console.log('\n[D] Bridge present but user signed OUT');
    {
        const { api } = makeApi({ hasBridge: true, loggedIn: false, isDemo: false });
        const h = await api._authHeaders();
        ok('signed-out user -> empty headers (anonymous allowed)', !h.Authorization);
    }

    console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
    process.exitCode = fail ? 1 : 0;
})();
