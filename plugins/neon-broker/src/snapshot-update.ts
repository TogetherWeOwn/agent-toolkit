import { closed, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const SNAPSHOT_UPDATE_OPERATIONS = ["updateSnapshot"] as const;
export interface NeonSnapshotUpdateScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly snapshotId: string;
  readonly revision: string;
  readonly expectedName: string;
  readonly name: string;
}
const id = text(60, /^[a-z0-9-]+$/);
const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
export const snapshotLabel = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const argumentsSchema = closed({ project_id: id, branch_id: id, snapshot_id: id, name: snapshotLabel });

// Name-only source seam. Expiry/retention and runtime registration are absent.
export function createNeonSnapshotUpdateOperations(scope: NeonSnapshotUpdateScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: id, branchId: id, snapshotId: id, revision, expectedName: snapshotLabel, name: snapshotLabel }).parse(scope);
  check(config.expectedName !== config.name);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/snapshots/${config.snapshotId}/rename`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.snapshot_id === config.snapshotId && args.name === config.name);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "updateSnapshot", ...args, effect: "rename_snapshot", preflight: "bounded_snapshot_binding_and_label",
        diff: { before: config.expectedName, after: config.name }, expiry: "unchanged", atomicCompareAndSwap: false,
        reconciliation: "bounded_snapshot_observation_no_retry" }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    for (const [key, expected] of [["project_id", config.projectId], ["branch_id", config.branchId], ["snapshot_id", config.snapshotId]] as const) {
      const value = optional(raw, key);
      check(value === undefined || value === expected);
    }
    check(optional(raw, "pagination") === undefined);
  }
  function selected(raw: unknown, name: string): void {
    ancestry(raw);
    check(field(raw, "id") === config.snapshotId && field(raw, "source_branch_id") === config.branchId && field(raw, "name") === name);
  }
  function receipt(raw: unknown): Json {
    ancestry(raw);
    selected(field(raw, "snapshot"), config.name);
    return { id: config.snapshotId, updated: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.updateSnapshot", version: "1.0.0", tier: "write" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(preflight: boolean): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const raw = await transport.listSnapshots(config.projectId, options);
        ancestry(raw);
        const seen = new Set<string>();
        let present = false;
        for (const value of rows(field(raw, "snapshots"), 30)) {
          const snapshotId = id.parse(field(value, "id"));
          id.parse(field(value, "source_branch_id"));
          check(!seen.has(snapshotId) && optional(value, "pagination") === undefined);
          const projectId = optional(value, "project_id");
          check(projectId === undefined || projectId === config.projectId);
          seen.add(snapshotId);
          if (snapshotId === config.snapshotId) {
            ancestry(value);
            check(field(value, "source_branch_id") === config.branchId);
            if (preflight) selected(value, config.expectedName);
            present = true;
          }
        }
        if (preflight) check(present);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe(true);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.updateSnapshot(config.projectId, config.snapshotId, config.name, options);
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
