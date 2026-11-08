import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";
import { configuredScriptSettings } from "./script-settings.js";

const accountId = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const name = text(63, /^[A-Za-z0-9][A-Za-z0-9_-]*$(?![\s\S])/);
const namespaceId = text(36, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$(?![\s\S])/);
const input = closed({ namespaceName: name, scriptName: name });
type Arguments = ReturnType<typeof input.parse>;
type Row = Record<string, unknown>;
interface DispatchSettings extends ReturnType<typeof configuredScriptSettings> {
  readonly namespaceName: string;
  readonly scriptName: string;
  readonly subject: "configured-dispatch-script-settings";
  readonly effectiveCollection: "not-established";
}
export interface DispatchSettingsScope {
  accountId: string;
  revision: string;
  scripts?: readonly { namespaceId: string; namespaceName: string; scriptNames: readonly string[] }[];
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

// Namespace identity visibility never authorizes reading a contained script.
export function dispatchSettingsDescriptor(scope: DispatchSettingsScope): MetadataDescriptor<Arguments, DispatchSettings> {
  const account = accountId.parse(scope.accountId);
  const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/).parse(scope.revision);
  const scripts = scope.scripts === undefined ? [] : scope.scripts;
  requireThat(Array.isArray(scripts) && scripts.length <= 100, "cap");
  const selected = new Map<string, { id: string; scripts: Set<string> }>(), ids = new Set<string>();
  for (const entry of scripts) {
    requireThat(entry !== null && typeof entry === "object", "schema");
    const id = namespaceId.parse(entry.namespaceId), namespace = name.parse(entry.namespaceName);
    requireThat(!ids.has(id) && !selected.has(namespace), "schema");
    requireThat(Array.isArray(entry.scriptNames) && entry.scriptNames.length <= 100, "cap");
    const names = new Set<string>();
    for (const value of entry.scriptNames) {
      const script = name.parse(value); requireThat(!names.has(script), "schema"); names.add(script);
    }
    ids.add(id); selected.set(namespace, { id, scripts: names });
  }
  const preparations = new WeakSet<object>();
  function context(row: Row, args: Arguments): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.namespace_id === undefined || row.namespace_id === selected.get(args.namespaceName)!.id, "scope");
    requireThat(row.namespace_name === undefined || row.namespace_name === args.namespaceName, "scope");
    requireThat(row.script_name === undefined || row.script_name === args.scriptName, "scope");
  }
  return Object.freeze({
    name: "cloudflare.workers.dispatch_script_settings.get", version: "1", tier: "read",
    providerOperationId: "namespace-worker-get-script-settings",
    prepare(raw: unknown): PreparedMetadata<Arguments> {
      const args = input.parse(raw);
      const namespace = selected.get(args.namespaceName);
      requireThat(namespace !== undefined && namespace.scripts.has(args.scriptName), "scope");
      const prepared = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:dispatch-namespace:${namespace.id}:script:${args.scriptName}:settings`, revision }),
        request: Object.freeze({ method: "GET" as const,
          path: `/accounts/${account}/workers/dispatch/namespaces/${args.namespaceName}/scripts/${args.scriptName}/settings`,
          maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
      preparations.add(prepared); return prepared;
    },
    project(raw: string, prepared: PreparedMetadata<Arguments>): DispatchSettings {
      requireThat(preparations.has(prepared), "scope");
      requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
      const body = object(parsed);
      context(body, prepared.arguments);
      requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
      const row = object(body.result);
      context(row, prepared.arguments);
      // Unlike script-settings-item, the dispatch schema does not allow null here.
      requireThat(row.observability !== null, "upstream");
      return Object.freeze({ namespaceName: prepared.arguments.namespaceName, scriptName: prepared.arguments.scriptName,
        ...configuredScriptSettings(row), subject: "configured-dispatch-script-settings", effectiveCollection: "not-established" });
    },
  });
}
