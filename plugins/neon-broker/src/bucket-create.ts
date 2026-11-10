import { closed, identifier, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { bucketDeleteName as bucketName } from "./bucket-delete.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonBucketCreateScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly bucketName: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const accessLevel = oneOf(["private", "public_read"] as const);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, bucket_name: bucketName });

// Source only. Names are not immutable IDs and absence preflight is not atomic CAS.
export function createNeonBucketCreateOperations(scope: NeonBucketCreateScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, bucketName, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/buckets/${config.bucketName}/create`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.bucket_name === config.bucketName);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "createProjectBranchBucket", ...args, access_level: "private",
        effect: "request_private_branch_bucket_creation", preflight: "bounded_bucket_list_absence",
        reconciliation: "one_bucket_list_observation_no_retry", completion: "acknowledgement_only",
        diff: { before: "selected_bucket_absent", after: { name: config.bucketName, access_level: "private" } },
        persistenceVerified: false, accessEnforcementVerified: false, objectCompletenessVerified: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    const project = optional(raw, "project_id");
    const branch = optional(raw, "branch_id");
    check(project === undefined || project === config.projectId);
    check(branch === undefined || branch === config.branchId);
    check(optional(raw, "pagination") === undefined);
  }
  function present(raw: unknown): boolean {
    ancestry(raw);
    const seen = new Set<string>();
    for (const value of rows(field(raw, "buckets"), 30)) {
      ancestry(value);
      const name = text(255, /^[\x20-\x7e]+$/).parse(field(value, "name"));
      check(!seen.has(name));
      seen.add(name);
      accessLevel.parse(field(value, "access_level"));
      // Timestamps, origin metadata and object contents are never evaluated.
    }
    return seen.has(config.bucketName);
  }
  function receipt(raw: unknown): Json {
    ancestry(raw);
    const value = field(raw, "bucket");
    ancestry(value);
    check(field(value, "name") === config.bucketName && field(value, "access_level") === "private");
    return { name: config.bucketName, acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.createProjectBranchBucket", version: "1.0.0", tier: "write" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<boolean> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const found = present(await transport.listProjectBranchBuckets(config.projectId, config.branchId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return found;
      }
      check(await observe() === false);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.createProjectBranchBucket(config.projectId, config.branchId, config.bucketName, options);
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
