"""Fixed Lean-plus-TypeScript research bridge, never a caller-selected verifier callback."""
import os
import subprocess
from local_runtime import RecoveryBridge, child_environment


class LeanRecoveryBridge(RecoveryBridge):
    def __enter__(self):
        self.log = (self.output / "bridge.log").open("x")
        env = child_environment()
        if os.environ.get("PCS_LEAN"):
            env["PCS_LEAN"] = os.environ["PCS_LEAN"]
        self.child = subprocess.Popen(["node", str(self.base / "node_modules/tsx/dist/cli.mjs"), str(self.base / "scripts/lean-recovery-bridge.ts")],
                                      stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.log, text=True, bufsize=1, env=env)
        return self

    def __exit__(self, *_):
        self.child.stdin.close()  # EOF lets the bridge close its actual Lean child cleanly.
        try:
            self.child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.child.terminate()
            self.child.wait(timeout=10)
        self.log.close()
