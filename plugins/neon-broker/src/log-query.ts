import { closed, identifier, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { logWindowShape, parseLogWindow } from "./log-value-query.js";
import { MAX_ITEMS } from "./metadata.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const LOG_QUERY_OPERATIONS = ["queryProjectBranchLogs"] as const;
export interface NeonLogQueryScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly revision: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly source: "function" | "storage" | "pg_endpoint";
}
const pathId = text(60, /^[a-z0-9-]+$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, ...logWindowShape });

// Preserve nanosecond ordering without rounding through JavaScript milliseconds.
function timestamp(value: unknown): string {
  const parsed = text(30, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/).parse(value);
  const seconds = `${parsed.slice(0, 19)}Z`;
  check(Number.isFinite(Date.parse(seconds)) && new Date(seconds).toISOString() === seconds.replace("Z", ".000Z"));
  const fraction = parsed.includes(".") ? parsed.slice(20, -1) : "";
  return `${seconds.slice(0, -1)}.${fraction.padEnd(9, "0")}Z`;
}

export function createNeonLogQueryOperations(scope: NeonLogQueryScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, revision: identifier,
    startTime: logWindowShape.start_time, endTime: logWindowShape.end_time, source: logWindowShape.source }).parse(scope);
  const query = parseLogWindow({ start_time: config.startTime, end_time: config.endTime, source: config.source });
  const from = timestamp(query.start_time);
  const to = timestamp(query.end_time);
  const resource = { id: `neon/projects/${config.projectId}/branches/${config.branchId}/logs/query`, revision: config.revision };
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.project_id !== config.projectId || args.branch_id !== config.branchId || args.start_time !== query.start_time ||
      args.end_time !== query.end_time || args.source !== query.source) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { ...resource }, arguments: args, plan: { operation: LOG_QUERY_OPERATIONS[0], ...args }, artifactDigest: null };
  }
  function ancestry(raw: unknown) {
    for (const [key, expected] of [["project_id", config.projectId], ["branch_id", config.branchId], ["source", query.source]] as const) {
      const actual = optional(raw, key);
      check(actual === undefined || actual === expected);
    }
  }
  function project(raw: unknown): Json {
    check(optional(raw, "pagination") === undefined && field(raw, "is_truncated") === false);
    const cursor = optional(raw, "next_cursor");
    check(cursor === undefined || cursor === "");
    ancestry(raw);
    for (const [key, expected] of [["start_time", query.start_time], ["end_time", query.end_time]] as const) {
      const actual = optional(raw, key);
      check(actual === undefined || actual === expected);
    }
    const logs = rows(field(raw, "logs"), MAX_ITEMS);
    let previous = from;
    for (const log of logs) {
      ancestry(log);
      const time = timestamp(field(log, "timestamp"));
      check(time >= from && time < to && time >= previous);
      previous = time;
    }
    return { observed_count: logs.length };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${LOG_QUERY_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = await transport.queryProjectBranchLogs(config.projectId, config.branchId, query, { credential, signal });
      project(raw);
      return raw;
    },
    project,
  })]);
}
