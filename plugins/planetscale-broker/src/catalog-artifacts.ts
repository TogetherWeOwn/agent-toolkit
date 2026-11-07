import { createHash } from "node:crypto";
import { closed, integer, requireThat, text, type Schema } from "../../../packages/core/src/schema.js";

// Offline PostgreSQL artifacts only. No connector, target selector, authority or
// credential resolver. A statement hash is provenance, never permission to run it.
const emptyArguments = closed({});
const oid: Schema<string> = { parse(value) {
  const parsed = text(10, /^(0|[1-9][0-9]*)$/).parse(value);
  requireThat(Number(parsed) <= 4294967295, "upstream");
  return parsed;
} };
const label = text(63, /^[\x20-\x7e]+$/);
const kind = text(1, /^[A-Za-z]$/);
const aclText = text(4096, /^\{[\x20-\x7e]*\}$/);
const boolean: Schema<boolean> = { parse(value) {
  requireThat(typeof value === "boolean", "upstream");
  return value;
} };
function nullable<T>(schema: Schema<T>): Schema<T | null> {
  return { parse: value => value === null ? null : schema.parse(value) };
}

export interface CatalogArtifact<T> {
  readonly tool: string;
  readonly statement: string;
  readonly sha256: string;
  readonly plane: "postgresql-catalog";
  readonly lifecycle: "waking-requires-authorized-window";
  readonly rowLimit: 1000;
  readonly byteLimit: 262144;
  readonly prepare: (raw: unknown) => Readonly<{
    statement: string;
    sha256: string;
    project: (wire: Uint8Array) => Readonly<{
      rows: readonly T[];
      completeness: "unverified";
      effectiveRights: "not-computed";
    }>;
  }>;
}

function artifact<T>(tool: string, statement: string, schema: Schema<T>): CatalogArtifact<T> {
  const sha256 = createHash("sha256").update(statement, "utf8").digest("hex");
  return Object.freeze({
    tool, statement, sha256, plane: "postgresql-catalog" as const,
    lifecycle: "waking-requires-authorized-window" as const,
    rowLimit: 1000 as const, byteLimit: 262144 as const,
    prepare(raw: unknown) {
      emptyArguments.parse(raw);
      return Object.freeze({ statement, sha256, project(wire: Uint8Array) {
        requireThat(wire instanceof Uint8Array && wire.byteLength > 0 && wire.byteLength <= 262144, "cap");
        let parsed: unknown;
        try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(wire)); }
        catch { requireThat(false, "upstream"); }
        requireThat(Array.isArray(parsed) && parsed.length <= 1000, "cap");
        return Object.freeze({
          rows: Object.freeze(parsed.map(row => schema.parse(row))),
          // Catalog visibility, collection closure and privilege evaluation are
          // independent obligations. Empty rows must not become absence proof.
          completeness: "unverified" as const, effectiveRights: "not-computed" as const,
        });
      } });
    },
  });
}

export const targetIdentity = artifact("planetscale.catalog_target_identity", `SELECT
  CURRENT_USER::text AS "currentUser", SESSION_USER::text AS "sessionUser",
  pg_catalog.current_database()::text AS "database"
LIMIT 1001`, closed({ currentUser: label, sessionUser: label, database: label }));

export const roles = artifact("planetscale.catalog_roles", `SELECT
  oid::text AS "oid", rolname::text AS "name", rolsuper AS "superuser",
  rolcreaterole AS "createRole", rolcreatedb AS "createDatabase",
  rolcanlogin AS "login", rolinherit AS "inherit", rolreplication AS "replication",
  rolbypassrls AS "bypassRls", rolconnlimit AS "connectionLimit",
  rolvaliduntil::text AS "validUntil"
FROM pg_catalog.pg_roles
ORDER BY oid LIMIT 1001`, closed({
  oid, name: label, superuser: boolean, createRole: boolean, createDatabase: boolean,
  login: boolean, inherit: boolean, replication: boolean, bypassRls: boolean,
  connectionLimit: integer(-1, 2147483647), validUntil: nullable(text(80, /^[\x20-\x7e]+$/)),
}));

export const roleEdges = artifact("planetscale.catalog_role_edges", `SELECT
  roleid::text AS "roleOid", member::text AS "memberOid", grantor::text AS "grantorOid",
  admin_option AS "admin", inherit_option AS "inherit", set_option AS "set"
FROM pg_catalog.pg_auth_members
ORDER BY roleid, member, grantor LIMIT 1001`, closed({
  roleOid: oid, memberOid: oid, grantorOid: oid, admin: boolean, inherit: boolean, set: boolean,
}));

export const databasePaths = artifact("planetscale.catalog_database_paths", `SELECT
  oid::text AS "oid", datname::text AS "name", datdba::text AS "ownerOid",
  datacl::text AS "acl", datallowconn AS "allowConnections"
FROM pg_catalog.pg_database
ORDER BY oid LIMIT 1001`, closed({
  oid, name: label, ownerOid: oid, acl: nullable(aclText), allowConnections: boolean,
}));

export const namespaces = artifact("planetscale.catalog_namespaces", `SELECT
  oid::text AS "oid", nspname::text AS "name", nspowner::text AS "ownerOid", nspacl::text AS "acl"
FROM pg_catalog.pg_namespace
ORDER BY oid LIMIT 1001`, closed({ oid, name: label, ownerOid: oid, acl: nullable(aclText) }));

export const relations = artifact("planetscale.catalog_relations", `SELECT
  oid::text AS "oid", relnamespace::text AS "namespaceOid", relname::text AS "name",
  relkind::text AS "kind", relowner::text AS "ownerOid", relacl::text AS "acl",
  relrowsecurity AS "rowSecurity", relforcerowsecurity AS "forceRowSecurity"
FROM pg_catalog.pg_class
ORDER BY oid LIMIT 1001`, closed({
  oid, namespaceOid: oid, name: label, kind, ownerOid: oid, acl: nullable(aclText),
  rowSecurity: boolean, forceRowSecurity: boolean,
}));

export const columns = artifact("planetscale.catalog_columns", `SELECT
  attrelid::text AS "relationOid", attnum AS "number", attname::text AS "name",
  atttypid::text AS "typeOid", attisdropped AS "dropped", attacl::text AS "acl"
FROM pg_catalog.pg_attribute
ORDER BY attrelid, attnum LIMIT 1001`, closed({
  relationOid: oid, number: integer(-32768, 32767), name: label, typeOid: oid,
  dropped: boolean, acl: nullable(aclText),
}));

export const defaults = artifact("planetscale.catalog_default_paths", `SELECT
  oid::text AS "oid", defaclrole::text AS "creatorOid", defaclnamespace::text AS "namespaceOid",
  defaclobjtype::text AS "kind", defaclacl::text AS "acl"
FROM pg_catalog.pg_default_acl
ORDER BY oid LIMIT 1001`, closed({
  oid, creatorOid: oid, namespaceOid: oid, kind, acl: nullable(aclText),
}));

export const functions = artifact("planetscale.catalog_function_paths", `SELECT
  oid::text AS "oid", pronamespace::text AS "namespaceOid", proname::text AS "name",
  proowner::text AS "ownerOid", prokind::text AS "kind", prosecdef AS "securityDefiner",
  provolatile::text AS "volatility", proacl::text AS "acl"
FROM pg_catalog.pg_proc
ORDER BY oid LIMIT 1001`, closed({
  oid, namespaceOid: oid, name: label, ownerOid: oid, kind, securityDefiner: boolean,
  volatility: text(1, /^[ivs]$/), acl: nullable(aclText),
}));
