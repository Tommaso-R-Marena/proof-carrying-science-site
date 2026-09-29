# Proof-Carrying Science Website

Zero-build static launch-preview site for Proof-Carrying Science.

## Local preview

```bash
python -m http.server 8000
```

Open `http://localhost:8000/`.

Run the repository-local static checks:

```bash
python scripts/check_site.py
```

## Pages

- `index.html` — landing page
- `demo.html` — illustrative PK/PD assurance demo
- `intake.html` — browser-only pilot-intake builder
- `privacy.html` — current launch-preview privacy statement
- `404.html` — static not-found page

## Deployment target

Designed for Cloudflare Pages using GitHub integration.

Recommended initial settings:

- Framework preset: **None**
- Production branch: **main**
- Build command: **leave blank**
- Build output directory: **/**
- Root directory: **repository root**

Cloudflare Pages supports static HTML without a framework or build command. The repository-level `_headers` file applies security headers and prevents `pages.dev` preview URLs from being indexed.

## Launch posture

Keep this repository private while iterating. A deployed `pages.dev` URL is still reachable on the public internet, so do not place secrets, private source, customer data, signing keys, unpublished research results, or regulated data here.

The interactive demo is explanatory and does not perform the production PCS cryptographic verification path.

Before enabling search indexing or a custom domain:

1. confirm company/product naming;
2. review public claims and privacy language;
3. add an approved design-partner contact route;
4. decide whether the website source should remain private;
5. remove the global `robots.txt` disallow rule when intentionally launching.
