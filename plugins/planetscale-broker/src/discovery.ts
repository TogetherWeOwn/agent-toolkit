import { closed, identifier, oneOf, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { flag, slug } from "./metadata.js";

const binding = closed({ id: identifier, name: slug });
export type ResourceBinding = ReturnType<typeof binding.parse>;
const bindings: Schema<readonly ResourceBinding[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => binding.parse(item));
  requireThat(new Set(parsed.map(item => item.id)).size === parsed.length, "schema");
  requireThat(new Set(parsed.map(item => item.name)).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };

// Broker-owned collection AND child scope, not tool arguments. Child checks do
// not authorize a parent-wide upstream list; the common core must do that first.
export const databaseDiscoveryScope = closed({ organization: slug, databases: bindings });
export const branchDiscoveryScope = closed({ organization: slug, database: slug, branches: bindings });
export const databaseRegionScope = closed({ organization: slug, database: slug, regions: bindings });
export const organizationRegionScope = closed({ organization: slug, regions: bindings });
export const publicRegionScope = closed({ regions: bindings });
export type DatabaseDiscoveryScope = ReturnType<typeof databaseDiscoveryScope.parse>;
export type BranchDiscoveryScope = ReturnType<typeof branchDiscoveryScope.parse>;
export type DatabaseRegionScope = ReturnType<typeof databaseRegionScope.parse>;
export type OrganizationRegionScope = ReturnType<typeof organizationRegionScope.parse>;
export type PublicRegionScope = ReturnType<typeof publicRegionScope.parse>;

function matched(body: Record<string, unknown>, allowed: readonly ResourceBinding[], name: unknown): ResourceBinding {
  const id = identifier.parse(body.id);
  const parsedName = slug.parse(name);
  requireThat(allowed.some(item => item.id === id && item.name === parsedName), "scope");
  return Object.freeze({ id, name: parsedName });
}

export interface DatabaseSummary {
  readonly id: string;
  readonly name: string;
  readonly kind: "mysql" | "postgresql" | "neki";
  readonly ready: boolean;
  readonly deletionProtected: boolean;
}
export function databaseSummary(body: Record<string, unknown>, allowed: readonly ResourceBinding[]): DatabaseSummary {
  return Object.freeze({
    ...matched(body, allowed, body.name), kind: oneOf(["mysql", "postgresql", "neki"] as const).parse(body.kind),
    ready: flag(body.ready), deletionProtected: flag(body.deletion_protected),
  });
}

export interface BranchSummary {
  readonly id: string;
  readonly name: string;
  readonly ready: boolean;
  readonly production: boolean;
  readonly deletionProtected: boolean;
  readonly safeMigrations: boolean;
}
export function branchSummary(body: Record<string, unknown>, allowed: readonly ResourceBinding[]): BranchSummary {
  return Object.freeze({
    ...matched(body, allowed, body.name), ready: flag(body.ready), production: flag(body.production),
    deletionProtected: flag(body.deletion_protected), safeMigrations: flag(body.safe_migrations),
  });
}

export interface RegionSummary {
  readonly id: string;
  readonly slug: string;
  readonly enabled: boolean;
}
export function regionSummary(body: Record<string, unknown>, allowed: readonly ResourceBinding[]): RegionSummary {
  const resource = matched(body, allowed, body.slug);
  // Availability is metadata, not proof of entitlement, current usage or no cost.
  return Object.freeze({ id: resource.id, slug: resource.name, enabled: flag(body.enabled) });
}
