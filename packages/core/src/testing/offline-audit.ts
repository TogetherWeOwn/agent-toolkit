import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

/** Synthetic operations only. A fixture acknowledgement is not provider closure evidence. */
export interface OfflineOperation<T> {
  read(signal: AbortSignal): Promise<T>;
  close(signal: AbortSignal): Promise<void>;
}

type Result<T> = { ok: true; value: T } | { ok: false };

async function bounded<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let rejectDeadline: (error: Error) => void = () => {};
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const abort = () => { controller.abort(); rejectDeadline(new Error("cancelled")); };
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, ms);
  try {
    return await Promise.race([Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new Error("cancelled");
      return fn(controller.signal);
    }), deadline]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", abort);
  }
}

/** Private admission and finalization keep an abandoned owner from clearing a hold. */
export class OfflineAudit {
  readonly #db: DatabaseSync;
  constructor(path: string) {
    this.#db = new DatabaseSync(path, { timeout: 1000 });
    this.#db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS offline_calls (
        id TEXT PRIMARY KEY, outcome TEXT NOT NULL CHECK(outcome IN ('pending','unknown','success','refused'))
      );
      UPDATE offline_calls SET outcome='unknown' WHERE outcome='pending';`);
  }

  async run<T>(operation: OfflineOperation<T>, ms: number, signal?: AbortSignal): Promise<Result<T>> {
    if (!Number.isSafeInteger(ms) || ms < 1 || ms > 5000 || signal?.aborted) return { ok: false };
    const id = randomUUID();
    try {
      this.#db.exec("BEGIN IMMEDIATE");
      try {
        const occupied = this.#db.prepare("SELECT 1 FROM offline_calls WHERE outcome IN ('pending','unknown') LIMIT 1").get();
        this.#db.prepare("INSERT INTO offline_calls VALUES (?, ?)").run(id, occupied ? "refused" : "pending");
        this.#db.exec("COMMIT");
        if (occupied) return { ok: false };
      } catch (error) {
        this.#db.exec("ROLLBACK");
        throw error;
      }
    } catch { return { ok: false }; }

    try {
      const value = await bounded(s => operation.read(s), ms, signal);
      await bounded(s => operation.close(s), ms, signal);
      if (signal?.aborted) return { ok: false };
      const result = this.#db.prepare("UPDATE offline_calls SET outcome='success' WHERE id=? AND outcome='pending'").run(id);
      if (result.changes !== 1) return { ok: false };
      return { ok: true, value };
    } catch {
      // Leave the durable pending record untouched: it can never be cleared by this API.
      return { ok: false };
    }
  }

  records(): unknown[] { return this.#db.prepare("SELECT id, outcome FROM offline_calls ORDER BY rowid").all(); }
  close(): void { this.#db.close(); }
}
