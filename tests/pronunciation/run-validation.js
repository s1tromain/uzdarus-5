#!/usr/bin/env node
/**
 * run-validation.js  —  production validation runner for the pronunciation engine.
 *
 * Usage:
 *   node tests/pronunciation/run-validation.js            # synthetic + any real fixtures
 *   node tests/pronunciation/run-validation.js --synthetic-only
 *   node tests/pronunciation/run-validation.js --repeats=50
 *   node tests/pronunciation/run-validation.js --json      # machine-readable
 *
 * Exit code 0 iff every production target is met:
 *   FP < 1%, FN < 5%, 0 false-Ajoyib, 0 invariant violations,
 *   100% consistency, 0 scoring variance.
 */

import { loadEngine } from './lib/engine-harness.js';
import { getSyntheticScenarios, loadRealFixtures } from './lib/scenarios.js';
import { evaluate, computeReport, checkTargets, TARGETS, EXCELLENT_MIN_ACCURACY } from './lib/metrics.js';

const args = process.argv.slice(2);
const syntheticOnly = args.includes('--synthetic-only');
const asJson = args.includes('--json');
const repeats = Number((args.find(a => a.startsWith('--repeats=')) || '').split('=')[1]) || 25;

function bar(n, total, width = 22) {
    const filled = total ? Math.round((n / total) * width) : 0;
    return '█'.repeat(filled) + '░'.repeat(width - filled);
}

const engine = loadEngine();
const synthetic = getSyntheticScenarios();
const real = syntheticOnly ? { scenarios: [], files: [], errors: [] } : loadRealFixtures();
const scenarios = synthetic.concat(real.scenarios);

const per = evaluate(engine, scenarios, { repeats });
const report = computeReport(per);
const targets = checkTargets(report);

if (asJson) {
    const { lists, ...rest } = report;
    console.log(JSON.stringify({
        engineConstants: engine.constants,
        realFixtures: { files: real.files, count: real.scenarios.length, errors: real.errors },
        report: rest,
        targets,
    }, null, 2));
    process.exit(targets.passed ? 0 : 1);
}

const line = '─'.repeat(64);
console.log('\n' + line);
console.log('  UZDARUS · PRONUNCIATION ENGINE — PRODUCTION VALIDATION');
console.log(line);
console.log(`  Engine constants : PASS>=${engine.constants.SPEECH_PASS_SCORE}  CONF>=${engine.constants.SPEECH_CONF_MIN}  ` +
            `stars ${engine.constants.SPEECH_STAR2_MIN}/${engine.constants.SPEECH_STAR3_MIN}/${engine.constants.SPEECH_STAR4_MIN}/${engine.constants.SPEECH_STAR5_MIN}`);
console.log(`  Scenarios        : ${synthetic.length} synthetic` +
            (real.scenarios.length ? ` + ${real.scenarios.length} real (${real.files.join(', ')})` : ' (no real fixtures yet)'));
console.log(`  Repeats/scenario : ${repeats}   (consistency + latency sampling)`);
if (real.errors.length) {
    console.log('  ⚠ real fixture errors:');
    real.errors.forEach(e => console.log('      - ' + e));
}

console.log('\n  PER-CATEGORY (engine pass rate)');
const labels = Object.keys(report.byLabel);
for (const lb of labels) {
    const c = report.byLabel[lb];
    const gt = per.find(p => p.scenario.label === lb).scenario.groundTruth;
    const tag = gt === 'legit' ? 'should PASS' : 'should FAIL';
    console.log(`    ${lb.padEnd(20)} ${String(c.passed).padStart(3)}/${String(c.n).padStart(3)} pass   ` +
                `${bar(c.passed, c.n)}  (${tag}${c.excellent ? `, ${c.excellent}× Ajoyib` : ''})`);
}

console.log('\n  QUALITY METRICS');
const fpPctStr = (report.falsePositiveRate * 100).toFixed(2);
const fnPctStr = (report.falseNegativeRate * 100).toFixed(2);
const row = (label, val, ok) => console.log(`    ${ok ? '✅' : '❌'} ${label.padEnd(34)} ${val}`);
row(`False positives (target < ${TARGETS.falsePositiveRate * 100}%)`,
    `${report.falsePositives}/${report.illegitTotal}  = ${fpPctStr}%`, report.falsePositiveRate < TARGETS.falsePositiveRate);
row(`False negatives (target < ${TARGETS.falseNegativeRate * 100}%)`,
    `${report.falseNegatives}/${report.legitTotal}  = ${fnPctStr}%`, report.falseNegativeRate < TARGETS.falseNegativeRate);
row(`False "Ajoyib" (illegit → 5★)`, String(report.falseAjoyib), report.falseAjoyib === 0);
row(`Invariant: 5★ ⇒ acc≥${EXCELLENT_MIN_ACCURACY} & match`, `${report.invariantViolations} violations`, report.invariantViolations === 0);
row('Consistency (repeat determinism)', `${(report.consistencyRate * 100).toFixed(1)}%`, report.consistencyRate === 1);
row('Scoring stability (score std-dev)', `${report.scoreStabilityMax.toFixed(3)}`, report.scoreStabilityMax === 0);

console.log('\n  LATENCY  (pure grading, per attempt)');
console.log(`     p50 ${report.latency.p50Us.toFixed(1)}µs   p95 ${report.latency.p95Us.toFixed(1)}µs   ` +
            `max ${report.latency.maxUs.toFixed(1)}µs   mean ${report.latency.meanUs.toFixed(1)}µs   ` +
            `(${report.latency.samples} samples)`);

function dump(title, list) {
    if (!list.length) return;
    console.log(`\n  ${title} (${list.length}):`);
    list.slice(0, 15).forEach(p => {
        const s = p.scenario, r = p.result;
        console.log(`    [${s.label}] "${s.recognizedText}" vs "${s.referenceText}" acc=${s.azure.accuracy} ` +
                    `→ ${r.verdict}(${r.finalScore}, ★${r.stars || 0}) pass=${r.pass}`);
    });
    if (list.length > 15) console.log(`    … and ${list.length - 15} more`);
}
dump('FALSE NEGATIVES (correct rejected)', report.lists.fnList);
dump('FALSE POSITIVES (bad accepted)', report.lists.fpList);
dump('FALSE "AJOYIB"', report.lists.falseAjoyibList);
dump('INVARIANT VIOLATIONS', report.lists.invariantList);
dump('NON-DETERMINISTIC', report.lists.inconsistentList);

console.log('\n' + line);
if (targets.passed) {
    console.log('  ✅ ALL PRODUCTION TARGETS MET');
} else {
    console.log('  ❌ TARGETS NOT MET:');
    targets.failures.forEach(f => console.log('     - ' + f));
}
console.log(line + '\n');

process.exit(targets.passed ? 0 : 1);
