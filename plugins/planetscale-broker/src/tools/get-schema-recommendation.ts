import { recommendationScope, recommendationSummary, type RecommendationSummary } from "../deployment-details.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_schema_recommendation";
export const tool = "planetscale.get_schema_recommendation";

export function prepare(scope: ReturnType<typeof recommendationScope.parse>, args: unknown): PreparedRead<RecommendationSummary> {
  const target = recommendationScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/schema-recommendations/${target.recommendation.number}`,
    body => recommendationSummary(body, [target.recommendation]));
}
