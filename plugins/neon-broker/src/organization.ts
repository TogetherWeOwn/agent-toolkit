import { closed, identifier, integer, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { boolean, check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const ORGANIZATION_OPERATIONS = ["getOrganization", "getOrganizationSpendingLimit"] as const;
type OrganizationOperation = typeof ORGANIZATION_OPERATIONS[number];
export interface NeonOrganizationScope {
  readonly organizationId: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9-]+$/);
const argumentsSchema = closed({ org_id: pathId });

export function createNeonOrganizationOperations(scope: NeonOrganizationScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ organizationId: pathId, revision: identifier }).parse(scope);
  const root = `neon/organizations/${config.organizationId}`;
  function parse(raw: unknown): { org_id: string } {
    const args = argumentsSchema.parse(raw);
    if (args.org_id !== config.organizationId) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepareFor(name: OrganizationOperation, raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: name === "getOrganization" ? root : `${root}/billing/spending_limit`, revision: config.revision },
      arguments: args, plan: { operation: name, ...args }, artifactDigest: null };
  }
  function projectFor(name: OrganizationOperation, raw: unknown): Json {
    const org = optional(raw, "org_id");
    check(org === undefined || org === config.organizationId);
    check(optional(raw, "project_id") === undefined && optional(raw, "branch_id") === undefined);
    check(optional(raw, "pagination") === undefined);
    if (name === "getOrganizationSpendingLimit") {
      const cents = field(raw, "spending_limit_cents");
      return { spending_limit_cents: cents === null ? null : integer(0, Number.MAX_SAFE_INTEGER).parse(cents) };
    }
    const id = pathId.parse(field(raw, "id"));
    check(id === config.organizationId);
    const output: Record<string, Json> = { id };
    for (const key of ["require_mfa", "allow_hipaa_projects"]) {
      const value = optional(raw, key);
      if (value !== undefined) output[key] = boolean(value);
    }
    return output;
  }
  return Object.freeze(ORGANIZATION_OPERATIONS.map(name => Object.freeze({
    name: `neon.${name}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare(raw: unknown): Prepared { return prepareFor(name, raw); },
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepareFor(name, args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const options = { credential, signal };
      const raw = name === "getOrganization" ? await transport.getOrganization(config.organizationId, options) :
        await transport.getOrganizationSpendingLimit(config.organizationId, options);
      projectFor(name, raw);
      return raw;
    },
    project(raw: unknown): Json { return projectFor(name, raw); },
  })));
}
