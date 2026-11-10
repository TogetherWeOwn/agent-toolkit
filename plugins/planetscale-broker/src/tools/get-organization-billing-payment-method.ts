import { paymentMethodScope, paymentMethodSummary, type PaymentMethodSummary } from "../billing-records.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_organization_billing_payment_method";
export const tool = "planetscale.get_organization_billing_payment_method";

export function prepare(scope: ReturnType<typeof paymentMethodScope.parse>, args: unknown): PreparedRead<PaymentMethodSummary> {
  const target = paymentMethodScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/billing/payment-method`,
    body => paymentMethodSummary(body, target.paymentMethodId));
}
