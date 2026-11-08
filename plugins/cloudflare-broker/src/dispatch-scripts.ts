import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const accountId = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const namespaceId = text(36, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$(?![\s\S])/);
const namespaceName = text(63, /^[A-Za-z0-9][A-Za-z0-9_-]*$(?![\s\S])/);
const scriptName = text(63, /^[a-z0-9_][a-z0-9_-]*$(?![\s\S])/);
const input = closed({ namespaceName });
type Arguments = ReturnType<typeof input.parse>;
type Row = Record<string, unknown>;
interface ScriptList {
  readonly namespaceName: string;
  readonly items: readonly Readonly<{ name: string; tag: string }>[];
  readonly subject: "provider-dispatch-script-identities";
  readonly complete: false;
  readonly servingDeployment: "not-established";
  readonly productionConsumer: "not-established";
}
export interface DispatchScriptScope {
  accountId: string;
  revision: string;
  namespaces?: readonly { namespaceId: string; namespaceName: string; scripts: readonly { name: string; tag: string }[] }[];
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

export function dispatchScriptDescriptor(scope: DispatchScriptScope): MetadataDescriptor<Arguments, ScriptList> {
  const account = accountId.parse(scope.accountId), revision = label.parse(scope.revision);
  const rows = scope.namespaces === undefined ? [] : scope.namespaces;
  requireThat(Array.isArray(rows) && rows.length <= 100, "cap");
  const selected = new Map<string, { id: string; names: Map<string, string>; tags: Set<string> }>(), ids = new Set<string>();
  for (const row of rows) {
    requireThat(row !== null && typeof row === "object", "schema");
    const id = namespaceId.parse(row.namespaceId), name = namespaceName.parse(row.namespaceName);
    requireThat(!ids.has(id) && !selected.has(name), "schema");
    requireThat(Array.isArray(row.scripts) && row.scripts.length <= 100, "cap");
    const names = new Map<string, string>(), tags = new Set<string>();
    for (const script of row.scripts) {
      requireThat(script !== null && typeof script === "object", "schema");
      const name = scriptName.parse(script.name), tag = label.parse(script.tag);
      requireThat(!names.has(name) && !tags.has(tag), "schema"); names.set(name, tag); tags.add(tag);
    }
    ids.add(id); selected.set(name, { id, names, tags });
  }
  const preparations = new WeakSet<object>();
  function context(row: Row, args: Arguments): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.namespace_id === undefined || row.namespace_id === selected.get(args.namespaceName)!.id, "scope");
    requireThat(row.dispatch_namespace === undefined || row.dispatch_namespace === args.namespaceName, "scope");
  }
  return Object.freeze({
    name: "cloudflare.workers.dispatch_scripts.list", version: "1", tier: "read",
    providerOperationId: "namespace-worker-list-scripts",
    prepare(raw: unknown): PreparedMetadata<Arguments> {
      const args = input.parse(raw), namespace = selected.get(args.namespaceName);
      requireThat(namespace !== undefined && namespace.names.size > 0, "scope");
      // No provider pagination is declared. Tag filters would not establish identity.
      const prepared = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:dispatch-namespace:${namespace.id}:scripts`, revision }),
        request: Object.freeze({ method: "GET" as const,
          path: `/accounts/${account}/workers/dispatch/namespaces/${args.namespaceName}/scripts`,
          maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
      preparations.add(prepared); return prepared;
    },
    project(raw: string, prepared: PreparedMetadata<Arguments>): ScriptList {
      requireThat(preparations.has(prepared), "scope");
      requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
      const body = object(parsed), args = prepared.arguments; context(body, args);
      requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
      requireThat(Array.isArray(body.result) && body.result.length <= 100, "cap");
      const namespace = selected.get(args.namespaceName)!, seen = new Set<string>();
      const items: Readonly<{ name: string; tag: string }>[] = [];
      for (const raw of body.result) {
        const row = object(raw); context(row, args);
        const script = object(row.script); context(script, args);
        requireThat(typeof script.id === "string", "upstream");
        const expected = namespace.names.get(script.id);
        if (expected === undefined) { requireThat(!namespace.tags.has(script.tag as string), "scope"); continue; }
        requireThat(script.tag === expected && !seen.has(script.id), "scope"); seen.add(script.id);
        items.push(Object.freeze({ name: script.id, tag: expected }));
      }
      return Object.freeze({ namespaceName: args.namespaceName, items: Object.freeze(items),
        subject: "provider-dispatch-script-identities", complete: false,
        servingDeployment: "not-established", productionConsumer: "not-established" });
    },
  });
}
