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
        el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9600;padding:10px 22px;border-radius:16px;font-size:.9rem;font-weight:700;color:#fff;background:rgba(0,0,0,.75);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);pointer-events:none;transition:opacity .3s;font-family:system-ui,-apple-system,sans-serif';
        document.body.appendChild(el);
    }
    if (!text) {
        el.style.opacity = '0';
        return;
    }
    el.textContent = text;
    el.style.opacity = '1';
}

/* ================================================================== */
/*  Sound effects (fire-and-forget, safe if autoplay blocked)         */
/* ================================================================== */
function _playSound(src) {
    try {
        var a = new Audio(src);
        a.volume = 0.5;
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
    event.stopPropagation();
    const btn = event.currentTarget;
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
    event.stopPropagation();
    if (_isRecording || _pronBusy) return;

    const word = typeof window.getCurrentWord === 'function' && window.getCurrentWord();
    if (!word || !word.ru) return;

    var topicId = word.topicId != null ? word.topicId : null;
    var wordIdx = _getWordIndex(word);

    /* check if word is locked */
    if (topicId != null && wordIdx >= 0 && _isWordLocked(topicId, wordIdx)) return;

    const btn = event.currentTarget;
    btn.disabled = true;
    btn.classList.add('loading');
    _isRecording = true;
    _pronBusy = true;

    showStatus('\uD83C\uDFA4 Gapiring...');

    _runPronunciationAssessment(word.ru)
        .then(result => {
            showStatus('\u23F3 Tekshirilmoqda...');

            /* ---- validation: reject bad/empty results ---- */
            if (!result || result.accuracyScore < 40) {
                showStatus('\u274C Qayta urinib ko\'ring');
                _animateFlashcardError();
                _playSoundError();
                _hapticError();
                setTimeout(function () { showStatus(''); }, 2000);
                var msg = result
                    ? 'Talaffuz aniqlanmadi (ball: ' + result.accuracyScore + '). Qayta urinib ko\'ring.'
                    : 'Natija olinmadi.';
                alert(msg);
                return;
            }

            _logPronunciation(word.ru, result);

            /* ---- retry if score < 80: do NOT unlock next word ---- */
            if (result.pronunciationScore < 80) {
                showStatus('\u274C Qayta urinib ko\'ring');
                _animateFlashcardError();
                _playSoundError();
                _hapticError();
                setTimeout(function () { showStatus(''); }, 2000);
                _showPronResult(word.ru, result);
                return;
            }

            /* ---- success: score >= 80 ---- */
            showStatus('\uD83D\uDD25 Zo\'r!');
            _animateFlashcardSuccess();
            _playSoundSuccess();
            _hapticSuccess();
            setTimeout(function () { showStatus(''); }, 2000);
            _showPronResult(word.ru, result);

            /* ---- word progress: complete + unlock next + auto-advance ---- */
            if (topicId != null && wordIdx >= 0) {
                _completeWord(topicId, wordIdx);

                /* check if entire lesson is done */
                if (_isLessonComplete(topicId)) {
                    setTimeout(function () {
                        _showLessonCompleteOverlay();
                    }, 1200);
                    return; /* don't auto-advance, lesson overlay handles it */
                }

                /* auto-advance to next word after a short delay */
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
        })
        .catch(err => {
            showStatus('\u274C Qayta urinib ko\'ring');
            _animateFlashcardError();
            _playSoundError();
            _hapticError();
            setTimeout(function () { showStatus(''); }, 2000);
            console.error('Pronunciation error:', err);
            if (err.limitExceeded) {
                _showPaywall();
            } else if (err.message && err.message.includes('microphone')) {
                alert('Mikrofonga ruxsat berilmadi. Brauzer sozlamalarini tekshiring.');
            } else {
                alert(err.message || 'Talaffuzni tekshirishda xatolik. Qayta urinib ko\'ring.');
            }
        })
        .finally(() => {
            btn.disabled = false;
            btn.classList.remove('loading');
            _isRecording = false;
            _pronBusy = false;
        });
}

async function _runPronunciationAssessment(referenceText) {
    console.log('[PRON] STEP 1: requesting microphone');

    /* ---- 1. Microphone with fallback ---- */
    let micStream = null;
    let audioConfig;

    try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('[PRON] STEP 2: stream obtained, tracks:', micStream.getAudioTracks().length);
        const SpeechSDK = window.SpeechSDK;
        if (!SpeechSDK) throw new Error('Speech SDK not loaded');
        audioConfig = SpeechSDK.AudioConfig.fromStreamInput(micStream);
        console.log('[PRON] STEP 3: audioConfig created via fromStreamInput');
    } catch (streamErr) {
        console.warn('[PRON] fromStreamInput failed, falling back to fromDefaultMicrophoneInput:', streamErr.message);
        try {
            const SpeechSDK = window.SpeechSDK;
            if (!SpeechSDK) throw new Error('Speech SDK not loaded');
            audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
            console.log('[PRON] STEP 3: audioConfig created via fromDefaultMicrophoneInput (fallback)');
        } catch {
            alert('Mikrofon ruxsati kerak. Brauzer sozlamalarini tekshiring.');
            throw new Error('microphone permission denied');
        }
    }

    /* ---- 2. Speech token ---- */
    console.log('[PRON] STEP 4: fetching speech token');
    let tokenData;
    try {
        tokenData = await _getSpeechToken();
    } catch (tokErr) {
        if (micStream) micStream.getTracks().forEach(t => t.stop());
        throw tokErr;
    }
    const { token, region } = tokenData;
    console.log('[PRON] STEP 5: token OK, region:', region);

    const SpeechSDK = window.SpeechSDK;

    /* ---- 3. Config ---- */
    const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
    speechConfig.speechRecognitionLanguage = 'ru-RU';

    /* ---- 4. Pronunciation assessment config ---- */
    const pronConfig = new SpeechSDK.PronunciationAssessmentConfig(
        referenceText,
        SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
        SpeechSDK.PronunciationAssessmentGranularity.Word,
        true
    );

    /* ---- 5. Recognizer ---- */
    const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
    pronConfig.applyTo(recognizer);
    console.log('[PRON] STEP 6: recognizer created for "' + referenceText + '"');

    /* ---- 6. Diagnostic event handlers ---- */
    recognizer.recognizing = function (s, e) {
        console.log('[PRON] INTERIM:', e.result.text);
    };
    recognizer.recognized = function (s, e) {
        console.log('[PRON] FINAL reason:', e.result.reason, 'text:', e.result.text);
    };
    recognizer.canceled = function (s, e) {
        console.warn('[PRON] CANCELED reason:', e.reason, 'errorDetails:', e.errorDetails);
    };
    recognizer.sessionStarted = function () {
        console.log('[PRON] session started');
    };
    recognizer.sessionStopped = function () {
        console.log('[PRON] session stopped');
    };

    _showPronListening();

    /* ---- 7. Promise with timeout guard ---- */
    return new Promise((resolve, reject) => {
        let settled = false;
        const TIMEOUT_MS = 12000;

        function finish(fn) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { recognizer.close(); } catch { /* ignore */ }
            if (micStream) {
                try { micStream.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
            }
            fn();
        }

        const timer = setTimeout(() => {
            console.error('[PRON] TIMEOUT after', TIMEOUT_MS, 'ms');
            finish(() => reject(new Error('Vaqt tugadi. Qayta urinib ko\'ring.')));
        }, TIMEOUT_MS);

        console.log('[PRON] STEP 7: calling recognizeOnceAsync');
        recognizer.recognizeOnceAsync(
            result => {
                console.log('[PRON] STEP 8: result received, reason:', result ? result.reason : 'null');

                if (!result) {
                    return finish(() => reject(new Error('Natija olinmadi.')));
                }

                const reason = result.reason;

                if (reason === SpeechSDK.ResultReason.RecognizedSpeech) {
                    const text = (result.text || '').trim();
                    console.log('[PRON] recognized text:', text);
                    if (!text || text.length < 2) {
                        return finish(() => reject(new Error('Ovoz aniqlanmadi. Balandroq gapiring.')));
                    }

                    const pronResult = SpeechSDK.PronunciationAssessmentResult.fromResult(result);
                    const nb = pronResult.detailResult;

                    const words = (nb.Words || []).map(w => ({
                        word: w.Word,
                        accuracy: Math.round(w.PronunciationAssessment?.AccuracyScore ?? 0),
                        error: w.PronunciationAssessment?.ErrorType || 'None',
                    }));

                    console.log('[PRON] pronunciation score:', pronResult.pronunciationScore);
                    finish(() => resolve({
                        accuracyScore:      Math.round(pronResult.accuracyScore),
                        fluencyScore:       Math.round(pronResult.fluencyScore),
                        completenessScore:  Math.round(pronResult.completenessScore),
                        pronunciationScore: Math.round(pronResult.pronunciationScore),
                        words,
                    }));
                } else if (reason === SpeechSDK.ResultReason.NoMatch) {
                    console.warn('[PRON] NoMatch — no speech recognized');
                    finish(() => reject(new Error('Ovoz aniqlanmadi. Balandroq gapiring.')));
                } else if (reason === SpeechSDK.ResultReason.Canceled) {
                    const cancellation = SpeechSDK.CancellationDetails.fromResult(result);
                    const msg = cancellation.reason === SpeechSDK.CancellationReason.Error
                        ? (cancellation.errorDetails || 'Recognition cancelled')
                        : 'Recognition cancelled';
                    console.error('[PRON] Canceled:', msg);
                    finish(() => reject(new Error('Xatolik yuz berdi. Qayta urinib ko\'ring.')));
                } else {
                    console.error('[PRON] unexpected reason:', reason);
                    finish(() => reject(new Error(result.errorDetails || 'Recognition failed')));
                }
            },
            err => {
                console.error('[PRON] recognizeOnceAsync error:', err);
                finish(() => reject(err));
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
}

/**
 * Check if a word is locked.
 * A word is accessible (unlocked) only if progress[index] === true.
 * Word 0 is always unlocked.
 */
function _isWordLocked(topicId, wordIndex) {
    if (wordIndex <= 0) return false;
    var progress = _loadProgress();
    var key = String(topicId);
    if (!progress[key]) return false; // no progress tracking active
    if (wordIndex >= progress[key].length) return true; // out of bounds = locked
    return !progress[key][wordIndex];
}

/** Try to get the word index from getCurrentWord context. */
function _getWordIndex(word) {
    if (typeof window._currentWordIndex === 'number') return window._currentWordIndex;
    if (typeof window.currentWordIndex === 'number') return window.currentWordIndex;
    if (typeof window.currentCardIndex === 'number') return window.currentCardIndex;
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
    _applyWordProgressUI(topicId);
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
 * Update the speech progress bar.
 * Called by vocabulary pages on each card transition.
 * @param {number} current — 0-based current word index
 * @param {number} total   — total word count
 */
function updateProgressBar(current, total) {
    var fill = document.getElementById('speechProgressFill');
    if (!fill) return;
    var pct = total > 0 ? Math.round(((current + 1) / total) * 100) : 0;
    fill.style.width = Math.min(pct, 100) + '%';
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

    var xpResult = _awardXP(95); // bonus for completing whole lesson
    _updateStreakBadge();

    if (xpResult.xpGained > 0) {
        _showXpToast(xpResult.xpGained);
    }
    if (xpResult.leveledUp) {
        setTimeout(function () { _showLevelUpPopup(xpResult.level); }, 1000);
    }

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

    var streak = _getStreak();

    var xpLine = xpResult.xpGained > 0
        ? '<div class="lc-xp">+' + xpResult.xpGained + ' XP \u{1F525}</div>'
        : '';

    var streakLine = streak > 0
        ? '<div class="lc-streak">\uD83D\uDD25 ' + streak + ' kun ketma-ket!</div>'
        : '';

    ov.innerHTML =
        '<div class="lc-card">'
      +   '<div class="lc-emoji">\uD83C\uDF89</div>'
      +   '<div class="lc-title">Dars tugadi!</div>'
      +   '<div class="lc-subtitle">Barcha so\u2018zlarni muvaffaqiyatli o\u2018rgandingiz</div>'
      +   xpLine
      +   streakLine
      +   '<div class="lc-encourage">\uD83D\uDD25 Zo\u2018r! Ertaga yana qayting!</div>'
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
/*  Gamification — XP + daily streak (localStorage)                   */
/* ================================================================== */
const _GAMIFY_KEY = 'uzdarus_gamify';

function _loadGamify() {
    try {
        var raw = localStorage.getItem(_GAMIFY_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* corrupted */ }
    return { xp: 0, streak: 0, lastDate: null, todayXp: 0, todayDate: null };
}

function _saveGamify(g) {
    try { localStorage.setItem(_GAMIFY_KEY, JSON.stringify(g)); } catch {}
}

function _todayStr() {
    return new Date().toISOString().slice(0, 10);
}

function _yesterdayStr() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
}

/* ---- level helpers ---- */
function _calcLevel(xp) {
    return Math.floor(xp / 100);
}

function _xpInCurrentLevel(xp) {
    return xp % 100;
}

function _xpForNextLevel() {
    return 100;
}

function _levelProgress(xp) {
    return _xpInCurrentLevel(xp) / _xpForNextLevel();
}

/**
 * Award XP for a pronunciation result.
 * Returns { xpGained, totalXp, streak, level, prevLevel, leveledUp, progress } for display.
 */
function _awardXP(pronunciationScore) {
    var g = _loadGamify();
    var prevLevel = _calcLevel(g.xp);

    var xp = 0;
    if (pronunciationScore >= 85) xp = 10;
    else if (pronunciationScore >= 70) xp = 5;
    if (xp === 0) {
        return { xpGained: 0, totalXp: g.xp, streak: g.streak,
                 level: prevLevel, prevLevel: prevLevel, leveledUp: false,
                 progress: _levelProgress(g.xp) };
    }

    var today = _todayStr();

    /* streak logic */
    if (g.todayDate !== today) {
        if (g.lastDate === _yesterdayStr()) {
            g.streak += 1;
        } else if (g.lastDate !== today) {
            g.streak = 1;
        }
        g.lastDate = today;
        g.todayXp = 0;
        g.todayDate = today;
    }

    g.xp += xp;
    g.todayXp += xp;
    _saveGamify(g);

    var newLevel = _calcLevel(g.xp);
    return {
        xpGained: xp, totalXp: g.xp, streak: g.streak, todayXp: g.todayXp,
        level: newLevel, prevLevel: prevLevel, leveledUp: newLevel > prevLevel,
        progress: _levelProgress(g.xp)
    };
}

function _getStreak() {
    var g = _loadGamify();
    var today = _todayStr();
    /* if the user hasn't practiced today, check if streak is still valid */
    if (g.lastDate === today || g.lastDate === _yesterdayStr()) return g.streak;
    return 0;   // streak expired
}

/* ---- badge + level UI (injected into page) ---- */
function _ensureStreakBadge() {
    if (document.getElementById('streakBadge')) return;

    var s = document.createElement('style');
    s.textContent = [
        '.streak-badge{position:fixed;top:12px;right:12px;z-index:9000;display:flex;align-items:center;gap:8px;padding:8px 16px;border-radius:22px;font-size:.88rem;font-weight:700;color:#333;background:#fff;border:2px solid #e8e8e8;box-shadow:0 4px 20px rgba(0,0,0,.08);animation:streakSlide .5s ease both;cursor:default;font-family:system-ui,-apple-system,sans-serif}',
        '.streak-badge .sb-level{display:flex;align-items:center;gap:5px;color:#667eea;font-weight:800}',
        '.streak-badge .sb-level-num{font-size:1.05rem}',
        '.streak-badge .sb-bar-wrap{width:48px;height:6px;background:#eee;border-radius:3px;overflow:hidden}',
        '.streak-badge .sb-bar-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,#667eea,#764ba2);transition:width .6s ease}',
        '.streak-badge .sb-fire{font-size:1.05rem;animation:streakFire 1s ease infinite alternate}',
        '.streak-badge .sb-streak{color:#ff6b00;font-weight:800}',
        '.streak-badge .sb-xp{color:#667eea;padding-left:6px;border-left:2px solid #e8e8e8}',
        '.streak-badge .sb-sep{width:1px;height:16px;background:#e0e0e0}',
        '@keyframes streakSlide{from{opacity:0;transform:translateY(-20px)}to{opacity:1;transform:translateY(0)}}',
        '@keyframes streakFire{0%{transform:scale(1) rotate(-3deg)}100%{transform:scale(1.15) rotate(3deg)}}',
        '.xp-toast{position:fixed;top:60px;right:16px;z-index:9001;padding:10px 18px;border-radius:14px;font-size:.9rem;font-weight:800;color:#fff;background:linear-gradient(135deg,#667eea,#764ba2);box-shadow:0 6px 20px rgba(102,126,234,.4);animation:xpToastIn .4s ease both;pointer-events:none}',
        '@keyframes xpToastIn{from{opacity:0;transform:translateY(-12px) scale(.8)}to{opacity:1;transform:translateY(0) scale(1)}}',
        /* level-up popup */
        '.lvlup-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10001;justify-content:center;align-items:center;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}',
        '.lvlup-overlay.active{display:flex}',
        '.lvlup-card{background:#fff;border-radius:28px;padding:40px 32px 32px;max-width:360px;width:88%;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.25);animation:lvlPop .5s cubic-bezier(.175,.885,.32,1.275)}',
        '@keyframes lvlPop{from{opacity:0;transform:scale(.7) translateY(60px)}to{opacity:1;transform:scale(1) translateY(0)}}',
        '.lvlup-stars{font-size:3.5rem;margin-bottom:4px;animation:lvlStars .8s .2s both}',
        '@keyframes lvlStars{0%{transform:scale(0) rotate(-30deg);opacity:0}60%{transform:scale(1.3) rotate(8deg)}100%{transform:scale(1) rotate(0);opacity:1}}',
        '.lvlup-title{font-size:1.5rem;font-weight:900;color:#667eea;margin-bottom:4px}',
        '.lvlup-num{font-size:3rem;font-weight:900;background:linear-gradient(135deg,#667eea,#764ba2);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1.2}',
        '.lvlup-sub{font-size:.9rem;color:#888;margin:8px 0 20px}',
        '.lvlup-bar-wrap{width:80%;margin:0 auto 20px;height:10px;background:#eee;border-radius:5px;overflow:hidden}',
        '.lvlup-bar-fill{height:100%;border-radius:5px;background:linear-gradient(90deg,#667eea,#764ba2);width:0;transition:width .8s ease .3s}',
        '.lvlup-btn{display:inline-block;padding:14px 40px;border:none;border-radius:16px;font-size:1rem;font-weight:800;color:#fff;background:linear-gradient(135deg,#667eea,#764ba2);box-shadow:0 5px 0 #5a3d8a;cursor:pointer;transition:transform .15s}',
        '.lvlup-btn:active{transform:translateY(3px);box-shadow:0 2px 0 #5a3d8a}',
    ].join('\n');
    document.head.appendChild(s);

    var badge = document.createElement('div');
    badge.id = 'streakBadge';
    badge.className = 'streak-badge';
    document.body.appendChild(badge);
}

function _updateStreakBadge() {
    _ensureStreakBadge();
    var g = _loadGamify();
    var streak = _getStreak();
    var level = _calcLevel(g.xp);
    var pct = Math.round(_levelProgress(g.xp) * 100);
    var badge = document.getElementById('streakBadge');
    if (!badge) return;

    if (streak > 0 || g.xp > 0 || level > 0) {
        badge.style.display = 'flex';
        var h = '';
        /* level + mini progress bar */
        h += '<span class="sb-level">';
        h += '\u2B50 <span class="sb-level-num">' + level + '</span>';
        h += '<span class="sb-bar-wrap"><span class="sb-bar-fill" style="width:' + pct + '%"></span></span>';
        h += '</span>';
        /* streak */
        if (streak > 0) {
            h += '<span class="sb-sep"></span>';
            h += '<span class="sb-fire">\uD83D\uDD25</span><span class="sb-streak">' + streak + '</span>';
        }
        /* xp */
        h += '<span class="sb-sep"></span>';
        h += '<span class="sb-xp">' + g.xp + ' XP</span>';
        badge.innerHTML = h;
    } else {
        badge.style.display = 'none';
    }
}

function _showXpToast(xp) {
    _ensureStreakBadge();
    var t = document.createElement('div');
    t.className = 'xp-toast';
    t.textContent = '+' + xp + ' XP';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1800);
}

/* ---- level-up popup ---- */
function _showLevelUpPopup(newLevel) {
    _ensureStreakBadge();
    var id = 'lvlUpOverlay';
    var overlay = document.getElementById(id);
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = id;
        overlay.className = 'lvlup-overlay';
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) _closeLevelUp();
        });
        document.body.appendChild(overlay);
    }

    var g = _loadGamify();
    var pct = Math.round(_levelProgress(g.xp) * 100);
    var remaining = _xpForNextLevel() - _xpInCurrentLevel(g.xp);

    overlay.innerHTML =
        '<div class="lvlup-card">'
      +   '<div class="lvlup-stars">\uD83C\uDF1F\u2B50\uD83C\uDF1F</div>'
      +   '<div class="lvlup-title">Yangi daraja!</div>'
      +   '<div class="lvlup-num">Level ' + newLevel + '</div>'
      +   '<div class="lvlup-sub">Keyingi darajagacha ' + remaining + ' XP qoldi</div>'
      +   '<div class="lvlup-bar-wrap"><div class="lvlup-bar-fill" id="lvlBarFill"></div></div>'
      +   '<button class="lvlup-btn" onclick="_closeLevelUp()">Davom etish</button>'
      + '</div>';

    overlay.classList.add('active');

    /* animate bar after paint */
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            var bar = document.getElementById('lvlBarFill');
            if (bar) bar.style.width = pct + '%';
        });
    });
}

function _closeLevelUp() {
    var el = document.getElementById('lvlUpOverlay');
    if (el) el.classList.remove('active');
}

/* init badge + streak reminder + voice selector on load */
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            _updateStreakBadge();
            _showStreakReminder();
            _initVoiceSelector();
            _injectWordProgressCSS();
        });
    } else {
        _updateStreakBadge();
        _showStreakReminder();
        _initVoiceSelector();
        _injectWordProgressCSS();
    }
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

        /* ---- voice switch buttons ---- */
        '.voice-switch{display:flex;justify-content:center;gap:8px;margin-bottom:10px}',
        '.voice-switch button{padding:8px 18px;border-radius:12px;border:2px solid #e0e0e0;background:#fff;font-size:.85rem;font-weight:700;cursor:pointer;transition:all .2s ease;color:#555;font-family:system-ui,-apple-system,sans-serif}',
        '.voice-switch button:hover{border-color:#667eea;color:#667eea;background:#f8f9ff}',
        '.voice-switch button.active{border-color:#667eea;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;box-shadow:0 3px 12px rgba(102,126,234,.3)}',
        '.voice-switch button:active{transform:scale(.95)}',
    ].join('\n');
    document.head.appendChild(s);
}

/* ---- streak-at-risk reminder ---- */
function _showStreakReminder() {
    var g = _loadGamify();
    if (g.streak < 1) return;                 // no streak to lose
    if (g.todayDate === _todayStr()) return;   // already practiced today

    var DISMISS_KEY = 'uzdarus_streak_dismiss';
    var dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed === _todayStr()) return;     // already dismissed today

    _ensureStreakBadge(); // CSS host

    var id = 'streakReminder';
    if (document.getElementById(id)) return;

    var css = document.createElement('style');
    css.textContent = [
        '.sr-bar{position:fixed;bottom:0;left:0;right:0;z-index:9500;display:flex;align-items:center;justify-content:center;gap:12px;padding:14px 20px;background:linear-gradient(135deg,#fff4e6,#ffe8cc);border-top:2px solid #ffcb80;box-shadow:0 -4px 24px rgba(255,152,0,.15);animation:srSlide .45s ease both;font-family:system-ui,-apple-system,sans-serif}',
        '@keyframes srSlide{from{transform:translateY(100%)}to{transform:translateY(0)}}',
        '.sr-bar .sr-fire{font-size:1.6rem;animation:streakFire 1s ease infinite alternate}',
        '.sr-bar .sr-text{font-size:.92rem;font-weight:700;color:#b45309}',
        '.sr-bar .sr-streak{color:#e65100;font-weight:900}',
        '.sr-bar .sr-cta{padding:8px 20px;border:none;border-radius:12px;font-size:.85rem;font-weight:800;color:#fff;background:linear-gradient(135deg,#ff9800,#e65100);box-shadow:0 3px 0 #bf360c;cursor:pointer;transition:transform .15s;white-space:nowrap}',
        '.sr-bar .sr-cta:active{transform:translateY(2px);box-shadow:0 1px 0 #bf360c}',
        '.sr-bar .sr-close{position:absolute;top:6px;right:10px;border:none;background:none;font-size:1.1rem;color:#c0a060;cursor:pointer;padding:4px;line-height:1}',
    ].join('\n');
    document.head.appendChild(css);

    var bar = document.createElement('div');
    bar.id = id;
    bar.className = 'sr-bar';
    bar.innerHTML =
        '<span class="sr-fire">\uD83D\uDD25</span>'
      + '<span class="sr-text">Streak yo\u2018qoladi! '
      + '<span class="sr-streak">' + g.streak + ' kun</span> '
      + '— bugun mashq qiling</span>'
      + '<button class="sr-cta" onclick="_dismissStreakReminder(false)">Mashq qilish</button>'
      + '<button class="sr-close" onclick="_dismissStreakReminder(true)">\u00D7</button>';
    document.body.appendChild(bar);
}

function _dismissStreakReminder(justClose) {
    var el = document.getElementById('streakReminder');
    if (el) {
        el.style.animation = 'none';
        el.style.transition = 'transform .3s ease';
        el.style.transform = 'translateY(100%)';
        setTimeout(function () { el.remove(); }, 300);
    }
    try { localStorage.setItem('uzdarus_streak_dismiss', _todayStr()); } catch {}
    if (!justClose) {
        /* scroll to the first practice button on the page */
        var btn = document.querySelector('[onclick*="checkPronunciation"], [onclick*="playAudio"], .btn-listen, .btn-speak');
        if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

/* ================================================================== */
/*  Pronunciation UI — Duolingo-style (auto-injected)                 */
/* ================================================================== */
const _PRON_OVERLAY_ID = 'pronOverlay';
let _lastPronRef = '';

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
        '.pron-verdict{font-size:.82rem;font-weight:600;padding:8px 16px;border-radius:10px;margin-bottom:16px;display:inline-block}',
        '.pron-verdict.good{background:#e8f5e1;color:#58a700}',
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
    ].join('\n');
    document.head.appendChild(style);

    var overlay = document.createElement('div');
    overlay.className = 'pron-overlay';
    overlay.id = _PRON_OVERLAY_ID;
    overlay.innerHTML = '<div class="pron-card" id="pronCard"></div>';
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closePronResult();
    });
    document.body.appendChild(overlay);
}

/* ---- helpers ---- */
function _sClass(v) { return v >= 85 ? 'good' : v >= 70 ? 'ok' : 'bad'; }

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
}

/* ---- result screen ---- */
function _showPronResult(refText, r) {
    _ensurePronOverlay();
    _lastPronRef = refText;

    var overall = r.pronunciationScore;
    var cls = _sClass(overall);
    var emoji = cls === 'good' ? '\uD83C\uDF1F' : cls === 'ok' ? '\uD83D\uDCAA' : '\uD83D\uDE15';
    var title = cls === 'good' ? 'A\u2018lo!' : cls === 'ok' ? 'Yaxshi!' : 'Qayta urinib ko\u2018ring';

    var c = _ringCircum();
    var offset = c - (overall / 100) * c;

    var bars = [
        { label: 'Aniqlik',     val: r.accuracyScore },
        { label: 'Ravonlik',    val: r.fluencyScore },
        { label: 'To\u2018liqlik', val: r.completenessScore },
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
        html += '<div class="pron-bar-row">'
              + '<div class="pron-bar-label">' + b.label + '</div>'
              + '<div class="pron-bar-track"><div class="pron-bar-fill ' + bc + '" data-w="' + b.val + '"></div></div>'
              + '<div class="pron-bar-num ' + bc + '">' + b.val + '</div>'
              + '</div>';
    }
    html += '</div>';

    /* word chips */
    html += '<div class="pron-words">';
    for (var j = 0; j < r.words.length; j++) {
        var w = r.words[j];
        var wc = _sClass(w.accuracy);
        html += '<div class="pron-chip ' + wc + '" style="animation-delay:' + (j * 0.08) + 's">'
              + w.word + '<span class="pron-chip-score">' + w.accuracy + '</span></div>';
    }
    html += '</div>';

    /* verdict */
    var hasErrors = r.words.some(function (w) { return w.accuracy < 70; });
    if (hasErrors) {
        html += '<div class="pron-verdict bad">Qizil so\u2018zlarni qayta mashq qiling</div>';
    } else if (overall >= 85) {
        html += '<div class="pron-verdict good">\u2714 Zo\u2018r natija!</div>';
    }

    /* XP reward */
    var xpResult = _awardXP(overall);
    if (xpResult.xpGained > 0) {
        var remaining = _xpForNextLevel() - _xpInCurrentLevel(xpResult.totalXp);
        var barPct = Math.round(xpResult.progress * 100);
        html += '<div class="pron-xp-row">';
        html += '<span class="pron-xp-amount">+' + xpResult.xpGained + ' XP</span>';
        html += '<span class="pron-xp-label">Lvl ' + xpResult.level + ' \u2022 ' + remaining + ' XP qoldi</span>';
        if (xpResult.streak > 0) {
            html += '<span class="pron-streak-row">\uD83D\uDD25 ' + xpResult.streak + ' kun</span>';
        }
        html += '</div>';
        setTimeout(function () { _showXpToast(xpResult.xpGained); }, 600);
        if (xpResult.leveledUp) {
            setTimeout(function () { _showLevelUpPopup(xpResult.level); }, 1200);
        }
    }
    _updateStreakBadge();

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

    /* ---- per-word tips (only for problem words, max 3) ---- */
    var weak = result.words
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

    /* ---- fluency tip ---- */
    if (result.fluencyScore < 70) {
        tips.push({
            level: 'bad',
            message: 'Ravonlik past. So\u2018zlar orasida ko\u2018p pauza bor.',
            advice: 'Gapni to\u2018xtovsiz, bir nafasda aytishga harakat qiling.',
        });
    } else if (result.fluencyScore < 85) {
        tips.push({
            level: 'ok',
            message: 'Ravonlik o\u2018rtacha. Bir oz tezroq va silliqroq ayting.',
            advice: 'So\u2018zlarni bir-biriga bog\u2018lang, pauza kamroq bo\u2018lsin.',
        });
    }

    /* ---- completeness tip ---- */
    if (result.completenessScore < 70) {
        tips.push({
            level: 'bad',
            message: 'Ba\u2018zi so\u2018zlar tushib qoldi. Barcha so\u2018zlarni ayting.',
            advice: 'Matnni oldin o\u2018qib chiqing, keyin mikrofonga to\u2018liq ayting.',
        });
    }

    /* ---- overall encouragement ---- */
    if (tips.length === 0 && result.pronunciationScore >= 85) {
        tips.push({
            level: 'good',
            message: 'Ajoyib! Talaffuzingiz juda yaxshi. Shunday davom eting!',
        });
    }

    return tips;
}

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
        return { ru: cw.word, uz: '', topicId: null };
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
