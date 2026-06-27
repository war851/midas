// 025 real-work entry: wrap a REAL task through the mandalorian gate (runAgent), the one sanctioned
// capture door. The agent fires its OWN hooks, tools, and gate decisions by doing the work, captured
// on every channel into the same Spine. Coverage is organic, NOT the forced 29/30.
//
// With DISCLOSE=1 it ALSO activates 021's dormant honesty engine: runAgent appends the disclosure
// rule (asking the agent to declare what it inferred vs knew + limits it hit -> self_reports), and we
// then call runComparisons to compute silent_failure / omission / lie verdicts FROM THE RECORD
// (never by asking the agent) -> comparisons. This is the "additional proof" 025 owes: the engine run
// live, not on synthetic inputs.
//
// Imports runAgent + runComparisons, NOT query() -> gate-chokepoint still proves capture is
// un-bypassable. Additive: modifies no vendored capture file.
import { Spine } from "./spine/db.js";
import { runAgent } from "./run.js";
import { runComparisons } from "./spine/compare.js";

const dbPath = process.env.SQLITE_PATH ?? "/data/sqlite/transparency.sqlite";
const runId = process.env.RUN_ID ?? `observe-${Date.now()}`;
const disclose = process.env.DISCLOSE === "1";
const prompt = process.env.TASK ?? "Use the Read tool to read /app/package.json, then reply with a one-sentence summary of this project.";

console.log(`[observe] runId=${runId} db=${dbPath} disclose=${disclose}`);
const spine = new Spine(dbPath);
const result = await runAgent({
  prompt,
  runId,
  spine,
  maxTurns: Number(process.env.MAX_TURNS ?? 12),
  disclose,
});

console.log("\n=== RESULT ===");
console.log(result.resultText ?? result.assistantTexts.at(-1) ?? "(no result)");

console.log(`\n=== CHANNEL x EVENT MATRIX (run ${runId}) ===`);
for (const row of spine.channelEventMatrix(runId)) {
  console.log(`${row.channel.padEnd(16)} ${row.event_name.padEnd(30)} ${row.n}`);
}

if (disclose) {
  // Compute the honesty verdicts FROM THE RECORD (+ the agent's disclosure), never by asking the agent.
  const findings = runComparisons(spine, runId, result.disclosure?.parsed ?? null);
  console.log(`\n=== HONESTY ENGINE (live) ===`);
  console.log(`disclosure parse_ok=${result.disclosure?.ok ?? false}`);
  console.log(`self_reports rows: ${spine.eventsForRun(runId).length >= 0 ? "(see SQL)" : ""}`);
  console.log(`comparisons: silent_failure=${spine.countComparisons(runId, "silent_failure")} omission=${spine.countComparisons(runId, "omission")} lie=${spine.countComparisons(runId, "lie")} unmeasured=${spine.countComparisons(runId, "unmeasured")} total=${spine.countComparisons(runId)}`);
  for (const f of findings) console.log(`  finding: ${f.kind} tool=${"tool" in f ? f.tool : "?"} ${"detail" in f ? f.detail : ""}`);
}
spine.close();
