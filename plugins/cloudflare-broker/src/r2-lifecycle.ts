import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const bucketName = text(64, /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$(?![\s\S])/);
const prefix = text(256, /^[A-Za-z0-9._/-]*$(?![\s\S])/);
const input = closed({ bucketName });
type Row = Record<string, unknown>;
type Condition = Readonly<{ type: "Age"; maxAge: number }> | Readonly<{ type: "Date"; date: string }>;
interface Unavailable { readonly status: "unavailable"; readonly reason: "not-returned" }
interface LifecycleRule {
  readonly prefix: string;
  readonly enabled: boolean;
  readonly deleteObjects: Condition | Unavailable;
  readonly abortMultipartUploads: Condition | Unavailable;
  readonly storageClassTransitions: readonly Readonly<{ condition: Condition; storageClass: "InfrequentAccess" }>[] | Unavailable;
}
interface LifecycleMetadata {
  readonly bucketName: string;
  readonly requestedJurisdiction: "default" | "eu";
  readonly rules: readonly LifecycleRule[];
  readonly subject: "configured-prefix-lifecycle";
  readonly complete: false;
  readonly effectiveDeletion: "not-established";
  readonly recoveryCustody: "not-established";
}
export interface R2LifecycleScope {
  accountId: string;
  revision: string;
  buckets?: readonly { bucketName: string; jurisdiction: "default" | "eu"; prefixes: readonly string[] }[];
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}
function condition(value: unknown, ageOnly = false): Condition {
  const row = object(value);
  if (row.type === "Age") {
    requireThat(Object.keys(row).length === 2 && Number.isSafeInteger(row.maxAge) && (row.maxAge as number) >= 0, "upstream");
    return Object.freeze({ type: "Age", maxAge: row.maxAge as number });
  }
  requireThat(!ageOnly && row.type === "Date" && Object.keys(row).length === 2 && typeof row.date === "string" &&
    /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z$(?![\s\S])/.test(row.date), "upstream");
  const stamp = row.date as string;
  const seconds = stamp.slice(0, 19);
  const parsed = Date.parse(`${seconds}Z`);
  requireThat(Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === seconds, "upstream");
  return Object.freeze({ type: "Date", date: stamp });
}
const unavailable: Unavailable = Object.freeze({ status: "unavailable", reason: "not-returned" });
function transition(value: unknown, ageOnly = false): Condition | Unavailable {
  return value === undefined ? unavailable : condition(object(value).condition, ageOnly);
}

// Configured prefix transitions only, never object inspection or evidence that
// lifecycle deletion or lock precedence is enforced by the provider.
export function r2LifecycleDescriptor(scope: R2LifecycleScope): MetadataDescriptor<ReturnType<typeof input.parse>, LifecycleMetadata> {
  const account = identifier.parse(scope.accountId);
  const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/).parse(scope.revision);
  const buckets = scope.buckets ?? [];
  requireThat(Array.isArray(buckets) && buckets.length <= 100, "cap");
  const allowed = new Map<string, { jurisdiction: "default" | "eu"; prefixes: Set<string> }>();
  for (const entry of buckets) {
    requireThat(entry !== null && typeof entry === "object", "schema");
    const name = bucketName.parse(entry.bucketName);
    requireThat(!allowed.has(name) && (entry.jurisdiction === "default" || entry.jurisdiction === "eu"), "schema");
    requireThat(Array.isArray(entry.prefixes) && entry.prefixes.length <= 100, "cap");
    const prefixes = new Set<string>(entry.prefixes.map((value: unknown) => value === "" ? "" : prefix.parse(value)));
    requireThat(prefixes.size === entry.prefixes.length, "schema");
    allowed.set(name, { jurisdiction: entry.jurisdiction, prefixes });
  }
  const preparations = new WeakSet<object>();
  return Object.freeze({ name: "cloudflare.r2.lifecycle.get", version: "1", tier: "read",
    providerOperationId: "r2-get-bucket-lifecycle-configuration",
    prepare(raw: unknown) {
      const args = input.parse(raw);
      const expected = allowed.get(args.bucketName);
      requireThat(expected !== undefined && expected.prefixes.size > 0, "scope");
      const prepared = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:r2:jurisdiction:${expected.jurisdiction}:bucket:${args.bucketName}:lifecycle`, revision }),
        request: Object.freeze({ method: "GET" as const, path: `/accounts/${account}/r2/buckets/${args.bucketName}/lifecycle`,
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
      requireThat(Array.isArray(result.rules) && result.rules.length <= 100, "cap");
      const rules: LifecycleRule[] = [];
      const seen = new Set<string>();
      for (const value of result.rules) {
        const row = object(value);
        const conditions = object(row.conditions);
        requireThat(typeof conditions.prefix === "string", "upstream");
        if (!expected.prefixes.has(conditions.prefix)) continue;
        requireThat(typeof row.id === "string" && row.id.length > 0 && row.id.length <= 256 && !seen.has(row.id), "upstream");
        seen.add(row.id);
        requireThat(typeof row.enabled === "boolean", "upstream");
        let storage: LifecycleRule["storageClassTransitions"] = unavailable;
        if (row.storageClassTransitions !== undefined) {
          requireThat(Array.isArray(row.storageClassTransitions) && row.storageClassTransitions.length <= 10, "cap");
          storage = Object.freeze(row.storageClassTransitions.map(value => {
            const entry = object(value);
            requireThat(entry.storageClass === "InfrequentAccess", "upstream");
            return Object.freeze({ condition: condition(entry.condition), storageClass: "InfrequentAccess" as const });
          }));
        }
        rules.push(Object.freeze({ prefix: conditions.prefix, enabled: row.enabled,
          deleteObjects: transition(row.deleteObjectsTransition),
          abortMultipartUploads: transition(row.abortMultipartUploadsTransition, true), storageClassTransitions: storage }));
      }
      const output: LifecycleMetadata = Object.freeze({ bucketName: prepared.arguments.bucketName, requestedJurisdiction: expected.jurisdiction,
        rules: Object.freeze(rules), subject: "configured-prefix-lifecycle", complete: false,
        effectiveDeletion: "not-established", recoveryCustody: "not-established" });
      requireThat(Buffer.byteLength(JSON.stringify(output), "utf8") <= 32768, "cap");
      return output;
    },
  });
}
