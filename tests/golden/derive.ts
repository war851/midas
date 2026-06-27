// Golden-replay deriver (025 parity-proof harness, NOT a vendored file).
// Replays the two sealed-021 OTLP wire fixtures through the byte-identical vendored receiver
// (parseOtlpLogs + recordOtelEvents) into an in-memory Spine, then returns the normalized,
// PII-scrubbed `events` rows. Normalization drops the non-deterministic `id` + `captured_at`
// and sorts, so the result is a stable multiset. The same function backs the generator (which
// freezes GOLDEN-EVENTS.json) and golden-replay.test.ts (which diffs against it).
//
// Not named *.test.ts so vitest does not auto-run it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Spine } from "../../src/spine/db.js";
import { parseOtlpLogs, recordOtelEvents } from "../../src/otel/receiver.js";

// The exact PII the fixtures + otel rows carry (manifest §8 scrub list). session.id / prompt.id /
// tool_use_id are join keys, NOT PII, and are kept (the session.id is also the 021 ground-truth anchor).
const PII: string[] = [
  "scrubbed@example.invalid",
  "<SCRUBBED-ID>",
  "<SCRUBBED-ID>",
  "<SCRUBBED-ID>",
  "<SCRUBBED-ID>",
];

function scrub(s: string): string {
  let out = s;
  for (const p of PII) out = out.split(p).join("<SCRUBBED>");
  return out;
}

export type GoldenRow = {
  channel: string;
  event_name: string;
  tool_name: string | null;
  tool_use_id: string | null;
  session_id: string | null;
  run_id: string;
  raw_json: string;
};

export function deriveNormalizedRows(): GoldenRow[] {
  const fixtures = [
    "../fixtures/otlp-logs-user_prompt.sample.json",
    "../fixtures/otlp-logs-tool_result.sample.json",
  ];
  const spine = new Spine(":memory:");
  for (const f of fixtures) {
    const payload = JSON.parse(readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"));
    recordOtelEvents(spine, parseOtlpLogs(payload), "otel-unknown");
  }
  const rows: GoldenRow[] = spine.eventsOnChannel("otel").map((r) => ({
    channel: r.channel,
    event_name: r.event_name,
    tool_name: r.tool_name,
    tool_use_id: r.tool_use_id,
    session_id: r.session_id,
    run_id: r.run_id,
    raw_json: scrub(r.raw_json),
  }));
  rows.sort((a, b) =>
    (a.channel + a.event_name + (a.tool_use_id ?? "") + a.raw_json).localeCompare(
      b.channel + b.event_name + (b.tool_use_id ?? "") + b.raw_json,
    ),
  );
  spine.close();
  return rows;
}
