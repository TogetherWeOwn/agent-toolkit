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
// Official RuleCategory is any nonempty string. Support only this bounded path-safe subset.
const ruleTag = text(64, /^[A-Za-z0-9][A-Za-z0-9_-]*$(?![\s\S])/);
const tagInput = closed({ rulesetId: identifier, rulesetVersion: version, ruleTag });
type RuleTagSelection = Readonly<{ rulesetId: string; rulesetVersion: string; ruleTag: string; ruleIds: readonly string[] }>;
type TagArguments = ReturnType<typeof tagInput.parse>;
const tagKey = (args: TagArguments) => `${args.rulesetId}:versions:${args.rulesetVersion}:by_tag:${args.ruleTag}`;
function tagSnapshot(raw: readonly RuleTagSelection[] | undefined): ReadonlyMap<string, ReadonlySet<string>> {
  const rows = raw === undefined ? [] : raw;
  requireThat(Array.isArray(rows) && rows.length <= 32, "cap");
  const selected = new Map<string, ReadonlySet<string>>();
  for (const raw of rows) {
    const row = object(raw), args = tagInput.parse({ rulesetId: row.rulesetId, rulesetVersion: row.rulesetVersion, ruleTag: row.ruleTag });
    const key = tagKey(args);
    requireThat(!selected.has(key), "schema");
    selected.set(key, snapshot(row.ruleIds as readonly string[] | undefined, 64));
  }
  return selected;
}
const phases = new Set(["ddos_l4", "ddos_l7", "http_config_settings", "http_custom_errors", "http_log_custom_fields",
  "http_ratelimit", "http_request_cache_settings", "http_request_dynamic_redirect", "http_request_firewall_custom",
  "http_request_firewall_managed", "http_request_late_transform", "http_request_origin", "http_request_redirect",
  "http_request_sanitize", "http_request_sbfm", "http_request_transform", "http_response_cache_settings",
  "http_response_compression", "http_response_firewall_custom", "http_response_firewall_managed",
  "http_response_headers_transform", "magic_transit", "magic_transit_ids_managed", "magic_transit_managed", "magic_transit_ratelimit"]);
const phase = text(64, /^[a-z][a-z0-9_]*$(?![\s\S])/);
const entrypointInput = closed({ phase, rulesetId: identifier });
const entrypointVersionInput = closed({ phase, rulesetId: identifier, rulesetVersion: version });
type EntrypointSelection = Readonly<{ phase: string; rulesetId: string }>;
type EntrypointVersionSelection = EntrypointSelection & Readonly<{ versions: readonly string[] }>;
type EntrypointSnapshot = ReadonlyMap<string, Readonly<{ rulesetId: string; versions: ReadonlySet<string> }>>;
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
  accountVersionRuleTags?: readonly RuleTagSelection[];
  zoneVersionRuleTags?: readonly RuleTagSelection[];
  accountEntrypoints?: readonly EntrypointSelection[];
  accountEntrypointVersionLists?: readonly EntrypointVersionSelection[];
  accountEntrypointVersions?: readonly EntrypointVersionSelection[];
  zoneEntrypoints?: readonly EntrypointSelection[];
  zoneEntrypointVersionLists?: readonly EntrypointVersionSelection[];
  zoneEntrypointVersions?: readonly EntrypointVersionSelection[];
}
function entrypointSnapshot(raw: readonly EntrypointSelection[] | undefined, versioned: boolean): EntrypointSnapshot {
  const rows = raw === undefined ? [] : raw;
  requireThat(Array.isArray(rows) && rows.length <= 32, "cap");
  const selected = new Map<string, Readonly<{ rulesetId: string; versions: ReadonlySet<string> }>>();
  for (const raw of rows) {
    const row = object(raw), key = phase.parse(row.phase), rulesetId = identifier.parse(row.rulesetId);
    requireThat(phases.has(key) && !selected.has(key), "schema");
    const versions = new Set<string>();
    if (versioned) {
      requireThat(Array.isArray(row.versions) && row.versions.length > 0, "schema");
      requireThat(row.versions.length <= 64, "cap");
      for (const raw of row.versions) {
        const value = version.parse(raw);
        requireThat(!versions.has(value), "schema"); versions.add(value);
      }
    }
    selected.set(key, Object.freeze({ rulesetId, versions }));
  }
  return selected;
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
  const accountTags = tagSnapshot(scope.accountVersionRuleTags), zoneTags = tagSnapshot(scope.zoneVersionRuleTags);
  const accountEntrypoints = entrypointSnapshot(scope.accountEntrypoints, false);
  const accountEntrypointVersionLists = entrypointSnapshot(scope.accountEntrypointVersionLists, true);
  const accountEntrypointVersions = entrypointSnapshot(scope.accountEntrypointVersions, true);
  const zoneEntrypoints = entrypointSnapshot(scope.zoneEntrypoints, false);
  const zoneEntrypointVersionLists = entrypointSnapshot(scope.zoneEntrypointVersionLists, true);
  const zoneEntrypointVersions = entrypointSnapshot(scope.zoneEntrypointVersions, true);
  function context(row: Row): void {
    if (Object.hasOwn(row, "account_id")) requireThat(row.account_id === account, "scope");
    if (Object.hasOwn(row, "account")) requireThat(object(row.account).id === account, "scope");
    if (Object.hasOwn(row, "zone_id")) requireThat(zone !== undefined && row.zone_id === zone, "scope");
    if (Object.hasOwn(row, "zone")) requireThat(zone !== undefined && object(row.zone).id === zone, "scope");
  }
  function tagContext(row: Row, args: TagArguments): void {
    context(row);
    if (Object.hasOwn(row, "ruleset_id")) requireThat(row.ruleset_id === args.rulesetId, "scope");
    if (Object.hasOwn(row, "ruleset_version")) requireThat(row.ruleset_version === args.rulesetVersion, "scope");
    if (Object.hasOwn(row, "rule_tag")) requireThat(row.rule_tag === args.ruleTag, "scope");
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
  function descriptor<A, O>(parent: "account" | "zone", kind: "list" | "get" | "versions.list" | "versions.get" |
    "entrypoint.get" | "entrypoint.versions.list" | "entrypoint.versions.get" | "versions.rules_by_tag.list", operation: string,
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
        if (kind === "versions.rules_by_tag.list") tagContext(body, tagInput.parse(value.arguments));
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
  function rulesByTag(parent: "account" | "zone", selections: ReadonlyMap<string, ReadonlySet<string>>) {
    const title = parent === "account" ? "Account" : "Zone";
    return descriptor(parent, "versions.rules_by_tag.list", `list${title}RulesetVersionRulesByTag`, raw => {
      const args = tagInput.parse(raw), key = tagKey(args);
      requireThat((selections.get(key)?.size ?? 0) > 0, "scope");
      // The official endpoint has no pagination parameters and returns a Ruleset response.
      return { arguments: args, suffix: `/${args.rulesetId}/versions/${args.rulesetVersion}/by_tag/${args.ruleTag}`, resource: key };
    }, (result, args) => {
      const row = object(result), id = identity(row, true).id; tagContext(row, args);
      requireThat(id === args.rulesetId && row.version === args.rulesetVersion, "scope");
      const rules = row.rules;
      requireThat(Array.isArray(rules) && rules.length <= 64, "cap");
      const items: Identity[] = [], seen = new Set<string>(), selected = selections.get(tagKey(args))!;
      for (const raw of rules) {
        const rule = object(raw); tagContext(rule, args);
        const id = identifier.parse(rule.id);
        requireThat(!seen.has(id), "upstream"); seen.add(id);
        version.parse(rule.version); dateTime(rule.last_updated);
        // Validate required common response fields, not the action-specific rule union.
        boundedString(rule.action); boundedString(rule.expression); boundedString(rule.ref);
        requireThat(typeof rule.enabled === "boolean", "upstream");
        if (Object.hasOwn(rule, "categories")) {
          requireThat(Array.isArray(rule.categories) && rule.categories.length > 0 && rule.categories.length <= 64, "upstream");
          const categories = new Set<string>();
          for (const category of rule.categories) {
            boundedString(category); requireThat(!categories.has(category), "upstream"); categories.add(category);
          }
          requireThat(categories.has(args.ruleTag), "scope");
        }
        if (selected.has(id)) items.push(Object.freeze({ id }));
      }
      return { subject: `configured-${parent}-ruleset-version-rule-identities` as const, items: Object.freeze(items), complete: false as const,
        effectiveProtection: "not-established" as const, serving: "not-established" as const, ownership: "not-established" as const };
    });
  }
  function entrypointTriple(parent: "account" | "zone", current: EntrypointSnapshot, lists: EntrypointSnapshot, gets: EntrypointSnapshot) {
    const title = parent === "account" ? "Account" : "Zone";
    const base = { subject: `configured-${parent}-ruleset-entrypoint-identities` as const,
      effectiveProtection: "not-established" as const, serving: "not-established" as const, ownership: "not-established" as const };
    function selected(args: EntrypointSelection, selections: EntrypointSnapshot) {
      const value = selections.get(args.phase);
      requireThat(phases.has(args.phase) && value !== undefined && value.rulesetId === args.rulesetId, "scope");
      return value;
    }
    function item(raw: unknown, args: EntrypointSelection, detail: boolean) {
      const id = identity(raw, detail).id, row = object(raw);
      // The URL alone cannot establish which immutable ruleset occupies a phase.
      requireThat(id === args.rulesetId && row.phase === args.phase, "scope");
      requireThat(typeof row.version === "string" && row.version.length <= 32, "upstream");
      return Object.freeze({ id, version: row.version });
    }
    const get = descriptor(parent, "entrypoint.get", `get${title}EntrypointRuleset`, raw => {
      const args = entrypointInput.parse(raw); selected(args, current);
      return { arguments: args, suffix: `/phases/${args.phase}/entrypoint`, resource: `entrypoint:${args.phase}:${args.rulesetId}:current` };
    }, (result, args) => ({ ...base, item: item(result, args, true) }));
    const versionsList = descriptor(parent, "entrypoint.versions.list", `list${title}EntrypointRulesetVersions`, raw => {
      const args = entrypointInput.parse(raw); selected(args, lists);
      // Official phase-entrypoint version lists have no pagination request parameters.
      return { arguments: args, suffix: `/phases/${args.phase}/entrypoint/versions`, resource: `entrypoint:${args.phase}:${args.rulesetId}:versions:list` };
    }, (result, args) => {
      requireThat(Array.isArray(result) && result.length <= 64, "cap");
      const items: Readonly<{ id: string; version: string }>[] = [], seen = new Set<string>();
      for (const raw of result) {
        const value = item(raw, args, false);
        requireThat(!seen.has(value.version), "upstream"); seen.add(value.version);
        if (lists.get(args.phase)!.versions.has(value.version)) items.push(value);
      }
      return { ...base, items: Object.freeze(items), complete: false as const };
    });
    const versionGet = descriptor(parent, "entrypoint.versions.get", `get${title}EntrypointRulesetVersion`, raw => {
      const args = entrypointVersionInput.parse(raw), value = selected(args, gets);
      requireThat(value.versions.has(args.rulesetVersion), "scope");
      return { arguments: args, suffix: `/phases/${args.phase}/entrypoint/versions/${args.rulesetVersion}`,
        resource: `entrypoint:${args.phase}:${args.rulesetId}:versions:${args.rulesetVersion}` };
    }, (result, args) => {
      const value = item(result, args, true); requireThat(value.version === args.rulesetVersion, "scope");
      return { ...base, item: value };
    });
    return { get, versionsList, versionGet };
  }
  const accountEntrypoint = entrypointTriple("account", accountEntrypoints, accountEntrypointVersionLists, accountEntrypointVersions);
  const zoneEntrypoint = zone === undefined ? undefined : entrypointTriple("zone", zoneEntrypoints, zoneEntrypointVersionLists, zoneEntrypointVersions);
  const accounts = pair("account", accountList, accountGet);
  const zones = zone === undefined ? undefined : pair("zone", zoneList, zoneGet);
  const accountVersionPair = versionPair("account", accountVersionLists, accountVersions);
  const zoneVersionPair = zone === undefined ? undefined : versionPair("zone", zoneVersionLists, zoneVersions);
  return Object.freeze({ accountList: accounts.list, accountGet: accounts.get,
    accountVersionRulesByTag: rulesByTag("account", accountTags),
    ...(zone === undefined ? {} : { zoneVersionRulesByTag: rulesByTag("zone", zoneTags) }),
    accountVersionsList: accountVersionPair.list, accountVersionGet: accountVersionPair.get,
    accountEntrypointGet: accountEntrypoint.get, accountEntrypointVersionsList: accountEntrypoint.versionsList,
    accountEntrypointVersionGet: accountEntrypoint.versionGet,
    ...(zoneEntrypoint === undefined ? {} : { zoneEntrypointGet: zoneEntrypoint.get,
      zoneEntrypointVersionsList: zoneEntrypoint.versionsList, zoneEntrypointVersionGet: zoneEntrypoint.versionGet }),
    ...(zones === undefined ? {} : { zoneList: zones.list, zoneGet: zones.get }),
    ...(zoneVersionPair === undefined ? {} : { zoneVersionsList: zoneVersionPair.list, zoneVersionGet: zoneVersionPair.get }) });
}
