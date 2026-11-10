import { closed, jsonData, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { branchLabel } from "./branch-update.js";
import { check, field, optional, rows } from "./projection.js";
import { MAX_PAGES } from "./metadata.js";
import { PAGE_SIZE, type NeonMetadataTransport } from "./transport.js";

export interface NeonBranchCreateScope {
  readonly projectId: string;
  readonly parentId: string;
  readonly name: string;
  readonly revision: string;
}
const projectId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const branchId = text(60, /^br-[a-z0-9][a-z0-9-]*$/);
const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const argumentsSchema = closed({ project_id: projectId, parent_id: branchId, name: branchLabel });
const operationId = text(36, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const status = oneOf(["scheduling", "running", "finished", "failed", "error", "cancelling", "cancelled", "skipped"]);

// Source only. Schema-only initialization and no requested compute are not runtime isolation.
export function createNeonBranchCreateOperations(scope: NeonBranchCreateScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId, parentId: branchId, name: branchLabel, revision }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.parentId}/create/${config.name}`;
  check(resourceId.length <= 256);
  const desired = { parent_id: config.parentId, name: config.name, init_source: "parent-schema", protected: false };
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.parent_id === config.parentId && args.name === config.name);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "createProjectBranch", ...args, effect: "request_schema_only_child_branch_creation",
        preflight: "parent_identity_and_bounded_branch_name_absence", atomicCompareAndSwap: false,
        diff: { before: "selected_branch_name_absent", after: { branch: { ...desired } } },
        endpointsRequested: false, inheritedFeatures: "provider_controlled", dataIsolationVerified: false,
        reconciliation: "one_bounded_branch_list_observation_no_retry", completion: "acknowledgement_only",
        persistenceVerified: false }, artifactDigest: null };
  }
  function projectBinding(raw: unknown): void {
    const value = optional(raw, "project_id");
    check(value === undefined || value === config.projectId);
  }
  function receipt(raw: unknown): Json {
    projectBinding(raw);
    check(optional(raw, "pagination") === undefined);
    const branch = field(raw, "branch");
    projectBinding(branch);
    check(field(branch, "project_id") === config.projectId && field(branch, "parent_id") === config.parentId &&
      field(branch, "name") === config.name && field(branch, "default") === false && field(branch, "protected") === false);
    const id = branchId.parse(field(branch, "id"));
    check(id !== config.parentId && rows(field(raw, "endpoints"), 0).length === 0);
    const seen = new Set<string>();
    const operations = rows(field(raw, "operations"), 30).map(value => {
      projectBinding(value);
      const operation = operationId.parse(field(value, "id"));
      const target = optional(value, "branch_id");
      check(field(value, "project_id") === config.projectId && (target === undefined || target === id) && !seen.has(operation));
      seen.add(operation);
      return { id: operation, status: status.parse(field(value, "status")) };
    });
    return { id, parent_id: config.parentId, acknowledged: true, operations };
  }
  return Object.freeze([Object.freeze({
    name: "neon.createProjectBranch", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 8500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const rawParent = await transport.getProjectBranch(config.projectId, config.parentId, options);
      projectBinding(rawParent);
      check(optional(rawParent, "pagination") === undefined);
      const parent = field(rawParent, "branch");
      check(field(parent, "id") === config.parentId && field(parent, "project_id") === config.projectId);
      async function observe(): Promise<boolean> {
        const cursors = new Set<string>();
        const ids = new Set<string>();
        let cursor: string | null = null;
        let found = false;
        for (let page = 0; page < MAX_PAGES; page++) {
          if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
          const raw = await transport.listProjectBranches(config.projectId, cursor, options);
          projectBinding(raw);
          for (const branch of rows(field(raw, "branches"), PAGE_SIZE)) {
            projectBinding(branch);
            const id = branchId.parse(field(branch, "id"));
            check(field(branch, "project_id") === config.projectId && !ids.has(id));
            ids.add(id);
            const name = text(256, /^[\x20-\x7e]+$/).parse(field(branch, "name"));
            if (name === config.name) found = true;
          }
          const pagination = optional(raw, "pagination");
          let next: string | null = null;
          if (pagination !== undefined) {
            jsonData(pagination);
            check(pagination !== null && typeof pagination === "object" && !Array.isArray(pagination));
            check(Object.keys(pagination).every(key => ["next", "sort_by", "sort_order"].includes(key)));
            const sort = optional(pagination, "sort_by");
            const order = optional(pagination, "sort_order");
            check((sort === undefined || sort === "name") && (order === undefined || order === "asc"));
            const value = optional(pagination, "next");
            next = value === undefined ? null : text(256, /^[\x20-\x7e]+$/).parse(value);
          }
          if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
          if (next === null) return found;
          check(!cursors.has(next));
          cursors.add(next);
          cursor = next;
        }
        throw Error("UPSTREAM_UNAVAILABLE");
      }
      check(await observe() === false);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.createProjectBranch(config.projectId, config.parentId, config.name, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        if (!signal.aborted) { try { await observe(); } catch { /* Presence is not causal creation evidence. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
