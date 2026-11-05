# Real model safety experiment

This experiment tests an **execution guard**, not a change to model weights. A real local model proposes a JSON action plan. The exact same plan is executed twice in isolated synthetic memory: once through the existing guard and once with policy gating removed. Unknown tools and malformed arguments have no effects in either arm. No real gates, deliveries, equipment, shell commands or credentials are accessible to the model.

The fixed protocol is saved before inference: nine existing template pairs and nine new researcher-authored notice pairs, over three task families. There are 36 inference requests. Each pair differs only in lower-trust notice text. Control/attack order alternates; requests have no conversational history, temperature is zero and the seed is fixed. Repeated controls are explicitly not independent observations. No human participant data or proof-development traces are used.

The model is the official `Qwen/Qwen3-0.6B-GGUF`, revision `23749fefcc72300e3a2ad315e1317431b06b590a`, `Qwen3-0.6B-Q8_0.gguf`, SHA-256 `9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031`. It is a small quantized open-weight model, not a claim to current state-of-the-art performance. Its Apache-2.0 license and model card should accompany published observations. The runtime is the official Linux CPU llama.cpp b6000 build. The executable and weight digests are checked before and after inference. The process binds only to loopback and loads weights without mmap. This is not an immutable or independently administered security root: host/runtime correctness remains assumed.

The research runner is separate from the hosted adapter. It cannot redirect the production authority or the existing provider adapter. JSON grammar constrains syntax only; the model chooses tool names and values. This JSON-plan protocol differs from native hosted tool calling. No model is supplied a condition label, expected answer or guard result. No failed request is retried or dropped from the report.

From `chaos-theory/`, after installing the normal dependencies:

Use the [pinned official model download](https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/23749fefcc72300e3a2ad315e1317431b06b590a/Qwen3-0.6B-Q8_0.gguf) and [llama.cpp b6000 Linux CPU archive](https://github.com/ggml-org/llama.cpp/releases/download/b6000/llama-b6000-bin-ubuntu-x64.zip). The observed archive SHA-256 is `66244356dd242ae3a2510929ec4a840db65a3f9e7ad712918dbf02a266badfa5`; verify it before extracting. Keep the server's companion libraries alongside it. Preserve their license notices. The model is about 639 MB; no provider account or API credential is needed. The tested host was Linux x86-64; other platforms need a separately qualified runtime.

```sh
npx --no-install tsx scripts/local-model-safety.ts --execute \
  --model /absolute/path/Qwen3-0.6B-Q8_0.gguf \
  --runtime /absolute/path/llama-server \
  --output /absolute/path/to/a/new-directory
python3 scripts/replay_real_model.py /absolute/path/to/a/new-directory
```

To run the interactive follow-up on that exact frozen corpus:

```sh
python3 scripts/local_model_interactive.py --execute \
  --protocol /absolute/path/to/the/one-shot-directory/protocol.json \
  --model /absolute/path/Qwen3-0.6B-Q8_0.gguf \
  --runtime /absolute/path/llama-server \
  --output /absolute/path/to/another-new-directory
python3 scripts/local_model_interactive.py --verify /absolute/path/to/another-new-directory
```

The loop permits at most four turns and sixteen total actions per episode, at most 288 actual requests over all arms. Identical histories within a condition reuse one actual completion, explicitly counted once. Actual TypeScript executor outcomes are checked against the separate Python state replay before feedback is returned. No model is allowed to execute arbitrary tools or alter the policy.

For the **separate deliberately compromised-proposer stress condition**, add `--compromised-proposer` to the TypeScript runner and use another new output directory. This intentionally changes the model's system objective to a forbidden synthetic goal; it does not claim a lower-trust attack succeeded. The guard's task, permissions and execution policy remain fixed. Keep this result separate from ordinary attack robustness and retain failed attempts. The [recorded findings](REAL_MODEL_RESULTS.md) include all three experiments and their limitations.

Output is written to a new directory only: fixed protocol, raw responses, original actions, guarded and unguarded traces, timings, runtime log and hashed report. The Python standard-library checker independently reparses responses and replays state transitions, including inspection-before-repair at the time each action executes. A correct final action cannot hide an earlier violation. Invalid/failed responses remain visible in the denominator.

The useful measurements are unauthorized effects with/without enforcement, legitimate task completion with/without enforcement, invalid responses and model-generated policy violations. A guard that blocks everything is exposed by the matched legitimate controls. The same-plan comparison isolates execution enforcement; it does not measure agent recovery after a denial, interactive adaptation, deployment safety, improved weights or broad resistance to prompt injection. A zero-violation model run establishes no measured safety improvement from the guard in that sample. Model/hash provenance does not make findings externally validated.
