import { closed, identifier, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { record, slug } from "./metadata.js";
import { queryRecordMetadata, type QueryRecordMetadata } from "./query-records.js";

const errorBinding = closed({ id: identifier, fingerprint: identifier });
export const errorSummaryBindings: Schema<readonly ReturnType<typeof errorBinding.parse>[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => errorBinding.parse(item));
  requireThat(new Set(parsed.map(item => item.id)).size === parsed.length, "schema");
  requireThat(new Set(parsed.map(item => item.fingerprint)).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };
const ids: Schema<readonly string[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => identifier.parse(item));
  requireThat(new Set(parsed).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };

export const errorSummaryScope = closed({ organization: slug, database: slug, branch: slug, errors: errorSummaryBindings });
export const errorQueryScope = closed({ organization: slug, database: slug, branch: slug, errorFingerprint: identifier, queryIds: ids });
export interface ErrorSummaryMetadata {
  readonly id: string;
  readonly executionAuthority: "not-established";
}
export interface FirstErrorPage<T> {
  readonly items: readonly T[];
  readonly hasMore: boolean;
  readonly coverage: "first-page-only";
}

export function errorPage<T extends { readonly id: string }>(body: Record<string, unknown>, project: (row: Record<string, unknown>) => T): FirstErrorPage<T> {
  // current_page/per_page are optional and nullable in the official schema.
  requireThat(body.type === "list" && body.prev_page === null, "upstream");
  requireThat(body.next_page === null || body.next_page === 2, "upstream");
  requireThat(body.current_page === undefined || body.current_page === null || body.current_page === 1, "upstream");
  requireThat(body.per_page === undefined || body.per_page === null || body.per_page === 10, "upstream");
  requireThat(Array.isArray(body.data) && body.data.length <= 10, "upstream");
  const items = body.data.map(row => project(record(row)));
  requireThat(new Set(items.map(row => row.id)).size === items.length, "upstream");
  return Object.freeze({ items: Object.freeze(items), hasMore: body.next_page !== null, coverage: "first-page-only" });
}

export function errorSummaryMetadata(body: Record<string, unknown>, allowed: ReturnType<typeof errorSummaryScope.parse>["errors"]): ErrorSummaryMetadata {
  const id = identifier.parse(body.id);
  const fingerprint = identifier.parse(body.error_fingerprint);
  requireThat(allowed.some(binding => binding.id === id && binding.fingerprint === fingerprint), "scope");
  return Object.freeze({ id, executionAuthority: "not-established" });
}

export function errorQueryMetadata(body: Record<string, unknown>, allowed: readonly string[]): QueryRecordMetadata {
  const id = identifier.parse(body.id);
  requireThat(allowed.includes(id), "scope");
  // Query fingerprint is not the error fingerprint. Never infer their equality,
  // error provenance or effective authority from this response.
  return queryRecordMetadata(body, id);
}
