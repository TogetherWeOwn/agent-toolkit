import { closed, identifier, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonOrganizationMemberUpdateScope {
  readonly organizationId: string;
  readonly memberId: string;
  readonly userId: string;
  readonly expectedRole: "member" | "editor";
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9-]+$/);
const uuid = text(36, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
const expectedRole = oneOf(["member", "editor"] as const);
const argumentsSchema = closed({ org_id: pathId, member_id: uuid });

// Source only. Role acknowledgement is not independent effective-access proof.
export function createNeonOrganizationMemberUpdateOperations(scope: NeonOrganizationMemberUpdateScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ organizationId: pathId, memberId: uuid, userId: uuid, expectedRole, revision: identifier }).parse(scope);
  const resourceId = `neon/organizations/${config.organizationId}/members/${config.memberId}/role/viewer`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.org_id === config.organizationId && args.member_id === config.memberId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "updateOrganizationMember", ...args, user_id: config.userId, expected_role: config.expectedRole,
        effect: "request_organization_member_viewer_role", preflight: "exact_member_user_organization_role",
        reconciliation: "one_member_detail_observation_no_retry", completion: "acknowledgement_only",
        diff: { before: { role: config.expectedRole }, after: { role: "viewer" } },
        effectiveAccessVerified: false, sessionRevocationVerified: false, connectionFence: false }, artifactDigest: null };
  }
  function member(raw: unknown, role: string): void {
    check(uuid.parse(field(raw, "id")) === config.memberId && uuid.parse(field(raw, "user_id")) === config.userId &&
      pathId.parse(field(raw, "org_id")) === config.organizationId && field(raw, "role") === role);
    for (const key of ["project_id", "branch_id", "pagination"]) check(optional(raw, key) === undefined);
    // Profile fields and joined_at are never evaluated. Provider owns role availability.
  }
  function receipt(raw: unknown): Json {
    member(raw, "viewer");
    return { member_id: config.memberId, acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.updateOrganizationMember", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<unknown> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const raw = await transport.getOrganizationMember(config.organizationId, config.memberId, options);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      }
      member(await observe(), config.expectedRole);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.updateOrganizationMember(config.organizationId, config.memberId, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        if (!signal.aborted) { try { member(await observe(), "viewer"); } catch { /* Desired state is not causal update evidence. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
