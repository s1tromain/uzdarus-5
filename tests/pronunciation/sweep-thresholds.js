#!/usr/bin/env node
/**
 * sweep-thresholds.js — threshold sensitivity analysis.
 *
 * Re-loads the real engine with different values of the tunable constants
 * and measures the false-positive / false-negative trade-off on the current
 * corpus (synthetic + any real fixtures). Use this AFTER dropping real
 * recordings into fixtures/real/ to pick production thresholds that meet
 * the < 1% FP / < 5% FN targets with the best margin.
 *
 * Usage:
 *   node tests/pronunciation/sweep-thresholds.js
 *   node tests/pronunciation/sweep-thresholds.js --pass=60,65,70,75,80 --conf=0.25,0.30,0.35,0.40
 *   node tests/pronunciation/sweep-thresholds.js --synthetic-only
 */

import { loadEngine } from './lib/engine-harness.js';
import { getSyntheticScenarios, loadRealFixtures } from './lib/scenarios.js';
import { evaluate, computeReport, TARGETS } from './lib/metrics.js';

const args = process.argv.slice(2);
const syntheticOnly = args.includes('--synthetic-only');
const nums = (flag, def) => {
    const a = args.find(x => x.startsWith(flag + '='));
    return a ? a.split('=')[1].split(',').map(Number) : def;
};
const passVals = nums('--pass', [60, 65, 70, 75, 80]);
const confVals = nums('--conf', [0.25, 0.30, 0.35, 0.40, 0.45]);

const synthetic = getSyntheticScenarios();
const real = syntheticOnly ? { scenarios: [], files: [] } : loadRealFixtures();
const scenarios = synthetic.concat(real.scenarios);

console.log(`\nThreshold sweep over ${scenarios.length} scenarios` +
    (real.scenarios.length ? ` (incl. ${real.scenarios.length} real)` : ' (synthetic only)'));
console.log(`Targets: FP < ${TARGETS.falsePositiveRate * 100}% , FN < ${TARGETS.falseNegativeRate * 100}%\n`);
console.log('  PASS  CONF   FP%     FN%    Ajoyib  Inv   verdict');
console.log('  ' + '─'.repeat(52));

const rows = [];
for (const pass of passVals) {
    for (const conf of confVals) {
        const engine = loadEngine({ overrides: { SPEECH_PASS_SCORE: pass, SPEECH_CONF_MIN: conf } });
        const per = evaluate(engine, scenarios, { repeats: 1 });
        const r = computeReport(per);
        const fp = r.falsePositiveRate, fn = r.falseNegativeRate;
        const ok = fp < TARGETS.falsePositiveRate && fn < TARGETS.falseNegativeRate
            && r.falseAjoyib === 0 && r.invariantViolations === 0;
        rows.push({ pass, conf, fp, fn, ajoyib: r.falseAjoyib, inv: r.invariantViolations, ok });
        console.log(`  ${String(pass).padStart(4)}  ${conf.toFixed(2)}  ` +
            `${(fp * 100).toFixed(2).padStart(5)}  ${(fn * 100).toFixed(2).padStart(6)}  ` +
            `${String(r.falseAjoyib).padStart(5)}  ${String(r.invariantViolations).padStart(4)}   ${ok ? '✅ meets' : '·'}`);
    }
}

// Recommend the passing setting with the largest combined margin to targets.
const passing = rows.filter(r => r.ok);
console.log('');
if (passing.length) {
    passing.sort((a, b) =>
        ((TARGETS.falsePositiveRate - a.fp) + (TARGETS.falseNegativeRate - a.fn)) -
        ((TARGETS.falsePositiveRate - b.fp) + (TARGETS.falseNegativeRate - b.fn)));
    const best = passing[passing.length - 1];
    console.log(`Recommended: SPEECH_PASS_SCORE=${best.pass}, SPEECH_CONF_MIN=${best.conf.toFixed(2)} ` +
        `(FP ${(best.fp * 100).toFixed(2)}%, FN ${(best.fn * 100).toFixed(2)}%)`);
    console.log('Edit these constants in paid-courses/speech.js (see README → Threshold tuning).');
} else {
    console.log('No swept combination met both targets on this corpus — collect more real fixtures ' +
        'and consider adjusting the _accuracyCeiling tiers (see README → Threshold tuning).');
}
console.log('');
