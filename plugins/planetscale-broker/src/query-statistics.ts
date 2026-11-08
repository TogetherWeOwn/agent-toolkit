import { closed, identifier, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { slug } from "./metadata.js";
import { queryRecordMetadata, querySummaryMetadata, type QueryRecordMetadata, type QuerySummaryMetadata } from "./query-records.js";

const ids: Schema<readonly string[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => identifier.parse(item));
  requireThat(new Set(parsed).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };
export const queryStatisticsScope = closed({ organization: slug, database: slug, branch: slug, fingerprint: identifier, keyspace: slug, queryIds: ids });
export const fingerprintSummaryScope = closed({ organization: slug, database: slug, branch: slug, fingerprint: identifier, keyspace: slug, summaryId: identifier });

function matchContext(body: Record<string, unknown>, target: { readonly fingerprint: string; readonly keyspace: string }): void {
  requireThat(body.fingerprint === target.fingerprint && body.keyspace === target.keyspace, "scope");
}
export function queryStatisticsMetadata(body: Record<string, unknown>, target: ReturnType<typeof queryStatisticsScope.parse>): QueryRecordMetadata {
  matchContext(body, target);
  const id = identifier.parse(body.id);
  requireThat(target.queryIds.includes(id), "scope");
  return queryRecordMetadata(body, id);
}
export function fingerprintSummaryMetadata(body: Record<string, unknown>, target: ReturnType<typeof fingerprintSummaryScope.parse>): QuerySummaryMetadata {
  matchContext(body, target);
  return querySummaryMetadata(body, [target.summaryId]);
}
