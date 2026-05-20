/* ============================================================
 *  Speech verdict engine — regression test
 *  Run:  node validation_test.js
 *
 *  Extracts the pure verdict-engine functions out of
 *  paid-courses/speech.js and asserts the verdict for a set of
 *  reference scenarios, including the five spec scenarios.
 * ============================================================ */
import fs from "fs";

const source = fs.readFileSync("paid-courses/speech.js", "utf8").replace(/\r\n/g, "\n");

/* ---- extract a `function NAME(...) { ... }` block ---- */
function extractFunction(name) {
    const start = source.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`Function not found: ${name}`);
    let depth = 0, sawBrace = false;
    for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (ch === "{") { depth++; sawBrace = true; }
        else if (ch === "}") {
            depth--;
            if (sawBrace && depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error(`Unclosed function: ${name}`);
}

/* ---- extract a single-line `var NAME = ...;` declaration ---- */
function extractVar(name) {
    const re = new RegExp(`^var ${name} = [^;]*;`, "m");
    const m = source.match(re);
    if (!m) throw new Error(`Var not found: ${name}`);
    return m[0];
}

const varNames = [
    "SPEECH_GREEN_THRESHOLD",
    "SPEECH_YELLOW_THRESHOLD",
    "SPEECH_SHORT_WORD_MAX",
    "SPEECH_MIN_COVERAGE",
    "_VERDICT_SCORE",
    "_VERDICT_REASON"
];

const functionNames = [
    "_normalizeSpeechText",
    "_matchForm",
    "_tokenize",
    "_levenshtein",
    "_sharesAffix",
    "_classifyWord",
    "_considerCand",
    "_classifyWords",
    "_evaluateVerdict",
    "_statesToFeedback",
    "_packageGrade",
    "_gradeSpeech"
];

globalThis.eval(
    varNames.map(extractVar).join("\n") + "\n\n" +
    functionNames.map(extractFunction).join("\n\n")
);

/* ================================================================ */

const REF = "Я часто волнуюсь из-за работы";

const scenarios = [
    /* ---- the five spec scenarios ---- */
    { name: "Spec 1 — perfect",        reference: REF, recognized: "Я часто волнуюсь из-за работы", expect: "excellent" },
    { name: "Spec 2 — minor slips",    reference: REF, recognized: "Я часто волнуюс иза работы",     expect: "good" },
    { name: "Spec 3 — missing words",  reference: REF, recognized: "Я волнуюсь работа",              expect: "average" },
    { name: "Spec 4 — garbage",        reference: REF, recognized: "вавава работа яяя",               expect: "unclear" },
    { name: "Spec 5 — silence",        reference: REF, recognized: "",                                expect: "empty" },

    /* ---- compound / hyphenated word handling ---- */
    { name: "Compound split (из за)",  reference: "из-за работы", recognized: "из за работы",  expect: "excellent" },
    { name: "Compound merged (изза)",  reference: "из-за работы", recognized: "изза работы",   expect: "excellent" },
    { name: "Compound perfect",        reference: "из-за работы", recognized: "из-за работы",  expect: "excellent" },

    /* ---- normalization (ё, case, punctuation) ---- */
    { name: "Case insensitive",        reference: "Привет", recognized: "привет",  expect: "excellent" },
    { name: "Yo / ye equivalence",     reference: "ёлка",   recognized: "елка",    expect: "excellent" },
    { name: "Punctuation stripped",    reference: "Как дела?", recognized: "как дела", expect: "excellent" },

    /* ---- single-word vocabulary cards ---- */
    { name: "Single word perfect",     reference: "делать", recognized: "делать",  expect: "excellent" },
    { name: "Single word wrong",       reference: "делать", recognized: "кошка",   expect: "unclear" },
    { name: "Single word ending slip", reference: "работать", recognized: "работает", expect: "good" },

    /* ---- anti-random: garbage must never pass ---- */
    { name: "Pure noise",              reference: REF, recognized: "ааааа ббббб ввввв ггггг", expect: "unclear" },
    { name: "One real word in noise",  reference: REF, recognized: "часто бла бла бла",       expect: "unclear" },

    /* ---- short-word strict mode ---- */
    { name: "Short word strict",       reference: "он не там", recognized: "он не там", expect: "excellent" },
    { name: "Two-word card perfect",   reference: "Доброе утро", recognized: "доброе утро", expect: "excellent" }
];

let failures = 0;
console.log("Scenario | Recognized | Verdict | Expected | G/Y/R | Status");
console.log("--- | --- | --- | --- | --- | ---");

scenarios.forEach(s => {
    const g = _gradeSpeech(s.recognized, s.reference);
    const c = g.wordCounts || { green: 0, yellow: 0, red: 0 };
    const ok = g.verdict === s.expect;
    if (!ok) failures++;
    console.log(
        `${s.name} | "${s.recognized}" | ${g.verdict} | ${s.expect} | ` +
        `${c.green}/${c.yellow}/${c.red} | ${ok ? "PASS" : "FAIL"}`
    );
});

/* ---- word-state assertions for spec scenario 2 ---- */
const c2 = _classifyWords("Я часто волнуюс иза работы", REF);
const greens2 = c2.counts.green, yellows2 = c2.counts.yellow, reds2 = c2.counts.red;
const spec2WordsOk = greens2 === 3 && yellows2 === 2 && reds2 === 0;
if (!spec2WordsOk) failures++;
console.log(
    `Spec 2 word states | — | ${greens2}G ${yellows2}Y ${reds2}R | 3G 2Y 0R | ` +
    `${greens2}/${yellows2}/${reds2} | ${spec2WordsOk ? "PASS" : "FAIL"}`
);

/* ---- determinism: identical input → identical verdict ---- */
const d1 = _gradeSpeech("Я часто волнуюс иза работы", REF).verdict;
const d2 = _gradeSpeech("Я часто волнуюс иза работы", REF).verdict;
const deterministic = d1 === d2;
if (!deterministic) failures++;
console.log(`Determinism | — | ${d1} === ${d2} | equal | — | ${deterministic ? "PASS" : "FAIL"}`);

console.log("\n" + (failures === 0
    ? "ALL TESTS PASSED ✅"
    : `${failures} TEST(S) FAILED ❌`));

if (failures > 0) process.exitCode = 1;
