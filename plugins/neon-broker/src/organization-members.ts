import { closed, identifier, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS, MAX_PAGES } from "./metadata.js";
import { check, field, optional, rows } from "./projection.js";
import { PAGE_SIZE, type NeonMetadataTransport } from "./transport.js";

export const ORGANIZATION_MEMBER_OPERATIONS = ["getOrganizationMembers", "getOrganizationMember"] as const;
type OrganizationMemberOperation = typeof ORGANIZATION_MEMBER_OPERATIONS[number];
export const MAX_ORGANIZATION_MEMBER_BINDINGS = 16;
export interface NeonOrganizationMemberScope {
  readonly organizationId: string;
  readonly revision: string;
  readonly members: readonly { readonly memberId: string; readonly userId: string }[];
}
const pathId = text(60, /^[a-z0-9-]+$/);
const uuid = text(36, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
const collectionArguments = closed({ org_id: pathId });
const detailArguments = closed({ org_id: pathId, member_id: uuid });
const role = oneOf(["admin", "member", "editor", "viewer", "collaborator"] as const);

export function createNeonOrganizationMemberOperations(scope: NeonOrganizationMemberScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ organizationId: pathId, revision: identifier,
    members: { parse: (v: unknown) => rows(v, MAX_ORGANIZATION_MEMBER_BINDINGS).map(value => closed({ memberId: uuid, userId: uuid }).parse(value)) },
  }).parse(scope);
  const members = new Map(config.members.map(value => [value.memberId, value.userId]));
  const users = new Map(config.members.map(value => [value.userId, value.memberId]));
  check(members.size === config.members.length && users.size === config.members.length);
  const root = `neon/organizations/${config.organizationId}/members`;
  function parse(name: OrganizationMemberOperation, raw: unknown): { org_id: string; member_id?: string } {
    const args: { org_id: string; member_id?: string } = name === "getOrganizationMember" ? detailArguments.parse(raw) : collectionArguments.parse(raw);
    if (args.org_id !== config.organizationId || (args.member_id !== undefined && !members.has(args.member_id))) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepareFor(name: OrganizationMemberOperation, raw: unknown): Prepared {
    const args = parse(name, raw);
    return { resource: { id: args.member_id !== undefined ? `${root}/${args.member_id}` : root, revision: config.revision },
      arguments: args, plan: { operation: name, ...args }, artifactDigest: null };
  }
  function identity(raw: unknown): void {
    const org = optional(raw, "org_id");
    check(org === undefined || org === config.organizationId);
    check(optional(raw, "project_id") === undefined && optional(raw, "branch_id") === undefined);
  }
  function member(raw: unknown): { id: string; user_id: string; org_id: string; role: string } {
    identity(raw);
    check(optional(raw, "pagination") === undefined);
    return { id: uuid.parse(field(raw, "id")), user_id: uuid.parse(field(raw, "user_id")),
      org_id: pathId.parse(field(raw, "org_id")), role: role.parse(field(raw, "role")) };
  }
  function projectFor(name: OrganizationMemberOperation, raw: unknown): Json {
    identity(raw);
    check(optional(raw, "pagination") === undefined);
    if (name === "getOrganizationMember") {
      const value = member(raw);
      check(members.has(value.id) && members.get(value.id) === value.user_id);
      return value;
    }
    const seen = new Set<string>();
    const seenUsers = new Set<string>();
    const selected = rows(field(raw, "members"), MAX_ITEMS).flatMap(value => {
      identity(value);
      check(optional(value, "pagination") === undefined);
      const result = member(field(value, "member"));
      check(!seen.has(result.id) && !seenUsers.has(result.user_id));
      seen.add(result.id);
      seenUsers.add(result.user_id);
      if (users.has(result.user_id)) check(users.get(result.user_id) === result.id);
      if (!members.has(result.id)) return [];
      check(members.get(result.id) === result.user_id);
      return [{ member: result }];
    });
    return { members: selected };
  }
  return Object.freeze(ORGANIZATION_MEMBER_OPERATIONS.map(name => Object.freeze({
    name: `neon.${name}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare(raw: unknown): Prepared { return prepareFor(name, raw); },
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(name, prepared.arguments);
      const expected = prepareFor(name, args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const options = { credential, signal };
      if (args.member_id !== undefined) {
        const raw = await transport.getOrganizationMember(config.organizationId, args.member_id, options);
        const result = projectFor(name, raw);
        check(field(result, "id") === args.member_id);
        return raw;
      }
      const result: unknown[] = [];
      const cursors = new Set<string>();
      let cursor: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const raw = await transport.getOrganizationMembers(config.organizationId, cursor, options);
        identity(raw);
        result.push(...rows(field(raw, "members"), PAGE_SIZE));
        const pagination = optional(raw, "pagination");
        const next = pagination === undefined ? undefined : optional(pagination, "next");
        if (pagination !== undefined) {
          check(Reflect.ownKeys(pagination as object).every(key => ["next", "sort_by", "sort_order"].includes(String(key))));
          const by = optional(pagination, "sort_by");
          const order = optional(pagination, "sort_order");
          check((by === undefined || by === "joined_at") && (order === undefined || order === "desc"));
        }
        const combined = { members: result };
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
