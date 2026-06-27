---
title: "Author's note: how M.I.D.A.S. found its shape"
project: M.I.D.A.S.
date: 2026-06-26
type: authors-note
---

# Author's note: how this took shape

We did not set out to build a product. We set out to understand the agentic systems people are
actually building, and the honest answer was that they are not one kind of thing. They range from
benchmarks that grade where an agent's reasoning first goes wrong, to frameworks that contain what an
agent is allowed to do, to the runtime that executes the agent loop, to the observability and
evaluation tools that watch all of it. So calling them "harnesses" would be a convenient
oversimplification; they are a field, not a category.

The nine we studied most closely were: **AgentHallu** (a benchmark that pinpoints which step of an
agent's run first hallucinated), **MAST** (a taxonomy of why multi-agent systems fail), **deepchecks**
(an ML data- and model-validation framework, not agent-specific, kept for its grading structure),
**maxim-py** (a client SDK that ships traces and evals to a hosted backend), **latitude-llm**
("Sentry for agents", an observability and reliability platform), **NemoClaw** (NVIDIA's
deny-by-default containment stack for running an always-on agent safely), **hermes-agent** (Nous
Research's self-improving personal agent), **openclaw** (a local-first personal assistant), and
**langgraph** (a low-level orchestration runtime for stateful agents).

## The first wall: there is no shared language

The first thing we hit was that the field has no agreed vocabulary. Even using the best vocabularies
available, Anthropic's and LangChain's terms together, we could put a recognised name on only about
a third of the building blocks we found: **20 of 71 components (~28%)**. The rest had no standard term
at all. This is not just our impression. In February 2026 NIST launched an *AI Agent Standards
Initiative* precisely because the field has no agreed taxonomy yet, and the Cloud Security Alliance
describes "AI agent" as one of the **least precisely defined** terms in current use. So we had to build
our own lens before we could compare anything.

## The lens: a three-layer teardown

We read each system on three layers, each answering a different question:

- **Semantic**: *what it is for* (its problem, its control philosophy, the failure it targets).
- **Structural**: *what it is made of* (its components, which we labelled `C01..Cnn`).
- **Failure-modes**: *which agent failures it targets* (the concrete failure-shapes it catches, classifies, or guards against; these are failures in the agents a system watches or contains, **not** bugs in the system itself; labelled `T01..Tnn`).

On disk, each layer is one file per system:

| Layer | Where | What it holds |
|---|---|---|
| Semantic / intent | `repo-intent/{system}.md` | problem · control philosophy · targeted failure |
| Structural / components | `repo-components/{system}.md` (+ diagram) | the `C01..Cnn` component map |
| Failure-modes | `repo-failure-modes/{system}.md` | the failure-shapes (`T`-blocks) |

Across the systems we mapped most deeply this came to **71 components** in the four core agentic
frameworks (95 across the six we verified in depth) and **340 distinct failure-shapes** (the
agent-failure mechanisms these systems catch or guard against, not their own faults) across the nine. We then collapsed what all of these systems actually *do* into a small set of recurring
**capabilities**, and a small set was enough: every system we saw was some combination of

- **A** a forced chokepoint (one door everything passes through),
- **B** redundant, hard-to-bypass capture,
- **C** a verbatim, canonical record,
- **D** a completeness check (proving what *didn't* happen, not just logging what did),
- **E** honesty checks (did the agent's account match the record),
- **F** attribution and a human gate.

These categories are **ours**. We invented them because nothing standard existed to borrow.

Here is the nine, by the family they fall into, with the failure-shapes we extracted and the
capabilities each embodies:

| System | Family | Failure-shapes* | Capabilities |
|---|---|---:|---|
| AgentHallu | eval / failure-shape grader | 13 | C · E |
| MAST | eval / failure-shape grader | 18 | C · E |
| deepchecks | eval / failure-shape grader (ML) | 24 | C · E (closest to a real completeness check) |
| maxim-py | eval / failure-shape grader | 35 | B · C · E |
| latitude-llm | eval / observability platform | 92 | C · E (+ partial B/F) |
| NemoClaw | gate / containment | 40 | A · F |
| hermes-agent | gate / containment agent | 40 | A · F |
| openclaw | gate / containment agent | 40 | A · F |
| langgraph | execution runtime | 38 | A · F |
| **Total** | | **340** | |

> \* These counts are **our re-extraction** of distinct failure-mechanisms, not each project's own
> published taxonomy size. For example, MAST publishes **14** named failure modes; our mechanism-level
> pass over its code and data yielded 18. We are not restating their number; we are counting ours.

**A word on method, stated plainly:** we did **not** run, fork, or test any of these systems. We cloned
them and read their code and their documentation. The categories above and the failure-shape counts are
**our lens**, not the authors'. Whoever built these may describe them differently, and they would be
entitled to. We looked at structure, we did not run experiments.

## Why we went to the primitives, and why TypeScript

Building our own capture taught us to stop reasoning about agents in the abstract and go to the
primitives the SDK actually exposes. That decided one thing for us: we chose the **TypeScript** Claude
Agent SDK over Python, for one concrete, checkable reason: it exposes more of the agent's lifecycle.
The **Python** SDK declares **10** hook events; the **TypeScript** SDK declares **30**. More hooks means
more of what the agent does crosses an instrumented boundary instead of happening silently. We pinned one
exact version (SDK `0.3.160` / CLI `2.1.160`), because the tool and hook surface belongs to a specific
version and moves between them.

We also did not take the tool list from the documentation, because documentation paraphrases and
paraphrases drift. We intercepted the SDK's own outbound request to the model and recorded the **29
tools** it verbatim sends; we took the **30 hooks** from the SDK's own type source. Then we tried to
*trigger* each tool and hook to find how to capture it, and that was harder than expected. No single
channel was ever enough: a tool can fail before any result-hook fires; some lifecycle events never reach
the in-process callbacks at all. By the time capture was actually complete we had built **seven** capture
channels feeding one record, so that nothing an agent does falls through a gap between them.

## The second look, and what we believe

With capture working, we searched the field again. There is a lot of it: observability platforms
(Langfuse, LangSmith, Arize Phoenix, Braintrust, Helicone), trace-based eval frameworks (DeepEval,
TruLens, Inspect, promptfoo), the Anthropic-native pieces (Code hooks, the OpenTelemetry export, Agent
Skills, the Compliance API), the MCP tooling, and the two closest neighbours: **Invariant Labs** (a proxy
that intercepts, traces, and gates every call, since acquired by Snyk in 2025, with its hosted Explorer
shut down in early 2026) and **AEGIS** (a published pre-execution firewall-and-audit design, the only
one we found that even *claims* the completeness property).

None of these represented the full, seven-channel observation we built. We say that carefully, because we
did not test or fork them, it is read from their own architectures, not from a benchmark. What we
*believe*, and state as belief, is this: most control and evaluation tools **assume observation already
exists** and will be wired into them. Where observation is built in, it usually covers a single slice,
the pre-wired OpenTelemetry stream. That is natural; OTel is the part the platform hands you for free. But
without the other six channels, a control or grading layer simply sees less than it could.

## Who could use what we capture

A handful of these could benefit directly from the record we produce:

- **latitude-llm** already ingests the OpenTelemetry slice. It even ships a dedicated *Claude Code*
  telemetry package. It is the natural destination for our stream; the other six channels (the verbatim
  reasoning, the per-call gate decision, the settings-only lifecycle) are exactly what it does not get
  today.
- **The observability platforms** (Langfuse and the rest) are the same story at lower fidelity: they
  consume OTel; they would gain depth.
- **The control and evaluation tools** presuppose a faithful record to act on or grade from. Our capture
  is that substrate; the more complete the record, the more they can do.
- **Invariant Labs** is the natural complement, not a competitor: it watches the network wire and misses
  in-process actions; we are the inverse. Together they would cover both.

The claim we make is narrow on purpose: inside one SDK, one container, and the standard tools, almost
nothing the agent does is hidden. We did not test anyone else's system. But what we *did* do, anyone can check: the code is here, the captures are here, and the
categories are ours and labelled as such.

Use it, fork it, build in it. Light up the darkness!
