import { closed, identifier, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { boolean, check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonProjectVPCAssignScope {
  readonly projectId: string;
  readonly vpcEndpointId: string;
  readonly expectedLabel: string;
  readonly label: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
export const projectVPCLabel = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const argumentsSchema = closed({ project_id: pathId, vpc_endpoint_id: identifier, label: projectVPCLabel });

// Reapplies the sole existing restriction with a changed label; never creates one.
export function createNeonProjectVPCAssignOperations(scope: NeonProjectVPCAssignScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, vpcEndpointId: identifier,
    expectedLabel: projectVPCLabel, label: projectVPCLabel, revision: identifier }).parse(scope);
  check(config.expectedLabel !== config.label);
  const resourceId = `neon/projects/${config.projectId}/vpc_endpoints/${config.vpcEndpointId}/assign`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.vpc_endpoint_id === config.vpcEndpointId && args.label === config.label);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "assignProjectVPCEndpoint", ...args,
        effect: "reapply_existing_project_vpc_restriction_with_label",
        preflight: "sole_existing_restriction_exact_endpoint_and_label",
        diff: { before: config.expectedLabel, after: config.label }, atomicCompareAndSwap: false,
        reconciliation: "one_restriction_list_observation_no_retry", completion: "acknowledgement_only",
        policyPreservationVerified: false, enforcementVerified: false, sessionsRevoked: false, connectionFence: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    check(optional(raw, "project_id") === undefined || optional(raw, "project_id") === config.projectId);
    check(optional(raw, "branch_id") === undefined && optional(raw, "pagination") === undefined);
  }
  function listed(raw: unknown): void {
    ancestry(raw);
    const values = rows(field(raw, "endpoints"), 1);
    check(values.length === 1);
    ancestry(values[0]);
    check(field(values[0], "vpc_endpoint_id") === config.vpcEndpointId);
    check(projectVPCLabel.parse(field(values[0], "label")) === config.expectedLabel);
    // Organization association and actual network policy remain provider-owned.
  }
  function receipt(raw: unknown): Json {
    const value = closed({ acknowledged: { parse: boolean } }).parse(raw);
    check(value.acknowledged === true);
    return { acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.assignProjectVPCEndpoint", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
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
        const raw = await transport.assignProjectVPCEndpoint(config.projectId, config.vpcEndpointId, config.label, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // A label observation proves neither causality nor the effective network policy.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
