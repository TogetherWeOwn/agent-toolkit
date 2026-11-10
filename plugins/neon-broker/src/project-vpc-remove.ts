import { closed, identifier, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { MAX_ITEMS } from "./metadata.js";
import { boolean, check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonProjectVPCRemoveScope {
  readonly projectId: string;
  readonly vpcEndpointId: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const argumentsSchema = closed({ project_id: pathId, vpc_endpoint_id: identifier });

// Removes a project network restriction, NOT the organization/cloud endpoint.
export function createNeonProjectVPCRemoveOperations(scope: NeonProjectVPCRemoveScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, vpcEndpointId: identifier, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/vpc_endpoints/${config.vpcEndpointId}/remove`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.vpc_endpoint_id === config.vpcEndpointId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "deleteProjectVPCEndpoint", ...args, effect: "remove_project_vpc_endpoint_restriction_may_broaden_network_access",
        preflight: "bounded_restriction_list_exact_presence", reconciliation: "one_restriction_list_observation_no_retry",
        diff: { before: "selected_project_restriction_present", after: "project_restriction_removal_requested" },
        completion: "acknowledgement_only", endpointDeleted: false, enforcementVerified: false,
        sessionsRevoked: false, connectionFence: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    check(optional(raw, "project_id") === undefined || optional(raw, "project_id") === config.projectId);
    check(optional(raw, "branch_id") === undefined && optional(raw, "pagination") === undefined);
  }
  function listed(raw: unknown): void {
    ancestry(raw);
    const seen = new Set<string>();
    let found = false;
    for (const value of rows(field(raw, "endpoints"), MAX_ITEMS)) {
      ancestry(value);
      const id = text(256, /^[\x20-\x7e]+$/).parse(field(value, "vpc_endpoint_id"));
      check(!seen.has(id));
      seen.add(id);
      if (id === config.vpcEndpointId) found = true;
      // Cloud labels and arbitrary provider diagnostics are not consumed.
    }
    check(found);
  }
  function receipt(raw: unknown): Json {
    const value = closed({ acknowledged: { parse: boolean } }).parse(raw);
    check(value.acknowledged === true);
    return { acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.deleteProjectVPCEndpoint", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        listed(await transport.listProjectVPCEndpoints(config.projectId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.deleteProjectVPCEndpoint(config.projectId, config.vpcEndpointId, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Absence cannot prove causal removal, effective network policy or session state.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
