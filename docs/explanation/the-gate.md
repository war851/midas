# The gate (the "mandalorian")

Transparency is only true if capture is **total**. If an agent can enter through a side door that
skips instrumentation, the database sees nothing and the claim is false. So the design rests on one
move: a single sanctioned door every wrapped agent action is forced through.

> The gate is the gatekeeper of one certified route that lets us observe everything we can reach.
> Everything passes through it, or it does not run instrumented.

## How it works

- **One door.** [`src/run.ts`](../../src/run.ts) `runAgent` is the only place the SDK's `query()` is
  started. A static guard ([`tests/gate-chokepoint.test.ts`](../../tests/gate-chokepoint.test.ts))
  fails the build if any other file imports `query()` at runtime. No off-path entry, nothing runs dark.
- **The per-call decision.** In this CLI the `PreToolUse` hook is the permission point actually
  consulted on every tool call (`canUseTool` is recorded but not consulted). The gate records the
  decision (allow / deny) and can block. See [`src/spine/capture.ts`](../../src/spine/capture.ts).
- **Two planes meet here.** The gate produces the in-process **depth** channels for runs it wraps; the
  managed-settings lock makes the **breadth** channel (`otel`) fire for every process, wrapped or not.
  See [the channels](../reference/channels.md).

## Two open levers (chosen per deployment)

- **Observe vs enforce.** The gate can record-only (zero perturbation, maximal fidelity) or record and
  block (a real control, but it perturbs the workload). Capture is identical either way; only the deny
  path differs.
- **Wrapped vs un-wrapped.** A task run *through* `runAgent` gets all the depth channels. A process you
  did not start (someone's own `claude -p`) is captured by breadth only (`otel` + `transcript` +
  `settings_hook`); the in-process depth channels are invocation-scoped and absent.

## The honest limit

A community RFC (`anthropics/claude-code#45427`, closed not-planned) **documents** concrete ways
hook-based capture is incomplete: subagents dispatched via the Agent tool bypass the parent's per-call
hooks; Bash heredoc/redirect writes skip the file hooks; a model could edit its own settings to weaken
the gate. 025 closes what the slice allows (the per-call gate, the breadth spine, a read-only mount so
the agent cannot rewrite the capture code) and names the rest as the stated boundary, on documented
ground, not as a claim of totality.
