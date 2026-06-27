#!/usr/bin/env node
// Preflight for the 025 capture container. Host-side and cross-platform: it needs only `node` and
// `docker` (both identical on Windows, macOS, Linux), and shells into the Linux container for every
// check, so there is no shell- or path-specific behaviour. It lives in scripts/ and touches NOTHING in
// the parity-sealed surface (no src/, no tests/, no config). It reports readiness; it does not mutate.
//
// Usage (same on every OS):   node scripts/system-check.mjs
//   MIDAS_CONTAINER overrides the container name (default 025_midas_public_v2_app).
import { execFileSync } from "node:child_process";

const C = process.env.MIDAS_CONTAINER ?? "025_midas_public_v2_app";
const dexec = (args) => execFileSync("docker", ["exec", C, ...args], { encoding: "utf8" });
const checks = [];
const add = (name, fn) => {
  try { checks.push({ name, ok: true, detail: String(fn() ?? "ok").trim() }); }
  catch (e) { checks.push({ name, ok: false, detail: (e.message || "").split("\n")[0] }); }
};

add("container running", () => {
  const s = execFileSync("docker", ["ps", "--filter", `name=${C}`, "--format", "{{.Status}}"], { encoding: "utf8" }).trim();
  if (!s) throw new Error("not running -> docker compose up -d");
  return s;
});

add("otel receiver :3211", () => {
  try {
    dexec(["node", "-e", "require('net').connect(3211,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"]);
    return "listening";
  } catch {
    throw new Error("DOWN -> docker exec -d " + C + " npx tsx src/otel/serve.ts");
  }
});

add("claude login", () => {
  dexec(["test", "-f", "/data/claude-config/.credentials.json"]);
  return "credentials present";
});

add("scratch writable /tmp", () => {
  dexec(["sh", "-c", "touch /tmp/.midas-check && rm /tmp/.midas-check"]);
  return "writable";
});

add("spine db", () =>
  dexec(["node", "-e", "const c=require('better-sqlite3')(process.env.SQLITE_PATH||'/data/sqlite/transparency.sqlite',{readonly:true});console.log(c.prepare('SELECT COUNT(*) n FROM events').get().n+' events')"]));

let allOk = true;
for (const c of checks) {
  console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name.padEnd(22)} ${c.detail}`);
  if (!c.ok) allOk = false;
}
console.log(allOk ? "\nREADY: the container is set up for a real run." : "\nNOT READY: fix the FAIL line(s) above, then re-run.");
process.exit(allOk ? 0 : 1);
