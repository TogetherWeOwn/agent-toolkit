import { closed, identifier, oneOf, requireThat, text, type Schema } from "../../../packages/core/src/schema.js";
import { flag, preparedArray, slug, type PreparedRead } from "./metadata.js";

const skuName = text(80, /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);
const names: Schema<readonly string[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => skuName.parse(item));
  requireThat(new Set(parsed).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };

// Catalog names are not immutable resource IDs or authorization to purchase/resize.
export const adminScope = closed({ organization: slug, database: slug, branch: slug, adminId: identifier });
export const branchSkuScope = closed({ organization: slug, database: slug, branch: slug, skuNames: names });
export const clusterSkuScope = closed({ organization: slug, engine: oneOf(["mysql", "postgresql", "neki"] as const), skuNames: names });
export interface AdminSummary {
  readonly id: string;
  readonly state: "pending" | "applying" | "ready";
  readonly actionAuthority: "not-established";
}
export function adminSummary(body: Record<string, unknown>, expected: string): AdminSummary {
  const id = identifier.parse(body.id);
  requireThat(id === expected, "scope");
  return Object.freeze({ id, state: oneOf(["pending", "applying", "ready"] as const).parse(body.state), actionAuthority: "not-established" });
}
export interface SkuSummary {
  readonly name: string;
  readonly actionAuthority: "not-established";
}
export interface EnabledSkuSummary extends SkuSummary { readonly enabled: boolean }
export function skuSummary(body: Record<string, unknown>, allowed: readonly string[]): SkuSummary {
  const name = skuName.parse(body.name);
  requireThat(allowed.includes(name), "scope");
  return Object.freeze({ name, actionAuthority: "not-established" });
}
export function enabledSkuSummary(body: Record<string, unknown>, allowed: readonly string[]): EnabledSkuSummary {
  return Object.freeze({ ...skuSummary(body, allowed), enabled: flag(body.enabled) });
}
export function preparedSkus<T extends SkuSummary>(path: string, project: (body: Record<string, unknown>) => T): PreparedRead<readonly T[]> {
  const read = preparedArray(path, project);
  return Object.freeze({ request: read.request, project(body: Uint8Array): readonly T[] {
    const rows = read.project(body);
    requireThat(new Set(rows.map(row => row.name)).size === rows.length, "upstream");
    return rows;
  } });
}
