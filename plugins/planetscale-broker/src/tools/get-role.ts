import { requireThat } from "../../../../packages/core/src/schema.js";
import { branchPath, emptyArguments, prepared, roleMetadata, roleScope, type PreparedRead, type RoleMetadata, type RoleScope } from "../metadata.js";

export const operationId = "get_role";
export const tool = "planetscale.get_role";

export function prepare(scope: RoleScope, args: unknown): PreparedRead<RoleMetadata> {
  const target = roleScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/roles/${target.roleId}`, body => {
    requireThat(body.id === target.roleId, "scope");
    return roleMetadata(body);
  });
}
