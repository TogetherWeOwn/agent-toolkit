import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { currentContentDescriptor } from "../dist/plugins/cloudflare-broker/src/current-content.js";
import { currentContentTransport } from "../dist/plugins/cloudflare-broker/src/metadata-transport.js";

const account = "a".repeat(32);
const scope = { accountId: account, revision: "source-policy-1", sourceDigestScriptNames: ["safe-worker"] };
const args = { scriptName: "safe-worker" };
const refuses = (callback, code) => assert.throws(callback, error => error.message === code && error.code === code);

test("Cloudflare current-content descriptor selects the supported current-only operation", () => {
  const descriptor = currentContentDescriptor(scope);
  const input = descriptor.prepare(args);
  assert.equal(descriptor.providerOperationId, "worker-script-get-content");
  assert.deepEqual(input.request, {
    method: "GET", path: `/accounts/${account}/workers/scripts/safe-worker/content/v2`,
    maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1, redirects: "deny",
  });
  assert.deepEqual(input.resource, { id: `cloudflare:account:${account}:worker:safe-worker:current-content`, revision: "source-policy-1" });
  for (const value of [descriptor, input, input.arguments, input.request, input.resource]) assert.ok(Object.isFrozen(value));
  assert.equal(descriptor.execute, undefined);
});

test("Cloudflare current-content refuses historical selectors and model identity or transport overrides", () => {
  const descriptor = currentContentDescriptor(scope);
  for (const key of ["versionId", "version", "deploymentId", "accountId", "agentId", "approval", "url", "headers", "credential", "capturedAt", "sourceSha"]) {
    refuses(() => descriptor.prepare({ ...args, [key]: "forged" }), "schema");
  }
  refuses(() => descriptor.prepare({ scriptName: "foreign-worker" }), "scope");
  for (const name of ["../safe-worker", "safe-worker?version=old", "safe-worker%2fcontent", "safе-worker"]) {
    refuses(() => descriptor.prepare({ scriptName: name }), "schema");
  }
});

test("Cloudflare current-content requires separate copied source authorization, empty by default", () => {
  for (const sourceDigestScriptNames of [undefined, []]) {
    const descriptor = currentContentDescriptor({ ...scope, sourceDigestScriptNames, scriptNames: ["safe-worker"], workerControlScriptNames: ["safe-worker"] });
    refuses(() => descriptor.prepare(args), "scope");
  }
  const mutable = { ...scope, sourceDigestScriptNames: ["safe-worker"] };
  const descriptor = currentContentDescriptor(mutable);
  mutable.accountId = "b".repeat(32);
  mutable.revision = "changed";
  mutable.sourceDigestScriptNames.push("foreign-worker");
  refuses(() => descriptor.prepare({ scriptName: "foreign-worker" }), "scope");
  assert.equal(descriptor.prepare(args).resource.revision, "source-policy-1");
  assert.ok(descriptor.prepare(args).request.path.startsWith(`/accounts/${account}/`));
});

test("Cloudflare current-content hashes exact bytes without returning source or inventing provenance", () => {
  const descriptor = currentContentDescriptor(scope);
  const body = Buffer.from('export const privateValue = "never-return-source";\r\n');
  const output = descriptor.project(body, descriptor.prepare(args));
  assert.deepEqual(output, {
    scriptName: "safe-worker", semantics: "current-only",
    digest: { algorithm: "sha256", subject: "captured-response-body", hex: createHash("sha256").update(body).digest("hex"), byteLength: body.byteLength },
    historicalBinding: "not-established", moduleAttribution: "not-parsed", libraryVersions: "unavailable",
  });
  assert.ok(Object.isFrozen(output) && Object.isFrozen(output.digest));
  assert.ok(!JSON.stringify(output).includes("never-return-source"));
  for (const field of ["source", "sourceSha", "buildSha", "bundleDigest", "versionId", "deploymentId", "capturedAt"]) assert.equal(output[field], undefined);
  const changed = descriptor.project(Buffer.from(body.toString().replace("\r\n", "\n")), descriptor.prepare(args));
  assert.notEqual(changed.digest.hex, output.digest.hex);
});

test("Cloudflare current-content does not confuse multipart response framing with module identity", () => {
  const descriptor = currentContentDescriptor(scope);
  const capture = boundary => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="main.js"\r\n\r\nexport default {};\r\n--${boundary}--\r\n`);
  const first = descriptor.project(capture("first"), descriptor.prepare(args));
  const second = descriptor.project(capture("second"), descriptor.prepare(args));
  assert.notEqual(first.digest.hex, second.digest.hex);
  assert.equal(first.digest.subject, "captured-response-body");
  assert.equal(first.moduleAttribution, "not-parsed");
  assert.equal(first.historicalBinding, "not-established");
});

test("Cloudflare current-content bounds bytes and refuses foreign or reconstructed request bindings", () => {
  const descriptor = currentContentDescriptor(scope);
  const input = descriptor.prepare(args);
  for (const body of [new Uint8Array(), new Uint8Array(131073), "source", null, {}]) refuses(() => descriptor.project(body, input), "cap");
  assert.equal(descriptor.project(new Uint8Array(131072), input).digest.byteLength, 131072);
  const foreign = currentContentDescriptor({ ...scope, accountId: "b".repeat(32) });
  refuses(() => descriptor.project(Buffer.from("source"), foreign.prepare(args)), "scope");
  refuses(() => descriptor.project(Buffer.from("source"), { ...input }), "scope");
});

test("Cloudflare current-content validates trusted scope bounds and never uses JSON metadata transport", () => {
  refuses(() => currentContentDescriptor({ ...scope, accountId: "invalid" }), "schema");
  refuses(() => currentContentDescriptor({ ...scope, revision: "bad revision" }), "schema");
  refuses(() => currentContentDescriptor({ ...scope, sourceDigestScriptNames: Array(101).fill("safe-worker") }), "cap");
  refuses(() => currentContentDescriptor({ ...scope, sourceDigestScriptNames: {} }), "cap");
  refuses(() => currentContentDescriptor({ ...scope, sourceDigestScriptNames: ["../bad"] }), "schema");
  const descriptor = currentContentDescriptor(scope);
  refuses(() => descriptor.project('{"success":true}', descriptor.prepare(args)), "cap");
});

const credential = "synthetic-content-token";
const multipart = (boundary = "test-boundary", source = Buffer.from("never-return-source")) => Buffer.concat([
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="main.js"; filename="main.js"\r\nContent-Type: application/javascript\r\n\r\n`),
  source, Buffer.from(`\r\n--${boundary}--\r\n`),
]);
const response = (body = multipart(), init = {}) => new Response(body, { headers: { "content-type": "multipart/form-data; boundary=test-boundary" }, ...init });
const signal = () => new AbortController().signal;
const upstream = error => error.message === "upstream" && error.code === "upstream";
const contentWith = patch => {
  const descriptor = currentContentDescriptor(scope);
  return { ...descriptor, prepare(raw) { const p = descriptor.prepare(raw); return { ...p, request: { ...p.request, ...patch } }; } };
};

test("Cloudflare content transport hashes exact binary multipart bytes and captures a local request window", async () => {
  const calls = [];
  const body = multipart("test-boundary", Buffer.from([0, 0xff, 13, 10]));
  const read = currentContentTransport(async (url, init) => { calls.push({ url, init }); return response(body); });
  const before = Date.now();
  const output = await read(currentContentDescriptor(scope), args, credential, signal());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/safe-worker/content/v2`);
  assert.deepEqual(calls[0].init.headers, { authorization: `Bearer ${credential}`, accept: "multipart/form-data" });
  for (const [key, value] of Object.entries({ method: "GET", redirect: "manual", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" })) assert.equal(calls[0].init[key], value);
  assert.equal(calls[0].init.signal.aborted, true);
  assert.equal(output.digest.hex, createHash("sha256").update(body).digest("hex"));
  assert.equal(output.digest.byteLength, body.byteLength);
  assert.equal(output.digest.subject, "captured-response-body");
  assert.equal(output.historicalBinding, "not-established");
  assert.equal(output.moduleAttribution, "not-parsed");
  assert.equal(output.libraryVersions, "unavailable");
  assert.match(output.capture.correlationId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(Date.parse(output.capture.startedAt) >= before);
  assert.ok(Date.parse(output.capture.completedAt) >= Date.parse(output.capture.startedAt));
  assert.ok(Date.parse(output.capture.completedAt) <= Date.now());
  assert.ok(output.capture.durationMs >= 0 && output.capture.durationMs <= 10000);
  assert.deepEqual(output.capture.resource, { id: `cloudflare:account:${account}:worker:safe-worker:current-content`, revision: scope.revision });
  assert.equal(output.capture.format, "multipart-form-data-framing-only");
  assert.equal(output.capture.provenance, "internal-transport-observation");
  assert.ok(Object.isFrozen(output.capture) && Object.isFrozen(output));
  const second = await read(currentContentDescriptor(scope), args, credential, signal());
  assert.notEqual(output.capture.correlationId, second.capture.correlationId);
  assert.ok(!JSON.stringify(output).includes(credential));
});

test("Cloudflare content transport validates separate source scope and exact endpoint before fetch", async () => {
  let calls = 0;
  const read = currentContentTransport(async () => { ++calls; return response(); });
  await assert.rejects(read(currentContentDescriptor({ ...scope, sourceDigestScriptNames: [] }), args, credential, signal()));
  for (const key of ["capturedAt", "correlationId", "versionId", "accountId", "headers", "url", "agentId"]) await assert.rejects(read(currentContentDescriptor(scope), { ...args, [key]: "forged" }, credential, signal()));
  for (const patch of [{ path: `/accounts/${account}/workers/scripts/safe-worker/content/v2?versionId=old` }, { path: `/accounts/${account}/workers/scripts/safe-worker/settings` }, { method: "POST" }, { maxRequests: 2 }, { maxResponseBytes: 131073 }, { timeoutMs: 10001 }, { redirects: "allow" }]) await assert.rejects(read(contentWith(patch), args, credential, signal()));
  await assert.rejects(read(currentContentDescriptor(scope), args, "bad\r\ncredential", signal()));
  assert.equal(calls, 0);
});

test("Cloudflare content transport rejects errors and unsupported or ambiguous media without body leakage", async () => {
  for (const init of [
    { status: 302, headers: { location: "https://foreign.invalid" } }, { status: 403 }, { status: 429 }, { status: 503 },
    ...["application/json", "text/html", "text/javascript", "application/octet-stream", "multipart/form-data", "multipart/form-data; boundary=", "multipart/form-data; boundary=a; boundary=b", `multipart/form-data; boundary=${"x".repeat(71)}`].map(type => ({ headers: { "content-type": type } })),
  ]) {
    let calls = 0;
    let cancelled = false;
    const body = new ReadableStream({ cancel() { cancelled = true; } });
    await assert.rejects(currentContentTransport(async () => { ++calls; return response(body, init); })(currentContentDescriptor(scope), args, credential, signal()), upstream);
    assert.equal(calls, 1);
    assert.equal(cancelled, true);
  }
  for (const properties of [{ redirected: true }, { url: "https://foreign.invalid/" }]) {
    const value = response();
    for (const [key, property] of Object.entries(properties)) Object.defineProperty(value, key, { value: property });
    await assert.rejects(currentContentTransport(async () => value)(currentContentDescriptor(scope), args, credential, signal()), upstream);
  }
});

test("Cloudflare content transport enforces multipart framing without claiming module validation", async () => {
  for (const body of ["", credential, '{"success":false}', multipart("wrong-boundary"), multipart().subarray(0, -4), Buffer.concat([multipart(), Buffer.from("untrusted-epilogue")])]) await assert.rejects(currentContentTransport(async () => response(body))(currentContentDescriptor(scope), args, credential, signal()), upstream);
  const read = currentContentTransport(async () => response(multipart(), { headers: { "content-type": 'multipart/form-data; boundary="test-boundary"' } }));
  const output = await read(currentContentDescriptor(scope), args, credential, signal());
  assert.ok(!JSON.stringify(output).includes("never-return-source"));
  assert.equal(output.capture.format, "multipart-form-data-framing-only");
  assert.equal(output.moduleAttribution, "not-parsed");
});

test("Cloudflare content transport bounds streamed bytes and chunks independently of length headers", async () => {
  for (const headers of [{}, { "content-length": "1" }, { "content-length": "131073" }, { "content-length": "invalid" }]) {
    let cancelled = false;
    const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(131073)); }, cancel() { cancelled = true; } });
    await assert.rejects(currentContentTransport(async () => response(body, { headers: { "content-type": "multipart/form-data; boundary=test-boundary", ...headers } }))(currentContentDescriptor(scope), args, credential, signal()), upstream);
    assert.equal(cancelled, true);
  }
  let cancelled = false;
  const body = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array()); }, cancel() { cancelled = true; } });
  await assert.rejects(currentContentTransport(async () => response(body))(currentContentDescriptor(scope), args, credential, signal()), upstream);
  assert.equal(cancelled, true);
});

test("Cloudflare content transport preserves split byte framing and the exact response cap", async () => {
  const prefix = multipart("test-boundary", Buffer.alloc(0));
  const body = multipart("test-boundary", Buffer.alloc(131072 - prefix.byteLength));
  const stream = new ReadableStream({ start(c) { c.enqueue(body.subarray(0, 1)); c.enqueue(body.subarray(1, body.length - 1)); c.enqueue(body.subarray(-1)); c.close(); } });
  const output = await currentContentTransport(async () => response(stream))(currentContentDescriptor(scope), args, credential, signal());
  assert.equal(output.digest.byteLength, 131072);
  assert.equal(output.digest.hex, createHash("sha256").update(body).digest("hex"));
});

test("Cloudflare content transport cancels stalls and late responses without projection", async () => {
  const pre = new AbortController();
  pre.abort();
  let calls = 0;
  await assert.rejects(currentContentTransport(async () => { ++calls; return response(); })(currentContentDescriptor(scope), args, credential, pre.signal), upstream);
  assert.equal(calls, 0);
  let cancelled = false;
  const stalled = new ReadableStream({ cancel() { cancelled = true; } });
  await assert.rejects(currentContentTransport(async () => response(stalled))(contentWith({ timeoutMs: 25 }), args, credential, signal()), upstream);
  assert.equal(cancelled, true);
  let resolve;
  let projected = false;
  cancelled = false;
  const delayed = new Promise(r => { resolve = r; });
  const descriptor = { ...contentWith({ timeoutMs: 25 }), project() { projected = true; return {}; } };
  await assert.rejects(currentContentTransport(async () => delayed)(descriptor, args, credential, signal()), upstream);
  resolve(response(new ReadableStream({ cancel() { cancelled = true; } })));
  await new Promise(r => setImmediate(r));
  assert.equal(cancelled, true);
  assert.equal(projected, false);
});

test("Cloudflare content transport returns fixed refusals for credential-bearing fetch and stream errors", async () => {
  for (const fetcher of [async () => { throw new Error(credential); }, async () => response(new ReadableStream({ start(c) { c.error(new Error(credential)); } }))]) await assert.rejects(currentContentTransport(fetcher)(currentContentDescriptor(scope), args, credential, signal()), upstream);
});
