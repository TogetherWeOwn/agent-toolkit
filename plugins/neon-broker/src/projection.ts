export function check(value: unknown): asserts value {
  if (!value) throw Error("OUTPUT_REFUSED");
}
function record(value: unknown): Record<string, unknown> {
  check(value !== null && typeof value === "object" && !Array.isArray(value));
  check(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  return value as Record<string, unknown>;
}
export function field(value: unknown, key: string): unknown {
  const d = Object.getOwnPropertyDescriptor(record(value), key);
  check(d?.enumerable && Object.hasOwn(d, "value"));
  return d.value;
}
export function optional(value: unknown, key: string): unknown {
  return Object.hasOwn(record(value), key) ? field(value, key) : undefined;
}
export function rows(value: unknown, max: number): unknown[] {
  check(Array.isArray(value) && value.length <= max && Reflect.ownKeys(value).length === value.length + 1);
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    check(d?.enumerable && Object.hasOwn(d, "value"));
  }
  return value;
}
export function boolean(value: unknown): boolean {
  check(typeof value === "boolean");
  return value;
}
