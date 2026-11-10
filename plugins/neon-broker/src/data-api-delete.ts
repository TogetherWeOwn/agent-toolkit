import { closed, identifier, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonDataAPIDeleteScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly databaseName: string;
  readonly expectedStatus: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9-]+$/);
const databaseName = text(63, /^[A-Za-z_][A-Za-z0-9_-]*$/);
const status = text(64, /^[a-z][a-z0-9_-]*$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId, database_name: databaseName });

export function createNeonDataAPIDeleteOperations(scope: NeonDataAPIDeleteScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, databaseName, expectedStatus: status, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/data-api/${config.databaseName}/delete`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId && args.database_name === config.databaseName);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "deleteProjectBranchDataAPI", ...args, expectedStatus: config.expectedStatus,
        effect: "request_database_data_api_removal", preflight: "exact_database_configuration_status",
        reconciliation: "one_configuration_observation_no_retry", completion: "acknowledgement_only",
        diff: { before: { status: config.expectedStatus }, after: "data_api_removal_requested" },
        enforcementVerified: false, sessionsRevoked: false, connectionFence: false }, artifactDigest: null };
  }
  function present(raw: unknown): void {
    check(status.parse(field(raw, "status")) === config.expectedStatus);
    for (const [key, expected] of [["project_id", config.projectId], ["branch_id", config.branchId], ["database_name", config.databaseName]] as const) {
      check(optional(raw, key) === undefined || optional(raw, key) === expected);
    }
    check(optional(raw, "pagination") === undefined);
    // URLs, settings, schema names, observed times and authentication metadata are not consumed.
  }
  function receipt(raw: unknown): Json {
    closed({}).parse(raw);
    return { acknowledged: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.deleteProjectBranchDataAPI", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<void> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        present(await transport.getProjectBranchDataAPI(config.projectId, config.branchId, config.databaseName, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      }
      await observe();
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.deleteProjectBranchDataAPI(config.projectId, config.branchId, config.databaseName, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        // Cached status, absence or replacement is not causal endpoint-refusal evidence.
        if (!signal.aborted) { try { await observe(); } catch { /* Still uncertain. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
