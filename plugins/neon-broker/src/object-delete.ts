import { closed, identifier, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { downloadBucketName, downloadObjectKey } from "./object-key.js";
import { boolean, check, field, optional, rows } from "./projection.js";
import { MAX_ITEMS, MAX_PAGES } from "./metadata.js";
import { PAGE_SIZE, type NeonMetadataTransport } from "./transport.js";

export const OBJECT_DELETE_OPERATIONS = ["deleteProjectBranchBucketObject"] as const;
export interface NeonObjectDeleteScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly bucketName: string;
  readonly objectKey: string;
  readonly expectedSize: number;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const size = { parse(value: unknown): number {
  check(typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0));
  return value;
} };
const cursorSchema = text(256, /^[\x20-\x7e]+$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, bucket_name: downloadBucketName, object_key: downloadObjectKey });
const acknowledgement = closed({ acknowledged: { parse(value: unknown): true { check(value === true); return true; } } });

// Source only. Key/size are not immutable identity; preflight is not atomic CAS.
export function createNeonObjectDeleteOperations(scope: NeonObjectDeleteScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, bucketName: downloadBucketName, objectKey: downloadObjectKey,
    expectedSize: size, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/buckets/${config.bucketName}/objects/${config.objectKey}/delete`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId &&
      args.bucket_name === config.bucketName && args.object_key === config.objectKey);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "deleteProjectBranchBucketObject", ...args, expected_size: config.expectedSize,
        effect: "request_branch_object_deletion", preflight: "bounded_terminal_prefix_list_exact_key_and_size",
        reconciliation: "one_bounded_prefix_list_observation_no_retry",
        diff: { before: "selected_object_visible", after: "object_deletion_requested" }, completion: "acknowledgement_only",
        deletionVerified: false, objectIdentityVerified: false, connectionFence: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    for (const [name, expected] of [["project_id", config.projectId], ["branch_id", config.branchId], ["bucket_name", config.bucketName]] as const) {
      const observed = optional(raw, name);
      check(observed === undefined || observed === expected);
    }
    check(optional(raw, "pagination") === undefined);
  }
  function page(raw: unknown) {
    ancestry(raw);
    check(field(raw, "prefix") === config.objectKey && rows(field(raw, "folders"), 0).length === 0);
    const objects = rows(field(raw, "objects"), PAGE_SIZE).map(value => {
      ancestry(value);
      const key = text(1024, /^[\x20-\x7e]+$/).parse(field(value, "key"));
      check(key.startsWith(config.objectKey));
      // Hashes, timestamps, content and arbitrary diagnostics are never evaluated.
      return { key, size: size.parse(field(value, "size")) };
    });
    const truncated = boolean(field(raw, "is_truncated"));
    const next = optional(raw, "next_cursor");
    check(truncated ? typeof next === "string" && next.length > 0 : next === undefined || next === "");
    return { objects, cursor: truncated ? cursorSchema.parse(next) : null };
  }
  function receipt(raw: unknown): Json {
    acknowledgement.parse(raw);
    return { acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.deleteProjectBranchBucketObject", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 7000,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        const seen = new Set<string>();
        const cursors = new Set<string>();
        let cursor: string | null = null;
        let found = false;
        for (let n = 0; n < MAX_PAGES; n++) {
          if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
          const value = page(await transport.listProjectBranchBucketObjects(config.projectId, config.branchId, config.bucketName, config.objectKey, cursor, options));
          if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
          for (const object of value.objects) {
            check(!seen.has(object.key));
            seen.add(object.key);
            check(seen.size <= MAX_ITEMS);
            if (object.key === config.objectKey) { check(object.size === config.expectedSize); found = true; }
          }
          if (value.cursor === null) { check(found); return; }
          check(!cursors.has(value.cursor));
          cursors.add(value.cursor);
          cursor = value.cursor;
        }
        throw Error("OUTPUT_REFUSED");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.deleteProjectBranchBucketObject(config.projectId, config.branchId, config.bucketName, config.objectKey, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // One bounded observation, never causal proof or mutation retry.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
