import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";
import { configuredScriptSettings } from "./script-settings.js";

const accountId = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const name = text(63, /^[A-Za-z0-9][A-Za-z0-9_-]*$(?![\s\S])/);
const input = closed({ serviceName: name, environmentName: name });
type Arguments = ReturnType<typeof input.parse>;
type Row = Record<string, unknown>;
interface EnvironmentSettings extends ReturnType<typeof configuredScriptSettings> {
  readonly serviceName: string;
  readonly environmentName: string;
  readonly subject: "configured-worker-environment-settings";
  readonly effectiveCollection: "not-established";
}
export interface EnvironmentSettingsScope {
  accountId: string;
  revision: string;
  environments?: readonly { serviceName: string; environmentName: string }[];
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

// This legacy environment endpoint is independently scoped; script-read scope
// never supplies an environment or authorizes a fallback to another endpoint.
export function environmentSettingsDescriptor(scope: EnvironmentSettingsScope): MetadataDescriptor<Arguments, EnvironmentSettings> {
  const account = accountId.parse(scope.accountId);
  const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/).parse(scope.revision);
  const environments = scope.environments === undefined ? [] : scope.environments;
  requireThat(Array.isArray(environments) && environments.length <= 100, "cap");
  const selected = new Set<string>();
  for (const entry of environments) {
    requireThat(entry !== null && typeof entry === "object", "schema");
    const key = `${name.parse(entry.serviceName)}:${name.parse(entry.environmentName)}`;
    requireThat(!selected.has(key), "schema");
    selected.add(key);
  }
  const preparations = new WeakSet<object>();
  function context(row: Row, args: Arguments): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.service_name === undefined || row.service_name === args.serviceName, "scope");
    requireThat(row.environment_name === undefined || row.environment_name === args.environmentName, "scope");
  }
  return Object.freeze({
    name: "cloudflare.workers.environment_settings.get", version: "1", tier: "read",
    providerOperationId: "worker-script-environment-get-settings",
    prepare(raw: unknown): PreparedMetadata<Arguments> {
      const args = input.parse(raw);
      requireThat(selected.has(`${args.serviceName}:${args.environmentName}`), "scope");
      const prepared = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:worker-service:${args.serviceName}:environment:${args.environmentName}:settings`, revision }),
        request: Object.freeze({ method: "GET" as const,
          path: `/accounts/${account}/workers/services/${args.serviceName}/environments/${args.environmentName}/settings`,
          maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
      preparations.add(prepared); return prepared;
    },
    project(raw: string, prepared: PreparedMetadata<Arguments>): EnvironmentSettings {
      requireThat(preparations.has(prepared), "scope");
      requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
      const body = object(parsed);
      context(body, prepared.arguments);
      requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
      const row = object(body.result);
      context(row, prepared.arguments);
      return Object.freeze({ serviceName: prepared.arguments.serviceName, environmentName: prepared.arguments.environmentName,
        ...configuredScriptSettings(row), subject: "configured-worker-environment-settings", effectiveCollection: "not-established" });
    },
  });
}
