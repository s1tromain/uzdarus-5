# Pronunciation Engine — Production Validation Framework

Automated, reusable validation for the UzdaRus pronunciation engine
(`paid-courses/speech.js`). It loads the **real** engine (no re-implementation)
in a stubbed browser sandbox and grades a large labeled corpus through the exact
code path learners hit, measuring the metrics that matter for production.

```
npm run validate:speech          # full report + pass/fail exit code
npm run validate:speech:sweep    # threshold sensitivity analysis
```

## What it verifies

**Scenario coverage** (all categories from the spec):
`correct` · `slight-mistake` · `strong-accent` · `wrong-stress` · `multiform`
· `wrong-russian` · `uzbek-word` · `english-word` · `silence` · `mic-noise`
· `incomplete` · `wrong-ending` · `partial-phrase` · `low-confidence`
· `transcript-mismatch` · `random-echo`

**Metrics measured**

| metric | meaning | production target |
|--------|---------|-------------------|
| False positives | bad attempts the engine accepted (÷ all "should-fail") | **< 1%** |
| False negatives | correct attempts the engine rejected (÷ all "should-pass") | **< 5%** |
| False "Ajoyib" | any illegitimate attempt scored 5★ excellent | **0** |
| Invariant | 5★ ⇒ Azure `accuracy ≥ 90` **and** transcript matches reference | **0 violations** |
| Consistency | identical input → identical result over N repeats | **100%** |
| Scoring stability | std-dev of `finalScore` across repeats | **0** (deterministic) |
| Latency | pure grading time per attempt | informational (~15µs) |

`run-validation.js` exits non-zero if any target is missed, so it doubles as a
CI gate.

### The "random speech can never receive Ajoyib" guarantee

This is enforced **structurally**, not just observed: `excellent` requires
`finalScore ≥ 95`, and `_accuracyCeiling()` caps the score so ≥95 is
unreachable unless Azure `AccuracyScore ≥ 90`. Because Azure's accuracy measures
real phoneme match against the reference, random / wrong / echoed audio cannot
reach 90. The suite asserts the invariant on **every** scenario.

## Files

```
tests/pronunciation/
  run-validation.js          # main runner (report + targets + exit code)
  sweep-thresholds.js        # FP/FN trade-off across candidate thresholds
  record-azure-fixture.html  # browser tool → capture real Azure output as fixtures
  lib/
    engine-harness.js        # loads real speech.js in a VM; supports constant overrides
    scenarios.js             # labeled synthetic corpus + real-fixture loader
    metrics.js               # FP/FN/consistency/latency/stability + target checks
  fixtures/real/             # drop real recordings here (see its README)
```

## Real-world calibration (after deployment)

The synthetic corpus supplies realistic Azure outputs per category and proves
the engine's decision logic. **Real** FP/FN can only be measured with real Azure
output from real speakers — here is the exact workflow:

1. **Deploy** the site (so `/api/speech-token` is live) — or have any machine
   with Azure Speech credentials.
2. **Open the recorder**: browse to `…/tests/pronunciation/record-azure-fixture.html`
   on the deployed origin (logged in as staff → unlimited token quota), or open
   the file locally and choose *Azure subscription key + region*.
3. **Record a balanced set** with real people. Recommended minimum for a
   meaningful < 1% FP / < 5% FN estimate:
   - **≥ 60 native Russian speakers' correct utterances** (label `correct`) across
     the vocabulary — these drive the false-negative number.
   - **≥ 60 Uzbek-learner utterances**: a mix of genuinely-correct (label
     `correct`/`strong-accent`) and deliberately bad (`wrong-russian`,
     `uzbek-word`, `english-word`, `incomplete`, `wrong-ending`,
     `partial-phrase`) — these drive the false-positive number.
   - A handful of `silence`, `mic-noise`, `low-confidence`, `random-echo`
     (speak gibberish while the target word is on screen).
   Pick the correct **label** and **speaker** in the recorder before each take;
   set *Expected to PASS* only to override a label default.
4. **Export** ("Download all as JSON") and save the file(s) into
   `tests/pronunciation/fixtures/real/`.
5. **Re-run** `npm run validate:speech`. The report now blends synthetic + real
   and prints the **real** FP/FN. Aim for the < 1% / < 5% targets.
6. If targets are missed, **tune thresholds** (below), re-run, iterate.

## Threshold tuning — which knobs to turn

Run the sweep to see the FP/FN trade-off on the *current* corpus (synthetic +
whatever real fixtures are present):

```
npm run validate:speech:sweep
# custom grids:
node tests/pronunciation/sweep-thresholds.js --pass=60,65,70,75 --conf=0.25,0.30,0.35,0.40
```

It reloads the engine with each candidate value and prints FP%, FN%, false-Ajoyib
and invariant counts, then recommends the setting that meets both targets with
the widest margin. All tunables live at the top of the scoring core in
`paid-courses/speech.js`:

| constant / function | controls | if **FP too high** (bad accepted) | if **FN too high** (correct rejected) |
|---|---|---|---|
| `SPEECH_PASS_SCORE` (70) | score needed to advance | **raise** (e.g. 74) | **lower** (e.g. 66) |
| `SPEECH_CONF_MIN` (0.35) | ASR confidence floor → "ask to repeat" | **raise** (rejects unsure audio) | **lower** (accepts lower-confidence real speech) |
| `_accuracyCeiling()` tiers | max score per Azure accuracy band (echo/random guard) | **lower** the mid tiers (60/50 bands) | **raise** the mid tiers |
| `SPEECH_STAR5_MIN` (95) | 5★ "Ajoyib" cutoff | raise | lower |
| `SPEECH_STAR4_MIN`/`STAR3_MIN`/`STAR2_MIN` | 4★/3★/2★ cutoffs | — | lower 3★ to pass more |
| text/azure weights in `_combineScore` (0.45/0.55) | text-match vs Azure-quality balance | shift toward text (raise 0.45) | shift toward Azure (raise 0.55) |
| `redPen` in `_textScore` (0.20/word) | penalty for missing/wrong words | raise | lower |
| green-cap 62 in `_packageGrade` | cap when no word is fully correct | lower | raise |

`sweep-thresholds.js` can patch `SPEECH_PASS_SCORE` and `SPEECH_CONF_MIN`
directly; the `_accuracyCeiling` tiers and weights are edited in
`speech.js` (each is a small, commented block) and validated by re-running.

**Do not** relax a threshold in a way that reintroduces false-Ajoyib or an
invariant violation — those must stay at 0 regardless of FP/FN tuning.

## Notes & limitations

- Synthetic FP/FN is a **lower bound / logic proof**: the metrics are chosen to
  be realistic per category, so 0%/0% shows the decision logic is sound, but the
  binding production numbers come from **real fixtures**.
- The engine is deterministic (same input → same output), so consistency and
  scoring-stability are exact. "Stability across repeated attempts" for real
  speakers additionally depends on Azure returning stable metrics for repeated
  recordings of the same word — capture 2–3 takes per word to observe it.
- Latency here is the pure grading step (microseconds). End-to-end latency is
  dominated by the Azure round-trip, which the recorder page exercises live.
