import { closed, identifier, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { flag, slug } from "./metadata.js";

export const querySummaryIds: Schema<readonly string[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => identifier.parse(item));
  requireThat(new Set(parsed).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };

// Summary IDs and individual query IDs have separate upstream meanings and bindings.
export const queryRecordScope = closed({ organization: slug, database: slug, branch: slug, queryId: identifier });
export const querySummaryListScope = closed({ organization: slug, database: slug, branch: slug, summaryIds: querySummaryIds });
export interface QueryRecordMetadata {
  readonly id: string;
  readonly explainable: boolean;
  readonly truncated: boolean;
  readonly executionAuthority: "not-established";
}
export interface QuerySummaryMetadata {
  readonly id: string;
  readonly multishard: boolean;
  readonly executionAuthority: "not-established";
}
export function queryRecordMetadata(body: Record<string, unknown>, expected: string): QueryRecordMetadata {
  const id = identifier.parse(body.id);
  requireThat(id === expected, "scope");
  // Password objects, SQL, fingerprints, users, addresses, tags and metrics stay broker-side.
  return Object.freeze({ id, explainable: flag(body.explainable), truncated: flag(body.truncated), executionAuthority: "not-established" });
}
export function querySummaryMetadata(body: Record<string, unknown>, allowed: readonly string[]): QuerySummaryMetadata {
  const id = identifier.parse(body.id);
  requireThat(allowed.includes(id), "scope");
  return Object.freeze({ id, multishard: flag(body.multishard), executionAuthority: "not-established" });
}
