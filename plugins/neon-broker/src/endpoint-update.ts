import { closed, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const ENDPOINT_UPDATE_OPERATIONS = ["updateProjectEndpoint"] as const;
export interface NeonEndpointUpdateScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly endpointId: string;
  readonly revision: string;
  readonly expectedName: string;
  readonly name: string;
}
const projectId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const branchId = text(60, /^br-[a-z0-9][a-z0-9-]*$/);
const endpointId = text(60, /^ep-[a-z0-9][a-z0-9-]*$/);
const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
export const endpointLabel = text(64, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const argumentsSchema = closed({ project_id: projectId, branch_id: branchId, endpoint_id: endpointId, name: endpointLabel });

// Name-only source seam. Provider endpoint updates may activate idle compute.
export function createNeonEndpointUpdateOperations(scope: NeonEndpointUpdateScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId, branchId, endpointId, revision, expectedName: endpointLabel, name: endpointLabel }).parse(scope);
  check(config.expectedName !== config.name);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/endpoints/${config.endpointId}/rename`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId &&
      args.endpoint_id === config.endpointId && args.name === config.name);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "updateProjectEndpoint", ...args, effect: "rename_endpoint", preflight: "exact_endpoint_binding_and_label",
        diff: { before: config.expectedName, after: config.name }, configuration: "unchanged", atomicCompareAndSwap: false,
        computeActivation: "possible", reconciliation: "bounded_endpoint_observation_no_retry" }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    for (const [key, value] of [["project_id", config.projectId], ["branch_id", config.branchId], ["endpoint_id", config.endpointId]] as const) {
      const observed = optional(raw, key);
      check(observed === undefined || observed === value);
    }
    check(optional(raw, "pagination") === undefined);
  }
  function bound(raw: unknown): unknown {
    ancestry(raw);
    const endpoint = field(raw, "endpoint");
    ancestry(endpoint);
    check(field(endpoint, "id") === config.endpointId && field(endpoint, "project_id") === config.projectId &&
      field(endpoint, "branch_id") === config.branchId);
    return endpoint;
  }
  function receipt(raw: unknown): Json {
    check(field(bound(raw), "name") === config.name);
    return { id: config.endpointId, updated: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.updateProjectEndpoint", version: "1.0.0", tier: "write" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(preflight: boolean): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const endpoint = bound(await transport.getProjectEndpoint(config.projectId, config.endpointId, options));
        if (preflight) check(field(endpoint, "name") === config.expectedName);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe(true);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.updateProjectEndpoint(config.projectId, config.endpointId, config.name, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Desired state observed after an error does not establish causation.
        if (!signal.aborted) { try { await observe(false); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
