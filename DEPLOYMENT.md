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

Keep the website Git connection active on protected `main`, with preview builds
disabled. Configure its build command as:

```bash
bash scripts/cloudflare_build.sh
```

Set `NODE_VERSION=22.23.3` and `PYTHON_VERSION=3.12.14`. Cloudflare's asdf Python
can lack `_sqlite3`; the script verifies a real SQLite transaction and selects
the Ubuntu system Python if necessary, preserving the Node/npm PATH. Python
3.12 or 3.13 is required, and the actual Python/SQLite versions are logged.
The complete website gate and migration test still run; missing runtimes fail
closed. GitHub verification uses the pinned Python 3.12.14 runtime.

Configure its deploy command as:

```bash
npx --no-install wrangler deploy --keep-vars
```

No generated application bundle is required. The build command validates the
real static site, Worker, database migrations and security tests before deploy.
Keep `package-lock.json` in build path filters, use the existing locked Wrangler,
and preserve all live bindings. Never replay historical D1 migrations remotely.

Use the existing Workers Free plan only. Do not add subscriptions, payment
details, paid runners, quota increases or usage-based paid services. Cloudflare
documents 3,000 free build minutes per month; stop when the free allowance is
exhausted. Check the actual account plan/limits before starting manual builds.

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
