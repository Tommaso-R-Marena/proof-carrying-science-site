/* Real local-page layout probe, using the project's pinned Playwright. */
const {chromium} = require('playwright');

async function main() {
  const [executablePath, rawUrl, rawWidth, rawHeight, screenshot] = process.argv.slice(2);
  const url = new URL(rawUrl), width = Number(rawWidth), height = Number(rawHeight);
  if (url.origin !== 'http://127.0.0.1:4173' || !Number.isInteger(width) ||
      !Number.isInteger(height) || width < 320 || width > 2000 || height < 500 || height > 2000) {
    throw new Error('Expected bounded dimensions and the isolated local layout server');
  }
  const browser = await chromium.launch({executablePath, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']});
  try {
    const page = await browser.newPage({viewport: {width, height}});
    // Third-party analytics cannot affect the deterministic local layout gate.
    await page.route('**/*', route => new URL(route.request().url()).origin === url.origin
      ? route.continue() : route.abort());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(rawUrl, {waitUntil: 'domcontentloaded', timeout: 15000});
    await page.locator('#pcs-layout-report').waitFor({state: 'attached', timeout: 10000});
    if (screenshot) await page.screenshot({path: screenshot, fullPage: true});
    if (errors.length) throw new Error('Page exceptions: ' + errors.join('; '));
    if (!screenshot) process.stdout.write(await page.content());
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
