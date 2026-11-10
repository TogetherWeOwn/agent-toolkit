import { backupPolicyListScope, backupPolicySummary, type BackupPolicySummary } from "../lifecycle.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_backup_policies";
export const tool = "planetscale.list_backup_policies";

export function prepare(scope: ReturnType<typeof backupPolicyListScope.parse>, args: unknown): PreparedRead<MetadataPage<BackupPolicySummary>> {
  const target = backupPolicyListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/backup-policies?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => backupPolicySummary(row, target.policyIds)));
}
