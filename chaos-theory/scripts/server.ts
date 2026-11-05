/** Optional loopback configuration-status service. No evaluation endpoint, secrets, CORS or persistent logs. */
import { createServer } from "node:http";
import { configurationStatus, liveConfiguration } from "../src/live";
const status = configurationStatus(liveConfiguration());
const server = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Reject browser cross-origin requests; model execution is CLI-only with explicit opt-in.
  if (
    req.headers.origin ||
    req.headers.host !== "127.0.0.1:8788" ||
    req.method !== "GET" ||
    req.url !== "/status"
  ) {
    res.writeHead(404);
    res.end(
      JSON.stringify({
        error:
          "Not found. Evaluation is available only through the explicit opt-in CLI.",
      }),
    );
    return;
  }
  res.end(JSON.stringify({ version: 1, ...status, evaluationEndpoint: false }));
});
server.listen(8788, "127.0.0.1", () =>
  console.log(
    "Research status: http://127.0.0.1:8788/status (no model evaluation endpoint)",
  ),
);
process.on("SIGINT", () => server.close());
process.on("SIGTERM", () => server.close());
