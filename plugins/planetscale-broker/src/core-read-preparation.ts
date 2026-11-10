import type { Prepared } from "../../../packages/core/src/provider/contracts.js";
import { closed, digest, identifier, jsonData, oneOf } from "../../../packages/core/src/schema.js";
import { emptyArguments, pageArguments, slug, type PreparedRead } from "./metadata.js";
import { resourceBindings } from "./discovery.js";
import { prepare as prepareDatabaseList } from "./tools/list-databases.js";
import { prepare as prepareBranchList } from "./tools/list-branches.js";
import { prepare as prepareDatabaseRegionList } from "./tools/list-database-regions.js";
import { prepare as prepareOrganizationRegionList } from "./tools/list-regions-for-organization.js";
import { prepare as preparePublicRegionList } from "./tools/list-public-regions.js";
import { prepare as prepareOrganization } from "./tools/get-organization.js";
import { prepare as prepareDatabase } from "./tools/get-database.js";
import { prepare as prepareBranch } from "./tools/get-branch.js";
import { prepare as prepareBackup } from "./tools/get-backup.js";
import { prepare as prepareBackupPolicy } from "./tools/get-backup-policy.js";
import { prepare as prepareDeployRequest } from "./tools/get-deploy-request.js";
import { deployBinding, deployBindings, deployNumber, lifecycleIds } from "./lifecycle.js";
import { prepare as prepareBackupList } from "./tools/list-backups.js";
import { prepare as prepareBackupPolicyList } from "./tools/list-backup-policies.js";
import { prepare as prepareDeployRequestList } from "./tools/list-deploy-requests.js";
import { prepare as prepareDeployment } from "./tools/get-deployment.js";
import { prepare as prepareSchemaRecommendation } from "./tools/get-schema-recommendation.js";
import { keyspaceBindings, shardBindings, maintenanceEventBindings } from "./topology.js";
import { prepare as prepareKeyspaceList } from "./tools/list-keyspaces.js";
import { prepare as prepareShardList } from "./tools/list-shards.js";
import { prepare as prepareMaintenanceEventList } from "./tools/list-maintenance-events.js";
import { prepare as prepareKeyspace } from "./tools/get-keyspace.js";
import { prepare as prepareShard } from "./tools/get-shard.js";
import { prepare as prepareMaintenanceEvent } from "./tools/get-maintenance-event.js";
import { membershipBindings, teamBindings } from "./organization-records.js";
import { prepare as prepareOrganizationMemberList } from "./tools/list-organization-members.js";
import { prepare as prepareOrganizationTeamList } from "./tools/list-organization-teams.js";
import { prepare as prepareOrganizationTeamMemberList } from "./tools/list-organization-team-members.js";
import { prepare as prepareOrganizationMembership } from "./tools/get-organization-membership.js";
import { prepare as prepareOrganizationTeam } from "./tools/get-organization-team.js";
import { prepare as prepareOrganizationTeamMember } from "./tools/get-organization-team-member.js";
import { securityRecordIds } from "./security-records.js";
import { prepare as prepareServiceTokenList } from "./tools/list-service-tokens.js";
import { prepare as prepareOauthTokenList } from "./tools/list-oauth-tokens.js";
import { prepare as prepareWebhookList } from "./tools/list-webhooks.js";
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
import { throttlerKeyspaceNames } from "./network-throttler.js";
import { prepare as prepareDatabaseCidr } from "./tools/get-database-postgres-cidr.js";
import { prepare as prepareDatabaseThrottler } from "./tools/get-database-throttler.js";
import { prepare as prepareDeployThrottler } from "./tools/get-deploy-request-throttler.js";
import { prepare as prepareBranchQuery } from "./tools/get-branch-query.js";
import { prepare as prepareBranchQueryTag } from "./tools/get-branch-query-tag.js";
import { changeBinding } from "./unified-change-records.js";
import { prepare as prepareChangeRequest } from "./tools/get-change-request.js";
import { prepare as prepareVtctldOperation } from "./tools/get-vtctld-operation.js";
import { prepare as prepareKeyspaceVschema } from "./tools/get-keyspace-vschema.js";
import { prepare as prepareDataTopology } from "./tools/get-data-topology.js";
import { lintKeyspaceNames } from "./schema-diagnostics.js";
import { prepare as prepareLintBranchSchema } from "./tools/lint-branch-schema.js";
import { prepare as prepareDeployStorageCheck } from "./tools/check-deploy-request-storage.js";
import { branchMetricNames, tabletMetricNames } from "./instant-metrics.js";
import { historicalBranchMetricNames, historicalTabletMetricNames, timestamp } from "./historical-metrics.js";
import { prepare as prepareInstantBranchMetrics } from "./tools/get-instant-branch-metrics.js";
import { prepare as prepareInstantTabletMetrics } from "./tools/get-instant-tablet-metrics.js";
import { prepare as prepareBranchMetrics } from "./tools/get-branch-metrics.js";
import { prepare as prepareTabletMetrics } from "./tools/get-tablet-metrics.js";
import { prepare as prepareBranchQueryMetrics } from "./tools/get-branch-query-metrics.js";
import { prepare as prepareBranchTagMetrics } from "./tools/get-branch-tag-metrics.js";
import { prepare as prepareMaintenanceSchedule } from "./tools/get-maintenance-schedule.js";
import { prepare as prepareBranchMaintenanceWindow } from "./tools/get-branch-maintenance-window.js";
import { prepare as prepareMoveTablesWorkflowStatus } from "./tools/get-move-tables-workflow-status.js";

const organizationFields = { organization: slug, organizationId: identifier, revision: digest };
const databaseFields = { ...organizationFields, database: slug, databaseId: identifier };
const organizationTarget = closed(organizationFields);
const databaseTarget = closed(databaseFields);
const branchFields = { ...databaseFields, branch: slug, branchId: identifier };
const branchTarget = closed(branchFields);
const keyspaceListTarget = closed({ ...branchFields, keyspaces: keyspaceBindings, pagination: pageArguments });
const shardListTarget = closed({ ...branchFields, shards: shardBindings, pagination: pageArguments });
const maintenanceEventListTarget = closed({ ...databaseFields, events: maintenanceEventBindings, pagination: pageArguments });
const backupListTarget = closed({ ...branchFields, backupIds: lifecycleIds, pagination: pageArguments });
const backupPolicyListTarget = closed({ ...databaseFields, policyIds: lifecycleIds, pagination: pageArguments });
const deployRequestListTarget = closed({ ...databaseFields, requests: deployBindings, pagination: pageArguments });
const databaseListTarget = closed({ ...organizationFields, databases: resourceBindings, pagination: pageArguments });
const branchListTarget = closed({ ...databaseFields, branches: resourceBindings, pagination: pageArguments });
const databaseRegionListTarget = closed({ ...databaseFields, regions: resourceBindings, pagination: pageArguments });
const organizationRegionListTarget = closed({ ...organizationFields, regions: resourceBindings, pagination: pageArguments });
const publicRegionListTarget = closed({ revision: digest, regions: resourceBindings, pagination: pageArguments });
const moveTablesWorkflowStatusTarget = closed({ ...branchFields,
  workflow: slug, targetKeyspace: slug, keyspaceId: identifier });
const maintenanceScheduleTarget = closed({ ...databaseFields, scheduleId: identifier });
const branchMaintenanceWindowTarget = closed({ ...branchFields, scheduleId: identifier });
const instantBranchMetricsTarget = closed({ ...branchFields, metric: oneOf(branchMetricNames) });
const instantTabletMetricsTarget = closed({ ...branchFields, metric: oneOf(tabletMetricNames) });
const metricWindowFields = { from: timestamp, to: timestamp };
const branchMetricsTarget = closed({ ...branchFields, ...metricWindowFields, metric: oneOf(historicalBranchMetricNames) });
const tabletMetricsTarget = closed({ ...branchFields, ...metricWindowFields, metric: oneOf(historicalTabletMetricNames) });
const lintBranchTarget = closed({ ...branchFields, keyspaceNames: lintKeyspaceNames });
const deployStorageCheckTarget = closed({ ...databaseFields, requestId: identifier, number: deployNumber });
const anomalyTarget = closed({ ...branchFields, anomalyId: identifier });
const trafficBudgetTarget = closed({ ...branchFields, budgetId: identifier });
const queryReportTarget = closed({ ...branchFields, reportId: identifier });
const unifiedChangeTarget = closed({ ...branchFields, change: changeBinding });
const vtctldOperationTarget = closed({ ...branchFields, operationId: identifier });
const branchQueryTarget = closed({ ...branchFields, queryId: identifier });
const branchQueryTagTarget = closed({ ...branchFields, tag: closed({ id: identifier, name: identifier }) });
const databaseCidrTarget = closed({ ...databaseFields, cidrId: identifier });
const throttlerFields = { ...databaseFields, configurableId: identifier, keyspaceNames: throttlerKeyspaceNames };
const databaseThrottlerTarget = closed(throttlerFields);
const deployThrottlerTarget = closed({ ...throttlerFields, requestId: identifier, number: deployNumber });
const backupTarget = closed({ ...branchFields, backupId: identifier });
const backupPolicyTarget = closed({ ...databaseFields, policyId: identifier });
const deployRequestTarget = closed({ ...databaseFields, request: deployBinding, intoBranchId: identifier });
const keyspaceTarget = closed({ ...branchFields, keyspace: closed({ id: identifier, name: slug }) });
const shardTarget = closed({ ...branchFields, shard: closed({ id: identifier }) });
const maintenanceEventTarget = closed({ ...databaseFields,
  event: closed({ id: identifier, branchId: identifier, branch: slug }) });
const membershipFields = { membership: closed({ id: identifier, userId: identifier }) };
const teamFields = { team: closed({ id: identifier, slug }) };
const organizationMemberListTarget = closed({ ...organizationFields, memberships: membershipBindings, pagination: pageArguments });
const organizationTeamListTarget = closed({ ...organizationFields, teams: teamBindings, pagination: pageArguments });
const organizationTeamMemberListTarget = closed({ ...organizationFields, ...teamFields,
  memberships: membershipBindings, pagination: pageArguments });
const organizationMembershipTarget = closed({ ...organizationFields, ...membershipFields });
const organizationTeamTarget = closed({ ...organizationFields, ...teamFields });
const organizationTeamMemberTarget = closed({ ...organizationFields, ...teamFields, ...membershipFields });
const serviceTokenListTarget = closed({ ...organizationFields, tokenIds: securityRecordIds, pagination: pageArguments });
const oauthTokenListTarget = closed({ ...organizationFields, applicationId: identifier,
  tokenIds: securityRecordIds, pagination: pageArguments });
const webhookListTarget = closed({ ...databaseFields, webhookIds: securityRecordIds, pagination: pageArguments });
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
  ReturnType<typeof trafficBudgetTarget.parse> | ReturnType<typeof queryReportTarget.parse> |
  ReturnType<typeof databaseCidrTarget.parse> | ReturnType<typeof databaseThrottlerTarget.parse> |
  ReturnType<typeof deployThrottlerTarget.parse> | ReturnType<typeof branchQueryTarget.parse> |
  ReturnType<typeof branchQueryTagTarget.parse> | ReturnType<typeof unifiedChangeTarget.parse> |
  ReturnType<typeof vtctldOperationTarget.parse> | ReturnType<typeof lintBranchTarget.parse> |
  ReturnType<typeof deployStorageCheckTarget.parse> | ReturnType<typeof instantBranchMetricsTarget.parse> |
  ReturnType<typeof instantTabletMetricsTarget.parse> | ReturnType<typeof branchMetricsTarget.parse> |
  ReturnType<typeof tabletMetricsTarget.parse> | ReturnType<typeof maintenanceScheduleTarget.parse> |
  ReturnType<typeof branchMaintenanceWindowTarget.parse> | ReturnType<typeof moveTablesWorkflowStatusTarget.parse> |
  ReturnType<typeof databaseListTarget.parse> | ReturnType<typeof branchListTarget.parse> |
  ReturnType<typeof databaseRegionListTarget.parse> | ReturnType<typeof organizationRegionListTarget.parse> |
  ReturnType<typeof publicRegionListTarget.parse> | ReturnType<typeof backupListTarget.parse> |
  ReturnType<typeof backupPolicyListTarget.parse> | ReturnType<typeof deployRequestListTarget.parse> |
  ReturnType<typeof keyspaceListTarget.parse> | ReturnType<typeof shardListTarget.parse> |
  ReturnType<typeof maintenanceEventListTarget.parse> | ReturnType<typeof organizationMemberListTarget.parse> |
  ReturnType<typeof organizationTeamListTarget.parse> | ReturnType<typeof organizationTeamMemberListTarget.parse> |
  ReturnType<typeof serviceTokenListTarget.parse> | ReturnType<typeof oauthTokenListTarget.parse> |
  ReturnType<typeof webhookListTarget.parse>;
type ReadOperation = "list_databases" | "list_branches" | "list_database_regions" |
  "list_regions_for_organization" | "list_public_regions" | "get_organization" | "get_database" | "get_branch" |
  "list_backups" | "list_backup_policies" | "list_deploy_requests" |
  "get_backup" | "get_backup_policy" | "get_deploy_request" |
  "list_keyspaces" | "list_shards" | "list_maintenance_events" |
  "get_keyspace" | "get_shard" | "get_maintenance_event" |
  "list_organization_members" | "list_organization_teams" | "list_organization_team_members" |
  "get_organization_membership" | "get_organization_team" | "get_organization_team_member" |
  "list_service_tokens" | "list_oauth_tokens" | "list_webhooks" |
  "get_service_token" | "get_oauth_token" | "get_webhook" | "get_deployment" | "get_schema_recommendation" |
  "get_branch_change_request" | "get_branch_config_change_request" | "get_keyspace_config_change_request" |
  "get_bouncer" | "get_branch_resize_request" | "get_keyspace_resize_request" |
  "get_router" | "get_dedicated_read_replica" | "get_switchover" |
  "get_shard_configuration_profile" | "get_shard_configuration_profile_shard" |
  "get_oauth_application" | "get_organization_sso" | "get_organization_sso_domain" |
  "get_invoice" | "get_organization_billing_payment_method" | "get_payment_method_setup" |
  "get_branch_anomaly" | "get_traffic_budget" | "get_query_patterns_report_status" |
  "get_database_postgres_cidr" | "get_database_throttler" | "get_deploy_request_throttler" |
  "get_branch_query" | "get_branch_query_tag" | "get_change_request" | "get_vtctld_operation" |
  "get_keyspace_vschema" | "get_data_topology" | "lint_branch_schema" | "check_deploy_request_storage" |
  "get_instant_branch_metrics" | "get_instant_tablet_metrics" | "get_branch_metrics" | "get_tablet_metrics" |
  "get_branch_query_metrics" | "get_branch_tag_metrics" |
  "get_maintenance_schedule" | "get_branch_maintenance_window" | "get_move_tables_workflow_status";
type ResponseIdentity = "name-only-not-immutable" | "record-id-only-parent-not-verified" |
  "record-and-source-ids-destination-not-verified" | "record-and-branch-ids-parent-not-verified" |
  "record-and-user-ids-parent-not-verified" | "record-and-number-parent-and-destination-not-verified" |
  "record-and-number-parent-not-verified" | "organization-id-matched" |
  "record-and-name-parent-not-verified" | "record-and-target-binding-parent-not-verified" |
  "absent-request-bound-only" | "keyspace-name-only-parent-not-verified" |
  "branch-id-and-name-parent-not-verified";

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

export function bindListServiceTokensPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = serviceTokenListTarget.parse(rawTarget);
  const read = prepareServiceTokenList({ organization: target.organization, tokenIds: target.tokenIds }, target.pagination);
  return bindRead(`planetscale/organization/${target.organizationId}`, target, "list_service_tokens", read.request,
    "record-id-only-parent-not-verified");
}

export function bindListOauthTokensPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = oauthTokenListTarget.parse(rawTarget);
  const read = prepareOauthTokenList({ organization: target.organization, applicationId: target.applicationId,
    tokenIds: target.tokenIds }, target.pagination);
  return bindRead(`planetscale/oauth-application/${target.applicationId}`, target, "list_oauth_tokens", read.request,
    "record-id-only-parent-not-verified");
}

export function bindListWebhooksPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = webhookListTarget.parse(rawTarget);
  const read = prepareWebhookList({ organization: target.organization, database: target.database,
    webhookIds: target.webhookIds }, target.pagination);
  return bindRead(`planetscale/database/${target.databaseId}`, target, "list_webhooks", read.request,
    "record-id-only-parent-not-verified");
}

export function bindListOrganizationMembersPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = organizationMemberListTarget.parse(rawTarget);
  const read = prepareOrganizationMemberList({ organization: target.organization,
    memberships: target.memberships }, target.pagination);
  return bindRead(`planetscale/organization/${target.organizationId}`, target, "list_organization_members", read.request,
    "record-and-user-ids-parent-not-verified");
}

export function bindListOrganizationTeamsPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = organizationTeamListTarget.parse(rawTarget);
  const read = prepareOrganizationTeamList({ organization: target.organization, teams: target.teams }, target.pagination);
  return bindRead(`planetscale/organization/${target.organizationId}`, target, "list_organization_teams", read.request,
    "record-and-name-parent-not-verified");
}

export function bindListOrganizationTeamMembersPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = organizationTeamMemberListTarget.parse(rawTarget);
  const read = prepareOrganizationTeamMemberList({ organization: target.organization, team: target.team,
    memberships: target.memberships }, target.pagination);
  return bindRead(`planetscale/organization-team/${target.team.id}`, target, "list_organization_team_members", read.request,
    "record-and-user-ids-parent-not-verified");
}

export function bindListKeyspacesPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = keyspaceListTarget.parse(rawTarget);
  const read = prepareKeyspaceList({ organization: target.organization, database: target.database,
    branch: target.branch, keyspaces: target.keyspaces }, target.pagination);
  return bindRead(`planetscale/branch/${target.branchId}`, target, "list_keyspaces", read.request,
    "record-and-name-parent-not-verified");
}

export function bindListShardsPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = shardListTarget.parse(rawTarget);
  const read = prepareShardList({ organization: target.organization, database: target.database,
    branch: target.branch, shards: target.shards }, target.pagination);
  return bindRead(`planetscale/branch/${target.branchId}`, target, "list_shards", read.request,
    "record-id-only-parent-not-verified");
}

export function bindListMaintenanceEventsPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = maintenanceEventListTarget.parse(rawTarget);
  const read = prepareMaintenanceEventList({ organization: target.organization, database: target.database,
    events: target.events }, target.pagination);
  return bindRead(`planetscale/database/${target.databaseId}`, target, "list_maintenance_events", read.request,
    "record-and-branch-ids-parent-not-verified");
}

export function bindListBackupsPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = backupListTarget.parse(rawTarget);
  const read = prepareBackupList({ organization: target.organization, database: target.database,
    branch: target.branch, backupIds: target.backupIds }, target.pagination);
  return bindRead(`planetscale/branch/${target.branchId}`, target, "list_backups", read.request,
    "record-id-only-parent-not-verified");
}

export function bindListBackupPoliciesPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = backupPolicyListTarget.parse(rawTarget);
  const read = prepareBackupPolicyList({ organization: target.organization, database: target.database,
    policyIds: target.policyIds }, target.pagination);
  return bindRead(`planetscale/database/${target.databaseId}`, target, "list_backup_policies", read.request,
    "record-id-only-parent-not-verified");
}

export function bindListDeployRequestsPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = deployRequestListTarget.parse(rawTarget);
  const read = prepareDeployRequestList({ organization: target.organization, database: target.database,
    requests: target.requests }, target.pagination);
  return bindRead(`planetscale/database/${target.databaseId}`, target, "list_deploy_requests", read.request,
    "record-and-source-ids-destination-not-verified");
}

export function bindListDatabasesPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = databaseListTarget.parse(rawTarget);
  const read = prepareDatabaseList({ organization: target.organization, databases: target.databases }, target.pagination);
  return bindRead(`planetscale/organization/${target.organizationId}`, target, "list_databases", read.request,
    "record-and-name-parent-not-verified");
}

export function bindListBranchesPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = branchListTarget.parse(rawTarget);
  const read = prepareBranchList({ organization: target.organization, database: target.database,
    branches: target.branches }, target.pagination);
  return bindRead(`planetscale/database/${target.databaseId}`, target, "list_branches", read.request,
    "record-and-name-parent-not-verified");
}

export function bindListDatabaseRegionsPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = databaseRegionListTarget.parse(rawTarget);
  const read = prepareDatabaseRegionList({ organization: target.organization, database: target.database,
    regions: target.regions }, target.pagination);
  return bindRead(`planetscale/database/${target.databaseId}`, target, "list_database_regions", read.request,
    "record-and-name-parent-not-verified");
}

export function bindListRegionsForOrganizationPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = organizationRegionListTarget.parse(rawTarget);
  const read = prepareOrganizationRegionList({ organization: target.organization, regions: target.regions }, target.pagination);
  return bindRead(`planetscale/organization/${target.organizationId}`, target, "list_regions_for_organization", read.request,
    "record-and-name-parent-not-verified");
}

export function bindListPublicRegionsPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = publicRegionListTarget.parse(rawTarget);
  const read = preparePublicRegionList({ regions: target.regions }, target.pagination);
  return bindRead("planetscale/region-catalog/public", target, "list_public_regions", read.request,
    "record-and-name-parent-not-verified");
}

export function bindGetMoveTablesWorkflowStatusPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = moveTablesWorkflowStatusTarget.parse(rawTarget);
  const read = prepareMoveTablesWorkflowStatus({ organization: target.organization, database: target.database,
    branch: target.branch, branchId: target.branchId, workflow: target.workflow,
    targetKeyspace: target.targetKeyspace, keyspaceId: target.keyspaceId }, {});
  return bindRead(`planetscale/keyspace/${target.keyspaceId}`, target, "get_move_tables_workflow_status", read.request,
    "absent-request-bound-only");
}

export function bindGetMaintenanceSchedulePreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = maintenanceScheduleTarget.parse(rawTarget);
  const read = prepareMaintenanceSchedule({ organization: target.organization, database: target.database,
    scheduleId: target.scheduleId }, {});
  return bindRead(`planetscale/maintenance-schedule/${target.scheduleId}`, target, "get_maintenance_schedule", read.request,
    "record-id-only-parent-not-verified");
}

export function bindGetBranchMaintenanceWindowPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = branchMaintenanceWindowTarget.parse(rawTarget);
  const read = prepareBranchMaintenanceWindow({ organization: target.organization, database: target.database,
    branch: target.branch, scheduleId: target.scheduleId }, {});
  return bindRead(`planetscale/maintenance-schedule/${target.scheduleId}`, target, "get_branch_maintenance_window", read.request,
    "record-id-only-parent-not-verified");
}

export function bindGetInstantBranchMetricsPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = instantBranchMetricsTarget.parse(rawTarget);
  const read = prepareInstantBranchMetrics({ organization: target.organization, database: target.database,
    branch: target.branch, branchId: target.branchId, metric: target.metric }, {});
  return bindRead(`planetscale/branch/${target.branchId}`, target, "get_instant_branch_metrics", read.request,
    "branch-id-and-name-parent-not-verified");
}

export function bindGetInstantTabletMetricsPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = instantTabletMetricsTarget.parse(rawTarget);
  const read = prepareInstantTabletMetrics({ organization: target.organization, database: target.database,
    branch: target.branch, branchId: target.branchId, metric: target.metric }, {});
  return bindRead(`planetscale/branch/${target.branchId}`, target, "get_instant_tablet_metrics", read.request,
    "branch-id-and-name-parent-not-verified");
}

export function bindGetBranchMetricsPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = branchMetricsTarget.parse(rawTarget);
  const read = prepareBranchMetrics({ organization: target.organization, database: target.database,
    branch: target.branch, branchId: target.branchId, metric: target.metric, from: target.from, to: target.to }, {});
  return bindRead(`planetscale/branch/${target.branchId}`, target, "get_branch_metrics", read.request,
    "absent-request-bound-only");
}

export function bindGetTabletMetricsPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = tabletMetricsTarget.parse(rawTarget);
  const read = prepareTabletMetrics({ organization: target.organization, database: target.database,
    branch: target.branch, branchId: target.branchId, metric: target.metric, from: target.from, to: target.to }, {});
  return bindRead(`planetscale/branch/${target.branchId}`, target, "get_tablet_metrics", read.request,
    "absent-request-bound-only");
}

export function bindGetBranchQueryMetricsPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = branchMetricsTarget.parse(rawTarget);
  const read = prepareBranchQueryMetrics({ organization: target.organization, database: target.database,
    branch: target.branch, branchId: target.branchId, metric: target.metric, from: target.from, to: target.to }, {});
  return bindRead(`planetscale/branch/${target.branchId}`, target, "get_branch_query_metrics", read.request,
    "absent-request-bound-only");
}

export function bindGetBranchTagMetricsPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = branchMetricsTarget.parse(rawTarget);
  const read = prepareBranchTagMetrics({ organization: target.organization, database: target.database,
    branch: target.branch, branchId: target.branchId, metric: target.metric, from: target.from, to: target.to }, {});
  return bindRead(`planetscale/branch/${target.branchId}`, target, "get_branch_tag_metrics", read.request,
    "absent-request-bound-only");
}

export function bindLintBranchSchemaPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = lintBranchTarget.parse(rawTarget);
  const read = prepareLintBranchSchema({ organization: target.organization, database: target.database,
    branch: target.branch, keyspaceNames: target.keyspaceNames }, { page: 1, perPage: 10 });
  return bindRead(`planetscale/branch/${target.branchId}`, target, "lint_branch_schema", read.request,
    "keyspace-name-only-parent-not-verified");
}

export function bindCheckDeployRequestStoragePreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = deployStorageCheckTarget.parse(rawTarget);
  const read = prepareDeployStorageCheck({ organization: target.organization, database: target.database,
    number: target.number }, {});
  return bindRead(`planetscale/deploy-request/${target.requestId}`, target, "check_deploy_request_storage", read.request,
    "absent-request-bound-only");
}

export function bindGetKeyspaceVschemaPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = keyspaceTarget.parse(rawTarget);
  const read = prepareKeyspaceVschema({ organization: target.organization, database: target.database,
    branch: target.branch, keyspace: target.keyspace }, {});
  return bindRead(`planetscale/keyspace/${target.keyspace.id}`, target, "get_keyspace_vschema", read.request,
    "absent-request-bound-only");
}

export function bindGetDataTopologyPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = branchTarget.parse(rawTarget);
  const read = prepareDataTopology({ organization: target.organization, database: target.database,
    branch: target.branch, branchId: target.branchId }, {});
  return bindRead(`planetscale/branch/${target.branchId}`, target, "get_data_topology", read.request,
    "absent-request-bound-only");
}

export function bindGetChangeRequestPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = unifiedChangeTarget.parse(rawTarget);
  const read = prepareChangeRequest({ organization: target.organization, database: target.database,
    branch: target.branch, change: target.change }, {});
  return bindRead(`planetscale/change-request/${target.change.id}`, target, "get_change_request", read.request,
    "record-and-target-binding-parent-not-verified");
}

export function bindGetVtctldOperationPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = vtctldOperationTarget.parse(rawTarget);
  const read = prepareVtctldOperation({ organization: target.organization, database: target.database,
    branch: target.branch, operationId: target.operationId }, {});
  return bindRead(`planetscale/vtctld-operation/${target.operationId}`, target, "get_vtctld_operation", read.request,
    "record-id-only-parent-not-verified");
}

export function bindGetBranchQueryPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = branchQueryTarget.parse(rawTarget);
  const read = prepareBranchQuery({ organization: target.organization, database: target.database,
    branch: target.branch, queryId: target.queryId }, {});
  return bindRead(`planetscale/branch-query/${target.queryId}`, target, "get_branch_query", read.request,
    "record-id-only-parent-not-verified");
}

export function bindGetBranchQueryTagPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = branchQueryTagTarget.parse(rawTarget);
  const read = prepareBranchQueryTag({ organization: target.organization, database: target.database,
    branch: target.branch, tag: target.tag }, {});
  return bindRead(`planetscale/branch-query-tag/${target.tag.id}`, target, "get_branch_query_tag", read.request,
    "record-and-name-parent-not-verified");
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

export function bindGetDatabasePostgresCidrPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = databaseCidrTarget.parse(rawTarget);
  const read = prepareDatabaseCidr({ organization: target.organization, database: target.database,
    cidrId: target.cidrId }, {});
  return bindRead(`planetscale/database-cidr/${target.cidrId}`, target,
    "get_database_postgres_cidr", read.request, "record-id-only-parent-not-verified");
}

export function bindGetDatabaseThrottlerPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = databaseThrottlerTarget.parse(rawTarget);
  const read = prepareDatabaseThrottler({ organization: target.organization, database: target.database,
    configurableId: target.configurableId, keyspaceNames: target.keyspaceNames }, {});
  return bindRead(`planetscale/database-throttler/${target.databaseId}/${target.configurableId}`, target,
    "get_database_throttler", read.request, "record-id-only-parent-not-verified");
}

export function bindGetDeployRequestThrottlerPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = deployThrottlerTarget.parse(rawTarget);
  const read = prepareDeployThrottler({ organization: target.organization, database: target.database,
    number: target.number, configurableId: target.configurableId, keyspaceNames: target.keyspaceNames }, {});
  return bindRead(`planetscale/deploy-request-throttler/${target.requestId}/${target.configurableId}`, target,
    "get_deploy_request_throttler", read.request, "record-id-only-parent-not-verified");
}

export function bindGetWebhookPreparation(rawTarget: unknown): (raw: unknown) => Prepared {
  const target = webhookTarget.parse(rawTarget);
  const read = prepareWebhook({ organization: target.organization, database: target.database,
    webhookId: target.webhookId }, {});
  return bindRead(`planetscale/webhook/${target.webhookId}`, target,
    "get_webhook", read.request, "record-id-only-parent-not-verified");
}
