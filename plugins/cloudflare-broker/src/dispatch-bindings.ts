import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const accountId = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const name = text(63, /^[A-Za-z0-9][A-Za-z0-9_-]*$(?![\s\S])/);
const namespaceId = text(36, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$(?![\s\S])/);
const binding = text(128, /^[A-Za-z_][A-Za-z0-9_]*$(?![\s\S])/);
const input = closed({ namespaceName: name, scriptName: name });
type Arguments = ReturnType<typeof input.parse>;
type Row = Record<string, unknown>;
// Identity discriminators from the pinned workers_binding_item, not target grants.
export const dispatchBindingTypes = Object.freeze([
  "ai", "ai_search", "ai_search_namespace", "analytics_engine", "artifacts", "assets", "browser", "d1", "data_blob",
  "dispatch_namespace", "durable_object_namespace", "flagship", "hyperdrive", "images", "inherit", "json", "k2",
  "kv_namespace", "media", "messaging", "mtls_certificate", "pipelines", "plain_text", "queue", "r2_bucket", "ratelimit",
  "secret_key", "secret_text", "secrets_store_secret", "send_email", "service", "text_blob", "vectorize", "version_metadata",
  "vpc_network", "vpc_service", "wasm_module", "worker_loader", "workflow",
] as const);
type BindingType = typeof dispatchBindingTypes[number];
export interface DispatchBindingScope {
  accountId: string;
  revision: string;
  namespaces?: readonly { namespaceId: string; namespaceName: string;
    scripts: readonly { scriptName: string; bindings: readonly { name: string; type: BindingType }[] }[] }[];
}
interface DispatchBindings {
  readonly namespaceName: string;
  readonly scriptName: string;
  readonly items: readonly Readonly<{ name: string; type: BindingType }>[];
  readonly subject: "configured-dispatch-script-binding-identities";
  readonly complete: false;
  readonly effectiveAvailability: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

export function snapshotDispatchBindings(values: DispatchBindingScope["namespaces"]) {
  const namespaces = values === undefined ? [] : values;
  requireThat(Array.isArray(namespaces) && namespaces.length <= 100, "cap");
  const selected = new Map<string, { id: string; scripts: Map<string, Map<string, BindingType>> }>(), ids = new Set<string>();
  for (const entry of namespaces) {
    requireThat(entry !== null && typeof entry === "object", "schema");
    const id = namespaceId.parse(entry.namespaceId), namespace = name.parse(entry.namespaceName);
    requireThat(!ids.has(id) && !selected.has(namespace), "schema");
    requireThat(Array.isArray(entry.scripts) && entry.scripts.length <= 100, "cap");
    const scripts = new Map<string, Map<string, BindingType>>();
    for (const worker of entry.scripts) {
      requireThat(worker !== null && typeof worker === "object", "schema");
      const script = name.parse(worker.scriptName);
      requireThat(!scripts.has(script), "schema");
      requireThat(Array.isArray(worker.bindings) && worker.bindings.length <= 100, "cap");
      const bindings = new Map<string, BindingType>();
      for (const value of worker.bindings) {
        requireThat(value !== null && typeof value === "object", "schema");
        const key = binding.parse(value.name);
        requireThat(!bindings.has(key) && dispatchBindingTypes.includes(value.type), "schema");
        bindings.set(key, value.type);
      }
      scripts.set(script, bindings);
    }
    ids.add(id); selected.set(namespace, { id, scripts });
  }
  return selected;
}

export function configuredDispatchBindings(value: unknown, selected: ReadonlyMap<string, BindingType>, context: (row: Row) => void) {
  requireThat(Array.isArray(value) && value.length <= 100, "cap");
  const items: Readonly<{ name: string; type: BindingType }>[] = [], seen = new Set<string>();
  for (const raw of value) {
    const row = object(raw); context(row);
    requireThat(typeof row.name === "string", "upstream");
    const expected = selected.get(row.name);
    if (expected === undefined) continue;
    requireThat(row.type === expected && !seen.has(row.name), "scope"); seen.add(row.name);
    // Never copy values, target associations or other binding configuration.
    items.push(Object.freeze({ name: row.name, type: expected }));
  }
  return Object.freeze(items);
}

export function dispatchBindingsDescriptor(scope: DispatchBindingScope): MetadataDescriptor<Arguments, DispatchBindings> {
  const account = accountId.parse(scope.accountId);
  const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/).parse(scope.revision);
  const selected = snapshotDispatchBindings(scope.namespaces);
  const preparations = new WeakSet<object>();
  function context(row: Row, args: Arguments): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.namespace_id === undefined || row.namespace_id === selected.get(args.namespaceName)!.id, "scope");
    requireThat(row.namespace_name === undefined || row.namespace_name === args.namespaceName, "scope");
    requireThat(row.script_name === undefined || row.script_name === args.scriptName, "scope");
  }
  return Object.freeze({
    name: "cloudflare.workers.dispatch_bindings.get", version: "1", tier: "read",
    providerOperationId: "namespace-worker-get-script-bindings",
    prepare(raw: unknown): PreparedMetadata<Arguments> {
      const args = input.parse(raw), namespace = selected.get(args.namespaceName);
      requireThat(namespace !== undefined && (namespace.scripts.get(args.scriptName)?.size ?? 0) > 0, "scope");
      const prepared = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:dispatch-namespace:${namespace.id}:script:${args.scriptName}:bindings`, revision }),
        request: Object.freeze({ method: "GET" as const,
          path: `/accounts/${account}/workers/dispatch/namespaces/${args.namespaceName}/scripts/${args.scriptName}/bindings`,
          maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
      preparations.add(prepared); return prepared;
    },
    project(raw: string, prepared: PreparedMetadata<Arguments>): DispatchBindings {
      requireThat(preparations.has(prepared), "scope");
      requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
      const body = object(parsed), args = prepared.arguments; context(body, args);
      requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
      const bindings = selected.get(args.namespaceName)!.scripts.get(args.scriptName)!;
      const items = configuredDispatchBindings(body.result, bindings, row => context(row, args));
      const out = Object.freeze({ namespaceName: args.namespaceName, scriptName: args.scriptName, items: Object.freeze(items),
        subject: "configured-dispatch-script-binding-identities" as const, complete: false as const,
        effectiveAvailability: "not-established" as const });
      requireThat(Buffer.byteLength(JSON.stringify(out), "utf8") <= 32768, "cap");
      return out;
    },
  });
}
