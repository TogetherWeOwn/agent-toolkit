import { closed, identifier, integer, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const PROJECT_COUNT_OPERATIONS = ["countProjects"] as const;
export interface NeonProjectCountScope {
  readonly organizationId: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9-]+$/);
const argumentsSchema = closed({ org_id: pathId });

export function createNeonProjectCountOperations(scope: NeonProjectCountScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ organizationId: pathId, revision: identifier }).parse(scope);
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.org_id !== config.organizationId) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/organizations/${config.organizationId}/projects/count`, revision: config.revision },
      arguments: args, plan: { operation: PROJECT_COUNT_OPERATIONS[0], ...args }, artifactDigest: null };
  }
  function project(raw: unknown): Json {
    const org = optional(raw, "org_id");
    check(org === undefined || org === config.organizationId);
    check(optional(raw, "project_id") === undefined && optional(raw, "branch_id") === undefined);
    check(optional(raw, "pagination") === undefined);
    return { count: integer(0, Number.MAX_SAFE_INTEGER).parse(field(raw, "count")) };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${PROJECT_COUNT_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = await transport.countProjects(config.organizationId, { credential, signal });
      project(raw);
      return raw;
    },
    project,
  })]);
}
