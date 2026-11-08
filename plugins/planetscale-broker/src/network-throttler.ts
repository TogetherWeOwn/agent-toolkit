import { closed, identifier, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { deployNumber } from "./lifecycle.js";
import { record, slug } from "./metadata.js";

function bindings(item: Schema<string>): Schema<readonly string[]> {
  return { parse(value) {
    requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
    const parsed = value.map(value => item.parse(value));
    requireThat(new Set(parsed).size === parsed.length, "schema");
    return Object.freeze(parsed);
  } };
}
const ids = bindings(identifier);
const names = bindings(slug);
// These broker-owned bindings confine output, not parent ownership or authority.
export const cidrScope = closed({ organization: slug, database: slug, cidrId: identifier });
export const cidrListScope = closed({ organization: slug, database: slug, cidrIds: ids });
export const databaseThrottlerScope = closed({ organization: slug, database: slug, configurableId: identifier, keyspaceNames: names });
export const deployThrottlerScope = closed({ organization: slug, database: slug, number: deployNumber, configurableId: identifier, keyspaceNames: names });

export interface CidrSummary {
  readonly id: string;
  readonly enforcementAuthority: "not-established";
}
export function cidrSummary(body: Record<string, unknown>, allowed: readonly string[]): CidrSummary {
  const id = identifier.parse(body.id);
  requireThat(allowed.includes(id), "scope");
  return Object.freeze({ id, enforcementAuthority: "not-established" as const });
}

export interface ThrottlerSummary {
  readonly configurableId: string;
  readonly keyspaces: readonly Readonly<{ name: string; configured: boolean }>[];
  readonly configurationAuthority: "not-established";
}
export function throttlerSummary(body: Record<string, unknown>, expected: string, allowed: readonly string[]): ThrottlerSummary {
  const configurableId = identifier.parse(record(body.configurable).id);
  requireThat(configurableId === expected, "scope");
  requireThat(Array.isArray(body.keyspaces) && body.keyspaces.length <= 32, "upstream");
  const keyspaces = body.keyspaces.map(value => {
    const name = slug.parse(value);
    requireThat(allowed.includes(name), "scope");
    return name;
  });
  requireThat(new Set(keyspaces).size === keyspaces.length, "upstream");
  requireThat(Array.isArray(body.configurations) && body.configurations.length <= 32, "upstream");
  const configured = body.configurations.map(value => {
    const row = record(value);
    const name = slug.parse(row.keyspace_name);
    requireThat(keyspaces.includes(name), "scope");
    requireThat(typeof row.ratio === "number" && Number.isFinite(row.ratio) && row.ratio >= 0 && row.ratio <= 95, "upstream");
    return name;
  });
  requireThat(new Set(configured).size === configured.length, "upstream");
  return Object.freeze({
    configurableId,
    keyspaces: Object.freeze(keyspaces.map(name => Object.freeze({ name, configured: configured.includes(name) }))),
    configurationAuthority: "not-established" as const,
  });
}
