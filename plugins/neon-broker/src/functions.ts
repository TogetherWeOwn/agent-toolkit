import { closed, identifier, integer, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS, MAX_PAGES } from "./metadata.js";
import { check, field, optional, rows } from "./projection.js";
import { PAGE_SIZE, type NeonMetadataTransport } from "./transport.js";

export const FUNCTION_OPERATIONS = ["listProjectBranchFunctions", "getProjectBranchFunction"] as const;
type FunctionOperation = typeof FUNCTION_OPERATIONS[number];
type FunctionArguments = { readonly project_id: string; readonly branch_id: string; readonly slug?: string };
export const MAX_FUNCTION_BINDINGS = 16;
export interface NeonFunctionScope {
  readonly projectId: string;
  readonly revision: string;
  readonly branchIds: readonly string[];
  readonly functions: readonly { readonly id: string; readonly slug: string; readonly branchId: string }[];
}
// The pinned detail path is narrower than the response's DNS-label description.
const slug = text(20, /^[a-z0-9]+$/);
const responseSlug = text(63, /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
const branchArguments = closed({ project_id: identifier, branch_id: identifier });
const detailArguments = closed({ project_id: identifier, branch_id: identifier, slug });
const deploymentId = integer(0, 2_147_483_647);
const deploymentStatus = oneOf(["pending", "building", "completed", "failed"] as const);

export function createNeonFunctionOperations(scope: NeonFunctionScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: identifier, revision: text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/),
    branchIds: { parse: (v: unknown) => rows(v, MAX_FUNCTION_BINDINGS).map(value => identifier.parse(value)) },
    functions: { parse: (v: unknown) => rows(v, MAX_FUNCTION_BINDINGS).map(value => closed({ id: identifier, slug, branchId: identifier }).parse(value)) },
  }).parse(scope);
  const branches = new Set(config.branchIds);
  const functions = new Map(config.functions.map(value => [value.id, value]));
  const key = (branch: string, name: string) => `${branch}/${name}`;
  const targets = new Map(config.functions.map(value => [key(value.branchId, value.slug), value]));
  check(branches.size === config.branchIds.length && functions.size === config.functions.length && targets.size === config.functions.length);
  check(config.functions.every(value => branches.has(value.branchId)));

  function parse(name: FunctionOperation, raw: unknown): FunctionArguments {
    const args: FunctionArguments = name === "getProjectBranchFunction" ? detailArguments.parse(raw) : branchArguments.parse(raw);
    if (args.project_id !== config.projectId || !branches.has(args.branch_id) ||
      (args.slug !== undefined && !targets.has(key(args.branch_id, args.slug)))) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepareFor(name: FunctionOperation, raw: unknown): Prepared {
    const args = parse(name, raw);
    return { resource: { id: `neon/projects/${config.projectId}/branches/${args.branch_id}/functions${args.slug === undefined ? "" : `/${args.slug}`}`, revision: config.revision },
      arguments: args, plan: { operation: name, ...args }, artifactDigest: null };
  }
  function identity(raw: unknown, branchId?: string): void {
    const project = optional(raw, "project_id");
    const branch = optional(raw, "branch_id");
    check(project === undefined || project === config.projectId);
    check(branch === undefined || (branchId === undefined ? branches.has(identifier.parse(branch)) : branch === branchId));
  }
  function deployment(raw: unknown, active: boolean) {
    const status = deploymentStatus.parse(field(raw, "status"));
    check(!active || status === "completed");
    return { id: deploymentId.parse(field(raw, "id")), status };
  }
  function projectFunction(raw: unknown) {
    const id = identifier.parse(field(raw, "id"));
    const binding = functions.get(id);
    check(binding && field(raw, "slug") === binding.slug);
    identity(raw, binding.branchId);
    check(optional(raw, "pagination") === undefined);
    const current = optional(raw, "current_deployment");
    const active = optional(raw, "active_deployment");
    return { id, slug: binding.slug,
      ...(current === undefined ? {} : { current_deployment: deployment(current, false) }),
      ...(active === undefined ? {} : { active_deployment: deployment(active, true) }) };
  }
  function projectFor(name: FunctionOperation, raw: unknown): Json {
    identity(raw);
    check(optional(raw, "pagination") === undefined);
    if (name === "getProjectBranchFunction") return { function: projectFunction(field(raw, "function")) };
    const seenIds = new Set<string>();
    const seenSlugs = new Set<string>();
    const selected = rows(field(raw, "functions"), MAX_ITEMS).flatMap(value => {
      const id = text(256, /^[\x20-\x7e]+$/).parse(field(value, "id"));
      const name = responseSlug.parse(field(value, "slug"));
      check(!seenIds.has(id) && !seenSlugs.has(name));
      seenIds.add(id);
      seenSlugs.add(name);
      return functions.has(id) ? [projectFunction(value)] : [];
    });
    return { functions: selected };
  }
  return Object.freeze(FUNCTION_OPERATIONS.map(name => Object.freeze({
    name: `neon.${name}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare(raw: unknown): Prepared { return prepareFor(name, raw); },
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(name, prepared.arguments);
      const expected = prepareFor(name, args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const options = { credential, signal };
      function validateRow(value: unknown): void {
        identity(value, args.branch_id);
        const binding = functions.get(text(256, /^[\x20-\x7e]+$/).parse(field(value, "id")));
        if (binding) check(binding.branchId === args.branch_id);
        const target = targets.get(key(args.branch_id, responseSlug.parse(field(value, "slug"))));
        if (target) check(field(value, "id") === target.id);
      }
      if (name === "getProjectBranchFunction") {
        const raw = await transport.getProjectBranchFunction(config.projectId, args.branch_id, args.slug!, options);
        identity(raw, args.branch_id);
        const value = field(raw, "function");
        check(field(value, "id") === targets.get(key(args.branch_id, args.slug!))!.id && field(value, "slug") === args.slug);
        validateRow(value);
        projectFor(name, raw);
        return raw;
      }
      const result: unknown[] = [];
      const cursors = new Set<string>();
      let cursor: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const raw = await transport.listProjectBranchFunctions(config.projectId, args.branch_id, cursor, options);
        identity(raw, args.branch_id);
        const values = rows(field(raw, "functions"), PAGE_SIZE);
        values.forEach(validateRow);
        result.push(...values);
        const pagination = optional(raw, "pagination");
        if (pagination === undefined) {
          const combined = { functions: result };
          projectFor(name, combined);
          return combined;
        }
        cursor = closed({ cursor: text(256, /^[\x20-\x7e]+$/) }).parse(pagination).cursor;
        check(!cursors.has(cursor));
        cursors.add(cursor);
      }
      throw Error("UPSTREAM_UNAVAILABLE");
    },
    project(raw: unknown): Json { return projectFor(name, raw); },
  })));
}
