import { closed, identifier, oneOf, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { flag, slug } from "./metadata.js";
import { timestampPresent } from "./security-records.js";

const ids: Schema<readonly string[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => identifier.parse(item));
  requireThat(new Set(parsed).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };
// Child ID confinement does not prove parent ownership or collection authority.
export const applicationScope = closed({ organization: slug, applicationId: identifier });
export const applicationListScope = closed({ organization: slug, applicationIds: ids });
export const ssoScope = closed({ organization: slug, organizationId: identifier });
export const domainScope = closed({ organization: slug, domainId: identifier });
export const domainListScope = closed({ organization: slug, domainIds: ids });
export const invitationListScope = closed({ organization: slug, invitationIds: ids });

function matchedId(body: Record<string, unknown>, allowed: readonly string[]): string {
  const id = identifier.parse(body.id);
  requireThat(allowed.includes(id), "scope");
  return id;
}

export interface ApplicationSummary {
  readonly id: string;
  readonly dynamicRegistration: boolean;
  readonly singleOrganization: boolean;
  readonly requiresOrganizationScope: boolean;
  readonly effectiveAuthority: "not-established";
}
export function applicationSummary(body: Record<string, unknown>, allowed: readonly string[]): ApplicationSummary {
  return Object.freeze({
    id: matchedId(body, allowed), dynamicRegistration: flag(body.dcr),
    singleOrganization: flag(body.single_org_authorization),
    requiresOrganizationScope: flag(body.requires_org_scope), effectiveAuthority: "not-established" as const,
  });
}

export interface SsoSummary {
  readonly id: string;
  readonly enabled: boolean;
  readonly configured: boolean;
  readonly directory: boolean;
  readonly hasVerifiedDomain: boolean;
  readonly effectiveAuthority: "not-established";
}
export function ssoSummary(body: Record<string, unknown>, expected: string): SsoSummary {
  requireThat(body.type === "OrganizationSSO", "upstream");
  return Object.freeze({
    id: matchedId(body, [expected]), enabled: flag(body.enabled), configured: flag(body.configured),
    directory: flag(body.directory), hasVerifiedDomain: flag(body.has_verified_domain),
    effectiveAuthority: "not-established" as const,
  });
}

export const domainState = oneOf(["pending", "verified", "failed"] as const);
export interface DomainSummary {
  readonly id: string;
  readonly state: ReturnType<typeof domainState.parse>;
  readonly verificationRecorded: boolean;
}
export function domainSummary(body: Record<string, unknown>, allowed: readonly string[]): DomainSummary {
  requireThat(body.type === "OrganizationDomain", "upstream");
  return Object.freeze({
    id: matchedId(body, allowed), state: domainState.parse(body.state),
    verificationRecorded: timestampPresent(body.verified_at),
  });
}

export const invitationRole = oneOf(["admin", "analyst", "member"] as const);
export interface InvitationSummary {
  readonly id: string;
  readonly role: ReturnType<typeof invitationRole.parse>;
  readonly expired: boolean;
  readonly effectiveAuthority: "not-established";
}
export function invitationSummary(body: Record<string, unknown>, allowed: readonly string[]): InvitationSummary {
  // Pending invitation roles are metadata, not accepted membership or grants.
  return Object.freeze({
    id: matchedId(body, allowed), role: invitationRole.parse(body.role), expired: flag(body.expired),
    effectiveAuthority: "not-established" as const,
  });
}
