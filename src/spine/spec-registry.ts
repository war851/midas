// The PUBLISHED BEHAVIORAL SPEC as machine-readable predicates over each tool's documented
// return-edge artifact. Truth = the installed type source (sdk-tools.d.ts), NOT the model-facing
// tool description. Each predicate cites its type-source line. Verified against a REAL captured
// PostToolUse.tool_response (FileReadOutput shape) before being written.

export type LimitFinding = {
  tool: string;
  code: string;
  detail: string;
  citation: string;
};

type SpecCheck = (toolResponse: Record<string, unknown>) => LimitFinding[];

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

export const SPEC_REGISTRY: Record<string, SpecCheck> = {
  // FileReadOutput — sdk-tools.d.ts:142
  Read: (r) => {
    const file = (r["file"] ?? {}) as Record<string, unknown>;
    const cite = "sdk-tools.d.ts:142 (FileReadOutput.file)";
    const out: LimitFinding[] = [];
    if (file["truncatedByTokenCap"] === true) {
      out.push({ tool: "Read", code: "read.truncatedByTokenCap", detail: "whole-file read auto-paginated past the token cap; content is a partial first page", citation: cite });
    }
    const nl = num(file["numLines"]);
    const tl = num(file["totalLines"]);
    if (nl != null && tl != null && nl < tl) {
      out.push({ tool: "Read", code: "read.partial", detail: `read ${nl} of ${tl} lines (partial)`, citation: cite });
    }
    return out;
  },

  // BashOutput — sdk-tools.d.ts:2396
  Bash: (r) => {
    const cite = "sdk-tools.d.ts:2396 (BashOutput)";
    const out: LimitFinding[] = [];
    if (r["interrupted"] === true) out.push({ tool: "Bash", code: "bash.interrupted", detail: "command was interrupted", citation: cite });
    if (typeof r["persistedOutputPath"] === "string") out.push({ tool: "Bash", code: "bash.outputOffloaded", detail: "output too large for inline; offloaded to a file", citation: cite });
    return out;
  },

  // GlobOutput — sdk-tools.d.ts:2611
  Glob: (r) => {
    const cite = "sdk-tools.d.ts:2611 (GlobOutput.truncated)";
    return r["truncated"] === true ? [{ tool: "Glob", code: "glob.truncated", detail: "results capped at 100 files", citation: cite }] : [];
  },

  // GrepOutput — sdk-tools.d.ts:2629
  Grep: (r) => {
    const cite = "sdk-tools.d.ts:2629 (GrepOutput.appliedLimit)";
    return r["appliedLimit"] != null ? [{ tool: "Grep", code: "grep.limited", detail: `results limited (appliedLimit=${String(r["appliedLimit"])})`, citation: cite }] : [];
  },
};

// What CAN go wrong for a tool, per spec — used by the omission comparison even when nothing fired.
export function knownLimitsFor(tool: string): string[] {
  switch (tool) {
    case "Read": return ["read.partial", "read.truncatedByTokenCap"];
    case "Bash": return ["bash.interrupted", "bash.outputOffloaded"];
    case "Glob": return ["glob.truncated"];
    case "Grep": return ["grep.limited"];
    default: return [];
  }
}

export function checkSpec(tool: string | null, toolResponse: unknown): LimitFinding[] {
  if (!tool) return [];
  const fn = SPEC_REGISTRY[tool];
  if (!fn || toolResponse == null || typeof toolResponse !== "object") return [];
  return fn(toolResponse as Record<string, unknown>);
}

// U7 — LIMIT-COVERAGE MAP. The scorecard gap (review Q4: "only 4 tools") made TOTAL and VISIBLE instead
// of a silent `[]` fallthrough. Every one of the 29 vendored denominator tools is enumerated here exactly
// once: it EITHER carries a machine-checkable output-truncation predicate in SPEC_REGISTRY
// (`checkable: true`), OR it does NOT, each with a cited reason (`checkable: false`). A denominator tool
// absent from this map is a TEST FAILURE (tests/spec-registry.test.ts), so the 4-vs-25 gap can never hide.
//
// SCOPE (kept clean, honest, un-overclaimed): a "limit" here is an OUTPUT-truncation/capping artifact a
// tool reports when it returned LESS than asked (partial read, capped glob, interrupted bash, offloaded
// output). Three tools carry a typed field on a DIFFERENT axis — named, not encoded, so the boundary is a
// stated decision, not a hidden hole: `ScheduleWakeup.wasClamped` (INPUT clamp), `PushNotification.disabledReason`
// (action suppressed), and the `error`/HTTP-`code` fields (error axis). Encoding those is DEFERRED under R5
// (no current case needs them; default no), and naming them keeps the deferral visible. The provenance
// triple: what Anthropic said = the cited `sdk-tools.d.ts` lines; what we could do = the 4 predicates +
// this total map; the boundary = the named-but-unencoded axes above (their limit, our explicit scope).
export type LimitCoverage = { checkable: boolean; citation: string; note: string };

export const LIMIT_COVERAGE: Record<string, LimitCoverage> = {
  // checkable — an output-truncation predicate exists in SPEC_REGISTRY above
  Read: { checkable: true, citation: "sdk-tools.d.ts:157,165,169 (FileReadOutput.file numLines/totalLines/truncatedByTokenCap)", note: "partial read + token-cap pagination" },
  Bash: { checkable: true, citation: "sdk-tools.d.ts:2412,2448 (BashOutput.interrupted, persistedOutputPath)", note: "interruption + oversized-output offload" },
  Glob: { checkable: true, citation: "sdk-tools.d.ts:2627 (GlobOutput.truncated)", note: "results capped at 100 files" },
  Grep: { checkable: true, citation: "sdk-tools.d.ts:2636 (GrepOutput.appliedLimit)", note: "match limit applied" },

  // not checkable — the typed Output carries NO output-truncation field
  Agent: { checkable: false, citation: "sdk-tools.d.ts:81 (AgentOutput)", note: "usage/toolStats only; no truncation artifact" },
  Edit: { checkable: false, citation: "sdk-tools.d.ts:2519 (FileEditOutput)", note: "diff/userModified; no truncation artifact" },
  Write: { checkable: false, citation: "sdk-tools.d.ts:2567 (FileWriteOutput)", note: "diff/userModified; no truncation artifact" },
  NotebookEdit: { checkable: false, citation: "sdk-tools.d.ts:2657,2681 (NotebookEditOutput.error?)", note: "error field is an error axis, not an output limit" },
  Skill: { checkable: false, citation: "sdk-tools.d.ts:46-80 (no SkillOutput member in ToolOutputSchemas)", note: "no typed output schema" },
  WebFetch: { checkable: false, citation: "sdk-tools.d.ts:2733,2741 (WebFetchOutput.bytes/code)", note: "bytes + HTTP code (error axis); no truncation flag" },
  WebSearch: { checkable: false, citation: "sdk-tools.d.ts:2759,2796 (WebSearchOutput.searchCount)", note: "search count only; no truncation flag" },
  Workflow: { checkable: false, citation: "sdk-tools.d.ts:3111,3134,3138 (WorkflowOutput.warning?/error?)", note: "warning/error axis, not an output limit" },
  AskUserQuestion: { checkable: false, citation: "sdk-tools.d.ts:2798 (AskUserQuestionOutput)", note: "Q&A payload; no limit artifact" },
  CronCreate: { checkable: false, citation: "sdk-tools.d.ts:3140 (CronCreateOutput)", note: "id/schedule; no limit artifact" },
  CronDelete: { checkable: false, citation: "sdk-tools.d.ts:3146 (CronDeleteOutput)", note: "id; no limit artifact" },
  CronList: { checkable: false, citation: "sdk-tools.d.ts:3149 (CronListOutput)", note: "jobs list; no limit artifact" },
  EnterPlanMode: { checkable: false, citation: "sdk-tools.d.ts:3064 (EnterPlanModeOutput)", note: "message; no limit artifact" },
  EnterWorktree: { checkable: false, citation: "sdk-tools.d.ts:2981 (EnterWorktreeOutput)", note: "paths/message; no limit artifact" },
  ExitPlanMode: { checkable: false, citation: "sdk-tools.d.ts:2492 (ExitPlanModeOutput)", note: "plan echo; no limit artifact" },
  ExitWorktree: { checkable: false, citation: "sdk-tools.d.ts:2986,2992,2993 (ExitWorktreeOutput.discardedFiles/Commits)", note: "informational counts, not an output limit" },
  Monitor: { checkable: false, citation: "sdk-tools.d.ts:3050 (MonitorOutput)", note: "taskId/timeout echo; no limit artifact" },
  PushNotification: { checkable: false, citation: "sdk-tools.d.ts:3159,3163 (PushNotificationOutput.disabledReason)", note: "disabledReason = action suppressed (suppression axis), not an output limit" },
  ScheduleWakeup: { checkable: false, citation: "sdk-tools.d.ts:3036,3048 (ScheduleWakeupOutput.wasClamped)", note: "wasClamped = INPUT clamp (input-adjust axis), not an output limit; predicate deferred per R5" },
  TaskCreate: { checkable: false, citation: "sdk-tools.d.ts:2996 (TaskCreateOutput)", note: "task id/subject; no limit artifact" },
  TaskGet: { checkable: false, citation: "sdk-tools.d.ts:3002 (TaskGetOutput)", note: "task record; no limit artifact" },
  TaskList: { checkable: false, citation: "sdk-tools.d.ts:3022 (TaskListOutput)", note: "task list; no limit artifact" },
  TaskOutput: { checkable: false, citation: "sdk-tools.d.ts:14,375 (TaskOutputInput; no TaskOutputOutput member)", note: "no typed output schema; no limit artifact" },
  TaskStop: { checkable: false, citation: "sdk-tools.d.ts:2639 (TaskStopOutput)", note: "stop message; no limit artifact" },
  TaskUpdate: { checkable: false, citation: "sdk-tools.d.ts:3012,3016 (TaskUpdateOutput.error?)", note: "error field is an error axis, not an output limit" },
};

// True iff the tool has a machine-checkable output-truncation predicate (i.e. a SPEC_REGISTRY entry).
export function isLimitCheckable(tool: string): boolean {
  return LIMIT_COVERAGE[tool]?.checkable === true;
}

// U6 — the CLOSED vocabulary of typed limit codes (single-sourced from the predicates above). This is the
// exact set the disclosure rule asks the agent to echo and the structural truth layer matches against —
// codes, not prose. Derived from SPEC_REGISTRY so the vocabulary can never drift from the predicates.
export const ALL_LIMIT_CODES: string[] = Object.keys(SPEC_REGISTRY).flatMap((t) => knownLimitsFor(t));
