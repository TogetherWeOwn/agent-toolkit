import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const subdomain = text(63, /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$(?![\s\S])/);
const input = closed({});
type Args = ReturnType<typeof input.parse>;
type Row = Record<string, unknown>;
export interface WorkerAccountScope {
  accountId: string;
  revision: string;
  settingsReadAllowed?: boolean;
  expectedSubdomain?: string;
}
interface AccountSettings {
  readonly subject: "configured-workers-account-settings";
  readonly defaultUsageModel: string;
  readonly greenCompute: boolean | "unavailable";
  readonly effectivePlanAndLimits: "not-established";
}
interface AccountSubdomain {
  readonly subject: "configured-workers-account-subdomain";
  readonly subdomain: string;
  readonly effectiveReachability: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

export function workerAccountDescriptors(scope: WorkerAccountScope) {
  const account = identifier.parse(scope.accountId);
  const revision = label.parse(scope.revision);
  requireThat(scope.settingsReadAllowed === undefined || typeof scope.settingsReadAllowed === "boolean", "schema");
  const settingsAllowed = scope.settingsReadAllowed === true;
  const expected = scope.expectedSubdomain === undefined ? undefined : subdomain.parse(scope.expectedSubdomain);
  function context(row: Row): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
  }
  function descriptor<O>(name: string, operation: string, suffix: string, allowed: boolean,
    project: (row: Row) => O): MetadataDescriptor<Args, O> {
    const prepared = new WeakSet<object>();
    return Object.freeze({ name, version: "1", tier: "read" as const, providerOperationId: operation,
      prepare(raw: unknown) {
        const args = input.parse(raw);
        requireThat(allowed, "scope");
        const value = Object.freeze({ arguments: args,
          resource: Object.freeze({ id: `cloudflare:account:${account}:workers:${suffix}`, revision }),
          request: Object.freeze({ method: "GET" as const, path: `/accounts/${account}/workers/${suffix}`,
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
        context(body);
        requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
        const result = object(body.result);
        context(result);
        return Object.freeze(project(result));
      },
    });
  }
  const accountSettingsGet = descriptor<AccountSettings>("cloudflare.workers.account_settings.get",
    "worker-account-settings-fetch-worker-account-settings", "account-settings", settingsAllowed, row => {
      // The pinned schema declares a string, not a closed usage-model enum.
      const usage = row.default_usage_model === undefined ? "unavailable" : label.parse(row.default_usage_model);
      requireThat(row.green_compute === undefined || typeof row.green_compute === "boolean", "upstream");
      return { subject: "configured-workers-account-settings", defaultUsageModel: usage,
        greenCompute: row.green_compute === undefined ? "unavailable" : row.green_compute as boolean,
        effectivePlanAndLimits: "not-established" };
    });
  const accountSubdomainGet = descriptor<AccountSubdomain>("cloudflare.workers.account_subdomain.get",
    "worker-subdomain-get-subdomain", "subdomain", expected !== undefined, row => {
      requireThat(typeof row.subdomain === "string" && row.subdomain === expected, "scope");
      return { subject: "configured-workers-account-subdomain", subdomain: row.subdomain,
        effectiveReachability: "not-established" };
    });
  return Object.freeze({ accountSettingsGet, accountSubdomainGet });
}
