#!/usr/bin/env node
// THE PINNED BLIND JUDGE RUNNER for the 025 capture-parity proof. Adapted from 021's
// _workbench/scripts/run-judge.mjs. It is the live enforcer: it sees ONLY the immutable contract
// (docs/parity-contract.md) + the artifact (the parity evidence), and returns a BINARY, fail-closed
// verdict. On VIOLATES it exits non-zero so the caller HALTS and surfaces (never self-retries).
//
// It is NOT build code (never imported by src/). It calls the judge model over the Max-OAuth `claude`
// CLI. Invocation:
//   node judge/run-parity-judge.mjs evidence/parity-contract.md <artifact.txt> "025 capture parity"
//   # exit 0 = COMPLIES, exit 1 = VIOLATES, exit 2 = gate-integrity failure
//
// PINNING: MODEL is the explicit Opus id (lowest-noise judge, NOT the CLI default). TEMPERATURE is not
// settable on the Max-OAuth CLI, so determinism is enforced by a DOUBLE-RUN AGREEMENT GATE (two
// judgments must return the identical binary verdict, else fail-closed to VIOLATES). The contract is
// SHA-256-pinned: the runner refuses to grade a mutated contract ("an agent that can edit its own gate
// has no gate").
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const MODEL = "claude-opus-4-8";
const PINNED_CONTRACT_SHA256 = "f7b69a5730f1bc0aed55157a665ae3570f0b81b77794d03446bdc5539fe10af3";
const VERDICTS = new Set(["COMPLIES", "VIOLATES"]);

function gateFail(msg) {
  console.log(`JUDGE VIOLATES :: gate-integrity :: ${msg}`);
  process.exit(2);
}

const [, , contractPath, artifactPath, decisionLabel = "(unnamed decision)"] = process.argv;
if (!contractPath || !artifactPath) gateFail("usage: run-parity-judge.mjs <contract-path> <artifact-path> [label]");

const contract = readFileSync(contractPath, "utf8");
const cSha = createHash("sha256").update(contract).digest("hex");
if (cSha !== PINNED_CONTRACT_SHA256)
  gateFail(`contract sha256=${cSha} != pinned ${PINNED_CONTRACT_SHA256} — refusing to judge against a mutated contract`);
const artifact = readFileSync(artifactPath, "utf8");

const SYS = [
  "You are an EXTERNAL BLIND JUDGE. You see ONLY the immutable contract below and the artifact in the",
  "user message. You do NOT see, infer, or credit any reasoning, author, or intent beyond these texts.",
  "Grade ONLY whether the artifact COMPLIES with the contract's success criteria (§3), with no §2",
  "prohibition present. Every PASS in the artifact must be backed by a concrete artifact fact (a hash",
  "equality, a test count, a diff result, a cited reason); a bare assertion is a VIOLATES.",
  "",
  "Your output MUST END with EXACTLY ONE JSON object as its final element and nothing after it:",
  '{"verdict":"COMPLIES"|"VIOLATES","clause":"<the SC or prohibition that decides it>","rationale":"<one sentence>"}.',
  "Do not wrap it in code fences.",
  "",
  "FAIL-CLOSED: if the artifact is unparseable, ambiguous, incomplete, unsupported, or you are in any way",
  "uncertain, return VIOLATES. A near-miss is a VIOLATES. Do not round a failed criterion up or excuse an",
  "un-run one. Do NOT penalise the §4 scope boundary (organic coverage, breadth-only, version-bump) — their",
  "absence is correct.",
  "",
  "===== IMMUTABLE CONTRACT =====",
  contract,
].join("\n");

function extractVerdictObject(text) {
  const s = String(text);
  const objects = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "{") continue;
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < s.length; j++) {
      const ch = s[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) { objects.push(s.slice(i, j + 1)); break; } }
    }
  }
  for (let k = objects.length - 1; k >= 0; k--) {
    try { const o = JSON.parse(objects[k]); if (o && VERDICTS.has(o.verdict)) return o; } catch { /* keep scanning */ }
  }
  return null;
}

function judgeOnce() {
  let out;
  try {
    out = execFileSync("claude", ["-p", "--model", MODEL, "--output-format", "json", "--system-prompt", SYS, artifact], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    return { ok: false, reason: `claude invocation failed: ${e.message}` };
  }
  let env;
  try { env = JSON.parse(out); } catch { return { ok: false, reason: "CLI envelope was not JSON" }; }
  if (env.is_error || env.subtype !== "success") {
    return { ok: false, reason: `incomplete judgment: subtype=${env.subtype} is_error=${env.is_error}` };
  }
  const v = extractVerdictObject(env.result);
  if (!v) return { ok: false, reason: `no final {COMPLIES|VIOLATES} verdict object: ${String(env.result).slice(0, 200)}` };
  if (!VERDICTS.has(v?.verdict)) return { ok: false, reason: `verdict not in {COMPLIES,VIOLATES}: ${JSON.stringify(v?.verdict)}` };
  return { ok: true, verdict: v.verdict, clause: String(v.clause ?? ""), rationale: String(v.rationale ?? "") };
}

function emit(verdict, detail) {
  console.log(`JUDGE ${verdict} :: ${decisionLabel} :: ${detail}`);
  process.exit(verdict === "COMPLIES" ? 0 : 1);
}

const r1 = judgeOnce();
if (!r1.ok) emit("VIOLATES", `fail-closed (run 1): ${r1.reason}`);
const r2 = judgeOnce();
if (!r2.ok) emit("VIOLATES", `fail-closed (run 2): ${r2.reason}`);
if (r1.verdict !== r2.verdict) emit("VIOLATES", `fail-closed: nondeterministic verdict (run1=${r1.verdict} run2=${r2.verdict})`);
emit(r1.verdict, `clause="${r1.clause}" | run1: ${r1.rationale} | run2: ${r2.rationale}`);
