import { closed, identifier, integer, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { boolean, check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonRealtimeDisableScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly expectedRevision: number;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const deploymentRevision = integer(1, 2147483647);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId });

export function createNeonRealtimeDisableOperations(scope: NeonRealtimeDisableScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, expectedRevision: deploymentRevision, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/realtime/disable`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "disableProjectBranchRealtime", ...args, expectedRevision: config.expectedRevision,
        effect: "queue_realtime_deprovisioning_and_shared_secret_discard", preflight: "enabled_not_pending_exact_revision",
        reconciliation: "one_state_observation_no_retry", completion: "asynchronous_acceptance_only",
        diff: { before: { enabled: true, pending: false, revision: config.expectedRevision }, after: "realtime_deprovisioning_queued" },
        enforcementVerified: false, secretDiscardVerified: false, sessionsRevoked: false, connectionFence: false }, artifactDigest: null };
  }
  function present(raw: unknown): void {
    check(boolean(field(raw, "enabled")) === true && boolean(field(raw, "pending")) === false);
    check(deploymentRevision.parse(field(raw, "revision")) === config.expectedRevision);
    for (const [key, expected] of [["project_id", config.projectId], ["branch_id", config.branchId]] as const) {
      check(optional(raw, key) === undefined || optional(raw, key) === expected);
    }
    check(optional(raw, "pagination") === undefined);
    // Invocation URL, origins and any secret-like extras are not consumed.
  }
  function receipt(raw: unknown): Json {
    const value = closed({ acknowledged: { parse: boolean } }).parse(raw);
    check(value.acknowledged === true);
    return { accepted: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.disableProjectBranchRealtime", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        present(await transport.getProjectBranchRealtime(config.projectId, config.branchId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.disableProjectBranchRealtime(config.projectId, config.branchId, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Disabled state, absence or revision drift is not causal completion evidence.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
