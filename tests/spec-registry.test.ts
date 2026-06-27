// U7 — spec-registry limit-coverage totality. Pure, deterministic, no live agent. Proves the truth-layer
// scorecard gap (review Q4: "only 4 tools") is now TOTAL and VISIBLE: every one of the 29 vendored
// denominator tools is classified exactly once in LIMIT_COVERAGE as checkable (a SPEC_REGISTRY predicate
// exists) or not (with a citation). A tool that silently fell through `checkSpec`'s `[]` is impossible to
// hide here, because totality is asserted against the denominator itself. Runs IN-CONTAINER (021_midas_app).
import { describe, it, expect } from "vitest";
import { standardTools } from "../src/coverage/denominator.js";
import { SPEC_REGISTRY, LIMIT_COVERAGE, knownLimitsFor, isLimitCheckable } from "../src/spine/spec-registry.js";

const TOOLS = standardTools().map((t) => t.name);
const CHECKABLE = ["Bash", "Glob", "Grep", "Read"]; // the only 4 with an output-truncation predicate

describe("U7 — LIMIT_COVERAGE is total over the denominator (no silent fallthrough)", () => {
  it("every denominator tool is classified exactly once", () => {
    for (const t of TOOLS) expect(LIMIT_COVERAGE[t], `missing LIMIT_COVERAGE entry for ${t}`).toBeDefined();
  });

  it("LIMIT_COVERAGE has no keys outside the denominator and covers all 29", () => {
    expect(Object.keys(LIMIT_COVERAGE).sort()).toEqual([...TOOLS].sort());
    expect(TOOLS.length).toBe(29);
  });
});

describe("U7 — the checkable set is exactly the SPEC_REGISTRY predicates", () => {
  it("checkable:true tools == SPEC_REGISTRY keys == the 4", () => {
    const checkable = Object.entries(LIMIT_COVERAGE).filter(([, v]) => v.checkable).map(([k]) => k).sort();
    expect(checkable).toEqual(CHECKABLE);
    expect(Object.keys(SPEC_REGISTRY).sort()).toEqual(CHECKABLE);
  });

  it("isLimitCheckable agrees with the map and with SPEC_REGISTRY", () => {
    for (const t of TOOLS) {
      expect(isLimitCheckable(t)).toBe(t in SPEC_REGISTRY);
      expect(isLimitCheckable(t)).toBe(LIMIT_COVERAGE[t].checkable);
    }
  });

  it("knownLimitsFor is non-empty IFF the tool is checkable", () => {
    for (const t of TOOLS) expect(knownLimitsFor(t).length > 0).toBe(LIMIT_COVERAGE[t].checkable);
  });
});

describe("U7 — the gap is defended, not hidden: every non-checkable tool carries a citation", () => {
  it("each checkable:false entry is cited and is NOT in SPEC_REGISTRY", () => {
    for (const [t, v] of Object.entries(LIMIT_COVERAGE)) {
      if (v.checkable) continue;
      expect(v.citation.length, `${t} needs a citation`).toBeGreaterThan(0);
      expect(v.note.length, `${t} needs a note`).toBeGreaterThan(0);
      expect(t in SPEC_REGISTRY).toBe(false);
    }
  });
});
