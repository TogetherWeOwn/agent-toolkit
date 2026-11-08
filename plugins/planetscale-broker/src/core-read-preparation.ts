import type { Prepared } from "../../../packages/core/src/provider/contracts.js";
import { closed, digest, identifier, jsonData } from "../../../packages/core/src/schema.js";
import { emptyArguments, slug, type PreparedRead } from "./metadata.js";
import { prepare as prepareOrganization } from "./tools/get-organization.js";
import { prepare as prepareDatabase } from "./tools/get-database.js";
import { prepare as prepareBranch } from "./tools/get-branch.js";

const organizationFields = { organization: slug, organizationId: identifier, revision: digest };
const databaseFields = { ...organizationFields, database: slug, databaseId: identifier };
const organizationTarget = closed(organizationFields);
const databaseTarget = closed(databaseFields);
const branchTarget = closed({ ...databaseFields, branch: slug, branchId: identifier });

type ReadTarget = ReturnType<typeof organizationTarget.parse> | ReturnType<typeof databaseTarget.parse> |
  ReturnType<typeof branchTarget.parse>;

// Pure preparation only. Host IDs/revisions bind a snapshot, not permission or
// immutable response identity: these existing projections match names only.
function bindRead(
  id: string, target: ReadTarget, operationId: "get_organization" | "get_database" | "get_branch",
  request: PreparedRead<unknown>["request"],
): (raw: unknown) => Prepared {
  return (raw: unknown): Prepared => {
    emptyArguments.parse(raw);
    const prepared = Object.freeze({
      resource: Object.freeze({ id, revision: target.revision }),
      arguments: Object.freeze({}),
      plan: Object.freeze({
        kind: "validated-local-read-plan" as const,
        operationId, tool: `planetscale.${operationId}`, target, proposedRequest: request,
        execution: "not-implemented" as const,
        responseIdentity: "name-only-not-immutable" as const,
        nonWaking: "not-verified" as const,
      }),
      artifactDigest: null,
    });
    jsonData(prepared);
    return prepared;
  };
}

export function bindGetOrganizationPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = organizationTarget.parse(rawTarget);
  const read = prepareOrganization({ organization: target.organization }, {});
  return bindRead(`planetscale/organization/${target.organizationId}`, target, "get_organization", read.request);
}

export function bindGetDatabasePreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = databaseTarget.parse(rawTarget);
  const read = prepareDatabase({ organization: target.organization, database: target.database }, {});
  return bindRead(`planetscale/database/${target.databaseId}`, target, "get_database", read.request);
}

export function bindGetBranchPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = branchTarget.parse(rawTarget);
  const read = prepareBranch({ organization: target.organization, database: target.database, branch: target.branch }, {});
  return bindRead(`planetscale/branch/${target.branchId}`, target, "get_branch", read.request);
}
