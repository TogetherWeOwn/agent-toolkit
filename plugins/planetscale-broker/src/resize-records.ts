import { closed, identifier, oneOf, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { record, slug } from "./metadata.js";

const namedBinding = closed({ id: identifier, name: slug });
const resizeBinding = closed({ id: identifier });
const bouncerResizeBinding = closed({ id: identifier, bouncerId: identifier, bouncer: slug });
function bindings<T extends { readonly id: string }>(schema: Schema<T>): Schema<readonly T[]> {
  return { parse(value) {
    requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
    const parsed = value.map(item => schema.parse(item));
    requireThat(new Set(parsed.map(item => item.id)).size === parsed.length, "schema");
    return Object.freeze(parsed);
  } };
}
export const bouncerBindings = bindings(namedBinding);
export const resizeBindings = bindings(resizeBinding);
export const bouncerResizeBindings = bindings(bouncerResizeBinding);
const branchFields = { organization: slug, database: slug, branch: slug };
// Broker-owned response confinement only; parent ownership/collection authority is separate.
export const bouncerScope = closed({ ...branchFields, branchId: identifier, bouncer: namedBinding });
export const bouncerListScope = closed({ ...branchFields, branchId: identifier, bouncers: bouncerBindings });
export const branchBouncerResizeListScope = closed({ ...branchFields, resizes: bouncerResizeBindings });
export const bouncerResizeListScope = closed({ ...branchFields, bouncer: namedBinding, resizes: bouncerResizeBindings });
export const branchResizeScope = closed({ ...branchFields, resize: resizeBinding });
export const branchResizeListScope = closed({ ...branchFields, resizes: resizeBindings });
export const keyspaceResizeScope = closed({ ...branchFields, keyspace: namedBinding, resize: resizeBinding });
export const keyspaceResizeListScope = closed({ ...branchFields, keyspace: namedBinding, resizes: resizeBindings });

function matched<T extends { readonly id: string }>(body: Record<string, unknown>, allowed: readonly T[]): T {
  const id = identifier.parse(body.id);
  const binding = allowed.find(item => item.id === id);
  requireThat(binding !== undefined, "scope");
  return binding!;
}

export const bouncerTarget = oneOf(["primary", "replica", "replica_az_affinity"] as const);
export interface BouncerSummary {
  readonly id: string;
  readonly name: string;
  readonly branchId: string;
  readonly branch: string;
  readonly target: ReturnType<typeof bouncerTarget.parse>;
}
export function bouncerSummary(body: Record<string, unknown>, allowed: readonly ReturnType<typeof namedBinding.parse>[], branchId: string, branchName: string): BouncerSummary {
  const binding = matched(body, allowed);
  const branch = record(body.branch);
  requireThat(body.name === binding.name && branch.id === branchId && branch.name === branchName, "scope");
  return Object.freeze({ id: binding.id, name: binding.name, branchId, branch: branchName, target: bouncerTarget.parse(body.target) });
}

export const bouncerResizeState = oneOf(["pending", "resizing", "canceled", "completed"] as const);
export interface BouncerResizeSummary {
  readonly id: string;
  readonly bouncerId: string;
  readonly bouncer: string;
  readonly state: ReturnType<typeof bouncerResizeState.parse>;
}
export function bouncerResizeSummary(body: Record<string, unknown>, allowed: readonly ReturnType<typeof bouncerResizeBinding.parse>[]): BouncerResizeSummary {
  const binding = matched(body, allowed);
  const bouncer = record(body.bouncer);
  requireThat(bouncer.id === binding.bouncerId && bouncer.name === binding.bouncer, "scope");
  return Object.freeze({ id: binding.id, bouncerId: binding.bouncerId, bouncer: binding.bouncer, state: bouncerResizeState.parse(body.state) });
}

export const resizeState = oneOf(["pending", "resizing", "canceled", "completed", "queued"] as const);
export interface ResizeSummary {
  readonly id: string;
  readonly state: ReturnType<typeof resizeState.parse>;
}
export function resizeSummary(body: Record<string, unknown>, allowed: readonly ReturnType<typeof resizeBinding.parse>[]): ResizeSummary {
  // A provider state is informational, never spend, resize or cancellation authority.
  return Object.freeze({ id: matched(body, allowed).id, state: resizeState.parse(body.state) });
}
