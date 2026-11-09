import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const revisionLabel = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const emptyInput = closed({});
const listInput = closed({ listId: identifier });
const itemInput = closed({ listId: identifier, itemId: identifier });
type Row = Record<string, unknown>;
type Identity = Readonly<{ id: string }>;
type ItemSelection = Readonly<{ listId: string; itemIds: readonly string[] }>;
export interface RulesListsScope {
  accountId: string;
  revision: string;
  listIds?: readonly string[];
  listDetailIds?: readonly string[];
  itemLists?: readonly ItemSelection[];
  items?: readonly ItemSelection[];
}
function object(raw: unknown): Row {
  requireThat(raw !== null && typeof raw === "object" && !Array.isArray(raw), "upstream");
  return raw as Row;
}
function snapshot(raw: readonly string[] | undefined): ReadonlySet<string> {
  const rows = raw === undefined ? [] : raw;
  requireThat(Array.isArray(rows) && rows.length <= 64, "cap");
  const ids = new Set<string>();
  for (const raw of rows) {
    const id = identifier.parse(raw); requireThat(!ids.has(id), "schema"); ids.add(id);
  }
  return ids;
}
function itemSnapshot(raw: readonly ItemSelection[] | undefined): ReadonlyMap<string, ReadonlySet<string>> {
  const rows = raw === undefined ? [] : raw;
  requireThat(Array.isArray(rows) && rows.length <= 32, "cap");
  const lists = new Map<string, ReadonlySet<string>>();
  for (const raw of rows) {
    const row = object(raw), listId = identifier.parse(row.listId);
    requireThat(!lists.has(listId) && Array.isArray(row.itemIds) && row.itemIds.length > 0, "schema");
    lists.set(listId, snapshot(row.itemIds as string[]));
  }
  return lists;
}
function boundedString(raw: unknown, max = 4096, allowEmpty = false): asserts raw is string {
  requireThat(typeof raw === "string" && (allowEmpty || raw.length > 0) && raw.length <= max &&
    !/[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(raw), "upstream");
}
function timestamp(raw: unknown): void {
  boundedString(raw, 64);
  // Conservative calendar-checked RFC3339 subset, not a provider revision fence.
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$(?![\s\S])/.exec(raw);
  requireThat(match !== null, "upstream");
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  requireThat(month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]! &&
    Number(match[4]) <= 23 && Number(match[5]) <= 59 && Number(match[6]) <= 59, "upstream");
}
function optionalBooleans(row: Row, keys: readonly string[]): void {
  for (const key of keys) if (Object.hasOwn(row, key)) requireThat(typeof row[key] === "boolean", "upstream");
}

// Identity-only source. No authority, credentials, transport or native registration.
export function rulesListsDescriptors(scope: RulesListsScope) {
  const account = identifier.parse(scope.accountId), revision = revisionLabel.parse(scope.revision);
  const lists = snapshot(scope.listIds), details = snapshot(scope.listDetailIds);
  const itemLists = itemSnapshot(scope.itemLists), items = itemSnapshot(scope.items);
  function context(row: Row, listId?: string, itemId?: string): void {
    if (Object.hasOwn(row, "account_id")) requireThat(row.account_id === account, "scope");
    if (Object.hasOwn(row, "account")) requireThat(object(row.account).id === account, "scope");
    if (Object.hasOwn(row, "list_id")) requireThat(listId !== undefined && row.list_id === listId, "scope");
    if (Object.hasOwn(row, "list")) requireThat(listId !== undefined && object(row.list).id === listId, "scope");
    if (Object.hasOwn(row, "item_id")) requireThat(itemId !== undefined && row.item_id === itemId, "scope");
    if (Object.hasOwn(row, "item")) requireThat(itemId !== undefined && object(row.item).id === itemId, "scope");
  }
  function identity(raw: unknown, item: boolean, selectedList?: string): Identity {
    const row = object(raw), id = identifier.parse(row.id);
    context(row, item ? selectedList : id, item ? id : undefined);
    timestamp(row.created_on); timestamp(row.modified_on);
    if (item) {
      if (Object.hasOwn(row, "comment")) boundedString(row.comment, 4096, true);
      const variants = ["ip", "hostname", "redirect", "asn"].filter(key => Object.hasOwn(row, key));
      requireThat(variants.length === 1, "upstream");
      // Validate the union's common/variant shapes, not target semantics or reachability.
      switch (variants[0]) {
        case "ip": boundedString(row.ip); break;
        case "asn": requireThat(Number.isSafeInteger(row.asn) && Number(row.asn) >= 0 && Number(row.asn) <= 4294967295, "upstream"); break;
        case "hostname": {
          const hostname = object(row.hostname); boundedString(hostname.url_hostname);
          optionalBooleans(hostname, ["exclude_exact_hostname"]); break;
        }
        case "redirect": {
          const redirect = object(row.redirect); boundedString(redirect.source_url); boundedString(redirect.target_url);
          optionalBooleans(redirect, ["include_subdomains", "preserve_path_suffix", "preserve_query_string", "subpath_matching"]);
          if (Object.hasOwn(redirect, "status_code")) requireThat([301, 302, 307, 308].includes(redirect.status_code as number), "upstream");
          break;
        }
      }
    } else {
      boundedString(row.name, 50); requireThat(/^[a-zA-Z0-9_]+$(?![\s\S])/.test(row.name), "upstream");
      requireThat(typeof row.kind === "string" && ["ip", "redirect", "hostname", "asn"].includes(row.kind), "upstream");
      for (const key of ["num_items", "num_referencing_filters"])
        requireThat(Number.isSafeInteger(row[key]) && Number(row[key]) >= 0, "upstream");
      if (Object.hasOwn(row, "description")) boundedString(row.description, 4096, true);
    }
    return Object.freeze({ id });
  }
  function descriptor<A>(name: string, operation: string, item: boolean, collection: boolean,
    prepare: (raw: unknown) => { arguments: A; suffix: string; resource: string; listId?: string; itemId?: string },
    select: (args: A) => ReadonlySet<string>): MetadataDescriptor<A, unknown> {
    const prepared = new WeakMap<object, { listId?: string; itemId?: string }>();
    return Object.freeze({ name, version: "1", tier: "read", providerOperationId: operation,
      prepare(raw: unknown) {
        const input = prepare(raw);
        const value = Object.freeze({ arguments: input.arguments,
          resource: Object.freeze({ id: `cloudflare:account:${account}:rules-lists:${input.resource}`, revision }),
          request: Object.freeze({ method: "GET" as const, path: `/accounts/${account}/rules/lists${input.suffix}`,
            maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
        prepared.set(value, { ...(input.listId === undefined ? {} : { listId: input.listId }),
          ...(input.itemId === undefined ? {} : { itemId: input.itemId }) });
        return value;
      },
      project(raw: string, value: PreparedMetadata<A>) {
        const selected = prepared.get(value); requireThat(selected !== undefined, "scope");
        requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
        const body = object(parsed); context(body, selected.listId, selected.itemId);
        requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 &&
          Array.isArray(body.messages) && body.messages.length <= 64 && Object.hasOwn(body, "result"), "upstream");
        const messages = new Set<string>();
        for (const raw of body.messages) {
          const row = object(raw); boundedString(row.message, 4096, true);
          requireThat(Number.isSafeInteger(row.code) && Number(row.code) >= 1000, "upstream");
          const key = JSON.stringify(row); requireThat(!messages.has(key), "upstream"); messages.add(key);
        }
        if (item && collection && Object.hasOwn(body, "result_info")) {
          const info = object(body.result_info);
          if (Object.hasOwn(info, "cursors")) {
            const cursors = object(info.cursors);
            for (const key of ["after", "before"]) if (Object.hasOwn(cursors, key)) boundedString(cursors[key], 4096, true);
          }
        }
        const base = { subject: item ? "configured-rules-list-item-identities" : "configured-rules-list-identities",
          ownership: "not-established", effectiveProtection: "not-established", serving: "not-established", complete: false as const };
        let output: Row;
        if (collection) {
          requireThat(Array.isArray(body.result) && body.result.length <= 64, "cap");
          const items: Identity[] = [], seen = new Set<string>(), allowed = select(value.arguments);
          for (const raw of body.result) {
            const row = identity(raw, item, selected.listId);
            requireThat(!seen.has(row.id), "upstream"); seen.add(row.id);
            if (allowed.has(row.id)) items.push(row);
          }
          output = { ...base, items: Object.freeze(items) };
        } else {
          const row = identity(body.result, item, selected.listId);
          requireThat(row.id === (item ? selected.itemId : selected.listId), "scope");
          output = { ...base, item: row };
        }
        requireThat(Buffer.byteLength(JSON.stringify(output), "utf8") <= 8192, "cap");
        return Object.freeze(output);
      },
    });
  }
  const listsList = descriptor("cloudflare.rules_lists.list", "lists-get-lists", false, true, raw => {
    const args = emptyInput.parse(raw); requireThat(lists.size > 0, "scope");
    // Official list collection declares no pagination request parameters.
    return { arguments: args, suffix: "", resource: "list" };
  }, () => lists);
  const listGet = descriptor("cloudflare.rules_lists.get", "lists-get-a-list", false, false, raw => {
    const args = listInput.parse(raw); requireThat(details.has(args.listId), "scope");
    return { arguments: args, listId: args.listId, suffix: `/${args.listId}`, resource: `${args.listId}:get` };
  }, () => details);
  const itemsList = descriptor("cloudflare.rules_lists.items.list", "lists-get-list-items", true, true, raw => {
    const args = listInput.parse(raw); requireThat(itemLists.has(args.listId), "scope");
    return { arguments: args, listId: args.listId, suffix: `/${args.listId}/items?per_page=64`, resource: `${args.listId}:items:list` };
  }, args => itemLists.get(args.listId)!);
  const itemGet = descriptor("cloudflare.rules_lists.items.get", "lists-get-a-list-item", true, false, raw => {
    const args = itemInput.parse(raw); requireThat(items.get(args.listId)?.has(args.itemId), "scope");
    return { arguments: args, listId: args.listId, itemId: args.itemId, suffix: `/${args.listId}/items/${args.itemId}`,
      resource: `${args.listId}:items:${args.itemId}:get` };
  }, args => items.get(args.listId)!);
  return Object.freeze({ listsList, listGet, itemsList, itemGet });
}
