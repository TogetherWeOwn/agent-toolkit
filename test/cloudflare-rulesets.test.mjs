import assert from "node:assert/strict";
import test from "node:test";
import { rulesetDescriptors } from "../dist/plugins/cloudflare-broker/src/rulesets.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { jsonData } from "../dist/packages/core/src/index.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), zone = "b".repeat(32), own = "c".repeat(32), foreign = "d".repeat(32);
const scope = () => ({ accountId: account, zoneId: zone, revision: "resource-1",
  accountListIds: [own], accountRulesetIds: [own], zoneListIds: [own], zoneRulesetIds: [own] });
const row = (id = own) => ({ id, version: "1", last_updated: "2026-01-01T00:00:00Z", name: derivedCanary,
  kind: "custom", phase: "http_request_firewall_custom", description: credentialCanary,
  rules: [{ id: foreign, expression: derivedCanary, action: "block", action_parameters: { secret: credentialCanary } }] });
const envelope = result => JSON.stringify({ success: true, errors: [], messages: [], result,
  result_info: { cursors: { after: derivedCanary } } });
const cases = [
  { key: "accountList", field: "accountListIds", parent: "account", list: true, operation: "listAccountRulesets" },
  { key: "accountGet", field: "accountRulesetIds", parent: "account", list: false, operation: "getAccountRuleset" },
  { key: "zoneList", field: "zoneListIds", parent: "zone", list: true, operation: "listZoneRulesets" },
  { key: "zoneGet", field: "zoneRulesetIds", parent: "zone", list: false, operation: "getZoneRuleset" },
];
const name = c => `cloudflare.rulesets.${c.parent}.${c.list ? "list" : "get"}`;
const args = c => c.list ? {} : { rulesetId: own };
const result = c => c.list ? [row(), row(foreign)] : row();
const path = c => `/${c.parent}s/${c.parent === "account" ? account : zone}/rulesets${c.list ? "?per_page=50" : `/${own}`}`;
const resource = c => `cloudflare:account:${account}${c.parent === "zone" ? `:zone:${zone}` : ""}:rulesets:${c.list ? "list" : own}`;
const base = c => ({ subject: `configured-${c.parent}-ruleset-identities`, effectiveProtection: "not-established",
  serving: "not-established", ownership: "not-established" });
function fixture(c, options = {}) {
  const f = providerFixture(), requests = [], s = options.scope ?? scope();
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    accountRulesetListIds: s.accountListIds, accountRulesetIds: s.accountRulesetIds,
    zone: { zoneId: zone, dnsRecordIds: [], rulesetListIds: s.zoneListIds, rulesetIds: s.zoneRulesetIds } },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    if (options.networkFailure) throw Error(derivedCanary);
    return new Response(options.response ?? envelope(result(c)), { status: options.status ?? 200,
      headers: options.headers ?? { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === name(c));
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource(c)] };
  f.dependencies.provider = "cloudflare"; f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, operation, requests, invoke: (input = args(c), key = "call-a") => broker.call(name(c), input, "verified-runtime", key) };
}
function safe(f, out) {
  const serialized = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const forbidden of [credentialCanary, derivedCanary, foreign, "expression", "action_parameters", "last_updated", "description", "cursors"])
    assert.ok(!serialized.includes(forbidden), forbidden);
}

test("Rulesets registry omits zone-less descriptors and defaults independently to deny", () => {
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [] },
    { accountId: account, revision: "resource-1" });
  for (const c of cases) {
    const op = operations.find(op => op.name === name(c));
    if (c.parent === "zone") assert.equal(op, undefined);
    else assert.throws(() => op.prepare(args(c)), /scope/);
  }
});

for (const c of cases) {
  test(`${name(c)} copies exact independent scopes and freezes prepared identity`, () => {
    const s = scope(), d = rulesetDescriptors(s)[c.key];
    s[c.field][0] = foreign; s[c.field].push("e".repeat(32)); s.accountId = foreign; s.zoneId = foreign; s.revision = "changed";
    const p = d.prepare(args(c));
    assert.equal(d.providerOperationId, c.operation); assert.equal(p.request.path, path(c));
    assert.deepEqual(p.resource, { id: resource(c), revision: "resource-1" });
    for (const v of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(v));
    assert.throws(() => d.project(envelope(result(c)), { ...p }), /scope/);
    assert.throws(() => rulesetDescriptors(scope())[c.key].project(envelope(result(c)), p), /scope/);
    for (const ids of [[own, own], [null], ["../escape"], ["C".repeat(32)], [own + "\n"], ["x".repeat(4097)]])
      assert.throws(() => rulesetDescriptors({ ...scope(), [c.field]: ids }), /schema/);
    assert.throws(() => rulesetDescriptors({ ...scope(), [c.field]: Array(101).fill(own) }), /cap/);
    const ids = Array.from({ length: c.list ? 64 : 100 }, (_, i) => i.toString(16).padStart(32, "0"));
    rulesetDescriptors({ ...scope(), [c.field]: ids });
    assert.throws(() => rulesetDescriptors({ ...scope(), [c.field]: [...ids, foreign] }), /cap/);
  });

  test(`${name(c)} emits selected IDs only without effective protection or ownership claims`, () => {
    const d = rulesetDescriptors(scope())[c.key], p = d.prepare(args(c)), out = d.project(envelope(result(c)), p);
    assert.deepEqual(out, c.list ? { ...base(c), items: [{ id: own }], complete: false } : { ...base(c), item: { id: own } });
    jsonData(out); safe({ audit: [], journal: [] }, out);
    assert.ok(Object.isFrozen(out)); assert.ok(Object.isFrozen(c.list ? out.items[0] : out.item));
    if (c.list) for (const rows of [[], [row(foreign)]]) {
      assert.deepEqual(d.project(envelope(rows), p), { ...base(c), items: [], complete: false });
    }
  });

  test(`${name(c)} rejects required official fields and optional contradictory parents on every row`, () => {
    const d = rulesetDescriptors(scope())[c.key], p = d.prepare(args(c));
    for (const field of ["id", "version", "last_updated", "name", "kind", "phase", ...(c.list ? [] : ["rules"])]) {
      const bad = row(); delete bad[field];
      assert.throws(() => d.project(envelope(c.list ? [bad] : bad), p), /upstream/);
    }
    for (const patch of [{ id: own + "\n" }, { version: "-1" }, { version: 1 }, { last_updated: "2026-02-30T00:00:00Z" },
      { last_updated: "2026-01-01T24:00:00Z" }, { name: "" }, { kind: "unknown" }, { phase: "unknown" },
      ...(!c.list ? [{ rules: null }, { rules: {} }, { rules: [null] }] : [])])
      assert.throws(() => d.project(envelope(c.list ? [{ ...row(), ...patch }] : { ...row(), ...patch }), p), /upstream/);
    for (const context of [{ account_id: foreign }, { zone_id: foreign }, { account: { id: foreign } },
      { zone: { id: foreign } }, { account: null }, { zone: {} }]) {
      const body = JSON.parse(envelope(result(c)));
      assert.throws(() => d.project(JSON.stringify({ ...body, ...context }), p), /scope|upstream/);
      for (const id of [own, foreign]) assert.throws(() => d.project(envelope(c.list ? [{ ...row(id), ...context }] : { ...row(id), ...context }), p), /scope|upstream/);
    }
  });

  test(`${name(c)} refuses malformed envelopes, duplicates, cursor shapes and byte bounds`, () => {
    const d = rulesetDescriptors(scope())[c.key], p = d.prepare(args(c));
    for (const raw of ["not-json", "null", "[]", "{}", envelope(null), envelope(c.list ? {} : []),
      JSON.stringify({ success: false, errors: [], messages: [], result: result(c) }),
      JSON.stringify({ success: true, errors: [credentialCanary], messages: [], result: result(c) }),
      JSON.stringify({ success: true, errors: [], result: result(c) }),
      JSON.stringify({ success: true, errors: [], messages: [null], result: result(c) }), "x".repeat(131073)])
      assert.throws(() => d.project(raw, p));
    if (c.list) {
      for (const rows of [[row(), row()], [row(foreign), row(foreign)], Array(51).fill(row())])
        assert.throws(() => d.project(envelope(rows), p), /upstream|cap/);
      for (const info of [null, [], { cursors: {} }, { cursors: { after: "" } }, { cursors: { after: 1 } }]) {
        const body = JSON.parse(envelope([])); body.result_info = info;
        assert.throws(() => d.project(JSON.stringify(body), p), /upstream/);
      }
      // result_info and cursors are not mandatory in the pinned schema. No inferred terminality.
      for (const info of [undefined, {}, { cursors: { after: "opaque" } }]) {
        const body = JSON.parse(envelope([])); body.result_info = info;
        assert.equal(d.project(JSON.stringify(body), p).complete, false);
      }
    } else assert.throws(() => d.project(envelope(row(foreign)), p), /scope/);
  });

  test(`${name(c)} independent default deny and closed model input precede credentials`, async () => {
    for (const s of [{}, { ...scope(), [c.field]: [] }]) {
      const f = fixture(c, { scope: s }); assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
    for (const patch of [{ accountId: account }, { zoneId: zone }, { revision: "other" }, { page: 1 }, { per_page: 1 },
      { cursor: "opaque" }, { headers: {} }, { url: "https://example.com" }, { agentId: "other" },
      { rulesetId: foreign }, { extra: "x".repeat(4097) }, { extra: Array(65).fill(0) },
      { extra: Array.from({ length: 64 }, () => [1, 2, 3, 4]) },
      { extra: { a: { b: { c: { d: { e: { f: { g: { h: {} } } } } } } } } }]) {
      const f = fixture(c); assert.equal((await f.invoke({ ...args(c), ...patch })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
  });

  test(`${name(c)} exact reviewed-core plan, audit, credential cleanup and replay`, async () => {
    const f = fixture(c), p = f.operation.prepare(args(c));
    assert.deepEqual(p, { resource: { id: resource(c), revision: "resource-1" }, arguments: args(c),
      plan: { kind: "bounded-current-read", providerOperationId: c.operation,
        request: { method: "GET", path: path(c), maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1, redirects: "deny" },
        providerDryRun: false, providerRevisionFence: "not-established" }, artifactDigest: null });
    const out = await f.invoke(); assert.equal(out.ok, true);
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${path(c)}`);
    assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.secret, 1); assert.equal(f.calls.close, 1);
    assert.deepEqual(f.audit.map(e => e.phase), ["intent", "outcome"]);
    assert.equal(f.audit[1].targetHash, f.audit[0].targetHash);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
  });

  test(`${name(c)} current policy, cross-endpoint resources, binding and lease-time revocation`, async () => {
    for (const denied of ["agent", "resource", "revision", "binding", "revocation", ...cases.filter(other => other !== c)]) {
      const f = fixture(c);
      if (denied === "agent") f.vector.policy.agents = ["other-agent"];
      if (denied === "resource") f.vector.policy.resources = [resource(c).replace(account, foreign)];
      if (denied === "revision") f.vector.policy.resources = [`${resource(c)}:other-revision`];
      if (typeof denied === "object") f.vector.policy.resources = [resource(denied)];
      if (denied === "binding") f.dependencies.host.revalidate = async () => false;
      if (denied === "revocation") {
        const resolve = f.dependencies.credentials.resolve;
        f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "revoked"; return lease; };
      }
      const out = await f.invoke();
      assert.equal(out.code, denied === "binding" ? "RESOURCE_CHANGED" : denied === "revocation" ? "POLICY_CHANGED" : "POLICY_DENIED");
      assert.equal(f.calls.secret, denied === "revocation" ? 1 : 0); assert.equal(f.requests.length, 0); safe(f, out);
    }
  });

  test(`${name(c)} prepared swaps and forged result receipts never reach fetch`, async () => {
    const f = fixture(c), p = f.operation.prepare(args(c));
    for (const mutate of [p => { p.resource.id += ":other"; }, p => { p.resource.revision = "other"; },
      p => { p.plan.request.path += "/other"; }, p => { p.plan.request.maxResponseBytes++; }, p => { p.arguments.cursor = "forged"; }]) {
      const changed = structuredClone(p); mutate(changed);
      await assert.rejects(() => f.operation.execute(changed, credentialCanary, new AbortController().signal), /scope|schema/);
    }
    assert.throws(() => f.operation.project({}), /scope/); assert.equal(f.requests.length, 0);
  });

  test(`${name(c)} transport, projection, audit outage and cleanup uncertainty retain replay tombstones`, async () => {
    for (const options of [{ response: "not-json" }, { status: 403 }, { status: 404 }, { status: 302 },
      { response: "x".repeat(131073) }, { headers: { "content-type": "text/html" } }, { networkFailure: true },
      { response: envelope(c.list ? [row(), row()] : row(foreign)) }, { auditFailure: true }, { cleanupFailure: true }]) {
      const f = fixture(c, options), append = f.dependencies.audit.append;
      if (options.auditFailure) f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw Error(credentialCanary); };
      if (options.cleanupFailure) f.dependencies.credentials.resolve = async () => {
        f.calls.secret++; return { value: credentialCanary, redactions: [derivedCanary], async close() { f.calls.close++; throw Error(credentialCanary); } };
      };
      const out = await f.invoke();
      assert.equal(out.code, options.auditFailure || options.cleanupFailure ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
      assert.equal([...f.journal.values()][0].outcome, "uncertain");
      assert.equal(f.calls.close, options.cleanupFailure ? 2 : 1);
      const journal = structuredClone([...f.journal]);
      if (options.auditFailure) { assert.equal((await f.invoke()).code, "AUDIT_UNAVAILABLE"); f.dependencies.audit.append = append; }
      assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
      assert.deepEqual([...f.journal], journal); assert.equal(f.calls.secret, 1); assert.equal(f.requests.length, 1); safe(f, out);
    }
    const f = fixture(c); f.dependencies.audit.append = async () => { throw Error(credentialCanary); };
    assert.equal((await f.invoke()).code, "AUDIT_UNAVAILABLE"); assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  });

  test(`${name(c)} maximum output fits core array/depth/node/string caps at raw byte boundary`, async () => {
    const ids = Array.from({ length: 64 }, (_, i) => i.toString(16).padStart(32, "0"));
    const body = JSON.parse(envelope(c.list ? ids.slice(0, 50).map(id => row(id)) : row()));
    body.padding = ""; body.padding = "x".repeat(131072 - Buffer.byteLength(JSON.stringify(body)));
    const response = JSON.stringify(body); assert.equal(Buffer.byteLength(response), 131072);
    const f = fixture(c, { scope: { ...scope(), [c.field]: c.list ? ids : [own] }, response });
    const out = await f.invoke(); assert.equal(out.ok, true); jsonData(out.value);
    if (c.list) { assert.equal(out.value.items.length, 50); assert.equal(out.value.complete, false); }
    assert.ok(Buffer.byteLength(JSON.stringify(out.value)) < 16384);
    assert.equal(f.requests.length, 1); safe(f, out);
  });
}
