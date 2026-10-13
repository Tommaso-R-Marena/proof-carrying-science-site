# Interactive real-data scientific workflow

[`public/scientific-workflow-v2.html`](../public/scientific-workflow-v2.html) extends the existing PCS website with an actual interactive Palmer Penguins measurement explorer. Its three-step guide leads from inspecting observed points to comparing species and reproducing an existing signed PCS scientific package.

The page displays **342 actual complete observations from 344 source records**, with the original exclusions retained. Species subsets contain 151 Adelie, 68 Chinstrap and 123 Gentoo observations. Pointer inspection, arrow-key/Home/End navigation and previous/next buttons show exact source-row identity, island, year, measured flipper length, mass and recorded sex. Switching display units preserves the selected observation. Responsive SVG geometry keeps axis labels readable on phones.

Species filtering actually recalculates a floating-point least-squares line and R² over the selected observations. Users can toggle the line, switch between original mm/g and converted m/kg, and reset the exploration. These computations are explicitly **exploratory browser estimates**, grant no authority and do not change the recorded evidence.

## Actual evidence and downloads

`public/reasoning/scientific-workflow-v2/` contains the unchanged real CC0 source CSV, pinned upstream provenance, original attribution/license, typed scientific contract, actual signed PCS bundle, its PUBLIC verification key, a curated recorded receiver result and three actually executed negative controls. Absolute private/local filesystem paths and private keys are excluded. The downloadable bundle is byte-identical to the final core experiment:

- Source CSV SHA-256: `f204db2c753b0937caac3cb35258562c14f073e4bbc76be24b4c51ce22767a93`.
- Signed bundle SHA-256: `7f503d99a7069a2d3663883520e7c68663241b1f0eed66584bcb343756be8290`.
- Producer public-key fingerprint: `f7e1184ae513ef6fe9688094fa0d64e2d94bb4f9752d3f7c35a2b44b009146e5`.
- Published asset inventory SHA-256: `aaac13dd01d41b46c1b9723fd7588adeb42629880e3cf2917a7ea4dfa7c233a2`.
- Source-bound actual Chromium receipt SHA-256: `140ee2230577f495dad9ebb5c9b4b16a6f4622c9d647ddb6b653ad5e3b53e344`.

The browser checks downloaded artifact bytes against this **unsigned** inventory before displaying the case. This detects mismatched published assets; it does not authenticate scientific claims or replace independently pinned trust. Recorded receiver metadata identifies its original full-receipt digest. The page explains that users must run the provided core receiving command to obtain a new local result.

Each asset has its own fixed reader with a literal same-origin URL and omitted credentials. A manifest cannot select arbitrary routes or remote URLs: unknown names are rejected before any such request. The static scientific-network gate remains enforced. The prior browser receipt and inventory are preserved in the private onboarding evidence; the current public receipt was regenerated against this bounded-reader implementation.

The compiled dimensional predicates were `COMPUTATIONALLY_SUPPORTED` in the recorded experiment; numerical and empirical/causal/population claims remain **OPEN**. A separate receiver replayed exact rational statistics. No Python-to-Lean refinement or authenticated independent human review is claimed. The page displays actual failed controls for a wrong slope, a legitimately signed false report and a signed FALSIFIED dimensional predicate. Selecting a control displays its archived result and runs no new verifier.

## Executed validation

Run:

```bash
node --test tests/scientific-workflow-v2.test.mjs
node scripts/browser_scientific_workflow_v2.cjs
```

All **seven Node tests passed**. They check every public artifact's actual hash, the recorded browser source fingerprints, real dataset/subset accounting, real calculated coefficients, singular/invalid input handling, explicit OPEN/recorded-only boundaries, genuine failed controls and absence of private keys, temporary paths or collection mechanisms.

Actual Chromium passed at **320, 768 and 1440 pixels**, with reduced motion. It exercised all 342 real points, the 123-point Gentoo filter, keyboard/pointer inspection, SI conversion, preserved selection on unit changes, line toggle, reset, exact CSV/bundle downloads, the replay fingerprint and actual negative-control displays. There was no horizontal overflow or browser exception. A deliberately corrupted CSV failed its hash check, left controls disabled and rendered no observations. The preserved receipt is [`browser-validation.json`](../public/reasoning/scientific-workflow-v2/browser-validation.json); it includes exact source digests.

An injected manifest entry for an unlisted asset was rejected before fetching it. The browser campaign confirms no request to that route and no enabled controls after rejection.

There were **zero API or POST requests, remote checker invocations, accounts, human research participants or training actions**. The browser campaign serves actual source/assets from an ephemeral local static server. It is functional/browser evidence, not a claim of deployed production validation. Root release integration handles navigation, protected CI and deployment.

## Boundaries

This page is an exploration and reproducibility interface for one real external dataset and an implemented finite scientific algorithm. It is not a general scientific backend or an arbitrary code-submission service. Biological meaning, causation, population transfer, field-instrument accuracy, sampling design and missingness assumptions remain explicit limitations. No user interaction is donated, retained or converted into training data, and no paid resource is used.
