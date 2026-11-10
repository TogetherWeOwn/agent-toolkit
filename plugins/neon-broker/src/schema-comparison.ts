import { closed, identifier, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const SCHEMA_COMPARISON_OPERATIONS = ["getProjectBranchSchemaComparison"] as const;
export const SCHEMA_DIFF_BYTES = 16_384;
export interface NeonSchemaComparisonScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly baseBranchId: string;
  readonly databaseName: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9-]+$/);
const catalogName = text(63, /^[A-Za-z_][A-Za-z0-9_-]*$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, base_branch_id: pathId, db_name: catalogName });

export function createNeonSchemaComparisonOperations(scope: NeonSchemaComparisonScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, baseBranchId: pathId,
    databaseName: catalogName, revision: identifier }).parse(scope);
  check(config.branchId !== config.baseBranchId);
  const resource = text(256, /^[A-Za-z0-9_/-]+$/).parse(
    `neon/projects/${config.projectId}/branches/${config.branchId}/databases/${config.databaseName}/schema-comparison/${config.baseBranchId}`);
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.project_id !== config.projectId || args.branch_id !== config.branchId ||
      args.base_branch_id !== config.baseBranchId || args.db_name !== config.databaseName) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: resource, revision: config.revision }, arguments: args,
      plan: { operation: SCHEMA_COMPARISON_OPERATIONS[0], ...args }, artifactDigest: null };
  }
  function project(raw: unknown): Json {
    check(optional(raw, "pagination") === undefined);
    for (const [name, expected] of [["project_id", config.projectId], ["branch_id", config.branchId],
      ["base_branch_id", config.baseBranchId], ["db_name", config.databaseName], ["database_name", config.databaseName]] as const) {
      const value = optional(raw, name);
      check(value === undefined || value === expected);
    }
    const diff = field(raw, "diff");
    check(typeof diff === "string" && Buffer.byteLength(diff, "utf8") <= SCHEMA_DIFF_BYTES &&
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ud800-\udfff]/u.test(diff));
    // Observe nonempty provider output, not SQL semantics or schema equivalence.
    return { has_diff: diff.length !== 0 };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${SCHEMA_COMPARISON_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = await transport.getProjectBranchSchemaComparison(config.projectId, config.branchId, config.baseBranchId,
        config.databaseName, { credential, signal });
      project(raw);
      return raw;
    },
    project,
  })]);
}
