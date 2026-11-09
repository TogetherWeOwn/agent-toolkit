import { jsonData, requireThat } from "../../../packages/core/src/index.js";
import { canonicalHash, type Json, type Prepared, type ProviderOperation, type Tier } from "../../../packages/core/src/provider/index.js";
import { currentContentDescriptor, type CurrentContentScope } from "./current-content.js";
import { subscriptionDescriptors, type SubscriptionScope } from "./subscriptions.js";
import { workerScheduleDescriptor, type WorkerScheduleScope } from "./worker-schedules.js";
import { loadBalancingDescriptors, type LoadBalancingScope } from "./load-balancing.js";
import { zoneLoadBalancerDescriptors, type ZoneLoadBalancerScope } from "./zone-load-balancers.js";
import { healthCheckDescriptors, type HealthCheckScope } from "./health-checks.js";
import { rulesetDescriptors, type RulesetScope } from "./rulesets.js";
import { rulesListsDescriptors, type RulesListsScope } from "./rules-lists.js";
import { scriptSettingsDescriptors, type ScriptSettingsScope } from "./script-settings.js";
import { environmentSettingsDescriptor, type EnvironmentSettingsScope } from "./environment-settings.js";
import { dispatchSettingsDescriptor, type DispatchSettingsScope } from "./dispatch-settings.js";
import { dispatchScriptDescriptor, type DispatchScriptScope } from "./dispatch-scripts.js";
import { dispatchBindingsDescriptor, type DispatchBindingScope } from "./dispatch-bindings.js";
import { dispatchSecretDescriptor, dispatchSecretListDescriptor, type DispatchSecretScope } from "./dispatch-secret.js";
import { workerAccountDescriptors, type WorkerAccountScope } from "./worker-account.js";
import { workerIdentityDescriptors, type WorkerIdentityScope } from "./worker-identities.js";
import { dispatchNamespaceDescriptors, type DispatchNamespaceScope } from "./dispatch-namespaces.js";
import { workerVersionListDescriptor, type WorkerVersionListScope } from "./worker-version-list.js";
import { workerSecretDescriptor, type WorkerSecretScope } from "./worker-secret.js";
import { workerBuildDescriptor, type WorkerBuildScope } from "./worker-builds.js";
import { deployHookDescriptor, type DeployHookScope } from "./deploy-hooks.js";
import { buildTriggerDescriptor, type BuildTriggerScope } from "./build-triggers.js";
import { buildRecordDescriptors, type BuildRecordScope } from "./build-records.js";
import { queueConsumerDescriptors, type QueueConsumerScope } from "./queue-consumers.js";
import { pagesDomainDescriptors, type PagesDomainScope } from "./pages-domains.js";
import { hostnameTlsDescriptors, type HostnameTlsScope } from "./hostname-tls.js";
import { zoneTlsDescriptor, type ZoneTlsScope } from "./zone-tls.js";
import { dnssecDescriptor, type DnssecScope } from "./dnssec.js";
import { zoneListDescriptor, type ZoneListScope } from "./zone-list.js";
import { zoneHoldDescriptor, type ZoneHoldScope } from "./zone-hold.js";
import { regionalCacheDescriptor, type RegionalCacheScope } from "./regional-cache.js";
import { cacheSettingsDescriptors, type CacheSettingsScope } from "./cache-settings.js";
import { cacheMetadataDescriptors, type CacheMetadataScope } from "./cache-metadata.js";
import { argoSettingsDescriptors, type ArgoSettingsScope } from "./argo-settings.js";
import { zonePlanDescriptors, type ZonePlanScope } from "./zone-plans.js";
import { dnsSettingsDescriptor, type DnsSettingsScope } from "./dns-settings.js";
import { accountDnsDescriptor, type AccountDnsScope } from "./account-dns.js";
import { accountDetailDescriptor, type AccountDetailScope } from "./account-detail.js";
import { accountListDescriptor, type AccountListScope } from "./account-list.js";
import { universalSslDescriptor, type UniversalSslScope } from "./universal-ssl.js";
import { automaticSslDescriptor, type AutomaticSslScope } from "./automatic-ssl.js";
import { originPullsDescriptor, type OriginPullsScope } from "./origin-pulls.js";
import { hostnameOriginPullAssociationsDescriptor, hostnameOriginPullsDescriptor, type HostnameOriginPullsScope } from "./hostname-origin-pulls.js";
import { eventSubscriptionDescriptors, type EventSubscriptionScope } from "./event-subscriptions.js";
import { versionAssetDescriptor, type VersionAssetScope } from "./version-assets.js";
import { workerDomainMetadataDescriptors, type WorkerDomainScope } from "./worker-domains.js";
import { r2CorsDescriptor, type R2CorsScope } from "./r2-cors.js";
import { r2NotificationDescriptors, type R2NotificationScope } from "./r2-notifications.js";
import { r2LifecycleDescriptor, type R2LifecycleScope } from "./r2-lifecycle.js";
import { r2ManagedDomainDescriptor, type R2ManagedDomainScope } from "./r2-managed-domain.js";
import { r2CustomDomainDescriptors, type R2CustomDomainScope } from "./r2-custom-domains.js";
import { accessApplicationMetadataDescriptors, accessPolicyMetadataDescriptors, type AccessApplicationMetadataScope, type AccessPolicyMetadataScope, durableObjectMetadataDescriptors, metadataDescriptors, pagesMetadataDescriptors, secretsStoreMetadataDescriptors,
  workerRouteMetadataDescriptors, zoneMetadataDescriptors, type DurableObjectMetadataScope, type MetadataDescriptor, type MetadataScope,
  type PagesMetadataScope, type PreparedMetadata, type SecretsStoreMetadataScope, type WorkerRouteMetadataScope, type ZoneMetadataScope } from "./metadata.js";
import { currentContentTransport, metadataTransport, pagesCollectionTransport } from "./metadata-transport.js";

function json(value: unknown): Json {
  jsonData(value);
  return JSON.parse(JSON.stringify(value)) as Json;
}

function bind<A>(descriptor: {
  readonly name: string;
  readonly version: string;
  readonly tier: Tier;
  readonly providerOperationId: string;
  prepare(raw: unknown): PreparedMetadata<A>;
}, read: (raw: unknown, credential: string, signal: AbortSignal) => Promise<unknown>): ProviderOperation {
  // Core v1 project(raw) has no prepared argument. Keep each already-projected
  // response behind its own opaque receipt, never a shared last-request slot.
  const results = new WeakMap<object, Json>();
  function prepare(raw: unknown): Prepared {
    const input = descriptor.prepare(raw);
    return {
      resource: input.resource,
      arguments: json(input.arguments),
      plan: json({ kind: "bounded-current-read", providerOperationId: descriptor.providerOperationId,
        request: input.request, providerDryRun: false, providerRevisionFence: "not-established" }),
      artifactDigest: null,
    };
  }
  return Object.freeze({
    name: descriptor.name, version: descriptor.version, tier: descriptor.tier, timeoutMs: 10000, lifecycle: "none" as const,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal) {
      requireThat(canonicalHash(prepare(prepared.arguments)) === canonicalHash(prepared), "scope");
      requireThat(!signal.aborted, "upstream");
      const value = json(await read(prepared.arguments, credential, signal));
      requireThat(!signal.aborted, "upstream");
      const receipt = Object.freeze({});
      results.set(receipt, value);
      return receipt;
    },
    project(raw: unknown): Json {
      requireThat(raw !== null && typeof raw === "object" && results.has(raw), "scope");
      const value = results.get(raw)!;
      results.delete(raw);
      return value;
    },
  });
}

export interface CloudflareReadScope extends MetadataScope {
  zoneListIds?: ZoneListScope["zoneIds"];
  accountDetailReadAllowed?: AccountDetailScope["readAllowed"];
  accountListReadAllowed?: AccountListScope["readAllowed"];
  accountDnsReadAllowed?: AccountDnsScope["readAllowed"];
  subscriptions?: SubscriptionScope["subscriptions"];
  workerSchedules?: WorkerScheduleScope["workers"];
  rulesListIds?: RulesListsScope["listIds"];
  rulesListDetailIds?: RulesListsScope["listDetailIds"];
  rulesListItemLists?: RulesListsScope["itemLists"];
  rulesListItems?: RulesListsScope["items"];
  accountRulesetListIds?: RulesetScope["accountListIds"];
  accountRulesetIds?: RulesetScope["accountRulesetIds"];
  accountRulesetVersionLists?: RulesetScope["accountVersionLists"];
  accountRulesetVersions?: RulesetScope["accountVersions"];
  accountRulesetVersionRuleTags?: RulesetScope["accountVersionRuleTags"];
  accountRulesetEntrypoints?: RulesetScope["accountEntrypoints"];
  accountRulesetEntrypointVersionLists?: RulesetScope["accountEntrypointVersionLists"];
  accountRulesetEntrypointVersions?: RulesetScope["accountEntrypointVersions"];
  loadBalancingPoolListIds?: LoadBalancingScope["poolListIds"];
  loadBalancingPoolIds?: LoadBalancingScope["poolIds"];
  loadBalancingMonitorListIds?: LoadBalancingScope["monitorListIds"];
  loadBalancingMonitorIds?: LoadBalancingScope["monitorIds"];
  workerSecrets?: WorkerSecretScope["workers"];
  workerIdentityList?: WorkerIdentityScope["listWorkers"];
  workerIdentityDetails?: WorkerIdentityScope["workers"];
  dispatchNamespaceList?: DispatchNamespaceScope["listNamespaces"];
  dispatchNamespaceDetails?: DispatchNamespaceScope["namespaces"];
  workerVersionLists?: WorkerVersionListScope["workers"];
  workerAccountSettingsReadAllowed?: WorkerAccountScope["settingsReadAllowed"];
  workerAccountExpectedSubdomain?: WorkerAccountScope["expectedSubdomain"];
  workerEnvironmentSettings?: EnvironmentSettingsScope["environments"];
  dispatchScriptSettings?: DispatchSettingsScope["scripts"];
  dispatchSettingsBindings?: DispatchSettingsScope["bindingScripts"];
  dispatchScriptLists?: DispatchScriptScope["namespaces"];
  dispatchScriptBindings?: DispatchBindingScope["namespaces"];
  dispatchScriptSecrets?: DispatchSecretScope["namespaces"];
  dispatchScriptSecretLists?: DispatchSecretScope["namespaces"];
  workerObservabilityScriptNames?: ScriptSettingsScope["observabilityScriptNames"];
  workerUsageModelScriptNames?: ScriptSettingsScope["usageModelScriptNames"];
  workerBuildConfigurations?: WorkerBuildScope["workers"];
  workerDeployHooks?: DeployHookScope["workers"];
  workerBuildTriggers?: BuildTriggerScope["workers"];
  workerBuildRecords?: BuildRecordScope["workers"];
  queueConsumers?: QueueConsumerScope["queues"];
  queueConsumerConfigurations?: QueueConsumerScope["configurationConsumers"];
  eventSubscriptions?: EventSubscriptionScope["subscriptions"];
  secretStores?: SecretsStoreMetadataScope["stores"];
  durableNamespaces?: DurableObjectMetadataScope["namespaces"];
  pagesProjects?: PagesMetadataScope["projects"];
  pagesProvenanceProjects?: PagesMetadataScope["provenanceProjects"];
  pagesPagination?: PagesMetadataScope["pagination"];
  pagesProjectInventoryReadAllowed?: PagesMetadataScope["projectInventoryReadAllowed"];
  pagesDeploymentInventoryProjects?: PagesMetadataScope["deploymentInventoryProjects"];
  pagesDomains?: PagesDomainScope["projects"];
  workerDomains?: WorkerDomainScope["domains"];
  r2CorsBuckets?: R2CorsScope["buckets"];
  r2NotificationBuckets?: R2NotificationScope["buckets"];
  r2LifecycleBuckets?: R2LifecycleScope["buckets"];
  r2ManagedDomainBuckets?: R2ManagedDomainScope["buckets"];
  r2CustomDomainBuckets?: R2CustomDomainScope["buckets"];
  workerAssetVersions?: VersionAssetScope["workers"];
  workerPackageVersions?: VersionAssetScope["packageVersions"];
  accessApplications?: AccessApplicationMetadataScope["applications"];
  accessPolicies?: AccessPolicyMetadataScope["applications"];
  zone?: Pick<ZoneMetadataScope, "zoneId" | "dnsRecordIds"> & {
    workerRoutes?: WorkerRouteMetadataScope["routes"];
    hostnameTls?: HostnameTlsScope["settings"];
    tlsSettingIds?: ZoneTlsScope["settingIds"];
    dnssecReadAllowed?: DnssecScope["readAllowed"];
    zoneHoldReadAllowed?: ZoneHoldScope["readAllowed"];
    regionalCacheReadAllowed?: RegionalCacheScope["readAllowed"];
    cacheVariantsFormats?: CacheMetadataScope["formats"];
    cacheReserveClearStatusReadAllowed?: CacheMetadataScope["clearStatusReadAllowed"];
    cacheReserveReadAllowed?: CacheSettingsScope["reserveReadAllowed"];
    smartTieredCacheReadAllowed?: CacheSettingsScope["smartTieredReadAllowed"];
    argoSmartRoutingReadAllowed?: ArgoSettingsScope["smartRoutingReadAllowed"];
    argoTieredCachingReadAllowed?: ArgoSettingsScope["tieredCachingReadAllowed"];
    availablePlanListIds?: ZonePlanScope["listPlanIds"];
    availablePlanIds?: ZonePlanScope["planIds"];
    loadBalancerListIds?: ZoneLoadBalancerScope["listIds"];
    loadBalancerIds?: ZoneLoadBalancerScope["balancerIds"];
    rulesetListIds?: RulesetScope["zoneListIds"];
    rulesetIds?: RulesetScope["zoneRulesetIds"];
    rulesetVersionLists?: RulesetScope["zoneVersionLists"];
    rulesetVersions?: RulesetScope["zoneVersions"];
    rulesetVersionRuleTags?: RulesetScope["zoneVersionRuleTags"];
    rulesetEntrypoints?: RulesetScope["zoneEntrypoints"];
    rulesetEntrypointVersionLists?: RulesetScope["zoneEntrypointVersionLists"];
    rulesetEntrypointVersions?: RulesetScope["zoneEntrypointVersions"];
    healthCheckListIds?: HealthCheckScope["listIds"];
    healthCheckIds?: HealthCheckScope["healthcheckIds"];
    dnsSettingsReadAllowed?: DnsSettingsScope["readAllowed"];
    universalSslReadAllowed?: UniversalSslScope["readAllowed"];
    automaticSslReadAllowed?: AutomaticSslScope["readAllowed"];
    originPullsReadAllowed?: OriginPullsScope["readAllowed"];
    originPullHostnames?: HostnameOriginPullsScope["hostnames"];
    originPullAssociationHostnames?: HostnameOriginPullsScope["hostnames"];
  };
}

// Internal operation registry only; no tool registration or host/policy/credential
// defaults. Call solely through reviewed createProviderBroker with accepted adapters.
export function cloudflareReadOperations(scope: CloudflareReadScope, sourceScope: CurrentContentScope,
  fetcher: typeof fetch = fetch): readonly ProviderOperation[] {
  requireThat(scope.accountId === sourceScope.accountId && scope.revision === sourceScope.revision, "scope");
  const descriptors = metadataDescriptors(scope);
  const read = metadataTransport(fetcher);
  function metadata<A, O>(descriptor: MetadataDescriptor<A, O>): ProviderOperation {
    return bind(descriptor, (args, credential, signal) => read(descriptor, args, credential, signal));
  }
  const { accountId, revision } = scope;
  const subscriptions = subscriptionDescriptors({ accountId, revision, subscriptions: scope.subscriptions ?? [] });
  const rulesLists = rulesListsDescriptors({ accountId, revision,
    listIds: scope.rulesListIds ?? [], listDetailIds: scope.rulesListDetailIds ?? [],
    itemLists: scope.rulesListItemLists ?? [], items: scope.rulesListItems ?? [] });
  const rulesets = rulesetDescriptors({ accountId, revision,
    accountListIds: scope.accountRulesetListIds ?? [], accountRulesetIds: scope.accountRulesetIds ?? [],
    accountVersionLists: scope.accountRulesetVersionLists ?? [], accountVersions: scope.accountRulesetVersions ?? [],
    accountVersionRuleTags: scope.accountRulesetVersionRuleTags ?? [],
    accountEntrypoints: scope.accountRulesetEntrypoints ?? [],
    accountEntrypointVersionLists: scope.accountRulesetEntrypointVersionLists ?? [],
    accountEntrypointVersions: scope.accountRulesetEntrypointVersions ?? [],
    ...(scope.zone === undefined ? {} : { zoneId: scope.zone.zoneId,
      zoneListIds: scope.zone.rulesetListIds ?? [], zoneRulesetIds: scope.zone.rulesetIds ?? [],
      zoneVersionLists: scope.zone.rulesetVersionLists ?? [], zoneVersions: scope.zone.rulesetVersions ?? [],
      zoneVersionRuleTags: scope.zone.rulesetVersionRuleTags ?? [],
      zoneEntrypoints: scope.zone.rulesetEntrypoints ?? [], zoneEntrypointVersionLists: scope.zone.rulesetEntrypointVersionLists ?? [],
      zoneEntrypointVersions: scope.zone.rulesetEntrypointVersions ?? [] }) });
  const loadBalancing = loadBalancingDescriptors({ accountId, revision,
    poolListIds: scope.loadBalancingPoolListIds ?? [], poolIds: scope.loadBalancingPoolIds ?? [],
    monitorListIds: scope.loadBalancingMonitorListIds ?? [], monitorIds: scope.loadBalancingMonitorIds ?? [] });
  const builds = buildRecordDescriptors({ accountId, revision, workers: scope.workerBuildRecords ?? [] });
  const scriptSettings = scriptSettingsDescriptors({ accountId, revision,
    observabilityScriptNames: scope.workerObservabilityScriptNames ?? [], usageModelScriptNames: scope.workerUsageModelScriptNames ?? [] });
  const workerAccount = workerAccountDescriptors({ accountId, revision,
    settingsReadAllowed: scope.workerAccountSettingsReadAllowed ?? false,
    ...(scope.workerAccountExpectedSubdomain === undefined ? {} : { expectedSubdomain: scope.workerAccountExpectedSubdomain }) });
  const identities = workerIdentityDescriptors({ accountId, revision,
    listWorkers: scope.workerIdentityList ?? [], workers: scope.workerIdentityDetails ?? [] });
  const dispatch = dispatchNamespaceDescriptors({ accountId, revision,
    listNamespaces: scope.dispatchNamespaceList ?? [], namespaces: scope.dispatchNamespaceDetails ?? [] });
  const consumers = queueConsumerDescriptors({ accountId, revision, queues: scope.queueConsumers ?? [],
    configurationConsumers: scope.queueConsumerConfigurations ?? [] });
  const events = eventSubscriptionDescriptors({ accountId, revision, subscriptions: scope.eventSubscriptions ?? [] });
  const stores = secretsStoreMetadataDescriptors({ accountId, revision, stores: scope.secretStores ?? [] });
  const durable = durableObjectMetadataDescriptors({ accountId, revision, namespaces: scope.durableNamespaces ?? [] });
  const pages = pagesMetadataDescriptors({ accountId, revision, projects: scope.pagesProjects ?? [],
    provenanceProjects: scope.pagesProvenanceProjects ?? [],
    pagination: scope.pagesPagination ?? { projects: false, deploymentProjects: [] },
    projectInventoryReadAllowed: scope.pagesProjectInventoryReadAllowed ?? false,
    deploymentInventoryProjects: scope.pagesDeploymentInventoryProjects ?? [] });
  const pagesDomains = pagesDomainDescriptors({ accountId, revision, projects: scope.pagesDomains ?? [] });
  const access = accessApplicationMetadataDescriptors({ accountId, revision, applications: scope.accessApplications ?? [] });
  const accessPolicies = accessPolicyMetadataDescriptors({ accountId, revision, applications: scope.accessPolicies ?? [] });
  const domains = workerDomainMetadataDescriptors({ accountId, revision, domains: scope.workerDomains ?? [] });
  const r2CustomDomains = r2CustomDomainDescriptors({ accountId, revision, buckets: scope.r2CustomDomainBuckets ?? [] });
  const notifications = r2NotificationDescriptors({ accountId, revision, buckets: scope.r2NotificationBuckets ?? [] });
  // Account/revision always come from the common snapshot, never nested scope.
  // With no trusted zone relationship, omit DNS/zone operations altogether.
  const zone = scope.zone === undefined ? undefined : zoneMetadataDescriptors({ accountId, revision,
    zoneId: scope.zone.zoneId, dnsRecordIds: scope.zone.dnsRecordIds });
  const routes = scope.zone === undefined ? undefined : workerRouteMetadataDescriptors({ accountId, revision,
    zoneId: scope.zone.zoneId, routes: scope.zone.workerRoutes ?? [] });
  const tls = scope.zone === undefined ? undefined : hostnameTlsDescriptors({ accountId, revision,
    zoneId: scope.zone.zoneId, settings: scope.zone.hostnameTls ?? [] });
  const plans = scope.zone === undefined ? undefined : zonePlanDescriptors({ accountId, revision,
    zoneId: scope.zone.zoneId, listPlanIds: scope.zone.availablePlanListIds ?? [], planIds: scope.zone.availablePlanIds ?? [] });
  const balancers = scope.zone === undefined ? undefined : zoneLoadBalancerDescriptors({ accountId, revision,
    zoneId: scope.zone.zoneId, listIds: scope.zone.loadBalancerListIds ?? [], balancerIds: scope.zone.loadBalancerIds ?? [] });
  const healthChecks = scope.zone === undefined ? undefined : healthCheckDescriptors({ accountId, revision,
    zoneId: scope.zone.zoneId, listIds: scope.zone.healthCheckListIds ?? [], healthcheckIds: scope.zone.healthCheckIds ?? [] });
  const cacheMetadata = scope.zone === undefined ? undefined : cacheMetadataDescriptors({ accountId, revision,
    zoneId: scope.zone.zoneId, formats: scope.zone.cacheVariantsFormats ?? [],
    ...(scope.zone.cacheReserveClearStatusReadAllowed === undefined ? {} : { clearStatusReadAllowed: scope.zone.cacheReserveClearStatusReadAllowed }) });
  const cacheSettings = scope.zone === undefined ? undefined : cacheSettingsDescriptors({ accountId, revision,
    zoneId: scope.zone.zoneId,
    ...(scope.zone.cacheReserveReadAllowed === undefined ? {} : { reserveReadAllowed: scope.zone.cacheReserveReadAllowed }),
    ...(scope.zone.smartTieredCacheReadAllowed === undefined ? {} : { smartTieredReadAllowed: scope.zone.smartTieredCacheReadAllowed }) });
  const argoSettings = scope.zone === undefined ? undefined : argoSettingsDescriptors({ accountId, revision,
    zoneId: scope.zone.zoneId,
    ...(scope.zone.argoSmartRoutingReadAllowed === undefined ? {} : { smartRoutingReadAllowed: scope.zone.argoSmartRoutingReadAllowed }),
    ...(scope.zone.argoTieredCachingReadAllowed === undefined ? {} : { tieredCachingReadAllowed: scope.zone.argoTieredCachingReadAllowed }) });
  const content = currentContentDescriptor(sourceScope);
  const readContent = currentContentTransport(fetcher);
  const collectPages = pagesCollectionTransport(fetcher);
  return Object.freeze([
    metadata(zoneListDescriptor({ accountId, revision, zoneIds: scope.zoneListIds ?? [] })),
    metadata(accountDetailDescriptor({ accountId, revision, readAllowed: scope.accountDetailReadAllowed ?? false })),
    metadata(accountListDescriptor({ accountId, revision, readAllowed: scope.accountListReadAllowed ?? false })),
    metadata(accountDnsDescriptor({ accountId, revision, readAllowed: scope.accountDnsReadAllowed ?? false })),
    metadata(subscriptions.subscriptionsList), metadata(subscriptions.subscriptionGet),
    metadata(rulesLists.listsList), metadata(rulesLists.listGet), metadata(rulesLists.itemsList), metadata(rulesLists.itemGet),
    metadata(rulesets.accountList), metadata(rulesets.accountGet),
    metadata(rulesets.accountVersionsList), metadata(rulesets.accountVersionGet),
    metadata(rulesets.accountVersionRulesByTag),
    ...(rulesets.zoneVersionRulesByTag === undefined ? [] : [metadata(rulesets.zoneVersionRulesByTag)]),
    metadata(rulesets.accountEntrypointGet), metadata(rulesets.accountEntrypointVersionsList), metadata(rulesets.accountEntrypointVersionGet),
    ...(rulesets.zoneEntrypointGet === undefined || rulesets.zoneEntrypointVersionsList === undefined || rulesets.zoneEntrypointVersionGet === undefined ? [] :
      [metadata(rulesets.zoneEntrypointGet), metadata(rulesets.zoneEntrypointVersionsList), metadata(rulesets.zoneEntrypointVersionGet)]),
    ...(rulesets.zoneVersionsList === undefined || rulesets.zoneVersionGet === undefined ? [] :
      [metadata(rulesets.zoneVersionsList), metadata(rulesets.zoneVersionGet)]),
    ...(rulesets.zoneList === undefined || rulesets.zoneGet === undefined ? [] : [metadata(rulesets.zoneList), metadata(rulesets.zoneGet)]),
    metadata(loadBalancing.poolsList), metadata(loadBalancing.poolGet),
    metadata(loadBalancing.monitorsList), metadata(loadBalancing.monitorGet),
    metadata(workerScheduleDescriptor({ accountId, revision, workers: scope.workerSchedules ?? [] })),
    metadata(scriptSettings.scriptSettingsGet), metadata(scriptSettings.usageModelGet),
    metadata(environmentSettingsDescriptor({ accountId, revision, environments: scope.workerEnvironmentSettings ?? [] })),
    metadata(dispatchSettingsDescriptor({ accountId, revision, scripts: scope.dispatchScriptSettings ?? [],
      bindingScripts: scope.dispatchSettingsBindings ?? [] })),
    metadata(dispatchScriptDescriptor({ accountId, revision, namespaces: scope.dispatchScriptLists ?? [] })),
    metadata(dispatchBindingsDescriptor({ accountId, revision, namespaces: scope.dispatchScriptBindings ?? [] })),
    metadata(dispatchSecretDescriptor({ accountId, revision, namespaces: scope.dispatchScriptSecrets ?? [] })),
    metadata(dispatchSecretListDescriptor({ accountId, revision, namespaces: scope.dispatchScriptSecretLists ?? [] })),
    metadata(workerAccount.accountSettingsGet), metadata(workerAccount.accountSubdomainGet),
    metadata(identities.identitiesList), metadata(identities.identityGet),
    metadata(dispatch.dispatchNamespacesList), metadata(dispatch.dispatchNamespaceGet),
    metadata(workerVersionListDescriptor({ accountId, revision, workers: scope.workerVersionLists ?? [] })),
    metadata(workerSecretDescriptor({ accountId, revision, workers: scope.workerSecrets ?? [] })),
    metadata(workerBuildDescriptor({ accountId, revision, workers: scope.workerBuildConfigurations ?? [] })),
    metadata(deployHookDescriptor({ accountId, revision, workers: scope.workerDeployHooks ?? [] })),
    metadata(buildTriggerDescriptor({ accountId, revision, workers: scope.workerBuildTriggers ?? [] })),
    metadata(builds.buildsList), metadata(builds.buildGet),
    metadata(descriptors.workersList), metadata(descriptors.secretNames),
    metadata(descriptors.hyperdriveList), metadata(descriptors.hyperdriveGet),
    metadata(descriptors.d1List), metadata(descriptors.d1Get),
    metadata(descriptors.r2List), metadata(descriptors.r2Get), metadata(descriptors.r2LocksGet),
    metadata(r2CorsDescriptor({ accountId, revision, buckets: scope.r2CorsBuckets ?? [] })),
    metadata(r2LifecycleDescriptor({ accountId, revision, buckets: scope.r2LifecycleBuckets ?? [] })),
    metadata(r2ManagedDomainDescriptor({ accountId, revision, buckets: scope.r2ManagedDomainBuckets ?? [] })),
    metadata(r2CustomDomains.customDomainsList), metadata(r2CustomDomains.customDomainGet),
    metadata(notifications.notificationsList), metadata(notifications.notificationGet),
    metadata(descriptors.deploymentsList), metadata(descriptors.deploymentGet),
    metadata(descriptors.versionsList), metadata(descriptors.versionGet),
    metadata(descriptors.kvNamespacesList), metadata(descriptors.kvNamespaceGet),
    metadata(descriptors.queuesList), metadata(descriptors.queueGet),
    metadata(consumers.consumersList), metadata(consumers.consumerGet),
    metadata(events.eventSubscriptionsList), metadata(events.eventSubscriptionGet),
    metadata(descriptors.workerSubdomainGet), metadata(descriptors.workerSettingsGet),
    metadata(versionAssetDescriptor({ accountId, revision, workers: scope.workerAssetVersions ?? [],
      packageVersions: scope.workerPackageVersions ?? [] })),
    metadata(stores.storesList), metadata(stores.storeGet), metadata(stores.secretsList), metadata(stores.secretGet),
    metadata(durable.durableNamespacesList), metadata(durable.durableObjectsList),
    bind(pages.pagesProjectsList, (args, credential, signal) => collectPages(pages.pagesProjectsList, args, credential, signal)),
    metadata(pages.pagesProjectGet),
    bind(pages.pagesDeploymentsList, (args, credential, signal) => collectPages(pages.pagesDeploymentsList, args, credential, signal)),
    metadata(pages.pagesDeploymentGet),
    metadata(pagesDomains.domainsList), metadata(pagesDomains.domainGet),
    metadata(access.accessApplicationsList), metadata(access.accessApplicationGet),
    metadata(accessPolicies.accessPoliciesList), metadata(accessPolicies.accessPolicyGet),
    metadata(domains.workerDomainsList), metadata(domains.workerDomainGet),
    ...(zone === undefined ? [] : [metadata(zone.zoneGet), metadata(zone.dnsList), metadata(zone.dnsGet)]),
    ...(routes === undefined ? [] : [metadata(routes.workerRoutesList), metadata(routes.workerRouteGet)]),
    ...(tls === undefined ? [] : [metadata(tls.settingsList), metadata(tls.settingGet)]),
    ...(plans === undefined ? [] : [metadata(plans.plansList), metadata(plans.planGet)]),
    ...(balancers === undefined ? [] : [metadata(balancers.balancersList), metadata(balancers.balancerGet)]),
    ...(healthChecks === undefined ? [] : [metadata(healthChecks.checksList), metadata(healthChecks.checkGet)]),
    ...(cacheMetadata === undefined ? [] : [metadata(cacheMetadata.variantsGet), metadata(cacheMetadata.reserveClearStatusGet)]),
    ...(cacheSettings === undefined ? [] : [metadata(cacheSettings.reserveGet), metadata(cacheSettings.smartTieredGet)]),
    ...(argoSettings === undefined ? [] : [metadata(argoSettings.smartRoutingGet), metadata(argoSettings.tieredCachingGet)]),
    ...(scope.zone === undefined ? [] : [metadata(zoneTlsDescriptor({ accountId, revision,
      zoneId: scope.zone.zoneId, settingIds: scope.zone.tlsSettingIds ?? [] }))]),
    ...(scope.zone === undefined ? [] : [metadata(zoneHoldDescriptor({ accountId, revision,
      zoneId: scope.zone.zoneId, readAllowed: scope.zone.zoneHoldReadAllowed ?? false }))]),
    ...(scope.zone === undefined ? [] : [metadata(regionalCacheDescriptor({ accountId, revision,
      zoneId: scope.zone.zoneId, readAllowed: scope.zone.regionalCacheReadAllowed ?? false }))]),
    ...(scope.zone === undefined ? [] : [metadata(dnsSettingsDescriptor({ accountId, revision,
      zoneId: scope.zone.zoneId, readAllowed: scope.zone.dnsSettingsReadAllowed ?? false }))]),
    ...(scope.zone === undefined ? [] : [metadata(dnssecDescriptor({ accountId, revision,
      zoneId: scope.zone.zoneId, readAllowed: scope.zone.dnssecReadAllowed ?? false }))]),
    ...(scope.zone === undefined ? [] : [metadata(universalSslDescriptor({ accountId, revision,
      zoneId: scope.zone.zoneId, readAllowed: scope.zone.universalSslReadAllowed ?? false }))]),
    ...(scope.zone === undefined ? [] : [metadata(automaticSslDescriptor({ accountId, revision,
      zoneId: scope.zone.zoneId, readAllowed: scope.zone.automaticSslReadAllowed ?? false }))]),
    ...(scope.zone === undefined ? [] : [metadata(originPullsDescriptor({ accountId, revision,
      zoneId: scope.zone.zoneId, readAllowed: scope.zone.originPullsReadAllowed ?? false }))]),
    ...(scope.zone === undefined ? [] : [metadata(hostnameOriginPullsDescriptor({ accountId, revision,
      zoneId: scope.zone.zoneId, hostnames: scope.zone.originPullHostnames ?? [] }))]),
    ...(scope.zone === undefined ? [] : [metadata(hostnameOriginPullAssociationsDescriptor({ accountId, revision,
      zoneId: scope.zone.zoneId, hostnames: scope.zone.originPullAssociationHostnames ?? [] }))]),
    // Source acquisition needs exact native authority, even for digest-only output.
    bind(content, (args, credential, signal) => readContent(content, args, credential, signal)),
  ]);
}
