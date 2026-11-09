import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { cacheMetadataDescriptors, variantFormats } from "../dist/plugins/cloudflare-broker/src/cache-metadata.js";
import { cloudflareReadOperations } from "../dist/plugins/cloudflare-broker/src/read-operations.js";
import { canonicalHash, createProviderBroker } from "../dist/packages/core/src/provider/index.js";
import { providerFixture, credentialCanary, derivedCanary } from "../packages/core/testing/provider-fixture.mjs";

const account = "a".repeat(32);
const zone = "b".repeat(32);
const foreign = "f".repeat(32);
const timestamp = "2023-10-02T10:00:00.12345Z";
const cases = [
  { key: "variantsGet", name: "cloudflare.cache.variants.get", flag: "cacheVariantsFormats", permission: "formats", grant: ["avif", "png"],
    id: "variants", suffix: "cache-variants:formats:avif,png", operationId: "zone-cache-settings-get-variants-setting" },
  { key: "reserveClearStatusGet", name: "cloudflare.cache.reserve_clear_status.get", flag: "cacheReserveClearStatusReadAllowed", permission: "clearStatusReadAllowed", grant: true,
    id: "cache_reserve_clear", suffix: "cache-reserve-clear-status", operationId: "zone-cache-settings-get-cache-reserve-clear" },
];
const scope = c => ({ accountId: account, zoneId: zone, revision: "resource-1", [c.permission]: structuredClone(c.grant) });
const success = result => JSON.stringify({ success: true, errors: [], messages: [], result });
const row = c => ({ id: c.id, ...(c.key === "variantsGet" ? { value: { avif: ["image/WebP"], png: [], jpeg: [credentialCanary] }, editable: false }
  : { state: "Completed", start_ts: timestamp, end_ts: timestamp }), modified_on: derivedCanary,
  owner: credentialCanary, unrelated: { token: credentialCanary } });
function fixture(c, { allowed = true, response = row(c), raw, status = 200, noZone = false, flags = {}, fetcher } = {}) {
  const f = providerFixture();
  const requests = [];
  const trusted = { accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    ...(noZone ? {} : { zone: { zoneId: zone, dnsRecordIds: [], [c.flag]: allowed ? structuredClone(c.grant) : c.key === "variantsGet" ? [] : false, ...flags } }) };
  const operations = cloudflareReadOperations(trusted, { accountId: account, revision: "resource-1" }, async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, `Bearer ${credentialCanary}`);
    return fetcher ? fetcher(url, init) : new Response(raw ?? success(response), { status, headers: { "content-type": "application/json" } });
  });
  const operation = operations.find(op => op.name === c.name);
  let resource;
  try { resource = operation.prepare({}).resource.id; } catch { resource = "not-authorized"; }
  f.vector.policy = { revision: "policy-1", agents: [f.vector.principal.agent], resources: [resource] };
  f.dependencies.provider = "cloudflare";
  f.dependencies.operations = operations;
  const broker = createProviderBroker(f.dependencies);
  return { ...f, requests, operation, operations, trusted,
    invoke: (args = {}, key = "call-a") => broker.call(c.name, args, "verified-runtime", key) };
}
function safe(f, out) {
  const data = JSON.stringify({ out, audit: f.audit, journal: [...f.journal] });
  for (const value of [credentialCanary, derivedCanary, "editable", "modified_on", "start_ts", "end_ts", "owner", "unrelated"]) assert.ok(!data.includes(value));
}

for (const c of cases) {
  test(`${c.name} copies independent authority and authenticates frozen prepared projections`, () => {
    const s = scope(c);
    const d = cacheMetadataDescriptors(s)[c.key];
    s.accountId = foreign; s.zoneId = foreign; s.revision = "revoked";
    if (Array.isArray(s[c.permission])) s[c.permission].splice(0, 2, "jpeg");
    else s[c.permission] = false;
    const p = d.prepare({});
    assert.equal(p.resource.id, `cloudflare:account:${account}:zone:${zone}:${c.suffix}`);
    assert.equal(p.resource.revision, "resource-1");
    assert.deepEqual(p.request, { method: "GET", path: `/zones/${zone}/cache/${c.id}`, maxResponseBytes: 131072,
      timeoutMs: 10000, maxRequests: 1, redirects: "deny" });
    for (const value of [d, p, p.arguments, p.resource, p.request]) assert.ok(Object.isFrozen(value));
    assert.throws(() => d.project(success(row(c)), { ...p }), /scope/);
    assert.throws(() => cacheMetadataDescriptors(scope(c))[c.key].project(success(row(c)), p), /scope/);
    const other = cases.find(item => item !== c);
    assert.throws(() => cacheMetadataDescriptors(scope(other))[other.key].project(success(row(other)), p), /scope/);
    for (const field of ["accountId", "zoneId", "revision"]) for (const value of ["bad/identity", "a\n", "é", ""]) {
      assert.throws(() => cacheMetadataDescriptors({ ...scope(c), [field]: value }), /schema/);
    }
    for (const args of [null, [], { zoneId: foreign }, { formats: ["jpeg"] }, { state: "Completed" }, { method: "POST" },
      { accountId: foreign }, { revision: "forged" }, { approval: true }, { url: "https://example.com" }]) assert.throws(() => d.prepare(args), /schema/);
  });

  test(`${c.name} strict identity, envelope, optional context and raw cap`, () => {
    const d = cacheMetadataDescriptors(scope(c))[c.key]; const p = d.prepare({});
    for (const patch of [{ account_id: foreign }, { zone_id: foreign }, { account_id: null }, { zone_id: {} }]) {
      assert.throws(() => d.project(JSON.stringify({ success: true, errors: [], messages: [], result: row(c), ...patch }), p), /scope/);
      assert.throws(() => d.project(success({ ...row(c), ...patch }), p), /scope/);
    }
    d.project(JSON.stringify({ success: true, errors: [], messages: [], account_id: account, zone_id: zone,
      result: { ...row(c), account_id: account, zone_id: zone } }), p);
    for (const id of [undefined, null, "cache_reserve", cases.find(item => item !== c).id, 1, {}, []]) {
      assert.throws(() => d.project(success({ ...row(c), id }), p), /upstream/);
    }
    for (const raw of ["null", "not-json", "[]", "{}", success(null), success([]), JSON.stringify({ success: true, result: row(c) }),
      JSON.stringify({ success: true, errors: [], result: row(c) }), JSON.stringify({ success: false, errors: [], messages: [], result: row(c) }),
      JSON.stringify({ success: true, errors: [credentialCanary], messages: [], result: row(c) }),
      JSON.stringify({ success: true, errors: [], messages: {}, result: row(c) }),
      JSON.stringify({ success: true, errors: [], messages: [null], result: row(c) })]) assert.throws(() => d.project(raw, p), /upstream/);
    const base = success({ ...row(c), padding: "" });
    const atCap = base.replace('"padding":""', `"padding":"${"x".repeat(131072 - Buffer.byteLength(base))}"`);
    d.project(atCap, p);
    assert.throws(() => d.project(atCap + " ", p), /cap/);
    assert.throws(() => d.project(success({ ...row(c), padding: "é".repeat(65536) }), p), /cap/);
    safe({ audit: [], journal: [] }, d.project(success(row(c)), p));
  });

  test(`${c.name} default/basic/other-operation authority denies before credentials`, async () => {
    assert.ok(!fixture(c, { noZone: true }).operations.some(op => op.name === c.name));
    assert.throws(() => cacheMetadataDescriptors({ accountId: account, zoneId: zone, revision: "resource-1" })[c.key].prepare({}), /scope/);
    const other = cases.find(item => item !== c);
    const denied = fixture(c, { allowed: false, flags: { [other.flag]: other.grant, cacheReserveReadAllowed: true,
      smartTieredCacheReadAllowed: true, regionalCacheReadAllowed: true, argoSmartRoutingReadAllowed: true } });
    assert.equal((await denied.invoke()).code, "INVALID_ARGUMENTS");
    assert.equal(denied.calls.secret, 0); assert.equal(denied.requests.length, 0);
    const allowed = fixture(c);
    for (const name of [other.name, "cloudflare.cache.reserve.get", "cloudflare.cache.smart_tiered.get", "cloudflare.cache.regional.get"]) {
      assert.throws(() => allowed.operations.find(op => op.name === name).prepare({}), /scope/);
    }
    allowed.trusted.zone.zoneId = foreign;
    if (Array.isArray(allowed.trusted.zone[c.flag])) allowed.trusted.zone[c.flag].push("jpeg");
    else allowed.trusted.zone[c.flag] = false;
    assert.equal(allowed.operation.prepare({}).resource.id, `cloudflare:account:${account}:zone:${zone}:${c.suffix}`);
    for (const args of [{ accountId: foreign }, { zoneId: foreign }, { readAllowed: true }, { formats: ["jpeg"] },
      { headers: {} }, { url: "https://example.com" }, { page: 2 }, { approval: "forged" }, { method: "POST" }]) {
      const f = fixture(c); assert.equal((await f.invoke(args)).code, "INVALID_ARGUMENTS");
      assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0);
    }
  });

  test(`${c.name} actual reviewed core fixed target hashing, cleanup, audit and replay`, async () => {
    const f = fixture(c); const p = f.operation.prepare({});
    assert.equal(p.plan.providerDryRun, false); assert.equal(p.plan.providerOperationId, c.operationId);
    assert.equal(f.operation.tier, "read"); assert.equal(f.operation.timeoutMs, 10000);
    assert.equal(canonicalHash(p), canonicalHash({ resource: { id: `cloudflare:account:${account}:zone:${zone}:${c.suffix}`, revision: "resource-1" },
      arguments: {}, artifactDigest: null, plan: { kind: "bounded-current-read", providerOperationId: c.operationId,
        request: { method: "GET", path: `/zones/${zone}/cache/${c.id}`, maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1, redirects: "deny" },
        providerDryRun: false, providerRevisionFence: "not-established" } }));
    const out = await f.invoke(); assert.equal(out.ok, true);
    assert.equal(f.requests[0].url, `https://api.cloudflare.com/client/v4/zones/${zone}/cache/${c.id}`);
    assert.equal(f.requests[0].init.method, "GET"); assert.equal(f.requests[0].init.redirect, "manual");
    assert.equal(f.calls.close, 1); assert.deepEqual(f.audit.map(event => event.phase), ["intent", "outcome"]);
    assert.equal([...f.journal.values()][0].outcome, "complete");
    assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
  });

  test(`${c.name} exact resource, principal, revision and revoked policy refusal`, async () => {
    for (const denied of ["agent", "other-operation", "basic", "cross-account", "cross-zone", "wildcard", "binding", "stale", "revocation"]) {
      const f = fixture(c);
      if (denied === "agent") f.vector.policy.agents = ["other-agent"];
      if (denied === "other-operation") f.vector.policy.resources = [`cloudflare:account:${account}:zone:${zone}:${cases.find(item => item !== c).suffix}`];
      if (denied === "basic") f.vector.policy.resources = [`cloudflare:account:${account}:zone:${zone}:cache-reserve`];
      if (denied === "cross-account") f.vector.policy.resources = [`cloudflare:account:${foreign}:zone:${zone}:${c.suffix}`];
      if (denied === "cross-zone") f.vector.policy.resources = [`cloudflare:account:${account}:zone:${foreign}:${c.suffix}`];
      if (denied === "wildcard") f.vector.policy.resources = [`cloudflare:account:${account}:zone:${zone}:*`];
      if (denied === "binding" || denied === "stale") f.dependencies.host.revalidate = async () => false;
      if (denied === "revocation") {
        const resolve = f.dependencies.credentials.resolve;
        f.dependencies.credentials.resolve = async target => { const lease = await resolve(target); f.vector.policy.revision = "revoked"; return lease; };
      }
      const out = await f.invoke();
      assert.equal(out.code, denied === "binding" || denied === "stale" ? "RESOURCE_CHANGED" : denied === "revocation" ? "POLICY_CHANGED" : "POLICY_DENIED");
      assert.equal(f.calls.secret, denied === "revocation" ? 1 : 0); assert.equal(f.calls.close, denied === "revocation" ? 1 : 0);
      assert.equal(f.requests.length, 0); safe(f, out);
    }
  });

  test(`${c.name} transport and upstream refusals never synthesize provider state`, async () => {
    const invalidUtf8 = new Uint8Array([0xc3, 0x28]);
    for (const options of [{ status: 302 }, { status: 403 }, { status: 404 }, { status: 500 }, { raw: "{" },
      { raw: success({ ...row(c), id: "cache_reserve" }) }, { raw: success({ ...row(c), padding: "x".repeat(131072) }) },
      { fetcher: () => { throw new Error(credentialCanary); } },
      { fetcher: () => new Response(invalidUtf8, { headers: { "content-type": "application/json" } }) },
      { fetcher: () => new Response(success(row(c)), { headers: { "content-type": "text/plain" } }) },
      { fetcher: () => new Response(success(row(c)), { headers: { "content-type": "application/json", "content-length": "131073" } }) }]) {
      const f = fixture(c, options); const out = await f.invoke();
      assert.equal(out.code, "UPSTREAM_UNAVAILABLE"); assert.equal(f.requests.length, 1); assert.equal(f.calls.close, 1);
      assert.equal([...f.journal.values()][0].outcome, "uncertain");
      assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.requests.length, 1); safe(f, out);
    }
  });

  test(`${c.name} audit and cleanup uncertainty preserves reviewed-core outcomes and tombstones`, async () => {
    for (const failure of ["audit", "cleanup"]) {
      const f = fixture(c);
      if (failure === "audit") f.dependencies.audit.append = async event => { if (event.phase === "outcome") throw new Error(credentialCanary); };
      else {
        const resolve = f.dependencies.credentials.resolve;
        f.dependencies.credentials.resolve = async target => {
          const lease = await resolve(target); return { ...lease, close: async () => { await lease.close(); throw new Error(credentialCanary); } };
        };
      }
      const out = await f.invoke(); assert.equal(out.code, "OUTCOME_UNCERTAIN");
      assert.equal([...f.journal.values()][0].outcome, "uncertain");
      // The reviewed core attempts cleanup again in its failure handler.
      assert.equal(f.calls.close, failure === "cleanup" ? 2 : 1);
      const journal = structuredClone([...f.journal]);
      assert.equal((await f.invoke()).code, "REPLAY_CONFLICT"); assert.equal(f.calls.secret, 1);
      assert.equal(f.requests.length, 1); assert.deepEqual([...f.journal], journal); safe(f, out);
    }
    for (const failure of ["audit", "journal"]) {
      const f = fixture(c);
      if (failure === "audit") f.dependencies.audit.append = async () => { throw new Error(credentialCanary); };
      else f.dependencies.journal.claim = async () => { throw new Error(credentialCanary); };
      const out = await f.invoke(); assert.equal(out.ok, false); assert.equal(f.calls.secret, 0); assert.equal(f.requests.length, 0); safe(f, out);
    }
  });

  test(`${c.name} refuses prepared resource, revision, argument, digest and plan swaps`, async () => {
    for (const change of [p => ({ ...p, resource: { ...p.resource, id: `cloudflare:account:${account}:zone:${foreign}:${c.suffix}` } }),
      p => ({ ...p, resource: { ...p.resource, revision: "other-revision" } }), p => ({ ...p, arguments: { zoneId: foreign } }),
      p => ({ ...p, artifactDigest: "f".repeat(64) }), p => ({ ...p, plan: { ...p.plan, providerOperationId: cases.find(item => item !== c).operationId } }),
      p => ({ ...p, plan: { ...p.plan, request: { ...p.plan.request, method: "POST" } } })]) {
      const f = fixture(c);
      await assert.rejects(f.operation.execute(change(f.operation.prepare({})), credentialCanary, new AbortController().signal), /scope|schema/);
      assert.equal(f.requests.length, 0);
    }
  });
}

test("cache variants exact schema formats and copied canonical selection have distinct policy identities", async () => {
  assert.deepEqual(variantFormats, ["avif", "bmp", "gif", "jp2", "jpeg", "jpg", "jpg2", "png", "tif", "tiff", "webp"]);
  assert.ok(Object.isFrozen(variantFormats));
  const c = cases[0];
  for (const formats of [null, true, "avif", ["svg"], ["AVIF"], ["avif", "avif"], ["png\n"], Array(12).fill("png")]) {
    assert.throws(() => cacheMetadataDescriptors({ ...scope(c), formats }), /schema/);
  }
  for (const value of [null, 1, "true", [], {}]) assert.throws(() => cacheMetadataDescriptors({ ...scope(c), clearStatusReadAllowed: value }), /schema/);
  const d = cacheMetadataDescriptors({ ...scope(c), formats: ["png", "avif"] }).variantsGet;
  assert.equal(d.prepare({}).resource.id, fixture(c).operation.prepare({}).resource.id);
  assert.notEqual(cacheMetadataDescriptors({ ...scope(c), formats: ["avif"] }).variantsGet.prepare({}).resource.id, d.prepare({}).resource.id);
  const f = fixture(c);
  f.vector.policy.resources = [cacheMetadataDescriptors({ ...scope(c), formats: ["avif"] }).variantsGet.prepare({}).resource.id];
  assert.equal((await f.invoke()).code, "POLICY_DENIED"); assert.equal(f.calls.secret, 0);
});

test("cache variants preserve selected unavailable versus empty and false editability without claiming behavior", () => {
  const c = cases[0]; const d = cacheMetadataDescriptors(scope(c)).variantsGet; const p = d.prepare({});
  const out = d.project(success({ id: "variants", editable: false, value: { png: [], jpeg: [credentialCanary] } }), p);
  assert.deepEqual(out, { subject: "configured-selected-cache-variants", formats: { avif: { availability: "unavailable" }, png: { availability: "reported", mimeTypes: [] } },
    effectiveCacheVariants: "not-established", originBehavior: "not-established", contentNegotiation: "not-established", completeness: "not-established" });
  for (const value of [out, out.formats, out.formats.png, out.formats.png.mimeTypes]) assert.ok(Object.isFrozen(value));
  for (const editable of [undefined, null, "false", 0, [], {}]) assert.throws(() => d.project(success({ ...row(c), editable }), p), /upstream/);
  for (const value of [undefined, null, false, [], "on"]) assert.throws(() => d.project(success({ ...row(c), value }), p), /upstream/);
  for (const format of variantFormats) {
    const one = cacheMetadataDescriptors({ ...scope(c), formats: [format] }).variantsGet;
    const result = one.project(success({ id: "variants", editable: true, value: { [format]: ["image/X-Custom+Type"] } }), one.prepare({}));
    assert.deepEqual(result.formats[format].mimeTypes, ["image/X-Custom+Type"]);
  }
});

test("cache variants enforce unique bounded MIME syntax and finite output without normalization or defaults", () => {
  const c = cases[0]; const d = cacheMetadataDescriptors(scope(c)).variantsGet; const p = d.prepare({});
  const project = mimeTypes => d.project(success({ ...row(c), value: { avif: mimeTypes } }), p);
  for (const value of [null, false, {}, "image/png", [null], [false], [1], [""], [" image/png"], ["image/png\n"], ["image/é"],
    ["image/png;quality=1"], ["image/*"], ["not-a-mime"], ["image/png", "image/png"], Array.from({ length: 65 }, (_, n) => `image/x-${n}`),
    [`image/${"a".repeat(123)}`]]) assert.throws(() => project(value), /upstream|cap/);
  assert.equal(project(Array.from({ length: 64 }, (_, n) => `image/x-${n}`)).formats.avif.mimeTypes.length, 64);
  assert.equal(project([`image/${"a".repeat(122)}`]).formats.avif.mimeTypes[0].length, 128);
  assert.deepEqual(project(["image/PNG", "image/png"]).formats.avif.mimeTypes, ["image/PNG", "image/png"]);
  const all = cacheMetadataDescriptors({ ...scope(c), formats: [...variantFormats] }).variantsGet;
  const large = Object.fromEntries(variantFormats.map(format => [format, Array.from({ length: 64 }, (_, n) => `image/${String(n).padStart(3, "0")}${"a".repeat(119)}`)]));
  assert.throws(() => all.project(success({ id: "variants", editable: false, value: large }), all.prepare({})), /cap/);
});

test("Reserve clear status validates required timestamps but projects only reported state and limitations", () => {
  const c = cases[1]; const d = cacheMetadataDescriptors(scope(c)).reserveClearStatusGet; const p = d.prepare({});
  for (const state of ["In-progress", "Completed"]) {
    const out = d.project(success({ id: c.id, state, start_ts: timestamp }), p);
    assert.deepEqual(out, { subject: "provider-reported-cache-reserve-clear-status", reportedState: state,
      deletion: "not-established", custody: "not-established", irreversibility: "not-established", effectiveOperationOutcome: "not-established" });
    assert.ok(Object.isFrozen(out));
  }
  for (const state of [undefined, null, false, "completed", "never started", "", [], {}]) assert.throws(() => d.project(success({ ...row(c), state }), p), /upstream/);
  for (const field of ["start_ts", "end_ts"]) for (const value of [null, false, "", "yesterday", "2023-02-29T10:00:00Z", "2023-01-01", "2023-01-01T25:00:00Z", "2023-01-01T10:00:00Z\n", "x".repeat(65)]) {
    assert.throws(() => d.project(success({ ...row(c), [field]: value }), p), /upstream/);
  }
  assert.throws(() => d.project(success({ id: c.id, state: "Completed" }), p), /upstream/);
  for (const start_ts of [timestamp, "2024-02-29T12:34:56Z", "2024-02-29t12:34:56.1z", "2024-02-29T12:34:56+05:30"]) d.project(success({ id: c.id, state: "In-progress", start_ts }), p);
});

test("cache metadata ledger additions remain disabled descriptor-only with registry parity", async () => {
  const rows = (await readFile(new URL("../plugins/cloudflare-broker/coverage/operations.jsonl", import.meta.url), "utf8")).trimEnd().split("\n").map(JSON.parse);
  for (const c of cases) {
    const matches = rows.filter(row => row.operationId === c.operationId); assert.equal(matches.length, 1);
    const r = matches[0]; assert.equal(r.key, `GET /zones/{zone_id}/cache/${c.id}`); assert.equal(r.typedTool, c.name);
    assert.equal(r.implementation, "descriptor-only"); assert.equal(r.tier, "read"); assert.equal(r.credentialScope, "unknown");
    assert.equal(r.enablement, "disabled"); assert.equal(r.review, "not-reviewed"); assert.ok(r.tests.includes("test/cloudflare-cache-metadata.test.mjs"));
    const f = fixture(c); assert.equal(f.operations.filter(op => op.name === c.name).length, 1);
    assert.equal(f.operation.prepare({}).plan.providerOperationId, r.operationId);
  }
  assert.equal(rows.find(row => row.key === "POST /zones/{zone_id}/cache/cache_reserve_clear").implementation, "missing");
});
