import { backupPolicyScope, backupPolicySummary, type BackupPolicySummary } from "../lifecycle.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_backup_policy";
export const tool = "planetscale.get_backup_policy";

export function prepare(scope: ReturnType<typeof backupPolicyScope.parse>, args: unknown): PreparedRead<BackupPolicySummary> {
  const target = backupPolicyScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/backup-policies/${target.policyId}`,
    body => backupPolicySummary(body, [target.policyId]));
}
