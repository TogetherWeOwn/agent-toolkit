import { closed, identifier, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS } from "./metadata.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const LOG_FIELD_OPERATIONS = ["listProjectBranchLogFields"] as const;
export interface NeonLogFieldScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly revision: string;
  readonly fieldNames: readonly string[];
}
const pathId = text(60, /^[a-z0-9-]+$/);
const fieldName = text(80, /^[\x20-\x7e]+$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId });

export function createNeonLogFieldOperations(scope: NeonLogFieldScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, revision: identifier,
    fieldNames: { parse: (v: unknown) => rows(v, MAX_ITEMS).map(value => fieldName.parse(value)) },
  }).parse(scope);
  const fields = new Set(config.fieldNames);
  check(fields.size === config.fieldNames.length);
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.project_id !== config.projectId || args.branch_id !== config.branchId) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/projects/${config.projectId}/branches/${config.branchId}/logs/fields`, revision: config.revision },
      arguments: args, plan: { operation: LOG_FIELD_OPERATIONS[0], ...args }, artifactDigest: null };
  }
  function project(raw: unknown): Json {
    check(optional(raw, "pagination") === undefined);
    const projectId = optional(raw, "project_id");
    const branchId = optional(raw, "branch_id");
    check(projectId === undefined || projectId === config.projectId);
    check(branchId === undefined || branchId === config.branchId);
    const seen = new Set<string>();
    const selected = rows(field(raw, "fields"), MAX_ITEMS).flatMap(value => {
      const name = fieldName.parse(value);
      check(!seen.has(name));
      seen.add(name);
      return fields.has(name) ? [name] : [];
    });
    return { fields: selected };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${LOG_FIELD_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = await transport.listProjectBranchLogFields(config.projectId, config.branchId, { credential, signal });
      // The response has no identity: the fixed request binds it; contradictory extras refuse.
      project(raw);
      return raw;
    },
    project,
  })]);
}
