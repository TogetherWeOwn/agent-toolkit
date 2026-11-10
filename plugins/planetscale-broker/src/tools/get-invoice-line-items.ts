import { lineItemListScope, lineItemSummary, type LineItemSummary } from "../billing-records.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "get_invoice_line_items";
export const tool = "planetscale.get_invoice_line_items";

export function prepare(scope: ReturnType<typeof lineItemListScope.parse>, args: unknown): PreparedRead<MetadataPage<LineItemSummary>> {
  const target = lineItemListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/invoices/${target.invoiceId}/line-items?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => lineItemSummary(row, target.lineItemIds)));
}
