import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const script = text(63, /^[A-Za-z0-9][A-Za-z0-9_-]*$(?![\s\S])/);
const binding = text(128, /^[A-Za-z_][A-Za-z0-9_]*$(?![\s\S])/);
const input = closed({ scriptName: script, secretName: binding });
type Args = ReturnType<typeof input.parse>;
type Row = Record<string, unknown>;
type SecretType = "secret_text" | "secret_key";
export interface WorkerSecretScope {
  accountId: string;
  revision: string;
  workers?: readonly { scriptName: string; secrets: readonly { name: string; type: SecretType }[] }[];
}
interface SecretMetadata {
  readonly scriptName: string;
  readonly name: string;
  readonly type: SecretType;
  readonly subject: "configured-worker-secret-binding";
  readonly effectiveAvailability: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

export function workerSecretDescriptor(scope: WorkerSecretScope): MetadataDescriptor<Args, SecretMetadata> {
  const account = identifier.parse(scope.accountId);
  const revision = label.parse(scope.revision);
  const workers = scope.workers === undefined ? [] : scope.workers;
  requireThat(Array.isArray(workers) && workers.length <= 100, "cap");
  const allowed = new Map<string, Map<string, SecretType>>();
  for (const worker of workers) {
    const name = script.parse(worker.scriptName);
    requireThat(!allowed.has(name), "schema");
    requireThat(Array.isArray(worker.secrets) && worker.secrets.length <= 100, "cap");
    const secrets = new Map<string, SecretType>();
    for (const secret of worker.secrets) {
      const secretName = binding.parse(secret.name);
      requireThat(!secrets.has(secretName) && (secret.type === "secret_text" || secret.type === "secret_key"), "schema");
      secrets.set(secretName, secret.type);
    }
    allowed.set(name, secrets);
  }
  function context(row: Row, scriptName: string): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.script_name === undefined || row.script_name === scriptName, "scope");
  }
  const prepared = new WeakSet<object>();
  return Object.freeze({ name: "cloudflare.workers.secret_metadata.get", version: "1", tier: "read" as const,
    providerOperationId: "worker-get-script-secret",
    prepare(raw: unknown) {
      const args = input.parse(raw);
      requireThat(allowed.get(args.scriptName)?.has(args.secretName), "scope");
      const value = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:worker:${args.scriptName}:secret:${args.secretName}`, revision }),
        request: Object.freeze({ method: "GET" as const,
          path: `/accounts/${account}/workers/scripts/${args.scriptName}/secrets/${args.secretName}`,
          maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
      prepared.add(value);
      return value;
    },
    project(raw: string, value: PreparedMetadata<Args>) {
      requireThat(prepared.has(value), "scope");
      requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
      const body = object(parsed);
      context(body, value.arguments.scriptName);
      requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
      const row = object(body.result);
      context(row, value.arguments.scriptName);
      const expected = allowed.get(value.arguments.scriptName)?.get(value.arguments.secretName);
      requireThat(row.name === value.arguments.secretName && row.type === expected, "scope");
      // The GET omits values; never reuse the write shape's secret material.
      return Object.freeze({ scriptName: value.arguments.scriptName, name: value.arguments.secretName, type: expected!,
        subject: "configured-worker-secret-binding", effectiveAvailability: "not-established" });
    },
  });
}
