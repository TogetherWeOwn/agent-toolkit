import { closed, identifier, integer, oneOf, requireThat, text } from "../../../packages/core/src/schema.js";

// Pure provider adapters, not a policy boundary or installable plugin. Scope must
// eventually come from the reviewed common core, never from model arguments.
export const slug = text(63, /^[a-z0-9][a-z0-9_-]*$/);
export const organizationScope = closed({ organization: slug });
export const databaseScope = closed({ organization: slug, database: slug });
export const branchScope = closed({ organization: slug, database: slug, branch: slug });
export const roleScope = closed({ organization: slug, database: slug, branch: slug, roleId: identifier });
export const passwordScope = closed({ organization: slug, database: slug, branch: slug, passwordId: identifier });
export const emptyArguments = closed({});
export const pageArguments = closed({ page: integer(1, 100), perPage: integer(1, 10) });
export type OrganizationScope = ReturnType<typeof organizationScope.parse>;
export type DatabaseScope = ReturnType<typeof databaseScope.parse>;
export type BranchScope = ReturnType<typeof branchScope.parse>;
export type RoleScope = ReturnType<typeof roleScope.parse>;
export type PasswordScope = ReturnType<typeof passwordScope.parse>;
export type PageArguments = ReturnType<typeof pageArguments.parse>;

export interface PreparedRead<T> {
  readonly request: Readonly<{ method: "GET"; origin: "https://api.planetscale.com"; path: string }>;
  readonly project: (body: Uint8Array) => T;
}

export function prepared<T>(path: string, project: (body: Record<string, unknown>) => T): PreparedRead<T> {
  return preparedValue(path, body => project(record(body)));
}

export function preparedArray<T>(path: string, project: (row: Record<string, unknown>) => T): PreparedRead<readonly T[]> {
  return preparedValue(path, body => {
    requireThat(Array.isArray(body) && body.length <= 32, "upstream");
    return Object.freeze(body.map(row => project(record(row))));
  });
}

function preparedValue<T>(path: string, project: (body: unknown) => T): PreparedRead<T> {
  requireThat(path.startsWith("/v1/") && path.length <= 1024 && !/[\r\n#]/.test(path), "schema");
  return Object.freeze({
    request: Object.freeze({ method: "GET" as const, origin: "https://api.planetscale.com" as const, path }),
    project(body: Uint8Array): T {
      requireThat(body instanceof Uint8Array && body.byteLength > 0 && body.byteLength <= 65536, "upstream");
      let parsed: unknown;
      try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
      catch { requireThat(false, "upstream"); }
      return project(parsed);
    },
  });
}

export function record(value: unknown): Record<string, unknown> {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Record<string, unknown>;
}

export function flag(value: unknown): boolean {
  requireThat(typeof value === "boolean", "upstream");
  return value;
}

export function branchPath(scope: BranchScope): string {
  return `/v1/organizations/${scope.organization}/databases/${scope.database}/branches/${scope.branch}`;
}

export function identity(body: Record<string, unknown>, expected: string): string {
  requireThat(body.name === expected, "scope");
  return expected;
}

export interface RoleMetadata {
  readonly id: string;
  readonly name: string;
  readonly ready: boolean;
  readonly expired: boolean;
  readonly inheritedRoles: readonly string[];
}
const inheritedRole = oneOf([
  "pg_checkpoint", "pg_create_subscription", "pg_maintain", "pg_monitor",
  "pg_read_all_data", "pg_read_all_settings", "pg_read_all_stats", "pg_signal_backend",
  "pg_stat_scan_tables", "pg_use_reserved_connections", "pg_write_all_data", "postgres",
] as const);

export function roleMetadata(body: Record<string, unknown>): RoleMetadata {
  requireThat(Array.isArray(body.inherited_roles) && body.inherited_roles.length <= 12, "upstream");
  return Object.freeze({
    id: identifier.parse(body.id), name: identifier.parse(body.name),
    ready: flag(body.ready), expired: flag(body.expired),
    inheritedRoles: Object.freeze(body.inherited_roles.map(value => inheritedRole.parse(value))),
  });
}

export interface PasswordMetadata {
  readonly id: string;
  readonly name: string;
  readonly role: "reader" | "writer" | "admin" | "readwriter";
  readonly expired: boolean;
}
export function passwordMetadata(body: Record<string, unknown>): PasswordMetadata {
  return Object.freeze({
    id: identifier.parse(body.id), name: identifier.parse(body.name),
    role: oneOf(["reader", "writer", "admin", "readwriter"] as const).parse(body.role),
    expired: flag(body.expired),
  });
}

export interface MetadataPage<T> {
  readonly items: readonly T[];
  readonly nextPage: number | null;
  readonly complete: boolean;
}
export function page<T>(body: Record<string, unknown>, args: PageArguments, project: (row: Record<string, unknown>) => T): MetadataPage<T> {
  requireThat(body.current_page === args.page && body.per_page === args.perPage, "upstream");
  requireThat(Array.isArray(body.data) && body.data.length <= args.perPage, "upstream");
  requireThat(body.next_page === null || (body.next_page === args.page + 1 && args.page < 100), "upstream");
  const nextPage = body.next_page === null ? null : integer(1, 100).parse(body.next_page);
  return Object.freeze({
    items: Object.freeze(body.data.map(value => project(record(value)))),
    nextPage, complete: nextPage === null,
  });
}
