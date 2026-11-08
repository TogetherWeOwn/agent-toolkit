import { closed, identifier, oneOf, requireThat, text, type Schema } from "../../../packages/core/src/schema.js";
import { record, slug } from "./metadata.js";

const shardName = text(63, /^[a-z0-9_-]+$/);
const shardNames: Schema<readonly string[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => shardName.parse(item));
  requireThat(new Set(parsed).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };
const branchFields = { organization: slug, database: slug, branch: slug };
// Name/ID confinement, not proof of current parent ownership or native authority.
export const rolloutScope = closed({ ...branchFields, keyspace: slug, shardNames });
export const vtctldOperationScope = closed({ ...branchFields, operationId: identifier });
export const operationState = oneOf(["pending", "running", "completed", "failed", "cancelled"] as const);

function textReported(value: unknown): boolean {
  requireThat(typeof value === "string" && value.length <= 4096, "upstream");
  return value.length > 0;
}
export interface RolloutShardSummary {
  readonly name: string;
  readonly stateReported: boolean;
  readonly startRecorded: boolean;
  readonly finishRecorded: boolean;
}
export interface RolloutSummary {
  readonly keyspace: string;
  readonly stateReported: boolean;
  readonly shards: readonly RolloutShardSummary[];
  readonly executionAuthority: "not-established";
}
export function rolloutSummary(body: Record<string, unknown>, keyspace: string, allowed: readonly string[]): RolloutSummary {
  requireThat(body.name === keyspace, "scope");
  requireThat(Array.isArray(body.shards) && body.shards.length <= 32, "upstream");
  const shards = body.shards.map(value => {
    const row = record(value);
    const name = shardName.parse(row.name);
    requireThat(allowed.includes(name), "scope");
    return Object.freeze({
      name, stateReported: textReported(row.state), startRecorded: textReported(row.last_rollout_started_at),
      finishRecorded: textReported(row.last_rollout_finished_at),
    });
  });
  requireThat(new Set(shards.map(row => row.name)).size === shards.length, "upstream");
  // Presence is not a parsed time, successful rollout, complete topology or closure.
  return Object.freeze({ keyspace, stateReported: textReported(body.state), shards: Object.freeze(shards), executionAuthority: "not-established" });
}

export interface VtctldOperationSummary {
  readonly id: string;
  readonly state: ReturnType<typeof operationState.parse>;
  readonly completionRecorded: boolean;
  readonly executionAuthority: "not-established";
}
export function vtctldOperationSummary(body: Record<string, unknown>, expected: string): VtctldOperationSummary {
  requireThat(body.type === "VtctldOperation" && body.id === expected, "scope");
  // The documented `completed` field is a string, not a boolean. Do not coerce it.
  // Results, errors, metadata and actions are deliberately not projected.
  return Object.freeze({
    id: expected, state: operationState.parse(body.state),
    completionRecorded: body.completed_at === null ? false : textReported(body.completed_at),
    executionAuthority: "not-established",
  });
}
