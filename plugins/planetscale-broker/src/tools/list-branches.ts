import { branchDiscoveryScope, branchSummary, type BranchDiscoveryScope, type BranchSummary } from "../discovery.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_branches";
export const tool = "planetscale.list_branches";

export function prepare(scope: BranchDiscoveryScope, args: unknown): PreparedRead<MetadataPage<BranchSummary>> {
  const target = branchDiscoveryScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/branches?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => branchSummary(row, target.branches)));
}
