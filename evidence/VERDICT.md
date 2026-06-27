# 025 Capture-Parity — Blind Judge VERDICT

**VERDICT: COMPLIES** (double-run agreed; exit 0).

| Item | Value |
|---|---|
| Date | 2026-06-26 |
| Judge model | `claude-opus-4-8` (pinned in `judge/run-parity-judge.mjs`) |
| Contract | `evidence/parity-contract.md`, SHA-256 `f7b69a5730f1bc0aed55157a665ae3570f0b81b77794d03446bdc5539fe10af3` (pinned; runner refuses a mutated contract) |
| Artifact graded | `judge/ARTIFACT.txt` (freshly regenerated raw evidence + `evidence/PARITY-MANIFEST.md` + `evidence/PARITY-REPORT.md`) |
| Gate | blind (sees only contract + artifact), fail-closed, double-run must agree |
| Determinism | both runs returned COMPLIES |

## Verbatim verdict line

```
JUDGE COMPLIES :: 025 capture parity :: clause="SC-1.1 (anchoring all §3 SC-1.1–SC-2.5)"
| run1: Every success criterion is backed by a concrete artifact fact (35/35 zero-mismatch hash table,
  0-failure container suite, empty golden diff, 0 PII occurrences, enumerated exclusion reasons), all
  Tier-B deltas are disclosed and identity-only, and the three surface number inconsistencies reconcile
  to documented nuances, so no §2 prohibition is present.
| run2: Every success criterion is met with a concrete backing fact — 35/35 byte-identical hashes,
  70-pass/0-fail suite, empty golden diff with all four anchors matching, gate-chokepoint green, and
  zero PII — with all deltas disclosed as identity/config only and no §2 prohibition present.
```

## What is now proven (independently graded)

025's capture + grading + receiver + disclosure code is **byte-identical** to 021's sealed M4 core
(commit `32604b2`, SDK `0.3.160` / CLI `2.1.160`), and the built+running 025 system **reproduces 021's
recorded rows and grades on identical input**, achieved **without copying the synthetic triggers or
agents**. "Same exact capability as 021" holds by construction (leg 1) and end-to-end (leg 2), and is
confirmed by the stateless blind judge (leg 3).

Boundary (not claimed, per contract §4): organic coverage on real work (not forced 29/30), breadth-only
for un-wrapped sessions, and version-bump behaviour are out of scope; this proof is pinned to
SDK `0.3.160` / CLI `2.1.160`.
