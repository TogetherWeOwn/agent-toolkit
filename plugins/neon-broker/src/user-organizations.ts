import { closed, identifier, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const USER_ORGANIZATION_OPERATIONS = ["getCurrentUserOrganizations"] as const;
export interface NeonUserOrganizationScope {
  readonly userId: string;
  readonly revision: string;
  readonly organizationIds: readonly string[];
}
const organizationId = text(60, /^[a-z0-9-]+$/);
const argumentsSchema = closed({ user_id: identifier });

export function createNeonUserOrganizationOperations(scope: NeonUserOrganizationScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ userId: identifier, revision: identifier,
    organizationIds: { parse: (value: unknown) => rows(value, 30).map(row => organizationId.parse(row)) },
  }).parse(scope);
  const selected = new Set(config.organizationIds);
  check(selected.size === config.organizationIds.length);
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.user_id !== config.userId) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/users/${config.userId}/organizations`, revision: config.revision },
      arguments: args, plan: { operation: USER_ORGANIZATION_OPERATIONS[0], ...args }, artifactDigest: null };
  }
  function user(raw: unknown): void {
    check(identifier.parse(field(raw, "id")) === config.userId);
    check(optional(raw, "pagination") === undefined);
  }
  function ancestry(raw: unknown): void {
    const id = optional(raw, "user_id");
    check(id === undefined || id === config.userId);
    check(optional(raw, "project_id") === undefined && optional(raw, "branch_id") === undefined);
    check(optional(raw, "pagination") === undefined);
  }
  function project(raw: unknown): Json {
    user(field(raw, "user"));
    const catalog = field(raw, "catalog");
    ancestry(catalog);
    check(optional(raw, "pagination") === undefined);
    const seen = new Set<string>();
    const organizations = rows(field(catalog, "organizations"), 30).map(row => {
      ancestry(row);
      const id = organizationId.parse(field(row, "id"));
      const org = optional(row, "org_id");
      check(org === undefined || org === id);
      check(!seen.has(id));
      seen.add(id);
      return { id };
    });
    return { organizations: organizations.filter(row => selected.has(row.id)) };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${USER_ORGANIZATION_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const options = { credential, signal };
      // Organization/project keys may return an owning org without a user. Prove
      // /users/me first with this same credential; never infer a user from an org.
      const identity = await transport.getCurrentUserInfo(options);
      user(identity);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = { user: identity, catalog: await transport.getCurrentUserOrganizations(options) };
      project(raw);
      return raw;
    },
    project,
  })]);
}
