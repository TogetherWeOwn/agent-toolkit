import { closed, identifier, oneOf, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { flag, slug } from "./metadata.js";
import { shardSummary, type ShardSummary } from "./topology.js";

const binding = closed({ id: identifier, name: slug });
type Binding = ReturnType<typeof binding.parse>;
const bindings: Schema<readonly Binding[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => binding.parse(item));
  requireThat(new Set(parsed.map(item => item.id)).size === parsed.length, "schema");
  requireThat(new Set(parsed.map(item => item.name)).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };
const shardBinding = closed({ id: identifier });
const shardBindings: Schema<readonly ReturnType<typeof shardBinding.parse>[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => shardBinding.parse(item));
  requireThat(new Set(parsed.map(item => item.id)).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };
export { bindings as profileBindings, shardBindings as profileShardBindings };
const branchFields = { organization: slug, database: slug, branch: slug };
// Profile names route requests; trusted current ID/name ownership is still required.
export const profileScope = closed({ ...branchFields, profile: binding });
export const profileListScope = closed({ ...branchFields, profiles: bindings });
export const profileShardScope = closed({ ...branchFields, profile: binding, shard: shardBinding });
export const profileShardListScope = closed({ ...branchFields, profile: binding, shards: shardBindings });

export const profileState = oneOf(["draft", "pending", "applying", "ready"] as const);
export interface ProfileSummary {
  readonly id: string;
  readonly name: string;
  readonly state: ReturnType<typeof profileState.parse>;
  readonly default: boolean;
  readonly metal: boolean;
}
export function profileSummary(body: Record<string, unknown>, allowed: readonly Binding[]): ProfileSummary {
  const id = identifier.parse(body.id);
  const name = slug.parse(body.name);
  requireThat(allowed.some(item => item.id === id && item.name === name), "scope");
  return Object.freeze({ id, name, state: profileState.parse(body.state), default: flag(body.default), metal: flag(body.metal) });
}

export function profileShardSummary(body: Record<string, unknown>, profile: Binding, allowed: readonly ReturnType<typeof shardBinding.parse>[]): ShardSummary {
  requireThat(body.configuration_profile === profile.name, "scope");
  // Authoritative/ready/default/metal are metadata, never configuration or spend authority.
  return shardSummary(body, allowed);
}
