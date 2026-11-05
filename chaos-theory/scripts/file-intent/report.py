"""Render only an independently verified frozen study."""
import argparse,json
from pathlib import Path
from replay import verify

def render(directory):
 root=Path(directory);v=verify(root);p=json.loads((root/'protocol.json').read_text())['protocol'];r=json.loads((root/'report.json').read_text())['report'];rows=r['scorecard']
 lines=['# Numeric intents: frozen real-model results','',f"Actual Qwen3-0.6B Q8_0 CPU inference: **{v['actualModelCalls']} new requests**, {v['episodes']} episodes, 12 new authored tasks (4 development, 8 prospective held-out). Both interfaces use the same unchanged Lean file policy and actual CSV publication. There is no safety-off arm in this phase.",'',
 'The intent interface asks the model only for a numeric answer. The host selects the trusted target and the actual Lean compiler constructs any required inspection and write. This changes the division of work and restricts model authority. It is not model learning, autonomous protocol planning or proof that an answer is scientifically correct.','',
 '| Split | Notice | Interface | Completed | Executed writes | Unsafe versions | Malformed | Policy-ineligible | Profile rejection | Safe wrong final | Recovered | Calls |',
 '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
 for x in rows:lines.append(f"| {x['split']} | {x['condition']} | {x['interface']} | {x['completed']}/{x['episodes']} | {x['executedWrites']} | {x['unsafeVersions']} | {x['malformedProposals']} | {x['policyIneligibleIntents']} | {x['profileRejections']} | {x['safeWrongFinalAnswers']} | {x['recovered']} | {x['actualCalls']} |")
 lines+=['','## Interpretation','',
 'All responses, failed proposals and intermediate datasets are retained. Shared cases do not make individual episodes independent statistical samples. This tiny authored prospective split is not a blind external benchmark or a claim about pretraining novelty. Both arms receive all action budgets; malicious notes persist during repairs. The host never inserts the reference answer into a proposal or repair prompt.','',
 f"Authority/intent-compiler startup including proof builds and audits: {p['observedAuthoritySetupMs']} ms.",'',
 'Greedy generation uses thinking disabled, 384 reply tokens, 4096-token context and two CPU threads. Costs include protocol builds, intent compilation, repeated checking, file publication and model inference. Model-time totals below are observed shared-host measurements, not portable latency promises.','',
 '| Split | Notice | Interface | Model ms | Executor ms | Workspace init ms |','| --- | --- | --- | ---: | ---: | ---: |']
 for x in rows:lines.append(f"| {x['split']} | {x['condition']} | {x['interface']} | {x['modelMs']} | {x['executorMs']} | {x['workspaceInitMs']} |")
 lines+=['','## Proofs and trust','',
 'Nine new Lean theorems establish compiler eligibility, bounded plan length, authorization, exact proposed-value reachability, protected-cell/bound invariants, inspection consumption and composition. Together with the unchanged 33 earlier audits there are 42 named theorem audits. Parsing/encoding and host/physical execution correspondence are tested, not kernel-proved. A safe wrong answer is a real accepted negative control.','',
 f"The original pre-publication native ledger is retained: {v['nativeLedgerRecords']} actual computations. Python verifies its exact causal input order, all saved calls, compilation records and physical CSVs. A fresh native replay recompiles every intent and recomputes every execution result. Replay is not new model inference, origin authentication or a proof against a hostile host.",'',
 'The source archive was captured before first inference and is checked against frozen hashes. Sources are required to match exactly for native replay; no historical-source fallback is introduced. Host/storage remain trusted, checkpoints are unsigned and need separate retention, directory copies can fork, and process-crash tests do not prove power-loss durability. The authored CSV unit metadata and conversion factors are explicit evaluation assumptions. No production deployment or broad AI-safety result is claimed.','']
 return '\n'.join(lines)
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('directory');p.add_argument('--output');a=p.parse_args();text=render(a.directory)
 if a.output:
  with Path(a.output).open('x') as f:f.write(text)
 else:print(text,end='')
