export const PROVIDER_CONTRACT = "toolkit.provider-broker/v1" as const;
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
export type Tier = "read" | "write" | "reserved";
export type ProviderCode = "INVALID_ARGUMENTS" | "UNKNOWN_TOOL" | "IDENTITY_UNAVAILABLE" |
  "POLICY_DENIED" | "POLICY_CHANGED" | "RESOURCE_CHANGED" | "AUTHORIZATION_UNAVAILABLE" |
  "AUTHORIZATION_DENIED" | "REPLAY_CONFLICT" | "AUDIT_UNAVAILABLE" | "DEPENDENCY_UNAVAILABLE" |
  "CREDENTIAL_UNAVAILABLE" | "OUTPUT_REFUSED" | "UPSTREAM_UNAVAILABLE" | "OUTCOME_UNCERTAIN";

export interface Principal {
  readonly company: string;
  readonly agent: string;
  readonly project: string;
  readonly task: string;
  readonly run: string;
}
export interface Resource {
  readonly id: string;
  readonly revision: string;
}
export interface Prepared {
  readonly resource: Resource;
  readonly arguments: Json;
  /** An accurate validated plan, not a provider dry-run unless the provider supports it. */
  readonly plan: Json;
  readonly artifactDigest: string | null;
}
export interface ProviderOperation {
  readonly name: string;
  readonly version: string;
  readonly tier: Tier;
  readonly timeoutMs: number;
  /** Creators must provide an accepted DurableState/cleanup integration, separately. */
  readonly lifecycle: "none" | "managed";
  prepare(raw: unknown): Prepared;
  /** Must enforce exact resource revision/provider preconditions, fixed egress,
   * pagination/response bounds, no redirects and no automatic mutation retries.
   * Managed creators reserve TTL/spend and durable cleanup before provisioning.
   */
  execute(prepared: Prepared, credential: string, signal: AbortSignal, requestKey: string): Promise<unknown>;
  project(raw: unknown): Json;
}
export interface PolicySnapshot {
  readonly revision: string;
  readonly agents: readonly string[];
  readonly resources: readonly string[];
}
export interface AuthorizationTarget {
  readonly contract: typeof PROVIDER_CONTRACT;
  readonly provider: string;
  readonly tool: string;
  readonly version: string;
  readonly tier: Tier;
  readonly principal: Principal;
  readonly resource: Resource;
  readonly argumentsHash: string;
  readonly planHash: string;
  readonly artifactDigest: string | null;
  readonly policyRevision: string;
}
export interface NativeEvidence {
  readonly reference: string;
  readonly targetHash: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}
export interface NativeAuthority {
  /** Reads authenticated native authority from host context, never model arguments.
   * Must check approval outcome, issuer, current revocation and exact target.
   * There is deliberately no production/default grant issuer in this library.
   */
  verify(target: AuthorizationTarget, runtimeContext: unknown): Promise<NativeEvidence | null>;
  /** Reverify and atomically consume once across processes; reject concurrent/replay. */
  consume(evidence: NativeEvidence, target: AuthorizationTarget, now: number): Promise<boolean>;
}
export interface ProviderAuditRecord {
  readonly event: string;
  readonly time: number;
  readonly phase: "refused" | "intent" | "outcome";
  readonly decision: "ALLOW" | ProviderCode;
  readonly contract: typeof PROVIDER_CONTRACT;
  readonly provider: string;
  readonly tool: string | null;
  readonly principalHash: string | null;
  readonly targetHash: string | null;
}
export interface CredentialLease {
  /** At least five UTF-8 bytes, allowing an embedded base64 core at every alignment. */
  readonly value: string;
  /** Include every internal derived credential (also at least five UTF-8 bytes);
   * common encodings are refused too. Short values refuse the lease before execution.
   */
  readonly redactions: readonly string[];
  /** Revoke attenuated credentials and verify cleanup; never throw raw diagnostics. */
  close(): Promise<void>;
}
export interface ProviderDependencies {
  readonly provider: string;
  readonly operations: readonly ProviderOperation[];
  readonly host: {
    authenticate(runtimeContext: unknown): Promise<Principal | null>;
    /** Current company/project/task ownership and resource revision; not a name prefix. */
    revalidate(principal: Principal, resource: Resource): Promise<boolean>;
  };
  readonly policy: {
    read(principal: Principal, tool: string): Promise<PolicySnapshot>;
  };
  readonly authority: NativeAuthority | null;
  readonly journal: {
    /** Atomically bind key to target and exclude replay across workers. Never expire
     * uncertain claims without proven quiescence/provider fencing. Persist before effects.
     * Request identity excludes run so restart under a new run cannot repeat a write.
     */
    claim(key: string, targetHash: string, event: string): Promise<boolean>;
    /** Persist outcome without removing the permanent idempotency tombstone. An
     * uncertain entry requires reconciliation; completion does not authorize retry.
     */
    finish(key: string, event: string, outcome: "complete" | "refused" | "uncertain"): Promise<void>;
  };
  readonly audit: { append(record: ProviderAuditRecord): Promise<void> };
  readonly credentials: { resolve(target: AuthorizationTarget): Promise<CredentialLease> };
  readonly clock: () => number;
}
export type ProviderResult = { readonly ok: true; readonly value: Json; readonly event: string } |
  { readonly ok: false; readonly code: ProviderCode; readonly event: string };
