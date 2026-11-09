import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const revisionLabel = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const listInput = closed({});
const getInput = closed({ rulesetId: identifier });
// Official digit-string syntax; never coerce, canonicalize or alias versions.
const version = text(32, /^[0-9]+$(?![\s\S])/);
const versionInput = closed({ rulesetId: identifier, rulesetVersion: version });
type VersionSelection = Readonly<{ rulesetId: string; versions: readonly string[] }>;
const phases = new Set(["ddos_l4", "ddos_l7", "http_config_settings", "http_custom_errors", "http_log_custom_fields",
  "http_ratelimit", "http_request_cache_settings", "http_request_dynamic_redirect", "http_request_firewall_custom",
  "http_request_firewall_managed", "http_request_late_transform", "http_request_origin", "http_request_redirect",
  "http_request_sanitize", "http_request_sbfm", "http_request_transform", "http_response_cache_settings",
  "http_response_compression", "http_response_firewall_custom", "http_response_firewall_managed",
  "http_response_headers_transform", "magic_transit", "magic_transit_ids_managed", "magic_transit_managed", "magic_transit_ratelimit"]);
type Row = Record<string, unknown>;
type Identity = Readonly<{ id: string }>;
export interface RulesetScope {
  accountId: string;
  zoneId?: string;
  revision: string;
  accountListIds?: readonly string[];
  accountRulesetIds?: readonly string[];
  zoneListIds?: readonly string[];
  zoneRulesetIds?: readonly string[];
  accountVersionLists?: readonly VersionSelection[];
  accountVersions?: readonly VersionSelection[];
  zoneVersionLists?: readonly VersionSelection[];
  zoneVersions?: readonly VersionSelection[];
}
function versionSnapshot(raw: readonly VersionSelection[] | undefined): ReadonlyMap<string, ReadonlySet<string>> {
  const rows = raw === undefined ? [] : raw;
  requireThat(Array.isArray(rows) && rows.length <= 32, "cap");
  const selected = new Map<string, ReadonlySet<string>>();
  for (const raw of rows) {
    const row = object(raw), id = identifier.parse(row.rulesetId), values = row.versions;
    requireThat(!selected.has(id) && Array.isArray(values) && values.length > 0, "schema");
    requireThat(values.length <= 64, "cap");
    const versions = new Set<string>();
    for (const raw of values) {
      const value = version.parse(raw);
      requireThat(!versions.has(value), "schema"); versions.add(value);
    }
    selected.set(id, versions);
  }
  return selected;
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}
function snapshot(raw: readonly string[] | undefined, max: number): ReadonlySet<string> {
  const rows = raw === undefined ? [] : raw;
  requireThat(Array.isArray(rows) && rows.length <= max, "cap");
  const ids = new Set<string>();
  for (const row of rows) {
    const id = identifier.parse(row);
    requireThat(!ids.has(id), "schema"); ids.add(id);
  }
  return ids;
}
function boundedString(value: unknown, max = 4096): asserts value is string {
  requireThat(typeof value === "string" && value.length > 0 && value.length <= max &&
    !/[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(value), "upstream");
}
function dateTime(value: unknown): void {
  // Same conservative RFC3339 subset as cache metadata, not a revision fence.
  boundedString(value, 64);
  const parts = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$(?![\s\S])/.exec(value);
  requireThat(parts !== null, "upstream");
  const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  requireThat(month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]! &&
    Number(parts[4]) <= 23 && Number(parts[5]) <= 59 && Number(parts[6]) <= 59, "upstream");
}

export function rulesetDescriptors(scope: RulesetScope) {
  const account = identifier.parse(scope.accountId), revision = revisionLabel.parse(scope.revision);
  const zone = scope.zoneId === undefined ? undefined : identifier.parse(scope.zoneId);
  // Lists select at most core's 64 IDs; the fixed provider first page returns at most 50.
  const accountList = snapshot(scope.accountListIds, 64), accountGet = snapshot(scope.accountRulesetIds, 100);
  const zoneList = snapshot(scope.zoneListIds, 64), zoneGet = snapshot(scope.zoneRulesetIds, 100);
  const accountVersionLists = versionSnapshot(scope.accountVersionLists), accountVersions = versionSnapshot(scope.accountVersions);
  const zoneVersionLists = versionSnapshot(scope.zoneVersionLists), zoneVersions = versionSnapshot(scope.zoneVersions);
  function context(row: Row): void {
    if (Object.hasOwn(row, "account_id")) requireThat(row.account_id === account, "scope");
    if (Object.hasOwn(row, "account")) requireThat(object(row.account).id === account, "scope");
    if (Object.hasOwn(row, "zone_id")) requireThat(zone !== undefined && row.zone_id === zone, "scope");
    if (Object.hasOwn(row, "zone")) requireThat(zone !== undefined && object(row.zone).id === zone, "scope");
  }
  function identity(raw: unknown, detail: boolean): Identity {
    const row = object(raw); context(row);
    requireThat(typeof row.id === "string" && /^[a-f0-9]{32}$(?![\s\S])/.test(row.id), "upstream");
    boundedString(row.version, 128);
    requireThat(/^[0-9]+$(?![\s\S])/.test(row.version), "upstream");
    dateTime(row.last_updated); boundedString(row.name);
    requireThat(typeof row.kind === "string" && ["managed", "custom", "root", "zone"].includes(row.kind), "upstream");
    requireThat(typeof row.phase === "string" && phases.has(row.phase), "upstream");
    // Rules are never interpreted/projected. Only the required detail container shape is checked.
    if (detail) {
      requireThat(Array.isArray(row.rules) && row.rules.length <= 1000, "upstream");
      for (const rule of row.rules) object(rule);
    }
    return Object.freeze({ id: row.id });
  }
  function descriptor<A, O>(parent: "account" | "zone", kind: "list" | "get" | "versions.list" | "versions.get", operation: string,
    prepare: (raw: unknown) => { arguments: A; suffix: string; resource: string },
    project: (result: unknown, args: A) => O): MetadataDescriptor<A, O> {
    const prepared = new WeakSet<object>();
    return Object.freeze({ name: `cloudflare.rulesets.${parent}.${kind}`, version: "1", tier: "read" as const,
      providerOperationId: operation,
      prepare(raw: unknown) {
        requireThat(parent === "account" || zone !== undefined, "scope");
        const input = prepare(raw);
        const value = Object.freeze({ arguments: input.arguments,
          resource: Object.freeze({ id: `cloudflare:account:${account}${parent === "zone" ? `:zone:${zone}` : ""}:rulesets:${input.resource}`, revision }),
          request: Object.freeze({ method: "GET" as const,
            path: `/${parent}s/${parent === "account" ? account : zone}/rulesets${input.suffix}`,
            maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
        prepared.add(value); return value;
      },
      project(raw: string, value: PreparedMetadata<A>) {
        requireThat(prepared.has(value), "scope");
        requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
        const body = object(parsed); context(body);
        requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 &&
          Array.isArray(body.messages) && body.messages.length <= 64 && Object.hasOwn(body, "result"), "upstream");
        for (const message of body.messages) {
          const row = object(message); boundedString(row.message);
          if (Object.hasOwn(row, "code")) requireThat(Number.isSafeInteger(row.code), "upstream");
          if (Object.hasOwn(row, "source")) boundedString(object(row.source).pointer);
        }
        // Optional cursor metadata is validated, discarded and never treated as terminality/authority.
        if (kind.endsWith("list") && Object.hasOwn(body, "result_info")) {
          const info = object(body.result_info);
          if (Object.hasOwn(info, "cursors")) boundedString(object(info.cursors).after);
        }
        const output = project(body.result, value.arguments);
        requireThat(Buffer.byteLength(JSON.stringify(output), "utf8") <= 8192, "cap");
        return Object.freeze(output);
      },
    });
  }
  function pair(parent: "account" | "zone", listIds: ReadonlySet<string>, getIds: ReadonlySet<string>) {
    const base = { subject: `configured-${parent}-ruleset-identities` as const,
      effectiveProtection: "not-established" as const, serving: "not-established" as const, ownership: "not-established" as const };
    const title = parent === "account" ? "Account" : "Zone";
    const list = descriptor(parent, "list", `list${title}Rulesets`, raw => {
      const args = listInput.parse(raw); requireThat(listIds.size > 0, "scope");
      return { arguments: args, suffix: "?per_page=50", resource: "list" };
    }, result => {
      requireThat(Array.isArray(result) && result.length <= 50, "cap");
      const items: Identity[] = [], seen = new Set<string>();
      for (const raw of result) {
        const item = identity(raw, false);
        requireThat(!seen.has(item.id), "upstream"); seen.add(item.id);
        if (listIds.has(item.id)) items.push(item);
      }
      return { ...base, items: Object.freeze(items), complete: false as const };
    });
    const get = descriptor(parent, "get", `get${title}Ruleset`, raw => {
      const args = getInput.parse(raw); requireThat(getIds.has(args.rulesetId), "scope");
      return { arguments: args, suffix: `/${args.rulesetId}`, resource: args.rulesetId };
    }, (result, args) => {
      const item = identity(result, true); requireThat(item.id === args.rulesetId, "scope");
      return { ...base, item };
    });
    return { list, get };
  }
  function versionPair(parent: "account" | "zone", lists: ReadonlyMap<string, ReadonlySet<string>>,
    gets: ReadonlyMap<string, ReadonlySet<string>>) {
    const base = { subject: `configured-${parent}-ruleset-version-identities` as const,
      effectiveProtection: "not-established" as const, serving: "not-established" as const, ownership: "not-established" as const };
    const title = parent === "account" ? "Account" : "Zone";
    function item(raw: unknown, rulesetId: string, detail: boolean) {
      const id = identity(raw, detail).id, row = object(raw);
      requireThat(id === rulesetId, "scope");
      requireThat(typeof row.version === "string" && row.version.length <= 32, "upstream");
      return Object.freeze({ id, version: row.version });
    }
    const list = descriptor(parent, "versions.list", `list${title}RulesetVersions`, raw => {
      const args = getInput.parse(raw); requireThat(lists.has(args.rulesetId), "scope");
      // These official endpoints have no page/per_page/cursor request parameters.
      return { arguments: args, suffix: `/${args.rulesetId}/versions`, resource: `${args.rulesetId}:versions:list` };
    }, (result, args) => {
      requireThat(Array.isArray(result) && result.length <= 64, "cap");
      const items: Readonly<{ id: string; version: string }>[] = [], seen = new Set<string>();
      for (const raw of result) {
        const value = item(raw, args.rulesetId, false);
        requireThat(!seen.has(value.version), "upstream"); seen.add(value.version);
        if (lists.get(args.rulesetId)!.has(value.version)) items.push(value);
      }
      return { ...base, items: Object.freeze(items), complete: false as const };
    });
    const get = descriptor(parent, "versions.get", `get${title}RulesetVersion`, raw => {
      const args = versionInput.parse(raw); requireThat(gets.get(args.rulesetId)?.has(args.rulesetVersion), "scope");
      return { arguments: args, suffix: `/${args.rulesetId}/versions/${args.rulesetVersion}`,
        resource: `${args.rulesetId}:versions:${args.rulesetVersion}` };
    }, (result, args) => {
      const value = item(result, args.rulesetId, true);
      requireThat(value.version === args.rulesetVersion, "scope");
      return { ...base, item: value };
    });
    return { list, get };
  }
  const accounts = pair("account", accountList, accountGet);
  const zones = zone === undefined ? undefined : pair("zone", zoneList, zoneGet);
  const accountVersionPair = versionPair("account", accountVersionLists, accountVersions);
  const zoneVersionPair = zone === undefined ? undefined : versionPair("zone", zoneVersionLists, zoneVersions);
  return Object.freeze({ accountList: accounts.list, accountGet: accounts.get,
    accountVersionsList: accountVersionPair.list, accountVersionGet: accountVersionPair.get,
    ...(zones === undefined ? {} : { zoneList: zones.list, zoneGet: zones.get }),
    ...(zoneVersionPair === undefined ? {} : { zoneVersionsList: zoneVersionPair.list, zoneVersionGet: zoneVersionPair.get }) });
}
