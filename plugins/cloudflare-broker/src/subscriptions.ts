import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const planIdentifier = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const listInput = closed({});
const getInput = closed({ subscriptionId: identifier });
const states = ["Trial", "Provisioned", "Paid", "AwaitingPayment", "Cancelled", "Failed", "Expired"] as const;
const frequencies = ["weekly", "monthly", "quarterly", "yearly"] as const;
type Row = Record<string, unknown>;
type Unavailable = { readonly unavailable: "not-returned" };
export interface SubscriptionScope {
  accountId: string;
  revision: string;
  subscriptions?: readonly { subscriptionId: string; ratePlanId: string; zoneId: string | null }[];
}
interface SubscriptionMetadata {
  readonly subscriptionId: string;
  readonly ratePlanId: string;
  readonly zoneId: string | null;
  readonly state: typeof states[number] | Unavailable;
  readonly frequency: typeof frequencies[number] | Unavailable;
  readonly subject: "configured-subscription";
  readonly effectiveEntitlements: "not-established";
  readonly effectiveLimits: "not-established";
  readonly cost: "not-projected";
}
interface SubscriptionList {
  readonly subscriptions: readonly SubscriptionMetadata[];
  readonly complete: false;
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}
function optionalEnum<T extends string>(value: unknown, values: readonly T[]): T | Unavailable {
  if (value === undefined) return Object.freeze({ unavailable: "not-returned" as const });
  requireThat(typeof value === "string" && values.includes(value as T), "upstream");
  return value as T;
}

// Configured billing metadata is not effective entitlement or permission to spend.
export function subscriptionDescriptors(scope: SubscriptionScope): {
  subscriptionsList: MetadataDescriptor<ReturnType<typeof listInput.parse>, SubscriptionList>;
  subscriptionGet: MetadataDescriptor<ReturnType<typeof getInput.parse>, SubscriptionMetadata>;
} {
  const account = identifier.parse(scope.accountId);
  const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/).parse(scope.revision);
  const entries = scope.subscriptions ?? [];
  requireThat(Array.isArray(entries) && entries.length <= 100, "cap");
  const allowed = new Map<string, { ratePlanId: string; zoneId: string | null }>();
  for (const entry of entries) {
    requireThat(entry !== null && typeof entry === "object", "schema");
    const id = identifier.parse(entry.subscriptionId);
    const ratePlanId = planIdentifier.parse(entry.ratePlanId);
    const zoneId = entry.zoneId === null ? null : identifier.parse(entry.zoneId);
    requireThat(!allowed.has(id), "schema");
    allowed.set(id, { ratePlanId, zoneId });
  }
  function context(row: Row): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    if (row.account !== undefined) requireThat(object(row.account).id === account, "scope");
  }
  function envelope(raw: string): unknown {
    requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
    const body = object(parsed);
    context(body);
    requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
    return body.result;
  }
  function selected(row: Row, id: string): SubscriptionMetadata {
    context(row);
    const expected = allowed.get(id)!;
    requireThat(row.id === id && object(row.rate_plan).id === expected.ratePlanId, "scope");
    // Require an explicit matching zone ID or null marker; absence proves nothing.
    const zoneId = row.zone === null ? null : object(row.zone).id;
    requireThat(zoneId === expected.zoneId, "scope");
    return Object.freeze({ subscriptionId: id, ratePlanId: expected.ratePlanId, zoneId: expected.zoneId,
      state: optionalEnum(row.state, states), frequency: optionalEnum(row.frequency, frequencies),
      subject: "configured-subscription" as const, effectiveEntitlements: "not-established" as const,
      effectiveLimits: "not-established" as const, cost: "not-projected" as const });
  }
  function prepared<A>(args: A, suffix: string, resource: string): PreparedMetadata<A> {
    return Object.freeze({ arguments: args, resource: Object.freeze({ id: `cloudflare:account:${account}:subscriptions${resource}`, revision }),
      request: Object.freeze({ method: "GET" as const, path: `/accounts/${account}/subscriptions${suffix}`,
        maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
  }
  const lists = new WeakSet<object>();
  const gets = new WeakSet<object>();
  return Object.freeze({
    subscriptionsList: Object.freeze({ name: "cloudflare.subscriptions.list", version: "1", tier: "read" as const,
      providerOperationId: "account-subscriptions-list-subscriptions",
      prepare(raw: unknown) {
        const args = listInput.parse(raw);
        requireThat(allowed.size > 0, "scope");
        const value = prepared(args, "", "");
        lists.add(value);
        return value;
      },
      project(raw: string, value: PreparedMetadata<ReturnType<typeof listInput.parse>>) {
        requireThat(lists.has(value), "scope");
        const rows = envelope(raw);
        requireThat(Array.isArray(rows) && rows.length <= 1000, "cap");
        const seen = new Set<string>();
        const subscriptions: SubscriptionMetadata[] = [];
        for (const rawRow of rows) {
          const row = object(rawRow);
          context(row);
          requireThat(typeof row.id === "string", "upstream");
          if (!allowed.has(row.id)) continue;
          requireThat(!seen.has(row.id), "upstream");
          seen.add(row.id);
          subscriptions.push(selected(row, row.id));
        }
        const output = Object.freeze({ subscriptions: Object.freeze(subscriptions), complete: false as const });
        requireThat(Buffer.byteLength(JSON.stringify(output), "utf8") <= 32768, "cap");
        return output;
      },
    }),
    subscriptionGet: Object.freeze({ name: "cloudflare.subscriptions.get", version: "1", tier: "read" as const,
      providerOperationId: "account-subscriptions-get-subscription",
      prepare(raw: unknown) {
        const args = getInput.parse(raw);
        const expected = allowed.get(args.subscriptionId);
        requireThat(expected !== undefined, "scope");
        const value = prepared(args, `/${args.subscriptionId}`, `:${args.subscriptionId}:plan:${expected.ratePlanId}:zone:${expected.zoneId ?? "none"}`);
        gets.add(value);
        return value;
      },
      project(raw: string, value: PreparedMetadata<ReturnType<typeof getInput.parse>>) {
        requireThat(gets.has(value), "scope");
        return selected(object(envelope(raw)), value.arguments.subscriptionId);
      },
    }),
  });
}
