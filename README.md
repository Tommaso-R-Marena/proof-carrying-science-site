# Proof-Carrying Science Website

Public-facing static site for Proof-Carrying Science.

Live preview:

`https://proof-carrying-science-site.marenatommaso.workers.dev`

## What is real

The site intentionally has no application backend. Its interactive functionality runs locally in the browser:

- **Completed Result Anatomy** — educational v0.6 result walkthrough showing `valid`, claim status, and `accepted` as separate axes, using the real verifier/receipt field names while explicitly labeling scenario values as illustrative rather than a live verification.\n- **Guided Submission** — beginner-first five-step flow (`Project → Claim → Review → Prepare → Ready`) that reuses the exact browser Project Mapper engine, keeps files local, maps human intent only to supported typed claim templates, renders plain-language explanations from the formal predicate, progressively discloses the exact machine contract, and stops honestly at the authoritative CLI confirmation/signing boundary.\n- **Trust Center** — distinguishes the legacy PCS 0.5 browser fixture, the machine-checked v0.6/v2 theorem boundary with explicit remaining contracts, the merged v0.6 executable mainline, executed cross-machine/runtime evidence, and explicit non-claims.
- **Machine-readable trust state** — `public/status.json` mirrors the released checker/proof/parity/preview state and is cross-checked against the shipped browser fixture by the deployment gate.
- **Security contact** — `public/.well-known/security.txt` provides a standard disclosure/contact path.
- **Responsive shared navigation** — dependency-free mobile menu and small shared UI helpers in `site.js`.
- **Local Project Mapper** — lets a scientist choose an existing project folder, computes local SHA-256 artifact snapshots, detects supported PK/PD/split/reaction/unit patterns, previews heuristic Python/Jupyter/R artifact flow without executing source code, renders a visual workflow graph, allows independent check/workflow selection, and exports non-attestable machine-readable plus Markdown review artifacts without uploading project files.
- **Independent static-workflow replay** — the production v0.6 verifier reconstructs exact delivered source files and re-runs workflow discovery before scientific replay. Clean AST graphs require exact dependency-set equality; weaker mappings require every signed edge to be rediscovered.
- **v0.6 MVP product surface** — documents the complete `discover-v06 → confirm-v06 → attest-v06 → deterministic self-verified ZIP → verify-v06-bundle → reviewer policy → receipt` loop, the five initial executable checks, and the exact formal boundary.
- **Local v0.6 policy lab** — demonstrates the production semantics that PCS package validity and reviewer acceptance are different axes, computes SHA-256 over the exact displayed reviewer-policy bytes, and produces an illustrative receipt without network calls.
- **Adaptive replay scheduler** — documents and demonstrates deterministic ordering baselines plus the experimental contextual-bandit scheduler, shadow mode, telemetry privacy, cold-start thresholds, and the invariant that all mandatory checks execute and scientific verdicts ignore scheduler outputs.
- **Multi-reviewer quorum governance** — documents and publishes a role-aware 2-of-3 review policy: authorized reviewer fingerprints, role-specific policy SHA-256 requirements, duplicate-identity rejection, and exact-subject grouping so reviews over different bundles cannot combine.
- **Real-world validation evidence** — publishes the first 5-case public-data validation set: Haber–Bosch chemistry, clean and contaminated UCI Iris splits, Indometh unit equivalence, and an IV Indometh single-exponential falsification case. All 5 matched predeclared expectations, including 2 expected failures.
- **Executed runtime portability evidence** — fail-closed CircleCI campaigns cover Ubuntu 24/26, amd64/ARM64, Docker/rootful Podman, native R, and repeated deterministic replay.
- **Offline dependency reconstruction** — signed hash-locked NumPy wheels and signed local R repository payloads are restored with network-disabled builds; the base images are checked not to contain the target dependency.
- **Native ABI evidence** — PCS captures native-extension SHA-256 fingerprints and has demonstrated architecture-specific binary differences with byte-identical scientific outputs for the tested workload.
- **Legacy v0.5 browser parity verifier** — validates the frozen PCS 0.5.0 reference package or an extracted v0.5 evidence directory, hashes exact selected file bytes, verifies Ed25519 package signatures when present, replays restricted one-compartment PK + direct Emax PD evidence, reassesses claims, and runs 11 frozen decision-parity vectors. It is intentionally labeled as a parity/transparency fixture rather than the current v0.6 product verifier.
- **PK/PD model lab** — generates the restricted model and prediction trajectory, replays it through the browser engine, and exports production-compatible `manifest.json`, `pk_model.json`, and `predictions.csv` for the Python CLI.
- **Pilot intake builder** — validates claim/assumption IDs, computes a canonical SHA-256 semantic commitment, and exports both `pilot_intake.json` and `pilot_intake.lock.json`.
- **Contact workflow** — direct contact at `marenatommaso@gmail.com`, local clipboard support, and a browser-generated `mailto:` design-partner inquiry.
- **Original PCS logo** — `public/logo-mark.svg`.

The browser verifier is a functional demonstration, not the production PCS Python verifier. Its built-in signing key is explicitly demo-only.

The strongest current machine-checked theorem stack now targets the exact v0.6/v2 representation. Lean proves canonical decoding and schema structure, package/member/hash/index binding, signature wiring, archive partitioning, normalized decisions, and the bridge into scoped `ScientificAssurance`; `reaction_balance` replay faithfulness is also proved in Lean. The raw ZIP decoder, production-Python → Lean refinement, environment-capture soundness, replay faithfulness for the other check types, cryptographic unforgeability, and independent SHA-256/Ed25519 spec-faithfulness remain explicit trust boundaries. The integrated layer lives on the model `main` branch and is checked by Lean 4.28 CI.

## Repository layout

Only `public/` is deployable.

```text
public/
  index.html
  project-builder.html
  mvp.html
  validation.html
  trust.html
  status.json
  .well-known/security.txt
  architecture.html
  demo.html
  model-lab.html
  intake.html
  contact.html
  privacy.html
  404.html
  styles.css
  site.js
  project-builder.js
  mvp.js
  demo.js
  model-lab.js
  pcs-engine.js
  pcs-reference.js
  intake.js
  contact.js
  logo-mark.svg
  pcs-v05-reference-package.json
  reviewer-policy.example.json
  review-quorum-policy.example.json
  review-set.example.json
  real-world-validation-2026-09-29.json
  _headers
  robots.txt
```

Repository metadata, scripts, Git objects, and documentation remain outside the configured asset directory.

## Local preview

```bash
python -m http.server 8000 --directory public
```

Then open `http://localhost:8000/`.

Run the static safety/integrity audit:

```bash
python scripts/check_site.py
```

The checker validates internal assets, the real contact address, local-only JavaScript posture, security headers, logo metadata, the v0.6 MVP/status/policy/quorum/adaptive-scheduler surfaces, the 5-case real-world validation evidence, the Trust Center/shared navigation, and the SHA-256/fingerprint consistency of the legacy 0.5.0 browser fixture.

## Cloudflare deployment

The committed `wrangler.jsonc` is the source of truth:

- Worker: `proof-carrying-science-site`
- Static assets: `./public`
- `workers.dev`: enabled
- Preview URLs: disabled
- Worker observability: disabled
- Static 404 handling enabled

Git-connected deployments can use:

```bash
npx wrangler deploy
```

## Security/privacy posture

- no database;
- no user accounts;
- no first-party analytics;
- no third-party JavaScript;
- no scientific-data submission endpoint;
- verifier package JSON and extracted-directory selections remain local to the browser;
- Project Mapper file selections, hashes, and manifest drafts remain local to the browser;
- pilot-intake entries remain local to the browser;
- CSP and browser-hardening headers live in `public/_headers`;
- search indexing remains intentionally disabled during alpha.

Never place secrets, customer data, signing private keys, unpublished research artifacts, PHI, or regulated data in this repository.


### Reproducibility environment preview

The Project Mapper now previews Python/R dependency declarations, common lockfiles,
interpreter constraints, Conda/Nix specifications, and Docker/OCI base-image
pinning. It exposes a descriptive hermeticity state and downloadable
`pcs-environment-plan.json`.

The browser preview is intentionally non-authoritative. `confirm-v06` regenerates
the canonical environment capture from the exact reviewed artifact bytes using the
production Python parser before attestation. Reviewer verification independently
re-derives the same signed environment contract at `environment_replay`.

The website never executes package managers, environment installers, container
builds, or project installation hooks.


### Claim semantics

Free-form language is never treated as the formal predicate. The beginner flow may use the user’s words to highlight a supported template, but the rigorous claim is the typed PCS predicate/check. Current built-ins are dataset disjointness, reaction balance, unit compatibility, PK/PD contract validity, and PK/PD reference matching. Unsupported claims remain explicitly unformalized.
\nDemo shortcuts: `guided-submission.html?demo=1` launches the synthetic guided walkthrough; `result-anatomy.html` explains the completed v0.6 review result structure.\n