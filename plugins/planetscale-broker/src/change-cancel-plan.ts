import { closed, digest, identifier, oneOf, requireThat } from "../../../packages/core/src/schema.js";
import { branchPath, emptyArguments, flag, slug } from "./metadata.js";
import type { PlanAuthority } from "./mutation-plans.js";
import { changeTargetType, changeType } from "./unified-change-records.js";

// A snapshot confines a preview; it does not authenticate ownership or current state.
const changeTarget = closed({
  organization: slug, database: slug, databaseId: identifier,
  branch: slug, branchId: identifier, changeId: identifier, revision: digest,
  production: { parse: flag }, state: oneOf(["draft", "pending"] as const),
  canDelete: { parse: flag }, changeType, targetType: changeTargetType,
  targetId: identifier, targetName: slug,
});
export interface ChangeCancelPlan {
  readonly kind: "validated-local-plan-not-provider-dry-run";
  readonly operationId: "cancel_change_request";
  readonly tool: "planetscale.cancel_change_request";
  readonly tier: "reserved";
  readonly target: ReturnType<typeof changeTarget.parse>;
  readonly arguments: Readonly<Record<string, never>>;
  readonly proposedRequest: Readonly<{
    method: "DELETE"; origin: "https://api.planetscale.com"; path: string; body: null;
  }>;
  readonly requiredAuthorities: readonly PlanAuthority[];
  readonly effect: "cancel-individual-unapplied-change-request";
  readonly execution: "not-implemented";
  readonly remotePreconditions: "not-verified";
  readonly providerDryRun: "not-performed";
}

export function prepareCancelChangeRequest(rawScope: unknown, rawArguments: unknown): ChangeCancelPlan {
  const scope = changeTarget.parse(rawScope);
  emptyArguments.parse(rawArguments);
  // can_delete and the narrower local states are refusal guards, never native authority.
  requireThat(scope.canDelete && scope.changeType === `${scope.targetType}ChangeRequest`, "scope");
  return Object.freeze({
    kind: "validated-local-plan-not-provider-dry-run" as const,
    operationId: "cancel_change_request" as const, tool: "planetscale.cancel_change_request" as const,
    tier: "reserved" as const, target: scope, arguments: Object.freeze({}),
    proposedRequest: Object.freeze({
      method: "DELETE" as const, origin: "https://api.planetscale.com" as const,
      path: `${branchPath(scope)}/change-requests/${scope.changeId}`, body: null,
    }),
    requiredAuthorities: Object.freeze(["release-manager"] as const),
    effect: "cancel-individual-unapplied-change-request" as const,
    execution: "not-implemented" as const, remotePreconditions: "not-verified" as const,
    providerDryRun: "not-performed" as const,
  });
}
