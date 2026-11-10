import { closed, identifier, integer, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS } from "./metadata.js";
import { boolean, check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const CAPABILITY_OPERATIONS = ["getAvailablePreloadLibraries", "getAnonymizedBranchStatus",
  "listSnapshots", "getSnapshotSchedule"] as const;
type CapabilityOperation = typeof CAPABILITY_OPERATIONS[number];
type CapabilityArguments = { readonly project_id: string; readonly branch_id?: string };
export interface NeonCapabilityScope {
  readonly projectId: string;
  readonly revision: string;
  readonly branchIds: readonly string[];
  readonly snapshots: readonly { readonly id: string; readonly branchId: string }[];
}

const projectArguments = closed({ project_id: identifier });
const branchArguments = closed({ project_id: identifier, branch_id: identifier });
const state = oneOf(["created", "initialized", "initialization_error", "anonymizing", "anonymized", "error"]);
const libraryName = text(63, /^[A-Za-z_][A-Za-z0-9_-]*$/);
const libraryVersion = text(64, /^[A-Za-z0-9][A-Za-z0-9_.+-]*$/);

function timestamp(raw: unknown): string {
  const value = text(32, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/).parse(raw);
  const parsed = Date.parse(value);
  check(Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19));
  return value;
}

// Trusted selections bind snapshots to branches; they do not supply policy or identity.
export function createNeonCapabilityOperations(scope: NeonCapabilityScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: identifier, revision: text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/),
    branchIds: { parse: (v: unknown) => rows(v, MAX_ITEMS).map(value => identifier.parse(value)) },
    snapshots: { parse: (v: unknown) => rows(v, MAX_ITEMS).map(value => closed({ id: identifier, branchId: identifier }).parse(value)) },
  }).parse(scope);
  const branches = new Set(config.branchIds);
  const snapshots = new Map(config.snapshots.map(value => [value.id, value.branchId]));
  check(branches.size === config.branchIds.length && snapshots.size === config.snapshots.length &&
    config.snapshots.every(value => branches.has(value.branchId)));
  const projectId = config.projectId;
  const root = `neon/projects/${projectId}`;

  function parse(name: CapabilityOperation, raw: unknown): CapabilityArguments {
    const args: CapabilityArguments = name === "getAnonymizedBranchStatus" || name === "getSnapshotSchedule" ?
      branchArguments.parse(raw) : projectArguments.parse(raw);
    if (args.project_id !== projectId || (args.branch_id !== undefined && !branches.has(args.branch_id))) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepareFor(name: CapabilityOperation, raw: unknown): Prepared {
    const args = parse(name, raw);
    const resource = name === "getAvailablePreloadLibraries" ? `${root}/available_preload_libraries` :
      name === "listSnapshots" ? `${root}/snapshots` :
      `${root}/branches/${args.branch_id}/${name === "getAnonymizedBranchStatus" ? "anonymized_status" : "backup_schedule"}`;
    return { resource: { id: resource, revision: config.revision }, arguments: args as Json,
      plan: { operation: name, ...args }, artifactDigest: null };
  }
  function projectFor(name: CapabilityOperation, raw: unknown): Json {
    check(optional(raw, "pagination") === undefined);
    if (name === "getAnonymizedBranchStatus") {
      const branchId = identifier.parse(field(raw, "branch_id"));
      check(field(raw, "project_id") === projectId && branches.has(branchId));
      // status_message and last_run can disclose table names, diagnostics and actors.
      return { project_id: projectId, branch_id: branchId, state: state.parse(field(raw, "state")) };
    }
    if (name === "getSnapshotSchedule") {
      return { schedule: rows(field(raw, "schedule"), MAX_ITEMS).map(value => {
        const item: Record<string, Json> = { frequency: oneOf(["daily", "weekly", "monthly"]).parse(field(value, "frequency")) };
        for (const [key, min, max] of [["hour", 0, 23], ["day", 1, 31], ["month", 1, 12], ["retention_seconds", 3600, 3024000]] as const) {
          const selected = optional(value, key);
          if (selected !== undefined) item[key] = integer(min, max).parse(selected);
        }
        return item;
      }) };
    }
    const seen = new Set<string>();
    if (name === "getAvailablePreloadLibraries") {
      return { libraries: rows(field(raw, "libraries"), MAX_ITEMS).map(value => {
        const name = libraryName.parse(field(value, "library_name"));
        check(!seen.has(name));
        seen.add(name);
        return { library_name: name, is_default: boolean(field(value, "is_default")),
          is_experimental: boolean(field(value, "is_experimental")), version: libraryVersion.parse(field(value, "version")) };
      }) };
    }
    return { snapshots: rows(field(raw, "snapshots"), MAX_ITEMS).flatMap(value => {
      const id = identifier.parse(field(value, "id"));
      check(!seen.has(id));
      seen.add(id);
      const returnedProject = optional(value, "project_id");
      check(returnedProject === undefined || returnedProject === projectId);
      const branchId = snapshots.get(id);
      if (branchId === undefined) return [];
      // source_branch_id is optional upstream: selected rows without binding evidence refuse.
      check(field(value, "source_branch_id") === branchId);
      const manual = optional(value, "manual");
      return [{ id, source_branch_id: branchId, created_at: timestamp(field(value, "created_at")),
        ...(manual === undefined ? {} : { manual: boolean(manual) }) }];
    }) };
  }
  return Object.freeze(CAPABILITY_OPERATIONS.map(name => Object.freeze({
    name: `neon.${name}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare(raw: unknown): Prepared { return prepareFor(name, raw); },
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(name, prepared.arguments);
      const expected = prepareFor(name, args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const options = { credential, signal };
      const raw = name === "getAvailablePreloadLibraries" ? await transport.getAvailablePreloadLibraries(projectId, options) :
        name === "getAnonymizedBranchStatus" ? await transport.getAnonymizedBranchStatus(projectId, args.branch_id!, options) :
        name === "listSnapshots" ? await transport.listSnapshots(projectId, options) :
        await transport.getSnapshotSchedule(projectId, args.branch_id!, options);
      if (name === "getAnonymizedBranchStatus") check(field(raw, "branch_id") === args.branch_id);
      projectFor(name, raw);
      return raw;
    },
    project(raw: unknown): Json { return projectFor(name, raw); },
  })));
}
