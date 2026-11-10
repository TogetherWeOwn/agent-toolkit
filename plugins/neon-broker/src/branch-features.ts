import { closed, identifier, integer, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS } from "./metadata.js";
import { boolean, check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const BRANCH_FEATURE_OPERATIONS = ["getProjectBranchRealtime", "getProjectBranchStorage", "getProjectBranchAiGateway"] as const;
type BranchFeatureOperation = typeof BRANCH_FEATURE_OPERATIONS[number];
export interface NeonBranchFeatureScope {
  readonly projectId: string;
  readonly revision: string;
  readonly branchIds: readonly string[];
}
const argumentsSchema = closed({ project_id: identifier, branch_id: identifier });
const suffixes = { getProjectBranchRealtime: "realtime", getProjectBranchStorage: "storage", getProjectBranchAiGateway: "ai_gateway" } as const;

// Fixed management status reads only; no data-plane URL, secret or provisioning fallback.
export function createNeonBranchFeatureOperations(scope: NeonBranchFeatureScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: identifier, revision: text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/),
    branchIds: { parse: (v: unknown) => rows(v, MAX_ITEMS).map(value => identifier.parse(value)) },
  }).parse(scope);
  const branches = new Set(config.branchIds);
  check(branches.size === config.branchIds.length);

  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.project_id !== config.projectId || !branches.has(args.branch_id)) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepareFor(name: BranchFeatureOperation, raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/projects/${config.projectId}/branches/${args.branch_id}/${suffixes[name]}`, revision: config.revision },
      arguments: args, plan: { operation: name, ...args }, artifactDigest: null };
  }
  function projectFor(name: BranchFeatureOperation, raw: unknown): Json {
    check(optional(raw, "pagination") === undefined);
    // These schemas lack response identity fields: ancestry is the fixed request path.
    const projectId = optional(raw, "project_id");
    const branchId = optional(raw, "branch_id");
    check(projectId === undefined || projectId === config.projectId);
    check(branchId === undefined || branches.has(identifier.parse(branchId)));
    const enabled = boolean(field(raw, "enabled"));
    if (name !== "getProjectBranchRealtime") {
      // Storage/gateway 200 responses assert usable; 404 is unavailable, not disabled.
      check(enabled === true);
      return { enabled };
    }
    const revision = optional(raw, "revision");
    return { enabled, pending: boolean(field(raw, "pending")),
      ...(revision === undefined ? {} : { revision: integer(1, 2147483647).parse(revision) }) };
  }
  return Object.freeze(BRANCH_FEATURE_OPERATIONS.map(name => Object.freeze({
    name: `neon.${name}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare(raw: unknown): Prepared { return prepareFor(name, raw); },
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepareFor(name, args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const options = { credential, signal };
      const raw = name === "getProjectBranchRealtime" ? await transport.getProjectBranchRealtime(config.projectId, args.branch_id, options) :
        name === "getProjectBranchStorage" ? await transport.getProjectBranchStorage(config.projectId, args.branch_id, options) :
        await transport.getProjectBranchAiGateway(config.projectId, args.branch_id, options);
      const returnedBranch = optional(raw, "branch_id");
      check(returnedBranch === undefined || returnedBranch === args.branch_id);
      projectFor(name, raw);
      return raw;
    },
    project(raw: unknown): Json { return projectFor(name, raw); },
  })));
}
