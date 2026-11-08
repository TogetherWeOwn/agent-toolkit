import { closed, digest, identifier, oneOf } from "../../../packages/core/src/schema.js";
import { branchPath, emptyArguments, flag, slug } from "./metadata.js";
import type { PlanAuthority } from "./mutation-plans.js";

// Parent IDs require independent trusted bindings; the report response lacks them.
const reportTarget = closed({
  organization: slug, database: slug, databaseId: identifier,
  branch: slug, branchId: identifier, reportId: identifier, revision: digest,
  production: { parse: flag }, state: oneOf(["completed", "failed"] as const),
});
export interface QueryReportDeletionPlan {
  readonly kind: "validated-local-plan-not-provider-dry-run";
  readonly operationId: "delete_query_patterns_report";
  readonly tool: "planetscale.delete_query_patterns_report";
  readonly tier: "reserved";
  readonly target: ReturnType<typeof reportTarget.parse>;
  readonly arguments: Readonly<Record<string, never>>;
  readonly proposedRequest: Readonly<{
    method: "DELETE"; origin: "https://api.planetscale.com"; path: string; body: null;
  }>;
  readonly requiredAuthorities: readonly PlanAuthority[];
  readonly effect: "delete-one-query-patterns-report";
  readonly execution: "not-implemented";
  readonly remotePreconditions: "not-verified";
  readonly providerDryRun: "not-performed";
}

export function prepareDeleteQueryPatternsReport(rawScope: unknown, rawArguments: unknown): QueryReportDeletionPlan {
  const scope = reportTarget.parse(rawScope);
  emptyArguments.parse(rawArguments);
  // Official read_branch entitlement does not make this destructive DELETE a read.
  return Object.freeze({
    kind: "validated-local-plan-not-provider-dry-run" as const,
    operationId: "delete_query_patterns_report" as const, tool: "planetscale.delete_query_patterns_report" as const,
    tier: "reserved" as const, target: scope, arguments: Object.freeze({}),
    proposedRequest: Object.freeze({
      method: "DELETE" as const, origin: "https://api.planetscale.com" as const,
      path: `${branchPath(scope)}/query-patterns/${scope.reportId}`, body: null,
    }),
    requiredAuthorities: Object.freeze(["release-manager"] as const),
    effect: "delete-one-query-patterns-report" as const,
    execution: "not-implemented" as const, remotePreconditions: "not-verified" as const,
    providerDryRun: "not-performed" as const,
  });
}
