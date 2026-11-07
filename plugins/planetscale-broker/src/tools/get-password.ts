import { requireThat } from "../../../../packages/core/src/schema.js";
import { branchPath, emptyArguments, passwordMetadata, passwordScope, prepared, type PasswordMetadata, type PasswordScope, type PreparedRead } from "../metadata.js";

export const operationId = "get_password";
export const tool = "planetscale.get_password";

export function prepare(scope: PasswordScope, args: unknown): PreparedRead<PasswordMetadata> {
  const target = passwordScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/passwords/${target.passwordId}`, body => {
    requireThat(body.id === target.passwordId, "scope");
    return passwordMetadata(body);
  });
}
