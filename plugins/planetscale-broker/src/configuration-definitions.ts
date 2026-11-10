import { closed, identifier, oneOf, requireThat, text, type Schema } from "../../../packages/core/src/schema.js";
import { flag, slug } from "./metadata.js";

const name = text(128, /^[a-z][a-z0-9_.-]*$/);
const namedBinding = closed({ name });
const parentBinding = closed({ id: identifier, name: slug });
const postgresNamespace = oneOf(["patroni", "pgbouncer", "pgconf"] as const);
const nekiNamespace = oneOf(["admin", "pgconf", "replicator", "router", "sidecar"] as const);
const namespace = oneOf(["patroni", "pgbouncer", "pgconf", "admin", "replicator", "router", "sidecar"] as const);
const parameterBinding = closed({ name, namespace });
type ParameterBinding = ReturnType<typeof parameterBinding.parse>;
function bindings<T>(schema: Schema<T>, key: (item: T) => string): Schema<readonly T[]> {
  return { parse(value) {
    requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
    const parsed = value.map(item => schema.parse(item));
    requireThat(new Set(parsed.map(key)).size === parsed.length, "schema");
    return Object.freeze(parsed);
  } };
}
const extensions = bindings(namedBinding, item => item.name);
const parameters = bindings(parameterBinding, item => `${item.namespace}:${item.name}`);
export { extensions as extensionBindings, parameters as parameterBindings };
const branchFields = { organization: slug, database: slug, branch: slug };
// Definition names/namespace pairs are not immutable provider resource IDs.
// Parent ownership, current engine and collection permission need trusted revalidation.
export const extensionScope = closed({ ...branchFields, extensions });
export const profileExtensionScope = closed({ ...branchFields, profile: parentBinding, extensions });
export const parameterScope = closed({ ...branchFields, parameters });
export const profileParameterScope = closed({ ...branchFields, profile: parentBinding, parameters });
export const routerParameterScope = closed({ ...branchFields, router: parentBinding, parameters });

export interface ExtensionSummary {
  readonly name: string;
  readonly canEnable: boolean;
  readonly enabled: boolean | null;
  readonly internal: boolean;
}
export function extensionSummary(body: Record<string, unknown>, allowed: ReturnType<typeof extensions.parse>): ExtensionSummary {
  const parsedName = name.parse(body.name);
  requireThat(allowed.some(item => item.name === parsedName), "scope");
  // Missing/null enabled is unknown, never false. canEnable is not native authority.
  return Object.freeze({ name: parsedName, canEnable: flag(body.can_enable), enabled: body.enabled === undefined || body.enabled === null ? null : flag(body.enabled), internal: flag(body.internal) });
}

const parameterType = oneOf(["array", "boolean", "bytes", "float", "integer", "select", "string", "time"] as const);
export interface ParameterSummary {
  readonly name: string;
  readonly namespace: ParameterBinding["namespace"];
  readonly parameterType: ReturnType<typeof parameterType.parse>;
  readonly internal: boolean;
  readonly disabled: boolean;
  readonly required: boolean;
  readonly restart: boolean;
}
export function validateParameterNamespaces(allowed: readonly ParameterBinding[], engine: "postgres" | "neki"): void {
  for (const item of allowed) (engine === "postgres" ? postgresNamespace : nekiNamespace).parse(item.namespace);
}
export function parameterSummary(body: Record<string, unknown>, allowed: readonly ParameterBinding[], engine: "postgres" | "neki"): ParameterSummary {
  const parsedName = name.parse(body.name);
  const parsedNamespace = (engine === "postgres" ? postgresNamespace : nekiNamespace).parse(body.namespace);
  requireThat(allowed.some(item => item.name === parsedName && item.namespace === parsedNamespace), "scope");
  // No value/default/options, URLs, actors or nullable parameter IDs are projected.
  return Object.freeze({ name: parsedName, namespace: parsedNamespace, parameterType: parameterType.parse(body.parameter_type), internal: flag(body.internal), disabled: flag(body.disabled), required: flag(body.required), restart: flag(body.restart) });
}
