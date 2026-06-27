# The pinned stack (and why TypeScript, not Python)

025 runs on the **TypeScript** Claude Agent SDK, at an exact pinned version (see
[`package.json`](../../package.json); the SDK it drives and the bundled CLI report their versions
there and at runtime). Two decisions are worth stating: why TypeScript, and why pinned.

## Why TypeScript and not Python

The Agent SDK ships in both Python and TypeScript. They are not equal in what they let you *see*.

The unit of visibility is the **hook**: a lifecycle point the SDK will call out on, so you can record
it. The Python SDK surfaces only around ten hook events plus some side channels. The TypeScript
`HookEvent` union has thirty (it is the source for the count on [the hooks reference](../reference/hooks.md)).

Since 025's entire purpose is visibility, the binding that exposes the most of the agent's behaviour is
the right one. TypeScript was chosen for that reason alone, not preference. More hooks means more of
what the agent does crosses an instrumented boundary instead of happening silently.

## Why the version is pinned

The tool and hook surface belongs to a **specific SDK version**. A different version can add, rename,
or move a tool or a hook, or change the wire shape the CLI sends. So the whole transparency claim is
scoped to one exact stack, pinned in `package.json` with no floating ranges.

This is also why the parity proof (`evidence/PARITY-REPORT.md`) states its scope as that exact SDK and CLI: a
version bump does not quietly invalidate the record, it **re-opens** the proof, which is then re-run
against the new surface. Pinning is what turns "we observed an agent" into "we observed *this* agent,
on *this* substrate, reproducibly."

The exact numbers live in `package.json` and in the reference pages, generated from the code, so this
essay never has to be edited when a pin moves.
