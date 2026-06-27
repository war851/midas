// The settings.json command-hook SINK — the second hook capture channel. Claude Code runs this as a
// shell command for events registered in a project .claude/settings.json (proven to fire on the
// headless query() path when settingSources loads the project). The CLI passes the hook payload as
// JSON on stdin; we append one verbatim line to $COV_HOOK_LOG. A post-run ingest (settings-hooks.ts)
// reads the log into the Spine on channel "settings_hook" — avoiding multi-process SQLite contention.
//
// Plain .mjs so the hook subprocess runs with bare `node` (no tsx needed). Never throws to the CLI:
// always exits 0 so a sink hiccup can never block or alter the agent.
import { appendFileSync, readFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const LOG = process.env.COV_HOOK_LOG;
const RUN = process.env.COV_RUN_ID ?? "settings-hook";

let raw = "";
try {
  raw = readFileSync(0, "utf8"); // fd 0 = stdin (the hook payload JSON)
} catch {
  /* no stdin — still record the bare event name from argv */
}

let parsed = {};
try {
  parsed = raw ? JSON.parse(raw) : {};
} catch {
  /* keep raw even if unparseable */
}

const event_name = parsed.hook_event_name ?? process.argv[2] ?? "unknown";
const line = JSON.stringify({
  run_id: RUN,
  event_name,
  tool_name: typeof parsed.tool_name === "string" ? parsed.tool_name : null,
  tool_use_id: typeof parsed.tool_use_id === "string" ? parsed.tool_use_id : null,
  session_id: typeof parsed.session_id === "string" ? parsed.session_id : null,
  raw_json: raw || JSON.stringify(parsed),
});

try {
  if (LOG) appendFileSync(LOG, line + "\n");
} catch {
  /* never block the agent on a sink failure */
}

// WorktreeCreate delegation (M4 seal — legitimate HARNESS implementation, authored by us).
// When a WorktreeCreate command-hook is registered, the SDK's EnterWorktree DELEGATES worktree
// creation to this hook: the hook must create the worktree and echo its path to stdout, or creation
// fails ("hook succeeded but returned no worktree path"). The original sink only logged, so creation
// could never succeed — which is the defect the 2026-06-11 rogue agent exploited by editing this file
// at runtime. We now implement the delegation properly IN THE HARNESS, in the committed, :ro-protected
// tree: the harness (never the agent) creates the worktree deterministically. With the source mounted
// read-only the agent cannot touch this code, and no longer needs to. The worktree is created inside
// the throwaway scratch project (/tmp), never the substrate.
if (event_name === "WorktreeCreate") {
  try {
    const repoRoot =
      (typeof parsed.worktree_root === "string" && parsed.worktree_root) ||
      (typeof parsed.cwd === "string" && parsed.cwd) ||
      process.cwd();
    const name =
      (typeof parsed.worktree_name === "string" && parsed.worktree_name) ||
      `cov-wt-${process.pid}-${Date.now()}`;
    const worktreesDir = join(repoRoot, ".claude", "worktrees");
    const worktreePath = join(worktreesDir, name);
    mkdirSync(worktreesDir, { recursive: true });
    // Clear any stale worktree metadata so a reused scratch repo cannot collide.
    try {
      execSync(`git -C ${JSON.stringify(repoRoot)} worktree prune`, { stdio: ["ignore", "ignore", "ignore"] });
    } catch {
      /* prune is best-effort */
    }
    execSync(
      `git -C ${JSON.stringify(repoRoot)} worktree add ${JSON.stringify(worktreePath)} -b ${JSON.stringify("cov/" + name)}`,
      { stdio: ["ignore", "ignore", "ignore"] },
    );
    process.stdout.write(worktreePath + "\n");
  } catch (err) {
    // Per the SDK contract a failed creation MUST exit non-zero so EnterWorktree surfaces the error.
    process.stderr.write("[hook-sink WorktreeCreate] " + String(err) + "\n");
    process.exit(1);
  }
}

process.exit(0);
