import { closed, identifier, integer, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { downloadBucketName, downloadObjectKey } from "./object-key.js";
import { check } from "./projection.js";
import { RESPONSE_BYTES, type NeonMetadataTransport } from "./transport.js";

export const OBJECT_DOWNLOAD_OPERATIONS = ["getProjectBranchBucketObject"] as const;
export interface NeonObjectDownloadScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly bucketName: string;
  readonly objectKey: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9-]+$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, bucket_name: downloadBucketName, object_key: downloadObjectKey });
const outputSchema = closed({ observed_bytes: integer(0, RESPONSE_BYTES) });

export function createNeonObjectDownloadOperations(scope: NeonObjectDownloadScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, bucketName: downloadBucketName,
    objectKey: downloadObjectKey, revision: identifier }).parse(scope);
  const resource = `neon/projects/${config.projectId}/branches/${config.branchId}/buckets/${config.bucketName}/objects/${config.objectKey}/download`;
  check(resource.length <= 256);
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.project_id !== config.projectId || args.branch_id !== config.branchId ||
      args.bucket_name !== config.bucketName || args.object_key !== config.objectKey) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: resource, revision: config.revision }, arguments: args,
      plan: { operation: OBJECT_DOWNLOAD_OPERATIONS[0], ...args }, artifactDigest: null };
  }
  function project(raw: unknown): Json { return { observed_bytes: outputSchema.parse(raw).observed_bytes }; }
  return Object.freeze([Object.freeze({
    name: `neon.${OBJECT_DOWNLOAD_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = await transport.getProjectBranchBucketObject(config.projectId, config.branchId, config.bucketName,
        config.objectKey, { credential, signal });
      return project(raw);
    },
    project,
  })]);
}
