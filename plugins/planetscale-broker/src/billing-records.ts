import { closed, identifier, oneOf, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { flag, slug } from "./metadata.js";

const ids: Schema<readonly string[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => identifier.parse(item));
  requireThat(new Set(parsed).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };
// Response ID confinement is not parent ownership or collection authorization.
export const invoiceScope = closed({ organization: slug, invoiceId: identifier });
export const invoiceListScope = closed({ organization: slug, invoiceIds: ids });
export const lineItemListScope = closed({ organization: slug, invoiceId: identifier, lineItemIds: ids });
export const paymentMethodScope = closed({ organization: slug, paymentMethodId: identifier });
export const paymentSetupScope = closed({ organization: slug, setupId: identifier });

function matchedId(body: Record<string, unknown>, allowed: readonly string[]): string {
  const id = identifier.parse(body.id);
  requireThat(allowed.includes(id), "scope");
  return id;
}

export interface InvoiceSummary {
  readonly id: string;
  readonly paid: boolean;
  readonly overdue: boolean;
  readonly spendingAuthority: "not-established";
}
export function invoiceSummary(body: Record<string, unknown>, allowed: readonly string[]): InvoiceSummary {
  return Object.freeze({
    id: matchedId(body, allowed), paid: flag(body.paid), overdue: flag(body.overdue),
    spendingAuthority: "not-established" as const,
  });
}

export interface LineItemSummary {
  readonly id: string;
  readonly cloudflareBilled: boolean;
  readonly spendingAuthority: "not-established";
}
export function lineItemSummary(body: Record<string, unknown>, allowed: readonly string[]): LineItemSummary {
  return Object.freeze({
    id: matchedId(body, allowed), cloudflareBilled: flag(body.cloudflare_billed),
    spendingAuthority: "not-established" as const,
  });
}

export interface PaymentMethodSummary {
  readonly id: string;
  readonly spendingAuthority: "not-established";
}
export function paymentMethodSummary(body: Record<string, unknown>, expected: string): PaymentMethodSummary {
  requireThat(body.type === "PaymentMethod", "upstream");
  return Object.freeze({ id: matchedId(body, [expected]), spendingAuthority: "not-established" as const });
}

export const setupState = oneOf(["pending", "completed", "failed", "expired"] as const);
export interface PaymentSetupSummary {
  readonly id: string;
  readonly state: ReturnType<typeof setupState.parse>;
  readonly spendingAuthority: "not-established";
}
export function paymentSetupSummary(body: Record<string, unknown>, expected: string): PaymentSetupSummary {
  requireThat(body.type === "BillingPaymentMethodSetup", "upstream");
  return Object.freeze({
    id: matchedId(body, [expected]), state: setupState.parse(body.state),
    spendingAuthority: "not-established" as const,
  });
}
