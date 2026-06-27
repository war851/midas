// ⚠️ SANCTIONED GATE EXCEPTION — the ONE file allowed to bypass the mandalorian gate. ⚠️
// This is a NON-CAPTURING bootstrap diagnostic: it calls query() raw, with zero capture
// channels, to prove the raw SDK + Max OAuth works with no harness interference (use it to
// answer "is it the SDK or my harness?"). It writes NOTHING to SQLite. NEVER use it for an
// observability run — those MUST go through runAgent (src/run.ts). This bypass is allow-listed
// by name in tests/gate-chokepoint.test.ts; any OTHER raw-query() file fails that guard.
//
// Phase 0e gate: prove a trivial query() runs INSIDE the container against the manual
// Max OAuth login. No tools, one turn. Prints the result subtype + text.
import { query } from "@anthropic-ai/claude-agent-sdk";

const q = query({
  prompt: "Reply with exactly this and nothing else: SMOKE_OK",
  options: {
    maxTurns: 1,
    permissionMode: "default",
  },
});

let sawResult = false;
for await (const message of q) {
  if (message.type === "system" && message.subtype === "init") {
    console.log("INIT:", JSON.stringify({ model: message.model, apiKeySource: message.apiKeySource }));
  }
  if (message.type === "result") {
    sawResult = true;
    console.log("RESULT:", JSON.stringify({
      subtype: message.subtype,
      is_error: message.is_error,
      result: "result" in message ? message.result : undefined,
    }));
  }
}

if (!sawResult) {
  console.error("NO RESULT MESSAGE — query did not complete");
  process.exit(1);
}
