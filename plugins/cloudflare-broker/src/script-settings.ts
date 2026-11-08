import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const script = text(63, /^[A-Za-z0-9][A-Za-z0-9_-]*$(?![\s\S])/);
const input = closed({ scriptName: script });
type Row = Record<string, unknown>;
type Observed<T> = T | "unavailable";
interface LogSettings {
  readonly enabled: Observed<boolean>;
  readonly headSamplingRate: Observed<number | null>;
  readonly invocationLogs: Observed<boolean>;
  readonly persist: Observed<boolean>;
}
interface TraceSettings {
  readonly enabled: Observed<boolean>;
  readonly headSamplingRate: Observed<number | null>;
  readonly persist: Observed<boolean>;
  readonly propagationPolicy: Observed<"authenticated" | "accept" | null>;
}
interface ObservabilitySettings {
  readonly enabled: Observed<boolean>;
  readonly headSamplingRate: Observed<number | null>;
  readonly redactQueryString: Observed<boolean>;
  readonly issues: Observed<{ readonly enabled: Observed<boolean> } | null>;
  readonly logs: Observed<LogSettings | null>;
  readonly traces: Observed<TraceSettings | null>;
}
interface ScriptSettings {
  readonly scriptName: string;
  readonly logpush: Observed<boolean>;
  readonly observability: Observed<ObservabilitySettings | null>;
  readonly subject: "configured-worker-script-settings";
  readonly effectiveCollection: "not-established";
}
interface UsageModel {
  readonly scriptName: string;
  readonly usageModel: Observed<"standard" | "bundled" | "unbound">;
  readonly userLimits: Observed<{ readonly cpuMs: Observed<number | null> } | null>;
  readonly subject: "configured-worker-usage-model";
  readonly effectiveLimits: "not-established";
  readonly planEntitlement: "not-established";
}
export interface ScriptSettingsScope {
  accountId: string;
  revision: string;
  observabilityScriptNames?: readonly string[];
  usageModelScriptNames?: readonly string[];
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}
function flag(value: unknown): Observed<boolean> {
  if (value === undefined) return "unavailable";
  requireThat(typeof value === "boolean", "upstream");
  return value;
}
function rate(value: unknown): Observed<number | null> {
  if (value === undefined) return "unavailable";
  if (value === null) return null;
  requireThat(typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1, "upstream");
  return value;
}
function nullable<T>(value: unknown, project: (row: Row) => T): Observed<T | null> {
  if (value === undefined) return "unavailable";
  if (value === null) return null;
  return project(object(value));
}
function propagation(value: unknown): Observed<"authenticated" | "accept" | null> {
  if (value === undefined) return "unavailable";
  requireThat(value === null || value === "authenticated" || value === "accept", "upstream");
  return value;
}

// Script and environment settings reference the same pinned response schema.
export function configuredScriptSettings(row: Row): Pick<ScriptSettings, "logpush" | "observability"> {
  return Object.freeze({ logpush: flag(row.logpush),
    observability: nullable(row.observability, value => Object.freeze({
      enabled: flag(value.enabled), headSamplingRate: rate(value.head_sampling_rate), redactQueryString: flag(value.redact_query_string),
      issues: nullable(value.issues, issues => Object.freeze({ enabled: flag(issues.enabled) })),
      logs: nullable(value.logs, logs => Object.freeze({ enabled: flag(logs.enabled), headSamplingRate: rate(logs.head_sampling_rate),
        invocationLogs: flag(logs.invocation_logs), persist: flag(logs.persist) })),
      traces: nullable(value.traces, traces => Object.freeze({ enabled: flag(traces.enabled), headSamplingRate: rate(traces.head_sampling_rate),
        persist: flag(traces.persist), propagationPolicy: propagation(traces.propagation_policy) })),
    })),
  });
}

export function scriptSettingsDescriptors(scope: ScriptSettingsScope): {
  scriptSettingsGet: MetadataDescriptor<ReturnType<typeof input.parse>, ScriptSettings>;
  usageModelGet: MetadataDescriptor<ReturnType<typeof input.parse>, UsageModel>;
} {
  const account = identifier.parse(scope.accountId);
  const revision = label.parse(scope.revision);
  function selections(names: readonly string[] | undefined): Set<string> {
    const values = names ?? [];
    requireThat(Array.isArray(values) && values.length <= 100, "cap");
    const allowed = new Set<string>();
    for (const value of values) {
      const name = script.parse(value);
      requireThat(!allowed.has(name), "schema");
      allowed.add(name);
    }
    return allowed;
  }
  const observabilityScripts = selections(scope.observabilityScriptNames);
  const usageModelScripts = selections(scope.usageModelScriptNames);
  function context(row: Row, scriptName: string): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.script_name === undefined || row.script_name === scriptName, "scope");
  }
  function descriptor<O>(name: string, suffix: string, providerOperationId: string, allowed: Set<string>,
    project: (row: Row, scriptName: string) => O): MetadataDescriptor<ReturnType<typeof input.parse>, O> {
    const prepared = new WeakSet<object>();
    return Object.freeze({ name, version: "1", tier: "read" as const, providerOperationId,
      prepare(raw: unknown) {
        const args = input.parse(raw);
        requireThat(allowed.has(args.scriptName), "scope");
        const value = Object.freeze({ arguments: args,
          resource: Object.freeze({ id: `cloudflare:account:${account}:worker:${args.scriptName}:${suffix}`, revision }),
          request: Object.freeze({ method: "GET" as const, path: `/accounts/${account}/workers/scripts/${args.scriptName}/${suffix}`,
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
        context(body, value.arguments.scriptName);
        requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
        const row = object(body.result);
        context(row, value.arguments.scriptName);
        return project(row, value.arguments.scriptName);
      },
    });
  }
  const scriptSettingsGet = descriptor<ScriptSettings>("cloudflare.workers.script_settings.get", "script-settings",
    "worker-script-settings-get-settings", observabilityScripts, (row, scriptName) => Object.freeze({
      scriptName, ...configuredScriptSettings(row),
      subject: "configured-worker-script-settings", effectiveCollection: "not-established",
    }));
  const usageModelGet = descriptor<UsageModel>("cloudflare.workers.usage_model.get", "usage-model",
    "worker-script-fetch-usage-model", usageModelScripts, (row, scriptName) => {
      const model = row.usage_model;
      requireThat(model === undefined || model === "standard" || model === "bundled" || model === "unbound", "upstream");
      return Object.freeze({ scriptName, usageModel: model === undefined ? "unavailable" : model,
        userLimits: nullable(row.user_limits, limits => {
          const cpu = limits.cpu_ms;
          requireThat(cpu === undefined || cpu === null || (typeof cpu === "number" && Number.isSafeInteger(cpu) && cpu >= 0), "upstream");
          return Object.freeze({ cpuMs: cpu === undefined ? "unavailable" : cpu });
        }), subject: "configured-worker-usage-model", effectiveLimits: "not-established", planEntitlement: "not-established" });
    });
  return Object.freeze({ scriptSettingsGet, usageModelGet });
}
