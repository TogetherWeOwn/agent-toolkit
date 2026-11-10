import { webhookListScope, webhookSummary, type WebhookSummary } from "../security-records.js";
import { page, pageArguments, prepared, type MetadataPage, type PreparedRead } from "../metadata.js";

export const operationId = "list_webhooks";
export const tool = "planetscale.list_webhooks";

export function prepare(scope: ReturnType<typeof webhookListScope.parse>, args: unknown): PreparedRead<MetadataPage<WebhookSummary>> {
  const target = webhookListScope.parse(scope);
  const parsed = pageArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}/webhooks?page=${parsed.page}&per_page=${parsed.perPage}`,
    body => page(body, parsed, row => webhookSummary(row, target.webhookIds)));
}
