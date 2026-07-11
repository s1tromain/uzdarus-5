/**
 * scenarios.js
 * ------------------------------------------------------------------
 * The labeled validation corpus for the pronunciation engine.
 *
 * A "scenario" is one graded attempt with GROUND TRUTH attached:
 *   {
 *     id, label, speaker,
 *     referenceText, recognizedText,
 *     azure: { accuracy, fluency, completeness, confidence },
 *     words?: [{ word, accuracy, error }],
 *     groundTruth: 'legit' | 'illegit',   // derived from label
 *     expectPass: boolean                  // should the engine advance?
 *   }
 *
 * `groundTruth` drives the false-positive / false-negative measurement:
 *   - legit   -> a correct attempt the engine MUST accept (FN if it fails)
 *   - illegit -> a bad attempt the engine MUST reject   (FP if it passes)
 *
 * getSyntheticScenarios() returns a broad synthetic corpus with realistic
 * Azure outputs per category. loadRealFixtures() merges recordings captured
 * from real native/learner speakers (see fixtures/real/README.md).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REAL_FIXTURES_DIR = path.resolve(__dirname, '../fixtures/real');

/** label -> ground-truth semantics. Single source of truth. */
export const LABELS = {
    'correct':             { groundTruth: 'legit',   expectPass: true },
    'slight-mistake':      { groundTruth: 'legit',   expectPass: true },
    'strong-accent':       { groundTruth: 'legit',   expectPass: true },
    'wrong-stress':        { groundTruth: 'legit',   expectPass: true },
    'multiform':           { groundTruth: 'legit',   expectPass: true },
    'wrong-russian':       { groundTruth: 'illegit', expectPass: false },
    'uzbek-word':          { groundTruth: 'illegit', expectPass: false },
    'english-word':        { groundTruth: 'illegit', expectPass: false },
    'silence':             { groundTruth: 'illegit', expectPass: false },
    'mic-noise':           { groundTruth: 'illegit', expectPass: false },
    'incomplete':          { groundTruth: 'illegit', expectPass: false },
    'wrong-ending':        { groundTruth: 'illegit', expectPass: false },
    'partial-phrase':      { groundTruth: 'illegit', expectPass: false },
    'low-confidence':      { groundTruth: 'illegit', expectPass: false },
    'transcript-mismatch': { groundTruth: 'illegit', expectPass: false },
    'random-echo':         { groundTruth: 'illegit', expectPass: false },
};

let _seq = 0;
function mk(label, { rec, ref, acc = null, flu = null, comp = null, conf = null, words, speaker = 'synthetic', expectPass }) {
    const meta = LABELS[label];
    if (!meta) throw new Error(`Unknown label: ${label}`);
    return {
        id: `${label}-${String(++_seq).padStart(3, '0')}`,
        label,
        speaker,
        referenceText: ref,
        recognizedText: rec,
        azure: { accuracy: acc, fluency: flu, completeness: comp, confidence: conf },
        words,
        groundTruth: meta.groundTruth,
        // expectPass may be overridden per-case (drives FP/FN). Default: label.
        expectPass: typeof expectPass === 'boolean' ? expectPass : meta.expectPass,
    };
}

const SINGLES = ['делать', 'девочка', 'работать', 'хорошо', 'спасибо'];
const PHRASES = ['у меня есть время', 'как тебя зовут', 'я не согласен'];

export function getSyntheticScenarios() {
    _seq = 0;
    const S = [];

    // 1) CORRECT — right word, good audio (accuracy sweep)
    for (const ref of SINGLES)
        for (const acc of [66, 74, 82, 90, 96])
            S.push(mk('correct', { rec: ref, ref, acc, flu: Math.max(58, acc - 8), comp: 100, conf: 0.9 }));

    // 2) CORRECT PHRASE
    for (const ref of PHRASES)
        for (const acc of [80, 90, 97])
            S.push(mk('correct', { rec: ref, ref, acc, flu: acc - 6, comp: 100, conf: 0.92 }));

    // 3) SLIGHT MISTAKE — correct word, minor phoneme issues (acc 76–88)
    for (const ref of SINGLES)
        for (const acc of [76, 82, 88])
            S.push(mk('slight-mistake', { rec: ref, ref, acc, flu: acc - 10, comp: 100, conf: 0.86 }));

    // 4) STRONG ACCENT — correct word, understandable accent (acc 60–70)
    for (const ref of SINGLES)
        for (const acc of [60, 64, 70])
            S.push(mk('strong-accent', { rec: ref, ref, acc, flu: acc - 12, comp: 100, conf: 0.75 }));

    // 5) WRONG STRESS — correct word, stress error (acc 68–84)
    for (const ref of ['девочка', 'работать', 'хорошо'])
        for (const acc of [68, 76, 84])
            S.push(mk('wrong-stress', { rec: ref, ref, acc, flu: acc - 6, comp: 100, conf: 0.85 }));

    // 6) MULTI-FORM CARDS — any accepted spoken variant must pass
    for (const [rec, ref] of [
        ['друзья', 'Друг / Друзья'],
        ['друг', 'Друг / Друзья'],
        ['уверена', 'уверен(а)'],
        ['уверен', 'уверен(а)'],
        ['мама', 'Мать (мама)'],
        ['скажите', 'скажите, пожалуйста'],
    ]) S.push(mk('multiform', { rec, ref, acc: 92, flu: 89, comp: 100, conf: 0.9 }));

    // 7) WRONG RUSSIAN WORD — Azure returns the real, different word
    for (const [rec, ref] of [
        ['читать', 'делать'], ['мальчик', 'девочка'], ['отдыхать', 'работать'],
        ['плохо', 'хорошо'], ['пожалуйста', 'спасибо'], ['самолёт', 'машина'],
    ]) for (const acc of [30, 45, 58])
        S.push(mk('wrong-russian', { rec, ref, acc, flu: 62, comp: 100, conf: 0.9 }));

    // 8) UZBEK WORD instead of Russian
    for (const rec of ['qilaman', 'bola', 'ishlash', 'yaxshi', 'rahmat', 'mashina'])
        for (const acc of [18, 30])
            S.push(mk('uzbek-word', { rec, ref: 'делать', acc, flu: 50, comp: 100, conf: 0.82 }));

    // 9) ENGLISH WORD instead of Russian
    for (const rec of ['to do', 'girl', 'work', 'good', 'thank you', 'car', 'making', 'hello'])
        for (const acc of [15, 28])
            S.push(mk('english-word', { rec, ref: 'делать', acc, flu: 50, comp: 90, conf: 0.84 }));

    // 10) SILENCE — no usable transcript
    S.push(mk('silence', { rec: '', ref: 'делать', acc: null, flu: null, comp: null, conf: null }));
    S.push(mk('silence', { rec: '', ref: 'девочка', acc: 0, flu: 0, comp: 0, conf: 0 }));
    S.push(mk('silence', { rec: '   ', ref: 'работать', acc: null, flu: null, comp: null, conf: 0.1 }));
    S.push(mk('silence', { rec: '', ref: 'у меня есть время', acc: null, flu: null, comp: null, conf: null }));
    S.push(mk('silence', { rec: '.', ref: 'хорошо', acc: null, flu: null, comp: null, conf: null }));

    // 11) MICROPHONE NOISE — garbled transcript + poor metrics
    for (const rec of ['кхх шшш', 'ммм ааа', 'тртр пп', 'ъъ ыы'])
        S.push(mk('mic-noise', { rec, ref: 'делать', acc: 15, flu: 30, comp: 50, conf: 0.2 }));

    // 12) INCOMPLETE WORD — clean prefix, missing ending
    for (const [rec, ref] of [['дела', 'делать'], ['рабо', 'работать'], ['дево', 'девочка'], ['хор', 'хорошо']])
        for (const acc of [72, 86])
            S.push(mk('incomplete', { rec, ref, acc, flu: 66, comp: 50, conf: 0.8 }));

    // 13) WRONG ENDING — different inflection of the same stem
    for (const [rec, ref] of [
        ['делает', 'делать'], ['делаю', 'делать'], ['работают', 'работать'],
        ['девочке', 'девочка'], ['машины', 'машина'],
    ]) for (const acc of [72, 82])
        S.push(mk('wrong-ending', { rec, ref, acc, flu: 72, comp: 90, conf: 0.85 }));

    // 14) PARTIAL PHRASE — only some words of the target phrase
    for (const [rec, ref] of [
        ['у меня', 'у меня есть время'],
        ['есть время', 'у меня есть время'],
        ['меня время', 'у меня есть время'],
        ['как зовут', 'как тебя зовут'],
        ['тебя', 'как тебя зовут'],
        ['я согласен', 'я не согласен'],
    ]) S.push(mk('partial-phrase', { rec, ref, acc: 82, flu: 60, comp: 50, conf: 0.8 }));

    // 15) LOW-CONFIDENCE RECOGNITION — right text but Azure is unsure
    for (const conf of [0.08, 0.15, 0.22, 0.29, 0.34])
        S.push(mk('low-confidence', { rec: 'делать', ref: 'делать', acc: 72, flu: 70, comp: 100, conf }));

    // 16) AZURE TRANSCRIPT MISMATCH — ASR returned a near-miss transcript.
    //     Wrong FORMS must fail (different word). Extra trailing words while
    //     the target itself was pronounced correctly are tolerated (likely
    //     ASR noise / elaboration) and should still pass — failing them would
    //     be a production false negative.
    for (const [rec, ref, pass] of [
        ['спасибо большое', 'спасибо', true],    // target said + extra word → accept
        ['делать что', 'делать', true],          // target said + hallucinated tail → accept
        ['машины', 'машина', false],             // wrong number → reject
        ['красивая', 'красивый', false],         // wrong gender → reject
        ['работа', 'работать', false],           // noun vs verb → reject
        ['девочки', 'девочка', false],           // plural → reject
    ]) S.push(mk('transcript-mismatch', { rec, ref, acc: 74, flu: 70, comp: 80, conf: 0.7, expectPass: pass }));

    // 17) RANDOM-ECHO — Azure echoes the reference text, audio was random.
    //     THE headline case: random speech must never become "Ajoyib".
    for (const acc of [20, 28, 35, 40, 45, 50, 55, 58, 59])
        S.push(mk('random-echo', { rec: 'делать', ref: 'делать', acc, flu: 55, comp: 100, conf: 0.7 }));
    for (const acc of [22, 33, 44, 52, 58])
        S.push(mk('random-echo', { rec: 'у меня есть время', ref: 'у меня есть время', acc, flu: 55, comp: 90, conf: 0.7 }));

    return S;
}

/**
 * Load real-speaker fixtures captured from actual Azure Pronunciation
 * Assessment output (see record-azure-fixture.html + fixtures/real/README.md).
 * Each *.json file is one fixture object OR an array of fixture objects.
 * Non-fixture files (README, TEMPLATE) are ignored.
 * @param {string} [dir]
 * @returns {{ scenarios: Array, files: string[], errors: string[] }}
 */
export function loadRealFixtures(dir = REAL_FIXTURES_DIR) {
    const out = { scenarios: [], files: [], errors: [] };
    if (!fs.existsSync(dir)) return out;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !/template/i.test(f));
    for (const f of files) {
        const full = path.join(dir, f);
        let parsed;
        try { parsed = JSON.parse(fs.readFileSync(full, 'utf8')); }
        catch (e) { out.errors.push(`${f}: invalid JSON (${e.message})`); continue; }
        const items = Array.isArray(parsed) ? parsed : [parsed];
        items.forEach((it, i) => {
            const norm = normalizeFixture(it, `${f}#${i}`);
            if (norm.error) out.errors.push(norm.error);
            else out.scenarios.push(norm.scenario);
        });
        out.files.push(f);
    }
    return out;
}

function normalizeFixture(it, where) {
    if (!it || typeof it !== 'object') return { error: `${where}: not an object` };
    const label = it.label;
    if (!LABELS[label]) return { error: `${where}: unknown/missing label "${label}"` };
    if (typeof it.referenceText !== 'string' || !it.referenceText.trim())
        return { error: `${where}: missing referenceText` };
    const az = it.azure || {};
    const meta = LABELS[label];
    return {
        scenario: {
            id: it.id || `real-${where}`,
            label,
            speaker: it.speaker || 'real',
            referenceText: it.referenceText,
            recognizedText: it.recognizedText || '',
            azure: {
                accuracy: numOrNull(az.accuracy),
                fluency: numOrNull(az.fluency),
                completeness: numOrNull(az.completeness),
                confidence: numOrNull(az.confidence),
            },
            words: Array.isArray(it.words) ? it.words : undefined,
            groundTruth: meta.groundTruth,
            // A real fixture may override expectPass (e.g. a "slight-mistake"
            // that a human judged acceptable); otherwise use the label default.
            expectPass: typeof it.expectPass === 'boolean' ? it.expectPass : meta.expectPass,
        },
    };
}

function numOrNull(v) {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
