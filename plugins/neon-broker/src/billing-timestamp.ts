import { text } from "../../../packages/core/src/schema.js";
import { check } from "./projection.js";

export const billingTimestamp = { parse(raw: unknown): number {
  const value = text(29, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/).parse(raw);
  const local = value.replace(/(?:Z|[+-]\d{2}:\d{2})$/, "Z");
  const localEpoch = Date.parse(local);
  const epoch = Date.parse(value);
  check(Number.isFinite(localEpoch) && Number.isFinite(epoch) &&
    new Date(localEpoch).toISOString().slice(0, 19) === local.slice(0, 19));
  return epoch;
} };
