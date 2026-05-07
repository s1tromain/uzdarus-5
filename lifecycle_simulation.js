/* lifecycle_simulation.js — deterministic harness for the Azure recognizer
   pronunciation lifecycle. NOT a scoring test (validation_test.js covers
   that). This harness mirrors the Promise body of
   _runPronunciationAssessment in speech.js with a virtual clock so we can
   inject Azure events at exact timestamps and observe:
     - which callback resolved first
     - which timers were active / cleared / fired / bailed
     - whether stale timers overwrote a successful recognition
     - which reason ultimately won
     - whether lifecycle invariants were violated

   Scoring helpers are loaded directly from production code (no
   reimplementation). The Promise/timer scaffolding is mirrored in this
   file and uses the harness clock instead of real setTimeout. */

import fs from 'fs';

/* ==================================================================
 *  1. Load production scoring + sanitisation helpers verbatim
 * ================================================================== */
const source = fs.readFileSync('paid-courses/speech.js', 'utf8').replace(/\r\n/g, '\n');

function extractFunction(name) {
    const start = source.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`Function not found: ${name}`);
    let depth = 0;
    let sawBrace = false;
    for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (ch === '{') { depth++; sawBrace = true; }
        else if (ch === '}') {
            depth--;
            if (sawBrace && depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error(`Unclosed function: ${name}`);
}

const helperNames = [
    '_clampRange', '_tokenize', '_tokenizeRefWords', '_getWordStats',
    '_getMatchedWordStats', '_getSimilarity', '_normalizeMetric', '_displayMetric',
    '_getWordQuality', '_isSuspiciousAccuracy', '_getSpeechStability',
    '_getSpeechStabilityThreshold', '_getSpeechStabilityPenalty',
    '_getAzureQualityPenalty', '_getNearExactPenalty',
    '_computeMetrics', '_computeFinalMetricScore', '_finalizePronunciationResult',
    '_getPronunciationReason', '_computePronScore', '_getScoreCapPenalty',
    '_getFakeMatchCap', '_getWordFeedback'
];
globalThis.eval(helperNames.map(extractFunction).join('\n\n'));

/* ==================================================================
 *  2. Mocked SpeechSDK enums (only what the lifecycle needs)
 * ================================================================== */
const SpeechSDK = {
    ResultReason: { NoMatch: 0, Canceled: 1, RecognizingSpeech: 2, RecognizedSpeech: 3 },
    CancellationReason: { Error: 1, EndOfStream: 2 }
};

/* ==================================================================
 *  3. Virtual clock — deterministic, single-threaded, ordered
 * ================================================================== */
function createClock() {
    let now = 0;
    let nextId = 1;
    const timers = new Map();
    const log = [];

    return {
        get now() { return now; },
        log,
        push(entry) { log.push({ t: now, ...entry }); },
        setTimeout(fn, delay, label) {
            const id = nextId++;
            timers.set(id, { fireAt: now + delay, fn, delay, label: label || '' });
            log.push({ t: now, ev: 'setTimeout', id, delay, label: label || '' });
            return id;
        },
        clearTimeout(id) {
            if (id == null || !timers.has(id)) return;
            log.push({ t: now, ev: 'clearTimeout', id });
            timers.delete(id);
        },
        activeTimers() {
            return [...timers.entries()].map(([id, t]) => ({ id, fireAt: t.fireAt, label: t.label }));
        },
        advanceTo(target) {
            while (true) {
                let dueId = null;
                let due = null;
                for (const [id, t] of timers) {
                    if (t.fireAt <= target && (!due || t.fireAt < due.fireAt)) {
                        dueId = id;
                        due = t;
                    }
                }
                if (!due) break;
                timers.delete(dueId);
                now = due.fireAt;
                log.push({ t: now, ev: 'fire', id: dueId, label: due.label });
                due.fn();
            }
            if (now < target) now = target;
        }
    };
}

/* ==================================================================
 *  4. Lifecycle (mirror of _runPronunciationAssessment Promise body)
 * ==================================================================
 *  Behaviour mirrored 1:1 from the patched production:
 *    - recognizer.recognizeOnceAsync starts at t=0 (Patch B)
 *    - soft / hard timers arm at t=400ms (after warmup grace)
 *    - silence fallback = 2500ms after last interim (Patch F)
 *    - sessionStopped fallback = 250ms grace
 *    - all timer bodies bail on (finished || gotFinal || resolved)
 *    - buildScoredResult honours isStrongMatch (Patch C)
 *    - extractPronData honours isStrongMatch (Patch C)
 * ================================================================== */
function createLifecycle(referenceText, clock) {
    let finished = false;
    let resolved = false;
    let gotInterim = false;
    let gotFinal = false;
    let lastInterimText = '';
    let timeoutHit = false;
    let result = null;
    let error = null;
    let recognizerStartedAt = null;
    let sessionStartedAt = null;
    const callbackOrder = [];

    let softTimeoutId, hardTimeoutId, silenceTimerId, sessionStoppedFallbackId;

    function logEvent(ev, extra) {
        clock.push({ ev, ...extra });
    }

    /* ---- production-equivalent text utilities ---- */
    function _sanitizeRecognizedText(text) {
        let recognizedText = (text || '').trim();
        if (!recognizedText) return '';
        recognizedText = recognizedText.toLowerCase()
            .replace(/[.,!?;:"'«»()\[\]{}\-—–…]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!recognizedText) return '';
        let tokens = recognizedText.split(' ');

        const n = tokens.length;
        for (let size = 1; size <= Math.floor(n / 2); size++) {
            if (n % size !== 0) continue;
            const chunk = tokens.slice(0, size).join(' ');
            let isRepeat = true;
            for (let k = size; k < n; k += size) {
                if (tokens.slice(k, k + size).join(' ') !== chunk) { isRepeat = false; break; }
            }
            if (isRepeat) { tokens = tokens.slice(0, size); break; }
        }
        const dedup = [];
        for (let i = 0; i < tokens.length; i++) {
            if (i === 0 || tokens[i] !== tokens[i - 1]) dedup.push(tokens[i]);
        }
        return dedup.join(' ');
    }

    function _getSafeInterimText() {
        if (lastInterimText && lastInterimText.length < 2) lastInterimText = '';
        return lastInterimText;
    }

    function _isRealEmptyRecognizedText(text) {
        return !text || !String(text).trim() || String(text).trim().length < 2;
    }

    function buildZeroResult(text, reason) {
        return {
            recognizedText: '',
            pronunciationScore: 0,
            finalScore: 0,
            accuracyScore: null,
            fluencyScore: null,
            completenessScore: 0,
            aniqlik: 0, ravonlik: 0, toliqlik: 0,
            words: [], wordFeedback: [],
            reason: reason || 'no_speech'
        };
    }

    function buildScoredResult(text, accuracy, fluency, completeness, overrides) {
        const recognizedText = _sanitizeRecognizedText(text);
        if (!recognizedText) {
            return buildZeroResult('', (overrides && overrides.reason) || 'no_speech');
        }
        const stats = _getWordStats(recognizedText, referenceText);
        let normalizedCompleteness = completeness;
        if (normalizedCompleteness == null || !Number.isFinite(Number(normalizedCompleteness))) {
            normalizedCompleteness = Math.round((stats.partialRatio || 0) * 100);
        } else {
            normalizedCompleteness = Math.round(Number(normalizedCompleteness));
        }
        const isStrongMatch = stats.partialRatio >= 0.9 && stats.exactRatio >= 0.75;
        const capPenalty = isStrongMatch
            ? undefined
            : _getScoreCapPenalty(recognizedText, referenceText, accuracy, fluency, 40);
        const score = _computePronScore(recognizedText, referenceText, accuracy, fluency, normalizedCompleteness, capPenalty);

        let defaultReason;
        if (score <= 0) defaultReason = 'wrong_word';
        else if (isStrongMatch) defaultReason = _getPronunciationReason(score);
        else defaultReason = 'unclear_speech';

        const r = {
            recognizedText,
            accuracyScore: accuracy === undefined ? null : accuracy,
            fluencyScore: fluency === undefined ? null : fluency,
            completenessScore: normalizedCompleteness,
            reason: defaultReason,
            words: [],
            wordFeedback: _getWordFeedback(recognizedText, referenceText),
            __extraPenalty: capPenalty
        };
        if (overrides) {
            for (const k of Object.keys(overrides)) r[k] = overrides[k];
            if (isStrongMatch && (r.reason === 'unclear_speech' || r.reason === 'bad_pronunciation')) {
                r.reason = _getPronunciationReason(score);
            }
        }
        const fin = _finalizePronunciationResult(r, referenceText);
        if (isStrongMatch && fin.reason !== 'fake_match' && fin.reason !== 'wrong_word'
            && (Number(fin.finalScore) || 0) < 40) {
            fin.finalScore = 40;
            fin.pronunciationScore = 40;
            if (fin.reason === 'bad') fin.reason = 'almost';
        }
        return fin;
    }

    /* Simplified extractPronData — only the lifecycle-relevant bits.
       Ignores Azure echo/fake_match guard (handled by validation_test.js). */
    function extractPronData(raw) {
        const recognizedText = _sanitizeRecognizedText(raw.text || '');
        if (_isRealEmptyRecognizedText(recognizedText)) {
            return buildScoredResult(recognizedText, null, null, null, {
                reason: 'no_speech', words: [], wordFeedback: [], error: true
            });
        }
        const stats = _getWordStats(recognizedText, referenceText);
        const isExact = recognizedText === referenceText.trim().toLowerCase();
        const isStrongMatch = stats.partialRatio >= 0.9 && stats.exactRatio >= 0.75;
        const words = raw.words || [];
        const quality = _getWordQuality(words);
        const rawAccuracy = _normalizeMetric(raw.accuracy);
        const rawFluency = _normalizeMetric(raw.fluency);
        const completeness = Math.round(stats.partialRatio * 100);
        let forcedReason = null;
        let qualityPenalty = 1;
        let azureCapPenalty = 1;

        if (quality.avg !== null && quality.avg < 70) {
            qualityPenalty = _getAzureQualityPenalty(quality.avg, false);
            if (quality.avg < 60 && !forcedReason && !isStrongMatch) forcedReason = 'bad_pronunciation';
        }
        if (!isExact && stats.partialRatio >= 0.72 && quality.avg !== null && quality.avg < 67) {
            azureCapPenalty = _getNearExactPenalty(stats.partialRatio, quality.avg);
            if (!forcedReason && !isStrongMatch) forcedReason = 'bad_pronunciation';
        }
        if (!forcedReason && stats.refLength > 0 && stats.partialRatio < 0.3) forcedReason = 'wrong_word';

        const azureSignal = Math.min(qualityPenalty, azureCapPenalty);
        const extraPenalty = azureSignal < 1 ? azureSignal : undefined;
        const score = _computePronScore(recognizedText, referenceText, rawAccuracy, rawFluency, completeness, extraPenalty);

        const finalized = _finalizePronunciationResult({
            recognizedText,
            accuracyScore: rawAccuracy,
            fluencyScore: rawFluency,
            completenessScore: completeness,
            reason: forcedReason || _getPronunciationReason(score),
            words,
            wordFeedback: _getWordFeedback(recognizedText, referenceText),
            __extraPenalty: extraPenalty
        }, referenceText);

        if (isStrongMatch && finalized.reason !== 'fake_match') {
            if (finalized.reason === 'bad_pronunciation' || finalized.reason === 'unclear_speech') {
                finalized.reason = _getPronunciationReason(Number(finalized.finalScore) || 0);
            }
            if ((Number(finalized.finalScore) || 0) < 40) {
                finalized.finalScore = 40;
                finalized.pronunciationScore = 40;
                if (finalized.reason === 'bad') finalized.reason = 'almost';
            }
        }
        return finalized;
    }

    /* ---- finishSafe / resolveOnce / rejectOnce ---- */
    function finishSafe(fn) {
        if (finished) return;
        finished = true;
        clock.clearTimeout(softTimeoutId);
        clock.clearTimeout(hardTimeoutId);
        clock.clearTimeout(silenceTimerId);
        clock.clearTimeout(sessionStoppedFallbackId);
        fn();
    }
    function resolveOnce(value) {
        if (resolved) {
            logEvent('resolve_IGNORED', {
                stale_reason: value && value.reason,
                stale_score: value && value.finalScore
            });
            return;
        }
        resolved = true;
        finishSafe(() => {
            result = value;
            logEvent('RESOLVED', {
                reason: value && value.reason,
                score: value && value.finalScore,
                text: value && value.recognizedText
            });
        });
    }
    function rejectOnce(err) {
        if (resolved) {
            logEvent('reject_IGNORED', { stale_err: err && err.message });
            return;
        }
        resolved = true;
        finishSafe(() => {
            error = err;
            logEvent('REJECTED', { err: err.message });
        });
    }

    /* ---- silence fallback (Patch F: 2500ms) ---- */
    function scheduleSilenceFallback() {
        clock.clearTimeout(silenceTimerId);
        if (finished || gotFinal || !gotInterim) return;
        silenceTimerId = clock.setTimeout(() => {
            if (finished || gotFinal || resolved || !gotInterim) {
                logEvent('silence_fallback_BAILED', { finished, gotFinal, resolved, gotInterim });
                return;
            }
            logEvent('silence_fallback_FIRE', { interim: lastInterimText });
            resolveOnce(buildScoredResult(_getSafeInterimText(), null, null, null, {
                reason: 'unclear_speech', words: []
            }));
        }, 2500, 'silence_fallback');
    }

    /* ---- soft / hard timers (after 400ms warmup grace, Patch B) ---- */
    function startTimersAfterWarmup() {
        softTimeoutId = clock.setTimeout(() => {
            if (finished || gotFinal || resolved) {
                logEvent('soft_timeout_BAILED', { finished, gotFinal, resolved });
                return;
            }
            timeoutHit = true;
            if (gotInterim) {
                logEvent('soft_timeout_FIRE_with_interim', {});
                resolveOnce(buildScoredResult(
                    _sanitizeRecognizedText(_getSafeInterimText() || ''),
                    null, null, null,
                    { reason: 'unclear_speech', words: [] }
                ));
                return;
            }
            logEvent('soft_timeout_warn_only', {});
        }, 15000, 'soft_timeout');

        hardTimeoutId = clock.setTimeout(() => {
            if (finished || resolved) {
                logEvent('hard_timeout_BAILED', { finished, resolved });
                return;
            }
            if (gotInterim || gotFinal) {
                logEvent('hard_timeout_extending', {});
                hardTimeoutId = clock.setTimeout(() => {
                    if (finished || resolved) return;
                    logEvent('ultimate_timeout_FIRE', {});
                    resolveOnce(buildZeroResult(_getSafeInterimText()));
                }, 15000, 'ultimate_timeout');
                return;
            }
            logEvent('hard_timeout_FIRE_no_speech', {});
            const e = new Error('Audio olinmadi. Mikrofon sozlamalarini tekshiring.');
            rejectOnce(e);
        }, 30000, 'hard_timeout');
    }

    /* ---- public API ---- */
    return {
        start() {
            recognizerStartedAt = clock.now;
            logEvent('recognizer_recognizeOnceAsync_started', { t: clock.now });
            clock.setTimeout(() => {
                if (finished) return;
                logEvent('warmup_grace_elapsed_arming_timers', {});
                startTimersAfterWarmup();
            }, 400, 'warmup_grace');
        },
        sessionStarted() {
            sessionStartedAt = clock.now;
            callbackOrder.push('sessionStarted');
            logEvent('event_sessionStarted', {});
        },
        recognizing(text) {
            callbackOrder.push('recognizing');
            logEvent('event_recognizing', { text });
            if (finished) {
                logEvent('recognizing_after_finished_DROPPED', {});
                return;
            }
            if (recognizerStartedAt === null) {
                logEvent('recognizing_before_recognizer_started_DROPPED', {});
                return;
            }
            if (text) {
                gotInterim = true;
                lastInterimText = text.trim();
                clock.clearTimeout(sessionStoppedFallbackId);
                scheduleSilenceFallback();
            }
        },
        recognized(raw) {
            /* Production sets gotFinal=true BEFORE the finished check. */
            gotFinal = true;
            callbackOrder.push('recognized');
            logEvent('event_recognized', {
                reason: raw && raw.reason,
                text: raw && raw.text
            });
            if (finished) {
                logEvent('recognized_after_finished_DROPPED', {});
                return;
            }
            if (!raw) {
                resolveOnce(buildZeroResult(_getSafeInterimText()));
                return;
            }
            const reason = raw.reason;
            if (reason === SpeechSDK.ResultReason.RecognizedSpeech) {
                const data = extractPronData(raw);
                if (data) resolveOnce(data);
                else if (gotInterim) resolveOnce(buildZeroResult(_getSafeInterimText()));
                else { const e = new Error('Ovoz aniqlanmadi'); e.noSpeech = true; rejectOnce(e); }
            } else if (reason === SpeechSDK.ResultReason.NoMatch) {
                if (gotInterim) {
                    resolveOnce(buildScoredResult(_getSafeInterimText(), null, null, null, {
                        reason: 'unclear_speech', words: []
                    }));
                } else {
                    const e = new Error('Ovoz aniqlanmadi'); e.noSpeech = true; rejectOnce(e);
                }
            } else {
                if (gotInterim) resolveOnce(buildZeroResult(_getSafeInterimText()));
                else rejectOnce(new Error('Xatolik yuz berdi'));
            }
        },
        sessionStopped() {
            callbackOrder.push('sessionStopped');
            logEvent('event_sessionStopped', {});
            if (finished || gotFinal || resolved) return;
            clock.clearTimeout(sessionStoppedFallbackId);
            sessionStoppedFallbackId = clock.setTimeout(() => {
                if (finished || gotFinal || resolved) {
                    logEvent('sessionStopped_fallback_BAILED', { finished, gotFinal, resolved });
                    return;
                }
                logEvent('sessionStopped_fallback_FIRE', { gotInterim });
                if (gotInterim) {
                    resolveOnce(buildScoredResult(_getSafeInterimText(), null, null, null, {
                        reason: 'unclear_speech', words: []
                    }));
                    return;
                }
                resolveOnce(buildZeroResult('', 'no_speech'));
            }, 250, 'sessionStopped_fallback');
        },
        canceled(e) {
            callbackOrder.push('canceled');
            logEvent('event_canceled', { reason: e && e.reason });
            if (finished) return;
            if (gotInterim || gotFinal) {
                resolveOnce(buildZeroResult(_getSafeInterimText()));
                return;
            }
            if (e && e.reason === SpeechSDK.CancellationReason.Error) {
                rejectOnce(new Error((e && e.errorDetails) || 'Xatolik'));
                return;
            }
            resolveOnce(buildZeroResult(_getSafeInterimText()));
        },
        getResult() { return { result, error }; },
        getState() {
            return {
                finished, resolved, gotInterim, gotFinal, timeoutHit,
                recognizerStartedAt, sessionStartedAt, callbackOrder
            };
        }
    };
}

/* ==================================================================
 *  5. Scenario runner
 * ================================================================== */
function fmtJson(v) {
    if (v === undefined) return 'undefined';
    return JSON.stringify(v);
}

function runScenario(sc) {
    console.log('\n' + '='.repeat(72));
    console.log(`SCENARIO: ${sc.name}`);
    console.log(`Reference: ${JSON.stringify(sc.referenceText)}`);
    console.log('='.repeat(72));

    const clock = createClock();
    const lc = createLifecycle(sc.referenceText, clock);
    lc.start();

    for (const evt of sc.events) {
        const [t, ev, payload] = evt;
        clock.advanceTo(t);
        const fn = lc[ev];
        if (typeof fn !== 'function') {
            clock.push({ ev: 'UNKNOWN_EVENT', name: ev });
            continue;
        }
        fn(payload);
    }

    /* drain any remaining timers up to T_END */
    const tEnd = sc.tEnd != null ? sc.tEnd : 60000;
    clock.advanceTo(tEnd);

    /* ---- log dump ---- */
    console.log('\n--- Event log (chronological) ---');
    for (const entry of clock.log) {
        const { t, ev, ...rest } = entry;
        const restStr = Object.keys(rest).length ? '  ' + fmtJson(rest) : '';
        console.log(`t=${String(t).padStart(6)}ms  ${ev}${restStr}`);
    }

    const { result, error } = lc.getResult();
    const state = lc.getState();

    console.log('\n--- Final state ---');
    console.log(`callback order        : ${state.callbackOrder.join(' → ') || '(none)'}`);
    console.log(`recognizer started at : ${state.recognizerStartedAt}ms`);
    console.log(`sessionStarted at     : ${state.sessionStartedAt}ms`);
    console.log(`finished/resolved     : ${state.finished}/${state.resolved}`);
    console.log(`gotInterim/gotFinal   : ${state.gotInterim}/${state.gotFinal}`);
    console.log(`timeoutHit            : ${state.timeoutHit}`);
    const remaining = clock.activeTimers();
    console.log(`active timers at end  : ${remaining.length === 0 ? '(none)' : fmtJson(remaining)}`);

    if (result) {
        console.log(`final reason          : ${result.reason}`);
        console.log(`final score           : ${result.finalScore}`);
        console.log(`recognizedText        : ${JSON.stringify(result.recognizedText)}`);
    } else if (error) {
        console.log(`rejected with error   : ${error.message}`);
    } else {
        console.log('NO RESOLUTION — lifecycle stuck.');
    }

    /* ---- stale callbacks ---- */
    const stale = clock.log.filter(e =>
        e.ev === 'resolve_IGNORED' || e.ev === 'reject_IGNORED'
        || e.ev === 'recognized_after_finished_DROPPED'
        || e.ev === 'recognizing_after_finished_DROPPED'
    );
    console.log(`stale callbacks       : ${stale.length === 0 ? '0 (none observed)' : stale.length}`);

    /* ---- invariants ---- */
    console.log('\n--- Invariants ---');
    let allOk = true;
    const checks = [];

    if (sc.expect) {
        for (const [field, expected] of Object.entries(sc.expect)) {
            let actual, ok;
            if (field === 'reason')          { actual = result && result.reason;          ok = actual === expected; }
            else if (field === 'rejected')   { actual = !!error;                          ok = actual === expected; }
            else if (field === 'minScore')   { actual = (result && result.finalScore) || 0; ok = actual >= expected; }
            else if (field === 'maxScore')   { actual = (result && result.finalScore) || 0; ok = actual <= expected; }
            else if (field === 'recognizedText') { actual = result && result.recognizedText; ok = actual === expected; }
            else                             { actual = '<?>'; ok = false; }
            checks.push({ ok, msg: `${field} expected ${fmtJson(expected)}, got ${fmtJson(actual)}` });
        }
    }
    if (sc.forbidReason && result) {
        for (const f of sc.forbidReason) {
            checks.push({ ok: result.reason !== f, msg: `reason !== ${f} (got ${result.reason})` });
        }
    }
    if (sc.expectStaleIgnored) {
        const ok = stale.length >= sc.expectStaleIgnored;
        checks.push({
            ok,
            msg: `at least ${sc.expectStaleIgnored} stale callback(s) ignored (saw ${stale.length})`
        });
    }
    if (sc.expectRecognizerStartedBefore != null) {
        const ok = state.recognizerStartedAt !== null && state.recognizerStartedAt < sc.expectRecognizerStartedBefore;
        checks.push({
            ok,
            msg: `recognizer started before t=${sc.expectRecognizerStartedBefore}ms (was ${state.recognizerStartedAt}ms)`
        });
    }

    if (checks.length === 0) {
        console.log('(no invariants declared — observational scenario)');
    } else {
        for (const c of checks) {
            console.log(`${c.ok ? '✓' : '✗'} ${c.msg}`);
            if (!c.ok) allOk = false;
        }
    }
    return allOk;
}

/* ==================================================================
 *  6. Scenarios — covering every required lifecycle case
 * ================================================================== */
const scenarios = [

    /* ---------- 1. User speaks immediately ---------- */
    {
        name: '1. User speaks immediately after click (before sessionStarted)',
        referenceText: 'у меня есть кот',
        /* Production timeline (post-Patch B):
             t=0      click → recognizer.recognizeOnceAsync()
             t=200    sessionStarted
             t=300    user's first interim already captured
             t=1200   recognized event with full transcript
           Pre-patch the user spoke 0–700ms into a dead pipeline. */
        events: [
            [200,  'sessionStarted'],
            [300,  'recognizing', 'у меня'],
            [600,  'recognizing', 'у меня есть'],
            [900,  'recognizing', 'у меня есть кот'],
            [1200, 'recognized', {
                reason: SpeechSDK.ResultReason.RecognizedSpeech,
                text: 'у меня есть кот',
                accuracy: 92, fluency: 90,
                words: [
                    { word: 'у',    accuracy: 90 },
                    { word: 'меня', accuracy: 92 },
                    { word: 'есть', accuracy: 88 },
                    { word: 'кот',  accuracy: 90 }
                ]
            }]
        ],
        expectRecognizerStartedBefore: 100,
        expect: { rejected: false }
    },

    /* ---------- 2. recognized AFTER silence fallback fired ---------- */
    {
        name: '2. recognized arrives AFTER silence fallback (stale-overwrite race)',
        referenceText: 'я люблю молоко',
        /* Last interim at t=1100 → silence fires at 1100+2500=3600ms
           recognized arrives at 4000ms → must be IGNORED (stale).
           With strong-match (full text) buildScoredResult yields score-based
           reason — never unclear_speech. */
        events: [
            [200,  'sessionStarted'],
            [500,  'recognizing', 'я'],
            [800,  'recognizing', 'я люблю'],
            [1100, 'recognizing', 'я люблю молоко'],
            [4000, 'recognized', {
                reason: SpeechSDK.ResultReason.RecognizedSpeech,
                text: 'я люблю молоко',
                accuracy: 90, fluency: 90,
                words: [
                    { word: 'я',      accuracy: 90 },
                    { word: 'люблю',  accuracy: 90 },
                    { word: 'молоко', accuracy: 90 }
                ]
            }]
        ],
        forbidReason: ['unclear_speech', 'bad_pronunciation'],
        expectStaleIgnored: 1
    },

    /* ---------- 3. Below-strong partial match ---------- */
    {
        name: '3. partialRatio≈0.82 exactRatio≈0.72 — must NEVER be unclear_speech',
        /* 11-token reference, recognised text matches 9 in same positions.
           partialRatio = 9/11 ≈ 0.818, exactRatio = 9/11 ≈ 0.818.
           (Discrete token math; exact 0.82/0.72 split isn't natural —
           any near-strong but below-threshold match must still avoid the
           'unclear_speech' / 'bad_pronunciation' verdict.) */
        referenceText: 'один два три четыре пять шесть семь восемь девять десять одиннадцать',
        events: [
            [200, 'sessionStarted'],
            [600, 'recognizing', 'один два три четыре пять шесть семь восемь шум'],
            [1500, 'recognized', {
                reason: SpeechSDK.ResultReason.RecognizedSpeech,
                text: 'один два три четыре пять шесть семь восемь шум десять одиннадцать',
                accuracy: 78, fluency: 75,
                words: Array.from({ length: 11 }, (_, i) => ({ word: 'w' + i, accuracy: 78 }))
            }]
        ],
        forbidReason: ['unclear_speech']
    },

    /* ---------- 4. No speech ---------- */
    {
        name: '4. No speech at all — must produce no_speech (rejected or no_speech reason)',
        referenceText: 'привет',
        /* Hard timeout fires at 30400ms (after 400ms warmup grace) with no
           speech. Production rejects with 'Audio olinmadi'. The result
           class for the user (handled in checkPronunciation) maps that to
           the no_speech UX. */
        events: [
            [200, 'sessionStarted']
            /* no recognizing or recognized events */
        ],
        tEnd: 35000,
        expect: { rejected: true }
    },

    /* ---------- 5. Wrong phrase ---------- */
    {
        name: '5. Wrong phrase — must produce wrong_word',
        referenceText: 'я люблю кофе',
        events: [
            [200, 'sessionStarted'],
            [500, 'recognizing', 'банан зеленый'],
            [1000, 'recognized', {
                reason: SpeechSDK.ResultReason.RecognizedSpeech,
                text: 'банан зеленый дом',
                accuracy: 60, fluency: 60,
                words: [
                    { word: 'банан',   accuracy: 60 },
                    { word: 'зеленый', accuracy: 60 },
                    { word: 'дом',     accuracy: 60 }
                ]
            }]
        ],
        expect: { reason: 'wrong_word' }
    },

    /* ---------- 6. recognized AFTER soft timeout ---------- */
    {
        name: '6. recognized arrives AFTER soft timeout — must be ignored safely',
        referenceText: 'хорошо',
        /* Soft timeout arms at t=400 (warmup grace) with 15000ms delay →
           fires at 15400ms. With gotInterim it forces a scored resolve.
           Late recognized at 16000ms must hit resolve_IGNORED. */
        events: [
            [200,   'sessionStarted'],
            [500,   'recognizing', 'хорошо'],
            [16000, 'recognized', {
                reason: SpeechSDK.ResultReason.RecognizedSpeech,
                text: 'хорошо',
                accuracy: 90, fluency: 90,
                words: [{ word: 'хорошо', accuracy: 90 }]
            }]
        ],
        tEnd: 20000,
        forbidReason: ['unclear_speech'],
        expectStaleIgnored: 1
    },

    /* ---------- 7. recognizing only — no recognized ---------- */
    {
        name: '7. recognizing emits text, recognized never arrives (silence path)',
        referenceText: 'я устал',
        events: [
            [200, 'sessionStarted'],
            [500, 'recognizing', 'я устал']
            /* no recognized → silence fallback at 500+2500=3000ms */
        ],
        forbidReason: ['unclear_speech']
    },

    /* ---------- 8. Azure delayed finalization (2.4s) ---------- */
    {
        name: '8. Azure delayed finalization — recognized 2.4s after speech end',
        referenceText: 'до свидания',
        /* Last interim at t=800 → silence fallback would fire at 3300ms
           (Patch F). recognized arrives at 3200ms — beats silence by 100ms.
           Pre-Patch F (1800ms) silence would fire at 2600ms and lose the
           real result. */
        events: [
            [200,  'sessionStarted'],
            [500,  'recognizing', 'до'],
            [800,  'recognizing', 'до свидания'],
            [3200, 'recognized', {
                reason: SpeechSDK.ResultReason.RecognizedSpeech,
                text: 'до свидания',
                accuracy: 88, fluency: 88,
                words: [
                    { word: 'до',       accuracy: 88 },
                    { word: 'свидания', accuracy: 88 }
                ]
            }]
        ],
        expect: { rejected: false }
    },

    /* ---------- 9. Rapid retries — overlapping callbacks ---------- */
    {
        name: '9. Rapid retries — multiple late callbacks must all be ignored',
        referenceText: 'спасибо',
        events: [
            [200, 'sessionStarted'],
            [500, 'recognizing', 'спасибо'],
            [800, 'recognized', {
                reason: SpeechSDK.ResultReason.RecognizedSpeech,
                text: 'спасибо',
                accuracy: 95, fluency: 95,
                words: [{ word: 'спасибо', accuracy: 95 }]
            }],
            /* All three of these arrive after the lifecycle finished — they
               must each be ignored, never overwriting the original result. */
            [900,  'recognized', {
                reason: SpeechSDK.ResultReason.RecognizedSpeech,
                text: 'спасибо опять',
                accuracy: 80, fluency: 80, words: []
            }],
            [1000, 'sessionStopped'],
            [1200, 'canceled', { reason: SpeechSDK.CancellationReason.EndOfStream }]
        ],
        expect: { rejected: false },
        expectStaleIgnored: 1
    },

    /* ---------- 10. Duplicate interim text ---------- */
    {
        name: '10. Duplicate interim "у меня есть у меня есть" — must dedup to "у меня есть"',
        referenceText: 'у меня есть',
        events: [
            [200,  'sessionStarted'],
            [500,  'recognizing', 'у меня'],
            [700,  'recognizing', 'у меня есть'],
            [900,  'recognizing', 'у меня есть у меня есть'],
            [1200, 'recognized', {
                reason: SpeechSDK.ResultReason.RecognizedSpeech,
                text: 'у меня есть у меня есть',
                accuracy: 88, fluency: 85,
                words: [
                    { word: 'у',    accuracy: 88 },
                    { word: 'меня', accuracy: 88 },
                    { word: 'есть', accuracy: 88 }
                ]
            }]
        ],
        expect: { recognizedText: 'у меня есть' }
    }

];

/* ==================================================================
 *  7. Run all scenarios
 * ================================================================== */
let pass = 0;
let observational = 0;
const failed = [];
for (const sc of scenarios) {
    const ok = runScenario(sc);
    const hasInvariants = (sc.expect && Object.keys(sc.expect).length)
        || (sc.forbidReason && sc.forbidReason.length)
        || sc.expectStaleIgnored != null
        || sc.expectRecognizerStartedBefore != null;
    if (!hasInvariants) observational++;
    else if (ok) pass++;
    else failed.push(sc.name);
}

console.log('\n' + '='.repeat(72));
const checked = scenarios.length - observational;
console.log(`SUMMARY: ${pass}/${checked} scenarios passed (${observational} observational)`);
if (failed.length) {
    console.log('FAILED:');
    for (const name of failed) console.log('  - ' + name);
}
process.exitCode = failed.length === 0 ? 0 : 1;
