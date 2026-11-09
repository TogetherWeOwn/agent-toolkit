import assert from "node:assert/strict";
import test from "node:test";
import { rulesetDescriptors } from "../dist/plugins/cloudflare-broker/src/rulesets.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { jsonData } from "../dist/packages/core/src/index.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), zone = "b".repeat(32), own = "c".repeat(32), foreign = "d".repeat(32);
const phase = "http_request_firewall_custom", otherPhase = "http_request_firewall_managed";
const selection = versions => [{ phase, rulesetId: own, ...(versions ? { versions: ["1", "01", "9007199254740993"] } : {}) }];
const cases = ["account", "zone"].flatMap(parent => [
  { parent, kind: "get", key: `${parent}EntrypointGet`, field: `${parent}Entrypoints`, operation: `get${parent === "account" ? "Account" : "Zone"}EntrypointRuleset` },
  { parent, kind: "versions.list", key: `${parent}EntrypointVersionsList`, field: `${parent}EntrypointVersionLists`, operation: `list${parent === "account" ? "Account" : "Zone"}EntrypointRulesetVersions` },
  { parent, kind: "versions.get", key: `${parent}EntrypointVersionGet`, field: `${parent}EntrypointVersions`, operation: `get${parent === "account" ? "Account" : "Zone"}EntrypointRulesetVersion` },
]);
const scope = () => Object.assign({ accountId: account, zoneId: zone, revision: "resource-1" },
  ...cases.map(c => ({ [c.field]: selection(c.kind !== "get") })));
const list = c => c.kind === "versions.list";
const name = c => `cloudflare.rulesets.${c.parent}.entrypoint.${c.kind}`;
const args = c => ({ phase, rulesetId: own, ...(c.kind === "versions.get" ? { rulesetVersion: "1" } : {}) });
const path = c => `/${c.parent}s/${c.parent === "account" ? account : zone}/rulesets/phases/${phase}/entrypoint${c.kind === "get" ? "" : `/versions${list(c) ? "" : "/1"}`}`;
const resource = c => `cloudflare:account:${account}${c.parent === "zone" ? `:zone:${zone}` : ""}:rulesets:entrypoint:${phase}:${own}:${c.kind === "get" ? "current" : `versions:${list(c) ? "list" : "1"}`}`;
const base = c => ({ subject: `configured-${c.parent}-ruleset-entrypoint-identities`, effectiveProtection: "not-established", serving: "not-established", ownership: "not-established" });
const row = (version = "1") => ({ id: own, version, phase, name: derivedCanary, kind: "root", last_updated: "2024-02-29T00:00:00Z",
  rules: [{ expression: derivedCanary, action: "block", action_parameters: { secret: credentialCanary } }], description: credentialCanary });
const envelope = result => JSON.stringify({ success: true, errors: [], messages: [], result });
const result = c => list(c) ? [row(), row("2")] : row();
function fixture(c, options = {}) {
  const f = providerFixture(), requests = [], s = options.scope ?? scope();
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    accountRulesetEntrypoints: s.accountEntrypoints, accountRulesetEntrypointVersionLists: s.accountEntrypointVersionLists,
    accountRulesetEntrypointVersions: s.accountEntrypointVersions,
    zone: { zoneId: zone, dnsRecordIds: [], rulesetEntrypoints: s.zoneEntrypoints,
      rulesetEntrypointVersionLists: s.zoneEntrypointVersionLists, rulesetEntrypointVersions: s.zoneEntrypointVersions } },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init }); assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    if (options.networkFailure) throw Error(derivedCanary);
    return new Response(options.response ?? envelope(result(c)), { status: options.status ?? 200,
      headers: options.headers ?? { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === name(c));
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource(c)] };
  f.dependencies.provider = "cloudflare"; f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, invoke: (input = args(c), key = "call-a") => broker.call(name(c), input, "verified-runtime", key) };
}
function safe(f, out) {
  const serialized = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const forbidden of [credentialCanary, derivedCanary, foreign, "expression", "action_parameters", "last_updated", "description", "cursors"])
    assert.ok(!serialized.includes(forbidden), forbidden);
}

test("ordinary identity/version visibility never grants entrypoint authority; zone-less descriptors are absent", () => {
  const s = { accountId: account, revision: "resource-1", accountListIds: [own], accountRulesetIds: [own],
    accountVersionLists: [{ rulesetId: own, versions: ["1"] }], accountVersions: [{ rulesetId: own, versions: ["1"] }] };
  const d = rulesetDescriptors(s);
  for (const c of cases) {
    if (c.parent === "zone") assert.equal(d[c.key], undefined);
    else assert.throws(() => d[c.key].prepare(args(c)), /scope/);
  }
});

for (const c of cases) {
  test(`${name(c)} snapshots independent phase/expected-ID/exact-version scopes`, () => {
    const s = scope(), d = rulesetDescriptors(s)[c.key];
    s[c.field][0].phase = otherPhase; s[c.field][0].rulesetId = foreign;
    if (c.kind !== "get") s[c.field][0].versions[0] = "2";
    s[c.field].push({ phase: otherPhase, rulesetId: foreign, versions: ["2"] });
    s.accountId = foreign; s.zoneId = foreign; s.revision = "changed";
    const p = d.prepare(args(c));
    assert.equal(d.providerOperationId, c.operation); assert.equal(p.request.path, path(c));
    assert.deepEqual(p.resource, { id: resource(c), revision: "resource-1" });
    for (const v of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(v));
    for (const copy of [{ ...p }, structuredClone(p), { ...p, resource: { ...p.resource, revision: "other" } }])
      assert.throws(() => d.project(envelope(result(c)), copy), /scope/);
    assert.throws(() => rulesetDescriptors(scope())[c.key].project(envelope(result(c)), p), /scope/);
    const partial = rulesetDescriptors({ accountId: account, zoneId: zone, revision: "resource-1", [c.field]: selection(c.kind !== "get") });
    for (const other of cases) {
      if (other === c) partial[other.key].prepare(args(other));
      else assert.throws(() => partial[other.key].prepare(args(other)), /scope/);
    }
    for (const bad of [null, {}, [null], [{ phase }], [{ phase, rulesetId: foreign + "\n" }],
      [{ phase: "unknown", rulesetId: own }], [{ phase: phase + "\n", rulesetId: own }],
      [...selection(c.kind !== "get"), ...selection(c.kind !== "get")],
      ...(c.kind === "get" ? [] : [{ phase, rulesetId: own, versions: [] }, { phase, rulesetId: own, versions: ["1", "1"] },
        { phase, rulesetId: own, versions: ["latest"] }, { phase, rulesetId: own, versions: [1] }]).map(v => [v])])
      assert.throws(() => rulesetDescriptors({ ...scope(), [c.field]: bad }));
  });

  test(`${name(c)} projects only selected immutable ID/version and never reports list completeness`, () => {
    const d = rulesetDescriptors(scope())[c.key];
    for (const version of ["1", "01", "9007199254740993"]) {
      const input = { ...args(c), ...(c.kind === "versions.get" ? { rulesetVersion: version } : {}) };
      const out = d.project(envelope(list(c) ? [row(version), row("2")] : row(version)), d.prepare(input));
      assert.deepEqual(out, list(c) ? { ...base(c), items: [{ id: own, version }], complete: false } : { ...base(c), item: { id: own, version } });
      jsonData(out); safe({ audit: [], journal: [] }, out);
    }
    if (list(c)) for (const rows of [[], [row("2")]])
      assert.deepEqual(d.project(envelope(rows), d.prepare(args(c))), { ...base(c), items: [], complete: false });
  });

  test(`${name(c)} validates phase/ID association, required metadata, calendars, Unicode and bounded containers`, () => {
    const d = rulesetDescriptors(scope())[c.key], p = d.prepare(args(c));
    const project = bad => d.project(envelope(list(c) ? [bad] : bad), p);
    for (const field of ["id", "version", "phase", "name", "kind", "last_updated", ...(list(c) ? [] : ["rules"])]) {
      const bad = row(); delete bad[field]; assert.throws(() => project(bad));
    }
    for (const patch of [{ id: foreign }, { phase: otherPhase }, { phase: "unknown" }, { phase: phase + "\n" },
      { version: "１" }, { version: 1 }, { version: "1\n" }, { version: "1".repeat(33) }, { version: "latest" },
      { name: "\ud800" }, { name: "x\u0085" }, { name: "" }, { name: "x".repeat(4097) }, { kind: "unknown" },
      ...["1900-02-29T00:00:00Z", "2026-02-29T00:00:00Z", "2026-13-01T00:00:00Z", "2026-01-00T00:00:00Z",
        "2026-01-01T24:00:00Z", "2026-01-01T00:60:00Z", "2026-01-01T00:00:60Z"].map(last_updated => ({ last_updated })),
      { account_id: foreign }, { zone_id: foreign }, { account: { id: foreign } }, { zone: { id: foreign } }, { account: null }, { zone: {} },
      ...(list(c) ? [] : [{ rules: null }, { rules: {} }, { rules: [null] }, { rules: [[]] }, { rules: Array(1001).fill({}) }])]) {
      assert.throws(() => project({ ...row(), ...patch }));
      if (list(c)) assert.throws(() => project({ ...row("2"), ...patch }));
    }
    project({ ...row(), name: "safe 😀", last_updated: "2000-02-29T23:59:59.123456789+23:59" });
    if (c.kind === "versions.get") assert.throws(() => project(row("01")), /scope/);
    const body = JSON.parse(envelope(result(c)));
    for (const patch of [{ success: false }, { errors: [credentialCanary] }, { messages: undefined }, { messages: [null] },
      { messages: [{ message: "" }] }, { messages: [{ message: "ok", code: 1.5 }] }, { messages: Array(65).fill({ message: "ok" }) },
      { account_id: foreign }, { zone_id: foreign }]) assert.throws(() => d.project(JSON.stringify({ ...body, ...patch }), p));
    for (const raw of ["bad", "null", "[]", "{}", envelope(null), envelope(list(c) ? {} : []), "x".repeat(131073)])
      assert.throws(() => d.project(raw, p));
    if (list(c)) {
      for (const rows of [[row(), row()], [row("2"), row("2")], Array(65).fill(row())]) assert.throws(() => d.project(envelope(rows), p));
      const optional = row(); delete optional.rules; project(optional);
      for (const info of [null, [], { cursors: {} }, { cursors: { after: "" } }])
        assert.throws(() => d.project(JSON.stringify({ ...body, result_info: info }), p));
      assert.equal(d.project(JSON.stringify({ ...body, result_info: { cursors: { after: "opaque" } } }), p).complete, false);
    }
  });

  test(`${name(c)} default denial and closed inputs occur before credentials`, async () => {
    for (const s of [{}, { ...scope(), [c.field]: [] }]) {
      const f = fixture(c, { scope: s }); assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
    for (const patch of [{ accountId: account }, { zoneId: zone }, { revision: "other" }, { phase: otherPhase }, { rulesetId: foreign },
      { phase: phase + "\n" }, { phase: "http_request_firewall_ｃustom" }, { rulesetVersion: "latest" }, { rulesetVersion: 1 },
      { page: 1 }, { per_page: 1 }, { cursor: "opaque" }, { url: "https://example.com" }, { headers: {} }, { principal: {} }, { policy: {} },
      { modelContext: {} }, { extra: "x".repeat(4097) }, { extra: Array(65).fill(0) },
      { extra: Array.from({ length: 64 }, () => [1, 2, 3, 4]) }, { extra: { a: { b: { c: { d: { e: { f: { g: { h: {} } } } } } } } } }]) {
      const f = fixture(c); assert.equal((await f.invoke({ ...args(c), ...patch })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
  });

  test(`${name(c)} actual core performs one bounded GET with cleanup, audit and replay refusal`, async () => {
    const f = fixture(c), p = f.operation.prepare(args(c));
    assert.deepEqual(p.resource, { id: resource(c), revision: "resource-1" });
    assert.deepEqual(p.plan.request, { method: "GET", path: path(c), maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1, redirects: "deny" });
    assert.equal(p.plan.providerOperationId, c.operation);
    const out = await f.invoke(); assert.equal(out.ok, true);
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${path(c)}`);
    assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.secret, 1); assert.equal(f.calls.close, 1);
    assert.deepEqual(f.audit.map(e => e.phase), ["intent", "outcome"]);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
  });

  test(`${name(c)} exact-resource separation, trusted current revision drift and revocation`, async () => {
    for (const target of [...cases.filter(o => o !== c).map(resource), resource(c).replace(phase, otherPhase),
      resource(c).replace(own, foreign), resource(c).replace(account, foreign), resource(c).replace(":rulesets:", `:zone:${foreign}:rulesets:`),
      `cloudflare:account:${account}:rulesets:${own}`, `cloudflare:account:${account}:rulesets:${own}:versions:1`]) {
      const f = fixture(c); f.vector.policy.resources = [target]; assert.equal((await f.invoke()).code, "POLICY_DENIED");
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
    const denied = fixture(c); denied.vector.policy.agents = ["other-agent"];
    assert.equal((await denied.invoke()).code, "POLICY_DENIED"); assert.equal(denied.calls.secret, 0);
    for (const mode of ["before", "during", "revocation"]) {
      const f = fixture(c); let current = mode === "before" ? "resource-2" : "resource-1";
      f.dependencies.host.revalidate = async (_principal, resource) => resource.revision === current;
      const resolve = f.dependencies.credentials.resolve;
      f.dependencies.credentials.resolve = async target => {
        const lease = await resolve(target);
        if (mode === "during") current = "resource-2";
        if (mode === "revocation") f.vector.policy.revision = "revoked";
        return lease;
      };
      assert.equal((await f.invoke()).code, mode === "revocation" ? "POLICY_CHANGED" : "RESOURCE_CHANGED");
      assert.equal(f.calls.secret, mode === "before" ? 0 : 1); assert.equal(f.requests.length, 0);
    }
  });

  test(`${name(c)} refuses prepared-object and result-receipt tampering`, async () => {
    const f = fixture(c), p = f.operation.prepare(args(c));
    for (const mutate of [p => { p.resource.id += ":other"; }, p => { p.resource.revision = "other"; },
      p => { p.plan.request.path += "/other"; }, p => { p.plan.request.maxResponseBytes++; }, p => { p.arguments.phase = otherPhase; },
      p => { p.arguments.rulesetId = foreign; }, p => { p.arguments.rulesetVersion = "2"; }]) {
      const copy = structuredClone(p); mutate(copy);
      await assert.rejects(() => f.operation.execute(copy, credentialCanary, new AbortController().signal));
    }
    assert.throws(() => f.operation.project({}), /scope/); assert.equal(f.requests.length, 0);
  });

  test(`${name(c)} outages are uncertain and replay is checked only after restoring audit`, async () => {
    for (const options of [{ response: "not-json" }, { status: 403 }, { status: 404 }, { status: 302 }, { networkFailure: true },
      { response: "x".repeat(131073) }, { headers: { "content-type": "text/html" } },
      { response: envelope(list(c) ? [row(), row()] : { ...row(), id: foreign }) }, { auditFailure: true }, { cleanupFailure: true }]) {
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

  test(`${name(c)} maximum projected list passes actual core at the response boundary; over-bound refuses`, async () => {
    const versions = Array.from({ length: 64 }, (_, i) => String(i).padStart(32, "0"));
    const s = { ...scope(), [c.field]: [{ phase, rulesetId: own, ...(c.kind === "get" ? {} : { versions }) }] };
    if (c.kind !== "get") assert.throws(() => rulesetDescriptors({ ...s, [c.field]: [{ phase, rulesetId: own, versions: [...versions, "2"] }] }), /cap/);
    assert.throws(() => rulesetDescriptors({ ...s, [c.field]: Array(33).fill(s[c.field][0]) }), /cap/);
    const body = JSON.parse(envelope(list(c) ? versions.map(v => row(v)) : row(versions[0])));
    body.padding = ""; body.padding = "x".repeat(131072 - Buffer.byteLength(JSON.stringify(body)));
    const response = JSON.stringify(body); assert.equal(Buffer.byteLength(response), 131072);
    const f = fixture(c, { scope: s, response });
    const input = { ...args(c), ...(c.kind === "versions.get" ? { rulesetVersion: versions[0] } : {}) };
    f.vector.policy.resources = [f.operation.prepare(input).resource.id];
    const out = await f.invoke(input); assert.equal(out.ok, true); jsonData(out.value);
    if (list(c)) { assert.equal(out.value.items.length, 64); assert.equal(out.value.complete, false); }
    assert.ok(Buffer.byteLength(JSON.stringify(out.value)) <= 8192); safe(f, out);
    const over = fixture(c, { scope: s, response: response + " " });
    over.vector.policy.resources = [over.operation.prepare(input).resource.id];
    assert.equal((await over.invoke(input)).code, "UPSTREAM_UNAVAILABLE");
  });
}
