import { closed, identifier, integer, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS, MAX_PAGES, type NeonMetadataScope } from "./metadata.js";
import { boolean, check, field, optional, rows } from "./projection.js";
import { PAGE_SIZE, type NeonMetadataTransport } from "./transport.js";

export const CATALOG_OPERATIONS = ["getProjectOperation", "listProjectOperations", "countProjectBranches",
  "listProjectEndpoints", "listProjectBranchDatabases", "getProjectBranchDatabase",
  "listProjectBranchRoles", "getProjectBranchRole"] as const;
type CatalogOperation = typeof CATALOG_OPERATIONS[number];
interface CatalogArguments {
  readonly project_id: string;
  readonly branch_id?: string;
  readonly operation_id?: string;
  readonly database_name?: string;
  readonly role_name?: string;
}
export interface NeonCatalogScope extends NeonMetadataScope {
  readonly operations: readonly { readonly id: string; readonly branchId: string | null; readonly endpointId: string | null }[];
  readonly databases: readonly { readonly id: number; readonly name: string; readonly branchId: string }[];
  readonly roles: readonly { readonly name: string; readonly branchId: string }[];
}

const catalogName = text(63, /^[A-Za-z_][A-Za-z0-9_$-]*$/);
const operationId = text(36, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const nonnegative = integer(0, 2_147_483_647);
const databaseId = integer(1, Number.MAX_SAFE_INTEGER);
const nullableId = { parse: (v: unknown) => v === null ? null : identifier.parse(v) };
const projectArguments = closed({ project_id: identifier });
const branchArguments = closed({ project_id: identifier, branch_id: identifier });
const operationArguments = closed({ project_id: identifier, operation_id: operationId });
const databaseArguments = closed({ project_id: identifier, branch_id: identifier, database_name: catalogName });
const roleArguments = closed({ project_id: identifier, branch_id: identifier, role_name: catalogName });
const status = oneOf(["scheduling", "running", "finished", "failed", "error", "cancelling", "cancelled", "skipped"]);
const action = oneOf(["create_compute", "create_timeline", "start_compute", "suspend_compute", "apply_config",
  "check_availability", "delete_timeline", "create_branch", "import_data", "tenant_ignore", "tenant_attach",
  "tenant_detach", "tenant_detach_safekeepers", "tenant_attach_safekeepers", "tenant_reattach", "replace_safekeeper",
  "disable_maintenance", "apply_storage_config", "prepare_secondary_pageserver", "switch_pageserver",
  "detach_parent_branch", "timeline_archive", "timeline_unarchive", "start_reserved_compute",
  "sync_dbs_and_roles_from_compute", "apply_schema_from_branch", "timeline_mark_invisible",
  "timeline_update_protected_config", "prewarm_replica", "promote_replica", "set_storage_non_dirty",
  "swap_binding_id", "finalize_migration", "mark_migration_prepared", "update_catalog", "epc_sync"]);

// Scope is trusted construction data, never a caller identity, grant or approval.
export function createNeonCatalogOperations(scope: NeonCatalogScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: identifier, revision: text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/),
    branchIds: { parse: (v: unknown) => rows(v, MAX_ITEMS).map(value => identifier.parse(value)) },
    endpoints: { parse: (v: unknown) => rows(v, MAX_ITEMS).map(value => closed({ id: identifier, branchId: identifier }).parse(value)) },
    operations: { parse: (v: unknown) => rows(v, MAX_ITEMS).map(value => closed({ id: operationId, branchId: nullableId, endpointId: nullableId }).parse(value)) },
    databases: { parse: (v: unknown) => rows(v, MAX_ITEMS).map(value => closed({ id: databaseId, name: catalogName, branchId: identifier }).parse(value)) },
    roles: { parse: (v: unknown) => rows(v, MAX_ITEMS).map(value => closed({ name: catalogName, branchId: identifier }).parse(value)) },
  }).parse(scope);
  const branches = new Set(config.branchIds);
  const endpoints = new Map(config.endpoints.map(value => [value.id, value.branchId]));
  const operations = new Map(config.operations.map(value => [value.id, value]));
  const key = (branch: string, name: string) => `${branch}/${name}`;
  const databases = new Map(config.databases.map(value => [key(value.branchId, value.name), value]));
  const roles = new Map(config.roles.map(value => [key(value.branchId, value.name), value]));
  check(branches.size === config.branchIds.length && endpoints.size === config.endpoints.length &&
    operations.size === config.operations.length && databases.size === config.databases.length && roles.size === config.roles.length);
  check(config.endpoints.every(value => branches.has(value.branchId)) &&
    config.databases.every(value => branches.has(value.branchId)) && config.roles.every(value => branches.has(value.branchId)));
  check(new Set(config.databases.map(value => value.id)).size === config.databases.length);
  check(config.operations.every(value => (value.branchId === null || branches.has(value.branchId)) &&
    (value.endpointId === null || (value.branchId !== null && endpoints.get(value.endpointId) === value.branchId))));
  const projectId = config.projectId;
  const root = `neon/projects/${projectId}`;

  function parse(name: CatalogOperation, raw: unknown): CatalogArguments {
    const args: CatalogArguments = name === "getProjectOperation" ? operationArguments.parse(raw) :
      name === "getProjectBranchDatabase" ? databaseArguments.parse(raw) :
      name === "getProjectBranchRole" ? roleArguments.parse(raw) :
      name === "listProjectBranchDatabases" || name === "listProjectBranchRoles" ? branchArguments.parse(raw) : projectArguments.parse(raw);
    if (args.project_id !== projectId || (args.branch_id !== undefined && !branches.has(args.branch_id)) ||
      (args.operation_id !== undefined && !operations.has(args.operation_id)) ||
      (args.database_name !== undefined && !databases.has(key(args.branch_id!, args.database_name))) ||
      (args.role_name !== undefined && !roles.has(key(args.branch_id!, args.role_name)))) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function operation(raw: unknown): Json {
    const id = operationId.parse(field(raw, "id"));
    const binding = operations.get(id);
    check(binding && field(raw, "project_id") === projectId);
    check((optional(raw, "branch_id") ?? null) === binding.branchId && (optional(raw, "endpoint_id") ?? null) === binding.endpointId);
    return { id, project_id: projectId, ...(binding.branchId === null ? {} : { branch_id: binding.branchId }),
      ...(binding.endpointId === null ? {} : { endpoint_id: binding.endpointId }),
      action: action.parse(field(raw, "action")), status: status.parse(field(raw, "status")),
      failures_count: nonnegative.parse(field(raw, "failures_count")), total_duration_ms: nonnegative.parse(field(raw, "total_duration_ms")) };
  }
  function endpoint(raw: unknown): Json {
    const id = identifier.parse(field(raw, "id"));
    const branchId = identifier.parse(field(raw, "branch_id"));
    check(field(raw, "project_id") === projectId && endpoints.get(id) === branchId);
    return { id, project_id: projectId, branch_id: branchId, type: oneOf(["read_only", "read_write"]).parse(field(raw, "type")),
      current_state: oneOf(["init", "active", "idle"]).parse(field(raw, "current_state")), disabled: boolean(field(raw, "disabled")) };
  }
  function database(raw: unknown): Json {
    const branchId = identifier.parse(field(raw, "branch_id"));
    const name = catalogName.parse(field(raw, "name"));
    const binding = databases.get(key(branchId, name));
    check(binding && field(raw, "id") === binding.id);
    return { id: binding.id, branch_id: branchId, name };
  }
  function role(raw: unknown): Json {
    const branchId = identifier.parse(field(raw, "branch_id"));
    const name = catalogName.parse(field(raw, "name"));
    check(roles.has(key(branchId, name)));
    const protectedValue = optional(raw, "protected");
    return { branch_id: branchId, name, ...(protectedValue === undefined ? {} : { protected: boolean(protectedValue) }) };
  }
  function collection(raw: unknown, kind: "operations" | "endpoints" | "databases" | "roles"): Json[] {
    const seen = new Set<string>();
    return rows(field(raw, kind), MAX_ITEMS).flatMap(value => {
      if (kind === "operations" || kind === "endpoints") {
        const id = (kind === "operations" ? operationId : identifier).parse(field(value, "id"));
        check(field(value, "project_id") === projectId && !seen.has(id));
        seen.add(id);
        if (kind === "operations") return operations.has(id) ? [operation(value)] : [];
        check(branches.has(identifier.parse(field(value, "branch_id"))));
        return endpoints.has(id) ? [endpoint(value)] : [];
      }
      const branchId = identifier.parse(field(value, "branch_id"));
      const name = catalogName.parse(field(value, "name"));
      const target = key(branchId, name);
      check(branches.has(branchId) && !seen.has(target));
      seen.add(target);
      return kind === "databases" ? (databases.has(target) ? [database(value)] : []) : (roles.has(target) ? [role(value)] : []);
    });
  }
  function prepareFor(name: CatalogOperation, raw: unknown): Prepared {
    const args = parse(name, raw);
    const branchRoot = `${root}/branches/${args.branch_id}`;
    const resource = name === "getProjectOperation" ? `${root}/operations/${args.operation_id}` :
      name === "listProjectOperations" ? `${root}/operations` : name === "countProjectBranches" ? `${root}/branches/count` :
      name === "listProjectEndpoints" ? `${root}/endpoints` : name === "listProjectBranchDatabases" ? `${branchRoot}/databases` :
      name === "getProjectBranchDatabase" ? `${branchRoot}/databases/${args.database_name}` :
      name === "listProjectBranchRoles" ? `${branchRoot}/roles` : `${branchRoot}/roles/${args.role_name}`;
    return { resource: { id: resource, revision: config.revision }, arguments: args as Json,
      plan: { operation: name, ...args }, artifactDigest: null };
  }
  return Object.freeze(CATALOG_OPERATIONS.map(name => Object.freeze({
    name: `neon.${name}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare(raw: unknown): Prepared { return prepareFor(name, raw); },
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(name, prepared.arguments);
      const expected = prepareFor(name, args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const options = { credential, signal };
      if (name === "getProjectOperation") {
        const raw = await transport.getProjectOperation(projectId, args.operation_id!, options);
        check(field(field(raw, "operation"), "id") === args.operation_id);
        operation(field(raw, "operation"));
        return raw;
      }
      if (name === "listProjectOperations") {
        const result: unknown[] = [];
        const cursors = new Set<string>();
        let cursor: string | null = null;
        for (let page = 0; page < MAX_PAGES; page++) {
          if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
          const raw = await transport.listProjectOperations(projectId, cursor, options);
          result.push(...rows(field(raw, "operations"), PAGE_SIZE));
          const pagination = optional(raw, "pagination");
          if (pagination === undefined) return { operations: result };
          // Operation pagination uses pagination.cursor, NOT branch pagination.next.
          cursor = closed({ cursor: text(256, /^[\x20-\x7e]+$/) }).parse(pagination).cursor;
          check(!cursors.has(cursor));
          cursors.add(cursor);
        }
        throw Error("UPSTREAM_UNAVAILABLE");
      }
      if (name === "countProjectBranches") return transport.countProjectBranches(projectId, options);
      if (name === "getProjectBranchDatabase" || name === "getProjectBranchRole") {
        const isDatabase = name === "getProjectBranchDatabase";
        const raw = isDatabase ? await transport.getProjectBranchDatabase(projectId, args.branch_id!, args.database_name!, options) :
          await transport.getProjectBranchRole(projectId, args.branch_id!, args.role_name!, options);
        const item = field(raw, isDatabase ? "database" : "role");
        check(field(item, "branch_id") === args.branch_id && field(item, "name") === (isDatabase ? args.database_name : args.role_name));
        if (isDatabase) database(item); else role(item);
        return raw;
      }
      const kind = name === "listProjectEndpoints" ? "endpoints" : name === "listProjectBranchDatabases" ? "databases" : "roles";
      const raw = kind === "endpoints" ? await transport.listProjectEndpoints(projectId, options) : kind === "databases" ?
        await transport.listProjectBranchDatabases(projectId, args.branch_id!, options) : await transport.listProjectBranchRoles(projectId, args.branch_id!, options);
      check(optional(raw, "pagination") === undefined);
      for (const value of rows(field(raw, kind), MAX_ITEMS)) {
        if (kind !== "endpoints") check(field(value, "branch_id") === args.branch_id);
      }
      return raw;
    },
    project(raw: unknown): Json {
      if (name === "getProjectOperation") return { operation: operation(field(raw, "operation")) };
      if (name === "countProjectBranches") return { count: nonnegative.parse(field(raw, "count")) };
      if (name === "getProjectBranchDatabase") return { database: database(field(raw, "database")) };
      if (name === "getProjectBranchRole") return { role: role(field(raw, "role")) };
      const kind = name === "listProjectOperations" ? "operations" : name === "listProjectEndpoints" ? "endpoints" :
        name === "listProjectBranchDatabases" ? "databases" : "roles";
      return { [kind]: collection(raw, kind) };
    },
  })));
}
