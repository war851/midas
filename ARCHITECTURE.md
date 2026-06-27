# Architecture

025 is a sealed container that runs an AI coding agent (Anthropic's Claude Agent SDK) and records
**everything the agent does**, verbatim, into one SQLite database, by forcing every agent action
through a single instrumented door. It is the public extract of `021`, the sealed reference build
(what 021 and 025 are: see the [README](README.md)): the proven capture core, vendored byte-for-byte
and run on real workloads.

This file is the map. It shows the shape and points to the exact facts; it does not duplicate them.
The volatile lists (channels, tools, hooks, schema) live in [`docs/reference/`](docs/reference/),
generated from the code so they cannot drift. The "why" lives in [`docs/explanation/`](docs/explanation/).

```
                    025 capture container (one image, version-pinned deps)
 ┌───────────────────────────────────────────────────────────────────────────────┐
 │  real task ─▶ src/observe.ts ─▶ runAgent() ─▶ SDK query() ─▶ bundled CLI        │
 │                                 (THE GATE: the one sanctioned door)  (per agent) │
 │                                      │                                  │        │
 │        DEPTH plane (in-process, only runs we wrap)          BREADTH plane        │
 │                                      ▼                    (every process)        │
 │     message_stream · hook_callback · gate · transcript          otel            │
 │        + settings_hook (project .claude/settings.json command hooks)            │
 │                                      │                            │              │
 │                                      ▼            ▼               ▼              │
 │              ┌──────────────────────────────────────────────────────────┐       │
 │              │   THE SPINE — one SQLite, verbatim raw_json               │       │
 │              │   events (7-channel) · self_reports · comparisons         │       │
 │              └──────────────────────────────────────────────────────────┘       │
 │   honesty engine:  disclosure ─▶ self_reports     compare ─▶ comparisons        │
 │   grading law (report only):  denominator + verifier (the 3-channel join)       │
 └───────────────────────────────────────────────────────────────────────────────┘
   run_meta is run bookkeeping (not drawn). The 7 channels: docs/reference/channels.md
```

## Building blocks

Each is 2-3 lines; follow the links for the code and the facts.

- **The gate (the "mandalorian").** [`src/run.ts`](src/run.ts) `runAgent` is the one sanctioned door;
  [`src/spine/capture.ts`](src/spine/capture.ts) wires the channels and the per-call permission point
  (the `PreToolUse` hook). Un-bypassable by a chokepoint guard ([`tests/gate-chokepoint.test.ts`](tests/gate-chokepoint.test.ts):
  only `run.ts` + `smoke.ts` may import `query()`). Why: [docs/explanation/the-gate.md](docs/explanation/the-gate.md).
- **The spine.** [`src/spine/db.ts`](src/spine/db.ts) — one SQLite file, every row carries the full
  verbatim `raw_json`, single-writer. Tables + the 7-channel enum: [docs/reference/schema.md](docs/reference/schema.md).
- **The breadth receiver.** [`src/otel/receiver.ts`](src/otel/receiver.ts) + [`serve.ts`](src/otel/serve.ts);
  [`infra/managed-settings.json`](infra/managed-settings.json) forces every in-container `claude` process
  to export its telemetry to `127.0.0.1:3211`. This is the un-bypassable `otel` channel.
- **The honesty engine.** [`src/disclosure/`](src/disclosure/) captures the agent's self-report
  (`self_reports`); [`src/spine/compare.ts`](src/spine/compare.ts) computes silent_failure / omission /
  lie **from the record** (`comparisons`). Why: [docs/explanation/honesty-engine.md](docs/explanation/honesty-engine.md).
- **The grading law.** [`src/coverage/`](src/coverage/) (`denominator` + `groups` + `verify`, with the
  vendored `standard-{tools,hooks}.json`): a tool is verified only by a three-channel join on one
  `tool_use_id`. On real work it is a live **report**, not a coverage gate. Facts:
  [docs/reference/tools.md](docs/reference/tools.md), [docs/reference/hooks.md](docs/reference/hooks.md).
- **The real-work entry.** [`src/observe.ts`](src/observe.ts) wraps a real task and lets the agent fire
  its own hooks/tools. It replaces 021's synthetic trigger harness. Why:
  [docs/explanation/capture-vs-trigger.md](docs/explanation/capture-vs-trigger.md).

## The two planes

- **Depth** (in-process, only for runs wrapped through `runAgent`): `message_stream`, `hook_callback`,
  `gate`, `transcript`. This is where verbatim reasoning and the per-call decision live.
- **Breadth** (out-of-process, every `claude` process via managed-settings): `otel`. Plus `settings_hook`
  for the lifecycle hooks the in-process callbacks never fire.

## Where the rest is

- **What (facts, generated):** [docs/reference/](docs/reference/) — channels, tools, hooks, schema.
- **Why (essays):** [docs/explanation/](docs/explanation/) — the thesis, the gate, capture-vs-trigger, the honesty engine, the pinned stack (TypeScript vs Python), the denominator (where 29/30 come from), plus the [author's note](docs/explanation/authors-note.md) and the [disclaimer](docs/explanation/disclaimer.md).
- **How (task):** [docs/how-to/run-on-a-real-workload.md](docs/how-to/run-on-a-real-workload.md).
- **A real run, captured:** [docs/live-run/](docs/live-run/) — the PRD, the site the agent built, the anonymized spine, and two readable walkthroughs (two agents talking; an agent thinking).
- **Proof (evidence):** `evidence/PARITY-MANIFEST.md`, `evidence/PARITY-REPORT.md`, `evidence/parity-contract.md`,
  `evidence/VERDICT.md` — 025's capture is byte-identical to 021's sealed core and reproduces its records,
  graded COMPLIES by a blind judge.
