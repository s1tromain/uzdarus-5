# Real-speaker fixtures

Drop real Azure Pronunciation Assessment captures here as `*.json` files.
Each file is **one fixture object or an array of them** (see `TEMPLATE.json`).
`README.md` and any file matching `*template*` are ignored by the loader.

Once fixtures are present, `npm run validate:speech` automatically includes
them in the report and computes the **real** false-positive / false-negative
rates against the production targets (< 1% FP, < 5% FN).

## Fixture shape

| field | required | meaning |
|-------|----------|---------|
| `label` | yes | ground-truth category (see list below) |
| `referenceText` | yes | the target Russian word/phrase shown to the learner |
| `recognizedText` | yes | Azure `DisplayText` / `NBest[0].Display` |
| `azure.accuracy` | yes | `NBest[0].PronunciationAssessment.AccuracyScore` (0–100) |
| `azure.fluency` | rec. | `FluencyScore` (0–100) |
| `azure.completeness` | rec. | `CompletenessScore` (0–100) |
| `azure.confidence` | rec. | `NBest[0].Confidence` (0–1) |
| `words` | opt. | per-word `[{word, accuracy, error}]` |
| `speaker` | opt. | `native-ru` \| `uzbek-learner` \| `other` |
| `expectPass` | opt. | override the label default (drives FP/FN) |
| `id`, `capturedAt` | opt. | provenance |

## Labels (ground truth)

**Should PASS** (a false negative if rejected):
`correct`, `slight-mistake`, `strong-accent`, `wrong-stress`, `multiform`

**Should FAIL** (a false positive if accepted):
`wrong-russian`, `uzbek-word`, `english-word`, `silence`, `mic-noise`,
`incomplete`, `wrong-ending`, `partial-phrase`, `low-confidence`,
`transcript-mismatch`, `random-echo`

> A `transcript-mismatch` where the **target word itself was pronounced
> correctly** (Azure just appended noise words) should carry
> `"expectPass": true` — failing it would be a production false negative.

## How to capture

Use `../../record-azure-fixture.html` (see the top-level
[`../../README.md`](../../README.md) → *Real-world calibration*).
