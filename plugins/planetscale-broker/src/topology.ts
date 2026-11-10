import { closed, identifier, oneOf, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { flag, record, slug } from "./metadata.js";

const keyspaceBinding = closed({ id: identifier, name: slug });
const shardBinding = closed({ id: identifier });
const eventBinding = closed({ id: identifier, branchId: identifier, branch: slug });
function bindings<T extends { readonly id: string }>(schema: Schema<T>): Schema<readonly T[]> {
  return { parse(value) {
    requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
    const parsed = value.map(item => schema.parse(item));
    requireThat(new Set(parsed.map(item => item.id)).size === parsed.length, "schema");
    return Object.freeze(parsed);
  } };
}
export const keyspaceBindings = bindings(keyspaceBinding);
export const shardBindings = bindings(shardBinding);
export const maintenanceEventBindings = bindings(eventBinding);
const branchFields = { organization: slug, database: slug, branch: slug };
// Broker-owned output bindings, not upstream collection or mutation authority.
export const keyspaceScope = closed({ ...branchFields, keyspace: keyspaceBinding });
export const keyspaceListScope = closed({ ...branchFields, keyspaces: keyspaceBindings });
export const shardScope = closed({ ...branchFields, shard: shardBinding });
export const shardListScope = closed({ ...branchFields, shards: shardBindings });
export const maintenanceEventScope = closed({ organization: slug, database: slug, event: eventBinding });
export const maintenanceEventListScope = closed({ organization: slug, database: slug, events: maintenanceEventBindings });

function matched<T extends { readonly id: string }>(body: Record<string, unknown>, allowed: readonly T[]): T {
  const id = identifier.parse(body.id);
  const binding = allowed.find(item => item.id === id);
  requireThat(binding !== undefined, "scope");
  return binding!;
}

export interface KeyspaceSummary {
  readonly id: string;
  readonly name: string;
  readonly sharded: boolean;
  readonly external: boolean;
  readonly ready: boolean;
  readonly resizing: boolean;
  readonly default: boolean;
}
export function keyspaceSummary(body: Record<string, unknown>, allowed: readonly ReturnType<typeof keyspaceBinding.parse>[]): KeyspaceSummary {
  const binding = matched(body, allowed);
  requireThat(body.name === binding.name, "scope");
  return Object.freeze({
    id: binding.id, name: binding.name, sharded: flag(body.sharded), external: flag(body.external),
    ready: flag(body.ready), resizing: flag(body.resizing), default: flag(body.default),
  });
}

export interface ShardSummary {
  readonly id: string;
  readonly ready: boolean;
  readonly authoritative: boolean;
}
export function shardSummary(body: Record<string, unknown>, allowed: readonly ReturnType<typeof shardBinding.parse>[]): ShardSummary {
  // Authoritative describes topology, never caller authorization or effective ACLs.
  return Object.freeze({ id: matched(body, allowed).id, ready: flag(body.ready), authoritative: flag(body.authoritative) });
}

export const maintenanceState = oneOf(["scheduled", "in_progress", "completed", "canceled", "expired"] as const);
export interface MaintenanceEventSummary {
  readonly id: string;
  readonly branchId: string;
  readonly branch: string;
  readonly state: ReturnType<typeof maintenanceState.parse>;
  readonly urgent: boolean;
}
export function maintenanceEventSummary(body: Record<string, unknown>, allowed: readonly ReturnType<typeof eventBinding.parse>[]): MaintenanceEventSummary {
  const binding = matched(body, allowed);
  const branch = record(body.branch);
  requireThat(branch.id === binding.branchId && branch.name === binding.branch, "scope");
  return Object.freeze({
    id: binding.id, branchId: binding.branchId, branch: binding.branch,
    state: maintenanceState.parse(body.state), urgent: flag(body.urgent),
  });
}
