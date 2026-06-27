// Standalone receiver daemon. Start it once in the container (docker exec -d) and it becomes the
// always-on breadth spine: because /etc/claude-code/managed-settings.json points EVERY claude
// process at 127.0.0.1:3211, any driver that runs while this daemon is up — a human's ad-hoc
// `claude -p`, a wrapped query(), a skill, a sub-agent — has its OTel written verbatim to the Spine.
//
// Usage (in-container):  tsx src/otel/serve.ts
//   SQLITE_PATH   defaults to the compose-provided /data/sqlite/transparency.sqlite
//   OTEL_RECEIVER_PORT defaults to 3211 (must match infra/managed-settings.json)
import { Spine } from "../spine/db.js";
import { startReceiver } from "./receiver.js";

const dbPath = process.env.SQLITE_PATH ?? "/data/sqlite/transparency.sqlite";
const port = Number(process.env.OTEL_RECEIVER_PORT ?? 3211);

const spine = new Spine(dbPath);
startReceiver({
  spine,
  port,
  host: "127.0.0.1",
  onEvent: (e) => {
    if (e.signal === "logs" && e.tool_name) {
      // a terse heartbeat so the daemon log shows live capture without dumping bodies
      console.log(`[otel] ${e.event_name} ${e.tool_name} tool_use_id=${e.tool_use_id} session=${e.session_id}`);
    }
  },
})
  .then((r) => console.log(`[otel-serve] receiver listening on 127.0.0.1:${r.port}, spine=${dbPath}`))
  .catch((err) => {
    console.error("[otel-serve] failed to start:", err);
    process.exit(1);
  });
