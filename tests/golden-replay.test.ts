// Golden-replay parity (SC-2.1). The vendored, byte-identical receiver replays the two sealed-021
// OTLP wire fixtures and must reproduce the frozen normalized+scrubbed row set EXACTLY. This proves
// the built+running 025 system (container, node 22, better-sqlite3 12.10.0) produces identical
// capture, not just identical source. The golden is cross-anchored to 021's own ground truth (the
// values 021's tests/otel-receiver.test.ts hand-asserts against the same fixture), so the diff is
// tied to 021, not to 025's own runtime. Agent-free, trigger-free.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deriveNormalizedRows, type GoldenRow } from "./golden/derive.js";

const golden = JSON.parse(
  readFileSync(fileURLToPath(new URL("./golden/GOLDEN-EVENTS.json", import.meta.url)), "utf8"),
) as GoldenRow[];

describe("golden-replay parity — vendored receiver reproduces the sealed-021 normalized rows", () => {
  it("the normalized scrubbed event multiset equals the frozen golden (replay diff is empty)", () => {
    expect(deriveNormalizedRows()).toEqual(golden);
  });

  it("the golden carries the sealed-021 ground-truth anchor (ties the proof to 021, not 025)", () => {
    const tr = golden.find((r) => r.event_name === "tool_result");
    expect(tr).toBeDefined();
    expect(tr!.tool_name).toBe("Bash");
    expect(tr!.session_id).toBe("777284ea-6ed0-4e4c-ab28-9b9982c4c4fa");
    expect(tr!.tool_use_id).toBe("toolu_01P8zyzUvSWtkXNmJpNgA4mP");
    expect(tr!.raw_json).toContain("OTLP-SHAPE-NONCE-91");
  });

  it("the golden is PII-scrubbed (SC-2.5): no identity fields survive", () => {
    const blob = JSON.stringify(golden);
    expect(blob).toContain("<SCRUBBED>");
    for (const pii of [
      "scrubbed@example.invalid",
      "<SCRUBBED-ID>",
      "<SCRUBBED-ID>",
      "<SCRUBBED-ID>",
      "<SCRUBBED-ID>",
    ]) {
      expect(blob).not.toContain(pii);
    }
  });
});
