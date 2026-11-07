import { branchPath, branchScope, emptyArguments, flag, identity, prepared, type BranchScope, type PreparedRead } from "../metadata.js";

export const operationId = "get_branch";
export const tool = "planetscale.get_branch";
export interface BranchMetadata { readonly name: string; readonly ready: boolean; readonly production: boolean; readonly deletionProtected: boolean; readonly safeMigrations: boolean }

export function prepare(scope: BranchScope, args: unknown): PreparedRead<BranchMetadata> {
  const target = branchScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(branchPath(target), body => Object.freeze({
    name: identity(body, target.branch), ready: flag(body.ready), production: flag(body.production),
    deletionProtected: flag(body.deletion_protected), safeMigrations: flag(body.safe_migrations),
  }));
}
