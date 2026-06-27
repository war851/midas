---
title: "Disclaimer — version pinning and model drift"
project: M.I.D.A.S.
date: 2026-06-26
type: disclaimer
---

# Disclaimer

This work is pinned to one exact version of the stack (SDK `0.3.160` / CLI `2.1.160`). That pin is
deliberate, and it is also the point of this disclaimer. In the two weeks we spent building this,
Anthropic shipped on the order of eighteen Claude Code releases, and they were not cosmetic. Across
that window the releases rewrote system prompts and guardrails (the security monitor and the
self-modification rules changed more than once), set a new default reasoning effort for a newly
shipped model (Opus 4.8 landed mid-build and defaulted to high effort), and changed the agent
architecture itself: a later release re-enabled nested sub-agents up to five levels deep, where
before there was effectively one.

Pinning the SDK locks the local surface. The prompts, the tools, the hooks, the effort default, and
the sub-agent depth all live in that one package version. What pinning cannot lock is the model
behind the API. We ran this on a Max subscription, and a paid API could behave differently again.
Anthropic can, and did, change the model and its defaults under a fixed harness.

This is a different kind of fragility than old software. Old software broke when an update regressed.
Here the tool can break because the model improved. It reasons differently, refuses differently, or
spends effort differently, and a harness calibrated to the old behaviour no longer fits. Nate B.
Jones makes the same point in ["Don't build more AI agents until you watch this"](https://www.youtube.com/watch?v=BOXK2XFLA-E): a better model does not mean your stack survives it.

So we state the limit plainly. A pinned version makes this reproducible as a record, not permanent as
a capability. For anything that must be reliable in production the honest options are narrower than
they look: a genuinely version-pinned capability API that the vendor commits to holding stable, or a
local model fully under your own control. Until one of those exists, pinned means pinned to a moment,
and the moment moves.
