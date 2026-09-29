# Free deployment checklist

## Cloudflare Pages

1. Create/sign in to a free Cloudflare account.
2. Go to **Workers & Pages → Create → Pages → Connect to Git**.
3. Authorize the GitHub integration for `Tommaso-R-Marena/proof-carrying-science-site`.
4. Select this repository.
5. Production branch: `main`.
6. Framework preset: **None**.
7. Leave **Build command** blank.
8. Set the output directory to the repository root if the UI requires one.
9. Deploy.
10. Open the generated `*.pages.dev` URL and test:
   - homepage;
   - interactive demo;
   - pilot-intake download;
   - privacy page;
   - mobile layout.
11. Confirm response headers include the repository's `_headers` security policy.

## Preview posture

The `_headers` file adds `X-Robots-Tag: noindex` for `pages.dev` preview URLs. `robots.txt` also disallows crawling globally during alpha.

Do not remove these until public launch is deliberate.

## Cost posture

The site has no framework, database, server-side functions, analytics SDK, or third-party JavaScript. Keep it that way until a real customer need justifies additional infrastructure.
