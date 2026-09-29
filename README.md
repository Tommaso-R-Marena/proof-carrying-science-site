# Proof-Carrying Science Website

Zero-build static launch-preview site for Proof-Carrying Science.

## Live preview

Cloudflare Workers Static Assets deployment:

`https://proof-carrying-science-site.marenatommaso.workers.dev`

## Repository layout

Only `public/` is deployable.

```text
public/
  index.html
  demo.html
  intake.html
  privacy.html
  404.html
  styles.css
  demo.js
  intake.js
  _headers
  robots.txt
```

Repository metadata, scripts, Git objects, and documentation are outside the configured asset directory and must never be published.

## Local preview

```bash
python -m http.server 8000 --directory public
```

Then open `http://localhost:8000/`.

Run the static safety check:

```bash
python scripts/check_site.py
```

## Cloudflare deployment

The committed `wrangler.jsonc` is the deployment source of truth:

- Worker name: `proof-carrying-science-site`
- static assets directory: `./public`
- `workers.dev`: enabled
- version/preview URLs: disabled
- Worker observability: disabled
- 404 handling: static `404.html`

Git-connected deployments may continue to use:

```bash
npx wrangler deploy
```

Wrangler will read the committed configuration and upload only `public/`.

## Security/privacy posture

- no backend;
- no account system;
- no database;
- no first-party analytics;
- no external JavaScript;
- pilot-intake entries stay in the browser;
- CSP and browser-hardening headers are declared in `public/_headers`;
- preview site is intentionally non-indexed during alpha.

Never place secrets, customer data, signing keys, unpublished research artifacts, PHI, or regulated data in this repository.
