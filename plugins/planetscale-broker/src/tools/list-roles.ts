import { branchPath, branchScope, page, pageArguments, prepared, roleMetadata, type BranchScope, type MetadataPage, type PreparedRead, type RoleMetadata } from "../metadata.js";

export const operationId = "list_roles";
export const tool = "planetscale.list_roles";

export function prepare(scope: BranchScope, args: unknown): PreparedRead<MetadataPage<RoleMetadata>> {
  const target = branchScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`${branchPath(target)}/roles?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, roleMetadata));
}
