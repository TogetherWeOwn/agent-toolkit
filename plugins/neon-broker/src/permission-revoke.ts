import { closed, identifier, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const PERMISSION_REVOKE_OPERATIONS = ["revokePermissionFromProject"] as const;
export interface NeonPermissionRevokeScope {
  readonly projectId: string;
  readonly permissionId: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9-]+$/);
const argumentsSchema = closed({ project_id: pathId, permission_id: identifier });

// Source only; an acknowledged request is not effective-access or session-fence proof.
export function createNeonPermissionRevokeOperations(scope: NeonPermissionRevokeScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, permissionId: identifier, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/permissions/${config.permissionId}/revoke`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.permission_id === config.permissionId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "revokePermissionFromProject", ...args, effect: "request_project_permission_revocation",
        preflight: "bounded_project_permission_id_presence", reconciliation: "bounded_project_permission_list_observation_no_retry",
        diff: { before: "selected_project_permission_present", after: "revocation_requested" }, completion: "acknowledgement_only",
        connectionFence: false }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    const project = optional(raw, "project_id");
    check(project === undefined || project === config.projectId);
    for (const key of ["branch_id", "pagination"]) check(optional(raw, key) === undefined);
  }
  function permissions(raw: unknown): void {
    ancestry(raw);
    const seen = new Set<string>();
    for (const value of rows(field(raw, "project_permissions"), 30)) {
      ancestry(value);
      const id = text(256, /^[\x20-\x7e]+$/).parse(field(value, "id"));
      check(!seen.has(id));
      seen.add(id);
    }
    check(seen.has(config.permissionId));
  }
  function receipt(raw: unknown): Json {
    ancestry(raw);
    check(identifier.parse(field(raw, "id")) === config.permissionId);
    // Email, grant/revoke timestamps and arbitrary profile/credential fields are never evaluated.
    return { id: config.permissionId, acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.revokePermissionFromProject", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        permissions(await transport.listProjectPermissions(config.projectId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.revokePermissionFromProject(config.projectId, config.permissionId, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Neither absence nor a timestamp proves causal revocation, effective access or session closure.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
