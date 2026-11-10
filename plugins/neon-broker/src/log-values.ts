import { closed, identifier, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { logValueQueryShape, parseLogValueQuery } from "./log-value-query.js";
import { MAX_ITEMS } from "./metadata.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const LOG_VALUE_OPERATIONS = ["listProjectBranchLogFieldValues"] as const;
export interface NeonLogValueScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly revision: string;
  readonly fieldName: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly source: "function" | "storage" | "pg_endpoint";
  readonly values: readonly string[];
}
const pathId = text(60, /^[a-z0-9-]+$/);
const observedValue = text(80, /^[\x20-\x7e]+$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, ...logValueQueryShape });

export function createNeonLogValueOperations(scope: NeonLogValueScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, revision: identifier,
    fieldName: logValueQueryShape.field_name, startTime: logValueQueryShape.start_time, endTime: logValueQueryShape.end_time,
    source: logValueQueryShape.source, values: { parse: (v: unknown) => rows(v, MAX_ITEMS).map(value => observedValue.parse(value)) },
  }).parse(scope);
  const query = parseLogValueQuery({ field_name: config.fieldName, start_time: config.startTime, end_time: config.endTime, source: config.source });
  const selected = new Set(config.values);
  check(selected.size === config.values.length);
  const resource = { id: `neon/projects/${config.projectId}/branches/${config.branchId}/logs/fields/${config.fieldName}/values`, revision: config.revision };
  check(resource.id.length <= 256);
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.project_id !== config.projectId || args.branch_id !== config.branchId || args.field_name !== query.field_name ||
      args.start_time !== query.start_time || args.end_time !== query.end_time || args.source !== query.source) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { ...resource }, arguments: args, plan: { operation: LOG_VALUE_OPERATIONS[0], ...args }, artifactDigest: null };
  }
  function project(raw: unknown): Json {
    check(optional(raw, "pagination") === undefined && field(raw, "is_truncated") === false);
    for (const [key, expected] of [["project_id", config.projectId], ["branch_id", config.branchId], ["field_name", query.field_name],
      ["start_time", query.start_time], ["end_time", query.end_time], ["source", query.source]] as const) {
      const actual = optional(raw, key);
      check(actual === undefined || actual === expected);
    }
    const seen = new Set<string>();
    const values = rows(field(raw, "values"), MAX_ITEMS).flatMap(value => {
      const parsed = observedValue.parse(value);
      check(!seen.has(parsed));
      seen.add(parsed);
      return selected.has(parsed) ? [parsed] : [];
    });
    return { values };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${LOG_VALUE_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = await transport.listProjectBranchLogFieldValues(config.projectId, config.branchId, query.field_name,
        query.start_time, query.end_time, query.source, { credential, signal });
      // Identity and window come from the fixed request; contradictory extras refuse.
      project(raw);
      return raw;
    },
    project,
  })]);
}
