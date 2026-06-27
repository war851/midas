// The three capture channels feed the spine. None alone is complete (a tool can fail at
// DISPATCH and fire no result-hook), so we record hook callbacks + message stream + transcript,
// and let the instrumentation run prove which boundary lands on which channel.
import { readFileSync } from "node:fs";
import type {
  HookEvent,
  HookCallback,
  HookCallbackMatcher,
  CanUseTool,
  PermissionResult,
  Query,
} from "@anthropic-ai/claude-agent-sdk";
import { Spine } from "./db.js";

// The 30 HookEvents, transcribed verbatim from the installed type source
// node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:802 (HookEvent). NOT the doc's ~20.
// We register on ALL of them; the instrumentation run records which actually fire.
export const HOOK_EVENTS: HookEvent[] = [
  "PreToolUse", "PostToolUse", "PostToolUseFailure", "PostToolBatch", "Notification",
  "UserPromptSubmit", "UserPromptExpansion", "SessionStart", "SessionEnd", "Stop",
  "StopFailure", "SubagentStart", "SubagentStop", "PreCompact", "PostCompact",
  "PermissionRequest", "PermissionDenied", "Setup", "TeammateIdle", "TaskCreated",
  "TaskCompleted", "Elicitation", "ElicitationResult", "ConfigChange", "WorktreeCreate",
  "WorktreeRemove", "InstructionsLoaded", "CwdChanged", "FileChanged", "MessageDisplay",
];

// The human-in-the-seat request/verdict. neo (an agent acting as the human operator) implements
// HumanResponder: it receives the worker's pending tool call and approves or denies it. Routed
// through the PreToolUse hook because that is the PROVEN per-call gate in CLI 2.1.160 (canUseTool
// is not consulted for tool calls — this project's own in-container finding).
export type HumanReq = {
  tool: string;
  input: unknown;
  tool_use_id: string | null;
  session_id: string | null;
};
export type HumanVerdict = {
  approve: boolean;
  reason: string;
  sessionId?: string | null; // the responder agent's (neo's) own session.id — distinct attribution
  raw?: unknown;
};
export type HumanResponder = (req: HumanReq) => Promise<HumanVerdict>;

export type RunContext = {
  runId: string;
  spine: Spine;
  transcriptPaths: Set<string>;
  // Tools to DENY at the gate (for the permission-moment test). Live gate, never bypass.
  deny: Set<string>;
  // WHICH layer enforces the deny. "preToolUse" = the PreToolUse-hook decision (default, proven
  // path — does NOT fire PermissionDenied). "canUseTool" = let PreToolUse allow and deny at the
  // canUseTool gate instead, the permission-request DENY pathway that MAY fire PermissionDenied.
  denyLayer: "preToolUse" | "canUseTool";
  // Tools that require human (neo) approval before they run. When humanResponder is set and a
  // gated tool is requested, the gate asks neo and enforces neo's verdict. Empty by default.
  gatedTools: Set<string>;
  humanResponder: HumanResponder | null;
};

function pick(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

// Record one hook callback verbatim on the hook_callback channel + collect transcript paths.
function recordHookCallback(ctx: RunContext, input: unknown): Record<string, unknown> {
  const o = input as Record<string, unknown>;
  try {
    const tp = o["transcript_path"];
    if (typeof tp === "string") ctx.transcriptPaths.add(tp);
    const atp = o["agent_transcript_path"];
    if (typeof atp === "string") ctx.transcriptPaths.add(atp);
    ctx.spine.record({
      run_id: ctx.runId,
      channel: "hook_callback",
      event_name: String(o["hook_event_name"] ?? "unknown"),
      tool_name: pick(o, "tool_name"),
      tool_use_id: pick(o, "tool_use_id"),
      session_id: pick(o, "session_id"),
      agent_id: pick(o, "agent_id"),
      raw_json: JSON.stringify(input),
    });
  } catch (e) {
    console.error("[capture] hook record failed:", e);
  }
  return o;
}

// Channel 1: hook callbacks on all 30 events (verbatim, no-op) — EXCEPT PreToolUse, which is the
// REAL gate. Runtime evidence (CLI 2.1.160): canUseTool is NOT consulted for tool calls, but the
// PreToolUse hook fires for EVERY call and can return permissionDecision:"deny". So we both record
// the per-call gate DECISION on the gate channel AND block from here. canUseTool stays registered
// (buildGate) for completeness/never-bypass; it records when the SDK does route to it.
export function buildHookBundle(ctx: RunContext): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const recordOnly: HookCallback = async (input) => {
    recordHookCallback(ctx, input);
    return {};
  };

  const preToolUseGate: HookCallback = async (input) => {
    const o = recordHookCallback(ctx, input);
    const tool = pick(o, "tool_name");
    const toolUseId = pick(o, "tool_use_id");
    const sessionId = pick(o, "session_id");
    const inDeny = tool != null && ctx.deny.has(tool);
    // Enforce the deny at THIS layer only when denyLayer === "preToolUse". When "canUseTool",
    // let it through here (allow) so the deny lands at the canUseTool gate instead.
    const enforce = inDeny && ctx.denyLayer === "preToolUse";
    // The gate channel records the permission DECISION for every tool call (the place we block from).
    ctx.spine.record({
      run_id: ctx.runId,
      channel: "gate",
      event_name: "PreToolUse.gate",
      tool_name: tool,
      tool_use_id: toolUseId,
      session_id: sessionId,
      agent_id: pick(o, "agent_id"),
      raw_json: JSON.stringify({ tool, input: o["tool_input"], decision: enforce ? "deny" : "allow", denyLayer: ctx.denyLayer, inDeny }),
    });
    if (enforce) {
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `[gate] denied ${tool} (touch-mode deny set)`,
        },
      };
    }

    // Human-in-the-seat: if this tool is gated and a responder (neo) is wired, ask the human.
    // The worker's tool is HELD on this await until neo decides — exactly human-in-the-loop latency.
    if (tool != null && ctx.humanResponder && ctx.gatedTools.has(tool)) {
      let verdict: HumanVerdict;
      try {
        verdict = await ctx.humanResponder({ tool, input: o["tool_input"], tool_use_id: toolUseId, session_id: sessionId });
      } catch (e) {
        // Fail-safe: if the responder errors, DENY (a held decision that never resolves must not
        // silently pass). Record the failure verbatim.
        verdict = { approve: false, reason: `[neo] responder error: ${(e as Error).message}`, sessionId: null };
      }
      // Record neo's decision on the gate channel, attributed to neo (its own session.id).
      ctx.spine.record({
        run_id: ctx.runId,
        channel: "gate",
        event_name: "neo.decision",
        tool_name: tool,
        tool_use_id: toolUseId,
        session_id: verdict.sessionId ?? null,
        agent_id: "neo",
        raw_json: JSON.stringify({ tool, input: o["tool_input"], approve: verdict.approve, reason: verdict.reason, neoSessionId: verdict.sessionId ?? null, raw: verdict.raw ?? null }),
      });
      if (!verdict.approve) {
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: `[neo, human seat] denied ${tool}: ${verdict.reason}`,
          },
        };
      }
    }
    return {};
  };

  const bundle: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {};
  for (const ev of HOOK_EVENTS) bundle[ev] = [{ hooks: [ev === "PreToolUse" ? preToolUseGate : recordOnly] }];
  return bundle;
}

// Channel 4: the gate. Live permission decision (never bypass). Records the request VERBATIM,
// then allows — unless the tool is in ctx.deny, in which case it records and blocks.
export function buildGate(ctx: RunContext): CanUseTool {
  return async (toolName, input, options): Promise<PermissionResult> => {
    // Deny here only when denyLayer === "canUseTool" (the permission-request DENY pathway).
    // Under the default "preToolUse" layer, canUseTool always allows — the PreToolUse hook is
    // the enforcing layer — so canUseTool stays a pure recorder.
    const blocked = ctx.deny.has(toolName) && ctx.denyLayer === "canUseTool";
    try {
      ctx.spine.record({
        run_id: ctx.runId,
        channel: "gate",
        event_name: "canUseTool",
        tool_name: toolName,
        tool_use_id: typeof options.toolUseID === "string" ? options.toolUseID : null,
        session_id: null,
        agent_id: typeof options.agentID === "string" ? options.agentID : null,
        raw_json: JSON.stringify({ toolName, input, decision: blocked ? "deny" : "allow", denyLayer: ctx.denyLayer, decisionReason: options.decisionReason, blockedPath: options.blockedPath }),
      });
    } catch (e) {
      console.error("[capture] gate record failed:", e);
    }
    if (blocked) return { behavior: "deny", message: `[gate] denied ${toolName} (canUseTool deny layer)` };
    return { behavior: "allow", updatedInput: input };
  };
}

// Channel 2: the message stream. Records every SDKMessage verbatim, plus a row per tool_use /
// tool_result block (the RETURN EDGE — FileRead/Bash artifacts + is_error live here).
export async function consumeStream(q: Query, ctx: RunContext): Promise<{ assistantTexts: string[]; resultText: string | null }> {
  const assistantTexts: string[] = [];
  let resultText: string | null = null;

  for await (const message of q) {
    const m = message as unknown as Record<string, unknown>;
    const type = String(m["type"] ?? "unknown");
    const subtype = typeof m["subtype"] === "string" ? `:${m["subtype"]}` : "";
    const sessionId = pick(m, "session_id");

    ctx.spine.record({
      run_id: ctx.runId,
      channel: "message_stream",
      event_name: `${type}${subtype}`,
      tool_name: null,
      tool_use_id: null,
      session_id: sessionId,
      agent_id: null,
      raw_json: JSON.stringify(message),
    });

    // Extract content blocks from assistant/user messages (BetaMessage / MessageParam shape).
    const inner = m["message"] as Record<string, unknown> | undefined;
    const content = inner && Array.isArray(inner["content"]) ? (inner["content"] as Array<Record<string, unknown>>) : [];
    for (const block of content) {
      const bt = block["type"];
      if (bt === "tool_use") {
        ctx.spine.record({
          run_id: ctx.runId, channel: "message_stream", event_name: "tool_use",
          tool_name: pick(block, "name"), tool_use_id: pick(block, "id"),
          session_id: sessionId, agent_id: null, raw_json: JSON.stringify(block),
        });
      } else if (bt === "tool_result") {
        ctx.spine.record({
          run_id: ctx.runId, channel: "message_stream", event_name: "tool_result",
          tool_name: null, tool_use_id: pick(block, "tool_use_id"),
          session_id: sessionId, agent_id: null, raw_json: JSON.stringify(block),
        });
      } else if (bt === "text" && typeof block["text"] === "string") {
        if (type === "assistant") assistantTexts.push(block["text"] as string);
      }
    }

    if (type === "result" && typeof m["result"] === "string") resultText = m["result"] as string;
  }

  return { assistantTexts, resultText };
}

// Channel 3: the transcript. Read each transcript_path JSONL seen during the run and record
// every line verbatim. Closes the gap where a boundary appears only on disk.
export function recordTranscript(ctx: RunContext): void {
  for (const path of ctx.transcriptPaths) {
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue; // transcript file may not exist (e.g. persistSession off) — fail-open
    }
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(line); } catch { /* keep raw even if unparseable */ }
      ctx.spine.record({
        run_id: ctx.runId,
        channel: "transcript",
        event_name: typeof parsed["type"] === "string" ? (parsed["type"] as string) : "line",
        tool_name: null,
        tool_use_id: pick(parsed, "tool_use_id") ?? pick(parsed, "parent_tool_use_id"),
        session_id: pick(parsed, "sessionId") ?? pick(parsed, "session_id"),
        agent_id: null,
        raw_json: line,
      });
    }
  }
}
