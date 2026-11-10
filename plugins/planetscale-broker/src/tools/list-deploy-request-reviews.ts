import { deployChildScope, deployReviewSummary, type DeployReviewSummary } from "../deployment-details.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_deploy_request_reviews";
export const tool = "planetscale.list_deploy_request_reviews";

export function prepare(scope: ReturnType<typeof deployChildScope.parse>, args: unknown): PreparedRead<MetadataPage<DeployReviewSummary>> {
  const target = deployChildScope.parse(scope);
  const input = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/deploy-requests/${target.request.number}/reviews?page=${input.page}&per_page=${input.perPage}`,
    body => page(body, input, row => deployReviewSummary(row, target.childIds)));
}
