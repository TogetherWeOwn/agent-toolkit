import assert from "node:assert/strict";
import test from "node:test";
import { rulesListsDescriptors } from "../dist/plugins/cloudflare-broker/src/rules-lists.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { jsonData } from "../dist/packages/core/src/index.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), listId = "b".repeat(32), itemId = "c".repeat(32), foreign = "d".repeat(32);
const selection = () => [{ listId, itemIds: [itemId] }];
const scope = () => ({ accountId: account, revision: "resource-1", listIds: [listId], listDetailIds: [listId], itemLists: selection(), items: selection() });
const stamp = "2024-02-29T00:00:00Z";
const listRow = (id = listId) => ({ id, name: "private_list", kind: "ip", num_items: 1, num_referencing_filters: 0,
  created_on: stamp, modified_on: stamp, description: derivedCanary });
const variants = [
  { ip: "192.0.2.0/24" }, { ip: "2001:db8::/32" }, { asn: 64512 },
  { hostname: { url_hostname: "*.example.invalid", exclude_exact_hostname: false } },
  { redirect: { source_url: "example.invalid/private", target_url: "https://destination.invalid/private",
    status_code: 308, include_subdomains: false, preserve_path_suffix: true, preserve_query_string: false, subpath_matching: true } },
];
const itemRow = (id = itemId, variant = variants[0]) => ({ id, created_on: stamp, modified_on: stamp, comment: derivedCanary, ...variant });
const envelope = result => JSON.stringify({ success: true, errors: [], messages: [], result });
const cases = [
  { key: "listsList", field: "listIds", name: "cloudflare.rules_lists.list", operation: "lists-get-lists", collection: true, item: false },
  { key: "listGet", field: "listDetailIds", name: "cloudflare.rules_lists.get", operation: "lists-get-a-list", collection: false, item: false },
  { key: "itemsList", field: "itemLists", name: "cloudflare.rules_lists.items.list", operation: "lists-get-list-items", collection: true, item: true },
  { key: "itemGet", field: "items", name: "cloudflare.rules_lists.items.get", operation: "lists-get-a-list-item", collection: false, item: true },
];
const args = c => c.key === "listsList" ? {} : { listId, ...(c.key === "itemGet" ? { itemId } : {}) };
const row = c => c.item ? itemRow() : listRow();
const result = c => c.collection ? [row(c)] : row(c);
const path = c => `/accounts/${account}/rules/lists${c.key === "listsList" ? "" : `/${listId}`}${c.item ? `/items${c.collection ? "?per_page=64" : `/${itemId}`}` : ""}`;
const resource = c => `cloudflare:account:${account}:rules-lists:${c.key === "listsList" ? "list" : `${listId}:${c.item ? `items:${c.collection ? "list" : `${itemId}:get`}` : "get"}`}`;
const base = c => ({ subject: c.item ? "configured-rules-list-item-identities" : "configured-rules-list-identities",
  ownership: "not-established", effectiveProtection: "not-established", serving: "not-established", complete: false });
function fixture(c, options = {}) {
  const f = providerFixture(), requests = [], s = options.scope ?? scope();
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    rulesListIds: s.listIds, rulesListDetailIds: s.listDetailIds, rulesListItemLists: s.itemLists, rulesListItems: s.items },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init }); assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    if (options.networkFailure) throw Error(derivedCanary);
    return new Response(options.response ?? envelope(result(c)), { status: options.status ?? 200,
      headers: options.headers ?? { "content-type": "application/json" } });
  });
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource(c)] };
  f.dependencies.provider = "cloudflare"; f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies), operation = operations.find(op => op.name === c.name);
  return { ...f, requests, operation, invoke: (input = args(c), key = "call-a") => broker.call(c.name, input, "verified-runtime", key) };
}
function safe(f, out) {
  const serialized = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const forbidden of [credentialCanary, derivedCanary, foreign, "private_list", "192.0.2.", "2001:db8", "64512", "example.invalid",
    "destination.invalid", "created_on", "modified_on", "description", "comment", "source_url", "target_url", "url_hostname", "cursors"])
    assert.ok(!serialized.includes(forbidden), forbidden);
}

test("Rules Lists ledger exposes exactly four descriptor-only disabled rows and leaves bulk/mutations missing", async () => {
  const { readFile } = await import("node:fs/promises");
  const rows = (await readFile(new URL("../plugins/cloudflare-broker/coverage/operations.jsonl", import.meta.url), "utf8")).trim().split("\n").map(JSON.parse);
  const family = rows.filter(r => r.areas[0] === "Lists");
  assert.deepEqual(family.filter(r => r.typedTool).map(r => r.operationId).sort(), cases.map(c => c.operation).sort());
  for (const r of family) {
    assert.equal(r.review, "not-reviewed"); assert.equal(r.enablement, "disabled");
    assert.equal(r.implementation, cases.some(c => c.operation === r.operationId) ? "descriptor-only" : "missing");
  }
});

for (const c of cases) {
  test(`${c.name} independently snapshots default-empty scopes and exact frozen selectors`, () => {
    const s = scope(), d = rulesListsDescriptors(s)[c.key];
    s.listIds[0] = foreign; s.listDetailIds[0] = foreign;
    s.itemLists[0].listId = foreign; s.itemLists[0].itemIds[0] = foreign; s.items[0].itemIds.push(foreign);
    s.accountId = foreign; s.revision = "changed";
    const p = d.prepare(args(c));
    assert.equal(d.providerOperationId, c.operation); assert.equal(p.request.path, path(c));
    assert.deepEqual(p.resource, { id: resource(c), revision: "resource-1" });
    for (const value of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
    for (const copy of [{ ...p }, structuredClone(p)]) assert.throws(() => d.project(envelope(result(c)), copy), /scope/);
    assert.throws(() => rulesListsDescriptors(scope())[c.key].project(envelope(result(c)), p), /scope/);
    const partial = rulesListsDescriptors({ accountId: account, revision: "resource-1", [c.field]: scope()[c.field] });
    for (const other of cases) {
      if (other === c) partial[other.key].prepare(args(other));
      else assert.throws(() => partial[other.key].prepare(args(other)), /scope/);
    }
    for (const bad of [null, {}, [null], [foreign + "\n"], ...(c.item ? [[{ listId, itemIds: [] }], [...selection(), ...selection()],
      [{ listId, itemIds: [itemId, itemId] }], [{ listId, itemIds: ["latest"] }]] : [[listId, listId]])])
      assert.throws(() => rulesListsDescriptors({ ...scope(), [c.field]: bad }));
  });

  test(`${c.name} projects only selected immutable IDs for every official variant`, () => {
    const d = rulesListsDescriptors(scope())[c.key], p = d.prepare(args(c));
    for (const variant of c.item ? variants : [undefined]) {
      const ownRow = c.item ? itemRow(itemId, variant) : listRow();
      const out = d.project(envelope(c.collection ? [ownRow, c.item ? itemRow(foreign, variant) : listRow(foreign)] : ownRow), p);
      assert.deepEqual(out, { ...base(c), ...(c.collection ? { items: [{ id: c.item ? itemId : listId }] } : { item: { id: c.item ? itemId : listId } }) });
      jsonData(out); safe({ audit: [], journal: [] }, out);
      assert.ok(Object.isFrozen(out)); assert.ok(Object.isFrozen(c.collection ? out.items[0] : out.item));
    }
    if (c.collection) for (const rows of [[], [c.item ? itemRow(foreign) : listRow(foreign)]])
      assert.deepEqual(d.project(envelope(rows), p), { ...base(c), items: [] });
  });

  test(`${c.name} discards bounded multiline free text on selected and unselected rows through actual core`, async () => {
    const d = rulesListsDescriptors(scope())[c.key], p = d.prepare(args(c)), field = c.item ? "comment" : "description";
    for (const discarded of [`${derivedCanary}\nsecond line\r\t\u0000\u0085😀`, "", "x".repeat(4096)]) {
      const selected = { ...row(c), [field]: discarded };
      const rows = c.collection ? [selected, { ...row(c), id: foreign, [field]: discarded }] : selected;
      const response = envelope(rows), expected = { ...base(c), ...(c.collection ? { items: [{ id: c.item ? itemId : listId }] } : { item: { id: c.item ? itemId : listId } }) };
      assert.deepEqual(d.project(response, p), expected);
      const f = fixture(c, { response }), out = await f.invoke();
      assert.equal(out.ok, true); assert.deepEqual(out.value, expected); safe(f, out);
      assert.equal(f.requests.length, 1); assert.equal(f.calls.close, 1);
      assert.deepEqual(f.audit.map(e => e.phase), ["intent", "outcome"]);
      assert.equal([...f.journal.values()][0].outcome, "complete");
      assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1);
    }
    for (const discarded of [1, null, {}, "x".repeat(4097)]) {
      const bad = { ...row(c), id: c.collection ? foreign : row(c).id, [field]: discarded };
      assert.throws(() => d.project(envelope(c.collection ? [row(c), bad] : bad), p));
    }
  });

  test(`${c.name} rejects malformed common metadata, union shapes and explicit foreign context even when unselected`, () => {
    const d = rulesListsDescriptors(scope())[c.key], p = d.prepare(args(c));
    const project = bad => d.project(envelope(c.collection ? [row(c), bad] : bad), p);
    const required = c.item ? ["id", "created_on", "modified_on", "ip"] : ["id", "name", "kind", "num_items", "num_referencing_filters", "created_on", "modified_on"];
    for (const field of required) { const bad = row(c); delete bad[field]; assert.throws(() => project(bad)); }
    const patches = [{ id: "latest" }, { id: (c.item ? itemId : listId) + "\n" }, { id: "Ａ".repeat(32) },
      { created_on: "2026-02-29T00:00:00Z" }, { modified_on: "2024-02-29T24:00:00Z" }, { modified_on: "no-date" },
      { account_id: foreign }, { account: {} }, { account: null }, { list_id: foreign }, { list: { id: foreign } },
      ...(c.item ? [{ ip: null }, { ip: "" }, { ip: "\ud800" }, { ip: "x".repeat(4097) }, { asn: 1 }, { comment: 1 }] :
        [{ name: "" }, { name: "bad-name" }, { name: "a".repeat(51) }, { name: "a\n" }, { kind: "other" },
          { num_items: -1 }, { num_items: 1.5 }, { num_referencing_filters: null }, { description: 1 }])];
    for (const patch of patches) {
      assert.throws(() => project({ ...row(c), ...patch }));
      if (c.collection) assert.throws(() => project({ ...row(c), id: "e".repeat(32), ...patch }));
    }
    if (c.item) for (const variant of [{ asn: -1 }, { asn: 4294967296 }, { asn: 1.5 }, { hostname: null }, { hostname: {} },
      { hostname: { url_hostname: "ok", exclude_exact_hostname: 1 } }, { redirect: {} },
      { redirect: { source_url: "x", target_url: "y", status_code: 200 } },
      { redirect: { source_url: "x", target_url: "y", include_subdomains: 1 } }, { hostname: { url_hostname: "x" }, asn: 1 }])
      assert.throws(() => project(itemRow(foreign, variant)));
    if (!c.collection) assert.throws(() => project(c.item ? itemRow(foreign) : listRow(foreign)), /scope/);
    const body = JSON.parse(envelope(result(c)));
    for (const patch of [{ account_id: foreign }, { account: null }, { list_id: foreign }, { list: {} }, ...(c.key === "itemGet" ? [{ item_id: foreign }] : [])])
      assert.throws(() => d.project(JSON.stringify({ ...body, ...patch }), p));
  });

  test(`${c.name} bounds envelopes, duplicate identities/messages and cursor containers`, () => {
    const d = rulesListsDescriptors(scope())[c.key], p = d.prepare(args(c)), body = JSON.parse(envelope(result(c)));
    for (const raw of ["null", "[]", "not-json", "{}", "x".repeat(131073), envelope(null), envelope(c.collection ? {} : [])])
      assert.throws(() => d.project(raw, p));
    for (const patch of [{ success: false }, { errors: [credentialCanary] }, { messages: undefined }, { messages: [null] },
      { messages: [{ message: "x" }] }, { messages: [{ code: 999, message: "x" }] }, { messages: [{ code: 1000, message: "x\n" }] },
      { messages: [{ code: 1000, message: "x" }, { code: 1000, message: "x" }] },
      { messages: [{ code: 1000, message: "x" }, { message: "x", code: 1000 }] },
      { messages: [{ code: 1000, message: "x", extra: 1 }, { message: "x", extra: 2, code: 1000 }] },
      { messages: Array(65).fill({ code: 1000, message: "ok" }) }])
      assert.throws(() => d.project(JSON.stringify({ ...body, ...patch }), p));
    if (c.collection) for (const rows of [[row(c), row(c)], [c.item ? itemRow(foreign) : listRow(foreign), c.item ? itemRow(foreign) : listRow(foreign)], Array(65).fill(row(c))])
      assert.throws(() => d.project(envelope(rows), p));
    if (c.key === "itemsList") {
      for (const info of [null, [], { cursors: null }, { cursors: { after: 1 } }, { cursors: { before: "\ud800" } }])
        assert.throws(() => d.project(JSON.stringify({ ...body, result_info: info }), p));
      for (const info of [{}, { cursors: {} }, { cursors: { after: "opaque", before: "" } }])
        assert.equal(d.project(JSON.stringify({ ...body, result_info: info }), p).complete, false);
    }
  });

  test(`${c.name} default denial and closed path selectors refuse before credentials/network`, async () => {
    for (const s of [{}, { ...scope(), [c.field]: [] }]) {
      const f = fixture(c, { scope: s }); assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
    for (const patch of [{ accountId: account }, { revision: "other" }, { page: 1 }, { per_page: 1 }, { cursor: "opaque" }, { search: "x" },
      { headers: {} }, { url: "https://example.invalid" }, { principal: {} }, { policy: {} }, { modelContext: {} }, { agentId: "other" },
      { listId: foreign }, { listId: "latest" }, { listId: listId + "\n" }, { listId: "../x" }, { listId: "%2f" },
      { listId: "Ａ".repeat(32) }, { itemId: "latest" }, { itemId: foreign }, { itemId: 1 }, { itemId: itemId + "\n" },
      { extra: "x".repeat(4097) }, { extra: Array(65).fill(0) }, { extra: Array.from({ length: 64 }, () => [1, 2, 3, 4]) },
      { extra: { a: { b: { c: { d: { e: { f: { g: { h: {} } } } } } } } } }]) {
      const f = fixture(c); assert.equal((await f.invoke({ ...args(c), ...patch })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
  });

  test(`${c.name} executes one exact bounded GET through actual core with cleanup/audit/replay`, async () => {
    const f = fixture(c), p = f.operation.prepare(args(c));
    assert.deepEqual(p, { resource: { id: resource(c), revision: "resource-1" }, arguments: args(c), artifactDigest: null,
      plan: { kind: "bounded-current-read", providerOperationId: c.operation, providerDryRun: false, providerRevisionFence: "not-established",
        request: { method: "GET", path: path(c), maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1, redirects: "deny" } } });
    const out = await f.invoke(); assert.equal(out.ok, true);
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${path(c)}`);
    assert.equal(f.requests[0].init.redirect, "manual"); assert.equal(f.requests[0].init.method, "GET");
    assert.equal(f.calls.secret, 1); assert.equal(f.calls.close, 1);
    assert.deepEqual(f.audit.map(e => e.phase), ["intent", "outcome"]);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
  });

  test(`${c.name} policy resources stay endpoint/account/selector exact before credentials`, async () => {
    for (const denied of [resource(c).replace(account, foreign), `${resource(c)}:different`, `cloudflare:account:${account}:rulesets:${listId}`,
      ...cases.filter(other => other !== c).map(resource), ...(c.item ? [resource(c).replace(listId, foreign)] : []),
      ...(c.key === "itemGet" ? [resource(c).replace(itemId, foreign)] : [])]) {
      const f = fixture(c); f.vector.policy.resources = [denied];
      assert.equal((await f.invoke()).code, "POLICY_DENIED"); assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
    const f = fixture(c); f.vector.policy.agents = ["other-agent"];
    assert.equal((await f.invoke()).code, "POLICY_DENIED"); assert.equal(f.calls.secret, 0);
  });

  test(`${c.name} actual trusted revision drift and lease-time policy revocation refuse`, async () => {
    for (const duringLease of [false, true]) {
      const f = fixture(c); let currentRevision = duringLease ? "resource-1" : "resource-2";
      f.dependencies.host.revalidate = async (_principal, resource) => resource.revision === currentRevision;
      if (duringLease) { const resolve = f.dependencies.credentials.resolve;
        f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); currentRevision = "resource-2"; return lease; }; }
      assert.equal((await f.invoke()).code, "RESOURCE_CHANGED"); assert.equal(f.calls.secret, duringLease ? 1 : 0);
      assert.equal(f.calls.close, duringLease ? 1 : 0); assert.equal(f.requests.length, 0);
    }
    const f = fixture(c), resolve = f.dependencies.credentials.resolve;
    f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "revoked"; return lease; };
    assert.equal((await f.invoke()).code, "POLICY_CHANGED"); assert.equal(f.calls.close, 1); assert.equal(f.requests.length, 0);
  });

  test(`${c.name} copied/tampered preparation and forged receipts cannot execute`, async () => {
    const f = fixture(c), p = f.operation.prepare(args(c));
    for (const mutate of [p => { p.resource.id += ":other"; }, p => { p.resource.revision = "other"; }, p => { p.plan.request.path += "/other"; },
      p => { p.plan.request.maxResponseBytes++; }, p => { p.arguments.listId = foreign; }]) {
      const changed = structuredClone(p); mutate(changed);
      await assert.rejects(() => f.operation.execute(changed, credentialCanary, new AbortController().signal));
    }
    assert.throws(() => f.operation.project({}), /scope/); assert.equal(f.requests.length, 0);
  });

  test(`${c.name} transport/audit/cleanup outages tombstone uncertainty with no retry`, async () => {
    for (const options of [{ response: "not-json" }, { status: 403 }, { status: 404 }, { status: 302 }, { response: "x".repeat(131073) },
      { headers: { "content-type": "text/html" } }, { networkFailure: true }, { auditFailure: true }, { cleanupFailure: true }]) {
      const f = fixture(c, options), append = f.dependencies.audit.append;
      if (options.auditFailure) f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw Error(credentialCanary); };
      if (options.cleanupFailure) f.dependencies.credentials.resolve = async () => { f.calls.secret++;
        return { value: credentialCanary, redactions: [derivedCanary], async close() { f.calls.close++; throw Error(credentialCanary); } }; };
      const out = await f.invoke();
      assert.equal(out.code, options.auditFailure || options.cleanupFailure ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
      assert.equal([...f.journal.values()][0].outcome, "uncertain"); assert.equal(f.calls.close, options.cleanupFailure ? 2 : 1);
      const journal = structuredClone([...f.journal]);
      if (options.auditFailure) { assert.equal((await f.invoke()).code, "AUDIT_UNAVAILABLE"); f.dependencies.audit.append = append; }
      assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.deepEqual([...f.journal], journal);
      assert.equal(f.calls.secret, 1); assert.equal(f.requests.length, 1); safe(f, out);
    }
    const f = fixture(c); f.dependencies.audit.append = async () => { throw Error(credentialCanary); };
    assert.equal((await f.invoke()).code, "AUDIT_UNAVAILABLE"); assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  });

  test(`${c.name} maximum accepted identity output fits actual core and over-bound refuses`, async () => {
    const ids = Array.from({ length: 64 }, (_, i) => (i + 1).toString(16).padStart(32, "0"));
    const s = scope(); s[c.field] = c.item ? [{ listId, itemIds: ids }] : ids;
    const input = c.key === "itemGet" ? { listId, itemId: ids[0] } : c.key === "listGet" ? { listId: ids[0] } : args(c);
    const rows = ids.map(id => c.item ? itemRow(id) : listRow(id));
    const body = JSON.parse(envelope(c.collection ? rows : rows[0])); body.padding = "";
    body.padding = "x".repeat(131072 - Buffer.byteLength(JSON.stringify(body)));
    const response = JSON.stringify(body); assert.equal(Buffer.byteLength(response), 131072);
    const f = fixture(c, { scope: s, response }); f.vector.policy.resources = [f.operation.prepare(input).resource.id];
    const out = await f.invoke(input); assert.equal(out.ok, true); jsonData(out.value);
    if (c.collection) assert.equal(out.value.items.length, 64);
    assert.equal(out.value.complete, false); assert.ok(Buffer.byteLength(JSON.stringify(out.value)) <= 8192); safe(f, out);
    const d = rulesListsDescriptors(s)[c.key], p = d.prepare(input);
    assert.throws(() => d.project(response + " ", p), /cap/);
    if (c.collection) assert.throws(() => d.project(envelope([...rows, c.item ? itemRow(foreign) : listRow(foreign)]), p), /cap/);
    assert.throws(() => rulesListsDescriptors({ ...s, [c.field]: c.item ? [{ listId, itemIds: [...ids, foreign] }] : [...ids, foreign] }), /cap/);
  });
}
