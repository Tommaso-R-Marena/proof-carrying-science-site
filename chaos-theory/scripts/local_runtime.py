"""Bounded local CPU inference and JSON-lines executor processes. No hosted API."""
import json
import os
import selectors
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from local_model_interactive import EXPECTED, sha, parse


def child_environment():
    # Preserve network/CA configuration; do not pass provider/GitHub/Cloudflare credentials.
    allowed = ("PATH", "LANG", "LC_ALL", "TMPDIR", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
               "http_proxy", "https_proxy", "all_proxy", "no_proxy", "SSL_CERT_FILE", "SSL_CERT_DIR",
               "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE", "NODE_EXTRA_CA_CERTS", "NODE_USE_ENV_PROXY")
    return {k: os.environ[k] for k in allowed if k in os.environ}


def manifest(model, runtime):
    if sha(model) != EXPECTED:
        raise ValueError("Wrong official Qwen3-0.6B Q8_0 weight hash")
    runtime = Path(runtime)
    return {"weightHash": EXPECTED, "runtimeFiles": {p.name: sha(p) for p in runtime.parent.iterdir()
             if p.name == "llama-server" or p.suffix == ".so"}, "childEnvironmentNames": sorted(child_environment()),
             "limitation": "Fixed local process and unsigned hashes; host/runtime remain trusted. No immutable storage, external administration or independent source build is established."}


class LocalModel:
    def __init__(self, model, runtime, output, maximum_calls):
        self.model, self.runtime, self.output = Path(model), Path(runtime), Path(output)
        self.maximum_calls, self.calls = maximum_calls, 0

    def __enter__(self):
        self.before = manifest(self.model, self.runtime)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        self.endpoint = f"http://127.0.0.1:{port}"
        flags = [str(self.runtime), "--model", str(self.model), "--alias", "qwen3-0.6b-q8_0", "--host", "127.0.0.1", "--port", str(port),
                 "--threads", "2", "--threads-batch", "2", "--ctx-size", "4096", "--parallel", "1", "--predict", "384", "--jinja",
                 "--chat-template-kwargs", '{"enable_thinking":false}', "--no-mmap", "--no-webui"]
        self.log = (self.output / "runtime.log").open("x")
        self.server = subprocess.Popen(flags, stdout=self.log, stderr=self.log, env=child_environment())
        try:
            for _ in range(120):
                if self.server.poll() is not None:
                    raise RuntimeError("Inference process exited")
                try:
                    with urllib.request.urlopen(self.endpoint + "/health", timeout=1) as r:
                        if r.status == 200:
                            return self
                except (OSError, urllib.error.URLError):
                    time.sleep(1)
            raise RuntimeError("Inference process readiness timed out")
        except BaseException:
            self.close()
            raise

    def complete(self, request):
        if self.calls >= self.maximum_calls:
            raise RuntimeError("Model request budget exhausted")
        self.calls += 1  # Reserve even errors; no silent retries.
        start = time.monotonic()
        response, status = None, "ok"
        try:
            q = urllib.request.Request(self.endpoint + "/v1/chat/completions", data=json.dumps(request).encode(), headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(q, timeout=120) as r:
                raw = r.read(100_001)
                if len(raw) > 100_000:
                    raise ValueError("Response exceeds bounds")
                response = json.loads(raw)
        except (OSError, ValueError, urllib.error.URLError):
            status = "inference_error"
        return {"status": status, "response": response, "actions": parse(response) if status == "ok" else None,
                "durationMs": round((time.monotonic() - start) * 1000)}

    def close(self):
        self.server.terminate()
        try:
            self.server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.server.kill()
            self.server.wait()
        self.log.close()

    def __exit__(self, *_):
        try:
            if manifest(self.model, self.runtime) != self.before:
                raise RuntimeError("Model/runtime changed during inference")
        finally:
            self.close()


class RecoveryBridge:
    def __init__(self, base, output):
        self.base, self.output = Path(base), Path(output)

    def __enter__(self):
        self.log = (self.output / "bridge.log").open("x")
        self.child = subprocess.Popen(["node", str(self.base / "node_modules/tsx/dist/cli.mjs"), str(self.base / "scripts/recovery-bridge.ts")],
                                      stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.log, text=True, bufsize=1, env=child_environment())
        return self

    def request(self, value):
        self.child.stdin.write(json.dumps(value) + "\n")
        self.child.stdin.flush()
        with selectors.DefaultSelector() as selector:
            selector.register(self.child.stdout, selectors.EVENT_READ)
            if not selector.select(15):
                raise RuntimeError("Recovery bridge timed out")
        result = json.loads(self.child.stdout.readline())
        if not result.get("ok"):
            raise RuntimeError("Recovery bridge rejected request")
        return result

    def __exit__(self, *_):
        self.child.terminate()
        try:
            self.child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.child.kill()
            self.child.wait()
        self.log.close()
