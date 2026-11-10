import { closed, digest, identifier, integer, oneOf } from "../../../packages/core/src/schema.js";
import { emptyArguments, flag, slug } from "./metadata.js";
import type { PlanAuthority } from "./mutation-plans.js";

// The recommendation response lacks database identity; bind it independently.
const recommendationTarget = closed({
  organization: slug, database: slug, databaseId: identifier,
  recommendationId: identifier, number: integer(1, Number.MAX_SAFE_INTEGER), revision: digest,
  production: { parse: flag }, state: oneOf(["open"] as const),
});
export interface RecommendationDismissalPlan {
  readonly kind: "validated-local-plan-not-provider-dry-run";
  readonly operationId: "dismiss_schema_recommendation";
  readonly tool: "planetscale.dismiss_schema_recommendation";
  readonly tier: "reserved";
  readonly target: ReturnType<typeof recommendationTarget.parse>;
  readonly arguments: Readonly<Record<string, never>>;
  readonly proposedRequest: Readonly<{
    method: "POST"; origin: "https://api.planetscale.com"; path: string;
    body: Readonly<Record<string, never>>;
  }>;
  readonly requiredAuthorities: readonly PlanAuthority[];
  readonly effect: "dismiss-one-open-schema-recommendation";
  readonly execution: "not-implemented";
  readonly remotePreconditions: "not-verified";
  readonly providerDryRun: "not-performed";
}

export function prepareDismissSchemaRecommendation(rawScope: unknown, rawArguments: unknown): RecommendationDismissalPlan {
  const scope = recommendationTarget.parse(rawScope);
  emptyArguments.parse(rawArguments);
  return Object.freeze({
    kind: "validated-local-plan-not-provider-dry-run" as const,
    operationId: "dismiss_schema_recommendation" as const, tool: "planetscale.dismiss_schema_recommendation" as const,
    tier: "reserved" as const, target: scope, arguments: Object.freeze({}),
    proposedRequest: Object.freeze({
      method: "POST" as const, origin: "https://api.planetscale.com" as const,
      path: `/v1/organizations/${scope.organization}/databases/${scope.database}/schema-recommendations/${scope.number}/dismiss`,
      body: Object.freeze({}),
    }),
    requiredAuthorities: Object.freeze(["release-manager"] as const),
    effect: "dismiss-one-open-schema-recommendation" as const,
    execution: "not-implemented" as const, remotePreconditions: "not-verified" as const,
    providerDryRun: "not-performed" as const,
  });
}
