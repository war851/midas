// Stage 0 — the coverage ledgers, unit-level (no agent, deterministic). Proves the TWO-STATE model:
// the denominator fixtures load (29 tools / 30 hooks), seeding persists `failed` rows (absence =
// failure), upserts are MONOTONIC (failed -> fired_verified, and a later `failed` upsert never
// un-fires a verified row), channel bits OR-in, the first non-null evidence id is kept, and the
// summary math is correct (fired_verified + failed === total; no third bucket). Fresh DB per run.
import { describe, it, beforeAll, expect } from "vitest";
import { Spine } from "../src/spine/db.js";
import { standardTools, standardHooks, toolProvenance, hookProvenance } from "../src/coverage/denominator.js";
import { renderCoverageClosure } from "../src/coverage/report.js";

const DB = `/tmp/coverage-ledger-${Date.now()}.sqlite`;
let spine: Spine;

beforeAll(() => {
  spine = new Spine(DB);
  spine.seedCoverage(standardTools(), standardHooks());
});

describe("denominator fixtures (vendored from 022 + SDK type source)", () => {
  it("has exactly 29 tools, 12 model_invokable + 17 host_bound", () => {
    const t = standardTools();
    expect(t.length).toBe(29);
    expect(t.filter((x) => x.kind === "model_invokable").length).toBe(12);
    expect(t.filter((x) => x.kind === "host_bound").length).toBe(17);
  });

  it("has exactly 30 hooks", () => {
    expect(standardHooks().length).toBe(30);
  });

  it("carries provenance for both lists", () => {
    expect(toolProvenance()).toContain("022");
    expect(hookProvenance()).toContain("sdk.d.ts");
  });
});

describe("seeding the ledgers (failed is the default — absence is failure)", () => {
  it("seeds 30 hook rows + 29 tool rows, all failed", () => {
    expect(spine.hookCoverage().length).toBe(30);
    expect(spine.toolCoverage().length).toBe(29);
    expect(spine.hookCoverage().every((r) => r.status === "failed")).toBe(true);
    expect(spine.toolCoverage().every((r) => r.status === "failed")).toBe(true);
  });

  it("seeding twice is idempotent (no duplicates)", () => {
    spine.seedCoverage(standardTools(), standardHooks());
    expect(spine.hookCoverage().length).toBe(30);
    expect(spine.toolCoverage().length).toBe(29);
  });
});

describe("hook upsert is monotonic (two states only)", () => {
  it("verifies a hook with depth + evidence, then refuses to downgrade to failed", () => {
    spine.upsertHookCoverage({ hook_name: "PreToolUse", status: "fired_verified", channel_depth: true, evidence_event_id: 42, scenario: "M-toolcall" });
    let row = spine.hookCoverage().find((r) => r.hook_name === "PreToolUse")!;
    expect(row.status).toBe("fired_verified");
    expect(row.channel_depth).toBe(1);
    expect(row.evidence_event_id).toBe(42);

    // A later `failed` upsert must NOT un-fire it (monotonic within one DB).
    spine.upsertHookCoverage({ hook_name: "PreToolUse", status: "failed" });
    row = spine.hookCoverage().find((r) => r.hook_name === "PreToolUse")!;
    expect(row.status).toBe("fired_verified");
  });

  it("ORs in the otel channel bit and keeps the first evidence id", () => {
    spine.upsertHookCoverage({ hook_name: "PreToolUse", status: "fired_verified", channel_otel: true, evidence_event_id: 99 });
    const row = spine.hookCoverage().find((r) => r.hook_name === "PreToolUse")!;
    expect(row.channel_depth).toBe(1); // preserved
    expect(row.channel_otel).toBe(1); // newly OR-d in
    expect(row.evidence_event_id).toBe(42); // first non-null kept, not overwritten by 99
  });

  it("a never-fired hook stays failed (no proven_unreachable bucket exists)", () => {
    const row = spine.hookCoverage().find((r) => r.hook_name === "Notification")!;
    expect(row.status).toBe("failed");
  });
});

describe("tool upsert is monotonic (two states only)", () => {
  it("failed -> fired_verified, and a later failed upsert never downgrades it", () => {
    spine.upsertToolCoverage({ tool_name: "Read", kind: "model_invokable", status: "fired_verified", channel_depth: true, channel_otel: true, evidence_event_id: 7 });
    spine.upsertToolCoverage({ tool_name: "Read", status: "failed" });
    const row = spine.toolCoverage().find((r) => r.tool_name === "Read")!;
    expect(row.status).toBe("fired_verified");
    expect(row.channel_depth).toBe(1);
    expect(row.channel_otel).toBe(1);
  });
});

describe("summary + render (two states, strict identity)", () => {
  it("summary counts reflect the upserts; fired_verified + failed === total", () => {
    const s = spine.coverageSummary();
    expect(s.hooks.total).toBe(30);
    expect(s.tools.total).toBe(29);
    expect(s.hooks.fired_verified).toBeGreaterThanOrEqual(1);
    expect(s.tools.fired_verified).toBeGreaterThanOrEqual(1);
    // accounting identity — no third bucket
    expect(s.hooks.fired_verified + s.hooks.failed).toBe(30);
    expect(s.tools.fired_verified + s.tools.failed).toBe(29);
  });

  it("renders both ledgers + a two-state headline", () => {
    const out = renderCoverageClosure(spine);
    expect(out).toContain("two states: fired_verified | failed");
    expect(out).toContain("Hook coverage ledger (30 hooks)");
    expect(out).toContain("Tool coverage ledger (29 tools)");
    expect(out).toContain("PreToolUse");
  });
});
