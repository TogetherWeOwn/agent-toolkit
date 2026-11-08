import { closed, identifier, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS } from "./metadata.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const ORGANIZATION_INVITATION_OPERATIONS = ["getOrganizationInvitations"] as const;
export const MAX_ORGANIZATION_INVITATION_BINDINGS = 16;
export interface NeonOrganizationInvitationScope {
  readonly organizationId: string;
  readonly revision: string;
  readonly invitationIds: readonly string[];
}
const pathId = text(60, /^[a-z0-9-]+$/);
const uuid = text(36, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
const argumentsSchema = closed({ org_id: pathId });
const role = oneOf(["admin", "member", "editor", "viewer", "collaborator"] as const);

export function createNeonOrganizationInvitationOperations(scope: NeonOrganizationInvitationScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ organizationId: pathId, revision: identifier,
    invitationIds: { parse: (v: unknown) => rows(v, MAX_ORGANIZATION_INVITATION_BINDINGS).map(value => uuid.parse(value)) },
  }).parse(scope);
  const invitations = new Set(config.invitationIds);
  check(invitations.size === config.invitationIds.length);
  const resource = `neon/organizations/${config.organizationId}/invitations`;
  function parse(raw: unknown): { org_id: string } {
    const args = argumentsSchema.parse(raw);
    if (args.org_id !== config.organizationId) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: resource, revision: config.revision }, arguments: args,
      plan: { operation: "getOrganizationInvitations", ...args }, artifactDigest: null };
  }
  function identity(raw: unknown): void {
    const org = optional(raw, "org_id");
    check(org === undefined || org === config.organizationId);
    check(optional(raw, "project_id") === undefined && optional(raw, "branch_id") === undefined);
    check(optional(raw, "pagination") === undefined);
  }
  function project(raw: unknown): Json {
    identity(raw);
    const seen = new Set<string>();
    const selected = rows(field(raw, "invitations"), MAX_ITEMS).flatMap(value => {
      identity(value);
      const result = { id: uuid.parse(field(value, "id")), org_id: pathId.parse(field(value, "org_id")),
        role: role.parse(field(value, "role")) };
      check(!seen.has(result.id));
      seen.add(result.id);
      return invitations.has(result.id) ? [result] : [];
    });
    return { invitations: selected };
  }
  return Object.freeze([Object.freeze({
    name: "neon.getOrganizationInvitations", version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = await transport.getOrganizationInvitations(config.organizationId, { credential, signal });
      project(raw);
      return raw;
    },
    project,
  })]);
}
