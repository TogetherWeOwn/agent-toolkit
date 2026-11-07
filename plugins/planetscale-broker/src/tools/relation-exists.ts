import { closed, requireThat, text } from "../../../../packages/core/src/schema.js";
import { branchPath, branchScope, prepared, record, type BranchScope, type PreparedRead } from "../metadata.js";

export const operationId = "get_branch_schema";
export const tool = "planetscale.relation_exists";
const relation = text(63, /^[A-Za-z_][A-Za-z0-9_]*$/);
const argumentsSchema = closed({ relation });
export interface RelationExistence { readonly relation: string; readonly exists: boolean }

// This is a control-plane schema projection, not proof of effective catalog ACLs
// or of non-waking semantics. No raw DDL, HTML, customer rows or SQL is returned.
export function prepare(scope: BranchScope, args: unknown): PreparedRead<RelationExistence> {
  const target = branchScope.parse(scope);
  const parsed = argumentsSchema.parse(args);
  return prepared(`${branchPath(target)}/schema`, body => {
    requireThat(Array.isArray(body.data) && body.data.length <= 1000, "upstream");
    const names = body.data.map(value => relation.parse(record(value).name));
    requireThat(new Set(names).size === names.length, "upstream");
    return Object.freeze({ relation: parsed.relation, exists: names.includes(parsed.relation) });
  });
}
