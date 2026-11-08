import { closed, identifier, oneOf, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { flag, record, slug } from "./metadata.js";

const ids: Schema<readonly string[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => identifier.parse(item));
  requireThat(new Set(parsed).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };

// Bound report IDs constrain output, not parent collection access or downloads.
export const queryReportScope = closed({ organization: slug, database: slug, branch: slug, reportId: identifier });
export const queryReportListScope = closed({ organization: slug, database: slug, branch: slug, reportIds: ids });
const state = oneOf(["pending", "completed", "failed"] as const);
export interface QueryReportSummary {
  readonly id: string;
  readonly state: "pending" | "completed" | "failed";
  readonly downloadAuthority: "not-established";
}
export function queryReportSummary(body: Record<string, unknown>, allowed: readonly string[]): QueryReportSummary {
  const id = identifier.parse(body.id);
  requireThat(allowed.includes(id), "scope");
  return Object.freeze({ id, state: state.parse(body.state), downloadAuthority: "not-established" });
}

export interface QueryReportFirstPage {
  readonly items: readonly QueryReportSummary[];
  readonly hasMore: boolean;
  readonly coverage: "first-page-only-not-completeness-evidence";
}
export function queryReportFirstPage(body: Record<string, unknown>, allowed: readonly string[]): QueryReportFirstPage {
  requireThat(body.type === "list" && body.has_prev === false, "upstream");
  const hasMore = flag(body.has_next);
  requireThat(Array.isArray(body.data) && body.data.length <= 10, "upstream");
  const items = Object.freeze(body.data.map(value => queryReportSummary(record(value), allowed)));
  requireThat(new Set(items.map(row => row.id)).size === items.length, "upstream");
  requireThat(body.cursor_start === (items[0]?.id ?? null) && body.cursor_end === (items.at(-1)?.id ?? null), "upstream");
  requireThat(items.length > 0 || !hasMore, "upstream");
  // No cursor or provider URL is returned or followed. Later pages are unsupported.
  return Object.freeze({ items, hasMore, coverage: "first-page-only-not-completeness-evidence" });
}
