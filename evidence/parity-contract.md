---
title: 025 Capture-Parity — Immutable Contract (the blind judge reads this)
project: 025_midas_public_v2
date: 2026-06-26
type: contract
status: FROZEN — immutable; the judge grades the artifact against THIS file only; SHA-256-pinned in the runner
read_by: the external blind judge, once, against the parity artifact
---

# 025 Capture-Parity Contract

The fixed reference the blind judge grades against. The judge sees ONLY this contract and the
artifact (the parity evidence). It does not see, infer, or credit any reasoning, author, or intent
beyond these texts. It returns a single binary verdict.

**The claim under test.** 025's capture capability is identical to 021's sealed M4 substrate
(commit `32604b2`, SDK `0.3.160` / CLI `2.1.160`), achieved by vendoring the capture core
byte-for-byte WITHOUT copying the synthetic triggers or agents, and proven in two legs (static hash +
dynamic replay).

## 1. Verdict shape

The judge returns a single binary verdict, `COMPLIES` or `VIOLATES`, as a final JSON object
`{"verdict","clause","rationale"}`. It is **fail-closed**: if the artifact is unparseable, ambiguous,
incomplete, unsupported by the evidence, or the judge is in any way uncertain, the verdict is
`VIOLATES`. A near-miss is a `VIOLATES`.

## 2. Prohibitions (absolute — any one present makes the artifact VIOLATES)

- **No failed criterion rounded up.** A `FAIL` / absent / mismatch on any SC below is never
  "accounted", "explained", or "close enough". Absence is failure.
- **No claim without evidence in the artifact.** Every PASS must be backed by a concrete artifact
  fact (a hash equality, a test count, a diff result, a cited reason). A bare assertion is a `VIOLATES`.
- **No silent omission.** Every excluded test must carry a cited reason; an unexplained omission is a `VIOLATES`.
- **No un-disclosed delta.** Any difference between a 025 file and 021's sealed file that is NOT in the
  disclosed-deltas list, OR any disclosed delta that touches capture-code (not just identity/config), is a `VIOLATES`.

## 3. Success criteria (all must hold for COMPLIES)

**Leg 1 — static parity (hash):**
- **SC-1.1** Every Tier-A file (the vendored capture + grading + receiver + disclosure code) is SHA-256
  byte-identical to 021@`32604b2`. The artifact must show a complete hash table, zero mismatch.
- **SC-1.2** 025 `src/` contains exactly the vendored capture files and no other capture code.
- **SC-1.3** Tier-B config is field-identical on the load-bearing fields (the `managed-settings.json`
  `env` block byte-identical; the `package.json` dependency pins identical; the `Dockerfile`
  `FROM` / `npm ci` / CLI-symlink / managed-settings-bake identical). Every identity delta is disclosed.
- **SC-1.4** The dropped synthetic harness (`matrix`, `drivers`, `run-matrix`, `run-targeted`,
  `diag-run`, `reverify`, `dump-ledger`, `operator-gate`, `harness/*`) and the agents
  (`smith`, `neo`, `orchestrator`) are ABSENT from 025.
- **SC-1.5** The hash table is reproducible (the verify command is present and its re-run output agrees).

**Leg 2 — dynamic parity (replay diff), run in the 025 container:**
- **SC-2.1** Golden replay diff empty: the vendored receiver replays the two CLI-2.1.160 wire fixtures
  and the normalized, scrubbed `events` multiset equals the frozen golden, which is cross-anchored to
  021's ground truth (tool `Bash`, session `777284ea-6ed0-4e4c-ab28-9b9982c4c4fa`, tool_use
  `toolu_01P8zyzUvSWtkXNmJpNgA4mP`, `OTLP-SHAPE-NONCE-91`).
- **SC-2.2** The included agent-free test suite is GREEN (0 failures) in the 025 container, with 021's
  sealed hardcoded assertions unchanged.
- **SC-2.3** Every excluded test is listed with a cited reason (live-agent / live-driver / dropped-harness / frozen-021-baseline).
- **SC-2.4** `gate-chokepoint` is green on 025: only `run.ts` and `smoke.ts` import the SDK `query()`
  entrypoint (capture is un-bypassable; the new real-work entry imports `runAgent`, not `query()`).
- **SC-2.5** The published golden is PII-scrubbed: zero occurrences of the five identity fields
  (`user.email`, `user.id`, `organization.id`, `user.account_uuid`, `user.account_id`).

## 4. Scope boundary (NOT graded; stated so the judge does not penalise their absence)

The proof does NOT claim, and the judge does NOT require: that 29/30 tools/hooks fire on real work
(coverage is organic); that an un-wrapped session is captured (breadth-only is out of scope); behaviour
under a version bump (the proof is pinned to SDK `0.3.160` / CLI `2.1.160`). Their absence is correct,
not a failure.

## 5. The verdict

`COMPLIES` iff every SC in §3 holds with artifact evidence and no §2 prohibition is present. Otherwise
`VIOLATES`. On `VIOLATES` the caller HALTS and surfaces; only a recorded operator-verified override may
relieve it, never the builder's own call.
