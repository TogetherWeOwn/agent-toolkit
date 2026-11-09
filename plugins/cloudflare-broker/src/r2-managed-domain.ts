import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const bucketName = text(64, /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$(?![\s\S])/);
const input = closed({ bucketName });
type Row = Record<string, unknown>;
export interface R2ManagedDomainScope {
  accountId: string;
  revision: string;
  buckets?: readonly { bucketName: string; bucketId: string; jurisdiction: "default" | "eu" }[];
}
interface ManagedDomainMetadata {
  readonly bucketName: string;
  readonly bucketId: string;
  readonly requestedJurisdiction: "default" | "eu";
  readonly enabled: boolean;
  readonly subject: "configured-r2-dev-access";
  readonly customDomainAccess: "not-established";
  readonly effectivePrivacy: "not-established";
  readonly recoveryCustody: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

// The r2.dev switch does not control custom domains or prove effective privacy.
export function r2ManagedDomainDescriptor(scope: R2ManagedDomainScope): MetadataDescriptor<ReturnType<typeof input.parse>, ManagedDomainMetadata> {
  const account = identifier.parse(scope.accountId);
  const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/).parse(scope.revision);
  const buckets = scope.buckets ?? [];
  requireThat(Array.isArray(buckets) && buckets.length <= 100, "cap");
  const allowed = new Map<string, { bucketId: string; jurisdiction: "default" | "eu" }>();
  const ids = new Set<string>();
  for (const entry of buckets) {
    requireThat(entry !== null && typeof entry === "object", "schema");
    const name = bucketName.parse(entry.bucketName);
    const id = identifier.parse(entry.bucketId);
    requireThat(!allowed.has(name) && !ids.has(id) && (entry.jurisdiction === "default" || entry.jurisdiction === "eu"), "schema");
    allowed.set(name, { bucketId: id, jurisdiction: entry.jurisdiction });
    ids.add(id);
  }
  const preparations = new WeakSet<object>();
  return Object.freeze({ name: "cloudflare.r2.managed_domain.get", version: "1", tier: "read",
    providerOperationId: "r2-get-bucket-public-policy",
    prepare(raw: unknown) {
      const args = input.parse(raw);
      const expected = allowed.get(args.bucketName);
      requireThat(expected !== undefined, "scope");
      const prepared = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:r2:jurisdiction:${expected.jurisdiction}:bucket:${args.bucketName}:id:${expected.bucketId}:managed-domain`, revision }),
        request: Object.freeze({ method: "GET" as const, path: `/accounts/${account}/r2/buckets/${args.bucketName}/domains/managed`,
          ...(expected.jurisdiction === "eu" ? { r2Jurisdiction: "eu" as const } : {}),
          maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
      preparations.add(prepared);
      return prepared;
    },
    project(raw: string, prepared: PreparedMetadata<ReturnType<typeof input.parse>>) {
      requireThat(preparations.has(prepared), "scope");
      requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
      const body = object(parsed);
      requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
      const result = object(body.result);
      const expected = allowed.get(prepared.arguments.bucketName)!;
      requireThat(result.bucketId === expected.bucketId, "scope");
      requireThat(result.account_id === undefined || result.account_id === account, "scope");
      requireThat(result.bucket_name === undefined || result.bucket_name === prepared.arguments.bucketName, "scope");
      requireThat(result.jurisdiction === undefined || result.jurisdiction === expected.jurisdiction, "scope");
      requireThat(typeof result.enabled === "boolean", "upstream");
      return Object.freeze({ bucketName: prepared.arguments.bucketName, bucketId: expected.bucketId,
        requestedJurisdiction: expected.jurisdiction, enabled: result.enabled, subject: "configured-r2-dev-access" as const,
        customDomainAccess: "not-established" as const, effectivePrivacy: "not-established" as const, recoveryCustody: "not-established" as const });
    },
  });
}
