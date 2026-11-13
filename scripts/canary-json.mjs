// Reject ambiguous or resource-exhausting JSON before inspecting an envelope.
// Failure results never contain input, parser exceptions, or property names.
const MAX_BYTES = 128 * 1024;
const MAX_DEPTH = 12;
const MAX_LIST = 100;
const MAX_MEMBERS = 100;

export function parseCanaryJson(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_BYTES) {
    return { ok: false, reason: "input_size" };
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    let at = 0;
    const fail = (reason) => { throw reason; };
    const whitespace = () => { while (/[\x20\t\r\n]/.test(text[at] ?? "\0")) at++; };
    const string = () => {
      const start = at++;
      while (at < text.length) {
        const c = text[at++];
        if (c === '"') return JSON.parse(text.slice(start, at));
        if (c === "\\") {
          if (at >= text.length) fail("invalid_json");
          at++;
        }
      }
      fail("invalid_json");
    };
    const value = (depth) => {
      if (depth > MAX_DEPTH) fail("input_depth");
      whitespace();
      const c = text[at];
      if (c === '"') { string(); return; }
      if (c === "{" || c === "[") {
        at++;
        const object = c === "{";
        const end = object ? "}" : "]";
        const keys = new Set();
        let count = 0;
        whitespace();
        if (text[at] === end) { at++; return; }
        while (true) {
          if (++count > (object ? MAX_MEMBERS : MAX_LIST)) fail("input_collection");
          if (object) {
            whitespace();
            if (text[at] !== '"') fail("invalid_json");
            const key = string();
            if (keys.has(key)) fail("duplicate_key");
            keys.add(key);
            whitespace();
            if (text[at++] !== ":") fail("invalid_json");
          }
          value(depth + 1);
          whitespace();
          if (text[at] === end) { at++; return; }
          if (text[at++] !== ",") fail("invalid_json");
        }
      }
      const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(at));
      if (!match) fail("invalid_json");
      const token = match[0];
      if (/^-?\d/.test(token) && (!/^-?(?:0|[1-9]\d*)$/.test(token) || !Number.isSafeInteger(Number(token)))) fail("invalid_json");
      at += token.length;
    };
    value(0);
    whitespace();
    if (at !== text.length) fail("invalid_json");
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    const reasons = new Set(["input_depth", "input_collection", "duplicate_key", "invalid_json"]);
    return { ok: false, reason: reasons.has(error) ? error : "invalid_json" };
  }
}
