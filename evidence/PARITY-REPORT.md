# 025 Capture-Parity REPORT (the artifact the blind judge grades)

**Claim under test:** 025's capture capability is identical to 021's sealed M4 substrate
(commit `32604b2`, SDK `0.3.160` / CLI `2.1.160`), achieved by vendoring the capture core
byte-for-byte, **without copying the synthetic triggers or agents**, and proven in two legs.

**Result: Leg 1 PASS · Leg 2 PASS · Leg 3 COMPLIES** (pinned-Opus blind judge, double-run agreed; see `evidence/VERDICT.md`).

---

## Leg 1 — static parity (hash)

- **SC-1.1 PASS** — 35 / 35 Tier-A files byte-identical to `32604b2` (SHA-256 table in `evidence/PARITY-MANIFEST.md`).
- **SC-1.2 PASS** — 025 `src/` holds exactly the 19 vendored capture files; nothing else.
- **SC-1.3 PASS** — Tier-B field-identity: `infra/managed-settings.json` `env` block byte-identical
  (verified by JSON diff); `package.json` `dependencies`/`devDependencies`/`engines`/`type` identical;
  `Dockerfile` `FROM` / `npm ci` / CLI-symlink / managed-settings-bake identical. Disclosed deltas below.
- **SC-1.4 PASS** — dropped harness absent: `matrix`/`drivers`/`run-matrix`/`run-targeted`/`diag-run`/
  `reverify`/`dump-ledger`/`operator-gate`/`harness/*` and `agents/{smith,neo,orchestrator}`.
- **SC-1.5 PASS** — `evidence/PARITY-MANIFEST.md` lists each file + SHA + source path + commit; reproducible.

**Disclosed Tier-B deltas (identity coupling only; no capture-code change):**
- `package.json`/`package-lock.json` root `name` → `025-midas-public-v2`; 025 `description`.
- `Dockerfile` header comment + the `git config --system user.email/name` identity → 025.
- `infra/managed-settings.json` `_comment` only (env identical; receiver stays internal `127.0.0.1:3211`).
- `docker-compose.yml` project/container/image/network/volume names → `025_midas_public_v2_*`;
  Langfuse `viewer` stack omitted (fail-open, not exercised by capture parity); `env_file: .env` dropped
  (no Langfuse keys needed). The five `:ro` mounts + `sqlite_data` volume + the 3 env vars are identical.

---

## Leg 2 — dynamic parity (replay diff), run in the 025 container

The included tests encode **021's sealed expected outputs as hardcoded assertions**, so green-in-025
means the built+running 025 system reproduces 021's capture (not just identical source).

- **SC-2.1 PASS** — golden replay diff empty. The vendored receiver replays the two CLI-2.1.160 wire
  fixtures into a `:memory:` Spine; the normalized, PII-scrubbed `events` multiset equals the frozen
  `tests/golden/GOLDEN-EVENTS.json` (3 rows: `user_prompt`, `tool_result`, `api_request`). Cross-anchored
  to 021's ground truth (tool `Bash`, session `777284ea-6ed0-4e4c-ab28-9b9982c4c4fa`, tool_use
  `toolu_01P8zyzUvSWtkXNmJpNgA4mP`, `OTLP-SHAPE-NONCE-91`).
- **SC-2.2 PASS** — included agent-free suite: **70 tests pass, 0 fail** (2 skipped = the live-agent
  integration block, correctly excluded). Files: `otel-receiver`, `coverage-verify`, `coverage-ledger`,
  `spec-registry`, `parse-disclosure`, `truthfulness`, `single-writer`, `error-distinct-from-fail`,
  `gate-chokepoint`, `guard-banned-patterns`, `comparisons` (detector-unit block). Plus `golden-replay` (3).
- **SC-2.3 PASS** — excluded tests, each with a cited reason (no silent omission):
  - live agent: `presence`, `permission-denied`, `permission-denied-auto`, `otel-managed-settings`,
    `neo-human-loop`, `mcp-probe`, `agent-smith-coverage`, `comparisons` (integration block).
  - live drivers / re-targeted orchestrator: `closure-reconciliation`, `m3-live-recheck`,
    `coverage-matrix`, `closure-completeness`, `drain-barrier` (imports `buildClosure`).
  - dropped harness: `operator-gate`.
  - reads frozen 021 baseline DBs (021-specific artifacts): `invariant-baseline`, `seam-training-readiness`.
- **SC-2.4 PASS** — `gate-chokepoint` green: only `run.ts` + `smoke.ts` import `query()` in 025
  (the new `src/observe.ts` real-work entry imports `runAgent`, not `query()`) → capture un-bypassable.
- **SC-2.5 PASS** — `GOLDEN-EVENTS.json` is PII-scrubbed: 0 occurrences of the five identity fields;
  the `<SCRUBBED>` marker present. The fixtures (private) retain PII; the published golden does not.

---

## What this proves / does not prove (stated, not hidden)

- **Proves:** 025's capture + grading + receiver + disclosure code is byte-identical to 021's sealed
  core, AND the built+running 025 system reproduces 021's recorded rows + grades on identical input.
  "Same exact capability as 021" = true by construction (leg 1) and verified end-to-end (leg 2).
- **Does NOT prove:** that 29/30 fire on real work (organic, not claimed); that an un-wrapped session
  is captured (breadth-only, out of scope); behaviour under a version bump (pinned to 0.3.160 / 2.1.160).
- **Decision-independent:** holds for either gate mode (observe/enforce) and presupposes full depth.

## Evidence pointers

- `evidence/PARITY-MANIFEST.md` — the 35-file SHA-256 table + dropped-absent + env-identity results.
- `tests/golden/GOLDEN-EVENTS.json` — the frozen, scrubbed golden.
- Container run (2026-06-26, image `025_midas_public_v2_app:0.1.0`, CLI `2.1.160`): the vitest output
  above (70 pass / 0 fail / 2 skipped; coverage-ledger 11; golden-replay 3).
