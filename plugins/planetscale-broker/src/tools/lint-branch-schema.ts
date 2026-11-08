import { branchPath, page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";
import { lintScope, lintSubjectSummary, type LintSubjectSummary } from "../schema-diagnostics.js";

export const operationId = "lint_branch_schema";
export const tool = "planetscale.lint_branch_schema";

export function prepare(scope: ReturnType<typeof lintScope.parse>, args: unknown): PreparedRead<MetadataPage<LintSubjectSummary>> {
  const target = lintScope.parse(scope);
  const input = pageArguments.parse(args);
  return prepared(`${branchPath(target)}/schema/lint?page=${input.page}&per_page=${input.perPage}`,
    body => page(body, input, row => lintSubjectSummary(row, target.keyspaceNames)));
}
