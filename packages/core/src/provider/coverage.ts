import { jsonData, text } from "../schema.js";
import { PROVIDER_CONTRACT, type Tier } from "./contracts.js";

export interface OperationMapEntry {
  readonly id: string;
  readonly apiArea: string;
  readonly tool: string | null;
  readonly scope: string;
  readonly sideEffects: readonly string[];
  readonly tier: Tier;
  readonly authorization: "policy" | "native" | "prohibited";
  readonly entitlement: "entitled" | "not-entitled" | "unknown";
  readonly status: "implemented" | "incomplete" | "unsupported" | "prohibited";
  readonly tests: readonly string[];
  readonly implemented: boolean;
  readonly reviewed: boolean;
  readonly enabled: boolean;
  readonly prerequisite: string | null;
}
export interface OperationMap {
  readonly contract: typeof PROVIDER_CONTRACT;
  readonly provider: string;
  readonly version: string;
  readonly reference: { readonly url: string; readonly version: string; readonly sha256: string };
  /** Full operation IDs extracted from the pinned official API/scope snapshot.
   * Reviewers verify snapshot completeness/entitlement; this is metadata, no secrets.
   */
  readonly inventory: readonly string[];
  readonly operations: readonly OperationMapEntry[];
}
function check(condition: unknown): asserts condition {
  if (!condition) throw new Error("INVALID_OPERATION_MAP");
}
const token = text(256, /^[A-Za-z0-9][A-Za-z0-9:/._-]*$/);
function record(value: unknown, fields: string[]): Record<string, unknown> {
  check(value !== null && typeof value === "object" && !Array.isArray(value));
  check(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  const keys = Reflect.ownKeys(value);
  check(keys.length === fields.length && keys.every(k => typeof k === "string" && fields.includes(k)));
  for (const key of fields) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    check(property?.enumerable && Object.hasOwn(property, "value"));
  }
  return value as Record<string, unknown>;
}
function strings(value: unknown, limit: number): asserts value is string[] {
  check(Array.isArray(value) && value.length <= limit && Reflect.ownKeys(value).length === value.length + 1);
  for (let i = 0; i < value.length; ++i) {
    const property = Object.getOwnPropertyDescriptor(value, String(i));
    check(property?.enumerable && Object.hasOwn(property, "value"));
    token.parse(property.value);
  }
}

/** Validate internal consistency, not the truth/completeness of upstream inventory
 * or review evidence. Unknown entitlement never earns feature completeness.
 */
export function validateOperationMap(value: unknown): { map: OperationMap; complete: boolean; incomplete: string[] } {
  const map = record(value, ["contract", "provider", "version", "reference", "inventory", "operations"]);
  check(map.contract === PROVIDER_CONTRACT);
  token.parse(map.provider);
  token.parse(map.version);
  const reference = record(map.reference, ["url", "version", "sha256"]);
  check(typeof reference.url === "string" && reference.url.length <= 2048 && /^https:\/\/[A-Za-z0-9.-]+\//.test(reference.url));
  token.parse(reference.version);
  check(typeof reference.sha256 === "string" && /^[a-f0-9]{64}$/.test(reference.sha256));
  strings(map.inventory, 10000);
  check(map.inventory.length > 0 && new Set(map.inventory).size === map.inventory.length);
  check(Array.isArray(map.operations) && map.operations.length === map.inventory.length &&
    Reflect.ownKeys(map.operations).length === map.operations.length + 1);
  const ids = new Set<string>();
  const incomplete: string[] = [];
  for (let i = 0; i < map.operations.length; ++i) {
    const descriptor = Object.getOwnPropertyDescriptor(map.operations, String(i));
    check(descriptor?.enumerable && Object.hasOwn(descriptor, "value"));
    const operation = descriptor.value as unknown;
    jsonData(operation);
    const item = record(operation, ["id", "apiArea", "tool", "scope", "sideEffects", "tier", "authorization", "entitlement", "status", "tests", "implemented", "reviewed", "enabled", "prerequisite"]);
    const id = token.parse(item.id);
    check(map.inventory.includes(id) && !ids.has(id));
    ids.add(id);
    token.parse(item.apiArea);
    token.parse(item.scope);
    if (item.tool !== null) token.parse(item.tool);
    strings(item.sideEffects, 32);
    strings(item.tests, 32);
    check(["read", "write", "reserved"].includes(String(item.tier)));
    check(["policy", "native", "prohibited"].includes(String(item.authorization)));
    check(["entitled", "not-entitled", "unknown"].includes(String(item.entitlement)));
    check(["implemented", "incomplete", "unsupported", "prohibited"].includes(String(item.status)));
    for (const field of ["implemented", "reviewed", "enabled"]) check(typeof item[field] === "boolean");
    check(item.implemented === (item.status === "implemented"));
    check(!item.reviewed || item.implemented);
    check(!item.enabled || (item.implemented && item.reviewed && item.entitlement === "entitled"));
    if (item.status === "prohibited") {
      check(item.authorization === "prohibited" && item.tool === null && !item.enabled);
    } else {
      check(item.authorization === (item.tier === "reserved" ? "native" : "policy"));
    }
    if (item.implemented) check(item.tool !== null && item.tests.length > 0);
    check(item.prerequisite === null || (typeof item.prerequisite === "string" && item.prerequisite.length > 0 && item.prerequisite.length <= 4096));
    if (!item.implemented || item.entitlement !== "entitled") check(item.prerequisite !== null);
    if (item.entitlement === "unknown" || item.status === "incomplete" ||
      (item.entitlement === "entitled" && !item.implemented && item.status !== "prohibited")) incomplete.push(id);
  }
  return { map: value as OperationMap, complete: incomplete.length === 0, incomplete };
}
