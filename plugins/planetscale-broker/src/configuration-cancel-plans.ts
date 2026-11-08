import { closed, digest, identifier, oneOf } from "../../../packages/core/src/schema.js";
import { branchPath, emptyArguments, flag, slug } from "./metadata.js";
import type { PlanAuthority } from "./mutation-plans.js";

// Broker-owned identity/state snapshots do not authenticate remote preconditions.
const targetFields = {
  organization: slug, database: slug, databaseId: identifier,
  branch: slug, branchId: identifier, changeId: identifier, revision: digest,
  production: { parse: flag }, state: oneOf(["draft", "pending"] as const),
};
const branchTarget = closed({ ...targetFields, changeType: oneOf(["vtgate"] as const) });
const keyspaceTarget = closed({
  ...targetFields, keyspace: slug, keyspaceId: identifier,
  changeType: oneOf(["mysqld", "vttablet"] as const),
});
export interface ConfigurationCancelPlan {
  readonly kind: "validated-local-plan-not-provider-dry-run";
  readonly operationId: "cancel_branch_config_change_request" | "cancel_keyspace_config_change_request";
  readonly tool: string;
  readonly tier: "reserved";
  readonly target: ReturnType<typeof branchTarget.parse> | ReturnType<typeof keyspaceTarget.parse>;
  readonly arguments: Readonly<Record<string, never>>;
  readonly proposedRequest: Readonly<{
    method: "DELETE"; origin: "https://api.planetscale.com"; path: string; body: null;
  }>;
  readonly requiredAuthorities: readonly PlanAuthority[];
  readonly effect: "cancel-unapplied-config-request";
  readonly execution: "not-implemented";
  readonly remotePreconditions: "not-verified";
  readonly providerDryRun: "not-performed";
}

function plan(
  target: ConfigurationCancelPlan["target"], operationId: ConfigurationCancelPlan["operationId"], path: string,
): ConfigurationCancelPlan {
  return Object.freeze({
    kind: "validated-local-plan-not-provider-dry-run" as const,
    operationId, tool: `planetscale.${operationId}`, tier: "reserved" as const,
    target, arguments: Object.freeze({}),
    proposedRequest: Object.freeze({ method: "DELETE" as const, origin: "https://api.planetscale.com" as const, path, body: null }),
    requiredAuthorities: Object.freeze(["release-manager"] as const),
    effect: "cancel-unapplied-config-request" as const,
    execution: "not-implemented" as const, remotePreconditions: "not-verified" as const,
    providerDryRun: "not-performed" as const,
  });
}

export function prepareCancelBranchConfigChange(rawScope: unknown, rawArguments: unknown): ConfigurationCancelPlan {
  const scope = branchTarget.parse(rawScope);
  emptyArguments.parse(rawArguments);
  return plan(scope, "cancel_branch_config_change_request", `${branchPath(scope)}/config-changes/${scope.changeId}`);
}

export function prepareCancelKeyspaceConfigChange(rawScope: unknown, rawArguments: unknown): ConfigurationCancelPlan {
  const scope = keyspaceTarget.parse(rawScope);
  emptyArguments.parse(rawArguments);
  return plan(scope, "cancel_keyspace_config_change_request",
    `${branchPath(scope)}/keyspaces/${scope.keyspace}/config-changes/${scope.changeId}`);
}
