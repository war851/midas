// The DENOMINATOR — the fixed universe the coverage proof is measured against. The two lists are
// vendored artifacts (src/coverage/standard-{tools,hooks}.json) so "all tools / all hooks" is a
// pinned, diffable set, not a number carried in my head or re-derived each run:
//   - standard-tools.json : the 29 tools the SDK's bundled CLI advertises on the wire (from 022).
//   - standard-hooks.json : the 30 HookEvent members from the SDK type source (sdk.d.ts:802).
// Read from disk adjacent to this file (load-bearing build data, not a _workbench scratch / test import).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type ToolKind = "model_invokable" | "host_bound";
export type StandardTool = { name: string; kind: ToolKind };

export type HookExpectation = "fired_known" | "conditional" | "unreachable_headless";
export type StandardHook = { name: string; expectation: HookExpectation };

type ToolsDoc = { provenance: string; count: number; tools: StandardTool[] };
type HooksDoc = { provenance: string; count: number; hooks: StandardHook[] };

function loadJson<T>(relName: string): T {
  const path = fileURLToPath(new URL(relName, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const TOOLS_DOC = loadJson<ToolsDoc>("./standard-tools.json");
const HOOKS_DOC = loadJson<HooksDoc>("./standard-hooks.json");

export function standardTools(): StandardTool[] {
  return TOOLS_DOC.tools;
}

export function standardHooks(): StandardHook[] {
  return HOOKS_DOC.hooks;
}

export function toolProvenance(): string {
  return TOOLS_DOC.provenance;
}

export function hookProvenance(): string {
  return HOOKS_DOC.provenance;
}
