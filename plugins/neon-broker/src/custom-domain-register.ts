import { closed, identifier, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { customDomainDeleteName as domainName } from "./custom-domain-delete.js";
import { check, field, optional, rows } from "./projection.js";
import { PAGE_SIZE, type NeonMetadataTransport } from "./transport.js";

export interface NeonCustomDomainRegisterScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly domain: string;
  readonly functionId: string;
  readonly functionSlug: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const slug = text(20, /^[a-z0-9]+$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, domain: domainName });

// Source only. Names and function slugs cannot make this registration atomic.
export function createNeonCustomDomainRegisterOperations(scope: NeonCustomDomainRegisterScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, domain: domainName,
    functionId: identifier, functionSlug: slug, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/custom-domains/${config.domain}/register`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.domain === config.domain);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "registerProjectBranchCustomDomain", ...args, function_id: config.functionId, function_slug: config.functionSlug,
        effect: "request_function_custom_domain_registration", preflight: "function_identity_and_terminal_domain_absence",
        atomicCompareAndSwap: false, diff: { before: "selected_domain_absent", after: { entity_type: "function", entity_id: config.functionSlug } },
        reconciliation: "one_domain_list_observation_no_retry", completion: "acknowledgement_only",
        domainCustodyVerified: false, routingVerified: false, dnsActivationVerified: false, persistenceVerified: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    for (const [key, expected] of [["project_id", config.projectId], ["branch_id", config.branchId]] as const) {
      const value = optional(raw, key);
      check(value === undefined || value === expected);
    }
  }
  function receipt(raw: unknown): Json {
    ancestry(raw);
    check(optional(raw, "pagination") === undefined && field(raw, "domain") === config.domain &&
      field(raw, "entity_type") === "function" && field(raw, "entity_id") === config.functionSlug);
    // CNAME activation input, DNS/certificate status and routing diagnostics are not evaluated.
    return { domain: config.domain, entity_type: "function", entity_id: config.functionSlug, acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.registerProjectBranchCustomDomain", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 8500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const detail = await transport.getProjectBranchFunction(config.projectId, config.branchId, config.functionSlug, options);
      ancestry(detail);
      check(optional(detail, "pagination") === undefined);
      const fn = field(detail, "function");
      ancestry(fn);
      check(optional(fn, "pagination") === undefined && field(fn, "id") === config.functionId && field(fn, "slug") === config.functionSlug);
      async function observe(): Promise<boolean> {
        const seen = new Set<string>();
        const cursors = new Set<string>();
        let cursor: string | null = null;
        let sortBy: string | undefined;
        let sortOrder: string | undefined;
        for (let page = 0; page < 3; page++) {
          if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
          const raw = await transport.listProjectBranchCustomDomains(config.projectId, config.branchId, cursor, options);
          if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
          ancestry(raw);
          for (const value of rows(field(raw, "custom_domains"), PAGE_SIZE)) {
            ancestry(value);
            check(optional(value, "pagination") === undefined);
            const domain = domainName.parse(field(value, "domain"));
            check(!seen.has(domain));
            seen.add(domain);
            text(32, /^[\x20-\x7e]+$/).parse(field(value, "entity_type"));
            text(255, /^[\x20-\x7e]+$/).parse(field(value, "entity_id"));
          }
          const pagination = optional(raw, "pagination");
          const next = pagination === undefined ? undefined : optional(pagination, "next");
          if (pagination !== undefined) {
            check(Reflect.ownKeys(pagination as object).every(key => key === "next" || key === "sort_by" || key === "sort_order"));
            const by = optional(pagination, "sort_by");
            const order = optional(pagination, "sort_order");
            if (by !== undefined) {
              const parsed = text(80, /^[\x20-\x7e]+$/).parse(by);
              check(sortBy === undefined || sortBy === parsed);
              sortBy = parsed;
            }
            if (order !== undefined) {
              check(order === "asc" || order === "desc");
              check(sortOrder === undefined || sortOrder === order);
              sortOrder = order;
            }
          }
          if (next === undefined) return seen.has(config.domain);
          cursor = text(256, /^[\x20-\x7e]+$/).parse(next);
          check(!cursors.has(cursor));
          cursors.add(cursor);
        }
        throw Error("UPSTREAM_UNAVAILABLE");
      }
      check(await observe() === false);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.registerProjectBranchCustomDomain(config.projectId, config.branchId, config.domain, config.functionSlug, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        if (!signal.aborted) { try { await observe(); } catch { /* Presence is not causal registration evidence. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
