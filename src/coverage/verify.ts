// The VERIFIER — the strict grader core. A PURE READ over the events table that decides, per item,
// `fired_verified` or `failed`, against the EXPECTED channel(s) declared in groups.ts. There is no
// residue map, no OTel-softening, no "documented" override, no third bucket. Absence of the grounded
// row IS failure. This is the only thing that grades; it never trusts a self-report or an expectation.
//
//   TOOL (all 29): fired_verified iff ONE tool_use_id carries all three real rows —
//     message_stream `tool_use` (tool_name=T) ∧ gate `PreToolUse.gate` (tool_name=T) ∧
//     otel `tool_result` (tool_name=T). `human`-group tools additionally require a gate
//     `neo.decision` row for that same tool_use_id (the human seat actually adjudicated the call).
//   HOOK (30): fired_verified iff a row with event_name=H exists on AT LEAST ONE of the hook's
//     assigned channels (hook_callback and/or settings_hook). event_name keys the match, so a
//     wrong-event row can never count.
import type { Spine } from "../spine/db.js";
import { standardTools } from "./denominator.js";
import { TOOL_SPECS, HOOK_SPECS, toolGroup, hookSpec } from "./groups.js";

// Extract the human-readable text/error from a captured tool_result raw_json (message_stream block
// or transcript line). Returns the verbatim error/content so a FAILED row shows the REAL reason the
// SDK gave, not a narrative — e.g. an actual "requires a cloud backend" string, if that is what fired.
function resultText(raw: string): string | null {
  try {
    const b = JSON.parse(raw) as Record<string, unknown>;
    const isErr = b["is_error"] ? "is_error " : "";
    let content: unknown = b["content"];
    if (Array.isArray(content)) {
      content = content.map((c) => (typeof c === "string" ? c : ((c as Record<string, unknown>)?.["text"] ?? JSON.stringify(c)))).join(" ");
    } else if (typeof content !== "string") {
      content = JSON.stringify(b);
    }
    const s = (isErr + String(content)).replace(/\s+/g, " ").trim();
    return s.length ? s.slice(0, 500) : null;
  } catch {
    return raw.replace(/\s+/g, " ").slice(0, 500);
  }
}

// For a FAILED tool, capture the ACTUAL tool_result / error the SDK produced for that tool's
// tool_use_id(s), searching the channels that carry a result body. This is the captured raw evidence
// the operator reads to decide whether a miss is a real wall (an error literally stating a backend/
// cloud requirement) or a fixable harness gap. No classification here — just the verbatim string.
function capturedToolError(spine: Spine, ids: string[]): string | null {
  if (!ids.length) return null;
  const idset = new Set(ids);
  for (const ch of ["message_stream", "transcript", "otel"] as const) {
    for (const r of spine.eventsOnChannel(ch)) {
      if (r.event_name !== "tool_result") continue;
      if (!r.tool_use_id || !idset.has(r.tool_use_id)) continue;
      const t = resultText(r.raw_json);
      if (t) return `[${ch} tool_result] ${t}`;
    }
  }
  // No tool_result anywhere for these ids: capture any error-flagged system/assistant text in the
  // same run(s) so the row still shows what the SDK said, not a guess.
  for (const r of spine.eventsOnChannel("message_stream")) {
    if (!r.tool_use_id || !idset.has(r.tool_use_id)) continue; // tool_use row -> its run
    const sysErr = spine
      .eventsForRun(r.run_id)
      .find((e) => e.channel === "message_stream" && /error|denied|not.?found|unknown|unavailable/i.test(e.event_name));
    if (sysErr) return `[no tool_result; ${sysErr.event_name}] ${resultText(sysErr.raw_json) ?? ""}`.slice(0, 500);
  }
  return null;
}

export type ItemVerdict = {
  name: string;
  fired: boolean;
  evidenceId: number | null;
  channelDepth: boolean; // a row on a depth channel (message_stream/gate/hook_callback/settings_hook)
  channelOtel: boolean; // a corroborating otel row
  detail: string; // why it passed (the join id) or failed (which channel rows are missing)
};

// --- tool verification: the 3-channel join by tool_use_id -------------------------------------
export function verifyTool(spine: Spine, toolName: string): ItemVerdict {
  const group = toolGroup(toolName);
  const stream = spine
    .eventsOnChannel("message_stream")
    .filter((r) => r.event_name === "tool_use" && r.tool_name === toolName);
  const gate = spine
    .eventsOnChannel("gate")
    .filter((r) => r.event_name === "PreToolUse.gate" && r.tool_name === toolName);
  const otel = spine
    .eventsOnChannel("otel")
    .filter((r) => r.event_name === "tool_result" && r.tool_name === toolName);

  const streamIds = new Set(stream.map((r) => r.tool_use_id).filter((x): x is string => !!x));
  const gateIds = new Set(gate.map((r) => r.tool_use_id).filter((x): x is string => !!x));
  const otelIds = new Set(otel.map((r) => r.tool_use_id).filter((x): x is string => !!x));

  // The join: a single tool_use_id present on all three channels.
  const joinId = [...streamIds].find((id) => gateIds.has(id) && otelIds.has(id)) ?? null;

  // human-group: the same tool_use_id must also carry a neo.decision (the human seat adjudicated it).
  let neoOk = true;
  let neoMiss = "";
  if (group === "human") {
    const neoIds = new Set(
      spine
        .eventsOnChannel("gate")
        .filter((r) => r.event_name === "neo.decision" && r.tool_name === toolName)
        .map((r) => r.tool_use_id)
        .filter((x): x is string => !!x),
    );
    neoOk = joinId != null && neoIds.has(joinId);
    if (!neoOk) neoMiss = "neo.decision ";
  }

  const fired = joinId != null && neoOk;
  const evidenceId = fired ? stream.find((r) => r.tool_use_id === joinId)?.id ?? null : null;

  let detail: string;
  if (fired) {
    detail = `joined on tool_use_id=${joinId}`;
  } else {
    // CAPTURE the real tool_result/error the SDK gave for this tool's tool_use_id(s) — the verbatim
    // evidence, not a narrative. Prefix with the channel-presence facts so both are visible.
    const ids = [...streamIds];
    const captured = capturedToolError(spine, ids);
    const facts = `stream=${streamIds.size} gate=${gateIds.size} otel=${otelIds.size}${group === "human" ? ` neo=${neoMiss ? 0 : 1}` : ""}`;
    detail = captured ? `${facts} | ${captured}` : `${facts} | no tool_result captured for ids=[${ids.join(",")}]`;
  }

  return { name: toolName, fired, evidenceId, channelDepth: streamIds.size > 0 || gateIds.size > 0, channelOtel: otelIds.size > 0, detail };
}

// --- hook verification: a real row with event_name=H on an assigned channel -------------------
export function verifyHook(spine: Spine, hookName: string): ItemVerdict {
  const spec = hookSpec(hookName);
  if (!spec) return { name: hookName, fired: false, evidenceId: null, channelDepth: false, channelOtel: false, detail: "no spec" };
  for (const ch of spec.channels) {
    const rows = spine.eventsOnChannel(ch).filter((r) => r.event_name === hookName);
    if (rows.length) {
      return {
        name: hookName,
        fired: true,
        evidenceId: rows[0].id,
        channelDepth: ch !== "otel",
        channelOtel: ch === "otel",
        detail: `fired on ${ch} (event_name=${hookName})`,
      };
    }
  }
  return {
    name: hookName,
    fired: false,
    evidenceId: null,
    channelDepth: false,
    channelOtel: false,
    detail: `no row event_name=${hookName} on [${spec.channels.join(",")}]`,
  };
}

// --- verify every item and write the verdict to the ledger ------------------------------------
// Pure with respect to driving: it never invokes an agent. It reads the events the drivers already
// produced and records the two-state verdict. Returns the fired sets for the matrix grader.
export type VerifyResult = {
  firedTools: Set<string>;
  failedTools: Set<string>;
  firedHooks: Set<string>;
  failedHooks: Set<string>;
};

export function verifyAndRecordAll(spine: Spine, scenario = "matrix"): VerifyResult {
  const kindOf = new Map(standardTools().map((t) => [t.name, t.kind]));
  const res: VerifyResult = { firedTools: new Set(), failedTools: new Set(), firedHooks: new Set(), failedHooks: new Set() };

  for (const t of TOOL_SPECS) {
    const v = verifyTool(spine, t.name);
    spine.upsertToolCoverage({
      tool_name: t.name,
      kind: kindOf.get(t.name) ?? "unknown",
      status: v.fired ? "fired_verified" : "failed",
      channel_depth: v.channelDepth,
      channel_otel: v.channelOtel,
      evidence_event_id: v.evidenceId,
      reason: v.fired ? null : v.detail,
      scenario,
    });
    (v.fired ? res.firedTools : res.failedTools).add(t.name);
  }

  for (const h of HOOK_SPECS) {
    const v = verifyHook(spine, h.name);
    spine.upsertHookCoverage({
      hook_name: h.name,
      status: v.fired ? "fired_verified" : "failed",
      channel_depth: v.channelDepth,
      channel_otel: v.channelOtel,
      evidence_event_id: v.evidenceId,
      reason: v.fired ? null : v.detail,
      scenario,
    });
    (v.fired ? res.firedHooks : res.failedHooks).add(h.name);
  }

  return res;
}
