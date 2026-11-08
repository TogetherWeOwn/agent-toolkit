import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const accountId = text(32, /^[a-f0-9]{32}$/);
const scriptName = text(128, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const versionId = text(36, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
const input = closed({ scriptName, versionId });
type Arguments = ReturnType<typeof input.parse>;
type Row = Record<string, unknown>;
type WorkerFirst = { status: "configured"; value: boolean | readonly string[] } | { status: "unavailable"; reason: "not-returned" };
interface VersionAssets {
  id: string;
  subject: "version-configured-worker-first";
  workerFirst: WorkerFirst;
  activeDeployment: "not-established";
  effectiveRouting: "not-established";
  effectiveProtection: "not-established";
}
export interface VersionAssetScope {
  accountId: string;
  revision: string;
  workers?: readonly { scriptName: string; versionIds: readonly string[] }[];
}

function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}
function workerFirst(value: unknown): WorkerFirst {
  if (value === undefined) return Object.freeze({ status: "unavailable", reason: "not-returned" });
  const config = object(value).config;
  if (config === undefined) return Object.freeze({ status: "unavailable", reason: "not-returned" });
  const first = object(config).run_worker_first;
  if (first === undefined) return Object.freeze({ status: "unavailable", reason: "not-returned" });
  if (typeof first === "boolean") return Object.freeze({ status: "configured", value: first });
  requireThat(Array.isArray(first) && first.length > 0 && first.length <= 32, "upstream");
  const rules: string[] = [];
  for (const rule of first) {
    requireThat(typeof rule === "string" && rule.length <= 256 && !rule.includes("\n") && /^!?\/[A-Za-z0-9_.*\/-]*$/.test(rule) &&
      rule.split("/").every(part => part !== "." && part !== "..") && !rule.includes("//"), "upstream");
    requireThat(!rules.includes(rule), "upstream");
    rules.push(rule);
  }
  requireThat(rules.some(rule => rule.startsWith("/")), "upstream");
  return Object.freeze({ status: "configured", value: Object.freeze(rules) });
}

// Uses the full Worker-version response, not the older script-version schema.
// Never request include=modules, aliases or version prefixes on this metadata read.
export function versionAssetDescriptor(scope: VersionAssetScope): MetadataDescriptor<Arguments, VersionAssets> {
  const account = accountId.parse(scope.accountId);
  const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$/).parse(scope.revision);
  const workers = scope.workers ?? [];
  requireThat(Array.isArray(workers) && workers.length <= 100, "cap");
  const allowed = new Map<string, ReadonlySet<string>>();
  for (const worker of workers) {
    requireThat(worker !== null && typeof worker === "object", "schema");
    const name = scriptName.parse(worker.scriptName);
    requireThat(!allowed.has(name), "schema");
    requireThat(Array.isArray(worker.versionIds) && worker.versionIds.length <= 100, "cap");
    const ids = new Set<string>(worker.versionIds.map((value: unknown) => versionId.parse(value)));
    requireThat(ids.size === worker.versionIds.length, "schema");
    allowed.set(name, ids);
  }
  const preparations = new WeakSet<object>();
  return Object.freeze({
    name: "cloudflare.workers.version_assets.get", version: "1", tier: "read",
    providerOperationId: "getWorkerVersion",
    prepare(raw: unknown): PreparedMetadata<Arguments> {
      const args = input.parse(raw);
      requireThat(allowed.get(args.scriptName)?.has(args.versionId) === true, "scope");
      const prepared = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:worker:${args.scriptName}:asset-version:${args.versionId}`, revision }),
        request: Object.freeze({ method: "GET" as const,
          path: `/accounts/${account}/workers/workers/${args.scriptName}/versions/${args.versionId}`,
          maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }),
      });
      preparations.add(prepared);
      return prepared;
    },
    project(raw: string, prepared: PreparedMetadata<Arguments>): VersionAssets {
      requireThat(preparations.has(prepared), "scope");
      requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
      const body = object(parsed);
      requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
      const result = object(body.result);
      requireThat(result.id === prepared.arguments.versionId, "scope");
      requireThat(result.account_id === undefined || result.account_id === account, "scope");
      requireThat(result.script_name === undefined || result.script_name === prepared.arguments.scriptName, "scope");
      return Object.freeze({ id: prepared.arguments.versionId, subject: "version-configured-worker-first",
        workerFirst: workerFirst(result.assets), activeDeployment: "not-established",
        effectiveRouting: "not-established", effectiveProtection: "not-established" });
    },
  });
}
