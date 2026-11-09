import assert from "node:assert/strict";
import test from "node:test";
import { workerScheduleDescriptor } from "../dist/plugins/cloudflare-broker/src/worker-schedules.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const foreign = "f".repeat(32);
const expression = "*/30 * * * *";
const args = { scriptName: "safe-worker" };
const tool = "cloudflare.workers.schedules.get";
const scope = () => ({ accountId: account, revision: "resource-1", workers: [{ scriptName: args.scriptName, crons: [expression] }] });
const success = result => JSON.stringify({ success: true, errors: [], result });
const result = () => ({ schedules: [{ cron: expression, created_on: credentialCanary, modified_on: derivedCanary },
  { cron: "0 0 * * *", created_on: derivedCanary }] });
function fixture({ workers = scope().workers, response = result(), status = 200 } = {}) {
  const f = providerFixture();
  const requests = [];
  const operations = cloudflareReadOperations({ accountId: account, revision: "resource-1", scriptNames: [args.scriptName],
    hyperdriveIds: [], workerSchedules: workers }, { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return new Response(success(response), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === tool);
  let resource;
  try { resource = operation.prepare(args).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, invoke: (input = args, key = "call-a") => broker.call(tool, input, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, "created_on", "modified_on", "0 0 * * *"]) assert.ok(!data.includes(value));
}

test("Cloudflare schedule scope is copied independently and binds exact script context", () => {
  const s = scope();
  const d = workerScheduleDescriptor(s);
  s.accountId = foreign;
  s.workers[0].crons.push("0 0 * * *");
  s.workers[0].scriptName = "changed";
  s.workers.push({ scriptName: "other-worker", crons: [expression] });
  const p = d.prepare(args);
  assert.equal(p.request.path, `/accounts/${account}/workers/scripts/safe-worker/schedules`);
  assert.equal(p.resource.id, `cloudflare:account:${account}:worker:safe-worker:schedules`);
  for (const value of [d, p, p.arguments, p.request, p.resource]) assert.ok(Object.isFrozen(value));
  assert.equal(d.project(success(result()), p).schedules.length, 1);
  assert.throws(() => d.prepare({ scriptName: "other-worker" }), /scope/);
  assert.throws(() => d.project(success(result()), { ...p }), /scope/);
  assert.throws(() => workerScheduleDescriptor(scope()).project(success(result()), p), /scope/);
  for (const crons of [[expression, expression], ["0  0 * * *"], ["0 0 * * *\n"], ["0 0 * JAN MON"], ["@daily"], ["x".repeat(129)]]) {
    assert.throws(() => workerScheduleDescriptor({ ...scope(), workers: [{ scriptName: args.scriptName, crons }] }), /schema/);
  }
  assert.throws(() => workerScheduleDescriptor({ ...scope(), workers: [...scope().workers, ...scope().workers] }), /schema/);
  assert.throws(() => workerScheduleDescriptor({ ...scope(), workers: [{ scriptName: args.scriptName, crons: Array(101).fill(expression) }] }), /cap/);
  assert.throws(() => workerScheduleDescriptor({ ...scope(), workers: Array(101).fill(scope().workers[0]) }), /cap/);
});

test("Cloudflare schedules project exact configured expressions only, never execution or completeness", () => {
  const d = workerScheduleDescriptor(scope());
  const out = d.project(success(result()), d.prepare(args));
  assert.deepEqual(out, { scriptName: args.scriptName, schedules: [{ cron: expression }], subject: "configured-worker-schedules",
    complete: false, effectiveExecution: "not-established" });
  for (const value of [out, out.schedules, out.schedules[0]]) assert.ok(Object.isFrozen(value));
  assert.deepEqual(d.project(success({ schedules: [] }), d.prepare(args)).schedules, []);
  assert.equal(d.project(success({ schedules: [] }), d.prepare(args)).complete, false);
  for (const value of [credentialCanary, derivedCanary, "0 0 * * *", "created_on", "modified_on"]) assert.ok(!JSON.stringify(out).includes(value));
});

test("Cloudflare schedules reject malformed envelopes, foreign context, duplicates and oversized responses", () => {
  const d = workerScheduleDescriptor(scope());
  const p = d.prepare(args);
  for (const patch of [{ account_id: foreign }, { script_name: "other-worker" }]) {
    for (const raw of [JSON.stringify({ success: true, errors: [], result: result(), ...patch }),
      success({ ...result(), ...patch }), success({ schedules: [{ cron: expression, ...patch }] })]) {
      assert.throws(() => d.project(raw, p), /scope/);
    }
  }
  for (const raw of ["null", "not-json", "{}", success(null), success([]), success({ schedules: [null] }),
    success({ schedules: [{}] }), success({ schedules: [{ cron: null }] }),
    JSON.stringify({ success: true, result: result() }), JSON.stringify({ success: false, errors: [], result: result() }),
    JSON.stringify({ success: true, errors: [credentialCanary], result: result() }), success({ schedules: [{ cron: expression }, { cron: expression }] })]) {
    assert.throws(() => d.project(raw, p), /upstream/);
  }
  for (const response of [{}, { schedules: null }, { schedules: Array(1001).fill({ cron: "0 0 * * *" }) },
    { ...result(), padding: "x".repeat(131072) }]) assert.throws(() => d.project(success(response), p), /cap/);
});

test("Cloudflare schedule default-empty scope and model overrides refuse before credentials", async () => {
  for (const workers of [[], [{ scriptName: args.scriptName, crons: [] }]]) {
    const f = fixture({ workers });
    assert.equal((await f.invoke()).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
  for (const patch of [{ scriptName: "other-worker" }, { accountId: foreign }, { cron: expression }, { page: 2 }, { headers: {} },
    { approval: "forged" }, { agentId: "other" }, { scriptName: "../escape" }]) {
    const f = fixture();
    assert.equal((await f.invoke({ ...args, ...patch })).code, "INVALID_ARGUMENTS");
    assert.equal(f.calls.secret, 0);
    assert.equal(f.requests.length, 0);
  }
});

test("Cloudflare schedule actual-core fixed GET retains redaction, cleanup, audit and replay", async () => {
  const f = fixture();
  const p = f.operation.prepare(args);
  assert.equal(p.plan.providerDryRun, false);
  assert.equal(p.plan.providerOperationId, "worker-cron-trigger-get-cron-triggers");
  const out = await f.invoke();
  assert.equal(out.ok, true);
  assert.deepEqual(out.value.schedules, [{ cron: expression }]);
  assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4${p.plan.request.path}`);
  assert.equal(f.requests[0].init.method, "GET");
  assert.equal(f.requests[0].init.redirect, "manual");
  assert.equal(f.calls.close, 1);
  assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
  assert.equal([...f.journal.values()][0].outcome, "complete");
  assert.equal((await f.invoke()).code, "REPLAY_CONFLICT");
  assert.equal(f.requests.length, 1);
  safe(f, out);
});

test("Cloudflare schedule current agent, resource, binding and lease-time revocation deny network", async () => {
  for (const denied of ["agent", "resource", "binding", "revocation"]) {
    const f = fixture();
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

test("Cloudflare schedule foreign, malformed, denied and audit failures retain uncertain replay state", async () => {
  for (const options of [{ response: { ...result(), account_id: foreign } }, { response: { schedules: [{ cron: null }] } },
    { status: 403 }, { status: 404 }, { auditFailure: true }]) {
    const f = fixture(options);
    const append = f.dependencies.audit.append;
    if (options.auditFailure) f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw new Error(credentialCanary); };
    const out = await f.invoke();
    assert.equal(out.code, options.auditFailure ? "OUTCOME_UNCERTAIN" : "UPSTREAM_UNAVAILABLE");
    assert.equal([...f.journal.values()][0].outcome, "uncertain");
    assert.equal(f.calls.close, 1);
    const journal = structuredClone([...f.journal]);
    if (options.auditFailure) {
      const offline = await f.invoke();
      assert.equal(offline.code, "AUDIT_UNAVAILABLE");
      assert.equal(f.calls.secret, 1);
      assert.equal(f.calls.close, 1);
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
