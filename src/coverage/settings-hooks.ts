// The settings.json command-hook channel — the second hook capture mechanism. The research A/B
// (Isearch + Xsearch) + an in-container proof established that ~10 HookEvents (PostCompact,
// InstructionsLoaded, SessionStart/End, StopFailure, CwdChanged, FileChanged, Elicitation/Result,
// ConfigChange) are NOT invoked as in-process options.hooks callbacks; they fire ONLY as project
// settings.json command hooks, which default query() runs when settingSources loads the project.
//
// This module: (1) builds a .claude/settings.json registering EVERY hook event to the sink
// (hook-sink.mjs), (2) ingests the sink's JSONL log into the Spine on channel "settings_hook".
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Spine } from "../spine/db.js";
import { standardHooks } from "./denominator.js";

const SINK = fileURLToPath(new URL("./hook-sink.mjs", import.meta.url));

// Write a project dir with a CLAUDE.md (so InstructionsLoaded has something to load) and a
// .claude/settings.json registering all 30 events to the sink. Returns the project path.
export function writeHookProject(dir: string, hookLog: string): string {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(`${dir}/.claude`, { recursive: true });
  writeFileSync(`${dir}/CLAUDE.md`, "# cov hook project\n\nProject memory loaded so InstructionsLoaded fires.\n");

  const hooks: Record<string, unknown> = {};
  for (const h of standardHooks()) {
    // Each event runs the sink; the event name is also passed as argv[2] as a fallback. The sink
    // reads COV_HOOK_LOG / COV_RUN_ID from the inherited env.
    hooks[h.name] = [{ hooks: [{ type: "command", command: `node ${SINK} ${h.name}` }] }];
  }
  writeFileSync(`${dir}/.claude/settings.json`, JSON.stringify({ hooks }, null, 2));
  // start the log fresh
  writeFileSync(hookLog, "");
  return dir;
}

// Read the sink's JSONL log and record each line into the Spine on channel "settings_hook".
export function ingestSettingsHooks(spine: Spine, hookLog: string): number {
  if (!existsSync(hookLog)) return 0;
  const text = readFileSync(hookLog, "utf8");
  let n = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let o: Record<string, unknown> = {};
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    spine.record({
      run_id: typeof o.run_id === "string" ? o.run_id : "settings-hook",
      channel: "settings_hook",
      event_name: typeof o.event_name === "string" ? o.event_name : "unknown",
      tool_name: (o.tool_name as string) ?? null,
      tool_use_id: (o.tool_use_id as string) ?? null,
      session_id: (o.session_id as string) ?? null,
      agent_id: null,
      raw_json: typeof o.raw_json === "string" ? o.raw_json : line,
    });
    n++;
  }
  return n;
}
