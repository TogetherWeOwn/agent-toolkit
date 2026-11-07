import { recommendationListScope, recommendationSummary, type RecommendationSummary } from "../deployment-details.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_schema_recommendations";
export const tool = "planetscale.list_schema_recommendations";

export function prepare(scope: ReturnType<typeof recommendationListScope.parse>, args: unknown): PreparedRead<MetadataPage<RecommendationSummary>> {
  const target = recommendationListScope.parse(scope);
  const input = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/schema-recommendations?page=${input.page}&per_page=${input.perPage}`,
    body => page(body, input, row => recommendationSummary(row, target.recommendations)));
}
