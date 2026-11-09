import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const input = closed({});
type Arguments = ReturnType<typeof input.parse>;
type Row = Record<string, unknown>;
export const variantFormats = Object.freeze(["avif", "bmp", "gif", "jp2", "jpeg", "jpg", "jpg2", "png", "tif", "tiff", "webp"] as const);
type VariantFormat = typeof variantFormats[number];
export interface CacheMetadataScope {
  accountId: string;
  zoneId: string;
  revision: string;
  formats?: readonly VariantFormat[];
  clearStatusReadAllowed?: boolean;
}
type SelectedFormat = { readonly availability: "unavailable" } |
  { readonly availability: "reported"; readonly mimeTypes: readonly string[] };
interface VariantsResult {
  readonly subject: "configured-selected-cache-variants";
  readonly formats: Readonly<Partial<Record<VariantFormat, SelectedFormat>>>;
  readonly effectiveCacheVariants: "not-established";
  readonly originBehavior: "not-established";
  readonly contentNegotiation: "not-established";
  readonly completeness: "not-established";
}
interface ClearStatusResult {
  readonly subject: "provider-reported-cache-reserve-clear-status";
  readonly reportedState: "In-progress" | "Completed";
  readonly deletion: "not-established";
  readonly custody: "not-established";
  readonly irreversibility: "not-established";
  readonly effectiveOperationOutcome: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}
function dateTime(value: unknown): void {
  // Conservative RFC3339 subset: bounded fraction, real calendar date, no leap second.
  requireThat(typeof value === "string" && value.length <= 64, "upstream");
  const parts = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$(?![\s\S])/.exec(value);
  requireThat(parts !== null, "upstream");
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  requireThat(month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]! &&
    Number(parts[4]) <= 23 && Number(parts[5]) <= 59 && Number(parts[6]) <= 59, "upstream");
}

export function cacheMetadataDescriptors(scope: CacheMetadataScope) {
  const account = identifier.parse(scope.accountId);
  const zone = identifier.parse(scope.zoneId);
  const revision = label.parse(scope.revision);
  const selected = scope.formats === undefined ? [] : scope.formats;
  requireThat(Array.isArray(selected) && selected.length <= variantFormats.length &&
    Array.from(selected).every(format => variantFormats.includes(format)) && new Set(selected).size === selected.length, "schema");
  const formats = Object.freeze(variantFormats.filter(format => selected.includes(format)));
  requireThat(scope.clearStatusReadAllowed === undefined || typeof scope.clearStatusReadAllowed === "boolean", "schema");
  const clearStatusAllowed = scope.clearStatusReadAllowed === true;
  function context(row: Row): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.zone_id === undefined || row.zone_id === zone, "scope");
  }
  function descriptor<O>(name: string, providerOperationId: string, id: string, resource: string,
    allowed: boolean, project: (row: Row) => O): MetadataDescriptor<Arguments, O> {
    const prepared = new WeakSet<object>();
    return Object.freeze({ name, version: "1", tier: "read" as const, providerOperationId,
      prepare(raw: unknown) {
        const args = input.parse(raw);
        requireThat(allowed, "scope");
        const value = Object.freeze({ arguments: args,
          resource: Object.freeze({ id: `cloudflare:account:${account}:zone:${zone}:${resource}`, revision }),
          request: Object.freeze({ method: "GET" as const, path: `/zones/${zone}/cache/${id}`,
            maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
        prepared.add(value);
        return value;
      },
      project(raw: string, value: PreparedMetadata<Arguments>) {
        requireThat(prepared.has(value), "scope");
        requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
        const body = object(parsed);
        context(body);
        requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 &&
          Array.isArray(body.messages) && body.messages.length <= 64 && Object.hasOwn(body, "result"), "upstream");
        for (const message of body.messages) {
          const item = object(message);
          requireThat(Number.isSafeInteger(item.code) && (item.code as number) >= 1000 &&
            typeof item.message === "string" && item.message.length <= 4096, "upstream");
        }
        const row = object(body.result);
        context(row);
        requireThat(row.id === id, "upstream");
        const output = project(row);
        requireThat(Buffer.byteLength(JSON.stringify(output), "utf8") <= 8192, "cap");
        return output;
      },
    });
  }
  return Object.freeze({
    variantsGet: descriptor<VariantsResult>("cloudflare.cache.variants.get", "zone-cache-settings-get-variants-setting",
      "variants", `cache-variants:formats:${formats.join(":")}`, formats.length > 0, row => {
        requireThat(typeof row.editable === "boolean", "upstream");
        const value = object(row.value);
        const projected: Partial<Record<VariantFormat, SelectedFormat>> = {};
        let count = 0;
        for (const format of formats) {
          if (!Object.hasOwn(value, format)) {
            projected[format] = Object.freeze({ availability: "unavailable" as const });
            continue;
          }
          const values = value[format];
          requireThat(Array.isArray(values) && values.length <= 64, "upstream");
          requireThat((count += values.length) <= 128, "cap");
          // Syntax subset, not a provider MIME enum; preserve exact case and spelling.
          requireThat(values.every(item => typeof item === "string" && item.length <= 128 &&
            /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$(?![\s\S])/.test(item)) &&
            new Set(values).size === values.length, "upstream");
          projected[format] = Object.freeze({ availability: "reported" as const, mimeTypes: Object.freeze([...values]) as readonly string[] });
        }
        return Object.freeze({ subject: "configured-selected-cache-variants" as const, formats: Object.freeze(projected),
          effectiveCacheVariants: "not-established" as const, originBehavior: "not-established" as const,
          contentNegotiation: "not-established" as const, completeness: "not-established" as const });
      }),
    reserveClearStatusGet: descriptor<ClearStatusResult>("cloudflare.cache.reserve_clear_status.get", "zone-cache-settings-get-cache-reserve-clear",
      "cache_reserve_clear", "cache-reserve-clear-status", clearStatusAllowed, row => {
        requireThat(row.state === "In-progress" || row.state === "Completed", "upstream");
        dateTime(row.start_ts);
        if (Object.hasOwn(row, "end_ts")) dateTime(row.end_ts);
        return Object.freeze({ subject: "provider-reported-cache-reserve-clear-status" as const, reportedState: row.state,
          deletion: "not-established" as const, custody: "not-established" as const,
          irreversibility: "not-established" as const, effectiveOperationOutcome: "not-established" as const });
      }),
  });
}
