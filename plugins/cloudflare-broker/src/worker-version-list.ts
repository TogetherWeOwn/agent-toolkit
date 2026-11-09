import { closed, integer, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const accountId = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const workerId = text(64, /^[a-f0-9]+$(?![\s\S])/);
const versionId = text(36, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$(?![\s\S])/);
const input = closed({ workerId, page: integer(1, 1000), perPage: integer(1, 100) });
type Arguments = ReturnType<typeof input.parse>;
type Row = Record<string, unknown>;
interface VersionList {
  subject: "provider-worker-version-identities";
  workerId: string;
  items: readonly { id: string }[];
  complete: false;
  servingDeployment: "not-established";
  productionConsumer: "not-established";
}
export interface WorkerVersionListScope {
  accountId: string;
  revision: string;
  workers?: readonly { workerId: string; versionIds: readonly string[] }[];
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

// Full Worker versions are distinct from the legacy script-version list.
// Use immutable Worker IDs, never name aliases or a model-supplied include option.
export function workerVersionListDescriptor(scope: WorkerVersionListScope): MetadataDescriptor<Arguments, VersionList> {
  const account = accountId.parse(scope.accountId);
  const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/).parse(scope.revision);
  const workers = scope.workers === undefined ? [] : scope.workers;
  requireThat(Array.isArray(workers) && workers.length <= 100, "cap");
  const selected = new Map<string, ReadonlySet<string>>();
  for (const worker of workers) {
    requireThat(worker !== null && typeof worker === "object", "schema");
    const id = workerId.parse(worker.workerId);
    requireThat(!selected.has(id), "schema");
    requireThat(Array.isArray(worker.versionIds) && worker.versionIds.length <= 100, "cap");
    const versions = new Set<string>(worker.versionIds.map((value: unknown) => versionId.parse(value)));
    requireThat(versions.size === worker.versionIds.length, "schema");
    selected.set(id, versions);
  }
  const preparations = new WeakSet<object>();
  function context(row: Row, id: string): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.worker_id === undefined || row.worker_id === id, "scope");
  }
  return Object.freeze({
    name: "cloudflare.workers.full_versions.list", version: "1", tier: "read",
    providerOperationId: "listWorkerVersions",
    prepare(raw: unknown): PreparedMetadata<Arguments> {
      const args = input.parse(raw);
      requireThat((selected.get(args.workerId)?.size ?? 0) > 0, "scope");
      const prepared = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:worker-identity:${args.workerId}:versions`, revision }),
        request: Object.freeze({ method: "GET" as const,
          path: `/accounts/${account}/workers/workers/${args.workerId}/versions?page=${args.page}&per_page=${args.perPage}`,
          maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
      preparations.add(prepared); return prepared;
    },
    project(raw: string, prepared: PreparedMetadata<Arguments>): VersionList {
      requireThat(preparations.has(prepared), "scope");
      requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
      const body = object(parsed), id = prepared.arguments.workerId;
      context(body, id);
      requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
      requireThat(Array.isArray(body.result) && body.result.length <= prepared.arguments.perPage, "cap");
      const allowed = selected.get(id)!, seen = new Set<string>(), items: { id: string }[] = [];
      for (const entry of body.result) {
        const row = object(entry); context(row, id);
        requireThat(typeof row.id === "string", "upstream");
        if (!allowed.has(row.id)) continue;
        requireThat(!seen.has(row.id), "scope"); seen.add(row.id);
        items.push(Object.freeze({ id: row.id }));
      }
      return Object.freeze({ subject: "provider-worker-version-identities", workerId: id, items: Object.freeze(items),
        complete: false, servingDeployment: "not-established", productionConsumer: "not-established" });
    },
  });
}
