import { closed, requireThat, text } from "../../../packages/core/src/index.js";

const identifier = text(32, /^[a-f0-9]{32}$/);
const scriptName = text(128, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const databaseId = text(36, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
const bucketName = text(64, /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/);
const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const worker = closed({ scriptName });
const hyperdrive = closed({ hyperdriveId: identifier });
const database = closed({ databaseId });
const bucket = closed({ bucketName });
const record = closed({ dnsRecordId: identifier });

type SecurityImpact = "weakens-security" | "does-not-weaken-security";
type AuthorityRoute = "release-manager" | "owner-security";
export interface DeletionTarget {
  id: string;
  revision: string;
  securityImpact: SecurityImpact;
}
export interface DeletionScope {
  accountId: string;
  zoneId: string;
  workerScripts?: readonly DeletionTarget[];
  hyperdrives?: readonly DeletionTarget[];
  databases?: readonly DeletionTarget[];
  defaultBuckets?: readonly DeletionTarget[];
  dnsRecords?: readonly DeletionTarget[];
}
export interface PreparedDeletion<A> {
  readonly arguments: A;
  readonly resource: { readonly id: string; readonly revision: string };
  readonly request: {
    readonly method: "DELETE";
    readonly path: string;
    readonly maxResponseBytes: 131072;
    readonly timeoutMs: 10000;
    readonly maxRequests: 1;
    readonly redirects: "deny";
    readonly retries: "never";
  };
  readonly plan: {
    readonly kind: "validated-local-plan";
    readonly providerDryRun: false;
    readonly action: "delete";
    readonly resource: { readonly id: string; readonly revision: string };
    readonly securityImpact: SecurityImpact;
    readonly effects: readonly string[];
    readonly requiredAuthorities: readonly AuthorityRoute[];
    readonly remoteConditionalWrite: "not-established";
    readonly executionPrerequisite: "reviewed-native-authority-and-provider-preconditions";
  };
}
export interface DeletionPlanDescriptor<A> {
  readonly name: string;
  readonly version: "1";
  readonly tier: "reserved";
  readonly providerOperationId: string;
  prepare(raw: unknown): PreparedDeletion<A>;
}

function targets(input: readonly DeletionTarget[] | undefined, schema: { parse(value: unknown): string }) {
  const entries = input ?? [];
  requireThat(Array.isArray(entries) && entries.length <= 100, "cap");
  const result = new Map<string, Readonly<DeletionTarget>>();
  for (const entry of entries) {
    requireThat(entry !== null && typeof entry === "object", "schema");
    const id = schema.parse(entry.id);
    const resourceRevision = revision.parse(entry.revision);
    requireThat(entry.securityImpact === "weakens-security" || entry.securityImpact === "does-not-weaken-security", "schema");
    requireThat(!result.has(id), "schema");
    result.set(id, Object.freeze({ id, revision: resourceRevision, securityImpact: entry.securityImpact }));
  }
  return result;
}

// Local planning only: no credentials, transport, authority verifier or executor.
// Core must bind/revalidate trusted impact, resource revision and exact plan before execution.
export function deletionPlanDescriptors(scope: DeletionScope) {
  const account = identifier.parse(scope.accountId);
  const zone = identifier.parse(scope.zoneId);
  const workers = targets(scope.workerScripts, scriptName);
  const hyperdrives = targets(scope.hyperdrives, identifier);
  const databases = targets(scope.databases, databaseId);
  const buckets = targets(scope.defaultBuckets, bucketName);
  const records = targets(scope.dnsRecords, identifier);
  const root = `/accounts/${account}`;

  function prepared<A>(args: A, id: string, allowed: Map<string, Readonly<DeletionTarget>>, resourceId: string, path: string, effects: readonly string[]): PreparedDeletion<A> {
    const target = allowed.get(id);
    requireThat(target !== undefined, "scope");
    const resource = Object.freeze({ id: resourceId, revision: target.revision });
    const requiredAuthorities: AuthorityRoute[] = ["release-manager"];
    if (target.securityImpact === "weakens-security") requiredAuthorities.push("owner-security");
    return Object.freeze({
      arguments: args,
      resource,
      request: Object.freeze({ method: "DELETE", path, maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1, redirects: "deny", retries: "never" }),
      plan: Object.freeze({
        kind: "validated-local-plan", providerDryRun: false, action: "delete", resource,
        securityImpact: target.securityImpact, effects: Object.freeze([...effects]), requiredAuthorities: Object.freeze(requiredAuthorities),
        remoteConditionalWrite: "not-established", executionPrerequisite: "reviewed-native-authority-and-provider-preconditions",
      }),
    });
  }

  const workerDelete: DeletionPlanDescriptor<ReturnType<typeof worker.parse>> = Object.freeze({
    name: "cloudflare.workers.delete", version: "1", tier: "reserved", providerOperationId: "worker-script-delete-worker",
    prepare(raw: unknown) {
      const args = worker.parse(raw);
      return prepared(args, args.scriptName, workers, `cloudflare:account:${account}:worker:${args.scriptName}`, `${root}/workers/scripts/${encodeURIComponent(args.scriptName)}?force=false`, ["worker-removed", "durable-object-namespaces-may-be-deleted", "dependent-services-may-fail"]);
    },
  });
  const hyperdriveDelete: DeletionPlanDescriptor<ReturnType<typeof hyperdrive.parse>> = Object.freeze({
    name: "cloudflare.hyperdrive.delete", version: "1", tier: "reserved", providerOperationId: "delete-hyperdrive",
    prepare(raw: unknown) {
      const args = hyperdrive.parse(raw);
      return prepared(args, args.hyperdriveId, hyperdrives, `cloudflare:account:${account}:hyperdrive:${args.hyperdriveId}`, `${root}/hyperdrive/configs/${args.hyperdriveId}`, ["hyperdrive-configuration-removed", "dependent-services-may-fail"]);
    },
  });
  const d1Delete: DeletionPlanDescriptor<ReturnType<typeof database.parse>> = Object.freeze({
    name: "cloudflare.d1.delete", version: "1", tier: "reserved", providerOperationId: "d1-delete-database",
    prepare(raw: unknown) {
      const args = database.parse(raw);
      return prepared(args, args.databaseId, databases, `cloudflare:account:${account}:d1:${args.databaseId}`, `${root}/d1/database/${args.databaseId}`, ["database-and-data-removed", "dependent-services-may-fail"]);
    },
  });
  const r2Delete: DeletionPlanDescriptor<ReturnType<typeof bucket.parse>> = Object.freeze({
    name: "cloudflare.r2.delete", version: "1", tier: "reserved", providerOperationId: "r2-delete-bucket",
    prepare(raw: unknown) {
      const args = bucket.parse(raw);
      return prepared(args, args.bucketName, buckets, `cloudflare:account:${account}:r2:jurisdiction:default:bucket:${args.bucketName}`, `${root}/r2/buckets/${args.bucketName}`, ["default-jurisdiction-bucket-removed", "dependent-services-may-fail"]);
    },
  });
  const dnsDelete: DeletionPlanDescriptor<ReturnType<typeof record.parse>> = Object.freeze({
    name: "cloudflare.dns.delete", version: "1", tier: "reserved", providerOperationId: "dns-records-for-a-zone-delete-dns-record",
    prepare(raw: unknown) {
      const args = record.parse(raw);
      return prepared(args, args.dnsRecordId, records, `cloudflare:account:${account}:zone:${zone}:dns:${args.dnsRecordId}`, `/zones/${zone}/dns_records/${args.dnsRecordId}`, ["dns-record-removed", "dns-propagation-not-atomic", "dependent-services-may-fail"]);
    },
  });
  return Object.freeze({ workerDelete, hyperdriveDelete, d1Delete, r2Delete, dnsDelete });
}
