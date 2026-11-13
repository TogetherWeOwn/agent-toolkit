import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCanaryJson } from "../scripts/canary-json.mjs";

const bytes = (text) => new TextEncoder().encode(text);

test("bounded JSON parser accepts an ordinary synthetic envelope", () => {
  assert.deepEqual(parseCanaryJson(bytes('{"page":[{"id":"123"}]}')), {
    ok: true, value: { page: [{ id: "123" }] },
  });
});

test("bounded JSON parser rejects ambiguous, malformed and oversized input without reflecting it", () => {
  const cases = [
    ['{"secret":"first","\\u0073ecret":"second"}', "duplicate_key"],
    ['{"key": [1,]}', "invalid_json"],
    ['{"type":0.00000000000000001}', "invalid_json"],
    ['{"type":1e0}', "invalid_json"], ['{"type":9007199254740992}', "invalid_json"],
    ['['.repeat(14) + '0' + ']'.repeat(14), "input_depth"],
    [JSON.stringify(Array(101).fill(0)), "input_collection"],
    [JSON.stringify(Object.fromEntries(Array.from({ length: 101 }, (_, i) => [i, 0]))), "input_collection"],
    [' '.repeat(131073), "input_size"],
  ];
  for (const [input, reason] of cases) {
    assert.deepEqual(parseCanaryJson(bytes(input)), { ok: false, reason });
  }
  assert.deepEqual(parseCanaryJson(Uint8Array.of(0xff)), { ok: false, reason: "invalid_json" });
});
