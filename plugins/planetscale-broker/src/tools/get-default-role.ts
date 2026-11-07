import { requireThat } from "../../../../packages/core/src/schema.js";
import { branchPath, branchScope, emptyArguments, prepared, roleMetadata, type BranchScope, type PreparedRead, type RoleMetadata } from "../metadata.js";

export const operationId = "get_default_role";
export const tool = "planetscale.get_default_role";

export function prepare(scope: BranchScope, args: unknown): PreparedRead<RoleMetadata> {
  const target = branchScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/roles/default`, body => {
    requireThat(body.default === true, "upstream");
    return roleMetadata(body);
  });
}
