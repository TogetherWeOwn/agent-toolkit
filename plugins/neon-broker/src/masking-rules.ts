import { closed, identifier, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS } from "./metadata.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const MASKING_RULE_OPERATIONS = ["getMaskingRules"] as const;
export interface NeonMaskingRuleSelection {
  readonly database_name: string;
  readonly schema_name: string;
  readonly table_name: string;
  readonly column_name: string;
}
export interface NeonMaskingRuleScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly revision: string;
  readonly rules: readonly NeonMaskingRuleSelection[];
}
const pathId = text(60, /^[a-z0-9-]+$/);
const catalogName = text(63, /^[A-Za-z_][A-Za-z0-9_-]*$/);
const selectionSchema = closed({ database_name: catalogName, schema_name: catalogName, table_name: catalogName, column_name: catalogName });
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId });
function key(rule: NeonMaskingRuleSelection): string {
  return JSON.stringify([rule.database_name, rule.schema_name, rule.table_name, rule.column_name]);
}

export function createNeonMaskingRuleOperations(scope: NeonMaskingRuleScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, revision: identifier,
    rules: { parse: (v: unknown) => rows(v, MAX_ITEMS).map(value => selectionSchema.parse(value)) },
  }).parse(scope);
  const selected = new Set(config.rules.map(key));
  check(selected.size === config.rules.length);
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.project_id !== config.projectId || args.branch_id !== config.branchId) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/projects/${config.projectId}/branches/${config.branchId}/masking_rules`, revision: config.revision },
      arguments: args, plan: { operation: MASKING_RULE_OPERATIONS[0], ...args }, artifactDigest: null };
  }
  function ancestry(raw: unknown) {
    const projectId = optional(raw, "project_id");
    const branchId = optional(raw, "branch_id");
    check(projectId === undefined || projectId === config.projectId);
    check(branchId === undefined || branchId === config.branchId);
    check(optional(raw, "pagination") === undefined);
  }
  function project(raw: unknown): Json {
    ancestry(raw);
    const seen = new Set<string>();
    const maskingRules = rows(field(raw, "masking_rules"), MAX_ITEMS).flatMap(value => {
      ancestry(value);
      const rule = { database_name: catalogName.parse(field(value, "database_name")),
        schema_name: catalogName.parse(field(value, "schema_name")), table_name: catalogName.parse(field(value, "table_name")),
        column_name: catalogName.parse(field(value, "column_name")) };
      const identity = key(rule);
      check(!seen.has(identity));
      seen.add(identity);
      // Expressions and literal values are sensitive and never read or evaluated.
      return selected.has(identity) ? [rule] : [];
    });
    return { masking_rules: maskingRules };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${MASKING_RULE_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = await transport.getMaskingRules(config.projectId, config.branchId, { credential, signal });
      // The fixed request binds the identity-free response; contradictory extras refuse.
      project(raw);
      return raw;
    },
    project,
  })]);
}
