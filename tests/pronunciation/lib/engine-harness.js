/**
 * engine-harness.js
 * ------------------------------------------------------------------
 * Loads the REAL production pronunciation engine (paid-courses/speech.js)
 * inside a stubbed browser sandbox so the validation suite grades speech
 * through the exact code that runs for learners — not a re-implementation.
 *
 * The engine is a classic browser script (no exports) that declares its
 * functions at top level. Running it in a Node `vm` context makes those
 * top-level `function` declarations properties of the sandbox global, so
 * we can call `_finalizePronunciationResult`, `_classifyWords`, etc.
 *
 * grade() mirrors the production `extractPronData` tail exactly: it applies
 * the same fake-echo anti-cheat guard and then funnels through
 * `_finalizePronunciationResult`, which is the single grading entry point.
 *
 * loadEngine({ overrides }) can patch the engine's scalar threshold
 * constants before loading — this is what the threshold-sweep tool uses to
 * measure the false-positive / false-negative trade-off at different
 * settings against real Azure outputs.
 */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SPEECH_JS_PATH = path.resolve(__dirname, '../../../paid-courses/speech.js');

/** Scalar engine constants that may be overridden for sensitivity analysis. */
export const TUNABLE_CONSTANTS = [
    'SPEECH_STAR5_MIN',
    'SPEECH_STAR4_MIN',
    'SPEECH_STAR3_MIN',
    'SPEECH_STAR2_MIN',
    'SPEECH_PASS_SCORE',
    'SPEECH_CONF_MIN',
];

function applyOverrides(src, overrides) {
    let out = src;
    for (const [name, value] of Object.entries(overrides || {})) {
        if (!TUNABLE_CONSTANTS.includes(name)) {
            throw new Error(`Unknown tunable constant: ${name}`);
        }
        const re = new RegExp(`(var ${name}\\s*=\\s*)([0-9.]+)(\\s*;)`);
        if (!re.test(out)) throw new Error(`Constant ${name} not found in engine source`);
        out = out.replace(re, `$1${value}$3`);
    }
    return out;
}

function makeSandbox() {
    const noop = () => {};
    const el = new Proxy({}, { get: () => noop, set: () => true });
    const sandbox = {
        window: { location: { pathname: '/paid-courses/a2-vocabulary.html' }, addEventListener: noop },
        document: {
            readyState: 'loading', // defer all DOM init / SDK preload
            addEventListener: noop, removeEventListener: noop,
            getElementById: () => null, querySelector: () => null,
            querySelectorAll: () => [], createElement: () => el,
            head: el, body: { classList: { add: noop, remove: noop } },
        },
        navigator: { userAgent: 'node-validation', mediaDevices: {} },
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        location: { pathname: '/paid-courses/a2-vocabulary.html' },
        setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
        console: { log: noop, warn: noop, error: noop, debug: noop, info: noop },
        fetch: () => Promise.resolve({ status: 200 }),
        Audio: function () { return el; },
    };
    sandbox.self = sandbox;
    sandbox.globalThis = sandbox;
    return sandbox;
}

/**
 * Load the engine (optionally with patched constants).
 * @returns {{ grade, gradeRaw, constants, sandbox, referenceVariants, normalize }}
 */
export function loadEngine({ overrides } = {}) {
    let src = fs.readFileSync(SPEECH_JS_PATH, 'utf8');
    if (overrides) src = applyOverrides(src, overrides);
    const sandbox = makeSandbox();
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);

    const constants = {};
    for (const name of TUNABLE_CONSTANTS) constants[name] = sandbox[name];

    /**
     * Grade one attempt exactly as production does.
     * @param {object} attempt
     * @param {string} attempt.referenceText - expected word/phrase
     * @param {string} attempt.recognizedText - Azure DisplayText / NBest[0].Display
     * @param {object} attempt.azure - { accuracy, fluency, completeness, confidence } (0..100, conf 0..1)
     * @param {Array}  [attempt.words] - Azure per-word [{word, accuracy, error}]
     * @returns {object} the finalized result (verdict, stars, finalScore, pass, ...)
     */
    function grade(attempt) {
        const rec = String(attempt.recognizedText || '');
        const ref = String(attempt.referenceText || '');
        const az = attempt.azure || {};
        const words = Array.isArray(attempt.words) ? attempt.words : [];
        const acc = sandbox._numOrNull(az.accuracy);
        const flu = sandbox._numOrNull(az.fluency);
        const comp = sandbox._numOrNull(az.completeness);
        const conf = sandbox._numOrNull(az.confidence);

        // --- replicate production extractPronData fake-echo guard ---
        let reason;
        if (rec.trim()) {
            const quality = sandbox._getWordQuality(words);
            const echoCheck = sandbox._classifyWords(rec, ref);
            const perfectEcho = echoCheck.total > 0
                && echoCheck.counts.green === echoCheck.total
                && echoCheck.extraWords === 0;
            const fakeEcho = perfectEcho
                && acc !== null && flu !== null
                && (acc < 50 || flu < 45 || (quality.avg !== null && quality.avg < 50));
            if (fakeEcho) reason = 'fake_match';
        }

        return sandbox._finalizePronunciationResult({
            recognizedText: rec,
            accuracyScore: acc,
            fluencyScore: flu,
            completenessScore: comp,
            confidence: conf,
            words,
            reason,
        }, ref);
    }

    return {
        grade,
        constants,
        sandbox,
        referenceVariants: (raw) => sandbox._referenceVariants(raw),
        normalize: (s) => sandbox._normalizeSpeechText(s),
    };
}
