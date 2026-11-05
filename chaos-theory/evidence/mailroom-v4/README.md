# Mailroom v0.4 evidence

Human participants: **0**. Live-model calls: **0**. These are automated engineering results, not proof of enjoyment, market fit or improved model safety.

- Download `odd-post-offline.zip`, extract it, and open `odd-post.html` in Chrome or Firefox. `portable-build.json`, `portable-smoke.json` and `portable-archive.json` describe the exact tested file. ZIP timestamps are normalized metadata. Four offline browser/viewports and two expected script-tamper blocks were checked.
- `winning-replay.json`, `carried-replay.json`, `cross-engine-replays.json` and browser-run JSON files bind actual heist input exports to independently replayed periodic/final checksums. Byte equality is a measured result for these two engine/controller runs, not a universal or origin theorem.
- `automated-replay.webm`, its report and recorded-result screenshot show silent playback of validated inputs. The watermark identifies automation. Game ticks and measured playback wall time differ.
- Screenshots include the lesson, job board, full heist, phone layout, optional playtest and authored notice desk. The HTML-looking notice in desk screenshots is an intentional XSS regression input; it remained plain text.
- `synthetic-desk-case-*` and `synthetic-replay-case-*` are actual browser-generated authored exports, explicitly synthetic. The latter contain completed replay-bound mappings. Offline inspection reports recheck their hashes, fixed policies and optional replays.
- `guard-campaign.json` contains the 1,200-plan, seven-action, three-family bounded campaign and approved-control checks. `synthetic-fixtures.json` retains the separate 36 programmed fixture evaluations. Neither is a real-model result.
- `coverage.json`, console files, `production-smoke.json` and `soak.json` contain exact test counts, source scope, frame samples, restarts and bounded simulation results. Viewports do not emulate real phone hardware.
- `negative/` retains the initial timeout and packaging failures. Historical v0.1/v0.2/v0.3 evidence is preserved separately.
- `source-sha256.json` is an unsigned source/config/test inventory. The PR commit and CI associate it with a reviewable tree; it cannot authenticate a local host or a human contributor.

Console text copies remove trailing whitespace only; `console-raw.tar.gz` preserves their exact original bytes. Nothing was uploaded from the game, no proof-development trace was used as training data, and the export purpose remains evaluation only.

See the [technical report](../../docs/MAILROOM_V4_REPORT.md), [design](../../docs/GAME_DESIGN.md), [authored-input method](../../docs/AUTHORED_NOTICE_RESEARCH.md) and [privacy description](../../docs/PRIVACY.md).
