# Conservative transport lab v3

The existing Lean Learning Lab navigation now links to [`transport-workflow-v3.html`](../public/transport-workflow-v3.html). Existing hash-bound scientific v2 pages and artifacts are unchanged.

The usable lab displays the actual five-cell/six-edge finite-volume network and all 17 computed states from the final signed PCS core v3 experiment. It has a beginner three-step guide, play/pause, previous/next/reset, a native state slider, keyboard Arrow/Home/End/Space navigation, concentration colors, directional flux arrows, readable cell/volume/concentration cards and exact state inspection. Stepping, resetting or moving the slider pauses playback; backgrounding the page stops its timer.

The model is clearly **synthetic numerical computation, not empirical measurements**. Browser floating-point edge-flux evolution agrees with every retained next state within `1e-12` in the unit test. Displayed arrows and sums are estimates; the state correspondence and signed recorded evidence are distinct from new checking. Amount is measured in mol, concentration in mol/m³, conductance in m³/s and time in s. The decreasing squared-concentration functional is explicitly not thermodynamic energy.

Actual recorded compiled results support three dimensional predicates only. Numerical, continuum and empirical PCS claims remain OPEN; scientific acceptance and independent human review remain false. No new Lean checker, remote backend, arbitrary submitted code, training, collection or production database mutation is performed.

All retained contract/CSV/bundle/key/license/receipt assets are checked against the published unsigned byte inventory before controls become enabled. Fetches use a finite literal same-origin allowlist and omit credentials. Unknown manifest names are rejected before fetching them. Recorded contract, trajectory and bundle identities must match the actual published bytes. An unsigned hash match is not cryptographic scientific authority; the page provides the genuine existing local intake/replay commands and a pinned experimental public-key fingerprint.

The actual signed bundle remains byte-identical to core final evidence: `e42cd03113e5f65b7eaa0399bb1dc05be50cf5689ed1980caa058cd252442681`. The experimental PUBLIC-key fingerprint is `641d1c28dbb6aeb20bd606cfbe406059d4782f339467d9b94485a8390e60d988`. Private keys and private filesystem paths are not published in the curated receipt.

## Executed validation

```bash
node --test tests/transport-workflow-v3.test.mjs
node scripts/browser_transport_workflow_v3.cjs
python scripts/check_site.py
```

All four Node tests pass: actual asset/source-bound browser fingerprints, fixed model shape, real floating edge-flux updates against all retained exact states, amount preservation, safe numerical inputs, CFL/topology checks and prevention of empirical/scientific-authority relabeling.

Actual Chromium passed at **320, 768 and 1440 pixels**, with reduced motion. It exercised the actual five circles/six edges, next/previous, keyboard endpoints, play/pause/step conflicts, automatic pause on manual stepping, slider and reset, conserved amount display, and the actual signed-bundle download digest. There were no page errors, horizontal overflow, API calls or POST requests. Corrupted trajectory bytes fail closed; an injected unlisted manifest asset is rejected before requesting it.

The preserved source-bound browser receipt is [`browser-validation.json`](../public/reasoning/scientific-workflow-v3/browser-validation.json), SHA-256 `680e31bf2b654f57ac18dfe18c315949b0f9f510cbf8c658900fb88e79bf7f57`. The published unsigned asset manifest digest is `166bcd52241380a5c5f9b46b2316bda1aa351eebf37c0ffa685ef48d25c7efed`. The static site gate passed with 60 HTML pages, retaining its network restriction. These are locally executed browser outcomes, not a claim of deployed production verification.

Root release integration owns protected CI/package wiring and deployment. Scientific limits and all core signed negative controls remain in the core `PCS_SCIENTIFIC_PLATFORM_CONTINUATION_REPORT.md`.
