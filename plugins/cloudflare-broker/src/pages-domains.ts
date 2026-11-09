import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const projectName = text(63, /^[a-z0-9][a-z0-9-]*$(?![\s\S])/);
const hostname = text(253, /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,20}$(?![\s\S])/);
const listInput = closed({ projectName });
const getInput = closed({ projectName, domainName: hostname });
type Row = Record<string, unknown>;
type Domain = Readonly<{ id: string; domainId: string; domainName: string; zoneId: string }>;
type Status = "initializing" | "pending" | "active" | "deactivated" | "blocked" | "error";
type DomainMetadata = Domain & Readonly<{ status: Status }>;
export interface PagesDomainScope {
  accountId: string;
  revision: string;
  projects?: readonly { projectName: string; domains: readonly Domain[] }[];
}
interface DomainList {
  readonly projectName: string;
  readonly items: readonly DomainMetadata[];
  readonly subject: "configured-pages-domains";
  readonly complete: false;
  readonly effectiveRouting: "not-established";
  readonly effectiveProtection: "not-established";
}
interface DomainDetail {
  readonly projectName: string;
  readonly domain: DomainMetadata;
  readonly subject: "configured-pages-domain";
  readonly effectiveRouting: "not-established";
  readonly effectiveProtection: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

export function pagesDomainDescriptors(scope: PagesDomainScope): {
  domainsList: MetadataDescriptor<ReturnType<typeof listInput.parse>, DomainList>;
  domainGet: MetadataDescriptor<ReturnType<typeof getInput.parse>, DomainDetail>;
} {
  const account = identifier.parse(scope.accountId);
  const revision = label.parse(scope.revision);
  const projects = scope.projects ?? [];
  requireThat(Array.isArray(projects) && projects.length <= 100, "cap");
  const allowed = new Map<string, Map<string, Domain>>();
  for (const project of projects) {
    requireThat(project !== null && typeof project === "object", "schema");
    const name = projectName.parse(project.projectName);
    requireThat(!allowed.has(name), "schema");
    requireThat(Array.isArray(project.domains) && project.domains.length <= 100, "cap");
    const domains = new Map<string, Domain>();
    const ids = new Set<string>();
    const domainIds = new Set<string>();
    for (const domain of project.domains) {
      requireThat(domain !== null && typeof domain === "object", "schema");
      const value = Object.freeze({ id: label.parse(domain.id), domainId: label.parse(domain.domainId),
        domainName: hostname.parse(domain.domainName), zoneId: identifier.parse(domain.zoneId) });
      requireThat(!domains.has(value.domainName) && !ids.has(value.id) && !domainIds.has(value.domainId), "schema");
      domains.set(value.domainName, value);
      ids.add(value.id);
      domainIds.add(value.domainId);
    }
    allowed.set(name, domains);
  }
  function selections(name: string): Map<string, Domain> {
    const result = allowed.get(name);
    requireThat(result !== undefined && result.size > 0, "scope");
    return result;
  }
  function context(row: Row, name: string): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.project_name === undefined || row.project_name === name, "scope");
  }
  function domain(row: Row, name: string, expected: Domain): DomainMetadata {
    context(row, name);
    requireThat(row.name === expected.domainName && row.id === expected.id && row.domain_id === expected.domainId && row.zone_tag === expected.zoneId, "scope");
    const status = row.status;
    requireThat(status === "initializing" || status === "pending" || status === "active" || status === "deactivated" || status === "blocked" || status === "error", "upstream");
    return Object.freeze({ ...expected, status });
  }
  const prepared = new WeakMap<object, boolean>();
  function prepare<A extends { projectName: string }>(args: A, domainName?: string): PreparedMetadata<A> {
    const selected = selections(args.projectName);
    requireThat(domainName === undefined || selected.has(domainName), "scope");
    const value = Object.freeze({ arguments: args,
      resource: Object.freeze({ id: `cloudflare:account:${account}:pages:${args.projectName}:domains${domainName === undefined ? "" : `:${domainName}`}`, revision }),
      request: Object.freeze({ method: "GET" as const,
        path: `/accounts/${account}/pages/projects/${args.projectName}/domains${domainName === undefined ? "" : `/${domainName}`}`,
        maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
    prepared.set(value, domainName !== undefined);
    return value;
  }
  function result(raw: string, value: PreparedMetadata<{ projectName: string }>, detail = false): unknown {
    requireThat(prepared.get(value) === detail, "scope");
    requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
    const body = object(parsed);
    context(body, value.arguments.projectName);
    requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
    return body.result;
  }
  function bounded<T>(value: T): T {
    requireThat(Buffer.byteLength(JSON.stringify(value), "utf8") <= 32768, "cap");
    return Object.freeze(value);
  }
  const domainsList: MetadataDescriptor<ReturnType<typeof listInput.parse>, DomainList> = Object.freeze({
    name: "cloudflare.pages.domains.list", version: "1", tier: "read", providerOperationId: "pages-domains-get-domains",
    prepare(raw: unknown) { return prepare(listInput.parse(raw)); },
    project(raw: string, value: PreparedMetadata<ReturnType<typeof listInput.parse>>) {
      const rows = result(raw, value);
      requireThat(Array.isArray(rows) && rows.length <= 1000, "cap");
      const name = value.arguments.projectName;
      const selected = selections(name);
      const seen = new Set<string>();
      const items: DomainMetadata[] = [];
      for (const rawRow of rows) {
        const row = object(rawRow);
        context(row, name);
        requireThat(typeof row.name === "string", "upstream");
        const expected = selected.get(row.name);
        if (expected === undefined) continue;
        requireThat(!seen.has(expected.domainName), "upstream");
        seen.add(expected.domainName);
        items.push(domain(row, name, expected));
      }
      return bounded({ projectName: name, items: Object.freeze(items), subject: "configured-pages-domains" as const,
        complete: false as const, effectiveRouting: "not-established" as const, effectiveProtection: "not-established" as const });
    },
  });
  const domainGet: MetadataDescriptor<ReturnType<typeof getInput.parse>, DomainDetail> = Object.freeze({
    name: "cloudflare.pages.domains.get", version: "1", tier: "read", providerOperationId: "pages-domains-get-domain",
    prepare(raw: unknown) { const args = getInput.parse(raw); return prepare(args, args.domainName); },
    project(raw: string, value: PreparedMetadata<ReturnType<typeof getInput.parse>>) {
      const row = object(result(raw, value, true));
      const { projectName: name, domainName } = getInput.parse(value.arguments);
      const expected = selections(name).get(domainName);
      requireThat(expected !== undefined, "scope");
      return bounded({ projectName: name, domain: domain(row, name, expected), subject: "configured-pages-domain" as const,
        effectiveRouting: "not-established" as const, effectiveProtection: "not-established" as const });
    },
  });
  return Object.freeze({ domainsList, domainGet });
}
