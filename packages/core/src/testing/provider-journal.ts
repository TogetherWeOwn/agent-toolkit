import { DatabaseSync } from "node:sqlite";
import { digest, identifier, requireThat } from "../schema.js";

/** Synthetic journal only. No production authorization, HA, recovery takeover or
 * scheduler. Never open production data here. Tombstones survive process reopen.
 */
export class ProviderJournalFixture {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS provider_calls (
        key TEXT PRIMARY KEY, target TEXT NOT NULL, event TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK(outcome IN ('pending','complete','refused','uncertain'))
      );
    `);
  }
  close(): void { this.db.close(); }
  async claim(key: string, target: string, event: string): Promise<boolean> {
    digest.parse(key);
    digest.parse(target);
    identifier.parse(event);
    return this.db.prepare("INSERT INTO provider_calls VALUES (?,?,?,'pending') ON CONFLICT(key) DO NOTHING")
      .run(key, target, event).changes === 1;
  }
  async finish(key: string, event: string, outcome: "complete" | "refused" | "uncertain"): Promise<void> {
    requireThat(["complete", "refused", "uncertain"].includes(outcome), "schema");
    const result = this.db.prepare("UPDATE provider_calls SET outcome=? WHERE key=? AND event=?")
      .run(outcome, key, event);
    requireThat(result.changes === 1, "conflict");
  }
  outcome(key: string): string | null {
    const row = this.db.prepare("SELECT outcome FROM provider_calls WHERE key=?").get(key);
    return row ? String(row.outcome) : null;
  }
}
