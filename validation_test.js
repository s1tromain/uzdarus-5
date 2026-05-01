import fs from "fs";

const source = fs.readFileSync("paid-courses/speech.js", "utf8").replace(/\r\n/g, "\n");

function extractFunction(name) {
    const start = source.indexOf(`function ${name}(`);
    if (start === -1) {
        throw new Error(`Function not found: ${name}`);
    }

    let depth = 0;
    let sawBrace = false;
    for (let index = start; index < source.length; index++) {
        const ch = source[index];
        if (ch === "{") {
            depth++;
            sawBrace = true;
        } else if (ch === "}") {
            depth--;
            if (sawBrace && depth === 0) {
                return source.slice(start, index + 1);
            }
        }
    }

    throw new Error(`Unclosed function: ${name}`);
}

const functionNames = [
    "_clampRange",
    "_tokenize",
    "_getWordStats",
    "_normalizeMetric",
    "_getWordQuality",
    "_isSuspiciousAccuracy",
    "_getAzureQualityPenalty",
    "_getNearExactPenalty",
    "_computeMetrics",
    "_computeFinalMetricScore"
];

globalThis.eval(functionNames.map(extractFunction).join("\n\n"));

function scoreScenario(scenario) {
    const words = scenario.wordAccuracies.map((accuracy, index) => ({
        word: `w${index + 1}`,
        accuracy
    }));
    const stats = _getWordStats(scenario.recognized, scenario.reference);
    const quality = _getWordQuality(words);
    const accuracy = _normalizeMetric(scenario.rawAccuracy);
    const fluency = _normalizeMetric(scenario.rawFluency);
    const suspiciousAccuracy = _isSuspiciousAccuracy(accuracy, words);
    const isExactTranscriptMatch = scenario.recognized.trim().toLowerCase() === scenario.reference.trim().toLowerCase();
    const weakMajorityThreshold = words.length > 0 ? Math.ceil(words.length / 2) : Number.POSITIVE_INFINITY;
    const hasMajorityVeryWeakWords = quality.veryWeakCount >= weakMajorityThreshold;

    let reason = null;
    if (isExactTranscriptMatch) {
        if (!accuracy || !fluency || accuracy < 40 || fluency < 40 || (quality.avg !== null && quality.avg < 55) || hasMajorityVeryWeakWords) {
            reason = "fake_match";
        }
    }

    if (!reason && !isExactTranscriptMatch && (
        (stats.partialRatio > 0.9 && quality.avg !== null && quality.avg < 55)
        || (stats.partialRatio > 0.85 && (hasMajorityVeryWeakWords || (quality.avg !== null && quality.avg < 50)))
    )) {
        reason = "fake_match";
    }

    let qualityPenalty = 1;
    if (quality.avg !== null && quality.avg < 70) {
        qualityPenalty = _getAzureQualityPenalty(quality.avg, suspiciousAccuracy);
    }

    let nearExactPenalty = 1;
    if (!isExactTranscriptMatch && stats.partialRatio >= 0.72 && quality.avg !== null && quality.avg < 67) {
        nearExactPenalty = _getNearExactPenalty(stats.partialRatio, quality.avg);
    }

    const stabilityPenalty = Number.isFinite(scenario.stabilityPenalty) ? scenario.stabilityPenalty : 1;
    const extraPenalty = Math.min(stabilityPenalty, qualityPenalty, nearExactPenalty);

    const metrics = reason === "fake_match"
        ? { aniqlik: 25, ravonlik: 25, toliqlik: 25 }
        : _computeMetrics(stats, accuracy, fluency, extraPenalty < 1 ? extraPenalty : undefined);

    return {
        name: scenario.name,
        expected: scenario.expected,
        stats,
        qualityAvg: quality.avg,
        suspiciousAccuracy,
        reason: reason || "score",
        metrics,
        finalScore: _computeFinalMetricScore(metrics)
    };
}

function inRange(value, range) {
    return value >= range[0] && value <= range[1];
}

const scenarios = [
    {
        name: "Perfect",
        reference: "one two three",
        recognized: "one two three",
        rawAccuracy: 92,
        rawFluency: 92,
        wordAccuracies: [92, 92, 92],
        expected: [90, 100]
    },
    {
        name: "Poor accent",
        reference: "one two three",
        recognized: "one two three",
        rawAccuracy: 90,
        rawFluency: 90,
        wordAccuracies: [67, 67, 67],
        expected: [60, 75]
    },
    {
        name: "One error",
        reference: "one two three",
        recognized: "one two noise",
        rawAccuracy: 90,
        rawFluency: 90,
        wordAccuracies: [88, 88, 88],
        expected: [50, 60]
    },
    {
        name: "Similar words",
        reference: "i have one",
        recognized: "i see one",
        rawAccuracy: 90,
        rawFluency: 90,
        wordAccuracies: [88, 88, 88],
        expected: [50, 60]
    },
    {
        name: "Permutation",
        reference: "one two three",
        recognized: "two one three",
        rawAccuracy: 90,
        rawFluency: 90,
        wordAccuracies: [88, 88, 88],
        expected: [30, 50]
    },
    {
        name: "Garbage",
        reference: "one two three four",
        recognized: "noise",
        rawAccuracy: 95,
        rawFluency: 95,
        wordAccuracies: [95],
        expected: [0, 20]
    },
    {
        name: "Soft near exact",
        reference: "one two three four five",
        recognized: "one two three four noise",
        rawAccuracy: 90,
        rawFluency: 90,
        wordAccuracies: [60, 60, 60, 60, 60],
        expected: [30, 50]
    },
    {
        name: "Fake near exact",
        reference: "one two three four five six seven eight nine ten eleven",
        recognized: "one two three four five six seven eight nine ten noise",
        rawAccuracy: 90,
        rawFluency: 90,
        wordAccuracies: [54, 54, 54, 54, 54, 54, 54, 54, 54, 54, 54],
        expected: [20, 30]
    },
    {
        name: "Stability folded",
        reference: "one two three",
        recognized: "one two three",
        rawAccuracy: 90,
        rawFluency: 90,
        wordAccuracies: [88, 88, 88],
        stabilityPenalty: 0.6,
        expected: [50, 60]
    }
];

const results = scenarios.map(scoreScenario);
let hasFailure = false;

console.log("Scenario | Score | Expected | Reason | Metrics | Status");
console.log("--- | --- | --- | --- | --- | ---");

results.forEach(result => {
    const status = inRange(result.finalScore, result.expected) ? "PASS" : "FAIL";
    if (status === "FAIL") {
        hasFailure = true;
    }

    const metrics = `${result.metrics.aniqlik}/${result.metrics.ravonlik}/${result.metrics.toliqlik}`;
    const expected = `${result.expected[0]}-${result.expected[1]}`;
    console.log(`${result.name} | ${result.finalScore} | ${expected} | ${result.reason} | ${metrics} | ${status}`);
});

if (hasFailure) {
    process.exitCode = 1;
}