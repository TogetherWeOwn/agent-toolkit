import { closed, identifier, requireThat, text, type Schema } from "../../../packages/core/src/schema.js";
import { flag, slug } from "./metadata.js";

const ids: Schema<readonly string[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => identifier.parse(item));
  requireThat(new Set(parsed).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };

// Broker-owned response confinement; neither possession nor effective authority.
export const serviceTokenScope = closed({ organization: slug, tokenId: identifier });
export const serviceTokenListScope = closed({ organization: slug, tokenIds: ids });
export const oauthTokenScope = closed({ organization: slug, applicationId: identifier, tokenId: identifier });
export const oauthTokenListScope = closed({ organization: slug, applicationId: identifier, tokenIds: ids });
export const webhookScope = closed({ organization: slug, database: slug, webhookId: identifier });
export const webhookListScope = closed({ organization: slug, database: slug, webhookIds: ids });

function matchedId(body: Record<string, unknown>, allowed: readonly string[]): string {
  const id = identifier.parse(body.id);
  requireThat(allowed.includes(id), "scope");
  return id;
}

const timestamp = text(40, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/);
function timestampPresent(value: unknown): boolean {
  if (value === null) return false;
  requireThat(Number.isFinite(Date.parse(timestamp.parse(value))), "upstream");
  return true;
}

export interface TokenRecordSummary {
  readonly id: string;
  readonly expiryConfigured: boolean;
  readonly usageRecorded: boolean;
  readonly effectiveAuthority: "not-established";
}
export function tokenRecordSummary(body: Record<string, unknown>, allowed: readonly string[]): TokenRecordSummary {
  // Presence is not expiry validation, revocation status or a scope receipt.
  return Object.freeze({
    id: matchedId(body, allowed), expiryConfigured: timestampPresent(body.expires_at),
    usageRecorded: timestampPresent(body.last_used_at), effectiveAuthority: "not-established",
  });
}

export interface WebhookSummary {
  readonly id: string;
  readonly enabled: boolean;
  readonly authorizationHeaderConfigured: boolean;
  readonly lastSentSuccess: boolean | null;
}
export function webhookSummary(body: Record<string, unknown>, allowed: readonly string[]): WebhookSummary {
  // Never project endpoint URLs, secrets, result text or arbitrary event names.
  return Object.freeze({
    id: matchedId(body, allowed), enabled: flag(body.enabled),
    authorizationHeaderConfigured: flag(body.authorization_header_configured),
    lastSentSuccess: body.last_sent_success === null ? null : flag(body.last_sent_success),
  });
}
