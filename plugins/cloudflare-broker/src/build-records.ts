import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const uuid = text(36, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const listInput = closed({ scriptTag: identifier });
const getInput = closed({ scriptTag: identifier, buildId: uuid });
type Row = Record<string, unknown>;
type Selection = Readonly<{ buildId: string; triggerId: string }>;
type Status = "queued" | "initializing" | "running" | "stopped";
type Outcome = "success" | "fail" | "skipped" | "cancelled" | "terminated";
export interface BuildRecordScope {
  accountId: string;
  revision: string;
  workers?: readonly { scriptTag: string; builds: readonly Selection[] }[];
}
interface Build {
  readonly buildId: string;
  readonly triggerId: string;
  readonly status: Status | "unavailable";
  readonly outcome: Outcome | null | "unavailable";
}
interface Result {
  readonly scriptTag: string;
  readonly builds: readonly Build[];
  readonly complete: false;
  readonly subject: "provider-reported-worker-builds";
  readonly servingDeployment: "not-established";
  readonly productionConsumer: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}
function status(value: unknown): Status | "unavailable" {
  if (value === undefined) return "unavailable";
  requireThat(value === "queued" || value === "initializing" || value === "running" || value === "stopped", "upstream");
  return value;
}
function outcome(value: unknown): Outcome | null | "unavailable" {
  if (value === undefined) return "unavailable";
  requireThat(value === null || value === "success" || value === "fail" || value === "skipped" || value === "cancelled" || value === "terminated", "upstream");
  return value;
}

export function buildRecordDescriptors(scope: BuildRecordScope): {
  buildsList: MetadataDescriptor<ReturnType<typeof listInput.parse>, Result>;
  buildGet: MetadataDescriptor<ReturnType<typeof getInput.parse>, Result>;
} {
  const account = identifier.parse(scope.accountId);
  const revision = label.parse(scope.revision);
  const workers = scope.workers ?? [];
  requireThat(Array.isArray(workers) && workers.length <= 100, "cap");
  const allowed = new Map<string, Map<string, Selection>>();
  const owners = new Set<string>();
  for (const worker of workers) {
    requireThat(worker !== null && typeof worker === "object", "schema");
    const scriptTag = identifier.parse(worker.scriptTag);
    requireThat(!allowed.has(scriptTag), "schema");
    requireThat(Array.isArray(worker.builds) && worker.builds.length <= 100, "cap");
    const builds = new Map<string, Selection>();
    for (const build of worker.builds) {
      requireThat(build !== null && typeof build === "object", "schema");
      const buildId = uuid.parse(build.buildId);
      const triggerId = uuid.parse(build.triggerId);
      requireThat(!owners.has(buildId), "schema");
      owners.add(buildId);
      builds.set(buildId, Object.freeze({ buildId, triggerId }));
    }
    allowed.set(scriptTag, builds);
  }
  function context(row: Row, scriptTag: string): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.external_script_id === undefined || row.external_script_id === scriptTag, "scope");
  }
  function descriptor<A extends { readonly scriptTag: string }>(name: string, operation: string,
    input: { parse(raw: unknown): A }, detail: (args: A) => string | undefined): MetadataDescriptor<A, Result> {
    const prepared = new WeakSet<object>();
    return Object.freeze({
      name, version: "1", tier: "read", providerOperationId: operation,
      prepare(raw: unknown) {
        const args = input.parse(raw);
        const selections = allowed.get(args.scriptTag);
        const id = detail(args);
        requireThat((selections?.size ?? 0) > 0 && (id === undefined || selections!.has(id)), "scope");
        const value = Object.freeze({ arguments: args,
          resource: Object.freeze({ id: `cloudflare:account:${account}:worker-build:${args.scriptTag}:${id === undefined ? "builds" : `build:${id}`}`, revision }),
          request: Object.freeze({ method: "GET" as const,
            path: id === undefined ? `/accounts/${account}/builds/workers/${args.scriptTag}/builds?page=1&per_page=100` : `/accounts/${account}/builds/builds/${id}`,
            maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
        prepared.add(value);
        return value;
      },
      project(raw: string, value: PreparedMetadata<A>) {
        requireThat(prepared.has(value), "scope");
        requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
        const body = object(parsed);
        context(body, value.arguments.scriptTag);
        requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0, "upstream");
        const id = detail(value.arguments);
        const rows: unknown[] = id === undefined ? (requireThat(Array.isArray(body.result), "upstream"), body.result) : [body.result];
        requireThat(rows.length <= 100, "cap");
        const selections = allowed.get(value.arguments.scriptTag)!;
        const seen = new Set<string>();
        const builds: Build[] = [];
        for (const item of rows) {
          const row = object(item);
          context(row, value.arguments.scriptTag);
          const buildId = uuid.parse(row.build_uuid);
          requireThat(id === undefined || id === buildId, "scope");
          const expected = selections.get(buildId);
          if (expected === undefined) continue;
          requireThat(!seen.has(buildId), "scope");
          seen.add(buildId);
          const trigger = object(row.trigger);
          context(trigger, value.arguments.scriptTag);
          requireThat(trigger.external_script_id === value.arguments.scriptTag && trigger.trigger_uuid === expected.triggerId, "scope");
          builds.push(Object.freeze({ buildId, triggerId: expected.triggerId, status: status(row.status), outcome: outcome(row.build_outcome) }));
        }
        const out = Object.freeze({ scriptTag: value.arguments.scriptTag, builds: Object.freeze(builds), complete: false as const,
          subject: "provider-reported-worker-builds" as const, servingDeployment: "not-established" as const, productionConsumer: "not-established" as const });
        requireThat(Buffer.byteLength(JSON.stringify(out), "utf8") <= 32768, "cap");
        return out;
      },
    });
  }
  return Object.freeze({
    buildsList: descriptor("cloudflare.workers.builds.records.list", "listBuildsByScript", listInput, () => undefined),
    buildGet: descriptor("cloudflare.workers.builds.records.get", "getBuildByUuid", getInput, args => args.buildId),
  });
}
