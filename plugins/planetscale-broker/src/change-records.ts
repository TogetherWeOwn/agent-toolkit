import { closed, identifier, oneOf, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { slug } from "./metadata.js";

const changeBinding = closed({ id: identifier });
const keyspaceBinding = closed({ id: identifier, name: slug });
export const changeType = oneOf(["vtgate", "mysqld", "vttablet"] as const);
const nullableKeyspace: Schema<string | null> = { parse(value) { return value === null ? null : slug.parse(value); } };
const configFields = closed({ id: identifier, changeType, keyspace: nullableKeyspace });
export const configBinding: typeof configFields = { parse(value) {
  const parsed = configFields.parse(value);
  requireThat((parsed.changeType === "vtgate") === (parsed.keyspace === null), "scope");
  return parsed;
} };
function bindings<T extends { readonly id: string }>(schema: Schema<T>): Schema<readonly T[]> {
  return { parse(value) {
    requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
    const parsed = value.map(item => schema.parse(item));
    requireThat(new Set(parsed.map(item => item.id)).size === parsed.length, "schema");
    return Object.freeze(parsed);
  } };
}
const branchFields = { organization: slug, database: slug, branch: slug };
// Broker-owned response confinement, not parent ownership or collection authority.
export const branchChangeScope = closed({ ...branchFields, change: changeBinding });
export const branchChangeListScope = closed({ ...branchFields, changes: bindings(changeBinding) });
export const branchConfigScope = closed({ ...branchFields, change: configBinding });
export const branchConfigListScope = closed({ ...branchFields, changes: bindings(configBinding) });
export const keyspaceConfigScope = closed({ ...branchFields, keyspace: keyspaceBinding, change: configBinding });
export const keyspaceConfigListScope = closed({ ...branchFields, keyspace: keyspaceBinding, changes: bindings(configBinding) });

export function requireBranchConfig(binding: ReturnType<typeof configBinding.parse>): void {
  requireThat(binding.changeType === "vtgate" && binding.keyspace === null, "scope");
}
export function requireKeyspaceConfig(binding: ReturnType<typeof configBinding.parse>, keyspace: string): void {
  requireThat(binding.changeType !== "vtgate" && binding.keyspace === keyspace, "scope");
}

export const configState = oneOf(["draft", "pending", "queued", "applying", "completed", "failed", "canceled"] as const);
export interface ConfigChangeSummary {
  readonly id: string;
  readonly state: ReturnType<typeof configState.parse>;
  readonly changeType: ReturnType<typeof changeType.parse>;
  readonly keyspace: string | null;
}
export function configChangeSummary(body: Record<string, unknown>, allowed: readonly ReturnType<typeof configBinding.parse>[]): ConfigChangeSummary {
  const id = identifier.parse(body.id);
  const binding = allowed.find(item => item.id === id);
  requireThat(binding !== undefined, "scope");
  requireThat(body.change_type === binding.changeType && body.keyspace_name === binding.keyspace, "scope");
  // Provider state/type is informational, never native config/spend approval.
  return Object.freeze({ id: binding.id, state: configState.parse(body.state), changeType: binding.changeType, keyspace: binding.keyspace });
}
