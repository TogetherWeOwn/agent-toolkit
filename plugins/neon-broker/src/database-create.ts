import { closed, integer, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { databaseUpdateName as databaseName } from "./database-update.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonDatabaseCreateScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly databaseName: string;
  readonly ownerName: string;
  readonly revision: string;
}
const projectId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const branchId = text(60, /^br-[a-z0-9][a-z0-9-]*$/);
const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const databaseId = integer(1, Number.MAX_SAFE_INTEGER);
const argumentsSchema = closed({ project_id: projectId, branch_id: branchId, database_name: databaseName, owner_name: databaseName });
const operationId = text(36, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const status = oneOf(["scheduling", "running", "finished", "failed", "error", "cancelling", "cancelled", "skipped"]);

// Source only. Absence preflight cannot make name-keyed creation atomic.
export function createNeonDatabaseCreateOperations(scope: NeonDatabaseCreateScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId, branchId, databaseName, ownerName: databaseName, revision }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/databases/${config.databaseName}/create`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId &&
      args.database_name === config.databaseName && args.owner_name === config.ownerName);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "createProjectBranchDatabase", ...args, effect: "request_database_creation",
        preflight: "bounded_database_list_absence", atomicCompareAndSwap: false,
        diff: { before: "selected_database_absent", after: { name: config.databaseName, owner_name: config.ownerName } },
        reconciliation: "one_database_list_observation_no_retry", completion: "acknowledgement_only",
        persistenceVerified: false, accessEnforcementVerified: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    for (const [key, expected] of [["project_id", config.projectId], ["branch_id", config.branchId]] as const) {
      const value = optional(raw, key);
      check(value === undefined || value === expected);
    }
    check(optional(raw, "pagination") === undefined);
  }
  function present(raw: unknown): boolean {
    ancestry(raw);
    const names = new Set<string>();
    const ids = new Set<number>();
    for (const value of rows(field(raw, "databases"), 30)) {
      ancestry(value);
      check(field(value, "branch_id") === config.branchId);
      const name = text(63, /^[\x20-\x7e]+$/).parse(field(value, "name"));
      const id = databaseId.parse(field(value, "id"));
      check(!names.has(name) && !ids.has(id));
      names.add(name);
      ids.add(id);
      // Owner metadata and timestamps are not needed to establish name absence.
    }
    return names.has(config.databaseName);
  }
  function receipt(raw: unknown): Json {
    ancestry(raw);
    const database = field(raw, "database");
    ancestry(database);
    check(field(database, "branch_id") === config.branchId && field(database, "name") === config.databaseName &&
      field(database, "owner_name") === config.ownerName);
    const id = databaseId.parse(field(database, "id"));
    const seen = new Set<string>();
    const operations = rows(field(raw, "operations"), 30).map(value => {
      ancestry(value);
      const id = operationId.parse(field(value, "id"));
      check(field(value, "project_id") === config.projectId && !seen.has(id));
      seen.add(id);
      return { id, status: status.parse(field(value, "status")) };
    });
    return { id, branch_id: config.branchId, acknowledged: true, operations };
  }
  return Object.freeze([Object.freeze({
    name: "neon.createProjectBranchDatabase", version: "1.0.0", tier: "write" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<boolean> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const found = present(await transport.listProjectBranchDatabases(config.projectId, config.branchId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return found;
      }
      check(await observe() === false);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.createProjectBranchDatabase(config.projectId, config.branchId, config.databaseName, config.ownerName, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        if (!signal.aborted) { try { await observe(); } catch { /* Presence is not causal creation evidence. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
