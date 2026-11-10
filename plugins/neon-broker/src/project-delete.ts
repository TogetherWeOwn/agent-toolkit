import { closed, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const PROJECT_DELETE_OPERATIONS = ["deleteProject"] as const;
export interface NeonProjectDeleteScope {
  readonly projectId: string;
  readonly organizationId: string;
  readonly revision: string;
}
const projectId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const organizationId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const argumentsSchema = closed({ project_id: projectId });

// Source only. Project deletion cascades to all children; acknowledgement is not completion.
export function createNeonProjectDeleteOperations(scope: NeonProjectDeleteScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId, organizationId, revision }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/delete`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "deleteProject", ...args, organization_id: config.organizationId, effect: "request_project_deletion",
        preflight: "exact_project_and_owner", reconciliation: "bounded_project_observation_no_retry",
        diff: { before: "selected_project_and_all_children", after: "deletion_requested" }, completion: "acknowledgement_only",
        connectionFence: false, cascade: ["endpoints", "branches", "databases", "users"] }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    for (const [key, expected] of [["project_id", config.projectId], ["org_id", config.organizationId]] as const) {
      const value = optional(raw, key);
      check(value === undefined || value === expected);
    }
    check(optional(raw, "pagination") === undefined);
  }
  function bound(raw: unknown): void {
    ancestry(raw);
    const project = field(raw, "project");
    ancestry(project);
    check(field(project, "id") === config.projectId && field(project, "owner_id") === config.organizationId);
  }
  function receipt(raw: unknown): Json {
    bound(raw);
    return { id: config.projectId, acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.deleteProject", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        bound(await transport.getProject(config.projectId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.deleteProject(config.projectId, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Absence after a lost response proves neither causation nor completed cascade.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
