import type { Prepared } from "../../../packages/core/src/provider/contracts.js";
import { jsonData } from "../../../packages/core/src/schema.js";
import { prepareDeleteBackup, prepareDeleteBackupPolicy, type BackupDeletionPlan } from "./backup-deletion-plans.js";
import { prepareDeleteBranch, type MutationPlan } from "./mutation-plans.js";
import { prepareCloseDeployRequest, prepareCancelDeployRequest, type DeploymentStopPlan } from "./deployment-stop-plans.js";
import { prepareCancelBranchConfigChange, prepareCancelKeyspaceConfigChange, type ConfigurationCancelPlan } from "./configuration-cancel-plans.js";

function preparedPreview(id: string, preview: MutationPlan | BackupDeletionPlan | DeploymentStopPlan | ConfigurationCancelPlan): Prepared {
  const prepared = Object.freeze({
    resource: Object.freeze({ id, revision: preview.target.revision }),
    arguments: preview.arguments,
    plan: Object.freeze({ ...preview }),
    artifactDigest: null,
  });
  jsonData(prepared);
  return prepared;
}

// Pure preparation only, not ProviderOperations or runtime registration. The
// trusted host supplies these bindings; copied IDs/revisions confer no authority.
export function bindDeleteBranchPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = prepareDeleteBranch(rawTarget, {}).target;
  return (raw: unknown): Prepared => preparedPreview(
    `planetscale/branch/${target.branchId}`, prepareDeleteBranch(target, raw),
  );
}

export function bindDeleteBackupPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = prepareDeleteBackup(rawTarget, {}).target;
  return (raw: unknown): Prepared => preparedPreview(
    `planetscale/backup/${target.backupId}`, prepareDeleteBackup(target, raw),
  );
}

export function bindDeleteBackupPolicyPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = prepareDeleteBackupPolicy(rawTarget, {}).target;
  return (raw: unknown): Prepared => preparedPreview(
    `planetscale/backup-policy/${target.policyId}`, prepareDeleteBackupPolicy(target, raw),
  );
}

export function bindCloseDeployRequestPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = prepareCloseDeployRequest(rawTarget, {}).target;
  return (raw: unknown): Prepared => preparedPreview(
    `planetscale/deploy-request/${target.requestId}`, prepareCloseDeployRequest(target, raw),
  );
}

export function bindCancelDeployRequestPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = prepareCancelDeployRequest(rawTarget, {}).target;
  return (raw: unknown): Prepared => preparedPreview(
    `planetscale/deploy-request/${target.requestId}`, prepareCancelDeployRequest(target, raw),
  );
}

export function bindCancelBranchConfigChangePreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = prepareCancelBranchConfigChange(rawTarget, {}).target;
  return (raw: unknown): Prepared => preparedPreview(
    `planetscale/branch-config-change/${target.changeId}`, prepareCancelBranchConfigChange(target, raw),
  );
}

export function bindCancelKeyspaceConfigChangePreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = prepareCancelKeyspaceConfigChange(rawTarget, {}).target;
  return (raw: unknown): Prepared => preparedPreview(
    `planetscale/keyspace-config-change/${target.changeId}`, prepareCancelKeyspaceConfigChange(target, raw),
  );
}
