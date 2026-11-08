import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const script = text(63, /^[A-Za-z0-9][A-Za-z0-9_-]*$(?![\s\S])/);
const listInput = closed({ queueId: identifier });
const getInput = closed({ queueId: identifier, consumerId: identifier });
type Row = Record<string, unknown>;
type Consumer = Readonly<{ consumerId: string; type: "worker"; scriptName: string } |
  { consumerId: string; type: "http_pull"; scriptName: null }>;
export interface QueueConsumerScope {
  accountId: string;
  revision: string;
  queues?: readonly { queueId: string; consumers: readonly Consumer[] }[];
  configurationConsumers?: readonly { queueId: string; consumerIds: readonly string[] }[];
}
type ConfiguredNumber = number | "unavailable";
type ConsumerConfiguration = Readonly<{
  subject: "configured-queue-consumer-delivery";
  batchSize: ConfiguredNumber;
  maxRetries: ConfiguredNumber;
  retryDelaySeconds: ConfiguredNumber;
  effectiveDelivery: "not-established";
} & ({ maxConcurrency: ConfiguredNumber | null; maxWaitTimeMs: ConfiguredNumber } |
  { visibilityTimeoutMs: ConfiguredNumber })>;
interface ConsumerMetadata {
  readonly queueId: string;
  readonly consumer: Consumer;
  readonly configuration?: ConsumerConfiguration;
  readonly subject: "configured-queue-consumer";
  readonly effectiveDelivery: "not-established";
}
interface ConsumerList {
  readonly queueId: string;
  readonly items: readonly Consumer[];
  readonly subject: "configured-queue-consumers";
  readonly complete: false;
  readonly effectiveDelivery: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

export function queueConsumerDescriptors(scope: QueueConsumerScope): {
  consumersList: MetadataDescriptor<ReturnType<typeof listInput.parse>, ConsumerList>;
  consumerGet: MetadataDescriptor<ReturnType<typeof getInput.parse>, ConsumerMetadata>;
} {
  const account = identifier.parse(scope.accountId);
  const revision = label.parse(scope.revision);
  const queues = scope.queues ?? [];
  requireThat(Array.isArray(queues) && queues.length <= 100, "cap");
  const allowed = new Map<string, Map<string, Consumer>>();
  for (const queue of queues) {
    requireThat(queue !== null && typeof queue === "object", "schema");
    const queueId = identifier.parse(queue.queueId);
    requireThat(!allowed.has(queueId), "schema");
    requireThat(Array.isArray(queue.consumers) && queue.consumers.length <= 100, "cap");
    const consumers = new Map<string, Consumer>();
    for (const consumer of queue.consumers) {
      requireThat(consumer !== null && typeof consumer === "object", "schema");
      const consumerId = identifier.parse(consumer.consumerId);
      requireThat(!consumers.has(consumerId), "schema");
      requireThat(consumer.type === "worker" || consumer.type === "http_pull", "schema");
      if (consumer.type === "worker") {
        consumers.set(consumerId, Object.freeze({ consumerId, type: "worker", scriptName: script.parse(consumer.scriptName) }));
      } else {
        requireThat(consumer.scriptName === null, "schema");
        consumers.set(consumerId, Object.freeze({ consumerId, type: "http_pull", scriptName: null }));
      }
    }
    allowed.set(queueId, consumers);
  }
  const configurationConsumers = scope.configurationConsumers ?? [];
  requireThat(Array.isArray(configurationConsumers) && configurationConsumers.length <= 100, "cap");
  const configurations = new Map<string, Set<string>>();
  for (const selected of configurationConsumers) {
    requireThat(selected !== null && typeof selected === "object", "schema");
    const queueId = identifier.parse(selected.queueId);
    requireThat(!configurations.has(queueId) && allowed.has(queueId), "scope");
    requireThat(Array.isArray(selected.consumerIds) && selected.consumerIds.length <= 100, "cap");
    const ids = new Set<string>(selected.consumerIds.map((value: unknown) => identifier.parse(value)));
    requireThat(ids.size === selected.consumerIds.length, "schema");
    for (const id of ids) requireThat(allowed.get(queueId)!.has(id), "scope");
    configurations.set(queueId, ids);
  }
  function configuration(row: Row, type: Consumer["type"]): ConsumerConfiguration {
    const settings = row.settings === undefined ? {} : object(row.settings);
    function number(key: string): ConfiguredNumber {
      const value = settings[key];
      if (value === undefined) return "unavailable";
      requireThat(typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER, "upstream");
      return value;
    }
    return Object.freeze({ subject: "configured-queue-consumer-delivery" as const,
      batchSize: number("batch_size"), maxRetries: number("max_retries"), retryDelaySeconds: number("retry_delay"),
      ...(type === "worker" ? { maxConcurrency: settings.max_concurrency === null ? null : number("max_concurrency"),
        maxWaitTimeMs: number("max_wait_time_ms") } : { visibilityTimeoutMs: number("visibility_timeout_ms") }),
      effectiveDelivery: "not-established" as const });
  }
  function selections(queueId: string): Map<string, Consumer> {
    const result = allowed.get(queueId);
    requireThat(result !== undefined && result.size > 0, "scope");
    return result;
  }
  function context(row: Row, queueId: string): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.queue_id === undefined || row.queue_id === queueId, "scope");
  }
  function consumer(row: Row, queueId: string, expected: Consumer): Consumer {
    context(row, queueId);
    requireThat(row.consumer_id === expected.consumerId && row.type === expected.type, "scope");
    requireThat(expected.type === "worker" ? row.script_name === expected.scriptName : row.script_name === undefined, "scope");
    return expected;
  }
  const prepared = new WeakMap<object, boolean>();
  function prepare<A extends { queueId: string }>(args: A, consumerId?: string): PreparedMetadata<A> {
    const selected = selections(args.queueId);
    requireThat(consumerId === undefined || selected.has(consumerId), "scope");
    const value = Object.freeze({ arguments: args,
      resource: Object.freeze({ id: `cloudflare:account:${account}:queue:${args.queueId}:consumers${consumerId === undefined ? "" : `:${consumerId}`}`, revision }),
      request: Object.freeze({ method: "GET" as const,
        path: `/accounts/${account}/queues/${args.queueId}/consumers${consumerId === undefined ? "" : `/${consumerId}`}`,
        maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
    prepared.set(value, consumerId !== undefined);
    return value;
  }
  function result(raw: string, value: PreparedMetadata<{ queueId: string }>, detail = false): unknown {
    requireThat(prepared.get(value) === detail, "scope");
    requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
    const body = object(parsed);
    context(body, value.arguments.queueId);
    requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
    return body.result;
  }
  function bounded<T>(value: T): T {
    requireThat(Buffer.byteLength(JSON.stringify(value), "utf8") <= 32768, "cap");
    return Object.freeze(value);
  }
  const consumersList: MetadataDescriptor<ReturnType<typeof listInput.parse>, ConsumerList> = Object.freeze({
    name: "cloudflare.queues.consumers.list", version: "1", tier: "read", providerOperationId: "queues-list-consumers",
    prepare(raw: unknown) { return prepare(listInput.parse(raw)); },
    project(raw: string, value: PreparedMetadata<ReturnType<typeof listInput.parse>>) {
      const rows = result(raw, value);
      requireThat(Array.isArray(rows) && rows.length <= 1000, "cap");
      const queueId = value.arguments.queueId;
      const selected = selections(queueId);
      const seen = new Set<string>();
      const items: Consumer[] = [];
      for (const rawRow of rows) {
        const row = object(rawRow);
        context(row, queueId);
        requireThat(typeof row.consumer_id === "string", "upstream");
        const expected = selected.get(row.consumer_id);
        if (expected === undefined) continue;
        requireThat(!seen.has(expected.consumerId), "upstream");
        seen.add(expected.consumerId);
        items.push(consumer(row, queueId, expected));
      }
      return bounded({ queueId, items: Object.freeze(items), subject: "configured-queue-consumers" as const,
        complete: false as const, effectiveDelivery: "not-established" as const });
    },
  });
  const consumerGet: MetadataDescriptor<ReturnType<typeof getInput.parse>, ConsumerMetadata> = Object.freeze({
    name: "cloudflare.queues.consumers.get", version: "1", tier: "read", providerOperationId: "queues-get-consumer",
    prepare(raw: unknown) { const args = getInput.parse(raw); return prepare(args, args.consumerId); },
    project(raw: string, value: PreparedMetadata<ReturnType<typeof getInput.parse>>) {
      const row = object(result(raw, value, true));
      const { queueId, consumerId } = getInput.parse(value.arguments);
      const expected = selections(queueId).get(consumerId);
      requireThat(expected !== undefined, "scope");
      return bounded({ queueId, consumer: consumer(row, queueId, expected),
        ...(configurations.get(queueId)?.has(consumerId) === true ? { configuration: configuration(row, expected.type) } : {}),
        subject: "configured-queue-consumer" as const, effectiveDelivery: "not-established" as const });
    },
  });
  return Object.freeze({ consumersList, consumerGet });
}
