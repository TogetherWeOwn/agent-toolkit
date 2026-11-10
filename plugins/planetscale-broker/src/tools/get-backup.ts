import { backupScope, backupSummary, type BackupSummary } from "../lifecycle.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_backup";
export const tool = "planetscale.get_backup";

export function prepare(scope: ReturnType<typeof backupScope.parse>, args: unknown): PreparedRead<BackupSummary> {
  const target = backupScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/backups/${target.backupId}`, body => backupSummary(body, [target.backupId]));
}
