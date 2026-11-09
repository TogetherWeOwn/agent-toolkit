import { closed, identifier, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const BUCKET_DELETE_OPERATIONS = ["deleteProjectBranchBucket"] as const;
export interface NeonBucketDeleteScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly bucketName: string;
  readonly expectedAccessLevel: "private" | "public_read";
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
// A conservative selected-name subset fits the common resource budget.
export const bucketDeleteName = text(60, /^[a-z0-9][a-z0-9._-]*$/);
const bucketName = bucketDeleteName;
const accessLevel = oneOf(["private", "public_read"] as const);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, bucket_name: bucketName });
const acknowledgement = closed({ acknowledged: { parse(value: unknown): true { check(value === true); return true; } } });

// Source only. Names are not immutable IDs and preflight is not atomic CAS.
export function createNeonBucketDeleteOperations(scope: NeonBucketDeleteScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, bucketName,
    expectedAccessLevel: accessLevel, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/buckets/${config.bucketName}/delete`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.bucket_name === config.bucketName);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "deleteProjectBranchBucket", ...args, expected_access_level: config.expectedAccessLevel,
        effect: "request_branch_bucket_deletion", preflight: "bounded_bucket_list_presence_and_access",
        reconciliation: "one_bucket_list_observation_no_retry",
        diff: { before: "selected_bucket_visible", after: "bucket_deletion_requested" }, completion: "acknowledgement_only",
        deletionVerified: false, objectCompletenessVerified: false, connectionFence: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    const project = optional(raw, "project_id");
    const branch = optional(raw, "branch_id");
    check(project === undefined || project === config.projectId);
    check(branch === undefined || branch === config.branchId);
    check(optional(raw, "pagination") === undefined);
  }
  function presence(raw: unknown): void {
    ancestry(raw);
    const seen = new Set<string>();
    let found = false;
    for (const value of rows(field(raw, "buckets"), 30)) {
      ancestry(value);
      const name = text(255, /^[\x20-\x7e]+$/).parse(field(value, "name"));
      check(!seen.has(name));
      seen.add(name);
      const access = accessLevel.parse(field(value, "access_level"));
      if (name === config.bucketName) { check(access === config.expectedAccessLevel); found = true; }
      // Creation times, objects, origin metadata and arbitrary diagnostics are not evaluated.
    }
    check(found);
  }
  function receipt(raw: unknown): Json {
    acknowledgement.parse(raw);
    return { acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.deleteProjectBranchBucket", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        presence(await transport.listProjectBranchBuckets(config.projectId, config.branchId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.deleteProjectBranchBucket(config.projectId, config.branchId, config.bucketName, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Absence or a same-name replacement is not causal deletion proof.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
