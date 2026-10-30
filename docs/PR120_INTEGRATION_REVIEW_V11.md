# Original local qualification snapshot

This dated record describes the source before publication. Current hosted qualification, PR head and merge state are in [website PR #120](https://github.com/Tommaso-R-Marena/proof-carrying-science-site/pull/120). The user subsequently authorized merging qualified changes; no historical receipt is rewritten to describe that later event.

# PR #120 local integration review

Unpublished candidate based on protected website main `89e512abd7830284227d820c0197d61cabedef6a` and PR #120 `d2732de2831db6b30b4f65b2b4eb729e352b7df4`. No production deployment or main merge was performed.

The package.json and homepage merge conflicts are resolved while retaining main's deployment, calibration, D1-forward, search-quality and onboarding checks. Assurance Fold joins the existing test/deploy scripts and homepage entry points. The 477 Node tests pass under Node 22.23.3. The initial Node 24 run without the worktree dependency link failed to resolve miniflare and is not counted as passing.

Static validation covers 66 HTML pages; the static security campaign passes 42 checks. The free-infrastructure check passes. Wrangler 4.149.0 builds the Worker with `deploy --dry-run`; nothing was uploaded. Local Chromium smoke tests at 390 and 1440 pixels interact with token selection, seating and feedback, with no page errors, horizontal overflow or automatic POSTs. This is a local UI observation, not a live Cloudflare integration test or scientific authority verdict.

The five bundled font binaries remain unchanged. `public/fonts/licenses` adds upstream OFL texts and exact source URLs/blob identities, binary hashes and embedded metadata. Exact upstream release/subset provenance remains unestablished; the records do not close PCS licensing issue #11.

PCS repository integration and external/governance issues are not resolved by this website candidate. Site issue #2 still requires owner decisions. Published historical Paper Demos receipts remain unchanged. Fresh independent receipts were written separately to the review bundle: seven Lean countermodels, the Bridge tutorial and the signed Penguins receiving replay all passed, with population/causal validity explicitly open. The writer now requires exact true package/replay/authority flags, the checked goal digest, unchanged input/compiler identities and an exclusive fresh output destination. Eleven metadata/overwrite-refusal tests pass and are required by verify:release; those unit tests are not themselves kernel verification.
