import { closed, identifier, oneOf, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { slug } from "./metadata.js";

const binding = closed({ id: identifier, name: identifier });
type Binding = ReturnType<typeof binding.parse>;
const bindings: Schema<readonly Binding[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => binding.parse(item));
  requireThat(new Set(parsed.map(item => item.id)).size === parsed.length, "schema");
  requireThat(new Set(parsed.map(item => item.name)).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };
const branchFields = { organization: slug, database: slug, branch: slug };
// The detail route uses the name, not the ID. Current trusted ownership is separate.
export const queryTagScope = closed({ ...branchFields, tag: binding });
export const queryTagListScope = closed({ ...branchFields, tags: bindings });
const source = oneOf(["sql", "system"] as const);
export interface QueryTagMetadata {
  readonly id: string;
  readonly source: "sql" | "system";
  readonly executionAuthority: "not-established";
}
export function queryTagMetadata(body: Record<string, unknown>, allowed: readonly Binding[]): QueryTagMetadata {
  const id = identifier.parse(body.id);
  const name = identifier.parse(body.name);
  requireThat(allowed.some(item => item.id === id && item.name === name), "scope");
  // Tag names, values, counts and SQL-derived dimensions never enter the receipt.
  return Object.freeze({ id, source: source.parse(body.source), executionAuthority: "not-established" });
}
