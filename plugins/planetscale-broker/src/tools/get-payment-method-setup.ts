import { paymentSetupScope, paymentSetupSummary, type PaymentSetupSummary } from "../billing-records.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_payment_method_setup";
export const tool = "planetscale.get_payment_method_setup";

export function prepare(scope: ReturnType<typeof paymentSetupScope.parse>, args: unknown): PreparedRead<PaymentSetupSummary> {
  const target = paymentSetupScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/billing/payment-method-setups/${target.setupId}`,
    body => paymentSetupSummary(body, target.setupId));
}
