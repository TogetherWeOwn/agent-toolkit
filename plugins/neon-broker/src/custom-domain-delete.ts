import { closed, identifier, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional, rows } from "./projection.js";
import { PAGE_SIZE, type NeonMetadataTransport } from "./transport.js";

export const CUSTOM_DOMAIN_DELETE_OPERATIONS = ["deleteProjectBranchCustomDomain"] as const;
export interface NeonCustomDomainDeleteScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly domain: string;
  readonly functionSlug: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
export const customDomainDeleteName = { parse(value: unknown): string {
  const name = text(253, /^[a-z0-9.-]+$/).parse(value);
  check(name.includes(".") && name.split(".").every(label => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)));
  return name;
} };
const slug = text(20, /^[a-z0-9]+$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, domain: customDomainDeleteName });
const acknowledgement = closed({ acknowledged: { parse(value: unknown): true { check(value === true); return true; } } });

// Source only. Domain names are not immutable IDs and preflight is not atomic CAS.
export function createNeonCustomDomainDeleteOperations(scope: NeonCustomDomainDeleteScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, domain: customDomainDeleteName,
    functionSlug: slug, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/custom-domains/${config.domain}/delete`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.domain === config.domain);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "deleteProjectBranchCustomDomain", ...args, function_slug: config.functionSlug,
        effect: "request_branch_custom_domain_deletion", preflight: "terminal_bounded_domain_list_binding",
        reconciliation: "one_domain_list_observation_no_retry",
        diff: { before: "selected_function_domain_visible", after: "domain_deletion_requested" }, completion: "acknowledgement_only",
        routingStopVerified: false, dnsRemovalVerified: false, connectionFence: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    const project = optional(raw, "project_id");
    const branch = optional(raw, "branch_id");
    check(project === undefined || project === config.projectId);
    check(branch === undefined || branch === config.branchId);
  }
  function receipt(raw: unknown): Json {
    acknowledgement.parse(raw);
    return { acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.deleteProjectBranchCustomDomain", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 7500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        const seen = new Set<string>();
        const cursors = new Set<string>();
        let found = false;
        let cursor: string | null = null;
        for (let page = 0; page < 3; page++) {
          if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
          const raw = await transport.listProjectBranchCustomDomains(config.projectId, config.branchId, cursor, options);
          if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
          ancestry(raw);
          for (const value of rows(field(raw, "custom_domains"), PAGE_SIZE)) {
            ancestry(value);
            check(optional(value, "pagination") === undefined);
            const domain = customDomainDeleteName.parse(field(value, "domain"));
            check(!seen.has(domain));
            seen.add(domain);
            // Unknown future entity kinds remain data, never authority for this target.
            const kind = text(32, /^[\x20-\x7e]+$/).parse(field(value, "entity_type"));
            const entity = text(255, /^[\x20-\x7e]+$/).parse(field(value, "entity_id"));
            if (domain === config.domain) { check(kind === "function" && entity === config.functionSlug); found = true; }
            // CNAME targets, validity status, DNS and routing diagnostics are not evaluated.
          }
          const pagination = optional(raw, "pagination");
          const next = pagination === undefined ? undefined : optional(pagination, "next");
          if (pagination !== undefined) check(Reflect.ownKeys(pagination as object).every(key => key === "next"));
          if (next === undefined) { check(found); return; }
          cursor = text(256, /^[\x20-\x7e]+$/).parse(next);
          check(!cursors.has(cursor));
          cursors.add(cursor);
        }
        throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.deleteProjectBranchCustomDomain(config.projectId, config.branchId, config.domain, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Absence or rebinding is not independent evidence of stopped routing.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
