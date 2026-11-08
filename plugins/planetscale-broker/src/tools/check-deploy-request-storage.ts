import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";
import { storageCheckScope, storageCheckSummary, type StorageCheckSummary } from "../schema-diagnostics.js";

export const operationId = "check_deploy_request_storage";
export const tool = "planetscale.check_deploy_request_storage";

export function prepare(scope: ReturnType<typeof storageCheckScope.parse>, args: unknown): PreparedRead<StorageCheckSummary> {
  const target = storageCheckScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/deploy-requests/${target.number}/storage-check`,
    body => storageCheckSummary(body));
}
