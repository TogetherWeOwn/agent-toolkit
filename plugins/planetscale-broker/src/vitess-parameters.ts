import { closed, oneOf, requireThat, text, type Schema } from "../../../packages/core/src/schema.js";
import { flag, record, slug } from "./metadata.js";

const name = text(128, /^[a-z][a-z0-9_.-]*$/);
const names: Schema<readonly string[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length <= 32, "schema");
  const parsed = value.map(item => name.parse(item));
  requireThat(new Set(parsed).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };
const keyspace = closed({ name: slug, vttablet: names, mysqld: names });
const keyspaces: Schema<readonly ReturnType<typeof keyspace.parse>[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length <= 32, "schema");
  const parsed = value.map(item => keyspace.parse(item));
  requireThat(new Set(parsed.map(item => item.name)).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };
// Definition names are not immutable resource IDs. Scope cannot grant collection access.
export const vitessParameterScope = closed({ organization: slug, database: slug, branch: slug, vtgate: names, keyspaces });
const component = oneOf(["vtgate", "vttablet", "mysqld"] as const);
const parameterType = oneOf(["boolean", "bytes", "duration", "float", "integer", "select", "string"] as const);
export interface VitessParameterSummary {
  readonly name: string;
  readonly component: ReturnType<typeof component.parse>;
  readonly parameterType: ReturnType<typeof parameterType.parse>;
  readonly override: boolean;
}
export interface VitessParameterMetadata {
  readonly vtgate: readonly VitessParameterSummary[];
  readonly keyspaces: readonly Readonly<{ name: string; vttablet: readonly VitessParameterSummary[]; mysqld: readonly VitessParameterSummary[] }>[];
  readonly configurationAuthority: "not-established";
}
function parameters(value: unknown, expected: VitessParameterSummary["component"], allowed: readonly string[]): readonly VitessParameterSummary[] {
  requireThat(Array.isArray(value) && value.length <= 32, "upstream");
  const result = value.map(item => {
    const body = record(item);
    requireThat(body.type === "VitessParameterDefinition", "upstream");
    const parsedName = name.parse(body.name);
    const parsedComponent = component.parse(body.component);
    requireThat(allowed.includes(parsedName) && parsedComponent === expected, "scope");
    // Current/default values, options, titles and descriptions are never projected.
    return Object.freeze({ name: parsedName, component: parsedComponent, parameterType: parameterType.parse(body.parameter_type), override: flag(body.override) });
  });
  requireThat(new Set(result.map(item => item.name)).size === result.length, "upstream");
  return Object.freeze(result);
}
export function vitessParameterMetadata(body: Record<string, unknown>, scope: ReturnType<typeof vitessParameterScope.parse>): VitessParameterMetadata {
  requireThat(body.type === "VitessParameters", "upstream");
  const rawKeyspaces = record(body.keyspaces);
  const entries = Object.entries(rawKeyspaces);
  requireThat(entries.length <= 32, "upstream");
  const projected = entries.map(([key, value]) => {
    const binding = scope.keyspaces.find(item => item.name === key);
    requireThat(binding !== undefined, "scope");
    const row = record(value);
    requireThat(Object.keys(row).every(field => field === "vttablet" || field === "mysqld"), "upstream");
    return Object.freeze({ name: binding.name, vttablet: parameters(row.vttablet, "vttablet", binding.vttablet), mysqld: parameters(row.mysqld, "mysqld", binding.mysqld) });
  });
  return Object.freeze({ vtgate: parameters(body.vtgate, "vtgate", scope.vtgate), keyspaces: Object.freeze(projected), configurationAuthority: "not-established" });
}
