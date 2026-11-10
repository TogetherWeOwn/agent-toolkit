import { serviceTokenListScope, tokenRecordSummary, type TokenRecordSummary } from "../security-records.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_service_tokens";
export const tool = "planetscale.list_service_tokens";

export function prepare(scope: ReturnType<typeof serviceTokenListScope.parse>, args: unknown): PreparedRead<MetadataPage<TokenRecordSummary>> {
  const target = serviceTokenListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/service-tokens?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => tokenRecordSummary(row, target.tokenIds)));
}
