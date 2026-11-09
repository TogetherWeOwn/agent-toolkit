import { closed, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { snapshotLabel } from "./snapshot-update.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonSnapshotCreateScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly name: string;
  readonly timestamp: string;
  readonly expiresAt: string;
  readonly revision: string;
}
const projectId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const branchId = text(60, /^br-[a-z0-9][a-z0-9-]*$/);
const snapshotId = text(60, /^[a-z0-9-]+$/);
const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
export const snapshotCreateTime = {
  parse(raw: unknown): string {
    const value = text(20, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/).parse(raw);
    const time = Date.parse(value);
    check(Number.isFinite(time) && new Date(time).toISOString() === value.replace("Z", ".000Z"));
    return value;
  },
};
const argumentsSchema = closed({ project_id: projectId, branch_id: branchId, name: snapshotLabel,
  timestamp: snapshotCreateTime, expires_at: snapshotCreateTime });
const operationId = text(36, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const status = oneOf(["scheduling", "running", "finished", "failed", "error", "cancelling", "cancelled", "skipped"]);

// Source only. Expiry is eligibility for deletion, not enforced teardown.
export function createNeonSnapshotCreateOperations(scope: NeonSnapshotCreateScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId, branchId, name: snapshotLabel, timestamp: snapshotCreateTime,
    expiresAt: snapshotCreateTime, revision }).parse(scope);
  check(config.expiresAt > config.timestamp);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/snapshots/${config.name}/create`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.name === config.name &&
      args.timestamp === config.timestamp && args.expires_at === config.expiresAt);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "createSnapshot", ...args, effect: "request_snapshot_creation",
        preflight: "branch_identity_and_bounded_project_snapshot_name_absence", atomicCompareAndSwap: false,
        diff: { before: "selected_snapshot_name_absent", after: { name: config.name, timestamp: config.timestamp, expires_at: config.expiresAt } },
        reconciliation: "one_snapshot_list_observation_no_retry", completion: "acknowledgement_only",
        recoverabilityVerified: false, expiry: "eligible_for_deletion_not_guaranteed_teardown" }, artifactDigest: null };
  }
  function ancestry(raw: unknown, branch = true): void {
    check(optional(raw, "project_id") === undefined || field(raw, "project_id") === config.projectId);
    if (branch) check(optional(raw, "branch_id") === undefined || field(raw, "branch_id") === config.branchId);
    check(optional(raw, "pagination") === undefined);
  }
  function present(raw: unknown): boolean {
    ancestry(raw);
    const seen = new Set<string>();
    let found = false;
    for (const value of rows(field(raw, "snapshots"), 30)) {
      ancestry(value, false);
      const id = snapshotId.parse(field(value, "id"));
      const source = branchId.parse(field(value, "source_branch_id"));
      const name = text(256, /^[\x20-\x7e]+$/).parse(field(value, "name"));
      check(optional(value, "branch_id") === undefined || field(value, "branch_id") === source);
      check(!seen.has(id));
      seen.add(id);
      if (name === config.name) found = true;
    }
    return found;
  }
  function receipt(raw: unknown): Json {
    ancestry(raw);
    const snapshot = field(raw, "snapshot");
    ancestry(snapshot);
    const id = snapshotId.parse(field(snapshot, "id"));
    check(field(snapshot, "source_branch_id") === config.branchId && field(snapshot, "name") === config.name &&
      field(snapshot, "timestamp") === config.timestamp && field(snapshot, "expires_at") === config.expiresAt);
    const seen = new Set<string>();
    const operations = rows(field(raw, "operations"), 30).map(value => {
      ancestry(value);
      const id = operationId.parse(field(value, "id"));
      check(field(value, "project_id") === config.projectId && !seen.has(id));
      seen.add(id);
      return { id, status: status.parse(field(value, "status")) };
    });
    return { id, acknowledged: true, operations };
  }
  return Object.freeze([Object.freeze({
    name: "neon.createSnapshot", version: "1.0.0", tier: "write" as const, lifecycle: "none" as const, timeoutMs: 4500,
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
        const found = present(await transport.listSnapshots(config.projectId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return found;
      }
      check(await observe() === false);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.createSnapshot(config.projectId, config.branchId, config.name, config.timestamp, config.expiresAt, options);
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
