import { closed, identifier, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const ADVISOR_OPERATIONS = ["getProjectAdvisorSecurityIssues"] as const;
export interface NeonAdvisorScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly databaseName: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9-]+$/);
const databaseName = text(63, /^[A-Za-z_][A-Za-z0-9_-]*$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, database_name: databaseName });
const level = oneOf(["ERROR", "WARN", "INFO"]);
const category = oneOf(["SECURITY", "PERFORMANCE"]);
const cacheKey = text(256, /^[\x20-\x7e]+$/);

// The provider analyzes a database. This source seam is not non-waking qualification.
export function createNeonAdvisorOperations(scope: NeonAdvisorScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, databaseName, revision: identifier }).parse(scope);
  const resource = text(256, /^[A-Za-z0-9_/-]+$/).parse(
    `neon/projects/${config.projectId}/branches/${config.branchId}/databases/${config.databaseName}/advisors/security`);
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.project_id !== config.projectId || args.branch_id !== config.branchId || args.database_name !== config.databaseName) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: resource, revision: config.revision }, arguments: args,
      plan: { operation: ADVISOR_OPERATIONS[0], ...args, category: "SECURITY", min_severity: "INFO" }, artifactDigest: null };
  }
  function ancestry(raw: unknown) {
    check(optional(raw, "pagination") === undefined);
    for (const [key, expected] of [["project_id", config.projectId], ["branch_id", config.branchId], ["database_name", config.databaseName]]) {
      const value = optional(raw, key);
      check(value === undefined || value === expected);
    }
  }
  function project(raw: unknown): Json {
    ancestry(raw);
    const counts = { ERROR: 0, WARN: 0, INFO: 0 };
    const seen = new Set<string>();
    for (const item of rows(field(raw, "issues"), 30)) {
      ancestry(item);
      const key = cacheKey.parse(field(item, "cache_key"));
      check(!seen.has(key));
      seen.add(key);
      const categories = rows(field(item, "categories"), 2).map(value => category.parse(value));
      check(categories.includes("SECURITY") && new Set(categories).size === categories.length);
      counts[level.parse(field(item, "level"))]++;
    }
    return { counts };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${ADVISOR_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = await transport.getProjectAdvisorSecurityIssues(config.projectId, config.branchId, config.databaseName, { credential, signal });
      project(raw);
      return raw;
    },
    project,
  })]);
}
