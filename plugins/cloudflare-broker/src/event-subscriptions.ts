import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const sourceName = text(128, /^[A-Za-z0-9@][A-Za-z0-9@_.:/-]*$(?![\s\S])/);
const eventName = text(128, /^[A-Za-z0-9][A-Za-z0-9_.:-]*$(?![\s\S])/);
const listInput = closed({});
const getInput = closed({ subscriptionId: identifier });
type Row = Record<string, unknown>;
type Source = Readonly<{ type: "images" | "kv" | "r2" | "superSlurper" | "vectorize" } |
  { type: "workersAi.model"; model_name: string } | { type: "workersBuilds.worker"; worker_name: string } |
  { type: "workers.script"; script_tag: string } | { type: "workflows.workflow"; workflow_name: string }>;
export interface EventSubscriptionScope {
  accountId: string;
  revision: string;
  subscriptions?: readonly { subscriptionId: string; source: Source; queueId: string; events: readonly string[] }[];
}
interface Subscription {
  readonly subscriptionId: string;
  readonly sourceType: Source["type"];
  readonly queueId: string;
  readonly enabled: boolean;
  readonly events: readonly string[];
  readonly eventsComplete: false;
}
interface SubscriptionMetadata {
  readonly subscription: Subscription;
  readonly subject: "configured-event-subscription";
  readonly effectiveDelivery: "not-established";
}
interface SubscriptionList {
  readonly items: readonly Subscription[];
  readonly subject: "configured-event-subscriptions";
  readonly complete: false;
  readonly effectiveDelivery: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}
function source(value: unknown): Source {
  const row = object(value);
  const type = row.type;
  requireThat(typeof type === "string", "schema");
  let key: string | undefined;
  switch (type) {
    case "images": case "kv": case "r2": case "superSlurper": case "vectorize": break;
    case "workersAi.model": key = "model_name"; break;
    case "workersBuilds.worker": key = "worker_name"; break;
    case "workers.script": key = "script_tag"; break;
    case "workflows.workflow": key = "workflow_name"; break;
    default: requireThat(false, "schema");
  }
  requireThat(Object.keys(row).length === (key === undefined ? 1 : 2) &&
    Object.hasOwn(row, "type") && (key === undefined || Object.hasOwn(row, key)), "schema");
  return Object.freeze(key === undefined ? { type } : { type, [key]: sourceName.parse(row[key]) }) as Source;
}

export function eventSubscriptionDescriptors(scope: EventSubscriptionScope): {
  eventSubscriptionsList: MetadataDescriptor<ReturnType<typeof listInput.parse>, SubscriptionList>;
  eventSubscriptionGet: MetadataDescriptor<ReturnType<typeof getInput.parse>, SubscriptionMetadata>;
} {
  const account = identifier.parse(scope.accountId);
  const revision = label.parse(scope.revision);
  const subscriptions = scope.subscriptions ?? [];
  requireThat(Array.isArray(subscriptions) && subscriptions.length <= 100, "cap");
  const allowed = new Map<string, { source: Source; queueId: string; events: Set<string> }>();
  for (const subscription of subscriptions) {
    requireThat(subscription !== null && typeof subscription === "object", "schema");
    const id = identifier.parse(subscription.subscriptionId);
    requireThat(!allowed.has(id), "schema");
    requireThat(Array.isArray(subscription.events) && subscription.events.length > 0 && subscription.events.length <= 100, "cap");
    const events = new Set(subscription.events.map((event: string) => eventName.parse(event)));
    requireThat(events.size === subscription.events.length, "schema");
    allowed.set(id, { source: source(subscription.source), queueId: identifier.parse(subscription.queueId), events });
  }
  function context(row: Row): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
  }
  function subscription(row: Row, id: string): Subscription {
    context(row);
    const expected = allowed.get(id);
    requireThat(expected !== undefined && row.id === id, "scope");
    const actualSource = source(row.source);
    requireThat(Object.entries(expected.source).every(([key, value]) => (actualSource as unknown as Row)[key] === value) &&
      Object.keys(actualSource).length === Object.keys(expected.source).length, "scope");
    const destination = object(row.destination);
    context(destination);
    requireThat(destination.type === "queues.queue" && destination.queue_id === expected.queueId, "scope");
    requireThat(typeof row.enabled === "boolean", "upstream");
    requireThat(Array.isArray(row.events) && row.events.length > 0 && row.events.length <= 1000, "cap");
    const events: string[] = [];
    const seen = new Set<string>();
    for (const raw of row.events) {
      const name = eventName.parse(raw);
      requireThat(!seen.has(name), "upstream");
      seen.add(name);
      if (expected.events.has(name)) events.push(name);
    }
    return Object.freeze({ subscriptionId: id, sourceType: expected.source.type, queueId: expected.queueId,
      enabled: row.enabled, events: Object.freeze(events), eventsComplete: false as const });
  }
  const prepared = new WeakMap<object, boolean>();
  function prepare<A>(args: A, id?: string): PreparedMetadata<A> {
    requireThat(allowed.size > 0 && (id === undefined || allowed.has(id)), "scope");
    const value = Object.freeze({ arguments: args,
      resource: Object.freeze({ id: `cloudflare:account:${account}:event-subscriptions${id === undefined ? "" : `:${id}`}`, revision }),
      request: Object.freeze({ method: "GET" as const,
        path: `/accounts/${account}/event_subscriptions/subscriptions${id === undefined ? "?page=1&per_page=100" : `/${id}`}`,
        maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
    prepared.set(value, id !== undefined);
    return value;
  }
  function result(raw: string, value: object, detail = false): unknown {
    requireThat(prepared.get(value) === detail, "scope");
    requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
    const body = object(parsed);
    context(body);
    requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
    return body.result;
  }
  function bounded<T>(value: T): T {
    requireThat(Buffer.byteLength(JSON.stringify(value), "utf8") <= 32768, "cap");
    return Object.freeze(value);
  }
  const eventSubscriptionsList: MetadataDescriptor<ReturnType<typeof listInput.parse>, SubscriptionList> = Object.freeze({
    name: "cloudflare.queues.event_subscriptions.list", version: "1", tier: "read", providerOperationId: "subscriptions-list",
    prepare(raw: unknown) { return prepare(listInput.parse(raw)); },
    project(raw: string, value: PreparedMetadata<ReturnType<typeof listInput.parse>>) {
      const rows = result(raw, value);
      requireThat(Array.isArray(rows) && rows.length <= 100, "cap");
      const seen = new Set<string>();
      const items: Subscription[] = [];
      for (const rawRow of rows) {
        const row = object(rawRow);
        context(row);
        requireThat(typeof row.id === "string", "upstream");
        if (!allowed.has(row.id)) continue;
        requireThat(!seen.has(row.id), "upstream");
        seen.add(row.id);
        items.push(subscription(row, row.id));
      }
      return bounded({ items: Object.freeze(items), subject: "configured-event-subscriptions" as const,
        complete: false as const, effectiveDelivery: "not-established" as const });
    },
  });
  const eventSubscriptionGet: MetadataDescriptor<ReturnType<typeof getInput.parse>, SubscriptionMetadata> = Object.freeze({
    name: "cloudflare.queues.event_subscriptions.get", version: "1", tier: "read", providerOperationId: "subscriptions-get",
    prepare(raw: unknown) { const args = getInput.parse(raw); return prepare(args, args.subscriptionId); },
    project(raw: string, value: PreparedMetadata<ReturnType<typeof getInput.parse>>) {
      const row = object(result(raw, value, true));
      return bounded({ subscription: subscription(row, value.arguments.subscriptionId), subject: "configured-event-subscription" as const,
        effectiveDelivery: "not-established" as const });
    },
  });
  return Object.freeze({ eventSubscriptionsList, eventSubscriptionGet });
}
