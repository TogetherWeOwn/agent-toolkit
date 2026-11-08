import { closed, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS, MAX_PAGES } from "./metadata.js";
import { check, field, optional, rows } from "./projection.js";
import { PAGE_SIZE, type NeonMetadataTransport } from "./transport.js";

export const BRANCH_RESOURCE_OPERATIONS = ["listProjectBranchBuckets", "listProjectBranchCustomDomains"] as const;
type BranchResourceOperation = typeof BRANCH_RESOURCE_OPERATIONS[number];
export const MAX_BRANCH_RESOURCE_BINDINGS = 12;
export interface NeonBranchResourceScope {
  readonly projectId: string;
  readonly revision: string;
  readonly branchIds: readonly string[];
  readonly buckets: readonly { readonly name: string; readonly branchId: string }[];
  readonly domains: readonly { readonly domain: string; readonly branchId: string; readonly functionSlug: string }[];
}
const pathId = text(60, /^[a-z0-9-]+$/);
const bucketName = text(255, /^[a-z0-9][a-z0-9._-]*$/);
const hostname = { parse(value: unknown): string {
  const result = text(253, /^[a-z0-9.-]+$/).parse(value);
  check(result.includes(".") && result.split(".").every(label => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)));
  return result;
} };
const slug = text(20, /^[a-z0-9]+$/);
const branchArguments = closed({ project_id: pathId, branch_id: pathId });
const accessLevel = oneOf(["private", "public_read"] as const);
const suffix = (name: BranchResourceOperation) => name === "listProjectBranchBuckets" ? "buckets" : "custom-domains";

export function createNeonBranchResourceOperations(scope: NeonBranchResourceScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, revision: text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/),
    branchIds: { parse: (v: unknown) => rows(v, MAX_BRANCH_RESOURCE_BINDINGS).map(value => pathId.parse(value)) },
    buckets: { parse: (v: unknown) => rows(v, MAX_BRANCH_RESOURCE_BINDINGS).map(value => closed({ name: bucketName, branchId: pathId }).parse(value)) },
    domains: { parse: (v: unknown) => rows(v, MAX_BRANCH_RESOURCE_BINDINGS).map(value => closed({ domain: hostname, branchId: pathId, functionSlug: slug }).parse(value)) },
  }).parse(scope);
  const branches = new Set(config.branchIds);
  const key = (branch: string, value: string) => `${branch}/${value}`;
  const buckets = new Set(config.buckets.map(value => key(value.branchId, value.name)));
  const domains = new Map(config.domains.map(value => [key(value.branchId, value.domain), value]));
  check(branches.size === config.branchIds.length && buckets.size === config.buckets.length && domains.size === config.domains.length);
  check([...config.buckets, ...config.domains].every(value => branches.has(value.branchId)));

  function parse(raw: unknown) {
    const args = branchArguments.parse(raw);
    if (args.project_id !== config.projectId || !branches.has(args.branch_id)) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepareFor(name: BranchResourceOperation, raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/projects/${config.projectId}/branches/${args.branch_id}/${suffix(name)}`, revision: config.revision },
      arguments: args, plan: { operation: name, ...args }, artifactDigest: null };
  }
  function identity(raw: unknown, branchId: string): void {
    const project = optional(raw, "project_id");
    const branch = optional(raw, "branch_id");
    check(project === undefined || project === config.projectId);
    check(branch === undefined || branch === branchId);
  }
  function projectFor(name: BranchResourceOperation, raw: unknown): Json {
    const branchId = pathId.parse(field(raw, "branch_id"));
    check(branches.has(branchId));
    identity(raw, branchId);
    check(optional(raw, "pagination") === undefined);
    const seen = new Set<string>();
    if (name === "listProjectBranchBuckets") {
      const selected = rows(field(raw, "buckets"), MAX_ITEMS).flatMap(value => {
        identity(value, branchId);
        check(optional(value, "pagination") === undefined);
        const name = text(255, /^[\x20-\x7e]+$/).parse(field(value, "name"));
        check(!seen.has(name));
        seen.add(name);
        return buckets.has(key(branchId, name)) ? [{ name: bucketName.parse(name), access_level: accessLevel.parse(field(value, "access_level")) }] : [];
      });
      return { buckets: selected };
    }
    const selected = rows(field(raw, "custom_domains"), MAX_ITEMS).flatMap(value => {
      identity(value, branchId);
      check(optional(value, "pagination") === undefined);
      const domain = hostname.parse(field(value, "domain"));
      check(!seen.has(domain));
      seen.add(domain);
      const binding = domains.get(key(branchId, domain));
      if (!binding) return [];
      check(field(value, "entity_type") === "function" && field(value, "entity_id") === binding.functionSlug);
      const status = optional(value, "status");
      // The provider explicitly allows future status strings; never echo them.
      const known = status === undefined ? undefined : text(80, /^[\x20-\x7e]+$/).parse(status);
      return [{ domain, entity_type: "function", entity_id: binding.functionSlug,
        ...(known === undefined ? {} : { status: ["pending", "active", "error"].includes(known) ? known : "unknown" }) }];
    });
    return { custom_domains: selected };
  }
  return Object.freeze(BRANCH_RESOURCE_OPERATIONS.map(name => Object.freeze({
    name: `neon.${name}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare(raw: unknown): Prepared { return prepareFor(name, raw); },
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepareFor(name, args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const options = { credential, signal };
      if (name === "listProjectBranchBuckets") {
        const raw = await transport.listProjectBranchBuckets(config.projectId, args.branch_id, options);
        identity(raw, args.branch_id);
        check(optional(raw, "pagination") === undefined);
        const value = { branch_id: args.branch_id, buckets: field(raw, "buckets") };
        projectFor(name, value);
        return value;
      }
      const result: unknown[] = [];
      const cursors = new Set<string>();
      let cursor: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const raw = await transport.listProjectBranchCustomDomains(config.projectId, args.branch_id, cursor, options);
        identity(raw, args.branch_id);
        result.push(...rows(field(raw, "custom_domains"), PAGE_SIZE));
        // Validate each prefix before another request, including duplicate/ancestry checks.
        const value = { branch_id: args.branch_id, custom_domains: result };
        projectFor(name, value);
        const pagination = optional(raw, "pagination");
        const next = pagination === undefined ? undefined : optional(pagination, "next");
        if (pagination !== undefined) check(Reflect.ownKeys(pagination as object).every(key => key === "next"));
        if (next === undefined) return value;
        cursor = text(256, /^[\x20-\x7e]+$/).parse(next);
        check(!cursors.has(cursor));
        cursors.add(cursor);
      }
      throw Error("UPSTREAM_UNAVAILABLE");
    },
    project(raw: unknown): Json { return projectFor(name, raw); },
  })));
}
