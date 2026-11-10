import { closed, identifier, oneOf, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { flag, record, slug } from "./metadata.js";

const membershipBinding = closed({ id: identifier, userId: identifier });
const teamBinding = closed({ id: identifier, slug });
function bindings<T extends { readonly id: string }>(schema: Schema<T>, secondKey: (item: T) => string): Schema<readonly T[]> {
  return { parse(value) {
    requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
    const parsed = value.map(item => schema.parse(item));
    requireThat(new Set(parsed.map(item => item.id)).size === parsed.length, "schema");
    requireThat(new Set(parsed.map(secondKey)).size === parsed.length, "schema");
    return Object.freeze(parsed);
  } };
}
export const membershipBindings = bindings(membershipBinding, item => item.userId);
export const teamBindings = bindings(teamBinding, item => item.slug);
// Broker-owned output confinement, never parent collection or effective authority.
export const organizationMembershipScope = closed({ organization: slug, membership: membershipBinding });
export const organizationMembershipListScope = closed({ organization: slug, memberships: membershipBindings });
export const organizationTeamScope = closed({ organization: slug, team: teamBinding });
export const organizationTeamListScope = closed({ organization: slug, teams: teamBindings });
export const organizationTeamMemberScope = closed({ organization: slug, team: teamBinding, membership: membershipBinding });
export const organizationTeamMemberListScope = closed({ organization: slug, team: teamBinding, memberships: membershipBindings });

function matched<T extends { readonly id: string }>(body: Record<string, unknown>, allowed: readonly T[]): T {
  const id = identifier.parse(body.id);
  const binding = allowed.find(item => item.id === id);
  requireThat(binding !== undefined, "scope");
  return binding!;
}

export const organizationRole = oneOf(["member", "admin"] as const);
export interface OrganizationMembershipSummary {
  readonly id: string;
  readonly userId: string;
  readonly role: ReturnType<typeof organizationRole.parse>;
  readonly effectiveAuthority: "not-established";
}
export function organizationMembershipSummary(body: Record<string, unknown>, allowed: readonly ReturnType<typeof membershipBinding.parse>[]): OrganizationMembershipSummary {
  const binding = matched(body, allowed);
  requireThat(record(body.user).id === binding.userId, "scope");
  return Object.freeze({ id: binding.id, userId: binding.userId, role: organizationRole.parse(body.role), effectiveAuthority: "not-established" });
}

export interface OrganizationTeamSummary {
  readonly id: string;
  readonly slug: string;
  readonly managed: boolean;
  readonly effectiveAuthority: "not-established";
}
export function organizationTeamSummary(body: Record<string, unknown>, allowed: readonly ReturnType<typeof teamBinding.parse>[]): OrganizationTeamSummary {
  const binding = matched(body, allowed);
  requireThat(body.slug === binding.slug, "scope");
  return Object.freeze({ id: binding.id, slug: binding.slug, managed: flag(body.managed), effectiveAuthority: "not-established" });
}

export interface OrganizationTeamMemberSummary {
  readonly id: string;
  readonly userId: string;
  readonly effectiveAuthority: "not-established";
}
export function organizationTeamMemberSummary(body: Record<string, unknown>, allowed: readonly ReturnType<typeof membershipBinding.parse>[]): OrganizationTeamMemberSummary {
  const binding = matched(body, allowed);
  requireThat(record(body.user).id === binding.userId, "scope");
  // Nested password grants and actor/contact details are deliberately not read.
  return Object.freeze({ id: binding.id, userId: binding.userId, effectiveAuthority: "not-established" });
}
