import { closed, identifier, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS, MAX_PAGES } from "./metadata.js";
import { boolean, check, field, optional, rows } from "./projection.js";
import { PAGE_SIZE, type NeonMetadataTransport } from "./transport.js";

export const BUCKET_OBJECT_OPERATIONS = ["listProjectBranchBucketObjects"] as const;
export interface NeonBucketObjectScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly bucketName: string;
  readonly revision: string;
  readonly prefix: string;
  readonly objectKeys: readonly string[];
}
const pathId = text(60, /^[a-z0-9-]+$/);
const bucketName = text(60, /^[a-z0-9_-]+$/);
const objectKey = text(80, /^[\x20-\x7e]+$/);
const cursorSchema = text(256, /^[\x20-\x7e]+$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, bucket_name: bucketName });

export function createNeonBucketObjectOperations(scope: NeonBucketObjectScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, bucketName, revision: identifier, prefix: objectKey,
    objectKeys: { parse: (v: unknown) => rows(v, MAX_ITEMS).map(value => objectKey.parse(value)) },
  }).parse(scope);
  const selected = new Set(config.objectKeys);
  check(selected.size === config.objectKeys.length && config.objectKeys.every(key => key.startsWith(config.prefix)));
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.project_id !== config.projectId || args.branch_id !== config.branchId || args.bucket_name !== config.bucketName) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/projects/${config.projectId}/branches/${config.branchId}/buckets/${config.bucketName}/objects`, revision: config.revision },
      arguments: args, plan: { operation: BUCKET_OBJECT_OPERATIONS[0], ...args }, artifactDigest: null };
  }
  function page(raw: unknown, max: number) {
    check(optional(raw, "pagination") === undefined);
    for (const [name, expected] of [["project_id", config.projectId], ["branch_id", config.branchId], ["bucket_name", config.bucketName]] as const) {
      const observed = optional(raw, name);
      check(observed === undefined || observed === expected);
    }
    check(field(raw, "prefix") === config.prefix && rows(field(raw, "folders"), 0).length === 0);
    const objects = rows(field(raw, "objects"), max).map(value => {
      const key = objectKey.parse(field(value, "key"));
      const size = field(value, "size");
      check(key.startsWith(config.prefix) && typeof size === "number" && Number.isSafeInteger(size) && size >= 0 && !Object.is(size, -0));
      return { key, size };
    });
    const truncated = boolean(field(raw, "is_truncated"));
    const next = optional(raw, "next_cursor");
    check(truncated ? typeof next === "string" && next.length > 0 : next === undefined || next === "");
    return { objects, cursor: truncated ? cursorSchema.parse(next) : null };
  }
  function project(raw: unknown): Json {
    const value = page(raw, MAX_ITEMS);
    check(value.cursor === null);
    const seen = new Set<string>();
    const objects = value.objects.filter(({ key }) => {
      check(!seen.has(key));
      seen.add(key);
      return selected.has(key);
    });
    return { objects };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${BUCKET_OBJECT_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      const objects: { key: string; size: number }[] = [];
      const cursors = new Set<string>();
      let cursor: string | null = null;
      for (let n = 0; n < MAX_PAGES; n++) {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const raw = await transport.listProjectBranchBucketObjects(config.projectId, config.branchId, config.bucketName, config.prefix, cursor, { credential, signal });
        const value = page(raw, PAGE_SIZE);
        objects.push(...value.objects);
        const result = { objects, folders: [], prefix: config.prefix, is_truncated: false };
        // Validate the whole accumulated list before any selection, including later pages.
        project(result);
        if (value.cursor === null) return result;
        check(!cursors.has(value.cursor));
        cursors.add(value.cursor);
        cursor = value.cursor;
      }
      throw Error("OUTPUT_REFUSED");
    },
    project,
  })]);
}
