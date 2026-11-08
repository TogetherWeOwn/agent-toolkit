import { invitationListScope, invitationSummary, type InvitationSummary } from "../organization-security.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_organization_invitations";
export const tool = "planetscale.list_organization_invitations";

export function prepare(scope: ReturnType<typeof invitationListScope.parse>, args: unknown): PreparedRead<MetadataPage<InvitationSummary>> {
  const target = invitationListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/invitations?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => invitationSummary(row, target.invitationIds)));
}
