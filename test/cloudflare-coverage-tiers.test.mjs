import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// This admission record must not advertise source acquisition as ordinary metadata.
test("Cloudflare coverage reserves CURRENT source acquisition without treating it as deletion", async () => {
  const bytes = await readFile(new URL("../plugins/cloudflare-broker/coverage/operations.jsonl", import.meta.url), "utf8");
  const rows = bytes.trimEnd().split("\n").map(line => JSON.parse(line));
  const source = rows.filter(row => row.typedTool === "cloudflare.workers.current_content.digest");
  assert.equal(source.length, 1);
  assert.equal(source[0].tier, "reserved");
  assert.equal(source[0].approvalRoute, "exact-native-source-authorization-and-agent-resource-policy");
  assert.equal(source[0].sideEffects, "source-read-digest-only");
  assert.equal(source[0].implementation, "content-descriptor-only");
  assert.equal(source[0].enablement, "disabled");
  assert.equal(source[0].review, "not-reviewed");
  assert.ok(source[0].prerequisites.includes("separate-source-authorization"));
});
