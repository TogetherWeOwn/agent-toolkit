import { jsonData, requireThat } from "../../../packages/core/src/index.js";
import { canonicalHash, type Json, type Prepared, type ProviderOperation, type Tier } from "../../../packages/core/src/provider/index.js";
import { currentContentDescriptor, type CurrentContentScope } from "./current-content.js";
import { subscriptionDescriptors, type SubscriptionScope } from "./subscriptions.js";
import { workerScheduleDescriptor, type WorkerScheduleScope } from "./worker-schedules.js";
import { workerBuildDescriptor, type WorkerBuildScope } from "./worker-builds.js";
import { buildTriggerDescriptor, type BuildTriggerScope } from "./build-triggers.js";
import { buildRecordDescriptors, type BuildRecordScope } from "./build-records.js";
import { queueConsumerDescriptors, type QueueConsumerScope } from "./queue-consumers.js";
import { pagesDomainDescriptors, type PagesDomainScope } from "./pages-domains.js";
import { hostnameTlsDescriptors, type HostnameTlsScope } from "./hostname-tls.js";
import { zoneTlsDescriptor, type ZoneTlsScope } from "./zone-tls.js";
import { dnssecDescriptor, type DnssecScope } from "./dnssec.js";
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
import { currentContentTransport, metadataTransport } from "./metadata-transport.js";

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
  subscriptions?: SubscriptionScope["subscriptions"];
  workerSchedules?: WorkerScheduleScope["workers"];
  workerBuildConfigurations?: WorkerBuildScope["workers"];
  workerBuildTriggers?: BuildTriggerScope["workers"];
  workerBuildRecords?: BuildRecordScope["workers"];
  queueConsumers?: QueueConsumerScope["queues"];
  eventSubscriptions?: EventSubscriptionScope["subscriptions"];
  secretStores?: SecretsStoreMetadataScope["stores"];
  durableNamespaces?: DurableObjectMetadataScope["namespaces"];
  pagesProjects?: PagesMetadataScope["projects"];
  pagesProvenanceProjects?: PagesMetadataScope["provenanceProjects"];
  pagesPagination?: PagesMetadataScope["pagination"];
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
  const builds = buildRecordDescriptors({ accountId, revision, workers: scope.workerBuildRecords ?? [] });
  const consumers = queueConsumerDescriptors({ accountId, revision, queues: scope.queueConsumers ?? [] });
  const events = eventSubscriptionDescriptors({ accountId, revision, subscriptions: scope.eventSubscriptions ?? [] });
  const stores = secretsStoreMetadataDescriptors({ accountId, revision, stores: scope.secretStores ?? [] });
  const durable = durableObjectMetadataDescriptors({ accountId, revision, namespaces: scope.durableNamespaces ?? [] });
  const pages = pagesMetadataDescriptors({ accountId, revision, projects: scope.pagesProjects ?? [],
    provenanceProjects: scope.pagesProvenanceProjects ?? [],
    pagination: scope.pagesPagination ?? { projects: false, deploymentProjects: [] } });
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
  const content = currentContentDescriptor(sourceScope);
  const readContent = currentContentTransport(fetcher);
  return Object.freeze([
    metadata(subscriptions.subscriptionsList), metadata(subscriptions.subscriptionGet),
    metadata(workerScheduleDescriptor({ accountId, revision, workers: scope.workerSchedules ?? [] })),
    metadata(workerBuildDescriptor({ accountId, revision, workers: scope.workerBuildConfigurations ?? [] })),
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
    metadata(pages.pagesProjectsList), metadata(pages.pagesProjectGet),
    metadata(pages.pagesDeploymentsList), metadata(pages.pagesDeploymentGet),
    metadata(pagesDomains.domainsList), metadata(pagesDomains.domainGet),
    metadata(access.accessApplicationsList), metadata(access.accessApplicationGet),
    metadata(accessPolicies.accessPoliciesList), metadata(accessPolicies.accessPolicyGet),
    metadata(domains.workerDomainsList), metadata(domains.workerDomainGet),
    ...(zone === undefined ? [] : [metadata(zone.zoneGet), metadata(zone.dnsList), metadata(zone.dnsGet)]),
    ...(routes === undefined ? [] : [metadata(routes.workerRoutesList), metadata(routes.workerRouteGet)]),
    ...(tls === undefined ? [] : [metadata(tls.settingsList), metadata(tls.settingGet)]),
    ...(scope.zone === undefined ? [] : [metadata(zoneTlsDescriptor({ accountId, revision,
      zoneId: scope.zone.zoneId, settingIds: scope.zone.tlsSettingIds ?? [] }))]),
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
