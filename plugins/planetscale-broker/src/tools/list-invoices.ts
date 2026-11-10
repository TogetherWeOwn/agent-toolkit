import { invoiceListScope, invoiceSummary, type InvoiceSummary } from "../billing-records.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_invoices";
export const tool = "planetscale.list_invoices";

export function prepare(scope: ReturnType<typeof invoiceListScope.parse>, args: unknown): PreparedRead<MetadataPage<InvoiceSummary>> {
  const target = invoiceListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/invoices?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => invoiceSummary(row, target.invoiceIds)));
}
