import { branchPath, branchScope, page, pageArguments, passwordMetadata, prepared, type BranchScope, type MetadataPage, type PasswordMetadata, type PreparedRead } from "../metadata.js";

export const operationId = "list_passwords";
export const tool = "planetscale.list_passwords";

export function prepare(scope: BranchScope, args: unknown): PreparedRead<MetadataPage<PasswordMetadata>> {
  const target = branchScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`${branchPath(target)}/passwords?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, passwordMetadata));
}
