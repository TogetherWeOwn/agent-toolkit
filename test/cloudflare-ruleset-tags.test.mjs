import assert from "node:assert/strict";
import test from "node:test";
import { rulesetDescriptors } from "../dist/plugins/cloudflare-broker/src/rulesets.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { jsonData } from "../dist/packages/core/src/index.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32), zone = "b".repeat(32), own = "c".repeat(32), foreign = "d".repeat(32);
const ruleId = "e".repeat(32), unselected = "f".repeat(32), tag = "directory-traversal";
const cases = ["account", "zone"].map(parent => ({ parent, key: `${parent}VersionRulesByTag`, field: `${parent}VersionRuleTags`,
  operation: `list${parent === "account" ? "Account" : "Zone"}RulesetVersionRulesByTag` }));
const selection = () => [{ rulesetId: own, rulesetVersion: "01", ruleTag: tag, ruleIds: [ruleId] }];
const scope = () => ({ accountId: account, zoneId: zone, revision: "resource-1",
  accountVersionRuleTags: selection(), zoneVersionRuleTags: selection() });
const args = () => ({ rulesetId: own, rulesetVersion: "01", ruleTag: tag });
const name = c => `cloudflare.rulesets.${c.parent}.versions.rules_by_tag.list`;
const path = c => `/${c.parent}s/${c.parent === "account" ? account : zone}/rulesets/${own}/versions/01/by_tag/${tag}`;
const resource = c => `cloudflare:account:${account}${c.parent === "zone" ? `:zone:${zone}` : ""}:rulesets:${own}:versions:01:by_tag:${tag}`;
const base = c => ({ subject: `configured-${c.parent}-ruleset-version-rule-identities`,
  effectiveProtection: "not-established", serving: "not-established", ownership: "not-established" });
const rule = (id = ruleId) => ({ id, version: "1", last_updated: "2024-02-29T00:00:00Z", action: "block", enabled: true,
  expression: derivedCanary, ref: derivedCanary, categories: [tag], action_parameters: { secret: credentialCanary }, description: credentialCanary });
const result = (rules = [rule(), rule(unselected)]) => ({ id: own, version: "01", name: derivedCanary,
  kind: "managed", phase: "http_request_firewall_managed", last_updated: "2024-02-29T00:00:00Z", rules });
const envelope = value => JSON.stringify({ success: true, errors: [], messages: [], result: value });
function fixture(c, options = {}) {
  const f = providerFixture(), requests = [], s = options.scope ?? scope();
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    accountRulesetVersionRuleTags: s.accountVersionRuleTags,
    zone: { zoneId: zone, dnsRecordIds: [], rulesetVersionRuleTags: s.zoneVersionRuleTags } },
  { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init }); assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    if (options.networkFailure) throw Error(derivedCanary);
    return new Response(options.response ?? envelope(result()), { status: options.status ?? 200,
      headers: options.headers ?? { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === name(c));
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource(c)] };
  f.dependencies.provider = "cloudflare"; f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, invoke: (input = args(), key = "call-a") => broker.call(name(c), input, "verified-runtime", key) };
}
function safe(f, out) {
  const serialized = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const forbidden of [credentialCanary, derivedCanary, foreign, unselected, "expression", "action_parameters", "categories", "last_updated", "description"])
    assert.ok(!serialized.includes(forbidden), forbidden);
}

test("ordinary Rulesets/version/entrypoint scopes never grant tag reads; missing zone omits its descriptor", () => {
  const d = rulesetDescriptors({ accountId: account, revision: "resource-1", accountListIds: [own], accountRulesetIds: [own],
    accountVersionLists: [{ rulesetId: own, versions: ["01"] }], accountVersions: [{ rulesetId: own, versions: ["01"] }],
    accountEntrypoints: [{ phase: "http_request_firewall_managed", rulesetId: own }],
    accountEntrypointVersions: [{ phase: "http_request_firewall_managed", rulesetId: own, versions: ["01"] }] });
  assert.throws(() => d.accountVersionRulesByTag.prepare(args()), /scope/);
  assert.equal(d.zoneVersionRulesByTag, undefined);
});

for (const c of cases) {
  test(`${name(c)} independently snapshots exact tuple and selected IDs`, () => {
    const s = scope(), d = rulesetDescriptors(s)[c.key];
    s[c.field][0].rulesetId = foreign; s[c.field][0].rulesetVersion = "1"; s[c.field][0].ruleTag = "other";
    s[c.field][0].ruleIds[0] = unselected; s[c.field].push(...selection()); s.accountId = foreign; s.zoneId = foreign; s.revision = "other";
    const p = d.prepare(args());
    assert.equal(d.providerOperationId, c.operation); assert.equal(p.request.path, path(c));
    assert.deepEqual(p.resource, { id: resource(c), revision: "resource-1" });
    for (const value of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
    assert.deepEqual(d.project(envelope(result()), p), { ...base(c), items: [{ id: ruleId }], complete: false });
    for (const copy of [{ ...p }, structuredClone(p)]) assert.throws(() => d.project(envelope(result()), copy), /scope/);
    assert.throws(() => rulesetDescriptors(scope())[c.key].project(envelope(result()), p), /scope/);
    const partial = rulesetDescriptors({ accountId: account, zoneId: zone, revision: "resource-1", [c.field]: selection() });
    partial[c.key].prepare(args());
    assert.throws(() => partial[cases.find(o => o !== c).key].prepare(args()), /scope/);
    for (const patch of [{ rulesetId: foreign }, { rulesetVersion: "1" }, { ruleTag: "other" }, { ruleIds: [] }]) {
      const other = rulesetDescriptors({ ...scope(), [c.field]: [{ ...selection()[0], ...patch }] })[c.key];
      assert.throws(() => other.prepare(args()), /scope/);
    }
    for (const bad of [null, {}, [null], [{}], [...selection(), ...selection()],
      ...[null, {}, [ruleId, ruleId], ["bad"], [ruleId + "\n"], Array(65).fill(ruleId)].map(ruleIds => [{ ...selection()[0], ruleIds }]),
      ...[{ rulesetId: "bad" }, { rulesetVersion: 1 }, { rulesetVersion: "latest" }, { ruleTag: "../x" }].map(patch => [{ ...selection()[0], ...patch }]),
      Array(33).fill(selection()[0])]) assert.throws(() => rulesetDescriptors({ ...scope(), [c.field]: bad }));
  });

  test(`${name(c)} tag subset, exact versions and closed bounded inputs deny before credentials`, async () => {
    for (const s of [{}, { ...scope(), [c.field]: [] }, { ...scope(), [c.field]: [{ ...selection()[0], ruleIds: [] }] }]) {
      const f = fixture(c, { scope: s }); assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
    const badTags = ["", ".", "..", "a/b", "a\\b", "a?b", "a#b", "a:b", "%2f", "a%252f", "-a", "_a", "a b", "a\n", "a\u0000", "а", "Ａ", "😀", "\ud800", "a".repeat(65)];
    for (const patch of [...badTags.map(ruleTag => ({ ruleTag })), ...[1, "1", "latest", "01\n", "１", "1.0", "1/2", "1".repeat(33)].map(rulesetVersion => ({ rulesetVersion })),
      { rulesetId: foreign }, { rulesetId: own + "\n" }, { accountId: account }, { zoneId: zone }, { revision: "other" },
      { ruleIds: [ruleId] }, { page: 1 }, { per_page: 1 }, { cursor: "opaque" }, { url: "https://example.com" }, { headers: {} },
      { principal: {} }, { policy: {} }, { modelContext: {} }, { extra: "x".repeat(4097) }, { extra: Array(65).fill(0) },
      { extra: Array.from({ length: 64 }, () => [1, 2, 3, 4]) }, { extra: { a: { b: { c: { d: { e: { f: { g: { h: {} } } } } } } } } }]) {
      const f = fixture(c); assert.equal((await f.invoke({ ...args(), ...patch })).code, "INVALID_ARGUMENTS", JSON.stringify(patch));
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
    const d = rulesetDescriptors(scope())[c.key];
    for (const raw of [null, [], {}, Object.assign(Object.create({ inherited: true }), args())]) assert.throws(() => d.prepare(raw));
    for (const ruleTag of ["A", "a_0-Z", "a".repeat(64)]) for (const rulesetVersion of ["0", "1", "01", "9007199254740993", "1".repeat(32)]) {
      const selected = { ...selection()[0], ruleTag, rulesetVersion };
      const p = rulesetDescriptors({ ...scope(), [c.field]: [selected] })[c.key].prepare({ rulesetId: own, ruleTag, rulesetVersion });
      assert.ok(p.request.path.endsWith(`/versions/${rulesetVersion}/by_tag/${ruleTag}`));
    }
  });

  test(`${name(c)} checks parent/revision and every rule identity, including unselected rows`, () => {
    const d = rulesetDescriptors(scope())[c.key], p = d.prepare(args()), project = r => d.project(envelope(r), p);
    for (const rows of [[], [rule(unselected)]]) assert.deepEqual(project(result(rows)), { ...base(c), items: [], complete: false });
    for (const field of ["id", "version", "name", "kind", "phase", "last_updated", "rules"]) {
      const bad = result(); delete bad[field]; assert.throws(() => project(bad), field);
    }
    for (const patch of [{ id: foreign }, { version: "1" }, { version: "latest" }, { kind: "unknown" }, { phase: "unknown" },
      { name: "\ud800" }, { name: "x".repeat(4097) }, { last_updated: "2026-02-29T00:00:00Z" },
      { account_id: foreign }, { account: null }, { account: { id: foreign } }, { zone_id: foreign }, { zone: { id: foreign } },
      { ruleset_id: foreign }, { ruleset_version: "1" }, { rule_tag: "other" }, { rules: null }, { rules: {} }, { rules: [null] }, { rules: [[]] },
      { rules: [rule(), rule()] }, { rules: [rule(unselected), rule(unselected)] }, { rules: Array(65).fill(rule()) }])
      assert.throws(() => project({ ...result(), ...patch }), JSON.stringify(patch));
    for (const id of [ruleId, unselected]) {
      for (const field of ["id", "version", "last_updated", "action", "expression", "ref", "enabled"]) {
        const bad = rule(id); delete bad[field]; assert.throws(() => project(result([bad])), field);
      }
      for (const patch of [{ id: "bad" }, { id: ruleId + "\n" }, { version: 1 }, { version: "１" }, { version: "latest" }, { version: "1".repeat(33) },
        { last_updated: "1900-02-29T00:00:00Z" }, { last_updated: "2026-01-01T24:00:00Z" }, { action: null }, { expression: "\ud800" },
        { ref: "" }, { enabled: "true" }, { categories: null }, { categories: [] }, { categories: [tag, tag] }, { categories: ["other"] },
        { categories: ["\ud800"] }, { account_id: foreign }, { zone_id: foreign }, { account: {} }, { zone: null },
        { ruleset_id: foreign }, { ruleset_version: "1" }, { rule_tag: "other" }]) assert.throws(() => project(result([{ ...rule(id), ...patch }])));
    }
    const noTags = rule(); delete noTags.categories;
    assert.equal(project(result([noTags])).items[0].id, ruleId); // No invented mandatory association fields.
    for (const raw of ["bad", "null", "[]", "{}", envelope(null), envelope([]), "x".repeat(131073)]) assert.throws(() => d.project(raw, p));
    for (const patch of [{ success: false }, { errors: [credentialCanary] }, { messages: undefined }, { messages: [null] },
      { messages: [{ message: "" }] }, { messages: Array(65).fill({ message: "ok" }) }, { account_id: foreign }, { zone_id: foreign },
      { ruleset_id: foreign }, { ruleset_version: "1" }, { rule_tag: "other" }])
      assert.throws(() => d.project(JSON.stringify({ success: true, errors: [], messages: [], result: result(), ...patch }), p));
  });

  test(`${name(c)} actual core uses one fixed-origin GET, audits cleanup and refuses replay`, async () => {
    const f = fixture(c), p = f.operation.prepare(args());
    assert.deepEqual(p.resource, { id: resource(c), revision: "resource-1" });
    assert.deepEqual(p.plan.request, { method: "GET", path: path(c), maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1, redirects: "deny" });
    assert.equal(p.plan.providerOperationId, c.operation);
    const out = await f.invoke(); assert.equal(out.ok, true);
    assert.deepEqual(out.value, { ...base(c), items: [{ id: ruleId }], complete: false });
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${path(c)}`);
    assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.secret, 1); assert.equal(f.calls.close, 1);
    assert.deepEqual(f.audit.map(e => e.phase), ["intent", "outcome"]); assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
  });

  test(`${name(c)} policy is exact and trusted resource revision really drifts`, async () => {
    for (const target of [resource(cases.find(o => o !== c)), resource(c).replace(account, foreign), resource(c).replace(own, foreign),
      resource(c).replace(":versions:01:", ":versions:1:"), resource(c).replace(tag, "other"),
      `cloudflare:account:${account}:rulesets:${own}`, `cloudflare:account:${account}:rulesets:${own}:versions:01`,
      `cloudflare:account:${account}:rulesets:entrypoint:http_request_firewall_managed:${own}:versions:01`]) {
      const f = fixture(c); f.vector.policy.resources = [target]; assert.equal((await f.invoke()).code, "POLICY_DENIED");
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
    const denied = fixture(c); denied.vector.policy.agents = ["other-agent"];
    assert.equal((await denied.invoke()).code, "POLICY_DENIED"); assert.equal(denied.calls.secret, 0);
    for (const mode of ["before", "during", "revocation"]) {
      const f = fixture(c); let current = mode === "before" ? "resource-2" : "resource-1";
      f.dependencies.host.revalidate = async (_principal, resource) => resource.revision === current;
      const resolve = f.dependencies.credentials.resolve;
      f.dependencies.credentials.resolve = async target => { const lease = await resolve(target);
        if (mode === "during") current = "resource-2";
        if (mode === "revocation") f.vector.policy.revision = "revoked";
        return lease;
      };
      assert.equal((await f.invoke()).code, mode === "revocation" ? "POLICY_CHANGED" : "RESOURCE_CHANGED");
      assert.equal(f.calls.secret, mode === "before" ? 0 : 1); assert.equal(f.requests.length, 0);
    }
  });

  test(`${name(c)} prepared tampering and forged receipts cannot cause transport`, async () => {
    const f = fixture(c), p = f.operation.prepare(args());
    for (const mutate of [p => { p.resource.id += ":other"; }, p => { p.resource.revision = "other"; }, p => { p.plan.request.path += "/other"; },
      p => { p.plan.request.maxResponseBytes++; }, p => { p.arguments.rulesetId = foreign; }, p => { p.arguments.rulesetVersion = "1"; }, p => { p.arguments.ruleTag = "other"; }]) {
      const copy = structuredClone(p); mutate(copy); await assert.rejects(() => f.operation.execute(copy, credentialCanary, new AbortController().signal));
    }
    assert.throws(() => f.operation.project({}), /scope/); assert.equal(f.requests.length, 0);
  });

  test(`${name(c)} maximum actual-core selected array and 128KiB response pass; over-bound refuses`, async () => {
    const ids = Array.from({ length: 64 }, (_, i) => i.toString(16).padStart(32, "0"));
    const s = { ...scope(), [c.field]: [{ ...selection()[0], ruleIds: ids }] };
    const body = JSON.parse(envelope(result(ids.map(id => rule(id))))); body.padding = "";
    body.padding = "x".repeat(131072 - Buffer.byteLength(JSON.stringify(body)));
    const response = JSON.stringify(body); assert.equal(Buffer.byteLength(response), 131072);
    const f = fixture(c, { scope: s, response }), out = await f.invoke();
    assert.equal(out.ok, true); assert.equal(out.value.items.length, 64); assert.equal(out.value.complete, false); jsonData(out.value);
    assert.ok(Buffer.byteLength(JSON.stringify(out.value)) <= 8192); safe(f, out);
    for (const response of [JSON.stringify({ ...body, result: result([...ids.map(id => rule(id)), rule()]) }), JSON.stringify(body) + " "]) {
      const over = fixture(c, { scope: s, response }); assert.equal((await over.invoke()).code, "UPSTREAM_UNAVAILABLE");
    }
  });

  test(`${name(c)} audit/network/cleanup failures retain uncertainty; restore audit before replay assertion`, async () => {
    for (const options of [{ response: "not-json" }, { status: 403 }, { status: 404 }, { status: 302 }, { networkFailure: true },
      { response: "x".repeat(131073) }, { headers: { "content-type": "text/html" } }, { response: envelope(result([rule(), rule()])) },
      { auditFailure: true }, { cleanupFailure: true }]) {
      const f = fixture(c, options), append = f.dependencies.audit.append;
      if (options.auditFailure) f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw Error(credentialCanary); };
      if (options.cleanupFailure) f.dependencies.credentials.resolve = async () => { f.calls.secret++;
        return { value: credentialCanary, redactions: [derivedCanary], async close() { f.calls.close++; throw Error(credentialCanary); } };
      };
      const out = await f.invoke(); assert.equal(out.code, options.auditFailure || options.cleanupFailure ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
      assert.equal([...f.journal.values()][0].outcome, "uncertain"); assert.equal(f.calls.close, options.cleanupFailure ? 2 : 1);
      const journal = structuredClone([...f.journal]);
      if (options.auditFailure) { assert.equal((await f.invoke()).code, "AUDIT_UNAVAILABLE"); f.dependencies.audit.append = append; }
      assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.deepEqual([...f.journal], journal);
      assert.equal(f.calls.secret, 1); assert.equal(f.requests.length, 1); safe(f, out);
    }
    const f = fixture(c); f.dependencies.audit.append = async () => { throw Error(credentialCanary); };
    assert.equal((await f.invoke()).code, "AUDIT_UNAVAILABLE"); assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
  });
}
