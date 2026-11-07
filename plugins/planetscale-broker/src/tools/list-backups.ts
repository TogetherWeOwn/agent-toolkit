import { backupListScope, backupSummary, type BackupSummary } from "../lifecycle.js";
import { branchPath, page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_backups";
export const tool = "planetscale.list_backups";

export function prepare(scope: ReturnType<typeof backupListScope.parse>, args: unknown): PreparedRead<MetadataPage<BackupSummary>> {
  const target = backupListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`${branchPath(target)}/backups?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => backupSummary(row, target.backupIds)));
}
