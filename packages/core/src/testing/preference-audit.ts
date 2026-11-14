import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { bindingSchema, hash, type Host } from "../contracts.js";

/** Offline fixture only: callers must enforce authorization, scope and projection separately. */
export class PreferenceAuditFixture {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path, { timeout: 1000 });
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS preference_calls (
        id TEXT PRIMARY KEY, outcome TEXT NOT NULL CHECK(outcome IN ('pending','success','refused','failed')),
        closure TEXT NOT NULL CHECK(closure IN ('unknown','confirmed'))
      );
      CREATE TABLE IF NOT EXISTS preference_identity (
        id TEXT PRIMARY KEY REFERENCES preference_calls(id), binding_hash TEXT NOT NULL
      );`);
  }
  begin(): string {
    const id = randomUUID();
    this.db.prepare("INSERT INTO preference_calls VALUES (?,'pending','unknown')").run(id);
    return id;
  }
  /** One outstanding ambiguous call per database; a rejection is itself audited. */
  admit(): string | null {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const occupied = this.db.prepare("SELECT 1 FROM preference_calls WHERE closure='unknown' AND outcome IN ('pending','failed') LIMIT 1").get();
      const id = randomUUID();
      this.db.prepare("INSERT INTO preference_calls VALUES (?,?, 'unknown')").run(id, occupied ? "refused" : "pending");
      this.db.exec("COMMIT");
      return occupied ? null : id;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  bind(id: string, bindingHash: string): void {
    const result = this.db.prepare("INSERT INTO preference_identity SELECT id, ? FROM preference_calls WHERE id=? AND outcome='pending'").run(bindingHash, id);
    if (result.changes !== 1) throw new Error("audit unavailable");
  }
  finish(id: string, outcome: "success" | "refused" | "failed", closed: boolean): void {
    const result = this.db.prepare("UPDATE preference_calls SET outcome=?, closure=? WHERE id=? AND outcome='pending'")
      .run(outcome, closed ? "confirmed" : "unknown", id);
    if (result.changes !== 1) throw new Error("audit unavailable");
  }
  records(): unknown[] {
    return this.db.prepare("SELECT c.id,c.outcome,c.closure,i.binding_hash FROM preference_calls c LEFT JOIN preference_identity i ON i.id=c.id ORDER BY c.rowid").all();
  }
  close(): void { this.db.close(); }
}

export interface PreferenceAdapter<T> {
  read(signal: AbortSignal): Promise<{ outcome: "success"; value: T } | { outcome: "refused" }>;
  close(signal: AbortSignal): Promise<boolean>;
}

const MAX_OPERATION_MS = 5_000;

async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>, milliseconds: number, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    abort = () => { controller.abort(); reject(new Error("cancelled")); };
    if (parent?.aborted) abort();
    else parent?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(abort, milliseconds);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new Error("cancelled");
      return operation(controller.signal);
    }), deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abort) parent?.removeEventListener("abort", abort);
  }
}

/** An ambiguous read can still be running after timeout; a close reply then is not proof of closure. */
export async function auditedPreferenceRead<T>(
  audit: PreferenceAuditFixture, adapter: PreferenceAdapter<T>, milliseconds: number, host: Pick<Host, "identity">, signal?: AbortSignal,
): Promise<{ ok: true; value: T } | { ok: false; code: "refused" | "unavailable" }> {
  let id: string | null;
  try { id = audit.admit(); } catch { return { ok: false, code: "unavailable" }; }
  if (id === null) return { ok: false, code: "unavailable" };
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1 || milliseconds > MAX_OPERATION_MS) {
    try { audit.finish(id, "refused", false); } catch { /* Fail closed. */ }
    return { ok: false, code: "unavailable" };
  }
  try {
    const binding = await bounded(() => host.identity(), milliseconds, signal);
    if (binding === null) throw new Error("identity unavailable");
    audit.bind(id, hash(bindingSchema.parse(binding)));
  } catch {
    try { audit.finish(id, "refused", true); } catch { /* Fail closed. */ }
    return { ok: false, code: "unavailable" };
  }
  let outcome: "success" | "refused" | "failed" = "failed";
  let value: T | undefined;
  let readSettled = false;
  try {
    const result = await bounded(async s => {
      try { return await adapter.read(s); } finally { readSettled = true; }
    }, milliseconds, signal);
    if (result.outcome === "success") { outcome = "success"; value = result.value; }
    else if (result.outcome === "refused") outcome = "refused";
  } catch { /* Fail closed; do not expose adapter errors. */ }
  const settledBeforeClose = readSettled;
  let closed = false;
  try { closed = await bounded(s => adapter.close(s), milliseconds) === true && settledBeforeClose; } catch { /* Unknown is not closed. */ }
  if (!closed || signal?.aborted) outcome = "failed";
  try { audit.finish(id, outcome, closed); } catch { return { ok: false, code: "unavailable" }; }
  if (outcome === "success") return { ok: true, value: value as T };
  return { ok: false, code: outcome === "refused" ? "refused" : "unavailable" };
}
