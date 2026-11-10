import { closed, identifier, integer, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS, MAX_PAGES } from "./metadata.js";
import { check, field, optional, rows } from "./projection.js";
import { PAGE_SIZE, type NeonMetadataTransport } from "./transport.js";

export const SHARED_PROJECT_OPERATIONS = ["listSharedProjects"] as const;
export interface NeonSharedProjectScope {
  readonly userId: string;
  readonly revision: string;
  readonly projectIds: readonly string[];
}
const pathId = text(60, /^[a-z0-9-]+$/);
const region = text(80, /^[a-z0-9-]+$/);
const argumentsSchema = closed({ user_id: identifier });
const paginationSchema = closed({ cursor: text(256, /^[\x20-\x7e]+$/) });

export function createNeonSharedProjectOperations(scope: NeonSharedProjectScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ userId: identifier, revision: identifier,
    projectIds: { parse: (value: unknown) => rows(value, MAX_ITEMS).map(row => pathId.parse(row)) },
  }).parse(scope);
  const selected = new Set(config.projectIds);
  check(selected.size === config.projectIds.length);
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.user_id !== config.userId) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/users/${config.userId}/shared_projects`, revision: config.revision },
      arguments: args, plan: { operation: SHARED_PROJECT_OPERATIONS[0], ...args }, artifactDigest: null };
  }
  function user(raw: unknown): void {
    check(identifier.parse(field(raw, "id")) === config.userId);
    check(optional(raw, "pagination") === undefined);
  }
  function ancestry(raw: unknown): void {
    const id = optional(raw, "user_id");
    check(id === undefined || id === config.userId);
    check(optional(raw, "branch_id") === undefined);
  }
  function availability(raw: unknown): void {
    const unavailable = optional(raw, "unavailable_project_ids");
    if (unavailable === undefined) return;
    const seen = new Set<string>();
    for (const value of rows(unavailable, MAX_ITEMS)) {
      const id = pathId.parse(value);
      check(!seen.has(id) && !selected.has(id));
      seen.add(id);
    }
  }
  function project(raw: unknown): Json {
    user(field(raw, "user"));
    check(optional(raw, "pagination") === undefined);
    const catalog = field(raw, "catalog");
    ancestry(catalog);
    availability(catalog);
    check(optional(catalog, "project_id") === undefined && optional(catalog, "pagination") === undefined);
    const seen = new Set<string>();
    const projects = rows(field(catalog, "projects"), MAX_ITEMS).map(row => {
      ancestry(row);
      check(optional(row, "pagination") === undefined);
      const id = pathId.parse(field(row, "id"));
      const parent = optional(row, "project_id");
      check(parent === undefined || parent === id);
      check(!seen.has(id));
      seen.add(id);
      return { id, region_id: region.parse(field(row, "region_id")),
        pg_version: integer(14, 19).parse(field(row, "pg_version")) };
    });
    return { projects: projects.filter(row => selected.has(row.id)) };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${SHARED_PROJECT_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 4500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const options = { credential, signal };
      // A catalog response alone cannot bind an organization/project key to a user.
      const identity = await transport.getCurrentUserInfo(options);
      user(identity);
      const projects: unknown[] = [];
      const cursors = new Set<string>();
      let cursor: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const raw = await transport.listSharedProjects(cursor, options);
        ancestry(raw);
        availability(raw);
        check(optional(raw, "project_id") === undefined);
        projects.push(...rows(field(raw, "projects"), PAGE_SIZE));
        const combined = { user: identity, catalog: { projects } };
        project(combined);
        const pagination = optional(raw, "pagination");
        if (pagination === undefined) return combined;
        cursor = paginationSchema.parse(pagination).cursor;
        check(!cursors.has(cursor));
        cursors.add(cursor);
      }
      throw Error("UPSTREAM_UNAVAILABLE");
    },
    project,
  })]);
}
