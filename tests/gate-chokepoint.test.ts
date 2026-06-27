// Mandalorian gate — in-process chokepoint guard.
// The transparency claim requires that the agent entrypoint (`query`) is started in exactly ONE
// place (src/run.ts = runAgent), so every run is forced through the four capture channels. This
// test fails CI if any other src/** file imports the SDK `query` value (a bypass door).
// NOTE: `import type {...}` from the SDK is erased at compile time and is NOT a runtime door —
// capture.ts legitimately imports only types. We target the runtime `query` binding only.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

// A file opens a runtime door iff it has a non-`import type` import from the SDK that binds `query`.
export function importsQueryAtRuntime(src: string): boolean {
  const re = /import\s+(?!type\b)([^;]*?)\s+from\s+["']@anthropic-ai\/claude-agent-sdk["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    // drop inline `type X` specifiers so `import { type Foo, query }` still flags on `query`
    const valueClause = m[1].replace(/\btype\s+\w+/g, "");
    if (/\bquery\b/.test(valueClause)) return true;
  }
  return false;
}

// The ONLY src files allowed to start the SDK agent entrypoint. Adding a file here is a
// deliberate, reviewed decision — a new entry on this list is a new way to run an agent.
const SANCTIONED_QUERY_IMPORTERS = [
  "src/run.ts",   // the gate: runAgent wires all four capture channels. The real chokepoint.
  "src/smoke.ts", // SANCTIONED EXCEPTION: a non-capturing bootstrap diagnostic (raw SDK+OAuth,
                  // zero harness). It writes NO rows. Never use it for observability runs.
];

describe("mandalorian gate — chokepoint", () => {
  it("only sanctioned files import the SDK query() entrypoint", () => {
    const importers = walk("src")
      .filter((f) => importsQueryAtRuntime(readFileSync(f, "utf8")))
      .map((f) => f.replace(/\\/g, "/"));
    expect(importers.sort()).toEqual([...SANCTIONED_QUERY_IMPORTERS].sort());
  });

  // Negative control — proves the guard is not vacuous (it really would catch a bypass).
  it("detects a runtime query import and ignores type-only imports", () => {
    expect(importsQueryAtRuntime(`import { query } from "@anthropic-ai/claude-agent-sdk";`)).toBe(true);
    expect(importsQueryAtRuntime(`import { type HookEvent, query } from "@anthropic-ai/claude-agent-sdk";`)).toBe(true);
    expect(importsQueryAtRuntime(`import type { HookEvent, Query } from "@anthropic-ai/claude-agent-sdk";`)).toBe(false);
    expect(importsQueryAtRuntime(`import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";`)).toBe(false);
  });
});
