import { closed, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { endpointLabel } from "./endpoint-update.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonEndpointCreateScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly name: string;
  readonly revision: string;
}
const projectId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const branchId = text(60, /^br-[a-z0-9][a-z0-9-]*$/);
const endpointId = text(60, /^ep-[a-z0-9][a-z0-9-]*$/);
const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const argumentsSchema = closed({ project_id: projectId, branch_id: branchId, name: endpointLabel });
const operationId = text(36, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const status = oneOf(["scheduling", "running", "finished", "failed", "error", "cancelling", "cancelled", "skipped"]);

// Source only. Disabled creation is not an independent fence or a spend cap.
export function createNeonEndpointCreateOperations(scope: NeonEndpointCreateScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId, branchId, name: endpointLabel, revision }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/endpoints/create/${config.name}`;
  check(resourceId.length <= 256);
  const desired = { branch_id: config.branchId, name: config.name, type: "read_only", disabled: true,
    autoscaling_limit_min_cu: 0.25, autoscaling_limit_max_cu: 0.25, provisioner: "k8s-neonvm", suspend_timeout_seconds: 300 };
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.name === config.name);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "createProjectEndpoint", ...args, effect: "request_compute_creation",
        preflight: "branch_identity_and_bounded_endpoint_name_absence", atomicCompareAndSwap: false,
        diff: { before: "selected_endpoint_name_absent", after: { ...desired } },
        computeActivation: "possible", spendCapEnforced: false, independentFenceVerified: false,
        reconciliation: "one_endpoint_list_observation_no_retry", completion: "acknowledgement_only",
        persistenceVerified: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    for (const [key, expected] of [["project_id", config.projectId], ["branch_id", config.branchId]] as const) {
      const value = optional(raw, key);
      check(value === undefined || value === expected);
    }
    check(optional(raw, "pagination") === undefined);
  }
  function present(raw: unknown): boolean {
    ancestry(raw);
    const ids = new Set<string>();
    let found = false;
    for (const endpoint of rows(field(raw, "endpoints"), 30)) {
      ancestry(endpoint);
      check(field(endpoint, "project_id") === config.projectId && field(endpoint, "branch_id") === config.branchId);
      const id = endpointId.parse(field(endpoint, "id"));
      check(!ids.has(id));
      ids.add(id);
      oneOf(["read_only", "read_write"]).parse(field(endpoint, "type"));
      const name = optional(endpoint, "name");
      if (name !== undefined) {
        text(64, /^[\x20-\x7e]+$/).parse(name);
        if (name === config.name) found = true;
      }
    }
    return found;
  }
  function receipt(raw: unknown): Json {
    ancestry(raw);
    const endpoint = field(raw, "endpoint");
    ancestry(endpoint);
    check(field(endpoint, "project_id") === config.projectId);
    for (const [key, value] of Object.entries(desired)) check(field(endpoint, key) === value);
    const id = endpointId.parse(field(endpoint, "id"));
    const seen = new Set<string>();
    const operations = rows(field(raw, "operations"), 30).map(value => {
      ancestry(value);
      const operation = operationId.parse(field(value, "id"));
      const target = optional(value, "endpoint_id");
      check(field(value, "project_id") === config.projectId && (target === undefined || target === id) && !seen.has(operation));
      seen.add(operation);
      return { id: operation, status: status.parse(field(value, "status")) };
    });
    return { id, branch_id: config.branchId, acknowledged: true, operations };
  }
  return Object.freeze([Object.freeze({
    name: "neon.createProjectEndpoint", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 4500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const rawBranch = await transport.getProjectBranch(config.projectId, config.branchId, options);
      ancestry(rawBranch);
      const branch = field(rawBranch, "branch");
      ancestry(branch);
      check(field(branch, "id") === config.branchId && field(branch, "project_id") === config.projectId);
      async function observe(): Promise<boolean> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const found = present(await transport.listProjectBranchEndpoints(config.projectId, config.branchId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return found;
      }
      check(await observe() === false);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.createProjectEndpoint(config.projectId, config.branchId, config.name, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        if (!signal.aborted) { try { await observe(); } catch { /* Presence is not causal creation evidence. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
