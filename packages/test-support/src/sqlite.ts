import { DatabaseSync } from "node:sqlite";
import {
  hash, requireThat, Refusal, integer, limitsSchema,
  type ApprovalAuthority, type ApprovalTarget, type AuditRecord, type DurableAudit,
  type DurableState, type Lease, type Lifecycle, type Reservation,
} from "../../policy/src/index.js";

/** Test-only transactional fixture. Disk reopen and process contention are real;
 * provider reconciliation, deployment HA, scheduler and operator recovery are not.
 * Never use a database containing production data or credentials with this class.
 */
export class SqliteFixture implements DurableState, ApprovalAuthority, DurableAudit {
  private readonly db: DatabaseSync;
  failAuditAt = 0;
  private auditCalls = 0;
  constructor(path: string) {
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS leases (
        handle TEXT PRIMARY KEY, binding TEXT NOT NULL, fingerprint TEXT NOT NULL,
        created INTEGER NOT NULL, expires INTEGER NOT NULL, cost INTEGER NOT NULL,
        state TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS approvals (
        reference TEXT PRIMARY KEY, target TEXT NOT NULL, issued INTEGER NOT NULL,
        expires INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS audit (sequence INTEGER PRIMARY KEY, record TEXT NOT NULL);
    `);
  }
  close(): void { this.db.close(); }
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  async get(handle: string): Promise<Lease | null> {
    const row = this.db.prepare("SELECT * FROM leases WHERE handle=?").get(handle);
    if (!row) return null;
    return {
      handle: String(row.handle), binding: JSON.parse(String(row.binding)), fingerprint: String(row.fingerprint),
      createdAt: Number(row.created), expiresAt: Number(row.expires), reservedMinor: Number(row.cost),
      state: String(row.state) as Lifecycle,
    };
  }
  async reserve(input: Reservation): Promise<Lease> {
    const limits = limitsSchema.parse(input.limits);
    integer(0, Number.MAX_SAFE_INTEGER).parse(input.worstCaseMinor);
    integer(0, Number.MAX_SAFE_INTEGER).parse(input.now);
    integer(0, Number.MAX_SAFE_INTEGER).parse(input.expiresAt);
    requireThat(input.worstCaseMinor >= limits.unitWorstCaseMinor && input.expiresAt > input.now && input.expiresAt - input.now <= limits.maxTtlSeconds * 1000, "cap");
    this.transaction(() => {
      requireThat(!this.db.prepare("SELECT 1 FROM leases WHERE handle=?").get(input.handle), "conflict");
      requireThat(!this.db.prepare("SELECT 1 FROM leases WHERE state IN ('uncertain','cleaning')").get(), "unavailable");
      const usage = this.db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(cost),0) AS cost FROM leases WHERE state!='closed'").get()!;
      requireThat(Number(usage.n) < limits.maxResources && Number(usage.cost) + input.worstCaseMinor <= limits.maxSpendMinor, "cap");
      this.db.prepare("INSERT INTO leases VALUES (?,?,?,?,?,?,?)").run(
        input.handle, JSON.stringify(input.binding), input.fingerprint, input.now, input.expiresAt, input.worstCaseMinor, "intent",
      );
    });
    return (await this.get(input.handle))!;
  }
  async transition(handle: string, from: Lifecycle[], to: Lifecycle): Promise<void> {
    const allowed: Record<Lifecycle, Lifecycle[]> = {
      intent: ["active", "uncertain", "cleaning"], active: ["cleaning"], uncertain: ["cleaning"], cleaning: ["closed"], closed: [],
    };
    this.transaction(() => {
      const row = this.db.prepare("SELECT state FROM leases WHERE handle=?").get(handle);
      requireThat(row && from.includes(String(row.state) as Lifecycle) && allowed[String(row.state) as Lifecycle]?.includes(to), "conflict");
      this.db.prepare("UPDATE leases SET state=? WHERE handle=?").run(to, handle);
    });
  }
  async recoverable(): Promise<Lease[]> {
    const rows = this.db.prepare("SELECT handle FROM leases WHERE state!='closed' ORDER BY handle").all();
    return Promise.all(rows.map(async r => (await this.get(String(r.handle)))!));
  }
  grant(reference: string, target: ApprovalTarget, issued: number, expires: number): void {
    requireThat(expires > issued, "approval");
    this.db.prepare("INSERT INTO approvals(reference,target,issued,expires) VALUES (?,?,?,?)").run(reference, hash(target), issued, expires);
  }
  revoke(reference: string): void { this.db.prepare("UPDATE approvals SET revoked=1 WHERE reference=?").run(reference); }
  async consume(reference: string | undefined, target: ApprovalTarget, now: number): Promise<boolean> {
    if (!reference) return false;
    return this.transaction(() => {
      const result = this.db.prepare("UPDATE approvals SET used=1 WHERE reference=? AND target=? AND issued<=? AND expires>? AND revoked=0 AND used=0")
        .run(reference, hash(target), now, now);
      return result.changes === 1;
    });
  }
  async append(record: AuditRecord): Promise<void> {
    if (++this.auditCalls === this.failAuditAt) throw new Refusal("audit");
    this.db.prepare("INSERT INTO audit(record) VALUES (?)").run(JSON.stringify(record));
  }
  audits(): AuditRecord[] {
    return this.db.prepare("SELECT record FROM audit ORDER BY sequence").all().map(row => JSON.parse(String(row.record)));
  }
}
