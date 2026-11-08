import { applicationListScope, applicationSummary, type ApplicationSummary } from "../organization-security.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_oauth_applications";
export const tool = "planetscale.list_oauth_applications";

export function prepare(scope: ReturnType<typeof applicationListScope.parse>, args: unknown): PreparedRead<MetadataPage<ApplicationSummary>> {
  const target = applicationListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/oauth-applications?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => applicationSummary(row, target.applicationIds)));
}
