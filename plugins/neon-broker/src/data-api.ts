import { closed, identifier, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const DATA_API_OPERATIONS = ["getProjectBranchDataAPI"] as const;
export interface NeonDataAPIScope {
  readonly projectId: string;
  readonly revision: string;
  readonly databases: readonly { readonly branchId: string; readonly name: string }[];
}
const pathId = text(60, /^[a-z0-9-]+$/);
const databaseName = text(63, /^[A-Za-z_][A-Za-z0-9_-]*$/);
const status = text(64, /^[a-z][a-z0-9_-]*$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, database_name: databaseName });

export function createNeonDataAPIOperations(scope: NeonDataAPIScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, revision: identifier,
    databases: { parse: (value: unknown) => rows(value, 30).map(row => closed({ branchId: pathId, name: databaseName }).parse(row)) },
  }).parse(scope);
  const databases = new Set(config.databases.map(row => `${row.branchId}/${row.name}`));
  check(databases.size === config.databases.length);
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.project_id !== config.projectId || !databases.has(`${args.branch_id}/${args.database_name}`)) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/projects/${config.projectId}/branches/${args.branch_id}/data-api/${args.database_name}`, revision: config.revision },
      arguments: args, plan: { operation: DATA_API_OPERATIONS[0], ...args }, artifactDigest: null };
  }
  function project(raw: unknown): Json {
    check(optional(raw, "pagination") === undefined);
    const projectId = optional(raw, "project_id");
    const branchId = optional(raw, "branch_id");
    const name = optional(raw, "database_name");
    check(projectId === undefined || projectId === config.projectId);
    check(branchId === undefined || config.databases.some(row => row.branchId === branchId));
    check(name === undefined || config.databases.some(row => row.name === name && (branchId === undefined || row.branchId === branchId)));
    return { status: status.parse(field(raw, "status")) };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${DATA_API_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = await transport.getProjectBranchDataAPI(config.projectId, args.branch_id, args.database_name, { credential, signal });
      const branchId = optional(raw, "branch_id");
      const name = optional(raw, "database_name");
      check(branchId === undefined || branchId === args.branch_id);
      check(name === undefined || name === args.database_name);
      project(raw);
      return raw;
    },
    project,
  })]);
}
