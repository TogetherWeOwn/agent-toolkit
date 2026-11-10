import { closed, identifier, oneOf, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { slug } from "./metadata.js";

export const trafficBudgetIds: Schema<readonly string[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => identifier.parse(item));
  requireThat(new Set(parsed).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };

// Broker-owned IDs confine output, not parent collection access or enforcement.
export const trafficBudgetScope = closed({ organization: slug, database: slug, branch: slug, budgetId: identifier });
export const trafficBudgetListScope = closed({ organization: slug, database: slug, branch: slug, budgetIds: trafficBudgetIds });
export const queryTrafficBudgetScope = closed({ organization: slug, database: slug, branch: slug, fingerprint: identifier, keyspace: slug, budgetIds: trafficBudgetIds });
const mode = oneOf(["enforce", "warn", "off"] as const);
export interface TrafficBudgetSummary {
  readonly id: string;
  readonly mode: "enforce" | "warn" | "off";
  readonly effectiveEnforcement: "not-established";
}
export function trafficBudgetSummary(body: Record<string, unknown>, allowed: readonly string[]): TrafficBudgetSummary {
  const id = identifier.parse(body.id);
  requireThat(allowed.includes(id), "scope");
  // Rules can contain SQL and tag values. Neither rules nor numeric limits escape.
  return Object.freeze({ id, mode: mode.parse(body.mode), effectiveEnforcement: "not-established" });
}
