import { closed, integer, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const accountId = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const workerId = text(64, /^[a-f0-9]+$(?![\s\S])/);
const workerName = text(128, /^[a-z0-9_][a-z0-9_-]*$(?![\s\S])/);
const page = closed({ page: integer(1, 1000), perPage: integer(1, 100) });
const detail = closed({ workerId });
type Row = Record<string, unknown>;
type Identity = Readonly<{ id: string; name: string }>;
export interface WorkerIdentityScope {
  accountId: string;
  revision: string;
  listWorkers?: readonly { workerId: string; workerName: string }[];
  workers?: readonly { workerId: string; workerName: string }[];
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}
function snapshot(rows: WorkerIdentityScope["workers"]): ReadonlyMap<string, string> {
  const selected = rows === undefined ? [] : rows;
  requireThat(Array.isArray(selected) && selected.length <= 100, "cap");
  const ids = new Map<string, string>(), names = new Set<string>();
  for (const row of selected) {
    requireThat(row !== null && typeof row === "object", "schema");
    const id = workerId.parse(row.workerId), name = workerName.parse(row.workerName);
    requireThat(!ids.has(id) && !names.has(name), "schema");
    ids.set(id, name); names.add(name);
  }
  return ids;
}

export function workerIdentityDescriptors(scope: WorkerIdentityScope) {
  const account = accountId.parse(scope.accountId), revision = label.parse(scope.revision);
  const list = snapshot(scope.listWorkers), details = snapshot(scope.workers);
  const base = { subject: "provider-worker-identities" as const, complete: false as const,
    servingDeployment: "not-established" as const, productionConsumer: "not-established" as const,
    buildSystemTagBinding: "not-established" as const };
  function context(row: Row): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
  }
  function identity(row: Row, id: string, expected: string): Identity {
    context(row);
    requireThat(row.id === id && row.name === expected, "scope");
    return Object.freeze({ id, name: expected });
  }
  function descriptor<A, O>(name: string, operation: string, prepare: (raw: unknown) => { arguments: A; suffix: string; resource: string },
    project: (result: unknown, args: A) => O): MetadataDescriptor<A, O> {
    const prepared = new WeakSet<object>();
    return Object.freeze({ name, version: "1", tier: "read" as const, providerOperationId: operation,
      prepare(raw: unknown) {
        const input = prepare(raw);
        const value = Object.freeze({ arguments: input.arguments,
          resource: Object.freeze({ id: `cloudflare:account:${account}:${input.resource}`, revision }),
          request: Object.freeze({ method: "GET" as const, path: `/accounts/${account}/workers/workers${input.suffix}`,
            maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
        prepared.add(value); return value;
      },
      project(raw: string, value: PreparedMetadata<A>) {
        requireThat(prepared.has(value), "scope");
        requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
        const body = object(parsed); context(body);
        requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
        const output = project(body.result, value.arguments);
        requireThat(Buffer.byteLength(JSON.stringify(output), "utf8") <= 32768, "cap");
        return Object.freeze(output);
      },
    });
  }
  const identitiesList = descriptor("cloudflare.workers.identities.list", "listWorkers", raw => {
    const args = page.parse(raw); requireThat(list.size > 0, "scope");
    return { arguments: args, suffix: `?page=${args.page}&per_page=${args.perPage}`, resource: "worker-identities" };
  }, (result, args) => {
    requireThat(Array.isArray(result) && result.length <= args.perPage, "cap");
    const items: Identity[] = [], seen = new Set<string>();
    for (const raw of result) {
      const row = object(raw); context(row);
      requireThat(typeof row.id === "string", "upstream");
      const expected = list.get(row.id);
      if (expected === undefined) continue;
      requireThat(!seen.has(row.id), "scope"); seen.add(row.id);
      items.push(identity(row, row.id, expected));
    }
    return { ...base, items: Object.freeze(items) };
  });
  const identityGet = descriptor("cloudflare.workers.identities.get", "getWorker", raw => {
    const args = detail.parse(raw); requireThat(details.has(args.workerId), "scope");
    return { arguments: args, suffix: `/${args.workerId}`, resource: `worker-identity:${args.workerId}` };
  }, (result, args) => ({ ...base, worker: identity(object(result), args.workerId, details.get(args.workerId)!) }));
  return Object.freeze({ identitiesList, identityGet });
}
