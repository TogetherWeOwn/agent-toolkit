import { requireThat } from "../../../../packages/core/src/schema.js";
import { querySummaryListScope, querySummaryMetadata, type QuerySummaryMetadata } from "../query-records.js";
import { branchPath, emptyArguments, prepared, record, type PreparedRead } from "../metadata.js";

export const operationId = "list_branch_queries";
export const tool = "planetscale.list_branch_queries";
interface QuerySummaryPage {
  readonly items: readonly QuerySummaryMetadata[];
  readonly hasMore: boolean;
  readonly coverage: "first-page-only";
}

export function prepare(scope: ReturnType<typeof querySummaryListScope.parse>, args: unknown): PreparedRead<QuerySummaryPage> {
  const target = querySummaryListScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/insights?page=1&per_page=10`, body => {
    // This endpoint has no current_page/per_page fields in its documented envelope.
    requireThat(body.type === "list" && body.prev_page === null, "upstream");
    requireThat(body.next_page === null || body.next_page === 2, "upstream");
    requireThat(Array.isArray(body.data) && body.data.length <= 10, "upstream");
    const items = body.data.map(row => querySummaryMetadata(record(row), target.summaryIds));
    requireThat(new Set(items.map(row => row.id)).size === items.length, "upstream");
    return Object.freeze({ items: Object.freeze(items), hasMore: body.next_page !== null, coverage: "first-page-only" });
  });
}
