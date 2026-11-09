import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const workerName = text(63, /^[a-z0-9][a-z0-9-]*$(?![\s\S])/);
const hookName = text(58, /^[A-Za-z0-9][A-Za-z0-9 _.-]*$(?![\s\S])/);
const branchName = text(256, /^[A-Za-z0-9][A-Za-z0-9_./-]*$(?![\s\S])/);
const uuid = text(36, /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$(?![\s\S])/);
const input = closed({ scriptName: workerName });
type Row = Record<string, unknown>;
type Hook = Readonly<{ name: string; branch: string }>;
export interface DeployHookScope {
  accountId: string;
  revision: string;
  workers?: readonly { scriptName: string; scriptTag: string; hooks: readonly Hook[] }[];
}
interface HookList {
  readonly items: readonly Hook[];
  readonly complete: false;
  readonly subject: "configured-worker-deploy-hooks";
  readonly servingDeployment: "not-established";
  readonly productionConsumer: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}
function branch(value: unknown): string {
  const parsed = branchName.parse(value);
  requireThat(!parsed.includes("..") && !parsed.includes("//") && !parsed.endsWith("/") && !parsed.endsWith(".") && !parsed.endsWith(".lock"), "schema");
  return parsed;
}

export function deployHookDescriptor(scope: DeployHookScope): MetadataDescriptor<ReturnType<typeof input.parse>, HookList> {
  const account = identifier.parse(scope.accountId), revision = label.parse(scope.revision);
  const workers = scope.workers ?? [];
  requireThat(Array.isArray(workers) && workers.length <= 100, "cap");
  const allowed = new Map<string, { scriptTag: string; hooks: ReadonlyMap<string, Hook> }>();
  for (const worker of workers) {
    requireThat(worker !== null && typeof worker === "object", "schema");
    const name = workerName.parse(worker.scriptName), scriptTag = identifier.parse(worker.scriptTag);
    requireThat(!allowed.has(name), "schema");
    requireThat(Array.isArray(worker.hooks) && worker.hooks.length <= 100, "cap");
    const hooks = new Map<string, Hook>();
    for (const hook of worker.hooks) {
      requireThat(hook !== null && typeof hook === "object", "schema");
      const name = hookName.parse(hook.name);
      requireThat(!hooks.has(name), "schema");
      hooks.set(name, Object.freeze({ name, branch: branch(hook.branch) }));
    }
    allowed.set(name, { scriptTag, hooks });
  }
  function context(row: Row): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
  }
  const prepared = new WeakSet<object>();
  return Object.freeze({
    name: "cloudflare.workers.builds.deploy_hooks.list", version: "1", tier: "read", providerOperationId: "listDeployHooks",
    prepare(raw: unknown) {
      const args = input.parse(raw), selected = allowed.get(args.scriptName);
      requireThat(selected !== undefined && selected.hooks.size > 0, "scope");
      const value = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:worker:${args.scriptName}:deploy-hooks:${selected.scriptTag}`, revision }),
        request: Object.freeze({ method: "GET" as const, path: `/accounts/${account}/builds/workers/${args.scriptName}/deploy_hooks`,
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
      context(body);
      requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Array.isArray(body.result), "upstream");
      requireThat(body.result.length <= 1000, "cap");
      const selected = allowed.get(value.arguments.scriptName)!;
      const seen = new Set<string>(), capabilities: string[] = [], items: Hook[] = [];
      for (const rawRow of body.result) {
        const row = object(rawRow);
        context(row);
        // UUIDs authorize unauthenticated build triggers, not public identities.
        if (row.deploy_hook_uuid !== undefined) capabilities.push(uuid.parse(row.deploy_hook_uuid));
        const name = hookName.parse(row.deploy_hook_name), expected = selected.hooks.get(name);
        if (expected === undefined) continue;
        requireThat(!seen.has(name) && row.external_script_id === selected.scriptTag && row.branch === expected.branch, "scope");
        seen.add(name);
        items.push(expected);
      }
      const out = { items: Object.freeze(items), complete: false as const, subject: "configured-worker-deploy-hooks" as const,
        servingDeployment: "not-established" as const, productionConsumer: "not-established" as const };
      const serialized = JSON.stringify(out).toLowerCase();
      requireThat(capabilities.every(capability => !serialized.includes(capability.toLowerCase())), "scope");
      requireThat(Buffer.byteLength(serialized, "utf8") <= 32768, "cap");
      return Object.freeze(out);
    },
  });
}
