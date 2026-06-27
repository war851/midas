// The harness: wires query() to all three capture channels + the gate, in watch mode
// (originally referred to as quarantine; live permission mode, never bypass). Returns the spine context + what the agent SAID.
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { McpServerConfig, SDKUserMessage, Query } from "@anthropic-ai/claude-agent-sdk";
import { Spine } from "./spine/db.js";
import { buildHookBundle, buildGate, consumeStream, recordTranscript, type RunContext, type HumanResponder } from "./spine/capture.js";
import { DISCLOSURE_RULE } from "./disclosure/rule.js";
import { captureDisclosure, type ParseResult } from "./disclosure/parse.js";

export type RunOpts = {
  prompt: string;
  runId: string;
  spine: Spine;
  deny?: string[];          // tools the HARNESS gate blocks (PreToolUse/canUseTool callbacks)
  denyLayer?: "preToolUse" | "canUseTool"; // WHICH harness layer enforces deny. Default
                            // "preToolUse". Neither callback layer fires the PermissionDenied
                            // hook (proven) — they are host-side denials.
  disallow?: string[];      // disallowedTools: REMOVES the tool from the model's set (no attempt,
                            // no deny) — proven NOT to fire PermissionDenied. Kept for completeness.
  permissionMode?: "default" | "dontAsk" | "acceptEdits" | "bypassPermissions" | "plan" | "auto";
                            // Default "default" (WATCH MODE live gate). "dontAsk" = headless
                            // auto-deny of not-pre-approved tools — the CLI-side auto-deny that
                            // fires PermissionDenied + system:permission_denied (sdk.d.ts:3368).
  mcpServers?: Record<string, McpServerConfig>; // in-process MCP servers (createSdkMcpServer).
                            // Exercises the real MCP tool-call path through the gate, and the
                            // Elicitation/ElicitationResult hooks when a tool requests input.
  model?: string;           // MODEL PIN (Sonnet) lands here — tracked, not yet set
  maxTurns?: number;
  cwd?: string;             // per-run cwd (probe: does a fresh cwd keep the gate live?)
  additionalDirectories?: string[];
  disclose?: boolean;       // pillar 2: require + capture the agent's structured disclosure
  gatedTools?: string[];    // tools that require human (neo) approval at the PreToolUse gate
  humanResponder?: HumanResponder; // the human-in-the-seat (neo). Asked when a gated tool is used.
  // --- coverage levers (Stage 2: fire the config-gated hooks) -------------------------------
  settingSources?: ("user" | "project" | "local")[]; // load CLAUDE.md / settings (=> InstructionsLoaded,
                            // UserPromptExpansion, ConfigChange). Unset on the default path (why those hooks
                            // stayed dark); set it and they become reachable. sdk.d.ts:1805/5592.
  turns?: string[];         // STREAMING input: each string is a user turn (enables a "/compact" turn =>
                            // PreCompact/PostCompact). When present, overrides `prompt`. sdk.d.ts:2395.
  elicit?: boolean;         // wire an auto-accepting onElicitation so an MCP elicitation resolves (=>
                            // Elicitation/ElicitationResult) instead of auto-declining/hanging. sdk.d.ts:1474.
  extraEnv?: Record<string, string>; // merged over process.env (e.g. a fresh CLAUDE_CONFIG_DIR => Setup).
  onQuery?: (q: Query) => Promise<void>; // mid-session control hook (streaming mode only): call
                            // q.applyFlagSettings / setPermissionMode / setModel => a live config
                            // change (=> ConfigChange). Runs concurrently with the output stream.
};

// GateConfig — the vocabulary for the single configurable gate. runAgent(GateConfig) is the one
// sanctioned door every capturing run is forced through (see tests/gate-chokepoint.test.ts).
export type GateConfig = RunOpts;

export type RunResult = {
  ctx: RunContext;
  assistantTexts: string[];
  resultText: string | null;
  disclosure: ParseResult | null;
};

// MODEL PIN: Sonnet is pinned container-wide (more failure-prone than the Opus default => better
// watch-mode fidelity). Order: explicit opts.model > MIDAS_MODEL (compose env) > claude-sonnet-4-6 fallback.
export const PINNED_MODEL = process.env.MIDAS_MODEL ?? "claude-sonnet-4-6";

export async function runAgent(opts: RunOpts): Promise<RunResult> {
  const ctx: RunContext = {
    runId: opts.runId,
    spine: opts.spine,
    transcriptPaths: new Set<string>(),
    deny: new Set(opts.deny ?? []),
    denyLayer: opts.denyLayer ?? "preToolUse",
    gatedTools: new Set(opts.gatedTools ?? []),
    humanResponder: opts.humanResponder ?? null,
  };

  const model = opts.model ?? PINNED_MODEL;
  // Record the resolved model (and run config) per run so every run's model is evidenced.
  opts.spine.record({
    run_id: opts.runId, channel: "run_meta", event_name: "run_start",
    tool_name: null, tool_use_id: null, session_id: null, agent_id: null,
    raw_json: JSON.stringify({ model, disclose: !!opts.disclose, deny: opts.deny ?? [], denyLayer: opts.denyLayer ?? "preToolUse", maxTurns: opts.maxTurns ?? 12 }),
  });

  // STREAMING input (Stage 2): a generator of user turns lets us send a "/compact" turn so the
  // compaction hooks fire. Lazy by design — the SDK pulls the next turn only after the prior one's
  // assistant turn completes. Falls back to the plain string prompt when `turns` is unset.
  async function* streamTurns(turns: string[]): AsyncGenerator<SDKUserMessage> {
    for (const t of turns) {
      yield { type: "user", parent_tool_use_id: null, message: { role: "user", content: t } } as SDKUserMessage;
    }
  }
  const promptArg = opts.turns && opts.turns.length ? streamTurns(opts.turns) : opts.prompt;

  const q = query({
    prompt: promptArg,
    options: {
      model,
      ...(opts.cwd ? { cwd: opts.cwd } : {}),
      ...(opts.additionalDirectories ? { additionalDirectories: opts.additionalDirectories } : {}),
      ...(opts.disallow ? { disallowedTools: opts.disallow } : {}),  // disallowedTools = tool removal
      ...(opts.mcpServers ? { mcpServers: opts.mcpServers } : {}),    // in-process MCP via the gate
      ...(opts.settingSources ? { settingSources: opts.settingSources } : {}), // load CLAUDE.md/settings
      ...(opts.elicit ? { onElicitation: async () => ({ action: "accept" as const }) } : {}), // resolve elicitation
      // WATCH MODE: when disclosing, REPLACE the system prompt with only the disclosure rule.
      // This keeps the agent maximally failure-prone (no claude_code competence preset) while
      // adding the observation requirement. Undefined => the SDK's minimal default prompt.
      ...(opts.disclose ? { systemPrompt: DISCLOSURE_RULE } : {}),
      permissionMode: opts.permissionMode ?? "default", // default = WATCH MODE live gate
      includeHookEvents: true,       // channel 2 carries hook lifecycle + denials
      hooks: buildHookBundle(ctx),   // channel 1
      canUseTool: buildGate(ctx),    // channel 4 (the gate, records + can deny)
      maxTurns: opts.maxTurns ?? 12,
      // TS: env REPLACES the inherited environment — spread to keep PATH + CLAUDE_CONFIG_DIR.
      // extraEnv merges on top (e.g. a fresh CLAUDE_CONFIG_DIR to fire Setup).
      env: { ...process.env, ...(opts.extraEnv ?? {}) },
      // allowedTools intentionally UNSET: every tool falls through to the gate and is recorded.
    },
  });

  // Mid-session control (streaming mode): run concurrently with the output stream so control
  // requests (applyFlagSettings/setPermissionMode/setModel = live config changes) land while the
  // session is active. Errors are recorded, never fatal — the attempt itself is the evidence.
  const sideP: Promise<void> = opts.onQuery
    ? Promise.resolve()
        .then(() => opts.onQuery!(q))
        .catch((e) => {
          opts.spine.record({
            run_id: opts.runId, channel: "run_meta", event_name: "onQuery_error",
            tool_name: null, tool_use_id: null, session_id: null, agent_id: null,
            raw_json: JSON.stringify({ error: (e as Error).message }),
          });
        })
    : Promise.resolve();

  const streamed = await consumeStream(q, ctx);
  await sideP;
  recordTranscript(ctx); // channel 3 — read after the run from the transcript_path(s) seen

  let disclosure: ParseResult | null = null;
  if (opts.disclose) {
    // The disclosure block lives in the agent's final message.
    const finalText = streamed.resultText ?? streamed.assistantTexts.at(-1) ?? "";
    disclosure = captureDisclosure(opts.spine, opts.runId, finalText);
  }

  return { ctx, ...streamed, disclosure };
}
