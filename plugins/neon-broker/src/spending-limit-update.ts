import { closed, integer, jsonData, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../compat/provider-contracts.js";
import { check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export interface NeonSpendingLimitUpdateScope {
  readonly organizationId: string;
  readonly expectedCents: number;
  readonly cents: number;
  readonly revision: string;
}
const pathId = text(60, /^[a-z0-9][a-z0-9-]*$/);
export const spendingLimitCents = integer(1, Number.MAX_SAFE_INTEGER);
const argumentsSchema = closed({ org_id: pathId, spending_limit_cents: spendingLimitCents });

// Decrease an existing explicit alert threshold only. The provider never suspends computes at this limit.
export function createNeonSpendingLimitUpdateOperations(scope: NeonSpendingLimitUpdateScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ organizationId: pathId, expectedCents: spendingLimitCents, cents: spendingLimitCents,
    revision: text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/) }).parse(scope);
  check(config.cents < config.expectedCents);
  const resourceId = `neon/organizations/${config.organizationId}/billing/spending_limit/decrease`;
  check(resourceId.length <= 256);
  function prepare(raw: unknown): Prepared {
    const args = argumentsSchema.parse(raw);
    check(args.org_id === config.organizationId && args.spending_limit_cents === config.cents);
    return { resource: { id: resourceId, revision: config.revision }, arguments: args,
      plan: { operation: "setOrganizationSpendingLimit", ...args, effect: "request_alert_threshold_decrease",
        preflight: "exact_existing_positive_threshold", atomicCompareAndSwap: false,
        diff: { before: { spending_limit_cents: config.expectedCents }, after: { spending_limit_cents: config.cents } },
        enforcement: "alert_only_computes_not_suspended", notificationDeliveryVerified: false,
        reconciliation: "one_threshold_observation_no_retry", completion: "acknowledgement_only" }, artifactDigest: null };
  }
  function observeThreshold(raw: unknown): number {
    check(optional(raw, "org_id") === undefined || field(raw, "org_id") === config.organizationId);
    check(optional(raw, "project_id") === undefined && optional(raw, "branch_id") === undefined);
    check(optional(raw, "pagination") === undefined);
    return spendingLimitCents.parse(field(raw, "spending_limit_cents"));
  }
  function receipt(raw: unknown): Json {
    check(observeThreshold(raw) === config.cents);
    return { acknowledged: true, spending_limit_cents: config.cents };
  }
  return Object.freeze([Object.freeze({
    name: "neon.setOrganizationSpendingLimit", version: "1.0.0", tier: "reserved" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      jsonData(prepared);
      const expected = prepare(prepared.arguments);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision &&
        prepared.artifactDigest === null && JSON.stringify(prepared.plan) === JSON.stringify(expected.plan));
      const options = { credential, signal };
      async function observe(): Promise<number> {
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        const cents = observeThreshold(await transport.getOrganizationSpendingLimit(config.organizationId, options));
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return cents;
      }
      check(await observe() === config.expectedCents);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      try {
        const raw = await transport.setOrganizationSpendingLimit(config.organizationId, config.cents, options);
        receipt(raw);
        if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        return raw;
      } catch {
        if (!signal.aborted) { try { await observe(); } catch { /* Observed threshold is not causal mutation or notification evidence. */ } }
        throw Error("OUTCOME_UNCERTAIN");
      }
    },
    project: receipt,
  })]);
}
