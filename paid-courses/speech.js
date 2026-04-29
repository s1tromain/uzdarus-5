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
/*  Global recording guard (anti-spam)                                */
/* ================================================================== */
let _isRecording = false;
let _pronClosed = false;
let _demoPronUiSyncTimer = 0;
let _demoPaywallClicked = false;
let _demoPaywallResetTimer = 0;
let _demoPaywallRedirectTimer = 0;
let _redirecting = false;
const DEMO_ALLOWED_TOPICS = [1];

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
        var a = new Audio();
        a.volume = 0.5;
        a.onerror = function () { /* 404 or unsupported — silently ignore */ };
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
                _showPaywall();
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

async function _getSpeechToken() {
    if (_speechToken && Date.now() < _speechTokenExpiry) return _speechToken;
    const res = await fetch('/api/speech-token', { headers: _getAuthHeaders() });
    if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        const e = new Error(body.message || 'Kunlik limit tugadi');
        e.limitExceeded = true;
        e.tier = body.tier || 'demo';
        throw e;
    }
    if (!res.ok) throw new Error('Token request failed');
    const data = await res.json();
    _speechToken = { token: data.token, region: data.region };
    _speechTokenExpiry = Date.now() + 8 * 60 * 1000;
    return _speechToken;
}

function checkPronunciation(event) {
    if (_pronClosed) {
        _pronClosed = false;
        var _savedEvent = event;
        setTimeout(function () {
            checkPronunciation(_savedEvent);
        }, 50);
        return;
    }

    if (_isRecording || _pronBusy) {
        console.warn('[PRON] BLOCKED: busy');
        return;
    }

    var word = typeof window.getCurrentWord === 'function' && window.getCurrentWord();

    if (!word) {
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
        showStatus('\u274C So\u2018z aniqlanmadi');
        console.error('[PRON] wordIndex not found:', word);
        setTimeout(function () { showStatus(''); }, 2500);
        return;
    }

    var referenceText = (word.ru || '').trim();

    if (!referenceText || referenceText.length < 2) {
        showStatus('\u274C So\u2018z noto\u2018g\u2018ri');
        console.error('[PRON] BLOCKED: referenceText too short:', JSON.stringify(referenceText));
        setTimeout(function () { showStatus(''); }, 2500);
        return;
    }

    var topicId = word.topicId != null ? word.topicId : null;

    if (_isDemoLocked(topicId)) {
        _handleDemoPaywall();
        return;
    }

    console.debug('[PRON] index:', wordIdx);
    console.debug('[PRON] referenceText:', JSON.stringify(referenceText));

    /* check if word is locked */
    if (topicId != null && _isWordLocked(topicId, wordIdx)) {
        showStatus('\u26D4 Avval oldingi so\u2018zni tugating');
        setTimeout(function () { showStatus(''); }, 2500);
        return;
    }

    const btn = event.target.closest('.pron-btn') || event.currentTarget;
    btn.disabled = true;
    btn.classList.add('loading');
    _isRecording = true;
    _pronBusy = true;

    showStatus('\uD83C\uDFA4 Gapiring...');

    _runPronunciationAssessment(referenceText)
        .then(result => {
            console.debug('[PRON] RESULT:', result);

            if (!result) {
                _handlePronFail('Natija olinmadi.');
                return;
            }

            var score = result.pronunciationScore;

            /* ============ SUCCESS: score >= pass threshold ============ */
            if (score >= _PRON_PASS_SCORE) {
                showStatus('\uD83D\uDD25 Zo\'r!');
                _animateFlashcardSuccess();
                _playSoundSuccess();
                _hapticSuccess();
                setTimeout(function () { showStatus(''); }, 2000);

                _logPronunciation(word.ru, result);
                try { _showPronResult(word.ru, result); } catch (uiErr) { console.warn('[UI ERROR]', uiErr); }

                /* word progress: complete + unlock next + auto-advance */
                if (topicId != null && wordIdx >= 0) {
                    _completeWord(topicId, wordIdx);

                    if (_isLessonComplete(topicId)) {
                        setTimeout(function () {
                            _showLessonCompleteOverlay();
                        }, 1200);
                        return;
                    }

                    setTimeout(function () {
                        if (typeof window.nextCard === 'function') {
                            window.nextCard();
                        } else if (typeof window.currentWordIndex === 'number') {
                            window.currentWordIndex++;
                            if (typeof window.loadCard === 'function') window.loadCard();
                        } else if (typeof window.currentCardIndex === 'number') {
                            window.currentCardIndex++;
                            if (typeof window.updateCard === 'function') window.updateCard();
                        }
                    }, 1200);
                }

            /* ============ TRY AGAIN: score 40-69 ============ */
            } else if (score >= 40) {
                showStatus('\uD83D\uDCAA Yana urinib ko\'ring');
                _animateFlashcardError();
                _haptic(30);
                setTimeout(function () { showStatus(''); }, 2500);

                _logPronunciation(word.ru, result);
                try { _showPronResult(word.ru, result); } catch (uiErr) { console.warn('[UI ERROR]', uiErr); }
                /* Do NOT unlock the word — user must retry */

            /* ============ FAIL: score < 50 ============ */
            } else {
                showStatus('\u274C Qayta urinib ko\'ring');
                _animateFlashcardError();
                _playSoundError();
                _hapticError();
                setTimeout(function () { showStatus(''); }, 2500);

                _logPronunciation(word.ru, result);
                try { _showPronResult(word.ru, result); } catch (uiErr) { console.warn('[UI ERROR]', uiErr); }
                /* Do NOT unlock the word */
            }
        })
        .catch(err => {
            console.error('[PRON] CATCH:', err);

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
                _showPaywall();
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
            _isRecording = false;
            _pronBusy = false;
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

/* ============================================================
 *  PRONUNCIATION SCORING — single deterministic pipeline.
 *  Input:  recognizedText (real Azure output only, never ref),
 *          referenceText, accuracy, fluency, completeness.
 *  Output: { pronunciationScore, accuracyScore, fluencyScore,
 *            completenessScore, similarity, matchRatio,
 *            matchedWords, totalWords, reason }.
 *  There is ONLY one scoring path — no hidden guards, overrides,
 *  previous-score memory, or fallback-to-reference magic.
 * ============================================================ */

var _PRON_PASS_SCORE = 60;
var _PRON_GOOD_SCORE = 85;

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

function _tokenize(text) {
    if (!text) return [];
    return String(text).toLowerCase().replace(/[.,!?;:]/g, '').split(/\s+/).filter(Boolean);
}

/* Backward-compat alias used by older code paths. */
function _tokenizeRefWords(text) {
    return _tokenize(text);
}

/* Order-aware token stats: exactRatio (positional), partialRatio
   (presence anywhere), extraWords, refLength. */
function _getWordStats(rec, ref) {
    var recWords = _tokenize(rec);
    var refWords = _tokenize(ref);
    var exact = 0;
    var partial = 0;
    refWords.forEach(function (w, i) {
        if (recWords[i] === w) exact++;
        if (recWords.indexOf(w) !== -1) partial++;
    });
    var extra = Math.max(0, recWords.length - partial);
    return {
        exactRatio: refWords.length ? exact / refWords.length : 0,
        partialRatio: refWords.length ? partial / refWords.length : 0,
        extraWords: extra,
        refLength: refWords.length
    };
}

/* Backward-compat shim — old callers expect { matchedWords, totalWords,
   matchRatio }. matchRatio === partialRatio (presence-only). */
function _getMatchedWordStats(recognized, reference) {
    var s = _getWordStats(recognized, reference);
    return {
        matchedWords: Math.round(s.partialRatio * s.refLength),
        totalWords: s.refLength,
        matchRatio: s.partialRatio
    };
}

function _getSimilarity(recognized, reference) {
    return _getWordStats(recognized, reference).partialRatio;
}

/* Normalize an Azure-supplied metric: ≤0 / undefined / NaN → null
   (so UI can render "—" and scoring can ignore it). */
function _normalizeMetric(v) {
    if (v === undefined || v === null) return null;
    var n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (n <= 0) return null;
    if (n > 100) return 100;
    return n;
}

/* Render an Azure metric for display: null/0 → em-dash, else round. */
function _displayMetric(v) {
    if (v === null || v === undefined) return '—';
    var n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return Math.round(n);
}

/* Display-side metrics derived from word stats + Azure fluency.
   Aniqlik = positional accuracy, To‘liqlik = presence,
   Ravonlik = Azure fluency when available, else partial-based fallback. */
function _computeMetrics(stats, fluencyScore) {
    var exact = stats && stats.exactRatio || 0;
    var partial = stats && stats.partialRatio || 0;
    var aniqlik = Math.round(exact * 100);
    var toliqlik = Math.round(partial * 100);
    var ravonlik;
    if (typeof fluencyScore === 'number' && Number.isFinite(fluencyScore) && fluencyScore > 0) {
        ravonlik = Math.round(fluencyScore);
    } else {
        ravonlik = Math.round(partial * 70);
    }
    return { aniqlik: aniqlik, ravonlik: ravonlik, toliqlik: toliqlik };
}

/* Score-driven verdict. Azure metrics are advisory; score is truth.
   Tiers:  ≥90 excellent · 70–89 good · 40–69 almost · <40 bad. */
function _getPronunciationReason(score) {
    var s = Number(score) || 0;
    if (s >= 90) return 'excellent';
    if (s >= 70) return 'good';
    if (s >= 40) return 'almost';
    return 'bad';
}

function _getPronunciationReasonUi(reason) {
    if (reason === 'excellent')        return { message: _t('verdictExcellent'),  verdictClass: 'good' };
    if (reason === 'good')             return { message: _t('verdictGood'),       verdictClass: 'good' };
    if (reason === 'almost')           return { message: _t('verdictAlmost'),     verdictClass: 'ok'  };
    if (reason === 'ok')               return { message: _t('verdictAlmost'),     verdictClass: 'ok'  };
    if (reason === 'bad')              return { message: _t('verdictBad'),        verdictClass: 'bad' };
    if (reason === 'wrong_word')       return { message: _t('verdictWrongWord'),  verdictClass: 'bad' };
    if (reason === 'bad_pronunciation')return { message: _t('verdictBadPron'),    verdictClass: 'ok'  };
    if (reason === 'unclear_speech')   return { message: _t('verdictUnclear'),    verdictClass: 'ok'  };
    if (reason === 'fake_match')       return { message: _t('verdictFakeMatch'),  verdictClass: 'bad' };
    return { message: _t('verdictExcellent'), verdictClass: 'good' };
}

function _buildZeroScoreResult(recognizedText, referenceText, stats) {
    var matchStats = stats || _getMatchedWordStats(recognizedText, referenceText);
    return {
        pronunciationScore: 0,
        accuracyScore: 0,
        fluencyScore: 0,
        completenessScore: 0,
        similarity: matchStats.matchRatio,
        matchRatio: matchStats.matchRatio,
        matchedWords: matchStats.matchedWords,
        totalWords: matchStats.totalWords,
        reason: 'wrong_word'
    };
}

/* Single deterministic scoring pipeline. Returns a number 0–100.
   The caller wraps the score into a result object together with raw
   metrics; this keeps scoring math separate from result shape. */
function _computePronScore(rec, ref, accuracy, fluency, completeness) {
    console.log("🔥 FINAL SCORE PATH WORKING");
    console.log("DEBUG REC VS REF:", rec, "||", ref);

    var clean = (rec || '').trim().toLowerCase();
    if (!clean || clean.length < 2) return 0;

    var s = _getWordStats(clean, ref);
    if (s.refLength === 0) return 0;

    var sim = 0.5 * s.exactRatio + 0.5 * s.partialRatio;
    /* soft floor: no overlap → strong reduction but not a cliff */
    if (s.partialRatio === 0) sim *= 0.2;

    /* word penalties */
    if (s.partialRatio < 1) sim *= 0.9;                                 /* any missing word */
    if (s.exactRatio < s.partialRatio && s.partialRatio > 0) {
        var f = s.exactRatio / s.partialRatio;
        sim *= 0.75 + 0.25 * f;                                         /* soft order */
    }
    if (s.extraWords > 0) {
        sim *= Math.max(0, 1 - 0.15 * s.extraWords);                    /* extra words */
    }

    /* full-reorder floor */
    if (s.partialRatio === 1 && s.exactRatio === 0) {
        sim = Math.max(sim, 0.6);
    }

    /* ignore broken Azure metrics */
    var acc = (accuracy === null || accuracy === undefined || accuracy < 10) ? null : accuracy;
    var flu = (fluency  === null || fluency  === undefined || fluency  < 10) ? null : fluency;

    if (acc !== null && flu !== null) {
        if (acc < 50 || flu < 50) sim *= 0.85;
        if (acc > 80 && flu > 80) sim += 0.03;
    }

    var score = sim * 100;

    /* perfect-match floor (single tier so it doesn't squash gradation) */
    if (s.exactRatio === 1 && s.partialRatio === 1) {
        score = Math.max(score, 80);
    }

    /* low-overlap softener — halve, don't cap */
    if (s.partialRatio < 0.3) score *= 0.5;

    score = Math.round(Math.max(0, Math.min(100, score)));

    console.log('[FINAL SCORE]', {
        text: clean,
        exactRatio: s.exactRatio,
        partialRatio: s.partialRatio,
        extraWords: s.extraWords,
        accuracy: acc,
        fluency: flu,
        score: score
    });

    return score;
}

/* ---- Word-level feedback (correct / missing / wrong_position / extra) ---- */
function _getWordFeedback(recognized, reference) {
    if (!recognized || !reference) return [];

    var rec = [...new Set((recognized || '').toLowerCase().split(/\s+/))];
    var ref = (reference || '').toLowerCase().split(/\s+/);

    var result = [];

    ref.forEach(function (word, index) {
        if (rec[index] === word) {
            result.push({ word: word, status: 'correct' });
        } else if (rec.includes(word)) {
            result.push({ word: word, status: 'wrong_position' });
        } else {
            result.push({ word: word, status: 'missing' });
        }
    });

    rec.forEach(function (word) {
        if (!ref.includes(word)) {
            result.push({ word: word, status: 'extra' });
        }
    });

    return result;
}

/* ---- Build human-readable feedback message from word feedback ---- */

/* ---- Inline highlight: color each reference word by feedback status ---- */
function _buildInlineHighlight(referenceText, feedback) {
    if (!referenceText || !feedback) return '';
    var refWords = referenceText.split(/\s+/);
    return refWords.map(function (word, i) {
        var f = feedback[i];
        var cls = 'wf-missing';
        if (f) {
            if (f.status === 'correct') cls = 'wf-correct';
            else if (f.status === 'wrong_position') cls = 'wf-wrong-pos';
            else if (f.status === 'missing') cls = 'wf-missing';
        }
        return '<span class="wf-word ' + cls + '">' + word + '</span>';
    }).join(' ');
}

/* ---- Smart hint: suggest what to fix ---- */
function _buildActionHint(feedback) {
    if (!feedback || !feedback.length) return '';
    var missing = feedback.filter(function (f) { return f.status === 'missing'; });
    var wrongPos = feedback.filter(function (f) { return f.status === 'wrong_position'; });
    var extra = feedback.filter(function (f) { return f.status === 'extra'; });
    var parts = [];

    if (missing.length) {
        parts.push('Add: ' + missing.map(function (w) { return w.word; }).join(', '));
    }
    if (wrongPos.length) {
        parts.push('Fix the word order');
    }
    if (extra.length) {
        parts.push('Remove: ' + extra.map(function (w) { return w.word; }).join(', '));
    }
    return parts.join('\n\n');
}

function _buildPronunciationVerdictMessage(reasonMessage, feedback) {
    var hint = _buildActionHint(feedback);
    return hint ? reasonMessage + '\n' + hint : reasonMessage;
}

function _buildFeedbackMessage(feedback) {

    var missing = feedback.filter(function (f) { return f.status === 'missing'; });
    var wrong = feedback.filter(function (f) { return f.status === 'wrong_position'; });
    var extra = feedback.filter(function (f) { return f.status === 'extra'; });

    var parts = [];

    if (missing.length > 0) {
        parts.push('\u274C Missing: ' + missing.map(function (w) { return w.word; }).join(', '));
    }
    if (wrong.length > 0) {
        parts.push('\u26A0\uFE0F Word order');
    }
    if (extra.length > 0) {
        parts.push('\u274C Extra: ' + extra.map(function (w) { return w.word; }).join(', '));
    }

    if (parts.length === 0) {
        return '\u2705 Excellent!';
    }

    return parts.join('\n');
}

async function _runPronunciationAssessment(referenceText) {
    /* ---- validate referenceText ---- */
    if (!referenceText || typeof referenceText !== 'string' || referenceText.trim().length === 0) {
        console.error('[PRON] referenceText is empty or invalid:', referenceText);
        throw new Error('So\'z bo\'sh. Iltimos sahifani yangilang.');
    }
    referenceText = referenceText.trim();

    var SpeechSDK = window.SpeechSDK;
    if (!SpeechSDK) {
        alert('Speech SDK yuklanmadi. Sahifani yangilang.');
        throw new Error('Speech SDK not loaded');
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
    var recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
    pronConfig.applyTo(recognizer);
    console.debug('[PRON] recognizer created, config applied for "' + referenceText + '"');

    /* ---- State flags ---- */
    var gotInterim = false;
    var gotFinal = false;
    var lastInterimText = '';

    function _sanitizeRecognizedText(text, allowExactReferenceMatch) {
        var recognizedText = (text || '').trim();

        if (!allowExactReferenceMatch && recognizedText && recognizedText === referenceText) {
            console.debug('[BLOCKED FAKE MATCH]');
            return '';
        }

        return recognizedText;
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

    function buildScoredResult(text, accuracy, fluency, completeness, overrides) {
        var recognizedText = _sanitizeRecognizedText(text, true);
        var stats = _getWordStats(recognizedText, referenceText);
        var normalizedCompleteness = completeness;
        if (normalizedCompleteness === null || normalizedCompleteness === undefined || !Number.isFinite(Number(normalizedCompleteness))) {
            normalizedCompleteness = Math.round((stats.partialRatio || 0) * 100);
        } else {
            normalizedCompleteness = Math.round(Number(normalizedCompleteness));
        }

        var score = _computePronScore(recognizedText, referenceText, accuracy, fluency, normalizedCompleteness);
        var result = {
            recognizedText: recognizedText,
            accuracyScore: accuracy === undefined ? null : accuracy,
            fluencyScore: fluency === undefined ? null : fluency,
            completenessScore: normalizedCompleteness,
            pronunciationScore: score,
            reason: _getPronunciationReason(score),
            words: []
        };

        if (overrides) {
            Object.keys(overrides).forEach(function (key) {
                result[key] = overrides[key];
            });
        }

        return result;
    }

    function buildZeroResult(text, reason) {
        return buildScoredResult(text, null, null, null, {
            reason: reason || 'wrong_word',
            words: []
        });
    }

    /* ---- INTERIM: proves mic + audio work ---- */
    recognizer.recognizing = function (s, e) {
        if (e.result && e.result.text) {
            gotInterim = true;
            var text = e.result.text.trim();
            if (text) lastInterimText = text;
            console.debug('[PRON] INTERIM:', e.result.text);
        }
    };

    recognizer.sessionStarted = function () {
        console.debug('[PRON] session started');
    };

    try { _showPronListening(); } catch (uiErr) { console.warn('[UI ERROR] _showPronListening:', uiErr); }

    /* ---- Recognition: event-driven, timeout-safe ---- */
    return new Promise(function (resolve, reject) {
        var finished = false;
        var timeoutHit = false;
        var softTimeoutId;
        var hardTimeoutId;
        var silenceTimerId;

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
            cleanup();
            _stopActivePron = null;
            fn();
        }

        recognizer.sessionStopped = function () {
            console.debug('[PRON] session stopped, gotInterim:', gotInterim, 'gotFinal:', gotFinal);
            if (!finished) {
                console.warn('[PRON] sessionStopped fallback → scored result');
                finishSafe(function () { resolve(buildZeroResult(_getSafeInterimText())); });
            }
        };

        _stopActivePron = function () {
            if (finished) return;
            finishSafe(function () {
                var err = new Error('cancelled by user');
                err.cancelled = true;
                reject(err);
            });
        };

        /**
         * Extract text + pronunciation scores from a recognition result.
         * Returns a result object or null if text is garbage/empty.
         */
        function extractPronData(result) {
            console.log("ENTER extractPronData");

            var recognizedText = '';
            function buildInvalidPronData(text) {
                var invalidText = _sanitizeRecognizedText(text, true);
                return buildScoredResult(invalidText, null, null, null, {
                    reason: 'bad',
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

            /* Extract Azure metrics */
            var words = [];
            var accuracy = 0;
            var fluency = 0;
            var completeness = 0;
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
                completeness = Number(data?.NBest?.[0]?.PronunciationAssessment?.CompletenessScore);
            } catch (scoreErr) {
                console.warn('[PRON] Azure score extraction failed, scoring with similarity only:', scoreErr);
            }

            /* normalize Azure metrics (0/null/garbage → null) */
            accuracy = _normalizeMetric(accuracy);
            fluency = _normalizeMetric(fluency);
            completeness = _normalizeMetric(completeness);

            /* completeness from token presence (Azure's value is unreliable) */
            var __stats = _getWordStats(recognizedText, referenceText);
            completeness = Math.round(__stats.partialRatio * 100);

            /* anti-fake Azure echo — exact text match but trustworthy
               audio metrics confirm it's bad. Requires BOTH metrics
               non-null so we don't false-positive on broken Azure. */
            if (
                recognizedText === referenceText &&
                accuracy !== null && fluency !== null &&
                (accuracy < 20 || fluency < 20)
            ) {
                console.warn('[FAKE MATCH BLOCKED]');
                return buildScoredResult(recognizedText, accuracy, fluency, completeness, {
                    pronunciationScore: 0,
                    reason: 'fake_match',
                    words: [],
                    wordFeedback: []
                });
            }

            console.log('[STEP extract]', {
                recognizedText: recognizedText,
                referenceText: referenceText,
                accuracy: accuracy,
                fluency: fluency,
                completeness: completeness,
                wordsLen: words.length,
                wordAvg: words.length ? Math.round(words.reduce(function(a,w){return a+(w.accuracy||0);},0)/words.length) : null
            });

            /* Single deterministic scoring pipeline (returns number 0–100).
               Low scores are kept (gradual scale) — only true empty recognition
               was already short-circuited above by _isRealEmptyRecognizedText. */
                console.log("CALL _computePronScore FROM extractPronData");
            var score = _computePronScore(recognizedText, referenceText, accuracy, fluency, completeness);

            return {
                recognizedText: recognizedText,
                pronunciationScore: score,
                accuracyScore: accuracy,
                fluencyScore: fluency,
                completenessScore: completeness,
                reason: _getPronunciationReason(score),
                words: words,
                wordFeedback: _getWordFeedback(recognizedText, referenceText)
            };
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

                console.debug('[PRON] INTERIM:', e.result.text);
            }
        };

        /* ===========================================================
         *  MAIN HANDLER: recognized event
         *  Fires BEFORE recognizeOnceAsync callback → cannot be killed
         *  by timeout because timeout never closes recognizer.
         * =========================================================== */
        recognizer.recognized = function (s, e) {
            console.log("ENTER recognized handler");
            gotFinal = true;
            console.debug('[PRON] FINAL (recognized):', e.result ? e.result.reason : 'null',
                'text:', e.result ? e.result.text : '', 'timeoutHit:', timeoutHit);

            if (finished) return;

            if (!e.result) {
                return finishSafe(function () { resolve(buildZeroResult(_getSafeInterimText())); });
            }

            var reason = e.result.reason;

            if (reason === SpeechSDK.ResultReason.RecognizedSpeech) {
                var data = extractPronData(e.result);
                if (data) {
                    console.debug('[PRON] score:', data.pronunciationScore);
                    finishSafe(function () { resolve(data); });
                } else if (gotInterim) {
                    console.warn('[PRON] RecognizedSpeech but garbage text, gotInterim → zero fallback');
                    finishSafe(function () { resolve(buildZeroResult(_getSafeInterimText())); });
                } else {
                    finishSafe(function () {
                        var err = new Error('Ovoz aniqlanmadi. Balandroq gapiring.');
                        err.noSpeech = true;
                        reject(err);
                    });
                }

            } else if (reason === SpeechSDK.ResultReason.NoMatch) {
                if (gotInterim) {
                    var nmData = extractPronData(e.result);
                    console.warn('[PRON] NoMatch+gotInterim, recovered:', !!nmData);
                    finishSafe(function () { resolve(nmData || buildZeroResult(_getSafeInterimText())); });
                } else {
                    finishSafe(function () {
                        var err = new Error('Ovoz aniqlanmadi. Balandroq gapiring.');
                        err.noSpeech = true;
                        reject(err);
                    });
                }

            } else {
                /* Canceled / unexpected reason */
                console.warn('[PRON] recognized event reason:', reason, 'gotInterim:', gotInterim);
                if (gotInterim) {
                    finishSafe(function () { resolve(buildZeroResult(_getSafeInterimText())); });
                } else {
                    finishSafe(function () {
                        reject(new Error('Xatolik yuz berdi. Qayta urinib ko\'ring.'));
                    });
                }
            }
        };

        /* ---- canceled event ---- */
        recognizer.canceled = function (s, e) {
            console.error('[PRON] CANCELED:', e.reason, e.errorDetails);
            if (finished) return;
            if (gotInterim || gotFinal) {
                console.warn('[PRON] Canceled but speech was detected → zero fallback');
                finishSafe(function () { resolve(buildZeroResult(_getSafeInterimText())); });
                return;
            }
            /* Error cancellation (network/auth) → reject immediately, don't wait 30s */
            if (e.reason === SpeechSDK.CancellationReason.Error) {
                console.error('[PRON] Canceled with Error reason → immediate reject');
                finishSafe(function () {
                    reject(new Error(e.errorDetails || 'Xatolik yuz berdi. Qayta urinib ko\'ring.'));
                });
                return;
            }
            /* EndOfStream / other non-error → resolve with zero */
            console.warn('[PRON] Canceled (non-error) → ZERO_RESULT');
            finishSafe(function () { resolve(buildZeroResult(_getSafeInterimText())); });
        };

        /* ===========================================================
         *  SOFT TIMEOUT (15s): warn only, NEVER reject, NEVER cleanup
         *  Recognizer stays alive — recognized event will still fire.
         * =========================================================== */
        softTimeoutId = setTimeout(function () {
            if (finished) return;
            timeoutHit = true;
            if (gotInterim) {
                var txt = _sanitizeRecognizedText(_getSafeInterimText() || '', true);
                console.warn('[PRON] soft timeout (15s) + gotInterim — forcing scored resolve');
                finishSafe(function () {
                    resolve(buildScoredResult(txt, null, null, null, { words: [] }));
                });
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
            if (finished) return;
            if (gotInterim || gotFinal) {
                console.warn('[PRON] hard timeout (30s) but speech detected — extending 15s...');
                hardTimeoutId = setTimeout(function () {
                    if (finished) return;
                    console.error('[PRON] ultimate timeout (45s) — forcing zero resolve');
                    finishSafe(function () { resolve(buildZeroResult(_getSafeInterimText())); });
                }, 15000);
                return;
            }
            console.error('[PRON] hard timeout (30s) — no speech at all');
            finishSafe(function () {
                reject(new Error('Audio olinmadi. Mikrofon sozlamalarini tekshiring.'));
            });
        }, 30000);

        /* ---- Start recognition ---- */
        console.debug('[PRON] start recognition (recognizeOnceAsync)');

        /* Final safety net — guarantees a result within 8s no matter what */
        setTimeout(function () {
            if (!finished && gotInterim) {
                console.warn('[PRON] FINAL FALLBACK (8s) + gotInterim → scored resolve');
                finishSafe(function () { resolve(buildScoredResult(_getSafeInterimText(), null, null, null, { words: [] })); });
            }
        }, 8000);

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
                    return finishSafe(function () {
                        if (gotInterim) { resolve(buildZeroResult(_getSafeInterimText())); }
                        else { reject(new Error('Natija olinmadi.')); }
                    });
                }

                var data = extractPronData(result);
                if (data) {
                    finishSafe(function () { resolve(data); });
                } else if (gotInterim) {
                    finishSafe(function () { resolve(buildZeroResult(_getSafeInterimText())); });
                } else {
                    finishSafe(function () {
                        var err = new Error('Ovoz aniqlanmadi. Balandroq gapiring.');
                        err.noSpeech = true;
                        reject(err);
                    });
                }
            },
            function (err) {
                if (finished) return;
                console.error('[PRON] recognizeOnceAsync error:', err);
                if (gotInterim) {
                    finishSafe(function () { resolve(buildZeroResult(_getSafeInterimText())); });
                } else {
                    finishSafe(function () { reject(err); });
                }
            }
        );
    });
}

/* ================================================================== */
/*  Word Progress System (localStorage)                               */
/* ================================================================== */
const _PROGRESS_KEY = 'uzdarus_word_progress';

function _loadProgress() {
    try {
        var raw = localStorage.getItem(_PROGRESS_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* corrupted */ }
    return {};
}

function _saveProgress(progress) {
    try { localStorage.setItem(_PROGRESS_KEY, JSON.stringify(progress)); } catch {}
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
        '.pron-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;justify-content:center;align-items:center;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}',
        '.pron-overlay.active{display:flex}',
        '.pron-card{background:#fff;border-radius:24px;padding:32px 24px 24px;max-width:420px;width:92%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3);animation:pronPop .4s cubic-bezier(.175,.885,.32,1.275)}',
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
        '.pron-btns{display:flex;gap:10px;justify-content:center}',
        '.pron-btn{flex:1;padding:14px 0;border:none;border-radius:14px;font-size:1rem;font-weight:700;cursor:pointer;transition:transform .15s,box-shadow .15s}',
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
        /* word feedback highlights */
        '.wf-inline{margin-top:10px;font-size:18px;font-weight:600;line-height:1.6;text-align:center}',
        '.wf-word{padding:2px 6px;border-radius:6px;margin-right:4px;display:inline-block}',
        '.wf-correct{background:#22c55e22;color:#22c55e}',
        '.wf-wrong-pos{background:#f59e0b22;color:#f59e0b}',
        '.wf-missing{background:#9ca3af22;color:#9ca3af}',
        '.wf-hint{margin-top:10px;font-size:14px;color:#facc15;font-weight:500;text-align:center}',
        /* result animations */
        '.anim-success{animation:wfPop .4s ease}',
        '.anim-almost{animation:wfPulse .5s ease}',
        '.anim-fail{animation:wfShake .4s ease}',
        '@keyframes wfPop{0%{transform:scale(.9)}100%{transform:scale(1)}}',
        '@keyframes wfPulse{0%{opacity:.6}100%{opacity:1}}',
        '@keyframes wfShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}',
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
    document.getElementById('pronCard').innerHTML =
        '<div class="pron-listening">'
      + '  <div class="pron-mic">\uD83C\uDFA4</div>'
      + '  <div class="pron-listening-text">Tinglayapman<span class="pron-listening-dots"><span>.</span><span>.</span><span>.</span></span></div>'
      + '  <div style="font-size:.82rem;color:#aaa">So\u2018zni aniq ayting</div>'
      + '</div>';
    document.getElementById(_PRON_OVERLAY_ID).classList.add('active');
    _isPronListening = true;
}

/* ---- result screen ---- */
function _showPronResult(refText, r) {
    if (!r) return;
    _ensurePronOverlay();
    _lastPronRef = refText;
    _isPronListening = false;

    var stats = _getWordStats(r.recognizedText || '', refText);
    var metrics = _computeMetrics(stats, r.fluencyScore);
    var finalScore = Math.round(
        (metrics.aniqlik + metrics.ravonlik + metrics.toliqlik) / 3
    );

    console.log("METRICS DEBUG:", {
        aniqlik: metrics.aniqlik,
        ravonlik: metrics.ravonlik,
        toliqlik: metrics.toliqlik,
        finalScore: finalScore
    });

    /* expose computed values back to the result so downstream feedback
       and consumers see the same numbers the UI does */
    r.aniqlik = metrics.aniqlik;
    r.ravonlik = metrics.ravonlik;
    r.toliqlik = metrics.toliqlik;
    r.finalScore = finalScore;

    var overall = finalScore;
    var cls = _sClass(overall);
    /* fake_match is preserved; everything else is verdicted from finalScore */
    var derivedReason = (r.reason === 'fake_match') ? 'fake_match' : _getPronunciationReason(finalScore);
    var reasonInfo = _getPronunciationReasonUi(derivedReason);
    var emoji, title;
    if (overall >= 90)      { emoji = '🌟'; title = _t('excellent'); }
    else if (overall >= 70) { emoji = '✨'; title = _t('good');      }
    else if (overall >= 40) { emoji = '💪'; title = _t('almost');    }
    else                    { emoji = '😕'; title = _t('tryAgain');  }

    var c = _ringCircum();
    var offset = c - (overall / 100) * c;

    var bars = [
        { label: 'Aniqlik',     val: metrics.aniqlik },
        { label: 'Ravonlik',    val: metrics.ravonlik },
        { label: 'To\u2018liqlik', val: metrics.toliqlik },
    ];

    var html = '';

    /* emoji + title */
    html += '<div class="pron-emoji">' + emoji + '</div>';
    html += '<div class="pron-title ' + cls + '">' + title + '</div>';
    html += '<div class="pron-subtitle">\u00AB' + refText + '\u00BB</div>';

    /* ring */
    html += '<div class="pron-ring-wrap">'
          + '<svg class="pron-ring-svg" viewBox="0 0 100 100">'
          + '<circle class="pron-ring-bg" cx="50" cy="50" r="42"/>'
          + '<circle class="pron-ring-fg ' + cls + '" cx="50" cy="50" r="42"'
          + ' stroke-dasharray="' + c + '" stroke-dashoffset="' + c + '" id="pronRingFg"/>'
          + '</svg>'
          + '<div class="pron-ring-val" id="pronRingVal">0</div>'
          + '</div>';

    /* progress bars */
    html += '<div class="pron-bars">';
    for (var i = 0; i < bars.length; i++) {
        var b = bars[i];
        var bc = _sClass(b.val);
        var barFill = (Number(b.val) > 0 && Number.isFinite(Number(b.val))) ? Math.round(Number(b.val)) : 0;
        html += '<div class="pron-bar-row">'
              + '<div class="pron-bar-label">' + b.label + '</div>'
              + '<div class="pron-bar-track"><div class="pron-bar-fill ' + bc + '" data-w="' + barFill + '"></div></div>'
              + '<div class="pron-bar-num ' + bc + '">' + _displayMetric(b.val) + '</div>'
              + '</div>';
    }
    html += '</div>';

    /* word stats summary — exact / partial / extra so the user sees
       why the score is what it is */
    var exactCount = Math.round(stats.exactRatio * stats.refLength);
    var partialCount = Math.round(stats.partialRatio * stats.refLength);
    html += '<div class="pron-stats">'
          + '<span class="pron-stat-item good">✓ ' + exactCount + '/' + stats.refLength + ' ' + _t('exact') + '</span>'
          + '<span class="pron-stat-item ok">~ ' + partialCount + '/' + stats.refLength + ' ' + _t('present') + '</span>'
          + '<span class="pron-stat-item bad">+ ' + stats.extraWords + ' ' + _t('extra') + '</span>'
          + '</div>';

    /* smart actionable hint (one line) */
    var hintText = _buildSmartHint(r);
    if (hintText) {
        html += '<div class="pron-hint">💡 ' + hintText + '</div>';
    }

    /* word chips */
    html += '<div class="pron-words">';
    for (var j = 0; j < r.words.length; j++) {
        var w = r.words[j];
        var wc = _sClass(w.accuracy);
        html += '<div class="pron-chip ' + wc + '" style="animation-delay:' + (j * 0.08) + 's">'
              + w.word + '<span class="pron-chip-score">' + w.accuracy + '</span></div>';
    }
    html += '</div>';

    /* word-level feedback (correct / missing / wrong_position / extra) */
    var wfb = r.wordFeedback || [];
    var verdictMessage = _buildPronunciationVerdictMessage(reasonInfo.message, wfb);
    if (refText && wfb.length > 0) {
        /* inline highlighted sentence */
        html += '<div class="wf-inline">' + _buildInlineHighlight(refText, wfb) + '</div>';
    }

    /* verdict */
    html += '<div class="pron-verdict ' + reasonInfo.verdictClass + '">' + verdictMessage + '</div>';

    /* XP reward — disabled */

    /* personalized tips */
    var tips = generatePronunciationFeedback(r);
    if (tips.length > 0) {
        html += '<div class="pron-tips">';
        for (var t = 0; t < tips.length; t++) {
            var tip = tips[t];
            html += '<div class="pron-tip ' + tip.level + '" style="animation-delay:' + (t * 0.1) + 's">';
            if (tip.word) {
                html += '<div class="pron-tip-word">' + tip.word + '<span class="score">' + tip.score + '/100</span></div>';
            }
            html += '<div class="pron-tip-text">' + tip.message + '</div>';
            if (tip.advice) html += '<div class="pron-tip-advice">\uD83D\uDCA1 ' + tip.advice + '</div>';
            html += '</div>';
        }
        html += '</div>';
    }

    /* buttons */
    html += '<div class="pron-btns">'
          + '<button class="pron-btn pron-btn-retry" onclick="_retryPron()">\uD83D\uDD01 Qayta aytish</button>'
          + '<button class="pron-btn pron-btn-close" onclick="closePronResult()">Yopish</button>'
          + '</div>';

    document.getElementById('pronCard').innerHTML = html;

    /* apply animation class based on score */
    var pronCard = document.getElementById('pronCard');
    pronCard.classList.remove('anim-success', 'anim-almost', 'anim-fail');
    if (overall >= _PRON_GOOD_SCORE) {
        pronCard.classList.add('anim-success');
    } else if (overall >= _PRON_PASS_SCORE) {
        pronCard.classList.add('anim-almost');
    } else {
        pronCard.classList.add('anim-fail');
    }

    /* kick animations after paint */
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            /* ring animation */
            var fg = document.getElementById('pronRingFg');
            if (fg) fg.setAttribute('stroke-dashoffset', String(offset));

            /* counter animation */
            _animateCounter('pronRingVal', 0, overall, 900);

            /* bar fills */
            var fills = document.querySelectorAll('.pron-bar-fill[data-w]');
            for (var k = 0; k < fills.length; k++) {
                fills[k].style.width = fills[k].getAttribute('data-w') + '%';
            }
        });
    });
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
    closePronResult();
    /* find the pronunciation button and click it */
    var btn = document.querySelector('.audio-button[onclick*="checkPronunciation"]');
    if (btn) btn.click();
}

/* ---- close ---- */
function closePronResult() {
    _pronClosed = true;
    _isPronListening = false;
    var el = document.getElementById(_PRON_OVERLAY_ID);
    if (el) el.classList.remove('active');
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

function _showPaywall() {
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
/*  Global exports — make functions accessible from onclick handlers  */
/* ================================================================== */
window.checkPronunciation = checkPronunciation;
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
            if (err.limitExceeded) _showPaywall();
        })
        .finally(function () { btn.disabled = false; });
}

function _wwSpeak(btn) {
    if (_isRecording || _pronBusy) return;
    btn.disabled = true;
    _isRecording = true;
    _pronBusy = true;

    var word = _weakWords[_weakIdx].word;

    showStatus('\uD83C\uDFA4 Gapiring...');

    _runPronunciationAssessment(word)
        .then(function (result) {
            showStatus('\u23F3 Tekshirilmoqda...');
            if (!result || result.accuracyScore < 40) {
                showStatus('');
                alert('Talaffuz aniqlanmadi. Qayta urinib ko\'ring.');
                return;
            }
            showStatus('');
            _showPronResult(word, result);
            _logPronunciation(word, result);
        })
        .catch(function (err) {
            showStatus('');
            console.error('Pronunciation error:', err);
            if (err.limitExceeded) {
                _showPaywall();
            } else if (err.message && err.message.includes('microphone')) {
                alert('Mikrofonga ruxsat berilmadi. Brauzer sozlamalarini tekshiring.');
            } else {
                alert(err.message || 'Talaffuzni tekshirishda xatolik. Qayta urinib ko\u2018ring.');
            }
        })
        .finally(function () {
            btn.disabled = false;
            _isRecording = false;
            _pronBusy = false;
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
