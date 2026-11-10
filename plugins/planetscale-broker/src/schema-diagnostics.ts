import { closed, integer, oneOf, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { flag, slug } from "./metadata.js";

export const lintKeyspaceNames: Schema<readonly string[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const names = value.map(item => slug.parse(item));
  requireThat(new Set(names).size === names.length, "schema");
  return Object.freeze(names);
} };
export const lintScope = closed({ organization: slug, database: slug, branch: slug, keyspaceNames: lintKeyspaceNames });
export const storageCheckScope = closed({ organization: slug, database: slug, number: integer(1, 2147483647) });
const subjectType = oneOf(["table_error", "vschema_error", "routing_rules_error"] as const);

export interface LintSubjectSummary {
  readonly keyspace: string;
  readonly subjectType: ReturnType<typeof subjectType.parse>;
  readonly deploymentAuthority: "not-established";
}
export function lintSubjectSummary(body: Record<string, unknown>, allowed: readonly string[]): LintSubjectSummary {
  const keyspace = slug.parse(body.keyspace_name);
  requireThat(allowed.includes(keyspace), "scope");
  // Error codes, descriptions, table/column names, DDL and URLs are not projected.
  return Object.freeze({ keyspace, subjectType: subjectType.parse(body.subject_type), deploymentAuthority: "not-established" });
}

export interface StorageCheckSummary {
  readonly enoughStorage: boolean;
  readonly upgradeable: boolean;
  readonly deploymentAuthority: "not-established";
}
export function storageCheckSummary(body: Record<string, unknown>): StorageCheckSummary {
  // Provider flags do not prove safe deployment, price, entitlement or native approval.
  // The response has no request ID, target ID or branch identity to revalidate.
  return Object.freeze({ enoughStorage: flag(body.enough_storage), upgradeable: flag(body.upgradeable), deploymentAuthority: "not-established" });
}
