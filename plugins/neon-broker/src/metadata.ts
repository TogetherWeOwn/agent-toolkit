import { closed, identifier, integer, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { PAGE_SIZE, type NeonMetadataTransport } from "./transport.js";

export const MAX_PAGES = 3;
export const MAX_ITEMS = PAGE_SIZE * MAX_PAGES;
export const METADATA_OPERATIONS = ["getProject", "listProjectBranches", "getProjectBranch",
  "listProjectBranchEndpoints", "getProjectEndpoint"] as const;
export type MetadataOperation = typeof METADATA_OPERATIONS[number];

export interface NeonMetadataScope {
  readonly projectId: string;
  readonly revision: string;
  readonly branchIds: readonly string[];
  readonly endpoints: readonly { readonly id: string; readonly branchId: string }[];
}

const projectArguments = closed({ project_id: identifier });
const branchArguments = closed({ project_id: identifier, branch_id: identifier });
const endpointArguments = closed({ project_id: identifier, endpoint_id: identifier });
const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const region = text(80, /^(aws|azure)-[a-z0-9]+(?:-[a-z0-9]+)*$/);
const branchState = oneOf(["init", "resetting", "ready", "archived"]);
const endpointState = oneOf(["init", "active", "idle"]);
const endpointType = oneOf(["read_only", "read_write"]);

function check(value: unknown): asserts value {
  if (!value) throw Error("OUTPUT_REFUSED");
}
function record(value: unknown): Record<string, unknown> {
  check(value !== null && typeof value === "object" && !Array.isArray(value));
  check(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  return value as Record<string, unknown>;
}
function field(value: unknown, key: string): unknown {
  const d = Object.getOwnPropertyDescriptor(record(value), key);
  check(d?.enumerable && Object.hasOwn(d, "value"));
  return d.value;
}
function optional(value: unknown, key: string): unknown {
  return Object.hasOwn(record(value), key) ? field(value, key) : undefined;
}
function rows(value: unknown, max: number): unknown[] {
  check(Array.isArray(value) && value.length <= max && Reflect.ownKeys(value).length === value.length + 1);
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    check(d?.enumerable && Object.hasOwn(d, "value"));
  }
  return value;
}
function boolean(value: unknown): boolean {
  check(typeof value === "boolean");
  return value;
}
function nextCursor(raw: unknown): string | null {
  const pagination = optional(raw, "pagination");
  if (pagination === undefined) return null;
  const next = optional(pagination, "next");
  const sort = optional(pagination, "sort_by");
  const order = optional(pagination, "sort_order");
  check(sort === undefined || sort === "name");
  check(order === undefined || order === "asc");
  return next === undefined ? null : text(256, /^[\x20-\x7e]+$/).parse(next);
}

// Trusted construction data comes from broker integration, never a tool argument.
// This is not a host authenticator, policy store, authorization flag or plugin worker.
export function createNeonMetadataOperations(scope: NeonMetadataScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  jsonData(scope);
  const config = closed({ projectId: identifier, revision, branchIds: { parse: (v: unknown) =>
    rows(v, MAX_ITEMS).map(value => identifier.parse(value)) }, endpoints: { parse: (v: unknown) =>
    rows(v, MAX_ITEMS).map(value => closed({ id: identifier, branchId: identifier }).parse(value)) } }).parse(scope);
  const branches = new Set(config.branchIds);
  const endpoints = new Map(config.endpoints.map(endpoint => [endpoint.id, endpoint.branchId]));
  check(branches.size === config.branchIds.length && endpoints.size === config.endpoints.length);
  check(config.endpoints.every(endpoint => branches.has(endpoint.branchId)));
  const projectId = config.projectId;
  const root = `neon/projects/${projectId}`;

  function parse(name: MetadataOperation, raw: unknown): { project_id: string; branch_id?: string; endpoint_id?: string } {
    if (name === "getProjectEndpoint") {
      const args = endpointArguments.parse(raw);
      if (args.project_id !== projectId || !endpoints.has(args.endpoint_id)) throw Error("INVALID_ARGUMENTS");
      return args;
    }
    if (name === "getProjectBranch" || name === "listProjectBranchEndpoints") {
      const args = branchArguments.parse(raw);
      if (args.project_id !== projectId || !branches.has(args.branch_id)) throw Error("INVALID_ARGUMENTS");
      return args;
    }
    const args = projectArguments.parse(raw);
    if (args.project_id !== projectId) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function branch(raw: unknown): Json {
    const id = identifier.parse(field(raw, "id"));
    check(field(raw, "project_id") === projectId && branches.has(id));
    return { id, project_id: projectId, current_state: branchState.parse(field(raw, "current_state")),
      default: boolean(field(raw, "default")), protected: boolean(field(raw, "protected")) };
  }
  function endpoint(raw: unknown): Json {
    const id = identifier.parse(field(raw, "id"));
    const branchId = identifier.parse(field(raw, "branch_id"));
    check(field(raw, "project_id") === projectId && endpoints.get(id) === branchId);
    return { id, project_id: projectId, branch_id: branchId,
      type: endpointType.parse(field(raw, "type")), current_state: endpointState.parse(field(raw, "current_state")),
      disabled: boolean(field(raw, "disabled")) };
  }
  function filtered(raw: unknown, kind: "branches" | "endpoints"): Json[] {
    const seen = new Set<string>();
    return rows(field(raw, kind), MAX_ITEMS).flatMap(item => {
      const id = identifier.parse(field(item, "id"));
      check(field(item, "project_id") === projectId && !seen.has(id));
      seen.add(id);
      if (kind === "branches") return branches.has(id) ? [branch(item)] : [];
      const branchId = identifier.parse(field(item, "branch_id"));
      check(branches.has(branchId));
      return endpoints.has(id) ? [endpoint(item)] : [];
    });
  }
  return Object.freeze(METADATA_OPERATIONS.map(name => Object.freeze({
    name: `neon.${name}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare(raw: unknown): Prepared {
      const args = parse(name, raw);
      const resourceId = name === "getProject" ? root : name === "listProjectBranches" ? `${root}/branches` :
        name === "getProjectBranch" ? `${root}/branches/${args.branch_id}` :
        name === "listProjectBranchEndpoints" ? `${root}/branches/${args.branch_id}/endpoints` :
        `${root}/branches/${endpoints.get(args.endpoint_id!)}/endpoints/${args.endpoint_id}`;
      return { resource: { id: resourceId, revision: config.revision }, arguments: args as Json,
        plan: { operation: name, ...args }, artifactDigest: null };
    },
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(name, prepared.arguments);
      const expected = this.prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const options = { credential, signal };
      if (name === "getProject") {
        const raw = await transport.getProject(projectId, options);
        check(field(field(raw, "project"), "id") === projectId);
        return raw;
      }
      if (name === "getProjectBranch") {
        const raw = await transport.getProjectBranch(projectId, args.branch_id!, options);
        check(field(field(raw, "branch"), "id") === args.branch_id);
        branch(field(raw, "branch"));
        return raw;
      }
      if (name === "getProjectEndpoint") {
        const raw = await transport.getProjectEndpoint(projectId, args.endpoint_id!, options);
        check(field(field(raw, "endpoint"), "id") === args.endpoint_id);
        endpoint(field(raw, "endpoint"));
        return raw;
      }
      if (name === "listProjectBranchEndpoints") {
        const raw = await transport.listProjectBranchEndpoints(projectId, args.branch_id!, options);
        check(optional(raw, "pagination") === undefined);
        for (const item of rows(field(raw, "endpoints"), MAX_ITEMS)) {
          check(field(item, "project_id") === projectId && field(item, "branch_id") === args.branch_id);
        }
        return raw;
      }
      const result: unknown[] = [];
      const cursors = new Set<string>();
      let cursor: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const raw = await transport.listProjectBranches(projectId, cursor, options);
        result.push(...rows(field(raw, "branches"), PAGE_SIZE));
        cursor = nextCursor(raw);
        if (cursor === null) return { branches: result };
        check(!cursors.has(cursor));
        cursors.add(cursor);
      }
      throw Error("UPSTREAM_UNAVAILABLE");
    },
    project(raw: unknown): Json {
      if (name === "getProject") {
        const project = field(raw, "project");
        check(field(project, "id") === projectId);
        return { project: { id: projectId, region_id: region.parse(field(project, "region_id")),
          pg_version: integer(14, 18).parse(field(project, "pg_version")) } };
      }
      if (name === "getProjectBranch") return { branch: branch(field(raw, "branch")) };
      if (name === "getProjectEndpoint") return { endpoint: endpoint(field(raw, "endpoint")) };
      return name === "listProjectBranches" ? { branches: filtered(raw, "branches") } : { endpoints: filtered(raw, "endpoints") };
    },
  })));
}
