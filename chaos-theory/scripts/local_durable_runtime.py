"""Opt-in real Lean durable bridge; no model-selected executable or verifier callback."""
import os
import subprocess
from local_runtime import child_environment
from local_lean_runtime import LeanRecoveryBridge


class DurableLeanRecoveryBridge(LeanRecoveryBridge):
    def __enter__(self):
        self.log = (self.output / 'bridge.log').open('x')
        env = child_environment()
        if os.environ.get('PCS_LEAN'):
            env['PCS_LEAN'] = os.environ['PCS_LEAN']
        env['PCS_JOURNAL_OUTPUT'] = str(self.output)
        self.child = subprocess.Popen(['node', str(self.base / 'node_modules/tsx/dist/cli.mjs'), str(self.base / 'scripts/durable-recovery-bridge.ts')],
                                      stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.log, text=True, bufsize=1, env=env)
        return self
