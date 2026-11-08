import type { Prepared } from "../../../packages/core/src/provider/contracts.js";
import { jsonData } from "../../../packages/core/src/schema.js";
import { prepareDeleteBackup, prepareDeleteBackupPolicy, type BackupDeletionPlan } from "./backup-deletion-plans.js";
import { parseBranchPlanTarget, prepareCreateBackup, prepareDeleteBranch, prepareDisableSafeMigrations, type MutationPlan } from "./mutation-plans.js";
import { prepareCloseDeployRequest, prepareCancelDeployRequest, type DeploymentStopPlan } from "./deployment-stop-plans.js";
import { prepareCancelBranchConfigChange, prepareCancelKeyspaceConfigChange, type ConfigurationCancelPlan } from "./configuration-cancel-plans.js";

import { prepareCancelChangeRequest, type ChangeCancelPlan } from "./change-cancel-plan.js";
import { prepareDeleteQueryPatternsReport, type QueryReportDeletionPlan } from "./query-report-deletion-plan.js";
import { prepareDismissSchemaRecommendation, type RecommendationDismissalPlan } from "./recommendation-dismissal-plan.js";

function preparedPreview(id: string, preview: MutationPlan | BackupDeletionPlan | DeploymentStopPlan | ConfigurationCancelPlan | ChangeCancelPlan | QueryReportDeletionPlan | RecommendationDismissalPlan): Prepared {
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

export function bindCreateBackupPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = parseBranchPlanTarget(rawTarget);
  return (raw: unknown): Prepared => preparedPreview(
    `planetscale/branch/${target.branchId}`, prepareCreateBackup(target, raw),
  );
}

export function bindDisableSafeMigrationsPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = prepareDisableSafeMigrations(rawTarget, {}).target;
  return (raw: unknown): Prepared => preparedPreview(
    `planetscale/branch/${target.branchId}`, prepareDisableSafeMigrations(target, raw),
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

export function bindCancelChangeRequestPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = prepareCancelChangeRequest(rawTarget, {}).target;
  return (raw: unknown): Prepared => preparedPreview(
    `planetscale/change-request/${target.changeId}`, prepareCancelChangeRequest(target, raw),
  );
}

export function bindDeleteQueryPatternsReportPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = prepareDeleteQueryPatternsReport(rawTarget, {}).target;
  return (raw: unknown): Prepared => preparedPreview(
    `planetscale/query-patterns-report/${target.reportId}`, prepareDeleteQueryPatternsReport(target, raw),
  );
}

export function bindDismissSchemaRecommendationPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = prepareDismissSchemaRecommendation(rawTarget, {}).target;
  return (raw: unknown): Prepared => preparedPreview(
    `planetscale/schema-recommendation/${target.recommendationId}`, prepareDismissSchemaRecommendation(target, raw),
  );
}
