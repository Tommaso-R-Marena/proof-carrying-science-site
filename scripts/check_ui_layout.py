#!/usr/bin/env python3
"""Browser-level responsive layout regression checks for the PCS public site.

This gate uses the Chrome/Chromium already present on GitHub's ubuntu-latest
runner. It serves public/ locally, injects a CI-only layout probe into HTML
responses, exercises important dynamic states, and fails on viewport overflow,
clipped primary controls, or overlapping high-level UI regions.

On failure it writes PNG screenshots to artifacts/ui-layout/.
"""

from __future__ import annotations

import html
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ARTIFACTS = ROOT / "artifacts" / "ui-layout"
PORT = 4173

CASES = [
    ("home-1357", "/index.html", 1357, 768),
    ("home-mobile", "/index.html", 390, 844),
    ("guided-demo-step2-1357", "/guided-submission.html?demo=1", 1357, 768),
    ("guided-demo-step2-1024", "/guided-submission.html?demo=1", 1024, 768),
    ("guided-demo-step2-768", "/guided-submission.html?demo=1", 768, 1024),
    ("guided-demo-step2-mobile", "/guided-submission.html?demo=1", 390, 844),
    ("result-tablet", "/result-anatomy.html", 1024, 768),
    ("result-mobile", "/result-anatomy.html", 390, 844),
    ("inspector-loaded-1357", "/package-inspector.html", 1357, 768),
    ("inspector-loaded-mobile", "/package-inspector.html", 390, 844),
]

PROBE = r"""
<script>
(() => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== "none" && cs.visibility !== "hidden" && !el.hidden && r.width > 0 && r.height > 0;
  };
  const waitFor = async (fn, timeout = 3500) => {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      try { if (fn()) return true; } catch (_) {}
      await sleep(50);
    }
    return false;
  };
  const intersects = (a, b) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 3 && h > 3;
  };
  const text = (el) => (el?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 90);

  (async () => {
    if (location.pathname.endsWith("/package-inspector.html")) {
      const b = document.getElementById("loadGolden");
      if (b) b.click();
      await waitFor(() => {
        const s = document.getElementById("inspectorSummary");
        return s && !s.hidden && text(document.getElementById("bundleHash")) !== "—";
      }, 4500);
    }

    if (location.pathname.endsWith("/guided-submission.html")) {
      await waitFor(() => {
        const active = document.querySelector("[data-step-indicator].active");
        const action = document.getElementById("guidedDemoGuideAction");
        return active?.dataset.stepIndicator === "2" && action && !action.hidden;
      }, 4500);
    }

    await sleep(150);

    const issues = [];
    const viewport = document.documentElement.clientWidth;
    const pageWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    if (pageWidth > viewport + 2) {
      issues.push({kind:"page-overflow", detail:`document width ${pageWidth}px > viewport ${viewport}px`});
    }

    const selectors = [
      ".guided-demo-guide",
      ".guided-demo-guide-copy",
      ".guided-demo-guide-state",
      ".guided-demo-guide-action",
      "#guidedDemoNext",
      ".guided-stepper",
      ".guided-claim-workbench",
      ".guided-review-gate",
      ".guided-handoff-map",
      ".role-card-actions",
      ".reviewer-first-glance",
      ".reviewer-inspection-route",
      ".reviewer-package-quickstart",
      ".inspector-drop",
      ".inspector-review-snapshot",
      ".inspector-review-next"
    ];

    const checked = new Set();
    for (const el of document.querySelectorAll(selectors.join(","))) {
      if (!visible(el) || checked.has(el)) continue;
      checked.add(el);
      const r = el.getBoundingClientRect();
      if (r.left < -2 || r.right > viewport + 2) {
        issues.push({kind:"viewport-escape", selector:el.id ? `#${el.id}` : "." + [...el.classList].join("."), detail:`${Math.round(r.left)}..${Math.round(r.right)} within 0..${viewport}`});
      }
      const cs = getComputedStyle(el);
      if ((cs.overflowX === "hidden" || cs.overflowX === "clip") && el.scrollWidth > el.clientWidth + 2) {
        issues.push({kind:"horizontal-clipping", target:text(el), detail:`${el.scrollWidth}px content > ${el.clientWidth}px box`});
      }
      if ((cs.overflowY === "hidden" || cs.overflowY === "clip") && el.scrollHeight > el.clientHeight + 2) {
        issues.push({kind:"vertical-clipping", target:text(el), detail:`${el.scrollHeight}px content > ${el.clientHeight}px box`});
      }
    }

    for (const el of document.querySelectorAll(".button, button")) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.left < -2 || r.right > viewport + 2) {
        issues.push({kind:"control-offscreen", target:text(el), detail:`${Math.round(r.left)}..${Math.round(r.right)} within 0..${viewport}`});
      }
      if (el.scrollWidth > el.clientWidth + 3 && getComputedStyle(el).overflowX !== "visible") {
        issues.push({kind:"control-text-clipped", target:text(el), detail:`${el.scrollWidth}px content > ${el.clientWidth}px control`});
      }
    }

    const guide = document.getElementById("guidedDemoGuide");
    if (visible(guide)) {
      const parts = [
        guide.querySelector(".guided-demo-guide-copy"),
        guide.querySelector(".guided-demo-guide-state"),
        guide.querySelector(".guided-demo-guide-action")
      ].filter(visible);
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          if (intersects(parts[i].getBoundingClientRect(), parts[j].getBoundingClientRect())) {
            issues.push({kind:"guide-overlap", detail:`${parts[i].className} overlaps ${parts[j].className}`});
          }
        }
      }
      if (viewport >= 1200) {
        const copy = guide.querySelector(".guided-demo-guide-copy");
        if (visible(copy) && copy.getBoundingClientRect().width < 430) {
          issues.push({kind:"guide-copy-squeezed", detail:`guide copy is only ${Math.round(copy.getBoundingClientRect().width)}px at ${viewport}px viewport`});
        }
      }
    }

    const result = {
      path: location.pathname + location.search,
      viewport,
      pageWidth,
      issues
    };
    const pre = document.createElement("pre");
    pre.id = "pcs-layout-report";
    pre.textContent = JSON.stringify(result);
    document.body.appendChild(pre);
  })();
})();
</script>
"""

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        pass

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path == "/":
            path = "/index.html"
        if path.endswith(".html"):
            target = (PUBLIC / path.lstrip("/")).resolve()
            try:
                target.relative_to(PUBLIC.resolve())
            except ValueError:
                self.send_error(403)
                return
            if not target.is_file():
                self.send_error(404)
                return
            body = target.read_text(encoding="utf-8")
            if "</body>" not in body:
                self.send_error(500, "HTML missing body end")
                return
            body = body.replace("</body>", PROBE + "\n</body>")
            data = body.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

def find_browser() -> str:
    override = os.environ.get("PCS_CHROME")
    candidates = [override] if override else []
    candidates += [
        "google-chrome",
        "google-chrome-stable",
        "chromium",
        "chromium-browser",
        "chrome",
    ]
    for candidate in candidates:
        if not candidate:
            continue
        found = shutil.which(candidate)
        if found:
            return found
    raise RuntimeError("Chrome/Chromium not found. Set PCS_CHROME or install a browser on the CI runner.")

def chrome_args(browser: str, width: int, height: int, url: str, *, dump: bool, screenshot: Path | None = None) -> list[str]:
    args = [
        browser,
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-sync",
        "--metrics-recording-only",
        "--no-first-run",
        f"--window-size={width},{height}",
        "--virtual-time-budget=5500",
    ]
    if dump:
        args.append("--dump-dom")
    if screenshot is not None:
        args.append(f"--screenshot={screenshot}")
    args.append(url)
    return args

def run_case(browser: str, name: str, path: str, width: int, height: int) -> tuple[bool, dict | None, str]:
    url = f"http://127.0.0.1:{PORT}{path}"
    proc = subprocess.run(
        chrome_args(browser, width, height, url, dump=True),
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
    )
    dom = proc.stdout
    match = re.search(r'<pre id="pcs-layout-report">(?P<data>.*?)</pre>', dom, flags=re.S)
    if not match:
        return False, None, f"layout probe missing (chrome exit {proc.returncode})\n{proc.stderr[-1600:]}"
    try:
        report = json.loads(html.unescape(match.group("data")))
    except Exception as exc:
        return False, None, f"could not decode layout report: {exc}"
    issues = report.get("issues") or []
    if issues:
        return False, report, json.dumps(issues, indent=2)
    return True, report, ""

def capture_failure(browser: str, name: str, path: str, width: int, height: int) -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    target = ARTIFACTS / f"{name}.png"
    url = f"http://127.0.0.1:{PORT}{path}"
    subprocess.run(
        chrome_args(browser, width, height, url, dump=False, screenshot=target),
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=30,
        check=False,
    )

def main() -> int:
    if not PUBLIC.is_dir():
        print("public/ directory not found", file=sys.stderr)
        return 2
    browser = find_browser()
    print(f"UI layout browser: {browser}")

    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    time.sleep(0.15)

    failures = []
    try:
        for name, path, width, height in CASES:
            ok, report, detail = run_case(browser, name, path, width, height)
            if ok:
                print(f"PASS {name}: {width}x{height} · width={report['pageWidth']}px")
            else:
                print(f"FAIL {name}: {width}x{height}\n{detail}", file=sys.stderr)
                failures.append((name, path, width, height, detail))
                capture_failure(browser, name, path, width, height)
    finally:
        server.shutdown()
        server.server_close()

    if failures:
        print(f"\n{len(failures)} responsive UI layout case(s) failed.", file=sys.stderr)
        print(f"Failure screenshots: {ARTIFACTS}", file=sys.stderr)
        return 1

    print(f"\nResponsive UI layout gate passed: {len(CASES)} cases.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
