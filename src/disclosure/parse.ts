// The parser half of pillar 2. Extracts the disclosure block from the agent's final text and
// writes it VERBATIM (raw + parsed) to self_reports. A missing/malformed block is recorded with
// parse_ok=false — the absence of disclosure is itself evidence (feeds the omission comparison).
import { Spine } from "../spine/db.js";
import { DISCLOSURE_SENTINEL_START, DISCLOSURE_SENTINEL_END } from "./rule.js";

export type Disclosure = {
  inferred_vs_known?: string;
  limits_or_truncation?: string[];
  // U6 — the STRUCTURAL channel: the exact typed limit codes (e.g. "read.partial") the agent echoes for
  // limits it observed. The truth layer matches THIS against the spec-registry codes, not the prose above.
  limit_codes?: string[];
  uncertainties?: string[];
  why?: string;
};

export type ParseResult = {
  ok: boolean;
  raw: string; // the raw block (or the whole text if no block found)
  parsed: Disclosure | null;
};

// U4 — SCHEMA-OR-FAIL. parse_ok means the block parsed AND matched the required disclosure shape. A block
// that JSON-parses but is garbage / partial / wrong-typed is a FAIL (parse_ok=false, parsed=null), never a
// silent skip: a malformed disclosure must not let the agent dodge the omission/lie comparison (a null
// disclosure is treated downstream as "nothing disclosed," the un-gameable default — absence is evidence).
// Required fields (the exact rule.ts shape): inferred_vs_known:string, limits_or_truncation:string[],
// limit_codes:string[] (U6 structural channel), uncertainties:string[], why:string. Extra fields are
// tolerated (the agent may add commentary); missing or wrong-typed required fields are not.
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

export function isValidDisclosure(x: unknown): x is Disclosure {
  if (x == null || typeof x !== "object" || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.inferred_vs_known === "string" &&
    isStringArray(o.limits_or_truncation) &&
    isStringArray(o.limit_codes) && // U6 — the structural code channel is a required field of the shape
    isStringArray(o.uncertainties) &&
    typeof o.why === "string"
  );
}

export function parseDisclosure(finalText: string): ParseResult {
  const start = finalText.lastIndexOf(DISCLOSURE_SENTINEL_START);
  const end = finalText.lastIndexOf(DISCLOSURE_SENTINEL_END);
  if (start === -1 || end === -1 || end < start) {
    return { ok: false, raw: finalText, parsed: null };
  }
  const body = finalText.slice(start + DISCLOSURE_SENTINEL_START.length, end).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, raw: body, parsed: null }; // unparseable -> fail
  }
  if (!isValidDisclosure(parsed)) {
    return { ok: false, raw: body, parsed: null }; // parsed but garbage / partial / wrong-typed -> fail
  }
  return { ok: true, raw: body, parsed };
}

// Parse the agent's final assistant text and persist the result. Returns the parse for the caller.
export function captureDisclosure(spine: Spine, runId: string, finalText: string): ParseResult {
  const result = parseDisclosure(finalText);
  spine.recordSelfReport(runId, result.raw, result.parsed, result.ok);
  return result;
}
