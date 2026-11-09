import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const bucketName = text(64, /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$(?![\s\S])/);
const hostname = text(253, /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$(?![\s\S])/);
const listInput = closed({ bucketName });
const getInput = closed({ bucketName, domain: hostname });
type Row = Record<string, unknown>;
export interface R2CustomDomainScope {
  accountId: string;
  revision: string;
  buckets?: readonly { bucketName: string; jurisdiction: "default" | "eu";
    domains: readonly { domain: string; zoneId: string }[] }[];
}
interface DomainMetadata {
  readonly domain: string;
  readonly zoneId: string;
  readonly enabled: boolean;
  readonly subject: "configured-r2-custom-domain";
  readonly effectivePrivacy: "not-established";
  readonly effectiveProtection: "not-established";
  readonly recoveryCustody: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}
function result(raw: string): unknown {
  requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
  const body = object(parsed);
  requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
  return body.result;
}

// Separate exact associations only. The managed-domain switch is not a grant
// for custom domains; even a filtered empty list cannot establish bucket privacy.
export function r2CustomDomainDescriptors(scope: R2CustomDomainScope) {
  const account = identifier.parse(scope.accountId);
  const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/).parse(scope.revision);
  const buckets = scope.buckets ?? [];
  requireThat(Array.isArray(buckets) && buckets.length <= 100, "cap");
  const allowed = new Map<string, { jurisdiction: "default" | "eu"; domains: Map<string, string> }>();
  for (const entry of buckets) {
    requireThat(entry !== null && typeof entry === "object", "schema");
    const name = bucketName.parse(entry.bucketName);
    requireThat(!allowed.has(name) && (entry.jurisdiction === "default" || entry.jurisdiction === "eu"), "schema");
    requireThat(Array.isArray(entry.domains) && entry.domains.length <= 100, "cap");
    const domains = new Map<string, string>();
    for (const domain of entry.domains) {
      requireThat(domain !== null && typeof domain === "object", "schema");
      const host = hostname.parse(domain.domain);
      requireThat(!domains.has(host), "schema");
      domains.set(host, identifier.parse(domain.zoneId));
    }
    allowed.set(name, { jurisdiction: entry.jurisdiction, domains });
  }
  function association(row: Row, name: string) {
    const expected = allowed.get(name)!;
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.bucket_name === undefined || row.bucket_name === name, "scope");
    requireThat(row.jurisdiction === undefined || row.jurisdiction === expected.jurisdiction, "scope");
  }
  function project(row: Row, name: string): DomainMetadata {
    association(row, name);
    const zone = typeof row.domain === "string" ? allowed.get(name)!.domains.get(row.domain) : undefined;
    requireThat(zone !== undefined && row.zoneId === zone, "scope");
    requireThat(typeof row.enabled === "boolean", "upstream");
    return Object.freeze({ domain: row.domain as string, zoneId: zone, enabled: row.enabled,
      subject: "configured-r2-custom-domain", effectivePrivacy: "not-established",
      effectiveProtection: "not-established", recoveryCustody: "not-established" });
  }
  function descriptor<A extends { bucketName: string }, O>(name: string, operation: string, parse: (raw: unknown) => A,
    suffix: (args: A) => string, resource: (args: A) => string, output: (value: unknown, args: A) => O): MetadataDescriptor<A, O> {
    const preparations = new WeakSet<object>();
    return Object.freeze({ name, version: "1", tier: "read", providerOperationId: operation,
      prepare(raw: unknown): PreparedMetadata<A> {
        const args = parse(raw);
        const expected = allowed.get(args.bucketName);
        requireThat(expected !== undefined && expected.domains.size > 0, "scope");
        const prepared = Object.freeze({ arguments: args,
          resource: Object.freeze({ id: `cloudflare:account:${account}:r2:jurisdiction:${expected.jurisdiction}:bucket:${args.bucketName}:custom-domains${resource(args)}`, revision }),
          request: Object.freeze({ method: "GET" as const, path: `/accounts/${account}/r2/buckets/${args.bucketName}/domains/custom${suffix(args)}`,
            ...(expected.jurisdiction === "eu" ? { r2Jurisdiction: "eu" as const } : {}),
            maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
        preparations.add(prepared);
        return prepared;
      },
      project(raw: string, prepared: PreparedMetadata<A>): O {
        requireThat(preparations.has(prepared), "scope");
        const value = output(result(raw), prepared.arguments);
        requireThat(Buffer.byteLength(JSON.stringify(value), "utf8") <= 32768, "cap");
        return value;
      },
    });
  }
  return Object.freeze({
    customDomainsList: descriptor("cloudflare.r2.custom_domains.list", "r2-list-custom-domains", raw => listInput.parse(raw),
      () => "", () => "", (value, args) => {
        const body = object(value);
        association(body, args.bucketName);
        requireThat(Array.isArray(body.domains) && body.domains.length <= 1000, "cap");
        const items: DomainMetadata[] = [];
        const seen = new Set<string>();
        for (const entry of body.domains) {
          const row = object(entry);
          const host = hostname.parse(row.domain);
          if (!allowed.get(args.bucketName)!.domains.has(host)) continue;
          requireThat(!seen.has(host), "scope");
          seen.add(host);
          items.push(project(row, args.bucketName));
        }
        return Object.freeze({ bucketName: args.bucketName, requestedJurisdiction: allowed.get(args.bucketName)!.jurisdiction,
          items: Object.freeze(items), complete: false as const, effectivePrivacy: "not-established" as const });
      }),
    customDomainGet: descriptor("cloudflare.r2.custom_domains.get", "r2-get-custom-domain-settings", raw => {
      const args = getInput.parse(raw);
      requireThat(allowed.get(args.bucketName)?.domains.has(args.domain), "scope");
      return args;
    }, args => `/${args.domain}`, args => `:domain:${args.domain}:zone:${allowed.get(args.bucketName)!.domains.get(args.domain)}`,
    (value, args) => {
      const row = object(value);
      requireThat(row.domain === args.domain, "scope");
      return Object.freeze({ bucketName: args.bucketName, requestedJurisdiction: allowed.get(args.bucketName)!.jurisdiction,
        ...project(row, args.bucketName) });
    }),
  });
}
