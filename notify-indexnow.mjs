const host = "proof-carrying-science-site.marenatommaso.workers.dev";
const key = "4a8be5e8bd83709358d1e1ab56e3196c";
const origin = `https://${host}`;
const keyLocation = `${origin}/${key}.txt`;
const paths = [
  "/",
  "/researcher-pilots.html",
  "/research-preview.html",
  "/guided-submission.html",
  "/package-inspector.html",
  "/result-anatomy.html",
  "/validation.html",
  "/validation-registry.html",
  "/trust.html",
  "/trust-explorer.html",
  "/architecture.html",
  "/mvp.html",
  "/contact.html"
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDeployment() {
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      const response = await fetch(keyLocation, { redirect: "follow" });
      const body = (await response.text()).trim();
      if (response.ok && body === key) return;
    } catch {}
    if (attempt < 12) await sleep(5000);
  }
  throw new Error("deployed IndexNow ownership key was not reachable after Wrangler deploy");
}

await waitForDeployment();

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host,
    key,
    keyLocation,
    urlList: paths.map(path => origin + path)
  })
});

const body = await response.text();
if (![200, 202].includes(response.status)) {
  throw new Error(`IndexNow rejected URL batch: HTTP ${response.status} ${body}`);
}
console.log(`IndexNow accepted ${paths.length} public URLs with HTTP ${response.status}.`);
