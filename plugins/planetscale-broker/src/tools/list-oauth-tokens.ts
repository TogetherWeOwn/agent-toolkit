import { oauthTokenListScope, tokenRecordSummary, type TokenRecordSummary } from "../security-records.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_oauth_tokens";
export const tool = "planetscale.list_oauth_tokens";

export function prepare(scope: ReturnType<typeof oauthTokenListScope.parse>, args: unknown): PreparedRead<MetadataPage<TokenRecordSummary>> {
  const target = oauthTokenListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/oauth-applications/${target.applicationId}/tokens?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => tokenRecordSummary(row, target.tokenIds)));
}
