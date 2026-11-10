import { oauthTokenScope, tokenRecordSummary, type TokenRecordSummary } from "../security-records.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_oauth_token";
export const tool = "planetscale.get_oauth_token";

export function prepare(scope: ReturnType<typeof oauthTokenScope.parse>, args: unknown): PreparedRead<TokenRecordSummary> {
  const target = oauthTokenScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/oauth-applications/${target.applicationId}/tokens/${target.tokenId}`,
    body => tokenRecordSummary(body, [target.tokenId]));
}
