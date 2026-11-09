import { closed, identifier, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { MAX_ITEMS } from "./metadata.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const JWKS_DELETE_OPERATIONS = ["deleteProjectJWKS"] as const;
export interface NeonJWKSDeleteScope {
  readonly projectId: string;
  readonly jwksId: string;
  readonly branchId: string | null;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9-]+$/);
const argumentsSchema = closed({ project_id: pathId, jwks_id: identifier });

// Source only. A provider acknowledgement is not independently observed JWT refusal or session closure.
export function createNeonJWKSDeleteOperations(scope: NeonJWKSDeleteScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, jwksId: identifier,
    branchId: { parse: (value: unknown) => value === null ? null : pathId.parse(value) }, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/jwks/${config.jwksId}/delete`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.jwks_id === config.jwksId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "deleteProjectJWKS", ...args, branch_id: config.branchId, effect: "request_jwks_deletion",
        preflight: "bounded_jwks_list_exact_identity", reconciliation: "one_jwks_list_observation_no_retry",
        diff: { before: "selected_jwks_present", after: "jwks_deletion_requested" }, completion: "acknowledgement_only",
        connectionFence: false }, artifactDigest: null };
  }
  function identity(raw: unknown): void {
    check(identifier.parse(field(raw, "id")) === config.jwksId);
    check(pathId.parse(field(raw, "project_id")) === config.projectId);
    const branch = optional(raw, "branch_id");
    check(config.branchId === null ? branch === undefined : branch === config.branchId);
    check(optional(raw, "pagination") === undefined);
    // JWKS URLs, provider names, audiences, role names and timestamps are not evaluated or followed.
  }
  function receipt(raw: unknown): Json {
    identity(raw);
    return { id: config.jwksId, project_id: config.projectId,
      ...(config.branchId === null ? {} : { branch_id: config.branchId }), acknowledged: true };
  }
  function listed(raw: unknown): void {
    const project = optional(raw, "project_id");
    check(project === undefined || project === config.projectId);
    check(optional(raw, "branch_id") === undefined && optional(raw, "pagination") === undefined);
    const seen = new Set<string>();
    let found = false;
    for (const value of rows(field(raw, "jwks"), MAX_ITEMS)) {
      const id = text(256, /^[\x20-\x7e]+$/).parse(field(value, "id"));
      check(!seen.has(id));
      seen.add(id);
      check(field(value, "project_id") === config.projectId && optional(value, "pagination") === undefined);
      const branch = optional(value, "branch_id");
      check(branch === undefined || pathId.parse(branch).length > 0);
      if (id === config.jwksId) { identity(value); found = true; }
    }
    check(found);
  }
  return Object.freeze([Object.freeze({
    name: "neon.deleteProjectJWKS", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        listed(await transport.getProjectJWKS(config.projectId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.deleteProjectJWKS(config.projectId, config.jwksId, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Absence does not establish causal deletion, JWT refusal or session closure.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
