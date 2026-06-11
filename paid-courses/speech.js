console.log("🔥 THIS IS MY FILE");

window._awardXP = () => {};
window._updateStreakBadge = () => {};
window._showXpToast = () => {};
window._showLevelUpPopup = () => {};
window._showStreakReminder = () => {};

console.log("\uD83D\uDE80 SPEECH.JS LOADED");

/*
 * \u2705 SYSTEM IS PRODUCTION READY (April 2026)
 * \u2757 Do not rewrite recognition flow — changes only via small patches
 * \u2757 _runPronunciationAssessment + finishSafe are the critical path
 */

/**
 * speech.js — Shared TTS & Pronunciation Assessment module for UzdaRus.
 *
 * Each page must define window.getCurrentWord() returning { ru, uz }
 * (the current flashcard word object) before using these functions.
 *
 * Dependencies:
 *   - Azure Speech SDK loaded via <script src="https://aka.ms/csspeech/jsbrowserpackageraw">
 *   - /api/tts   (POST { text, voice } → audio/mpeg)
 *   - /api/speech-token (GET → { token, region })
 */

/* ================================================================== */
/*  Auth helper — send Bearer token when Firebase user is signed in   */
/* ================================================================== */
function _getAuthHeaders() {
    const headers = {};
    try {
        const fbAuth = typeof firebase !== 'undefined' && firebase.auth && firebase.auth();
        const user = fbAuth && fbAuth.currentUser;
        if (user) {
            if (window._uzdaIdToken) {
                headers['Authorization'] = `Bearer ${window._uzdaIdToken}`;
            }
        }
    } catch { /* ignore — works without auth too */ }
    return headers;
}

/** Refresh and cache the Firebase ID token (call once on page load) */
async function _refreshAuthToken() {
    try {
        const fbAuth = typeof firebase !== 'undefined' && firebase.auth && firebase.auth();
        const user = fbAuth && fbAuth.currentUser;
        if (user) {
            window._uzdaIdToken = await user.getIdToken();
            setTimeout(_refreshAuthToken, 50 * 60 * 1000);
        }
    } catch { /* ignore */ }
}

// kick off token caching when the module loads
if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged(user => {
        if (user) _refreshAuthToken();
        else window._uzdaIdToken = null;
    });
}

/* ================================================================== */
/*  Azure Speech SDK loader — resilient multi-CDN + auto-retry        */
/*  ----------------------------------------------------------------  */
/*  ROOT CAUSE of "Speech SDK yuklanmadi. Sahifani yangilang.":       */
/*  every page loaded the SDK from a SINGLE redirect URL              */
/*  (https://aka.ms/csspeech/jsbrowserpackageraw) as a plain <script> */
/*  tag with NO error handling, NO retry and NO fallback. When that   */
/*  redirect/CDN was slow or blocked — common inside the Telegram     */
/*  Mini App in-app webview and on flaky mobile networks — the tag    */
/*  failed silently, window.SpeechSDK stayed undefined forever and    */
/*  the next mic tap hit the hard alert with no way to recover but a  */
/*  full page reload.                                                 */
/*                                                                    */
/*  This loader fixes it: it preloads the SDK on page load, tries     */
/*  several CDNs in turn, retries automatically with backoff, exposes */
/*  a ready-state the UI gates the mic button on, and lets the        */
/*  recognition flow await a ready SDK instead of erroring out.       */
/* ================================================================== */
var SPEECH_SDK_URLS = [
    'https://aka.ms/csspeech/jsbrowserpackageraw',
    'https://cdn.jsdelivr.net/npm/microsoft-cognitiveservices-speech-sdk@1.40.0/distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle-min.js',
    'https://unpkg.com/microsoft-cognitiveservices-speech-sdk@1.40.0/distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle-min.js'
];
var SPEECH_SDK_LOAD_TIMEOUT = 12000;  /* per-attempt timeout (ms) */
var SPEECH_SDK_MAX_RETRIES = 2;       /* extra full passes over the URL list */
var _speechSdkPromise = null;

function _speechSdkReady() {
    return typeof window !== 'undefined'
        && !!window.SpeechSDK
        && typeof window.SpeechSDK.SpeechRecognizer === 'function';
}

function _delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/* Poll for an SDK that another <script> tag (e.g. the static one still in
   the page) may set on its own — avoids injecting a duplicate in the
   common case where the page tag eventually wins the race. */
function _waitForSpeechSdk(ms) {
    return new Promise(function (resolve) {
        if (_speechSdkReady()) { resolve(true); return; }
        var start = Date.now();
        var iv = setInterval(function () {
            if (_speechSdkReady()) { clearInterval(iv); resolve(true); }
            /* bail out immediately if the static page tag hard-errored, so we
               jump straight to the fallback CDNs instead of waiting it out */
            else if (window.__speechSdkTagFailed || Date.now() - start >= ms) {
                clearInterval(iv);
                resolve(false);
            }
        }, 150);
    });
}

/* Inject one SDK <script> tag and resolve when window.SpeechSDK appears. */
function _injectSpeechSdkScript(url, timeout) {
    return new Promise(function (resolve, reject) {
        if (_speechSdkReady()) { resolve(); return; }

        var done = false;
        var timer = setTimeout(function () {
            finish(false, new Error('Speech SDK timeout: ' + url));
        }, timeout);

        function finish(ok, err) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            if (ok || _speechSdkReady()) resolve();
            else reject(err || new Error('Speech SDK load error: ' + url));
        }

        var s = document.createElement('script');
        s.src = url;
        s.async = true;
        s.setAttribute('data-speech-sdk-fallback', '1');
        s.onload = function () { finish(true); };
        s.onerror = function () {
            try { if (s.parentNode) s.parentNode.removeChild(s); } catch (e) {}
            finish(false, new Error('Speech SDK script error: ' + url));
        };
        (document.head || document.documentElement).appendChild(s);
    });
}

/* Public: returns a Promise that resolves with window.SpeechSDK once the
   SDK is fully loaded, retrying across CDNs automatically. Concurrent
   callers share a single in-flight promise. */
function _ensureSpeechSDK() {
    if (_speechSdkReady()) return Promise.resolve(window.SpeechSDK);
    if (_speechSdkPromise) return _speechSdkPromise;

    _setSpeechSdkUiState('loading');

    _speechSdkPromise = (async function () {
        /* 1) give any pre-existing static <script> tag a head start so we
              don't download the bundle twice on a normal connection (skipped
              if that tag already hard-errored) */
        if (!window.__speechSdkTagFailed &&
            document.querySelector('script[src*="csspeech"]:not([data-speech-sdk-fallback])')) {
            if (await _waitForSpeechSdk(4000)) return window.SpeechSDK;
        }

        /* 2) fallback chain with automatic retries */
        var lastErr = null;
        for (var pass = 0; pass <= SPEECH_SDK_MAX_RETRIES; pass++) {
            for (var i = 0; i < SPEECH_SDK_URLS.length; i++) {
                if (_speechSdkReady()) return window.SpeechSDK;
                try {
                    console.log('[SDK] loading attempt', pass + 1, '→', SPEECH_SDK_URLS[i]);
                    await _injectSpeechSdkScript(SPEECH_SDK_URLS[i], SPEECH_SDK_LOAD_TIMEOUT);
                    if (_speechSdkReady()) return window.SpeechSDK;
                } catch (e) {
                    lastErr = e;
                    console.warn('[SDK] load failed:', e && e.message);
                }
            }
            if (!_speechSdkReady() && pass < SPEECH_SDK_MAX_RETRIES) {
                await _delay(800 * (pass + 1));  /* linear backoff before next pass */
            }
        }

        if (_speechSdkReady()) return window.SpeechSDK;

        _speechSdkPromise = null;   /* allow a fresh attempt on the next tap */
        throw lastErr || new Error('Speech SDK yuklanmadi');
    })().then(function (sdk) {
        _setSpeechSdkUiState('ready');
        return sdk;
    }).catch(function (err) {
        _setSpeechSdkUiState('error');
        throw err;
    });

    return _speechSdkPromise;
}

/* Reflect SDK readiness on <body> so the mic buttons can show a safe
   loading state and stay visually disabled until the SDK is ready. */
function _setSpeechSdkUiState(state) {
    if (typeof document === 'undefined' || !document.body) return;
    var cls = document.body.classList;
    cls.remove('speech-sdk-loading', 'speech-sdk-ready', 'speech-sdk-error');
    cls.add('speech-sdk-' + state);
}

/* Kick off preloading as early as possible (and again on DOM ready in
   case the body wasn't available yet for the UI-state class). */
if (typeof window !== 'undefined') {
    var _startSpeechSdkPreload = function () {
        _setSpeechSdkUiState(_speechSdkReady() ? 'ready' : 'loading');
        _ensureSpeechSDK().catch(function (e) {
            console.warn('[SDK] preload failed (will retry on tap):', e && e.message);
        });
    };
    if (typeof document !== 'undefined' && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _startSpeechSdkPreload);
    } else {
        _startSpeechSdkPreload();
    }
}

/* ================================================================== */
/*  Global recording guard (anti-spam)                                */
/* ================================================================== */
let _isRecording = false;
let _pronClosed = false;
let _activeAttemptId = 0;
let _pronAttemptStartedAt = 0;
let _pronResultDelayTimer = 0;
let _lastPronTriggerEl = null;
let _lastPronRetryAction = null;
let _demoPronUiSyncTimer = 0;
let _demoPaywallClicked = false;
let _demoPaywallResetTimer = 0;
let _demoPaywallRedirectTimer = 0;
let _redirecting = false;
const DEMO_ALLOWED_TOPICS = [1];

if (typeof window !== 'undefined' && typeof window._isPronRunning === 'undefined') {
    window._isPronRunning = false;
}

function _isDemoSpeechPage() {
    var path = (window.location && window.location.pathname || '').toLowerCase();
    return /-demo-vocabulary\.html$/.test(path);
}

function _isDemoLocked(topicId) {
    if (!_isDemoSpeechPage()) return false;
    if (typeof topicId !== 'number') return false;
    return DEMO_ALLOWED_TOPICS.indexOf(topicId) === -1;
}

function _setDemoPronunciationLockState(locked) {
    var btns = document.querySelectorAll('.audio-button.pron-btn');
    btns.forEach(function (micBtn) {
        if (!micBtn) return;
        micBtn.classList.add('mic-btn');
        micBtn.classList.toggle('locked', !!locked);
        micBtn.title = locked ? 'Доступно только в Premium' : '';
    });
}

function _syncDemoPronunciationLockState() {
    var word = typeof window.getCurrentWord === 'function' && window.getCurrentWord();
    var topicId = word && word.topicId != null ? word.topicId : null;
    _setDemoPronunciationLockState(_isDemoLocked(topicId));
}

function _scheduleDemoPronunciationLockSync() {
    clearTimeout(_demoPronUiSyncTimer);
    _demoPronUiSyncTimer = setTimeout(function () {
        _demoPronUiSyncTimer = 0;
        _syncDemoPronunciationLockState();
    }, 0);
}

/* ================================================================== */
/*  Microphone selector                                               */
/* ================================================================== */
function _getSavedMicId() {
    return localStorage.getItem('mic_device') || '';
}

async function _enumerateMics() {
    try {
        /* permission prompt so labels are visible */
        var tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
        tmp.getTracks().forEach(function (t) { t.stop(); });
    } catch { /* ignore — labels may be empty */ }

    var all = await navigator.mediaDevices.enumerateDevices();
    return all.filter(function (d) { return d.kind === 'audioinput'; });
}

async function _initMicSelector() {
    var sel = document.getElementById('micSelect');
    if (!sel) return;

    var mics = await _enumerateMics();
    var saved = _getSavedMicId();

    sel.innerHTML = '';
    mics.forEach(function (mic, i) {
        var opt = document.createElement('option');
        opt.value = mic.deviceId;
        opt.textContent = mic.label || ('Mikrofon ' + (i + 1));
        if (mic.deviceId === saved) opt.selected = true;
        sel.appendChild(opt);
    });

    /* auto-select first if nothing saved */
    if (!saved && mics.length) {
        localStorage.setItem('mic_device', mics[0].deviceId);
    }

    sel.addEventListener('change', function () {
        localStorage.setItem('mic_device', sel.value);
        console.log('[MIC] selected:', sel.value);
    });

    console.log('[MIC] selector ready,', mics.length, 'device(s)');
}

/** Inject mic selector UI if no #micSelect exists on the page */
function _injectMicSelector() {
    if (document.getElementById('micSelect')) return;

    var wrap = document.querySelector('.voice-switch');
    if (!wrap) wrap = document.querySelector('.flashcard-controls');
    if (!wrap) wrap = document.querySelector('.controls');
    if (!wrap) return;

    var container = document.createElement('div');
    container.className = 'mic-selector-wrap';
    container.innerHTML =
        '<label class="mic-label" for="micSelect">\uD83C\uDFA4 \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043C\u0438\u043A\u0440\u043E\u0444\u043E\u043D</label>' +
        '<select id="micSelect" class="mic-select"></select>';
    wrap.parentNode.insertBefore(container, wrap.nextSibling);
}

/** Quick RMS volume check on a stream — returns average amplitude 0..32767 */
function _checkStreamVolume(stream) {
    return new Promise(function (resolve) {
        try {
            var ctx = new (window.AudioContext || window.webkitAudioContext)();
            var src = ctx.createMediaStreamSource(stream);
            var analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            src.connect(analyser);
            var buf = new Uint8Array(analyser.frequencyBinCount);
            var checks = 0;
            var maxVal = 0;

            var iv = setInterval(function () {
                analyser.getByteTimeDomainData(buf);
                for (var i = 0; i < buf.length; i++) {
                    var v = Math.abs(buf[i] - 128);
                    if (v > maxVal) maxVal = v;
                }
                checks++;
                if (checks >= 8) {  /* ~400ms of sampling */
                    clearInterval(iv);
                    try { src.disconnect(); ctx.close(); } catch {}
                    resolve(maxVal);
                }
            }, 50);
        } catch {
            resolve(999); /* can't check — assume OK */
        }
    });
}

/* ================================================================== */
/*  Voice selector helper                                             */
/* ================================================================== */
function _getVoice() {
    return localStorage.getItem('tts_voice') || 'male';
}

/** Initialise voice selector — supports both <select> and .voice-switch buttons */
function _initVoiceSelector() {
    var currentVoice = _getVoice();

    /* ---- legacy <select> support ---- */
    var sel = document.getElementById('voiceSelect');
    if (sel) {
        sel.value = currentVoice;
        sel.addEventListener('change', function () {
            localStorage.setItem('tts_voice', sel.value);
            _ttsCache.clear();
            _syncVoiceButtons(sel.value);
        });
    }

    /* ---- button-based .voice-switch ---- */
    var wrap = document.querySelector('.voice-switch');
    if (wrap) {
        var btns = wrap.querySelectorAll('[data-voice]');
        btns.forEach(function (btn) {
            if (btn.getAttribute('data-voice') === currentVoice) {
                btn.classList.add('active');
            }
            btn.addEventListener('click', function () {
                var v = btn.getAttribute('data-voice');
                localStorage.setItem('tts_voice', v);
                _ttsCache.clear();
                _syncVoiceButtons(v);
                /* also sync <select> if it exists */
                if (sel) sel.value = v;
            });
        });
    }
}

function _syncVoiceButtons(voice) {
    var btns = document.querySelectorAll('.voice-switch [data-voice]');
    btns.forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-voice') === voice);
    });
}

/* ================================================================== */
/*  Status indicator (UX states)                                      */
/* ================================================================== */
function showStatus(text) {
    var el = document.getElementById('speechStatus');
    if (!el) {
        el = document.createElement('div');
        el.id = 'speechStatus';
        el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9600;padding:10px 22px;border-radius:16px;font-size:.9rem;font-weight:700;color:#fff;background:rgba(0,0,0,.75);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);pointer-events:none;transition:opacity .3s;font-family:system-ui,-apple-system,sans-serif;white-space:pre-line;text-align:center';
        document.body.appendChild(el);
    }
    if (!text) {
        el.style.opacity = '0';
        return;
    }
    var safeText = String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    el.innerHTML = safeText.replace(/\n/g, '<br>');
    el.style.opacity = '1';
}

function _showStatusSafe(text) {
    try {
        if (window.showStatus) {
            window.showStatus(text, 'warn');
            return;
        }
        showStatus(text);
    } catch (error) {
        console.debug('[PAYWALL ERROR]', error);
    }
}

function _goToDemoPricing() {
    if (_redirecting) return;
    _redirecting = true;

    try {
        var path = (window.location && window.location.pathname || '').toLowerCase();
        if (!path || path === '/' || /\/index\.html$/.test(path)) {
            var pricingEl = document.getElementById('pricing');
            if (pricingEl && pricingEl.scrollIntoView) {
                pricingEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setTimeout(function () {
                    _redirecting = false;
                }, 1000);
                return;
            }
        }

        window.location.href = '/index.html#pricing';
        setTimeout(function () {
            _redirecting = false;
        }, 3000);
    } catch (error) {
        _redirecting = false;
        console.debug('[PAYWALL ERROR]', error);
    }
}

function _handleDemoPaywall() {
    try {
        if (_redirecting || _demoPaywallRedirectTimer) return;

        if (!_demoPaywallClicked) {
            _demoPaywallClicked = true;

            _showStatusSafe('\uD83D\uDD12 \u0422\u043E\u043B\u044C\u043A\u043E Premium\n\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437');

            clearTimeout(_demoPaywallResetTimer);
            _demoPaywallResetTimer = setTimeout(function () {
                _demoPaywallClicked = false;
                _demoPaywallResetTimer = 0;
            }, 2000);

            return;
        }

        _demoPaywallClicked = false;
        clearTimeout(_demoPaywallResetTimer);
        _redirecting = true;

        _showStatusSafe('\uD83D\uDD12 \u042D\u0442\u043E \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0432 Premium\n\u041F\u0435\u0440\u0435\u0445\u043E\u0434\u0438\u043C \u043A \u043E\u043F\u043B\u0430\u0442\u0435\u2026');

        clearTimeout(_demoPaywallRedirectTimer);
        _demoPaywallRedirectTimer = setTimeout(function () {
            _demoPaywallRedirectTimer = 0;
            try {
                var path = (window.location && window.location.pathname || '').toLowerCase();
                if (!path || path === '/' || /\/index\.html$/.test(path)) {
                    var pricingEl = document.getElementById('pricing');
                    if (pricingEl && pricingEl.scrollIntoView) {
                        pricingEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        setTimeout(function () {
                            _redirecting = false;
                        }, 1000);
                        return;
                    }
                }

                window.location.href = '/index.html#pricing';
                setTimeout(function () {
                    _redirecting = false;
                }, 3000);
            } catch (error) {
                _redirecting = false;
                console.debug('[PAYWALL ERROR]', error);
            }
        }, 1200);
    } catch (error) {
        _redirecting = false;
        console.debug('[PAYWALL ERROR]', error);
    }
}

/* ================================================================== */
/*  Sound effects (fire-and-forget, safe if autoplay blocked)         */
/* ================================================================== */
function _playSound(src) {
    try {
        if (!src) return;
        if (!_playSound._disabled) _playSound._disabled = new Set();
        if (_playSound._disabled.has(src)) return;

        var a = new Audio();
        a.volume = 0.5;
        a.onerror = function () {
            _playSound._disabled.add(src);
        };
        a.src = src;
        a.play().catch(function () { /* autoplay blocked — ignore */ });
    } catch { /* Audio constructor unavailable — ignore */ }
}

function _playSoundSuccess() { _playSound('/sounds/success.mp3'); }
function _playSoundError()   { _playSound('/sounds/error.mp3'); }

/* ================================================================== */
/*  Haptic feedback (vibrate API, safe no-op on unsupported)          */
/* ================================================================== */
function _haptic(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms || 30); } catch {}
}
function _hapticSuccess() { _haptic(40); }
function _hapticError()   { _haptic([30, 50, 30]); }

/* ================================================================== */
/*  TTS playback                                                      */
/* ================================================================== */
const _ttsCache = new Map();
const _localAudioChecked = new Map();

function playAudio(event) {
    // stopPropagation removed — delegation handler already prevents bubbling
    const btn = event.target.closest('.listen-btn') || event.currentTarget;
    const word = typeof window.getCurrentWord === 'function' && window.getCurrentWord();
    if (!word || !word.ru) return;

    btn.disabled = true;
    btn.classList.add('loading');

    _playTTS(word.ru, word.topicId)
        .catch(err => {
            console.error('TTS error:', err);
            if (err.limitExceeded) {
                _showPaywall(err.tier);
            } else {
                alert('Audio yuklanmadi. Qayta urinib ko\'ring.');
            }
        })
        .finally(() => {
            btn.disabled = false;
            btn.classList.remove('loading');
        });
}

/* ---- detect course level from page URL ---- */
function _detectLevel() {
    var path = location.pathname.toLowerCase();
    var m = path.match(/\b(a1|a2|b1|b2)\b/);
    return m ? m[1] : null;
}

/* ---- build local audio path (must match generate-audio.js) ---- */
function _sanitizeFilename(text) {
    return text
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[<>:"\/\\|?*]/g, '')
        .replace(/_{2,}/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 120);
}

function _localAudioPath(text, topicId) {
    var level = _detectLevel();
    if (!level || !topicId) return null;
    return '/audio/' + level + '/lesson' + topicId + '/' + _sanitizeFilename(text) + '.mp3';
}

/* ---- check if local file exists (HEAD, cached) ---- */
async function _hasLocalAudio(url) {
    if (_localAudioChecked.has(url)) return _localAudioChecked.get(url);

    try {
        var res = await fetch(url, { method: 'HEAD' });
        var ok = res.ok;
        _localAudioChecked.set(url, ok);
        return ok;
    } catch {
        _localAudioChecked.set(url, false);
        return false;
    }
}

async function _playTTS(text, topicId) {
    let blobUrl = _ttsCache.get(text);

    if (!blobUrl) {
        /* 1) try local pre-generated file */
        var localPath = _localAudioPath(text, topicId);
        if (localPath && await _hasLocalAudio(localPath)) {
            blobUrl = localPath;           // serve directly, no blob needed
            _ttsCache.set(text, blobUrl);
        }

        /* 2) fallback to API */
        if (!blobUrl) {
            const res = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ..._getAuthHeaders() },
                body: JSON.stringify({ text, voice: localStorage.getItem('tts_voice') || 'male' }),
            });

            if (res.status === 403) {
                const body = await res.json().catch(() => ({}));
                const e = new Error(body.message || 'Kunlik limit tugadi');
                e.limitExceeded = true;
                e.tier = body.tier || 'demo';
                throw e;
            }
            if (!res.ok) throw new Error('TTS request failed: ' + res.status);

            const blob = await res.blob();
            blobUrl = URL.createObjectURL(blob);
            _ttsCache.set(text, blobUrl);
        }
    }

    const audio = new Audio(blobUrl);
    return audio.play();
}

/* ================================================================== */
/*  Pronunciation Assessment                                          */
/* ================================================================== */
let _pronBusy = false;
let _speechToken = null;
let _speechTokenExpiry = 0;

function _getPronTriggerButton(event) {
    if (event && event.target && typeof event.target.closest === 'function') {
        var targetBtn = event.target.closest('.pron-btn');
        if (targetBtn) return targetBtn;
    }
    if (event && event.currentTarget) return event.currentTarget;
    return _lastPronTriggerEl;
}

function _setPronPendingAdvance(action) {
    window._pendingNext = typeof action === 'function' ? action : null;
}

function _runPronPendingAdvance() {
    var action = window._pendingNext;
    window._pendingNext = null;
    if (typeof action !== 'function') return;

    setTimeout(function () {
        try {
            action();
        } catch (err) {
            console.warn('[PRON] pending advance failed', err);
        }
    }, 0);
}

async function _getSpeechToken() {
    if (_speechToken && Date.now() < _speechTokenExpiry) {
        console.log('[PRON][TOKEN] using cached token, region:', _speechToken.region,
                    'expires in', Math.round((_speechTokenExpiry - Date.now()) / 1000), 's');
        return _speechToken;
    }
    console.log('[PRON][TOKEN] fetching /api/speech-token …');
    var res;
    try {
        res = await fetch('/api/speech-token', { headers: _getAuthHeaders() });
    } catch (netErr) {
        console.error('[PRON][TOKEN] network error:', netErr && netErr.message);
        var ne = new Error("Speech server bilan aloqa yo‘q");
        ne.connectionFailed = true;
        throw ne;
    }
    if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        const e = new Error(body.message || 'Kunlik limit tugadi');
        e.limitExceeded = true;
        e.tier = body.tier || 'demo';
        throw e;
    }
    if (!res.ok) {
        console.error('[PRON][TOKEN] HTTP', res.status, res.statusText);
        var he = new Error("Speech server bilan aloqa yo‘q");
        he.connectionFailed = true;
        he.httpStatus = res.status;
        throw he;
    }
    const data = await res.json().catch(() => null);
    /* Region/token consistency check (G6): both must be non-empty strings.
       A blank region silently produces a malformed wss:// URL that fails
       the websocket handshake — we catch it here instead. */
    if (!data || typeof data.token !== 'string' || !data.token
        || typeof data.region !== 'string' || !data.region) {
        console.error('[PRON][TOKEN] invalid /api/speech-token payload:', data);
        var ie = new Error("Speech server bilan aloqa yo‘q");
        ie.connectionFailed = true;
        ie.invalidToken = true;
        throw ie;
    }
    _speechToken = { token: data.token, region: data.region };
    _speechTokenExpiry = Date.now() + 8 * 60 * 1000;
    console.log('[PRON][TOKEN] received, region:', data.region,
                'tokenLen:', data.token.length, 'cached for 8 min');
    return _speechToken;
}

function checkPronunciation(event) {
    if (window._isPronRunning) {
        console.warn('[PRON] BLOCKED: already running');
        return;
    }
    window._isPronRunning = true;

    function releasePronRunLock() {
        window._isPronRunning = false;
    }

    if (_isRecording || _pronBusy) {
        releasePronRunLock();
        console.warn('[PRON] BLOCKED: busy');
        return;
    }

    var btn = _getPronTriggerButton(event);
    if (!btn) {
        releasePronRunLock();
        console.warn('[PRON] BLOCKED: trigger button missing');
        return;
    }

    var word = typeof window.getCurrentWord === 'function' && window.getCurrentWord();

    if (!word) {
        releasePronRunLock();
        showStatus('\u274C So\u2018z aniqlanmadi');
        console.error('[PRON] getCurrentWord() returned null/undefined');
        setTimeout(function () { showStatus(''); }, 2500);
        return;
    }

    var wordIdx = typeof word.wordIndex === 'number' ? word.wordIndex : -1;
    if (wordIdx < 0 && typeof window.currentWordIndex === 'number') {
        console.warn('[PRON] word.wordIndex missing, fallback to window.currentWordIndex');
        wordIdx = window.currentWordIndex;
    }

    if (wordIdx < 0) {
        releasePronRunLock();
        showStatus('\u274C So\u2018z aniqlanmadi');
        console.error('[PRON] wordIndex not found:', word);
        setTimeout(function () { showStatus(''); }, 2500);
        return;
    }

    var referenceText = (word.ru || '').trim();

    if (!referenceText || referenceText.length < 2) {
        releasePronRunLock();
        showStatus('\u274C So\u2018z noto\u2018g\u2018ri');
        console.error('[PRON] BLOCKED: referenceText too short:', JSON.stringify(referenceText));
        setTimeout(function () { showStatus(''); }, 2500);
        return;
    }

    var topicId = word.topicId != null ? word.topicId : null;

    if (_isDemoLocked(topicId)) {
        releasePronRunLock();
        _handleDemoPaywall();
        return;
    }

    console.debug('[PRON] index:', wordIdx);
    console.debug('[PRON] referenceText:', JSON.stringify(referenceText));

    /* check if word is locked */
    if (topicId != null && _isWordLocked(topicId, wordIdx)) {
        releasePronRunLock();
        showStatus('\u26D4 Avval oldingi so\u2018zni tugating');
        setTimeout(function () { showStatus(''); }, 2500);
        return;
    }

    const attemptId = ++_activeAttemptId;
    _pronAttemptStartedAt = Date.now();
    clearTimeout(_pronResultDelayTimer);
    _pronResultDelayTimer = 0;
    _lastPronTriggerEl = btn;
    _lastPronRetryAction = function () {
        var live = (btn && document.body.contains(btn))
            ? btn
            : document.querySelector('[data-word-index] .pron-btn');
        if (live) checkPronunciation({ target: live, currentTarget: live });
    };
    window._pendingNext = null;
    btn.disabled = true;
    btn.classList.add('loading');
    _isRecording = true;
    _pronBusy = true;

    /* Patch A: do NOT promise "Gapiring..." before the recognizer is
       actually capturing audio \u2014 that is what made users speak into a
       dead pipeline and lose the first word. The swap to "Gapiring..."
       happens inside recognizer.sessionStarted (Azure's real ready signal). */
    showStatus('\uD83C\uDFA4 Mikrofon tayyorlanmoqda...');

    _runPronunciationAssessment(referenceText)
        .then(result => {
            if (attemptId !== _activeAttemptId) {
                console.warn('[PRON] stale result ignored:', attemptId, _activeAttemptId);
                return;
            }

            console.debug('[PRON] RESULT:', result);

            if (!result) {
                _handlePronFail('Natija olinmadi.');
                return;
            }

            /* Deterministic verdict engine — idempotent safety net; the
               result was already graded inside _finalizePronunciationResult.
               The verdict depends ONLY on word-level text similarity, so the
               same speech always produces the same pass/fail outcome. */
            result = _applyFlexibleVerdict(result, referenceText);

            var score = Number(result.finalScore) || 0;

            /* PASSING RULE — single source of truth shared with the result
               UI. Only "Ajoyib" (excellent) and "Yaxshi" (good) advance to
               the next word. "O‘rtacha" (average), "Aniqroq gapiring"
               (unclear) and "Hech narsa eshitilmadi" (empty) do NOT pass. */
            var verdict = result.verdict || _getCategory(score);
            var didPass = result.pass === true
                && (verdict === 'excellent' || verdict === 'good');

            /* Optional grading diagnostics — set window.SPEECH_DEBUG = true
               in the console to inspect transcript / word states / verdict. */
            if (typeof window !== 'undefined' && window.SPEECH_DEBUG) {
                console.log('[GRADE]', {
                    reference: word && word.ru,
                    transcript: result.recognizedText || '',
                    wordCounts: result.wordCounts,
                    coverage: result.coverage,
                    finalScore: score,
                    verdict: verdict,
                    reason: result.reason,
                    didPass: didPass
                });
            }

            /* ============ SUCCESS: Ajoyib / Yaxshi ============ */
            if (didPass) {
                showStatus('\uD83D\uDD25 Zo\'r!');
                _animateFlashcardSuccess();
                _playSoundSuccess();
                _hapticSuccess();
                setTimeout(function () { showStatus(''); }, 2000);

                _logPronunciation(word.ru, result);
                try { _showPronResult(word.ru, result, attemptId); } catch (uiErr) { console.warn('[UI ERROR]', uiErr); }

                /* word progress: complete + unlock next + auto-advance */
                if (topicId != null && wordIdx >= 0) {
                    _completeWord(topicId, wordIdx);
                    window._pendingNext = function () {
                        if (_isLessonComplete(topicId)) {
                            _showLessonCompleteOverlay();
                            return;
                        }

                        if (typeof window.nextCard === 'function') {
                            window.nextCard();
                        } else if (typeof window.currentWordIndex === 'number') {
                            window.currentWordIndex++;
                            if (typeof window.loadCard === 'function') window.loadCard();
                        } else if (typeof window.currentCardIndex === 'number') {
                            window.currentCardIndex++;
                            if (typeof window.updateCard === 'function') window.updateCard();
                        }
                    };
                }

            /* ============ TRY AGAIN: O\u2018rtacha (average) \u2014 does NOT pass ============ */
            } else if (verdict === 'average') {
                showStatus('\uD83D\uDCAA Yana urinib ko\'ring');
                _animateFlashcardError();
                _haptic(30);
                setTimeout(function () { showStatus(''); }, 2500);

                _logPronunciation(word.ru, result);
                try { _showPronResult(word.ru, result, attemptId); } catch (uiErr) { console.warn('[UI ERROR]', uiErr); }
                /* Do NOT unlock the word — user must retry */

            /* ====== FAIL: bad pronunciation / silence / wrong word ====== */
            } else {
                showStatus('\u274C Qayta urinib ko\'ring');
                _animateFlashcardError();
                _playSoundError();
                _hapticError();
                setTimeout(function () { showStatus(''); }, 2500);

                _logPronunciation(word.ru, result);
                try { _showPronResult(word.ru, result, attemptId); } catch (uiErr) { console.warn('[UI ERROR]', uiErr); }
                /* Do NOT unlock the word */
            }
        })
        .catch(err => {
            if (attemptId !== _activeAttemptId) {
                console.warn('[PRON] stale error ignored:', attemptId, _activeAttemptId, err);
                return;
            }

            console.error('[PRON] CATCH:', err);

            /* Always tear down the listening overlay on error so the pulsing
               mic doesn't stay on screen next to an error toast — without this
               the user can't tell whether the system is still recording. */
            try { closePronResult({ skipPendingAdvance: true }); } catch (uiErr) {}

            /* User cancelled by clicking outside the listening panel */
            if (err && err.cancelled) {
                showStatus('');
                return;
            }

            /* Do NOT show error to user if it's a soft timeout (got interim) */
            if (err.softTimeout) {
                showStatus('\u23F3 Vaqt tugadi. Qayta urinib ko\'ring.');
                _animateFlashcardError();
                setTimeout(function () { showStatus(''); }, 2500);
                return;
            }

            if (err.limitExceeded) {
                showStatus('');
                _showPaywall(err.tier);
                return;
            }

            /* SDK still unavailable after every automatic retry/fallback —
               this is now the ONLY path that mentions the SDK, and only after
               we have genuinely exhausted the multi-CDN loader. */
            if (err.sdkLoadFailed) {
                showStatus("⚠️ Mikrofon tizimi yuklanmadi.\nInternetni tekshirib, qayta urinib ko‘ring.");
                _animateFlashcardError();
                _hapticError();
                setTimeout(function () { showStatus(''); }, 4000);
                return;
            }

            /* G2 / G7: dedicated server-down verdict. The Promise was
               rejected by the connection watchdog (5s) or the canceled
               handler \u2014 closePronResult() above already tore down the
               listening overlay; here we just surface the right toast
               so the user knows it's the server, not their mic. */
            if (err.connectionFailed) {
                showStatus("\u26A0\uFE0F Speech server bilan aloqa yo\u2018q");
                _animateFlashcardError();
                _hapticError();
                setTimeout(function () { showStatus(''); }, 3500);
                return;
            }

            if (err.micError || (err.message && err.message.includes('microphone'))) {
                showStatus('\u274C Mikrofon xatosi');
                setTimeout(function () { showStatus(''); }, 2500);
                alert('Mikrofonga ruxsat berilmadi. Brauzer sozlamalarini tekshiring.');
                return;
            }

            /* Generic error — show status only, no alert spam */
            showStatus('\u274C ' + (err.message || 'Xatolik yuz berdi'));
            _animateFlashcardError();
            _hapticError();
            setTimeout(function () { showStatus(''); }, 2500);
        })
        .finally(() => {
            btn.disabled = false;
            btn.classList.remove('loading');
            if (attemptId === _activeAttemptId) {
                _isRecording = false;
                _pronBusy = false;
            }
            window._isPronRunning = false;
        });
}

/** Helper for quick fail display */
function _handlePronFail(msg) {
    showStatus('\u274C ' + msg);
    _animateFlashcardError();
    _playSoundError();
    _hapticError();
    setTimeout(function () { showStatus(''); }, 2500);
}

/* ---- Localisation ----
   Default language is Uzbek (the app's primary UI language). Override
   via `window.SPEECH_LANG = "en"` before speech.js loads, or change LANG. */
var LANG = (typeof window !== 'undefined' && window.SPEECH_LANG) ? window.SPEECH_LANG : 'uz';
var TEXT = {
    uz: {
        excellent:        "A'lo!",
        good:             "Yaxshi",
        almost:           "Deyarli",
        tryAgain:         "Qayta urinib ko'ring",
        confirmExit:      "Rostdan ham chiqmoqchimisiz?",
        exact:            "to'g'ri",
        present:          "topildi",
        extra:            "ortiqcha",
        hintMissed:       "Maslahat: bu so'zlar tushib qoldi",
        hintExtra:        "Maslahat: ortiqcha so'zlar",
        hintOrder:        "Maslahat: so'zlarni to'g'ri tartibda ayting",
        hintWeak:         "Maslahat: bu so'zni aniqroq ayting",
        verdictExcellent: "✅ A'lo!",
        verdictGood:      "✅ Yaxshi",
        verdictAlmost:    "⚠️ Deyarli",
        verdictBad:       "❌ Qayta urinib ko'ring",
        verdictWrongWord: "❌ Boshqa so'z aytdingiz",
        verdictBadPron:   "⚠️ Talaffuzni yaxshilash kerak",
        verdictUnclear:   "⚠️ Aniqroq gapiring",
        verdictUnstable:  "⚠️ Nutq notekis chiqdi",
        verdictFakeMatch: "❌ Qayta urinib ko'ring"
    },
    en: {
        excellent:        "Excellent!",
        good:             "Good",
        almost:           "Almost",
        tryAgain:         "Try again",
        confirmExit:      "Are you sure you want to exit?",
        exact:            "exact",
        present:          "present",
        extra:            "extra",
        hintMissed:       "Hint: missed words",
        hintExtra:        "Hint: extra words",
        hintOrder:        "Hint: keep the words in the correct order",
        hintWeak:         "Hint: try to pronounce",
        verdictExcellent: "✅ Excellent!",
        verdictGood:      "✅ Good",
        verdictAlmost:    "⚠️ Almost there",
        verdictBad:       "❌ Try again",
        verdictWrongWord: "❌ You said a different word",
        verdictBadPron:   "⚠️ Pronunciation needs work",
        verdictUnclear:   "⚠️ Speak more clearly",
        verdictUnstable:  "⚠️ Speech was unstable",
        verdictFakeMatch: "❌ Try again"
    }
};
function _t(key) {
    var dict = TEXT[LANG] || TEXT.uz;
    if (dict[key] !== undefined) return dict[key];
    if (TEXT.en[key] !== undefined) return TEXT.en[key];
    return key;
}

function _clampRange(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

/* ==================================================================
 *  SPEECH VERDICT ENGINE  —  deterministic, word-quality based
 *  (rebuilt May 2026)
 *
 *  PIPELINE
 *    recognizedText + referenceText
 *      -> _normalizeSpeechText()   lowercase, yo->ye, strip punctuation
 *      -> _classifyWords()         each reference word: GREEN/YELLOW/RED
 *      -> _evaluateVerdict()       counts -> one of 5 verdicts
 *      -> _packageGrade()          verdict -> score / reason / UI data
 *
 *  The verdict and the word colors depend ONLY on word-level text
 *  similarity, so the same speech input ALWAYS yields the same result
 *  (no Azure-accuracy noise, no random yellow/red, fully deterministic).
 *
 *  WORD STATES
 *    short words (<= 3 letters)  STRICT:
 *        edit distance 0  -> GREEN
 *        edit distance 1  -> YELLOW
 *        else             -> RED
 *    long words  (> 3 letters):
 *        similarity >= 0.88 -> GREEN
 *        similarity >= 0.68 -> YELLOW  (must also share a prefix/suffix)
 *        else               -> RED
 *
 *  VERDICT RULES  (G/Y/R = green/yellow/red counts, T = total ref words)
 *    HECH NARSA ESHITILMADI  no speech captured
 *    ANIQROQ GAPIRING        R >= 3   OR   coverage < 60%
 *    O'RTACHA                R = 1..2   OR   Y > ceil(T/2)   (too many yellow)
 *    AJOYIB                  R = 0  AND  (Y = 0  OR  (Y <= 1 AND T >= 3))
 *    YAXSHI                  R = 0  AND  Y <= ceil(T/2)
 *    coverage = (G + Y) / T
 * ================================================================== */

var SPEECH_GREEN_THRESHOLD = 0.88;   /* long word similarity -> GREEN  */
var SPEECH_YELLOW_THRESHOLD = 0.68;  /* long word similarity -> YELLOW */
var SPEECH_SHORT_WORD_MAX = 3;       /* <= this many letters -> strict mode */
var SPEECH_MIN_COVERAGE = 0.60;      /* below this coverage -> Aniqroq gapiring */

/* Normalize text for comparison: lowercase, yo->ye, drop punctuation,
   collapse whitespace. Internal hyphens are KEPT so a hyphenated word
   ("iz-za") stays a single token for display; _matchForm() strips them
   for the actual similarity comparison. */
function _normalizeSpeechText(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .toLowerCase()
        .replace(/ё/g, 'е')             /* yo -> ye */
        .replace(/[̀-ͯ]/g, '')          /* combining accent marks */
        .replace(/[‐-―−]/g, '-')   /* unicode dashes -> hyphen */
        .replace(/[.,!?;:"'`()\[\]{}\/\\«»“”„…]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/* Compare-form of a single token: hyphens removed so "iz-za" -> "izza"
   and it can match "iz za" (two recognized tokens) or "izza". */
function _matchForm(token) {
    return String(token || '').replace(/-/g, '');
}

/* Split normalized text into word tokens (hyphenated words stay whole). */
function _tokenize(text) {
    var norm = _normalizeSpeechText(text);
    if (!norm) return [];
    return norm.split(' ').filter(Boolean);
}

/* Levenshtein edit distance between two strings. */
function _levenshtein(a, b) {
    a = String(a); b = String(b);
    var m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
        cur[0] = i;
        for (j = 1; j <= n; j++) {
            var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        }
        for (j = 0; j <= n; j++) prev[j] = cur[j];
    }
    return prev[n];
}

/* A YELLOW (partial) long-word match must share a real prefix OR suffix
   with the reference word. Guards against coincidental letter overlap
   being counted as a near-match (anti-random protection). */
function _sharesAffix(ref, cand) {
    if (!ref || !cand) return false;
    if (ref.slice(0, 2) === cand.slice(0, 2)) return true;
    if (ref.slice(-2) === cand.slice(-2)) return true;
    return false;
}

/* Classify one reference word given the best candidate found for it. */
function _classifyWord(refForm, candForm, sim, dist) {
    if (!refForm) return 'red';

    /* SHORT WORD STRICT MODE -- <= 3 letters: only exact or 1 edit count.
       Random noise can never be credited to short words ("ya", "i", "v"). */
    if (refForm.length <= SPEECH_SHORT_WORD_MAX) {
        if (dist === 0) return 'green';
        if (dist <= 1) return 'yellow';
        return 'red';
    }

    /* LONG WORD MODE */
    if (sim >= SPEECH_GREEN_THRESHOLD) return 'green';
    if (sim >= SPEECH_YELLOW_THRESHOLD && _sharesAffix(refForm, candForm)) return 'yellow';
    return 'red';
}

/* Score one candidate string against a reference word; keep the best. */
function _considerCand(best, refForm, cand, a, b) {
    if (!cand) return;
    var dist = _levenshtein(refForm, cand);
    var maxLen = Math.max(refForm.length, cand.length) || 1;
    var sim = 1 - dist / maxLen;
    if (sim < 0) sim = 0;
    if (sim > best.sim || (sim === best.sim && dist < best.dist)) {
        best.sim = sim;
        best.dist = dist;
        best.cand = cand;
        best.a = a;
        best.b = b;
    }
}

/* Classify every reference word -> { ref, status, sim }.
   Order-independent greedy match. A hyphenated reference word can also
   match two adjacent recognized tokens joined together so the speech
   recognizer splitting "iz-za" into "iz za" never costs the learner. */
function _classifyWords(recognized, reference) {
    var refTokens = _tokenize(reference);
    var recTokens = _tokenize(recognized);
    var counts = { green: 0, yellow: 0, red: 0 };
    var total = refTokens.length;

    if (total === 0) {
        return {
            total: 0, states: [], counts: counts, coverage: 0,
            extraWords: recTokens.length, recCount: recTokens.length
        };
    }

    /* Original-case tokens for display; fall back to the normalized
       tokens if punctuation made the two splits diverge. */
    var refDisplay = String(reference).trim().split(/\s+/).filter(Boolean);
    if (refDisplay.length !== total) refDisplay = refTokens;

    var refForms = refTokens.map(_matchForm);
    var recForms = recTokens.map(_matchForm);
    var usedRec = [];
    var states = [];
    var r, k;

    for (r = 0; r < refForms.length; r++) {
        var refForm = refForms[r];
        var best = { sim: -1, dist: Infinity, cand: '', a: -1, b: -1 };

        for (k = 0; k < recForms.length; k++) {
            if (usedRec[k]) continue;
            /* candidate 1: a single recognized token */
            _considerCand(best, refForm, recForms[k], k, -1);
            /* candidate 2: this token joined with the next one
               (handles "iz-za" reference vs "iz za" recognized) */
            if (k + 1 < recForms.length && !usedRec[k + 1]) {
                _considerCand(best, refForm, recForms[k] + recForms[k + 1], k, k + 1);
            }
        }

        var status = (best.a < 0)
            ? 'red'
            : _classifyWord(refForm, best.cand, best.sim, best.dist);

        if (status !== 'red' && best.a >= 0) {
            usedRec[best.a] = true;
            if (best.b >= 0) usedRec[best.b] = true;
        }
        counts[status]++;
        states.push({
            ref: refDisplay[r] || refTokens[r],
            status: status,
            sim: best.sim < 0 ? 0 : best.sim
        });
    }

    var extraWords = 0;
    for (k = 0; k < recForms.length; k++) {
        if (!usedRec[k]) extraWords++;
    }

    return {
        total: total,
        states: states,
        counts: counts,
        coverage: (counts.green + counts.yellow) / total,
        extraWords: extraWords,
        recCount: recTokens.length
    };
}

/* Word-state counts -> one of the five verdicts. Pure, deterministic. */
function _evaluateVerdict(cls) {
    var total = cls.total;
    if (total === 0) return 'empty';

    var y = cls.counts.yellow;
    var r = cls.counts.red;

    /* RED >= 3  OR  coverage too low -> the learner must speak again. */
    if (r >= 3 || cls.coverage < SPEECH_MIN_COVERAGE) return 'unclear';
    /* 1-2 RED words -> average. */
    if (r >= 1) return 'average';

    /* From here RED === 0. */
    var yellowLimit = Math.ceil(total / 2);
    if (y > yellowLimit) return 'average';                 /* too many yellow */
    if (y === 0 || (y <= 1 && total >= 3)) return 'excellent';
    return 'good';
}

/* verdict -> display score and verdict -> reason code. */
var _VERDICT_SCORE = { excellent: 96, good: 82, average: 64, unclear: 32, empty: 0 };
var _VERDICT_REASON = { excellent: 'excellent', good: 'good', average: 'average', unclear: 'unclear_speech', empty: 'no_speech' };

/* reference-word feedback list (consumed by hint builders). */
function _statesToFeedback(cls) {
    var fb = [];
    var states = (cls && cls.states) || [];
    for (var i = 0; i < states.length; i++) {
        var s = states[i].status;
        fb.push({
            word: states[i].ref,
            status: s === 'green' ? 'correct' : (s === 'yellow' ? 'partial' : 'missing')
        });
    }
    return fb;
}

/* verdict + classification -> a complete result payload. */
function _packageGrade(verdict, cls, reasonOverride) {
    var score = _VERDICT_SCORE[verdict] != null ? _VERDICT_SCORE[verdict] : 0;
    var counts = (cls && cls.counts) || { green: 0, yellow: 0, red: 0 };
    var coverage = (cls && cls.coverage) || 0;
    return {
        verdict: verdict,
        pass: verdict === 'excellent' || verdict === 'good',
        finalScore: score,
        pronunciationScore: score,
        aniqlik: score,
        ravonlik: score,
        toliqlik: score,
        reason: reasonOverride || _VERDICT_REASON[verdict] || 'bad',
        wordStates: (cls && cls.states) || [],
        wordCounts: counts,
        coverage: coverage,
        completenessScore: Math.round(coverage * 100),
        matchRatio: coverage,
        wordFeedback: _statesToFeedback(cls)
    };
}

/* ==================================================================
 *  REFERENCE VARIANTS — multi-form / optional-word support
 *  ------------------------------------------------------------------
 *  A vocabulary card's reference text may encode several acceptable
 *  spoken answers in one string. The speech grader should accept ANY
 *  of them, so we expand the raw reference into a list of variants and
 *  grade the recognized speech against each, keeping the best verdict.
 *
 *  Supported, data-driven (NO hardcoded word lists, so every current
 *  and future vocabulary entry inherits this automatically):
 *    "Друг / Друзья"            -> "Друг",  "Друзья"
 *    "Я не согласен / согласна" -> "Я не согласен", "Я не согласна"
 *    "он/она говорит"           -> "он говорит", "она говорит"
 *    "уверен(а)"                -> "уверен", "уверена"
 *    "Мать (мама)"              -> "Мать",  "мама"
 *    "Вашего (erkak)"           -> "Вашего"          (Latin gloss dropped)
 *    "скажите, пожалуйста"      -> + "скажите"       (optional particle)
 *
 *  This affects ONLY speech grading. Text/grammar/translation/test
 *  validation lives in the course files (t1Match / isCorrect) and never
 *  calls into here, so written-answer accuracy is unchanged.
 * ================================================================== */

/* Discourse particles that must never be REQUIRED in spoken answers. */
var _SPEECH_OPTIONAL_WORDS = ['пожалуйста', 'ну', 'же', 'вот'];

function _speechHasCyrillic(s) { return /[а-яё]/i.test(s); }
/* A parenthetical that is Latin-only (e.g. "(erkak)", "(ko'plik)") is an
   Uzbek gloss / annotation, not a spoken alternative. */
function _speechIsLatinGloss(s) { return /[a-z]/i.test(s) && !/[а-яё]/i.test(s); }

/* "уверен(а)" / "Мать (мама)" -> base form + alternative form(s). */
function _speechExpandParens(list) {
    var out = [];
    list.forEach(function (s) {
        var m = s.match(/^(.*?)(\s*)\(([^)]*)\)(.*)$/);
        if (!m) { out.push(s); return; }
        var before = m[1], spaced = m[2].length > 0, inner = m[3].trim(), after = m[4];
        var baseNoParen = (before + after).replace(/\s+/g, ' ').trim();
        out.push(baseNoParen);
        if (inner && _speechHasCyrillic(inner) && !_speechIsLatinGloss(inner)) {
            if (!spaced) {
                /* inline suffix: "уверен(а)" -> "уверена" */
                out.push((before + inner + after).replace(/\s+/g, ' ').trim());
            } else {
                /* spaced synonym: "Мать (мама)" -> "мама" */
                out.push(inner);
            }
        }
    });
    return out;
}

/* "Друг / Друзья" and "он/она говорит" -> separate alternatives. */
function _speechExpandSlashes(list) {
    var out = [];
    list.forEach(function (s) {
        if (s.indexOf('/') === -1) { out.push(s); return; }
        if (/\s\/\s/.test(s)) {
            /* phrase-level " / " alternatives */
            var parts = s.split(/\s*\/\s*/).map(function (p) { return p.trim(); }).filter(Boolean);
            var leftWords = parts[0].split(/\s+/);
            parts.forEach(function (p, idx) {
                var pw = p.split(/\s+/);
                /* a shorter tail alternative ("согласна") inherits the left
                   prefix ("Я не") -> "Я не согласна" */
                if (idx > 0 && pw.length < leftWords.length) {
                    out.push(leftWords.slice(0, leftWords.length - pw.length).concat(pw).join(' '));
                } else {
                    out.push(p);
                }
            });
            return;
        }
        /* inline "он/она говорит" -> cartesian over slashed tokens */
        var combos = [''];
        s.split(/\s+/).forEach(function (tok) {
            if (tok.indexOf('/') !== -1) {
                var alts = tok.split('/').filter(Boolean), next = [];
                combos.forEach(function (c) {
                    alts.forEach(function (a) { next.push((c + ' ' + a).trim()); });
                });
                combos = next;
            } else {
                combos = combos.map(function (c) { return (c + ' ' + tok).trim(); });
            }
        });
        combos.forEach(function (c) { out.push(c); });
    });
    return out;
}

/* Add a variant with optional discourse particles removed. */
function _speechExpandOptional(list) {
    var out = [];
    list.forEach(function (s) {
        out.push(s);
        var kept = s.split(/\s+/).filter(function (w) {
            return _SPEECH_OPTIONAL_WORDS.indexOf(_normalizeSpeechText(w)) === -1;
        });
        var trimmed = kept.join(' ').trim();
        if (trimmed && trimmed !== s.trim()) out.push(trimmed);
    });
    return out;
}

/* Expand a raw reference string into all acceptable spoken variants.
   Always returns at least one entry (the original). Deduped by
   normalized form. */
function _referenceVariants(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return [''];
    var list = _speechExpandOptional(_speechExpandSlashes(_speechExpandParens([s])));
    var seen = {}, result = [];
    list.forEach(function (v) {
        var n = _normalizeSpeechText(v);
        if (!n || seen[n]) return;
        seen[n] = true;
        result.push(v.trim());
    });
    return result.length ? result : [s];
}

/* Rank verdicts so we can keep the BEST one across reference variants. */
var _VERDICT_RANK = { excellent: 4, good: 3, average: 2, unclear: 1, empty: 0 };

/* AUTHORITATIVE GRADER -- the single source of truth for the verdict.
   Grades the recognized speech against every acceptable reference
   variant and keeps the best result, so multi-form cards
   ("Друг / Друзья", "уверен(а)", "он/она говорит") and optional
   particles ("пожалуйста") never cause a false failure. */
function _gradeSpeech(recognizedText, referenceText, opts) {
    opts = opts || {};
    var ref = referenceText || '';

    /* No speech captured -> Hech narsa eshitilmadi. */
    if (!_normalizeSpeechText(recognizedText)) {
        return _packageGrade('empty', _classifyWords('', ref), 'no_speech');
    }

    var variants = _referenceVariants(ref);
    var best = null;
    for (var i = 0; i < variants.length; i++) {
        var cls = _classifyWords(recognizedText, variants[i]);

        /* Anti-cheat: Azure echoed the reference text without real, clean
           audio behind it -> never allowed to pass. */
        if (opts.fakeMatch) {
            return _packageGrade('unclear', cls, 'fake_match');
        }

        var graded = _packageGrade(_evaluateVerdict(cls), cls);
        if (!best || _VERDICT_RANK[graded.verdict] > _VERDICT_RANK[best.verdict]) {
            best = graded;
            if (graded.verdict === 'excellent') break;   /* can't do better */
        }
    }
    return best;
}

/* Back-compat shim -- legacy callers expect token-presence stats. */
function _getWordStats(rec, ref) {
    var cls = _classifyWords(rec, ref);
    if (cls.total === 0) {
        return {
            exactRatio: 0, partialRatio: 0, extraWords: cls.extraWords,
            refLength: 0, recLength: cls.recCount
        };
    }
    return {
        exactRatio: cls.counts.green / cls.total,
        partialRatio: cls.coverage,
        extraWords: cls.extraWords,
        refLength: cls.total,
        recLength: cls.recCount
    };
}

/* Back-compat shim -- word feedback derived from the verdict engine. */
function _getWordFeedback(recognized, reference) {
    return _statesToFeedback(_classifyWords(recognized, reference));
}

/* Normalize an Azure metric: <=0 / undefined / NaN -> null. */
function _normalizeMetric(v) {
    if (v === undefined || v === null) return null;
    var n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (n <= 0) return null;
    if (n > 100) return 100;
    return n;
}

/* Average Azure word-level accuracy. Used ONLY by the anti-cheat
   (fake-echo) guard -- never by the verdict itself. */
function _getWordQuality(words) {
    if (!Array.isArray(words) || words.length === 0) {
        return { avg: null, weakCount: 0, veryWeakCount: 0 };
    }
    var valid = words.filter(function (w) {
        return w && Number.isFinite(Number(w.accuracy));
    });
    if (valid.length === 0) return { avg: null, weakCount: 0, veryWeakCount: 0 };
    var total = valid.reduce(function (s, w) { return s + Number(w.accuracy); }, 0);
    return {
        avg: Math.round(total / valid.length),
        weakCount: valid.filter(function (w) { return Number(w.accuracy) < 65; }).length,
        veryWeakCount: valid.filter(function (w) { return Number(w.accuracy) < 50; }).length
    };
}

/* Merge the authoritative grade into a result object. EVERY real result
   path funnels through here, so the verdict is always deterministic. */
function _finalizePronunciationResult(result, referenceText) {
    var finalized = result || {};
    var grade = _gradeSpeech(
        finalized.recognizedText || '',
        referenceText || '',
        { fakeMatch: finalized.reason === 'fake_match' }
    );
    finalized.verdict = grade.verdict;
    finalized.pass = grade.pass;
    finalized.finalScore = grade.finalScore;
    finalized.pronunciationScore = grade.finalScore;
    finalized.aniqlik = grade.aniqlik;
    finalized.ravonlik = grade.ravonlik;
    finalized.toliqlik = grade.toliqlik;
    finalized.reason = grade.reason;
    finalized.wordStates = grade.wordStates;
    finalized.wordCounts = grade.wordCounts;
    finalized.coverage = grade.coverage;
    finalized.matchRatio = grade.matchRatio;
    finalized.completenessScore = grade.completenessScore;
    finalized.wordFeedback = grade.wordFeedback;
    if (!Array.isArray(finalized.words)) finalized.words = [];
    delete finalized.__extraPenalty;
    return finalized;
}

/* Idempotent safety net for the caller in checkPronunciation(). */
function _applyFlexibleVerdict(result, referenceText) {
    if (!result) return result;
    if (result.verdict) return result;          /* already graded */
    return _finalizePronunciationResult(result, referenceText);
}

/* Numeric score -> category. Kept for legacy callers and as the
   _showPronResult fallback. Boundaries match _VERDICT_SCORE. */
function _getCategory(score) {
    var s = Number(score) || 0;
    if (s >= 92) return 'excellent';
    if (s >= 76) return 'good';
    if (s >= 56) return 'average';
    if (s >= 16) return 'unclear';
    return 'empty';
}

/* verdict -> result-screen presentation. */
var _PRON_CATEGORY = {
    excellent: { text: 'Ajoyib',                 emoji: '🌟', advice: '',
                 verdictClass: 'good', animClass: 'anim-success' },
    good:      { text: 'Yaxshi',                 emoji: '✨',       advice: 'Yana biroz ravonroq ayting',
                 verdictClass: 'good', animClass: 'anim-success' },
    average:   { text: 'O‘rtacha',          emoji: '💪', advice: 'So‘zlarni aniqroq ayting',
                 verdictClass: 'ok',   animClass: 'anim-almost' },
    unclear:   { text: 'Aniqroq gapiring',       emoji: '⚠️', advice: 'Mikrofonga yaqinroq, sekinroq ayting',
                 verdictClass: 'ok',   animClass: 'anim-almost' },
    empty:     { text: 'Hech narsa eshitilmadi', emoji: '🤐', advice: 'Mikrofonga aniq gapiring',
                 verdictClass: 'bad',  animClass: 'anim-fail' }
};

/* Color each reference word by its deterministic GREEN/YELLOW/RED state. */
function _buildWordStateHighlight(wordStates) {
    if (!Array.isArray(wordStates) || wordStates.length === 0) return '';
    return wordStates.map(function (st) {
        var cls = st.status === 'green' ? 'wf-correct'
                : st.status === 'yellow' ? 'wf-ok'
                : 'wf-bad';
        return '<span class="wf-word ' + cls + '">' + _escHtml(st.ref) + '</span>';
    }).join(' ');
}

/* One-line, deterministic hint derived purely from the word states. */
function _buildVerdictHint(result) {
    if (!result || result.verdict === 'empty' || result.verdict === 'excellent') return '';
    var states = result.wordStates || [];
    var reds = states.filter(function (s) { return s.status === 'red'; })
                     .map(function (s) { return s.ref; });
    if (reds.length) {
        return 'Bu so‘zlarni aniq ayting: ' +
               reds.map(function (w) { return '«' + w + '»'; }).join(', ');
    }
    var counts = result.wordCounts || { yellow: 0 };
    if (counts.yellow > 0) return 'Deyarli! Bu so‘zlarni biroz aniqroq takrorlang';
    return '';
}

async function _runPronunciationAssessment(referenceText) {
    /* ---- validate referenceText ---- */
    if (!referenceText || typeof referenceText !== 'string' || referenceText.trim().length === 0) {
        console.error('[PRON] referenceText is empty or invalid:', referenceText);
        throw new Error('So\'z bo\'sh. Iltimos sahifani yangilang.');
    }
    referenceText = referenceText.trim();

    /* Ensure the Azure Speech SDK is loaded. Instead of failing instantly
       with a hard alert (the old pre-launch bug), we wait for the resilient
       multi-CDN loader to finish — it auto-retries before we ever surface an
       error. checkPronunciation() already shows "Mikrofon tayyorlanmoqda…"
       so the wait is covered by an existing status message. */
    var SpeechSDK = window.SpeechSDK;
    if (!_speechSdkReady()) {
        try {
            SpeechSDK = await _ensureSpeechSDK();
        } catch (sdkErr) {
            console.error('[PRON] Speech SDK failed to load after retries:', sdkErr && sdkErr.message);
            var le = new Error('Speech SDK yuklanmadi');
            le.sdkLoadFailed = true;
            throw le;
        }
    } else {
        SpeechSDK = window.SpeechSDK;
    }

    /* ---- detect mobile ---- */
    var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    var micStream = null;
    var audioConfig;

    console.debug('[PRON] audio mode:', isMobile ? 'defaultMic (mobile)' : 'stream (desktop)');

    if (isMobile) {
        try {
            var tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
            tmp.getTracks().forEach(function (t) { t.stop(); });
        } catch (micErr) {
            console.error('[PRON] mic denied:', micErr.name, micErr.message);
            var e1 = new Error('microphone permission denied');
            e1.micError = true;
            throw e1;
        }
        try {
            audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
        } catch (cfgErr) {
            console.error('[PRON] fromDefaultMicrophoneInput failed:', cfgErr.message);
            throw new Error('AudioConfig failed');
        }
    } else {
        var savedMic = _getSavedMicId();
        var audioConstraints = savedMic
            ? { deviceId: { exact: savedMic } }
            : true;

        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        } catch (micErr) {
            if (savedMic) {
                try {
                    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                } catch (micErr2) {
                    var e2 = new Error('microphone permission denied');
                    e2.micError = true;
                    throw e2;
                }
            } else {
                var e3 = new Error('microphone permission denied');
                e3.micError = true;
                throw e3;
            }
        }

        var usedTrack = micStream.getAudioTracks()[0];
        console.debug('[PRON] mic granted, device:', usedTrack ? usedTrack.label : 'unknown');

        var vol = await _checkStreamVolume(micStream);
        console.debug('[PRON] volume check:', vol);
        if (vol < 5) {
            showStatus('\u26A0\uFE0F Mikrofon juda past ishlayapti');
            setTimeout(function () { showStatus(''); }, 2500);
        }

        try {
            audioConfig = SpeechSDK.AudioConfig.fromStreamInput(micStream);
        } catch (cfgErr) {
            micStream.getTracks().forEach(function (t) { t.stop(); });
            throw new Error('AudioConfig failed');
        }
    }

    /* ---- Speech token ---- */
    var tokenData;
    try {
        tokenData = await _getSpeechToken();
    } catch (tokErr) {
        if (micStream) micStream.getTracks().forEach(function (t) { t.stop(); });
        throw tokErr;
    }

    /* ---- Speech config ---- */
    var speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(
        tokenData.token, tokenData.region
    );
    speechConfig.speechRecognitionLanguage = 'ru-RU';

    /* ---- Pronunciation assessment config (Phoneme level for accurate scoring) ---- */
    var pronConfig = new SpeechSDK.PronunciationAssessmentConfig(
        referenceText,
        SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
        SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
        true  // enableMiscue
    );
    pronConfig.phonemeAlphabet = 'IPA';
    pronConfig.enableProsodyAssessment = true;

    console.debug('[PRON] PronunciationAssessmentConfig referenceText:', JSON.stringify(referenceText));

    /* ---- Recognizer ---- */
    var recognizerCreatedAt = Date.now();
    var recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
    pronConfig.applyTo(recognizer);
    console.log('[PRON][RECOG] created, region:', tokenData.region,
                'lang:', speechConfig.speechRecognitionLanguage,
                'ref:', JSON.stringify(referenceText));

    /* ---- State flags ---- */
    var gotInterim = false;
    var gotFinal = false;
    var lastInterimText = '';

    function _sanitizeRecognizedText(text, allowExactReferenceMatch) {
        var recognizedText = (text || '').trim();
        if (!recognizedText) return '';

        recognizedText = recognizedText
            .toLowerCase()
            .replace(/[.,!?;:"'«»()\[\]{}\-—–…]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!recognizedText) return '';

        var tokens = recognizedText.split(' ');

        /* N-fold phrase-repeat: smallest chunk size such that the whole
           token array is k≥2 verbatim copies of that chunk → keep one copy.
           Catches 2x, 3x, … hallucinations (e.g. "X Y X Y X Y" → "X Y").
           For n=1 the loop body never runs, so a single token like "я"
           passes through untouched. */
        var n = tokens.length;
        for (var size = 1; size <= Math.floor(n / 2); size++) {
            if (n % size !== 0) continue;
            var chunk = tokens.slice(0, size).join(' ');
            var isRepeat = true;
            for (var k = size; k < n; k += size) {
                if (tokens.slice(k, k + size).join(' ') !== chunk) {
                    isRepeat = false;
                    break;
                }
            }
            if (isRepeat) {
                tokens = tokens.slice(0, size);
                break;
            }
        }

        /* Adjacent-duplicate collapse ("я я" → "я", "есть есть есть" →
           "есть"). Real phrases like "у меня кошка у меня собака"
           survive because no two adjacent tokens are equal. */
        var dedup = [];
        for (var i = 0; i < tokens.length; i++) {
            if (i === 0 || tokens[i] !== tokens[i - 1]) {
                dedup.push(tokens[i]);
            }
        }

        return dedup.join(' ');
    }

    function _getSafeInterimText() {
        if (lastInterimText && lastInterimText.length < 2) {
            lastInterimText = '';
        }

        return lastInterimText;
    }

    function _isRealEmptyRecognizedText(text) {
        return !text || !String(text).trim() || String(text).trim().length < 2;
    }

    /* Score a fallback transcript (interim / timeout / NoMatch path).
       The transcript is graded by the SAME deterministic engine as the
       main path, so a fallback never invents a softer or harsher verdict
       than the words actually warrant. */
    function buildScoredResult(text, accuracy, fluency, completeness, overrides) {
        var recognizedText = _sanitizeRecognizedText(text, false);
        if (!recognizedText || !recognizedText.trim()) {
            return buildZeroResult('', (overrides && overrides.reason) || 'no_speech');
        }
        return _finalizePronunciationResult({
            recognizedText: recognizedText,
            accuracyScore: accuracy === undefined ? null : accuracy,
            fluencyScore: fluency === undefined ? null : fluency,
            words: (overrides && Array.isArray(overrides.words)) ? overrides.words : []
        }, referenceText);
    }

    function buildZeroResult(text, reason) {
        return {
            recognizedText: '',
            pronunciationScore: 0,
            finalScore: 0,
            verdict: 'empty',
            pass: false,
            accuracyScore: null,
            fluencyScore: null,
            completenessScore: 0,
            aniqlik: 0,
            ravonlik: 0,
            toliqlik: 0,
            coverage: 0,
            matchRatio: 0,
            words: [],
            wordStates: [],
            wordCounts: { green: 0, yellow: 0, red: 0 },
            wordFeedback: [],
            reason: reason || 'no_speech'
        };
    }

    /* sessionStarted is bound INSIDE the Promise body below (G1) so it
       can clear the connection-watchdog timer that fires when Azure's
       websocket fails before the session ever opens. */

    try { _showPronListening(); } catch (uiErr) { console.warn('[UI ERROR] _showPronListening:', uiErr); }

    /* ---- Recognition: event-driven, timeout-safe ---- */
    return new Promise(function (resolve, reject) {
        var finished = false;
        var resolved = false;
        var timeoutHit = false;
        var softTimeoutId;
        var hardTimeoutId;
        var silenceTimerId;
        var sessionStoppedFallbackId;
        var processingTimerId;
        /* Connection watchdog (adaptive — see also the schedule below):
             - connectionWarnTimeoutId fires at 5s and ONLY changes the UI
               to "Server bilan aloqa o‘rnatilmoqda…". It does NOT reject
               and does NOT touch the recognizer; the websocket may still
               open later (we have observed real opens at 11s).
             - connectionFailTimeoutId fires at 13s and DOES reject with
               connectionFailed=true if sessionStarted still has not
               arrived. This replaces the single-shot 5s reject that was
               wrongly classifying slow-but-eventually-good websockets
               as "Speech server bilan aloqa yo‘q". */
        var connectionWarnTimeoutId;
        var connectionFailTimeoutId;
        var sessionStartedAt = null;

        function cleanup() {
            try {
                if (recognizer) {
                    try { recognizer.stopContinuousRecognitionAsync && recognizer.stopContinuousRecognitionAsync(); } catch (e1) {}
                    try { recognizer.close(); } catch (e2) {}
                }
            } finally {
                recognizer = null;
            }
            if (micStream) {
                try { micStream.getTracks().forEach(function (t) { t.stop(); }); } catch {}
                micStream = null;
            }
        }

        function finishSafe(fn) {
            if (finished) return;
            finished = true;
            clearTimeout(softTimeoutId);
            clearTimeout(hardTimeoutId);
            clearTimeout(silenceTimerId);
            clearTimeout(sessionStoppedFallbackId);
            clearTimeout(connectionWarnTimeoutId);
            clearTimeout(connectionFailTimeoutId);
            clearTimeout(processingTimerId);
            try { _hideProcessingLoader(); } catch (e) { /* ignore */ }
            cleanup();
            _stopActivePron = null;
            fn();
        }

        function resolveOnce(value) {
            if (resolved) return;
            resolved = true;
            finishSafe(function () { resolve(value); });
        }

        function rejectOnce(error) {
            if (resolved) return;
            resolved = true;
            finishSafe(function () { reject(error); });
        }

        function scheduleSilenceFallback() {
            clearTimeout(silenceTimerId);
            if (finished || gotFinal || !gotInterim) return;

            /* Patch F: 1800ms was firing BEFORE Azure's recognized event,
               pre-empting the real final result with the (worse) interim
               transcript and a forced reason='unclear_speech'. That is the
               root cause behind problem #3 ("user must repeat 2–3 times")
               and a major contributor to problem #2 ("Aniqroq gapiring
               even when green"). 2500ms gives Azure enough headroom to
               deliver recognized first; if real silence persists past
               that, the fallback still kicks in. */
            silenceTimerId = setTimeout(function () {
                /* Re-check: gotFinal may have flipped between scheduling
                   and firing — never resolve on top of a finalised run. */
                if (finished || gotFinal || resolved || !gotInterim) return;

                console.warn('[PRON] silence fallback → scored result');
                resolveOnce(buildScoredResult(_getSafeInterimText(), null, null, null, {
                    reason: 'unclear_speech',
                    words: []
                }));
            }, 2500);
        }

        recognizer.sessionStarted = function () {
            sessionStartedAt = Date.now();
            console.log('[PRON][WS] sessionStarted — websocket open after',
                        (sessionStartedAt - recognizerCreatedAt) + 'ms');
            /* Adaptive watchdog: cancel BOTH the 5s warn and the 13s fail
               timers — Azure is alive, neither should run anymore. Setting
               the IDs to null defends against the rare case where a
               late-queued timer body still gets a chance to execute; it
               also re-checks `sessionStartedAt` and bails. */
            clearTimeout(connectionWarnTimeoutId);
            clearTimeout(connectionFailTimeoutId);
            connectionWarnTimeoutId = null;
            connectionFailTimeoutId = null;
            /* Patch A: Azure has confirmed the session is live and audio is
               flowing — only now is it safe to invite the user to speak. */
            try { showStatus('🎤 Gapiring...'); } catch (_e1) {}
            try {
                /* Fade the preparation loader out smoothly (350ms opacity
                   transition via .is-hiding) so it doesn't snap to
                   display:none under the "Tinglayapman…" text. After the
                   fade we collapse it to display:none so it stops
                   consuming layout / animation frames. The listening
                   dots in the text continue to convey activity. */
                var loaderEl = document.querySelector('#pronCard .pron-loader');
                if (loaderEl) {
                    loaderEl.classList.add('is-hiding');
                    setTimeout(function () {
                        try {
                            /* Verify the element is still the same loader
                               (overlay may have been swapped to results) */
                            if (loaderEl && loaderEl.classList.contains('is-hiding')) {
                                loaderEl.style.display = 'none';
                            }
                        } catch (_hideErr) { /* DOM gone — fine */ }
                    }, 400);
                }
                var listenText = document.getElementById('pronListeningText');
                if (listenText) {
                    listenText.innerHTML = 'Tinglayapman<span class="pron-listening-dots"><span>.</span><span>.</span><span>.</span></span>';
                }
                var listenSub = document.getElementById('pronListeningSub');
                if (listenSub) {
                    listenSub.textContent = 'So‘zni aniq ayting';
                }
            } catch (_e2) { /* UI optional */ }
        };

        recognizer.sessionStopped = function () {
            console.debug('[PRON] session stopped, gotInterim:', gotInterim, 'gotFinal:', gotFinal);
            if (finished || gotFinal || resolved) return;

            clearTimeout(sessionStoppedFallbackId);
            sessionStoppedFallbackId = setTimeout(function () {
                /* Patch F: gotFinal/resolved may flip while the 250ms
                   grace timer is queued — bail rather than overwriting
                   a real final result. */
                if (finished || gotFinal || resolved) return;

                console.warn('[PRON] sessionStopped fallback → final safety result');
                if (gotInterim) {
                    resolveOnce(buildScoredResult(_getSafeInterimText(), null, null, null, {
                        reason: 'unclear_speech',
                        words: []
                    }));
                    return;
                }

                resolveOnce(buildZeroResult('', 'no_speech'));
            }, 250);
        };

        _stopActivePron = function () {
            if (finished) return;
            var err = new Error('cancelled by user');
            err.cancelled = true;
            rejectOnce(err);
        };

        /**
         * Extract text + pronunciation scores from a recognition result.
         * Returns a result object or null if text is garbage/empty.
         */
        function extractPronData(result) {
            var recognizedText = '';
            function buildInvalidPronData(text) {
                var invalidText = _sanitizeRecognizedText(text, true);
                return buildScoredResult(invalidText, null, null, null, {
                    reason: 'no_speech',
                    words: [],
                    wordFeedback: [],
                    error: true
                });
            }
            try {
                var jsonStr = result.properties.getProperty(
                    SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult
                );
                if (jsonStr) {
                    var parsed = JSON.parse(jsonStr);
                    recognizedText = (parsed.DisplayText || '').trim();
                    console.debug('[PRON] JSON DisplayText:', recognizedText);
                }
            } catch (jsonErr) {
                console.warn('[PRON] JSON parse failed:', jsonErr);
            }
            if (!recognizedText) {
                recognizedText = (result.text || '').trim();
            }
            /* Remove Azure duplicates (e.g. "У меня есть, У меня есть меня есть").
               allowExactReferenceMatch=true → keep the text intact; the
               anti-fake guard below uses audio-quality metrics to decide
               whether an exact echo is legitimate or a hallucination. */
            recognizedText = _sanitizeRecognizedText(recognizedText.split(',')[0], true);

            /* Garbage check — only real recognized speech is scored */
            if (_isRealEmptyRecognizedText(recognizedText)) {
                return buildInvalidPronData(recognizedText);
            }

            /* Extract Azure metrics (used only by the anti-cheat guard) */
            var words = [];
            var accuracy = 0;
            var fluency = 0;
            try {
                var pronResult = SpeechSDK.PronunciationAssessmentResult.fromResult(result);
                var nb = pronResult.detailResult;
                words = (nb.Words || []).map(function (w) {
                    var pa = w.PronunciationAssessment;
                    return {
                        word: w.Word,
                        accuracy: Math.round(pa ? (pa.AccuracyScore || 0) : 0),
                        error: (pa && pa.ErrorType) || 'None'
                    };
                });

                var data = null;
                try {
                    var jsonStr2 = result.properties.getProperty(
                        SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult
                    );
                    if (jsonStr2) data = JSON.parse(jsonStr2);
                } catch (_e) { /* ignore */ }

                accuracy = Number(data?.NBest?.[0]?.PronunciationAssessment?.AccuracyScore);
                fluency = Number(data?.NBest?.[0]?.PronunciationAssessment?.FluencyScore);
            } catch (scoreErr) {
                console.warn('[PRON] Azure score extraction failed, grading by text similarity only:', scoreErr);
            }

            /* normalize Azure metrics (0/null/garbage → null) */
            var rawAccuracy = _normalizeMetric(accuracy);
            var rawFluency = _normalizeMetric(fluency);

            /* ---- Deterministic verdict (text similarity, see engine) ----
               The verdict is graded purely from the recognized transcript
               vs the reference text. Azure's per-word accuracy is used ONLY
               for the anti-cheat fake-echo guard below — never to colour
               words or to soften / harden the verdict. */
            var quality = _getWordQuality(words);
            var echoCheck = _classifyWords(recognizedText, referenceText);
            var perfectEcho = echoCheck.total > 0
                && echoCheck.counts.green === echoCheck.total
                && echoCheck.extraWords === 0;

            /* Anti-cheat: Azure occasionally returns a verbatim echo of the
               reference text without real, clean audio behind it. A genuine
               perfect attempt has solid accuracy + fluency; a fake echo does
               not. Only a FULL echo with present-but-clearly-bad audio
               metrics is rejected — missing metrics are trusted (so a real
               perfect attempt is never failed by a metric glitch), and every
               partial attempt is graded normally by text similarity. */
            var fakeEcho = perfectEcho
                && rawAccuracy !== null && rawFluency !== null
                && (rawAccuracy < 45 || rawFluency < 45
                    || (quality.avg !== null && quality.avg < 45));
            if (fakeEcho) {
                console.log('[PRON] FAKE ECHO BLOCKED — accuracy/fluency too low');
            }

            return _finalizePronunciationResult({
                recognizedText: recognizedText,
                accuracyScore: rawAccuracy,
                fluencyScore: rawFluency,
                words: words,
                reason: fakeEcho ? 'fake_match' : undefined
            }, referenceText);
        }

        /* ===========================================================
         *  SILENCE TIMER: override recognizing handler with access
         *  to finishSafe/resolve so 3s of silence forces a result.
         * =========================================================== */
        recognizer.recognizing = function (s, e) {
            if (finished) return;
            if (e.result && e.result.text) {
                gotInterim = true;
                var text = e.result.text.trim();
                if (text) lastInterimText = text;
                clearTimeout(sessionStoppedFallbackId);
                scheduleSilenceFallback();

                /* Show the processing pill ~2s after the LAST interim — i.e.
                   once the user has stopped talking and we are waiting on
                   Azure's score. Reset on every interim so it never shows
                   while the user is still speaking. */
                clearTimeout(processingTimerId);
                processingTimerId = setTimeout(function () {
                    if (!finished) {
                        try { _showProcessingLoader(); } catch (uiErr) { /* ignore */ }
                    }
                }, 2000);

                console.debug('[PRON] INTERIM:', e.result.text);
            }
        };

        /* ===========================================================
         *  MAIN HANDLER: recognized event
         *  Fires BEFORE recognizeOnceAsync callback → cannot be killed
         *  by timeout because timeout never closes recognizer.
         * =========================================================== */
        recognizer.recognized = function (s, e) {
            gotFinal = true;
            console.debug('[PRON] FINAL (recognized):', e.result ? e.result.reason : 'null',
                'text:', e.result ? e.result.text : '', 'timeoutHit:', timeoutHit);

            if (finished) return;

            if (!e.result) {
                return resolveOnce(buildZeroResult(_getSafeInterimText()));
            }

            var reason = e.result.reason;

            if (reason === SpeechSDK.ResultReason.RecognizedSpeech) {
                var data = extractPronData(e.result);
                if (data) {
                    console.debug('[PRON] score:', data.pronunciationScore);
                    resolveOnce(data);
                } else if (gotInterim) {
                    console.warn('[PRON] RecognizedSpeech but garbage text, gotInterim → zero fallback');
                    resolveOnce(buildZeroResult(_getSafeInterimText()));
                } else {
                    var err = new Error('Ovoz aniqlanmadi. Balandroq gapiring.');
                    err.noSpeech = true;
                    rejectOnce(err);
                }

            } else if (reason === SpeechSDK.ResultReason.NoMatch) {
                if (gotInterim) {
                    /* NoMatch with interim = Azure couldn't lock in a confident
                       transcript, but we DID hear the user. Score the interim
                       text directly instead of running it through extractPronData
                       (which would see an empty Azure payload and classify it as
                       no_speech). This is what prevents the "speak 2-3 times"
                       UX bug — we always produce a result from real audio. */
                    var nmInterim = _getSafeInterimText();
                    console.warn('[PRON] NoMatch+gotInterim → scored interim:', nmInterim);
                    resolveOnce(buildScoredResult(nmInterim, null, null, null, {
                        reason: 'unclear_speech',
                        words: []
                    }));
                } else {
                    var noMatchErr = new Error('Ovoz aniqlanmadi. Balandroq gapiring.');
                    noMatchErr.noSpeech = true;
                    rejectOnce(noMatchErr);
                }

            } else {
                /* Canceled / unexpected reason */
                console.warn('[PRON] recognized event reason:', reason, 'gotInterim:', gotInterim);
                if (gotInterim) {
                    resolveOnce(buildZeroResult(_getSafeInterimText()));
                } else {
                    rejectOnce(new Error('Xatolik yuz berdi. Qayta urinib ko\'ring.'));
                }
            }
        };

        /* ---- canceled event ---- */
        recognizer.canceled = function (s, e) {
            /* G5: full diagnostic — errorCode is the #1 clue when the
               websocket fails (1006 = abnormal close, 1007 = bad payload,
               4001 = auth). Without this we cannot tell key/region issues
               apart from server outages. */
            console.error('[PRON][WS] CANCELED — reason:', e && e.reason,
                          'errorCode:', e && e.errorCode,
                          'errorDetails:', e && e.errorDetails,
                          'sessionStartedAt:', sessionStartedAt,
                          'wsOpenMs:', sessionStartedAt ? (sessionStartedAt - recognizerCreatedAt) : 'NEVER');
            if (finished) return;
            if (gotInterim || gotFinal) {
                console.warn('[PRON] Canceled but speech was detected → zero fallback');
                resolveOnce(buildZeroResult(_getSafeInterimText()));
                return;
            }
            /* G3: Error cancellation = network / auth / bad token / wrong
               region. Reject IMMEDIATELY (no waiting 30s for hard timeout)
               and tag the error with connectionFailed=true so the UI shows
               the dedicated server-down verdict instead of a generic
               "Xatolik" toast. */
            if (e && e.reason === SpeechSDK.CancellationReason.Error) {
                console.error('[PRON][WS] error cancellation → immediate reject (connectionFailed)');
                var ce = new Error("Speech server bilan aloqa yo‘q");
                ce.connectionFailed = true;
                ce.errorCode = e.errorCode;
                ce.errorDetails = e.errorDetails;
                /* Only treat as websocket failure if the session never opened.
                   If sessionStarted already fired and the error is mid-stream,
                   surface the original Azure message instead. */
                if (sessionStartedAt) {
                    ce.message = e.errorDetails || 'Xatolik yuz berdi. Qayta urinib ko\'ring.';
                    ce.connectionFailed = false;
                }
                rejectOnce(ce);
                return;
            }
            /* EndOfStream / other non-error → resolve with zero */
            console.warn('[PRON] Canceled (non-error) → ZERO_RESULT');
            resolveOnce(buildZeroResult(_getSafeInterimText()));
        };

        /* ===========================================================
         *  Listening timers (Patch B): armed AFTER a 400ms warmup
         *  grace, NOT from t=0. The recognizer is started below
         *  this block; this grace prevents premature soft-timeout
         *  fires while the audio pipeline is still settling, so the
         *  user always gets a full 15s listening window measured
         *  from a stable start.
         * =========================================================== */
        var WARMUP_GRACE_MS = 400;
        setTimeout(function _armListeningTimers() {
            if (finished) return;

        /* ===========================================================
         *  SOFT TIMEOUT (15s): warn only, NEVER reject, NEVER cleanup
         *  Recognizer stays alive — recognized event will still fire.
         * =========================================================== */
        softTimeoutId = setTimeout(function () {
            /* Patch F: bail if recognition resolved between scheduling
               and firing — never overwrite a real final with a forced
               unclear_speech fallback. */
            if (finished || gotFinal || resolved) return;
            timeoutHit = true;
            if (gotInterim) {
                var txt = _sanitizeRecognizedText(_getSafeInterimText() || '', true);
                console.warn('[PRON] soft timeout (15s) + gotInterim — forcing scored resolve');
                resolveOnce(buildScoredResult(txt, null, null, null, {
                    reason: 'unclear_speech',
                    words: []
                }));
                return;
            }
            console.warn('[PRON] soft timeout (15s) — recognizer still alive, waiting for recognized event...');
            showStatus('\u23F3 Kutilmoqda...');
        }, 15000);

        /* ===========================================================
         *  HARD TIMEOUT (30s): safety net for complete silence only.
         *  If gotInterim/gotFinal → extend, never reject.
         * =========================================================== */
        hardTimeoutId = setTimeout(function () {
            /* Patch F: stale-timeout guard — recognized may have resolved
               while this 30s callback sat in the queue. */
            if (finished || resolved) return;
            if (gotInterim || gotFinal) {
                console.warn('[PRON] hard timeout (30s) but speech detected — extending 15s...');
                hardTimeoutId = setTimeout(function () {
                    if (finished || resolved) return;
                    console.error('[PRON] ultimate timeout (45s) — forcing zero resolve');
                    resolveOnce(buildZeroResult(_getSafeInterimText()));
                }, 15000);
                return;
            }
            console.error('[PRON] hard timeout (30s) — no speech at all');
            rejectOnce(new Error('Audio olinmadi. Mikrofon sozlamalarini tekshiring.'));
        }, 30000);
        }, WARMUP_GRACE_MS); /* close warmup-grace wrapper (Patch B) */

        /* ---- Start recognition ---- */
        console.log('[PRON][WS] opening websocket via recognizeOnceAsync(), region:',
                    tokenData.region);

        /* Patch B: start the recognizer NOW. The previous 700ms wrapper
           around recognizeOnceAsync silently dropped the user's first
           syllables — by the time the recognizer was actually capturing,
           early speech (spoken in response to "Gapiring...") was already
           lost. The listening-overlay swap happens in sessionStarted
           (recognizer's real ready signal) instead of via a blind timer. */
        try {
            recognizer.recognizeOnceAsync(
                function (result) {
                    /* BACKUP: only runs if recognized event didn't already handle it */
                    if (finished) {
                        console.debug('[PRON] recognizeOnceAsync callback — already finished via recognized event');
                        return;
                    }
                    console.warn('[PRON] recognizeOnceAsync callback — recognized event missed, processing here');
                    gotFinal = true;

                    if (!result) {
                        if (gotInterim) {
                            return resolveOnce(buildZeroResult(_getSafeInterimText()));
                        }
                        return rejectOnce(new Error('Natija olinmadi.'));
                    }

                    var data = extractPronData(result);
                    if (data) {
                        resolveOnce(data);
                    } else if (gotInterim) {
                        resolveOnce(buildZeroResult(_getSafeInterimText()));
                    } else {
                        var callbackErr = new Error('Ovoz aniqlanmadi. Balandroq gapiring.');
                        callbackErr.noSpeech = true;
                        rejectOnce(callbackErr);
                    }
                },
                function (err) {
                    if (finished) return;
                    /* G4 / G5: full visibility on the SDK error path. If
                       this fires before sessionStarted, the websocket
                       handshake itself failed — surface it as the
                       dedicated server-down verdict instead of a generic
                       error toast or silent 30s wait. */
                    console.error('[PRON][WS] recognizeOnceAsync error callback:', err,
                                  'sessionStartedAt:', sessionStartedAt);
                    if (gotInterim) {
                        resolveOnce(buildZeroResult(_getSafeInterimText()));
                        return;
                    }
                    if (!sessionStartedAt) {
                        var ce = new Error("Speech server bilan aloqa yo‘q");
                        ce.connectionFailed = true;
                        ce.errorDetails = String(err);
                        rejectOnce(ce);
                        return;
                    }
                    rejectOnce(err);
                }
            );
        } catch (startErr) {
            /* G4: synchronous SDK throw (rare — typically invalid config).
               Reject immediately rather than letting the 30s hard timeout
               swallow it. */
            console.error('[PRON][WS] recognizeOnceAsync threw synchronously:', startErr);
            var sce = new Error("Speech server bilan aloqa yo‘q");
            sce.connectionFailed = true;
            sce.errorDetails = String(startErr && startErr.message || startErr);
            rejectOnce(sce);
        }

        /* G1: ADAPTIVE connection watchdog.
           Two staged timers replace the original single 5s reject:
             - 5s WARN: ONLY swaps preparation copy to
               "Server bilan aloqa o‘rnatilmoqda…". Does NOT reject and
               does NOT touch the recognizer. The websocket may still
               open later (real opens at ~11s have been observed).
             - 13s FAIL: rejects with connectionFailed=true so the catch
               handler shows "Speech server bilan aloqa yo‘q".
           Both IDs are cleared in cleanup() and in sessionStarted so a
           late-firing timer cannot overwrite the listening UI or trigger
           a false error after Azure connected. */
        connectionWarnTimeoutId = setTimeout(function () {
            if (finished || sessionStartedAt) return;
            console.warn('[PRON][WS] connection slow (5s) — switching UI to "connecting" state');
            try {
                var warnText = document.getElementById('pronListeningText');
                if (warnText) {
                    warnText.innerHTML = 'Server bilan aloqa o‘rnatilmoqda<span class="pron-listening-dots"><span>.</span><span>.</span><span>.</span></span>';
                }
                var warnSub = document.getElementById('pronListeningSub');
                if (warnSub) {
                    warnSub.textContent = 'Biroz kuting, ulanmoqda...';
                }
                /* Phase color: green → orange so the user sees the loader
                   ACK the slow connection ("not frozen — still connecting"). */
                var warnLoader = document.querySelector('#pronCard .pron-loader');
                if (warnLoader) warnLoader.classList.add('is-connecting');
            } catch (_warnUiErr) { /* UI-only, ignore */ }
        }, 5000);

        connectionFailTimeoutId = setTimeout(function () {
            if (finished || sessionStartedAt) return;
            console.error('[PRON][WS] connection watchdog (13s) — sessionStarted never arrived');
            var ct = new Error("Speech server bilan aloqa yo‘q");
            ct.connectionFailed = true;
            ct.connectionTimeout = true;
            rejectOnce(ct);
        }, 13000);
    });
}

/* ================================================================== */
/*  Word Progress System (localStorage)                               */
/* ================================================================== */
const _PROGRESS_KEY = 'uzdarus_word_progress';

/* Per-account, per-course storage key.
   - Per-account: a single global key used to leak pronunciation progress
     between accounts on a shared device.
   - Per-course: the inner object is keyed by topicId only, so without a
     course namespace "A1 topic 1" and "A2 topic 1" collided whenever their
     word counts matched. Each vocabulary page declares window.VOCAB_COURSE
     (e.g. 'a1', 'a2', 'a1-demo'); unknown pages fall back gracefully. */
function _progressKey() {
    var uid = '';
    try {
        var cu = JSON.parse(localStorage.getItem('currentUser') || 'null');
        if (cu) uid = String(cu.id || cu.uid || cu.email || '');
    } catch (e) { /* ignore */ }
    var course = String((typeof window !== 'undefined' && window.VOCAB_COURSE) || 'unknown')
        .toLowerCase().replace(/[^a-z0-9-]/g, '') || 'unknown';
    return _PROGRESS_KEY + '_' + course + '_' + (uid || 'guest');
}

function _loadProgress() {
    try {
        var raw = localStorage.getItem(_progressKey());
        if (raw) return JSON.parse(raw);
    } catch { /* corrupted */ }
    return {};
}

function _saveProgress(progress) {
    try { localStorage.setItem(_progressKey(), JSON.stringify(progress)); } catch {}
}

/**
 * Get the progress array for a lesson/topic.
 * Creates it on first access with word 0 unlocked (true), rest locked (false).
 */
function _getTopicProgress(topicId, wordCount) {
    if (!topicId || !wordCount || wordCount < 1) return [];
    var progress = _loadProgress();
    var key = String(topicId);
    if (!progress[key] || progress[key].length !== wordCount) {
        var arr = new Array(wordCount).fill(false);
        arr[0] = true; // first word always unlocked
        progress[key] = arr;
        _saveProgress(progress);
    }
    return progress[key];
}

/**
 * Mark word at index as completed and unlock the next one.
 * Always calls _applyWordProgressUI to update the DOM.
 */
function _completeWord(topicId, wordIndex) {
    if (!topicId) return;
    var progress = _loadProgress();
    var key = String(topicId);
    if (!progress[key]) return;
    if (wordIndex < 0 || wordIndex >= progress[key].length) return;
    progress[key][wordIndex] = true;
    /* unlock the next word if it exists */
    if (wordIndex + 1 < progress[key].length) {
        progress[key][wordIndex + 1] = true;
    }
    _saveProgress(progress);
    _applyWordProgressUI(topicId);
    updateProgressBar(topicId, progress[key].length);
}

/**
 * Check if a word is locked.
 * A word is accessible (unlocked) only if progress[index] === true.
 * Word 0 is always unlocked.
 */
function _isWordLocked(topicId, wordIndex) {
    if (!topicId) return false;
    if (wordIndex <= 0) return false;
    var progress = _loadProgress();
    var key = String(topicId);
    if (!progress[key]) return false; // no progress tracking active
    if (wordIndex >= progress[key].length) return true; // out of bounds = locked
    return !progress[key][wordIndex];
}

/** Get the word index — prefers word.wordIndex from getCurrentWord(). */
function _getWordIndex(word) {
    /* 1. From the word object itself (set by getCurrentWord) — most reliable */
    if (word && typeof word.wordIndex === 'number') return word.wordIndex;
    /* 2. Synced global (set by vocabulary pages on every card change) */
    if (typeof window.currentWordIndex === 'number') return window.currentWordIndex;
    return -1;
}

/**
 * Initialise progress tracking for a topic.
 * Called by the page when a topic is opened.
 *
 * If topicId is missing, wordCount is 0, or array length doesn't match:
 *   → recreates the array (word 0 = true, rest = false).
 */
function initWordProgress(topicId, wordCount) {
    if (!topicId || !wordCount || wordCount < 1) return;
    var progress = _loadProgress();
    var key = String(topicId);
    if (!progress[key] || progress[key].length !== wordCount) {
        var arr = new Array(wordCount).fill(false);
        arr[0] = true;
        progress[key] = arr;
        _saveProgress(progress);
    }

    /* ---- restore currentWordIndex from saved progress ---- */
    var arr2 = progress[key];
    var nextIdx = -1;
    for (var i = 0; i < arr2.length; i++) {
        if (!arr2[i]) { nextIdx = i; break; }
    }
    /* find the active frontier (last true) */
    if (nextIdx === -1) {
        /* all completed — set to length so page knows it's done */
        nextIdx = arr2.length;
    }
    window.currentWordIndex = nextIdx;
    if (typeof window.loadCard === 'function') window.loadCard();

    _applyWordProgressUI(topicId);
    updateProgressBar(topicId, wordCount);
}

/**
 * Apply visual states to word items on the page.
 * Looks for elements with [data-word-index] inside #flashcardScreen or .words-list.
 */
function _applyWordProgressUI(topicId) {
    if (!topicId) return;
    var progress = _loadProgress();
    var key = String(topicId);
    var arr = progress[key];
    if (!arr) return;

    /* Active word = the last true index in the array (the frontier).
       _completeWord sets [i]=true AND [i+1]=true, so the frontier
       is always the highest index that is true. Everything before it
       is completed; everything after it is locked. */
    var activeIdx = -1;
    for (var ai = arr.length - 1; ai >= 0; ai--) {
        if (arr[ai]) { activeIdx = ai; break; }
    }

    /* Apply to any word cards/items on page */
    var items = document.querySelectorAll('[data-word-index]');
    items.forEach(function (el) {
        var idx = parseInt(el.getAttribute('data-word-index'), 10);
        if (isNaN(idx) || idx < 0 || idx >= arr.length) return;

        el.classList.remove('word-locked', 'word-active', 'word-completed');

        if (!arr[idx]) {
            /* locked */
            el.classList.add('word-locked');
        } else if (idx === activeIdx) {
            /* current active word */
            el.classList.add('word-active');
        } else {
            /* completed (unlocked but not the active frontier) */
            el.classList.add('word-completed');
        }
    });

    /* Also update audio/pronunciation buttons for the current card */
    _updateCardButtonStates(topicId);

    /* Keep the "Keyingi" button locked/unlocked in sync with progress */
    if (typeof _refreshNextLock === 'function') _refreshNextLock();
}

/** Disable audio buttons if current word is locked. */
function _updateCardButtonStates(topicId) {
    var word = typeof window.getCurrentWord === 'function' && window.getCurrentWord();
    if (!word) return;
    var idx = _getWordIndex(word);
    if (idx < 0) return;
    var locked = _isWordLocked(topicId, idx);
    var btns = document.querySelectorAll('.audio-button');
    btns.forEach(function (btn) {
        if (locked) {
            btn.disabled = true;
            btn.style.opacity = '0.3';
        } else {
            btn.disabled = false;
            btn.style.opacity = '';
        }
    });
}

/** Get the index of the first non-completed word (the current active one). */
function getNextActiveWordIndex(topicId, wordCount) {
    var progress = _getTopicProgress(topicId, wordCount);
    for (var i = 0; i < progress.length; i++) {
        if (!progress[i]) return i;
    }
    return progress.length; // all done
}

/** Check if a specific word is completed. */
function isWordCompleted(topicId, wordIndex) {
    var progress = _loadProgress();
    var key = String(topicId);
    if (!progress[key]) return false;
    return !!progress[key][wordIndex];
}

/* ================================================================== */
/*  Flashcard Animations (success / error)                            */
/* ================================================================== */

/** Green glow + scale bounce on the flashcard */
function _animateFlashcardSuccess() {
    var fc = document.querySelector('.flashcard');
    if (!fc) return;
    fc.classList.remove('flashcard-error');
    fc.classList.add('flashcard-success');
    setTimeout(function () { fc.classList.remove('flashcard-success'); }, 800);
}

/** Red border + shake on the flashcard */
function _animateFlashcardError() {
    var fc = document.querySelector('.flashcard');
    if (!fc) return;
    fc.classList.remove('flashcard-success');
    fc.classList.add('flashcard-error');
    setTimeout(function () { fc.classList.remove('flashcard-error'); }, 600);
}

/* ================================================================== */
/*  Progress Bar                                                      */
/* ================================================================== */

/**
 * Update the speech progress bar from localStorage progress.
 * @param {string} topicId — the current topic
 * @param {number} total   — total word count
 */
function updateProgressBar(topicId, total) {
    var progress = _loadProgress();
    var key = String(topicId);
    var arr = progress[key] || [];

    /* count completed: all true entries EXCEPT the last true (active frontier) */
    var completed = 0;
    var lastTrue = -1;
    for (var i = arr.length - 1; i >= 0; i--) {
        if (arr[i]) { lastTrue = i; break; }
    }
    for (var j = 0; j < arr.length; j++) {
        if (arr[j] && j < lastTrue) completed++;
    }
    /* if all done, count all */
    if (lastTrue === arr.length - 1 && arr.every(Boolean)) completed = arr.length;

    var pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    var fill = document.getElementById('speechProgressFill');
    if (fill) fill.style.width = Math.min(pct, 100) + '%';

    var text = document.getElementById('progressText');
    if (text) text.innerText = completed + '/' + total;
}

/* ================================================================== */
/*  Lesson Complete Check                                             */
/* ================================================================== */

/** Returns true if every word in the topic is completed. */
function _isLessonComplete(topicId) {
    var progress = _loadProgress();
    var key = String(topicId);
    var arr = progress[key];
    if (!arr || arr.length === 0) return false;
    for (var i = 0; i < arr.length; i++) {
        if (!arr[i]) return false;
    }
    return true;
}

/**
 * Show the lesson-complete overlay with bonus XP.
 * Falls back to the page's own showCompletion if available.
 */
function _showLessonCompleteOverlay() {
    _playSoundSuccess();
    _hapticSuccess();

    _injectWordProgressCSS(); // ensure CSS is loaded

    var ov = document.getElementById('lessonCompleteOverlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'lessonCompleteOverlay';
        ov.className = 'lc-overlay';
        ov.addEventListener('click', function (e) {
            if (e.target === ov) _closeLessonComplete();
        });
        document.body.appendChild(ov);
    }

    ov.innerHTML =
        '<div class="lc-card">'
      +   '<div class="lc-emoji">\uD83C\uDF89</div>'
      +   '<div class="lc-title">Dars tugadi!</div>'
      +   '<div class="lc-subtitle">Barcha so\u2018zlarni muvaffaqiyatli o\u2018rgandingiz</div>'
      +   '<div class="lc-encourage">Zo\u2018r! Davom eting!</div>'
      +   '<button class="lc-btn" onclick="_closeLessonComplete()">Davom etish \u2192</button>'
      + '</div>';

    ov.classList.add('active');
}

function _closeLessonComplete() {
    var el = document.getElementById('lessonCompleteOverlay');
    if (el) el.classList.remove('active');

    /* Trigger the page's own completion flow */
    if (typeof window.showCompletion === 'function') {
        window.showCompletion();
    } else if (typeof window.showCompletionScreen === 'function') {
        window.showCompletionScreen();
    }
}

/* ================================================================== */
/*  Log pronunciation result (fire-and-forget)                        */
/* ================================================================== */
function _logPronunciation(word, result) {
    if (_logPronunciation._disabled) return;

    try {
        fetch('/api/log-pronunciation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ..._getAuthHeaders() },
            body: JSON.stringify({
                word,
                accuracyScore:      result.accuracyScore,
                fluencyScore:       result.fluencyScore,
                completenessScore:  result.completenessScore,
                pronunciationScore: result.pronunciationScore,
                words:              result.words,
            }),
        }).then(function (response) {
            if (response && response.status === 404) {
                _logPronunciation._disabled = true;
            }
        }).catch(() => {});   // silent — logging must never break UX
    } catch { /* ignore */ }
}

/* ================================================================== */
/*  Gamification — DISABLED (functions kept as no-ops for safety)      */
/* ================================================================== */
const _GAMIFY_KEY = 'uzdarus_gamify';

function _loadGamify() { return { xp: 0, streak: 0, lastDate: null, todayXp: 0, todayDate: null }; }
function _saveGamify() { return; }
function _todayStr() { return new Date().toISOString().slice(0, 10); }
function _yesterdayStr() { var d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }
function _calcLevel() { return 0; }
function _xpInCurrentLevel() { return 0; }
function _xpForNextLevel() { return 100; }
function _levelProgress() { return 0; }
function _awardXP() { return { xpGained: 0, totalXp: 0, streak: 0, todayXp: 0, level: 0, prevLevel: 0, leveledUp: false, progress: 0 }; }
function _getStreak() { return 0; }
function _ensureStreakBadge() { return; }
function _updateStreakBadge() { return; }
function _showXpToast() { return; }
function _showLevelUpPopup() { return; }
function _closeLevelUp() { return; }

/* init voice selector + mic + progress on load */
if (typeof document !== 'undefined') {
    function _initUI() {
        _initVoiceSelector();
        _injectMicSelector();
        _initMicSelector();
        _injectWordProgressCSS();
        _scheduleDemoPronunciationLockSync();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _initUI);
    } else {
        _initUI();
    }

    /* ---- event delegation: works with dynamic DOM / re-renders ---- */
    document.addEventListener('click', function () {
        _scheduleDemoPronunciationLockSync();
    });

    document.addEventListener('click', function (e) {
        if (e.target.closest('#pronOverlay')) return;

        var pronBtn = e.target.closest('.pron-btn');
        if (pronBtn) {
            console.debug('[PRON] CLICK DETECTED (delegation)');
            e.stopPropagation();
            checkPronunciation(e);
            return;
        }

        var listenBtn = e.target.closest('.listen-btn');
        if (listenBtn) {
            e.stopPropagation();
            playAudio(e);
            return;
        }
    });
}

/* ---- word progress CSS (injected once) ---- */
function _injectWordProgressCSS() {
    if (document.getElementById('wordProgressCSS')) return;
    var s = document.createElement('style');
    s.id = 'wordProgressCSS';
    s.textContent = [
        /* word states */
        '[data-word-index]{position:relative;transition:all .3s ease}',
        '[data-word-index].word-locked{opacity:.3;pointer-events:none;filter:grayscale(.6)}',
        '[data-word-index].word-locked .pron-btn,[data-word-index].word-locked .listen-btn{pointer-events:auto!important;position:relative;z-index:2}',
        '[data-word-index].word-active{opacity:1;pointer-events:auto;border:2px solid #667eea!important;box-shadow:0 0 0 3px rgba(102,126,234,.15);background:#f8f9ff!important}',
        '[data-word-index].word-completed{opacity:1;pointer-events:auto;border-color:#58cc02!important;background:linear-gradient(135deg,#f4fce8,#e8f5e1)!important;color:#2d6a00}',
        '[data-word-index].word-completed::after{content:"\\2714";position:absolute;top:6px;right:8px;color:#58a700;font-size:.85rem;font-weight:900}',

        /* ---- flashcard success animation ---- */
        '@keyframes fcSuccess{0%{transform:scale(1);box-shadow:0 10px 40px rgba(0,0,0,.3)}40%{transform:scale(1.06);box-shadow:0 0 30px rgba(88,204,2,.5)}100%{transform:scale(1);box-shadow:0 10px 40px rgba(0,0,0,.3)}}',
        '.flashcard-success .flashcard-front,.flashcard-success .flashcard-back{animation:fcSuccess .7s ease;border:3px solid #58cc02!important}',
        '.flashcard-success{animation:fcSuccess .7s ease}',

        /* ---- flashcard error / shake animation ---- */
        '@keyframes fcShake{0%,100%{transform:translateX(0)}15%{transform:translateX(-8px)}30%{transform:translateX(8px)}45%{transform:translateX(-6px)}60%{transform:translateX(6px)}75%{transform:translateX(-3px)}90%{transform:translateX(3px)}}',
        '.flashcard-error .flashcard-front,.flashcard-error .flashcard-back{animation:fcShake .5s ease;border:3px solid #ff4b4b!important}',
        '.flashcard-error{animation:fcShake .5s ease}',

        /* ---- Speech SDK loading state (safe gate for the mic button) ----
           While the SDK is still loading/retrying, the mic trigger buttons
           are dimmed and show a "preparing" cursor so users get clear
           feedback instead of a silent failure. The button stays tappable —
           the recognition flow waits for the SDK and proceeds automatically
           once it is ready (no hard error). */
        'body.speech-sdk-loading .audio-button.pron-btn,body.speech-sdk-error .audio-button.pron-btn,body.speech-sdk-loading .mic-btn,body.speech-sdk-error .mic-btn{opacity:.55;cursor:progress}',
        'body.speech-sdk-loading .audio-button.pron-btn::after{content:"⏳";margin-left:4px;font-size:13px}',
        'body.speech-sdk-ready .audio-button.pron-btn,body.speech-sdk-ready .mic-btn{opacity:1}',

        /* ---- progress bar ---- */
        '.speech-progress-bar{flex:1;height:8px;background:rgba(255,255,255,.2);border-radius:4px;overflow:hidden;margin:0 16px;min-width:80px}',
        '.speech-progress-fill{height:100%;background:linear-gradient(90deg,#58cc02,#46a302);border-radius:4px;transition:width .4s ease;width:0}',

        /* ---- lesson complete overlay ---- */
        '.lc-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:10002;justify-content:center;align-items:center;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}',
        '.lc-overlay.active{display:flex}',
        '.lc-card{background:#fff;border-radius:28px;padding:44px 32px 32px;max-width:400px;width:90%;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.3);animation:lcPop .5s cubic-bezier(.175,.885,.32,1.275)}',
        '@keyframes lcPop{from{opacity:0;transform:scale(.7) translateY(60px)}to{opacity:1;transform:scale(1) translateY(0)}}',
        '.lc-emoji{font-size:4rem;margin-bottom:8px;animation:lcBounce .7s .2s both}',
        '@keyframes lcBounce{0%{transform:scale(0) rotate(-15deg)}50%{transform:scale(1.3) rotate(5deg)}100%{transform:scale(1) rotate(0)}}',
        '.lc-title{font-size:1.6rem;font-weight:900;color:#1a1a2e;margin-bottom:6px}',
        '.lc-subtitle{font-size:.9rem;color:#888;margin-bottom:20px}',
        '.lc-xp{display:inline-block;padding:10px 24px;border-radius:16px;font-size:1.1rem;font-weight:800;color:#fff;background:linear-gradient(135deg,#667eea,#764ba2);margin-bottom:12px;animation:lcXpIn .5s .4s both}',
        '@keyframes lcXpIn{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}',
        '.lc-streak{font-size:1rem;font-weight:800;color:#ff6b00;margin-bottom:8px;animation:lcXpIn .5s .5s both}',
        '.lc-encourage{font-size:.85rem;font-weight:600;color:#888;margin-bottom:20px;animation:lcXpIn .5s .6s both}',
        '.lc-btn{display:block;width:100%;padding:16px 0;border:none;border-radius:16px;font-size:1.05rem;font-weight:800;cursor:pointer;color:#fff;background:linear-gradient(135deg,#58cc02,#46a302);box-shadow:0 5px 0 #3a8a02;transition:transform .15s}',
        '.lc-btn:active{transform:translateY(3px);box-shadow:0 2px 0 #3a8a02}',

        /* ---- button polish ---- */
        '.audio-button,.control-btn,.pron-btn{transition:all .15s ease}',
        '.audio-button:active,.control-btn:active{transform:scale(.96)}',
        '.audio-button.pron-btn.locked,.mic-btn.locked{opacity:.6;pointer-events:auto;cursor:pointer;position:relative}',
        '.audio-button.pron-btn.locked::after,.mic-btn.locked::after{content:"🔒";margin-left:6px;font-size:14px}',

        /* ---- mic selector ---- */
        '.mic-selector-wrap{margin:8px auto 0;display:flex;flex-direction:column;align-items:stretch;justify-content:center;width:min(240px,calc(100% - 32px))}',
        '.mic-label{font-size:12px;color:#aaa;margin-bottom:6px;display:block}',
        '.mic-select{width:100%;background:#111;color:#fff;border-radius:12px;padding:10px 14px;border:1px solid #333;transition:all .2s ease}',
        '.mic-select:hover{border-color:#555}',
        '.mic-select:focus{outline:none;border-color:#888}',

        /* ---- voice switch buttons ---- */
        '.voice-switch{display:flex;justify-content:center;gap:8px;margin-bottom:10px}',
        '.voice-switch button{padding:8px 18px;border-radius:12px;border:2px solid #e0e0e0;background:#fff;font-size:.85rem;font-weight:700;cursor:pointer;transition:all .2s ease;color:#555;font-family:system-ui,-apple-system,sans-serif}',
        '.voice-switch button:hover{border-color:#667eea;color:#667eea;background:#f8f9ff}',
        '.voice-switch button.active{border-color:#667eea;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;box-shadow:0 3px 12px rgba(102,126,234,.3)}',
        '.voice-switch button:active{transform:scale(.95)}',
        '@media (max-width: 640px){.mic-selector-wrap{width:min(100%,calc(100% - 24px))}}',
    ].join('\n');
    document.head.appendChild(s);
}

function _showStreakReminder() { return; }
function _dismissStreakReminder() { return; }

/* ================================================================== */
/*  Pronunciation UI — Duolingo-style (auto-injected)                 */
/* ================================================================== */
const _PRON_OVERLAY_ID = 'pronOverlay';
let _lastPronRef = '';
let _isPronListening = false;
let _stopActivePron = null;

function _ensurePronOverlay() {
    if (document.getElementById(_PRON_OVERLAY_ID)) return;

    const style = document.createElement('style');
    style.textContent = [
        /* overlay + card */
        '.pron-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;justify-content:center;align-items:center;overflow-y:auto;padding:12px;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);overscroll-behavior:contain;-webkit-overflow-scrolling:touch;pointer-events:auto}',
        '.pron-overlay.active{display:flex}',
        '.pron-card{background:#fff;border-radius:16px;padding:32px 24px 24px;max-width:420px;width:100%;max-height:90vh;margin:auto;overflow-y:auto;overscroll-behavior:contain;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3);animation:pronPop .4s cubic-bezier(.175,.885,.32,1.275);position:relative;pointer-events:auto}',
        '@keyframes pronPop{from{opacity:0;transform:scale(.85) translateY(40px)}to{opacity:1;transform:scale(1) translateY(0)}}',

        /* emoji header */
        '.pron-emoji{font-size:3rem;margin-bottom:4px;animation:pronBounce .6s .3s both}',
        '@keyframes pronBounce{0%{transform:scale(0)}50%{transform:scale(1.3)}100%{transform:scale(1)}}',
        '.pron-title{font-size:1.35rem;font-weight:800;margin-bottom:4px}',
        '.pron-title.good{color:#58a700}',
        '.pron-title.ok{color:#ff9800}',
        '.pron-title.bad{color:#ea2b2b}',
        '.pron-subtitle{font-size:.85rem;color:#999;margin-bottom:20px}',

        /* overall score ring */
        '.pron-ring-wrap{position:relative;width:100px;height:100px;margin:0 auto 20px}',
        '.pron-ring-svg{width:100%;height:100%;transform:rotate(-90deg)}',
        '.pron-ring-bg{fill:none;stroke:#e8e8e8;stroke-width:8}',
        '.pron-ring-fg{fill:none;stroke-width:8;stroke-linecap:round;transition:stroke-dashoffset 1s ease .4s}',
        '.pron-ring-fg.good{stroke:#58cc02}',
        '.pron-ring-fg.ok{stroke:#ffc800}',
        '.pron-ring-fg.bad{stroke:#ff4b4b}',
        '.pron-ring-val{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.7rem;font-weight:900;color:#333}',

        /* progress bars */
        '.pron-bars{margin:0 0 18px}',
        '.pron-bar-row{display:flex;align-items:center;gap:10px;margin-bottom:10px}',
        '.pron-bar-label{width:80px;text-align:right;font-size:.8rem;font-weight:600;color:#777}',
        '.pron-bar-track{flex:1;height:12px;background:#eee;border-radius:6px;overflow:hidden}',
        '.pron-bar-fill{height:100%;border-radius:6px;width:0;transition:width 1s ease .5s}',
        '.pron-bar-fill.good{background:linear-gradient(90deg,#58cc02,#46a302)}',
        '.pron-bar-fill.ok{background:linear-gradient(90deg,#ffc800,#f5a623)}',
        '.pron-bar-fill.bad{background:linear-gradient(90deg,#ff4b4b,#ea2b2b)}',
        '.pron-bar-num{width:32px;font-size:.82rem;font-weight:800;text-align:left}',
        '.pron-bar-num.good{color:#58a700}',
        '.pron-bar-num.ok{color:#ff9800}',
        '.pron-bar-num.bad{color:#ea2b2b}',

        /* word chips */
        '.pron-words{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:0 0 18px;max-height:180px;overflow-y:auto;padding:4px 0}',
        '.pron-chip{padding:8px 14px;border-radius:12px;font-size:.92rem;font-weight:700;animation:pronChipIn .35s ease both;border:2px solid transparent}',
        '.pron-chip.good{background:#e8f5e1;color:#58a700;border-color:#c6e8b0}',
        '.pron-chip.ok{background:#fff8e1;color:#e6a100;border-color:#ffe082}',
        '.pron-chip.bad{background:#ffeaea;color:#ea2b2b;border-color:#ffb8b8;animation:pronChipIn .35s ease both,pronShake .4s .7s both}',
        '@keyframes pronChipIn{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}',
        '@keyframes pronShake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-4px)}40%,80%{transform:translateX(4px)}}',
        '.pron-chip-score{font-size:.7rem;opacity:.7;margin-left:4px}',

        /* verdict banner */
        /* word-stats summary line */
        '.pron-stats{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin:0 0 14px;font-size:.78rem;font-weight:700}',
        '.pron-stat-item{padding:4px 10px;border-radius:10px;background:#f5f5f5;color:#666}',
        '.pron-stat-item.good{background:#e8f5e1;color:#58a700}',
        '.pron-stat-item.ok{background:#fff8e1;color:#b7791f}',
        '.pron-stat-item.bad{background:#ffeaea;color:#ea2b2b}',

        /* smart actionable hint */
        '.pron-hint{margin:-4px 0 14px;padding:10px 14px;border-radius:12px;background:linear-gradient(135deg,#f0edff,#e8f0ff);color:#4f3d8a;font-size:.85rem;font-weight:600;line-height:1.4;text-align:left}',

        '.pron-verdict{font-size:.82rem;font-weight:600;padding:8px 16px;border-radius:10px;margin-bottom:16px;display:inline-block;white-space:pre-line;line-height:1.5}',
        '.pron-verdict.good{background:#e8f5e1;color:#58a700}',
        '.pron-verdict.ok{background:#fff4db;color:#b7791f}',
        '.pron-verdict.bad{background:#ffeaea;color:#ea2b2b}',

        /* feedback tips */
        '.pron-tips{text-align:left;margin:0 0 16px;padding:0}',
        '.pron-tip{background:#f8f9fa;border-radius:12px;padding:12px 14px;margin-bottom:8px;border-left:4px solid #ddd;animation:pronTipIn .3s ease both}',
        '.pron-tip.bad{border-left-color:#ff4b4b;background:#fff5f5}',
        '.pron-tip.ok{border-left-color:#ffc800;background:#fffdf0}',
        '.pron-tip.good{border-left-color:#58cc02;background:#f4fce8}',
        '@keyframes pronTipIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}',
        '.pron-tip-word{font-weight:800;font-size:.9rem;margin-bottom:3px}',
        '.pron-tip-word .score{font-weight:600;font-size:.75rem;opacity:.7;margin-left:6px}',
        '.pron-tip-text{font-size:.82rem;color:#555;line-height:1.45}',
        '.pron-tip-advice{font-size:.78rem;color:#888;margin-top:4px;font-style:italic}',

        /* XP reward row */
        '.pron-xp-row{display:flex;align-items:center;justify-content:center;gap:10px;margin:0 0 16px;padding:10px 16px;border-radius:14px;background:linear-gradient(135deg,#f0edff,#e8f0ff);animation:pronTipIn .4s ease .3s both}',
        '.pron-xp-amount{font-size:1.2rem;font-weight:900;color:#667eea}',
        '.pron-xp-label{font-size:.82rem;color:#888;font-weight:600}',
        '.pron-streak-row{font-size:.85rem;color:#ff6b00;font-weight:700}',

        /* buttons */
        '.pron-actions,.pron-btns{display:flex;gap:10px;justify-content:center;position:sticky;bottom:0;padding-top:14px;padding-bottom:max(0px,env(safe-area-inset-bottom));margin-top:14px;background:#fff}',
        '.pron-btn{flex:1;padding:14px 0;border:none;border-radius:14px;font-size:1rem;font-weight:700;cursor:pointer;transition:transform .15s,box-shadow .15s;touch-action:manipulation}',
        '.pron-btn:active{transform:scale(.96)}',
        '.pron-btn-retry{background:#ff9800;color:#fff;box-shadow:0 4px 0 #e08600}',
        '.pron-btn-retry:hover{background:#ffad33}',
        '.pron-btn-close{background:#e8e8e8;color:#666;box-shadow:0 4px 0 #d0d0d0}',
        '.pron-btn-close:hover{background:#f0f0f0}',

        /* listening state */
        '.pron-listening{display:flex;flex-direction:column;align-items:center;gap:12px;padding:30px 0}',
        '.pron-mic{font-size:3.5rem;animation:pronPulse 1.2s ease infinite}',
        '@keyframes pronPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.15);opacity:.7}}',
        '.pron-listening-text{font-size:1rem;color:#777;font-weight:600}',
        '.pron-listening-dots span{animation:pronDot 1.4s infinite}',
        '.pron-listening-dots span:nth-child(2){animation-delay:.2s}',
        '.pron-listening-dots span:nth-child(3){animation-delay:.4s}',
        '@keyframes pronDot{0%,80%,100%{opacity:.3}40%{opacity:1}}',
        /* preparation loader (3 pulsing dots) — shown during the
           Mikrofon-tayyorlanmoqda / aloqa-o‘rnatilmoqda phases and
           faded out by sessionStarted via #pronCard .pron-loader.
           Phase colors:
             - default (preparing)    → green   #58cc02
             - .is-connecting (5s+)   → orange  #ffc800
           Fade-out is opacity-only via .is-hiding so the dots melt
           away instead of snapping. */
        '.pron-loader{display:flex;justify-content:center;align-items:center;gap:8px;min-height:18px;margin:2px 0 4px;opacity:1;transition:opacity .35s ease}',
        '.pron-loader.is-hiding{opacity:0;pointer-events:none}',
        '.pron-loader span{width:9px;height:9px;border-radius:50%;background:#58cc02;opacity:.4;animation:pronLoaderPulse 1.2s ease-in-out infinite;will-change:transform,opacity;transition:background .25s ease}',
        '.pron-loader.is-connecting span{background:#ffc800}',
        '.pron-loader span:nth-child(2){animation-delay:.15s}',
        '.pron-loader span:nth-child(3){animation-delay:.3s}',
        '@keyframes pronLoaderPulse{0%,100%{transform:scale(.7);opacity:.35}50%{transform:scale(1);opacity:1}}',
        '@media (prefers-reduced-motion: reduce){.pron-loader span{animation-duration:2.4s}.pron-loader{transition:opacity .2s linear}}',
        /* word feedback highlights */
        '.wf-inline{margin-top:10px;font-size:18px;font-weight:600;line-height:1.6;text-align:center}',
        '.wf-word{padding:2px 6px;border-radius:6px;margin-right:4px;display:inline-block}',
        '.wf-correct{background:#22c55e22;color:#22c55e}',
        '.wf-ok{background:#f59e0b22;color:#f59e0b}',
        '.wf-wrong-pos{background:#f59e0b22;color:#f59e0b}',
        '.wf-bad{background:#ef444422;color:#ef4444}',
        '.wf-missing{background:#9ca3af22;color:#9ca3af}',
        '.wf-hint{margin-top:10px;font-size:14px;color:#facc15;font-weight:500;text-align:center}',
        /* result animations */
        '.anim-success{animation:wfPop .4s ease}',
        '.anim-almost{animation:wfPulse .5s ease}',
        '.anim-fail{animation:wfShake .4s ease}',
        '@keyframes wfPop{0%{transform:scale(.9)}100%{transform:scale(1)}}',
        '@keyframes wfPulse{0%{opacity:.6}100%{opacity:1}}',
        '@keyframes wfShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}',
        '@media (max-width: 640px){.pron-overlay{padding:12px}.pron-card{padding:20px 16px 16px;border-radius:16px;max-height:90vh}.pron-title{font-size:1.15rem}.pron-subtitle{margin-bottom:14px}.pron-ring-wrap{width:84px;height:84px;margin-bottom:16px}.pron-bar-row{gap:8px}.pron-bar-label{width:68px;font-size:.74rem}.pron-words{max-height:132px}.pron-actions,.pron-btns{flex-direction:column}.pron-btn{width:100%}.wf-inline{font-size:16px}}',
    ].join('\n');
    document.head.appendChild(style);

    var overlay = document.createElement('div');
    overlay.className = 'pron-overlay';
    overlay.id = _PRON_OVERLAY_ID;
    overlay.innerHTML = '<div class="pron-card" id="pronCard"></div>';
    overlay.addEventListener('click', function (e) {
        if (e.target !== overlay) return;
        if (_isPronListening) {
            if (typeof window.confirm === 'function' && !window.confirm(_t('confirmExit'))) {
                return;
            }
            try { if (typeof _stopActivePron === 'function') _stopActivePron(); } catch (err) { console.warn('[PRON] stop error', err); }
        }
        closePronResult();
    });
    document.body.appendChild(overlay);
}

/* ---- helpers ---- */
/* visual class — aligned with verdict tiers: ≥70 good, ≥40 ok, else bad */
function _sClass(v) {
    var n = Number(v) || 0;
    return n >= 70 ? 'good' : n >= 40 ? 'ok' : 'bad';
}

/* Single-line actionable hint: pick the most useful thing the user can
   fix next — missed words > extra words > word order > weakest word. */
function _buildSmartHint(r) {
    var fb = (r && r.wordFeedback) || [];
    var missing = fb.filter(function (f) { return f.status === 'missing'; });
    var extra = fb.filter(function (f) { return f.status === 'extra'; });
    var wrongPos = fb.filter(function (f) { return f.status === 'wrong_position'; });

    if (missing.length) {
        return _t('hintMissed') + ': ' + missing.map(function (f) { return '"' + f.word + '"'; }).join(', ');
    }
    if (extra.length) {
        return _t('hintExtra') + ': ' + extra.map(function (f) { return '"' + f.word + '"'; }).join(', ');
    }
    if (wrongPos.length) {
        return _t('hintOrder');
    }
    var weakest = ((r && r.words) || [])
        .filter(function (w) { return w && typeof w.accuracy === 'number' && w.accuracy < 60; })
        .sort(function (a, b) { return a.accuracy - b.accuracy; })[0];
    if (weakest) {
        return _t('hintWeak') + ' "' + weakest.word + '"';
    }
    return '';
}

function _ringCircum() { return 2 * Math.PI * 42; }

/* ---- listening state ---- */
function _showPronListening() {
    _ensurePronOverlay();
    /* Patch A: panel starts in "Mikrofon tayyorlanmoqda\u2026" until Azure's
       sessionStarted callback flips it to "Tinglayapman\u2026" \u2014 that is the
       only moment the audio pipeline is verified live. */
    document.getElementById('pronCard').innerHTML =
        '<div class="pron-listening">'
      + '  <div class="pron-mic">\uD83C\uDFA4</div>'
      + '  <div class="pron-listening-text" id="pronListeningText">Mikrofon tayyorlanmoqda<span class="pron-listening-dots"><span>.</span><span>.</span><span>.</span></span></div>'
      + '  <div class="pron-loader" aria-hidden="true"><span></span><span></span><span></span></div>'
      + '  <div id="pronListeningSub" style="font-size:.82rem;color:#aaa">Bir soniya kuting</div>'
      + '</div>';
    document.getElementById(_PRON_OVERLAY_ID).classList.add('active');
    _isPronListening = true;
}

/* ---- result screen ---- */
function _showPronResult(refText, r, attemptId) {
    if (!r) return;
    _ensurePronOverlay();
    _lastPronRef = refText;
    _isPronListening = false;

    attemptId = Number.isFinite(Number(attemptId)) ? Number(attemptId) : _activeAttemptId;
    var renderAttemptId = attemptId;
    var startTime = Number(_pronAttemptStartedAt) || Date.now();
    var MIN_DELAY = 600;
    var elapsed = Date.now() - startTime;

    function renderResult() {
        if (renderAttemptId !== _activeAttemptId) {
            console.warn('[PRON] stale delayed render ignored:', renderAttemptId, _activeAttemptId);
            return;
        }

        /* Single source of truth — the verdict set by the engine. */
        var finalScore = Number(r.finalScore) || 0;
        r.finalScore = finalScore;

        var verdict = r.verdict || _getCategory(finalScore);
        var ui = _PRON_CATEGORY[verdict] || _PRON_CATEGORY.empty;

        if (typeof window !== 'undefined' && window.SPEECH_DEBUG) {
            console.log('[GRADE] render:', { finalScore: finalScore, verdict: verdict,
                reason: r.reason, wordCounts: r.wordCounts });
        }

        var html = '';

        /* emoji + verdict text */
        html += '<div class="pron-emoji">' + ui.emoji + '</div>';
        html += '<div class="pron-title ' + ui.verdictClass + '">' + ui.text + '</div>';
        html += '<div class="pron-subtitle">«' + _escHtml(refText) + '»</div>';

        /* word-level highlight — deterministic GREEN/YELLOW/RED states,
           identical every time for the same speech input. */
        var states = r.wordStates || [];
        if (states.length > 0) {
            html += '<div class="wf-inline">' + _buildWordStateHighlight(states) + '</div>';
        }

        /* one-line, deterministic hint derived from the word states */
        var hint = _buildVerdictHint(r);
        if (hint) {
            html += '<div class="wf-hint">' + _escHtml(hint) + '</div>';
        }

        /* short advice — one line, verdict-driven */
        if (ui.advice) {
            html += '<div class="pron-verdict ' + ui.verdictClass + '">' + ui.advice + '</div>';
        }

        /* buttons */
        html += '<div class="pron-actions pron-btns">'
              + '<button class="pron-btn pron-btn-retry" onclick="_retryPron()">🔁 Qayta aytish</button>'
              + '<button class="pron-btn pron-btn-close" onclick="closePronResult()">Yopish</button>'
              + '</div>';

        document.getElementById('pronCard').innerHTML = html;

        var pronCard = document.getElementById('pronCard');
        pronCard.classList.remove('anim-success', 'anim-almost', 'anim-fail');
        pronCard.classList.add(ui.animClass);
    }

    clearTimeout(_pronResultDelayTimer);
    _pronResultDelayTimer = 0;
    if (elapsed < MIN_DELAY) {
        _pronResultDelayTimer = setTimeout(function () {
            _pronResultDelayTimer = 0;
            if (attemptId !== _activeAttemptId) return;
            renderResult();
        }, MIN_DELAY - elapsed);
        return;
    }

    renderResult();
}

/* ---- animated counter ---- */
function _animateCounter(id, from, to, duration) {
    var el = document.getElementById(id);
    if (!el) return;
    var start = null;
    function step(ts) {
        if (!start) start = ts;
        var p = Math.min((ts - start) / duration, 1);
        el.textContent = String(Math.round(from + (to - from) * p));
        if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

/* ---- retry button ---- */
function _retryPron() {
    var retry = _lastPronRetryAction;
    window._pendingNext = null;
    closePronResult({ skipPendingAdvance: true });
    if (typeof retry === 'function') {
        setTimeout(function () {
            retry();
        }, 0);
    }
}

/* ---- close ---- */
function closePronResult(options) {
    _pronClosed = false;
    _isPronListening = false;
    clearTimeout(_pronResultDelayTimer);
    _pronResultDelayTimer = 0;
    var el = document.getElementById(_PRON_OVERLAY_ID);
    if (el) el.classList.remove('active');

    if (options && options.skipPendingAdvance) {
        window._pendingNext = null;
        return;
    }

    if (window._pendingNext) {
        const fn = window._pendingNext;
        window._pendingNext = null;
        fn();
    }
}

/* ================================================================== */
/*  Paywall popup                                                     */
/* ================================================================== */
const _PAYWALL_ID = 'paywallOverlay';

function _ensurePaywallStyles() {
    if (document.getElementById('paywallCSS')) return;
    var s = document.createElement('style');
    s.id = 'paywallCSS';
    s.textContent = [
        '.pw-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10000;justify-content:center;align-items:center;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}',
        '.pw-overlay.active{display:flex}',
        '.pw-card{background:#fff;border-radius:28px;padding:44px 30px 34px;max-width:400px;width:90%;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.35);animation:pwPop .45s cubic-bezier(.175,.885,.32,1.275);position:relative;overflow:hidden}',
        '@keyframes pwPop{from{opacity:0;transform:scale(.8) translateY(50px)}to{opacity:1;transform:scale(1) translateY(0)}}',
        /* discount ribbon */
        '.pw-ribbon{position:absolute;top:18px;right:-35px;background:linear-gradient(135deg,#ff6b6b,#ee5a24);color:#fff;font-size:.72rem;font-weight:800;padding:6px 40px;transform:rotate(45deg);box-shadow:0 2px 8px rgba(238,90,36,.4);letter-spacing:.5px;text-transform:uppercase}',
        /* header area */
        '.pw-emoji-row{font-size:2.8rem;margin-bottom:6px;animation:pwBounce .7s .25s both}',
        '@keyframes pwBounce{0%{transform:scale(0) rotate(-20deg)}60%{transform:scale(1.2) rotate(5deg)}100%{transform:scale(1) rotate(0)}}',
        '.pw-title{font-size:1.25rem;font-weight:900;color:#1a1a2e;margin-bottom:6px;line-height:1.35}',
        '.pw-subtitle{font-size:.85rem;color:#888;margin-bottom:20px}',
        /* features */
        '.pw-features{text-align:left;margin:0 auto 22px;padding:0;list-style:none;max-width:300px}',
        '.pw-features li{padding:9px 0;font-size:.9rem;color:#333;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f5f5f5}',
        '.pw-features li:last-child{border-bottom:none}',
        '.pw-features li .pw-feat-icon{font-size:1.15rem;flex-shrink:0;width:26px;text-align:center}',
        '.pw-features li .pw-feat-text{font-weight:600}',
        /* pricing */
        '.pw-pricing{margin:0 0 22px;padding:18px 0;background:linear-gradient(135deg,#f8f9ff,#f0f0ff);border-radius:16px}',
        '.pw-price-old{font-size:.9rem;color:#aaa;text-decoration:line-through;margin-bottom:2px}',
        '.pw-price-row{display:flex;align-items:baseline;justify-content:center;gap:6px}',
        '.pw-price-new{font-size:2.2rem;font-weight:900;background:linear-gradient(135deg,#667eea,#764ba2);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1.1}',
        '.pw-price-period{font-size:.82rem;color:#888;font-weight:600}',
        '.pw-price-save{display:inline-block;margin-top:6px;font-size:.75rem;font-weight:700;color:#fff;background:linear-gradient(135deg,#ff6b6b,#ee5a24);padding:3px 12px;border-radius:20px}',
        /* CTA */
        '.pw-btn-primary{display:block;width:100%;padding:17px 0;border:none;border-radius:16px;font-size:1.08rem;font-weight:800;cursor:pointer;color:#fff;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);box-shadow:0 6px 0 #5a3d8a,0 8px 24px rgba(102,126,234,.35);transition:transform .15s,box-shadow .15s;letter-spacing:.3px;position:relative;overflow:hidden}',
        '.pw-btn-primary::after{content:"";position:absolute;top:0;left:-75%;width:50%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.25),transparent);transform:skewX(-25deg);animation:pwShine 3s infinite}',
        '@keyframes pwShine{0%{left:-75%}20%{left:125%}100%{left:125%}}',
        '.pw-btn-primary:hover{transform:translateY(-1px);box-shadow:0 7px 0 #5a3d8a,0 10px 30px rgba(102,126,234,.45)}',
        '.pw-btn-primary:active{transform:translateY(3px);box-shadow:0 3px 0 #5a3d8a,0 4px 12px rgba(102,126,234,.25)}',
        '.pw-btn-sub{font-size:.78rem;color:#aaa;margin-top:8px}',
        /* trust */
        '.pw-trust{display:flex;justify-content:center;gap:16px;margin-top:18px;padding-top:14px;border-top:1px solid #f0f0f0}',
        '.pw-trust span{font-size:.72rem;color:#999;display:flex;align-items:center;gap:4px}',
        '.pw-trust .pw-trust-icon{font-size:.85rem}',
        /* dismiss */
        '.pw-dismiss{display:inline-block;margin-top:14px;font-size:.8rem;color:#bbb;cursor:pointer;border:none;background:none;padding:4px 12px;transition:color .2s}',
        '.pw-dismiss:hover{color:#888}',
    ].join('\n');
    document.head.appendChild(s);
}

function _showPaywall(tier) {
    /* Access-control guard: the Premium upsell popup must appear ONLY for
       users without an active subscription (demo / anonymous). An active
       paid user (START / TURBO / PREMIUM) can only reach here by exhausting
       their daily quota — for them we show a neutral "come back tomorrow"
       toast instead of a "buy Premium" popup they have no reason to see.
       Staff (admin/developer) never hit a limit server-side, so never reach
       this at all. */
    if (tier === 'paid') {
        showStatus("📅 Bugungi limit tugadi.\nErtaga davom ettiring.");
        setTimeout(function () { showStatus(''); }, 4000);
        return;
    }

    _ensurePaywallStyles();

    var overlay = document.getElementById(_PAYWALL_ID);
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'pw-overlay';
        overlay.id = _PAYWALL_ID;
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) _closePaywall();
        });
        document.body.appendChild(overlay);
    }

    overlay.innerHTML =
        '<div class="pw-card">'
      +   '<div class="pw-ribbon">-50%</div>'
      +   '<div class="pw-emoji-row">\uD83C\uDF93</div>'
      +   '<div class="pw-title">Rus tilida erkin gaplashishni<br>xohlaysizmi?</div>'
      +   '<div class="pw-subtitle">1000+ talaba allaqachon natijaga erishdi</div>'
      +   '<ul class="pw-features">'
      +     '<li><span class="pw-feat-icon">\uD83C\uDFA4</span><span class="pw-feat-text">Cheksiz talaffuz tekshiruvi</span></li>'
      +     '<li><span class="pw-feat-icon">\uD83D\uDD0A</span><span class="pw-feat-text">Professional ovozlar</span></li>'
      +     '<li><span class="pw-feat-icon">\uD83D\uDCC8</span><span class="pw-feat-text">Tez o\u2018sish tizimi (XP + level)</span></li>'
      +     '<li><span class="pw-feat-icon">\uD83E\uDDE0</span><span class="pw-feat-text">Xatolarni tahlil qilish</span></li>'
      +   '</ul>'
      +   '<div class="pw-pricing">'
      +     '<div class="pw-price-old">199 000 so\u2018m/oy</div>'
      +     '<div class="pw-price-row">'
      +       '<span class="pw-price-new">99 000</span>'
      +       '<span class="pw-price-period">so\u2018m/oy</span>'
      +     '</div>'
      +     '<span class="pw-price-save">Bugun 50% chegirma \u{1F525}</span>'
      +   '</div>'
      +   '<button class="pw-btn-primary" onclick="_goToPremium()">Premium olish \u{2192}</button>'
      +   '<div class="pw-btn-sub">Istalgan vaqtda bekor qilish mumkin</div>'
      +   '<div class="pw-trust">'
      +     '<span><span class="pw-trust-icon">\uD83D\uDD12</span>Xavfsiz to\u2018lov</span>'
      +     '<span><span class="pw-trust-icon">\u2705</span>30 kun kafolat</span>'
      +   '</div>'
      +   '<button class="pw-dismiss" onclick="_closePaywall()">Keyinroq</button>'
      + '</div>';

    overlay.classList.add('active');
}

function _closePaywall() {
    var el = document.getElementById(_PAYWALL_ID);
    if (el) el.classList.remove('active');
}

function _goToPremium() {
    var btn = document.querySelector('.pw-btn-primary');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Yuklanmoqda\u2026';
    }

    var headers = _getAuthHeaders();
    headers['Content-Type'] = 'application/json';

    fetch('/api/checkout', { method: 'POST', headers: headers })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.ok && data.paymentUrl) {
                window.location.href = data.paymentUrl;
            } else {
                /* not logged in or error — fall back to dashboard */
                window.location.href = '/my.cabinet/dashboard.html';
            }
        })
        .catch(function () {
            window.location.href = '/my.cabinet/dashboard.html';
        });
}

/* ================================================================== */
/*  Pronunciation Feedback Generator                                  */
/* ================================================================== */

/**
 * Generates personalized pronunciation tips in Uzbek.
 *
 * @param {{ accuracyScore:number, fluencyScore:number, completenessScore:number,
 *           pronunciationScore:number, words:{word:string,accuracy:number}[] }} result
 * @returns {{ word?:string, score?:number, level:string, message:string, advice?:string }[]}
 */
function generatePronunciationFeedback(result) {
    var tips = [];
    /* prefer the UI-visible finalScore; fall back to internal score */
    var __overall = Number(result.finalScore != null ? result.finalScore : result.pronunciationScore) || 0;

    /* at high scores show only encouragement, hide warnings */
    if (__overall >= 80) {
        if (__overall >= 85) {
            tips.push({
                level: 'good',
                message: 'Ajoyib! Talaffuzingiz juda yaxshi. Shunday davom eting!',
            });
        }
        return tips;
    }

    /* ---- per-word tips (only for problem words, max 3) ---- */
    var weak = (result.words || [])
        .filter(function (w) { return w.accuracy < 85; })
        .sort(function (a, b) { return a.accuracy - b.accuracy; })
        .slice(0, 3);

    for (var i = 0; i < weak.length; i++) {
        var w = weak[i];
        var level = w.accuracy < 70 ? 'bad' : 'ok';

        var msg, advice;

        if (w.accuracy < 40) {
            msg  = '\u00AB' + w.word + '\u00BB so\u2018zi aniqlanmadi yoki noto\u2018g\u2018ri aytildi.';
            advice = 'Avval so\u2018zni sekin, bo\u2018g\u2018inlab ayting: har bir tovushga e\u2018tibor bering.';
        } else if (w.accuracy < 70) {
            msg  = '\u00AB' + w.word + '\u00BB so\u2018zida ba\u2018zi tovushlar noto\u2018g\u2018ri eshitildi.';
            advice = 'So\u2018zni eshiting (Tinglash tugmasi), keyin xuddi shunday takrorlang.';
        } else {
            msg  = '\u00AB' + w.word + '\u00BB yaxshi, lekin biroz aniqroq talaffuz qiling.';
            advice = 'Urg\u2018uga e\u2018tibor bering — rus tilida urg\u2018u juda muhim.';
        }

        tips.push({ word: w.word, score: w.accuracy, level: level, message: msg, advice: advice });
    }

    /* fluency tip \u2014 based on the UI-visible Ravonlik metric */
    var ravonlik = result.ravonlik;
    if (ravonlik !== null && ravonlik !== undefined && ravonlik < 60) {
        tips.push({
            level: 'bad',
            message: 'Ravonlik past. So\u2018zlar orasida ko\u2018p pauza bor.',
            advice: 'Gapni to\u2018xtovsiz, bir nafasda aytishga harakat qiling.',
        });
    } else if (ravonlik !== null && ravonlik !== undefined && ravonlik < 80) {
        tips.push({
            level: 'ok',
            message: 'Ravonlik o\u2018rtacha. Bir oz tezroq va silliqroq ayting.',
            advice: 'So\u2018zlarni bir-biriga bog\u2018lang, pauza kamroq bo\u2018lsin.',
        });
    }

    /* completeness tip \u2014 based on the UI-visible To\u2018liqlik metric */
    var toliqlik = result.toliqlik;
    if (toliqlik !== null && toliqlik !== undefined && toliqlik < 70) {
        tips.push({
            level: 'bad',
            message: 'Ba\u2018zi so\u2018zlar tushib qoldi. Barcha so\u2018zlarni ayting.',
            advice: 'Matnni oldin o\u2018qib chiqing, keyin mikrofonga to\u2018liq ayting.',
        });
    }

    return tips;
}

/* ================================================================== */
/*  "Keyingi" (next word) lock + warning toast                        */
/* ================================================================== */

/** Inject CSS for the locked next-button state and the warning toast. */
function _ensureNextLockStyles() {
    if (document.getElementById('nextLockCSS')) return;
    var s = document.createElement('style');
    s.id = 'nextLockCSS';
    s.textContent = [
        /* locked "Keyingi" button — grey, low opacity, no hover glow */
        '.control-btn.next-locked,.control-btn.primary.next-locked{',
        'background:#c9ccd6 !important;background-image:none !important;',
        'color:#71757f !important;box-shadow:none !important;',
        'cursor:not-allowed !important;opacity:.55 !important;',
        'filter:grayscale(1) !important;transform:none !important;}',
        '.control-btn.next-locked:hover,.control-btn.primary.next-locked:hover{',
        'background:#c9ccd6 !important;background-image:none !important;',
        'box-shadow:none !important;transform:none !important;}',
        /* floating, non-blocking warning toast */
        '._next-warn-toast{position:fixed;left:50%;bottom:24px;',
        'transform:translateX(-50%) translateY(18px);z-index:10000;',
        'max-width:90vw;box-sizing:border-box;padding:13px 20px;border-radius:14px;',
        'background:rgba(28,30,38,.97);color:#fff;font-size:.93rem;font-weight:600;',
        'font-family:system-ui,-apple-system,sans-serif;line-height:1.3;',
        'box-shadow:0 8px 30px rgba(0,0,0,.34);display:flex;align-items:center;',
        'gap:9px;pointer-events:none;opacity:0;',
        'transition:opacity .3s ease,transform .3s ease;}',
        '._next-warn-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}',
        '._next-warn-toast::before{content:"\\26A0\\FE0F";font-size:1.05rem;flex:0 0 auto;}',
        '@media(max-width:480px){._next-warn-toast{bottom:16px;font-size:.86rem;',
        'padding:11px 15px;left:8px;right:8px;max-width:none;transform:translateY(18px);}',
        '._next-warn-toast.show{transform:translateY(0);}}',
        /* lightweight "processing" pill shown while waiting for the score */
        '._pron-processing{position:fixed;left:50%;bottom:90px;',
        'transform:translateX(-50%) translateY(10px);z-index:9999;',
        'display:flex;align-items:center;gap:10px;padding:11px 18px;border-radius:30px;',
        'background:rgba(28,30,38,.97);color:#fff;',
        'font:600 .9rem system-ui,-apple-system,sans-serif;',
        'box-shadow:0 6px 24px rgba(0,0,0,.3);opacity:0;pointer-events:none;',
        'transition:opacity .25s ease,transform .25s ease;}',
        '._pron-processing.show{opacity:1;transform:translateX(-50%) translateY(0);}',
        '._pron-processing-dots{display:inline-flex;gap:4px;}',
        '._pron-processing-dots i{width:6px;height:6px;border-radius:50%;',
        'background:#7c9cff;display:block;animation:_pronDot 1s infinite ease-in-out;}',
        '._pron-processing-dots i:nth-child(2){animation-delay:.15s;}',
        '._pron-processing-dots i:nth-child(3){animation-delay:.3s;}',
        '@keyframes _pronDot{0%,60%,100%{transform:scale(.6);opacity:.4;}',
        '30%{transform:scale(1);opacity:1;}}',
        '@media(max-width:480px){._pron-processing{bottom:78px;font-size:.84rem;padding:10px 15px;}}'
    ].join('');
    document.head.appendChild(s);
}

/** True when the word AFTER the current card is still locked
    (i.e. the current word has not been passed yet). */
function _isNextWordLocked() {
    var w = (typeof window.getCurrentWord === 'function') ? window.getCurrentWord() : null;
    if (!w || w.topicId == null) return false;
    var idx = (typeof w.wordIndex === 'number') ? w.wordIndex
            : (typeof window.currentWordIndex === 'number') ? window.currentWordIndex : -1;
    if (idx < 0) return false;
    return _isWordLocked(w.topicId, idx + 1);
}

/** Grey-out / re-enable the "Keyingi" button to match the lock state. */
function _refreshNextLock() {
    var btn = document.getElementById('nextWordBtn');
    if (!btn) return;
    var locked = _isNextWordLocked();
    btn.classList.toggle('next-locked', locked);
    btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
}

var _nextWarnTimer = null;
/** Floating, non-blocking toast shown when a locked "Keyingi" is clicked.
    Smooth fade in/out, auto-hides after ~7s. */
function _showNextWarning() {
    _ensureNextLockStyles();
    var t = document.getElementById('_nextWarnToast');
    if (!t) {
        t = document.createElement('div');
        t.id = '_nextWarnToast';
        t.className = '_next-warn-toast';
        document.body.appendChild(t);
    }
    t.textContent = 'Avval so‘zni to‘g‘ri ayting';
    void t.offsetWidth;            /* reflow so the fade-in always replays */
    t.classList.add('show');
    if (_nextWarnTimer) clearTimeout(_nextWarnTimer);
    _nextWarnTimer = setTimeout(function () {
        t.classList.remove('show');
    }, 7000);
}

/* ---- Speech "processing" loader ----
   Small, non-blocking pill shown ~2s after the user stops speaking, while
   we wait for Azure to return the pronunciation score. Removes the
   "spoke, then nothing for 3-5s" dead air. Hidden the moment a result
   (or error) resolves. */
function _showProcessingLoader() {
    _ensureNextLockStyles();
    var l = document.getElementById('_pronProcessing');
    if (!l) {
        l = document.createElement('div');
        l.id = '_pronProcessing';
        l.className = '_pron-processing';
        l.innerHTML = '<span class="_pron-processing-dots"><i></i><i></i><i></i></span>'
                    + '<span>Tekshirilmoqda...</span>';
        document.body.appendChild(l);
    }
    void l.offsetWidth;            /* reflow so the fade-in always replays */
    l.classList.add('show');
}

function _hideProcessingLoader() {
    var l = document.getElementById('_pronProcessing');
    if (l) l.classList.remove('show');
}

/* One-time wiring: inject styles + delegate clicks for the next button. */
(function _initNextLock() {
    function setup() {
        _ensureNextLockStyles();
        document.addEventListener('click', function (e) {
            var tgt = e.target;
            if (!tgt || !tgt.closest) return;
            /* clicked a locked "Keyingi" → show the floating warning */
            if (tgt.closest('#nextWordBtn') && _isNextWordLocked()) {
                _showNextWarning();
            }
            /* any flashcard nav click may change the active card */
            if (tgt.closest('.control-btn')) {
                setTimeout(_refreshNextLock, 0);
            }
        }, true);
        _refreshNextLock();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();

/* ================================================================== */
/*  Global exports — make functions accessible from onclick handlers  */
/* ================================================================== */
window.checkPronunciation = checkPronunciation;
window.refreshNextLock = _refreshNextLock;
window.playAudio = playAudio;
window.showStatus = showStatus;
window.initWordProgress = initWordProgress;
window.updateProgressBar = updateProgressBar;
window.getNextActiveWordIndex = getNextActiveWordIndex;
window.isWordCompleted = isWordCompleted;

/* ================================================================== */
/*  Practice Weak Words mode                                          */
/* ================================================================== */
var _weakWords = [];
var _weakIdx = 0;
var _savedGetCurrentWord = null;

function _ensureWeakWordsStyles() {
    if (document.getElementById('weakWordsCSS')) return;
    var s = document.createElement('style');
    s.id = 'weakWordsCSS';
    s.textContent = [
        '.ww-overlay{position:fixed;inset:0;z-index:9800;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;flex-direction:column;align-items:center;overflow-y:auto;-webkit-overflow-scrolling:touch;animation:wwFadeIn .35s ease}',
        '@keyframes wwFadeIn{from{opacity:0}to{opacity:1}}',
        '.ww-header{width:100%;max-width:480px;padding:20px 20px 0;display:flex;align-items:center;justify-content:space-between}',
        '.ww-header-title{color:#fff;font-size:1.1rem;font-weight:800;font-family:system-ui,-apple-system,sans-serif}',
        '.ww-header-close{background:rgba(255,255,255,.2);border:none;color:#fff;font-size:1.2rem;width:36px;height:36px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s}',
        '.ww-header-close:hover{background:rgba(255,255,255,.35)}',
        '.ww-progress{width:100%;max-width:480px;padding:12px 20px 0}',
        '.ww-progress-bar{height:5px;background:rgba(255,255,255,.2);border-radius:3px;overflow:hidden}',
        '.ww-progress-fill{height:100%;background:#fff;border-radius:3px;transition:width .4s ease}',
        '.ww-counter{color:rgba(255,255,255,.7);font-size:.78rem;margin-top:6px;text-align:center;font-family:system-ui,-apple-system,sans-serif}',
        /* card */
        '.ww-card-wrap{flex:1;display:flex;align-items:center;justify-content:center;padding:20px;width:100%;max-width:480px;box-sizing:border-box}',
        '.ww-card{background:#fff;border-radius:28px;padding:40px 28px 32px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.2);animation:wwCardIn .4s cubic-bezier(.175,.885,.32,1.275)}',
        '@keyframes wwCardIn{from{opacity:0;transform:scale(.85) translateY(30px)}to{opacity:1;transform:scale(1) translateY(0)}}',
        '.ww-accuracy-badge{display:inline-block;padding:5px 14px;border-radius:20px;font-size:.78rem;font-weight:700;margin-bottom:12px}',
        '.ww-accuracy-badge.bad{background:#ffebee;color:#c62828}',
        '.ww-accuracy-badge.ok{background:#fff3e0;color:#e65100}',
        '.ww-word{font-size:2rem;font-weight:900;color:#1a1a2e;margin-bottom:6px;line-height:1.2}',
        '.ww-attempts{font-size:.8rem;color:#aaa;margin-bottom:28px}',
        /* buttons */
        '.ww-actions{display:flex;gap:14px;justify-content:center;margin-bottom:20px}',
        '.ww-btn{flex:1;max-width:160px;padding:16px 0;border:none;border-radius:16px;font-size:.95rem;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:transform .15s,box-shadow .15s;font-family:system-ui,-apple-system,sans-serif}',
        '.ww-btn:active{transform:translateY(2px)}',
        '.ww-btn-listen{color:#667eea;background:#f0f0ff;box-shadow:0 4px 0 #d0d0f0}',
        '.ww-btn-listen:active{box-shadow:0 2px 0 #d0d0f0}',
        '.ww-btn-speak{color:#fff;background:linear-gradient(135deg,#667eea,#764ba2);box-shadow:0 4px 0 #5a3d8a}',
        '.ww-btn-speak:active{box-shadow:0 2px 0 #5a3d8a}',
        '.ww-btn:disabled{opacity:.5;cursor:not-allowed}',
        /* nav */
        '.ww-nav{display:flex;gap:12px;justify-content:center}',
        '.ww-nav-btn{padding:10px 28px;border:2px solid #e8e8e8;border-radius:14px;background:#fafafa;font-size:.85rem;font-weight:700;color:#555;cursor:pointer;transition:all .2s}',
        '.ww-nav-btn:hover{background:#f0f0f0;border-color:#ccc}',
        '.ww-nav-btn:disabled{opacity:.3;cursor:not-allowed}',
        /* empty state */
        '.ww-empty{color:#fff;text-align:center;padding:60px 20px;font-family:system-ui,-apple-system,sans-serif}',
        '.ww-empty-icon{font-size:4rem;margin-bottom:12px}',
        '.ww-empty-title{font-size:1.3rem;font-weight:800;margin-bottom:8px}',
        '.ww-empty-text{font-size:.92rem;opacity:.8;margin-bottom:24px;line-height:1.5}',
        '.ww-empty-btn{display:inline-block;padding:14px 36px;border:none;border-radius:16px;font-size:1rem;font-weight:800;color:#667eea;background:#fff;box-shadow:0 4px 0 #d0d0f0;cursor:pointer}',
    ].join('\n');
    document.head.appendChild(s);
}

/**
 * Open the weak-words practice mode.
 * Call from any page: openWeakWordsPractice()
 */
function openWeakWordsPractice() {
    _ensureWeakWordsStyles();

    /* show loading overlay immediately */
    var ov = document.getElementById('wwOverlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'wwOverlay';
        ov.className = 'ww-overlay';
        document.body.appendChild(ov);
    }
    ov.innerHTML =
        '<div class="ww-empty">'
      +   '<div class="ww-empty-icon">\u23F3</div>'
      +   '<div class="ww-empty-title">Yuklanmoqda\u2026</div>'
      + '</div>';
    ov.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    /* fetch weak words */
    var headers = _getAuthHeaders();
    headers['Content-Type'] = 'application/json';

    fetch('/api/weak-words', { method: 'GET', headers: headers })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.ok || !data.words || data.words.length === 0) {
                _renderWeakEmpty(ov);
                return;
            }
            _weakWords = data.words;
            _weakIdx = 0;
            _renderWeakCard(ov);
        })
        .catch(function (err) {
            console.error('weak-words fetch error:', err);
            _renderWeakEmpty(ov);
        });
}

function _renderWeakEmpty(ov) {
    ov.innerHTML =
        '<div class="ww-empty">'
      +   '<div class="ww-empty-icon">\uD83C\uDF89</div>'
      +   '<div class="ww-empty-title">Hammasi ajoyib!</div>'
      +   '<div class="ww-empty-text">Sizda muammoli so\u2018zlar yo\u2018q.<br>Mashq qilishda davom eting!</div>'
      +   '<button class="ww-empty-btn" onclick="_closeWeakWords()">Yopish</button>'
      + '</div>';
}

function _renderWeakCard(ov) {
    var w = _weakWords[_weakIdx];
    var total = _weakWords.length;
    var pct = Math.round(((_weakIdx + 1) / total) * 100);
    var badgeClass = w.avgAccuracy < 50 ? 'bad' : 'ok';

    var html = '';

    /* header */
    html += '<div class="ww-header">';
    html += '<span class="ww-header-title">\uD83C\uDFAF Muammoli so\u2018zlar</span>';
    html += '<button class="ww-header-close" onclick="_closeWeakWords()">\u00D7</button>';
    html += '</div>';

    /* progress */
    html += '<div class="ww-progress">';
    html += '<div class="ww-progress-bar"><div class="ww-progress-fill" style="width:' + pct + '%"></div></div>';
    html += '<div class="ww-counter">' + (_weakIdx + 1) + ' / ' + total + '</div>';
    html += '</div>';

    /* card */
    html += '<div class="ww-card-wrap"><div class="ww-card">';
    html += '<div class="ww-accuracy-badge ' + badgeClass + '">\uD83C\uDFAF ' + w.avgAccuracy + '%</div>';
    html += '<div class="ww-word">' + _escHtml(w.word) + '</div>';
    html += '<div class="ww-attempts">' + w.attempts + ' urinish</div>';

    /* action buttons */
    html += '<div class="ww-actions">';
    html += '<button class="ww-btn ww-btn-listen" onclick="_wwListen(this)">';
    html += '\uD83D\uDD0A Tinglash</button>';
    html += '<button class="ww-btn ww-btn-speak" onclick="_wwSpeak(this)">';
    html += '\uD83C\uDFA4 Takrorlash</button>';
    html += '</div>';

    /* nav */
    html += '<div class="ww-nav">';
    html += '<button class="ww-nav-btn" onclick="_wwPrev()"' + (_weakIdx === 0 ? ' disabled' : '') + '>\u2190 Oldingi</button>';
    html += '<button class="ww-nav-btn" onclick="_wwNext()"' + (_weakIdx >= total - 1 ? ' disabled' : '') + '>Keyingi \u2192</button>';
    html += '</div>';

    html += '</div></div>'; // close card + wrap

    ov.innerHTML = html;

    /* override getCurrentWord so playAudio/checkPronunciation work */
    if (!_savedGetCurrentWord) {
        _savedGetCurrentWord = window.getCurrentWord || null;
    }
    window.getCurrentWord = function () {
        var cw = _weakWords[_weakIdx];
        return cw ? { ru: String(cw.word || '').trim(), uz: '', topicId: null, wordIndex: _weakIdx } : null;
    };
}

function _escHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function _wwListen(btn) {
    btn.disabled = true;
    var word = _weakWords[_weakIdx].word;
    _playTTS(word, null)
        .catch(function (err) {
            console.error('TTS error:', err);
            if (err.limitExceeded) _showPaywall(err.tier);
        })
        .finally(function () { btn.disabled = false; });
}

function _wwSpeak(btn) {
    if (_isRecording || _pronBusy) return;
    btn.disabled = true;
    _isRecording = true;
    _pronBusy = true;

    const attemptId = ++_activeAttemptId;
    _pronAttemptStartedAt = Date.now();
    clearTimeout(_pronResultDelayTimer);
    _pronResultDelayTimer = 0;
    _lastPronRetryAction = function () {
        var speakBtn = document.querySelector('.ww-btn-speak');
        if (speakBtn) _wwSpeak(speakBtn);
    };
    window._pendingNext = null;

    var word = _weakWords[_weakIdx].word;

    /* Patch A: see checkPronunciation \u2014 wait for sessionStarted before
       cueing the user to speak. */
    showStatus('\uD83C\uDFA4 Mikrofon tayyorlanmoqda...');

    _runPronunciationAssessment(word)
        .then(function (result) {
            if (attemptId !== _activeAttemptId) {
                console.warn('[PRON] stale weak-word result ignored:', attemptId, _activeAttemptId);
                return;
            }

            showStatus('\u23F3 Tekshirilmoqda...');
            if (!result || (Number(result.finalScore) || 0) < 50) {
                showStatus('');
                alert('Talaffuz aniqlanmadi. Qayta urinib ko\'ring.');
                return;
            }
            showStatus('');
            _showPronResult(word, result, attemptId);
            _logPronunciation(word, result);
        })
        .catch(function (err) {
            if (attemptId !== _activeAttemptId) {
                console.warn('[PRON] stale weak-word error ignored:', attemptId, _activeAttemptId, err);
                return;
            }

            showStatus('');
            console.error('Pronunciation error:', err);
            if (err.limitExceeded) {
                _showPaywall(err.tier);
            } else if (err.sdkLoadFailed) {
                showStatus("⚠️ Mikrofon tizimi yuklanmadi.\nInternetni tekshirib, qayta urinib ko‘ring.");
                setTimeout(function () { showStatus(''); }, 4000);
            } else if (err.connectionFailed) {
                /* G2: server-down verdict, same wording as the main flow. */
                showStatus("\u26a0\ufe0f Speech server bilan aloqa yo\u2018q");
                setTimeout(function () { showStatus(''); }, 3500);
            } else if (err.message && err.message.includes('microphone')) {
                alert('Mikrofonga ruxsat berilmadi. Brauzer sozlamalarini tekshiring.');
            } else {
                alert(err.message || 'Talaffuzni tekshirishda xatolik. Qayta urinib ko\u2018ring.');
            }
        })
        .finally(function () {
            btn.disabled = false;
            if (attemptId === _activeAttemptId) {
                _isRecording = false;
                _pronBusy = false;
            }
        });
}

function _wwPrev() {
    if (_weakIdx > 0) {
        _weakIdx--;
        _renderWeakCard(document.getElementById('wwOverlay'));
    }
}

function _wwNext() {
    if (_weakIdx < _weakWords.length - 1) {
        _weakIdx++;
        _renderWeakCard(document.getElementById('wwOverlay'));
    }
}

function _closeWeakWords() {
    var ov = document.getElementById('wwOverlay');
    if (ov) {
        ov.style.display = 'none';
        ov.innerHTML = '';
    }
    document.body.style.overflow = '';
    _weakWords = [];
    _weakIdx = 0;
    if (_savedGetCurrentWord) {
        window.getCurrentWord = _savedGetCurrentWord;
        _savedGetCurrentWord = null;
    }
}
