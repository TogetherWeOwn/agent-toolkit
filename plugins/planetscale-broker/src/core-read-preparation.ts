import type { Prepared } from "../../../packages/core/src/provider/contracts.js";
import { closed, digest, identifier, jsonData } from "../../../packages/core/src/schema.js";
import { emptyArguments, slug, type PreparedRead } from "./metadata.js";
import { prepare as prepareOrganization } from "./tools/get-organization.js";
import { prepare as prepareDatabase } from "./tools/get-database.js";
import { prepare as prepareBranch } from "./tools/get-branch.js";
import { prepare as prepareBackup } from "./tools/get-backup.js";
import { prepare as prepareBackupPolicy } from "./tools/get-backup-policy.js";
import { prepare as prepareDeployRequest } from "./tools/get-deploy-request.js";
import { deployBinding } from "./lifecycle.js";
import { prepare as prepareKeyspace } from "./tools/get-keyspace.js";
import { prepare as prepareShard } from "./tools/get-shard.js";
import { prepare as prepareMaintenanceEvent } from "./tools/get-maintenance-event.js";

const organizationFields = { organization: slug, organizationId: identifier, revision: digest };
const databaseFields = { ...organizationFields, database: slug, databaseId: identifier };
const organizationTarget = closed(organizationFields);
const databaseTarget = closed(databaseFields);
const branchFields = { ...databaseFields, branch: slug, branchId: identifier };
const branchTarget = closed(branchFields);
const backupTarget = closed({ ...branchFields, backupId: identifier });
const backupPolicyTarget = closed({ ...databaseFields, policyId: identifier });
const deployRequestTarget = closed({ ...databaseFields, request: deployBinding, intoBranchId: identifier });
const keyspaceTarget = closed({ ...branchFields, keyspace: closed({ id: identifier, name: slug }) });
const shardTarget = closed({ ...branchFields, shard: closed({ id: identifier }) });
const maintenanceEventTarget = closed({ ...databaseFields,
  event: closed({ id: identifier, branchId: identifier, branch: slug }) });

type ReadTarget = ReturnType<typeof organizationTarget.parse> | ReturnType<typeof databaseTarget.parse> |
  ReturnType<typeof branchTarget.parse> | ReturnType<typeof backupTarget.parse> |
  ReturnType<typeof backupPolicyTarget.parse> | ReturnType<typeof deployRequestTarget.parse> |
  ReturnType<typeof keyspaceTarget.parse> | ReturnType<typeof shardTarget.parse> |
  ReturnType<typeof maintenanceEventTarget.parse>;
type ReadOperation = "get_organization" | "get_database" | "get_branch" |
  "get_backup" | "get_backup_policy" | "get_deploy_request" |
  "get_keyspace" | "get_shard" | "get_maintenance_event";
type ResponseIdentity = "name-only-not-immutable" | "record-id-only-parent-not-verified" |
  "record-and-source-ids-destination-not-verified" | "record-and-branch-ids-parent-not-verified";

// Pure preparation only. Host IDs/revisions bind a snapshot, not permission;
// response projections still cannot authenticate every parent/destination ID.
function bindRead(
  id: string, target: ReadTarget, operationId: ReadOperation,
  request: PreparedRead<unknown>["request"], responseIdentity: ResponseIdentity = "name-only-not-immutable",
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
        responseIdentity,
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

export function bindGetBackupPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = backupTarget.parse(rawTarget);
  const read = prepareBackup({ organization: target.organization, database: target.database,
    branch: target.branch, backupId: target.backupId }, {});
  return bindRead(`planetscale/backup/${target.backupId}`, target, "get_backup", read.request,
    "record-id-only-parent-not-verified");
}

export function bindGetBackupPolicyPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = backupPolicyTarget.parse(rawTarget);
  const read = prepareBackupPolicy({ organization: target.organization, database: target.database,
    policyId: target.policyId }, {});
  return bindRead(`planetscale/backup-policy/${target.policyId}`, target, "get_backup_policy", read.request,
    "record-id-only-parent-not-verified");
}

export function bindGetDeployRequestPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = deployRequestTarget.parse(rawTarget);
  const read = prepareDeployRequest({ organization: target.organization, database: target.database,
    request: target.request }, {});
  return bindRead(`planetscale/deploy-request/${target.request.id}`, target, "get_deploy_request", read.request,
    "record-and-source-ids-destination-not-verified");
}

export function bindGetKeyspacePreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = keyspaceTarget.parse(rawTarget);
  const read = prepareKeyspace({ organization: target.organization, database: target.database,
    branch: target.branch, keyspace: target.keyspace }, {});
  return bindRead(`planetscale/keyspace/${target.keyspace.id}`, target, "get_keyspace", read.request,
    "record-id-only-parent-not-verified");
}

export function bindGetShardPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = shardTarget.parse(rawTarget);
  const read = prepareShard({ organization: target.organization, database: target.database,
    branch: target.branch, shard: target.shard }, {});
  return bindRead(`planetscale/shard/${target.shard.id}`, target, "get_shard", read.request,
    "record-id-only-parent-not-verified");
}

export function bindGetMaintenanceEventPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = maintenanceEventTarget.parse(rawTarget);
  const read = prepareMaintenanceEvent({ organization: target.organization, database: target.database,
    event: target.event }, {});
  return bindRead(`planetscale/maintenance-event/${target.event.id}`, target, "get_maintenance_event", read.request,
    "record-and-branch-ids-parent-not-verified");
}
