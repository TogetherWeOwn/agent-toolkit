import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { currentContentDescriptor } from "../dist/plugins/cloudflare-broker/src/current-content.js";
import { currentContentTransport } from "../dist/plugins/cloudflare-broker/src/metadata-transport.js";

const args = { scriptName: "safe-worker" };
const scope = () => ({ accountId: "a".repeat(32), revision: "source-policy-1", sourceDigestScriptNames: ["safe-worker"],
  moduleDigestNamesByScript: [{ scriptName: "safe-worker", moduleNames: ["main.js", "lib/data.wasm"] }] });
const part = (name, bytes, headers = `Content-Disposition: form-data; name="${name}"; filename="${name}"\r\nContent-Type: application/octet-stream`) =>
  Buffer.concat([Buffer.from(`${headers}\r\n\r\n`), Buffer.from(bytes)]);
const multipart = (parts, boundary = "fixture") => Buffer.concat([
  Buffer.from(`--${boundary}\r\n`), ...parts.flatMap((value, index) => index === 0 ? [value] : [Buffer.from(`\r\n--${boundary}\r\n`), value]),
  Buffer.from(`\r\n--${boundary}--\r\n`),
]);
const binary = Buffer.from([0, 0xff, 13, 10, 1]);
const parts = () => [part("main.js", "never-return-source"), part("lib/data.wasm", binary), part("private.txt", "never-return-private")];
const project = (body, selected = scope(), boundary = "fixture") => {
  const descriptor = currentContentDescriptor(selected);
  return descriptor.project(body, descriptor.prepare(args), boundary);
};
const signal = () => new AbortController().signal;

test("Cloudflare module digests select only copied independently allowed names and exact binary bytes", () => {
  const output = project(multipart(parts()));
  assert.equal(output.moduleAttribution.subject, "captured-current-module-parts");
  assert.equal(output.moduleAttribution.complete, false);
  assert.deepEqual(output.moduleAttribution.modules, [
    { name: "lib/data.wasm", algorithm: "sha256", subject: "captured-module-part-bytes", hex: createHash("sha256").update(binary).digest("hex"), byteLength: binary.length },
    { name: "main.js", algorithm: "sha256", subject: "captured-module-part-bytes", hex: createHash("sha256").update("never-return-source").digest("hex"), byteLength: 19 },
  ]);
  assert.equal(output.libraryVersions, "unavailable");
  assert.equal(output.historicalBinding, "not-established");
  for (const value of [output.moduleAttribution, output.moduleAttribution.modules, ...output.moduleAttribution.modules]) assert.ok(Object.isFrozen(value));
  for (const canary of ["never-return-source", "never-return-private", "private.txt"]) assert.ok(!JSON.stringify(output).includes(canary));
});

test("Cloudflare module digests are independent of MIME boundary and part ordering, not canonical build identity", () => {
  const first = project(multipart(parts()));
  const second = project(multipart(parts().reverse(), "other"), scope(), "other");
  assert.notEqual(first.digest.hex, second.digest.hex);
  assert.deepEqual(first.moduleAttribution, second.moduleAttribution);
  const changed = parts();
  changed[0] = part("main.js", "different-source");
  assert.notEqual(first.moduleAttribution.modules[1].hex, project(multipart(changed)).moduleAttribution.modules[1].hex);
});

test("Cloudflare module digest visibility defaults off and scope is copied without granting source access", () => {
  const mutable = scope();
  const descriptor = currentContentDescriptor(mutable);
  mutable.moduleDigestNamesByScript[0].moduleNames.push("private.txt");
  mutable.moduleDigestNamesByScript[0].scriptName = "foreign-worker";
  assert.equal(descriptor.project(multipart(parts()), descriptor.prepare(args), "fixture").moduleAttribution.modules.length, 2);
  for (const moduleDigestNamesByScript of [undefined, [], [{ scriptName: "safe-worker", moduleNames: [] }]]) {
    assert.equal(project(multipart(parts()), { ...scope(), moduleDigestNamesByScript }).moduleAttribution, "not-parsed");
  }
  assert.throws(() => currentContentDescriptor({ ...scope(), sourceDigestScriptNames: [] }), /scope/);
  assert.throws(() => descriptor.prepare({ ...args, moduleNames: ["private.txt"] }), /schema/);
  assert.throws(() => descriptor.project(multipart(parts()), descriptor.prepare(args)), /upstream/);
});

test("Cloudflare module digest scope refuses ambiguous, traversal and oversized selections", () => {
  for (const moduleNames of [["../main.js"], ["lib/../main.js"], ["lib//main.js"], ["main.js", "main.js"], ["%2e.js"], ["/main.js"], ["main.js?version=old"], Array(17).fill("main.js"), {}, null]) {
    assert.throws(() => currentContentDescriptor({ ...scope(), moduleDigestNamesByScript: [{ scriptName: "safe-worker", moduleNames }] }));
  }
  for (const moduleDigestNamesByScript of [null, {}, [null], [...scope().moduleDigestNamesByScript, ...scope().moduleDigestNamesByScript], [{ scriptName: "foreign-worker", moduleNames: ["main.js"] }]]) {
    // Null is treated as omitted by the optional construction field.
    if (moduleDigestNamesByScript !== null) assert.throws(() => currentContentDescriptor({ ...scope(), moduleDigestNamesByScript }));
  }
});

test("Cloudflare module parser refuses duplicate, missing, malformed and ambiguous parts without source leakage", () => {
  const one = { ...scope(), moduleDigestNamesByScript: [{ scriptName: "safe-worker", moduleNames: ["main.js"] }] };
  for (const values of [
    [part("private.txt", "source")], [part("main.js", "a"), part("main.js", "b")],
    [part("main.js", "x", 'Content-Disposition: form-data; name="main.js"; filename="other.js"')],
    [part("main.js", "x", 'Content-Disposition: form-data; name="../main.js"')],
    [part("main.js", "x", 'Content-Disposition: form-data; name="main.js"\r\nContent-Transfer-Encoding: base64')],
    [part("main.js", "x", 'Content-Disposition: form-data; name="main.js"\r\nContent-Type: text/plain; charset=utf-8')],
    [part("main.js", "x", `Content-Disposition: form-data; name="main.js"\r\nX-Secret: ${"x".repeat(2048)}`)],
    [part("main.js", "x", 'Content-Disposition: form-data; name="main.js"\nX-Header: bad')],
    [part("main.js", "source\r\n--fixture-invalid-suffix")],
    [part("main.js", "x"), ...Array.from({ length: 64 }, (_, i) => part(`other${i}`, ""))],
  ]) {
    assert.throws(() => project(multipart(values), one), error => {
      assert.ok(["upstream", "schema", "cap"].includes(error.message));
      return true;
    });
  }
  const body = multipart([part("main.js", "")]);
  assert.equal(project(body, one).moduleAttribution.modules[0].byteLength, 0);
  for (const invalid of [body.subarray(0, -4), Buffer.concat([body, Buffer.from("epilogue")]), multipart([part("main.js", "")], "wrong")]) assert.throws(() => project(invalid, one), /upstream/);
});

test("Cloudflare module transport uses the validated media boundary while retaining reserved source semantics", async () => {
  let calls = 0;
  const read = currentContentTransport(async () => {
    ++calls;
    return new Response(multipart(parts()), { headers: { "content-type": 'multipart/form-data; boundary="fixture"' } });
  });
  const output = await read(currentContentDescriptor(scope()), args, "synthetic-token", signal());
  assert.equal(calls, 1);
  assert.equal(output.moduleAttribution.modules.length, 2);
  assert.equal(output.capture.format, "multipart-form-data-framing-only");
  assert.equal(output.capture.provenance, "internal-transport-observation");
  assert.equal(output.semantics, "current-only");
  assert.ok(!JSON.stringify(output).includes("never-return-source"));
});
