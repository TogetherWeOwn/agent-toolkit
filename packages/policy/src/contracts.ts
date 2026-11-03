import { createHash } from "node:crypto";
import { closed, identifier, integer, requireThat, type Code } from "./schema.js";

export const bindingSchema = closed({ tenant: identifier, agent: identifier, project: identifier, task: identifier });
export type Binding = ReturnType<typeof bindingSchema.parse>;
export type Operation = "inspect" | "provision" | "destroy";
export type Phase = "intent" | "outcome" | "refused";
export type Decision = "allow" | Code;
export type Lifecycle = "intent" | "active" | "uncertain" | "cleaning" | "closed";

export function hash(value: unknown): string {
  // Inputs must already be closed-schema, immutable JSON with no secret values.
  const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v !== null && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b, "en")).map(([k, x]) => [k, canonical(x)]));
    }
    return v;
  };
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export interface Lease {
  handle: string;
  binding: Binding;
  fingerprint: string;
  artifactDigest: string;
  createdAt: number;
  expiresAt: number;
  reservedMinor: number;
  state: Lifecycle;
}

export const limitsSchema = closed({
  maxTtlSeconds: integer(1, 10800),
  maxSpendMinor: integer(0, Number.MAX_SAFE_INTEGER),
  maxResources: integer(1, 100),
  unitWorstCaseMinor: integer(0, Number.MAX_SAFE_INTEGER),
});
export type Limits = ReturnType<typeof limitsSchema.parse>;

export function expiry(now: number, ttl: number, limits: Limits): number {
  integer(0, Number.MAX_SAFE_INTEGER).parse(now);
  requireThat(Number.isSafeInteger(ttl) && ttl > 0 && ttl <= limits.maxTtlSeconds, "cap");
  const end = now + ttl * 1000;
  requireThat(Number.isSafeInteger(end), "cap");
  return end;
}

export function owned(lease: Lease | null, binding: Binding, now: number): Lease {
  requireThat(lease !== null && hash(lease.binding) === hash(binding), "scope");
  requireThat(lease.state === "active", "scope");
  requireThat(Number.isSafeInteger(lease.expiresAt) && now < lease.expiresAt, "expired");
  return lease;
}

export interface Reservation {
  handle: string;
  binding: Binding;
  fingerprint: string;
  artifactDigest: string;
  now: number;
  expiresAt: number;
  worstCaseMinor: number;
  limits: Limits;
}

/** Implementations MUST enforce these conditions transactionally across processes.
 * No default implementation is supplied by policy. See ADAPTER-CONTRACTS.md.
 */
export interface DurableState {
  get(handle: string): Promise<Lease | null>;
  reserve(input: Reservation): Promise<Lease>;
  transition(handle: string, from: Lifecycle[], to: Lifecycle): Promise<void>;
  recoverable(): Promise<Lease[]>;
}

export interface ApprovalTarget {
  binding: Binding;
  operation: Operation;
  toolVersion: "1";
  policyVersion: "1";
  handle: string;
  argumentsHash: string;
}
export interface ApprovalAuthority {
  /** Verify authenticated authority, revocation, issuance/expiry and exact target;
   * atomically consume one grant. A boolean caller argument is never a grant.
   */
  consume(reference: string | undefined, target: ApprovalTarget, now: number): Promise<boolean>;
}

export interface AuditRecord {
  event: string;
  time: number;
  bindingHash: string;
  operation: Operation | "unknown";
  phase: Phase;
  decision: Decision;
  policyVersion: "1";
}
export interface DurableAudit {
  append(record: AuditRecord): Promise<void>;
}
export interface Host {
  /** Must resolve trusted, current authenticated assignment. Never read identity
   * or approval references from model arguments. Unavailable/revoked => null.
   */
  identity(): Promise<Binding | null>;
  approvalReference(): string | undefined;
  clock(): number;
  secrets: { resolve(reference: string): Promise<string> };
}

export interface CleanupCoordinator {
  /** Independent durable scheduler runs at expiry and on completion/cancellation,
   * plus an orphan sweep. Claim/fence each lease; revoke internal credentials,
   * reconcile ambiguous children, verify complete removal, then release budget.
   * On outages retain evidence, retry within bounds and escalate. Never prefix-sweep.
   */
  enqueueOwned(lease: Lease, cause: "expiry" | "completion" | "cancellation" | "orphan"): Promise<void>;
}
