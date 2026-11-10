import { closed, identifier, integer, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS } from "./metadata.js";
import { boolean as booleanValue, check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const TRIGGER_OPERATIONS = ["listProjectBranchTriggers", "getProjectBranchTrigger"] as const;
type TriggerOperation = typeof TRIGGER_OPERATIONS[number];
type TriggerArguments = { readonly project_id: string; readonly branch_id: string; readonly trigger_id?: string };
export const MAX_TRIGGER_BINDINGS = 16;
export interface NeonTriggerScope {
  readonly projectId: string;
  readonly revision: string;
  readonly branchIds: readonly string[];
  readonly triggers: readonly { readonly id: string; readonly branchId: string; readonly functionSlug: string }[];
}
const slug = text(20, /^[a-z0-9]+$/);
const responseId = text(128, /^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const triggerType = oneOf(["schedule", "storage_object_created"] as const);
const version = integer(1, Number.MAX_SAFE_INTEGER);
const branchArguments = closed({ project_id: identifier, branch_id: identifier });
const detailArguments = closed({ project_id: identifier, branch_id: identifier, trigger_id: identifier });

export function createNeonTriggerOperations(scope: NeonTriggerScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: identifier, revision: text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/),
    branchIds: { parse: (v: unknown) => rows(v, MAX_TRIGGER_BINDINGS).map(value => identifier.parse(value)) },
    triggers: { parse: (v: unknown) => rows(v, MAX_TRIGGER_BINDINGS).map(value => closed({ id: identifier, branchId: identifier, functionSlug: slug }).parse(value)) },
  }).parse(scope);
  const branches = new Set(config.branchIds);
  const key = (branch: string, id: string) => `${branch}/${id}`;
  // Inherited triggers retain project-wide IDs. Each effective branch needs its own binding.
  const targets = new Map(config.triggers.map(value => [key(value.branchId, value.id), value]));
  check(branches.size === config.branchIds.length && targets.size === config.triggers.length);
  check(config.triggers.every(value => branches.has(value.branchId)));

  function parse(name: TriggerOperation, raw: unknown): TriggerArguments {
    const args: TriggerArguments = name === "getProjectBranchTrigger" ? detailArguments.parse(raw) : branchArguments.parse(raw);
    if (args.project_id !== config.projectId || !branches.has(args.branch_id) ||
      (args.trigger_id !== undefined && !targets.has(key(args.branch_id, args.trigger_id)))) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepareFor(name: TriggerOperation, raw: unknown): Prepared {
    const args = parse(name, raw);
    return { resource: { id: `neon/projects/${config.projectId}/branches/${args.branch_id}/triggers${args.trigger_id === undefined ? "" : `/${args.trigger_id}`}`, revision: config.revision },
      arguments: args, plan: { operation: name, ...args }, artifactDigest: null };
  }
  function identity(raw: unknown, branchId: string): void {
    const project = optional(raw, "project_id");
    const branch = optional(raw, "branch_id");
    check(project === undefined || project === config.projectId);
    check(branch === undefined || branch === branchId);
    check(optional(raw, "pagination") === undefined);
  }
  function projectTrigger(raw: unknown, branchId: string) {
    identity(raw, branchId);
    const id = identifier.parse(field(raw, "trigger_id"));
    const binding = targets.get(key(branchId, id));
    check(binding && field(raw, "function_slug") === binding.functionSlug);
    return { trigger_id: id, type: triggerType.parse(field(raw, "type")), function_slug: binding.functionSlug,
      enabled: booleanValue(field(raw, "enabled")), inherited: booleanValue(field(raw, "inherited")),
      version: version.parse(field(raw, "version")) };
  }
  function projectFor(name: TriggerOperation, raw: unknown): Json {
    // execute attaches request context, not provider-supplied ancestry evidence.
    const branchId = identifier.parse(field(raw, "branch_id"));
    check(branches.has(branchId));
    identity(raw, branchId);
    if (name === "getProjectBranchTrigger") return { trigger: projectTrigger(field(raw, "trigger"), branchId) };
    const seen = new Set<string>();
    const selected = rows(field(raw, "triggers"), MAX_ITEMS).flatMap(value => {
      identity(value, branchId);
      const id = responseId.parse(field(value, "trigger_id"));
      check(!seen.has(id));
      seen.add(id);
      return targets.has(key(branchId, id)) ? [projectTrigger(value, branchId)] : [];
    });
    return { triggers: selected };
  }
  return Object.freeze(TRIGGER_OPERATIONS.map(name => Object.freeze({
    name: `neon.${name}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare(raw: unknown): Prepared { return prepareFor(name, raw); },
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(name, prepared.arguments);
      const expected = prepareFor(name, args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const options = { credential, signal };
      const raw = name === "getProjectBranchTrigger" ?
        await transport.getProjectBranchTrigger(config.projectId, args.branch_id, args.trigger_id!, options) :
        await transport.listProjectBranchTriggers(config.projectId, args.branch_id, options);
      identity(raw, args.branch_id);
      const value = name === "getProjectBranchTrigger" ? { branch_id: args.branch_id, trigger: field(raw, "trigger") } :
        { branch_id: args.branch_id, triggers: field(raw, "triggers") };
      if (name === "getProjectBranchTrigger") check(field(field(raw, "trigger"), "trigger_id") === args.trigger_id);
      projectFor(name, value);
      return value;
    },
    project(raw: unknown): Json { return projectFor(name, raw); },
  })));
}
