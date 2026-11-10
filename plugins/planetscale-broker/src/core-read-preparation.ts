import type { Prepared } from "../../../packages/core/src/provider/contracts.js";
import { closed, digest, identifier, jsonData } from "../../../packages/core/src/schema.js";
import { emptyArguments, slug, type PreparedRead } from "./metadata.js";
import { prepare as prepareOrganization } from "./tools/get-organization.js";
import { prepare as prepareDatabase } from "./tools/get-database.js";
import { prepare as prepareBranch } from "./tools/get-branch.js";
import { prepare as prepareBackup } from "./tools/get-backup.js";
import { prepare as prepareBackupPolicy } from "./tools/get-backup-policy.js";
import { prepare as prepareDeployRequest } from "./tools/get-deploy-request.js";
import { deployBinding, deployNumber } from "./lifecycle.js";
import { prepare as prepareDeployment } from "./tools/get-deployment.js";
import { prepare as prepareSchemaRecommendation } from "./tools/get-schema-recommendation.js";
import { prepare as prepareKeyspace } from "./tools/get-keyspace.js";
import { prepare as prepareShard } from "./tools/get-shard.js";
import { prepare as prepareMaintenanceEvent } from "./tools/get-maintenance-event.js";
import { prepare as prepareOrganizationMembership } from "./tools/get-organization-membership.js";
import { prepare as prepareOrganizationTeam } from "./tools/get-organization-team.js";
import { prepare as prepareOrganizationTeamMember } from "./tools/get-organization-team-member.js";
import { prepare as prepareServiceToken } from "./tools/get-service-token.js";
import { prepare as prepareOauthToken } from "./tools/get-oauth-token.js";
import { prepare as prepareWebhook } from "./tools/get-webhook.js";
import { configBinding } from "./change-records.js";
import { prepare as prepareBranchChange } from "./tools/get-branch-change-request.js";
import { prepare as prepareBranchConfigChange } from "./tools/get-branch-config-change-request.js";
import { prepare as prepareKeyspaceConfigChange } from "./tools/get-keyspace-config-change-request.js";
import { prepare as prepareRouter } from "./tools/get-router.js";
import { prepare as prepareDedicatedReadReplica } from "./tools/get-dedicated-read-replica.js";
import { prepare as prepareSwitchover } from "./tools/get-switchover.js";
import { prepare as prepareBouncer } from "./tools/get-bouncer.js";
import { prepare as prepareBranchResize } from "./tools/get-branch-resize-request.js";
import { prepare as prepareKeyspaceResize } from "./tools/get-keyspace-resize-request.js";
import { prepare as prepareConfigurationProfile } from "./tools/get-shard-configuration-profile.js";
import { prepare as prepareConfigurationProfileShard } from "./tools/get-shard-configuration-profile-shard.js";
import { prepare as prepareOauthApplication } from "./tools/get-oauth-application.js";
import { prepare as prepareOrganizationSso } from "./tools/get-organization-sso.js";
import { prepare as prepareOrganizationSsoDomain } from "./tools/get-organization-sso-domain.js";
import { prepare as prepareInvoice } from "./tools/get-invoice.js";
import { prepare as preparePaymentMethod } from "./tools/get-organization-billing-payment-method.js";
import { prepare as preparePaymentSetup } from "./tools/get-payment-method-setup.js";
import { prepare as prepareBranchAnomaly } from "./tools/get-branch-anomaly.js";
import { prepare as prepareTrafficBudget } from "./tools/get-traffic-budget.js";
import { prepare as prepareQueryReportStatus } from "./tools/get-query-patterns-report-status.js";

const organizationFields = { organization: slug, organizationId: identifier, revision: digest };
const databaseFields = { ...organizationFields, database: slug, databaseId: identifier };
const organizationTarget = closed(organizationFields);
const databaseTarget = closed(databaseFields);
const branchFields = { ...databaseFields, branch: slug, branchId: identifier };
const branchTarget = closed(branchFields);
const anomalyTarget = closed({ ...branchFields, anomalyId: identifier });
const trafficBudgetTarget = closed({ ...branchFields, budgetId: identifier });
const queryReportTarget = closed({ ...branchFields, reportId: identifier });
const backupTarget = closed({ ...branchFields, backupId: identifier });
const backupPolicyTarget = closed({ ...databaseFields, policyId: identifier });
const deployRequestTarget = closed({ ...databaseFields, request: deployBinding, intoBranchId: identifier });
const keyspaceTarget = closed({ ...branchFields, keyspace: closed({ id: identifier, name: slug }) });
const shardTarget = closed({ ...branchFields, shard: closed({ id: identifier }) });
const maintenanceEventTarget = closed({ ...databaseFields,
  event: closed({ id: identifier, branchId: identifier, branch: slug }) });
const membershipFields = { membership: closed({ id: identifier, userId: identifier }) };
const teamFields = { team: closed({ id: identifier, slug }) };
const organizationMembershipTarget = closed({ ...organizationFields, ...membershipFields });
const organizationTeamTarget = closed({ ...organizationFields, ...teamFields });
const organizationTeamMemberTarget = closed({ ...organizationFields, ...teamFields, ...membershipFields });
const serviceTokenTarget = closed({ ...organizationFields, tokenId: identifier });
const oauthTokenTarget = closed({ ...organizationFields, applicationId: identifier, tokenId: identifier });
const webhookTarget = closed({ ...databaseFields, webhookId: identifier });
const oauthApplicationTarget = closed({ ...organizationFields, applicationId: identifier });
const organizationSsoDomainTarget = closed({ ...organizationFields, domainId: identifier });
const invoiceTarget = closed({ ...organizationFields, invoiceId: identifier });
const paymentMethodTarget = closed({ ...organizationFields, paymentMethodId: identifier });
const paymentSetupTarget = closed({ ...organizationFields, setupId: identifier });
const deploymentTarget = closed({ ...databaseFields,
  deployment: closed({ id: identifier, number: deployNumber, intoBranch: slug }), intoBranchId: identifier });
const schemaRecommendationTarget = closed({ ...databaseFields,
  recommendation: closed({ id: identifier, number: deployNumber }) });
const routerTarget = closed({ ...branchFields, router: closed({ id: identifier, name: slug }) });
const replicaTarget = closed({ ...branchFields, replica: closed({ id: identifier, name: slug }) });
const switchoverTarget = closed({ ...branchFields, switchoverId: identifier });
const profileFields = { ...branchFields, profile: closed({ id: identifier, name: slug }) };
const configurationProfileTarget = closed(profileFields);
const configurationProfileShardTarget = closed({ ...profileFields, shard: closed({ id: identifier }) });
const bouncerTarget = closed({ ...branchFields, bouncer: closed({ id: identifier, name: slug }) });
const branchResizeTarget = closed({ ...branchFields, resize: closed({ id: identifier }) });
const keyspaceResizeTarget = closed({ ...branchFields,
  keyspace: closed({ id: identifier, name: slug }), resize: closed({ id: identifier }) });
const branchChangeTarget = closed({ ...branchFields, change: closed({ id: identifier }) });
const branchConfigChangeTarget = closed({ ...branchFields, change: configBinding });
const keyspaceConfigChangeTarget = closed({ ...branchFields,
  keyspace: closed({ id: identifier, name: slug }), change: configBinding });

type ReadTarget = ReturnType<typeof organizationTarget.parse> | ReturnType<typeof databaseTarget.parse> |
  ReturnType<typeof branchTarget.parse> | ReturnType<typeof backupTarget.parse> |
  ReturnType<typeof backupPolicyTarget.parse> | ReturnType<typeof deployRequestTarget.parse> |
  ReturnType<typeof keyspaceTarget.parse> | ReturnType<typeof shardTarget.parse> |
  ReturnType<typeof maintenanceEventTarget.parse> | ReturnType<typeof organizationMembershipTarget.parse> |
  ReturnType<typeof organizationTeamTarget.parse> | ReturnType<typeof organizationTeamMemberTarget.parse> |
  ReturnType<typeof serviceTokenTarget.parse> | ReturnType<typeof oauthTokenTarget.parse> |
  ReturnType<typeof webhookTarget.parse> | ReturnType<typeof deploymentTarget.parse> |
  ReturnType<typeof schemaRecommendationTarget.parse> | ReturnType<typeof branchChangeTarget.parse> |
  ReturnType<typeof branchConfigChangeTarget.parse> | ReturnType<typeof keyspaceConfigChangeTarget.parse> |
  ReturnType<typeof bouncerTarget.parse> | ReturnType<typeof branchResizeTarget.parse> |
  ReturnType<typeof keyspaceResizeTarget.parse> | ReturnType<typeof routerTarget.parse> |
  ReturnType<typeof replicaTarget.parse> | ReturnType<typeof switchoverTarget.parse> |
  ReturnType<typeof configurationProfileTarget.parse> | ReturnType<typeof configurationProfileShardTarget.parse> |
  ReturnType<typeof oauthApplicationTarget.parse> | ReturnType<typeof organizationSsoDomainTarget.parse> |
  ReturnType<typeof invoiceTarget.parse> | ReturnType<typeof paymentMethodTarget.parse> |
  ReturnType<typeof paymentSetupTarget.parse> | ReturnType<typeof anomalyTarget.parse> |
  ReturnType<typeof trafficBudgetTarget.parse> | ReturnType<typeof queryReportTarget.parse>;
type ReadOperation = "get_organization" | "get_database" | "get_branch" |
  "get_backup" | "get_backup_policy" | "get_deploy_request" |
  "get_keyspace" | "get_shard" | "get_maintenance_event" |
  "get_organization_membership" | "get_organization_team" | "get_organization_team_member" |
  "get_service_token" | "get_oauth_token" | "get_webhook" | "get_deployment" | "get_schema_recommendation" |
  "get_branch_change_request" | "get_branch_config_change_request" | "get_keyspace_config_change_request" |
  "get_bouncer" | "get_branch_resize_request" | "get_keyspace_resize_request" |
  "get_router" | "get_dedicated_read_replica" | "get_switchover" |
  "get_shard_configuration_profile" | "get_shard_configuration_profile_shard" |
  "get_oauth_application" | "get_organization_sso" | "get_organization_sso_domain" |
  "get_invoice" | "get_organization_billing_payment_method" | "get_payment_method_setup" |
  "get_branch_anomaly" | "get_traffic_budget" | "get_query_patterns_report_status";
type ResponseIdentity = "name-only-not-immutable" | "record-id-only-parent-not-verified" |
  "record-and-source-ids-destination-not-verified" | "record-and-branch-ids-parent-not-verified" |
  "record-and-user-ids-parent-not-verified" | "record-and-number-parent-and-destination-not-verified" |
  "record-and-number-parent-not-verified" | "organization-id-matched";

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

export function bindGetOrganizationMembershipPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = organizationMembershipTarget.parse(rawTarget);
  const read = prepareOrganizationMembership({ organization: target.organization, membership: target.membership }, {});
  return bindRead(`planetscale/organization-membership/${target.membership.id}`, target,
    "get_organization_membership", read.request, "record-and-user-ids-parent-not-verified");
}

export function bindGetOrganizationTeamPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = organizationTeamTarget.parse(rawTarget);
  const read = prepareOrganizationTeam({ organization: target.organization, team: target.team }, {});
  return bindRead(`planetscale/organization-team/${target.team.id}`, target,
    "get_organization_team", read.request, "record-id-only-parent-not-verified");
}

export function bindGetOrganizationTeamMemberPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = organizationTeamMemberTarget.parse(rawTarget);
  const read = prepareOrganizationTeamMember({ organization: target.organization, team: target.team,
    membership: target.membership }, {});
  return bindRead(`planetscale/organization-team-member/${target.team.id}/${target.membership.id}`, target,
    "get_organization_team_member", read.request, "record-and-user-ids-parent-not-verified");
}

export function bindGetServiceTokenPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = serviceTokenTarget.parse(rawTarget);
  const read = prepareServiceToken({ organization: target.organization, tokenId: target.tokenId }, {});
  return bindRead(`planetscale/service-token/${target.tokenId}`, target,
    "get_service_token", read.request, "record-id-only-parent-not-verified");
}

export function bindGetOauthTokenPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = oauthTokenTarget.parse(rawTarget);
  const read = prepareOauthToken({ organization: target.organization, applicationId: target.applicationId,
    tokenId: target.tokenId }, {});
  return bindRead(`planetscale/oauth-token/${target.applicationId}/${target.tokenId}`, target,
    "get_oauth_token", read.request, "record-id-only-parent-not-verified");
}

export function bindGetDeploymentPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = deploymentTarget.parse(rawTarget);
  const read = prepareDeployment({ organization: target.organization, database: target.database,
    deployment: target.deployment }, {});
  return bindRead(`planetscale/deployment/${target.deployment.id}`, target,
    "get_deployment", read.request, "record-and-number-parent-and-destination-not-verified");
}

export function bindGetSchemaRecommendationPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = schemaRecommendationTarget.parse(rawTarget);
  const read = prepareSchemaRecommendation({ organization: target.organization, database: target.database,
    recommendation: target.recommendation }, {});
  return bindRead(`planetscale/schema-recommendation/${target.recommendation.id}`, target,
    "get_schema_recommendation", read.request, "record-and-number-parent-not-verified");
}

export function bindGetBranchChangeRequestPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = branchChangeTarget.parse(rawTarget);
  const read = prepareBranchChange({ organization: target.organization, database: target.database,
    branch: target.branch, change: target.change }, {});
  return bindRead(`planetscale/branch-change/${target.change.id}`, target,
    "get_branch_change_request", read.request, "record-id-only-parent-not-verified");
}

export function bindGetBranchConfigChangeRequestPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = branchConfigChangeTarget.parse(rawTarget);
  const read = prepareBranchConfigChange({ organization: target.organization, database: target.database,
    branch: target.branch, change: target.change }, {});
  return bindRead(`planetscale/branch-config-change/${target.change.id}`, target,
    "get_branch_config_change_request", read.request, "record-id-only-parent-not-verified");
}

export function bindGetKeyspaceConfigChangeRequestPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = keyspaceConfigChangeTarget.parse(rawTarget);
  const read = prepareKeyspaceConfigChange({ organization: target.organization, database: target.database,
    branch: target.branch, keyspace: target.keyspace, change: target.change }, {});
  return bindRead(`planetscale/keyspace-config-change/${target.change.id}`, target,
    "get_keyspace_config_change_request", read.request, "record-id-only-parent-not-verified");
}

export function bindGetBouncerPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = bouncerTarget.parse(rawTarget);
  const read = prepareBouncer({ organization: target.organization, database: target.database,
    branch: target.branch, branchId: target.branchId, bouncer: target.bouncer }, {});
  return bindRead(`planetscale/bouncer/${target.bouncer.id}`, target,
    "get_bouncer", read.request, "record-and-branch-ids-parent-not-verified");
}

export function bindGetBranchResizeRequestPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = branchResizeTarget.parse(rawTarget);
  const read = prepareBranchResize({ organization: target.organization, database: target.database,
    branch: target.branch, resize: target.resize }, {});
  return bindRead(`planetscale/branch-resize/${target.resize.id}`, target,
    "get_branch_resize_request", read.request, "record-id-only-parent-not-verified");
}

export function bindGetKeyspaceResizeRequestPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = keyspaceResizeTarget.parse(rawTarget);
  const read = prepareKeyspaceResize({ organization: target.organization, database: target.database,
    branch: target.branch, keyspace: target.keyspace, resize: target.resize }, {});
  return bindRead(`planetscale/keyspace-resize/${target.resize.id}`, target,
    "get_keyspace_resize_request", read.request, "record-id-only-parent-not-verified");
}

export function bindGetRouterPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = routerTarget.parse(rawTarget);
  const read = prepareRouter({ organization: target.organization, database: target.database,
    branch: target.branch, router: target.router }, {});
  return bindRead(`planetscale/router/${target.router.id}`, target,
    "get_router", read.request, "record-id-only-parent-not-verified");
}

export function bindGetDedicatedReadReplicaPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = replicaTarget.parse(rawTarget);
  const read = prepareDedicatedReadReplica({ organization: target.organization, database: target.database,
    branch: target.branch, replica: target.replica }, {});
  return bindRead(`planetscale/dedicated-read-replica/${target.replica.id}`, target,
    "get_dedicated_read_replica", read.request, "record-id-only-parent-not-verified");
}

export function bindGetSwitchoverPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = switchoverTarget.parse(rawTarget);
  const read = prepareSwitchover({ organization: target.organization, database: target.database,
    branch: target.branch, switchoverId: target.switchoverId }, {});
  return bindRead(`planetscale/switchover/${target.switchoverId}`, target,
    "get_switchover", read.request, "record-id-only-parent-not-verified");
}

export function bindGetShardConfigurationProfilePreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = configurationProfileTarget.parse(rawTarget);
  const read = prepareConfigurationProfile({ organization: target.organization, database: target.database,
    branch: target.branch, profile: target.profile }, {});
  return bindRead(`planetscale/configuration-profile/${target.profile.id}`, target,
    "get_shard_configuration_profile", read.request, "record-id-only-parent-not-verified");
}

export function bindGetShardConfigurationProfileShardPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = configurationProfileShardTarget.parse(rawTarget);
  const read = prepareConfigurationProfileShard({ organization: target.organization, database: target.database,
    branch: target.branch, profile: target.profile, shard: target.shard }, {});
  return bindRead(`planetscale/configuration-profile-shard/${target.profile.id}/${target.shard.id}`, target,
    "get_shard_configuration_profile_shard", read.request, "record-id-only-parent-not-verified");
}

export function bindGetOauthApplicationPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = oauthApplicationTarget.parse(rawTarget);
  const read = prepareOauthApplication({ organization: target.organization, applicationId: target.applicationId }, {});
  return bindRead(`planetscale/oauth-application/${target.applicationId}`, target,
    "get_oauth_application", read.request, "record-id-only-parent-not-verified");
}

export function bindGetOrganizationSsoPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = organizationTarget.parse(rawTarget);
  const read = prepareOrganizationSso({ organization: target.organization, organizationId: target.organizationId }, {});
  return bindRead(`planetscale/organization-sso/${target.organizationId}`, target,
    "get_organization_sso", read.request, "organization-id-matched");
}

export function bindGetOrganizationSsoDomainPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = organizationSsoDomainTarget.parse(rawTarget);
  const read = prepareOrganizationSsoDomain({ organization: target.organization, domainId: target.domainId }, {});
  return bindRead(`planetscale/organization-sso-domain/${target.domainId}`, target,
    "get_organization_sso_domain", read.request, "record-id-only-parent-not-verified");
}

export function bindGetInvoicePreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = invoiceTarget.parse(rawTarget);
  const read = prepareInvoice({ organization: target.organization, invoiceId: target.invoiceId }, {});
  return bindRead(`planetscale/invoice/${target.invoiceId}`, target,
    "get_invoice", read.request, "record-id-only-parent-not-verified");
}

export function bindGetOrganizationBillingPaymentMethodPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = paymentMethodTarget.parse(rawTarget);
  const read = preparePaymentMethod({ organization: target.organization, paymentMethodId: target.paymentMethodId }, {});
  return bindRead(`planetscale/billing-payment-method/${target.paymentMethodId}`, target,
    "get_organization_billing_payment_method", read.request, "record-id-only-parent-not-verified");
}

export function bindGetPaymentMethodSetupPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = paymentSetupTarget.parse(rawTarget);
  const read = preparePaymentSetup({ organization: target.organization, setupId: target.setupId }, {});
  return bindRead(`planetscale/payment-method-setup/${target.setupId}`, target,
    "get_payment_method_setup", read.request, "record-id-only-parent-not-verified");
}

export function bindGetBranchAnomalyPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = anomalyTarget.parse(rawTarget);
  const read = prepareBranchAnomaly({ organization: target.organization, database: target.database,
    branch: target.branch, anomalyId: target.anomalyId }, {});
  return bindRead(`planetscale/branch-anomaly/${target.anomalyId}`, target,
    "get_branch_anomaly", read.request, "record-id-only-parent-not-verified");
}

export function bindGetTrafficBudgetPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = trafficBudgetTarget.parse(rawTarget);
  const read = prepareTrafficBudget({ organization: target.organization, database: target.database,
    branch: target.branch, budgetId: target.budgetId }, {});
  return bindRead(`planetscale/traffic-budget/${target.budgetId}`, target,
    "get_traffic_budget", read.request, "record-id-only-parent-not-verified");
}

export function bindGetQueryPatternsReportStatusPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = queryReportTarget.parse(rawTarget);
  const read = prepareQueryReportStatus({ organization: target.organization, database: target.database,
    branch: target.branch, reportId: target.reportId }, {});
  return bindRead(`planetscale/query-patterns-report/${target.reportId}`, target,
    "get_query_patterns_report_status", read.request, "record-id-only-parent-not-verified");
}

export function bindGetWebhookPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = webhookTarget.parse(rawTarget);
  const read = prepareWebhook({ organization: target.organization, database: target.database,
    webhookId: target.webhookId }, {});
  return bindRead(`planetscale/webhook/${target.webhookId}`, target,
    "get_webhook", read.request, "record-id-only-parent-not-verified");
}
