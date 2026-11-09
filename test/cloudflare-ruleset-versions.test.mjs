import assert from "node:assert/strict";
import test from "node:test";
import { rulesetDescriptors } from "../dist/plugins/cloudflare-broker/src/rulesets.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { jsonData } from "../dist/packages/core/src/index.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), zone = "b".repeat(32), own = "c".repeat(32), foreign = "d".repeat(32);
const selected = () => [{ rulesetId: own, versions: ["1", "01", "9007199254740993"] }];
const scope = () => ({ accountId: account, zoneId: zone, revision: "resource-1",
  accountVersionLists: selected(), accountVersions: selected(), zoneVersionLists: selected(), zoneVersions: selected() });
const row = (version = "1", id = own) => ({ id, version, last_updated: "2024-02-29T00:00:00Z", name: derivedCanary,
  kind: "custom", phase: "http_request_firewall_custom", description: credentialCanary,
  rules: [{ expression: derivedCanary, action: "block", action_parameters: { secret: credentialCanary } }] });
const envelope = result => JSON.stringify({ success: true, errors: [], messages: [], result });
const cases = [
  { key: "accountVersionsList", field: "accountVersionLists", parent: "account", list: true, operation: "listAccountRulesetVersions" },
  { key: "accountVersionGet", field: "accountVersions", parent: "account", list: false, operation: "getAccountRulesetVersion" },
  { key: "zoneVersionsList", field: "zoneVersionLists", parent: "zone", list: true, operation: "listZoneRulesetVersions" },
  { key: "zoneVersionGet", field: "zoneVersions", parent: "zone", list: false, operation: "getZoneRulesetVersion" },
];
const name = c => `cloudflare.rulesets.${c.parent}.versions.${c.list ? "list" : "get"}`;
const args = c => ({ rulesetId: own, ...(c.list ? {} : { rulesetVersion: "1" }) });
const result = c => c.list ? [row(), row("2")] : row();
const path = c => `/${c.parent}s/${c.parent === "account" ? account : zone}/rulesets/${own}/versions${c.list ? "" : "/1"}`;
const resource = c => `cloudflare:account:${account}${c.parent === "zone" ? `:zone:${zone}` : ""}:rulesets:${own}:versions:${c.list ? "list" : "1"}`;
const base = c => ({ subject: `configured-${c.parent}-ruleset-version-identities`, effectiveProtection: "not-established",
  serving: "not-established", ownership: "not-established" });
function fixture(c, options = {}) {
  const f = providerFixture(), requests = [], s = options.scope ?? scope();
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    accountRulesetVersionLists: s.accountVersionLists, accountRulesetVersions: s.accountVersions,
    zone: { zoneId: zone, dnsRecordIds: [], rulesetVersionLists: s.zoneVersionLists, rulesetVersions: s.zoneVersions } },
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

test("version registry is independent of ordinary Rulesets scopes and omits zone-less descriptors", () => {
  const descriptors = rulesetDescriptors({ accountId: account, revision: "resource-1", accountListIds: [own], accountRulesetIds: [own] });
  for (const c of cases) {
    if (c.parent === "zone") assert.equal(descriptors[c.key], undefined);
    else assert.throws(() => descriptors[c.key].prepare(args(c)), /scope/);
  }
});

for (const c of cases) {
  test(`${name(c)} snapshots exact endpoint-only selections and frozen identity`, () => {
    const s = scope(), d = rulesetDescriptors(s)[c.key];
    s[c.field][0].versions[0] = "2"; s[c.field][0].rulesetId = foreign; s[c.field].push({ rulesetId: foreign, versions: ["2"] });
    s.accountId = foreign; s.zoneId = foreign; s.revision = "changed";
    const p = d.prepare(args(c));
    assert.equal(d.providerOperationId, c.operation); assert.equal(p.request.path, path(c));
    assert.deepEqual(p.resource, { id: resource(c), revision: "resource-1" });
    for (const v of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(v));
    for (const copy of [{ ...p }, structuredClone(p), { ...p, resource: { ...p.resource, revision: "other" } }])
      assert.throws(() => d.project(envelope(result(c)), copy), /scope/);
    assert.throws(() => rulesetDescriptors(scope())[c.key].project(envelope(result(c)), p), /scope/);
    for (const bad of [null, {}, [null], [{ rulesetId: own, versions: [] }], [...selected(), ...selected()],
      [{ rulesetId: own, versions: ["1", "1"] }], [{ rulesetId: own + "\n", versions: ["1"] }],
      [{ rulesetId: own, versions: ["latest"] }], [{ rulesetId: own, versions: [1] }], [{ rulesetId: own, versions: ["1".repeat(33)] }]])
      assert.throws(() => rulesetDescriptors({ ...scope(), [c.field]: bad }));
    const partial = rulesetDescriptors({ accountId: account, zoneId: zone, revision: "resource-1", [c.field]: selected() });
    for (const other of cases) {
      if (other === c) partial[other.key].prepare(args(other));
      else assert.throws(() => partial[other.key].prepare(args(other)), /scope/);
    }
  });

  test(`${name(c)} projects selected ID/version only, preserving string identity without numeric aliasing`, () => {
    const d = rulesetDescriptors(scope())[c.key];
    for (const version of ["1", "01", "9007199254740993"]) {
      const input = { rulesetId: own, ...(c.list ? {} : { rulesetVersion: version }) }, p = d.prepare(input);
      const out = d.project(envelope(c.list ? [row(version), row("2")] : row(version)), p);
      assert.deepEqual(out, c.list ? { ...base(c), items: [{ id: own, version }], complete: false } : { ...base(c), item: { id: own, version } });
      jsonData(out); safe({ audit: [], journal: [] }, out);
      assert.ok(Object.isFrozen(out)); assert.ok(Object.isFrozen(c.list ? out.items[0] : out.item));
    }
    if (c.list) for (const rows of [[], [row("2")]])
      assert.deepEqual(d.project(envelope(rows), d.prepare(args(c))), { ...base(c), items: [], complete: false });
  });

  test(`${name(c)} validates all required metadata, calendars, Unicode and detail containers before selection`, () => {
    const d = rulesetDescriptors(scope())[c.key], p = d.prepare(args(c));
    const project = bad => d.project(envelope(c.list ? [bad] : bad), p);
    for (const field of ["id", "version", "last_updated", "name", "kind", "phase", ...(c.list ? [] : ["rules"])]) {
      const bad = row(); delete bad[field]; assert.throws(() => project(bad), /upstream/);
    }
    const invalid = [{ id: own + "\n" }, { version: "-1" }, { version: "1\n" }, { version: "１" }, { version: "1".repeat(33) }, { version: 1 },
      { last_updated: "2026-02-29T00:00:00Z" }, { last_updated: "1900-02-29T00:00:00Z" }, { last_updated: "2026-00-01T00:00:00Z" },
      { last_updated: "2026-13-01T00:00:00Z" }, { last_updated: "2026-01-00T00:00:00Z" }, { last_updated: "2026-01-01T24:00:00Z" },
      { last_updated: "2026-01-01T00:60:00Z" }, { last_updated: "2026-01-01T00:00:60Z" }, { last_updated: "not-a-date" },
      { name: "" }, { name: "\ud800" }, { name: "x\u0085" }, { name: "x".repeat(4097) }, { kind: "unknown" }, { phase: "unknown" },
      ...(!c.list ? [{ rules: null }, { rules: {} }, { rules: [null] }, { rules: [[]] }, { rules: Array(1001).fill({}) }] : [])];
    for (const patch of invalid) {
      assert.throws(() => project({ ...row(), ...patch }), /upstream/);
      if (c.list) assert.throws(() => project({ ...row("2"), ...patch }), /upstream/);
    }
    for (const date of ["2000-02-29T23:59:59.123456789+23:59", "2026-01-01t00:00:00z"])
      project({ ...row(), last_updated: date, name: "safe 😀" });
    if (c.list) {
      const optional = row(); delete optional.rules; delete optional.description;
      project(optional);
    }
    for (const parent of [{ id: foreign }, { account_id: foreign }, { zone_id: foreign }, { account: { id: foreign } },
      { zone: { id: foreign } }, { account: null }, { zone: {} }])
      assert.throws(() => project({ ...row(), ...parent }), /scope|upstream/);
    for (const parent of [{ account_id: foreign }, { zone_id: foreign }, { account: {} }, { zone: null }]) {
      const body = JSON.parse(envelope(result(c)));
      assert.throws(() => d.project(JSON.stringify({ ...body, ...parent }), p), /scope|upstream/);
    }
    if (!c.list) assert.throws(() => project(row("01")), /scope/);
  });

  test(`${name(c)} bounds envelopes, messages, cursor containers, duplicates and unselected rows`, () => {
    const d = rulesetDescriptors(scope())[c.key], p = d.prepare(args(c)), body = JSON.parse(envelope(result(c)));
    for (const raw of ["not-json", "null", "[]", "{}", envelope(null), envelope(c.list ? {} : []), "x".repeat(131073)])
      assert.throws(() => d.project(raw, p));
    for (const patch of [{ success: false }, { errors: [credentialCanary] }, { messages: undefined }, { messages: [null] },
      { messages: [{ message: "" }] }, { messages: [{ message: "ok", code: 1.5 }] },
      { messages: [{ message: "ok", source: { pointer: "" } }] }, { messages: Array(65).fill({ message: "ok" }) }])
      assert.throws(() => d.project(JSON.stringify({ ...body, ...patch }), p));
    if (c.list) {
      for (const rows of [[row(), row()], [row("2"), row("2")], [row("2", foreign)], Array(65).fill(row())])
        assert.throws(() => d.project(envelope(rows), p), /upstream|scope|cap/);
      for (const info of [null, [], { cursors: {} }, { cursors: { after: "" } }, { cursors: { after: 1 } }])
        assert.throws(() => d.project(JSON.stringify({ ...body, result_info: info }), p), /upstream/);
      for (const info of [undefined, {}, { cursors: { after: "opaque" } }])
        assert.equal(d.project(JSON.stringify({ ...body, result_info: info }), p).complete, false);
    }
  });

  test(`${name(c)} defaults deny and rejects overrides before credentials or network`, async () => {
    for (const s of [{}, { ...scope(), [c.field]: [] }]) {
      const f = fixture(c, { scope: s }); assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
    for (const patch of [{ accountId: account }, { zoneId: zone }, { revision: "other" }, { page: 1 }, { per_page: 1 }, { cursor: "opaque" },
      { headers: {} }, { url: "https://example.com" }, { principal: {} }, { policy: {} }, { modelContext: {} }, { agentId: "other" },
      { rulesetId: foreign }, { rulesetVersion: "latest" }, { rulesetVersion: "1/2" }, { rulesetVersion: "1\n" }, { rulesetVersion: 1 },
      { extra: "x".repeat(4097) }, { extra: Array(65).fill(0) }, { extra: Array.from({ length: 64 }, () => [1, 2, 3, 4]) },
      { extra: { a: { b: { c: { d: { e: { f: { g: { h: {} } } } } } } } } }]) {
      const f = fixture(c); assert.equal((await f.invoke({ ...args(c), ...patch })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
  });

  test(`${name(c)} exact reviewed-core bounded GET, audit, cleanup and replay`, async () => {
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

  test(`${name(c)} enforces cross-resource/agent policy, actual revision drift and current policy revocation`, async () => {
    for (const denied of ["agent", "account", "zone", "spelling", "binding", "revocation", ...cases.filter(other => other !== c)]) {
      const f = fixture(c);
      if (denied === "agent") f.vector.policy.agents = ["other-agent"];
      if (denied === "account") f.vector.policy.resources = [resource(c).replace(account, foreign)];
      if (denied === "zone") f.vector.policy.resources = [resource(c).replace(":rulesets:", `:zone:${foreign}:rulesets:`)];
      // Resource spelling mismatch is NOT trusted resource revision drift.
      if (denied === "spelling") f.vector.policy.resources = [`${resource(c)}:other-revision`];
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

  test(`${name(c)} trusted current revision drift is separate from resource spelling denial`, async () => {
    for (const duringLease of [false, true]) {
      const f = fixture(c);
      let currentRevision = duringLease ? "resource-1" : "resource-2";
      f.dependencies.host.revalidate = async (_principal, resource) => resource.revision === currentRevision;
      if (duringLease) {
        const resolve = f.dependencies.credentials.resolve;
        f.dependencies.credentials.resolve = async target => {
          const lease = await resolve(target); currentRevision = "resource-2"; return lease;
        };
      }
      assert.equal((await f.invoke()).code, "RESOURCE_CHANGED");
      assert.equal(f.calls.secret, duringLease ? 1 : 0); assert.equal(f.calls.close, duringLease ? 1 : 0);
      assert.equal(f.requests.length, 0);
    }
  });

  test(`${name(c)} refuses copied prepared requests/resources and forged result receipts`, async () => {
    const f = fixture(c), p = f.operation.prepare(args(c));
    for (const mutate of [p => { p.resource.id += ":other"; }, p => { p.resource.revision = "other"; },
      p => { p.plan.request.path += "/other"; }, p => { p.plan.request.maxResponseBytes++; }, p => { p.arguments.rulesetVersion = "2"; }]) {
      const changed = structuredClone(p); mutate(changed);
      await assert.rejects(() => f.operation.execute(changed, credentialCanary, new AbortController().signal), /scope|schema/);
    }
    assert.throws(() => f.operation.project({}), /scope/); assert.equal(f.requests.length, 0);
  });

  test(`${name(c)} transport/audit/cleanup outages retain uncertain tombstones without retry`, async () => {
    for (const options of [{ response: "not-json" }, { status: 403 }, { status: 404 }, { status: 302 },
      { response: "x".repeat(131073) }, { headers: { "content-type": "text/html" } }, { networkFailure: true },
      { response: envelope(c.list ? [row(), row()] : row("2")) }, { auditFailure: true }, { cleanupFailure: true }]) {
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
      assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.deepEqual([...f.journal], journal);
      assert.equal(f.calls.secret, 1); assert.equal(f.requests.length, 1); safe(f, out);
    }
    const f = fixture(c); f.dependencies.audit.append = async () => { throw Error(credentialCanary); };
    assert.equal((await f.invoke()).code, "AUDIT_UNAVAILABLE"); assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  });

  test(`${name(c)} maximum accepted selections/output pass actual core limits at response byte boundary`, async () => {
    const versions = Array.from({ length: 64 }, (_, i) => String(i).padStart(32, "0"));
    const selections = Array.from({ length: 32 }, (_, i) => ({ rulesetId: i === 0 ? own : i.toString(16).padStart(32, "0"), versions }));
    const s = { ...scope(), [c.field]: selections };
    rulesetDescriptors(s);
    assert.throws(() => rulesetDescriptors({ ...s, [c.field]: [...selections, { rulesetId: foreign, versions }] }), /cap/);
    assert.throws(() => rulesetDescriptors({ ...s, [c.field]: [{ rulesetId: own, versions: [...versions, "2"] }] }), /cap/);
    const body = JSON.parse(envelope(c.list ? versions.map(v => row(v)) : row(versions[0])));
    body.padding = ""; body.padding = "x".repeat(131072 - Buffer.byteLength(JSON.stringify(body)));
    const response = JSON.stringify(body); assert.equal(Buffer.byteLength(response), 131072);
    const f = fixture(c, { scope: s, response });
    const input = { rulesetId: own, ...(c.list ? {} : { rulesetVersion: versions[0] }) };
    // Grant the exact maximum-length string version, not the fixture's default "1".
    f.vector.policy.resources = [f.operation.prepare(input).resource.id];
    const out = await f.invoke(input);
    assert.equal(out.ok, true); jsonData(out.value);
    if (c.list) { assert.equal(out.value.items.length, 64); assert.equal(out.value.complete, false); }
    assert.ok(Buffer.byteLength(JSON.stringify(out.value)) <= 8192); assert.equal(f.requests.length, 1); safe(f, out);
  });
}
