import { closed, identifier, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { flag, slug } from "./metadata.js";

const ids: Schema<readonly string[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => identifier.parse(item));
  requireThat(new Set(parsed).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };

// Broker-owned IDs confine output, not parent collection access or current ownership.
export const anomalyScope = closed({ organization: slug, database: slug, branch: slug, anomalyId: identifier });
export const anomalyListScope = closed({ organization: slug, database: slug, branch: slug, anomalyIds: ids });
export interface AnomalySummary {
  readonly id: string;
  readonly active: boolean;
  readonly remediationAuthority: "not-established";
}
export function anomalySummary(body: Record<string, unknown>, allowed: readonly string[]): AnomalySummary {
  const id = identifier.parse(body.id);
  requireThat(allowed.includes(id), "scope");
  // Correlations contain SQL/fingerprints. Metrics and raw timestamps are omitted too.
  return Object.freeze({ id, active: flag(body.active), remediationAuthority: "not-established" });
}
