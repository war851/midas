# The transparency thesis

The common claim about AI agents is that they are black boxes: you cannot see what they do or why,
so you cannot trust them. 025 is a narrow, falsifiable counter-claim:

> Even a standard SDK, with its built-in features and based on its documentation, can be made
> transparent. Inside this deliberately small slice (one SDK, one container, the standard tools),
> almost nothing the agent does is hidden.

The claim is strong **because** the slice is narrow. We do not claim to watch everything everywhere.
We claim that on this substrate, every action the agent takes through the SDK is recorded verbatim,
on several independent channels, and can be read back and checked.

Three ideas hold it up:

- **Configuration matters.** What an agent actually does is decided by its configuration (the prompt,
  the tools, the hooks, the guardrails), not by the model alone. Make that layer visible and you can
  understand behaviour instead of guessing at it.
- **Seeing enables understanding enables change.** The order is deliberate: observe first. You cannot
  reliably improve a tool's use while the tool is invisible; that is just tuning by feel. Visibility is
  the precondition.
- **Educate the configuration, not just the model.** Most failures (running out of context, ignoring
  what a tool returned, claiming more than was read) are configuration failures. They are addressable
  once you can see them.

## The stated boundary

There is exactly one place we name rather than dispute: **below the container**, at the OS / CPU /
kernel level (syscalls, network packets), reached by tools like eBPF. A kernel tap proves something
about the operating system, not about the SDK. It is out of this slice by design. Everything 025
claims is in-container, at the SDK surface and above.

This document is the "why". The exact surface it observes is in [the reference](../reference/);
the mechanism that makes capture total is [the gate](the-gate.md).
