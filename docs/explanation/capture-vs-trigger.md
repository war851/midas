# Capture vs trigger (why 025 drops the harness)

The reference build (021) had to **prove** its capture was complete, so it built a large synthetic harness (drivers, a
matrix runner, a worker agent, a human-seat agent) whose only job was to make every one of the 29
tools and 30 hooks fire at least once, so each could be shown as captured. That harness was proof
scaffolding, not the substrate.

025 drops all of it. The reason it can is one structural fact:

> **Capture is cause-agnostic.** [`src/spine/capture.ts`](../../src/spine/capture.ts) writes the same
> row for an event (a `tool_use` on `message_stream`, a `PreToolUse.gate` on `gate`, a `tool_result`
> on `otel`) whether a synthetic driver manufactured it or a real agent decided it. The triggers only
> changed *which* events occurred. They never touched *how* each one is recorded.

So on a real workload, the agent fires its own hooks and tools simply by doing the work. The channels
come from the run wrapper, the config, and the SDK, never from the triggers. The single real-work
entry [`src/observe.ts`](../../src/observe.ts) replaces the whole harness: feed it a real task.

## What changes on real work (stated honestly)

- **Coverage is organic, not 29/30.** You capture the subset your task exercises. The denominator
  becomes a live *report* ("of 29 tools / 30 hooks, this workload used these"), not a pass/fail gate.
- **No `neo.decision` rows** unless you actually seat a human or policy approver; the gate still records
  allow/deny for every call.
- **Rare hooks stay dark** unless the work causes them.

## Why this still counts as "the same capability"

Because capability is the capture code, not the triggers. 025 vendors that code byte-for-byte from
021's sealed tree and proves it two ways (hash equality + a same-input replay diff), graded COMPLIES
by a blind judge. The triggers fell away; the recording did not. See the evidence:
`evidence/PARITY-MANIFEST.md`, `evidence/PARITY-REPORT.md`, `evidence/VERDICT.md`.
