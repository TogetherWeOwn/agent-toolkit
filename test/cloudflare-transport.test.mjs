import assert from "node:assert/strict";
import test from "node:test";
import { metadataDescriptors, zoneMetadataDescriptors } from "../dist/plugins/cloudflare-broker/src/metadata.js";
import { metadataTransport } from "../dist/plugins/cloudflare-broker/src/metadata-transport.js";

const account = "a".repeat(32);
const own = "b".repeat(32);
const credential = "synthetic-test-token";
const descriptors = metadataDescriptors({ accountId: account, revision: "resource-1", scriptNames: ["safe-worker"], hyperdriveIds: [own] });
const descriptor = descriptors.hyperdriveGet;
const args = { hyperdriveId: own };
const signal = () => new AbortController().signal;
const envelope = JSON.stringify({ success: true, errors: [], result: { id: own, caching: { disabled: true }, origin: { password: "never-return", connection_string: "postgres://private" } } });
const response = (body = envelope, init = {}) => new Response(body, { headers: { "content-type": "application/json" }, ...init });
const upstream = error => error.message === "upstream" && error.code === "upstream";
const changed = patch => ({ ...descriptor, prepare(raw) { const p = descriptor.prepare(raw); return { ...p, request: { ...p.request, ...patch } }; } });

test("Cloudflare internal transport makes one fixed-origin GET and projects metadata only", async () => {
  const calls = [];
  const read = metadataTransport(async (url, init) => { calls.push({ url, init }); return response(); });
  assert.deepEqual(await read(descriptor, args, credential, signal()), { id: own, cachingDisabled: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://api.cloudflare.com/client/v4/accounts/${account}/hyperdrive/configs/${own}`);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.redirect, "manual");
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(calls[0].init.cache, "no-store");
  assert.deepEqual(calls[0].init.headers, { authorization: `Bearer ${credential}`, accept: "application/json" });
  assert.equal(calls[0].init.signal.aborted, true);
});

test("Cloudflare transport accepts the exact zone-detail root without exposing account or malformed roots", async () => {
  const zone = zoneMetadataDescriptors({ accountId: account, revision: "resource-1", zoneId: own, dnsRecordIds: [] }).zoneGet;
  const calls = [];
  const read = metadataTransport(async (url, init) => {
    calls.push({ url, init });
    return response(JSON.stringify({ success: true, errors: [], result: { id: own, account: { id: account }, name: "never-return" } }));
  });
  assert.deepEqual(await read(zone, {}, credential, signal()), { id: own });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://api.cloudflare.com/client/v4/zones/${own}`);
  assert.equal(calls[0].init.redirect, "manual");
  for (const path of [`/accounts/${account}`, `/zones/${own}/`, `/zones/${own}?extra=1`, `/zones/${own}/../${account}`]) {
    await assert.rejects(read(changed({ path }), args, credential, signal()));
  }
  assert.equal(calls.length, 1);
});

test("Cloudflare transport admits only the exact D1 configuration comma-separated field selection", async () => {
  const databaseId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const d1 = metadataDescriptors({ accountId: account, revision: "resource-1", scriptNames: [], hyperdriveIds: [],
    databaseIds: [databaseId], databaseConfigurationIds: [databaseId] }).d1Get;
  const input = { databaseId };
  const path = d1.prepare(input).request.path;
  const calls = [];
  const read = metadataTransport(async (url, init) => {
    calls.push({ url, init });
    return response(JSON.stringify({ success: true, errors: [], result: { uuid: databaseId } }));
  });
  assert.equal((await read(d1, input, credential, signal())).configuration.readReplicationMode, "unavailable");
  assert.equal(calls[0].url, `https://api.cloudflare.com/client/v4${path}`);
  for (const invalid of [path.replace("uuid,jurisdiction", "uuid,name"), `${path},name`, `${path}&extra=1`,
    path.replace("read_replication", "read%5freplication"), path.replace("/d1/database/", "/workers/scripts/"),
    `/accounts/${account}/workers/scripts?fields=uuid,jurisdiction,read_replication`]) {
    const altered = { ...d1, prepare(raw) { const p = d1.prepare(raw); return { ...p, request: { ...p.request, path: invalid } }; } };
    await assert.rejects(read(altered, input, credential, signal()));
  }
  assert.equal(calls.length, 1);
});

test("Cloudflare transport validates model scope and trusted request constraints before fetch", async () => {
  let calls = 0;
  const read = metadataTransport(async () => { ++calls; return response(); });
  await assert.rejects(read(descriptor, { ...args, url: "https://foreign.invalid" }, credential, signal()));
  await assert.rejects(read(descriptor, { hyperdriveId: "c".repeat(32) }, credential, signal()));
  await assert.rejects(read(descriptor, args, "token\r\ninjected: true", signal()));
  for (const patch of [
    { method: "POST" }, { maxRequests: 2 }, { redirects: "allow" },
    { maxResponseBytes: 131073 }, { maxResponseBytes: 0 }, { timeoutMs: 10001 },
    { path: "https://foreign.invalid" }, { path: "//foreign.invalid" },
    { path: `/accounts/${account}/../zones` }, { path: `/accounts/${account}/%2e%2e` },
    { path: `/accounts/${account}/workers#fragment` }, { path: `/accounts/${account}/workers\\foreign` },
  ]) await assert.rejects(read(changed(patch), args, credential, signal()));
  assert.equal(calls, 0);
});

test("Cloudflare transport rejects redirects, provider errors and non-JSON without retry or body leakage", async () => {
  for (const init of [
    { status: 302, headers: { location: "https://foreign.invalid" } },
    { status: 403 }, { status: 429 }, { status: 503 },
    { headers: { "content-type": "text/html" } },
    { headers: { "content-type": "application/jsonp" } },
  ]) {
    let calls = 0;
    let cancelled = false;
    const body = new ReadableStream({ cancel() { cancelled = true; } });
    const read = metadataTransport(async () => { ++calls; return response(body, init); });
    await assert.rejects(read(descriptor, args, credential, signal()), upstream);
    assert.equal(calls, 1);
    assert.equal(cancelled, true);
  }
});

test("Cloudflare transport rejects redirected or mismatched response provenance", async () => {
  for (const properties of [{ redirected: true }, { url: "https://foreign.invalid/" }, { url: `https://api.cloudflare.com/client/v4/accounts/${"c".repeat(32)}/hyperdrive/configs/${own}` }]) {
    const value = response();
    for (const [key, property] of Object.entries(properties)) Object.defineProperty(value, key, { value: property });
    await assert.rejects(metadataTransport(async () => value)(descriptor, args, credential, signal()), upstream);
  }
});

test("Cloudflare streaming cap is enforced without trusting Content-Length", async () => {
  for (const headers of [{ "content-length": "1" }, {}, { "content-length": "131073" }, { "content-length": "invalid" }]) {
    let cancelled = false;
    const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(65536)); c.enqueue(new Uint8Array(65537)); }, cancel() { cancelled = true; } });
    const read = metadataTransport(async () => response(body, { headers: { "content-type": "application/json", ...headers } }));
    await assert.rejects(read(descriptor, args, credential, signal()), upstream);
    assert.equal(cancelled, true);
  }
});

test("Cloudflare transport decodes split UTF-8 strictly and refuses malformed bytes or envelopes", async () => {
  const bytes = new TextEncoder().encode(envelope.replace("never-return", "private-é"));
  const body = new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(Uint8Array.of(byte)); c.close(); } });
  assert.deepEqual(await metadataTransport(async () => response(body))(descriptor, args, credential, signal()), { id: own, cachingDisabled: true });
  for (const malformed of [Uint8Array.of(0xff), "not-json", JSON.stringify({ success: false, errors: [{ message: credential }] })]) {
    await assert.rejects(metadataTransport(async () => response(malformed))(descriptor, args, credential, signal()), upstream);
  }
});

test("Cloudflare transport refuses explicit foreign-resource responses after projection", async () => {
  const foreign = envelope.replace(own, "c".repeat(32));
  await assert.rejects(metadataTransport(async () => response(foreign))(descriptor, args, credential, signal()), error => error.code === "scope");
});

test("Cloudflare transport sanitizes fetch and stream errors including credential-bearing diagnostics", async () => {
  const failures = [
    async () => { throw new Error(`network error ${credential}`); },
    async () => response(new ReadableStream({ start(c) { c.error(new Error(credential)); } })),
  ];
  for (const fetcher of failures) await assert.rejects(metadataTransport(fetcher)(descriptor, args, credential, signal()), upstream);
});

test("Cloudflare transport handles pre-abort, fetch cancellation and a stalled response body", async () => {
  const pre = new AbortController();
  pre.abort();
  let calls = 0;
  await assert.rejects(metadataTransport(async () => { ++calls; return response(); })(descriptor, args, credential, pre.signal), upstream);
  assert.equal(calls, 0);
  let fetchSignal;
  await assert.rejects(metadataTransport(async (_url, init) => { fetchSignal = init.signal; return new Promise(() => {}); })(changed({ timeoutMs: 25 }), args, credential, signal()), upstream);
  assert.equal(fetchSignal.aborted, true);
  let cancelled = false;
  const stalled = new ReadableStream({ cancel() { cancelled = true; } });
  await assert.rejects(metadataTransport(async () => response(stalled))(changed({ timeoutMs: 25 }), args, credential, signal()), upstream);
  assert.equal(cancelled, true);
  const active = new AbortController();
  const pending = metadataTransport(async () => { active.abort(new Error(credential)); return response(); })(descriptor, args, credential, active.signal);
  await assert.rejects(pending, upstream);
});

test("Cloudflare late fetch response is cancelled and never projected after timeout", async () => {
  let resolve;
  let projected = false;
  let cancelled = false;
  const delayed = new Promise(r => { resolve = r; });
  const read = metadataTransport(async () => delayed);
  const guarded = { ...changed({ timeoutMs: 25 }), project() { projected = true; return {}; } };
  await assert.rejects(read(guarded, args, credential, signal()), upstream);
  resolve(response(new ReadableStream({ cancel() { cancelled = true; } })));
  await new Promise(r => setImmediate(r));
  assert.equal(cancelled, true);
  assert.equal(projected, false);
});
