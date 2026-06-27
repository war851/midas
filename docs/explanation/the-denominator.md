# The denominator (where 29 and 30 come from, and why it matters)

025 measures the agent against a fixed, named universe: **29 tools and 30 hooks**. That universe is
the *denominator*. Two questions matter: where the numbers come from, and why having them at all is
the point.

## Where the numbers come from

Not from the documentation. From the code itself, by two different routes:

- **Tools (29): a wire capture.** A sibling project intercepted the SDK's outbound request to the model
  and recorded the **verbatim `tools` array the CLI actually sends**. That is ground truth: what the
  agent is really offered, on this exact version. The provenance travels with the data in
  `src/coverage/standard-tools.json` and is shown on [the tools reference](../reference/tools.md).
- **Hooks (30): the type source.** The exact `HookEvent` union the installed SDK declares
  (`sdk.d.ts:802`), copied verbatim. See [the hooks reference](../reference/hooks.md).

The reason both routes avoid the docs is the same: **the human-facing documentation paraphrases, and
paraphrases drift** from what a given version really ships. The wire shows what the CLI sends; the type
source shows what the code declares. Those are authoritative; the docs are a description of them.

## Why a denominator matters

Without a fixed universe you can only log **what happened**. You can never say **what should have
happened and did not**. The denominator is what turns capture into a completeness check:

> of the 29 tools and 30 hooks this version offers, here is exactly what fired, on which channel, and
> here is what stayed dark.

That "what stayed dark" is the whole difference between a log and a proof. The grading law treats a
missing row as a failure, never as "accounted for" (absence is failure). On real workloads the
denominator is read as a live **report** rather than a pass/fail gate (coverage is organic, see
[capture vs trigger](capture-vs-trigger.md)), but it is still the yardstick: you always know the
universe you are measuring against, and where it came from.
