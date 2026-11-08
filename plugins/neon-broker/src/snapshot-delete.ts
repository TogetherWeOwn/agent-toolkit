import { closed, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const SNAPSHOT_DELETE_OPERATIONS = ["deleteSnapshot"] as const;
export interface NeonSnapshotDeleteScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly snapshotId: string;
  readonly revision: string;
}
const id = text(60, /^[a-z0-9-]+$/);
const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const argumentsSchema = closed({ project_id: id, branch_id: id, snapshot_id: id });
const operationId = text(36, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const status = oneOf(["scheduling", "running", "finished", "failed", "error", "cancelling", "cancelled", "skipped"]);

// No default authority, journal or runtime registration. The reserved common-core
// path must verify/consume native evidence before resolving a credential.
export function createNeonSnapshotDeleteOperations(scope: NeonSnapshotDeleteScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: id, branchId: id, snapshotId: id, revision }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/snapshots/${config.snapshotId}/delete`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.snapshot_id === config.snapshotId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "deleteSnapshot", ...args, effect: "request_snapshot_deletion",
        preflight: "bounded_snapshot_binding", reconciliation: "bounded_snapshot_observation_no_retry",
        diff: { before: "selected_snapshot_present", after: "deletion_requested" }, completion: "acceptance_only" }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    for (const [key, expected] of [["project_id", config.projectId], ["branch_id", config.branchId], ["snapshot_id", config.snapshotId]] as const) {
      const value = optional(raw, key);
      check(value === undefined || value === expected);
    }
    check(optional(raw, "pagination") === undefined);
  }
  function receipt(raw: unknown): Json {
    ancestry(raw);
    const seen = new Set<string>();
    const operations = rows(field(raw, "operations"), 30).map(value => {
      ancestry(value);
      const opId = operationId.parse(field(value, "id"));
      check(field(value, "project_id") === config.projectId && !seen.has(opId));
      // Snapshot deletion must not silently accept a receipt scoped to a compute.
      check(optional(value, "endpoint_id") === undefined);
      seen.add(opId);
      return { id: opId, status: status.parse(field(value, "status")) };
    });
    return { accepted: true, operations };
  }
  return Object.freeze([Object.freeze({
    name: "neon.deleteSnapshot", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<boolean> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const raw = await transport.listSnapshots(config.projectId, options);
        ancestry(raw);
        const seen = new Set<string>();
        let present = false;
        for (const value of rows(field(raw, "snapshots"), 30)) {
          const snapshotId = id.parse(field(value, "id"));
          const branchId = id.parse(field(value, "source_branch_id"));
          check(!seen.has(snapshotId) && optional(value, "pagination") === undefined);
          const projectId = optional(value, "project_id");
          check(projectId === undefined || projectId === config.projectId);
          seen.add(snapshotId);
          if (snapshotId === config.snapshotId) {
            check(branchId === config.branchId);
            present = true;
          }
        }
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return present;
      }
      check(await observe());
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.deleteSnapshot(config.projectId, config.snapshotId, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // A lost acknowledgement cannot be retried, even when a bounded follow-up
        // observes absence. The common journal retains an uncertain tombstone.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
