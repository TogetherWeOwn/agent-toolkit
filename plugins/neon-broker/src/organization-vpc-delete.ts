import { closed, identifier, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { boolean, check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonOrganizationVPCDeleteScope {
  readonly organizationId: string;
  readonly regionId: string;
  readonly vpcEndpointId: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
// The pinned organization endpoint route explicitly excludes Azure.
const region = text(80, /^aws-[a-z0-9]+(?:-[a-z0-9]+)*$/);
const argumentsSchema = closed({ org_id: pathId, region_id: region, vpc_endpoint_id: identifier });

export function createNeonOrganizationVPCDeleteOperations(scope: NeonOrganizationVPCDeleteScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ organizationId: pathId, regionId: region, vpcEndpointId: identifier, revision: identifier }).parse(scope);
  const resourceId = `neon/organizations/${config.organizationId}/vpc/region/${config.regionId}/vpc_endpoints/${config.vpcEndpointId}/delete`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.org_id === config.organizationId && args.region_id === config.regionId && args.vpc_endpoint_id === config.vpcEndpointId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "deleteOrganizationVPCEndpoint", ...args, effect: "remove_organization_vpc_endpoint_cannot_be_added_back",
        preflight: "exact_endpoint_detail_identity", reconciliation: "one_detail_observation_no_retry",
        diff: { before: "selected_organization_endpoint_present", after: "irreversible_organization_removal_requested" },
        completion: "acknowledgement_only", cloudEndpointDeleted: false, enforcementVerified: false,
        sessionsRevoked: false, connectionFence: false }, artifactDigest: null };
  }
  function detail(raw: unknown): void {
    check(optional(raw, "org_id") === undefined || optional(raw, "org_id") === config.organizationId);
    check(optional(raw, "region_id") === undefined || optional(raw, "region_id") === config.regionId);
    check(optional(raw, "project_id") === undefined && optional(raw, "branch_id") === undefined && optional(raw, "pagination") === undefined);
    check(field(raw, "vpc_endpoint_id") === config.vpcEndpointId);
    // Labels, sensitive state and example restricted projects are not consumed.
  }
  function receipt(raw: unknown): Json {
    const value = closed({ acknowledged: { parse: boolean } }).parse(raw);
    check(value.acknowledged === true);
    return { acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.deleteOrganizationVPCEndpoint", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        detail(await transport.getOrganizationVPCEndpointDetails(config.organizationId, config.regionId, config.vpcEndpointId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.deleteOrganizationVPCEndpoint(config.organizationId, config.regionId, config.vpcEndpointId, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Absence cannot establish causal removal, cloud deletion or network enforcement.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
