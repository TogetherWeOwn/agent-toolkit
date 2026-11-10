import { serviceTokenScope, tokenRecordSummary, type TokenRecordSummary } from "../security-records.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_service_token";
export const tool = "planetscale.get_service_token";

export function prepare(scope: ReturnType<typeof serviceTokenScope.parse>, args: unknown): PreparedRead<TokenRecordSummary> {
  const target = serviceTokenScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/service-tokens/${target.tokenId}`,
    body => tokenRecordSummary(body, [target.tokenId]));
}
