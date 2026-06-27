// Stage 0b — the VERIFIER, unit-level (no agent, hand-seeded events). Proves the strict grader is
// itself correct BEFORE any hours-long agent driving: the 3-channel tool join (stream ∧ gate ∧ otel
// on ONE tool_use_id), the human-group neo.decision requirement, and the hook channel match by
// event_name. If this is wrong, every downstream verdict is wrong — so it is proven first.
import { describe, it, beforeEach, expect } from "vitest";
import { Spine } from "../src/spine/db.js";
import { standardTools, standardHooks } from "../src/coverage/denominator.js";
import { verifyTool, verifyHook, verifyAndRecordAll } from "../src/coverage/verify.js";

let spine: Spine;
beforeEach(() => {
  spine = new Spine(`/tmp/coverage-verify-${Date.now()}-${Math.round(performance.now())}.sqlite`);
  spine.seedCoverage(standardTools(), standardHooks());
});

// helpers to hand-seed the three tool channels
function streamToolUse(tool: string, tuid: string) {
  spine.record({ run_id: "r", channel: "message_stream", event_name: "tool_use", tool_name: tool, tool_use_id: tuid, session_id: "s", agent_id: null, raw_json: "{}" });
}
function gatePre(tool: string, tuid: string) {
  spine.record({ run_id: "r", channel: "gate", event_name: "PreToolUse.gate", tool_name: tool, tool_use_id: tuid, session_id: "s", agent_id: null, raw_json: "{}" });
}
function otelResult(tool: string, tuid: string) {
  spine.record({ run_id: "sess", channel: "otel", event_name: "tool_result", tool_name: tool, tool_use_id: tuid, session_id: "sess", agent_id: null, raw_json: "{}" });
}
function neoDecision(tool: string, tuid: string) {
  spine.record({ run_id: "r", channel: "gate", event_name: "neo.decision", tool_name: tool, tool_use_id: tuid, session_id: "neo", agent_id: "neo", raw_json: "{}" });
}
function hookCallback(name: string) {
  spine.record({ run_id: "r", channel: "hook_callback", event_name: name, tool_name: null, tool_use_id: null, session_id: "s", agent_id: null, raw_json: "{}" });
}
function settingsHook(name: string) {
  spine.record({ run_id: "r", channel: "settings_hook", event_name: name, tool_name: null, tool_use_id: null, session_id: "s", agent_id: null, raw_json: "{}" });
}

describe("verifyTool — strict 3-channel join", () => {
  it("query tool with stream ∧ gate ∧ otel on ONE tool_use_id => fired_verified", () => {
    streamToolUse("Read", "toolu_A"); gatePre("Read", "toolu_A"); otelResult("Read", "toolu_A");
    const v = verifyTool(spine, "Read");
    expect(v.fired).toBe(true);
    expect(v.channelDepth).toBe(true);
    expect(v.channelOtel).toBe(true);
    expect(v.detail).toContain("toolu_A");
  });

  it("missing otel tool_result => FAILED (no half-credit)", () => {
    streamToolUse("Glob", "toolu_B"); gatePre("Glob", "toolu_B");
    const v = verifyTool(spine, "Glob");
    expect(v.fired).toBe(false);
    expect(v.detail).toContain("otel");
  });

  it("three channels but DIFFERENT tool_use_ids => FAILED (no join)", () => {
    streamToolUse("Bash", "toolu_C"); gatePre("Bash", "toolu_D"); otelResult("Bash", "toolu_E");
    const v = verifyTool(spine, "Bash");
    expect(v.fired).toBe(false);
    expect(v.detail).toMatch(/stream=1 gate=1 otel=1/); // channel facts shown; no single joined id
  });

  it("human tool with full join but NO neo.decision => FAILED", () => {
    streamToolUse("EnterWorktree", "toolu_F"); gatePre("EnterWorktree", "toolu_F"); otelResult("EnterWorktree", "toolu_F");
    const v = verifyTool(spine, "EnterWorktree");
    expect(v.fired).toBe(false);
    expect(v.detail).toContain("neo=0"); // human-group neo.decision missing for the joined id
  });

  it("human tool with full join AND neo.decision on the same id => fired_verified", () => {
    streamToolUse("EnterWorktree", "toolu_G"); gatePre("EnterWorktree", "toolu_G"); otelResult("EnterWorktree", "toolu_G"); neoDecision("EnterWorktree", "toolu_G");
    const v = verifyTool(spine, "EnterWorktree");
    expect(v.fired).toBe(true);
  });

  it("a tool with no events at all => FAILED", () => {
    expect(verifyTool(spine, "WebSearch").fired).toBe(false);
  });
});

describe("verifyHook — event_name on an assigned channel", () => {
  it("callback hook present on hook_callback => fired_verified", () => {
    hookCallback("PreToolUse");
    expect(verifyHook(spine, "PreToolUse").fired).toBe(true);
  });

  it("settings-only hook present on settings_hook => fired_verified", () => {
    settingsHook("SessionStart");
    expect(verifyHook(spine, "SessionStart").fired).toBe(true);
  });

  it("settings-only hook present only on the WRONG channel (hook_callback) => FAILED", () => {
    hookCallback("SessionStart"); // SessionStart's assigned channel is settings_hook only
    expect(verifyHook(spine, "SessionStart").fired).toBe(false);
  });

  it("a hook with no row anywhere => FAILED", () => {
    expect(verifyHook(spine, "Notification").fired).toBe(false);
  });
});

describe("verifyAndRecordAll — writes two-state verdicts to the ledger", () => {
  it("records fired_verified and failed correctly across both ledgers", () => {
    // one good query tool, one good callback hook; everything else fails
    streamToolUse("Read", "toolu_X"); gatePre("Read", "toolu_X"); otelResult("Read", "toolu_X");
    hookCallback("PreToolUse");
    const res = verifyAndRecordAll(spine, "unit");
    expect(res.firedTools.has("Read")).toBe(true);
    expect(res.firedHooks.has("PreToolUse")).toBe(true);
    expect(res.firedTools.size).toBe(1);
    expect(res.firedHooks.size).toBe(1);
    // ledger persisted
    expect(spine.toolCoverage().find((r) => r.tool_name === "Read")!.status).toBe("fired_verified");
    expect(spine.toolCoverage().find((r) => r.tool_name === "Glob")!.status).toBe("failed");
    expect(spine.hookCoverage().find((r) => r.hook_name === "PreToolUse")!.status).toBe("fired_verified");
    const s = spine.coverageSummary();
    expect(s.tools.fired_verified + s.tools.failed).toBe(29);
    expect(s.hooks.fired_verified + s.hooks.failed).toBe(30);
  });
});
