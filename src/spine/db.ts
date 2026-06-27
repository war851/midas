// The spine: SQLite is the canonical, queryable, assertable record. Verbatim-first.
// better-sqlite3 is synchronous, so a hook callback can write its row BEFORE it returns
// (capture-before-proceed) and the gate can block on the same code path.
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// U10 SINGLE-WRITER REGISTRY (process-scoped). At most ONE writable Spine may own a given DB path at a
// time. A second writable open of an owned path throws — this is the structural guarantee that the
// multi-writer contention the settings-hook log-file detour worked around cannot reappear. Readers
// open readonly (below) and are never registered, so they never contend; everything that writes feeds
// the one owner (in-process, or via the OTel HTTP receiver / the settings-hook log queue). close()
// releases ownership so a later run can re-acquire the path. `:memory:` DBs are independent and exempt.
const WRITABLE_OWNERS = new Set<string>();

// "otel" = the breadth spine: events ingested from the CLI's OTLP export (every cooperative
// driver in the container, via managed settings). Additive; the existing channels are unchanged.
// "settings_hook" = the SECOND hook channel: events fired by project .claude/settings.json command
// hooks (the ~10 events the in-process options.hooks callback union never invokes — e.g. PostCompact,
// InstructionsLoaded, SessionStart/End). Ingested post-run from the sink log (src/coverage/hook-sink.mjs).
export type Channel = "hook_callback" | "message_stream" | "transcript" | "gate" | "run_meta" | "otel" | "settings_hook";

export type EventRow = {
  run_id: string;
  channel: Channel;
  event_name: string;
  tool_name: string | null;
  tool_use_id: string | null;
  session_id: string | null;
  agent_id: string | null;
  raw_json: string; // the FULL verbatim payload — never lossy
};

// The truthfulness/verdict axis (the `comparisons` table). U5 adds `unmeasured` as an EXPLICIT third
// outcome of the omission/lie VERDICT: "couldn't measure" != "passed". This lives ONLY here, in the
// comparison/verdict axis. It is NOT a coverage-ledger state: HookStatus / ToolStatus stay strictly
// two-state (fired_verified | failed) and are untouched by this.
export type ComparisonKind = "lie" | "silent_failure" | "omission" | "unmeasured";

// --- coverage ledgers (Stage 0+) -------------------------------------------------------------
// Two persisted, queryable ledgers. EXACTLY TWO STATES, no third bucket: an item is either
// `fired_verified` (it actually fired AND landed a grounded row on its EXPECTED channel) or
// `failed` (anything else — absence is failure, the un-gameable default). The prior
// `proven_unreachable` / `invoked_recorded` reclassification buckets are DELETED: they let
// "couldn't fire it" round up to "accounted" (see chain-of-thought §M). Statuses are MONOTONIC
// within one DB (a later weaker upsert never un-fires a verified row), channel bits OR-in, the
// first non-null evidence id is kept. Each item is verified ONCE per fresh DB; monotonicity only
// guards against accidental downgrade.
export type HookStatus = "failed" | "fired_verified";
export type ToolStatus = "failed" | "fired_verified";

const HOOK_RANK: Record<HookStatus, number> = { failed: 0, fired_verified: 1 };
const TOOL_RANK: Record<ToolStatus, number> = { failed: 0, fired_verified: 1 };

export type HookCoverageRow = {
  hook_name: string;
  status: HookStatus;
  channel_depth: number; // 0 | 1
  channel_otel: number; // 0 | 1
  evidence_event_id: number | null;
  reason: string | null;
  scenario: string | null;
  updated_at: string;
};

export type ToolCoverageRow = {
  tool_name: string;
  kind: string;
  status: ToolStatus;
  channel_depth: number;
  channel_otel: number;
  evidence_event_id: number | null;
  reason: string | null;
  scenario: string | null;
  updated_at: string;
};

export type HookCoverageUpsert = {
  hook_name: string;
  status: HookStatus;
  channel_depth?: boolean;
  channel_otel?: boolean;
  evidence_event_id?: number | null;
  reason?: string | null;
  scenario?: string | null;
};

export type ToolCoverageUpsert = {
  tool_name: string;
  kind?: string;
  status: ToolStatus;
  channel_depth?: boolean;
  channel_otel?: boolean;
  evidence_event_id?: number | null;
  reason?: string | null;
  scenario?: string | null;
};

export type CoverageSummary = {
  hooks: { total: number; fired_verified: number; failed: number };
  tools: { total: number; fired_verified: number; failed: number };
};

// Where-filter for firstEventId — any subset of these columns, ANDed.
export type EventWhere = Partial<Pick<EventRow, "run_id" | "channel" | "event_name" | "tool_name" | "tool_use_id">>;

// readonly => a non-owning reader (no registry, no migrate, no write pragma). Default = writable owner.
export type SpineOpts = { readonly?: boolean };

export class Spine {
  private db: Database.Database;
  private readonly resolvedPath: string;
  private readonly owns: boolean; // true iff this instance holds the single writable ownership

  constructor(dbPath: string, opts: SpineOpts = {}) {
    const readonly = !!opts.readonly;
    this.resolvedPath = dbPath === ":memory:" ? ":memory:" : resolve(dbPath);

    if (readonly) {
      // Readers never own and never contend. Open the existing DB read-only; no migrate, no WAL pragma
      // (both would attempt a write). A readonly handle on a path another Spine owns is allowed.
      this.db = new Database(this.resolvedPath, { readonly: true });
      this.owns = false;
      return;
    }

    // Writable owner: enforce single-writer before touching the file.
    if (this.resolvedPath !== ":memory:" && WRITABLE_OWNERS.has(this.resolvedPath)) {
      throw new Error(
        `[spine single-writer] ${this.resolvedPath} already has a writable owner; open readonly or close the existing owner first`,
      );
    }
    if (this.resolvedPath !== ":memory:") WRITABLE_OWNERS.add(this.resolvedPath);
    this.owns = this.resolvedPath !== ":memory:";
    try {
      mkdirSync(dirname(dbPath), { recursive: true });
      this.db = new Database(dbPath);
      this.db.pragma("journal_mode = WAL");
      this.migrate();
    } catch (e) {
      if (this.owns) WRITABLE_OWNERS.delete(this.resolvedPath); // release on a failed open
      throw e;
    }
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id       TEXT NOT NULL,
        captured_at  TEXT NOT NULL,
        channel      TEXT NOT NULL,
        event_name   TEXT NOT NULL,
        tool_name    TEXT,
        tool_use_id  TEXT,
        session_id   TEXT,
        agent_id     TEXT,
        raw_json     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_run      ON events(run_id);
      CREATE INDEX IF NOT EXISTS idx_events_channel  ON events(run_id, channel);
      CREATE INDEX IF NOT EXISTS idx_events_name     ON events(run_id, event_name);
      CREATE INDEX IF NOT EXISTS idx_events_tooluse  ON events(run_id, tool_use_id);

      CREATE TABLE IF NOT EXISTS self_reports (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id       TEXT NOT NULL,
        captured_at  TEXT NOT NULL,
        raw_text     TEXT NOT NULL,
        parsed_json  TEXT,
        parse_ok     INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS comparisons (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id       TEXT NOT NULL,
        captured_at  TEXT NOT NULL,
        kind         TEXT NOT NULL,
        tool_use_id  TEXT,
        verdict      INTEGER NOT NULL,
        detail_json  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS hook_coverage (
        hook_name         TEXT PRIMARY KEY,
        status            TEXT NOT NULL,
        channel_depth     INTEGER NOT NULL DEFAULT 0,
        channel_otel      INTEGER NOT NULL DEFAULT 0,
        evidence_event_id INTEGER,
        reason            TEXT,
        scenario          TEXT,
        updated_at        TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tool_coverage (
        tool_name         TEXT PRIMARY KEY,
        kind              TEXT NOT NULL,
        status            TEXT NOT NULL,
        channel_depth     INTEGER NOT NULL DEFAULT 0,
        channel_otel      INTEGER NOT NULL DEFAULT 0,
        evidence_event_id INTEGER,
        reason            TEXT,
        scenario          TEXT,
        updated_at        TEXT NOT NULL
      );
    `);
  }

  private insertEvent = (row: EventRow): void => {
    this.db
      .prepare(
        `INSERT INTO events (run_id, captured_at, channel, event_name, tool_name, tool_use_id, session_id, agent_id, raw_json)
         VALUES (@run_id, @captured_at, @channel, @event_name, @tool_name, @tool_use_id, @session_id, @agent_id, @raw_json)`,
      )
      .run({ ...row, captured_at: new Date().toISOString() });
  };

  record(row: EventRow): void {
    this.insertEvent(row);
  }

  recordSelfReport(run_id: string, raw_text: string, parsed: unknown, parse_ok: boolean): void {
    this.db
      .prepare(
        `INSERT INTO self_reports (run_id, captured_at, raw_text, parsed_json, parse_ok)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(run_id, new Date().toISOString(), raw_text, parsed == null ? null : JSON.stringify(parsed), parse_ok ? 1 : 0);
  }

  recordComparison(run_id: string, kind: ComparisonKind, tool_use_id: string | null, verdict: boolean, detail: unknown): void {
    this.db
      .prepare(
        `INSERT INTO comparisons (run_id, captured_at, kind, tool_use_id, verdict, detail_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(run_id, new Date().toISOString(), kind, tool_use_id, verdict ? 1 : 0, JSON.stringify(detail));
  }

  // --- read helpers (assertions query through these) ---

  eventsForRun(run_id: string): Array<EventRow & { id: number; captured_at: string }> {
    return this.db.prepare(`SELECT * FROM events WHERE run_id = ? ORDER BY id`).all(run_id) as never;
  }

  // Cross-run join: the same tool_use_id appears in the otel channel (run_id = OTel session.id)
  // AND in the hook/gate channels (run_id = harness runId). Reconciliation joins on it, not run_id.
  eventsByToolUseId(tool_use_id: string): Array<EventRow & { id: number; captured_at: string }> {
    return this.db.prepare(`SELECT * FROM events WHERE tool_use_id = ? ORDER BY id`).all(tool_use_id) as never;
  }

  // All distinct tool_use_ids seen on a given channel (optionally scoped to a set of run_ids).
  toolUseIdsOnChannel(channel: Channel, run_ids?: string[]): string[] {
    const rows = (
      run_ids && run_ids.length
        ? this.db
            .prepare(
              `SELECT DISTINCT tool_use_id FROM events WHERE channel = ? AND tool_use_id IS NOT NULL AND run_id IN (${run_ids.map(() => "?").join(",")})`,
            )
            .all(channel, ...run_ids)
        : this.db.prepare(`SELECT DISTINCT tool_use_id FROM events WHERE channel = ? AND tool_use_id IS NOT NULL`).all(channel)
    ) as Array<{ tool_use_id: string }>;
    return rows.map((r) => r.tool_use_id);
  }

  // All rows on a channel, across every run_id (otel rows live under run_id = session.id, so a
  // coverage reconcile that does not know every session id reads the channel whole — safe on a
  // battery-scoped DB). Ordered by id so MIN(id) evidence pointers are stable.
  eventsOnChannel(channel: Channel): Array<EventRow & { id: number; captured_at: string }> {
    return this.db.prepare(`SELECT * FROM events WHERE channel = ? ORDER BY id`).all(channel) as never;
  }

  channelEventMatrix(run_id: string): Array<{ channel: string; event_name: string; n: number }> {
    return this.db
      .prepare(
        `SELECT channel, event_name, COUNT(*) AS n FROM events WHERE run_id = ? GROUP BY channel, event_name ORDER BY channel, event_name`,
      )
      .all(run_id) as never;
  }

  countComparisons(run_id: string, kind?: ComparisonKind): number {
    const row = (
      kind
        ? this.db.prepare(`SELECT COUNT(*) AS n FROM comparisons WHERE run_id = ? AND kind = ?`).get(run_id, kind)
        : this.db.prepare(`SELECT COUNT(*) AS n FROM comparisons WHERE run_id = ?`).get(run_id)
    ) as { n: number };
    return row.n;
  }

  countWhere(run_id: string, where: Partial<Pick<EventRow, "channel" | "event_name" | "tool_name">>): number {
    const clauses = ["run_id = @run_id"];
    if (where.channel) clauses.push("channel = @channel");
    if (where.event_name) clauses.push("event_name = @event_name");
    if (where.tool_name) clauses.push("tool_name = @tool_name");
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM events WHERE ${clauses.join(" AND ")}`)
      .get({ run_id, ...where }) as { n: number };
    return row.n;
  }

  // --- coverage ledgers -----------------------------------------------------------------------

  // MIN(id) of the earliest event matching the filter — the evidence pointer for a ledger row.
  firstEventId(where: EventWhere): number | null {
    const clauses: string[] = [];
    if (where.run_id) clauses.push("run_id = @run_id");
    if (where.channel) clauses.push("channel = @channel");
    if (where.event_name) clauses.push("event_name = @event_name");
    if (where.tool_name) clauses.push("tool_name = @tool_name");
    if (where.tool_use_id) clauses.push("tool_use_id = @tool_use_id");
    const sql = `SELECT MIN(id) AS id FROM events${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}`;
    const row = this.db.prepare(sql).get(where) as { id: number | null };
    return row.id ?? null;
  }

  // Seed the denominator: one row per tool/hook as `failed` if not already present. Idempotent —
  // never overwrites an existing (possibly already-verified) row. Seeding as `failed` makes absence
  // the default: an item earns `fired_verified` only by producing a grounded channel row.
  seedCoverage(tools: Array<{ name: string; kind: string }>, hooks: Array<{ name: string }>): void {
    const now = new Date().toISOString();
    const insHook = this.db.prepare(
      `INSERT OR IGNORE INTO hook_coverage (hook_name, status, channel_depth, channel_otel, evidence_event_id, reason, scenario, updated_at)
       VALUES (?, 'failed', 0, 0, NULL, NULL, NULL, ?)`,
    );
    const insTool = this.db.prepare(
      `INSERT OR IGNORE INTO tool_coverage (tool_name, kind, status, channel_depth, channel_otel, evidence_event_id, reason, scenario, updated_at)
       VALUES (?, ?, 'failed', 0, 0, NULL, NULL, NULL, ?)`,
    );
    const tx = this.db.transaction(() => {
      for (const h of hooks) insHook.run(h.name, now);
      for (const t of tools) insTool.run(t.name, t.kind, now);
    });
    tx();
  }

  upsertHookCoverage(u: HookCoverageUpsert): void {
    const existing = this.db.prepare(`SELECT * FROM hook_coverage WHERE hook_name = ?`).get(u.hook_name) as
      | HookCoverageRow
      | undefined;
    const status: HookStatus = existing && HOOK_RANK[existing.status] > HOOK_RANK[u.status] ? existing.status : u.status;
    const merged: HookCoverageRow = {
      hook_name: u.hook_name,
      status,
      channel_depth: (existing?.channel_depth ? 1 : 0) | (u.channel_depth ? 1 : 0),
      channel_otel: (existing?.channel_otel ? 1 : 0) | (u.channel_otel ? 1 : 0),
      evidence_event_id: existing?.evidence_event_id ?? u.evidence_event_id ?? null, // keep first non-null
      reason: u.reason ?? existing?.reason ?? null,
      scenario: u.scenario ?? existing?.scenario ?? null,
      updated_at: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO hook_coverage (hook_name, status, channel_depth, channel_otel, evidence_event_id, reason, scenario, updated_at)
         VALUES (@hook_name, @status, @channel_depth, @channel_otel, @evidence_event_id, @reason, @scenario, @updated_at)
         ON CONFLICT(hook_name) DO UPDATE SET status=@status, channel_depth=@channel_depth, channel_otel=@channel_otel,
           evidence_event_id=@evidence_event_id, reason=@reason, scenario=@scenario, updated_at=@updated_at`,
      )
      .run(merged);
  }

  upsertToolCoverage(u: ToolCoverageUpsert): void {
    const existing = this.db.prepare(`SELECT * FROM tool_coverage WHERE tool_name = ?`).get(u.tool_name) as
      | ToolCoverageRow
      | undefined;
    const status: ToolStatus = existing && TOOL_RANK[existing.status] > TOOL_RANK[u.status] ? existing.status : u.status;
    const merged: ToolCoverageRow = {
      tool_name: u.tool_name,
      kind: u.kind ?? existing?.kind ?? "unknown",
      status,
      channel_depth: (existing?.channel_depth ? 1 : 0) | (u.channel_depth ? 1 : 0),
      channel_otel: (existing?.channel_otel ? 1 : 0) | (u.channel_otel ? 1 : 0),
      evidence_event_id: existing?.evidence_event_id ?? u.evidence_event_id ?? null,
      reason: u.reason ?? existing?.reason ?? null,
      scenario: u.scenario ?? existing?.scenario ?? null,
      updated_at: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO tool_coverage (tool_name, kind, status, channel_depth, channel_otel, evidence_event_id, reason, scenario, updated_at)
         VALUES (@tool_name, @kind, @status, @channel_depth, @channel_otel, @evidence_event_id, @reason, @scenario, @updated_at)
         ON CONFLICT(tool_name) DO UPDATE SET kind=@kind, status=@status, channel_depth=@channel_depth, channel_otel=@channel_otel,
           evidence_event_id=@evidence_event_id, reason=@reason, scenario=@scenario, updated_at=@updated_at`,
      )
      .run(merged);
  }

  hookCoverage(): HookCoverageRow[] {
    return this.db.prepare(`SELECT * FROM hook_coverage ORDER BY hook_name`).all() as never;
  }

  toolCoverage(): ToolCoverageRow[] {
    return this.db.prepare(`SELECT * FROM tool_coverage ORDER BY tool_name`).all() as never;
  }

  coverageSummary(): CoverageSummary {
    const h = this.hookCoverage();
    const t = this.toolCoverage();
    return {
      hooks: {
        total: h.length,
        fired_verified: h.filter((r) => r.status === "fired_verified").length,
        failed: h.filter((r) => r.status === "failed").length,
      },
      tools: {
        total: t.length,
        fired_verified: t.filter((r) => r.status === "fired_verified").length,
        failed: t.filter((r) => r.status === "failed").length,
      },
    };
  }

  close(): void {
    this.db.close();
    if (this.owns) WRITABLE_OWNERS.delete(this.resolvedPath); // release ownership for re-acquisition
  }
}
