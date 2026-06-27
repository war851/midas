// U10 — SINGLE-WRITER SPINE (M3). One owner of the SQLite handle: a second WRITABLE open of a path
// that an active Spine already owns throws, so the multi-writer contention the settings-hook log-file
// detour worked around cannot reappear. Readers open readonly and never contend (they feed off the
// one owner / the queue). close() releases ownership so a later run can re-acquire the path.
//
// This is the minimal structural guarantee — NOT a queue/socket rebuild (the live capture path already
// funnels every write through one in-process Spine; this makes that invariant enforced + testable).
// Dump-survives-crash on the evidence.
import { describe, it, afterAll, expect } from "vitest";
import { Spine } from "../src/spine/db.js";

const tmp = (tag: string): string => `/tmp/sw-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.sqlite`;
const log: string[] = [];
afterAll(() => console.log("\n===== U10 SINGLE-WRITER EVIDENCE =====\n" + log.join("\n") + "\n"));

describe("U10 single-writer — one owner of the SQLite handle per path", () => {
  it("a SECOND writable open of an owned path throws (single-writer enforced)", () => {
    const p = tmp("owned");
    const a = new Spine(p);
    let threw = false;
    try {
      const b = new Spine(p); // second writable owner of the same path — must be refused
      b.close();
    } catch (e) {
      threw = true;
      log.push(`[2nd-writable] threw: ${(e as Error).message}`);
    }
    a.close();
    expect(threw).toBe(true);
  });

  it("a readonly open of an owned path is ALLOWED and can read the owner's committed rows", () => {
    const p = tmp("ro");
    const owner = new Spine(p);
    owner.record({ run_id: "r1", channel: "run_meta", event_name: "run_start", tool_name: null, tool_use_id: null, session_id: null, agent_id: null, raw_json: "{}" });
    const reader = new Spine(p, { readonly: true }); // must NOT throw — readers do not contend
    const rows = reader.eventsForRun("r1");
    log.push(`[readonly] reader saw ${rows.length} row(s) for r1 while owner held the handle`);
    expect(rows.length).toBe(1);
    reader.close();
    owner.close();
  });

  it("close() releases ownership: the path can be re-opened writable afterward", () => {
    const p = tmp("recycle");
    const first = new Spine(p);
    first.close(); // releases ownership
    let reacquired = false;
    const second = new Spine(p); // must succeed now that the first released
    reacquired = true;
    second.close();
    log.push(`[recycle] re-acquired after close = ${reacquired}`);
    expect(reacquired).toBe(true);
  });

  it("distinct paths each have their own owner (no false collision)", () => {
    const a = new Spine(tmp("a"));
    const b = new Spine(tmp("b")); // different path — must not collide
    log.push(`[distinct] two distinct paths opened writable concurrently: ok`);
    a.close();
    b.close();
    expect(true).toBe(true);
  });
});
