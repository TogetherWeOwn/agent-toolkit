import { createNeonMetadataOperations } from '../dist/plugins/neon-broker/src/metadata.js';
import { createNeonCatalogOperations } from '../dist/plugins/neon-broker/src/catalog.js';
import { createNeonCapabilityOperations } from '../dist/plugins/neon-broker/src/capabilities.js';
import { createNeonBranchFeatureOperations } from '../dist/plugins/neon-broker/src/branch-features.js';
import { createNeonAuthStatusOperations } from '../dist/plugins/neon-broker/src/auth-status.js';
import { createNeonAuthDomainOperations } from '../dist/plugins/neon-broker/src/auth-domains.js';
import { createNeonAuthIntegrationOperations } from '../dist/plugins/neon-broker/src/auth-integrations.js';
import { createNeonFunctionOperations } from '../dist/plugins/neon-broker/src/functions.js';
import { createNeonTriggerOperations } from '../dist/plugins/neon-broker/src/triggers.js';
import { createNeonAuthClientOperations } from '../dist/plugins/neon-broker/src/auth-clients.js';
import { createNeonBranchResourceOperations } from '../dist/plugins/neon-broker/src/branch-resources.js';
import { createNeonProjectSecurityOperations } from '../dist/plugins/neon-broker/src/project-security.js';
import { createNeonProjectAccessOperations } from '../dist/plugins/neon-broker/src/project-access.js';
import { createNeonOrganizationVPCOperations } from '../dist/plugins/neon-broker/src/organization-vpc.js';
import { createNeonOrganizationInvitationOperations } from '../dist/plugins/neon-broker/src/organization-invitations.js';
import { createNeonOrganizationMemberOperations } from '../dist/plugins/neon-broker/src/organization-members.js';
import { createNeonOrganizationOperations } from '../dist/plugins/neon-broker/src/organization.js';
import { createNeonMetadataTransport } from '../dist/plugins/neon-broker/src/transport.js';
import { createNeonDataAPIOperations } from '../dist/plugins/neon-broker/src/data-api.js';
import { createNeonRegionOperations } from '../dist/plugins/neon-broker/src/regions.js';
import { createNeonProjectCountOperations } from '../dist/plugins/neon-broker/src/project-count.js';
import { createNeonAuthWebhookOperations } from '../dist/plugins/neon-broker/src/auth-webhooks.js';
import { createNeonUserProfileOperations } from '../dist/plugins/neon-broker/src/user-profile.js';
import { createNeonAuthEmailOperations } from '../dist/plugins/neon-broker/src/auth-email.js';
import { createNeonProjectOperations } from '../dist/plugins/neon-broker/src/projects.js';
import { createNeonUserOrganizationOperations } from '../dist/plugins/neon-broker/src/user-organizations.js';
import { createNeonSharedProjectOperations } from '../dist/plugins/neon-broker/src/shared-projects.js';
import { createNeonLogFieldOperations } from '../dist/plugins/neon-broker/src/log-fields.js';
import { createNeonLogValueOperations } from '../dist/plugins/neon-broker/src/log-values.js';
import { createNeonBucketObjectOperations } from '../dist/plugins/neon-broker/src/bucket-objects.js';
import { createNeonConsumptionOperations } from '../dist/plugins/neon-broker/src/consumption.js';
import { createNeonBranchConsumptionOperations } from '../dist/plugins/neon-broker/src/branch-consumption.js';
import { createNeonLegacyConsumptionOperations } from '../dist/plugins/neon-broker/src/legacy-consumption.js';
import { createNeonMaskingRuleOperations } from '../dist/plugins/neon-broker/src/masking-rules.js';
import { createNeonAuthDetailsOperations } from '../dist/plugins/neon-broker/src/auth-details.js';
import { createNeonCredentialMetadataOperations } from '../dist/plugins/neon-broker/src/credential-metadata.js';
import { createNeonOrganizationKeyOperations } from '../dist/plugins/neon-broker/src/organization-keys.js';
import { createNeonUserKeyOperations } from '../dist/plugins/neon-broker/src/user-keys.js';
import { createNeonAdvisorOperations } from '../dist/plugins/neon-broker/src/advisor.js';
import { createNeonBranchSchemaOperations } from '../dist/plugins/neon-broker/src/branch-schema.js';
import { createNeonSchemaComparisonOperations } from '../dist/plugins/neon-broker/src/schema-comparison.js';
import { createNeonLogQueryOperations } from '../dist/plugins/neon-broker/src/log-query.js';
import { createNeonOAuthProviderOperations } from '../dist/plugins/neon-broker/src/oauth-providers.js';
import { createNeonObjectDownloadOperations } from '../dist/plugins/neon-broker/src/object-download.js';
import { createNeonBranchUpdateOperations } from '../dist/plugins/neon-broker/src/branch-update.js';
import { createNeonProjectUpdateOperations } from '../dist/plugins/neon-broker/src/project-update.js';
import { createNeonEndpointUpdateOperations } from '../dist/plugins/neon-broker/src/endpoint-update.js';
import { createNeonEndpointStartOperations } from '../dist/plugins/neon-broker/src/endpoint-start.js';
import { createNeonEndpointRestartOperations } from '../dist/plugins/neon-broker/src/endpoint-restart.js';
import { createNeonEndpointSuspendOperations } from '../dist/plugins/neon-broker/src/endpoint-suspend.js';
import { createNeonEndpointDeleteOperations } from '../dist/plugins/neon-broker/src/endpoint-delete.js';
import { createNeonDatabaseDeleteOperations } from '../dist/plugins/neon-broker/src/database-delete.js';
import { createNeonProjectMemberRoleRemoveOperations } from '../dist/plugins/neon-broker/src/project-member-role-remove.js';
import { createNeonOrganizationMemberRemoveOperations } from '../dist/plugins/neon-broker/src/organization-member-remove.js';
import { createNeonAuthClientDeleteOperations } from '../dist/plugins/neon-broker/src/auth-client-delete.js';
import { createNeonTriggerDeleteOperations } from '../dist/plugins/neon-broker/src/trigger-delete.js';
import { createNeonJWKSDeleteOperations } from '../dist/plugins/neon-broker/src/jwks-delete.js';
import { createNeonPermissionRevokeOperations } from '../dist/plugins/neon-broker/src/permission-revoke.js';
import { createNeonCredentialRevokeOperations } from '../dist/plugins/neon-broker/src/credential-revoke.js';
import { createNeonOrganizationKeyRevokeOperations } from '../dist/plugins/neon-broker/src/organization-key-revoke.js';
import { createNeonUserKeyRevokeOperations } from '../dist/plugins/neon-broker/src/user-key-revoke.js';
import { createNeonRoleDeleteOperations } from '../dist/plugins/neon-broker/src/role-delete.js';
import { createNeonProjectDeleteOperations } from '../dist/plugins/neon-broker/src/project-delete.js';
import { createNeonBranchDeleteOperations } from '../dist/plugins/neon-broker/src/branch-delete.js';
import { createNeonSnapshotUpdateOperations } from '../dist/plugins/neon-broker/src/snapshot-update.js';
import { createNeonSnapshotDeleteOperations } from '../dist/plugins/neon-broker/src/snapshot-delete.js';

export const scope = {
  projectId: 'project-a', revision: 'scope-v1', branchIds: ['br-a', 'br-b'],
  endpoints: [{ id: 'ep-a', branchId: 'br-a' }, { id: 'ep-b', branchId: 'br-b' }],
};
export const operation = { id: 'a07f8772-1877-4da9-a939-3a3ae62d1d8d', project_id: 'project-a', branch_id: 'br-a',
  endpoint_id: 'ep-a', action: 'create_timeline', status: 'finished', failures_count: 0, total_duration_ms: 100 };
export const database = { id: 834686, branch_id: 'br-a', name: 'main' };
export const role = { branch_id: 'br-a', name: 'reader', protected: false };
export const catalogScope = { ...scope,
  operations: [{ id: operation.id, branchId: 'br-a', endpointId: 'ep-a' }],
  databases: [{ id: database.id, branchId: 'br-a', name: database.name }],
  roles: [{ branchId: 'br-a', name: role.name }],
};
export function catalogScopeAt(count) {
  const indices = Array.from({ length: count }, (_, index) => index);
  return { ...scope,
    branchIds: indices.map(index => `br-${index}`),
    endpoints: indices.map(index => ({ id: `ep-${index}`, branchId: `br-${index}` })),
    operations: indices.map(index => ({ id: `00000000-0000-0000-0000-${index.toString(16).padStart(12, '0')}`,
      branchId: `br-${index}`, endpointId: `ep-${index}` })),
    databases: indices.map(index => ({ id: index + 1, name: `db_${index}`, branchId: `br-${index}` })),
    roles: indices.map(index => ({ name: `reader_${index}`, branchId: `br-${index}` })),
  };
}
export const project = { id: 'project-a', region_id: 'aws-us-east-2', pg_version: 17 };
export const branch = { id: 'br-a', project_id: 'project-a', current_state: 'ready', default: true, protected: false };
export const endpoint = { id: 'ep-a', project_id: 'project-a', branch_id: 'br-a', type: 'read_write', current_state: 'idle', disabled: false };
export const cases = [
  ['getProject', { project_id: 'project-a' }, { project }, { project }],
  ['listProjectBranches', { project_id: 'project-a' }, { branches: [branch] }, { branches: [branch] }],
  ['getProjectBranch', { project_id: 'project-a', branch_id: 'br-a' }, { branch }, { branch }],
  ['listProjectBranchEndpoints', { project_id: 'project-a', branch_id: 'br-a' }, { endpoints: [endpoint] }, { endpoints: [endpoint] }],
  ['getProjectEndpoint', { project_id: 'project-a', endpoint_id: 'ep-a' }, { endpoint }, { endpoint }],
];
export const catalogCases = [
  ['getProjectOperation', { project_id: 'project-a', operation_id: operation.id }, { operation }, { operation }],
  ['listProjectOperations', { project_id: 'project-a' }, { operations: [operation] }, { operations: [operation] }],
  ['countProjectBranches', { project_id: 'project-a' }, { count: 2 }, { count: 2 }],
  ['listProjectEndpoints', { project_id: 'project-a' }, { endpoints: [endpoint] }, { endpoints: [endpoint] }],
  ['listProjectBranchDatabases', { project_id: 'project-a', branch_id: 'br-a' }, { databases: [database] }, { databases: [database] }],
  ['getProjectBranchDatabase', { project_id: 'project-a', branch_id: 'br-a', database_name: 'main' }, { database }, { database }],
  ['listProjectBranchRoles', { project_id: 'project-a', branch_id: 'br-a' }, { roles: [role] }, { roles: [role] }],
  ['getProjectBranchRole', { project_id: 'project-a', branch_id: 'br-a', role_name: 'reader' }, { role }, { role }],
];
export const library = { library_name: 'pg_stat_statements', is_default: true, is_experimental: false, version: '1.11' };
export const anonymized = { project_id: 'project-a', branch_id: 'br-a', state: 'anonymized' };
export const snapshot = { id: 'snap-a', source_branch_id: 'br-a', created_at: '2026-11-08T00:00:00Z', manual: true };
export const schedule = { frequency: 'daily', hour: 3, day: 1, month: 1, retention_seconds: 86400 };
export const capabilityScope = { projectId: scope.projectId, revision: scope.revision, branchIds: scope.branchIds,
  snapshots: [{ id: 'snap-a', branchId: 'br-a' }] };
export const capabilityCases = [
  ['getAvailablePreloadLibraries', { project_id: 'project-a' }, { libraries: [library] }, { libraries: [library] }],
  ['getAnonymizedBranchStatus', { project_id: 'project-a', branch_id: 'br-a' }, anonymized, anonymized],
  ['listSnapshots', { project_id: 'project-a' }, { snapshots: [snapshot] }, { snapshots: [snapshot] }],
  ['getSnapshotSchedule', { project_id: 'project-a', branch_id: 'br-a' }, { schedule: [schedule] }, { schedule: [schedule] }],
];
export const branchFeatureScope = { projectId: scope.projectId, revision: scope.revision, branchIds: scope.branchIds };
export const realtime = { enabled: false, pending: true, revision: 1, invocation_url: 'https://example.invalid', allowed_origins: ['https://example.invalid'] };
export const storage = { enabled: true, s3_endpoint: 'https://example.invalid', region: 'us-east-2', force_path_style: true };
export const aiGateway = { enabled: true, base_url: 'https://example.invalid' };
export const branchFeatureCases = [
  ['getProjectBranchRealtime', { project_id: 'project-a', branch_id: 'br-a' }, realtime, { enabled: false, pending: true, revision: 1 }],
  ['getProjectBranchStorage', { project_id: 'project-a', branch_id: 'br-a' }, storage, { enabled: true }],
  ['getProjectBranchAiGateway', { project_id: 'project-a', branch_id: 'br-a' }, aiGateway, { enabled: true }],
];
export const authStatusScope = { projectId: scope.projectId, revision: scope.revision, branchIds: scope.branchIds };
export const authStatusCases = [
  ['getNeonAuthAllowLocalhost', { project_id: 'project-a', branch_id: 'br-a' }, { allow_localhost: false }, { allow_localhost: false }],
  ['getNeonAuthPhoneNumberPlugin', { project_id: 'project-a', branch_id: 'br-a' }, { enabled: true, otp_expires_in: 300 }, { enabled: true, otp_expires_in: 300 }],
  ['getNeonAuthOAuthProviderPlugin', { project_id: 'project-a', branch_id: 'br-a' }, { enabled: false }, { enabled: false }],
];
export const authDomainScope = { projectId: scope.projectId, revision: scope.revision, branchIds: scope.branchIds };
export const authDomain = { domain: 'example.invalid', auth_provider: 'better_auth' };
export const authDomainCases = [
  ['listNeonAuthRedirectURIWhitelistDomains', { project_id: 'project-a' }, { domains: [authDomain] }, { domains: [authDomain] }],
  ['listBranchNeonAuthTrustedDomains', { project_id: 'project-a', branch_id: 'br-a' }, { domains: [authDomain] }, { domains: [authDomain] }],
];
export const authIntegrationScope = { projectId: scope.projectId, revision: scope.revision, branchIds: scope.branchIds };
export const authIntegration = { branch_id: 'br-a', auth_provider: 'better_auth', owned_by: 'neon', transfer_status: 'finished' };
export const authIntegrationCases = [
  ['getNeonAuth', { project_id: 'project-a', branch_id: 'br-a' }, authIntegration, authIntegration],
  ['listNeonAuthIntegrations', { project_id: 'project-a' }, { data: [authIntegration] }, { data: [authIntegration] }],
];
export const functionScope = { projectId: scope.projectId, revision: scope.revision, branchIds: scope.branchIds,
  functions: [{ id: 'fn-a', slug: 'hello', branchId: 'br-a' }, { id: 'fn-b', slug: 'other', branchId: 'br-b' }] };
export const neonFunction = { id: 'fn-a', slug: 'hello', current_deployment: { id: 2, status: 'building' },
  active_deployment: { id: 1, status: 'completed' } };
export const functionCases = [
  ['listProjectBranchFunctions', { project_id: 'project-a', branch_id: 'br-a' }, { functions: [neonFunction] }, { functions: [neonFunction] }],
  ['getProjectBranchFunction', { project_id: 'project-a', branch_id: 'br-a', slug: 'hello' }, { function: neonFunction }, { function: neonFunction }],
];
export const triggerScope = { projectId: scope.projectId, revision: scope.revision, branchIds: scope.branchIds,
  triggers: [{ id: 'tr-a', branchId: 'br-a', functionSlug: 'hello' }, { id: 'tr-b', branchId: 'br-a', functionSlug: 'other' },
    { id: 'tr-a', branchId: 'br-b', functionSlug: 'hello' }] };
export const neonTrigger = { trigger_id: 'tr-a', type: 'schedule', function_slug: 'hello', enabled: false, inherited: true, version: 1 };
export const triggerCases = [
  ['listProjectBranchTriggers', { project_id: 'project-a', branch_id: 'br-a' }, { triggers: [neonTrigger] }, { triggers: [neonTrigger] }],
  ['getProjectBranchTrigger', { project_id: 'project-a', branch_id: 'br-a', trigger_id: 'tr-a' }, { trigger: neonTrigger }, { trigger: neonTrigger }],
];
export const authClientScope = { projectId: scope.projectId, revision: scope.revision, branchIds: scope.branchIds,
  clients: [{ id: 'ClientA', branchId: 'br-a' }, { id: 'ClientB', branchId: 'br-b' }, { id: 'ClientC', branchId: 'br-a' }] };
export const authClient = { client_id: 'ClientA', type: 'confidential', skip_consent: false, disabled: true };
export const authClientCases = [
  ['listNeonAuthOAuthClients', { project_id: 'project-a', branch_id: 'br-a' }, { clients: [authClient] }, { clients: [authClient] }],
  ['getNeonAuthOAuthClient', { project_id: 'project-a', branch_id: 'br-a', client_id: 'ClientA' }, authClient, authClient],
];
export const branchResourceScope = { projectId: scope.projectId, revision: scope.revision, branchIds: scope.branchIds,
  buckets: [{ name: 'assets', branchId: 'br-a' }, { name: 'other', branchId: 'br-b' }],
  domains: [{ domain: 'app.example.invalid', branchId: 'br-a', functionSlug: 'hello' },
    { domain: 'other.example.invalid', branchId: 'br-b', functionSlug: 'other' }] };
export const bucket = { name: 'assets', access_level: 'private' };
export const customDomain = { domain: 'app.example.invalid', entity_type: 'function', entity_id: 'hello', status: 'pending' };
export const branchResourceCases = [
  ['listProjectBranchBuckets', { project_id: 'project-a', branch_id: 'br-a' }, { buckets: [bucket] }, { buckets: [bucket] }],
  ['listProjectBranchCustomDomains', { project_id: 'project-a', branch_id: 'br-a' }, { custom_domains: [customDomain] }, { custom_domains: [customDomain] }],
];
export const projectSecurityScope = { projectId: scope.projectId, revision: scope.revision, branchIds: scope.branchIds,
  jwks: [{ id: 'jwks-a', branchId: 'br-a' }, { id: 'jwks-project', branchId: null }], vpcEndpointIds: ['vpce-a'] };
export const jwks = { id: 'jwks-a', project_id: 'project-a', branch_id: 'br-a' };
export const vpcEndpoint = { vpc_endpoint_id: 'vpce-a' };
export const projectSecurityCases = [
  ['getProjectJWKS', { project_id: 'project-a' }, { jwks: [jwks] }, { jwks: [jwks] }],
  ['listProjectVPCEndpoints', { project_id: 'project-a' }, { endpoints: [vpcEndpoint] }, { endpoints: [vpcEndpoint] }],
];
export const projectAccessScope = { projectId: scope.projectId, revision: scope.revision, permissionIds: ['permission-a'],
  members: [{ memberId: '00000000-0000-0000-0000-000000000001', userId: '00000000-0000-0000-0000-000000000002' }] };
export const projectPermission = { id: 'permission-a' };
export const projectMember = { member_id: projectAccessScope.members[0].memberId, user_id: projectAccessScope.members[0].userId,
  org_role: 'viewer', effective_project_permission: 'VIEWER', grant_source: 'explicit' };
export const projectAccessCases = [
  ['listProjectPermissions', { project_id: 'project-a' }, { project_permissions: [projectPermission] }, { project_permissions: [projectPermission] }],
  ['listProjectMembers', { project_id: 'project-a' }, { project_members: [projectMember] }, { project_members: [projectMember] }],
];
export function projectAccessFixture(value, config = projectAccessScope) {
  return fixture(value, config, createNeonProjectAccessOperations);
}
export const organizationVPCScope = { organizationId: 'org-a', revision: scope.revision,
  regionIds: ['aws-us-east-2', 'aws-us-west-2', 'azure-eastus2'],
  endpoints: [{ id: 'vpce-a', regionId: 'aws-us-east-2' }, { id: 'vpce-b', regionId: 'aws-us-west-2' },
    { id: 'vpce-azure', regionId: 'azure-eastus2' }] };
export const organizationVPCEndpoint = { vpc_endpoint_id: 'vpce-a', region_id: 'aws-us-east-2' };
export const organizationVPCCases = [
  ['listOrganizationVPCEndpointsAllRegions', { org_id: 'org-a' }, { endpoints: [organizationVPCEndpoint] }, { endpoints: [organizationVPCEndpoint] }],
  ['listOrganizationVPCEndpoints', { org_id: 'org-a', region_id: 'aws-us-east-2' }, { endpoints: [vpcEndpoint] }, { endpoints: [organizationVPCEndpoint] }],
  ['getOrganizationVPCEndpointDetails', { org_id: 'org-a', region_id: 'aws-us-east-2', vpc_endpoint_id: 'vpce-a' }, vpcEndpoint, organizationVPCEndpoint],
];
export function organizationVPCFixture(value, config = organizationVPCScope) {
  return fixture(value, config, createNeonOrganizationVPCOperations);
}
export const organizationScope = { organizationId: 'org-a', revision: scope.revision };
export const organization = { id: 'org-a', require_mfa: false, allow_hipaa_projects: true };
export const organizationCases = [
  ['getOrganization', { org_id: 'org-a' }, organization, organization],
  ['getOrganizationSpendingLimit', { org_id: 'org-a' }, { spending_limit_cents: 10000 }, { spending_limit_cents: 10000 }],
];
export function organizationFixture(value, config = organizationScope) {
  return fixture(value, config, createNeonOrganizationOperations);
}
export const organizationMemberScope = { ...organizationScope, members: projectAccessScope.members };
export const organizationMember = { id: projectMember.member_id, user_id: projectMember.user_id, org_id: 'org-a', role: 'viewer' };
export const organizationMemberCases = [
  ['getOrganizationMembers', { org_id: 'org-a' }, { members: [{ member: organizationMember }] }, { members: [{ member: organizationMember }] }],
  ['getOrganizationMember', { org_id: 'org-a', member_id: organizationMember.id }, organizationMember, organizationMember],
];
export function organizationMemberFixture(value, config = organizationMemberScope) {
  return fixture(value, config, createNeonOrganizationMemberOperations);
}
export const organizationInvitationScope = { ...organizationScope, invitationIds: ['00000000-0000-0000-0000-000000000001'] };
export const organizationInvitation = { id: organizationInvitationScope.invitationIds[0], org_id: 'org-a', role: 'viewer' };
export const organizationInvitationCases = [
  ['getOrganizationInvitations', { org_id: 'org-a' }, { invitations: [organizationInvitation] }, { invitations: [organizationInvitation] }],
];
export function organizationInvitationFixture(value, config = organizationInvitationScope) {
  return fixture(value, config, createNeonOrganizationInvitationOperations);
}
export const dataAPIScope = { projectId: scope.projectId, revision: scope.revision,
  databases: [{ branchId: 'br-a', name: 'main' }, { branchId: 'br-a', name: 'other' }, { branchId: 'br-b', name: 'main' }] };
export const dataAPICases = [
  ['getProjectBranchDataAPI', { project_id: 'project-a', branch_id: 'br-a', database_name: 'main' },
    { status: 'running', url: 'https://example.invalid', settings: { db: 'main' } }, { status: 'running' }],
];
export function dataAPIFixture(value, config = dataAPIScope) {
  return fixture(value, config, createNeonDataAPIOperations);
}
export const regionScope = { ...organizationScope, regionIds: ['aws-us-east-1', 'azure-eastus2'] };
export const region = { region_id: 'aws-us-east-1', default: true };
export const regionCases = [
  ['getActiveRegions', { org_id: 'org-a' }, { regions: [region] }, { regions: [region] }],
];
export function regionFixture(value, config = regionScope) {
  return fixture(value, config, createNeonRegionOperations);
}
export const projectCountScope = { ...organizationScope };
export const projectCountCases = [
  ['countProjects', { org_id: 'org-a' }, { count: 2 }, { count: 2 }],
];
export function projectCountFixture(value, config = projectCountScope) {
  return fixture(value, config, createNeonProjectCountOperations);
}
export const authWebhookScope = { ...authStatusScope };
export const authWebhook = { enabled: true, enabled_events: ['user.created', 'send.otp'], timeout_seconds: 5 };
export const authWebhookCases = [
  ['getNeonAuthWebhookConfig', { project_id: 'project-a', branch_id: 'br-a' }, authWebhook, authWebhook],
];
export function authWebhookFixture(value, config = authWebhookScope) {
  return fixture(value, config, createNeonAuthWebhookOperations);
}
export const userProfileScope = { userId: 'user-a', revision: scope.revision };
export const userProfile = { id: 'user-a', projects_limit: 10, branches_limit: 20 };
export const userProfileCases = [
  ['getCurrentUserInfo', { user_id: 'user-a' }, userProfile, userProfile],
];
export function userProfileFixture(value, config = userProfileScope) {
  return fixture(value, config, createNeonUserProfileOperations);
}
export const authEmailScope = { ...authStatusScope };
export const authEmail = { enabled: true, email_verification_method: 'link', require_email_verification: true,
  auto_sign_in_after_verification: false, send_verification_email_on_sign_up: true,
  send_verification_email_on_sign_in: false, disable_sign_up: false, revoke_sessions_on_password_reset: true };
export const authEmailCases = [
  ['getNeonAuthEmailAndPasswordConfig', { project_id: 'project-a', branch_id: 'br-a' }, authEmail, authEmail],
];
export function authEmailFixture(value, config = authEmailScope) {
  return fixture(value, config, createNeonAuthEmailOperations);
}
export const projectScope = { organizationId: 'org-a', revision: scope.revision, projectIds: ['project-a', 'project-b'] };
export const projectCases = [
  ['listProjects', { org_id: 'org-a' }, { projects: [{ ...project, org_id: 'org-a' }] }, { projects: [project] }],
];
export function projectFixture(value, config = projectScope) {
  return fixture(value, config, createNeonProjectOperations);
}
export const userOrganizationScope = { ...userProfileScope, organizationIds: ['org-a', 'org-b'] };
export const userOrganizationCases = [
  ['getCurrentUserOrganizations', { user_id: 'user-a' }, { user: userProfile, catalog: { organizations: [{ id: 'org-a' }] } },
    { organizations: [{ id: 'org-a' }] }],
];
export function userOrganizationFixture(value, config = userOrganizationScope) {
  return fixture(typeof value === 'function' ? value : url => response(
    url.endsWith('/users/me') ? value.user : value.catalog), config, createNeonUserOrganizationOperations);
}
export const sharedProjectScope = { ...userProfileScope, projectIds: ['project-a', 'project-b'] };
export const sharedProjectCases = [
  ['listSharedProjects', { user_id: 'user-a' }, { user: userProfile, catalog: { projects: [project] } }, { projects: [project] }],
];
export function sharedProjectFixture(value, config = sharedProjectScope) {
  return fixture(typeof value === 'function' ? value : url => response(
    url.endsWith('/users/me') ? value.user : value.catalog), config, createNeonSharedProjectOperations);
}
export const logFieldScope = { projectId: scope.projectId, branchId: 'br-a', revision: scope.revision, fieldNames: ['level', 'service.name'] };
export const logFieldCases = [
  ['listProjectBranchLogFields', { project_id: 'project-a', branch_id: 'br-a' }, { fields: ['level', 'service.name'] }, { fields: ['level', 'service.name'] }],
];
export function logFieldFixture(value, config = logFieldScope) {
  return fixture(value, config, createNeonLogFieldOperations);
}
export const bucketObjectScope = { projectId: scope.projectId, branchId: 'br-a', bucketName: 'assets', revision: scope.revision,
  prefix: 'images/', objectKeys: ['images/a.png', 'images/b.png'] };
export const bucketObject = { key: 'images/a.png', size: 123 };
export const bucketObjectCases = [
  ['listProjectBranchBucketObjects', { project_id: 'project-a', branch_id: 'br-a', bucket_name: 'assets' },
    { objects: [bucketObject], folders: [], prefix: 'images/', is_truncated: false }, { objects: [bucketObject] }],
];
export function bucketObjectFixture(value, config = bucketObjectScope) {
  return fixture(value, config, createNeonBucketObjectOperations);
}
export const consumptionScope = { organizationId: 'org-a', projectId: 'project-a', revision: 'scope-v1',
  from: '2026-11-07T00:00:00Z', to: '2026-11-08T00:00:00Z' };
export const consumptionFrame = { timeframe_start: '2026-11-07T00:00:00Z', timeframe_end: '2026-11-07T01:00:00Z',
  metrics: [{ metric_name: 'compute_unit_seconds', value: 123 }] };
export const consumptionPeriod = { period_id: '00000000-0000-0000-0000-000000000001', period_plan: 'launch',
  period_start: '2026-11-01T00:00:00Z', consumption: [consumptionFrame] };
export const consumptionCases = [
  ['getConsumptionHistoryPerProjectV2', { org_id: 'org-a', project_id: 'project-a', from: consumptionScope.from, to: consumptionScope.to },
    { projects: [{ project_id: 'project-a', periods: [consumptionPeriod] }] },
    { projects: [{ project_id: 'project-a', consumption: [{ timeframe_start: consumptionFrame.timeframe_start,
      timeframe_end: consumptionFrame.timeframe_end, compute_unit_seconds: 123 }] }] }],
];
export function consumptionFixture(value, config = consumptionScope) {
  return fixture(value, config, createNeonConsumptionOperations);
}
export const branchConsumptionScope = { ...consumptionScope, branchId: 'br-a' };
export const branchConsumptionCases = [
  ['getConsumptionHistoryPerBranchV2', { org_id: 'org-a', project_id: 'project-a', branch_id: 'br-a', from: consumptionScope.from, to: consumptionScope.to },
    { branches: [{ project_id: 'project-a', branch_id: 'br-a', periods: [consumptionPeriod] }] },
    { branches: [{ project_id: 'project-a', branch_id: 'br-a', consumption: [{ timeframe_start: consumptionFrame.timeframe_start,
      timeframe_end: consumptionFrame.timeframe_end, compute_unit_seconds: 123 }] }] }],
];
export function branchConsumptionFixture(value, config = branchConsumptionScope) {
  return fixture(value, config, createNeonBranchConsumptionOperations);
}
export const legacyConsumptionFrame = { timeframe_start: consumptionFrame.timeframe_start,
  timeframe_end: consumptionFrame.timeframe_end, compute_time_seconds: 123 };
export const legacyConsumptionPeriod = { ...consumptionPeriod, period_plan: 'scale', consumption: [legacyConsumptionFrame] };
export const legacyConsumptionCases = [
  ['getConsumptionHistoryPerProject', { org_id: 'org-a', project_id: 'project-a', from: consumptionScope.from, to: consumptionScope.to },
    { projects: [{ project_id: 'project-a', periods: [legacyConsumptionPeriod] }] },
    { projects: [{ project_id: 'project-a', consumption: [legacyConsumptionFrame] }] }],
];
export function legacyConsumptionFixture(value, config = consumptionScope) {
  return fixture(value, config, createNeonLegacyConsumptionOperations);
}
export const maskingRule = { database_name: 'main', schema_name: 'public', table_name: 'users', column_name: 'email' };
export const maskingRuleScope = { projectId: scope.projectId, branchId: 'br-a', revision: scope.revision, rules: [maskingRule] };
export const maskingRuleCases = [
  ['getMaskingRules', { project_id: 'project-a', branch_id: 'br-a' },
    { masking_rules: [{ ...maskingRule, masking_function: 'anon.fake_email()', masking_value: 'redacted' }] }, { masking_rules: [maskingRule] }],
];
export function maskingRuleFixture(value, config = maskingRuleScope) {
  return fixture(value, config, createNeonMaskingRuleOperations);
}
export const authDetailsScope = { accountId: 'account-a', revision: scope.revision };
export const authDetails = { account_id: 'account-a', auth_method: 'api_key_user' };
export const authDetailsCases = [
  ['getAuthDetails', { account_id: 'account-a' }, { ...authDetails, auth_data: 'opaque-auth-data' }, authDetails],
];
export function authDetailsFixture(value, config = authDetailsScope) {
  return fixture(value, config, createNeonAuthDetailsOperations);
}
export const credentialMetadata = { token_id: 'nak_live_0123456789abcdef0123456789abcdef', branch_id: 'br-a' };
export const credentialMetadataScope = { projectId: scope.projectId, branchId: 'br-a', revision: scope.revision,
  tokenIds: [credentialMetadata.token_id] };
export const credentialMetadataCases = [
  ['listCredentials', { project_id: 'project-a', branch_id: 'br-a' },
    { credentials: [{ ...credentialMetadata, scopes: ['storage:read'], principal_type: 'user' }] }, { credentials: [credentialMetadata] }],
];
export function credentialMetadataFixture(value, config = credentialMetadataScope) {
  return fixture(value, config, createNeonCredentialMetadataOperations);
}
export const organizationKey = { id: 165432 };
export const organizationKeyScope = { organizationId: 'org-a', revision: scope.revision, keyIds: [organizationKey.id] };
export const organizationKeyCases = [
  ['listOrgApiKeys', { org_id: 'org-a' }, [organizationKey], { api_keys: [organizationKey] }],
];
export function organizationKeyFixture(value, config = organizationKeyScope) {
  return fixture(value, config, createNeonOrganizationKeyOperations);
}
export const userKeyScope = { userId: 'user-a', revision: scope.revision, keyIds: [165432] };
export const userKeyCases = [
  ['listApiKeys', { user_id: 'user-a' }, { user: { id: 'user-a' }, keys: [{ id: 165432 }] }, { api_keys: [{ id: 165432 }] }],
];
export function userKeyFixture(value, config = userKeyScope) {
  return fixture(typeof value === 'function' ? value : (url, init, n) => response(n === 1 ? value.user : value.keys), config, createNeonUserKeyOperations);
}
export const advisorScope = { projectId: scope.projectId, branchId: 'br-a', databaseName: 'main', revision: scope.revision };
export const advisorIssue = { cache_key: 'issue-a', level: 'ERROR', categories: ['SECURITY'] };
export const advisorCases = [
  ['getProjectAdvisorSecurityIssues', { project_id: 'project-a', branch_id: 'br-a', database_name: 'main' },
    { issues: [advisorIssue] }, { counts: { ERROR: 1, WARN: 0, INFO: 0 } }],
];
export function advisorFixture(value, config = advisorScope) {
  return fixture(value, config, createNeonAdvisorOperations);
}
export const schemaColumn = { schema_name: 'public', table_name: 'items', column_name: 'id' };
export const branchSchemaScope = { ...advisorScope, columns: [schemaColumn] };
export const schemaTable = { schema: 'public', name: 'items', columns: [{ name: 'id', type: 'integer' }] };
export const branchSchemaCases = [
  ['getProjectBranchSchema', { project_id: 'project-a', branch_id: 'br-a', db_name: 'main' },
    { json: { tables: [schemaTable] } }, { columns: [schemaColumn] }],
];
export function branchSchemaFixture(value, config = branchSchemaScope) {
  return fixture(value, config, createNeonBranchSchemaOperations);
}
export const logValueScope = { projectId: scope.projectId, branchId: 'br-a', revision: scope.revision, fieldName: 'level',
  startTime: '2026-11-08T10:00:00Z', endTime: '2026-11-08T11:00:00Z', source: 'function', values: ['INFO', 'WARN'] };
export const logValueCases = [
  ['listProjectBranchLogFieldValues', { project_id: 'project-a', branch_id: 'br-a', field_name: 'level',
    start_time: logValueScope.startTime, end_time: logValueScope.endTime, source: logValueScope.source },
    { values: ['INFO', 'WARN'], is_truncated: false }, { values: ['INFO', 'WARN'] }],
];
export function logValueFixture(value, config = logValueScope) {
  return fixture(value, config, createNeonLogValueOperations);
}
export const schemaComparisonScope = { ...advisorScope, baseBranchId: 'br-b' };
export const schemaComparisonCases = [
  ['getProjectBranchSchemaComparison', { project_id: 'project-a', branch_id: 'br-a', base_branch_id: 'br-b', db_name: 'main' },
    { diff: '--- base\n+++ target\n+CREATE TABLE items (id integer);\n' }, { has_diff: true }],
];
export function schemaComparisonFixture(value, config = schemaComparisonScope) {
  return fixture(value, config, createNeonSchemaComparisonOperations);
}
export const logQueryScope = { projectId: scope.projectId, branchId: 'br-a', revision: scope.revision,
  startTime: logValueScope.startTime, endTime: logValueScope.endTime, source: 'function' };
export const logRecord = { timestamp: '2026-11-08T10:00:00.000000001Z', source: 'function', message: 'fixture message', attributes: {} };
export const logQueryCases = [
  ['queryProjectBranchLogs', { project_id: 'project-a', branch_id: 'br-a', start_time: logQueryScope.startTime,
    end_time: logQueryScope.endTime, source: logQueryScope.source }, { logs: [logRecord], is_truncated: false }, { observed_count: 1 }],
];
export function logQueryFixture(value, config = logQueryScope) {
  return fixture(value, config, createNeonLogQueryOperations);
}
export const oauthProviderScope = { projectId: scope.projectId, branchId: 'br-a', revision: scope.revision, providerIds: ['github', 'apple'] };
export const oauthProvider = { id: 'github', type: 'standard' };
export const oauthProviderCases = [
  ['listNeonAuthOauthProviders', { project_id: 'project-a' }, { providers: [oauthProvider] }, { providers: [oauthProvider] }],
  ['listBranchNeonAuthOauthProviders', { project_id: 'project-a', branch_id: 'br-a' }, { providers: [oauthProvider] }, { providers: [oauthProvider] }],
];
export function oauthProviderFixture(value, config = oauthProviderScope) {
  return fixture(value, config, createNeonOAuthProviderOperations);
}
export const objectDownloadScope = { projectId: scope.projectId, branchId: 'br-a', bucketName: 'assets',
  objectKey: 'images/a.png', revision: scope.revision };
export const objectDownloadCases = [
  ['getProjectBranchBucketObject', { project_id: 'project-a', branch_id: 'br-a', bucket_name: 'assets', object_key: 'images/a.png' },
    { bytes: [0, 255, 1] }, { observed_bytes: 3 }],
];
export function binaryResponse(bytes, headers = {}) {
  const data = Uint8Array.from(bytes);
  return new Response(data, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(data.byteLength), ...headers } });
}
export function objectDownloadFixture(value, config = objectDownloadScope) {
  return fixture(typeof value === 'function' ? value : () => binaryResponse(value.bytes), config, createNeonObjectDownloadOperations);
}
export const allCases = [...objectDownloadCases, ...oauthProviderCases, ...logQueryCases, ...schemaComparisonCases, ...logValueCases, ...branchSchemaCases, ...advisorCases, ...userKeyCases, ...organizationKeyCases, ...credentialMetadataCases, ...authDetailsCases, ...maskingRuleCases, ...legacyConsumptionCases, ...branchConsumptionCases, ...consumptionCases, ...bucketObjectCases, ...logFieldCases, ...sharedProjectCases, ...userOrganizationCases, ...projectCases, ...authEmailCases, ...userProfileCases, ...authWebhookCases, ...projectCountCases, ...regionCases, ...dataAPICases, ...organizationInvitationCases, ...organizationMemberCases, ...organizationCases, ...organizationVPCCases, ...cases, ...catalogCases, ...capabilityCases, ...branchFeatureCases, ...authStatusCases, ...authDomainCases, ...authIntegrationCases, ...functionCases, ...triggerCases, ...authClientCases, ...branchResourceCases, ...projectSecurityCases, ...projectAccessCases];
export const sourceNames = [...allCases.map(([name]) => name), 'deleteSnapshot', 'updateSnapshot', 'updateProjectBranch', 'updateProject', 'updateProjectEndpoint', 'suspendProjectEndpoint', 'deleteProjectEndpoint', 'startProjectEndpoint', 'restartProjectEndpoint', 'deleteProjectBranch', 'deleteProject', 'deleteProjectBranchDatabase', 'deleteProjectBranchRole', 'revokeApiKey', 'revokeOrgApiKey', 'revokeCredential', 'revokePermissionFromProject', 'removeOrganizationMember', 'removeProjectMemberRole', 'deleteNeonAuthOAuthClient', 'deleteProjectJWKS', 'deleteProjectBranchTrigger', 'deleteProjectBranchFunction', 'deleteProjectBranchBucket', 'deleteProjectBranchCustomDomain'];
import { createNeonCustomDomainDeleteOperations } from '../dist/plugins/neon-broker/src/custom-domain-delete.js';
export const customDomainDeleteScope = { projectId: 'project-a', branchId: 'br-a', domain: 'app.example.invalid', functionSlug: 'hello', revision: 'scope-v1' };
export const customDomainDeleteArgs = { project_id: 'project-a', branch_id: 'br-a', domain: 'app.example.invalid' };
export const customDomainDeleteMetadata = { domain: 'app.example.invalid', entity_type: 'function', entity_id: 'hello' };
export function customDomainDeleteFixture(value = null, config = customDomainDeleteScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'DELETE' ? new Response(null, { status: 204 }) : response({ custom_domains: [{ domain: config.domain, entity_type: 'function', entity_id: config.functionSlug }] }),
  config, createNeonCustomDomainDeleteOperations);
}
import { createNeonBucketDeleteOperations } from '../dist/plugins/neon-broker/src/bucket-delete.js';
export const bucketDeleteScope = { projectId: 'project-a', branchId: 'br-a', bucketName: 'assets', expectedAccessLevel: 'private', revision: 'scope-v1' };
export const bucketDeleteArgs = { project_id: 'project-a', branch_id: 'br-a', bucket_name: 'assets' };
export const bucketDeleteMetadata = { name: 'assets', access_level: 'private' };
export function bucketDeleteFixture(value = null, config = bucketDeleteScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'DELETE' ? new Response(null, { status: 204 }) : response({ buckets: [{ name: config.bucketName, access_level: config.expectedAccessLevel }] }),
  config, createNeonBucketDeleteOperations);
}
import { createNeonFunctionDeleteOperations } from '../dist/plugins/neon-broker/src/function-delete.js';
export const functionDeleteScope = { projectId: 'project-a', branchId: 'br-a', functionId: 'fn-a', functionSlug: 'hello', revision: 'scope-v1' };
export const functionDeleteArgs = { project_id: 'project-a', branch_id: 'br-a', slug: 'hello' };
export const functionDeleteMetadata = { id: 'fn-a', slug: 'hello' };
export function functionDeleteFixture(value = null, config = functionDeleteScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'DELETE' ? new Response(null, { status: 204 }) : response({ function: { id: config.functionId, slug: config.functionSlug } }),
  config, createNeonFunctionDeleteOperations);
}
export const triggerDeleteScope = { projectId: 'project-a', branchId: 'br-a', triggerId: 'tr-a', functionSlug: 'hello',
  expectedType: 'schedule', expectedVersion: 1, expectedInherited: false, expectedEnabled: true, revision: 'scope-v1' };
export const triggerDeleteArgs = { project_id: 'project-a', branch_id: 'br-a', trigger_id: 'tr-a' };
export const triggerDeleteMetadata = { trigger_id: 'tr-a', function_slug: 'hello', type: 'schedule', version: 1, inherited: false, enabled: true };
export function triggerDeleteFixture(value = null, config = triggerDeleteScope) {
  const metadata = { trigger_id: config.triggerId, function_slug: config.functionSlug, type: config.expectedType,
    version: config.expectedVersion, inherited: config.expectedInherited, enabled: config.expectedEnabled };
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'DELETE' ? new Response(null, { status: 204 }) : response({ trigger: metadata }),
  config, createNeonTriggerDeleteOperations);
}
export const jwksDeleteScope = { projectId: 'project-a', branchId: 'br-a', jwksId: 'jwks-a', revision: 'scope-v1' };
export const jwksDeleteArgs = { project_id: 'project-a', jwks_id: 'jwks-a' };
export const jwksDeleteMetadata = { id: 'jwks-a', project_id: 'project-a', branch_id: 'br-a' };
export function jwksDeleteFixture(value = null, config = jwksDeleteScope) {
  const metadata = { id: config.jwksId, project_id: config.projectId, ...(config.branchId === null ? {} : { branch_id: config.branchId }) };
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    response(init.method === 'DELETE' ? metadata : { jwks: [metadata] }), config, createNeonJWKSDeleteOperations);
}
export const authClientDeleteScope = { projectId: 'project-a', branchId: 'br-a', clientId: 'clientA', revision: 'scope-v1' };
export const authClientDeleteArgs = { project_id: 'project-a', branch_id: 'br-a', client_id: 'clientA' };
export const authClientDeleteMetadata = { client_id: 'clientA' };
export function authClientDeleteFixture(value = null, config = authClientDeleteScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'DELETE' ? new Response(null, { status: 204 }) : response({ client_id: config.clientId }),
  config, createNeonAuthClientDeleteOperations);
}
export const projectMemberRoleRemoveScope = { projectId: 'project-a', memberId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222', expectedOrgRole: 'editor', expectedPermission: 'EDITOR', revision: 'scope-v1' };
export const projectMemberRoleRemoveArgs = { project_id: 'project-a', member_id: projectMemberRoleRemoveScope.memberId };
export const projectMemberRoleRemoveMetadata = { member_id: projectMemberRoleRemoveScope.memberId, user_id: projectMemberRoleRemoveScope.userId,
  org_role: 'editor', explicit_project_permission: 'EDITOR', grant_source: 'explicit' };
export const projectMemberRoleRemoveReceipt = { project_id: 'project-a', member_id: projectMemberRoleRemoveScope.memberId,
  user_id: projectMemberRoleRemoveScope.userId, org_role: 'editor' };
export function projectMemberRoleRemoveFixture(value, config = projectMemberRoleRemoveScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'DELETE' ? response(value === undefined ? { project_id: config.projectId, member_id: config.memberId, user_id: config.userId, org_role: config.expectedOrgRole } : value) :
      response({ project_members: [{ member_id: config.memberId, user_id: config.userId, org_role: config.expectedOrgRole,
        explicit_project_permission: config.expectedPermission, grant_source: 'explicit' }] }), config, createNeonProjectMemberRoleRemoveOperations);
}
export const organizationMemberRemoveScope = { organizationId: 'org-a', memberId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222', expectedRole: 'editor', revision: 'scope-v1' };
export const organizationMemberRemoveArgs = { org_id: 'org-a', member_id: organizationMemberRemoveScope.memberId };
export const organizationMemberRemoveMetadata = { id: organizationMemberRemoveScope.memberId, user_id: organizationMemberRemoveScope.userId,
  org_id: 'org-a', role: 'editor' };
export function organizationMemberRemoveFixture(value = {}, config = organizationMemberRemoveScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'DELETE' ? response(value) : response({ id: config.memberId, user_id: config.userId,
      org_id: config.organizationId, role: config.expectedRole }), config, createNeonOrganizationMemberRemoveOperations);
}
export const permissionRevokeScope = { projectId: 'project-a', permissionId: 'permission-a', revision: 'scope-v1' };
export const permissionRevokeArgs = { project_id: 'project-a', permission_id: 'permission-a' };
export const permissionRevokeReceipt = { id: 'permission-a' };
export function permissionRevokeFixture(value = permissionRevokeReceipt, config = permissionRevokeScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'DELETE' ? response(value) : response({ project_permissions: [{ id: config.permissionId }] }),
  config, createNeonPermissionRevokeOperations);
}
export const credentialRevokeScope = { projectId: 'project-a', branchId: 'br-a', tokenId: 'credential-id-fixture', revision: 'scope-v1' };
export const credentialRevokeArgs = { project_id: 'project-a', branch_id: 'br-a', token_id: credentialRevokeScope.tokenId };
export const credentialRevokeMetadata = { token_id: credentialRevokeScope.tokenId, branch_id: 'br-a', principal_type: 'user' };
export function credentialRevokeFixture(value = null, config = credentialRevokeScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'DELETE' ? new Response(null, { status: 204 }) : response({ credentials: [{ ...credentialRevokeMetadata,
      token_id: config.tokenId, branch_id: config.branchId }] }),
  config, createNeonCredentialRevokeOperations);
}
export const organizationKeyRevokeScope = { organizationId: 'org-a', keyId: 123, revision: 'scope-v1' };
export const organizationKeyRevokeArgs = { org_id: 'org-a', key_id: 123 };
export const organizationKeyRevokeReceipt = { id: 123, revoked: true };
export function organizationKeyRevokeFixture(value = organizationKeyRevokeReceipt, config = organizationKeyRevokeScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'DELETE' ? response(value) : response([{ id: config.keyId }]),
  config, createNeonOrganizationKeyRevokeOperations);
}
export const userKeyRevokeScope = { userId: 'user-a', keyId: 123, revision: 'scope-v1' };
export const userKeyRevokeArgs = { user_id: 'user-a', key_id: 123 };
export const userKeyRevokeReceipt = { id: 123, revoked: true };
export function userKeyRevokeFixture(value = userKeyRevokeReceipt, config = userKeyRevokeScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'DELETE' ? response(value) : new URL(url).pathname.endsWith('/users/me') ? response({ id: config.userId }) : response([{ id: config.keyId }]),
  config, createNeonUserKeyRevokeOperations);
}
export const roleDeleteScope = { projectId: 'project-a', branchId: 'br-a', roleName: 'reader', expectedCreatedAt: '2026-11-08T10:00:00Z', revision: 'scope-v1' };
export const roleDeleteArgs = { project_id: 'project-a', branch_id: 'br-a', role_name: 'reader' };
export const roleDeleteReceipt = { role: { name: 'reader', branch_id: 'br-a', created_at: roleDeleteScope.expectedCreatedAt, protected: false },
  operations: [{ ...operation, action: 'apply_config', status: 'running' }] };
export function roleDeleteFixture(value = roleDeleteReceipt, config = roleDeleteScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'DELETE' ? response(value) : response({ role: { name: config.roleName, branch_id: config.branchId,
      created_at: config.expectedCreatedAt, protected: false } }),
  config, createNeonRoleDeleteOperations);
}
export const databaseDeleteScope = { projectId: 'project-a', branchId: 'br-a', databaseName: 'main', databaseId: 123, revision: 'scope-v1' };
export const databaseDeleteArgs = { project_id: 'project-a', branch_id: 'br-a', database_name: 'main' };
export const databaseDeleteReceipt = { database: { id: 123, branch_id: 'br-a', name: 'main' },
  operations: [{ ...operation, action: 'apply_config', status: 'running' }] };
export function databaseDeleteFixture(value = databaseDeleteReceipt, config = databaseDeleteScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'DELETE' ? response(value) : response({ database: { id: config.databaseId, branch_id: config.branchId, name: config.databaseName } }),
  config, createNeonDatabaseDeleteOperations);
}
export const projectDeleteScope = { projectId: 'project-a', organizationId: 'org-a', revision: 'scope-v1' };
export const projectDeleteArgs = { project_id: 'project-a' };
export const projectDeleteReceipt = { project: { id: 'project-a', owner_id: 'org-a' } };
export function projectDeleteFixture(value = projectDeleteReceipt, config = projectDeleteScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'DELETE' ? response(value) : response({ project: { id: config.projectId, owner_id: config.organizationId } }),
  config, createNeonProjectDeleteOperations);
}
export const branchDeleteScope = { projectId: 'project-a', branchId: 'br-a', parentId: 'br-parent', revision: 'scope-v1' };
export const branchDeleteArgs = { project_id: 'project-a', branch_id: 'br-a' };
export const branchDeleteReceipt = { branch: { id: 'br-a', project_id: 'project-a', parent_id: 'br-parent', default: false, protected: false },
  operations: [{ ...operation, action: 'delete_timeline', status: 'running' }] };
export function branchDeleteFixture(value = branchDeleteReceipt, config = branchDeleteScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'DELETE' ? response(value) : response({ branch: { id: config.branchId, project_id: config.projectId,
      parent_id: config.parentId, default: false, protected: false } }),
  config, createNeonBranchDeleteOperations);
}
export const endpointDeleteScope = { projectId: 'project-a', branchId: 'br-a', endpointId: 'ep-a', revision: 'scope-v1' };
export const endpointDeleteArgs = { project_id: 'project-a', branch_id: 'br-a', endpoint_id: 'ep-a' };
export const endpointDeleteReceipt = { endpoint, operations: [{ ...operation, action: 'suspend_compute', status: 'running' }] };
export function endpointDeleteFixture(value = endpointDeleteReceipt, config = endpointDeleteScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'DELETE' ? response(value) : response({ endpoint: { id: config.endpointId, project_id: config.projectId, branch_id: config.branchId } }),
  config, createNeonEndpointDeleteOperations);
}
export const endpointStartScope = { projectId: 'project-a', branchId: 'br-a', endpointId: 'ep-a', revision: 'scope-v1' };
export const endpointStartArgs = { project_id: 'project-a', branch_id: 'br-a', endpoint_id: 'ep-a' };
export const endpointStartReceipt = { endpoint, operations: [{ ...operation, action: 'start_compute', status: 'running' }] };
export function endpointStartFixture(value = endpointStartReceipt, config = endpointStartScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'POST' ? response(value) : response({ endpoint: { id: config.endpointId, project_id: config.projectId, branch_id: config.branchId } }),
  config, createNeonEndpointStartOperations);
}
export const endpointRestartScope = { projectId: 'project-a', branchId: 'br-a', endpointId: 'ep-a', revision: 'scope-v1' };
export const endpointRestartArgs = { project_id: 'project-a', branch_id: 'br-a', endpoint_id: 'ep-a' };
export const endpointRestartReceipt = { endpoint, operations: [{ ...operation, action: 'suspend_compute', status: 'finished' },
  { ...operation, id: '00000000-0000-0000-0000-000000000001', action: 'start_compute', status: 'running' }] };
export function endpointRestartFixture(value = endpointRestartReceipt, config = endpointRestartScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'POST' ? response(value) : response({ endpoint: { id: config.endpointId, project_id: config.projectId, branch_id: config.branchId } }),
  config, createNeonEndpointRestartOperations);
}
export const endpointSuspendScope = { projectId: 'project-a', branchId: 'br-a', endpointId: 'ep-a', revision: 'scope-v1' };
export const endpointSuspendArgs = { project_id: 'project-a', branch_id: 'br-a', endpoint_id: 'ep-a' };
export const endpointSuspendReceipt = { endpoint, operations: [{ ...operation, action: 'suspend_compute', status: 'running' }] };
export function endpointSuspendFixture(value = endpointSuspendReceipt, config = endpointSuspendScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'POST' ? response(value) : response({ endpoint: { id: config.endpointId, project_id: config.projectId, branch_id: config.branchId } }),
  config, createNeonEndpointSuspendOperations);
}
export const endpointUpdateScope = { projectId: 'project-a', branchId: 'br-a', endpointId: 'ep-a', revision: 'scope-v1', expectedName: 'before', name: 'after' };
export const endpointUpdateArgs = { project_id: 'project-a', branch_id: 'br-a', endpoint_id: 'ep-a', name: 'after' };
export const endpointUpdateReceipt = { endpoint: { id: 'ep-a', project_id: 'project-a', branch_id: 'br-a', name: 'after' }, operations: [] };
export function endpointUpdateFixture(value = endpointUpdateReceipt, config = endpointUpdateScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'PATCH' ? response(value) : response({ endpoint: { id: config.endpointId, project_id: config.projectId, branch_id: config.branchId, name: config.expectedName } }),
  config, createNeonEndpointUpdateOperations);
}
export const projectUpdateScope = { projectId: 'project-a', revision: 'scope-v1', expectedName: 'before', name: 'after' };
export const projectUpdateArgs = { project_id: 'project-a', name: 'after' };
export const projectUpdateReceipt = { project: { id: 'project-a', name: 'after' }, operations: [] };
export function projectUpdateFixture(value = projectUpdateReceipt, config = projectUpdateScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'PATCH' ? response(value) : response({ project: { id: config.projectId, name: config.expectedName } }),
  config, createNeonProjectUpdateOperations);
}
export const branchUpdateScope = { projectId: 'project-a', branchId: 'br-a', revision: 'scope-v1', expectedName: 'before', name: 'after' };
export const branchUpdateArgs = { project_id: 'project-a', branch_id: 'br-a', name: 'after' };
export const branchUpdateReceipt = { branch: { id: 'br-a', project_id: 'project-a', name: 'after' }, operations: [] };
export function branchUpdateFixture(value = branchUpdateReceipt, config = branchUpdateScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'PATCH' ? response(value) : response({ branch: { id: config.branchId, project_id: config.projectId, name: config.expectedName } }),
  config, createNeonBranchUpdateOperations);
}
export const snapshotDeleteScope = { projectId: 'project-a', branchId: 'br-a', snapshotId: 'snap-a', revision: 'scope-v1' };
export const snapshotDeleteArgs = { project_id: 'project-a', branch_id: 'br-a', snapshot_id: 'snap-a' };
export const snapshotDeleteReceipt = { operations: [{ id: operation.id, project_id: 'project-a', status: 'scheduling' }] };
export function snapshotDeleteFixture(value = snapshotDeleteReceipt, config = snapshotDeleteScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'DELETE' ? response(value, { status: 202 }) : response({ snapshots: [{ id: config.snapshotId, source_branch_id: config.branchId }] }),
  config, createNeonSnapshotDeleteOperations);
}
export const snapshotUpdateScope = { ...snapshotDeleteScope, expectedName: 'before', name: 'after' };
export const snapshotUpdateArgs = { ...snapshotDeleteArgs, name: 'after' };
export const snapshotUpdateReceipt = { snapshot: { id: 'snap-a', source_branch_id: 'br-a', name: 'after' } };
export function snapshotUpdateFixture(value = snapshotUpdateReceipt, config = snapshotUpdateScope) {
  return fixture((url, init, n) => typeof value === 'function' ? value(url, init, n) :
    init.method === 'PATCH' ? response(value) : response({ snapshots: [{ id: config.snapshotId, source_branch_id: config.branchId, name: config.expectedName }] }),
  config, createNeonSnapshotUpdateOperations);
}
export const canary = 'synthetic-neon-credential-canary';
export function response(value, init = {}) {
  return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' }, ...init });
}
export function catalogFixture(value, config = catalogScope) {
  return fixture(value, config, createNeonCatalogOperations);
}
export function capabilityFixture(value, config = capabilityScope) {
  return fixture(value, config, createNeonCapabilityOperations);
}
export function branchFeatureFixture(value, config = branchFeatureScope) {
  return fixture(value, config, createNeonBranchFeatureOperations);
}
export function authStatusFixture(value, config = authStatusScope) {
  return fixture(value, config, createNeonAuthStatusOperations);
}
export function authDomainFixture(value, config = authDomainScope) {
  return fixture(value, config, createNeonAuthDomainOperations);
}
export function authIntegrationFixture(value, config = authIntegrationScope) {
  return fixture(value, config, createNeonAuthIntegrationOperations);
}
export function functionFixture(value, config = functionScope) {
  return fixture(value, config, createNeonFunctionOperations);
}
export function triggerFixture(value, config = triggerScope) {
  return fixture(value, config, createNeonTriggerOperations);
}
export function authClientFixture(value, config = authClientScope) {
  return fixture(value, config, createNeonAuthClientOperations);
}
export function branchResourceFixture(value, config = branchResourceScope) {
  return fixture(value, config, createNeonBranchResourceOperations);
}
export function projectSecurityFixture(value, config = projectSecurityScope) {
  return fixture(value, config, createNeonProjectSecurityOperations);
}
export function fixture(value, config = scope, factory = createNeonMetadataOperations) {
  const requests = [];
  const transport = createNeonMetadataTransport(async (url, init) => {
    requests.push({ url, init });
    return typeof value === 'function' ? value(url, init, requests.length) : response(value);
  });
  const operations = factory(structuredClone(config), transport);
  return {
    operations, requests,
    operation(name) { return operations.find(operation => operation.name === `neon.${name}`); },
    async run(name, args, signal = new AbortController().signal) {
      const operation = this.operation(name);
      const prepared = operation.prepare(args);
      return operation.project(await operation.execute(prepared, canary, signal, 'synthetic-request'));
    },
  };
}
