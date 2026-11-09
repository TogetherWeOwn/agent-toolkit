import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const input = closed({});
type Arguments = ReturnType<typeof input.parse>;
type Row = Record<string, unknown>;
export interface ArgoSettingsScope {
  accountId: string;
  zoneId: string;
  revision: string;
  smartRoutingReadAllowed?: boolean;
  tieredCachingReadAllowed?: boolean;
}
interface ArgoSettingResult {
  readonly configuredValue: "on" | "off";
  readonly subject: "configured-argo-smart-routing" | "configured-tiered-caching";
  readonly effectiveBehavior: "not-established";
  readonly performance: "not-established";
  readonly entitlements: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

export function argoSettingsDescriptors(scope: ArgoSettingsScope) {
  const account = identifier.parse(scope.accountId);
  const zone = identifier.parse(scope.zoneId);
  const revision = label.parse(scope.revision);
  for (const value of [scope.smartRoutingReadAllowed, scope.tieredCachingReadAllowed]) {
    requireThat(value === undefined || typeof value === "boolean", "schema");
  }
  const smartRoutingAllowed = scope.smartRoutingReadAllowed === true;
  const tieredCachingAllowed = scope.tieredCachingReadAllowed === true;
  function context(row: Row): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.zone_id === undefined || row.zone_id === zone, "scope");
  }
  function descriptor(name: string, providerOperationId: string, id: string, resource: string,
    subject: ArgoSettingResult["subject"], allowed: boolean): MetadataDescriptor<Arguments, ArgoSettingResult> {
    const prepared = new WeakSet<object>();
    return Object.freeze({ name, version: "1", tier: "read" as const, providerOperationId,
      prepare(raw: unknown) {
        const args = input.parse(raw);
        requireThat(allowed, "scope");
        const value = Object.freeze({ arguments: args,
          resource: Object.freeze({ id: `cloudflare:account:${account}:zone:${zone}:${resource}`, revision }),
          request: Object.freeze({ method: "GET" as const, path: `/zones/${zone}/argo/${id}`,
            maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
        prepared.add(value);
        return value;
      },
      project(raw: string, value: PreparedMetadata<Arguments>) {
        requireThat(prepared.has(value), "scope");
        requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
        const body = object(parsed);
        context(body);
        requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 &&
          Array.isArray(body.messages) && Object.hasOwn(body, "result"), "upstream");
        const row = object(body.result);
        context(row);
        requireThat(row.id === id && (row.value === "on" || row.value === "off") && typeof row.editable === "boolean", "upstream");
        return Object.freeze({ configuredValue: row.value as "on" | "off", subject,
          effectiveBehavior: "not-established" as const, performance: "not-established" as const,
          entitlements: "not-established" as const });
      },
    });
  }
  return Object.freeze({
    smartRoutingGet: descriptor("cloudflare.argo.smart_routing.get", "argo-smart-routing-get-argo-smart-routing-setting",
      "smart_routing", "argo-smart-routing", "configured-argo-smart-routing", smartRoutingAllowed),
    tieredCachingGet: descriptor("cloudflare.argo.tiered_caching.get", "tiered-caching-get-tiered-caching-setting",
      "tiered_caching", "argo-tiered-caching", "configured-tiered-caching", tieredCachingAllowed),
  });
}
