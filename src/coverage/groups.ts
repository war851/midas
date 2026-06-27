// The GROUP TABLE — the single source of truth binding every one of the 29 tools and 30 hooks to
// (a) its trigger GROUP, (b) the MECHANISM that drives it, and (c) the CHANNEL(S) on which a real
// row must appear for it to count as `fired_verified`. The matrix driver and the verifier both read
// from here, so "which mechanism drives X" and "where X must be visible" are one pinned fact, not a
// number carried in anyone's head. Nothing here grades; it only declares the contract per item.
//
// RULE (chain-of-thought §M): an item is driven by its OWN group's mechanism, in isolation. Driving
// it with a different group's mechanism and then excusing the miss is the banned trick. There is no
// "unreachable" channel — every item has a real expected channel; if no row lands there, it FAILS.
import type { Channel } from "../spine/db.js";

// ---- tools -----------------------------------------------------------------------------------
// query  = the model invokes the named tool inside a wrapped runAgent() (deterministic, one tool).
// agent  = a spawned sub-agent / Task* path (Agent + the six Task* tools).
// human  = neo simulates the human operator via the PreToolUse gate (approval/answer tools).
export type ToolGroup = "query" | "agent" | "human";

export type ToolSpec = {
  name: string;
  group: ToolGroup;
};

// Every tool, model-invoked, verified by the SAME 3-channel join (message_stream tool_use + gate
// PreToolUse.gate + otel tool_result on ONE tool_use_id). `human` tools additionally require a
// gate `neo.decision` row for that tool_use_id (the human-seat path actually adjudicated the call).
export const TOOL_SPECS: ToolSpec[] = [
  // query (11)
  { name: "Read", group: "query" },
  { name: "Edit", group: "query" },
  { name: "Write", group: "query" },
  { name: "Glob", group: "query" },
  { name: "Grep", group: "query" },
  { name: "Bash", group: "query" },
  { name: "NotebookEdit", group: "query" },
  { name: "WebFetch", group: "query" },
  { name: "WebSearch", group: "query" },
  { name: "Skill", group: "query" },
  { name: "Workflow", group: "query" },
  // agent (7)
  { name: "Agent", group: "agent" },
  { name: "TaskCreate", group: "agent" },
  { name: "TaskGet", group: "agent" },
  { name: "TaskList", group: "agent" },
  { name: "TaskOutput", group: "agent" },
  { name: "TaskStop", group: "agent" },
  { name: "TaskUpdate", group: "agent" },
  // human / neo (11)
  { name: "AskUserQuestion", group: "human" },
  { name: "EnterPlanMode", group: "human" },
  { name: "ExitPlanMode", group: "human" },
  { name: "EnterWorktree", group: "human" },
  { name: "ExitWorktree", group: "human" },
  { name: "PushNotification", group: "human" },
  { name: "ScheduleWakeup", group: "human" },
  { name: "CronCreate", group: "human" },
  { name: "CronDelete", group: "human" },
  { name: "CronList", group: "human" },
  { name: "Monitor", group: "human" },
];

// ---- hooks -----------------------------------------------------------------------------------
// `mechanism` names the ONE driver run that exercises this hook's trigger. The matrix runs each
// distinct mechanism once, then verifies every hook on that mechanism INDIVIDUALLY by its own
// event_name on its own `channels`. `channels` = the channel(s) on which a row with this hook's
// event_name proves it fired. Multiple channels = a hook that can legitimately surface on either
// (the verifier requires a row on AT LEAST ONE assigned channel — never a wrong-event match, since
// it keys on event_name). `failFast` flags the massive/non-headless substrates the user scoped to
// STOP-at-first-honest-RED (teams runtime, TUI) — they are still genuinely attempted, never pre-excused.
export type HookMechanism =
  | "toolcall" // a wrapped single tool call: the ambient per-call callbacks
  | "batch" // multiple tools in one turn => PostToolBatch
  | "toolfail" // a deliberately failing tool => PostToolUseFailure
  | "subagent" // spawn a sub-agent => SubagentStart/Stop
  | "compact" // streaming /compact => PreCompact (callback)
  | "autodeny" // permissionMode:auto + out-of-workdir write => PermissionDenied
  | "configchange" // onQuery control method => ConfigChange
  | "worktree" // EnterWorktree + completed ExitWorktree => WorktreeCreate/Remove
  | "settings" // settings.json command-hook project run => the settings-only lifecycle events
  | "setup" // claude --init-only in a settings project => Setup
  | "elicit" // EXTERNAL MCP server requesting input => Elicitation/ElicitationResult
  | "watcher" // registered file/cwd watcher => FileChanged/CwdChanged
  | "stopfail" // induced API-error turn-end => StopFailure
  | "teams" // agent-teams runtime => TeammateIdle (fail-fast substrate)
  | "tui" // Claude Code notification => Notification (fail-fast substrate)
  | "open"; // UserPromptExpansion — streamed slash/@file attempt (no confirmed fireable trigger)

export type HookSpec = {
  name: string;
  mechanism: HookMechanism;
  channels: Channel[];
  failFast?: boolean;
};

export const HOOK_SPECS: HookSpec[] = [
  // toolcall — the ambient in-process callbacks any wrapped tool call emits
  { name: "PreToolUse", mechanism: "toolcall", channels: ["hook_callback"] },
  { name: "PostToolUse", mechanism: "toolcall", channels: ["hook_callback"] },
  { name: "UserPromptSubmit", mechanism: "toolcall", channels: ["hook_callback"] },
  { name: "Stop", mechanism: "toolcall", channels: ["hook_callback"] },
  { name: "MessageDisplay", mechanism: "toolcall", channels: ["hook_callback"] },
  { name: "PermissionRequest", mechanism: "toolcall", channels: ["hook_callback"] },
  // batch / failure / subagent
  { name: "PostToolBatch", mechanism: "batch", channels: ["hook_callback"] },
  { name: "PostToolUseFailure", mechanism: "toolfail", channels: ["hook_callback"] },
  { name: "SubagentStart", mechanism: "subagent", channels: ["hook_callback"] },
  { name: "SubagentStop", mechanism: "subagent", channels: ["hook_callback"] },
  // compaction (PreCompact callback; PostCompact is settings-only per prior research)
  { name: "PreCompact", mechanism: "compact", channels: ["hook_callback"] },
  { name: "PostCompact", mechanism: "settings", channels: ["settings_hook"] },
  // permission deny (auto-mode classifier — must be reproducible across both passes)
  { name: "PermissionDenied", mechanism: "autodeny", channels: ["hook_callback"] },
  // live config change via control method
  { name: "ConfigChange", mechanism: "configchange", channels: ["hook_callback", "settings_hook"] },
  // worktree (WorktreeRemove completes at session exit -> reliably captured on the settings command-hook channel)
  { name: "WorktreeCreate", mechanism: "worktree", channels: ["hook_callback", "settings_hook"] },
  { name: "WorktreeRemove", mechanism: "worktree", channels: ["hook_callback", "settings_hook"] },
  // settings.json command-hook channel: the lifecycle events the in-process union never invokes
  { name: "SessionStart", mechanism: "settings", channels: ["settings_hook"] },
  { name: "SessionEnd", mechanism: "settings", channels: ["settings_hook"] },
  { name: "InstructionsLoaded", mechanism: "settings", channels: ["settings_hook"] },
  { name: "TaskCreated", mechanism: "settings", channels: ["settings_hook"] },
  { name: "TaskCompleted", mechanism: "settings", channels: ["settings_hook"] },
  { name: "Setup", mechanism: "setup", channels: ["settings_hook"] },
  // mcp elicitation (external MCP server requesting input)
  { name: "Elicitation", mechanism: "elicit", channels: ["hook_callback", "settings_hook"] },
  { name: "ElicitationResult", mechanism: "elicit", channels: ["hook_callback", "settings_hook"] },
  // file/cwd watcher
  { name: "FileChanged", mechanism: "watcher", channels: ["hook_callback", "settings_hook"] },
  { name: "CwdChanged", mechanism: "watcher", channels: ["hook_callback", "settings_hook"] },
  // induced API-error stop
  { name: "StopFailure", mechanism: "stopfail", channels: ["hook_callback", "settings_hook"] },
  // fail-fast substrates (genuinely attempted; user scoped to STOP at first honest RED)
  { name: "TeammateIdle", mechanism: "teams", channels: ["hook_callback", "settings_hook"], failFast: true },
  { name: "Notification", mechanism: "tui", channels: ["settings_hook", "hook_callback"], failFast: true },
  // open: no confirmed fireable trigger (prior research) — still attempted
  { name: "UserPromptExpansion", mechanism: "open", channels: ["hook_callback", "settings_hook"] },
];

export function toolGroup(name: string): ToolGroup | null {
  return TOOL_SPECS.find((t) => t.name === name)?.group ?? null;
}

export function hookSpec(name: string): HookSpec | null {
  return HOOK_SPECS.find((h) => h.name === name) ?? null;
}

// The distinct mechanisms, in a stable drive order (lifecycle/settings first so SessionStart is
// captured, the heavier/uncertain harnesses last).
export const HOOK_MECHANISMS: HookMechanism[] = [
  "toolcall", "batch", "toolfail", "subagent", "compact", "autodeny", "configchange",
  "worktree", "settings", "setup", "elicit", "watcher", "stopfail", "teams", "tui", "open",
];

export function hooksForMechanism(m: HookMechanism): HookSpec[] {
  return HOOK_SPECS.filter((h) => h.mechanism === m);
}
