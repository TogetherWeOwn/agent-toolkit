import { closed, integer, requireThat, text } from "../../../packages/core/src/index.js";

const accountId = text(32, /^[a-f0-9]{32}$/);
const resourceId = text(32, /^[a-f0-9]{32}$/);
const scriptName = text(128, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const secretName = text(128, /^[A-Za-z_][A-Za-z0-9_]*$/);
const empty = closed({});
const page = closed({ page: integer(1, 1000), perPage: integer(1, 100) });
const script = closed({ scriptName });
const hyperdrive = closed({ hyperdriveId: resourceId });
const databaseId = text(36, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
const bucketName = text(64, /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/);
const database = closed({ databaseId });
const databasePage = closed({ page: integer(1, 1000), perPage: integer(10, 100) });
const bucket = closed({ bucketName });
const bucketPage = closed({ perPage: integer(1, 100) });
const deploymentId = databaseId;
const deployment = closed({ scriptName, deploymentId });
const deploymentPage = closed({ scriptName, page: integer(1, 1000), perPage: integer(1, 100) });
const versionId = databaseId;
const workerVersion = closed({ scriptName, versionId });
const versionPage = closed({ scriptName, page: integer(1, 1000), perPage: integer(1, 100) });
const maxResponseBytes = 131072;
const maxOutputBytes = 32768;
const maxRows = 100;

export interface MetadataScope {
  accountId: string;
  revision: string;
  scriptNames: readonly string[];
  hyperdriveIds: readonly string[];
  databaseIds?: readonly string[];
  defaultBucketNames?: readonly string[];
  workerDeployments?: readonly { scriptName: string; deploymentIds: readonly string[] }[];
  workerVersions?: readonly { scriptName: string; versionIds: readonly string[] }[];
}
export interface MetadataRequest {
  readonly method: "GET";
  readonly path: string;
  readonly maxResponseBytes: number;
  readonly timeoutMs: number;
  readonly maxRequests: 1;
  readonly redirects: "deny";
}
export interface PreparedMetadata<A> {
  readonly arguments: A;
  readonly resource: { readonly id: string; readonly revision: string };
  readonly request: MetadataRequest;
}
export interface MetadataDescriptor<A, O> {
  readonly name: string;
  readonly version: "1";
  readonly tier: "read";
  readonly providerOperationId: string;
  prepare(raw: unknown): PreparedMetadata<A>;
  project(rawJson: string, prepared: PreparedMetadata<A>): O;
}
type Row = Record<string, unknown>;
interface HyperdriveMetadata { id: string; cachingDisabled: boolean }
interface SecretMetadata { name: string; type: "secret_text" | "secret_key" }
interface PartialList<T> { items: T[]; complete: false }

function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}
function envelope(raw: string): Row {
  requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= maxResponseBytes, "cap");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
  const body = object(value);
  requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
  return body;
}
function rows(value: unknown): Row[] {
  requireThat(Array.isArray(value) && value.length <= maxRows, "cap");
  return value.map(object);
}
function bounded<T>(output: T): T {
  requireThat(Buffer.byteLength(JSON.stringify(output), "utf8") <= maxOutputBytes, "cap");
  return output;
}
function providerText(value: unknown, schema: { parse(value: unknown): string }): string {
  try { return schema.parse(value); } catch { requireThat(false, "upstream"); }
}

// These descriptors have no transport, credentials, native authority or registration.
// The reviewed common broker must authorize/revalidate before executing any request.
export function metadataDescriptors(scope: MetadataScope) {
  const account = accountId.parse(scope.accountId);
  const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$/).parse(scope.revision);
  requireThat(Array.isArray(scope.scriptNames) && scope.scriptNames.length <= 100 && Array.isArray(scope.hyperdriveIds) && scope.hyperdriveIds.length <= 100, "cap");
  const scripts = new Set(scope.scriptNames.map(value => scriptName.parse(value)));
  const hyperdrives = new Set(scope.hyperdriveIds.map(value => resourceId.parse(value)));
  const databaseIds = scope.databaseIds ?? [];
  const defaultBucketNames = scope.defaultBucketNames ?? [];
  requireThat(Array.isArray(databaseIds) && databaseIds.length <= 100 && Array.isArray(defaultBucketNames) && defaultBucketNames.length <= 100, "cap");
  const databases = new Set(databaseIds.map(value => databaseId.parse(value)));
  const buckets = new Set(defaultBucketNames.map(value => bucketName.parse(value)));
  const workerDeployments = scope.workerDeployments ?? [];
  requireThat(Array.isArray(workerDeployments) && workerDeployments.length <= maxRows, "cap");
  const deployments = new Map<string, Set<string>>();
  for (const entry of workerDeployments) {
    const name = scriptName.parse(entry.scriptName);
    requireThat(scripts.has(name), "scope");
    requireThat(!deployments.has(name), "schema");
    requireThat(Array.isArray(entry.deploymentIds) && entry.deploymentIds.length <= maxRows, "cap");
    deployments.set(name, new Set<string>(entry.deploymentIds.map((value: unknown) => deploymentId.parse(value))));
  }
  const workerVersions = scope.workerVersions ?? [];
  requireThat(Array.isArray(workerVersions) && workerVersions.length <= maxRows, "cap");
  const versions = new Map<string, Set<string>>();
  for (const entry of workerVersions) {
    const name = scriptName.parse(entry.scriptName);
    requireThat(scripts.has(name), "scope");
    requireThat(!versions.has(name), "schema");
    requireThat(Array.isArray(entry.versionIds) && entry.versionIds.length <= maxRows, "cap");
    versions.set(name, new Set<string>(entry.versionIds.map((value: unknown) => versionId.parse(value))));
  }
  const root = `/accounts/${account}`;
  function prepared<A>(args: A, resource: string, path: string): PreparedMetadata<A> {
    return Object.freeze({
      arguments: args,
      resource: Object.freeze({ id: `cloudflare:account:${account}:${resource}`, revision }),
      request: Object.freeze({ method: "GET", path, maxResponseBytes, timeoutMs: 10000, maxRequests: 1, redirects: "deny" }),
    });
  }
  function scriptScope(name: string) { requireThat(scripts.has(name), "scope"); }
  function hyperdriveScope(id: string) { requireThat(hyperdrives.has(id), "scope"); }
  function hyperdriveMetadata(row: Row): HyperdriveMetadata {
    const id = providerText(row.id, resourceId);
    hyperdriveScope(id);
    const caching = object(row.caching);
    requireThat(typeof caching.disabled === "boolean", "upstream");
    return { id, cachingDisabled: caching.disabled };
  }

  const workersList: MetadataDescriptor<ReturnType<typeof empty.parse>, PartialList<{ id: string }>> = Object.freeze({
    name: "cloudflare.workers.list", version: "1", tier: "read", providerOperationId: "worker-script-list-workers",
    prepare(raw: unknown) { return prepared(empty.parse(raw), "workers", `${root}/workers/scripts`); },
    project(raw: string) {
      const items = rows(envelope(raw).result).filter(row => typeof row.id === "string" && scripts.has(row.id)).map(row => ({ id: providerText(row.id, scriptName) }));
      return bounded({ items, complete: false as const });
    },
  });
  const secretNames: MetadataDescriptor<ReturnType<typeof script.parse>, PartialList<SecretMetadata>> = Object.freeze({
    name: "cloudflare.workers.secret_names", version: "1", tier: "read", providerOperationId: "worker-list-script-secrets",
    prepare(raw: unknown) {
      const args = script.parse(raw);
      scriptScope(args.scriptName);
      return prepared(args, `worker:${args.scriptName}`, `${root}/workers/scripts/${encodeURIComponent(args.scriptName)}/secrets`);
    },
    project(raw: string, input: PreparedMetadata<ReturnType<typeof script.parse>>) {
      const args = script.parse(input.arguments);
      scriptScope(args.scriptName);
      const items = rows(envelope(raw).result).map(row => {
        const name = providerText(row.name, secretName);
        requireThat(row.type === "secret_text" || row.type === "secret_key", "upstream");
        return { name, type: row.type } as SecretMetadata;
      });
      return bounded({ items, complete: false as const });
    },
  });
  const hyperdriveList: MetadataDescriptor<ReturnType<typeof page.parse>, PartialList<HyperdriveMetadata>> = Object.freeze({
    name: "cloudflare.hyperdrive.list", version: "1", tier: "read", providerOperationId: "list-hyperdrive",
    prepare(raw: unknown) {
      const args = page.parse(raw);
      return prepared(args, "hyperdrive", `${root}/hyperdrive/configs?page=${args.page}&per_page=${args.perPage}`);
    },
    project(raw: string, input: PreparedMetadata<ReturnType<typeof page.parse>>) {
      const args = page.parse(input.arguments);
      const result = rows(envelope(raw).result);
      requireThat(result.length <= args.perPage, "cap");
      const items = result.filter(row => typeof row.id === "string" && hyperdrives.has(row.id)).map(hyperdriveMetadata);
      return bounded({ items, complete: false as const });
    },
  });
  const hyperdriveGet: MetadataDescriptor<ReturnType<typeof hyperdrive.parse>, HyperdriveMetadata> = Object.freeze({
    name: "cloudflare.hyperdrive.get", version: "1", tier: "read", providerOperationId: "get-hyperdrive",
    prepare(raw: unknown) {
      const args = hyperdrive.parse(raw);
      hyperdriveScope(args.hyperdriveId);
      return prepared(args, `hyperdrive:${args.hyperdriveId}`, `${root}/hyperdrive/configs/${args.hyperdriveId}`);
    },
    project(raw: string, input: PreparedMetadata<ReturnType<typeof hyperdrive.parse>>) {
      const args = hyperdrive.parse(input.arguments);
      hyperdriveScope(args.hyperdriveId);
      const row = object(envelope(raw).result);
      requireThat(row.id === args.hyperdriveId, "scope");
      return bounded(hyperdriveMetadata(row));
    },
  });
  function databaseScope(id: string) { requireThat(databases.has(id), "scope"); }
  function bucketScope(name: string) { requireThat(buckets.has(name), "scope"); }
  function bucketMetadata(row: Row): { name: string } {
    const name = providerText(row.name, bucketName);
    bucketScope(name);
    requireThat(row.jurisdiction === undefined || row.jurisdiction === "default", "scope");
    return { name };
  }
  const d1List: MetadataDescriptor<ReturnType<typeof databasePage.parse>, PartialList<{ id: string }>> = Object.freeze({
    name: "cloudflare.d1.list", version: "1", tier: "read", providerOperationId: "d1-list-databases",
    prepare(raw: unknown) {
      const args = databasePage.parse(raw);
      return prepared(args, "d1", `${root}/d1/database?page=${args.page}&per_page=${args.perPage}`);
    },
    project(raw: string, input: PreparedMetadata<ReturnType<typeof databasePage.parse>>) {
      const args = databasePage.parse(input.arguments);
      const result = rows(envelope(raw).result);
      requireThat(result.length <= args.perPage, "cap");
      const items = result.filter(row => typeof row.uuid === "string" && databases.has(row.uuid)).map(row => ({ id: providerText(row.uuid, databaseId) }));
      return bounded({ items, complete: false as const });
    },
  });
  const d1Get: MetadataDescriptor<ReturnType<typeof database.parse>, { id: string }> = Object.freeze({
    name: "cloudflare.d1.get", version: "1", tier: "read", providerOperationId: "d1-get-database",
    prepare(raw: unknown) {
      const args = database.parse(raw);
      databaseScope(args.databaseId);
      return prepared(args, `d1:${args.databaseId}`, `${root}/d1/database/${args.databaseId}?fields=uuid`);
    },
    project(raw: string, input: PreparedMetadata<ReturnType<typeof database.parse>>) {
      const args = database.parse(input.arguments);
      databaseScope(args.databaseId);
      const row = object(envelope(raw).result);
      requireThat(row.uuid === args.databaseId, "scope");
      return bounded({ id: providerText(row.uuid, databaseId) });
    },
  });
  const r2List: MetadataDescriptor<ReturnType<typeof bucketPage.parse>, PartialList<{ name: string }>> = Object.freeze({
    name: "cloudflare.r2.list", version: "1", tier: "read", providerOperationId: "r2-list-buckets",
    prepare(raw: unknown) {
      const args = bucketPage.parse(raw);
      return prepared(args, "r2:jurisdiction:default", `${root}/r2/buckets?per_page=${args.perPage}`);
    },
    project(raw: string, input: PreparedMetadata<ReturnType<typeof bucketPage.parse>>) {
      const args = bucketPage.parse(input.arguments);
      const result = rows(object(envelope(raw).result).buckets);
      requireThat(result.length <= args.perPage, "cap");
      const items = result.filter(row => typeof row.name === "string" && buckets.has(row.name)).map(bucketMetadata);
      return bounded({ items, complete: false as const });
    },
  });
  const r2Get: MetadataDescriptor<ReturnType<typeof bucket.parse>, { name: string }> = Object.freeze({
    name: "cloudflare.r2.get", version: "1", tier: "read", providerOperationId: "r2-get-bucket",
    prepare(raw: unknown) {
      const args = bucket.parse(raw);
      bucketScope(args.bucketName);
      return prepared(args, `r2:jurisdiction:default:bucket:${args.bucketName}`, `${root}/r2/buckets/${args.bucketName}`);
    },
    project(raw: string, input: PreparedMetadata<ReturnType<typeof bucket.parse>>) {
      const args = bucket.parse(input.arguments);
      bucketScope(args.bucketName);
      const row = object(envelope(raw).result);
      requireThat(row.name === args.bucketName, "scope");
      return bounded(bucketMetadata(row));
    },
  });
  function deploymentScope(name: string, id: string) {
    scriptScope(name);
    requireThat(deployments.get(name)?.has(id) === true, "scope");
  }
  const deploymentsList: MetadataDescriptor<ReturnType<typeof deploymentPage.parse>, PartialList<{ id: string }>> = Object.freeze({
    name: "cloudflare.workers.deployments.list", version: "1", tier: "read", providerOperationId: "worker-deployments-list-deployments",
    prepare(raw: unknown) {
      const args = deploymentPage.parse(raw);
      scriptScope(args.scriptName);
      return prepared(args, `worker:${args.scriptName}:deployments`, `${root}/workers/scripts/${encodeURIComponent(args.scriptName)}/deployments?page=${args.page}&per_page=${args.perPage}`);
    },
    project(raw: string, input: PreparedMetadata<ReturnType<typeof deploymentPage.parse>>) {
      const args = deploymentPage.parse(input.arguments);
      scriptScope(args.scriptName);
      const result = rows(object(envelope(raw).result).deployments);
      requireThat(result.length <= args.perPage, "cap");
      const items = result.filter(row => typeof row.id === "string" && deployments.get(args.scriptName)?.has(row.id)).map(row => ({ id: providerText(row.id, deploymentId) }));
      return bounded({ items, complete: false as const });
    },
  });
  const deploymentGet: MetadataDescriptor<ReturnType<typeof deployment.parse>, { id: string }> = Object.freeze({
    name: "cloudflare.workers.deployments.get", version: "1", tier: "read", providerOperationId: "worker-deployments-get-deployment",
    prepare(raw: unknown) {
      const args = deployment.parse(raw);
      deploymentScope(args.scriptName, args.deploymentId);
      return prepared(args, `worker:${args.scriptName}:deployment:${args.deploymentId}`, `${root}/workers/scripts/${encodeURIComponent(args.scriptName)}/deployments/${args.deploymentId}`);
    },
    project(raw: string, input: PreparedMetadata<ReturnType<typeof deployment.parse>>) {
      const args = deployment.parse(input.arguments);
      deploymentScope(args.scriptName, args.deploymentId);
      const row = object(envelope(raw).result);
      requireThat(row.id === args.deploymentId, "scope");
      return bounded({ id: providerText(row.id, deploymentId) });
    },
  });
  function versionScope(name: string, id: string) {
    scriptScope(name);
    requireThat(versions.get(name)?.has(id) === true, "scope");
  }
  const versionsList: MetadataDescriptor<ReturnType<typeof versionPage.parse>, PartialList<{ id: string }>> = Object.freeze({
    name: "cloudflare.workers.versions.list", version: "1", tier: "read", providerOperationId: "worker-versions-list-versions",
    prepare(raw: unknown) {
      const args = versionPage.parse(raw);
      scriptScope(args.scriptName);
      return prepared(args, `worker:${args.scriptName}:versions`, `${root}/workers/scripts/${encodeURIComponent(args.scriptName)}/versions?deployable=false&page=${args.page}&per_page=${args.perPage}`);
    },
    project(raw: string, input: PreparedMetadata<ReturnType<typeof versionPage.parse>>) {
      const args = versionPage.parse(input.arguments);
      scriptScope(args.scriptName);
      const result = rows(object(envelope(raw).result).items);
      requireThat(result.length <= args.perPage, "cap");
      const items = result.filter(row => typeof row.id === "string" && versions.get(args.scriptName)?.has(row.id)).map(row => ({ id: providerText(row.id, versionId) }));
      return bounded({ items, complete: false as const });
    },
  });
  const versionGet: MetadataDescriptor<ReturnType<typeof workerVersion.parse>, { id: string }> = Object.freeze({
    name: "cloudflare.workers.versions.get", version: "1", tier: "read", providerOperationId: "worker-versions-get-version-detail",
    prepare(raw: unknown) {
      const args = workerVersion.parse(raw);
      versionScope(args.scriptName, args.versionId);
      return prepared(args, `worker:${args.scriptName}:version:${args.versionId}`, `${root}/workers/scripts/${encodeURIComponent(args.scriptName)}/versions/${args.versionId}`);
    },
    project(raw: string, input: PreparedMetadata<ReturnType<typeof workerVersion.parse>>) {
      const args = workerVersion.parse(input.arguments);
      versionScope(args.scriptName, args.versionId);
      const row = object(envelope(raw).result);
      requireThat(row.id === args.versionId, "scope");
      return bounded({ id: providerText(row.id, versionId) });
    },
  });
  return Object.freeze({ workersList, secretNames, hyperdriveList, hyperdriveGet, d1List, d1Get, r2List, r2Get, deploymentsList, deploymentGet, versionsList, versionGet });
}

export interface ZoneMetadataScope {
  accountId: string;
  zoneId: string;
  revision: string;
  dnsRecordIds: readonly string[];
}
const dnsRecord = closed({ dnsRecordId: resourceId });

// Account/zone association must be established by the core before construction;
// DNS responses without zone metadata cannot establish their own provenance.
export function zoneMetadataDescriptors(scope: ZoneMetadataScope) {
  const account = accountId.parse(scope.accountId);
  const zone = resourceId.parse(scope.zoneId);
  const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$/).parse(scope.revision);
  requireThat(Array.isArray(scope.dnsRecordIds) && scope.dnsRecordIds.length <= maxRows, "cap");
  const records = new Set(scope.dnsRecordIds.map(value => resourceId.parse(value)));
  const root = `/zones/${zone}`;
  function prepared<A>(args: A, resource: string, path: string): PreparedMetadata<A> {
    return Object.freeze({
      arguments: args,
      resource: Object.freeze({ id: `cloudflare:account:${account}:zone:${zone}${resource}`, revision }),
      request: Object.freeze({ method: "GET", path, maxResponseBytes, timeoutMs: 10000, maxRequests: 1, redirects: "deny" }),
    });
  }
  function recordScope(id: string) { requireThat(records.has(id), "scope"); }
  function recordMetadata(row: Row): { id: string } {
    const id = providerText(row.id, resourceId);
    recordScope(id);
    requireThat(row.zone_id === undefined || row.zone_id === zone, "scope");
    return { id };
  }
  const zoneGet: MetadataDescriptor<ReturnType<typeof empty.parse>, { id: string }> = Object.freeze({
    name: "cloudflare.zones.get", version: "1", tier: "read", providerOperationId: "zones-0-get",
    prepare(raw: unknown) { return prepared(empty.parse(raw), "", root); },
    project(raw: string) {
      const row = object(envelope(raw).result);
      requireThat(row.id === zone && object(row.account).id === account, "scope");
      return bounded({ id: zone });
    },
  });
  const dnsList: MetadataDescriptor<ReturnType<typeof page.parse>, PartialList<{ id: string }>> = Object.freeze({
    name: "cloudflare.dns.list", version: "1", tier: "read", providerOperationId: "dns-records-for-a-zone-list-dns-records",
    prepare(raw: unknown) {
      const args = page.parse(raw);
      return prepared(args, ":dns", `${root}/dns_records?page=${args.page}&per_page=${args.perPage}`);
    },
    project(raw: string, input: PreparedMetadata<ReturnType<typeof page.parse>>) {
      const args = page.parse(input.arguments);
      const result = rows(envelope(raw).result);
      requireThat(result.length <= args.perPage, "cap");
      const items = result.filter(row => typeof row.id === "string" && records.has(row.id)).map(recordMetadata);
      return bounded({ items, complete: false as const });
    },
  });
  const dnsGet: MetadataDescriptor<ReturnType<typeof dnsRecord.parse>, { id: string }> = Object.freeze({
    name: "cloudflare.dns.get", version: "1", tier: "read", providerOperationId: "dns-records-for-a-zone-dns-record-details",
    prepare(raw: unknown) {
      const args = dnsRecord.parse(raw);
      recordScope(args.dnsRecordId);
      return prepared(args, `:dns:${args.dnsRecordId}`, `${root}/dns_records/${args.dnsRecordId}`);
    },
    project(raw: string, input: PreparedMetadata<ReturnType<typeof dnsRecord.parse>>) {
      const args = dnsRecord.parse(input.arguments);
      recordScope(args.dnsRecordId);
      const row = object(envelope(raw).result);
      requireThat(row.id === args.dnsRecordId, "scope");
      return bounded(recordMetadata(row));
    },
  });
  return Object.freeze({ zoneGet, dnsList, dnsGet });
}
