export const codes = [
  "schema", "unknown_tool", "identity", "scope", "expired", "cap", "approval",
  "audit", "unavailable", "upstream", "reconcile", "conflict",
] as const;
export type Code = (typeof codes)[number];

export class Refusal extends Error {
  constructor(readonly code: Code) {
    super(code);
  }
}

export function requireThat(value: unknown, code: Code): asserts value {
  if (!value) throw new Refusal(code);
}

export interface Schema<T> {
  parse(value: unknown): T;
}
export type Infer<S> = S extends Schema<infer T> ? T : never;
const forbidden = new Set(["__proto__", "prototype", "constructor"]);

// Accept only bounded JSON data, never accessors, class instances or hidden keys.
// Proxies cannot be made safe in-process: the host must deserialize JSON first.
export function jsonData(value: unknown): void {
  let nodes = 0;
  const seen = new Set<object>();
  function visit(v: unknown, depth: number): void {
    requireThat(++nodes <= 256 && depth <= 8, "schema");
    if (v === null || typeof v === "boolean") return;
    if (typeof v === "string") {
      requireThat(v.length <= 4096 && !/[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(v), "schema");
      return;
    }
    if (typeof v === "number") {
      requireThat(Number.isFinite(v), "schema");
      return;
    }
    requireThat(typeof v === "object" && v !== null && !seen.has(v), "schema");
    seen.add(v);
    requireThat(Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null, "schema");
    const keys = Reflect.ownKeys(v);
    requireThat(keys.length <= 65, "schema");
    for (const key of keys) {
      requireThat(typeof key === "string" && !forbidden.has(key), "schema");
      if (Array.isArray(v) && key === "length") continue;
      const d = Object.getOwnPropertyDescriptor(v, key)!;
      requireThat(d.enumerable && Object.hasOwn(d, "value"), "schema");
      visit(d.value, depth + 1);
    }
    if (Array.isArray(v)) requireThat(keys.length === v.length + 1, "schema");
    seen.delete(v);
  }
  visit(value, 0);
  requireThat(Buffer.byteLength(JSON.stringify(value), "utf8") <= 16384, "schema");
}

export function integer(min: number, max: number): Schema<number> {
  requireThat(Number.isSafeInteger(min) && Number.isSafeInteger(max) && min <= max, "schema");
  return { parse(v) {
    requireThat(typeof v === "number" && Number.isSafeInteger(v) && !Object.is(v, -0) && v >= min && v <= max, "schema");
    return v;
  } };
}

export function text(max: number, pattern: RegExp): Schema<string> {
  requireThat(Number.isSafeInteger(max) && max > 0 && !pattern.global && !pattern.sticky, "schema");
  return { parse(v) {
    requireThat(typeof v === "string" && v.length > 0 && v.length <= max && /^[\x20-\x7e]+$/.test(v) && pattern.test(v), "schema");
    return v;
  } };
}

export function oneOf<const T extends readonly string[]>(values: T): Schema<T[number]> {
  return { parse(v) {
    requireThat(typeof v === "string" && values.includes(v), "schema");
    return v;
  } };
}

export function closed<S extends Record<string, Schema<unknown>>>(shape: S): Schema<{ [K in keyof S]: Infer<S[K]> }> {
  requireThat(Object.keys(shape).every(k => !forbidden.has(k)), "schema");
  return { parse(v) {
    jsonData(v);
    requireThat(v !== null && typeof v === "object" && !Array.isArray(v), "schema");
    const record = v as Record<string, unknown>;
    requireThat(Object.keys(record).length === Object.keys(shape).length && Object.keys(record).every(k => Object.hasOwn(shape, k)), "schema");
    const out: Record<string, unknown> = Object.create(null);
    for (const [k, s] of Object.entries(shape)) {
      requireThat(Object.hasOwn(record, k), "schema");
      out[k] = s.parse(record[k]);
    }
    return Object.freeze(out) as { [K in keyof S]: Infer<S[K]> };
  } };
}

export const name = text(63, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
export const identifier = text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
export const digest = text(64, /^[a-f0-9]{64}$/);

export function prefixedName(value: unknown, prefix: string): string {
  const parsed = name.parse(value);
  requireThat(/^[a-z][a-z0-9]*-$/.test(prefix) && parsed.startsWith(prefix) && parsed.length > prefix.length, "scope");
  return parsed;
}
