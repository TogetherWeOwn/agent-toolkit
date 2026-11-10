import { webhookScope, webhookSummary, type WebhookSummary } from "../security-records.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "get_webhook";
export const tool = "planetscale.get_webhook";

export function prepare(scope: ReturnType<typeof webhookScope.parse>, args: unknown): PreparedRead<WebhookSummary> {
  const target = webhookScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/webhooks/${target.webhookId}`,
    body => webhookSummary(body, [target.webhookId]));
}
