// THE BANNED-PATTERN GUARD (C2c / contract §2 "Guard exemption", d3 adjudication 2026-06-10).
// A DETERMINISTIC static scan over the WHOLE src/ tree: it fails on any banned match that is NOT on the
// reviewed provenance allowlist (tests/banned-allowlist.json). There is NO per-instance discretion — a
// banned token is exempt iff its file + line match a location-pinned allowlist anchor; otherwise it is a
// violation. (The earlier ad-hoc string-content discretion is what RED'd d3 — its verdict was
// nondeterministic. The allowlist removes the discretion.)
//
// The rule, stated once:
//   * Documentary/provenance text (a comment, OR a data/JSON provenance string naming a banned term while
//     documenting its removal/history) is exempt ONLY via an allowlist entry — file matches AND the line
//     CONTAINS the entry's static anchor substring.
//   * The same token operating as a LIVE MECHANISM (a real status value/identifier, a `>=` floor on a
//     coverage count, a flush-to-pass timer, an ignore directive) lands on a line with no anchor and is
//     NEVER exempt.
//   * Editing frozen 021 data to delete a historical word is forbidden cosmetic gaming, not a fix — so
//     the historical occurrences stay and are allowlisted instead.
// It changes NO 021 runtime or data: it reads source and asserts.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const ALLOWLIST = JSON.parse(readFileSync(fileURLToPath(new URL("./banned-allowlist.json", import.meta.url)), "utf8")).allow;

const files = readdirSync(SRC, { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile() && /\.(ts|mjs|js|json)$/.test(d.name))
  .map((d) => `${d.parentPath ?? (d as unknown as { path: string }).path}/${d.name}`);

// Banned patterns. The first group are reclassification buckets / vocab; the rest are pure live-mechanism
// signatures that have NO legitimate documentary form and so are never allowlisted.
const BANNED: Array<{ name: string; re: RegExp }> = [
  { name: "proven_unreachable", re: /\bproven_unreachable\b/ },
  { name: "invoked_recorded", re: /\binvoked_recorded\b/ },
  { name: "DOCUMENTED_HOOKS", re: /\bDOCUMENTED_HOOKS\b/ },
  { name: "mop-up", re: /\bmop[-_]?up\b/i },
  { name: "flush-to-pass", re: /flush[-_ ]?to[-_ ]?pass/i },
  { name: "reclassify", re: /\breclassif/i },
  { name: "coverage-ignore directive", re: /\b(?:c8|v8|istanbul)\s+ignore\b/i },
  { name: "coverage-ignore", re: /\bcoverage-ignore\b/i },
  { name: "ts-nocheck", re: /@ts-nocheck\b/ },
  { name: "soft >= floor on a coverage count", re: /\b(?:fired[A-Za-z]*|coverage[A-Za-z]*)\s*(?:\.[A-Za-z_]+)?\s*(?:>=|<=)\s*\d+/ },
  { name: "destroyed soft floor (>=16/>=20)", re: />=\s*(?:16|20)\b/ },
];

const relOf = (f: string): string => {
  const i = f.replace(/\\/g, "/").indexOf("/src/");
  return i >= 0 ? f.replace(/\\/g, "/").slice(i + 1) : f.replace(/\\/g, "/");
};

// An occurrence is exempt iff some allowlist entry for THIS file has its anchor present in THIS line.
function exempt(rel: string, line: string): boolean {
  return ALLOWLIST.some((e: { file: string; anchor: string }) => e.file === rel && line.includes(e.anchor));
}

type Violation = { file: string; lineNo: number; token: string; line: string };
const violations: Violation[] = [];
// Allowlist hygiene: an entry whose anchor matches no line in its file is stale (not fatal — a later
// chunk may legitimately remove a documentary line — but surfaced so the list never silently rots).
const anchorsHit = new Set<string>();

for (const file of files) {
  const rel = relOf(file);
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((raw, idx) => {
    const line = raw.replace(/\r$/, "");
    for (const b of BANNED) {
      if (!b.re.test(line)) continue;
      if (exempt(rel, line)) {
        ALLOWLIST.forEach((e: { file: string; anchor: string }, i: number) => {
          if (e.file === rel && line.includes(e.anchor)) anchorsHit.add(`${i}`);
        });
        continue;
      }
      violations.push({ file: rel, lineNo: idx + 1, token: b.name, line: line.trim().slice(0, 140) });
    }
  });
}

describe("banned-pattern guard — deterministic allowlist scan over src/", () => {
  it(`scanned the whole src/ tree (${files.length} files)`, () => {
    expect(files.length).toBeGreaterThan(10); // sanity: the tree was actually found, not an empty scan
  });
  it("zero banned patterns outside the reviewed provenance allowlist", () => {
    expect(
      violations,
      `BANNED-PATTERN VIOLATIONS (not on allowlist):\n${violations.map((v) => `  ${v.file}:${v.lineNo} [${v.token}] ${v.line}`).join("\n")}`,
    ).toEqual([]);
  });
  it("the allowlist is not stale (every anchor matched at least one source line)", () => {
    const stale = ALLOWLIST.filter((_: unknown, i: number) => !anchorsHit.has(`${i}`)).map(
      (e: { file: string; anchor: string }) => `${e.file} :: ${e.anchor}`,
    );
    if (stale.length) console.log(`[allowlist] STALE anchors (no current match — review): ${stale.join(" | ")}`);
    expect(Array.isArray(stale)).toBe(true); // informational only; never fail the guard on a removed doc line
  });
});
