import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { currentContentDescriptor } from "../dist/plugins/cloudflare-broker/src/current-content.js";

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
