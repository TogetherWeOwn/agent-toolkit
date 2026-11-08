import { closed, digest, identifier, oneOf, requireThat } from "../../../packages/core/src/schema.js";
import { branchPath, emptyArguments, flag, slug } from "./metadata.js";
import type { PlanAuthority } from "./mutation-plans.js";

// Broker-owned snapshots are inputs to previews, not authenticated preconditions.
const databaseShape = { organization: slug, database: slug, databaseId: identifier, revision: digest };
const backupTarget = closed({
  ...databaseShape, branch: slug, branchId: identifier, backupId: identifier,
  production: { parse: flag }, protected: { parse: flag }, required: { parse: flag },
  state: oneOf(["success"] as const),
});
const policyTarget = closed({
  ...databaseShape, policyId: identifier, target: oneOf(["production", "development"] as const),
  required: { parse: flag },
});

type BackupTarget = ReturnType<typeof backupTarget.parse>;
type PolicyTarget = ReturnType<typeof policyTarget.parse>;
export interface BackupDeletionPlan {
  readonly kind: "validated-local-plan-not-provider-dry-run";
  readonly operationId: "delete_backup" | "delete_backup_policy";
  readonly tool: string;
  readonly tier: "reserved";
  readonly target: BackupTarget | PolicyTarget;
  readonly arguments: Readonly<Record<string, never>>;
  readonly proposedRequest: Readonly<{
    method: "DELETE"; origin: "https://api.planetscale.com"; path: string; body: null;
  }>;
  readonly requiredAuthorities: readonly PlanAuthority[];
  readonly effect: "delete-one-backup" | "remove-backup-policy";
  readonly execution: "not-implemented";
  readonly remotePreconditions: "not-verified";
  readonly providerDryRun: "not-performed";
}

function plan(
  target: BackupDeletionPlan["target"], operationId: BackupDeletionPlan["operationId"],
  path: string, effect: BackupDeletionPlan["effect"], authorities: readonly PlanAuthority[],
): BackupDeletionPlan {
  return Object.freeze({
    kind: "validated-local-plan-not-provider-dry-run" as const,
    operationId, tool: `planetscale.${operationId}`, tier: "reserved" as const,
    target, arguments: Object.freeze({}),
    proposedRequest: Object.freeze({ method: "DELETE" as const, origin: "https://api.planetscale.com" as const, path, body: null }),
    requiredAuthorities: Object.freeze([...authorities]), effect,
    execution: "not-implemented" as const, remotePreconditions: "not-verified" as const,
    providerDryRun: "not-performed" as const,
  });
}

export function prepareDeleteBackup(rawScope: unknown, rawArguments: unknown): BackupDeletionPlan {
  const scope = backupTarget.parse(rawScope);
  emptyArguments.parse(rawArguments);
  requireThat(!scope.protected && !scope.required, "scope");
  return plan(scope, "delete_backup", `${branchPath(scope)}/backups/${scope.backupId}`,
    "delete-one-backup", ["release-manager"]);
}

export function prepareDeleteBackupPolicy(rawScope: unknown, rawArguments: unknown): BackupDeletionPlan {
  const scope = policyTarget.parse(rawScope);
  emptyArguments.parse(rawArguments);
  requireThat(!scope.required, "scope");
  return plan(scope, "delete_backup_policy",
    `/v1/organizations/${scope.organization}/databases/${scope.database}/backup-policies/${scope.policyId}`,
    "remove-backup-policy", ["release-manager", "owner-security"]);
}
