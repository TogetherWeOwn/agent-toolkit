import { closed, identifier, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { boolean, check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonAuthWebhookDisableScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId });

export function createNeonAuthWebhookDisableOperations(scope: NeonAuthWebhookDisableScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, revision: identifier }).parse(scope);
  const resourceId = `neon/projects/${config.projectId}/branches/${config.branchId}/auth/webhooks/disable`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.project_id === config.projectId && args.branch_id === config.branchId);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "updateNeonAuthWebhookConfig", ...args, enabled: false,
        effect: "request_auth_webhook_disable", preflight: "auth_webhook_enabled_true",
        reconciliation: "one_status_observation_no_retry", completion: "acknowledgement_only",
        diff: { before: { enabled: true }, after: { enabled: false } },
        omittedConfiguration: "provider_defined_put_semantics", configurationPreservationVerified: false,
        deliveryStoppageVerified: false, queuedDeliveriesCancelled: false, sessionsRevoked: false, connectionFence: false }, artifactDigest: null };
  }
  function status(raw: unknown): boolean {
    check(optional(raw, "project_id") === undefined || optional(raw, "project_id") === config.projectId);
    check(optional(raw, "branch_id") === undefined || optional(raw, "branch_id") === config.branchId);
    check(optional(raw, "pagination") === undefined);
    return boolean(field(raw, "enabled"));
  }
  function receipt(raw: unknown): Json {
    check(status(raw) === false);
    return { accepted: true };
  }
  return Object.freeze([Object.freeze({
    name: "neon.updateNeonAuthWebhookConfig", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<boolean> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const value = status(await transport.getNeonAuthWebhookConfig(config.projectId, config.branchId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return value;
      }
      check(await observe() === true);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.updateNeonAuthWebhookConfig(config.projectId, config.branchId, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        if (!signal.aborted) { try { await observe(); } catch { /* Disabled state is not causal delivery-stoppage evidence. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
