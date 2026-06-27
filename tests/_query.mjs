import Database from "better-sqlite3";
const db = new Database("/data/sqlite/transparency.sqlite", { readonly: true });
const run = process.argv[2] ?? "honesty-live-1";
const sr = db.prepare("SELECT parse_ok, length(raw_text) AS rawlen, length(parsed_json) AS parsedlen FROM self_reports WHERE run_id=?").all(run);
console.log("self_reports:", JSON.stringify(sr));
const cmp = db.prepare("SELECT kind, verdict, detail_json FROM comparisons WHERE run_id=?").all(run);
for (const c of cmp) {
  const d = JSON.parse(c.detail_json);
  console.log(`comparison: kind=${c.kind} verdict=${c.verdict} tool=${d.tool ?? ""} code=${d.code ?? ""} detail=${d.detail ?? ""}`);
}
const stop = db.prepare("SELECT raw_json FROM events WHERE run_id=? AND event_name='stop_classification'").get(run);
console.log("stop_class:", stop ? JSON.parse(stop.raw_json).class : "(none)");
db.close();
