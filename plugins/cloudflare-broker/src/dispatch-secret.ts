import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const accountId = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const name = text(63, /^[A-Za-z0-9][A-Za-z0-9_-]*$(?![\s\S])/);
const namespaceId = text(36, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$(?![\s\S])/);
const binding = text(128, /^[A-Za-z_][A-Za-z0-9_]*$(?![\s\S])/);
const input = closed({ namespaceName: name, scriptName: name, secretName: binding });
type Arguments = ReturnType<typeof input.parse>;
type Row = Record<string, unknown>;
type SecretType = "secret_text" | "secret_key";
interface DispatchSecret {
  readonly namespaceName: string;
  readonly scriptName: string;
  readonly name: string;
  readonly type: SecretType;
  readonly subject: "configured-dispatch-script-secret-binding";
  readonly effectiveAvailability: "not-established";
}
export interface DispatchSecretScope {
  accountId: string;
  revision: string;
  namespaces?: readonly { namespaceId: string; namespaceName: string;
    scripts: readonly { scriptName: string; secrets: readonly { name: string; type: SecretType }[] }[] }[];
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

export function dispatchSecretDescriptor(scope: DispatchSecretScope): MetadataDescriptor<Arguments, DispatchSecret> {
  const account = accountId.parse(scope.accountId);
  const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/).parse(scope.revision);
  const namespaces = scope.namespaces === undefined ? [] : scope.namespaces;
  requireThat(Array.isArray(namespaces) && namespaces.length <= 100, "cap");
  const selected = new Map<string, { id: string; scripts: Map<string, Map<string, SecretType>> }>(), ids = new Set<string>();
  for (const entry of namespaces) {
    requireThat(entry !== null && typeof entry === "object", "schema");
    const id = namespaceId.parse(entry.namespaceId), namespace = name.parse(entry.namespaceName);
    requireThat(!ids.has(id) && !selected.has(namespace), "schema");
    requireThat(Array.isArray(entry.scripts) && entry.scripts.length <= 100, "cap");
    const scripts = new Map<string, Map<string, SecretType>>();
    for (const worker of entry.scripts) {
      requireThat(worker !== null && typeof worker === "object", "schema");
      const script = name.parse(worker.scriptName);
      requireThat(!scripts.has(script), "schema");
      requireThat(Array.isArray(worker.secrets) && worker.secrets.length <= 100, "cap");
      const secrets = new Map<string, SecretType>();
      for (const secret of worker.secrets) {
        requireThat(secret !== null && typeof secret === "object", "schema");
        const key = binding.parse(secret.name);
        requireThat(!secrets.has(key) && (secret.type === "secret_text" || secret.type === "secret_key"), "schema");
        secrets.set(key, secret.type);
      }
      scripts.set(script, secrets);
    }
    ids.add(id); selected.set(namespace, { id, scripts });
  }
  const preparations = new WeakSet<object>();
  function context(row: Row, args: Arguments): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.namespace_id === undefined || row.namespace_id === selected.get(args.namespaceName)!.id, "scope");
    requireThat(row.namespace_name === undefined || row.namespace_name === args.namespaceName, "scope");
    requireThat(row.script_name === undefined || row.script_name === args.scriptName, "scope");
  }
  return Object.freeze({
    name: "cloudflare.workers.dispatch_secret_metadata.get", version: "1", tier: "read",
    providerOperationId: "namespace-worker-get-script-secrets",
    prepare(raw: unknown): PreparedMetadata<Arguments> {
      const args = input.parse(raw), namespace = selected.get(args.namespaceName);
      requireThat(namespace !== undefined && namespace.scripts.get(args.scriptName)?.has(args.secretName), "scope");
      const prepared = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:dispatch-namespace:${namespace.id}:script:${args.scriptName}:secret:${args.secretName}`, revision }),
        request: Object.freeze({ method: "GET" as const,
          path: `/accounts/${account}/workers/dispatch/namespaces/${args.namespaceName}/scripts/${args.scriptName}/secrets/${args.secretName}`,
          maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
      preparations.add(prepared); return prepared;
    },
    project(raw: string, prepared: PreparedMetadata<Arguments>): DispatchSecret {
      requireThat(preparations.has(prepared), "scope");
      requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
      const body = object(parsed), args = prepared.arguments;
      context(body, args);
      requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
      const row = object(body.result);
      context(row, args);
      const expected = selected.get(args.namespaceName)!.scripts.get(args.scriptName)!.get(args.secretName)!;
      requireThat(row.name === args.secretName && row.type === expected, "scope");
      // The official GET omits values despite reusing the secret write schema.
      return Object.freeze({ namespaceName: args.namespaceName, scriptName: args.scriptName, name: args.secretName, type: expected,
        subject: "configured-dispatch-script-secret-binding", effectiveAvailability: "not-established" });
    },
  });
}
