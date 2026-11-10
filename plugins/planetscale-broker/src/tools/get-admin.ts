import { adminScope, adminSummary, type AdminSummary } from "../compute-catalog.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_admin";
export const tool = "planetscale.get_admin";

export function prepare(scope: ReturnType<typeof adminScope.parse>, args: unknown): PreparedRead<AdminSummary> {
  const target = adminScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/admin`, body => adminSummary(body, target.adminId));
}
