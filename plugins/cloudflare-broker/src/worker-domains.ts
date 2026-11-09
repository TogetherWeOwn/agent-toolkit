import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const workerName = text(128, /^[A-Za-z0-9][A-Za-z0-9_-]*$(?![\s\S])/);
const environmentName = text(128, /^[A-Za-z0-9][A-Za-z0-9_-]*$(?![\s\S])/);
const hostname = text(253, /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$(?![\s\S])/);
const empty = closed({});
const domain = closed({ domainId: identifier });
type Row = Record<string, unknown>;
export interface WorkerDomainScope {
  accountId: string;
  revision: string;
  domains?: readonly { domainId: string; zoneId: string; hostname: string; scriptName: string; environment: string }[];
}
interface DomainMetadata {
  id: string;
  zoneId: string;
  hostname: string;
  scriptName: string;
  environment: string;
  subject: "configured-worker-domain";
  enabled: boolean;
  previewsEnabled: boolean;
  effectiveRouting: "not-established";
  effectiveProtection: "not-established";
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

// Independent exact associations only. Neither Worker nor zone visibility grants
// domain visibility, and configured routing flags are not reachability evidence.
export function workerDomainMetadataDescriptors(scope: WorkerDomainScope) {
  const account = identifier.parse(scope.accountId);
  const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/).parse(scope.revision);
  const domains = scope.domains ?? [];
  requireThat(Array.isArray(domains) && domains.length <= 100, "cap");
  const allowed = new Map<string, Readonly<{ zoneId: string; hostname: string; scriptName: string; environment: string }>>();
  const hosts = new Set<string>();
  for (const entry of domains) {
    requireThat(entry !== null && typeof entry === "object", "schema");
    const id = identifier.parse(entry.domainId);
    const host = hostname.parse(entry.hostname);
    requireThat(!allowed.has(id) && !hosts.has(host), "schema");
    hosts.add(host);
    allowed.set(id, Object.freeze({ zoneId: identifier.parse(entry.zoneId), hostname: host,
      scriptName: workerName.parse(entry.scriptName), environment: environmentName.parse(entry.environment) }));
  }
  function project(row: Row): DomainMetadata {
    const expected = typeof row.id === "string" ? allowed.get(row.id) : undefined;
    requireThat(expected !== undefined, "scope");
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.zone_id === expected.zoneId && row.hostname === expected.hostname &&
      row.service === expected.scriptName && row.environment === expected.environment, "scope");
    requireThat(typeof row.enabled === "boolean" && typeof row.previews_enabled === "boolean", "upstream");
    return Object.freeze({ id: row.id as string, ...expected, subject: "configured-worker-domain",
      enabled: row.enabled, previewsEnabled: row.previews_enabled,
      effectiveRouting: "not-established", effectiveProtection: "not-established" });
  }
  function descriptor<A, O>(name: string, operation: string, parse: (raw: unknown) => A,
    suffix: (args: A) => string, resource: (args: A) => string,
    output: (value: unknown, args: A) => O): MetadataDescriptor<A, O> {
    const preparations = new WeakSet<object>();
    return Object.freeze({ name, version: "1", tier: "read", providerOperationId: operation,
      prepare(raw: unknown): PreparedMetadata<A> {
        const args = parse(raw);
        requireThat(allowed.size > 0, "scope");
        const prepared = Object.freeze({ arguments: args,
          resource: Object.freeze({ id: `cloudflare:account:${account}:worker-domains${resource(args)}`, revision }),
          request: Object.freeze({ method: "GET" as const, path: `/accounts/${account}/workers/domains${suffix(args)}`,
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
    workerDomainsList: descriptor("cloudflare.workers.domains.list", "workers.domains.list", raw => empty.parse(raw),
      () => "", () => "", value => {
        requireThat(Array.isArray(value) && value.length <= 100, "cap");
        const items: DomainMetadata[] = [];
        const seen = new Set<string>();
        for (const entry of value) {
          const row = object(entry);
          requireThat(typeof row.id === "string", "upstream");
          if (!allowed.has(row.id)) continue;
          requireThat(!seen.has(row.id), "upstream");
          seen.add(row.id);
          items.push(project(row));
        }
        return Object.freeze({ items: Object.freeze(items), complete: false as const });
      }),
    workerDomainGet: descriptor("cloudflare.workers.domains.get", "workers.domains.get", raw => {
      const args = domain.parse(raw);
      requireThat(allowed.has(args.domainId), "scope");
      return args;
    }, args => `/${args.domainId}`, args => `:${args.domainId}`, (value, args) => {
      const row = object(value);
      requireThat(row.id === args.domainId, "scope");
      return project(row);
    }),
  });
}
