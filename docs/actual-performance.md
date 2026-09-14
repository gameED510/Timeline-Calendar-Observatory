# Actual Performance

The performance view retains the 16th-to-15th publication count cycle. Settlement
forecasts use the natural publication month three months before the selected month.

Account profiles support `revenueShare` and `commissionRate` in [0, 1]. Existing
profiles default to 0.5 and 0.1. Forecasts multiply platform price, count and both
ratios. Already-settled ad revenue multiplies only the personal commission rate.
The confirmed personal total is authoritative even when detail rows are incomplete.

`timeline_actual_performance` uses authenticated owner-only reads. Writes go through
`save_actual_performance`, which derives ownership from the session and checks the
expected version. The initial snapshot is immutable on subsequent edits. Records
with a null total represent a saved forecast. Missing historical forecasts are
labelled retrospective calculations and excluded from forward evaluation.

Calibration uses the six latest valid prior settlement months, excluding zero
formula estimates. The aggregate actual/formula ratio shrinks toward 1 by n/(n+3).
At least three months are required for a trial calibrated estimate.

OCR runs on-device via a self-hosted Tesseract worker and language models. Models
load only after an explicit recognition action and are not in the shell cache.
Images and OCR text are not persisted or uploaded. Ambiguous project matches remain
editable. Chart.js also loads on demand; combined actual platform revenue is never
arbitrarily split for charts.

Build all vendor assets with `npm run build:vendor`, apply Supabase migrations, then
build the hosting target. `npm run check` covers formulas, parsing and bundle rules.
Sensitive screenshot fixtures and browser verification artifacts belong in ignored
`output/`, not the public repository.
