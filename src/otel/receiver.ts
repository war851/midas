// The OTel -> SQLite bridge: the breadth spine. A tiny HTTP server that accepts the CLI's
// OTLP/JSON export and writes every claude_code.* event VERBATIM to the Spine on channel "otel".
// This is the corridor every cooperative driver crosses: the bundled `claude` binary emits OTel
// per-process, so a bare `claude -p`, a wrapped query(), a skill run, and a sub-agent are ALL
// captured here regardless of whether we wrapped them with in-process hooks.
//
// Grounded against a REAL capture (tests/fixtures/otlp-logs-*.sample.json, CLI 2.1.160): OTLP/JSON
// logs are { resourceLogs: [{ resource:{attributes[]}, scopeLogs:[{ scope, logRecords:[...] }] }] };
// each logRecord has body.stringValue = "claude_code.<event>" and an attributes[] array of
// { key, value: { stringValue | intValue | boolValue | doubleValue | ... } }.
import http from "node:http";
import type { Spine } from "../spine/db.js";

export type OtelSignal = "logs" | "traces" | "metrics";

export type OtelEvent = {
  signal: OtelSignal;
  event_name: string; // normalized: the "event.name" attr, else body sans "claude_code." prefix
  body: string | null; // body.stringValue, e.g. "claude_code.tool_result"
  tool_name: string | null;
  tool_use_id: string | null;
  session_id: string | null;
  prompt_id: string | null;
  attrs: Record<string, string>; // every attribute, value-coerced to string
  raw: unknown; // the full logRecord / span / metric object, verbatim
};

// OTLP attribute values are a typed union. Coerce any to a string for the flat attrs map; the
// untouched original still lives in raw_json, so nothing is lost.
function attrToString(v: unknown): string | null {
  if (v == null || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.stringValue === "string") return o.stringValue;
  if (o.intValue != null) return String(o.intValue);
  if (o.boolValue != null) return String(o.boolValue);
  if (o.doubleValue != null) return String(o.doubleValue);
  if (o.bytesValue != null) return String(o.bytesValue);
  if (o.arrayValue != null || o.kvlistValue != null) return JSON.stringify(o);
  return null;
}

// Flatten an OTLP attributes[] array ({key,value}) into a plain { key: stringValue } map.
function flattenAttrs(attributes: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(attributes)) return out;
  for (const a of attributes as Array<Record<string, unknown>>) {
    const key = typeof a.key === "string" ? a.key : null;
    if (key == null) continue;
    const s = attrToString(a.value);
    if (s != null) out[key] = s;
  }
  return out;
}

// Parse an OTLP/JSON logs payload into normalized events (verbatim raw kept on each).
export function parseOtlpLogs(payload: unknown): OtelEvent[] {
  const events: OtelEvent[] = [];
  const p = payload as Record<string, unknown>;
  const resourceLogs = Array.isArray(p.resourceLogs) ? p.resourceLogs : [];
  for (const rl of resourceLogs as Array<Record<string, unknown>>) {
    const scopeLogs = Array.isArray(rl.scopeLogs) ? rl.scopeLogs : [];
    for (const sl of scopeLogs as Array<Record<string, unknown>>) {
      const records = Array.isArray(sl.logRecords) ? sl.logRecords : [];
      for (const lr of records as Array<Record<string, unknown>>) {
        const attrs = flattenAttrs(lr.attributes);
        const body = lr.body && typeof lr.body === "object" ? attrToString(lr.body) : null;
        const eventName =
          attrs["event.name"] ?? (body ? body.replace(/^claude_code\./, "") : "unknown");
        events.push({
          signal: "logs",
          event_name: eventName,
          body,
          tool_name: attrs["tool_name"] ?? null,
          tool_use_id: attrs["tool_use_id"] ?? null,
          session_id: attrs["session.id"] ?? null,
          prompt_id: attrs["prompt.id"] ?? null,
          attrs,
          raw: lr,
        });
      }
    }
  }
  return events;
}

// Parse an OTLP/JSON traces payload (beta spans) verbatim. Spans carry name + attributes; the
// tool-action detail lives in logs, so traces are recorded for completeness/cross-check.
export function parseOtlpTraces(payload: unknown): OtelEvent[] {
  const events: OtelEvent[] = [];
  const p = payload as Record<string, unknown>;
  const resourceSpans = Array.isArray(p.resourceSpans) ? p.resourceSpans : [];
  for (const rs of resourceSpans as Array<Record<string, unknown>>) {
    const scopeSpans = Array.isArray(rs.scopeSpans) ? rs.scopeSpans : [];
    for (const ss of scopeSpans as Array<Record<string, unknown>>) {
      const spans = Array.isArray(ss.spans) ? ss.spans : [];
      for (const sp of spans as Array<Record<string, unknown>>) {
        const attrs = flattenAttrs(sp.attributes);
        events.push({
          signal: "traces",
          event_name: typeof sp.name === "string" ? sp.name : "span",
          body: typeof sp.name === "string" ? sp.name : null,
          tool_name: attrs["tool_name"] ?? null,
          tool_use_id: attrs["tool_use_id"] ?? null,
          session_id: attrs["session.id"] ?? null,
          prompt_id: attrs["prompt.id"] ?? null,
          attrs,
          raw: sp,
        });
      }
    }
  }
  return events;
}

// Parse an OTLP/JSON metrics payload verbatim. Each metric becomes one event (data points kept
// in raw). Metrics are counters/gauges (cost, tokens, session count), not tool actions.
export function parseOtlpMetrics(payload: unknown): OtelEvent[] {
  const events: OtelEvent[] = [];
  const p = payload as Record<string, unknown>;
  const resourceMetrics = Array.isArray(p.resourceMetrics) ? p.resourceMetrics : [];
  for (const rm of resourceMetrics as Array<Record<string, unknown>>) {
    const scopeMetrics = Array.isArray(rm.scopeMetrics) ? rm.scopeMetrics : [];
    for (const sm of scopeMetrics as Array<Record<string, unknown>>) {
      const metrics = Array.isArray(sm.metrics) ? sm.metrics : [];
      for (const mt of metrics as Array<Record<string, unknown>>) {
        events.push({
          signal: "metrics",
          event_name: typeof mt.name === "string" ? mt.name : "metric",
          body: typeof mt.name === "string" ? mt.name : null,
          tool_name: null,
          tool_use_id: null,
          session_id: null,
          prompt_id: null,
          attrs: {},
          raw: mt,
        });
      }
    }
  }
  return events;
}

// Write normalized OTel events to the Spine on channel "otel". run_id = the OTel session.id, so
// per-agent attribution is automatic: smith's session and neo's session land under distinct run_ids
// while the join key (tool_use_id) still bridges to the in-process hook/gate channels.
export function recordOtelEvents(spine: Spine, events: OtelEvent[], fallbackRunId = "otel-unknown"): number {
  let n = 0;
  for (const e of events) {
    spine.record({
      run_id: e.session_id ?? fallbackRunId,
      channel: "otel",
      event_name: e.event_name,
      tool_name: e.tool_name,
      tool_use_id: e.tool_use_id,
      session_id: e.session_id,
      agent_id: null,
      raw_json: JSON.stringify(e.raw),
    });
    n++;
  }
  return n;
}

// U8 drain barrier. The drain signal is keyed to "this run's session.id has stopped emitting": the
// receiver stamps each session's last-emit time as rows arrive, and waitForDrain resolves only once
// every tracked session has been silent for quietMs. maxWaitMs ONLY bounds a hang — reaching it
// returns drained=false with a reason, which means the run is INCOMPLETE and must surface to the
// operator. It is never a path to a green grade (that is the line that keeps this from being a
// pass-on-timer). Quiet is the completeness signal; the cap is a safety bound, not a threshold.
export type DrainResult = {
  drained: boolean;
  waitedMs: number;
  quietMs: number;
  sessions: string[]; // the sessions the drain watched
  reason?: string; // set ONLY when drained=false (the cap bounded a hang); the run is incomplete -> surface
};

export type DrainOpts = {
  sessions?: string[] | null; // watch only these session.ids; null/omitted => every seen session
  quietMs?: number; // a session is drained after this long with no new row (default 4000; export interval is 1s)
  maxWaitMs?: number; // upper bound on the wait; reaching it => drained=false (incomplete, surfaces)
  pollMs?: number; // how often to re-check (default 250)
};

export type Receiver = {
  server: http.Server;
  port: number;
  close: () => Promise<void>;
  seenSessions: () => string[]; // every session.id that has emitted into this receiver
  lastEmitAt: (sessionId?: string) => number | null; // last-emit epoch ms for a session, or the max across all
  waitForDrain: (opts?: DrainOpts) => Promise<DrainResult>;
};

export type ReceiverOpts = {
  spine: Spine;
  port: number;
  host?: string; // default 127.0.0.1
  fallbackRunId?: string;
  onEvent?: (e: OtelEvent) => void; // optional hook for tests / live tailing
};

// Start the OTLP receiver. Accepts POST /v1/logs, /v1/traces, /v1/metrics (OTLP/JSON) and ingests
// each into the Spine verbatim. Always answers 200 {} so the CLI exporter never blocks the agent.
export function startReceiver(opts: ReceiverOpts): Promise<Receiver> {
  const host = opts.host ?? "127.0.0.1";
  // U8 drain state: per-session last-emit epoch ms (stamped as session-bearing rows land).
  const lastEmit = new Map<string, number>();
  const stamp = (events: OtelEvent[]): void => {
    const now = Date.now();
    for (const e of events) if (e.session_id) lastEmit.set(e.session_id, now);
  };
  const server = http.createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        const payload = text.length ? JSON.parse(text) : {};
        let events: OtelEvent[] = [];
        if (req.url?.startsWith("/v1/logs")) events = parseOtlpLogs(payload);
        else if (req.url?.startsWith("/v1/traces")) events = parseOtlpTraces(payload);
        else if (req.url?.startsWith("/v1/metrics")) events = parseOtlpMetrics(payload);
        recordOtelEvents(opts.spine, events, opts.fallbackRunId);
        stamp(events); // U8: mark these sessions as having just emitted (drain clock)
        if (opts.onEvent) for (const e of events) opts.onEvent(e);
      } catch (err) {
        // Fail-open: never break the agent's export path. Log and 200.
        console.error("[otel-receiver] ingest error:", (err as Error).message);
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
  });

  return new Promise<Receiver>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, host, () => {
      const seenSessions = (): string[] => [...lastEmit.keys()];
      const lastEmitAt = (sessionId?: string): number | null => {
        if (sessionId) return lastEmit.get(sessionId) ?? null;
        let max: number | null = null;
        for (const t of lastEmit.values()) max = max == null ? t : Math.max(max, t);
        return max;
      };
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
      const waitForDrain = async (o: DrainOpts = {}): Promise<DrainResult> => {
        const quietMs = o.quietMs ?? 4000;
        const maxWaitMs = o.maxWaitMs ?? 60000;
        const pollMs = o.pollMs ?? 250;
        const start = Date.now();
        for (;;) {
          const now = Date.now();
          // The sessions to watch: an explicit set, else every session seen so far (re-read each poll
          // so a session that appears mid-wait is included — late sub-agent OTel cannot slip past).
          const watch = o.sessions ?? seenSessions();
          const seenAny = watch.length > 0;
          // A watched session is quiet iff it has emitted AND its last emit is older than quietMs. A
          // session we expected but never saw counts as NOT quiet, so we keep waiting (then surface).
          const allQuiet = seenAny && watch.every((s) => lastEmit.has(s) && now - lastEmit.get(s)! >= quietMs);
          if (allQuiet) return { drained: true, waitedMs: now - start, quietMs, sessions: watch };
          if (now - start >= maxWaitMs) {
            const missing = watch.filter((s) => !lastEmit.has(s));
            const reason = !seenAny
              ? "no session emitted within maxWaitMs"
              : missing.length
                ? `sessions never emitted: [${missing.join(",")}]`
                : "sessions still emitting at maxWaitMs (not quiet)";
            return { drained: false, waitedMs: now - start, quietMs, sessions: watch, reason };
          }
          await sleep(pollMs);
        }
      };
      resolve({
        server,
        port: opts.port,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => res());
          }),
        seenSessions,
        lastEmitAt,
        waitForDrain,
      });
    });
  });
}
