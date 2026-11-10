import { closed, identifier, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS, MAX_PAGES } from "./metadata.js";
import { check, field, optional, rows } from "./projection.js";
import { PAGE_SIZE, type NeonMetadataTransport } from "./transport.js";

export const PROJECT_ACCESS_OPERATIONS = ["listProjectPermissions", "listProjectMembers"] as const;
type ProjectAccessOperation = typeof PROJECT_ACCESS_OPERATIONS[number];
export const MAX_PROJECT_ACCESS_BINDINGS = 16;
export interface NeonProjectAccessScope {
  readonly projectId: string;
  readonly revision: string;
  readonly permissionIds: readonly string[];
  readonly members: readonly { readonly memberId: string; readonly userId: string }[];
}
const pathId = text(60, /^[a-z0-9-]+$/);
const uuid = text(36, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
const projectArguments = closed({ project_id: pathId });
const orgRole = oneOf(["admin", "member", "editor", "viewer", "collaborator"] as const);
const permission = oneOf(["VIEWER", "EDITOR", "ADMIN"] as const);
const grantSource = oneOf(["explicit", "org_role_default", "org_admin_override", "unassigned"] as const);
const collection = (name: ProjectAccessOperation) => name === "listProjectPermissions" ? "project_permissions" : "project_members";
const suffix = (name: ProjectAccessOperation) => name === "listProjectPermissions" ? "permissions" : "members";

export function createNeonProjectAccessOperations(scope: NeonProjectAccessScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, revision: identifier,
    permissionIds: { parse: (v: unknown) => rows(v, MAX_PROJECT_ACCESS_BINDINGS).map(value => identifier.parse(value)) },
    members: { parse: (v: unknown) => rows(v, MAX_PROJECT_ACCESS_BINDINGS).map(value => closed({ memberId: uuid, userId: uuid }).parse(value)) },
  }).parse(scope);
  const permissions = new Set(config.permissionIds);
  const members = new Map(config.members.map(value => [value.memberId, value.userId]));
  const users = new Map(config.members.map(value => [value.userId, value.memberId]));
  check(permissions.size === config.permissionIds.length && members.size === config.members.length && users.size === config.members.length);

  function parse(raw: unknown) {
    const args = projectArguments.parse(raw);
    if (args.project_id !== config.projectId) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepareFor(name: ProjectAccessOperation, raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/projects/${config.projectId}/${suffix(name)}`, revision: config.revision },
      arguments: args, plan: { operation: name, ...args }, artifactDigest: null };
  }
  function identity(raw: unknown): void {
    const project = optional(raw, "project_id");
    check(project === undefined || project === config.projectId);
    check(optional(raw, "branch_id") === undefined);
  }
  function projectFor(name: ProjectAccessOperation, raw: unknown): Json {
    identity(raw);
    check(optional(raw, "pagination") === undefined);
    const seen = new Set<string>();
    const seenUsers = new Set<string>();
    const selected = rows(field(raw, collection(name)), MAX_ITEMS).flatMap<Json>(value => {
      identity(value);
      check(optional(value, "pagination") === undefined);
      if (name === "listProjectPermissions") {
        const id = text(256, /^[\x20-\x7e]+$/).parse(field(value, "id"));
        check(!seen.has(id));
        seen.add(id);
        return permissions.has(id) ? [{ id: identifier.parse(id) }] : [];
      }
      const memberId = uuid.parse(field(value, "member_id"));
      const userId = uuid.parse(field(value, "user_id"));
      check(!seen.has(memberId) && !seenUsers.has(userId));
      seen.add(memberId);
      seenUsers.add(userId);
      if (users.has(userId)) check(users.get(userId) === memberId);
      if (!members.has(memberId)) return [];
      check(members.get(memberId) === userId);
      const effective = optional(value, "effective_project_permission");
      const source = optional(value, "grant_source");
      return [{ member_id: memberId, user_id: userId, org_role: orgRole.parse(field(value, "org_role")),
        ...(effective === undefined ? {} : { effective_project_permission: permission.parse(effective) }),
        ...(source === undefined ? {} : { grant_source: grantSource.parse(source) }) }];
    });
    return { [collection(name)]: selected };
  }
  return Object.freeze(PROJECT_ACCESS_OPERATIONS.map(name => Object.freeze({
    name: `neon.${name}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare(raw: unknown): Prepared { return prepareFor(name, raw); },
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepareFor(name, args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const options = { credential, signal };
      if (name === "listProjectPermissions") {
        const raw = await transport.listProjectPermissions(config.projectId, options);
        projectFor(name, raw);
        return raw;
      }
      const result: unknown[] = [];
      const cursors = new Set<string>();
      let sortBy: string | undefined;
      let sortOrder: string | undefined;
      let cursor: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const raw = await transport.listProjectMembers(config.projectId, cursor, options);
        identity(raw);
        result.push(...rows(field(raw, "project_members"), PAGE_SIZE));
        const pagination = optional(raw, "pagination");
        const next = pagination === undefined ? undefined : optional(pagination, "next");
        if (pagination !== undefined) {
          check(Reflect.ownKeys(pagination as object).every(key => key === "next" || key === "sort_by" || key === "sort_order"));
          const by = optional(pagination, "sort_by");
          const order = optional(pagination, "sort_order");
          if (by !== undefined) {
            const parsed = text(80, /^[\x20-\x7e]+$/).parse(by);
            check(sortBy === undefined || sortBy === parsed);
            sortBy = parsed;
          }
          if (order !== undefined) {
            check(order === "asc" || order === "desc");
            check(sortOrder === undefined || sortOrder === order);
            sortOrder = order;
          }
          // This endpoint exposes no sort query; continuation uses its opaque cursor.
        }
        // Validate every accumulated page before another request; never return a partial result.
        const combined = { project_members: result };
        projectFor(name, combined);
        if (next === undefined) return combined;
        cursor = text(256, /^[\x20-\x7e]+$/).parse(next);
        check(!cursors.has(cursor));
        cursors.add(cursor);
      }
      throw Error("UPSTREAM_UNAVAILABLE");
    },
    project(raw: unknown): Json { return projectFor(name, raw); },
  })));
}
