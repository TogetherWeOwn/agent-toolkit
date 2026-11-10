import { extensionScope, extensionSummary, type ExtensionSummary } from "../configuration-definitions.js";
import { branchPath, emptyArguments, preparedArray, type PreparedRead } from "../metadata.js";

export const operationId = "list_extensions";
export const tool = "planetscale.list_extensions";

export function prepare(scope: ReturnType<typeof extensionScope.parse>, args: unknown): PreparedRead<readonly ExtensionSummary[]> {
  const target = extensionScope.parse(scope);
  emptyArguments.parse(args);
  return preparedArray(`${branchPath(target)}/extensions`, body => extensionSummary(body, target.extensions));
}
