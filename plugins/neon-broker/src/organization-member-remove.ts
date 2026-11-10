import { closed, identifier, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const ORGANIZATION_MEMBER_REMOVE_OPERATIONS = ["removeOrganizationMember"] as const;
export interface NeonOrganizationMemberRemoveScope {
  readonly organizationId: string;
  readonly memberId: string;
  readonly userId: string;
  readonly expectedRole: "admin" | "member" | "editor" | "viewer" | "collaborator";
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9-]+$/);
const uuid = text(36, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
const role = oneOf(["admin", "member", "editor", "viewer", "collaborator"] as const);
const argumentsSchema = closed({ org_id: pathId, member_id: uuid });

// Source only; an empty acknowledgement is not independent access-removal proof.
export function createNeonOrganizationMemberRemoveOperations(scope: NeonOrganizationMemberRemoveScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ organizationId: pathId, memberId: uuid, userId: uuid, expectedRole: role, revision: identifier }).parse(scope);
  const resourceId = `neon/organizations/${config.organizationId}/members/${config.memberId}/remove`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.org_id === config.organizationId && args.member_id === config.memberId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "removeOrganizationMember", ...args, user_id: config.userId, expected_role: config.expectedRole,
        effect: "request_organization_member_removal", preflight: "exact_member_user_organization_role",
        reconciliation: "bounded_member_detail_observation_no_retry",
        diff: { before: "selected_organization_member_present", after: "removal_requested" },
        completion: "acknowledgement_only", connectionFence: false }, artifactDigest: null };
  }
  function member(raw: unknown): void {
    check(uuid.parse(field(raw, "id")) === config.memberId && uuid.parse(field(raw, "user_id")) === config.userId &&
      pathId.parse(field(raw, "org_id")) === config.organizationId && role.parse(field(raw, "role")) === config.expectedRole);
    for (const key of ["project_id", "branch_id", "pagination"]) check(optional(raw, key) === undefined);
    // Profile fields and joined_at are not evaluated. Provider enforces last-admin constraints.
  }
  function receipt(raw: unknown): Json {
    closed({}).parse(raw);
    return { member_id: config.memberId, acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.removeOrganizationMember", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        member(await transport.getOrganizationMember(config.organizationId, config.memberId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.removeOrganizationMember(config.organizationId, config.memberId, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Absence cannot establish causal removal, effective access or session closure.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
