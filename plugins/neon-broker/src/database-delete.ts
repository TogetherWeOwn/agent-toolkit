import { closed, integer, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const DATABASE_DELETE_OPERATIONS = ["deleteProjectBranchDatabase"] as const;
export interface NeonDatabaseDeleteScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly databaseName: string;
  readonly databaseId: number;
  readonly revision: string;
}
const projectId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const branchId = text(60, /^br-[a-z0-9][a-z0-9-]*$/);
const databaseName = text(63, /^[A-Za-z_][A-Za-z0-9_-]*$/);
const databaseId = integer(1, Number.MAX_SAFE_INTEGER);
const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const argumentsSchema = closed({ project_id: projectId, branch_id: branchId, database_name: databaseName });
const operationId = text(36, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const status = oneOf(["scheduling", "running", "finished", "failed", "error", "cancelling", "cancelled", "skipped"]);

// Source only. Names are mutable; preflight also binds the copied numeric database ID.
export function createNeonDatabaseDeleteOperations(scope: NeonDatabaseDeleteScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId, branchId, databaseName, databaseId, revision }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/databases/${config.databaseName}/delete`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.database_name === config.databaseName);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "deleteProjectBranchDatabase", ...args, database_id: config.databaseId, effect: "request_database_deletion",
        preflight: "exact_database_id_name_and_branch", reconciliation: "bounded_database_observation_no_retry",
        diff: { before: "selected_database", after: "deletion_requested" }, completion: "acknowledgement_only",
        connectionFence: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    for (const [key, expected] of [["project_id", config.projectId], ["branch_id", config.branchId],
      ["database_name", config.databaseName], ["database_id", config.databaseId]] as const) {
      const value = optional(raw, key);
      check(value === undefined || value === expected);
    }
    check(optional(raw, "pagination") === undefined);
  }
  function bound(raw: unknown): void {
    ancestry(raw);
    const database = field(raw, "database");
    ancestry(database);
    check(field(database, "id") === config.databaseId && field(database, "name") === config.databaseName &&
      field(database, "branch_id") === config.branchId);
  }
  function receipt(raw: unknown): Json {
    bound(raw);
    const seen = new Set<string>();
    const operations = rows(field(raw, "operations"), 30).map(value => {
      ancestry(value);
      const id = operationId.parse(field(value, "id"));
      check(field(value, "project_id") === config.projectId && !seen.has(id));
      seen.add(id);
      return { id, status: status.parse(field(value, "status")) };
    });
    return { id: config.databaseId, branch_id: config.branchId, acknowledged: true, operations };
  }
  return Object.freeze([Object.freeze({
    name: "neon.deleteProjectBranchDatabase", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        bound(await transport.getProjectBranchDatabase(config.projectId, config.branchId, config.databaseName, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.deleteProjectBranchDatabase(config.projectId, config.branchId, config.databaseName, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Absence or name reuse after a lost response proves neither causation nor completion.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
