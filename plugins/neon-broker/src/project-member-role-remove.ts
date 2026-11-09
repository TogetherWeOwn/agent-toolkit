import { closed, identifier, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional, rows } from "./projection.js";
import { PAGE_SIZE, type NeonMetadataTransport } from "./transport.js";

export const PROJECT_MEMBER_ROLE_REMOVE_OPERATIONS = ["removeProjectMemberRole"] as const;
export interface NeonProjectMemberRoleRemoveScope {
  readonly projectId: string;
  readonly memberId: string;
  readonly userId: string;
  readonly expectedOrgRole: "admin" | "member" | "editor" | "viewer" | "collaborator";
  readonly expectedPermission: "VIEWER" | "EDITOR" | "ADMIN";
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9-]+$/);
const uuid = text(36, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
const role = oneOf(["admin", "member", "editor", "viewer", "collaborator"] as const);
const permission = oneOf(["VIEWER", "EDITOR", "ADMIN"] as const);
const argumentsSchema = closed({ project_id: pathId, member_id: uuid });

// Source only; removing an explicit grant does not remove organization-default access.
export function createNeonProjectMemberRoleRemoveOperations(scope: NeonProjectMemberRoleRemoveScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, memberId: uuid, userId: uuid, expectedOrgRole: role,
    expectedPermission: permission, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/members/${config.memberId}/role/remove`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.member_id === config.memberId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "removeProjectMemberRole", ...args, user_id: config.userId, expected_org_role: config.expectedOrgRole,
        expected_permission: config.expectedPermission, effect: "request_explicit_project_grant_removal",
        preflight: "bounded_terminal_member_user_explicit_permission", reconciliation: "bounded_member_list_observation_no_retry",
        diff: { before: "selected_explicit_project_grant_present", after: "explicit_grant_removal_requested" },
        confirmSelfLockout: false, organizationDefaultsRemain: true, completion: "acknowledgement_only", connectionFence: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    const project = optional(raw, "project_id");
    check(project === undefined || project === config.projectId);
    for (const key of ["branch_id", "pagination"]) check(optional(raw, key) === undefined);
  }
  function identity(raw: unknown): void {
    ancestry(raw);
    check(uuid.parse(field(raw, "member_id")) === config.memberId && uuid.parse(field(raw, "user_id")) === config.userId &&
      role.parse(field(raw, "org_role")) === config.expectedOrgRole);
  }
  function receipt(raw: unknown): Json {
    identity(raw);
    check(pathId.parse(field(raw, "project_id")) === config.projectId);
    // Effective/default permissions, rotation hints, profiles and dates are not evaluated or emitted.
    return { member_id: config.memberId, acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.removeProjectMemberRole", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 8000,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        const seen = new Set<string>();
        const users = new Set<string>();
        const cursors = new Set<string>();
        let found = false;
        let sortBy: string | undefined;
        let sortOrder: string | undefined;
        let cursor: string | null = null;
        for (let page = 0; page < 3; page++) {
          if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
          const raw = await transport.listProjectMembers(config.projectId, cursor, options);
          if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
          const project = optional(raw, "project_id");
          check(project === undefined || project === config.projectId);
          check(optional(raw, "branch_id") === undefined);
          for (const value of rows(field(raw, "project_members"), PAGE_SIZE)) {
            ancestry(value);
            const id = uuid.parse(field(value, "member_id"));
            const user = uuid.parse(field(value, "user_id"));
            check(!seen.has(id) && !users.has(user));
            seen.add(id);
            users.add(user);
            if (user === config.userId) check(id === config.memberId);
            if (id !== config.memberId) continue;
            identity(value);
            check(field(value, "grant_source") === "explicit" && permission.parse(field(value, "explicit_project_permission")) === config.expectedPermission);
            found = true;
          }
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
          if (next === undefined) { check(found); return; }
          cursor = text(256, /^[\x20-\x7e]+$/).parse(next);
          check(!cursors.has(cursor));
          cursors.add(cursor);
        }
        throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.removeProjectMemberRole(config.projectId, config.memberId, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Provider idempotence is not retry authority; defaults/absence prove no causal access removal.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
