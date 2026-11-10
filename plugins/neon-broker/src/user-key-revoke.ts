import { closed, identifier, integer, jsonData } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const USER_KEY_REVOKE_OPERATIONS = ["revokeApiKey"] as const;
export interface NeonUserKeyRevokeScope {
  readonly userId: string;
  readonly keyId: number;
  readonly revision: string;
}
const keyId = integer(0, Number.MAX_SAFE_INTEGER);
const argumentsSchema = closed({ user_id: identifier, key_id: keyId });

// Source only; numeric IDs are not tokens and the acknowledgement is not a session fence.
export function createNeonUserKeyRevokeOperations(scope: NeonUserKeyRevokeScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ userId: identifier, keyId, revision: identifier }).parse(scope);
  const resourceId = `neon/users/${config.userId}/api_keys/${config.keyId}/revoke`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.user_id === config.userId && args.key_id === config.keyId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "revokeApiKey", ...args, effect: "request_api_key_revocation",
        preflight: "same_credential_exact_user_then_bounded_key_id_presence", reconciliation: "bounded_key_list_observation_no_retry",
        diff: { before: "selected_user_key_present", after: "revocation_requested" }, completion: "acknowledgement_only",
        connectionFence: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    const user = optional(raw, "user_id");
    check(user === undefined || user === config.userId);
    for (const key of ["org_id", "project_id", "branch_id", "pagination"]) check(optional(raw, key) === undefined);
  }
  function user(raw: unknown): void {
    ancestry(raw);
    check(identifier.parse(field(raw, "id")) === config.userId);
  }
  function keys(raw: unknown): void {
    const seen = new Set<number>();
    for (const value of rows(raw, 30)) {
      ancestry(value);
      const id = keyId.parse(field(value, "id"));
      check(!seen.has(id));
      seen.add(id);
    }
    check(seen.has(config.keyId));
  }
  function receipt(raw: unknown): Json {
    ancestry(raw);
    user(field(raw, "user"));
    const result = field(raw, "revocation");
    ancestry(result);
    check(keyId.parse(field(result, "id")) === config.keyId && field(result, "revoked") === true);
    // Names, creator, addresses, usage and unexpected credential fields are never evaluated.
    return { id: config.keyId, acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.revokeApiKey", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 4500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const identity = await transport.getCurrentUserInfo(options);
      user(identity);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        keys(await transport.listApiKeys(options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = { user: identity, revocation: await transport.revokeApiKey(config.keyId, options) };
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Absence or a present key does not prove a causal revoke or effective enforcement.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
