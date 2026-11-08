import { closed, identifier, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { boolean, check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const REGION_OPERATIONS = ["getActiveRegions"] as const;
export interface NeonRegionScope {
  readonly organizationId: string;
  readonly revision: string;
  readonly regionIds: readonly string[];
}
const pathId = text(60, /^[a-z0-9-]+$/);
const regionId = text(80, /^(aws|azure)-[a-z0-9]+(?:-[a-z0-9]+)*$/);
const argumentsSchema = closed({ org_id: pathId });

export function createNeonRegionOperations(scope: NeonRegionScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ organizationId: pathId, revision: identifier,
    regionIds: { parse: (value: unknown) => rows(value, 30).map(row => regionId.parse(row)) },
  }).parse(scope);
  const selected = new Set(config.regionIds);
  check(selected.size === config.regionIds.length);
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.org_id !== config.organizationId) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/organizations/${config.organizationId}/regions`, revision: config.revision },
      arguments: args, plan: { operation: REGION_OPERATIONS[0], ...args }, artifactDigest: null };
  }
  function project(raw: unknown): Json {
    const org = optional(raw, "org_id");
    check(org === undefined || org === config.organizationId);
    check(optional(raw, "project_id") === undefined && optional(raw, "branch_id") === undefined);
    check(optional(raw, "pagination") === undefined);
    const seen = new Set<string>();
    const regions = rows(field(raw, "regions"), 30).map(row => {
      const id = regionId.parse(field(row, "region_id"));
      check(!seen.has(id));
      seen.add(id);
      const organization = optional(row, "org_id");
      check(organization === undefined || organization === config.organizationId);
      check(optional(row, "project_id") === undefined && optional(row, "branch_id") === undefined);
      return { region_id: id, default: boolean(field(row, "default")) };
    });
    return { regions: regions.filter(row => selected.has(row.region_id)) };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${REGION_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = await transport.getActiveRegions(config.organizationId, { credential, signal });
      project(raw);
      return raw;
    },
    project,
  })]);
}
