# Proof-Carrying Science Website

Public-facing static site for Proof-Carrying Science.

Live preview:

`https://proof-carrying-science-site.marenatommaso.workers.dev`

## What is real

The site intentionally has no application backend. Its interactive functionality runs locally in the browser:

- **Production-format live verifier** — validates a PCS v0.5 virtual package, staged file hashes, Ed25519 package signature, restricted one-compartment PK + direct Emax PD replay, claim reassessment, reviewer policy, tamper demonstration, compatible package upload, downloadable verification receipt, and 11 frozen decision-parity vectors.
- **PK/PD model lab** — generates the restricted model and prediction trajectory, replays it through the browser engine, and exports production-compatible `manifest.json`, `pk_model.json`, and `predictions.csv` for the Python CLI.
- **Pilot intake builder** — validates claim/assumption IDs, computes a canonical SHA-256 semantic commitment, and exports both `pilot_intake.json` and `pilot_intake.lock.json`.
- **Contact workflow** — direct contact at `marenatommaso@gmail.com`, local clipboard support, and a browser-generated `mailto:` design-partner inquiry.
- **Original PCS logo** — `public/logo-mark.svg`.

The browser verifier is a functional demonstration, not the production PCS Python verifier. Its built-in signing key is explicitly demo-only.

## Repository layout

Only `public/` is deployable.

```text
public/
  index.html
  demo.html
  model-lab.html
  intake.html
  contact.html
  privacy.html
  404.html
  styles.css
  demo.js
  model-lab.js
  pcs-engine.js
  pcs-reference.js
  intake.js
  contact.js
  logo-mark.svg
  pcs-v05-reference-package.json
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

The checker validates internal assets, the real contact address, local-only JavaScript posture, security headers, logo metadata, and the SHA-256/fingerprint consistency of the signed browser fixture.

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
- verifier uploads remain local to the browser;
- pilot-intake entries remain local to the browser;
- CSP and browser-hardening headers live in `public/_headers`;
- search indexing remains intentionally disabled during alpha.

Never place secrets, customer data, signing private keys, unpublished research artifacts, PHI, or regulated data in this repository.
