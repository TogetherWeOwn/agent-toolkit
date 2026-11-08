import { closed, identifier, oneOf, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { regionSummary, type RegionSummary } from "./discovery.js";
import { flag, record, slug } from "./metadata.js";

const binding = closed({ id: identifier });
const organizationBinding = closed({ id: identifier, name: slug });
const regionBinding = closed({ id: identifier, region: organizationBinding });
function bindings<T extends { readonly id: string }>(schema: Schema<T>): Schema<readonly T[]> {
  return { parse(value) {
    requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
    const parsed = value.map(item => schema.parse(item));
    requireThat(new Set(parsed.map(item => item.id)).size === parsed.length, "schema");
    return Object.freeze(parsed);
  } };
}
const organizationBindings: Schema<readonly ReturnType<typeof organizationBinding.parse>[]> = { parse(value) {
  const parsed = bindings(organizationBinding).parse(value);
  requireThat(new Set(parsed.map(item => item.name)).size === parsed.length, "schema");
  return parsed;
} };
// These are broker-owned bindings, not model arguments or upstream list authority.
export const currentUserScope = closed({ user: binding });
export const organizationListScope = closed({ organizations: organizationBindings });
export const readOnlyRegionScope = closed({ organization: slug, database: slug, regions: bindings(regionBinding) });
export const postgresVersionScope = closed({ engine: oneOf(["neki"] as const), versions: bindings(binding) });

export interface UserSummary { readonly id: string; readonly twoFactorAuthConfigured: boolean }
export function userSummary(body: Record<string, unknown>, expected: ReturnType<typeof binding.parse>): UserSummary {
  const id = identifier.parse(body.id);
  requireThat(id === expected.id, "scope");
  // Configuration presence is not proof of enforced MFA or native authority.
  return Object.freeze({ id, twoFactorAuthConfigured: flag(body.two_factor_auth_configured) });
}

export interface OrganizationSummary { readonly id: string; readonly name: string; readonly sso: boolean }
export function organizationSummary(body: Record<string, unknown>, allowed: ReturnType<typeof organizationBindings.parse>): OrganizationSummary {
  const id = identifier.parse(body.id), name = slug.parse(body.name);
  requireThat(allowed.some(item => item.id === id && item.name === name), "scope");
  return Object.freeze({ id, name, sso: flag(body.sso) });
}

export interface ReadOnlyRegionSummary { readonly id: string; readonly ready: boolean; readonly region: RegionSummary }
export function readOnlyRegionSummary(body: Record<string, unknown>, allowed: ReturnType<typeof readOnlyRegionScope.parse>["regions"]): ReadOnlyRegionSummary {
  const id = identifier.parse(body.id), expected = allowed.find(item => item.id === id);
  requireThat(expected, "scope");
  return Object.freeze({ id, ready: flag(body.ready), region: regionSummary(record(body.region), [expected.region]) });
}

export interface PostgresVersionSummary { readonly id: string; readonly default: boolean }
export function postgresVersionSummary(body: Record<string, unknown>, allowed: ReturnType<typeof postgresVersionScope.parse>["versions"]): PostgresVersionSummary {
  const id = identifier.parse(body.id);
  requireThat(allowed.some(item => item.id === id), "scope");
  // Default/ready/enabled are informational, never upgrade, wake or spend grants.
  return Object.freeze({ id, default: flag(body.default) });
}
