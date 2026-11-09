import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const script = text(63, /^[A-Za-z0-9][A-Za-z0-9_-]*$(?![\s\S])/);
// Exact opaque selections, not a cron parser or execution-time evaluator.
const cron = text(128, /^[0-9*/,\-]+(?: [0-9*/,\-]+){4}$(?![\s\S])/);
const input = closed({ scriptName: script });
type Row = Record<string, unknown>;
export interface WorkerScheduleScope {
  accountId: string;
  revision: string;
  workers?: readonly { scriptName: string; crons: readonly string[] }[];
}
interface WorkerSchedules {
  readonly scriptName: string;
  readonly schedules: readonly { readonly cron: string }[];
  readonly subject: "configured-worker-schedules";
  readonly complete: false;
  readonly effectiveExecution: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

export function workerScheduleDescriptor(scope: WorkerScheduleScope): MetadataDescriptor<ReturnType<typeof input.parse>, WorkerSchedules> {
  const account = identifier.parse(scope.accountId);
  const revision = label.parse(scope.revision);
  const workers = scope.workers ?? [];
  requireThat(Array.isArray(workers) && workers.length <= 100, "cap");
  const allowed = new Map<string, Set<string>>();
  for (const worker of workers) {
    requireThat(worker !== null && typeof worker === "object", "schema");
    const name = script.parse(worker.scriptName);
    requireThat(!allowed.has(name), "schema");
    requireThat(Array.isArray(worker.crons) && worker.crons.length <= 100, "cap");
    const crons = new Set<string>();
    for (const value of worker.crons) {
      const expression = cron.parse(value);
      requireThat(!crons.has(expression), "schema");
      crons.add(expression);
    }
    allowed.set(name, crons);
  }
  function context(row: Row, scriptName: string): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.script_name === undefined || row.script_name === scriptName, "scope");
  }
  const prepared = new WeakSet<object>();
  return Object.freeze({ name: "cloudflare.workers.schedules.get", version: "1", tier: "read" as const,
    providerOperationId: "worker-cron-trigger-get-cron-triggers",
    prepare(raw: unknown) {
      const args = input.parse(raw);
      requireThat((allowed.get(args.scriptName)?.size ?? 0) > 0, "scope");
      const value = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:worker:${args.scriptName}:schedules`, revision }),
        request: Object.freeze({ method: "GET" as const, path: `/accounts/${account}/workers/scripts/${args.scriptName}/schedules`,
          maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
      prepared.add(value);
      return value;
    },
    project(raw: string, value: PreparedMetadata<ReturnType<typeof input.parse>>) {
      requireThat(prepared.has(value), "scope");
      requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
      const body = object(parsed);
      const name = value.arguments.scriptName;
      context(body, name);
      requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
      const result = object(body.result);
      context(result, name);
      requireThat(Array.isArray(result.schedules) && result.schedules.length <= 1000, "cap");
      const selections = allowed.get(name)!;
      const seen = new Set<string>();
      const schedules: { readonly cron: string }[] = [];
      for (const rawRow of result.schedules) {
        const row = object(rawRow);
        context(row, name);
        requireThat(typeof row.cron === "string", "upstream");
        if (!selections.has(row.cron)) continue;
        requireThat(!seen.has(row.cron), "upstream");
        seen.add(row.cron);
        schedules.push(Object.freeze({ cron: row.cron }));
      }
      const output = Object.freeze({ scriptName: name, schedules: Object.freeze(schedules),
        subject: "configured-worker-schedules" as const, complete: false as const, effectiveExecution: "not-established" as const });
      requireThat(Buffer.byteLength(JSON.stringify(output), "utf8") <= 32768, "cap");
      return output;
    },
  });
}
