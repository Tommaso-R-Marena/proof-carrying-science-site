# PCS Commons — Claim Invalidation v1

This is the public packet for the first PCS Commons research program.

The real PCS core already computes conservative transitive invalidation over declared workflow/artifact/evidence dependencies. The open research target is to formalize the semantics and prove the strongest sound reachability theorem without hiding the dependency-completeness assumption.

Contributors do not need to install the public core repository during the pilot. Use the public packet and the marketplace acceptance criteria. Accepted work can be imported into the core repository after review.

Files:
- seed-corpus.json — deterministic seed cases and one dependency-incomplete negative control.
- reference_impact.py — small executable snapshot of declared-graph invalidation.
- fixture-schema.json — structural requirements for corpus cases.

Authority boundary: contributor output is a proposal until reviewed. A graph can only justify conclusions about dependencies that are actually represented.
