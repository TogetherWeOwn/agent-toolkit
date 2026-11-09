import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const ruleId = text(36, /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$(?![\s\S])/);
const bucketName = text(64, /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$(?![\s\S])/);
const listInput = closed({ bucketName });
const getInput = closed({ bucketName, queueId: identifier });
const actions = new Set(["PutObject", "CopyObject", "DeleteObject", "CompleteMultipartUpload", "LifecycleDeletion"]);
type Row = Record<string, unknown>;
export interface R2NotificationScope {
  accountId: string;
  revision: string;
  buckets?: readonly { bucketName: string; jurisdiction: "default" | "eu";
    queues: readonly { queueId: string; ruleIds: readonly string[] }[] }[];
}
interface QueueMetadata {
  readonly queueId: string;
  readonly rules: readonly { readonly ruleId: string; readonly actions: readonly string[] }[];
  readonly complete: false;
}
interface NotificationMetadata {
  readonly bucketName: string;
  readonly requestedJurisdiction: "default" | "eu";
  readonly queues: readonly QueueMetadata[];
  readonly subject: "configured-selected-event-notifications";
  readonly complete: false;
  readonly effectiveDelivery: "not-established";
  readonly recoveryCustody: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

// Queue visibility is not notification visibility; filters and messages never return.
export function r2NotificationDescriptors(scope: R2NotificationScope) {
  const account = identifier.parse(scope.accountId);
  const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/).parse(scope.revision);
  const buckets = scope.buckets ?? [];
  requireThat(Array.isArray(buckets) && buckets.length <= 100, "cap");
  const allowed = new Map<string, { jurisdiction: "default" | "eu"; queues: Map<string, Set<string>> }>();
  for (const entry of buckets) {
    requireThat(entry !== null && typeof entry === "object", "schema");
    const name = bucketName.parse(entry.bucketName);
    requireThat(!allowed.has(name) && (entry.jurisdiction === "default" || entry.jurisdiction === "eu"), "schema");
    requireThat(Array.isArray(entry.queues) && entry.queues.length <= 100, "cap");
    const queues = new Map<string, Set<string>>();
    for (const queue of entry.queues) {
      requireThat(queue !== null && typeof queue === "object", "schema");
      const id = identifier.parse(queue.queueId);
      requireThat(!queues.has(id), "schema");
      requireThat(Array.isArray(queue.ruleIds) && queue.ruleIds.length > 0 && queue.ruleIds.length <= 100, "cap");
      const rules = new Set<string>(queue.ruleIds.map((value: string) => ruleId.parse(value)));
      requireThat(rules.size === queue.ruleIds.length, "schema");
      queues.set(id, rules);
    }
    allowed.set(name, { jurisdiction: entry.jurisdiction, queues });
  }
  function descriptor<A extends { bucketName: string; queueId?: string }>(name: string, providerOperationId: string,
    input: { parse(raw: unknown): A }, detail: boolean): MetadataDescriptor<A, NotificationMetadata> {
    const preparations = new WeakSet<object>();
    return Object.freeze({ name, version: "1", tier: "read", providerOperationId,
      prepare(raw: unknown) {
        const args = input.parse(raw);
        const expected = allowed.get(args.bucketName);
        requireThat(expected !== undefined && expected.queues.size > 0, "scope");
        if (detail) requireThat(args.queueId !== undefined && expected.queues.has(args.queueId), "scope");
        const prepared = Object.freeze({ arguments: args,
          resource: Object.freeze({ id: `cloudflare:account:${account}:r2:jurisdiction:${expected.jurisdiction}:bucket:${args.bucketName}:notifications${detail ? `:queue:${args.queueId}` : ""}`, revision }),
          request: Object.freeze({ method: "GET" as const,
            path: `/accounts/${account}/event_notifications/r2/${args.bucketName}/configuration${detail ? `/queues/${args.queueId}` : ""}`,
            ...(expected.jurisdiction === "eu" ? { r2Jurisdiction: "eu" as const } : {}),
            maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
        preparations.add(prepared);
        return prepared;
      },
      project(raw: string, prepared: PreparedMetadata<A>) {
        requireThat(preparations.has(prepared), "scope");
        requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
        const body = object(parsed);
        requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
        const result = object(body.result);
        const expected = allowed.get(prepared.arguments.bucketName)!;
        function context(row: Row) {
          requireThat(row.account_id === undefined || row.account_id === account, "scope");
          requireThat(row.bucketName === undefined || row.bucketName === prepared.arguments.bucketName, "scope");
          requireThat(row.jurisdiction === undefined || row.jurisdiction === expected.jurisdiction, "scope");
        }
        context(result);
        if (!detail) requireThat(result.bucketName === prepared.arguments.bucketName, "scope");
        const rows = detail ? [result] : result.queues;
        requireThat(Array.isArray(rows) && rows.length <= 100, "cap");
        const queues: QueueMetadata[] = [];
        const seen = new Set<string>();
        for (const value of rows) {
          const queue = object(value);
          const id = identifier.parse(queue.queueId);
          if (detail) requireThat(id === prepared.arguments.queueId, "scope");
          const selected = expected.queues.get(id);
          if (selected === undefined) continue;
          context(queue);
          requireThat(!seen.has(id), "upstream");
          seen.add(id);
          requireThat(Array.isArray(queue.rules) && queue.rules.length <= 100, "cap");
          const rules: QueueMetadata["rules"][number][] = [];
          const seenRules = new Set<string>();
          for (const value of queue.rules) {
            const rule = object(value);
            const id = ruleId.parse(rule.ruleId);
            if (!selected.has(id)) continue;
            requireThat(!seenRules.has(id), "upstream");
            seenRules.add(id);
            requireThat(Array.isArray(rule.actions) && rule.actions.length > 0 && rule.actions.length <= 5, "upstream");
            const selectedActions: string[] = [];
            for (const action of rule.actions) {
              requireThat(typeof action === "string" && actions.has(action) && !selectedActions.includes(action), "upstream");
              selectedActions.push(action);
            }
            rules.push(Object.freeze({ ruleId: id, actions: Object.freeze(selectedActions) }));
          }
          queues.push(Object.freeze({ queueId: id, rules: Object.freeze(rules), complete: false }));
        }
        const output: NotificationMetadata = Object.freeze({ bucketName: prepared.arguments.bucketName,
          requestedJurisdiction: expected.jurisdiction, queues: Object.freeze(queues),
          subject: "configured-selected-event-notifications", complete: false,
          effectiveDelivery: "not-established", recoveryCustody: "not-established" });
        requireThat(Buffer.byteLength(JSON.stringify(output), "utf8") <= 32768, "cap");
        return output;
      },
    });
  }
  return Object.freeze({
    notificationsList: descriptor("cloudflare.r2.notifications.list", "r2-get-event-notification-configs", listInput, false),
    notificationGet: descriptor("cloudflare.r2.notifications.get", "r2-get-event-notification-config", getInput, true),
  });
}
