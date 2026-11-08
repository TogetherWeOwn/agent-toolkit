import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const bucketName = text(64, /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$(?![\s\S])/);
const input = closed({ bucketName });
const methods = new Set(["GET", "PUT", "POST", "DELETE", "HEAD"]);
type Row = Record<string, unknown>;
export interface R2CorsScope {
  accountId: string;
  revision: string;
  buckets?: readonly { bucketName: string; jurisdiction: "default" | "eu"; origins: readonly string[] }[];
}
interface CorsMetadata {
  readonly bucketName: string;
  readonly requestedJurisdiction: "default" | "eu";
  readonly rules: readonly { readonly origins: readonly string[]; readonly methods: readonly string[]; readonly maxAgeSeconds: number | "unavailable" }[];
  readonly subject: "configured-selected-cors";
  readonly complete: false;
  readonly effectiveAccess: "not-established";
  readonly effectivePrivacy: "not-established";
  readonly recoveryCustody: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}
function origin(value: unknown): string {
  const result = text(2048, /^[\x21-\x7e]+$(?![\s\S])/).parse(value);
  if (result === "*") return result;
  let url: URL;
  try { url = new URL(result); } catch { requireThat(false, "schema"); }
  requireThat((url.protocol === "https:" || url.protocol === "http:") && url.origin === result && !url.hostname.includes("*"), "schema");
  return result;
}

// CORS config is browser behavior, not object authorization or a privacy boundary.
export function r2CorsDescriptor(scope: R2CorsScope): MetadataDescriptor<ReturnType<typeof input.parse>, CorsMetadata> {
  const account = identifier.parse(scope.accountId);
  const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/).parse(scope.revision);
  const buckets = scope.buckets ?? [];
  requireThat(Array.isArray(buckets) && buckets.length <= 100, "cap");
  const allowed = new Map<string, { jurisdiction: "default" | "eu"; origins: Set<string> }>();
  for (const entry of buckets) {
    requireThat(entry !== null && typeof entry === "object", "schema");
    const name = bucketName.parse(entry.bucketName);
    requireThat(!allowed.has(name) && (entry.jurisdiction === "default" || entry.jurisdiction === "eu"), "schema");
    requireThat(Array.isArray(entry.origins) && entry.origins.length <= 100, "cap");
    const origins = new Set<string>(entry.origins.map((value: string) => origin(value)));
    requireThat(origins.size === entry.origins.length, "schema");
    allowed.set(name, { jurisdiction: entry.jurisdiction, origins });
  }
  const preparations = new WeakSet<object>();
  return Object.freeze({ name: "cloudflare.r2.cors.get", version: "1", tier: "read",
    providerOperationId: "r2-get-bucket-cors-policy",
    prepare(raw: unknown) {
      const args = input.parse(raw);
      const expected = allowed.get(args.bucketName);
      requireThat(expected !== undefined && expected.origins.size > 0, "scope");
      const prepared = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:r2:jurisdiction:${expected.jurisdiction}:bucket:${args.bucketName}:cors`, revision }),
        request: Object.freeze({ method: "GET" as const, path: `/accounts/${account}/r2/buckets/${args.bucketName}/cors`,
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
      requireThat(result.account_id === undefined || result.account_id === account, "scope");
      requireThat(result.bucket_name === undefined || result.bucket_name === prepared.arguments.bucketName, "scope");
      requireThat(result.jurisdiction === undefined || result.jurisdiction === expected.jurisdiction, "scope");
      requireThat(Array.isArray(result.rules) && result.rules.length <= 1000, "cap");
      const rules: CorsMetadata["rules"][number][] = [];
      for (const value of result.rules) {
        const rule = object(value);
        const config = object(rule.allowed);
        requireThat(Array.isArray(config.origins) && config.origins.length > 0 && config.origins.length <= 100, "cap");
        const origins = config.origins.map((value: unknown) => origin(value));
        requireThat(new Set(origins).size === origins.length, "upstream");
        const selected = origins.filter((value: string) => expected.origins.has(value));
        if (selected.length === 0) continue;
        requireThat(Array.isArray(config.methods) && config.methods.length > 0 && config.methods.length <= 5, "upstream");
        const selectedMethods: string[] = [];
        for (const method of config.methods) {
          requireThat(typeof method === "string" && methods.has(method) && !selectedMethods.includes(method), "upstream");
          selectedMethods.push(method);
        }
        requireThat(rule.maxAgeSeconds === undefined || (Number.isSafeInteger(rule.maxAgeSeconds) &&
          (rule.maxAgeSeconds as number) >= 0 && (rule.maxAgeSeconds as number) <= 86400), "upstream");
        rules.push(Object.freeze({ origins: Object.freeze(selected), methods: Object.freeze(selectedMethods),
          maxAgeSeconds: rule.maxAgeSeconds === undefined ? "unavailable" : rule.maxAgeSeconds as number }));
      }
      const output: CorsMetadata = Object.freeze({ bucketName: prepared.arguments.bucketName, requestedJurisdiction: expected.jurisdiction,
        rules: Object.freeze(rules), subject: "configured-selected-cors", complete: false,
        effectiveAccess: "not-established", effectivePrivacy: "not-established", recoveryCustody: "not-established" });
      requireThat(Buffer.byteLength(JSON.stringify(output), "utf8") <= 32768, "cap");
      return output;
    },
  });
}
