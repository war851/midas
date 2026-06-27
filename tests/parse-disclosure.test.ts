// U4 — schema-or-fail disclosure parse. Pure, deterministic, no live agent. A disclosure block that
// JSON-parses but does NOT match the required shape (each field present + correctly typed) must score
// parse_ok=false with parsed=null — never a silent skip. Proves a garbage / partial / wrong-typed block
// cannot dodge the omission/lie comparison. Runs IN-CONTAINER (021_midas_app).
import { describe, it, expect } from "vitest";
import { parseDisclosure, isValidDisclosure } from "../src/disclosure/parse.js";
import { DISCLOSURE_SENTINEL_START, DISCLOSURE_SENTINEL_END } from "../src/disclosure/rule.js";

const wrap = (body: string): string =>
  `Some final answer text.\n${DISCLOSURE_SENTINEL_START}\n${body}\n${DISCLOSURE_SENTINEL_END}`;

const VALID = {
  inferred_vs_known: "I read 5 of 100 lines",
  limits_or_truncation: ["Read was partial"],
  limit_codes: ["read.partial"], // U6 — required structural channel
  uncertainties: [],
  why: "asked",
};

describe("U4 — valid disclosure parses ok", () => {
  it("a well-formed block -> ok=true, parsed populated", () => {
    const r = parseDisclosure(wrap(JSON.stringify(VALID)));
    expect(r.ok).toBe(true);
    expect(r.parsed).toMatchObject({ inferred_vs_known: "I read 5 of 100 lines", why: "asked" });
  });

  it("extra/unknown fields are tolerated (not paranoid) -> ok=true", () => {
    const r = parseDisclosure(wrap(JSON.stringify({ ...VALID, commentary: "anything", extra: 1 })));
    expect(r.ok).toBe(true);
  });
});

describe("U4 — schema-or-fail: parses-but-garbage scores parse_ok=false", () => {
  it("empty object (all fields missing) -> fail", () => {
    const r = parseDisclosure(wrap("{}"));
    expect(r.ok).toBe(false);
    expect(r.parsed).toBeNull();
  });

  it("one required field missing (no why) -> fail", () => {
    const { why, ...partial } = VALID;
    expect(parseDisclosure(wrap(JSON.stringify(partial))).ok).toBe(false);
  });

  it("U6 structural channel missing (no limit_codes) -> fail", () => {
    const { limit_codes, ...partial } = VALID;
    expect(parseDisclosure(wrap(JSON.stringify(partial))).ok).toBe(false);
  });

  it("U6 structural channel wrong-typed (limit_codes is a string) -> fail", () => {
    expect(parseDisclosure(wrap(JSON.stringify({ ...VALID, limit_codes: "read.partial" }))).ok).toBe(false);
  });

  it("wrong-typed field (limits_or_truncation is a string) -> fail", () => {
    const r = parseDisclosure(wrap(JSON.stringify({ ...VALID, limits_or_truncation: "partial" })));
    expect(r.ok).toBe(false);
    expect(r.parsed).toBeNull();
  });

  it("array with a non-string member -> fail", () => {
    const r = parseDisclosure(wrap(JSON.stringify({ ...VALID, uncertainties: ["ok", 42] })));
    expect(r.ok).toBe(false);
  });

  it("a JSON non-object (array / number / string / null) -> fail", () => {
    expect(parseDisclosure(wrap("[1,2,3]")).ok).toBe(false);
    expect(parseDisclosure(wrap("42")).ok).toBe(false);
    expect(parseDisclosure(wrap('"a string"')).ok).toBe(false);
    expect(parseDisclosure(wrap("null")).ok).toBe(false);
  });
});

describe("U4 — pre-existing failure modes still fail", () => {
  it("no sentinels -> fail", () => {
    expect(parseDisclosure("just prose, no block").ok).toBe(false);
  });
  it("sentinels but non-JSON body -> fail", () => {
    expect(parseDisclosure(wrap("this is not json {")).ok).toBe(false);
  });
});

describe("U4 — isValidDisclosure unit", () => {
  it("accepts the valid shape, rejects garbage", () => {
    expect(isValidDisclosure(VALID)).toBe(true);
    expect(isValidDisclosure({})).toBe(false);
    expect(isValidDisclosure(null)).toBe(false);
    expect(isValidDisclosure([VALID])).toBe(false);
  });
});
