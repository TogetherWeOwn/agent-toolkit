import { closed, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const PROJECT_UPDATE_OPERATIONS = ["updateProject"] as const;
export interface NeonProjectUpdateScope {
  readonly projectId: string;
  readonly revision: string;
  readonly expectedName: string;
  readonly name: string;
}
const id = text(60, /^[a-z0-9][a-z0-9-]*$/);
const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
export const projectLabel = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const argumentsSchema = closed({ project_id: id, name: projectLabel });

// Name-only source seam. Settings, compute and retention updates are absent.
export function createNeonProjectUpdateOperations(scope: NeonProjectUpdateScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: id, revision, expectedName: projectLabel, name: projectLabel }).parse(scope);
  check(config.expectedName !== config.name);
  const resourceId = `neon/projects/${config.projectId}/rename`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.name === config.name);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "updateProject", ...args, effect: "rename_project", preflight: "exact_project_binding_and_label",
        diff: { before: config.expectedName, after: config.name }, settings: "unchanged", compute: "unchanged", retention: "unchanged", atomicCompareAndSwap: false,
        reconciliation: "bounded_project_observation_no_retry" }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    const project = optional(raw, "project_id");
    check(project === undefined || project === config.projectId);
    check(optional(raw, "pagination") === undefined);
  }
  function bound(raw: unknown): unknown {
    ancestry(raw);
    const project = field(raw, "project");
    ancestry(project);
    check(field(project, "id") === config.projectId);
    return project;
  }
  function receipt(raw: unknown): Json {
    check(field(bound(raw), "name") === config.name);
    return { id: config.projectId, updated: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.updateProject", version: "1.0.0", tier: "write" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(preflight: boolean): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const project = bound(await transport.getProject(config.projectId, options));
        if (preflight) check(field(project, "name") === config.expectedName);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe(true);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.updateProject(config.projectId, config.name, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Desired state observed after an error does not establish causation.
        if (!signal.aborted) { try { await observe(false); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
