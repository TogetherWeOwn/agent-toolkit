import { closed, identifier, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const BRANCH_SCHEMA_OPERATIONS = ["getProjectBranchSchema"] as const;
export interface NeonSchemaColumnSelection {
  readonly schema_name: string;
  readonly table_name: string;
  readonly column_name: string;
}
export interface NeonBranchSchemaScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly databaseName: string;
  readonly revision: string;
  readonly columns: readonly NeonSchemaColumnSelection[];
}
const pathId = text(60, /^[a-z0-9-]+$/);
const catalogName = text(63, /^[A-Za-z_][A-Za-z0-9_-]*$/);
const selectionSchema = closed({ schema_name: catalogName, table_name: catalogName, column_name: catalogName });
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, db_name: catalogName });
function key(column: NeonSchemaColumnSelection): string {
  return JSON.stringify([column.schema_name, column.table_name, column.column_name]);
}

export function createNeonBranchSchemaOperations(scope: NeonBranchSchemaScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, databaseName: catalogName, revision: identifier,
    columns: { parse: (v: unknown) => rows(v, 30).map(value => selectionSchema.parse(value)) },
  }).parse(scope);
  const selected = new Set(config.columns.map(key));
  check(selected.size === config.columns.length);
  const resource = text(256, /^[A-Za-z0-9_/-]+$/).parse(
    `neon/projects/${config.projectId}/branches/${config.branchId}/databases/${config.databaseName}/schema`);
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.project_id !== config.projectId || args.branch_id !== config.branchId || args.db_name !== config.databaseName) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: resource, revision: config.revision }, arguments: args,
      plan: { operation: BRANCH_SCHEMA_OPERATIONS[0], ...args, format: "json" }, artifactDigest: null };
  }
  function ancestry(raw: unknown) {
    check(optional(raw, "pagination") === undefined);
    for (const [name, expected] of [["project_id", config.projectId], ["branch_id", config.branchId],
      ["db_name", config.databaseName], ["database_name", config.databaseName]] as const) {
      const value = optional(raw, name);
      check(value === undefined || value === expected);
    }
  }
  function project(raw: unknown): Json {
    ancestry(raw);
    const json = field(raw, "json");
    ancestry(json);
    const tables = new Set<string>();
    const columns: Json[] = [];
    for (const table of rows(field(json, "tables"), 30)) {
      ancestry(table);
      const schemaName = catalogName.parse(field(table, "schema"));
      const tableName = catalogName.parse(field(table, "name"));
      const tableKey = JSON.stringify([schemaName, tableName]);
      check(!tables.has(tableKey));
      tables.add(tableKey);
      const seen = new Set<string>();
      for (const column of rows(field(table, "columns"), 30)) {
        ancestry(column);
        const columnName = catalogName.parse(field(column, "name"));
        check(!seen.has(columnName));
        seen.add(columnName);
        const identity = { schema_name: schemaName, table_name: tableName, column_name: columnName };
        // SQL, types, constraints and expressions are never evaluated or returned.
        if (selected.has(key(identity))) columns.push(identity);
      }
    }
    return { columns };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${BRANCH_SCHEMA_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = await transport.getProjectBranchSchema(config.projectId, config.branchId, config.databaseName, { credential, signal });
      project(raw);
      return raw;
    },
    project,
  })]);
}
