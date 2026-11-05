"""Recovery oracle and deliberate artifact-tampering fixtures, never new model observations."""
import copy
import json
import os
import shutil
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch
from replay_real_model import digest
from local_model_recovery import verify, verify_snapshot
from local_runtime import child_environment, LocalModel

ROOT = Path(__file__).resolve().parent.parent / "evidence/model-recovery-v1"


class RecoveryReplayTests(unittest.TestCase):
    def test_child_processes_receive_network_context_without_credentials(self):
        with patch.dict(os.environ, {"PATH": "/usr/bin", "HTTPS_PROXY": "http://synthetic-proxy",
                                    "SSL_CERT_FILE": "/synthetic/ca", "OPENAI_API_KEY": "fixture-only",
                                    "PCS_LEAN_GITHUB_TOKEN": "fixture-only", "CLOUDFLARE_API_TOKEN": "fixture-only",
                                    "NODE_OPTIONS": "--inspect"}, clear=True):
            self.assertEqual(child_environment(), {"PATH": "/usr/bin", "HTTPS_PROXY": "http://synthetic-proxy", "SSL_CERT_FILE": "/synthetic/ca"})

    def test_failed_transport_consumes_budget_without_retry(self):
        m = LocalModel("not-used", "not-used", "not-used", 1)
        m.endpoint = "http://127.0.0.1:1"
        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("fixture error")) as transport:
            self.assertEqual(m.complete({})["status"], "inference_error")
            with self.assertRaises(RuntimeError):
                m.complete({})
            self.assertEqual(transport.call_count, 1)

    def sample(self):
        protocol = json.loads((ROOT / "state-only/protocol.json").read_text())["protocol"]
        report = json.loads((ROOT / "state-only/report.json").read_text())["report"]
        e = next(e for e in report["episodes"] if e["seedOutcome"]["unsafeEffects"] > 0)
        s = next(c["scenario"] for c in protocol["seedProtocol"]["protocol"]["cases"] if c["id"] == e["caseId"])
        return s, e

    def test_replay_rejects_invented_success_and_boolean_generation(self):
        s, e = self.sample()
        bad = copy.deepcopy(e["initial"])
        bad["generation"] = True
        with self.assertRaises(AssertionError):
            verify_snapshot(s, bad)
        bad = copy.deepcopy(e["initial"])
        bad["result"]["completed"] = True
        with self.assertRaises(AssertionError):
            verify_snapshot(s, bad)

    def test_replay_rejects_reordered_chain_and_post_completion_write(self):
        s, e = self.sample()
        bad = copy.deepcopy(e["final"])
        bad["commits"] = list(reversed(bad["commits"]))
        with self.assertRaises(AssertionError):
            verify_snapshot(s, bad)
        bad = copy.deepcopy(e["final"])
        bad["commits"].append(copy.deepcopy(bad["commits"][-1]))
        with self.assertRaises(AssertionError):
            verify_snapshot(s, bad)

    def test_rehashed_false_success_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="pcs-recovery-tamper-") as temp:
            target = Path(temp) / "copy"
            shutil.copytree(ROOT / "state-only", target)
            p = target / "report.json"
            e = json.loads(p.read_text())
            e["report"]["summary"][1]["recoveryCompleted"] += 1
            e["sha256"] = digest(e["report"])
            p.write_text(json.dumps(e))
            with self.assertRaises(AssertionError):
                verify(target)

    def test_rehashed_stale_obligation_and_matching_model_prompt_are_rejected(self):
        with tempfile.TemporaryDirectory(prefix="pcs-recovery-tamper-") as temp:
            target = Path(temp) / "copy"
            shutil.copytree(ROOT / "history", target)
            p = target / "report.json"
            env = json.loads(p.read_text())
            ep = next(e for e in env["report"]["episodes"] if e["turns"])
            t = ep["turns"][0]
            t["obligation"]["expectedHead"] = "0" * 64
            body = {k: v for k, v in t["obligation"].items() if k != "hash"}
            t["obligation"]["hash"] = digest(body)
            call = env["report"]["calls"][t["call"]]
            msg = json.loads(call["request"]["messages"][-1]["content"])
            msg["expectedHead"] = "0" * 64
            call["request"]["messages"][-1]["content"] = json.dumps(msg, separators=(",", ":"))
            call["requestHash"] = digest(call["request"])
            (target / f"call-{call['index']:03}.json").write_text(json.dumps(call))
            env["sha256"] = digest(env["report"])
            p.write_text(json.dumps(env))
            with self.assertRaises(AssertionError):
                verify(target)


if __name__ == "__main__":
    unittest.main()
