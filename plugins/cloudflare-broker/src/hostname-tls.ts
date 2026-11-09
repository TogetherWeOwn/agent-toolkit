import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const setting = text(15, /^(?:ciphers|min_tls_version|http2)$(?![\s\S])/);
const hostname = text(253, /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$(?![\s\S])/);
const cipher = text(128, /^[A-Z0-9][A-Z0-9_-]*$(?![\s\S])/);
const listInput = closed({ settingId: setting });
const getInput = closed({ settingId: setting, hostname });
type Row = Record<string, unknown>;
export interface HostnameTlsScope {
  accountId: string;
  zoneId: string;
  revision: string;
  settings?: readonly { settingId: string; hostnames: readonly string[] }[];
}
interface TlsValue {
  readonly hostname: string;
  readonly value: string | readonly string[];
}
interface TlsResult {
  readonly settingId: string;
  readonly items: readonly TlsValue[];
  readonly subject: "configured-hostname-tls";
  readonly complete: false;
  readonly effectiveProtection: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}

export function hostnameTlsDescriptors(scope: HostnameTlsScope) {
  const account = identifier.parse(scope.accountId);
  const zone = identifier.parse(scope.zoneId);
  const revision = label.parse(scope.revision);
  const settings = scope.settings ?? [];
  requireThat(Array.isArray(settings) && settings.length <= 3, "cap");
  const allowed = new Map<string, Set<string>>();
  for (const entry of settings) {
    requireThat(entry !== null && typeof entry === "object", "schema");
    const id = setting.parse(entry.settingId);
    requireThat(!allowed.has(id), "schema");
    requireThat(Array.isArray(entry.hostnames) && entry.hostnames.length <= 100, "cap");
    const names = new Set<string>();
    for (const raw of entry.hostnames) {
      const name = hostname.parse(raw);
      requireThat(!names.has(name), "schema");
      names.add(name);
    }
    allowed.set(id, names);
  }
  function context(row: Row, id: string): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.zone_id === undefined || row.zone_id === zone, "scope");
    requireThat(row.setting_id === undefined || row.setting_id === id, "scope");
  }
  function projectValue(row: Row, id: string): TlsValue {
    context(row, id);
    requireThat(typeof row.hostname === "string" && allowed.get(id)?.has(row.hostname), "scope");
    let value: string | readonly string[];
    if (id === "ciphers") {
      requireThat(Array.isArray(row.value) && row.value.length > 0 && row.value.length <= 100, "cap");
      const values = row.value.map(item => cipher.parse(item));
      requireThat(new Set(values).size === values.length, "upstream");
      value = Object.freeze(values);
    } else {
      requireThat(typeof row.value === "string" && (id === "min_tls_version"
        ? ["1.0", "1.1", "1.2", "1.3"].includes(row.value) : ["on", "off"].includes(row.value)), "upstream");
      value = row.value;
    }
    return Object.freeze({ hostname: row.hostname, value });
  }
  function descriptor<A extends { settingId: string }>(schema: { parse(raw: unknown): A }, detail: boolean): MetadataDescriptor<A, TlsResult> {
    const prepared = new WeakSet<object>();
    return Object.freeze({ name: detail ? "cloudflare.tls.hostnames.get" : "cloudflare.tls.hostnames.list",
      version: "1", tier: "read" as const,
      providerOperationId: detail ? "per-hostname-tls-settings-get" : "per-hostname-tls-settings-list",
      prepare(raw: unknown) {
        const args = schema.parse(raw);
        const names = allowed.get(args.settingId);
        requireThat((names?.size ?? 0) > 0, "scope");
        const name = detail ? (args as A & { hostname: string }).hostname : undefined;
        if (detail) requireThat(names!.has(name!), "scope");
        const value = Object.freeze({ arguments: args,
          resource: Object.freeze({ id: `cloudflare:account:${account}:zone:${zone}:hostname-tls:${args.settingId}${detail ? `:hostname:${name}` : ""}`, revision }),
          request: Object.freeze({ method: "GET" as const,
            path: `/zones/${zone}/hostnames/settings/${args.settingId}${detail ? `/${name}` : ""}`,
            maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
        prepared.add(value);
        return value;
      },
      project(raw: string, value: PreparedMetadata<A>) {
        requireThat(prepared.has(value), "scope");
        requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
        const body = object(parsed);
        const id = value.arguments.settingId;
        context(body, id);
        requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
        const items: TlsValue[] = [];
        if (detail) {
          const row = object(body.result);
          requireThat(row.hostname === (value.arguments as A & { hostname: string }).hostname, "scope");
          items.push(projectValue(row, id));
        } else {
          requireThat(Array.isArray(body.result) && body.result.length <= 1000, "cap");
          const seen = new Set<string>();
          for (const rawRow of body.result) {
            const row = object(rawRow);
            context(row, id);
            requireThat(typeof row.hostname === "string", "upstream");
            if (!allowed.get(id)!.has(row.hostname)) continue;
            requireThat(!seen.has(row.hostname), "upstream");
            seen.add(row.hostname);
            items.push(projectValue(row, id));
          }
        }
        const output = Object.freeze({ settingId: id, items: Object.freeze(items), subject: "configured-hostname-tls" as const,
          complete: false as const, effectiveProtection: "not-established" as const });
        requireThat(Buffer.byteLength(JSON.stringify(output), "utf8") <= 32768, "cap");
        return output;
      },
    });
  }
  return Object.freeze({ settingsList: descriptor(listInput, false), settingGet: descriptor(getInput, true) });
}
