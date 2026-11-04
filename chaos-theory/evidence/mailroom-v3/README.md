# Mailroom v0.3 local evidence

Text console copies remove trailing whitespace only for repository hygiene. `console-raw.tar.gz` retains the exact original console files and failure-context Markdown. No result or warning was removed.

These are automated engineering runs. Human participants: **0**. Live-model calls: **0**. No deployment or production PCS authority is involved.

- `winning-replay.json` and `carried-replay.json`: actual browser input exports; periodic/final checksums independently replayed by Node.
- `cross-engine-replays.json`: SHA-256 comparisons of both browser exports for each route. Byte equality is measured for these runs, not a universal determinism or trusted-origin claim.
- `browser-run-*-*.json`: exact seed, ticks, methods, hearts and escape outcome for both routes/engines.
- `automated-replay.webm`, `automated-replay-report.json`, `recorded-result.png`: silent browser playback of the winning sorter inputs with automation watermark and a checked final checksum. One input tick is fed per animation frame; measured wall time is separate from fixed-rate game time.
- `sorter/`, `carried/`, desktop/mobile menu/arena and optional-observation screenshots: actual Playwright captures.
- `coverage.json`, `coverage-run.log`: 108 unit/integration tests; covered module list and exact counts are in the report.
- `e2e-run.log`, `firefox-run.log`: complete 12-case suites. `presentation-*-run.log` reruns both routes after the final belt-label layout repair.
- `production-smoke.json`, `production-run.log`: current built-asset scan, browser frame sampling and restarts. A phone-sized viewport is not a real phone test.
- `soak.json`, `soak-run.log`: 120 deterministic simulation rounds. Bounded state does not establish all browser memory behavior.
- `synthetic-fixtures.json`: 36 explicitly programmed tool fixtures, not learned-model results.
- `synthetic-playtest-*.json`, `synthetic-playtest-analysis.*`: synthetic opt-in UI/export/analysis examples, not recruited people or evidence of enjoyment.
- `source-sha256.json`: unsigned comparison hashes for source/scripts/tests/configuration; the PR commit and CI associate them with reviewable source. No immutable root is claimed.
- `negative/`: retained development failures and interpretation. These are not counted as final passes.

See [the technical report](../../docs/MAILROOM_V3_REPORT.md), [privacy](../../docs/PRIVACY.md) and [unconducted newcomer protocol](../../docs/PLAYTEST_PROTOCOL.md). Historical v0.1/v0.2 evidence is retained separately. Local results do not substitute for consented newcomer observation, real-device measurements, or subjective audio/accessibility evaluation.
