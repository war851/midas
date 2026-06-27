// Step 1 (TDD): the OTel -> SQLite receiver. We POST a REAL captured OTLP/JSON payload
// (tests/fixtures/otlp-logs-tool_result.sample.json, captured off a bare `claude -p` in-container,
// CLI 2.1.160) to a started receiver and assert a channel="otel" row lands in SQLite with the right
// tool_name / tool_use_id / session.id. Verbatim-first: the full logRecord is kept in raw_json.
import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Spine } from "../src/spine/db.js";
import { startReceiver, parseOtlpLogs, type Receiver } from "../src/otel/receiver.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dir, "fixtures", "otlp-logs-tool_result.sample.json");

// Known ground-truth values from the captured fixture (the echo OTLP-SHAPE-NONCE-91 Bash call).
const EXPECT_SESSION = "777284ea-6ed0-4e4c-ab28-9b9982c4c4fa";
const EXPECT_TOOL_USE_ID = "toolu_01P8zyzUvSWtkXNmJpNgA4mP";

describe("otel receiver: real OTLP/JSON tool_result -> channel='otel' SQLite row", () => {
  const DB = process.env.OTEL_RECEIVER_DB ?? "/data/sqlite/otel-receiver-test.sqlite";
  let spine: Spine;
  let receiver: Receiver;

  beforeAll(async () => {
    spine = new Spine(DB);
    receiver = await startReceiver({ spine, port: 0, host: "127.0.0.1" }); // port 0 = ephemeral
    const body = readFileSync(FIXTURE, "utf8");
    const res = await fetch(`http://127.0.0.1:${(receiver.server.address() as { port: number }).port}/v1/logs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(res.status).toBe(200);
    // give the request 'end' handler a tick to finish the synchronous SQLite write
    await new Promise((r) => setTimeout(r, 50));
  });

  afterAll(async () => {
    await receiver?.close();
    spine?.close();
  });

  it("pure parser extracts the tool_result event from the real fixture", () => {
    const payload = JSON.parse(readFileSync(FIXTURE, "utf8"));
    const events = parseOtlpLogs(payload);
    const tr = events.find((e) => e.event_name === "tool_result");
    expect(tr).toBeDefined();
    expect(tr!.tool_name).toBe("Bash");
    expect(tr!.tool_use_id).toBe(EXPECT_TOOL_USE_ID);
    expect(tr!.session_id).toBe(EXPECT_SESSION);
    expect(tr!.attrs["success"]).toBe("true");
    expect(tr!.attrs["duration_ms"]).toBe("35");
  });

  it("the POSTed tool_result landed as a channel='otel' row, joinable by tool_use_id", () => {
    const rows = spine.eventsByToolUseId(EXPECT_TOOL_USE_ID);
    const otel = rows.filter((r) => r.channel === "otel" && r.event_name === "tool_result");
    expect(otel.length).toBeGreaterThanOrEqual(1);
    expect(otel[0].tool_name).toBe("Bash");
    expect(otel[0].session_id).toBe(EXPECT_SESSION);
    // run_id is the OTel session.id (per-agent attribution for free)
    expect(otel[0].run_id).toBe(EXPECT_SESSION);
    // verbatim-first: the full logRecord is preserved in raw_json
    const raw = JSON.parse(otel[0].raw_json);
    expect(JSON.stringify(raw)).toContain("OTLP-SHAPE-NONCE-91");
  });

  it("api_request sibling event from the same POST is also recorded on channel='otel'", () => {
    const apiRows = spine.eventsForRun(EXPECT_SESSION).filter((r) => r.channel === "otel" && r.event_name === "api_request");
    expect(apiRows.length).toBeGreaterThanOrEqual(1);
  });
});
