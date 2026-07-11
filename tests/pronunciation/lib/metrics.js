/**
 * metrics.js
 * ------------------------------------------------------------------
 * Runs the engine over a labeled corpus and measures the production
 * quality metrics:
 *
 *   - false positives  (bad attempts the engine accepted)
 *   - false negatives  (correct attempts the engine rejected)
 *   - false "Ajoyib"   (any illegitimate attempt scored 5★ excellent)
 *   - invariant        (excellent REQUIRES accuracy>=90 AND transcript match)
 *   - consistency      (identical input -> identical result over N repeats)
 *   - scoring stability(std-dev of finalScore across repeats)
 *   - latency          (per-grade wall time, p50 / p95 / max)
 *
 * The production targets are asserted by checkTargets().
 */

/** Production quality targets. */
export const TARGETS = {
    falsePositiveRate: 0.01,   // < 1%
    falseNegativeRate: 0.05,   // < 5%
    falseAjoyib: 0,            // exactly zero
    invariantViolations: 0,    // exactly zero
    consistencyRate: 1.0,      // 100%
    scoreStabilityMax: 0,      // deterministic -> 0 variance
};

/** Excellent (Ajoyib) is only ever allowed when Azure accuracy is high AND
 *  the transcript matches an accepted reference variant. This is the formal
 *  "random speech can never receive Ajoyib" guarantee. */
export const EXCELLENT_MIN_ACCURACY = 90;

function pct(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
}
function stddev(arr) {
    if (arr.length < 2) return 0;
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    const v = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
    return Math.sqrt(v);
}

/**
 * Grade every scenario `repeats` times, capturing determinism + latency.
 * @returns {Array<{scenario, result, matchesRef, repeatsIdentical, scoreStdDev, latencyNs:number[]}>}
 */
export function evaluate(engine, scenarios, { repeats = 25 } = {}) {
    const per = [];
    for (const sc of scenarios) {
        const attempt = {
            referenceText: sc.referenceText,
            recognizedText: sc.recognizedText,
            azure: sc.azure,
            words: sc.words,
        };
        const scores = [];
        const verdicts = [];
        const latencyNs = [];
        let first = null;
        for (let i = 0; i < repeats; i++) {
            const t0 = process.hrtime.bigint();
            const r = engine.grade(attempt);
            const t1 = process.hrtime.bigint();
            latencyNs.push(Number(t1 - t0));
            scores.push(r.finalScore);
            verdicts.push(r.verdict);
            if (i === 0) first = r;
        }
        const repeatsIdentical =
            scores.every(s => s === scores[0]) && verdicts.every(v => v === verdicts[0]);
        const variants = engine.referenceVariants(sc.referenceText).map(v => engine.normalize(v));
        const matchesRef = variants.indexOf(engine.normalize(sc.recognizedText)) !== -1;
        per.push({
            scenario: sc,
            result: first,
            matchesRef,
            repeatsIdentical,
            scoreStdDev: stddev(scores),
            latencyNs,
        });
    }
    return per;
}

/** Aggregate per-scenario evaluations into the quality report. */
export function computeReport(per) {
    const byLabel = {};
    const legit = [];
    const illegit = [];
    const fnList = [];
    const fpList = [];
    const falseAjoyibList = [];
    const invariantList = [];
    const inconsistentList = [];
    const allLatency = [];
    let maxStdDev = 0;

    for (const p of per) {
        const sc = p.scenario;
        const r = p.result;
        const passed = r.pass === true;
        byLabel[sc.label] = byLabel[sc.label] || { n: 0, passed: 0, excellent: 0 };
        byLabel[sc.label].n++;
        if (passed) byLabel[sc.label].passed++;
        if (r.verdict === 'excellent') byLabel[sc.label].excellent++;

        for (const ns of p.latencyNs) allLatency.push(ns);
        if (p.scoreStdDev > maxStdDev) maxStdDev = p.scoreStdDev;
        if (!p.repeatsIdentical) inconsistentList.push(p);

        // Ground truth for FP/FN is the per-scenario expectPass flag (a
        // scenario may override its label default — e.g. a transcript with
        // extra ASR words where the target word WAS pronounced correctly).
        if (sc.expectPass) {
            legit.push(p);
            if (!passed) fnList.push(p);                             // false negative
        } else {
            illegit.push(p);
            if (passed) fpList.push(p);                              // false positive
            if (r.verdict === 'excellent') falseAjoyibList.push(p);  // false Ajoyib
        }
        // Invariant holds for EVERY scenario regardless of ground truth.
        if (r.verdict === 'excellent' &&
            !(p.matchesRef && sc.azure && Number(sc.azure.accuracy) >= EXCELLENT_MIN_ACCURACY)) {
            invariantList.push(p);
        }
    }

    const sortedLat = allLatency.slice().sort((a, b) => a - b);
    const consistencyRate = per.length ? (per.length - inconsistentList.length) / per.length : 1;

    return {
        total: per.length,
        legitTotal: legit.length,
        illegitTotal: illegit.length,
        byLabel,
        falsePositives: fpList.length,
        falseNegatives: fnList.length,
        falsePositiveRate: illegit.length ? fpList.length / illegit.length : 0,
        falseNegativeRate: legit.length ? fnList.length / legit.length : 0,
        falseAjoyib: falseAjoyibList.length,
        invariantViolations: invariantList.length,
        consistencyRate,
        scoreStabilityMax: maxStdDev,
        latency: {
            samples: allLatency.length,
            p50Us: pct(sortedLat, 50) / 1000,
            p95Us: pct(sortedLat, 95) / 1000,
            maxUs: (sortedLat[sortedLat.length - 1] || 0) / 1000,
            meanUs: allLatency.length ? (allLatency.reduce((a, b) => a + b, 0) / allLatency.length) / 1000 : 0,
        },
        lists: { fnList, fpList, falseAjoyibList, invariantList, inconsistentList },
    };
}

/** Check the report against production targets. @returns {{passed, failures[]}} */
export function checkTargets(report) {
    const failures = [];
    if (report.falsePositiveRate >= TARGETS.falsePositiveRate)
        failures.push(`False-positive rate ${(report.falsePositiveRate * 100).toFixed(2)}% >= ${TARGETS.falsePositiveRate * 100}%`);
    if (report.falseNegativeRate >= TARGETS.falseNegativeRate)
        failures.push(`False-negative rate ${(report.falseNegativeRate * 100).toFixed(2)}% >= ${TARGETS.falseNegativeRate * 100}%`);
    if (report.falseAjoyib > TARGETS.falseAjoyib)
        failures.push(`False "Ajoyib" count ${report.falseAjoyib} > 0`);
    if (report.invariantViolations > TARGETS.invariantViolations)
        failures.push(`Invariant violations ${report.invariantViolations} > 0`);
    if (report.consistencyRate < TARGETS.consistencyRate)
        failures.push(`Consistency ${(report.consistencyRate * 100).toFixed(2)}% < 100%`);
    if (report.scoreStabilityMax > TARGETS.scoreStabilityMax)
        failures.push(`Score std-dev ${report.scoreStabilityMax} > 0 (non-deterministic)`);
    return { passed: failures.length === 0, failures };
}
