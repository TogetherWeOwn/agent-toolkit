import { invoiceScope, invoiceSummary, type InvoiceSummary } from "../billing-records.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_invoice";
export const tool = "planetscale.get_invoice";

export function prepare(scope: ReturnType<typeof invoiceScope.parse>, args: unknown): PreparedRead<InvoiceSummary> {
  const target = invoiceScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/invoices/${target.invoiceId}`,
    body => invoiceSummary(body, [target.invoiceId]));
}
