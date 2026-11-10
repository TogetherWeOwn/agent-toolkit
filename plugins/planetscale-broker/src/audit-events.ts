import { closed, identifier, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { flag, record, slug } from "./metadata.js";

export const auditEventIds: Schema<readonly string[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => identifier.parse(item));
  requireThat(new Set(parsed).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };

// Bound event IDs constrain output, not organization-wide audit-log access.
export const auditEventListScope = closed({ organization: slug, eventIds: auditEventIds });
export interface AuditEventSummary {
  readonly id: string;
  readonly auditActionRecorded: boolean;
  readonly integrity: "not-established";
}
export interface AuditEventFirstPage {
  readonly items: readonly AuditEventSummary[];
  readonly hasMore: boolean;
  readonly coverage: "first-page-only-not-completeness-evidence";
}
export function auditEventFirstPage(body: Record<string, unknown>, allowed: readonly string[]): AuditEventFirstPage {
  requireThat(body.type === "list" && body.has_prev === false, "upstream");
  const hasMore = flag(body.has_next);
  requireThat(Array.isArray(body.data) && body.data.length <= 10, "upstream");
  const items = Object.freeze(body.data.map(value => {
    const row = record(value);
    const id = identifier.parse(row.id);
    requireThat(allowed.includes(id), "scope");
    requireThat(typeof row.audit_action === "string" && row.audit_action.length <= 256, "upstream");
    // Action text and actor/target/network/change metadata are never reflected.
    return Object.freeze({ id, auditActionRecorded: row.audit_action.length > 0, integrity: "not-established" as const });
  }));
  requireThat(new Set(items.map(row => row.id)).size === items.length, "upstream");
  requireThat(body.cursor_start === (items[0]?.id ?? null) && body.cursor_end === (items.at(-1)?.id ?? null), "upstream");
  requireThat(items.length > 0 || !hasMore, "upstream");
  return Object.freeze({ items, hasMore, coverage: "first-page-only-not-completeness-evidence" });
}
