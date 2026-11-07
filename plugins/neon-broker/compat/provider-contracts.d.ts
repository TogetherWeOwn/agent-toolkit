// Type-only excerpt from packages/core/src/provider/contracts.ts at
// 3ce5639db8ebd7d1d2d77e69b28761bd044b6ca3 (PR #17). No runtime core fork.
// The Actions compatibility check verifies these declarations against that source.
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
export type Tier = "read" | "write" | "reserved";
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
