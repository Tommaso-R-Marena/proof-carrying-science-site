# Zero-cost Cloudflare deployment

The current deployment target is **Cloudflare Workers Static Assets**, which is what the connected build log configured.

## Canonical URL

```text
https://proof-carrying-science-site.marenatommaso.workers.dev
```

## Critical deployment rule

The committed `wrangler.jsonc` points to:

```json
"assets": {
  "directory": "./public"
}
```

Do not change this to `"."`. Deploying the repository root can expose Git metadata, build files, scripts, or other unintended files.

## Git-connected deployment

The connected Cloudflare project may use:

```bash
npx wrangler deploy
```

No application build step is required.

Before deployment:

```bash
python scripts/check_site.py
```

## Post-deployment checks

Open:

- `/`
- `/demo.html`
- `/intake.html`
- `/privacy.html`
- a nonexistent path to confirm the 404 page.

Confirm that repository-only paths are unavailable, especially:

```text
/.git/HEAD
/README.md
/DEPLOYMENT.md
/scripts/check_site.py
/wrangler.jsonc
```

They must return not-found behavior because they are outside `public/`.

## Alpha indexing

`public/robots.txt` currently disallows crawlers. `public/_headers` also sends `X-Robots-Tag: noindex` on the production workers.dev hostname.

Keep those controls until public launch is intentional.
