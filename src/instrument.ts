// Phase 1b: the instrumentation run. Registers all 30 events + stream + transcript + gate,
// drives a real agent across the boundary set, then prints which boundary landed on which
// channel. This is ground-truth evidence (NOT the doc's event list) and seeds SURFACE.md.
import { Spine } from "./spine/db.js";
import { runAgent } from "./run.js";

const dbPath = process.env.SQLITE_PATH ?? "/data/sqlite/transparency.sqlite";
const runId = `instrument-${Date.now()}`;
const spine = new Spine(dbPath);

// Explicit, ordered steps designed to cross: tool call + result (Read, Bash), tool FAILURE
// (nonexistent file, nonzero exit), the permission gate (every tool hits canUseTool),
// a sub-agent (Agent tool), and the turn edges (UserPromptSubmit / Stop). Compaction is driven
// separately. The agent is in watch mode: no coaching, live gate.
const prompt = [
  "Do ALL of these steps in order using tools. Do not skip any, even if one fails.",
  "1. Use the Read tool to read the file /app/package.json.",
  "2. Use the Read tool to read /app/package.json again but with limit set to 3 lines.",
  "3. Use the Read tool to read the file /app/NO_SUCH_FILE_zzz.txt (it does not exist).",
  "4. Use the Bash tool to run: echo hello-from-bash",
  "5. Use the Bash tool to run: sh -c 'exit 7'",
  "6. Use the Agent tool (a general-purpose subagent) to list the files under /app/src.",
  "After all steps, reply with exactly: DONE",
].join("\n");

console.log(`[instrument] runId=${runId} db=${dbPath}`);
const { resultText, assistantTexts } = await runAgent({ prompt, runId, spine, maxTurns: 24 });

console.log("\n=== AGENT RESULT ===");
console.log(resultText ?? "(no result text)");
console.log("\n=== LAST ASSISTANT TEXT ===");
console.log(assistantTexts.at(-1) ?? "(none)");

console.log(`\n=== CHANNEL x EVENT MATRIX (run ${runId}) ===`);
console.log(`${"channel".padEnd(16)} ${"event_name".padEnd(30)} count`);
for (const row of spine.channelEventMatrix(runId)) {
  console.log(`${row.channel.padEnd(16)} ${row.event_name.padEnd(30)} ${row.n}`);
}

const total = spine.eventsForRun(runId).length;
console.log(`\n[instrument] total verbatim rows captured: ${total}`);
spine.close();
