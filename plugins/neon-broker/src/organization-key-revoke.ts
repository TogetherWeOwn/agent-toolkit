import { closed, identifier, integer, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const ORGANIZATION_KEY_REVOKE_OPERATIONS = ["revokeOrgApiKey"] as const;
export interface NeonOrganizationKeyRevokeScope {
  readonly organizationId: string;
  readonly keyId: number;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9-]+$/);
const keyId = integer(0, Number.MAX_SAFE_INTEGER);
const argumentsSchema = closed({ org_id: pathId, key_id: keyId });

// Source only; numeric IDs are not tokens and the acknowledgement is not a session fence.
export function createNeonOrganizationKeyRevokeOperations(scope: NeonOrganizationKeyRevokeScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ organizationId: pathId, keyId, revision: identifier }).parse(scope);
  const resourceId = `neon/organizations/${config.organizationId}/api_keys/${config.keyId}/revoke`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.org_id === config.organizationId && args.key_id === config.keyId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "revokeOrgApiKey", ...args, effect: "request_organization_api_key_revocation",
        preflight: "bounded_organization_key_id_presence", reconciliation: "bounded_organization_key_list_observation_no_retry",
        diff: { before: "selected_organization_key_present", after: "revocation_requested" }, completion: "acknowledgement_only",
        connectionFence: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    const organization = optional(raw, "org_id");
    check(organization === undefined || organization === config.organizationId);
    for (const key of ["user_id", "branch_id", "pagination"]) check(optional(raw, key) === undefined);
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
    check(keyId.parse(field(raw, "id")) === config.keyId && field(raw, "revoked") === true);
    // Project scope, names, creator, addresses, usage and credential fields are never evaluated.
    return { id: config.keyId, acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.revokeOrgApiKey", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        keys(await transport.listOrgApiKeys(config.organizationId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.revokeOrgApiKey(config.organizationId, config.keyId, options);
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
