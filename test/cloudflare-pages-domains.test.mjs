import assert from "node:assert/strict";
import test from "node:test";
import { pagesDomainDescriptors } from "../dist/plugins/cloudflare-broker/src/pages-domains.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const id = "b".repeat(32);
const domainId = "c".repeat(32);
const zoneId = "d".repeat(32);
const foreign = "f".repeat(32);
const project = "safe-pages";
const domainName = "pages.example.com";
const args = { projectName: project, domainName };
const tools = ["cloudflare.pages.domains.list", "cloudflare.pages.domains.get"];
const scope = () => ({ accountId: account, revision: "resource-1", projects: [{ projectName: project,
  domains: [{ id, domainId, domainName, zoneId }] }] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const domainRow = () => ({ id, domain_id: domainId, name: domainName, zone_tag: zoneId, status: "active",
  validation_data: { status: "active", method: "txt", txt_name: credentialCanary, txt_value: derivedCanary },
  verification_data: { status: "error", error_message: credentialCanary }, created_on: credentialCanary,
  certificate_authority: derivedCanary });
function fixture(tool, { projects = scope().projects, response, status = 200 } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    pagesDomains: projects }, { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    const value = response ?? (tool === tools[0] ? [domainRow(), { ...domainRow(), name: "unrelated.example.com", id: foreign }] : domainRow());
    return new Response(success(value), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === tool);
  const input = tool === tools[0] ? { projectName: project } : args;
  let resource;
  try { resource = operation.prepare(input).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, input, invoke: (value = input, key = "call-a") => broker.call(tool, value, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, foreign, "unrelated.example.com", "validation_data", "verification_data", "txt_value", "created_on", "certificate_authority"]) {
    assert.ok(!data.includes(value), value);
  }
}

test("Cloudflare Pages domain scope copies project and exact domain identities independently", () => {
  const s = scope();
  const d = pagesDomainDescriptors(s);
  s.accountId = foreign;
  s.projects[0].domains[0].zoneId = foreign;
  s.projects[0].domains.push({ id: foreign, domainId: foreign, domainName: "other.example.com", zoneId });
  s.projects.push({ projectName: "other", domains: [] });
  const p = d.domainGet.prepare(args);
  assert.equal(p.request.path, `/accounts/${account}/pages/projects/${project}/domains/${domainName}`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:pages:${project}:domains:${domainName}`);
  for (const value of [d, d.domainGet, p, p.arguments, p.request, p.resource]) assert.ok(Object.isFrozen(value));
  assert.equal(d.domainGet.project(success(domainRow()), p).domain.zoneId, zoneId);
  assert.throws(() => d.domainGet.prepare({ ...args, domainName: "other.example.com" }), /scope/);
  assert.throws(() => d.domainsList.prepare({ projectName: "other" }), /scope/);
  assert.throws(() => d.domainGet.project(success(domainRow()), { ...p }), /scope/);
  assert.throws(() => pagesDomainDescriptors(scope()).domainGet.project(success(domainRow()), p), /scope/);
  assert.throws(() => d.domainsList.project(success([domainRow()]), p), /scope/);
  assert.throws(() => d.domainGet.project(success(domainRow()), d.domainsList.prepare({ projectName: project })), /scope/);
});

test("Cloudflare Pages domain construction rejects duplicate, ambiguous, malformed and oversized scope", () => {
  const selected = scope().projects[0].domains[0];
  for (const domains of [[selected, selected], [selected, { ...selected, domainName: "other.example.com" }],
    [selected, { ...selected, id: "other", domainName: "other.example.com" }], [{ ...selected, id: "../escape" }],
    [{ ...selected, domainId: "bad\n" }], [{ ...selected, zoneId: "bad" }], [null]]) {
    assert.throws(() => pagesDomainDescriptors({ ...scope(), projects: [{ projectName: project, domains }] }), /schema/);
  }
  for (const name of ["*.example.com", "UPPER.example.com", "https://pages.example.com", "pages.example.com\n", "-bad.example.com", "bad-.example.com", "a".repeat(64) + ".example.com"]) {
    assert.throws(() => pagesDomainDescriptors({ ...scope(), projects: [{ projectName: project, domains: [{ ...selected, domainName: name }] }] }), /schema/);
  }
  assert.throws(() => pagesDomainDescriptors({ ...scope(), projects: [...scope().projects, ...scope().projects] }), /schema/);
  assert.throws(() => pagesDomainDescriptors({ ...scope(), projects: [{ projectName: "../escape", domains: [] }] }), /schema/);
  assert.throws(() => pagesDomainDescriptors({ ...scope(), projects: [{ projectName: project, domains: Array(101).fill(selected) }] }), /cap/);
  assert.throws(() => pagesDomainDescriptors({ ...scope(), projects: Array(101).fill(scope().projects[0]) }), /cap/);
});

test("Cloudflare Pages domains project configured status only and never effective protection", () => {
  const d = pagesDomainDescriptors(scope());
  const p = d.domainGet.prepare(args);
  for (const status of ["initializing", "pending", "active", "deactivated", "blocked", "error"]) {
    const out = d.domainGet.project(success({ ...domainRow(), status }), p);
    assert.deepEqual(out, { projectName: project, domain: { ...scope().projects[0].domains[0], status },
      subject: "configured-pages-domain", effectiveRouting: "not-established", effectiveProtection: "not-established" });
    for (const value of [out, out.domain]) assert.ok(Object.isFrozen(value));
    safe({ audit: [], journal: [] }, out);
  }
  const out = d.domainsList.project(success([domainRow(), { ...domainRow(), name: "unrelated.example.com", id: foreign }]),
    d.domainsList.prepare({ projectName: project }));
  assert.deepEqual(out, { projectName: project, items: [{ ...scope().projects[0].domains[0], status: "active" }],
    subject: "configured-pages-domains", complete: false, effectiveRouting: "not-established", effectiveProtection: "not-established" });
  for (const value of [out, out.items, ...out.items]) assert.ok(Object.isFrozen(value));
  assert.deepEqual(d.domainsList.project(success([]), d.domainsList.prepare({ projectName: project })).items, []);
  safe({ audit: [], journal: [] }, out);
});

test("Cloudflare Pages domains refuse changed identities, foreign context, malformed envelopes and bounds", () => {
  const d = pagesDomainDescriptors(scope());
  const p = d.domainGet.prepare(args);
  for (const patch of [{ id: foreign }, { domain_id: foreign }, { name: "unrelated.example.com" }, { zone_tag: foreign },
    { id: undefined }, { domain_id: undefined }, { zone_tag: undefined }, { account_id: foreign }, { project_name: "other" }]) {
    assert.throws(() => d.domainGet.project(success({ ...domainRow(), ...patch }), p), /scope/);
  }
  for (const patch of [{ account_id: foreign }, { project_name: "other" }]) {
    assert.throws(() => d.domainGet.project(JSON.stringify({ success: true, errors: [], result: domainRow(), ...patch }), p), /scope/);
    assert.throws(() => d.domainsList.project(success([{ ...domainRow(), ...patch }]), d.domainsList.prepare({ projectName: project })), /scope/);
  }
  for (const status of [undefined, null, true, "unknown", credentialCanary]) {
    assert.throws(() => d.domainGet.project(success({ ...domainRow(), status }), p), /upstream/);
  }
  for (const raw of ["null", "not-json", "{}", success(null), success([]), JSON.stringify({ success: true, result: domainRow() }),
    JSON.stringify({ success: false, errors: [], result: domainRow() }), JSON.stringify({ success: true, errors: [credentialCanary], result: domainRow() })]) {
    assert.throws(() => d.domainGet.project(raw, p), /upstream|scope/);
  }
  const lp = d.domainsList.prepare({ projectName: project });
  assert.throws(() => d.domainsList.project(success([domainRow(), domainRow()]), lp), /upstream/);
  assert.throws(() => d.domainsList.project(success([{}]), lp), /upstream/);
  assert.throws(() => d.domainsList.project(success(Array(1001).fill({ name: "other.example.com" })), lp), /cap/);
  assert.throws(() => d.domainGet.project(success({ ...domainRow(), padding: "x".repeat(131072) }), p), /cap/);
});

test("Cloudflare Pages default-empty domain scope and closed overrides refuse before credentials", async () => {
  for (const tool of tools) {
    for (const projects of [[], [{ projectName: project, domains: [] }]]) {
      const f = fixture(tool, { projects });
      assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0);
      assert.equal(f.requests.length, 0);
    }
    for (const patch of [{ projectName: "other" }, { accountId: foreign }, { page: 2 }, { headers: {} }, { approval: "forged" },
      { agentId: "other" }, { validation: {} }, { zoneId: foreign }, { projectName: "../escape" }]) {
      const f = fixture(tool);
      assert.equal((await f.invoke({ ...f.input, ...patch })).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0);
      assert.equal(f.requests.length, 0);
    }
  }
  const f = fixture(tools[1]);
  assert.equal((await f.invoke({ ...args, domainName: "unrelated.example.com" })).code, "INVALID_ARGUMENTS");
  assert.equal(f.calls.secret, 0);
  assert.equal(f.requests.length, 0);
});

test("Cloudflare Pages domains actual-core fixed GET retains redaction, cleanup, audit and replay", async () => {
  for (const tool of tools) {
    const f = fixture(tool);
    const p = f.operation.prepare(f.input);
    assert.equal(p.plan.providerDryRun, false);
    assert.equal(p.plan.providerOperationId, tool === tools[0] ? "pages-domains-get-domains" : "pages-domains-get-domain");
    const out = await f.invoke();
    assert.equal(out.ok, true);
    assert.equal(out.value.effectiveRouting, "not-established");
    assert.equal(out.value.effectiveProtection, "not-established");
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
    assert.equal(f.requests[0].init.method, "GET");
    assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.close, 1);
    assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
    assert.equal(f.requests.length, 1);
    safe(f, out);
  }
});

test("Cloudflare Pages domains current agent, resource, binding and lease-time revocation deny network", async () => {
  for (const tool of tools) for (const denied of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture(tool);
    if (denied === "agent") f.vector.policy.agents = ["other-agent"];
    if (denied === "resource") f.vector.policy.resources = ["other-resource"];
    if (denied === "binding") f.dependencies.host.revalidate = async () => false;
    if (denied === "revocation") {
      const resolve = f.dependencies.credentials.resolve;
      f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "revoked"; return lease; };
    }
    const out = await f.invoke();
    assert.equal(out.code, denied === "binding" ? "RESOURCE_CHANGED" : denied === "revocation" ? "POLICY_CHANGED" : "POLICY_DENIED");
    assert.equal(f.calls.secret, denied === "revocation" ? 1 : 0);
    assert.equal(f.calls.close, denied === "revocation" ? 1 : 0);
    assert.equal(f.requests.length, 0);
    safe(f, out);
  }
});

test("Cloudflare Pages domain malformed, denied and audit failures preserve uncertain replay state", async () => {
  for (const tool of tools) for (const failure of ["foreign", "identity", "status", "denied", "not-found", "audit"]) {
    const row = { ...domainRow(), ...(failure === "foreign" ? { account_id: foreign } : failure === "identity" ? { zone_tag: foreign } : failure === "status" ? { status: "unknown" } : {}) };
    const f = fixture(tool, { response: tool === tools[0] ? [row] : row, status: failure === "denied" ? 403 : failure === "not-found" ? 404 : 200 });
    const append = f.dependencies.audit.append;
    if (failure === "audit") f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw new Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, failure === "audit" ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal(f.calls.close, 1);
    const journal = structuredClone([...f.journal]);
    if (failure === "audit") {
      const offline = await f.invoke();
      assert.equal(offline.code, "AUDIT_UNAVAILABLE");
      assert.equal(f.calls.secret, 1);
      assert.equal(f.requests.length, 1);
      assert.deepEqual([...f.journal], journal);
      safe(f, offline);
      f.dependencies.audit.append = append;
    }
    const replay = await f.invoke();
    assert.equal(replay.code, "REPLAY_CONFLICT");
    assert.equal(f.calls.secret, 1);
    assert.equal(f.calls.close, 1);
    assert.equal(f.requests.length, 1);
    assert.deepEqual([...f.journal], journal);
    safe(f, replay);
    safe(f, out);
  }
});
