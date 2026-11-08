import type { Prepared } from "../../../packages/core/src/provider/contracts.js";
import { jsonData } from "../../../packages/core/src/schema.js";
import { prepareDeleteBranch } from "./mutation-plans.js";

// Pure preparation only, not a ProviderOperation or runtime registration. The
// trusted host supplies this binding; copied IDs/revisions confer no authority.
export function bindDeleteBranchPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = prepareDeleteBranch(rawTarget, {}).target;
  return (raw: unknown): Prepared => {
    const preview = prepareDeleteBranch(target, raw);
    const prepared = Object.freeze({
      resource: Object.freeze({ id: `planetscale/branch/${target.branchId}`, revision: target.revision }),
      arguments: preview.arguments,
      plan: Object.freeze({ ...preview }),
      artifactDigest: null,
    });
    jsonData(prepared);
    return prepared;
  };
}
