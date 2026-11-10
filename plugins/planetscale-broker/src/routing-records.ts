import { closed, identifier, oneOf, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { flag, slug } from "./metadata.js";
import { timestampPresent } from "./security-records.js";

const binding = closed({ id: identifier, name: slug });
type Binding = ReturnType<typeof binding.parse>;
const bindings: Schema<readonly Binding[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => binding.parse(item));
  requireThat(new Set(parsed.map(item => item.id)).size === parsed.length, "schema");
  requireThat(new Set(parsed.map(item => item.name)).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };
const ids: Schema<readonly string[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => identifier.parse(item));
  requireThat(new Set(parsed).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };
export { bindings as routingBindings, ids as routingIds };
const branchFields = { organization: slug, database: slug, branch: slug };
// Fixed paths and matching children do not establish trusted parent ownership.
export const routerScope = closed({ ...branchFields, router: binding });
export const routerListScope = closed({ ...branchFields, routers: bindings });
export const replicaScope = closed({ ...branchFields, replica: binding });
export const replicaListScope = closed({ ...branchFields, replicas: bindings });
export const switchoverScope = closed({ ...branchFields, switchoverId: identifier });
export const switchoverListScope = closed({ ...branchFields, switchoverIds: ids });

function matched(body: Record<string, unknown>, allowed: readonly Binding[]): Binding {
  const id = identifier.parse(body.id);
  const name = slug.parse(body.name);
  requireThat(allowed.some(item => item.id === id && item.name === name), "scope");
  return Object.freeze({ id, name });
}

export const routerState = oneOf(["pending", "applying", "ready"] as const);
export interface RouterSummary {
  readonly id: string;
  readonly name: string;
  readonly state: ReturnType<typeof routerState.parse>;
  readonly default: boolean;
  readonly autoscaling: boolean;
}
export function routerSummary(body: Record<string, unknown>, allowed: readonly Binding[]): RouterSummary {
  return Object.freeze({
    ...matched(body, allowed), state: routerState.parse(body.state),
    default: flag(body.default), autoscaling: flag(body.autoscaling),
  });
}

// The pinned replica schema documents these states in prose, not an enum.
export const replicaState = oneOf(["pending", "ready", "deleting"] as const);
export interface ReplicaSummary {
  readonly id: string;
  readonly name: string;
  readonly state: ReturnType<typeof replicaState.parse>;
  readonly ready: boolean;
}
export function replicaSummary(body: Record<string, unknown>, allowed: readonly Binding[]): ReplicaSummary {
  return Object.freeze({ ...matched(body, allowed), state: replicaState.parse(body.state), ready: flag(body.ready) });
}

export const switchoverState = oneOf(["pending", "running", "succeeded", "failed", "canceled"] as const);
export interface SwitchoverSummary {
  readonly id: string;
  readonly state: ReturnType<typeof switchoverState.parse>;
  readonly startRecorded: boolean;
  readonly finishRecorded: boolean;
}
export function switchoverSummary(body: Record<string, unknown>, allowed: readonly string[]): SwitchoverSummary {
  const id = identifier.parse(body.id);
  requireThat(allowed.includes(id), "scope");
  // Failed outcomes can be ambiguous; timestamps/state prove neither rollback nor closure.
  return Object.freeze({
    id, state: switchoverState.parse(body.state), startRecorded: timestampPresent(body.started_at),
    finishRecorded: timestampPresent(body.completed_at),
  });
}
