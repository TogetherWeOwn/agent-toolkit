import { closed, identifier, integer, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS, MAX_PAGES } from "./metadata.js";
import { check, field, optional, rows } from "./projection.js";
import { PAGE_SIZE, type NeonMetadataTransport } from "./transport.js";

export const PROJECT_OPERATIONS = ["listProjects"] as const;
export interface NeonProjectScope {
  readonly organizationId: string;
  readonly revision: string;
  readonly projectIds: readonly string[];
}
const pathId = text(60, /^[a-z0-9-]+$/);
const region = text(80, /^[a-z0-9-]+$/);
const argumentsSchema = closed({ org_id: pathId });
const paginationSchema = closed({ cursor: text(256, /^[\x20-\x7e]+$/) });

export function createNeonProjectOperations(scope: NeonProjectScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ organizationId: pathId, revision: identifier,
    projectIds: { parse: (v: unknown) => rows(v, MAX_ITEMS).map(value => pathId.parse(value)) },
  }).parse(scope);
  const selected = new Set(config.projectIds);
  check(selected.size === config.projectIds.length);
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.org_id !== config.organizationId) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/organizations/${config.organizationId}/projects`, revision: config.revision },
      arguments: args, plan: { operation: PROJECT_OPERATIONS[0], ...args }, artifactDigest: null };
  }
  function identity(raw: unknown): void {
    const org = optional(raw, "org_id");
    check(org === undefined || org === config.organizationId);
    check(optional(raw, "project_id") === undefined && optional(raw, "branch_id") === undefined);
  }
  function project(raw: unknown): Json {
    identity(raw);
    check(optional(raw, "pagination") === undefined);
    const seen = new Set<string>();
    const projects = rows(field(raw, "projects"), MAX_ITEMS).map(value => {
      identity(value);
      check(optional(value, "pagination") === undefined);
      const id = pathId.parse(field(value, "id"));
      check(!seen.has(id));
      seen.add(id);
      return { id, region_id: region.parse(field(value, "region_id")),
        pg_version: integer(14, 19).parse(field(value, "pg_version")) };
    });
    return { projects: projects.filter(value => selected.has(value.id)) };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${PROJECT_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const projects: unknown[] = [];
      const cursors = new Set<string>();
      let cursor: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const raw = await transport.listProjects(config.organizationId, cursor, { credential, signal });
        identity(raw);
        projects.push(...rows(field(raw, "projects"), PAGE_SIZE));
        const combined = { projects };
        project(combined);
        const pagination = optional(raw, "pagination");
        if (pagination === undefined) return combined;
        // This endpoint uses Pagination.cursor, not the newer PaginationNext.next.
        cursor = paginationSchema.parse(pagination).cursor;
        check(!cursors.has(cursor));
        cursors.add(cursor);
      }
      throw Error("UPSTREAM_UNAVAILABLE");
    },
    project,
  })]);
}
