import { closed, digest, identifier, oneOf, requireThat } from "../../../packages/core/src/schema.js";
import { deployNumber, deploymentState } from "./lifecycle.js";
import { emptyArguments, flag, slug } from "./metadata.js";
import type { PlanAuthority } from "./mutation-plans.js";

// Destination IDs require an independent broker binding: the request response
// supplies only into_branch. Snapshots do not authenticate remote preconditions.
const targetSchema = closed({
  organization: slug, database: slug, databaseId: identifier,
  requestId: identifier, number: deployNumber, revision: digest,
  branch: slug, branchId: identifier, intoBranch: slug, intoBranchId: identifier,
  production: { parse: flag }, branchDeleted: { parse: flag },
  state: oneOf(["open"] as const), deploymentState,
});
type DeployTarget = ReturnType<typeof targetSchema.parse>;
export interface DeploymentStopPlan {
  readonly kind: "validated-local-plan-not-provider-dry-run";
  readonly operationId: "close_deploy_request" | "cancel_deploy_request";
  readonly tool: string;
  readonly tier: "reserved";
  readonly target: DeployTarget;
  readonly arguments: Readonly<Record<string, never>>;
  readonly proposedRequest: Readonly<{
    method: "PATCH" | "POST"; origin: "https://api.planetscale.com"; path: string;
    body: Readonly<{ state: "closed" }> | null;
  }>;
  readonly requiredAuthorities: readonly PlanAuthority[];
  readonly effect: "close-undeployed-request" | "cancel-queued-request";
  readonly execution: "not-implemented";
  readonly remotePreconditions: "not-verified";
  readonly providerDryRun: "not-performed";
}

function target(rawScope: unknown, rawArguments: unknown): DeployTarget {
  const scope = targetSchema.parse(rawScope);
  emptyArguments.parse(rawArguments);
  requireThat(!scope.branchDeleted && scope.branchId !== scope.intoBranchId && scope.branch !== scope.intoBranch, "scope");
  return scope;
}
function plan(scope: DeployTarget, cancel: boolean): DeploymentStopPlan {
  const operationId = cancel ? "cancel_deploy_request" : "close_deploy_request";
  const path = `/v1/organizations/${scope.organization}/databases/${scope.database}/deploy-requests/${scope.number}`;
  return Object.freeze({
    kind: "validated-local-plan-not-provider-dry-run" as const,
    operationId, tool: `planetscale.${operationId}`, tier: "reserved" as const,
    target: scope, arguments: Object.freeze({}),
    proposedRequest: Object.freeze({
      method: cancel ? "POST" as const : "PATCH" as const,
      origin: "https://api.planetscale.com" as const, path: cancel ? `${path}/cancel` : path,
      body: cancel ? null : Object.freeze({ state: "closed" as const }),
    }),
    requiredAuthorities: Object.freeze(["release-manager"] as const),
    effect: cancel ? "cancel-queued-request" as const : "close-undeployed-request" as const,
    execution: "not-implemented" as const, remotePreconditions: "not-verified" as const,
    providerDryRun: "not-performed" as const,
  });
}

export function prepareCloseDeployRequest(rawScope: unknown, rawArguments: unknown): DeploymentStopPlan {
  const scope = target(rawScope, rawArguments);
  requireThat(["pending", "ready", "no_changes"].includes(scope.deploymentState), "scope");
  return plan(scope, false);
}
export function prepareCancelDeployRequest(rawScope: unknown, rawArguments: unknown): DeploymentStopPlan {
  const scope = target(rawScope, rawArguments);
  requireThat(scope.deploymentState === "queued", "scope");
  return plan(scope, true);
}
