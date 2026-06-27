// The human view over the two coverage ledgers. The ledgers live in SQLite (queryable, assertable);
// these renderers turn them into the markdown the user reads to MAP, TUNE, and TRACK progress. No
// file writes here — callers print or persist the returned strings. Mirrors orchestrator.renderClosure.
import type { Spine, HookCoverageRow, ToolCoverageRow, CoverageSummary } from "../spine/db.js";

function bit(n: number): string {
  return n ? "yes" : "—";
}

function cell(s: string | null): string {
  return (s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function renderHookLedger(rows: HookCoverageRow[]): string {
  const head = [
    `### Hook coverage ledger (${rows.length} hooks)`,
    ``,
    `| hook | status | depth | otel | evidence | scenario | reason |`,
    `|------|--------|-------|------|----------|----------|--------|`,
  ];
  const body = rows.map(
    (r) =>
      `| ${r.hook_name} | ${r.status} | ${bit(r.channel_depth)} | ${bit(r.channel_otel)} | ${r.evidence_event_id ?? "—"} | ${cell(r.scenario)} | ${cell(r.reason)} |`,
  );
  return [...head, ...body].join("\n");
}

export function renderToolLedger(rows: ToolCoverageRow[]): string {
  const head = [
    `### Tool coverage ledger (${rows.length} tools)`,
    ``,
    `| tool | kind | status | depth | otel | evidence | scenario | reason |`,
    `|------|------|--------|-------|------|----------|----------|--------|`,
  ];
  const body = rows.map(
    (r) =>
      `| ${r.tool_name} | ${r.kind} | ${r.status} | ${bit(r.channel_depth)} | ${bit(r.channel_otel)} | ${r.evidence_event_id ?? "—"} | ${cell(r.scenario)} | ${cell(r.reason)} |`,
  );
  return [...head, ...body].join("\n");
}

// The headline verdict: TWO states only. The proof is met ONLY when every hook and every tool is
// `fired_verified` (zero failed). There is no "accounted" middle ground — `failed` is failed.
export function renderCoverageHeadline(s: CoverageSummary): string {
  const hooksDone = s.hooks.failed === 0 && s.hooks.fired_verified === s.hooks.total;
  const toolsDone = s.tools.failed === 0 && s.tools.fired_verified === s.tools.total;
  return [
    `=== 021_midas total-coverage proof (two states: fired_verified | failed) ===`,
    `hooks : ${s.hooks.fired_verified}/${s.hooks.total} fired_verified, ${s.hooks.failed} FAILED [${hooksDone ? "GREEN" : "RED"}]`,
    `tools : ${s.tools.fired_verified}/${s.tools.total} fired_verified, ${s.tools.failed} FAILED [${toolsDone ? "GREEN" : "RED"}]`,
    `PROOF: ${hooksDone && toolsDone ? "GREEN — every hook and every tool fired_verified on its expected channel" : "RED — see FAILED rows below"}`,
  ].join("\n");
}

export function renderCoverageClosure(spine: Spine): string {
  return [
    renderCoverageHeadline(spine.coverageSummary()),
    ``,
    renderHookLedger(spine.hookCoverage()),
    ``,
    renderToolLedger(spine.toolCoverage()),
  ].join("\n");
}
