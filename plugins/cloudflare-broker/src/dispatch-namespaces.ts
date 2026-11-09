import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const accountId = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const namespaceId = text(36, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$(?![\s\S])/);
const namespaceName = text(63, /^[A-Za-z0-9][A-Za-z0-9_-]*$(?![\s\S])/);
const empty = closed({});
const detail = closed({ namespaceName });
type Row = Record<string, unknown>;
type Identity = Readonly<{ id: string; name: string }>;
export interface DispatchNamespaceScope {
  accountId: string;
  revision: string;
  listNamespaces?: readonly { namespaceId: string; namespaceName: string }[];
  namespaces?: readonly { namespaceId: string; namespaceName: string }[];
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}
function snapshot(rows: DispatchNamespaceScope["namespaces"]) {
  const selected = rows === undefined ? [] : rows;
  requireThat(Array.isArray(selected) && selected.length <= 100, "cap");
  const names = new Map<string, string>(), ids = new Set<string>();
  for (const row of selected) {
    requireThat(row !== null && typeof row === "object", "schema");
    const id = namespaceId.parse(row.namespaceId), name = namespaceName.parse(row.namespaceName);
    requireThat(!ids.has(id) && !names.has(name), "schema");
    names.set(name, id); ids.add(id);
  }
  return { names, ids };
}

export function dispatchNamespaceDescriptors(scope: DispatchNamespaceScope) {
  const account = accountId.parse(scope.accountId), revision = label.parse(scope.revision);
  const list = snapshot(scope.listNamespaces), details = snapshot(scope.namespaces);
  const base = { subject: "provider-dispatch-namespace-identities" as const, complete: false as const,
    servingDeployment: "not-established" as const, productionConsumer: "not-established" as const };
  function context(row: Row): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
  }
  function identity(row: Row, name: string, id: string): Identity {
    context(row);
    requireThat(row.namespace_id === id && row.namespace_name === name, "scope");
    return Object.freeze({ id, name });
  }
  function descriptor<A, O>(name: string, operation: string, prepare: (raw: unknown) => { arguments: A; suffix: string; resource: string },
    project: (result: unknown, args: A) => O): MetadataDescriptor<A, O> {
    const prepared = new WeakSet<object>();
    return Object.freeze({ name, version: "1", tier: "read" as const, providerOperationId: operation,
      prepare(raw: unknown) {
        const input = prepare(raw);
        const value = Object.freeze({ arguments: input.arguments,
          resource: Object.freeze({ id: `cloudflare:account:${account}:${input.resource}`, revision }),
          request: Object.freeze({ method: "GET" as const, path: `/accounts/${account}/workers/dispatch/namespaces${input.suffix}`,
            maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
        prepared.add(value); return value;
      },
      project(raw: string, value: PreparedMetadata<A>) {
        requireThat(prepared.has(value), "scope");
        requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
        const body = object(parsed); context(body);
        requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
        const output = project(body.result, value.arguments);
        requireThat(Buffer.byteLength(JSON.stringify(output), "utf8") <= 32768, "cap");
        return Object.freeze(output);
      },
    });
  }
  // The official list has no pagination parameters. This bounded filtered read
  // never claims complete namespace or script inventory.
  const dispatchNamespacesList = descriptor("cloudflare.workers.dispatch_namespaces.list", "namespace-worker-list", raw => {
    const args = empty.parse(raw); requireThat(list.names.size > 0, "scope");
    return { arguments: args, suffix: "", resource: "dispatch-namespaces" };
  }, result => {
    requireThat(Array.isArray(result) && result.length <= 100, "cap");
    const items: Identity[] = [], seen = new Set<string>();
    for (const raw of result) {
      const row = object(raw); context(row);
      requireThat(typeof row.namespace_id === "string" && typeof row.namespace_name === "string", "upstream");
      const expected = list.names.get(row.namespace_name);
      if (expected === undefined) { requireThat(!list.ids.has(row.namespace_id), "scope"); continue; }
      requireThat(!seen.has(expected), "scope"); seen.add(expected);
      items.push(identity(row, row.namespace_name, expected));
    }
    return { ...base, items: Object.freeze(items) };
  });
  const dispatchNamespaceGet = descriptor("cloudflare.workers.dispatch_namespaces.get", "namespace-worker-get-namespace", raw => {
    const args = detail.parse(raw); requireThat(details.names.has(args.namespaceName), "scope");
    return { arguments: args, suffix: `/${args.namespaceName}`, resource: `dispatch-namespace:${details.names.get(args.namespaceName)!}` };
  }, (result, args) => ({ ...base, namespace: identity(object(result), args.namespaceName, details.names.get(args.namespaceName)!) }));
  return Object.freeze({ dispatchNamespacesList, dispatchNamespaceGet });
}
