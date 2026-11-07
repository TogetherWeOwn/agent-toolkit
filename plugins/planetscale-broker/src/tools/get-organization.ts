import { emptyArguments, flag, identity, organizationScope, prepared, type OrganizationScope, type PreparedRead } from "../metadata.js";

export const operationId = "get_organization";
export const tool = "planetscale.get_organization";
export interface OrganizationMetadata { readonly name: string; readonly sso: boolean }

export function prepare(scope: OrganizationScope, args: unknown): PreparedRead<OrganizationMetadata> {
  const target = organizationScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}`, body => Object.freeze({
    name: identity(body, target.organization), sso: flag(body.sso),
  }));
}
