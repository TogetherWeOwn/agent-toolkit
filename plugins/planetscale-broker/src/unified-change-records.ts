import { closed, identifier, oneOf, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { flag, record, slug } from "./metadata.js";
import { bouncerResizeState } from "./resize-records.js";

export const changeTargetType = oneOf(["NekiAdmin", "NekiCluster", "NekiConfigurationProfile", "NekiExternalShard", "NekiRouter", "PostgresBouncer"] as const);
export const changeType = oneOf(["NekiAdminChangeRequest", "NekiClusterChangeRequest", "NekiConfigurationProfileChangeRequest", "NekiExternalShardChangeRequest", "NekiRouterChangeRequest", "PostgresBouncerChangeRequest"] as const);
export const changeState = oneOf(["draft", "pending", "applying", "canceled", "completed"] as const);
const nullableId: Schema<string | null> = { parse(value) { return value === null ? null : identifier.parse(value); } };
const changeBindingShape = closed({ id: identifier, type: changeType, targetId: nullableId, targetType: changeTargetType, targetName: slug });
export const changeBinding: typeof changeBindingShape = { parse(value) {
  const parsed = changeBindingShape.parse(value);
  requireThat(parsed.type === `${parsed.targetType}ChangeRequest`, "scope");
  return parsed;
} };
const replicaChangeBinding = closed({ id: identifier, replicaId: identifier, replica: slug });
function bindings<T extends { readonly id: string }>(schema: Schema<T>): Schema<readonly T[]> {
  return { parse(value) {
    requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
    const parsed = value.map(item => schema.parse(item));
    requireThat(new Set(parsed.map(item => item.id)).size === parsed.length, "schema");
    return Object.freeze(parsed);
  } };
}
const branchFields = { organization: slug, database: slug, branch: slug };
// Response confinement only: trusted parent ownership and collection authority remain separate.
export const unifiedChangeScope = closed({ ...branchFields, change: changeBinding });
export const unifiedChangeListScope = closed({ ...branchFields, changes: bindings(changeBinding) });
export const replicaChangeListScope = closed({ ...branchFields, changes: bindings(replicaChangeBinding) });

function matched<T extends { readonly id: string }>(body: Record<string, unknown>, allowed: readonly T[]): T {
  const id = identifier.parse(body.id);
  const binding = allowed.find(item => item.id === id);
  requireThat(binding !== undefined, "scope");
  return binding!;
}

export interface UnifiedChangeSummary {
  readonly id: string;
  readonly type: ReturnType<typeof changeType.parse>;
  readonly targetId: string | null;
  readonly targetType: ReturnType<typeof changeTargetType.parse>;
  readonly targetName: string;
  readonly state: ReturnType<typeof changeState.parse>;
  readonly canDelete: boolean;
}
export function unifiedChangeSummary(body: Record<string, unknown>, allowed: readonly ReturnType<typeof changeBinding.parse>[]): UnifiedChangeSummary {
  const binding = matched(body, allowed);
  requireThat(body.type === binding.type && body.target_type === binding.targetType && body.target_id === binding.targetId && body.target_name === binding.targetName, "scope");
  // can_delete is a provider flag, never native deletion approval or a safe retry signal.
  return Object.freeze({ ...binding, state: changeState.parse(body.state), canDelete: flag(body.can_delete) });
}

export interface ReplicaChangeSummary {
  readonly id: string;
  readonly replicaId: string;
  readonly replica: string;
  readonly state: ReturnType<typeof bouncerResizeState.parse>;
}
export function replicaChangeSummary(body: Record<string, unknown>, allowed: readonly ReturnType<typeof replicaChangeBinding.parse>[]): ReplicaChangeSummary {
  const binding = matched(body, allowed);
  const replica = record(body.replica);
  requireThat(replica.id === binding.replicaId && replica.name === binding.replica, "scope");
  return Object.freeze({ ...binding, state: bouncerResizeState.parse(body.state) });
}
